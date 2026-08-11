---
title: "Inclusive and Exclusive Cache Inclusion Policies and Invalidation Filtering"
---

# Inclusive and Exclusive Cache Inclusion Policies and Invalidation Filtering

## The Multi-Level Hierarchy Storage Duplication Dilemma

In modern multi-core microprocessors, the memory hierarchy is organized into multiple cascaded levels of Static RAM (SRAM) cache buffers. To bridge the massive latency gap between fast execution gates and slow off-chip main Dynamic RAM (DRAM) memory, processors deploy a multi-level cache structure:

1. **Level 1 (L1) Caches**: Small, ultra-fast private caches ($32\text{ KB}$ to $64\text{ KB}$ per core) operating at full CPU pipeline speeds ($1\text{ to } 4\text{ clock cycles}$).
2. **Level 2 (L2) Caches**: Medium-sized private or shared caches ($512\text{ KB}$ to $1\text{ MB}$ per core) operating at moderate speeds ($10\text{ to } 15\text{ clock cycles}$).
3. **Level 3 (L3) Cache**: A large, shared Last-Level Cache (LLC) spanning $16\text{ MB}$ to $128\text{ MB}$ across all cores on the silicon die ($35\text{ to } 50\text{ clock cycles}$).

When a processor core fetches a 64-byte memory line from main DRAM, how should that line be stored across these multiple, nested levels of memory?

This structural question introduces a major architectural trade-off: **The Multi-Level Cache Inclusion Dilemma**.

```text
THE MULTI-LEVEL CACHE INCLUSION DILEMMA

                  INCLUSIVE CACHE POLICY                 EXCLUSIVE CACHE POLICY
               ┌──────────────────────────┐           ┌──────────────────────────┐
               │ L3 Cache holds DUPLICATES│           │ L3 Cache holds ONLY lines│
               │ of ALL L1/L2 lines.      │           │ NOT currently in L1/L2.  │
               └────────────┬─────────────┘           └────────────┬─────────────┘
                            │                                      │
                            ▼                                      ▼
               Snoop Filtering is EASY!               Maximum Usable Capacity!
               (Check L3 only; L1 shielded)           (Total Cap = L1 + L2 + L3)
                            │                                      │
                            ▼                                      ▼
               Wasted Storage Capacity!               Snoop Filtering Breakdown!
               (L3 duplicates L1/L2 lines)            (Must probe L1/L2 on misses)
```

Hardware architects must choose between two opposing inclusion policies:


### Option 2: The Exclusive Cache Policy (Victim Cache Architecture)
Under an **Exclusive Cache Policy**, the lower-level cache (L3) is strictly forbidden from holding duplicates of lines sitting in upper-level caches (L1 and L2). L3 holds **ONLY lines that have been evicted from L1/L2**!

* **The Massive Advantage (Maximum Usable Capacity)**: Zero memory space is wasted on duplicates! The total usable cache capacity of the computer is the exact sum of all levels:

$$\text{Capacity}_{\text{total}} = \text{Capacity}_{\text{L1}} + \text{Capacity}_{\text{L2}} + \text{Capacity}_{\text{L3}}$$

Where:
* $\text{Capacity}_{\text{total}}$ is the net usable data storage capacity across the entire cache hierarchy.
* $\text{Capacity}_{\text{L1}}$ is the combined capacity of all private L1 caches.
* $\text{Capacity}_{\text{L2}}$ is the combined capacity of all private L2 caches.
* $\text{Capacity}_{\text{L3}}$ is the capacity of the shared L3 cache.

For a 16-core chip with $8\text{ MB}$ total L2 and a $16\text{-MB}$ L3, total usable cache capacity is **$24\text{ Megabytes}$** ($50\%$ more capacity than an inclusive design!).

* **The Coherence Penalty (Snoop Probe Flooding)**: When an external coherence invalidation arrives for address $A$, looking at L3 is not enough! Even if address $A$ is absent from L3, **it might still be sitting inside Core 5's private L1 cache**! The coherence controller is forced to send **Snoop Probes** to interrupt and search the private L1/L2 tag arrays of every core in the chip, causing tag port collisions and stalling CPU execution!

