# Load-Use Data Hazards, Hardware Interlock Detection, and Pipeline Stalling Mechanics

## The Backward Time-Travel Paradox: Why Forwarding Fails on Loads

In a 5-stage pipelined processor core, hardware operand forwarding (bypassing) is an extraordinary microarchitectural optimization. When a standard arithmetic instruction (like `ADD x1, x2, x3`) executes in the Execute (EX) stage, its 32-bit addition result is calculated by the Arithmetic Logic Unit (ALU) on Cycle 3. If the very next instruction (`SUB x4, x1, x5`) enters the EX stage on Cycle 4, a 3-to-1 forwarding multiplexer picks up the fresh result directly from the EX/MEM pipeline register and feeds it into the ALU input. The hazard is resolved in zero extra clock cycles, and the pipeline continues streaming at full speed.

Because forwarding works so effectively for arithmetic operations, a beginner might assume that operand forwarding can resolve **all** Read-After-Write (RAW) data dependencies in a 5-stage pipeline with zero performance loss.

However, when an instruction attempting to read a register is preceded immediately by a **Memory Load Instruction** (`LW rd, offset(rs1)`), operand forwarding hits a hard physical wall.

To see why operand forwarding fails on memory loads, let us trace two back-to-back instructions through a 5-stage pipeline:

* **Instruction 1**: `LW x1, 0(x2)` (Loads a 32-bit word from Data Memory into register $x1$)
* **Instruction 2**: `ADD x3, x1, x4` (Adds $x1 + x4$ and stores the sum in register $x3$)

Look at the dependency: Instruction 2 (`ADD`) requires the value of register $x1$ to perform its addition in the ALU. But $x1$ is being loaded from Data Memory by Instruction 1 (`LW`).

Now, let us trace the physical location of both instructions on **Clock Cycle 3**:

```text
THE LOAD-USE TIME-TRAVEL PARADOX ON CYCLE 3

 Clock Cycle 3:
   * Inst 1 (LW)   sits in EX Stage  ──► ALU calculates Memory Address (x2 + 0).
                                         (Where is loaded data? STILL IN MEMORY!)
   * Inst 2 (ADD) sits in ID Stage  ──► Reads Register File.
```

Look at the physical state of the hardware on Clock Cycle 3:
* Instruction 1 (`LW`) is in the **EX stage**. Its ALU is calculating the memory address ($x2 + 0$). **Where is the loaded data? The loaded data is still sitting inside the Data Memory chip! It has NOT been read yet!**
* Instruction 1 will not read Data Memory until Clock Cycle 4 (MEM stage). The loaded data will finally become valid on the memory output pins at the *very end* of Clock Cycle 4.

Now, trace where Instruction 2 (`ADD`) will be on **Clock Cycle 4**:
* On Clock Cycle 4, Instruction 2 (`ADD`) moves into the **EX stage**.
* To perform its addition, the ALU in the EX stage requires its input operands at the **beginning of Clock Cycle 4**.

```text
THE PHYSICAL IMPOSSIBILITY OF FORWARDING ON LOADS

 Clock Cycle 4:
   * Inst 1 (LW)  in MEM Stage ──► Loaded data becomes valid AT END of Cycle 4!
   * Inst 2 (ADD) in EX Stage  ──► ALU requires operand AT START of Cycle 4!
                                   (Requires forwarding signal BACKWARD in time!)
```

Look at the physical impossibility! 

To forward data directly from Instruction 1 (`LW`) to Instruction 2 (`ADD`) on Clock Cycle 4, the data would have to travel **backward in physical time** by one full clock cycle! 

Data that becomes available at the *end* of Cycle 4 cannot be fed into an ALU that needs it at the *start* of Cycle 4. No physical hardware circuit can transmit electrical signals backward through time.

This physical timing gap—where an instruction in the ID stage attempts to read a register produced by an immediately preceding Load instruction currently in the EX stage—is called a **Load-Use Data Hazard**.

Because hardware cannot travel backward in time, operand forwarding ALONE cannot resolve a Load-Use data hazard. The processor has no choice: it MUST pause execution and force Instruction 2 to wait.

To handle Load-Use hazards safely, digital microarchitecture uses a dedicated control unit called the **Hazard Detection Unit** to enforce a 1-cycle **Hardware Interlock Stall** and inject a **Pipeline NOP Bubble**.

---

## The Parts Warehouse and the Car Assembly Line: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of why Load-Use hazards force a pipeline stall and how hardware interlocks inject bubbles without losing data, let us picture an automated car manufacturing facility.

Imagine an automated car factory with three sequential stations along a conveyor belt:
* **Station 1 (ID Stage)**: Worker 2 prepares Car #2 (`ADD x3, x1, x4`). To assemble Car #2, Worker 2 needs Engine Block $x1$.
* **Station 2 (EX Stage)**: Worker 1 is building Car #1 (`LW x1, 0(x2)`). Worker 1's job is to order Engine Block $x1$ from an external parts warehouse down the highway.
* **Station 3 (MEM Stage)**: The Parts Warehouse loading dock where delivery trucks unload engine blocks.

