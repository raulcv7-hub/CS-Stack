---
title: "Flip-Flop Excitation Tables and Next-State Input Translation Mechanics"
---

# Flip-Flop Excitation Tables and Next-State Input Translation Mechanics

## The Operational Gap Between Desired State Transitions and Physical Flip-Flop Inputs

When a digital systems engineer designs a finite state machine (FSM), the synthesis process naturally yields a **State Transition Table**. This table serves as the system's operational map: it tells us where the machine currently is (Current State $Q$), what external event has occurred (Input $X$), and where the machine MUST go on the next active clock edge (Next State $Q_{\text{next}}$).

However, when you attempt to connect this state transition table to physical hardware, you encounter an immediate operational barrier: **flip-flops do not have an input pin named "$Q_{\text{next}}$."**

A physical flip-flop storage cell possesses specific, unyielding control pins—such as $D$ for a D flip-flop, $T$ for a Toggle flip-flop, or $J$ and $K$ for a JK flip-flop. 

```text
THE STATE TRANSLATION HARDWARE GAP

 Desired State Transition             Physical Storage Cell
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ Current State : Q = 0     │  ????  │ Flip-Flop Inputs:         │
 │ Target State  : Q_next = 1│ ──────►│ D = ?   T = ?   J=? K=?   │
 └───────────────────────────┘        └───────────────────────────┘
   Target Transition Goal               Physical Pins to Drive
```

If an engineer simply connects desired next-state signals ($Q_{\text{next}}$) directly to the inputs of a T or JK flip-flop without translation, the circuit will fail completely. Driving $T = 1$ when you want $Q_{\text{next}} = 1$ will cause a $1 \to 1$ state to toggle into a $0$, destroying state memory.

To build the combinational logic tree that sits in front of a state register, the designer must reverse the question. Instead of asking *"What output will this flip-flop produce for a given input?"*, the designer must ask:

> *"Given that my flip-flop is currently holding value $Q$, what exact control signals ($D, T, J, K$) must I apply to its physical input pins RIGHT NOW so that it transitions to target value $Q_{\text{next}}$ on the upcoming clock edge?"*

The mathematical tool that answers this reverse question is the **Excitation Table**. By providing an exact reverse lookup mapping between desired state transitions ($Q \to Q_{\text{next}}$) and required flip-flop input values, excitation tables allow engineers to derive minimal **Next-State Equations** for any flip-flop technology.

---

## The Vehicle Steering Controls: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an excitation table works, let us step away from microchips and picture driving three different vehicles toward a target direction.

Imagine you are at an obstacle course, and your goal is to make your vehicle face **Right** ($Q_{\text{next}} = 1$) on your next move. Your current direction is **Left** ($Q = 0$).

```text
THE VEHICLE DIRECTION TRANSITION

 Current Direction (State Q) : LEFT (0)  ──► Target Direction (Q_next) : RIGHT (1)
```

How you achieve this target direction ($Q_{\text{next}} = 1$) depends entirely on the physical controls of the vehicle you are operating:

### Vehicle 1: The Bicycle (D Flip-Flop Equivalent)
On a bicycle, the steering control is a handlebar ($D$).
* To face Right ($Q_{\text{next}} = 1$), you simply point the handlebar **Right ($D = 1$)**.
* It does not matter if you were previously facing Left ($Q = 0$) or facing Right ($Q = 1$). You point the handlebar where you want to go.
* **The Control Rule**: The control input matches the target destination directly ($D = Q_{\text{next}}$).

### Vehicle 2: The Horse (Toggle / T Flip-Flop Equivalent)
On a horse, your primary control is a direction-reversing pull on the reins ($T$).
* If you are currently facing Left ($Q = 0$) and want to face Right ($Q_{\text{next}} = 1$), you must **pull the rein to flip direction ($T = 1$)**.
* But if you are *already* facing Right ($Q = 1$) and want to stay facing Right ($Q_{\text{next}} = 1$), pulling the rein would turn you Left! So you must **do nothing ($T = 0$)**.
* **The Control Rule**: The control input depends on whether a change of direction is needed ($T = Q \oplus Q_{\text{next}}$).

