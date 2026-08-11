content/00-digital-hardware-foundations/04-memory-subsystems/lessons/01-sram-cache-architectures/04-write-policies-integration/01-write-through-policy-mechanics.md
# Write-Through Policy Mechanics and Bus Store Traffic

## The Asymmetry of Memory Writes and the Bus Saturation Problem

In high-performance digital computer systems, memory operations executed by a central processing unit (CPU) fall into two fundamental operational categories: **Read operations (Loads)** and **Write operations (Stores)**. 

Read operations are non-destructive queries: the processor core requests a specific memory address, the cache controller checks whether a copy of that memory line resides inside its local high-speed Static RAM (SRAM) cache array, and if a cache hit occurs, the data is delivered to a processor execution register in a fraction of a nanosecond. The underlying memory contents remain completely unchanged.

However, when a processor executes a store instruction (such as `STORE R1, [R2]` or `SW R3, 0(R4)`), it performs a **destructive state modification**. It changes the binary value stored at a specific memory location.

This state modification introduces a fundamental architectural dilemma for cache memory controllers:

> **The Memory State Modification Dilemma**: When the processor modifies a data word in its local Level 1 (L1) SRAM cache, when and how should that modification be communicated to lower levels of the memory hierarchy (such as the L2 cache, L3 cache, or main DRAM memory)?

If the local L1 cache line is updated with new data, but lower-level memory continues to hold the old data, the two levels of the memory hierarchy become **inconsistent**. 

If another hardware component (such as a second processor core, a Direct Memory Access / DMA graphics controller, or a network interface) reads that address from main DRAM memory, it will receive stale, outdated data, leading to catastrophic system corruption!

The simplest, most straightforward strategy to prevent memory inconsistency is the **Write-Through Policy**.

Under a Write-Through Policy, whenever the processor core executes a store instruction, the cache controller updates the local L1 cache line (if present) and **simultaneously dispatches the write operation across the memory interconnect bus to update lower-level memory immediately**.

```text
WRITE-THROUGH DIRECT BUS DISPATCH

 CPU Execution Core (Store Instruction SW)
             │
             ▼
 ┌──────────────────────┐
 │ L1 Data Cache (SRAM) │ ──► Updates local SRAM line (1 Cycle)
 └───────────┬──────────┘
             │
             ▼
 ┌──────────────────────┐
 │ Memory Interconnect  │ ──► Dispatches write payload across bus
 └───────────┬──────────┘     IMMEDIATELY on EVERY store instruction!
             │
             ▼
 ┌──────────────────────┐
 │ Main Memory (DRAM)   │ ──► Updates main DRAM memory synchronously
 └──────────────────────┘
```

At first glance, the Write-Through Policy appears to be an ideal engineering solution. It guarantees that lower-level memory is **always 100% up to date**, eliminating memory inconsistency. Because main memory always holds current data, the L1 cache line entries never need to track whether they have been modified, completely eliminating the need for complex "dirty bit" tracking registers or complicated write-back eviction state machines.

However, this simplicity comes at a devastating physical cost: **Bus Store Traffic Saturation**.

In real-world computer programs, store instructions constitute a significant fraction of all executed instructions—typically **$15\%$ to $30\%$ of all instructions** in standard workloads (e.g., updating loop counters, writing array outputs, pushing function arguments onto the call stack).

If a processor core executes one billion instructions per second ($1.0\text{ GHz}$), and $20\%$ of those instructions are stores, a Write-Through cache forces the system to initiate **200,000,000 separate off-chip write transactions every single second**!

```text
THE WRITE-THROUGH BUS SATURATION BOTTLENECK

 Executing 1,000,000,000 Instructions / Second
             │
             ├─► 800,000,000 Reads (95%+ L1 Hit Rate -> Absorbed by L1 Cache!)
             │
             └─► 200,000,000 Stores (Write-Through Policy)
                       │
                       ▼
         200,000,000 MANDATORY BUS TRANSACTIONS / SECOND!
         (Clogs memory bus, causing 100% CPU pipeline stalls!)
```

Look at the asymmetry between reads and writes under Write-Through:
* **For Read Operations**: High temporal and spatial locality allows an L1 cache to absorb $95\%$ to $99\%$ of all read requests on-chip. Only $1\%$ to $5\%$ of reads ever touch the off-chip memory bus.
* **For Write Operations under Write-Through**: **$100\%$ of all store operations MUST touch the memory bus**, regardless of how many times the exact same memory location is written in a row!

If a program executes a loop that modifies a local variable inside a register 1,000,000 times in succession, a Write-Through cache transmits 1,000,000 separate write packets across the bus to main memory, even though the variable's intermediate values are completely irrelevant to the rest of the system!

