content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/01-warp-execution-engines/02-hardware-warp-scheduler-architecture.md
# Hardware Warp Scheduler Architecture and Zero-Overhead Thread Switching

## The 600-Cycle Memory Gap: Why CPU-Style Context Switching Collapses GPU Throughput

In high-performance graphics and scientific computing, Graphics Processing Units (GPUs) process massive data sets stored in off-chip global High-Bandwidth Memory (HBM) or Dynamic Random-Access Memory (DRAM). While a GPU core operates at clock frequencies between $1.5\text{ GHz}$ and $2.5\text{ GHz}$—executing arithmetic instructions in a fraction of a nanosecond—reading a data block from off-chip DRAM requires a long physical journey across memory buses, incurring a memory latency of **400 to 800 clock cycles** ($200 \text{ to } 400\text{ nanoseconds}$).

Consider what happens when a processing core executes a load instruction to fetch a data variable from global memory:

```text
THE 600-CYCLE MEMORY LATENCY GAP

 CPU / GPU Execution Pipeline
       │
       ▼
 [ Executing Load Instruction: READ Global Memory Address A ]
       │
       ▼
       ├─────────────────────────────────────────────────────────────┐
       │ OFF-CHIP DRAM ACCESS IN PROGRESS...                         │
       │ Memory controller activates row, reads column, returns data. │
       │ LATENCY: 600 CLOCK CYCLES (300 NANOSECONDS)!                 │
       └─────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
 [ Execution Engine Stalled Waiting for Data Arriving on Cycle 600! ]
```

Look at the physical execution crisis caused by this 600-cycle memory latency gap:
* If the execution engine has no other work to do while waiting for the global memory request to return, the processing core sits completely frozen for **600 consecutive clock cycles**.
* During those 600 idle cycles, multi-billion-transistor floating-point arithmetic logic units (ALUs) do zero productive work, destroying hardware execution throughput.

In traditional Central Processing Unit (CPU) architecture, when a software thread stalls waiting for a long memory access or I/O event, the operating system kernel performs a **Thread Context Switch**. The CPU saves the current thread's register state (Program Counter, general-purpose registers, stack pointer) to main RAM, selects a different waiting thread, and loads the new thread's register state into the physical CPU registers.

However, performing a CPU-style context switch incurs a heavy hardware and software latency penalty:

$$\text{CPU Context Switch Overhead} = T_{\text{save\_registers}} + T_{\text{OS\_scheduler}} + T_{\text{restore\_registers}} \approx \mathbf{1,000 \text{ to } 5,000 \text{ Clock Cycles}}$$

```text
CPU-STYLE CONTEXT SWITCH OVERHEAD VS MEMORY LATENCY

 Memory Access Latency  : 600 Clock Cycles
 CPU Context Switch Cost : 2,000 Clock Cycles (Saving & Restoring Registers)
                          ───────────────────
 Result                 : Context switching takes 3x LONGER than waiting for memory!
                          (Context switching to hide memory latency makes performance WORSE!)
```

Look at the catastrophic math:
If context switching to a new thread takes 2,000 clock cycles, attempting to switch threads to hide a 600-cycle memory access actually **triples total execution delay**! 

On a GPU running 100,000 parallel threads, CPU-style context switching would collapse execution speed to near zero.

Furthermore, GPUs do not use complex, power-hungry out-of-order execution logic, branch predictors, or giant speculative reorder buffers to hide memory latency, because those circuits consume too much silicon die area.

How can a GPU execution engine switch between stalled threads and ready threads in **a single clock cycle with EXACTLY ZERO CLOCK CYCLES OF LATENCY OVERHEAD**, keeping its parallel arithmetic units $100\%$ busy while memory requests travel across off-chip DRAM buses in the background?

To solve this long latency gap without CPU-style context switch penalties or out-of-order execution logic, GPU microarchitectures implement **Hardware Warp Schedulers** and **Zero-Overhead Thread Switching**.

---

## The Master Juggler and the Multi-Table Kitchen: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of hardware warp scheduling, zero-overhead context switching, and Little's Law latency hiding before inspecting scoreboard logic circuits, warp issue state machines, and occupancy equations, let us consider an everyday analogy: **The Master Chef in a 32-Oven Kitchen**.

Imagine a master chef (**A GPU Streaming Multiprocessor / SM Execution Engine**) cooking 32 identical gourmet dishes (**32 Parallel Hardware Warps**) simultaneously in a commercial kitchen.

```text
THE MASTER CHEF AND 32-OVEN KITCHEN ANALOGY

 Master Chef (GPU Execution Engine / Warp Scheduler)
 ┌─────────────────────────────────────────────────────────────┐
 │ Inspects 32 Oven Tables simultaneously                      │
 │ Dispatches 1 Cooking Action per second without stopping     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 Table 0 (Warp 0)        Table 1 (Warp 1)   ...  Table 31 (Warp 31)
 ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
 │ Dish 0 Ingredients│   │ Dish 1 Ingredients│   │ Dish 31 Ingred.  │
 │ (Private Regs)   │    │ (Private Regs)   │    │ (Private Regs)   │
 └──────────────────┘    └──────────────────┘    └──────────────────┘
  (ALL 32 TABLES HAVE THEIR INGREDIENTS ON THE COUNTER SIMULTANEOUSLY!)
```

