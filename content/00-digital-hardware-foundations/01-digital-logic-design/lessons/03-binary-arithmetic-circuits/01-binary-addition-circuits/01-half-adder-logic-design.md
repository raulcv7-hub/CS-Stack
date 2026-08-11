# Half Adder Logic Synthesis and XOR Sum Architecture

## The Failure of Basic Logic Gates in Binary Addition

Digital computer processors process all numerical data using binary arithmetic. Whether a computer is calculating graphics coordinates, processing audio samples, or running financial simulations, every complex mathematical operation is ultimately broken down into the most fundamental arithmetic action of all: **adding two single-bit binary numbers together**.

However, when a digital designer attempts to perform single-bit addition using basic primary logic gates, a fundamental mathematical failure occurs. 

Consider what happens when you try to use a single 2-input OR gate or a single 2-input AND gate to add two 1-bit binary numbers, $A$ and $B$:
* An **OR gate** evaluates $0 + 0 = 0$, $0 + 1 = 1$, and $1 + 0 = 1$. This looks correct at first. But when both inputs are $1$, an OR gate evaluates $1 + 1 = 1$. This violates binary mathematics, because in binary arithmetic, $1_2 + 1_2 = 10_2$ (decimal 2). The OR gate discards the higher-order bit entirely!
* An **AND gate** evaluates $0 + 0 = 0$, $0 + 1 = 0$, $1 + 0 = 0$, and $1 + 1 = 1$. It only produces a $1$ when both inputs are $1$. It fails to calculate $0 + 1 = 1$ or $1 + 0 = 1$.

```text
THE FAILURE OF SINGLE LOGIC GATES FOR BINARY ADDITION

 Input A = 1, Input B = 1
         │
         ├──► [ OR Gate  ] ──► Output = 1 (WRONG! Discards Carry Bit)
         │
         └──► [ AND Gate ] ──► Output = 1 (WRONG! Fails for 0+1 and 1+0)
```

In binary addition, adding two single-bit numbers can produce a result that spans **two bit positions**:
1. A single-bit local **Sum ($S$)** digit.
2. A single-bit **Carry-Out ($C_{\text{out}}$)** digit that represents the value $2^1$ (decimal 2) to be carried into the next higher column.

```text
BINARY ADDITION COLUMNS AND CARRY OVERFLOW

     Binary Addition:      1  (Input A)
                       +   1  (Input B)
                       ──────
                         1 0
                         │ │
                         │ └─► Local Sum (S = 0)
                         └───► Carry-Out (Cout = 1)
```

A single standard logic gate has only one output wire. It cannot simultaneously tell you that the local sum is $0$ AND that a carry of $1$ must be passed to the next column.

To perform single-bit binary addition without losing numerical data, digital engineering requires a dedicated 2-input, 2-output combinational arithmetic module: the **Half Adder**. The Half Adder combines **XOR Sum Logic** for its local sum output with an **AND gate** for its carry-out output. 

However, as we shall see, the Half Adder possesses a critical physical limitation: it cannot accept an incoming carry bit from a previous column. Understanding how a Half Adder works—and why it is only "half" of a complete addition solution—is the essential starting point for all digital arithmetic unit design.

---

## The Car Odometer Reset: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of binary addition and carry generation before diving into circuit schematics, let us picture a familiar mechanical device: a car's mechanical mileage counter (an odometer).

Imagine a single-digit mechanical display wheel on an old car dashboard. The wheel has numbers painted on it from $0$ to $9$. Every time the car drives one mile, the wheel turns by one slot.

```text
THE DECIMAL ODOMETER WHEEL ROLLOVER

 Current Wheel Value:  [ 9 ]
 Add 1 Mile          : + 1
                       ─────
 New Wheel Value     : [ 0 ] ──► (Pushes mechanical lever to next wheel!)
                                 Carry-Out = 1 to Tens Column!
```

What happens when the wheel is sitting at $9$ and you drive one more mile?
1. The single-digit wheel cannot display the number $10$ on a single wheel slot.
2. The wheel **resets to $0$**. This single-digit value ($0$) is the **Local Sum ($S$)**.
3. As the wheel turns from $9$ to $0$, a mechanical tooth trips a tiny lever that pushes the adjacent "tens" wheel forward by one notch. This mechanical push is the **Carry-Out ($C_{\text{out}}$)**!

