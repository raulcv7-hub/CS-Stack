---
title: "02. Binary Encoder Architecture"
---

﻿# Binary Encoder Architecture and Active Line Compression Mechanics

## The Interconnect Congestion of One-Hot Wire Networks

Imagine an industrial control desk equipped with eight physical push-buttons ($I_0, I_1, I_2, I_3, I_4, I_5, I_6, I_7$). Each button represents an operator command, such as "Calibrate," "Pause," "Start," or "Emergency Stop." Under normal operating conditions, an operator presses exactly one button at a time to issue a command. Ten meters away across the factory floor, a central microprocessor receives these operator commands.

If you attempt to connect these eight buttons to the processor by running eight individual, dedicated copper wires across the factory floor, you encounter an immediate physical and financial penalty.

```text
ONE-HOT INTERCONNECT CONGESTION (8 WIRES)

 Push-Button Console                    Microprocessor
 ┌───────────┐    Wire 0 (Button I0)   ┌───────────────┐
 │ Button I0 ├─────────────────────────┤ Pin 0         │
 │ Button I1 ├─────────────────────────┤ Pin 1         │
 │ Button I2 ├─────────────────────────┤ Pin 2         │
 │   ...     │   ... (8 Wires!)        │  ...          │
 │ Button I7 ├─────────────────────────┤ Pin 7         │
 └───────────┘                         └───────────────┘
   8 Input Lines                       8 Dedicated Processor Pins
```

Laying down eight physical wires for eight mutually exclusive buttons is electrically redundant and highly inefficient. Because only one button is pressed at any given moment, the signal on those eight wires forms a **One-Hot Encoded** pattern (such as $00000001_2, 00000010_2, 00000100_2,$ or $10000000_2$). 

Notice what this means: seven out of the eight wires sit completely idle, carrying $0\text{ V}$ (Logic Low), while only one wire carries $+5\text{ V}$ (Logic High).

In digital information theory, eight mutually exclusive states do not require eight physical wires. Since $2^3 = 8$, the exact same eight choices can be represented mathematically using a compressed **3-bit binary code** ($000_2, 001_2, 010_2, \dots, 111_2$).

```text
COMPRESSED BINARY INTERCONNECT (3 WIRES)

 Push-Button Console                  Microprocessor
 ┌───────────┐                        ┌───────────────┐
 │ Buttons   │     3-Bit Binary Bus   │               │
 │ I0 .. I7  ├───► (3 Wires Only!) ───┤ Pins Y2,Y1,Y0 │
 └───────────┘                        └───────────────┘
   8 Inputs                            3 Processor Pins (62.5% Savings!)
```

By compressing eight physical lines down to three binary bits, we reduce the required bus width, save $62.5\%$ of the physical interconnect wires, and free up five precious input pins on the microprocessor package.

To perform this real-time data compression, digital engineering uses a specialized combinational logic block: a circuit that takes $2^N$ mutually exclusive input lines, detects which line is active, and converts that active line index into an $N$-bit binary output code (**Active Line Compression**).

That circuit is the **Binary Encoder**. It performs the exact functional inverse of a binary decoder. Without the binary encoder, keypad interfaces, interrupt request lines, and measurement conversion buses would consume unmanageable numbers of physical wires and chip pins.

---

## The Restaurant Table Pager: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a binary encoder and active line compression, let us step away from microchips and picture a busy restaurant pager system.

Imagine a large restaurant with eight dining tables ($T_0, T_1, T_2, T_3, T_4, T_5, T_6, T_7$). Each table has a service button that a customer presses when they want to order food. In the kitchen, a digital display screen shows the chef which table needs service.

```text
THE RESTAURANT PAGER COMPRESSION SYSTEM

 Dining Room Tables                    Kitchen Display
 ┌───────────┐                        ┌───────────────┐
 │ Table T0  │                        │               │
 │ Table T1  │                        │ Numeric       │
 │   ...     │  ───► [ ENCODER ] ───► │ Display: "5"  │
 │ Table T5  │  (Press T5 = 101_2)    │               │
 │ Table T7  │                        └───────────────┘
 └───────────┘                           3-Wire Binary Bus
```

