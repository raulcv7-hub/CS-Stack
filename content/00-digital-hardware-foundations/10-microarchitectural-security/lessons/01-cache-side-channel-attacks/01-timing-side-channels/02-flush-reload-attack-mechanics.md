content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/01-cache-side-channel-attacks/01-timing-side-channels/02-flush-reload-attack-mechanics.md
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

---

## The Community Bulletin Board and the Eraser

To build an intuitive, crystal-clear mental model of how the Flush+Reload attack works before we inspect assembly instructions and cache coherence state transitions, let us consider a simple real-world analogy: a shared community bulletin board.

Imagine a large research building where two researchers, Person A (the Victim) and Person B (the Attacker), work in separate, isolated offices. The building management enforces strict privacy rules: Person B is forbidden from entering Person A's office, looking at Person A's computer screen, or reading Person A's private files.

However, in the central hallway between their offices hangs a public community bulletin board. To save paper, the building management posts common reference documents—such as the building's emergency procedure manual—on this shared bulletin board. Both Person A and Person B have permission to walk up to the bulletin board and read the shared manual.

Now, suppose Person B wants to find out if Person A is reading Section 4 of the manual (which covers how to handle a specific type of chemical spill). Person B cannot spy on Person A directly. But Person B notices how the bulletin board works:
1. Every morning, the building maintenance crew wipes the bulletin board clean.
2. If Person A walks into the hallway to read Section 4, Person A must pin the printed pages of Section 4 onto the bulletin board so they can read them.
3. If Person A does not need Section 4, the bulletin board remains empty.

Person B devises a clever strategy:
* **The Flush Phase**: Person B walks into the hallway, takes an eraser, and wipes the Section 4 area of the bulletin board completely bare. Person B knows with $100\%$ certainty that Section 4 is not on the board.
* **The Wait Phase**: Person B steps back into their office and waits for 10 minutes while Person A works. During these 10 minutes, Person A might walk into the hallway to read Section 4, or Person A might stay in their office working on something else.
* **The Reload Phase**: Person B walks back out to the bulletin board and attempts to read Section 4. Person B uses a stopwatch to measure how long it takes to access the information:
  * **Scenario 1 (Fast Read / Hit)**: Person B walks up and sees Section 4 already pinned to the board. Person B reads the information in **1 second**. Person B thinks: *"Aha! The paper is on the board! Person A must have pinned it here during the last 10 minutes while I was waiting!"* Person B knows Person A is dealing with a chemical spill!
  * **Scenario 2 (Slow Read / Miss)**: Person B walks up and finds the board empty. Person B must walk down three flights of stairs to the basement archive to fetch the printed manual, which takes **50 seconds**. Person B thinks: *"The board was bare. Person A did not read Section 4 during the last 10 minutes."*

```text
THE BULLETIN BOARD TIMING LEAKAGE

 Person B Erases Board ──► Person A Reads Page ──► Person B Measures Read
 (FLUSH Phase)             (VICTIM Execution)      (RELOAD Phase)
 Board Empty               Pins Page to Board      1 Sec = Person A read it!
                                                   50 Sec = Board empty!
```

Notice what Person B accomplished:
* Person B never broke into Person A's office.
* Person B never tampered with Person A's private files.
* Person B simply wiped a shared public resource, waited, and measured how fast they could access that same resource!
* The difference in access speed ($1\text{ second}$ versus $50\text{ seconds}$) revealed Person A's private actions with complete accuracy!

This community bulletin board scenario is the exact physical analogue of the **Flush+Reload Cache Side-Channel Attack**:
* Person A is the **Victim Software Thread** (e.g., an OpenSSL process executing an RSA signature).
* Person B is the **Attacker Process**.
* The shared bulletin board is the **Shared Physical Memory Line in the CPU Cache**.
* Section 4 of the manual is a **Specific 64-Byte Code or Data Memory Line**.
* Wiping the board with an eraser is the **`clflush` Assembly Instruction**.
* Measuring the read time with a stopwatch is the **Hardware Time-Stamp Counter (`RDTSCP`)**.
* The 1-second versus 50-second read time is the **L1 Cache Hit Latency (~1 ns) versus Main DRAM Miss Latency (~50 ns)**.

---

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

---

### 2. Inclusive Cache Hierarchies and Back-Invalidation

A modern CPU contains multiple execution cores. Each core possesses its own private Level 1 (L1) and Level 2 (L2) Static RAM (SRAM) caches. All cores share a large, centralized Level 3 (L3) cache, also known as the **Last-Level Cache (LLC)**.

