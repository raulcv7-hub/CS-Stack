---
title: "Flush+Reload Cache Side-Channel Mechanics"
---

# Flush+Reload Cache Side-Channel Mechanics

In modern multi-tenant computing environments, operating systems optimize physical memory utilization by sharing read-only memory pages between independent processes. When multiple software applications—or multiple isolated virtual machines running on the same hypervisor—load the exact same shared library, such as a cryptographic module or a system framework, the operating system kernel maps a single physical Memory page into the virtual address spaces of all participating processes. This memory-deduplication strategy saves gigabytes of system DRAM, but it introduces a catastrophic microarchitectural vulnerability. Because the underlying physical memory pages are shared across security boundaries, the physical lines of the CPU cache hierarchy that store those pages are also shared. An unprivileged process can execute a specialized, unprivileged hardware instruction—such as the x86 `clflush` instruction—to forcibly evict a specific 64-byte memory line from the entire CPU cache hierarchy across all processor cores. By evicting the line, waiting for a victim process to execute, and subsequently measuring the exact nanosecond access latency required to reload that same memory line, the unprivileged process can determine with $100\%$ precision whether the victim process accessed that specific memory location. This non-invasive surveillance technique, known as the **Flush+Reload attack**, allows an attacker to track the execution flow and data access patterns of a target process at the granularity of individual 64-byte cache lines, completely bypassing operating system process isolation, container sandboxes, and virtual machine boundaries without altering a single bit of system data.

```text
THE FLUSH+RELOAD ATTACK CYCLE

 Attacker Process                   Shared Memory Line
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │ 1. FLUSH (clflush)        ├─────►│ Evicted from All Caches   │
 └─────────────┬─────────────┘      └─────────────┬─────────────┘
               │                                  │
               │ Victim Executes                  │
               ▼                                  ▼
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │ 2. VICTIM EXECUTION       │      │ Reloaded if Victim Reads! │
 └─────────────┬─────────────┘      └─────────────┬─────────────┘
               │                                  │
               ▼                                  │
 ┌───────────────────────────┐                    │
 │ 3. RELOAD (Measure Delay) ├────────────────────┘
 └───────────────────────────┘
```


## Shared Memory Mapping and Cache Inclusivity Requirements

To understand why the Flush+Reload attack is possible in silicon, we must explore two foundational pillars of modern computer systems architecture: **Shared Virtual Memory Page Mapping** and **Inclusive Last-Level Caches (LLC)**.

### 1. Shared Memory Mapping and Deduplication

Modern operating systems manage memory using virtual memory page tables. Virtual memory maps abstract software addresses (virtual addresses) to physical locations in system Dynamic Random-Access Memory (DRAM).

When two independent processes load the same shared library file (such as `libcrypto.so` or `libc.so`), the operating system's virtual memory manager maps the virtual addresses of both processes to the **exact same physical DRAM pages**.

```text
SHARED VIRTUAL MEMORY PAGE MAPPING

 Process A (Victim) Virtual Space         Process B (Attacker) Virtual Space
 ┌───────────────────────────────┐        ┌───────────────────────────────┐
 │ Virtual Addr: 0x7FFF_0040     │        │ Virtual Addr: 0x5555_0040     │
 └──────────────┬────────────────┘        └──────────────┬────────────────┘
                │                                        │
                └───────────────┬────────────────────────┘
                                │ Both map to the SAME Physical Page!
                                ▼
               ┌─────────────────────────────────┐
               │ Physical DRAM Page: 0x1A40_0000 │
               └─────────────────────────────────┘
```

Notice that Process A and Process B have completely different virtual addresses (`0x7FFF_0040` and `0x5555_0040`). Operating system security policies prevent Process B from reading Process A's private data pages. However, because both processes map `libcrypto.so`, their different virtual addresses point to the **exact same physical RAM address** (`0x1A40_0000`).

A process can intentionally create shared memory mappings with another target process by calling the `mmap()` system call with the `MAP_SHARED` flag, or by opening a read-only handle to any executable binary file or shared library present on the file system.


## The Three Phases of the Flush+Reload Attack

