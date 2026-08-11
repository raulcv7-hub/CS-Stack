content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/04-assembly-control-flow-branching/02-indirect-jump-table-execution/03-atomic-spinlock-loop-synthesis.md
# Atomic Spinlock Loop Synthesis and Contention Backoff Mechanics

## The Cache Coherence Storm: Why Naive Spinlocks Melt Interconnect Buses

In multi-core computer architectures, multiple central processing unit (CPU) cores execute parallel software threads concurrently on a single silicon die. To process high-concurrency workloads—such as parallel database engines, operating system scheduler queues, or multi-threaded memory allocators—threads running on different cores must coordinate access to shared memory data structures.

To enforce **Mutual Exclusion** (guaranteeing that only one CPU core can execute inside a sensitive critical section of code at any given nanosecond), software uses a synchronization primitive called a **Spinlock**.

A **Spinlock** is a lock implementation where a CPU core waiting to acquire a locked resource repeatedly executes a tight polling loop ("spin loop") in assembly until the lock variable in memory transitions from $1$ (Busy / Locked) to $0$ (Free / Unlocked).

Now, consider what occurs at the physical hardware level if 16 CPU cores attempt to acquire a naive spinlock simultaneously using standard atomic write instructions (such as `amoswap.w.aq` or `lr.w`/`sc.w` loops):

```text
THE NAIVE SPINLOCK CACHE COHERENCE STORM

 16 CPU Cores Spinning Simultaneously on Address 0x10002000
 ┌─────────────────────────────────────────────────────────────┐
 │ Core 0  ──► amoswap.w.aq (Demands Exclusive M-State!)       │
 │ Core 1  ──► amoswap.w.aq (Demands Exclusive M-State!)       │
 │ Core 2  ──► amoswap.w.aq (Demands Exclusive M-State!)       │
 │ ...                                                         │
 │ Core 15 ──► amoswap.w.aq (Demands Exclusive M-State!)       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 EVERY SINGLE CLOCK CYCLE, 16 CORES BROADCAST RFO BUS INVALIDATIONS!
 Shared Memory Interconnect Bus Saturated! (Cache Line Bounce Storm!)
```

Trace the physical hardware catastrophe inside the multi-core interconnect:
1. **The Request For Ownership (RFO) Flood**: Executing an atomic write instruction (`amoswap` or `sc.w`) requires the local core's L1 Data Cache to obtain **Exclusive Modified ($M$) State** for the cache line containing the lock variable.
2. **Cache Line Bouncing**: To grant Exclusive $M$ state to Core 0, the cache coherence controller must broadcast **Request For Ownership (RFO) Invalidation Messages** across the inter-core bus, invalidating the cache line in Cores 1 through 15.
3. **Continuous Bus Saturation**: A nanosecond later, Core 1 executes its `amoswap` instruction, broadcasting 15 invalidations and ripping the cache line away from Core 0. Then Core 2 executes `amoswap`, ripping the line away from Core 1!
4. **The Critical Section Stall**: The core that currently holds the lock and is trying to finish its work inside the critical section **cannot write its own data to memory** because the shared interconnect bus is $100\%$ choked with RFO invalidation packets from the 15 spinning cores!
5. **Thermal Power Spike**: 15 CPU cores executing atomic memory swaps in tight loops burn maximum dynamic switching power ($P_{\text{dynamic}} = C \cdot V^2 \cdot f$), spiking silicon temperatures and triggering thermal throttling.

How do we synthesize mutual exclusion spinlocks in assembly so that spinning cores poll locally on **Shared Read ($S$) Cache Lines** without generating a single RFO bus invalidation?

How do hardware **Contention Backoff Instructions (`pause` / `yield`)** and **Exponential Backoff Algorithms** lower pipeline power consumption, eliminate interconnect bus storms, and accelerate lock release transitions?

To build high-concurrency multi-core software, systems engineers use **Test-and-Test-and-Set (TATAS) Spinlocks** and **Hardware Contention Backoff Directives (`pause` / `yield`)**.

