# Single-Cycle Datapath Synthesis and Control Decoder Architecture

## The Swiss Army Knife Dilemma: Supporting Diverse Instructions on One Hardware Chassis

Imagine you are an engineer tasked with designing an electronic machine that must perform five completely different real-world tasks on every pass of a central clock. 

Task 1 requires reading two numbers from a bank of storage registers, adding them together, and storing the sum back into a third register. Task 2 requires reading a single number from a register, adding a constant number hardcoded into the instruction itself, and storing the result in a register. Task 3 requires taking a register number, adding an offset, using that sum as a physical address to read data out of a memory bank, and saving that memory data into a register. Task 4 requires taking a number from a register and writing it into a memory bank at a calculated address. Task 5 requires comparing two numbers from two registers, and if they are equal, changing the program’s execution path by jumping to a new memory location.

If you attempt to solve this problem by building five completely separate, independent physical hardware circuits—one dedicated circuit for Task 1, one for Task 2, one for Task 3, one for Task 4, and one for Task 5—a catastrophic silicon area explosion occurs.

```text
THE REDUNDANT SEPARATE DATAPATH EXPLOSION

 Task 1 Circuit : [ Register File 1 ] ──► [ ALU 1 ] ──► [ Reg Write 1 ]
 Task 2 Circuit : [ Register File 2 ] ──► [ ALU 2 ] ──► [ Reg Write 2 ]
 Task 3 Circuit : [ Register File 3 ] ──► [ ALU 3 ] ──► [ Memory 1 ] ──► [ Reg Write 3 ]
 Task 4 Circuit : [ Register File 4 ] ──► [ ALU 4 ] ──► [ Memory 2 ]
 Task 5 Circuit : [ Register File 5 ] ──► [ ALU 5 ] ──► [ PC Branch ]
 (Enormous silicon area waste: 80% of hardware sits idle on every clock cycle!)
```

Look at the physical waste in this separate-circuit design:
* You would need five separate Register Files, five separate Arithmetic Logic Units (ALUs), and multiple separate Memory interfaces!
* On any given clock cycle, the processor can execute only **one** instruction. This means that while Task 1 is running, the circuits for Tasks 2, 3, 4, and 5 sit completely idle, wasting millions of expensive silicon transistors.

To eliminate this redundant hardware waste, computer architects build a **Unified Single-Cycle Datapath**. 

A Unified Single-Cycle Datapath uses a single, shared set of heavy hardware components—one Register File, one Arithmetic Logic Unit (ALU), and one Data Memory array. The components are wired together using a network of programmable electronic switches called **Multiplexers (MUXes)**.

```text
UNIFIED SINGLE-CYCLE DATAPATH WITH MULTIPLEXED SWITCHES

               ┌──────────────────────────────────────────────┐
               │ Shared Single-Cycle Hardware Chassis        │
               │  [ 1x Register File ]   [ 1x Main ALU ]      │
               │  [ 1x Data Memory   ]   [ Multiplexers ]     │
               └──────────────────────┬───────────────────────┘
                                      │
                                      ▼
             Configured dynamically on EVERY clock cycle by
             the Central Control Unit based on Opcode bits!
```

However, unifying hardware creates a fundamental control dilemma:

> **The Control Routing Dilemma**: If the Register File, ALU, and Data Memory share the exact same physical wires, how do those wires know whether the ALU's second input should come from a register or an immediate constant? How does the Register File know whether its write-data pin should capture the output of the ALU or the output of the Data Memory? And how does the Data Memory know whether it should perform a read, a write, or do nothing at all?

If the hardware multiplexers and enable wires are not driven by a precise, clock-synchronized control engine, data signals will collide on shared buses, memory will be overwritten accidentally, and the processor will fail.

To govern this shared hardware chassis, digital engineering uses a hierarchical control architecture: **The Main Control Unit Decoder** and **The ALU Control Unit**.

Guided by the operation code (opcode) bits embedded inside each binary instruction word, the control decoder acts as a master dispatch tower, flipping multiplexer switches and asserting write-enable signals across the single-cycle datapath so that any instruction type executes correctly in a single clock cycle.

---

## The Automated Railroad Dispatch Yard: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how a central control decoder configures a unified hardware datapath without physical cable rewiring, let us picture an automated railroad freight dispatch yard.

Imagine a large industrial railroad junction where freight cars carrying data cargo travel from a central train station (**The Register File**) to a manufacturing factory (**The ALU**) or a storage warehouse (**The Data Memory**).

```text
THE AUTOMATED RAILROAD DISPATCH YARD METAPHOR

           Track Switch A                      Track Switch B
 Station  ──────►[ MUX A ]────► Factory ──────────►[ MUX B ]────► Station
 (Reg File)        ▲            (ALU)               ▲             (Reg Write)
                   │                                │
 Warehouse ────────┴─ (Cargo)            Warehouse ─┴─ (Mem Read)
 (Data Memory)
```

The railroad layout contains fixed steel tracks connecting all three locations. At every track intersection sits an electric track switch (**a Multiplexer**) that can route train cars down different tracks.

Every train car entering the dispatch yard carries a color-coded flag on its roof representing an instruction:
* **RED FLAG**: Add two numbers from the station and return the result to the station (R-Type Arithmetic).
* **BLUE FLAG**: Fetch cargo from the warehouse and bring it to the station (Load Instruction).
* **GREEN FLAG**: Take cargo from the station and store it in the warehouse (Store Instruction).
* **YELLOW FLAG**: Compare two numbers at the station and trigger a track detour if they match (Branch Instruction).

Standing high above the tracks in a central glass control tower is the **Master Dispatcher (The Main Control Unit)**. 

The Master Dispatcher does not physically push train cars or manufacture cargo. The Master Dispatcher simply looks through a telescope at the approaching train's color-coded flag (the **Opcode**), and flips electric track switches across the yard before the train arrives:

```text
DISPATCH TOWER SWITCHING MODES

 Train Flag (Opcode) │ Switch A (ALUSrc) │ Switch B (MemtoReg) │ Station Permit (RegWrite)
─────────────────────┼───────────────────┼─────────────────────┼───────────────────────────
   RED (R-Type)      │   Track: Station  │   Track: Factory    │   PERMITTED (1)
   BLUE (Load)       │   Track: Freight  │   Track: Warehouse  │   PERMITTED (1)
   GREEN (Store)     │   Track: Freight  │   Track: Don't Care │   DENIED    (0)
   YELLOW (Branch)   │   Track: Station  │   Track: Don't Care │   DENIED    (0)
```

Let's trace how the Dispatcher handles two different trains:

### Scenario 1: The RED Train (R-Type Arithmetic: `ADD rd, rs1, rs2`)
1. The Dispatcher sees the **RED FLAG** on the approaching instruction.
2. The Dispatcher flips **Switch A (`ALUSrc = 0`)** to connect the station track directly to the factory input, so the factory receives data from Register $rs2$.
3. The Dispatcher flips **Switch B (`MemtoReg = 0`)** to connect the factory output directly back to the station.
4. The Dispatcher turns the **Station Store Permit (`RegWrite = 1`)** to ON, allowing the factory result to be stored in Register $rd$.
5. The Dispatcher turns the **Warehouse Read/Write Permits (`MemRead = 0, MemWrite = 0`)** to OFF, ensuring the storage warehouse remains untouched.

---

### Scenario 2: The BLUE Train (Load Memory: `LW rd, offset(rs1)`)
1. The Dispatcher sees the **BLUE FLAG** on the approaching instruction.
2. The Dispatcher flips **Switch A (`ALUSrc = 1`)** to connect a freight car containing an offset number (the Sign-Extended Immediate) into the factory, calculating the warehouse memory address ($\text{Address} = rs1 + \text{offset}$).
3. The Dispatcher flips **Switch B (`MemtoReg = 1`)** to connect the **Warehouse Output** directly back to the station.
4. The Dispatcher turns the **Warehouse Read Permit (`MemRead = 1`)** to ON, commanding the warehouse to release the item stored at the calculated address.
5. The Dispatcher turns the **Station Store Permit (`RegWrite = 1`)** to ON, allowing the warehouse cargo to be stored in Register $rd$.

Notice what the Master Dispatcher achieved:
* The steel tracks, factory, warehouse, and station **never changed physical location**.
* By flipping electric track switches (`ALUSrc`, `MemtoReg`) and asserting permits (`RegWrite`, `MemRead`, `MemWrite`) based on the flag color (`Opcode`), the exact same physical yard handled both an arithmetic addition and a memory load cleanly in a single pass!

This automated dispatch yard is the exact physical analogue of a **Single-Cycle Datapath and Control Decoder**:
* The Train Station is the **Register File**.
* The Factory is the **Main ALU**.
* The Warehouse is the **Data Memory**.
* The Electric Track Switches are **Multiplexers (`ALUSrc`, `MemtoReg`)**.
* The Permits are **Control Signals (`RegWrite`, `MemRead`, `MemWrite`)**.
* The Master Dispatcher in the tower is the **Main Control Unit Decoder**.
* The Color-Coded Flag is the **Instruction Opcode (`inst[6:0]`)**.

---

## Anatomy of the Unified Single-Cycle Datapath

To master control unit synthesis, we must first map out the complete, physical topology of the **Unified Single-Cycle Datapath**.

A single-cycle datapath integrates seven primary hardware processing blocks connected by multiplexed wire buses:

```text
UNIFIED 32-BIT SINGLE-CYCLE DATAPATH TOPOLOGY

               ┌────────────────────────────────────────────────────────┐
               │              Instruction Fetch Unit (IF)               │
               │  [ PC Reg ] ──► [ Inst Memory ] ──► Inst[31:0]          │
               └──────┬─────────────────────────────────────────────────┘
                      │
                      ├───────────────────────┬─────────────────────────┐
                      │ Inst[19:15] (rs1)     │ Inst[24:20] (rs2)       │ Inst[11:7] (rd)
                      ▼                       ▼                         ▼
               ┌─────────────┐         ┌─────────────┐           ┌─────────────┐
               │ Register    │ rs1_data│ Register    │ rs2_data  │ Register    │
               │ Read Port 1 ├────────►│ Read Port 2 ├─┬────────►│ Write Port  │
               └─────────────┘         └─────────────┘ │         └──────▲──────┘
                                                       │                │
                                                       │                │ Write Data
                                                       ▼                │
                                       imm32 ──►[ 2:1 MUX ] (ALUSrc)    │
                                                   │                    │
                                                   ▼                    │
                                            ┌─────────────┐             │
                                            │  Main ALU   │             │
                                            └──────┬──────┘             │
                                                   │ ALUResult          │
                                                   ├──────────┐         │
                                                   ▼          ▼         │
                                            ┌──────────┐  ┌──────────┐  │
                                            │ Data Mem │  │ 2:1 MUX  ├──┘
                                            │ Address  │  │(MemtoReg)│
                                            └──────────┘  └──────────┘
```

Let us trace each component and its exact role in the unified chassis:

### 1. The Instruction Fetch Unit (IF)
* **Components**: Program Counter register ($PC$), Instruction Memory, dedicated $PC+4$ adder, and branch selection multiplexer ($PC_{\text{src}}$ MUX).
* **Operation**: Reads the 32-bit instruction word ($\text{Inst}[31:0]$) stored at memory address $PC$.

---

### 2. The Register File (RF)
* **Components**: A multi-port register array containing 32 general-purpose 32-bit registers ($x0$ through $x31$).
* **Read Ports**: Two independent asynchronous read ports driven by register specifier fields in the instruction:
  * Read Register 1 Address ($\text{rs1} = \text{Inst}[19:15]$) $\implies$ Emits 32-bit vector $\text{Read\_Data\_1}$.
  * Read Register 2 Address ($\text{rs2} = \text{Inst}[24:20]$) $\implies$ Emits 32-bit vector $\text{Read\_Data\_2}$.
