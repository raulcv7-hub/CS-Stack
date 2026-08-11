---
title: "BCD Adder Circuit Synthesis and Decimal Correction Logic Mechanics"
---

# BCD Adder Circuit Synthesis and Decimal Correction Logic Mechanics

## The Arithmetic Mismatch Between Binary Adders and BCD Representation

In digital financial processors, electronic point-of-sale cash registers, and medical instrumentation displays, numerical data is frequently stored and manipulated using **Binary-Coded Decimal (BCD)** representation. In a BCD system, every decimal digit ($0, 1, 2, 3, 4, 5, 6, 7, 8, 9$) is encoded using a 4-bit binary nibble ranging from $0000_2$ ($0_{10}$) to $1001_2$ ($9_{10}$).

However, when a hardware designer attempts to perform addition on two BCD digits by feeding them directly into a standard 4-bit binary adder circuit, a severe arithmetic mismatch occurs.

A standard 4-bit binary adder operates in base-16 (hexadecimal/pure binary), adding two 4-bit numbers across a complete 16-state space ($0000_2$ to $1111_2$, or $0$ to $15_{10}$). But BCD arithmetic operates strictly in **base-10**. BCD uses only the first 10 binary codes ($0000_2$ to $1001_2$), treating the upper 6 binary codes—$1010_2, 1011_2, 1100_2, 1101_2, 1110_2,$ and $1111_2$ (decimals 10 through 15)—as **forbidden, invalid states**.

```text
THE BCD VS BINARY ADDITION MISMATCH

 Standard 4-Bit Binary Adder Capacity (16 States):
 0000 (0) ... 1001 (9) │ 1010 (10)  1011 (11)  1100 (12)  1101 (13)  1110 (14)  1111 (15)
 ◄── Valid BCD Range ─►│ ◄────────────── FORBIDDEN INVALID BCD STATES! ────────────────►

 Raw Binary Addition Example: 5 + 8 = 13
 Input A = 0101 (5_10), Input B = 1000 (8_10)
       0101
     + 1000
     ──────
       1101_2  <── Raw Binary Sum = 13_10 (INVALID BCD CODE!)
                   (Fails to produce BCD output: Tens = 1, Units = 3!)
```

Consider what happens when you add $5_{10}$ ($0101_2$) and $8_{10}$ ($1000_2$) using a raw 4-bit binary adder:
* The raw binary adder computes $0101_2 + 1000_2 = 1101_2$ ($13_{10}$ in pure binary).
* Look at the result: $1101_2$ is one of the six forbidden non-decimal codes! 
* A BCD display reading $1101_2$ cannot show the digit "13" on a single decimal display position. The correct 2-digit BCD result for $13_{10}$ MUST be a tens carry bit of $1$ ($C_{\text{out}} = 1$) and a units digit of $3_{10}$ ($0011_2$).

A raw binary adder fails to generate a decimal carry when the sum exceeds $9_{10}$, and leaves behind a corrupted 4-bit binary sum.

How do we construct a specialized combinational arithmetic circuit—a **BCD Adder**—that detects when a raw binary sum has landed in the forbidden range ($10_{10}$ to $19_{10}$), automatically injects a $+6_{10}$ ($0110_2$) correction factor to skip the 6 invalid 4-bit states, and outputs a valid 4-bit BCD sum digit and BCD carry-out?

We combine a primary 4-bit binary adder with **Decimal Correction Logic** and a secondary 4-bit correction adder.

---

## The 10-Slot Bowling Alley Wheel: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of why BCD addition requires a $+6$ correction factor, let us step away from electronics and imagine a mechanical bowling pin counter wheel.

Imagine a specialized mechanical score wheel designed to count bowling pin knockdowns. The wheel has **10 teeth** numbered $0, 1, 2, 3, 4, 5, 6, 7, 8, 9$.

```text
THE 10-TEETH DECIMAL WHEEL VS 16-TEETH BINARY WHEEL

 10-Teeth Decimal Wheel (BCD Target):
 [ 0 ] ──► [ 1 ] ──► ... ──► [ 9 ] ──► (ROLLS OVER TO 0! Triggers Tens Carry)

 16-Teeth Standard Binary Wheel (Raw Adder Hardware):
 [ 0 ] ──► [ 1 ] ──► ... ──► [ 9 ] ──► [ 10 ] ──► [ 11 ] ... ──► [ 15 ] ──► (ROLLS OVER)
                                       ◄──────────────────────►
                                        6 EXTRA UNWANTED TEETH!
```

