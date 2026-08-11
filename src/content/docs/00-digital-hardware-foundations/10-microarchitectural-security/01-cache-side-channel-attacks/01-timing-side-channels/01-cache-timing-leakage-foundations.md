---
title: "Cache Timing Side-Channel Leakage Foundations"
---

# Cache Timing Side-Channel Leakage Foundations

Modern high-performance central processing units execute software inside shared hardware environments where security boundaries between isolated software threads, user processes, and operating system kernels are enforced through virtual memory page tables and hardware privilege rings. However, behind these logical software abstractions sits a physical hardware reality: all software threads executing on a processor share the exact same physical silicon substrate, the exact same execution units, and the exact same multi-level memory hierarchy. When a processor executes an algorithm whose memory access locations depend on secret data values—such as a cryptographic key or a private security token—the CPU's internal memory controllers fetch specific 64-byte blocks of data from main system Dynamic Random-Access Memory into high-speed Static Random-Access Memory caches. Because fetching a line from a Level 1 cache takes approximately 1 nanosecond while fetching that same line from main DRAM takes approximately 50 nanoseconds, this 50-to-1 physical latency delta creates an unintended, un-sanitizable information leakage channel. An unprivileged, isolated observer sharing the physical CPU can execute high-precision timer instructions to measure memory access delays, inferring which internal cache sets were modified by a victim process. By observing these nanosecond timing variations over time, the observer can mathematically reconstruct private cryptographic keys without ever breaking software operating system permissions or exploiting software memory corruption bugs.

```text
THE CACHE TIMING LEAKAGE CHANNEL

 Victim Thread (Executing AES)       Attacker Thread (Measuring Time)
 ┌───────────────────────────┐       ┌───────────────────────────┐
 │ Accesses T[Secret_Key]    │       │ Reads High-Res Timer      │
 └─────────────┬─────────────┘       │ Accesses Shared Buffer    │
               │                     │ Reads High-Res Timer      │
               ▼                     └─────────────┬─────────────┘
 ┌───────────────────────────┐                     │
 │ Shared CPU Cache Array    │◄────────────────────┘
 │ (Line loaded into L1)     │  Measures: 1 ns (Hit) vs 50 ns (Miss)
 └───────────────────────────┘  INFERS SECRET KEY BITS!
```


## Secret-Dependent Memory Access Patterns

To understand why computer software exhibits timing side-channel leakage, we must examine how algorithms are written and how they interact with physical memory hardware.

In software engineering, developers frequently use array lookups or table substitutions to implement complex mathematical functions efficiently. A classic example is the implementation of the **Advanced Encryption Standard (AES)** algorithm or modular exponentiation in **RSA** public-key cryptography.

### The Mathematics of Secret-Indexed Table Lookups

In a non-constant-time implementation of AES encryption, the substitution phase (S-Box) is often accelerated using four pre-computed $256\text{-element}$ substitution tables stored in memory: $T_0, T_1, T_2, T_3$. Each element in these substitution tables is a 32-bit (4-byte) integer.

During the encryption of a plaintext block, the algorithm calculates a memory lookup address ($A_{\text{lookup}}$) by taking a byte of input plaintext ($P_i$), combining it with a byte of the secret cryptographic key ($K_i$) using a bitwise XOR operation ($\oplus$), and multiplying the result by the element byte-stride ($S_{\text{element}} = 4\text{ bytes}$):

$$x_i = P_i \oplus K_i$$

$$A_{\text{lookup}} = \text{Base\_Address}(T_0) + (x_i \times S_{\text{element}})$$

Where:
* $P_i \in [0, 255]$ is the $i$-th byte of the known input plaintext.
* $K_i \in [0, 255]$ is the $i$-th byte of the secret cryptographic key.
* $x_i = P_i \oplus K_i$ is the secret-dependent array index ($x_i \in [0, 255]$).
* $\text{Base\_Address}(T_0)$ is the physical or virtual base memory address of substitution table $T_0$.
* $S_{\text{element}} = 4$ is the size of each table entry in bytes.

```text
SECRET-DEPENDENT MEMORY LOOKUP DATAPATH

 Plaintext Byte (P_i) ──┐
                        ├──► [ XOR Gate ] ──► Index (x_i) ──► [ Address Calc ] ──► Memory Address A
 Secret Key Byte (K_i)  ──┘                                  Base + (x_i * 4)
```

