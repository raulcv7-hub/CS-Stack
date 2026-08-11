content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/01-isa-instruction-encoding-architecture/02-load-store-execution-model/03-illegal-instruction-trap-decoding.md
# Illegal Instruction Trap Decoding and Unaligned Instruction Fetch Fault Mechanics

## The Execution Corruption Threat: Why Hardware Cannot Guess Invalid Binary Patterns

In a high-performance central processing unit (CPU) operating at a master clock frequency of $3.2\text{ GHz}$, the front-end Instruction Fetch unit retrieves 32-bit binary words from memory on every single clock cycle ($312.5\text{ picoseconds}$). Under normal program execution, these 32-bit words represent valid, legal commands—such as additions, load operations, or conditional branches—defined by the processor's Instruction Set Architecture (ISA).

However, a critical computer architecture problem arises when the 32-bit binary pattern retrieved from memory does **NOT** represent a valid instruction:

1. **Memory Corruption & Pointer Hijacking**: A software bug, stack buffer overflow, or wild pointer write overwrites a section of program code with garbage binary data—for example, a sequence of all ones (`0xFFFFFFFF`) or all zeros (`0x00000000`).
2. **Unsupported ISA Extensions**: Software attempts to execute an instruction belonging to an optional hardware extension (such as floating-point vector math or specialized cryptography instructions) that is physically **NOT fabricated on this specific microchip die**.
3. **Unaligned Jump Targets**: A jump or branch instruction targets an odd or unaligned byte address—for example, jumping to Program Counter $PC = \text{0x00401001}$—forcing a 32-bit instruction fetch to straddle invalid physical memory boundaries or cross page protection limits.

Now, consider the physical catastrophe that would occur if the CPU hardware attempted to decode and execute these invalid binary patterns or misaligned instruction addresses blindly!

```text
THE EXECUTION CORRUPTION THREAT

 Invalid Binary Word (0xFFFFFFFF) Arrives at Instruction Decoder
 ┌─────────────────────────────────────────────────────────────┐
 │ 11111111111111111111111111111111                            │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ NAIVE BLIND EXECUTION HAZARD                                │
 │ Decoder asserts random, conflicting control signals!        │
 │  * RegWrite = 1 (Overwrites arbitrary registers!)           │
 │  * MemWrite = 1 (Overwrites random memory locations!)       │
 │  * ALUSrc   = 1 (Drives invalid inputs into ALU!)           │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 (CPU execution state corrupted! Operating system crashes!)
```

If the Instruction Decoder receives the unassigned binary pattern `0xFFFFFFFF` and attempts to decode it without validation:
* Random, conflicting electrical control signals will be driven High ($1.2\text{ V}$) across the execution datapath.
* The Register File write-enable line (`RegWrite`) might assert unexpectedly, overwriting critical architectural registers.
* The L1 Data Cache write-enable line (`MemWrite`) might assert, corrupting arbitrary user data or operating system kernel structures.
* The processor enters an undefined, non-deterministic execution state from which software cannot recover.

The silicon hardware **cannot guess, ignore, or speculatively execute invalid binary patterns**.

To protect the computer system from silent state corruption, the CPU must incorporate a deterministic, hardwired safety mechanism: **Illegal Instruction Trap Decoding** and **Unaligned Instruction Fetch Fault Detection**.

When an invalid opcode or misaligned instruction address is detected, the hardware must instantly freeze the instruction's execution, flush the pipeline, record the faulting address and cause code in specialized hardware registers, and forcibly jump execution to a pre-defined hardware exception handler.

---

## The Factory Circuit Breaker and Security Guard: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of illegal instruction traps and unaligned fetch faults before analyzing gate-level decoder matrices, hardware status registers, and pipeline flush timing, let us consider an everyday analogy: **The Automated Car Assembly Factory**.

Imagine a high-speed automated car assembly line (**The CPU Execution Pipeline**) where robotic arms (**Execution Units**) assemble cars from parts arriving on a conveyor belt (**The Instruction Fetch Stream**).

```text
THE AUTOMATED CAR FACTORY METAPHOR

 Conveyor Belt (Instruction Stream)        Robotic Assembly Line
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Car Parts Arriving        │             │ High-Speed Robotic Arms   │
 │ Speed: 1 Part per Second  │             │ Assembly Time: 1 Second   │
 └───────────────────────────┘             └───────────────────────────┘
   (Instruction Fetch Unit)                  (Pipelined Execution Units)
```

Car parts arrive on the conveyor belt at a rate of 1 part per second:
* **Part 1 (Engine Block / Valid Add Instruction)**: A standard engine block arrives. The robotic arm grabs it and bolts it into the car frame in 1 second.
* **Part 2 (Door Panel / Valid Load Instruction)**: A standard door panel arrives. The robotic arm attaches it in 1 second.

Now, let us observe two different accident scenarios on the conveyor belt:

---

### Scenario A: The Forged Scrap Metal Part (Illegal Instruction Trap)

