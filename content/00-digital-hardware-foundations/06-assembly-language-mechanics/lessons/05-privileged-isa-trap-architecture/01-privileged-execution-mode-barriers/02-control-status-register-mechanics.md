content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/05-privileged-isa-trap-architecture/01-privileged-execution-mode-barriers/02-control-status-register-mechanics.md
# Control Status Register Mechanics and Atomic CSR Manipulation Architecture

## The Non-Atomic Configuration Hazard: Why Standard Loads and Stores Cannot Manage System Control Registers

Inside a modern microprocessor core, the physical operation of the execution pipeline is governed by a dedicated set of hardware control registers known as **Control Status Registers (CSRs)**. Unlike general-purpose registers ($x0 \dots x31$), which store temporary user data operands, Control Status Registers reside in a specialized 12-bit control address space ($4,096\text{ possible CSR addresses}$) managed directly by the CPU's privileged hardware controller.

CSRs control the core's most sensitive hardware state switches:
* Enabling or disabling global hardware interrupts (`mstatus` / `sstatus`).
* Setting the memory address of the hardware exception handler (`mtvec` / `stvec`).
* Configuring physical memory protection boundaries (`pmpcfg` / `pmpaddr`).
* Tracking hardware performance counters (`cycle`, `instret`, `time`).

Now, consider the physical microarchitectural disaster that unfolds if an operating system kernel running in Supervisor Mode attempts to update a status bit inside a Control Status Register using a standard 3-step Read-Modify-Write sequence (Load, Modify, Store):

Suppose the kernel wants to enable global hardware interrupts by setting the Machine Interrupt Enable bit (`MIE`, bit position 3) inside the Machine Status Register (`mstatus`):

```text
THE NON-ATOMIC CSR CONFIGURATION HAZARD

 Step 1: Read mstatus into register t0  ──► t0 <= 0x00000000 (Interrupts Disabled)
                                            │
                                            ▼ HARDWARE TIMER INTERRUPT FIRES!
 Interrupt Handler executes!                │
 Handler modifies mstatus to record state! ──► mstatus <= 0x00000080 (Bit 7 Set!)
 Handler finishes & returns.                │
                                            ▼
 Step 2: Kernel modifies t0 in register ──► t0 <= 0x00000000 | 0x8 = 0x00000008
 Step 3: Kernel writes t0 back to mstatus─► mstatus <= 0x00000008!
 (CATASTROPHE! The stale value in t0 OVERWROTE & ERASED Bit 7 set by the handler!)
```

Trace the physical state corruption step-by-step:
1. **Step 1 (Read)**: The kernel executes a load instruction to read `mstatus` into register `t0`. Register `t0` receives `0x0000000000000000` (interrupts disabled).
2. **The Asynchronous Interruption**: An external hardware timer interrupt fires right after Step 1! The CPU pipeline flushes and jumps to the timer interrupt handler.
3. **Handler CSR Update**: The timer interrupt handler executes, updates hardware configuration bits, and sets bit 7 in `mstatus` (`mstatus <= 0x0000000000000080`). The handler finishes and returns.
4. **Step 2 (Modify)**: The kernel resumes execution, setting bit 3 in its local register `t0` (`0x0000000000000008`).
5. **Step 3 (Store)**: The kernel writes `t0` back to `mstatus` (`mstatus <= 0x0000000000000008`).

Look at the catastrophe:
The stale value in register `t0` **overwrote and completely erased Bit 7 set by the timer handler**!

The operating system's internal state tracking is destroyed, timer interrupts are lost, and the CPU enters an un-recoverable hardware fault state!

Why did this state corruption occur?
Because reading, modifying, and writing a Control Status Register across three separate instructions created a non-atomic execution window where an interrupt or trap could intervene!

How can a CPU hardware architecture read, modify, and update a Control Status Register **atomically in a single 1-clock-cycle execution step**, eliminating non-atomic configuration hazards completely?

