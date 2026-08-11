content/00-digital-hardware-foundations/04-memory-subsystems/lessons/02-non-blocking-caches-memory-models/02-non-blocking-cache-mshr/01-non-blocking-cache-concurrency.md
# Non-Blocking Cache Concurrency and Hit-Under-Miss Architecture

## The Single-Miss Lockup Bottleneck in Out-of-Order Processors

In modern high-performance microprocessor design, central processing unit (CPU) cores employ **Out-of-Order (OoO) Execution Engines**. An out-of-order processor does not execute instructions in rigid, linear program sequence. Instead, if an instruction stalls waiting for data, the out-of-order instruction scheduler scans ahead in the instruction window, finds subsequent independent instructions whose inputs are already available, and dispatches them to execution units immediately.

However, when an out-of-order processor is paired with a traditional, basic memory cache—known as a **Blocking (or Lockup) Cache**—the entire out-of-order execution engine is rendered useless the moment a single memory read miss occurs.

Consider what happens inside a high-speed $4.0\text{-GHz}$ processor core ($250\text{-picosecond}$ clock cycle) when it executes a sequence of memory load instructions:

```c
// CPU INSTRUCTION WINDOW (OUT-OF-ORDER EXECUTION)
LOAD R1, [0x1000] // Instruction 1: MISS! Address 0x1000 NOT in L1 Cache!
LOAD R2, [0x2000] // Instruction 2: Independent load (Address 0x2000 is in L1!)
LOAD R3, [0x2004] // Instruction 3: Independent load (Address 0x2004 is in L1!)
ADD  R4, R2, R3   // Instruction 4: Arithmetic operation depending on R2 and R3
```

Trace the execution timeline of this code under a **Blocking Cache Architecture**:

1. **Instruction 1 (`LOAD R1, [0x1000]`)**: The processor requests address `0x1000`. The L1 Data Cache checks its SRAM array and detects a **Cache Miss**.
2. **Main Memory Fetch Initiated**: The cache controller dispatches a 64-byte line fill request across the memory interconnect bus to main DRAM. Main DRAM takes **150 clock cycles** ($37.5\text{ nanoseconds}$) to retrieve the line.
3. **THE BLOCKING LOCKUP CATASTROPHE**:
   The blocking cache controller **locks its input ports completely** ($cpu\_ready = 0$).
   While waiting for address `0x1000` to arrive from DRAM over the next 150 clock cycles, the blocking cache **refuses to accept ANY new memory requests** from the CPU core!

```text
BLOCKING CACHE LOCKUP CATACLYSM

 Time t0 : LOAD R1, [0x1000] ──► L1 Cache MISS! (Dispatches 150-Cycle DRAM Fetch)
                                 CACHE CONTROLLER LOCKS INPUT PORTS (cpu_ready = 0)!
                                 │
 Time t1 : LOAD R2, [0x2000] ──► STALLED! (Cache locked, cannot check 0x2000!)
 Time t2 : LOAD R3, [0x2004] ──► STALLED! (Cache locked, cannot check 0x2004!)
 Time t3 : ADD  R4, R2, R3   ──► STALLED! (Waiting for R2 and R3!)
 (CPU Out-of-Order Window FROZEN for 150 cycles, despite R2/R3 data sitting in L1!)
```

Look at the physical tragedy of this hardware lockup:
* Instructions 2 and 3 (`LOAD R2` and `LOAD R3`) target address `0x2000` and address `0x2004`.
* The data for addresses `0x2000` and `0x2004` is **already sitting inside the local L1 SRAM array**, ready to be delivered in just $1\text{ clock cycle}$!
* Instruction 4 (`ADD R4, R2, R3`) is completely independent of `R1`. It could execute immediately if `R2` and `R3` were delivered!

Yet, because the blocking cache locked its input interface on the first miss, **it forced the entire CPU core to freeze for 150 clock cycles**! 

The multi-million-transistor out-of-order instruction scheduler is rendered completely impotent. The processor spends $99\%$ of its time standing idle, blocked by a single line fill traveling over the memory bus.

How do we eliminate this single-miss lockup bottleneck? How do we build an L1 Data Cache that remains **unlocked and fully operational** during a cache miss, allowing the CPU to continue serving fast $1\text{-cycle}$ hits for independent memory addresses while main DRAM fetches the missing line in the background?

To achieve true memory concurrency in modern processors, computer architects replace blocking caches with **Non-Blocking Caches** (also known as **Lockup-Free Caches**) capable of **Hit-Under-Miss (HUM)** and **Miss-Under-Miss (MUM)** operation.

---

## The Restaurant Kitchen and the Out-of-Stock Special: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of non-blocking cache concurrency and hit-under-miss operation before inspecting hardware control datapaths and transaction overlap equations, let us consider an everyday analogy: **The Busy Restaurant Kitchen**.