At 10:00 AM, an accident occurs upstream, and a mangled piece of twisted scrap metal (**`0xFFFFFFFF` / Invalid Opcode**) arrives on the conveyor belt!

Look at what happens under two different factory policies:

#### Policy 1: Naive Blind Assembly (No Trap Decoding)
The robotic arm does not check the shape of the incoming part. It grabs the twisted scrap metal blindly and attempts to weld it into the car frame!
* The welding torch breaks against the jagged metal.
* The robotic arm jams, crushes its own gears, and sparks an electrical fire!
* The entire factory floor is physically destroyed. This is the **Silent State Corruption Hazard**.

#### Policy 2: The Physical Form Inspector & Circuit Breaker (Illegal Instruction Trap)
The factory installs an automated **Physical Form Inspector (Illegal Instruction Decoder)** right at the entrance gate of the assembly line.

```text
SCENARIO A: PHYSICAL FORM INSPECTOR TRIPS CIRCUIT BREAKER

 Mangled Scrap Metal Arrives (Invalid Opcode 0xFFFFFFFF)
             │
             ▼
 [ Physical Form Inspector ] ──► Detects Invalid Shape! (is_valid == 0)
             │
             ▼
 TRIPS EMERGENCY CIRCUIT BREAKER! (illegal_instruction_trap = 1)
 1. Flushes assembly line! Drops scrap metal into side tray.
 2. Logs Incident ID ("Scrap Metal at Gate 42") in Logbook (mcause / mtval).
 3. Sounds Alarm to summon Factory Repair Specialist (Hardware Trap Handler)!
```

Trace Policy 2 in action:
1. The Form Inspector scans the incoming part and checks its shape against a master catalog of valid car parts.
2. **INVALID PART DETECTED!** The part matches zero valid car components.
3. The Inspector **TRIPS AN EMERGENCY CIRCUIT BREAKER** (`illegal_instruction_trap = 1`)!
4. The conveyor belt freezes instantly ($cpu\_ready = 0$), and the scrap metal is dropped into a side tray without touching the car frame (**Pipeline Flush**).
5. The Inspector writes the location ("Gate 42") and part shape ("Scrap Metal #99") in a master logbook (**`mepc` and `mtval` registers**).
6. The Inspector sounds an alarm, summoning the **Factory Repair Specialist (The Hardware Trap Handler)** to fix the problem!

---

### Scenario B: The Crooked Crate (Unaligned Instruction Fetch Fault)

At 10:05 AM, a valid engine block arrives, but it is sitting crooked, **half-on and half-off the edge of the conveyor belt** (**Unaligned Instruction Fetch at Address `0x00401001`**).

```text
SCENARIO B: CROOKED CRATE ALIGNMENT FAULT

 Engine Block Arrives Crooked (Address 0x00401001 - Unaligned!)
             │
             ▼
 [ Alignment Sensor ] ──► Detects Crooked Position! (unaligned_fault = 1)
             │
             ▼
 TRIPS EMERGENCY CIRCUIT BREAKER! (Instruction Access Fault)
 1. Refuses to let robot grab the crooked engine block!
 2. Logs Crooked Address (0x00401001) in Logbook (mtval).
 3. Summons Repair Specialist to re-align crate!
```

Look at how the factory handles the crooked crate:
1. An **Alignment Sensor** at the gate checks the position of the crate relative to the conveyor belt tracks.
2. **CROOKED POSITION DETECTED!** The crate is misaligned. If the robotic arm attempts to grab it, the engine will drop onto the floor.
3. The Alignment Sensor **TRIPS THE CIRCUIT BREAKER** before the robotic arm touches the crate!
4. The sensor logs the misaligned address (`0x00401001`) in the logbook (**`mtval` register**) and summons the Repair Specialist to realign the crate!

This automated factory is the exact physical analogue of **Hardware Trap Decoding and Fault Detection**:
* Car parts are **32-Bit Binary Instruction Words**.
* The robotic assembly line is the **Pipelined Execution Core**.
* The Physical Form Inspector is the **Combinational Illegal Instruction Decoder Matrix**.
* Tripping the circuit breaker is asserting the **`illegal_instruction_trap` Hardware Signal**.
* Freezing the line and dropping the part is a **Pipeline Flush**.
* The master logbook is the **CSR Register Array (`mepc`, `mcause`, `mtval`)**.
* The Factory Repair Specialist is the **Hardware Trap Handler (`mtvec`)**.

---

## Primitive 1: The Illegal Instruction Trap

Now that we possess a clear intuitive mental model of factory form inspectors and emergency circuit breakers, let us examine the formal engineering mechanics of **The Illegal Instruction Trap**.

> **An Illegal Instruction Trap** is a synchronous hardware exception triggered by the CPU's Instruction Decoder when a fetched 32-bit instruction word contains an invalid primary opcode, an unassigned sub-operation field (`funct3` or `funct7`), or an instruction encoding belonging to a hardware extension that is physically absent from the processor die.

