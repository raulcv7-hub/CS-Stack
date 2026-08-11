---
title: "MESIF Protocol Forward State and Response Designation Mechanics"
---

# MESIF Protocol Forward State and Response Designation Mechanics

## The Redundant Shared Response Flood Problem

In modern multi-core processor architectures, execution cores are equipped with private Level 1 (L1) Data Caches to deliver sub-nanosecond $1\text{-cycle}$ memory access latencies. To ensure that multiple cores executing parallel threads do not read conflicting or stale values for the exact same memory address, hardware cache controllers enforce **The Single-Writer Multiple-Reader (SWMR) Invariant**: at any given instant in time, a memory line can either be held in a Read-Only Shared state by multiple cores, or held in an Exclusive Write state by at most one single core.

In standard 4-state **MESI (Modified, Exclusive, Shared, Invalid)** and 5-state **MOESI** coherence protocols, when multiple cores read the exact same memory address (such as shared operating system kernel structures, application code, or global read-only constants), the memory line resides in the private caches of those cores in the **Shared ($S$) state**.

In the Shared ($S$) state, the cache line is valid and clean (matching lower-level shared L2/L3 cache or main DRAM memory).

However, consider the severe hardware response collision hazard that occurs when a new core (e.g., Core 7) experiences an L1 cache read miss on that address and broadcasts a read request (`BusRd`) across the shared interconnect bus:

```text
THE SHARED RESPONSE FLOOD HAZARD (UN-DESIGNATED RESPONSES)

 Core 7 Issues Read Miss (BusRd 0x1000)
                   │
 ══════════════════╧═════════════════════════════════════════════════
                      SHARED SNOOPING MEMORY BUS
 ══════════┬══════════════════┬══════════════════┬═══════════════════
           │ Snooped!         │ Snooped!         │ Snooped!
           ▼                  ▼                  ▼
     Core 0 (Shared S)  Core 1 (Shared S)  Core 2 (Shared S)
     Holds 0x1000       Holds 0x1000       Holds 0x1000
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
 ALL 3 CORES ATTEMPT TO DRIVE DATA ONTO THE BUS SIMULTANEOUSLY!
 (Electrical Signal Contention, Bus Collisions, and Bandwidth Flood!)
```

Trace the physical hardware breakdown in this scenario:
1. Cores 0, 1, and 2 all hold address `0x1000` in the **Shared ($S$) state**.
2. Core 7 executes a load instruction reading address `0x1000` and broadcasts a `BusRd(0x1000)` command across the shared bus.
3. Cores 0, 1, and 2 all snoop `BusRd(0x1000)` simultaneously.
4. **THE RESPONSE FLOOD COLLISION**: If the protocol rules permit any core holding a valid copy to supply data on a read request, **Cores 0, 1, and 2 will ALL attempt to drive the 64-byte data payload onto the bus wires at the exact same physical nanosecond**!

Driving multiple output transistor drivers onto the shared bus wires simultaneously causes an **Electrical Signal Collision**. 

Voltage levels mangle, bus arbitration fails, and massive dynamic power is wasted as three separate cache controllers redundantly read their SRAM arrays and drive identical data onto the interconnect.

### The Naive Alternative: Forcing DRAM Memory Reads

To prevent signal collisions on shared lines, basic MESI protocols enforce a strict rule:
> *"Cores holding lines in the Shared ($S$) state are FORBIDDEN from driving data onto the bus! Only main DRAM memory (or a shared L2 cache) may respond to read requests for Shared lines."*

While this rule prevents bus collisions, it introduces a severe performance penalty:
* Main DRAM memory access takes **120 to 200 CPU clock cycles** ($35 \text{ to } 50\text{ nanoseconds}$).
* Core 7 is forced to stall for 150 cycles waiting for off-chip DRAM to return a line that is **ALREADY sitting inside three on-chip L1 caches 1 nanosecond away**!

We are trapped in an architectural dilemma:
1. If all cores holding a Shared line respond, they **collide and flood the bus** with redundant data.
2. If no core holding a Shared line responds, the requesting core pays a **150-cycle DRAM latency penalty** to fetch data that already exists on-chip!