```text
THE PARTS WAREHOUSE CONVEYOR BELT METAPHOR

 Station 1 (ID Stage)         Station 2 (EX Stage)         Station 3 (MEM Stage)
 [ Worker 2: Car #2 ]  ──►   [ Worker 1: Car #1 ]  ──►   [ Warehouse Dock ]
 (Needs Engine Block x1)     (Orders Engine x1)           (Engine Arrives HERE!)
```

Let us trace what happens at **10:00 AM (Clock Cycle 3)**:

1. At 10:00 AM, Worker 1 (at Station 2 / EX Stage) calculates the order form and sends a request to the external warehouse for Engine Block $x1$.
2. The delivery truck driver reads the request, drives to the warehouse, and unloads Engine Block $x1$ at Station 3 at **10:30 AM (Clock Cycle 4)**.
3. Meanwhile, Worker 2 (at Station 1 / ID Stage) is getting Car #2 ready. Worker 2 needs Engine Block $x1$ to install it into Car #2 at **10:00 AM sharp**!

Worker 2 looks at his workbench at 10:00 AM. The workbench is empty! Engine Block $x1$ is riding on a delivery truck down the highway and will not arrive at Station 3 until 10:30 AM.

Can Worker 2 install an engine block that is still sitting on a delivery truck miles away? **NO!**

If the conveyor belt keeps moving automatically at 10:00 AM, Car #2 will be dragged forward to Station 2 without an engine. The assembly line will produce a broken, engine-less car!

---

### The Factory Supervisor's Intervention (Hardware Interlock Stall)

To prevent Car #2 from moving forward without an engine, the factory supervisor (**The Hazard Detection Unit**) steps in and executes a 3-step **Interlock Emergency Routine**:

```text
INTERLOCK EMERGENCY ROUTINE (1-CYCLE STALL)

 Step 1: Supervisor PAUSES the conveyor belt at Station 1!
         (Car #2 stays parked at Station 1 for 20 extra minutes / PC & IF/ID Frozen).

 Step 2: Supervisor places an EMPTY DUMMY CHASSIS onto the conveyor belt at Station 2!
         (Injects a "Pipeline Bubble / NOP" into the EX stage).

 Step 3: At 10:30 AM, the delivery truck arrives at Station 3 and unloads Engine Block x1!
         Worker 1 holds Engine Block x1 across the workbench boundary!
```

```text
THE RESOLVED ASSEMBLY LINE TIMELINE

 10:00 AM : Car #1 Orders Engine x1  │ Car #2 Paused at Station 1
 10:20 AM : Dummy Chassis in Oven   │ Engine x1 Unloaded at Dock! (Forwarded!)
 10:40 AM : Car #2 Moves to Stg 2   │ Worker 2 Installs Fresh Engine x1! (SAFE!)
```

Look at the brilliance of this supervisor intervention:
1. **Car #2 was NOT damaged**: It sat safely parked at Station 1 for 20 extra minutes until Engine Block $x1$ arrived.
2. **The empty dummy chassis caused no harm**: It passed through Station 2 as a harmless placeholder.
3. **Data Integrity Restored**: At 10:30 AM, Engine Block $x1$ arrived at the dock, and Worker 1 handed it directly across the station boundary to Worker 2!

This factory supervisor intervention is the exact physical analogue of a **Hardware Interlock Stall**:
* Car #1 ordering an engine is the **Memory Load (`LW`)**.
* Car #2 needing the engine is the **Dependent Instruction (`ADD`)**.
* Pausing Station 1's conveyor belt is **Freezing the Program Counter ($PC$) and IF/ID Register**.
* The empty dummy chassis is the **Pipeline Bubble (NOP Control Vector)**.
* Handing the engine across the station boundary at 10:30 AM is **MEM-to-EX Operand Forwarding**.

---

## Primitive 1: Load-Use Hazard Mechanics and the Time-Space Gap

To understand how hardware interlocks are synthesized, we must examine the exact mathematical time-space gap created by a Load-Use hazard in a 5-stage pipeline.

Let us compare the timing profile of an ALU-to-ALU data dependency versus a Load-to-ALU data dependency:

### Case 1: ALU-to-ALU Dependency (`ADD` followed by `SUB`)
* `ADD` produces its result at the output of the EX stage on Cycle 3.
* `SUB` needs its operand at the input of the EX stage on Cycle 4.
* **Time-Space Gap**: $T_{\text{produced}} = 3$, $T_{\text{needed}} = 4 \implies \text{Gap} = 4 - 3 = \mathbf{+1 \text{ Cycle}}$.
* Because the gap is positive ($+1$), **Operand Forwarding resolves the hazard with ZERO stall cycles!**

