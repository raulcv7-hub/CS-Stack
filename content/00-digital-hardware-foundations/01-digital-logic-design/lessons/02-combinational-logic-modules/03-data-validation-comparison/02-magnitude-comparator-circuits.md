# Magnitude Comparator Circuit Synthesis and Cascading Comparison Architecture

## The High Cost of Arithmetic Subtraction for Simple Relational Decisions

In computer systems, central processors, graphics cards, and memory controllers spend a vast amount of time making simple relational decisions. A cache controller asks: *"Does the memory address requested by the CPU ($A$) equal the tag address currently stored in cache line $0$ ($B$)?'* A graphics rendering pipeline asks: *"Is the depth coordinate of a new pixel ($A$) less than the depth coordinate of the existing pixel in the frame buffer ($B$)?'* An industrial motor safety governor asks: *"Is the measured rotational speed ($A$) greater than the maximum safe threshold ($B$)?'*

If a digital designer attempts to solve these relational questions using standard arithmetic subtractor circuits—computing $A - B$ and inspecting the sign bit or zero flag of the result—the system pays a heavy performance and energy penalty.

An $N$-bit arithmetic subtractor requires multi-stage full adders, controlled complementers, and ripple-carry or borrow-propagation chains. For a 32-bit comparison, an arithmetic subtractor must propagate carry-borrow signals through 32 consecutive logic gate stages before emitting a valid result.

```text
THE ARITHMETIC SUBTRACTION COMPARISON BOTTLENECK

 Input Word A (32 Bits) ──┐
                          ├──► [ 32-Bit Arithmetic Subtractor ] ──► Sign Bit (A < B?)
 Input Word B (32 Bits) ──┘    (Heavy Carry/Borrow Propagation)    Zero Bit (A = B?)
                                              │
                                              ▼
                                 32 Gate Delays & High Power!
```

Using a full arithmetic subtractor just to find out whether two numbers are equal, or which one is larger, is like driving a heavy 10-ton dump truck to the grocery store to buy a single apple. It gets the job done, but it consumes an enormous amount of fuel and takes far too long to accelerate and park.

Relational comparison does not require calculating the exact numerical difference $A - B$. It only requires answering three mutually exclusive Boolean questions:
1. Is $A$ equal to $B$ ($A = B$)?
2. Is $A$ strictly greater than $B$ ($A > B$)?
3. Is $A$ strictly less than $B$ ($A < B$)?

To answer these questions instantaneously with minimum hardware footprint, digital engineering uses a specialized combinational decision module: the **Magnitude Comparator**. By utilizing **Equality Comparators** built from parallel XNOR gates and evaluating bit significance from MSB to LSB through a **Magnitude Cascade**, a magnitude comparator determines relational status in a fraction of the time required by an arithmetic subtractor.

---

## The Lexicographical Dictionary Check: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how a magnitude comparator evaluates two binary numbers, let us step away from microchips and imagine comparing two numbers written on a piece of paper: $542$ and $539$.

How do you, as a human being, decide which number is larger? Do you perform long division or subtract $539$ from $542$ on paper? No! Your brain executes a high-speed, left-to-right visual scan starting at the **Most Significant Digit** (the hundreds place):

```text
HUMAN DIGIT-BY-DIGIT MAGNITUDE COMPARISON

 Hundreds Place (MSB)        Tens Place                 Units Place (LSB)
 Number A :  5               Number A :  4              Number A :  2
 Number B :  5               Number B :  3              Number B :  9
   │                           │                          │
   ▼                           ▼                          ▼
 [ 5 == 5 ]                  [ 4 > 3 ]                  [ IGNORED! ]
 (Equal! Move Right)         (DECISION MADE! A > B)     (4 > 3 already decided!)
```

Let us trace your brain's exact decision process:
1. **Compare the Hundreds Place (MSB)**: You compare $5$ and $5$. They are **equal**. Because the most significant digits are equal, you cannot make a decision yet. You step down to the next most significant digit (the tens place).
2. **Compare the Tens Place**: You compare $4$ and $3$. Since $4$ is strictly greater than $3$, you make an immediate, definitive choice: **$542$ is greater than $539$ ($A > B$)!**
3. **Ignore the Units Place (LSB)**: Look at the units place: Number $B$ has a $9$, while Number $A$ has only a $2$. Does that $9$ matter? Absolutely not! Because Number $A$ won at the tens place, the units place is completely irrelevant. You never even look at it!