To resolve this collision dilemma and enable $1\text{-cycle}$ peer-to-peer data transfers for clean shared lines without response flooding, Intel developed **The MESIF Coherence Protocol** by introducing **The Forward ($F$) State** and **Response Designation**.


### Scenario A: No Designated Spokesperson (Shared Response Collision)
All 8 students holding the study guide jump up at the exact same second, open their mouths, and start reading the study guide out loud simultaneously!

* The classroom devolves into an un-intelligible wall of overlapping noise (**Bus Contention / Collision**). 
* Student 8 cannot understand a single word, and the entire classroom wastes energy shouting the exact same text.


### Scenario C: The Designated Spokesperson (The MESIF Forward State $[F]$)

To solve both problems, the teacher assigns a special **Red Badge ([F] Forward Badge)** to **ONLY ONE student** among the group holding the study guide (for example, Student 7, the last student who received the guide).

```text
DESIGNATED SPOKESPERSON WITH THE [F] FORWARD BADGE

 Student 0 .. Student 6 : Hold Study Guide with [S] SHARED Badge (Silent!)
 Student 7              : Holds Study Guide with [F] FORWARD Badge (Spokesperson!)
```

Look at how the classroom operates when late Student 8 asks for the study guide:

1. Student 8 asks: *"Can someone share the study guide with me?"*
2. Students 0 through 6 look at their desk badges: **`[S] SHARED`**. They keep their mouths closed and stay silent ($0\text{ noise}$)!
3. Student 7 looks at their desk badge: **`[F] FORWARD`**!
4. Student 7 steps forward, hands a copy directly to Student 8 in **2 seconds** (**Peer-to-Peer Inter-Cache Transfer**), and says: *"Here is the study guide, and HERE IS THE [F] FORWARD BADGE!"*
5. Student 7 changes their own badge to **`[S] SHARED`**, while Student 8 puts on the **`[F] FORWARD`** badge!

```text
FORWARD STATE MIGRATION SEQUENCE

 Student 8 asks for Study Guide ──► Student 7 (holds [F]) hands copy in 2 Seconds!
                                    Student 7 changes badge from [F] -> [S] SHARED.
                                    Student 8 receives copy and takes [F] FORWARD badge!
                                    (Teacher never left the room! Zero 20-minute delays!)
```

Notice what this designated spokesperson protocol achieved:
* **Zero Response Collisions**: Exactly ONE student (Student 7) opened their mouth and responded. Students 0 through 6 remained completely silent.
* **Instant Peer Delivery**: Student 8 received the study guide in 2 seconds instead of waiting 20 minutes for the teacher to walk to the printing office!
* **Forward State Migration**: The `[F]` Forward badge migrated to Student 8 (the newest requester), ensuring that the designated spokesperson is always the most recent, most active student in the room!

This designated spokesperson protocol is the exact physical analogue of **The MESIF Coherence Protocol**:
* Students 0 through 9 are **CPU Cores 0 through 9**.
* The study guide is a **64-Byte Cache Line ($A$)**.
* The teacher's printing office is **Main System DRAM Memory**.
* The `[S] SHARED` badge is the **MESI Shared ($S$) State**.
* The `[F] FORWARD` badge is the **MESIF Forward ($F$) State**.
* Passing the `[F]` badge to Student 8 is **Forward State Migration**.


### Formal Definition and Invariants of the Five MESIF States

Let us define the exact properties, permissions, dirtiness status, and response duties for all five MESIF states:

```text
MESIF STATE DEFINITION AND PROPERTY MATRIX

 State Name    │ Encoding [S2,S1,S0] │ Valid? │ Dirty? │ Sharing Status │ Supply Duty on BusRd
───────────────┼─────────────────────┼────────┼────────┼────────────────┼───────────────────────
 [M] Modified  │        3'b111       │ YES    │ YES    │ Private (1)    │ YES (Intervenes!)
 [E] Exclusive │        3'b101       │ YES    │ NO     │ Private (1)    │ YES (Supplies Data)
 [F] Forward   │        3'b110       │ YES    │ NO     │ Shared (>= 2)  │ YES (Designated Responder!)
 [S] Shared    │        3'b011       │ YES    │ NO     │ Shared (>= 2)  │ NO (FORBIDDEN to respond!)
 [I] Invalid   │        3'b000       │ NO     │ NO     │ None (0)       │ None
```

