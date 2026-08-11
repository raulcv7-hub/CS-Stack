---
title: "Target Row Refresh (TRR) Bypass Mechanics and Complex Multi-Row Hammering Patterns"
---

# Target Row Refresh (TRR) Bypass Mechanics and Complex Multi-Row Hammering Patterns

In high-density Dynamic Random-Access Memory (DRAM) memory modules, physical memory storage cells are fabricated at sub-20-nanometer dimensions, placing parallel copper control lines known as wordlines just a few dozen silicon atoms apart. When an unprivileged software process repeatedly activates and precharges a memory row (an Aggressor Row), high-voltage electrical pulses ($V_{\text{PP}} \approx 2.5\text{ V} - 3.0\text{ V}$) applied to its wordline induce parasitic capacitive cross-coupling and sub-threshold leakage current in adjacent un-accessed memory rows (Victim Rows). To defend DRAM against this physical Rowhammer vulnerability without incurring the massive power and bandwidth penalties of globally doubling or quadrupling background refresh rates, memory manufacturers integrated an inline hardware mitigation known as **Target Row Refresh (TRR)** into DDR4 memory controllers and on-die DRAM chips. Target Row Refresh works by monitoring row activation traffic in real time using hardware sampling registers or small activation counters. When a specific wordline is activated beyond a safety threshold within a 64-millisecond refresh window, TRR flags that wordline as a Rowhammer threat and automatically issues a targeted emergency refresh cycle to its immediate physical neighbors ($WL_{V-1}$ and $WL_{V+1}$) before their capacitors leak enough electrical charge to flip a bit. However, hardware architects designed TRR under two fundamental assumptions: first, that an attacker hammers at most one or two aggressor rows (single-sided or double-sided hammering), and second, that electrical disturbance affects only immediate physical neighbors at a distance of one row ($WL_{V \pm 1}$). Because internal TRR tracking tables have a small, fixed capacity (typically tracking only 4 to 8 active rows per bank) and rely on periodic or probabilistic sampling, complex non-uniform multi-row activation patterns can overflow TRR tracking tables, cause the sampling logic to miss the primary aggressors, or leak charge into victim rows through distance-2 intermediate rows. By executing complex non-uniform hammering patterns across dozens of rows—a technique known as **Many-Sided Hammering**—or by hammering rows two steps away to exploit intermediate row coupling—known as **Half-Double Hammering**—unprivileged software can completely bypass hardware Target Row Refresh, causing destructive bit-flips in modern DRAM modules that were certified as Rowhammer-immune.

```text
TARGET ROW REFRESH (TRR) TABLE OVERFLOW BYPASS

 Incoming Multi-Row Activation Stream (16 Aggressor Rows)
 ──► [ Row A0 ] [ Row A1 ] [ Row A2 ] ... [ Row A15 ] ──►
                               │
                               ▼
 ┌───────────────────────────────────────────────────────────┐
 │ HARDWARE TRR SAMPLING TABLE (Capacity: 4 Slots)           │
 │ Slot 0: [ Row A0 ]  (Count = 12)                          │
 │ Slot 1: [ Row A1 ]  (Count = 14)                          │
 │ Slot 2: [ Row A2 ]  (Count = 11)                          │
 │ Slot 3: [ Row A3 ]  (Count = 10) ◄── 100% FULL!          │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
 New Row A4 Arrives ──► Table Overflows! Evicts Row A0 Entry!
 (Primary Aggressor A0 is forgotten! Emergency Refresh NEVER issued!)
```


### Analogy 2: The Stepping Stones in the Pond (Half-Double Distance-2 Coupling)

Now, consider a second physical scenario that tricks the bouncer: stepping stones in a pond.

Suppose Lounge 10 (the Victim Row $WL_V$) is separated from Lounge 8 (Aggressor Row $WL_{V-2}$) by an intermediate lounge, Lounge 9 ($WL_{V-1}$).

The bouncer enforces a strict rule: *"I only watch immediate next-door neighbors! If Room 9 slams its door, I stabilize Room 10. But if Room 8 slams its door, I ignore Room 10 because Room 8 is two doors away!"*

