---
title: "Multiplexer Circuit Synthesis and Selector Bus Architecture"
---

# Multiplexer Circuit Synthesis and Selector Bus Architecture

## The Data Highway Bottleneck and the Bus Collision Crisis

Imagine a digital system containing four independent hardware modules: an arithmetic unit, a digital temperature sensor, a network interface, and a keyboard controller. Each module continuously generates a 1-bit stream of binary data. Nearby, a single CPU execution register needs to receive data from one of these four sources at any given moment.

If you attempt to solve this data routing problem by physically soldering the output wires of all four data sources directly to the single input pin of the CPU register, a catastrophic hardware failure occurs.

```text
THE DIRECT WIRING BUS COLLISION CRISIS

 Source 0 (Temp Sensor)  ─── Output: 1 ──┐
                                         │
 Source 1 (Keyboard)     ─── Output: 0 ──┼───► SHORT CIRCUIT!
                                         │     (Bus Contention)
 Source 2 (Network Unit) ─── Output: 1 ──┤           │
                                         │           ▼
 Source 3 (Arithmetic)   ─── Output: 0 ──┘    CPU Register Pin
                                              (Unpredictable Smoke/Noise)
```

In binary electronics, a source outputting a $1$ attempts to drive the physical wire to a high voltage level, while a source outputting a $0$ attempts to pull that same physical wire to ground ($0\text{ V}$). When Source 0 emits a $1$ and Source 1 emits a $0$ on the exact same physical wire, a massive electrical short circuit—known as **Bus Contention**—occurs. Large electrical currents surge between the two conflicting gates, heating up the silicon, creating unpredictable voltage noise, and destroying the hardware components.

The alternative naive solution is to run four separate, dedicated physical wires from every source to every destination in the system. But as a computer chip grows to include thousands of registers, memory banks, and processing units, laying down dedicated point-to-point wires for every possible connection causes an immediate physical space explosion. The chip becomes entirely covered by an impenetrable web of copper interconnect wires, leaving no room for actual transistors.

To solve this data routing bottleneck, digital engineering requires a dedicated combinational steering block: a digital switch that accepts $N$ competing data input channels, uses an $S$-bit binary **Selector Bus** to pick exactly one channel, and routes that chosen signal to a single output wire while completely isolating the remaining $N-1$ inactive data sources.

That circuit is the **Multiplexer (MUX)**. Without the multiplexer, modern multi-core processors, shared memory buses, and data-path routing networks could not exist.

---

## The Train Track Switch: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a multiplexer, let us step away from microchips and picture a train station where multiple railroad tracks converge.

Imagine four separate railway lines—Track 0, Track 1, Track 2, and Track 3—approaching a central train station. However, the station only has a single arrival platform. To prevent trains from crashing into each other, a mechanical track switch is installed where the four tracks meet.

```text
THE MULTI-TRACK RAILWAY SWITCH ANALOGY

 Track 0 ────────────────────────┐
                                 │
 Track 1 ────────────────────────┼───► [ Mechanical Switch ] ───► Station Platform
                                 │            ▲
 Track 2 ────────────────────────┤            │
                                 │     [ Selector Lever ]
 Track 3 ────────────────────────┘
```

How does this mechanical track switch operate?
* The station master controls a **Selector Lever**.
* When the selector lever is set to Position 0, the tracks physically align with Track 0. The train on Track 0 glides smoothly onto the platform. The trains on Tracks 1, 2, and 3 are blocked at the switch.
* When the station master moves the selector lever to Position 2, the tracks pivot to align with Track 2. Now, only the train on Track 2 reaches the platform.

Notice three vital properties of this railway switch:
1. **Single Output**: Only one train reaches the platform at any given time.
2. **Complete Isolation**: The trains waiting on the unselected tracks cannot spill onto the main platform line. There are zero collisions.
3. **Pure Data Routing**: The switch does not alter or transform the train; it simply chooses *which track's train* gets routed to the destination.

This mechanical track switch is the exact physical analogue of a digital **Multiplexer (MUX)**:
* The incoming tracks (Tracks 0, 1, 2, 3) are the **Data Inputs** ($D_0, D_1, D_2, D_3$).
* The selector lever position is the **Selector Bus** ($S$).
* The single platform line is the **Multiplexer Output** ($Y$).

In digital logic, instead of moving mechanical steel rails, a multiplexer uses an array of electronic AND gates acting as digital valves opened or closed by binary selector signals.

---

## Mechanics of Multiplexer Synthesis and Selector Bus Architecture

