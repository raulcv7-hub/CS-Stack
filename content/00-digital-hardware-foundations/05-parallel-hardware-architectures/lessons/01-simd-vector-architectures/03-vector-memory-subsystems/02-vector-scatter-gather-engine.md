content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/01-simd-vector-architectures/03-vector-memory-subsystems/02-vector-scatter-gather-engine.md
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

---

### 2. Graph Traversal and Hash Tables (Breadth-First Search)
In graph processing algorithms (such as PageRank or Breadth-First Search), traversing outgoing edges requires reading node states through an indirect edge pointer array: `node_state[ edge_list[i] ]`.

---

### 3. Particle-in-Cell (PIC) Physics Simulations
In N-body astrophysics or plasma physics simulations, particles move freely through 3D space. To calculate forces between neighboring particles, the simulation looks up particle coordinates using a spatial cell index list: `particle_pos[ cell_neighbors[i] ]`.

---

### The Scalar Extraction Bottleneck for Indirect Accesses

If a vector processor lacks specialized hardware for indirect memory access, a software developer attempting to vectorize `Y[i] = values[i] * X[col_idx[i]]` encounters the **Scalar Extraction Bottleneck**:

```text
SCALAR EXTRACTION LOOP FOR INDIRECT INDEXING (NO GATHER HARDWARE)

 Iteration 0 : Read Scalar Index col_idx[0] ──► Read Scalar X[col_idx[0]] ──► Insert to V1[0]
 Iteration 1 : Read Scalar Index col_idx[1] ──► Read Scalar X[col_idx[1]] ──► Insert to V1[1]
 Iteration 2 : Read Scalar Index col_idx[2] ──► Read Scalar X[col_idx[2]] ──► Insert to V1[2]
  :
 Iteration N : Read Scalar Index col_idx[N] ──► Read Scalar X[col_idx[N]] ──► Insert to V1[N]
 (Paid dozens of sequential instruction cycles to fill ONE vector register!)
```

To assemble a single vector register containing 16 elements gathered from non-linear addresses, the CPU must fall back to a scalar loop:
1. Read index 0 from `col_idx[0]`. Calculate address $A_0 = A_{\text{base}} + \text{col\_idx}[0] \times 4$. Load scalar word $X_0$. Insert into vector lane 0.
2. Read index 1 from `col_idx[1]`. Calculate address $A_1 = A_{\text{base}} + \text{col\_idx}[1] \times 4$. Load scalar word $X_1$. Insert into vector lane 1.
3. Repeat 16 times in series...

This scalar fallback loop takes **40 to 80 sequential clock cycles** just to gather data into one vector register! The vector execution engine sits completely frozen, forfeiting all parallel hardware throughput.

How can a vector processor accept a vector register containing arbitrary, non-linear index offsets ($V_{\text{index}}$), calculate all target memory addresses in parallel, merge duplicate requests targeting the same cache line, and gather the non-contiguous data elements into a destination vector register in a single instruction?

To solve this problem, vector architectures implement **Vector Scatter-Gather Engines** and **Index Vector Address Translation**.

---

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

---

### Strategy 1: The Single-Assistant Sequential Walk (Scalar Extraction Loop)
The professor hires one library assistant who processes the call-number list strictly line-by-line:

1. Assistant reads Item 1 on the list (`Floor 4 / Shelf 12`). Assistant walks to Floor 4, gets the book, walks all the way back to the professor's desk, and drops it off (takes 10 minutes).
2. Assistant reads Item 2 on the list (`Floor 1 / Shelf 3`). Assistant walks to Floor 1, gets the book, walks back to the desk, and drops it off (takes 10 minutes).
3. Assistant reads Item 3 on the list (`Floor 4 / Shelf 12`). Notice that Item 3 is on the **EXACT SAME SHELF (Floor 4 / Shelf 12)** that the assistant just visited 10 minutes ago during Item 1!
   * But because the assistant processes the list blindly line-by-line, the assistant **walks ALL THE WAY BACK to Floor 4 / Shelf 12 a second time**!

