---
title: "Pipelined Control Unit Synthesis and Control Bus Signal Propagation"
---

# Pipelined Control Unit Synthesis and Control Bus Signal Propagation

## The Control Timing Disconnect: Why Early Control Application Ruins Pipelines

Imagine an automated commercial bakery that manufactures custom layer cakes along a high-speed conveyor belt. The bakery has three sequential workstations arranged in a straight line: Station 1 mixes the raw cake batter, Station 2 bakes the cake in a high-temperature oven, and Station 3 applies chocolate frosting.

A new order card arrives at the front entrance of the bakery for a custom chocolate cake (`Instruction 1`). 

Standing at the front entrance is the Master Baker (**The Control Unit Decoder**). The Master Baker looks at the order card, reads the word "CHOCOLATE", and immediately presses the physical control buttons on the factory wall:
* He turns the mixer motor ON at Station 1.
* He sets the oven temperature to 350 degrees at Station 2.
* He presses the "SQUIRT CHOCOLATE FROSTING" button at Station 3!

```text
THE EARLY CONTROL APPLICATION DISASTER

 Master Baker (Decoder at Station 1) ──► Presses "SQUIRT FROSTING" Button NOW!
                                               │
                                               ▼
 Station 1 (Mixing Batter)    Station 2 (Baking)    Station 3 (Frosting)
 [ Raw Batter Mix ]           [ Vanilla Cake ]  ──► [ SQUIRT CHOCOLATE! ]
 (Cake 1 in Progress)                           (Squirted onto Cake 0 from earlier!)
```

Look at the physical disaster caused by the Master Baker pressing the frosting button immediately!
* Where is Cake 1 at 8:00 AM? It is sitting at Station 1, still being mixed as raw liquid batter!
* What is sitting at Station 3 at 8:00 AM? Station 3 is currently holding a vanilla cupcake from a completely different order (`Instruction 0`) that entered the factory 20 minutes ago!
* Pressing the frosting button immediately squirts chocolate frosting onto the vanilla cupcake of `Instruction 0`, completely ruining `Instruction 0`!
* Twenty minutes later, when Cake 1 finally arrives at Station 3, the frosting button is no longer being pressed, so Cake 1 leaves the factory completely unfrosted!

This bakery disaster is the exact physical reality of a **Pipelined Central Processing Unit (CPU)** if control signals are applied incorrectly.

In a 5-stage pipelined CPU, five different instructions sit inside the five execution stages (Instruction Fetch, Instruction Decode, Execute, Memory Access, and Writeback) simultaneously on the exact same clock cycle.

The central Control Unit decodes the instruction's operation code (opcode) during Stage 2 (**Instruction Decode - ID**).

If the Control Unit immediately asserts control signals like `RegWrite = 1` or `MemWrite = 1` during the ID stage:
* The write enable signal will instantly execute on **THIS** clock cycle!
* It will overwrite the destination register or memory location of whichever *earlier* instruction happens to be passing through the Writeback or Memory stage right now!
* Meanwhile, when the current instruction finally reaches the Writeback stage three clock cycles later, its control signal will be long gone, and its result will never be saved!

```text
CONTROL TIMING DISCONNECT IN PIPELINED HARDWARE

 Inst 1 Decoded in ID Stage (t = 0 ns) ──► Asserts RegWrite = 1 IMMEDIATELY!
                                                 │
                                                 ▼
 Stage 2: ID (Inst 1)     Stage 3: EX (Inst 0)    Stage 5: WB (Old Inst -1)
 [ Inst 1 Decoded ]       [ Inst 0 Executing ] ─► [ OVERWRITTEN BY INST 1! ]
```

To prevent this catastrophic control corruption, digital hardware cannot apply control signals the moment they are decoded.

Control signals decoded in the Instruction Decode (ID) stage MUST NOT be applied immediately. Instead, they must travel alongside the instruction data down the pipeline, stepping through interstage pipeline registers so that **each control signal arrives at its target hardware unit on the exact clock cycle that the instruction itself arrives at that unit.**

To achieve this perfect timing alignment, digital microarchitecture uses **Pipelined Control Bus Signal Propagation**.

---

## The Recipe Pouch on the Conveyor Belt: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how control signals travel alongside data through pipeline registers without corrupting earlier instructions, let us return to our automated cake factory.

The factory owner hires a systems engineer to fix the Master Baker's timing mistake. The engineer implements a simple physical rule: **The Master Baker is forbidden from pressing any buttons on the factory wall.**

Instead, the engineer attaches a small, clear plastic pouch to the front of every cake pan moving down the conveyor belt (**The Interstage Pipeline Register**).

```text
THE RECIPE POUCH ON THE CONVEYOR BELT

 Cake Pan 1 (Instruction Data) + Plastic Pouch (Pipelined Control Bus)
 ┌────────────────────────────────────────────────────────┐
 │ Cake Batter / Pan (Data: Operands, Addresses)         │
 ├────────────────────────────────────────────────────────┤
 │ Pouch: [ Yellow Slip ]  [ Red Slip ]  [ Blue Slip ]   │
 └────────────────────────────────────────────────────────┘
```

