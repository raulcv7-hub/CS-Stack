---
title: "Arithmetic-Logic Operation Multiplexing and ALU Operation Control Decoding"
---

# Arithmetic-Logic Operation Multiplexing and ALU Operation Control Decoding

## The Bus Contention Crisis of Multi-Operation Execution

In a central processing unit (CPU) or digital signal processor (DSP), the computer must perform a vast variety of mathematical and bitwise operations on incoming data operands ($A$ and $B$). On one clock cycle, the processor needs to perform binary addition ($A + B$); on the next cycle, it needs to performTwo's Complement subtraction ($A - B$); on the following cycle, it must execute a bitwise AND ($A \cdot B$), a bitwise OR ($A + B$), a bitwise XOR ($A \oplus B$), or a bitwise logical shift ($A \ll 1$).

If a hardware engineer attempts to construct an execution core by fabricating separate, independent hardware blocks for each mathematical operation and soldering all of their output buses directly together onto a single processor result wire, an immediate physical disaster occurs: **Bus Contention**.

```text
THE MULTI-UNIT BUS CONTENTION DISASTER

 Operand A, B ───┬───► [ Adder Unit (A + B) ] ───► Output: 1 ──┐
                 ├───► [ AND Unit   (A * B) ] ───► Output: 0 ──┼──► SHORT CIRCUIT!
                 ├───► [ XOR Unit   (A ^ B) ] ───► Output: 1 ──┤   (Bus Contention)
                 └───► [ Shifter    (A << 1)] ───► Output: 0 ──┘          │
                                                                          ▼
                                                                  Physical Burnout!
```

In binary CMOS silicon, a functional unit attempting to output a logical $1$ connects the physical wire directly to the positive power supply ($V_{DD}$), while a unit outputting a logical $0$ connects that same wire directly to ground ($0\text{ V}$). When the Adder unit outputs $1$ and the bitwise AND unit simultaneously outputs $0$ on the exact same physical wire, a massive short circuit occurs. High electrical currents surge through the output transistors, causing rapid thermal heating, severe voltage degradation, and permanent destruction of the microchip.

Conversely, laying down separate, dedicated physical wires from every single internal execution unit to every destination register across the processor causes an impenetrable web of copper interconnect traces that consumes massive silicon die area.

How do we build a unified, single-bus execution engine—an **Arithmetic Logic Unit (ALU)**—that calculates all required mathematical and bitwise functions in parallel without electrical short circuits, and uses an **ALU Operation Select Code** driving **Bus Multiplexing Logic** to cleanly route exactly one chosen result to a single output bus while completely isolating all unselected execution blocks?

---

## The Swiss Army Knife Selector: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an Arithmetic Logic Unit routes multiple parallel calculations onto a single output line, let us picture a familiar pocket tool: a multi-blade Swiss Army Knife.

Imagine a specialized Swiss Army Knife equipped with four distinct fold-out tools: a **Knife Blade** (for cutting), a **Pair of Scissors** (for trimming), a **Screwdriver** (for turning screws), and a **Can Opener** (for opening cans).

```text
THE SWISS ARMY KNIFE MULTI-TOOL MODEL

 Hand Force (Operands A, B) ──► [ Central Tool Handle ]
                                       │
         ┌──────────────────┬──────────┴───────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼
    [ Knife Blade ]   [ Scissors ]       [ Screwdriver ]    [ Can Opener ]
       (Addition)     (Subtraction)      (Bitwise AND)       (Bitwise OR)
```

All four tools are permanently attached to the same central handle. The human hand applying mechanical force to the handle represents the incoming **Data Operands ($A$ and $B$)**.

When you need to turn a screw on a workbench, how do you use the Swiss Army Knife?
* You do **NOT** unfold all four tools simultaneously and try to jam them into the screw head at the exact same second! Unfolding all four tools at once causes them to collide with each other, blocking the screwdriver and ruining the job.
* Instead, you operate a **Selector Latch** on the side of the handle:
  1. You select Position 2 (**Screwdriver Mode**).
  2. The knife handle extends **ONLY the Screwdriver blade** into the active work slot ($Y$).
  3. The Knife Blade, Scissors, and Can Opener remain safely folded inside the handle, completely isolated from the work surface!