To manage system control registers safely, modern computer architectures implement **Control Status Registers (CSRs)** and **Atomic CSR Manipulation Instructions (`csrrw`, `csrrs`, `csrrc`)**.

---

## The Master Control Dashboard and the Indivisible Flip-Switch: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Control Status Registers, 12-bit CSR address spaces, and atomic bitwise manipulation before inspecting hardware decoder matrices, CSR read/write logic gates, and pseudo-instruction expansions, let us consider an everyday analogy: **The Power Plant Master Control Dashboard**.

Imagine a high-security power plant (**The CPU Hardware Core**) controlled by a master control dashboard (**The Control Status Register Array**).

```text
THE MASTER CONTROL DASHBOARD METAPHOR

 Master Control Dashboard (CSR Space: mstatus, mtvec, mie)
 ┌─────────────────────────────────────────────────────────────┐
 │ Bit 3: Global Alarm Enable (MIE)                            │
 │ Bit 7: Timer Interrupt Enable (MTIE)                        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Non-Atomic Update (3 Separate Steps):
   1. Read Dashboard to Clipboard ──► 2. Flip Bit on Clipboard ──► 3. Copy to Dashboard!
   (INTERRUPT FIRES BETWEEN STEP 1 & 3! DASHBOARD STATE DESTROYED!)
```

The master control dashboard has 4,096 individual status dials and configuration bit-switches (**4,096 12-Bit CSR Addresses**):
* Dial `0x300` controls **Global Alarm Status (`mstatus`)**.
* Dial `0x304` controls **Interrupt Enable Masks (`mie`)**.
* Dial `0x305` controls **Emergency Trap Vector Address (`mtvec`)**.

Let us observe two operational policies for updating a bit-switch on the dashboard:

---

### Policy 1: Non-Atomic 3-Step Reading and Writing (The Interruption Hazard)

1. An operator (**The OS Kernel**) walks up to Dial `0x300` (`mstatus`), reads the current configuration onto a paper notepad, and sees `All Alarms Disabled (0)`.
2. While the operator is looking down at their paper notepad, an emergency alarm sounds! An automated backup system reaches over and turns on **Cooling Fan #2 (Bit 7 = 1)** on Dial `0x300`.
3. The operator finishes writing on their notepad, sets `Global Alarm = 1`, walks back to Dial `0x300`, and forcibly sets the dial to match their paper notepad!
4. **THE CATASTROPHE**: The operator's stale paper notepad **turned off Cooling Fan #2 (Bit 7 = 0)** because the operator didn't know the backup system had turned it on! The reactor overheats and melts down!

---

### Policy 2: The Indivisible Flip-Switch Tool (`csrrw` / `csrrs` / `csrrc`)

The power plant manager installs a **Single-Motion Atomic Flip-Tool**:

```text
POLICY 2: INDIVISIBLE ATOMIC FLIP-TOOL

 Operator uses Atomic Tool: csrrs (Read & Set Bits)
 ┌─────────────────────────────────────────────────────────────┐
 │ IN ONE SINGLE 1-SECOND MOTION:                              │
 │   1. Reads old Dial Value onto Paper Pad (rd <= CSR)        │
 │   2. Flips Bit 3 High directly on Dial! (CSR <= CSR | Bit 3)│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 (No emergency alarm can EVER intervene midway! Zero state corruption!)
```

Look at how Policy 2 operates:
1. The operator uses the **Atomic Bit-Set Tool (`csrrs`)** on Dial `0x300`.
2. In **one single 1-second physical motion**:
   * The tool reads the old configuration value onto the operator's paper pad ($rd \Leftarrow \text{CSR}$).
   * The tool flips Bit 3 High directly on Dial `0x300` ($\text{CSR} \Leftarrow \text{CSR} \mid \text{Bit 3}$).
3. No emergency alarm or backup system can *ever* intervene between the read and the write!
4. Cooling Fan #2 stays running, Bit 3 is set, the old status is captured, and the power plant runs at $100\%$ safety!

