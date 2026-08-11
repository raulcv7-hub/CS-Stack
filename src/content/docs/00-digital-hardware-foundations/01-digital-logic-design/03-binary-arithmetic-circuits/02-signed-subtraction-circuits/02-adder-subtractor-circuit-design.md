---
title: "Combined Adder-Subtractor Synthesis and Controlled Inversion Architecture"
---

# Combined Adder-Subtractor Synthesis and Controlled Inversion Architecture

## The Silicon Redundancy Problem of Separate Addition and Subtraction Hardware

Inside the Arithmetic Logic Unit (ALU) of a central processing unit, the processor must execute two fundamental arithmetic operations millions of times per second: adding two numbers ($A + B$) and subtracting one number from another ($A - B$).

If an integrated circuit designer approaches this requirement naively, they might build two completely separate, independent hardware modules: an $N$-bit multi-bit adder circuit for addition, and a dedicated $N$-bit multi-bit subtractor circuit for subtraction.

```text
THE NAIVE DUAL-HARDARE SILICON REDUNDANCY

 Input Operand A (N Bits) ──┬───────────────────┐
                            │                   │
 Input Operand B (N Bits) ──│─────────┐         │
                            │         │         │
                            ▼         ▼         │
                  ┌──────────┐   ┌──────────┐   │
                  │  N-Bit   │   │  N-Bit   │   │
                  │  Adder   │   │Subtractor│   │
                  └────┬─────┘   └────┬─────┘   │
                       │              │         │
                       ▼              ▼         │
                  ┌─────────────────────────┐   │
                  │ Output Multiplexer(MUX) │◄──┘ Mode Select (Add/Sub)
                  └────────────┬────────────┘
                               │
                               ▼
                        Result Output
           (WASTES 2X SILICON DIE AREA AND POWER!)
```

This dual-hardware approach is an engineering disaster for three reasons:

1. **Silicon Die Area Penalty**: Building two separate $N$-bit arithmetic circuits doubles the physical transistor count, consuming twice as much silicon area on the microchip.
2. **Power Waste**: Both large circuits receive the operand signals simultaneously, causing internal logic gates in both the adder and the subtractor to switch, waste power, and dissipate unwanted heat even when only one result is needed.
3. **Multiplexer Interconnect Congestion**: Routing 32 or 64 data wires from the adder and another 32 or 64 data wires from the subtractor into a large output multiplexer creates severe wiring congestion and adds extra propagation delay to the critical path.

Why should we fabricate two huge, separate arithmetic circuits when subtraction in binary arithmetic can be transformed directly into addition?

Recall the mathematical foundation of Two's Complement representation: subtracting a binary integer $B$ from $A$ is mathematically identical to adding the Two's Complement negative representation of $B$ ($\overline{B} + 1$) to $A$:

$$
A - B = A + \overline{B} + 1
$$

Notice what is needed to transform a binary addition ($A + B$) into a binary subtraction ($A - B$):
* Every bit of operand $B$ must be conditionally inverted ($B_i \to \overline{B_i}$).
* A constant $+1$ must be added to the least significant bit position.

Instead of building two separate circuits, can we take a standard binary adder and add a small, lightweight front-end control mechanism that conditionally inverts operand $B$ and injects a $+1$ carry into the first stage on demand?

That front-end mechanism is a bank of **Controlled Inverters (XOR Gates)**, and the unified hardware module it creates is the **Combined Adder-Subtractor**. By manipulating a single 1-bit mode control line ($M$), the exact same hardware performs $A + B$ when $M = 0$ and $A - B$ when $M = 1$, eliminating $50\%$ of the physical arithmetic transistors and providing a seamless, high-speed solution for processor arithmetic.

---

## The Reversible Ratchet Wrench: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a combined adder-subtractor before diving into logic gate schematics, let us step away from microchips and picture a familiar hand tool: a mechanical ratchet wrench.

Imagine a mechanic working on an engine block. The mechanic needs to perform two opposite mechanical tasks:
1. Tightening a bolt (turning clockwise, adding thread distance).
2. Loosening a bolt (turning counter-clockwise, subtracting thread distance).

```text
THE REVERSIBLE RATCHET WRENCH ANALOGY

 Wrench Handle (Physical Force / Adder Core)
       │
       ▼
 [ Direction Switch Lever (Mode Bit M) ]
   ├─► Position 0 (TIGHTEN / ADD)    ──► Clockwise Torque
   └─► Position 1 (LOOSEN / SUBTRACT)──► Counter-Clockwise Torque
       │
       ▼
 Shared Gear Socket (Output Drive)
```

Does the mechanic carry two completely separate, heavy steel wrenches in their toolbox—one wrench that can only turn clockwise and a second wrench that can only turn counter-clockwise?

Of course not! Carrying two full-sized wrenches is heavy, wasteful, and inefficient. Instead, the mechanic uses a single **Reversible Ratchet Wrench**.

