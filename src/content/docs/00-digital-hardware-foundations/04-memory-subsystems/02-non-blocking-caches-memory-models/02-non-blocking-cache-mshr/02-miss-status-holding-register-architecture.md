---
title: "Miss Status Holding Register (MSHR) Architecture and Miss Merging Mechanics"
---

# Miss Status Holding Register (MSHR) Architecture and Miss Merging Mechanics

## The Multi-Miss Tracking Crisis and Redundant DRAM Fetch Saturation

When a modern out-of-order processor core executes high-performance software workloads, its instruction scheduler dispatches multiple memory read and write instructions (loads and stores) every single clock cycle. In a processor equipped with a non-blocking Level 1 (L1) Data Cache supporting Hit-Under-Miss (HUM) or Miss-Under-Miss (MUM) concurrency, the cache controller does not freeze when a cache miss occurs. It dispatches a line fill request to main Dynamic Random-Access Memory (DRAM) and keeps its input ports open to process subsequent instructions.

However, this non-blocking execution capability introduces two catastrophic hardware management problems when multiple memory requests miss the cache in rapid succession:

```text
THE MULTI-MISS TRACKING AND REDUNDANT FETCH CRISIS

 CPU Instruction Stream (Executed in Rapid Succession):
 Inst 1: LOAD R1, [0x1000] (Offset 0)  ──► MISS! (Dispatches Line Fill 0x1000)
 Inst 2: LOAD R2, [0x1004] (Offset 4)  ──► MISS! (Same 64B Line 0x1000!)
 Inst 3: LOAD R3, [0x2000] (Offset 0)  ──► MISS! (Line 0x2000)
 Inst 4: LOAD R4, [0x1008] (Offset 8)  ──► MISS! (Same 64B Line 0x1000!)
```

Look at the instructions arriving at the cache controller in this sequence:
1. **Instruction 1 (`LOAD R1, [0x1000]`)**: Misses in L1 Cache. The 64-byte line spanning addresses `0x1000` through `0x103F` is requested from main DRAM. Main DRAM takes 120 clock cycles ($37.5\text{ ns}$) to return the data line.
2. **Instruction 2 (`LOAD R2, [0x1004]`)**: Arrives on the next clock cycle and also misses! Notice that address `0x1004` sits inside the **EXACT SAME 64-byte cache line** (`0x1000` to `0x103F`) that Instruction 1 just requested from DRAM a nanosecond ago!
3. **Instruction 3 (`LOAD R3, [0x2000]`)**: Misses on a completely different memory block (`0x2000`).
4. **Instruction 4 (`LOAD R4, [0x1008]`)**: Misses on address `0x1008`, which ALSO sits inside the **EXACT SAME 64-byte cache line** (`0x1000`)!

If the non-blocking cache controller lacks an organized hardware tracking table, two severe system failures occur:

### Failure 1: The Routing Metadata Breakdown
When main DRAM finally returns the 64-byte line for `0x1000` 120 clock cycles later, how does the cache controller remember which CPU destination registers are waiting for which byte offsets within that line? 
* $R1$ needs the word at offset 0 (`0x1000`).
* $R2$ needs the word at offset 4 (`0x1004`).
* $R4$ needs the word at offset 8 (`0x1008`).

If the cache controller loses track of these pending instruction registers, it cannot route the returning data to the CPU pipeline. Dependent instructions waiting in reservation stations will wait forever, hanging the processor!

### Failure 2: Redundant DRAM Bus Flooding
If the non-blocking cache dispatches a new off-chip DRAM read request every single time a load instruction misses:
* Instruction 1 issues a 64-byte line fill request for block `0x1000`.
* Instruction 2 issues a second 64-byte line fill request for block `0x1000`.
* Instruction 4 issues a third 64-byte line fill request for block `0x1000`.

The cache controller transmits **three separate 64-byte line fill requests across the memory bus for the EXACT SAME 64 bytes of data**!

```text
REDUNDANT DRAM FETCH FLOODING (WITHOUT MISS MERGING)

 Inst 1 Miss (0x1000) ──► Dispatch DRAM Line Fill 1 (64 Bytes for 0x1000)
 Inst 2 Miss (0x1004) ──► Dispatch DRAM Line Fill 2 (64 Bytes for 0x1000 - REDUNDANT!)
 Inst 4 Miss (0x1008) ──► Dispatch DRAM Line Fill 3 (64 Bytes for 0x1000 - REDUNDANT!)
 (Memory bus flooded with 3 identical 64B requests! 66% Bus Bandwidth WASTED!)
```

