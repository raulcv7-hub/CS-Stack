---
title: "01. Binary Decoder Architecture"
---

﻿# Binary Decoder Architecture and Active-Low Enable Logic

## The Memory Selection Dilemma and the Need for One-Hot Expansion

In computer engineering, binary numbers are an extraordinarily compact way to store and transmit information. By using just 3 physical wires, a digital system can represent $2^3 = 8$ distinct numeric values ($000_2$ to $111_2$). By using 10 physical wires, a system can represent $2^{10} = 1,024$ unique values. By using 32 wires, it can represent over 4 billion values. This exponential compression is why microprocessors use binary numbers to store addresses and instructions.

However, when a central processor needs to interact with the physical world—such as turning on a specific LED on an instrument panel, selecting a single memory chip out of eight on a motherboard, or triggering a specific register to store data—that compact binary code creates a severe hardware dilemma.

A physical memory chip or peripheral device cannot read a 3-bit binary code directly on a single shared wire. A memory chip requires a dedicated **Enable Wire** (a "Chip Select" pin) that must be driven to a distinct voltage level to turn that specific chip ON while keeping all other memory chips turned OFF.

```text
THE BINARY ADDRESS DECODING DILEMMA

 Compressed Address (3 Wires)          Memory Array (8 Chips)
 ┌───────────┐                         ┌───────────────┐
 │ Address 0 ├─┐                       │ Memory Chip 0 ├─ (Select Wire 0?)
 │ Address 1 ├─┼─► [ UNRESOLVED ] ───► │ Memory Chip 1 ├─ (Select Wire 1?)
 │ Address 2 ├─┘    How to turn ON     │      ...      │
 └───────────┘      ONLY Chip 5?       │ Memory Chip 7 ├─ (Select Wire 7?)
   Compact Binary                      └───────────────┘
   (3 Bits = 8 States)                 8 Separate Physical Enable Lines
```

If you try to connect 3 binary address wires directly to 8 memory chips without an intermediary, every chip receives an ambiguous pattern of $0$s and $1$s. Multiple chips will attempt to respond at the same time, crashing the memory bus and causing data corruption.

What we need is a digital translator: a purely combinational circuit that takes an $N$-bit binary address input, evaluates its numerical value, and activates **exactly one** exclusive line out of $2^N$ separate output wires while holding all other $2^N - 1$ output wires completely inactive. This exclusive 1-out-of-$2^N$ output format is known as **One-Hot Encoding**.

The circuit that performs this critical expansion is the **Binary Decoder**. Furthermore, to safely master multi-chip expansion and prevent accidental activations during power-up, modern decoders incorporate a specialized control line known as an **Active-Low Enable**. Without the binary decoder and active-low enable logic, modern computer memory systems and microprocessor buses could not function.

---

## The Hotel Keycard Reader: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a binary decoder and its enable control, let us leave microchips behind for a moment and picture a modern hotel keycard system.

Imagine a hotel with 4 guest rooms on a floor: Room 0, Room 1, Room 2, and Room 3. Each room door has an electronic door lock connected to an indicator light on the front desk.

```text
THE HOTEL ROOM DECODER ANALOGY

 Keycard Reader (2-Bit Code)              Floor 1 Guest Rooms
 ┌───────────────────────────┐             ┌───────────────┐
 │ Room Number: 10 (Room 2)  ├───────────► │ Door Lock 0   │ (OFF)
 └─────────────┬─────────────┘             ├───────────────┤
               │                           │ Door Lock 1   │ (OFF)
               ▼                           ├───────────────┤
    [ Front Desk Decoder ] ──────────────► │ Door Lock 2   │ (UNLOCKED!)
               ▲                           ├───────────────┤
               │                           │ Door Lock 3   │ (OFF)
    [ Floor Master Switch ]                └───────────────┘
```

When a guest approaches the front desk and inserts a keycard encoded with the 2-bit binary number $10_2$ (decimal 2):
1. The front desk keycard reader reads the 2-bit code $10_2$.
2. The internal decoder circuit processes the code $10_2$.
3. The decoder illuminates the unlock light for **Room 2 ONLY**. The lights for Room 0, Room 1, and Room 3 remain completely dark ($0$).

Only one door unlocks. The other three doors remain locked tight. This 1-out-of-4 exclusive activation is the exact physical behavior of a **Binary Decoder**.

Now, imagine the hotel manager needs to perform emergency maintenance on the building's electrical wiring. The manager installs a **Floor Master Switch** at the front desk.
* When the Master Switch is set to **NORMAL (Active)**, the keycard reader works as usual: entering $10_2$ unlocks Room 2.
* When the Master Switch is set to **SHUTDOWN (Disabled)**, the decoder is turned OFF instantly. Regardless of what keycard is inserted into the reader—whether $00_2$, $01_2$, $10_2$, or $11_2$—**ALL door lock lights are forced to 0 (LOCKED)**.

