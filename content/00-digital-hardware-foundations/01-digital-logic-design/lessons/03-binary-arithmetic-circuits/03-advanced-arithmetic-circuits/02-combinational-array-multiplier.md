# Combinational Array Multipliers and Partial Product Matrix Accumulation

## The Performance Disaster of Sequential Repeated Addition

In digital computer systems, multiplication is a foundational arithmetic operation used in signal processing, 3D graphics rendering, neural network calculations, and scientific computing. When an arithmetic unit needs to compute the product of two binary numbers—a multiplicand $A$ and a multiplier $B$—it must calculate the mathematical product $Y = A \times B$.

If a hardware designer attempts to perform multiplication by using a simple multi-bit adder repeatedly inside a loop (software-style repeated addition), the system encounters a catastrophic performance disaster.

To multiply an $N$-bit number $A$ by an $N$-bit number $B$ using repeated addition:
* The processor initializes an accumulator to zero.
* The processor executes an addition loop that adds $A$ to the accumulator $B$ times.

```text
THE REPEATED ADDITION PERFORMANCE DISASTER

 Problem: Compute 13 x 11 (Both 4-bit numbers)
 Loop Step 1 : Accumulator = 0  + 13 = 13
 Loop Step 2 : Accumulator = 13 + 13 = 26
 Loop Step 3 : Accumulator = 26 + 13 = 39
      :                             :
 Loop Step 11: Accumulator = 130 + 13 = 143  (11 Addition Cycles!)
```

Consider the execution latency of this loop. If multiplier $B$ is a large 16-bit binary integer such as $65,535_{10}$, the processor must execute **65,535 consecutive addition cycles** just to compute a single multiplication product! For 32-bit or 64-bit numbers, a repeated addition loop would require billions of clock cycles, reducing a 3.0 GHz processor down to the speed of a pocket calculator.

Why should a processor waste thousands of clock cycles running an addition loop when human beings can multiply numbers on paper in a single step using long multiplication?

In paper-and-pencil long multiplication, we do not add $A$ to itself $B$ times. Instead, we multiply the multiplicand $A$ by **each individual digit** of the multiplier $B$, producing a set of shifted rows called **Partial Products**, and then sum those partial product rows together.

In binary arithmetic, long multiplication is even simpler than in decimal arithmetic! Because binary digits are restricted to $0$ and $1$, multiplying a binary number by $1$ keeps the number unchanged, while multiplying by $0$ turns the entire row to zero. Each partial product is generated instantly using simple 2-input AND gates!

To calculate binary multiplication in a single combinational pass, digital engineering uses a two-dimensional grid of AND gates and full adders: the **Combinational Array Multiplier**. By generating a **Partial Product Matrix** in parallel and accumulating all partial products simultaneously through a physical adder grid, an Array Multiplier computes the complete $2N$-bit product of two binary numbers without requiring a single clock cycle of loop iteration.

---

## The Grid Paper Multiplication Method: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an Array Multiplier calculates a binary product, let us step away from silicon transistors and look at how we perform long multiplication on grid paper in primary school.

Imagine multiplying two 2-digit decimal numbers on paper: $23 \times 14$.

```text
PAPER LONG MULTIPLICATION IN DECIMAL

          Multiplicand A:        2 3
          Multiplier B  :    x   1 4
                             ───────
  First Partial Product :        9 2   (23 x 4)
  Second Partial Product:      2 3 .   (23 x 1 with 1-digit left shift)
                             ───────
  Final Accumulated Sum :      3 2 2
```

Let us break down the exact physical steps your hand performs on paper:
1. **First Row Generation**: You multiply $23$ by the LSB digit $4$, writing down the first partial product $92$.
2. **Second Row Generation**: You multiply $23$ by the next digit $1$, writing down $23$. But you **shift this second row one position to the left** (padding the right side with a dot or zero) because the digit $1$ sits in the tens place ($10^1$).
3. **Column Summation**: You sum the aligned columns vertically: $92 + 230 = 322$.

Now, let us perform the exact same long multiplication process in **Binary** on two 4-bit numbers: $13_{10}$ ($1101_2$) and $11_{10}$ ($1011_2$).