```text
ILLEGAL INSTRUCTION TRAP DECODING SCHEMATIC

 Raw 32-Bit Instruction Word (Instruction[31:0])
  │
  ├─► Bits [6:0]   ──► [ Opcode Decoder Matrix ] ──► Valid Opcode Signals
  ├─► Bits [14:12] ──► [ Funct3 Decoder Matrix] ──► Valid Sub-Ops
  └─► Bits [31:25] ──► [ Funct7 Decoder Matrix] ──► Valid Modifiers
                             │
                             ▼
     ┌────────────────────────────────────────────────────────┐
     │ 128-Input NOR Gate (Valid Instruction Evaluator)        │
     └───────────────────────┬────────────────────────────────┘
                             │
                             ▼
       is_valid_instruction = 0  ===>  illegal_instruction_trap = 1!
```

---

### The Combinational Valid Instruction Evaluator Circuit

How does the CPU's Main Control Unit determine whether a 32-bit binary instruction word is legal or illegal in less than $20\text{ picoseconds}$?

The Instruction Decoder contains a combinational circuit called the **Valid Instruction Evaluator**:

1. **Primary Opcode Evaluation**:
   The 7-bit opcode field (`Instruction[6:0]`) enters a 7-to-128 AND-gate decoder matrix.
   If the opcode matches one of the valid instruction classes defined in the ISA (such as `0x33` for R-type, `0x13` for I-type arithmetic, `0x03` for loads, `0x23` for stores, `0x63` for branches, `0x6F` for jumps), the corresponding opcode signal line evaluates to $1$ ($1.2\text{ V}$).

   $$\text{valid\_opcode} = \text{op\_0x33} \quad \lor \quad \text{op\_0x13} \quad \lor \quad \text{op\_0x03} \quad \lor \quad \text{op\_0x23} \quad \lor \quad \dots$$

2. **Secondary Sub-Operation Evaluation**:
   For valid primary opcodes, the decoder checks the `funct3` (`Instruction[14:12]`) and `funct7` (`Instruction[31:25]`) fields.
   For example, if `opcode == 0x33` (R-type arithmetic), but `funct3 == 000_2` and `funct7 == 1111111_2` (an unassigned sub-operation), the secondary decoder evaluates $\text{valid\_subop} = 0$.

3. **Global Validity Evaluation**:
   The master signal $\text{is\_valid\_instruction}$ is computed as:

$$\text{is\_valid\_instruction} = \text{valid\_opcode} \quad \mathbf{\text{AND}} \quad \text{valid\_subop}$$

If $\text{is\_valid\_instruction} == 0$, the control unit instantly asserts the **`illegal_instruction_trap`** hardware signal High ($1.2\text{ V}$):

$$\mathbf{\text{illegal\_instruction\_trap} = \overline{\text{is\_valid\_instruction}} \quad \mathbf{\text{AND}} \quad \text{instruction\_fetch\_valid}}$$

---

### The Four-Step Hardware Exception Sequence

When `illegal_instruction_trap` asserts High ($1$), the CPU hardware executes a 4-step exception handling sequence:

```text
THE 4-STEP HARDWARE TRAP SEQUENCE

 Step 1: Pipeline Flush    ──► Set RegWrite=0, MemWrite=0. Convert in-flight
                               instructions into empty NOP bubbles!
 Step 2: Latch Fault PC    ──► mepc <= Faulting Instruction PC Address
 Step 3: Write Cause & Val ──► mcause <= 2 (Illegal Inst Code)
                               mtval  <= Raw 32-bit Illegal Hex Word
 Step 4: Trap Vector Jump  ──► PC <= mtvec (Jump to OS Trap Handler Address)
```

Let us trace each step in detail:

#### Step 1: Immediate Pipeline Flush
The control unit forces all execution control signals to zero:

$$\text{RegWrite} \Leftarrow 0, \quad \text{MemWrite} \Leftarrow 0, \quad \text{MemRead} \Leftarrow 0$$

In-flight instructions currently moving through pipeline stages (Fetch, Decode, Execute) are forcibly converted into empty **`NOP` (No Operation) bubbles**. No registers or memory locations are modified!

#### Step 2: Latching the Faulting Program Counter (`mepc` / `sepc`)
The memory address of the instruction that caused the trap ($PC_{\text{fault}}$) is written into a dedicated hardware Control Status Register (CSR) called the **Machine Exception Program Counter (`mepc`)**:

$$\text{mepc} \Leftarrow \text{PC}_{\text{fault}}$$

This allows the operating system trap handler to inspect the exact memory location where the illegal instruction occurred.

#### Step 3: Logging Cause and Faulting Value (`mcause` and `mtval`)
1. The **Machine Cause Register (`mcause`)** is loaded with the standardized exception cause code for Illegal Instructions:

$$\text{mcause} \Leftarrow \mathbf{2 \quad (\text{Exception Code 2: Illegal Instruction})}$$

2. The **Machine Trap Value Register (`mtval`)** is loaded with the raw 32-bit illegal instruction word itself (e.g., `0xFFFFFFFF`):