This Floor Master Switch is the exact analogue of an **Enable Line ($\overline{\text{EN}}$)** in a digital decoder. It gives us a master safety valve that can disable all output channels instantly, regardless of what binary address is currently sitting on the input wires.

---

## Mechanics of Binary Decoder Synthesis and Active-Low Enable Logic

To master binary decoder design, we must dissect the formal mechanics of its two core primitives:
1. **The Binary Decoder**: How an $N$-bit binary input code is expanded into $2^N$ unique One-Hot output lines using minterm AND gates.
2. **The Active-Low Enable Line ($\overline{\text{EN}}$)**: How a control signal driven to $0\text{ V}$ (Logic Low) authorizes the decoder to operate, and when driven to $1$ forces all output channels into an inactive state.

---

### Primitive 1: The Binary Decoder Architecture

A **Binary Decoder** is a combinational logic circuit that converts an $N$-bit binary input code into $M = 2^N$ unique output lines. 

Mathematically, an $N$-to-$2^N$ decoder evaluates the $2^N$ fundamental minterms of the $N$ input variables. For any given input code, exactly one minterm evaluates to $1$, while all other $2^N - 1$ minterms evaluate to $0$.

```text
THE N-TO-2^N DECODER FUNCTIONAL BLOCK

 Input Address Bus (N Bits) ───► [ N-to-2^N Decoder ] ───► Output Channels (2^N Lines)
                                                           (Exactly 1 Line Active!)
```

#### 1. The 2-to-4 Binary Decoder (2:4 Decoder)

Let us construct a 2-to-4 Binary Decoder from first principles. It receives a 2-bit binary address bus $A = (A_1, A_0)$ where $A_1$ is the Most Significant Bit (MSB) and $A_0$ is the Least Significant Bit (LSB). It drives four independent output lines ($Y_0, Y_1, Y_2, Y_3$).

```text
2-TO-4 DECODER FUNCTIONAL BLOCK

 Address Line A1 (MSB) ───┐ 
                          ├───► [ 2:4 Decoder ] ───┬───► Output Y0 (Active when A = 00)
 Address Line A0 (LSB) ───┘                        ├───► Output Y1 (Active when A = 01)
                                                   ├───► Output Y2 (Active when A = 10)
                                                   └───► Output Y3 (Active when A = 11)
```

#### 2. Truth Table Derivation for Active-High Outputs
Let us build the exhaustive truth table for a 2-to-4 Active-High Decoder. An **Active-High** output line drives a $1$ when selected, and $0$ when unselected.

```text
2-TO-4 ACTIVE-HIGH DECODER TRUTH TABLE

 Address A1 │ Address A0 │ Output Y0 │ Output Y1 │ Output Y2 │ Output Y3 │ Selected Decimal
────────────┼────────────┼───────────┼───────────┼───────────┼───────────┼──────────────────
     0      │     0      │     1     │     0     │     0     │     0     │   Channel 0 (00)
     0      │     1      │     0     │     1     │     0     │     0     │   Channel 1 (01)
     1      │     0      │     0     │     0     │     1     │     0     │   Channel 2 (10)
     1      │     1      │     0     │     0     │     0     │     1     │   Channel 3 (11)
```

Look at the output columns $Y_0, Y_1, Y_2, Y_3$:
* For Row 0 ($A_1 A_0 = 00_2$), $Y_0 = 1$, while $Y_1 = Y_2 = Y_3 = 0$.
* For Row 1 ($A_1 A_0 = 01_2$), $Y_1 = 1$, while $Y_0 = Y_2 = Y_3 = 0$.
* For Row 2 ($A_1 A_0 = 10_2$), $Y_2 = 1$, while $Y_0 = Y_1 = Y_3 = 0$.
* For Row 3 ($A_1 A_0 = 11_2$), $Y_3 = 1$, while $Y_0 = Y_1 = Y_2 = 0$.

Notice that in every single row, **exactly one output is 1, and three outputs are 0**. This is the definition of **One-Hot Encoding**.

#### 3. Boolean Equations for Active-High Outputs
By examining the active row for each output line, we extract the Boolean equations:

$$
Y_0 = \overline{A_1} \cdot \overline{A_0} = m_0(A)
$$

$$
Y_1 = \overline{A_1} \cdot A_0 = m_1(A)
$$

$$
Y_2 = A_1 \cdot \overline{A_0} = m_2(A)
$$

$$
Y_3 = A_1 \cdot A_0 = m_3(A)
$$

Where:
* $Y_0, Y_1, Y_2, Y_3$ are the four decoded output channel signals.
* $A_1, A_0$ are the MSB and LSB of the binary address bus.
* $\overline{A_1}, \overline{A_0}$ are the inverted address signal lines.
* $m_k(A)$ is the $k$-th minterm of the input address variables.