To master multiplexer design, we must dissect the formal mechanics of its two core primitives:
1. **The Multiplexer (MUX)**: How $N$ data inputs are combined with selector signals to output a single chosen channel.
2. **The Selector Bus**: How $S$ control bits decode an $S$-to-$2^S$ binary address to enable exactly one internal data path while disabling all others.

---

### Primitive 1: The 2-to-1 Multiplexer (2:1 MUX)

The simplest possible multiplexer is the 2-to-1 Multiplexer (2:1 MUX). It receives two data inputs ($D_0$ and $D_1$), one single-bit selector line ($S$), and produces one output ($Y$).

```text
2-TO-1 MULTIPLEXER FUNCTIONAL BLOCK

 Data Input 0 (D0) ───┐
                      ├───► [ 2:1 MUX ] ───► Output Y
 Data Input 1 (D1) ───┘          ▲
                                 │
 Select Line (S) ────────────────┘
```

#### 1. Truth Table Derivation
Let us construct the truth table for the 2:1 MUX. The system has 3 binary inputs ($S, D_0, D_1$), resulting in $2^3 = 8$ rows.

```text
2:1 MULTIPLEXER EXHAUSTIVE TRUTH TABLE

 Row │ Select (S) │ Data 0 (D0) │ Data 1 (D1) │ Output (Y) │ Active Path Selected
─────┼────────────┼─────────────┼─────────────┼────────────┼───────────────────────
  0  │     0      │      0      │      0      │     0      │ Routes D0 (D0 = 0)
  1  │     0      │      0      │      1      │     0      │ Routes D0 (D0 = 0)
  2  │     0      │      1      │      0      │     1      │ Routes D0 (D0 = 1)
  3  │     0      │      1      │      1      │     1      │ Routes D0 (D0 = 1)
  4  │     1      │      0      │      0      │     0      │ Routes D1 (D1 = 0)
  5  │     1      │      0      │      1      │     1      │ Routes D1 (D1 = 1)
  6  │     1      │      1      │      0      │     0      │ Routes D1 (D1 = 0)
  7  │     1      │      1      │      1      │     1      │ Routes D1 (D1 = 1)
```

Look closely at the pattern in this table:
* When $S = 0$ (Rows 0 to 3), the output $Y$ is an exact replica of $D_0$, completely ignoring $D_1$.
* When $S = 1$ (Rows 4 to 7), the output $Y$ is an exact replica of $D_1$, completely ignoring $D_0$.

We can condense this 8-row table into a compact functional selection table:

```text
CONDENSED 2:1 MUX SELECTION TABLE

 Select Line (S) │ Output Function (Y) │ Operational Description
─────────────────┼─────────────────────┼─────────────────────────
      S = 0      │       Y = D0        │ Input D0 routed to Output
      S = 1      │       Y = D1        │ Input D1 routed to Output
```

#### 2. Boolean Equation Extraction
Extracting the active minterm rows ($Y=1$) from the 8-row truth table yields:

$$
Y = (\overline{S} \cdot D_0 \cdot \overline{D_1}) + (\overline{S} \cdot D_0 \cdot D_1) + (S \cdot \overline{D_0} \cdot D_1) + (S \cdot D_0 \cdot D_1)
$$

Factoring out $(\overline{S} \cdot D_0)$ from the first two terms, and $(S \cdot D_1)$ from the last two terms using the Distributive Law:

$$
Y = \overline{S} \cdot D_0 \cdot (\overline{D_1} + D_1) + S \cdot D_1 \cdot (\overline{D_0} + D_0)
$$

Applying the Complement Law ($\overline{X} + X = 1$) and Identity Law ($X \cdot 1 = X$):

$$
Y = (\overline{S} \cdot D_0) + (S \cdot D_1)
$$

Where:
* $Y$ is the single-bit multiplexer output.
* $S$ is the single-bit select signal line.
* $\overline{S}$ is the inverted select signal line.
* $D_0$ is data input channel 0.
* $D_1$ is data input channel 1.

#### 3. Gate-Level Hardware Architecture
The Boolean equation $Y = (\overline{S} \cdot D_0) + (S \cdot D_1)$ maps directly to a two-level AND-OR gate schematic consisting of:
* One NOT gate (to invert select line $S$).
* Two 2-input AND gates (acting as channel valves).
* One 2-input OR gate (acting as the output combiner).

```text
2:1 MULTIPLEXER GATE SCHEMATIC

 Data D0 ────────────────────────►┌───────┐
                                  │ AND 0 ├──┐
 Select S ──►[ NOT ]─► S' ───────►└───────┘  │   ┌──────┐
                                             ├──►│  OR  ├──► Output Y
 Data D1 ────────────────────────►┌───────┐  │   └──────┘
                                  │ AND 1 ├──┘
 Select S ───────────────────────►└───────┘
```