This left-to-right, significance-first comparison is the exact physical operation of a **Magnitude Comparator**:
* It checks for equality at the highest bit position ($A_{N-1}$ vs $B_{N-1}$).
* If the highest bits match, it moves down to the next bit position ($A_{N-2}$ vs $B_{N-2}$).
* The moment it finds a bit position where $A_k \neq B_k$, the bit that holds a $1$ wins the comparison instantly ($A > B$ if $A_k=1, B_k=0$), and all lower-order bits ($A_{k-1} \dots A_0$) are completely ignored!

---

## Mechanics of Magnitude Comparator Synthesis

To master magnitude comparator design, we must dissect the formal mechanics of its two core primitives:
1. **The Equality Comparator**: How XNOR logic gates perform parallel bit-by-bit equivalence checking to determine if $A = B$.
2. **The Magnitude Cascade**: How greater-than and less-than priority logic evaluates bit significance from MSB to LSB and propagates comparison results across multi-bit stages.

---

### Primitive 1: The Single-Bit Magnitude Comparator

The fundamental building block of all comparison logic is the 1-bit Magnitude Comparator. It takes two 1-bit binary inputs, $A$ and $B$, and produces three mutually exclusive binary outputs:
* $A_{EQB}$: Active ($1$) if $A = B$.
* $A_{GTB}$: Active ($1$) if $A > B$.
* $A_{LTB}$: Active ($1$) if $A < B$.

```text
1-BIT MAGNITUDE COMPARATOR FUNCTIONAL BLOCK

 Input A ───┐                     ┌───► Output A_EQB (A == B)
            ├───► [ 1-Bit Comp ] ─┼───► Output A_GTB (A > B)
 Input B ───┘                     └───► Output A_LTB (A < B)
```

#### 1. Truth Table Derivation
Let us construct the truth table for all 4 possible combinations of inputs $A$ and $B$:

```text
1-BIT MAGNITUDE COMPARATOR TRUTH TABLE

 Input A │ Input B │ A_EQB (A == B) │ A_GTB (A > B) │ A_LTB (A < B) │ Mathematical Condition
─────────┼─────────┼────────────────┼───────────────┼───────────────┼─────────────────────────
    0    │    0    │       1        │       0       │       0       │ 0 == 0 (Equal)
    0    │    1    │       0        │       0       │       1       │ 0 < 1  (Less Than)
    1    │    0    │       0        │       1       │       0       │ 1 > 0  (Greater Than)
    1    │    1    │       1        │       0       │       0       │ 1 == 1 (Equal)
```

#### 2. Boolean Equation Extraction for 1-Bit Comparison

##### 1. Equality Equation ($A_{EQB}$):
The equality output $A_{EQB}$ is $1$ when both inputs are $0$ ($A=0, B=0$) OR when both inputs are $1$ ($A=1, B=1$).

$$
A_{EQB} = (\overline{A} \cdot \overline{B}) + (A \cdot B) = A \odot B
$$

Where:
* $A_{EQB}$ is the single-bit equality output.
* $A$ and $B$ are the single-bit inputs.
* $\odot$ is the formal mathematical symbol for the **XNOR (Exclusive-NOR)** operation.

The XNOR gate is the fundamental hardware primitive for equality testing!

##### 2. Greater-Than Equation ($A_{GTB}$):
The greater-than output $A_{GTB}$ is $1$ if and only if $A = 1$ AND $B = 0$:

$$
A_{GTB} = A \cdot \overline{B}
$$

##### 3. Less-Than Equation ($A_{LTB}$):
The less-than output $A_{LTB}$ is $1$ if and only if $A = 0$ AND $B = 1$:

$$
A_{LTB} = \overline{A} \cdot B
$$

Notice a key mathematical property: **The three outputs are strictly mutually exclusive and exhaustive**. Exactly one output is $1$ for any input combination:

$$
A_{EQB} + A_{GTB} + A_{LTB} = 1
$$

```text
1-BIT MAGNITUDE COMPARATOR GATE SCHEMATIC

 Input A ──┬───────────┬─────────────►┌───────┐
           │           │              │ AND 1 ├──► Output A_GTB (A > B)
 Input B ──┼──[ NOT ]─────► B' ──────►└───────┘
           │           │
           │           └─────────────►┌───────┐
           ├──────────────[ NOT ]────►│ AND 2 ├──► Output A_LTB (A < B)
           │                          └───────┘
           │
           └─────────────────────────►┌───────┐
                                      │ XNOR  ├──► Output A_EQB (A == B)
 Input B ────────────────────────────►└───────┘
```

