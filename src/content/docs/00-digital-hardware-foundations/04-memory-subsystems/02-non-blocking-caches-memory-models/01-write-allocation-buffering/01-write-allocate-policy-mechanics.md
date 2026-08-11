---
title: "Write-Allocate Policy Mechanics and Cache Miss Allocation Strategies"
---

# Write-Allocate Policy Mechanics and Cache Miss Allocation Strategies

## The Store Miss Allocation Dilemma: To Fetch or To Bypass?

In high-speed digital processor architectures, memory store instructions (writes) modify binary data stored at specific memory addresses. When a processor core executes a store instruction (such as `STORE R1, [R2]` or `SW R3, 0(R4)`), it specifies a target memory address and a payload—typically a single 8-bit byte, a 16-bit half-word, a 32-bit word, or a 64-bit double-word.

When the target memory address is present in the processor's Level 1 (L1) Data Cache (a **Write Hit**), the operation is straightforward: the cache controller updates the local Static RAM (SRAM) array line.

However, a fundamental architectural dilemma emerges when the target memory address is **NOT present** in the L1 Data Cache: **The Store Miss Allocation Dilemma**.

When a store instruction incurs a **Write Miss**, the CPU pipeline wants to modify a small 4-byte or 8-byte word at address $A$. But physical cache memories do not manage storage byte-by-byte; they store and transfer memory in fixed multi-byte blocks called **Cache Lines** (typically 64 bytes wide).

The hardware cache controller faces an immediate, critical decision:

> **The Store Miss Allocation Dilemma**: When a store instruction misses the L1 Data Cache, should the cache controller fetch the missing 64-byte memory block from slow main DRAM into the high-speed L1 SRAM cache array *before* applying the 4-byte write? Or should it bypass the L1 cache entirely and write the 4-byte payload directly to lower-level memory?

```text
THE STORE MISS ALLOCATION DILEMMA

 CPU Store Instruction (Writes 4 Bytes to Address A - MISS!)
                           │
                 Which Strategy Should Hardware Choose?
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
 STRATEGY 1: WRITE-ALLOCATE           STRATEGY 2: WRITE-NO-ALLOCATE
 (Fetch-on-Write)                     (Write-Around)
 Fetch 64-byte block from DRAM        Bypass L1 SRAM array completely!
 into L1 SRAM, then write 4 bytes.    Write 4 bytes directly to DRAM.
 (Pays 120-cycle fetch penalty!)      (Saves line fetch penalty!)
```

To understand why this choice is so difficult, let us examine the physical trade-offs of both options:

### Option 1: The Write-Allocate (Fetch-on-Write) Policy
The cache controller fetches the entire 64-byte memory block from main memory into the L1 SRAM cache array, overwriting an old cache line if necessary. Once the 64-byte block arrives in L1 SRAM, the CPU applies the 4-byte store payload to the line.

* **The Frictional Penalty**: Fetching 64 bytes from main DRAM memory requires a long multi-cycle transaction across the memory bus (typically $100 \text{ to } 200 \text{ clock cycles}$). Why force the CPU to wait 150 clock cycles to fetch 60 bytes of surrounding data that the instruction did not explicitly ask to read, just to modify a 4-byte word?
* **The Future Benefit**: If the program subsequently reads or writes that same 4-byte word or its neighboring 60 bytes a few nanoseconds later, the entire 64-byte block is **already sitting inside the L1 SRAM cache**! All future accesses hit in $1\text{ clock cycle}$.

### Option 2: The Write-No-Allocate (Write-Around) Policy
The cache controller completely bypasses the L1 SRAM cache array. It does not allocate a line in L1 SRAM and does not evict existing cached data. The 4-byte store payload is transmitted directly across the memory bus to update lower-level memory (L2/L3 cache or main DRAM).

* **The Immediate Benefit**: The CPU avoids the 150-cycle main memory line fetch penalty! The L1 cache array remains completely untouched, preventing new write lines from kicking out existing, highly active read data (**Cache Preservation**).
* **The Future Penalty**: If the program immediately reads or writes that same address or its neighboring bytes on subsequent instructions, the data is NOT in the L1 cache! Every subsequent access suffers another cache miss, paying memory bus delays over and over again.