A Flush+Reload attack operates as a continuous hardware measurement loop executed by the attacker process. Each iteration of the loop consists of three distinct, sequential phases:
1. **The FLUSH Phase**
2. **The VICTIM EXECUTION Phase**
3. **The RELOAD Phase**

```text
FLUSH+RELOAD TIMING STATE MACHINE

  ┌──────────────────────────────────────────────────────────┐
  │ 1. FLUSH PHASE                                           │
  │    Attacker executes 'clflush' on target address.       │
  │    Line evicted from L1, L2, L3 across all cores.       │
  └────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 2. VICTIM EXECUTION PHASE                                │
  │    Attacker yields CPU / waits for time window dt.       │
  │    Victim process executes code.                         │
  │    * IF Victim accesses Target Line -> Line loaded to L1 │
  │    * IF Victim ignores Target Line  -> Line stays in DRAM│
  └────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 3. RELOAD PHASE                                          │
  │    Attacker re-accesses target address.                  │
  │    Measures access delay using RDTSCP timer.             │
  │    * Latency < Threshold -> HIT (Victim accessed line!)  │
  │    * Latency >= Threshold -> MISS (Victim did not touch)│
  └────────────────────────────┬─────────────────────────────┘
                               │
                               └────── Loop back to Phase 1!
```


### Phase 2: The VICTIM EXECUTION Phase

After flushing the line, the attacker process yields the CPU or pauses execution for a precisely calibrated time window ($\Delta t_{\text{wait}}$). During this window, the operating system scheduler allows the victim process to execute its workload on the CPU.

As the victim process executes, its control flow depends on private secret data (such as cryptographic key bits).

#### Case A: The Victim Accesses the Target Line
* If the secret key bit $K_i == 1$, the victim process's execution path branches to the code block or reads the data table located at $A_{\text{phys}}$.
* The victim's CPU core issues a memory load for $A_{\text{phys}}$.
* Because $A_{\text{phys}}$ was evicted during Phase 1, the read misses in L1, L2, and L3 caches.
* The CPU fetches $A_{\text{phys}}$ from main DRAM memory ($160\text{-cycle}$ latency penalty) and loads the 64-byte line into L3, L2, and the victim's private L1 cache.
* The MESI protocol state for $A_{\text{phys}}$ transitions from **Invalid ($I$) to Shared ($S$) or Exclusive ($E$)**.

#### Case B: The Victim Does NOT Access the Target Line
* If the secret key bit $K_i == 0$, the victim process's execution path bypasses the code block or data table at $A_{\text{phys}}$.
* The victim process never issues a memory load for $A_{\text{phys}}$.
* $A_{\text{phys}}$ **remains completely absent from all cache levels**. Its MESI state remains **Invalid ($I$)**.


## Technical Comparison: Flush+Reload versus Flush+Flush

While the Flush+Reload attack is extraordinarily reliable, its RELOAD phase requires executing an explicit memory load instruction (`(void)*target_address`).

Executing a memory load instruction triggers hardware memory access events. On systems equipped with hardware performance monitoring counters (PMCs) or anti-malware security drivers, an unusually high rate of cache hits or memory reads can alert security software that an attack is occurring.

To eliminate memory read events entirely, hardware security researchers developed a stealthy variant: **The Flush+Flush Attack**.

### The Mechanics of Flush+Flush

The **Flush+Flush attack** replaces the RELOAD phase's memory read instruction with a second `clflush` instruction!

```text
FLUSH+RELOAD VS. FLUSH+FLUSH ATTACK PIPELINE

 Flush+Reload Protocol:
 1. FLUSH  : clflush(addr)           ──► Evicts line from cache
 2. VICTIM : Victim executes         ──► Might reload line to cache
 3. RELOAD : (void)*addr + RDTSC     ──► EXECUTES MEMORY READ! (Detectable via PMCs)

 Flush+Flush Protocol:
 1. FLUSH  : clflush(addr)           ──► Evicts line from cache
 2. VICTIM : Victim executes         ──► Might reload line to cache
 3. FLUSH2 : clflush(addr) + RDTSC   ──► EXECUTES SECOND FLUSH! (Zero Memory Reads!)
```