Imagine a high-volume restaurant kitchen staffed by an aggressive Head Chef (**The Out-of-Order CPU Core**) and a Pantry Clerk (**The L1 Cache Controller**).

```text
THE RESTAURANT KITCHEN AND PANTRY CLERK METAPHOR

 Head Chef (CPU Core)                 Pantry Clerk (L1 Cache)
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ Out-of-Order Orders      │        │ Local Pantry Shelves      │
 │ Dispatches Food Requests  │        │ Holds 1,000 Ingredients   │
 └───────────────────────────┘        └───────────────────────────┘
   (Executes Independent Instructions)  (High-Speed SRAM Storage)
```

The restaurant pantry (**L1 Data Cache**) holds common cooking ingredients on its local shelves. The central grocery warehouse (**Main System DRAM Memory**) is located across town, requiring a **30-minute delivery truck drive** ($1,800\text{ seconds}$).

Let us compare two different pantry management policies when the kitchen receives customer dinner orders:

---

### Strategy 1: The Blocking Pantry Clerk (Blocking / Lockup Cache)

The restaurant hires a stubborn Pantry Clerk who enforces a rigid rule: *"I process ingredients one dish at a time. If an ingredient is missing, I lock the pantry door and do nothing else until the truck arrives."*

1. **6:00 PM (Order 1: Lobster Tail)**: The Head Chef asks the clerk for Lobster. The clerk looks at the pantry shelf: **No Lobster!** (Cache Miss!).
2. The clerk calls the grocery warehouse to dispatch a delivery truck (30-minute delivery delay).
3. **6:01 PM (Order 2: Cheeseburger)**: The Head Chef asks the clerk for a Beef Patty.
   * The pantry shelf has **500 Beef Patties sitting right on the front shelf**!
   * But the Blocking Clerk **locks the pantry door** and shouts: *"No! I am waiting for the lobster truck! Nobody gets any ingredients until the lobster arrives!"*
4. **6:02 PM (Order 3: Caesar Salad)**: The chef asks for Lettuce. The pantry has 100 heads of fresh lettuce on the shelf. The clerk refuses to open the door!
5. **6:30 PM**: The lobster truck arrives. The clerk hands out the lobster, opens the pantry door, and finally hands out the beef patty and lettuce.

```text
BLOCKING PANTRY CLERK (KITCHEN FROZEN FOR 30 MINUTES)

 06:00 PM: Order 1 (Lobster)  ──► Out of Stock! (Dispatches 30-Min Delivery Truck)
                                  CLERK LOCKS PANTRY DOOR!
 06:01 PM: Order 2 (Burger)   ──► BLOCKED! (Pantry door locked!)
 06:02 PM: Order 3 (Salad)    ──► BLOCKED! (Pantry door locked!)
 (Kitchen sits idle for 30 minutes, even though Burger and Salad were on the shelf!)
```

Look at how terrible this is! Customers 2 and 3 sit starving for 30 minutes even though their food was sitting right on the pantry shelf. The Head Chef's high-speed kitchen stalls completely.

---

### Strategy 2: The Non-Blocking Pantry Clerk (Hit-Under-Miss Capability)

The restaurant fires the stubborn clerk and hires a **Non-Blocking Pantry Clerk**:

1. **6:00 PM (Order 1: Lobster Tail)**: The Head Chef asks for Lobster. The clerk looks at the shelf: No Lobster!
2. The non-blocking clerk writes a note on a clipboard ("Lobster needed for Table 1"), calls the grocery warehouse, and **LEAVES THE PANTRY DOOR WIDE OPEN**!
3. **6:01 PM (Order 2: Cheeseburger)**: The Head Chef asks for a Beef Patty.
   * The non-blocking clerk reaches onto the pantry shelf, grabs a beef patty in **1 second**, and hands it to the chef (**Hit-Under-Miss**)!
   * The chef cooks and serves the Cheeseburger to Customer 2 immediately!
4. **6:02 PM (Order 3: Caesar Salad)**: The chef asks for Lettuce. The clerk grabs the lettuce in **1 second** (**Hit-Under-Miss**)!
   * Customer 3 eats their salad immediately!
5. **6:30 PM**: The lobster truck arrives. The clerk hands the lobster to the chef, and Customer 1 eats.

```text
NON-BLOCKING PANTRY CLERK (HIT-UNDER-MISS CONCURRENCY)

 06:00 PM: Order 1 (Lobster)  ──► Out of Stock! (Dispatches Truck & Keeps Door Open!)
 06:01 PM: Order 2 (Burger)   ──► Grabbed from shelf in 1 sec! (Hit-Under-Miss!)
 06:02 PM: Order 3 (Salad)    ──► Grabbed from shelf in 1 sec! (Hit-Under-Miss!)
 06:30 PM: Order 1 Delivered! ──► Lobster arrives from truck.
 (Customers 2 and 3 ate in 1 second! Only Customer 1 waited for the truck!)
```