```text
PAPER LONG MULTIPLICATION IN BINARY

          Multiplicand A:          1  1  0  1   (Decimal 13)
          Multiplier B  :    x     1  0  1  1   (Decimal 11)
                                   ───────────
  Row 0 (x Bit B0 = 1)  :          1  1  0  1   (Shift 0)
  Row 1 (x Bit B1 = 1)  :       1  1  0  1  .   (Shift 1)
  Row 2 (x Bit B2 = 0)  :    0  0  0  0  .  .   (Shift 2)
  Row 3 (x Bit B3 = 1)  : 1  1  0  1  .  .  .   (Shift 3)
                                   ───────────
  Final Accumulated Sum : 1  0  0  0  1  1  1  1  (Decimal 143!)
```

Look at how simple binary long multiplication is compared to decimal:
* Every row is either an **exact copy** of Multiplicand $A$ (if the multiplier bit is $1$) or a row of **all zeros** (if the multiplier bit is $0$).
* Each row $j$ is shifted left by $j$ bit positions.
* The final result is obtained by adding the four shifted rows together.

An **Array Multiplier** is simply a physical grid of logic gates built on a microchip that performs this exact grid paper process. An array of AND gates generates all four rows simultaneously, and a two-dimensional grid of Full Adders sums the columns together in a single pass!

---

## Mechanics of the Partial Product Matrix and Array Multiplier Architecture

To master the design of combinational multipliers, we must dissect the formal mechanics of its two core primitives:
1. **The Partial Product Matrix**: How parallel AND gates multiply every bit of $A$ with every bit of $B$ to form a two-dimensional grid of partial product bits.
2. **The Array Multiplier**: How a two-dimensional grid of Full Adders and Half Adders accumulates the matrix columns into a $2N$-bit product output vector.

---

### Primitive 1: The Partial Product Matrix

Let us define the binary multiplication of an $M$-bit multiplicand $\mathbf{A}$ and an $N$-bit multiplier $\mathbf{B}$:

$$
\mathbf{A} = (A_{M-1}, A_{M-2}, \dots, A_1, A_0)
$$

$$
\mathbf{B} = (B_{N-1}, B_{N-2}, \dots, B_1, B_0)
$$

Where:
* $A_i$ represents the $i$-th bit of the multiplicand (for $0 \le i \le M-1$).
* $B_j$ represents the $j$-th bit of the multiplier (for $0 \le j \le N-1$).

#### 1. Single-Bit Partial Product Generation ($P_{i,j}$)
To multiply bit $A_i$ by bit $B_j$, we evaluate their single-bit binary product:

$$
P_{i,j} = A_i \cdot B_j
$$

Where:
* $P_{i,j}$ is the single-bit partial product at row $j$, column $i$.
* $\cdot$ represents the logical AND operation.

```text
SINGLE-BIT PARTIAL PRODUCT AND GATE

 Bit A_i ──┐
           ├──► [ AND Gate ] ──► Partial Product Bit P_i,j (A_i * B_j)
 Bit B_j ──┘
```

Notice why a simple 2-input AND gate performs single-bit multiplication perfectly:
* $0 \cdot 0 = 0$
* $0 \cdot 1 = 0$
* $1 \cdot 0 = 0$
* $1 \cdot 1 = 1$

#### 2. The $M \times N$ Partial Product Matrix Structure

For an $M$-bit multiplicand and an $N$-bit multiplier, the total number of single-bit partial products generated is $M \times N$. 

These $M \times N$ partial product bits are arranged in an $N$-row matrix, where row $j$ is shifted left by $j$ column positions to account for the binary power weight $2^{i+j}$:

```text
THE 4 x 4 PARTIAL PRODUCT MATRIX

 Column Weight :   2^7    2^6    2^5    2^4    2^3    2^2    2^1    2^0
────────────────┼───────────────────────────────────────────────────────
 Row 0 (x B0)   │                       P3,0   P2,0   P1,0   P0,0
 Row 1 (x B1)   │                P3,1   P2,1   P1,1   P0,1
 Row 2 (x B2)   │         P3,2   P2,2   P1,2   P0,2
 Row 3 (x B3)   │  P3,3   P2,3   P1,3   P0,3
────────────────┼───────────────────────────────────────────────────────
 Product Bits Y :  Y7     Y6     Y5     Y4     Y3     Y2     Y1     Y0
```

