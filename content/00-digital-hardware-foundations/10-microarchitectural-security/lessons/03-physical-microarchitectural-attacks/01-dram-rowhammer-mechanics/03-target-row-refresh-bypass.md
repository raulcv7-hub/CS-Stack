content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/03-physical-microarchitectural-attacks/01-dram-rowhammer-mechanics/03-target-row-refresh-bypass.md
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

---

## The Overwhelmed Nightclub Bouncer and the Cascade of Pebbles

To build an intuitive, crystal-clear mental model of how Target Row Refresh operates and why complex multi-row activation patterns bypass its hardware tracking logic, let us explore two complementary analogies: the overwhelmed bouncer at a busy nightclub and ripples crossing stepping stones in a pond.

### Analogy 1: The Overwhelmed Bouncer (Many-Sided TRR Table Overflow)

Imagine a high-security nightclub (a DRAM Memory Bank) containing long rows of private VIP lounges (DRAM Memory Rows). Inside **Lounge 10 (The Victim Row $WL_V$)** sits a quiet guest next to a delicate tower of champagne glasses balancing on a narrow table. This tower of glasses represents an **electrical charge stored on a microscopic 1T1C memory capacitor**:
* If the tower of glasses remains standing, it represents a digital **$1$**.
* If the tower collapses and shatters, it represents a digital **$0$** (a physical bit-flip!).

Because the walls between lounges are thin, loud noise and slamming doors in neighboring lounges cause vibrations that shake Lounge 10's table. 

To prevent glasses from falling, the nightclub hires a **Security Bouncer (The Target Row Refresh / TRR Unit)** to stand in the hallway:
* The bouncer holds a small clipboard that has space to write down **only 4 room numbers** ($N_{\text{slots}} = 4$).
* The bouncer watches the hallway. Every time a door is slammed in a lounge, the bouncer writes the room number on their clipboard and increments a tally counter for that room.
* If a room number's tally count reaches 100 slams, the bouncer immediately walks into the lounges directly next door and stabilizes their champagne tables (**Issues an Emergency Target Row Refresh**).

```text
THE OVERWHELMED BOUNCER ANALOGY

 Hallway Door Slams (16 Different Lounges)
 ──► [ Room 1 ] [ Room 2 ] [ Room 3 ] ... [ Room 16 ] ──►
                               │
                               ▼
 ┌───────────────────────────────────────────────────────────┐
 │ BOUNCER'S CLIPBOARD (Holds MAX 4 Room Numbers)            │
 │ Room 1 (Count: 12) | Room 2 (Count: 14) | Room 3 (11)... │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
 Room 5 Slams Door ──► Clipboard Full! Bouncer Erases Room 1!
 (Bouncer forgets Room 1! Table next to Room 1 vibrates continuously!)
```

Now, look at how a clever prankster (Many-Sided Rowhammer) tricks the bouncer:

Instead of slamming door #9 (next to Lounge 10) 100 times in a row, the prankster recruits 16 friends in 16 different lounges across the building!
1. The 16 friends slam their doors in a complex, non-uniform rhythm: Room 1 slams, then Room 2, then Room 3, ..., then Room 16, then back to Room 9!
2. The bouncer's clipboard has space for only 4 room numbers.
3. When Room 5 slams its door, the bouncer's clipboard is already full. The bouncer **erases Room 1's tally from the clipboard to make room for Room 5**!
4. A few seconds later, when Room 1 slams its door again, the bouncer writes Room 1 down as a new entry with a count of $1$, forgetting that Room 1 had already slammed its door 90 times earlier!
5. **The Bypass Event**: The bouncer's clipboard continuously overflows and resets! Room 9 (next to Lounge 10) slams its door a total of 150 times, but its count on the bouncer's clipboard never reaches 100 because it keeps getting erased to make room for other lounges!
6. The bouncer **never issues an emergency stabilization** to Lounge 10. The champagne tower in Lounge 10 vibrates continuously, falls off the table, and shatters!

---

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

---

## Target Row Refresh (TRR) Hardware Architectures

To understand why TRR can be bypassed, we must first inspect how memory manufacturers implement Target Row Refresh inside hardware memory controllers and on-die DRAM silicon.