When a new order card (`Instruction 1`) arrives at the front entrance (Instruction Decode), the Master Baker reads the card and prints out three color-coded instruction slips:
* **Yellow Slip (Station 1 Instructions)**: Mixing speed and time for the EX stage.
* **Red Slip (Station 2 Instructions)**: Oven temperature for the MEM stage.
* **Blue Slip (Station 3 Instructions)**: Frosting type for the WB stage.

The Master Baker places all three slips into the cake pan's plastic pouch (**The ID/EX Pipeline Register**).

Now, let us trace how the cake pan and its recipe pouch travel down the conveyor belt across three time steps (clock cycles):

---

### Step 1: Station 1 (Mixing - EX Stage)
* Cake Pan 1 arrives at Station 1 carrying all three slips in its pouch.
* The worker at Station 1 opens the pouch, reads the **Yellow Slip**, sets the mixing speed, performs the mixing, and **throws the Yellow Slip in the trash**!
* The cake pan moves to Station 2 carrying only the **Red and Blue Slips** in its pouch (**The EX/MEM Pipeline Register**).

```text
STEP 1: STATION 1 CONSUMES YELLOW SLIP

 Station 1 Worker ──► Reads Yellow Slip ──► Mixes Batter!
                      Throws Yellow Slip Away!
                      Pouch now holds: [ Red Slip ] [ Blue Slip ]
```

---

### Step 2: Station 2 (Baking - MEM Stage)
* Cake Pan 1 arrives at Station 2.
* The worker at Station 2 opens the pouch, reads the **Red Slip**, sets the oven temperature to 350 degrees, bakes the cake, and **throws the Red Slip in the trash**!
* The cake pan moves to Station 3 carrying only the **Blue Slip** in its pouch (**The MEM/WB Pipeline Register**).

---

### Step 3: Station 3 (Frosting - WB Stage)
* Cake Pan 1 arrives at Station 3.
* The worker at Station 3 opens the pouch, reads the **Blue Slip**, squirts chocolate frosting onto Cake Pan 1, and throws the Blue Slip in the trash!
* The cake is $100\%$ completed and leaves the factory.

```text
STEP 3: STATION 3 CONSUMES BLUE SLIP (EXACT TIMING ALIGNMENT!)

 Station 3 Worker ──► Reads Blue Slip ──► Squirts Chocolate onto Cake 1!
                      (Applied on the EXACT SECOND Cake 1 arrived!)
```

Look at the physical perfection of this recipe pouch system:
1. **Zero Control Corruption**: Station 3 never squirted chocolate onto the vanilla cupcake from `Instruction 0`, because `Instruction 0` had its own separate Blue Slip in its own separate pouch!
2. **Perfect Timing Alignment**: Cake Pan 1 received chocolate frosting at the **exact second** it arrived at Station 3.
3. **Decentralized Execution**: The Master Baker decoded the order card only once at the beginning. The downstream stations simply read their assigned slip when the pan arrived.

This recipe pouch system is the exact physical analogue of **Pipelined Control Bus Signal Propagation**:
* The cake pan is the **Instruction Data (Operands, Immediate Values, Destination Addresses)**.
* The clear plastic pouch is the **Interstage Pipeline Register Array (`ID/EX`, `EX/MEM`, `MEM/WB`)**.
* The color-coded slips are the **Control Signal Bitfields (`ALUSrc`, `MemWrite`, `RegWrite`)**.
* Throwing a slip away after use is **Control Signal De-pipelining / Consumption**.

---

## Primitive 1: Pipelined Control Bus Propagation Mechanics

Now that we possess the intuitive mental model of recipe pouches traveling along a conveyor belt, let us examine the formal hardware architecture of **Pipelined Control Bus Signal Propagation**.

In a 5-stage pipelined CPU, the **Main Control Unit Decoder** sits in Stage 2 (**Instruction Decode - ID**). 

The Main Control Unit inspects the instruction's 7-bit opcode field ($\text{Inst}[6:0]$) and generates the complete set of control signals required for the instruction's entire lifetime across the EX, MEM, and WB stages.

However, instead of connecting those control wires directly to the hardware units, the control wires are connected to the $D$-inputs of the **ID/EX Pipeline Register Array**!

```text
PIPELINED CONTROL BUS SIGNAL PROPAGATION TOPOLOGY

 ID Stage               EX Stage               MEM Stage             WB Stage
 ┌──────────────┐       ┌──────────────┐       ┌─────────────┐       ┌─────────────┐
 │ Main Control │       │ Execution    │       │ Memory      │       │ Writeback   │
 │ Unit Decoder │       │ Units (ALU)  │       │ Units (DMem)│       │ Unit (RF)   │
 └──────┬───────┘       └──────▲───────┘       └──────▲──────┘       └──────▲──────┘
        │ Control Bus          │                      │                     │
        ▼                      │                      │                     │
 ┌──────────────┐       ┌──────┴───────┐       ┌──────┴──────┐       ┌──────┴──────┐
 │ ID/EX Control├──────►│ EX/MEM Ctrl  ├──────►│ MEM/WB Ctrl ├──────►│ RegWrite,   │
 │ Register Bus │       │ Register Bus │       │ Register Bus│       │ MemtoReg    │
 └──────────────┘       └──────────────┘       └─────────────┘       └─────────────┘
  (8 Control Bits)       (5 Control Bits)       (2 Control Bits)      (Consumed!)
```

