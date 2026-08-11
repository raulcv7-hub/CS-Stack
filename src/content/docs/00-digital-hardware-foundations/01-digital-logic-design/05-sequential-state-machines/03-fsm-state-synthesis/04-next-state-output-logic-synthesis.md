---
title: "Next-State and Output Logic Synthesis for Finite State Machines"
---

# Next-State and Output Logic Synthesis for Finite State Machines

## The Transition from Tabular Specifications to Physical Silicon Gates

Once a finite state machine's state diagram has been reduced to eliminate redundant states, assigned binary state codes, and mapped through flip-flop excitation tables, an engineer reaches the final, critical step of sequential controller design: turning abstract tabular requirements into physical, interconnected logic gates.

A state excitation table tells us what binary values must be applied to flip-flop inputs ($D_1, D_0$) and output pins ($Y_1, Y_0$) for every combination of current state ($Q_1, Q_0$) and external input ($X$). However, you cannot solder a table directly onto a printed circuit board or fabricate a matrix of numbers onto a silicon wafer.

If an engineer constructs the next-state and output logic by manually building un-minimized AND-OR gate trees for every single row in the state table, the resulting circuit suffers from severe physical penalties:

```text
UN-MINIMIZED FSM SYNTHESIS (BLOATED HARDWARE)

 Tabular State Specification ──► [ Direct Minterm Wiring ] ──► Bloated Gate Trees
 (Raw Un-Minimized Table)         (Every Row = AND Gate)      (20+ Gates Required)
                                                                    │
                                                                    ▼
                                                       Excessive Silicon Area
                                                       High Power Consumption
                                                       Long Delay (Low f_max!)
```

Connecting raw minterm gates for every table row creates a bloated circuit containing dozens of multi-input AND and OR gates. This excessive gate count consumes valuable silicon die area, increases static and dynamic power consumption, and introduces long signal propagation delays ($t_{\text{logic}}$) that slow down the entire system clock frequency.

Furthermore, in sequential circuits, a long propagation delay in the next-state logic path causes setup time violations at the inputs of the state register flip-flops, causing the machine to miss state transitions and collapse into non-deterministic metastable states.

How do we transform a multi-variable state excitation table into the leanest, fastest possible physical logic gate network?

We execute **Transition Logic Minimization** using multi-variable Karnaugh Maps—exploiting unused binary state codes as Don't Care ($X$) wildcards—and assemble the resulting equations into an integrated, closed-loop **FSM Gate Schematic**.

---

## The Puppet Master's Strings: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how next-state logic gates interact with state register flip-flops, let us picture a marionette puppet performance on a theater stage.

Imagine a wooden puppet standing on a stage. The puppet can assume three distinct physical poses: Pose 0 (Standing Bow), Pose 1 (Dancing Arm Raised), and Pose 2 (Sitting Down).

```text
THE MARIONETTE PUPPET CONTROLLER MODEL

            ┌─────────────────────────────────────────┐
            │ Puppet Master's Control Box (Gates)     │
            └──────────────┬──────────────────┬───────┘
                           │                  │
               Pull String 1                  Pull String 0
            (Control Signal D1)            (Control Signal D0)
                           │                  │
                           ▼                  ▼
            ┌─────────────────────────────────────────┐
            │ Wooden Marionette Legs & Arms (FFs)     │
            │ Current Pose: State Q                   │
            └─────────────────────────────────────────┘
```

Inside the puppet stage is a mechanism consisting of three parts:

1. **The Marionette Body (The State Register)**:
   The puppet's joints are driven by mechanical levers (Flip-Flops). The puppet's physical stance on stage right now is its **Current State ($Q$)**.

2. **The Puppet Master's Control Box (The Next-State Logic Gates)**:
   Above the stage, a mechanical control box receives two pieces of information: the puppet's current pose ($Q$) and a signal from the music conductor ($X$). The control box uses levers and pulleys (Logic Gates) to pull control strings ($D_1, D_0$).
   * These control strings ($D_1, D_0$) do not change the puppet's pose instantly while the music is playing; they pull against internal spring locks, preparing the puppet for its next move!