A reversible ratchet wrench has one main handle and one central gear socket. On the back of the wrench head is a tiny mechanical lever—the **Direction Switch**.
* When the mechanic sets the Direction Switch to **Position 0**, the internal pawl engages the gear so that swinging the handle turns the socket clockwise (**Tighten / Add**).
* When the mechanic flips the Direction Switch to **Position 1**, the internal pawl reverses its engagement, causing the exact same handle motion to turn the socket counter-clockwise (**Loosen / Subtract**).

Notice three vital properties of this ratchet wrench:
1. **Shared Heavy Core**: The heavy steel handle, internal gear wheel, and socket drive are shared $100\%$ between tightening and loosening.
2. **Single Control Lever**: Flipping a tiny 1-gram switch changes the fundamental operational direction of the entire tool.
3. **Zero Waste**: The mechanic carries half the weight in their tool belt while retaining full functionality.

This reversible ratchet wrench is the exact physical analogue of a **Combined Adder-Subtractor**:
* The heavy steel handle and gear drive represent the **Binary Adder Core**.
* The tiny Direction Switch lever is the 1-bit **Mode Control Line ($M$)**.
* The internal pawl reverser is the bank of **Controlled Inverters (XOR Gates)**.

In digital logic, instead of flipping a mechanical steel pawl, we use XOR gates to conditionally invert binary data bits, allowing one physical adder circuit to handle both addition and subtraction seamlessly.

---

## Mechanics of Controlled Inverters and Combined Adder-Subtractor Synthesis

To master the design of the Combined Adder-Subtractor, we must dissect the formal mechanics of its two core primitives:
1. **The Controlled Inverter (XOR Gate Bank)**: How 2-input XOR gates act as programmable bitwise complementers under the direction of mode bit $M$.
2. **The Combined Adder-Subtractor Architecture**: How the mode bit $M$ simultaneously drives the XOR inverter bank AND supplies the initial $+1$ carry-in ($C_0 = M$) to execute $A + B + 0$ or $A + \overline{B} + 1$.

---

### Primitive 1: The Controlled Inverter (XOR Gate Bank)

A **Controlled Inverter** is a 2-input logic gate that uses one pin as a data input line ($B_i$) and the second pin as a mode control line ($M$).

The fundamental operation of a controlled inverter relies on the algebraic identities of the **Exclusive-OR (XOR)** gate.

```text
CONTROLLED INVERTER HARDWARE PRIMITIVE

 Data Input B_i ────────►┌───────┐
                         │ XOR   ├──► Output Value Z_i
 Control Mode Bit M ────►└───────┘
```

The output equation $Z_i$ for the $i$-th bit position is:

$$
Z_i = B_i \oplus M
$$

Where:
* $Z_i$ is the modified operand output bit fed into the adder stage $i$.
* $B_i$ is the raw $i$-th operand bit.
* $M$ is the 1-bit mode control signal ($M \in \{0, 1\}$).
* $\oplus$ represents the logical XOR operation.

#### 1. Algebraic Verification of the Two Operating Modes

Let us evaluate $Z_i = B_i \oplus M$ across both possible states of control bit $M$:

##### Mode 0: Addition Mode ($M = 0$)
Substitute $M = 0$ into the XOR output equation:

$$
Z_i = B_i \oplus 0
$$

By the **Identity Law of XOR** ($X \oplus 0 = X$):

$$
Z_i = B_i
$$

When mode bit $M = 0$, the XOR gate acts as a **direct pass-through buffer**. Every bit of operand $B$ passes through the gate completely unchanged ($Z_i = B_i$).

##### Mode 1: Subtraction Mode ($M = 1$)
Substitute $M = 1$ into the XOR output equation:

$$
Z_i = B_i \oplus 1
$$

By the **Negation Identity of XOR** ($X \oplus 1 = \overline{X}$):

$$
Z_i = \overline{B_i}
$$

When mode bit $M = 1$, the XOR gate acts as a **NOT gate (Inverter)**. Every bit of operand $B$ is inverted to its bitwise complement ($Z_i = \overline{B_i}$).

```text
CONTROLLED INVERTER MODE TRUTH TABLE

 Mode Signal (M) │ Input Bit (B_i) │ XOR Operation (B_i (+) M) │ Output (Z_i) │ Physical Mode
─────────────────┼─────────────────┼───────────────────────────┼──────────────┼─────────────────────
        0        │        0        │          0 (+) 0          │      0       │ Pass-Through (B_i)
        0        │        1        │          1 (+) 0          │      1       │ Pass-Through (B_i)
        1        │        0        │          0 (+) 1          │      1       │ Bitwise Inverted (B_i')
        1        │        1        │          1 (+) 1          │      0       │ Bitwise Inverted (B_i')
```

#### 2. The $N$-Bit Controlled Inverter Bank
To handle an $N$-bit operand bus $\mathbf{B} = (B_{N-1}, \dots, B_1, B_0)$, we place an array of $N$ parallel 2-input XOR gates. The mode line $M$ is connected to one input pin of **every single XOR gate in the bank**.

