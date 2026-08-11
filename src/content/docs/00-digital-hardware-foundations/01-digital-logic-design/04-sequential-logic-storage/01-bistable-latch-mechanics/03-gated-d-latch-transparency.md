---
title: "Gated D-Latch Architecture and Level Transparency Mechanics"
---

# Gated D-Latch Architecture and Level Transparency Mechanics

## The Persistent Hazard of Dual-Input Memory Conflicts

An SR latch (Set/Reset latch) provides the fundamental mechanism of sequential memory: it uses a cross-coupled feedback loop to store a single bit of information ($Q$). Adding an Enable gate to an SR latch creates a controllable update window, allowing us to lock the memory cell when Enable is low ($E = 0$) and update it when Enable is high ($E = 1$).

However, even with an Enable gate, the Gated SR Latch suffers from a fatal architectural defect: **it possesses an invalid, dangerous input state**.

If an external noise spike, a software glitch, or a signal race condition asserts both the Set ($S$) and Reset ($R$) lines to $1$ simultaneously while Enable is active ($E = 1$), the internal memory loop experiences an immediate physical conflict. In a NOR-based latch, both outputs are forced to zero ($Q = 0, \overline{Q} = 0$). In a NAND-based latch, both outputs are forced to one ($Q = 1, \overline{Q} = 1$).

```text
THE GATED SR LATCH INVALID STATE FAILURE

 Inputs: S = 1, R = 1, E = 1 ──► [ Gated SR Latch ] ──► Outputs Collapse! (Q = Q')
                                                         │
                                                         ▼
                                            Metastable Race on E -> 0!
                                            (Memory Settles Randomly!)
```

This dual-active condition ($S = 1, R = 1$) violates the fundamental complementary relationship of the outputs ($Q \neq \overline{Q}$). 

Even worse, when Enable subsequently drops to $0$ ($E = 1 \to 0$), the two internal cross-coupled gates enter an unpredictable race condition. The stored bit settles into a completely random state—either $0$ or $1$—depending on microscopic thermal noise and silicon manufacturing variances.

In a computer memory system containing millions of storage cells, risking random memory corruption whenever two input wires happen to go high together is completely unacceptable.

How do we eliminate the forbidden state forever? How do we build a 1-bit memory cell that is physically incapable of receiving $S = 1$ and $R = 1$ at the same time?

We force the Set and Reset inputs to always be exact **logical opposites** of each other by connecting them to a single Data line ($D$) through an internal NOT gate inverter!

The resulting memory circuit is the **Gated Data Latch (Gated D-Latch)**. By replacing the separate $S$ and $R$ inputs with a single $D$ input, we physically eliminate the invalid state and introduce a fundamental operational property known as **Level Transparency**.

---

## The Camera Shutter: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a Gated D-Latch and its level transparency, let us step away from microchips and picture a classic SLR camera photographing a moving car.

Imagine a camera mounted on a tripod pointed at a racetrack where a red car is driving back and forth. Inside the camera is an image sensor that records whatever picture passes through the lens ($D$). In front of the sensor is a mechanical **Camera Shutter** ($E$).

```text
THE CAMERA SHUTTER LEVEL TRANSPARENCY MODEL

 Moving Car (Data Input D) ──► [ Camera Shutter (Enable E) ] ──► Sensor (Output Q)
```

The camera operates in two distinct modes depending on the status of the shutter button ($E$):

### Mode 1: The Shutter is OPEN (Transparent Mode, $E = 1$)
When you press and hold the shutter button down ($E = 1$), the mechanical shutter opens wide and stays open.

As the red car drives left and right across the track, the image on the sensor ($Q$) continuously changes in real time, matching the car's position ($D$) exactly. 
* If the car moves to the left ($D = 0$), the sensor image shows left ($Q = 0$).
* If the car moves to the right ($D = 1$), the sensor image shows right ($Q = 1$).

While the shutter is held open ($E = 1$), the camera is completely **Transparent**. The sensor does not hold a fixed frozen picture; it simply acts as a clear glass window that mirrors whatever the car is doing in real time!

```text
TRANSPARENT MODE: SHUTTER OPEN (E = 1)

 Car Position D Changes:  Left (0) ──► Right (1) ──► Left (0) ──► Right (1)
                          │            │            │            │
                          ▼            ▼            ▼            ▼
 Sensor Image Q Follows:  Left (0) ──► Right (1) ──► Left (0) ──► Right (1)
                          (Output Q is TRANSPARENT to Input D!)
```