Every output channel $Y_k$ of an Active-High decoder is simply an AND gate that calculates minterm $m_k$ of the input address!

```text
2-TO-4 ACTIVE-HIGH DECODER GATE SCHEMATIC

A1 ──┬──►[ NOT 1 ]──► A1' ──┐
A0 ──┼──►[ NOT 0 ]──► A0' ──┼──┐
     │                      │  │
     ├── A1' · A0' ─────────┼──┼──► [ AND 0 ] ──► Y0 = A1'· A0'
     ├── A1' · A0  ─────────┼──┼──► [ AND 1 ] ──► Y1 = A1'· A0
     ├── A1  · A0' ─────────┼──┼──► [ AND 2 ] ──► Y2 = A1 · A0'
     └── A1  · A0  ─────────┴──┴──► [ AND 3 ] ──► Y3 = A1 · A0
```

---

### Primitive 2: Active-Low Enable Logic ($\overline{\text{EN}}$) and Active-Low Outputs ($\overline{Y_k}$)

In introductory theory, decoders are drawn with Active-High outputs ($1$ when selected). In real-world physical electronics and commercial integrated circuits (such as the industry-standard 74LVC138 3-to-8 decoder), decoders are almost universally built with **Active-Low Outputs** ($\overline{Y_k}$) and **Active-Low Enable Lines** ($\overline{\text{EN}}$).

Why? Because in CMOS microchip fabrication, physical memory chips (SRAM, DRAM, Flash) and peripheral controllers use active-low **Chip Select** pins ($\overline{\text{CS}}$ or $\overline{\text{CE}}$). An active-low pin turns the memory chip ON when it receives $0\text{ V}$ (Logic Low), and turns it OFF when it receives $V_{DD}$ (Logic High).

```text
ACTIVE-HIGH VERSUS ACTIVE-LOW DECODER COMPARISON

 Feature                │ Active-High Decoder (Yk)     │ Active-Low Decoder (Yk')
────────────────────────┼──────────────────────────────┼──────────────────────────────
 Selected Channel State │ Logic High (1 / VDD)         │ Logic Low (0 / 0V)
 Unselected Channel     │ Logic Low  (0 / 0V)          │ Logic High (1 / VDD)
 Output Gate Type       │ AND Gates                    │ NAND Gates
 Memory CS Compatibility│ Requires Extra Inverters     │ Direct Connection (Native!)
```

#### 1. The Active-Low Enable Control Input ($\overline{\text{EN}}$)

An **Active-Low Enable** input ($\overline{\text{EN}}$ or $\overline{E}$) is a master control line that governs whether the decoder is allowed to operate:
* When $\overline{\text{EN}} = 0$ (Ground / Active): The decoder is **ENABLED**. It decodes input address $A$ and activates the selected channel.
* When $\overline{\text{EN}} = 1$ (High Voltage / Inactive): The decoder is **DISABLED**. It ignores input address $A$ entirely and forces **ALL output channels to their inactive state**.

```text
THE ACTIVE-LOW ENABLE CONTROL MECHANISM

 Enable Pin (EN') = 0 (LOW)  ──► DECODER ENABLED  ──► Selected Channel = ACTIVE
 Enable Pin (EN') = 1 (HIGH) ──► DECODER DISABLED ──► ALL Channels = INACTIVE
```

#### 2. Truth Table of a 2-to-4 Active-Low Decoder with Active-Low Enable

Let us examine the complete, realistic truth table for a 2-to-4 decoder featuring an Active-Low Enable line ($\overline{\text{EN}}$) and Active-Low Outputs ($\overline{Y_0}, \overline{Y_1}, \overline{Y_2}, \overline{Y_3}$):

```text
2-TO-4 ACTIVE-LOW DECODER TRUTH TABLE WITH ACTIVE-LOW ENABLE

 Enable (EN') │ Address A1 │ Address A0 │ Output Y0' │ Output Y1' │ Output Y2' │ Output Y3' │ System Status
──────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼───────────────────────────────
      1       │     X      │     X      │     1      │     1      │     1      │     1      │ DISABLED! All outputs OFF (1).
      0       │     0      │     0      │     0      │     1      │     1      │     1      │ ENABLED! Channel 0 Active (0).
      0       │     0      │     1      │     1      │     0      │     1      │     1      │ ENABLED! Channel 1 Active (0).
      0       │     1      │     0      │     1      │     1      │     0      │     1      │ ENABLED! Channel 2 Active (0).
      0       │     1      │     1      │     1      │     1      │     1      │     0      │ ENABLED! Channel 3 Active (0).
```