Suppose a manufacturer builds this bowling score counter using a standard off-the-shelf **16-tooth gear wheel** (representing a 4-bit binary adder that counts from $0$ to $15$).

How do you make a 16-tooth gear wheel behave like a 10-tooth decimal wheel?

Let us trace what happens when you roll 5 pins on frame 1, and 8 pins on frame 2 ($5 + 8 = 13$ pins total):

1. You turn the 16-tooth wheel forward by 5 teeth (lands on Tooth 5).
2. You turn the wheel forward by 8 more teeth. The wheel advances to **Tooth 13**.
3. But there are no 13s in bowling! The score should be **1 Tens Carry** and **3 Units remaining**.
4. Why did the wheel fail to roll over? Because the 16-tooth wheel has **6 extra unwanted teeth** (Teeth 10, 11, 12, 13, 14, 15) sitting between Tooth 9 and the rollover point!

How do you fix the 16-tooth wheel so it displays the correct single-digit remainder ($3$) and pushes the tens carry lever?

**You artificially jump the wheel forward by 6 extra teeth!**

```text
THE +6 CORRECTION JUMP MECHANISM

 Current Position on 16-Tooth Wheel : Tooth 13 (1101_2)
 Add +6 Correction Jump             :     +  6    (0110_2)
                                        ───────
 Result After Rollover              : Tooth 19 -> (Rolls over 16!) -> Lands on 3!
                                      Pushes Tens Carry Lever = 1!
```

Look at the mathematical magic of jumping forward by 6:
$$13 + 6 = 19_{10} = 10011_2$$
* The 16-tooth wheel **rolls over** (because $19 \ge 16$), dropping a $1$ onto the tens carry lever!
* The 4-bit wheel display leaves behind $19 - 16 = \mathbf{3}$ ($0011_2$)!

By adding $+6$ whenever the sum exceeds $9$, we force the 16-state binary wheel to skip its 6 invalid extra slots, triggering a proper decimal rollover and leaving behind the exact correct decimal remainder!

This $+6$ artificial jump is the exact physical analogue of **Decimal Correction Logic** in a BCD Adder.

---

## Mechanics of BCD Adder Synthesis and Decimal Correction Logic

To master BCD adder design, we must dissect the formal mechanics of its two core primitives:
1. **Decimal Correction Logic**: The combinational gate network that inspects the raw 4-bit binary sum and raw carry-out to detect when the sum exceeds $9_{10}$.
2. **The BCD Adder Architecture**: The two-stage binary adder structure that computes the raw binary sum, applies the $+6$ correction vector ($0110_2$) when required, and outputs a valid 4-bit BCD digit and BCD carry.

---

### Primitive 1: Decimal Correction Logic

A BCD Adder receives two 4-bit BCD input digits $\mathbf{A} = (A_3, A_2, A_1, A_0)$ and $\mathbf{B} = (B_3, B_2, B_1, B_0)$, along with an incoming carry bit $C_{\text{in}}$.

First, the BCD Adder passes these inputs into a primary 4-bit binary adder to calculate a **Raw Binary Sum Vector $\mathbf{Z} = (Z_3, Z_2, Z_1, Z_0)$** and a **Raw Binary Carry-Out ($C_{\text{bin}}$)**:

$$\mathbf{Z} = \mathbf{A} + \mathbf{B} + C_{\text{in}}$$

The decimal value of this raw sum ranges from $0_{10}$ ($0000_2 + 0000_2 + 0$) up to $19_{10}$ ($1001_2 + 1001_2 + 1 = 19_{10} = 10011_2$).

Let us analyze all 20 possible raw sum outcomes ($0$ to $19_{10}$) to determine when a $+6$ correction is required:

```text
EXHAUSTIVE RAW BINARY SUM ANALYSIS (0 TO 19 DECIMAL)

 Raw Sum (Decimal) │ Raw Binary Carry Cbin │ Raw Sum Vector Z3 Z2 Z1 Z0 │ BCD Correction Needed?
───────────────────┼───────────────────────┼────────────────────────────┼─────────────────────────
         0         │           0           │            0000            │ NO  (Valid BCD = 0)
         1         │           0           │            0001            │ NO  (Valid BCD = 1)
        ...        │          ...          │            ....            │ NO
         8         │           0           │            1000            │ NO  (Valid BCD = 8)
         9         │           0           │            1001            │ NO  (Valid BCD = 9)
───────────────────┼───────────────────────┼────────────────────────────┼─────────────────────────
        10         │           0           │            1010            │ YES! (Invalid BCD)
        11         │           0           │            1011            │ YES! (Invalid BCD)
        12         │           0           │            1100            │ YES! (Invalid BCD)
        13         │           0           │            1101            │ YES! (Invalid BCD)
        14         │           0           │            1110            │ YES! (Invalid BCD)
        15         │           0           │            1111            │ YES! (Invalid BCD)
───────────────────┼───────────────────────┼────────────────────────────┼─────────────────────────
        16         │           1           │            0000            │ YES! (Rolled over 16)
        17         │           1           │            0001            │ YES! (Rolled over 16)
        18         │           1           │            0010            │ YES! (Rolled over 16)
        19         │           1           │            0011            │ YES! (Rolled over 16)
```