```text
SELECTIVE TOOL DEPLOYMENT (OPERATION MULTIPLEXING)

 Mode Dial = Position 2 (Screwdriver)
           │
           ▼
 [ Extended Screwdriver Blade ] ──► Active Work Slot (Output Y)
 (Knife, Scissors, Can Opener remain safely folded inside handle!)
```

Notice three vital properties of this multi-tool handle:
1. **Shared Input Force**: The single handle ($A, B$) drives all available tools.
2. **Selector Dial**: A single control knob (**Operation Select Code**) dictates which tool is aligned with the active work slot.
3. **Single Output Slot**: Only one tool touches the target screw at any given moment. All other tools are isolated, preventing collisions.

This multi-tool handle is the exact physical analogue of an **Arithmetic Logic Unit (ALU)**:
* Your hand applying force is the **Operand Bus ($A, B$)**.
* The individual fold-out tools are the **Parallel Execution Blocks** (Adder, Subtractor, AND, OR, XOR, Shifter).
* The selector knob position is the **ALU Operation Select Code ($OP$)**.
* The active work slot is the **Bus Multiplexing Logic ($Y$)**.

---

## Mechanics of Arithmetic Logic Unit Operation Multiplexing

To master ALU synthesis, we must dissect the formal mechanics of its two core primitives:
1. **The ALU Operation Select Code**: The $S$-bit control bus that specifies which mathematical or bitwise function the ALU core must execute on operands $A$ and $B$.
2. **Bus Multiplexing Logic**: The multi-channel output selection matrix that connects parallel sub-unit results to a single shared output bus $Y$ while isolating all inactive sub-units.

---

### Primitive 1: The ALU Operation Select Code ($OP$)

An **ALU Operation Select Code** (also called an **ALU Opcode** or **Control Function Code**) is an $S$-bit binary control vector emitted by a CPU's instruction decoder:

$$
\mathbf{OP} = (OP_{S-1}, OP_{S-2}, \dots, OP_1, OP_0)
$$

Where:
* $\mathbf{OP}$ is the $S$-bit binary operation selection vector.
* $OP_k$ represents the $k$-th individual control bit of the select code.
* $S$ is the number of control bits, determined by the total number of distinct functions $F$ required by the ALU:

$$
S = \lceil \log_2 F \rceil
$$

Where:
* $F$ is the total number of distinct arithmetic, logical, and shift operations supported by the ALU core.

```text
ALU OPERATION SELECT CODE CONTROL BUS

 Control Unit / Instruction Decoder
             │
             ▼
 Opcode Bus OP[S-1..0] (S Bits) ──► [ ALU Combinational Core ]
                                    (Decodes 1-of-F Operations)
```

#### Standard 8-Function ALU Opcode Map

Consider an ALU capable of executing $F = 8$ distinct operations. It requires an $S = \log_2(8) = 3$-bit operation select bus $\mathbf{OP} = (OP_2, OP_1, OP_0)$:

```text
8-OPERATION ALU CONTROL CODE MAP

 Opcode (OP2 OP1 OP0) │ Selected Function │ Mathematical / Bitwise Expression │ Functional Unit
─────────────────────┼───────────────────┼───────────────────────────────────┼───────────────────
         000         │ ADD (Addition)    │ Y = A + B                         │ Adder Core
         001         │ SUB (Subtraction) │ Y = A - B                         │ Subtractor Core
         010         │ AND (Bitwise AND) │ Y = A * B                         │ Logic Array
         011         │ OR  (Bitwise OR)  │ Y = A + B (Bitwise)               │ Logic Array
         100         │ XOR (Bitwise XOR) │ Y = A (+) B                       │ Logic Array
         101         │ NOT (Bitwise NOT) │ Y = A' (Invert A)                 │ Logic Array
         110         │ LSL (Shift Left)  │ Y = A << 1                        │ Shifter Module
         111         │ LSR (Shift Right) │ Y = A >> 1                        │ Shifter Module
```

Look at this opcode map carefully:
* Every 3-bit code from $000_2$ to $111_2$ represents an un-ambiguous command to the ALU hardware.
* When $\mathbf{OP} = 000_2$, the ALU acts as an Adder.
* When $\mathbf{OP} = 010_2$, the ALU acts as a bitwise AND gate array.
* When $\mathbf{OP} = 110_2$, the ALU acts as a left bit-shifter.