Study Row 0 of this table carefully:
* When $\overline{\text{EN}} = 1$, inputs $A_1$ and $A_0$ are Don't Cares ($X$). Outputs $\overline{Y_0}, \overline{Y_1}, \overline{Y_2}, \overline{Y_3}$ are all forced to $1$ (inactive).
* When $\overline{\text{EN}} = 0$, the decoder turns ON. For address $10_2$ (Row 3), output $\overline{Y_2}$ drops to $0$ (active), while $\overline{Y_0}, \overline{Y_1}, \overline{Y_3}$ remain at $1$ (inactive).

#### 3. Boolean Equations for Active-Low Outputs with Active-Low Enable

To synthesize an Active-Low Decoder using NAND gates:

$$
\overline{Y_0} = \overline{\overline{\text{EN}} \cdot \overline{A_1} \cdot \overline{A_0}}
$$

$$
\overline{Y_1} = \overline{\overline{\text{EN}} \cdot \overline{A_1} \cdot A_0}
$$

$$
\overline{Y_2} = \overline{\overline{\text{EN}} \cdot A_1 \cdot \overline{A_0}}
$$

$$
\overline{Y_3} = \overline{\overline{\text{EN}} \cdot A_1 \cdot A_0}
$$

Where:
* $\overline{Y_k}$ is the $k$-th active-low output channel.
* $\overline{\text{EN}}$ is the active-low enable input signal.
* $A_1, A_0$ are the MSB and LSB of the address bus.
* The overarching bar represents the NAND inversion.

Notice that every active-low output channel is synthesized using a single **NAND gate**! Because CMOS silicon natively constructs NAND gates using only 4 transistors, active-low decoders are smaller, faster, and cheaper than active-high decoders.

```text
ACTIVE-LOW DECODER SCHEMATIC WITH NAND GATES

EN' ──┬───────────────────────────────────┐
A1  ──┼──►[ NOT 1 ]──► A1'                │
A0  ──┼──►[ NOT 0 ]──► A0'                │
      │                 ▼                 ▼
      ├───── EN' · A1' · A0' ────────►[ NAND 0 ]──► Output Y0'
      ├───── EN' · A1' · A0  ────────►[ NAND 1 ]──► Output Y1'
      ├───── EN' · A1  · A0' ────────►[ NAND 2 ]──► Output Y2'
      └───── EN' · A1  · A0  ────────►[ NAND 3 ]──► Output Y3'
```

---

## Hierarchical Decoder Expansion: Building Large Decoders from Small Decoders

What if a computer motherboard requires a 4-to-16 Binary Decoder (4:16 Decoder) to select among 16 memory blocks, but your component library only contains 3-to-8 Decoder (3:8 Decoder) chips?

We can expand small decoders into arbitrarily large address decoders using **Hierarchical Decoder Trees**.

### Building a 4-to-16 Decoder Using Two 3-to-8 Decoders

A 4-to-16 Decoder has a 4-bit address bus $A = (A_3, A_2, A_1, A_0)$ and 16 active-low output channels ($\overline{Y_0}$ through $\overline{Y_{15}}$).

To build a 4-to-16 decoder using two 3-to-8 decoders:
1. **Address Bus Splitting**:
   * Connect the lower 3 address bits $(A_2, A_1, A_0)$ to the address inputs of **BOTH** 3-to-8 decoders in parallel.
   * Use the MSB address bit $A_3$ to drive the **Enable lines** ($\overline{\text{EN}}$) of the two decoders!
2. **Upper Decoder 0 (Handles Channels 0 to 7)**:
   * Receives address bits $(A_2, A_1, A_0)$.
   * Enable line connected to $A_3$ directly: $\overline{\text{EN}_0} = A_3$.
   * When $A_3 = 0$, Decoder 0 is **ENABLED** and decodes addresses $0000_2$ to $0111_2$ (decimals 0 to 7).
3. **Lower Decoder 1 (Handles Channels 8 to 15)**:
   * Receives address bits $(A_2, A_1, A_0)$.
   * Enable line connected to $\overline{A_3}$ through an inverter: $\overline{\text{EN}_1} = \overline{A_3}$.
   * When $A_3 = 1$, Decoder 1 is **ENABLED** and decodes addresses $1000_2$ to $1111_2$ (decimals 8 to 15).

```text
HIERARCHICAL 4-TO-16 DECODER TREE SCHEMATIC

 Address MSB (A3) ──┬──► Enable EN0' ─────► [ 3:8 Decoder 0 ] ──► Outputs Y0'..Y7'
                    │                       (Inputs: A2,A1,A0)
                    └──►[ NOT ]──► EN1' ──► [ 3:8 Decoder 1 ] ──► Outputs Y8'..Y15'
                                            (Inputs: A2,A1,A0)
                                                 ▲
 Lower Address Bits (A2, A1, A0) ────────────────┘ (Parallel Address Bus)
```