### Case 2: Load-to-ALU Dependency (`LW` followed by `ADD`)
* `LW` produces its loaded data at the output of the MEM stage on Cycle 4.
* `ADD` needs its operand at the input of the EX stage on Cycle 4.
* **Time-Space Gap**: $T_{\text{produced}} = 4$, $T_{\text{needed}} = 4 \implies \text{Gap} = 4 - 4 = \mathbf{0 \text{ Cycles}}$.
* Because the data is produced at the *end* of Cycle 4 but needed at the *start* of Cycle 4, **the time-space gap is -1 cycle!**

```text
TIMING GRID: LOAD-USE HAZARD WITHOUT STALL VS WITH 1-CYCLE STALL

 Without Stall (IMPOSSIBLE TIME-TRAVEL FORWARDING):
 Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4   │ Cycle 5
 LW  : [ IF ]──►[ ID ]──►[ EX ]──►[ MEM ]──►[ WB ]  (Data ready at END of Cycle 4!)
 ADD :          [ IF ]──►[ ID ]──►[ EX ]──►[ MEM ]  (Data needed at START of Cycle 4!)
                                    ▲
                                    └── REQUIRES TIME TRAVEL! (FAILS!)

 With 1-Cycle Interlock Stall (HARDWARE RESOLUTION):
 Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4   │ Cycle 5   │ Cycle 6
 LW  : [ IF ]──►[ ID ]──►[ EX ]──►[ MEM ]──►[ WB ]
 ADD :          [ IF ]──►[ ID ]──►[ STALL]─►[ EX ]──►[ MEM ]──►[ WB ]
                         (Frozen)  (Bubble)    ▲
                                               └── Forwarded from MEM/WB! (PASS!)
```

#### How 1 Stall Cycle Solves the Paradox:
By inserting **exactly 1 clock cycle of stall (interlock)** into `ADD`'s execution path:
1. On Cycle 4, `LW` advances to the MEM stage, while `ADD` is frozen in the ID stage.
2. At the end of Cycle 4, `LW` completes its memory read. The loaded data is saved into the `MEM/WB` pipeline register.
3. On Cycle 5, `ADD` advances into the EX stage.
4. On Cycle 5, `LW` sits in the WB stage. The loaded data in `MEM/WB` is forwarded directly into the ALU input via standard **MEM-to-EX Operand Forwarding**!

By delaying `ADD` by just one clock cycle, the time-space gap becomes positive, and standard operand forwarding finishes the job cleanly!

---

## Primitive 2: Hardware Interlock Detection and Control Mechanics

How does the processor detect a Load-Use hazard in silicon, and where does the detection logic sit?

Load-Use hazard detection is performed by a dedicated combinational logic block called the **Hazard Detection Unit**.

The Hazard Detection Unit sits in Stage 2 (**Instruction Decode - ID**). It continuously monitors two instructions simultaneously:
1. The instruction currently being decoded in the ID stage (sitting in the `IF/ID` pipeline register).
2. The instruction currently executing in the EX stage (sitting in the `ID/EX` pipeline register).

```text
HAZARD DETECTION UNIT SCHEMATIC IN ID STAGE

 ID/EX.MemRead ────────┐
 ID/EX.rd [4:0] ───────┼──► [ HAZARD DETECTION ] ──┬──► pc_write_en   (To PC)
 IF/ID.rs1 [4:0] ──────┤      [     UNIT       ]   ├──► if_id_write_en(To IF/ID)
 IF/ID.rs2 [4:0] ──────┘                           └──► id_ex_flush   (To ID/EX MUX)
```

---

### Deriving the Load-Use Hazard Detection Equation

A Load-Use hazard exists IF AND ONLY IF all three of the following Boolean sub-conditions evaluate True simultaneously:

1. **In-Flight Load Instruction Requirement**: The instruction currently sitting in the EX stage is a Memory Load instruction ($\text{ID\_EX\_MemRead} == 1$).
2. **Non-Zero Register Requirement ($x0$ Protection)**: The destination register of the Load instruction is NOT $x0$ ($\text{ID\_EX\_rd} \neq 0$).
3. **Register Address Match**: The destination register address of the Load instruction matches EITHER source register $rs1$ OR source register $rs2$ of the instruction currently being decoded in the ID stage:
   $$(\text{ID\_EX\_rd} == \text{IF\_ID\_rs1}) \quad \lor \quad (\text{ID\_EX\_rd} == \text{IF\_ID\_rs2})$$

#### Mathematical Boolean Equation for Load-Use Hazard Detection:

$$
\text{LoadUse\_Hazard} = \text{ID\_EX\_MemRead} \,\, \land \,\, (\text{ID\_EX\_rd} \neq 0) \,\, \land \,\, \Big( (\text{ID\_EX\_rd} == \text{IF\_ID\_rs1}) \,\,\lor\,\, (\text{ID\_EX\_rd} == \text{IF\_ID\_rs2}) \Big)
$$

Where:
* $\text{LoadUse\_Hazard}$ is a 1-bit active-high signal emitted by the Hazard Detection Unit.
* $\text{ID\_EX\_MemRead}$ is the memory read control bit of the instruction in the EX stage ($1$ for `LW`, $0$ for `ADD`/`SW`).
* $\text{ID\_EX\_rd}$ is the 5-bit destination register address of the instruction in the EX stage.
* $\text{IF\_ID\_rs1}, \text{IF\_ID\_rs2}$ are the 5-bit source register addresses of the instruction in the ID stage.

