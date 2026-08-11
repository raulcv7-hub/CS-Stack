---
title: "MESI Protocol State Transitions and Line Ownership Mechanics"
---

# MESI Protocol State Transitions and Line Ownership Mechanics

## The Invalidation Traffic Explosion and the Silent Upgrade Need

In multi-core computing architectures, private Level 1 (L1) Data Caches allow individual execution cores to process memory read and write operations locally at sub-nanosecond $1\text{-cycle}$ speeds. To guarantee that no core reads stale, corrupted data when multiple cores share access to the same memory addresses, multi-core hardware enforces **The Single-Writer Multiple-Reader (SWMR) Invariant**: at any given instant in time, a memory line can either be held in a Read-Only Shared state by multiple cores, or held in an Exclusive Write state by at most one single core.

In the classic **MESI (Modified, Exclusive, Shared, Invalid)** 4-state coherence protocol, cache line ownership and validity are tracked using four states:
* **Modified ($M$)**: Line is valid, held exclusively by one core, and dirty (modified relative to main DRAM).
* **Exclusive ($E$)**: Line is valid, held exclusively by one core, and clean (matches main DRAM).
* **Shared ($S$)**: Line is valid, potentially held by multiple cores, and clean (matches main DRAM).
* **Invalid ($I$)**: Line contains no valid data.

While the MESI protocol maintains 100% data correctness, it suffers from a severe, hidden physical performance bottleneck: **The Forced Memory Writeback Penalty**.

Consider what happens in a MESI-based multi-core processor during a common multi-threaded data sharing pattern:

1. Core 0 executes a sequence of store instructions modifying a 64-byte line at address $A$. Line $A$ enters the **Modified ($M$) state** in Core 0's private L1 cache. Main DRAM memory holds stale, outdated data for address $A$.
2. A second core, Core 1, attempts to read address $A$ (`LOAD` instruction).
3. Core 1 experiences an L1 cache miss and broadcasts a read request (`BusRd`) across the shared interconnect bus.
4. Core 0 snoops `BusRd`, detects that it holds line $A$ in the Modified ($M$) state, and intercepts the transaction.

```text
THE MESI FORCED WRITEBACK BOTTLENECK

 Core 0 holds Line A in Modified State (M) | Main DRAM holds Stale Data
                                 │
 Core 1 Issues Read Request (BusRd)
                                 │
                                 ▼
 MESI PROTOCOL RULE: Both Cores MUST transition to Shared State (S)!
 BUT Shared State (S) in MESI REQUIRES data to be CLEAN (Matching DRAM)!
                                 │
                                 ▼
 Core 0 FORCED to write 64B Line A all the way back to Main DRAM Memory!
 (Core 1 STALLED for 150 Clock Cycles waiting for DRAM writeback!)
```

Look at the physical hardware penalty forced by the MESI protocol:
* Under MESI rules, when Core 1 reads line $A$, both Core 0 and Core 1 must transition their local cache lines to the **Shared ($S$) state**.
* However, the fundamental definition of the Shared ($S$) state in standard MESI is that **the data line MUST BE CLEAN (matching main DRAM memory)**!
* Therefore, before Core 1 is permitted to complete its read operation, **Core 0 is forced to write the modified 64-byte line all the way back across the off-chip bus to main DRAM memory**!

This forced DRAM writeback creates a massive system stall:
* Main DRAM memory access is extraordinarily slow, taking **120 to 200 CPU clock cycles** ($40 \text{ to } 50\text{ nanoseconds}$).
* Core 1's execution pipeline freezes, stalled for 150 clock cycles waiting for DRAM to complete the writeback transaction!
* The off-chip memory interconnect bus is flooded with writeback traffic, consuming precious channel bandwidth.

Why should two high-speed, on-chip CPU cores sitting a few millimeters apart on the same silicon die be forced to write dirty data back to slow off-chip DRAM memory just because one core wanted to share a read-only copy of a variable with its neighbor?

To eliminate forced DRAM writebacks and enable high-speed peer-to-peer data sharing between private caches, computer architects expanded the 4-state MESI protocol into **The 5-State MOESI Coherence Protocol** by introducing **The Owner ($O$) State**.