Let us trace address $A = 1001_2$ (decimal 9):
* MSB $A_3 = 1$.
  * Decoder 0 receives $\overline{\text{EN}_0} = A_3 = 1$. Decoder 0 is **DISABLED**. All outputs $\overline{Y_0} \dots \overline{Y_7}$ stay at $1$ (inactive).
  * Decoder 1 receives $\overline{\text{EN}_1} = \overline{A_3} = 0$. Decoder 1 is **ENABLED**!
* Lower address bits $(A_2, A_1, A_0) = 001_2$ (decimal 1).
  * Decoder 1 evaluates address $001_2$ and activates its Channel 1.
  * Channel 1 of Decoder 1 corresponds to global output $\overline{Y_9}$!
  * Output $\overline{Y_9}$ drops to $0\text{ V}$ (Active Low).

The hierarchical expansion selects $\overline{Y_9}$ with 100% mathematical accuracy!

---

## Implementing Arbitrary Boolean Logic Using Decoders and Gates

In addition to address decoding, binary decoders possess a powerful secondary capability: **A single $N$-to-$2^N$ decoder can implement ANY arbitrary multi-output Boolean function of $N$ variables!**

Because an $N$-to-$2^N$ active-high decoder generates all $2^N$ minterms of its input variables ($m_0, m_1, \dots, m_{2^N-1}$), we can implement any Boolean function by simply connecting an **OR gate** to the decoder output pins corresponding to the function's active minterms!

### 1. Implementing Logic with Active-High Decoders (OR Gate Synthesis)

Given a function expressed in minterm summation notation:

$$
f(A, B, C) = \sum m(1, 4, 7)
$$

To implement this function:
1. Connect inputs $A, B, C$ to a 3-to-8 Active-High Decoder.
2. Connect decoder outputs $Y_1, Y_4, Y_7$ to the inputs of a 3-input **OR gate**.
3. The output of the OR gate is $f(A, B, C)$!

```text
LOGIC FUNCTION SYNTHESIS WITH ACTIVE-HIGH DECODER

 Inputs A, B, C ──► [ 3:8 Active-High Decoder ]
                    ├──► Y1 (m1) ──┐
                    ├──► Y4 (m4) ──┼──► [ OR Gate ] ──► Output f = m1 + m4 + m7
                    └──► Y7 (m7) ──┘
```

### 2. Implementing Logic with Active-Low Decoders (NAND Gate Synthesis)

Because commercial decoders use **Active-Low Outputs** ($\overline{Y_k} = \overline{m_k}$), we use a **NAND gate** instead of an OR gate!

By De Morgan's Law:

$$
f(A, B, C) = m_1 + m_4 + m_7 = \overline{\overline{m_1} \cdot \overline{m_4} \cdot \overline{m_7}} = \overline{\overline{Y_1} \cdot \overline{Y_4} \cdot \overline{Y_7}}
$$

```text
LOGIC FUNCTION SYNTHESIS WITH ACTIVE-LOW DECODER

 Inputs A, B, C ──► [ 3:8 Active-Low Decoder ]
                    ├──► Y1' (m1') ──┐
                    ├──► Y4' (m4') ──┼──► [ NAND Gate ] ──► Output f = m1 + m4 + m7
                    └──► Y7' (m7') ──┘
```

Connecting active-low decoder outputs to a NAND gate synthesizes any Boolean function with zero additional inverters!

---

## Engineering Reality: Propagation Delay, Glitches, and Decoded Bus Timing

While decoders provide clean 1-out-of-$2^N$ address decoding, physical CMOS silicon introduces timing realities that hardware designers must evaluate.

### 1. Address Transition Glitches

When an address bus changes from $011_2$ (3) to $100_2$ (4), the input lines $A_2, A_1, A_0$ do not flip instantaneously. 

If line $A_0$ drops to $0$ a fraction of a nanosecond before line $A_2$ rises to $1$, the decoder will temporarily see intermediate address $010_2$ (2) for a few picoseconds!

```text
ADDRESS TRANSITION TIMING GLITCH

 Intended Address Change:  011_2 (Channel 3)  ───────────────►  100_2 (Channel 4)
                                
 Actual Physical Path:     011_2 ──► [ A0 drops first ] ──► 010_2 ──► [ A2 rises ] ──► 100_2
                                                               │
                                                               ▼
                                                  TRANSIENT GLITCH ON CHANNEL 2!
```

If Channel 2 is connected to a memory write pin, that transient glitch can cause accidental memory corruption.

### 2. The Solution: Gating Decoders with the Enable Line ($\overline{\text{EN}}$)

To eliminate address transition glitches, microprocessors use **Strobe Gating**:
1. The CPU changes the address bus $A$ while holding the decoder **DISABLED** ($\overline{\text{EN}} = 1$).
2. The CPU waits a few nanoseconds for all address lines to settle completely.
3. The CPU pulses the Enable line **LOW** ($\overline{\text{EN}} = 0$) to activate the decoder only when the address is rock-solid!

