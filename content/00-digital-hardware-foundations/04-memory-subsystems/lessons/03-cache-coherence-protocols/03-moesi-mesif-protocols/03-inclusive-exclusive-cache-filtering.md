content/00-digital-hardware-foundations/04-memory-subsystems/lessons/03-cache-coherence-protocols/03-moesi-mesif-protocols/03-inclusive-exclusive-cache-filtering.md
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

---

### Option 1: The Inclusive Cache Policy
Under an **Inclusive Cache Policy**, the larger, lower-level cache (e.g., L3) is guaranteed to hold a strict mathematical **superset** of all data lines stored in upper-level caches (L1 and L2). If a line resides in L1, an exact duplicate copy of that line MUST also reside in L2 and L3.

* **The Massive Advantage (Snoop Filtering)**: In a multi-core processor where 16 or 32 cores share a bus, when Core 0 broadcasts a write invalidation request for address $A$, the coherence controller **only needs to check the shared L3 cache**! If address $A$ is not present in L3, inclusion guarantees that address $A$ is **100% absent from all L1 and L2 private caches across all cores**! The snoop filter drops the query at L3, and the private L1/L2 caches of all other 15 cores are **never disturbed**!
* **The Storage Penalty**: **Wasted Memory Capacity**. If a multi-core chip has 16 cores, each with a $512\text{-KB}$ L2 cache ($8\text{ MB}$ total L2), an inclusive $16\text{-MB}$ L3 cache must waste $8\text{ Megabytes}$ of its precious SRAM capacity holding exact duplicate copies of data already sitting in L2! The effective usable capacity of the entire system is only $16\text{ MB}$, not $24\text{ MB}$.

---

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

---

## The Corporate File Room and Executive Desk Trays: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of inclusive vs. exclusive cache policies, back-invalidations, and snoop filtering before inspecting set-associative tag matrices and probability equations, let us consider an everyday analogy: **The Corporate Executive and the Central File Room**.

Imagine a large corporate headquarters with 16 executives (**CPU Cores 0 through 15**). Each executive works in a private office equipped with a small desktop file tray (**Private L1 Cache**) holding 10 active folders.

```text
THE EXECUTIVE DESK TRAYS AND CENTRAL FILE ROOM METAPHOR

 Executive Desk Trays (Private L1 Caches)
 [ Core 0 Tray ]   [ Core 1 Tray ]   ...   [ Core 15 Tray ]  (10 Folders Each)
 └──────┬────────┘ └──────┬────────┘       └──────┬─────────┘
        │                 │                       │
        ▼                 ▼                       ▼
 ┌──────────────────────────────────────────────────────────┐
 │ CENTRAL FILE ROOM (Shared L3 Cache)                      │
 │ Holds 1,000 Folders                                      │
 └──────────────────────────────────────────────────────────┘
```

Down the hallway sits the company's **Central File Room** (**Shared L3 Last-Level Cache**) holding 1,000 folders.

An outside auditor (**External Coherence Bus / Remote Core**) periodically visits the building to check if the company holds specific legal documents.

Let us compare two different filing policies enforced by the company:

---

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

---

### Policy 2: The Exclusive Filing Policy (Victim Cabinet / Non-Duplicated)

The company changes the rule to maximize total storage space: *"The Central File Room holds ONLY folders that are NOT currently on an executive's desk!"*

When an executive finishes reading a folder, they drop it into the Central File Room (**Victim Eviction**). When an executive needs a folder from the File Room, the folder is moved to their desk tray and removed from the File Room (**Folder Swap**).

Look at how Policy 2 behaves:

#### 1. Maximum Storage Capacity:
* The 16 desk trays hold $16 \times 10 = 160\text{ unique folders}$.
* The Central File Room holds $1,000\text{ unique folders}$.
* Total company capacity = $160 + 1,000 = \mathbf{1,160 \text{ UNIQUE FOLDERS}}$ (Zero space wasted on duplicates!).