By creating a dedicated Owner state, the MOESI protocol allows a core holding dirty data to share read-only copies with other cores **without writing the data back to main DRAM memory**, enabling pure **Inter-Cache Line Transfers (Cache-to-Cache Interventions)** at sub-nanosecond SRAM speeds.


### The Four Official Status Stamps (MESI States)

```text
THE FOUR MESI STATUS STAMPS

 1. [I] INVALID Stamp   ──► Book is torn/empty. Cannot be read.
 2. [S] SHARED Stamp    ──► Book is in MULTIPLE branches. Read-Only! (No Writing!)
 3. [E] EXCLUSIVE Stamp ──► Book is in THIS BRANCH ONLY! Clean! (Silent Edit Allowed!)
 4. [M] MODIFIED Stamp  ──► Book was EDITED HERE! Sole Owner & Dirty!
```

Let us examine the exact operational rules for each stamp:

#### 1. The `[I]` INVALID Stamp
* **Meaning**: The book on the bookshelf is damaged or empty. Patrons cannot read it.
* **Action**: If a patron requests this book, the branch must call the main printing press to order a fresh copy (**Cache Miss**).

#### 2. The `[S]` SHARED Stamp
* **Meaning**: This book is clean (matches the main printing press), but **other branch libraries ALSO hold copies of this book on their shelves**.
* **Permissions**: **Read-Only!** Patrons can read the book as many times as they want in complete silence.
* **Edit Constraint**: If a patron wants to write or edit notes inside this book, the branch **CANNOT edit it silently**! The branch must first shout over the public intercom: *"ATTENTION ALL BRANCHES: BURN YOUR COPY OF BOOK #42!"* (**Bus Invalidation Signal**).

#### 3. The `[E]` EXCLUSIVE Stamp — The Magic Silent Upgrade!
* **Meaning**: This book is clean (matches the main printing press), AND **this branch is the ONLY branch in the entire city that holds a copy**!
* **Permissions**: Read-Only initially, BUT with an **Exclusive Privilege**!
* **THE SILENT EDIT PRIVILEGE**: If a patron wants to edit this book, the branch checks the stamp: **`[E] EXCLUSIVE`**!
  The branch knows with $100\%$ certainty that **no other branch in the city has this book**!
  The branch **does NOT shout on the public intercom**! It simply takes a pen, edits the book locally, and flips the stamp to **`[M] MODIFIED` in total silence**!

```text
THE SILENT EDIT PRIVILEGE IN EXCLUSIVE STATE [E]

 Patron asks to edit Book #10 at Branch 0 (Stamp is [E] EXCLUSIVE)
                               │
                               ▼
 Branch 0 checks stamp: [E] EXCLUSIVE! (No other branch has this book!)
                               │
                               ▼
 Branch 0 edits the book LOCALLY & changes stamp to [M] MODIFIED!
 (ZERO INTERCOM ANNOUNCEMENTS! ZERO BUS TRAFFIC GENERATED!)
```

#### 4. The `[M]` MODIFIED Stamp
* **Meaning**: This branch edited the book! This branch is the **sole owner** of the book, and its copy contains new information that the main printing press does not have yet (**Dirty Data**).
* **Permissions**: Full Read and Write privileges locally in total silence.


## Primitive 1: The MESI Protocol States (Modified, Exclusive, Shared, Invalid)

Now that we possess an intuitive mental model of the four library status stamps, let us examine the formal, rigorous engineering mechanics of **The MESI Coherence Protocol** (developed by Mark Papamarcos and Janak Patel in 1984).

In a MESI cache, every physical cache line entry inside the L1 Data Cache SRAM array stores **two status bits ($S_1, S_0$)** in its metadata field to encode the four MESI states:

```text
PHYSICAL CACHE LINE METADATA WITH 2 MESI STATE BITS

 ┌──────────────┬──────────────────────────┬───────────────────────────────┐
 │ MESI State   │ Tag Bits                 │ Data Line Payload             │
 │ Bits [S1,S0] │ [63:15]                  │ [64 Bytes / 512 Bits]         │
 ├──────────────┼──────────────────────────┼───────────────────────────────┤
 │ 2 Bits       │ 49-Bit Physical Address  │ 64-Byte Stored Data Line      │
 └──────────────┴──────────────────────────┴───────────────────────────────┘
  ◄────── MESI Metadata ──────────────────► ◄────── Payload Data ──────────►
```


## Primitive 2: Coherence State Transitions (The Per-Line FSM)

To maintain the Single-Writer Multiple-Reader (SWMR) invariant, every cache line entry in a MESI cache is governed by an independent **4-State Finite State Machine (FSM)**.

The MESI FSM responds to two distinct categories of input events:
1. **Local Processor Requests**: Initiated by the local CPU execution pipeline (`PrRd` - Processor Read, `PrWr` - Processor Write).
2. **Snooped Bus Transactions**: Initiated by remote CPU cores and broadcast across the shared memory interconnect bus (`BusRd`, `BusRdX`/`BusRFO`, `BusUpgr`).

```text
MESI DUAL-EVENT DRIVER TOPOLOGY

 Processor Local Commands (PrRd, PrWr)
                  │
                  ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ MESI CACHE LINE FINITE STATE MACHINE (2 Bits per Line)      │
 │ States: [M] Modified, [E] Exclusive, [S] Shared, [I] Invalid│
 └────────────────▲────────────────────────────────────────────┘
                  │
 Bus Snooped Commands (BusRd, BusRdX, BusUpgr)
```


### The Complete MESI State Transition Diagram

Let us examine the complete, formal state transition graph for a MESI cache line:

```text
COMPLETE MESI PROTOCOL STATE TRANSITION GRAPH

                     Power-On / Reset / Eviction
                                 │
                                 ▼
                          ┌─────────────┐
                 ┌───────►│   INVALID   │◄───────┐
                 │        │     (I)     │        │
                 │        └──────┬──────┘        │
                 │               │               │
  BusRdX / BusUpgr               │ PrRd          │ BusRdX / BusUpgr
  from Remote Core               │ (Read Miss)   │ from Remote Core
                 │               ▼               │
                 │        ┌─────────────┐        │
                 │        │   SHARED    │        │
                 │        │     (S)     ├────────┘
                 │        └──────┬──────┘
                 │               │
                 │               │ PrWr (Write Hit: Issue BusUpgr)
                 │               ▼
                 │        ┌─────────────┐
                 ├────────┤  MODIFIED   │◄───────┐
                 │        │     (M)     ├────────┘ PrWr / PrRd (Local Hits)
                 │        └──────▲──────┘
                 │               │
                 │               │ PrWr (SILENT UPGRADE! Zero Bus Traffic!)
                 │               │
                 │        ┌──────┴──────┐
                 └────────┤  EXCLUSIVE  │
                          │     (E)     │
                          └─────────────┘
```


#### 1. Transitions from the INVALID ($I$) State

When a cache line is in the **Invalid ($I$)** state:

* **Local Processor Read (`PrRd`)**:
  * The CPU executes a load instruction. A Read Miss occurs.
  * The cache controller broadcasts **`BusRd`** across the memory bus.
  * All other cores snoop `BusRd`.
  * **If another core holds the line**: The other core asserts the shared bus signal (`SHARED` line). The line is loaded into L1 SRAM, and the state transitions to **Shared ($S$)**.
  * **If NO other core holds the line**: The `SHARED` line remains de-asserted. Main memory returns the line, and the state transitions directly to **Exclusive ($E$)**!

$$\text{PrRd (No other core has line)} \implies \text{State Transition: } I \longrightarrow \mathbf{E}$$

$$\text{PrRd (Another core has line)} \implies \text{State Transition: } I \longrightarrow \mathbf{S}$$

Where:
* $I$ is the Invalid state.
* $E$ is the Exclusive state.
* $S$ is the Shared state.

* **Local Processor Write (`PrWr`)**:
  * The CPU executes a store instruction. A Write Miss occurs.
  * The cache controller broadcasts **`BusRdX` / `BusRFO`** across the bus, requesting data and invalidating all other copies.
  * The line is loaded into L1 SRAM, the store payload is merged, and the state transitions directly to **Modified ($M$)**.