---

## The Single-Person Restroom and the Polite Backoff Strategy: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of atomic spinlock loop synthesis, local read polling, hardware `pause` hints, and cache coherence bus traffic reduction before analyzing MESI protocol state transitions, RFO packets, and assembly code loops, let us consider an everyday analogy: **The Single-Person Restroom and the Polite Backoff Strategy**.

Imagine a busy corporate office where 16 employees (**16 CPU Cores**) want to use a single-person restroom (**A Critical Memory Section**).

```text
THE RESTROOM DOOR CONTENTION METAPHOR

 Scenario A: Naive Spinlock (Pounding on Door every Microsecond)
 ┌─────────────────────────────────────────────────────────────┐
 │ 16 Employees continuously bang on the door handle!          │
 │ The person inside CANNOT turn the lock because of the noise!│
 │ The hallway is flooded with yelling and physical fights!    │
 └─────────────────────────────────────────────────────────────┘
  (Bus Contention Storm! Thermal Power Spike! Lock Release Delayed!)

 Scenario B: Test-and-Test-and-Set with Backoff (Polite Waiting)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Look through glass window (Read L1 Cache silently)       │
 │ 2. If occupied, step back and wait 1, 2, 4, 8 seconds...    │
 │ 3. Only grab handle when window shows VACANT!               │
 └─────────────────────────────────────────────────────────────┘
  (Zero Door Pounding! Interconnect Bus Quiet! Fast Lock Release!)
```

The restroom door has an indicator lock on the handle (**The Lock Variable in Memory**): $0 = \text{Vacant}$, $1 = \text{Occupied}$.

Let us observe two operational policies for waiting outside the restroom:

---

### Policy A: Naive Spinlock (Continuous Door Pounding)

1. All 16 employees crowd around the door handle.
2. Every single microsecond, all 16 employees grab the door handle and rattle it violently (**Executing `amoswap` or `sc.w` on every cycle**).
3. Look at the chaos:
   * The person inside the restroom (**The Core Holding the Lock**) is trying to finish their business, but the door handle is vibrating so violently that they cannot turn the lock to exit!
   * The shared office hallway is blocked by arguing employees (**Cache Interconnect Bus Saturated**).
   * Everyone is sweating and exhausted from pounding on the door (**High Dynamic Power Consumption**).

---

### Policy B: Test-and-Test-and-Set with Polite Backoff (Optimized Assembly Spinlock)

The office manager replaces Policy A with **Polite Backoff Rules**:

1. **Silent Window Reading (Test-and-Test-and-Set)**: Employees do NOT touch the door handle! They stand back and look through a glass window above the door (**Read L1 Cache silently in Shared $S$ State**).
   * Looking through the glass window makes ZERO noise and touches ZERO door handles!
2. **Contention Backoff (`pause` / `yield`)**: If the window shows "Occupied", the employee steps back, closes their eyes, and takes a deep breath for a few seconds (**Executes a `pause` / `yield` instruction**).
3. **Exponential Backoff**: If an employee checks the window and finds it still occupied a second time, they double their wait time (1 sec, 2 sec, 4 sec, 8 sec...).
4. **Atomic Acquisition**: ONLY when the window shows "VACANT" ($0$) does the employee step forward and grab the door handle (**Executes `amoswap.w.aq` ONCE**)!

```text
POLICY B EXECUTION FLOW (POLITE BACKOFF)

 Step 1: Look through glass window (lw x10, 0(x20))
         ├─► Occupied (1)? ──► Execute `pause` & wait! (Zero door noise!)
         └─► Vacant   (0)? ──► Step forward & grab handle! (amoswap.w.aq)
```

Look at what Policy B achieved:
* **Zero Door Pounding**: While the restroom is occupied, zero employees touch the door handle! The shared hallway is completely quiet (**Zero Cache Invalidation Bus Traffic**).
* **Instant Exit**: The person inside finishes quickly, turns the lock without resistance, and leaves!
* **Low Power**: Waiting employees stand quietly, consuming minimal energy!

