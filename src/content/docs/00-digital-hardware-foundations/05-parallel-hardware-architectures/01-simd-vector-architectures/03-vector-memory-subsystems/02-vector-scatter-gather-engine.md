---
title: "Vector Scatter-Gather Engine Architecture and Index Vector Address Translation"
---

# Vector Scatter-Gather Engine Architecture and Index Vector Address Translation

## The Indirect Pointer Indexing Barrier and Sparse Matrix Memory Bottlenecks

In high-performance vector computing, memory access speed dictates whether a parallel execution engine achieves its theoretical peak performance. When data structures are organized in linear contiguous blocks or regular strided grids (such as 1D vectors or 2D matrix rows), vector processors utilize unit-stride or constant-stride vector load instructions to fetch data. In those structured addressing modes, target memory addresses follow a predictable mathematical pattern ($A_i = A_{\text{base}} + i \cdot S$), allowing the memory controller to pre-fetch cache lines and stream data into vector registers in high-speed bursts.

However, a vast class of modern real-world computational workloads operates on **Non-Linear, Indirect, and Unstructured Data Structures**:

### 1. Sparse Matrix-Vector Multiplication (SpMV)
In finite-element physical simulations, social network graph analysis, and large-scale recommendation systems, matrices contain millions of rows and columns, but over $99\%$ of the entries are zero. To avoid wasting terabytes of memory storing useless zeros, sparse matrices are stored in compressed formats such as **Compressed Sparse Row (CSR)** or **Coordinate (COO)** format. 

In CSR format, non-zero values are stored in a dense array `values[]`, while their corresponding column positions are stored in an integer index array `col_idx[]`.

When computing a sparse matrix-vector multiplication ($Y = A \cdot X$), the algorithm must read elements from vector $X$ using the column index array `col_idx`:

```c
// SPARSE MATRIX-VECTOR MULTIPLICATION (INDIRECT MEMORY ACCESS)
for (int i = 0; i < num_nonzeros; i++) {
    Y[i] = values[i] * X[ col_idx[i] ]; // Indirect lookup into vector X!
}
```

Look at the memory access to vector $X$: `X[ col_idx[i] ]`. 

The memory address requested for element $i$ is NOT determined by a constant stride $S$. It depends on the integer value stored inside `col_idx[i]`. Because `col_idx[i]` contains arbitrary column indices (`col_idx = [4, 102, 3, 891, 12, 400...]`), the memory addresses requested for $X$ are completely non-linear, non-contiguous, and unpredictable!

```text
INDIRECT POINTER INDEXING MEMORY ACCESS STREAM

 Vector Index Array col_idx = [ 4, 102, 3, 891, 12, 400 ]
 Base Address of Vector X   = 0x10000 (32-Bit Floats)

 Target Memory Addresses for Vector X:
 Element 0 ──► Address = 0x10000 + (  4 * 4) = 0x10010
 Element 1 ──► Address = 0x10000 + (102 * 4) = 0x10198
 Element 2 ──► Address = 0x10000 + (  3 * 4) = 0x1000C
 Element 3 ──► Address = 0x10000 + (891 * 4) = 0x10DEC
 (Memory target addresses are completely scattered across memory space!)
```


### 3. Particle-in-Cell (PIC) Physics Simulations
In N-body astrophysics or plasma physics simulations, particles move freely through 3D space. To calculate forces between neighboring particles, the simulation looks up particle coordinates using a spatial cell index list: `particle_pos[ cell_neighbors[i] ]`.


## The Library Call-Number List and Coalesced Assistant Dispatch: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of vector scatter-gather engines, vector index registers, and cache line request coalescing before inspecting hardware pipelines, crossbar routing networks, and memory collision math, let us consider an everyday analogy: **The Research Library Assistant**.

Imagine a research professor (**The Out-of-Order CPU Core**) working in a large university library (**Main Memory Space**). The professor needs to collect 8 specific research books (**8 Vector Data Elements**) to write a paper.