### Vehicle 3: The Two-Rope Sailboat (JK Flip-Flop Equivalent)
On a sailboat, you have two control ropes: Rope $J$ (Pull Right) and Rope $K$ (Pull Left).
* If you are facing Left ($Q = 0$) and want to face Right ($Q_{\text{next}} = 1$), you have two choices:
  1. Pull Rope $J$ alone ($J = 1, K = 0$, forcing a Right turn).
  2. Pull BOTH Ropes $J$ and $K$ ($J = 1, K = 1$, flipping direction from Left to Right!).
* Notice that in BOTH choices, **Rope $J$ MUST be pulled ($J = 1$)**, but **Rope $K$ can be either $0$ or $1$**! Rope $K$ is a **Don't Care ($X$)**!

```text
VEHICLE CONTROL COMPARISON FOR TRANSITION (LEFT -> RIGHT)

 Vehicle Type    │ Current (Q) │ Target (Q_next) │ Required Control Action
─────────────────┼─────────────┼─────────────────┼───────────────────────────
 Bicycle (D)     │  Left (0)   │    Right (1)    │ Handlebar = Right (D = 1)
 Horse (T)       │  Left (0)   │    Right (1)    │ Pull Rein = Flip (T = 1)
 Sailboat (JK)   │  Left (0)   │    Right (1)    │ Pull J=1, Rope K = Don't Care (X)!
```

Look at the sailboat (JK) choice: because Rope $K$ is a Don't Care ($X$), we have maximum freedom to simplify our control mechanisms!

This vehicle control choice is the exact physical analogue of **Flip-Flop Excitation**:
* Your current direction is **Current State ($Q$)**.
* Your target direction is **Next State ($Q_{\text{next}}$)**.
* The required rein or rope actions are the **Excitation Inputs ($D, T, J, K$)**.
* The translation rulebook is the **Excitation Table**.

---

## Mechanics of Excitation Tables Across Flip-Flop Architectures

To master next-state logic synthesis, we must examine the formal mathematical mechanics of Excitation Tables for D, T, and JK flip-flops.

A **Characteristic Table** works forward ($Inputs \to Q_{\text{next}}$). An **Excitation Table** works backward ($Q \to Q_{\text{next}} \to Inputs$).

```text
FORWARD CHARACTERISTIC VS REVERSE EXCITATION

 Characteristic Table (Forward Analysis) : Inputs (D, T, JK) ──► Target State Q_next
 Excitation Table     (Reverse Synthesis): Transition (Q -> Q_next) ──► Required Inputs
```

---

### Primitive 1: D Flip-Flop Excitation Mechanics

A D Flip-Flop captures whatever binary value is present on its Data pin ($D$) at the active clock edge, making $Q_{\text{next}} = D$.

To determine the required input $D$ for all four possible state transitions ($0 \to 0$, $0 \to 1$, $1 \to 0$, $1 \to 1$):

```text
D FLIP-FLOP EXCITATION TABLE

 Current State (Q) │ Target Next State (Q_next) │ Required Data Input (D) │ Transition Type
───────────────────┼────────────────────────────┼─────────────────────────┼──────────────────
         0         │             0              │          D = 0          │ Hold Zero
         0         │             1              │          D = 1          │ Transition 0->1
         1         │             0              │          D = 0          │ Transition 1->0
         1         │             1              │          D = 1          │ Hold One
```

#### Algebraic Rule for D Flip-Flop Excitation:
$$
D = Q_{\text{next}}
$$

Where:
* $D$ is the required input to the D flip-flop.
* $Q_{\text{next}}$ is the desired state after the upcoming clock edge.

**Synthesis Impact**: The D excitation table is trivial ($D = Q_{\text{next}}$). While this simplifies table construction, D flip-flops provide zero Don't Care wildcards, which can lead to larger combinational gate trees for complex state machines.

---

### Primitive 2: Toggle (T) Flip-Flop Excitation Mechanics

A Toggle Flip-Flop holds its state ($Q_{\text{next}} = Q$) when $T = 0$, and inverts its state ($Q_{\text{next}} = \overline{Q}$) when $T = 1$.

