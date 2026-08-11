# Control Hazards, Branch Execution Penalties, and Pipeline Flushing Networks

## The Branch Decision Gap: When Pipelining Fetches the Wrong Path

In a 5-stage pipelined processor core (Instruction Fetch - IF, Instruction Decode - ID, Execute - EX, Memory Access - MEM, Writeback - WB), instructions move down an assembly line. Every time the central system clock completes one cycle, every instruction in the pipeline advances to the next stage, and the Instruction Fetch unit automatically fetches a new instruction from memory address $PC + 4$.

As long as a program executes straight, sequential arithmetic code (`ADD`, `SUB`, `AND`, `OR`), this assembly-line fetching works with flawless, predictable precision. On Cycle 1, the processor fetches Instruction 1; on Cycle 2, it fetches Instruction 2; on Cycle 3, it fetches Instruction 3.

However, computer programs are not straight, uninterrupted lines of text. Programs contain conditional control structures (`if-else` decisions, `while` loops, function calls) implemented using **Conditional Branch Instructions** (`BEQ rs1, rs2, offset`).

A conditional branch instruction says: *"Compare the values in register $rs1$ and register $rs2$. If they are equal, jump away from sequential execution and start fetching instructions from a completely different memory location ($PC + \text{offset}$)."*

Now, let us trace what happens when a conditional branch instruction (`BEQ`) enters a 5-stage pipelined CPU:

```text
SPECULATIVE FETCH TIMELINE BEFORE BRANCH DECISION IS KNOWN

 Clock Cycle 1 : [ BEQ Inst ] in IF stage  ──► Fetches BEQ at Address 0x0000. PC <= 0x0004.
 Clock Cycle 2 : [ Inst A   ] in IF stage  ──► Fetches Inst A at Address 0x0004!
                 [ BEQ Inst ] in ID stage  ──► Decodes BEQ opcode.
 Clock Cycle 3 : [ Inst B   ] in IF stage  ──► Fetches Inst B at Address 0x0008!
                 [ Inst A   ] in ID stage  ──► Decodes Inst A.
                 [ BEQ Inst ] in EX stage! ──► ALU calculates (rs1 - rs2) & Target 0x0080!
                                               (BRANCH IS TAKEN!)
```

Look closely at the physical disaster occurring on **Clock Cycle 3**:

1. On Clock Cycle 3, the `BEQ` instruction is sitting in the **EX stage**. The Arithmetic Logic Unit (ALU) evaluates $rs1 - rs2$ and calculates the branch target address `0x0080`. The ALU's zero flag asserts High ($1$), confirming that $rs1 == rs2$. **The branch is TAKEN!** The processor is required to jump to memory address `0x0080`.
2. But look at what the Instruction Fetch unit has been doing while `BEQ` was traveling down the pipeline during Cycles 2 and 3!
   * On Cycle 2, the IF unit blindly fetched **Instruction A** from sequential address `0x0004`.
   * On Cycle 3, the IF unit blindly fetched **Instruction B** from sequential address `0x0008`.

```text
SPECULATIVE INSTRUCTION POLLUTION ON CYCLE 3

 Target Jump Address : 0x0080 (Where the CPU SHOULD be executing!)
                       ▲
                       │
 Actual Pipeline State:
   * Stage 1 (IF) : [ Inst B at 0x0008 ] ──► WRONG INSTRUCTION! (Speculative Garbage)
   * Stage 2 (ID) : [ Inst A at 0x0004 ] ──► WRONG INSTRUCTION! (Speculative Garbage)
   * Stage 3 (EX) : [ BEQ Instruction  ] ──► Evaluates Branch TAKEN to 0x0080!
```

Look at the physical crisis in the pipeline!

The processor has ALREADY fetched Instruction A (currently sitting in the ID stage) and Instruction B (currently sitting in the IF stage).

These two instructions belong to the sequential $PC+4$ path that **should NEVER have executed**! They are invalid "speculative garbage" instructions.

If the processor allows Instruction A and Instruction B to continue moving down the pipeline into the MEM and WB stages, they will overwrite user registers, modify Data Memory, and ruin the execution of the entire program!

This temporal delay between fetching an instruction and determining its actual control flow direction is a **Control Hazard** (also called a Branch Hazard).

To preserve program correctness, the processor must execute a two-part recovery routine:
1. It must immediately override the Program Counter ($PC$) and redirect it to fetch from the correct branch target address (`0x0080`).
2. It must **purge and destroy** the invalid speculative instructions (Instruction A and Instruction B) that are already sitting inside the IF and ID stages before they can alter any state!

The microarchitectural mechanism used to purge invalid speculative instructions in a single clock cycle is **Hardware Pipeline Flushing**.

---

## The Train Conductor at the Night Switch: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of control hazards, speculative pollution, and pipeline flushing networks, let us picture an express train driving through the countryside at midnight.

Imagine a high-speed passenger train traveling down a railway track at $100 \text{ km/h}$. The train consists of a locomotive engine (**The EX Stage Instruction**) followed by multiple passenger cars (**Speculatively Fetched Instructions in ID and IF**).

```text
THE TRAIN AT THE NIGHT TRACK FORK

 Engine (BEQ) ──►[ Car 1 (Inst A) ]──►[ Car 2 (Inst B) ]──► Main Straight Line
                                                            (Track Fork Ahead!)
```