How do computer architects balance multi-level cache storage capacity against coherence snooping filter efficiency? How do **Back-Invalidations** enforce inclusion, and how do **Directory Snoop Filters** protect exclusive caches?

To solve the inclusion dilemma, modern processors employ **Inclusive Caches**, **Exclusive Victim Caches**, and **Non-Inclusive Non-Exclusive (NINE) Hybrid Architectures**.


### Policy 1: The Inclusive Filing Policy (Duplicated Master Copies)

The company board enforces a strict inclusion rule: *"Every single folder sitting on an executive's desk tray MUST have a duplicate master copy sitting inside the Central File Room."*

Look at how this policy behaves during daily operations and audits:

#### 1. Invalidation Filtering (The Easy Audit):
An outside auditor arrives asking for **File #500**.
* The auditor walks directly to the Central File Room and checks the index.
* **File #500 is NOT in the Central File Room!**
* Because of the Inclusion Rule, the auditor knows with $100\%$ certainty that **NO EXECUTIVE has File #500 on their desk either**!
* **The Result**: The auditor leaves immediately. **None of the 16 executives are interrupted!** All 16 executives continue working at full speed without a single distraction (**Snoop Filtering**).

```text
INCLUSIVE SNOOP FILTERING (ZERO EXECUTIVE INTERRUPTIONS)

 Auditor asks for File #500 ──► Checks Central File Room
                                File #500 NOT in File Room!
                                │
                                ▼
         Auditor leaves immediately! ZERO Executives interrupted!
```

#### 2. The Back-Invalidation Constraint (Forced Desk Eviction):
Now, suppose the Central File Room gets full. The file clerk evicts an old folder, **File #42**, from the Central File Room to make space for a new file.

* Because of the Inclusion Rule (*File Room MUST hold copies of all Desk Folders*), the file clerk **CANNOT simply remove File #42 from the File Room**!
* The file clerk MUST walk up to Executive 3's office, interrupt Executive 3, and **forcibly remove File #42 from Executive 3's desk tray** (**Back-Invalidation**)!
* Executive 3 is upset because they were actively reading File #42, but the inclusion rule forced its eviction!

```text
INCLUSIVE BACK-INVALIDATION

 File Room evicts File #42 ──► Clerk walks to Executive 3's Office
                               Forcibly REMOVES File #42 from Desk Tray!
                               (Executive 3 interrupted; working set ruined!)
```


## Primitive 1: The Inclusive Cache Policy and Invalidation Filtering

Now that we possess a clear intuitive mental model of filing rules, let us examine the formal engineering mechanics of **The Inclusive Cache Policy**.

> A multi-level cache hierarchy enforces the **Inclusive Cache Policy** if any memory line stored in an upper-level cache ($L_1$ or $L_2$) is guaranteed to also reside simultaneously in all lower-level caches ($L_3$ Last-Level Cache).

Mathematically, inclusion is expressed as a strict set containment property:

$$\text{Contents}(L_1) \quad \subseteq \quad \text{Contents}(L_2) \quad \subseteq \quad \text{Contents}(L_3)$$

Where:
* $\text{Contents}(L_1)$ is the set of memory line addresses stored in the L1 cache.
* $\text{Contents}(L_2)$ is the set of memory line addresses stored in the L2 cache.
* $\text{Contents}(L_3)$ is the set of memory line addresses stored in the L3 cache.
* $\subseteq$ denotes the subset relation.

```text
INCLUSION SET CONTAINMENT DIAGRAM

 ┌─────────────────────────────────────────────────────────────┐
 │ Shared L3 Cache Contents (16 MB)                            │
 │  ┌──────────────────────────────────────────────────────┐   │
 │  │ Private L2 Cache Contents (512 KB)                   │   │
 │  │  ┌──────────────────────────────────────────────┐    │   │
 │  │  │ Private L1 Cache Contents (32 KB)            │    │   │
 │  │  └──────────────────────────────────────────────┘    │   │
 │  └──────────────────────────────────────────────────────┘   │
 └─────────────────────────────────────────────────────────────┘
  (L1 is a 100% strict subset of L2, which is a strict subset of L3!)
```