How should the restaurant connect the eight table buttons to the kitchen display screen?
* **The Naive Way**: Run eight long wires from the dining room to the kitchen, connecting each wire to an individual lightbulb labeled "Table 0" through "Table 7." This requires 8 long cables.
* **The Smart Encoder Way**: Install a simple circuit beneath the dining room floor. When a customer at Table 5 presses their button ($T_5$), the encoder immediately converts the table number 5 into its 3-bit binary code: $101_2$. 

The encoder sends those 3 binary bits down a lightweight 3-wire cable to the kitchen display screen. The kitchen screen receives $101_2$, evaluates $1 \times 4 + 0 \times 2 + 1 \times 1 = 5$, and illuminates the number "5" on its digital display.

Notice what the encoder achieved:
1. **Active Line Compression**: It took 8 physical table wires and squeezed their information down into 3 binary wires.
2. **Exact Identity Mapping**: It mapped Table 0 to $000_2$, Table 1 to $001_2$, Table 5 to $101_2$, and Table 7 to $111_2$.
3. **Resource Efficiency**: The restaurant saved 5 long cables running across the building!

This restaurant table pager is the exact physical analogue of a **Binary Encoder**:
* The table buttons ($T_0 \dots T_7$) are the **One-Hot Inputs** ($I_0 \dots I_7$).
* The 3-wire binary cable is the **Compressed Binary Output Bus** ($Y_2, Y_1, Y_0$).

In digital logic, instead of human waiters, a binary encoder uses an array of simple OR gates acting as digital combining trees that assemble the correct binary bits based on which input line is active.

---

## Mechanics of Binary Encoder Synthesis and Active Line Compression

To master binary encoder design, we must dissect the formal mechanics of its two core primitives:
1. **The Binary Encoder**: How $2^N$ mutually exclusive input lines are mapped into an $N$-bit binary output code using OR-gate trees.
2. **Active Line Compression**: How the mathematical structure of binary numbers allows us to derive minimal Boolean equations by inspecting which output bits must turn ON for each active input index.

---

### Primitive 1: The 4-to-2 Binary Encoder (4:2 Encoder)

The fundamental starting point for encoder synthesis is the 4-to-2 Binary Encoder (4:2 Encoder). It receives four mutually exclusive input lines ($I_0, I_1, I_2, I_3$), performs active line compression, and produces a 2-bit binary output code $Y = (Y_1, Y_0)$.

```text
4-TO-2 BINARY ENCODER FUNCTIONAL BLOCK

 Input Line I0 ───┐ 
 Input Line I1 ───┼───► [ 4:2 Encoder ] ───┬───► Output Bit Y1 (MSB)
 Input Line I2 ───┤                        └───► Output Bit Y0 (LSB)
 Input Line I3 ───┘
```

#### 1. Truth Table Derivation
Let us construct the truth table for a 4-to-2 Binary Encoder under the strict assumption that **exactly one input line is active ($1$) at any given time** (One-Hot input space).

```text
4-TO-2 BINARY ENCODER EXHAUSTIVE TRUTH TABLE

 Input I3 │ Input I2 │ Input I1 │ Input I0 │ Output Y1 (MSB) │ Output Y0 (LSB) │ Binary Code Output
──────────┼──────────┼──────────┼──────────┼─────────────────┼─────────────────┼───────────────────
    0     │    0     │    0     │    1     │        0        │        0        │   00 (Decimal 0)
    0     │    0     │    1     │    0     │        0        │        1        │   01 (Decimal 1)
    0     │    1     │    0     │    0     │        1        │        0        │   10 (Decimal 2)
    1     │    0     │    0     │    0     │        1        │        1        │   11 (Decimal 3)
```

Look at the mapping between the active input line and the binary output $(Y_1, Y_0)$:
* When $I_0 = 1$ (Row 0): Output $Y_1 Y_0 = 00_2$ (binary representation of decimal 0).
* When $I_1 = 1$ (Row 1): Output $Y_1 Y_0 = 01_2$ (binary representation of decimal 1).
* When $I_2 = 1$ (Row 2): Output $Y_1 Y_0 = 10_2$ (binary representation of decimal 2).
* When $I_3 = 1$ (Row 3): Output $Y_1 Y_0 = 11_2$ (binary representation of decimal 3).