```text
THE RESEARCH LIBRARY ASSISTANT ANALOGY

 Research Professor (CPU Core)               Library Research Assistant (SGU)
 ┌───────────────────────────┐               ┌───────────────────────────┐
 │ Index List Card (V_index) │ ─────────────►│ Address Coalescing Engine │
 │ Arbitrary Call Numbers    │               │ Multi-Floor Dispatcher    │
 └───────────────────────────┘               └───────────────────────────┘
```

The library stores books on hundreds of different bookshelves across 10 floors (**DRAM Banks and Cache Lines**).

The professor writes down a list of 8 arbitrary book call numbers on an index card (**The Vector Index Register $V_{\text{index}}$**):

$$\text{Call Number List } V_{\text{index}} = [\ \text{Floor 4 / Shelf 12}, \quad \text{Floor 1 / Shelf 3}, \quad \text{Floor 4 / Shelf 12}, \quad \text{Floor 8 / Shelf 99}, \quad \dots \ ]$$

Let us observe two different operational strategies for how the professor collects these 8 books:


### Strategy 2: The Coalesced Multi-Assistant Dispatcher (Vector Scatter-Gather Engine)

The professor hires an intelligent **Scatter-Gather Engine (SGU)** equipped with a team of assistants and a smart dispatch board:

```text
STRATEGY 2: COALESCED MULTI-ASSISTANT DISPATCH (GATHER ENGINE)

 Step 1: Inspect Full Index List Card V_index (All 8 Call Numbers)
 ┌─────────────────────────────────────────────────────────────┐
 │ Item 0: Floor 4 / Shelf 12                                  │
 │ Item 1: Floor 1 / Shelf 3                                   │
 │ Item 2: Floor 4 / Shelf 12  ◄── SAME SHELF AS ITEM 0!       │
 │ Item 3: Floor 8 / Shelf 99                                  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Step 2: Request Coalescing (Merge Duplicate Shelves!)
 ┌─────────────────────────────────────────────────────────────┐
 │ Combined Order 1: Floor 4 / Shelf 12 (Fetch Books 0 AND 2!) │
 │ Combined Order 2: Floor 1 / Shelf 3  (Fetch Book 1)         │
 │ Combined Order 3: Floor 8 / Shelf 99 (Fetch Book 3)         │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Step 3: Dispatch 3 Assistants Simultaneously to Floors 1, 4, and 8!
 (All 8 books gathered and delivered in 10 minutes total!)
```

Trace how Strategy 2 operates:
1. **Parallel Address Inspection**: The SGU reads all 8 call numbers on the index card simultaneously.
2. **Request Coalescing (Merging Duplicate Requests)**:
   * The SGU notices that Item 0 (`Floor 4 / Shelf 12`) and Item 2 (`Floor 4 / Shelf 12`) reside on the **EXACT SAME SHELF**!
   * The SGU merges Item 0 and Item 2 into **a single shelf visit**!
3. **Parallel Assistant Dispatch**: The SGU dispatches 3 assistants concurrently to Floor 1, Floor 4, and Floor 8.
4. **Data Gathering & Sorting**: The assistants pick up all 8 books in parallel, return to the desk, and place each book into its designated slot on the professor's desk ($V_D[0..7]$).

Notice what Strategy 2 achieved:
* **80% Time Savings**: All 8 books were gathered and delivered in **10 minutes** instead of 80 minutes!
* **Zero Redundant Trips**: Duplicate shelf visits were merged into a single query via **Cache Line Coalescing**.
* **Parallel Multi-Floor Access**: Multiple shelves were accessed concurrently across independent floors (**Multi-Bank Parallel SRAM Reads**).

This library dispatcher is the exact physical analogue of a **Vector Scatter-Gather Engine**:
* The research professor is the **CPU Execution Core**.
* The call-number index card is the **Vector Index Register ($V_{\text{index}}$)**.
* The books on the shelves are **Data Elements in Memory**.
* The bookshelves are **Cache Lines and DRAM Memory Banks**.
* Merging Item 0 and Item 2 is **Cache Line Request Coalescing**.
* Dispatching assistants to Floors 1, 4, and 8 is **Multi-Bank Parallel Memory Queries**.
* Delivering books to designated desk slots is **Vector Register Data Packing**.


