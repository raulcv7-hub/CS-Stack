---
title: "Gated SR Latch Synthesis and Enable Control Valve Architecture"
---

# Gated SR Latch Synthesis and Enable Control Valve Architecture

## The Uncontrolled Asynchronous State Corruption Problem

An un-gated, basic cross-coupled Set/Reset (SR) latch provides a fundamental mechanism for digital memory: it uses a closed positive feedback loop to store a single bit of information ($Q$). However, an un-gated SR latch suffers from a severe physical vulnerability: **it is asynchronously sensitive to its inputs at all times**.

The exact nanosecond a signal arrives at the Set ($S$) or Reset ($R$) input pins, the internal feedback loop reacts and changes the stored state $Q$. In an un-gated latch, there is no barrier, no valve, and no timing window. The inputs are directly exposed to the memory loop 24 hours a day, 7 days a week.

```text
UN-GATED ASYNCHRONOUS MEMORY VULNERABILITY

 Line Noise / Glitch on Input S (1) ──► [ Un-Gated SR Latch ] ──► Stored State Q CORRUPTED!
                                         (No Input Isolation)
```

In a complex digital system—such as a central processing unit where hundreds of registers share data buses—this un-gated sensitivity causes catastrophic state corruption. While a processing unit is calculating a mathematical result, data wires ripple with transient voltage spikes, switching hazards, and intermediate calculation values. 

If those noisy, unstable data wires are connected directly to un-gated memory latches, the stored memory states will constantly flip, overwrite, and corrupt themselves as signals travel across the circuit board.

A digital system requires strict control over **time**. It needs a way to tell a memory cell:
1. *"Ignore your input lines right now! Lock your doors and hold your stored memory state steady while the rest of the system is calculating."*
2. *"Now, for the next 2 nanoseconds ONLY, open your input doors, read the valid input signals, update your stored memory state, and then immediately lock your doors again!"*

To create this controlled update window, digital engineering places an electronic valve—an **Enable Gate**—at the front threshold of an SR latch. The resulting circuit is the **Gated SR Latch**. 

By controlling the Enable Gate using a master clock or enable signal ($E$), we create an isolation boundary that shields stored memory from bus noise and dictates precisely when state transitions are permitted to occur.

---

## The Bank Teller Window: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an Enable Gate protects memory, let us step away from electronics and picture a bank vault teller window.

Imagine a bank teller sitting inside a fortified room. Inside the room is a large whiteboard where the teller writes down a single master account balance ($Q$). Outside the room, customers stand in line to request changes to the balance.

```text
THE BANK TELLER WINDOW MODEL

 Outside Customers (Inputs S, R) ──► [ Security Shutter (Enable E) ] ──► Teller (State Q)
```

The teller room is equipped with a heavy, motorized steel **Security Shutter** controlled by a master timer button ($E$):

### Case 1: The Security Shutter is CLOSED ($E = 0$)
When the master timer button is $0$, the motorized steel shutter is pulled down tight, covering the window. 

Outside the window, customers can wave deposit slips ($S = 1$) or withdrawal slips ($R = 1$), shout commands, or make noise. What does the teller inside see or hear? **Nothing!** The thick steel shutter blocks all activity. The teller leaves the master account balance on the whiteboard ($Q$) completely untouched. 

This is the **Disabled / Hold State ($E = 0$)**. The memory is completely isolated from outside noise.

```text
SHUTTER CLOSED: MEMORY PROTECTED (E = 0)

 Customers Shouting (S=1, R=1) ──► [ CLOSED STEEL SHUTTER ] ──x  Teller Unaware!
                                                                  Whiteboard Q STAYS SAME!
```

### Case 2: The Security Shutter is OPENED ($E = 1$)
When the master timer button pulses to $1$, the motorized shutter rolls up for exactly 5 seconds.

Now, the teller can see the customer's request through the open window:
* If a customer presents a Deposit Slip ($S = 1, R = 0$), the teller updates the whiteboard balance to HIGH ($Q = 1$).
* If a customer presents a Withdrawal Slip ($S = 0, R = 1$), the teller updates the whiteboard balance to LOW ($Q = 0$).
* If the customer presents no slips ($S = 0, R = 0$), the teller leaves the balance unchanged.

As soon as the 5 seconds expire, the master timer button drops back to $0$. The steel shutter slams down, locking the new balance safely inside the room.