How does this circuit work physically?
* If $S = 0$: The inverted select line $\overline{S} = 1$. Gate AND 0 receives inputs $D_0$ and $1$, so its output is $D_0 \cdot 1 = D_0$. Meanwhile, Gate AND 1 receives $S = 0$, so its output is forced to $D_1 \cdot 0 = 0$. The OR gate receives $D_0 + 0 = D_0$. Channel 0 passes through!
* If $S = 1$: The inverted select line $\overline{S} = 0$. Gate AND 0 is forced to $0$. Gate AND 1 receives $D_1$ and $1$, passing $D_1$. The OR gate receives $0 + D_1 = D_1$. Channel 1 passes through!

---

### Primitive 2: The Selector Bus Architecture and $N:1$ MUX Scaling

When a multiplexer scales up to select among $N$ data channels (where $N = 4, 8, 16, 32, \dots$), how many select lines do we need?

Because an $S$-bit binary number can represent $2^S$ unique address combinations, the required number of select lines $S$ for an $N$-channel multiplexer is given by the logarithmic relationship:

$$
S = \log_2(N) \quad \iff \quad N = 2^S
$$

Where:
* $N$ is the number of data input channels.
* $S$ is the number of binary select lines composing the **Selector Bus**.

```text
MULTIPLEXER CHANNEL-TO-SELECTOR BUS SCALING

 Data Channels (N) │ Selector Bus Bits (S) │ Binary Address Range │ MUX Type Symbol
───────────────────┼───────────────────────┼──────────────────────┼─────────────────
         2         │           1           │        0 to 1        │    2:1 MUX
         4         │           2           │       00 to 11       │    4:1 MUX
         8         │           3           │      000 to 111      │    8:1 MUX
        16         │           4           │     0000 to 1111     │   16:1 MUX
        32         │           5           │    00000 to 11111    │   32:1 MUX
```

---

### Anatomy of a 4-to-1 Multiplexer (4:1 MUX)

A 4-to-1 Multiplexer (4:1 MUX) has $N = 4$ data input lines ($D_0, D_1, D_2, D_3$), a 2-bit **Selector Bus** $S = (S_1, S_0)$, and a single output line $Y$.

```text
4:1 MULTIPLEXER FUNCTIONAL BLOCK

 Data D0 ────┐
 Data D1 ────┤
 Data D2 ────┼───► [ 4:1 MUX ] ───► Output Y
 Data D3 ────┘          ▲
                        │ (2-Bit Bus)
 Selector Bus ──────────┘ [ S1, S0 ]
```

#### 1. Condensed 4:1 MUX Selection Table

```text
4:1 MUX CONDENSED SELECTION TABLE

 Select S1 │ Select S0 │ Output Function (Y) │ Decoding Minterm
───────────┼───────────┼─────────────────────┼──────────────────
     0     │     0     │       Y = D0        │   S1' * S0'
     0     │     1     │       Y = D1        │   S1' * S0
     1     │     0     │       Y = D2        │   S1  * S0'
     1     │     1     │       Y = D3        │   S1  * S0
```

#### 2. General Boolean Equation for a 4:1 MUX
By assigning each data input to its corresponding 2-bit select line decoding minterm, we construct the general 4:1 MUX Boolean expression:

$$
Y = (\overline{S_1} \cdot \overline{S_0} \cdot D_0) + (\overline{S_1} \cdot S_0 \cdot D_1) + (S_1 \cdot \overline{S_0} \cdot D_2) + (S_1 \cdot S_0 \cdot D_3)
$$

Where:
* $Y$ is the single-bit output.
* $S_1, S_0$ are the Most Significant Bit (MSB) and Least Significant Bit (LSB) of the selector bus.
* $D_0, D_1, D_2, D_3$ are the four data input channel lines.

#### 3. General Mathematical Expression for any $N:1$ MUX
Extending this structure, the output of any $N:1$ multiplexer with an $S$-bit selector bus ($N = 2^S$) is expressed as the summation of $N$ product terms:

$$
Y = \sum_{k=0}^{2^S - 1} \left( m_k(S) \cdot D_k \right)
$$

Where:
* $Y$ is the multiplexer output.
* $S$ is the $S$-bit selector bus vector $(S_{S-1}, \dots, S_1, S_0)$.
* $m_k(S)$ is the $k$-th decoding minterm evaluated over the selector bus variables.
* $D_k$ is the $k$-th data input channel signal.