To determine the required input $T$ for all four transitions:

1. **Transition $0 \to 0$**: State stays $0$. No change required $\implies T = 0$.
2. **Transition $0 \to 1$**: State changes from $0$ to $1$. Inversion required $\implies T = 1$.
3. **Transition $1 \to 0$**: State changes from $1$ to $0$. Inversion required $\implies T = 1$.
4. **Transition $1 \to 1$**: State stays $1$. No change required $\implies T = 0$.

```text
T FLIP-FLOP EXCITATION TABLE

 Current State (Q) │ Target Next State (Q_next) │ Required Toggle Input (T) │ Transition Type
───────────────────┼────────────────────────────┼───────────────────────────┼──────────────────
         0         │             0              │           T = 0           │ No Toggle (0->0)
         0         │             1              │           T = 1           │ TOGGLE (0->1)
         1         │             0              │           T = 1           │ TOGGLE (1->0)
         1         │             1              │           T = 0           │ No Toggle (1->1)
```

#### Algebraic Rule for T Flip-Flop Excitation:
$$
T = Q \oplus Q_{\text{next}}
$$

Where:
* $T$ is the required input to the T flip-flop.
* $Q$ is the current stored state.
* $Q_{\text{next}}$ is the desired target state.
* $\oplus$ represents the Exclusive-OR operation.

---

### Primitive 3: JK Flip-Flop Excitation Mechanics and Wildcard $X$ Generation

A JK Flip-Flop provides four operating modes: Hold ($00$), Reset ($01$), Set ($10$), and Toggle ($11$). Because it has four modes for two inputs, **multiple input combinations can achieve the exact same state transition!**

This flexibility generates **Don't Care ($X$) wildcards** in the excitation table, allowing dramatic logic gate reductions.

```text
JK FLIP-FLOP EXCITATION TABLE

 Current State (Q) │ Target Next State (Q_next) │ Input J │ Input K │ Exploited Dual Modes
───────────────────┼────────────────────────────┼─────────┼─────────┼──────────────────────────────
         0         │             0              │    0    │    X    │ Hold (00) OR Reset (01)
         0         │             1              │    1    │    X    │ Set (10) OR Toggle (11)
         1         │             0              │    X    │    1    │ Reset (01) OR Toggle (11)
         1         │             1              │    X    │    0    │ Hold (00) OR Set (10)
```

Let us prove each row of the JK excitation table rigorously:

#### 1. Transition $0 \to 0$ (Current $Q = 0$, Target $Q_{\text{next}} = 0$):
How can a JK flip-flop end up at $0$ when starting from $0$?
* Option A: Use **Hold Mode** ($J = 0, K = 0$). State stays $0$.
* Option B: Use **Reset Mode** ($J = 0, K = 1$). State is forced to $0$.

