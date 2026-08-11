content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/01-cache-side-channel-attacks/01-timing-side-channels/04-evict-time-attack-mechanics.md
# Evict+Time Attack Mechanics and Execution Timing Delta Analysis

In high-performance multi-tenant computing systems, security boundaries between isolated processes, sandboxed containers, and virtual machines rely on operating system privilege rings and hardware virtual memory address translation. When software applications execute on a shared processor core, they interact with the CPU's memory hierarchy, loading instructions and data into Level 1, Level 2, and shared Level 3 caches. In many security-sensitive deployment scenarios, an attacker process cannot continuously inspect or reload memory lines after a victim process finishes executing, nor can it monitor individual cache accesses in real time without disturbing the victim's microarchitectural state or triggering fine-grained access alarms. However, if an attacker possesses the ability to selectively evict a specific candidate memory line from the CPU cache hierarchy *before* the victim executes, the attacker can observe a macroscopic microarchitectural side effect: the change in the victim's **total end-to-end execution time**. If the victim's secret-dependent execution path requires the evicted memory line, the victim's CPU core suffers a cache miss, experiences an off-chip DRAM fetch latency penalty, and takes a measurably longer time to complete its overall task. Conversely, if the victim's secret-dependent execution path bypasses the evicted line, the eviction causes zero latency penalty, and the total execution time remains fast. This targeted surveillance technique, known as the **Evict+Time attack**, enables an unprivileged observer to reconstruct secret cryptographic keys and infer control-flow decisions by analyzing end-to-end **execution timing deltas**, converting macroscopic program execution durations into a precise microarchitectural window into private victim operations.

```text
THE EVICT+TIME ATTACK CYCLE

 Attacker Process                     Victim Process Execution
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ 1. EVICT (clflush / Set)  ├───────►│ Line L Evicted from Cache │
 └─────────────┬─────────────┘        └─────────────┬─────────────┘
               │                                    │
               ▼                                    │
 ┌───────────────────────────┐                      │
 │ 2. START TIMER (t1)       │                      │
 └─────────────┬─────────────┘                      │
               │                                    │
               ▼                                    ▼
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ 3. TRIGGER VICTIM         ├───────►│ Runs Full Algorithm       │
 └─────────────┬─────────────┘        │ * Reads L  -> DRAM Delay  │
               │                      │ * Skips L  -> Fast Exec   │
               ▼                      └─────────────┬─────────────┘
 ┌───────────────────────────┐                      │
 │ 4. STOP TIMER (t2)        │◄─────────────────────┘
 │    Delta = t2 - t1        │
 └─────────────┬─────────────┘
               │
               ▼
 Deduce: Delta T > 0 => Victim accessed Line L!
```

---

## The Locksmith and the Missing Tool

To build an intuitive, crystal-clear mental model of how an Evict+Time attack operates before we inspect assembly instructions, statistical timing distributions, and hardware pipeline mechanics, let us consider a simple real-world analogy: a master locksmith working in a secure workshop.

Imagine a master locksmith (the Victim) working inside a private workshop. The locksmith is tasked with opening a high-security combination lock (a secret cryptographic key). The workshop contains a workbench holding 10 standard tools, and a large storage shed down the street holding 1,000 specialized tools. 

An observer (the Attacker) stands outside the workshop building. The observer wants to find out if the combination lock requires a specialized tool—say, Pick #7—to open. The observer is forbidden from entering the workshop, looking through the windows, or talking to the locksmith. The observer cannot see which tools the locksmith picks up while working inside.

However, the observer notices a critical physical rule of the workshop:
1. At the start of the day, all 10 tools on the workbench are ready for immediate use.
2. If the locksmith needs a tool that is sitting right there on the workbench, they pick it up and use it instantly in **1 second**.
3. If the locksmith needs a tool that is missing from the workbench, they must pause their work, walk down the street to the storage shed, retrieve the tool, and walk back, which takes **50 seconds**.

The observer devises a clever strategy to discover if Pick #7 is required for the combination lock:
* **The Baseline Measurement**: First, the observer measures how long the locksmith normally takes to open the lock when all tools are present on the workbench. Suppose the job takes exactly **300 seconds** ($5\text{ minutes}$). This is the baseline execution time.
* **The Evict Phase**: Before the locksmith starts working on the next identical lock, the observer sneaks into the workshop during the lunch break and steals Pick #7 from the workbench, hiding it in the storage shed down the street. The observer knows with $100\%$ certainty that Pick #7 is absent from the workbench.
* **The Execution & Timing Phase**: The locksmith enters the workshop, begins opening the lock, and the observer starts a stopwatch outside the door. The observer measures the total time it takes the locksmith to finish the job:
  * **Scenario A (Fast Execution / No Delta)**: The locksmith opens the lock in **300 seconds** ($5\text{ minutes}$). The observer thinks: *"The job took the exact same time as the baseline! The locksmith never needed Pick #7! Therefore, this lock's combination does not require Pick #7!"*
  * **Scenario B (Slow Execution / Timing Delta)**: The locksmith opens the lock in **350 seconds** ($5\text{ minutes and 50 seconds}$). The observer thinks: *"The job took 50 seconds longer than normal! Why? Because the locksmith reached for Pick #7, found it missing from the workbench, walked down the street to the storage shed to get it, and came back! Therefore, this lock's combination $100\%$ requires Pick #7!"*

