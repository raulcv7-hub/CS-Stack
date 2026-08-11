content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/01-cache-side-channel-attacks/01-timing-side-channels/01-cache-timing-leakage-foundations.md
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

---

## The Municipal Library and the High-Speed Desk

To build an intuitive, crystal-clear mental model of how physical timing variations expose secret information across logical security boundaries, let us step away from microchips for a moment and consider an everyday scenario: a municipal research library.

Imagine a large municipal library containing a massive basement archive holding 1,000,000 historical reference books, and a central reception desk where a clerk handles book requests. The basement archive is huge, and walking down to retrieve a book from the basement takes the clerk exactly 50 seconds. However, the clerk's desk has a small wooden holding tray that can hold only 10 books. If a requested book happens to be sitting right there on the holding tray, the clerk hands it to the patron in just 1 second.

Now, imagine two patrons in the library:
1. **The Secret Patient (The Victim Process)**: A patron enters the library to consult a medical reference book about a private medical condition. Depending on their specific diagnosis, the patron looks up a book in the catalog. If their diagnosis is Condition Alpha, they ask the clerk for Book #42. If their diagnosis is Condition Beta, they ask for Book #99. The clerk retrieves the requested book, hands it to the patient, and the patient reads it at the desk. Afterward, the clerk leaves the book sitting on the 10-book holding tray. The patient leaves the library, believing their medical diagnosis remains completely private.
2. **The Eavesdropper (The Attacker Process)**: An eavesdropper sits in the library lobby. The eavesdropper cannot see what book the patient read, nor do they have access to the patient's private medical records. Software privacy laws prohibit the clerk from answering any questions about the patient.

However, the eavesdropper understands the physical mechanics of the library's holding tray! Immediately after the patient leaves, the eavesdropper walks up to the desk and asks the clerk: *"May I please see Book #42?"*

The eavesdropper measures the time with a stopwatch:
* **Scenario A**: The clerk hands over Book #42 in **1 second**. The eavesdropper knows with $100\%$ certainty that Book #42 was already sitting on the holding tray! Who put it there? The secret patient! Therefore, the patient must have Condition Alpha!
* **Scenario B**: The clerk takes **50 seconds** to walk down to the basement and retrieve Book #42. The eavesdropper knows Book #42 was not on the holding tray. Therefore, the patient must have looked up a different book (Condition Beta)!

```text
THE MUNICIPAL LIBRARY TIMING LEAKAGE

 Patient (Victim)            Clerk's Holding Tray           Eavesdropper (Attacker)
 ┌─────────────────┐         ┌───────────────────┐          ┌────────────────────┐
 │ Reads Book #42  ├────────►│ Book #42 Left on  │◄─────────┤ Asks for Book #42  │
 └─────────────────┘         │ Holding Tray!     │          │ Measures: 1 Second!│
                             └───────────────────┘          └─────────┬──────────┘
                                                                      │
                                                                      ▼
                                                            Infers: Patient read #42!
```

Look at what happened in this library:
* The library clerk followed all privacy rules. They never gave the eavesdropper the patient's name, medical records, or reading history.
* Yet, the eavesdropper discovered the patient's secret medical diagnosis!
* How? By observing a **side-channel**: the time delta ($1\text{ second}$ vs $50\text{ seconds}$) required to fetch a shared physical resource (the book) from a fast temporary holding area (the desk tray) versus a slow main storage area (the basement archive).

This municipal library is the exact physical analogue of a **Cache Timing Side-Channel Attack**:
* The library patron is the **Victim Software Process** (e.g., an SSH server or an AES encryption routine).
* The private medical diagnosis is the **Secret Cryptographic Key**.
* Asking for Book #42 or Book #99 is a **Secret-Dependent Memory Access**.
* The 10-book holding tray is the **Level 1 (L1) CPU Cache**.
* The 1,000,000-book basement archive is **Main System DRAM Memory**.
* The 1-second vs 50-second fetch time is the **Microarchitectural Cache Hit vs. Miss Latency Delta**.
* The eavesdropper with the stopwatch is the **Attacker Process**.

---

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

---

### The Structural Vulnerability of Code-Branching Leakage