#### 1. Modified State ($M$ — `3'b111`)
* **Properties**: Valid ($V=1$), Dirty ($D=1$), Private (held by $1$ core).
* **Meaning**: The line was modified by the local core. Main DRAM holds stale data.
* **Permissions**: Full local Read and Write permissions in $1\text{ clock cycle}$ with $0\text{ bus traffic}$.

#### 2. Exclusive State ($E$ — `3'b101`)
* **Properties**: Valid ($V=1$), Clean ($D=0$), Private (held by $1$ core).
* **Meaning**: The line matches main DRAM, and no other core holds a copy.
* **Permissions**: Read-Only locally, with **Silent Write Upgrade ($E \to M$)** in $1\text{ clock cycle}$ without broadcasting bus invalidations!

#### 3. Forward State ($F$ — `3'b110`) — THE FIFTH STATE!
* **Properties**: Valid ($V=1$), **Clean ($D=0$, 100% identical to main DRAM!)**, **Shared ($N \ge 2$ cores hold copies)**.
* **Meaning**: The line is a clean shared copy, BUT this specific core has been selected as the **Single Designated Responder**!
* **RESPONSE DESIGNATION**: When a remote core issues a read request (`BusRd`), **ONLY the core holding the $F$ state is permitted to respond and drive data onto the bus**!
* **Permissions**: Read-Only locally. Writing requires broadcasting `BusUpgr` to invalidate all other copies before upgrading $F \to M$.

#### 4. Shared State ($S$ — `3'b011`)
* **Properties**: Valid ($V=1$), Clean ($D=0$), Shared ($N \ge 2$ cores).
* **Meaning**: The line is a clean read-only copy. Another core holds the line in the $F$ state (or main DRAM is used).
* **RESPONSE CONSTRAINT**: Cores holding lines in the $S$ state are **EXPLICITLY FORBIDDEN from responding to `BusRd` requests**! They must listen silently, preventing bus collisions.

#### 5. Invalid State ($I$ — `3'b000`)
* **Properties**: Invalid ($V=0$). Contains no usable data. Accesses trigger cache misses.


## Primitive 2: Response Designation and Forward State Migration Mechanics

Now let us examine the formal hardware mechanics of **Response Designation** and **Forward State Migration**.

### The Forward State Migration Protocol

When a core holding a line in the Forward ($F$) state responds to a read request from a new core, who should hold the Forward ($F$) state after the transfer completes?

In the MESIF protocol, the Forward state is **migrated to the new requesting core**!

```text
FORWARD STATE MIGRATION PROTOCOL

 Core 0 holds Line A in Forward (F) State │ Core 1 holds Line A in Shared (S) State
                                         │
 Core 2 Issues Read Request (BusRd A)   ──┘
                                 │
                                 ▼
 Core 0 (F-Holder) Snoop Detects BusRd(A):
 1. Core 0 drives 64B Line A payload onto bus to supply Core 2.
 2. Core 0 transitions its local state from FORWARD -> SHARED (F -> S)!
 3. Core 2 receives Line A and enters FORWARD (F) state!
```

#### Trace the $F$-State Migration Sequence:
1. Core 0 holds line $A$ in **Forward ($F$) state**. Core 1 holds line $A$ in **Shared ($S$) state**.
2. Core 2 executes a load instruction, missing in L1, and broadcasts `BusRd(A)` across the bus.
3. Cores 0 and 1 both snoop `BusRd(A)`:
   * Core 1 sees its state is $S$ $\implies$ **Stays silent!** ($0\text{ bus activity}$).
   * Core 0 sees its state is $F$ $\implies$ **Responds!** Core 0 reads line $A$ from its L1 SRAM array and drives the 64-byte payload onto the bus.
4. **State Transition & Migration**:
   * Core 0 yields the $F$ state and transitions from **$\text{Forward } (F) \longrightarrow \mathbf{\text{Shared } (S)}$**.
   * Core 2 captures the 64-byte payload from the bus and enters **$\mathbf{\text{Forward } (F)}$ state**!


## Complete MESIF Finite State Machine (FSM) Transitions

To implement MESIF in synthesizable digital logic, every cache line's 3-bit status register ($S_2, S_1, S_0$) is governed by an expanded 5-state Finite State Machine.