```text
THE LOCKSMITH TIMING DELTA LEAKAGE

 Observer Steals Pick #7 ──► Locksmith Opens Lock ──► Observer Measures Total Time
 (EVICT Phase)               (VICTIM Execution)      (TIMING DELTA Analysis)
 Workbench missing Pick #7   If Pick #7 needed:      300 Sec = Pick #7 NOT used!
                             Must walk to shed!      350 Sec = Pick #7 WAS used!
```

Notice what the observer accomplished:
* The observer never entered the workshop while the locksmith was working.
* The observer never saw which tools were touched during the job.
* The observer simply removed one candidate tool, triggered the full task, and measured the **end-to-end execution time delta** ($300\text{ seconds}$ versus $350\text{ seconds}$).
* The $50\text{-second}$ macro timing delay proved beyond a shadow of a doubt that Pick #7 was required by the secret combination!

This locksmith scenario is the exact physical analogue of the **Evict+Time Cache Side-Channel Attack**:
* The master locksmith is the **Victim Software Algorithm** (e.g., an RSA exponentiation loop or AES encryption round).
* The combination lock is the **Secret Cryptographic Key**.
* The 10 workbench tools are **Lines in the L1/L2 CPU Cache**.
* The storage shed down the street is **Main System DRAM Memory**.
* Stealing Pick #7 from the workbench is **Evicting a Candidate Cache Line (`clflush` or Eviction Set)**.
* The 50-second walk to the storage shed is the **Off-Chip DRAM Fetch Penalty (~50 ns)**.
* The stopwatch measuring $300\text{s}$ vs $350\text{s}$ is the **Execution Timing Delta Analysis ($\Delta T = T_{\text{evicted}} - T_{\text{baseline}}$)**.

---

## The Evict+Time Attack Lifecycle

Unlike Flush+Reload or Prime+Probe, which measure individual cache line access latencies immediately after or during a victim's access, the Evict+Time attack measures the **macroscopic end-to-end execution time of the entire victim algorithm**.

The attack progresses through four distinct phases:
1. **The BASELINE MEASUREMENT Phase**
2. **The SELECTIVE EVICTION Phase**
3. **The VICTIM EXECUTION Phase**
4. **The TIMING DELTA ANALYSIS Phase**

```text
EVICT+TIME DETAILED EXECUTION FLOW

  ┌──────────────────────────────────────────────────────────┐
  │ 1. BASELINE MEASUREMENT PHASE                            │
  │    Measure N un-interfered victim executions.            │
  │    Calculate T_baseline = Average(T_1, T_2, ... T_N).   │
  └────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 2. SELECTIVE EVICTION PHASE                              │
  │    Select candidate line L (e.g., Table T[k] or Code).   │
  │    Evict line L from cache using 'clflush' or Eviction Set.│
  └────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 3. VICTIM EXECUTION PHASE                                │
  │    Record start time t1. Trigger full victim execution. │
  │    Record end time t2. Calculate T_evicted(L) = t2 - t1. │
  └────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 4. TIMING DELTA ANALYSIS PHASE                           │
  │    Calculate Delta_T(L) = T_evicted(L) - T_baseline.     │
  │    * Delta_T ≈ T_DRAM  -> Line L WAS accessed by victim! │
  │    * Delta_T ≈ 0       -> Line L WAS NOT accessed!     │
  └────────────────────────────┬─────────────────────────────┘
                               │
                               └────── Repeat for next line!
```

---

### Phase 1: The BASELINE MEASUREMENT Phase

Before attempting to evict any cache lines, the attacker must establish a statistical baseline for the victim process's normal, un-interfered execution time.

1. The attacker triggers $M$ independent executions of the victim process using known input parameters (e.g., sending $M$ encryption requests to an AES service).
2. For each execution $i \in [1, M]$, the attacker measures the total elapsed time $T_i$ from request dispatch to response arrival using high-resolution hardware timers (`RDTSC`/`RDTSCP` or system timers).
3. The attacker calculates the **Baseline Mean Execution Time ($T_{\text{baseline}}$)** and the statistical variance ($\sigma^2_{\text{baseline}}$):

$$T_{\text{baseline}} = \frac{1}{M} \sum_{i=1}^{M} T_i$$

