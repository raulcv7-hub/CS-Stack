---
title: "Total Store Order Memory Model and Store Buffer Reordering Mechanics"
---

# Total Store Order Memory Model and Store Buffer Reordering Mechanics

## The Out-of-Order Memory Visibility Anomaly in Multi-Core Hardware

In a single-core computing system, the central processing unit (CPU) executes software under an inviolable architectural promise known as **Program Order Preservation**. If a single-threaded program contains two consecutive memory store instructions—such as writing `X = 1` followed immediately by `Y = 2`—the CPU hardware guarantees that any subsequent read instruction executed by that same program will observe `X` as `1` and `Y` as `2`. Even if the underlying hardware uses speculative execution, out-of-order execution, or write buffers to speed up execution, the single-core pipeline uses internal hazard detection circuits to ensure that the programmer's written instruction sequence is never violated.

To accelerate single-core performance, modern processor architectures place a private, high-speed First-In, First-Out (FIFO) queue called a **Store Buffer** (or Write Buffer) between the CPU execution pipeline and the local L1 Data Cache.

When a single CPU core executes a store instruction (`STORE X = 1`), it does not wait for the L1 cache or main memory to accept the write. Instead, the core writes the target address `X` and payload `1` into its local Store Buffer in just **$1\text{ clock cycle}$** and immediately proceeds to execute the next instruction in the program. In the background, the Store Buffer gradually drains its pending writes into the cache hierarchy.

In a single-core system, this local Store Buffer is completely transparent to software. If the CPU subsequently executes a load instruction to read address `X` (`LOAD X`), the hardware uses **Store Forwarding** to read the un-committed value `1` directly out of the local Store Buffer, maintaining perfect single-thread execution correctness.

However, the moment we move from a single-core processor to a **Multi-Core Processor**—where multiple independent CPU cores execute threads concurrently and communicate through a shared memory hierarchy—that transparent single-thread promise breaks down completely.

Consider two independent processor cores (Core 0 and Core 1) executing two simple code snippets concurrently. Initially, shared memory variables `X` and `Y` both hold the value `0`:

```c
// INITIAL STATE IN SHARED MEMORY: X = 0, Y = 0

// CORE 0 CODE                      // CORE 1 CODE
STORE X = 1;                        STORE Y = 1;
LOAD  R1, [Y];                      LOAD  R2, [X];
```

Let us trace what happens when both cores execute their respective two-instruction code blocks simultaneously in physical silicon:

1. **Core 0 Executes `STORE X = 1`**: Core 0 writes `X = 1` into its **private Store Buffer**. The write is NOT yet visible in the shared L1/L2 cache or main memory!
2. **Core 1 Executes `STORE Y = 1`**: Core 1 writes `Y = 1` into its **private Store Buffer**. The write is NOT yet visible in the shared L1/L2 cache or main memory!
3. **Core 0 Executes `LOAD R1, [Y]`**: Core 0 reads variable `Y`. Core 0's private Store Buffer contains only `X = 1`, so store forwarding does not match `Y`. Core 0 queries the shared cache/memory hierarchy. What value is stored in shared memory for `Y`? **`Y == 0`**! Register `R1` receives `0`!
4. **Core 1 Executes `LOAD R2, [X]`**: Core 1 reads variable `X`. Core 1 queries the shared cache/memory hierarchy. What value is stored in shared memory for `X`? **`X == 0`**! Register `R2` receives `0`!

```text
THE MULTI-CORE STORE BUFFER REORDERING ANOMALY

 Initial State in Shared Memory: X = 0, Y = 0

 Core 0 Execution                     Core 1 Execution
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ 1. STORE X = 1            │        │ 1. STORE Y = 1            │
 │    (Pushed to Core 0 WBB) │        │    (Pushed to Core 1 WBB) │
 ├───────────────────────────┤        ├───────────────────────────┤
 │ 2. LOAD R1, [Y]           │        │ 2. LOAD R2, [X]           │
 │    (Reads Y from Memory)  │        │    (Reads X from Memory)  │
 └─────────────┬─────────────┘        └─────────────┬─────────────┘
               │                                    │
               ▼                                    ▼
       Core 0 Reads R1 = 0                  Core 1 Reads R2 = 0
       (X = 1 still in WBB0!)               (Y = 1 still in WBB1!)

      RESULT: R1 == 0 AND R2 == 0! (IMPOSSIBLE IN PROGRAM ORDER!)
```

