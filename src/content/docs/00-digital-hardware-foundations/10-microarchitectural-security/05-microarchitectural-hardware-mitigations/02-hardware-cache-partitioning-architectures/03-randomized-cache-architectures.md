---
title: "Randomized Cache Architectures and Dynamic Cache Set Permutation Mechanics"
---

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


### The Dynamic Rekeying Lifecycle

1. **The Rekey Interval ($M_{\text{accesses}}$)**: The hardware memory controller maintains a global access counter. Every $M_{\text{accesses}}$ memory requests (e.g., every $10,000,000\text{ accesses} \approx 100\text{ milliseconds}$), the hardware triggers a **Rekey Event**.
2. **Generating $K_{\text{new}}$**: The on-die TRNG generates a fresh random key $K_{\text{new}}$.
3. **The Background Relocation Engine**:
   * The hardware cache controller initiates a background migration loop.
   * As cache lines are accessed or gradually evicted, the controller reads line $A$ from old set index $I_{\text{old}} = Q_{K_{\text{old}}}(A)$ and re-hashes it to new set index $I_{\text{new}} = Q_{K_{\text{new}}}(A)$.
4. **Attacker Reset**: Any partial progress the attacker made over the last 100 milliseconds toward finding colliding addresses is **completely wiped out**! The entire address-to-set mapping space is re-shuffled, resetting the attacker's search progress back to zero!

$$\text{Max Attacker Probe Window} \le \text{Period}_{\text{rekey}} \approx 100 \text{ Milliseconds}$$

Because constructing even a partial eviction set requires hours of probing, resetting the mapping every 100 milliseconds guarantees $100\%$ zero side-channel leakage over infinite execution time!


## Solved Industrial Engineering Exercise: Quantitative CEASER/ScatterCache Index Permutation, Eviction Set Collision Math, and Rekeying Interval Bounds

To consolidate your complete mastery of randomized cache architectures, PRINCE/QARMA cipher index hashing, ScatterCache way-dependent permutations, and $S^{-N}$ collision probability derivations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Total Cache Sets ($S_{\text{total}}$)

##### 1. Total Number of Cache Lines ($N_{\text{lines}}$):

$$N_{\text{lines}} = \frac{\text{L3 Cache Size}}{\text{Line Size}} = \frac{8,388,608 \text{ Bytes}}{64 \text{ Bytes/Line}} = \mathbf{131,072 \text{ Cache Lines}}$$

##### 2. Total Number of Cache Sets ($S_{\text{total}}$):
Given associativity $N = 8$:

$$S_{\text{total}} = \frac{N_{\text{lines}}}{\text{Associativity}} = \frac{131,072}{8} = \mathbf{16,384 \text{ Cache Sets}}$$

Since $S_{\text{total}} = 16,384 = 2^{14}$, the L3 cache contains **$16,384\text{ cache set rows}$**.


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


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Randomized cache mapping (ScatterCache / CEASER)**: A microarchitectural hardware security architecture that replaces deterministic linear cache set indexing with ultra-fast, keyed cryptographic block ciphers (PRINCE / QARMA / LowMC), dynamically permuting physical address-to-set mappings to eliminate address-alignment side channels.
* **Dynamic cache set permutation**: The physical hardware process where an on-die cryptographic permutation engine combines physical memory addresses with an ephemeral hardware random key ($K_{\text{random}}$) and security domain IDs to scatter memory lines pseudorandomly across cache set rows, increasing eviction set construction complexity to $O(S^N)$ and rendering cache timing attacks impossible in silicon.