```text
N-BIT PARALLEL CONTROLLED INVERTER BANK

 Mode Line M ─────┬──────────────┬──────────────┬──────────────┐
                  ▼              │              │              │
 Operand B3 ─────►[XOR]          │              │              │
                  │              ▼              │              │
 Operand B2 ──────┼────────────►[XOR]           │              │
                  │              │              ▼              │
 Operand B1 ──────┼──────────────┼────────────►[XOR]           │
                  │              │              │              ▼
 Operand B0 ──────┼──────────────┼──────────────┼────────────►[XOR]
                  │              │              │              │
                  ▼              ▼              ▼              ▼
              Output Z3      Output Z2      Output Z1      Output Z0
             (B3 (+) M)     (B2 (+) M)     (B1 (+) M)     (B0 (+) M)
```

With this single parallel XOR bank:
* Setting $M = 0$ yields output vector $\mathbf{Z} = (B_{N-1}, \dots, B_1, B_0) = \mathbf{B}$.
* Setting $M = 1$ yields output vector $\mathbf{Z} = (\overline{B_{N-1}}, \dots, \overline{B_1}, \overline{B_0}) = \overline{\mathbf{B}}$ (One's Complement of $\mathbf{B}$).

---

### Primitive 2: The Combined Adder-Subtractor Architecture

Now we connect our $N$-bit Controlled Inverter Bank to a standard $N$-bit binary adder (such as a Ripple Carry Adder or Carry Lookahead Adder).

To complete the Two's Complement subtraction transformation ($A - B = A + \overline{B} + 1$), we need one more thing: we must **add $1$** when in subtraction mode.

Where does that $+1$ come from?
Look at the initial carry-in terminal ($C_0$) of the very first Full Adder stage (Bit 0 LSB)!

In a standard addition circuit, $C_0$ is usually connected to ground ($0$). But in our Combined Adder-Subtractor, **we connect mode control bit $M$ directly to the initial carry-in terminal $C_0$!**

$$
C_0 = M
$$

```text
COMBINED ADDER-SUBTRACTOR HARDWARE ARCHITECTURE

 Mode Select Line M ──┬─────────────────────────────────────────────────┐
                      │                                                 │
 Operand B[N-1..0] ───│──► [ N-Bit Controlled Inverter Bank (XOR) ]     │
                      │                       │                         │
                      │                       ▼ Output Z[N-1..0]        │
 Operand A[N-1..0] ───│───────────────────────│─────────┐               │
                      │                       │         │               │
                      ▼                       ▼         ▼               ▼
             ┌─────────────────────────────────────────────────────────────┐
             │                  N-Bit Binary Adder Core                    │
             │           (Inputs: Operand A, Vector Z, Carry-In C0)        │
             └──────────────────────────────┬──────────────────────────────┘
                                            │
                                            ▼
                                  Result Vector S[N-1..0]
```

Let us trace the complete mathematical operation of this unified architecture across both operational modes:

---

#### Mode 0: Addition Mode ($M = 0$)

1. **Mode Setting**: The control unit sets $M = 0$.
2. **Inverter Bank Output**: Each XOR gate computes $Z_i = B_i \oplus 0 = B_i$. The vector entering the adder's $B$-input terminals is $\mathbf{Z} = \mathbf{B}$.
3. **Initial Carry-In**: The initial carry terminal receives $C_0 = M = 0$.
4. **Adder Core Calculation**: The adder core adds operand $\mathbf{A}$, vector $\mathbf{Z}$, and initial carry $C_0$:

$$
\text{Sum } \mathbf{S} = \mathbf{A} + \mathbf{Z} + C_0 = \mathbf{A} + \mathbf{B} + 0 = \mathbf{A} + \mathbf{B}
$$

The system executes **Standard Binary Addition** ($\mathbf{A} + \mathbf{B}$)!

---

#### Mode 1: Subtraction Mode ($M = 1$)

1. **Mode Setting**: The control unit sets $M = 1$.
2. **Inverter Bank Output**: Each XOR gate computes $Z_i = B_i \oplus 1 = \overline{B_i}$. The vector entering the adder's $B$-input terminals is the bitwise inverse $\mathbf{Z} = \overline{\mathbf{B}}$ (One's Complement).
3. **Initial Carry-In**: The initial carry terminal receives $C_0 = M = 1$.
4. **Adder Core Calculation**: The adder core adds operand $\mathbf{A}$, vector $\mathbf{Z}$, and initial carry $C_0$:

$$
\text{Sum } \mathbf{S} = \mathbf{A} + \mathbf{Z} + C_0 = \mathbf{A} + \overline{\mathbf{B}} + 1
$$

By the mathematical definition of Two's Complement representation, $\overline{\mathbf{B}} + 1 = -\mathbf{B}$. Therefore:

$$
\text{Sum } \mathbf{S} = \mathbf{A} + (-\mathbf{B}) = \mathbf{A} - \mathbf{B}
$$