---

### Primitive 2: The 2-Bit Magnitude Comparator

Now let us scale up to comparing two 2-bit binary words:
$$A = (A_1, A_0) \quad \text{and} \quad B = (B_1, B_0)$$

Where $A_1, B_1$ represent the Most Significant Bits (MSBs) and $A_0, B_0$ represent the Least Significant Bits (LSBs).

```text
2-BIT MAGNITUDE COMPARATOR INPUTS

 Word A : [ A1 (MSB) ]  [ A0 (LSB) ]
 Word B : [ B1 (MSB) ]  [ B0 (LSB) ]
```

To compare $A$ and $B$, we define bit-wise equality signals $x_1$ and $x_0$ using XNOR gates:

$$
x_1 = A_1 \odot B_1 = (A_1 \cdot B_1) + (\overline{A_1} \cdot \overline{B_1})
$$

$$
x_0 = A_0 \odot B_0 = (A_0 \cdot B_0) + (\overline{A_0} \cdot \overline{B_0})
$$

Where:
* $x_1 = 1$ if the MSB bits are equal ($A_1 = B_1$).
* $x_0 = 1$ if the LSB bits are equal ($A_0 = B_0$).

#### 1. Deriving Word Equality ($A = B$)
For 2-bit word $A$ to equal 2-bit word $B$, the MSB bits MUST be equal ($x_1 = 1$) **AND** the LSB bits MUST be equal ($x_0 = 1$):

$$
(A = B) = x_1 \cdot x_0 = (A_1 \odot B_1) \cdot (A_0 \odot B_0)
$$

This is a beautiful result! Word equality is simply the logical AND of all individual bit-wise XNOR equality checks!

#### 2. Deriving Word Greater-Than ($A > B$)
When is 2-bit word $A$ strictly greater than 2-bit word $B$?
* **Condition 1**: The MSB of $A$ is greater than the MSB of $B$ ($A_1 > B_1 \implies A_1 \cdot \overline{B_1}$).
* **Condition 2**: The MSBs are equal ($x_1 = 1$) **AND** the LSB of $A$ is greater than the LSB of $B$ ($A_0 > B_0 \implies A_0 \cdot \overline{B_0}$).

Combining these two conditions with a logical OR operator:

$$
(A > B) = (A_1 \cdot \overline{B_1}) + (x_1 \cdot A_0 \cdot \overline{B_0})
$$

#### 3. Deriving Word Less-Than ($A < B$)
When is 2-bit word $A$ strictly less than 2-bit word $B$?
* **Condition 1**: $A_1 < B_1 \implies \overline{A_1} \cdot B_1$.
* **Condition 2**: MSBs are equal ($x_1 = 1$) **AND** $A_0 < B_0 \implies \overline{A_0} \cdot B_0$.

$$
(A < B) = (\overline{A_1} \cdot B_1) + (x_1 \cdot \overline{A_0} \cdot B_0)
$$

```text
2-BIT COMPARATOR LOGIC SCHEMATIC

 Bit-Wise Equivalence Gates:
   A1, B1 ──► [ XNOR 1 ] ────► x1 (MSB Equal)
   A0, B0 ──► [ XNOR 0 ] ────► x0 (LSB Equal)

 Word Equality Generator:
   x1, x0 ──► [ AND Gate ] ──► Output (A == B)

 Greater-Than Logic:
   (A1 * B1') ──────────────┐
                            ├──► [ OR Gate ] ──► Output (A > B)
   (x1 * A0 * B0') ─────────┘
```

---

### Primitive 3: The 4-Bit Magnitude Comparator (74LVC85 Architecture)

Scaling to 4-bit binary words $A = (A_3, A_2, A_1, A_0)$ and $B = (B_3, B_2, B_1, B_0)$, we define four bit-wise equality signals $x_3, x_2, x_1, x_0$:

$$
x_k = A_k \odot B_k \quad \text{for } k \in \{0, 1, 2, 3\}
$$