```text
INCLUSIVE CACHE HIERARCHY TOPOLOGY

 CPU Core 0 (Victim Core)                   CPU Core 1 (Attacker Core)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ L1 Instruction/Data Cache │              │ L1 Instruction/Data Cache │
 ├───────────────────────────┤              ├───────────────────────────┤
 │ L2 Cache (Private)        │              │ L2 Cache (Private)        │
 └─────────────┬─────────────┘              └─────────────┬─────────────┘
               │                                          │
               └────────────────────┬─────────────────────┘
                                    │
                                    ▼
              ┌───────────────────────────────────────────┐
              │ Shared Level 3 (L3) Last-Level Cache      │
              │ (INCLUSIVE: Holds copies of ALL L1/L2)    │
              └─────────────────────┬─────────────────────┘
                                    │
                                    ▼
              ┌───────────────────────────────────────────┐
              │ Main System DRAM Memory                   │
              └───────────────────────────────────────────┘
```

In an **Inclusive Cache Hierarchy** (the standard architecture utilized in many x86 Intel and server processors):
> **The Cache Inclusivity Invariant**: Any memory line that resides in a private higher-level cache (L1 or L2) MUST also reside in the shared lower-level cache (L3 Last-Level Cache).

$$\text{Line } L \in \text{L1} \quad \implies \quad \text{Line } L \in \text{L3}$$

This inclusivity rule simplifies hardware cache-coherence protocols. If the CPU wants to determine whether any core on the microchip holds a copy of physical address $A$, it only needs to check the central L3 cache!

However, inclusivity creates a critical security weakness: **Hardware Back-Invalidation**.

When an instruction explicitly evicts a memory line from the L3 cache:
1. The L3 cache controller invalidates its own local copy of line $L$.
2. To preserve the Inclusivity Invariant ($\text{L1} \subseteq \text{L3}$), the L3 cache controller broadcasts a hardware **Back-Invalidation Snoop Signal** to all private L1 and L2 caches across every core on the processor.
3. Every private L1 and L2 cache **instantly invalidates and drops its local copy** of line $L$!

```text
HARDWARE BACK-INVALIDATION MECHANICS

 1. Attacker executes 'clflush' on Core 1 ──► Evicts Line L from L3 Cache
                                                    │
 2. L3 Cache Controller enforces Inclusivity ───────┤
                                                    │
 3. Broadcasts Back-Invalidation Snoop Signal ──────┼──────┐
                                                    ▼      ▼
 4. Line L is ERASED from Core 0 L1/L2 AND Core 1 L1/L2 SIMULTANEOUSLY!
```

This back-invalidation mechanism means an attacker process running on Core 1 can execute `clflush` on a shared virtual address, and the hardware will automatically purge that memory line from the victim's private L1 and L2 caches on Core 0!

---

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

---

### Phase 1: The FLUSH Phase

In the first phase, the attacker process selects a specific 64-byte memory line within a shared memory page—for example, the memory line containing the entry point of an RSA modular multiplication function or a specific byte in an encryption lookup table.

The attacker executes the `clflush` (Cache Line Flush) instruction targeting the virtual address of that shared line (`VA_target`):

```c
// Assembly invocation of clflush
asm volatile (
    "clflush (%0)\n\t"
    :
    : "r" (target_address)
    : "memory"
);
```

#### Microarchitectural Execution of `clflush`:
1. The CPU translates `target_address` to its physical memory address $A_{\text{phys}}$.
2. The `clflush` instruction invalidates the cache line containing $A_{\text{phys}}$ from the executing core's L1 and L2 caches.
3. The eviction request passes to the shared L3 Last-Level Cache.
4. The L3 cache invalidates $A_{\text{phys}}$ and issues a hardware back-invalidation snoop to all other CPU cores.
5. Within a few dozen nanoseconds, $A_{\text{phys}}$ is **completely absent from all cache levels across the entire processor**.
6. The MESI protocol state for $A_{\text{phys}}$ across all caches transitions to **Invalid ($I$)**.

```text
CACHE LINE MESI STATE TRANSITION DURING FLUSH

 Before Flush : Core 0 L1 = Shared (S) | L3 LLC = Shared (S)
                Execute 'clflush' on Core 1
 After Flush  : Core 0 L1 = Invalid (I) | L3 LLC = Invalid (I) | Core 1 L1 = Invalid (I)
                (Line resides ONLY in main DRAM memory!)
```

---

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

---

### Phase 3: The RELOAD Phase

In the third phase, the attacker process resumes execution, re-accesses `target_address`, and measures the exact time required to complete the memory read.

To measure memory read latency with nanosecond precision without allowing the CPU's out-of-order execution engine to reorder instructions, the attacker wraps the memory read between serializing hardware timer instructions:

```c
// High-precision serialized Flush+Reload measurement
uint64_t reload_and_measure(volatile uint8_t *target_address) {
    uint64_t t1, t2;
    uint32_t aux;

    // 1. Serialize pipeline and read time-stamp counter (t1)
    asm volatile ("lfence\n\t");
    t1 = __rdtsc();
    asm volatile ("lfence\n\t");

    // 2. Access the target memory line (RELOAD)
    (void)*target_address;

    // 3. Serialize pipeline and read time-stamp counter (t2)
    t2 = __rdtscp(&aux);
    asm volatile ("lfence\n\t");

    // 4. Return latency delta
    return (t2 - t1);
}
```