```text
STRATEGY 1: SEQUENTIAL WALK (INEFFICIENT & REDUNDANT)

 Item 1: Walk to Floor 4 / Shelf 12 ──► Return to Desk (10 Mins)
 Item 2: Walk to Floor 1 / Shelf 3  ──► Return to Desk (10 Mins)
 Item 3: Walk to Floor 4 / Shelf 12 ──► Return to Desk (10 Mins - REDUNDANT TRIP!)
 (Spent 80 minutes walking and making redundant trips for the same shelf!)
```

Look at the waste of time:
* The assistant spent **80 minutes** making 8 separate trips.
* The assistant made redundant trips to Floor 4 for books that were sitting right next to each other on the exact same shelf!

---

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

---

## Primitive 1: Vector Gather and Scatter Instructions

Now that we possess a clear intuitive mental model of the library call-number list and coalesced assistant dispatch, let us examine the formal, rigorous engineering mechanics of **Vector Gather and Scatter Instructions**.

Vector architectures support two complementary indirect memory instructions:
1. **Vector Gather (Indirect Load: `vluxei32.v`)**: Reads non-contiguous memory elements from arbitrary addresses specified by an index vector and packs them into a destination vector register.
2. **Vector Scatter (Indirect Store: `vsoxei32.v`)**: Takes elements from a source vector register and writes them out to non-contiguous memory addresses specified by an index vector.

```text
VECTOR GATHER AND SCATTER INSTRUCTION ASSEMBLY INTERFACE

 Vector Gather (Indirect Load):
 vluxei32.v  vd,  (rs1),  vs2,  vm
              │     │      │     │
              │     │      │     └── Predicate Mask vm
              │     │      └──────── Vector Index Register vs2 (Offsets)
              │     └─────────────── Scalar Base Address Register rs1
              └───────────────────── Destination Vector Register vd

 Vector Scatter (Indirect Store):
 vsoxei32.v  vs3, (rs1),  vs2,  vm
              │     │      │     │
              │     │      │     └── Predicate Mask vm
              │     │      └──────── Vector Index Register vs2 (Offsets)
              │     └─────────────── Scalar Base Address Register rs1
              └───────────────────── Source Vector Register vs3 (Payload Data)
```

---

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

---

## Primitive 2: The Scatter-Gather Engine (SGU) Architecture

Now let us examine the internal hardware architecture of the **Scatter-Gather Engine (SGU)** that processes these indirect addresses.

An integrated Scatter-Gather Engine consists of four primary hardware sub-units working in a synchronized memory execution pipeline:

```text
SCATTER-GATHER ENGINE (SGU) HARDWARE PIPELINE

 Base Address A_base [63:0]         Vector Index Register V_index
          │                                      │
          ▼                                      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STAGE 1: PARALLEL VECTOR INDEX AGU ARRAY                    │
 │ Calculates A_i = A_base + V_index[i] for all active lanes   │
 └─────────────┬───────────────────────────────────────────────┘
               │ 16 Non-Linear Addresses
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STAGE 2: CACHE LINE COALESCING & DEDUPLICATION ENGINE       │
 │ Identifies duplicate cache lines; merges matching queries    │
 └─────────────┬───────────────────────────────────────────────┘
               │ Unique Coalesced Cache Line Requests
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STAGE 3: MULTI-BANK L1 SRAM LOOKUP & CROSSBAR ROUTING       │
 │ Fetches cache lines from L1 SRAM banks; extracts byte words │
 └─────────────┬───────────────────────────────────────────────┘
               │ Extracted Data Payload Elements
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STAGE 4: DESTINATION VECTOR REGISTER PACKING                │
 │ Writes gathered data into vd[i] or stores vs3[i] to memory  │
 └─────────────────────────────────────────────────────────────┘
```

Let us dissect the hardware mechanics of each stage inside the SGU:

---

### Stage 1: Parallel Vector Index AGU Array
The SGU contains an array of $N$ parallel 64-bit **Address Generation Units (AGUs)**. 

In a single clock cycle, the AGU array reads $A_{\text{base}}$ and all $N$ elements of $V_{\text{index}}$, executing $N$ parallel additions to compute all target physical addresses:

$$A_0 = A_{\text{base}} + V_{\text{index}}[0], \quad A_1 = A_{\text{base}} + V_{\text{index}}[1], \quad \dots, \quad A_{N-1} = A_{\text{base}} + V_{\text{index}}[N-1]$$

---

### Stage 2: Cache Line Coalescing and Deduplication Engine

This is the most critical performance optimization inside the Scatter-Gather Engine.

Although the $N$ generated addresses $A_0 \dots A_{N-1}$ are non-linear, many of these addresses frequently fall within the **exact same 64-byte cache line**!

For example, suppose $A_1 = \text{0x1000C}$ and $A_3 = \text{0x1001C}$. Both addresses belong to the 64-byte cache line spanning `0x10000` through `0x1003F`.

#### The Coalescing Logic Algorithm:
1. The SGU extracts the 64-byte cache line block address for every element:

$$\text{Line\_Addr}_i = A_i \quad \mathbf{\text{AND}} \quad \sim 63$$

2. An $N \times N$ **Content-Addressable Parallel Comparator Matrix** compares all $\text{Line\_Addr}_i$ values against each other in $1\text{ clock cycle}$.
3. **Deduplication**: If 16 generated addresses target only 3 unique 64-byte cache lines, the Coalescing Engine **reduces 16 memory requests down to 3 unique L1 cache queries**!
4. The memory controller issues 3 cache line reads to the L1 SRAM array instead of 16, saving $81.25\%$ of L1 cache access bandwidth!

```text
CACHE LINE REQUEST COALESCING IN ACTION

 16 Generated Addresses (A0 .. A15)
 ┌─────────────────────────────────────────────────────────────┐
 │ A0, A3, A7  ──► All belong to Cache Line 0x10000 (Merged!)  │
 │ A1, A4, A12 ──► All belong to Cache Line 0x10080 (Merged!)  │
 │ A2, A5..A15 ──► All belong to Cache Line 0x10100 (Merged!)  │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 16 Requests Coalesced into ONLY 3 L1 SRAM Cache Queries!
```

---

### Stage 3: Multi-Bank L1 SRAM Lookup and Crossbar Data Routing

Once the unique cache line requests are identified, the SGU queries the L1 Data Cache.

As cache line payloads return from L1 SRAM, an internal **Multi-Lane Crossbar Switch** reads the byte offsets $A_i[5:0]$ for each element, extracts the required 32-bit or 64-bit word out of the 64-byte line payload, and routes it directly to vector lane $i$.

---

### Stage 4: Destination Vector Register Packing

During a **Gather Load (`vluxei32.v`)**:
The crossbar switch writes the extracted data words into their corresponding lane slots $V_D[0], V_D[1], \dots, V_D[vl-1]$ inside the destination vector register file.

During a **Scatter Store (`vsoxei32.v`)**:
The SGU takes data payloads from source vector register $V_S[i]$ and writes them out to memory addresses $A_i = A_{\text{base}} + V_{\text{index}}[i]$.

---

## Scatter Store Collisions, Bank Conflicts, and Memory Coherency

While Gather loads ($READs$) are non-destructive, **Scatter stores ($WRITEs$)** introduce a severe, non-deterministic system hazard: **The Scatter Store Address Collision (Store Overwrite Conflict)**.

---

### The Scatter Address Collision Hazard

What happens during a Vector Scatter Store instruction (`vsoxei32.v vs3, (rs1), vs2`) if two or more vector lanes contain the **EXACT SAME target index value** inside the vector index register $V_{\text{index}}$?

