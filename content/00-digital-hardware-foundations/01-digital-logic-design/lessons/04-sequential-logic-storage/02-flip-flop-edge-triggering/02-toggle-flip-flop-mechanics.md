# Toggle Flip-Flop Mechanics and JK Universal State Inversion

## The Gate-Count Penalty of State Inversion in Sequential Logic

In digital systems, two of the most ubiquitous tasks required of storage circuits are **event counting** and **frequency division**. A digital clock needs a circuit that flips its output state every second; an optical shaft encoder needs a circuit that flips its output on every motor revolution; a microprocessor's instruction pipeline needs a clock divider that cuts a high-frequency system clock in half.

In all of these applications, the required behavior of the memory cell is identical: **on every active clock pulse, the stored output bit must invert ($0 \to 1$ or $1 \to 0$)**.

If an engineer attempts to implement this state-inversion behavior using a standard D Flip-Flop, they must build an external feedback loop that connects the inverted output $\overline{Q}$ back to the Data input $D$ through an XOR gate or inverter.

```text
STATE INVERSION USING A D FLIP-FLOP (REDUNDANT HARDWARE)

 Mode Toggle T ───┐
                  ├──► [ XOR Gate ] ──► Input D  ┌───────────────┐
 Stored Output Q ─┼─────────────────────────────►│ D Flip-Flop   ├──► Output Q
                  │                              │ (Clock CLK)   │
                  └──────────────────────────────┴───────────────┘
```

When building a 32-bit binary counter or a multi-state sequence generator, placing external XOR gates, multiplexers, and feedback wires in front of every single D Flip-Flop creates significant hardware bloat. It increases silicon die area, consumes extra static power, and adds external gate propagation delay before the data can reach the flip-flop's internal master latch.

Furthermore, consider the historical evolution of bistable storage. Early sequential memory circuits were based on Set/Reset (SR) architectures. While SR latches allow an engineer to explicitly set ($Q=1$) or reset ($Q=0$) a memory cell, they suffer from a fatal flaw: if both inputs fire simultaneously ($S=1, R=1$), the circuit collapses into an invalid, non-deterministic state.

How do we eliminate both problems at once? How do we build a storage primitive that natively performs deterministic state inversion without requiring external XOR gates, while simultaneously resolving the $1,1$ invalid input condition of SR storage?

We synthesize two specialized sequential primitives:
1. **The Toggle (T) Flip-Flop**: A single-input storage cell engineered specifically for deterministic state inversion and frequency division.
2. **The JK Flip-Flop**: A universal 2-input storage cell that replaces the invalid $1,1$ state of SR logic with a deterministic **Toggle Mode**.

---

## The Push-Button Ballpoint Pen: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of state inversion before diving into gate schematics, let us examine a familiar mechanical device: a retractable push-button ballpoint pen.

Imagine holding a retractable ballpoint pen in your hand. The pen has a single mechanical push-button on top ($CLK$) and an internal ink cartridge ($Q$).

```text
THE RETRACTABLE BALLPOINT PEN MECHANISM

 Push-Button (Clock Pulse) ──► [ Internal Ratchet Wheel ] ──► Ink Tip (Output Q)
                                                              (0 = Hidden, 1 = Extended)
```

The pen operates through a mechanical ratchet wheel that tracks its current physical state:

### Actuation 1: First Button Click ($0 \to 1$)
* **Initial State**: The ink tip is retracted safely inside the pen body ($Q = 0$).
* **Action**: You press the top button down ($CLK = 1$).
* **Internal Behavior**: The spring-loaded ratchet turns by one notch. The ink tip extends out of the barrel ($Q = 1$).
* **Release**: You release the button ($CLK = 0$). The pen stays extended ($Q = 1$).

### Actuation 2: Second Button Click ($1 \to 0$)
* **Current State**: The ink tip is currently extended ($Q = 1$).
* **Action**: You press the exact same top button down again ($CLK = 1$).
* **Internal Behavior**: The ratchet turns by another notch. The spring pulls the ink tip back inside the barrel ($Q = 0$).
* **Release**: You release the button ($CLK = 0$). The pen stays retracted ($Q = 0$).

```text
MECHANICAL PEN STATE TOGGLE SEQUENCE

 Button Press #1 ──► [ Pen Retracted Q = 0 ] ──► Extends Tip ──► [ Pen Extended Q = 1 ]
 Button Press #2 ──► [ Pen Extended  Q = 1 ] ──► Retracts Tip ──► [ Pen Retracted Q = 0 ]
```