This restroom door system is the exact physical analogue of **Optimized Assembly Spinlocks and Contention Backoff**:
* The single-person restroom is **The Critical Memory Section**.
* The 16 employees are **16 CPU Cores**.
* Rattling the door handle continuously is a **Naive `amoswap` Spin Loop**.
* Looking through the glass window is **Test-and-Test-and-Set (`lw` Read Polling)**.
* Stepping back and taking a breath is **Hardware Backoff (`pause` / `yield`)**.

---

## Primitive 1: Test-and-Test-and-Set (TATAS) Spinlock Architecture

Now that we possess an intuitive mental model of glass windows and polite backoffs, let us examine the formal engineering mechanics of **Test-and-Test-and-Set (TATAS) Spinlocks**.

To understand why TATAS is necessary, let us first analyze the hardware flaw of a **Naive Test-and-Set (TAS) Spinlock**:

```riscv
# NAIVE TEST-AND-SET SPINLOCK (BUS FLOODING)

spin_naive:
    addi         x12, x0, 1          # x12 <= 1 (Locked state payload)
spin_loop:
    amoswap.w.aq x10, x12, (x20)     # Atomic swap ON EVERY SINGLE ITERATION!
    bnez         x10, spin_loop      # IF old_value != 0 (busy), RETRY ATOMIC SWAP!
```

### The Flaw of Naive TAS:
`amoswap.w.aq` is an atomic write instruction. On EVERY iteration of `spin_loop`, the local core demands Exclusive ($M$) cache state, invalidating the cache line in all other 15 cores! 

Across 16 cores, this naive loop generates **millions of RFO bus invalidations per second**!

---

### The Test-and-Test-and-Set (TATAS) Solution

To eliminate bus flooding, the **Test-and-Test-and-Set (TATAS)** spinlock divides lock acquisition into two distinct execution phases:

```text
TEST-and-TEST-AND-SET (TATAS) TWO-PHASE ARCHITECTURE

 Phase 1: Silent Local Read Loop (lw x10, 0(x20))
   Core polls L1 Data Cache locally in Shared (S) State.
   ZERO bus traffic emitted while lock is held!
                         │
                         ▼ (When lw reads 0 / Free!)
 Phase 2: Atomic Acquisition Attempt (amoswap.w.aq x10, x12, (x20))
   Core issues ONE single atomic swap to claim the lock.
```

1. **Phase 1: Silent Local Read Polling (`lw x10, 0(x20)`)**:
   * The core reads the lock variable using a standard, non-atomic **`lw` (load word)** instruction.
   * The L1 Data Cache fetches the cache line in **Shared ($S$) State**.
   * As long as the lock remains held ($1$), the `lw` instruction hits locally in L1 cache in $S$ state ($1\text{ clock cycle}$).
   * **ZERO coherence bus messages are transmitted across the interconnect while the lock is held!**
2. **Phase 2: Atomic Acquisition Attempt (`amoswap.w.aq`)**:
   * ONLY when the local `lw` instruction reads $0$ (indicating the lock was released) does the core break out of Phase 1 and execute **a single `amoswap.w.aq`** to claim the lock!

```riscv
# TEST-AND-TEST-AND-SET (TATAS) SPINLOCK IN RISC-V ASSEMBLY

    addi x12, x0, 1             # x12 <= 1 (Locked state payload)

tatas_spin_loop:
    # --- PHASE 1: SILENT LOCAL READ POLLING (Shared S-State Cache) ---
    lw   x10, 0(x20)            # Standard load: Reads local L1 cache silently!
    bnez x10, tatas_spin_loop   # IF lock_var != 0 (busy), KEEP POLLING LOCALLY!

    # --- PHASE 2: ATOMIC LOCK ACQUISITION (Executed ONLY when lock == 0!) ---
    amoswap.w.aq x10, x12, (x20)# Atomically swap x12 (1) with memory[x20]
    bnez x10, tatas_spin_loop   # IF another core grabbed it first, RETRY!
```