Now, let us replace the 10-digit decimal wheel with a **2-digit binary wheel** that can only show the numbers $0$ and $1$:
* If the binary wheel shows $0$ and you add $0$, the wheel stays at $0$. No carry lever is pushed. Result: Sum = $0$, Carry = $0$.
* If the binary wheel shows $0$ and you add $1$, the wheel turns to $1$. No carry lever is pushed. Result: Sum = $1$, Carry = $0$.
* If the binary wheel shows $1$ and you add $1$, the wheel rolls over from $1$ back to **$0$** (Local Sum = $0$), and its mechanical tooth pushes the carry lever to the next wheel (Carry-Out = $1$)!

```text
THE BINARY ODOMETER ROLLOVER

 Current Binary Wheel: [ 1 ]
 Add 1               : + 1
                       ─────
 New Wheel Value     : [ 0 ] ──► (Triggers Carry Lever!)
                                 Carry-Out = 1
```

This binary odometer wheel is the exact physical analogue of a **Half Adder**:
* The current wheel number and the added number are the **Binary Inputs** ($A$ and $B$).
* The new position on the single wheel is the **Local Sum ($S$)**.
* The mechanical carry lever is the **Carry-Out ($C_{\text{out}}$)**.

A Half Adder is the digital circuit that simulates this single-digit binary wheel and its carry lever.

---

## Mechanics of Half Adder Logic Synthesis

To master the design of the Half Adder, we must dissect the formal mechanics of its two core output channels:
1. **The Local Sum ($S$)**: Synthesized using **XOR Sum Logic** ($S = A \oplus B$).
2. **The Carry-Out ($C_{\text{out}}$)**: Synthesized using an **AND Gate** ($C_{\text{out}} = A \cdot B$).

---

### Primitive 1: The Half Adder Module Architecture

A **Half Adder** is a 2-input, 2-output combinational logic circuit. It receives two single-bit binary inputs, $A$ and $B$, and produces two single-bit binary outputs:
* **Sum ($S$)**: The least significant bit (LSB, $2^0$ weight) of the arithmetic sum.
* **Carry-Out ($C_{\text{out}}$)**: The most significant bit (MSB, $2^1$ weight) of the arithmetic sum.

```text
HALF ADDER FUNCTIONAL BLOCK SCHEMATIC

 Input Bit A ───┐                     ┌───► Output Sum (S)
                ├───► [ HALF ADDER ] ─┤     (Weight 2^0 = 1)
 Input Bit B ───┘                     └───► Output Carry-Out (Cout)
                                            (Weight 2^1 = 2)
```

#### 1. Exhaustive Truth Table Derivation

Let us evaluate the four possible binary addition combinations for $A$ and $B$ from first principles:

1. **Case 1 ($A = 0, B = 0$)**:
   Arithmetic: $0 + 0 = 0_{10} = 00_2$.
   Local Sum $S = 0$, Carry-Out $C_{\text{out}} = 0$.
2. **Case 2 ($A = 0, B = 1$)**:
   Arithmetic: $0 + 1 = 1_{10} = 01_2$.
   Local Sum $S = 1$, Carry-Out $C_{\text{out}} = 0$.
3. **Case 3 ($A = 1, B = 0$)**:
   Arithmetic: $1 + 0 = 1_{10} = 01_2$.
   Local Sum $S = 1$, Carry-Out $C_{\text{out}} = 0$.
4. **Case 4 ($A = 1, B = 1$)**:
   Arithmetic: $1 + 1 = 2_{10} = 10_2$.
   Local Sum $S = 0$, Carry-Out $C_{\text{out}} = 1$.

We combine these four case evaluations into the complete, unyielding Half Adder truth table:

```text
HALF ADDER EXHAUSTIVE TRUTH TABLE

 Input A │ Input B │ Arithmetic Sum │ Sum Output (S) │ Carry Output (Cout)
─────────┼─────────┼────────────────┼────────────────┼─────────────────────
    0    │    0    │   0 + 0 = 0    │       0        │          0          
    0    │    1    │   0 + 1 = 1    │       1        │          0          
    1    │    0    │   1 + 0 = 1    │       1        │          0          
    1    │    1    │   1 + 1 = 2    │       0        │          1          
```

Look at the two output columns ($S$ and $C_{\text{out}}$) in this truth table:
* Column $S$ contains $1$ when $A=0, B=1$ OR when $A=1, B=0$.
* Column $C_{\text{out}}$ contains $1$ ONLY when $A=1, B=1$.