Look at this table! The raw sum scenarios fall into three distinct mathematical categories:

#### Category 1: Valid BCD Sums ($0 \le \text{Sum} \le 9$)
* $C_{\text{bin}} = 0$, and raw sum vector $\mathbf{Z}$ ranges from $0000_2$ to $1001_2$.
* The raw binary sum is **already a valid BCD digit**.
* **Correction Action**: No correction needed ($+0$). BCD Carry-Out $C_{\text{out}} = 0$.

#### Category 2: Invalid Non-Decimal BCD Sums ($10 \le \text{Sum} \le 15$)
* $C_{\text{bin}} = 0$, but raw sum vector $\mathbf{Z}$ falls in the forbidden range $1010_2$ to $1111_2$.
* The raw binary sum is an invalid BCD code.
* **Correction Action**: Must add $+6_{10}$ ($0110_2$) to skip the 6 invalid codes and generate BCD Carry-Out $C_{\text{out}} = 1$.

#### Category 3: Binary Rollover Sums ($16 \le \text{Sum} \le 19$)
* The raw binary adder rolled over at 16, producing $C_{\text{bin}} = 1$ and a raw sum vector $\mathbf{Z}$ ranging from $0000_2$ to $0011_2$.
* Even though the 4-bit vector $\mathbf{Z}$ looks like a valid small binary number ($0$ to $3$), its value is wrong by 6 because binary rolled over at 16 instead of 10!
* **Correction Action**: Must add $+6_{10}$ ($0110_2$) to adjust the 4-bit sum vector and generate BCD Carry-Out $C_{\text{out}} = 1$.

---

### Deriving the Decimal Correction Detection Equation ($K$)

We need a combinational logic circuit that outputs a **Decimal Correction Trigger Flag ($K = 1$)** whenever the raw sum falls into Category 2 or Category 3.

When $K = 1$:
1. It serves as the final **BCD Carry-Out ($C_{\text{out}} = 1$)** sent to the next higher decimal digit.
2. It commands the secondary adder to inject $+6_{10}$ ($0110_2$) into the raw sum vector $\mathbf{Z}$.

Let us derive the Boolean equation for $K$:

$$K = 1 \quad \text{IF} \quad \left[ C_{\text{bin}} = 1 \right] \quad \text{OR} \quad \left[ \mathbf{Z} \in \{10, 11, 12, 13, 14, 15\} \right]$$

To detect when the 4-bit raw sum vector $(Z_3, Z_2, Z_1, Z_0)$ is between $10_{10}$ ($1010_2$) and $15_{10}$ ($1111_2$), let us map those six invalid states onto a Karnaugh Map:

```text
KARNAUGH MAP FOR INVALID BCD SUM DETECTION (Z3 Z2 Z1 Z0)

             Z1 Z0 = 00    Z1 Z0 = 01    Z1 Z0 = 11    Z1 Z0 = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
 Z3Z2= 00 │      0      │      0      │      0      │      0      │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 Z3Z2= 01 │      0      │      0      │      0      │      0      │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 Z3Z2= 11 │      1      │      1      │      1      │      1      │  ◄── Group 1 (12, 13, 15, 14)
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 Z3Z2= 10 │      0      │      0      │      1      │      1      │  ◄── Group 2 (11, 10)
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s on this K-Map:
* **Group 1 (Entire row $Z_3 Z_2 = 11$)**: Covers cells 12, 13, 15, 14 ($1100_2$ to $1111_2$).
  Term: **$Z_3 \cdot Z_2$**
* **Group 2 (2x2 block in columns $Z_1 Z_0 = 11, 10$, rows $Z_3 Z_2 = 11, 10$)**: Covers cells 15, 14, 11, 10 ($1010_2, 1011_2, 1110_2, 1111_2$).
  Term: **$Z_3 \cdot Z_1$**

Combining $C_{\text{bin}}$ with these two K-map groups yields the **Decimal Correction Detection Equation**:

$$
K = C_{\text{out}} = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)
$$

Where:
* $K$ is the Decimal Correction Trigger Flag ($1 =$ Add $+6$, $0 =$ Add $+0$).
* $C_{\text{out}}$ is the final BCD Carry-Out signal sent to the next decimal stage.
* $C_{\text{bin}}$ is the raw binary carry-out from the primary 4-bit adder.
* $Z_3, Z_2, Z_1$ are bits 3, 2, and 1 of the primary raw binary sum vector $\mathbf{Z}$.

```text
DECIMAL CORRECTION DETECTION GATE NETWORK