```text
HALF-DOUBLE STEPPING STONE ANALOGY

 Room 8 (Aggressor V-2)   Room 9 (Intermediate V-1)   Room 10 (Victim V)
 ┌──────────────────────┐  ┌────────────────────────┐  ┌──────────────────────┐
 │ Slams Door 200,000x! ┼─►│ Wall Vibrates & Shakes ┼─►│ Champagne Tower      │
 │ (Distance 2)         │  │ (Passes Energy Along!) │  │ Collapses & Breaks!  │
 └──────────────────────┘  └────────────────────────┘  └──────────────────────┘
  (Bouncer watches ONLY Room 9! Bouncer ignores Room 8 -> Room 10 breaks!)
```

Watch what happens when the prankster slams the door of **Room 8 (Distance 2)** 200,000 times while lightly tapping the door of **Room 9 (Distance 1)** 10 times:
1. Room 8's massive door slams shake the thin wall of intermediate Room 9.
2. Room 9's structure absorbs the heavy energy and flexes, acting like a bridge that transfers the mechanical shockwave **straight through Room 9 into Room 10**!
3. Room 10's champagne table vibrates intensely, and the glasses shatter!
4. **The Bypass Event**: The bouncer looks at their clipboard. Room 9 was tapped only 10 times (below the 100 threshold). Room 8 was slammed 200,000 times, but the bouncer's rules say Room 8 is two doors away and cannot affect Room 10!
5. The bouncer **does nothing**, and the glasses in Room 10 break!

These two real-world scenarios represent the two primary hardware bypass mechanisms against Target Row Refresh:
* **Many-Sided Hammering (The Overwhelmed Bouncer)**: Activating dozens of aggressor rows in a non-uniform sequence to overflow TRR sampling tables and reset activation counters.
* **Half-Double Hammering (The Stepping Stones)**: High-frequency hammering of a distance-2 row ($WL_{V-2}$) combined with light activation of a distance-1 row ($WL_{V-1}$) to transfer charge across intermediate silicon structures into Victim Row $WL_V$, completely bypassing distance-1 TRR inspection.


### 1. Sampling-Based TRR Architectures

In a **Sampling-Based TRR** implementation, the hardware does not count every single row activation. Instead, it uses a pseudo-random or periodic timer to sample the row address currently being driven onto the DRAM address bus.

```text
SAMPLING-BASED TRR OPERATIONAL FLOW

 DRAM Address Bus (Incoming ACT Commands)
 ═════════════════════════════════════════════════════════════════════
   │
   ▼ Periodic / Probabilistic Sampler (1 out of K Activations)
 ┌───────────────────────────────────────────────────────────────────┐
 │ SAMPLING REGISTER                                                 │
 │ Captures Active Row Address A_sample                              │
 └─────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │ EMERGENCY REFRESH GENERATOR                                       │
 │ During next Refresh Window, issues hidden refreshes to:            │
 │ Target Rows: A_sample - 1  and  A_sample + 1                      │
 └───────────────────────────────────────────────────────────────────┘
```

#### The Sampling Mechanism:
1. Every $K$-th row activation (for example, 1 out of every 64 `ACTIVATE` commands), a hardware latch captures the active row address $A_{\text{sample}}$.
2. The captured address $A_{\text{sample}}$ is stored in a temporary holding register.
3. When the host memory controller issues a standard Auto-Refresh command (`REF`) or during an idle bus interval, the DRAM chip's internal logic modifies the refresh address to issue a **Targeted Refresh** to $A_{\text{sample}} - 1$ and $A_{\text{sample}} + 1$.

#### Why Sampling TRR Fails:
If an attacker hammers an aggressor row $WL_A$ uniformly, sampling will eventually catch $WL_A$. 

However, if the attacker modulates the activation frequencies of multiple rows—hammering $WL_A$ in short, intense bursts interspersed with activations of dozens of other dummy rows—the probability of the sampler capturing $WL_A$ during its specific active sampling window drops significantly!


## TRR Bypass Primitive 1: Many-Sided Hammering (Blacksmith Concept)