Notice what this non-blocking pantry clerk achieved:
* **Zero Artificial Stalls**: Orders 2 and 3 paid **zero delivery truck delay** because their ingredients were served straight from the shelf while the lobster truck was on the highway.
* **Decoupled Miss Servicing**: Missing ingredients are fetched in the background without blocking access to available ingredients.
* **Massive Kitchen Throughput**: The restaurant served 2 full meals during the 30-minute wait instead of serving 0 meals!

This non-blocking pantry clerk is the exact physical analogue of a **Non-Blocking L1 Data Cache**:
* The Head Chef is the **Out-of-Order CPU Execution Core**.
* The pantry shelves are the **On-Chip L1 SRAM Data Cache Array**.
* The central grocery warehouse is **Main System DRAM Memory**.
* The 30-minute delivery truck trip is the **Main Memory Miss Penalty ($150\text{ cycles}$)**.
* Serving burgers and salads in 1 second while waiting for lobster is **Hit-Under-Miss (HUM) Concurrency**.

---

## Primitive 1: Non-Blocking (Lockup-Free) Cache Architecture

Now that we possess a clear, intuitive mental model of non-blocking pantry management, let us examine the formal, rigorous engineering mechanics of **Non-Blocking Cache Architecture**.

> A **Non-Blocking Cache** (or **Lockup-Free Cache**) is a cache memory controller that decouples memory miss processing from CPU pipeline request acceptance, allowing the CPU to continue issuing memory requests and receiving cache hits for independent memory addresses while one or more cache misses are being serviced concurrently in the background by lower-level memory.

```text
NON-BLOCKING CACHE DECOUPLED ARCHITECTURE

 CPU Pipeline Memory Requests
             │
             ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ NON-BLOCKING CACHE CONTROLLER                               │
 │                                                             │
 │  ┌───────────────────────┐       ┌───────────────────────┐  │
 │  │ SRAM Hit Lookup Path  │       │ Miss Tracking Unit    │  │
 │  │ (Always Open for Hits)│       │ (Handles Pending Miss)│  │
 │  └───────────┬───────────┘       └───────────┬───────────┘  │
 └──────────────┼───────────────────────────────┼──────────────┘
                │                               │
                ▼                               ▼
       1-Cycle L1 Hits to CPU        Background DRAM Line Fills
```

---

### The Operational Modes of Non-Blocking Caches

Depending on how many concurrent memory misses a non-blocking cache can handle simultaneously, computer architects classify non-blocking caches into two operational capabilities:

#### 1. Hit-Under-Miss (HUM) Capability
* **Definition**: The cache controller can process new incoming memory requests and serve L1 cache hits while **a single cache miss** ($1\text{ miss}$) is being fetched from lower memory in the background.
* **Hardware Requirement**: Requires 1 pending miss tracking register and a decoupled request acceptance interface that maintains `cpu_ready = 1` during a miss.

#### 2. Miss-Under-Miss (MUM) / Multiple-Miss Concurrency
* **Definition**: The cache controller can handle **multiple concurrent outstanding cache misses** ($2, 4, 8, \text{or } 16$ active misses) simultaneously!
* **Mechanism**: If Instruction 1 misses on address $A_1$, and Instruction 5 misses on address $A_2$, the non-blocking cache dispatches **both line fill requests to main memory concurrently**, overlapping their DRAM access latencies!

```text
MISS-UNDER-MISS (MUM) LATENCY OVERLAPPING

 Single-Miss Serial Fetch (Blocking / HUM):
 Miss 1 (Address A1) ──► [ DRAM Fetch 150 Cycles ]
 Miss 2 (Address A2) ─────────────────────────────► [ DRAM Fetch 150 Cycles ]
 Total Delay = 300 Cycles!

 Multi-Miss Overlapped Fetch (Miss-Under-Miss):
 Miss 1 (Address A1) ──► [ DRAM Fetch 150 Cycles ]
 Miss 2 (Address A2) ──► [ DRAM Fetch 150 Cycles ] (Dispatched concurrently!)
 Total Delay = 152 Cycles! (148 Cycles Saved via Latency Overlap!)
```

Look at the power of Miss-Under-Miss concurrency:
By issuing Miss 1 and Miss 2 to main DRAM simultaneously, the $150\text{-cycle}$ DRAM latencies run in parallel! Both memory blocks arrive at nearly the exact same time, cutting total memory stall time in half!

---

## Primitive 2: Hit-Under-Miss (HUM) Mechanics and Pipeline Execution

