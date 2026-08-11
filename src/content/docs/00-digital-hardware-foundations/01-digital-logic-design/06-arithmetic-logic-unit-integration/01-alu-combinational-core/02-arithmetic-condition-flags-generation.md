---
title: "Arithmetic Condition Flags Generation and Status Register Mechanics"
---

# Arithmetic Condition Flags Generation and Status Register Mechanics

## The Unseen Metadata Problem in Binary Calculation

When an Arithmetic Logic Unit (ALU) performs an operation—such as adding two 32-bit integers or subtracting one address vector from another—it emits a primary numerical result bus $Y = (Y_{N-1}, \dots, Y_0)$. For standard data manipulation, this primary result vector is written back into a register file or memory location.

However, the primary result vector alone is fundamentally incomplete for controlling a computer processor's execution flow.

Consider what happens when a processor executes a conditional branch instruction, such as *"Jump to Location 100 if Variable A equals Variable B."* 

To test whether $A$ equals $B$, the ALU subtracts $B$ from $A$ ($A - B$). If $A$ and $B$ are identical (for example, $5 - 5$), the primary result bus emits a vector of all zeros: $Y = 00000000_2$. 

```text
THE RESULT BUS LIMITATION IN CONTROL DECISIONS

 Operands: A = 5, B = 5  ──► [ ALU Subtractor (A - B) ] ──► Result Y = 00000000_2
                                                            (32-Bit Output Bus)
                                                                   │
                                                                   ▼
                                                    How does the Control Unit
                                                    know the answer was ZERO
                                                    without reading all 32 bits?
```

If the CPU control unit needs to decide whether to take the jump, how does it know that the subtraction yielded zero? 

Without dedicated status logic, the CPU control unit would have to inspect every single one of the 32 physical output wires using a massive, multi-input NOR gate tree every time it executes a conditional branch instruction. Worse, as soon as the next clock cycle begins and the ALU computes a new operation, that zero result on the primary bus vanishes forever!

A central processing unit cannot evaluate conditional branches ($A = B$, $A < B$, $A > B$, or $A + B \text{ overflowed}$) by constantly re-reading wide data buses in real time.

To solve this decision-making bottleneck, digital engineering equips the ALU with a parallel metadata extraction network: **Condition Flags ($Z, N, V, C$)**, and captures these flags synchronously inside a dedicated storage block: the **Status Register (Flag Register)**.

By distilling complex multi-bit mathematical outcomes down to four single-bit flags and latching them into a Status Register, a processor can evaluate conditional jumps and loop boundaries instantly across subsequent clock cycles with zero data bus overhead.

---

## The Dashboard Gauge Array: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of condition flags and the Status Register before examining logic gate schematics, let us step away from microchips and picture the dashboard of a high-performance sports car.

Imagine driving a car down a highway. As the engine runs, the mechanical transmission and pistons perform complex mechanical work (the primary ALU operation).

```text
THE AUTOMOTIVE DASHBOARD STATUS INDICATORS

 Engine Pistons & Drive Shaft (ALU Core) ──► [ Dashboard Gauge Panel ]
                                              ├──► Speedometer Value (Primary Y)
                                              └──► Status Indicator Lights:
                                                    * Red Light (Fuel EMPTY = Z)
                                                    * Blue Light (Temp LOW = N)
                                                    * Orange Light (RPM Redline = C)
                                                    * Warning Light (Engine Fault = V)
```

The driver needs to make driving decisions: *"Should I pull into a gas station?"*, *"Is the engine overheating?"*, *"Should I shift up a gear?"*

Does the driver climb under the hood with a ruler and thermometer to measure fuel volume or piston friction while traveling at 100 km/h?
Of course not! The driver looks at four simple, single-bit **Status Indicator Lights** on the dashboard panel:

1. **Fuel Empty Light ($Z$)**: Lights up ($1$) if the fuel tank contains exactly **Zero** liters of gasoline.
2. **Sub-Zero Temp Light ($N$)**: Lights up ($1$) if the engine coolant temperature drops below **Negative** zero degrees.
3. **RPM Redline Light ($C$)**: Lights up ($1$) if the engine speed exceeds maximum rated RPM capacity (an **Unsigned Carry/Overflow** event).
4. **Engine Fault Light ($V$)**: Lights up ($1$) if an invalid mechanical pressure conflict occurs (a **Signed Mechanical Fault**).

Now, imagine that when an engine fault occurs (the $V$ light flashes), the car's onboard computer takes a digital photo of those four dashboard lights and saves it into a small memory chip called the **Dashboard Flight Recorder**.