The off-chip memory interconnect becomes completely saturated with store traffic. When the CPU inevitably suffers an L1 read miss and needs to fetch a new instruction or data line from memory, the read fetch is blocked behind a long line of queued write-through store requests, causing the CPU pipeline to freeze for hundreds of clock cycles.

To understand why Write-Through caches behave this way, how they impact bus traffic bandwidth mathematically, and why they are still employed in specific high-reliability embedded systems, we must analyze the mechanics of write management, interconnect bus contention, and store buffer architectures.

---

## The Corporate Executive and the Central Archive: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of the Write-Through policy and bus store traffic before inspecting bitwise hardware schematics and timing equations, let us consider an everyday analogy: **The Corporate Executive and the Central Filing Archive**.

Imagine an executive (**The CPU Core**) working inside a high-rise office building. The executive makes rapid business decisions and records financial numbers every few seconds.

```text
THE EXECUTIVE OFFICE AND CENTRAL ARCHIVE METAPHOR

 Executive's Desk (CPU Core)
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ Office Whiteboard         │          │ Central Filing Archive    │
 │ Holds Local Working Data  │          │ Holds Permanent Ledgers   │
 │ Access Latency: 1 Second  │          │ Access Latency: 5 Minutes │
 └───────────────────────────┘          └───────────────────────────┘
   (Ultra-Fast L1 SRAM Cache)             (Slow Main System DRAM)
```

Inside the office, the executive maintains a small personal **Whiteboard** mounted on the wall (**The L1 Cache**). Updating a number on the whiteboard takes the executive only **1 second** ($1\text{ clock cycle}$).

Down in the basement of the building is the company's **Central Filing Archive** (**Main System DRAM Memory**). The central archive contains the official permanent record books for the entire corporation. Sending a courier down to the basement archive to update a record book takes **5 minutes** ($300\text{ seconds}$).

Let us observe how two different office policies handle writing new financial numbers:

---

### Policy 1: The Instant Archive Synchronization Policy (Write-Through Policy)

The company board enforces a strict operational rule: *"Whenever the executive writes or modifies a number on their office whiteboard, the central archive in the basement MUST be updated at the exact same instant."*

Look at what happens during the executive's workday under this policy:

1. **8:00 AM**: The executive writes $100$ on their office whiteboard.
   * To obey the rule, the executive cannot move to the next task yet! They must call a courier, hand them a slip of paper with $100$, and wait for the courier to walk down to the basement archive, write $100$ into the permanent ledger, and walk back up to the office.
   * The executive sits idle at their desk for **5 minutes** waiting for the courier to return (**Pipeline Write Stall**).
2. **8:05 AM**: The courier returns. The executive updates the whiteboard number to $105$.
   * The executive calls the courier again, hands them $105$, and sits idle for **another 5 minutes**!
3. **8:10 AM**: The courier returns. The executive updates the whiteboard number to $110$...

```text
INSTANT ARCHIVE SYNCHRONIZATION TIMELINE (WRITE-THROUGH)

 08:00 AM: Write 100 on Whiteboard ──► [ 5-Min Courier Trip ] ──► 08:05 AM: Courier Returns
 08:05 AM: Write 105 on Whiteboard ──► [ 5-Min Courier Trip ] ──► 08:10 AM: Courier Returns
 08:10 AM: Write 110 on Whiteboard ──► [ 5-Min Courier Trip ] ──► 08:15 AM: Courier Returns
 (Spent 15 minutes waiting on couriers to record 3 minor whiteboard edits!)
```

Look at the catastrophic inefficiency of this office policy!

* The executive spent **15 minutes sitting idle** doing nothing, just waiting for the courier to make three separate trips to the basement for three minor whiteboard edits.
* The hallway and elevator between the office and the basement were completely clogged with courier trips (**Bus Store Traffic Saturation**).
* **The Single Advantage**: If a sudden power outage occurs at 8:16 AM, the central archive in the basement is $100\%$ up to date! Not a single number was lost.

---

### Policy 2: The Outgoing Mail Tray Optimization (Write Buffer)

Realizing that the executive is spending $98\%$ of their day waiting for couriers, the building manager installs a small **Outgoing Mail Tray** (**A Write Buffer Queue**) on the corner of the executive's desk.

Now, look at how the workflow improves:

```text
OUTGOING MAIL TRAY OPTIMIZATION (WRITE BUFFER)

 08:00 AM: Write 100 on Whiteboard ──► Drop note in Outgoing Tray ──► Resume Work IMMEDIATELY!
                                       (Courier fetches note in background)
```

1. When the executive writes $100$ on their whiteboard, they drop a note with the number into the Outgoing Mail Tray on their desk (taking 1 second) and **resume working immediately** without waiting for the courier!
2. In the background, a courier picks up notes from the Outgoing Mail Tray and delivers them to the basement archive while the executive continues working.