$$\sigma^2_{\text{baseline}} = \frac{1}{M-1} \sum_{i=1}^{M} (T_i - T_{\text{baseline}})^2$$

Where:
* $T_{\text{baseline}}$ is the expected un-interfered victim execution duration in clock cycles or nanoseconds.
* $T_i$ is the measured execution time of trial $i$.
* $M$ is the number of baseline measurement samples (typically $M = 1,000 \text{ to } 10,000$).
* $\sigma^2_{\text{baseline}}$ is the variance of execution timing noise caused by background operating system activity.

```text
BASELINE EXECUTION TIMING DISTRIBUTION

 Sample Count
  ▲
  │            ┌─────┐
  │            │     │  Baseline Distribution (Mean = T_baseline)
  │          ──┴─────┴──
  └─────────────────────────────────────────────────► Execution Time (Cycles)
               T_baseline
```

---

### Phase 2: The SELECTIVE EVICTION Phase

In the second phase, the attacker targets a specific candidate memory line $L$ in the shared memory space or target cache set. Memory line $L$ corresponds to a specific data lookup table entry (such as an AES substitution table entry $T[k]$) or a specific code block (such as an RSA multiplication loop).

The attacker forcibly evicts candidate line $L$ from the CPU cache hierarchy using one of two methods:
* **Method 1 (Direct Instruction Eviction)**: If the memory page containing line $L$ is shared (e.g., via shared read-only library mappings), the attacker executes the unprivileged `clflush` instruction targeting line $L$:
  $$\text{clflush}(L) \implies \text{Line } L \text{ invalidated across L1, L2, and L3 caches.}$$
* **Method 2 (Set-Conflict Eviction)**: If memory pages are not shared, the attacker accesses an **Eviction Set** $E_L$ consisting of $N$ private memory addresses mapping to the exact same cache set index as line $L$. Accessing $E_L$ fills all $N$ ways of the set, forcing line $L$ out of the cache hierarchy.

```text
CACHE STATE AFTER SELECTIVE EVICTION OF LINE L

 Target Cache Set Row (8 Ways):
 ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 │ Way 0   │ Way 1   │ Way 2   │ Way 3   │ Way 4   │ Way 5   │ Way 6   │ Way 7   │
 │ [Other] │ [Other] │ INVALID │ [Other] │ [Other] │ [Other] │ [Other] │ [Other] │
 └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
                       ▲
                       └─ Candidate Line L is INVALIDATED / EVICTED!
```

---

### Phase 3: The VICTIM EXECUTION Phase

Immediately after evicting line $L$, the attacker triggers the victim process to execute its algorithm on the same input parameters used during Phase 1.

The attacker captures the start timestamp $t_1$ right before triggering the victim, and captures the end timestamp $t_2$ immediately upon receiving the victim's completion response:

```c
// Evict+Time execution measurement
uint64_t measure_evicted_execution(volatile uint8_t *candidate_line) {
    uint64_t t1, t2;
    uint32_t aux;

    // 1. EVICT: Remove candidate line L from cache hierarchy
    asm volatile ("clflush (%0)\n\t" :: "r"(candidate_line) : "memory");
    asm volatile ("mfence\n\t"); // Ensure eviction completes before execution

    // 2. START TIMER: Read time-stamp counter t1
    asm volatile ("lfence\n\t");
    t1 = __rdtsc();
    asm volatile ("lfence\n\t");

    // 3. TRIGGER VICTIM: Execute full algorithm
    trigger_victim_execution();

    // 4. STOP TIMER: Read time-stamp counter t2
    t2 = __rdtscp(&aux);
    asm volatile ("lfence\n\t");

    return (t2 - t1); // Total execution time T_evicted(L)
}
```

---

### Phase 4: The TIMING DELTA ANALYSIS Phase

The attacker calculates the **Execution Timing Delta ($\Delta T(L)$)** for candidate line $L$:

$$\mathbf{\Delta T(L) = T_{\text{evicted}}(L) - T_{\text{baseline}}}$$

Where:
* $\Delta T(L)$ is the net execution time delay caused by evicting line $L$.
* $T_{\text{evicted}}(L)$ is the measured execution time of the victim when line $L$ was evicted prior to execution.
* $T_{\text{baseline}}$ is the un-interfered baseline execution time measured in Phase 1.

```text
TIMING DELTA BIFURCATION (ACCESSED VS UN-ACCESSED)

 Measured Execution Time T_evicted(L)
 ┌───────────────────────────────────────────────────────────┐
 │ Case A: Line L WAS Accessed by Victim                     │
 │ T_evicted(L) = T_baseline + T_DRAM_miss                  │
 │ Delta T(L) ≈ +160 Clock Cycles (STATISTICALLY SIGNIFICANT!)│
 ├───────────────────────────────────────────────────────────┤
 │ Case B: Line L WAS NOT Accessed by Victim                 │
 │ T_evicted(L) = T_baseline + 0                             │
 │ Delta T(L) ≈ 0 Clock Cycles (NO TIMING DELTA!)            │
 └───────────────────────────────────────────────────────────┘
```