```text
HAZARD DETECTION TRUTH TABLE

 ID/EX.MemRead │ ID/EX.rd == IF/ID.rs1 │ ID/EX.rd == IF/ID.rs2 │ LoadUse_Hazard
───────────────┼───────────────────────┼───────────────────────┼─────────────────
       0 (ADD) │       Don't Care      │       Don't Care      │        0 (No Stall)
       1 (LW)  │           0           │           0           │        0 (No Stall)
       1 (LW)  │           1           │           X           │        1 (STALL!)
       1 (LW)  │           X           │           1           │        1 (STALL!)
```

Look at how precise this equation is!
* If the instruction in EX is an `ADD` ($\text{MemRead} = 0$), `LoadUse_Hazard` evaluates to $0$. Operand forwarding handles it in 0 stall cycles.
* If the instruction in EX is a `LW` ($\text{MemRead} = 1$), and its destination register matches $rs1$ or $rs2$ of the instruction in ID, `LoadUse_Hazard` evaluates to $1$. The interlock stall fires!

---

## Primitive 3: Pipeline Interlock Execution — Freezing PC/IF-ID and NOP Bubble Insertion

When the Hazard Detection Unit asserts $\text{LoadUse\_Hazard} = 1$, what exact physical actions must the hardware perform to stall the pipeline for 1 clock cycle without corrupting data or dropping instructions?

The Hazard Detection Unit executes three simultaneous hardware control actions:

```text
INTERLOCK STALL CONTROL ACTIONS

 LoadUse_Hazard = 1
   │
   ├──► 1. Freeze Program Counter    ──► pc_write_en = 0
   │
   ├──► 2. Freeze IF/ID Register     ──► if_id_write_en = 0
   │
   └──► 3. Inject Bubble into ID/EX  ──► id_ex_flush = 1 (Control Vector = 0x00)
```

Let us examine each of these three control actions in detail:

---

### Action 1: Freeze the Program Counter (`pc_write_en = 0`)
The Hazard Detection Unit de-asserts the write enable signal of the Program Counter register ($\text{pc\_write\_en} = 0$).

* **Physical Effect**: On the next rising clock edge (`posedge clk`), the PC register **refuses to capture** the new address $PC+4$. It holds its current address unchanged.
* **Result**: The processor continues pointing to the exact same instruction in Instruction Memory for another clock cycle. No new instruction is fetched.

---

### Action 2: Freeze the IF/ID Pipeline Register (`if_id_write_en = 0`)
The Hazard Detection Unit de-asserts the write enable signal of the IF/ID interstage pipeline register ($\text{if\_id\_write\_en} = 0$).

* **Physical Effect**: On the next rising clock edge, the IF/ID pipeline register **refuses to capture** new data from Instruction Memory. It holds its current instruction word (the dependent instruction, e.g., `ADD x3, x1, x4`) frozen in place inside the ID stage.
* **Result**: The dependent instruction stays parked in the ID stage for an extra clock cycle. It is NOT lost or overwritten!

---

### Action 3: Inject a NOP Bubble into the ID/EX Register (`id_ex_flush = 1`)
While the dependent instruction stays parked in the ID stage, the EX stage ahead of it will become empty on the next clock cycle as the `LW` instruction moves forward into MEM.

If we did nothing, the EX stage would execute garbage data.

To keep the pipeline safe, the Hazard Detection Unit asserts $\text{id\_ex\_flush} = 1$. This signal controls a 2-to-1 multiplexer on the control bus entering the ID/EX pipeline register:

```text
ID/EX CONTROL BUBBLE INJECTION MULTIPLEXER

 Decoded Control Vector C_decoded ──►[ Input 0 ]
                                     [ 2:1 MUX ]──► ID/EX Control Register Input
 Zero Vector 8'b0000_0000        ──►[ Input 1 ]    (Flush = 1 forces 8'b0000_0000!)
                                         ▲
 LoadUse_Hazard (Flush Signal) ──────────┘
```

* **Physical Effect**: When $\text{id\_ex\_flush} = 1$, the MUX overrides the decoded control signals and forces the control vector entering the ID/EX register to **static zero (`8'b0000_0000`)**.
* **Result**: On the next clock edge, the ID/EX register captures `RegWrite = 0`, `MemWrite = 0`, `MemRead = 0`. A harmless **No-Operation (NOP) Bubble** is injected into the EX stage!

```text
COMPLETE STALL CYCLE STATE MAP

 Clock Edge t   : LoadUse_Hazard detected in ID stage.
                  pc_write_en = 0, if_id_write_en = 0, id_ex_flush = 1.

 Clock Edge t+1 : * PC stays at current address (Holds next inst in memory).
                  * IF/ID register stays holding ADD x3, x1, x4 (Parked in ID).
                  * ID/EX register captures 8'b0000_0000 (NOP Bubble in EX!).
                  * LW advances to MEM stage.
                  * LoadUse_Hazard drops back to 0! (Stall finished!).

 Clock Edge t+2 : * ADD x3, x1, x4 advances to EX stage.
                  * LW sits in MEM/WB stage.
                  * Forwarding Unit forwards fresh loaded data from MEM/WB to ALU!
```