The system executes **Two's Complement Binary Subtraction** ($\mathbf{A} - \mathbf{B}$)!

```text
UNIFIED OPERATIONAL MODE SUMMARY

 Mode Bit (M) │ XOR Bank Output (Z) │ Initial Carry (C0) │ Adder Calculation │ Mathematical Function
──────────────┼─────────────────────┼────────────────────┼───────────────────┼───────────────────────
    M = 0     │      Z = B          │       C0 = 0       │   S = A + B + 0   │ Addition (A + B)
    M = 1     │      Z = B'         │       C0 = 1       │   S = A + B' + 1  │ Subtraction (A - B)
```

Notice the sheer mathematical elegance of this design. By routing mode bit $M$ into both the XOR bank and the $C_0$ pin, we turn bitwise inversion ($\overline{\mathbf{B}}$) into a full Two's Complement negation ($\overline{\mathbf{B}} + 1$) automatically!

---

## Detailed 4-Bit Combined Adder-Subtractor Walkthrough

To make this architecture completely transparent, let us build and examine a 4-bit Combined Adder-Subtractor using four Full Adder cells ($\text{FA}_0, \text{FA}_1, \text{FA}_2, \text{FA}_3$) and four XOR gates.

```text
DETAILED 4-BIT COMBINED ADDER-SUBTRACTOR SCHEMATIC

Mode Line M ──┬──────────────┬──────────────┬──────────────┬────┐
              │              │              │              │    │
Bit 0 (LSB):  │              │              │              │    ▼ (C0 = M)
  A0, B0 ─────┼──►[ XOR 0 ]──│──────────────│─────────────►│──►┌──────┐
              │     (Z0)     │              │              │   │ FA 0 ├──► S0
              │              │              │              │   └──┬───┘
Bit 1:        │              │              │              │      │ C1
  A1, B1 ─────│─────────────►┼──►[ XOR 1 ]──│─────────────►│──►┌──▼───┐
              │              │     (Z1)     │              │   │ FA 1 ├──► S1
              │              │              │              │   └──┬───┘
Bit 2:        │              │              │              │      │ C2
  A2, B2 ─────│──────────────│─────────────►┼──►[ XOR 2 ]─►│──►┌──▼───┐
              │              │              │     (Z2)     │   │ FA 2 ├──► S2
              │              │              │              │   └──┬───┘
Bit 3 (MSB):  │              │              │              │      │ C3
  A3, B3 ─────│──────────────│──────────────│─────────────►┴──►┌──▼───┐
              ▼              ▼              ▼                  │ FA 3 ├──► S3
                                                               └──┬───┘
                                                                  │
                                                                  ▼ Carry C4
```

### Stage-by-Stage Signal Equations

For each stage $i \in \{0, 1, 2, 3\}$:
* **Modified $B$ Input**: $Z_i = B_i \oplus M$
* **Local Sum Output**: $S_i = A_i \oplus Z_i \oplus C_i = A_i \oplus (B_i \oplus M) \oplus C_i$
* **Stage Carry-Out**: $C_{i+1} = (A_i \cdot Z_i) + (C_i \cdot (A_i \oplus Z_i))$

Where:
* $C_0 = M$ (Initial carry is driven directly by mode bit $M$).
* $C_4$ is the final carry-out from the most significant bit stage.

---

## Arithmetic Flags in Combined Adder-Subtractors

A combined adder-subtractor does not merely produce a sum vector $\mathbf{S}$. It also generates four critical **Arithmetic Condition Flags** that inform the processor's control unit about the mathematical properties of the result:

1. **Zero Flag ($Z$)**: Indicates whether the result is exactly zero.
2. **Sign Flag ($N$)**: Indicates whether the result is negative.
3. **Carry Flag ($C$)**: Indicates an unsigned arithmetic overflow or borrow.
4. **Overflow Flag ($V$)**: Indicates a signed Two's Complement overflow.

```text
ARITHMETIC CONDITION FLAGS GENERATION

                  Combined Adder-Subtractor Core
                                │
   ┌────────────────────┬───────┴────────────┬────────────────────┐
   ▼                    ▼                    ▼                    ▼
 Zero Flag (Z)        Sign Flag (N)        Carry Flag (C)       Overflow Flag (V)
 (Is Result = 0?)     (Is Result < 0?)     (Unsigned Overflow)  (Signed Overflow)
```

---

### 1. The Zero Flag ($Z$)
The Zero Flag $Z$ is active ($1$) if **every single bit** of the output sum vector $\mathbf{S} = (S_{N-1}, \dots, S_0)$ is equal to $0$.

We compute $Z$ by taking the NOR of all output sum bits:

$$
Z = \overline{S_{N-1} + S_{N-2} + \dots + S_1 + S_0}
$$

Where:
* $Z = 1$ if all sum bits are $0$ ($S = 0000_2$).
* $Z = 0$ if at least one sum bit is $1$.

---