The first major breakthrough in bypassing Target Row Refresh is **Many-Sided Hammering** (generalized by the *Blacksmith* research framework).

Many-Sided Hammering exploits the finite capacity $N_{\text{slots}}$ and table replacement policies of counter-based and sampling-based TRR implementations.

### The Mathematics of Table Replacement Overflow

Suppose a DRAM bank's TRR unit contains $N_{\text{slots}} = 4$ tracking slots.

An attacker identifies $M$ distinct aggressor rows ($A_0, A_1, A_2, \dots, A_{M-1}$) that all reside in the same DRAM bank, where $M > N_{\text{slots}}$ (for example, $M = 16$ aggressor rows).

```text
MANY-SIDED HAMMERING TABLE FLUSHING CYCLE

 Attacker Access Stream: [ A0 ][ A1 ][ A2 ][ A3 ][ A4 ] ... [ A15 ]
                           │      │      │      │      │
 TRR Slot 0 :             [A0] ──┼──────┼──────┼─────►[A4] (A0 Evicted!)
 TRR Slot 1 :                    [A1] ──┼──────┼─────►[A5] (A1 Evicted!)
 TRR Slot 2 :                           [A2] ──┼─────►[A6] (A2 Evicted!)
 TRR Slot 3 :                                  [A3]──►[A7] (A3 Evicted!)
 (Every entry is evicted BEFORE its counter can reach the refresh threshold!)
```

Trace how the TRR table behaves as the attacker sweeps through all 16 aggressor rows:

1. The attacker activates $A_0, A_1, A_2, A_3$. The 4 TRR slots are filled with $A_0, A_1, A_2, A_3$ (each with count $C = 1$). The table is now **$100\%$ full**.
2. The attacker activates $A_4$. Because all 4 slots are occupied, the TRR controller's replacement policy evicts $A_0$ to allocate a slot for $A_4$!
3. The attacker activates $A_5$. The TRR controller evicts $A_1$ to allocate a slot for $A_5$.
4. As the attacker continues sweeping through $A_6 \dots A_{15}$, **older aggressor entries are continuously evicted and wiped from the TRR table**!
5. When the attacker loops back and activates $A_0$ again, the TRR controller treats $A_0$ as a brand-new row, re-allocating a slot with count $C = 1$!

#### The Hardware Result:
Even though $A_0$ has been activated $50,000$ times over the course of the 64-millisecond refresh window, **its count in the TRR table never exceeds 2 or 3** because its table slot is continuously evicted and reset by activations of the other 15 aggressor rows!

TRR never detects $A_0$ as a threat, no emergency refresh is ever issued to Victim Row $V$, and the cumulative charge leakage in $WL_V$ causes a **destructive bit-flip**!


## TRR Bypass Primitive 2: Half-Double Hammering (Distance-2 Coupling)

The second major breakthrough in bypassing Target Row Refresh is **Half-Double Hammering**.

Half-Double hammering exploits a fundamental structural assumption built into almost all TRR implementations: **The Distance-1 Isolation Assumption**.

When a TRR controller identifies an aggressor row $WL_A$, it issues emergency refreshes **ONLY to immediate physical neighbors**: $WL_{A-1}$ and $WL_{A+1}$ (Distance 1).

```text
THE DISTANCE-1 TRR ASSUMPTION VS DISTANCE-2 HALF-DOUBLE LEAKAGE

 Memory Row Layout
 ┌─────────────────────────────────────────────────────────────┐
 │ AGGRESSOR ROW A (Row V - 2)   : HAMMERED HEAVILY (200,000x) │ ◄── Distance 2
 ├─────────────────────────────────────────────────────────────┤
 │ INTERMEDIATE ROW B (Row V - 1): TAPPED LIGHTLY (100x)       │ ◄── Distance 1
 ├─────────────────────────────────────────────────────────────┤
 │ TARGET VICTIM ROW V           : SHAKEN BY COUPLED LEAKAGE!  │ ◄── Target Victim
 └─────────────────────────────────────────────────────────────┘
  (TRR refreshes Row B because A is active, but TRR NEVER refreshes Row V!)
```