Because adding hardware tracking logic to every individual DRAM row would require millions of transistors that consume valuable silicon die area, hardware architects designed TRR using lightweight, approximation-based tracking architectures.

TRR is deployed across the memory subsystem in two primary structural forms: **Controller-Based TRR** and **In-DRAM (On-Die) TRR**.

```text
TRR HARDWARE IMPLEMENTATION VARIANTS

 1. Controller-Based TRR (Host Memory Controller)
 Host CPU / Memory Controller              DRAM Memory Die
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Activation Counter Table  │ ── Commands ├─► Standard DRAM Banks     │
 │ (Tracks 4 to 16 Rows)     │  ACT/PRE/CBR│   (Executes refreshes)    │
 └───────────────────────────┘             └───────────────────────────┘

 2. In-DRAM / On-Die TRR (DDR4 / DDR5 Die Logic)
 Host CPU / Memory Controller              DRAM Memory Die
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Sends Standard ACT/PRE    │ ── Commands ├─► Internal TRR Sampler    │
 │ Commands                  │  ACT/PRE/REF│   Internal Counter Bank   │
 └───────────────────────────┘             └───────────────────────────┘
```

---

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

---

### 2. Counter-Based TRR Architectures

In a **Counter-Based TRR** implementation, the memory controller or DRAM die incorporates a small table of hardware counters (typically $N_{\text{slots}} = 4, 8, \text{or } 16$ slots per bank).

```text
COUNTER-BASED TRR TABLE STRUCTURE

 TRR Table Array (4 Slots per Bank)
 ┌───────────┬──────────────────────┬──────────────────┬─────────────┐
 │ Slot ID   │ Tracked Row Address  │ Activation Count │ Valid Bit   │
 ├───────────┼──────────────────────┼──────────────────┼─────────────┤
 │ Slot 0    │ Row 0x08A4           │ 842              │ 1           │
 │ Slot 1    │ Row 0x12F0           │ 1,012            │ 1           │
 │ Slot 2    │ Row 0x004C           │ 410              │ 1           │
 │ Slot 3    │ Row 0x05E8           │ 920              │ 1 (FULL!)   │
 └───────────┴──────────────────────┴──────────────────┴─────────────┘
```

#### The Counter Update Algorithm:
When an `ACTIVATE` command for row $R$ arrives:
1. The hardware searches the table for row address $R$.
2. **If $R$ is already in the table**: The hardware increments its activation count ($C_R \Leftarrow C_R + 1$). If $C_R \ge N_{\text{threshold}}$, TRR triggers an emergency refresh to $R \pm 1$ and clears the counter.
3. **If $R$ is NOT in the table AND a free slot exists**: The hardware allocates a new slot for $R$ with $C_R = 1$.
4. **If $R$ is NOT in the table AND ALL SLOTS ARE FULL (Table Replacement)**: The hardware must execute a replacement policy (such as Least Recently Used / LRU, First-In First-Out / FIFO, or random replacement). It evicts an existing entry to make room for $R$!

---

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

---

### Non-Uniform Frequency and Phase Modulation

In advanced DDR4 and DDR5 memory modules, TRR controllers use complex replacement policies (such as frequency-weighted or decay-based tracking) to resist simple sequential sweeps ($A_0, A_1, A_2 \dots$).

To bypass advanced TRR controllers, Many-Sided Hammering applies **Non-Uniform Frequency and Phase Modulation**:

```text
NON-UNIFORM HAMMERING FREQUENCY PATTERN

 Aggressor A0 : ██████████ (High-Frequency Burst: 20 activations)
 Aggressor A1 : █          (Single tap)
 Aggressor A2 : █          (Single tap)
 Aggressor A3 : ██████████ (High-Frequency Burst: 20 activations)
 Aggressor A4 : █          (Single tap)
 (Short dummy taps force TRR table replacements; heavy bursts drain victim charge!)
```

* **High-Frequency Primary Aggressors ($A_0, A_3$)**: Activated in short, intense bursts of 15–20 accesses to dump large packets of capacitive leakage into Victim Row $V$.
* **Low-Frequency Flushing Aggressors ($A_1, A_2, A_4, A_5$)**: Activated 1 or 2 times between primary bursts. These dummy activations act as **table flushers**, forcing the TRR controller to evict $A_0$ and $A_3$ from its tracking slots right after their bursts finish!