3. **The Drumbeat (The System Clock $CLK$)**:
   When the drummer hits the snare drum ($CLK$ edge):
   * The spring locks release for a fraction of a second.
   * The tension on strings $D_1$ and $D_0$ pulls the puppet's legs and arms into its **New Pose ($Q_{\text{next}}$)**!

Now, consider what happens if the Puppet Master's control box is poorly designed:
* If the control box contains a tangled web of 50 redundant strings and heavy iron pulleys, pulling a string takes immense physical effort. The puppet moves sluggishly, missing the beat of the music!
* But if the engineer simplifies the pulley system down to just two lightweight cords, pulling the cords requires almost zero effort. The puppet snaps into its new pose instantly on every single drumbeat!

This puppet performance is the exact physical analogue of **Next-State and Output Logic Synthesis**:
* The puppet's current pose is the **State Register ($Q$)**.
* The music conductor's signal is the **External Input ($X$)**.
* The simplified pulley system is the **Minimized Next-State Logic ($D_i = g_i(Q, X)$)**.
* The drumbeat is the **System Clock ($CLK$)**.
* The puppet's facial expression or spotlight setting is the **Moore/Mealy Output ($Y = f(Q, X)$)**.

---

## Mechanics of Next-State and Output Logic Synthesis

To master FSM synthesis, we must dissect the formal mechanics of its two core primitives:
1. **Transition Logic Minimization**: How multi-variable K-maps evaluate state bits and input variables together, exploiting unused binary state codes as Don't Care ($X$) wildcards to yield minimal gate equations.
2. **FSM Gate Schematic Integration**: How state register flip-flops, next-state gate trees, and output decoders are wired together into a unified, synchronous closed-loop system.

---

### The Two Combinational Building Blocks of an FSM

Every synchronous Finite State Machine consists of two distinct combinational logic networks connected to a central sequential state register:

```text
FSM COMBINATIONAL LOGIC DIVISION

                        ┌───────────────────────────────┐
                        │     STATE REGISTER            │
                        │  (N Synchronous Flip-Flops)   │
                        └──────────────┬────────────────┘
                                       │
                                       ├──────────────────────────┐
                                       │ Current State Q          │
                                       ▼                          ▼
 External Inputs X ──► ┌───────────────────────────────┐  ┌────────┴──────────────┐
                       │   NEXT-STATE LOGIC BLOCK      │  │  OUTPUT DECODER BLOCK │
                       │    D_i = g_i(Q, X)            │  │   Y_j = f_j(Q, X)     │
                       └──────────────┬────────────────┘  └──────────┬────────────┘
                                      │                              │
                                      ▼                              ▼
                             Next-State Signals D_i           System Outputs Y_j
                          (Feeds into FF Inputs)        (Drives Actuators)
```

#### 1. The Next-State Logic Block ($g_i$)
The Next-State Logic Block is a combinational circuit that evaluates the current state vector $Q = (Q_{N-1}, \dots, Q_0)$ and external input vector $X = (X_{M-1}, \dots, X_0)$ to drive the excitation input pins of the state register flip-flops:

$$
D_i = g_i(Q_{N-1}, \dots, Q_0, \, X_{M-1}, \dots, X_0) \quad \text{for } i \in \{0, 1, \dots, N-1\}
$$

Where:
* $D_i$ is the excitation input signal for the $i$-th state register flip-flop.
* $g_i$ is the minimized Boolean function for flip-flop $i$.
* $Q_{N-1} \dots Q_0$ are the $N$ current state bits.
* $X_{M-1} \dots X_0$ are the $M$ external input bits.

#### 2. The Output Decoder Block ($f_j$)
The Output Decoder Block is a combinational circuit that evaluates the state and input vectors to drive the external system actuators:

$$
Y_j = f_j(Q_{N-1}, \dots, Q_0, \, X_{M-1}, \dots, X_0) \quad \text{for } j \in \{0, 1, \dots, P-1\}
$$

Where:
* $Y_j$ is the $j$-th external output signal.
* $f_j$ is the minimized output Boolean function.
* For a **Moore Machine**, external inputs $X$ are excluded ($Y_j = f_j(Q)$).
* For a **Mealy Machine**, external inputs $X$ are included ($Y_j = f_j(Q, X)$).

---

### Primitive 1: Transition Logic Minimization and Unused State Wildcards