Even if the engine shuts down two seconds later and the physical pressure drops back to zero, the mechanic can plug a diagnostic scanner into the Dashboard Flight Recorder hours later and read the recorded status lights to see exactly why the engine halted!

This automotive dashboard is the exact physical analogue of **Arithmetic Condition Flags and the Status Register**:
* The engine mechanical output is the **ALU Primary Result Bus ($Y$)**.
* The four single-bit dashboard lights are the **Condition Flags ($Z, N, C, V$)**.
* The diagnostic flight memory chip is the **Status Register (Flag Register)**.
* The driver making steering choices based on the lights is the **CPU Control Unit executing Conditional Branches ($\text{BEQ}, \text{BLT}, \text{BGE}$)**.

---

## Mechanics of Arithmetic Condition Flags Generation

To master ALU status logic, we must dissect the formal mechanics of its two core primitives:
1. **The Four Condition Flags ($Z, N, C, V$)**: How combinational logic gate networks evaluate the ALU's primary result vector $Y$ and adder carry lines to generate single-bit mathematical metadata.
2. **The Status Register (Flag Register)**: How an edge-triggered register captures these metadata bits synchronously on clock edges so conditional branch instructions can evaluate them across subsequent execution cycles.

---

### Primitive 1: The Four Fundamental Condition Flags ($Z, N, C, V$)

Modern central processing units (such as ARM, x86, or RISC-V architectures) standardize on four single-bit arithmetic condition flags, collectively known as the **NZCV Flags** or **SR (Status Register) Flags**.

```text
THE FOUR FUNDAMENTAL CONDITION FLAGS

                         ALU COMBINATIONAL CORE
                                   │
         ┌─────────────────┬───────┴─────────┬─────────────────┐
         ▼                 ▼                 ▼                 ▼
   Zero Flag (Z)     Sign Flag (N)     Carry Flag (C)    Overflow Flag (V)
   (Y == 00...0_2)   (Y_MSB == 1)      (Unsigned Carry)  (Signed Overflow)
```

Let us derive the exact Boolean logic equations and physical gate networks for each of these four flags.

---

### 1. The Zero Flag ($Z$)

The **Zero Flag ($Z$)** is a single-bit output that asserts $1$ if and only if **every single bit** of the $N$-bit ALU result vector $Y = (Y_{N-1}, \dots, Y_0)$ is equal to $0$.

If even a single bit in the $N$-bit result vector is $1$, the Zero Flag must evaluate to $0$.

#### Boolean Equation for the Zero Flag:
Mathematically, $Z = 1$ when $Y_0 = 0 \text{ AND } Y_1 = 0 \text{ AND } \dots \text{ AND } Y_{N-1} = 0$.

By De Morgan's Laws, the logical AND of inverted variables is equal to the inverted OR sum of those variables:

$$
Z = \overline{Y_{N-1} + Y_{N-2} + \dots + Y_1 + Y_0}
$$

Where:
* $Z$ is the single-bit Zero Flag output ($Z = 1$ indicates a zero result).
* $Y_k$ is the $k$-th bit of the primary ALU result vector $Y$.
* $+$ represents the logical OR operation.
* The overarching bar represents the logical NOT (inversion) operation.

```text
ZERO FLAG GENERATION GATE NETWORK (4-BIT EXAMPLE)

 Result Bus Bits Y3, Y2, Y1, Y0
 Y3 ───┐
 Y2 ───┼───► [ 4-Input NOR Gate ] ───► Zero Flag Z
 Y1 ───┤                               (Z = 1 when ALL Y_i = 0)
 Y0 ───┘
```

**Physical Implementation**: The Zero Flag is synthesized using a single $N$-input **NOR gate** operating across all wires of the primary result bus $Y$.

**Primary Use Case**: Evaluating equality ($A = B$). When a processor executes a comparison instruction $\text{CMP } A, B$, the ALU computes $A - B$. If $A = B$, the result is $00\dots0_2$, forcing $Z = 1$. A subsequent "Branch if Equal" ($\text{BEQ}$) instruction simply checks if $Z == 1$!

---

### 2. The Sign Flag ($N$ or $S$)

The **Sign Flag ($N$)** (also designated as $S$ in some instruction sets) indicates whether an arithmetic operation produced a **negative result** under Two's Complement signed representation.

In Two's Complement signed arithmetic, the Most Significant Bit (MSB, bit $Y_{N-1}$) carries a negative power weight ($-2^{N-1}$).
* If $Y_{N-1} = 0$, the number is positive or zero.
* If $Y_{N-1} = 1$, the number is negative.

#### Boolean Equation for the Sign Flag:
The Sign Flag $N$ is simply a **direct physical wire connection** to the Most Significant Bit ($Y_{N-1}$) of the primary ALU result bus:

