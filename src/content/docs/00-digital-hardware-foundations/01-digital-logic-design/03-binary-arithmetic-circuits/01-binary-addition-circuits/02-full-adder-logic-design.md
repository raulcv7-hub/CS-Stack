---
title: "Full Adder Logic Synthesis and Carry Propagation Architecture"
---

# Full Adder Logic Synthesis and Carry Propagation Architecture

## The Multi-Bit Addition Wall and the Missing Carry Input

When building arithmetic circuits to add multi-bit binary numbers—such as adding two 8-bit integers, 32-bit memory addresses, or 64-bit floating-point values—a fundamental structural boundary is reached immediately after the least significant bit (LSB).

A basic half adder accepts two 1-bit binary inputs ($A$ and $B$) and calculates a local sum bit ($S$) alongside a carry-out bit ($C_{\text{out}}$). This works perfectly for the very first column on the far right (Bit 0), because there is no prior column to generate an incoming carry bit. 

However, as soon as you step one position to the left (Bit 1), the math changes completely. When Bit 0 generates a carry-out ($C_{\text{out}} = 1$), Bit 1 must add **three binary digits simultaneously**:
1. The operand bit $A_1$.
2. The operand bit $B_1$.
3. The incoming carry bit $C_{\text{in}}$ produced by Bit 0!

```text
THE MULTI-BIT CARRY CASCADE PROBLEM

 Column Index:        Bit 2        Bit 1        Bit 0 (LSB)
 Incoming Carry:      Cin2         Cin1         (No Carry-In)
 Operand Bit A :       A2           A1           A0
 Operand Bit B :     + B2         + B1         + B0
                     ──────       ──────       ──────
 Must Add:            3 Bits!      3 Bits!      2 Bits Only!
```

If you attempt to use a simple half adder for Bit 1, you face an immediate physical impossibility. A half adder possesses only two input terminals. It has nowhere to plug in the incoming carry bit $C_{\text{in}}$. If you ignore $C_{\text{in}}$, your arithmetic circuit drops carried values, producing flatly incorrect mathematical results across every column beyond Bit 0.

If you attempt to feed $C_{\text{in}}$ into a second half adder without proper carry combination logic, you risk creating internal signal race conditions or generating multiple conflicting carry outputs that corrupt the higher-order columns.

To add multi-bit binary numbers without data corruption, digital hardware requires a complete 3-input, 2-output single-bit arithmetic module: the **Full Adder**. The Full Adder integrates **3-variable XOR sum logic** with dedicated **Carry Propagation Logic** ($C_{\text{out}} = A \cdot B + C_{\text{in}} \cdot (A \oplus B)$).

By mastering the Full Adder, we unlock the foundational building block used to chain single-bit arithmetic stages together into wide, high-speed adders capable of processing 64-bit numbers in modern microprocessors.

---

## The Manual Multi-Column Addition: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of why a Full Adder must accept three inputs, let us leave electronic circuits behind and recall how you perform multi-digit addition on paper using pencil and paper.

Suppose you want to add two 3-digit decimal numbers by hand: $578 + 265$.

You stack the numbers vertically and work from right to left, one column at a time:

```text
MANUAL DECIMAL ADDITION COLUMN BY COLUMN

 Column 2 (Hundreds)   Column 1 (Tens)     Column 0 (Units)
       (Carried 1)        (Carried 1)        (No Carry)
            1                  1
            5                  7                  8
          + 2                + 6                + 5
          ───                ───                ───
            8                  4                  3
```

Let us trace your exact thought process for each column:

1. **Column 0 (Units Column)**: You add $8 + 5 = 13$.
   * You write down $3$ at the bottom of Column 0. This is the **Local Sum ($S_0$)**.
   * You write a small $1$ above Column 1. This is the **Carry-Out ($C_{\text{out}0}$)**.
   * Notice that for Column 0, you only added **two numbers** ($8$ and $5$). A half-adder equivalent works here!

2. **Column 1 (Tens Column)**: You move to the next column.
   * Look at what you must add in Column 1: You must add $7$ (from the first number), $6$ (from the second number), **AND the carried $1$ sitting at the top of the column!**
   * You perform a 3-number sum: $1 + 7 + 6 = 14$.
   * You write down $4$ at the bottom of Column 1 (Local Sum $S_1 = 4$).
   * You carry a $1$ over to Column 2 (Carry-Out $C_{\text{out}1} = 1$).

What would happen if you forgot to add the carried $1$ in Column 1? You would calculate $7 + 6 = 13$, write down $3$, and get a final answer of $733$ instead of $843$! The entire addition would be ruined.