Where:
* $x_3 = A_3 \odot B_3$ (Bit 3 equality)
* $x_2 = A_2 \odot B_2$ (Bit 2 equality)
* $x_1 = A_1 \odot B_1$ (Bit 1 equality)
* $x_0 = A_0 \odot B_0$ (Bit 0 equality)

#### 1. 4-Bit Equality Equation ($A = B$)
All four bit pairs must be identical simultaneously:

$$
(A = B) = x_3 \cdot x_2 \cdot x_1 \cdot x_0
$$

#### 2. 4-Bit Greater-Than Equation ($A > B$)
Scanning from MSB (Bit 3) down to LSB (Bit 0):

$$
(A > B) = (A_3 \cdot \overline{B_3}) + (x_3 \cdot A_2 \cdot \overline{B_2}) + (x_3 \cdot x_2 \cdot A_1 \cdot \overline{B_1}) + (x_3 \cdot x_2 \cdot x_1 \cdot A_0 \cdot \overline{B_0})
$$

Where:
* $(A_3 \cdot \overline{B_3})$: $A$ wins at Bit 3 (MSB).
* $(x_3 \cdot A_2 \cdot \overline{B_2})$: Bit 3 tied, $A$ wins at Bit 2.
* $(x_3 \cdot x_2 \cdot A_1 \cdot \overline{B_1})$: Bits 3 and 2 tied, $A$ wins at Bit 1.
* $(x_3 \cdot x_2 \cdot x_1 \cdot A_0 \cdot \overline{B_0})$: Bits 3, 2, and 1 tied, $A$ wins at Bit 0 (LSB).

#### 3. 4-Bit Less-Than Equation ($A < B$)
$$
(A < B) = (\overline{A_3} \cdot B_3) + (x_3 \cdot \overline{A_2} \cdot B_2) + (x_3 \cdot x_2 \cdot \overline{A_1} \cdot B_1) + (x_3 \cdot x_2 \cdot x_1 \cdot \overline{A_0} \cdot B_0)
$$

```text
4-BIT MAGNITUDE COMPARATOR ARCHITECTURE

  Word A (A3..A0)    Word B (B3..B0)
        │                  │
        ▼                  ▼
 ┌──────────────────────────────────┐
 │ Parallel XNOR Bit-Equality Array │ ──► Signals x3, x2, x1, x0
 └──────────────────┬───────────────┘
                    │
                    ▼
 ┌──────────────────────────────────┐
 │ MSB-Priority Priority Logic Tree │
 └──────────────────┬───────────────┘
                    │
   ┌────────────────┼────────────────┐
   ▼                ▼                ▼
 Output (A>B)     Output (A==B)    Output (A<B)
```

---

## Magnitude Cascade Architecture: Expanding to 8-Bit, 16-Bit, and 64-Bit Comparators

What if a system needs to compare two 8-bit, 16-bit, or 64-bit numbers, but your hardware component library only contains 4-bit comparator blocks?

To support arbitrary word expansion, 4-bit comparator ICs (such as the industry-standard 74LVC85) include three **Cascading Inputs**:
* $I_{A>B}$: Cascading Greater-Than Input.
* $I_{A=B}$: Cascading Equal Input.
* $I_{A<B}$: Cascading Less-Than Input.

And three corresponding **Expansion Outputs**:
* $O_{A>B}$: Expansion Greater-Than Output.
* $O_{A=B}$: Expansion Equal Output.
* $O_{A<B}$: Expansion Less-Than Output.

```text
4-BIT COMPARATOR WITH CASCADING INTERFACE

 Cascading Inputs                     Expansion Outputs
 I_(A>B) ──┐                           ┌──► O_(A>B)
 I_(A=B) ──┼──► [ 4-Bit Comparator ]  ─┼──► O_(A=B)
 I_(A<B) ──┘    (Inputs A3..0, B3..0)  └──► O_(A<B)
```

### How the Magnitude Cascade Works

When cascading two 4-bit comparators to form an 8-bit comparator for words $A[7:0]$ and $B[7:0]$:

1. **Lower Stage (LSB Unit - Bits 3..0)**:
   * Compares lower nibbles $A[3:0]$ and $B[3:0]$.
   * Its cascading inputs are set to a default state: $I_{A=B} = 1$, $I_{A>B} = 0$, $I_{A<B} = 0$ (assuming lower bits tie unless higher stages dictate otherwise).