$$
N = Y_{N-1}
$$

Where:
* $N$ is the single-bit Sign Flag output ($N = 1$ indicates a negative result).
* $Y_{N-1}$ is the Most Significant Bit (MSB) of the $N$-bit primary result vector $Y$.

```text
SIGN FLAG GENERATION WIRING

 Result Bus Y[N-1..0]
 Y[N-1] (MSB Pin) ─────────────────────────► Sign Flag N
 Y[N-2..0] (Lower Bits) ──► (To Zero Gate)   (Direct Wire! Zero Gate Delay!)
```

**Physical Implementation**: The Sign Flag requires **zero logic gates**! It is a direct copper trace tapping the MSB line of the result bus.

**Primary Use Case**: Evaluating signed less-than-zero conditions ($A < 0$).

---

### 3. The Carry Flag ($C$)

The **Carry Flag ($C$)** captures unsigned arithmetic overflow during addition, or unsigned borrow status during subtraction.

The Carry Flag is derived from the final carry-out bit ($C_N$) emerging from the most significant Full Adder stage of the ALU's arithmetic core.

However, its physical interpretation depends on whether the ALU is executing **Addition** or **Subtraction**:

1. **In Addition Mode ($OP_{\text{SUB}} = 0$)**:
   The ALU computes $Y = A + B + 0$.
   If the sum exceeds the maximum $N$-bit unsigned capacity ($2^N - 1$), a carry-out is generated: $C_N = 1$.
   $$C = C_N$$
2. **In Subtraction Mode ($OP_{\text{SUB}} = 1$)**:
   The ALU computes $A - B$ using Two's Complement addition $Y = A + \overline{B} + 1$.
   * If $A \ge B$ (No borrow required!): The addition produces a carry-out $C_N = 1$.
   * If $A < B$ (Borrow required!): The addition produces $C_N = 0$.

In ARM and x86 architectures, the Carry Flag is defined to represent an **active-low Borrow flag** during subtraction:

$$
C = C_N \oplus OP_{\text{SUB}}
$$

Where:
* $C$ is the single-bit Carry Flag output.
* $C_N$ is the final carry-out from the MSB stage of the adder.
* $OP_{\text{SUB}}$ is the control bit that is $1$ for subtraction and $0$ for addition.
* $\oplus$ represents the logical XOR operation.

```text
CARRY FLAG GENERATION GATE NETWORK

 MSB Carry Out (C_N) ───────►┌───────┐
                             │ XOR   ├──► Carry Flag C
 Subtraction Mode (OP_SUB) ─►└───────┘
```

```text
CARRY FLAG INTERPRETATION SUMMARY

 Operation Mode │ Final Carry C_N │ Carry Flag C │ Unsigned Arithmetic Meaning
────────────────┼─────────────────┼──────────────┼───────────────────────────────
 Addition (0)   │     C_N = 1     │    C = 1     │ Unsigned Overflow! (Result > 2^N - 1)
 Addition (0)   │     C_N = 0     │    C = 0     │ No Overflow (Result Valid)
 Subtraction(1) │     C_N = 1     │    C = 0     │ A >= B (No Borrow Needed)
 Subtraction(1) │     C_N = 0     │    C = 1     │ A < B  (Unsigned Borrow Occurred!)
```

**Primary Use Case**: Multi-precision arithmetic (e.g., adding two 64-bit numbers using a 32-bit ALU by executing "Add with Carry" `ADC` on the upper 32 bits).

---

### 4. The Signed Overflow Flag ($V$)

The **Signed Overflow Flag ($V$)** detects whether a signed Two's Complement calculation produced a result that exceeded the representable signed range $[-2^{N-1}, \, +2^{N-1}-1]$ of an $N$-bit container.

An arithmetic overflow in signed Two's Complement occurs if and only if:
1. Adding two positive numbers yields a negative result ($+ \text{ and } + \implies -$).
2. Adding two negative numbers yields a positive result ($- \text{ and } - \implies +$).
3. Subtracting a positive number from a negative number yields a positive result ($- \text{ and } + \implies +$).

#### 1. Hardware Gate Derivation via MSB Carry Comparison
In a binary full-adder array, signed Two's Complement overflow occurs if and only if **the carry entering the MSB stage ($C_{N-1}$) differs from the carry leaving the MSB stage ($C_N$)**:

$$
V = C_{N-1} \oplus C_N
$$

Where:
* $V$ is the single-bit Signed Overflow Flag ($V = 1$ indicates signed overflow corruption).
* $C_{N-1}$ is the carry bit entering the most significant Full Adder stage ($\text{FA}_{N-1}$).
* $C_N$ is the carry bit leaving the most significant Full Adder stage ($\text{FA}_{N-1}$).