#### 2. Snoop Filtering Breakdown (The Distracting Audit):
An outside auditor arrives asking for **File #500**:
* The auditor checks the Central File Room: **File #500 is NOT there!**
* Does that mean File #500 isn't in the building? **NO!** File #500 might be sitting on Executive 7's desk tray!
* The auditor is forced to walk down the hallway, knock on all 16 office doors, and **search every executive's desk tray one by one** (**Snoop Probe Flooding**)!
* All 16 executives are interrupted, stop working, and lose productive time.

```text
EXCLUSIVE SNOOP FILTERING BREAKDOWN

 Auditor asks for File #500 ──► Checks Central File Room -> NOT THERE!
                                │
                                ▼
         Auditor MUST knock on all 16 Executive doors!
         (All 16 Executives interrupted; work stalls!)
```

This corporate filing system is the exact physical analogue of **Multi-Level Cache Inclusion Policies**:
* The executive desk trays are **Private L1 SRAM Caches**.
* The Central File Room is the **Shared L3 Last-Level Cache (LLC)**.
* The outside auditor is an **External Coherence Bus / Remote Core Request**.
* Checking only the File Room without disturbing executives is **L3 Snoop Filtering**.
* Forcibly removing a folder from a desk when the File Room clears space is an **Inclusive Back-Invalidation**.
* Swapping folders between desk and File Room is **Exclusive Victim Caching**.

---

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

---

### How Inclusion Enables High-Speed Snoop Filtering

The primary physical justification for implementing an Inclusive Cache Policy in a multi-core processor is **Snoop Filtering (Coherence Invalidation Filtering)**.

In a 16-core or 32-core server chip, external coherence requests (`BUS_INV` or `BUS_RFO`) arrive continuously at the shared L3 cache interface.

When an invalidation request for physical address $A$ arrives at the L3 cache:

1. **L3 Tag Lookup**: The L3 cache controller checks its local $16\text{-MB}$ Tag array for address $A$.
2. **Snoop Filter Hit ($A \notin L_3$)**:
   * If address $A$ is **NOT PRESENT in the L3 cache**:
   * By the mathematical Inclusion Invariant ($\text{Contents}(L_1) \subseteq \text{Contents}(L_3)$), if $A \notin L_3$, then **$A$ CANNOT physically exist in any L1 or L2 cache anywhere on the chip!**
   * The snoop filter drops the invalidation request immediately at the L3 boundary!
   * **ZERO snoop signals are sent to the 16 core L1/L2 caches.**

```text
INCLUSIVE SNOOP FILTERING EXECUTION FLOW

 External Invalidation Request for Address A
                       │
                       ▼
         Is Address A present in L3 Cache?
                       │
             ┌─────────┴─────────┐
             │ NO (A NOT in L3)  │ YES (A IS in L3)
             ▼                   ▼
    SNOOP FILTER HIT!      PROBE L1/L2 CACHES!
    Drop Request!          Send targeted invalidation
    Zero L1/L2 Probes!     to specific L1/L2 core!
    (100% Core Shielding)
```

Look at the hardware power of this snoop filter:
On typical workloads, over **$95\%$ of external coherence invalidations miss in the L3 cache**! 

An inclusive L3 cache filters out $95\%$ of all incoming coherence traffic, completely shielding the private L1 and L2 caches from external snoop probe interruptions!

---

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

---

## Primitive 2: The Exclusive Cache Policy and Victim Caches

Now let us examine the opposite inclusion philosophy: **The Exclusive Cache Policy** and **Victim Cache Architectures**.

> A multi-level cache hierarchy enforces the **Exclusive Cache Policy** if any memory line $A$ stored in an upper-level cache ($L_1$) is strictly **forbidden** from residing in lower-level caches ($L_2$ or $L_3$).

Mathematically, exclusion is expressed as a disjoint set property:

$$\text{Contents}(L_1) \quad \cap \quad \text{Contents}(L_2) \quad = \quad \emptyset$$

Where:
* $\text{Contents}(L_1)$ is the set of memory line addresses in the L1 cache.
* $\text{Contents}(L_2)$ is the set of memory line addresses in the L2 cache.
* $\cap$ represents set intersection.
* $\emptyset$ represents the empty set (zero shared elements).