### Why TRR Fails Completely Against Half-Double

Now, observe why TRR hardware logic is completely blind to this Half-Double attack:

1. **TRR Inspects Row $A$ ($WL_{V-2}$)**:
   * TRR sees Row $A$ activated $200,000$ times.
   * TRR identifies Row $A$ as an aggressor and issues emergency refreshes to Row $A$'s immediate neighbors: **Row $A-1$ and Row $A+1$ (Row $B$)**.
   * **Row $B$ is refreshed!**

2. **TRR Inspects Row $B$ ($WL_{V-1}$)**:
   * TRR checks Row $B$'s activation count.
   * Row $B$ was activated **only 10 times**!
   * $10 < N_{\text{threshold}}$ ($1,024$). TRR concludes: *"Row $B$ is completely harmless! No emergency refresh needed for Row $B$'s neighbors!"*
   * **TRR DOES NOT REFRESH VICTIM ROW $V$!**

3. **The Result**:
   * Target Victim Row $V$ receives heavy coupled charge leakage from the combined $A + B$ interaction.
   * TRR refreshed Row $B$, but **NEVER refreshed Victim Row $V$** because Row $A$ was two steps away and Row $B$'s activation count was too low to trigger TRR!
   * Victim Row $V$ suffers a **destructive physical bit-flip**!


### Scenario and Parameters

You are a senior memory reliability and security architect auditing a DDR4 memory controller integrated into a $3.2\text{ GHz}$ server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The memory controller accesses a DRAM bank equipped with an on-die **Counter-Based Target Row Refresh (TRR)** unit with the following hardware specifications:
* **TRR Table Capacity**: $N_{\text{slots}} = 4\text{ tracking slots}$ per bank.
* **TRR Activation Threshold**: $N_{\text{threshold}} = 1,024\text{ activations}$. If a row's count in the table reaches 1,024 within a $64\text{-ms}$ window, TRR issues an emergency refresh to adjacent rows and resets the count.
* **TRR Table Replacement Policy**: First-In, First-Out (FIFO). When all 4 slots are full and a new un-tracked row is activated, the oldest entry in Slot 0 is evicted, and its activation counter is **reset to $0$**!
* **DRAM Bank Timing**: Row cycle time $t_{\text{RC}} = 45.0\text{ nanoseconds}$ ($45.0 \times 10^{-9}\text{ s}$).
* **Refresh Window ($t_{\text{REFI}}$)**: $64.0\text{ milliseconds}$ ($64 \times 10^{-3}\text{ s}$).

```text
3.2 GHz SERVER WITH DDR4 TRR MEMORY CONTROLLER

 Host CPU / Memory Controller ──► [ On-Die TRR Unit (4 Slots, FIFO) ] ──► DRAM Bank
 Clock T = 312.5 ps               Threshold N_thresh = 1,024           t_RC = 45 ns
                                  Evicts oldest entry on overflow!      t_REFI = 64 ms
```

#### Physical Memory Row Parameters:
* Target Victim Row: $WL_V$ (Row index 100).
* Bit-flip activation threshold for $WL_V$: Requires a net disturbance of $N_{\text{disturb\_needed}} = 80,000\text{ activations}$ on adjacent aggressors within $64\text{ ms}$.

#### Attack Scenarios to Compare:
* **Scenario A (Standard Double-Sided Attack — 2 Aggressors)**: The attacker alternates between Aggressor $A_1$ (Row 99) and Aggressor $A_2$ (Row 101).
* **Scenario B (Many-Sided Hammering Attack — 8 Aggressors)**: The attacker sweeps through 8 aggressor rows ($A_0 \dots A_7$, including Rows 99 and 101) in a round-robin sequence ($A_0 \to A_1 \to A_2 \to A_3 \to A_4 \to A_5 \to A_6 \to A_7 \to A_0 \dots$).

#### Your Objective

1. Analyze **Scenario A (2 Aggressors vs 4 TRR Slots)**:
   * Trace TRR table occupation and show whether TRR detects Aggressors $A_1$ and $A_2$.
   * Calculate the maximum activations $A_1$ and $A_2$ can reach before TRR triggers an emergency refresh, and prove why Scenario A **FAILS** to cause a bit-flip.