Let us trace the step-by-step physical gate execution of a **Hit-Under-Miss (HUM)** access sequence in an out-of-order processor.

Consider a CPU executing four memory load instructions:

```c
LOAD R1, [0x1000] // Inst 1: MISS! (Line 0x1000 not in L1)
LOAD R2, [0x2000] // Inst 2: HIT!  (Line 0x2000 in L1)
LOAD R3, [0x2004] // Inst 3: HIT!  (Line 0x2004 in L1)
LOAD R4, [0x3000] // Inst 4: MISS! (Line 0x3000 not in L1)
```

Let us trace the hardware timeline inside a Non-Blocking Cache supporting Hit-Under-Miss:

```text
NON-BLOCKING HIT-UNDER-MISS EXECUTION TIMELINE

 Cycle 1 : LOAD R1, [0x1000] ──► L1 Cache MISS!
                                 * Captures miss metadata (Address 0x1000, Target R1).
                                 * Dispatches 150-cycle DRAM fetch for 0x1000.
                                 * MAINTAINS cpu_ready = 1! (DOES NOT LOCK CACHE!)

 Cycle 2 : LOAD R2, [0x2000] ──► L1 Cache HIT!
                                 * Reads SRAM array line 0x2000 in 1 cycle.
                                 * Delivers data word to R2 on Cycle 3! (CPU CONTINUES!)

 Cycle 3 : LOAD R3, [0x2004] ──► L1 Cache HIT!
                                 * Reads SRAM array line 0x2004 in 1 cycle.
                                 * Delivers data word to R3 on Cycle 4! (CPU CONTINUES!)

 Cycle 4..150: Out-of-order engine executes non-dependent instructions...

 Cycle 151: Line 0x1000 arrives from DRAM!
            * Writes 64-byte line into L1 SRAM array.
            * Forwards requested word directly to R1.
            * Un-stalls instructions waiting on R1!
```

---

### Step-by-Step Hardware Analysis:

1. **Cycle 1 (`LOAD R1, [0x1000]`)**:
   * Address `0x1000` is checked in the SRAM tag array. **Miss confirmed!**
   * The non-blocking controller captures the miss information (address `0x1000`, target destination register `R1`) and dispatches a 64-byte line fill request to main DRAM.
   * **Crucial Difference**: The controller **keeps `cpu_ready = 1`**! It does NOT stall the CPU pipeline!
2. **Cycle 2 (`LOAD R2, [0x2000]`)**:
   * On the very next clock cycle, the CPU issues `LOAD R2, [0x2000]`.
   * The non-blocking cache processes `0x2000` through its SRAM lookup pipeline.
   * **Hit confirmed!** Data word `0x2000` is driven to register `R2` on Cycle 3.
3. **Cycle 3 (`LOAD R3, [0x2004]`)**:
   * The CPU issues `LOAD R3, [0x2004]`.
   * **Hit confirmed!** Data word `0x2004` is driven to register `R3` on Cycle 4.
4. **Cycles 4 through 150**:
   * The CPU out-of-order execution engine continues executing subsequent instructions that depend on `R2` and `R3` at full speed.
5. **Cycle 151 (DRAM Fill Arrival)**:
   * Main DRAM returns the 64-byte line for `0x1000`.
   * The line is written into L1 SRAM, the critical word is forwarded to `R1`, and the out-of-order engine un-stalls instructions that were waiting on `R1`.

```text
HIT-UNDER-MISS EXECUTION COMPARISON

 Blocking Cache Execution   : [ Miss 1 (150c Stall) ] ──► [ Hit 2 (1c) ] ──► [ Hit 3 (1c) ]
                              (Total Time = 152 Clock Cycles)

 Non-Blocking (HUM) Exec    : [ Miss 1 Dispatched (150c DRAM Fetch) ]
                              [ Hit 2 (1c) ] ──► [ Hit 3 (1c) ] ──► [ CPU Executing! ]
                              (Hits 2 and 3 completed during Cycle 2 and 3!)
                              (Total Time = 150 Clock Cycles! Zero Hit Delay!)
```

Look at the performance result:
In the Non-Blocking Cache, **Hits 2 and 3 executed completely in parallel with the 150-cycle DRAM fetch delay of Miss 1**! 

The CPU core lost zero clock cycles waiting for Hits 2 and 3.

---

## Mathematical Performance Framework: Overlapped AMAT and Non-Blocking CPI

To quantify the exact execution speedup provided by a non-blocking cache, we must adapt our **Average Memory Access Time (AMAT)** and **Effective CPI** equations to account for memory access overlap.

---

### The Overlapped AMAT Equation

In a blocking cache, every cache miss adds the full miss penalty $T_{\text{penalty}}$ to the average access time:

$$\text{AMAT}_{\text{blocking}} = T_{\text{hit}} + (h_m \times T_{\text{penalty}})$$

Where:
* $\text{AMAT}_{\text{blocking}}$ is the Average Memory Access Time for a blocking cache.
* $T_{\text{hit}}$ is the L1 cache hit latency (e.g., $1\text{ clock cycle}$).
* $h_m$ is the L1 cache miss rate ($0.0 \le h_m \le 1.0$).
* $T_{\text{penalty}}$ is the main memory DRAM miss penalty (e.g., $150\text{ clock cycles}$).

In a non-blocking cache supporting Hit-Under-Miss, a fraction $f_{\text{overlap}}$ of cache misses have their DRAM fetch latencies **partially or completely hidden** by concurrent instruction execution and independent cache hits!

We define the **Non-Blocking Overlapped AMAT Equation**:

$$\mathbf{\text{AMAT}_{\text{non\_blocking}} = T_{\text{hit}} + (h_m \times T_{\text{penalty}} \times (1 - f_{\text{overlap}}))}$$

Where:
* $\text{AMAT}_{\text{non\_blocking}}$ is the effective Average Memory Access Time seen by the CPU pipeline.
* $T_{\text{hit}}$ is the L1 cache hit latency.
* $h_m$ is the L1 cache miss rate.
* $T_{\text{penalty}}$ is the DRAM miss penalty.
* $f_{\text{overlap}}$ is the **Memory Latency Overlap Factor** ($0.0 \le f_{\text{overlap}} \le 1.0$), representing the fraction of miss latency hidden by concurrent execution.

```text
AMAT REDUCTION VIA MEMORY LATENCY OVERLAP

 h_m * T_penalty (Full Miss Penalty in Blocking Cache)
 ┌─────────────────────────────────────────────────────────────┐
 │ Un-overlapped Penalty          │ Overlapped Hidden Penalty  │
 │ (Causes CPU Stalls)            │ (Hidden by HUM / MUM!)     │
 └────────────────────────────────┴────────────────────────────┘
 ◄─────────────────────── AMAT Reduced! ──────────────────────►
```

#### Evaluating Extreme Overlap Values:
* **If $f_{\text{overlap}} = 0.0$ (No overlap / Blocking behavior)**:
  $$\text{AMAT} = T_{\text{hit}} + (h_m \cdot T_{\text{penalty}})$$
* **If $f_{\text{overlap}} = 1.0$ (100% Complete Overlap / All Misses Hidden)**:
  $$\text{AMAT} = T_{\text{hit}} + 0 = T_{\text{hit}} = \mathbf{1.0 \text{ clock cycle!}}$$

If the out-of-order engine can find enough independent work to keep the CPU busy during every DRAM fetch ($f_{\text{overlap}} \to 1.0$), **the effective memory access time drops to $1.0\text{ clock cycle}$**, completely erasing the Memory Wall!

---

### Non-Blocking Effective CPI Equation

To calculate overall instruction execution throughput, we integrate the overlapped AMAT into the CPU's **Effective Cycles Per Instruction ($\text{CPI}_{\text{effective}}$)** equation:

$$\text{CPI}_{\text{effective}} = \text{CPI}_{\text{base}} + \left( \frac{\text{Memory Accesses}}{\text{Instruction}} \times h_m \times T_{\text{penalty}} \times (1 - f_{\text{overlap}}) \right)$$

Where:
* $\text{CPI}_{\text{effective}}$ is the actual average cycles required per executed instruction.
* $\text{CPI}_{\text{base}}$ is the base execution CPI assuming all L1 accesses hit.
* $\frac{\text{Memory Accesses}}{\text{Instruction}}$ is the fraction of instructions that access memory.
* $h_m$ is the L1 cache miss rate.
* $T_{\text{penalty}}$ is the DRAM miss penalty.
* $f_{\text{overlap}}$ is the memory latency overlap factor achieved by non-blocking execution.

---

## Architectural Challenges: Dependent Hits, Resource Contention, and Bus Flooding

While non-blocking caches provide immense performance gains, real-world physical implementation introduces three major architectural challenges that hardware engineers must manage.

---

### Challenge 1: Dependent Load Stalls (Load-Use Dependency Chains)

What happens if an instruction following a cache miss **depends directly on the missing data register**?

```c
// DEPENDENT LOAD-USE HAZARD
LOAD R1, [0x1000] // Instruction 1: MISS! (Target R1 pending from DRAM)
ADD  R5, R1, R6   // Instruction 2: DEPENDS ON R1! Cannot execute yet!
LOAD R2, [0x2000] // Instruction 3: Independent load (Hit in L1!)
```