Secret-dependent memory access patterns do not occur only through array lookups. They also occur when software control flow (conditional branching) depends on secret data.

Consider a square-and-multiply modular exponentiation algorithm used in RSA decryption, where a secret private key exponent ($d$) is processed bit-by-bit from most significant bit to least significant bit:

```text
ALGORITHMIC SECRET-DEPENDENT CONTROL FLOW

 For each bit d_k in Secret Exponent d:
     Execute Square Operation:  R = (R * R) mod N   (Always executed)
     
     If bit d_k == 1:
         Execute Multiply Oper: R = (R * M) mod N   (Branch executed ONLY if key bit is 1!)
```

Trace the physical memory accesses during this loop:
1. When key bit $d_k == 0$, the CPU executes only the Square operation. The instructions and data constants for the Multiply operation are **not fetched** into the CPU cache.
2. When key bit $d_k == 1$, the CPU branches into the `if` block, executing the Multiply operation. The CPU fetches the Multiply instruction opcodes and the multiplier data constant $M$ from memory into its L1 cache.

```text
MICROARCHITECTURAL FOOTPRINT OF SECRET-DEPENDENT BRANCHING

 Key Bit d_k = 0 ──► Executed: [ Square Code ] ──────────────► L1 Cache contains ONLY Square Lines
 Key Bit d_k = 1 ──► Executed: [ Square Code ] + [ Mult Code ] ──► L1 Cache contains Square AND Mult Lines
```

By measuring whether the Multiply instruction lines or constant $M$ reside in the CPU cache after a loop iteration, an observer discovers whether key bit $d_k$ was $0$ or $1$. The physical microarchitectural state of the cache acts as an unintended recorder of execution control flow!

---

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

---

### High-Resolution Hardware Time-Stamp Counters

To measure these $156\text{-cycle}$ timing deltas, an attacker process uses high-resolution hardware time-stamp counters built directly into CPU execution architectures.

Practically all modern processor Instruction Set Architectures (ISAs) provide unprivileged assembly instructions that allow software to read an internal 64-bit hardware cycle counter running at the core clock frequency:

```text
HARDWARE TIME-STAMP COUNTER INSTRUCTIONS ACROSS ARCHITECTURES

 Architecture │ Assembly Instruction │ Read Register Target       │ Resolution
──────────────┼──────────────────────┼────────────────────────────┼──────────────────────────
 x86 / x86-64 │ RDTSC / RDTSCP       │ EDX:EAX (64-bit counter)   │ 1 CPU Clock Cycle
 ARM64        │ MRS x0, CNTVCT_EL0   │ System Register CNTVCT_EL0 │ 1 System Clock Cycle
 RISC-V       │ RDCYCLE / RTIME      │ rdcycle / rtime CSR        │ 1 Core Clock Cycle
```

#### Code Pattern for Nanosecond Timing Measurement

An attacker process measures the physical access latency of a memory line at virtual address `p` by wrapping the memory load instruction between two time-stamp counter reads:

```text
HIGH-PRECISION MEMORY TIMING MEASUREMENT

 1. Execute Read Timer Instruction  ──► Store Start_Time (t1)
 2. Execute Load Byte from Address  ──► Perform Read Access: dummy = *p
 3. Execute Read Timer Instruction  ──► Store End_Time (t2)
 4. Calculate Time Delta            ──► Latency = t2 - t1
```

In C and assembly code, this timing measurement is structured as follows:

```c
// High-precision memory access timing measurement
uint64_t measure_access_latency(volatile uint8_t *addr) {
    uint64_t t1, t2;
    uint32_t cycles_low, cycles_high;

    // Read hardware time-stamp counter before memory access (t1)
    asm volatile (
        "rdtsc\n\t"
        "mov %%edx, %0\n\t"
        "mov %%eax, %1\n\t"
        : "=r" (cycles_high), "=r" (cycles_low)
        :: "%rax", "%rdx"
    );
    t1 = ((uint64_t)cycles_high << 32) | cycles_low;

    // Force memory load access
    (void)*addr;

    // Read hardware time-stamp counter after memory access (t2)
    asm volatile (
        "rdtsc\n\t"
        "mov %%edx, %0\n\t"
        "mov %%eax, %1\n\t"
        : "=r" (cycles_high), "=r" (cycles_low)
        :: "%rax", "%rdx"
    );
    t2 = ((uint64_t)cycles_high << 32) | cycles_low;

    return (t2 - t1); // Returns total clock cycles elapsed
}
```

