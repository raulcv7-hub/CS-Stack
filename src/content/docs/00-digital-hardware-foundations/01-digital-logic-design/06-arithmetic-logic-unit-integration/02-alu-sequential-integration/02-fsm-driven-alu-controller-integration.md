---
title: "FSM-Driven ALU Controller Integration and Datapath Control Word Orchestration"
---

# FSM-Driven ALU Controller Integration and Datapath Control Word Orchestration

## The Uncoordinated Hardware Chaos of Uncontrolled Datapaths

An Arithmetic Logic Unit (ALU) connected to a multi-port register file across a shared datapath bus is a marvel of combinational and sequential execution. It can fetch two 32-bit operands from registers $R_1$ and $R_2$, compute a Two's Complement subtraction or bitwise logic operation, generate status flags ($Z, N, V, C$), and write the result back to register $R_3$ in a single clock cycle.

However, an ALU datapath on its own is entirely passive. It possesses no internal initiative, no concept of an algorithm, and no memory of what step should come next.

Consider a multi-step computing algorithm, such as calculating the mathematical expression $R_3 = (R_1 + R_2) \cdot R_0$, or executing a conditional loop that repeatedly decrements $R_1$ until $R_1 = 0$. 

To execute $R_3 = (R_1 + R_2) \cdot R_0$ on a shared datapath:
* **Clock Cycle 1**: The system must configure the register file to output $R_1$ onto Read Bus A and $R_2$ onto Read Bus B, command the ALU to execute Addition ($000_2$), and route the result into a temporary buffer register $R_{\text{temp}}$.
* **Clock Cycle 2**: The system must reconfigure the register file to output $R_{\text{temp}}$ onto Read Bus A and $R_0$ onto Read Bus B, command the ALU to execute bitwise AND ($010_2$), and route the final result into Destination Register $R_3$.

```text
THE MULTI-STEP EXECUTION CONTROL PROBLEM

 Cycle 1: [ Read R1, R2 ] ──► [ ALU ADD ] ──► [ Write Temp R_temp ]
 Cycle 2: [ Read R_temp, R0 ] ─► [ ALU AND ] ──► [ Write Destination R3 ]
             ▲                       ▲                  ▲
             │                       │                  │
   WHO EMITS THESE EXACT CONTROL COMMANDS ON EVERY CLOCK CYCLE?
```

If an engineer attempts to drive these datapath control lines manually by hardwiring physical toggle switches or un-synchronized logic gates, the system can only perform one fixed calculation. Furthermore, if the control signals change asynchronously in the middle of a clock cycle, race conditions between register write-enables, ALU opcodes, and bus drivers cause catastrophic bus contention and memory corruption.

How do we construct a unified, fully automated execution engine that orchestrates multi-step arithmetic algorithms across consecutive clock cycles, emitting a synchronized **Datapath Control Word** on every cycle while dynamically altering its control sequence based on ALU **Condition Flags ($Z, N, V, C$)**?

We couple the passive datapath to a sequential Finite State Machine (FSM) to form an **Integrated ALU Controller**.

---

## The Orchestra Conductor and Symphony Sheet: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an FSM controller orchestrates an ALU datapath, let us step away from microchips and picture a world-class symphony orchestra performing a concert.

An orchestra consists of two fundamentally distinct groups working together in a closed-loop system:

```text
THE ORCHESTRA EXECUTION SYSTEM

               ┌─────────────────────────────────┐
               │    Conductor (FSM Controller)   │
               └────────────────┬────────────────┘
                                │
                                │ Baton Commands (Datapath Control Word)
                                ▼
               ┌─────────────────────────────────┐
               │  Musicians & Instruments        │
               │  (ALU Core, Buses & Registers)  │
               └────────────────┬────────────────┘
                                │
                                │ Sound Audition (Status Flags Z, N, V, C)
                                ▼
               ┌─────────────────────────────────┐
               │  Conductor's Ears & Sheet Music │
               └─────────────────────────────────┘
```

### 1. The Musicians and Instruments (The Datapath)
The musicians sitting on stage—the violinists, cellists, trumpeters, and percussionists—hold the physical instruments. They have the physical capacity to produce sound ($0$s and $1$s), play scales (ALU operations), and store musical notes in their memory (Registers).

However, if the musicians play whatever notes they want whenever they feel like it, the result is chaotic, unlistenable noise. The musicians are the **Datapath**: highly capable, but completely passive and un-orchestrated.