The memory interconnect bus is flooded with redundant requests. Memory bandwidth is wasted by $66\%$, DRAM banks suffer unnecessary row buffer conflicts, and the entire memory subsystem stalls.

To solve both problems simultaneously—tracking in-flight miss metadata and coalescing duplicate requests into a single DRAM fetch—digital hardware engineering relies on a fundamental microarchitectural component: **The Miss Status Holding Register (MSHR) Architecture** and **Miss Merging Mechanics**.


### Step 1: Processing Order 1 (Primary Miss)
At 6:00 PM, Customer 1 orders a portion of **Lobster Tail** (Address `0x1000`, Byte Offset 0).

1. The Pantry Clerk checks the local pantry shelf: **No Lobster!** (Cache Miss!).
2. The Clerk checks the Order Tracking Clipboard (MSHR Table) to see if a crate of lobsters is already being delivered: **No active clip for Lobster!**
3. The Clerk attaches a **New Order Clip (Allocates a Primary MSHR Header)** to the clipboard:
   * **Header Label**: Item Needed = "Crate of Lobsters" (Block Address `0x1000`).
   * **Status**: Delivery Truck Requested.
   * **Customer Delivery List (Sub-Entry 0)**: Deliver Portion 0 to Customer 1 (`LOAD R1`).
4. The Clerk calls the grocery warehouse and orders **1 single crate of lobsters** (Dispatches 1 DRAM Line Fill Request).

```text
STEP 1: PRIMARY MISS (NEW MSHR HEADER ALLOCATED)

 MSHR Clip 0 (Primary Miss):
 ┌─────────────────────────────────────────────────────────────────┐
 │ Header: Block Address 0x1000 | Status: DRAM Delivery Dispatched │
 ├─────────────────────────────────────────────────────────────────┤
 │ Sub-Entry 0: Customer 1 | Portion 0 (LOAD R1)                   │
 └─────────────────────────────────────────────────────────────────┘
 (Dispatched 1 Crate Request to Grocery Warehouse)
```


### Step 3: Processing Order 3 (A Different Primary Miss)
At 6:02 PM, Customer 3 orders a **Steak** (Address `0x2000`, Byte Offset 0).

1. The Clerk checks the pantry: No Steak!
2. The Clerk checks the Order Tracking Clipboard: Clip 0 is for Lobster (`0x1000`). Steak (`0x2000`) does not match Clip 0!
3. The Clerk attaches a **New Order Clip (Clip 1 / Primary MSHR Header)** for "Crate of Steaks" (`0x2000`), appends Customer 3 (`LOAD R3`), and calls the warehouse for 1 crate of steaks.


### Step 5: Crate Arrival and Multi-Target Forwarding (Deallocation)

At 7:30 PM (150 minutes later), the delivery truck arrives at the kitchen with the **Crate of Lobsters** (Block `0x1000` arrives from DRAM).

1. The Pantry Clerk places the crate of lobsters onto the local pantry shelf (Writes 64-byte line into L1 SRAM).
2. The Clerk un-clips **Clip 0** from the wall and reads the Customer Delivery List:
   * **Sub-Entry 0**: Deliver Portion 0 to Customer 1 (`R1`).
   * **Sub-Entry 1**: Deliver Portion 4 to Customer 2 (`R2`).
   * **Sub-Entry 2**: Deliver Portion 8 to Customer 4 (`R4`).
3. The Clerk hands out all three portions to Customers 1, 2, and 4 **AT THE EXACT SAME INSTANT** (**Multi-Target Store Forwarding**)!
4. Clip 0 is removed from the clipboard, freeing the slot for future orders.

```text
CRATE ARRIVAL AND MULTI-TARGET DELIVERY

 Crate of Lobsters Arrives (Line 0x1000 loaded into L1 SRAM)
                             │
                             ├─► Portion 0 delivered to Customer 1 (R1)
                             ├─► Portion 4 delivered to Customer 2 (R2)
                             └─► Portion 8 delivered to Customer 4 (R4)
 (All 3 customers served simultaneously from 1 single delivery!)
```