### The Complete MESIF State Transition Matrix

The following comprehensive matrix specifies all state transitions, output actions, and bus transactions for the five MESIF states:

```text
COMPLETE MESIF PROTOCOL TRANSITION MATRIX

 Current │ Local PrRd     │ Local PrWr      │ Snooped BusRd    │ Snooped BusRdX / BusUpgr
 State   │ (Local Load)   │ (Local Store)   │ (Remote Read)    │ (Remote Write / Invalidate)
─────────┼────────────────┼─────────────────┼──────────────────┼────────────────────────────
 [I]     │ Miss -> BusRd  │ Miss -> BusRdX  │ No Action        │ No Action
 Invalid │ -> F (if shd)  │ -> M            │                  │
         │ -> E (if solo) │                 │                  │
─────────┼────────────────┼─────────────────┼──────────────────┼────────────────────────────
 [S]     │ Hit -> S       │ Hit -> BusUpgr  │ Keep Silent      │ Invalidate Line
 Shared  │ (0 Bus)        │ -> M            │ -> S             │ -> I
─────────┼────────────────┼─────────────────┼──────────────────┼────────────────────────────
 [E]     │ Hit -> E       │ SILENT UPGRADE! │ Supply Data      │ Invalidate Line
 Excl.   │ (0 Bus)        │ -> M (0 Bus!)   │ -> S (New is F)  │ -> I
─────────┼────────────────┼─────────────────┼──────────────────┼────────────────────────────
 [F]     │ Hit -> F       │ Hit -> BusUpgr  │ RESPOND / SUPPLY!│ Invalidate Line
 Forward │ (0 Bus)        │ -> M            │ -> S (Migrates F)│ -> I
─────────┼────────────────┼─────────────────┼──────────────────┼────────────────────────────
 [M]     │ Hit -> M       │ Hit -> M        │ Intervene (Dirty)│ Intervene (Dirty)
 Modified│ (0 Bus)        │ (0 Bus)         │ Supply Data -> S │ Supply Data -> I
```


#### 2. Re-Accessing a Forward Line Locally ($F \to F$)
* **Initial State**: Core 0 holds line $A$ in **Forward ($F$) state**.
* **Trigger Event**: Core 0 executes a local load instruction (`PrRd`).
* **Transition Mechanics**:
  * L1 Cache Hit! Data is read directly from Core 0's L1 SRAM array in $1\text{ clock cycle}$.
  * Zero bus transactions issued.
  * State remains **Forward ($F$)**.

$$\text{Local } \mathtt{PrRd} \text{ on } F \text{ State} \implies \text{Local State: } F \longrightarrow \mathbf{F} \quad (\text{1-Cycle L1 Hit})$$


#### 4. Upgrading a Forward Line to Modified ($F \to M$)
* **Initial State**: Core 0 holds line $A$ in **Forward ($F$) state**; Cores 1 and 2 hold $A$ in **Shared ($S$) state**.
* **Trigger Event**: Core 0 wants to write to line $A$ (`PrWr`).
* **Transition Mechanics**:
  * Core 0 holds a clean copy, but other cores hold read-only copies ($S$).
  * Core 0 broadcasts **`BusUpgr(A)`** across the bus ($8\text{ stall cycles}$).
  * Cores 1 and 2 snoop `BusUpgr` and invalidate their local copies ($S \to I$).
  * Core 0 updates line $A$ in SRAM, sets $D_0 \Leftarrow 1$, and transitions from **$F \longrightarrow \mathbf{M}$ (Modified)**!

$$\text{Local } \mathtt{PrWr} \text{ on } F \text{ State} \implies \text{Broadcasts } \mathtt{BusUpgr}, \quad \text{Local State: } F \longrightarrow \mathbf{M}$$


## Silicon Realities: Intel QPI / UPI Interconnects and Multi-Socket Scaling

In commercial semiconductor design, the MESIF protocol is the foundation of Intel's high-performance server architectures (such as Xeon E5, Xeon Scalable, and Ice Lake processors) communicating over **QuickPath Interconnect (QPI)** and **Ultra Path Interconnect (UPI)** point-to-point links.

### Why Intel Created MESIF for Multi-Socket Xeon Servers