Notice the remarkable property of this push-button pen:
1. **Identical Input Action**: You performed the exact same physical action both times (clicking the top button).
2. **Opposite Output Reaction**: The first click turned the pen ON ($0 \to 1$); the second click turned the pen OFF ($1 \to 0$).
3. **State Inversion (Toggle)**: The output did not care about the *absolute value* of the button; it simply **flipped its current state to the opposite value** on every click!

This retractable pen is the exact physical analogue of a **Toggle (T) Flip-Flop**:
* Clicking the top button is the **Active Clock Edge ($CLK$)**.
* The position of the ink tip is the **Stored State Output ($Q$)**.
* The mechanical ratchet wheel is the **Toggle State Inversion Logic**.

---

## Mechanics of the Toggle (T) Flip-Flop

Now that we possess the intuitive mental model of a mechanical toggle switch, we will examine the formal algebraic and structural mechanics of the **Toggle (T) Flip-Flop**.

---

### Primitive 1: The Toggle (T) Flip-Flop Architecture

A **Toggle (T) Flip-Flop** is an edge-triggered sequential storage element equipped with a single data control line called the **Toggle Input ($T$)** and a clock input ($CLK$).

```text
TOGGLE (T) FLIP-FLOP SCHEMATIC SYMBOL

 Toggle Input T ─────────►┌───────────┐
                          │ T       Q ├──► Stored Output Q
 Clock Input CLK ────────►│ >         │
                          └───────────┘
```

The Toggle input $T$ controls whether the flip-flop holds its current state or inverts its state on the next active clock edge:

* **Hold Mode ($T = 0$)**: The flip-flop ignores incoming clock edges. The stored state remains completely unchanged ($Q_{\text{next}} = Q$).
* **Toggle Mode ($T = 1$)**: The flip-flop inverts its stored state on every active clock edge ($Q_{\text{next}} = \overline{Q}$).

```text
T FLIP-FLOP OPERATIONAL TRUTH TABLE

 Toggle Input (T) │ Current State (Q) │ Next State (Q_next) │ Operational Mode
──────────────────┼───────────────────┼─────────────────────┼───────────────────
        0         │         0         │          0          │ Hold State (Stay 0)
        0         │         1         │          1          │ Hold State (Stay 1)
        1         │         0         │          1          │ TOGGLE (Invert 0 -> 1)
        1         │         1         │          0          │ TOGGLE (Invert 1 -> 0)
```

#### 1. The Characteristic Equation of the T Flip-Flop
We can express the next state $Q_{\text{next}}$ of a T Flip-Flop as an algebraic function of input $T$ and current state $Q$:

$$
Q_{\text{next}} = T \oplus Q = (T \cdot \overline{Q}) + (\overline{T} \cdot Q)
$$

Where:
* $Q_{\text{next}}$ is the stored output bit after the active clock edge.
* $T$ is the Toggle control input ($T \in \{0, 1\}$).
* $Q$ is the current stored output bit before the clock edge.
* $\overline{Q}$ is the logical inverse of the current state.
* $\oplus$ represents the Exclusive-OR (XOR) operation.

Let us evaluate this characteristic equation across both operating modes:
* **When $T = 0$**: $Q_{\text{next}} = 0 \oplus Q = Q$ (Hold Mode).
* **When $T = 1$**: $Q_{\text{next}} = 1 \oplus Q = \overline{Q}$ (Toggle Mode!).

#### 2. The Excitation Table of the T Flip-Flop
When designing counters or state machines, an engineer knows the **current state $Q$** and the desired **next state $Q_{\text{next}}$**, and needs to determine what value to apply to input $T$. This mapping is called the **Excitation Table**:

```text
T FLIP-FLOP EXCITATION TABLE

 Current State (Q) │ Desired Next State (Q_next) │ Required Toggle Input (T)
───────────────────┼─────────────────────────────┼───────────────────────────
         0         │              0              │           T = 0
         0         │              1              │           T = 1
         1         │              0              │           T = 1
         1         │              1              │           T = 0
```

Notice the algebraic rule of the T Flip-Flop excitation table:
$$T = Q \oplus Q_{\text{next}}$$

If the state needs to change ($0 \to 1$ or $1 \to 0$), set $T = 1$. If the state must stay the same ($0 \to 0$ or $1 \to 1$), set $T = 0$.