Notice that in both options, **$J$ MUST be $0$**, but **$K$ can be either $0$ or $1$**!
Therefore: $J = 0, K = X$ (Don't Care!).

#### 2. Transition $0 \to 1$ (Current $Q = 0$, Target $Q_{\text{next}} = 1$):
How can a JK flip-flop end up at $1$ when starting from $0$?
* Option A: Use **Set Mode** ($J = 1, K = 0$). State is forced to $1$.
* Option B: Use **Toggle Mode** ($J = 1, K = 1$). State flips from $0$ to $1$.

In both options, **$J$ MUST be $1$**, while **$K$ can be either $0$ or $1$**!
Therefore: $J = 1, K = X$ (Don't Care!).

#### 3. Transition $1 \to 0$ (Current $Q = 1$, Target $Q_{\text{next}} = 0$):
* Option A: Use **Reset Mode** ($J = 0, K = 1$).
* Option B: Use **Toggle Mode** ($J = 1, K = 1$).

In both options, **$K$ MUST be $1$**, while **$J$ can be either $0$ or $1$**!
Therefore: $J = X, K = 1$ (Don't Care!).

#### 4. Transition $1 \to 1$ (Current $Q = 1$, Target $Q_{\text{next}} = 1$):
* Option A: Use **Hold Mode** ($J = 0, K = 0$).
* Option B: Use **Set Mode** ($J = 1, K = 0$).

In both options, **$K$ MUST be $0$**, while **$J$ can be either $0$ or $1$**!
Therefore: $J = X, K = 0$ (Don't Care!).

```text
SUMMARY OF ALL FLIP-FLOP EXCITATION RULES

 Transition (Q -> Q_next) │ D Input │ T Input │ J Input │ K Input
──────────────────────────┼─────────┼─────────┼─────────┼─────────
          0 -> 0          │    0    │    0    │    0    │    X
          0 -> 1          │    1    │    1    │    1    │    X
          1 -> 0          │    0    │    1    │    X    │    1
          1 -> 1          │    1    │    0    │    X    │    0
```

---

## The Next-State Input Translation Algorithm

To synthesize the combinational next-state excitation logic for an FSM:

```text
THE NEXT-STATE EXCITATION TRANSLATION PIPELINE

 State Transition Table (Current Q, Input X, Target Q_next)
                           │
                           ▼
 Replace Q_next with Required Flip-Flop Inputs (D, T, or JK)
                           │
                           ▼
 Construct K-Maps for each Input Terminal (D_i, T_i, or J_i, K_i)
                           │
                           ▼
 Extract Minimal Combinational Equations -> Gate Schematic
```

### Step-by-Step Translation Walkthrough

1. **Step 1**: Construct the binary state transition table showing Current State ($Q$), External Inputs ($X$), and Target Next State ($Q_{\text{next}}$).
2. **Step 2**: Choose the target flip-flop technology (D, T, or JK).
3. **Step 3**: For every row in the state table, inspect the transition $Q_k \to Q_{k,\text{next}}$ for each flip-flop $k$. Use the excitation table to lookup the required input values ($D_k$, $T_k$, or $J_k, K_k$).
4. **Step 4**: Append new excitation columns to the table for each physical flip-flop input terminal.
5. **Step 5**: Minimize each excitation column using Karnaugh Maps to obtain the minimal Boolean equations driving the flip-flop input pins.

---

## Engineering Reality: Gate Area vs. Flip-Flop Technology Choice

When synthesizing an FSM on a physical microchip, which flip-flop technology yields the smallest silicon die area?

```text
FLIP-FLOP TECHNOLOGY HARDWARE COMPARISON

 Metric                     │ D Flip-Flop               │ T Flip-Flop               │ JK Flip-Flop
────────────────────────────┼───────────────────────────┼───────────────────────────┼────────────────────────────
 Flip-Flop Transistor Area  │ Lowest (11 Gates / 26 T)  │ Moderate (12 Gates / 28 T)│ Highest (14 Gates / 32 T)
 Excitation Table Wildcards │ ZERO Don't Cares          │ ZERO Don't Cares          │ 50% DON'T CARES (X)!
 Excitation Logic Area      │ Larger (More AND/OR gates)│ Compact for Counters      │ SMALLEST (Due to X Wildcards)
 Primary Industrial Target  │ Standard ASICs & FPGAs    │ Binary Counters & Dividers│ Complex Sequential Control
```

### The JK Wildcard Advantage
Because 50% of the entries in a JK excitation table are Don't Cares ($X$), K-maps for $J$ and $K$ inputs form massive rectangular loops. 

In custom ASIC silicon, using JK flip-flops often reduces the surrounding combinational gate tree area by **30% to 50%** compared to D flip-flops, offsetting the slightly larger physical size of the JK flip-flop cell!

---

## Solved Industrial Engineering Exercise: Automated Bottling Line Sequencer

To consolidate your complete mastery of excitation tables, reverse lookup mapping, next-state equation derivations, and flip-flop technology selection, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

An industrial automation firm is engineering the hardware state controller for an automated liquid bottling station.

The controller receives a 1-bit **Bottle Sensor ($X$)**:
* $X = 0$: No bottle beneath nozzle.
* $X = 1$: Bottle detected on conveyor.

The state machine uses two state flip-flops ($\text{FF}_1, \text{FF}_0$) to progress through three encoded physical states ($S_0 = 00_2, S_1 = 01_2, S_2 = 10_2$):
* $S_0 (00_2)$: IDLE / Conveyor Running.
* $S_1 (01_2)$: FILLING / Liquid Valve Open.
* $S_2 (10_2)$: CAPPING / Seal Arm Active.
* State $11_2$ is unused (Don't Care $X$).

```text
BOTTLING LINE SEQUENCER MODULE

 Bottle Sensor X ──► [ Bottling Line Controller ] ──► Liquid Valve (Y_fill)
 System Clock CLK ──► [   (3 Encoded States)    ] ──► Capping Arm (Y_cap)
```

#### Given Encoded State Transition Table:

```text
BOTTLING LINE STATE TRANSITION TABLE

 Current State Q1 Q0 │ Sensor Input X │ Next State Q1_next Q0_next │ System Action
────────────────────┼────────────────┼────────────────────────────┼─────────────────────────────
      S0 (00)       │       0        │          S0 (00)           │ Idle / Conveyor Running
      S0 (00)       │       1        │          S1 (01)           │ Bottle Arrived! Start Fill.
────────────────────┼────────────────┼────────────────────────────┼─────────────────────────────
      S1 (01)       │       0        │          S2 (10)           │ Fill Complete. Move to Cap.
      S1 (01)       │       1        │          S1 (01)           │ Fill In Progress...
────────────────────┼────────────────┼────────────────────────────┼─────────────────────────────
      S2 (10)       │       0        │          S0 (00)           │ Cap Complete. Return Idle.
      S2 (10)       │       1        │          S2 (10)           │ Cap In Progress...
────────────────────┼────────────────┼────────────────────────────┼─────────────────────────────
   Unused (11)      │       X        │          XX (XX)           │ UNUSED STATE (Don't Care!)
```

#### Your Objective

1. Derive the excitation table and minimal next-state equations ($D_1, D_0$) assuming **D Flip-Flops**.
2. Derive the excitation table and minimal next-state equations ($T_1, T_0$) assuming **T Flip-Flops**.
3. Derive the excitation table and minimal next-state equations ($J_1, K_1, J_0, K_0$) assuming **JK Flip-Flops**.
4. Compare total physical gate counts across all three implementations (D, T, and JK).
5. Simulate the winning controller through a complete 3-step bottling sequence.

---

### Step-by-Step Derivation

#### Step 1: D Flip-Flop Excitation Synthesis ($D_1, D_0$)

For D flip-flops, $D_k = Q_{k,\text{next}}$.

We append $D_1$ and $D_0$ columns to the state transition table:

```text
D FLIP-FLOP EXCITATION TABLE

 Current Q1 Q0 │ Input X │ Target Q1_next Q0_next │ Required D1 │ Required D0
───────────────┼─────────┼────────────────────────┼─────────────┼─────────────
      00       │    0    │           00           │    D1 = 0   │    D0 = 0
      00       │    1    │           01           │    D1 = 0   │    D0 = 1
      01       │    0    │           10           │    D1 = 1   │    D0 = 0
      01       │    1    │           01           │    D1 = 0   │    D0 = 1
      10       │    0    │           00           │    D1 = 0   │    D0 = 0
      10       │    1    │           10           │    D1 = 1   │    D0 = 0
      11 (Unused)│  X    │           XX           │    D1 = X   │    D0 = X
```

##### K-Map Minimization for $D_1$:
* $D_1 = 1$ at rows $(01, 0)$ and $(10, 1)$. Don't Cares at $Q_1 Q_0 = 11$.
* Minimizing $D_1$:
  $$D_1 = (Q_0 \cdot \overline{X}) + (Q_1 \cdot X)$$

##### K-Map Minimization for $D_0$:
* $D_0 = 1$ at rows $(00, 1)$ and $(01, 1)$. Don't Cares at $Q_1 Q_0 = 11$.
* Minimizing $D_0$:
  $$D_0 = \overline{Q_1} \cdot X$$

```text
D FLIP-FLOP EXCITATION EQUATIONS
* D1 = (Q0 * X') + (Q1 * X)
* D0 = Q1' * X
```

---

#### Step 2: T Flip-Flop Excitation Synthesis ($T_1, T_0$)

Using $T_k = Q_k \oplus Q_{k,\text{next}}$:

* **Row 0 ($00 \to 00$, $X=0$)**: $Q_1: 0 \to 0 \implies T_1 = 0$. $Q_0: 0 \to 0 \implies T_0 = 0$.
* **Row 1 ($00 \to 01$, $X=1$)**: $Q_1: 0 \to 0 \implies T_1 = 0$. $Q_0: 0 \to 1 \implies T_0 = 1$.
* **Row 2 ($01 \to 10$, $X=0$)**: $Q_1: 0 \to 1 \implies T_1 = 1$. $Q_0: 1 \to 0 \implies T_0 = 1$.
* **Row 3 ($01 \to 01$, $X=1$)**: $Q_1: 0 \to 0 \implies T_1 = 0$. $Q_0: 1 \to 1 \implies T_0 = 0$.
* **Row 4 ($10 \to 00$, $X=0$)**: $Q_1: 1 \to 0 \implies T_1 = 1$. $Q_0: 0 \to 0 \implies T_0 = 0$.
* **Row 5 ($10 \to 10$, $X=1$)**: $Q_1: 1 \to 1 \implies T_1 = 0$. $Q_0: 0 \to 0 \implies T_0 = 0$.
* **Unused State ($11$)**: $T_1 = X, T_0 = X$.

```text
T FLIP-FLOP EXCITATION TABLE

 Current Q1 Q0 │ Input X │ Target Q1_next Q0_next │ Required T1 │ Required T0
───────────────┼─────────┼────────────────────────┼─────────────┼─────────────
      00       │    0    │           00           │    T1 = 0   │    T0 = 0
      00       │    1    │           01           │    T1 = 0   │    T0 = 1
      01       │    0    │           10           │    T1 = 1   │    T0 = 1
      01       │    1    │           01           │    T1 = 0   │    T0 = 0
      10       │    0    │           00           │    T1 = 1   │    T0 = 0
      10       │    1    │           10           │    T1 = 0   │    T0 = 0
      11 (Unused)│  X    │           XX           │    T1 = X   │    T0 = X
```

##### K-Map Minimization for $T_1$:
* $T_1 = 1$ at rows $(01, 0)$ and $(10, 0)$.
* Minimizing $T_1$:
  $$T_1 = \overline{X} \cdot (Q_1 + Q_0)$$

##### K-Map Minimization for $T_0$:
* $T_0 = 1$ at rows $(00, 1)$ and $(01, 0)$.
* Minimizing $T_0$:
  $$T_0 = (\overline{Q_1} \cdot \overline{Q_0} \cdot X) + (\overline{Q_1} \cdot Q_0 \cdot \overline{X}) = \overline{Q_1} \cdot (Q_0 \oplus X)$$

```text
T FLIP-FLOP EXCITATION EQUATIONS
* T1 = X' * (Q1 + Q0)
* T0 = Q1' * (Q0 (+) X)
```

---

#### Step 3: JK Flip-Flop Excitation Synthesis ($J_1, K_1, J_0, K_0$)

Using JK excitation rules ($0 \to 0: 0X$, $0 \to 1: 1X$, $1 \to 0: X1$, $1 \to 1: X0$):

* **Row 0 ($00 \to 00$, $X=0$)**: $Q_1: 0 \to 0 \implies J_1=0, K_1=X$. $Q_0: 0 \to 0 \implies J_0=0, K_0=X$.
* **Row 1 ($00 \to 01$, $X=1$)**: $Q_1: 0 \to 0 \implies J_1=0, K_1=X$. $Q_0: 0 \to 1 \implies J_0=1, K_0=X$.
* **Row 2 ($01 \to 10$, $X=0$)**: $Q_1: 0 \to 1 \implies J_1=1, K_1=X$. $Q_0: 1 \to 0 \implies J_0=X, K_0=1$.
* **Row 3 ($01 \to 01$, $X=1$)**: $Q_1: 0 \to 0 \implies J_1=0, K_1=X$. $Q_0: 1 \to 1 \implies J_0=X, K_0=0$.
* **Row 4 ($10 \to 00$, $X=0$)**: $Q_1: 1 \to 0 \implies J_1=X, K_1=1$. $Q_0: 0 \to 0 \implies J_0=0, K_0=X$.
* **Row 5 ($10 \to 10$, $X=1$)**: $Q_1: 1 \to 1 \implies J_1=X, K_1=0$. $Q_0: 0 \to 0 \implies J_0=0, K_0=X$.
* **Unused State ($11$)**: All $J_1, K_1, J_0, K_0 = X$.

```text
JK FLIP-FLOP EXCITATION TABLE

 Current Q1 Q0 │ Input X │ Target Q1_next Q0_next │ J1  │ K1  │ J0  │ K0  │
───────────────┼─────────┼────────────────────────┼─────┼─────┼─────┼─────┤
      00       │    0    │           00           │  0  │  X  │  0  │  X  │
      00       │    1    │           01           │  0  │  X  │  1  │  X  │
      01       │    0    │           10           │  1  │  X  │  X  │  1  │
      01       │    1    │           01           │  0  │  X  │  X  │  0  │
      10       │    0    │           00           │  X  │  1  │  0  │  X  │
      10       │    1    │           10           │  X  │  0  │  0  │  X  │
  11 (Unused)  │    X    │           XX           │  X  │  X  │  X  │  X  │
```

##### K-Map Minimization for JK Inputs ($J_1, K_1, J_0, K_0$):

1. **For $J_1$**: $J_1 = 1$ at row $(01, 0)$. Don't Cares at rows $10$ and $11$.
   $$J_1 = Q_0 \cdot \overline{X}$$
2. **For $K_1$**: $K_1 = 1$ at row $(10, 0)$. Don't Cares at rows $00, 01, 11$.
   $$K_1 = \overline{X}$$
3. **For $J_0$**: $J_0 = 1$ at row $(00, 1)$. Don't Cares at rows $01$ and $11$.
   $$J_0 = \overline{Q_1} \cdot X$$
4. **For $K_0$**: $K_0 = 1$ at row $(01, 0)$. Don't Cares at rows $00, 10, 11$.
   $$K_0 = \overline{X}$$

```text
JK FLIP-FLOP EXCITATION EQUATIONS
* J1 = Q0 * X'
* K1 = X'
* J0 = Q1' * X
* K0 = X'
```

Look at those JK equations! $K_1 = \overline{X}$ and $K_0 = \overline{X}$ are simple direct wire connections to the inverted sensor input $\overline{X}$!

---

#### Step 4: Quantitative Hardware Comparison Across Technologies

Let us calculate the total combinational logic gate area required to drive the state register for all three flip-flop options:

```text
HARDWARE RESOURCE COMPARISON ACROSS FLIP-FLOP TYPES

 Metric                   │ D Flip-Flop Implementation │ T Flip-Flop Implementation │ JK Flip-Flop Implementation
──────────────────────────┼────────────────────────────┼────────────────────────────┼──────────────────────────────
 Next-State Logic Gates   │ 2 AND, 1 OR, 2 NOT (5 Gates)│ 2 AND, 1 OR, 1 XOR (5 Gates)│ 2 AND, 1 NOT (3 Gates!)
 Total Gate Inputs        │ 11 Input Pins              │ 11 Input Pins              │ 6 Input Pins (45% REDUCTION!)
 Excitation Logic Complexity│ Moderate                  │ Moderate                   │ LOWEST (Due to X Wildcards!)
```

##### Engineering Verdict:
The **JK Flip-Flop Implementation** wins decisively! By exploiting the 50% Don't Care wildcards in the JK excitation table, the excitation logic is reduced to just 3 simple gates, reducing input pin wiring and gate area by **$45\%$** compared to the D and T implementations!

---

#### Step 5: Gate-Level Schematic of the JK Controller

```text
GATE-LEVEL JK BOTTLING CONTROLLER SCHEMATIC

 Sensor Input X ──► [ NOT 1 ] ──► X' ──┬──────────────────────────────► K1 Pin
                                        ├──────────────────────────────► K0 Pin
                                        │
 Sensor X ──────────────────────────────┼─────────────────┐
                                        │                 │
 State Output Q1 ──► [ NOT 2 ] ──► Q1' ─┼─► [ AND 1 ] ────┼────────────► J0 Pin
                                        │                 │
 State Output Q0 ───────────────────────┼─► [ AND 2 ] ────┼────────────► J1 Pin
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ Dual JK Flip-Flop Core   │
                                            │  (FF1 and FF0)           │
                                            └──────────────────────────┘
```

---

### Sanity Check and Verification

Let us simulate the winning JK controller through a complete 3-step bottling sequence ($S_0 \to S_1 \to S_2 \to S_0$).

```text
3-STEP BOTTLING SEQUENCE SIMULATION TRACE

 Clock Event │ Sensor Input X │ Current State Q1 Q0 │ JK Inputs (J1 K1, J0 K0) │ Next State Q1_next Q0_next │ Bottling Action
─────────────┼────────────────┼─────────────────────┼──────────────────────────┼────────────────────────────┼────────────────────────
   Initial   │       0        │       S0 (00)       │ J1=0 K1=1, J0=0 K0=1     │          S0 (00)           │ Idle / Conveyor
   Clock 1   │       1        │       S0 (00)       │ J1=0 K1=0, J0=1 K0=0     │          S1 (01)           │ Bottle Arrived -> FILL!
   Clock 2   │       0        │       S1 (01)       │ J1=1 K1=1, J0=X K0=1     │          S2 (10)           │ Fill Complete -> CAP!
   Clock 3   │       0        │       S2 (10)       │ J1=X K1=1, J0=0 K0=1     │          S0 (00)           │ Cap Complete -> IDLE!
```

##### Detailed Step Trace:
1. **Clock 1 ($S_0 = 00_2$, Bottle Arrives $X = 1$)**:
   * Sensor $X = 1 \implies \overline{X} = 0$.
   * $J_1 = Q_0 \cdot \overline{X} = 0 \cdot 0 = 0$. $K_1 = \overline{X} = 0$. ($\text{FF}_1$ Holds $0$).
   * $J_0 = \overline{Q_1} \cdot X = 1 \cdot 1 = 1$. $K_0 = \overline{X} = 0$. ($\text{FF}_0$ Sets $1$).
   * Next State: $Q_1 Q_0 = 01_2$ ($S_1$, Filling Mode). **MATCH!**

2. **Clock 2 ($S_1 = 01_2$, Fill Finished $X = 0$)**:
   * Sensor $X = 0 \implies \overline{X} = 1$.
   * $J_1 = 1 \cdot 1 = 1$. $K_1 = 1$. ($\text{FF}_1$ Toggles $0 \to 1$).
   * $K_0 = 1$. ($\text{FF}_0$ Resets $1 \to 0$).
   * Next State: $Q_1 Q_0 = 10_2$ ($S_2$, Capping Mode). **MATCH!**

3. **Clock 3 ($S_2 = 10_2$, Cap Finished $X = 0$)**:
   * Sensor $X = 0 \implies \overline{X} = 1$.
   * $K_1 = 1$. ($\text{FF}_1$ Resets $1 \to 0$).
   * $J_0 = 0, K_0 = 1$. ($\text{FF}_0$ Resets $0 \to 0$).
   * Next State: $Q_1 Q_0 = 00_2$ ($S_0$, Return to Idle). **MATCH!**

All simulation steps evaluate with 100% mathematical and logical precision. The JK excitation controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Excitation Table**: A reverse lookup table specifying the exact physical control signals ($D, T, J, K$) that must be applied to a flip-flop's inputs to force a required state transition from current state $Q$ to target next state $Q_{\text{next}}$.
* **Next-State Equation Translation**: The systematic process of mapping an FSM's state transition table through flip-flop excitation requirements to derive the minimal combinational excitation logic driving each state register input.