This master control dashboard is the exact physical analogue of **Atomic CSR Manipulation**:
* The control dashboard is the **12-Bit CSR Address Space ($0x000 \dots 0xFFF$)**.
* Dial `0x300` is the **Machine Status Register (`mstatus`)**.
* The paper notepad is a **General-Purpose Register ($rd$)**.
* The single-motion atomic flip-tool is the **Atomic CSR Instruction Suite (`csrrw`, `csrrs`, `csrrc`)**.

---

## Primitive 1: The Control Status Register (CSR) Address Space

Now that we possess an intuitive mental model of master control dashboards and atomic flip-tools, let us examine the formal engineering mechanics of **Control Status Registers (CSRs)**.

> **A Control Status Register (CSR)** is a specialized 64-bit hardware configuration register managed within a 12-bit control address space ($0x000 \dots 0xFFF$) that controls CPU privilege modes, interrupt masks, trap vector addresses, and memory protection boundaries.

```text
12-BIT CSR ADDRESS BIT-FIELD DECODING

 Bit [31:30] (CSR[11:10]) │ Bit [29:28] (CSR[9:8]) │ Bit [27:20] (CSR[7:0])
──────────────────────────┼────────────────────────┼────────────────────────
 Read/Write Access        │ Privilege Level        │ Specific CSR Index
  * 00, 01, 10 = Read/Write│  * 00 = User (U)       │  * 0x00 = status / flags
  * 11 = Read-Only        │  * 01 = Supervisor (S) │  * 0x05 = trap vector
                          │  * 11 = Machine (M)    │  * 0x41 = epc
```

---

### The 12-Bit CSR Address Encoding Scheme

In standard 32-bit RISC-V instruction encodings, CSR instructions store the 12-bit CSR address inside bits `Instruction[31:20]`.

This 12-bit address space ($2^{12} = 4,096\text{ possible addresses}$) is partitioned into functional privilege and read/write regions based on the top 4 bits (`CSR[11:8]`):

1. **Read/Write Permissions (`CSR[11:10]`)**:
   * `00_2, 01_2, 10_2`: Standard Read-Write CSRs (e.g. `mstatus`, `mtvec`, `mie`).
   * `11_2`: **Read-Only CSRs** (e.g. `time`, `cycle`, `instret`). Attempting to write to a read-only CSR triggers an **Illegal Instruction Exception Trap**!
2. **Minimum Privilege Level (`CSR[9:8]`)**:
   * `00_2`: User-Mode CSRs (e.g., `fflags`, `frm`).
   * `01_2`: Supervisor-Mode CSRs (e.g., `sstatus`, `stvec`, `satp`).
   * `11_2`: Machine-Mode CSRs (e.g., `mstatus`, `mtvec`, `mie`, `mepc`).

---

### Key RISC-V Machine-Mode Control Status Registers

```text
PRIMARY MACHINE-MODE CONTROL STATUS REGISTERS (CSRs)

 Address (Hex) │ CSR Name │ Hardware Function Description
───────────────┼──────────┼─────────────────────────────────────────────────────────────
     0x300     │ mstatus  │ Machine Status: Global interrupt enables & privilege modes.
     0x304     │ mie      │ Machine Interrupt Enable: Bitmask for timer/external IRQs.
     0x305     │ mtvec    │ Machine Trap Vector: Base address for hardware trap handler.
     0x341     │ mepc     │ Machine Exception PC: Address where fault occurred.
     0x342     │ mcause   │ Machine Cause: Numeric cause code for hardware exception.
     0x343     │ mtval    │ Machine Trap Value: Faulting instruction word or bad address.
     0x340     │ mscratch │ Machine Scratch: Scratchpad register for stack swapping.
```

---

## Primitive 2: Atomic CSR Manipulation Instructions (`csrrw`, `csrrs`, `csrrc`)

Now let us examine the second core primitive: **Atomic CSR Manipulation Instructions**.

To guarantee that reading and updating a Control Status Register occurs atomically in **1 single, indivisible clock cycle**, the instruction set architecture provides three primary atomic CSR instructions:

```text
ATOMIC CSR INSTRUCTION SUITE

 Assembly Instruction    │ Hardware Atomic Operation Executed
─────────────────────────┼─────────────────────────────────────────────────────────────
 csrrw rd, csr, rs1      │ Atomic Read and Write: rd <= CSR; CSR <= rs1
 csrrs rd, csr, rs1      │ Atomic Read and Set Bits: rd <= CSR; CSR <= CSR | rs1
 csrrc rd, csr, rs1      │ Atomic Read and Clear Bits: rd <= CSR; CSR <= CSR & ~rs1
```

Let us analyze the exact hardware mechanics of each atomic CSR instruction:

---

### 1. Atomic Read and Write CSR (`csrrw rd, csr, rs1`)

* **Operation**: Atomically reads the current 64-bit value of the specified CSR into destination register $rd$, and writes the complete 64-bit value from source register $rs1$ into the CSR:

$$\text{csrrw rd, csr, rs1} \quad \implies \quad \mathbf{rd \Leftarrow \text{CSR}, \quad \text{CSR} \Leftarrow \text{RegisterFile}[rs1]}$$

* **Hardware Optimization (Write-Only Gating)**:
  If $rd == x0$ (hardwired zero register), the hardware **bypasses reading the CSR**, executing a pure 1-cycle write (`csrw csr, rs1`) without triggering any CSR read side-effects!

---

### 2. Atomic Read and Set Bits CSR (`csrrs rd, csr, rs1`)

* **Operation**: Atomically reads the current 64-bit value of the CSR into $rd$, and sets specific bits High ($1$) in the CSR by applying a bitwise OR mask from source register $rs1$:

$$\text{csrrs rd, csr, rs1} \quad \implies \quad \mathbf{rd \Leftarrow \text{CSR}, \quad \text{CSR} \Leftarrow \text{CSR} \ \mid \ \text{RegisterFile}[rs1]}$$

* **Hardware Optimization (Read-Only Gating)**:
  If $rs1 == x0$, no bits are set ($0 \mid \text{CSR} = \text{CSR}$). The hardware **bypasses writing the CSR**, executing a pure 1-cycle read (`csrr rd, csr`)!

---

### 3. Atomic Read and Clear Bits CSR (`csrrc rd, csr, rs1`)

* **Operation**: Atomically reads the current 64-bit value of the CSR into $rd$, and clears specific bits to Low ($0$) in the CSR by applying a bitwise AND with the bitwise NOT of $rs1$:

$$\text{csrrc rd, csr, rs1} \quad \implies \quad \mathbf{rd \Leftarrow \text{CSR}, \quad \text{CSR} \Leftarrow \text{CSR} \ \& \ \sim \text{RegisterFile}[rs1]}$$

---

### Pseudo-Instruction Aliases for CSR Operations

To make assembly code clean and readable, the assembler provides intuitive pseudo-instruction aliases that map directly onto `csrrw`, `csrrs`, and `csrrc`:

```text
CSR PSEUDO-INSTRUCTION ALIAS MAP

 High-Level Pseudo-Instruction │ Real Hardware Instruction │ Hardware Action
───────────────────────────────┼───────────────────────────┼─────────────────────────────────────────────
 csrr  rd, csr                 │ csrrs rd, csr, x0         │ Reads CSR into rd (0 writes to CSR!)
 csrw  csr, rs1                │ csrrw x0, csr, rs1        │ Writes rs1 to CSR (Discards old value in x0)
 csrs  csr, rs1                │ csrrs x0, csr, rs1        │ Sets bits in CSR using rs1 mask
 csrc  csr, rs1                │ csrrc x0, csr, rs1        │ Clears bits in CSR using rs1 mask
 csrwi csr, imm5               │ csrrwi x0, csr, imm5      │ Writes 5-bit unsigned immediate to CSR
 csrsi csr, imm5               │ csrrsi x0, csr, imm5      │ Sets bits in CSR using 5-bit immediate
 csrci csr, imm5               │ csrrci x0, csr, imm5      │ Clears bits in CSR using 5-bit immediate
```