---

## The Frequency Division Property ($f / 2$)

The most important physical application of a Toggle Flip-Flop is **Frequency Division**.

Suppose we fix the Toggle input permanently to $1$ ($T = 1$) and feed a continuous square-wave clock signal of frequency $f_{\text{clk}}$ into the clock pin ($CLK$).

```text
T FLIP-FLOP FREQUENCY DIVIDER BY TWO

 Constant High (T = 1) ──►┌───────────┐
                          │ T       Q ├──► Output Waveform Q (Frequency f_clk / 2)
 Input Clock (f_clk) ────►│ >         │
                          └───────────┘
```

Let us trace the output waveform $Q$ over consecutive rising clock edges:

```text
TIMING WAVEFORMS FOR FREQUENCY DIVISION BY TWO

 Clock CLK :  000111000111000111000111000111000111000111000111
              ▲     ▲     ▲     ▲     ▲     ▲     ▲     ▲
              │1    │2    │3    │4    │5    │6    │7    │8 (Rising Edges)
              
 Output Q  :  000000111111111111000000000000111111111111000000
              ◄─────────────────►◄─────────────────►
               1 Full Period of Q = 2 Full Periods of CLK!
```

Trace the frequency relationships:
1. At Rising Edge 1: Output $Q$ inverts from $0$ to $1$.
2. At Rising Edge 2: Output $Q$ inverts from $1$ back to $0$.
3. At Rising Edge 3: Output $Q$ inverts from $0$ to $1$.
4. At Rising Edge 4: Output $Q$ inverts from $1$ back to $0$.

Look at the period of the output signal $Q$:
* The input clock $CLK$ completes **two full cycles** ($0 \to 1 \to 0 \to 1 \to 0$) in the time it takes output $Q$ to complete **one single cycle** ($0 \to 1 \to 0$).

Therefore, the output frequency $f_{\text{out}}$ is exactly **half of the input clock frequency**:

$$
f_{\text{out}} = \frac{f_{\text{clk}}}{2}
$$

Where:
* $f_{\text{out}}$ is the output signal frequency at pin $Q$.
* $f_{\text{clk}}$ is the input clock frequency at pin $CLK$.

### Cascading T Flip-Flops for Multi-Stage Frequency Division

If we chain $N$ Toggle Flip-Flops in series—where the output $Q_0$ of the first T flip-flop acts as the clock input for the second T flip-flop, and so on—we construct a **Binary Ripple Divider**:

```text
CASCADED T FLIP-FLOP FREQUENCY DIVIDER CHAIN

 Clock f_clk ──►[ T-FF 0 ]──► Q0 (f / 2) ──►[ T-FF 1 ]──► Q1 (f / 4) ──►[ T-FF 2 ]──► Q2 (f / 8)
                 (T0 = 1)                    (T1 = 1)                    (T2 = 1)
```

For a chain of $N$ cascaded Toggle Flip-Flops, the output frequency at stage $k$ (where $1 \le k \le N$) is given by:

$$
f_k = \frac{f_{\text{clk}}}{2^k}
$$

Where:
* $f_k$ is the frequency at the $k$-th stage output $Q_{k-1}$.
* $f_{\text{clk}}$ is the master input clock frequency.
* $k$ is the number of cascaded toggle stages.

```text
FREQUENCY DIVIDER CASCADING SPECTRUM

 Stage Index (k) │ Output Pin │ Frequency Formula │ Example Output for f_clk = 16 MHz
─────────────────┼────────────┼───────────────────┼───────────────────────────────────
     Stage 1     │     Q0     │    f_clk / 2^1    │             8.0 MHz
     Stage 2     │     Q1     │    f_clk / 2^2    │             4.0 MHz
     Stage 3     │     Q2     │    f_clk / 2^3    │             2.0 MHz
     Stage 4     │     Q3     │    f_clk / 2^4    │             1.0 MHz
```

A chain of 4 Toggle Flip-Flops reduces a $16\text{ MHz}$ oscillator signal down to a precise $1\text{ MHz}$ system clock with a guaranteed $50\%$ duty cycle!

---

## Primitive 2: The JK Universal Flip-Flop Architecture

While the Toggle (T) Flip-Flop is ideal for frequency division and pure counting, a more versatile, universal sequential primitive is the **JK Flip-Flop**.