---

### Primitive 2: Bus Multiplexing Logic and Parallel Execution

How does the ALU hardware execute these operations without bus contention?

The defining physical characteristic of a combinational ALU is **Parallel Execution**:

> **The Parallel Execution Principle**: When input operand buses $\mathbf{A}$ and $\mathbf{B}$ arrive at the ALU inputs, **ALL internal sub-units (Adder, Subtractor, AND, OR, XOR, Shifter) calculate their results simultaneously in parallel**. 

The Adder computes $A + B$, the Subtractor computes $A - B$, the AND unit computes $A \cdot B$, and the XOR unit computes $A \oplus B$ **at the exact same nanosecond!**

```text
PARALLEL CALCULATION AND MULTIPLEXED SELECTION

                  Input Operands A[N-1..0], B[N-1..0]
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
 ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
 │ Adder Core    │         │ Logic Array   │         │ Shifter Unit  │
 │  (A + B)      │         │  (A * B)      │         │  (A << 1)     │
 └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
         │ Result 0                │ Result 1                │ Result 2
         ▼                         ▼                         ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │                    BUS MULTIPLEXING LOGIC                         │
 │                    (M-to-1 Multi-Bit MUX)                         │
 └─────────────────────────────────▲─────────────────────────────────┘
                                   │
 Opcode Bus OP[S-1..0] ────────────┘ (Routes 1 Chosen Result to Bus Y)
                                   │
                                   ▼
                       ALU Result Bus Y[N-1..0]
```

To select the single correct answer and isolate all unselected calculation results, the outputs of all functional sub-units feed into **Bus Multiplexing Logic**—a wide $M$-to-$1$ multi-bit multiplexer array controlled by the Operation Select Bus $\mathbf{OP}$.

The multiplexer connects the chosen functional unit's output vector to the main result bus $\mathbf{Y}$, while holding all unselected inputs isolated, preventing short circuits and eliminating bus contention.

---

## The Bit-Slice ALU Architecture

How do we physically lay out the logic gates for an $N$-bit ALU (such as an 8-bit, 32-bit, or 64-bit ALU) on a microchip without creating an unmanageable web of interconnected wires?

Computer architects use a modular technique called **Bit-Slice Architecture**.

Instead of designing an entire 32-bit ALU as one massive, monolithic block, we design a simple **1-Bit ALU Slice** ($\text{ALU}_i$). An $N$-bit ALU is constructed by duplicating this 1-bit ALU slice $N$ times side by side in a clean, parallel array!

```text
N-BIT BIT-SLICE ALU ARRAY STRUCTURE

 Slice 0 (Bit 0 LSB)      Slice 1 (Bit 1)          Slice N-1 (Bit N-1 MSB)
 ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
 │ 1-Bit ALU Slice 0 │    │ 1-Bit ALU Slice 1 │    │ 1-Bit ALU Slice N │
 │ (A0, B0 -> Y0)    │    │ (A1, B1 -> Y1)    │    │ (AN-1,BN-1->YN-1) │
 └─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
           │ Carry C1               │ Carry C2               │
           └────────────────────────┴───────── ... ──────────┘
             (Only Carry Signals Propagate Between Slices!)
```

Each 1-bit ALU slice $\text{ALU}_i$ receives:
* Single-bit operand $A_i$ (from bit position $i$ of bus $A$).
* Single-bit operand $B_i$ (from bit position $i$ of bus $B$).
* Incoming carry bit $C_i$ from the adjacent lower slice $\text{ALU}_{i-1}$.
* The shared $S$-bit global Operation Select Bus $\mathbf{OP}$.

It emits:
* Single-bit result $Y_i$ (to bit position $i$ of output bus $Y$).
* Outgoing carry bit $C_{i+1}$ to the adjacent higher slice $\text{ALU}_{i+1}$.

---

### Internal Gate Synthesis of a 1-Bit ALU Slice

Let us look inside a single 1-bit ALU slice $\text{ALU}_i$ capable of four primary operations:
1. Bitwise AND ($A_i \cdot B_i$)
2. Bitwise OR ($A_i + B_i$)
3. Binary Addition ($A_i + B_i + C_i$)
4. Binary Subtraction ($A_i - B_i = A_i + \overline{B_i} + C_i$)

