content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/05-tensor-core-accelerators/01-tensor-core-microarchitecture/04-warp-matrix-multiply-accumulate.md
# Warp Matrix Multiply Accumulate Architecture and Cooperative Warp Tile Operations

## The Un-Coordinated Thread Coordination Barrier and Warp-Level Matrix Tile Stalls

In Single Instruction, Multiple Threads (SIMT) GPU microarchitectures, parallel processing execution is structured around **Warps**—fixed-size hardware bundles of 32 scalar threads that execute instructions in lockstep across 32 parallel execution lanes. Traditionally, each scalar thread inside a warp operates as an independent execution context: calculating its own data addresses, managing its own private registers, and executing scalar or vector arithmetic instructions (`FADD`, `FMUL`, `FMA`) independently.

When an artificial intelligence or scientific computing algorithm computes matrix multiplication ($D = A \times B + C$), the overall computation is divided into small 2D sub-matrix tiles—such as $16 \times 16$ or $16 \times 8$ matrix tiles. A $16 \times 16 \times 16$ matrix tile multiplication ($D_{16 \times 16} = A_{16 \times 16} \times B_{16 \times 16} + C_{16 \times 16}$) requires computing **$4,096\text{ Multiply-Accumulate (MAC) operations}$ (8,192 floating-point operations / FLOPs)**.

Now, consider the severe microarchitectural friction that occurs if a 32-thread warp attempts to compute a $16 \times 16$ matrix tile multiplication using traditional, un-coordinated scalar thread instructions:

```text
UN-COORDINATED SCALAR THREAD MATRIX TILE COMPUTATION (HIGH OVERHEAD)

 32 Scalar Threads Executing Independent FMA Instructions
 ┌─────────────────────────────────────────────────────────────┐
 │ Thread 0 : Computes 128 MACs using R0..R7  ──► Independent │
 │ Thread 1 : Computes 128 MACs using R0..R7  ──► Independent │
 │ ...                                                        │
 │ Thread 31: Computes 128 MACs using R0..R7  ──► Independent │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
               ▼                               ▼
       PASSES DATA THROUGH SCRATCHPAD SHARED MEMORY (SRAM)!
       (Requires 128 instruction cycles + __syncthreads() stalls!)
```

Let us trace the physical bottlenecks of un-coordinated thread execution during matrix tile computation:

1. **Intra-Warp Communication Bottleneck**:
   To compute the $16 \times 16$ matrix product, each output element $D_{i,j}$ requires inner product contributions from elements stored in *different* threads' private registers. 
   
   Because individual scalar threads cannot directly access another thread's private registers during standard scalar instructions, threads are forced to write their partial products out to Scratchpad Shared Memory (SRAM), execute a barrier synchronization (`__syncthreads()`), and read the data back into another thread's registers!
   
   This memory staging process takes **20 to 30 clock cycles per matrix step**, stalling the execution pipeline.

2. **Instruction Fetch and Decode Saturation**:
   Executing 4,096 MAC operations using 4-element SIMD vector or scalar FMA instructions requires the warp scheduler to fetch, decode, and issue **over 128 individual instructions** in sequence. 
   
   The GPU's instruction fetch and decode units burn over $80\%$ of their execution time and power handling instruction control logic rather than doing matrix math!

3. **Register File Read/Write Port Contention**:
   Issuing 128 separate scalar instructions requires 256 separate read and write accesses to the physical SIMT Register File. 
   
   The register file's read and write ports become heavily congested, starving adjacent execution units.

Look at the physical execution failure:
**32 scalar threads acting as isolated individuals cannot coordinate a warp-wide matrix tile operation efficiently!**

How do we enable all 32 threads in a warp to combine their private registers into a unified $16 \times 16$ matrix tile and execute 4,096 MAC operations as **one single, atomic, cooperative hardware instruction**?

To solve this thread coordination barrier and eliminate instruction control overheads, GPU microarchitects implement **Warp Matrix Multiply Accumulate (WMMA)** and **Cooperative Warp Tile Operations**.

---

## The 32-Member Construction Pit Crew: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Warp Matrix Multiply Accumulate (WMMA), warp-cooperative matrix operations, fragment register distribution, and atomic macro-instruction execution before inspecting gate-level hardware pipelines, PTX assembly opcodes, and warp register mapping matrices, let us consider an everyday analogy: **The 32-Member Race Car Pit Crew**.

Imagine a high-speed racing team (**A 32-Thread Hardware Warp**) tasked with lifting, servicing, and replacing 4 massive 500-pound race car tire assemblies (**A $16 \times 16$ Matrix Tile $D = A \times B + C$**).