### 2. The Sign Flag ($N$)
In Two's Complement representation, the Most Significant Bit ($S_{N-1}$) of a signed number represents the sign ($0$ for positive, $1$ for negative).

The Sign Flag $N$ is simply a direct connection to the MSB sum bit:

$$
N = S_{N-1}
$$

Where:
* $N = 1$ indicates a negative result.
* $N = 0$ indicates a positive or zero result.

---

### 3. The Carry Flag ($C$) and Unsigned Borrow Interpretation
The Carry Flag $C$ is connected to the final carry-out bit $C_N$ emerging from the most significant Full Adder stage.

However, its interpretation depends on whether the circuit is operating in Addition mode or Subtraction mode:

* **In Addition Mode ($M = 0$)**: $C = C_N$. If $C_N = 1$, an unsigned addition overflow occurred (the sum exceeded $2^N - 1$).
* **In Subtraction Mode ($M = 1$)**: In Two's Complement subtraction $A - B = A + \overline{B} + 1$, the final carry-out $C_N$ acts as an **inverted borrow flag** ($\overline{\text{Borrow}}$):
  * If $A \ge B$ (No borrow required): The addition produces $C_N = 1$.
  * If $A < B$ (Borrow required!): The addition produces $C_N = 0$.

To make the Carry Flag represent a true **Borrow Flag** during subtraction, processor architectures often invert $C_N$ when $M = 1$:

$$
\text{Borrow} = C_N \oplus M
$$

```text
CARRY VERSUS BORROW INTERPRETATION

 Operation Mode   │ Final Carry Out (C_N) │ Unsigned Arithmetic Meaning
──────────────────┼───────────────────────┼─────────────────────────────
 Addition (M=0)   │        C_N = 1        │ Unsigned Overflow Occurred!
 Addition (M=0)   │        C_N = 0        │ No Overflow (Result Valid)
 Subtraction(M=1) │       C_N = 1         │ A >= B (No Borrow Needed)
 Subtraction(M=1) │       C_N = 0         │ A < B  (Borrow Occurred!)
```

---

### 4. The Signed Overflow Flag ($V$)

As established in signed Two's Complement arithmetic, an **Arithmetic Overflow** occurs when a calculation produces a result that exceeds the representable range $[-2^{N-1}, +2^{N-1} - 1]$ of an $N$-bit signed container.

Overflow occurs if and only if:
* Adding two positive numbers yields a negative result ($+ \text{ and } + \implies -$).
* Subtracting a positive number from a negative number yields a positive result ($- \text{ and } + \implies +$).

In hardware gate logic, Two's Complement overflow is detected instantaneously by comparing the carry entering the MSB stage ($C_{N-1}$) with the carry leaving the MSB stage ($C_N$) using an **XOR gate**:

$$
V = C_{N-1} \oplus C_N
$$

Where:
* $V$ is the Signed Overflow Flag ($V = 1$ indicates signed overflow corruption).
* $C_{N-1}$ is the carry bit entering the most significant Full Adder stage ($FA_{N-1}$).
* $C_N$ is the carry bit leaving the most significant Full Adder stage ($FA_{N-1}$).

```text
HARDWARE OVERFLOW DETECTION SCHEMATIC

 Carry into MSB (C_N-1) ───┐
                           ├──► [ XOR Gate ] ──► Overflow Flag V
 Carry out of MSB (C_N) ───┘                     (1 = Signed Overflow!)
```

Why does $V = C_{N-1} \oplus C_N$ work for both addition and subtraction?
Because in subtraction mode ($M = 1$), operand $B$ is inverted to $\overline{B}$, converting $A - B$ into addition $A + \overline{B} + 1$. The carry pins $C_{N-1}$ and $C_N$ automatically capture whether the signed addition $A + \overline{B} + 1$ violated Two's Complement range boundaries!

---

## Engineering Reality: Transistor Savings, Critical Path Delay, and Fan-Out Loading

To appreciate the engineering impact of the Combined Adder-Subtractor, let us evaluate its physical silicon footprint, power consumption, and signal propagation delays compared to separate addition and subtraction circuits.

### 1. Transistor Footprint Comparison

Let us calculate the physical CMOS transistor count for a 32-bit arithmetic subsystem built using the two competing design philosophies:

#### Architecture A: Separate 32-Bit Adder + 32-Bit Subtractor + 32-Bit Output MUX
* **32-Bit Adder** (32 Full Adders @ 28 transistors each): $32 \times 28 = 896 \text{ transistors}$.
* **32-Bit Subtractor** (32 Full Adders + 32 Inverters): $896 + (32 \times 2) = 960 \text{ transistors}$.
* **32-Bit 2:1 Output MUX** (32 MUX blocks @ 6 transistors each): $32 \times 6 = 192 \text{ transistors}$.
* **Total Transistors (Architecture A)** = $896 + 960 + 192 = \mathbf{2,048 \text{ transistors}}$.