The train is approaching a track fork. The main line continues straight toward Station A, but a side branch curves off toward Station B.

Standing in the locomotive engine at midnight is the Train Conductor (**The Branch Control Unit**). Because it is dark, the conductor cannot see the track switch signal until the engine gets right up to the junction (the **EX stage**).

Let us trace what happens as the train approaches the junction:

1. **At Kilometer 1 (IF Stage)**: The engine passes over the initial sensor. The automated system assumes the train will go straight toward Station A, so it automatically couples **Car 1 (Instruction A)** onto the back of the train.
2. **At Kilometer 2 (ID Stage)**: The engine moves forward. The automated system couples **Car 2 (Instruction B)** onto the back of the train.
3. **At Kilometer 3 (EX Stage)**: The engine's powerful headlight finally illuminates the physical track switch. The conductor sees that the track switch is **SET TO THE CURVED DETOUR TOWARD STATION B!**

```text
DISCOVERING THE SWITCH IS SET TO DETOUR

 Track Switch Sign : DETOUR TO STATION B! (Branch Taken!)
                     │
                     ▼
 Engine (EX Stage)   : Sees switch! Must turn onto Detour Track!
 Car 1 (ID Stage)    : Has ALREADY rolled onto the Straight Track!
 Car 2 (IF Stage)    : Has ALREADY rolled onto the Straight Track!
```

Look at the conductor's emergency dilemma!
* The engine is turning onto the curved detour track toward Station B.
* But Car 1 and Car 2 have **already rolled onto the straight track toward Station A!**
* If Car 1 and Car 2 remain attached to the train, the train will literally snap in half and derail!

---

### The Conductor's Emergency Recovery Routine (Pipeline Flushing)

To prevent a catastrophic train derailment, the conductor pulls an emergency uncoupling lever (**The Pipeline Flush Signal**):

```text
EMERGENCY UNCOUPLING (PIPELINE FLUSH)

 Engine ──► Turns onto Detour Track (PC <= 0x0080)
             │
             X Uncoupling Lever Fired! (Flush = 1)
             │
 Car 1 & Car 2 ──► Dumped into a Dead-End Siding! (Converted to NOP Bubbles)
                   (They empty out and roll away harmlessly!)
```

Look at the conductor's emergency actions:
1. **Redirect the Engine**: The conductor turns the locomotive engine onto the correct detour track toward Station B ($PC \Leftarrow \text{Branch\_Target\_0x0080}$).
2. **Dump the Wrong Cars (Pipeline Flush)**: The uncoupling lever unhooks Car 1 and Car 2 and diverts them into an empty, dead-end scrap siding. 
3. **Empty Trash (NOP Bubbles)**: The dumped cars carry no passengers and do no work. They roll away harmlessly without ever arriving at Station A.
4. **Attach New Cars**: The engine begins pulling brand-new passenger cars down the correct detour track toward Station B.

The time and energy lost dumping Car 1 and Car 2 into the scrap siding is the **Branch Penalty Delay**.

This emergency uncoupling routine is the exact physical analogue of **Pipeline Flushing**:
* The locomotive engine is the **Branch Instruction (`BEQ`)**.
* Car 1 and Car 2 are **Speculatively Fetched Instructions A and B**.
* The curved detour track is the **Branch Target Address (`0x0080`)**.
* The emergency uncoupling lever is the **Hardware Pipeline Flush Signal (`if_id_flush = 1`, `id_ex_flush = 1`)**.
* The dead-end scrap siding is **Converting Control Signals to Zero (NOP Bubbles)**.

---

## Primitive 1: Control Hazards and the Branch Penalty Gap

To master control hazard mitigation in digital hardware, we must analyze the exact time-space gap that occurs when a branch instruction alters the Program Counter ($PC$) in a 5-stage pipeline.

In a classic 5-stage RISC pipeline, a conditional branch instruction (`BEQ rs1, rs2, offset`) requires three operations:
1. **Instruction Fetch (IF)**: Fetch `BEQ` from memory.
2. **Instruction Decode (ID)**: Read register values $rs1$ and $rs2$ from the Register File.
3. **Execute (EX)**:
   * Evaluate branch condition: The ALU subtracts $rs1 - rs2$ and generates the `Zero` flag ($1$ if $rs1 == rs2$).
   * Calculate branch target address: A dedicated adder computes $PC_{\text{target}} = PC + \text{Imm32}$.

```text
BRANCH DECISION TIMING IN EX STAGE (STAGE 3)

 Clock Cycle 1 : [ BEQ Inst ] in IF stage  ──► PC fetches BEQ at 0x0000
 Clock Cycle 2 : [ Inst A   ] in IF stage  ──► PC fetches Inst A at 0x0004 (Speculative)
                 [ BEQ Inst ] in ID stage
 Clock Cycle 3 : [ Inst B   ] in IF stage  ──► PC fetches Inst B at 0x0008 (Speculative)
                 [ Inst A   ] in ID stage
                 [ BEQ Inst ] in EX stage! ──► PCSrc = Branch & Zero = 1 (TAKEN!)
                                               (Branch decision known at END of Cycle 3!)
```

---

### Quantifying the Branch Penalty Gap

