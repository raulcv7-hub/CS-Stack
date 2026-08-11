content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/05-privileged-isa-trap-architecture/01-privileged-execution-mode-barriers/01-user-supervisor-mode-privilege-barriers.md
# Privileged Execution Mode Barriers and Hardware Ring Protection Architecture

## The Monolithic Un-Protected Hardware Disaster: Why User Software Must Be Isolated from Hardware Controls

In a computer processor, the instruction set architecture contains commands that manipulate the physical state of the machine—such as turning off CPU clock generators, re-programming interrupt controllers, modifying physical memory protection registers, or directly writing to I/O buses.

Suppose a computer system executes multiple user application programs concurrently (a web browser, a text editor, and a game engine) without any hardware privilege barriers.

What happens if the text editor software contains a bug or malicious code that executes a hardware shutdown instruction (`wfi` / `hlt`) or re-programs the system timer interrupt controller?

1. The text editor turns off global timer interrupts.
2. The operating system kernel loses the ability to preempt the text editor or switch tasks.
3. The web browser and game engine freeze instantly, and the entire computer system crashes or halts!

```text
THE MONOLITHIC UN-PROTECTED HARDWARE DISASTER

 User Application (Text Editor Bug / Malicious Code)
 ┌─────────────────────────────────────────────────────────────┐
 │ Executes Privileged Instruction: wfi (Wait for Interrupt)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Executed without Privilege Check!
 CPU Clock Generator Turns Off! Timer Interrupts Disabled!
 Entire Machine Freezes! Web Browser and Game Engine Crash!
```

Look at the physical security catastrophe:
* If any user application code can execute privileged hardware control instructions or access restricted memory spaces, a single buggy application can destroy the stability, privacy, and security of all other programs running on the machine!
* A rogue program could inspect private memory belonging to a banking app, overwrite the operating system kernel's instruction bytes, or freeze the entire silicon chip.

How does a CPU hardware architecture enforce **Privileged Execution Modes** and **Ring Protection Barriers**, physically restricting un-privileged user software to a safe subset of instructions while reserving hardware control commands exclusively for the operating system kernel and bare-metal firmware?

And how do applications request operating system services across privilege barriers using hardware system call instructions (`ecall` / `syscall`) without compromising machine security?

To solve the monolithic unprotected hardware disaster and isolate user software from kernel hardware controls, modern computer architectures implement **Privileged Execution Modes**, **Ring Protection Barriers**, and **System Call Transitions (`ecall` / `sret`)**.

---

## The High-Security Bank Vault and the Service Window: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of privileged execution modes, ring protection barriers, and system call privilege transitions before analyzing hardware CSR registers, PMP permission matrices, and `ecall`/`sret` trap state machines, let us consider an everyday analogy: **The High-Security Commercial Bank Vault**.

Imagine a massive commercial bank building (**The Physical Computer System**).

```text
THE BANK VAULT SECURITY CLEARANCE METAPHOR

 User Mode (U-Mode / Ring 3)               Machine Mode (M-Mode / Ring 0)
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Bank Visitor / Customer   │             │ Master Vault Engineer     │
 │ (Standard User App)       │             │ (Bare-Metal Firmware)     │
 │ Allowed: Count pocket cash│             │ Allowed: Flip main power! │
 │ FORBIDDEN: Touch Vault!   │             │ Full physical hardware!   │
 └───────────────────────────┘             └───────────────────────────┘
```

The bank contains different rooms and equipment:
* The Customer Lobby (**User Mode / U-Mode / Ring 3**).
* The Security Guard Station (**Supervisor Mode / S-Mode / Ring 1**).
* The Central Master Vault & Power Room (**Machine Mode / M-Mode / Ring 0**).

Let us observe two operational policies for how people interact with the bank:

---

### Scenario A: Un-Restricted Access (No Privilege Barriers)

The bank manager leaves all vault doors wide open and lets visitors walk anywhere:
1. A visitor (**A User Application**) wants to withdraw $\$20$ from their personal account.
2. The visitor walks directly into the Central Master Vault, grabs a crowbar, pries open the main cash safe, and accidentally knocks over the main power breaker, shutting down the entire bank!
3. **The System Collapse**: One customer's mistake destroyed the entire bank for everyone!

---

### Scenario B: Ring Protection Barriers and the Service Window (`ecall` / `syscall`)

The bank manager installs **Hardware Security Badges and Ring Barriers**:

```text
RING PROTECTION BARRIERS AND SERVICE BELL TRANSITION

 Visitor Lobby (User Mode U-Mode)
 ┌─────────────────────────────────────────────────────────────┐
 │ Customer presses Service Bell (ecall / syscall)!           │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Automatic Privilege Elevation!
 Security Service Window (Supervisor / Machine Mode)
 ┌─────────────────────────────────────────────────────────────┐
 │ Guard receives request, checks permission, accesses Vault,  │
 │ and returns cash to customer safely!                        │
 └──────────────────────────────┴──────────────────────────────┘
```

Look at how Scenario B operates:

1. **Green Visitor Badge (User Mode / U-Mode / Ring 3)**:
   * Standard bank customers (**User Applications**) receive a **Green Visitor Badge**.
   * With a Green Badge, a customer can write in their personal notebook (**General-Purpose Registers $x1 \dots x31$**) and perform basic arithmetic.
   * If a Green Badge visitor attempts to walk through the vault door or touch the power breaker, **a physical pressure door slams shut (Hardware Privilege Violation Trap)** and security ejects them from the building!
2. **Gold Master Badge (Supervisor / Machine Mode / S-Mode / M-Mode / Ring 0)**:
   * Operating system guards and firmware engineers carry **Gold Master Badges**.
   * They can open vault doors, manage security cameras, and control power breakers.
3. **The Service Bell Transition (`ecall` / `syscall`)**:
   * When a Green Badge visitor needs cash from the vault, they step up to a reinforced **Service Window** and ring a **Service Bell (`ecall` / `syscall`)**.
   * Ringing the bell automatically alerts the Gold Badge Security Guard (**Operating System Kernel**).
   * The guard checks the customer's request, walks into the vault safely, retrieves the cash, hands it through the glass window to the customer, and lowers clearance back to Green!

This bank security system is the exact physical analogue of **Privileged Execution Modes and Ring Barriers**:
* Bank visitors are **User-Mode Applications (`U-Mode` / Ring 3)**.
* Gold Badge guards are the **OS Kernel & Firmware (`S-Mode` / `M-Mode` / Ring 0)**.
* Attempting to touch the vault is executing a **Privileged Instruction (e.g., `csrw`, `mret`, `wfi`)**.
* The physical pressure door slamming shut is an **Illegal Instruction / Privilege Violation Trap**.
* The Service Bell is the **System Call Instruction (`ecall` / `syscall`)**.

---

## Primitive 1: Privileged Execution Modes (RISC-V U/S/M vs. x86-64 Rings)

Now that we possess an intuitive mental model of security badges and service windows, let us examine the formal engineering mechanics of **Privileged Execution Modes**.

> **A Privileged Execution Mode** is a hardware operating state maintained by the CPU's control unit (encoded in internal mode bits) that determines which instructions can be executed, which Control Status Registers (CSRs) can be accessed, and which memory regions can be read or written.

```text
PRIVILEGE MODE HIERARCHY AND HARDWARE PERMISSIONS

 Mode Level (RISC-V / x86) │ Execution Role        │ Hardware Access Permissions
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 Machine Mode    (M / Ring0)│ Bare-Metal Firmware   │ 100% Unrestricted Physical Hardware Access
 Supervisor Mode (S / Ring1)│ OS Kernel (Linux)     │ Virtual Memory Page Tables, OS Traps
 User Mode       (U / Ring3)│ User Applications     │ Restricted: User Registers & Memory Only
```

---

### The Three RISC-V Hardware Privilege Modes

In standard 64-bit RISC-V computer architectures, the CPU hardware supports three distinct privilege modes:

#### 1. User Mode (U-Mode / Level $00_2$)
* **Target Software**: Un-trusted user application software (web browsers, text editors, games).
* **Hardware Permissions**: **Restricted / Un-privileged**.
* **Prohibited Actions**: Cannot execute privileged instructions (`mret`, `sret`, `wfi`, `sfence.vma`), cannot access Machine/Supervisor CSRs (`mstatus`, `satp`, `pmpaddr`), and cannot access memory pages marked for kernel access.

#### 2. Supervisor Mode (S-Mode / Level $01_2$)
* **Target Software**: Operating system kernels (Linux, FreeBSD, macOS kernel).
* **Hardware Permissions**: **Intermediate Privilege**.
* **Capabilities**: Manages virtual memory page tables (`satp`), configures supervisor trap handlers (`stvec`), and enforces process isolation.