```text
STROBE GATED DECODER TIMING WAVEFORMS

 Address Bus A :  ===[ Address Changes: 011 -> 100 ]=======================
                                │
 Enable EN'    :  111111111111110000000011111111111111111111111111111111111
                                ◄───────►
                         Strobe Pulse (Safe Activation Window)
```

Gating decoders with active-low enable lines ensures 100% glitch-free memory bus selection.

---

## Solved Industrial Engineering Exercise: Avionics Multi-SRAM Memory Controller

To consolidate your complete mastery of binary decoders, active-low enable control, active-low outputs, and logic synthesis, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics defense firm is engineering the memory selection module for a fighter jet's flight data recorder. The system contains four independent 64-Kilobyte SRAM chips ($\text{RAM}_0, \text{RAM}_1, \text{RAM}_2, \text{RAM}_3$).

Each SRAM chip has an active-low **Chip Select Input** ($\overline{\text{CS}_0}, \overline{\text{CS}_1}, \overline{\text{CS}_2}, \overline{\text{CS}_3}$).
* When $\overline{\text{CS}_k} = 0$, $\text{RAM}_k$ is activated and communicates on the data bus.
* When $\overline{\text{CS}_k} = 1$, $\text{RAM}_k$ is disabled and keeps its output pins in High-Impedance ($Z$).

The CPU Memory Unit emits:
1. A 2-bit **Memory Address Bus** $A_{\text{mem}} = (A_{17}, A_{16})$.
2. An active-low **Memory Request Strobe** ($\overline{\text{MREQ}}$), which pulses $0\text{ V}$ ($0$) when a memory access is valid.
3. An active-high **System Fault Flag** ($\text{FAULT}$), which turns $1$ if an avionics power fault occurs.

```text
AVIONICS MULTI-SRAM MEMORY SELECTION MODULE

 Address Bus (A17, A16) ────┐
 Memory Strobe (MREQ') ─────┼───► [ Memory Selection Decoder ] ───► CS0'..CS3' (To SRAMs)
 System Fault (FAULT) ──────┘
```

#### System Selection Rules

The avionics specification dictates:
* The decoder must activate exactly one SRAM chip ($\overline{\text{CS}_k} = 0$) matching address $(A_{17}, A_{16})$ if and only if $\overline{\text{MREQ}} = 0$ AND $\text{FAULT} = 0$.
* If $\overline{\text{MREQ}} = 1$ (no memory access requested) OR $\text{FAULT} = 1$ (system fault active), ALL four $\overline{\text{CS}_0} \dots \overline{\text{CS}_3}$ outputs MUST be held at $1$ (all SRAMs disabled).

#### Your Objective

1. Design an active-low **Enable Control Network** that combines $\overline{\text{MREQ}}$ and $\text{FAULT}$ into a single active-low master enable signal $\overline{\text{EN}}$ for a 2-to-4 active-low decoder.
2. Construct the complete 8-row system truth table for the 2-to-4 decoder with controls.
3. Derive the four Boolean output equations for $\overline{\text{CS}_0}, \overline{\text{CS}_1}, \overline{\text{CS}_2}, \overline{\text{CS}_3}$.
4. Implement an auxiliary avionics status signal $S_{\text{alert}} = \sum m(1, 2)$ using the same 2-to-4 decoder outputs and an external NAND gate.
5. Verify system operation against flight scenarios.

---

### Step-by-Step Derivation

#### Step 1: Synthesize the Active-Low Master Enable Signal ($\overline{\text{EN}}$)

The specification states that the memory decoder should be ENABLED ($\overline{\text{EN}} = 0$) if and only if:
$$\overline{\text{MREQ}} = 0 \quad \text{AND} \quad \text{FAULT} = 0$$

If $\overline{\text{MREQ}} = 1$ OR $\text{FAULT} = 1$, the decoder must be DISABLED ($\overline{\text{EN}} = 1$).

Writing the Boolean equation for $\overline{\text{EN}}$:

$$
\overline{\text{EN}} = \overline{\text{MREQ}} + \text{FAULT}
$$

Where:
* $\overline{\text{EN}}$ is the master active-low enable signal sent to the 2-to-4 decoder.
* $\overline{\text{MREQ}}$ is the active-low memory request strobe from the CPU.
* $\text{FAULT}$ is the active-high system fault flag.

Let us test this equation:
* If $\overline{\text{MREQ}} = 0$ and $\text{FAULT} = 0 \implies \overline{\text{EN}} = 0 + 0 = 0$ (**Decoder ENABLED!**).
* If $\overline{\text{MREQ}} = 1$ and $\text{FAULT} = 0 \implies \overline{\text{EN}} = 1 + 0 = 1$ (**Decoder DISABLED!**).
* If $\overline{\text{MREQ}} = 0$ and $\text{FAULT} = 1 \implies \overline{\text{EN}} = 0 + 1 = 1$ (**Decoder DISABLED!**).