#### How the Out-of-Order Core Manages Dependent Loads:
1. Instruction 1 (`LOAD R1`) misses. $R1$ is marked as **Pending / Unresolved** in the Register Alias Table (RAT).
2. Instruction 2 (`ADD R5, R1, R6`) arrives at the instruction scheduler. The scheduler sees that $R1$ is pending, so it places Instruction 2 into a **Reservation Station / Issue Queue** to wait.
3. Instruction 3 (`LOAD R2`) arrives. It does not depend on $R1$. The non-blocking cache processes `LOAD R2` immediately (**Hit-Under-Miss**)!
4. When `0x1000` arrives from DRAM 150 cycles later, $R1$ is written, and the reservation station releases Instruction 2 (`ADD R5`) to the execution units.

Non-blocking caches work hand-in-hand with out-of-order reservation stations to bypass dependent stalls!

---

### Challenge 2: Memory Interconnect Bus Flooding (MUM Queue Saturation)

If a non-blocking cache supports Miss-Under-Miss (MUM) concurrency for up to 16 outstanding misses, what happens if a program triggers 16 cache misses in rapid succession?

The non-blocking cache issues **16 simultaneous 64-byte line fill requests** to the memory interconnect bus!

```text
MISS-UNDER-MISS BUS FLOODING

 Non-Blocking Cache Issues 16 Concurrent DRAM Requests
 ┌─────────────────────────────────────────────────────────────┐
 │ Miss 1 │ Miss 2 │ Miss 3 │ Miss 4 │ ... │ Miss 15 │ Miss 16 │
 └────────┴────────┴────────┴────────┴─────┴─────────┴─────────┘
                               │
                               ▼
            [ Memory Interconnect Bus Queue Overflows! ]
            [ DRAM Banks Saturated / Row Buffer Conflicts! ]
```

#### Physical Interconnect Constraints:
1. **Queue Saturation**: Main memory controllers have limited request queue depths (e.g., 8 or 16 entries). If all miss queues fill up, the non-blocking cache is forced to revert to blocking mode until a DRAM fill completes!
2. **DRAM Bank Conflicts**: If 16 concurrent misses target different rows inside the same DRAM bank, the DRAM controller suffers continuous **Row Buffer Conflicts**, increasing the average miss penalty $T_{\text{penalty}}$ from 150 cycles to 300 cycles!

#### Hardware Solution: Multi-Bank DRAM Arrays & Rank Interleaving
To support Miss-Under-Miss concurrency without bus saturation, modern memory systems use **Multi-Bank DRAM Arrays** and **Channel Interleaving**, allowing 8 or 16 concurrent line fills to be serviced in parallel by separate DRAM banks!

---

## Solved Industrial Engineering Exercise: Quantitative AMAT, Hit-Under-Miss Overlap, and Out-of-Order Execution CPI Analysis

To consolidate your complete mastery of non-blocking cache concurrency, Hit-Under-Miss (HUM) mechanics, memory latency overlap math, and execution throughput calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal performance architect evaluating the memory subsystem for a $3.6\text{ GHz}$ 64-bit out-of-order server processor core ($T_{\text{clk}} = 0.2778\text{ ns} = 277.8\text{ ps}$).

The processor pipeline has a base execution CPI of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming all L1 Data Cache accesses hit).

The server workload executes **$100,000,000\text{ instructions}$** containing $20,000,000\text{ memory load instructions}$ ($f_{\text{load}} = 0.20$).

```text
3.6 GHz OUT-OF-ORDER SERVER PROCESSOR MEMORY SUBSYSTEM

 CPU Core (3.6 GHz) ──► [ L1 Data Cache (32 KB Capacity) ] ──► Main Memory (DRAM)
 Clock T = 277.8 ps     Read Miss Rate = 5.0%                 Miss Penalty = 140 Cycles
```

#### System Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.6\text{ GHz} = 3.6 \times 10^9\text{ Hz}$.
* L1 Data Cache Capacity: $32\text{ KB}$, 64-byte lines.
* L1 Cache Hit Latency: $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.2778\text{ ns}$).
* L1 Data Cache Read Miss Rate: $h_m = 5.0\%\quad (0.05)$.
* Main DRAM Miss Penalty: $T_{\text{penalty}} = 140\text{ clock cycles}$ ($38.89\text{ ns}$).

#### Candidate Cache Configurations to Compare:
* **System A (Blocking Cache)**: The cache controller locks up completely on the first cache miss ($cpu\_ready = 0$), freezing all subsequent accesses until the DRAM line fill completes.
* **System B (Non-Blocking Cache with HUM Capability)**: The cache controller maintains $cpu\_ready = 1$ during misses. 
  * Microarchitectural profiling shows that during each $140\text{-cycle}$ DRAM miss fetch window, the out-of-order execution engine successfully executes an average of **12 independent L1 cache hit load instructions** and 30 arithmetic instructions in parallel, achieving a **Memory Latency Overlap Factor of $f_{\text{overlap}} = 60.0\%\quad (0.60)$**!