#### Microarchitectural Mathematical Analysis of $\Delta T(L)$:

Let $k_L \in \{0, 1\}$ be a binary indicator variable representing whether line $L$ was accessed by the victim process during execution:
* $k_L = 1 \implies$ The victim's secret-dependent execution path accessed line $L$.
* $k_L = 0 \implies$ The victim's execution path did not access line $L$.

When $k_L = 1$, the victim attempts to read line $L$. Because the attacker evicted line $L$ in Phase 2, the victim suffers a cache miss, forcing the memory controller to fetch line $L$ from main DRAM memory ($T_{\text{DRAM}} \approx 160\text{ clock cycles}$):

$$T_{\text{evicted}}(L) = T_{\text{baseline}} + (k_L \cdot T_{\text{DRAM\_miss}})$$

Subtracting $T_{\text{baseline}}$ yields:

$$\Delta T(L) = k_L \cdot T_{\text{DRAM\_miss}}$$

$$\Delta T(L) = \begin{cases} T_{\text{DRAM\_miss}} \approx +160 \text{ Cycles} & \text{if } k_L = 1 \text{ (Line } L \text{ WAS accessed)} \\ 0 \text{ Cycles} & \text{if } k_L = 0 \text{ (Line } L \text{ WAS NOT accessed)} \end{cases}$$

By evaluating whether $\Delta T(L)$ is statistically greater than zero, the attacker discovers whether line $L$ participated in the victim's secret computation!

---

## Reconstructing Secret Keys via Evict+Time

Let us walk through how an attacker uses Evict+Time execution timing deltas to reconstruct secret cryptographic keys, using a 128-bit Advanced Encryption Standard (AES-128) implementation as a concrete example.

### The AES Substitution Table Lookup Dependency

In many software implementations of AES, the first encryption round computes substitution table lookups for each of the 16 bytes of input state. 

For byte 0 of input plaintext ($P_0$) and byte 0 of secret key ($K_0$), the algorithm reads substitution table $T_0$ at offset $x_0 = P_0 \oplus K_0$:

$$A_{\text{lookup}} = \text{Base\_Address}(T_0) + ((P_0 \oplus K_0) \times 4)$$

Table $T_0$ contains 256 4-byte entries ($1,024\text{ bytes}$ total), which span **16 64-byte cache lines** ($L_0, L_1, \dots, L_{15}$). Each cache line holds 16 table entries:
* Line $L_0$ holds entries $T_0[0] \dots T_0[15]$ (Offsets `0x000` to `0x03F`).
* Line $L_1$ holds entries $T_0[16] \dots T_0[31]$ (Offsets `0x040` to `0x07F`).
* Line $L_m$ holds entries $T_0[16m] \dots T_0[16m+15]$.

```text
AES SUBSTITUTION TABLE L1 CACHE LINE MAPPING

 Table T0 (1,024 Bytes Total = 16 Cache Lines)
 Line 0  (Offsets 0x000..0x03F): T0[0]  .. T0[15]  ──► Cache Set Index S_0
 Line 1  (Offsets 0x040..0x07F): T0[16] .. T0[31]  ──► Cache Set Index S_1
 Line 2  (Offsets 0x080..0x0BF): T0[32] .. T0[47]  ──► Cache Set Index S_2
 ...
 Line 15 (Offsets 0x3C0..0x3FF): T0[240].. T0[255] ──► Cache Set Index S_15
```

---

### The Evict+Time Secret Reconstruction Algorithm

To recover secret key byte $K_0$, the attacker executes the following systematic testing loop across all 16 candidate cache lines ($m \in [0, 15]$):

```text
SECRET KEY RECOVERY ALGORITHM VIA EVICT+TIME

 1. Measure Baseline Execution Time T_baseline over 10,000 runs.
 
 2. For each Candidate Cache Line L_m (m = 0 to 15):
      a. Evict Line L_m from cache hierarchy: clflush(L_m).
      b. Trigger victim AES encryption with known Plaintext P_0.
      c. Measure Total Execution Time T_evicted(L_m).
      d. Calculate Timing Delta: Delta_T(L_m) = T_evicted(L_m) - T_baseline.
      
 3. Identify the Line L_target that produced a Significant Positive Delta!
    Delta_T(L_target) ≈ +160 Cycles  ==> Line L_target WAS ACCESSED!
    
 4. Deduce Secret Key Byte K_0:
    Table Index x_0 = P_0 XOR K_0 MUST lie within range [16 * target, 16 * target + 15]!
```