Look at the timing chronology above:
* On **Clock Cycle 3**, the `BEQ` instruction reaches the EX stage. At the end of Cycle 3, the ALU asserts $\text{PCSrc} = 1$, confirming that the branch is taken.
* The new branch target address $PC_{\text{target}} = \text{0x0080}$ is presented to the PC register MUX at the end of Cycle 3.
* On **Clock Cycle 4**, the PC register captures $PC = \text{0x0080}$ and fetches the true target instruction (`Inst Target`) from Instruction Memory.

Now, count how many speculative instructions entered the pipeline behind `BEQ` between Cycle 1 and Cycle 4:
* **Instruction A** (fetched at $PC+4 = \text{0x0004}$ on Cycle 2) sits in the **ID stage** on Cycle 3.
* **Instruction B** (fetched at $PC+8 = \text{0x0008}$ on Cycle 3) sits in the **IF stage** on Cycle 3.

```text
THE 2-CYCLE BRANCH PENALTY GAP

 Clock Cycle 3 Pipeline Contents:
 [ IF Stage: Inst B (Wrong) ] ──► [ ID Stage: Inst A (Wrong) ] ──► [ EX Stage: BEQ (Taken!) ]
 ◄───────────────────── 2 Invalid Instructions ─────────────────────►
```

Because two invalid instructions entered the pipeline behind `BEQ` before the branch decision was known:
> **Evaluating a conditional branch in the EX stage incurs a 2-Clock-Cycle Branch Penalty ($N_{\text{penalty}} = 2$).**

If the branch is **Taken**, those two speculative instructions (Instruction A and Instruction B) MUST be flushed and replaced with NOP bubbles on Cycle 4!

If the branch is **Not-Taken**, the sequential instructions (Instruction A and Instruction B) are the correct instructions! Zero penalty cycles are incurred, and the pipeline continues streaming without a single flush!

---

## Primitive 2: Hardware Pipeline Flushing Networks

How does the processor physically purge Instruction A and Instruction B from the pipeline on Clock Cycle 4 without corrupting registers or memory?

It uses a **Hardware Pipeline Flushing Network**.

Flushing an instruction does NOT mean reversing physical time or erasing memory chips. 

In digital hardware, **flushing an instruction means zeroing out its control signals ($\mathbf{C} = \mathbf{0}$) inside its interstage pipeline register**, converting the instruction into a harmless No-Operation (NOP) bubble!

```text
CONVERTING AN INSTRUCTION TO A NOP BUBBLE VIA FLUSHING

 Valid Instruction Control Vector   : { RegWrite=1, MemWrite=0, ALUSrc=1 }
                                           │
                                           ▼ id_ex_flush = 1 (Asserted!)
 Flushed NOP Bubble Control Vector  : { RegWrite=0, MemWrite=0, ALUSrc=0 }
                                           │
                                           ▼
 (RegWrite=0 & MemWrite=0 guarantees ZERO register or memory modification!)
```

Let us trace the physical flushing actions executed simultaneously on Clock Cycle 4 when the EX stage asserts $\text{PCSrc} = 1$:

---

### Action 1: Load Branch Target Address into PC ($\text{PCSrc} = 1$)
The branch logic in the EX stage asserts $\text{PCSrc} = 1$.
* The Next-PC multiplexer in the IF stage overrides $PC + 4$ and selects $PC_{\text{target}} = \text{0x0080}$.
* On `posedge clk` at the start of Cycle 4, the PC register captures `0x0080`. The IF stage begins reading the correct target instruction from Instruction Memory!

---

### Action 2: Flush the IF/ID Pipeline Register (`if_id_flush = 1`)
To purge **Instruction B** (sitting in the IF stage on Cycle 3):
* The control unit asserts `if_id_flush = 1`.
* A 2-to-1 multiplexer placed at the input of the IF/ID pipeline register overrides the incoming instruction word from Instruction Memory and forces the instruction field to **`32'h0000_0013`** (the canonical RISC-V encoding for `ADDI x0, x0, 0` / `NOP`).
* On `posedge clk` at the start of Cycle 4, the IF/ID register captures `32'h0000_0013`. Instruction B is officially dead!

---

### Action 3: Flush the ID/EX Pipeline Register (`id_ex_flush = 1`)
To purge **Instruction A** (sitting in the ID stage on Cycle 3):
* The control unit asserts `id_ex_flush = 1`.
* A 2-to-1 multiplexer placed at the input of the ID/EX pipeline register overrides the decoded control signals and forces the control vector to **`8'b0000_0000`**.
* On `posedge clk` at the start of Cycle 4, the ID/EX register captures `RegWrite = 0`, `MemWrite = 0`, `MemRead = 0`. Instruction A is officially dead!

```text
PIPELINE FLUSHING HARDWARE SCHEMATIC

 EX Stage Branch Logic ──► PCSrc = Branch & Zero
                             │
                             ├─────────────────────────────────────────┐
                             ▼                                         ▼
                     [ IF/ID Flush MUX ]                       [ ID/EX Flush MUX ]
                     (Forces Inst = 0x00000013)                (Forces Control = 0x00)
                             │                                         │
                             ▼                                         ▼
                     [ IF/ID Register ]                        [ ID/EX Register ]
                     (Holds NOP Bubble)                        (Holds NOP Bubble)
```

Look at the pipeline state on **Clock Cycle 4** after flushing:
* **Stage 1 (IF)**: Fetches `Inst Target` from address `0x0080`.
* **Stage 2 (ID)**: Holds NOP Bubble B (`if_id_inst = 0x00000013`).
* **Stage 3 (EX)**: Holds NOP Bubble A (`id_ex_ctrl = 0x00`).
* **Stage 4 (MEM)**: `BEQ` instruction completes its branch decision.