What happens if the executive writes numbers faster than the courier can walk?
If the executive generates 10 notes per minute, while the courier can only make 1 trip every 5 minutes, the Outgoing Mail Tray quickly becomes **completely full**! 

Once the tray is full, the executive is forced to stop working and wait for the courier anyway (**Write Buffer Full Stall**).

This office scenario is the exact physical analogue of a **Write-Through Cache with a Write Buffer**:
* The executive is the **CPU Execution Core**.
* The office whiteboard is the **L1 SRAM Data Cache**.
* The central basement archive is **Main DRAM System Memory**.
* The courier's trip down the hallway is the **Memory Interconnect Bus Transaction**.
* The Outgoing Mail Tray is the **Hardware Write Buffer Queue**.
* The hallway congestion is **Bus Store Traffic**.

---

## Primitive 1: The Write-Through Cache Policy

Now that we possess a clear, intuitive mental model of instant archive synchronization, let us examine the formal engineering mechanics of the **Write-Through Cache Policy**.

> **The Write-Through Policy** is a cache write management strategy where every store operation executed by the CPU updates the targeted data word in the local L1 cache array (if present) and **simultaneously dispatches a write command across the memory bus to update lower-level memory (L2/L3 cache or main DRAM) synchronously**.

---

### Detailed Execution Flow: Write Hits vs. Write Misses

To understand how a Write-Through cache operates at the hardware level, we must trace how it processes two distinct operational events: **Write Hits** and **Write Misses**.

```text
WRITE-THROUGH OPERATION DECISION TREE

                  CPU Issues Store Instruction
                               │
                      Is Target Line in L1?
                               │
                     ┌─────────┴─────────┐
                     │ YES               │ NO
                     ▼                   ▼
                WRITE HIT           WRITE MISS
                     │                   │
         ┌───────────┴───────────┐       └───────────┬───────────┐
         ▼                       ▼                   ▼           ▼
   Update Local L1         Dispatch Write      Write-Allocate   Write-No-Allocate
   SRAM Cache Line         to Memory Bus       (Fetch Line)    (Bypass L1 Cache)
```

---

#### 1. Write Hit Mechanics (Data Present in L1 Cache)

A **Write Hit** occurs when the memory address targeted by a store instruction matches a valid tag entry in the L1 Data Cache ($\text{Valid} == 1 \quad \mathbf{\text{AND}} \quad \text{Tag\_Match} == 1$).

When a Write Hit occurs in a Write-Through cache:
1. **Local SRAM Update**: The cache controller writes the new byte, word, or double-word payload into the SRAM data array line at the specified offset.
2. **Bus Command Dispatch**: The cache controller dispatches a write command containing the target physical address and the new data payload across the memory interconnect bus to update the L2/L3 cache and main DRAM.
3. **Dirty Bit Invariant**: Because lower-level memory is updated simultaneously with the L1 cache, **the local L1 cache line remains in a clean state**. 

> **The Write-Through Invariant**: A Write-Through cache NEVER requires dirty bits ($D = 0$ always)! The data stored in a Write-Through L1 cache is **always $100\%$ identical** to the data stored in lower-level memory at that exact same address.

---

#### 2. Write Miss Mechanics (Data Not Present in L1 Cache)

A **Write Miss** occurs when the memory address targeted by a store instruction is NOT present in the L1 Data Cache ($\text{Valid} == 0 \quad \mathbf{\text{OR}} \quad \text{Tag\_Mismatch} == 1$).

When a Write Miss occurs, a Write-Through cache can follow one of two architectural strategies:

##### Option A: Write-Allocate (Fetch-on-Write)
1. The cache controller fetches the missing 64-byte cache line from lower-level main memory into the L1 Cache.
2. The local L1 cache line is updated with the new store payload.
3. The write payload is simultaneously written through to lower-level memory over the bus.

##### Option B: Write-No-Allocate (Write-Around) — The Industry Standard for Write-Through
1. The cache controller **bypasses the L1 Cache completely**! It does NOT load the missing cache line into L1 SRAM.
2. The write payload is sent directly across the memory bus to update lower-level memory.
3. The L1 Cache remains completely untouched.

```text
WRITE-NO-ALLOCATE (WRITE-AROUND) FLOW

 Store Miss at Address 0x2000
             │
             ▼
 [ L1 Data Cache ] ──► BYPASSED COMPLETELY! (No L1 line allocated)
             │
             ▼
 [ Memory Bus Interconnect ] ──► Sends write payload directly to L2/DRAM
```

Why is **Write-No-Allocate** the universal industry standard pairing for Write-Through caches?
Because if a program is writing a large block of data that it will not read again immediately (for example, clearing a memory buffer to zero or copying a file), allocating L1 cache lines for those writes would evict valuable, frequently read data from the L1 cache (**Cache Pollution**). 

