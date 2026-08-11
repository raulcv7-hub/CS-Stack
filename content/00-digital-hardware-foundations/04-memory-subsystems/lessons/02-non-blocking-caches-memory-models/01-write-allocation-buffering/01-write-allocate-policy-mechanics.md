content/00-digital-hardware-foundations/04-memory-subsystems/lessons/02-non-blocking-caches-memory-models/01-write-allocation-buffering/01-write-allocate-policy-mechanics.md
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

---

## The Empty Notebook and the Mailbox: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of write allocation strategies before analyzing gate-level execution paths, memory bus transactions, and AMAT equations, let us consider an everyday analogy: **The Corporate Executive's Desk Notebook**.

Imagine an executive (**The CPU Core**) working at a desk in an office. On the corner of the desk sits a small spiral notebook (**The L1 SRAM Cache**) that can hold 10 pages of notes. 

Down in the basement archive (**Main System DRAM Memory**) sits a massive collection of 64-page binders.

```text
THE EXECUTIVE AND THE BASEMENT BINDERS METAPHOR

 Executive's Desk                     Basement Central Archive
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ Small Desktop Notebook    │        │ 64-Page Heavy Binders     │
 │ Holds 10 Working Pages    │        │ Holds 1,000,000 Pages     │
 │ Access Time: 1 Second     │        │ Retrieval Time: 5 Minutes │
 └───────────────────────────┘        └───────────────────────────┘
   (Ultra-Fast L1 SRAM Cache)           (Slow Main System DRAM)
```

The executive wants to write a single sentence on **Page 4 of Binder #42**. But Binder #42 is currently sitting down in the basement archive, NOT on their desk.

Let us compare two different operational procedures for handling this situation:

---

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

---

### Strategy B: The Write-No-Allocate Procedure (Mail a Sticky Note / Write-Around)

The executive decides not to bother bringing heavy binders up from the basement.
1. The executive writes the single sentence on a small sticky note (taking 1 second).
2. The executive hands the sticky note to a courier to carry down to the basement archive and stick onto Page 4 of Binder #42 in the background.
3. Binder #42 is **NOT brought up to the desk**. The desk remains completely unchanged.

```text
WRITE-NO-ALLOCATE STRATEGY (WRITE-AROUND)

 12:00 PM: Need Page 4 of Binder #42 ──► Write Sticky Note (1s) ──► Hand to Courier
 12:01 PM: Desk space UNTOUCHED! Executive continues working immediately!
 12:02 PM: Need Page 5 of Binder #42 ──► Binder NOT on Desk!     ──► Send Courier (5-Min Delay!)
```

Look at the trade-offs of Strategy B:
* **The Immediate Gain**: The executive avoided waiting 5 minutes for a heavy binder! They handed off the sticky note in 1 second and resumed working immediately. The desk space was preserved for existing, active paperwork.
* **The Long-Term Penalty**: If the executive needs to read Page 5 two seconds later, Binder #42 is NOT on their desk! They are forced to send a courier down to the basement anyway, paying the full 5-minute fetch delay on the very next instruction.

This office scenario is the exact physical analogue of **Cache Miss Allocation Strategies**:
* The executive is the **CPU Execution Core**.
* Writing a sentence is a **Store Instruction (`STORE`)**.
* The desktop notebook is the **L1 SRAM Data Cache**.
* The 64-page binder in the basement is a **64-Byte Main Memory Line in DRAM**.
* Fetching the entire binder before writing is **Write-Allocate (Fetch-on-Write)**.
* Mailing a sticky note without bringing the binder to the desk is **Write-No-Allocate (Write-Around)**.

---

## Primitive 1: The Write-Allocate (Fetch-on-Write) Policy

Now that we possess a clear, intuitive mental model of desktop binder allocation, let us examine the formal, rigorous engineering mechanics of **The Write-Allocate Policy**.

> **The Write-Allocate Policy** (also known as **Fetch-on-Write**) is a cache miss allocation strategy where a store instruction missing the cache causes the cache controller to fetch the missing 64-byte memory block from main memory into the L1 SRAM cache array *before* applying the store payload to the line.

---

### Detailed Hardware Execution Mechanics of Write-Allocate