How do hardware architects resolve this dilemma? How do different store miss policies pair with store hit policies (such as Write-Back and Write-Through)? How do streaming write workloads (like initializing large memory buffers) cause **Cache Line Pollution** if the wrong allocation strategy is chosen?

To solve the store miss allocation dilemma, computer architectures rely on two primary hardware allocation strategies: **Write-Allocate (Fetch-on-Write)** and **Write-No-Allocate (Write-Around)**.


### Strategy A: The Write-Allocate Procedure (Fetch the Binder First)

The executive refuses to write notes on loose scraps of paper.
1. The executive calls a courier and waits **5 minutes** ($300\text{ seconds}$) for the courier to walk down to the basement, retrieve the entire 64-page Binder #42, and place it on their desk notebook (**Memory Line Fetch**).
2. Once Binder #42 is resting on their desk, the executive turns to Page 4 and writes the single sentence in **1 second**.

```text
WRITE-ALLOCATE STRATEGY (FETCH BINDER FIRST)

 12:00 PM: Need Page 4 of Binder #42 ──► [ 5-Min Courier Trip ] ──► 12:05 PM: Binder #42 on Desk
 12:05 PM: Write Sentence on Page 4 ──► Takes 1 Second!
 12:06 PM: Need Page 5 of Binder #42 ──► Binder ALREADY on Desk ──► Takes 1 Second! (HIT)
```

Look at the trade-offs of Strategy A:
* **The Initial Penalty**: The executive sat idle for 5 minutes waiting for the courier to fetch 64 pages, even though they only wanted to write on Page 4.
* **The Long-Term Gain**: If the executive needs to read Page 5 or write another sentence on Page 6 two seconds later, **Binder #42 is already sitting on their desk**! The next 63 accesses complete in 1 second!


## Primitive 1: The Write-Allocate (Fetch-on-Write) Policy

Now that we possess a clear, intuitive mental model of desktop binder allocation, let us examine the formal, rigorous engineering mechanics of **The Write-Allocate Policy**.

> **The Write-Allocate Policy** (also known as **Fetch-on-Write**) is a cache miss allocation strategy where a store instruction missing the cache causes the cache controller to fetch the missing 64-byte memory block from main memory into the L1 SRAM cache array *before* applying the store payload to the line.


### Why Write-Allocate Pairs Naturally with Write-Back Caches

In commercial processor design, **Write-Allocate is almost universally paired with the Write-Back policy** (**WB + WA**).

Why do Write-Back and Write-Allocate form such a powerful hardware pair?

1. **Amortizing the Fetch Penalty Over Future Writes**:
   When a Write-Back cache incurs a store miss on address $A$, paying the 120-cycle DRAM line fill penalty loads the 64-byte block into L1 SRAM and sets $D = 1$.
   
   If the program subsequently executes $100$ more store instructions to variables inside that same 64-byte line, **all 100 subsequent stores complete in $1\text{ clock cycle}$ with $0\text{ bus transactions}$**! 
   
   The initial 120-cycle line fill penalty is amortized over 101 store operations, reducing the average cost per store to $\approx 2.18\text{ cycles}$!

2. **Exploiting Read-After-Write (RAW) Locality**:
   Programs frequently write a value to a variable or structure field and then read that same variable a few instructions later (`x = 5; if (x > 0) ...`). 
   
   By allocating the line in L1 SRAM during the store miss, the subsequent read instruction finds the data **already sitting in L1 SRAM**, achieving a $1\text{-cycle}$ cache hit!

```text
WRITE-BACK + WRITE-ALLOCATE SYNERGY

 Store Miss at Address A ──► Fetch 64B Line into L1 SRAM (120 Cycles)
                             Set Dirty Bit D = 1
                             │
                             ├─► Store 2 to Address A+4  ──► 1 Cycle Hit! (D=1, 0 Bus Traffic)
                             ├─► Store 3 to Address A+8  ──► 1 Cycle Hit! (D=1, 0 Bus Traffic)
                             └─► Read 1  from Address A  ──► 1 Cycle Hit! (0 Bus Traffic)
 (Initial 120-cycle fetch penalty amortized over dozens of 1-cycle hits!)
```