```text
OVERFLOW FLAG GENERATION VIA MSB CARRIES

 Carry Into MSB (C_N-1) ────►┌───────┐
                             │ XOR   ├──► Overflow Flag V
 Carry Out of MSB (C_N)  ───►└───────┘
```

#### 2. Alternative Hardware Derivation via Operand Sign Bits
We can also derive $V$ directly by comparing the sign bits of operand $A$ ($A_{N-1}$), modified operand $B$ ($Z_{N-1}$), and result $Y$ ($Y_{N-1}$):

$$
V = (A_{N-1} \cdot Z_{N-1} \cdot \overline{Y_{N-1}}) + (\overline{A_{N-1}} \cdot \overline{Z_{N-1}} \cdot Y_{N-1})
$$

Where:
* $A_{N-1}$ is the sign bit of input operand $A$.
* $Z_{N-1}$ is the sign bit of the modified input operand $B$ ($Z_{N-1} = B_{N-1} \oplus OP_{\text{SUB}}$).
* $Y_{N-1}$ is the sign bit of the primary result bus $Y$.

Both formulas $V = C_{N-1} \oplus C_N$ and $V = (A_{N-1} Z_{N-1} \overline{Y_{N-1}}) + (\overline{A_{N-1}} \overline{Z_{N-1}} Y_{N-1})$ are 100% mathematically equivalent!

```text
SUMMARY OF THE FOUR CONDITION FLAG EQUATIONS

 Flag Name            │ Symbol │ Logic Gate Equation                       │ Meaning when Flag = 1
──────────────────────┼────────┼───────────────────────────────────────────┼────────────────────────────
 Zero Flag            │   Z    │ Z = NOR(Y_N-1, Y_N-2, ..., Y_0)           │ Result Y is exactly ZERO
 Sign Flag            │   N    │ N = Y_N-1                                 │ Result Y is NEGATIVE
 Carry Flag           │   C    │ C = C_N (+) OP_SUB                        │ Unsigned Carry / Borrow
 Signed Overflow Flag │   V    │ V = C_N-1 (+) C_N                         │ Signed Two's Comp Overflow
```

---

## Primitive 2: The Status Register (Flag Register) Architecture

Generating condition flags combinational-style ($Z, N, C, V$) is only the first half of the solution. As soon as the current clock cycle ends and the processor moves to the next instruction, the ALU computes new data, and the combinational flag signals change!

To preserve these arithmetic metadata bits so that subsequent conditional branch instructions can read them, the processor stores them inside a dedicated sequential storage block: the **Status Register (Flag Register)**.

```text
STATUS REGISTER ARCHITECTURE SCHEMATIC

 Combinational Flag Generator (Z, N, C, V)
    │           │           │           │
    ▼           ▼           ▼           ▼
 ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
 │ D  Q │    │ D  Q │    │ D  Q │    │ D  Q │  ◄── Status Register
 │ FF_Z │    │ FF_N │    │ FF_C │    │ FF_V │      (4 Edge-Triggered D-FFs)
 │ >CLK │    │ >CLK │    │ >CLK │    │ >CLK │
 └───▲──┘    └───▲──┘    └───▲──┘    └───▲──┘
     │           │           │           │
 Clock ┴─────────┴───────────┴───────────┴──── Global Clock CLK
                 Flag Write Enable (WE_flags)
```

### 1. Synchronous Flag Capture Mechanics

The Status Register consists of four edge-triggered D flip-flops ($\text{FF}_Z, \text{FF}_N, \text{FF}_C, \text{FF}_V$).

On every rising clock edge where the processor executes an arithmetic or logical instruction, a control signal called **Flag Write Enable ($\text{WE}_{\text{flags}}$)** is asserted High ($1$).

* The four combinational flag signals ($Z, N, C, V$) sit at the $D$-input pins of the Status Register.
* When the rising clock edge arrives ($CLK = 0 \to 1$), the Status Register captures $Z, N, C,$ and $V$ simultaneously into its flip-flops.
* The captured flag bits appear at the $Q$-outputs of the Status Register and remain **100% frozen and stable** across subsequent clock cycles until a new arithmetic instruction updates them again!

```text
STATUS REGISTER CAPTURE CHRONOLOGY

 Cycle 1: ALU executes SUB A, B  ──► Flags Z=1, N=0, C=0, V=0 generated combinationally.
          Rising Clock Edge 1   ──► Status Register CAPTURES (Z=1, N=0, C=0, V=0)!

 Cycle 2: CPU executes MOV C, D  ──► WE_flags = 0 (Preserve Flags!).
          Status Register HOLDS (Z=1, N=0, C=0, V=0) frozen!

 Cycle 3: CPU executes BEQ Label ──► Control Unit reads Status Register Z bit (Z=1).
          BRANCH TAKEN INSTANTLY!
```