2. Analyze **Scenario B (8 Aggressors vs 4 TRR Slots — Many-Sided Bypass)**:
   * Trace TRR table eviction cycles as the 8-row sweep progresses.
   * Calculate the maximum activation count any single row can accumulate in its TRR slot before being evicted and reset to 0.
   * Prove mathematically that TRR **NEVER reaches its 1,024 threshold** for any row in Scenario B!
3. For Scenario B, calculate total activations delivered to Aggressor Rows 99 ($A_1$) and 101 ($A_2$) over the $64\text{-ms}$ window, proving that a **physical bit-flip IS SUCCESSFULLY TRIGGERED in Victim Row 100**.
4. Calculate the total time $T_{\text{flip}}$ (in milliseconds) required to complete the Many-Sided attack in Scenario B.
5. Verify mathematical, physical, and logical correctness.


#### Step 2: Analyze Scenario B (Many-Sided Hammering — 8 Aggressors vs 4 TRR Slots)

The attacker executes an 8-row round-robin sweep: $A_0 \to A_1 \to A_2 \to A_3 \to A_4 \to A_5 \to A_6 \to A_7 \to A_0 \dots$

Let us trace TRR table slots (Capacity $= 4$, Replacement $= \text{FIFO}$):

##### 1. First 4 Activations ($A_0, A_1, A_2, A_3$):
* `ACT A0` $\implies$ Slot 0: $A_0$ ($C_{A0} = 1$).
* `ACT A1` $\implies$ Slot 1: $A_1$ ($C_{A1} = 1$).
* `ACT A2` $\implies$ Slot 2: $A_2$ ($C_{A2} = 1$).
* `ACT A3` $\implies$ Slot 3: $A_3$ ($C_{A3} = 1$).
* **TRR Table Status**: $4/4\text{ slots full}$.

##### 2. Next 4 Activations ($A_4, A_5, A_6, A_7$ — TABLE OVERFLOW!):
* `ACT A4` $\implies$ Table full! FIFO evicts Slot 0 ($A_0$). **$A_0$'s counter is reset to 0!** Slot 0 receives $A_4$ ($C_{A4} = 1$).
* `ACT A5` $\implies$ FIFO evicts Slot 1 ($A_1$). **$A_1$'s counter is reset to 0!** Slot 1 receives $A_5$ ($C_{A5} = 1$).
* `ACT A6` $\implies$ FIFO evicts Slot 2 ($A_2$). **$A_2$'s counter is reset to 0!** Slot 2 receives $A_6$ ($C_{A6} = 1$).
* `ACT A7` $\implies$ FIFO evicts Slot 3 ($A_3$). **$A_3$'s counter is reset to 0!** Slot 3 receives $A_7$ ($C_{A7} = 1$).

##### 3. Looping Back to $A_0$:
* `ACT A0` $\implies$ FIFO evicts Slot 0 ($A_4$). $A_0$ re-allocated with $C_{A0} = 1$.

```text
SCENARIO B TRR TABLE EVICTION CYCLE TRACE

 Stream Step │ Activated Row │ TRR Slot 0 │ TRR Slot 1 │ TRR Slot 2 │ TRR Slot 3 │ Action Taken
─────────────┼───────────────┼────────────┼────────────┼────────────┼────────────┼─────────────────────────
     1       │      A0       │  A0 (C=1)  │    Empty   │   Empty    │   Empty    │ Allocated Slot 0
     2       │      A1       │  A0 (C=1)  │  A1 (C=1)  │   Empty    │   Empty    │ Allocated Slot 1
     3       │      A2       │  A0 (C=1)  │  A1 (C=1)  │  A2 (C=1)  │   Empty    │ Allocated Slot 2
     4       │      A3       │  A0 (C=1)  │  A1 (C=1)  │  A2 (C=1)  │  A3 (C=1)  │ Table 100% FULL!
─────5───────┼───────────────┼────────────┼────────────┼────────────┼────────────┼─────────────────────────
     5       │      A4       │  A4 (C=1)  │  A1 (C=1)  │  A2 (C=1)  │  A3 (C=1)  │ EVICTED A0! (Count A0->0)
     6       │      A5       │  A4 (C=1)  │  A5 (C=1)  │  A2 (C=1)  │  A3 (C=1)  │ EVICTED A1! (Count A1->0)
     7       │      A6       │  A4 (C=1)  │  A5 (C=1)  │  A6 (C=1)  │  A3 (C=1)  │ EVICTED A2! (Count A2->0)
     8       │      A7       │  A4 (C=1)  │  A5 (C=1)  │  A6 (C=1)  │  A7 (C=1)  │ EVICTED A3! (Count A3->0)
```