### Detailed Hardware Execution Mechanics of Write-No-Allocate

Let us trace the step-by-step physical gate execution when a CPU core issues a store instruction targeting an address $A$ that is NOT present in a Write-No-Allocate cache:

```text
WRITE-NO-ALLOCATE HARDWARE EXECUTION FLOW

 CPU Issues Store Instruction (SW R1, [Addr A]) - MISS!
                         │
                         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 1: BYPASS L1 SRAM CACHE                                │
 │ L1 SRAM data array and tag array are COMPLETELY UNTOUCHED!  │
 │ No L1 cache lines are evicted or allocated.                 │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 2: DIRECT LOWER-MEMORY WRITE                           │
 │ Store payload (4 Bytes) is sent directly across memory bus  │
 │ to update L2/L3 Cache or Write Buffer.                      │
 └─────────────────────────────────────────────────────────────┘
```

#### Step 1: L1 Cache Bypass
1. The CPU dispatches a store instruction with target byte address $A$ and a 4-byte payload $W$.
2. The L1 Data Cache checks its Tag array at set index $I = \text{Index}(A)$.
3. **Miss Confirmed**: No valid matching tag is found ($V == 0$ or $\text{Tag\_Mismatch}$).
4. The cache controller **bypasses the L1 SRAM array completely**!
   * No cache line is selected for replacement.
   * No existing L1 data lines are evicted to main memory.
   * No 64-byte read fill request is issued to DRAM.
   * The L1 SRAM array remains $100\%$ untouched.

#### Step 2: Direct Lower-Memory Write Dispatch
1. The 4-byte store payload $W$ and address $A$ are transmitted directly across the interconnect bus to update lower-level memory (L2 Cache, L3 Cache, or main DRAM) or dropped into a Write Buffer queue.
2. The CPU pipeline resumes execution as soon as the write payload is accepted by lower memory or the Write Buffer.


## Preventative Hardware Architecture: Preventing Cache Pollution

The most important practical advantage of the Write-No-Allocate policy is its ability to prevent a catastrophic software performance hazard known as **Cache Pollution**.

### What Is Cache Pollution?

> **Cache Pollution** occurs when a high-volume memory operation (such as initializing a large memory array to zero or copying a large file) streams massive amounts of single-use data through the cache, evicting the CPU's active, highly valuable working-set data (such as loop instructions, stack variables, and frequently read pointers).

```text
CACHE POLLUTION IN A WRITE-ALLOCATE CACHE

 Before Memory Initialization (Clean Working Set in L1 Cache):
 L1 Cache contains: [ Loop Instruction Code | Stack Variables | Active Pointers ]

 Program executes: memset(buffer, 0, 10_MEGABYTES); (Streaming Writes)

 Under Write-Allocate:
 Every 64-byte write miss FETCHES 10 MB of zeros into L1 Cache!
 L1 Cache NOW contains: [ Zero Buffer Line 1 | Zero Buffer Line 2 | Zero Buffer Line 3 ]
 (ACTIVE WORKING SET COMPLETELY EVICTED & DESTROYED!)
```

Let us trace a real-world software example to see how Write-Allocate pollutes a cache array during streaming memory writes:

Consider a program that executes a single call to `memset()` to initialize a $10\text{-Megabyte}$ video frame buffer to zero before rendering an image:

```c
memset(frame_buffer, 0, 10 * 1024 * 1024); // Writes 10 MB of zeros to RAM
```

Suppose this code runs on a CPU equipped with a **$32\text{-KB}$ L1 Data Cache** using a **Write-Allocate** policy:

1. `memset` writes the first 4 bytes of `frame_buffer` to address `0x10000`. This misses in L1.
2. Under **Write-Allocate**, the L1 cache controller issues a 64-byte read fill request to main DRAM to fetch the existing contents of `frame_buffer` into L1 SRAM.
3. The 64-byte line arrives from DRAM. The CPU overwrites 4 bytes with zero.
4. `memset` moves to the next 4 bytes...
5. As `memset` streams through 10 Megabytes of memory, **it forces the L1 cache to allocate 163,840 consecutive 64-byte cache lines!**