The JK Flip-Flop was invented to resolve the historical vulnerability of Set/Reset (SR) storage: **the invalid $1,1$ state**.

In an SR storage cell, driving Set ($S = 1$) and Reset ($R = 1$) simultaneously causes outputs to collapse and creates non-deterministic race conditions. 

The JK Flip-Flop replaces the SR inputs with two new control lines, named **$J$ (Jump / Set)** and **$K$ (Kill / Reset)**.

```text
JK FLIP-FLOP FUNCTIONAL BLOCK SYMBOL

 Input J (Set)   ────────►┌───────────┐
                          │ J       Q ├──► Stored Output Q
 Clock Input CLK ────────►│ >         │
 Input K (Reset) ────────►│ K        Q├──► Output Q'
                          └───────────┘
```

---

### Truth Table and Mode Mechanics of the JK Flip-Flop

The JK Flip-Flop evaluates four distinct operating modes based on inputs $J$ and $K$:

```text
JK FLIP-FLOP EXHAUSTIVE TRUTH TABLE

 Input J │ Input K │ Current Q │ Next State Q_next │ System Mode / Behavior
─────────┼─────────┼───────────┼───────────────────┼─────────────────────────────────
    0    │    0    │  Q_prev   │      Q_prev       │ HOLD MODE (Preserve Memory)
    0    │    1    │     X     │         0         │ RESET MODE (Force Q = 0)
    1    │    0    │     X     │         1         │ SET MODE (Force Q = 1)
    1    │    1    │  Q_prev   │   NOT(Q_prev)     │ TOGGLE MODE (Invert State!)
```

Let us examine these four operating modes in detail:

1. **Hold Mode ($J = 0, K = 0$)**:
   The flip-flop ignores incoming clock edges. Output $Q$ remains unchanged ($Q_{\text{next}} = Q$).
2. **Reset Mode ($J = 0, K = 1$)**:
   On the active clock edge, output $Q$ is forced to $0$ ($Q_{\text{next}} = 0$). Input $K$ acts like the "Kill" or Reset line.
3. **Set Mode ($J = 1, K = 0$)**:
   On the active clock edge, output $Q$ is forced to $1$ ($Q_{\text{next}} = 1$). Input $J$ acts like the "Jump" or Set line.
4. **Toggle Mode ($J = 1, K = 1$)**:
   When both inputs are active ($J = 1, K = 1$), **the JK Flip-Flop does NOT crash or enter an invalid state!** Instead, it executes a deterministic **Toggle Operation**, inverting its output state ($Q_{\text{next}} = \overline{Q}$).

```text
THE JK TOGGLE RESOLUTION OF THE INVALID STATE

 SR Storage (S = 1, R = 1) ──► FORBIDDEN STATE! (Outputs Collapse, Race Condition!)
 JK Storage (J = 1, K = 1) ──► DETERMINISTIC TOGGLE! (Q_next = Q')
```

---

### The Characteristic Equation of the JK Flip-Flop

To derive the next-state equation $Q_{\text{next}} = f(J, K, Q)$, we construct a Karnaugh Map using inputs $J, K$ and current state $Q$:

```text
JK FLIP-FLOP NEXT-STATE KARNAUGH MAP

             KQ = 00       KQ = 01       KQ = 11       KQ = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
   J = 0  │      0      │      1      │      0      │      0      │
          │  (Cell 0)   │  (Cell 1)   │  (Cell 3)   │  (Cell 2)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
   J = 1  │      1      │      1      │      0      │      1      │
          │  (Cell 4)   │  (Cell 5)   │  (Cell 7)   │  (Cell 6)   │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s on this K-Map:
* **Group 1 (Cells 1 and 5)**: $J$ changes ($0 \to 1$), $K = 0 (\overline{K})$, $Q = 1$. Term = **$\overline{K} \cdot Q$**.
* **Group 2 (Cells 4 and 5)**: $J = 1$, $K$ changes ($0 \to 1$), $Q = 0 (\overline{Q})$. Term = **$J \cdot \overline{Q}$**.

Combining both groups yields the **JK Flip-Flop Characteristic Equation**:

$$
Q_{\text{next}} = (J \cdot \overline{Q}) + (\overline{K} \cdot Q)
$$

Where:
* $Q_{\text{next}}$ is the stored output state after the active clock edge.
* $J$ is the Set/Jump input.
* $K$ is the Reset/Kill input.
* $\overline{K}$ is the inverted Reset input.
* $Q$ is the current stored output state.
* $\overline{Q}$ is the inverted current state.

Let us test all four modes using this characteristic equation:
* **Hold ($J=0, K=0$)**: $Q_{\text{next}} = (0 \cdot \overline{Q}) + (1 \cdot Q) = Q$.
* **Reset ($J=0, K=1$)**: $Q_{\text{next}} = (0 \cdot \overline{Q}) + (0 \cdot Q) = 0$.
* **Set ($J=1, K=0$)**: $Q_{\text{next}} = (1 \cdot \overline{Q}) + (1 \cdot Q) = \overline{Q} + Q = 1$.
* **Toggle ($J=1, K=1$)**: $Q_{\text{next}} = (1 \cdot \overline{Q}) + (0 \cdot Q) = \overline{Q}$.

Every single operating mode is mathematically proven!

---

### Converting a JK Flip-Flop into Other Sequential Primitives

Because the JK Flip-Flop contains the complete set of sequential operating modes (Hold, Set, Reset, and Toggle), it is known as a **Universal Flip-Flop**. We can convert a JK Flip-Flop into any other sequential storage primitive using simple external wiring:

#### 1. Converting JK to a Toggle (T) Flip-Flop
Tie inputs $J$ and $K$ together and connect them to a single Toggle input $T$ ($J = T, K = T$):

$$
Q_{\text{next}} = (T \cdot \overline{Q}) + (\overline{T} \cdot Q) = T \oplus Q
$$

* If $T = 0 \implies J=0, K=0$ (Hold Mode).
* If $T = 1 \implies J=1, K=1$ (Toggle Mode!).

```text
CONVERTING JK FLIP-FLOP TO TOGGLE (T) FLIP-FLOP

 Toggle Line T ──┬──►[ J Pin ] ───┌───────────┐
                 │                │ JK-FF   Q ├──► Output Q
                 └──►[ K Pin ] ───│ >         │
                                  └───────────┘
```

#### 2. Converting JK to a Data (D) Flip-Flop
Connect data line $D$ directly to $J$, and connect inverted data $\overline{D}$ to $K$ ($J = D, K = \overline{D}$):

$$
Q_{\text{next}} = (D \cdot \overline{Q}) + (\overline{\overline{D}} \cdot Q) = (D \cdot \overline{Q}) + (D \cdot Q) = D \cdot (\overline{Q} + Q) = D
$$

* If $D = 1 \implies J=1, K=0$ (Set Mode $\to Q_{\text{next}} = 1$).
* If $D = 0 \implies J=0, K=1$ (Reset Mode $\to Q_{\text{next}} = 0$).

```text
CONVERTING JK FLIP-FLOP TO DATA (D) FLIP-FLOP

 Data Line D ──┬─────────────────►[ J Pin ] ───┌───────────┐
               │                               │ JK-FF   Q ├──► Output Q
               └──►[ NOT Gate ]──►[ K Pin ] ───│ >         │
                                               └───────────┘
```

---

## Gate-Level Synthesis of the Master-Slave JK Flip-Flop

How do we build a Master-Slave JK Flip-Flop out of physical logic gates?

We take a standard Master-Slave D Flip-Flop structure and feed the output signals $Q$ and $\overline{Q}$ back into the Master Latch input steering gates alongside $J$ and $K$:

```text
GATE-LEVEL MASTER-SLAVE JK FLIP-FLOP SCHEMATIC

 Input J ───────►┌─────────┐
 Output Q' ─────►│ NAND 1  ├─► S1' ──┐
 Clock CLK ──┬──►└─────────┘         │   ┌──────────────┐          ┌──────────────┐
             │                       ├──►│ Master Latch ├─► Qm ───►│  Slave Latch ├──► Output Q
             │   ┌─────────┐         │   └──────────────┘          └──────────────┘
 Input K ────┼──►│ NAND 2  ├─► R1' ──┘                                    │
 Output Q ───┼──►└─────────┘                                              │
             │                                                            │
             └────────► [ NOT Clock Inverter ] ──► CLK' ──────────────────┘