Cbin ────────────────────────────────────────►┌────────┐
Z3 ──┬───────────────────►┌───────┐           │        │
Z2 ──│───────────────────►│ AND 1 ├─►(Z3·Z2)─►│ 3-INP  ├──► Correction K
     │                    ├───────┤           │   OR   │    (BCD Cout)
Z1 ──│───────────────────►│ AND 2 ├─►(Z3·Z1)─►│  GATE  │
     └───────────────────►└───────┘           └────────┘
```

Look at how elegant this detection circuit is! With just two 2-input AND gates and one 3-input OR gate, we can detect whether any 4-bit binary sum exceeds $9_{10}$!

---

### Primitive 2: The BCD Adder Architecture

Now we assemble the complete **1-Digit BCD Adder** by cascading three functional hardware blocks:

1. **Primary 4-Bit Binary Adder**:
   Adds BCD inputs $\mathbf{A} = (A_3, A_2, A_1, A_0)$ and $\mathbf{B} = (B_3, B_2, B_1, B_0)$ plus incoming carry $C_{\text{in}}$, emitting raw sum $\mathbf{Z} = (Z_3, Z_2, Z_1, Z_0)$ and raw carry $C_{\text{bin}}$.
2. **Decimal Correction Detector**:
   Evaluates $K = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$ to emit correction trigger $K$ (which also serves as BCD Carry-Out $C_{\text{out}}$).
3. **Secondary 4-Bit Correction Adder**:
   Adds the correction vector $\mathbf{C}_{\text{vec}} = (0, K, K, 0)$ to the raw sum vector $\mathbf{Z}$:
   * When $K = 0$, $\mathbf{C}_{\text{vec}} = 0000_2$ ($+0$). Raw sum passes through unchanged.
   * When $K = 1$, $\mathbf{C}_{\text{vec}} = 0110_2$ ($+6_{10}$). Adds $+6$ to adjust the raw sum into a valid 4-bit BCD digit $\mathbf{S} = (S_3, S_2, S_1, S_0)$!

```text
COMPLETE 1-DIGIT BCD ADDER SCHEMATIC

 BCD Input A[3:0]    BCD Input B[3:0]    Carry-In Cin
        │                   │                 │
        └─────────┬─────────┴─────────────────┘
                  ▼
   ┌───────────────────────────────┐
   │ Primary 4-Bit Binary Adder    ├──► Raw Carry Cbin
   └──────────────┬────────────────┘
                  │ Raw Sum Z[3:0]
                  ├───────────────────────────────┐
                  ▼                               ▼
   ┌───────────────────────────────┐   ┌───────────────────────────────┐
   │ Decimal Correction Detector   │   │ Secondary 4-Bit Binary Adder  │
   │ K = Cbin + Z3*Z2 + Z3*Z1      │   │ Inputs: Raw Z + Vector (0,K,K,0)
   └──────────────┬────────────────┘   └──────────────┬────────────────┘
                  │                                   │
                  ▼                                   ▼
         BCD Carry-Out Cout                      Final BCD Sum S[3:0]
         (To Next Decimal Digit)                 (Valid BCD Digit 0..9)