The **Full Adder** is the digital circuit equivalent of your brain when you work on Column 1 or Column 2. It has a special "top-of-the-column" input terminal—the **Carry-In ($C_{\text{in}}$)**—specifically designed to catch the carried $1$ from the column on its right, ensuring that no carried value is ever lost.

---

## Mechanics of Full Adder Logic Synthesis

To master the design of the Full Adder, we must dissect the formal mechanics of its two core output channels:
1. **The 3-Input Sum ($S$)**: Synthesized using a 3-variable **XOR Parity Tree** ($S = A \oplus B \oplus C_{\text{in}}$).
2. **The Carry Propagation Logic ($C_{\text{out}}$)**: Synthesized using majority logic ($C_{\text{out}} = A \cdot B + C_{\text{in}} \cdot (A \oplus B)$).

---

### Primitive 1: The Full Adder Architecture and State Space

A **Full Adder** is a 3-input, 2-output combinational arithmetic module. It accepts three single-bit binary inputs:
* **Operand Bit $A$**: The $k$-th bit of the first binary number.
* **Operand Bit $B$**: The $k$-th bit of the second binary number.
* **Carry-In ($C_{\text{in}}$)**: The carry bit generated by the preceding $(k-1)$-th arithmetic stage.

It produces two single-bit binary outputs:
* **Sum ($S$)**: The local $k$-th sum bit (weight $2^0 = 1$ in the local column).
* **Carry-Out ($C_{\text{out}}$)**: The outgoing carry bit sent to the $(k+1)$-th arithmetic stage (weight $2^1 = 2$).

```text
FULL ADDER FUNCTIONAL BLOCK DIAGRAM

 Operand Bit A ────┐
 Operand Bit B ────┼───► [ FULL ADDER ] ──┬──► Output Sum S
 Carry-In Cin ─────┘                      └──► Output Carry-Out Cout
```

#### 1. Exhaustive 3-Input Truth Table Derivation

Because the Full Adder has $N = 3$ binary inputs ($A, B, C_{\text{in}}$), its input state space contains $2^3 = 8$ unique rows.

Let us evaluate the binary arithmetic sum $A + B + C_{\text{in}}$ for all 8 rows from first principles:

1. **Row 0 ($000_2$)**: $0 + 0 + 0 = 0_{10} = 00_2 \implies S = 0, C_{\text{out}} = 0$.
2. **Row 1 ($001_2$)**: $0 + 0 + 1 = 1_{10} = 01_2 \implies S = 1, C_{\text{out}} = 0$.
3. **Row 2 ($010_2$)**: $0 + 1 + 0 = 1_{10} = 01_2 \implies S = 1, C_{\text{out}} = 0$.
4. **Row 3 ($011_2$)**: $0 + 1 + 1 = 2_{10} = 10_2 \implies S = 0, C_{\text{out}} = 1$.
5. **Row 4 ($100_2$)**: $1 + 0 + 0 = 1_{10} = 01_2 \implies S = 1, C_{\text{out}} = 0$.
6. **Row 5 ($101_2$)**: $1 + 0 + 1 = 2_{10} = 10_2 \implies S = 0, C_{\text{out}} = 1$.
7. **Row 6 ($110_2$)**: $1 + 1 + 0 = 2_{10} = 10_2 \implies S = 0, C_{\text{out}} = 1$.
8. **Row 7 ($111_2$)**: $1 + 1 + 1 = 3_{10} = 11_2 \implies S = 1, C_{\text{out}} = 1$.

We assemble these evaluations into the master Full Adder truth table:

```text
FULL ADDER EXHAUSTIVE TRUTH TABLE

 Row │ Input A │ Input B │ Carry-In Cin │ Arithmetic Sum │ Sum (S) │ Carry-Out (Cout)
─────┼─────────┼─────────┼──────────────┼────────────────┼─────────┼──────────────────
  0  │    0    │    0    │      0       │ 0 + 0 + 0 = 0  │    0    │        0         
  1  │    0    │    0    │      1       │ 0 + 0 + 1 = 1  │    1    │        0         
  2  │    0    │    1    │      0       │ 0 + 1 + 0 = 1  │    1    │        0         
  3  │    0    │    1    │      1       │ 0 + 1 + 1 = 2  │    0    │        1         
  4  │    1    │    0    │      0       │ 1 + 0 + 0 = 1  │    1    │        0         
  5  │    1    │    0    │      1       │ 1 + 0 + 1 = 2  │    0    │        1         
  6  │    1    │    1    │      0       │ 1 + 1 + 0 = 2  │    0    │        1         
  7  │    1    │    1    │      1       │ 1 + 1 + 1 = 3  │    1    │        1         
```