Examine this final result with extreme care:
$$\mathbf{R1 == 0 \quad \text{AND} \quad R2 == 0}$$

This outcome is a profound architectural anomaly! 

In any possible sequential, step-by-step interleaved execution of these four instructions ($S_0 \to S_1 \to L_0 \to L_1$, or $S_1 \to L_1 \to S_0 \to L_0$, or $S_0 \to L_0 \to S_1 \to L_1$), **at least one of the two cores MUST observe a $1$**! 

It is mathematically impossible for both `R1` and `R2` to evaluate to `0` if instructions become visible in strict program order.

Why did both cores observe `0`?
Because the private Store Buffers delayed the global visibility of the store operations! To Core 1, it appeared as if Core 0 executed its load (`LOAD Y`) **BEFORE** its store (`STORE X = 1`). 

The presence of private Store Buffers caused memory instructions to become visible to other cores in a reordered sequence: **A Store followed by a Load to a different address was reordered into a Load followed by a Store ($S \to L$ Reordering)!**

If multi-threaded software (such as a database lock, a spinlock, or a concurrent queue) relies on store operations becoming visible to other cores in program order, this hardware reordering breaks mutual exclusion, corrupts multi-threaded state, and crashes software systems.

To define precisely what memory reorderings a multi-core processor's hardware is allowed to perform, and what visibility guarantees it must provide to software, computer architectures define formal **Hardware Memory Consistency Models**.

The most widely deployed hardware memory consistency model in commercial computing is **Total Store Order (TSO)** (the native hardware memory model of x86-64 and SPARC multi-core processors).


### Tracing the Secretaries' Actions Step-by-Step

Let us watch both secretaries execute their instructions at 9:00 AM:

1. **9:00 AM**: Secretary A writes `Notice X = 1` on a piece of paper and drops it into their **private outgoing tray** on their desk. Secretary A does NOT walk out to the bulletin board yet! The note sits in Secretary A's desk tray.
2. **9:00 AM**: Simultaneously, Secretary B writes `Notice Y = 1` on a piece of paper and drops it into their **private outgoing tray** on their desk. The note sits in Secretary B's desk tray.
3. **9:01 AM**: Secretary A walks out into the hallway to read the central bulletin board. 
   * Secretary A looks at `Notice Y`.
   * Is Secretary B's new note (`Notice Y = 1`) on the board yet? **NO!** Secretary B's note is still sitting inside Secretary B's private desk tray across the hall!
   * Secretary A reads **`Notice Y = 0`** from the central board and writes "Saw Y = 0" in their notebook!
4. **9:01 AM**: Simultaneously, Secretary B walks out into the hallway to read the central bulletin board.
   * Secretary B looks at `Notice X`.
   * Is Secretary A's new note (`Notice X = 1`) on the board yet? **NO!** Secretary A's note is still sitting inside Secretary A's private desk tray!
   * Secretary B reads **`Notice X = 0`** from the central board and writes "Saw X = 0" in their notebook!
5. **9:05 AM (Courier Arrives)**: The mail courier enters Secretary A's office, picks up `Notice X = 1`, and pins it to the central bulletin board. The courier then enters Secretary B's office, picks up `Notice Y = 1`, and pins it to the central board.

```text
SECRETARIES' EXECUTION TIMELINE

 09:00 AM: Secretary A drops "X=1" in desk tray. Secretary B drops "Y=1" in desk tray.
 09:01 AM: Secretary A reads Board Y -> Sees "Y=0"! Secretary B reads Board X -> Sees "X=0"!
 09:05 AM: Courier picks up desk trays and posts "X=1" and "Y=1" on the Central Board!
```

Look at the result recorded in the secretaries' notebooks:
* Secretary A recorded: **`Y == 0`**.
* Secretary B recorded: **`X == 0`**.

To an outside observer watching the central bulletin board, it appears as if **both secretaries read the board BEFORE either secretary wrote their note**! 

The private desk trays introduced a **local delay in global visibility**. 

Secretary A's write (`X = 1`) was executed locally at 9:00 AM, but did not become globally visible to Secretary B until 9:05 AM.