Look at the microarchitectural brilliance of TATAS:
While Core 0 holds the lock, Cores 1 through 15 read their local L1 caches silently in $S$ state. The shared memory interconnect bus is **$100\%$ quiet**!

---

## Primitive 2: Spinlock Contention Backoff (`pause` / `yield`) and Exponential Delays

Now let us examine the second core primitive: **Spinlock Contention Backoff** and the **`pause` / `yield`** instruction.

Even with TATAS, what happens when Core 0 finally releases the lock by writing $0$?

The moment Core 0 writes $0$, the MESI cache coherence protocol invalidates the cache line in Cores 1 through 15:
* All 15 waiting cores read $0$ simultaneously in Phase 1.
* All 15 cores immediately jump to Phase 2 and execute `amoswap.w.aq` **AT THE EXACT SAME CLOCK CYCLE**!
* This creates a sudden, massive spike in bus traffic called a **Thundering Herd Collision**!

To smooth out thundering herd collisions and lower dynamic core power consumption, systems software incorporates **Hardware Contention Backoff Directives**.

---

### Hardware `pause` / `yield` Instruction Mechanics

To assist multi-core spin loops, modern CPU architectures provide a specialized, low-power hint instruction:

```text
HARDWARE PAUSE / YIELD INSTRUCTIONS ACROSS ARCHITECTURES

 Architecture │ Instruction Mnemonic │ Opcode Encoding │ Microarchitectural Action
──────────────┼──────────────────────┼─────────────────┼─────────────────────────────────────────────
 RISC-V 64    │ pause (Zihintpause)  │ fence w, 0      │ Sleep pipeline 8-32 cycles; lower core power
 x86-64       │ pause                │ F3 90           │ Delay pipeline 10-140 cycles; yield SMT thread
 ARM64        │ yield                │ yield           │ Yield execution pipeline to co-thread
```

#### What Happens Inside CPU Hardware When `pause` Executes?
1. **Pipeline Power Reduction**: The CPU control unit de-asserts clock trees in speculative execution units, dropping dynamic core power consumption by **$50\%\text{ to } 70\%$** during spinning!
2. **SMT / Hyper-Threading Yielding**: In multi-threaded CPU cores where two hardware threads share a single core execution engine, `pause` commands the core: *"This thread is spinning uselessly! Give $100\%$ of the execution ALU pipelines to the OTHER hardware thread!"*
3. **Pipeline Flush Prevention**: Prevents memory order violation pipeline flushes upon exiting the spin loop.

---

### Integrating `pause` into the TATAS Spinlock

```riscv
# TATAS SPINLOCK WITH HARDWARE PAUSE BACKOFF (RISC-V ZIHINTPAUSE)

    addi x12, x0, 1             # x12 <= 1 (Locked state payload)

tatas_pause_loop:
    lw   x10, 0(x20)            # 1. Read local L1 cache silently
    beqz x10, try_acquire       # IF lock == 0, jump to atomic acquire!

    # --- HARDWARE BACKOFF PAUSE HINT ---
    pause                       # 2. De-asserts execution pipeline power!
    j    tatas_pause_loop       # 3. Retry local read

try_acquire:
    amoswap.w.aq x10, x12, (x20)# 4. Attempt 1-pass atomic acquisition!
    bnez x10, tatas_pause_loop  # IF collision, retry spin loop
```

---

### Exponential Backoff Algorithm Mechanics

When 64 cores compete for a single lock, software adds **Exponential Backoff Delays**:

On each failed atomic swap attempt, the core doubles its backoff sleep duration before retrying:

$$\mathbf{\text{Backoff\_Delay}(k) = \min\left( \text{Delay}_{\text{base}} \times 2^k, \ \text{Delay}_{\text{max}} \right)}$$