By writing around the L1 cache on a miss, the cache protects its existing, highly active working set!

---

## Primitive 2: Bus Store Traffic and Interconnect Saturation

Now let us analyze the central physical limitation of the Write-Through policy: **Bus Store Traffic Saturation**.

### Mathematical Derivation of Write-Through Bus Bandwidth

To quantify the interconnect overhead imposed by a Write-Through cache, let us build a mathematical model of memory bus bandwidth consumption.

Let $f_{\text{clk}}$ be the CPU clock frequency in Hertz ($\text{Hz}$).

Let $\text{IPC}$ be the instruction execution rate in instructions per cycle.

Let $f_{\text{store}}$ be the fraction of executed instructions that are store operations ($0.0 \le f_{\text{store}} \le 1.0$).

Let $W_{\text{store}}$ be the average payload size of a store operation in bytes (e.g., $4\text{ bytes}$ for a 32-bit word, or $8\text{ bytes}$ for a 64-bit word).

The total **Store Instruction Execution Rate** $N_{\text{stores}}$ in store operations per second is:

$$N_{\text{stores}} = f_{\text{clk}} \times \text{IPC} \times f_{\text{store}}$$

Where:
* $N_{\text{stores}}$ is the number of store instructions executed per second.
* $f_{\text{clk}}$ is the CPU operating clock frequency in Hz.
* $\text{IPC}$ is the instructions executed per clock cycle.
* $f_{\text{store}}$ is the fraction of executed instructions that are store operations.

Under a Write-Through Policy, **every single store instruction generates a mandatory memory bus transaction**.

The minimum required **Bus Store Bandwidth** $\text{BW}_{\text{store}}$ in Bytes per second is:

$$\mathbf{\text{BW}_{\text{store}} = f_{\text{clk}} \times \text{IPC} \times f_{\text{store}} \times W_{\text{store}}}$$

Where:
* $\text{BW}_{\text{store}}$ is the bandwidth consumed on the memory interconnect by write-through traffic in Bytes per second.
* $f_{\text{clk}}$ is the CPU operating clock frequency in Hz.
* $\text{IPC}$ is the instructions executed per clock cycle.
* $f_{\text{store}}$ is the store instruction frequency fraction.
* $W_{\text{store}}$ is the average store payload width in bytes.

```text
STORE BANDWIDTH DEPENDENCY ANALYSIS

 BW_store = f_clk * IPC * f_store * W_store
             │      │       │         │
             │      │       │         └── Store Payload Size (4B / 8B)
             │      │       └────────── Store Instruction Ratio (15% - 30%)
             │      └────────────────── Core Execution Rate
             └───────────────────────── Operating Clock Frequency
 (Notice: L1 CACHE HIT RATE IS COMPLETELY ABSENT FROM THIS EQUATION!)
```

Look at this mathematical equation with extreme care!
Notice what is **MISSING** from the formula: **The L1 Cache Hit Rate ($h_r$)!**

For read operations, increasing the cache hit rate from $90\%$ to $99\%$ reduces read bus traffic by a factor of 10. 

For write operations in a Write-Through cache, **the cache hit rate has ZERO impact on bus traffic!** Even if the L1 cache hit rate is $100\%$, every single store instruction still generates full, un-mitigated traffic on the memory bus!

---

### Numerical Demonstration of Interconnect Saturation

Let us calculate the store traffic generated by a modern quad-core server processor operating under a Write-Through L1 cache policy:

* CPU Clock Frequency: $f_{\text{clk}} = 3.0\text{ GHz} = 3.0 \times 10^9\text{ Hz}$.
* Execution Rate: $\text{IPC} = 1.5\text{ instructions/cycle per core} \times 4\text{ cores} = 6.0\text{ total IPC}$.
* Store Instruction Fraction: $f_{\text{store}} = 20\%\quad (0.20)$.
* Store Payload Width: $W_{\text{store}} = 8\text{ bytes}$ ($64\text{-bit words}$).

Let us substitute these values into our bandwidth equation:

$$N_{\text{stores}} = (3.0 \times 10^9\text{ Hz}) \times 6.0 \times 0.20 = \mathbf{3,600,000,000 \text{ store transactions / second!}}$$

$$\text{BW}_{\text{store}} = 3,600,000,000\text{ stores/sec} \times 8\text{ bytes/store} = \mathbf{28,800,000,000 \text{ Bytes / second}} = \mathbf{28.8 \text{ GB/sec}}$$

A quad-core processor using Write-Through L1 caches consumes **$28.8\text{ Gigabytes per second}$ of continuous memory bus bandwidth** *just to transmit store instructions*!

If the physical memory interconnect bus has a maximum peak capacity of $20.0\text{ GB/sec}$, the write-through traffic exceeds the total physical capacity of the bus ($28.8\text{ GB/sec} > 20.0\text{ GB/sec}$).

