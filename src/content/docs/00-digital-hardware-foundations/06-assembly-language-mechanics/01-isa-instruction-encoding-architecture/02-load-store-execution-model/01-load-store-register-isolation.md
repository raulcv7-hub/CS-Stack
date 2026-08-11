---
title: "Load-Store Register Isolation and Register-Register Execution Mechanics"
---

# Load-Store Register Isolation and Register-Register Execution Mechanics

## The Memory-Bus Lockup Hazard: Why Direct Memory Arithmetic Destroys Pipelining

Inside a modern central processing unit (CPU) operating at a clock frequency of $3.2\text{ GHz}$, the execution units—such as the Arithmetic Logic Unit (ALU) and Floating-Point Unit (FPU)—perform mathematical calculations at blinding speeds. A 64-bit integer addition or bitwise logical operation executed on data stored inside local CPU registers completes in a single clock cycle, taking a mere $312.5\text{ picoseconds}$ ($0.3125\text{ nanoseconds}$).

However, reading or writing data across the memory interconnect bus to main Dynamic Random-Access Memory (DRAM) is governed by physical semiconductor limits. Fetching a single data word from off-chip DRAM requires navigating bus arbitration queues, row activation delays ($t_{\text{RCD}}$), and column access latencies ($t_{\text{CL}}$), taking anywhere from $100\text{ to } 200\text{ CPU clock cycles}$ ($30\text{ to } 60\text{ nanoseconds}$).

Now, consider what occurs at the physical silicon level if an Instruction Set Architecture (ISA) allows a single software instruction to perform mathematical arithmetic directly on main memory addresses. 

In older Complex Instruction Set Computer (CISC) architectures—such as classic x86—a single instruction can specify memory locations directly as both source and destination operands, for example:

```x86asm
ADD [0x1000], [0x2000]   ; Read memory at 0x2000, read memory at 0x1000,
                         ; add the values, and write the sum back to 0x1000!
```

Let us trace the physical execution timeline when a processor attempts to execute this single memory-to-memory arithmetic instruction in hardware:

1. **First Memory Read Phase**: The CPU pipeline halts and dispatches a read command across the memory bus to retrieve the 64-bit value at address `0x2000`. The execution pipeline sits completely frozen for **100 clock cycles** waiting for main memory to respond.
2. **Second Memory Read Phase**: Once the first value arrives, the CPU pipeline halts a second time to dispatch another read command to retrieve the 64-bit value at address `0x1000`. The pipeline freezes for **another 100 clock cycles**.
3. **ALU Arithmetic Phase**: The 64-bit ALU finally receives both values and executes the addition in **1 single clock cycle**.
4. **Memory Write Phase**: The CPU pipeline halts a third time to dispatch a write command across the memory bus to store the sum back into address `0x1000`. The pipeline freezes for **100 clock cycles** waiting for the write to settle!

```text
THE CISC MEMORY-TO-MEMORY BUS LOCKUP HAZARD

 Executing Single Instruction: ADD [0x1000], [0x2000]
 ┌─────────────────────────────────────────────────────────────┐
 │ Phase 1: Read Memory 0x2000    ──► STALLS 100 CLOCK CYCLES!  │
 │ Phase 2: Read Memory 0x1000    ──► STALLS 100 CLOCK CYCLES!  │
 │ Phase 3: ALU Addition          ──► Executes in 1 Cycle      │
 │ Phase 4: Write Memory 0x1000   ──► STALLS 100 CLOCK CYCLES!  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 TOTAL EXECUTION LATENCY = 301 CLOCK CYCLES FOR 1 INSTRUCTION!
 (Shared memory interconnect bus locked; CPU pipeline frozen!)
```

Look at the physical cataclysm inside the processor:
* Executing a single addition instruction consumed **301 clock cycles**!
* Out of those 301 clock cycles, **300 cycles ($99.67\%$ of total time) were spent standing completely idle**, waiting for memory bus transactions to complete!
* During those 300 cycles, the shared memory interconnect bus was physically locked, preventing other CPU cores, graphics processors, or network controllers from accessing memory.
* Because the instruction's execution duration is unpredictable (depending on whether the memory addresses hit in cache or miss to DRAM), the CPU front-end cannot pipeline subsequent instructions. The entire instruction pipeline collapses into a sequential, un-pipelined crawl.