As NOP Bubble A and NOP Bubble B move through the MEM and WB stages on Cycles 5 and 6, their `RegWrite = 0` and `MemWrite = 0` control bits ensure they modify zero registers and zero memory locations. They disappear from the end of the pipeline as harmless air!

---

## Reducing Branch Penalty: Moving Branch Evaluation to the ID Stage

In a classic 5-stage pipeline, evaluating branches in the EX stage (Stage 3) incurs a **2-cycle branch penalty**. 

Can we redesign the processor datapath to reduce this penalty from 2 clock cycles down to **1 clock cycle**?

**Yes!** By moving the branch evaluation logic from the EX stage (Stage 3) forward into the **ID stage (Stage 2)**!

```text
REDUCING BRANCH PENALTY: EX STAGE VS ID STAGE EVALUATION

 EX-Stage Branching (Stage 3) : [ IF ]──►[ ID ]──►[ EX (Branch!) ]
                                ◄── 2 Flushed Instructions ──► (2-Cycle Penalty)

 ID-Stage Branching (Stage 2) : [ IF ]──►[ ID (Branch!) ]
                                ◄── 1 Flushed Inst ──► (1-Cycle Penalty!)
```

---

### Hardware Architecture of ID-Stage Branch Evaluation

To evaluate conditional branches in Stage 2 (ID) instead of Stage 3 (EX), we must add two dedicated hardware units directly to the ID stage:

1. **Early Branch Target Adder**: A dedicated 32-bit adder sitting in the ID stage that continuously computes $PC_{\text{branch}} = \text{IF\_ID\_pc} + \text{Imm32}$.
2. **Early Equality Comparator**: A dedicated 32-bit fast equality comparator connected directly to the Register File read output ports ($\text{rs1\_data}$ and $\text{rs2\_data}$) in the ID stage.

$$\text{Early\_Zero} = (\text{rs1\_data} == \text{rs2\_data})$$

$$\text{PCSrc\_ID} = \text{ID\_Branch} \cdot \text{Early\_Zero}$$

```text
ID-STAGE EARLY BRANCH EVALUATION SCHEMATIC

 Register Read 1 rs1_data ──┐
                            ├──►[ 32-Bit Equal Comp ]──► Early_Zero ──┐
 Register Read 2 rs2_data ──┘                                         ├──► PCSrc_ID
                                                      ID_Branch ──────┘
```

---

### The 1-Cycle Branch Penalty Execution Flow

Let us trace what happens when a taken branch instruction (`BEQ`) is evaluated in the ID stage on **Clock Cycle 2**:

1. **Cycle 1**: `BEQ` is fetched in IF. $PC$ advances to $PC + 4$.
2. **Cycle 2**: `BEQ` enters the **ID stage**.
   * The Register File outputs $rs1$ and $rs2$ data.
   * The Early Equality Comparator evaluates $rs1 == rs2$ in real time during the ID stage!
   * The Early Branch Adder computes $PC_{\text{branch}} = PC + \text{Imm32}$.
   * At the end of Cycle 2, the ID stage asserts $\text{PCSrc\_ID} = 1$!
3. **Flushing Action on Cycle 2**:
   * What instruction is sitting in the IF stage on Cycle 2? **Only Instruction A** (fetched from $PC + 4$).
   * Because the branch decision is known at the end of Cycle 2, **ONLY Instruction A must be flushed (`if_id_flush = 1`)**!
   * Instruction B was never fetched in the first place!
4. **Cycle 3**: $PC$ captures $PC_{\text{branch}}$. The IF stage fetches `Inst Target` from address $PC_{\text{branch}}$.

```text
1-CYCLE BRANCH PENALTY CHRONOLOGY (ID-STAGE BRANCHING)

 Cycle 1 : [ BEQ Inst ] in IF stage  ──► PC fetches BEQ at 0x0000. PC <= 0x0004.
 Cycle 2 : [ Inst A   ] in IF stage  ──► PC fetches Inst A at 0x0004 (Speculative).
           [ BEQ Inst ] in ID stage! ──► Early Comp evaluates TAKEN!
                                         if_id_flush = 1 (Flush Inst A!).
                                         PC <= Branch_Target_0x0080.
 Cycle 3 : [ Inst Target ] in IF stage! (Correct target fetched!)
           [ NOP Bubble  ] in ID stage.
```

Look at the microarchitectural speedup!
By evaluating the branch in the ID stage:
* The branch penalty is reduced from **2 clock cycles down to 1 clock cycle**!
* Only a single interstage register (`IF/ID`) needs to be flushed!

---

### The Trade-Offs of ID-Stage Branching

Why don't all processors evaluate branches in the ID stage?

Moving branch evaluation to the ID stage introduces two physical hardware trade-offs:

1. **Increased ID Stage Critical Path ($t_{\text{ID}}$)**:
   Reading the Register File AND passing two 32-bit numbers through an equality comparator AND driving the Next-PC MUX all within Stage 2 increases the ID stage propagation delay. If $t_{\text{ID}}$ becomes too large, it can slow down the maximum operating clock frequency ($f_{\text{max}}$) of the entire CPU.
