content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/01-isa-instruction-encoding-architecture/01-instruction-encoding-formats/02-immediate-value-sign-extension.md
# Immediate Value Encoding and Sign-Extension Unit Mechanics

## The Constant Width Constraint: Why Instructions Cannot Hold 64-Bit Numbers

In digital computer systems, a central processing unit (CPU) executes software by retrieving instruction words from memory and feeding them into hardware execution pipelines. In a 32-bit Reduced Instruction Set Computer (RISC) architecture, every single instruction word stored in memory is engineered to be exactly 32 bits wide ($4\text{ bytes}$). This fixed width allows hardware decoders to process instructions quickly, aligned to predictable 4-byte boundaries.

However, computer programs do not process registers in isolation. Software continuously requires hardcoded numbers—known as **Constants** or **Immediate Values**—to perform everyday tasks:
* Incrementing a loop counter by $1$ (`i++`).
* Adding a fixed memory offset of $16\text{ bytes}$ to locate a variable inside a data structure.
* Subtracting $5$ from a health bar in a game loop.
* Setting a configuration register to a specific bitmask.

This creates an inescapable physical dilemma: **The Constant Width Constraint**.

If a CPU instruction word is fixed at 32 bits total length, how can that single 32-bit instruction hold both the command codes *and* the numeric constant?

Consider the space allocation inside a standard 32-bit instruction word:
* The primary Operation Code (**Opcode**) requires $7\text{ bits}$ to identify the instruction class.
* The Destination Register field (**`rd`**) requires $5\text{ bits}$ to select 1 of 32 architectural registers ($2^5 = 32$).
* The Sub-Operation selector (**`funct3`**) requires $3\text{ bits}$.
* The Source Register field (**`rs1`**) requires $5\text{ bits}$ to select the input register.

Adding up these mandatory control fields consumes $7 + 5 + 3 + 5 = 20\text{ bits}$ out of the 32 bits available!

```text
THE INSTRUCTION WORD BIT BUDGET BOTTLENECK

 Total 32-Bit Instruction Word Boundary (32 Bits Total)
 ┌───────────────────────────┬──────────┬──────────┬──────────┬──────────┐
 │ Immediate Field (imm)     │ rs1      │ funct3   │ rd       │ opcode   │
 │ 12 Bits Available         │ 5 Bits   │ 3 Bits   │ 5 Bits   │ 7 Bits   │
 └───────────────────────────┴──────────┴──────────┴──────────┴──────────┘
  ◄────── 12 Bits ──────────► ◄────── 20 Control Bits Occupied ────────►
```

Only **12 bits** remain available inside the instruction word to store the numeric constant!

Now we encounter the physical friction:
A 12-bit binary field can represent only $2^{12} = 4,096$ distinct numeric values. Using Two's Complement signed representation, a 12-bit number ranges from $-2,048$ to $+2,047$.

However, the CPU's internal Arithmetic Logic Unit (ALU) and general-purpose registers in a 64-bit architecture operate on **64-bit wide data buses**!

When the CPU executes an immediate addition instruction—such as adding the 12-bit constant $-5$ to a 64-bit register value—the hardware must feed a **12-bit number** into one input of the ALU and a **64-bit number** into the other input of the ALU.

```text
THE DATA BUS WIDTH MISMATCH FRICTION

 64-Bit Register File Output (rs1) ──► 64-Bit Wide Input A ┐
                                                           ├─► [ 64-Bit ALU ]
 12-Bit Immediate Field (imm)     ──► 12-Bit Wide Input B ┘
                                      (WIDTH MISMATCH!)
 (How do we expand 12 bits to 64 bits without altering negative values?)
```

How can the silicon hardware take a tiny 12-bit number and widen it to fill a 64-bit bus without corrupting its mathematical value?

If the hardware simply fills the upper 52 empty wire positions with zeros (Zero Extension), a positive number like $+5$ ($000000000101_2$) expands correctly to $+5$ ($000000000000\dots00000101_2$).

But look at what happens if the 12-bit number is negative!

In 12-bit Two's Complement, the negative number $-5$ is encoded as:

$$111111111011_2$$

If the hardware fills the upper 52 bits with zeros, the number becomes:

$$0000000000000000000000000000000000000000000000000000111111111011_2$$

This 64-bit binary number is no longer $-5$! It is now **$+4,091$**! 

By filling the upper bits with zeros, the negative sign was erased, transforming a negative temperature or balance deduction into a large positive addition!

To preserve mathematical truth across different bus widths, CPU hardware relies on an essential combinational module: **The Sign-Extension Unit (SEU)** and **Immediate Encoding Mechanics**.

---

## The Rubber-Stamp Sign Duplicator: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of immediate values and sign extension before analyzing combinational logic gate trees and Two's Complement math, let us consider an everyday analogy: **The Polar Temperature Ledger**.