How do we eliminate this memory-bus lockup hazard? How do we build a high-frequency, segmentable CPU pipeline where mathematical instructions execute with $100\%$ deterministic $1\text{-cycle}$ timing, completely decoupled from slow memory access delays?

To solve the memory-bus lockup hazard and enable multi-gigahertz pipelined execution, modern computer architectures enforce **Load-Store Register Isolation** and **Register-Register Execution Mechanics**.

Under a **Load-Store Architecture** (the foundational rule of all Reduced Instruction Set Computer / RISC designs, including RISC-V and ARM):
1. **Arithmetic Is Isolated**: No arithmetic, logical, or comparison instruction is permitted to access main memory. The ALU connects **exclusively** to the CPU's local SRAM Register File. All mathematical calculations execute strictly as **Register-Register Operations** in $1\text{ clock cycle}$.
2. **Memory Access Is Isolated**: Reaching into main memory is restricted **exclusively** to dedicated, explicit **Load** instructions (which copy data from memory into a register) and **Store** instructions (which copy data from a register into memory).

By separating memory access from mathematical computation, the processor transforms unpredictable 300-cycle memory stalls into clean, predictable, $1\text{-cycle}$ pipeline stages.


### Method A: Direct Warehouse Work (CISC Memory-to-Memory Arithmetic)

Under Method A, there is no rule forbidding work inside the warehouse. 

1. At 8:00 AM, the carpenter grabs their hammer and nails, walks across the street, enters the dark warehouse, and spends **5 minutes** searching for Board A.
2. The carpenter finds Board A, then spends **5 minutes** searching through the dark warehouse aisles for Board B.
3. Standing in the dark warehouse aisle, the carpenter saws the boards and nails them together in **1 second**!
4. The carpenter spends **5 minutes** carrying the assembled furniture to a storage shelf, and then walks back across the street to the workshop at 8:15 AM.

```text
METHOD A: DIRECT WAREHOUSE WORK (IN-EFFICIENCY)

 08:00 AM: Walk to Warehouse & Find Board A  ──► 5 Minutes
 08:05 AM: Find Board B in Warehouse        ──► 5 Minutes
 08:10 AM: Nail Boards Together in Aisle    ──► 1 Second!
 08:10 AM: Carry Finished Furniture to Shelf ──► 5 Minutes
 (Total Time = 15 Minutes! Workshop sat completely empty and idle for 15 minutes!)
```

Look at the absurdity of Method A:
* The carpenter spent **15 minutes** ($900\text{ seconds}$) on a job that required only $1\text{ second}$ of actual carpentry work!
* While the carpenter was standing in the dark warehouse aisle hammering boards, other delivery trucks were blocked from using the warehouse aisle (**Memory Bus Lockup**).
* The workshop's high-speed saws and tables sat completely empty doing zero work.


## Primitive 1: Load-Store Architecture

Now that we possess a clear intuitive mental model of the carpenter's workbench and storage warehouse, let us examine the formal, rigorous engineering mechanics of **Load-Store Architecture**.

> **A Load-Store Architecture** is an Instruction Set Architecture (ISA) design model where main memory accesses are strictly restricted to explicit **Load** instructions (which copy data from memory into registers) and **Store** instructions (which copy data from registers into memory). No arithmetic, logical, shift, or comparison instruction is permitted to accept memory addresses directly as operands.

```text
LOAD-STORE ARCHITECTURE DATA BOUNDARY

                 Main System Memory (DRAM / Caches)
                               │
                       ┌───────┴───────┐
      Load (lw / ld)   │               │   Store (sw / sd)
      Reads Memory     ▼               ▲   Writes Memory
 ┌─────────────────────────────────────────┐
 │ CPU ARCHITECTURAL REGISTER FILE         │
 │ Registers x0, x1, x2 ... x31 (SRAM)     │
 └─────────────────────┬───────────────────┘
                       │
                       ▼ Operands Read strictly from Registers!
 ┌─────────────────────────────────────────┐
 │ ARITHMETIC LOGIC UNIT (ALU / FPU)       │
 │ Executes ADD, SUB, XOR, SLL in 1 Cycle! │
 └─────────────────────────────────────────┘
  (Memory and Arithmetic are 100% Isolated from Each Other!)
```


### Why Load-Store Isolation Makes High-Speed Pipelining Possible