### 2. The Conductor and Sheet Music (The FSM Controller)
Standing on the podium in front of the musicians is the Conductor. The Conductor holds a score sheet (the **State Transition Table**) and a baton.

The Conductor does not play an instrument. They do not produce a single sound themselves. Instead, on every beat of the music (the **System Clock $CLK$**), the Conductor points their baton at specific musicians and holds up a hand gesture (the **Datapath Control Word**):

* **Beat 1 (State $S_1$)**: Conductor points at Violins and Cellos: *"Violins play Note A, Cellos play Note B, Piano RECORD the chord!"*
* **Beat 2 (State $S_2$)**: Conductor points at Piano and Trumpets: *"Piano play stored chord, Trumpets play Solo C, Flute RECORD the mix!"*

Now, suppose the score sheet contains a conditional branch: *"If the piano chord was played softly (Condition Flag $Z = 1$), skip the trumpet solo and transition directly to the Flute Finale (State $S_4$)."*

The Conductor listens with their ears (Status Flag Feedback), sees that the chord was indeed soft ($Z = 1$), and on the very next beat ($CLK$), flips their score sheet directly to State $S_4$!

```text
CONDUCTOR DECISION FEEDBACK LOOP

 Conductor Reads Score (State S2) ──► Baton Gesture (Control Word)
                                             │
                                             ▼
                                     Musicians Play Chord
                                             │
                                             ▼
 Conductor Hears Soft Chord (Z = 1) ◄── Sound Reaches Conductor
                 │
                 ▼
 Conductor Flips Page to State S4 (Conditional Branch Executed!)
```

This orchestra is the exact physical analogue of an **Integrated ALU Controller**:
* The musicians and instruments are the **ALU Datapath** (ALU, Registers, Buses).
* The conductor's baton gestures are the **Datapath Control Word**.
* The conductor's score sheet is the **FSM State Controller**.
* The conductor's ears listening to the sound are the **Status Flags ($Z, N, V, C$)**.
* The conductor's baton beat is the **Global Clock ($CLK$)**.

---

## Architecture of the Integrated Controller and Datapath

To master integrated computer execution, we must dissect the formal mechanics of its two core primitives:
1. **The Datapath Control Word**: The multi-bit binary command vector emitted by the controller to configure registers, buses, and ALU opcodes for a single clock cycle.
2. **The Integrated ALU Controller**: The closed-loop architecture coupling the FSM controller with the ALU datapath and Status Register, using condition flag feedback to execute dynamic algorithms.

---

### The Separation of Datapath and Control Unit

In digital computer engineering, a processor is strictly divided into two fundamental sub-systems:
1. **The Datapath**: The heavy, multi-bit hardware pathways (Registers, Internal Buses, ALU, Shifter, Status Register) where binary data vectors ($\mathbf{A}, \mathbf{B}, \mathbf{Y}$) flow, are manipulated, and are stored.
2. **The Control Unit (Controller)**: The sequential state machine (FSM) that contains zero data registers, but instead generates the control signals that command the Datapath on every clock cycle.

```text
STRUCTURAL DIVISION OF DATAPATH AND CONTROL UNIT

 ┌────────────────────────────────────────────────────────┐
 │                   CONTROL UNIT                         │
 │  ┌──────────────────────────────────────────────────┐  │
 │  │ Finite State Machine Controller (FSM)            │  │
 │  └────────────────────────┬─────────────────────────┘  │
 └───────────────────────────┼────────────────────────────┘
                             │
                             │ Datapath Control Word (CW)
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                     DATAPATH                           │
 │  ┌──────────────┐    ┌──────────────┐   ┌───────────┐  │
 │  │ Register     │───►│ Shared Buses ├──►│ ALU Core  │  │
 │  │ File (R0..R3)│◄───│ (Bus A, B, Y)│◄──│ & Flags   │  │
 │  └──────────────┘    └──────────────┘   └─────┬─────┘  │
 └───────────────────────────────────────────────┼────────┘
                                                 │
                                                 │ Status Flags (Z, N, V, C)
                                                 └─────────► (Feedback to FSM)
```

Look at the two interaction paths between the Control Unit and the Datapath:
* **Downward Path (Command Path)**: The Control Unit emits a multi-bit **Datapath Control Word ($\mathbf{CW}$)** that tells the Datapath which registers to read, which ALU function to execute, and which register to write back into.
* **Upward Path (Feedback Path)**: The Datapath sends the single-bit **Status Flags ($Z, N, V, C$)** back up to the Control Unit so the FSM can evaluate conditional branch instructions ($Q_{\text{next}} = g(Q, \mathbf{Flags})$).