```text
EXCLUSIVE CACHE DISJOINT SET DIAGRAM

 ┌─────────────────────────────┐   ┌─────────────────────────────┐
 │ Private L1 Cache (32 KB)    │   │ Shared L2/L3 Cache (512 KB) │
 │ [Line A][Line B][Line C]    │   │ [Line D][Line E][Line F]    │
 └─────────────────────────────┘   └─────────────────────────────┘
  (Zero duplicate lines! Memory contents are 100% disjoint!)
```

---

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

---

### Calculating Effective Multi-Level Storage Capacity

Let us compare the total effective usable cache capacity $C_{\text{effective}}$ between an Inclusive Cache hierarchy and an Exclusive Cache hierarchy for a quad-core processor with the following cache dimensions:
* Private L1 Data Caches: $4 \times 32\text{ KB} = 128\text{ KB}$ total L1.
* Private L2 Caches: $4 \times 512\text{ KB} = 2,048\text{ KB} = 2\text{ MB}$ total L2.
* Shared L3 Cache: $16\text{ Megabytes}$ ($16,384\text{ KB}$).

#### 1. Under an Inclusive Cache Policy:
Because L3 MUST hold duplicate copies of all L1 and L2 lines, the $128\text{ KB}$ of L1 data and $2\text{ MB}$ of L2 data are duplicated inside L3:

$$C_{\text{effective,Inclusive}} = C_{\text{L3}} = \mathbf{16.0 \text{ Megabytes}}$$

The $128\text{ KB}$ of L1 space and $2\text{ MB}$ of L2 space provide zero additional unique capacity beyond L3.

#### 2. Under an Exclusive Cache Policy:
Because no lines are duplicated across levels, every single byte across L1, L2, and L3 holds unique data:

$$C_{\text{effective,Exclusive}} = C_{\text{L1\_total}} + C_{\text{L2\_total}} + C_{\text{L3}}$$

Where:
* $C_{\text{effective,Exclusive}}$ is the net usable capacity under exclusive policy.
* $C_{\text{L1\_total}}$ is the combined capacity of all private L1 caches ($0.128\text{ MB}$).
* $C_{\text{L2\_total}}$ is the combined capacity of all private L2 caches ($2.0\text{ MB}$).
* $C_{\text{L3}}$ is the capacity of the shared L3 cache ($16.0\text{ MB}$).

$$C_{\text{effective,Exclusive}} = 0.128\text{ MB} + 2.0\text{ MB} + 16.0\text{ MB} = \mathbf{18.128 \text{ Megabytes}}$$

$$\text{Capacity Gain} = \frac{18.128 - 16.0}{16.0} \times 100\% = \mathbf{13.3\% \text{ More Usable Cache Capacity!}}$$

For small L2/L3 caches, the capacity gain of an Exclusive policy can exceed **$50\%$ to $100\%$**, making Exclusive Victim Caches popular in mobile and embedded processors where silicon die area is strictly constrained!

---

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

---

## Comparison Matrix of Inclusion Policies

The following comprehensive matrix summarizes the architectural trade-offs across Inclusive, Exclusive, and NINE cache policies:

```text
INCLUSION POLICY COMPREHENSIVE COMPARISON MATRIX

 Architectural Property │ Inclusive Cache Policy      │ Exclusive Cache Policy      │ NINE Hybrid + Directory
────────────────────────┼─────────────────────────────┼─────────────────────────────┼───────────────────────────────
 Set Containment Rule   │ L1 subset of L2 subset of L3│ L1, L2, L3 Disjoint (Cap=0) │ No strict rule
 Effective Storage Cap  │ Lowest (Cap = L3 size)      │ Highest (Cap = L1+L2+L3)    │ High (~L3 size + non-dup)
 Snoop Filter Efficiency│ EXCELLENT (Check L3 only)   │ POOR (Must probe L1/L2)     │ EXCELLENT (Via Directory)
 Back-Invalidation Risk │ HIGH (L3 eviction drops L1) │ ZERO (No back-invalidates)  │ ZERO (No back-invalidates)
 L1 Miss Handling       │ Line loaded in L1 AND L3    │ Line loaded in L1 ONLY      │ Line loaded in L1 and/or L3
 Primary Application    │ Large Inclusive L3 (Intel)  │ Mobile / Small L2 (AMD/ARM) │ Modern Servers (Xeon / Zen)
```