#### Step-by-Step Numerical Walkthrough:

Suppose the attacker sets $P_0 = \text{0x53}$ and executes the testing loop across all 16 lines:

1. **Evicting Line 0 ($T_0[0..15]$)**: $\Delta T(L_0) = 2\text{ cycles} \approx 0 \implies$ Line 0 was NOT accessed.
2. **Evicting Line 1 ($T_0[16..31]$)**: $\Delta T(L_1) = -1\text{ cycle} \approx 0 \implies$ Line 1 was NOT accessed.
3. **Evicting Line 2 ($T_0[32..47]$)**: $\Delta T(L_2) = 158\text{ cycles} \approx +160 \implies$ **LINE 2 WAS ACCESSED!**
4. **Evicting Lines 3..15**: $\Delta T(L_m) \approx 0 \implies$ Lines 3..15 were NOT accessed.

```text
EVICT+TIME MEASURED TIMING DELTA VECTOR FOR PLAINTEXT P_0 = 0x53

 Line Index m │ Address Offset Range │ Measured Delta T(L_m) │ Inference
──────────────┼──────────────────────┼───────────────────────┼────────────────────────
   Line 0     │  0x000 .. 0x03F      │     +2 Cycles         │ Line NOT accessed
   Line 1     │  0x040 .. 0x07F      │     -1 Cycle          │ Line NOT accessed
   Line 2     │  0x080 .. 0x0BF      │   +158 Cycles!        │ LINE WAS ACCESSED!
   Line 3     │  0x0C0 .. 0x0FF      │      0 Cycles         │ Line NOT accessed
   ...        │  ...                 │     ...               │ Line NOT accessed
   Line 15    │  0x3C0 .. 0x3FF      │     +1 Cycle          │ Line NOT accessed
```

##### Mathematical Key Reduction:
Line 2 covers table entry indices $x_0 \in [32, 47]$. 

Because $x_0 = P_0 \oplus K_0$, we know that:

$$32 \le (P_0 \oplus K_0) \le 47$$

In 8-bit binary representation:
* $32_{10} = 0010\_0000_2 = \text{0x20}$
* $47_{10} = 0010\_1111_2 = \text{0x2F}$

Since $P_0 = \text{0x53} = 0101\_0011_2$:

$$K_0 = P_0 \oplus x_0$$

For $x_0 = 32 = 0010\_0000_2$:
$$K_0 = 0101\_0011_2 \oplus 0010\_0000_2 = 0111\_0011_2 = \mathbf{\text{0x73}}$$

For $x_0 = 47 = 0010\_1111_2$:
$$K_0 = 0101\_0011_2 \oplus 0010\_1111_2 = 0111\_1100_2 = \mathbf{\text{0x7C}}$$

##### Result:
The attacker reduced the search space for secret key byte $K_0$ from **256 possibilities down to just 16 candidate values (`0x70` through `0x7F`)** in a single Evict+Time test series!

By repeating this test with 3 different plaintexts ($P_0$), the candidate set intersects at a **single unique byte value ($K_0 = \text{0x73}$)** with $100\%$ mathematical certainty!

---

## Technical Comparison: Evict+Time vs Flush+Reload vs Prime+Probe

It is essential for microarchitectural security engineers to understand the structural trade-offs between the three classic cache side-channel attack primitives:

```text
MICROARCHITECTURAL CACHE SIDE-CHANNEL COMPARISON MATRIX

 Attack Primitive  │ Requires Shared Memory? │ Requires Special Instructions? │ Primary Latency Signal Measured
───────────────────┼─────────────────────────┼────────────────────────────────┼─────────────────────────────────────────
 Flush+Reload      │ YES (mmap / shared lib) │ YES (clflush / clflushopt)     │ Time to reload target line after victim
 Prime+Probe       │ NO  (Zero shared memory)│ NO  (Standard LOAD / STORE)    │ Time to reload attacker's own eviction set
 Evict+Time        │ NO  (If using EvictSet) │ NO  (If using EvictSet)        │ End-to-End TOTAL victim execution time
```

```text
COMPARATIVE ADVANTAGES AND WEAKNESSES

 1. Flush+Reload
    * Advantages : Extremely high signal-to-noise ratio; zero false positives.
    * Weaknesses : Fails completely if shared memory deduplication is disabled.

 2. Prime+Probe
    * Advantages : Works with zero shared memory; highly flexible across VMs/containers.
    * Weaknesses : Requires complex eviction set construction; higher background noise.

 3. Evict+Time
    * Advantages : Requires measuring ONLY macroscopic end-to-end execution duration;
                   does not require probing the cache after the victim runs.
    * Weaknesses : Vulnerable to overall OS execution noise; requires thousands of samples
                   to extract small timing deltas from long algorithm runtimes.
```

---