2. **Upper Stage (MSB Unit - Bits 7..4)**:
   * Compares upper nibbles $A[7:4]$ and $B[7:4]$.
   * Its cascading inputs ($I_{A>B}, I_{A=B}, I_{A<B}$) are connected **directly to the expansion outputs ($O_{A>B}, O_{A=B}, O_{A<B}$) of the LSB Unit**!

```text
8-BIT CASCADED MAGNITUDE COMPARATOR SCHEMATIC

 LSB Unit (Bits 3..0)                     MSB Unit (Bits 7..4)

 Inputs A[3:0], B[3:0]                     Inputs A[7:4], B[7:4]
        │                                         │
        ▼                                         ▼
 ┌──────────────┐                          ┌──────────────┐
 │ LSB Comp     │ O_(A>B) ───────────────► │ MSB Comp     │ ──► Final O_(A>B)
 │              │ O_(A=B) ───────────────► │              │ ──► Final O_(A=B)
 │ (I_AEQB = 1) │ O_(A<B) ───────────────► │              │ ──► Final O_(A<B)
 └──────────────┘                          └──────────────┘
```

#### How the Cascade Rules Operate in Hardware:
The MSB Unit evaluates its own 4-bit inputs ($A[7:4]$ vs $B[7:4]$) first:
* **If $A[7:4] > B[7:4]$**: The MSB Unit immediately outputs $O_{A>B} = 1$, ignoring its cascading inputs completely!
* **If $A[7:4] < B[7:4]$**: The MSB Unit immediately outputs $O_{A<B} = 1$, ignoring its cascading inputs completely!
* **If $A[7:4] = B[7:4]$ (Tie at MSB!)**: The MSB Unit looks at its cascading inputs! It passes the lower stage's decision ($O_{A>B}, O_{A=B}, O_{A<B}$ from the LSB unit) directly to its final expansion outputs!

```text
CASCADING DECISION TABLE FOR MSB UNIT

 MSB Local Result (A[7:4] vs B[7:4]) │ Final Cascaded Output Action
─────────────────────────────────────┼───────────────────────────────────────────────────
  A[7:4] >  B[7:4] (MSB A Wins)      │ Force Final O_(A>B) = 1 (Ignore LSB Stage)
  A[7:4] <  B[7:4] (MSB B Wins)      │ Force Final O_(A<B) = 1 (Ignore LSB Stage)
  A[7:4] == B[7:4] (MSB Tied!)       │ Pass LSB Stage Results (I_AGTB, I_AEQB, I_ALTB)
```

This cascading architecture allows hardware engineers to chain 4-bit comparators serially to compare 16-bit, 32-bit, or 64-bit numbers with perfect mathematical rigor.

---

## Engineering Reality: Serial Cascade Delay versus Parallel Tree Comparators

While cascading 4-bit comparator ICs serially is simple and modular, physical silicon introduces a propagation delay trade-off when expanding to wide data buses (such as 64-bit CPU addresses).

### 1. Serial Ripple Cascade Delay ($t_{\text{serial}}$)

In a serial ripple cascade, the LSB unit must compute its comparison first and pass its outputs to the next stage, which passes its outputs to the next, rippling all the way to the MSB unit.

For $K$ cascaded 4-bit stages:

$$
t_{\text{serial}} = K \cdot t_{\text{stage}}
$$

Where:
* $t_{\text{serial}}$ is the total comparison delay.
* $K$ is the number of 4-bit comparator stages ($K = \text{Bit Width} / 4$).
* $t_{\text{stage}}$ is the propagation delay of a single 4-bit comparator stage.

For a 64-bit comparison using 16 four-bit stages serially:

$$
t_{\text{serial}} = 16 \cdot t_{\text{stage}}
$$

16 consecutive stage delays can severely slow down a 4 GHz CPU instruction pipeline!

### 2. Parallel Tree Comparator Architecture ($t_{\text{tree}}$)

To eliminate serial ripple delays in high-speed processors, engineers use **Parallel Tree Comparators**:
1. All $K$ four-bit stages evaluate their local 4-bit inputs ($A_k$ vs $B_k$) simultaneously in parallel.
2. A centralized tree-decoder evaluates the local equal/greater/less results in parallel.