The memory bus becomes completely saturated, queues overflow, and the CPU cores spend over $80\%$ of their time frozen in **Write Stall Cycles**!

---

### CPI Degradation Formula for Un-Buffered Write-Through Caches

When a CPU core executes a store instruction in an un-buffered Write-Through system, it cannot proceed to the next instruction until the write transaction finishes crossing the memory bus and updating lower memory.

We express the effective Cycles Per Instruction ($\text{CPI}_{\text{effective}}$) for an un-buffered Write-Through cache as:

$$\text{CPI}_{\text{effective}} = \text{CPI}_{\text{base}} + \left( f_{\text{store}} \times T_{\text{bus\_write\_stall}} \right)$$

Where:
* $\text{CPI}_{\text{effective}}$ is the actual average cycles required per executed instruction.
* $\text{CPI}_{\text{base}}$ is the base execution CPI including read cache misses.
* $f_{\text{store}}$ is the fraction of instructions that are store operations.
* $T_{\text{bus\_write\_stall}}$ is the stall latency in CPU clock cycles required to execute a write-through transaction across the memory bus.

If $\text{CPI}_{\text{base}} = 1.2$, $f_{\text{store}} = 0.20$, and a main memory write transaction takes $T_{\text{bus\_write\_stall}} = 100\text{ clock cycles}$:

$$\text{CPI}_{\text{effective}} = 1.2 + (0.20 \times 100) = 1.2 + 20.0 = \mathbf{21.2 \text{ cycles/instruction}}$$

The effective execution time per instruction increases by a factor of 17.6! Un-buffered Write-Through destroys processor throughput.

---

## Mitigating Store Stalls: The Hardware Write Buffer Queue

To prevent the CPU pipeline from stalling on every single store instruction while waiting for slow memory bus transactions, hardware architects place a FIFO (First-In, First-Out) memory queue between the L1 Data Cache and the memory bus: **The Hardware Write Buffer**.

```text
WRITE-THROUGH CACHE WITH HARDWARE WRITE BUFFER QUEUE

 CPU Core (Executes Store Instruction SW)
             │
             ├──────────────────────────────────────┐
             ▼                                      ▼
 ┌──────────────────────┐             ┌───────────────────────────┐
 │ L1 Data Cache (SRAM) │             │ Hardware Write Buffer     │
 │ (Updates in 1 Cycle) │             │ (FIFO Queue: 4 to 8 Depth)│
 └──────────────────────┘             └─────────────┬─────────────┘
                                                    │
  CPU Resumes Execution IMMEDIATELY!                │ De-queues writes
  (Zero Stall Cycles if Buffer NOT Full!)           ▼ in background
                                      ┌───────────────────────────┐
                                      │ Memory Bus Interconnect   │
                                      └───────────────────────────┘
```

---

### How a Write Buffer Works

1. **Instant Task Offloading**: When the CPU executes a store instruction, it writes the new data payload into the L1 Data Cache in $1\text{ clock cycle}$, and simultaneously pushes the target address and data payload into the **Write Buffer Queue**.
2. **Immediate Pipeline Resume**: The moment the store item is safely queued inside the Write Buffer, the CPU considers the store instruction **complete** and resumes executing subsequent instructions immediately without waiting for the memory bus!
3. **Background Bus Drain**: While the CPU continues executing instructions at full speed, a dedicated memory bus controller pops write requests from the front of the Write Buffer and transmits them across the off-chip bus to main memory in the background.

---

### The Limits of Write Buffering: Buffer Overflow Stalls

A Write Buffer works brilliantly for **isolated stores** or short bursts of store instructions.

However, a Write Buffer **does NOT reduce total memory bus bandwidth**! It merely smooths out temporary arrival spikes.

If a program executes a long loop that generates store instructions at a rate faster than the memory bus can drain the Write Buffer:

$$N_{\text{stores\_generated}} > N_{\text{bus\_drained}}$$

The Write Buffer queue will fill up completely (e.g., all 4 or 8 entries occupied).

The moment the Write Buffer becomes $100\%$ full, a **Write Buffer Overflow** occurs! 

When the CPU attempts to execute its next store instruction, it finds no open slots in the Write Buffer. The CPU pipeline is forced to **stall** and wait until the bus drains at least one entry from the queue.

```text
WRITE BUFFER OVERFLOW CHRONOLOGY

 Store 1 ──► Pushes to Write Buffer (Slot 0) ──► CPU Resumes
 Store 2 ──► Pushes to Write Buffer (Slot 1) ──► CPU Resumes
 Store 3 ──► Pushes to Write Buffer (Slot 2) ──► CPU Resumes
 Store 4 ──► Pushes to Write Buffer (Slot 3) ──► CPU Resumes (Buffer 100% FULL!)
 Store 5 ──► WRITE BUFFER OVERFLOW!          ──► CPU PIPELINE STALLS!
             (Must wait for bus to drain Slot 0 before resuming!)
```