In a multi-socket enterprise server containing 4 CPU sockets (64 total cores) connected by point-to-point QPI/UPI links:

```text
4-SOCKET XEON SERVER QPI INTERCONNECT TOPOLOGY

 Socket 0 (16 Cores) ═════ QPI Link 0 ═════► Socket 1 (16 Cores)
        ║                                           ║
     QPI Link 1                                 QPI Link 2
        ║                                           ║
        ▼                                           ▼
 Socket 2 (16 Cores) ═════ QPI Link 3 ═════► Socket 3 (16 Cores)
```

Suppose a shared memory page (such as Linux kernel code) is loaded into the L2/L3 caches of all 4 sockets:
* Under standard MESI without response designation, if a core on Socket 3 requests a line, all 3 other sockets might attempt to respond over QPI links, saturating the inter-socket interconnect wires with redundant response packets.
* Under **MESIF**: **ONLY ONE socket holds the $F$ state** for that line!
* When Socket 3 requests the line, **only the designated $F$-socket transmits a single response packet** across the QPI link.

Inter-socket link traffic is reduced by **over $66\%$**, preventing QPI interconnect bottlenecks and allowing 4-socket and 8-socket Xeon servers to achieve linear scaling on enterprise database workloads!


### Scenario and Parameters

You are a principal memory systems architect auditing a $3.2\text{ GHz}$ 4-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor cores (Core 0, Core 1, Core 2, Core 3) each feature a private $32\text{-KB}$ L1 Data Cache ($64\text{-byte}$ lines) connected to a **Shared Snooping Memory Bus**.

```text
3.2 GHz 4-CORE MESIF COHERENCE MEMORY SUBSYSTEM

 Core 0 (3.2 GHz) ──► [ L1 Data Cache 0 ] ──┐
 Core 1 (3.2 GHz) ──► [ L1 Data Cache 1 ] ──┼──► Shared Snooping Bus
 Core 2 (3.2 GHz) ──► [ L1 Data Cache 2 ] ──┼──► Shared L2 Cache / DRAM
 Core 3 (3.2 GHz) ──► [ L1 Data Cache 3 ] ──┘    Intervention Latency = 12 Cycles
```

#### Hardware Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 312.5\text{ ps}$).
* Ideal Execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming local L1 hits).
* L1 Data Cache: $32\text{ KB}$ capacity, $64\text{-byte}$ lines, $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Inter-Cache Intervention / Peer Response Latency (`Flush` / $F$-State Supply): $T_{\text{intervene}} = 12\text{ clock cycles}$ ($3.75\text{ ns}$).
* Bus Invalidation Broadcast Latency (`BusUpgr`): $T_{\text{bus\_upgr}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).
* Main DRAM Read Fill Latency (`BusRd` from DRAM): $T_{\text{DRAM}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).

#### Initial Memory Subsystem State:
Physical memory address $A = \text{0x00010000}$ initially holds value $500_{10}$ in main DRAM memory.
* Line $A$ is in **INVALID ($I$) state across ALL FOUR CORES** ($S_0=I, S_1=I, S_2=I, S_3=I$).

#### Workload Execution Sequence (6 Operations):
1. **Op 1 ($t = 1\text{ ns}$, Core 0)**: Executes `LOAD R1, [0x00010000]` (Read Miss).
2. **Op 2 ($t = 2\text{ ns}$, Core 1)**: Executes `LOAD R2, [0x00010000]` (Read Miss).
3. **Op 3 ($t = 3\text{ ns}$, Core 2)**: Executes `LOAD R3, [0x00010000]` (Read Miss).
4. **Op 4 ($t = 4\text{ ns}$, Core 3)**: Executes `LOAD R4, [0x00010000]` (Read Miss).
5. **Op 5 ($t = 5\text{ ns}$, Core 3)**: Executes `STORE [0x00010000] = 700` (Store on $F$-state line).
6. **Op 6 ($t = 6\text{ ns}$, Core 3)**: Evicts line $A$ from L1_3 to make room for a new address.

#### Your Objective