The master enable equation $\overline{\text{EN}} = \overline{\text{MREQ}} + \text{FAULT}$ is implemented using a single 2-input **OR gate**.

---

#### Step 2: Construct the System Truth Table

Now let us construct the truth table for the 2-to-4 active-low decoder receiving address bits $(A_{17}, A_{16})$ and master enable $\overline{\text{EN}}$:

```text
AVIONICS MEMORY SELECTION DECODER TRUTH TABLE

 Master EN' │ Address A17 │ Address A16 │ Output CS0' │ Output CS1' │ Output CS2' │ Output CS3' │ Active Memory Bank
────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼────────────────────
     1      │      X      │      X      │      1      │      1      │      1      │      1      │ NONE (All Disabled)
     0      │      0      │      0      │      0      │      1      │      1      │      1      │ RAM_0 Selected (00)
     0      │      0      │      1      │      1      │      0      │      1      │      1      │ RAM_1 Selected (01)
     0      │      1      │      0      │      1      │      1      │      0      │      1      │ RAM_2 Selected (10)
     0      │      1      │      1      │      1      │      1      │      1      │      0      │ RAM_3 Selected (11)
```

Look at this table:
* When $\overline{\text{EN}} = 1$, all chip select outputs $\overline{\text{CS}_0} \dots \overline{\text{CS}_3}$ are $1$ (inactive).
* When $\overline{\text{EN}} = 0$, exactly one chip select line drops to $0$ (active low), activating the chosen SRAM chip.

---

#### Step 3: Derive Boolean Equations for Chip Select Outputs

Using 3-input NAND gates for each active-low channel:

$$
\overline{\text{CS}_0} = \overline{\overline{\overline{\text{EN}}} \cdot \overline{A_{17}} \cdot \overline{A_{16}}}
$$

$$
\overline{\text{CS}_1} = \overline{\overline{\overline{\text{EN}}} \cdot \overline{A_{17}} \cdot A_{16}}
$$

$$
\overline{\text{CS}_2} = \overline{\overline{\overline{\text{EN}}} \cdot A_{17} \cdot \overline{A_{16}}}
$$

$$
\overline{\text{CS}_3} = \overline{\overline{\overline{\text{EN}}} \cdot A_{17} \cdot A_{16}}
$$

Substituting $\overline{\text{EN}} = \overline{\text{MREQ}} + \text{FAULT}$ (or using an internal enable inverting pin):

$$
\overline{\text{CS}_k} = \overline{\text{EN\_ACTIVE} \cdot m_k(A_{17}, A_{16})}
$$

Where:
* $\overline{\text{CS}_k}$ is the active-low chip select signal for $\text{RAM}_k$.
* $\text{EN\_ACTIVE} = \overline{\overline{\text{EN}}}$ is the internal high signal when enabled.
* $m_k(A_{17}, A_{16})$ is the address minterm.

```text
COMPLETE AVIONICS MEMORY DECODER SCHEMATIC

MREQ' ───┐
         ├──► [ OR ] ──► EN' ──► [ NOT ] ──► EN_ACTIVE ──┐
FAULT ───┘                                               │
                                                         │
A17 ──► [ NOT 1 ] ──► A17'                               │
A16 ──► [ NOT 0 ] ──► A16'                               │
                                                         ▼
      EN_ACTIVE · A17' · A16' ─────────────────────►[ NAND 0 ]──► CS0'
      EN_ACTIVE · A17' · A16  ─────────────────────►[ NAND 1 ]──► CS1'
      EN_ACTIVE · A17  · A16' ─────────────────────►[ NAND 2 ]──► CS2'
      EN_ACTIVE · A17  · A16  ─────────────────────►[ NAND 3 ]──► CS3'
```

---

#### Step 4: Implement Auxiliary Alert Function $S_{\text{alert}} = \sum m(1, 2)$

The flight computer needs an auxiliary alert signal $S_{\text{alert}}$ that fires ($1$) whenever $\text{RAM}_1$ ($m_1$) or $\text{RAM}_2$ ($m_2$) is accessed.

Using our active-low decoder outputs $\overline{\text{CS}_1}$ and $\overline{\text{CS}_2}$:

By De Morgan's Law:

$$
S_{\text{alert}} = m_1 + m_2 = \overline{\overline{m_1} \cdot \overline{m_2}} = \overline{\overline{\text{CS}_1} \cdot \overline{\text{CS}_2}}
$$