Therefore, while a Write Buffer masks individual store latencies, **it cannot overcome a fundamental bandwidth deficit if average store traffic exceeds physical bus capacity!**

---

## Real-World Silicon Engineering: Why Write-Through Caches Persist

Given the heavy bus traffic overhead of the Write-Through policy, why hasn't it been completely abandoned in favor of Write-Back policies in modern processor design?

In real-world semiconductor engineering, Write-Through caches are still widely deployed in specific architectural domains due to four critical physical and system-level advantages:

```text
REAL-WORLD WRITE-THROUGH APPLICATION DOMAINS

                         WRITE-THROUGH CACHE USAGE
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
 L1 INSTRUCTION CACHES      SAFETY-CRITICAL SYSTEMS     L1 DATA CACHES IN HIERARCHIES
 (Read-Only / No Dirty)     (Aerospace, Automotive)     (Write-Through L1 / Write-Back L2)
```

---

### 1. Read-Only L1 Instruction Caches (I-Caches)
Instruction caches are read-only during normal execution. However, when a Just-In-Time (JIT) compiler or operating system loader writes new code into memory, the instruction lines must be updated. 

Using a Write-Through strategy for L1 Instruction Caches ensures that any code modification immediately updates lower-level memory, simplifying instruction-cache invalidation pipelines without requiring dirty bits in the I-Cache.

---

### 2. Safety-Critical and Embedded Systems (ISO 26262 / Aerospace)
In automotive engine controllers, flight control computers, and medical implant devices, system reliability is more important than raw peak benchmark speed.

If a sudden supply voltage drop, electromagnetic interference (EMI) spike, or power loss occurs:
* A **Write-Back Cache** holds dirty data in L1 SRAM that has never been written to main memory. When power dies, that modified data is **lost forever**, corrupting system state!
* A **Write-Through Cache** guarantees that main DRAM memory or non-volatile RAM always holds a $100\%$ accurate, up-to-date copy of all data. On power restoration, the system reboots cleanly with zero corrupted state!

---

### 3. Hierarchical L1 Write-Through / L2 Write-Back Hybrid Architecture
Many high-speed multi-core processors (such as the ARM Cortex-M7 and UltraSPARC architectures) use a hybrid write policy:
* **L1 Data Cache**: Configured as **Write-Through** to the L2 Cache.
* **L2 Cache**: Configured as **Write-Back** to main DRAM memory.

```text
HYBRID L1 WRITE-THROUGH / L2 WRITE-BACK HIERARCHY

 CPU Core ──► [ L1 Data Cache ] ──(Write-Through)──► [ Shared L2 Cache ] ──(Write-Back)──► Main DRAM
              (Fast, Clean)                          (Absorbs Store Traffic)
```

Look at the power of this hybrid architecture:
1. Every L1 write updates the L2 cache immediately. Because the L2 cache is **on-chip**, L1 write-through transactions travel over ultra-fast, high-bandwidth internal silicon metal traces without touching the slow off-chip DRAM bus!
2. The shared L2 cache absorbs all the store traffic, holding modified lines locally using dirty bits.
3. The L2 cache uses **Write-Back** to communicate with main DRAM, ensuring that off-chip memory traffic remains minimal!
4. **Coherence Simplification**: Because the L1 cache is Write-Through to L2, L1 caches never hold unique dirty data that isn't present in L2. Multi-core cache coherence protocols become vastly simpler and faster!

---

## Solved Industrial Engineering Exercise: Quantitative Write-Through Bus Bandwidth and CPI Degradation Analysis

To consolidate your complete mastery of Write-Through cache mechanics, store bandwidth equations, Write Buffer queue dynamics, and pipeline stall calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior memory systems architect evaluating the L1 Data Cache design for a $3.0\text{ GHz}$ embedded real-world controller core ($T_{\text{clk}} = 0.3333\text{ ns} = 333.3\text{ ps}$).

The processor executes an industrial sensor processing loop that executes **$20,000,000\text{ instructions}$** per second ($20\text{ MIPS}$ workload).

```text
3.0 GHz EMBEDDED PROCESSOR WITH WRITE-THROUGH L1 DATA CACHE

 CPU Core (3.0 GHz) ──► [ L1 Data Cache (32 KB, Write-Through) ] ──► [ Memory Bus Interconnect ]
 Clock T = 333.3 ps     Read Hit Rate = 95%                          Bus Speed = 100 MHz
```