By carefully tuning the ratio of primary bursts to flushing taps, the attacker keeps the TRR table in a perpetual state of thrashing while delivering enough total activations to the primary aggressors to flip bits in Victim Row $V$!

---

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

---

### The Half-Double Electrical Coupling Mechanism

Consider a 3-row physical memory array where:
* Row $V$ is the Target Victim Row.
* Row $B = V - 1$ is the immediate physical neighbor (Distance 1).
* Row $A = V - 2$ is the row located two positions away (Distance 2).

How can hammering Row $A$ (Distance 2) cause a bit-flip in Target Victim Row $V$ without triggering TRR for Row $V$?

Let us trace the physical charge transfer across the 3-row array:

1. **Heavy Distance-2 Activation**: The attacker hammers Row $A$ ($WL_{V-2}$) with $200,000$ activations.
2. **Intermediate Row Coupling**: The high-voltage toggling on $WL_{V-2}$ induces parasitic capacitive coupling into intermediate Row $B$ ($WL_{V-1}$).
3. **Intermediate Charge Accumulation**: Because Row $B$ is physically adjacent to Row $A$, Row $B$'s wordline voltage fluctuates, causing Row $B$'s access transistors to leak charge.
4. **Light Distance-1 Tap**: The attacker occasionally executes a light activation on intermediate Row $B$ ($WL_{V-1}$)—for example, activating Row $B$ only **10 times**!
5. **The Half-Double Bridge Effect**: Activating intermediate Row $B$ even 10 times while it is electrically energized by Row $A$'s heavy coupling causes Row $B$ to act as a **charge transfer bridge**. 
   
   The combined energy from Row $A$ and Row $B$ dumps a heavy pulse of parasitic leakage **directly into Target Victim Row $V$ ($WL_V$)**!

```text
HALF-DOUBLE CHARGE TRANSFER BRIDGE

 Row A (Distance 2 - 200k Acts) ──► Parasitic Coupling into Row B
                                           │
                                           ▼
 Row B (Distance 1 - 10 Taps)   ──► ACTS AS CHARGE TRANSFER BRIDGE!
                                           │
                                           ▼
 Target Victim Row V            ──► RECEIVES HEAVY LEAKAGE PULSE! (Bit-Flip!)
```

---

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

---

## Solved Industrial Engineering Exercise: Quantitative TRR Sampling Table Overflow, Many-Sided Attack Optimization, and Half-Double Leakage Analysis

To consolidate your complete mastery of TRR hardware bypass mechanics, Many-Sided table overflow math, and Half-Double distance-2 charge transfer derivations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Analyze Scenario A (Standard Double-Sided Attack — 2 Aggressors)

The attacker alternates between $A_1$ (Row 99) and $A_2$ (Row 101).

##### 1. TRR Table Allocation:
* Iteration 1: `ACT A1` $\implies$ Allocated in Slot 0 ($C_{A1} = 1$).
* Iteration 2: `ACT A2` $\implies$ Allocated in Slot 1 ($C_{A2} = 1$).
* Iteration 3: `ACT A1` $\implies$ $A_1$ is already in Slot 0! Counter increments: $C_{A1} \Leftarrow 2$.
* Iteration 4: `ACT A2` $\implies$ $A_2$ is already in Slot 1! Counter increments: $C_{A2} \Leftarrow 2$.

##### 2. TRR Table Behavior:
Because the number of aggressors ($2$) is **less than TRR table capacity ($N_{\text{slots}} = 4$)**:
* Both $A_1$ and $A_2$ remain permanently stored in Slots 0 and 1. Neither entry is ever evicted!
* Counters $C_{A1}$ and $C_{A2}$ increment continuously: $1, 2, 3 \dots 1,023, 1,024$.
* When $C_{A1}$ reaches $1,024$ (after $2,048$ total activations $= 2,048 \times 45\text{ ns} = 92.16\ \mu\text{s}$):
  $$\text{TRR Triggers Emergency Refresh to Rows } A_1-1 \text{ and } A_1+1 \text{ (Row 100 / Victim } V\text{)!}$$
* Victim Row 100 ($WL_V$) is **recharged to $100\%$ capacity every $92.16\ \mu\text{s}$**!