##### Mathematical Analysis of Maximum Counter Value:
In every 8-activation loop, each row $A_k$ is activated exactly **once**, and its counter $C_{Ak}$ is evicted and reset to $0$ four steps later!

$$\mathbf{\max(C_{Ak}) = 1 \quad (\forall k \in [0, 7])}$$

$$\text{TRR Threshold Comparison: } \quad \max(C_{Ak}) \, (1) \quad \ll \quad N_{\text{threshold}} \, (1,024)$$

$$\mathbf{\text{TRR Emergency Refreshes Issued: ZERO (0)! TRR IS 100% BYPASSED!}}$$

The TRR table is trapped in a permanent cycle of thrashing. No row counter ever exceeds $1$, and **zero emergency refreshes are ever issued to Victim Row 100!**


#### Step 4: Calculate Physical Time Required for Bit-Flip ($T_{\text{flip}}$)

To reach $N_{\text{disturb\_needed}} = 80,000\text{ total activations}$ across Rows 99 and 101 ($40,000$ activations per row):

Since the 8-row sweep executes 1 activation of Row 99 and 1 activation of Row 101 every 8 activations ($8 \times 45\text{ ns} = 360.0\text{ ns}$ per 8-row sweep loop):

$$\text{Number of 8-Row Sweeps Needed} = 40,000 \text{ loops}$$

$$T_{\text{flip}} = 40,000 \text{ loops} \times (8 \times 45.0 \times 10^{-9}\text{ s/loop})$$

$$T_{\text{flip}} = 40,000 \times 360.0 \times 10^{-9}\text{ s} = 0.014400 \text{ Seconds} = \mathbf{14.400 \text{ Milliseconds}}$$

```text
MANY-SIDED SCENARIO B PERFORMANCE SUMMARY

 Parameter Metric             │ Scenario A (2 Aggressors) │ Scenario B (8-Row Many-Sided)
──────────────────────────────┼───────────────────────────┼────────────────────────────────
 TRR Table Tracking Status    │ Tracked 100% (No Eviction)│ Evicted every 4 steps (Thrashing)
 Max Counter Value Reached    │ 1,024 (Triggers Refresh)  │ 1 (Never Triggers Refresh!)
 Emergency Refreshes to Row100│ 694 Refreshes / 64ms      │ 0 Refreshes (100% BYPASSED!)
 Total Time to Bit-Flip       │ Infinite (No Bit-Flip)    │ 14.40 Milliseconds (BIT-FLIP!)
```

##### Engineering Conclusion:
By expanding the attack from 2 aggressors to an 8-row Many-Sided sweep (Scenario B), the attacker caused $100\%$ thrashing in the 4-slot TRR table, reduced maximum TRR counters from $1,024$ down to $1$, and triggered a physical bit-flip in Victim Row 100 in **$14.40\text{ milliseconds}$**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Target Row Refresh (TRR) bypass**: The physical and algorithmic mechanisms (such as Many-Sided hammering table thrashing and Half-Double distance-2 coupling) that circumvent hardware TRR sampling and activation counters, preventing emergency refresh cycles from being issued to victim DRAM rows.
* **Complex hammering pattern**: A multi-row activation sequence (combining $M > N_{\text{slots}}$ aggressor rows in non-uniform frequency bursts or multi-distance spatial steps) designed specifically to overflow TRR tracking tables or exploit charge transfer across intermediate un-monitored memory rows.