---

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

---

## From Virtual Addresses to Physical Cache Sets

To understand how an attacker targets specific variables or substitution tables, we must examine how the CPU's internal cache controller maps 64-bit virtual memory addresses to physical cache storage sets.

### The Tag-Index-Offset Address Decomposition

A CPU cache does not store individual 1-byte variables. It manages memory in fixed-size blocks called **Cache Lines** (typically $64\text{ bytes} = 512\text{ bits}$ long).

When a 64-bit physical memory address ($A_{\text{physical}}$) arrives at an $N$-way set-associative cache, the cache controller decomposes the 64 bits into three distinct bitfields:

```text
64-BIT PHYSICAL ADDRESS DECOMPOSITION

 Bit 63                                     Bit 12 Bit 11     Bit 6 Bit 5     Bit 0
 ┌────────────────────────────────────────────────┬────────────────┬──────────────┐
 │ Tag Field                                      │ Set Index      │ Line Offset  │
 │ (Used for unique line verification)            │ (Selects Set)  │ (Byte in Line│
 └────────────────────────────────────────────────┴────────────────┴──────────────┘
```

1. **Line Offset ($O$ — Lowest $6\text{ Bits}$, Bits $[5:0]$)**:
   For a $64\text{-byte}$ cache line ($2^6 = 64$), the lowest 6 bits select the exact byte byte-offset ($0 \dots 63$) within the $64\text{-byte}$ block.
2. **Set Index ($I$ — Middle $6\text{ to } 12\text{ Bits}$, e.g., Bits $[11:6]$)**:
   Selects one specific cache set row within the cache array. For a cache containing $S = 64$ sets ($2^6 = 64$), bits $[11:6]$ select Set Index $0 \dots 63$.
3. **Tag ($T$ — High-Order Bits, e.g., Bits $[63:12]$)**:
   Stored alongside the cache line in SRAM to identify uniquely which physical memory page owns the line currently residing in that set.

$$\text{Line Offset } O = A_{\text{physical}} \ \& \ \text{0x3F}$$

$$\text{Set Index } I = (A_{\text{physical}} \gg 6) \ \& \ (S - 1)$$

$$\text{Tag } T = A_{\text{physical}} \gg (\log_2(S) + 6)$$

Where:
* $S$ is the total number of cache sets in the cache array (e.g., $S = 64$).
* $\&$ denotes the bitwise AND operator.
* $\gg$ denotes the logical right shift operator.

---

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

---

### Virtually Indexed, Physically Tagged (VIPT) Cache Mechanics

To achieve ultra-fast $1\text{-cycle}$ hit latencies, L1 Data Caches in modern CPUs use a **Virtually Indexed, Physically Tagged (VIPT)** architecture.

In a VIPT cache:
1. The cache set index ($I$) is extracted directly from the **Virtual Address** ($A_{\text{virtual}}$) before address translation completes, allowing the L1 SRAM set lookup to start immediately in parallel with the Memory Management Unit (MMU) / Translation Lookaside Buffer (TLB) page table walk!
2. The tag ($T$) is extracted from the **Physical Address** ($A_{\text{physical}}$) returned by the TLB to verify if the fetched line matches.

```text
VIPT CACHE PARALLEL LOOKUP DATAPATH

 Virtual Address (A_virtual) ─────────► Extract Set Index [11:6] ──► Start L1 SRAM Read
            │
            ▼ TLB Translation
 Physical Address (A_physical) ───────► Extract Tag [63:12] ───────► Compare Tag
```

#### The Page Offset Invariant

In standard 4KB virtual memory paging ($2^{12} = 4,096\text{ bytes}$), the lowest 12 bits ($[11:0]$) of a Virtual Address and its corresponding Physical Address are **100% IDENTICAL**!

$$\mathbf{A_{\text{virtual}}[11:0] \quad \equiv \quad A_{\text{physical}}[11:0]}$$