```text
SCENARIO A TRR PROTECTION TIMELINE

 2 Aggressors (A1, A2) < 4 TRR Slots ──► Both rows stored permanently in TRR table!
 Counters reach 1,024 every 92.16 us  ──► TRR issues Emergency Refresh to Victim Row 100!
 Victim Row 100 recharged 694 times in 64ms window ──► ZERO BIT-FLIPS! (TRR SUCCESS!)
```

##### Conclusion for Scenario A:
Standard double-sided hammering **FAILS** against this 4-slot TRR unit. TRR refreshes Victim Row 100 694 times during the $64\text{-ms}$ window, completely preventing charge depletion.

---

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

---

#### Step 3: Calculate Disturbance Delivered to Victim Row 100 ($WL_V$)

In Scenario B, 2 of the 8 aggressors in the sweep are $A_1$ (Row 99) and $A_2$ (Row 101), which directly sandwich Victim Row 100.

In a $64\text{-ms}$ refresh window ($1,422,222\text{ total bank activations}$ at $t_{\text{RC}} = 45\text{ ns}$):

The 8-row round-robin sweep divides total bank activations equally among all 8 rows:

$$\text{Activations per Row } N_{\text{row}} = \frac{N_{\text{total\_activations}}}{8} = \frac{1,422,222}{8} = \mathbf{177,777 \text{ Activations per Row}}$$

##### Calculate Total Disturbing Activations Delivered to Victim Row 100:
Both Row 99 ($A_1$) and Row 101 ($A_2$) are activated $177,777\text{ times}$ each:

$$N_{\text{double\_total}} = N_{\text{Row99}} + N_{\text{Row101}} = 177,777 + 177,777 = \mathbf{355,554 \text{ Total Disturbing Activations}}$$

##### Compare against Disturbance Threshold ($N_{\text{disturb\_needed}} = 80,000$):

$$N_{\text{double\_total}} \, (355,554) \quad \gg \quad N_{\text{disturb\_needed}} \, (80,000) \quad (\mathbf{\text{THRESHOLD EXCEEDED BY 4.44x!}})$$

$$\mathbf{\text{BIT-FLIP IN VICTIM ROW 100 IS SUCCESSFULLY TRIGGERED!}}$$

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and hardware state results against DRAM principles:

1. **TRR Table Capacity Invariant Check**:
   * TRR capacity $N_{\text{slots}} = 4$.
   * Number of aggressor rows $M = 8$.
   * $M > N_{\text{slots}} \implies 8 > 4$.
   * Under FIFO replacement, every entry is evicted after $N_{\text{slots}} = 4$ steps, leaving a maximum counter value of $1$. Table thrashing $100\%$ mathematically proven!
2. **Disturbance Charge Accumulation Check**:
   * Time to bit-flip $T_{\text{flip}} = 14.40\text{ ms}$.
   * Refresh window $t_{\text{REFI}} = 64.0\text{ ms}$.
   * $14.40\text{ ms} \le 64.0\text{ ms} \implies$ The bit-flip occurs $4.44\text{ times}$ faster than the background refresh cycle!
3. **Half-Double Coupling Check**:
   * In Half-Double hammering, distance-2 aggressor $WL_{V-2}$ transfers charge across intermediate row $WL_{V-1}$.
   * TRR monitors only distance-1 ($WL_{V-1}$), whose activation count remains below $1,024$, proving $100\%$ TRR bypass for distance-2 hammering.

All TRR counter replacement state tables, Many-Sided activation sweep equations, Half-Double distance-2 charge transfer mechanisms, and $14.40\text{-ms}$ bit-flip timing derivations evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Target Row Refresh (TRR) bypass**: The physical and algorithmic mechanisms (such as Many-Sided hammering table thrashing and Half-Double distance-2 coupling) that circumvent hardware TRR sampling and activation counters, preventing emergency refresh cycles from being issued to victim DRAM rows.
* **Complex hammering pattern**: A multi-row activation sequence (combining $M > N_{\text{slots}}$ aggressor rows in non-uniform frequency bursts or multi-distance spatial steps) designed specifically to overflow TRR tracking tables or exploit charge transfer across intermediate un-monitored memory rows.