```text
PARALLEL TREE COMPARATOR LATENCY REDUCTION

 Serial Cascade : [Stage 1] ──► [Stage 2] ──► [Stage 3] ──► [Stage 4] ──► Output
                   (4 Stage Delays: 4 * t_stage)

 Parallel Tree  : [Stage 1] ──┐
                  [Stage 2] ──┼──► [ Parallel Tree Decoder ] ──► Output
                  [Stage 3] ──┤    (2 Stage Delays: t_stage + t_tree)
                  [Stage 4] ──┘
```

The parallel tree architecture reduces comparison latency from $O(K)$ to $O(\log_2 K)$, allowing 64-bit comparisons to complete in just 2 or 3 gate delays!

---

## Solved Industrial Engineering Exercise: CPU Memory Protection Unit (MPU) Address Range Checker

To consolidate your complete mastery of equality comparators, XNOR bit-wise arrays, MSB-first priority magnitude logic, and cascading comparison trees, we will now walk through a complete, step-by-step computer engineering problem.

---

### Scenario and Parameters

A 32-bit processor's **Memory Protection Unit (MPU)** hardware is designed to prevent rogue software programs from accessing unauthorized memory regions.

The MPU monitors the CPU's current 8-bit memory access address $A = (A_7 \dots A_0)$ and compares it against a fixed 8-bit **Upper Memory Limit Boundary** $B = (B_7 \dots B_0)$.

```text
MPU ADDRESS BOUNDARY CHECKER LAYOUT

 Current Address Bus A[7:0] ──┐
                              ├──► [ 8-Bit Cascaded Comparator ] ──► Violation Flag (V)
 Upper Limit Boundary B[7:0] ─┘                                      (1 if A > B!)
```

The upper memory boundary is hardcoded to $B = 10100100_2$ (decimal 164).

#### System Safety Requirements

1. If the current CPU address $A$ is strictly less than or equal to $B$ ($A \le B$), the memory access is safe: **Violation Flag $V = 0$**.
2. If the current CPU address $A$ is strictly greater than $B$ ($A > B$), an illegal memory access has occurred: **Violation Flag $V = 1$** (triggering an immediate CPU MPU Fault exception!).
3. The comparison must be constructed by cascading two 4-bit magnitude comparator modules ($\text{Comp}_{\text{LSB}}$ for bits 3..0, and $\text{Comp}_{\text{MSB}}$ for bits 7..4).

#### Your Objective

1. Convert upper boundary $B = 164_{10}$ into its 8-bit binary representation $B[7:0]$.
2. Derive the 4-bit greater-than equation ($O_{A>B}$) and equality equation ($O_{A=B}$) for $\text{Comp}_{\text{MSB}}$ comparing $A[7:4]$ against upper boundary $B[7:4] = 1010_2$.
3. Derive the 4-bit greater-than equation ($O_{A>B}$) for $\text{Comp}_{\text{LSB}}$ comparing $A[3:0]$ against lower boundary $B[3:0] = 0100_2$.
4. Wire the cascading connections between $\text{Comp}_{\text{LSB}}$ and $\text{Comp}_{\text{MSB}}$ to produce the final Violation Flag $V = (A > B)$.
5. Verify MPU operation across three critical memory access address scenarios.

---

### Step-by-Step Derivation

#### Step 1: Binary Conversion of Upper Memory Boundary $B$

Decimal 164 converted to 8-bit binary:
* $164 = 128 + 32 + 4 = 2^7 + 2^5 + 2^2$
* Binary $B[7:0] = 10100100_2$

Splitting into 4-bit nibbles:
* Upper nibble $B[7:4] = 1010_2$ ($B_7=1, B_6=0, B_5=1, B_4=0$).
* Lower nibble $B[3:0] = 0100_2$ ($B_3=0, B_2=1, B_1=0, B_0=0$).

---

#### Step 2: Synthesize MSB Comparator Module ($\text{Comp}_{\text{MSB}}$ for Bits 7..4)

$\text{Comp}_{\text{MSB}}$ compares current address nibble $A[7:4]$ against fixed boundary $B[7:4] = 1010_2$.

##### 1. Bit-Wise Equality Signals ($x_7, x_6, x_5, x_4$):
* $x_7 = A_7 \odot B_7 = A_7 \odot 1 = A_7$
* $x_6 = A_6 \odot B_6 = A_6 \odot 0 = \overline{A_6}$
* $x_5 = A_5 \odot B_5 = A_5 \odot 1 = A_5$
* $x_4 = A_4 \odot B_4 = A_4 \odot 0 = \overline{A_4}$