#### Your Objective

1. Calculate the total number of L1 cache misses generated by the $100,000,000\text{-instruction}$ workload.
2. Calculate the Average Memory Access Time ($\text{AMAT}_A$), effective CPI ($\text{CPI}_A$), total execution time $T_{\text{exec,A}}$, and throughput (in MIPS) for **System A (Blocking Cache)**.
3. Calculate the Average Memory Access Time ($\text{AMAT}_B$), effective CPI ($\text{CPI}_B$), total execution time $T_{\text{exec,B}}$, and throughput (in MIPS) for **System B (Non-Blocking Cache)**.
4. Calculate the exact **Performance Speedup Factor** of System B over System A.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Total Memory Accesses and Cache Misses

The workload executes $N_{\text{inst}} = 100,000,000\text{ instructions}$.

##### 1. Total Load Memory Accesses ($N_{\text{loads}}$):
$$f_{\text{load}} = 0.20 \quad (20\%)$$

$$N_{\text{loads}} = 100,000,000 \text{ inst} \times 0.20 = \mathbf{20,000,000 \text{ memory load instructions}}$$

##### 2. Total L1 Cache Misses ($N_{\text{misses}}$):
$$h_m = 0.05 \quad (5.0\%)$$

$$N_{\text{misses}} = 20,000,000 \text{ loads} \times 0.05 = \mathbf{1,000,000 \text{ L1 cache misses}}$$

Out of 20,000,000 loads, exactly **1,000,000 loads miss in L1**, while $19,000,000$ loads hit in L1!

---

#### Step 2: Analyze System A (Blocking Cache)

In System A, every one of the 1,000,000 cache misses locks the L1 cache for the full $140\text{-cycle}$ DRAM fetch penalty, freezing all subsequent hit loads that arrive during that window.

##### 1. Calculate System A AMAT ($\text{AMAT}_A$):
$$\text{AMAT}_A = T_{\text{hit}} + (h_m \times T_{\text{penalty}})$$

$$\text{AMAT}_A = 1 + (0.05 \times 140) = 1 + 7.00 = \mathbf{8.00 \text{ clock cycles}}$$

$$\text{AMAT}_{A,\text{time}} = 8.00\text{ cycles} \times 0.2778\text{ ns/cycle} = \mathbf{2.222 \text{ nanoseconds}}$$

##### 2. Calculate System A Effective CPI ($\text{CPI}_A$):
$$\text{CPI}_A = \text{CPI}_{\text{base}} + \left( \frac{\text{Memory Accesses}}{\text{Instruction}} \times h_m \times T_{\text{penalty}} \right)$$

$$\text{CPI}_A = 1.0 + (0.20 \times 0.05 \times 140) = 1.0 + 1.40 = \mathbf{2.40 \text{ cycles/instruction}}$$

##### 3. Calculate System A Total Execution Time ($T_{\text{exec,A}}$):
$$N_{\text{cycles,A}} = 100,000,000 \text{ inst} \times 2.40 \text{ cycles/inst} = 240,000,000\text{ clock cycles}$$

$$T_{\text{exec,A}} = 240,000,000 \times 0.27778 \times 10^{-9}\text{ s} = \mathbf{0.06667 \text{ seconds}} \quad (66.67\text{ ms})$$

##### 4. Calculate System A Throughput (in MIPS):
$$\text{Throughput}_A = \frac{f_{\text{clk\_MHz}}}{\text{CPI}_A} = \frac{3,600\text{ MHz}}{2.40\text{ cycles/inst}} = \mathbf{1,500.0 \text{ MIPS}}$$

---

#### Step 3: Analyze System B (Non-Blocking Cache with $f_{\text{overlap}} = 60.0\%$)

In System B, the non-blocking cache allows the out-of-order core to continue executing independent hit loads and arithmetic instructions during miss fetches, achieving $f_{\text{overlap}} = 0.60$.

##### 1. Calculate System B Overlapped AMAT ($\text{AMAT}_B$):
$$\text{AMAT}_B = T_{\text{hit}} + (h_m \times T_{\text{penalty}} \times (1 - f_{\text{overlap}}))$$

$$\text{AMAT}_B = 1 + (0.05 \times 140 \times (1 - 0.60)) = 1 + (7.00 \times 0.40) = 1 + 2.80 = \mathbf{3.80 \text{ clock cycles}}$$

$$\text{AMAT}_{B,\text{time}} = 3.80\text{ cycles} \times 0.2778\text{ ns/cycle} = \mathbf{1.0556 \text{ nanoseconds}}$$