---

## Solved Industrial Engineering Exercise: Quantitative Multi-Level Cache Capacity, Invalidation Filter Rate, and AMAT Analysis

To consolidate your complete mastery of inclusive vs. exclusive cache policies, snoop filter efficiency, back-invalidation penalties, and multi-level AMAT calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal performance architect evaluating the Last-Level Cache (LLC) architecture for a $3.2\text{ GHz}$ 8-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution CPI of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming all L1 accesses hit).

```text
3.2 GHz 8-CORE SERVER PROCESSOR MEMORY SUBSYSTEM

 Cores 0..7 (3.2 GHz) ──► [ Private L1 Caches (8 x 64 KB) ]
                          [ Private L2 Caches (8 x 512 KB) ]
                          [ Shared L3 Cache (16 Megabytes) ] ──► Main Memory DRAM
 Clock T = 312.5 ps       L1 Hit = 1c, L2 = 12c, L3 = 36c       DRAM Access = 120c
```

#### Multi-Level Cache Parameters:
* 8 Cores (Core 0 through Core 7).
* Private L1 Data Caches: $8 \times 64\text{ KB} = 512\text{ KB}$ total L1 capacity. Hit Latency $T_{\text{L1}} = 1\text{ cycle}$ ($0.3125\text{ ns}$).
* Private L2 Caches: $8 \times 512\text{ KB} = 4,096\text{ KB} = 4\text{ MB}$ total L2 capacity. Hit Latency $T_{\text{L2}} = 12\text{ cycles}$ ($3.75\text{ ns}$).
* Shared L3 Cache: $16\text{ Megabytes}$ ($16,384\text{ KB}$) total L3 capacity. Hit Latency $T_{\text{L3}} = 36\text{ cycles}$ ($11.25\text{ ns}$).
* Main Memory DRAM: Access Latency $T_{\text{DRAM}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).
* L1 Tag Snoop Probe Interrupt Penalty: If an external snoop probe must search a core's private L1 tag array, it stalls that core's execution pipeline for $T_{\text{probe}} = 2\text{ clock cycles}$.

#### Workload Interconnect Traffic Parameters:
During a 1,000,000-instruction database workload, external coherence invalidation requests arrive at this 8-core socket at a rate of **100,000 external snoop queries**.
* Microarchitectural analysis shows that **$90.0\%\quad (90,000\text{ queries})$** target physical addresses that are **NOT present** in this socket's L1, L2, or L3 caches.

#### Candidate System Configurations to Compare:
* **System A (Strict Inclusive L3 Cache)**: L3 holds duplicates of all L1/L2 lines. Invalidation requests check L3 first.
* **System B (Exclusive L3 Victim Cache without Directory Filter)**: L3 holds non-duplicated victim lines. All 100,000 external snoop queries must probe all 8 private L1/L2 tag arrays directly.

#### Your Objective

1. Calculate the total **Effective Usable Cache Capacity** for System A (Inclusive) versus System B (Exclusive).
2. For System A (Inclusive):
   * Calculate how many of the 100,000 external snoop queries are filtered out by L3.
   * Calculate total L1 snoop probe stall cycles across all 8 cores.
3. For System B (Exclusive):
   * Calculate total L1 snoop probe stall cycles across all 8 cores resulting from snoop probe flooding.
4. Calculate the total execution time (in milliseconds) and effective CPI for System A vs System B on a 10,000,000-instruction workload where 10% of instructions are memory loads.
5. Verify mathematical, structural, and timing correctness.

---

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

---

#### Step 2: Evaluate Snoop Filtering Efficiency and Probe Stalls