### The Back-Invalidation Constraint

While inclusion makes snoop filtering easy, it introduces a severe hardware constraint: **Back-Invalidation Enforcement**.

To maintain the inclusion invariant ($\text{Contents}(L_1) \subseteq \text{Contents}(L_3)$), whenever an inclusive L3 cache is forced to evict a line $A$ due to an L3 capacity or conflict miss:

The L3 cache controller **MUST send an explicit Back-Invalidation signal up the hierarchy to forcibly evict line $A$ from all L1 and L2 private caches**!

$$\text{Line } A \text{ Evicted from } L_3 \implies \text{Send Back-Invalidation } \implies \text{Set } V_{L1}[A] \Leftarrow 0, \quad V_{L2}[A] \Leftarrow 0$$

Where:
* $V_{L1}[A]$ is the Valid bit for line $A$ in the private L1 cache.
* $V_{L2}[A]$ is the Valid bit for line $A$ in the private L2 cache.

```text
INCLUSIVE BACK-INVALIDATION CONSTRAINED EVICTION

 L3 Capacity Miss ──► Evicts Line A from L3
                             │
                             ▼
              Dispatches Back-Invalidation Upward!
                             │
                             ▼
              Forcibly Clears Valid Bit in L1 Cache!
              (Even if L1 core was actively using Line A!)
```

#### The Inclusion Conflict Hazard (Associativity Mismatch)
What happens if the L3 cache has a lower associativity than the combined L1/L2 caches?

Suppose 16 L1/L2 lines all map to the exact same set index inside a 16-way set-associative L3 cache. When a 17th line arrives at that L3 set index:
1. The L3 cache MUST evict one of its 16 lines to make room.
2. The L3 cache issues a **Back-Invalidation** for the evicted line.
3. The evicted line happens to be an active, highly critical loop variable sitting inside Core 0's L1 cache!
4. Core 0's L1 cache is **forced to invalidate its active variable**, causing an immediate L1 cache miss on the very next instruction!

This hazard is called **Inclusion-Induced Cache Thrashing**. To prevent back-invalidations from destroying L1 hit rates, an inclusive L3 cache MUST be designed with **much higher associativity** ($N_{\text{L3}} \ge 16 \text{ or } 24\text{ ways}$) than the upper L1/L2 caches.


### How Exclusive Caches Act as Victim Caches

In an Exclusive Cache hierarchy, lower-level caches (L2 or L3) do **not** fetch data directly from main memory when an L1 read miss occurs.

Instead, lower-level caches operate as **Victim Caches**:

1. **L1 Read Miss on Line $A$**:
   * Line $A$ is fetched from main DRAM memory and written **ONLY into the L1 Cache**.
   * Line $A$ is **NOT placed in L2 or L3**! L2 and L3 remain completely untouched.
2. **L1 Eviction of Line $A$ (Victim Eviction)**:
   * When Line $A$ is later evicted from L1 to make room for a new block, Line $A$ is **pushed down into the L2/L3 Exclusive Cache** (**Victim Swap**)!
   * L2/L3 acts as a storage reservoir for lines that were thrown out of L1!
3. **L1 Re-Access of Line $A$ (Victim Hit & Swap)**:
   * If the CPU requests Line $A$ again, Line $A$ hits in the L2/L3 Victim Cache.
   * Line $A$ is moved back up into L1 SRAM, and **removed from L2/L3** to preserve the disjoint set property ($\text{Contents}(L_1) \cap \text{Contents}(L_2) = \emptyset$)!

```text
EXCLUSIVE VICTIM CACHE LINE SWAP SEQUENCE

 Step 1: L1 Eviction of Line A ──► Line A written DOWN into L2 Victim Cache
                                   Line A removed from L1.

 Step 2: CPU Read Miss on Line A ──► Line A found in L2 Victim Cache!
                                   Line A moved UP into L1 Cache.
                                   Line A REMOVED from L2 Cache!
```