---

### Primitive 2: Active Line Compression Mechanics

How do we convert this truth table into physical logic gates? We examine each output bit column ($Y_1$ and $Y_0$) independently and ask a simple question: **Which input lines cause this output bit to equal $1$?**

#### 1. Deriving Output Bit $Y_0$ (Least Significant Bit - LSB)
Inspect the $Y_0$ column in the truth table:
* $Y_0 = 1$ when $I_1 = 1$ (Row 1, code $01_2$).
* $Y_0 = 1$ when $I_3 = 1$ (Row 3, code $11_2$).

Since $I_1$ and $I_3$ are mutually exclusive, $Y_0$ must turn ON if $I_1$ is active OR if $I_3$ is active.
Therefore, the Boolean equation for output $Y_0$ is simply a 2-input **OR gate**:

$$
Y_0 = I_1 + I_3
$$

Where:
* $Y_0$ is the LSB of the binary output code.
* $I_1$ is the input line for decimal index 1.
* $I_3$ is the input line for decimal index 3.
* $+$ represents the logical OR operation.

#### 2. Deriving Output Bit $Y_1$ (Most Significant Bit - MSB)
Inspect the $Y_1$ column in the truth table:
* $Y_1 = 1$ when $I_2 = 1$ (Row 2, code $10_2$).
* $Y_1 = 1$ when $I_3 = 1$ (Row 3, code $11_2$).

Therefore, $Y_1$ must turn ON if $I_2$ is active OR if $I_3$ is active.
The Boolean equation for output $Y_1$ is a 2-input **OR gate**:

$$
Y_1 = I_2 + I_3
$$

Where:
* $Y_1$ is the MSB of the binary output code.
* $I_2$ is the input line for decimal index 2.
* $I_3$ is the input line for decimal index 3.

Notice something extraordinary: **A binary encoder does not require AND gates or NOT gates to synthesize its basic compression logic!** It is built entirely using simple OR gates!

```text
4-TO-2 BINARY ENCODER GATE SCHEMATIC

 Input Line I0 ─── (Not needed for Y1 or Y0 equations!)
 
 Input Line I1 ───────────────►┌──────┐ 
                               │ OR 0 ├──► Output Y0 (LSB)
 Input Line I3 ──┬────────────►└──────┘ 
                 │             ┌──────┐
                 └────────────►│ OR 1 ├──► Output Y1 (MSB)
 Input Line I2 ───────────────►└──────┘ 
```

Why is input line $I_0$ not connected to any OR gate?
Because when $I_0 = 1$, all other inputs ($I_1, I_2, I_3$) are $0$. Both OR gates receive $0 + 0 = 0$, automatically outputting $Y_1 Y_0 = 00_2$ (which is the correct binary code for 0)!

---

## Scaling to 8-to-3 Binary Encoders (8:3 Encoder)

When a system scales up to compress 8 input lines ($I_0$ through $I_7$) down to a 3-bit binary code $Y = (Y_2, Y_1, Y_0)$, how do we construct the OR-gate combining trees?

The required number of output bits $N$ for a $2^N$-input encoder is:

$$
N = \log_2(\text{Number of Inputs}) = \log_2(8) = 3 \text{ output bits}
$$

```text
8-TO-3 BINARY ENCODER TRUTH TABLE

 Active Input Line │ Binary Code Y2 Y1 Y0 │ Minterm Output Mapping
───────────────────┼──────────────────────┼──────────────────────────
      I0 = 1       │         000          │ Y2=0, Y1=0, Y0=0
      I1 = 1       │         001          │ Y2=0, Y1=0, Y0=1
      I2 = 1       │         010          │ Y2=0, Y1=1, Y0=0
      I3 = 1       │         011          │ Y2=0, Y1=1, Y0=1
      I4 = 1       │         100          │ Y2=1, Y1=0, Y0=0
      I5 = 1       │         101          │ Y2=1, Y1=0, Y0=1
      I6 = 1       │         110          │ Y2=1, Y1=1, Y0=0
      I7 = 1       │         111          │ Y2=1, Y1=1, Y0=1
```