How can measuring the execution time of a `clflush` instruction reveal whether a memory line is in cache?

We must look at the internal microarchitectural implementation of the `clflush` instruction inside CPU execution units:

1. **When the Target Line IS in Cache (Hit Condition)**:
   * The `clflush` instruction must broadcast invalidation messages across L1, L2, and L3 cache controllers, clear tag bits, and update coherence state registers.
   * Executing `clflush` on a line present in cache takes **$12 \text{ to } 16\text{ clock cycles}$**.
2. **When the Target Line is NOT in Cache (Miss Condition)**:
   * The `clflush` instruction checks the L1/L2/L3 cache tags, sees that the line is already in the Invalid ($I$) state, and terminates immediately!
   * Executing `clflush` on an un-cached line takes **$6 \text{ to } 8\text{ clock cycles}$**.

```text
FLUSH+FLUSH TIMING INVERSION

 Target Line State in Cache  │ clflush Execution Latency
─────────────────────────────┼───────────────────────────
 Line PRESENT in Cache (Hit) │ 12 to 16 Clock Cycles (SLOW!)
 Line ABSENT from Cache(Miss)│  6 to 8 Clock Cycles  (FAST!)
```

#### Notice the Timing Inversion in Flush+Flush!
* In Flush+Reload: Hits are **FAST** (~4 cycles), Misses are **SLOW** (~180 cycles).
* In Flush+Flush: Hits are **SLOW** (~14 cycles), Misses are **FAST** (~7 cycles)!

#### Advantages and Trade-offs of Flush+Flush:
* **Stealth ($100\%$ Zero Memory Reads)**: Flush+Flush never executes a load instruction. It generates zero cache hits and zero DRAM read requests, making it completely invisible to performance monitoring counters tracking cache hit ratios!
* **Reduced Noise**: Because it never loads data into L1/L2 caches, it does not trigger hardware prefetchers or alter cache states.
* **Narrower Timing Delta**: The timing delta in Flush+Flush is small ($14\text{ cycles}$ vs $7\text{ cycles} \implies \Delta T \approx 7\text{ cycles}$), compared to Flush+Reload ($180\text{ cycles}$ vs $4\text{ cycles} \implies \Delta T \approx 176\text{ cycles}$). Flush+Flush requires lower background system noise to achieve high accuracy.


### 2. Evading Hardware Stream and Stride Prefetchers

Modern CPUs contain hardware prefetchers that monitor L1 and L2 memory access patterns. If an attacker process probes memory lines sequentially ($L_0, L_1, L_2, L_3$), the hardware prefetcher detects the linear stride and automatically fetches $L_4$ and $L_5$ into L1 cache!

If $L_4$ is prefetched automatically, the attacker will measure a **false cache hit** on $L_4$, falsely concluding that the victim accessed $L_4$!

```text
PREFETCHER DISTORTION HAZARD

 Sequential Probing : [ Probe Line 0 ] ──► [ Probe Line 1 ] ──► [ Probe Line 2 ]
                                                                       │
                                                                       ▼ Prefetcher Triggers!
 Hardware Prefetcher loads Line 3 into L1 Cache automatically!
 Attacker probes Line 3 -> Measures HIT! (FALSE POSITIVE! Victim never touched Line 3!)
```

#### How Attackers Evade Hardware Prefetchers:
1. **Non-Sequential Probing**: The attacker probes shared cache lines in a randomized or pseudo-random permuted order (e.g., $L_7, L_2, L_{15}, L_0$). Random access patterns prevent stride-detection algorithms from activating.
2. **Page-Boundary Isolation**: Prefetchers rarely cross $4\text{-KB}$ virtual page boundaries. Placing probed targets across separate page boundaries isolates prefetcher streams.
3. **Stride Expansion**: Spacing probed targets by more than 256 bytes ($4\text{ cache lines}$) prevents spatial prefetchers from pulling adjacent lines into cache.


### Scenario and Parameters