This everyday scenario is the exact physical analogue of **Store Buffer Reordering in Total Store Order (TSO) Hardware**:
* Secretary A and Secretary B are **CPU Core 0 and CPU Core 1**.
* The private desk trays are **Private CPU Store Buffers (Write Buffers)**.
* The central bulletin board is **Shared L2 Cache / Main System DRAM**.
* Posting a note in a desk tray is a **Store Instruction (`STORE`)**.
* Reading the central bulletin board is a **Load Instruction (`LOAD`)**.
* Both secretaries seeing `0` is the **$S \to L$ Store-Load Reordering Anomaly**.


### The Spectrum of Memory Consistency Models

Computer architectures implement memory consistency models along a spectrum ranging from **Strict / Sequential Consistency** to **Relaxed / Weak Consistency**:

```text
THE MEMORY CONSISTENCY MODEL SPECTRUM

  STRONG / STRICT CONSISTENCY                     WEAK / RELAXED CONSISTENCY
 ◄──────────────────────────────────────────────────────────────────────────►
 Sequential Consistency (SC)      Total Store Order (TSO)     Weak Memory Ordering (WMO)
 (Zero Reordering Allowed!)       (x86-64 / SPARC)            (ARMv8 / RISC-V)
 (All instructions in program     (Allows ONLY S -> L         (Allows S->S, L->L,
  order globally!)                 reordering via Store Buffers) S->L, L->S reorderings!)
```

#### 1. Sequential Consistency (SC) — The Ideal Model
Defined by Leslie Lamport in 1979. Under Sequential Consistency:
* The result of any execution is the same as if all instructions across all cores were executed in some single, global, sequential linear order.
* Instructions from each individual core appear in this global sequence in strict program order.
* **No reordering of any kind is permitted** ($S \to S, L \to L, S \to L, L \to S$ are all forbidden).
* **Hardware Cost**: To enforce SC, a CPU cannot use private Store Buffers or non-blocking caches without stalling on every write, reducing multi-core execution performance by up to $70\%$.

#### 2. Total Store Order (TSO) — The x86-64 Standard
Total Store Order is a **strong memory model with a single, controlled relaxation**. It reflects the physical presence of FIFO Store Buffers at each core:
* All stores across all cores are committed to a single, global total order (Global Store Order).
* Stores issued by a single core drain to shared memory in strict program order ($S \to S$ order preserved).
* Loads issued by a single core execute in strict program order ($L \to L$ order preserved).
* **THE SINGLE PERMITTED REORDERING ($S \to L$ Bypassing)**: A load instruction to address $Y$ CAN execute and read shared memory BEFORE an earlier pending store instruction to a *different* address $X$ drains from the private Store Buffer to shared memory!

#### 3. Weak / Relaxed Memory Ordering (WMO) — The ARM / RISC-V Standard
Weak Memory Ordering models (used in ARM and RISC-V architectures) permit hardware to reorder loads and stores almost arbitrarily ($S \to S, L \to L, S \to L, L \to S$), provided single-thread dependencies are maintained. 

While WMO delivers maximum hardware freedom and energy efficiency, it requires software programmers to insert explicit memory barrier instructions (`fence`) far more frequently than under TSO.


## Primitive 2: Store Buffer Reordering Hazard Mechanics

Now let us examine how the single TSO relaxation—Store-to-Load ($S \to L$) Bypassing—causes multi-threaded synchronization algorithms to fail at the hardware level.


#### What Happens in Physical TSO Hardware:

Let us trace the physical execution of Dekker's Algorithm across Core 0 and Core 1 under Total Store Order:

```text
DEKKER'S ALGORITHM FAILURE TIMELINE UNDER TSO

 Cycle 1: Core 0 executes 'flag0 = 1' (STORE).
          * Pushes 'flag0 = 1' into Core 0's private Store Buffer.
          * 'flag0 = 1' is NOT yet visible in shared memory!

 Cycle 1: Core 1 executes 'flag1 = 1' (STORE).
          * Pushes 'flag1 = 1' into Core 1's private Store Buffer.
          * 'flag1 = 1' is NOT yet visible in shared memory!

 Cycle 2: Core 0 executes 'if (flag1 == 0)' (LOAD).
          * Queries shared cache for 'flag1'.
          * Shared cache contains 'flag1 == 0' (Core 1's store is still in WBB1!).
          * Core 0 reads flag1 == 0 ──► CONDITION TRUE! Core 0 ENTERS CRITICAL SECTION!

 Cycle 2: Core 1 executes 'if (flag0 == 0)' (LOAD).
          * Queries shared cache for 'flag0'.
          * Shared cache contains 'flag0 == 0' (Core 0's store is still in WBB0!).
          * Core 1 reads flag0 == 0 ──► CONDITION TRUE! Core 1 ENTERS CRITICAL SECTION!

          CATASTROPHIC FAILURE: BOTH CORES ENTER CRITICAL SECTION AT ONCE!
```

