---
title: "Hardware Cache Partitioning Mechanics and Cache Way Locking Architectures"
---

# Hardware Cache Partitioning Mechanics and Cache Way Locking Architectures

In modern multi-core and multi-tenant computing systems, microprocessors incorporate large, shared Level 2 (L2) and Level 3 (L3) Last-Level Cache (LLC) arrays to bridge the enormous speed gap between high-frequency CPU execution cores and slow main Dynamic Random-Access Memory (DRAM). In an $N$-way set-associative cache hierarchy, every physical memory address is mapped to a specific cache set index based on its address bits, and up to $N$ independent 64-byte memory lines can reside simultaneously within the $N$ physical ways of that set row. When multiple isolated security domains—such as an unprivileged tenant process, an operating system kernel, or a secure hardware enclave—execute concurrently on the processor, they share the exact same set-associative cache arrays. When Domain A loads a memory line into Cache Set $S$, the CPU's hardware cache replacement policy (such as Pseudo-LRU or Tree-PLRU) selects an existing line in Set $S$ to evict to DRAM to make room for Domain A's data. If the evicted line belongs to Domain B, Domain B suffers a $160\text{-cycle}$ off-chip DRAM fetch penalty on its next memory access. This un-isolated cache set contention allows Domain A to execute Flush+Reload or Prime+Probe side-channel attacks: by deliberately filling target cache sets and measuring whether its own lines were evicted, Domain A can track Domain B's exact memory access patterns step-by-step, reconstructing private encryption keys and secret user data without ever breaking software memory access controls! Operating system page tables and process isolation boundaries are completely powerless to stop cross-domain cache set contention because cache eviction is managed by silicon hardware logic below the Instruction Set Architecture. To eliminate cache side-channel attacks at the physical hardware layer, CPU architects developed **Hardware Cache Partitioning** and **Cache Way Locking**. Powered by silicon control primitives such as **Intel Cache Allocation Technology (CAT)** and **ARM Memory System Resource Partitioning and Monitoring (MPAM)**, the hardware memory controller enforces physical way-masking per security domain, ensuring that Domain A and Domain B are assigned completely disjoint, non-overlapping cache ways within every set row, rendering cross-domain cache set contention and eviction side channels physically impossible in silicon.

```text
HARDWARE CACHE WAY LOCKING PARTITIONING (INTEL CAT / ARM MPAM)

 Shared L2 / L3 Cache Set S Row (16 Physical Ways)
 ┌───────────────────────────────────┬───────────────────────────────────┐
 │ W0 │ W1 │ W2 │ W3 │ W4 │ W5 │ W6 │ W7 │ W8 │ W9 │W10 │W11 │W12 │W13 │W14 │W15 │
 ├───────────────────────────────────┼───────────────────────────────────┤
 │ DOMAIN 0 (Untrusted Tenant / OS)  │ DOMAIN 1 (Secure Enclave / CVM)   │
 │ Allowed Bitmask: 0x00FF (Ways 0..7)│ Allowed Bitmask: 0xFF00 (Ways 8..15)│
 └───────────────────────────────────┴───────────────────────────────────┘
  (Domain 0 accesses CAN NEVER touch, inspect, or evict Ways 8 through 15!)
  (Cross-domain Prime+Probe cache side channels are 100% IMPOSSIBLE!)
```


### The Hardware Solution: Steel Barrier Gates (Cache Way Locking)

To permanently eliminate this surveillance problem, the hotel owner installs **Steel Barrier Gates (Intel CAT / ARM MPAM Way Locking)** inside every single parking row:

The 8 parking spaces in every row are split into two strict, non-overlapping physical zones:
* **BLUE ZONE (Spaces $0 \dots 3$)**: Locked exclusively for Guest B (Untrusted Tenant).
* **GOLD ZONE (Spaces $4 \dots 7$)**: Locked exclusively for Guest A (Secure Enclave).

```text
WAY LOCKING ZONE PARTITIONING

 Parking Row Partitioning (In Every Row 0..63)
 ┌─────────────────────────────────────────────────────────────┐
 │ Spaces 0 to 3 (BLUE ZONE)  ──► Guest B Cars ONLY!           │
 ├─────────────────────────────────────────────────────────────┤
 │ Spaces 4 to 7 (GOLD ZONE)  ──► Guest A Cars ONLY!           │
 └─────────────────────────────────────────────────────────────┘
```

The automated valet towing system is reprogrammed with a strict **Hardware Way-Masking Rule**:
* When Guest B arrives with a car, the valet is **ONLY ALLOWED to park it or tow cars in Blue Spaces $0 \dots 3$**.
* When Guest A arrives with a car, the valet is **ONLY ALLOWED to park it or tow cars in Gold Spaces $4 \dots 7$**.