#### The Consequences of Write-Allocate during Streaming Writes:

* **Massive Waste of DRAM Read Bandwidth**: The memory controller spent time fetching **10 Megabytes of old data from DRAM into L1 SRAM**, even though `memset` was about to overwrite every single byte of that data with zeros anyway! $10\text{ MB}$ of DRAM read bandwidth was completely wasted.
* **Destruction of Active Working Set**: The 10 Megabytes of zero-lines completely swept through the 32 KB L1 Data Cache, **evicting $100\%$ of the CPU's active working set** (stack variables, local pointers, and lookup tables).
* **Post-Stream Miss Cascade**: When `memset` finishes and the CPU returns to executing normal application logic, **every single subsequent variable read misses in L1**, because all active variables were evicted by `memset`!


## Canonical Write Policy Pairings and Performance Equations

In commercial processor design, hardware architects do not pick write hit and write miss policies at random. They select one of two canonical, mathematically optimized pairings:

```text
CANONICAL WRITE POLICY PAIRINGS

 Pair 1: Write-Back + Write-Allocate (WB + WA)  ──► Industry Standard for High-Performance CPUs
 Pair 2: Write-Through + Write-No-Allocate (WT + WNA) ──► Standard for Embedded / Streaming Caches
```

### Pairing 1: Write-Back + Write-Allocate (WB + WA)
* **Target Application**: General-purpose high-performance primary and secondary data caches (L1, L2, L3 caches in x86-64, ARM, and RISC-V processors).
* **Why this pair works**:
  * Write-Back absorbs multiple local writes into 1-cycle SRAM hits with $D = 1$, eliminating $90\%+$ of off-chip write traffic.
  * Write-Allocate ensures that once a store miss incurs a line fill, all subsequent reads and writes to that 64-byte line hit in L1 SRAM, maximizing temporal and spatial locality.


### Comparison Matrix of All Four Combinations

```text
ALL FOUR WRITE POLICY COMBINATIONS MATRIX

 Combination              │ Off-Chip Write Traffic │ Store Miss Fetch Overhead │ Primary Usage / Status
──────────────────────────┼────────────────────────┼───────────────────────────┼───────────────────────────────
 Write-Back + Write-Alloc │ LOWEST (Filtered)      │ Pays Line Fill ONCE       │ **CANONICAL HIGH-PERFORMANCE**
 Write-Through + No-Alloc │ HIGH (100% Stores)     │ Zero Line Fill Penalty    │ **CANONICAL EMBEDDED / STREAM**
 Write-Back + No-Alloc   │ Low (Complex Tracking) │ Zero Line Fill Penalty    │ Rare (Complex Partial-Line)
 Write-Through + Write-A. │ HIGHEST (Fill + Write) │ Pays Line Fill + Bus Write│ Sub-Optimal (Avoided)
```


### 2. Write-Combining Buffers (WCB)

When an architecture uses Write-No-Allocate (Write-Around) for non-cacheable memory regions (such as video frame buffers or PCIe memory-mapped I/O), sending dozens of individual 4-byte write transactions across the bus wastes interconnect bandwidth due to per-packet protocol overhead.

To accelerate Write-No-Allocate transfers, hardware designers insert a **Write-Combining Buffer (WCB)**:

```text
WRITE-COMBINING BUFFER (WCB) CONSOLIDATION

 CPU Store 1 (4 Bytes to Offset 0) ──┐
 CPU Store 2 (4 Bytes to Offset 4) ──┼──► [ Write-Combining Buffer ]
 CPU Store 3 (4 Bytes to Offset 8) ──┘    (Accumulates until 64B full)
                                                     │
                                                     ▼
 Transmits ONE Single 64-Byte Burst across PCIe / Interconnect Bus!
```

1. As the CPU executes individual 4-byte stores to adjacent addresses, the Write-Combining Buffer collects and merges the small payloads into an internal 64-byte line buffer.
2. When the 64-byte buffer is full (or when a memory fence instruction executes), the Write-Combining Buffer transmits the entire 64-byte payload across the bus as **a single, high-speed burst transaction**.
3. Small, fragmented store traffic is converted into optimal full-width bus bursts!