```text
THE RACE CAR PIT CREW ANALOGY

 Strategy 1: Un-Coordinated Individual Mechanics (Scalar SIMT Model)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Mechanics work as un-coordinated individuals.            │
 │ Mechanic 0 tries to lift 500-lb tire alone ──► Fails/Stalls!│
 │ Mechanic 0 runs to tool shed to ask Mechanic 1 for help.    │
 └──────────────────────────────┬──────────────────────────────┘
  (Takes 20 minutes! Mechanics bump into each other and stall!)

 Strategy 2: The Synchronized 32-Member Team Stamping Press (WMMA Engine)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Mechanics form a synchronized circle around the car.     │
 │ Each mechanic holds 1 specific handle of a 32-arm jack.     │
 │ Pit Boss shouts ONE command: "LIFT TILE!" (WMMA Instruction)│
 └──────────────────────────────┬──────────────────────────────┘
  (All 32 mechanics lift in unison! 500-lb tire replaced in 1 SECOND!)
```

The 500-pound tire assembly is far too heavy for any single mechanic to lift alone (**A Matrix Tile is too large for 1 thread's registers**).

Let us observe two different operational strategies for how the pit crew services the car:

---

### Strategy 1: Un-Coordinated Individual Mechanics (Scalar SIMT Model)
The mechanics work as 32 isolated individuals without team coordination:

1. Mechanic 0 walks up to the car, tries to lift the 500-lb tire alone, and realizes it is too heavy (**Register Capacity Limit**).
2. Mechanic 0 drops their tools, walks across the garage to the central tool shed (**Scratchpad Shared Memory**), and leaves a written note asking Mechanic 1 for help.
3. The Pit Boss shouts: *"EVERYONE STOP WORKING AND WAIT!"* (**Static Barrier `__syncthreads()`**).
4. Mechanic 1 walks to the tool shed, reads the note, walks back to the car, and helps Mechanic 0 lift one side of the tire.

Look at the waste of time in Strategy 1:
* The 32 mechanics spend $85\%$ of their time walking back and forth to the tool shed and waiting for barriers!
* Servicing 4 tires takes **20 minutes** (**Instruction & Staging Overhead**).

---

### Strategy 2: The Synchronized 32-Member Pit Crew (Warp-Cooperative WMMA)

The Pit Boss replaces the individual system with **Cooperative Warp Stamping (WMMA)**:

The Pit Boss builds a specialized **32-Arm Hydraulic Stamping Machine (A Tensor Core MMA Engine)**.

The 500-pound tire assembly is sliced into 32 equal handles (**32 Thread Register Fragments**):
* Mechanic 0 holds Handle 0 (Fragment 0: 8 elements).
* Mechanic 1 holds Handle 1 (Fragment 1: 8 elements).
* $\dots$
* Mechanic 31 holds Handle 31 (Fragment 31: 8 elements).

```text
WARP-COOPERATIVE PIT CREW IN ACTION (WMMA MACRO-INSTRUCTION)

 Pit Boss Shouts ONE Command: "EXECUTE WMMA TILE STAMP!" (mma.sync)
                     │
                     ▼
 32 Mechanics present their 32 handles to the Hydraulic Machine at once!
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │ Mech │ Mech │ Mech │ Mech │...│ Mech │ Mech │ Mech │ Mech │
 │  31  │  30  │  29  │  28  │   │  3   │  2   │  1   │  0   │
 └──┬───┴──┬───┴──┬───┴──┬───┴───┴──┬───┴──┬───┴──┬───┴──┬───┘
    │      │      │      │          │      │      │      │
    ▼      ▼      ▼      ▼          ▼      ▼      ▼      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 32-ARM HYDRAULIC TENSOR STAMPING MACHINE                    │
 │ Reads 32 handles, executes 4,096 MACs in 1 second, and      │
 │ returns 32 result handles back to the mechanics!            │
 └─────────────────────────────────────────────────────────────┘
  (Entire 500-lb tire assembly replaced in 1 SECOND! Zero stalls!)
```

Trace how Strategy 2 operates:
1. **One Single Command**: The Pit Boss shouts **one single command** into a megaphone (**Issues `mma.sync` Macro-Instruction**): *"EXECUTE WMMA TILE STAMP!"*
2. **Cooperative Handle Presentation**: All 32 mechanics present their 32 individual handles to the hydraulic machine simultaneously.
3. **Atomic Hydraulic Execution**: The 32-arm hydraulic machine reads all 32 handles, performs the 4,096 MAC operations internally across its heavy pistons, and returns 32 result handles back to the mechanics in **1 single second**!
4. **Zero Tool Shed Walks**: Not a single mechanic walked to the tool shed (**Zero Shared Memory Usage**)! Not a single mechanic waited for a barrier (**Zero `__syncthreads()` Stalls**)!

Notice what Strategy 2 achieved:
* **$99.2\%$ Time Reduction**: The tire assembly was completed in **1 second** instead of 20 minutes!
* **Zero Tool Shed Walks**: Shared memory was completely bypassed because data was presented directly from the mechanics' hands (**Direct Register-to-Tensor-Core Transfer**).
* **100% Team Coordination**: All 32 mechanics acted as a single cohesive unit driven by 1 instruction command!

This 32-member pit crew and hydraulic machine system is the exact physical analogue of **Warp Matrix Multiply Accumulate (WMMA) and Cooperative Warp Tile Operations**:
* The 32 mechanics are **32 Scalar Threads in a Warp**.
* The 500-pound tire assembly is a **$16 \times 16$ Matrix Tile ($D = A \times B + C$)**.
* The central tool shed is **Scratchpad Shared Memory (SRAM)**.
* The 32 handles held by mechanics are **32 Thread Register Fragments**.
* The Pit Boss shouting "STAMP!" is a **Warp-Cooperative WMMA Macro-Instruction (`mma.sync`)**.
* The 32-arm hydraulic machine is a **Tensor Core MMA Engine**.

---

## Primitive 1: Warp Matrix Multiply Accumulate (WMMA)

Now that we possess a clear intuitive mental model of the 32-member pit crew and 32-arm hydraulic machine, let us examine the formal, rigorous engineering mechanics of **Warp Matrix Multiply Accumulate (WMMA)**.

In modern GPU hardware architectures (such as NVIDIA Volta, Ampere, Hopper, and Blackwell, or AMD CDNA Matrix Core architectures), matrix execution is exposed to programmers and compilers through a warp-level execution primitive called **Warp Matrix Multiply Accumulate (WMMA)**.

> **Warp Matrix Multiply Accumulate (WMMA)** is a hardware-supported software execution model and ISA instruction primitive where an entire warp of 32 scalar threads acts as a single, synchronized cooperative team to execute a matrix multiply-accumulate operation ($D_{M \times N} = A_{M \times K} \times B_{K \times N} + C_{M \times N}$) on matrix tiles distributed across the threads' private registers in a single atomic hardware cycle sequence.

```text
CUDA / PTX WMMA SOFTWARE API INTERFACE

 C++ CUDA WMMA API (nvcuda::wmma):
 1. Declare Fragment Registers:
    wmma::fragment<wmma::matrix_a, 16, 16, 16, half, wmma::row_major> a_frag;
    wmma::fragment<wmma::matrix_b, 16, 16, 16, half, wmma::col_major> b_frag;
    wmma::fragment<wmma::accumulator, 16, 16, 16, float>            c_frag;

 2. Cooperative Matrix Load from Shared/Global Memory:
    wmma::load_matrix_sync(a_frag, shared_A, 16);
    wmma::load_matrix_sync(b_frag, shared_B, 16);

 3. Cooperative Warp Matrix Multiply Accumulate (WMMA):
    wmma::mma_sync(c_frag, a_frag, b_frag, c_frag);

 4. Cooperative Matrix Store to Shared/Global Memory:
    wmma::store_matrix_sync(shared_C, c_frag, 16, wmma::mem_row_major);
```

---

### The Three Stages of a WMMA Execution Pipeline

A complete WMMA computation executes across three distinct warp-cooperative pipeline phases:

#### Phase 1: Cooperative Matrix Load (`load_matrix_sync`)
The 32 threads in the warp execute `wmma::load_matrix_sync`.
* The warp reads a $16 \times 16$ matrix tile ($256\text{ elements}$) from global DRAM or scratchpad shared SRAM.
* **Collective De-interleaving**: The hardware memory unit automatically de-interleaves the 256 matrix elements and distributes them across the private registers of all 32 threads, storing an 8-element **Fragment** inside each thread's register file!

#### Phase 2: Cooperative Matrix Multiply-Accumulate (`mma_sync` / `mma.sync`)
The 32 threads in the warp execute `wmma::mma_sync`.
* All 32 threads present their register fragments ($a\_frag, b\_frag, c\_frag$) to the SM's physical Tensor Cores simultaneously.
* The Tensor Core hardware executes the full $16 \times 16 \times 16$ matrix multiplication ($4,096\text{ MACs}$) in **1 to 4 clock cycles**.
* The updated 32-bit floating-point result fragments are written back into the threads' destination register fragments ($c\_frag$).

#### Phase 3: Cooperative Matrix Store (`store_matrix_sync`)
The 32 threads in the warp execute `wmma::store_matrix_sync`.
* The 32 threads present their updated accumulator fragments $c\_frag$.
* The memory controller collects the 32 fragments, reconstructs the continuous $16 \times 16$ matrix tile, and writes it back to shared SRAM or global DRAM in a single coalesced memory transaction!

---

## Primitive 2: Warp Register Matrix Layout (Fragment Distribution)

Now let us examine the second core primitive: **Warp Register Matrix Layout (Fragment Distribution)**.

How does a $16 \times 16$ matrix tile containing 256 floating-point numbers fit into the private registers of a 32-thread warp without causing register collisions?

This is accomplished through **Fragment Distribution Mapping**.

> **A Matrix Fragment** is a small, sub-matrix data structure containing a specific, non-overlapping subset of matrix elements assigned to a single scalar thread's private registers. The collection of all 32 thread fragments within a warp forms the complete $16 \times 16$ matrix tile.

```text
FRAGMENT DISTRIBUTION OF A 16x16 MATRIX TILE ACROSS 32 THREADS

 16x16 Matrix Tile A (256 Elements Total)
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ Thread 0     │ Thread 1     │ Thread 2     │ Thread 3     │
 │ 8 Elements   │ 8 Elements   │ 8 Elements   │ 8 Elements   │
 ├──────────────┼──────────────┼──────────────┼──────────────┤
 │ Thread 4     │ Thread 5     │ Thread 6     │ Thread 7     │
 │ 8 Elements   │ 8 Elements   │ 8 Elements   │ 8 Elements   │
 ├──────────────┼──────────────┼──────────────┼──────────────┤
 │ ...          │ ...          │ ...          │ ...          │
 ├──────────────┼──────────────┼──────────────┼──────────────┤
 │ Thread 28    │ Thread 29    │ Thread 30    │ Thread 31    │
 │ 8 Elements   │ 8 Elements   │ 8 Elements   │ 8 Elements   │
 └──────────────┴──────────────┴──────────────┴──────────────┘
  (32 Threads x 8 Elements/Thread = 256 Total Elements!)
```

---

### Mathematical Fragment Mapping Equations for a $16 \times 16$ FP16 Matrix Tile

Let us mathematically analyze how a $16 \times 16$ FP16 matrix $A$ ($256\text{ elements}$) is mapped across the 32 threads of a warp ($T_0 \dots T_{31}$).

#### 1. Fragment Size per Thread:
$$\text{Elements per Thread} = \frac{\text{Total Matrix Elements}}{\text{Warp Thread Count}} = \frac{16 \times 16}{32} = \mathbf{8 \text{ FP16 Elements per Thread}}$$

Each thread $i$ ($0 \le i < 32$) stores exactly **8 FP16 elements** (16 bytes of data) inside **four 32-bit registers** ($R_0, R_1, R_2, R_3$, packing two 16-bit FP16 floats per 32-bit register).

#### 2. Thread-to-Matrix Element Coordinates:
The 32 threads in the warp are divided into 4 quad-thread groups called **Thread Groups** ($G_0, G_1, G_2, G_3$), where each group consists of 8 threads handling 4 matrix rows:

$$\text{Group Index } G = \left\lfloor \frac{\text{Thread\_ID}}{8} \right\rfloor \quad (0 \le G < 4)$$

$$\text{Lane Index inside Group } L = \text{Thread\_ID} \pmod 8 \quad (0 \le L < 8)$$

For Thread $t$, the 8 matrix elements $A_{r,c}$ held in its private registers correspond to the exact matrix row $r$ and column $c$ calculated by:

$$\mathbf{\text{Row } r_0 = (G \cdot 4) + \left\lfloor \frac{L}{2} \right\rfloor, \quad \text{Row } r_1 = r_0 + 8}$$

$$\mathbf{\text{Column } c = (L \pmod 2) \cdot 8 + k \quad \text{for } k \in [0 \dots 7]}$$

```text
THREAD LANE REGISTER FRAGMENT MAP (16x16 MATRIX A)

 Thread ID (t) │ Group (G) │ Lane (L) │ Matrix Rows Owned (r) │ Matrix Columns Owned (c)
───────────────┼───────────┼──────────┼───────────────────────┼───────────────────────────
   Thread 0    │  Group 0  │  Lane 0  │ Rows 0 and 8          │ Columns 0..7 (8 Elements)
   Thread 1    │  Group 0  │  Lane 1  │ Rows 0 and 8          │ Columns 8..15(8 Elements)
   Thread 2    │  Group 0  │  Lane 2  │ Rows 1 and 9          │ Columns 0..7 (8 Elements)
   Thread 3    │  Group 0  │  Lane 3  │ Rows 1 and 9          │ Columns 8..15(8 Elements)
   ...         │  ...      │  ...     │ ...                   │ ...
   Thread 30   │  Group 3  │  Lane 6  │ Rows 7 and 15         │ Columns 0..7 (8 Elements)
   Thread 31   │  Group 3  │  Lane 7  │ Rows 7 and 15         │ Columns 8..15(8 Elements)
```

Look at the mathematical organization of this fragment map:
* Thread 0 owns elements $A_{0,0..7}$ and $A_{8,0..7}$ ($8\text{ elements}$).
* Thread 1 owns elements $A_{0,8..15}$ and $A_{8,8..15}$ ($8\text{ elements}$).
* Thread 31 owns elements $A_{7,8..15}$ and $A_{15,8..15}$ ($8\text{ elements}$).

Together, the 32 threads hold all $256\text{ elements}$ of Matrix $A$ with **zero overlap, zero gaps, and zero register collisions**!

---

## Hardware Assembly Opcodes: PTX `mma.sync` Instruction Variants

At the low-level Parallel Thread Execution (PTX) assembly level, Tensor Core WMMA operations are executed using the `mma.sync` instruction family.

### Syntax Anatomy of a PTX `mma.sync` Instruction

$$\mathtt{mma.sync.aligned.m16n8k16.row.col \ \ d, \ \ a, \ \ b, \ \ c}$$

```text
PTX MMA.SYNC INSTRUCTION BIT-FIELD DECODER

 Instruction Operand Fields:
 * mma.sync  : Synchronized Warp Matrix Multiply-Accumulate Opcode
 * .aligned  : Guarantees all 32 threads in warp are active & aligned
 * .m16n8k16 : Matrix Tile Dimensions (M=16, N=8, K=16)
 * .row.col  : Matrix A is Row-Major, Matrix B is Column-Major
 *  d        : Destination Register Fragment (4 x FP32 Registers per thread)
 *  a        : Source Matrix A Fragment     (4 x FP16 Registers per thread)
 *  b        : Source Matrix B Fragment     (2 x FP16 Registers per thread)
 *  c        : Accumulator Matrix C Fragment (4 x FP32 Registers per thread)
```

---

### The Three Canonical PTX Tile Variants

Depending on the neural network data format (FP16, BF16, TF32, INT8, or FP8), PTX assembly provides specific tile size variants:

```text
PTX MMA.SYNC TILE VARIANT MATRIX

 PTX Instruction Opcode    │ Input Precision │ Accumulator │ Total FLOPs / Instruction
───────────────────────────┼─────────────────┼─────────────┼───────────────────────────
 mma.sync.m16n8k16.fp16    │ FP16 (16-Bit)   │ FP32 / FP16 │ 4,096 FLOPs
 mma.sync.m16n8k32.int8    │ INT8 (8-Bit)    │ INT32       │ 8,192 Operations
 mma.sync.m16n8k64.int4    │ INT4 (4-Bit)    │ INT32       │ 16,384 Operations
 mma.sync.m16n8k32.fp8     │ FP8 (E4M3/E5M2) │ FP32        │ 8,192 FLOPs
```

#### 1. `mma.sync.m16n8k16.fp16` (Half-Precision Float):
* Multiplies $16 \times 16$ Matrix $A_{\text{FP16}}$ by $16 \times 8$ Matrix $B_{\text{FP16}}$, accumulating into $16 \times 8$ Matrix $C_{\text{FP32}}$.
* Computes $16 \times 8 \times 16 \times 2 = \mathbf{4,096 \text{ FLOPs per instruction}}$.

#### 2. `mma.sync.m16n8k32.int8` (8-Bit Quantized Integer):
* Multiplies $16 \times 32$ Matrix $A_{\text{INT8}}$ by $32 \times 8$ Matrix $B_{\text{INT8}}$, accumulating into $16 \times 8$ Matrix $C_{\text{INT32}}$.
* Computes $16 \times 8 \times 32 \times 2 = \mathbf{8,192 \text{ Operations per instruction}}$.

#### 3. `mma.sync.m16n8k64.int4` (4-Bit Quantized Integer):
* Multiplies $16 \times 64$ Matrix $A_{\text{INT4}}$ by $64 \times 8$ Matrix $B_{\text{INT4}}$, accumulating into $16 \times 8$ Matrix $C_{\text{INT32}}$.
* Computes $16 \times 8 \times 64 \times 2 = \mathbf{16,384 \text{ Operations per instruction}}$!

---

## Solved Industrial Engineering Exercise: Quantitative $16 \times 16 \times 16$ WMMA Fragment Layout, Register Port Mapping, and Throughput Analysis

To consolidate your complete mastery of Warp Matrix Multiply Accumulate (WMMA) architectures, fragment distribution mapping, PTX instruction execution, and register file bandwidth recovery, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal GPU microarchitect auditing a $2.0\text{ GHz}$ Streaming Multiprocessor (SM) ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The SM executes a $16 \times 16 \times 16$ FP16 WMMA instruction across a 32-thread warp ($W_{\text{size}} = 32$):

$$\mathtt{mma.sync.aligned.m16n16k16.row.col \ \ d, \ \ a, \ \ b, \ \ c}$$

$$\mathbf{D_{16 \times 16} = A_{16 \times 16} \times B_{16 \times 16} + C_{16 \times 16}}$$

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR WMMA SPECIFICATIONS

 Clock Frequency         : 2.0 GHz (T_clk = 500 ps)
 SM Architecture         : 4 Physical Tensor Cores serving 32-Thread Warps
 WMMA Tile Dimensions    : M=16, N=16, K=16
 Matrix A & B Precision  : FP16 (16-Bit Float, 2 Bytes/Element)
 Matrix C & D Precision  : FP32 (32-Bit Float, 4 Bytes/Element)
 Instruction Issue Cost  : 1 Clock Cycle
 Tensor Core Execution   : 2 Clock Cycles per Tile (1.00 ns)
```

#### Hardware Workload Parameters:
* Matrix $A$: $16 \times 16 = 256\text{ FP16 elements}$ ($512\text{ bytes}$).
* Matrix $B$: $16 \times 16 = 256\text{ FP16 elements}$ ($512\text{ bytes}$).
* Matrix $C$: $16 \times 16 = 256\text{ FP32 elements}$ ($1,024\text{ bytes}$).
* Matrix $D$: $16 \times 16 = 256\text{ FP32 elements}$ ($1,024\text{ bytes}$).

#### System Implementations to Compare:

* **System A (Un-Coordinated SIMD Vector Execution — Baseline)**:
  * Executes the $16 \times 16 \times 16$ tile multiply using 4-element FP32 SIMD vector instructions (`FMA_VEC4`).
  * Requires passing partial sums through Scratchpad Shared Memory SRAM ($T_{\text{smem\_latency}} = 24\text{ cycles}$).
  * Total instruction issues $= 128\text{ vector instructions}$.
* **System B (Cooperative WMMA Execution — Tensor Cores)**:
  * Executes the $16 \times 16 \times 16$ tile multiply using 1 single `mma.sync` macro-instruction.
  * Registers are presented directly to physical Tensor Cores ($0\text{ shared memory staging cycles}$).

#### Your Objective

1. Calculate the exact fragment sizes (in elements, 32-bit registers, and Bytes per thread) for Matrix $A$, Matrix $B$, Matrix $C$, and Matrix $D$ across the 32 threads of the warp in System B.
2. For Thread 13 ($\text{Thread\_ID} = 13$):
   * Calculate its Thread Group index $G$ and local Lane index $L$.
   * Identify the exact matrix rows $r$ and columns $c$ of Matrix $A$ stored inside Thread 13's private registers.
3. Calculate the total instruction issue cycles, memory staging cycles, and total execution time (in nanoseconds) for a single $16 \times 16 \times 16$ tile multiply under **System A** vs **System B**.
4. Calculate the total **Register File Read/Write Port Accesses Saved** by System B over System A.
5. Calculate the overall **Performance Speedup Factor** of System B over System A.
6. Verify mathematical, structural, and fragment mapping correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Register Fragment Allocations per Thread (System B)

32 threads in the warp ($W_{\text{size}} = 32$).

##### 1. Matrix $A$ Fragment Allocation ($16 \times 16 = 256\text{ FP16 elements}$):
$$\text{Elements per Thread}_A = \frac{256 \text{ elements}}{32 \text{ threads}} = \mathbf{8 \text{ FP16 Elements/Thread}} \quad (16 \text{ Bytes/Thread})$$

Since each 32-bit scalar register holds two packed 16-bit FP16 floats:

$$\text{32-Bit Registers per Thread}_A = \frac{8 \text{ FP16 elements}}{2 \text{ elements/register}} = \mathbf{4 \text{ 32-Bit Registers }} (R_0, R_1, R_2, R_3)$$

##### 2. Matrix $B$ Fragment Allocation ($16 \times 16 = 256\text{ FP16 elements}$):
$$\text{Elements per Thread}_B = \frac{256 \text{ elements}}{32 \text{ threads}} = \mathbf{8 \text{ FP16 Elements/Thread}} \quad (16 \text{ Bytes/Thread})$$

$$\text{32-Bit Registers per Thread}_B = \mathbf{4 \text{ 32-Bit Registers }} (R_4, R_5, R_6, R_7)$$

##### 3. Matrix $C$ & $D$ Accumulator Fragment Allocations ($16 \times 16 = 256\text{ FP32 elements}$):
$$\text{Elements per Thread}_C = \frac{256 \text{ elements}}{32 \text{ threads}} = \mathbf{8 \text{ FP32 Elements/Thread}} \quad (32 \text{ Bytes/Thread})$$

Since FP32 elements require 1 full 32-bit register each:

$$\text{32-Bit Registers per Thread}_C = \mathbf{8 \text{ 32-Bit Registers }} (R_8 \dots R_{15})$$

$$\text{32-Bit Registers per Thread}_D = \mathbf{8 \text{ 32-Bit Registers }} (R_{16} \dots R_{23})$$

```text
WARP FRAGMENT REGISTER ALLOCATION PER THREAD SUMMARY

 Matrix Operand │ Data Precision │ Total Elements/Warp │ Elements/Thread │ 32-Bit Regs/Thread
────────────────┼────────────────┼─────────────────────┼─────────────────┼────────────────────
 Matrix A       │ FP16 (16 Bits) │ 256 Elements        │ 8 FP16 Floats   │ 4 Registers (R0..R3)
 Matrix B       │ FP16 (16 Bits) │ 256 Elements        │ 8 FP16 Floats   │ 4 Registers (R4..R7)
 Matrix C (Acc) │ FP32 (32 Bits) │ 256 Elements        │ 8 FP32 Floats   │ 8 Registers (R8..R15)
 Matrix D (Out) │ FP32 (32 Bits) │ 256 Elements        │ 8 FP32 Floats   │ 8 Registers (R16..R23)
```

---

#### Step 2: Calculate Thread 13 Fragment Coordinates ($\text{Thread\_ID} = 13$)

Using the fragment group mapping formulas for a $16 \times 16$ Matrix $A$:

$$\text{Thread ID } t = 13$$

##### 1. Calculate Group Index $G$:
$$G = \left\lfloor \frac{t}{8} \right\rfloor = \left\lfloor \frac{13}{8} \right\rfloor = \mathbf{\text{Group Index } 1}$$

##### 2. Calculate Lane Index $L$ inside Group 1:
$$L = t \pmod 8 = 13 \pmod 8 = \mathbf{\text{Lane Index } 5}$$

##### 3. Calculate Matrix $A$ Rows $r_0$ and $r_1$ Owned by Thread 13:
$$r_0 = (G \cdot 4) + \left\lfloor \frac{L}{2} \right\rfloor = (1 \cdot 4) + \left\lfloor \frac{5}{2} \right\rfloor = 4 + 2 = \mathbf{\text{Row } 6}$$

$$r_1 = r_0 + 8 = 6 + 8 = \mathbf{\text{Row } 14}$$

##### 4. Calculate Matrix $A$ Columns $c$ Owned by Thread 13:
$$L \pmod 2 = 5 \pmod 2 = 1 \implies \text{Column Offset} = 1 \cdot 8 = 8$$

$$\text{Columns } c = 8 + k \quad \text{for } k \in [0 \dots 7] \implies \mathbf{\text{Columns } 8, 9, 10, 11, 12, 13, 14, 15}$$

```text
THREAD 13 MATRIX A FRAGMENT MAPPING

 Thread 13 Location   : Group 1, Lane 5
 Matrix Rows Owned    : Row 6 and Row 14
 Matrix Columns Owned : Columns 8, 9, 10, 11, 12, 13, 14, 15
 Elements Stored      : A[6, 8..15] (4 FP16 Floats) + A[14, 8..15] (4 FP16 Floats)
 Total Elements       : 8 FP16 Elements in Registers R0, R1, R2, R3!
```

Thread 13 holds elements $A_{6,8..15}$ and $A_{14,8..15}$ ($8\text{ elements}$) in registers $R_0, R_1, R_2, R_3$.

---

#### Step 3: Calculate Execution Time (System A vs System B)

Total MAC operations $= 16 \times 16 \times 16 = \mathbf{4,096 \text{ MACs}}$ ($8,192\text{ FLOPs}$).

##### 1. System A (Un-Coordinated SIMD Vector Execution):
* Requires 128 SIMD vector instructions (4-element FMA vectors).
* Issue Time $= 128\text{ clock cycles}$.
* Memory Staging Time: 16 intermediate shared memory writes (`STS`) + 16 shared memory reads (`LDS`) + 1 barrier (`__syncthreads()`):

$$T_{\text{smem\_A}} = (16 \times 12 \text{ cycles}) + 30 \text{ barrier} + (16 \times 12 \text{ cycles}) = 192 + 30 + 192 = \mathbf{414 \text{ Clock Cycles}}$$

$$T_{\text{total\_A}} = 128 \text{ issue cycles} + 414 \text{ smem cycles} = \mathbf{542 \text{ Clock Cycles}}$$

$$T_{\text{time\_A}} = 542 \text{ cycles} \times 0.500 \text{ ns/cycle} = \mathbf{271.0 \text{ nanoseconds}}$$

##### 2. System B (Cooperative WMMA Tensor Core Execution):
* Requires **1 single `mma.sync` macro-instruction**.
* Issue Time $= 1\text{ clock cycle}$.
* Tensor Core Hardware Execution Time $= 2\text{ clock cycles}$.
* Memory Staging Time $= \mathbf{0 \text{ Clock Cycles}}$ (Registers presented directly to Tensor Core!).

$$T_{\text{total\_B}} = 1 \text{ issue cycle} + 2 \text{ execution cycles} = \mathbf{3 \text{ Clock Cycles}}$$

$$T_{\text{time\_B}} = 3 \text{ cycles} \times 0.500 \text{ ns/cycle} = \mathbf{1.50 \text{ nanoseconds}}$$

---

#### Step 4: Calculate Register File Accesses Saved & Speedup Factor

##### 1. Register File Accesses Saved:
* System A executed 128 SIMD vector instructions $\implies$ 128 read accesses + 128 write accesses $= \mathbf{256 \text{ Register File Accesses}}$.
* System B executed 1 `mma.sync` macro-instruction $\implies \mathbf{1 \text{ Register File Access}}$ (parallel quad-register load).

$$\text{Register Accesses Saved} = 256 - 1 = \mathbf{255 \text{ Register Accesses Saved!}} \quad (\mathbf{99.61\% \text{ Reduction!}})$$

##### 2. Calculate Overall Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{time\_A}}}{T_{\text{time\_B}}} = \frac{271.0\text{ ns}}{1.50\text{ ns}} = \frac{542\text{ cycles}}{3\text{ cycles}} \approx \mathbf{180.67\times \text{ Performance Advantage!}}$$

```text
WMMA COOPERATIVE TILE PERFORMANCE OPTIMIZATION SUMMARY

 System Architecture     │ Instruction Issues │ Memory Staging Cycles │ Total Time (ns) │ Speedup Factor
─────────────────────────┼────────────────────┼───────────────────────┼─────────────────┼───────────────────
 System A (Un-Coordinated)│ 128 Instructions   │ 414 Cycles (Shared)   │ 271.00 ns       │ 1.00x (Baseline)
 System B (Cooperative)  │   1 Instruction    │   0 Cycles (Direct!)  │   1.50 ns       │ 180.67x FASTER!
                         │ (99.2% Inst Cut!)  │ (100% Staging Saved!) │ (269.5 ns Saved)│ (+17,967% Gain)
```

##### Engineering Conclusion:
By organizing the 32 threads into a warp-cooperative team executing 1 single `mma.sync` macro-instruction, System B eliminated $100\%$ of shared memory staging stalls and $99.61\%$ of register file accesses, reducing $16 \times 16 \times 16$ tile execution time from $271.00\text{ ns}$ down to $1.50\text{ ns}$—delivering a **$180.67\times$ performance speedup ($17,967\%$ throughput gain)**!

---

### Sanity Check and Verification

Let us verify our mathematical, fragment mapping, and register access results against WMMA GPU microarchitecture principles:

1. **Fragment Element Sum Check**:
   * Matrix $A$: 32 threads $\times 8\text{ FP16 elements/thread} = 256\text{ elements}$.
   * Matrix $B$: 32 threads $\times 8\text{ FP16 elements/thread} = 256\text{ elements}$.
   * Matrix $C$: 32 threads $\times 8\text{ FP32 elements/thread} = 256\text{ elements}$.
   * Matrix $D$: 32 threads $\times 8\text{ FP32 elements/thread} = 256\text{ elements}$.
   * All four $16 \times 16$ matrix tiles ($256\text{ elements}$ each) are $100\%$ accounted for!
2. **Thread 13 Coordinate Verification**:
   * Thread 13: Group 1, Lane 5.
   * $r_0 = (1 \cdot 4) + \lfloor 5/2 \rfloor = 4 + 2 = 6$.
   * $r_1 = 6 + 8 = 14$.
   * $c = (5 \pmod 2) \cdot 8 + k = 8 + k \implies \text{Columns } 8..15$.
   * Thread 13's fragment coordinates $A_{6,8..15}$ and $A_{14,8..15}$ verified with $100\%$ precision!
3. **Execution Speedup Math Check**:
   * System A: 128 issue cycles + 414 smem cycles $= 542\text{ cycles}$.
   * System B: 1 issue cycle + 2 execution cycles $= 3\text{ cycles}$.
   * Speedup $= 542 / 3 = 180.67\times$. Math is $100\%$ exact.

All thread fragment indexing equations, PTX `mma.sync` matrix tile dimensions ($M \times N \times K$), register file port savings, and 180.67x execution speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Warp Matrix Multiply Accumulate (WMMA)**: A hardware-supported execution model and ISA primitive (`mma.sync`) where all 32 threads in a warp act as a single cooperative team to execute a matrix tile operation ($D_{M \times N} = A_{M \times K} \times B_{K \times N} + C_{M \times N}$) in 1 to 4 clock cycles, eliminating scalar instruction decode overheads.
* **Warp Register Matrix Layout (Fragment Distribution)**: The microarchitectural data layout where $16 \times 16$ or $16 \times 8$ matrix tiles are partitioned into 8-element sub-fragments distributed across the private registers of 32 warp threads, allowing direct register-to-tensor-core execution with zero shared memory staging overhead.