Look closely at the output columns:
* **Sum ($S$)** is $1$ whenever the total number of active inputs ($A, B, C_{\text{in}}$) is **ODD** (1 or 3 active inputs).
* **Carry-Out ($C_{\text{out}}$)** is $1$ whenever **at least two** inputs are active ($2$ or $3$ active inputs). This is a **Majority Function**!

---

### Primitive 2: Boolean Derivation of 3-Variable Sum Logic

Let us extract the Boolean expression for Sum $S$ from the truth table. $S = 1$ at Rows 1, 2, 4, and 7.

Writing the canonical Sum of Products (SOP) expression:

$$
S = (\overline{A} \cdot \overline{B} \cdot C_{\text{in}}) + (\overline{A} \cdot B \cdot \overline{C_{\text{in}}}) + (A \cdot \overline{B} \cdot \overline{C_{\text{in}}}) + (A \cdot B \cdot C_{\text{in}})
$$

Where:
* $S$ is the single-bit local sum output.
* $A, B, C_{\text{in}}$ are the three binary inputs.
* $\overline{A}, \overline{B}, \overline{C_{\text{in}}}$ are the complemented binary inputs.

Let us factor this expression step by step to reveal its fundamental operator:

Factor $\overline{A}$ out of the first two terms, and $A$ out of the last two terms:

$$
S = \overline{A} \cdot \left[ (\overline{B} \cdot C_{\text{in}}) + (B \cdot \overline{C_{\text{in}}}) \right] + A \cdot \left[ (\overline{B} \cdot \overline{C_{\text{in}}}) + (B \cdot C_{\text{in}}) \right]
$$

Recognize the expressions inside the brackets:
* $(\overline{B} \cdot C_{\text{in}}) + (B \cdot \overline{C_{\text{in}}}) = B \oplus C_{\text{in}}$ (XOR function).
* $(\overline{B} \cdot \overline{C_{\text{in}}}) + (B \cdot C_{\text{in}}) = \overline{B \oplus C_{\text{in}}}$ (XNOR function).

Substituting these terms back into the main equation:

$$
S = \overline{A} \cdot (B \oplus C_{\text{in}}) + A \cdot \overline{(B \oplus C_{\text{in}})}
$$

Let $X = (B \oplus C_{\text{in}})$. The equation simplifies to:

$$
S = (\overline{A} \cdot X) + (A \cdot \overline{X}) = A \oplus X
$$

Substituting $X = B \oplus C_{\text{in}}$ back in:

$$
S = A \oplus B \oplus C_{\text{in}}
$$

Look at this remarkably clean result! The 3-input Sum $S$ of a Full Adder is simply a **3-variable XOR tree**. It calculates the 3-bit odd parity over inputs $A, B,$ and $C_{\text{in}}$.

```text
3-VARIABLE XOR SUM TREE

 Input A ──┐
           ├──► [ XOR Gate 1 ] ──► (A (+) B) ──┐
 Input B ──┘                                   ├──► [ XOR Gate 2 ] ──► Sum S
                                               │                      (A (+) B (+) Cin)
 Input Cin ────────────────────────────────────┘
```

---

### Primitive 3: Carry Propagation Logic Mechanics

Now let us examine the Carry-Out output ($C_{\text{out}}$). From the truth table, $C_{\text{out}} = 1$ at Rows 3, 5, 6, and 7.

Writing the canonical Sum of Products (SOP) expression for $C_{\text{out}}$:

$$
C_{\text{out}} = (\overline{A} \cdot B \cdot C_{\text{in}}) + (A \cdot \overline{B} \cdot C_{\text{in}}) + (A \cdot B \cdot \overline{C_{\text{in}}}) + (A \cdot B \cdot C_{\text{in}})
$$

#### Method 1: Canonical Majority Expansion
We can simplify $C_{\text{out}}$ by using the Boolean identity $X + X = X$ to duplicate the term $(A \cdot B \cdot C_{\text{in}})$ three times, pairing it with each of the other three terms:

$$
C_{\text{out}} = [(\overline{A} \cdot B \cdot C_{\text{in}}) + (A \cdot B \cdot C_{\text{in}})] + [(A \cdot \overline{B} \cdot C_{\text{in}}) + (A \cdot B \cdot C_{\text{in}})] + [(A \cdot B \cdot \overline{C_{\text{in}}}) + (A \cdot B \cdot C_{\text{in}})]
$$

Factoring common variables out of each pair:

$$
C_{\text{out}} = (B \cdot C_{\text{in}}) \cdot (\overline{A} + A) + (A \cdot C_{\text{in}}) \cdot (\overline{B} + B) + (A \cdot B) \cdot (\overline{C_{\text{in}}} + C_{\text{in}})
$$

Since $(\overline{X} + X) = 1$:

$$
C_{\text{out}} = (A \cdot B) + (B \cdot C_{\text{in}}) + (A \cdot C_{\text{in}})
$$

Where:
* $C_{\text{out}}$ is the carry-out output signal.
* $(A \cdot B)$ is true when both operand bits are $1$.
* $(B \cdot C_{\text{in}})$ is true when $B$ and $C_{\text{in}}$ are $1$.
* $(A \cdot C_{\text{in}})$ is true when $A$ and $C_{\text{in}}$ are $1$.

This equation shows that $C_{\text{out}}$ is a pure **Majority Gate**: it outputs $1$ whenever two or more inputs are $1$.

#### Method 2: Carry Generation ($G$) vs. Carry Propagation ($P$) Expansion
To build a Full Adder using modular sub-blocks, we can factor $C_{\text{out}}$ differently:

Start from the raw SOP expression:
$$C_{\text{out}} = (A \cdot B \cdot \overline{C_{\text{in}}}) + (A \cdot B \cdot C_{\text{in}}) + (\overline{A} \cdot B \cdot C_{\text{in}}) + (A \cdot \overline{B} \cdot C_{\text{in}})$$

Factor $(A \cdot B)$ out of the first two terms, and $C_{\text{in}}$ out of the last two terms:

$$C_{\text{out}} = A \cdot B \cdot (\overline{C_{\text{in}}} + C_{\text{in}}) + C_{\text{in}} \cdot [(\overline{A} \cdot B) + (A \cdot \overline{B})]$$

Recognize that $(\overline{C_{\text{in}}} + C_{\text{in}}) = 1$, and $[(\overline{A} \cdot B) + (A \cdot \overline{B})] = A \oplus B$:

$$
C_{\text{out}} = (A \cdot B) + (C_{\text{in}} \cdot (A \oplus B))
$$

Where:
* $G = A \cdot B$ is the **Carry Generation** term (a carry is locally generated whenever both $A$ and $B$ are $1$, regardless of $C_{\text{in}}$).
* $P = A \oplus B$ is the **Carry Propagation** term (an incoming carry $C_{\text{in}}$ is propagated through to $C_{\text{out}}$ whenever exactly one operand bit is $1$).

$$
C_{\text{out}} = G + (C_{\text{in}} \cdot P)
$$

This $G$ and $P$ formulation is the single most important mathematical identity in digital arithmetic design. It is the core concept used to build high-speed **Carry Lookahead Adders**.

```text
CARRY GENERATION VERSUS CARRY PROPAGATION

 Carry Generation (G = A * B)      : Inputs A=1, B=1 create a NEW carry locally!
                                     Cout = 1 regardless of Cin.

 Carry Propagation (P = A (+) B)   : Inputs A=1, B=0 (or A=0, B=1) PASS Cin through!
                                     If Cin = 1, then Cout = 1.
```

---

## Modular Synthesis: Building a Full Adder from Two Half Adders

Because $S = (A \oplus B) \oplus C_{\text{in}}$ and $C_{\text{out}} = (A \cdot B) + (C_{\text{in}} \cdot (A \oplus B))$, we can construct a complete Full Adder by chaining together **two standard Half Adders and one OR gate**!

```text
MODULAR FULL ADDER SCHEMATIC (2 HALF ADDERS + 1 OR GATE)

A ─────────►┌───────────┐
            │ HALF ADDER│──► S1 ──►┌───────────┐
B ─────────►│     1     │          │ HALF ADDER│──► Final Sum S
            └────┬──────┘          │     2     │    (A ⊕ B ⊕ Cin)
                 │ C1       Cin ──►└────┬──────┘
                 │                      │ C2
                 ▼                      ▼
               ┌──────────────────────────┐
               │         OR GATE          ├───────► Final Carry Cout
               └──────────────────────────┘         (C1 + C2)
```

Let us trace the signals through this modular architecture step by step:

1. **Half Adder 1 (Primary Operand Pre-Stage)**:
   * Inputs: $A$ and $B$.
   * Sum Output: $\text{Sum}_1 = A \oplus B$ (This is the Carry Propagate term $P$).
   * Carry Output: $C_{\text{out}1} = A \cdot B$ (This is the Carry Generate term $G$).

2. **Half Adder 2 (Carry Addition Stage)**:
   * Inputs: $\text{Sum}_1$ ($A \oplus B$) and incoming carry $C_{\text{in}}$.
   * Sum Output: $S = \text{Sum}_1 \oplus C_{\text{in}} = (A \oplus B) \oplus C_{\text{in}}$. (**Final Sum $S$ is complete!**)
   * Carry Output: $C_{\text{out}2} = \text{Sum}_1 \cdot C_{\text{in}} = (A \oplus B) \cdot C_{\text{in}}$.