Let us trace the exact step-by-step physical gate execution when a CPU core issues a store instruction targeting an address $A$ that is NOT present in the L1 Data Cache:

```text
WRITE-ALLOCATE HARDWARE EXECUTION FLOW

 CPU Issues Store Instruction (SW R1, [Addr A]) - MISS!
                         │
                         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 1: LINE FILL REQUEST                                   │
 │ Cache Controller issues 64-byte read request to L2 / DRAM   │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ (Waits 100-200 Clock Cycles for DRAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 2: SRAM LINE ALLOCATION & REPLACEMENT                  │
 │ Incoming 64B line arrives; written into allocated SRAM slot │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 3: STORE PAYLOAD MERGING                               │
 │ CPU 4-byte payload is merged into offset k of the SRAM line │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 4: FLAG UPDATES                                        │
 │ Valid Bit V = 1. If Write-Back: Dirty Bit D = 1             │
 └─────────────────────────────────────────────────────────────┘
```

#### Step 1: Miss Detection & Line Fill Request
1. The CPU dispatches a store instruction with target byte address $A$ and a 4-byte payload $W$ (`cpu_wdata = 32'h1234_5678`).
2. The L1 Data Cache checks its Tag array at set index $I = \text{Index}(A)$.
3. **Miss Confirmed**: No valid matching tag is found ($V == 0$ or $\text{Tag\_Mismatch}$).
4. The cache controller asserts `cpu_ready = 0` to stall the CPU pipeline and dispatches a **64-Byte Read Fill Request** to the lower-level memory hierarchy (L2 Cache or main DRAM) for the block starting at $\text{Line\_Start} = A \ \& \ \sim 63$.

#### Step 2: SRAM Line Allocation & Replacement
1. The memory controller returns the 64-byte block from main DRAM after a miss penalty delay ($T_{\text{fill}} \approx 120\text{ clock cycles}$).
2. The L1 cache controller selects an open or evicted SRAM slot in set index $I$ using the replacement policy (e.g., Tree-PLRU). If the evicted line was dirty, it is moved to the Write-Back Buffer.
3. The 64-byte line retrieved from DRAM is written into the selected L1 SRAM data array slot.

#### Step 3: Store Payload Merging
1. The cache controller extracts the 6-bit Offset field $k = \text{Offset}(A)$ from address $A$.
2. The CPU's 4-byte store payload $W$ (`32'h1234_5678`) is **merged into the newly allocated 64-byte SRAM line** at byte offset $k$, overwriting the 4 old bytes fetched from DRAM at that specific offset position!
3. The remaining 60 bytes in the 64-byte line retain the values fetched from DRAM.

#### Step 4: Metadata Flag Updates
* The Tag array at set index $I$ is updated with address $A$'s Tag bits.
* The **Valid Bit** is set to $1$ ($V \Leftarrow 1$).
* **If Paired with a Write-Back Policy**: The **Dirty Bit** is set to $1$ ($D \Leftarrow 1$) because the 4-byte merged payload makes the L1 SRAM line inconsistent with main memory.
* **If Paired with a Write-Through Policy**: The Dirty Bit remains $0$ ($D \Leftarrow 0$), and the 4-byte payload is simultaneously transmitted across the memory bus to lower memory.
* The cache controller asserts `cpu_ready = 1`, releasing the CPU pipeline stall!

---

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

---

## Primitive 2: The Write-No-Allocate (Write-Around) Policy

Now let us examine the opposite allocation strategy: **The Write-No-Allocate Policy** (also known as **Write-Around**).

> **The Write-No-Allocate Policy** (or **Write-Around**) is a cache miss allocation strategy where a store instruction missing the cache bypasses the L1 SRAM cache array entirely. The store payload is written directly to lower-level memory without loading the 64-byte block into L1 SRAM.

---

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

---

### Why Write-No-Allocate Pairs Naturally with Write-Through Caches

In commercial processor design, **Write-No-Allocate is almost universally paired with the Write-Through policy** (**WT + WNA**).

Why do Write-Through and Write-No-Allocate form such a natural pair?

Under a Write-Through policy, **every store operation must update lower-level memory anyway**, whether it hits or misses in L1. 

If a Write-Through cache used Write-Allocate on a store miss:
1. It would have to execute a **64-byte read fill** from DRAM to load the line into L1 SRAM.
2. It would then update the 4-byte word in L1 SRAM.
3. It would then execute a **4-byte write-through** to DRAM over the bus!

The system would pay the full 120-cycle DRAM line fill delay *and* a write-through bus transaction! 

If the program never reads that line again, the 120-cycle DRAM line fill was a complete waste of time and memory bandwidth.

By pairing Write-Through with **Write-No-Allocate**, store misses simply write around the L1 cache directly to lower memory, avoiding unnecessary 64-byte line fetches.

---

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

---

### How Write-No-Allocate Eliminates Cache Pollution

Now, consider what happens when the exact same `memset` function executes on a CPU using a **Write-No-Allocate** policy:

1. `memset` writes the first 4 bytes to address `0x10000`. This misses in L1.
2. Under **Write-No-Allocate**, the L1 cache controller **bypasses the L1 SRAM array completely**!
3. The 4-byte zero payload is sent directly across the bus to lower-level memory or written into a Write-Combining Buffer.
4. **The L1 Data Cache remains $100\%$ untouched!**

```text
CACHE PRESERVATION UNDER WRITE-NO-ALLOCATE

 Program executes: memset(buffer, 0, 10_MEGABYTES); (Streaming Writes)

 Under Write-No-Allocate:
 All 10 MB of zero-writes BYPASS the L1 Cache completely!
 L1 Cache STAYS: [ Loop Instruction Code | Stack Variables | Active Pointers ]
 (ACTIVE WORKING SET 100% PRESERVED! ZERO CACHE POLLUTION!)