#### 3. Machine Mode (M-Mode / Level $11_2$)
* **Target Software**: Bare-metal boot firmware (OpenSBI, BIOS) and physical hardware abstraction layers.
* **Hardware Permissions**: **Highest / Unrestricted Physical Privilege**.
* **Capabilities**: $100\%$ full control over physical silicon hardware, physical memory protection (PMP) registers, raw hardware clocks, and global trap vectors (`mtvec`). Every RISC-V processor starts up in **Machine Mode** when power is turned ON.

---

## Primitive 2: Ring Protection Barriers

Now let us examine the second core primitive: **Ring Protection Barriers**.

How does the CPU hardware physically enforce privilege barriers on every single clock cycle?

Inside the CPU's Instruction Decoder, every instruction in the ISA is classified as either **Un-Privileged** (allowed in all modes) or **Privileged** (allowed ONLY in S-Mode or M-Mode).

```text
HARDWARE RING PROTECTION BARRIER INSTRUCTION AUDIT

 32-Bit Instruction Word (e.g. csrw mstatus, x10)
  │
  ▼
 [ Instruction Decoder ] ──► Identifies Instruction as PRIVILEGED!
  │
  ▼ Checks Current Privilege Mode Bits (Current_Mode)
 [ Is Current_Mode == U-Mode (User)? ]
  ├─► YES ──► PRIVILEGE VIOLATION DETECTED!
  │           1. Reject Instruction! (is_valid_instruction = 0)
  │           2. Assert illegal_instruction_trap = 1!
  │           3. Flush Pipeline & Jump to mtvec Trap Handler!
  │
  └─► NO  ──► Permission Granted! Instruction Executes.
```

### The Decoder Privilege Audit Sequence

When an instruction enters the front-end Instruction Decoder:
1. The decoder reads the 7-bit opcode, `funct3`, and `funct7` fields.
2. The decoder inspects the internal CPU state register holding the active privilege mode ($\text{Current\_Mode} \in \{ U, S, M \}$).
3. **Privilege Audit Check**:
   * If $\text{Current\_Mode} == \text{U-Mode}$ AND the instruction attempts to access a Supervisor/Machine CSR or execute a privileged command (e.g., `csrw mstatus, x10` or `wfi`):
   * The decoder **REJECTS THE INSTRUCTION**!
   * The decoder sets $\text{is\_valid\_instruction} = 0$ and asserts the **`illegal_instruction_trap`** hardware signal High ($1.2\text{ V}$).
   * The pipeline is instantly flushed, and execution jumps to the Machine Mode Trap Handler (`mtvec`) with cause code $2$ (**Illegal Instruction / Privilege Violation Trap**)!

---

## System Call Transitions: Elevating and Demoting Privilege (`ecall` / `sret`)

How does a User-Mode application request an operating system service (such as writing to a file or allocating RAM) without violating ring barriers?

Applications execute a hardware **System Call Transition** using the **`ecall` (Environment Call)** instruction.

```text
SYSTEM CALL (ECALL) HARDWARE PRIVILEGE ELEVATION FLOW

 U-Mode Application (Low Privilege)
   1. Load Syscall ID in a7 (e.g., a7 = 64 for write)
   2. Execute `ecall` Instruction
             │
             ▼ Hardware Trap Action (1 Clock Cycle!)
   * mepc <= PC_user
   * scause <= 8 (ECALL from U-Mode)
   * PRIVILEGE ELEVATED: Mode <= S-Mode (Kernel Privilege!)
   * PC <= stvec (OS Kernel Syscall Dispatcher Entry Address)
             │
             ▼
 S-Mode OS Kernel (High Privilege)
   3. OS Kernel processes write request safely in S-Mode!
   4. Execute `sret` (Restores Mode <= U-Mode; PC <= mepc)
```

---

### Step-by-Step Hardware System Call Sequence

#### 1. Calling the System Call (`ecall` in RISC-V / `syscall` in x86-64)
1. The U-Mode application writes the requested system call ID into argument register **`a7`** (e.g. `a7 = 64` for `sys_write`) and parameters into `a0`–`a5`.
2. The application executes the **`ecall`** instruction at address $PC_{\text{user}}$.

#### 2. Hardware Privilege Elevation (1 Clock Cycle)
When `ecall` executes in U-Mode, the CPU hardware executes four atomic actions in a single clock cycle:
* **Save User Return Address**: $\text{sepc} \Leftarrow PC_{\text{user}}$.
* **Record Exception Cause**: $\text{scause} \Leftarrow \mathbf{8 \quad (\text{Environment Call from U-Mode})}$.
* **ELEVATE PRIVILEGE MODE**: The hardware mode bits switch automatically:
  $$\mathbf{\text{Current\_Mode} \Leftarrow \text{S-Mode (Supervisor Kernel Privilege!)}}$$