Each dish takes multiple preparation steps: chopping vegetables, adding spices, stirring sauce, and baking the dish in a slow thermal oven (**Off-Chip DRAM Memory Access**). Baking a dish in the slow oven takes **10 minutes** ($600\text{ seconds}$).

Let us observe two different management strategies for how the chef manages cooking 32 dishes:

---

### Strategy 1: The CPU-Style Cleanup Strategy (Traditional Context Switching)
The chef works at Table 0 on Dish 0. They chop onions and put the dish into the 10-minute baking oven.

Under the CPU-style cleanup strategy:
1. While Dish 0 bakes in the oven for 10 minutes, the chef decides to switch to Dish 1.
2. Before touching Dish 1, the chef packs up all of Dish 0's spices, bowls, and knives, puts them into boxes, and carries them down to a basement storage locker (**Saving Registers to Memory**). This packing process takes **15 minutes**!
3. The chef then walks down to the basement, retrieves Dish 1's boxes, carries them up to the kitchen, and unpacks Dish 1 onto the table (**Restoring Registers from Memory**). This unpacking process takes **15 minutes**!
4. By the time the chef is ready to chop vegetables for Dish 1, **30 minutes have been wasted packing and unpacking boxes** for a 10-minute baking delay!

The chef spends $75\%$ of their workday carrying boxes up and down stairs rather than cooking food!

---

### Strategy 2: The Open-Table Zero-Overhead Strategy (Hardware Warp Scheduling)
Realizing the waste of packing boxes, the restaurant owner builds a giant kitchen with **32 separate preparation tables** sitting side-by-side on the floor (**The Giant Physical SIMT Register File**).

* Table 0 holds Dish 0's ingredients and bowls.
* Table 1 holds Dish 1's ingredients and bowls.
* Table 31 holds Dish 31's ingredients and bowls.

**ALL 32 DISHES HAVE THEIR INGREDIENTS RESTING ON THEIR OWN TABLES SIMULTANEOUSLY!**

Now, trace how the master chef operates under Strategy 2:

```text
ZERO-OVERHEAD WARP SWITCHING TIMELINE

 12:00 PM : Chef stirs sauce at Table 0 ──► Puts Dish 0 in 10-minute baking oven.
 12:01 PM : Chef takes ONE STEP TO THE RIGHT to Table 1 (Takes ZERO Seconds!)
            Chef chops onions at Table 1 ──► Puts Dish 1 in 10-minute baking oven.
 12:02 PM : Chef takes ONE STEP TO THE RIGHT to Table 2 (Takes ZERO Seconds!)
            Chef adds spices at Table 2...
  :
 12:10 PM : Dish 0 finishes baking in the oven!
            Chef steps back to Table 0 and pulls Dish 0 out of the oven!
```

Look at the extraordinary efficiency of Strategy 2:
1. When Dish 0 is placed in the slow 10-minute oven, the chef does **NOT** pack up Table 0! Table 0 remains untouched with Dish 0's bowls sitting right where they were left.
2. The chef simply takes **one step to the right to Table 1** (**Zero-Overhead Context Switch**). Switching from Table 0 to Table 1 takes **ZERO SECONDS** because Table 1's ingredients are ALREADY resting on Table 1's counter!
3. The chef continues cooking at Table 1, then Table 2, then Table 3...
4. By the time the chef reaches Table 10, **Dish 0 finishes baking in the oven**!
5. The chef steps back to Table 0 and continues cooking without a single second of lost time!

Notice what Strategy 2 achieved:
* **Zero-Overhead Switching**: Switching work from Dish 0 to Dish 1 took **0 seconds** because all dish ingredients were maintained in permanent physical table slots.
* **100% Chef Utilization**: The 10-minute oven baking delay was **completely hidden** behind productive chopping and stirring work at other tables!
* **Continuous Output**: The chef served 32 completed gourmet meals continuously without stopping for a single second!

This 32-table kitchen is the exact physical analogue of **Hardware Warp Scheduling and Zero-Overhead Thread Switching**:
* The master chef is the **GPU Streaming Multiprocessor (SM) Execution Engine**.
* The 32 dishes are **32 Active Hardware Warps (1,024 Parallel Threads)**.
* The 32 physical preparation tables are **The Giant Physical SIMT Register File ($256\text{ KB}$ SRAM)**.
* Dish ingredients resting on tables are **Thread Private Registers**.
* Baking a dish in the slow oven is an **Off-Chip Global DRAM Read Access ($600\text{ cycles}$)**.
* Taking one step to the next table in 0 seconds is **Zero-Overhead Warp Context Switching ($0\text{ cycles}$)**.
* The chef's decision on which table to visit next is **Hardware Warp Scheduling**.