```text
DETAILED 1-BIT ALU SLICE INTERNAL GATE SCHEMATIC

 Operands A_i, B_i
 A_i ───────┬────────────┬─────────────┬──────────────┐
            │            │             │              │
 B_i ───┐   │            │             │              │
        ▼   │            │             │              │
  [ XOR Mode ]           │             │              │
  (B_i (+) OP0)          │             │              │
        │ B_mod          │             │              │
        ├────────────────┼─────────────┼────┐         │
        │                ▼             ▼    │         │
        │           ┌─────────┐   ┌───────┐ │    ┌────┴────┐
        │           │ Full    │   │  AND  │ │    │   OR    │
        │           │ Adder   │   └───┬───┘ │    └────┬────┘
        │           └────┬────┘       │     │         │
        │                │            │     │         │
        ▼                ▼            ▼     ▼         ▼
  Carry C_i+1        Sum Result   AND Result    OR Result
                         │            │               │
                         └────────────┼───────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │ 4-to-1 Output Multiplexer │ ◄── Opcode (OP1, OP0)
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                             Slice Output Y_i
```

#### Step-by-Step Operation Walkthrough inside the 1-Bit Slice:

1. **Controlled Inverter Front-End ($B_i \oplus OP_0$)**:
   Operand bit $B_i$ passes through a 2-input XOR gate driven by Opcode bit $OP_0$.
   * When $OP_0 = 0$: $B_{\text{mod}} = B_i \oplus 0 = B_i$ (Pass-through for Addition, AND, OR).
   * When $OP_0 = 1$: $B_{\text{mod}} = B_i \oplus 1 = \overline{B_i}$ (Bitwise inverted for Subtraction!).
2. **Parallel Sub-Unit Generation**:
   * **AND Gate**: Computes $R_{\text{and}} = A_i \cdot B_i$.
   * **OR Gate**: Computes $R_{\text{or}} = A_i + B_i$.
   * **Full Adder Core**: Receives $A_i$, modified $B_{\text{mod}}$, and incoming carry $C_i$, computing $R_{\text{add}} = A_i \oplus B_{\text{mod}} \oplus C_i$.
3. **4-to-1 Output Multiplexer Selection**:
   A 4:1 Multiplexer controlled by Opcode bits $(OP_1, OP_0)$ selects which sub-unit result reaches slice output $Y_i$:
   * $OP_1 OP_0 = 00_2 \implies$ Selects $R_{\text{add}}$ with $C_0 = 0 \to Y_i = A_i + B_i$ (**ADD**).
   * $OP_1 OP_0 = 01_2 \implies$ Selects $R_{\text{add}}$ with $C_0 = 1 \to Y_i = A_i + \overline{B_i} + 1$ (**SUB**).
   * $OP_1 OP_0 = 10_2 \implies$ Selects $R_{\text{and}} \to Y_i = A_i \cdot B_i$ (**AND**).
   * $OP_1 OP_0 = 11_2 \implies$ Selects $R_{\text{or}} \to Y_i = A_i + B_i$ (**OR**).

Look at how modular and compact this 1-bit ALU slice is! By duplicating this slice $N$ times, we build an $N$-bit ALU using identical, repeating silicon blocks.

---

## Engineering Reality: Dynamic Power Dissipation and Operand Gating

While parallel execution within a combinational ALU gives us $O(1)$ constant-time operation selection, it introduces a major physical liability in modern semiconductor design: **Dynamic Power Consumption**.

### The Energy Cost of Unselected Calculations

Recall that in CMOS silicon technology, logic gates consume electrical energy primarily when their internal transistors switch states ($0 \to 1$ or $1 \to 0$):

$$
P_{\text{dynamic}} = \alpha \cdot C_{\text{total}} \cdot V_{DD}^2 \cdot f_{\text{clk}}
$$

Where:
* $P_{\text{dynamic}}$ is the dynamic switching power consumed by the ALU.
* $\alpha$ is the activity factor (percentage of gates toggling).
* $C_{\text{total}}$ is the total internal gate capacitance of all sub-units.
* $V_{DD}$ is the supply voltage.
* $f_{\text{clk}}$ is the clock frequency.