```

Look at the result:
* **Zero DRAM Read Bandwidth Wasted**: The memory controller did not fetch a single byte of unwanted old data from DRAM.
* **$100\%$ Working Set Preservation**: The CPU's active working-set data remained safely inside the L1 SRAM cache. When `memset` finished, the CPU resumed executing normal application logic with **$100\%$ cache hits**!

---

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

---

### Pairing 2: Write-Through + Write-No-Allocate (WT + WNA)
* **Target Application**: Simple embedded processors, real-time microcontrollers, GPU texture/stream buffers, or L1 caches paired with a write-back L2 cache.
* **Why this pair works**:
  * Write-Through sends all writes to lower memory immediately, guaranteeing that lower memory is always $100\%$ consistent.
  * Write-No-Allocate prevents store misses from wasting 64-byte DRAM line fills for writes that may never be read again, preventing cache pollution.

---

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

---

## Advanced Hardware Optimizations: Zero-Fill Allocation and Write Combining

To eliminate the DRAM line fetch penalty even when using a Write-Allocate policy, modern processor architectures incorporate two advanced hardware optimizations: **Zero-Fill Allocation** and **Write-Combining Buffers**.

### 1. Zero-Fill Allocation (`dcbz` / `DC ZVA`)

Consider a program that is initializing a newly allocated 64-byte memory block by writing all 64 bytes sequentially from byte 0 to byte 63.

Under standard Write-Allocate:
* When the CPU writes byte 0, a store miss occurs.
* The cache controller spends 150 clock cycles fetching 64 bytes of old data from DRAM into L1 SRAM.
* The CPU then proceeds to overwrite **every single one of those 64 fetched bytes** with new data!

Fetching those 64 bytes from DRAM was $100\%$ pointless, because every single fetched byte was destroyed by the subsequent store instructions!

#### How Zero-Fill Allocation Solves the Problem:
Modern ISAs provide a specialized cache control instruction:
* **ARM64 ISA**: `DC ZVA` (Data Cache Zero by Virtual Address).
* **PowerPC ISA**: `dcbz` (Data Cache Block Set to Zero).
* **RISC-V ISA**: `CBO.ZERO` (Cache Block Zero).

```text
ZERO-FILL ALLOCATION (ALLOCATE WITHOUT DRAM READ FETCH)

 CPU executes: DC ZVA [Addr A] (Zero-Fill Cache Line Command)
             │
             ▼
 L1 Cache Controller allocates SRAM line for Addr A IMMEDIATELY!
 Sets all 64 bytes inside SRAM line to ZERO (0x00) in 1 Clock Cycle!
 Sets Valid V = 1, Dirty D = 1.
 (ZERO DRAM READ FETCH ISSUED! 150 CLOCK CYCLES SAVED!)