---

## Primitive 1: Hardware Warp Scheduler Architecture

Now that we possess a clear intuitive mental model of the master chef stepping between preparation tables, let us examine the formal, rigorous engineering mechanics of **The Hardware Warp Scheduler**.

Inside a GPU Streaming Multiprocessor (SM), execution is managed by one or more dedicated, hardwired control blocks called **Hardware Warp Schedulers** (e.g., modern GPUs feature 4 independent hardware warp schedulers per SM).

> **A Hardware Warp Scheduler** is a high-speed, clock-synchronous hardware state machine inside a GPU Streaming Multiprocessor that maintains the execution status of all resident warps, evaluates operand readiness and scoreboards on every clock cycle, selects one or two ready warps, and dispatches their next instructions to execution unit pipelines with **zero context-switch clock cycle penalty**.

```text
HARDWARE WARP SCHEDULER MICROARCHITECTURAL LAYOUT

 Resident Warp State Pool (Up to 64 Warps Resident per SM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Warp 0  : [ PC = 0x0040 | Status: STALLED on DRAM Read ]    │
 │ Warp 1  : [ PC = 0x0120 | Status: READY to Execute ]        │
 │ Warp 2  : [ PC = 0x0080 | Status: STALLED on Dependency ]   │
 │ Warp 3  : [ PC = 0x0040 | Status: READY to Execute ]        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Parallel Status & Scoreboard Query
 ┌─────────────────────────────────────────────────────────────┐
 │ HARDWARE WARP SCHEDULER ENGINE                              │
 │  1. Filter out Stalled Warps (Warp 0, Warp 2)               │
 │  2. Identify Ready Warps (Warp 1, Warp 3)                   │
 │  3. Apply Priority Policy (e.g., GTO / Age)                 │
 │  4. Select Winning Warp 1!                                  │
 └─────────────┬───────────────────────────────┬───────────────┘
               │ Instruction Stream            │ Selected Warp ID (1)
               ▼                               ▼
 ┌──────────────────────────┐    ┌─────────────────────────────┐
 │ Instruction Fetch/Decode │    │ SIMT Physical Register File │
 └─────────────┬────────────┘    └─────────────┬───────────────┘
               │                               │
               ▼ Broadcast 1 Instruction       ▼ Read 32 Thread Regs
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Parallel SIMT Execution Lanes (CUDA Cores / ALUs)        │
 └─────────────────────────────────────────────────────────────┘
```

---

### The Three Operational States of a Resident Warp

At any given clock cycle, every warp loaded onto a Streaming Multiprocessor resides in one of three microarchitectural states:

```text
THE THREE RESIDENT WARP OPERATIONAL STATES

 1. ELIGIBLE / READY STATE
    All operand registers are valid. Memory requests complete.
    Instruction decoded and ready for immediate execution!

 2. STALLED STATE
    Waiting for off-chip DRAM memory fill (400-800 cycles),
    OR waiting for internal execution pipeline hazard / register dependency.

 3. UNSCHEDULED / COMPLETED STATE
    Warp has finished executing its kernel code, or is awaiting initial allocation.
```

1. **Eligible / Ready State**:
   * The warp's next instruction has been fetched and decoded.
   * All required input registers have passed dependency checks (Scoreboard clear).
   * The warp is actively competing for dispatch on the current clock cycle.

2. **Stalled State**:
   * The warp cannot execute its next instruction because it is waiting for an event to complete:
     * **Memory Stall**: Waiting for global DRAM memory data to arrive ($400 \text{ to } 800\text{ cycles}$).
     * **Execution Dependency Stall**: Waiting for an earlier multi-cycle instruction (such as a transcendental math operation) to finish writing its result register.
     * **Synchronization Stall**: Waiting at a warp barrier (`__syncthreads()`) for other warps to arrive.

3. **Unscheduled / Completed State**:
   * The warp slot is un-allocated or the warp has finished executing its code.

---

### The 4-Phase Warp Scheduler Dispatch Pipeline

On **every single clock cycle**, the Hardware Warp Scheduler executes a 4-phase selection pipeline:

```text
4-PHASE WARP SCHEDULER SELECTION PIPELINE

 Phase 1: Query     ──► Query Scoreboard and Memory Pending Flags for all N warps.
 Phase 2: Filter    ──► Filter out Stalled Warps (Keep only Eligible Warps).
 Phase 3: Prioritize──► Apply Scheduling Policy (e.g., GTO / Round-Robin).
 Phase 4: Issue     ──► Dispatch 1 or 2 instructions to Execution Lanes!
```

#### Phase 1: Parallel Status Query
The scheduler queries the status flags and scoreboards of all $N$ resident warps ($N = 32 \text{ or } 64\text{ warps}$) in parallel.

#### Phase 2: Eligibility Filtering
The scheduler filters out all stalled warps, generating a **Ready Warp Bitmask Vector**:

$$\mathbf{\text{Ready\_Mask}[N-1:0] = [\text{Ready}_{N-1}, \dots, \text{Ready}_1, \text{Ready}_0]}$$