```text
4:1 MULTIPLEXER INTERNAL DECODER-VALVE ARCHITECTURE

      ┌───────┐
D0 ──►│ AND 0 ├─────────────►┌────────┐
      ├───────┤              │        │
D1 ──►│ AND 1 ├─────────────►│ 4-INP  │
      ├───────┤              │   OR   ├──► Output Y
D2 ──►│ AND 2 ├─────────────►│  GATE  │
      ├───────┤              │        │
D3 ──►│ AND 3 ├─────────────►└────────┘
      └───▲───┘
          ║
    Select Bus [S1, S0]
```

In this architecture:
* The selector bus acts as an **Internal Decoder** that evaluates $m_k(S)$.
* Exactly **one** AND gate receives a decoder match of $1$, opening its channel to pass $D_k$.
* All other $N-1$ AND gates receive a $0$ from the decoder, forcing their outputs to $0$.
* The OR gate receives $0 + 0 + \dots + D_k + \dots + 0 = D_k$.

---

## Hierarchical Multiplexer Trees: Building Big MUXes from Small MUXes

What if your system requires a 16-to-1 Multiplexer (16:1 MUX), but your component library or chip vendor only provides 4-to-1 Multiplexer (4:1 MUX) blocks?

Digital logic allows us to build arbitrarily large multiplexers by arranging smaller multiplexers into a **Hierarchical MUX Tree**.

### Constructing a 16:1 MUX Using 4:1 MUX Sub-Blocks

A 16:1 MUX requires 16 data inputs ($D_0$ through $D_{15}$) and a 4-bit selector bus $S = (S_3, S_2, S_1, S_0)$.

To construct a 16:1 MUX using 4:1 MUX sub-blocks:
1. **Level 1 (Primary Channel Stage)**: We place four 4:1 MUXes in parallel ($M_0, M_1, M_2, M_3$).
   * $M_0$ receives data inputs $D_0, D_1, D_2, D_3$.
   * $M_1$ receives data inputs $D_4, D_5, D_6, D_7$.
   * $M_2$ receives data inputs $D_8, D_9, D_{10}, D_{11}$.
   * $M_3$ receives data inputs $D_{12}, D_{13}, D_{14}, D_{15}$.
   * All four Level 1 MUXes share the lower 2 bits of the selector bus: $(S_1, S_0)$.
2. **Level 2 (Sub-Block Selection Stage)**: We place a fifth 4:1 MUX ($M_{\text{final}}$) to collect the outputs of $M_0, M_1, M_2, M_3$.
   * $M_{\text{final}}$ uses the upper 2 bits of the selector bus: $(S_3, S_2)$ to choose which Level 1 MUX output reaches the final destination $Y$.

```text
HIERARCHICAL 16:1 MULTIPLEXER TREE ARCHITECTURE

Level 1: Primary (S1, S0)           Level 2: Final (S3, S2)

D0..D3   ──► [ 4:1 MUX M0 ] ──┐
                              │
D4..D7   ──► [ 4:1 MUX M1 ] ──┼──► [ 4:1 MUX M_final ] ──► Output Y
                              │          ▲
D8..D11  ──► [ 4:1 MUX M2 ] ──┤          ║ [S3, S2] (Upper Bits)
                              │
D12..D15 ──► [ 4:1 MUX M3 ] ──┘
                  ▲
                  ║ [S1, S0] (Lower Bits)
```

Let us trace how address $S = 1001_2$ (decimal 9) routes data channel $D_9$ to output $Y$:
* Lower selector bits $(S_1, S_0) = 01_2$ (decimal 1).
  * $M_0$ routes $D_1$.
  * $M_1$ routes $D_5$.
  * $M_2$ routes $D_9$.
  * $M_3$ routes $D_{13}$.
* Upper selector bits $(S_3, S_2) = 10_2$ (decimal 2).
  * $M_{\text{final}}$ selects Input 2, which is connected to the output of $M_2$.
  * Output $Y = \text{Output of } M_2 = D_9$!

The hierarchical tree routes $D_9$ to $Y$ with total mathematical perfection!

---

## Universal Logic Implementation Using Multiplexers

Beyond routing data, multiplexers possess an astounding, superpower-like property in computer engineering: **A multiplexer can implement ANY arbitrary Boolean logic function without requiring a single external logic gate!**

Because an $N:1$ MUX contains an internal decoder that generates all $2^S$ minterms over its selector bus, a MUX can act as a **Universal Logic Module (ULM)**.

### 1. Implementing an $S$-Variable Function using an $N:1$ MUX ($N = 2^S$)