This Order Tracking Clipboard is the exact physical analogue of a **Miss Status Holding Register (MSHR) Unit**:
* The Order Tracking Clipboard is the **MSHR Hardware Table**.
* The Order Clips (Clip 0, Clip 1) are **Primary MSHR Headers**.
* The Customer Delivery Lists are **Secondary Miss Target Sub-Entries**.
* Ordering a crate from the warehouse is a **Primary DRAM Line Fill Request**.
* Appending a customer to an existing clip is **Secondary Miss Merging**.
* Serving Customers 1, 2, and 4 simultaneously on arrival is **Multi-Target Data Forwarding**.


## Primitive 2: Miss Merging Mechanics (Primary vs. Secondary Misses)

Now let us examine how the MSHR controller processes incoming cache misses and executes **Miss Merging**.

When a memory load or store instruction misses the L1 Data Cache, the cache controller extracts the 64-byte block address $A_{\text{block}} = A \ \& \ \sim 63$ and presents it to the MSHR unit.

The MSHR unit passes $A_{\text{block}}$ through a bank of **parallel block address comparators** attached to all valid MSHR headers ($V_k == 1$):

```text
MSHR PARALLEL ADDRESS COMPARATOR LOOKUP

 Incoming Miss Block Address A_block
       │
       ├────────────────────────┬────────────────────────┐
       ▼                        ▼                        ▼
 [ Comparator 0 ]         [ Comparator 1 ]   ...   [ Comparator K-1 ]
 Compares A_block vs      Compares A_block vs      Compares A_block vs
 Header 0 Block Addr      Header 1 Block Addr      Header K-1 Block Addr
       │                        │                        │
       ▼                        ▼                        ▼
  Match Header 0?          Match Header 1?          Match Header K-1?
```

Depending on the comparator outputs, the MSHR unit executes one of three operational flows:


### Flow 2: Secondary Miss Processing (Miss Merging Hit!)

If a valid MSHR header $k$ matches $A_{\text{block}}$ ($V_k == 1 \quad \mathbf{\text{AND}} \quad \text{Header\_Addr}_k == A_{\text{block}}$):
1. The miss is classified as a **Secondary Miss**. A line fill request for this exact 64-byte block is **ALREADY traveling across the memory bus**!
2. **MISS MERGING EXECUTED!**
3. **ZERO new requests are sent to the memory bus!**
4. The MSHR controller checks Header $k$'s sub-entry list for an open target slot.
5. **Sub-Entry Allocation**: The controller appends a new sub-entry to Header $k$, recording the new CPU instruction's destination register ID and byte offset.
6. The CPU pipeline resumes execution of non-dependent instructions!

```text
MISS MERGING DECISION FLOWCHART

 Incoming Cache Miss at Address A_block
                   │
         Does A_block match an
         active MSHR Header?
                   │
         ┌─────────┴─────────┐
         │ YES               │ NO
         ▼                   ▼
 SECONDARY MISS             PRIMARY MISS
 (Miss Merging Hit!)        (Allocate New MSHR Header)
 Do NOT issue bus request!  Dispatch 64B Line Fill
 Append Sub-Entry to        Request to Memory Bus!
 existing MSHR Header!
```

#### Why Miss Merging Is a Fundamental Hardware Optimization:
Consider a loop traversing an array of 64-bit integers (`uint64_t array[8]`). All 8 integers sit inside a single 64-byte cache line.
* Without Miss Merging: The 8 loads trigger **8 separate off-chip DRAM line fill requests** for the exact same block.
* With Miss Merging: The first load issues 1 Primary Miss. The next 7 loads execute as **Secondary Misses**, merging into the first MSHR header in 1 clock cycle.
* Off-chip bus traffic is reduced by **$87.5\%$**, and 7 redundant DRAM fetches are completely eliminated!


## MSHR Refill, Multi-Target Forwarding, and Deallocation

Now let us examine what happens when main DRAM memory completes a 64-byte line fill and returns the data payload to the L1 Data Cache.

```text
LINE ARRIVAL, REFILL, AND MULTI-TARGET FORWARDING FLOW

 64-Byte Line Payload Arrives from Main DRAM (Block Addr A_block)
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 1: MSHR HEADER MATCH                                   │
 │ Match A_block against MSHR Headers -> Locate Header k       │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 2: SRAM ARRAY REFILL                                   │
 │ Write 64-byte line into allocated SRAM slot (Set I, Way W)  │
 │ Update Tag array, set Valid V = 1, set Dirty D (if store)   │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 3: MULTI-TARGET FORWARDING                             │
 │ Iterate through all active Sub-Entries in Header k:         │
 │  * Sub-Entry 0: Extract Word at Offset 0  -> Forward to R1  │
 │  * Sub-Entry 1: Extract Word at Offset 4  -> Forward to R2  │
 │  * Sub-Entry 2: Extract Word at Offset 8  -> Forward to R4  │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 4: MSHR DEALLOCATION                                   │
 │ Clear Valid bit V_k = 0. Header k freed for future misses!  │
 └─────────────────────────────────────────────────────────────┘
```