$$\text{mtval} \Leftarrow \text{Instruction[31:0]}_{\text{raw}}$$

#### Step 4: Hardware Vector Jump (`mtvec` / `stvec`)
The Program Counter ($PC$) is forcibly overwritten with the base address stored inside the **Machine Trap Vector Register (`mtvec`)**:

$$\text{PC} \Leftarrow \text{mtvec[63:2]} \ \Vert \ 00_2$$

The CPU jumps directly to the operating system's exception handler code in **$1\text{ to } 3\text{ clock cycles}$** ($< 1\text{ nanosecond}$), rescuing the computer from execution corruption!

---

## Primitive 2: Unaligned Instruction Fetch Fault Mechanics

Now let us examine the second core primitive: **Unaligned Instruction Fetch Faults**.

> **An Unaligned Instruction Fetch Fault** is a synchronous hardware exception triggered by the Program Counter unit when a branch, jump, or sequential fetch instruction attempts to read a 32-bit instruction from a physical memory address that is NOT aligned to the instruction alignment boundary enforced by the ISA.

---

### Understanding Instruction Alignment Boundaries

In computer memory architectures, memory is byte-addressable (every byte has a unique numerical address: `0x00, 0x01, 0x02, 0x03...`).

Depending on whether a CPU ISA supports compressed 16-bit instructions, instructions must satisfy strict physical alignment rules:

```text
INSTRUCTION ALIGNMENT BOUNDARIES

 32-Bit Fixed Alignment (No Compressed Instructions):
 Memory Addresses: ... 0x00, 0x04, 0x08, 0x0C, 0x10 ...
 Alignment Condition: PC[1:0] MUST BE 00_2  (PC % 4 == 0)

 16-Bit Grid Alignment (With RVC Compressed Instructions):
 Memory Addresses: ... 0x00, 0x02, 0x04, 0x06, 0x08 ...
 Alignment Condition: PC[0] MUST BE 0_2    (PC % 2 == 0)
```

1. **Standard 32-Bit Fixed Alignment**: Every 32-bit instruction MUST begin at a memory address that is an exact multiple of 4 ($PC \pmod 4 == 0$).
   * Binary condition: The lowest 2 bits of the Program Counter **MUST BE ZERO**:
     $$\text{PC}[1:0] == 00_2$$
2. **16-Bit Compressed Alignment (RISC-V RVC / ARM Thumb)**: When 16-bit compressed instructions are supported, instructions MUST begin at an address that is an exact multiple of 2 ($PC \pmod 2 == 0$).
   * Binary condition: The lowest bit of the Program Counter **MUST BE ZERO**:
     $$\text{PC}[0] == 0_2$$

---

### Detecting Unaligned Instruction Fetch Faults in Hardware

What happens if an indirect jump instruction (`jalr x0, 0(x10)`) calculates a target jump address where $x10 = \text{0x00401001}$ (an odd byte address with bit $PC[0] = 1$)?

The Program Counter unit contains a combinational alignment checker circuit:

```text
UNALIGNED FETCH FAULT DETECTION DATAPATH

 Calculated Target PC Address [63:0] (0x00401001)
  │
  ├─► Bit [0] = 1 ──► [ Unaligned Fetch Detector ]
  │                        │
  │                        ▼
  │            unaligned_fetch_fault = 1!
  │                        │
  └────────────────────────┼──────────────────────────────┐
                           ▼                              ▼
                 mcause <= 0 (Instruction      mtval <= 0x00401001
                 Address Misaligned Code)      (Misaligned Target PC)
```

#### Hardware Detection Logic:
* **For Standard 32-bit Only ISAs**:
  $$\text{unaligned\_fetch\_fault} = \text{PC}[0] \quad \lor \quad \text{PC}[1]$$
* **For ISAs with 16-bit Compressed Support (RVC)**:
  $$\text{unaligned\_fetch\_fault} = \text{PC}[0]$$

When `unaligned_fetch_fault` asserts High ($1$):
1. **Instruction Fetch Blocked**: The Instruction Fetch unit **refuses to dispatch a memory read request** to the L1 Instruction Cache for the invalid address `0x00401001`, protecting the memory bus from cross-boundary alignment errors.
2. **Fault Cause Logging**:
   * `mcause` is loaded with **Exception Code 0 (Instruction Address Misaligned)**:
     $$\text{mcause} \Leftarrow \mathbf{0}$$
   * `mtval` is loaded with the exact misaligned target address (`0x00401001`):
     $$\text{mtval} \Leftarrow \text{PC}_{\text{unaligned}}$$
   * `mepc` is loaded with the address of the jump instruction that attempted the invalid jump.
3. **Hardware Vector Jump**: The $PC$ is overwritten with the address in `mtvec`, jumping to the OS exception handler!

---

## Control Status Registers (CSRs) for Exception Handling: `mepc`, `mcause`, `mtval`, `mtvec`