### Mode 2: The Shutter SNAPS CLOSED (Latch / Hold Mode, $E = 1 \to 0$)
Now, imagine that while the car is sitting on the right side of the track ($D = 1$), you release the shutter button. The shutter **snaps closed** ($E = 1 \to 0$).

The exact microsecond the shutter closes, the camera takes a "snapshot." The image sensor freezes the exact image that was present at that final instant ($Q = 1$).

Now, after the shutter is closed ($E = 0$), the red car continues driving back and forth across the track ($D$ changes from $1 \to 0 \to 1 \to 0$). What happens to the frozen image on the camera sensor ($Q$)?

**Nothing!** The shutter is closed ($E = 0$). The sensor ignores the car's ongoing movements. The camera holds the frozen image ($Q = 1$) permanently on its display screen!

```text
HOLD MODE: SHUTTER CLOSED (E = 0)

 Car Keeps Moving D:     Left (0) ──► Right (1) ──► Left (0) ──► Right (1)
                         │            │            │            │
                         ▼            ▼            ▼            ▼
 Sensor Image Q Frozen:  Right (1) ──► Right (1) ──► Right (1) ──► Right (1)
                         (Output Q is FROZEN / LATCHED!)
```

This camera shutter is the exact physical analogue of a **Gated D-Latch**:
* The moving car's position is the **Data Input ($D$)**.
* The mechanical shutter button is the **Enable Control Signal ($E$)**.
* The frozen image on the sensor is the **Stored Bit Output ($Q$)**.
* The period when the shutter is open is **Level Transparency ($E = 1$)**.
* The moment the shutter closes is the **Latch Event ($E = 1 \to 0$)**.

---

## Mechanics of Gated D-Latch Architecture and Elimination of Invalid States

To master the design of the Gated D-Latch, we must dissect the formal mechanics of its two core primitives:
1. **The Single-Input Inverter Bridge**: How driving $S$ and $R$ from a single Data line ($D$) through an internal inverter physically eliminates the forbidden state ($S=1, R=1$).
2. **Level Transparency**: How output $Q$ tracks input $D$ continuously while $E = 1$, and freezes the instantaneous value of $D$ on the falling edge of $E$.

---

### Primitive 1: The Single-Input Inverter Bridge

How do we convert an SR latch into a D latch?

In a standard Gated SR Latch, the memory core receives internal Set ($S'$) and Reset ($R'$) signals. To eliminate the possibility of $S'$ and $R'$ being $1$ at the same time, we introduce a **single Data line ($D$)** and connect it to the inputs as follows:
* Connect Data line $D$ directly to the Set steering input: $S = D$.
* Connect Data line $D$ through a NOT gate inverter to the Reset steering input: $R = \overline{D}$.

```text
THE SINGLE-INPUT INVERTER BRIDGE SCHEMATIC

Data D ────┬───────────────────────►┌───────┐
           │                        │ AND 1 ├──► Internal Set S' (D · E)
Enable E ──│──┬────────────────────►└───────┘
           │  │
           │  └─►┌─────┐            ┌───────┐
           └────►│ NOT ├─► D' ─────►│ AND 2 ├──► Internal Reset R' (D' · E)
                 └─────┘            └───────┘
```

Let us evaluate the internal signals $S'$ and $R'$ generated by these steering AND gates across all possible values of $D$ when Enable is active ($E = 1$):

#### Case 1: Data Input is $1$ ($D = 1, E = 1$)
* Set steering gate: $S' = D \cdot E = 1 \cdot 1 = 1$.
* Reset steering gate: $R' = \overline{D} \cdot E = \overline{1} \cdot 1 = 0 \cdot 1 = 0$.
* Internal signals delivered to memory core: $S' = 1, R' = 0$.
* The memory core enters the **SET State** ($Q = 1$).

#### Case 2: Data Input is $0$ ($D = 0, E = 1$)
* Set steering gate: $S' = D \cdot E = 0 \cdot 1 = 0$.
* Reset steering gate: $R' = \overline{D} \cdot E = \overline{0} \cdot 1 = 1 \cdot 1 = 1$.
* Internal signals delivered to memory core: $S' = 0, R' = 1$.
* The memory core enters the **RESET State** ($Q = 0$).