---

### Grouping Control Signals by Target Execution Stage

To organize the control bus efficiently, we classify all generated control signals into three distinct functional groups based on the pipeline stage that will consume them:

#### 1. Execution Stage Control Group ($\mathbf{C}_{\text{EX}}$ — 3 Bits)
Control signals consumed during Stage 3 (Execute / ALU):
* `ALUSrc`: Selects Operand B for the main ALU ($0 = \text{Register } rs2$, $1 = \text{Sign-Extended Immediate}$).
* `ALUOp[1:0]`: 2-bit vector encoding the high-level ALU operation mode ($00 = \text{ADD}$, $01 = \text{SUB}$, $10 = \text{R-Type Decode}$).

#### 2. Memory Access Stage Control Group ($\mathbf{C}_{\text{MEM}}$ — 3 Bits)
Control signals consumed during Stage 4 (Memory Access):
* `MemRead`: Active-high Data Memory read enable.
* `MemWrite`: Active-high Data Memory write enable.
* `Branch`: Active-high conditional branch instruction indicator.

#### 3. Register Writeback Stage Control Group ($\mathbf{C}_{\text{WB}}$ — 2 Bits)
Control signals consumed during Stage 5 (Register Writeback):
* `RegWrite`: Active-high Register File write enable.
* `MemtoReg`: Selects Register File writeback source ($0 = \text{ALUResult}$, $1 = \text{Data Memory Read Data}$).

```text
CONTROL SIGNAL GROUPING TABLE

 Control Group │ Control Signal Name │ Target Stage │ Target Hardware Component Driven
───────────────┼─────────────────────┼──────────────┼────────────────────────────────────
     EX        │ ALUSrc              │ Stage 3 (EX) │ ALU Source Multiplexer
     EX        │ ALUOp[1:0]          │ Stage 3 (EX) │ ALU Control Unit Decoder
───────────────┼─────────────────────┼──────────────┼────────────────────────────────────
    MEM        │ MemRead             │ Stage 4 (MEM)│ Data Memory Read Enable Pin
    MEM        │ MemWrite            │ Stage 4 (MEM)│ Data Memory Write Enable Pin
    MEM        │ Branch              │ Stage 4 (MEM)│ Branch Decision AND Gate
───────────────┼─────────────────────┼──────────────┼────────────────────────────────────
     WB        │ RegWrite            │ Stage 5 (WB) │ Register File Write Enable Pin
     WB        │ MemtoReg            │ Stage 5 (WB) │ Mem-to-Reg Writeback Multiplexer
```

The total control vector $\mathbf{C}_{\text{total}}$ generated in the ID stage is the concatenation of all three groups:

$$
\mathbf{C}_{\text{total}} = \{ \mathbf{C}_{\text{EX}}, \, \mathbf{C}_{\text{MEM}}, \, \mathbf{C}_{\text{WB}} \} = \{ \text{ALUSrc}, \text{ALUOp}[1:0], \text{MemRead}, \text{MemWrite}, \text{Branch}, \text{RegWrite}, \text{MemtoReg} \}
$$

$$\text{Total Control Vector Width} = 1 + 2 + 1 + 1 + 1 + 1 + 1 = \mathbf{8 \text{ bits}}$$

---

## Primitive 2: Stage-by-Stage Control Signal De-pipelining & Consumption

Now let us trace how the 8-bit control vector $\mathbf{C}_{\text{total}}$ steps through the interstage pipeline registers and gets consumed stage-by-stage as an instruction travels down the pipeline.

```text
CONTROL BUS DE-PIPELINING FUNNEL

 ID Stage (Decoder Outputs 8 Bits)
  │
  ▼ Captured into ID/EX Register (8 Bits)
 [ ID_EX_ALUSrc, ID_EX_ALUOp[1:0] ] ──► CONSUMED BY EX STAGE! (3 Bits Dropped)
  │
  ▼ Remaining 5 Bits Captured into EX/MEM Register (5 Bits)
 [ EX_MEM_MemRead, EX_MEM_MemWrite, EX_MEM_Branch ] ──► CONSUMED BY MEM STAGE! (3 Bits Dropped)
  │
  ▼ Remaining 2 Bits Captured into MEM/WB Register (2 Bits)
 [ MEM_WB_RegWrite, MEM_WB_MemtoReg ] ──► CONSUMED BY WB STAGE! (2 Bits Dropped)
```

---

### Step-by-Step Control Propagation Lifecycle

#### 1. In Stage 2 (Instruction Decode - ID)
The Main Control Unit decodes $\text{Inst}[6:0]$ and outputs 8-bit vector $\mathbf{C}_{\text{total}}$.

On the rising clock edge (`posedge clk`), all 8 bits are captured into the **ID/EX Pipeline Register Array**:
* `ID_EX_ctrl_ex` $\Leftarrow \mathbf{C}_{\text{EX}}$ (3 bits)
* `ID_EX_ctrl_mem` $\Leftarrow \mathbf{C}_{\text{MEM}}$ (3 bits)
* `ID_EX_ctrl_wb` $\Leftarrow \mathbf{C}_{\text{WB}}$ (2 bits)

