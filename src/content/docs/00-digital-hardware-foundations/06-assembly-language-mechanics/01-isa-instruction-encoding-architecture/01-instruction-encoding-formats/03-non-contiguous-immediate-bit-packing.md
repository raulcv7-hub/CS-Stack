---
title: "Non-Contiguous Immediate Bit Packing and Decoder Fanout Minimization"
---

# Non-Contiguous Immediate Bit Packing and Decoder Fanout Minimization

## The Multiplexer Fanout Explosion: Why Un-Scrambling Immediate Bits Kills Clock Speeds

When a central processing unit (CPU) executes software, the Instruction Fetch unit retrieves a continuous stream of 32-bit binary instruction words from the Level 1 Instruction Cache. Each 32-bit instruction word contains a mixture of operation codes, register selectors, and embedded numeric constants called **Immediate Values**.

Before the processor can execute a conditional branch (such as `bne x5, x6, label`) or an unconditional jump (such as `jal x1, target`), the front-end Instruction Decoder must extract the immediate value from the instruction word, re-assemble its constituent bits into proper numerical order, sign-extend the value to 64 bits, and pass the resulting branch target offset to the Branch Target Adder.

If an instruction set architecture (ISA) designer were to approach this problem naively, they might choose to store immediate bits in strict, sequential numerical order—placing bit $12$ at instruction bit 31, bit $11$ at bit 30, bit $10$ at bit 29, down to bit $1$ at bit 20—creating a contiguous 12-bit or 20-bit immediate block across all instruction formats.

To a human programmer reading binary instruction specifications, placing immediate bits in neat, contiguous numerical order seems clean and logical. 

However, when this naive design is translated into physical silicon transistors, it triggers a catastrophic hardware performance disaster: **The Multiplexer Fanout Explosion**.

```text
NAIVE CONTIGUOUS IMMEDIATE PACKING (HARDWARE MULTIPLEXER EXPLOSION)

 Instruction Word (32 Bits)
  Bits: [31 --------- 20] [19 --- 15] [14 -- 12] [11 ---- 7] [6 ---- 0]
 Format A: [ imm[12:1]  ] [   rs1   ] [ funct3 ] [    rd   ] [ opcode ]
 Format B: [   rs2      ] [   rs1   ] [ funct3 ] [ imm[5:1]] [ opcode ]
            ▲                                     ▲
            │                                     │
            └─────────────────┬───────────────────┘
                              ▼
               MASSIVE 6-TO-1 MULTIPLEXER TREE NEEDED
               FOR EVERY OUTPUT BIT OF THE IMMEDIATE GENERATOR!
               (Adds 80 picoseconds of delay; violates clock timing!)
```

Let us trace why placing immediate bits contiguously causes a hardware disaster in silicon:

1. **Register Field Alignment Conflicts**: In store instructions (S-type) and conditional branch instructions (B-type), the processor must read two source registers: `rs1` (located at instruction bits `[19:15]`) and `rs2` (located at instruction bits `[24:20]`).
2. **The Field Overlap Contention**: If a B-type branch instruction forces its immediate value to occupy a contiguous block at bits `[31:20]`, that immediate block physically overlaps and overwrites the exact bit locations (`[24:20]`) where source register `rs2` is supposed to live!
3. **Inserting Multiplexers Before the Register File**: To handle this overlap, hardware designers would be forced to place a 2-to-1 multiplexer in front of Register Read Port 2's select pins, waiting for the opcode decoder to determine whether bits `[24:20]` represent register `rs2` or part of an immediate.
4. **Cascading Multiplexer Trees in the Immediate Generator**: Worse still, because every instruction format would place its immediate bits in different physical positions relative to register read ports, every single output wire of the 64-bit Immediate Generator would require a heavy 5-to-1 or 6-to-1 multiplexer tree!