#### System Operating Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.0\text{ GHz} = 3.0 \times 10^9\text{ Hz}$.
* Ideal Processor Performance: $\text{CPI}_{\text{base}} = 1.20\text{ cycles/instruction}$ (including read misses).
* Workload Instruction Mix:
  * $60\%$ Arithmetic / Logic Instructions ($f_{\text{arith}} = 0.60$).
  * $25\%$ Memory Read / Load Instructions (`LW`, $f_{\text{load}} = 0.25$).
  * $15\%$ Memory Write / Store Instructions (`SW`, $f_{\text{store}} = 0.15$).
* Store Payload Width: $W_{\text{store}} = 4\text{ bytes}$ ($32\text{-bit word stores}$).
* L1 Data Cache Allocation Policy: **Write-No-Allocate (Write-Around)**.
* L1 Data Cache Write Policy: **Write-Through**.

#### Memory Interconnect Bus Parameters:
* Interconnect Bus Clock Frequency: $f_{\text{bus}} = 150\text{ MHz} = 1.5 \times 10^8\text{ Hz}$.
* Bus Width: $64\text{ bits}$ ($8\text{ bytes}$).
* Maximum Bus Bandwidth Capacity: $\text{BW}_{\text{max}} = 1.20\text{ GB/sec}$ ($1.2 \times 10^9\text{ Bytes/sec}$).
* Un-buffered Write-Through Bus Transaction Latency: $T_{\text{bus\_write}} = 24\text{ CPU clock cycles}$ ($8.0\text{ ns}$).

#### Your Objective

1. Calculate the total **Store Instruction Execution Rate** ($N_{\text{stores}}$) and the resulting **Raw Bus Store Bandwidth** ($\text{BW}_{\text{store}}$) generated by the Write-Through policy in Megabytes per second (MB/sec).
2. Determine whether the raw store traffic exceeds the physical bus capacity ($\text{BW}_{\text{max}} = 1.20\text{ GB/sec}$).
3. Calculate the effective Cycles Per Instruction ($\text{CPI}_{\text{effective}}$) and the total execution delay (in milliseconds) for $20,000,000\text{ instructions}$ under an **un-buffered Write-Through System** (where the CPU stalls on every store).
4. Evaluate a **Hardware Write Buffer Optimization**: A 4-entry Write Buffer is added. Assuming the buffer absorbs isolated store bursts and reduces the average write stall to $T_{\text{buffered\_stall}} = 2\text{ clock cycles}$ per store:
   * Recalculate the new $\text{CPI}_{\text{effective\_buffered}}$.
   * Calculate the new total execution time.
   * Calculate the exact **Performance Speedup Factor** achieved by adding the Write Buffer.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Raw Store Traffic and Bus Bandwidth Consumption

The processor core executes $20,000,000\text{ instructions per second}$ ($20\text{ MIPS}$).

##### 1. Store Instruction Execution Rate ($N_{\text{stores}}$):
$$f_{\text{store}} = 0.15 \quad (15\%)$$

$$N_{\text{stores}} = 20,000,000 \text{ inst/sec} \times 0.15 = \mathbf{3,000,000 \text{ store transactions / second}}$$

##### 2. Raw Bus Store Bandwidth Consumption ($\text{BW}_{\text{store}}$):
Each store writes $W_{\text{store}} = 4\text{ bytes}$ of data payload.

$$\text{BW}_{\text{store}} = N_{\text{stores}} \times W_{\text{store}}$$

$$\text{BW}_{\text{store}} = 3,000,000 \text{ stores/sec} \times 4 \text{ bytes/store} = \mathbf{12,000,000 \text{ Bytes / second}} = \mathbf{12.0 \text{ MB/sec}}$$

##### 3. Bus Capacity Verification:
* Generated Store Traffic: $\text{BW}_{\text{store}} = 12.0\text{ MB/sec} = 0.012\text{ GB/sec}$.
* Maximum Bus Capacity: $\text{BW}_{\text{max}} = 1.20\text{ GB/sec} = 1,200.0\text{ MB/sec}$.

$$\text{Bus Utilization} = \frac{12.0\text{ MB/sec}}{1,200.0\text{ MB/sec}} \times 100\% = \mathbf{1.0\% \text{ Bus Utilization}}$$

The average store traffic consumes only $1.0\%$ of the total physical bus bandwidth capacity.

---

#### Step 2: Calculate Un-Buffered Write-Through CPI and Execution Delay

Even though the *average* bandwidth is within bus limits, an **un-buffered Write-Through system** forces the CPU to stall on every single store instruction while the bus executes the 24-cycle write transaction!

$$\text{CPI}_{\text{unbuffered}} = \text{CPI}_{\text{base}} + (f_{\text{store}} \times T_{\text{bus\_write}})$$

Given $\text{CPI}_{\text{base}} = 1.20$, $f_{\text{store}} = 0.15$, and $T_{\text{bus\_write}} = 24\text{ cycles}$:

$$\text{CPI}_{\text{unbuffered}} = 1.20 + (0.15 \times 24) = 1.20 + 3.60 = \mathbf{4.80 \text{ cycles/instruction}}$$