##### 2. Local MSB Equality Equation ($E_{\text{MSB}}$):
$$
E_{\text{MSB}} = x_7 \cdot x_6 \cdot x_5 \cdot x_4 = A_7 \cdot \overline{A_6} \cdot A_5 \cdot \overline{A_4}
$$

##### 3. Local MSB Greater-Than Equation ($G_{\text{MSB}}$):
Using the 4-bit greater-than formula $(A_3\overline{B_3}) + (x_3 A_2\overline{B_2}) + (x_3 x_2 A_1\overline{B_1}) + (x_3 x_2 x_1 A_0\overline{B_0})$ with $B[7:4] = 1010_2$:

* Bit 7 check ($B_7=1 \implies \overline{B_7}=0$): $A_7 \cdot 0 = 0$.
* Bit 6 check ($B_6=0 \implies \overline{B_6}=1$): $x_7 \cdot A_6 \cdot 1 = A_7 \cdot A_6$.
* Bit 5 check ($B_5=1 \implies \overline{B_5}=0$): $x_7 \cdot x_6 \cdot A_5 \cdot 0 = 0$.
* Bit 4 check ($B_4=0 \implies \overline{B_4}=1$): $x_7 \cdot x_6 \cdot x_5 \cdot A_4 \cdot 1 = A_7 \cdot \overline{A_6} \cdot A_5 \cdot A_4$.

Combining terms:

$$
G_{\text{MSB}} = (A_7 \cdot A_6) + (A_7 \cdot \overline{A_6} \cdot A_5 \cdot A_4)
$$

---

#### Step 3: Synthesize LSB Comparator Module ($\text{Comp}_{\text{LSB}}$ for Bits 3..0)

$\text{Comp}_{\text{LSB}}$ compares lower address nibble $A[3:0]$ against fixed boundary $B[3:0] = 0100_2$.

##### 1. Local LSB Greater-Than Equation ($G_{\text{LSB}}$):
Evaluating $A[3:0]$ against $B[3:0] = 0100_2$:
* Bit 3 check ($B_3=0 \implies \overline{B_3}=1$): $A_3$.
* Bit 2 check ($B_2=1 \implies \overline{B_2}=0$): $x_3 \cdot A_2 \cdot 0 = 0$.
* Bit 1 check ($B_1=0 \implies \overline{B_1}=1$): $x_3 \cdot x_2 \cdot A_1 \cdot 1 = \overline{A_3} \cdot A_2 \cdot A_1$.
* Bit 0 check ($B_0=0 \implies \overline{B_0}=1$): $x_3 \cdot x_2 \cdot x_1 \cdot A_0 \cdot 1 = \overline{A_3} \cdot A_2 \cdot \overline{A_1} \cdot A_0$.

Combining terms:

$$
G_{\text{LSB}} = A_3 + (\overline{A_3} \cdot A_2 \cdot A_1) + (\overline{A_3} \cdot A_2 \cdot \overline{A_1} \cdot A_0)
$$

Applying the Elimination Law ($A_3 + \overline{A_3}Y = A_3 + Y$):

$$
G_{\text{LSB}} = A_3 + (A_2 \cdot A_1) + (A_2 \cdot A_0) = A_3 + A_2 \cdot (A_1 + A_0)
$$

---

#### Step 4: Cascade Connection and Final MPU Violation Flag ($V$)

The final Violation Flag $V = (A > B)$ is emitted by the MSB stage:
* If $A[7:4] > B[7:4]$, $G_{\text{MSB}} = 1 \implies V = 1$ immediately!
* If $A[7:4] = B[7:4]$, $E_{\text{MSB}} = 1 \implies$ MSB stage looks at its cascading greater-than input, which is driven by $G_{\text{LSB}}$!

Therefore, the final MPU Violation Flag equation is:

$$
V = (A > B) = G_{\text{MSB}} + (E_{\text{MSB}} \cdot G_{\text{LSB}})
$$

Substituting our derived equations:

$$
V = (A_7 \cdot A_6) + (A_7 \cdot \overline{A_6} \cdot A_5 \cdot A_4) + \left[ (A_7 \cdot \overline{A_6} \cdot A_5 \cdot \overline{A_4}) \cdot (A_3 + A_2 A_1 + A_2 A_0) \right]
$$