Where:
* $P_{i,j} = A_i \cdot B_j$ is the partial product bit for multiplicand bit $i$ and multiplier bit $j$.
* $Y_k$ is the $k$-th bit of the final accumulated product vector $\mathbf{Y}$.

#### 3. Output Bit-Width Theorem
The product of an $M$-bit number and an $N$-bit number requires a maximum output width of **$M + N$ bits**:

$$\text{Bit Width of Product } \mathbf{Y} = M + N$$

For a 4-bit $\times$ 4-bit multiplication ($M=4, N=4$), the product $\mathbf{Y}$ spans $4 + 4 = 8$ bits ($Y_7, Y_6, Y_5, Y_4, Y_3, Y_2, Y_1, Y_0$).

Why? Consider the maximum possible values for 4-bit unsigned integers:
* Maximum $A = 1111_2 = 15_{10}$.
* Maximum $B = 1111_2 = 15_{10}$.
* Maximum Product $Y = 15 \times 15 = 225_{10} = 11100001_2$ (requires 8 bits!).

---

### Primitive 2: The Array Multiplier Architecture

A **Combinational Array Multiplier** is a two-dimensional grid of logic hardware that computes all $M \times N$ partial products in parallel using an array of AND gates, and accumulates the columns using an array of Half Adders and Full Adders.

#### 1. Anatomy of a 2x2 Array Multiplier

To understand the grid layout without getting overwhelmed, let us build a 2-bit $\times$ 2-bit Array Multiplier for inputs $A = (A_1, A_0)$ and $B = (B_1, B_0)$.

The product $Y = A \times B$ spans $2 + 2 = 4$ bits ($Y_3, Y_2, Y_1, Y_0$).

The partial product matrix for a 2x2 multiplier contains $2 \times 2 = 4$ AND terms:

```text
2x2 PARTIAL PRODUCT MATRIX

 Column Weight :   2^3      2^2      2^1      2^0
────────────────┼─────────────────────────────────
 Row 0 (x B0)   │                   A1*B0    A0*B0
 Row 1 (x B1)   │          A1*B1    A0*B1
────────────────┼─────────────────────────────────
 Product Bits Y :  Y3       Y2       Y1       Y0
```

Let us evaluate the column additions from right to left (LSB to MSB):

1. **Column 0 ($2^0$ weight)**:
   Contains only one term: $A_0 \cdot B_0$.
   $$Y_0 = A_0 \cdot B_0$$
   No adder needed for Bit 0!

2. **Column 1 ($2^1$ weight)**:
   Contains two terms: $(A_1 \cdot B_0)$ and $(A_0 \cdot B_1)$.
   We add these two terms together using a **Half Adder (HA 1)**:
   * Inputs: $(A_1 \cdot B_0)$ and $(A_0 \cdot B_1)$.
   * Sum Output: $Y_1 = (A_1 \cdot B_0) \oplus (A_0 \cdot B_1)$.
   * Carry Output: $C_1 = (A_1 \cdot B_0) \cdot (A_0 \cdot B_1)$.

3. **Column 2 ($2^2$ weight)**:
   Contains one term $(A_1 \cdot B_1)$ plus incoming carry $C_1$ from Column 1.
   We add these two terms using a **Half Adder (HA 2)**:
   * Inputs: $(A_1 \cdot B_1)$ and $C_1$.
   * Sum Output: $Y_2 = (A_1 \cdot B_1) \oplus C_1$.
   * Carry Output: $Y_3 = (A_1 \cdot B_1) \cdot C_1$.

```text
COMPLETE 2x2 ARRAY MULTIPLIER SCHEMATIC

A0, B0 ──► [ AND 00 ] ─────────────────────────────────► Product Y0

A1, B0 ──► [ AND 10 ] ──┐
                        ├──► [ Half Adder 1 ] ─────────► Product Y1
A0, B1 ──► [ AND 01 ] ──┘         │
                                  │ Carry C1
A1, B1 ──► [ AND 11 ] ────────────│─────────┐
                                  ▼         ▼
                         ┌──────────────────────┐
                         │     Half Adder 2     ├──► Product Y2
                         │                      ├──► Product Y3
                         └──────────────────────┘
```

