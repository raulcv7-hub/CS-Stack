---
title: "Non-Blocking Cache Concurrency and Hit-Under-Miss Architecture"
---

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


## Mathematical Performance Framework: Overlapped AMAT and Non-Blocking CPI

To quantify the exact execution speedup provided by a non-blocking cache, we must adapt our **Average Memory Access Time (AMAT)** and **Effective CPI** equations to account for memory access overlap.


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


## Solved Industrial Engineering Exercise: Quantitative AMAT, Hit-Under-Miss Overlap, and Out-of-Order Execution CPI Analysis

To consolidate your complete mastery of non-blocking cache concurrency, Hit-Under-Miss (HUM) mechanics, memory latency overlap math, and execution throughput calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