The primary physical justification for implementing a Load-Store Architecture in modern silicon is **Instruction Pipeline Uniformity**.

In a classical 5-stage RISC processor pipeline, every instruction progresses through five fixed hardware stages on consecutive clock cycles:

```text
CLASSICAL 5-STAGE RISC EXECUTION PIPELINE

 Stage 1: IF  (Instruction Fetch)   ──► Fetch 32-bit instruction word from L1 I-Cache
 Stage 2: ID  (Instruction Decode)  ──► Decode Opcode & Read Register File Ports (rs1, rs2)
 Stage 3: EX  (Execute / ALU)       ──► ALU performs math operation OR AGU calculates address
 Stage 4: MEM (Memory Access)       ──► Read or Write L1 Data Cache (LOADS & STORES ONLY!)
 Stage 5: WB  (Write-Back)          ──► Write result into Destination Register (rd)
```

Look at how Load-Store isolation guarantees perfect stage alignment across different instruction types:

```text
PIPELINE STAGE RESOURCE ALIGNMENT MATRIX

 Instruction Type │ Stage 1 (IF) │ Stage 2 (ID) │ Stage 3 (EX)   │ Stage 4 (MEM) │ Stage 5 (WB)
──────────────────┼──────────────┼──────────────┼────────────────┼───────────────┼───────────────
 Arithmetic (add) │ Fetch Inst   │ Read rs1,rs2 │ ALU Add (1c)   │ [ Idle ]      │ Write rd
 Memory Load (lw) │ Fetch Inst   │ Read rs1     │ AGU Addr Calc  │ Read L1 Cache │ Write rd
 Memory Store (sw)│ Fetch Inst   │ Read rs1,rs2 │ AGU Addr Calc  │ Write L1 Cache│ [ Idle ]
```

Notice the physical harmony across the pipeline:
* **Arithmetic Instructions (`add`)**: Use the **EX stage** to calculate math ($A + B$). They do NOT touch the L1 Data Cache in the **MEM stage**!
* **Memory Instructions (`lw`/`sw`)**: Use the **EX stage** to compute the memory address ($\text{Base} + \text{Offset}$), and then use the **MEM stage** to access the L1 Data Cache!

Because arithmetic instructions and memory instructions use completely different hardware stages for math versus memory access, **structural resource collisions are 100% eliminated**! 

On every single clock cycle, five different instructions can occupy the five pipeline stages simultaneously, achieving a theoretical throughput of **1 instruction per clock cycle ($\text{IPC} = 1.0$)**!


### The Hardware Anatomy of the Register File

To support Register-Register execution in a single clock cycle, the CPU's internal **Register File** is built as an ultra-fast, multi-ported Static RAM (SRAM) memory array.

For a 64-bit architecture with 32 general-purpose registers ($x0 \dots x31$):
* **Storage Size**: $32 \times 64\text{ bits} = 2,048\text{ bits}$ ($256\text{ bytes}$) of high-speed SRAM.
* **Read Ports**: **Two Independent Read Ports** (Port 1 and Port 2).
  * Port 1 accepts a 5-bit address (`rs1`) and outputs 64 bits of data.
  * Port 2 accepts a 5-bit address (`rs2`) and outputs 64 bits of data.
  * Both read ports operate **simultaneously in parallel**, retrieving two 64-bit operands in less than $120\text{ picoseconds}$!
* **Write Port**: **One Write Port** (Port 3).
  * Accepts a 5-bit destination address (`rd`), a 64-bit write payload, and a 1-bit write-enable strobe (`RegWrite`).
  * Writes data on the rising edge of the clock cycle.


## CISC Micro-Operation ($\mu\text{op}$) Decomposition: How CISC Hardware Emulates Load-Store Internally

A common question in computer engineering is:
> *"If CISC processors (like modern Intel Core or AMD Zen x86-64 chips) allow memory-to-memory assembly instructions like `ADD [RBX], EAX`, how do they run at $4.0\text{ GHz}+$ without locking up their pipelines?"*

The answer reveals a fascinating piece of silicon engineering: **Modern CISC processors are actually RISC Load-Store processors under the hood!**

When an x86-64 CISC processor fetches a complex memory-arithmetic instruction from memory:

```x86asm
ADD [RBX], EAX    ; CISC Instruction: Reads memory at [RBX], adds EAX, writes back to [RBX]
```