Where:
* $k$ is the number of failed atomic swap attempts ($k = 0, 1, 2, 3 \dots$).
* $\text{Delay}_{\text{base}}$ is the initial backoff delay (e.g. $8\text{ clock cycles}$).
* $\text{Delay}_{\text{max}}$ is the maximum backoff delay ceiling (e.g. $1,024\text{ clock cycles}$).

```text
EXPONENTIAL BACKOFF PROGRESSION SCHEME

 Failed Attempt 1 ──► Execute pause ONCE          (Delay =  8 Cycles)
 Failed Attempt 2 ──► Execute pause TWICE         (Delay = 16 Cycles)
 Failed Attempt 3 ──► Execute pause 4 Times       (Delay = 32 Cycles)
 Failed Attempt 4 ──► Execute pause 8 Times       (Delay = 64 Cycles)
 (Spreads out core acquisition attempts! Eliminates Thundering Herds!)
```

By doubling the backoff delay on each failure, 64 cores spread out their atomic swap attempts over time, eliminating interconnect bus collisions entirely!

---

## Real-World Silicon Engineering: Cache Coherence Protocols (MESI) and Lock Release

In multi-core processors, spinlock performance is governed by the **MESI (Modified, Exclusive, Shared, Invalid)** cache coherence protocol.

### The Four MESI Cache Line States:

1. **Modified ($M$)**: The cache line is present ONLY in this core's L1 cache and is dirty (written).
2. **Exclusive ($E$)**: The cache line is present ONLY in this core's L1 cache and is clean.
3. **Shared ($S$)**: The cache line is present in multiple cores' L1 caches (Read-Only).
4. **Invalid ($I$)**: The cache line is stale/invalid.

```text
MESI STATE TRANSITIONS DURING SPINLOCK LIFECYCLE

 State 1: Lock Held by Core 0
   Core 0 L1 Cache : [ Modified (M) ] (lock_var = 1)
   Cores 1..15 L1  : [ Shared (S)   ] (lw reads locally in S-state!)

 State 2: Core 0 Releases Lock (amoswap.w.rl x0, x0, (x20))
   Core 0 writes 0 with Release Semantics (.rl)
   Coherence Bus   : Broadcasts Invalidation -> Cores 1..15 transition S -> I
   Cores 1..15 L1  : Re-fetch lock_var = 0 -> Phase 2 Atomic Acquire!
```

---

### Lock Release Mechanics: Why Lock Release Requires Release Semantics (`.rl`)

Releasing a spinlock requires writing $0$ into `lock_var`.

Does releasing a lock require an atomic instruction?

**NO!** Releasing a lock requires writing a single 32-bit word ($0$) to memory. A standard store instruction or atomic swap with **Release Semantics (`amoswap.w.rl x0, x0, (x20)`)** updates the memory line:

```riscv
# RELEASING A SPINLOCK WITH RELEASE SEMANTICS (.rl)

.global release_tatas_lock
release_tatas_lock:
    # Write 0 into lock_var with Release (.rl) ordering semantics
    amoswap.w.rl x0, x0, (x20)   # memory[x20] <= 0
    ret
```

#### Why Release Semantics (`.rl`) Is Mandatory for Lock Release:
The `.rl` suffix acts as a **One-Way Memory Barrier**. It commands the CPU pipeline:
> *"Flush all memory writes executed inside the critical section to RAM BEFORE setting `lock_var = 0`!"*

This guarantees that waiting cores see all updated critical section data the instant they acquire the lock!

---

## Solved Industrial Engineering Exercise: Naive TAS vs. TATAS with Backoff, Bus Coherence Traffic Audit, and Power Metrics

To consolidate your complete mastery of atomic spinlock loop synthesis, Test-and-Test-and-Set (TATAS) polling, hardware `pause` hints, exponential backoff delays, and MESI cache coherence bus traffic reduction, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing a multi-core server processor core ($f_{\text{clk}} = 3.2\text{ GHz}$, $T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$) running a high-concurrency database transaction engine.