$$\text{PrWr} \implies \text{State Transition: } I \longrightarrow \mathbf{M}$$


#### 3. Transitions from the SHARED ($S$) State

When a cache line is in the **Shared ($S$)** state, multiple cores may hold copies.

* **Local Processor Read (`PrRd`)**:
  * L1 Cache Hit! Data served in $1\text{ clock cycle}$.
  * **State Transition**: Stays in **Shared ($S$)**. Zero bus traffic.

* **Local Processor Write (`PrWr`)**:
  * Core wants to write, but line is Shared! Core does NOT have write permission.
  * The cache controller broadcasts **`BusUpgr` / `BUS_INV`** across the bus to invalidate all other copies.
  * **State Transition**: Transitions from **$S \longrightarrow \mathbf{M}$**.

$$\text{PrWr in } S \text{ State} \implies \text{State Transition: } \mathbf{S \longrightarrow M \quad (\text{Broadcasts } \mathtt{BusUpgr})}$$

* **Snooped Bus Read (`BusRd` from Remote Core)**:
  * Another core reads the line. The local snooper asserts the `SHARED` bus signal.
  * **State Transition**: Stays in **Shared ($S$)**.

* **Snooped Bus Invalidate / Read-For-Ownership (`BusUpgr` / `BusRdX` from Remote Core)**:
  * Another core is modifying the line!
  * The local snooper detects `BusUpgr` or `BusRdX` and **invalidates the local line ($V \Leftarrow 0$)**.
  * **State Transition**: Transitions from **$S \longrightarrow \mathbf{I}$**.


### Master Summary State Transition Matrix

The following comprehensive matrix summarizes all MESI state transitions for both local processor requests and snooped bus transactions:

```text
COMPLETE MESI PROTOCOL TRANSITION MATRIX

 Current  │ Local PrRd      │ Local PrWr      │ Snooped BusRd   │ Snooped BusRdX / BusUpgr
 State    │ (Local Load)    │ (Local Store)   │ (Remote Read)   │ (Remote Write / Invalidate)
──────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────────────
 [I]      │ Miss -> BusRd   │ Miss -> BusRdX  │ No Action       │ No Action
 Invalid  │ -> S (if shared)│ -> M            │                 │
          │ -> E (if solo)  │                 │                 │
──────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────────────
 [S]      │ Hit -> S        │ Hit -> BusUpgr  │ Assert SHARED   │ Invalidate Line
 Shared   │ (0 Bus Traffic) │ -> M            │ -> S            │ -> I
──────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────────────
 [E]      │ Hit -> E        │ SILENT UPGRADE! │ Assert SHARED   │ Invalidate Line
 Exclusive│ (0 Bus Traffic) │ -> M (0 Bus!)   │ -> S            │ -> I
──────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────────────
 [M]      │ Hit -> M        │ Hit -> M        │ Intercept (RFO) │ Intercept (RFO)
 Modified │ (0 Bus Traffic) │ (0 Bus Traffic) │ Supply Data -> S│ Supply Data -> I
```


### 2. Cache-to-Cache Interventions (Inter-Cache Transfers)

When Core 0 issues a read miss (`BusRd`) for a line $A$ that sits in Core 1's L1 cache in the **Modified ($M$) state**:

Main DRAM memory holds **stale, outdated data** for line $A$! If main DRAM responded to the read request, Core 0 would read corrupted data.

To prevent stale reads, Core 1's cache controller performs an **Intervention**:
1. Core 1 snoops `BusRd(A)` and detects that it holds line $A$ in $M$ state.
2. Core 1 asserts the **`HITM` (Hit Modified)** bus control signal to inform main DRAM: *"DO NOT RESPOND! I HOLD THE FRESH DATA!"*
3. Core 1 reads the 64-byte line from its L1 SRAM array and **drives the modified data directly onto the bus** to supply Core 0 (**Cache-to-Cache Transfer**).
4. Simultaneously, the memory controller captures the data passing over the bus and writes it back to main DRAM.
5. Both Core 0 and Core 1 update line $A$'s state bits to **Shared ($S$)**.