#### Architecture B: Unified 32-Bit Combined Adder-Subtractor
* **32-Bit Adder Core** (32 Full Adders @ 28 transistors each): $896 \text{ transistors}$.
* **Controlled Inverter Bank** (32 XOR gates @ 8 transistors each): $32 \times 8 = 256 \text{ transistors}$.
* **Output Multiplexer**: **NONE NEEDED!**
* **Total Transistors (Architecture B)** = $896 + 256 = \mathbf{1,152 \text{ transistors}}$.

```text
TRANSISTOR SAVINGS COMPARISON (32-BIT ARITHMETIC UNIT)

 Separate Adder + Subtractor + MUX : [ 2,048 Transistors ]
 Unified Combined Adder-Subtractor : [ 1,152 Transistors ]
                                     (43.8% SILICON DIE AREA SAVINGS!)
```

By unifying addition and subtraction into a single circuit, the hardware team eliminates **896 transistors** ($43.8\%$ silicon area savings), dramatically reducing chip manufacturing cost and static power leakage!

### 2. Propagation Delay and Critical Path Comparison

How does the mode control XOR bank affect the maximum operating clock frequency ($f_{\text{max}}$) of the ALU?

In a Combined Adder-Subtractor:
1. Mode bit $M$ arrives at the XOR gate bank.
2. The XOR gates compute $Z_i = B_i \oplus M$ in one XOR gate delay ($t_{\text{xor}} \approx 0.8 \text{ ns}$).
3. The modified vector $\mathbf{Z}$ enters the $N$-bit adder core.

```text
CRITICAL PATH DELAY OF COMBINED ADDER-SUBTRACTOR

 t = 0.0 ns ──► Mode Bit M and Operands A, B arrive
 t = 0.8 ns ──► Controlled Inverters Z_i = B_i (+) M complete (t_xor)
 t = 0.8 ns ──► Adder Core begins arithmetic operation
 t = t_total──► Final Sum S and Flags (Z, N, C, V) READY!
```

The Controlled Inverter bank adds only **a single XOR gate delay ($t_{\text{xor}}$)** to the front of the adder pipeline! 

Because this $t_{\text{xor}}$ delay occurs in parallel for all $N$ bits simultaneously, it is a constant $O(1)$ delay that does not increase with bit width.

---

## Solved Industrial Engineering Exercise: 4-Bit Avionics ALU Adder-Subtractor Subsystem

To consolidate your complete mastery of controlled inverters, combined adder-subtractor architectures, mode control logic, Two's Complement subtraction, and arithmetic condition flags, we will now walk through a complete, step-by-step aerospace hardware engineering problem.

---

### Scenario and Parameters

An avionics chip design team is engineering the 4-bit primary arithmetic subsystem for a satellite's attitude control computer. The subsystem contains a 4-bit Combined Adder-Subtractor built from four Full Adder cells ($\text{FA}_0, \text{FA}_1, \text{FA}_2, \text{FA}_3$) and four controlled-inverter XOR gates.

```text
SATELLITE 4-BIT ARITHMETIC SUBSYSTEM

 Mode Bit M ──────────────┐
 Operand A[3:0] ──────────┼──► [ 4-Bit Combined Adder-Subtractor ] ──┬──► Sum S[3:0]
 Operand B[3:0] ──────────┘                                          └──► Flags (Z, N, C, V)
```

The module receives two 4-bit Two's Complement signed operands:

$$
\mathbf{A} = (A_3, A_2, A_1, A_0) \quad \text{and} \quad \mathbf{B} = (B_3, B_2, B_1, B_0)
$$

And a 1-bit mode control signal $M$:
* $M = 0$: Perform Addition ($\mathbf{A} + \mathbf{B}$).
* $M = 1$: Perform Subtraction ($\mathbf{A} - \mathbf{B}$).

#### Gate Propagation Delays:
* 2-Input XOR Gate Delay: $t_{\text{xor}} = 0.8\text{ ns}$
* Full Adder Carry Delay: $t_{\text{carry}} = 0.6\text{ ns}$
* Full Adder Sum Delay: $t_{\text{sum}} = 1.2\text{ ns}$

#### Your Objective

1. Calculate the total critical path propagation delay $T_{\text{max}}$ for the 4-bit Combined Adder-Subtractor circuit.
2. Simulate the circuit in **Addition Mode ($M = 0$)** on operands $\mathbf{A} = 0101_2$ ($+5_{10}$) and $\mathbf{B} = 0011_2$ ($+3_{10}$). Evaluate all intermediate carries, output sum $\mathbf{S}$, and flags ($Z, N, C, V$).
3. Simulate the circuit in **Subtraction Mode ($M = 1$)** on operands $\mathbf{A} = 0101_2$ ($+5_{10}$) and $\mathbf{B} = 0011_2$ ($+3_{10}$). Evaluate all intermediate carries, output sum $\mathbf{S}$, and flags ($Z, N, C, V$).
4. Simulate the circuit in **Subtraction Mode ($M = 1$)** on operands $\mathbf{A} = 0101_2$ ($+5_{10}$) and $\mathbf{B} = 1100_2$ ($-4_{10}$). Evaluate for signed arithmetic overflow ($V$).
5. Verify all results against decimal arithmetic.