Look closely at the equation for $A_{\text{lookup}}$:
Because the array index $x_i$ is computed directly from the secret key byte $K_i$, **the physical memory address $A_{\text{lookup}}$ accessed by the CPU is a direct mathematical function of the secret key!**

If the input plaintext $P_i$ is known to an attacker (which is standard in most cryptographic threat models), and the attacker can determine *which* specific offset within table $T_0$ was fetched into the CPU cache during encryption, the attacker can solve for the secret key byte $K_i$ directly:

$$K_i = P_i \oplus x_i$$

Where:
* $K_i$ is the secret key byte recovered by the attacker.
* $P_i$ is the known input plaintext byte.
* $x_i$ is the table array index inferred by observing cache timing leakage.


## Cache Access Latency Deltas and High-Resolution Hardware Timers

Now that we understand how software operations generate secret-dependent memory accesses, let us examine the physical hardware mechanics that allow an observer to detect whether a specific memory line resides in cache or main system DRAM.

### The Physics of the Memory Hierarchy Latency Delta

A modern central processing unit contains a hierarchical memory subsystem designed to balance storage capacity against physical access speed.

```text
THE MEMORY HIERARCHY LATENCY SPECTRUM

 Access Location  │ Physical Storage Media │ Typical Latency (Cycles) │ Typical Latency (ns)
──────────────────┼────────────────────────┼──────────────────────────┼──────────────────────
 L1 Data Cache    │ On-Chip 6T SRAM        │ 4 Clock Cycles           │ ~1.2 ns
 L2 Cache         │ On-Chip 6T SRAM        │ 12 Clock Cycles          │ ~3.7 ns
 L3 Shared Cache  │ On-Chip 6T/8T SRAM     │ 40 Clock Cycles          │ ~12.5 ns
 Main System RAM  │ Off-Chip 1T1C DRAM     │ 160 Clock Cycles         │ ~50.0 ns
```

Let us formalize the average memory access time ($T_{\text{access}}$) experienced by a CPU load instruction targeting a memory address $A$:

$$T_{\text{access}} = (1 - m_{\text{L1}}) \cdot T_{\text{L1\_hit}} + m_{\text{L1}} \cdot \left( (1 - m_{\text{L2}}) \cdot T_{\text{L2\_hit}} + m_{\text{L2}} \cdot \left( (1 - m_{\text{L3}}) \cdot T_{\text{L3\_hit}} + m_{\text{L3}} \cdot T_{\text{DRAM}} \right) \right)$$

Where:
* $T_{\text{access}}$ is the total physical memory access latency in clock cycles or nanoseconds.
* $T_{\text{L1\_hit}}, T_{\text{L2\_hit}}, T_{\text{L3\_hit}}$ are the physical access latencies for Level 1, Level 2, and Level 3 caches respectively.
* $T_{\text{DRAM}}$ is the physical access latency to fetch a line across the memory bus from off-chip DRAM.
* $m_{\text{L1}}, m_{\text{L2}}, m_{\text{L3}} \in [0.0, 1.0]$ are the cache miss ratios at each respective cache level.

If a memory line containing address $A$ resides in the Level 1 Data Cache ($m_{\text{L1}} = 0$):

$$T_{\text{access}} = T_{\text{L1\_hit}} \approx 4 \text{ Clock Cycles} \approx 1.2 \text{ ns}$$

If the line is absent from all cache levels ($m_{\text{L1}} = m_{\text{L2}} = m_{\text{L3}} = 1.0$):

$$T_{\text{access}} = T_{\text{DRAM}} \approx 160 \text{ Clock Cycles} \approx 50.0 \text{ ns}$$

The physical latency delta ($\Delta T$) between a cache hit and a main DRAM miss is:

$$\Delta T = T_{\text{DRAM}} - T_{\text{L1\_hit}} \approx 160 - 4 = \mathbf{156 \text{ Clock Cycles}} \approx \mathbf{48.8 \text{ ns}}$$

This $156\text{-cycle}$ latency delta is enormous! In the timescale of a $3.2\text{-GHz}$ CPU, $156\text{ clock cycles}$ is an eternity—long enough for the CPU to execute hundreds of arithmetic instructions. This huge physical timing contrast makes hit/miss discrimination trivial to measure in hardware.


### Out-of-Order Execution Serialization Hazards (`LFENCE` / `RDTSCP`)

When executing the timing measurement code above on a modern out-of-order CPU, a critical microarchitectural hazard occurs: **Instruction Reordering**.