The system consists of **16 CPU Cores** (Core 0 through Core 15) sharing a unified L2 Cache ($64\text{-byte}$ lines) over a MESI coherence interconnect bus.

```text
3.2 GHz 16-CORE PROCESSOR WITH MESI COHERENCE INTERCONNECT

 Cores 0..15 (3.2 GHz) ──► [ L1 Data Caches ] ──► MESI Coherence Bus ──► L2 Cache
 Clock T = 312.5 ps        Shared (S) / Modified (M)  RFO Invalidation = 24 Cycles
```

#### Hardware Memory System Parameters:
* Shared Lock Variable Address: $A = \text{0x0000\_0000\_1000\_2000}$ (`lock_var`).
* Initial Memory State: $A = 1$ (Locked by Core 0 for a duration of $T_{\text{hold}} = 100\text{ clock cycles} = 31.25\text{ ns}$).
* Remaining 15 Cores (Cores 1..15) spin waiting for Core 0 to release the lock.
* Coherence Bus Metrics:
  * Local L1 Cache Read Hit (`lw` in Shared $S$ state): $1\text{ clock cycle}$ ($0.3125\text{ ns}$), $0\text{ bus messages}$.
  * Atomic Write / RFO Invalidation Request (`amoswap` in $M$ state): $24\text{ clock cycles}$ ($7.50\text{ ns}$), broadcasts $15\text{ bus invalidation messages}$.
  * Hardware `pause` instruction execution: $8\text{ clock cycles}$ ($2.50\text{ ns}$) of low-power pipeline sleep.
* Dynamic Power Metrics:
  * Active Core Spinning without `pause`: $10.0\text{ Watts}$ per core.
  * Core Sleeping during `pause`: $4.0\text{ Watts}$ per core ($60\%\text{ power reduction}$).

#### Tested Spinlock Implementation Strategies:
* **Strategy 1 (Naive TAS Spinlock)**: Cores 1..15 execute `amoswap.w.aq` continuously in a tight loop while the lock is held.
* **Strategy 2 (TATAS Spinlock with `pause` Hint)**: Cores 1..15 poll locally using `lw` + `pause` while the lock is held, executing `amoswap.w.aq` ONLY ONCE when `lock_var == 0`.

#### Your Objective

1. For **Strategy 1 (Naive TAS Spinlock)**:
   * Calculate the total number of atomic `amoswap` write requests issued by 15 spinning cores across the 100-cycle lock hold duration ($T_{\text{hold}} = 100\text{ cycles}$).
   * Calculate total RFO cache invalidation messages broadcast across the coherence bus.
   * Calculate total dynamic power consumed by 15 spinning cores (in Watts).
2. For **Strategy 2 (TATAS Spinlock with `pause` Hint)**:
   * Trace the cache line state ($S$ vs $M$) across Cores 1..15 while the lock is held.
   * Calculate the total RFO cache invalidation messages broadcast across the coherence bus during the 100-cycle spin period.
   * Calculate total dynamic power consumed by 15 spinning cores with `pause` active.
3. Calculate the percentage reduction in coherence bus traffic and dynamic power savings provided by Strategy 2 over Strategy 1.
4. Write the complete, valid RISC-V 64-bit assembly implementation for Strategy 2 (TATAS with `pause` and `amoswap.w.aq`).
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Analyze Strategy 1 (Naive TAS Spinlock Performance)

Under Strategy 1, 15 cores execute `amoswap.w.aq` in a 2-instruction loop (`amoswap` + `bnez`).

1. **Loop Iteration Time**: 1 `amoswap` ($24\text{ cycles}$ bus RFO) + 1 `bnez` ($1\text{ cycle}$) $= 25\text{ clock cycles per iteration}$.
2. **Number of Iterations per Core in 100 Cycles**:

$$\text{Iterations per Core} = \frac{100\text{ cycles}}{25\text{ cycles/iter}} = \mathbf{4 \text{ atomic swap attempts per core}}$$