---

### Primitive 2: XOR Sum Logic and Boolean Derivations

Now let us extract the Boolean equations for both outputs directly from the truth table.

#### 1. Boolean Equation for Local Sum ($S$)
Examining column $S$ in the truth table, $S = 1$ in Row 1 ($A=0, B=1$) and Row 2 ($A=1, B=0$).

Writing the canonical Sum of Products (SOP) expression for $S$:

$$
S = (\overline{A} \cdot B) + (A \cdot \overline{B})
$$

Where:
* $S$ is the single-bit local sum output.
* $A$ and $B$ are the binary input variables.
* $\overline{A}$ and $\overline{B}$ are the complemented binary input variables.

Notice this exact Boolean pattern: $(\overline{A} \cdot B) + (A \cdot \overline{B})$ is the formal algebraic definition of the **Exclusive-OR (XOR)** operation!

$$
S = A \oplus B
$$

Where:
* $\oplus$ represents the logical Exclusive-OR operation.

This is **XOR Sum Logic**. The single-bit local sum $S$ of two binary digits is mathematically identical to the modulo-2 sum calculated by an XOR gate!

```text
XOR SUM LOGIC EQUIVALENCE

 A = 0, B = 0  ──►  0 (+) 0 = 0  ──►  Sum S = 0
 A = 0, B = 1  ──►  0 (+) 1 = 1  ──►  Sum S = 1
 A = 1, B = 0  ──►  1 (+) 0 = 1  ──►  Sum S = 1
 A = 1, B = 1  ──►  1 (+) 1 = 0  ──►  Sum S = 0 (Rollover!)
```

#### 2. Boolean Equation for Carry-Out ($C_{\text{out}}$)
Examining column $C_{\text{out}}$ in the truth table, $C_{\text{out}} = 1$ ONLY in Row 3 ($A=1, B=1$).

Writing the Boolean expression for $C_{\text{out}}$:

$$
C_{\text{out}} = A \cdot B
$$

Where:
* $C_{\text{out}}$ is the single-bit carry-out output signal.
* $A$ and $B$ are the binary input variables connected via a 2-input **AND gate**.

#### 3. Standard Gate-Level Half Adder Schematic
Combining these two equations yields the classic gate-level schematic of a Half Adder:
* One 2-input XOR gate to calculate $S = A \oplus B$.
* One 2-input AND gate to calculate $C_{\text{out}} = A \cdot B$.

```text
STANDARD HALF ADDER GATE SCHEMATIC

 Input A ──┬─────────────────────►┌───────┐
           │                      │ XOR   ├──► Output Sum S (A (+) B)
 Input B ──│──┬──────────────────►└───────┘
           │  │
           │  └──────────────────►┌───────┐
           └─────────────────────►│ AND   ├──► Output Carry Cout (A * B)
                                  └───────┘
```

Look at how extraordinarily simple this circuit is! With just **two physical logic gates** (one XOR and one AND), we can perform single-bit binary addition.

---

## Alternative Gate Implementations of the Half Adder

While the XOR-AND combination is the most popular way to build a Half Adder, real-world microchip foundries often build Half Adders using alternative gate topologies to optimize transistor counts or match specific manufacturing gate libraries.

### 1. NAND-Only Half Adder Synthesis
Because CMOS silicon fabrication plants favor NAND gates (which require only 4 transistors per gate in CMOS silicon), foundries often build Half Adders using **only 2-input NAND gates**.

A pure NAND-only Half Adder requires **5 NAND gates**:

$$
N_1 = \overline{A \cdot B}
$$

$$
S = \overline{(A \cdot N_1) \cdot (B \cdot N_1)} = A \oplus B
$$

$$
C_{\text{out}} = \overline{N_1 \cdot N_1} = A \cdot B
$$

```text
NAND-ONLY HALF ADDER HARDWARE SCHEMATIC

A ──┬─────────────────────────────────►┌────────┐
    │            ┌────────┐            │ NAND 2 ├─┐
    └───────────►│ NAND 1 ├──┬────────►└────────┘ │   ┌────────┐
                 └────────┘  │                    ├──►│ NAND 4 ├──► Output S
B ──┬────────────────────────│────────►┌────────┐ │   └────────┘
    │                        │         │ NAND 3 ├─┘
    └────────────────────────│────────►└────────┘
                             │
                             │         ┌────────┐
                             └────────►│ NAND 5 ├──► Output Cout
                                       └────────┘
```