Look at what this physical way locking achieves:
1. Guest B can drive 100 cars into the garage. When Blue Spaces $0 \dots 3$ fill up, Guest B's new cars push out Guest B's older cars.
2. But no matter how many cars Guest B drives into the garage, **Guest B's valet can NEVER touch, enter, or tow cars parked in Gold Spaces $4 \dots 7$**!
3. Guest A's cars in Gold Spaces $4 \dots 7$ sit completely undisturbed ($100\%$ Way Isolation).
4. Guest B checks the garage, but finds zero interaction with Guest A's cars.
5. **Cross-domain parking contention and side-channel leakage are eliminated by physical hardware design!**

This parking garage scenario is the exact physical analogue of **Hardware Cache Partitioning and Cache Way Locking**:
* The parking garage is the **Shared Level 2 / Level 3 Cache Array**.
* Guest B is the **Untrusted Tenant / Attacker Process**.
* Guest A is the **Secure Enclave / VIP Application**.
* The 64 rows are **Cache Set Indices ($0 \dots 63$)**.
* The 8 parking spaces per row are **Physical Cache Ways ($W_0 \dots W_7$)**.
* The automated valet towing system is the **Hardware Cache Replacement Policy (Pseudo-LRU)**.
* The steel barrier gates are **Intel Cache Allocation Technology (CAT) / ARM MPAM Way Bitmasks**.
* The Blue and Gold Zones are **Disjoint Cache Way Partitions**.


### The Mechanics of Cross-Domain Cache Set Contention

When two independent software execution domains (Domain A and Domain B) execute concurrently on the CPU, they share the exact same $S$ cache set rows.

Trace the hardware state machine when Domain A and Domain B access memory mapped to the same Cache Set $S_k$:

```text
CROSS-DOMAIN CACHE SET EVICTION TIMELINE

 1. Domain B loads memory address Y -> Mapped to Set S_k
    Cache State: Set S_k [ Way 0: Line Y (Domain B) ]

 2. Domain A loads 8 memory addresses X_0..X_7 -> All mapped to Set S_k!
    Set S_k is 100% FULL!

 3. Domain A loads 9th address X_8 -> Set S_k Overflows!
    Pseudo-LRU Replacement Policy selects Way 0 to evict!
    Line Y (Domain B) is EVICTED to main DRAM memory!

 4. Domain B re-accesses Line Y -> Suffers L3 Cache Miss (160 Cycles Penalty)!
    Domain B measures 160 cycles -> Discovers Domain A accessed Set S_k!
```

1. **Domain B's Initial Read**: Domain B loads memory address $Y$. Address $Y$ maps to Cache Set $S_k$. Line $Y$ is stored in Way 0 of Set $S_k$.
2. **Domain A's Set Contention Loop**: Domain A (an attacker) loads $N$ distinct memory lines ($X_0 \dots X_{N-1}$) that all map to Cache Set $S_k$.
3. **The Hardware Eviction Event**:
   * Set $S_k$ is now $100\%$ full ($N$ ways occupied).
   * Domain A loads an $(N+1)$-th line ($X_N$) mapping to Set $S_k$.
   * The cache controller's **Pseudo-LRU (Least Recently Used)** state machine evaluates Set $S_k$.
   * Pseudo-LRU selects Way 0 for eviction! Line $Y$ (belonging to Domain B) is **evicted to main DRAM memory**!
4. **The Timing Side-Channel Leak**:
   * Domain B re-accesses Line $Y$.
   * Because Line $Y$ was evicted by Domain A, Domain B suffers a **$160\text{-cycle}$ off-chip DRAM fetch penalty** ($T_{\text{DRAM}} \approx 160\text{ cycles}$).
   * Domain B measures this $160\text{-cycle}$ timing delay using `RDTSCP`, discovering that Domain A accessed Cache Set $S_k$!

This cross-domain cache set contention is the fundamental physical vulnerability exploited by Prime+Probe and Flush+Reload side-channel attacks!


### Class of Service (CLOS / PARTID) Abstraction

In hardware cache partitioning architectures, threads and execution contexts are grouped into security domains called **Classes of Service (CLOS)** (in Intel RDT/CAT terminology) or **Partition IDs (PARTID)** (in ARM MPAM terminology).