### Scenario and Parameters

You are a senior memory systems architect evaluating the performance of a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes two completely different software workload kernels:

* **Kernel 1 (Iterative State Matrix Update)**: An iterative algorithm that reads and writes a 16-KB state matrix ($4,096\text{ 32-bit floats}$) **100 times in a loop**.
* **Kernel 2 (Linear Frame Buffer Initialization - `memset`)**: A streaming memory write workload that writes zeros to a **4-Megabyte video frame buffer** once, without ever reading the buffer back.

```text
3.2 GHz SERVER PROCESSOR MEMORY SUBSYSTEM ARCHITECTURE

 CPU Core (3.2 GHz) ──► [ L1 Data Cache (32 KB Capacity) ] ──► Main Memory (DRAM)
 Clock T = 312.5 ps     Line Size L = 64 Bytes                 Line Fill = 120 Cycles
```

#### System Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ps}$).
* Ideal Execution Performance: $\text{CPI}_{\text{ideal}} = 1.0\text{ cycle/instruction}$.
* L1 Data Cache Capacity: $C = 32\text{ KB} = 32,768\text{ bytes}$ (Direct-Mapped, $L = 64\text{ bytes}$).
* L1 Cache Hit Latency: $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Main DRAM Line Fill Latency ($T_{\text{fill}}$): $120\text{ clock cycles}$ ($37.5\text{ ns}$ for a 64-byte block).
* Main DRAM Single-Word Write-Around Latency ($T_{\text{word\_write}}$): $20\text{ clock cycles}$ ($6.25\text{ ns}$ for a 4-byte word).

#### Candidate Cache Configurations to Compare:
* **Configuration A (Write-Back + Write-Allocate / WB + WA)**.
* **Configuration B (Write-Through + Write-No-Allocate / WT + WNA)**.

#### Your Objective

1. For **Kernel 1 (Iterative State Matrix Update — 16 KB)**:
   * Calculate total memory bus traffic (in MB) and effective CPI for Configuration A (Write-Allocate) versus Configuration B (Write-No-Allocate) across all 100 iterations.
   * Prove mathematically why Write-Allocate is dramatically superior for Kernel 1.
2. For **Kernel 2 (Streaming Memory Initialization - 4 MB `memset`)**:
   * Calculate total memory bus traffic (in MB) and effective CPI for Configuration A (Write-Allocate) versus Configuration B (Write-No-Allocate).
   * Prove mathematically why Write-No-Allocate is dramatically superior for Kernel 2.
3. Derive the exact mathematical **Re-Access Reuse Threshold ($R_{\text{reuse}}$)**: the minimum number of times a written cache line must be re-accessed before Write-Allocate becomes faster than Write-No-Allocate.
4. Verify mathematical, structural, and timing correctness.


##### Analysis of Configuration B (Write-Through + Write-No-Allocate):
1. Under Write-No-Allocate, store misses do NOT fetch lines into L1 SRAM.
2. Under Write-Through, **EVERY SINGLE STORE INSTRUCTION MUST WRITE TO DRAM OVER THE BUS**!
3. The loop executes $409,600\text{ store instructions}$. Every store writes a 4-byte word to DRAM ($T_{\text{word\_write}} = 20\text{ cycles}$).

$$\text{Total Bus Traffic (Config B, Kernel 1)} = 409,600\text{ stores} \times 4\text{ bytes/store} = \mathbf{1,638,400 \text{ bytes}} = \mathbf{1.6384 \text{ MB}}$$

$$\text{Total Stall Cycles (Config B)} = 409,600\text{ stores} \times 20\text{ cycles/store} = \mathbf{8,192,000 \text{ cycles}}$$

$$\text{CPI}_{\text{effective,ConfigB}} = 1.0 + \frac{8,192,000\text{ stall cycles}}{409,600\text{ stores}} = 1.0 + 20.0 = \mathbf{21.0 \text{ cycles/instruction}}$$