100,000 external snoop queries arrive at the socket interface. 90,000 queries target addresses NOT present in this socket's memory hierarchy.

##### 1. System A (Inclusive Cache Snoop Filtering):
* All 100,000 queries check L3 Tag array.
* 90,000 queries miss in L3. Because of Inclusion ($L_1 \subseteq L_2 \subseteq L_3$), **all 90,000 queries are filtered out at L3 ($100\%$ Snoop Filter Hit!)**.
* Zero snoop probe signals are sent to the 8 core L1/L2 caches for these 90,000 queries!
* The remaining 10,000 queries hit in L3 and send targeted snoop probes to only the specific core holding the line.
* Total L1 snoop probe stall cycles across all 8 cores = $10,000 \times 2\text{ cycles} = \mathbf{20,000 \text{ stall cycles}}$.

##### 2. System B (Exclusive Cache without Snoop Filter):
* Because L3 does NOT enforce inclusion, a miss in L3 does NOT prove absence from L1/L2!
* ALL 100,000 external snoop queries MUST send snoop probes to search the private L1 tag arrays of **ALL 8 CORES**!
* Total L1 snoop probe stall cycles across 8 cores:

$$\text{Total Stall Cycles (System B)} = 100,000 \text{ queries} \times 8 \text{ cores} \times 2 \text{ cycles/probe} = \mathbf{1,600,000 \text{ stall cycles!}}$$

```text
SNOOP PROBE STALL COMPARISON (100,000 EXTERNAL QUERIES)

 System Configuration         │ Filtered at L3 │ L1 Probes Sent │ Total L1 Stall Cycles
──────────────────────────────┼────────────────┼────────────────┼───────────────────────
 System A (Inclusive L3)      │ 90,000 Queries │ 10,000 Probes  │    20,000 Cycles
 System B (Exclusive No-Filter│  0 Queries!    │ 800,000 Probes │ 1,600,000 Cycles!
                              │                │                │ (80x MORE STALLS!)
```

##### Snoop Filtering Conclusion:
System A's inclusive L3 cache filtered out $90\%$ of external queries, **reducing L1 snoop probe stalls by a factor of $80\times$** ($20,000$ cycles vs $1,600,000$ cycles)!

---

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

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against multi-level cache principles:

1. **Inclusion Set Containment Check**:
   * System A enforced $\text{Contents}(L_1) \subseteq \text{Contents}(L_2) \subseteq \text{Contents}(L_3)$.
   * A miss in L3 proved 100% absence from L1 and L2, filtering $90,000$ queries cleanly.
2. **Capacity Gain Verification**:
   * System B's capacity = $16\text{ MB} + 4\text{ MB} + 0.512\text{ MB} = 20.512\text{ MB}$.
   * System A's capacity = $16\text{ MB}$.
   * Difference = $4.512\text{ MB} = 28.2\%$, matching capacity math.
3. **Snoop Probe Penalty Trade-off**:
   * The $1,580,000$ extra snoop probe stall cycles in System B outweighed its capacity miss savings ($120,000\text{ cycles}$ saved), proving why large server chips choose inclusive L3 caches or directory snoop filters!

All set containment properties, snoop filtering efficiencies, back-invalidation constraints, and execution speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Inclusive Cache Policy**: A multi-level cache containment rule ($\text{Contents}(L_1) \subseteq \text{Contents}(L_3)$) where lower-level caches hold duplicate copies of all upper-level cache lines, allowing the Last-Level Cache (LLC) to filter out $95\%+$ of external snoop invalidation queries without probing private L1/L2 caches.
* **Exclusive Cache Policy (Victim Cache)**: A multi-level cache disjointness rule ($\text{Contents}(L_1) \cap \text{Contents}(L_3) = \emptyset$) where lower-level caches hold only lines evicted from upper-level caches, maximizing total usable storage capacity ($\text{Cap}_{\text{total}} = \text{Cap}_{\text{L1}} + \text{Cap}_{\text{L2}} + \text{Cap}_{\text{L3}}$) at the expense of requiring snoop probes on LLC misses.