```text
SHUTTER OPEN: CONTROLLED UPDATE WINDOW (E = 1)

 Deposit Slip (S=1, R=0) ──► [ OPEN SHUTTER (E=1) ] ──► Teller Sees Slip!
                                                         Whiteboard Updated to Q = 1!
```

This bank teller security shutter is the exact physical analogue of an **Enable Gate**:
* The customer deposit/withdrawal slips ($S, R$) are the **Data Inputs**.
* The motorized steel shutter ($E$) is the **Enable Control Signal**.
* The whiteboard balance is the **Stored Memory State ($Q$)**.

In digital logic, an Enable Gate acts as a controllable electronic valve that blocks or passes input signals into the internal memory loop based on a master control clock.

---

## Mechanics of Gated SR Latch Architecture and Enable Valve Logic

To master the design of gated sequential storage, we must dissect the formal mechanics of its two core primitives:
1. **The Enable Gate Threshold**: How input AND/NAND gates act as controllable valves that isolate or pass Set and Reset signals.
2. **The Gated SR Latch**: The complete combination of an input steering stage and a cross-coupled bistable memory core.

---

### Primitive 1: The Enable Gate Threshold

To prevent an SR latch from responding to asynchronous input changes, we must place a pair of 2-input **steering gates** at the front entrance of the latch.

Consider two standard 2-input **AND gates** placed before an active-high NOR SR latch:
* Gate 1 receives the external Set signal ($S$) and the master Enable signal ($E$). Its output is $S' = S \cdot E$.
* Gate 2 receives the external Reset signal ($R$) and the master Enable signal ($E$). Its output is $R' = R \cdot E$.

```text
ENABLE STEERING VALVE LOGIC

Set S ─────────────►┌───────┐
                    │ AND 1 ├──► Internal Set S' (S · E)
Enable E ──┬───────►└───────┘
           │
           └───────►┌───────┐
Reset R ───────────►│ AND 2 ├──► Internal Reset R' (R · E)
                    └───────┘
```

Let us evaluate the algebraic behavior of these steering gates across both operational modes of Enable line $E$:

#### Mode 1: Enable Disabled ($E = 0$)
Substitute $E = 0$ into both steering gate equations:

$$
S' = S \cdot 0 = 0
$$

$$
R' = R \cdot 0 = 0
$$

Where:
* $S'$ is the internal Set signal delivered to the memory loop.
* $R'$ is the internal Reset signal delivered to the memory loop.
* $S, R$ are the external input lines.
* $E$ is the master Enable control line.

Notice what happens when $E = 0$: **Regardless of what external signals $S$ and $R$ are doing ($0$ or $1$), the internal signals $S'$ and $R'$ are forced to $00_2$!**

When a NOR-based SR latch receives $S' = 0$ and $R' = 0$, it enters its **HOLD State**. The internal memory loop is completely disconnected from external inputs!

#### Mode 2: Enable Enabled ($E = 1$)
Substitute $E = 1$ into both steering gate equations:

$$
S' = S \cdot 1 = S
$$

$$
R' = R \cdot 1 = R
$$

When $E = 1$, the steering gates act as **transparent pass-through buffers**. External signals $S$ and $R$ pass directly into the memory loop ($S' = S, R' = R$), allowing state updates to occur.

---

### Primitive 2: The Gated NOR SR Latch Architecture

By connecting our input steering AND gates directly to a cross-coupled NOR memory cell, we construct the complete **Gated NOR SR Latch**.

```text
COMPLETE GATED NOR SR LATCH SCHEMATIC

 Input S (Set)   ───►┌───────┐
                     │ AND 1 ├──► S' ──┐
 Enable Line E   ──┬►└───────┘         │
                   │                   │   ┌─────────┐
                   │                   └──►│ NOR 1   ├───┬─────► Output Q
                   │          ┌───────────►└─────────┘   │
                   │          │ (Feedback 2)             │ (Feedback 1)
                   │          │            ┌─────────┐   │
                   │          └────────────┤ NOR 2   │◄──┘
                   │                   ┌──►└────┬────┘
                   │ ┌───────┐         │        │
 Input R (Reset) ──┴─┤ AND 2 ├──► R' ──┘        └──────────────► Output Q'
                     └───────┘
```