```

Look at the input vector sent to the secondary correction adder:
* Bit 3 input = $0$
* Bit 2 input = $K$
* Bit 1 input = $K$
* Bit 0 input = $0$

When $K = 1$, this input vector is $0110_2 = +6_{10}$! When $K = 0$, it is $0000_2 = +0_{10}$.

---

## Verifying the Three Operational Correction Scenarios

To prove that this 2-stage architecture handles all addition cases with 100% mathematical precision, let us trace three distinct arithmetic scenarios through the hardware.

### Scenario 1: Addition Result $\le 9$ ($5_{10} + 3_{10} = 8_{10}$)
* **Inputs**: $A = 0101_2$ ($5_{10}$), $B = 0011_2$ ($3_{10}$), $C_{\text{in}} = 0$.
* **Primary Adder Execution**:
  $$\mathbf{Z} = 0101_2 + 0011_2 = 1000_2 \quad (8_{10}), \quad C_{\text{bin}} = 0$$
* **Correction Detector Evaluation**:
  $K = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$
  $K = 0 + (1 \cdot 0) + (1 \cdot 0) = 0 + 0 + 0 = \mathbf{0}$.
  BCD Carry-Out $C_{\text{out}} = 0$.
* **Secondary Adder Execution**:
  Adds correction vector $0KK0_2 = 0000_2$ ($+0$) to raw sum $1000_2$:
  $$\mathbf{S} = 1000_2 + 0000_2 = 1000_2 \quad (8_{10})$$
* **Final Result**: BCD Sum $\mathbf{S} = 1000_2$ ($8_{10}$), BCD Carry $C_{\text{out}} = 0$. **VALID BCD RESULT!**

---

### Scenario 2: Addition Result Between 10 and 15 ($5_{10} + 8_{10} = 13_{10}$)
* **Inputs**: $A = 0101_2$ ($5_{10}$), $B = 1000_2$ ($8_{10}$), $C_{\text{in}} = 0$.
* **Primary Adder Execution**:
  $$\mathbf{Z} = 0101_2 + 1000_2 = 1101_2 \quad (13_{10}), \quad C_{\text{bin}} = 0$$
  *(Notice raw sum $1101_2$ is an invalid non-decimal code!)*
* **Correction Detector Evaluation**:
  $K = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$
  $K = 0 + (1 \cdot 1) + (1 \cdot 0) = 0 + 1 + 0 = \mathbf{1}$!
  BCD Carry-Out $C_{\text{out}} = \mathbf{1}$.
* **Secondary Adder Execution**:
  Adds correction vector $0KK0_2 = 0110_2$ ($+6_{10}$) to raw sum $1101_2$:
  $$\mathbf{S} = 1101_2 + 0110_2 = 10011_2 \implies \text{4-Bit Output } \mathbf{S} = 0011_2 \quad (3_{10})$$
* **Final Result**: BCD Sum $\mathbf{S} = 0011_2$ ($3_{10}$), BCD Carry $C_{\text{out}} = 1$.
* **Combined 2-Digit BCD Answer**: $C_{\text{out}} \mathbf{S} = 1 \text{ tens}, 3 \text{ units} = \mathbf{13_{10}}$! **CORRECT DECIMAL ANSWER!**

---

### Scenario 3: Addition Result Between 16 and 19 ($9_{10} + 9_{10} + 1 = 19_{10}$)
* **Inputs**: $A = 1001_2$ ($9_{10}$), $B = 1001_2$ ($9_{10}$), $C_{\text{in}} = 1$.
* **Primary Adder Execution**:
  $$\mathbf{Z} = 1001_2 + 1001_2 + 1 = 10011_2 \implies \mathbf{Z} = 0011_2 \quad (3_{10}), \quad C_{\text{bin}} = \mathbf{1}$$
  *(The raw binary adder rolled over at 16, leaving raw sum $0011_2$)*
* **Correction Detector Evaluation**:
  $K = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1) = 1 + (0 \cdot 0) + (0 \cdot 1) = 1 + 0 + 0 = \mathbf{1}$!
  BCD Carry-Out $C_{\text{out}} = \mathbf{1}$.
* **Secondary Adder Execution**:
  Adds correction vector $0110_2$ ($+6_{10}$) to raw sum $0011_2$:
  $$\mathbf{S} = 0011_2 + 0110_2 = 1001_2 \quad (9_{10})$$
* **Final Result**: BCD Sum $\mathbf{S} = 1001_2$ ($9_{10}$), BCD Carry $C_{\text{out}} = 1$.
* **Combined 2-Digit BCD Answer**: $C_{\text{out}} \mathbf{S} = 1 \text{ tens}, 9 \text{ units} = \mathbf{19_{10}}$! **CORRECT DECIMAL ANSWER!**

All three operational scenarios evaluate with 100% mathematical and electrical precision.

---

## Cascading Multi-Digit BCD Adders

To perform arithmetic on multi-digit decimal numbers—such as adding two 4-digit financial numbers ($9,999_{10} + 1,234_{10}$)—we cascade individual 1-digit BCD Adder modules in series.

The BCD Carry-Out ($C_{\text{out}}$) of each decimal digit stage is wired directly into the BCD Carry-In ($C_{\text{in}}$) of the next higher decimal digit stage:

```text
CASCADED 2-DIGIT BCD ADDER ARCHITECTURE (00 TO 99 DECIMAL)

 Units Digit Stage (Bit 0..3)              Tens Digit Stage (Bit 4..7)

 Inputs A_units, B_units                   Inputs A_tens, B_tens
        │                                         │
        ▼                                         ▼
 ┌──────────────┐  BCD Carry Cout_units   ┌──────────────┐
 │ 1-Digit BCD  ├────────────────────────►│ 1-Digit BCD  ├──────► BCD Carry-Out
 │ Adder Units  │  (Serves as Cin_tens)   │ Adder Tens   │        (Hundreds Carry)
 └──────┬───────┘                         └──────┬───────┘
        │                                        │
        ▼                                        ▼
   Sum Units S[3:0]                         Sum Tens S[7:4]