Look at the hardware breakdown:
1. Core 0 pushes `flag0 = 1` into Store Buffer 0.
2. Core 1 pushes `flag1 = 1` into Store Buffer 1.
3. Core 0 executes `LOAD flag1`. Because of TSO Rule 4 ($S \to L$ bypassing), `LOAD flag1` reads shared memory immediately. It reads `flag1 == 0`!
4. Core 1 executes `LOAD flag0`. It reads shared memory immediately and reads `flag0 == 0`!
5. **BOTH CORES ENTER THE CRITICAL SECTION SIMULTANEOUSLY!**

Two threads modify the shared resource at the exact same physical time, corrupting user data!

The software algorithm failed because the TSO hardware permitted $S \to L$ reordering, allowing the loads (`LOAD flag`) to execute globally *before* the stores (`STORE flag = 1`) drained from the private Store Buffers into shared memory.


### How a Memory Fence Controls the Store Buffer

When the CPU pipeline encounters a Memory Fence instruction (`MFENCE`):

1. **Pipeline Serialization**: The CPU pipeline halts the execution of any subsequent load or store instructions following the fence in program order.
2. **Mandatory Store Buffer Drain**: The Store Buffer controller forces all pending store entries sitting in the private FIFO queue (`STORE X = 1`) to drain across the bus and commit into the shared L1/L2 cache array.
3. **Queue Empty Verification**: The pipeline waits until the Store Buffer's Valid bits are all zero ($V = 0$ for all slots), confirming that all local stores are now **globally visible to all other CPU cores**.
4. **Pipeline Release**: The pipeline un-stalls and releases subsequent load instructions (`LOAD Y`).


## The Performance Cost of Memory Fences

If memory fences restore strict sequential consistency, why doesn't the compiler insert a memory fence after every single store instruction automatically?

Because **memory fences are computationally expensive**.

### The Stall Penalty of a Memory Fence

When a CPU executes a memory fence instruction:
* The core cannot execute any subsequent instructions for **15 to 50 clock cycles** while waiting for the Store Buffer to drain to the shared L2/L3 cache.
* The CPU's out-of-order execution window is completely stalled.

```text
PERFORMANCE IMPACT OF MEMORY FENCES

 Code without Fences  :  [ Store 1 (1c) ] ──► [ Load 2 (1c) ] ──► CPI = 1.0 (Fast, but unsafe!)
 Code with Heavy Fences:  [ Store 1 (1c) ] ──► [ FENCE STALL (30c) ] ──► [ Load 2 (1c) ] ──► CPI = 16.0!
                          (Execution speed drops by 1,600%!)
```

If a program executes a memory fence on every iteration of a high-frequency loop, the effective CPI degrades from $1.0\text{ cycle/instruction}$ down to **$16.0\text{ or } 30.0\text{ cycles/instruction}$**! The application runs $1,600\%$ slower.

### Industrial Best Practice: Selective Fencing
To achieve both high performance and multi-threaded correctness, systems software engineers apply two gold-standard practices:

1. **Use Lock-Free Primitives for Thread Boundaries**: Use hardware-supported atomic primitives (`LOCK CMPXCHG` on x86, `LR/SC` on RISC-V, `LDREX/STREX` on ARM) that incorporate implicit fence semantics only where thread synchronization actually occurs.
2. **Selective Fencing (Fence Only on Lock Contention)**: Place memory fences inside conditional branches that execute **only when lock contention or thread synchronization is required**, keeping the main execution loop running at full TSO speed ($1\text{ cycle}$ stores)!


### Scenario and Parameters

You are a principal performance architect auditing a high-frequency trading server core operating at a clock frequency $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server features a **Dual-Core TSO Processor** (Core 0 and Core 1).

Each core contains:
* A private L1 Data Cache ($T_{\text{hit}} = 1\text{ clock cycle}$).
* A private 4-entry FIFO **Store Buffer Queue** (WBB).
* Base instruction execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming empty Store Buffer).
* Store Buffer Drain Latency to Shared L2 Cache: $T_{\text{drain}} = 16\text{ clock cycles}$ ($5.0\text{ ns}$).