```text
KERNEL 1 PERFORMANCE COMPARISON (ITERATIVE WORKLOAD)

 Configuration               │ Total Bus Traffic │ Total Stall Cycles │ Effective CPI
─────────────────────────────┼───────────────────┼────────────────────┼───────────────
 Config A (WB + Write-Alloc) │     0.0328 MB     │    30,720 Cycles   │  1.075 Cycles/Inst
 Config B (WT + No-Alloc)    │     1.6384 MB     │ 8,192,000 Cycles   │ 21.000 Cycles/Inst
                             │ (50x Less Traffic)│ (266x Fewer Stalls)│ (19.5x FASTER!)
```

##### Kernel 1 Conclusion:
Configuration A (Write-Allocate) runs **$19.5\times$ faster** and generates **$50\times$ less bus traffic** than Configuration B because it loaded the array into L1 SRAM once and absorbed 405,504 subsequent writes locally!


##### Analysis of Configuration B (Write-Through + Write-No-Allocate):
1. Under Write-No-Allocate, all stores bypass L1 SRAM completely!
2. Zero lines are fetched from DRAM into L1 SRAM ($\text{Read Traffic} = 0\text{ MB}$).
3. The L1 Data Cache remains $100\%$ untouched (Zero Cache Pollution!).
4. The 1,048,576 4-byte zero-stores are written directly to lower memory.
   * DRAM Write Traffic = $1,048,576 \times 4\text{ bytes} = \mathbf{4.194304 \text{ MB}}$.

Assuming a 4-entry Write Buffer is installed that reduces write-around stall penalty to $T_{\text{buffered\_write}} = 2\text{ cycles/store}$:

$$\text{Total Bus Traffic (Config B, Kernel 2)} = \mathbf{4.194304 \text{ MB}} \quad (\mathbf{50\% \text{ LESS TRAFFIC THAN CONFIG A!}})$$

$$\text{Total Stall Cycles (Config B)} = 1,048,576\text{ stores} \times 2\text{ cycles/store} = \mathbf{2,097,152 \text{ cycles}}$$

$$\text{CPI}_{\text{effective,ConfigB}} = 1.0 + \frac{2,097,152}{1,048,576} = 1.0 + 2.0 = \mathbf{3.00 \text{ cycles/instruction}}$$

```text
KERNEL 2 PERFORMANCE COMPARISON (STREAMING WORKLOAD)

 Configuration               │ Total Bus Traffic │ Total Stall Cycles │ Effective CPI
─────────────────────────────┼───────────────────┼────────────────────┼───────────────
 Config A (WB + Write-Alloc) │     8.3886 MB     │ 7,864,320 Cycles   │  8.50 Cycles/Inst
 Config B (WT + No-Alloc)    │     4.1943 MB     │ 2,097,152 Cycles   │  3.00 Cycles/Inst
                             │ (2x Less Traffic) │ (3.7x Fewer Stalls)│ (2.83x FASTER!)
```

##### Kernel 2 Conclusion:
Configuration B (Write-No-Allocate) runs **$2.83\times$ faster** and generates **$50\%$ less bus traffic** than Configuration A for streaming writes because it avoided useless DRAM read fills and prevented cache pollution!


### Sanity Check and Verification

Let us verify our mathematical and physical results against system principles:

1. **Kernel 1 Reuse Check**:
   * Kernel 1 wrote each 64-byte line 1,600 times ($16 \text{ stores/line} \times 100 \text{ iterations}$).
   * $1,600 \gg 6.26$ threshold! Write-Allocate was correctly $19.5\times$ faster.
2. **Kernel 2 Reuse Check**:
   * Kernel 2 wrote each 64-byte line 16 times once, and never re-accessed it.
   * But under Write-Allocate, Kernel 2 paid a 64-byte read fill *and* a 64-byte writeback ($128\text{ bytes traffic/line}$), whereas Write-No-Allocate wrote only 64 bytes total.
   * Bus traffic was exactly $2\times$ higher under Write-Allocate, matching our $8.38\text{ MB}$ vs $4.19\text{ MB}$ calculation!

All bus bandwidth calculations, CPI stall equations, threshold formulas, and cache pollution mechanisms evaluate with 100% mathematical, physical, and logical precision.