Because all sub-units (Adder, Subtractor, Logic Array, Shifter) calculate their results in parallel every time new operands $A$ and $B$ arrive, **all sub-units toggle their internal transistors and consume power**, even though the output multiplexer will throw away 80% of those calculated results!

If the CPU is executing a simple bitwise AND instruction, running the 32-bit Carry Lookahead Adder in parallel wastes significant battery energy.

```text
DYNAMIC POWER WASTAGE IN PARALLEL EXECUTION

 CPU Opcode = 010_2 (Bitwise AND Requested!)
 ┌───────────────────────────────────────────────────────────┐
 │ Adder Unit calculates A + B ──► CONSUMES POWER! (Thrown Away!) │
 │ Shifter Unit calculates A<<1 ─► CONSUMES POWER! (Thrown Away!) │
 │ Logic Unit calculates A * B  ──► CONSUMES POWER! (ROUTED TO Y) │
 └───────────────────────────────────────────────────────────┘
   80% of internal transistor switching energy is WASTED!
```

### The Modern Solution: Operand Isolation (Operand Gating)

To eliminate this energy waste in battery-powered processors (such as ARM or mobile RISC-V chips), hardware engineers add **Operand Isolation Gates** (AND gates or transmission gates) at the inputs of each execution sub-unit.

```text
OPERAND ISOLATION (OPERAND GATING) ARCHITECTURE

 Operands A, B ───┬──► [ Isolation Gate 1 ] ──► [ Adder Core ]
                  │    (Blocked if OP != ADD/SUB)
                  │
                  ├──► [ Isolation Gate 2 ] ──► [ Shifter Unit ]
                  │    (Blocked if OP != SHIFT)
                  │
                  └──► [ Isolation Gate 3 ] ──► [ Logic Array ]
                       (Enabled for Logic Ops)
```

How does Operand Isolation work?
* The instruction decoder evaluates Opcode bus $\mathbf{OP}$.
* If $\mathbf{OP}$ selects a logic operation (AND/OR/XOR), the isolation gates blocking the inputs to the Adder and Shifter are held at $0$.
* The internal transistors inside the Adder and Shifter stay frozen at $0\text{ V}$, consuming **zero dynamic power**!
* Only the selected sub-unit toggles its gates.

Operand isolation reduces ALU power consumption by **$50\%$ to $70\%$** in mobile processor architectures!

---

## Solved Industrial Engineering Exercise: 4-Bit Multi-Function ALU Core Synthesis

To consolidate your complete mastery of ALU Operation Select Codes, Bus Multiplexing Logic, Bit-Slice architectures, and parallel sub-unit execution, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit firm is designing a 4-bit multi-function Arithmetic Logic Unit ($\text{ALU}_4$) for an embedded microcontroller's processing core.

The ALU processes two 4-bit unsigned binary input operands:

$$
\mathbf{A} = (A_3, A_2, A_1, A_0) \quad \text{and} \quad \mathbf{B} = (B_3, B_2, B_1, B_0)
$$

The operation is specified by a 3-bit **Operation Select Bus** $\mathbf{OP} = (OP_2, OP_1, OP_0)$.

```text
4-BIT MULTI-FUNCTION ALU CORE BLOCK

 Operand A[3:0] ─────────┐
 Operand B[3:0] ─────────┼──► [ 4-Bit Multi-Function ALU ] ──► Result Y[3:0]
 Opcode Bus OP[2:0] ─────┘
```

The system must output a 4-bit result vector $\mathbf{Y} = (Y_3, Y_2, Y_1, Y_0)$ according to the following 8-function opcode specification:

```text
ALU OPCODE SPECIFICATION TABLE

 Opcode (OP2 OP1 OP0) │ Selected Function │ Mathematical Expression
─────────────────────┼───────────────────┼─────────────────────────
         000         │ ADD (Addition)    │ Y = A + B
         001         │ SUB (Subtraction) │ Y = A - B (A + B' + 1)
         010         │ AND (Bitwise AND) │ Y = A * B
         011         │ OR  (Bitwise OR)  │ Y = A + B (Bitwise)
         100         │ XOR (Bitwise XOR) │ Y = A (+) B
         101         │ NOT (Bitwise NOT) │ Y = A'
         110         │ LSL (Shift Left)  │ Y = A << 1 (Shift A left 1)
         111         │ PASS-B (Pass B)   │ Y = B (Pass B unchanged)
```