Where $\text{Ready}_k = 1$ if Warp $k$ is eligible to issue an instruction on the current cycle, and $0$ if Warp $k$ is stalled.

#### Phase 3: Priority Selection
If multiple bits in $\text{Ready\_Mask}$ are $1$, the scheduler applies an instruction scheduling policy (such as **Greedy-Then-Oldest**) to select a single winning warp $W_{\text{winner}}$.

#### Phase 4: Instruction Issue & Execution
The scheduler dispatches $W_{\text{winner}}$'s instruction to the execution pipeline. On the very next clock cycle, the scheduler repeats the selection process!

---

## Primitive 2: Zero-Overhead Thread/Warp Switching Mechanics

Now let us examine the second core primitive: **Zero-Overhead Thread/Warp Switching Mechanics**.

> **Zero-Overhead Thread Switching** is the microarchitectural capability of a GPU to switch execution from a stalled warp to an eligible ready warp in **a single clock cycle ($0\text{ stall cycles}$)** without saving or restoring register contents to memory, enabled by maintaining the private scalar registers of all resident threads permanently inside a giant physical SRAM register file array.

```text
ZERO-OVERHEAD CONTEXT SWITCHING VS CPU CONTEXT SWITCHING

 CPU Context Switch (Save/Restore via Memory - SLOW!):
 Thread 0 Stalls ──► Save Regs to RAM (1,000c) ──► Load Thread 1 Regs (1,000c) ──► Exec T1
                     ◄────────────────── 2,000 Cycles Lost! ─────────────────►

 GPU Zero-Overhead Switch (Instant Pointer Shift - 0 CYCLES!):
 Cycle 0: Issue Instruction for Warp 0 (Warp 0 Stalls on DRAM!)
 Cycle 1: Issue Instruction for Warp 1 (ALL REGS ALREADY IN SRAM!)
          ◄────── 0 Clock Cycles Lost! ──────►
```

---

### Why GPU Context Switching Costs ZERO Clock Cycles

To understand why switching warps on a GPU costs exactly zero clock cycles, let us examine how registers are addressed inside the **SIMT Physical Register File**:

In a CPU:
* The core contains 16 or 32 physical registers ($R_0 \dots R_{31}$).
* When Thread 0 runs, $R_0 \dots R_{31}$ hold Thread 0's data.
* To switch to Thread 1, the CPU must write $R_0 \dots R_{31}$ out to RAM and read Thread 1's values into $R_0 \dots R_{31}$.

In a GPU:
* The Streaming Multiprocessor contains **65,536 physical 32-bit registers** ($256\text{ Kilobytes}$ of SRAM).
* When Thread Block 0 is loaded onto the SM, the physical register file allocator assigns physical registers `0..1023` to Warp 0, physical registers `1024..2047` to Warp 1, physical registers `2048..3071` to Warp 2, and so on.
* **Warp 0's registers and Warp 1's registers reside in physical SRAM simultaneously!**

```text
PHYSICAL REGISTER FILE ADDRESS MAPPING (ZERO SAVING/RESTORING)

 Physical SRAM Register File Array (65,536 Slots)
 ┌─────────────────────────────────────────────────────────────┐
 │ Physical Slots 0000..1023 : Dedicated to Warp 0 Registers  │ (PERMANENTLY LOADED!)
 ├─────────────────────────────────────────────────────────────┤
 │ Physical Slots 1024..2047 : Dedicated to Warp 1 Registers  │ (PERMANENTLY LOADED!)
 ├─────────────────────────────────────────────────────────────┤
 │ Physical Slots 2048..3071 : Dedicated to Warp 2 Registers  │ (PERMANENTLY LOADED!)
 └─────────────────────────────────────────────────────────────┘
```

#### The Hardware Pointer Shift:
When the Warp Scheduler switches from Warp 0 to Warp 1:
1. The hardware does **NOT** copy a single byte of data in memory!
2. The scheduler simply changes a 6-bit **Active Warp ID Register**:

$$\text{Active\_Warp\_ID} \Leftarrow 1$$

3. The register file addressing logic automatically appends $\text{Active\_Warp\_ID}$ as high-order address bits to all register lookups:

$$\text{Physical\_Register\_Address} = (\text{Active\_Warp\_ID} \cdot \text{Regs\_Per\_Warp}) + \text{Instruction\_Reg\_Index}$$

$$\text{For Warp 0, Reg R3}: \quad (0 \cdot 32) + 3 = \mathbf{\text{Physical Slot } 3}$$

$$\text{For Warp 1, Reg R3}: \quad (1 \cdot 32) + 3 = \mathbf{\text{Physical Slot } 35}$$

Changing `Active_Warp_ID` from $0$ to $1$ takes **zero clock cycles**. On Cycle 0, the SM executes an instruction for Warp 0. On Cycle 1, the SM executes an instruction for Warp 1. 

**Context-switch latency is mathematically zero!**

---

## Latency Hiding Mechanics and Little's Law for GPUs