To implement any arbitrary $S$-variable truth table $Y = f(X_{S-1}, \dots, X_0)$ using an $N:1$ MUX ($N = 2^S$):

1. Connect the $S$ input variables of the function directly to the MUX **Selector Bus** $(S_{S-1}, \dots, S_0)$.
2. Connect the fixed logic values $0$ or $1$ to the MUX **Data Inputs** ($D_0, D_1, \dots, D_{N-1}$) corresponding to the output column of the truth table for each row!

```text
UNIVERSAL TRUTH TABLE MAPPING INTO A MUX

 Truth Table Row (k) │ Function Output Y │ MUX Data Pin Assignment
─────────────────────┼───────────────────┼─────────────────────────
       Row 0         │    Y = 0 or 1     │     Connect D0 = Y_0
       Row 1         │    Y = 0 or 1     │     Connect D1 = Y_1
         :           │        :          │            :
      Row N-1        │    Y = 0 or 1     │     Connect D_(N-1) = Y_(N-1)
```

#### Example: Implementing $Y = A \cdot B + \overline{A} \cdot C$ using an 8:1 MUX
The function has 3 inputs ($A, B, C$), so we use an 8:1 MUX with 3 selector lines ($S_2=A, S_1=B, S_0=C$).

```text
TRUTH TABLE TO MUX DATA PIN MAPPING

 Row │ A │ B │ C │ Output Y │ MUX Data Pin
─────┼───┼───┼───┼──────────┼───────────────
  0  │ 0 │ 0 │ 0 │    0     │   Set D0 = 0
  1  │ 0 │ 0 │ 1 │    1     │   Set D1 = 1
  2  │ 0 │ 1 │ 0 │    0     │   Set D2 = 0
  3  │ 0 │ 1 │ 1 │    1     │   Set D3 = 1
  4  │ 1 │ 0 │ 0 │    0     │   Set D4 = 0
  5  │ 1 │ 0 │ 1 │    0     │   Set D5 = 0
  6  │ 1 │ 1 │ 0 │    1     │   Set D6 = 1
  7  │ 1 │ 1 │ 1 │    1     │   Set D7 = 1
```

By tying $D_0=0, D_1=1, D_2=0, D_3=1, D_4=0, D_5=0, D_6=1, D_7=1$, the 8:1 MUX implements $Y = A \cdot B + \overline{A} \cdot C$ instantly, with zero external AND or OR gates!

```text
8:1 MUX IMPLEMENTING ARBITRARY LOGIC FUNCTION

 Constant 0 ───► D0, D2, D4, D5 ──┐
                                  ├───► [ 8:1 MUX ] ───► Output Y = AB + A'C
 Constant 1 ───► D1, D3, D6, D7 ──┘          ▲
                                             │ (3-Bit Selector Bus)
 Variables A, B, C ──────────────────────────┘ [ S2=A, S1=B, S0=C ]
```

---

### 2. The Variable-Folding Technique: Implementing $(S+1)$-Variable Functions using an $N:1$ MUX ($N = 2^S$)

Can we implement a 4-variable function ($A, B, C, D$) using a smaller 8:1 MUX ($S = 3$ select lines)?

**Yes!** Using the **Variable-Folding Technique**, an $N:1$ MUX ($N = 2^S$) can implement any $(S+1)$-variable Boolean function by connecting $S$ variables to the selector bus and driving the data pins with the remaining variable ($D$), its complement ($\overline{D}$), $0$, or $1$.

To fold variable $D$ into the data pins of an 8:1 MUX for function $f(A, B, C, D)$:
1. Assign $A, B, C$ to the MUX Selector Bus ($S_2=A, S_1=B, S_0=C$).
2. Group the 16-row truth table into 8 pairs of rows sharing the same $ABC$ values.
3. For each pair where $D$ goes $0 \to 1$:
   * If Output $Y$ stays $0, 0 \implies$ Set $D_k = 0$.
   * If Output $Y$ stays $1, 1 \implies$ Set $D_k = 1$.
   * If Output $Y$ matches $D$ ($0 \to 1$) $\implies$ Set $D_k = D$.
   * If Output $Y$ inverts $D$ ($1 \to 0$) $\implies$ Set $D_k = \overline{D}$.

```text
VARIABLE FOLDING MAPPING RULES FOR DATA PINS

 Pair Output Pattern (for D=0, D=1) │ Assigned Data Pin Value
────────────────────────────────────┼─────────────────────────
             Y = 0, 0               │         D_k = 0
             Y = 1, 1               │         D_k = 1
             Y = 0, 1 (Matches D)   │         D_k = D
             Y = 1, 0 (Inverts D)   │         D_k = D'
```

