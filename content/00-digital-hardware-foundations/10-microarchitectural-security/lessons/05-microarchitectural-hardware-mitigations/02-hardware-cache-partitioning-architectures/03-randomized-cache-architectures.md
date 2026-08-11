content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/05-microarchitectural-hardware-mitigations/02-hardware-cache-partitioning-architectures/03-randomized-cache-architectures.md
# Randomized Cache Architectures and Dynamic Cache Set Permutation Mechanics

In modern set-associative processor cache hierarchies, the memory execution engine maps physical memory addresses to internal cache set rows using **Deterministic Static Indexing**. The CPU's hardware cache controller simply extracts a fixed, un-encrypted contiguous block of physical address bits—such as bits $[17:6]$ of a $64\text{-bit}$ physical memory address—to select one of $S$ cache set rows within a Level 2 or Level 3 cache array. Because this mapping function is completely linear and fixed in silicon, an unprivileged attacker process can mathematically calculate or empirically discover which physical memory addresses map to the exact same cache set row. By allocating a collection of private memory addresses that collide on the same set index, the attacker constructs an **Eviction Set**. The attacker then executes cache side-channel attacks—such as Prime+Probe or Flush+Reload—to systematically evict victim memory lines, observe cache replacement events, and reconstruct secret cryptographic keys and private user data. While static hardware way-locking (such as Intel CAT or ARM MPAM) can isolate cache ways, it statically reduces the available cache capacity for all software domains, degrading overall system execution performance. To permanently eliminate eviction set construction and prevent cache side-channel attacks while preserving $100\%$ of available cache capacity for all software tasks, computer architects developed **Randomized Cache Architectures**—most notably **CEASER (Randomized Cache Indexing)** and **ScatterCache**. By inserting an ultra-fast, keyed cryptographic cipher block (such as PRINCE, QARMA, or LowMC) into the cache indexing pipeline, a randomized cache applies **Dynamic Cache Set Permutation**. The physical memory address is combined with a secret, hardware-generated random key ($K_{\text{random}}$) and the executing domain's Security ID to dynamically permute the address-to-set mapping. Under randomized indexing, physical addresses that are contiguous or aligned in DRAM map to completely random, unpredictable cache set rows for different security domains. Furthermore, in ScatterCache, each physical way within a set row uses a distinct cryptographic permutation key! As a result, the mathematical probability of an attacker finding $N$ addresses that collide with a victim line collapses to random chance ($S^{-N}$), increasing the computational complexity of eviction set construction from linear time $O(N)$ to exponential time $O(S^N)$, rendering cache side-channel attacks physically impossible in silicon.

```text
DETERMINISTIC VS RANDOMIZED CACHE SET INDEXING

 DETERMINISTIC STATIC INDEXING (TRADITIONAL CACHE - VULNERABLE)
 Physical Address A_phys [63:0] ──► Extract Bits [17:6] ──► Fixed Set Index I
 Address 0x8000_1000 ──► Set Index 42 (ALWAYS Set 42 for ALL Processes!)
 Address 0x8000_2000 ──► Set Index 42 (EVICTION SET CONSTRUCTION IS EASY!)

 RANDOMIZED DYNAMIC INDEXING (SCATTERCACHE / CEASER - 100% SECURE)
 Physical Address A_phys + Security Domain ID + Hardware Key K_random
                                │
                                ▼
 [ Ultra-Fast Keyed Block Cipher Q_K ] (PRINCE / QARMA / LowMC)
                                │
                                ▼
 Pseudo-Random Permutated Set Index I_random (Different for every Domain!)
 Process A (Domain 0): Address 0x8000_1000 ──► Set Index 17
 Process B (Domain 1): Address 0x8000_1000 ──► Set Index 53 (NO COLLISION!)
```

---

## The Shuffled Mailbox Wall and the Secret Rolling Cipher

To build an intuitive, crystal-clear mental model of how randomized cache architectures operate and why dynamic cache set permutation destroys eviction set construction, let us consider an everyday analogy: a central mailbox system in a large apartment complex.

Imagine a large apartment building (a Physical CPU Core) housing several tenants (Security Domains / Processes) and an untrusted, nosey neighbor (the Attacker Process).