---

## How Condition Flags Drive Conditional Branch Execution

How does a CPU's control unit evaluate complex high-level conditional statements—such as `if (A == B)`, `if (A < B)`, or `if (A >= B)`—using the four simple bits stored inside the Status Register?

The control unit evaluates small Boolean logic combinations over the stored NZCV bits:

```text
CONDITIONAL BRANCH DECODING TABLE

 High-Level Condition │ Assembly Instruction │ Status Register Logic Equation │ Meaning / Trigger Condition
──────────────────────┼──────────────────────┼────────────────────────────────┼───────────────────────────────
 Equal (A == B)       │ BEQ (Branch Equal)   │ Z == 1                         │ Result of (A - B) was Zero
 Not Equal (A != B)   │ BNE (Branch Not Eq)  │ Z == 0                         │ Result of (A - B) was Non-Zero
 Unsigned Higher/Same │ BHS / BCS            │ C == 0                         │ No unsigned borrow occurred
 Unsigned Lower       │ BLO / BCC            │ C == 1                         │ Unsigned borrow occurred
 Signed Less Than     │ BLT (Branch Less)    │ N (+) V == 1                   │ True signed negative condition
 Signed Greater/Equal │ BGE (Branch Greater) │ N (+) V == 0                   │ True signed positive condition
```

### The Magic of the Signed Less-Than Condition ($N \oplus V$)