To synthesize the minimal Boolean equations for $D_i$ and $Y_j$, we construct multi-variable Karnaugh Maps.

A K-map for an FSM with $N$ state bits and $M$ input bits requires a total of $N + M$ input variables, resulting in a grid with $2^{N+M}$ cells.

For example, a 3-state machine using $N = 2$ flip-flops ($Q_1, Q_0$) and $M = 1$ external input ($X$) requires a **3-variable K-map** ($2^{2+1} = 8$ cells) for each flip-flop input ($D_1$ and $D_0$) and each output line ($Y$).

```text
3-VARIABLE FSM K-MAP GRID LAYOUT

             QX = 00       QX = 01       QX = 11       QX = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
   Q1 = 0 │  Cell 0     │  Cell 1     │  Cell 3     │  Cell 2     │
          │  (Q1=0,00)  │  (Q1=0,01)  │  (Q1=0,11)  │  (Q1=0,10)  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
   Q1 = 1 │  Cell 4     │  Cell 5     │  Cell 7     │  Cell 6     │
          │  (Q1=1,00)  │  (Q1=1,01)  │  (Q1=1,11)  │  (Q1=1,10)  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

#### The Power of Unused Binary State Codes as Don't Care ($X$) Wildcards

When an FSM contains $K$ states, the required number of flip-flops is $N = \lceil \log_2 K \rceil$. 

Whenever $K$ is not an exact power of two (for example, a machine with 3 states using 2 flip-flops, or a machine with 5 states using 3 flip-flops), **there are unused binary state codes that the machine can never enter under normal operation!**

```text
UNUSED STATE CODES AS DON'T CARE WILDCARDS

 3-State FSM using 2 Flip-Flops (Capacity = 4 Codes)
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ Valid States:             │          │ Unused Invalid Code:      │
 │  S0 = 00_2, S1 = 01_2     │          │  Code 11_2 (State S3)     │
 │  S2 = 10_2                │          │  CAN NEVER OCCUR IN RUN!  │
 └───────────────────────────┘          └─────────────┬─────────────┘
                                                      │
                                                      ▼
                                         DON'T CARE WILDCARD (X)!
                                     Fills K-Map Cells with 'X's!
```

These unused state codes are a gift to the hardware designer! 

Because the machine will never enter an unused state code during normal execution, we place a **Don't Care ($X$) wildcard** in every K-map cell corresponding to an unused state code (for all possible input values of $X$).

As we group $1$s on our K-maps, these $X$ wildcards allow us to form significantly larger rectangular loops ($2^k$ cells), eliminating variables and dramatically shrinking the physical gate count of our next-state and output logic trees!

---

### Primitive 2: FSM Gate Schematic Integration

Once minimal Sum of Products (SOP) or Product of Sums (POS) equations have been derived for all $D_i$ and $Y_j$, we assemble the complete **FSM Gate Schematic**.

An FSM Gate Schematic is a closed-loop hardware diagram containing three interconnected structural zones:

1. **The State Register Core**: A parallel bank of $N$ D flip-flops ($\text{FF}_{N-1}, \dots, \text{FF}_0$) sharing a single, un-gated global clock line $CLK$ and a master reset line $\overline{\text{CLR}}$.
2. **The Next-State Logic Gate Trees**: Combinational AND-OR or NAND-NAND gate networks that accept $Q$ and $X$ to drive the $D$-input pin of each flip-flop.
3. **The Output Decoder Gate Trees**: Combinational AND-OR or NAND-NAND gate networks that accept $Q$ (and $X$ for Mealy) to drive external output pins $Y$.

```text
CLOSED-LOOP FSM GATE SCHEMATIC ARCHITECTURE

              ┌──────────────────────────────────────────────┐
              │             STATE REGISTER                   │
              │   ┌───────────────┐     ┌───────────────┐    │
              │   │ D Flip-Flop 1 │     │ D Flip-Flop 0 │    │
              │   │  (Bit Q1)     │     │  (Bit Q0)     │    │
              │   └───────┬───────┘     └───────┬───────┘    │
              └───────────┼─────────────────────┼────────────┘
                          │                     │
                          ├─────────────────────┼────────────────────────┐
                          │ State Q1            │ State Q0               │
                          ▼                     ▼                        ▼
 External Inputs X ──► ┌─────────────────────────────────┐      ┌─────────────────┐
                       │     NEXT-STATE LOGIC TREES      │      │ OUTPUT DECODER  │
                       │ D1 = g1(Q1,Q0,X)  D0 = g0(Q1,Q0,X)│      │ Y = f(Q1,Q0,X)  │
                       └────────┬────────────────┬───────┘      └────────┬────────┘
                                │                │                       │
                                ▼                ▼                       ▼
                           To FF1 D-Pin     To FF0 D-Pin           To Output Y Pin
                           (Next State)     (Next State)         (Drives Actuator)