You are a microarchitectural security engineer auditing a shared cryptographic library running on a $3.2\text{ GHz}$ single-core x86-64 processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server runs two isolated container processes sharing a read-only memory page (`libcrypto.so`) mapped at address `0x0000_7FFF_9000_0000`.

The victim process executes an RSA signature algorithm using a 4-bit windowed exponentiation method. Depending on the value of a secret 4-bit key exponent nibble ($N_i \in [0, 15]$), the victim fetches a corresponding pre-computed 64-byte multiplier table line $T[N_i]$ from memory:

$$\text{Address of } T[N_i] = \text{Base\_Address}(T) + (N_i \times 64\text{ Bytes})$$

```text
SHARED RSA MULTIPLIER TABLE MEMORY MAPPING

 Base Address: 0x0000_7FFF_9000_1000 (Table T: 16 Cache Lines = 1,024 Bytes)
 Line 0  : T[0]  (Offset 0x000) -> Mapped to Cache Set 16
 Line 1  : T[1]  (Offset 0x040) -> Mapped to Cache Set 17
 Line 2  : T[2]  (Offset 0x080) -> Mapped to Cache Set 18
 ...
 Line 15 : T[15] (Offset 0x3C0) -> Mapped to Cache Set 31
```

An attacker process executes a Flush+Reload surveillance loop monitoring all 16 cache lines of Table $T$ ($T[0] \dots T[15]$).

#### System Timing Parameters:
* L1 Data Cache Hit Latency: $T_{\text{L1}} = 4\text{ clock cycles}$ ($1.25\text{ ns}$).
* L2 Cache Hit Latency: $T_{\text{L2}} = 12\text{ clock cycles}$ ($3.75\text{ ns}$).
* L3 Cache Hit Latency: $T_{\text{L3}} = 36\text{ clock cycles}$ ($11.25\text{ ns}$).
* Main DRAM Memory Miss Latency: $T_{\text{DRAM}} = 180\text{ clock cycles}$ ($56.25\text{ ns}$).
* Calibrated Decision Threshold: $T_{\text{threshold}} = \mathbf{70 \text{ Clock Cycles}}$.

#### The Raw Measurement Trace:
During one execution window of the victim's exponentiation loop, the attacker flushes all 16 lines of Table $T$, waits for the victim to process one exponent nibble $N_i$, and reloads all 16 lines.

The attacker captures the following vector of reload latencies (measured in clock cycles):

```text
RAW RELOAD LATENCY MEASUREMENT VECTOR (CYCLES)

 Line Index │ Target Address Offset │ Reload Latency (Cycles) │ Measured Cache Status
────────────┼───────────────────────┼─────────────────────────┼────────────────────────
   Line 0   │      Offset 0x000     │       182 Cycles        │ ?
   Line 1   │      Offset 0x040     │       178 Cycles        │ ?
   Line 2   │      Offset 0x080     │       185 Cycles        │ ?
   Line 3   │      Offset 0x0C0     │       179 Cycles        │ ?
   Line 4   │      Offset 0x100     │       181 Cycles        │ ?
   Line 5   │      Offset 0x140     │        38 Cycles        │ ?
   Line 6   │      Offset 0x180     │       184 Cycles        │ ?
   Line 7   │      Offset 0x1C0     │        37 Cycles        │ ?
   Line 8   │      Offset 0x200     │       180 Cycles        │ ?
   Line 9   │      Offset 0x240     │       183 Cycles        │ ?
   Line 10  │      Offset 0x280     │       177 Cycles        │ ?
   Line 11  │      Offset 0x2C0     │       181 Cycles        │ ?
   Line 12  │      Offset 0x300     │       186 Cycles        │ ?
   Line 13  │      Offset 0x340     │       179 Cycles        │ ?
   Line 14  │      Offset 0x380     │       182 Cycles        │ ?
   Line 15  │      Offset 0x3C0     │       180 Cycles        │ ?
```

#### Your Objective