Look at how simple and elegant this 2x2 multiplier is!
* 4 AND gates generate the partial products.
* 2 Half Adders sum the columns to produce the 4-bit output $Y_3 Y_2 Y_1 Y_0$.

---

#### 2. Architecture of a 4x4 Array Multiplier

Scaling up to a 4-bit $\times$ 4-bit multiplier ($A_3..A_0 \times B_3..B_0$), the circuit forms a regular, repeating two-dimensional grid:

* **16 AND Gates**: Arranged in a $4 \times 4$ array to generate all 16 partial products $P_{i,j} = A_i \cdot B_j$ in parallel.
* **4 Half Adders (HA)**: Used at row boundaries where there is no incoming carry bit.
* **8 Full Adders (FA)**: Used in the interior of the grid to add three bits simultaneously (two partial product bits + one incoming carry bit).

```text
4x4 ARRAY MULTIPLIER GRID ARCHITECTURE

Row 0 (ANDs) ──► P0,0   P1,0   P2,0   P3,0 ──► Output Y0
                  │      │      │      │
Row 1 Adders ──► [HA]   [FA]   [FA]   [FA]
                  │      │      │      │
Row 2 Adders ──► [HA]   [FA]   [FA]   [FA]
                  │      │      │      │
Row 3 Adders ──► [HA]   [FA]   [FA]   [FA]
                  │      │      │      │
Outputs:         Y1     Y2     Y3    Y4..Y7
```

Let us trace the physical flow of data through this two-dimensional grid:
1. **Parallel Generation**: At time $t = 0$, all 16 AND gates compute $P_{i,j} = A_i \cdot B_j$ simultaneously in one AND-gate delay ($t_{\text{and}}$).
2. **Row-by-Row Accumulation**:
   * **Row 1 Adders** sum Row 0 partial products with Row 1 partial products.
   * **Row 2 Adders** sum the results of Row 1 with Row 2 partial products.
   * **Row 3 Adders** sum the results of Row 2 with Row 3 partial products, emitting final product bits $Y_7 Y_6 Y_5 Y_4 Y_3 Y_2 Y_1 Y_0$.

Each row of the array acts as a multi-bit adder that adds one shifted partial product row to the accumulated sum coming from the row above!

---

## Performance Analysis: Gate Count, Silicon Area, and Critical Path Delay

To evaluate the engineering impact of the Combinational Array Multiplier, let us analyze its hardware resource consumption and signal propagation latency.

### 1. Hardware Resource Scaling ($O(N^2)$ Area)

For an $N$-bit $\times$ $N$-bit Array Multiplier:
* **AND Gates**: $N^2$ AND gates.
* **Half Adders**: $N$ Half Adders.
* **Full Adders**: $N(N - 2)$ Full Adders.

```text
ARRAY MULTIPLIER RESOURCE CONSUMPTION TABLE

 Word Width (N) │ Partial Product AND Gates │ Half Adders (N) │ Full Adders (N*(N-2)) │ Total Logic Gates
────────────────┼───────────────────────────┼─────────────────┼───────────────────────┼───────────────────
  2 Bits (2x2)  │             4             │        2        │           0           │        8 Gates
  4 Bits (4x4)  │            16             │        4        │           8           │       52 Gates
  8 Bits (8x8)  │            64             │        8        │          48           │      260 Gates
 16 Bits (16x16)│           256             │       16        │         224           │    1,216 Gates
 32 Bits (32x32)│         1,024             │       32        │         960           │    4,992 Gates
```

Notice the quadratic growth $O(N^2)$:
* A 4x4 multiplier uses 52 logic gates.
* A 32x32 multiplier uses nearly 5,000 logic gates!

While 5,000 gates is a significant amount of silicon, modern silicon dies contain billions of transistors. Paying 5,000 gates for an instantaneous $O(1)$-clock 32-bit multiplier is an outstanding trade-off for high-speed processors!

---

### 2. Critical Path Delay Analysis ($O(N)$ Latency)

What is the worst-case propagation delay $T_{\text{mult}}$ through an $N \times N$ Array Multiplier?