2. **Increased Data Hazard Forwarding Complexity**:
   If a preceding instruction in the EX stage calculates a register value that is needed by a branch instruction currently in the ID stage, the data must be forwarded **into the ID stage's equality comparator**! This requires building extra forwarding multiplexers in front of the ID stage comparator, complicating the hazard detection unit.

---

## Impact of Branch Penalties on Processor CPI and Throughput

How much do control hazards degrade processor performance, and how do we quantify their impact mathematically?

In an ideal 5-stage pipeline with no hazards, the processor emits 1 completed instruction per clock cycle, achieving an ideal **Cycles Per Instruction ($CPI_{\text{ideal}} = 1.0$)**.

Every time a conditional branch instruction is **taken**, the pipeline must flush speculatively fetched instructions, adding $N_{\text{penalty}}$ penalty clock cycles to the execution time.

---

### Deriving the Pipelined CPI Equation with Branch Penalties

Let:
* $f_{\text{branch}}$ be the fraction of instructions in a workload that are conditional branches (typically $15\% \text{ to } 20\%$).
* $p_{\text{taken}}$ be the probability that a branch instruction evaluates as **Taken** (typically $60\% \text{ to } 70\%$).
* $N_{\text{penalty}}$ be the branch flush penalty in clock cycles ($N_{\text{penalty}} = 2$ for EX branching, $N_{\text{penalty}} = 1$ for ID branching).

The average Cycles Per Instruction ($CPI_{\text{pipelined}}$) is:

$$
CPI_{\text{pipelined}} = CPI_{\text{ideal}} + \left( f_{\text{branch}} \cdot p_{\text{taken}} \cdot N_{\text{penalty}} \right)
$$

$$
CPI_{\text{pipelined}} = 1.0 + \left( f_{\text{branch}} \cdot p_{\text{taken}} \cdot N_{\text{penalty}} \right)
$$

Where:
* $CPI_{\text{pipelined}}$ is the actual average cycles per instruction including branch penalty stalls.
* $f_{\text{branch}}$ is the branch instruction frequency ($0 \le f_{\text{branch}} \le 1.0$).
* $p_{\text{taken}}$ is the branch taken probability ($0 \le p_{\text{taken}} \le 1.0$).
* $N_{\text{penalty}}$ is the branch flush penalty in cycles.

---

### Quantitative Performance Comparison Example

Let us evaluate a processor running a benchmark program of $N_{\text{inst}} = 1,000,000$ instructions where $20\%$ of instructions are conditional branches ($f_{\text{branch}} = 0.20$), and $65\%$ of those branches are taken ($p_{\text{taken}} = 0.65$).

We compare two processor microarchitectures running at $T_{\text{clk}} = 2.50\text{ ns}$ ($f_{\text{max}} = 400\text{ MHz}$):

#### Architecture A: EX-Stage Branching ($N_{\text{penalty}} = 2$ Cycles)
* **Average CPI**:
  $$CPI_A = 1.0 + (0.20 \cdot 0.65 \cdot 2) = 1.0 + 0.26 = \mathbf{1.26 \text{ cycles/instruction}}$$
* **Total Execution Time ($T_{\text{exec\_A}}$)**:
  $$T_{\text{exec\_A}} = 1,000,000 \cdot 1.26 \cdot 2.50\text{ ns} = \mathbf{3,150,000 \text{ ns}} \quad (3.15\text{ ms})$$

---

#### Architecture B: ID-Stage Branching ($N_{\text{penalty}} = 1$ Cycle)
* **Average CPI**:
  $$CPI_B = 1.0 + (0.20 \cdot 0.65 \cdot 1) = 1.0 + 0.13 = \mathbf{1.13 \text{ cycles/instruction}}$$
* **Total Execution Time ($T_{\text{exec\_B}}$)**:
  $$T_{\text{exec\_B}} = 1,000,000 \cdot 1.13 \cdot 2.50\text{ ns} = \mathbf{2,825,000 \text{ ns}} \quad (2.825\text{ ms})$$

---

#### Throughput Speedup Analysis:

$$
\text{Performance Gain} = \left( 1 - \frac{T_{\text{exec\_B}}}{T_{\text{exec\_A}}} \right) \times 100\% = \left( 1 - \frac{2.825}{3.150} \right) \times 100\% \approx \mathbf{10.32\%}
$$

By reducing the branch penalty from 2 cycles to 1 cycle using ID-stage branch evaluation, the processor completes the $1,000,000\text{-instruction}$ program **$10.32\%$ faster**!

```text
BRANCH PENALTY PERFORMANCE COMPARISON MATRIX

 Architecture Option      │ Flush Penalty │ Average CPI │ Execution Time (1M Inst) │ Performance Gain
──────────────────────────┼───────────────┼─────────────┼──────────────────────────┼──────────────────
 EX-Stage Branching (A)   │ 2 Cycles      │ 1.26 CPI    │ 3.150 ms                 │ Baseline (0.0%)
 ID-Stage Branching (B)   │ 1 Cycle       │ 1.13 CPI    │ 2.825 ms                 │ +10.32% Faster!
```

---

## Solved Industrial Engineering Exercise: Complete Branch Control and Pipeline Flushing Subsystem Synthesis

To consolidate your complete mastery of control hazards, speculative instruction pollution, 2-cycle vs 1-cycle branch penalties, pipeline flushing multiplexers, and CPI performance equations, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are an ASIC microarchitect designing the **Branch Control and Pipeline Flushing Subsystem** (`BranchFlushingSubsystem`) for a 32-bit RISC-V 5-stage pipelined processor core.