3. **Output OR Gate (Carry Combiner Stage)**:
   * Inputs: $C_{\text{out}1}$ ($G$) and $C_{\text{out}2}$ ($P \cdot C_{\text{in}}$).
   * Final Output: $C_{\text{out}} = C_{\text{out}1} + C_{\text{out}2} = (A \cdot B) + (C_{\text{in}} \cdot (A \oplus B))$. (**Final Carry-Out $C_{\text{out}}$ is complete!**)

### Why Can We Use a Simple OR Gate to Combine Carries?
A student might ask: *"Can both $C_{\text{out}1}$ and $C_{\text{out}2}$ be equal to $1$ at the same time? Should we use an XOR gate instead of an OR gate to combine the carries?"*

Let us test if $C_{\text{out}1}$ and $C_{\text{out}2}$ can ever be $1$ simultaneously:
* $C_{\text{out}1} = 1$ when $A = 1$ and $B = 1$.
* When $A = 1$ and $B = 1$, the partial sum $\text{Sum}_1 = A \oplus B = 1 \oplus 1 = 0$.
* Since $\text{Sum}_1 = 0$, the input to Half Adder 2 is $0$. Therefore, $C_{\text{out}2} = \text{Sum}_1 \cdot C_{\text{in}} = 0 \cdot C_{\text{in}} = 0$!

Because $C_{\text{out}1}$ and $C_{\text{out}2}$ are **mutually exclusive** (they can never be $1$ at the same time), $C_{\text{out}1} + C_{\text{out}2}$ is identical to $C_{\text{out}1} \oplus C_{\text{out}2}$. A simple 2-input OR gate works with 100% mathematical perfection!

---

## Alternative Gate Implementations of the Full Adder

In physical microchip production, semiconductor foundries often build Full Adders using alternative gate layouts to minimize transistor count, reduce propagation delay, or match specific CMOS cell libraries.

### 1. The Pure 9-NAND Full Adder Topology
Because CMOS fabrication favors NAND gates, a Full Adder can be constructed using **nine 2-input NAND gates**:

```text
PURE 9-NAND FULL ADDER HARDWARE TOPOLOGY

A ──┬─────────────────────────────►┌────────┐
    │          ┌────────┐          │ NAND 2 ├─┐
    └─────────►│ NAND 1 ├──┬──────►└────────┘ │   ┌────────┐
               └────────┘  │                  ├──►│ NAND 4 ├──────────┐
B ──┬──────────────────────│──────►┌────────┐ │   └────────┘          │
    │                      │       │ NAND 3 ├─┘                       │
    └──────────────────────│──────►└────────┘                         │
                           │                                          │
Cin ────────────────┐      │                                          │
                    │      │ (N1)                              (Sum1) │
                    ▼      ▼                                          ▼
               ┌──────────────────────────────────────────────────────────┐
               │             STAGE 2: CARRY & SUM LOGIC                   │
               │                (NAND Gates 5 to 9)                       │
               └────────────────────────────┬─────────────────────────────┘
                                            │
                                            ▼
                                  Outputs: Sum S & Cout
```

Total physical transistor count in CMOS silicon:
$$9 \text{ NAND gates} \times 4 \text{ transistors} = \mathbf{36 \text{ transistors}}$$

---

### 2. CMOS Transmission-Gate Full Adder (Ultra-Dense 28-Transistor Design)
By utilizing specialized CMOS **Transmission Gates** (pass-transistor logic), custom microchip designers can build a Full Adder using only **28 transistors** (or even 20 transistors in advanced pass-transistor logic styles). 

This reduces the physical silicon area of the adder by **$22\%$** compared to standard gate-level synthesis, allowing processor arithmetic units to fit into tighter die layouts.

---

## Engineering Reality: Critical Path Latency and Ripple Carry Cascading

When Full Adders are chained together to form an $N$-bit multi-bit adder (a **Ripple Carry Adder**), the propagation delay of the carry signal becomes the ultimate performance bottleneck of the arithmetic unit.

### 1. The Critical Path in a Full Adder
In a single Full Adder cell, there are two distinct propagation paths:
1. **Sum Delay ($t_{\text{sum}}$)**: The time required for $A, B,$ or $C_{\text{in}}$ to update the local Sum output $S$. This path passes through two XOR gates:
   $$t_{\text{sum}} = 2 \cdot t_{\text{xor}}$$
2. **Carry-Out Delay ($t_{\text{carry}}$)**: The time required for $A, B,$ or $C_{\text{in}}$ to update $C_{\text{out}}$. This path passes through one XOR gate, one AND gate, and one OR gate:
   $$t_{\text{carry}} = t_{\text{xor}} + t_{\text{and}} + t_{\text{or}}$$