Because L1 Data Cache set indices are constructed entirely from bits $[11:6]$ (which fall completely inside the lowest 12 bits):
* **An attacker process knows the exact L1 Cache Set Index $I$ of any virtual address in its memory space, even without knowing its physical address!**
* Two different virtual addresses sharing the same lowest 12 bits will map to the **exact same L1 cache set**, regardless of physical page mapping!

---

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

---

### 2. Hardware Stream and Stride Prefetchers

Modern CPUs incorporate autonomous **Hardware Prefetchers** (e.g., L1 Stream Prefetchers and L2 Spatial Prefetchers).

When a prefetcher detects that software is reading memory sequentially ($A, A+64, A+128$), it speculatively fetches $A+192$ and $A+256$ into L1/L2 cache **before software asks for them**!

```text
PREFETCHER INTERFERENCE HAZARD

 Software reads: [ Line A ] ──► [ Line A+64 ] ──► [ Line A+128 ]
                                                       │
                                                       ▼ Hardware Prefetcher Triggers!
 Hardware Prefetcher automatically loads [ Line A+192 ] into L1 Cache!
 (Attacker measures Line A+192 as a HIT, falsely inferring the victim accessed A+192!)
```

#### Impact on Side-Channel Attacks:
* Hardware prefetchers pull adjacent memory lines into L1 cache automatically, creating **False Positive Cache Hits**.
* **Mitigation / Workaround**: Side-channel attacks must access memory non-sequentially (e.g., using random stride patterns or pointer chasing) to prevent hardware prefetchers from activating and corrupting timing measurements.

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Cache Timing Analysis, Threshold Derivation, and Key Recovery Trace

To consolidate your complete mastery of cache timing side channels, address set index calculations, latency thresholds, and statistical secret-key reconstruction, we will now walk through a step-by-step industrial hardware engineering problem.

---

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

---

### Your Objective

1. Calculate the total number of cache sets ($S$) in the L1 Data Cache and derive the bitfields for Set Index ($I$) and Line Offset ($O$).
2. Calculate how many 64-byte cache lines are required to store substitution table $T_0$, and list the L1 Cache Set Indices ($I$) occupied by table $T_0$.
3. Derive the mathematical decision threshold $T_{\text{threshold}}$ (in clock cycles) used to classify memory accesses as L1 Hits versus DRAM Misses.
4. The attacker runs a Flush+Reload measurement after the victim encrypts $P_0 = \text{0x42}$. The attacker measures access latencies across all 16 cache lines of $T_0$. The results show that **Line 2 (Offsets `0x080` to `0x0BF`) was an L1 Cache HIT ($T = 4\text{ cycles}$)**, while all other 15 lines were DRAM Misses ($T = 160\text{ cycles}$).
   * Calculate the possible range of values for the secret array index $x_0 = P_0 \oplus K_0$.
   * Deduce the exact candidate byte values for secret key byte $K_0$.
5. Verify mathematical, physical, and logical correctness.

---

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

---

#### Step 2: Determine Table $T_0$ Cache Footprint and Set Index Mapping

Table $T_0$ contains 256 4-byte entries:

$$\text{Total Table Size} = 256 \times 4 \text{ Bytes} = 1,024 \text{ Bytes}$$

##### 1. Number of Cache Lines Occupied by $T_0$:

$$N_{\text{table\_lines}} = \frac{1,024 \text{ Bytes}}{64 \text{ Bytes/Line}} = \mathbf{16 \text{ Cache Lines}}$$

##### 2. Determine L1 Cache Set Indices for $T_0$:
`Base_Address(T0)` $= \text{0x0000\_7FFF\_8000\_1000}$.

Let us inspect the lowest 12 bits of `Base_Address(T0)`:
$$\text{0x1000} = 0001\_0000\_0000\_0000_2$$

Extract Set Index bits $[11:6]$ for Line 0:
$$\text{Bits }[11:6] \text{ of 0x1000} = 000000_2 = 0$$

Wait, let me check:
$\text{0x1000} \gg 6 = \text{0x40} = 64_{10}$.
$64 \ \& \ (64 - 1) = 64 \ \& \ 63 = \mathbf{0}$.