Look at the equation for **Signed Less Than** ($\text{BLT}$, checking if $A < B$ in Two's Complement):

$$\text{Less Than Condition} = N \oplus V$$

Why does taking the XOR of the Sign Flag ($N$) and the Overflow Flag ($V$) evaluate signed $A < B$ correctly under all circumstances?

Let us test two physical cases:

#### Case 1: No Signed Overflow Occurred ($V = 0$)
When $V = 0$, no overflow corrupted the calculation $A - B$. The sign bit $N = Y_{N-1}$ reflects the true mathematical sign of the result:
* If $N = 1$, $A - B < 0 \implies A < B$.
* Evaluating $N \oplus V = 1 \oplus 0 = \mathbf{1}$ (Condition Met!).

#### Case 2: Signed Overflow OCCURRED ($V = 1$)
Suppose $A = -8_{10}$ and $B = +5_{10}$. We evaluate $A - B = -8 - 5 = -13_{10}$.
In a 4-bit signed container (range $-8$ to $+7$), $-13$ overflows the system!
The ALU computes $-13 \pmod{16} = +3_{10}$ ($Y_{N-1} = 0$, so $N = 0$).

Look at what happened: $A < B$ is **TRUE** ($-8 < +5$), but because overflow occurred ($V = 1$), the Sign Flag incorrectly reads $N = 0$ (positive)!

Now evaluate the XOR condition $N \oplus V$:

$$
N \oplus V = 0 \oplus 1 = \mathbf{1} \quad (\text{Condition Met!})
$$

Look at that mathematical magic! **The XOR with $V$ automatically corrects the inverted Sign Flag $N$ caused by arithmetic overflow!**

```text
THE SIGN-OVERFLOW XOR CORRECTION MECHANISM

 True Math: A < B (-8 < +5) ──► Overflow V = 1 flips Sign N to 0 (False Positive!)
 XOR Correction: N (+) V = 0 (+) 1 = 1 (TRUE SIGN RESTORED PERFECTLY!)
```

---

## Engineering Reality: Selective Flag Updates and Non-Arithmetic Operations

In physical processor design, not every instruction should modify the Status Register.

If a CPU executes a data transfer instruction (such as `MOV R1, R2` or loading a value from memory), or an address calculation instruction (such as updating a stack pointer), updating the Status Register would destroy the $Z, N, C, V$ flags generated by a previous comparison instruction!

```text
INSTRUCTION-CONTROLLED FLAG UPDATE MASKING

 Instruction Type             │ Flag Write Enable (WE_flags) │ Status Register Action
──────────────────────────────┼──────────────────────────────┼─────────────────────────
 Arithmetic (ADD, SUB, CMP)   │ WE_flags = 1                 │ Update Z, N, C, V Flags
 Bitwise Logic (AND, OR, XOR) │ WE_flags = 1                 │ Update Z, N; Clear C, V=0
 Data Move (MOV, LOAD, STORE) │ WE_flags = 0                 │ PRESERVE EXISTING FLAGS!
```

### Flag Handling for Bitwise Logic Operations (AND, OR, XOR)
When the ALU executes a bitwise logic instruction (such as $A \cdot B$ or $A \oplus B$):
* **Zero Flag ($Z$)** is updated normally based on whether the bitwise result is all zeros.
* **Sign Flag ($N$)** is updated normally based on the MSB of the bitwise result.
* **Carry Flag ($C$) and Overflow Flag ($V$)** have no mathematical meaning for bitwise logic! Hardware controllers explicitly **clear $C = 0$ and $V = 0$** during logical operations.

---

## Solved Industrial Engineering Exercise: 4-Bit ALU Flag Generator and Status Register Subsystem

To consolidate your complete mastery of condition flag generation ($Z, N, C, V$), Status Register latching, signed overflow detection, and conditional branch decoding, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics processor team is designing the 4-bit ALU Status Generator and Flag Register subsystem for an autopilot flight computer.

The subsystem receives:
1. A 4-bit primary ALU result vector $\mathbf{Y} = (Y_3, Y_2, Y_1, Y_0)$.
2. The MSB carry-in bit $C_3$ (carry into bit 3) and MSB carry-out bit $C_4$ (carry out of bit 3) from the 4-bit adder core.
3. The Subtraction Mode control bit $OP_{\text{SUB}}$ ($0 = \text{ADD}, 1 = \text{SUB}$).
4. The Master Flag Write Enable line $\text{WE}_{\text{flags}}$.
5. Global system clock $CLK$.

```text
AUTOPILOT ALU STATUS GENERATOR SUBSYSTEM

 Result Bus Y[3:0] ────────┐
 MSB Carry In C3 ──────────┤
 MSB Carry Out C4 ─────────┼──► [ ALU Flag Generator ] ──► (Z, N, C, V)
 Sub Mode OP_SUB ──────────┤                                    │
 Flag Write Enable WE ─────┘                                    ▼
 Clock CLK ──────────────────────────────────────────► [ Status Register ] ──► (Q_Z, Q_N, Q_C, Q_V)
```

The Status Register captures flags $Z, N, C, V$ into four D flip-flops $(\text{FF}_Z, \text{FF}_N, \text{FF}_C, \text{FF}_V)$ on the rising clock edge when $\text{WE}_{\text{flags}} = 1$.

#### Your Objective

1. Write the complete Boolean equations for combinational flags $Z, N, C, V$ for this 4-bit ALU core.
2. Calculate the total physical gate count and transistor footprint for the 4-flag combinational generator network.
3. Simulate the flag generator and Status Register across four sequential ALU execution cycles:
   * Cycle 1: $\text{SUB}$ $5_{10} - 5_{10}$ ($0101_2 - 0101_2$, $\text{WE}_{\text{flags}}=1$).
   * Cycle 2: $\text{ADD}$ $7_{10} + 3_{10}$ ($0111_2 + 0011_2$, $\text{WE}_{\text{flags}}=1$).
   * Cycle 3: $\text{MOV}$ Data Instruction ($\text{WE}_{\text{flags}}=0$).
   * Cycle 4: $\text{SUB}$ $(-6_{10}) - (+5_{10})$ ($1010_2 - 0101_2$, $\text{WE}_{\text{flags}}=1$).
4. Evaluate conditional branch signals $\text{BEQ}$ ($Z=1$) and $\text{BLT}$ ($N \oplus V = 1$) for each cycle.
5. Verify all results against decimal arithmetic.

---

### Step-by-Step Derivation

#### Step 1: Derive Combinational Flag Equations

Using our established status primitives for a 4-bit ALU ($N=4$):

##### 1. Zero Flag ($Z$):
$$Z = \overline{Y_3 + Y_2 + Y_1 + Y_0}$$

##### 2. Sign Flag ($N$):
$$N = Y_3$$

##### 3. Carry Flag ($C$):
$$C = C_4 \oplus OP_{\text{SUB}}$$

##### 4. Signed Overflow Flag ($V$):
$$V = C_3 \oplus C_4$$

```text
4-BIT COMBINATIONAL FLAG GENERATOR SCHEMATIC

 Result Bits Y3..Y0 ──► [ 4-Input NOR ] ──────────────────────► Zero Flag Z
 Result Bit Y3 ───────────────────────────────────────────────► Sign Flag N
 Carry Out C4, OP_SUB ──► [ XOR 1 ] ──────────────────────────► Carry Flag C
 Carries C3, C4 ───────► [ XOR 2 ] ──────────────────────────► Overflow Flag V
```

---

#### Step 2: Calculate CMOS Transistor Footprint of the Flag Generator

* **Zero Flag Gate**: One 4-input NOR gate = 8 transistors.
* **Sign Flag Wiring**: Direct wire = 0 transistors.
* **Carry Flag Gate**: One 2-input XOR gate = 8 transistors.
* **Overflow Flag Gate**: One 2-input XOR gate = 8 transistors.

$$\text{Combinational Flag Generator Area} = 8 + 0 + 8 + 8 = \mathbf{24 \text{ CMOS Transistors}}$$

The entire 4-flag combinational generator requires only **24 physical transistors**!

---

#### Step 3: Simulate Four Sequential Execution Cycles

Let us trace the primary ALU inputs, generated flags, Status Register contents, and branch evaluations across all four cycles.

---

##### Cycle 1: $\text{SUB } 5_{10} - 5_{10}$ ($0101_2 - 0101_2$, $OP_{\text{SUB}} = 1, \text{WE}_{\text{flags}} = 1$)
* Operands: $A = 0101_2$, $B = 0101_2$.
* Subtraction: $0101_2 + \overline{0101_2} + 1 = 0101_2 + 1010_2 + 1 = 10000_2$.
* Primary Result Vector: $Y = 0000_2$.
* Carries: $C_3 = 1$ (carry into bit 3), $C_4 = 1$ (carry out of bit 3).

###### Combinational Flag Calculations:
* $Z = \overline{0 + 0 + 0 + 0} = \overline{0} = \mathbf{1}$ (Result is Zero!).
* $N = Y_3 = \mathbf{0}$ (Result is Non-Negative).
* $C = C_4 \oplus OP_{\text{SUB}} = 1 \oplus 1 = \mathbf{0}$ (No unsigned borrow occurred, $5 \ge 5$).
* $V = C_3 \oplus C_4 = 1 \oplus 1 = \mathbf{0}$ (No signed overflow).

###### Status Register Update (Rising Clock Edge 1):
Captured Flags in Status Register: $\mathbf{Q}_{\text{flags}} = (Z=1, N=0, C=0, V=0)$.

###### Branch Evaluation:
* $\text{BEQ}$ (Branch if Equal, $Z == 1$): $Z = 1 \implies \mathbf{\text{BEQ TAKEN!}}$
* $\text{BLT}$ (Branch Less Than, $N \oplus V == 1$): $0 \oplus 0 = 0 \implies \mathbf{\text{BLT NOT TAKEN.}}$

---

##### Cycle 2: $\text{ADD } 7_{10} + 3_{10}$ ($0111_2 + 0011_2$, $OP_{\text{SUB}} = 0, \text{WE}_{\text{flags}} = 1$)
* Operands: $A = 0111_2 (+7_{10})$, $B = 0011_2 (+3_{10})$.
* Addition: $0111_2 + 0011_2 = 1010_2$.
* Primary Result Vector: $Y = 1010_2$ ($-6_{10}$ in 4-bit Two's Complement!).
* Carries: $C_3 = 1$ (carry into bit 3), $C_4 = 0$ (carry out of bit 3).

###### Combinational Flag Calculations:
* $Z = \overline{1 + 0 + 1 + 0} = \overline{1} = \mathbf{0}$ (Non-Zero).
* $N = Y_3 = \mathbf{1}$ (Negative MSB bit!).
* $C = C_4 \oplus OP_{\text{SUB}} = 0 \oplus 0 = \mathbf{0}$ (No unsigned carry).
* $V = C_3 \oplus C_4 = 1 \oplus 0 = \mathbf{1}$ (**SIGNED OVERFLOW!** $+7 + (+3) = +10$, exceeds $+7$ limit!).

###### Status Register Update (Rising Clock Edge 2):
Captured Flags in Status Register: $\mathbf{Q}_{\text{flags}} = (Z=0, N=1, C=0, V=1)$.

###### Branch Evaluation:
* $\text{BEQ}$ ($Z == 1$): $Z = 0 \implies \mathbf{\text{BEQ NOT TAKEN.}}$
* $\text{BLT}$ ($N \oplus V == 1$): $N \oplus V = 1 \oplus 1 = 0 \implies \mathbf{\text{BLT NOT TAKEN.}}$
  *(Mathematical Check: $+7 + (+3) = +10 > 0$, so signed result is NOT less than zero! The XOR $1 \oplus 1 = 0$ correctly prevented a false signed-less-than branch!).*

---

##### Cycle 3: $\text{MOV } R_1, R_2$ Data Instruction ($\text{WE}_{\text{flags}} = 0$)
* ALU computes data transfer. Combinational flags fluctuate.
* **Flag Write Enable is INACTIVE ($\text{WE}_{\text{flags}} = 0$)!**
* The Status Register flip-flops ignore incoming D-signals and **hold their previous state**.

###### Status Register Value during Cycle 3:
Retained Flags in Status Register: $\mathbf{Q}_{\text{flags}} = (Z=0, N=1, C=0, V=1)$ (Preserved from Cycle 2!).

---

##### Cycle 4: $\text{SUB } (-6_{10}) - (+5_{10})$ ($1010_2 - 0101_2$, $OP_{\text{SUB}} = 1, \text{WE}_{\text{flags}} = 1$)
* Operands: $A = 1010_2 (-6_{10})$, $B = 0101_2 (+5_{10})$.
* Subtraction: $1010_2 + \overline{0101_2} + 1 = 1010_2 + 1010_2 + 1 = 10101_2$.
* Primary Result Vector: $Y = 0101_2$ ($+5_{10}$).
* Carries: $C_3 = 0$ (carry into bit 3), $C_4 = 1$ (carry out of bit 3).

###### Combinational Flag Calculations:
* $Z = \overline{0 + 1 + 0 + 1} = \overline{1} = \mathbf{0}$.
* $N = Y_3 = \mathbf{0}$ (Positive MSB bit!).
* $C = C_4 \oplus OP_{\text{SUB}} = 1 \oplus 1 = \mathbf{0}$ (No borrow).
* $V = C_3 \oplus C_4 = 0 \oplus 1 = \mathbf{1}$ (**SIGNED OVERFLOW!** $-6 - (+5) = -11$, exceeds $-8$ limit!).

###### Status Register Update (Rising Clock Edge 4):
Captured Flags in Status Register: $\mathbf{Q}_{\text{flags}} = (Z=0, N=0, C=0, V=1)$.

###### Branch Evaluation:
* $\text{BLT}$ (Branch Less Than, $N \oplus V == 1$):
  $$N \oplus V = 0 \oplus 1 = \mathbf{1} \implies \mathbf{\text{BLT TAKEN!}}$$

##### Mathematical Verification of Signed Branching:
We evaluated $-6 - (+5)$. Is $-6$ strictly less than $+5$? **YES!** ($-6 < +5$).
Even though signed overflow flipped the result's MSB to $0$ ($+5_{10}$), the signed less-than evaluation $N \oplus V = 0 \oplus 1 = 1$ **correctly triggered the Signed Less Than Branch ($\text{BLT}$)**!

---

### Summary Table of Simulation Cycle Results

```text
COMPLETE 4-CYCLE ALU STATUS SIMULATION SUMMARY

 Cycle │ Instruction Executed  │ Result Y │ Z │ N │ C │ V │ Active Status Register State │ BEQ (Z=1) │ BLT (N^V=1)
───────┼───────────────────────┼──────────┼───┼───┼───┼───┼──────────────────────────────┼───────────┼─────────────
   1   │ SUB 5 - 5             │  0000_2  │ 1 │ 0 │ 0 │ 0 │ Q_flags = (Z=1, N=0, C=0, V=0)│  TAKEN!   │  NOT TAKEN
   2   │ ADD +7 + (+3)         │  1010_2  │ 0 │ 1 │ 0 │ 1 │ Q_flags = (Z=0, N=1, C=0, V=1)│ NOT TAKEN │  NOT TAKEN
   3   │ MOV Data (WE_flags=0) │  xxxx_2  │ - │ - │ - │ - │ Q_flags = (Z=0, N=1, C=0, V=1)│ NOT TAKEN │  NOT TAKEN
   4   │ SUB -6 - (+5)         │  0101_2  │ 0 │ 0 │ 0 │ 1 │ Q_flags = (Z=0, N=0, C=0, V=1)│ NOT TAKEN │   TAKEN!
```

All four simulation cycles evaluate with 100% mathematical, physical, and logical precision. The ALU Status Generator and Status Register subsystem is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Condition Flags ($Z, N, V, C$)**: The four single-bit combinational metadata outputs calculated from an ALU operation—Zero ($Z = \text{NOR}(Y)$), Sign ($N = Y_{N-1}$), Carry ($C = C_N \oplus OP_{\text{SUB}}$), and Signed Overflow ($V = C_{N-1} \oplus C_N$)—that distill multi-bit mathematical outcomes down to single-bit status indicators for control flow evaluation.
* **Status Register (Flag Register)**: A dedicated, edge-triggered multi-bit sequential storage register ($\text{FF}_Z, \text{FF}_N, \text{FF}_C, \text{FF}_V$) that synchronously captures and holds condition flags on active clock edges when $\text{WE}_{\text{flags}} = 1$, preserving mathematical metadata across cycles so conditional branch instructions ($\text{BEQ}, \text{BNE}, \text{BLT}, \text{BGE}$) can evaluate previous calculation outcomes.