```

Look at the feedback loop in this schematic:
* The $Q$ outputs of the flip-flops flow downward into the Next-State Logic Trees.
* The Next-State Logic Trees compute $D_1$ and $D_0$, which flow back upward into the $D$ input pins of the exact same flip-flops.
* On every rising clock edge, the new $D$ values are captured into the flip-flops, updating $Q$, which instantly updates the input to the next-state gates for the *next* cycle!

This closed feedback loop is the engine of all sequential computing.

---

## Engineering Reality: Timing Closure and $f_{\text{max}}$ Constraints

When an FSM gate schematic is fabricated in CMOS silicon, the maximum clock frequency $f_{\text{max}}$ at which the state machine can safely operate is strictly limited by the propagation delay through the next-state logic tree ($t_{\text{logic}}$).

### The Synchronous Timing Loop

Trace the time required for a state transition to complete across one clock cycle:

1. **Clock Edge $t_0$**: Rising clock edge arrives at the state register. Flip-flops take time $t_{\text{C2Q}}$ (Clock-to-Q delay) to update their output state bits $Q$.
2. **Logic Propagation $t_1$**: State bits $Q$ travel through the next-state combinational gates ($g_i$), which take propagation delay $t_{\text{logic}}$ to compute new $D$ values.
3. **Setup Margin $t_2$**: The new $D$ values arrive at the flip-flop input pins and must remain stable for setup time $t_{\text{su}}$ **BEFORE** the next rising clock edge arrives!

```text
TIMING CLOSURE PATH IN AN FSM

 Clock Edge 1 ──► [ FF C2Q Delay ] ──► [ Next-State Logic Delay ] ──► [ FF Setup Time ] ──► Clock Edge 2
                  (t_C2Q = 0.4 ns)     (t_logic = 1.8 ns)             (t_su = 0.3 ns)
 ◄──────────────────────────────────── T_clk_min = 2.5 ns ────────────────────────────────►
```

To prevent setup time violations and avoid triggering non-deterministic metastability:

$$
T_{\text{clk,min}} \ge t_{\text{C2Q}} + t_{\text{logic,max}} + t_{\text{su}} + t_{\text{skew}}
$$

Where:
* $T_{\text{clk,min}}$ is the minimum safe clock period ($f_{\text{max}} = \frac{1}{T_{\text{clk,min}}}$).
* $t_{\text{C2Q}}$ is the Clock-to-Q delay of the state register flip-flops.
* $t_{\text{logic,max}}$ is the worst-case propagation delay through the next-state logic gate trees.
* $t_{\text{su}}$ is the setup time required by the state register flip-flops.
* $t_{\text{skew}}$ is the clock arrival delay uncertainty across the clock tree.

**The Golden Engineering Rule**:
> Minimizing next-state logic gates using K-maps directly reduces $t_{\text{logic,max}}$. **Smaller next-state logic trees equal faster state machines!**

---

## Solved Industrial Engineering Exercise: Automated Train Station Barrier Gate Controller

To consolidate your complete mastery of transition logic minimization, Don't Care state wildcards, K-map reduction, Mealy/Moore output decoding, FSM gate schematic drawing, and clock timing closure, we will now walk through a complete, step-by-step railway engineering problem.

---

### Scenario and Parameters

A railway authority is engineering the hardware state controller for an automated train station entry barrier gate ($G$).

The controller monitors one binary input sensor:
* **Train Approach Sensor ($X$)**:
  * $X = 0$: No train approaching the station.
  * $X = 1$: High-speed train detected approaching the station!

The controller drives two binary output actuators:
1. **Barrier Gate Actuator ($G$)**: $G = 1$ lowers the barrier gate across the road; $G = 0$ raises the gate.
2. **Warning Bell ($B$)**: $B = 1$ rings the audible warning bell; $B = 0$ silences the bell.

```text
RAILWAY BARRIER GATE STATE CONTROLLER

 Train Sensor X ──► [ Railway State Controller ] ──┬──► Barrier Gate G (1=Lowered)
 Clock Line CLK ──► [    (3 Encoded States)    ]  └──► Warning Bell B (1=Ringing)
