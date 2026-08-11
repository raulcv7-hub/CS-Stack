---
title: "Evict+Time Attack Mechanics and Execution Timing Delta Analysis"
---

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


## Solved Industrial Engineering Exercise: Quantitative Evict+Time Delta Analysis, Sample Size Derivation, and Key Bit Extraction

To consolidate your complete mastery of Evict+Time attack mechanics, statistical baseline subtractions, $Z$-score hypothesis testing, and secret key reconstruction math, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