$$\text{Suppose: } V_{\text{index}}[1] = 42 \quad \mathbf{\text{AND}} \quad V_{\text{index}}[5] = 42$$

$$\text{Target Address for Lane 1: } A_1 = A_{\text{base}} + 42$$
$$\text{Target Address for Lane 5: } A_5 = A_{\text{base}} + 42$$

Both Lane 1 and Lane 5 are attempting to write their data payloads ($V_S[1]$ and $V_S[5]$) to the **EXACT SAME PHYSICAL MEMORY BYTE ADDRESS $A_{\text{base}} + 42$** at the exact same time!

```text
SCATTER STORE ADDRESS COLLISION HAZARD

 Lane 1: Payload VS[1] = 0xAAAA ──► Wants to Write to Address 0x1002A ──┐
                                                                         ├──► OVERWRITE CONFLICT!
 Lane 5: Payload VS[5] = 0xFFFF ──► Wants to Write to Address 0x1002A ──┘
```

#### The Sequential Program Order Invariant:
In sequential program execution, vector instructions are defined such that higher element indices represent operations that occur **later in logical program time** than lower element indices:

$$\text{Program Order: } \text{Element } 0 \quad \prec \quad \text{Element } 1 \quad \prec \quad \dots \quad \prec \quad \text{Element } N-1$$

Therefore, if Lane 1 and Lane 5 write to the same address, **Lane 5 ($V_S[5]$) MUST overwrite Lane 1 ($V_S[1]$)**! 

The final value remaining in memory at address $A_{\text{base}} + 42$ after the Scatter instruction completes MUST BE $V_S[5]$.

#### How the Scatter Engine Resolves Store Collisions:
1. **Parallel Collision Detection**: The SGU's Address Comparators compare all $N$ generated scatter addresses against each other in parallel ($A_i == A_j$).
2. **Conflict Prioritization**: If $A_i == A_j$ (where $i < j$), the SGU **suppresses the write payload for lower lane $i$** ($V_S[i]$ is dropped).
3. **Serialization**: Only the highest-indexed lane's payload ($V_S[j]$) is committed to memory!

$$\text{For } A_i == A_j \text{ with } i < j: \quad \mathbf{\text{Write } V_S[j] \text{ to } A_j, \quad \text{Discard } V_S[i]}$$

This collision resolution logic guarantees that Scatter stores preserve strict sequential program execution semantics!

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Sparse Matrix Gather Execution, Cache Line Coalescing, and Throughput Analysis

To consolidate your complete mastery of vector scatter-gather engines, vector index address translation, cache line request coalescing, and bank conflict serialization, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Target Physical Memory Addresses ($A_i = A_{\text{base}} + V_{\text{index}}[i]$)

Base Address $a0 = \text{0x10000} = 65,536_{10}$.

We compute $A_i = 65,536 + V_{\text{index}}[i]$ for all 8 lanes:

* **Lane 0 ($i = 0, V_{\text{index}}[0] = 0$)**: $A_0 = 65,536 + 0 = \mathbf{\text{0x10000}} \quad (65,536_{10})$
* **Lane 1 ($i = 1, V_{\text{index}}[1] = 16$)**: $A_1 = 65,536 + 16 = \mathbf{\text{0x10010}} \quad (65,552_{10})$
* **Lane 2 ($i = 2, V_{\text{index}}[2] = 4$)**: $A_2 = 65,536 + 4 = \mathbf{\text{0x10004}} \quad (65,540_{10})$
* **Lane 3 ($i = 3, V_{\text{index}}[3] = 256$)**: $A_3 = 65,536 + 256 = \mathbf{\text{0x10100}} \quad (65,792_{10})$
* **Lane 4 ($i = 4, V_{\text{index}}[4] = 20$)**: $A_4 = 65,536 + 20 = \mathbf{\text{0x10014}} \quad (65,556_{10})$
* **Lane 5 ($i = 5, V_{\text{index}}[5] = 260$)**: $A_5 = 65,536 + 260 = \mathbf{\text{0x10104}} \quad (65,796_{10})$
* **Lane 6 ($i = 6, V_{\text{index}}[6] = 8$)**: $A_6 = 65,536 + 8 = \mathbf{\text{0x10008}} \quad (65,544_{10})$
* **Lane 7 ($i = 7, V_{\text{index}}[7] = 264$)**: $A_7 = 65,536 + 264 = \mathbf{\text{0x10108}} \quad (65,800_{10})$