##### Calculate Total Execution Clock Cycles:
For $N_{\text{inst}} = 20,000,000\text{ instructions}$:

$$\text{Total Cycles}_{\text{unbuffered}} = 20,000,000 \text{ inst} \times 4.80 \text{ cycles/inst} = \mathbf{96,000,000 \text{ clock cycles}}$$

##### Calculate Total Execution Time ($T_{\text{exec\_unbuffered}}$) at $3.0\text{ GHz}$ ($T_{\text{clk}} = 0.3333\text{ ns}$):

$$T_{\text{exec\_unbuffered}} = 96,000,000 \text{ cycles} \times 0.33333 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0320 \text{ seconds}} \quad (32.0\text{ ms})$$

Without a Write Buffer, the $20\text{-million}$ instruction workload takes **$32.0\text{ milliseconds}$** to execute, with $75\%$ of the execution time spent stalled on write operations!

---

#### Step 3: Evaluate Hardware Write Buffer Optimization

Now, a 4-entry Hardware Write Buffer is added between the L1 Data Cache and the memory bus, reducing the average write stall penalty from $24\text{ cycles}$ down to $T_{\text{buffered\_stall}} = 2\text{ clock cycles}$ per store.

##### 1. Recalculate New Buffered CPI ($\text{CPI}_{\text{buffered}}$):

$$\text{CPI}_{\text{buffered}} = \text{CPI}_{\text{base}} + (f_{\text{store}} \times T_{\text{buffered\_stall}})$$

$$\text{CPI}_{\text{buffered}} = 1.20 + (0.15 \times 2) = 1.20 + 0.30 = \mathbf{1.50 \text{ cycles/instruction}}$$

##### 2. Recalculate New Total Execution Cycles:

$$\text{Total Cycles}_{\text{buffered}} = 20,000,000 \text{ inst} \times 1.50 \text{ cycles/inst} = \mathbf{30,000,000 \text{ clock cycles}}$$

##### 3. Recalculate New Execution Time ($T_{\text{exec\_buffered}}$):

$$T_{\text{exec\_buffered}} = 30,000,000 \text{ cycles} \times 0.33333 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0100 \text{ seconds}} \quad (10.0\text{ ms})$$

##### 4. Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec\_unbuffered}}}{T_{\text{exec\_buffered}}} = \frac{32.0\text{ ms}}{10.0\text{ ms}} = \mathbf{3.20\times \text{ Performance Speedup!}}$$

```text
WRITE BUFFER OPTIMIZATION RESULTS SUMMARY

 System Configuration     │ Effective CPI       │ Execution Time │ Performance Speedup
──────────────────────────┼─────────────────────┼────────────────┼─────────────────────
 Un-Buffered Write-Through│ 4.80 Cycles / Inst  │    32.0 ms     │ 1.00x (Baseline)
 Buffered Write-Through   │ 1.50 Cycles / Inst  │    10.0 ms     │ 3.20x FASTER! (220% Gain)
```

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against system principles:

1. **CPI Improvement Check**:
   * Adding the Write Buffer reduced write stall penalty by $22\text{ cycles}$ per store ($24 \to 2$).
   * Store penalty reduction per instruction = $0.15 \times 22 = 3.30\text{ cycles/inst}$.
   * $\text{CPI}_{\text{unbuffered}} (4.80) - 3.30 = 1.50\text{ cycles/inst}$.
   * Matches our buffered CPI calculation exactly.
2. **Bus Capacity Verification**:
   * Raw store traffic ($12.0\text{ MB/s}$) is well below maximum bus capacity ($1,200.0\text{ MB/s}$).
   * This confirms that the Write Buffer queue will NOT suffer chronic overflow stalls, justifying our average stall estimate of 2 cycles.
3. **Write-No-Allocate Alignment**:
   * Using Write-No-Allocate prevented store misses from pulling useless 64-byte lines into L1 SRAM, saving $128\text{ MB/s}$ of unnecessary read-fill bus traffic.

All bandwidth calculations, CPI stall equations, write buffer queue dynamics, and speedup ratios evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Write-Through Policy**: A cache write management policy where every store operation updates the targeted line in the local L1 cache (if present) and simultaneously dispatches a write transaction across the memory bus to update lower-level memory synchronously, guaranteeing $100\%$ memory consistency without requiring dirty bits ($D = 0$ always).
* **Bus Store Traffic**: The continuous interconnect bandwidth consumption ($\text{BW}_{\text{store}} = f_{\text{clk}} \cdot \text{IPC} \cdot f_{\text{store}} \cdot W_{\text{store}}$) generated by write-through store operations, which is independent of the L1 cache hit rate and can saturate memory buses unless buffered or converted to write-back policies.