```text
INTER-CACHE INTERVENTION SEQUENCE

 Core 0 Issues BusRd(A) ──► Core 1 Snoops & Asserts HITM Signal!
                            │
                            ▼
 Core 1 Drives 64B Modified Payload onto Bus ──┬──► Core 0 Receives Data (State -> S)
                                              └──► Main DRAM Updated (State -> S)
 (DRAM read aborted; data transferred core-to-core in 15 clock cycles!)
```

Cache-to-cache interventions are $5\times \text{to } 10\times$ faster than fetching data from main DRAM, dramatically accelerating multi-threaded data sharing!


### Scenario and Parameters

You are a senior microarchitect auditing the L1 Data Cache coherence subsystem of a $3.2\text{ GHz}$ 4-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor cores (Core 0, Core 1, Core 2, Core 3) each feature a private $32\text{-KB}$ L1 Data Cache ($64\text{-byte}$ lines) connected to a **Shared Snooping Memory Bus**.

```text
3.2 GHz 4-CORE MESI COHERENCE MEMORY SUBSYSTEM

 Core 0 (3.2 GHz) ──► [ L1 Data Cache 0 ] ──┐
 Core 1 (3.2 GHz) ──► [ L1 Data Cache 1 ] ──┼──► Shared Snooping Bus
 Core 2 (3.2 GHz) ──► [ L1 Data Cache 2 ] ──┼──► Shared L2 Cache / DRAM
 Core 3 (3.2 GHz) ──► [ L1 Data Cache 3 ] ──┘    Bus Upgrade = 8 Cycles
```

#### Hardware Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 312.5\text{ ps}$).
* Ideal Execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming local L1 hits).
* L1 Data Cache: $32\text{ KB}$ capacity, $64\text{-byte}$ lines, $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Bus Invalidation Broadcast Latency (`BusUpgr`): $T_{\text{bus\_upgr}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).
* Bus Read-For-Ownership Latency (`BusRdX`): $T_{\text{bus\_rdx}} = 24\text{ clock cycles}$ ($7.50\text{ ns}$).
* Inter-Cache Intervention Latency (`Flush`): $T_{\text{intervene}} = 16\text{ clock cycles}$ ($5.00\text{ ns}$).
* Main DRAM Read Fill Latency (`BusRd`): $T_{\text{DRAM}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).

#### Initial Memory Subsystem State:
Physical memory address $A = \text{0x00010000}$ is currently **INVALID ($I$) state across ALL FOUR CORES** ($S_0=I, S_1=I, S_2=I, S_3=I$).

#### The Workload Execution Sequence (8 Operations):
1. **Op 1 ($t = 1\text{ ns}$, Core 0)**: Executes `STORE [0x00010000] = 10` (Write Miss).
2. **Op 2 ($t = 2\text{ ns}$, Core 1)**: Executes `LOAD R1, [0x00010000]` (Read Miss).
3. **Op 3 ($t = 3\text{ ns}$, Core 2)**: Executes `LOAD R2, [0x00010000]` (Read Miss).
4. **Op 4 ($t = 4\text{ ns}$, Core 3)**: Executes `LOAD R3, [0x00010000]` (Read Miss).
5. **Op 5 ($t = 5\text{ ns}$, Core 1)**: Executes `STORE [0x00010000] = 20` (Store on owned line).
6. **Op 6 ($t = 6\text{ ns}$, Core 1)**: Executes `STORE [0x00010000] = 30`.
7. **Op 7 ($t = 7\text{ ns}$, Core 3)**: Executes `STORE [0x00010000] = 40`.
8. **Op 8 ($t = 8\text{ ns}$, Core 3)**: Executes `LOAD R4, [0x00010000]`.

#### Your Objective