```text
PARALLEL AGU ADDRESS GENERATION RESULTS

 Lane Index │ Index Offset (v2[i]) │ Calculated Physical Address A_i
────────────┼──────────────────────┼─────────────────────────────────
   Lane 0   │        0 Bytes       │           0x10000
   Lane 1   │       16 Bytes       │           0x10010
   Lane 2   │        4 Bytes       │           0x10004
   Lane 3   │      256 Bytes       │           0x10100
   Lane 4   │       20 Bytes       │           0x10014
   Lane 5   │      260 Bytes       │           0x10104
   Lane 6   │        8 Bytes       │           0x10008
   Lane 7   │      264 Bytes       │           0x10108
```

---

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

---

#### Step 3: Trace Stage 3 — L1 SRAM Bank Mapping and Collision Analysis

We calculate the Bank IDs for all 8 elements ($\text{Bank\_ID} = \lfloor A / 4 \rfloor \pmod 8$):

* $A_0 (65536/4 = 16384 \pmod 8) = \mathbf{\text{Bank } 0}$
* $A_1 (65552/4 = 16388 \pmod 8) = \mathbf{\text{Bank } 4}$
* $A_2 (65540/4 = 16385 \pmod 8) = \mathbf{\text{Bank } 1}$
* $A_3 (65792/4 = 16448 \pmod 8) = \mathbf{\text{Bank } 0 \quad (\text{Cross-Line Same Bank!})}$
* $A_4 (65556/4 = 16389 \pmod 8) = \mathbf{\text{Bank } 5}$
* $A_5 (65796/4 = 16449 \pmod 8) = \mathbf{\text{Bank } 1 \quad (\text{Cross-Line Same Bank!})}$
* $A_6 (65544/4 = 16386 \pmod 8) = \mathbf{\text{Bank } 2}$
* $A_7 (65800/4 = 16450 \pmod 8) = \mathbf{\text{Bank } 2 \quad (\text{Cross-Line Same Bank!})}$

```text
ELEMENT TO SRAM BANK MAPPING

 Element Index │ Target Address A_i │ Target L1 Cache Line │ Target SRAM Bank_ID
───────────────┼────────────────────┼──────────────────────┼─────────────────────
    Lane 0     │      0x10000       │      Line 0x10000    │       Bank 0
    Lane 1     │      0x10010       │      Line 0x10000    │       Bank 4
    Lane 2     │      0x10004       │      Line 0x10000    │       Bank 1
    Lane 3     │      0x10100       │      Line 0x10100    │       Bank 0
    Lane 4     │      0x10014       │      Line 0x10000    │       Bank 5
    Lane 5     │      0x10104       │      Line 0x10100    │       Bank 1
    Lane 6     │      0x10008       │      Line 0x10000    │       Bank 2
    Lane 7     │      0x10108       │      Line 0x10100    │       Bank 2
```

##### Bank Collision Analysis across Coalesced Cache Query Cycles:

* **Cycle 1 (Query Cache Line `0x10000`)**:
  * Requests: $A_0 (\text{Bank } 0), A_1 (\text{Bank } 4), A_2 (\text{Bank } 1), A_4 (\text{Bank } 5), A_6 (\text{Bank } 2)$.
  * All 5 elements land in **5 DIFFERENT SRAM BANKS (Banks 0, 4, 1, 5, 2)**!
  * **ZERO BANK CONFLICTS on Cycle 1!** All 5 elements fetched in parallel in 1 clock cycle!