## Non-Inclusive, Non-Exclusive (NINE) Hybrid Architectures & Directory Snoop Filters

Modern multi-core processors do not always force a strict choice between pure inclusion and pure exclusion. Instead, high-performance server architectures (such as Intel Skylake-X/Ice Lake and AMD Zen cores) deploy **Non-Inclusive, Non-Exclusive (NINE) Hybrid Architectures** paired with **Directory Snoop Filters**.

```text
NINE HYBRID CACHE ARCHITECTURE WITH DIRECTORY SNOOP FILTER

 Shared L3 Cache Array (NINE Policy: Holds 16 MB Data Payload)
 ┌─────────────────────────────────────────────────────────────┐
 │ Un-constrained Data Lines (Lines MAY or MAY NOT be in L1)  │
 └─────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Directory Snoop Filter (Presence Bit Vector Table)          │
 │ Address 0x1000 : Presence Vector [0000_0001] (In Core 0!)   │
 │ Address 0x2000 : Presence Vector [0000_0000] (NOT in L1/L2) │
 └─────────────────────────────────────────────────────────────┘
  (Provides 100% Snoop Filtering WITHOUT requiring data inclusion!)
```

### How NINE Caches with Directory Snoop Filters Work:

1. **NINE Data Array Policy**: Lines are loaded into L3 on misses, but if L3 evicts a line, it does **NOT send back-invalidations to L1/L2**. L1 and L2 are allowed to keep their copies! Data duplication is allowed, but not forced.
2. **The Directory Snoop Filter**: To prevent the snoop probe flooding that normally breaks non-inclusive caches, the L3 cache maintains a small, separate **Presence Vector Directory**:
   * Each directory entry stores a 16-bit presence vector ($\text{Presence}[15:0]$) for a memory block address.
   * Bit $k = 1$ indicates that Core $k$'s private L1/L2 cache holds a copy of that line.