Look at this sequence!
1. The dependent instruction (`ADD`) sat safely parked in the ID stage for 1 clock cycle.
2. A harmless NOP bubble passed through the EX stage.
3. On the very next clock cycle, `LW` reached the MEM/WB boundary, the loaded data became valid, and standard **MEM-to-EX Operand Forwarding** completed the data transfer with $100\%$ accuracy!

---

## Performance Quantification: Impact of Load-Use Stalls on Processor CPI

How much does a Load-Use hazard degrade processor execution speed?

In an ideal 5-stage pipeline with no stalls, the processor emits one completed instruction per clock cycle, achieving an ideal **Cycles Per Instruction ($CPI_{\text{ideal}} = 1.0$)**.

Every time a Load-Use hazard occurs, the Hazard Detection Unit inserts a 1-cycle interlock stall, adding **1 extra clock cycle** to the execution time.

---

### Deriving the Pipelined CPI Equation with Load-Use Penalties

Let:
* $f_{\text{load}}$ be the fraction of instructions in the workload that are Memory Loads (`LW`).
* $p_{\text{use}}$ be the probability that a Load instruction is immediately followed by a dependent instruction that reads its destination register.
* $N_{\text{stall}} = 1$ be the stall penalty in clock cycles per Load-Use hazard.

The average Cycles Per Instruction ($CPI_{\text{pipelined}}$) for the processor is:

$$
CPI_{\text{pipelined}} = CPI_{\text{ideal}} + \left( f_{\text{load}} \cdot p_{\text{use}} \cdot N_{\text{stall}} \right)
$$

$$
CPI_{\text{pipelined}} = 1.0 + \left( f_{\text{load}} \cdot p_{\text{use}} \cdot 1 \right)
$$

Where:
* $CPI_{\text{pipelined}}$ is the actual average cycles per instruction including stall penalties.
* $f_{\text{load}}$ is the load instruction frequency ($0 \le f_{\text{load}} \le 1.0$).
* $p_{\text{use}}$ is the load-use dependency probability ($0 \le p_{\text{use}} \le 1.0$).

---

### Quantitative Performance Example

Suppose a processor executes a software workload with the following instruction statistics:
* Total Load instructions $f_{\text{load}} = 20\%$ ($0.20$).
* $60\%$ of those Load instructions ($p_{\text{use}} = 0.60$) are immediately followed by an instruction that consumes the loaded register.

Let us calculate $CPI_{\text{pipelined}}$:

$$
CPI_{\text{pipelined}} = 1.0 + (0.20 \cdot 0.60 \cdot 1) = 1.0 + 0.12 = \mathbf{1.12 \text{ cycles/instruction}}
$$

Now, calculate the processor performance loss compared to the ideal $1.0$ CPI:

$$
\text{Performance Loss} = \left( 1 - \frac{CPI_{\text{ideal}}}{CPI_{\text{pipelined}}} \right) \times 100\% = \left( 1 - \frac{1.0}{1.12} \right) \times 100\% \approx \mathbf{10.71\%}
$$

The Load-Use stall penalty reduced the processor's computing throughput by **$10.71\%$**!

---

### Software Optimization: Compiler Instruction Rescheduling

Can software compilers eliminate Load-Use stalls without modifying hardware?

**YES!** A smart optimizing compiler analyzes instruction dependencies and **reorders independent instructions** to fill the 1-cycle gap after a Load instruction.

```text
COMPILER INSTRUCTION RESCHEDULING OPTIMIZATION

 Un-Optimized Code (Triggers 1-Cycle Hardware Stall):
 1. LW  x1, 0(x2)    ──► Loads x1 from memory
 2. ADD x3, x1, x4   ──► Consumes x1 IMMEDIATELY! (LOAD-USE STALL!)
 3. ADD x5, x6, x7   ──► Independent instruction

 Optimized Rescheduled Code (ZERO Hardware Stalls!):
 1. LW  x1, 0(x2)    ──► Loads x1 from memory
 2. ADD x5, x6, x7   ──► Independent instruction placed HERE! (Fills 1-cycle gap!)
 3. ADD x3, x1, x4   ──► Consumes x1 (Data ALREADY arrived in MEM/WB! NO STALL!)
```

Look at the software reordering optimization above:
* By moving the independent instruction `ADD x5, x6, x7` between the `LW` and the dependent `ADD x3, x1, x4`, the compiler fills the 1-cycle gap with useful work.
* When `ADD x3, x1, x4` enters the EX stage, `LW` has already reached the MEM/WB boundary.
* The 1-cycle hardware stall is **completely eliminated**, restoring $CPI = 1.0$ with zero hardware changes!

---