To derive the Boolean equations for each output bit, we list every input index $k$ whose binary representation has a $1$ at that specific bit position:

1. **For Bit $Y_0$ (LSB, position $2^0 = 1$)**:
   The binary representation has a $1$ at $Y_0$ for decimal numbers 1, 3, 5, and 7 ($001_2, 011_2, 101_2, 111_2$).
   $$Y_0 = I_1 + I_3 + I_5 + I_7$$

2. **For Bit $Y_1$ (Middle Bit, position $2^1 = 2$)**:
   The binary representation has a $1$ at $Y_1$ for decimal numbers 2, 3, 6, and 7 ($010_2, 011_2, 110_2, 111_2$).
   $$Y_1 = I_2 + I_3 + I_6 + I_7$$

3. **For Bit $Y_2$ (MSB, position $2^2 = 4$)**:
   The binary representation has a $1$ at $Y_2$ for decimal numbers 4, 5, 6, and 7 ($100_2, 101_2, 110_2, 111_2$).
   $$Y_2 = I_4 + I_5 + I_6 + I_7$$

Where:
* $Y_2, Y_1, Y_0$ are the 3 binary output lines.
* $I_0 \dots I_7$ are the 8 One-Hot data input lines.

```text
8-TO-3 BINARY ENCODER OR-TREE ARCHITECTURE

 Inputs I1, I3, I5, I7 ────────► [ 4-Input OR Gate 0 ] ──► Output Y0 (LSB)
 Inputs I2, I3, I6, I7 ────────► [ 4-Input OR Gate 1 ] ──► Output Y1
 Inputs I4, I5, I6, I7 ────────► [ 4-Input OR Gate 2 ] ──► Output Y2 (MSB)
```

### General Formula for any $2^N$-to-$N$ Binary Encoder Output Bit

In general, for a $2^N$-to-$N$ binary encoder, the Boolean equation for output bit $Y_m$ (where $0 \le m \le N-1$) is the logical OR sum of all input lines $I_k$ whose index $k$ contains a $1$ at bit position $m$ in its binary expansion:

$$
Y_m = \sum_{k \in S_m} I_k
$$

Where:
* $Y_m$ is the $m$-th binary output bit.
* $S_m = \{ k \in \{0, 1, \dots, 2^N-1\} \mid \text{Bit } m \text{ of binary}(k) = 1 \}$.
* $\sum$ represents the logical OR sum.

---

## Critical Real-World Limitations of Standard Binary Encoders

While standard OR-gate binary encoders provide clean active line compression for idealized theoretical models, real-world hardware engineering exposes **two severe flaws** that make simple binary encoders dangerous if used without modification in physical systems.

---

### Flaw 1: The All-Zero Ambiguity Problem

Consider what happens in a 4-to-2 binary encoder when **no input button is pressed at all** ($I_0 = 0, I_1 = 0, I_2 = 0, I_3 = 0$).

Evaluating the OR-gate equations:
* $Y_0 = I_1 + I_3 = 0 + 0 = 0$
* $Y_1 = I_2 + I_3 = 0 + 0 = 0$
* Output code: $Y_1 Y_0 = 00_2$ (decimal 0).

Now consider what happens when input button $I_0$ **IS actively pressed** ($I_0 = 1, I_1 = 0, I_2 = 0, I_3 = 0$).

Evaluating the OR-gate equations:
* $Y_0 = I_1 + I_3 = 0 + 0 = 0$
* $Y_1 = I_2 + I_3 = 0 + 0 = 0$
* Output code: $Y_1 Y_0 = 00_2$ (decimal 0).

```text
THE ALL-ZERO AMBIGUITY PROBLEM

 Scenario A: NO Buttons Pressed (All Inputs = 0)
 Inputs: (I3=0, I2=0, I1=0, I0=0) ──► Output Code: 00_2 (Decimal 0)

 Scenario B: Button I0 Pressed (I0 = 1)
 Inputs: (I3=0, I2=0, I1=0, I0=1) ──► Output Code: 00_2 (Decimal 0)
                                            │
                                            ▼
                       AMBIGUOUS! Processor cannot distinguish
                       between "Button 0 Pressed" and "No Buttons Pressed"!
```