To synthesize $S_{\text{alert}}$, we simply connect outputs $\overline{\text{CS}_1}$ and $\overline{\text{CS}_2}$ to the inputs of a 2-input **NAND gate**!

```text
AUXILIARY ALERT SIGNAL SYNTHESIS

 Decoder Output CS1' ───┐
                        ├───► [ 2-Input NAND Gate ] ───► Alert Signal S_alert
 Decoder Output CS2' ───┘
```

---

### Sanity Check and Verification

Let us verify our avionics memory controller across three flight operations.

#### Scenario A: Normal Read from $\text{RAM}_1$ ($A_{17}A_{16} = 01_2$, $\overline{\text{MREQ}} = 0, \text{FAULT} = 0$)
* **Inputs**: Address $= 01_2$. $\overline{\text{MREQ}} = 0, \text{FAULT} = 0$.
* **Enable Evaluation**: $\overline{\text{EN}} = 0 + 0 = 0$ (**ENABLED**). $\text{EN\_ACTIVE} = 1$.
* **Decoder Output Evaluation**:
  * $\overline{\text{CS}_0} = \overline{1 \cdot \overline{0} \cdot \overline{1}} = \overline{0} = 1$ ($\text{RAM}_0$ Disabled).
  * $\overline{\text{CS}_1} = \overline{1 \cdot \overline{0} \cdot 1} = \overline{1} = 0$ ($\text{RAM}_1$ **ACTIVATED**!).
  * $\overline{\text{CS}_2} = \overline{1 \cdot 0 \cdot \overline{1}} = \overline{0} = 1$ ($\text{RAM}_2$ Disabled).
  * $\overline{\text{CS}_3} = \overline{1 \cdot 0 \cdot 1} = \overline{0} = 1$ ($\text{RAM}_3$ Disabled).
* **Auxiliary Alert**: $S_{\text{alert}} = \overline{\overline{\text{CS}_1} \cdot \overline{\text{CS}_2}} = \overline{0 \cdot 1} = \overline{0} = 1$.
* **Result**: $\text{RAM}_1$ activated, $S_{\text{alert}} = 1$. **FLIGHT READ SUCCESSFUL!**

#### Scenario B: System Power Fault Triggered ($A_{17}A_{16} = 01_2$, $\overline{\text{MREQ}} = 0, \text{FAULT} = 1$)
* **Inputs**: Address $= 01_2$. $\overline{\text{MREQ}} = 0, \text{FAULT} = 1$.
* **Enable Evaluation**: $\overline{\text{EN}} = 0 + 1 = 1$ (**DISABLED**). $\text{EN\_ACTIVE} = 0$.
* **Decoder Output Evaluation**:
  * Every NAND gate receives $\text{EN\_ACTIVE} = 0$.
  * $\overline{\text{CS}_0} = \overline{0} = 1$.
  * $\overline{\text{CS}_1} = \overline{0} = 1$.
  * $\overline{\text{CS}_2} = \overline{0} = 1$.
  * $\overline{\text{CS}_3} = \overline{0} = 1$.
* **Result**: All SRAMs disabled ($\overline{\text{CS}_k} = 1$). **MEMORY PROTECTED DURING FAULT!**

#### Scenario C: Normal Access to $\text{RAM}_0$ ($A_{17}A_{16} = 00_2$, $\overline{\text{MREQ}} = 0, \text{FAULT} = 0$)
* **Inputs**: Address $= 00_2$. $\overline{\text{MREQ}} = 0, \text{FAULT} = 0$.
* **Enable Evaluation**: $\overline{\text{EN}} = 0$. $\text{EN\_ACTIVE} = 1$.
* **Decoder Output Evaluation**:
  * $\overline{\text{CS}_0} = \overline{1 \cdot \overline{0} \cdot \overline{0}} = \overline{1} = 0$ ($\text{RAM}_0$ **ACTIVATED**!).
  * All other $\overline{\text{CS}_k} = 1$.
* **Auxiliary Alert**: $S_{\text{alert}} = \overline{\overline{\text{CS}_1} \cdot \overline{\text{CS}_2}} = \overline{1 \cdot 1} = \overline{1} = 0$.
* **Result**: $\text{RAM}_0$ activated, $S_{\text{alert}} = 0$. **VERIFIED!**

All scenarios evaluate with 100% mathematical precision. The multi-SRAM avionics memory controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Binary Decoder**: A combinational logic module that translates an $N$-bit binary input code into $M = 2^N$ unique output channels, performing One-Hot address decoding to activate exactly one output line corresponding to the numerical value of the input code.
* **Active-Low Enable**: A master control line ($\overline{\text{EN}}$ or $\overline{E}$) that authorizes decoder operation when driven to Logic Low ($0\text{ V}$), and when driven to Logic High ($1$) forces all output channels into their inactive state, providing a glitch-free strobe mechanism for multi-chip memory expansion.