1. Trace the exact state transitions ($S_0, S_1, S_2, S_3$) for line $A$ across all 4 cores after EACH of the 8 operations.
2. Identify all bus transactions dispatched (`BusRd`, `BusRdX`, `BusUpgr`, `Intervention`) and specify which operations execute as **Silent Upgrades (0 Bus Traffic)**.
3. Calculate the total CPU stall cycles incurred across all cores during the 8-operation sequence.
4. Calculate the percentage reduction in bus transactions achieved by MESI over a naive 2-state protocol.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Quantify Bus Traffic and Performance Savings

Let us evaluate the total bus transactions and stall cycles under MESI versus a naive 2-State (Valid/Invalid) Protocol:

##### 1. Total Bus Transactions under MESI:
* Op 1: `BusRdX` (Full 64B Line Fill)
* Op 2: `BusRd` (Full 64B DRAM Writeback)
* Op 3: `BusRd` (Full 64B Line Fill)
* Op 4: `BusRd` (Full 64B Line Fill)
* Op 5: `BusUpgr` (8B Address-Only Invalidation)
* Op 6: **NO BUS TRANSACTION** (Silent Store in $M$)
* Op 7: `BusRdX` (64B Read-For-Ownership)
* Op 8: **NO BUS TRANSACTION** (Local Hit in $M$)

$$\text{Total Bus Transactions (MESI)} = \mathbf{6 \text{ Bus Transactions}}$$

$$\text{Silent Stores (0 Bus Traffic)} = \mathbf{2 \text{ Operations (Op 6 and Op 8)}}$$

##### 2. Total Bus Transactions under Naive 2-State Protocol:
Under a 2-State (Valid/Invalid) protocol, every store instruction (Ops 1, 5, 6, 7) MUST broadcast a full `BusRdX` transaction because the protocol cannot track Exclusive ownership:

$$\text{Total Bus Transactions (2-State)} = 8 \text{ Bus Transactions}$$

$$\text{Bus Transaction Reduction} = \left( 1 - \frac{6}{8} \right) \times 100\% = \mathbf{25.0\% \text{ Fewer Bus Transactions!}}$$

##### 3. Total System Stall Cycles under MESI:
$$\text{Total Stall Cycles} = 120 + 120 + 12 + 12 + 8 + 0 + 24 + 0 = \mathbf{296 \text{ clock cycles}}$$

$$\text{Total Stall Time} = 296 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{92.50 \text{ nanoseconds}}$$

##### 4. Total System Stall Cycles under 2-State Protocol:
Under 2-State, Op 6 pays $24\text{ cycles}$ for `BusRdX`:

$$\text{Total Stall Cycles (2-State)} = 120 + 120 + 12 + 12 + 8 + 24 + 24 + 0 = \mathbf{320 \text{ clock cycles}}$$

$$\text{Performance Speedup} = \frac{320 \text{ cycles}}{296 \text{ cycles}} \approx \mathbf{1.081\times \text{ Performance Advantage!}}$$

```text
MESI PROTOCOL OPTIMIZATION RESULTS SUMMARY

 Coherence Protocol  │ Total Bus Transactions │ Bus Stall Cycles │ Effective CPI     │ Execution Time
─────────────────────┼────────────────────────┼──────────────────┼───────────────────┼───────────────
 2-State Protocol    │ 8 Transactions         │ 320 Clock Cycles │ 13.33 Cycles/Inst │ 100.00 ns
 MESI 4-State        │ 6 Transactions         │ 296 Clock Cycles │ 12.33 Cycles/Inst │  92.50 ns
                     │ (25% Less Traffic)     │ (24 Cycles Saved)│ (0.8x Lower CPI!) │ (1.08x FASTER!)
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **MESI Protocol States**: The 4-state cache line status model—**Modified ($M$)**, **Exclusive ($E$)**, **Shared ($S$)**, **Invalid ($I$)**—encoded using 2 metadata bits per cache line, that distinguishes between clean shared lines and private un-modified lines to enable silent local store upgrades.
* **Coherence State Transitions**: The per-line finite state machine (FSM) that moves between MESI states in response to local CPU pipeline requests (`PrRd`, `PrWr`) and snooped bus transactions (`BusRd`, `BusRdX`, `BusUpgr`), enforcing the Single-Writer Multiple-Reader (SWMR) invariant across all cores.