---

#### 2. In Stage 3 (Execute - EX)
The EX stage hardware reads its 3 control bits directly from the ID/EX register:
* `ID_EX_ctrl_ex.ALUSrc` drives the ALU Source MUX.
* `ID_EX_ctrl_ex.ALUOp[1:0]` drives the ALU Control Decoder.

**Consumption Event**: The 3 EX control bits have finished their physical job! They are **NOT** passed into the next pipeline register.

On the next rising clock edge (`posedge clk`), ONLY the remaining 5 control bits (MEM and WB groups) are captured into the **EX/MEM Pipeline Register Array**:
* `EX_MEM_ctrl_mem` $\Leftarrow$ `ID_EX_ctrl_mem` (3 bits)
* `EX_MEM_ctrl_wb` $\Leftarrow$ `ID_EX_ctrl_wb` (2 bits)

---

#### 3. In Stage 4 (Memory Access - MEM)
The MEM stage hardware reads its 3 control bits directly from the EX/MEM register:
* `EX_MEM_ctrl_mem.MemRead` drives the Data Memory read enable pin.
* `EX_MEM_ctrl_mem.MemWrite` drives the Data Memory write enable pin.
* `EX_MEM_ctrl_mem.Branch` drives the Branch Decision AND gate ($\text{PCSrc} = \text{Branch} \cdot \text{Zero}$).

**Consumption Event**: The 3 MEM control bits have finished their physical job! They are discarded.

On the next rising clock edge (`posedge clk`), ONLY the remaining 2 control bits (WB group) are captured into the **MEM/WB Pipeline Register Array**:
* `MEM_WB_ctrl_wb` $\Leftarrow$ `EX_MEM_ctrl_wb` (2 bits)

---

#### 4. In Stage 5 (Register Writeback - WB)
The WB stage hardware reads its 2 control bits directly from the MEM/WB register:
* `MEM_WB_ctrl_wb.MemtoReg` drives the Mem-to-Reg Writeback MUX.
* `MEM_WB_ctrl_wb.RegWrite` drives the Register File write enable pin ($\text{RegWrite}$) at address `MEM_WB_rd_addr`!

Look at the timing alignment of `RegWrite`:
> **`RegWrite` arrives at the Register File write enable pin on Stage 5 (WB) on the exact same clock cycle that the instruction's data result (`ALUResult` or `dmem_read_data`) arrives at the Register File write data port!**

The control signal and the data payload traveled side-by-side through four consecutive pipeline registers, arriving at the destination together with $100\%$ mathematical and temporal alignment.

---

## Mathematical Reduction of Control Bus Register Widths

By de-pipelining and consuming control bits stage-by-stage rather than carrying all bits to the end of the pipeline, we minimize the physical flip-flop count and silicon area of the interstage pipeline registers.

Let $W_{\text{ctrl}}(S)$ be the width in bits of the control bus stored inside the pipeline register preceding Stage $S$:

$$
W_{\text{ctrl}}(\text{ID/EX}) = W(\mathbf{C}_{\text{EX}}) + W(\mathbf{C}_{\text{MEM}}) + W(\mathbf{C}_{\text{WB}}) = 3 + 3 + 2 = \mathbf{8 \text{ bits}}
$$

$$
W_{\text{ctrl}}(\text{EX/MEM}) = W(\mathbf{C}_{\text{MEM}}) + W(\mathbf{C}_{\text{WB}}) = 3 + 2 = \mathbf{5 \text{ bits}}
$$

$$
W_{\text{ctrl}}(\text{MEM/WB}) = W(\mathbf{C}_{\text{WB}}) = \mathbf{2 \text{ bits}}
$$

```text
CONTROL BUS WIDTH REDUCTION ACROSS PIPELINE STAGES

 ID/EX Register  : [ EX Controls (3b) ] [ MEM Controls (3b) ] [ WB Controls (2b) ] = 8 Bits
 EX/MEM Register :                      [ MEM Controls (3b) ] [ WB Controls (2b) ] = 5 Bits
 MEM/WB Register :                                            [ WB Controls (2b) ] = 2 Bits
```

#### Silicon Area Savings Calculation:
If a 32-bit CPU carried all 8 control bits all the way to the MEM/WB register without de-pipelining, the EX/MEM and MEM/WB registers would require 16 flip-flops for control bits ($8 + 8 = 16$).

By de-pipelining control bits as they are consumed:
$$\text{Control Flip-Flops Used} = 8 \text{ (ID/EX)} + 5 \text{ (EX/MEM)} + 2 \text{ (MEM/WB)} = \mathbf{15 \text{ Flip-Flops}}$$

In larger, 64-bit processors with 40 control signals across 12 pipeline stages, control de-pipelining saves hundreds of flip-flops per core, reducing dynamic clock power and silicon die area.

---

## Hardware Realities: Pipeline Bubbles and Control Signal Flushing

In real-world microarchitectures, situations arise where an instruction currently traveling down the pipeline must be cancelled or held back.