## Engineering Reality: Noise, Sample Sizes, and Masking Effects

Executing an Evict+Time attack on a commercial multi-core processor running a real-world operating system requires managing several microarchitectural timing hazards:

### 1. Statistical Noise and Sample Size Requirements

A $64\text{-byte}$ DRAM cache miss adds approximately $160\text{ clock cycles}$ ($50\text{ ns}$) to total execution time. 

If the victim algorithm takes $100,000\text{ clock cycles}$ ($31.25\ \mu\text{s}$) to execute, a $160\text{-cycle}$ delta represents **less than $0.16\%$ of the total execution time**!

Background operating system noise (interrupts, context switches, thread scheduling, power state transitions) creates timing jitter with a standard deviation ($\sigma_{\text{noise}}$) often exceeding $\pm 500\text{ clock cycles}$.

```text
NOISE MASKING HAZARD IN MACROSCOPIC TIMING

 Total Victim Execution Time (100,000 Cycles)
 ┌─────────────────────────────────────────────────────────────┬──────────┐
 │ Normal Algorithm Execution (100,000 Cycles)                 │ 160 Cyc  │
 └─────────────────────────────────────────────────────────────┴──────────┘
  ◄────────────────── Baseline Jitter ±500 Cycles ────────────► ◄─ Delta ─►
  (The 160-cycle DRAM delta is completely swallowed by 500-cycle OS jitter!)
```

#### The Statistical Solution: Sample Averaging ($N_{\text{samples}}$)

According to the **Central Limit Theorem**, the standard error of the mean ($\sigma_{\bar{x}}$) decreases proportionally to the square root of the number of measurement samples ($M$):

$$\sigma_{\bar{x}} = \frac{\sigma_{\text{noise}}}{\sqrt{M}}$$

To resolve a $160\text{-cycle}$ timing delta ($\Delta T$) buried beneath $\sigma_{\text{noise}} = 500\text{ cycles}$ of noise with a $99.9\%$ confidence level ($Z \approx 3.0$):

$$Z \cdot \frac{\sigma_{\text{noise}}}{\sqrt{M}} < \frac{\Delta T}{2}$$

$$3.0 \cdot \frac{500}{\sqrt{M}} < \frac{160}{2} = 80$$

$$\sqrt{M} > \frac{1500}{80} = 18.75 \implies M > (18.75)^2 \implies \mathbf{M \ge 352 \text{ Samples per Line}}$$

By averaging 352 execution samples per candidate line, the statistical noise floor drops below $80\text{ cycles}$, revealing the $160\text{-cycle}$ Evict+Time signal with $100\%$ mathematical clarity!

---

### 2. Out-of-Order Pipeline Masking Effects

Modern out-of-order CPU execution engines contain Reorder Buffers (ROBs) and Load-Store Queues (LSQs) that execute instructions speculatively.

If a victim process misses on evicted line $L$, but the CPU pipeline contains independent instructions that can execute speculatively while line $L$ is being fetched from DRAM:
* The out-of-order execution engine overlaps the 160-cycle DRAM fetch latency with independent arithmetic calculations!
* The net macroscopic execution time delay $\Delta T$ is **partially or completely hidden** by out-of-order execution parallelism (**Latency Hiding**).

```text
OUT-OF-ORDER LATENCY HIDING HAZARD

 Pipeline Timeline:
 Line L Load (DRAM Fetch 160 Cycles) : [========================================]
 Independent Arithmetic Executed    : [ Math 1 ][ Math 2 ][ Math 3 ][ Math 4 ]
                                       ◄── Overlapped Parallel Execution ──►
 Net Observed Macroscopic Delay     : ONLY 20 CYCLES ADDED TO TOTAL TIME!
```

#### Mitigating Latency Hiding:
Attackers target candidate lines that control **data dependencies** or **critical branch decisions** (such as loop termination conditions or indirect call targets). Critical path dependencies cannot be overlapped by out-of-order execution, ensuring that the full DRAM miss latency impacts the end-to-end execution timer!

---

## Solved Industrial Engineering Exercise: Quantitative Evict+Time Delta Analysis, Sample Size Derivation, and Key Bit Extraction

To consolidate your complete mastery of Evict+Time attack mechanics, statistical baseline subtractions, $Z$-score hypothesis testing, and secret key reconstruction math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitectural security engineer auditing a 3.2 GHz single-core RISC-V server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server executes an un-mitigated RSA-1024 modular exponentiation algorithm. The algorithm processes a secret private key exponent $d$ bit-by-bit from bit 0 to bit 1023.

When processing bit $k$ of the exponent ($d_k$):
* If $d_k == 0$, the CPU executes only the **Square Operation** (`Square_Code` at address `0x0800_1000`).
* If $d_k == 1$, the CPU executes the **Square Operation** followed immediately by the **Multiply Operation** (`Mult_Code` at address `0x0800_2000`).

