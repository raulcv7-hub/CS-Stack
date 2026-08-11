---
title: "MOESI Protocol Owner State and Inter-Cache Transfer Mechanics"
---

# MOESI Protocol Owner State and Inter-Cache Transfer Mechanics

## The Forced Writeback Penalty in Traditional Coherence Protocols

In multi-core computing architectures, private Level 1 (L1) Data Caches allow individual execution cores to process memory read and write operations locally at sub-nanosecond $1\text{-cycle}$ speeds. To prevent different cores from reading conflicting or stale values for the exact same memory address, hardware cache controllers enforce **The Single-Writer Multiple-Reader (SWMR) Invariant**: at any given instant in time, a memory line can either be held in a Read-Only Shared state by multiple cores, or held in an Exclusive Write state by at most one single core.

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


### The MESI Protocol Failure (Forced Printing Press Update)

Under the standard MESI protocol, Book #42 on Branch 0's shelf is stamped **`[M] MODIFIED`**. The central printing press in the basement holds the old, outdated edition.

Now, a researcher at Branch 1 calls over the intercom asking to read Book #42:
1. Under MESI rules, if Branch 0 shares a photocopy with Branch 1, **both libraries must stamp their copies `[S] SHARED`**.
2. But the MESI rule for `[S] SHARED` is: *"All Shared books MUST be identical to the edition stored at the main printing press!"*
3. So, before Branch 1 can read a single page, **Branch 0 is forced to drive across town to the main printing press, print a new master edition, and update the central archive** (a 3-hour round trip!).

```text
MESI FORCED PRINTING PRESS TRIP (3-HOUR STALL)

 Branch 1 asks to read Book #42 ──► Branch 0 FORCED to drive to Central Press!
                                    (Waits 3 Hours for Press to Update!)
                                    Branch 1 gets copy after 3 HOURS!
```

Look at how foolish this is: Branch 1 just wanted to read the book! Forcing a 3-hour trip to the central printing press delayed Branch 1 and wasted time and fuel.


## Primitive 1: The MOESI Protocol Owner State ($O$)

Now that we possess a clear, intuitive mental model of the designated library custodian, let us examine the formal, rigorous engineering mechanics of **The MOESI Protocol Owner State ($O$)**.

The **MOESI Protocol** (pioneered in commercial microprocessors such as the AMD Opteron, AMD Phenom, and ARM AMBA 4 ACE architectures) expands the standard 4-state MESI protocol by adding a fifth state: **Owner ($O$)**.

To store five distinct states in digital hardware, each cache line entry inside the L1/L2 SRAM Tag array allocates **three status bits ($S_2, S_1, S_0$)**:

```text
PHYSICAL CACHE LINE METADATA WITH 3 MOESI STATE BITS

 ┌───────────────┬──────────────────────────┬───────────────────────────────┐
 │ MOESI State   │ Tag Bits                 │ Data Line Payload             │
 │ Bits [S2,S1,S0│ [63:15]                  │ [64 Bytes / 512 Bits]         │
 ├───────────────┼──────────────────────────┼───────────────────────────────┤
 │ 3 Bits        │ 49-Bit Physical Address  │ 64-Byte Stored Data Line      │
 └───────────────┴──────────────────────────┴───────────────────────────────┘
```


### The Single-Writer Multiple-Reader (SWMR) Invariant in MOESI

How does the addition of the Owner ($O$) state preserve the fundamental Single-Writer Multiple-Reader (SWMR) invariant?

Recall the SWMR invariant:
> At any given instant in time for address $A$, either a single core holds Exclusive Write access, or multiple cores hold Read-Only access.

In the MOESI protocol:
* When a line is in the **Owner ($O$) state** on Core 0, and in the **Shared ($S$) state** on Core 1 and Core 2:
  * Core 0 (Owner) has **Read-Only permission**.
  * Core 1 (Shared) has **Read-Only permission**.
  * Core 2 (Shared) has **Read-Only permission**.
* **Zero cores have Write permission!** 

The SWMR invariant is perfectly preserved! Even though the line is dirty ($D=1$), all cores holding the line are strictly restricted to Read-Only access until one core explicitly invalidates the others.


### Step-by-Step Hardware Execution Sequence of an Intervention

Let us trace the physical hardware steps when Core 1 experiences a read miss on address $A$, where address $A$ resides in Core 0's private L1 cache in the **Modified ($M$) state**:

#### Step 1: Read Request Broadcast ($t = 0\text{ ps}$)
Core 1 executes `LOAD R1, [Addr A]`. A read miss occurs in L1_1. Core 1 requests the bus and broadcasts a **`BusRd(A)`** command across the shared memory interconnect.