3. **Total Atomic Swap Attempts across 15 Cores**:

$$\text{Total Swap Attempts} = 15 \text{ cores} \times 4 \text{ attempts/core} = \mathbf{60 \text{ Atomic Swap Requests}}$$

4. **Coherence Bus Invalidation Messages**:
   * Each `amoswap` sends RFO invalidations to the other 15 cores ($15\text{ messages}$):

$$\text{Total Bus Messages (Strategy 1)} = 60 \text{ swaps} \times 15 \text{ invalidations/swap} = \mathbf{900 \text{ Coherence Bus Messages!}}$$

5. **Dynamic Power Consumed by 15 Spinning Cores**:

$$\text{Power}_{\text{Strategy1}} = 15 \text{ cores} \times 10.0\text{ W/core} = \mathbf{150.0 \text{ Watts}}$$

```text
STRATEGY 1 (NAIVE TAS) BUS FLOODING SUMMARY

 15 Spinning Cores x Continuous Atomic Swaps ──► 60 Atomic Write Requests
                                                ──► 900 Coherence Bus Messages!
                                                ──► 150.0 Watts Dynamic Power!
 (Interconnect bus completely choked! Thermal power spike!)
```

---

#### Step 2: Analyze Strategy 2 (TATAS Spinlock with `pause` Performance)

Under Strategy 2, 15 cores execute local `lw` reads inside a `pause` loop while `lock_var == 1`.

1. **Cache Line State during Lock Hold**:
   * Address `0x10002000` is fetched ONCE by each core into its L1 cache in **Shared ($S$) State**.
   * While `lock_var == 1`, all 15 cores execute `lw` locally from their own L1 cache in $S$ state!
   * **RFO Atomic Swaps Issued while Lock = 1**: **ZERO!**
2. **Coherence Bus Invalidation Messages during 100-Cycle Lock Hold**:

$$\text{Total Bus Messages (Strategy 2 during Lock Hold)} = \mathbf{0 \text{ Coherence Bus Messages!}}$$

3. **Dynamic Power Consumption with `pause` Active**:
   * Each core executes `lw` ($1\text{ cycle}$) + `bnez` ($1\text{ cycle}$) + `pause` ($8\text{ cycles}$) $= 10\text{ cycles per loop pass}$.
   * During the 8-cycle `pause`, the core pipeline sleeps at $4.0\text{ Watts}$.
   * Weighted Average Power per Core:

$$\text{Power}_{\text{core}} = \left( \frac{2\text{ cycles}}{10\text{ cycles}} \times 10.0\text{ W} \right) + \left( \frac{8\text{ cycles}}{10\text{ cycles}} \times 4.0\text{ W} \right) = 2.0\text{ W} + 3.2\text{ W} = \mathbf{5.2 \text{ Watts/core}}$$

4. **Total Dynamic Power Consumed by 15 Spinning Cores**:

$$\text{Power}_{\text{Strategy2}} = 15 \text{ cores} \times 5.2\text{ W/core} = \mathbf{78.0 \text{ Watts}}$$

```text
STRATEGY 2 (TATAS + PAUSE) BUS SAVINGS SUMMARY

 15 Cores Read L1 Cache in Shared S-State ──► 0 Atomic Write Requests
                                            ──► 0 Coherence Bus Messages!
                                            ──► 78.0 Watts Dynamic Power!
 (Interconnect bus completely quiet! 48% Power Reduction!)
```

---

#### Step 3: Calculate Bus Traffic Reduction and Power Savings

1. **Coherence Bus Message Reduction**:
   * Strategy 1 Bus Messages = $900$. Strategy 2 Bus Messages = $0$.

$$\text{Bus Traffic Reduction} = \frac{900 - 0}{900} \times 100\% = \mathbf{100.0\% \text{ Bus Invalidation Reduction!}}$$

2. **Dynamic Power Reduction**:

$$\text{Power Savings} = \frac{150.0\text{ W} - 78.0\text{ W}}{150.0\text{ W}} \times 100\% = \frac{72.0\text{ W}}{150.0\text{ W}} \times 100\% = \mathbf{48.0\% \text{ Dynamic Power Savings!}}$$

Strategy 2 **eliminated $100.0\%$ of coherence bus invalidation traffic** during the lock hold period and **cut dynamic power consumption by $48.0\%$**!

---

#### Step 4: Write Complete Strategy 2 Assembly Source Code

```riscv
# STRATEGY 2: TEST-AND-TEST-AND-SET (TATAS) SPINLOCK WITH PAUSE HINT

.global acquire_tatas_lock
acquire_tatas_lock:
    # Input: x20 holds physical address of lock_var (0x10002000)
    addi x12, x0, 1             # x12 <= 1 (Locked state payload)

tatas_local_read_loop:
    # --- PHASE 1: SILENT LOCAL READ POLLING (Shared S-State Cache) ---
    lw   x10, 0(x20)            # Read lock_var locally from L1 cache (0 bus traffic!)
    beqz x10, try_atomic_acquire # IF lock_var == 0 (Free!), attempt atomic swap!

    # --- PHASE 2: HARDWARE PAUSE BACKOFF ---
    pause                       # Lowers core power & yields execution pipeline
    j    tatas_local_read_loop  # Re-test local read

try_atomic_acquire:
    # --- PHASE 3: SINGLE ATOMIC LOCK ACQUISITION ---
    amoswap.w.aq x10, x12, (x20)# Atomically swap x12 (1) with memory[x20]
    bnez x10, tatas_local_read_loop # IF old_value != 0 (Collision!), retry spin loop

    # --- LOCK ACQUIRED SUCCESSFULLY ---
    ret                         # Return to critical section!

.global release_tatas_lock
release_tatas_lock:
    # Releasing the lock requires writing 0 to lock_var with Release Semantics (.rl)
    amoswap.w.rl x0, x0, (x20)  # Atomically store 0 into lock_var with Release ordering
    ret                         # Return to caller
```

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and cache coherence results:

1. **Coherence Bus Traffic Verification**:
   * Strategy 1 executed 60 atomic writes, generating $60 \times 15 = 900$ bus invalidation messages.
   * Strategy 2 executed local `lw` reads from L1 cache lines in Shared ($S$) state, generating $0$ bus invalidations while the lock was held. $100\%$ bus reduction verified!
2. **Power Calculation Verification**:
   * Active power $= 10.0\text{ W}$, Pause power $= 4.0\text{ W}$.
   * Duty cycle $= 2\text{ active cycles} + 8\text{ pause cycles}$.
   * Weighted power $= (0.20 \times 10) + (0.80 \times 4) = 2.0 + 3.2 = 5.2\text{ W/core}$.
   * Total 15 cores $= 15 \times 5.2 = 78.0\text{ W}$. Math verified!
3. **Lock Release Semantics Check**:
   * `release_tatas_lock` executed `amoswap.w.rl x0, x0, (x20)`, using `.rl` (Release) semantics to ensure all memory writes inside the critical section drain to RAM *before* the lock is released!

All atomic swap counts, MESI cache line state transitions, coherence bus invalidation message reductions, `pause` pipeline power savings, and acquire/release memory ordering semantics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Atomic Spinlock Loop**: A mutual exclusion synchronization loop (`tatas_spin_loop`) that combines silent local read polling (`lw`) on Shared ($S$) cache lines with single-pass atomic acquisition instructions (`amoswap.w.aq` / `sc.w`), preventing cache line bouncing and coherence bus lockup hazards.
* **Spinlock Contention Backoff (`pause` / `yield`)**: A microarchitectural execution hint (`pause`) that de-asserts execution pipeline clock trees during spin loops, reducing dynamic core power consumption by up to $60\%$ and eliminating speculative memory order flushes while waiting for lock releases.