```text
FULL ADDER INTERNAL PROPAGATION DELAY PATHS

 Sum Path  : Inputs (A, B, Cin) ──► [ XOR 1 ] ──► [ XOR 2 ] ──► Sum S
              (Delay = 2 * t_xor)

 Carry Path: Inputs (A, B) ──────► [ XOR 1 ] ──► [ AND 2 ] ──► [ OR ] ──► Cout
              (Delay = t_xor + t_and + t_or)
```

### 2. The $N$-Bit Ripple Carry Cascade Bottleneck
When $N$ Full Adders are connected in series ($FA_0, FA_1, \dots, FA_{N-1}$), $FA_1$ cannot compute its final carry-out until $FA_0$ finishes $C_{\text{out}0}$. $FA_2$ cannot finish until $FA_1$ completes $C_{\text{out}1}$, and so on.

The carry bit must **ripple** sequentially through all $N$ stages!

```text
THE N-BIT RIPPLE CARRY LATENCY CASCADE

 Bit 0 (LSB)              Bit 1                    Bit 2                    Bit 3 (MSB)
 ┌──────────┐             ┌──────────┐             ┌──────────┐             ┌──────────┐
 │ Full     │ Cout0       │ Full     │ Cout1       │ Full     │ Cout2       │ Full     │ Cout3
 │ Adder 0  ├────────────►│ Adder 1  ├────────────►│ Adder 2  ├────────────►│ Adder 3  ├────────►
 └──────────┘             └──────────┘             └──────────┘             └──────────┘
  Delay = 1 t_carry        Delay = 2 t_carry        Delay = 3 t_carry        Delay = 4 t_carry
```

For an $N$-bit Ripple Carry Adder, the total worst-case propagation delay $t_{\text{ripple}}$ is:

$$
t_{\text{ripple}} = t_{\text{sum\_stage0}} + (N - 2) \cdot t_{\text{carry}} + t_{\text{sum\_stageN-1}}
$$

For large word widths (such as $N = 64$ bits), waiting for a carry to ripple through 64 consecutive Full Adders limits the processor clock frequency. This latency wall motivates the invention of **Carry Lookahead Adders**, which calculate carry signals in parallel using $G$ and $P$ terms!

---

## Solved Industrial Engineering Exercise: Arithmetic Logic Unit (ALU) 3-Bit Full Adder Core

To consolidate your complete mastery of Full Adder truth tables, 3-variable XOR sum trees, carry propagation logic ($G$ and $P$), modular synthesis, and ripple carry propagation, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit firm is engineering a 3-bit multi-operand addition unit for a high-speed DSP (Digital Signal Processor). The unit adds two 3-bit unsigned binary integers:

$$
A = (A_2, A_1, A_0) \quad \text{and} \quad B = (B_2, B_1, B_0)
$$

Alongside an initial system Carry-In bit $C_{\text{in}0}$.

```text
3-BIT RIPPLE CARRY ADDER TOPOLOGY

 Initial Carry Cin0
       │
       ▼
 ┌───────────┐  Cout0   ┌───────────┐  Cout1   ┌───────────┐  Cout2
 │ Full      ├─────────►│ Full      ├─────────►│ Full      ├─────────► Final Carry Out C3
 │ Adder 0   │          │ Adder 1   │          │ Adder 2   │
 └─────┬─────┘          └─────┬─────┘          └─────┬─────┘
       │                      │                      │
       ▼                      ▼                      ▼
  Sum Bit S0             Sum Bit S1             Sum Bit S2
```

The system must output a 3-bit sum $S = (S_2, S_1, S_0)$ and a final carry-out bit $C_3$.

#### Electrical Gate Delays:
* 2-Input XOR Gate Delay: $t_{\text{xor}} = 1.5\text{ ns}$
* 2-Input AND Gate Delay: $t_{\text{and}} = 1.0\text{ ns}$
* 2-Input OR Gate Delay: $t_{\text{or}} = 1.0\text{ ns}$

#### Your Objective

1. Write the full truth table for Full Adder cell 1 ($\text{FA}_1$) receiving inputs $A_1, B_1,$ and incoming carry $C_1$.
2. Derive the Boolean equations for $S_1$ and $C_2$ using Generate ($G_1$) and Propagate ($P_1$) terms.
3. Calculate the total gate propagation delay $t_{\text{total}}$ required for the 3-bit adder to compute the final carry-out $C_3$ starting from stable inputs $A, B,$ and $C_{\text{in}0}$.
4. Simulate the entire 3-bit adder circuit on the binary addition problem $111_2 + 101_2$ with $C_{\text{in}0} = 0$, evaluating every intermediate carry and sum bit.
5. Verify mathematical correctness against decimal arithmetic.