#### Step 2: Parallel Bus Snooping & `HITM` Assertion ($t = 312\text{ ps}$)
Core 0's Bus Snooper eavesdrops on `BusRd(A)` and checks its Duplicate Snoop Tag array.
* Core 0 detects that it holds line $A$ in the **Modified ($M$) state**.
* Core 0 immediately asserts the **`HITM` (Hit Modified / Shared-Dirty)** bus control line.

#### Step 3: Main DRAM Memory Abort ($t = 625\text{ ps}$)
The main memory DRAM controller snoops the bus and observes the `HITM` line driven High by Core 0.
* **DRAM Abort**: The DRAM controller recognizes that an on-chip private cache holds fresher data than main memory. The DRAM controller **aborts its slow off-chip DRAM read cycle**, saving electrical power!

#### Step 4: Peer-to-Peer SRAM Data Transfer ($t = 1250\text{ ps}$)
Core 0 reads the 64-byte payload directly from its local L1 SRAM array and drives the data onto the high-speed internal bus wires.
* Core 1 captures the 64-byte payload from the bus in just **12 clock cycles ($3.75\text{ ns}$)**!

#### Step 5: MOESI State Transition ($t = 3750\text{ ps}$)
* Core 1 writes the line into its L1 SRAM array and sets its state bits to **Shared ($S$)** ($V_1=1, D_1=0$).
* Core 0 updates its state bits from **Modified ($M$) to OWNER ($O$)** ($V_0=1, D_0=1$).
* **Main DRAM is NOT updated!**

```text
MOESI INTER-CACHE TRANSFER TIMING COMPARISON

 Standard MESI Forced Writeback: [ Writeback to DRAM (120c) ] ──► [ Read Fill to Core 1 (120c) ]
                                 (Total Stall = 240 Clock Cycles!)

 MOESI Cache-to-Cache Transfer : [ Peer-to-Peer Inter-Cache Transfer (12 Cycles) ]
                                 (Total Stall = 12 Clock Cycles! 95% Latency Cut!)
```

Look at the remarkable performance gain:
* Under standard MESI forced writeback, Core 1 stalled for **240 clock cycles** ($75\text{ ns}$) while data traveled back and forth to off-chip DRAM.
* Under MOESI inter-cache intervention, Core 1 received the data in **12 clock cycles** ($3.75\text{ ns}$)!
* **Latency was reduced by $95\%$**, and off-chip memory traffic dropped to **zero**!


### Detailed Analysis of Transitions Involving the Owner ($O$) State

Let us trace the specific state transitions that create, maintain, and clear the **Owner ($O$)** state:

#### 1. Creation of the Owner State ($M \to O$)
* **Initial State**: Core 0 holds line $A$ in **Modified ($M$) state**.
* **Trigger Event**: Core 1 snoops a read miss (`BusRd(A)`) from Core 1.
* **Transition Mechanics**:
  * Core 0 asserts `HITM` and supplies the 64-byte payload directly to Core 1 over the bus.
  * Core 1 enters **Shared ($S$) state**.
  * Core 0 transitions from **$M \longrightarrow \mathbf{O}$ (Owner)**!
  * Main DRAM is **not** updated.

$$\text{Snooped } \mathtt{BusRd} \text{ on } M \text{ State} \implies \text{Local State: } M \longrightarrow \mathbf{O}, \quad \text{Remote State: } I \longrightarrow \mathbf{S}$$


#### 3. Supplying Data to Additional Cores ($O \to O$)
* **Initial State**: Core 0 holds line $A$ in **Owner ($O$) state**; Core 1 holds $A$ in **Shared ($S$) state**.
* **Trigger Event**: Core 2 executes a load instruction, issuing `BusRd(A)`.
* **Transition Mechanics**:
  * Core 0 (the Owner) snoops `BusRd(A)`, intercepts the request, and drives line $A$ onto the bus to supply Core 2 directly!
  * Core 2 enters **Shared ($S$) state**.
  * Core 0 remains in **Owner ($O$) state**.
  * Main DRAM remains untouched!

$$\text{Snooped } \mathtt{BusRd} \text{ on } O \text{ State} \implies \text{Owner Supplies Data! Local State: } O \longrightarrow \mathbf{O}$$


#### 5. Eviction of an Owned Line ($O \to \text{Writeback} \to I$)
* **Initial State**: Core 0 holds line $A$ in **Owner ($O$) state**.
* **Trigger Event**: A cache miss on a new address forces Core 0 to evict line $A$ from its L1 cache.
* **Transition Mechanics**:
  * Because $D = 1$ in the Owner state, **Core 0 MUST write the 64-byte line back to main DRAM memory** before overwriting the SRAM slot!
  * Core 0 dispatches a 64-byte writeback to main DRAM.
  * Core 0 sets line $A$'s status to **Invalid ($I$)**.
  * **What about the other cores holding $S$ copies?**
    * Cores 1 and 2 continue holding line $A$ in **Shared ($S$) state**.
    * Since main DRAM has now been updated by Core 0's writeback, Cores 1 and 2's copies are now $100\%$ clean relative to DRAM!