---

### Primitive 1: The Datapath Control Word ($\mathbf{CW}$)

A **Datapath Control Word ($\mathbf{CW}$)** is an $L$-bit binary vector emitted by the FSM controller on every clock cycle. 

It is constructed by concatenating multiple independent control bit-fields, where each field governs a specific hardware control pin inside the datapath.

```text
ANATOMY OF AN L-BIT DATAPATH CONTROL WORD

 ┌──────────┬──────────┬──────────┬───────────┬──────────────┬─────────────┐
 │ Read_A   │ Read_B   │ Write_A  │ Write_EN  │ ALU_Opcode   │ Flag_Write  │
 │ (RA_bus) │ (RB_bus) │ (WA_bus) │ (WE_reg)  │ (ALU_OP)     │ (WE_flags)  │
 └────┬─────┴────┬─────┴────┬─────┴────┬──────┴──────┬───────┴──────┬──────┘
      │          │          │          │             │              │
      ▼          ▼          ▼          ▼             ▼              ▼
   Read R_i   Read R_j   Write R_k   Enable    Execute Opcode   Update ZNVC
   Port A     Port B     Port W      Write     (e.g., ADD/SUB)  Status Reg
```

Let us define the bit-fields of a standard Control Word for a 4-Register, 8-Bit Datapath:

```text
DATAPATH CONTROL WORD BIT-FIELD SPECIFICATION

 Bit Field Name │ Field Bit Width │ Hardware Target Driven by Field │ Functional Description
────────────────┼─────────────────┼─────────────────────────────────┼────────────────────────────────────────
   RA_ADDR      │     2 Bits      │ Read Port A Address (RA1, RA0)  │ Selects Source Register for Bus A
   RB_ADDR      │     2 Bits      │ Read Port B Address (RB1, RB0)  │ Selects Source Register for Bus B
   WA_ADDR      │     2 Bits      │ Write Port Address (WA1, WA0)   │ Selects Destination Register for Bus Y
   WE_REG       │     1 Bit       │ Register File Write Enable      │ 1 = Capture Bus Y into Destination Reg
   ALU_OP       │     3 Bits      │ ALU Operation Select (OP2..0)   │ Selects ALU Function (ADD, SUB, etc.)
   WE_FLAGS     │     1 Bit       │ Status Register Write Enable    │ 1 = Latch new Z, N, V, C status flags
────────────────┼─────────────────┼─────────────────────────────────┼────────────────────────────────────────
 TOTAL WIDTH    │    11 Bits      │ Complete Control Vector CW      │ Emitted by FSM State Controller
```

#### Example Control Word Vector Decoding:
Suppose the FSM controller emits the 11-bit Control Word vector:

$$
\mathbf{CW} = 01 \,\, 10 \dots 11 \,\, 1 \,\, 000 \,\, 1_2
$$

Let us decode this vector field by field:
* $\text{RA\_ADDR} = 01_2 \implies$ Route Register $R_1$ onto Read Bus A.
* $\text{RB\_ADDR} = 10_2 \implies$ Route Register $R_2$ onto Read Bus B.
* $\text{WA\_ADDR} = 11_2 \implies$ Select Register $R_3$ as destination.
* $\text{WE\_REG} = 1 \implies$ Enable write-back into $R_3$ on the next clock edge.
* $\text{ALU\_OP} = 000_2 \implies$ Command ALU to execute Addition ($\mathbf{A} + \mathbf{B}$).
* $\text{WE\_FLAGS} = 1 \implies$ Latch resulting $Z, N, V, C$ flags into Status Register.

In a single clock cycle, this 11-bit Control Word commands the datapath to execute:

$$
R_3 \leftarrow R_1 + R_2 \quad \text{(with Status Flags updated!)}
$$

---

### Primitive 2: The Integrated ALU Controller

An **Integrated ALU Controller** is the complete closed-loop FSM architecture that couples the FSM state machine with the datapath.

The controller consists of two primary operational components:

1. **The FSM Control State Machine**:
   * **State Register**: Stores current control state $Q = (Q_{K-1}, \dots, Q_0)$.
   * **Next-State Logic ($g$)**: Computes $Q_{\text{next}} = g(Q, \text{Flags}, \text{Opcode}_{\text{instruction}})$.
   * **Control Word Decoder ($f$)**: Computes the 11-bit Datapath Control Word $\mathbf{CW} = f(Q)$.