## Architectural Sizing Trade-Offs: How Many MSHRs Are Needed?

In commercial microprocessor design, selecting the number of MSHR headers ($K$) and sub-entries ($S_{\text{target}}$) requires balancing instruction-level parallelism against silicon area and timing closure.

```text
MSHR SIZING TRADE-OFF MATRIX

 MSHR Table Configuration │ Memory Concurrency (MUM) │ Hardware Area & Power │ Best Application
──────────────────────────┼──────────────────────────┼───────────────────────┼───────────────────────────────
 Small (2 Headers, 2 Sub) │ Low (Max 2 Misses)       │ Minimal Area          │ Embedded Microcontrollers
 Medium (4 Headers, 4 Sub)│ Moderate (4 Misses)      │ Low Power / Area      │ Mobile Application Cores
 Large (16 Headers, 8 Sub)│ High (16 Misses / 128 Target)│ Significant Area    │ High-Performance Server CPUs
```

### The Little's Law Memory Parallelism Equation

To determine the minimum number of MSHR headers $K_{\text{min}}$ required to keep a CPU pipeline operating at full throughput without stalling on memory misses, computer architects use **Little's Law**:

$$K_{\text{min}} = \text{Bandwidth} \times \text{Latency} = \text{Miss\_Rate} \times \text{IPC} \times T_{\text{penalty}}$$

Where:
* $K_{\text{min}}$ is the minimum number of active MSHR headers required to prevent MSHR full stalls.
* $\text{Miss\_Rate}$ is the L1 cache miss rate per instruction ($0.0 \le \text{Miss\_Rate} \le 1.0$).
* $\text{IPC}$ is the target instructions executed per clock cycle.
* $T_{\text{penalty}}$ is the main memory DRAM miss penalty in clock cycles.

#### Example Calculation:
Suppose a server core executes $\text{IPC} = 2.0$ instructions per cycle with a miss rate of $3\%$ ($\text{Miss\_Rate} = 0.03$), and main memory latency is $T_{\text{penalty}} = 100\text{ clock cycles}$:

$$K_{\text{min}} = 0.03 \times 2.0 \times 100 = \mathbf{6.0 \text{ MSHR Headers}}$$

To prevent MSHR full stalls on this workload, the processor core **MUST feature at least 6 MSHR headers**! 

If the architect installs only 2 MSHR headers, the MSHR table will fill up constantly, forcing the out-of-order CPU to stall and destroying execution throughput.


### Scenario and Parameters

You are a principal memory systems architect auditing an L1 Data Cache MSHR unit for a $3.2\text{ GHz}$ 64-bit out-of-order processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The L1 Data Cache is non-blocking with 64-byte lines ($L = 64\text{ bytes}$).

The MSHR Unit is configured with:
* **$K = 4$ Primary MSHR Headers** (Header 0, Header 1, Header 2, Header 3).
* **$S_{\text{target}} = 4$ Secondary Sub-Entries per Header** (Sub-Entry 0, 1, 2, 3).
* Main DRAM Miss Penalty: $T_{\text{penalty}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).
* Interconnect Bus Capacity: $1\text{ 64-byte line fill request}$ dispatched per clock cycle.

```text
3.2 GHz PROCESSOR WITH 4-HEADER / 4-SUBENTRY MSHR UNIT

 CPU Core (3.2 GHz) ──► [ MSHR Unit (4 Headers x 4 Sub-Entries) ] ──► Main Memory DRAM
 Clock T = 312.5 ps     L1 Line Size = 64 Bytes                       Miss Penalty = 120 Cycles
```

#### The Workload Instruction Stream:
The CPU pipeline executes twelve 64-bit load instructions (`LD`) on twelve consecutive clock cycles ($t = 1 \dots 12$). None of the requested lines are currently in the L1 Cache:

1. $t = 1$: `LD R1, [0x00010000]` (Block `0x10000`, Offset 0)
2. $t = 2$: `LD R2, [0x00010008]` (Block `0x10000`, Offset 8)
3. $t = 3$: `LD R3, [0x00020000]` (Block `0x20000`, Offset 0)
4. $t = 4$: `LD R4, [0x00010010]` (Block `0x10000`, Offset 16)
5. $t = 5$: `LD R5, [0x00020008]` (Block `0x20000`, Offset 8)
6. $t = 6$: `LD R6, [0x00030000]` (Block `0x30000`, Offset 0)
7. $t = 7$: `LD R7, [0x00010018]` (Block `0x10000`, Offset 24)
8. $t = 8$: `LD R8, [0x00040000]` (Block `0x40000`, Offset 0)
9. $t = 9$: `LD R9, [0x00010020]` (Block `0x10000`, Offset 32 — **Note: Target list for `0x10000` is now FULL!**)
10. $t = 10$: `LD R10, [0x00050000]` (Block `0x50000`, Offset 0 — **Note: MSHR Headers are now FULL!**)
11. $t = 11$: `LD R11, [0x00020010]` (Block `0x20000`, Offset 16)
12. $t = 12$: `LD R12, [0x00030008]` (Block `0x30000`, Offset 8)

#### Your Objective

1. Trace the step-by-step MSHR Header allocations, Secondary Miss Merging events, and Sub-Entry list occupancies for each of the 12 load instructions.
2. Identify which instructions trigger **Primary Misses**, which trigger **Secondary Misses**, and which trigger **MSHR Full Stalls**.
3. Calculate the total off-chip DRAM line fill requests dispatched **WITH MSHR Miss Merging** versus **WITHOUT Miss Merging**, quantifying the percentage reduction in memory bus traffic.
4. Trace the line arrival at $t = 121$ when Block `0x10000` returns from DRAM, showing multi-target data forwarding for registers $R1, R2, R4, R7$.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Bus Bandwidth Savings

Let us evaluate off-chip DRAM line fill requests generated across the 12 load instructions:

##### 1. Without MSHR Miss Merging (Naive Non-Blocking Cache):
* Every one of the 12 load instructions dispatches an independent 64-byte line fill to DRAM.
* Total DRAM Line Fill Requests = **12 Requests** ($12 \times 64 = 768\text{ Bytes}$).

##### 2. With MSHR Miss Merging:
* Primary Misses occurred for blocks `0x10000`, `0x20000`, `0x30000`, `0x40000`.
* Total DRAM Line Fill Requests = **4 Requests** ($4 \times 64 = 256\text{ Bytes}$).
* Secondary Merged Misses = **6 Instructions** (Inst 2, 4, 5, 7, 11, 12).

##### Bus Bandwidth Reduction Calculation:

$$\text{Bandwidth Savings} = \left( 1 - \frac{4 \text{ Requests}}{12 \text{ Requests}} \right) \times 100\% = \left( 1 - 0.333 \right) \times 100\% = \mathbf{66.7\% \text{ Bus Traffic Reduction!}}$$

Where:
* $4$ is the number of primary DRAM line fills dispatched.
* $12$ is the total number of line fill requests that would have been sent without merging.

Miss Merging eliminated **$66.7\%$ of off-chip memory bus traffic**, saving $512\text{ bytes}$ of redundant line fill bandwidth!


### Sanity Check and Verification

Let us verify our mathematical and structural results against hardware MSHR principles:

1. **Sub-Entry Capacity Check**:
   * Header 0 tracked 4 sub-entries (`R1, R2, R4, R7`).
   * Attempting to add a 5th sub-entry (`R9`) correctly triggered an MSHR sub-entry full stall, preserving table integrity.
2. **Primary vs Secondary Miss Count**:
   * Out of 12 instructions, 4 were Primary Misses, 6 were Secondary Merged Misses, and 2 were Stalled.
   * $\text{Primary} + \text{Secondary} + \text{Stalls} = 4 + 6 + 2 = 12$. Total instruction count verified!
3. **Multi-Target Forwarding Verification**:
   * Four registers received data simultaneously from a single 64-byte DRAM line fill, validating $100\%$ forwarding correctness.

All MSHR table allocations, primary vs. secondary miss classifications, secondary miss merging events, bus bandwidth reductions, and multi-target data forwarding operations evaluate with 100% mathematical, physical, and logical precision.