##### 2. Calculate System B Effective CPI ($\text{CPI}_B$):
$$\text{CPI}_B = \text{CPI}_{\text{base}} + \left( \frac{\text{Memory Accesses}}{\text{Instruction}} \times h_m \times T_{\text{penalty}} \times (1 - f_{\text{overlap}}) \right)$$

$$\text{CPI}_B = 1.0 + (0.20 \times 0.05 \times 140 \times 0.40) = 1.0 + 0.56 = \mathbf{1.56 \text{ cycles/instruction}}$$

##### 3. Calculate System B Total Execution Time ($T_{\text{exec,B}}$):
$$N_{\text{cycles,B}} = 100,000,000 \text{ inst} \times 1.56 \text{ cycles/inst} = 156,000,000\text{ clock cycles}$$

$$T_{\text{exec,B}} = 156,000,000 \times 0.27778 \times 10^{-9}\text{ s} = \mathbf{0.04333 \text{ seconds}} \quad (43.33\text{ ms})$$

##### 4. Calculate System B Throughput (in MIPS):
$$\text{Throughput}_B = \frac{f_{\text{clk\_MHz}}}{\text{CPI}_B} = \frac{3,600\text{ MHz}}{1.56\text{ cycles/inst}} \approx \mathbf{2,307.69 \text{ MIPS}}$$

---

#### Step 4: Calculate Performance Speedup Factor

Let us calculate the overall execution speedup achieved by replacing the Blocking Cache with a Non-Blocking Cache:

$$\text{Speedup} = \frac{T_{\text{exec,A}}}{T_{\text{exec,B}}} = \frac{\text{CPI}_A}{\text{CPI}_B} = \frac{2.40}{1.56} \approx \mathbf{1.5385\times \text{ Performance Speedup!}}$$

```text
NON-BLOCKING CACHE PERFORMANCE OPTIMIZATION SUMMARY

 System Configuration        │ Effective AMAT        │ Effective CPI     │ Throughput (MIPS) │ Performance
─────────────────────────────┼───────────────────────┼───────────────────┼───────────────────┼─────────────
 System A (Blocking Cache)   │ 8.00 Cycles (2.22 ns) │ 2.40 Cycles/Inst  │ 1,500.0 MIPS      │ 1.00x (Base)
 System B (Non-Blocking HUM) │ 3.80 Cycles (1.06 ns) │ 1.56 Cycles/Inst  │ 2,307.7 MIPS      │ 1.538x FASTER!
                             │ (52.5% AMAT Reduction)│ (35% CPI Reduction)│ (+807.7 MIPS!)    │ (+53.8% Gain)
```

##### Engineering Conclusion:
By enabling Hit-Under-Miss concurrency, the non-blocking cache reduced the Average Memory Access Time from **$8.00\text{ cycles}$ down to $3.80\text{ cycles}$**, delivering a **$53.8\%$ execution speedup ($807.7\text{ additional MIPS}$)** without altering the memory bus frequency or increasing the L1 SRAM capacity!

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against system principles:

1. **AMAT Overlap Verification**:
   * Blocking AMAT penalty component = $0.05 \times 140 = 7.00\text{ cycles}$.
   * Non-Blocking AMAT penalty component = $7.00 \times (1 - 0.60) = 2.80\text{ cycles}$.
   * Penalty reduction = $7.00 - 2.80 = 4.20\text{ cycles saved per memory access}$.
   * $\text{AMAT}_A (8.00) - 4.20 = \text{AMAT}_B (3.80\text{ cycles})$. Matches our equation!
2. **CPI Contribution Verification**:
   * In System A, memory stalls added $1.40\text{ cycles}$ to base CPI ($1.0 + 1.40 = 2.40$).
   * In System B, memory stalls added $0.56\text{ cycles}$ to base CPI ($1.0 + 0.56 = 1.56$).
   * Memory stall penalty was reduced by $60.0\%$, matching $f_{\text{overlap}} = 60.0\%$!
3. **Execution Time Verification**:
   * Time saved = $66.67\text{ ms} - 43.33\text{ ms} = 23.34\text{ milliseconds}$ saved for $100\text{ million instructions}$.

All overlapped AMAT equations, non-blocking CPI formulas, MIPS throughput gains, and memory latency overlap calculations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Non-Blocking (Lockup-Free) Cache**: A cache memory controller architecture that decouples memory miss processing from CPU pipeline request acceptance, allowing the CPU to continue issuing requests and serving L1 hits for independent addresses while lower memory fetches missing blocks in the background.
* **Hit-Under-Miss (HUM) Capability**: The operational capability of a non-blocking cache to process new memory requests and serve $1\text{-cycle}$ L1 cache hits for independent memory addresses while one or more cache misses are concurrently serviced in the background by main memory.