This technique allows FPGA (Field-Programmable Gate Array) chips to store complex 5-variable or 6-variable logic equations inside small lookup-table MUXes, maximizing chip logic density!

---

## Engineering Reality: Gate Fan-In, Propagation Delays, and Enable Controls

While multiplexers provide clean, structured data routing, real-world physical CMOS silicon introduces limits that hardware designers must evaluate.

### 1. Enable Lines ($\overline{\text{EN}}$) and Multi-Chip Expansion

Industrial multiplexer ICs (Integrated Circuits) include an active-low **Enable Line** ($\overline{\text{EN}}$ or $\overline{G}$).

When $\overline{\text{EN}} = 0$, the MUX operates normally according to its selector bus. When $\overline{\text{EN}} = 1$, the MUX output is forced to $0$ regardless of selector or data inputs.

```text
4:1 MUX WITH ACTIVE-LOW ENABLE

 Enable (EN') ───► [ 4:1 MUX with EN' ] ───► Output Y
                    (If EN'=1, Y is forced to 0)
```

Enable lines allow engineers to combine multiple MUX IC chips onto a shared printed circuit board bus without causing bus contention.

### 2. Propagation Delay ($t_{pd}$) and Multiplexer Latency

A signal passing through a multiplexer experiences two types of propagation delays:

1. **Data-to-Output Delay ($t_{pd, \text{Data}}$)**: The time required for a change on data pin $D_k$ to reach output $Y$ when the select lines are stable. This delay is usually small because data passes through only 2 gate stages (AND $\to$ OR).
2. **Select-to-Output Delay ($t_{pd, \text{Select}}$)**: The time required for a change on selector bus $S$ to switch channels and emit the new data on output $Y$. This delay is slightly larger because the select signal must pass through internal NOT inverters and decoder AND gates before the OR gate reacts.

```text
MULTIPLEXER PROPAGATION DELAY COMPARISON

 Data Path  : Data D_k ──────────────► [ AND ] ──► [ OR ] ──► Output Y
               (2 Gate Delays: t_and + t_or)

 Select Path: Select S ──► [ NOT ] ──► [ AND ] ──► [ OR ] ──► Output Y
               (3 Gate Delays: t_not + t_and + t_or)
```

In high-speed central processing unit (CPU) design, engineers change the selector bus address *before* data arrives at the input pins, ensuring that the selector path delay is hidden while data passes through at maximum speed.

---

## Solved Industrial Engineering Exercise: CPU Register File Read Router

To cement your complete mastery of multiplexer synthesis, selector bus decoding, hierarchical MUX trees, and universal logic implementation, we will walk through a complete, step-by-step computer engineering problem: designing the 8-to-1 data read router for a 32-bit CPU register file.

---

### Scenario and Parameters

A microprocessor design team is engineering the 8-to-1 Data Read Router ($Y$) for a CPU register file containing eight 1-bit internal registers ($R_0$ through $R_7$).

The CPU control unit issues a 3-bit **Register Select Bus** $R_{\text{sel}} = (S_2, S_1, S_0)$ to choose which register's data should be routed to the ALU operand bus $Y$.

The system also includes an active-low **Bus Enable Signal** ($\overline{\text{BUS\_EN}}$):
* When $\overline{\text{BUS\_EN}} = 0$, the selected register's bit is routed to $Y$.
* When $\overline{\text{BUS\_EN}} = 1$, the router output $Y$ is forced to $0$ (disabling the bus).

```text
CPU REGISTER FILE DATA READ ROUTER

 Registers R0..R7 ────► [ 8:1 MUX Router ] ───► ALU Operand Bus (Y)
                              ▲      ▲
 Register Select (S2,S1,S0) ──┘      │
 Bus Enable (BUS_EN') ───────────────┘
```

#### System Operating Requirements

The register selection mapping is defined as follows:

```text
REGISTER FILE READ SELECTION MAPPING

 Select S2 │ Select S1 │ Select S0 │ Selected Register │ Output Y (when BUS_EN' = 0)
───────────┼───────────┼───────────┼───────────────────┼──────────────────────────────
     0     │     0     │     0     │    Register R0    │            Y = R0
     0     │     0     │     1     │    Register R1    │            Y = R1
     0     │     1     │     0     │    Register R2    │            Y = R2
     0     │     1     │     1     │    Register R3    │            Y = R3
     1     │     0     │     0     │    Register R4    │            Y = R4
     1     │     0     │     1     │    Register R5    │            Y = R5
     1     │     1     │     0     │    Register R6    │            Y = R6
     1     │     1     │     1     │    Register R7    │            Y = R7
```