An out-of-order CPU pipeline contains a Reorder Buffer (ROB) and Reservation Stations designed to execute instructions as soon as their operands are ready, regardless of program assembly order.

If the CPU pipeline sees that the memory load `(void)*addr` is waiting for a memory bus response, it may speculatively execute the second `rdtsc` instruction **before** the memory load finishes!

```text
OUT-OF-ORDER TIMING MEASUREMENT CORRUPTION

 Program Assembly Order:          Actual Out-of-Order Execution Order:
 1. rdtsc   (t1)                  1. rdtsc   (t1)
 2. load    (*addr) ─────────────►2. rdtsc   (t2)  <-- Executed EARLY!
 3. rdtsc   (t2)                  3. load    (*addr) <-- Executed LATE!
                                  Measured Delta (t2 - t1) = 5 cycles (FALSE HIT!)
```

Look at the corruption: The second `rdtsc` instruction executed early before the memory load completed. The measured delta $t_2 - t_1$ shows 5 cycles, making a slow DRAM miss look like a fast L1 cache hit!

#### The Hardware Fix: Serializing Instructions

To guarantee that instruction $N$ completes fully before instruction $N+1$ begins, the measurement code must insert **Serializing Barrier Instructions**:
* On x86: Using `RDTSCP` (which waits until all previous instructions have retired) combined with `LFENCE` (Load Fence, which serializes the instruction fetch and execution pipeline).
* On ARM64: Using `ISB` (Instruction Synchronization Barrier) and `DSB` (Data Synchronization Barrier).

```c
// Fully serialized high-precision timing measurement
uint64_t measure_access_latency_serialized(volatile uint8_t *addr) {
    uint64_t t1, t2;

    // Serialize pipeline and read start timer
    asm volatile (
        "cpuid\n\t"             // Serializing instruction (flushes pipeline)
        "rdtsc\n\t"             // Read time-stamp counter
        "mov %%edx, %0\n\t"
        "mov %%eax, %1\n\t"
        : "=r" (((uint32_t*)&t1)[1]), "=r" (((uint32_t*)&t1)[0])
        :: "%rax", "%rbx", "%rcx", "%rdx"
    );

    // Perform memory read
    (void)*addr;

    // Serialize pipeline and read end timer
    asm volatile (
        "rdtscp\n\t"            // Serializing time-stamp counter read
        "mov %%edx, %0\n\t"
        "mov %%eax, %1\n\t"
        "cpuid\n\t"             // Serialize to prevent subsequent instructions
        : "=r" (((uint32_t*)&t2)[1]), "=r" (((uint32_t*)&t2)[0])
        :: "%rax", "%rbx", "%rcx", "%rdx"
    );

    return (t2 - t1);
}
```


### Set Associativity and Cache Set Collision

In an $N$-way set-associative cache, each Set Index $I$ contains **$N$ independent storage slots (Ways)**.

For example, in an 8-way set-associative Level 1 Data Cache ($32\text{ KB}$ total capacity, $S = 64$ sets, $N = 8$ ways):
* Set Index 42 can hold up to **8 different 64-byte lines** simultaneously.
* If a process attempts to load a 9th memory line that maps to Set Index 42, the cache controller suffers a **Set Capacity Collision**.
* The cache controller must select one of the existing 8 lines, evict it back to L2/L3/DRAM, and replace it with the new 9th line using its replacement policy (e.g., Pseudo-LRU).

```text
8-WAY SET ASSOCIATIVE CACHE SET STRUCTURE

 Set Index 42 Row:
 ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 │ Way 0   │ Way 1   │ Way 2   │ Way 3   │ Way 4   │ Way 5   │ Way 6   │ Way 7   │
 │ [Line]  │ [Line]  │ [Line]  │ [Line]  │ [Line]  │ [Line]  │ [Line]  │ [Line]  │
 └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
 (If a 9th line maps to Set 42, one of the 8 existing ways MUST be evicted!)
```

This eviction rule is the fundamental mechanism leveraged by cache side-channel attacks! By filling all 8 ways of Set 42 with their own dummy lines, an attacker can force the victim's line out of the cache without ever touching the victim's memory!


## Noise, Prefetchers, and Hardware Edge Cases

While the theoretical mechanics of cache timing side channels are straightforward, real-world microprocessors introduce complex microarchitectural noise that every hardware security engineer must navigate.

### 1. Background System Noise and Bimodal Distribution Analysis