2. **The Status Flag Feedback Interface**:
   * Receives latched status flags ($Q_Z, Q_N, Q_V, Q_C$) from the Status Register.
   * Feeds these flags into the Next-State Logic block to allow **conditional state branching** (e.g., if $Q_Z = 1$, transition to State $S_{\text{branch}}$; otherwise, transition to State $S_{\text{next}}$).

```text
INTEGRATED CLOSED-LOOP ALU CONTROLLER ARCHITECTURE

                       ┌─────────────────────────────────┐
                       │     FSM CONTROL STATE REGISTER  │
                       │     Current State Vector Q      │
                       └────────────────┬────────────────┘
                                        │
                                        ├────────────────────────────────┐
                                        │ Current State Q                │
                                        ▼                                ▼
 Status Flags ───► ┌─────────────────────────────────┐      ┌─────────────────────────┐
 (Q_Z, Q_N,        │    NEXT-STATE TRANSITION LOGIC  │      │  CONTROL WORD DECODER   │
  Q_V, Q_C)        │ Q_next = g(Q, Flags, Inst)     │      │   CW = f(Q)             │
                   └────────────────┬────────────────┘      └────────────┬────────────┘
                                    │                                    │
                                    ▼                                    ▼
                             Next State Q_next                  Control Word Bus CW
                          (To FSM State Register)               (Drives ALU Datapath)
```

---

## Step-by-Step Execution of a Multi-Cycle Algorithm

To demonstrate how the Integrated ALU Controller orchestrates multi-step algorithms, let us trace the execution of a multi-cycle arithmetic instruction: **Computing the square of a number via iterative addition ($R_3 = R_1 \times 2$)**, or executing a **Conditional Decrement Loop**.

### Algorithm Specification: Decrement $R_1$ Until Zero
Suppose our processor needs to execute a multi-cycle loop: *"Decrement Register $R_1$ by $1$ on every cycle until $R_1 = 0$, then store final count in $R_3$."*

Let us break this algorithm down into three discrete FSM control states ($S_0, S_1, S_2$):

* **State $S_0$ (FETCH / INITIALIZE)**:
  * Read $R_1$, pass through ALU, update flags ($Z, N$).
  * If $Z = 1$ ($R_1$ is already zero!), transition to State $S_2$ (DONE).
  * If $Z = 0$, transition to State $S_1$ (DECREMENT LOOP).
* **State $S_1$ (DECREMENT & UPDATE)**:
  * Execute $R_1 \leftarrow R_1 - 1$ on the ALU. Update flags ($Z, N$).
  * If $Z = 1$ ($R_1$ reached zero!), transition to State $S_2$ (DONE).
  * If $Z = 0$ ($R_1$ still non-zero), **stay in State $S_1$** (Loop again!).
* **State $S_2$ (DONE / HALT)**:
  * Write final result to $R_3$. Hold state.

```text
DECREMENT LOOP STATE TRANSITION DIAGRAM

              ┌──────────────────┐
              │  S0: INITIALIZE  │
              │  (Check if R1=0) │
              └────────┬─────────┘
                       │ Z = 0 (Non-Zero)
                       ▼
          ┌──────────────────────────┐
  Z = 0   │  S1: DECREMENT & UPDATE  │
 ┌──────► │  R1 <- R1 - 1            │
 │        └────────────┬─────────────┘
 └─────────────────────┘ Z = 1 (R1 reached Zero!)
                       │
                       ▼
              ┌──────────────────┐
              │   S2: DONE       │
              │   Write-back R3  │
              └──────────────────┘
```

Look at how the FSM controller manages this loop:
1. In State $S_1$, the controller emits $\mathbf{CW}$ commanding $R_1 \leftarrow R_1 - 1$.
2. The ALU executes subtraction and updates the Zero Flag ($Z$).
3. The Next-State Logic inspects $Z$:
   * If $Z = 0$, $Q_{\text{next}} = S_1$ (Loop back!).
   * If $Z = 1$, $Q_{\text{next}} = S_2$ (Exit loop!).

The FSM controller uses the Control Word to command the Datapath, and uses the Status Flags to know when to exit the loop!

---

## Engineering Reality: Control Word Skew, Glitches, and Pipeline Hazards

In physical CMOS microchips, generating and distributing an 11-bit or 32-bit Control Word across a large datapath introduces critical physical timing constraints.

### 1. Control Word Timing Closure ($t_{\text{CW}}$)