The module evaluates conditional branches in the EX stage, controls $PC$ selection, and drives active-high flush lines `if_id_flush` and `id_ex_flush`.

```text
BRANCH CONTROL AND FLUSHING SUBSYSTEM INTERFACE

 EX Branch Control ex_branch           ──┐
 EX ALU Zero Flag ex_alu_zero          ──┼──► [ BranchFlushingSubsystem ] ──┬──► pc_src
 EX Branch Target ex_branch_target[31:0]─┤                               ├──► next_pc[31:0]
 IF Sequential PC if_pc_plus4[31:0]    ──┘                               ├──► if_id_flush
                                                                         └──► id_ex_flush
```

#### Physical Library Gate Delays (28nm Space-Grade CMOS):
* Branch Target Adder Delay: $t_{\text{adder}} = 0.90\text{ ns}$
* Branch Decision AND Gate Delay: $t_{\text{and}} = 0.08\text{ ns}$
* Flush MUX Selection Delay: $t_{\text{mux\_flush}} = 0.15\text{ ns}$
* Next-PC MUX Selection Delay: $t_{\text{mux\_pc}} = 0.18\text{ ns}$
* PC Register Setup Time: $t_{\text{su\_pc}} = 0.15\text{ ns}$
* Pipelined Clock Period: $T_{\text{clk}} = 2.60\text{ ns}$

#### Workload Benchmark Parameters:
* Total Instructions: $N_{\text{inst}} = 5,000,000$ instructions.
* Branch Instruction Frequency: $f_{\text{branch}} = 18\%$ ($0.18$).
* Branch Taken Probability: $p_{\text{taken}} = 70\%$ ($0.70$).

#### Your Objective

1. Derive the Boolean logic equations for `pc_src`, `next_pc[31:0]`, `if_id_flush`, and `id_ex_flush`.
2. Calculate the maximum critical path propagation delay ($t_{\text{branch\_path}}$) through the branch control and flushing unit, and evaluate setup timing slack ($T_{\text{slack}}$).
3. Write the complete, synthesizable SystemVerilog module `BranchFlushingSubsystem`.
4. Calculate the average CPI ($CPI_{\text{pipelined}}$) and total execution time ($T_{\text{exec}}$) for the $5,000,000\text{-instruction}$ benchmark program under EX-stage branching ($N_{\text{penalty}} = 2$).
5. Simulate and trace signal values across a 6-cycle execution sequence containing a Taken Branch instruction:
   * **Cycle 1**: `BEQ x1, x2, 0x0080` fetched in IF (`PC = 0x0000`).
   * **Cycle 2**: `BEQ` in ID; `Inst A` (0x0004) fetched speculatively in IF.
   * **Cycle 3**: `BEQ` in EX ($x1 == x2 \implies \text{Zero} = 1$, Branch Taken!); `Inst B` (0x0008) in IF; `Inst A` in ID $\to$ **BRANCH FLUSH FIRED!** (`if_id_flush = 1`, `id_ex_flush = 1`, `next_pc = 0x0080`).
   * **Cycle 4**: `BEQ` in MEM; `Inst A` converted to NOP Bubble in EX; `Inst B` converted to NOP Bubble in ID; `Inst Target` (0x0080) fetched in IF!
   * **Cycle 5**: `BEQ` in WB; `Inst Target` moves to ID; two NOP bubbles pass harmlessly through MEM/WB!
   * **Cycle 6**: `Inst Target` moves to EX. Pipeline execution resumes full speed at `0x0080`!
6. Verify structural, mathematical, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive the Branch Control and Flushing Boolean Equations

1. **Branch Taken Select Line (`pc_src`)**:
   Active-high signal that controls the Next-PC multiplexer. Asserts High ($1$) if the instruction in EX is a Branch (`ex_branch == 1`) AND the ALU evaluates equality (`ex_alu_zero == 1`):
   $$\text{pc\_src} = \text{ex\_branch} \cdot \text{ex\_alu\_zero}$$

2. **Next PC Output Bus (`next_pc[31:0]`)**:
   Selects between sequential $PC+4$ and the branch target address:
   $$\text{next\_pc} = (\text{pc\_src}) \,\, ? \,\, \text{ex\_branch\_target} : \text{if\_pc\_plus4}$$

3. **IF/ID Register Flush Control (`if_id_flush`)**:
   Asserts High ($1$) to purge the instruction currently sitting in the IF/ID register (Instruction B) when a branch is taken:
   $$\text{if\_id\_flush} = \text{pc\_src}$$

4. **ID/EX Register Flush Control (`id_ex_flush`)**:
   Asserts High ($1$) to purge the instruction currently sitting in the ID/EX register (Instruction A) when a branch is taken:
   $$\text{id\_ex\_flush} = \text{pc\_src}$$

---

#### Step 2: Calculate Critical Path Delay ($t_{\text{branch\_path}}$) and Timing Slack

Let us trace the physical propagation path through the branch control unit in the EX stage:

1. Branch Decision AND Gate: $t_{\text{and}} = 0.08\text{ ns}$.
2. Next-PC MUX Selection: $t_{\text{mux\_pc}} = 0.18\text{ ns}$.
3. PC Register Setup Time: $t_{\text{su\_pc}} = 0.15\text{ ns}$.