Let us trace the longest signal path through the grid:
1. **Initial AND Stage**: All partial products $P_{i,j}$ are generated in parallel in $1 \cdot t_{\text{and}}$ delay.
2. **Vertical Array Ripple**: A sum/carry signal must ripple vertically through $N-1$ adder rows.
3. **Horizontal Bottom Ripple**: The carries in the very bottom adder row must ripple horizontally across $N-1$ adders to reach the most significant bit $Y_{2N-1}$.

```text
CRITICAL PATH IN AN N x N ARRAY MULTIPLIER

 Total Array Delay = [ 1 AND Gate Delay ] + [ Vertical Array Ripple ] + [ Horizontal Bottom Ripple ]
```

Mathematically, the worst-case Critical Path Delay $T_{\text{mult}}$ for an $N \times N$ Array Multiplier is:

$$
T_{\text{mult}} = t_{\text{and}} + (N - 1) \cdot t_{\text{adder\_vertical}} + (N - 1) \cdot t_{\text{carry}}
$$

Where:
* $t_{\text{and}}$ is the propagation delay of a 2-input AND gate.
* $N$ is the operand bit width.
* $t_{\text{adder\_vertical}}$ is the delay through one adder row in the vertical grid.
* $t_{\text{carry}}$ is the carry propagation delay across one adder cell in the bottom row.

Simplifying, the propagation delay scales **linearly** with bit width:

$$
T_{\text{mult}} = O(N)
$$

Compare this latency:
* **Repeated Addition Loop**: $O(2^N)$ clock cycles (Up to 65,535 cycles for 16 bits!).
* **Combinational Array Multiplier**: $O(N)$ gate delays in **1 single clock cycle**!

The Array Multiplier reduces multiplication execution time from tens of thousands of clock cycles down to a single clock pass.

---

## Solved Industrial Engineering Exercise: 4x4 Array Multiplier DSP Subsystem

To consolidate your complete mastery of partial product matrices, AND-gate generation, adder grid accumulation, and multi-bit product bit extraction, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit design team is synthesizing the 4x4 unsigned binary multiplier module for a digital hearing aid's DSP audio volume controller.

The multiplier receives two 4-bit unsigned binary input vectors:
* Multiplicand $\mathbf{A} = (A_3, A_2, A_1, A_0) = 1101_2$ ($13_{10}$).
* Multiplier $\mathbf{B} = (B_3, B_2, B_1, B_0) = 1011_2$ ($11_{10}$).

```text
4x4 AUDIO DSP MULTIPLIER SUBSYSTEM

 Multiplicand A[3:0] (13) ──┐
                            ├──► [ 4x4 Array Multiplier ] ──► Product Y[7:0] (143)
 Multiplier B[3:0]   (11) ──┘
```

The module must output an 8-bit product vector $\mathbf{Y} = (Y_7, Y_6, Y_5, Y_4, Y_3, Y_2, Y_1, Y_0)$.

#### Physical Gate Delays:
* 2-Input AND Gate Delay: $t_{\text{and}} = 0.5\text{ ns}$
* Full Adder Carry Delay: $t_{\text{carry}} = 0.8\text{ ns}$
* Full Adder Sum Delay: $t_{\text{sum}} = 1.2\text{ ns}$

#### Your Objective

1. Calculate the full $4 \times 4$ Partial Product Matrix values $P_{i,j} = A_i \cdot B_j$ for the given inputs $\mathbf{A} = 1101_2$ and $\mathbf{B} = 1011_2$.
2. Write out the 4 partial product rows shifted by their column weights.
3. Perform step-by-step column accumulation to derive all 8 product bits ($Y_7$ through $Y_0$).
4. Calculate the total critical path propagation delay $T_{\text{mult}}$ for this 4x4 Array Multiplier.
5. Verify mathematical correctness against decimal arithmetic ($13 \times 11 = 143_{10}$).

---

### Step-by-Step Derivation

#### Step 1: Calculate the $4 \times 4$ Partial Product Matrix ($P_{i,j}$)

Operands:
* $\mathbf{A} = 1101_2 \implies A_3=1, A_2=1, A_1=0, A_0=1$
* $\mathbf{B} = 1011_2 \implies B_3=1, B_2=0, B_1=1, B_0=1$

We evaluate $P_{i,j} = A_i \cdot B_j$ for all 16 AND gates in parallel:

##### Row 0 ($j = 0$, $B_0 = 1$):
* $P_{0,0} = A_0 \cdot B_0 = 1 \cdot 1 = \mathbf{1}$
* $P_{1,0} = A_1 \cdot B_0 = 0 \cdot 1 = \mathbf{0}$
* $P_{2,0} = A_2 \cdot B_0 = 1 \cdot 1 = \mathbf{1}$
* $P_{3,0} = A_3 \cdot B_0 = 1 \cdot 1 = \mathbf{1}$
* Row 0 Vector: $P_{3,0} P_2,0 P_1,0 P_0,0 = 1101_2$ (Shift 0).

##### Row 1 ($j = 1$, $B_1 = 1$):
* $P_{0,1} = A_0 \cdot B_1 = 1 \cdot 1 = \mathbf{1}$
* $P_{1,1} = A_1 \cdot B_1 = 0 \cdot 1 = \mathbf{0}$
* $P_{2,1} = A_2 \cdot B_1 = 1 \cdot 1 = \mathbf{1}$
* $P_{3,1} = A_3 \cdot B_1 = 1 \cdot 1 = \mathbf{1}$
* Row 1 Vector: $P_{3,1} P_2,1 P_1,1 P_0,1 = 1101_2$ (Shifted left 1 position).

##### Row 2 ($j = 2$, $B_2 = 0$):
* Since $B_2 = 0$, all partial products in Row 2 are $0$:
* $P_{0,2} = 0, P_{1,2} = 0, P_{2,2} = 0, P_{3,2} = 0$.
* Row 2 Vector: $0000_2$ (Shifted left 2 positions).

##### Row 3 ($j = 3$, $B_3 = 1$):
* $P_{0,3} = A_0 \cdot B_3 = 1 \cdot 1 = \mathbf{1}$
* $P_{1,3} = A_1 \cdot B_3 = 0 \cdot 1 = \mathbf{0}$
* $P_{2,3} = A_2 \cdot B_3 = 1 \cdot 1 = \mathbf{1}$
* $P_{3,3} = A_3 \cdot B_3 = 1 \cdot 1 = \mathbf{1}$
* Row 3 Vector: $1101_2$ (Shifted left 3 positions).

```text
EVALUATED PARTIAL PRODUCT MATRIX

 Column Weight :   2^7    2^6    2^5    2^4    2^3    2^2    2^1    2^0
────────────────┼───────────────────────────────────────────────────────
 Row 0 (x B0=1) │                       1      1      0      1      (1101_2)
 Row 1 (x B1=1) │                1      1      0      1      .      (1101_2)
 Row 2 (x B2=0) │         0      0      0      0      .      .      (0000_2)
 Row 3 (x B3=1) │  1      1      0      1      .      .      .      (1101_2)
```

---

#### Step 2: Accumulating Column Sums Through the Adder Grid

Now we accumulate the matrix columns from right (LSB, $2^0$) to left (MSB, $2^7$):

##### Column 0 ($2^0$ Weight):
* Single term: $P_{0,0} = 1$.
* **Product Bit $Y_0 = 1$**, Carry $C_{c0} = 0$.

##### Column 1 ($2^1$ Weight):
* Terms: $P_{1,0} (0) + P_{0,1} (1) + C_{c0} (0) = 0 + 1 + 0 = 1$.
* **Product Bit $Y_1 = 1$**, Carry $C_{c1} = 0$.

##### Column 2 ($2^2$ Weight):
* Terms: $P_{2,0} (1) + P_{1,1} (0) + P_{0,2} (0) + C_{c1} (0) = 1 + 0 + 0 + 0 = 1$.
* **Product Bit $Y_2 = 1$**, Carry $C_{c2} = 0$.

##### Column 3 ($2^3$ Weight):
* Terms: $P_{3,0} (1) + P_{2,1} (1) + P_{1,2} (0) + P_{0,3} (1) + C_{c2} (0)$.
* Sum: $1 + 1 + 0 + 1 + 0 = 3_{10} = 11_2$.
* **Product Bit $Y_3 = 1$**, Carry $C_{c3} = 1$ (weight $2^4$).