```

When a software runtime (such as `memset` or an OS page allocator) needs to initialize memory:
1. It executes `DC ZVA [Addr A]`.
2. The L1 cache controller allocates an SRAM cache line at address $A$ and **clears all 64 bytes inside the SRAM line to zero in 1 clock cycle**, setting $V = 1$ and $D = 1$.
3. **NO DRAM READ FETCH IS ISSUED!** The 150-cycle main memory fetch delay is completely bypassed!
4. The CPU writes its new data into the zeroed SRAM line at $1\text{-cycle}$ speeds.

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Write-Allocate versus Write-No-Allocate Performance and Bandwidth Analysis

To consolidate your complete mastery of write miss allocation strategies, cache line fill latencies, cache pollution dynamics, and memory bandwidth calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Analyze Kernel 1 (Iterative State Matrix Update - 16 KB)

* Array Size = $16\text{ KB} = 16,384\text{ bytes} = 4,096\text{ 32-bit floats}$.
* Total 64-byte cache lines in 16 KB array = $\frac{16,384}{64} = \mathbf{256 \text{ cache lines}}$.
* The 16 KB array fits completely inside the 32 KB L1 Data Cache ($16\text{ KB} \le 32\text{ KB}$).
* The loop runs 100 times, performing 4,096 stores per iteration ($409,600\text{ total stores}$).

##### Analysis of Configuration A (Write-Back + Write-Allocate):
1. **Pass 1 (Iteration 1)**:
   * The first store to each of the 256 lines incurs a **Write Miss**.
   * Under Write-Allocate, the cache controller fetches each 64-byte line from DRAM ($256\text{ line fills}$).
   * DRAM Read Traffic = $256 \times 64\text{ bytes} = 16,384\text{ bytes} = \mathbf{0.016384 \text{ MB}}$.
   * Stall cycles for Pass 1 = $256\text{ misses} \times 120\text{ cycles/miss} = 30,720\text{ cycles}$.
2. **Passes 2 through 100 (99 Iterations)**:
   * All 256 lines are now stored in L1 SRAM with $D = 1$.
   * All $405,504$ subsequent stores are **L1 CACHE HITS** ($100\%$ hit rate, $1\text{ cycle}$ latency, $0\text{ bus traffic}$)!
3. **Final Eviction**: When the loop ends, the 256 dirty lines are eventually written back to DRAM ($256 \times 64\text{ bytes} = 0.016384\text{ MB}$).

$$\text{Total Bus Traffic (Config A, Kernel 1)} = \text{Read Fills } (0.016\text{ MB}) + \text{Writebacks } (0.016\text{ MB}) = \mathbf{0.032768 \text{ MB}}$$

$$\text{Total Stall Cycles (Config A)} = 30,720\text{ cycles} \quad (\text{Only paid on Pass 1!})$$

$$\text{CPI}_{\text{effective,ConfigA}} = 1.0 + \frac{30,720\text{ stall cycles}}{409,600\text{ stores}} \approx \mathbf{1.075 \text{ cycles/instruction}}$$

---

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

---

#### Step 2: Analyze Kernel 2 (Streaming Memory Initialization - 4 MB `memset`)

* Buffer Size = $4\text{ Megabytes} = 4,194,304\text{ bytes} = 1,048,576\text{ 32-bit zero-stores}$.
* Total 64-byte cache lines = $\frac{4,194,304}{64} = \mathbf{65,536 \text{ cache lines}}$.
* The 4 MB buffer is written ONCE and NEVER read back.

##### Analysis of Configuration A (Write-Back + Write-Allocate):
1. Writing each 64-byte line incurs a store miss.
2. Under Write-Allocate, the cache controller fetches all 65,536 lines ($4\text{ MB}$) from DRAM into L1 SRAM first!
   * DRAM Read Traffic = $65,536 \times 64\text{ bytes} = \mathbf{4.194304 \text{ MB}}$.
   * Read Stall Cycles = $65,536\text{ misses} \times 120\text{ cycles/miss} = 7,864,320\text{ cycles}$.
3. As `memset` streams through 4 MB, it fills the 32 KB L1 cache and forces **all 65,536 dirty lines to be evicted back to DRAM**!
   * DRAM Write Traffic = $65,536 \times 64\text{ bytes} = \mathbf{4.194304 \text{ MB}}$.
4. **Cache Pollution Impact**: All active CPU code and stack variables in L1 SRAM are completely evicted and destroyed!

$$\text{Total Bus Traffic (Config A, Kernel 2)} = \text{Read Fills (4 MB)} + \text{Writebacks (4 MB)} = \mathbf{8.388608 \text{ MB}}$$

$$\text{Total Stall Cycles (Config A)} = \mathbf{7,864,320 \text{ cycles}}$$

$$\text{CPI}_{\text{effective,ConfigA}} = 1.0 + \frac{7,864,320}{1,048,576} = 1.0 + 7.50 = \mathbf{8.50 \text{ cycles/instruction}}$$

---

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

---

#### Step 3: Derive the Re-Access Reuse Threshold ($R_{\text{reuse}}$)

Under what general mathematical condition is Write-Allocate faster than Write-No-Allocate for a given 64-byte memory line?

Let $N_{\text{accesses}}$ be the total number of store operations executed on a 64-byte line before it is evicted.

* **Cost under Write-No-Allocate**: Every store pays a single-word write penalty $T_{\text{word\_write}}$:
  $$\text{Cost}_{\text{WNA}} = N_{\text{accesses}} \times T_{\text{word\_write}}$$
* **Cost under Write-Allocate**: The first store pays the 64-byte DRAM line fill penalty $T_{\text{fill}}$, and all subsequent $N_{\text{accesses}} - 1$ stores hit in L1 SRAM in $1\text{ clock cycle}$ ($T_{\text{hit}}$):
  $$\text{Cost}_{\text{WA}} = T_{\text{fill}} + ((N_{\text{accesses}} - 1) \times T_{\text{hit}})$$

Write-Allocate becomes faster than Write-No-Allocate when $\text{Cost}_{\text{WA}} < \text{Cost}_{\text{WNA}}$:

$$T_{\text{fill}} + ((N_{\text{accesses}} - 1) \cdot T_{\text{hit}}) < N_{\text{accesses}} \cdot T_{\text{word\_write}}$$

Solving for $N_{\text{accesses}}$ (assuming $T_{\text{hit}} \approx 1$ cycle):

$$T_{\text{fill}} - 1 < N_{\text{accesses}} \cdot (T_{\text{word\_write}} - 1)$$

$$\mathbf{R_{\text{reuse}} = N_{\text{accesses}} > \frac{T_{\text{fill}} - 1}{T_{\text{word\_write}} - 1}}$$

Where:
* $R_{\text{reuse}}$ is the minimum number of store re-accesses required for Write-Allocate to outperform Write-No-Allocate.
* $T_{\text{fill}}$ is the 64-byte DRAM read fill penalty in clock cycles.
* $T_{\text{word\_write}}$ is the single-word write-around penalty in clock cycles.

Substituting our system numbers ($T_{\text{fill}} = 120\text{ cycles}$, $T_{\text{word\_write}} = 20\text{ cycles}$):

$$R_{\text{reuse}} > \frac{120 - 1}{20 - 1} = \frac{119}{19} \approx \mathbf{6.26 \text{ accesses}}$$

##### Mathematical Threshold Result:
If a 64-byte line is written **7 or more times** before being evicted, **Write-Allocate is faster**.
If a 64-byte line is written **6 or fewer times** before being evicted, **Write-No-Allocate is faster**.

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Write-Allocate Policy (Fetch-on-Write)**: A cache miss allocation strategy where a store instruction missing the cache fetches the 64-byte block from main memory into the L1 SRAM cache array before applying the store payload, maximizing spatial and temporal locality for iterative write workloads.
* **Write-No-Allocate Policy (Write-Around)**: A cache miss allocation strategy where a store instruction missing the cache bypasses the L1 SRAM array completely, writing directly to lower-level memory to save DRAM read-fill bandwidth and prevent cache line pollution during streaming write workloads.