---

### Step-by-Step Derivation

#### Step 1: Construct the Full Truth Table for $\text{FA}_1$

Full Adder cell 1 receives inputs $A_1, B_1,$ and incoming carry $C_1$. It computes local sum $S_1$ and outgoing carry $C_2$.

```text
FULL ADDER 1 (FA1) TRUTH TABLE

 Row │ A1 │ B1 │ C1 │ Sum S1 (A1 (+) B1 (+) C1) │ Carry-Out C2 (G1 + P1*C1) │ Arithmetic Meaning
─────┼────┼────┼────┼───────────────────────────┼───────────────────────────┼─────────────────────
  0  │ 0  │ 0  │ 0  │             0             │             0             │ 0 + 0 + 0 = 0
  1  │ 0  │ 0  │ 1  │             1             │             0             │ 0 + 0 + 1 = 1
  2  │ 0  │ 1  │ 0  │             1             │             0             │ 0 + 1 + 0 = 1
  3  │ 0  │ 1  │ 1  │             0             │             1             │ 0 + 1 + 1 = 2 (Carry)
  4  │ 1  │ 0  │ 0  │             1             │             0             │ 1 + 0 + 0 = 1
  5  │ 1  │ 0  │ 1  │             0             │             1             │ 1 + 0 + 1 = 2 (Carry)
  6  │ 1  │ 1  │ 0  │             0             │             1             │ 1 + 1 + 0 = 2 (Carry)
  7  │ 1  │ 1  │ 1  │             1             │             1             │ 1 + 1 + 1 = 3 (Sum&Cry)
```

---

#### Step 2: Derive Boolean Equations Using Generate ($G_1$) and Propagate ($P_1$) Terms

We define the Carry Generate term $G_1$ and Carry Propagate term $P_1$ for Bit 1:

$$
G_1 = A_1 \cdot B_1
$$

$$
P_1 = A_1 \oplus B_1
$$

Where:
* $G_1$ is active ($1$) if $A_1=1$ and $B_1=1$, locally generating a carry regardless of $C_1$.
* $P_1$ is active ($1$) if $A_1 \neq B_1$, allowing an incoming carry $C_1$ to propagate through to $C_2$.

Now we write the expressions for $S_1$ and $C_2$:

$$
S_1 = P_1 \oplus C_1 = (A_1 \oplus B_1) \oplus C_1
$$

$$
C_2 = G_1 + (P_1 \cdot C_1) = (A_1 \cdot B_1) + ((A_1 \oplus B_1) \cdot C_1)
$$

---

#### Step 3: Propagation Delay Calculation for the 3-Bit Ripple Adder

Let us calculate the worst-case propagation delay to produce the final carry $C_3$:

1. **Stage 0 ($\text{FA}_0$)**:
   * Receives $A_0, B_0, C_{\text{in}0}$ at $t = 0.0\text{ ns}$.
   * Computes $P_0 = A_0 \oplus B_0$ at $t = t_{\text{xor}} = 1.5\text{ ns}$.
   * Computes $G_0 = A_0 \cdot B_0$ at $t = t_{\text{and}} = 1.0\text{ ns}$.
   * Computes $P_0 \cdot C_{\text{in}0}$ at $t = 1.5\text{ ns} + t_{\text{and}} = 2.5\text{ ns}$.
   * Computes $C_1 = G_0 + (P_0 \cdot C_{\text{in}0})$ at $t = 2.5\text{ ns} + t_{\text{or}} = 3.5\text{ ns}$.
   * Output $C_1$ is ready at **$t = 3.5\text{ ns}$**.

2. **Stage 1 ($\text{FA}_1$)**:
   * $P_1 = A_1 \oplus B_1$ and $G_1 = A_1 \cdot B_1$ were already computed in parallel at $t = 1.5\text{ ns}$ and $t = 1.0\text{ ns}$!
   * When $C_1$ arrives at $t = 3.5\text{ ns}$, $\text{FA}_1$ computes $P_1 \cdot C_1$ at $t = 3.5\text{ ns} + t_{\text{and}} = 4.5\text{ ns}$.
   * Computes $C_2 = G_1 + (P_1 \cdot C_1)$ at $t = 4.5\text{ ns} + t_{\text{or}} = 5.5\text{ ns}$.
   * Output $C_2$ is ready at **$t = 5.5\text{ ns}$**.

3. **Stage 2 ($\text{FA}_2$)**:
   * When $C_2$ arrives at $t = 5.5\text{ ns}$, $\text{FA}_2$ computes $P_2 \cdot C_2$ at $t = 5.5\text{ ns} + t_{\text{and}} = 6.5\text{ ns}$.
   * Computes $C_3 = G_2 + (P_2 \cdot C_2)$ at $t = 6.5\text{ ns} + t_{\text{or}} = 7.5\text{ ns}$.
   * Final Carry-Out $C_3$ is ready at **$t = 7.5\text{ ns}$**.