---

### Step-by-Step Derivation

#### Step 1: Calculate Critical Path Propagation Delay ($T_{\text{max}}$)

The critical path travels through:
1. The Controlled Inverter XOR bank ($t_{\text{xor}} = 0.8\text{ ns}$).
2. The carry ripple chain through Full Adders $\text{FA}_0, \text{FA}_1, \text{FA}_2$ ($3 \times t_{\text{carry}} = 3 \times 0.6\text{ ns} = 1.8\text{ ns}$).
3. The final sum XOR gate in $\text{FA}_3$ ($t_{\text{sum}} = 1.2\text{ ns}$).

$$
T_{\text{max}} = t_{\text{xor}} + (3 \cdot t_{\text{carry}}) + t_{\text{sum}}
$$

$$
T_{\text{max}} = 0.8\text{ ns} + (3 \cdot 0.6\text{ ns}) + 1.2\text{ ns} = 0.8\text{ ns} + 1.8\text{ ns} + 1.2\text{ ns} = 3.8\text{ ns}
$$

The 4-bit Combined Adder-Subtractor completes any addition or subtraction in **$3.8\text{ nanoseconds}$**!

---

#### Step 2: Simulation 1 — Addition Mode ($M = 0$) on $+5_{10} + (+3_{10})$

Operands:
* $\mathbf{A} = 0101_2$ ($A_3=0, A_2=1, A_1=0, A_0=1$; $+5_{10}$)
* $\mathbf{B} = 0011_2$ ($B_3=0, B_2=0, B_1=1, B_0=1$; $+3_{10}$)
* Mode $M = 0$ (Addition).

##### 1. Controlled Inverter Bank Output ($\mathbf{Z}$):
$$Z_i = B_i \oplus 0 = B_i \implies \mathbf{Z} = 0011_2$$

##### 2. Initial Carry-In ($C_0$):
$$C_0 = M = 0$$

##### 3. Bit-by-Bit Adder Execution:
* **Bit 0 ($\text{FA}_0$)**: $A_0=1, Z_0=1, C_0=0$.
  $S_0 = 1 \oplus 1 \oplus 0 = 0$.
  $C_1 = (1 \cdot 1) + (0 \cdot (1 \oplus 1)) = 1 + 0 = 1$.
* **Bit 1 ($\text{FA}_1$)**: $A_1=0, Z_1=1, C_1=1$.
  $S_1 = 0 \oplus 1 \oplus 1 = 0$.
  $C_2 = (0 \cdot 1) + (1 \cdot (0 \oplus 1)) = 0 + 1 = 1$.
* **Bit 2 ($\text{FA}_2$)**: $A_2=1, Z_2=0, C_2=1$.
  $S_2 = 1 \oplus 0 \oplus 1 = 0$.
  $C_3 = (1 \cdot 0) + (1 \cdot (1 \oplus 0)) = 0 + 1 = 1$.
* **Bit 3 ($\text{FA}_3$, MSB)**: $A_3=0, Z_3=0, C_3=1$.
  $S_3 = 0 \oplus 0 \oplus 1 = 1$.
  $C_4 = (0 \cdot 0) + (1 \cdot (0 \oplus 0)) = 0 + 0 = 0$.