```text
INVERTER BRIDGE INPUT MAPPING (E = 1)

 Data Input D │ Internal Set (S' = D*E) │ Internal Reset (R' = D'*E) │ Resulting Latch State
──────────────┼─────────────────────────┼────────────────────────────┼───────────────────────
    D = 0     │          S' = 0         │           R' = 1           │ RESET (Q = 0)
    D = 1     │          S' = 1         │           R' = 0           │ SET   (Q = 1)
```

Look at this mapping table:
Is it possible for $S'$ and $R'$ to be $1$ at the same time?
**NO!** Because $R' = \overline{D} \cdot E$, $S'$ and $R'$ are logically complementary when $E = 1$. 

If $S' = 1$, then $R'$ MUST be $0$. If $R' = 1$, then $S'$ MUST be $0$.

The single-input inverter bridge makes the invalid state ($S'=1, R'=1$) **physically impossible**!

---

### Complete Gated NOR D-Latch Circuit Schematic

By connecting the inverter bridge and steering AND gates to a cross-coupled NOR memory cell, we obtain the complete **Gated NOR D-Latch**:

```text
GATED NOR D-LATCH CIRCUIT SCHEMATIC

Data D ────┬───────────────────────►┌───────┐
           │                        │ AND 1 ├──► S' ───►┌───────┐
Enable E ──│──┬────────────────────►└───────┘           │ NOR 1 ├───────► Output Q
           │  │                                         └───────┘     
           │  └─►┌─────┐            ┌───────┐            ▲ │          
           └────►│ NOT ├─► D' ─────►│ AND 2 ├──► R'────┐ │ │          
                 └─────┘            └───────┘          ▼ │ ▼          
                                                      ┌───────┐       
                                                      │ NOR 2 ├─────────► Output Q'
                                                      └───────┘
```

---

### Primitive 2: Level Transparency Mechanics

The defining physical characteristic of a Gated D-Latch is **Level Transparency**.

Level transparency describes the behavior of output $Q$ relative to Enable signal $E$:

```text
GATED D-LATCH EXHAUSTIVE TRUTH TABLE

 Enable (E) │ Data Input (D) │ Output Q_next │ Output Q'_next │ System Operating Mode
────────────┼────────────────┼───────────────┼────────────────┼───────────────────────────────
     0      │       X        │    Q_prev     │    Q'_prev     │ LATCHED / HOLD (Memory Locked)
     1      │       0        │       0       │       1        │ TRANSPARENT (Q follows D = 0)
     1      │       1        │       1       │       0        │ TRANSPARENT (Q follows D = 1)
```

Let me break down the two operational states of Level Transparency in complete detail:

#### 1. The Transparent Window ($E = 1$, Logic High Level)
While the Enable signal $E$ is held at a High voltage level ($1$), the input steering gates pass data input $D$ directly into the memory core.

If input $D$ changes value while $E = 1$:
* $D$ switches $0 \to 1 \implies Q$ switches $0 \to 1$ after gate propagation delay $t_{\text{pd}}$.
* $D$ switches $1 \to 0 \implies Q$ switches $1 \to 0$ after gate propagation delay $t_{\text{pd}}$.

During the entire time $E = 1$, the latch behaves as a **transparent window**. Output $Q$ faithfully follows every wiggle, pulse, or transition that occurs on Data line $D$.

```text
LEVEL TRANSPARENCY TIMING RELATIONSHIP (E = 1)

Enable E : ───────────────────────────────────────────── (Held High)

Data D   : ──────┐      ┌──────────┐       ┌────────────
                 └──────┘          └───────┘
                 │      │          │       │
                 ▼      ▼          ▼       ▼
Output Q : ──────┐      ┌──────────┐       ┌────────────
                 └──────┘          └───────┘
           (Output Q tracks Data D continuously when E=1)
```

#### 2. The Latch / Freeze Event ($E = 1 \to 0$, Falling Edge)
The exact microsecond the Enable line $E$ drops from $1$ to $0$ (the **falling edge** of Enable):
1. Steering AND Gate 1 evaluates $S' = D \cdot 0 = 0$.
2. Steering AND Gate 2 evaluates $R' = \overline{D} \cdot 0 = 0$.
3. Both internal inputs drop to $S' = 0, R' = 0$.
4. The cross-coupled memory core enters the **HOLD State**.