The Control Word vector $\mathbf{CW}$ emitted by the FSM controller must arrive at the register file write-enable pins, bus drivers, and ALU opcode terminals **BEFORE the setup time window ($t_{\text{su}}$) of the active clock edge**.

$$
T_{\text{clk,min}} \ge t_{\text{C2Q,FSM}} + t_{\text{CW\_decoder}} + t_{\text{ALU\_max}} + t_{\text{su,reg}}
$$

Where:
* $T_{\text{clk,min}}$ is the minimum safe clock period.
* $t_{\text{C2Q,FSM}}$ is the Clock-to-Q delay of the FSM state register.
* $t_{\text{CW\_decoder}}$ is the propagation delay through the Control Word Decoder gates.
* $t_{\text{ALU\_max}}$ is the worst-case propagation delay through the ALU datapath.
* $t_{\text{su,reg}}$ is the setup time required by the destination register flip-flops.

```text
INTEGRATED CONTROLLER-DATAPATH TIMING PATH

 Clock Edge 1 ──► [ FSM Reg t_C2Q ] ──► [ CW Decoder t_CW ] ──► [ ALU Datapath t_ALU ] ──► [ Reg t_su ] ──► Clock Edge 2
 ◄────────────────────────────────────────── T_clk_min ────────────────────────────────────────────────►
```

### 2. Control Word Glitch Hazards and Safe Latching

If the Control Word Decoder gates emit transient voltage spikes while transitioning between State $S_1$ and State $S_2$, a Register Write Enable bit ($\text{WE}_{\text{REG}}$) might briefly spike to $1$ for 0.5 nanoseconds.

If $\text{WE}_{\text{REG}}$ spikes High while wrong address bits sit on the Write Address bus, the register file will **accidentally overwrite the wrong register**!

To prevent control glitches from corrupting memory:
* Control Words are designed using **Glitch-Free Output Encodings**.
* Register Write Enable signals ($\text{WE}_{\text{REG}}$) are qualified with the global clock pulse so they can only become active when all control lines have completely settled.

---

## Solved Industrial Engineering Exercise: Avionics Flight Computer Vector Processor

To consolidate your complete mastery of Integrated ALU Controllers, Datapath Control Words, closed-loop status flag feedback, and multi-cycle instruction execution, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An aerospace contractor is engineering the 4-bit Integrated ALU Controller and Datapath for a missile defense guidance processor.

The datapath consists of:
* Four 4-bit General-Purpose Registers ($R_0, R_1, R_2, R_3$).
* A 4-bit ALU supporting ADD ($000_2$), SUB ($001_2$), AND ($010_2$), and OR ($011_2$).
* A 4-bit Status Register storing Zero Flag $Z$ and Sign Flag $N$.

```text
GUIDANCE PROCESSOR INTEGRATED EXECUTION ENGINE

                      ┌─────────────────────────────┐
                      │  FSM Controller (3 States)  │
                      └──────────────┬──────────────┘
                                     │
                                     │ 11-Bit Control Word Bus CW
                                     ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                         DATAPATH                                 │
 │  Registers R0..R3 ──► Shared Buses ──► 4-Bit ALU ──► Status Reg  │
 └──────────────────────────────────────────────────────────┬───────┘
                                                            │
                                                            │ Status Flag Z
                                                            └─► (Feedback to FSM)
```

The system must execute a 3-cycle instruction called **Vector Difference Accumulate ($\text{VDIFF}$)**:

$$
\text{VDIFF Instruction: } R_3 \leftarrow (R_1 - R_2) \quad \text{IF } R_1 \neq R_2, \quad \text{ELSE } R_3 \leftarrow R_0
$$

#### Control Word Bit-Field Structure (11 Bits):

$$\mathbf{CW} = (\text{RA}_1, \text{RA}_0, \, \text{RB}_1, \text{RB}_0, \, \text{WA}_1, \text{WA}_0, \, \text{WE}_{\text{REG}}, \, \text{OP}_2, \text{OP}_1, \text{OP}_0, \, \text{WE}_{\text{FLAGS}})$$

#### Initial Register Contents:
* $R_0 = 0101_2$ ($+5_{10}$)
* $R_1 = 1000_2$ ($+8_{10}$ unsigned)
* $R_2 = 0011_2$ ($+3_{10}$)
* $R_3 = 0000_2$ ($0_{10}$)

#### Your Objective