#### Physical Gate Delays:
* 2-Input XOR Gate Delay: $t_{\text{xor}} = 0.8\text{ ns}$
* 2-Input AND/OR Gate Delay: $t_{\text{gate}} = 0.5\text{ ns}$
* Full Adder Carry Delay: $t_{\text{carry}} = 0.6\text{ ns}$
* 8-to-1 Multiplexer Delay: $t_{\text{mux8}} = 1.0\text{ ns}$

#### Your Objective

1. Design the 1-bit ALU slice architecture for bit position $i$.
2. Write the complete Boolean equations for all 8 sub-unit inputs feeding into the 8:1 output multiplexer for bit slice $i$.
3. Calculate the total worst-case propagation delay $T_{\text{ALU}}$ from operand arrival to valid output $\mathbf{Y}$.
4. Simulate the 4-bit ALU core on operands $\mathbf{A} = 1011_2$ ($13_{10}$) and $\mathbf{B} = 0101_2$ ($5_{10}$) across three distinct opcodes:
   * Case 1: $\mathbf{OP} = 001_2$ (SUB: $A - B$)
   * Case 2: $\mathbf{OP} = 100_2$ (XOR: $A \oplus B$)
   * Case 3: $\mathbf{OP} = 110_2$ (LSL: $A \ll 1$)
5. Verify all mathematical results against decimal arithmetic.

---

### Step-by-Step Derivation

#### Step 1: Design the 1-Bit ALU Slice Sub-Unit Expressions

For each bit position $i \in \{0, 1, 2, 3\}$, we evaluate the 8 inputs feeding into an 8-to-1 output multiplexer ($\text{MUX}_i$):

##### Input Channel 0 ($000_2$ - ADD):
Requires $R_{\text{add}, i}$, the sum output of a Full Adder cell receiving $A_i$, $B_i$, and $C_i$:

$$
M_{0, i} = A_i \oplus B_i \oplus C_i
$$

##### Input Channel 1 ($001_2$ - SUB):
Requires $R_{\text{sub}, i}$, the sum output of the Full Adder cell receiving $A_i$, inverted $\overline{B_i}$, and $C_i$ (where initial $C_0 = 1$ when $OP_0 = 1$):

$$
M_{1, i} = A_i \oplus \overline{B_i} \oplus C_i
$$

By using a controlled inverter $Z_i = B_i \oplus OP_0$ and setting $C_0 = OP_0$, Channel 0 and Channel 1 are unified into a **single Adder/Subtractor input channel** on the MUX!

##### Input Channel 2 ($010_2$ - AND):
$$M_{2, i} = A_i \cdot B_i$$

##### Input Channel 3 ($011_2$ - OR):
$$M_{3, i} = A_i + B_i$$

##### Input Channel 4 ($100_2$ - XOR):
$$M_{4, i} = A_i \oplus B_i$$

##### Input Channel 5 ($101_2$ - NOT):
$$M_{5, i} = \overline{A_i}$$

##### Input Channel 6 ($110_2$ - LSL):
Shifting vector $A$ left by 1 bit means bit position $i$ receives the value of bit $i-1$:
$$M_{6, i} = A_{i-1} \quad \text{for } i > 0, \quad \text{and } M_{6, 0} = 0 \text{ (LSB padded with 0)}$$

##### Input Channel 7 ($111_2$ - PASS-B):
$$M_{7, i} = B_i$$

```text
1-BIT ALU SLICE MUX INPUT MAPPING

 MUX Channel  │ Sub-Unit Input Signal │ Function Executed
──────────────┼───────────────────────┼────────────────────
  Channel 0   │ R_add,i (A + B + C)   │ ADD Operation
  Channel 1   │ R_sub,i (A + B' + C)  │ SUB Operation
  Channel 2   │ A_i * B_i             │ Bitwise AND
  Channel 3   │ A_i + B_i             │ Bitwise OR
  Channel 4   │ A_i (+) B_i           │ Bitwise XOR
  Channel 5   │ A_i'                  │ Bitwise NOT A
  Channel 6   │ A_i-1                 │ Logical Shift Left (LSL)
  Channel 7   │ B_i                   │ Pass B Unchanged
```