The CISC front-end decoder **decomposes the single CISC instruction into three simple, internal RISC-like Micro-Operations ($\mu\text{ops}$)**:

```text
CISC INSTRUCTION DECOMPOSITION INTO RISC MICRO-OPS (uops)

 Complex CISC Instruction: ADD [RBX], EAX
              │
              ▼ (Decoded by x86 Front-End)
 ┌─────────────────────────────────────────────────────────────┐
 │ micro-op 1:  uop_LOAD  temp1, [RBX]  (Explicit Load)        │
 │ micro-op 2:  uop_ADD   temp2, temp1, EAX (Reg-Reg Arithmetic)│
 │ micro-op 3:  uop_STORE temp2, [RBX]  (Explicit Store)       │
 └─────────────────────────────────────────────────────────────┘
```

1. $\mu\text{op}_1$ (**Load $\mu\text{op}$**): Reads memory at address `[RBX]` and stores the value in temporary internal hardware register `temp1`.
2. $\mu\text{op}_2$ (**Arithmetic $\mu\text{op}$**): Adds register `temp1` and register `EAX` strictly inside the ALU, storing the sum in temporary register `temp2` (**Register-Register Execution!**).
3. $\mu\text{op}_3$ (**Store $\mu\text{op}$**): Writes the value from temporary register `temp2` back to memory at address `[RBX]`.

This internal decomposition proves the universal architectural truth: **Physical silicon execution units CANNOT execute arithmetic directly on memory without breaking pipelining.** 

Even CISC microprocessors MUST translate complex memory-arithmetic instructions into explicit Load, Execute, and Store steps to run on modern pipelined hardware!


### 2. Multi-Core Atomic Read-Modify-Write (RMW) Bus Lockups

In multi-core computing, when multiple CPU cores share a single main memory space, what happens if Core 0 and Core 1 both attempt to execute a memory-to-memory addition on the same shared counter variable simultaneously?

Under a CISC memory-arithmetic instruction (`ADD [counter], 1`):
* Core 0 reads `counter` ($0$), adds $1$, and writes $1$ back.
* Core 1 reads `counter` ($0$), adds $1$, and writes $1$ back.
* **Data Race Failure**: Both cores wrote $1$, losing one increment!

To prevent this data race, CISC architectures require adding a physical **`LOCK` prefix** (`LOCK ADD [counter], 1`).

The `LOCK` prefix commands the memory bus controller to **physically assert a lock signal on the memory bus wires**, preventing all other CPU cores from reading or writing memory for the entire duration of the Read-Modify-Write (RMW) cycle ($300\text{ cycles}$)!

```text
CISC LOCK PREFIX BUS OCCLUSION

 Core 0: LOCK ADD [counter], 1 ──► LOCKS SHARED MEMORY BUS FOR 300 CYCLES!
                                   (Cores 1, 2, 3 CANNOT ACCESS MEMORY AT ALL!)
```

#### The Load-Store Solution: Atomic Reservation Pairs (`LR/SC`)
In RISC Load-Store architectures, bus locking is strictly prohibited. 

Instead of locking the memory bus for 300 cycles, Load-Store architectures replace memory arithmetic with atomic reservation pairs:
* **Load-Reserved (`LR`)**: Reads a memory word and registers a local hardware reservation on that memory address.
* **Store-Conditional (`SC`)**: Attempts to write to the memory address. The write succeeds **ONLY if no other core modified that address** since the `LR` instruction!

```riscv
# ATOMIC MEMORY INCREMENT IN LOAD-STORE ARCHITECTURE (RISC-V)
retry_loop:
    lr.w  x10, (x20)       # 1. Load-Reserved: Read counter & register reservation
    addi  x10, x10, 1      # 2. Register-Register Arithmetic: Increment in register x10
    sc.w  x11, x10, (x20)  # 3. Store-Conditional: Write back ONLY if reservation intact!
    bnez  x11, retry_loop  # If SC failed (x11 != 0), retry loop!
```

Look at the hardware elegance of `LR/SC`:
* The memory bus is **NEVER locked**!
* If another core modifies the counter, the `SC` instruction detects the broken reservation, returns $1$ in `x11`, and the loop retries locally.
* Multi-core memory traffic remains fluid, and no single core can freeze the shared memory interconnect!


### Scenario and Parameters