Each CPU core or logical thread contains a hardware register that binds the thread to a specific Class of Service ID:
* On x86-64: Model-Specific Register `IA32_PQR_ASSOC` (Bits $[63:32]$ store the active `CLOS` ID).
* On ARM64: System Register `MPAM0_EL1` / `MPAM1_EL1` (Stores the active `PARTID`).

```text
THREAD TO CLASS OF SERVICE BINDING

 Logical Thread Register (IA32_PQR_ASSOC / MPAM1_EL1)
 ┌────────────────────────────────────────┬───────────────────────────┐
 │ Reserved Bits                          │ Active CLOS / PARTID ID   │
 └────────────────────────────────────────┴─────────────┬─────────────┘
                                                        │
                                                        ▼
 Selects Active Capacity Bitmask CBM[CLOS_ID] in Memory Controller!
```


## Mathematical Proof of Zero Cache Contention and Side-Channel Elimination

Let us prove mathematically why non-overlapping hardware cache way partitioning ($W(CLOS_A) \cap W(CLOS_B) = \emptyset$) completely eliminates cross-domain cache side-channel leakage.

Let $W(CLOS_i)$ be the set of physical cache ways accessible to Class of Service $CLOS_i$ in an $N$-way set-associative cache:

$$W(CLOS_i) = \{ k \in [0, N-1] \mid \text{CBM}[CLOS_i][k] == 1 \}$$

Suppose system software configures two security domains ($CLOS_A$ for an untrusted tenant process and $CLOS_B$ for a secure enclave) with **disjoint capacity bitmasks**:

$$\mathbf{W(CLOS_A) \ \cap \ W(CLOS_B) \ \equiv \ \emptyset \quad (\text{EMPTY SET!})}$$


### Proof of Zero Side-Channel Mutual Information

Let $\Delta T_B$ be the memory access latency measured by Domain B when re-reading its memory lines in Cache Set $S_k$.

Let $X_A \in \{0, 1\}$ be a binary variable representing whether Domain A accessed Cache Set $S_k$ ($X_A = 1$) or remained idle ($X_A = 0$).

Because $P\left( E(Line_B \mid Access_A) \right) \equiv 0$:
* When $X_A = 0 \implies \Delta T_B = T_{\text{L3\_hit}} \approx 36 \text{ Clock Cycles}$.
* When $X_A = 1 \implies \Delta T_B = T_{\text{L3\_hit}} \approx 36 \text{ Clock Cycles}$.

$$\Delta T_B(X_A = 0) \equiv \Delta T_B(X_A = 1) \equiv T_{\text{L3\_hit}}$$

The conditional probability distribution of Domain B's measured latency is completely independent of Domain A's activity:

$$P(\Delta T_B \mid X_A = 0) \equiv P(\Delta T_B \mid X_A = 1)$$

Applying Shannon's Mutual Information equation:

$$\mathbf{I(\Delta T_B ; X_A) = H(\Delta T_B) - H(\Delta T_B \mid X_A) \equiv 0.0000 \text{ Bits!}}$$

#### Mathematical Security Conclusion:
Because $I(\Delta T_B ; X_A) \equiv 0.0000\text{ bits}$:
* Domain B's measured cache timing contains **zero bits of information** about Domain A's memory accesses.
* Cross-domain Prime+Probe and Flush+Reload cache side-channel attacks are **$100\%$ mathematically eliminated in silicon!**


### Trade-offs: Cache Capacity Loss vs. Side-Channel Immunity

While hardware way locking provides $100\%$ side-channel immunity, system engineers must balance security against **Cache Capacity Loss**:

```text
CACHE WAY PARTITIONING PERFORMANCE TRADE-OFF MATRIX

 Partitioning Scheme       │ Domain 0 Ways │ Domain 1 Ways │ Intra-Domain Miss Rate │ Side-Channel Security
───────────────────────────┼───────────────┼───────────────┼────────────────────────┼───────────────────────────
 Un-Partitioned (Shared)   │ 16 Ways (All) │ 16 Ways (All) │ Baseline (Optimal)     │ VULNERABLE (P+P / F+R)
 50/50 Static Split        │ 8 Ways        │ 8 Ways        │ +2.5% L3 Miss Rate     │ 100% SECURE (Disjoint)
 75/25 Asymmetric Split    │ 12 Ways       │ 4 Ways        │ +0.8% OS / +6.2% VM    │ 100% SECURE (Disjoint)
 Overlapping Mask (0x0FFF) │ 12 Ways       │ 8 Ways (Overlap) Baseline              │ VULNERABLE in Overlap!
```