```text
CSR ATOMIC DATAPATH EXECUTION (1 CLOCK CYCLE)

 Current CSR Value (e.g. mstatus = 0x0000)
  │
  ├─► Read Path ───────────────────────────────► Destination Register rd (x10)
  │                                              (Captures OLD CSR State!)
  └─► Bitwise Logic Unit (OR / AND NOT / Write)
      Input: Old CSR Value + Mask Register rs1
      Output: New CSR Value ───────────────────► CSR Storage Array
                                                 (Updates CSR in same cycle!)
```

---

## Real-World Silicon Engineering: Pipeline Bypassing and CSR Side-Effect Gating

In commercial CPU physical design, executing atomic CSR instructions introduces specialized microarchitectural optimizations:

### 1. Atomic Single-Cycle Execution

How does the execution pipeline execute `csrrs` in a single clock cycle ($312.5\text{ ps}$ at $3.2\text{ GHz}$)?

```text
SINGLE-CYCLE CSR ATOMIC EXECUTION TIMELINE

 Clock Cycle N:
  [ ID Stage: Decodes csrrs ] ──► Reads CSR Array + Reads rs1 Register
                                 │
                                 ▼ (EX Stage: Bitwise Logic Unit)
  Computes: rd <= CSR_old  AND  CSR_new <= CSR_old | rs1
                                 │
                                 ▼ (Writes both rd and CSR in SAME cycle!)
  Clock Cycle N+1: Next Instruction reads UPDATED CSR State!
```

Inside the Execute (EX) stage, a dedicated bitwise logic unit (OR / AND-NOT) sits directly in front of the CSR write latch.

In 1 single clock cycle:
* The old CSR value is routed to the destination register $rd$ write port.
* The bitwise OR result ($\text{CSR} \mid rs1$) is routed to the CSR write latch.
* Both updates commit on the same rising clock edge!

---

### 2. Side-Effect Bypassing via $x0$

Certain hardware CSRs have **Read Side-Effects** (for example, reading an interrupt status CSR clears the hardware interrupt line, or reading a hardware counter resets the counter).

How does the hardware handle pseudo-instruction `csrw csr, rs1` (`csrrw x0, csr, rs1`)?

1. The Instruction Decoder detects $rd == x0$ (destination register is the hardwired zero register).
2. The decoder **de-asserts the CSR read-data bus driver**, suppressing any CSR read side-effects!
3. The hardware executes a **pure 1-cycle write** without reading or clearing hardware status flags!

Conversely, for `csrr rd, csr` (`csrrs rd, csr, x0`):
1. The decoder detects $rs1 == x0$.
2. The decoder **de-asserts the CSR write driver**, preventing unnecessary CSR write bitline toggles and saving dynamic switching power ($P = C \cdot V^2 \cdot f$)!

---

## Solved Industrial Engineering Exercise: Interrupt Enable Masking, Atomic CSR Bit Slicing, and Execution Timing Closure

To consolidate your complete mastery of Control Status Registers (CSRs), 12-bit CSR address decoding, atomic `csrrw`/`csrrs`/`csrrc` operations, and pseudo-instruction expansions, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the CSR Execution Unit for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

An operating system kernel running in Machine Mode (M-Mode) executes an interrupt management sequence to configure hardware interrupts.

```text
3.2 GHz PROCESSOR CSR ATOMIC EXECUTION UNIT

 CPU Core (3.2 GHz) ──► [ CSR Decoder & Bit Logic ] ──► CSR Register Array
 Clock T = 312.5 ps     1-Cycle Atomic Read-Modify-Write  mstatus, mie, mtvec
```