```

Let us trace how the feedback lines resolve the $J=1, K=1$ Toggle mode:
1. Suppose current state $Q = 0$ ($\overline{Q} = 1$).
2. Inputs are $J = 1, K = 1$.
3. Steering NAND Gate 1 receives $J = 1, \overline{Q} = 1,$ and $CLK = 1$. Its output $S_1'$ goes LOW ($0$), forcing the Master Latch to **SET ($Q_m = 1$)**.
4. Steering NAND Gate 2 receives $K = 1, Q = 0,$ and $CLK = 1$. Its output $R_1'$ stays HIGH ($1$).
5. On the falling clock edge, the Slave Latch receives $Q_m = 1$ and sets final output **$Q = 1$** (Inverted from $0$ to $1$!).
6. If the next clock pulse arrives with $J = 1, K = 1$, output $Q = 1$ disables NAND Gate 1 and enables NAND Gate 2, forcing the flip-flop to **RESET ($Q = 0$)**.

The feedback connections $Q$ and $\overline{Q}$ automatically direct the clock pulse to the correct side of the master latch, guaranteeing a flawless, deterministic toggle on every clock pulse!

---

## Engineering Reality: Timing Margins and Clock-to-Q Latency

While Toggle and JK flip-flops provide universal state inversion, real CMOS silicon fabrication imposes physical timing parameters that must be respected during system layout.

### 1. Setup Time ($t_{\text{su}}$) and Hold Time ($t_h$) for JK Inputs
In a JK Flip-Flop, the control signals $J$ and $K$ must be stable before the active clock edge arrives ($t_{\text{su}}$) and remain stable for a short duration after the edge ($t_h$).

If input $J$ or $K$ toggles inside the restricted setup/hold window around the clock edge, the master latch input gates can capture partial voltage levels, causing the flip-flop output $Q$ to enter **Metastability** (hovering at an intermediate voltage level before randomly settling).

```text
JK FLIP-FLOP TIMING WINDOW

 Control Inputs J, K :  ====[ MUST BE ROCK-SOLID STABLE ]====
                              ◄───────►       ◄───────►
                               t_setup         t_hold
                                       │
 Clock Signal CLK    :  0000000000000000111111111111111111111
                                      ▲
                                      │ Active Clock Edge
```

### 2. Clock-to-Q Propagation Delay ($t_{\text{C2Q}}$)
The time required for an active clock edge to propagate through the master and slave latches and update output $Q$ is the **Clock-to-Q Delay ($t_{\text{C2Q}}$)**. 

When chaining T or JK flip-flops into asynchronous ripple counters, each stage adds $t_{\text{C2Q}}$ to the cumulative delay, limiting the maximum counting frequency.

---

## Solved Industrial Engineering Exercise: Satellite Communication Clock Divider and State Engine

To consolidate your complete mastery of Toggle Flip-Flops, JK universal state inversion, frequency division chains, characteristic equations, and excitation tables, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics defense contractor is engineering the clock distribution and state sequencing subsystem for a military satellite's secure communications payload.

The satellite contains an onboard crystal oscillator emitting a high-precision $32\text{ MHz}$ master clock signal ($CLK_{\text{master}}$).

```text
SATELLITE COMMUNICATIONS CLOCK DIVIDER MODULE

 Master Clock 32 MHz ──► [ T-FF Stage 0 ] ──► Q0 (16 MHz) ──► [ T-FF Stage 1 ] ──► Q1 (8 MHz)
                                                                                    │
                                                                                    ▼
                                                                             [ JK-FF Engine ] ──► System State Q_sys