## Solved Industrial Engineering Exercise: Complete Hazard Detection Unit Synthesis & Multi-Instruction Execution Trace

To consolidate your complete mastery of Load-Use hazard detection, hardware interlocks, $PC$ and `IF/ID` register freezing, NOP bubble insertion, and compiler rescheduling, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are an ASIC microarchitect designing the **Hazard Detection and Interlock Subsystem** (`HazardDetectionSubsystem`) for a 32-bit RISC-V 5-stage pipelined processor core.

```text
HAZARD DETECTION SUBSYSTEM INTERFACE

 ID/EX Controls id_ex_mem_read        ──┐
 ID/EX Destination Register id_ex_rd  ──┼──► [ HazardDetectionSubsystem ] ──┬──► pc_write_en
 IF/ID Source Register 1 if_id_rs1    ──┤                                 ├──► if_id_write_en
 IF/ID Source Register 2 if_id_rs2    ──┘                                 └──► id_ex_flush
```

The subsystem monitors instructions in the ID and EX stages to detect Load-Use hazards and drive the interlock control lines `pc_write_en`, `if_id_write_en`, and `id_ex_flush`.

#### Physical Library Gate Delays (28nm CMOS Technology):
* 5-Bit Address Comparator Delay: $t_{\text{comp}} = 0.12\text{ ns}$
* 2-Input OR Gate Delay: $t_{\text{or}} = 0.05\text{ ns}$
* 2-Input AND Gate Delay: $t_{\text{and}} = 0.08\text{ ns}$
* Control Flush MUX Delay: $t_{\text{mux}} = 0.15\text{ ns}$
* PC Register Setup Time: $t_{\text{su\_pc}} = 0.15\text{ ns}$

#### Your Objective

1. Derive the complete Boolean logic equations for the Hazard Detection Unit outputs `pc_write_en`, `if_id_write_en`, and `id_ex_flush`.
2. Calculate the maximum critical path propagation delay ($t_{\text{hazard\_path}}$) through the Hazard Detection Unit.
3. Write the complete, synthesizable SystemVerilog module `HazardDetectionSubsystem`.
4. Simulate and trace signal values across a 6-cycle execution sequence containing a Load-Use hazard:
   * **Inst 1**: `LW  x1, 0(x2)` (Load $x1$ from memory)
   * **Inst 2**: `ADD x3, x1, x4` (Load-Use hazard on $x1$!)
   * **Inst 3**: `SUB x5, x6, x7` (Independent instruction)
5. Calculate the CPI penalty and execution time for a $1,000,000\text{-instruction}$ program where $20\%$ of instructions are Loads, and $40\%$ of those Loads trigger a Load-Use stall at $T_{\text{clk}} = 2.60\text{ ns}$.
6. Verify structural, mathematical, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive the Hazard Detection Boolean Equations

Let $\text{LoadUse\_Hazard}$ be the active-high hazard detection condition:

$$
\text{rs1\_match} = (\text{id\_ex\_rd} == \text{if\_id\_rs1}) \quad \land \quad (\text{id\_ex\_rd} \neq 0)
$$

$$
\text{rs2\_match} = (\text{id\_ex\_rd} == \text{if\_id\_rs2}) \quad \land \quad (\text{id\_ex\_rd} \neq 0)
$$

$$
\text{LoadUse\_Hazard} = \text{id\_ex\_mem\_read} \quad \land \quad (\text{rs1\_match} \lor \text{rs2\_match})
$$

Now derive the three interlock control output signals:

1. **PC Write Enable (`pc_write_en`)**: Active-high. Disabled ($0$) when a stall occurs:
   $$\text{pc\_write\_en} = \neg \text{LoadUse\_Hazard}$$
2. **IF/ID Register Write Enable (`if_id_write_en`)**: Active-high. Disabled ($0$) when a stall occurs:
   $$\text{if\_id\_write\_en} = \neg \text{LoadUse\_Hazard}$$
3. **ID/EX Control Flush (`id_ex_flush`)**: Active-high. Enabled ($1$) when a stall occurs to inject a NOP bubble:
   $$\text{id\_ex\_flush} = \text{LoadUse\_Hazard}$$

---

#### Step 2: Calculate Critical Path Propagation Delay ($t_{\text{hazard\_path}}$)

Let us trace the physical critical path through the Hazard Detection Unit:

1. 5-Bit Address Comparators (`rs1_match`, `rs2_match`): $t_{\text{comp}} = 0.12\text{ ns}$.
2. 2-Input OR Gate ($\text{rs1\_match} \lor \text{rs2\_match}$): $t_{\text{or}} = 0.05\text{ ns}$.
3. 2-Input AND Gate ($\text{id\_ex\_mem\_read} \land \text{OR\_out}$): $t_{\text{and}} = 0.08\text{ ns}$.
4. Control Flush MUX (`id_ex_flush` selection): $t_{\text{mux}} = 0.15\text{ ns}$.
5. PC Register Setup Time: $t_{\text{su\_pc}} = 0.15\text{ ns}$.