This is a major architectural flaw! The receiving microprocessor looking at binary code $00_2$ cannot distinguish whether the operator actively pressed Button $I_0$, or whether no buttons are being pressed at all!

#### The Hardware Fix: The Valid Output Flag ($V$)
To resolve the All-Zero Ambiguity, real-world encoders add an extra output pin called the **Valid Output Flag ($V$)**.

The Valid Flag $V$ is synthesized by taking the logical OR of ALL input lines:

$$
V = I_0 + I_1 + I_2 + I_3 + \dots + I_{2^N-1}
$$

Where:
* $V = 1$ if **at least one** input line is active (data code $Y$ is valid).
* $V = 0$ if **all** input lines are inactive (no buttons pressed, data code $Y$ should be ignored).

```text
4:2 ENCODER WITH VALID OUTPUT FLAG

 Inputs I0, I1, I2, I3 ──► [ 4-Input OR Gate ] ──► Valid Flag V
                            (V = 1 when ANY button is pressed)
```

With the Valid Flag $V$:
* No buttons pressed $\implies Y = 00_2, V = 0$ (Ignore code).
* Button $I_0$ pressed $\implies Y = 00_2, V = 1$ (Valid press on Button 0!).

---

### Flaw 2: Multiple Active Input Contention and Garbage Code Generation

The second, even more dangerous flaw occurs when an operator accidentally presses **two buttons at the same time** (for example, pressing $I_1$ and $I_2$ simultaneously).

Standard binary encoders assume a strict One-Hot input space. If two inputs fire together ($I_1 = 1$ AND $I_2 = 1$), what output does a standard OR-gate encoder produce?

Let us evaluate the equations for a 4-to-2 encoder when $I_1 = 1$ and $I_2 = 1$:
* $Y_0 = I_1 + I_3 = 1 + 0 = 1$
* $Y_1 = I_2 + I_3 = 1 + 0 = 1$
* Output code: $Y_1 Y_0 = 11_2$ (decimal 3!).

```text
MULTIPLE INPUT CONTENTION CORRUPTS OUTPUT CODE

 Pressed Inputs: Button I1 (01_2) AND Button I2 (10_2)
                        │
                        ▼
   [ Standard OR-Gate Binary Encoder ]
                        │
                        ▼
            Corrupted Output: 11_2 (Decimal 3 = Button I3!)
            (Neither Button 1 nor Button 2 was selected!)
```

Look at what happened! The operator pressed Button 1 ($01_2$) and Button 2 ($10_2$). The simple OR-gate encoder produced binary code $11_2$, telling the system that the operator pressed **Button 3 ($I_3$)**!

In a safety-critical system (such as a crane controller or medical equipment), generating a false command for Button 3 when Buttons 1 and 2 are pressed simultaneously can cause severe accidents.

This fundamental limitation motivates the invention of the **Priority Encoder**, a more sophisticated circuit that resolves multiple active inputs by assigning strict priority rankings to higher-indexed input lines.

---

## Engineering Reality: Active-Low Inputs and Active-Low Output Busses

While theoretical diagrams depict encoders with active-high inputs ($1$ when pressed), real-world physical keypads and industrial push-buttons are built using **Active-Low Inputs** ($\overline{I_k}$).

### Why Physical Keypads Use Active-Low Switches

When a physical push-button is at rest, it is held open by a spring. To ensure a clean voltage level when open, the switch terminal is connected through a **Pull-Up Resistor** to $+5\text{ V}$ ($V_{DD}$). When an operator presses the button, the switch connects the line directly to ground ($0\text{ V}$).

```text
PHYSICAL ACTIVE-LOW PUSH-BUTTON SWITCH

                    +5V (VDD)
                       │
                      [R] Pull-Up Resistor (10 kΩ)
                       │
 Push-Button Terminal ─┴──────────────────► Input Line I_k' to Encoder
                       │                   (1 at rest, 0 when pressed)
                       \ Switch
                       │
                      GND (0V)
```

Therefore, in real-world hardware:
* Button at rest (Not pressed) $\implies$ Line carries $+5\text{ V}$ (**Logic 1**).
* Button pressed $\implies$ Line connects to ground (**Logic 0**).