---

#### Step 2: Calculate Worst-Case ALU Propagation Delay ($T_{\text{ALU}}$)

Let us trace the longest delay path through the 4-bit ALU:

1. **Controlled Inverter Front-End**:
   $Z_i = B_i \oplus OP_0 \implies t_{\text{xor}} = 0.8\text{ ns}$.
2. **4-Bit Ripple Carry Chain in Adder Sub-Unit**:
   Carries ripple through 4 Full Adder stages ($\text{FA}_0 \to \text{FA}_1 \to \text{FA}_2 \to \text{FA}_3$).
   $$t_{\text{ripple}} = 4 \cdot t_{\text{carry}} = 4 \cdot 0.6\text{ ns} = 2.4\text{ ns}$$
3. **Full Adder Sum Generation**:
   Final sum bit $S_3$ computes in $t_{\text{xor}} = 0.8\text{ ns}$.
4. **8-to-1 Output Multiplexer Array**:
   Passes selected channel to result bus $Y \implies t_{\text{mux8}} = 1.0\text{ ns}$.

```text
CRITICAL PATH DELAY CHRONOLOGY

 t = 0.0 ns ──► Operands A, B and Opcode OP arrive
 t = 0.8 ns ──► Controlled Inverters Z_i complete (t_xor)
 t = 3.2 ns ──► Ripple Carry Chain completes through 4 stages (4 * t_carry)
 t = 4.0 ns ──► Final Adder Sum bit S3 computes (t_xor)
 t = 5.0 ns ──► 8:1 Output MUX passes result to Bus Y (t_mux8)
```

Total Worst-Case ALU Execution Delay:

$$
T_{\text{ALU}} = t_{\text{xor}} + (4 \cdot t_{\text{carry}}) + t_{\text{xor}} + t_{\text{mux8}}
$$

$$
T_{\text{ALU}} = 0.8\text{ ns} + 2.4\text{ ns} + 0.8\text{ ns} + 1.0\text{ ns} = \mathbf{5.0 \text{ ns}}
$$

The 4-bit multi-function ALU completes any arithmetic, logic, or shift operation in **$5.0\text{ nanoseconds}$**!

---

#### Step 3: Simulation 1 — Subtraction Mode ($\mathbf{OP} = 001_2$)

Operands:
* $\mathbf{A} = 1011_2$ ($A_3=1, A_2=0, A_1=1, A_0=1$; decimal $13_{10}$).
* $\mathbf{B} = 0101_2$ ($B_3=0, B_2=1, B_1=0, B_0=1$; decimal $5_{10}$).
* Opcode $\mathbf{OP} = 001_2$ (SUB: $A - B$).

##### 1. Front-End Controlled Inverter ($Z_i = B_i \oplus OP_0$ with $OP_0 = 1$):
$$\mathbf{Z} = \overline{\mathbf{B}} = \overline{0101_2} = 1010_2$$

##### 2. Initial Carry-In ($C_0 = OP_0 = 1$):
$$C_0 = 1$$

##### 3. Adder Sub-Unit Calculation ($A + \overline{B} + 1$):
* **Bit 0**: $A_0=1, Z_0=0, C_0=1 \implies S_0 = 1 \oplus 0 \oplus 1 = 0$, $C_1 = 1$.
* **Bit 1**: $A_1=1, Z_1=1, C_1=1 \implies S_1 = 1 \oplus 1 \oplus 1 = 1$, $C_2 = 1$.
* **Bit 2**: $A_2=0, Z_2=0, C_2=1 \implies S_2 = 0 \oplus 0 \oplus 1 = 1$, $C_3 = 0$.
* **Bit 3**: $A_3=1, Z_3=1, C_3=0 \implies S_3 = 1 \oplus 1 \oplus 0 = 0$, $C_4 = 1$.

Adder Sub-Unit Vector: $\mathbf{R}_{\text{sub}} = 0110_2$.