$$
t_{\text{branch\_path}} = t_{\text{and}} + t_{\text{mux\_pc}} + t_{\text{su\_pc}}
$$

$$
t_{\text{branch\_path}} = 0.08\text{ ns} + 0.18\text{ ns} + 0.15\text{ ns} = \mathbf{0.410 \text{ ns}}
$$

##### Setup Timing Slack ($T_{\text{slack}}$) at $T_{\text{clk}} = 2.60\text{ ns}$:

$$
T_{\text{slack}} = T_{\text{clk}} - t_{\text{branch\_path}} = 2.600\text{ ns} - 0.410\text{ ns} = \mathbf{+2.190 \text{ ns} \quad (POSITIVE SLACK!)}
$$

The branch control and flushing unit evaluates in **$0.410\text{ nanoseconds}$**, closing timing with $+2.190\text{ ns}$ of slack!

---

#### Step 3: Write the Synthesizable SystemVerilog Module

We implement `BranchFlushingSubsystem` and an integrated Pipelined Branch Controller:

```systemverilog
`default_nettype none

// DEDICATED BRANCH CONTROL AND PIPELINE FLUSHING SUBSYSTEM
module BranchFlushingSubsystem (
    input  logic        ex_branch,           // 1 if instruction in EX is Branch
    input  logic        ex_alu_zero,         // 1 if ALU zero flag is set (rs1 == rs2)
    input  logic [31:0] ex_branch_target,    // Target address from EX stage adder
    input  logic [31:0] if_pc_plus4,         // Sequential PC+4 address from IF stage
    output logic        pc_src,              // 1 = Select branch target, 0 = Select PC+4
    output logic [31:0] next_pc,             // Next PC value to drive PC register input
    output logic        if_id_flush,         // 1 = Purge IF/ID pipeline register (NOP)
    output logic        id_ex_flush          // 1 = Purge ID/EX pipeline register (NOP)
);

    // 1. Evaluate Branch Taken Condition
    assign pc_src = ex_branch & ex_alu_zero;

    // 2. Next PC Multiplexer
    assign next_pc = (pc_src) ? ex_branch_target : if_pc_plus4;

    // 3. Drive Flush Signals to Interstage Pipeline Registers
    // When branch is taken, purge BOTH speculative instructions in IF/ID and ID/EX!
    assign if_id_flush = pc_src;
    assign id_ex_flush = pc_src;

endmodule

// PIPELINED BRANCH CONTROLLER WITH INTEGRATED FLUSHING
module PipelinedBranchController (
    input  logic        clk,
    input  logic        reset_n,
    input  logic        ex_branch,
    input  logic        ex_alu_zero,
    input  logic [31:0] ex_branch_target,
    input  logic [31:0] if_pc_plus4,
    output logic [31:0] pc_curr,
    output logic        if_id_flush_out,
    output logic        id_ex_flush_out
);

    logic        pc_src;
    logic [31:0] next_pc;

    // Instantiate Branch Flushing Subsystem
    BranchFlushingSubsystem u_branch_subsystem (
        .ex_branch        (ex_branch),
        .ex_alu_zero      (ex_alu_zero),
        .ex_branch_target (ex_branch_target),
        .if_pc_plus4      (if_pc_plus4),
        .pc_src           (pc_src),
        .next_pc          (next_pc),
        .if_id_flush      (if_id_flush_out),
        .id_ex_flush      (id_ex_flush_out)
    );

    // Synchronous Program Counter Register
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            pc_curr <= 32'h0000_0000;
        end else begin
            pc_curr <= next_pc; // Capture next PC on clock edge
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 4: Calculate CPI and Total Program Execution Time

Given:
* $N_{\text{inst}} = 5,000,000$ instructions.
* $f_{\text{branch}} = 18\%$ ($0.18$).
* $p_{\text{taken}} = 70\%$ ($0.70$).
* $N_{\text{penalty}} = 2$ clock cycles.
* Clock Period $T_{\text{clk}} = 2.60\text{ ns}$.

##### 1. Calculate Average CPI ($CPI_{\text{pipelined}}$):
$$
CPI_{\text{pipelined}} = 1.0 + (f_{\text{branch}} \cdot p_{\text{taken}} \cdot N_{\text{penalty}})
$$
$$
CPI_{\text{pipelined}} = 1.0 + (0.18 \cdot 0.70 \cdot 2) = 1.0 + 0.252 = \mathbf{1.252 \text{ cycles/instruction}}
$$

##### 2. Calculate Total Execution Time ($T_{\text{exec}}$):
$$
T_{\text{exec}} = N_{\text{inst}} \cdot CPI_{\text{pipelined}} \cdot T_{\text{clk}}
$$
$$
T_{\text{exec}} = 5,000,000 \cdot 1.252 \cdot 2.60\text{ ns} = 16,276,000\text{ ns} = \mathbf{16.276 \text{ ms}} \quad (16.276\text{ milliseconds})
$$

The $5,000,000\text{-instruction}$ benchmark program completes in **$16.276\text{ milliseconds}$**.

---

#### Step 5: Simulate Taken Branch Execution Trace

Let us trace the pipeline state across 6 clock cycles when `BEQ x1, x2, 0x0080` is evaluated as Taken in the EX stage on Cycle 3:

```text
TAKEN BRANCH PIPELINE FLUSHING EXECUTION TRACE

 Cycle │ IF Stage (PC)   │ ID Stage      │ EX Stage      │ MEM Stage     │ WB Stage     │ Branch Action
───────┼─────────────────┼───────────────┼───────────────┼───────────────┼──────────────┼──────────────────────────────
   1   │ BEQ (0x0000)    │ (Empty/NOP)   │ (Empty/NOP)   │ (Empty/NOP)   │ (Empty/NOP)  │ Fetch BEQ at 0x0000
   2   │ Inst A (0x0004) │ BEQ (0x0000)  │ (Empty/NOP)   │ (Empty/NOP)   │ (Empty/NOP)  │ Speculative Fetch Inst A
   3   │ Inst B (0x0008) │ Inst A (0x04) │ BEQ (0x0000)  │ (Empty/NOP)   │ (Empty/NOP)  │ BRANCH TAKEN IN EX!
       │                 │               │ (Zero = 1!)   │               │              │ Flush Fired! PC <= 0x0080!
   4   │ Target (0x0080) │ NOP Bubble B  │ NOP Bubble A  │ BEQ (0x0000)  │ (Empty/NOP)  │ Inst A & B Converted to NOPs!
   5   │ Inst T+1 (0x84) │ Target (0x80) │ NOP Bubble B  │ NOP Bubble A  │ BEQ (0x0000) │ Target Instruction in ID
   6   │ Inst T+2 (0x88) │ Inst T+1(0x84)│ Target (0x80) │ NOP Bubble B  │ NOP Bubble A │ Target Instruction in EX!
```

```text
BRANCH FLUSH SIGNAL WAVEFORMS

 clk          : 0000111100001111000011110000111100001111
                ▲           ▲           ▲           ▲
                │ Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4
                │           │           │           │
 pc_curr      : [ 0x0000 ]──[ 0x0004 ]──[ 0x0008 ]──[ 0x0080 (Target!) ]===
 ex_alu_zero  : 0000000000000000000000001111111100000000
                                        ▲
                                        └── Zero = 1 in EX stage on Cycle 3!
 pc_src       : 0000000000000000000000001111111100000000
 if_id_flush  : 0000000000000000000000001111111100000000
 id_ex_flush  : 0000000000000000000000001111111100000000
                                        ▲
                                        └── Purges IF/ID and ID/EX on Cycle 4!
```

##### Detailed Cycle Analysis:
1. **Cycle 3**:
   * `BEQ` reaches the EX stage. The ALU evaluates $x1 - x2 = 0 \implies \text{ex\_alu\_zero} = 1$.
   * `BranchFlushingSubsystem` asserts `pc_src = 1`, `if_id_flush = 1`, `id_ex_flush = 1`.
   * `next_pc` selects `ex_branch_target` (`32'h0000_0080`).
2. **Cycle 4 (Flush Execution Cycle)**:
   * PC captures `32'h0000_0080`. The IF stage fetches `Inst Target` from address `0x0080`.
   * `IF/ID` register captures `32'h0000_0013` (NOP Bubble B). Instruction B is purged!
   * `ID/EX` register captures control vector `8'h00` (NOP Bubble A). Instruction A is purged!
3. **Cycles 5 & 6**:
   * NOP Bubble A and NOP Bubble B pass harmlessly through MEM and WB with `RegWrite = 0` and `MemWrite = 0`.
   * `Inst Target` moves down the pipeline into ID and EX. **Normal execution resumes at the target address!**

---

### Sanity Check and Verification

Let us verify our Branch Flushing Subsystem against all microarchitectural safety rules:

1. **Speculative Instruction Purge Verification (Cycle 4)**:
   * Instruction A (sitting in ID on Cycle 3) was converted to NOP Bubble A (`id_ex_ctrl = 0x00`).
   * Instruction B (sitting in IF on Cycle 3) was converted to NOP Bubble B (`if_id_inst = 0x00000013`).
   * **Verification**: Neither Instruction A nor Instruction B altered any registers or memory.

2. **Branch Target Jump Verification (Cycle 4)**:
   * PC captured `0x0080` on Cycle 4.
   * IF stage fetched `Inst Target` from `0x0080` on Cycle 4.
   * **Verification**: Branch target jump executed with $100\%$ address accuracy.

3. **Timing Closure Verification**:
   * Branch control critical path $t_{\text{branch\_path}} = 0.410\text{ ns}$.
   * Setup Slack at $2.60\text{-ns}$ clock: $T_{\text{slack}} = +2.190\text{ ns} \ge 0$.
   * **Verification**: Complete timing closure achieved.

All simulation steps, branch control Boolean equations, flushing multiplexer operations, and CPI performance calculations evaluate with 100% mathematical, physical, and logical precision. The `BranchFlushingSubsystem` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Control Hazard (Branch Hazard)**: A microarchitectural pipeline hazard that occurs when a conditional branch instruction alters the Program Counter in a downstream execution stage (EX or MEM), rendering instructions speculatively fetched behind the branch invalid.
* **Branch Penalty Delay**: The time overhead (measured in clock cycles) lost when a branch is taken and the pipeline must flush speculatively fetched instructions before resuming execution at the new branch target address.
* **Pipeline Flushing Network**: The hardware control circuit that zero-out control bus vectors (`if_id_flush = 1`, `id_ex_flush = 1`) inside interstage pipeline registers to convert invalid speculative instructions into harmless No-Operation (NOP) bubbles in a single clock cycle.