In a real operating system, an attacker process does not run in a vacuum. Background OS threads, timer interrupts, SMT sibling threads, and deferred procedure calls continuously modify cache states.

As a result, measuring memory access latency does not yield a single deterministic number. It produces a **Bimodal Statistical Distribution**:

```text
BIMODAL LATENCY DISTRIBUTION (HITS VS MISSES)

 Access Count
  ▲
  │   ┌───┐ (L1 Cache Hits)
  │   │   │ ~4 Cycles
  │ ──┴───┴──
  │                                     ┌───┐ (DRAM Misses)
  │                                     │   │ ~160 Cycles
  │ ────────────────────────────────────┴───┴──
  └─────────────────────────────────────────────────► Access Latency (Cycles)
      ◄── L1 Hit Region ──► | ◄── DRAM Miss Region ──►
                            ▲
                            └─ Decision Threshold (e.g., 80 Cycles)
```

To discriminate between a cache hit and a cache miss reliably, an engineer calculates a statistical **Decision Threshold ($T_{\text{threshold}}$)**:

$$T_{\text{threshold}} = \frac{T_{\text{L1\_hit}} + T_{\text{DRAM}}}{2}$$

For $T_{\text{L1\_hit}} = 4\text{ cycles}$ and $T_{\text{DRAM}} = 160\text{ cycles}$:

$$T_{\text{threshold}} = \frac{4 + 160}{2} = \mathbf{82 \text{ Clock Cycles}}$$

* Measured Latency $< 82 \text{ Cycles} \implies \mathbf{\text{CACHE HIT}}$ (Data was accessed by victim).
* Measured Latency $\ge 82 \text{ Cycles} \implies \mathbf{\text{CACHE MISS}}$ (Data was not accessed by victim).


### 3. Shared Inclusive vs. Exclusive Cache Topologies

The structural relationship between Level 1/2 caches and Level 3 (Last-Level Cache / LLC) determines how side-channel attacks propagate across CPU cores.

```text
INCLUSIVE VS EXCLUSIVE CACHE HIERARCHIES

 1. Inclusive LLC Hierarchy (Intel Core / Xeon)
 L3 Cache MUST hold a duplicate copy of ALL lines residing in L1/L2!
 Evicting a line from L3 FORCES a hardware back-invalidation that purges L1/L2!

 2. Exclusive / Non-Inclusive Hierarchy (AMD Zen / ARM Cortex)
 L3 Cache stores ONLY lines evicted from L2. L1/L2 lines do NOT exist in L3!
 Evicting an L3 line does NOT affect L1/L2 cache states.
```

* **Inclusive Caches**: Enable cross-core attacks! An attacker running on Core 1 can evict a line from shared L3 cache, which automatically triggers a hardware **Back-Invalidation** that purges the line from Core 0's private L1 Data Cache!
* **Exclusive Caches**: Cross-core eviction is harder because evicting an L3 line does not automatically clear the victim's private L1 cache on another core.


### Scenario and Parameters

You are a microarchitectural security engineer auditing a 3.2 GHz single-core RISC-V processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates an L1 Data Cache with the following parameters:
* **L1 Data Cache Size**: $32\text{ KB}$ ($32,768\text{ bytes}$).
* **Cache Line Size**: $64\text{ bytes}$ ($2^6 = 64$).
* **Associativity**: $8\text{-way set-associative}$ ($N = 8$).
* **L1 Hit Latency ($T_{\text{L1\_hit}}$)**: $4\text{ clock cycles}$ ($1.25\text{ ns}$).
* **Main DRAM Miss Latency ($T_{\text{DRAM}}$)**: $160\text{ clock cycles}$ ($50.0\text{ ns}$).

The CPU executes an un-mitigated AES-128 encryption routine. The algorithm uses a 256-element substitution table $T_0$ consisting of 32-bit (4-byte) entries ($1,024\text{ bytes}$ total table size) mapped starting at virtual address `Base_Address(T0) = 0x0000_7FFF_8000_1000`.

An attacker process monitors table $T_0$ to recover the first secret key byte $K_0$.

The attacker knows that for a known input plaintext byte $P_0 = \text{0x42}$, the table lookup address is:

$$A_{\text{lookup}} = \text{Base\_Address}(T_0) + ((P_0 \oplus K_0) \times 4)$$