Let us trace the microarchitectural pipeline behavior during the RELOAD phase:

1. **`lfence` (Load Fence)**: Forces the CPU's execution pipeline to drain, guaranteeing that all prior instructions complete before the time-stamp counter is read.
2. **`__rdtsc()`**: Reads the 64-bit hardware Time-Stamp Counter into register $t_1$.
3. **`(void)*target_address`**: Executes a load instruction reading byte 0 of the target memory line.
   * **If the Victim Accessed the Line in Phase 2**: The memory line resides in the shared L3 (or L1/L2) cache! The read completes as a **Cache HIT** in **$4 \text{ to } 40\text{ clock cycles}$**!
   * **If the Victim Did NOT Access the Line in Phase 2**: The memory line is absent from all caches! The read triggers a **DRAM Cache MISS**, fetching the line from main RAM in **$150 \text{ to } 200\text{ clock cycles}$**!
4. **`__rdtscp(&aux)`**: Reads the 64-bit hardware Time-Stamp Counter into register $t_2$ while serializing all prior load instructions, guaranteeing that the memory read finishes *before* $t_2$ is captured.
5. **Latency Calculation**: The attacker calculates $\Delta T = t_2 - t_1$.

```text
RELOAD TIMING DISCRIMINATION

 Measured Latency Delta (Delta T)
  4 Cycles  ├─────────────────────────────► CACHE HIT!  (Victim accessed line!)
            │
180 Cycles  ├──────────────────────────────────────────────────────────► CACHE MISS! (Victim ignored line)
            ▲
            └─ Decision Threshold T_threshold = 80 Cycles
```

By comparing $\Delta T$ against a pre-calibrated decision threshold ($T_{\text{threshold}} \approx 80\text{ cycles}$):
* $\Delta T < 80 \text{ Cycles} \implies \mathbf{\text{VICTIM ACCESSED TARGET LINE}} \implies K_i = 1$
* $\Delta T \ge 80 \text{ Cycles} \implies \mathbf{\text{VICTIM DID NOT ACCESS TARGET LINE}} \implies K_i = 0$

---

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

---

## Noise Filtering, Threshold Calibration, and Prefetcher Evasion

Executing a Flush+Reload attack in a commercial operating system environment requires overcoming real-world microarchitectural noise and hardware optimizations.

### 1. Decision Threshold Calibration via Histogram Analysis

To determine the optimal $T_{\text{threshold}}$ value for a specific CPU processor, the attacker process executes a calibration loop during startup:
1. The attacker allocates a dummy memory line.
2. The attacker flushes the line, reloads it immediately, and measures the latency $T_{\text{hit}}$.
3. The attacker flushes the line, waits, and reloads it without accessing it, measuring the latency $T_{\text{miss}}$.
4. The attacker repeats this test 10,000 times to construct two latency probability distribution curves.

```text
CALIBRATED TIMING HISTOGRAM

 Count
  ▲
  │   ┌───┐ (Cache Hits)
  │   │   │ Mean = 4 Cycles
  │ ──┴───┴──
  │                                     ┌───┐ (DRAM Misses)
  │                                     │   │ Mean = 180 Cycles
  │ ────────────────────────────────────┴───┴──
  └─────────────────────────────────────────────────► Measured Cycles
      0       20       40       60       80       100      120 ... 200
                                         ▲
                                         └─ Calibrated Threshold = 80 Cycles
```

The optimal decision threshold $T_{\text{threshold}}$ is set at the minimum point between the two distribution peaks (typically $T_{\text{threshold}} \approx 80\text{ clock cycles}$).

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Flush+Reload Trace Analysis, Error-Rate Mitigation, and Key Reconstruction

To consolidate your complete mastery of Flush+Reload attack mechanics, assembly timer measurements, threshold calibration, and noise mitigation math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Classify Cache Lines using Decision Threshold $T_{\text{threshold}} = 70\text{ Cycles}$

We compare each measured reload latency against $T_{\text{threshold}} = 70\text{ cycles}$:
* Latency $< 70 \text{ Cycles} \implies \mathbf{\text{CACHE HIT}}$
* Latency $\ge 70 \text{ Cycles} \implies \mathbf{\text{CACHE MISS (DRAM)}}$