##### 4. Output Sum Vector ($\mathbf{S}$) and Condition Flags:
* Sum Vector: $\mathbf{S} = 1000_2$ (Decimal $+8_{10}$ in 4-bit signed representation? Wait! $1000_2 = -8_{10}$ in signed Two's Complement!).
* **Zero Flag ($Z$)**: $\overline{S_3 + S_2 + S_1 + S_0} = \overline{1+0+0+0} = 0$.
* **Sign Flag ($N$)**: $N = S_3 = 1$.
* **Carry Flag ($C$)**: $C = C_4 = 0$.
* **Overflow Flag ($V$)**: $V = C_3 \oplus C_4 = 1 \oplus 0 = 1$ (**OVERFLOW!**).

##### Verification:
Mathematically, $+5 + (+3) = +8_{10}$.
In a 4-bit signed Two's Complement system, the maximum positive number is $+7_{10}$.
The result $+8_{10}$ exceeded hardware limits! The circuit correctly produced $V = 1$, alerting the processor that signed overflow occurred!

---

#### Step 3: Simulation 2 — Subtraction Mode ($M = 1$) on $+5_{10} - (+3_{10})$

Operands:
* $\mathbf{A} = 0101_2$ ($+5_{10}$)
* $\mathbf{B} = 0011_2$ ($+3_{10}$)
* Mode $M = 1$ (Subtraction).

##### 1. Controlled Inverter Bank Output ($\mathbf{Z}$):
$$Z_i = B_i \oplus 1 = \overline{B_i} \implies \mathbf{Z} = \overline{0011_2} = 1100_2$$

##### 2. Initial Carry-In ($C_0$):
$$C_0 = M = 1$$

##### 3. Bit-by-Bit Adder Execution:
* **Bit 0 ($\text{FA}_0$)**: $A_0=1, Z_0=0, C_0=1$.
  $S_0 = 1 \oplus 0 \oplus 1 = 0$.
  $C_1 = (1 \cdot 0) + (1 \cdot (1 \oplus 0)) = 0 + 1 = 1$.
* **Bit 1 ($\text{FA}_1$)**: $A_1=0, Z_1=0, C_1=1$.
  $S_1 = 0 \oplus 0 \oplus 1 = 1$.
  $C_2 = (0 \cdot 0) + (1 \cdot (0 \oplus 0)) = 0 + 0 = 0$.
* **Bit 2 ($\text{FA}_2$)**: $A_2=1, Z_2=1, C_2=0$.
  $S_2 = 1 \oplus 1 \oplus 0 = 0$.
  $C_3 = (1 \cdot 1) + (0 \cdot (1 \oplus 1)) = 1 + 0 = 1$.
* **Bit 3 ($\text{FA}_3$, MSB)**: $A_3=0, Z_3=1, C_3=1$.
  $S_3 = 0 \oplus 1 \oplus 1 = 0$.
  $C_4 = (0 \cdot 1) + (1 \cdot (0 \oplus 1)) = 0 + 1 = 1$.

##### 4. Output Sum Vector ($\mathbf{S}$) and Condition Flags:
* Sum Vector: $\mathbf{S} = 0010_2$ ($+2_{10}$).
* **Zero Flag ($Z$)**: $\overline{0+0+1+0} = 0$.
* **Sign Flag ($N$)**: $N = S_3 = 0$.
* **Carry Flag ($C$)**: $C = C_4 = 1$ (No borrow required, $5 \ge 3$).
* **Overflow Flag ($V$)**: $V = C_3 \oplus C_4 = 1 \oplus 1 = 0$ (No overflow!).

##### Verification:
Decimal check: $+5 - (+3) = +2_{10}$.
The circuit produced sum $\mathbf{S} = 0010_2 = +2_{10}$ with $V = 0$. **SUBTRACTION SUCCESSFUL!**

---

#### Step 4: Simulation 3 — Subtraction Mode ($M = 1$) on $+5_{10} - (-4_{10})$

Operands:
* $\mathbf{A} = 0101_2$ ($+5_{10}$)
* $\mathbf{B} = 1100_2$ ($-4_{10}$)
* Mode $M = 1$ (Subtraction).

##### 1. Controlled Inverter Bank Output ($\mathbf{Z}$):
$$\mathbf{Z} = \overline{1100_2} = 0011_2$$

##### 2. Initial Carry-In ($C_0$):
$$C_0 = M = 1$$

##### 3. Bit-by-Bit Adder Execution:
* **Bit 0 ($\text{FA}_0$)**: $A_0=1, Z_0=1, C_0=1 \implies S_0 = 1, C_1 = 1$.
* **Bit 1 ($\text{FA}_1$)**: $A_1=0, Z_1=1, C_1=1 \implies S_1 = 0, C_2 = 1$.
* **Bit 2 ($\text{FA}_2$)**: $A_2=1, Z_2=0, C_2=1 \implies S_2 = 0, C_3 = 1$.
* **Bit 3 ($\text{FA}_3$)**: $A_3=0, Z_3=0, C_3=1 \implies S_3 = 1, C_4 = 0$.

##### 4. Output Sum Vector ($\mathbf{S}$) and Flags:
* Sum Vector: $\mathbf{S} = 1001_2$ ($-7_{10}$).
* **Overflow Flag ($V$)**: $V = C_3 \oplus C_4 = 1 \oplus 0 = 1$ (**OVERFLOW!**).

##### Verification:
Decimal check: $+5 - (-4) = +5 + 4 = +9_{10}$.
Since $+9$ exceeds the 4-bit signed maximum ($+7$), the circuit correctly set $V = 1$.

All three simulation scenarios pass with 100% mathematical and logical precision. The Combined Adder-Subtractor is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Controlled Inverter (XOR Gate Bank)**: An array of 2-input XOR gates placed on an input operand bus that acts as a programmable conditional complementer ($Z_i = B_i \oplus M$), passing data unchanged ($Z_i = B_i$) when mode bit $M = 0$, or inverting data ($Z_i = \overline{B_i}$) when $M = 1$.
* **Combined Adder-Subtractor**: The unified hardware architecture that routes conditionally inverted operands ($B_i \oplus M$) into an $N$-bit binary adder while simultaneously feeding mode control bit $M$ into the initial Carry-In terminal ($C_0 = M$), executing addition ($A + B + 0$) when $M = 0$ and Two's Complement subtraction ($A + \overline{B} + 1$) when $M = 1$ using a single physical adder core.