#### 1. Exhaustive Truth Table Derivation

Let us evaluate all combinations of Enable $E$, Set $S$, and Reset $R$ for the Gated NOR SR Latch:

```text
GATED NOR SR LATCH EXHAUSTIVE TRUTH TABLE

 Enable (E) │ Input S │ Input R │ Internal S' │ Internal R' │ Output Q_next │ System Operating Mode
────────────┼─────────┼─────────┼─────────────┼─────────────┼───────────────┼─────────────────────────────────
     0      │    X    │    X    │      0      │      0      │    Q_prev     │ DISABLED (Hold / Memory Lock)
     1      │    0    │    0    │      0      │      0      │    Q_prev     │ ENABLED (Hold State)
     1      │    1    │    0    │      1      │      0      │       1       │ ENABLED (SET State -> Q = 1)
     1      │    0    │    1    │      0      │      1      │       0       │ ENABLED (RESET State -> Q = 0)
     1      │    1    │    1    │      1      │      1      │       X       │ ENABLED (FORBIDDEN / INVALID!)
```

Study this truth table carefully:
* **Row 0 ($E = 0$)**: Inputs $S$ and $R$ are Don't Cares ($X$). Internal inputs are $S'=0, R'=0$. The latch output holds its previous value ($Q_{\text{next}} = Q_{\text{prev}}$).
* **Row 1 ($E = 1, S = 0, R = 0$)**: Enabled, but no input command. Internal $S'=0, R'=0 \implies Q_{\text{next}} = Q_{\text{prev}}$.
* **Row 2 ($E = 1, S = 1, R = 0$)**: Enabled and Set commanded. Internal $S'=1, R'=0 \implies Q_{\text{next}} = 1$.
* **Row 3 ($E = 1, S = 0, R = 1$)**: Enabled and Reset commanded. Internal $S'=0, R'=1 \implies Q_{\text{next}} = 0$.
* **Row 4 ($E = 1, S = 1, R = 1$)**: Enabled, but BOTH commands active! Internal $S'=1, R'=1 \implies$ **FORBIDDEN STATE!**

---

### The Gated NAND SR Latch Architecture

Just as we constructed a gated latch using NOR gates, we can build a Gated SR Latch using **pure NAND gates**.

A Gated NAND SR Latch uses two 2-input NAND gates as the input steering stage, connected to a cross-coupled NAND memory cell.

```text
COMPLETE GATED NAND SR LATCH SCHEMATIC

 Input S (Set)   ───►┌────────┐
                     │ NAND 1 ├──► S'_bar ──┐
 Enable Line E   ──┬►└────────┘             │
                   │                        │   ┌────────┐
                   │                        └──►│ NAND 3 ├──────┬─────► Output Q
                   │               ┌───────────►└────────┘      │
                   │               │ (Feedback 2)               │ (Feedback 1)
                   │               │               ┌────────┐   │
                   │               └───────────────┤ NAND 4 │◄──┘
                   │ ┌────────┐                ┌──►└────┬───┘
 Input R (Reset) ──┴─┤ NAND 2 ├──► R'_bar ─────┘        │
                     └────────┘                         └──────────► Output Q'
```

Let us trace how the steering NAND gates ($N_1$ and $N_2$) operate:

* **When Enable $E = 0$**:
  * $N_1$ output: $\overline{S'} = \overline{S \cdot 0} = \overline{0} = 1$.
  * $N_2$ output: $\overline{R'} = \overline{R \cdot 0} = \overline{0} = 1$.
  * Internal signals $\overline{S'}$ and $\overline{R'}$ are both forced to **$1$**.
  * Recall that a cross-coupled NAND memory cell holds its state when both inputs are $1$ ($\overline{S}=1, \overline{R}=1$)!
  * Thus, setting $E = 0$ forces the internal NAND memory loop into its **HOLD State ($Q_{\text{next}} = Q$)**.

* **When Enable $E = 1$**:
  * $N_1$ output: $\overline{S'} = \overline{S \cdot 1} = \overline{S}$.
  * $N_2$ output: $\overline{R'} = \overline{R \cdot 1} = \overline{R}$.
  * If $S = 1$ (Set), $N_1$ emits $\overline{S'} = 0$, which sets the NAND memory cell ($Q = 1$).
  * If $R = 1$ (Reset), $N_2$ emits $\overline{R'} = 0$, which resets the NAND memory cell ($Q = 0$).

Notice an important advantage: **The Gated NAND SR Latch uses active-high external inputs ($S=1$ Sets, $R=1$ Resets) while utilizing faster CMOS NAND gates internally!**

```text
GATED NOR VS GATED NAND LATCH COMPARISON

 Feature                │ Gated NOR SR Latch           │ Gated NAND SR Latch
────────────────────────┼──────────────────────────────┼─────────────────────────────
 Input Steering Gates   │ 2 AND Gates                  │ 2 NAND Gates
 Memory Core Gates      │ 2 NOR Gates                  │ 2 NAND Gates
 Disabled Mode (E = 0)  │ Internal S'=0, R'=0 (Hold)   │ Internal S'=1, R'=1 (Hold)
 External Input Active  │ Active-High (1 to Set/Reset) │ Active-High (1 to Set/Reset)
 Total CMOS Transistors │ 16 Transistors               │ 16 Transistors
```

---

## Characteristic Equations and State Transition Analysis

To mathematically model the behavior of a Gated SR Latch in digital simulation software, we update the characteristic equation to include the Enable control variable $E$.

### The Next-State Characteristic Equation

For a Gated NOR or Gated NAND SR Latch:

$$
Q_{\text{next}} = (E \cdot S) + (\overline{E} \cdot Q) + (\overline{R} \cdot Q) \quad \text{subject to } (S \cdot R = 0 \text{ when } E = 1)
$$

Where:
* $Q_{\text{next}}$ is the stored output bit in the next state.
* $E$ is the master Enable control input.
* $S$ is the Set input.
* $R$ is the Reset input.
* $\overline{E}$ and $\overline{R}$ are the inverted Enable and Reset signals.
* $Q$ is the current stored output bit.
* $S \cdot R = 0$ is the operational constraint preventing the forbidden state when $E = 1$.

Let us evaluate this equation across all operational conditions:
1. **When $E = 0$ (Disabled)**:
   $$Q_{\text{next}} = (0 \cdot S) + (1 \cdot Q) + (\overline{R} \cdot Q) = 0 + Q + (\overline{R} \cdot Q) = Q$$
   The output $Q_{\text{next}}$ equals $Q$ regardless of $S$ or $R$. Memory is locked!
2. **When $E = 1, S = 1, R = 0$ (Set)**:
   $$Q_{\text{next}} = (1 \cdot 1) + (0 \cdot Q) + (1 \cdot Q) = 1 + 0 + Q = 1$$
   The output $Q_{\text{next}}$ becomes $1$.
3. **When $E = 1, S = 0, R = 1$ (Reset)**:
   $$Q_{\text{next}} = (1 \cdot 0) + (0 \cdot Q) + (0 \cdot Q) = 0 + 0 + 0 = 0$$
   The output $Q_{\text{next}}$ becomes $0$.

---

## The Persistent Limitation: The Invalid State ($S=1, R=1, E=1$) Still Exists!

While the Enable Gate successfully controls **WHEN** state updates are allowed to happen, it introduces a major realization in digital logic design: **It does NOT eliminate the Invalid State ($S=1, R=1$)!**

If an external controller accidentally asserts $S = 1$ and $R = 1$ simultaneously while the Enable line is active ($E = 1$):
* In a Gated NOR Latch: Internal $S' = 1, R' = 1 \implies$ Both outputs collapse to $0$ ($Q = 0, \overline{Q} = 0$).
* In a Gated NAND Latch: Internal $\overline{S'} = 0, \overline{R'} = 0 \implies$ Both outputs collapse to $1$ ($Q = 1, \overline{Q} = 1$).

```text
THE PERSISTENT INVALID STATE LIMITATION

 Inputs: S = 1, R = 1, E = 1 ──► [ Enable Steering Gates ] ──► Internal Conflict!
                                                                  │
                                                                  ▼
                                                      Outputs Collapse (Q = Q')!
                                                      Metastable Risk on Release!
```

If $E$ drops to $0$ while $S=1$ and $R=1$ are active, the internal memory loop enters a **Metastable Race Condition**, where $Q$ oscillates or settles to a unpredictable random value.

This persistent limitation motivates the next evolutionary leap in sequential storage: the **Gated D-Latch**, which physically prevents $S=1$ and $R=1$ from ever occurring by driving the inputs through a single Data line ($D$) and an inverter.

---

## Engineering Reality: Enable Pulse Widths, Setup Times, and Bus Isolation

In physical CMOS microchips, using Enable gates to control latches introduces real-world timing constraints that hardware engineers must calculate.

### 1. Minimum Enable Pulse Width ($t_w$)

An Enable gate cannot be opened for an infinitesimally small fraction of a picosecond.

When $E$ switches from $0$ to $1$, the input signals $S$ and $R$ must pass through the steering gates, travel along the internal feedback wires, and force the cross-coupled gates to flip state.

The minimum time the Enable line $E$ must remain high to guarantee a successful state update is called the **Minimum Enable Pulse Width ($t_w$)**:

$$
t_w \ge t_{\text{steer}} + 2 \cdot t_{\text{feedback}}
$$

Where:
* $t_w$ is the minimum active duration of the Enable pulse.
* $t_{\text{steer}}$ is the propagation delay of the input steering gates (AND or NAND).
* $t_{\text{feedback}}$ is the propagation delay of the cross-coupled memory core gates (NOR or NAND).

```text
MINIMUM ENABLE PULSE TIMING WAVEFORM

 Enable Line E :  0000000001111111111111111100000000
                           ◄───────────────►
                            Minimum Pulse Width (t_w)
                            (Must be long enough for feedback to lock!)
```

If the Enable pulse is shorter than $t_w$, the internal feedback loop will not have enough time to complete its state flip, causing the stored bit $Q$ to remain unchanged or collapse into metastability.

### 2. Input Setup Time ($t_{\text{su}}$)

To ensure a clean write operation, the data signals $S$ and $R$ must become stable **before** the Enable line $E$ transitions from $1$ back to $0$.

If input $S$ drops from $1$ to $0$ at the exact same picosecond that $E$ drops from $1$ to $0$, the steering gate might cut off the Set signal before the internal feedback loop has locked $Q = 1$. The required lead time is called the **Setup Time ($t_{\text{su}}$)**.

---

## Solved Industrial Engineering Exercise: Automated Chemical Batch Reactor State Controller

To consolidate your complete mastery of Gated SR Latches, Enable gate steering logic, truth table analysis, characteristic equations, and timing windows, we will now walk through a complete, step-by-step chemical plant safety engineering problem.

---

### Scenario and Parameters

A chemical manufacturing plant operates an automated batch reaction vessel. The reactor's main Chemical Injection Valve ($V$) is controlled by a 1-bit **Gated NOR SR Safety Latch** ($Q$).

```text
CHEMICAL BATCH REACTOR SAFETY CONTROLLER

 Fill Command (S) ────────┐
 Dump Command (R) ────────┼──► [ Gated NOR SR Latch ] ──► Injection Valve (Q)
                          │           ▲                   (1 = Open, 0 = Closed)
 Master Clock Enable (E) ─┴───────────┘
```

The system evaluates three binary signals:
1. **Fill Command ($S$)**:
   * $S = 0$: No fill requested.
   * $S = 1$: Open chemical injection valve ($Q = 1$).
2. **Dump/Flush Command ($R$)**:
   * $R = 0$: No flush requested.
   * $R = 1$: Close chemical injection valve ($Q = 0$).
3. **Master Process Enable Clock ($E$)**:
   * $E = 0$: Process Phase Inactive (Lock memory state, disable updates).
   * $E = 1$: Process Phase Active (Allow state updates).

#### System Safety Requirements

1. When $E = 0$, the injection valve state $Q$ MUST remain strictly locked in its previous position, ignoring any changes on lines $S$ and $R$.
2. When $E = 1$, setting $S = 1, R = 0$ must open the valve ($Q = 1$), and setting $S = 0, R = 1$ must close the valve ($Q = 0$).
3. If an electrical fault causes $S = 1$ and $R = 1$ simultaneously while $E = 1$, the system must detect a **Safety Violation Alarm ($A_{\text{alarm}}$)**.

#### Your Objective

1. Draw the complete gate-level schematic for the Gated NOR SR Latch with Safety Alarm logic.
2. Derive the Boolean equations for internal signals $S', R'$, output $Q_{\text{next}}$, and Alarm $A_{\text{alarm}}$.
3. Calculate the total physical CMOS transistor count for the complete circuit.
4. Simulate the system through a complete batch processing cycle, evaluating state transitions and timing windows.
5. Verify system performance against safety requirements.

---

### Step-by-Step Derivation

#### Step 1: Synthesize the Gate-Level Circuit Equations

The circuit consists of:
* Two 2-input AND steering gates ($N_1, N_2$).
* Two 2-input cross-coupled NOR memory gates ($N_3, N_4$).
* One 3-input AND gate for the Safety Alarm ($A_{\text{alarm}}$).

##### 1. Steering Gate Equations:
$$S' = S \cdot E$$
$$R' = R \cdot E$$

##### 2. Cross-Coupled Memory Core Equations:
$$Q = \overline{R' + \overline{Q}} = \overline{(R \cdot E) + \overline{Q}}$$
$$\overline{Q} = \overline{S' + Q} = \overline{(S \cdot E) + Q}$$

##### 3. Safety Violation Alarm Equation ($A_{\text{alarm}}$):
An alarm must fire if $S = 1$, $R = 1$, AND $E = 1$ simultaneously:

$$
A_{\text{alarm}} = S \cdot R \cdot E
$$

Where:
* $A_{\text{alarm}} = 1$ indicates a hazardous dual-command violation.
* $S, R$ are the Fill and Dump command lines.
* $E$ is the Master Process Enable signal.

```text
CHEMICAL REACTOR GATED LATCH SCHEMATIC WITH ALARM

Fill S ──────►┌───────┐
              │ AND 1 ├──► S' ────►┌───────┐
Enable E ──┬─►└───────┘            │ NOR 1 ├────┬──► Valve Q
           │                   ┌──►└───────┘    │
           ├─►┌───────┐        │      │         │
Dump R ────│─►│ AND 2 ├──► R'──┼──┐   │         │
           │  └───────┘        │  ▼   ▼         │
           │                   │ ┌───────┐      │
           │                   └─┤ NOR 2 ├──────┴──► Output Q'
           │                     └───────┘
           │
Fill S ────│──────────────────────►┌───────┐
Dump R ────│──────────────────────►│ AND 3 ├──► Alarm A_alarm
Enable E ──┴──────────────────────►└───────┘
```

---

#### Step 2: Construct the Complete System State Table

```text
REACTOR SAFETY CONTROL SYSTEM STATE TABLE

 Step │ Clock E │ Input S │ Input R │ Internal S' │ Internal R' │ Valve Output Q_next │ Alarm A_alarm │ Operating Status
──────┼─────────┼─────────┼─────────┼─────────────┼─────────────┼─────────────────────┼───────────────┼─────────────────────────────
  1   │    0    │    1    │    0    │      0      │      0      │       Q_prev        │       0       │ Disabled: Ignore S=1 (Hold)
  2   │    1    │    1    │    0    │      1      │      0      │          1          │       0       │ Enabled: VALVE OPENS (Q=1)
  3   │    0    │    0    │    0    │      0      │      0      │          1          │       0       │ Disabled: VALVE STAYS OPEN!
  4   │    0    │    0    │    1    │      0      │      0      │          1          │       0       │ Disabled: Ignore R=1 (Hold)
  5   │    1    │    0    │    1    │      0      │      1      │          0          │       0       │ Enabled: VALVE CLOSES (Q=0)
  6   │    0    │    0    │    0    │      0      │      0      │          0          │       0       │ Disabled: VALVE STAYS CLOSED
  7   │    1    │    1    │    1    │      1      │      1      │          X          │       1       │ FAULT! ALARM FIRES! (A=1)
```

Look at the safety performance in this table:
* **Step 1 & Step 4**: Even though command lines $S$ or $R$ are active, because $E = 0$, the internal signals $S'$ and $R'$ are held at $0$, and the valve state $Q$ remains completely unaffected!
* **Step 3 & Step 6**: When $E = 0$, the valve holds its previous setting ($1$ or $0$) indefinitely.
* **Step 7**: When $S=1, R=1, E=1$, the alarm gate instantly fires $A_{\text{alarm}} = 1$.

---

#### Step 3: CMOS Transistor Count Calculation

Let us calculate the physical transistor count for this Gated NOR SR Latch with Alarm:
* **AND Gates 1 & 2** (2-input CMOS AND gates): 6 transistors each $\times 2 = 12 \text{ transistors}$.
* **NOR Gates 1 & 2** (2-input CMOS NOR gates): 4 transistors each $\times 2 = 8 \text{ transistors}$.
* **AND Gate 3** (3-input CMOS AND gate for Alarm): 8 transistors.

$$
\text{Total Transistor Footprint} = 12 + 8 + 8 = \mathbf{28 \text{ Transistors}}
$$

The complete gated memory cell and safety monitor requires only **28 physical CMOS transistors**!

---

#### Step 4: Trace an Industrial Batch Processing Timeline

Let us trace the chemical reactor system through a complete operational timeline:

```text
CHEMICAL REACTOR OPERATIONAL TIMELINE

 Time t0 (Process Idle)        : E = 0, S = 0, R = 0 ──► Q = 0 (Valve Closed)
 Time t1 (Pre-Fill Signal)     : E = 0, S = 1, R = 0 ──► Q = 0 (Blocked by E=0! Valve stays closed)
 Time t2 (Fill Phase Active)   : E = 1, S = 1, R = 0 ──► Q = 1 (VALVE OPENS!)
 Time t3 (Reaction In Progress): E = 0, S = 0, R = 0 ──► Q = 1 (Valve STAYS OPEN via memory loop)
 Time t4 (Flush Phase Active)  : E = 1, S = 0, R = 1 ──► Q = 0 (VALVE CLOSES!)
 Time t5 (Fault Event)         : E = 1, S = 1, R = 1 ──► A_alarm = 1 (SAFETY ALARM FIRES!)
```

##### Detailed Chronology Verification:

1. **Time $t_1$ (Pre-Fill Signal before Phase Enable)**:
   $E = 0, S = 1, R = 0$.
   $S' = 1 \cdot 0 = 0$, $R' = 0 \cdot 0 = 0$.
   $Q_{\text{next}} = (0 \cdot 1) + (1 \cdot 0) + (1 \cdot 0) = 0$.
   The premature fill command $S=1$ is blocked by the Enable gate ($E=0$). The valve remains closed.

2. **Time $t_2$ (Fill Phase Active $E = 1$)**:
   $E = 1, S = 1, R = 0$.
   $S' = 1 \cdot 1 = 1$, $R' = 0 \cdot 1 = 0$.
   $Q_{\text{next}} = (1 \cdot 1) + (0 \cdot 0) + (1 \cdot 0) = 1$.
   The Enable gate opens. **The chemical injection valve opens ($Q = 1$).**

3. **Time $t_3$ (Reaction Phase $E = 0$)**:
   $E = 0, S = 0, R = 0$.
   $S' = 0$, $R' = 0$.
   $Q_{\text{next}} = (0 \cdot 0) + (1 \cdot 1) + (1 \cdot 1) = 1$.
   The Enable gate closes. **The valve stays open ($Q = 1$).** The chemical continues feeding into the reaction vessel under memory control.

4. **Time $t_4$ (Flush Phase Active $E = 1, R = 1$)**:
   $E = 1, S = 0, R = 1$.
   $S' = 0$, $R' = 1$.
   $Q_{\text{next}} = (1 \cdot 0) + (0 \cdot 1) + (0 \cdot 1) = 0$.
   **The valve closes ($Q = 0$).**

5. **Time $t_5$ (Dual Command Fault Event $E = 1, S = 1, R = 1$)**:
   $E = 1, S = 1, R = 1$.
   $A_{\text{alarm}} = S \cdot R \cdot E = 1 \cdot 1 \cdot 1 = 1$.
   **The Safety Violation Alarm fires instantly ($A_{\text{alarm}} = 1$).**

All system safety requirements evaluate with 100% mathematical and logical precision. The Gated NOR SR Latch controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Gated SR Latch**: A sequential memory circuit that combines an input steering gate stage (AND or NAND valves) with a cross-coupled bistable memory core, allowing state updates ($Q = 1$ or $Q = 0$) to occur exclusively during an active Enable control window ($E = 1$) while locking the stored memory state when disabled ($E = 0$).
* **Enable Gate**: The input threshold control gate mechanism that acts as a binary valve, isolating the internal memory loop from external signal noise when $E = 0$ by forcing internal input signals to $0$ (for NOR latches) or $1$ (for NAND latches), establishing a controlled timing boundary for sequential memory operations.