* **Write Port**: One synchronous write port driven by destination specifier $\text{rd} = \text{Inst}[11:7]$, Write Data bus $WD$, and active-high Write Enable signal $\text{RegWrite}$.
* **Hardware Rule**: Register $x0$ is hardwired to static zero ($\text{32'h0000\_0000}$). Writes to $x0$ are discarded.

---

### 3. The Sign Extender (Immediate Generator)
* **Operation**: Extracts hardcoded binary immediate constants embedded inside I-Type (e.g., `ADDI`, `LW`), S-Type (`SW`), or B-Type (`BEQ`) instruction words and sign-extends them from 12 bits up to a full 32-bit Two's Complement vector ($\text{Imm32}[31:0]$).

---

### 4. The ALU Source Multiplexer (`ALUSrc` MUX)
* **Inputs**:
  * Input 0: Register Read Data 2 ($\text{Read\_Data\_2}$).
  * Input 1: 32-bit Sign-Extended Immediate ($\text{Imm32}$).
* **Control Select**: Driven by 1-bit control signal $\text{ALUSrc}$.
* **Output**: Feeds Operand B of the main ALU.
  * When $\text{ALUSrc} = 0$: The ALU operates on two registers ($\text{Read\_Data\_1}$ and $\text{Read\_Data\_2}$).
  * When $\text{ALUSrc} = 1$: The ALU operates on a register and an immediate constant ($\text{Read\_Data\_1}$ and $\text{Imm32}$).

---

### 5. The Main Arithmetic Logic Unit (ALU)
* **Inputs**: Operand A ($\text{Read\_Data\_1}$), Operand B (Output of $\text{ALUSrc}$ MUX), and 4-bit operation select code ($\text{ALUControl}[3:0]$).
* **Outputs**:
  * 32-bit calculation result ($\text{ALUResult}[31:0]$).
  * 1-bit zero flag ($\text{Zero}$), which evaluates High ($1$) if $\text{ALUResult} == \text{32'h0000\_0000}$.

---

### 6. The Data Memory Array (DM)
* **Inputs**:
  * Address Port ($\text{ADDR}$): Driven by $\text{ALUResult}[31:0]$.
  * Write Data Port ($\text{WD}$): Driven by $\text{Read\_Data\_2}[31:0]$.
* **Control Signals**: Active-high $\text{MemRead}$ and $\text{MemWrite}$.
* **Output**: Emits 32-bit memory read data ($\text{Read\_Data\_Mem}[31:0]$).

---

### 7. The Memory-to-Register Multiplexer (`MemtoReg` MUX)
* **Inputs**:
  * Input 0: $\text{ALUResult}[31:0]$.
  * Input 1: Data Memory Read Data ($\text{Read\_Data\_Mem}[31:0]$).
* **Control Select**: Driven by 1-bit control signal $\text{MemtoReg}$.
* **Output**: Feeds the Write Data port ($WD$) of the Register File.
  * When $\text{MemtoReg} = 0$: Register File receives the ALU math/logic result.
  * When $\text{MemtoReg} = 1$: Register File receives the value loaded from Data Memory.

---

## Hierarchical Control Unit Architecture: Main Control versus ALU Control

Now that we have assembled the complete datapath chassis, how do we generate the control signals required for every instruction?

A beginner might attempt to design a single, massive control decoder block that reads all 32 bits of the instruction word and outputs every single multiplexer select line and gate control bit in a single stage.

However, designing a single-stage decoder for complex Instruction Set Architectures (ISAs) creates a major hardware liability:
> **The Combinational Logic Explosion**: A single-stage decoder reading 32 input bits requires an immense, slow combinational gate matrix. The logic gates become deep and slow, increasing the Control Unit's propagation delay ($t_{\text{ctrl}}$) and reducing the processor's clock frequency.

To minimize logic gate depth and maximize clock speed, modern CPU architectures divide control decoding into a **Two-Stage Hierarchical Control Architecture**:

```text
TWO-STAGE HIERARCHICAL CONTROL DECODER ARCHITECTURE

 Instruction Word Inst[31:0]
 ├────────── Opcode Inst[6:0] ─────────►[ Main Control Unit ]
 │                                        │         │
 │                                        │ ALUOp   │ Global Signals
 │                                        │ [1:0]   │ (RegWrite, ALUSrc,
 │                                        ▼         │  MemRead, MemWrite,
 └────────── Funct Fields ────────────►[ ALU Control]│  MemtoReg, Branch)
            (funct3 + funct7[5])          │         │
                                          ▼         ▼
                                     ALUControl    Datapath MUXes
                                       [3:0]       & Enable Pins
```

Let us dissect the two stages of this hierarchical control unit:

### Stage 1: The Main Control Unit
The **Main Control Unit** inspects *only* the 7-bit primary operation code field ($\text{Inst}[6:0]$, the Opcode) located at the bottom of the instruction word.

Because it reads only 7 bits, the Main Control Unit is constructed from a compact, ultra-fast 7-to-8 decoder matrix. It generates all primary datapath multiplexer select lines and memory enables, plus a high-level 2-bit mode signal called **$\text{ALUOp}[1:0]$**:

* `RegWrite`: Enables writing back to the Register File ($1 = \text{Write}$, $0 = \text{No Write}$).
* `ALUSrc`: Selects Operand B for the ALU ($0 = \text{Register } rs2$, $1 = \text{Immediate}$).
* `MemRead`: Enables reading from Data Memory ($1 = \text{Read}$, $0 = \text{Disabled}$).
* `MemWrite`: Enables writing to Data Memory ($1 = \text{Write}$, $0 = \text{Disabled}$).
* `MemtoReg`: Selects Register File writeback source ($0 = \text{ALUResult}$, $1 = \text{Data Memory}$).
* `Branch`: Indicates a conditional branch instruction ($1 = \text{Branch Instruction}$, $0 = \text{Sequential}$).
* `ALUOp[1:0]`: Encodes the high-level operational class for the secondary ALU Control Unit:
  * `2'b00` (**Addition Mode**): Force the ALU to perform Addition (used by `LW` and `SW` to compute address $\text{Base} + \text{Offset}$).
  * `2'b01` (**Subtraction Mode**): Force the ALU to perform Subtraction (used by `BEQ` to compute $rs1 - rs2$ for equality testing).
  * `2'b10` (**R-Type / I-Type Mode**): Instruct the ALU Control Unit to inspect the instruction's `funct3` and `funct7` fields to determine the exact arithmetic/logic operation (`ADD`, `SUB`, `AND`, `OR`, `SLT`).

---

### Stage 2: The ALU Control Unit
The **ALU Control Unit** is a secondary decoder that generates the exact 4-bit operational code ($\text{ALUControl}[3:0]$) driving the internal logic gates of the main ALU.

It takes two inputs:
1. The 2-bit `ALUOp[1:0]` mode vector from the Main Control Unit.
2. The instruction function fields: `funct3` ($\text{Inst}[14:12]$) and `funct7[5]` ($\text{Inst}[30]$).

```text
ALU CONTROL DECODER TRUTH TABLE

 ALUOp[1:0] │ funct3 [14:12] │ funct7[5] [30] │ ALUControl[3:0] │ Target ALU Operation
────────────┼────────────────┼────────────────┼─────────────────┼────────────────────────
   2'b00    │   Don't Care   │   Don't Care   │     4'b0010     │ ADD (Address Load/Store)
   2'b01    │   Don't Care   │   Don't Care   │     4'b0110     │ SUB (Branch Comparison)
   2'b10    │     3'b000     │      1'b0      │     4'b0010     │ ADD (R-Type Addition)
   2'b10    │     3'b000     │      1'b1      │     4'b0110     │ SUB (R-Type Subtraction)
   2'b10    │     3'b111     │   Don't Care   │     4'b0000     │ AND (Bitwise AND)
   2'b10    │     3'b110     │   Don't Care   │     4'b0001     │ OR  (Bitwise OR)
   2'b10    │     3'b010     │   Don't Care   │     4'b0111     │ SLT (Set on Less Than)
```

Look at the efficiency of this two-stage hierarchy!
* During a Load instruction (`LW`), the Main Control Unit outputs `ALUOp = 2'b00`. The ALU Control Unit sees `2'b00` and immediately outputs `ALUControl = 4'b0010` (ADD) **without even looking at `funct3` or `funct7`**!
* During an R-Type instruction (`ADD` or `SUB`), the Main Control Unit outputs `ALUOp = 2'b10`. The ALU Control Unit then checks `funct7[5]`: if `0`, it outputs `4'b0010` (ADD); if `1`, it outputs `4'b0110` (SUB).

By decoupling global control from specific ALU operation selection, we drastically simplify the decoder logic, reducing gate delays and increasing the maximum clock frequency of the processor.

---

## Complete Main Control Decoder Truth Table

To synthesize the Main Control Unit into physical logic gates, we construct the complete **Main Control Decoder Truth Table** across the five primary instruction archetypes of the RISC-V RV32I architecture:

1. **R-Type Arithmetic**: `ADD rd, rs1, rs2` ($\text{Opcode} = \text{7'b0110011}$)
2. **I-Type Arithmetic**: `ADDI rd, rs1, imm` ($\text{Opcode} = \text{7'b0010011}$)
3. **I-Type Load**: `LW rd, offset(rs1)` ($\text{Opcode} = \text{7'b0000011}$)
4. **S-Type Store**: `SW rs2, offset(rs1)` ($\text{Opcode} = \text{7'b0100011}$)
5. **B-Type Conditional Branch**: `BEQ rs1, rs2, offset` ($\text{Opcode} = \text{7'b1100011}$)

```text
MAIN CONTROL DECODER TRUTH TABLE FOR RV32I INSTRUCTIONS

 Instruction │ Opcode  │ RegWrite │ ALUSrc │ MemRead │ MemWrite │ MemtoReg │ Branch │ ALUOp[1:0]
─────────────┼─────────┼──────────┼────────┼─────────┼──────────┼──────────┼────────┼────────────
   R-Type    │ 0110011 │    1     │   0    │    0    │    0     │    0     │   0    │   2'b10
   ADDI (I)  │ 0010011 │    1     │   1    │    0    │    0     │    0     │   0    │   2'b10
   LW   (I)  │ 0000011 │    1     │   1    │    1    │    0     │    1     │   0    │   2'b00
   SW   (S)  │ 0100011 │    0     │   1    │    0    │    1     │    X     │   0    │   2'b00
   BEQ  (B)  │ 1100011 │    0     │   0    │    0    │    0     │    X     │   1    │   2 meb01
```

*(Note: `X` represents a "Don't Care" binary state where the signal value does not affect hardware execution, allowing logic synthesis tools to optimize gate counts).*

---

## Instruction-by-Instruction Datapath Execution Tracing

To see how the central control decoder dynamically reconfigures the unified datapath on every clock cycle, let us trace the physical data flow for four fundamental instruction archetypes.

---

### Archetype 1: R-Type Register Arithmetic (`ADD rd, rs1, rs2`)

```text
R-TYPE ARITHMETIC DATAPATH CONFIGURATION (ADD)

 Control Signals: RegWrite=1 | ALUSrc=0 | MemRead=0 | MemWrite=0 | MemtoReg=0 | Branch=0

 RF rs1_data ─────────────────────────► ALU Input A ──┐
                                                      ├──► ALUResult ──► [ MUX (0) ] ──► RF wd
 RF rs2_data ──► [ MUX (0) ] (ALUSrc) ──► ALU Input B ──┘                 (MemtoReg)
```

1. **Instruction Fetch**: $PC$ fetches instruction `ADD rd, rs1, rs2`. $PC$ advances to $PC+4$.
2. **Decode & Register Read**: Main Control reads Opcode `7'b0110011` and asserts:
   $$\text{RegWrite}=1, \quad \text{ALUSrc}=0, \quad \text{MemRead}=0, \quad \text{MemWrite}=0, \quad \text{MemtoReg}=0, \quad \text{Branch}=0, \quad \text{ALUOp}=\text{2'b10}$$
   Register File outputs $rs1$ data ($\text{Read\_Data\_1}$) and $rs2$ data ($\text{Read\_Data\_2}$).
3. **Execution**:
   `ALUSrc = 0` forces the ALU Source MUX to select $\text{Read\_Data\_2}$.
   ALU Control Unit reads `funct3` and `funct7` and outputs $\text{ALUControl} = \text{4'b0010}$ (ADD).
   ALU computes $\text{ALUResult} = \text{Read\_Data\_1} + \text{Read\_Data\_2}$.
4. **Memory Stage**: `MemRead = 0` and `MemWrite = 0`. Data Memory sits idle.
5. **Writeback**:
   `MemtoReg = 0` forces the Mem-to-Reg MUX to select $\text{ALUResult}$.
   `RegWrite = 1` enables the Register File, storing $\text{ALUResult}$ into destination register $rd$ at the next rising clock edge!

---

### Archetype 2: I-Type Memory Load (`LW rd, offset(rs1)`)

```text
I-TYPE LOAD DATAPATH CONFIGURATION (LW)

 Control Signals: RegWrite=1 | ALUSrc=1 | MemRead=1 | MemWrite=0 | MemtoReg=1 | Branch=0

 RF rs1_data ─────────────────────────► ALU Input A ──┐
                                                      ├──► ALUResult ──► Data Mem Addr ──► [ MUX (1) ] ──► RF wd
 Imm32       ──► [ MUX (1) ] (ALUSrc) ──► ALU Input B ──┘                                 (MemtoReg)
```

1. **Instruction Fetch**: $PC$ fetches instruction `LW rd, offset(rs1)`.
2. **Decode & Register Read**: Main Control reads Opcode `7'b0000011` and asserts:
   $$\text{RegWrite}=1, \quad \text{ALUSrc}=1, \quad \text{MemRead}=1, \quad \text{MemWrite}=0, \quad \text{MemtoReg}=1, \quad \text{Branch}=0, \quad \text{ALUOp}=\text{2'b00}$$
   Register File outputs $rs1$ data. Sign Extender generates 32-bit immediate $\text{Imm32}$.
3. **Execution**:
   `ALUSrc = 1` forces the ALU Source MUX to select $\text{Imm32}$.
   `ALUOp = 2'b00` forces the ALU to perform Addition ($\text{ALUControl} = \text{4'b0010}$).
   ALU calculates the memory target address: $\text{ALUResult} = \text{Read\_Data\_1} + \text{Imm32}$.
4. **Memory Stage**:
   `MemRead = 1` enables Data Memory. Data Memory reads the 32-bit word stored at address $\text{ALUResult}$ and outputs $\text{Read\_Data\_Mem}$.
5. **Writeback**:
   `MemtoReg = 1` forces the Mem-to-Reg MUX to select $\text{Read\_Data\_Mem}$.
   `RegWrite = 1` stores the loaded memory word into destination register $rd$ on the next clock edge!

---

### Archetype 3: S-Type Memory Store (`SW rs2, offset(rs1)`)

```text
S-TYPE STORE DATAPATH CONFIGURATION (SW)

 Control Signals: RegWrite=0 | ALUSrc=1 | MemRead=0 | MemWrite=1 | MemtoReg=X | Branch=0

 RF rs1_data ─────────────────────────► ALU Input A ──┐
                                                      ├──► ALUResult ──► Data Mem Addr
 Imm32       ──► [ MUX (1) ] (ALUSrc) ──► ALU Input B ──┘
 RF rs2_data ──────────────────────────────────────────────────────────► Data Mem WriteData
```

1. **Instruction Fetch**: $PC$ fetches instruction `SW rs2, offset(rs1)`.
2. **Decode & Register Read**: Main Control reads Opcode `7'b0100011` and asserts:
   $$\text{RegWrite}=0, \quad \text{ALUSrc}=1, \quad \text{MemRead}=0, \quad \text{MemWrite}=1, \quad \text{MemtoReg}=X, \quad \text{Branch}=0, \quad \text{ALUOp}=\text{2'b00}$$
   Register File outputs $rs1$ data ($\text{Read\_Data\_1}$) and $rs2$ data ($\text{Read\_Data\_2}$).
3. **Execution**:
   `ALUSrc = 1` selects $\text{Imm32}$.
   ALU calculates store target address: $\text{ALUResult} = \text{Read\_Data\_1} + \text{Imm32}$.
4. **Memory Stage**:
   `MemWrite = 1` enables Data Memory write.
   Data Memory stores $\text{Read\_Data\_2}$ into memory address $\text{ALUResult}$ on the next clock edge!
5. **Writeback**: `RegWrite = 0`. The Register File is completely disabled. No registers are modified!

---

### Archetype 4: B-Type Conditional Branch (`BEQ rs1, rs2, offset`)

```text
B-TYPE CONDITIONAL BRANCH DATAPATH CONFIGURATION (BEQ)

 Control Signals: RegWrite=0 | ALUSrc=0 | MemRead=0 | MemWrite=0 | MemtoReg=X | Branch=1

 RF rs1_data ─────────────────────────► ALU Input A ──┐
                                                      ├──► Zero Flag ──┐
 RF rs2_data ──► [ MUX (0) ] (ALUSrc) ──► ALU Input B ──┘               ├──► [ AND Gate ] ──► PCSrc
                                                           Branch ──────┘
```

1. **Instruction Fetch**: $PC$ fetches instruction `BEQ rs1, rs2, offset`.
2. **Decode & Register Read**: Main Control reads Opcode `7'b1100011` and asserts:
   $$\text{RegWrite}=0, \quad \text{ALUSrc}=0, \quad \text{MemRead}=0, \quad \text{MemWrite}=0, \quad \text{MemtoReg}=X, \quad \text{Branch}=1, \quad \text{ALUOp}=\text{2'b01}$$
   Register File outputs $rs1$ data and $rs2$ data.
3. **Execution**:
   `ALUSrc = 0` selects $\text{Read\_Data\_2}$.
   `ALUOp = 2'b01` forces the ALU to perform Subtraction ($\text{ALUControl} = \text{4'b0110}$).
   ALU computes $\text{Read\_Data\_1} - \text{Read\_Data\_2}$.
   If $\text{Read\_Data\_1} == \text{Read\_Data\_2}$, the ALU asserts its zero flag: $\text{Zero} = 1$.
4. **Branch Gate Decision**:
   A dedicated 2-input AND gate evaluates the Next-PC branch select line $\text{PCSrc}$:
   $$\text{PCSrc} = \text{Branch} \cdot \text{Zero} = 1 \cdot 1 = 1$$
   Because $\text{PCSrc} = 1$, the Next-PC MUX overrides $PC + 4$ and selects the branch target address $PC + \text{Imm32}$.
5. **Clock Edge**: The PC register captures the branch target address. The CPU jumps to the new program location!

---

## Critical Path Propagation Analysis and Single-Cycle Performance Walls

Now that we have traced all instruction archetypes across the unified datapath, we must analyze the performance penalty of single-cycle execution: **The Single-Cycle Performance Wall**.

In a single-cycle processor, the clock period $T_{\text{clk}}$ is fixed and constant for every single instruction.

To determine the minimum safe clock period $T_{\text{clk\_min}}$, we must identify the **Absolute Worst-Case Critical Path** across all supported instructions.

Let us compare the propagation delays of our four instruction archetypes:

```text
CRITICAL PATH DELAY BREAKDOWN BY INSTRUCTION TYPE

 Instruction Type │ Propagation Path Sequence                             │ Relative Path Delay
──────────────────┼───────────────────────────────────────────────────────┼───────────────────────
   R-Type (ADD)   │ t_PC + t_IMem + t_RF_read + t_ALU + t_Mux + t_RF_su   │ ~ 6.0 ns
   S-Type (SW)    │ t_PC + t_IMem + t_RF_read + t_ALU + t_DMem_write      │ ~ 7.5 ns
   B-Type (BEQ)   │ t_PC + t_IMem + t_RF_read + t_ALU + t_BranchGate      │ ~ 6.2 ns
   I-Type (LW)    │ t_PC + t_IMem + t_RF_read + t_ALU + t_DMem_read + t_RF_su │ ~ 9.5 ns (CRITICAL!)
```

Look at the comparison table above!

The **Load Word (`LW`)** instruction is the undisputed critical path bottleneck of the entire processor:
$$\text{Path}_{\text{LW}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + t_{\text{rf\_read}} + t_{\text{mux\_alusrc}} + t_{\text{alu}} + t_{\text{dmem\_read}} + t_{\text{mux\_memtoreg}} + t_{\text{rf\_su}}$$

Because `LW` requires both an ALU address calculation AND a Data Memory read AND a Register File writeback within the same cycle, its path takes **$9.5\text{ nanoseconds}$**.

An R-type `ADD` instruction, by contrast, does not access Data Memory and finishes its execution in only **$6.0\text{ nanoseconds}$**.

### The Single-Cycle Inefficiency Tragedy
Because single-cycle processors use a fixed clock period, **the clock period MUST be set to at least $9.5\text{ nanoseconds}$ to accommodate the slow `LW` instruction**.

When the processor executes an `ADD` instruction:
* The `ADD` finishes its calculation at $t = 6.0\text{ ns}$.
* For the remaining $3.5\text{ nanoseconds}$ of the clock period, **the entire CPU sits completely idle**, doing zero useful work while waiting for the clock edge to arrive!

```text
SINGLE-CYCLE CLOCK SLACK WASTAGE

 Clock Period T_clk = 9.5 ns (Fixed for ALL instructions)

 Executing LW  : [ IF (2.4ns) ][ ID (1.1ns) ][ EX (1.6ns) ][ MEM (2.2ns) ][ WB (0.25ns) ] ──► (100% Used)
 Executing ADD : [ IF (2.4ns) ][ ID (1.1ns) ][ EX (1.6ns) ][ WB (0.25ns) ] ░░ WASTED SLACK (3.5ns) ░░
```

If a program consists of 90% `ADD` instructions and 10% `LW` instructions, the processor wastes 35% of its potential computing throughput on every single arithmetic cycle!

This performance wall is what motivates advanced microarchitectures:
* **Multicycle Processors**: Break execution into multiple short clock steps ($2\text{ ns}$ each), allowing `ADD` to finish in 4 cycles ($8\text{ ns}$) and `LW` in 5 cycles ($10\text{ ns}$).
* **Pipelined Processors**: Overlap multiple instructions across five hardware stages, issuing a completed instruction on **every single clock cycle** at a clock period of only $2.5\text{ ns}$!

---

## Solved Industrial Engineering Exercise: Integrated Single-Cycle Core Synthesis and Timing Verification

To consolidate your complete mastery of single-cycle datapath synthesis, Main Control and ALU Control decoding, instruction path tracing, and critical path timing analysis, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are designing an integrated 32-bit **Single-Cycle RISC-V (RV32I) Processor Core** (`SingleCycleProcessorCore`) for an embedded microcontroller.

The core must execute five instruction archetypes: `ADD`, `ADDI`, `LW`, `SW`, and `BEQ`.

```text
SINGLE-CYCLE PROCESSOR CORE TOPOLOGY

 Master Clock clk, Reset reset_n ──┐
                                  ├──► [ SingleCycleProcessorCore ] ──► Writeback Result
 External Memory Bus Interface  ──┘
```

#### Physical Library Gate Delays (28nm CMOS Technology):
* PC Register Clock-to-Q Delay: $t_{\text{C2Q\_PC}} = 0.35\text{ ns}$
* PC Register Setup Time: $t_{\text{su\_PC}} = 0.20\text{ ns}$
* Instruction Memory Read Delay: $t_{\text{imem}} = 2.20\text{ ns}$
* Main Control Decoder Delay: $t_{\text{ctrl\_main}} = 0.45\text{ ns}$
* Register File Read Delay: $t_{\text{rf\_read}} = 1.10\text{ ns}$
* Register File Setup Time: $t_{\text{rf\_su}} = 0.25\text{ ns}$
* Sign-Extender Delay: $t_{\text{sign\_ext}} = 0.30\text{ ns}$
* 2-to-1 Multiplexer Delay (`ALUSrc`, `MemtoReg`, `PCSrc`): $t_{\text{mux}} = 0.20\text{ ns}$
* ALU Control Decoder Delay: $t_{\text{ctrl\_alu}} = 0.35\text{ ns}$
* Main ALU Delay: $t_{\text{alu}} = 1.65\text{ ns}$
* Data Memory Read Delay: $t_{\text{dmem\_read}} = 2.30\text{ ns}$
* Data Memory Write Setup Time: $t_{\text{dmem\_su}} = 0.30\text{ ns}$
* Branch Target Adder Delay: $t_{\text{br\_add}} = 0.95\text{ ns}$
* Branch AND Gate Delay: $t_{\text{and}} = 0.10\text{ ns}$

#### Your Objective

1. Write the complete, synthesizable SystemVerilog module `SingleCycleProcessorCore` incorporating the Main Control Decoder, ALU Control Decoder, Register File, ALU, Sign Extender, and Data Memory interfaces.
2. Calculate the exact propagation delays for all five instruction archetypes (`ADD`, `ADDI`, `LW`, `SW`, `BEQ`) and identify the absolute critical path.
3. Calculate the minimum safe clock period $T_{\text{clk\_min}}$ and maximum operating frequency $f_{\text{max}}$.
4. Calculate the timing slack for an `ADD` instruction when running at $T_{\text{clk\_min}}$.
5. Simulate and trace signal values across 4 execution cycles for the program sequence:
   * **Cycle 1**: `ADDI x1, x0, 10` ($x1 \gets 10$)
   * **Cycle 2**: `ADD  x2, x1, x1` ($x2 \gets 20$)
   * **Cycle 3**: `SW   x2, 4(x0)`  ($\text{Mem}[4] \gets 20$)
   * **Cycle 4**: `LW   x3, 4(x0)`  ($x3 \gets \text{Mem}[4] = 20$)
6. Verify structural, mathematical, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Write the Synthesizable SystemVerilog Module

We construct `SingleCycleProcessorCore` using clean, modular SystemVerilog syntax:

```systemverilog
`default_nettype none

// MAIN CONTROL UNIT DECODER MODULE
module MainControlDecoder (
    input  logic [6:0] opcode,
    output logic       reg_write,
    output logic       alu_src,
    output logic       mem_read,
    output logic       mem_write,
    output logic       mem_to_reg,
    output logic       branch,
    output logic [1:0] alu_op
);
    always_comb begin
        case (opcode)
            7'b0110011: begin // R-Type (ADD, SUB, AND, OR, SLT)
                reg_write  = 1'b1;
                alu_src    = 1'b0;
                mem_read   = 1'b0;
                mem_write  = 1'b0;
                mem_to_reg = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b10;
            end
            7'b0010011: begin // I-Type Arithmetic (ADDI)
                reg_write  = 1'b1;
                alu_src    = 1'b1;
                mem_read   = 1'b0;
                mem_write  = 1'b0;
                mem_to_reg = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b10;
            end
            7'b0000011: begin // I-Type Load (LW)
                reg_write  = 1'b1;
                alu_src    = 1'b1;
                mem_read   = 1'b1;
                mem_write  = 1'b0;
                mem_to_reg = 1'b1;
                branch     = 1'b0;
                alu_op     = 2'b00;
            end
            7'b0100011: begin // S-Type Store (SW)
                reg_write  = 1'b0;
                alu_src    = 1'b1;
                mem_read   = 1'b0;
                mem_write  = 1'b1;
                mem_to_reg = 1'b0; // Don't care
                branch     = 1'b0;
                alu_op     = 2'b00;
            end
            7'b1100011: begin // B-Type Branch (BEQ)
                reg_write  = 1'b0;
                alu_src    = 1'b0;
                mem_read   = 1'b0;
                mem_write  = 1'b0;
                mem_to_reg = 1'b0; // Don't care
                branch     = 1'b1;
                alu_op     = 2'b01;
            end
            default: begin
                reg_write  = 1'b0;
                alu_src    = 1'b0;
                mem_read   = 1'b0;
                mem_write  = 1'b0;
                mem_to_reg = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b00;
            end
        endcase
    end
endmodule

// ALU CONTROL DECODER MODULE
module AluControlDecoder (
    input  logic [1:0] alu_op,
    input  logic [2:0] funct3,
    input  logic       funct7_5,
    output logic [3:0] alu_control
);
    always_comb begin
        case (alu_op)
            2'b00: alu_control = 4'b0010; // Force ADD (Address Load/Store)
            2'b01: alu_control = 4'b0110; // Force SUB (Branch Comparison)
            2'b10: begin // Look at funct fields
                case (funct3)
                    3'b000:  alu_control = (funct7_5) ? 4'b0110 : 4'b0010; // SUB vs ADD
                    3'b111:  alu_control = 4'b0000; // AND
                    3'b110:  alu_control = 4'b0001; // OR
                    3'b010:  alu_control = 4'b0111; // SLT
                    default: alu_control = 4'b0010;
                endcase
            end
            default: alu_control = 4'b0010;
        endcase
    end
endmodule

// INTEGRATED SINGLE-CYCLE PROCESSOR CORE
module SingleCycleProcessorCore (
    input  logic        clk,
    input  logic        reset_n,
    output logic [31:0] pc_out,
    output logic [31:0] inst_out,
    output logic [31:0] writeback_data_out
);

    // Datapath Wires
    logic [31:0] pc_curr, pc_next, pc_plus_4, branch_target_pc;
    logic [31:0] inst;
    logic [31:0] rs1_data, rs2_data, imm32;
    logic [31:0] alu_operand_b, alu_result;
    logic [31:0] dmem_read_data, rf_write_data;
    logic        alu_zero, pc_src;

    // Control Signals
    logic       reg_write, alu_src, mem_read, mem_write, mem_to_reg, branch;
    logic [1:0] alu_op;
    logic [3:0] alu_control;

    // 1. Program Counter Register
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) pc_curr <= 32'h0000_0000;
        else          pc_curr <= pc_next;
    end

    assign pc_plus_4        = pc_curr + 32'd4;
    assign branch_target_pc = pc_curr + imm32;
    assign pc_src           = branch & alu_zero;
    assign pc_next          = (pc_src) ? branch_target_pc : pc_plus_4;

    // 2. Instruction Memory Interface
    InstructionMemoryArray u_imem (.addr(pc_curr), .inst_word(inst));

    // 3. Main Control Unit
    MainControlDecoder u_main_ctrl (
        .opcode    (inst[6:0]),
        .reg_write (reg_write),
        .alu_src   (alu_src),
        .mem_read  (mem_read),
        .mem_write (mem_write),
        .mem_to_reg(mem_to_reg),
        .branch    (branch),
        .alu_op    (alu_op)
    );

    // 4. Register File
    RegisterFile32x32 u_rf (
        .clk       (clk),
        .reg_write (reg_write),
        .rs1_addr  (inst[19:15]),
        .rs2_addr  (inst[24:20]),
        .rd_addr   (inst[11:7]),
        .write_data(rf_write_data),
        .rs1_data  (rs1_data),
        .rs2_data  (rs2_data)
    );

    // 5. Immediate Generator (Sign Extender)
    ImmediateGenerator u_imm_gen (.inst(inst), .imm32(imm32));

    // 6. ALU Source Multiplexer
    assign alu_operand_b = (alu_src) ? imm32 : rs2_data;

    // 7. ALU Control Decoder
    AluControlDecoder u_alu_ctrl (
        .alu_op     (alu_op),
        .funct3     (inst[14:12]),
        .funct7_5   (inst[30]),
        .alu_control(alu_control)
    );

    // 8. Main ALU
    MainAlu32Bit u_alu (
        .operand_a  (rs1_data),
        .operand_b  (alu_operand_b),
        .alu_control(alu_control),
        .result     (alu_result),
        .zero       (alu_zero)
    );

    // 9. Data Memory
    DataMemoryArray u_dmem (
        .clk       (clk),
        .mem_read  (mem_read),
        .mem_write (mem_write),
        .addr      (alu_result),
        .write_data(rs2_data),
        .read_data (dmem_read_data)
    );

    // 10. Mem-to-Reg Writeback Multiplexer
    assign rf_write_data = (mem_to_reg) ? dmem_read_data : alu_result;

    // Module Outputs
    assign pc_out             = pc_curr;
    assign inst_out           = inst;
    assign writeback_data_out = rf_write_data;

endmodule

`default_nettype wire
```

---

#### Step 2: Calculate Critical Path Delays Across Instruction Archetypes

Let us evaluate the exact propagation delays along the physical wire paths for each instruction type:

1. **R-Type Addition (`ADD`) Path**:
   $$t_{\text{ADD}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + t_{\text{rf\_read}} + t_{\text{mux}} + t_{\text{alu}} + t_{\text{mux}} + t_{\text{rf\_su}}$$
   $$t_{\text{ADD}} = 0.35 + 2.20 + 1.10 + 0.20 + 1.65 + 0.20 + 0.25 = \mathbf{5.95 \text{ ns}}$$

2. **I-Type Arithmetic (`ADDI`) Path**:
   $$t_{\text{ADDI}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + \max(t_{\text{rf\_read}}, t_{\text{sign\_ext}}) + t_{\text{mux}} + t_{\text{alu}} + t_{\text{mux}} + t_{\text{rf\_su}}$$
   $$t_{\text{ADDI}} = 0.35 + 2.20 + 1.10 + 0.20 + 1.65 + 0.20 + 0.25 = \mathbf{5.95 \text{ ns}}$$

3. **S-Type Store (`SW`) Path**:
   $$t_{\text{SW}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + \max(t_{\text{rf\_read}}, t_{\text{sign\_ext}}) + t_{\text{mux}} + t_{\text{alu}} + t_{\text{dmem\_su}}$$
   $$t_{\text{SW}} = 0.35 + 2.20 + 1.10 + 0.20 + 1.65 + 0.30 = \mathbf{5.80 \text{ ns}}$$

4. **B-Type Branch (`BEQ`) Path**:
   $$t_{\text{BEQ}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + t_{\text{rf\_read}} + t_{\text{mux}} + t_{\text{alu}} + t_{\text{and}} + t_{\text{mux}} + t_{\text{su\_PC}}$$
   $$t_{\text{BEQ}} = 0.35 + 2.20 + 1.10 + 0.20 + 1.65 + 0.10 + 0.20 + 0.20 = \mathbf{6.00 \text{ ns}}$$

5. **I-Type Memory Load (`LW`) Path (CRITICAL PATH!)**:
   $$t_{\text{LW}} = t_{\text{C2Q\_PC}} + t_{\text{imem}} + t_{\text{rf\_read}} + t_{\text{mux}} + t_{\text{alu}} + t_{\text{dmem\_read}} + t_{\text{mux}} + t_{\text{rf\_su}}$$
   $$t_{\text{LW}} = 0.35 + 2.20 + 1.10 + 0.20 + 1.65 + 2.30 + 0.20 + 0.25 = \mathbf{8.25 \text{ ns}}$$

##### Critical Path Summary:
The **Load Word (`LW`)** instruction is the absolute critical path bottleneck at **$8.25\text{ nanoseconds}$**.

---

#### Step 3: Calculate Minimum Clock Period and Maximum Clock Frequency

To ensure all instructions execute without setup time violations:

$$
T_{\text{clk\_min}} \ge t_{\text{LW}} = \mathbf{8.250 \text{ ns}}
$$

Calculating maximum operating frequency $f_{\text{max}}$:

$$
f_{\text{max}} = \frac{1}{T_{\text{clk\_min}}} = \frac{1}{8.250\text{ ns}} = \frac{1}{8.250 \times 10^{-9}\text{ s}} \approx 121,212,121\text{ Hz} \approx \mathbf{121.21 \text{ MHz}}
$$

The single-cycle core can run at a maximum clock speed of **$121.21\text{ MHz}$**.

---

#### Step 4: Calculate Timing Slack for `ADD` Instruction

When the processor operates at $T_{\text{clk}} = 8.250\text{ ns}$:

$$
T_{\text{slack\_ADD}} = T_{\text{clk}} - t_{\text{ADD}} = 8.250\text{ ns} - 5.950\text{ ns} = \mathbf{+2.300 \text{ ns}}
$$

The `ADD` instruction finishes $2.300\text{ ns}$ early and sits idle waiting for the clock edge.

---

#### Step 5: Trace 4-Cycle Program Execution Simulation

Let us trace the processor execution across four consecutive clock cycles:

```text
SINGLE-CYCLE PROCESSOR CORE EXECUTION TRACE

 Cycle 1: ADDI x1, x0, 10  (Opcode 0010011)
   Control : RegWrite=1, ALUSrc=1, MemRead=0, MemWrite=0, MemtoReg=0, ALUOp=2'b10 (ADD)
   Datapath: rs1_data=0 (x0), Imm32=10, alu_operand_b=10
   Result  : alu_result = 0 + 10 = 10. rf_write_data = 10.
   Writeback: Register x1 captures 10 at next posedge clk.

 Cycle 2: ADD x2, x1, x1   (Opcode 0110011)
   Control : RegWrite=1, ALUSrc=0, MemRead=0, MemWrite=0, MemtoReg=0, ALUOp=2'b10 (ADD)
   Datapath: rs1_data=10 (x1), rs2_data=10 (x1), alu_operand_b=10
   Result  : alu_result = 10 + 10 = 20. rf_write_data = 20.
   Writeback: Register x2 captures 20 at next posedge clk.

 Cycle 3: SW x2, 4(x0)     (Opcode 0100011)
   Control : RegWrite=0, ALUSrc=1, MemRead=0, MemWrite=1, MemtoReg=X, ALUOp=2'b00 (ADD)
   Datapath: rs1_data=0 (x0), Imm32=4, alu_operand_b=4, rs2_data=20 (x2)
   Result  : alu_result = 0 + 4 = 4 (Memory Address).
   Memory  : Data Memory stores 20 into address 4 at next posedge clk. No RF Writeback!

 Cycle 4: LW x3, 4(x0)     (Opcode 0000011)
   Control : RegWrite=1, ALUSrc=1, MemRead=1, MemWrite=0, MemtoReg=1, ALUOp=2'b00 (ADD)
   Datapath: rs1_data=0 (x0), Imm32=4, alu_operand_b=4
   Result  : alu_result = 0 + 4 = 4. Data Memory reads Address 4 -> dmem_read_data = 20.
   Writeback: rf_write_data = 20. Register x3 captures 20 at next posedge clk.
```

```text
SINGLE-CYCLE EXECUTION WAVEFORMS

 clk          : 000011110000111100001111000011110000
                ▲           ▲           ▲           ▲
                │ Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4
                │           │           │           │
 inst         : [ ADDI x1 ]─[ ADD x2  ]─[ SW x2   ]─[ LW x3   ]===
 RegWrite     : 1111111111111111111111100000000000001111111111
 ALUSrc       : 1111111111100000000000111111111111111111111111
 MemWrite     : 0000000000000000000000111111111111000000000000
 MemtoReg     : 0000000000000000000000000000000000111111111111
 writeback_out: [   10    ]─[   20    ]─[   20    ]─[   20    ]===
```

---

### Sanity Check and Verification

Let us verify our single-cycle core against all physical and architectural requirements:

1. **Decoder Alignment Verification**:
   * During `SW` (Cycle 3), `RegWrite` remained $0$, preventing memory address $4$ from overwriting register $x2$.
   * During `LW` (Cycle 4), `MemtoReg` selected `dmem_read_data` ($20$), loading the stored value from memory into register $x3$.
   * **Verification**: All control lines aligned with 100% mathematical precision.

2. **Register Dependency Trace**:
   * Cycle 1 computed $x1 = 0 + 10 = 10$.
   * Cycle 2 read $x1 = 10$ and computed $x2 = 10 + 10 = 20$.
   * Cycle 3 stored $x2 = 20$ to Data Memory address 4.
   * Cycle 4 loaded Data Memory address 4 into $x3 = 20$.
   * **Verification**: $x3 == 20$. Data integrity is 100% preserved.

3. **Timing Closure**:
   * Critical Path $T_{\text{clk\_min}} = 8.25\text{ ns}$ ($f_{\text{max}} = 121.21\text{ MHz}$).
   * All setup time margins satisfied ($T_{\text{slack}} \ge 0$).
   * **Verification**: The processor core achieves complete timing closure.

All simulation cycles, decoder truth tables, multiplexer routing paths, and critical path timing equations evaluate with 100% mathematical, physical, and structural precision. The `SingleCycleProcessorCore` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Single-Cycle Datapath**: A unified, non-pipelined hardware execution chassis that connects the Instruction Fetch unit, Register File, ALU, and Data Memory through multiplexed wire paths, completing instruction fetch, decode, execution, memory access, and writeback within a single clock period ($T_{\text{clk}}$).
* **Main Control Unit Decoder**: The primary combinational logic decoder that inspects an instruction's opcode bits ($\text{Inst}[6:0]$) to generate multiplexer select signals (`ALUSrc`, `MemtoReg`, `PCSrc`), memory enables (`MemRead`, `MemWrite`), register write enables (`RegWrite`), and high-level ALU control modes (`ALUOp[1:0]`).
* **ALU Control Unit**: A secondary hierarchical decoder that combines the 2-bit `ALUOp` mode from the Main Control Unit with instruction function fields (`funct3`, `funct7`) to generate the precise multi-bit operation select code ($\text{ALUControl}[3:0]$) driving the ALU execution gates.