The latch **captures and freezes** whatever binary value was present on Data line $D$ at the exact moment $E$ transitioned from $1$ to $0$.

After $E$ reaches $0$, any further changes on Data line $D$ are completely ignored. Output $Q$ holds its frozen value indefinitely until $E$ rises back to $1$.

```text
HOLD MODE TIMING RELATIONSHIP (E = 0)

Enable E : ───────────────────────────────────────────── (Held Low)

Data D   : ──────┐      ┌──────────┐       ┌──────────── (Data wiggles)
                 └──────┘          └───────┘
                 │      │          │       │
                 ▼      ▼          ▼       ▼ (Blocked)
Output Q : ───────────────────────────────────────────── (Q Stays Frozen!)
           (All changes on Data line D are ignored)
```

---

## Characteristic Equation and State Transition Mapping

To mathematically model a Gated D-Latch in hardware description languages or formal logic verifiers, we derive its next-state **Characteristic Equation**.

### Deriving the Characteristic Equation via K-Map

We construct a 3-variable Karnaugh Map for next state $Q_{\text{next}}$ using inputs $E, D,$ and current state $Q$:

```text
GATED D-LATCH NEXT-STATE K-MAP

             DQ = 00       DQ = 01       DQ = 11       DQ = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
   E = 0  │      0      │      1      │      1      │      0      │
          │  (Cell 0)   │  (Cell 1)   │  (Cell 3)   │  (Cell 2)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
   E = 1  │      0      │      0      │      1      │      1      │
          │  (Cell 4)   │  (Cell 5)   │  (Cell 7)   │  (Cell 6)   │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s on this K-Map:
* **Group 1 (Horizontal 2-cell group in row $E=0$)**: Cells 1 and 3 ($E=0, Q=1, D$ changes).
  Giving term: **$\overline{E} \cdot Q$**.
* **Group 2 (Horizontal 2-cell group in row $E=1$)**: Cells 7 and 6 ($E=1, D=1, Q$ changes).
  Giving term: **$E \cdot D$**.

Combining Group 1 and Group 2 yields the **Gated D-Latch Characteristic Equation**:

$$
Q_{\text{next}} = (E \cdot D) + (\overline{E} \cdot Q)
$$

Where:
* $Q_{\text{next}}$ is the stored output bit in the next state time step.
* $E$ is the Enable control signal.
* $\overline{E}$ is the complemented Enable control signal.
* $D$ is the Data input bit.
* $Q$ is the current stored output bit.

```text
DISSECTING THE D-LATCH CHARACTERISTIC EQUATION

 Q_next = (E * D)  +  (E' * Q)
             │           │
   [ Transparent Mode ]  └── [ Hold Mode ]
   (When E=1, Q_next=D)      (When E=0, Q_next=Q)
```

Look at how intuitively this algebraic equation explains both operational modes:
* **When Enabled ($E = 1, \overline{E} = 0$)**: $Q_{\text{next}} = (1 \cdot D) + (0 \cdot Q) = D$. Output $Q$ equals $D$ (Transparent!).
* **When Disabled ($E = 0, \overline{E} = 1$)**: $Q_{\text{next}} = (0 \cdot D) + (1 \cdot Q) = Q$. Output $Q$ retains its previous value (Hold!).

---

## Engineering Reality: Race-Around Glitches and the Need for Edge-Triggering

While the Gated D-Latch successfully eliminates the forbidden $S=1, R=1$ state, its level transparency introduces a serious physical hazard in feedback systems: **The Race-Around Condition**.

### 1. The Feedback Race-Around Hazard

Suppose an arithmetic processing unit uses a Gated D-Latch to store an accumulator value $Q$. The output $Q$ is fed through an incrementer circuit ($Q + 1$), and the incremented result is fed directly back into Data input $D$ of the exact same Gated D-Latch!

```text
FEEDBACK RACE-AROUND HAZARD IN A TRANSPARENT LATCH

           ┌─────────────────────────────────────────┐
           │                                         │
           ▼                                         │ (Feedback Loop)
 ┌───────────────────┐    Data D     ┌───────────────┴─┐
 │ Incrementation    ├──────────────►│ Gated D-Latch   ├──► Stored Value Q
 │ Circuit (Q + 1)   │               │ (Enable E = 1)  │
 └───────────────────┘               └─────────────────┘
```

Trace what happens when the Enable line is held High ($E = 1$) for a long time (say, 10 nanoseconds):
1. Initial value $Q = 5$.
2. The incrementer computes $D = Q + 1 = 6$.
3. Because $E = 1$, the D-Latch is **transparent**! Output $Q$ immediately becomes $6$.
4. The new output $Q = 6$ flows back into the incrementer, which computes $D = 7$.
5. Because $E = 1$ is STILL HIGH, output $Q$ becomes $7$!
6. The circuit continuously increments $5 \to 6 \to 7 \to 8 \to 9 \to 10 \dots$ in an uncontrolled, chaotic loop for as long as $E = 1$!

```text
CHAOTIC RACE-AROUND OSCILLATION WHILE E = 1

 Time t0 : Enable E = 1 ──► Latch Transparent ──► Q = 5
 Time t1 : Incrementation finishes            ──► D = 6 ──► Q becomes 6!
 Time t2 : Incrementation finishes            ──► D = 7 ──► Q becomes 7!
 Time t3 : Incrementation finishes            ──► D = 8 ──► Q becomes 8!
 (Uncontrolled race-around oscillation until Enable E drops to 0!)
```

This uncontrolled multi-incrementation is a **Race-Around Condition**. Because the latch remains open and transparent for the entire duration that $E = 1$, data loops around the feedback path multiple times during a single enable pulse.

### 2. Physical Setup ($t_{\text{su}}$) and Hold ($t_h$) Time Boundaries

To guarantee that a Gated D-Latch accurately captures input data without entering an unpredictable, unstable state called **Metastability**, physical silicon manufacturing dictates two non-negotiable timing margins:

1. **Setup Time ($t_{\text{su}}$)**: The minimum time window that Data input $D$ must remain stable **BEFORE** the Enable line drops ($E = 1 \to 0$).
2. **Hold Time ($t_h$)**: The minimum time window that Data input $D$ must remain stable **AFTER** the Enable line drops ($E = 1 \to 0$).

```text
SETUP AND HOLD TIMING WINDOW AROUND FALLING ENABLE EDGE

Enable Line E : ─────────────────┐
                                 └─────────────────────────
                                 ▲
                                 │ Falling Edge (1 ─► 0)
Data Input D  : ─────[ DATA MUST BE STABLE ]───────────────
                     ◄─────────►   ◄─────────►
                       t_setup       t_hold
```

If Data input $D$ changes state inside the restricted $[t_{\text{su}}, t_h]$ timing window around the falling edge of $E$, the internal feedback transistors will receive an incomplete voltage charge, causing output $Q$ to hover at an invalid middle voltage level (Metastability) before randomly collapsing to $0$ or $1$.

To eliminate race-around conditions and provide precise single-pulse state transitions, digital engineering advances from level-sensitive latches to **Edge-Triggered Flip-Flops**.

---

## Solved Industrial Engineering Exercise: Digital Thermostat Temperature Memory Cell

To consolidate your complete mastery of Gated D-Latch architecture, level transparency mechanics, characteristic equations, and setup/hold timing windows, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

A medical refrigeration system uses an automated temperature memory cell to monitor a cold-storage vaccine vault. The system uses a 1-bit **Gated NOR D-Latch** to store an Over-Temperature Alarm Bit ($Q$).

```text
VACCINE VAULT TEMPERATURE ALARM MEMORY

 Temp Sensor Input (D) ───► [ Gated NOR D-Latch ] ──► Alarm Memory Bit (Q)
 Sample Clock (E)      ───► [   Storage Cell    ]
```

The system evaluates two binary input signals:
1. **Temperature Hazard Sensor ($D$)**:
   * $D = 0$: Temperature normal ($\le 4^\circ\text{C}$).
   * $D = 1$: Temperature high ($> 4^\circ\text{C}$, vaccine spoilage hazard!).
2. **Sample Enable Clock ($E$)**:
   * $E = 1$: Sample Window Active (Latch is transparent, monitoring sensor).
   * $E = 0$: Sample Window Inactive (Latch is locked, holding stored alarm status).

#### Gate-Level Propagation Delays:
* Input Inverter Delay: $t_{\text{inv}} = 0.5\text{ ns}$
* Steering AND Gate Delay: $t_{\text{and}} = 0.8\text{ ns}$
* Cross-Coupled NOR Gate Delay: $t_{\text{nor}} = 0.8\text{ ns}$

#### Your Objective

1. Draw the complete gate-level schematic for the Gated NOR D-Latch.
2. Derive the Boolean equations for internal signals $S', R'$, and output $Q_{\text{next}}$.
3. Calculate the total Data-to-Output propagation delay ($t_{\text{pd,D}\to Q}$) when the latch is transparent ($E = 1$).
4. Calculate the Minimum Enable Pulse Width ($t_{w,\text{min}}$) required to guarantee a valid state write.
5. Simulate the memory cell across a complete temperature monitoring timeline, evaluating transparent and latched states.
6. Verify mathematical correctness against system safety requirements.

---

### Step-by-Step Derivation

#### Step 1: Write the Gate-Level Equations for the Gated NOR D-Latch

The circuit consists of:
* One NOT gate inverter for input $D$: $\overline{D}$.
* Two 2-input AND steering gates ($N_1, N_2$).
* Two 2-input cross-coupled NOR memory gates ($N_3, N_4$).

##### 1. Steering Gate Equations:
$$S' = D \cdot E$$
$$R' = \overline{D} \cdot E$$

##### 2. Cross-Coupled Memory Core Equations:
$$Q = \overline{R' + \overline{Q}} = \overline{(\overline{D} \cdot E) + \overline{Q}}$$
$$\overline{Q} = \overline{S' + Q} = \overline{(D \cdot E) + Q}$$

---

#### Step 2: Calculate Data-to-Output Propagation Delay ($t_{\text{pd,D}\to Q}$)

When the latch is transparent ($E = 1$), suppose input $D$ switches from $0$ to $1$:

Let us trace the longest path from Data input $D$ to output $Q$:
1. Signal $D = 1$ enters Steering AND Gate 1 ($N_1$).
   $N_1$ computes $S' = D \cdot E = 1 \cdot 1 = 1$.
   Delay = $t_{\text{and}} = 0.8\text{ ns}$.
2. Signal $S' = 1$ enters NOR Gate 2 ($N_4$).
   $N_4$ computes $\overline{Q} = \overline{S' + Q} = \overline{1 + Q} = 0$.
   Delay = $t_{\text{nor}} = 0.8\text{ ns}$.
3. Signal $\overline{Q} = 0$ enters NOR Gate 1 ($N_3$).
   $N_3$ computes $Q = \overline{R' + \overline{Q}} = \overline{0 + 0} = 1$.
   Delay = $t_{\text{nor}} = 0.8\text{ ns}$.

```text
DATA-TO-OUTPUT PROPAGATION DELAY PATH

 Input D ──► [ AND 1 (0.8ns) ] ──► S'=1 ──► [ NOR 2 (0.8ns) ] ──► Q'=0 ──► [ NOR 1 (0.8ns) ] ──► Output Q=1
             ◄─────────────────────────────────────────────────────────────────────────────►
                                Total Latency = 0.8 + 0.8 + 0.8 = 2.4 ns
```

$$
t_{\text{pd,D}\to Q} = t_{\text{and}} + 2 \cdot t_{\text{nor}} = 0.8\text{ ns} + 0.8\text{ ns} + 0.8\text{ ns} = \mathbf{2.4 \text{ ns}}
$$

The output $Q$ updates $2.4\text{ nanoseconds}$ after input $D$ changes during transparent mode.

---

#### Step 3: Calculate Minimum Enable Pulse Width ($t_{w,\text{min}}$)

To guarantee that the internal feedback loop locks $Q = 1$ before Enable drops to $0$:

$$
t_{w,\text{min}} = t_{\text{and}} + 2 \cdot t_{\text{nor}} = 0.8\text{ ns} + 1.6\text{ ns} = \mathbf{2.4 \text{ ns}}
$$

The sample clock pulse $E$ must stay High for at least **$2.4\text{ nanoseconds}$** to execute a reliable write.

---

#### Step 4: Simulate a Temperature Monitoring Timeline

Let us trace the alarm cell through a 6-step operational timeline:

```text
TEMPERATURE MONITORING TIMELINE

 Step 1 (Normal Temp, Sample OFF) : E = 0, D = 0 ──► Q_next = Q_prev (Hold, Initial Q = 0)
 Step 2 (Temp Spike, Sample OFF)  : E = 0, D = 1 ──► Q_next = 0 (BLOCKED by E=0! Alarm stays 0)
 Step 3 (Sample Clock ON)         : E = 1, D = 1 ──► Q_next = 1 (TRANSPARENT! Alarm FIRES: Q = 1)
 Step 4 (Sample Clock OFF)        : E = 0, D = 1 ──► Q_next = 1 (LATCHED! Alarm FROZEN at Q = 1)
 Step 5 (Temp Drops to Normal)    : E = 0, D = 0 ──► Q_next = 1 (HOLDS ALARM! Q stays 1)
 Step 6 (Clear Sample Cycle)      : E = 1, D = 0 ──► Q_next = 0 (TRANSPARENT! Alarm Cleared: Q = 0)
```

##### Detailed Step Evaluations:

1. **Step 1 ($E = 0, D = 0, Q = 0$)**:
   $S' = 0 \cdot 0 = 0$, $R' = 1 \cdot 0 = 0$.
   $Q_{\text{next}} = (0 \cdot 0) + (1 \cdot 0) = 0$.
   Initial state: Temperature normal, alarm OFF ($Q = 0$).

2. **Step 2 ($E = 0, D = 1, Q = 0$)**:
   Temperature spikes ($D = 1$), but sample clock is OFF ($E = 0$).
   $S' = 1 \cdot 0 = 0$, $R' = 0 \cdot 0 = 0$.
   $Q_{\text{next}} = (0 \cdot 1) + (1 \cdot 0) = 0$.
   **The alarm remains $0$**. The disabled enable gate isolates the memory cell until the sampling clock arrives.

3. **Step 3 ($E = 1, D = 1, Q = 0$)**:
   Sample clock fires HIGH ($E = 1$) while temperature hazard is active ($D = 1$).
   $S' = 1 \cdot 1 = 1$, $R' = 0 \cdot 1 = 0$.
   $Q_{\text{next}} = (1 \cdot 1) + (0 \cdot 0) = 1$.
   **The latch becomes transparent. Alarm fires ($Q = 1$)!**

4. **Step 4 ($E = 0, D = 1, Q = 1$)**:
   Sample clock drops LOW ($E = 0$).
   $S' = 0$, $R' = 0$.
   $Q_{\text{next}} = (0 \cdot 1) + (1 \cdot 1) = 1$.
   **The latch enters Hold mode. Alarm is frozen at $Q = 1$!**

5. **Step 5 ($E = 0, D = 0, Q = 1$)**:
   Temperature drops back to normal ($D = 0$), but sample clock is OFF ($E = 0$).
   $S' = 0$, $R' = 0$.
   $Q_{\text{next}} = (0 \cdot 0) + (1 \cdot 1) = 1$.
   **The alarm STAYS AT $Q = 1$!** The latch successfully preserved the historical record that a temperature hazard occurred in the past!

6. **Step 6 ($E = 1, D = 0, Q = 1$)**:
   Sample clock fires HIGH ($E = 1$) after temperature has normalized ($D = 0$).
   $S' = 0 \cdot 1 = 0$, $R' = 1 \cdot 1 = 1$.
   $Q_{\text{next}} = (1 \cdot 0) + (0 \cdot 1) = 0$.
   **The latch becomes transparent. The alarm clears ($Q = 0$).**

All steps evaluate with 100% mathematical and physical precision. The Gated D-Latch temperature memory cell is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Gated D-Latch**: A 1-bit sequential memory circuit that uses a single Data input $D$ and an internal inverter to force $S = D$ and $R = \overline{D}$, completely eliminating the forbidden $S=1, R=1$ invalid state and providing a single-point data storage architecture governed by characteristic equation $Q_{\text{next}} = (E \cdot D) + (\overline{E} \cdot Q)$.
* **Level Transparency**: The physical property of a gated latch where, during the active high level of the Enable control signal ($E = 1$), output $Q$ continuously tracks and mirrors any data transitions occurring on input $D$ in real time, capturing and freezing the instantaneous value of $D$ at the exact moment Enable transitions to low ($E = 1 \to 0$).