3. **Decoupled Snoop Filtering**:
   * When an external coherence invalidation for address $A$ arrives, it checks the **Directory Snoop Filter**.
   * If $\text{Presence} == \text{16'b0000\_0000\_0000\_0000}$, the snoop filter knows no core holds line $A$, and drops the invalidation immediately (**Zero L1 Probes!**).
   * If bit 3 is $1$, the snoop filter sends a targeted invalidation message **ONLY to Core 3**!

By decoupling the *Snoop Filter Directory* from the *Data Payload Storage*, NINE architectures achieve **$100\%$ snoop filtering efficiency** alongside **$100\%$ maximum usable L3 data capacity**!


## Solved Industrial Engineering Exercise: Quantitative Multi-Level Cache Capacity, Invalidation Filter Rate, and AMAT Analysis

To consolidate your complete mastery of inclusive vs. exclusive cache policies, snoop filter efficiency, back-invalidation penalties, and multi-level AMAT calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Effective Usable Cache Capacity

Total L1 capacity = $0.512\text{ MB}$. Total L2 capacity = $4.000\text{ MB}$. L3 capacity = $16.000\text{ MB}$.

##### 1. System A (Inclusive Cache Policy):
Under inclusion, L3 contains exact duplicate copies of all L1 and L2 lines:

$$C_{\text{effective,A}} = C_{\text{L3}} = \mathbf{16.000 \text{ Megabytes}}$$

##### 2. System B (Exclusive Cache Policy):
Under exclusion, no data is duplicated across levels:

$$C_{\text{effective,B}} = C_{\text{L1\_total}} + C_{\text{L2\_total}} + C_{\text{L3}} = 0.512 + 4.000 + 16.000 = \mathbf{20.512 \text{ Megabytes}}$$

$$\text{Capacity Advantage of System B} = \frac{20.512 - 16.000}{16.000} \times 100\% = \mathbf{28.2\% \text{ More Usable Cache Capacity!}}$$

System B provides **$28.2\%$ more usable cache storage** than System A.


#### Step 3: Calculate Effective CPI and Total Execution Time

The workload executes $N_{\text{inst}} = 10,000,000\text{ instructions}$ ($10\%$ loads $\implies 1,000,000\text{ memory reads}$).
Assume L1 miss rate = $4.0\%$ ($40,000\text{ L1 misses}$).

##### 1. System A (Inclusive L3 Cache):
* Base execution cycles = $10,000,000\text{ cycles}$.
* L1 Read Miss Stalls ($40,000 \times 12\text{ cycles L2 hit}$) = $480,000\text{ cycles}$.
* Invalidation Probe Stalls = $20,000\text{ cycles}$.

$$\text{Total Cycles}_{\text{SystemA}} = 10,000,000 + 480,000 + 20,000 = \mathbf{10,500,000 \text{ clock cycles}}$$

$$\text{CPI}_{\text{SystemA}} = \frac{10,500,000}{10,000,000} = \mathbf{1.050 \text{ cycles/instruction}}$$

$$T_{\text{exec,SystemA}} = 10,500,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{0.003281 \text{ seconds}} \quad (3.281\text{ ms})$$

##### 2. System B (Exclusive L3 Cache without Snoop Filter):
* Base execution cycles = $10,000,000\text{ cycles}$.
* L1 Read Miss Stalls (System B's extra $28.2\%$ capacity reduces L1/L2 miss rate from $4.0\%$ to $3.0\% \implies 30,000 \times 12 = 360,000\text{ cycles}$).
* Invalidation Probe Stalls = $1,600,000\text{ cycles}$!

$$\text{Total Cycles}_{\text{SystemB}} = 10,000,000 + 360,000 + 1,600,000 = \mathbf{11,960,000 \text{ clock cycles}}$$

$$\text{CPI}_{\text{SystemB}} = \frac{11,960,000}{10,000,000} = \mathbf{1.196 \text{ cycles/instruction}}$$

$$T_{\text{exec,SystemB}} = 11,960,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{0.003738 \text{ seconds}} \quad (3.738\text{ ms})$$

##### 3. Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec,SystemB}}}{T_{\text{exec,SystemA}}} = \frac{3.738\text{ ms}}{3.281\text{ ms}} = \frac{11,960,000\text{ cycles}}{10,500,000\text{ cycles}} \approx \mathbf{1.139\times \text{ Performance Advantage!}}$$

```text
FINAL MULTI-LEVEL INCLUSION PERFORMANCE SUMMARY

 Architectural Metric    │ System A (Inclusive L3) │ System B (Exclusive L3) │ Advantage
─────────────────────────┼─────────────────────────┼─────────────────────────┼───────────────────
 Effective Usable Cap    │ 16.00 MB                │ 20.51 MB                │ System B (+28.2%)
 L1 Snoop Probe Stalls   │ 20,000 Cycles           │ 1,600,000 Cycles        │ System A (80x Less!)
 Effective CPI           │ 1.050 Cycles / Inst     │ 1.196 Cycles / Inst     │ System A (12.2% Lower)
 Total Execution Time    │ 3.281 Milliseconds      │ 3.738 Milliseconds      │ System A (13.9% FASTER!)
```

##### Engineering Conclusion:
Even though System B provided $28.2\%$ more usable cache capacity, **System A ran $13.9\%$ faster overall** because its inclusive L3 cache filtered out $90\%$ of external snoop queries, protecting the private L1 caches from $1,580,000$ snoop probe stall cycles!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Inclusive Cache Policy**: A multi-level cache containment rule ($\text{Contents}(L_1) \subseteq \text{Contents}(L_3)$) where lower-level caches hold duplicate copies of all upper-level cache lines, allowing the Last-Level Cache (LLC) to filter out $95\%+$ of external snoop invalidation queries without probing private L1/L2 caches.
* **Exclusive Cache Policy (Victim Cache)**: A multi-level cache disjointness rule ($\text{Contents}(L_1) \cap \text{Contents}(L_3) = \emptyset$) where lower-level caches hold only lines evicted from upper-level caches, maximizing total usable storage capacity ($\text{Cap}_{\text{total}} = \text{Cap}_{\text{L1}} + \text{Cap}_{\text{L2}} + \text{Cap}_{\text{L3}}$) at the expense of requiring snoop probes on LLC misses.