To understand how software debuggers, operating system kernels, and hypervisors handle hardware traps, we must examine the four primary **Control Status Registers (CSRs)** involved in hardware trap architecture:

```text
CONTROL STATUS REGISTERS (CSRs) FOR TRAP MANAGEMENT

 Register Name │ RISC-V CSR Name │ x86-64 Equivalent │ Hardware Function
───────────────┼─────────────────┼───────────────────┼─────────────────────────────────────────────
 Exception PC  │ mepc / sepc     │ RIP (on Interrupt)│ Stores PC address where fault occurred.
 Trap Cause    │ mcause / scause │ Interrupt Vector  │ Stores numeric Exception Cause Code (0..15).
 Trap Value    │ mtval / stval   │ CR2 Register      │ Stores faulting instruction word or address.
 Trap Vector   │ mtvec / stvec   │ IDT Base Register │ Stores base address of OS Trap Handler.
```

Let us examine each CSR in technical detail:

---

### 1. Machine Exception Program Counter (`mepc`)
A 64-bit register that holds the memory address of the instruction that triggered the exception. 
* For an **Illegal Instruction Trap**, `mepc` holds the exact address of the 32-bit instruction word containing the invalid opcode.
* For an **Environment Call Trap (`ecall`)**, `mepc` holds the address of the `ecall` instruction. When the OS kernel finishes servicing the system call, it adds $+4$ to `mepc` so that `mret` returns to the *next* instruction!

---

### 2. Machine Cause Register (`mcause`)
A 64-bit register where the highest bit ($MSB$) indicates whether the event was an asynchronous hardware Interrupt ($MSB = 1$) or a synchronous software Exception ($MSB = 0$).

The lower 63 bits store the **Standardized Exception Cause Code**:

```text
STANDARDIZED EXCEPTION CAUSE CODES (RISC-V ISA)

 Cause Code (Hex) │ Exception Name                    │ Triggering Event
──────────────────┼───────────────────────────────────┼────────────────────────────────────────
       0x0        │ Instruction Address Misaligned    │ PC target is unaligned (PC[0] == 1).
       0x1        │ Instruction Access Fault          │ Fetch memory permission / PMP violation.
       0x2        │ Illegal Instruction               │ Invalid opcode / unsupported extension.
       0x3        │ Breakpoint                        │ EBREAK / Debugger trap instruction.
       0x8        │ Environment Call from U-Mode      │ User-mode ECALL / SYSCALL instruction.
       0xB        │ Environment Call from M-Mode      │ Machine-mode ECALL instruction.
```

---

### 3. Machine Trap Value Register (`mtval`)
A 64-bit register that provides extra diagnostic information about the fault:
* For an **Illegal Instruction Trap** (`mcause = 2`), `mtval` contains the **raw 32-bit illegal instruction word** (e.g., `0xFFFFFFFF`).
* For an **Instruction Address Misaligned Fault** (`mcause = 0`), `mtval` contains the **invalid target memory address** (e.g., `0x00401001`).

---

### 4. Machine Trap Vector Register (`mtvec`)
A 64-bit register configured by the operating system kernel during system startup that holds the base memory address of the OS **Hardware Trap Handler Routine**.

`mtvec` supports two operational modes controlled by its lowest 2 bits (`mtvec[1:0]`):

```text
MTVEC OPERATIONAL MODES

 Bit mtvec[0] │ Mode Name     │ Hardware Vector Jump Destination
──────────────┼───────────────┼────────────────────────────────────────────────────────
      0       │ Direct Mode   │ ALL traps jump to mtvec[63:2] || 00_2 (Single Handler).
      1       │ Vectored Mode │ Traps jump to (mtvec[63:2] + 4 * Cause) (Vector Table).
```

* **Direct Mode (`mtvec[1:0] == 00_2`)**: All exceptions and interrupts jump to the exact same entry address `mtvec[63:2]`. A single software handler reads `mcause` to branch to specific sub-routines.
* **Vectored Mode (`mtvec[1:0] == 01_2`)**: Asynchronous interrupts jump directly to an array of handler pointers at address $\text{mtvec[63:2]} + (4 \cdot \text{mcause})$, bypassing software cause decoding!

---

## Real-World Silicon Engineering: Pipeline Flushes, Trap Latency, and Reentrant Traps

In commercial microprocessor design, handling traps correctly requires solving three critical microarchitectural engineering challenges.

### 1. Pipeline Flush Dynamics and Bubble Insertion

When an illegal instruction is detected in the Instruction Decode (ID) stage of a 5-stage CPU pipeline:

```text
PIPELINE FLUSH TIMING CHRONOLOGY

 Clock Cycle N:
  [ IF: Inst 3 ] ──► [ ID: Illegal Inst 2! ] ──► [ EX: Inst 1 ] ──► [ MEM: Inst 0 ]
                             │
                             ▼ Assert illegal_instruction_trap = 1!
 Clock Cycle N+1:
  [ IF: Trap Handler ] ──► [ ID: NOP Bubble ] ──► [ EX: NOP Bubble ] ──► [ MEM: Inst 1 ]
  (Faulting instruction and all subsequent instructions converted to NOPs!)
```