Let us trace this NAND-only topology:
1. $N_1 = \overline{A \cdot B}$. Notice that $N_1$ is the inverted carry signal!
2. Gate $N_5$ inverts $N_1$ to produce $C_{\text{out}} = \overline{\overline{A \cdot B}} = A \cdot B$.
3. Gates $N_2, N_3,$ and $N_4$ combine $A, B,$ and $N_1$ to generate the XOR sum $S = A \oplus B$.

Total physical transistor count in CMOS: $5 \text{ NAND gates} \times 4 \text{ transistors} = \mathbf{20 \text{ transistors}}$.

---

### 2. NOR-Only Half Adder Synthesis
Similarly, a Half Adder can be constructed using **only 2-input NOR gates**. A pure NOR-only Half Adder requires **5 NOR gates**:

$$
N_1 = \overline{A + B}
$$

$$
C_{\text{out}} = \overline{\overline{A + N_1} + \overline{B + N_1}} = A \cdot B
$$

$$
S = \overline{C_{\text{out}} + N_1} = A \oplus B
$$

```text
NOR-ONLY HALF ADDER HARDWARE SCHEMATIC

A ──┬───────────────────────────────►┌───────┐
    │           ┌───────┐            │ NOR 2 ├─┐
    └──────────►│ NOR 1 ├──┬────────►└───────┘ │   ┌───────┐
                └───────┘  │                   ├──►│ NOR 4 ├──┬──► Output Cout
B ──┬──────────────────────│────────►┌───────┐ │   └───────┘  │
    │                      │         │ NOR 3 ├─┘              │
    └──────────────────────│────────►└───────┘                │
                           │                                  └──►┌───────┐
                           └─────────────────────────────────────►│ NOR 5 ├──► Output S
                                                                  └───────┘
```

---

## The Fundamental Limitation: Lack of a Carry-In Input

Now we arrive at the most critical architectural concept of this lesson: **Why is this circuit called a "HALF" Adder instead of a "FULL" Adder?**

Look closely at the inputs of the Half Adder: it has an input for $A$ and an input for $B$. It can add two 1-bit numbers. 

However, imagine you want to perform multi-bit binary addition on two 4-bit numbers:
$$A = (A_3, A_2, A_1, A_0) \quad \text{and} \quad B = (B_3, B_2, B_1, B_0)$$

```text
MULTI-BIT BINARY ADDITION COLUMN STRUCTURE

 Column Index:       Bit 3        Bit 2        Bit 1        Bit 0 (LSB)
 Incoming Carries:   C3           C2           C1           0  (No incoming carry!)
 Input Word A    :   A3           A2           A1           A0
 Input Word B    : + B3         + B2         + B1         + A0
                     ──────       ──────       ──────       ──────
 Result          :   S3           S2           S1           S0
 Outgoing Carry  :   C4           C3           C2           C1
```

Let us trace what happens at each column:
* **At Column 0 (LSB)**: We need to add $A_0 + B_0$. There is no incoming carry from a previous column. A **Half Adder works perfectly for Column 0**!
* **At Column 1**: Bit $0$ addition produces a Carry-Out $C_1$. Therefore, at Column 1, we must add **THREE BITS TOGETHER**: $A_1 + B_1 + C_1$!
* **At Column 2**: We must add **THREE BITS TOGETHER**: $A_2 + B_2 + C_2$!

Can a Half Adder perform the addition at Column 1 or Column 2? **NO!** 

A Half Adder has only TWO input terminals ($A$ and $B$). It has **NO Carry-In terminal ($C_{\text{in}}$)** to accept the carry bit produced by the previous column!

```text
THE HALF ADDER CHAINING FAILURE

 Column 0 (LSB)                    Column 1
 ┌────────────┐                    ┌────────────┐
 │ Half Adder │ ──► Carry Cout1 ──►│ Half Adder │ ◄── IMPOSSIBLE!
 └────────────┘                    └────────────┘     Where does Cout1 plug in?
  Inputs A0, B0                     Inputs A1, B1     Half Adder has ONLY 2 inputs!
```

If you try to chain Half Adders together to add multi-bit numbers, you have nowhere to plug in the incoming carry bit $C_{\text{in}}$.