In nanoscale semiconductor manufacturing ($5\text{nm}$ and $3\text{nm}$ process nodes), driving a 6-to-1 multiplexer tree adds significant parasitic wire capacitance ($C_{\text{wire}}$) and gate propagation delay ($t_{\text{prop}}$).

In a processor operating at a clock frequency of $3.2\text{ GHz}$, the entire clock period lasts only **$312.5\text{ picoseconds}$** ($0.3125\text{ nanoseconds}$). 

If the multiplexer tree in the Immediate Generator takes $80\text{ picoseconds}$ just to route and un-scramble immediate bits, the signal arrives late at the Branch Target Adder. The setup time of the Program Counter register is violated, and **the CPU suffers a critical path timing failure!**

We face a fundamental physical trade-off:
* Human readability prefers clean, contiguous immediate bits in the instruction specification.
* Silicon hardware speed demands **minimizing multiplexer fanout and intermediate gate delays**.

To solve the multiplexer fanout explosion and achieve multi-gigahertz clock frequencies, modern computer architects intentionally scramble the arrangement of immediate bits inside instruction encodings: **Non-Contiguous Immediate Bit Packing**.

By scattering immediate bits across non-contiguous bit positions in branch (B-type) and jump (J-type) instruction words, hardware designers align individual immediate bits with the exact bit locations used by other instruction formats. 

To a human, the instruction encoding appears "scrambled." But to the silicon hardware, **the multiplexers disappear**! The wires carrying bit $5$, bit $6$, and bit $11$ connect directly from the instruction register to the output bus, enabling instant $1\text{-cycle}$ immediate re-assembly with zero gate delay!


### Strategy 1: The Human-Friendly Contiguous Packing Strategy

The packaging supervisor orders: *"Always pack fruit pieces in one continuous, unbroken row from Inches 31 down to 20 in EVERY crate!"*