1. Analyze the raw measurement vector and classify each line as a **Cache HIT** or **Cache MISS** using the decision threshold $T_{\text{threshold}} = 70\text{ cycles}$.
2. Identify which specific table lines registered cache hits. Explain why Line 5 ($38\text{ cycles}$) and Line 7 ($37\text{ cycles}$) both registered hits, whereas a standard single-access loop should hit only one line.
3. Microarchitectural Analysis: Identify why Line 5 and Line 7 returned $37\text{-38 cycles}$ (L3 Cache Hits) instead of $4\text{ cycles}$ (L1 Cache Hits).
4. Deduce the exact value of the secret key nibble $N_i$ by resolving the prefetcher / spatial locality artifact between Line 5 and Line 7.
5. Calculate the Signal-to-Noise Ratio (SNR) of this measurement trace in decibels (dB).
6. Verify mathematical, physical, and logical correctness.


#### Step 2: Microarchitectural Analysis of Latency Values ($37\text{-38 Cycles}$)

Why did Line 5 ($38\text{ cycles}$) and Line 7 ($37\text{ cycles}$) return latencies around $37\text{-38 cycles}$ instead of $4\text{ cycles}$?

Let me compare against system hardware parameters:
* $T_{\text{L1\_hit}} = 4\text{ cycles}$
* $T_{\text{L2\_hit}} = 12\text{ cycles}$
* $T_{\text{L3\_hit}} = 36\text{ cycles}$
* $T_{\text{DRAM}} = 180\text{ cycles}$

##### Microarchitectural Deduction:
* The measured latencies ($37 \text{ and } 38\text{ cycles}$) match the **Level 3 (L3) Last-Level Cache hit latency ($T_{\text{L3}} = 36\text{ cycles}$)** plus 1-2 cycles of timer measurement overhead!
* This proves that the victim process executed on a **different physical CPU core** (e.g., Core 0) than the attacker process (running on Core 1).
* When the victim on Core 0 accessed the line, the line was loaded into Core 0's private L1/L2 cache and the shared L3 cache.
* When the victim finished executing, Core 0's private L1 cache line was replaced or remained in Core 0's private L1.
* When the attacker on Core 1 reloaded the line, the read missed in Core 1's private L1/L2 cache and hit in the **shared L3 Last-Level Cache ($37\text{-38 cycles}$)**!

This confirms $100\%$ that the Flush+Reload attack successfully operates **across physical CPU core boundaries** via the shared L3 cache!


#### Step 4: Calculate Signal-to-Noise Ratio (SNR) of the Measurement

The Signal-to-Noise Ratio (SNR) measures the contrast between the signal peak (Cache Hit) and the noise floor (DRAM Miss).

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{\overline{T}_{\text{miss}} - \overline{T}_{\text{hit}}}{\sigma_{\text{noise}}} \right)$$

Where:
* $\overline{T}_{\text{miss}}$ is the mean DRAM miss latency ($\overline{T}_{\text{miss}} = 181.2\text{ cycles}$).
* $\overline{T}_{\text{hit}}$ is the mean L3 cache hit latency ($\overline{T}_{\text{hit}} = 37.5\text{ cycles}$).
* $\sigma_{\text{noise}}$ is the standard deviation of the DRAM miss measurement noise ($\sigma_{\text{noise}} \approx 2.8\text{ cycles}$).

$$\text{Signal Delta } (\Delta T) = 181.2 - 37.5 = \mathbf{143.7 \text{ Clock Cycles}}$$

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{143.7}{2.8} \right) = 20 \cdot \log_{10}(51.321) \approx 20 \cdot (1.7103) = \mathbf{34.21 \text{ dB}}$$

An SNR of **$34.21\text{ dB}$** represents an exceptionally clean, high-fidelity measurement channel with a classification accuracy exceeding **$99.99\%$**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Flush+Reload attack**: A high-precision, non-invasive cache side-channel attack that uses unprivileged cache flushing instructions (`clflush`) to evict a shared memory line from all cache levels, waits for a victim to execute, and measures reload latency to determine if the victim accessed the line.
* **Shared memory line tracking**: The microarchitectural technique of exploiting read-only shared memory page deduplication and inclusive Last-Level Caches to monitor the exact line-granularity execution flow and memory access patterns of a victim process across core boundaries.