**The Architectural Boundary**:
* A **Half Adder** adds two 1-bit inputs ($A + B$). It generates a Sum $S$ and a Carry-Out $C_{\text{out}}$, but **CANNOT accept a Carry-In ($C_{\text{in}}$)**.
* A **Full Adder** adds three 1-bit inputs ($A + B + C_{\text{in}}$). It generates a Sum $S$ and a Carry-Out $C_{\text{out}}$, accepting incoming carries from previous arithmetic stages.

The Half Adder is called "Half" because it provides only half of the hardware logic required to build a multi-bit ripple-carry adder!

---

## Engineering Reality: Propagation Delays and Glitch Dynamics

In physical silicon circuits, the Sum output ($S = A \oplus B$) and the Carry-Out output ($C_{\text{out}} = A \cdot B$) do not update at the exact same nanosecond.

### 1. Gate Propagation Delay Asymmetry

In standard CMOS gate libraries:
* A 2-input XOR gate is built using 8 to 12 transistors and has a propagation delay $t_{\text{xor}} \approx 1.5 \text{ ns}$.
* A 2-input AND gate is built using 6 transistors and has a propagation delay $t_{\text{and}} \approx 1.0 \text{ ns}$.

```text
PROPAGATION DELAY ASYMMETRY IN A HALF ADDER

 Inputs (A, B) ──┬──► [ AND Gate (t_and = 1.0ns) ] ──► Carry Cout (Ready at t = 1.0 ns)
                 │
                 └──► [ XOR Gate (t_xor = 1.5ns) ] ──► Sum S      (Ready at t = 1.5 ns)
                                                        ◄────────►
                                                      0.5 ns Delay Difference!
```

When inputs $A$ and $B$ flip simultaneously:
1. The Carry-Out output $C_{\text{out}}$ updates first (at $t = 1.0 \text{ ns}$).
2. The Sum output $S$ updates $0.5 \text{ ns}$ later (at $t = 1.5 \text{ ns}$).

This $0.5\text{-ns}$ delay mismatch means that downstream arithmetic circuits receiving $S$ and $C_{\text{out}}$ will briefly process a transient, incorrect intermediate state. Arithmetic pipeline designers must account for this delay asymmetry when setting processor clock frequencies.

---

## Solved Industrial Engineering Exercise: Arithmetic Logic Unit (ALU) 1-Bit Half Adder Block

To consolidate your complete mastery of Half Adder truth tables, XOR sum logic, AND carry generation, alternative NAND/NOR implementations, and carry-in limitations, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit design firm is engineering a low-power 1-bit addition pre-stage block for a microcontroller's Arithmetic Logic Unit (ALU). The block processes two single-bit data signals ($A$ and $B$) coming from two internal registers.

```text
ALU PRE-STAGE HALF ADDER BLOCK

 Register Bit A ───┐                      ┌───► Sum Bus Line (S)
                   ├───► [ ALU Pre-Stage ]┤
 Register Bit B ───┘                      └───► Carry Bus Line (Cout)
```

The pre-stage block must output:
1. A local 1-bit Sum signal $S$.
2. A local 1-bit Carry-Out signal $C_{\text{out}}$.

#### System Design Requirements

1. **Primary Implementation**: Synthesize the standard XOR-AND Half Adder circuit.
2. **Space-Constrained Implementation**: Synthesize an alternative **pure NAND-only** Half Adder circuit using a maximum of five 2-input NAND gates to fit into a radiation-hardened space-grade gate array.
3. **Multi-Bit Expansion Analysis**: Evaluate why two 1-bit Half Adder blocks cannot be chained directly to add a 2-bit number $(A_1 A_0 + B_1 B_0)$, and design the necessary glue logic to construct a 2-bit adder using Half Adders and an extra OR gate.

---

### Step-by-Step Derivation

#### Step 1: Synthesize the Standard XOR-AND Half Adder

We write the Boolean equations for the primary implementation:

$$
S = A \oplus B = (\overline{A} \cdot B) + (A \cdot \overline{B})
$$

$$
C_{\text{out}} = A \cdot B
$$

Where:
* $S$ is the local single-bit sum output.
* $C_{\text{out}}$ is the local single-bit carry-out output.
* $A$ and $B$ are the 1-bit input variables.