* **Cycle 2 (Query Cache Line `0x10100`)**:
  * Requests: $A_3 (\text{Bank } 0), A_5 (\text{Bank } 1), A_7 (\text{Bank } 2)$.
  * All 3 elements land in **3 DIFFERENT SRAM BANKS (Banks 0, 1, 2)**!
  * **ZERO BANK CONFLICTS on Cycle 2!** All 3 elements fetched in parallel in 1 clock cycle!

---

#### Step 4: Calculate Total Execution Time and Effective Throughput

The Gather operation completed in 2 coalesced L1 SRAM query cycles:

$$\text{Total Execution Cycles} = 2 \text{ Coalesced Query Cycles} = \mathbf{2 \text{ Clock Cycles}}$$

$$T_{\text{gather}} = 2 \times 0.3125\text{ ns/cycle} = \mathbf{0.625 \text{ nanoseconds}}$$

##### Calculate Effective Read Throughput ($\text{BW}_{\text{gather}}$):
Total Data Gathered = 8 elements $\times 4\text{ bytes/element} = 32\text{ bytes}$.

$$\text{BW}_{\text{gather}} = \frac{32\text{ Bytes}}{0.625 \times 10^{-9}\text{ s}} = \mathbf{51.2 \times 10^9 \text{ Bytes/sec}} = \mathbf{51.2 \text{ GB/sec}}$$

---

#### Step 5: Compare Against Scalar Fallback Loop

A scalar fallback loop must execute 8 sequential scalar loads:
* Each scalar load takes 4 clock cycles (address calculation + scalar load + lane insert).
* Total scalar execution cycles = $8 \times 4\text{ cycles} = \mathbf{32 \text{ Clock Cycles}}$.

$$T_{\text{scalar}} = 32 \times 0.3125\text{ ns/cycle} = \mathbf{10.000 \text{ nanoseconds}}$$

##### Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{scalar}}}{T_{\text{gather}}} = \frac{10.000\text{ ns}}{0.625\text{ ns}} = \frac{32\text{ cycles}}{2\text{ cycles}} = \mathbf{16.00\times \text{ Performance Advantage!}}$$

```text
SCATTER-GATHER ENGINE PERFORMANCE OPTIMIZATION SUMMARY

 Method / Architecture       │ L1 Cache Queries │ Execution Cycles │ Read Throughput │ Speedup vs Scalar
─────────────────────────────┼──────────────────┼──────────────────┼─────────────────┼───────────────────
 Scalar Loop (Fallback)      │ 8 Individual     │ 32 Cycles        │  3.20 GB/sec    │ 1.00x (Baseline)
 Scatter-Gather Engine (SGU) │ 2 Coalesced      │  2 Cycles        │ 51.20 GB/sec    │ 16.00x FASTER!
                             │ (75% Reduction)  │ (93.75% Saved)   │ (+48.0 GB/sec)  │ (+1,500% Gain)
```

##### Engineering Conclusion:
By coalescing 8 indirect memory requests into 2 unique cache line queries and performing multi-bank parallel reads, the Scatter-Gather Engine reduced execution time from 32 cycles down to 2 cycles—delivering a **$16.00\times$ performance speedup ($1,500\%$ throughput gain)** over scalar code!

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Scatter-Gather Engine (SGU)**: A specialized vector memory pipeline that calculates non-linear indirect addresses ($A_i = A_{\text{base}} + V_{\text{index}}[i]$) in parallel, coalesces duplicate requests targeting the same 64-byte cache line, and routes gathered data between memory and vector registers via multi-bank crossbar switches.
* **Vector Index Register ($V_{\text{index}}$)**: A vector register storing an array of arbitrary integer byte offsets ($V_{\text{index}}[i]$) used by indirect vector memory instructions (`vluxei32.v` / `vsoxei32.v`) to execute non-linear gather loads and scatter stores for sparse matrices and graph algorithms.