```text
MPU CASCADED COMPARATOR SCHEMATIC

 LSB Stage (Bits 3..0)                    MSB Stage (Bits 7..4)

 Inputs A[3:0]                             Inputs A[7:4]
       │                                         │
       ▼                                         ▼
 ┌───────────┐                            ┌───────────┐
 │ Comp_LSB  ├──► G_LSB (Cascade Input)──►│ Comp_MSB  ├──► Violation Flag V
 └───────────┘                            └───────────┘    (1 = MPU Exception!)
```

---

### Sanity Check and Verification

Let us verify our MPU address boundary checker across three memory access scenarios.

#### Scenario 1: Legal Code Memory Access at Address $A = 10100011_2$ (Decimal 163)
* **Current Address**: $A = 10100011_2$ ($163_{10}$). Upper Boundary $B = 10100100_2$ ($164_{10}$).
* **Expected Result**: $163 \le 164$ (Legal Access!). Violation Flag MUST be $0$ ($V = 0$).
* **Mathematical Evaluation**:
  * MSB nibble $A[7:4] = 1010_2$. Boundary MSB $B[7:4] = 1010_2$.
  * MSBs match! $G_{\text{MSB}} = 0$, and $E_{\text{MSB}} = 1$.
  * LSB nibble $A[3:0] = 0011_2$ (3). Boundary LSB $B[3:0] = 0100_2$ (4).
  * $G_{\text{LSB}} = A_3 + A_2(A_1+A_0) = 0 + 0(1+1) = 0$.
  * $V = G_{\text{MSB}} + (E_{\text{MSB}} \cdot G_{\text{LSB}}) = 0 + (1 \cdot 0) = 0$.
* **Result**: $V = 0$. **LEGAL ACCESS APPROVED!**

#### Scenario 2: Boundary Boundary Access at Address $A = 10100100_2$ (Decimal 164)
* **Current Address**: $A = 10100100_2$ ($164_{10}$). Upper Boundary $B = 10100100_2$ ($164_{10}$).
* **Expected Result**: $164 = 164$ (Exact boundary match, $A \ngtr B$). Violation Flag MUST be $0$ ($V = 0$).
* **Mathematical Evaluation**:
  * MSB nibbles match $\implies G_{\text{MSB}} = 0, E_{\text{MSB}} = 1$.
  * LSB nibble $A[3:0] = 0100_2$. Boundary LSB $B[3:0] = 0100_2$.
  * $G_{\text{LSB}} = A_3 + A_2(A_1+A_0) = 0 + 1(0+0) = 0$.
  * $V = 0 + (1 \cdot 0) = 0$.
* **Result**: $V = 0$. **EXACT BOUNDARY APPROVED!**

#### Scenario 3: Illegal Memory Access at Address $A = 10100101_2$ (Decimal 165)
* **Current Address**: $A = 10100101_2$ ($165_{10}$). Upper Boundary $B = 10100100_2$ ($164_{10}$).
* **Expected Result**: $165 > 164$ (Illegal Memory Access!). Violation Flag MUST FIRE ($V = 1$).
* **Mathematical Evaluation**:
  * MSB nibbles match $\implies G_{\text{MSB}} = 0, E_{\text{MSB}} = 1$.
  * LSB nibble $A[3:0] = 0101_2$ (5). Boundary LSB $B[3:0] = 0100_2$ (4).
  * $G_{\text{LSB}} = A_3 + A_2(A_1+A_0) = 0 + 1(0+1) = 1$.
  * $V = G_{\text{MSB}} + (E_{\text{MSB}} \cdot G_{\text{LSB}}) = 0 + (1 \cdot 1) = 1$.
* **Result**: $V = 1$. **ILLEGAL ACCESS DETECTED! MPU FAULT TRIGGERED!**

All scenarios evaluate with 100% mathematical and logical precision. The MPU address boundary checker is fully verified and ready for silicon fabrication.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Equality Comparator**: A combinational logic module that uses parallel arrays of XNOR gates ($x_k = A_k \odot B_k$) to perform bit-by-bit equivalence checking across multi-bit binary words, combining results with an AND gate to assert $(A = B)$ in a single gate delay.
* **Magnitude Cascade**: The hierarchical priority logic architecture that evaluates relational conditions ($A > B$ and $A < B$) from the Most Significant Bit down to the Least Significant Bit, enabling multi-bit comparators to expand to arbitrary word widths (8-bit, 16-bit, 64-bit) by propagating equality and magnitude decision signals across cascading stages.