To accommodate active-low switches, commercial encoder ICs (such as the 74LVC148 8-to-3 encoder) use **NAND gate trees** instead of OR gate trees, producing active-low output codes ($\overline{Y_2}, \overline{Y_1}, \overline{Y_0}$).

```text
COMMERCIAL ACTIVE-LOW ENCODER CONVENTION

 Input Switch State    │ Active-Low Input Line │ Active-Low Binary Output
───────────────────────┼───────────────────────┼───────────────────────────
 Button at Rest        │       Line = 1        │     Output = 1 (Inactive)
 Button Pressed        │       Line = 0        │     Output = 0 (Active)
```

---

## Solved Industrial Engineering Exercise: Avionics Flight Control Command Compressor

To solidify your complete mastery of binary encoders, active line compression, OR-gate tree synthesis, All-Zero ambiguity resolution, and input contention analysis, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An aerospace contractor is designing the cockpit control interface for a jet fighter's flight management system. The cockpit console has four mutually exclusive mode command switches:

1. **Cruise Mode Switch ($I_0$)**: Selects normal cruising flight.
2. **Climb Mode Switch ($I_1$)**: Selects rapid altitude climb.
3. **Descent Mode Switch ($I_2$)**: Selects controlled descent.
4. **Emergency Evasion Switch ($I_3$)**: Selects automated evasive maneuvers.

```text
COCKPIT MODE COMMAND INTERFACE

 Mode Switches (I0, I1, I2, I3) ──► [ Mode Encoder Module ] ──┬──► Mode Bus (Y1, Y0)
                                                              └──► Valid Flag (V)
```

Under normal flight operations, the pilot selects exactly one mode at a time. The cockpit module must compress these four individual switch lines down to a 2-bit binary **Mode Bus** $Y = (Y_1, Y_0)$ sent to the main flight computer, along with a **Valid Command Flag ($V$)**.

#### System Control Requirements

1. The system must map mode commands to binary codes as follows:
   * $I_0 = 1 \implies Y_1 Y_0 = 00_2$ (Cruise)
   * $I_1 = 1 \implies Y_1 Y_0 = 01_2$ (Climb)
   * $I_2 = 1 \implies Y_1 Y_0 = 10_2$ (Descent)
   * $I_3 = 1 \implies Y_1 Y_0 = 11_2$ (Emergency Evasion)
2. The Valid Flag $V$ must equal $1$ whenever any mode switch is active ($1$), and equal $0$ when no switches are active ($0$).
3. The circuit must be synthesized using the minimum number of basic logic gates.

#### Your Objective

1. Construct the complete 16-row truth table for the 4-to-2 encoder with inputs $(I_3, I_2, I_1, I_0)$ and outputs $(Y_1, Y_0, V)$.
2. Derive the minimal Boolean equations for $Y_1, Y_0,$ and $V$ using active line compression rules.
3. Analyze what happens if an electrical glitch simultaneously activates $I_1 = 1$ and $I_2 = 1$, calculating the resulting corrupted output code.
4. Draw the gate-level schematic and calculate the total physical gate and pin count.
5. Verify system operation against three flight management scenarios.

---

### Step-by-Step Derivation

#### Step 1: Construct the Exhaustive 16-Row Truth Table

A 4-input system has $2^4 = 16$ possible input combinations. Under standard One-Hot operation, only 4 rows correspond to valid single-switch activations. Rows with 0 active inputs or multiple active inputs must be evaluated systematically.