```text
AES SUBSTITUTION TABLE MEMORY MAPPING

 Base Address: 0x0000_7FFF_8000_1000 (Table T0: 1,024 Bytes = 16 Cache Lines)
 Line 0 : T0[0]   .. T0[15]   (Offsets 0x000 .. 0x03F) -> Cache Set 40
 Line 1 : T0[16]  .. T0[31]   (Offsets 0x040 .. 0x07F) -> Cache Set 41
 Line 2 : T0[32]  .. T0[47]   (Offsets 0x080 .. 0x0BF) -> Cache Set 42
 ...
 Line 15: T0[240] .. T0[255]  (Offsets 0x3C0 .. 0x3FF) -> Cache Set 55
```


### Step-by-Step Derivation

#### Step 1: Calculate L1 Cache Geometry and Address Bitfields

##### 1. Total Number of Cache Lines ($N_{\text{lines}}$):

$$N_{\text{lines}} = \frac{\text{Cache Size}}{\text{Line Size}} = \frac{32,768 \text{ Bytes}}{64 \text{ Bytes/Line}} = \mathbf{512 \text{ Cache Lines}}$$

##### 2. Total Number of Cache Sets ($S$):
Given associativity $N = 8$:

$$S = \frac{N_{\text{lines}}}{\text{Associativity}} = \frac{512}{8} = \mathbf{64 \text{ Cache Sets}}$$

Since $S = 64 = 2^6$, the Set Index field requires **6 bits**.

##### 3. Address Decomposition Field Widths:
* **Line Offset ($O$)**: $\log_2(64) = \mathbf{6 \text{ Bits}}$ (Bits $[5:0]$).
* **Set Index ($I$)**: $\log_2(64) = \mathbf{6 \text{ Bits}}$ (Bits $[11:6]$).
* **Tag ($T$)**: $64 - (6 + 6) = \mathbf{52 \text{ Bits}}$ (Bits $[63:12]$).

```text
DERIVED L1 DATA CACHE ADDRESS DECOMPOSITION

 Bit 63                                     Bit 12 Bit 11     Bit 6 Bit 5     Bit 0
 ┌────────────────────────────────────────────────┬────────────────┬──────────────┐
 │ Tag (52 Bits)                                  │ Set Index (6b) │ Line Offset(6│
 └────────────────────────────────────────────────┴────────────────┴──────────────┘
```


#### Step 3: Derive the Decision Threshold $T_{\text{threshold}}$

Given $T_{\text{L1\_hit}} = 4\text{ clock cycles}$ and $T_{\text{DRAM}} = 160\text{ clock cycles}$:

$$T_{\text{threshold}} = \frac{T_{\text{L1\_hit}} + T_{\text{DRAM}}}{2} = \frac{4 + 160}{2} = \mathbf{82 \text{ Clock Cycles}}$$

* Measured Latency $< 82 \text{ Cycles} \implies \mathbf{\text{L1 CACHE HIT}}$
* Measured Latency $\ge 82 \text{ Cycles} \implies \mathbf{\text{DRAM CACHE MISS}}$


### Sanity Check and Verification

Let us verify our mathematical and physical results against microarchitectural principles:

1. **L1 Set Index Range Check**:
   * Total sets $= 64$ (Set 0 to Set 63).
   * Table $T_0$ size $= 1,024\text{ bytes} = 16\text{ lines}$.
   * Line 0 maps to Set 0, Line 15 maps to Set 15. All 16 lines fit cleanly in sets $0 \dots 15$ without set index wraparound.
2. **Timing Threshold Validity Check**:
   * Measured hit latency $= 4\text{ cycles}$. $4 < 82 \implies$ Correctly classified as L1 Hit.
   * Measured miss latency $= 160\text{ cycles}$. $160 \ge 82 \implies$ Correctly classified as DRAM Miss.
3. **Bitwise XOR Key Reduction Check**:
   * $P_0 = 0100\_0010_2$.
   * $x_0 \in [0010\_0000_2, 0010\_1111_2]$.
   * $K_0 = P_0 \oplus x_0 \in [0110\_0000_2, 0110\_1111_2] = [\text{0x60}, \text{0x6F}]$.
   * $0110\_0010_2 \oplus 0010\_0000_2 = 0100\_0010_2 = \text{0x42} = P_0$. Re-XORing recovers plaintext perfectly, proving mathematical precision!

All cache set geometry calculations, address decompositions, timing thresholds, and bitwise secret key reduction steps evaluate with 100% mathematical, physical, and microarchitectural precision.