$$
t_{\text{hazard\_path}} = t_{\text{comp}} + t_{\text{or}} + t_{\text{and}} + t_{\text{mux}} + t_{\text{su\_pc}}
$$

$$
t_{\text{hazard\_path}} = 0.12\text{ ns} + 0.05\text{ ns} + 0.08\text{ ns} + 0.15\text{ ns} + 0.15\text{ ns} = \mathbf{0.550 \text{ ns}}
$$

##### Timing Slack Check at $T_{\text{clk}} = 2.60\text{ ns}$:
$$T_{\text{slack}} = T_{\text{clk}} - t_{\text{hazard\_path}} = 2.600\text{ ns} - 0.550\text{ ns} = \mathbf{+2.050 \text{ ns} \quad (POSITIVE SLACK!)}$$

The Hazard Detection Unit evaluates in **$0.550\text{ nanoseconds}$**, easily closing timing with $+2.050\text{ ns}$ of slack!

---

#### Step 3: Write the Synthesizable SystemVerilog Module

We construct `HazardDetectionSubsystem` using clean, modular SystemVerilog logic:

```systemverilog
`default_nettype none

// DEDICATED HAZARD DETECTION AND PIPELINE INTERLOCK SUBSYSTEM
module HazardDetectionSubsystem (
    input  logic       id_ex_mem_read,  // 1 if instruction in EX is Load (LW)
    input  logic [4:0] id_ex_rd,        // Destination register of instruction in EX
    input  logic [4:0] if_id_rs1,       // Source register 1 of instruction in ID
    input  logic [4:0] if_id_rs2,       // Source register 2 of instruction in ID
    output logic       pc_write_en,     // 1 = Enable PC write, 0 = Freeze PC
    output logic       if_id_write_en,  // 1 = Enable IF/ID write, 0 = Freeze IF/ID
    output logic       id_ex_flush      // 1 = Inject NOP Bubble into ID/EX
);

    logic rs1_match, rs2_match;
    logic load_use_hazard;

    // 1. Check Register Specifier Matches (with x0 Zero Protection)
    assign rs1_match = (id_ex_rd != 5'd0) && (id_ex_rd == if_id_rs1);
    assign rs2_match = (id_ex_rd != 5'd0) && (id_ex_rd == if_id_rs2);

    // 2. Load-Use Hazard Condition Logic
    assign load_use_hazard = id_ex_mem_read && (rs1_match || rs2_match);

    // 3. Interlock Control Signal Outputs
    assign pc_write_en    = ~load_use_hazard; // Freeze PC when hazard active
    assign if_id_write_en = ~load_use_hazard; // Freeze IF/ID when hazard active
    assign id_ex_flush    = load_use_hazard;  // Inject NOP Bubble when hazard active

endmodule

`default_nettype wire
```

---

#### Step 4: Simulate a Load-Use Hazard Execution Sequence

Let us trace the execution of our program sequence across 6 clock cycles:
* `Inst 1`: `LW x1, 0(x2)`
* `Inst 2`: `ADD x3, x1, x4` (Load-Use hazard on $x1$!)
* `Inst 3`: `SUB x5, x6, x7` (Independent instruction)

```text
LOAD-USE HAZARD PIPELINE EXECUTION TRACE

 Cycle │ IF Stage     │ ID Stage     │ EX Stage     │ MEM Stage    │ WB Stage     │ Interlock Status
───────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────
   1   │ LW x1,0(x2)  │ (Empty)      │ (Empty)      │ (Empty)      │ (Empty)      │ Normal Fetch
   2   │ ADD x3,x1,x4 │ LW x1,0(x2)  │ (Empty)      │ (Empty)      │ (Empty)      │ Normal Decode
   3   │ SUB x5,x6,x7 │ ADD x3,x1,x4 │ LW x1,0(x2)  │ (Empty)      │ (Empty)      │ HAZARD DETECTED!
       │              │              │ (MemRead=1)  │              │              │ Interlock Fired!
   4   │ SUB x5,x6,x7 │ ADD x3,x1,x4 │ NOP BUBBLE   │ LW x1,0(x2)  │ (Empty)      │ STALL CYCLE! PC/IF-ID Frozen!
       │ (FROZEN!)    │ (FROZEN!)    │ (Control=00) │              │              │ LW reads memory data!
   5   │ (Next Inst)  │ SUB x5,x6,x7 │ ADD x3,x1,x4 │ NOP BUBBLE   │ LW x1,0(x2)  │ FWD: MEM/WB -> EX (x1=Data!)
   6   │ (Next Inst)  │ (Next Inst)  │ SUB x5,x6,x7 │ ADD x3,x1,x4 │ NOP BUBBLE   │ Pipeline Resumed!
```

```text
INTERLOCK CONTROL SIGNAL WAVEFORMS

 clk            : 00001111000011110000111100001111000011110000
                  ▲           ▲           ▲           ▲
                  │ Cycle 2   │ Cycle 3   │ Cycle 4   │ Cycle 5
                  │           │           │           │
 load_use_hazard: 00000000000011111111111100000000000000000000
                               ▲
                               └── Load-Use Hazard Detected on Cycle 3!
 pc_write_en    : 11111111111100000000000011111111111111111111
 if_id_write_en : 11111111111100000000000011111111111111111111
 id_ex_flush    : 00000000000011111111111100000000000000000000
                               ▲
                               └── Injects NOP Bubble into ID/EX on Cycle 4!
```

##### Detailed Cycle Trace Analysis:
1. **Cycle 3**:
   * `LW` is in EX (`id_ex_mem_read = 1`, `id_ex_rd = x1`).
   * `ADD` is in ID (`if_id_rs1 = x1`).
   * `HazardDetectionSubsystem` evaluates `load_use_hazard = 1`.
   * Asserts `pc_write_en = 0`, `if_id_write_en = 0`, `id_ex_flush = 1`.
2. **Cycle 4 (STALL CYCLE)**:
   * PC stays at `SUB`'s address. `SUB` remains in the IF stage.
   * `IF/ID` register stays holding `ADD`. `ADD` remains parked in the ID stage.
   * `ID/EX` register captures `8'h00` (NOP Bubble enters EX stage).
   * `LW` moves to MEM stage and reads memory data.
3. **Cycle 5**:
   * `load_use_hazard` drops to $0$. Interlock releases.
   * `ADD` moves into EX stage. `LW` moves to WB stage.
   * **MEM-to-EX Operand Forwarding** feeds the freshly loaded memory data from `MEM/WB` directly into the ALU!

---

#### Step 5: Calculate CPI Penalty and Program Execution Time

Given:
* $N_{\text{inst}} = 1,000,000$ instructions.
* $f_{\text{load}} = 20\%$ ($0.20$).
* $p_{\text{use}} = 40\%$ ($0.40$).
* Clock Period $T_{\text{clk}} = 2.60\text{ ns}$.

##### 1. Calculate Pipelined CPI ($CPI_{\text{pipelined}}$):
$$
CPI_{\text{pipelined}} = 1.0 + (f_{\text{load}} \cdot p_{\text{use}} \cdot 1)
$$
$$
CPI_{\text{pipelined}} = 1.0 + (0.20 \cdot 0.40 \cdot 1) = 1.0 + 0.08 = \mathbf{1.08 \text{ cycles/instruction}}
$$

##### 2. Calculate Total Execution Time ($T_{\text{exec}}$):
$$
T_{\text{exec}} = N_{\text{inst}} \cdot CPI_{\text{pipelined}} \cdot T_{\text{clk}}
$$
$$
T_{\text{exec}} = 1,000,000 \cdot 1.08 \cdot 2.60\text{ ns} = 2,808,000\text{ ns} = \mathbf{2.808 \text{ ms}} \quad (2.808\text{ milliseconds})
$$

The $1,000,000\text{-instruction}$ program completes in **$2.808\text{ milliseconds}$**.

---

### Sanity Check and Verification

Let us verify our Hazard Detection Subsystem against all microarchitectural safety rules:

1. **Interlock Hold Verification (Cycle 4)**:
   * Program Counter held its value (`pc_write_en = 0`).
   * `IF/ID` register held `ADD x3, x1, x4` (`if_id_write_en = 0`).
   * **Verification**: `ADD` instruction was not lost or corrupted during the stall.

2. **NOP Bubble Injection Verification (Cycle 4)**:
   * `id_ex_flush = 1` forced control bits entering `ID/EX` to `8'h00`.
   * `RegWrite = 0` and `MemWrite = 0` in EX stage.
   * **Verification**: NOP bubble executed safely without corrupting any registers or memory locations.

3. **Timing Closure Verification**:
   * Hazard detection critical path $t_{\text{hazard\_path}} = 0.550\text{ ns}$.
   * Timing Slack at $2.60\text{-ns}$ clock: $T_{\text{slack}} = +2.050\text{ ns} \ge 0$.
   * **Verification**: Complete timing closure achieved.

All simulation steps, hazard detection Boolean equations, interlock control signals, and CPI performance calculations evaluate with 100% mathematical, physical, and logical precision. The `HazardDetectionSubsystem` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Load-Use Data Hazard**: A microarchitectural pipeline hazard that occurs when an instruction in the ID stage attempts to read a register produced by an immediately preceding Load instruction currently in the EX stage, creating a 1-cycle time-space gap that cannot be resolved by operand forwarding alone.
* **Hazard Detection Unit**: The combinational control unit sitting in the ID stage that continuously compares destination registers of in-flight instructions against source registers of decoded instructions to detect Load-Use hazards and trigger pipeline interlocks.
* **Pipeline Interlock Stall & Bubble Insertion**: The hazard mitigation technique of freezing the Program Counter (`PCWrite = 0`) and IF/ID pipeline register (`IF_ID_Write = 0`) for 1 clock cycle while zeroing out control signals (`ID_EX_Flush = 1`) to inject a harmless No-Operation (NOP) bubble into the EX stage.