```

#### State Encoding and Transition Specification

The system uses two D Flip-Flops ($\text{FF}_1, \text{FF}_0$) storing state vector $Q = (Q_1, Q_0)$ to represent three physical states ($S_0, S_1, S_2$). State code $11_2$ is unused ($X$ wildcard!).

1. **State $S_0$ ($00_2$, CLEAR / IDLE)**:
   Outputs: $G = 0, B = 0$. (Gate raised, bell silent).
   * If $X = 0$, stay in $S_0 (00_2)$.
   * If $X = 1$, transition to $S_1 (01_2)$ (Warning Phase).
2. **State $S_1$ ($01_2$, WARNING PHASE)**:
   Outputs: $G = 0, B = 1$. (Gate still raised, bell ringing!).
   * If $X = 1$, transition to $S_2 (10_2)$ (Barrier Lowered).
   * If $X = 0$ (false sensor trip), return to $S_0 (00_2)$.
3. **State $S_2$ ($10_2$, BARRIER LOWERED)**:
   Outputs: $G = 1, B = 1$. (Gate lowered, bell ringing!).
   * If $X = 1$, stay in $S_2 (10_2)$ (train passing).
   * If $X = 0$ (train cleared station), return to $S_0 (00_2)$.
4. **State Code $11_2$ (UNUSED STATE)**:
   Unused state code. All next states and outputs are **Don't Care ($X$)** wildcards!

#### Your Objective

1. Construct the complete 8-row State Excitation and Output Table for inputs $(Q_1, Q_0, X)$.
2. Minimize the next-state equations $D_1$ and $D_0$ using 3-variable K-maps, exploiting unused code $11_2$ as Don't Care wildcards.
3. Minimize the Moore output equations $G$ and $B$ using K-maps.
4. Draw the complete closed-loop **FSM Gate Schematic**.
5. Calculate the maximum operating clock frequency $f_{\text{max}}$ given $t_{\text{C2Q}} = 0.5\text{ ns}$, $t_{\text{gate}} = 0.4\text{ ns}$ (per gate level), $t_{\text{su}} = 0.3\text{ ns}$, and $t_{\text{skew}} = 0.1\text{ ns}$.
6. Simulate the controller through a full train arrival and departure cycle ($X = 0 \to 1 \to 1 \to 1 \to 0$).

---

### Step-by-Step Derivation

#### Step 1: Construct the Master State Excitation and Output Table

We build the master table for inputs $Q_1, Q_0,$ and $X$.
Since D flip-flops are used, $D_1 = Q_{1,\text{next}}$ and $D_0 = Q_{0,\text{next}}$.

```text
MASTER RAILWAY FSM EXCITATION AND OUTPUT TABLE

 Current State Q1 Q0 │ Train Sensor X │ Next State Q1_next Q0_next │ Input D1 │ Input D0 │ Gate G │ Bell B │ Railway Operating Status
────────────────────┼────────────────┼────────────────────────────┼──────────┼──────────┼────────┼────────┼───────────────────────────
      S0 (00)       │       0        │          S0 (00)           │    0     │    0     │   0    │   0    │ Track Clear. Gate Up, Bell OFF.
      S0 (00)       │       1        │          S1 (01)           │    0     │    1     │   0    │   0    │ Train Approaching! Start Warning.
────────────────────┼────────────────┼────────────────────────────┼──────────┼──────────┼────────┼────────┼───────────────────────────
      S1 (01)       │       0        │          S0 (00)           │    0     │    0     │   0    │   1    │ False Trip. Return to Clear.
      S1 (01)       │       1        │          S2 (10)           │    1     │    0     │   0    │   1    │ Warning Complete. Lower Gate.