Imagine an environmental researcher (**The CPU**) recording outdoor temperatures in sub-zero polar weather.

```text
THE POLAR TEMPERATURE LEDGER METAPHOR

 Explorer's Small Pocket Memo (12-Bit Instruction Word)
 ┌───────────────────────────┐
 │ Temp: [ -15 ]             │  ◄── Space for a 4-Digit Reading
 └───────────────────────────┘

 Master Scientific Logbook (64-Bit ALU Bus)
 ┌───────────────────────────────────────────────────────────┐
 │ Temp: [ _ _ _ _ - 1 5 ]                                   │  ◄── Space for an 8-Digit Reading
 └───────────────────────────────────────────────────────────┘
```

The researcher carries a small pocket memo pad (**The Instruction Word**). Because the memo pad pages are small, each entry has room for only **4 digits** (representing the 12-bit immediate field).

In this 4-digit system, temperatures above zero use a leading `0`, while sub-zero temperatures below zero use a leading `9` to indicate a negative sign:
* $+15$ degrees is written on the memo pad as `0015`.
* $-15$ degrees is written on the memo pad as `9985` (where `9` indicates negative in 10's complement).

Now, at the end of the day, the researcher must copy these 4-digit readings into the master scientific logbook (**The 64-Bit ALU Input Bus**). The master logbook uses **8-digit slots** for every entry.

Let us observe two different strategies for copying the 4-digit memo entries into the 8-digit master logbook:

---

### Strategy A: The Naive Zero-Fill Strategy (Zero Extension)

The researcher copies the 4-digit reading into the rightmost slots of the master logbook and fills the 4 empty slots on the left with zeros:

1. **For $+15$ (`0015`)**: The researcher fills the left slots with zeros $\rightarrow$ `00000015`.
   * The reading in the master logbook is $+15$ degrees. **Correct!**
2. **For $-15$ (`9985`)**: The researcher fills the left slots with zeros $\rightarrow$ `00009985`.
   * The master logbook now records the temperature as **$+9,985$ degrees**!
   * A freezing polar temperature of $-15$ degrees was transformed into a scorching heatwave of $+9,985$ degrees because the leading negative sign (`9`) was disconnected from the top of the number!

---

### Strategy B: The Rubber-Stamp Sign Duplicator (Sign Extension)

Realizing the error of filling with zeros, the researcher adopts a new rule using a **Rubber Stamp**:

> **The Sign Duplicator Rule**: Look at the leftmost (most significant) digit of the 4-digit reading. Whatever that leading digit is (`0` or `9`), **RUBBER-STAMP IT across all empty slots on the left!**

```text
THE RUBBER-STAMP SIGN DUPLICATOR IN ACTION

 Reading 1: +15 Degrees ("0015" - Leading digit is "0")
 ┌───────────────────────────────────────────────────────────┐
 │ [0] [0] [0] [0] [0] [0] [1] [5]                           │  ──► Reads +15 Degrees!
 └───────────────────────────────────────────────────────────┘
  ◄─ Stamped 0 ─► ◄─ Original ─►

 Reading 2: -15 Degrees ("9985" - Leading digit is "9")
 ┌───────────────────────────────────────────────────────────┐
 │ [9] [9] [9] [9] [9] [9] [8] [5]                           │  ──► Reads -15 Degrees!
 └───────────────────────────────────────────────────────────┘
  ◄─ Stamped 9 ─► ◄─ Original ─►
```

Look at how Strategy B preserves mathematical meaning:
1. **For $+15$ (`0015`)**: The leading digit is `0`. The researcher stamps `0` into the 4 empty slots $\rightarrow$ `00000015` ($+15$).
2. **For $-15$ (`9985`)**: The leading digit is `9`. The researcher stamps `9` into the 4 empty slots $\rightarrow$ `99999985` ($-15$ in 8-digit 10's complement).
   * The master logbook correctly records the temperature as **$-15$ degrees**!

By replicating the leading sign digit across all new spaces on the left, the magnitude and negative sign of the number remain $100\%$ preserved, regardless of how wide the logbook page becomes!

This rubber-stamp sign duplicator is the exact physical analogue of a **Hardware Sign-Extension Unit**:
* The 4-digit memo entry is the **12-Bit Immediate Field** inside an instruction word.
* The 8-digit master logbook is the **64-Bit ALU Input Bus**.
* The leading digit (`0` or `9`, or bit `11` in binary `0` or `1`) is the **Sign Bit ($MSB$)**.
* The rubber stamp replicating the leading digit across empty slots is the **Combinational Sign-Extension Fanout Tree**.

---

## Primitive 1: Immediate Encoding Mechanics across ISA Formats

Now that we possess an intuitive mental model of rubber-stamp sign duplication, let us examine the formal, rigorous engineering mechanics of **Immediate Encoding**.

An **Immediate Value** (or constant) is a numeric value stored directly inside the binary encoding of an instruction word, rather than retrieved from a register or memory location.

Because different software instructions use immediate constants for different purposes, modern RISC architectures (such as RISC-V RV32I/RV64I) partition immediate bits across five primary instruction formats: **I-Type**, **S-Type**, **B-Type**, **U-Type**, and **J-Type**.

```text
IMMEDIATE FIELD PACKING ACROSS RISC-V INSTRUCTION FORMATS

 Bit:  31         25 24     20 19     15 14  12 11      7 6        0
       ┌────────────┬─────────┬─────────┬──────┬─────────┬──────────┐
 I-Type│    imm[11:0]         │   rs1   │funct3│   rd    │  opcode  │ Immediate / Loads
       ├────────────┬─────────┼─────────┼──────┼─────────┼──────────┤
 S-Type│ imm[11:5]  │   rs2   │   rs1   │funct3│imm[4:0] │  opcode  │ Stores
       ├────────────┬─────────┼─────────┼──────┼─────────┼──────────┤
 B-Type│ imm[12|10:5]│  rs2   │   rs1   │funct3│imm[4:1|11] opcode  │ Branches
       ├────────────┴─────────┴─────────┴──────┼─────────┼──────────┤
 U-Type│            imm[31:12]                 │   rd    │  opcode  │ Upper Immediate
       ├───────────────────────────────────────┼─────────┼──────────┤
 J-Type│         imm[20|10:1|11|19:12]         │   rd    │  opcode  │ Unconditional Jumps
       └───────────────────────────────────────└─────────┴──────────┘
```

Let us analyze how immediate bits are packed into each format and why their hardware layouts are structured in this specific way:

---

### 1. I-Type Immediate Encoding (12-Bit Contiguous Immediate)

* **Usage**: Immediate Arithmetic (`addi`, `andi`, `ori`), Memory Loads (`lw`, `ld`), and Register Jumps (`jalr`).
* **Bit Location**: Bits `[31:20]` of the instruction word hold a contiguous 12-bit signed integer (`imm[11:0]`).
* **Value Range**:
  $$\text{Minimum Value} = 100000000000_2 = -2^{11} = \mathbf{-2,048}$$
  $$\text{Maximum Value} = 011111111111_2 = +2^{11} - 1 = \mathbf{+2,047}$$

```text
I-TYPE IMMEDIATE FIELD STRUCTURE

 Instruction Bits [31:20] ──► [ imm[11:0] (12 Bits Contiguous) ]
                                 │
                                 ▼
 Sign Bit sits at Instruction Bit 31! (MSB)
```

---

### 2. S-Type Immediate Encoding (Split Store Immediate)

* **Usage**: Memory Store instructions (`sw`, `sd`).
* **Bit Location**: The 12-bit store offset is split into two separate fields:
  * Upper 7 bits: `Instruction[31:25]` holds `imm[11:5]`.
  * Lower 5 bits: `Instruction[11:7]` holds `imm[4:0]`.

#### Why is the S-Type Immediate Split into Two Fields?
This is a critical hardware design choice:
In Store instructions, the processor must read two source registers: `rs1` (base memory address) and `rs2` (data value to be stored). 

To preserve **Fixed Field Alignment**, source register `rs2` MUST remain anchored at bits `[24:20]`!

Because bits `[24:20]` are occupied by `rs2`, the 12-bit store immediate cannot be stored as a single 12-bit block. The hardware splits the immediate around `rs2`, keeping `rs1` (`[19:15]`) and `rs2` (`[24:20]`) at their permanent wire locations!

```text
S-TYPE SPLIT IMMEDIATE AROUND FIXED RS2 FIELD

 Instruction Bits: [31 ------ 25] [24 --- 20] [19 --- 15] ... [11 ---- 7]
 Field Assignment:   imm[11:5]        rs2        rs1            imm[4:0]
                     (Upper 7B)    (Fixed!)   (Fixed!)         (Lower 5B)
```

---

### 3. B-Type Immediate Encoding (Branch Offset Encoding)

* **Usage**: Conditional Branch instructions (`beq`, `bne`, `blt`, `bge`).
* **Bit Location**: Encodes a 13-bit signed byte offset (`imm[12:1]`) used for PC-relative branching.
* **Why Bit 0 is Omitted**: Because all instructions in 32-bit RISC architectures are aligned to 2-byte or 4-byte boundaries, the lowest bit of a branch offset is **ALWAYS ZERO** ($imm[0] = 0$). Omitting $imm[0]$ allows 12 bits in the instruction word to encode a 13-bit offset range ($\pm 4,096\text{ bytes}$)!

---

### 4. U-Type Immediate Encoding (20-Bit Upper Immediate)

* **Usage**: Load Upper Immediate (`lui`) and Add Upper Immediate to PC (`auipc`).
* **Bit Location**: Bits `[31:12]` hold a 20-bit unsigned immediate (`imm[31:12]`).
* **Purpose**: Used in combination with 12-bit I-type instructions to construct full **32-bit constants or memory addresses** in two steps:

$$\text{Full 32-Bit Constant} = (\text{imm[31:12]} \ll 12) + \text{imm[11:0]}$$

---

### Summary Table of Immediate Field Layouts

```text
SUMMARY OF IMMEDIATE FIELD ENCODINGS ACROSS FORMATS

 Format │ Bit [31] │ Bits [30:25] │ Bits [24:21] │ Bit [20] │ Bits [19:12] │ Bits [11:8] │ Bit [7]
────────┼──────────┼──────────────┼──────────────┼──────────┼──────────────┼─────────────┼─────────
 I-Type │ imm[11]  │  imm[10:5]   │  imm[4:1]    │ imm[0]   │   (rs1)      │    (rd)     │  (rd)
 S-Type │ imm[11]  │  imm[10:5]   │    (rs2)     │  (rs2)   │   (rs1)      │  imm[4:1]   │ imm[0]
 B-Type │ imm[12]  │  imm[10:5]   │    (rs2)     │  (rs2)   │   (rs1)      │  imm[4:1]   │ imm[11]
 U-Type │ imm[31]  │  imm[30:25]  │  imm[24:21]  │ imm[20]  │  imm[19:12]  │    (rd)     │  (rd)
 J-Type │ imm[20]  │  imm[10:5]   │  imm[4:1]    │ imm[11]  │  imm[19:12]  │    (rd)     │  (rd)
```

Look at the leftmost column (Bit `31`) across ALL five formats:
> **The Universal Sign Bit Invariant**: In RISC-V instruction encodings, the sign bit of the immediate value is **ALWAYS located at Instruction Bit 31**, regardless of the instruction format!

This invariant means the Sign-Extension Unit needs to inspect only **a single physical wire (`Instruction[31]`)** to perform sign extension for every instruction type in the ISA!

---

## Primitive 2: The Sign-Extension Unit (SEU) Circuitry

Now let us examine the second core primitive: **The Sign-Extension Unit (SEU)** and its internal combinational gate mechanics.

A **Sign-Extension Unit (SEU)** is an asynchronous combinational logic module positioned inside the CPU's Instruction Decode (ID) stage. 

Its job is to take an $N$-bit immediate field (e.g., a 12-bit immediate $Imm12$) extracted from the instruction word and expand it into an $M$-bit output bus (e.g., a 64-bit bus $Imm64$) ready to be fed into the ALU.

```text
SIGN-EXTENSION UNIT (SEU) COMBINATIONAL DATAPATH

 32-Bit Instruction Word From Fetch Buffer
  │
  ├─► Bits [31:20] ──► [ Immediate Slicer ] ──► Imm12[11:0] (12-Bit Field)
  │                                                   │
  │   Bit 31 (Sign Bit)                               │
  └───────────────────(Direct Fanout Wire)────────────┼─────────────────┐
                                                      │                 │
                                                      ▼                 ▼
 ┌─────────────────────────────────────────────────────────┬──────────────┐
 │ High-Drive Buffer Fanout Array                          │ Direct Wires │
 │ Replicates Bit 31 across Output Bits [63:12]            │ Bits [11:0]  │
 └──────────────────────────┬──────────────────────────────┴──────┬───────┘
                            │                                     │
                            ▼                                     ▼
                    Output Bits [63:12]                   Output Bits [11:0]
                    ◄───────────────── Imm64[63:0] ──────────────────────►
```

---

### Mathematical Definition of Sign Extension

Let $Imm12[11:0]$ be the 12-bit immediate field extracted from the instruction word, where $Imm12[11]$ is the Most Significant Bit (the Sign Bit).

Let $Imm64[63:0]$ be the 64-bit sign-extended output word.

The mathematical function executed by the Sign-Extension Unit is:

$$Imm64[i] = \begin{cases} Imm12[i] & \text{for } 0 \le i \le 11 \\ Imm12[11] & \text{for } 12 \le i \le 63 \end{cases}$$

Where:
* $Imm64[i]$ is the $i$-th bit of the 64-bit output bus.
* $Imm12[i]$ is the $i$-th bit of the 12-bit immediate field.
* $Imm12[11]$ is the sign bit (`Instruction[31]`).

---

### Gate-Level Hardware Implementation of the SEU

How is this mathematical function built in physical silicon gates?

Because sign extension simply replicates the value of a single wire (`Instruction[31]`) across 52 upper output wires ($Imm64[63:12]$), the SEU requires **ZERO logic gates for the lower 12 bits**!

* Output wires $Imm64[11:0]$ are connected **directly** to instruction wires $Imm12[11:0]$.
* Output wires $Imm64[63:12]$ are connected to instruction wire $Imm12[11]$ through a **High-Drive Buffer Fanout Tree**.

```text
SIGN BIT FANOUT TREE SCHEMATIC

 Instruction Bit 31 (Imm12[11])
       │
       ▼
 ┌───────────────┐
 │ Driver Buffer │
 └──────┬────────┘
        ├───────────────────────┬───────────────────────┐
        ▼                       ▼                       ▼
 ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
 │ Sub-Buffer 0  │       │ Sub-Buffer 1  │       │ Sub-Buffer 2  │
 └──────┬────────┘       └──────┬────────┘       └──────┬────────┘
        │                       │                       │
        ▼                       ▼                       ▼
 Output Bits [27:12]     Output Bits [43:28]     Output Bits [63:44]
```

Why is a **Buffer Fanout Tree** needed?
Connecting a single thin silicon wire (`Instruction[31]`) directly to 52 destination transistor gates creates a large **Capacitive Gate Load ($C_{\text{fanout}}$)**. 

If a single weak gate attempts to drive 52 output wires, the electrical charging time ($t = R \cdot C$) slows down, causing the sign bit to transition slowly and violating clock timing!

The SEU uses a 2-stage or 3-stage **Inverter/Buffer Tree** to amplify the signal current, driving all 52 upper output bits to $1.20\text{ V}$ or $0.0\text{ V}$ in less than **$10\text{ picoseconds}$**!

---

### Zero Extension vs. Sign Extension

While signed arithmetic instructions (`addi`, `lw`, `sd`, `slti`) require **Sign Extension**, certain bitwise logical operations (`andi`, `ori`, `xori`) and unsigned comparisons in some ISAs require **Zero Extension**.

> **Zero Extension**: Fills all upper output bits ($Imm64[63:12]$) with **constant zeros ($0$)**, regardless of the sign bit value.

$$\text{Zero Extension: } Imm64[i] = \begin{cases} Imm12[i] & \text{for } 0 \le i \le 11 \\ 0 & \text{for } 12 \le i \le 63 \end{cases}$$

To support both sign extension and zero extension, the SEU incorporates a 2-to-1 multiplexer controlled by a signal from the Main Decoder (`ExtControl`):

```text
SELECTABLE SIGN / ZERO EXTENSION DATAPATH

 Instruction Bit 31 ──► [ AND Gate ] ───┐ (ExtControl = 1 for Sign Ext)
                        ▲               ├─► Drive Output Bits [63:12]
 ExtControl Signal  ────┘               │ (ExtControl = 0 for Zero Ext)
```

* If $\text{ExtControl} = 1$ (Signed Instruction): Bit 31 passes through to the upper 52 bits (**Sign Extension**).
* If $\text{ExtControl} = 0$ (Unsigned/Logical Instruction): The AND gate outputs $0$ for all upper 52 bits (**Zero Extension**).

---

## Real-World Engineering: Immediate Overflows, Linker Adjustments, and 32-Bit Constants

In real-world software engineering, assembly programmers and C compilers frequently need to work with numbers larger than $+2,047$ or $-2,048$ (for example, accessing a array located at physical memory address `0x12345678`).

How does a processor load a full 32-bit or 64-bit constant when individual instructions can hold only 12-bit immediates?

---

### 1. The Immediate Overflow Error in Assemblers

If a programmer writes an assembly instruction specifying an immediate constant that exceeds the 12-bit Two's Complement boundary:

```riscv
addi x10, x11, 3000   # ERROR! +3000 exceeds maximum 12-bit limit (+2047)!
```

The assembler software tool scans the constant $+3,000$, converts it to binary (`0000101110111000_2`), detects that bit 11 is $1$ while upper bits are non-zero, and throws an **Immediate Out of Range Error** during compilation!

---

### 2. Synthesizing 32-Bit Constants via `lui` and `addi`

To load a full 32-bit constant (such as `0x12345678`), the compiler or assembler splits the 32-bit constant into two separate instructions:
1. **`lui` (Load Upper Immediate)**: Loads the **upper 20 bits** (`0x12345`) into bits `[31:12]` of the target register.
2. **`addi` (Add Immediate)**: Adds the **lower 12 bits** (`0x678`) to the target register.

```riscv
# LOADING 32-BIT CONSTANT 0x12345678 IN TWO INSTRUCTIONS
lui  x10, 0x12345      # x10 <= 0x12345000 (Upper 20 bits loaded)
addi x10, x10, 0x678   # x10 <= 0x12345000 + 0x678 = 0x12345678
```

---

### 3. The Negative Sign-Extension Offset Hazard (Bit 11 Cancellation)

Now, consider a subtle hardware hazard that occurs when building 32-bit constants:

Suppose we want to load the 32-bit constant **`0x12345800`**.

Let me split `0x12345800` into upper 20 bits and lower 12 bits:
* Upper 20 bits: `0x12345`
* Lower 12 bits: `0x800` (`100000000000_2` in binary).

Look at Bit 11 of the lower 12 bits (`0x800`):
* Bit 11 is **`1`**!
* In Two's Complement 12-bit signed arithmetic, `0x800` represents the negative number **$-2,048_{10}$**!

Now, watch what happens if the assembler executes `lui` followed by `addi`:

```text
THE NEGATIVE SIGN-EXTENSION CANCELLATION HAZARD

 Step 1: lui  x10, 0x12345     ──► x10 = 0x12345000
 Step 2: addi x10, x10, 0x800  ──► addi SIGN-EXTENDS 0x800 to 0xFFFFF800 (-2048)!

 Calculation: 0x12345000 + 0xFFFFF800 (-2048) = 0x12344800! (WRONG RESULT!)
 (The result was 0x12344800 instead of 0x12345800!)
```

Look at the error:
Because `addi` **sign-extends** its 12-bit immediate, `0x800` was expanded to `0xFFFFFFFF_FFFFF800` ($-2,048$). Adding $-2,048$ to `0x12345000` **subtracted 1 from the upper 20 bits**, resulting in `0x12344800` instead of `0x12345800`!

#### The Assembler Solution (Upper Immediate Compensation):
To fix this sign-extension cancellation hazard, whenever Bit 11 of the lower 12-bit immediate is `1`, the assembler software **automatically adds $+1$ to the upper 20-bit value in the `lui` instruction**:

$$\text{If Bit 11 of Lower 12 Bits == 1} \implies \mathbf{\text{Upper 20 Bits } \Leftarrow \text{Upper 20 Bits} + 1}$$

```riscv
# CORRECTED ASSEMBLY SEQUENCE FOR CONSTANT 0x12345800
lui  x10, 0x12346      # Upper 20 bits incremented by +1 (0x12345 + 1 = 0x12346)
addi x10, x10, 0x800   # 0x12346000 + (-2048) = 0x12345800 (CORRECT!)
```

$$\text{Calculation: } \text{0x12346000} + (-2,048_{10}) = \text{0x12346000} - \text{0x00001000} + \text{0x800} = \mathbf{\text{0x12345800}}$$

The hardware addition yields the exact intended 32-bit constant `0x12345800`!

---

## Solved Industrial Engineering Exercise: 12-Bit Immediate Extraction, Two's Complement Expansion, and ALU Datapath Verification

To consolidate your complete mastery of immediate value encodings, two's complement sign extension, hardware SEU fanout, and composite constant calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect verifying the Instruction Decode and Sign-Extension Unit for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor retrieves three 32-bit raw hexadecimal instruction words from the Level 1 Instruction Cache on three consecutive clock cycles:

* **Instruction 1 (Cycle 1)**: `0x02A58513` (Immediate Addition)
* **Instruction 2 (Cycle 2)**: `0xFE050513` (Immediate Addition)
* **Instruction 3 (Cycle 3)**: `0xFE052523` (Store Word Offset)

```text
3.2 GHz PROCESSOR SIGN-EXTENSION UNIT (SEU) VERIFICATION

 L1 Instruction Cache ──► [ Instruction Register ] ──► [ Sign-Extension Unit ] ──► 64-Bit ALU
 Clock T = 312.5 ps       32-Bit Hex Instruction Words  12-Bit -> 64-Bit Expansion   Input Bus B
```

#### Your Objective

1. For each instruction word (1, 2, and 3):
   * Convert the 32-bit hexadecimal instruction to its complete 32-bit binary representation.
   * Identify the instruction format type (I-Type or S-Type).
   * Extract the physical 12-bit immediate field bits ($Imm12[11:0]$).
   * Identify the sign bit ($Imm12[11]$, located at `Instruction[31]`).
2. Perform the 64-bit sign-extension transformation mathematically, producing the full 64-bit binary output word ($Imm64[63:0]$) and its equivalent 64-bit hexadecimal and signed decimal values.
3. Calculate the signal propagation delay through the SEU fanout buffer tree, and verify static timing slack within the $312.5\text{-ps}$ clock period budget.
4. Verify mathematical, structural, and physical correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Process Instruction 1 (`0x02A58513`)

##### 1. Binary Conversion:
Hexadecimal `0x02A58513` in 32-bit binary:

$$\text{Hex: } 0 \quad 2 \quad A \quad 5 \quad 8 \quad 5 \quad 1 \quad 3$$

$$\text{Binary: } 0000 \ 0010 \ 1010 \ 0101 \ 1000 \ 0101 \ 0001 \ 0011_2$$

##### 2. Format Identification & Field Extraction:
* `opcode = Instruction[6:0]` = `0010011_2` (`0x13` $\implies$ **I-Type `addi` Instruction**).
* `rd = Instruction[11:7]` = `01010_2` = **`10`** (`x10` / `a0`).
* `funct3 = Instruction[14:12]` = `000_2` = **`0`** (`addi`).
* `rs1 = Instruction[19:15]` = `01011_2` = **`11`** (`x11` / `a1`).
* **Extract 12-Bit Immediate (`Instruction[31:20]`)**:

$$Imm12[11:0] = 0000 \ 0010 \ 1010_2 = \mathbf{\text{0x02A}}$$

##### 3. Sign Bit Identification & 64-Bit Expansion:
* **Sign Bit $Imm12[11]$** = `Instruction[31]` = **`0`** (Positive number!).
* Since the sign bit is `0`, the SEU replicates `0` across all upper 52 output bits ($Imm64[63:12] \Leftarrow 0$):

$$Imm64[63:0] = 0000000000000000000000000000000000000000000000000000000000101010_2$$

* **64-Bit Hexadecimal Value**: $\mathbf{\text{0x0000\_0000\_0000\_002A}}$
* **Signed Decimal Value**: $02A_{16} = (2 \times 16^1) + (10 \times 16^0) = 32 + 10 = \mathbf{+42_{10}}$

$$\text{Decoded Assembly Instruction 1: } \mathbf{\mathtt{addi \ x10, \ x11, \ 42}}$$

---

#### Step 2: Process Instruction 2 (`0xFE050513`)

##### 1. Binary Conversion:
Hexadecimal `0xFE050513` in 32-bit binary:

$$\text{Hex: } F \quad E \quad 0 \quad 5 \quad 0 \quad 5 \quad 1 \quad 3$$

$$\text{Binary: } 1111 \ 1110 \ 0000 \ 0101 \ 0000 \ 0101 \ 0001 \ 0011_2$$

##### 2. Format Identification & Field Extraction:
* `opcode = Instruction[6:0]` = `0010011_2` (`0x13` $\implies$ **I-Type `addi` Instruction**).
* `rd = Instruction[11:7]` = `01010_2` = **`10`** (`x10` / `a0`).
* `funct3 = Instruction[14:12]` = `000_2` = **`0`**.
* `rs1 = Instruction[19:15]` = `01010_2` = **`10`** (`x10` / `a0`).
* **Extract 12-Bit Immediate (`Instruction[31:20]`)**:

$$Imm12[11:0] = 1111 \ 1110 \ 0000_2 = \mathbf{\text{0xFE0}}$$

##### 3. Sign Bit Identification & 64-Bit Expansion:
* **Sign Bit $Imm12[11]$** = `Instruction[31]` = **`1`** (Negative number!).
* Since the sign bit is `1`, the SEU replicates `1` across all upper 52 output bits ($Imm64[63:12] \Leftarrow 1$):

$$Imm64[63:0] = 1111111111111111111111111111111111111111111111111111111000000000_2$$

* **64-Bit Hexadecimal Value**: $\mathbf{\text{0xFFFF\_FFFF\_FFFF\_FFE0}}$
* **Calculate Signed Decimal Value (Two's Complement)**:
  * Invert all bits: $0000 \ 0001 \ 1111_2 = \text{0x01F} = 31_{10}$.
  * Add $1$: $31 + 1 = 32$.
  * Apply negative sign: **$-32_{10}$**.

$$\text{Decoded Assembly Instruction 2: } \mathbf{\mathtt{addi \ x10, \ x10, \ -32}}$$

---

#### Step 3: Process Instruction 3 (`0xFE052523`)

##### 1. Binary Conversion:
Hexadecimal `0xFE052523` in 32-bit binary:

$$\text{Hex: } F \quad E \quad 0 \quad 5 \quad 2 \quad 5 \quad 2 \quad 3$$

$$\text{Binary: } 1111 \ 1110 \ 0000 \ 0101 \ 0010 \ 0101 \ 0010 \ 0011_2$$

##### 2. Format Identification & Field Extraction:
* `opcode = Instruction[6:0]` = `0100011_2` (`0x23` $\implies$ **S-Type Store Word `sw` Instruction**).
* `rs1 = Instruction[19:15]` = `01010_2` = **`10`** (`x10` / `a0` - Base Address).
* `rs2 = Instruction[24:20]` = `00000_2` = **`0`** (`x0` / `zero` - Data Value).
* `funct3 = Instruction[14:12]` = `010_2` = **`2`** (`sw`).
* **Re-assemble Split S-Type 12-Bit Immediate**:
  * Upper 7 bits `imm[11:5]` = `Instruction[31:25]` = `1111110_2` (`0x7E`).
  * Lower 5 bits `imm[4:0]` = `Instruction[11:7]` = `10100_2` (`0x14`).

```text
INSTRUCTION 3 SPLIT IMMEDIATE RE-ASSEMBLY

 imm[11:5] (Instruction[31:25])  ──► 1111110
 imm[4:0]  (Instruction[11:7])   ──►        10100
 ──────────────────────────────────────────────────
 Combined 12-Bit Immediate Imm12 ──► 111111010100_2 = 0xFD4
```

$$Imm12[11:0] = 1111 \ 1101 \ 0100_2 = \mathbf{\text{0xFD4}}$$

##### 3. Sign Bit Identification & 64-Bit Expansion:
* **Sign Bit $Imm12[11]$** = `Instruction[31]` = **`1`** (Negative number!).
* Replicate `1` across upper 52 output bits ($Imm64[63:12] \Leftarrow 1$):

$$Imm64[63:0] = 1111111111111111111111111111111111111111111111111111111111010100_2$$

* **64-Bit Hexadecimal Value**: $\mathbf{\text{0xFFFF\_FFFF\_FFFF\_FFD4}}$
* **Calculate Signed Decimal Value**:
  * Invert bits: $0000 \ 0010 \ 1011_2 = \text{0x02B} = 43_{10}$.
  * Add $1$: $43 + 1 = 44$.
  * Apply negative sign: **$-44_{10}$**.

$$\text{Decoded Assembly Instruction 3: } \mathbf{\mathtt{sw \ x0, \ -44(x10)}}$$

---

#### Step 4: Summary Table and Hardware Timing Closure Verification

Let us summarize the extracted fields and sign-extension outputs:

```text
SUMMARY OF EXTRACTED IMMEDIATES AND SIGN-EXTENSION OUTPUTS

 Metric / Field          │ Instruction 1           │ Instruction 2           │ Instruction 3
─────────────────────────┼─────────────────────────┼─────────────────────────┼─────────────────────────
 Raw Hex Instruction     │ 0x02A58513              │ 0xFE050513              │ 0xFE052523
 Format Type             │ I-Type (`addi`)         │ I-Type (`addi`)         │ S-Type (`sw`)
 Extracted Imm12 (Hex)   │ 0x02A                   │ 0xFE0                   │ 0xFD4
 Sign Bit (Bit 31)       │ 0 (Positive)            │ 1 (Negative)            │ 1 (Negative)
 Extended Imm64 (Hex)    │ 0x0000_0000_0000_002A   │ 0xFFFF_FFFF_FFFF_FFE0   │ 0xFFFF_FFFF_FFFF_FFD4
 Signed Decimal Value    │ +42                     │ -32                     │ -44
 Symbolic Assembly       │ addi x10, x11, 42       │ addi x10, x10, -32      │ sw x0, -44(x10)
```

##### SEU Fanout Timing Closure Verification:
Given:
* Register Clock-to-Q Delay: $t_{\text{C2Q}} = 30.0\text{ ps}$
* SEU 3-Stage Buffer Tree Delay: $t_{\text{buffer\_tree}} = 12.5\text{ ps}$
* ALU MUX Input Setup Time: $t_{\text{setup}} = 20.0\text{ ps}$

$$\text{Total SEU Propagation Delay } t_{\text{SEU}} = 30.0\text{ ps} + 12.5\text{ ps} + 20.0\text{ ps} = \mathbf{62.5 \text{ picoseconds}}$$

$$\text{Timing Slack} = T_{\text{clk}} - t_{\text{SEU}} = 312.5\text{ ps} - 62.5\text{ ps} = \mathbf{+250.0 \text{ picoseconds}}$$

The $62.5\text{-picosecond}$ Sign-Extension Unit path meets $3.2\text{-GHz}$ clock timing closure with a large positive slack margin of **$+250.0\text{ picoseconds}$**, confirming that Two's Complement sign extension executes asynchronously within a fraction of a single clock cycle.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Immediate Encoding**: The practice of storing hardcoded numeric constants directly inside designated bit fields of fixed-width instruction words (such as I-Type, S-Type, B-Type, U-Type, and J-Type formats), anchored by the Universal Sign Bit Invariant (`Instruction[31]`).
* **Sign-Extension Unit (SEU)**: An asynchronous combinational logic module containing high-drive buffer fanout trees that replicates the sign bit (`Instruction[31]`) across all upper bits of a wider output bus ($Imm64[63:12]$), preserving the exact Two's Complement mathematical value of negative and positive constants.