1. Design the 3-state FSM controller ($\text{State } S_0, S_1, S_2$) to execute the $\text{VDIFF}$ instruction across 3 clock cycles.
2. Formulate the exact 11-bit Control Word vector $\mathbf{CW}$ emitted by the controller in each state ($S_0, S_1, S_2$).
3. Derive the Next-State logic equation for the FSM using Status Flag $Z$ feedback.
4. Simulate the entire integrated controller and datapath step-by-step for the given initial register values.
5. Simulate a second execution run where $R_1 = 0011_2$ and $R_2 = 0011_2$ ($R_1 = R_2$, triggering $Z = 1$), demonstrating conditional branching!

---

### Step-by-Step Derivation

#### Step 1: Design the 3-State FSM Controller Logic

We define three execution states for the $\text{VDIFF}$ instruction:

1. **State $S_0$ ($00_2$, STEP 1: SUBTRACT AND TEST)**:
   * Compute $R_1 - R_2$ on the ALU to evaluate whether $R_1 = R_2$.
   * Do NOT write back to $R_3$ yet ($\text{WE}_{\text{REG}} = 0$).
   * Update Status Flags ($\text{WE}_{\text{FLAGS}} = 1$).
   * Next State Logic:
     * If $Z = 1$ ($R_1 = R_2$, difference is zero!), transition to **State $S_2$ (FALLBACK: $R_3 \leftarrow R_0$)**.
     * If $Z = 0$ ($R_1 \neq R_2$, difference is non-zero!), transition to **State $S_1$ (COMMIT DIFFERENCE: $R_3 \leftarrow R_1 - R_2$)**.
2. **State $S_1$ ($01_2$, STEP 2A: COMMIT DIFFERENCE)**:
   * Compute $R_1 - R_2$ on the ALU.
   * Write result to Destination Register $R_3$ ($\text{WA} = 11_2, \text{WE}_{\text{REG}} = 1$).
   * Transition back to $S_0$ (DONE).
3. **State $S_2$ ($10_2$, STEP 2B: FALLBACK PASS-THROUGH)**:
   * Pass $R_0$ through the ALU.
   * Write $R_0$ to Destination Register $R_3$ ($\text{WA} = 11_2, \text{WE}_{\text{REG}} = 1$).
   * Transition back to $S_0$ (DONE).

```text
VDIFF FSM CONTROL STATE TRANSITION DIAGRAM

                    ┌──────────────────┐
                    │  S0: TEST (SUB)  │
                    │  R1 - R2 -> Flags│
                    └────────┬─────────┘
                             │
            ┌────────────────┴────────────────┐
            │ Z = 0 (R1 != R2)                │ Z = 1 (R1 == R2)
            ▼                                 ▼
 ┌─────────────────────┐           ┌─────────────────────┐
 │ S1: COMMIT DIFF     │           │ S2: FALLBACK PASS   │
 │ R3 <- R1 - R2       │           │ R3 <- R0            │
 └──────────┬──────────┘           └──────────┬──────────┘
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
                    Return to S0 (DONE)
```

---

#### Step 2: Formulate the 11-Bit Control Word Vector $\mathbf{CW}$ for Each State

Recall Control Word bit-field structure:
$$\mathbf{CW} = (\text{RA}_1 \text{RA}_0 \,\, \text{RB}_1 \text{RB}_0 \,\, \text{WA}_1 \text{WA}_0 \,\, \text{WE}_{\text{REG}} \,\, \text{OP}_2 \text{OP}_1 \text{OP}_0 \,\, \text{WE}_{\text{FLAGS}})$$

Opcode map: $\text{SUB} = 001_2$, $\text{PASS-A} = 101_2$.