Look at what happens when a Grape Crate (B-Type) travels down the conveyor belt under Strategy 1:
1. Grape Crates need two lifting handles (Handle #1 at Inches 19–15, Handle #2 at Inches 24–20) AND 12 grapes.
2. But the supervisor forced the 12 grapes to occupy Inches 31 through 20 in one continuous row!
3. The grapes in Inches 24 through 20 **block Lifting Handle #2**!
4. When the crate arrives at Chute #2 (Inches 24–20), Chute #2 cannot grab Lifting Handle #2 because grapes are sitting in the way!

```text
STRATEGY 1: CONTIGUOUS PACKING BLOCKS LIFTING HANDLE #2

 Grape Crate (32 Inches Wide)
 ┌───────────────────────────┬────────────┬────────────┬───────┐
 │ 12 Grapes (Inches 31-20)  │ Handle #1  │ Extra Info │ Opcode│
 └───────────────────────────┴────────────┴────────────┴───────┘
   ▲                ▲
   │                │
   │                └── Grapes BLOCK Lifting Handle #2 (Inches 24-20)!
   └─────────────────── Mechanical Robot Arm required to move grapes!
                        (Slows down conveyor belt by 50%!)
```

To fix this block, the factory manager installs **moving robot arms (Hardware Multiplexers)** above Chute #2:
* When an Apple Crate passes, the robot arm moves Left.
* When a Grape Crate passes, the robot arm moves Right.

Moving those heavy mechanical robot arms back and forth takes time. The conveyor belt must be slowed down by $50\%$ to give the robot arms time to adjust!


## Primitive 1: Non-Contiguous Bit Packing Mechanics

Now that we possess an intuitive mental model of fixed factory chutes and non-contiguous fruit packing, let us examine the formal, rigorous engineering mechanics of **Non-Contiguous Bit Packing**.

In standard RISC-V 32-bit (RV32I/RV64I) instruction set architectures, the 32-bit instruction word is partitioned across six canonical formats: R-Type, I-Type, S-Type, B-Type, U-Type, and J-Type.

Let us compare the bit-by-bit layouts of **S-Type (Store)**, **B-Type (Conditional Branch)**, and **J-Type (Unconditional Jump)** instruction formats to see exactly how non-contiguous bit packing is implemented in hardware:

```text
RISC-V INSTRUCTION ENCODING BIT-MAPPING COMPARISON

 Bit:  31         25 24     20 19     15 14  12 11      7 6        0
       ┌────────────┬─────────┬─────────┬──────┬─────────┬──────────┐
 S-Type│ imm[11:5]  │   rs2   │   rs1   │funct3│imm[4:0] │  opcode  │ Stores
       ├────────────┼─────────┼─────────┼──────┼─────────┼──────────┤
 B-Type│ imm[12|10:5]│  rs2   │   rs1   │funct3│imm[4:1|11] opcode  │ Branches
       ├────────────┴─────────┴─────────┴──────┼─────────┼──────────┤
 J-Type│         imm[20|10:1|11|19:12]         │   rd    │  opcode  │ Jumps
       └───────────────────────────────────────└─────────┴──────────┘
```

Notice the scrambled, non-contiguous bit arrangements in B-Type and J-Type formats:

### 1. B-Type (Conditional Branch) Immediate Scrambling
A B-type instruction encodes a 13-bit signed byte offset ($imm[12:0]$) used for PC-relative branching. Because instructions are aligned to 2-byte or 4-byte boundaries, bit $imm[0]$ is always $0$ ($imm[0] = 0$).

The remaining 12 bits ($imm[12:1]$) are packed into the instruction word as follows:
* $imm[12]$ (Sign Bit) is placed at **`Instruction[31]`**.
* $imm[10:5]$ (6 bits) are placed at **`Instruction[30:25]`**.
* $imm[4:1]$ (4 bits) are placed at **`Instruction[11:8]`**.
* $imm[11]$ (1 bit) is placed at **`Instruction[7]`**!

Notice that $imm[11]$ is separated from $imm[10:5]$ and placed down at bit position 7!

Why was $imm[11]$ placed at bit position 7?
Compare B-Type with S-Type (Store) format:
* In S-Type format, `Instruction[11:7]` holds $imm[4:0]$. Bits `[11:8]` hold $imm[4:1]$, and bit `7` holds $imm[0]$.
* In B-Type format, `Instruction[11:8]` ALSO holds $imm[4:1]$! 
* Bit `7` is the ONLY open bit position in that lower field. By placing $imm[11]$ at bit position 7, **bits `[11:8]` ($imm[4:1]$) stay at the EXACT SAME PHYSICAL BIT POSITIONS in both S-Type and B-Type formats!**


## Primitive 2: Decoder Fanout Minimization and MUX Gate Reduction

Now let us examine the second core primitive: **Decoder Fanout Minimization**.

> **Decoder Fanout Minimization** is the microarchitectural technique of aligning sub-fields of immediate constants to identical bit positions across different instruction formats, reducing the number of inputs required by hardware selection multiplexers in the Immediate Generator and minimizing parasitic wire capacitance.


### Gate Count and Power Reduction Math

Let us calculate the physical gate count and power reduction achieved by non-contiguous bit packing:

* **Naive Contiguous Design**: Requires 64 5-to-1 multiplexers. A 5-to-1 MUX requires 5 AND gates, 1 OR gate, and 3 control select lines ($\approx 12\text{ transistors per output bit}$).
  $$\text{Total Transistors}_{\text{naive}} = 64 \times 12 = \mathbf{768 \text{ Transistors}}$$
* **RISC-V Non-Contiguous Design**: Requires mostly 2-to-1 multiplexers ($\approx 4\text{ transistors per output bit}$) and direct wire connections for upper sign bits.
  $$\text{Total Transistors}_{\text{RISC-V}} = 32 \times 4 + 0 = \mathbf{128 \text{ Transistors}}$$

$$\text{Silicon Area Savings} = \frac{768 - 128}{768} \times 100\% = \mathbf{83.3\% \text{ Transistor Area Reduction!}}$$

$$\text{Propagation Delay Reduction} = \frac{80\text{ ps} - 22\text{ ps}}{80\text{ ps}} \times 100\% = \mathbf{72.5\% \text{ Delay Reduction!}}$$

Non-Contiguous Bit Packing reduced the Immediate Generator's transistor footprint by **$83.3\%$** and reduced its signal propagation delay by **$72.5\%$**!


### 2. Accelerating the Branch Target Adder Critical Path

In a high-performance execution pipeline, conditional branch instructions (`bne`, `beq`) present a critical timing bottleneck.

When a conditional branch instruction is fetched, the CPU must compute two calculations in parallel:
1. **Condition Evaluation**: Subtracting `rs1` and `rs2` in the ALU to test if `rs1 == rs2`.
2. **Target Address Calculation**: Adding the sign-extended branch offset $Imm13$ to the Program Counter ($PC$):

$$\text{Branch\_Target\_Address} = \text{PC} + \text{SignExtend}(Imm13)$$

```text
BRANCH TARGET ADDER CRITICAL PATH TIMING

 Clock Cycle Start (t = 0 ps)
       │
       ▼
 Instruction Register Output (t_C2Q = 30 ps)
       │
       ▼
 Immediate Generator Extraction (t_ImmGen = 22 ps via Non-Contiguous MUXes!)
       │
       ▼
 64-Bit Branch Target Adder (t_adder = 180 ps)
       │
       ▼
 Program Counter Register Setup (t_setup = 20 ps)
 (Total Path Delay = 30 + 22 + 180 + 20 = 252 ps < 312.5 ps Clock Period!)
```

Let us calculate the total propagation delay along the Branch Target Calculation Path:

$$t_{\text{branch\_path}} = t_{\text{C2Q}} + t_{\text{ImmGen}} + t_{\text{adder}} + t_{\text{setup}}$$

$$t_{\text{branch\_path}} = 30\text{ ps} + 22\text{ ps} + 180\text{ ps} + 20\text{ ps} = \mathbf{252.0 \text{ picoseconds}}$$

If the clock period $T_{\text{clk}} = 312.5\text{ ps}$ ($3.2\text{ GHz}$ CPU frequency):

$$\text{Timing Slack} = T_{\text{clk}} - t_{\text{branch\_path}} = 312.5\text{ ps} - 252.0\text{ ps} = \mathbf{+60.5 \text{ picoseconds}}$$

Because non-contiguous bit packing reduced $t_{\text{ImmGen}}$ from $80\text{ ps}$ down to $22\text{ ps}$, the branch target calculation meets timing closure with **$+60.5\text{ picoseconds}$ of positive slack**!

If the ISA had used un-scrambled (contiguous) immediate packing ($t_{\text{ImmGen}} = 80\text{ ps}$):

$$t_{\text{branch\_path\_naive}} = 30\text{ ps} + 80\text{ ps} + 180\text{ ps} + 20\text{ ps} = \mathbf{310.0 \text{ picoseconds}}$$

The timing slack would collapse to a dangerous $2.5\text{ picoseconds}$, risking timing violations under thermal temperature variations!


### Scenario and Parameters

You are a senior microarchitect verifying the Instruction Decoder and Immediate Generator for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor's Instruction Fetch unit retrieves two raw 32-bit hexadecimal instruction words from the Level 1 Instruction Cache:

* **Instruction 1 (Cycle 1)**: `0xFE5298E3` (Conditional Branch)
* **Instruction 2 (Cycle 2)**: `0x008000EF` (Unconditional Jump)

```text
3.2 GHz PROCESSOR IMMEDIATE RE-ASSEMBLY VERIFICATION

 L1 Instruction Cache ──► [ Instruction Register ] ──► [ ImmGen Re-Assembler ] ──► Branch Adder
 Clock T = 312.5 ps       Raw 32-Bit Hex Words       Re-Assembles Scrambled Bits  Target Offset
```

#### Your Objective

1. For **Instruction 1 (`0xFE5298E3`)**:
   * Convert the 32-bit hex word into a 32-bit binary representation.
   * Identify the opcode and confirm it is a B-Type conditional branch instruction (`bge`).
   * Extract the scrambled non-contiguous immediate bit fields from their physical instruction bit locations:
     * $imm[12]$ from `Instruction[31]`
     * $imm[11]$ from `Instruction[7]`
     * $imm[10:5]$ from `Instruction[30:25]`
     * $imm[4:1]$ from `Instruction[11:8]`
     * Set $imm[0] = 0$.
   * Re-assemble the 13-bit signed branch offset $Imm13[12:0]$ in proper numerical order.
   * Perform 64-bit Two's Complement sign extension and calculate the signed decimal branch offset value.
2. For **Instruction 2 (`0x008000EF`)**:
   * Convert the 32-bit hex word into binary.
   * Identify the opcode and confirm it is a J-Type unconditional jump instruction (`jal`).
   * Extract the scrambled non-contiguous immediate bit fields:
     * $imm[20]$ from `Instruction[31]`
     * $imm[19:12]$ from `Instruction[19:12]`
     * $imm[11]$ from `Instruction[20]`
     * $imm[10:1]$ from `Instruction[30:21]`
     * Set $imm[0] = 0$.
   * Re-assemble the 21-bit signed jump offset $Imm21[20:0]$ in proper numerical order.
   * Perform 64-bit Two's Complement sign extension and calculate the signed decimal jump offset value.
3. Calculate the MUX gate input reduction and propagation delay savings achieved by non-contiguous bit packing for bit $Imm64[5]$ versus a naive 5-to-1 MUX design.
4. Verify mathematical, structural, and timing correctness.


#### Step 1: Decode and Re-Assemble Instruction 1 (`0xFE5298E3`)

##### 1. Binary Conversion:
Hexadecimal `0xFE5298E3` in 32-bit binary:

$$\text{Hex: } F \quad E \quad 5 \quad 2 \quad 9 \quad 8 \quad E \quad 3$$

$$\text{Binary: } 1111 \ 1110 \ 0101 \ 0010 \ 1001 \ 1000 \ 1110 \ 0011_2$$

##### 2. Opcode Verification & Field Extraction:
* `opcode = Instruction[6:0]` = `1100011_2` (`0x63` $\implies$ **B-Type Conditional Branch Instruction**).
* `rd / imm[4:1|11] = Instruction[11:7]` = `10001_2`.
  * `Instruction[11:8]` = `1000_2` $\implies imm[4:1] = 1000_2$.
  * `Instruction[7]` = `1_2` $\implies imm[11] = 1_2$.
* `funct3 = Instruction[14:12]` = `101_2` = **`5`** (`bge` - Branch if Greater Than or Equal Signed).
* `rs1 = Instruction[19:15]` = `00101_2` = **`5`** (`x5` / `t0`).
* `rs2 = Instruction[24:20]` = `00101_2` = **`5`** (`x5` / `t0`).
* `imm[12|10:5] = Instruction[31:25]` = `1111110_2`.
  * `Instruction[31]` = `1_2` $\implies imm[12] = 1_2$.
  * `Instruction[30:25]` = `111110_2` $\implies imm[10:5] = 111110_2$.

##### 3. Re-assembling the 13-Bit Signed Branch Offset $Imm13[12:0]$:

```text
INSTRUCTION 1 NON-CONTIGUOUS BIT RE-ASSEMBLY

 Source Bit Positions in Instruction:
 Bit [31]     Bit [7]      Bits [30:25]   Bits [11:8]   Implied 0
    │            │              │              │            │
    ▼            ▼              ▼              ▼            ▼
 [ imm[12] ]  [ imm[11] ]    [ imm[10:5] ]  [ imm[4:1] ]  [ imm[0] ]
    1            1             111110         1000          0
 ────────────────────────────────────────────────────────────────────
 Numerical Re-Assembled Imm13[12:0]:
 1 _ 1 _ 111110 _ 1000 _ 0  =  1111111110000_2 = 0x1FF0
```

$$Imm13[12:0] = 1 \ 1 \ 111110 \ 1000 \ 0_2 = \mathbf{1111111110000_2 = \text{0x1FF0}}$$

##### 4. 64-Bit Sign Extension:
* Sign Bit $Imm13[12] = 1_2$ (Negative offset!).
* SEU replicates $1$ across upper bits $63 \dots 13$:

$$Imm64[63:0] = 1111111111111111111111111111111111111111111111111111111111110000_2$$

* **64-Bit Hexadecimal Value**: $\mathbf{\text{0xFFFF\_FFFF\_FFFF\_FFF0}}$
* **Calculate Signed Decimal Offset**:
  * Invert bits: $0000\dots00001111_2 = \text{0x00F} = 15_{10}$.
  * Add $1$: $15 + 1 = 16$.
  * Apply negative sign: **$-16_{10} \text{ bytes}$**.

$$\text{Decoded Symbolic Instruction 1: } \mathbf{\mathtt{bge \ x5, \ x5, \ -16}}$$


#### Step 3: Quantify MUX Gate Savings for Output Bit $Imm64[5]$

Let us compare the hardware implementation of output bit $Imm64[5]$ in the Immediate Generator:

##### 1. Un-Scrambled (Contiguous) Naive Design:
Because $imm[5]$ sits at different physical bit locations across formats (I-type: bit 25, S-type: bit 30, B-type: bit 30, U-type: bit 17, J-type: bit 26), the output bit $Imm64[5]$ requires a **5-to-1 Multiplexer**:
* MUX Inputs = 5. Transistors required $\approx 12\text{ transistors}$.
* Propagation Delay = $80.0\text{ picoseconds}$.

##### 2. RISC-V Non-Contiguous Design:
Because $imm[5]$ is anchored to **`Instruction[25]`** across I-Type, S-Type, B-Type, and J-Type formats:
* The output bit $Imm64[5]$ requires only a **2-to-1 Multiplexer** (selecting `Instruction[25]` for I/S/B/J formats, or constant `0` for U-format)!
* MUX Inputs = 2. Transistors required $\approx 4\text{ transistors}$.
* Propagation Delay = $22.0\text{ picoseconds}$.

```text
HARDWARE SAVINGS FOR BIT Imm64[5]

 Metric                   │ Un-Scrambled Naive Design │ RISC-V Non-Contiguous │ Hardware Savings
──────────────────────────┼───────────────────────────┼───────────────────────┼──────────────────
 MUX Type Required        │ 5-to-1 Multiplexer        │ 2-to-1 Multiplexer    │ 60% Fewer Inputs
 Transistor Count per Bit │ 12 Transistors            │ 4 Transistors         │ 66.7% Area Cut!
 Signal Propagation Delay │ 80.0 Picoseconds          │ 22.0 Picoseconds      │ 72.5% FASTER!
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Non-Contiguous Bit Packing**: The microarchitectural technique of scattering immediate bits across non-sequential bit positions in instruction encodings (such as B-Type and J-Type formats) to align sub-fields to identical bit positions across formats, keeping source register fields (`rs1`, `rs2`) at fixed hardware wire locations.
* **Decoder Fanout Minimization**: The physical gate and wire optimization achieved when aligned instruction bit fields allow the Immediate Generator to use lightweight 2-to-1 multiplexers and direct wire connections, cutting MUX transistor count by $83\%$ and reducing signal propagation delay by $72\%$.