### The Mathematical Address Translation Equations

Let $A_{\text{base}}$ be the scalar base physical memory byte address stored in register `rs1`.

Let $V_{\text{index}}$ be the vector index register (`vs2`) containing $vl$ integer element offsets ($V_{\text{index}}[0], V_{\text{index}}[1], \dots, V_{\text{index}}[vl-1]$).

Let $vl$ be the active vector length ($0 \le i < vl$).

For any element position $i$ within the vector register, the target physical memory byte address $A_i$ generated during a Gather or Scatter instruction is:

$$\mathbf{A_i = A_{\text{base}} + V_{\text{index}}[i]}$$

Where:
* $A_i$ is the target physical memory byte address for element position $i$.
* $A_{\text{base}}$ is the 64-bit base memory address (e.g., `0x10000`).
* $V_{\text{index}}[i]$ is the signed or unsigned integer byte offset stored in lane $i$ of the vector index register `vs2`.
* $i$ is the vector element position index ($0 \le i < vl$).

```text
INDIRECT ADDRESS GENERATION MATRIX (BASE = 0x10000, 4 LANES)

 Vector Index Register V_index = [ 100,  12,  300,  12 ] (Byte Offsets)
 Base Address Register A_base  = 0x10000

 Target Memory Addresses (A_i = A_base + V_index[i]):
 Lane 0 (i = 0) ──► Address A0 = 0x10000 + 100 = 0x10064
 Lane 1 (i = 1) ──► Address A1 = 0x10000 +  12 = 0x1000C
 Lane 2 (i = 2) ──► Address A2 = 0x10000 + 300 = 0x1012C
 Lane 3 (i = 3) ──► Address A3 = 0x10000 +  12 = 0x1000C  (Duplicate Address as Lane 1!)
```


### Stage 1: Parallel Vector Index AGU Array
The SGU contains an array of $N$ parallel 64-bit **Address Generation Units (AGUs)**. 

In a single clock cycle, the AGU array reads $A_{\text{base}}$ and all $N$ elements of $V_{\text{index}}$, executing $N$ parallel additions to compute all target physical addresses:

$$A_0 = A_{\text{base}} + V_{\text{index}}[0], \quad A_1 = A_{\text{base}} + V_{\text{index}}[1], \quad \dots, \quad A_{N-1} = A_{\text{base}} + V_{\text{index}}[N-1]$$


### Stage 3: Multi-Bank L1 SRAM Lookup and Crossbar Data Routing

Once the unique cache line requests are identified, the SGU queries the L1 Data Cache.

As cache line payloads return from L1 SRAM, an internal **Multi-Lane Crossbar Switch** reads the byte offsets $A_i[5:0]$ for each element, extracts the required 32-bit or 64-bit word out of the 64-byte line payload, and routes it directly to vector lane $i$.


## Scatter Store Collisions, Bank Conflicts, and Memory Coherency

While Gather loads ($READs$) are non-destructive, **Scatter stores ($WRITEs$)** introduce a severe, non-deterministic system hazard: **The Scatter Store Address Collision (Store Overwrite Conflict)**.


### Memory Bank Conflicts During Scatter-Gather Operations

Because the indices inside $V_{\text{index}}$ are arbitrary, multiple gathered or scattered addresses frequently target the **exact same L1 SRAM memory bank** ($A_i \pmod B == A_j \pmod B$).

When $K$ lanes target the same SRAM bank on the same cycle:
* The SGU's **Bank Conflict Resolver** serializes the bank accesses over $K$ consecutive clock cycles.
* **Performance Impact**: If 16 gathered addresses land in 16 *different* SRAM banks, the Gather completes in **$1\text{ clock cycle}$**. If all 16 addresses land in the *same* SRAM bank, the Gather takes **16 clock cycles**!