```

The system requires two sub-modules:
1. **A 2-Stage Frequency Divider**: Constructed using two cascaded Toggle Flip-Flops ($\text{T-FF}_0$ and $\text{T-FF}_1$) to produce an $8\text{ MHz}$ secondary clock signal $Q_1$.
2. **A JK-Driven State Engine**: A universal JK Flip-Flop ($\text{JK-FF}_{\text{sys}}$) driven by the $8\text{ MHz}$ clock $Q_1$ that executes a custom state transition sequence based on an external Satellite Command Signal ($\text{CMD}$).

#### Hardware Gate Delays:
* T Flip-Flop Clock-to-Q Delay: $t_{\text{C2Q}} = 1.2\text{ ns}$
* JK Flip-Flop Setup Time: $t_{\text{su}} = 0.5\text{ ns}$
* JK Flip-Flop Hold Time: $t_h = 0.2\text{ ns}$

#### Your Objective

1. Calculate the exact signal frequency at output $Q_0$ (after Stage 0) and output $Q_1$ (after Stage 1).
2. Derivation of the state engine inputs: Design the control logic for inputs $J$ and $K$ of $\text{JK-FF}_{\text{sys}}$ such that:
   * When $\text{CMD} = 0$, the state engine holds its state ($Q_{\text{sys,next}} = Q_{\text{sys}}$).
   * When $\text{CMD} = 1$, the state engine toggles its state ($Q_{\text{sys,next}} = \overline{Q_{\text{sys}}}$).
3. Derive the characteristic equation for $Q_{\text{sys,next}}$ in terms of $\text{CMD}$ and $Q_{\text{sys}}$.
4. Calculate the total cumulative propagation delay from $CLK_{\text{master}}$ to the final updated state $Q_{\text{sys}}$.
5. Simulate the complete 2-stage divider and state engine across 4 clock cycles starting from initial state $Q_0=0, Q_1=0, Q_{\text{sys}}=0$ with $\text{CMD} = 1$.

---

### Step-by-Step Derivation

#### Step 1: Calculate Frequency Division at Each Stage

The master clock frequency is $f_{\text{master}} = 32\text{ MHz}$.

##### Stage 0 ($\text{T-FF}_0$ with $T_0 = 1$):
The first Toggle Flip-Flop divides the master clock frequency by 2:

$$
f_{Q0} = \frac{f_{\text{master}}}{2} = \frac{32\text{ MHz}}{2} = \mathbf{16\text{ MHz}}
$$

##### Stage 1 ($\text{T-FF}_1$ with $T_1 = 1$):
The second Toggle Flip-Flop receives $Q_0$ ($16\text{ MHz}$) as its clock input and divides its frequency by 2:

$$
f_{Q1} = \frac{f_{Q0}}{2} = \frac{16\text{ MHz}}{2} = \mathbf{8\text{ MHz}}
$$

Output $Q_1$ produces a clean $8\text{ MHz}$ square wave clock signal for the state engine!

---

#### Step 2: Derive Control Logic for $\text{JK-FF}_{\text{sys}}$

The requirement for the state engine $\text{JK-FF}_{\text{sys}}$ states:
* When $\text{CMD} = 0 \implies$ Hold Mode ($Q_{\text{next}} = Q$).
* When $\text{CMD} = 1 \implies$ Toggle Mode ($Q_{\text{next}} = \overline{Q}$).

Looking at our JK Flip-Flop truth table:
* Hold Mode requires $J = 0, K = 0$.
* Toggle Mode requires $J = 1, K = 1$.

Therefore, we simply tie both $J$ and $K$ inputs directly to the command signal $\text{CMD}$!

$$
J = \text{CMD}
$$

$$
K = \text{CMD}
$$

Where:
* $J$ and $K$ are the inputs to the universal state engine flip-flop.
* $\text{CMD}$ is the satellite command signal.

---

#### Step 3: Derive the State Engine Characteristic Equation

Substitute $J = \text{CMD}$ and $K = \text{CMD}$ into the general JK characteristic equation $Q_{\text{next}} = (J \cdot \overline{Q}) + (\overline{K} \cdot Q)$:

$$
Q_{\text{sys,next}} = (\text{CMD} \cdot \overline{Q_{\text{sys}}}) + (\overline{\text{CMD}} \cdot Q_{\text{sys}})
$$

Recognize this Boolean pattern: $(\text{CMD} \cdot \overline{Q_{\text{sys}}}) + (\overline{\text{CMD}} \cdot Q_{\text{sys}})$ is the exact definition of an **XOR operation**!

$$
Q_{\text{sys,next}} = \text{CMD} \oplus Q_{\text{sys}}
$$

Where:
* $Q_{\text{sys,next}}$ is the next state of the satellite communication engine.
* $\text{CMD}$ is the satellite mode command bit.
* $Q_{\text{sys}}$ is the current state of the engine.

---

#### Step 4: Calculate Total Propagation Delay from Master Clock to $Q_{\text{sys}}$

Let us trace the critical path delay from the rising edge of $CLK_{\text{master}}$ to the final update of $Q_{\text{sys}}$:

1. **Stage 0 ($\text{T-FF}_0$)**: $CLK_{\text{master}}$ triggers $\text{T-FF}_0 \implies Q_0$ updates after $t_{\text{C2Q}} = 1.2\text{ ns}$.
2. **Stage 1 ($\text{T-FF}_1$)**: $Q_0$ triggers $\text{T-FF}_1 \implies Q_1$ updates after $t_{\text{C2Q}} = 1.2\text{ ns}$.
3. **State Engine ($\text{JK-FF}_{\text{sys}}$)**: $Q_1$ triggers $\text{JK-FF}_{\text{sys}} \implies Q_{\text{sys}}$ updates after $t_{\text{C2Q}} = 1.2\text{ ns}$.

Total cumulative propagation delay $T_{\text{total}}$:

$$
T_{\text{total}} = 3 \cdot t_{\text{C2Q}} = 3 \cdot 1.2\text{ ns} = \mathbf{3.6\text{ ns}}
$$

The final system state $Q_{\text{sys}}$ updates **$3.6\text{ nanoseconds}$** after the initial master clock edge!

---

#### Step 5: Simulate 4 Master Clock Cycles with $\text{CMD} = 1$

Let us trace the waveforms starting from $Q_0 = 0, Q_1 = 0, Q_{\text{sys}} = 0$ with $\text{CMD} = 1$ (Toggle Mode Active):

```text
SATELLITE CLOCK DIVIDER TIMING SIMULATION

 Master CLK (32 MHz):  01010101010101010101010101010101
                       ▲   ▲   ▲   ▲   ▲   ▲   ▲   ▲
                       │1  │2  │3  │4  │5  │6  │7  │8 (Master Edges)

 Stage 0 Q0 (16 MHz):  00111100001111000011110000111100
                         ▲       ▲       ▲       ▲
                         │1      │2      │3      │4 (Q0 Rising Edges)

 Stage 1 Q1 (8 MHz) :  00000000111111110000000011111111
                                 ▲               ▲
                                 │1              │2 (Q1 Rising Edges)

 System State Q_sys :  00000000000000001111111111111111
                                       ▲
                                       │ Q_sys Toggles 0 -> 1 at t = 3.6 ns!