#### Key Engineering Takeaways:
1. **Strict Disjointness Required**: To eliminate side channels, capacity bitmasks **MUST be strictly disjoint** ($W_A \cap W_B = \emptyset$). If bitmasks overlap (e.g. sharing Ways $4 \dots 7$), side-channel leakage persists within those overlapping ways!
2. **Minor Performance Penalty**: Restricting a domain to 8 ways out of 16 reduces its effective cache capacity by $50\%$. However, due to the logarithmic diminishing returns of cache associativity (Amdahl's law for caches), reducing an L3 cache from 16-way to 8-way increases average cache miss rates by **only $1\%\text{ to } 3\%$**, representing a trivial performance cost for absolute hardware side-channel immunity!


### Scenario and Parameters

You are a senior microarchitectural performance and security architect auditing an 8-core $3.2\text{ GHz}$ x86-64 server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The CPU cores share a $16\text{-Way}$ set-associative Level 3 (L3) Last-Level Cache array with the following physical parameters:
* **L3 Cache Total Size**: $16\text{-Megabytes}$ ($16 \times 1,048,576\text{ bytes} = 16,777,216\text{ bytes}$).
* **Cache Line Size**: $64\text{ bytes}$ ($2^6 = 64$).
* **Associativity**: $16\text{-way set-associative}$ ($N = 16$).
* **L1 Data Cache Hit Latency**: $T_{\text{L1D\_hit}} = 4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* **L3 Cache Hit Latency**: $T_{\text{L3\_hit}} = 36\text{ CPU Clock Cycles}$ ($11.25\text{ ns}$).
* **Main DRAM Miss Latency**: $T_{\text{DRAM\_miss}} = 180\text{ CPU Clock Cycles}$ ($56.25\text{ ns}$).

```text
3.2 GHz PROCESSOR WITH 16 MB 16-WAY L3 CACHE

 Shared L3 Cache: 16 MB Total Size | Line Size = 64B | Associativity N = 16
 Hit Latency: L1D = 4 Cycles, L3 = 36 Cycles, DRAM = 180 Cycles
 Clock T = 312.5 ps
```

The cloud hypervisor configures Intel Cache Allocation Technology (CAT) to isolate two security domains:
* **Domain 0 (Untrusted Tenant VM)**: Bound to `CLOS 0`. Capacity Bitmask $\text{CBM}[0] = \mathbf{\text{0x00FF}} = 0000\_0000\_1111\_1111_2$ (Ways $0 \dots 7$).
* **Domain 1 (Confidential VM / Secure Enclave)**: Bound to `CLOS 1`. Capacity Bitmask $\text{CBM}[1] = \mathbf{\text{0xFF00}} = 1111\_1111\_0000\_0000_2$ (Ways $8 \dots 15$).

Domain 0 and Domain 1 both execute memory access loops targeting physical addresses that map to **L3 Cache Set Index 42** ($S_{42}$).

#### Your Objective

1. Calculate the total number of cache sets ($S_{\text{total}}$) in the 16-MB L3 cache array, and calculate the total physical cache capacity (in Megabytes) assigned to Domain 0 versus Domain 1.
2. Trace the hardware cache replacement policy execution when Domain 0 executes a $100\%$ cache-saturating Prime+Probe loop filling Cache Set Index 42:
   * Identify which specific physical ways ($W_0 \dots W_{15}$) are evaluated and selected for eviction by the replacement engine during Domain 0's accesses.
   * Prove mathematically why Domain 1's cache lines stored in Ways $8 \dots 15$ of Cache Set Index 42 remain **$100\%$ undisturbed**.
3. Calculate the memory read latency (in clock cycles and nanoseconds) experienced by Domain 1 when re-reading its memory line in Cache Set Index 42 under two system configurations:
   * **Config A**: Intel CAT Way Locking **DISABLED** (Un-partitioned shared cache).
   * **Config B**: Intel CAT Way Locking **ENABLED** ($\text{CBM}[0] = \text{0x00FF}, \text{CBM}[1] = \text{0xFF00}$).
4. Calculate the side-channel mutual information $I(\Delta T_{\text{Domain1}} ; \text{Accesses}_{\text{Domain0}})$ under Config B.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Trace Hardware Replacement Policy under Domain 0 Prime+Probe Loop

Domain 0 (`CLOS 0`, $\text{CBM}[0] = \text{0x00FF}$) executes a Prime+Probe loop loading $32$ distinct memory lines that all map to Cache Set Index 42 ($S_{42}$).

##### 1. Hardware Way-Masking Rule Evaluation:
When Domain 0 experiences a cache miss in Set 42, the cache controller reads $\text{CBM}[0] = \text{0x00FF} = 0000\_0000\_1111\_1111_2$.

The candidate ways available for eviction are restricted to:

$$W_{\text{evict\_candidates}}(CLOS_0) = \{ k \in [0, 15] \mid \text{CBM}[0][k] == 1 \} = \mathbf{\{ W_0, W_1, W_2, W_3, W_4, W_5, W_6, W_7 \}}$$

##### 2. Eviction Execution Trace:
* As Domain 0 fills Set 42, the Pseudo-LRU replacement state machine cycles **EXCLUSIVELY through Ways $0, 1, 2, 3, 4, 5, 6, 7$**.
* When Domain 0 loads its 9th line into Set 42, Pseudo-LRU evicts an existing line from **Way 0** (which holds an older Domain 0 line).
* Ways $8, 9, 10, 11, 12, 13, 14, 15$ have bit $b_k = 0$ in $\text{CBM}[0]$. They are **completely locked and excluded from the eviction evaluation tree**!

##### 3. Non-Interference Proof for Domain 1:
Domain 1's memory lines in Set 42 reside in **Ways $8 \dots 15$**.

Because Domain 0's eviction candidate set $W_{\text{evict\_candidates}}(CLOS_0) = \{W_0 \dots W_7\}$ and Domain 1's lines reside in $\{W_8 \dots W_{15}\}$:

$$\{W_0 \dots W_7\} \ \cap \ \{W_8 \dots W_{15}\} \ \equiv \ \emptyset \quad (\mathbf{\text{EMPTY SET!}})$$

$$\mathbf{\text{Eviction Probability of Domain 1's Lines by Domain 0: } P(\text{Evict}_1 \mid \text{Access}_0) \equiv 0.0000}$$

Domain 1's cache lines in Ways $8 \dots 15$ remain **$100\%$ physically undisturbed**!


##### Config B: Intel CAT Way Locking ENABLED ($\text{CBM}[0] = \text{0x00FF}, \text{CBM}[1] = \text{0xFF00}$):
* Domain 0's Prime+Probe loop was restricted to Ways $0 \dots 7$.
* Domain 1's line in Way 8 was **NOT evicted**!
* Domain 1 re-reads its line $\implies$ **L3 CACHE HIT!**

$$T_{\text{read\_ConfigB}} = T_{\text{L3\_hit}} = \mathbf{36 \text{ CPU Clock Cycles}}$$

In physical nanoseconds:

$$T_{\text{read\_ConfigB\_ns}} = 36 \times 0.3125 \text{ ns} = \mathbf{11.25 \text{ Nanoseconds}}$$

```text
DOMAIN 1 READ LATENCY COMPARISON

 System Configuration            │ Read Outcome in Set 42 │ Measured Read Latency
─────────────────────────────────┼────────────────────────┼───────────────────────
 Config A (CAT Disabled - Shared)│ L3 Cache MISS (DRAM)   │ 216 Cycles (67.50 ns)
 Config B (CAT Enabled - Locked) │ L3 Cache HIT           │  36 Cycles (11.25 ns)
 (Way Locking prevented Domain 0 from evicting Domain 1's cache line!)
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against system principles:

1. **Cache Geometry Invariant Check**:
   * Total L3 size $= 16\text{ MB} = 16,777,216\text{ bytes}$.
   * Line size $= 64\text{ B}$, Associativity $= 16$.
   * $S_{\text{total}} = 16,777,216 / (64 \times 16) = 16,384\text{ sets}$. $16,384 = 2^{14} \implies 14$ index bits ($[19:6]$). Math verified!
2. **Way Bitmask Disjointness Check**:
   * $\text{CBM}[0] = \text{0x00FF} = 0000000011111111_2$.
   * $\text{CBM}[1] = \text{0xFF00} = 1111111100000000_2$.
   * $\text{CBM}[0] \ \& \ \text{CBM}[1] = 0x00FF \ \& \ 0xFF00 = 0x0000 \implies$ Disjoint bitmasks verified!
3. **Mutual Information Zeroization**:
   * $T_1(X_0=1) = 36\text{ cycles}$, $T_1(X_0=0) = 36\text{ cycles}$.
   * Timing delta $\Delta T = 36 - 36 = 0\text{ cycles}$.
   * $I(T_1 ; X_0) \equiv 0.0000\text{ bits}$. Zero side-channel leakage mathematically proven!

All 16-MB L3 cache geometry equations, Intel CAT capacity bitmask bitwise operations, Pseudo-LRU way masking restrictions, and $0.0000\text{-bit}$ mutual information proofs evaluate with 100% mathematical, physical, and microarchitectural precision.