You are a senior microarchitect auditing the execution performance of a $3.2\text{ GHz}$ 64-bit processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a vector array transformation loop that updates array elements according to the mathematical formula:

$$C[i] = (A[i] \times B[i]) + D[i]$$

Where $A, B, C, D$ are arrays of 64-bit integers ($8\text{ bytes per element}$).

```text
3.2 GHz PROCESSOR LOAD-STORE EXECUTION PIPELINE

 CPU Core (3.2 GHz) ──► [ 5-Stage Pipeline: IF-ID-EX-MEM-WB ] ──► L1 Data Cache
 Clock T = 312.5 ps     L1 Hit = 1 Cycle, DRAM Miss = 120 Cycles  8-Byte Words
```

#### Memory System Parameters:
* Base Address Register `x20` holds physical memory address `0x0000_0000_1000_0000`.
* Array offsets relative to `x20`:
  * $A[i]$ sits at offset $0\text{ bytes}$ (`0(x20)`).
  * $B[i]$ sits at offset $8\text{ bytes}$ (`8(x20)`).
  * $D[i]$ sits at offset $16\text{ bytes}$ (`16(x20)`).
  * $C[i]$ sits at offset $24\text{ bytes}$ (`24(x20)`).
* Memory Latencies:
  * L1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($312.5\text{ ps}$).
  * Main DRAM Memory Miss Latency = $120\text{ clock cycles}$ ($37.5\text{ ns}$).

#### Your Objective

1. Write the complete, valid RISC-V 64-bit assembly code sequence to perform $C[i] = (A[i] \times B[i]) + D[i]$ strictly adhering to **Load-Store / Register-Register Architecture Rules**.
2. Map each assembly instruction through the classical 5-stage pipeline (IF, ID, EX, MEM, WB) and specify:
   * Which instructions utilize the **EX stage** for arithmetic versus address calculation.
   * Which instructions utilize the **MEM stage** to access L1 Data Cache.
3. Calculate the total execution clock cycles and total physical time (in nanoseconds) under two operational scenarios:
   * **Case A (Optimal L1 Hits)**: All memory loads and stores hit in the L1 Data Cache ($1\text{ cycle}$ hit latency).
   * **Case B (L1 Miss on $A[i]$)**: The load for $A[i]$ misses in L1 SRAM and incurs a $120\text{-cycle}$ DRAM line fill, while $B[i], D[i], C[i]$ hit in L1 SRAM.
4. Compare the pipeline stall duration of this Load-Store code sequence against a hypothetical CISC memory-to-memory instruction sequence that executes the entire $C[i] = (A[i] \times B[i]) + D[i]$ calculation in a single memory-to-memory opcode.
5. Verify mathematical, structural, and timing correctness.


#### Step 1: Write the Load-Store Assembly Sequence

To evaluate $C[i] = (A[i] \times B[i]) + D[i]$ under strict Load-Store rules, we must explicitly load operands into registers, execute arithmetic strictly between registers, and store the result:

```riscv
# LOAD-STORE RISC-V 64-BIT ASSEMBLY SEQUENCE

ld   x10, 0(x20)       # Inst 1: LOAD A[i] from address (x20 + 0) into register x10
ld   x11, 8(x20)       # Inst 2: LOAD B[i] from address (x20 + 8) into register x11
ld   x12, 16(x20)      # Inst 3: LOAD D[i] from address (x20 + 16) into register x12
mul  x13, x10, x11     # Inst 4: EXECUTE Reg-Reg Multiply: x13 <= x10 * x11
add  x14, x13, x12     # Inst 5: EXECUTE Reg-Reg Addition: x14 <= x13 + x12
sd   x14, 24(x20)      # Inst 6: STORE C[i] from register x14 to address (x20 + 24)
```

Notice that instructions 4 (`mul`) and 5 (`add`) perform arithmetic **strictly between registers (`x10, x11, x12, x13, x14`)**. Memory is NOT touched during arithmetic!


#### Step 3: Calculate Execution Clock Cycles and Physical Time

Let us calculate execution time for $6\text{ instructions}$ at $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

##### Case A: Optimal L1 Cache Hits (100% L1 Hits)
In a 5-stage pipelined processor with forwarding logic, $N$ instructions execute in:

$$\text{Total Cycles}_{\text{pipelined}} = \text{Pipeline Depth} + (N - 1) + \text{Stall Cycles}$$