```text
EXHAUSTIVE 4-TO-2 ENCODER TRUTH TABLE WITH VALID FLAG

 Row │ I3 │ I2 │ I1 │ I0 │ Output Y1 │ Output Y0 │ Valid Flag V │ System Operating Status
─────┼────┼────┼────┼────┼───────────┼───────────┼──────────────┼───────────────────────────────
  0  │ 0  │ 0  │ 0  │ 0  │     0     │     0     │      0       │ NO SWITCHES PRESSED (V = 0)
  1  │ 0  │ 0  │ 0  │ 1  │     0     │     0     │      1       │ Mode 0 (Cruise): Code 00
  2  │ 0  │ 0  │ 1  │ 0  │     0     │     1     │      1       │ Mode 1 (Climb): Code 01
  3  │ 0  │ 0  │ 1  │ 1  │     0     │     1     │      1       │ CONTENTION! I1 and I0 active
  4  │ 0  │ 1  │ 0  │ 0  │     1     │     0     │      1       │ Mode 2 (Descent): Code 10
  5  │ 0  │ 1  │ 0  │ 1  │     1     │     0     │      1       │ CONTENTION! I2 and I0 active
  6  │ 0  │ 1  │ 1  │ 0  │     1     │     1     │      1       │ CONTENTION! I2 and I1 active
  7  │ 0  │ 1  │ 1  │ 1  │     1     │     1     │      1       │ CONTENTION! I2, I1, I0 active
  8  │ 1  │ 0  │ 0  │ 0  │     1     │     1     │      1       │ Mode 3 (Emergency): Code 11
  9  │ 1  │ 0  │ 0  │ 1  │     1     │     1     │      1       │ CONTENTION! I3 and I0 active
 10  │ 1  │ 0  │ 1  │ 0  │     1     │     1     │      1       │ CONTENTION! I3 and I1 active
 11  │ 1  │ 0  │ 1  │ 1  │     1     │     1     │      1       │ CONTENTION! Multi-input
 12  │ 1  │ 1  │ 0  │ 0  │     1     │     1     │      1       │ CONTENTION! Multi-input
 13  │ 1  │ 1  │ 0  │ 1  │     1     │     1     │      1       │ CONTENTION! Multi-input
 14  │ 1  │ 1  │ 1  │ 0  │     1     │     1     │      1       │ CONTENTION! Multi-input
 15  │ 1  │ 1  │ 1  │ 1  │     1     │     1     │      1       │ CONTENTION! All inputs active
```

---

#### Step 2: Derive Minimal Boolean Equations via Active Line Compression

Using active line compression rules on the valid One-Hot rows (Rows 1, 2, 4, 8):

##### 1. Equation for LSB Output $Y_0$:
Bit $Y_0$ must equal $1$ when $I_1 = 1$ (Climb, code $01_2$) OR when $I_3 = 1$ (Emergency, code $11_2$).

$$
Y_0 = I_1 + I_3
$$

##### 2. Equation for MSB Output $Y_1$:
Bit $Y_1$ must equal $1$ when $I_2 = 1$ (Descent, code $10_2$) OR when $I_3 = 1$ (Emergency, code $11_2$).

$$
Y_1 = I_2 + I_3
$$

##### 3. Equation for Valid Flag $V$:
Flag $V$ must equal $1$ if ANY switch ($I_0, I_1, I_2,$ or $I_3$) is active ($1$).

$$
V = I_0 + I_1 + I_2 + I_3
$$

Where:
* $Y_1, Y_0$ are the 2 bits of the flight mode bus.
* $V$ is the valid command indicator flag.
* $I_0, I_1, I_2, I_3$ are the four cockpit mode switch lines.

---

#### Step 3: Contention Analysis for Simultaneous Activation ($I_1 = 1$ and $I_2 = 1$)

Suppose a cockpit electrical fault causes Climb Switch $I_1$ and Descent Switch $I_2$ to fire simultaneously ($I_1 = 1, I_2 = 1$, Row 6 in truth table).

Evaluating our active line compression equations:
* $Y_0 = I_1 + I_3 = 1 + 0 = 1$
* $Y_1 = I_2 + I_3 = 1 + 0 = 1$
* $V = I_0 + I_1 + I_2 + I_3 = 0 + 1 + 1 + 0 = 1$

Resulting Output: $Y_1 Y_0 = 11_2$ (Decimal 3 = Emergency Evasion Mode!).

```text
CONTENTION FAULT DIAGNOSIS

 Simultaneous Press:  Climb (I1 = 01_2) AND Descent (I2 = 10_2)
                                   │
                                   ▼
                  [ Standard OR-Gate Binary Encoder ]
                                   │
                                   ▼
         Corrupted Output: 11_2 (Emergency Evasion Mode!)
         DANGEROUS MISINTERPRETATION! Flight computer enters
         emergency maneuvers when pilot requested climb/descent!
```