Because context switching takes zero cycles, GPUs do not attempt to make individual memory accesses faster. Instead, GPUs use **Latency Hiding**: they cover the long physical delay of off-chip memory accesses by executing instructions from other resident warps.

### Little's Law for Memory Latency Hiding

To determine how many active warps a GPU hardware scheduler needs to completely hide a given memory latency, computer architects apply **Little's Law** from queuing theory:

$$\text{Concurrency Required} = \text{Arrival Rate} \times \text{Latency}$$

In GPU microarchitecture, Little's Law translates to the **Required Warp Concurrency Formula**:

$$\mathbf{N_{\text{warps\_needed}} = \left\lceil \frac{T_{\text{memory\_latency}}}{T_{\text{warp\_exec\_time}}} \right\rceil}$$

Where:
* $N_{\text{warps\_needed}}$ is the minimum number of active eligible warps required to hide memory latency completely.
* $T_{\text{memory\_latency}}$ is the global DRAM memory access latency in clock cycles (e.g., $600\text{ clock cycles}$).
* $T_{\text{warp\_exec\_time}}$ is the execution time of one instruction from a single warp in clock cycles (e.g., $4\text{ clock cycles}$ for a 32-lane warp executing on 8 physical ALUs).

```text
LITTLE'S LAW LATENCY HIDING GRAPHIC

 Memory Latency T_memory = 600 Cycles
 ┌─────────────────────────────────────────────────────────────┐
 │ Warp 0 Issues Global Memory Read (Stalls for 600 Cycles!)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
   Warp Scheduler switches through 20 Other Warps in Background!
   (20 Warps x 30 Cycles/Warp = 600 Cycles of Useful Work!)
                                │
                                ▼
 Warp 0 Memory Data Arrives at Cycle 600!
 Warp 0 Resumes Execution IMMEDIATELY with ZERO STALL CYCLES!
```

#### Example Calculation:
Suppose a GPU program executes an independent instruction every 15 clock cycles per warp ($T_{\text{warp\_exec\_time}} = 15\text{ cycles}$), and global DRAM memory latency is $T_{\text{memory\_latency}} = 600\text{ clock cycles}$:

$$N_{\text{warps\_needed}} = \left\lceil \frac{600\text{ cycles}}{15\text{ cycles/warp}} \right\rceil = \mathbf{40 \text{ Active Warps}}$$

If the memory scheduler has **40 active warps** loaded onto the SM, the GPU will execute 15 cycles of instruction work for each of the 39 other warps while Warp 0 is waiting for DRAM ($39 \times 15 = 585\text{ cycles}$).

By the time the scheduler returns to Warp 0 at Cycle 600, **Warp 0's DRAM data has arrived**! 

Warp 0 resumes execution with **zero pipeline stall cycles**! The 600-cycle memory access delay was $100\%$ hidden from the CPU.

---

## Hardware Warp Scheduling Policies: GTO vs. Round-Robin vs. LRR

When multiple resident warps are eligible to issue instructions on the same clock cycle, which warp should the Hardware Warp Scheduler select?

GPU architects deploy three primary hardware scheduling policies:

```text
WARP SCHEDULING POLICY COMPARISON

 1. Round-Robin (RR)
 ─────────► Rotates through warps strictly in numerical order (0 -> 1 -> 2 -> 3 -> 0).
            Disperses execution evenly, but delays individual warp completion!

 2. Greedy-Then-Oldest (GTO - Modern Industry Standard)
 ─────────► Issues instructions from ONE single warp greedily until it stalls!
            When it stalls, switches to the OLDEST eligible warp.
            Maximizes cache locality & finishes warps as fast as possible!

 3. Loose Round-Robin / Random (LRR)
 ─────────► Randomizes selection among eligible warps to prevent bank conflicts.
```

---

### 1. Greedy-Then-Oldest (GTO) Policy — The Industry Standard

**Greedy-Then-Oldest (GTO)** is the dominant warp scheduling policy used in modern NVIDIA and AMD GPUs.

#### How GTO Operates:
1. **Greedy Phase**: The scheduler selects one eligible warp (e.g., Warp 0) and **continues issuing instructions from Warp 0 repeatedly cycle after cycle** for as long as Warp 0 remains eligible!
2. **Oldest Phase**: The moment Warp 0 stalls (e.g., encountering a memory read or register dependency), the scheduler switches to the **oldest eligible warp** in the resident pool (e.g., Warp 1) and executes Warp 1 greedily until it stalls.

```text
GREEDY-THEN-OLDEST (GTO) SCHEDULING TIMELINE

 Cycle 1..10  : Issue Insts 1..10 from Warp 0 GREEDILY ──► (Warp 0 Stalls on DRAM!)
 Cycle 11..20 : Switch to Oldest (Warp 1) GREEDILY     ──► (Warp 1 Stalls on DRAM!)
 Cycle 21..30 : Switch to Oldest (Warp 2) GREEDILY     ──► (Warp 0 Data Arrives!)
 Cycle 31..40 : Return to Warp 0 GREEDILY             ──► (Warp 0 FINISHES CODE!)
```