For example:
1. **Branch Misprediction / Control Hazard**: A conditional branch instruction in the MEM stage evaluates as taken ($\text{PCSrc} = 1$). The instructions currently sitting in the IF, ID, and EX stages were fetched speculatively from the wrong path and MUST be cancelled!
2. **Load-Use Data Hazard**: A Load instruction in the EX stage is followed immediately by an instruction in the ID stage that needs the loaded data. The instruction in the ID stage MUST be stalled for one clock cycle.

How does a pipelined control unit cancel or stall an instruction in flight?

Does it need to wipe out the 32-bit data values (`rs1_data`, `rs2_data`, `imm32`) sitting in the pipeline registers?

**NO!** 

To cancel an instruction or insert a stall bubble into the pipeline, **the control unit simply sets all control bus bits to ZERO ($\mathbf{C} = \mathbf{0}$)**!

```text
PIPELINE BUBBLE INSERTION VIA CONTROL SIGNAL ZERO-FLUSHING

 Normal Control Vector : { ALUSrc=1, MemWrite=0, RegWrite=1 } ──► Valid Instruction
 Zero-Flushed Vector   : { ALUSrc=0, MemWrite=0, RegWrite=0 } ──► PIPELINE BUBBLE (NOP!)
                           (RegWrite=0 & MemWrite=0 guarantees ZERO hardware state change!)
```

---

### Why Setting Control Bits to Zero Creates a Safe "Pipeline Bubble" (NOP)

Look at what happens when a control vector is cleared to zero ($\mathbf{C} = \mathbf{0}$):
* `RegWrite = 0`: The Register File write enable pin is disabled. The instruction **cannot modify any user registers**.
* `MemWrite = 0`: The Data Memory write enable pin is disabled. The instruction **cannot modify any memory locations**.
* `MemRead = 0`: Data Memory read is disabled.

Even if the pipeline register still holds garbage data values in `rs1_data` or `alu_result`, because `RegWrite = 0` and `MemWrite = 0`, **the instruction is completely harmless!**

It travels down the remaining stages of the pipeline as an empty **Pipeline Bubble** (a No-Operation / `NOP`), consuming clock cycles without altering a single bit of register or memory state!

```systemverilog
// PIPELINE CONTROL FLUSH MULTIPLEXER (BUBBLE INSERTION)
// If flush_ex is High (e.g., branch misprediction), zero-out control bus!
assign id_ex_ctrl_final = (flush_ex) ? 8'b0000_0000 : id_ex_ctrl_decoded;
```

By placing a simple 2-to-1 multiplexer on the control bus that forces the control vector to `8'b0000_0000` when a flush signal is asserted, the control unit can safely purge invalid instructions in a single clock cycle!

---

## Solved Industrial Engineering Exercise: Integrated 5-Stage Pipelined Control Unit Subsystem

To consolidate your complete mastery of pipelined control unit synthesis, control bus propagation, stage-by-stage de-pipelining, control vector width accounting, and control bubble flushing, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are an ASIC microarchitect designing the **Pipelined Control Unit Subsystem** (`PipelinedControlSubsystem`) for a 32-bit RISC-V (RV32I) processor core.

The control unit must decode five instruction opcodes (`ADD`, `ADDI`, `LW`, `SW`, `BEQ`) and propagate control vectors across the `ID/EX`, `EX/MEM`, and `MEM/WB` interstage pipeline registers.

```text
PIPELINED CONTROL SUBSYSTEM INTERFACE

 Inst Opcode inst_opcode[6:0] ──┐
 Flush Signal flush_ex        ──┼──► [ PipelinedControlSubsystem ] ──┬──► EX Controls
 Master Clock clk, Reset rst  ──┘                                   ├──► MEM Controls
                                                                    └──► WB Controls
```

#### Control Vector Definitions:
* **EX Control Group (3 Bits)**: `ALUSrc` [2], `ALUOp[1:0]` [1:0].
* **MEM Control Group (3 Bits)**: `MemRead` [2], `MemWrite` [1], `Branch` [0].
* **WB Control Group (2 Bits)**: `RegWrite` [1], `MemtoReg` [0].

#### Physical Library Gate Delays (28nm CMOS Technology):
* Main Control Unit Decoder Delay: $t_{\text{dec}} = 0.42\text{ ns}$
* Control Pipeline Register Clock-to-Q Delay: $t_{\text{reg\_c2q}} = 0.22\text{ ns}$
* Control Pipeline Register Setup Time: $t_{\text{reg\_su}} = 0.15\text{ ns}$
* Flush MUX Delay: $t_{\text{mux\_flush}} = 0.18\text{ ns}$

#### Your Objective

1. Derive the 8-bit master control vector $\mathbf{C}_{\text{total}} = \{\text{EX}(3\text{b}), \text{MEM}(3\text{b}), \text{WB}(2\text{b})\}$ for all five instruction types (`ADD`, `ADDI`, `LW`, `SW`, `BEQ`).
2. Calculate the maximum propagation delay ($t_{\text{ctrl\_path}}$) of the control signal path from ID decode through the ID/EX pipeline register setup.
3. Write the complete, synthesizable SystemVerilog module `PipelinedControlSubsystem`.
4. Simulate and trace the propagated control vectors ($\mathbf{C}_{\text{EX}}$, $\mathbf{C}_{\text{MEM}}$, $\mathbf{C}_{\text{WB}}$) across 5 consecutive clock cycles for the program sequence:
   * **Cycle 1**: `LW  x1, 0(x2)` decoded in ID stage.
   * **Cycle 2**: `ADD x3, x1, x4` decoded in ID stage (`LW` moves to EX).
   * **Cycle 3**: `SW  x3, 4(x2)` decoded in ID stage (`ADD` in EX, `LW` in MEM).
   * **Cycle 4**: Flush Signal Asserted (`flush_ex = 1`)! `BEQ x1, x3, target` in ID stage gets converted to a CONTROL BUBBLE (`8'h00`) in ID/EX!
   * **Cycle 5**: Normal operation resumes (`LW` reaches WB stage, `RegWrite = 1` asserts!).