1. Trace the exact MESIF state transitions ($S_0, S_1, S_2, S_3$) for line $A$ across all 4 cores after EACH of the 6 operations.
2. Identify which core is designated as the **$F$-state responder** after each operation and trace $F$-state migration.
3. Calculate total DRAM read fills, inter-cache peer responses, and total stall cycles under the MESIF protocol.
4. Calculate the percentage reduction in DRAM read stalls and the **Performance Speedup Factor** of MESIF over a naive protocol that forces all clean shared reads to fetch from DRAM.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Quantify Performance and DRAM Stall Savings

Let us evaluate total DRAM read fills, peer responses, and stall cycles under MESIF versus a naive protocol that forces all clean shared reads to fetch from DRAM:

##### 1. Naive Protocol Performance (Forced DRAM Read Fills):
Under naive protocol where $S$-state cores cannot respond:
* Op 1: DRAM Read Fill ($120\text{ cycles}$).
* Op 2: DRAM Read Fill ($120\text{ cycles}$).
* Op 3: DRAM Read Fill ($120\text{ cycles}$).
* Op 4: DRAM Read Fill ($120\text{ cycles}$).
* Op 5: Bus Upgrade ($8\text{ cycles}$).
* Op 6: DRAM Writeback ($120\text{ cycles}$).

$$\text{Total Stall Cycles (Naive)} = 120 + 120 + 120 + 120 + 8 + 120 = \mathbf{508 \text{ clock cycles}} \quad (158.75\text{ ns})$$

##### 2. MESIF Protocol Performance (Designated $F$-State Peer Responses):
Under MESIF:
* Op 1: DRAM Read Fill ($120\text{ cycles}$).
* Op 2: Peer Response from Core 0 ($12\text{ cycles}$).
* Op 3: Peer Response from Core 1 ($12\text{ cycles}$).
* Op 4: Peer Response from Core 2 ($12\text{ cycles}$).
* Op 5: Bus Upgrade ($8\text{ cycles}$).
* Op 6: DRAM Writeback ($120\text{ cycles}$).

$$\text{Total Stall Cycles (MESIF)} = 120 + 12 + 12 + 12 + 8 + 120 = \mathbf{284 \text{ clock cycles}} \quad (88.75\text{ ns})$$

##### 3. Calculate Performance Speedup Factor:

$$\text{Speedup}_{\text{MESIF}} = \frac{\text{Stall Cycles}_{\text{Naive}}}{\text{Stall Cycles}_{\text{MESIF}}} = \frac{508\text{ cycles}}{284\text{ cycles}} \approx \mathbf{1.789\times \text{ Performance Advantage!}}$$

```text
MESIF PROTOCOL OPTIMIZATION RESULTS SUMMARY

 Architectural Metric   │ Naive Protocol (DRAM Reads)│ MESIF Protocol (F-State)  │ MESIF Gain
────────────────────────┼────────────────────────────┼───────────────────────────┼───────────────────
 DRAM Read Line Fills   │ 4 DRAM Read Fills          │ 1 DRAM Read Fill          │ 75% Less DRAM Reads!
 Peer Inter-Cache Reads │ 0 Peer Transfers           │ 3 Peer Transfers          │ 10x Faster Reads!
 Total Execution Stalls │ 508 Clock Cycles           │ 284 Clock Cycles          │ 224 Cycles Saved!
 Total Time in Ns       │ 158.75 ns                  │ 88.75 ns                  │ 70.00 ns Saved!
 Overall Speedup Factor │ 1.00x (Base Naive)         │ 1.789x FASTER!            │ 78.9% SPEEDUP!
```

##### Engineering Conclusion:
By designating a single $F$-state responder for clean shared lines, MESIF eliminated **$75\%$ of off-chip DRAM read fills** for shared accesses and delivered a **$1.79\times$ performance speedup ($78.9\%$ throughput gain)** while completely preventing response collisions on the shared bus!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **MESIF Forward State ($F$)**: The fifth cache line status state in the MESIF protocol ($V=1, D=0, \text{Shared}$) that marks a single clean shared copy of a line as the designated peer responder for future bus read queries, enabling $12\text{-cycle}$ inter-cache data transfers without off-chip DRAM fetches.
* **Response Designation**: The hardware coherence arbitration rule that permits ONLY the $F$-state holder (or $M$/$O$-state holder) to drive data onto the shared bus in response to a `BusRd` query, forcing all $S$-state holders to remain silent to prevent interconnect signal collisions.