#### Why GTO Superior to Round-Robin:
* **Maximizes L1 Cache Locality**: Running one warp continuously for 10 instructions keeps its working data hot inside the local L1 Data Cache. Round-robin switching after every single instruction flushes the L1 cache continuously (**Cache Pollution**).
* **Faster Warp Completion**: GTO finishes individual warps as fast as possible, releasing their allocated registers back to the free pool so new thread blocks can be loaded onto the SM!

---

## Scoreboard Dependency Tracking Mechanics

How does the Hardware Warp Scheduler know whether a warp is **Eligible** or **Stalled** on a register dependency?

To track register availability without complex out-of-order execution logic, GPUs use a hardware lookup structure called **The Instruction Scoreboard**.

```text
HARDWARE INSTRUCTION SCOREBOARD MAP

 Scoreboard Array (1 Bit per Register Slot)
 ┌─────────────────────────────────────────────────────────────┐
 │ Reg R0: [ CLEAR (0) ]  ──► Ready to Read                   │
 │ Reg R1: [ CLEAR (0) ]  ──► Ready to Read                   │
 │ Reg R2: [ BUSY  (1) ]  ──► PENDING! (Multi-cycle Load in progress!)│
 │ Reg R3: [ CLEAR (0) ]  ──► Ready to Read                   │
 └─────────────────────────────────────────────────────────────┘
```

### How the Scoreboard Operates:
1. **Instruction Inspection**: Before issuing `ADD R4, R2, R1` for Warp 0, the scheduler checks the Scoreboard bits for input registers $R2$ and $R1$.
2. **Dependency Check**:
   * If $R2 == 0$ and $R1 == 0$ (Clear): Operands are ready! The warp is **Eligible**.
   * If $R2 == 1$ (Busy): An earlier instruction (such as a memory load) is still writing to $R2$. The warp is marked **Stalled**!
3. **Scoreboard Set**: When an instruction that writes to $R4$ is issued, the hardware sets $R4 \Leftarrow 1$ (Busy).
4. **Scoreboard Clear**: When the long-latency operation finishes and writes its result to $R4$, the hardware sets $R4 \Leftarrow 0$ (Clear), instantly marking the warp as **Eligible** again!

---

## Solved Industrial Engineering Exercise: Quantitative Warp Scheduling, Little's Law Latency Hiding, and Throughput Analysis

To consolidate your complete mastery of hardware warp schedulers, zero-overhead context switching, Little's Law latency hiding calculations, and scoreboard dependency tracking, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing a $2.0\text{ GHz}$ GPU Streaming Multiprocessor (SM) ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The SM features:
* Hardware Warp Size: $W_{\text{size}} = 32\text{ threads per warp}$.
* Physical SIMT Register File: $65,536\text{ 32-bit registers}$ ($256\text{ KB}$).
* Maximum Resident Warps per SM: $W_{\text{max}} = 64\text{ warps}$ ($2,048\text{ threads}$).
* Global DRAM Memory Access Latency: $T_{\text{DRAM}} = 600\text{ clock cycles}$ ($300.0\text{ ns}$).
* Local L1 Cache Access Latency: $T_{\text{L1}} = 1\text{ clock cycle}$ ($0.500\text{ ns}$).

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR SPECIFICATIONS

 Clock Frequency : 2.0 GHz (T_clk = 500 ps)
 DRAM Latency    : T_DRAM = 600 Clock Cycles (300 ns)
 Register File   : 65,536 Registers (256 KB)
 Max Warps / SM  : 64 Warps (2,048 Threads)