For 6 instructions with $1\text{-cycle}$ forwarding (assuming 1-cycle load-use hazard delay between `ld x12` and `mul`):
* Inst 1 (`ld x10`) enters IF at Cycle 0.
* Inst 2 (`ld x11`) enters IF at Cycle 1.
* Inst 3 (`ld x12`) enters IF at Cycle 2.
* Inst 4 (`mul x13, x10, x11`) requires `x11` (from Inst 2). `x11` is forwarded from MEM stage at Cycle 4. `mul` executes in EX at Cycle 4.
* Inst 5 (`add x14, x13, x12`) requires `x13`. `x13` is forwarded from EX stage. `add` executes at Cycle 5.
* Inst 6 (`sd x14, 24`) executes at Cycle 6 and completes WB at Cycle 10.

$$\text{Total Clock Cycles (Case A)} = \mathbf{10 \text{ Clock Cycles}}$$

$$T_{\text{exec,CaseA}} = 10 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{3.125 \text{ nanoseconds}}$$


#### Step 4: Compare Load-Store vs. Hypothetical CISC Memory Arithmetic

Consider a hypothetical CISC processor executing $C[i] = (A[i] \times B[i]) + D[i]$ in a single memory-to-memory instruction:

$$\mathtt{MAC \ [x20+24], \ [x20+0], \ [x20+8], \ [x20+16]}$$

Let us trace the CISC execution penalties:
1. **Memory Read 1 ($A[i]$)**: Misses in L1 DRAM $\to$ **Stalls 120 cycles**.
2. **Memory Read 2 ($B[i]$)**: Hits L1 $\to$ **1 cycle**.
3. **Memory Read 3 ($D[i]$)**: Hits L1 $\to$ **1 cycle**.
4. **ALU Multiply-Add**: Executes in **1 cycle**.
5. **Memory Write 1 ($C[i]$)**: Writes L1 $\to$ **1 cycle**.
6. **Bus Lockup Overhead**: For the entire $124\text{ clock cycles}$, the CISC instruction holds its internal state, locking the memory bus interface and preventing subsequent instructions from issuing!

$$\text{Total CISC Memory Instruction Latency} = 120 + 1 + 1 + 1 + 1 = \mathbf{124 \text{ Clock Cycles}}$$

##### Performance Comparison Summary:

```text
LOAD-STORE VS CISC EXECUTION PERFORMANCE SUMMARY

 Metric                    │ RISC Load-Store Sequence │ CISC Memory Instruction │ Architectural Advantage
───────────────────────────┼──────────────────────────┼─────────────────────────┼───────────────────────────
 L1 Hit Time (Case A)      │ 3.125 ns (10 Cycles)     │ 1.562 ns (5 Cycles)     │ CISC shorter (No pipelining)
 DRAM Miss Time (Case B)   │ 40.625 ns (130 Cycles)   │ 38.750 ns (124 Cycles)  │ Comparable single-thread
 Pipeline Pipelining Cap.  │ 100% PIPELINED (IPC=1.0) │ UN-PIPELINED (IPC=0.01) │ RISC 100x Faster Throughput!
 Memory Bus Lockup Hazard  │ ZERO Bus Lockup          │ 124-Cycle Bus Lockup!   │ RISC Zero Interconnect Lock
```

##### Microarchitectural Conclusion:
Although a single CISC instruction appears shorter on paper, **it cannot be pipelined**. 

When 100 iterations of the loop are executed in sequence:
* The **RISC Load-Store sequence** pipelines all 100 iterations, executing 1 instruction per cycle ($\text{IPC} \approx 1.0$) and completing in **$600\text{ clock cycles}$**.
* The **CISC Memory sequence** cannot pipeline memory operations, taking $100 \times 124 = \mathbf{12,400 \text{ clock cycles}}$!

The Load-Store architecture executes the 100-iteration loop **$20.6\times$ faster** than CISC memory-to-memory arithmetic!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Load-Store Architecture**: The microarchitectural model (foundational to RISC architectures) where memory access is strictly restricted to explicit `Load` and `Store` instructions, isolating main memory from mathematical processing and eliminating memory-bus lockup hazards.
* **Register-Register Execution**: The operational rule where ALU input and output terminals connect exclusively to high-speed local SRAM Register File ports, enabling deterministic $1\text{-cycle}$ arithmetic execution and uniform 5-stage instruction pipelining.