Line 0 starts at address `0x8000_1000` $\implies$ **Set Index 0**.
Line 1 starts at address `0x8000_1040` $\implies$ **Set Index 1**.
Line 2 starts at address `0x8000_1080` $\implies$ **Set Index 2**.
...
Line 15 starts at address `0x8000_13C0` $\implies$ **Set Index 15**.

Table $T_0$ spans **Cache Set Indices 0 through 15**.

---

#### Step 3: Derive the Decision Threshold $T_{\text{threshold}}$

Given $T_{\text{L1\_hit}} = 4\text{ clock cycles}$ and $T_{\text{DRAM}} = 160\text{ clock cycles}$:

$$T_{\text{threshold}} = \frac{T_{\text{L1\_hit}} + T_{\text{DRAM}}}{2} = \frac{4 + 160}{2} = \mathbf{82 \text{ Clock Cycles}}$$

* Measured Latency $< 82 \text{ Cycles} \implies \mathbf{\text{L1 CACHE HIT}}$
* Measured Latency $\ge 82 \text{ Cycles} \implies \mathbf{\text{DRAM CACHE MISS}}$

---

#### Step 4: Reconstruct Secret Key Byte $K_0$

The attacker observes that **Line 2 of $T_0$ was an L1 Cache HIT ($T = 4\text{ cycles} < 82\text{ cycles}$)**.

Line 2 covers table offsets from `0x080` ($128_{10}\text{ bytes}$) to `0x0BF` ($191_{10}\text{ bytes}$).

Since each table entry is $4\text{ bytes}$, the array entry indices $x_0$ stored in Line 2 are:

$$x_{\text{start}} = \frac{128 \text{ Bytes}}{4 \text{ Bytes/Entry}} = \mathbf{32}$$

$$x_{\text{end}} = \frac{191 \text{ Bytes}}{4 \text{ Bytes/Entry}} = \mathbf{47}$$

The secret-dependent index $x_0 = P_0 \oplus K_0$ lies in the range:

$$\mathbf{x_0 \in [32, 47]}$$

In 8-bit binary representation:
* $32_{10} = 0010\_0000_2 = \text{0x20}$
* $47_{10} = 0010\_1111_2 = \text{0x2F}$

Notice that for all numbers from 32 to 47, the upper 4 bits are fixed to `0010_2` ($\text{0x2}$), while the lower 4 bits span `0000_2` to `1111_2` ($\text{0x0}$ to $\text{0xF}$).

##### Calculate Candidate Secret Key Bytes ($K_0$):
Given known plaintext $P_0 = \text{0x42} = 0100\_0010_2$:

$$K_0 = P_0 \oplus x_0$$

For $x_0 = 32 = 0010\_0000_2$:
$$K_0 = 0100\_0010_2 \oplus 0010\_0000_2 = 0110\_0010_2 = \mathbf{\text{0x62}}$$

For $x_0 = 47 = 0010\_1111_2$:
$$K_0 = 0100\_0010_2 \oplus 0010\_1111_2 = 0110\_1101_2 = \mathbf{\text{0x6D}}$$

```text
SECRET KEY BYTE REDUCTION RESULT

 Initial Search Space for K_0 : 256 possible byte values (0x00 to 0xFF - 8 bits entropy)
 After Single Flush+Reload   : K_0 MUST lie in range [0x60, 0x6F] (16 candidate values!)
 Key Entropy Reduction      : Reduced search space by 93.75%! (4 bits of key leaked!)
```

##### Deduction Result:
By observing a single L1 cache hit on Line 2, the attacker **narrowed down the secret key byte $K_0$ from 256 possibilities to just 16 candidates (`0x60` through `0x6F`)**, leaking 4 full bits of the secret key in a single encryption measurement! 

By repeating this measurement across 10 different plaintext inputs, the attacker will isolate $K_0$ to a single unique byte value with $100\%$ statistical certainty!

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Cache timing side-channel**: A hardware information leakage vulnerability where physical memory access latency differences between fast SRAM cache hits (~1 ns) and slow off-chip DRAM misses (~50 ns) allow an observer process to infer microarchitectural state changes made by a victim process.
* **Secret-dependent memory access**: A software implementation flaw where memory addresses or control flow branches are computed directly from secret data values (such as cryptographic key bits or private tokens), causing the physical CPU cache footprint to record and expose secret information.