5. Verify structural, mathematical, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive the Master Control Vectors for All Instructions

We map the control bitfields $\{\text{EX}[2:0], \text{MEM}[2:0], \text{WB}[1:0]\}$ for each instruction:

* **R-Type (`ADD`)**:
  * EX: `ALUSrc = 0`, `ALUOp = 2'b10` $\implies \text{3'b010}$
  * MEM: `MemRead = 0`, `MemWrite = 0`, `Branch = 0` $\implies \text{3'b000}$
  * WB: `RegWrite = 1`, `MemtoReg = 0` $\implies \text{2'b10}$
  * **Master Vector $\mathbf{C}_{\text{ADD}}$**: `8'b010_000_10` ($\text{8'h42}$).

* **I-Type Arithmetic (`ADDI`)**:
  * EX: `ALUSrc = 1`, `ALUOp = 2'b10` $\implies \text{3'b110}$
  * MEM: `MemRead = 0`, `MemWrite = 0`, `Branch = 0` $\implies \text{3'b000}$
  * WB: `RegWrite = 1`, `MemtoReg = 0` $\implies \text{2'b10}$
  * **Master Vector $\mathbf{C}_{\text{ADDI}}$**: `8'b110_000_10` ($\text{8'hC2}$).

* **I-Type Load (`LW`)**:
  * EX: `ALUSrc = 1`, `ALUOp = 2'b00` $\implies \text{3'b100}$
  * MEM: `MemRead = 1`, `MemWrite = 0`, `Branch = 0` $\implies \text{3'b100}$
  * WB: `RegWrite = 1`, `MemtoReg = 1` $\implies \text{2'b11}$
  * **Master Vector $\mathbf{C}_{\text{LW}}$**: `8'b100_100_11` ($\text{8'h93}$).

* **S-Type Store (`SW`)**:
  * EX: `ALUSrc = 1`, `ALUOp = 2'b00` $\implies \text{3'b100}$
  * MEM: `MemRead = 0`, `MemWrite = 1`, `Branch = 0` $\implies \text{3'b010}$
  * WB: `RegWrite = 0`, `MemtoReg = 0` $\implies \text{2'b00}$
  * **Master Vector $\mathbf{C}_{\text{SW}}$**: `8'b100_010_00` ($\text{8'h88}$).

* **B-Type Branch (`BEQ`)**:
  * EX: `ALUSrc = 0`, `ALUOp = 2'b01` $\implies \text{3'b001}$
  * MEM: `MemRead = 0`, `MemWrite = 0`, `Branch = 1` $\implies \text{3'b001}$
  * WB: `RegWrite = 0`, `MemtoReg = 0` $\implies \text{2'b00}$
  * **Master Vector $\mathbf{C}_{\text{BEQ}}$**: `8'b001_001_00` ($\text{8'h24}$).

```text
MASTER CONTROL VECTOR SUMMARY MATRIX

 Instruction │ Opcode  │ EX Ctrl [7:5] │ MEM Ctrl [4:2] │ WB Ctrl [1:0] │ Hex Vector C_total
─────────────┼─────────┼───────────────┼────────────────┼───────────────┼────────────────────
   R-Type    │ 0110011 │   3'b010      │    3'b000      │    2'b10      │      8'h42
   ADDI (I)  │ 0010011 │   3'b110      │    3'b000      │    2'b10      │      8'hC2
   LW   (I)  │ 0000011 │   3'b100      │    3'b100      │    2'b11      │      8'h93
   SW   (S)  │ 0100011 │   3'b100      │    3'b010      │    2'b00      │      8'h88
   BEQ  (B)  │ 1100011 │   3'b001      │    3'b001      │    2'b00      │      8'h24
   BUBBLE    │ XXXXXXX │   3'b000      │    3'b000      │    2'b00      │      8'h00
```

---

#### Step 2: Calculate Control Propagation Path Delay ($t_{\text{ctrl\_path}}$)

Let us calculate the worst-case propagation delay from the ID stage instruction opcode through the Main Control Decoder, Flush MUX, and ID/EX Pipeline Register setup time:

$$
t_{\text{ctrl\_path}} = t_{\text{dec}} + t_{\text{mux\_flush}} + t_{\text{reg\_su}}
$$

Substituting the library delays:

$$
t_{\text{ctrl\_path}} = 0.42\text{ ns} + 0.18\text{ ns} + 0.15\text{ ns} = \mathbf{0.750 \text{ ns}}
$$

The entire control decoding and flushing path completes in **$0.750\text{ nanoseconds}$**, easily satisfying a $2.60\text{-ns}$ pipelined clock period with over $1.85\text{ ns}$ of positive timing slack!

---

#### Step 3: Write the Synthesizable SystemVerilog Module

We implement `PipelinedControlSubsystem` with interstage control registers and bubble flushing:

```systemverilog
`default_nettype none

// PIPELINED CONTROL SUBSYSTEM WITH STAGE DE-PIPELINING & FLUSHING
module PipelinedControlSubsystem (
    input  logic       clk,
    input  logic       reset_n,
    input  logic       flush_ex,           // Active-high flush for EX stage (Bubble)
    input  logic [6:0] inst_opcode,        // Opcode from IF/ID register (Inst[6:0])

    // Stage 3 (EX) Control Outputs
    output logic       ex_alu_src,
    output logic [1:0] ex_alu_op,

    // Stage 4 (MEM) Control Outputs
    output logic       mem_read,
    output logic       mem_write,
    output logic       mem_branch,

    // Stage 5 (WB) Control Outputs
    output logic       wb_reg_write,
    output logic       wb_mem_to_reg
);

    // 1. Decode Master Control Vector C_total in ID Stage
    logic [7:0] c_decoded;

    always_comb begin
        case (inst_opcode)
            7'b0110011: c_decoded = 8'h42; // R-Type (ADD)
            7'b0010011: c_decoded = 8'hC2; // I-Type (ADDI)
            7'b0000011: c_decoded = 8'h93; // Load (LW)
            7'b0100011: c_decoded = 8'h88; // Store (SW)
            7'b1100011: c_decoded = 8'h24; // Branch (BEQ)
            default:    c_decoded = 8'h00; // Default NOP Bubble
        endcase
    end

    // 2. Flush Multiplexer (Converts Instruction to Bubble if flush_ex == 1)
    logic [7:0] c_id_ex_in;
    assign c_id_ex_in = (flush_ex) ? 8'h00 : c_decoded;

    // -----------------------------------------------------------------
    // 3. ID/EX CONTROL PIPELINE REGISTER ARRAY (8 Bits Stored)
    // -----------------------------------------------------------------
    logic [7:0] id_ex_ctrl_reg;

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            id_ex_ctrl_reg <= 8'h00; // Reset to NOP Bubble
        end else begin
            id_ex_ctrl_reg <= c_id_ex_in;
        end
    end

    // EX Stage Control Outputs (Consumed in EX Stage!)
    assign ex_alu_src = id_ex_ctrl_reg[7];
    assign ex_alu_op  = id_ex_ctrl_reg[6:5];

    // -----------------------------------------------------------------
    // 4. EX/MEM CONTROL PIPELINE REGISTER ARRAY (5 Bits Stored)
    // -----------------------------------------------------------------
    logic [4:0] ex_mem_ctrl_reg;

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            ex_mem_ctrl_reg <= 5'h00; // Reset to NOP Bubble
        end else begin
            // Pass ONLY MEM [4:2] and WB [1:0] control groups forward!
            ex_mem_ctrl_reg <= id_ex_ctrl_reg[4:0];
        end
    end

    // MEM Stage Control Outputs (Consumed in MEM Stage!)
    assign mem_read  = ex_mem_ctrl_reg[4];
    assign mem_write = ex_mem_ctrl_reg[3];
    assign mem_branch= ex_mem_ctrl_reg[2];

    // -----------------------------------------------------------------
    // 5. MEM/WB CONTROL PIPELINE REGISTER ARRAY (2 Bits Stored)
    // -----------------------------------------------------------------
    logic [1:0] mem_wb_ctrl_reg;

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            mem_wb_ctrl_reg <= 2'h0; // Reset to NOP Bubble
        end else begin
            // Pass ONLY WB [1:0] control group forward!
            mem_wb_ctrl_reg <= ex_mem_ctrl_reg[1:0];
        end
    end

    // WB Stage Control Outputs (Consumed in WB Stage!)
    assign wb_reg_write  = mem_wb_ctrl_reg[1];
    assign wb_mem_to_reg = mem_wb_ctrl_reg[0];

endmodule

`default_nettype wire
```

---

#### Step 4: Simulate Multi-Instruction Pipeline Sequence Trace

Let us trace control signal propagation across 5 clock cycles for our program sequence:

```text
PIPELINED CONTROL BUS SIMULATION TRACE

 Clock Cycle │ Opcode in ID │ c_id_ex_in │ EX Ctrl (id_ex) │ MEM Ctrl (ex_mem) │ WB Ctrl (mem_wb) │ Active Control Action
─────────────┼──────────────┼────────────┼─────────────────┼───────────────────┼──────────────────┼───────────────────────────────────
   Cycle 1   │ 0000011 (LW) │    8'h93   │    3'b000 (0)   │      3'b000 (0)   │     2'b00 (0)    │ LW decoded in ID
   Cycle 2   │ 0110011 (ADD)│    8'h42   │    3'b100 (LW)  │      3'b000 (0)   │     2'b00 (0)    │ LW in EX (ALUSrc=1), ADD in ID
   Cycle 3   │ 0100011 (SW) │    8'h88   │    3'b010 (ADD) │      3'b100 (LW)  │     2'b00 (0)    │ LW in MEM (MemRead=1), ADD in EX
   Cycle 4   │ 1100011(BEQ) │    8'h00   │    3'b100 (SW)  │      3'b000 (ADD) │     2'b11 (LW)   │ LW in WB (RegWrite=1!), FLUSH!
             │ (FLUSH=1!)   │ (FLUSHED!) │                 │                   │                  │ BEQ in ID converted to BUBBLE!
   Cycle 5   │ 0000000 (NOP)│    8'h00   │    3'b000 (BUBB)│      3'b010 (SW)  │     2'b10 (ADD)  │ ADD in WB (RegWrite=1!), SW in MEM
```

```text
CONTROL SIGNAL TIMING WAVEFORMS

 clk            : 0000111100001111000011110000111100001111
                  ▲           ▲           ▲           ▲
                  │ Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4
                  │           │           │           │
 inst_opcode    : [ LW (0000011) ]─[ ADD (0110011) ]─[ SW (0100011) ]===
 id_ex_ctrl     : [ 8'h00        ]─[ 8'h93 (LW)    ]─[ 8'h42 (ADD)  ]===
 ex_mem_ctrl    : [ 5'h00        ]─────────[ 5 meb13 (LW)  ]─[ 5'h00 (ADD) ]===
 mem_wb_ctrl    : [ 2'h0         ]───────────────────[ 2'b11 (LW)   ]===
                                                         ▲
                                                         └── RegWrite=1 asserts in WB for LW!
```

##### Detailed Timing Trace Analysis:
1. **Cycle 1**: `LW` opcode (`7'b0000011`) decoded in ID stage. Master vector $\mathbf{C}_{\text{LW}} = \text{8'h93}$ generated.
2. **Cycle 2**: On `posedge clk`, `id_ex_ctrl_reg` captures `8'h93`.
   * EX stage reads `ex_alu_src = 1` (ALU input B = Immediate).
   * `ADD` instruction decoded in ID stage ($\mathbf{C}_{\text{ADD}} = \text{8'h42}$).
3. **Cycle 3**: On `posedge clk`, `ex_mem_ctrl_reg` captures lower 5 bits (`5'b100_11`).
   * MEM stage reads `mem_read = 1` (Data Memory read enabled!).
   * EX stage reads `ex_alu_src = 0` for `ADD`.
4. **Cycle 4**: On `posedge clk`, `mem_wb_ctrl_reg` captures lower 2 bits (`2'b11`).
   * WB stage reads `wb_reg_write = 1` and `wb_mem_to_reg = 1`.
   * **`RegWrite = 1` arrives at the Register File write port on Cycle 4, at the exact same clock edge that `LW`'s memory read data arrives at the writeback port!**
5. **Flush Execution in Cycle 4**: `flush_ex = 1` is asserted during `BEQ`.
   * MUX forces `c_id_ex_in = 8'h00`.
   * On Cycle 5, `id_ex_ctrl_reg` captures `8'h00` (NOP Bubble). The `BEQ` instruction is purged without corrupting any registers or memory!

---

### Sanity Check and Verification

Let us verify our pipelined control unit against all physical and microarchitectural requirements:

1. **Control Signal Alignment Check**:
   * `LW` decoded in ID on Cycle 1.
   * `ALUSrc = 1` active in EX on Cycle 2.
   * `MemRead = 1` active in MEM on Cycle 3.
   * `RegWrite = 1` and `MemtoReg = 1` active in WB on Cycle 4.
   * **Verification**: Every control signal arrived at its target stage on the exact required clock cycle with $100\%$ temporal precision.

2. **Control De-pipelining Verification**:
   * ID/EX register stored 8 control bits.
   * EX/MEM register stored 5 control bits.
   * MEM/WB register stored 2 control bits.
   * **Verification**: Control bus bit width narrowed progressively, saving flip-flop silicon area.

3. **Bubble Flushing Verification**:
   * `flush_ex = 1` converted the control vector to `8'h00`.
   * `RegWrite = 0` and `MemWrite = 0` ensured zero state changes occurred during the bubble cycle.
   * **Verification**: Pipeline flushing is $100\%$ safe.

All simulation steps, control vector truth tables, interstage register bitfield life cycles, and timing delay calculations evaluate with 100% mathematical, physical, and logical precision. The `PipelinedControlSubsystem` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Pipelined Control Bus Propagation**: The microarchitectural technique of piping decoded control signals alongside instruction data through interstage pipeline registers (`ID/EX`, `EX/MEM`, `MEM/WB`), ensuring that each control wire reaches its target execution unit on the exact clock cycle the instruction arrives.
* **Control Signal De-pipelining**: The stage-by-stage consumption and discarding of control bitfields as an instruction progresses down a pipeline (e.g., EX controls consumed at `ID/EX`, MEM controls at `EX/MEM`, WB controls at `MEM/WB`), reducing downstream pipeline register bit widths.
* **Control Bubble Flushing**: The hazard-mitigation technique of zeroing out the control bus vector ($\mathbf{C} = \mathbf{0}$) inside an interstage pipeline register to convert an in-flight instruction into a harmless, non-modifying No-Operation (NOP) bubble.