1. **Cycle $N$**: Instruction 2 reaches the ID stage. The Valid Instruction Evaluator detects an illegal opcode (`is_valid_instruction = 0`).
2. **Control Line Override**: The control unit asserts `flush_IF` and `flush_ID` High ($1.2\text{ V}$).
3. **Cycle $N+1$**:
   * The control registers between IF/ID and ID/EX are cleared to zero (**`NOP` Bubble Insertion**).
   * Instruction 3 (in IF) and Instruction 2 (in ID) are wiped out.
   * Instruction 1 (in EX) and Instruction 0 (in MEM) are allowed to finish normally (**Precise Exception Commitment**).
   * The Program Counter ($PC$) is loaded with `mtvec`.

---

### 2. The Reentrant Trap Hazard (Nested Traps)

What happens if a hardware trap occurs *inside* an active Trap Handler routine?

Suppose an illegal instruction trap occurs. The CPU writes $PC_{\text{fault}}$ into `mepc` and jumps to `mtvec`.

While executing the OS trap handler, another exception occurs (a **Nested Trap**):
* If the hardware blindly wrote the new fault address into `mepc`, **the original value stored in `mepc` would be overwritten and lost forever!**
* When the trap handler executes `mret`, it would be unable to return to the original user program!

```text
THE NESTED TRAP OVERWRITE HAZARD

 1. First Trap Occurs at User PC = 0x00401080 ──► mepc <= 0x00401080
 2. Execution jumps to mtvec (Kernel Trap Handler).
 3. Secondary Trap Occurs inside Handler at Kernel PC = 0x80000120!
    If hardware overwrites mepc: mepc <= 0x80000120!
    (ORIGINAL USER PC 0x00401080 IS LOST FOREVER! USER PROGRAM CANNOT RETURN!)
```

#### The Software Solution for Reentrant Traps:
To prevent nested trap corruption, every production operating system kernel executes a strict **Trap Handler Entry Protocol**:
1. At the very beginning of the trap handler (before re-enabling interrupts), the kernel reads `mepc`, `mcause`, and `mtval` using CSR read instructions (`csrr t0, mepc`).
2. The kernel **saves `mepc`, `mcause`, and `mtval` onto the Kernel Stack Frame**.
3. Only after `mepc` is safely stored on the kernel stack is the handler permitted to process secondary interrupts or nested traps!

---

## Solved Industrial Engineering Exercise: Decoding Illegal Opcodes, Unaligned PC Fault Detection, and CSR State Traversal

To consolidate your complete mastery of illegal instruction trap decoding, unaligned instruction fetch fault detection, pipeline flush mechanics, and CSR state updates, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect verifying the Exception Management Subsystem for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates under the following hardware configuration:
* Machine Trap Vector Base Register: $\text{mtvec} = \text{0x0000\_0000\_8000\_0000}$ (Direct Mode: `mtvec[1:0] = 00_2`).
* Current Program Counter: $\text{PC} = \text{0x0000\_0000\_0040\_1080}$.
* The processor does **NOT** support the 16-bit compressed instruction extension (RVC is disabled; all instructions MUST be 32-bit aligned: $\text{PC}[1:0] == 00_2$).

```text
3.2 GHz PROCESSOR EXCEPTION SUBSYSTEM VERIFICATION

 L1 Instruction Cache ──► [ Fetch Unit ] ──► [ Instruction Decoder ] ──► CSRs (mepc, mcause, mtval)
 PC = 0x00401080          Raw 32-Bit Words   Valid Opcode Evaluator     mtvec = 0x80000000
 Clock T = 312.5 ps       Clock T = 312.5 ps
```

The Instruction Fetch unit retrieves three problem instruction execution events on three consecutive clock cycles:

* **Event 1 (Cycle 1, $PC = \text{0x00401080}$)**: Fetches raw 32-bit word `0xFFFFFFFF`.
* **Event 2 (Cycle 2, $PC = \text{0x00401084}$)**: Fetches raw 32-bit word `0x00000000`.
* **Event 3 (Cycle 3, $PC = \text{0x00401088}$)**: An indirect jump instruction `jalr x0, 0(x10)` executes, where register $x10 = \text{0x0000\_0000\_0040\_2003}$ (Targeting an odd byte address!).

#### Your Objective

1. For **Event 1 (`0xFFFFFFFF`)**:
   * Extract opcode `Instruction[6:0]`.
   * Evaluate the Valid Opcode Decoder Matrix and prove mathematically why $\text{is\_valid\_instruction} = 0$.
   * Trace the hardware trap response: Calculate the exact 64-bit values written into `mepc`, `mcause` (Cause Code), and `mtval`.
   * Calculate the new $PC$ loaded from `mtvec`.
2. For **Event 2 (`0x00000000`)**:
   * Extract opcode `Instruction[6:0]`. Prove why $\text{is\_valid\_instruction} = 0$.
   * Trace the values written into `mepc`, `mcause`, and `mtval`.