```text
PRIMARY XOR-AND HALF ADDER SCHEMATIC

 Data A ──┬──────────────────►┌───────┐
          │                   │ XOR   ├──► Output Sum S
 Data B ──│──┬───────────────►└───────┘
          │  │
          │  └───────────────►┌───────┐
          └──────────────────►│ AND   ├──► Output Cout
                              └───────┘
```

---

#### Step 2: Synthesize the Pure NAND-Only Half Adder

To build the circuit using only 2-input NAND gates, we derive the 5-NAND network:

##### Gate 1 (Shared NAND):
$$N_1 = \overline{A \cdot B}$$

##### Gate 2 (Sum Upper Branch):
$$N_2 = \overline{A \cdot N_1} = \overline{A \cdot \overline{A \cdot B}}$$

##### Gate 3 (Sum Lower Branch):
$$N_3 = \overline{B \cdot N_1} = \overline{B \cdot \overline{A \cdot B}}$$

##### Gate 4 (Sum Output Collector):
$$S = \overline{N_2 \cdot N_3} = \overline{\overline{A \cdot \overline{A \cdot B}} \cdot \overline{B \cdot \overline{A \cdot B}}}$$

Let us verify algebraically that $S = A \oplus B$:
Apply De Morgan's Law to $S = \overline{N_2 \cdot N_3}$:

$$
S = \overline{N_2} + \overline{N_3} = (A \cdot \overline{A \cdot B}) + (B \cdot \overline{A \cdot B})
$$

Apply De Morgan's Law to $\overline{A \cdot B} = \overline{A} + \overline{B}$:

$$
S = A \cdot (\overline{A} + \overline{B}) + B \cdot (\overline{A} + \overline{B})
$$

Expand using the Distributive Law:

$$
S = (A \cdot \overline{A}) + (A \cdot \overline{B}) + (B \cdot \overline{A}) + (B \cdot \overline{B})
$$

Since $A \cdot \overline{A} = 0$ and $B \cdot \overline{B} = 0$:

$$
S = 0 + (A \cdot \overline{B}) + (\overline{A} \cdot B) + 0 = (A \cdot \overline{B}) + (\overline{A} \cdot B) = A \oplus B
$$

The NAND-only Sum output is algebraically proven!

##### Gate 5 (Carry Output Inverter):
$$C_{\text{out}} = \overline{N_1 \cdot N_1} = \overline{N_1} = \overline{\overline{A \cdot B}} = A \cdot B$$

```text
SPACE-GRADE PURE NAND HALF ADDER SCHEMATIC

Data A ──┬───────────────────────────────►┌────────┐
         │            ┌────────┐          │ NAND 2 ├─┐
         └───────────►│ NAND 1 ├──┬──────►└────────┘ │   ┌────────┐
                      └────────┘  │                  ├──►│ NAND 4 ├──► Output S
Data B ──┬────────────────────────│──────►┌────────┐ │   └────────┘
         │                        │       │ NAND 3 ├─┘
         └────────────────────────│──────►└────────┘
                                  │
                                  │       ┌────────┐
                                  └──────►│ NAND 5 ├──► Output Cout
                                          └────────┘
```

---

#### Step 3: Designing Glue Logic for 2-Bit Addition Using Half Adders

We are asked to perform 2-bit addition $A_1 A_0 + B_1 B_0 = C_2 S_1 S_0$ using Half Adders.

##### 1. Column 0 (LSB Addition):
At Column 0, we add $A_0 + B_0$. There is no incoming carry.
We use **Half Adder 0**:
* Inputs: $A_0, B_0$
* Outputs: Sum $S_0 = A_0 \oplus B_0$, Carry-Out $C_1 = A_0 \cdot B_0$.

##### 2. Column 1 (MSB Addition):
At Column 1, we must add $A_1 + B_1 + C_1$. 

Because a Half Adder can only accept TWO inputs, how do we add three bits ($A_1, B_1, C_1$) using Half Adders?
* **Step A**: Use **Half Adder 1A** to add $A_1 + B_1$.
  * Outputs: Partial Sum $S_{1A} = A_1 \oplus B_1$, Partial Carry $C_{1A} = A_1 \cdot B_1$.
* **Step B**: Use **Half Adder 1B** to add Partial Sum $S_{1A}$ and incoming carry $C_1$!
  * Outputs: Final Sum $S_1 = S_{1A} \oplus C_1 = (A_1 \oplus B_1) \oplus C_1$, Partial Carry $C_{1B} = S_{1A} \cdot C_1$.