```text
RSA MODULAR EXPONENTIAL MEMORY LAYOUT

 Memory Map Location:
 * Square Code Block   : 0x0800_1000 (Spans Cache Line L_sq)
 * Multiply Code Block : 0x0800_2000 (Spans Cache Line L_mult)
```

#### System Microarchitectural Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
* Un-interfered Baseline Exponentiation Loop Time per bit: $T_{\text{loop\_base}} = 2,000\text{ CPU clock cycles}$ ($625.0\text{ ns}$).
* L1 Instruction Cache Miss Latency (DRAM fetch): $T_{\text{DRAM\_miss}} = 160\text{ CPU clock cycles}$ ($50.0\text{ ns}$).
* Operating System Execution Jitter (Standard Deviation): $\sigma_{\text{noise}} = 40.0\text{ CPU clock cycles}$ ($12.5\text{ ns}$).

An attacker process executes an Evict+Time attack targeting `Mult_Code` (Cache Line $L_{\text{mult}}$ at address `0x0800_2000`).

#### Your Objective

1. Derive the theoretical expected total loop time $T_{\text{evicted}}(L_{\text{mult}})$ and timing delta $\Delta T(L_{\text{mult}})$ for a single loop iteration under two cases:
   * **Case A**: Secret key bit $d_k == 0$ (Multiply block bypassed).
   * **Case B**: Secret key bit $d_k == 1$ (Multiply block executed).
2. Apply $Z$-score hypothesis testing to calculate the minimum number of measurement samples ($M$) required to distinguish Case A from Case B with a $99.9\%$ statistical confidence level ($Z = 3.09$).
3. The attacker collects $M = 100$ samples for exponent bit $d_{42}$ while evicting line $L_{\text{mult}}$, recording an average loop execution time $\bar{T}_{\text{evicted}} = 2,158.4\text{ CPU clock cycles}$.
   * Calculate the empirical timing delta $\Delta \bar{T}$.
   * Deduce the binary value of secret exponent bit $d_{42}$.
4. Calculate the Signal-to-Noise Ratio (SNR) in decibels (dB) for this Evict+Time measurement.
5. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive Theoretical Expected Timing Deltas

The baseline un-interfered loop time is $T_{\text{loop\_base}} = 2,000\text{ clock cycles}$.

The attacker evicts `Mult_Code` (Line $L_{\text{mult}}$) prior to loop execution.

##### Case A: Secret Exponent Bit $d_k == 0$
* When $d_k == 0$, the algorithm executes only `Square_Code`.
* The CPU never fetches or executes `Mult_Code` (Line $L_{\text{mult}}$).
* Evicting Line $L_{\text{mult}}$ causes zero cache misses!

$$T_{\text{evicted}}(L_{\text{mult}} \mid d_k=0) = T_{\text{loop\_base}} = \mathbf{2,000 \text{ Clock Cycles}}$$

$$\Delta T(d_k=0) = T_{\text{evicted}} - T_{\text{loop\_base}} = 2,000 - 2,000 = \mathbf{0 \text{ Clock Cycles}}$$

##### Case B: Secret Exponent Bit $d_k == 1$
* When $d_k == 1$, the algorithm branches into `Mult_Code`.
* Because Line $L_{\text{mult}}$ was evicted by the attacker, the CPU suffers an L1 Instruction Cache Miss, fetching `Mult_Code` from main DRAM ($T_{\text{DRAM\_miss}} = 160\text{ cycles}$).

$$T_{\text{evicted}}(L_{\text{mult}} \mid d_k=1) = T_{\text{loop\_base}} + T_{\text{DRAM\_miss}} = 2,000 + 160 = \mathbf{2,160 \text{ Clock Cycles}}$$

$$\Delta T(d_k=1) = T_{\text{evicted}} - T_{\text{loop\_base}} = 2,160 - 2,000 = \mathbf{+160 \text{ Clock Cycles}}$$

```text
THEORETICAL TIMING DELTA BIFURCATION

 Exponent Bit d_k = 0 ──► Mult_Code Skipped ──► Delta T =   0 Cycles (2,000 total)
 Exponent Bit d_k = 1 ──► Mult_Code Fetched ──► Delta T = +160 Cycles (2,160 total)
```

---

#### Step 2: Calculate Minimum Sample Size ($M$) for $99.9\%$ Confidence

To distinguish $\Delta T = 0$ (Case A) from $\Delta T = 160$ (Case B) beneath system noise $\sigma_{\text{noise}} = 40\text{ cycles}$ with $99.9\%$ confidence ($Z = 3.09$):

The decision threshold is set at the midpoint:

$$\text{Threshold } T_{\text{thresh\_delta}} = \frac{160}{2} = 80 \text{ Clock Cycles}$$