```text
PROPAGATION DELAY TIMING CHRONOLOGY

 t = 0.0 ns ──► Stable Inputs A[2:0], B[2:0], Cin0 arrive
 t = 1.5 ns ──► All P_k and G_k computed in parallel across all stages
 t = 3.5 ns ──► Stage 0 Carry-Out C1 ready
 t = 5.5 ns ──► Stage 1 Carry-Out C2 ready
 t = 7.5 ns ──► Stage 2 Final Carry-Out C3 READY!
```

Total critical path delay for 3-bit addition = **$7.5\text{ nanoseconds}$**.

---

#### Step 4: Full Circuit Simulation for $A = 111_2$ (7) + $B = 101_2$ (5) with $C_{\text{in}0} = 0$

Input vectors:
* $A = 111_2 \implies A_2=1, A_1=1, A_0=1$.
* $B = 101_2 \implies B_2=1, B_1=0, B_0=1$.
* $C_{\text{in}0} = 0$.

##### Bit 0 (LSB Stage $\text{FA}_0$):
* $A_0 = 1, B_0 = 1, C_{\text{in}0} = 0$.
* $P_0 = A_0 \oplus B_0 = 1 \oplus 1 = 0$.
* $G_0 = A_0 \cdot B_0 = 1 \cdot 1 = 1$.
* **Sum $S_0$**: $S_0 = P_0 \oplus C_{\text{in}0} = 0 \oplus 0 = 0$.
* **Carry $C_1$**: $C_1 = G_0 + (P_0 \cdot C_{\text{in}0}) = 1 + (0 \cdot 0) = 1$.

##### Bit 1 (Middle Stage $\text{FA}_1$):
* $A_1 = 1, B_1 = 0, C_1 = 1$.
* $P_1 = A_1 \oplus B_1 = 1 \oplus 0 = 1$.
* $G_1 = A_1 \cdot B_1 = 1 \cdot 0 = 0$.
* **Sum $S_1$**: $S_1 = P_1 \oplus C_1 = 1 \oplus 1 = 0$.
* **Carry $C_2$**: $C_2 = G_1 + (P_1 \cdot C_1) = 0 + (1 \cdot 1) = 1$.

##### Bit 2 (MSB Stage $\text{FA}_2$):
* $A_2 = 1, B_2 = 1, C_2 = 1$.
* $P_2 = A_2 \oplus B_2 = 1 \oplus 1 = 0$.
* $G_2 = A_2 \cdot B_2 = 1 \cdot 1 = 1$.
* **Sum $S_2$**: $S_2 = P_2 \oplus C_2 = 0 \oplus 1 = 1$.
* **Final Carry $C_3$**: $C_3 = G_2 + (P_2 \cdot C_2) = 1 + (0 \cdot 1) = 1$.

##### Assembling the Final 4-Bit Result:
The output vector is $(C_3, S_2, S_1, S_0) = 1100_2$.

---

#### Step 5: Verification Against Decimal Arithmetic

Converting inputs and result to decimal:
* Input $A = 111_2 = 7_{10}$.
* Input $B = 101_2 = 5_{10}$.
* Expected Decimal Sum: $7 + 5 = 12_{10}$.
* Circuit Output: $1100_2 = 1 \cdot 2^3 + 1 \cdot 2^2 + 0 \cdot 2^1 + 0 \cdot 2^0 = 8 + 4 + 0 + 0 = 12_{10}$.

$$111_2 + 101_2 = 1100_2 \quad \iff \quad 7_{10} + 5_{10} = 12_{10}$$

All intermediate carries ($C_1=1, C_2=1, C_3=1$) and sum bits ($S_0=0, S_1=0, S_2=1$) evaluate with 100% mathematical precision. The Full Adder circuit is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Full Adder**: The complete single-bit combinational arithmetic module that accepts two operand bits ($A$ and $B$) and an incoming carry bit ($C_{\text{in}}$) to generate a local sum ($S = A \oplus B \oplus C_{\text{in}}$) and an outgoing carry ($C_{\text{out}}$), enabling the unlimited cascading of arithmetic stages across multi-bit words.
* **Carry Propagation Logic**: The Boolean decision network $C_{\text{out}} = G + (P \cdot C_{\text{in}})$—defined by Carry Generation ($G = A \cdot B$) and Carry Propagation ($P = A \oplus B$) terms—that determines whether a carry bit is produced locally or passed through from an incoming stage to an outgoing stage.