```text
CLASSIFIED MEASUREMENT VECTOR

 Line Index │ Offset │ Latency (Cycles) │ Condition (< 70) │ Classification
────────────┼────────┼──────────────────┼──────────────────┼────────────────
   Line 0   │ 0x000  │   182 Cycles     │   182 >= 70      │ DRAM MISS
   Line 1   │ 0x040  │   178 Cycles     │   178 >= 70      │ DRAM MISS
   Line 2   │ 0x080  │   185 Cycles     │   185 >= 70      │ DRAM MISS
   Line 3   │ 0x0C0  │   179 Cycles     │   179 >= 70      │ DRAM MISS
   Line 4   │ 0x100  │   181 Cycles     │   181 >= 70      │ DRAM MISS
   Line 5   │ 0x140  │    38 Cycles     │    38 < 70       │ CACHE HIT (L3)!
   Line 6   │ 0x180  │   184 Cycles     │   184 >= 70      │ DRAM MISS
   Line 7   │ 0x1C0  │    37 Cycles     │    37 < 70       │ CACHE HIT (L3)!
   Line 8   │ 0x200  │   180 Cycles     │   180 >= 70      │ DRAM MISS
   ...      │ ...    │   ...            │   ...            │ DRAM MISS
   Line 15  │ 0x3C0  │   180 Cycles     │   180 >= 70      │ DRAM MISS
```

##### Classification Summary:
Two lines registered cache hits: **Line 5 (Offset `0x140`)** and **Line 7 (Offset `0x1C0`)**. All other 14 lines were DRAM misses ($\sim 180\text{ cycles}$).

---

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

---

#### Step 3: Resolve Prefetcher Artifacts and Reconstruct Secret Key Nibble $N_i$

Why did BOTH Line 5 (Offset `0x140` $= T[5]$) and Line 7 (Offset `0x1C0` $= T[7]$) hit in cache?

Let us inspect the physical memory layout of Table $T$:
* Line 5 is at address offset `0x140` ($320_{10}\text{ bytes}$).
* Line 6 is at address offset `0x180` ($384_{10}\text{ bytes}$).
* Line 7 is at address offset `0x1C0` ($448_{10}\text{ bytes}$).

Notice that Line 5 and Line 7 are separated by Line 6 (Offset `0x180`). Line 6 was a **DRAM MISS ($184\text{ cycles}$)**!

If a hardware spatial prefetcher had pulled Line 7 into cache automatically because Line 6 was accessed, Line 6 would ALSO be a cache hit! But Line 6 is a DRAM miss ($184\text{ cycles}$).

Therefore, Line 7 was **NOT** brought into cache by a hardware spatial prefetcher!

##### Resolving the Multi-Hit Mystery:
Why would Line 5 AND Line 7 both be accessed by the victim during one exponentiation step?

In 4-bit windowed exponentiation, a single processing step can execute **two table lookups**:
1. Main Multiplier Lookup: $T[N_i]$ (where $N_i$ is the secret nibble).
2. Base Reduction Lookup: $T[\text{Base}]$ or a secondary table reference (e.g., Line 5 = $T[5]$ is a fixed base constant used in every windowed reduction).

Since Line 5 ($T[5]$) is the fixed base constant accessed in every reduction step, **Line 7 ($T[7]$) represents the secret-dependent lookup $T[N_i]$**!

$$\mathbf{N_i = 7 = 0111_2}$$

##### Secret Key Deduction:
The secret key exponent nibble $N_i$ is **$7$ (`4'b0111`)**!

---

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

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural deductions:

1. **Threshold Discrimination Verification**:
   * Line 5 ($38\text{ cycles}$) $< 70 \implies$ HIT.
   * Line 7 ($37\text{ cycles}$) $< 70 \implies$ HIT.
   * All other 14 lines ($177 \dots 186\text{ cycles}$) $\ge 70 \implies$ MISS.
   * Binary classification is $100\%$ deterministic.
2. **L3 Cache Inclusivity Verification**:
   * $T_{\text{measured}} \approx 37.5\text{ cycles} \approx T_{\text{L3\_hit}} (36\text{ cycles}) + 1.5\text{ cycles}$ timer overhead.
   * Matches L3 LLC hit profile across cross-core boundaries.
3. **Secret Reconstruction Verification**:
   * $N_i = 7 \implies T[7]$ mapped to offset `0x1C0` ($7 \times 64 = 448 = \text{0x1C0}$).
   * Matches measured Line 7 cache hit at offset `0x1C0` with $100\%$ precision!

All timing classifications, L3 cache cross-core hit derivations, prefetcher artifact eliminations, SNR calculations, and secret key reconstructions evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Flush+Reload attack**: A high-precision, non-invasive cache side-channel attack that uses unprivileged cache flushing instructions (`clflush`) to evict a shared memory line from all cache levels, waits for a victim to execute, and measures reload latency to determine if the victim accessed the line.
* **Shared memory line tracking**: The microarchitectural technique of exploiting read-only shared memory page deduplication and inclusive Last-Level Caches to monitor the exact line-granularity execution flow and memory access patterns of a victim process across core boundaries.