We require the 3.09-sigma error bound of the sample mean ($\sigma_{\bar{x}} = \frac{\sigma_{\text{noise}}}{\sqrt{M}}$) to be less than the $80\text{-cycle}$ threshold:

$$Z \cdot \frac{\sigma_{\text{noise}}}{\sqrt{M}} \le 80$$

$$3.09 \cdot \frac{40}{\sqrt{M}} \le 80$$

$$\frac{123.6}{\sqrt{M}} \le 80 \implies \sqrt{M} \ge \frac{123.6}{80} = 1.545$$

$$M \ge (1.545)^2 = 2.387$$

$$\mathbf{M_{\text{min}} = 3 \text{ Samples!}}$$

##### Microarchitectural Result:
Because the signal delta ($\Delta T = 160\text{ cycles}$) is four times larger than the noise standard deviation ($\sigma_{\text{noise}} = 40\text{ cycles}$), **only 3 samples per bit** are required to achieve a $99.9\%$ statistical confidence level!

---

#### Step 3: Analyze Empirical Data for Exponent Bit $d_{42}$

The attacker collects $M = 100$ samples for bit $d_{42}$, measuring an average loop time:

$$\bar{T}_{\text{evicted}} = \mathbf{2,158.4 \text{ CPU Clock Cycles}}$$

##### 1. Calculate Empirical Timing Delta ($\Delta \bar{T}$):

$$\Delta \bar{T} = \bar{T}_{\text{evicted}} - T_{\text{loop\_base}} = 2,158.4 - 2,000.0 = \mathbf{+158.4 \text{ CPU Clock Cycles}}$$

##### 2. Deduce Secret Exponent Bit $d_{42}$:
Compare $\Delta \bar{T} = +158.4\text{ cycles}$ against the $80\text{-cycle}$ decision threshold:

$$\Delta \bar{T} \, (158.4) \ge 80.0 \text{ Cycles} \implies \mathbf{\text{CASE B CONFIRMED!}}$$

$$\mathbf{d_{42} = 1}$$

##### Key Deduction:
Secret RSA exponent bit $d_{42}$ is **$1$**! The $158.4\text{-cycle}$ timing delta proves beyond a shadow of a doubt that the CPU executed `Mult_Code` during loop iteration 42!

---

#### Step 4: Calculate Signal-to-Noise Ratio (SNR) in Decibels

We calculate the Signal-to-Noise Ratio (SNR) of this Evict+Time measurement channel:

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{\Delta T}{\sigma_{\text{noise}}} \right)$$

Given $\Delta T = 160.0\text{ cycles}$ and $\sigma_{\text{noise}} = 40.0\text{ cycles}$:

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{160.0}{40.0} \right) = 20 \cdot \log_{10}(4.0) = 20 \times 0.60206 = \mathbf{12.04 \text{ dB}}$$

An SNR of **$12.04\text{ dB}$** indicates a clean, highly reliable measurement channel where signal strength is four times greater than background noise!

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results against system principles:

1. **Timing Delta Invariant Check**:
   * Measured $\bar{T}_{\text{evicted}} = 2,158.4\text{ cycles}$.
   * Theoretical expected $T_{\text{evicted}} (d_k=1) = 2,160.0\text{ cycles}$.
   * Delta error $= |2,158.4 - 2,160.0| = 1.6\text{ cycles}$ ($1.0\%$ measurement error margin).
   * Empirical result matches theoretical prediction with $99.0\%$ precision!
2. **Sample Size Margin Check**:
   * Minimum required samples for $99.9\%$ confidence $M_{\text{min}} = 3$.
   * Actual samples collected $M = 100 \gg 3$.
   * Statistical confidence level exceeds $99.9999\%$, verifying $100\%$ zero-false-positive key extraction.
3. **Control-Flow Deduction Verification**:
   * $d_{42} = 1 \implies$ `Mult_Code` executed $\implies$ Line $L_{\text{mult}}$ fetched from DRAM $\implies \Delta T = +160\text{ cycles}$.
   * Physical causality holds with $100\%$ microarchitectural consistency.

All timing delta equations, statistical $Z$-score confidence bounds, SNR calculations, and secret key bit extractions evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Evict+Time attack**: A macroscopic microarchitectural side-channel attack that selectively evicts a candidate memory line from the CPU cache hierarchy prior to victim execution and measures the victim's total end-to-end execution time, inferring control-flow choices and secret data accesses without probing the cache after execution.
* **Execution timing delta analysis**: The statistical signal-processing technique of subtracting an un-interfered baseline execution duration ($T_{\text{baseline}}$) from an evicted execution duration ($T_{\text{evicted}}$) to isolate $160\text{-cycle}$ DRAM miss penalties, discovering whether a target candidate memory line participated in a secret computation.