3. For **Event 3 (Indirect Jump to `0x00402003`)**:
   * Calculate the target jump address $PC_{\text{target}} = \text{x10} + 0$.
   * Evaluate $PC_{\text{target}}[1:0]$ and detect the **Instruction Address Misaligned Fault**.
   * Trace the hardware trap response: Calculate `mepc`, `mcause` (Cause Code), and `mtval`.
4. Calculate the total pipeline flush time in nanoseconds and CPU clock cycles for each event.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Process Event 1 (`0xFFFFFFFF` at $PC = \text{0x00401080}$)

##### 1. Binary Conversion & Opcode Extraction:
Hexadecimal `0xFFFFFFFF` in binary:

$$1111 \ 1111 \ 1111 \ 1111 \ 1111 \ 1111 \ 1111 \ 1111_2$$

* `opcode = Instruction[6:0]` = `1111111_2` (`0x7F`).

##### 2. Valid Opcode Matrix Evaluation:
* The 7-to-128 AND-gate decoder array inspects `0x7F`.
* In the RISC-V ISA specification, opcode `0x7F` (`1111111_2`) is an unassigned, reserved opcode.
* All valid opcode output lines evaluate to $0$:

$$\text{valid\_opcode\_0x33} = 0, \quad \text{valid\_opcode\_0x13} = 0, \quad \text{valid\_opcode\_0x03} = 0 \dots$$

$$\text{is\_valid\_instruction} = \mathbf{0}$$

$$\mathbf{\text{illegal\_instruction\_trap} = \overline{0} \ \ \& \ \ 1 = 1 \quad (1.2\text{ V Asserted High!})}$$

##### 3. CSR State Updates:
* **`mepc` (Machine Exception PC)**: Latches the faulting $PC$ address:
  $$\text{mepc} \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_1080}}$$
* **`mcause` (Machine Exception Cause)**: Loaded with Cause Code 2 (Illegal Instruction):
  $$\text{mcause} \Leftarrow \mathbf{2 \quad (\text{0x0000\_0000\_0000\_0002})}$$
* **`mtval` (Machine Trap Value)**: Loaded with the raw 32-bit illegal instruction word:
  $$\text{mtval} \Leftarrow \mathbf{\text{0x0000\_0000\_FFFF\_FFFF}}$$
* **Target $PC$ Vector Jump**:
  $$\text{PC}_{\text{next}} \Leftarrow \text{mtvec} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

---

#### Step 2: Process Event 2 (`0x00000000` at $PC = \text{0x00401084}$)

##### 1. Binary Conversion & Opcode Extraction:
Hexadecimal `0x00000000` in binary:

$$0000 \ 0000 \ 0000 \ 0000 \ 0000 \ 0000 \ 0000 \ 0000_2$$

* `opcode = Instruction[6:0]` = `0000000_2` (`0x00`).

##### 2. Valid Opcode Matrix Evaluation:
* Opcode `0x00` (`0000000_2`) is an unassigned, reserved opcode in RISC-V.
* All valid opcode output lines evaluate to $0 \implies \mathbf{\text{is\_valid\_instruction} = 0}$.
* $\mathbf{\text{illegal\_instruction\_trap} = 1}$.

##### 3. CSR State Updates:
* **`mepc`**: Latches the faulting $PC$:
  $$\text{mepc} \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_1084}}$$
* **`mcause`**: Loaded with Cause Code 2 (Illegal Instruction):
  $$\text{mcause} \Leftarrow \mathbf{2 \quad (\text{0x0000\_0000\_0000\_0002})}$$
* **`mtval`**: Loaded with the raw 32-bit illegal instruction word:
  $$\text{mtval} \Leftarrow \mathbf{\text{0x0000\_0000\_0000\_0000}}$$
* **Target $PC$ Vector Jump**:
  $$\text{PC}_{\text{next}} \Leftarrow \text{mtvec} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

---

#### Step 3: Process Event 3 (Indirect Jump to `0x00402003`)

##### 1. Target Address Calculation:
* Instruction: `jalr x0, 0(x10)` executing at $PC = \text{0x00401088}$.
* Base register $x10 = \text{0x0000\_0000\_0040\_2003}$. Immediate offset $= 0$.

$$PC_{\text{target}} = \text{x10} + 0 = \mathbf{\text{0x0000\_0000\_0040\_2003}}$$

##### 2. Unaligned Alignment Check:
* RVC compressed instructions are disabled $\implies$ all instructions MUST be 32-bit aligned ($PC[1:0] == 00_2$).
* Check target address bits $[1:0]$:

$$PC_{\text{target}} = \text{0x00402003} \implies PC_{\text{target}}[1:0] = 11_2 \quad (\mathbf{\text{UNALIGNED!}})$$

$$\text{unaligned\_fetch\_fault} = PC_{\text{target}}[0] \lor PC_{\text{target}}[1] = 1 \lor 1 = \mathbf{1 \quad (1.2\text{ V Asserted High!})}$$