```

#### The Workload Kernel:
An image processing kernel is compiled for two different hardware configurations:
* **Kernel Execution Profile**: Each warp executes a instruction stream where every 10th instruction is a global DRAM memory load (`READ Global`).
* Between global memory reads, a warp executes **9 independent arithmetic instructions** ($9\text{ clock cycles}$ of local execution work).
* The compiler allocates **$R_{\text{thread}} = 32\text{ registers per thread}$** for Kernel A, and **$R_{\text{thread}} = 64\text{ registers per thread}$** for Kernel B.

#### Your Objective

1. Calculate the maximum number of active resident warps ($N_{\text{warps}}$) that can be loaded onto the SM for **Kernel A** ($32\text{ regs/thread}$) vs **Kernel B** ($64\text{ regs/thread}$).
2. Apply **Little's Law** to calculate the minimum number of active warps ($N_{\text{required}}$) needed to hide the 600-cycle DRAM latency completely.
3. For **Kernel A** ($32\text{ regs/thread}$):
   * Calculate total execution cycles provided by all active warps while Warp 0 is waiting for DRAM.
   * Determine whether DRAM latency is $100\%$ hidden, and calculate the resulting SM instruction execution throughput in Giga-Instructions Per Second (GIPS).
4. For **Kernel B** ($64\text{ regs/thread}$):
   * Calculate total execution cycles provided by active warps during DRAM wait.
   * Calculate the remaining **Un-Hidden Memory Stall Cycles** per memory access.
   * Calculate the effective CPI and reduced throughput in GIPS.
5. Calculate the **Performance Speedup Factor** of Kernel A over Kernel B.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Maximum Active Resident Warps for Kernel A and Kernel B

We calculate resident warp capacity using physical register file bounds:

$$\text{Regs per Warp} = W_{\text{size}} \times R_{\text{thread}} = 32 \times R_{\text{thread}}$$

##### 1. Kernel A ($R_{\text{thread}} = 32\text{ registers}$):
$$\text{Regs per Warp}_A = 32 \times 32 = 1,024 \text{ registers/warp}$$

$$N_{\text{warps,A}} = \min\left( 64, \quad \left\lfloor \frac{65,536}{1,024} \right\rfloor \right) = \min(64, 64) = \mathbf{64 \text{ Active Warps}} \quad (2,048\text{ threads})$$

##### 2. Kernel B ($R_{\text{thread}} = 64\text{ registers}$):
$$\text{Regs per Warp}_B = 32 \times 64 = 2,048 \text{ registers/warp}$$

$$N_{\text{warps,B}} = \min\left( 64, \quad \left\lfloor \frac{65,536}{2,048} \right\rfloor \right) = \min(64, 32) = \mathbf{32 \text{ Active Warps}} \quad (1,024\text{ threads})$$

```text
ACTIVE RESIDENT WARP CAPACITY

 Kernel Configuration │ Regs / Thread │ Regs / Warp │ Active Warps / SM │ Active Threads
──────────────────────┼───────────────┼─────────────┼───────────────────┼────────────────
 Kernel A (Optimized) │ 32 Registers  │ 1,024 Regs  │ 64 Warps          │ 2,048 Threads
 Kernel B (Un-Opt)    │ 64 Registers  │ 2,048 Regs  │ 32 Warps          │ 1,024 Threads
```

---

#### Step 2: Apply Little's Law to Calculate Required Warps ($N_{\text{required}}$)

Each warp executes 9 arithmetic instructions between global memory reads ($T_{\text{exec}} = 9\text{ clock cycles}$).

Global memory latency $T_{\text{DRAM}} = 600\text{ clock cycles}$.

Using Little's Law formula for GPU latency hiding:

$$N_{\text{required}} = \left\lceil \frac{T_{\text{DRAM}}}{T_{\text{exec}}} \right\rceil = \left\lceil \frac{600\text{ cycles}}{9\text{ cycles/warp}} \right\rceil = \lceil 66.67 \rceil = \mathbf{67 \text{ Active Warps}}$$

##### Theoretical Requirement Result:
To hide $600\text{ cycles}$ of DRAM latency $100\%$ completely when each warp executes 9 cycles of work, the hardware requires **67 active warps**.

---

#### Step 3: Performance Analysis for Kernel A (64 Active Warps)

Kernel A loads $64\text{ active warps}$ onto the SM ($N_{\text{warps,A}} = 64$).

When Warp 0 issues a global DRAM read and stalls for 600 cycles:
* The scheduler switches through the other 63 resident warps in the background.
* Total execution work performed by 63 background warps:

$$\text{Work}_{\text{background\_A}} = 63 \text{ warps} \times 9 \text{ cycles/warp} = \mathbf{567 \text{ clock cycles}}$$

##### 1. Un-Hidden Memory Stall Cycles for Kernel A:
$$\text{Stall}_{\text{KernelA}} = T_{\text{DRAM}} - \text{Work}_{\text{background\_A}} = 600 - 567 = \mathbf{33 \text{ clock cycles}}$$

Out of $600\text{ DRAM latency cycles}$, $567\text{ cycles}$ ($94.5\%$) were successfully hidden! The core stalls for only **33 clock cycles**.

##### 2. Calculate Effective CPI for Kernel A:
Each 10-instruction block contains 9 arithmetic instructions ($9\text{ cycles}$) + 1 DRAM read ($1\text{ cycle}$ execution + $33\text{ cycles stall} = 34\text{ cycles}$):

$$\text{Total Cycles per Block}_A = 9 + 34 = 43 \text{ cycles for 10 instructions}$$

$$\text{CPI}_A = \frac{43\text{ cycles}}{10\text{ instructions}} = \mathbf{4.30 \text{ cycles/instruction}}$$

##### 3. Calculate SM Execution Throughput for Kernel A (in GIPS):
The SM executes 4 warps concurrently on its 4 sub-core processing blocks ($4\text{ instructions/cycle}$ peak):

$$\text{Throughput}_A = \frac{f_{\text{clk\_GHz}} \times \text{Issue\_Width}}{\text{CPI}_A} = \frac{2.0\text{ GHz} \times 4\text{ lanes}}{4.30} \approx \mathbf{1.860 \text{ GIPS}} \quad (1,860\text{ MIPS})$$

---

#### Step 4: Performance Analysis for Kernel B (32 Active Warps)

Kernel B loads only $32\text{ active warps}$ onto the SM ($N_{\text{warps,B}} = 32$) due to high register usage.

When Warp 0 issues a global DRAM read and stalls for 600 cycles:
* Total execution work performed by the 31 other background warps:

$$\text{Work}_{\text{background\_B}} = 31 \text{ warps} \times 9 \text{ cycles/warp} = \mathbf{279 \text{ clock cycles}}$$

##### 1. Un-Hidden Memory Stall Cycles for Kernel B:
$$\text{Stall}_{\text{KernelB}} = T_{\text{DRAM}} - \text{Work}_{\text{background\_B}} = 600 - 279 = \mathbf{321 \text{ clock cycles!}}$$

Because Kernel B had only 32 warps, **$321\text{ clock cycles}$ of DRAM latency were NOT hidden**! The core sits idle for 321 cycles per memory read!

##### 2. Calculate Effective CPI for Kernel B:
Total cycles per 10-instruction block $= 9 + 1 + 321 = \mathbf{331 \text{ cycles for 10 instructions}}$:

$$\text{CPI}_B = \frac{331\text{ cycles}}{10\text{ instructions}} = \mathbf{33.10 \text{ cycles/instruction}}$$

##### 3. Calculate SM Execution Throughput for Kernel B (in GIPS):

$$\text{Throughput}_B = \frac{2.0\text{ GHz} \times 4\text{ lanes}}{33.10} \approx \mathbf{0.2417 \text{ GIPS}} \quad (241.7\text{ MIPS})$$

```text
KERNEL PERFORMANCE COMPARISON SUMMARY

 Architectural Metric    │ Kernel A (32 Regs/Thread) │ Kernel B (64 Regs/Thread) │ Impact