```

In this cascaded 2-digit BCD adder:
* **Units Stage**: Adds $A_{\text{units}} + B_{\text{units}}$, producing a 4-bit BCD sum $S[3:0]$ and a BCD carry $C_{\text{out,units}}$.
* **Tens Stage**: Receives $C_{\text{out,units}}$ as its incoming carry $C_{\text{in,tens}}$, adding $A_{\text{tens}} + B_{\text{tens}} + C_{\text{in,tens}}$ to produce tens sum $S[7:4]$ and hundreds carry $C_{\text{out,tens}}$.

---

## Performance Analysis: Gate Count and Critical Path Latency

What is the physical hardware cost and propagation delay of a 1-digit BCD Adder compared to a standard 4-bit binary adder?

### 1. Transistor and Gate Count Analysis
A 1-digit BCD Adder requires:
* Primary 4-Bit Binary Adder (4 Full Adders): 28 gates (112 CMOS transistors).
* Decimal Correction Detector (2 AND gates, 1 OR gate): 3 gates (14 CMOS transistors).
* Secondary 4-Bit Correction Adder (Simplified adder adding $0110_2$): 3 Full/Half Adders $\approx 18$ gates (72 CMOS transistors).

$$
\text{Total BCD Adder Footprint} \approx \mathbf{49 \text{ Gates (198 CMOS Transistors)}}
$$

A BCD Adder uses roughly **80% more logic gates** than a raw binary adder. This hardware overhead is the price paid for direct, native decimal arithmetic compatibility.

### 2. Critical Path Propagation Delay ($t_{\text{BCD}}$)

The longest signal path through a 1-digit BCD Adder passes through:
1. Primary 4-bit Binary Adder ($t_{\text{adder1}} \approx 4 \cdot t_{\text{carry}}$).
2. Decimal Correction Detection Logic ($t_{\text{detector}} \approx t_{\text{and}} + t_{\text{or}}$).
3. Secondary 4-bit Correction Adder ($t_{\text{adder2}} \approx 2 \cdot t_{\text{carry}}$).

$$
t_{\text{BCD}} = t_{\text{adder1}} + t_{\text{detector}} + t_{\text{adder2}}
$$

```text
CRITICAL PATH DELAY TIMING MAP

 Primary 4-Bit Adder ──► Correction Detector ──► Secondary 4-Bit Adder ──► Final BCD Sum
 (4 * t_carry = 3.2ns)   (t_and+t_or = 0.8ns)    (2 * t_carry = 1.6ns)    (Total = 5.6 ns)
```

A 1-digit BCD Adder takes approximately **$1.8\times$ longer** to complete its calculation than a raw 4-bit binary adder, reflecting the two-stage addition pipeline required for decimal correction.

---

## Solved Industrial Engineering Exercise: Point-of-Sale Terminal BCD Arithmetic Unit

To consolidate your complete mastery of BCD encoding, raw binary addition, decimal correction logic ($K$), secondary $+6$ vector addition, and multi-digit BCD cascading, we will now walk through a complete, step-by-step point-of-sale terminal hardware engineering problem.

---

### Scenario and Parameters

An industrial retail automation firm is designing the 2-digit BCD transaction sum processor for an electronic cash register's receipt printing engine.

The module adds two 2-digit BCD financial totals representing cents ($00\phi$ to $99\phi$):

$$\mathbf{A} = (\text{Tens } A_T[3:0], \, \text{Units } A_U[3:0])$$

$$\mathbf{B} = (\text{Tens } B_T[3:0], \, \text{Units } B_U[3:0])$$

With an initial carry $C_{\text{in}} = 0$.

```text
CASH REGISTER 2-DIGIT BCD ARITHMETIC PROCESSOR

 Tens A_T, B_T        Units A_U, B_U       Initial Carry Cin = 0
       │                    │                        │
       ▼                    ▼                        ▼
 ┌───────────┐  Cout_U   ┌───────────┐               │
 │ BCD Adder ├──────────►│ BCD Adder ├◄──────────────┘
 │ Tens      │           │ Units     │
 └─────┬─────┘           └─────┬─────┘
       │                       │
       ▼                       ▼
  Tens Sum S_T            Units Sum S_U