#### Hardware Initial State:
* `mstatus` CSR (Address `0x300`): Currently holds value $\text{0x0000\_0000\_0000\_0000}$ (Global Interrupts Disabled, `MIE` bit 3 is $0$).
* `mie` CSR (Address `0x304`): Currently holds value $\text{0x0000\_0000\_0000\_0080}$ (Timer Interrupts Enabled, `MTIE` bit 7 is $1$).
* Register `x11` = $\text{0x0000\_0000\_0000\_0008}$ (Bitmask with Bit 3 = $1$).
* Register `x12` = $\text{0x0000\_0000\_0000\_0080}$ (Bitmask with Bit 7 = $1$).

#### Kernel Assembly Execution Sequence (3 Instructions):
1. **Instruction 1**: `csrrs x10, mstatus, x11` (Atomically enable global interrupts by setting bit 3 in `mstatus`).
2. **Instruction 2**: `csrrc x13, mie, x12` (Atomically disable machine timer interrupts by clearing bit 7 in `mie`).
3. **Instruction 3**: `csrw mtvec, x14` where $x14 = \text{0x0000\_0000\_8000\_0000}$ (Set Machine Trap Vector address).

#### Your Objective

1. For **Instruction 1 (`csrrs x10, mstatus, x11`)**:
   * Decode the 12-bit CSR address `0x300` into its Read/Write and Privilege Mode fields.
   * Calculate the 64-bit value captured in destination register `x10` ($rd$) and the new 64-bit value stored in `mstatus`.
2. For **Instruction 2 (`csrrc x13, mie, x12`)**:
   * Calculate the 64-bit value captured in destination register `x13` ($rd$) and the new 64-bit value stored in `mie`.
3. For **Instruction 3 (`csrw mtvec, x14`)**:
   * Expand `csrw` into its real hardware instruction (`csrrw x0, mtvec, x14`).
   * Explain why specifying $rd = x0$ allows the hardware to bypass reading `mtvec`, executing a pure write.
4. Calculate total execution clock cycles and physical execution time (in nanoseconds) for the 3-instruction sequence.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Process Instruction 1 (`csrrs x10, mstatus, x11`)

##### 1. Decode 12-Bit CSR Address `0x300` (`0011_0000_0000_2`):
* `CSR[11:10] = 00_2` $\implies$ **Read-Write CSR**.
* `CSR[9:8] = 11_2` $\implies$ **Machine-Mode (M-Mode) Privilege Level**.
* `CSR[7:0] = 0x00` $\implies$ Index 0 (`mstatus`).

##### 2. Execute Atomic Bit-Set Math (`csrrs`):
* Old `mstatus` value = `0x0000_0000_0000_0000`.
* Mask `x11` = `0x0000_0000_0000_0008` (Bit $3 = 1$).

$$\text{Destination Register } x10 \Leftarrow \text{Old CSR Value} = \mathbf{\text{0x0000\_0000\_0000\_0000}}$$

$$\text{New mstatus Value} \Leftarrow \text{Old CSR} \ \mid \ x11 = \text{0x0000\_0000\_0000\_0000} \ \mid \ \text{0x0000\_0000\_0000\_0008}$$

$$\mathbf{\text{New mstatus Value} = \text{0x0000\_0000\_0000\_0008} \quad (\text{Global Interrupt Bit MIE is NOW SET!})}$$

---

#### Step 2: Process Instruction 2 (`csrrc x13, mie, x12`)

##### 1. Decode 12-Bit CSR Address `0x304` (`0011_0000_0004_2`):
* `CSR[11:10] = 00_2` $\implies$ Read-Write. `CSR[9:8] = 11_2` $\implies$ Machine Mode. Index = `mie`.

##### 2. Execute Atomic Bit-Clear Math (`csrrc`):
* Old `mie` value = `0x0000_0000_0000_0080` (Bit $7 = 1$).
* Mask `x12` = `0x0000_0000_0000_0080` (Bit $7 = 1$).

$$\text{Destination Register } x13 \Leftarrow \text{Old CSR Value} = \mathbf{\text{0x0000\_0000\_0000\_0080}}$$

$$\text{New mie Value} \Leftarrow \text{Old CSR} \ \& \ \sim x12 = \text{0x0000\_0000\_0000\_0080} \ \& \ \text{0xFFFF\_FFFF\_FFFF\_FF7F}$$