```text
EVICTION OF AN OWNER LINE (MAIN DRAM UPDATED)

 Core 0 (Owner O) Evicts Line A ──► Writes 64B Payload back to Main DRAM
                                    Core 0 sets State -> INVALID (I)
                                    Cores 1 & 2 remain in SHARED (S) state!
                                    (Main DRAM is now up-to-date for Cores 1 & 2!)
```


### 2. ARM AMBA 4 ACE (AXI Coherency Extensions)

In mobile and enterprise ARM SoC architectures (such as ARM Cortex-A78, Neoverse, and Apple M-Series chips), multi-core cache coherence is governed by the **ARM AMBA 4 ACE specification**.

ARM ACE explicitly incorporates the five MOESI states, naming them:
* **Unique Dirty** ($M$ — Modified)
* **Shared Dirty** ($O$ — Owner)
* **Unique Clean** ($E$ — Exclusive)
* **Shared Clean** ($S$ — Shared)
* **Invalid** ($I$ — Invalid)

ARM's **Shared Dirty ($O$)** state allows high-efficiency big.LITTLE architectures (combining high-performance cores with power-efficient cores) to share modified data lines between cluster caches without writing to external L3 cache or DRAM!


### Scenario and Parameters

You are a principal memory systems architect auditing a $3.2\text{ GHz}$ 4-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor cores (Core 0, Core 1, Core 2, Core 3) each feature a private $32\text{-KB}$ L1 Data Cache ($64\text{-byte}$ lines) connected to a **Shared Snooping Memory Bus**.

```text
3.2 GHz 4-CORE COHERENCE SUBSYSTEM

 Core 0 (3.2 GHz) ──► [ L1 Data Cache 0 ] ──┐
 Core 1 (3.2 GHz) ──► [ L1 Data Cache 1 ] ──┼──► Shared Snooping Bus
 Core 2 (3.2 GHz) ──► [ L1 Data Cache 2 ] ──┼──► Shared L2 Cache / DRAM
 Core 3 (3.2 GHz) ──► [ L1 Data Cache 3 ] ──┘    Intervention Latency = 12 Cycles
```

#### Hardware Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 312.5\text{ ps}$).
* Ideal Execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming local L1 hits).
* L1 Data Cache: $32\text{ KB}$ capacity, $64\text{-byte}$ lines, $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Inter-Cache Intervention Latency (`Flush` / Cache-to-Cache Transfer): $T_{\text{intervene}} = 12\text{ clock cycles}$ ($3.75\text{ ns}$).
* Bus Invalidation Broadcast Latency (`BusUpgr`): $T_{\text{bus\_upgr}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).
* Main DRAM Read Fill / Writeback Latency: $T_{\text{DRAM}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).

#### Initial Subsystem State:
Physical memory address $A = \text{0x00010000}$ is currently **Invalid ($I$) across ALL FOUR CORES** ($S_0=I, S_1=I, S_2=I, S_3=I$).

#### Workload Execution Sequence (6 Operations):
1. **Op 1 ($t = 1\text{ ns}$, Core 0)**: Executes `STORE [0x00010000] = 10` (Write Miss).
2. **Op 2 ($t = 2\text{ ns}$, Core 1)**: Executes `LOAD R1, [0x00010000]` (Read Miss).
3. **Op 3 ($t = 3\text{ ns}$, Core 2)**: Executes `LOAD R2, [0x00010000]` (Read Miss).
4. **Op 4 ($t = 4\text{ ns}$, Core 3)**: Executes `LOAD R3, [0x00010000]` (Read Miss).
5. **Op 5 ($t = 5\text{ ns}$, Core 0)**: Executes `STORE [0x00010000] = 20` (Store on owned line).
6. **Op 6 ($t = 6\text{ ns}$, Core 0)**: Evicts line $A$ from L1_0 to make room for a new address.

#### Your Objective

1. Trace the exact state transitions ($S_0, S_1, S_2, S_3$) and bus transactions dispatched under **The Standard MESI Protocol**.
2. Trace the exact state transitions ($S_0, S_1, S_2, S_3$) and bus transactions dispatched under **The MOESI Protocol**.
3. Calculate total off-chip DRAM writeback transactions and total CPU stall cycles for MESI vs. MOESI.
4. Calculate the off-chip writeback bandwidth saved and the **Performance Speedup Factor** of MOESI over MESI.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Trace Execution under MOESI Protocol