##### Column 4 ($2^4$ Weight):
* Terms: $P_{3,1} (1) + P_{2,2} (0) + P_{1,3} (0) + \text{Carry } C_{c3} (1)$.
* Sum: $1 + 0 + 0 + 1 = 2_{10} = 10_2$.
* **Product Bit $Y_4 = 0$**, Carry $C_{c4} = 1$ (weight $2^5$).

##### Column 5 ($2^5$ Weight):
* Terms: $P_{3,2} (0) + P_{2,3} (1) + \text{Carry } C_{c4} (1)$.
* Sum: $0 + 1 + 1 = 2_{10} = 10_2$.
* **Product Bit $Y_5 = 0$**, Carry $C_{c5} = 1$ (weight $2^6$).

##### Column 6 ($2^6$ Weight):
* Terms: $P_{3,3} (1) + \text{Carry } C_{c5} (1)$.
* Sum: $1 + 1 = 2_{10} = 10_2$.
* **Product Bit $Y_6 = 0$**, Carry $C_{c6} = 1$ (weight $2^7$).

##### Column 7 ($2^7$ Weight):
* Terms: Carry $C_{c6} (1)$.
* **Product Bit $Y_7 = 1$**.

```text
FINAL ACCUMULATED PRODUCT BIT VECTOR

 Product Vector Y[7:0] = ( Y7  Y6  Y5  Y4  Y3  Y2  Y1  Y0 )
                         (  1   0   0   0   1   1   1   1  ) = 10001111_2
```

---

#### Step 3: Calculate Critical Path Delay ($T_{\text{mult}}$)

For a 4x4 Array Multiplier, the critical path passes through:
1. One 2-input AND gate to generate the initial partial products ($t_{\text{and}} = 0.5\text{ ns}$).
2. Three vertical adder stages ($3 \times t_{\text{carry}} = 3 \times 0.8\text{ ns} = 2.4\text{ ns}$).
3. Three horizontal carry-ripple adders in the bottom row ($3 \times t_{\text{carry}} = 3 \times 0.8\text{ ns} = 2.4\text{ ns}$).

$$
T_{\text{mult}} = t_{\text{and}} + 3 \cdot t_{\text{carry}} + 3 \cdot t_{\text{carry}}
$$

$$
T_{\text{mult}} = 0.5\text{ ns} + 2.4\text{ ns} + 2.4\text{ ns} = \mathbf{5.3 \text{ ns}}
$$

The 4x4 Array Multiplier computes the complete 8-bit product in **$5.3\text{ nanoseconds}$**!

---

#### Step 4: Verification Against Decimal Arithmetic

Converting inputs and output to decimal:
* Multiplicand $\mathbf{A} = 1101_2 = 13_{10}$.
* Multiplier $\mathbf{B} = 1011_2 = 11_{10}$.
* Expected Product: $13 \times 11 = 143_{10}$.
* Circuit Output Vector: $\mathbf{Y} = 10001111_2$.

Converting binary output $\mathbf{Y} = 10001111_2$ to decimal:

$$\mathbf{Y} = 1 \cdot 2^7 + 0 \cdot 2^6 + 0 \cdot 2^5 + 0 \cdot 2^4 + 1 \cdot 2^3 + 1 \cdot 2^2 + 1 \cdot 2^1 + 1 \cdot 2^0$$

$$\mathbf{Y} = 128 + 0 + 0 + 0 + 8 + 4 + 2 + 1 = 143_{10}$$

$$13_{10} \times 11_{10} = 143_{10} \quad \iff \quad 1101_2 \times 1011_2 = 10001111_2$$

The Combinational Array Multiplier computed the $2N$-bit product in a single pass with 100% mathematical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Partial Product Matrix**: The two-dimensional $M \times N$ matrix of single-bit AND terms $P_{i,j} = A_i \cdot B_j$ generated in parallel by multiplying every bit of multiplier $B$ with every bit of multiplicand $A$, where each row $j$ is left-shifted by $j$ bit positions.
* **Array Multiplier**: The two-dimensional combinational grid of Full Adders and Half Adders that accumulates all partial product matrix columns in a single pass to output a $2N$-bit product vector $Y = A \times B$ in $O(1)$ clock cycles, replacing multi-cycle addition loops with pure high-speed silicon logic.