In the lobby of the building hangs a central wall of mailboxes (The Shared Level 2 / Level 3 Cache Array). The mailbox wall consists of 64 horizontal rows (Cache Sets $0 \dots 63$). Each row contains 8 individual mailbox slots (8 Cache Ways).

```text
THE APARTMENT MAILBOX WALL ANALOGY

 Central Mailbox Wall (Shared L2/L3 Cache)
 Row 00 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 Row 01 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 ...
 Row 63 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 (Total 64 Rows / Cache Sets, each holding 8 Mailbox Slots / Ways)
```

Under traditional, deterministic caching:
* The mailbox row index is strictly fixed based on apartment numbers. Room #100 always maps to Row 0. Room #101 always maps to Row 1. Room #164 always maps to Row 0!
* Tenant B (the nosey neighbor / attacker) wants to spy on Tenant A (in Room #100).
* Tenant B knows the deterministic formula: *"Tenant A's mail ALWAYS goes into Row 0!"*
* Tenant B rents 8 apartments whose room numbers also map to Row 0 (creating an **Eviction Set**). Tenant B fills all 8 slots of Row 0 with their own junk mail.
* When Tenant A receives a letter in Row 0, one of Tenant B's junk letters is pushed out onto the floor. Tenant B returns, sees their junk letter on the floor, and measures how long it takes to pick it up (**Prime+Probe Attack**)!
* Tenant B discovers Tenant A's private reading habits without ever opening Tenant A's mailbox!

```text
TRADITIONAL DETERMINISTIC CACHE INDEXING

 Room #100 (Tenant A) ──► Fixed Formula ──► ALWAYS Maps to Row 0
 Room #164 (Tenant B) ──► Fixed Formula ──► ALWAYS Maps to Row 0
 (Tenant B easily constructs a set of 8 room numbers that ALL map to Row 0!)
```

---

### The Randomized Solution: The Rolling Cipher Sorter (ScatterCache / CEASER)

To permanently eliminate this surveillance vulnerability without reducing the number of mailboxes available to tenants, the building owner installs an automated **Keyed Cryptographic Sorter (The Hardware Permutation Engine)** at the front door:

1. **The Secret Hardware Key ($K_{\text{random}}$)**:
   Every morning when the building opens, the owner generates a fresh, secret random key ($K_{\text{random}}$). The key is stored inside the sorter's internal memory and is **never revealed to any tenant or manager**.
2. **Domain-Specific Cryptographic Mapping**:
   When a letter arrives for Room #100, the automated sorter feeds three inputs into its internal high-speed cipher engine:
   $$\text{Mailbox Row Index} = \text{Cipher}_{K_{\text{random}}}(\text{Room \#}, \ \text{Tenant ID}, \ \text{Slot Index})$$
   * For Tenant A (Domain 0), Room #100 is cryptographically permuted and maps to **Row 47**!
   * When Tenant B (the nosey neighbor) tries to find room numbers that map to Row 47, Tenant B feeds their own room numbers into the sorter. But because the cipher includes Tenant B's unique Tenant ID, Tenant B's room numbers map to **completely different random rows** (Row 12, Row 53, Row 3)!
3. **ScatterCache Way Permutation (Slot-Dependent Keys)**:
   To make spying completely impossible, the sorter applies a different cipher key for each individual slot within the row!
   * Slot 0 uses Key Permutation 0.
   * Slot 1 uses Key Permutation 1.
   * Slot 2 uses Key Permutation 2.
4. **Periodic Key Rekeying**:
   Before Tenant B can test even a tiny fraction of the $64^8 = 281,474,976,710,656$ possible row combinations, the building owner automatically **re-keys the sorter ($K_{\text{new}}$)**, instantly re-shuffling all mailbox row mappings across the building!

```text
RANDOMIZED DYNAMIC INDEXING (SCATTERCACHE)

 Tenant A Letter (Room #100 + Tenant A ID) ──► Cipher Engine ──► Maps to Row 47
 Tenant B Letter (Room #100 + Tenant B ID) ──► Cipher Engine ──► Maps to Row 12
 (Tenant B's room numbers CANNOT be used to target Tenant A's mailbox row!)
```

Look at what this randomized architecture achieved:
* **$100\%$ Full Cache Capacity Preserved**: All 64 rows and all 8 slots remain available to all tenants. No cache ways were locked or wasted!
* **Zero Deterministic Mapping**: Physical address alignment provides zero information about which cache set row a memory line will occupy.
* **Combinatorial Impossibility**: Building an eviction set requires testing $S^N$ random combinations, which takes years to compute.
* **Side-channel attacks are rendered physically impossible in silicon!**

This shuffled mailbox scenario is the exact physical analogue of **Randomized Cache Architectures**:
* The apartment building is the **Physical CPU Core**.
* Tenant A is **The Secure Enclave / Victim Process**.
* Tenant B is **The Untrusted Tenant / Attacker Process**.
* The central mailbox wall is the **Shared Level 2 / Level 3 Cache Array**.
* The 64 rows are **Cache Set Indices ($0 \dots 63$)**.
* The 8 slots per row are **Physical Cache Ways ($W_0 \dots W_7$)**.
* The automated sorter is the **Inline Hardware Cipher Engine (PRINCE / QARMA / LowMC)**.
* The secret random key is **The Ephemeral Hardware Key ($K_{\text{random}}$)**.
* Re-shuffling the mapping every morning is **Periodic Hardware Rekeying**.

---

## The Mathematics of Deterministic vs. Keyed Cryptographic Cache Indexing

To understand why traditional caches are vulnerable to eviction set construction and how randomized caches eliminate this threat, we must evaluate the mathematical indexing functions used by cache controllers.

### 1. Deterministic Static Indexing (Standard Cache Architecture)

In a conventional $N$-way set-associative cache with $S$ cache set rows and $64\text{-byte}$ cache lines, the cache controller extracts the Set Index $I_{\text{static}}$ using a simple, un-encrypted bitwise shift and mask operation:

$$\mathbf{I_{\text{static}}(A_{\text{phys}}) = \left( A_{\text{phys}} \gg 6 \right) \ \& \ (S - 1)}$$

Where:
* $A_{\text{phys}}$ is the 64-bit physical memory address.
* $\gg 6$ drops the lowest 6 bits (Line Offset bits $[5:0]$ for $64\text{-byte}$ lines).
* $S$ is the total number of cache sets (e.g., $S = 2,048 = 2^{11}$).
* $\&$ is the bitwise AND operator.

```text
DETERMINISTIC INDEXING BIT EXTRACTION

 64-Bit Physical Address A_phys
 Bit 63                                     Bit 17 Bit 16     Bit 6 Bit 5     Bit 0
 ┌────────────────────────────────────────────────┬────────────────┬──────────────┐
 │ Physical Tag Field (46 Bits)                   │ Set Index (11b)│ Offset (6b)  │
 └────────────────────────────────────────────────┴────────────────┴──────────────┘
  (Set Index is extracted directly from bits [16:6] with ZERO encryption!)
```

#### Why Deterministic Indexing Enables Eviction Sets ($O(N)$ Complexity):
Because $I_{\text{static}}$ depends purely on physical address bits $[16:6]$:
* Any two physical memory addresses that share the exact same bits $[16:6]$ will **ALWAYS map to the exact same cache set $I_{\text{static}}$**.
* An attacker process allocating a contiguous memory buffer can find $N$ colliding addresses in linear time $O(N)$ simply by selecting addresses separated by $S \times 64\text{ bytes}$ (e.g., $2,048 \times 64 = 131,072\text{ bytes} = 128\text{ KB}$):

$$A_k = A_0 + (k \times S \times 64 \text{ Bytes}) \implies \mathbf{I_{\text{static}}(A_k) \equiv I_{\text{static}}(A_0) \quad (\forall k \in [0, N-1])}$$

Finding $N$ colliding addresses to form an Eviction Set $E_S$ takes less than **$1\text{ millisecond}$** on a standard CPU!

---

### 2. Keyed Cryptographic Cache Indexing (CEASER Architecture)

The **CEASER (CEASER / CEASER-S)** architecture replaces the linear bit-extraction function with an ultra-fast, hardware-embedded **Keyed Cryptographic Permutation Engine**:

$$\mathbf{I_{\text{CEASER}}(A_{\text{phys}}) = Q_{K_{\text{random}}}\left( A_{\text{phys}} \gg 6 \right) \pmod S}$$

Where:
* $A_{\text{phys}} \gg 6$ is the physical cache line address ($A_{\text{line}}$).
* $K_{\text{random}}$ is a $128\text{-bit}$ secret random key generated by an on-die hardware True Random Number Generator (TRNG) at boot-up.
* $Q_{K}$ is a low-latency, lightweight hardware block cipher (such as PRINCE or LowMC) that completes its permutation in **$1\text{ single clock cycle}$ ($0.3125\text{ ns}$)**.
* $S$ is the total number of cache sets.

```text
CEASER KEYED INDEXING PIPELINE

 Physical Line Address A_line (A_phys >> 6) + Hardware Random Key K_random
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ ULTRA-LOW-LATENCY CIPHER ENGINE (PRINCE / QARMA / LowMC)    │
 │ Computes Pseudorandom Block Permutation in 1 Clock Cycle!  │
 └─────────────┬───────────────────────────────────────────────┘
               │ 64-Bit Encrypted Block Output
               ▼
 Modulo S Reduction ──► Pseudo-Random Set Index I_CEASER (0 to S - 1)
```

#### The Pseudorandom Property of CEASER:
Because $Q_K$ is a cryptographically strong permutation cipher:
* The output index $I_{\text{CEASER}}$ is **statistically independent and uniformly distributed** across all $S$ cache sets.
* Physical address alignment provides **zero information** about which cache set row a memory line will occupy.
* An attacker cannot calculate colliding addresses mathematically. To find $N$ colliding addresses, the attacker must test random addresses empirically!

---

## ScatterCache: Way-Dependent Index Hashing

While CEASER randomizes set indices across the cache, all $N$ ways within a given set row still share the same set index $I_{\text{CEASER}}$.

To achieve ultimate side-channel immunity, security researchers developed **ScatterCache**.

> **ScatterCache** is a randomized cache architecture where **each physical way $w \in [0, N-1]$ within the cache array uses a completely independent, distinct set index permutation function $I_w$!**

```text
SCATTERCACHE WAY-DEPENDENT INDEXING ARCHITECTURE

 Physical Address A_phys + Security Domain ID + Way Index w
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ SCATTERCACHE MULTI-KEY PERMUTATION ENGINE                   │
 │ Way 0 Index: I_0 = Q_K(A_phys | Domain_ID | w=0) mod S     │
 │ Way 1 Index: I_1 = Q_K(A_phys | Domain_ID | w=1) mod S     │
 │ ...                                                         │
 │ Way N-1 Index: I_N-1 = Q_K(A_phys | Domain_ID | w=N-1) mod S│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Line A is scattered across DIFFERENT SET ROWS in DIFFERENT WAYS!
 (Way 0 in Set 12 | Way 1 in Set 48 | Way 2 in Set 3 ... Way 7 in Set 59)
```

### How ScatterCache Scatters Memory Lines Across the Cache Array

In a standard cache, a physical address $A$ maps to a single set row $S_k$, and can occupy any of the $N$ ways within row $S_k$.

In ScatterCache, a physical address $A$ belonging to Domain $D$ is **scattered across $N$ completely different set rows**:

$$I_w(A, D) = Q_K\left( (A \gg 6) \ \mid \ D \ \mid \ w \right) \pmod S \quad (\forall w \in [0, N-1])$$

Where:
* $I_w(A, D)$ is the set index row where address $A$ can be placed in **Way $w$**.
* $D$ is the unique Security Domain ID (e.g., Process ID or Enclave ID) of the executing thread.
* $w \in [0, N-1]$ is the physical way index ($0 \dots 7$ for an 8-way cache).

```text
SCATTERCACHE LINE LOCATION EXAMPLE

 Target Memory Address A (Domain 0):
 * Way 0 Slot Location : Cache Set Index 12
 * Way 1 Slot Location : Cache Set Index 48
 * Way 2 Slot Location : Cache Set Index 3
 * Way 3 Slot Location : Cache Set Index 59
 ...
 (Address A does NOT belong to a single set row! It is scattered across 8 random sets!)
```

---

### The Combinatorial Impossibility of Eviction Set Construction under ScatterCache

Now, observe what happens when an attacker process (Domain $D_{\text{att}}$) attempts to construct an Eviction Set targeting a victim address $A_{\text{vic}}$ (belonging to Domain $D_{\text{vic}}$):

To evict $A_{\text{vic}}$ from cache, the attacker must find $N$ private memory addresses ($X_0, X_1, \dots X_{N-1}$) that **simultaneously collide with $A_{\text{vic}}$ across all $N$ scattered ways**:

$$\text{Collision Condition for Way } w: \quad I_w(X_k, D_{\text{att}}) \ \stackrel{?}{=} \ I_w(A_{\text{vic}}, D_{\text{vic}})$$

Because $D_{\text{att}} \neq D_{\text{vic}}$ and $Q_K$ is a cryptographic block cipher, the probability $P_{\text{way}}$ of a single candidate address $X_k$ colliding with $A_{\text{vic}}$ in Way $w$ is the uniform probability over $S$ sets:

$$P_{\text{way}} = \frac{1}{S}$$

For $A_{\text{vic}}$ to be fully evicted from an $N$-way set-associative cache, the attacker must achieve a **full $N$-way collision simultaneously across all $N$ independent ways**:

$$\mathbf{P(\text{Full } N\text{-Way Eviction Collision}) = \prod_{w=0}^{N-1} P_{\text{way}} = \left( \frac{1}{S} \right)^N = S^{-N}}$$

```text
EVICITON SET COLLISION PROBABILITY SPECTRUM

 Cache Sets S = 2,048 | Associativity N = 8 Ways
 ┌─────────────────────────────────────────────────────────────┐
 │ Traditional Deterministic Cache : P(Collision) = 1.0        │
 │ (100% Deterministic! Eviction set built in 1 millisecond!) │
 ├─────────────────────────────────────────────────────────────┤
 │ ScatterCache Randomized Cache  : P(Collision) = 2,048^-8    │
 │ P(Collision) = 3.23 x 10^-27  (2^-88 Probability!)          │
 └─────────────────────────────────────────────────────────────┘
  (Eviction set construction is PHYSICALLY IMPOSSIBLE in silicon!)
```

Let us evaluate $S^{-N}$ for a typical $8\text{-way}$ set-associative cache with $S = 2,048\text{ sets}$:

$$P(\text{Full Collision}) = (2048)^{-8} = (2^{11})^{-8} = 2^{-88} \approx \mathbf{3.23 \times 10^{-27}}$$

#### The Physical Result:
The probability of an attacker finding a valid $8\text{-way}$ eviction set by random sampling is **$2^{-88}$**!

To find one single eviction set, the attacker would need to execute over **$300,000,000,000,000,000,000,000,000$ memory accesses**, requiring millions of years of continuous CPU computation!

Eviction set construction is rendered **combinatorially impossible in hardware!**

---

## Dynamic Hardware Rekeying and Cache Relocation Protocols

While the probability of constructing an eviction set under ScatterCache is $2^{-88}$, in CEASER (where all ways share a single set index $I_{\text{CEASER}}$), an attacker testing millions of addresses per second could eventually find $N$ colliding addresses after several hours of continuous probing.

To bound the attacker's search time permanently, randomized cache architectures implement **Dynamic Hardware Rekeying**.

```text
PERIODIC HARDWARE REKEYING & CACHE RELOCATION

 Memory Access Counter reaches Rekey Interval (M_accesses = 10,000,000)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ DYNAMIC HARDWARE REKEYING ENGINE                            │
 │ 1. TRNG generates new random key: K_new                     │
 │ 2. Instantiates Background Cache Relocation Engine          │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Gradually re-hashes existing lines from K_old to K_new
 Cache lines moved from I_old = Q_Kold(A) to I_new = Q_Knew(A) in background!
 Attacker's partially built eviction set is INSTANTLY DESTROYED!
```

---

### The Dynamic Rekeying Lifecycle

1. **The Rekey Interval ($M_{\text{accesses}}$)**: The hardware memory controller maintains a global access counter. Every $M_{\text{accesses}}$ memory requests (e.g., every $10,000,000\text{ accesses} \approx 100\text{ milliseconds}$), the hardware triggers a **Rekey Event**.
2. **Generating $K_{\text{new}}$**: The on-die TRNG generates a fresh random key $K_{\text{new}}$.
3. **The Background Relocation Engine**:
   * The hardware cache controller initiates a background migration loop.
   * As cache lines are accessed or gradually evicted, the controller reads line $A$ from old set index $I_{\text{old}} = Q_{K_{\text{old}}}(A)$ and re-hashes it to new set index $I_{\text{new}} = Q_{K_{\text{new}}}(A)$.
4. **Attacker Reset**: Any partial progress the attacker made over the last 100 milliseconds toward finding colliding addresses is **completely wiped out**! The entire address-to-set mapping space is re-shuffled, resetting the attacker's search progress back to zero!

$$\text{Max Attacker Probe Window} \le \text{Period}_{\text{rekey}} \approx 100 \text{ Milliseconds}$$

Because constructing even a partial eviction set requires hours of probing, resetting the mapping every 100 milliseconds guarantees $100\%$ zero side-channel leakage over infinite execution time!

---

## Architecture Comparison: Static Way Locking vs. Randomized Mapping

It is crucial for microarchitectural security engineers to compare the two primary hardware mitigations for cache side-channel attacks:

```text
STATIC WAY LOCKING VS RANDOMIZED CACHE MAPPING

 Mitigation Property        │ Static Way Locking (Intel CAT / MPAM) │ Randomized Mapping (ScatterCache/CEASER)
────────────────────────────┼───────────────────────────────────────┼──────────────────────────────────────────
 Security Mechanism         │ Hard partition of cache ways          │ Cryptographic cipher index permutation
 Side-Channel Immunity      │ 100% (Disjoint Way Bitmasks)          │ 100% (Combinatorial $S^{-N}$ Impossibility)
 Cache Capacity Preservation │ REDUCED (Ways are locked/partitioned) │ 100% PRESERVED (All ways open to all!)
 Software Changes Required  │ Requires OS/Hypervisor CLOS management│ ZERO! 100% Transparent to Software!
 Silicon Hardware Area      │ Minimal (MSR bitmask registers)       │ Medium (Inline PRINCE/QARMA Ciphers)
 Index Latency Overhead     │ 0 Clock Cycles                        │ 1 Clock Cycle (Cipher Pipeline Delay)
```

```text
KEY ARCHITECTURAL TRADE-OFFS

 1. Static Way Locking (Intel CAT / ARM MPAM):
    * Ideal for real-time systems where strict capacity reservation is desired.
    * Weakness: Reduces available cache size per domain (e.g. 16-way cache split into two 8-way partitions).

 2. Randomized Cache Mapping (ScatterCache / CEASER):
    * Ideal for general-purpose cloud servers and multi-tenant desktop CPUs.
    * Advantage: Preserves 100% of available cache capacity for all software processes!
    * Weakness: Adds a small 1-cycle latency delay to the cache lookup pipeline for cipher evaluation.
```

---

## Solved Industrial Engineering Exercise: Quantitative CEASER/ScatterCache Index Permutation, Eviction Set Collision Math, and Rekeying Interval Bounds

To consolidate your complete mastery of randomized cache architectures, PRINCE/QARMA cipher index hashing, ScatterCache way-dependent permutations, and $S^{-N}$ collision probability derivations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal hardware security architect designing a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The CPU operates a shared Level 3 (L3) cache array with the following physical parameters:
* **L3 Cache Total Size**: $8\text{-Megabytes}$ ($8,388,608\text{ bytes}$).
* **Cache Line Size**: $64\text{ bytes}$ ($2^6 = 64$).
* **Associativity**: $8\text{-way set-associative}$ ($N = 8$).
* **Processor Clock Frequency**: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
* **L1 Data Cache Hit Latency**: $T_{\text{L1D\_hit}} = 4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* **L3 Shared Cache Hit Latency**: $T_{\text{L3\_hit}} = 36\text{ CPU Clock Cycles}$ ($11.25\text{ ns}$).
* **Main DRAM Miss Latency**: $T_{\text{DRAM\_miss}} = 180\text{ CPU Clock Cycles}$ ($56.25\text{ ns}$).

```text
3.2 GHz PROCESSOR WITH 8 MB 8-WAY RANDOMIZED L3 CACHE

 Shared L3 Cache: 8 MB Total Size | Line Size = 64B | Associativity N = 8
 Hit Latency: L1D = 4 Cycles, L3 = 36 Cycles, DRAM = 180 Cycles
 Clock T = 312.5 ps
```

The processor features a **ScatterCache** randomized cache controller using a 1-cycle PRINCE cipher pipeline for way-dependent index permutations.

An attacker process attempts to construct an 8-way Eviction Set $E_x$ targeting a victim address $A_{\text{victim}} = \mathbf{\text{0x0000\_7FFF\_8000\_1000}}$.

#### Your Objective

1. Calculate the total number of cache sets ($S_{\text{total}}$) in the 8-MB L3 cache array.
2. Calculate the probability $P_{\text{single\_collision}}$ that a single random candidate address $X_k$ collides with victim address $A_{\text{victim}}$ in a **single specific way $w$**:
   * Under standard deterministic indexing.
   * Under ScatterCache randomized indexing.
3. Calculate the total probability $P_{\text{full\_eviction}}$ that a set of 8 random candidate addresses simultaneously collides with $A_{\text{victim}}$ across **all 8 scattered ways** in ScatterCache.
4. Calculate the expected number of memory probing attempts ($N_{\text{attempts}}$) required for the attacker to discover a valid 8-way eviction set under ScatterCache.
5. If the attacker can execute $10,000,000\text{ memory probes per second}$ ($10\text{ MHz}$ probe rate), calculate the total physical time (in years) required to construct one valid eviction set under ScatterCache.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Total Cache Sets ($S_{\text{total}}$)

##### 1. Total Number of Cache Lines ($N_{\text{lines}}$):

$$N_{\text{lines}} = \frac{\text{L3 Cache Size}}{\text{Line Size}} = \frac{8,388,608 \text{ Bytes}}{64 \text{ Bytes/Line}} = \mathbf{131,072 \text{ Cache Lines}}$$

##### 2. Total Number of Cache Sets ($S_{\text{total}}$):
Given associativity $N = 8$:

$$S_{\text{total}} = \frac{N_{\text{lines}}}{\text{Associativity}} = \frac{131,072}{8} = \mathbf{16,384 \text{ Cache Sets}}$$

Since $S_{\text{total}} = 16,384 = 2^{14}$, the L3 cache contains **$16,384\text{ cache set rows}$**.

---

#### Step 2: Calculate Single-Way Collision Probability ($P_{\text{single\_collision}}$)

##### 1. Under Standard Deterministic Indexing:
Under deterministic indexing, the set index is extracted directly from physical address bits $[19:6]$.
* If the attacker selects an address $X_k$ matching bits $[19:6]$ of $A_{\text{victim}}$:
  $$P_{\text{single\_collision\_deterministic}} = \mathbf{1.0000 \quad (100\% \text{ Deterministic Collision!})}$$

##### 2. Under ScatterCache Randomized Indexing:
ScatterCache computes $I_w = Q_K(A_{\text{line}} \mid \text{Domain\_ID} \mid w) \pmod{16384}$.
Because $Q_K$ is a pseudorandom permutation cipher, $I_w$ is uniformly distributed across all $16,384$ sets:

$$P_{\text{single\_collision\_ScatterCache}} = \frac{1}{S_{\text{total}}} = \frac{1}{16,384} \approx \mathbf{0.000061035 \quad (0.0061\% \text{ Probability})}$$

---

#### Step 3: Calculate Full 8-Way Eviction Collision Probability ($P_{\text{full\_eviction}}$)

To evict $A_{\text{victim}}$ from an 8-way ScatterCache, an attacker must find 8 candidate addresses that simultaneously collide with $A_{\text{victim}}$ across all 8 independent way permutations ($w \in [0, 7]$).

Since each way permutation $I_w$ uses an independent tweak evaluation:

$$P_{\text{full\_eviction}} = \prod_{w=0}^{7} P_{\text{single\_collision}} = \left( \frac{1}{S_{\text{total}}} \right)^8 = \left( \frac{1}{16,384} \right)^8 = (2^{14})^{-8} = \mathbf{2^{-112}}$$

In decimal representation:

$$P_{\text{full\_eviction}} = 2^{-112} \approx \mathbf{1.926 \times 10^{-34}}$$

```text
SCATTERCACHE COLLISION PROBABILITY EVALUATION

 Architecture Class           │ Single-Way Collision Prob │ Full 8-Way Eviction Prob (P_full)
──────────────────────────────┼───────────────────────────┼───────────────────────────────────
 Standard Deterministic Cache │ 1.0000 (100% Certain)     │ 1.0000 (100% Certain - 1 ms)
 ScatterCache (Randomized)    │ 0.000061035 (1 / 16,384)  │ 2^-112 = 1.926 x 10^-34 !
 (Probability of full 8-way eviction collapses to 2^-112 in silicon!)
```

---

#### Step 4: Calculate Expected Probing Attempts ($N_{\text{attempts}}$)

The expected number of random probing attempts required to discover a valid 8-way eviction set is the reciprocal of $P_{\text{full\_eviction}}$:

$$N_{\text{attempts}} = \frac{1}{P_{\text{full\_eviction}}} = \frac{1}{2^{-112}} = 2^{112} \approx \mathbf{5.192 \times 10^{33} \text{ Probing Attempts}}$$

---

#### Step 5: Calculate Physical Time Required to Build an Eviction Set ($T_{\text{bruteforce}}$)

Given an aggressive probing rate of $10,000,000\text{ probes/second}$ ($10^7\text{ probes/sec}$):

$$\text{Time in Seconds } T_{\text{sec}} = \frac{5.192 \times 10^{33} \text{ probes}}{10^7 \text{ probes/sec}} = \mathbf{5.192 \times 10^{26} \text{ Seconds}}$$

Convert seconds to years ($1\text{ year} \approx 31,536,000\text{ seconds} = 3.1536 \times 10^7\text{ s}$):

$$T_{\text{years}} = \frac{5.192 \times 10^{26} \text{ s}}{3.1536 \times 10^7 \text{ s/year}} \approx \mathbf{1.646 \times 10^{19} \text{ Years!}}$$

```text
EVICTION SET CONSTRUCTION TIME COMPARISON

 Cache Architecture Class     │ Required Probing Attempts │ Time to Build Eviction Set
──────────────────────────────┼───────────────────────────┼───────────────────────────────
 Standard Deterministic Cache │ ~16 Probes                │ 0.000001 Seconds (1 microsec)
 ScatterCache Randomized      │ 2^112 Probes              │ 1.646 x 10^19 Years! (16.4 Quintillion Yrs)
 (Eviction set construction is physically impossible within the lifetime of the universe!)
```

##### Microarchitectural Security Conclusion:
Under ScatterCache, constructing a single 8-way eviction set requires **$1.646 \times 10^{19}\text{ years}$ ($16.4\text{ quintillion years}$)** of continuous probing!

Cache side-channel attacks (Prime+Probe and Flush+Reload) are **$100\%$ physically eliminated in hardware!**

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against cache design principles:

1. **L3 Cache Geometry Verification**:
   * Size $= 8\text{ MB} = 8,388,608\text{ bytes}$.
   * Line size $= 64\text{ B}$, Associativity $= 8$.
   * $S_{\text{total}} = 8,388,608 / (64 \times 8) = 16,384\text{ sets}$. $16,384 = 2^{14} \implies 14\text{ bits}$. Math verified!
2. **ScatterCache Way Invariant Check**:
   * Each way $w \in [0, 7]$ uses an independent key permutation $I_w$.
   * $P(\text{Full Collision}) = (1/S)^N = (1/16384)^8 = (2^{14})^{-8} = 2^{-112}$.
   * $2^{-112} \approx 1.926 \times 10^{-34}$. Combinatorial probability math verified with $100\%$ precision!
3. **Physical Time Calculation Verification**:
   * $2^{112} / 10^7\text{ probes/s} = 5.192 \times 10^{26}\text{ seconds}$.
   * $5.192 \times 10^{26} / 31,536,000 = 1.646 \times 10^{19}\text{ years}$. Physical time math verified!

All 8-MB L3 cache geometry calculations, ScatterCache way-dependent permutation formulas, $2^{-112}$ eviction collision probabilities, and $1.646 \times 10^{19}\text{-year}$ physical security bounds evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Randomized cache mapping (ScatterCache / CEASER)**: A microarchitectural hardware security architecture that replaces deterministic linear cache set indexing with ultra-fast, keyed cryptographic block ciphers (PRINCE / QARMA / LowMC), dynamically permuting physical address-to-set mappings to eliminate address-alignment side channels.
* **Dynamic cache set permutation**: The physical hardware process where an on-die cryptographic permutation engine combines physical memory addresses with an ephemeral hardware random key ($K_{\text{random}}$) and security domain IDs to scatter memory lines pseudorandomly across cache set rows, increasing eviction set construction complexity to $O(S^N)$ and rendering cache timing attacks impossible in silicon.