##### Op 1 (Core 0 `STORE A = 10`):
* Write Miss. Core 0 broadcasts `BusRdX(A)`. DRAM fills line $A$. Core 0 writes $A = 10$ ($D_0 \Leftarrow 1$).
* **State**: $(S_0=\mathbf{M}, S_1=I, S_2=I, S_3=I)$. Stall = $120\text{ cycles}$.

##### Op 2 (Core 1 `LOAD A` — MOESI OWNER TRANSITION!):
* Read Miss in Core 1. Core 1 broadcasts `BusRd(A)`.
* Core 0 snoops `BusRd`, detects $S_0 = M$.
* **MOESI INTERVENTION**: Core 0 asserts `HITM` and supplies $A = 10$ directly to Core 1 over the bus ($12\text{ cycles}$ inter-cache transfer).
* **NO DRAM WRITEBACK IS ISSUED!** Main DRAM is NOT updated!
* Core 0 transitions to **OWNER ($O$) state** ($D_0=1$). Core 1 enters **SHARED ($S$) state** ($D_1=0$).
* **State**: $(S_0=\mathbf{O}, S_1=\mathbf{S}, S_2=I, S_3=I)$. Stall = **$12\text{ cycles}$ (Saved 108 cycles!)**.

##### Op 3 (Core 2 `LOAD A` — OWNER INTERVENTION!):
* Read Miss in Core 2. Core 2 broadcasts `BusRd(A)`.
* Core 0 (Owner) snoops `BusRd`, intercepts request, and supplies $A = 10$ directly to Core 2 over the bus ($12\text{ cycles}$).
* Main DRAM is NOT touched!
* **State**: $(S_0=O, S_1=S, S_2=\mathbf{S}, S_3=I)$. Stall = $12\text{ cycles}$.

##### Op 4 (Core 3 `LOAD A` — OWNER INTERVENTION!):
* Read Miss in Core 3. Core 3 broadcasts `BusRd(A)`.
* Core 0 (Owner) supplies $A = 10$ directly to Core 3 over the bus ($12\text{ cycles}$).
* **State**: $(S_0=O, S_1=S, S_2=S, S_3=\mathbf{S})$. Stall = $12\text{ cycles}$.

##### Op 5 (Core 0 `STORE A = 20`):
* Core 0 holds $S_0 = O$. Broadcasts `BusUpgr(A)` ($8\text{ cycles}$).
* Cores 1, 2, 3 invalidate ($S \to I$). Core 0 transitions $O \to \mathbf{M}$.
* **State**: $(S_0=\mathbf{M}, S_1=I, S_2=I, S_3=I)$. Stall = $8\text{ cycles}$.

##### Op 6 (Core 0 Evicts Line $A$):
* Core 0 holds $S_0 = M$ ($D_0 = 1$). Writes back dirty line $A$ to DRAM ($120\text{ cycles}$).
* **State**: $(S_0=I, S_1=I, S_2=I, S_3=I)$. Stall = $120\text{ cycles}$.

```text
MOESI PROTOCOL TOTAL STALL CYCLES
= Op1 (120c) + Op2 (12c Intervent!) + Op3 (12c) + Op4 (12c) + Op5 (8c) + Op6 (120c)
= 284 CLOCK CYCLES TOTAL STALL! (Saved 108 Clock Cycles!)
```


### Sanity Check and Verification

Let us verify our mathematical and protocol state results against MOESI rules:

1. **SWMR Invariant Verification**:
   * During Ops 2, 3, 4: Core 0 held Owner ($O$) state; Cores 1, 2, 3 held Shared ($S$) state.
   * All four cores held **Read-Only permission**. Zero cores held Write permission.
   * The SWMR invariant was preserved with $100\%$ mathematical precision throughout!
2. **DRAM Writeback Reduction Check**:
   * MESI executed 2 DRAM writebacks ($128\text{ bytes}$) because Op 2 forced an immediate writeback of dirty data to DRAM.
   * MOESI deferred the writeback until Op 6, executing only 1 DRAM writeback ($64\text{ bytes}$).
   * DRAM writeback traffic was reduced by exactly $50\%$, matching our prediction!
3. **Latency Savings Check**:
   * Op 2 latency in MESI = $120\text{ cycles}$ (DRAM writeback).
   * Op 2 latency in MOESI = $12\text{ cycles}$ (Inter-cache intervention).
   * Saved exactly $108\text{ cycles}$ ($33.75\text{ ns}$), matching $392 - 284 = 108\text{ cycles}$.

All MOESI state transitions, Owner state assignments, inter-cache interventions, DRAM writeback reductions, and speedup metrics evaluate with 100% mathematical, physical, and logical precision.