* **Vector Jump**: $PC$ is overwritten with the address in `stvec` (jumping directly to the OS kernel's system call dispatcher!).

#### 3. Processing in Kernel Mode
The OS kernel processes the system call with full Supervisor privilege.

#### 4. Demoting Privilege via Trap Return (`sret` / `mret`)
Once the kernel finishes, it executes **`sret` (Supervisor Trap Return)**:
* **Restore $PC$**: $PC \Leftarrow \text{sepc} + 4$ (returns to the instruction immediately following `ecall`).
* **DEMOTE PRIVILEGE MODE**: The hardware mode bits switch back:
  $$\mathbf{\text{Current\_Mode} \Leftarrow \text{U-Mode (Un-Privileged User Level)}}$$

Execution resumes in the user application with low privilege restored!

---

## Real-World Silicon Engineering: Physical Memory Protection (PMP)

In embedded systems or microcontrollers operating without virtual memory MMUs, how does Machine Mode firmware prevent User Mode code from reading or writing forbidden physical RAM addresses?

RISC-V provides a dedicated hardware security module: **Physical Memory Protection (PMP)**.

```text
PHYSICAL MEMORY PROTECTION (PMP) HARDWARE CHECK

 Memory Access Request from U-Mode Code (Load from Address 0x80001000)
  │
  ▼
 [ Hardware PMP Checker Matrix ]
  ├─► Address in Range pmpaddr0 (0x80000000..0x80002000)? YES!
  ├─► Check pmpcfg0 Permission Bits for U-Mode: R=1, W=0, X=0
  │
  ├─► Is Operation a LOAD (Read)? ──► PERMITTED! Access granted.
  └─► Is Operation a STORE (Write)?──► DENIED! Assert Store Access Fault Trap!
```

### How PMP Operates in Silicon:
1. M-Mode firmware configures up to 16 PMP address registers (`pmpaddr0`–`pmpaddr15`) and configuration registers (`pmpcfg0`–`pmpcfg3`).
2. Each PMP region is assigned bitwise access flags: **Read ($R$)**, **Write ($W$)**, **Execute ($X$)**.
3. On EVERY memory load, store, or instruction fetch executed in U-Mode:
   * The hardware PMP checker matrix compares the target physical address against all active PMP address ranges in parallel ($< 15\text{ ps}$).
   * If U-Mode code attempts to write to a region where $W = 0$, **the PMP unit blocks the memory write** and asserts a **Store Access Fault Exception Trap (`mcause = 7`)**!

---

## Solved Industrial Engineering Exercise: Privilege Mode Trap Trace, PMP Boundary Audit, and Syscall Transition Timing

To consolidate your complete mastery of privileged execution modes, ring protection barriers, `ecall`/`sret` privilege transitions, and PMP memory protection checks, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior hardware security architect auditing an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor supports three privilege modes: Machine Mode (M-Mode), Supervisor Mode (S-Mode), and User Mode (U-Mode).

```text
3.2 GHz PROCESSOR PRIVILEGE BARRIER SUBSYSTEM

 Current Mode: U-Mode (User) ──► [ Decoder & PMP Matrix ] ──► Mode Switch Engine
 Clock T = 312.5 ps               Evaluates Permissions       ecall / sret / mret
```

#### Hardware Configuration & State:
* Machine Trap Vector: $\text{mtvec} = \text{0x0000\_0000\_8000\_0000}$.
* Supervisor Trap Vector: $\text{stvec} = \text{0x0000\_0000\_8000\_1000}$.
* PMP Register Configuration (`pmpaddr0` = `0x80002000`, `pmpcfg0` = `0x0F` $\implies$ Address Range `0x80000000` to `0x80002000` assigned **Read-Only ($R=1, W=0, X=0$)** for U-Mode).

The CPU executes three consecutive instruction scenarios starting in User Mode (U-Mode) at $PC = \text{0x0000\_0000\_0040\_1000}$:

1. **Scenario 1 (System Call Execution)**:
   * $PC = \text{0x00401000}$: User code executes `ecall` (System Call request for OS service).
2. **Scenario 2 (Privilege Violation Attempt)**:
   * User code attempts to execute `csrw mstatus, x10` (Attempting to write Machine Status CSR from U-Mode!).
3. **Scenario 3 (PMP Memory Protection Violation)**:
   * User code attempts to execute `sd x11, 0(x20)` where $x20 = \text{0x0000\_0000\_8000\_1050}$ (Attempting to write to Read-Only PMP RAM!).

#### Your Objective

1. For **Scenario 1 (`ecall`)**:
   * Trace the hardware privilege transition step-by-step: Calculate updated values for `sepc`, `scause` (Cause Code 8), $\text{Current\_Mode}$ (switches to S-Mode), and $PC_{\text{next}}$ loaded from `stvec`.
2. For **Scenario 2 (`csrw mstatus, x10`)**:
   * Show why the instruction decoder rejects this instruction in U-Mode.
   * Trace the hardware exception: Calculate updated values for `mepc`, `mcause` (Cause Code 2 = Illegal Instruction), `mtval` (raw instruction word), $\text{Current\_Mode}$ (switches to M-Mode), and $PC_{\text{next}}$ loaded from `mtvec`.
3. For **Scenario 3 (`sd x11, 0(x20)` to `0x80001050`)**:
   * Perform the PMP permission audit for address `0x80001050` under U-Mode rules.
   * Show why the store write is DENIED and trace the resulting **Store Access Fault Trap** (`mcause = 7`, `mtval = 0x80001050`).
4. Calculate physical execution time (in nanoseconds and clock cycles) for processing each privilege transition trap.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Process Scenario 1 (`ecall` System Call in U-Mode)

##### 1. Instruction Identification:
* Instruction: `ecall` executing at $PC = \text{0x0000\_0000\_0040\_1000}$ in **User Mode (U-Mode)**.

##### 2. Hardware Privilege Transition Execution:
* **Save User Return Address**:
  $$\text{sepc} \Leftarrow \text{PC} = \mathbf{\text{0x0000\_0000\_0040\_1000}}$$
* **Set Exception Cause Code**:
  $$\text{scause} \Leftarrow \mathbf{8 \quad (\text{Exception Code 8: Environment Call from U-Mode})}$$
* **Elevate Hardware Privilege Mode**:
  $$\text{Current\_Mode} \Leftarrow \mathbf{\text{S-Mode (Supervisor Kernel Privilege!)}}$$
* **Load Supervisor Trap Vector Target Address**:
  $$PC_{\text{next}} \Leftarrow \text{stvec} = \mathbf{\text{0x0000\_0000\_8000\_1000}}$$

##### Result Scenario 1:
Execution transitioned smoothly from U-Mode to S-Mode at address `0x80001000` in $1\text{ clock cycle}$ ($0.3125\text{ ns}$)!

---

#### Step 2: Process Scenario 2 (Privilege Violation `csrw mstatus, x10` in U-Mode)

##### 1. Instruction Identification:
* Instruction: `csrw mstatus, x10` executing at $PC = \text{0x0000\_0000\_0040\_1004}$ in **User Mode (U-Mode)**.
* `mstatus` is a **Machine-Mode CSR** (Privilege Level `11_2`).

##### 2. Hardware Decoder Privilege Audit:
* Decoder checks: $\text{Current\_Mode} == \text{U-Mode} \ (00_2)$ vs. $\text{Required\_Mode} == \text{M-Mode} \ (11_2)$.
* $\text{Current\_Mode} < \text{Required\_Mode} \implies \mathbf{\text{PRIVILEGE VIOLATION DETECTED!}}$
* Instruction decoder rejects `csrw`, sets $\text{is\_valid\_instruction} = 0$, and asserts `illegal_instruction_trap = 1`!

##### 3. Hardware Trap Response:
* **Save Fault Address**:
  $$\text{mepc} \Leftarrow \text{PC} = \mathbf{\text{0x0000\_0000\_0040\_1004}}$$
* **Set Exception Cause Code**:
  $$\text{mcause} \Leftarrow \mathbf{2 \quad (\text{Exception Code 2: Illegal Instruction / Privilege Violation})}$$
* **Save Faulting Instruction Word in `mtval`**:
  $$\text{mtval} \Leftarrow \text{0x30051073} \quad (\text{Raw machine word for csrw mstatus, x10})$$
* **Elevate Hardware Privilege Mode**:
  $$\text{Current\_Mode} \Leftarrow \mathbf{\text{M-Mode (Machine Firmware Privilege!)}}$$
* **Load Machine Trap Vector Target Address**:
  $$PC_{\text{next}} \Leftarrow \text{mtvec} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

---

#### Step 3: Process Scenario 3 (PMP Violation `sd x11, 0(x20)` to `0x80001050`)

##### 1. PMP Memory Permission Audit:
* Target Address $EA = \text{0x0000\_0000\_8000\_1050}$.
* Operation requested: Store Double-Word (`sd`) $\implies \mathbf{\text{WRITE Operation}}$.
* PMP Region 0 covers `0x80000000` to `0x80002000`. Address `0x80001050` lies INSIDE PMP Region 0!
* PMP Region 0 Permissions for U-Mode: Read $R = 1$, Write $W = 0$, Execute $X = 0$.
* Audit Result: Requested operation is **WRITE ($W$)**, but PMP permission $W = 0 \implies \mathbf{\text{ACCESS DENIED!}}$

##### 2. Hardware Trap Response:
* **Store Operation Blocked**: Memory write to `0x80001050` is $100\%$ suppressed!
* **Save Fault Address**:
  $$\text{mepc} \Leftarrow \text{PC} = \mathbf{\text{0x0000\_0000\_0040\_1008}}$$
* **Set Exception Cause Code**:
  $$\text{mcause} \Leftarrow \mathbf{7 \quad (\text{Exception Code 7: Store / AMO Access Fault})}$$
* **Save Faulting Memory Address in `mtval`**:
  $$\text{mtval} \Leftarrow \mathbf{\text{0x0000\_0000\_8000\_1050}}$$
* **Elevate Hardware Privilege Mode**:
  $$\text{Current\_Mode} \Leftarrow \mathbf{\text{M-Mode}}$$
* **Load Machine Trap Vector Target Address**:
  $$PC_{\text{next}} \Leftarrow \text{mtvec} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$$

```text
PRIVILEGE BARRIER SCENARIO AUDIT SUMMARY

 Scenario │ Instruction Executed    │ Current Mode │ Hardware Result & Target PC
──────────┼─────────────────────────┼──────────────┼─────────────────────────────────────────────
 1 (ECALL)│ ecall                   │ U-Mode       │ Elevates to S-Mode; PC <= stvec (0x80001000)
 2 (CSRW) │ csrw mstatus, x10       │ U-Mode       │ Illegal Inst Trap; PC <= mtvec (0x80000000)
 3 (PMP)  │ sd x11, 0(0x80001050)   │ U-Mode       │ Store Access Fault; PC <= mtvec (0x80000000)
```

---

#### Step 4: Calculate Physical Execution Timing for Privilege Transitions

For each scenario, the hardware privilege transition (pipeline flush, mode bits update, CSR writes, and $PC$ reload) completes in **$2\text{ clock cycles}$**:

$$\text{Transition Latency} = 2 \text{ Clock Cycles}$$

$$T_{\text{transition}} = 2 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{0.625 \text{ nanoseconds}}$$

##### Timing Result:
All three privilege transition traps (system calls, CSR privilege violations, and PMP memory access faults) complete their hardware security actions in **$0.625\text{ nanoseconds}$ ($2\text{ clock cycles}$)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and security results:

1. **Privilege Mode Elevation Check**:
   * Scenario 1 (`ecall`) elevated U-Mode $\to$ S-Mode, jumping to `stvec` (`0x80001000`). Correct!
   * Scenarios 2 & 3 (hardware faults) elevated U-Mode $\to$ M-Mode, jumping to `mtvec` (`0x80000000`). Correct!
2. **PMP Permission Audit Check**:
   * Address `0x80001050` was configured as $R=1, W=0, X=0$.
   * A store instruction (`sd`) attempted a WRITE operation ($W=1$), which violated $W=0$.
   * Cause Code 7 (Store Access Fault) was correctly asserted with `mtval = 0x80001050`. Correct!
3. **Transition Timing Verification**:
   * At $3.2\text{ GHz}$, 2 clock cycles equal $2 \times 0.3125\text{ ns} = 0.625\text{ nanoseconds}$. Correct!

All privilege level checks, decoder ring protection audits, `ecall`/`sret` mode transitions, PMP memory permission evaluations, and hardware trap timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Privileged Execution Mode**: A hardware-enforced operating state (User U-Mode, Supervisor S-Mode, Machine M-Mode) that restricts the execution of system control instructions, CSR accesses, and physical memory operations based on active hardware clearance levels.
* **Ring Protection Barrier**: The hardware security architecture that validates instruction opcodes and memory accesses against the active privilege level, triggering an immediate exception trap (`illegal_instruction_trap` or `access_fault`) if un-privileged software attempts to execute restricted control instructions or access protected memory regions.