##### 4. 8:1 Multiplexer Output Selection ($\mathbf{OP} = 001_2 \to \text{Selects Channel 1}$):
The MUX array selects Channel 1 ($\mathbf{R}_{\text{sub}}$):

$$
\mathbf{Y} = 0110_2 \quad (\text{Decimal } 6_{10})
$$

##### Decimal Verification:
$$13_{10} - 5_{10} = 6_{10} \quad \iff \quad 1011_2 - 0101_2 = 0110_2$$
**SUBTRACTION SUCCESSFUL!**

---

#### Step 4: Simulation 2 — Bitwise XOR Mode ($\mathbf{OP} = 100_2$)

Operands:
* $\mathbf{A} = 1011_2$
* $\mathbf{B} = 0101_2$
* Opcode $\mathbf{OP} = 100_2$ (XOR: $A \oplus B$).

##### 1. Parallel Sub-Unit Calculation:
The bitwise XOR unit evaluates $Y_i = A_i \oplus B_i$ in parallel across all 4 bits:
* Bit 0: $Y_0 = A_0 \oplus B_0 = 1 \oplus 1 = 0$
* Bit 1: $Y_1 = A_1 \oplus B_1 = 1 \oplus 0 = 1$
* Bit 2: $Y_2 = A_2 \oplus B_2 = 0 \oplus 1 = 1$
* Bit 3: $Y_3 = A_3 \oplus B_3 = 1 \oplus 0 = 1$

Bitwise XOR Vector: $\mathbf{R}_{\text{xor}} = 1110_2$.

##### 2. 8:1 Multiplexer Output Selection ($\mathbf{OP} = 100_2 \to \text{Selects Channel 4}$):
The MUX array selects Channel 4 ($\mathbf{R}_{\text{xor}}$):

$$
\mathbf{Y} = 1110_2 \quad (\text{Decimal } 14_{10})
$$

##### Decimal Verification:
$$1011_2 \oplus 0101_2 = 1110_2$$
**BITWISE XOR SUCCESSFUL!**

---

#### Step 5: Simulation 3 — Logical Shift Left Mode ($\mathbf{OP} = 110_2$)

Operands:
* $\mathbf{A} = 1011_2$ ($A_3=1, A_2=0, A_1=1, A_0=1$)
* Opcode $\mathbf{OP} = 110_2$ (LSL: $A \ll 1$).

##### 1. Parallel Sub-Unit Calculation:
The Shifter unit routes bit $A_{i-1}$ to position $i$, padding $Y_0 = 0$:
* Bit 0: $Y_0 = 0$ (LSB padded with 0)
* Bit 1: $Y_1 = A_0 = 1$
* Bit 2: $Y_2 = A_1 = 1$
* Bit 3: $Y_3 = A_2 = 0$

Shifter Vector: $\mathbf{R}_{\text{lsl}} = 0110_2$.

##### 2. 8:1 Multiplexer Output Selection ($\mathbf{OP} = 110_2 \to \text{Selects Channel 6}$):
The MUX array selects Channel 6 ($\mathbf{R}_{\text{lsl}}$):

$$
\mathbf{Y} = 0110_2 \quad (\text{Decimal } 6_{10})
$$

##### Decimal Verification:
Unsigned $1011_2 = 11_{10}$. Shifting left by 1 bit multiplies by 2:
$$11 \times 2 = 22_{10} = 10110_2$$
Truncated to 4 bits (discarding MSB overflow bit 1) $\implies 0110_2 = 6_{10}$.
$$22 \pmod{16} = 6_{10}$$
**LOGICAL SHIFT LEFT SUCCESSFUL!**

All three simulation scenarios pass with 100% mathematical and logical precision. The 4-bit multi-function ALU core is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **ALU Operation Select Code**: The $S$-bit control bus vector $\mathbf{OP} = (OP_{S-1}, \dots, OP_0)$ emitted by an instruction decoder that specifies which arithmetic, logic, or shift operation the combinational execution core must execute on input operands $A$ and $B$.
* **Bus Multiplexing Logic**: The multi-channel output selection matrix (M:1 MUX array) that connects the parallel outputs of all execution sub-units (Adder/Subtractor, AND, OR, XOR, Shifter) to a single shared result bus $Y$, routing the selected result while isolating inactive sub-units to prevent bus contention.