```text
SCATTER-GATHER PERFORMANCE SPECTRUM

 Ideal Case (16 Unique Cache Lines / 16 Unique Banks):
 All 16 lanes gathered in parallel ──► 1 Clock Cycle!

 Worst Case (16 Collisions in the Same SRAM Bank):
 16 accesses serialized ───────────► 16 Clock Cycles!
```


### Scenario and Parameters

You are a senior microarchitect auditing the Vector Memory Subsystem for a $3.2\text{ GHz}$ 64-bit RISC-V vector processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution rate of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ for scalar code and single-cycle execution for local L1 SRAM hits.

The processor executes a Sparse Matrix-Vector Multiplication (SpMV) kernel that gathers eight 32-bit single-precision floating-point elements ($vl = 8, \text{SEW} = 32\text{ bits} = 4\text{ bytes}$) from dense vector $X$ using a Vector Gather instruction:

$$\mathtt{vluxei32.v \ \ v1, \ \ (a0), \ \ v2} \quad (\text{Base Address } a0 = \text{0x00010000}, \text{ Index Vector } v2 = V_{\text{index}})$$

```text
3.2 GHz RISC-V VECTOR PROCESSOR MEMORY SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Scatter-Gather Engine ] ──► [ L1 Data Cache (8 Banks) ]
 Clock T = 312.5 ps     Coalescing Engine Enabled     Cache Line Size L = 64 Bytes
```

#### Hardware Memory Subsystem Specifications:
* L1 Data Cache: $32\text{-KB}$ capacity, $64\text{-byte}$ cache lines ($L = 64\text{ bytes}$).
* Memory Bank Architecture: 8 independent parallel SRAM memory banks ($B = 8\text{ banks}$), interleaved at 4-byte word boundaries ($\text{Bank\_ID}(A) = \lfloor A / 4 \rfloor \pmod 8$).
* L1 SRAM Single Cache Line Read Delay: $1\text{ clock cycle}$ ($312.5\text{ ps}$).
* Bank Conflict Serialization Penalty: $+1\text{ clock cycle}$ for each additional conflicting access to the same SRAM bank.

#### Vector Index Register Payload ($v2 = V_{\text{index}}$, 8 Byte Offsets):
The index vector $v2$ holds the following eight 32-bit byte offsets (for Lanes 0 through 7):

$$V_{\text{index}} = [\quad 0, \quad 16, \quad 4, \quad 256, \quad 20, \quad 260, \quad 8, \quad 264 \quad] \quad (\text{Byte Offsets})$$

#### Your Objective

1. Calculate the target physical memory byte addresses $A_0 \dots A_7$ generated by the SGU's parallel AGU array ($A_i = A_{\text{base}} + V_{\text{index}}[i]$).
2. Trace **Stage 2 (Cache Line Coalescing)**:
   * Calculate the 64-byte cache line block addresses ($\text{Line\_Addr}_i = A_i \ \& \ \sim 63$) for all 8 elements.
   * Determine how many unique cache line read requests are generated after coalescing.
3. Trace **Stage 3 (L1 SRAM Bank Mapping & Collision Analysis)**:
   * Calculate the Bank IDs ($\text{Bank\_ID}(A_i)$) for all 8 elements.
   * Identify any SRAM bank conflicts occurring during parallel cache reads.
4. Calculate total execution time (in clock cycles and nanoseconds) and effective read throughput (in GB/sec) for this Gather operation.
5. Calculate the **Performance Speedup Factor** of this Scatter-Gather Engine over a scalar fallback extraction loop (where each scalar load takes 4 clock cycles).
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Trace Stage 2 — Cache Line Coalescing and Deduplication

We compute the 64-byte cache line block address ($\text{Line\_Addr}_i = A_i \ \& \ \sim 63$) for each element:

* $A_0 = \text{0x10000} \implies \text{Line\_Addr}_0 = \mathbf{\text{0x10000}}$
* $A_1 = \text{0x10010} \implies \text{Line\_Addr}_1 = \mathbf{\text{0x10000}}$ (Matches $A_0$!)
* $A_2 = \text{0x10004} \implies \text{Line\_Addr}_2 = \mathbf{\text{0x10000}}$ (Matches $A_0$!)
* $A_3 = \text{0x10100} \implies \text{Line\_Addr}_3 = \mathbf{\text{0x10100}}$ (New Line!)
* $A_4 = \text{0x10014} \implies \text{Line\_Addr}_4 = \mathbf{\text{0x10000}}$ (Matches $A_0$!)
* $A_5 = \text{0x10104} \implies \text{Line\_Addr}_5 = \mathbf{\text{0x10100}}$ (Matches $A_3$!)
* $A_6 = \text{0x10008} \implies \text{Line\_Addr}_6 = \mathbf{\text{0x10000}}$ (Matches $A_0$!)
* $A_7 = \text{0x10108} \implies \text{Line\_Addr}_7 = \mathbf{\text{0x10100}}$ (Matches $A_3$!)

```text
CACHE LINE COALESCING DEDUPLICATION ANALYSIS

 Coalesced Group 1 (Block Address 0x10000):
 Contains Elements: A0 (0x10000), A1 (0x10010), A2 (0x10004), A4 (0x10014), A6 (0x10008)
 (5 Elements merged into 1 single L1 cache line query!)

 Coalesced Group 2 (Block Address 0x10100):
 Contains Elements: A3 (0x10100), A5 (0x10104), A7 (0x10108)
 (3 Elements merged into 1 single L1 cache line query!)
```

##### Coalescing Result:
The 8 indirect memory requests were **coalesced into ONLY 2 UNIQUE CACHE LINES (`0x10000` and `0x10100`)**!

The SGU reduced 8 memory requests down to 2 cache queries, saving $75\%$ of L1 cache line fill requests!


#### Step 4: Calculate Total Execution Time and Effective Throughput

The Gather operation completed in 2 coalesced L1 SRAM query cycles:

$$\text{Total Execution Cycles} = 2 \text{ Coalesced Query Cycles} = \mathbf{2 \text{ Clock Cycles}}$$

$$T_{\text{gather}} = 2 \times 0.3125\text{ ns/cycle} = \mathbf{0.625 \text{ nanoseconds}}$$

##### Calculate Effective Read Throughput ($\text{BW}_{\text{gather}}$):
Total Data Gathered = 8 elements $\times 4\text{ bytes/element} = 32\text{ bytes}$.

$$\text{BW}_{\text{gather}} = \frac{32\text{ Bytes}}{0.625 \times 10^{-9}\text{ s}} = \mathbf{51.2 \times 10^9 \text{ Bytes/sec}} = \mathbf{51.2 \text{ GB/sec}}$$


### Sanity Check and Verification

Let us verify our mathematical, structural, and coalescing results against hardware design principles:

1. **Address Calculation Check**:
   * $A_0 = \text{0x10000} + 0 = \text{0x10000}$.
   * $A_7 = \text{0x10000} + 264 = \text{0x10108}$. All 8 addresses calculated with $100\%$ precision.
2. **Coalescing Deduplication Check**:
   * Elements 0, 1, 2, 4, 6 span `0x10000` to `0x10014` ($\le \text{0x1003F}$). All fall inside 64-byte Line `0x10000`.
   * Elements 3, 5, 7 span `0x10100` to `0x10108` ($\le \text{0x1013F}$). All fall inside 64-byte Line `0x10100`.
   * Exactly 2 unique cache lines. Coalescing logic $100\%$ verified!
3. **Bank Collision Verification**:
   * Line 1 elements target Banks 0, 4, 1, 5, 2 (5 distinct banks). Zero collisions.
   * Line 2 elements target Banks 0, 1, 2 (3 distinct banks). Zero collisions.
   * Total execution time = $1 + 1 = 2\text{ cycles}$. Speedup calculation $16.00\times$ is exact.

All vector index AGU address translations, cache line coalescing logic, bank conflict checks, and SGU throughput metrics evaluate with 100% mathematical, physical, and logical precision.