```text
3.2 GHz DUAL-CORE TSO SERVER PROCESSOR

 Core 0 (3.2 GHz) ──► [ Store Buffer 0 (M = 4 Slots) ] ──┐
                                                         ├──► [ Shared L2 Cache ]
 Core 1 (3.2 GHz) ──► [ Store Buffer 1 (M = 4 Slots) ] ──┘    Drain Latency = 16 Cycles
```

#### The Workload Kernel:
Cores 0 and 1 execute a lock-free queue synchronization loop 1,000,000 times. Each iteration executes 10 instructions:
* 8 Arithmetic/Control instructions ($f_{\text{arith}} = 8$).
* 1 Store instruction (`STORE flag = 1`).
* 1 Load instruction (`LOAD partner_flag`).

#### Your Objective

1. Explain why executing the loop on TSO hardware without memory fences causes **$100\%$ of flag checks to observe stale data ($0$)**, proving that $S \to L$ reordering causes a race condition failure.
2. Calculate the effective CPI ($\text{CPI}_{\text{fenced}}$) and total execution time for 1,000,000 iterations when an explicit memory fence instruction (`MFENCE`) is inserted after every store instruction, assuming each fence forces a full $16\text{-cycle}$ Store Buffer drain.
3. Evaluate a **Selective Fence Optimization**: A software engineer refactors the code so that the memory fence is executed **only when a potential collision is detected**, which occurs in only $5.0\%\quad (0.05)$ of loop iterations.
   * Calculate the new optimized CPI ($\text{CPI}_{\text{optimized}}$) and new total execution time.
   * Calculate the exact **Performance Speedup Factor** of the selective fence optimization over the naive full-fence implementation.
4. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Performance for Naive Full-Fence Implementation

To fix the race condition, an explicit `MFENCE` instruction is inserted after `STORE flag = 1`.

##### 1. Analyze Iteration Cycle Breakdown:
Each iteration executes 10 instructions + 1 `MFENCE` instruction = $11\text{ instructions total}$:
* 8 Arithmetic instructions = $8\text{ cycles}$.
* 1 Store instruction = $1\text{ cycle}$ (writes to Store Buffer).
* 1 `MFENCE` instruction = **16 clock cycles** ($T_{\text{drain}}$, forces Store Buffer to drain to L2 cache before continuing!).
* 1 Load instruction = $1\text{ cycle}$ (reads updated shared L2 cache!).

$$\text{Total Clock Cycles per Iteration} = 8 + 1 + 16 + 1 = \mathbf{26 \text{ clock cycles}}$$

##### 2. Calculate Effective CPI ($\text{CPI}_{\text{fenced}}$):

$$\text{CPI}_{\text{fenced}} = \frac{\text{Total Cycles per Iteration}}{\text{Instructions per Iteration}} = \frac{26\text{ cycles}}{11\text{ instructions}} \approx \mathbf{2.3636 \text{ cycles/instruction}}$$

##### 3. Calculate Total Execution Time ($T_{\text{exec,fenced}}$) for 1,000,000 Iterations:
Total instructions $N_{\text{inst}} = 1,000,000 \times 11 = 11,000,000\text{ instructions}$.

$$\text{Total Cycles} = 1,000,000 \text{ iterations} \times 26 \text{ cycles/iteration} = 26,000,000 \text{ clock cycles}$$

$$T_{\text{exec,fenced}} = 26,000,000 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.008125 \text{ seconds}} \quad (8.125\text{ ms})$$


### Sanity Check and Verification

Let us verify our mathematical and physical results against hardware memory principles:

1. **TSO Reordering Condition Check**:
   * TSO preserves $S \to S$ and $L \to L$ ordering, but relaxes $S \to L$ ordering across different addresses.
   * The race condition occurred specifically because `STORE flag0 = 1` was followed by `LOAD flag1` (Store followed by Load to a different address). This matches TSO Rule 4 exactly!
2. **Fence Penalty Verification**:
   * Full-fence execution added $16\text{ cycles}$ per iteration ($26\text{ cycles vs } 10\text{ cycles base}$).
   * Selective fence execution added $0.05 \times 16 = 0.80\text{ cycles}$ per iteration.
   * Cycle ratio: $\frac{26.0}{10.8} = 2.4074\times$. Matches speedup calculation exactly!

All TSO reordering conditions, Store Buffer drain latencies, memory fence serialization steps, and CPI throughput metrics evaluate with 100% mathematical, physical, and logical precision.