##### 1. Control Word for State $S_0$ (TEST: Compute $R_1 - R_2$, Update Flags, No Writeback):
* $\text{RA} = 01_2$ ($R_1$), $\text{RB} = 10_2$ ($R_2$), $\text{WA} = 00_2$ (Don't care), $\text{WE}_{\text{REG}} = 0$ (No write!).
* $\text{ALU\_OP} = 001_2$ ($\text{SUB}$), $\text{WE}_{\text{FLAGS}} = 1$ (Update Flags!).

$$\mathbf{CW}(S_0) = 01 \,\, 10 \,\, 00 \,\, 0 \,\, 001 \,\, 1_2$$

##### 2. Control Word for State $S_1$ (COMMIT DIFF: Compute $R_1 - R_2$, Write to $R_3$):
* $\text{RA} = 01_2$ ($R_1$), $\text{RB} = 10_2$ ($R_2$), $\text{WA} = 11_2$ ($R_3$), $\text{WE}_{\text{REG}} = 1$ (Write $R_3$!).
* $\text{ALU\_OP} = 001_2$ ($\text{SUB}$), $\text{WE}_{\text{FLAGS}} = 0$.

$$\mathbf{CW}(S_1) = 01 \,\, 10 \,\, 11 \,\, 1 \,\, 001 \,\, 0_2$$

##### 3. Control Word for State $S_2$ (FALLBACK: Pass $R_0$, Write to $R_3$):
* $\text{RA} = 00_2$ ($R_0$), $\text{RB} = 00_2$ (Don't care), $\text{WA} = 11_2$ ($R_3$), $\text{WE}_{\text{REG}} = 1$ (Write $R_3$!).
* $\text{ALU\_OP} = 101_2$ ($\text{PASS-A}$), $\text{WE}_{\text{FLAGS}} = 0$.

$$\mathbf{CW}(S_2) = 00 \,\, 00 \,\, 11 \,\, 1 \,\, 101 \,\, 0_2$$

```text
CONTROL WORD EMISSION TABLE BY STATE

 State │ RA (Port A) │ RB (Port B) │ WA (Write) │ WE_REG │ ALU_OP │ WE_FLAGS │ Formitted Control Word CW
───────┼─────────────┼─────────────┼────────────┼────────┼────────┼──────────┼───────────────────────────
  S0   │   01 (R1)   │   10 (R2)   │   00 (-)   │   0    │ 001(SUB│    1     │ 01 10 00 0 001 1
  S1   │   01 (R1)   │   10 (R2)   │   11 (R3)  │   1    │ 001(SUB│    0     │ 01 10 11 1 001 0
  S2   │   00 (R0)   │   00 (-)    │   11 (R3)  │   1    │ 101(PAS│    0     │ 00 00 11 1 101 0
```

---

#### Step 3: Derive FSM Next-State Logic Equation

The state register uses 2 flip-flops ($Q_1, Q_0$):
* $S_0 = 00_2$
* $S_1 = 01_2$
* $S_2 = 10_2$

##### Next State from $S_0 (00_2)$:
* If $Z = 0 \implies Q_{\text{next}} = S_1 (01_2)$ ($D_1 = 0, D_0 = 1$).
* If $Z = 1 \implies Q_{\text{next}} = S_2 (10_2)$ ($D_1 = 1, D_0 = 0$).

##### Next State from $S_1 (01_2)$ or $S_2 (10_2)$:
* Transition back to $S_0 (00_2)$ ($D_1 = 0, D_0 = 0$).

Writing the next-state equations for $D_1$ and $D_0$:

$$
D_1 = \overline{Q_1} \cdot \overline{Q_0} \cdot Z
$$

$$
D_0 = \overline{Q_1} \cdot \overline{Q_0} \cdot \overline{Z}
$$

Where:
* $D_1, D_0$ are the inputs to state flip-flops $\text{FF}_1$ and $\text{FF}_0$.
* $Q_1, Q_0$ are current state bits ($S_0 = 00_2$).
* $Z$ is the Zero Flag feedback from the Status Register.

---

#### Step 4: Simulation Run 1 — Non-Equal Inputs ($R_1 = 8_{10}, R_2 = 3_{10}$)

Initial Data: $R_0 = 5_{10} (0101_2), R_1 = 8_{10} (1000_2), R_2 = 3_{10} (0011_2), R_3 = 0_{10} (0000_2)$.

```text
EXECUTION SIMULATION RUN 1 TRACE (R1 != R2)

 Clock Event │ Current State Q1 Q0 │ Control Word CW Emitted │ ALU Operation Executed │ Status Z │ Next State Q1' Q0' │ Register R3 State
─────────────┼─────────────────────┼─────────────────────────┼────────────────────────┼──────────┼────────────────────┼───────────────────
 Initial     │      S0 (00)        │    01 10 00 0 001 1     │ R1 - R2 = 8 - 3 = 5    │   Z = 0  │      S1 (01)       │ R3 = 0000_2 (0)
 Edge 1      │      S1 (01)        │    01 10 11 1 001 0     │ R1 - R2 = 8 - 3 = 5    │   Z = 0  │      S0 (00)       │ R3 <- 0101_2 (5!)
 Edge 2      │      S0 (00)        │    01 10 00 0 001 1     │ Return to S0 (DONE)    │   -      │      -             │ R3 = 0101_2 (5)
```

##### Cycle 1 Analysis ($S_0$):
* FSM emits $\mathbf{CW}(S_0) = 01 \, 10 \, 00 \, 0 \, 001 \, 1_2$.
* ALU computes $R_1 - R_2 = 8 - 3 = 5_{10} (0101_2 \neq 0)$.
* Status Flag $Z = 0$ is latched into Status Register.
* FSM Next State Logic sees $Z = 0 \implies D_1 = 0, D_0 = 1 \implies \text{Next State } S_1 (01_2)$.

##### Cycle 2 Analysis ($S_1$):
* On Edge 1, FSM transitions to $S_1$.
* FSM emits $\mathbf{CW}(S_1) = 01 \, 10 \, 11 \, 1 \, 001 \, 0_2$.
* ALU computes $8 - 3 = 5_{10}$. Register File receives $\text{WA} = 11_2 (R_3)$ and $\text{WE}_{\text{REG}} = 1$.
* On Edge 2, **Register $R_3$ captures $0101_2$ ($5_{10}$)**!
* FSM transitions back to $S_0$.

##### Result:
$R_1 \neq R_2 \implies R_3 = R_1 - R_2 = 5_{10}$. **NON-EQUAL BRANCH SUCCESSFUL!**

---

#### Step 5: Simulation Run 2 — Equal Inputs ($R_1 = 3_{10}, R_2 = 3_{10}$)

Initial Data: $R_0 = 5_{10} (0101_2), R_1 = 3_{10} (0011_2), R_2 = 3_{10} (0011_2), R_3 = 0_{10} (0000_2)$.

```text
EXECUTION SIMULATION RUN 2 TRACE (R1 == R2)

 Clock Event │ Current State Q1 Q0 │ Control Word CW Emitted │ ALU Operation Executed │ Status Z │ Next State Q1' Q0' │ Register R3 State
─────────────┼─────────────────────┼─────────────────────────┼────────────────────────┼──────────┼────────────────────┼───────────────────
 Initial     │      S0 (00)        │    01 10 00 0 001 1     │ R1 - R2 = 3 - 3 = 0    │   Z = 1  │      S2 (10)       │ R3 = 0000_2 (0)
 Edge 1      │      S2 (10)        │    00 00 11 1 101 0     │ Pass R0 = 5            │   Z = 1  │      S0 (00)       │ R3 <- 0101_2 (5!)
 Edge 2      │      S0 (00)        │    01 10 00 0 001 1     │ Return to S0 (DONE)    │   -      │      -             │ R3 = 0101_2 (5)
```

##### Cycle 1 Analysis ($S_0$):
* FSM emits $\mathbf{CW}(S_0)$.
* ALU computes $R_1 - R_2 = 3 - 3 = 0_{10} (0000_2)$.
* **Status Flag $Z = 1$ is latched into Status Register!**
* FSM Next State Logic sees $Z = 1 \implies D_1 = 1, D_0 = 0 \implies \text{Next State } S_2 (10_2)$!

##### Cycle 2 Analysis ($S_2$, Fallback Mode):
* On Edge 1, FSM transitions to $S_2$ (bypassing $S_1$ entirely!).
* FSM emits $\mathbf{CW}(S_2) = 00 \, 00 \, 11 \, 1 \, 101 \, 0_2$.
* ALU passes $R_0 = 0101_2$ ($5_{10}$) through to Bus Y. Register File receives $\text{WA} = 11_2 (R_3)$ and $\text{WE}_{\text{REG}} = 1$.
* On Edge 2, **Register $R_3$ captures $R_0 = 0101_2$ ($5_{10}$)**!
* FSM transitions back to $S_0$.

##### Result:
$R_1 = R_2 \implies R_3 = R_0 = 5_{10}$. **EQUAL CONDITIONAL FALLBACK SUCCESSFUL!**

All simulation scenarios evaluate with 100% mathematical, physical, and logical precision. The Integrated ALU Controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Datapath Control Word**: The multi-bit binary command vector $\mathbf{CW} = (\text{RA}, \text{RB}, \text{WA}, \text{WE}_{\text{REG}}, \text{ALU\_OP}, \text{WE}_{\text{FLAGS}})$ emitted by an FSM controller on every clock cycle to configure register file read/write ports, datapath bus drivers, and ALU opcodes for a specific execution step.
* **Integrated ALU Controller**: The closed-loop hardware execution architecture that couples a sequential FSM controller with a combinational ALU datapath, using status flag feedback ($Z, N, V, C$) to evaluate conditional branches ($Q_{\text{next}} = g(Q, \text{Flags})$) and orchestrate multi-cycle algorithms automatically.