────────────────────┼────────────────┼────────────────────────────┼──────────┼──────────┼────────┼────────┼───────────────────────────
      S2 (10)       │       0        │          S0 (00)           │    0     │    0     │   1    │   1    │ Train Cleared. Open Gate.
      S2 (10)       │       1        │          S2 (10)           │    1     │    0     │   1    │   1    │ Train Passing. Keep Gate Down.
────────────────────┼────────────────┼────────────────────────────┼──────────┼──────────┼────────┼────────┼───────────────────────────
    Unused (11)     │       0        │          XX (XX)           │    X     │    X     │   X    │   X    │ UNUSED STATE CODE (WILDCARD!)
    Unused (11)     │       1        │          XX (XX)           │    X     │    X     │   X    │   X    │ UNUSED STATE CODE (WILDCARD!)
```

---

#### Step 2: Minimize Next-State Equations $D_1$ and $D_0$ using K-Maps

We plot $D_1$ and $D_0$ on 3-variable K-maps with variables $Q_1, Q_0$ on rows and $X$ on columns.

##### 1. K-Map for Flip-Flop Input $D_1$:
* Active $1$s at Cells: $(01, 1) \implies \text{Cell } 3$, and $(10, 1) \implies \text{Cell } 5$.
* Don't Cares ($X$) at Cells: $(11, 0) \implies \text{Cell } 6$, and $(11, 1) \implies \text{Cell } 7$.

```text
NEXT-STATE D1 KARNAUGH MAP

             X = 0         X = 1
        ┌─────────────┬─────────────┐
 Q1Q0=00│      0      │      0      │  (Cells 0, 1)
        ├─────────────┼─────────────┤
 Q1Q0=01│      0      │      1      │  (Cells 2, 3)
        ├─────────────┼─────────────┤
 Q1Q0=11│      X      │      X      │  (Cells 6, 7 - DON'T CARES!)
        ├─────────────┼─────────────┤
 Q1Q0=10│      0      │      1      │  (Cells 4, 5)
        └─────────────┴─────────────┘
```

Let us group the $1$s:
Look at column $X = 1$! Cells 3 ($1$) and 5 ($1$) can be grouped with Cell 7 ($X$) to form a **3-cell vertical group**... but 3 is not a power of two!
Can we make a **4-cell group**?
Look at rows $Q_1 Q_0 = 01, 11, 10$ at column $X = 1$:
Cells 3 ($1$), 7 ($X$), and 5 ($1$) form a vertical column! If we include Cell 7 ($X$), Cells 3, 7, 5 form a group of 3... wait! Is there a 4th cell in that column? Cell 1 is $0$, so we cannot take the whole column.

What 2x2 or 2x1 groups can we form?
* **Group 1**: Cells 3 ($011_2$) and 7 ($111_2$, $X$).
  Rows $Q_1 Q_0 = 01$ and $11 \implies Q_0 = 1$. Column $X = 1$.
  Term: $Q_0 \cdot X$.
* **Group 2**: Cells 5 ($101_2$) and 7 ($111_2$, $X$).
  Rows $Q_1 Q_0 = 10$ and $11 \implies Q_1 = 1$. Column $X = 1$.
  Term: $Q_1 \cdot X$.

Combining Group 1 and Group 2:

$$
D_1 = (Q_0 \cdot X) + (Q_1 \cdot X) = X \cdot (Q_1 + Q_0)
$$

Where:
* $D_1$ is the input to D Flip-Flop 1.
* $Q_1, Q_0$ are the current state register outputs.
* $X$ is the train sensor input.

---

##### 2. K-Map for Flip-Flop Input $D_0$:
* Active $1$s at Cells: $(00, 1) \implies \text{Cell } 1$.
* Don't Cares ($X$) at Cells: $(11, 0) \implies \text{Cell } 6$, and $(11, 1) \implies \text{Cell } 7$.

```text
NEXT-STATE D0 KARNAUGH MAP

             X = 0         X = 1
        ┌─────────────┬─────────────┐
 Q1Q0=00│      0      │      1      │  (Cell 1 is 1)
        ├─────────────┼─────────────┤
 Q1Q0=01│      0      │      0      │
        ├─────────────┼─────────────┤
 Q1Q0=11│      X      │      X      │  (Cells 6, 7 - DON'T CARES!)
        ├─────────────┼─────────────┤
 Q1Q0=10│      0      │      0      │
        └─────────────┴─────────────┘
```

Let me group Cell 1 ($001_2$):
Can Cell 1 ($001_2$) be grouped with Cell 3 ($011_2$)? Cell 3 is $0$, so NO!
Can Cell 1 ($001_2$) be grouped with Cell 5 ($101_2$)? Cell 5 is $0$, so NO!
Can Cell 1 ($001_2$) be grouped with Cell 7 ($111_2$, $X$)? They differ by 2 bits, so NO!
Cell 1 MUST be grouped alone as a 1-cell group!

Evaluating Cell 1 ($Q_1=0, Q_0=0, X=1$):

$$
D_0 = \overline{Q_1} \cdot \overline{Q_0} \cdot X
$$

Where:
* $D_0$ is the input to D Flip-Flop 0.

---

#### Step 3: Minimize Moore Output Equations ($G$ and $B$)

Because this is a Moore Machine, output equations depend ONLY on state bits $Q_1$ and $Q_0$ (independent of input $X$).

##### 1. Gate Actuator Output ($G$):
$G = 1$ in State $S_2 (10_2)$. Don't Care at State $11_2$.

Map $G$ on a 2-variable K-Map ($Q_1, Q_0$):
* Cell $10_2 = 1$. Cell $11_2 = X$.
* Group Cells $10_2$ and $11_2$ together into a 2-cell group!
* Row $Q_1 = 1$. $Q_0$ changes ($0 \to 1$, discarded).

$$
G = Q_1
$$

Output $G = Q_1$. **Requires ZERO logic gates!** It is a direct wire from flip-flop output $Q_1$!

##### 2. Warning Bell Output ($B$):
$B = 1$ in States $S_1 (01_2)$ and $S_2 (10_2)$. Don't Care at State $11_2$.

Map $B$ on a 2-variable K-Map ($Q_1, Q_0$):
* Cell $01_2 = 1$.
* Cell $10_2 = 1$.
* Cell $11_2 = X$.
* Group 1 (Cells $01_2$ and $11_2$): $Q_0 = 1$.
* Group 2 (Cells $10_2$ and $11_2$): $Q_1 = 1$.

Combining Group 1 and Group 2:

$$
B = Q_1 + Q_0
$$

Output $B = Q_1 + Q_0$. **Requires a single 2-input OR gate!**

---

#### Step 4: Draw Complete Closed-Loop FSM Gate Schematic

We wire the minimized equations into an integrated schematic:
* $D_1 = X \cdot (Q_1 + Q_0)$
* $D_0 = \overline{Q_1} \cdot \overline{Q_0} \cdot X$
* $G = Q_1$
* $B = Q_1 + Q_0$

```text
COMPLETE RAILWAY BARRIER FSM GATE SCHEMATIC

                        ┌────────────────────────┐
                        │     STATE REGISTER     │
                        │  (2 D Flip-Flops: 1,0) │
                        └───────────┬────────────┘
                                    │
                                    ├──────────────────────────┐
                                    │ State Q1, Q0             │
                                    ▼                          ▼
 Input Sensor X ───────► ┌────────────────────────┐    ┌───────────────────┐
                         │ Next-State Logic Trees │    │ Moore Output      │
                         │ D1 = X * (Q1 + Q0)     │    │ Gate G = Q1       ├─► Gate G
                         │ D0 = Q1' * Q0' * X     │    │ Bell B = Q1 + Q0  ├─► Bell B
                         └──────────┬─────────────┘    └───────────────────┘
                                    │
                                    ▼
                         Next State D1, D0
                     (Feeds into FF1, FF0 Inputs)
```

---

#### Step 5: Calculate Maximum Operating Clock Frequency ($f_{\text{max}}$)

Let us trace the critical path delay through the next-state logic:

1. Next-state equation $D_1 = X \cdot (Q_1 + Q_0)$:
   * Level 1: One 2-input OR gate ($Q_1 + Q_0$). Delay = $0.4\text{ ns}$.
   * Level 2: One 2-input AND gate ($X \cdot \dots$). Delay = $0.4\text{ ns}$.
   * Max Next-State Logic Delay $t_{\text{logic,max}} = 0.4\text{ ns} + 0.4\text{ ns} = \mathbf{0.8 \text{ ns}}$.

2. Minimum Safe Clock Period ($T_{\text{clk,min}}$):
   $$T_{\text{clk,min}} = t_{\text{C2Q}} + t_{\text{logic,max}} + t_{\text{su}} + t_{\text{skew}}$$
   $$T_{\text{clk,min}} = 0.5\text{ ns} + 0.8\text{ ns} + 0.3\text{ ns} + 0.1\text{ ns} = \mathbf{1.7 \text{ ns}}$$

3. Maximum Operating Frequency ($f_{\text{max}}$):
   $$f_{\text{max}} = \frac{1}{T_{\text{clk,min}}} = \frac{1}{1.7\text{ ns}} = \frac{1}{1.7 \times 10^{-9}\text{ s}} \approx \mathbf{588.24 \text{ MHz}}$$

The railway barrier controller can safely run at a clock speed of **$588.24\text{ MHz}$**!

---

### Sanity Check and Verification

Let us simulate our completed FSM schematic through a full train arrival and departure cycle across 5 clock edges ($X = 0 \to 1 \to 1 \to 1 \to 0$).

```text
5-CYCLE RAILWAY CONTROLLER EXECUTION TRACE

 Clock Edge │ Sensor X │ State Q1 Q0 │ D1 = X*(Q1+Q0) │ D0 = Q1'Q0'X │ Gate G (Q1) │ Bell B (Q1+Q0) │ Railway Status
────────────┼──────────┼─────────────┼────────────────┼──────────────┼─────────────┼────────────────┼──────────────────────────────
  Initial   │    0     │   S0 (00)   │       0        │      0       │      0      │       0        │ Track Clear. Gate UP, Bell OFF.
  Edge 1    │    1     │   S0 (00)   │       0        │      1       │      0      │       0        │ Train Detected! Move to S1.
  Edge 2    │    1     │   S1 (01)   │       1        │      0       │      0      │       1        │ Warning Phase! Bell RINGING!
  Edge 3    │    1     │   S2 (10)   │       1        │      0       │      1      │       1        │ GATE LOWERED! Bell RINGING!
  Edge 4    │    0     │   S2 (10)   │       0        │      0       │      1      │       1        │ Train Cleared! Return to S0.
  Edge 5    │    0     │   S0 (00)   │       0        │      0       │      0      │       0        │ BACK TO IDLE. Gate UP, Bell OFF.
```

##### Detailed Cycle Verification:
* **Edge 1**: Train detected ($X=1$). Next-state evaluates $D_1=0, D_0=1 \implies$ State becomes $S_1 (01_2)$.
* **Edge 2**: In State $S_1 (01_2)$, Bell output $B = Q_1 + Q_0 = 0 + 1 = 1$ (**BELL RINGS!**). Next-state evaluates $D_1=1, D_0=0 \implies$ State becomes $S_2 (10_2)$.
* **Edge 3**: In State $S_2 (10_2)$, Gate output $G = Q_1 = 1$ (**GATE LOWERS!**). Bell stays $B = 1 + 0 = 1$. Next-state evaluates $D_1=1, D_0=0 \implies$ State stays $S_2 (10_2)$.
* **Edge 4**: Train clears ($X=0$). Next-state evaluates $D_1=0, D_0=0 \implies$ State returns to $S_0 (00_2)$.
* **Edge 5**: In State $S_0 (00_2)$, Gate $G = 0$, Bell $B = 0$. System safely back in Idle!

All cycle transitions, output activations, and clock timing calculations evaluate with 100% mathematical and physical precision. The FSM gate schematic is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Transition Logic Minimization**: The systematic process of mapping FSM state excitation columns and output columns onto multi-variable Karnaugh Maps, leveraging unused binary state codes as Don't Care ($X$) wildcards to yield minimal gate-level next-state equations $D_i = g_i(Q, X)$ and output equations $Y_j = f_j(Q, X)$.
* **FSM Gate Schematic**: The integrated closed-loop hardware layout showing how the state register flip-flops, the next-state logic gate trees, and the output decoder gates assemble into a unified, synchronous, and glitch-free sequential controller.