* **Step C**: Combine Partial Carries $C_{1A}$ and $C_{1B}$ using an **OR gate** to generate final Carry-Out $C_2$:
  * $C_2 = C_{1A} + C_{1B} = (A_1 \cdot B_1) + ((A_1 \oplus B_1) \cdot C_1)$.

```text
2-BIT ADDER BUILT FROM THREE HALF ADDERS AND ONE OR GATE

 LSB Stage (Bit 0):
 Inputs A0, B0 ──► [ Half Adder 0 ] ──► Sum S0
                         │
                         └──► Carry C1 ──────┐
                                             │
 MSB Stage (Bit 1):                          ▼
 Inputs A1, B1 ──► [ Half Adder 1A ] ──► [ Half Adder 1B ] ──► Sum S1
                         │                     │
                         ▼                     ▼
                     Partial C1A           Partial C1B
                         │                     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                             ┌────────────┐
                             │  OR Gate   ├──► Final Carry C2
                             └────────────┘
```

This exercise reveals the exact evolutionary origin of the Full Adder: **A Full Adder is formed by combining two Half Adders and one OR gate!**

---

### Sanity Check and Verification

Let us verify our Half Adder and 2-bit adder equations across three numerical test cases:

#### Test Case 1: Single-Bit Addition $1_2 + 1_2$
* **Inputs**: $A = 1, B = 1$.
* **Expected Result**: $1_2 + 1_2 = 2_{10} = 10_2 \implies S = 0, C_{\text{out}} = 1$.
* **Formula Evaluation**:
  * $S = A \oplus B = 1 \oplus 1 = 0$.
  * $C_{\text{out}} = A \cdot B = 1 \cdot 1 = 1$.
* **Result**: $S = 0, C_{\text{out}} = 1$. **MATCH!**

#### Test Case 2: Single-Bit Addition $1_2 + 0_2$
* **Inputs**: $A = 1, B = 0$.
* **Expected Result**: $1_2 + 0_2 = 1_{10} = 01_2 \implies S = 1, C_{\text{out}} = 0$.
* **Formula Evaluation**:
  * $S = 1 \oplus 0 = 1$.
  * $C_{\text{out}} = 1 \cdot 0 = 0$.
* **Result**: $S = 1, C_{\text{out}} = 0$. **MATCH!**

#### Test Case 3: 2-Bit Addition $3_{10} + 3_{10}$ ($11_2 + 11_2$)
* **Inputs**: $A = 11_2$ ($A_1=1, A_0=1$), $B = 11_2$ ($B_1=1, B_0=1$).
* **Expected Result**: $3 + 3 = 6_{10} = 110_2 \implies C_2=1, S_1=1, S_0=0$.
* **Hardware Evaluation**:
  1. **Column 0**: Half Adder 0 adds $A_0(1) + B_0(1)$.
     $S_0 = 1 \oplus 1 = 0$.
     $C_1 = 1 \cdot 1 = 1$.
  2. **Column 1 Step A**: Half Adder 1A adds $A_1(1) + B_1(1)$.
     Partial Sum $S_{1A} = 1 \oplus 1 = 0$.
     Partial Carry $C_{1A} = 1 \cdot 1 = 1$.
  3. **Column 1 Step B**: Half Adder 1B adds $S_{1A}(0) + C_1(1)$.
     Final Sum $S_1 = 0 \oplus 1 = 1$.
     Partial Carry $C_{1B} = 0 \cdot 1 = 0$.
  4. **Column 1 Step C**: OR gate combines $C_{1A}(1) + C_{1B}(0)$.
     Final Carry $C_2 = 1 + 0 = 1$.
* **Final 3-Bit Result**: $C_2 S_1 S_0 = 110_2$ (decimal 6). **2-BIT ADDITION SUCCESSFUL!**

All scenarios evaluate with 100% mathematical and logical precision. The Half Adder design is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Half Adder**: The fundamental 2-input, 2-output combinational arithmetic module that performs 1-bit binary addition of inputs $A$ and $B$, generating a local Sum ($S = A \oplus B$) and a Carry-Out ($C_{\text{out}} = A \cdot B$), characterized by its architectural inability to accept an incoming Carry-In ($C_{\text{in}}$) signal.
* **XOR Sum Logic**: The modulo-2 addition mechanism $S = A \oplus B$ that generates the local single-bit sum of two binary digits without carry, serving as the foundational arithmetic core of all binary adders.