```

##### Step-by-Step Chronology Analysis:

1. **Master Clock Edges 1 & 2 ($t = 0 \to 62.5\text{ ns}$)**:
   * Master Clock completes 2 cycles ($32\text{ MHz}$).
   * Stage 0 output $Q_0$ toggles twice, completing 1 full cycle ($16\text{ MHz}$).
   * Stage 1 output $Q_1$ completes its first rising edge at $t = 31.25\text{ ns} + 2.4\text{ ns} = 33.65\text{ ns}$.

2. **$Q_1$ Rising Edge 1 ($t = 33.65\text{ ns}$)**:
   * Output $Q_1$ transitions $0 \to 1$, sending a clock edge to $\text{JK-FF}_{\text{sys}}$.
   * $\text{JK-FF}_{\text{sys}}$ reads $J = 1, K = 1$ ($\text{CMD} = 1$).
   * $\text{JK-FF}_{\text{sys}}$ executes a **Toggle Operation**!
   * Output $Q_{\text{sys}}$ flips from $0$ to $1$ at $t = 33.65\text{ ns} + 1.2\text{ ns} = 34.85\text{ ns}$.

3. **Master Clock Edges 3 & 4**:
   * $Q_1$ remains at $1$ or transitions $1 \to 0$.
   * $\text{JK-FF}_{\text{sys}}$ sees no rising edge on $Q_1$. State $Q_{\text{sys}}$ stays locked at $1$.

4. **$Q_1$ Rising Edge 2 ($t = 158.85\text{ ns}$)**:
   * Next rising edge arrives at $Q_1$.
   * $\text{JK-FF}_{\text{sys}}$ reads $J = 1, K = 1$.
   * Output $Q_{\text{sys}}$ flips from $1$ back to $0$!

The 2-stage frequency divider and universal JK state engine operate with 100% mathematical and physical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Toggle (T) Flip-Flop**: A single-input edge-triggered sequential storage primitive that holds its current state ($Q_{\text{next}} = Q$) when control input $T = 0$, and inverts its state ($Q_{\text{next}} = \overline{Q}$) on every active clock edge when $T = 1$, governed by characteristic equation $Q_{\text{next}} = T \oplus Q$ to enable frequency division by two ($f / 2$).
* **JK Toggle Logic**: The universal 2-input sequential architecture ($J$ Set, $K$ Reset) that eliminates the $1,1$ invalid state condition of SR storage by executing a deterministic state inversion ($Q_{\text{next}} = \overline{Q}$) when $J = 1$ and $K = 1$, governed by characteristic equation $Q_{\text{next}} = (J \cdot \overline{Q}) + (\overline{K} \cdot Q)$.