```

The system receives the following transaction values to add:
* Item 1 Price $\mathbf{A} = 78_{10}$ ($A_T = 0111_2, A_U = 1000_2$).
* Item 2 Price $\mathbf{B} = 65_{10}$ ($B_T = 0110_2, B_U = 0101_2$).

#### Physical CMOS Library Parameters:
* 4-Bit Binary Adder Delay: $t_{\text{adder4}} = 2.0\text{ ns}$
* 2-Input AND Gate Delay: $t_{\text{and}} = 0.4\text{ ns}$
* 3-Input OR Gate Delay: $t_{\text{or3}} = 0.5\text{ ns}$

#### Your Objective

1. Calculate the raw binary sum $\mathbf{Z}_U$ and raw carry $C_{\text{bin,U}}$ for the **Units Digit Stage** ($8_{10} + 5_{10}$).
2. Evaluate the decimal correction trigger flag $K_U$ for the Units stage.
3. Compute the corrected final BCD Units Sum $S_U[3:0]$ and BCD Carry-Out $C_{\text{out,U}}$.
4. Evaluate the **Tens Digit Stage** ($7_{10} + 6_{10} + C_{\text{in,T}}$), computing raw sum $\mathbf{Z}_T$, correction flag $K_T$, corrected Tens Sum $S_T[3:0]$, and Hundreds Carry $C_{\text{out,T}}$.
5. Calculate the total worst-case propagation delay $T_{\text{total}}$ for the 2-digit BCD adder.
6. Verify mathematical correctness against decimal arithmetic ($78_{10} + 65_{10} = 143_{10}$).

---

### Step-by-Step Derivation

#### Step 1: Units Digit Stage Execution ($8_{10} + 5_{10}$)

Inputs: $A_U = 1000_2$ ($8_{10}$), $B_U = 0101_2$ ($5_{10}$), $C_{\text{in,U}} = 0$.

##### 1. Primary 4-Bit Binary Adder Output:
$$\mathbf{Z}_U = A_U + B_U + C_{\text{in,U}} = 1000_2 + 0101_2 + 0 = 1101_2 \quad (13_{10})$$
$$C_{\text{bin,U}} = 0$$

Raw sum vector is $\mathbf{Z}_U = 1101_2$ ($Z_3=1, Z_2=1, Z_1=0, Z_0=1$).

##### 2. Evaluate Units Correction Detector Flag ($K_U$):
$$K_U = C_{\text{bin,U}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$$
$$K_U = 0 + (1 \cdot 1) + (1 \cdot 0) = 0 + 1 + 0 = \mathbf{1}$$

The correction flag fires $K_U = \mathbf{1}$!
BCD Units Carry-Out $C_{\text{out,U}} = \mathbf{1}$ (sent to Tens stage!).

##### 3. Secondary Correction Adder Execution:
Adds correction vector $0 K_U K_U 0_2 = 0110_2$ ($+6_{10}$) to raw sum $1101_2$:

$$S_U = \mathbf{Z}_U + 0110_2 = 1101_2 + 0110_2 = 10011_2 \implies \text{4-Bit } S_U = 0011_2 \quad (3_{10})$$

Units Stage Result: BCD Sum $S_U = 0011_2$ ($3_{10}$), Carry $C_{\text{out,U}} = 1$.

---

#### Step 2: Tens Digit Stage Execution ($7_{10} + 6_{10} + C_{\text{in,T}}$)

Inputs: $A_T = 0111_2$ ($7_{10}$), $B_T = 0110_2$ ($6_{10}$), $C_{\text{in,T}} = C_{\text{out,U}} = 1$.

##### 1. Primary 4-Bit Binary Adder Output:
$$\mathbf{Z}_T = A_T + B_T + C_{\text{in,T}} = 0111_2 + 0110_2 + 1 = 1110_2 \quad (14_{10})$$
$$C_{\text{bin,T}} = 0$$

Raw sum vector is $\mathbf{Z}_T = 1110_2$ ($Z_3=1, Z_2=1, Z_1=1, Z_0=0$).

##### 2. Evaluate Tens Correction Detector Flag ($K_T$):
$$K_T = C_{\text{bin,T}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$$
$$K_T = 0 + (1 \cdot 1) + (1 \cdot 1) = 0 + 1 + 1 = \mathbf{1}$$

The correction flag fires $K_T = \mathbf{1}$!
BCD Hundreds Carry-Out $C_{\text{out,T}} = \mathbf{1}$.

##### 3. Secondary Correction Adder Execution:
Adds correction vector $0110_2$ ($+6_{10}$) to raw sum $1110_2$:

$$S_T = \mathbf{Z}_T + 0110_2 = 1110_2 + 0110_2 = 10100_2 \implies \text{4-Bit } S_T = 0100_2 \quad (4_{10})$$

Tens Stage Result: BCD Sum $S_T = 0100_2$ ($4_{10}$), Carry $C_{\text{out,T}} = 1$.

---

#### Step 3: Assembling the Complete 3-Digit BCD Output Result

Combining the Hundreds Carry ($C_{\text{out,T}}$), Tens Digit ($S_T$), and Units Digit ($S_U$):

* Hundreds Digit = $C_{\text{out,T}} = 1_{10} = 0001_2$
* Tens Digit = $S_T = 4_{10} = 0100_2$
* Units Digit = $S_U = 3_{10} = 0011_2$

$$\text{Combined BCD Result Vector} = (0001_2, \, 0100_2, \, 0011_2) = \mathbf{143_{10}}$$

---

#### Step 4: Calculate Total Propagation Delay ($T_{\text{total}}$)

Let us trace the critical path delay through the 2-digit cascaded BCD adder:

1. **Units Stage Primary Adder**: $t_{\text{adder4}} = 2.0\text{ ns}$.
2. **Units Stage Correction Detector**: $t_{\text{and}} + t_{\text{or3}} = 0.4\text{ ns} + 0.5\text{ ns} = 0.9\text{ ns}$.
   * Units Carry $C_{\text{out,U}}$ is ready at $t = 2.0 + 0.9 = 2.9\text{ ns}$.
3. **Tens Stage Primary Adder**:
   * Tens inputs $A_T, B_T$ were already processed through primary sum, but $C_{\text{in,T}}$ arrives at $t = 2.9\text{ ns}$.
   * Ripple carry through primary adder adds $t_{\text{carry\_ripple}} \approx 1.0\text{ ns}$.
   * Tens raw sum $\mathbf{Z}_T$ ready at $t = 2.9 + 1.0 = 3.9\text{ ns}$.
4. **Tens Stage Correction Detector**: $t_{\text{and}} + t_{\text{or3}} = 0.9\text{ ns}$.
   * Tens Carry $C_{\text{out,T}}$ ready at $t = 3.9 + 0.9 = 4.8\text{ ns}$.
5. **Tens Stage Secondary Correction Adder**: $t_{\text{adder2}} \approx 1.2\text{ ns}$.
   * Final Tens Sum $S_T$ settles at $t = 4.8 + 1.2 = 6.0\text{ ns}$.

$$T_{\text{total}} = \mathbf{6.0 \text{ nanoseconds}}$$

The 2-digit BCD adder completes the transaction sum $78_{10} + 65_{10} = 143_{10}$ in **$6.0\text{ nanoseconds}$**!

---

#### Step 5: Verification Against Decimal Arithmetic

Converting inputs and result to decimal:
* Input Item 1 = $78_{10}$.
* Input Item 2 = $65_{10}$.
* Expected Decimal Transaction Total: $78 + 65 = 143_{10}$.
* Circuit Output Vector: Hundreds $= 1$, Tens $= 4$, Units $= 3 \implies \mathbf{143_{10}}$.

$$78_{10} + 65_{10} = 143_{10} \quad \iff \quad (0111_2, 1000_2) + (0110_2, 0101_2) = (0001_2, 0100_2, 0011_2)$$

Both digit correction flags ($K_U = 1, K_T = 1$) fired correctly, the secondary $+6$ additions adjusted both raw sums, and the cash register arithmetic engine evaluated with 100% mathematical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **BCD Adder**: A specialized combinational arithmetic module that adds two 4-bit Binary-Coded Decimal digits $A$ and $B$ plus carry-in $C_{\text{in}}$, producing a valid 4-bit BCD sum digit $S$ ($0000_2$ to $1001_2$) and a BCD carry-out $C_{\text{out}}$ by incorporating decimal correction hardware.
* **Decimal Correction Logic**: The combinational detection and addition network $K = C_{\text{bin}} + (Z_3 \cdot Z_2) + (Z_3 \cdot Z_1)$ that identifies when a raw 4-bit binary sum exceeds $9_{10}$ ($1001_2$) and automatically injects a $+6_{10}$ ($0110_2$) correction factor to skip the 6 invalid 4-bit binary states, restoring exact BCD decimal alignment.