##### 3. CSR State Updates for Unaligned Fetch Fault:
* **`mepc`**: Latches the address of the jump instruction that caused the fault:
  $$\text{mepc} \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_1088}}$$
* **`mcause`**: Loaded with Cause Code 0 (Instruction Address Misaligned):
  $$\text{mcause} \Leftarrow \mathbf{0 \quad (\text{0x0000\_0000\_0000\_0000})}$$
* **`mtval`**: Loaded with the **invalid target memory address**:
  $$\text{mtval} \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_2003}}$$
* **Target $PC$ Vector Jump**:
  $$\text{PC}_{\text{next}} \Leftarrow \text{mtvec} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

---

#### Step 4: Summary Table and Pipeline Flush Latency Analysis

Let us summarize the hardware exception states across all three events:

```text
SUMMARY OF EXCEPTION EVENT DECODING AND CSR STATE UPDATES

 Parameter / Field      │ Event 1 (0xFFFFFFFF)    │ Event 2 (0x00000000)    │ Event 3 (Unaligned Jump)
────────────────────────┼─────────────────────────┼─────────────────────────┼───────────────────────────
 Faulting PC Address    │ 0x0000_0000_0040_1080   │ 0x0000_0000_0040_1084   │ 0x0000_0000_0040_1088
 Fetched Instruction    │ 0xFFFFFFFF (Op 0x7F)    │ 0x00000000 (Op 0x00)    │ jalr x0, 0(x10)
 Triggered Fault Signal │ illegal_inst_trap = 1   │ illegal_inst_trap = 1   │ unaligned_fetch_fault = 1
 mepc Register Output   │ 0x0000_0000_0040_1080   │ 0x0000_0000_0040_1084   │ 0x0000_0000_0040_1088
 mcause Exception Code  │ 2 (Illegal Instruction) │ 2 (Illegal Instruction) │ 0 (Inst Addr Misaligned)
 mtval Register Output  │ 0x0000_0000_FFFF_FFFF   │ 0x0000_0000_0000_0000   │ 0x0000_0000_0040_2003
 Next PC Vector Jump    │ 0x0000_0000_8000_0000   │ 0x0000_0000_8000_0000   │ 0x0000_0000_8000_0000
```

##### Pipeline Flush Latency Calculation:
When any exception asserts High ($1$):
* Cycle 1: Exception detected in ID stage ($t_{\text{detect}} = 20\text{ ps}$). `flush` signal asserted.
* Cycle 2: Control registers cleared to `NOP`. CSRs (`mepc`, `mcause`, `mtval`) written ($t_{\text{CSR\_write}} = 120\text{ ps}$).
* Cycle 3: $PC$ loaded with `mtvec` (`0x80000000`). First instruction of trap handler fetched.

$$\text{Total Hardware Trap Response Time} = 2 \text{ Clock Cycles} = 2 \times 0.3125\text{ ns} = \mathbf{0.625 \text{ nanoseconds}}$$

##### Conclusion:
The hardware exception logic flushes the pipeline, records the exact fault context in CSRs, and jumps to the OS trap handler at `0x80000000` in **$0.625\text{ nanoseconds}$ ($2\text{ clock cycles}$)**, completely preventing execution corruption!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and CSR state results:

1. **Opcode Validity Check**:
   * Event 1 opcode `0x7F` (`1111111_2`) is unassigned in RISC-V. Evaluated to illegal (`mcause = 2`).
   * Event 2 opcode `0x00` (`0000000_2`) is unassigned in RISC-V. Evaluated to illegal (`mcause = 2`).
   * Both illegal instruction traps were $100\%$ correctly classified.
2. **Unaligned Target Check**:
   * Event 3 target $PC = \text{0x00402003} \implies PC[1:0] = 11_2 \neq 00_2$.
   * Correctly triggered Instruction Address Misaligned Fault (`mcause = 0`).
   * Misaligned address `0x00402003` was correctly captured in `mtval` for debugger inspection.
3. **Trap Vector Target Verification**:
   * All three exceptions correctly redirected $PC$ to `mtvec` (`0x80000000`), verifying $100\%$ deterministic exception handling.

All instruction decoder evaluations, unaligned $PC$ alignment checks, CSR state updates, and pipeline flush timing calculations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Illegal Instruction Trap**: A synchronous hardware exception triggered by the instruction decoder when an unassigned opcode or unsupported instruction is fetched, forcing a 1-cycle pipeline flush, logging the faulting address to `mepc`, cause code 2 to `mcause`, and raw word to `mtval`, and jumping execution to `mtvec`.
* **Unaligned Instruction Fetch Fault**: A hardware exception triggered when a branch or jump instruction targets an unaligned memory address ($PC[0] == 1$ or $PC[1:0] \neq 00_2$), blocking the L1I fetch unit, logging cause code 0 to `mcause` and the misaligned address to `mtval`, and transferring execution to the trap handler address.