$$\mathbf{\text{New mie Value} = \text{0x0000\_0000\_0000\_0000} \quad (\text{Timer Interrupt Bit MTIE is NOW CLEARED!})}$$

---

#### Step 3: Process Instruction 3 (`csrw mtvec, x14`)

##### 1. Pseudo-Instruction Expansion:
$$\mathtt{csrw \ mtvec, \ x14} \quad \mathbf{\longrightarrow} \quad \mathbf{\mathtt{csrrw \ x0, \ mtvec, \ x14}}$$

##### 2. Hardware Optimization Gating ($rd == x0$):
* Destination register $rd = x0$.
* The Instruction Decoder detects $rd == x0$ and **de-asserts the CSR read-data bus driver**.
* The hardware executes a **pure 1-cycle write** without triggering any CSR read side-effects:

$$\text{mtvec} \Leftarrow \text{x14} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

$$\text{Destination Register } x0 \Leftarrow \text{Discarded into Bit Sink}$$

---

#### Step 4: Summary Table and Execution Timing Analysis

Let us summarize the atomic CSR operations and hardware state transitions:

```text
ATOMIC CSR MANIPULATION EXECUTION SUMMARY

 Instruction Mnemonic │ CSR Address │ Old CSR Value (rd)  │ New CSR Value (Hardware)
──────────────────────┼─────────────┼─────────────────────┼───────────────────────────
 csrrs x10,mstatus,x11│ 0x300       │ 0x0000_0000_0000_0000│ 0x0000_0000_0000_0008 (Bit 3 Set!)
 csrrc x13,mie,x12    │ 0x304       │ 0x0000_0000_0000_0080│ 0x0000_0000_0000_0000 (Bit 7 Clear!)
 csrw  mtvec,x14      │ 0x305       │ Discarded (rd = x0) │ 0x0000_0000_8000_0000 (mtvec Set!)
```

##### Physical Execution Timing Calculation:
Each atomic CSR instruction executes in **1 single clock cycle** ($312.5\text{ ps}$):

$$\text{Total Execution Cycles} = 3 \text{ Instructions} \times 1.0 \text{ cycle/inst} = \mathbf{3 \text{ Clock Cycles}}$$

$$T_{\text{execution}} = 3 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{0.9375 \text{ nanoseconds}}$$

The entire atomic interrupt configuration update completed in **$0.9375\text{ nanoseconds}$ ($3\text{ clock cycles}$)** with $100\%$ atomic state safety!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and CSR bitwise results:

1. **Bit-Set Verification (`csrrs`)**:
   * Initial `mstatus` = `0x0000`. Set bit 3 (`0x0008`). New `mstatus` = `0x0008`. `x10` captured old value `0x0000`. Verified!
2. **Bit-Clear Verification (`csrrc`)**:
   * Initial `mie` = `0x0080`. Clear bit 7 (`0x0080`). New `mie` = `0x0000`. `x13` captured old value `0x0080`. Verified!
3. **Pure Write Gating (`csrw`)**:
   * `csrw` expanded to `csrrw x0, mtvec, x14`.
   * $rd = x0$ suppressed read side-effects, setting `mtvec` to `0x80000000` in 1 cycle. Verified!

All 12-bit CSR address decodes, atomic bitwise logic operations, pseudo-instruction expansions, and 1-cycle execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Control Status Register (CSR)**: A specialized 64-bit hardware configuration register managed within a 12-bit control address space ($0x000 \dots 0xFFF$) that controls CPU privilege modes, interrupt masks, trap vector addresses, and memory protection boundaries.
* **Atomic CSR Manipulation (`csrrw` / `csrrs` / `csrrc`)**: Single-cycle, indivisible hardware instructions that read the previous 64-bit value of a CSR into a destination register ($rd$) while simultaneously overwriting (`csrrw`), setting bits (`csrrs`), or clearing bits (`csrrc`) in the CSR, preventing interrupt/trap state corruption.