#### Your Objective

1. Derive the general Boolean expression for the 8-to-1 Register Router output $Y$, including the active-low enable signal $\overline{\text{BUS\_EN}}$.
2. Design the hierarchical MUX tree that constructs this 8:1 router using two 4:1 MUXes and one 2:1 MUX.
3. Use the Variable-Folding Technique to implement an auxiliary CPU parity condition function $f(A, B, C, D) = \sum m(1, 4, 5, 6, 7, 9, 14, 15)$ using a single 8:1 MUX.
4. Verify the complete router against CPU execution scenarios.

---

### Step-by-Step Derivation

#### Step 1: Derive the Boolean Expression for Output $Y$

The output $Y$ must equal $1$ if $\overline{\text{BUS\_EN}} = 0$ AND the selected register $R_k$ has $R_k = 1$.

We express this by AND-ing the active-low enable term $\overline{\text{BUS\_EN}}$ with the 8-term selector minterm expansion:

$$
Y = \overline{\text{BUS\_EN}} \cdot \left[ \sum_{k=0}^{7} \left( m_k(S_2, S_1, S_0) \cdot R_k \right) \right]
$$

Expanding this into full algebraic form:

$$
Y = \overline{\text{BUS\_EN}} \cdot \left[ (\overline{S_2}\overline{S_1}\overline{S_0}R_0) + (\overline{S_2}\overline{S_1}S_0 R_1) + (\overline{S_2}S_1\overline{S_0}R_2) + (\overline{S_2}S_1 S_0 R_3) + (S_2\overline{S_1}\overline{S_0}R_4) + (S_2\overline{S_1}S_0 R_5) + (S_2 S_1\overline{S_0}R_6) + (S_2 S_1 S_0 R_7) \right]
$$

Where:
* $Y$ is the ALU operand bus output bit.
* $\overline{\text{BUS\_EN}}$ is the active-low bus enable line.
* $S_2, S_1, S_0$ are the 3 select bits of the register select bus.
* $R_0, R_1, \dots, R_7$ are the 1-bit data lines from registers 0 through 7.

---

#### Step 2: Construct the Hierarchical MUX Tree (Two 4:1 MUXes + One 2:1 MUX)

To implement this 8:1 router using smaller 4:1 MUX and 2:1 MUX building blocks:

1. **Level 1 (Register Pair Selection)**:
   * **MUX $A$ (4:1 MUX)**: Receives $R_0, R_1, R_2, R_3$. Controlled by lower selector bits $(S_1, S_0)$.
   * **MUX $B$ (4:1 MUX)**: Receives $R_4, R_5, R_6, R_7$. Controlled by lower selector bits $(S_1, S_0)$.
2. **Level 2 (Bank Selection and Enable Control)**:
   * **MUX $C$ (2:1 MUX with Enable)**: Receives output of MUX $A$ on input 0, and output of MUX $B$ on input 1.
   * Controlled by MSB select bit $S_2$.
   * Enable line connected to $\overline{\text{BUS\_EN}}$.

```text
HIERARCHICAL REGISTER ROUTER TREE SCHEMATIC

Level 1: Bank Selection (S1, S0)    Level 2: Final Routing & Enable

R0..R3 ──► [ 4:1 MUX A ] ──┐
                           ├──────► [ 2:1 MUX C ] ──► Output Y
R4..R7 ──► [ 4:1 MUX B ] ──┘            ▲    ▲
                ▲                       │    │
                ║ [S1, S0]          S2 ─┘    └── BUS_EN'
```

---

#### Step 3: Implement $f(A, B, C, D) = \sum m(1, 4, 5, 6, 7, 9, 14, 15)$ using Variable Folding on an 8:1 MUX

We are asked to implement the 4-variable function $f(A, B, C, D) = \sum m(1, 4, 5, 6, 7, 9, 14, 15)$ using a single 8:1 MUX.

##### Sub-step 3.1: Assign Select Lines
Assign the 3 MSB variables $A, B, C$ to the 8:1 MUX Selector Bus:

$$
S_2 = A, \quad S_1 = B, \quad S_0 = C
$$

Variable $D$ will be folded into the data pins $D_0$ through $D_7$.

##### Sub-step 3.2: Construct the 16-Row Pairing Table
We pair rows sharing the same $ABC$ values and examine how output $Y$ relates to variable $D$:

```text
VARIABLE FOLDING PAIRING TABLE FOR 8:1 MUX

 ABC  │ Rows (D=0, D=1) │ Output Y for D=0 │ Output Y for D=1 │ Relationship to D │ MUX Data Pin Assignment
──────┼─────────────────┼──────────────────┼──────────────────┼───────────────────┼─────────────────────────
 000  │  m0 (0), m1 (1) │        0         │        1         │     Y = D         │       D0 = D
 001  │  m2 (2), m3 (3) │        0         │        0         │     Y = 0         │       D1 = 0
 010  │  m4 (4), m5 (5) │        1         │        1         │     Y = 1         │       D2 = 1
 011  │  m6 (6), m7 (7) │        1         │        1         │     Y = 1         │       D3 = 1
 100  │  m8 (8), m9 (9) │        0         │        1         │     Y = D         │       D4 = D
 101  │ m10(10), m11(11)│        0         │        0         │     Y = 0         │       D5 = 0
 110  │ m12(12), m13(13)│        0         │        0         │     Y = 0         │       D6 = 0
 111  │ m14(14), m15(15)│        1         │        1         │     Y = 1         │       D7 = 1
```

##### Sub-step 3.3: Final 8:1 MUX Data Pin Connections
* Connect $D_0 = D$
* Connect $D_1 = 0$
* Connect $D_2 = 1$
* Connect $D_3 = 1$
* Connect $D_4 = D$
* Connect $D_5 = 0$
* Connect $D_6 = 0$
* Connect $D_7 = 1$

```text
8:1 MUX IMPLEMENTATION OF f(A,B,C,D)

 Data Line D ─────────► D0, D4 ──────┐
 Constant 0  ─────────► D1, D5, D6 ──┼───► [ 8:1 MUX ] ───► Output Y
 Constant 1  ─────────► D2, D3, D7 ──┘          ▲
                                                │ (Select Bus)
 Selector Inputs A, B, C ───────────────────────┘ [ S2=A, S1=B, S0=C ]
```

The 4-variable function is implemented with 100% mathematical accuracy on a single 8:1 MUX!

---

### Sanity Check and Verification

Let us verify our register router and universal logic implementation against CPU operational scenarios.

#### Test Scenario 1: CPU Reads Register $R_5$ ($S = 101_2$, $\overline{\text{BUS\_EN}} = 0$)
* **Inputs**: $S_2=1, S_1=0, S_0=1$. $\overline{\text{BUS\_EN}} = 0$. Register $R_5$ contains bit value $1$.
* **Tree Evaluation**:
  * MUX $A$ selects $R_1$ (since $S_1S_0 = 01_2$).
  * MUX $B$ selects $R_5$ (since $S_1S_0 = 01_2$). Output of MUX $B = R_5 = 1$.
  * MUX $C$ receives $S_2 = 1$. It selects input 1 (Output of MUX $B$).
  * Enable $\overline{\text{BUS\_EN}} = 0$, so MUX $C$ passes input 1.
* **Output**: $Y = R_5 = 1$. **ROUTER SUCCESS!**

#### Test Scenario 2: Bus Disabled During CPU Reset ($\overline{\text{BUS\_EN}} = 1$)
* **Inputs**: $S = 101_2$, $\overline{\text{BUS\_EN}} = 1$.
* **Tree Evaluation**: MUX $C$ receives active-low enable of $1$. MUX $C$ forces output $Y = 0$.
* **Output**: $Y = 0$. **BUS DISABLE SUCCESS!**

#### Test Scenario 3: Verifying Universal Logic Implementation for Minterm $m_6$ ($ABCD = 0110_2$)
* **Inputs**: $A=0, B=1, C=1, D=0$.
* **Specification Check**: $m_6$ is in $\sum m(1, 4, 5, 6, 7, 9, 14, 15)$. Expected output $Y = 1$.
* **Folded MUX Evaluation**:
  * Selector $S_2S_1S_0 = ABC = 011_2$ (decimal 3).
  * MUX selects data pin $D_3$.
  * We assigned $D_3 = 1$.
* **Output**: $Y = 1$. **UNIVERSAL LOGIC SUCCESS!**

All scenarios evaluate with 100% mathematical precision. The register read router and universal logic MUX are fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Multiplexer (MUX)**: A combinational digital circuit that acts as a multi-way data selector, using an $S$-bit control bus to dynamically route exactly one of $N = 2^S$ input data channels to a single output wire while isolating all inactive sources to prevent bus contention.
* **Selector Bus**: The $S$-bit binary address lines $(S_{S-1}, \dots, S_0)$ that decode a 1-of-$2^S$ enable path inside a multiplexer, driving internal AND-gate data valves to select the active input channel.