─────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────
 Active Resident Warps   │ 64 Warps (100% Occupancy) │ 32 Warps (50% Occupancy)  │ 50% Fewer Warps
 Hidden DRAM Latency     │ 567 Cycles (94.5% Hidden) │ 279 Cycles (46.5% Hidden) │ 288 Cycles Lost!
 Un-Hidden Memory Stall  │ 33 Clock Cycles           │ 321 Clock Cycles          │ 9.7x More Stalls!
 Effective CPI           │ 4.30 Cycles / Instruction │ 33.10 Cycles / Instruction│ 7.7x Higher CPI
 Execution Throughput    │ 1,860 MIPS (1.860 GIPS)   │ 241.7 MIPS (0.242 GIPS)   │ 7.7x FASTER!
```

---

#### Step 5: Calculate Performance Speedup Factor

$$\text{Speedup} = \frac{\text{Throughput}_A}{\text{Throughput}_B} = \frac{\text{CPI}_B}{\text{CPI}_A} = \frac{33.10\text{ cycles}}{4.30\text{ cycles}} \approx \mathbf{7.698\times \text{ Performance Advantage!}}$$

##### Engineering Conclusion:
By reducing register usage from 64 to 32 registers per thread, Kernel A doubled active resident warps from 32 to 64, increasing DRAM latency hiding from $46.5\%$ to $94.5\%$ and delivering a **$7.70\times$ execution speedup ($670\%$ throughput gain)** on the exact same GPU hardware!

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results against GPU hardware principles:

1. **Little's Law Verification**:
   * Latency $T_{\text{DRAM}} = 600\text{ cycles}$. Work per warp $T_{\text{exec}} = 9\text{ cycles}$.
   * Required warps for $100\%$ hiding = $600 / 9 = 66.67\text{ warps}$.
   * Kernel A ($64\text{ warps}$) achieved $\frac{63 \times 9}{600} = 94.5\%$ latency hiding.
   * Kernel B ($32\text{ warps}$) achieved $\frac{31 \times 9}{600} = 46.5\%$ latency hiding.
   * Little's Law ratio $567 / 279 = 2.032\times$ matches background work math with $100\%$ precision!
2. **Zero-Overhead Context Switch Check**:
   * Switching between 64 warps incurred **0 clock cycles of context-switch penalty**, confirming that all 65,536 physical registers remained resident in SRAM without memory saves/restores.
3. **Throughput Scaling Check**:
   * Un-hidden stall cycles increased from 33 to 321 ($9.7\times$ increase).
   * CPI degraded from $4.30$ to $33.10$ ($7.7\times$ degradation). Throughput speedup ratio $7.70\times$ is mathematically verified.

All Little's Law concurrency equations, resident warp occupancy limits, scoreboard dependency tracking states, and GPU instruction throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Hardware Warp Scheduler**: The clock-synchronous hardware state machine inside a GPU Streaming Multiprocessor that queries resident warp eligibility, evaluates scoreboard register dependencies, and dispatches ready instructions to SIMT execution lanes on every clock cycle.
* **Zero-Overhead Thread Switching**: The hardware capability where switching execution between stalled and ready warps incurs exactly 0 clock cycles of context-switch penalty, enabled by storing the private registers of all active threads permanently inside a giant physical SRAM register file array.