This quantitative proof shows why standard binary encoders cannot handle multiple active inputs and highlights the critical need for Priority Encoders in flight control hardware.

---

#### Step 4: Gate Schematic and Component Summary

We construct the complete encoder circuit using three OR gates:
* One 2-input OR gate for $Y_0 = I_1 + I_3$.
* One 2-input OR gate for $Y_1 = I_2 + I_3$.
* One 4-input OR gate for $V = I_0 + I_1 + I_2 + I_3$.

```text
4-TO-2 BINARY ENCODER WITH VALID FLAG SCHEMATIC

I1 ──┬─────────────────►┌──────┐
     │                  │ OR 0 ├────────► Output Y0 (LSB)
I3 ──┼─┬───────────────►└──────┘
     │ │
I2 ──┼─┼─┬─────────────►┌──────┐
     │ │ │              │ OR 1 ├────────► Output Y1 (MSB)
     │ └─┼─────────────►└──────┘
     │   │
I0 ──┼───┼───┬─────────►┌────────────┐
     └───┼───┼─────────►│            │
         └───┼─────────►│ 4-INPUT OR ├──► Valid Flag V
             └─────────►│            │
                        └────────────┘
```

```text
HARDWARE RESOURCE SUMMARY
* 2-Input OR Gates: 2
* 4-Input OR Gates: 1
* Total Physical Gates: 3 gates
* Total Input Pins: 8 pins
```

---

### Sanity Check and Verification

Let us verify our avionics encoder equations against three operational cockpit scenarios.

#### Scenario A: Pilot Engages Cruise Mode ($I_0 = 1$, all others $0$)
* **Inputs**: $I_0 = 1, I_1 = 0, I_2 = 0, I_3 = 0$.
* **Formula Evaluation**:
  * $Y_0 = I_1 + I_3 = 0 + 0 = 0$
  * $Y_1 = I_2 + I_3 = 0 + 0 = 0$
  * $V = I_0 + I_1 + I_2 + I_3 = 1 + 0 + 0 + 0 = 1$
* **Results**: $Y_1 Y_0 = 00_2$ (Cruise Code), $V = 1$ (Valid!). **CRUISE MODE VERIFIED!**

#### Scenario B: Pilot Engages Emergency Evasion ($I_3 = 1$, all others $0$)
* **Inputs**: $I_0 = 0, I_1 = 0, I_2 = 0, I_3 = 1$.
* **Formula Evaluation**:
  * $Y_0 = I_1 + I_3 = 0 + 1 = 1$
  * $Y_1 = I_2 + I_3 = 0 + 1 = 1$
  * $V = I_0 + I_1 + I_2 + I_3 = 0 + 0 + 0 + 1 = 1$
* **Results**: $Y_1 Y_0 = 11_2$ (Emergency Code), $V = 1$ (Valid!). **EMERGENCY MODE VERIFIED!**

#### Scenario C: Cockpit Console Disconnected / Rest State (All inputs $0$)
* **Inputs**: $I_0 = 0, I_1 = 0, I_2 = 0, I_3 = 0$.
* **Formula Evaluation**:
  * $Y_0 = 0 + 0 = 0$
  * $Y_1 = 0 + 0 = 0$
  * $V = 0 + 0 + 0 + 0 = 0$
* **Results**: $Y_1 Y_0 = 00_2$, BUT $V = 0$ (Invalid Command!). Flight computer ignores code $00_2$. **ALL-ZERO AMBIGUITY RESOLVED!**

All scenarios evaluate with 100% mathematical precision. The avionics binary encoder is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Binary Encoder**: A combinational logic module that performs the functional inverse of a decoder, compressing $2^N$ mutually exclusive active input lines into an $N$-bit binary output code using OR-gate combining trees.
* **Active Line Compression**: The logical technique of mapping each active input line index $k$ to its corresponding $N$-bit binary representation $(Y_{N-1}, \dots, Y_0)$ by synthesizing OR gates for each output bit position $m$ using all input lines whose index $k$ contains a $1$ at bit position $m$.