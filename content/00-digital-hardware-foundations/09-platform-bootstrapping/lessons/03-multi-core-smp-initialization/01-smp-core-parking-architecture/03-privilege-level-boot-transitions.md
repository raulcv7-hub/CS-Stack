content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/03-multi-core-smp-initialization/01-smp-core-parking-architecture/03-privilege-level-boot-transitions.md
# 03-privilege-level-boot-transitions — Boot-Time CPU Privilege Level Transitions and Hardware Register Control

## 1. The Maximum-Privilege Unprotected Reset Hazard

When a central processing unit (CPU) execution core exits hardware Power-On Reset, the physical processor powers up in its absolute highest hardware privilege level. On x86-64 architectures, the CPU enters 16-bit Real Mode (with unrestricted physical memory access) or System Management Mode (SMM). On ARM64 architectures, the core powers up in Exception Level 3 (EL3 / Secure World). On RISC-V architectures, the core powers up in Machine Mode (M-Mode).

Why does the silicon die initialize the CPU into its highest hardware privilege mode at reset?

Because early platform boot firmware must perform unrestricted hardware configuration tasks:
* Programming raw physical memory controller timing registers and $I^2C$ buses.
* Initializing Input-Output Memory Management Unit (IOMMU) page table roots and interrupt remapping tables.
* Burning or reading security eFuse bitmasks to establish a Hardware Root of Trust.
* Setting up hardware System Management RAM (SMRAM) or ARM TrustZone memory protection controllers.

```text
THE MAXIMUM-PRIVILEGE UNPROTECTED RESET HAZARD

 CPU Core Powers Up at Power-On Reset
 ┌─────────────────────────────────────────────────────────────┐
 │ Highest Hardware Privilege Level (x86 Real/SMM | ARM EL3)   │
 │ Full Unrestricted Access to ALL Physical Memory & eFuses!   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ (Un-Gated Handoff Hazard!)
 CPU jumps directly to Operating System Kernel / User Application
 ┌─────────────────────────────────────────────────────────────┐
 │ UN-CONFIGURED PRIVILEGE BOUNDARIES:                         │
 │  * User Application runs in EL3 / Machine Mode!             │
 │  * Application can overwrite eFuses or hijack SMRAM!        │
 └─────────────────────────────────────────────────────────────┘
  (Total security collapse! User code has unrestricted root access to silicon!)
```

Now, consider the catastrophic security and stability failure that occurs if platform firmware hands over control to an operating system kernel or user-space application **without properly transitioning hardware privilege levels and initializing architectural descriptor tables**:

1. **The Architectural Execution Crash**: An operating system kernel (such as 64-bit Linux) is compiled using 64-bit machine instructions (`MOV RAX, RBX`). 

   If the CPU attempts to jump to the 64-bit OS kernel while still operating in 16-bit x86 Real Mode, the processor's instruction decoder misinterprets 64-bit opcodes as valid 16-bit instructions! 

   The CPU executes garbage operations, corrupts register states, and triggers an immediate hardware crash.
2. **The Security Contamination Collapse**: An operating system kernel is designed to run in a protected kernel privilege mode (x86 Ring 0 / ARM EL1 / RISC-V S-Mode), while user applications run in an unprivileged user mode (x86 Ring 3 / ARM EL0 / RISC-V U-Mode). 

   If early boot firmware fails to configure hardware privilege boundaries before booting the OS, **user-space applications will inherit highest-level hardware privileges**! 

   An unprivileged web browser or script running in user space could execute privileged instructions that wipe system firmware, re-program clock tree multipliers, or extract hardware encryption keys directly from silicon eFuses!

A processor cannot run an operating system or user applications in its power-on reset privilege state!

Before handing execution over to an operating system kernel, platform firmware must construct architecture-specific descriptor structures (such as x86 Global Descriptor Tables / GDTs), configure hardware control registers ($CR0, CR4, \text{IA32\_EFER}, \text{SPSR}, \text{mstatus}$), and execute a controlled, irreversible hardware transition to step down the CPU's privilege level.

To enforce hardware security boundaries and transition execution smoothly into 64-bit operating mode, computer architectures employ **Boot-Time CPU Privilege Level Transitions** and **Control Register Initialization**.

---

## 2. The High-Security Vault Pass and the Controlled Elevator

To build an intuitive, crystal-clear mental model of hardware privilege levels, descriptor tables, and mode transition handshakes before inspecting x86 GDT structures, ARM `ERET` instructions, and RISC-V `mret` CSRs, let us consider an everyday analogy: **The Multi-Story High-Security Government Building**.

Imagine a 4-story high-security government facility (**The CPU Hardware Privilege Ring System**).

```text
THE HIGH-SECURITY GOVERNMENT BUILDING METAPHOR

 ┌─────────────────────────────────────────────────────────────┐
 │ Floor 3: Master Vault Level (x86 SMM / ARM EL3 / RISC-V M)  │
 │ Contains Master Power Switches & eFuse Safe Locks          │
 ├─────────────────────────────────────────────────────────────┤
 │ Floor 2: Security Control Level (ARM EL2 / Hypervisor)     │
 │ Manages Virtual Partition Walls for Tenants                │
 ├─────────────────────────────────────────────────────────────┤
 │ Floor 1: Department Manager Level (x86 Ring 0 / ARM EL1)   │
 │ Manages Daily Office Operations (Operating System Kernel)  │
 ├─────────────────────────────────────────────────────────────┤
 │ Floor 0: General Employee Level (x86 Ring 3 / ARM EL0)      │
 │ Writes Documents & Executes Daily Tasks (User Applications) │
 └─────────────────────────────────────────────────────────────┘
```

The facility is divided into four distinct floors with increasing security access:
* **Floor 3 / Master Vault Level (x86 SMM / ARM EL3 / RISC-V M-Mode)**: Contains master power switches, physical building keys, and vault locks (**Hardware Control Registers and eFuses**).
* **Floor 2 / Security Control Level (ARM EL2 / Hypervisor)**: Controls virtual partition walls between different tenant offices (**Hypervisor / Virtual Machines**).
* **Floor 1 / Department Manager Level (x86 Ring 0 / ARM EL1 / RISC-V S-Mode)**: Manages daily office operations, file archives, and employee desks (**Operating System Kernel**).
* **Floor 0 / General Employee Level (x86 Ring 3 / ARM EL0 / RISC-V U-Mode)**: Employees sit at desks, write documents, and perform daily work (**User-Space Applications**).

Let us observe how a security officer (**The CPU Execution Core**) moves through this building during morning startup:

---

### Step 1: Arrival at Floor 3 (Power-On Reset)
When the security officer arrives at 8:00 AM (**Power-On Reset**), they enter directly onto **Floor 3 (Master Vault Level)**. 

Why? Because the officer needs to turn on the main building circuit breakers, unlock the office doors, and calibrate the security alarms (**Initialize Clocks, DRAM, and PCIe**).

---

### Step 2: Preparing the Department Manager's ID Badge (Descriptor Table Setup)
After setting up the building, the security officer prepares to open Floor 1 for the Department Manager (**The Operating System Kernel**).

The officer cannot simply throw the manager onto Floor 1 without an official badge! 

If the manager arrives on Floor 1 without an ID badge (**Global Descriptor Table / GDT**), the automated doors on Floor 1 will not recognize the manager's keycard, and the manager will get trapped in the hallway (**CPU Opcode Fetch Fault**).

The officer fills out an official **Identification Badge Ledger (The GDT / IDT Table)**:
* Specifies Floor 1 access rights.
* Defines memory boundaries for the manager's office.

```text
PREPARING THE BADGE LEDGER (GDT SETUP)

 Security Officer fills out Identification Badge Ledger (GDT Table in RAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Entry 0: Null Descriptor (Required Zero Entry)              │
 │ Entry 1: 64-Bit Kernel Code Segment (Floor 1 Access, Ring 0)│
 │ Entry 2: 64-Bit Kernel Data Segment (Floor 1 Access, Ring 0)│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Loads Ledger Address into Elevator Scanner! (LGDT Instruction)
```

---

### Step 3: The Controlled One-Way Elevator Drop (`ERET` / `mret`)

Now, the security officer steps into a specialized **One-Way Drop Elevator (The Exception Return Instruction: `ERET` / `mret`)**:

```text
THE ONE-WAY DROP ELEVATOR (PRIVILEGE TRANSITION)

 Security Officer on Floor 3 (Vault Level)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Sets Elevator Destination: "Floor 1 (OS Kernel)"         │
 │ 2. Sets Room Door Number   : "Room 100 (Kernel Entry Point)"│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Presses One-Way Drop Button (ERET / mret)!
 Elevator Drops to Floor 1 & Locks Floor 3 Door Behind It!
               │
               ▼
 Department Manager steps out onto Floor 1 with valid badge!
 (Manager CANNOT push the button to return to Floor 3!)
```

1. **Setting Destination Floor**: The officer sets the elevator destination control: *"Destination = Floor 1"* (**Programming `SPSR_EL3` / `mstatus.MPP`**).
2. **Setting Target Room**: The officer sets the target room door number: *"Room 100"* (**Programming `ELR_EL3` / `mepc`**).
3. **Pressing the One-Way Drop Button**: The officer presses the **One-Way Drop Button (`ERET` / `mret`)**!
4. **The Drop**: The elevator doors close on Floor 3, drop to Floor 1, and open. The manager steps out onto Floor 1 holding their new ID badge!
5. **The One-Way Lock**: The Floor 3 elevator button on Floor 1 is **physically locked from the inside**! The manager on Floor 1 **cannot push a button to return to Floor 3** unless a formal security alarm fires (**Hardware Interrupt / Exception**)!

This controlled elevator drop is the exact physical analogue of **Boot-Time CPU Privilege Level Transitions**:
* Floor 3 is **x86 SMM / ARM EL3 / RISC-V M-Mode (Highest Privilege)**.
* Floor 1 is **x86 Ring 0 / ARM EL1 / RISC-V S-Mode (Kernel Privilege)**.
* Floor 0 is **x86 Ring 3 / ARM EL0 / RISC-V U-Mode (User Privilege)**.
* The Identification Badge Ledger is the **Global Descriptor Table (GDT)**.
* Setting the destination floor is **Programming Status Registers (`SPSR_EL3` / `mstatus.MPP`)**.
* Setting the target room is **Programming Instruction Pointers (`ELR_EL3` / `mepc`)**.
* Pressing the One-Way Drop Button is **Executing `ERET` (ARM) or `mret` (RISC-V)**.

---

## 3. Formal Mechanics of Privilege Transitions Across Architectures

Now that we possess an intuitive mental model of vault levels, badge ledgers, and one-way drop elevators, let us examine the formal engineering mechanics of **Boot-Time CPU Privilege Level Transitions** across x86-64, ARM64, and RISC-V architectures.

---

### Primitive 1: x86-64 Transition (Real Mode $\to$ Protected Mode $\to$ Long Mode)

An x86-64 CPU powers up in 16-bit **Real Mode** for backwards compatibility. To boot a 64-bit operating system kernel, platform firmware executes a 3-stage mode transition:

```text
x86-64 PRIVILEGE MODE TRANSITION PIPELINE

 16-Bit Real Mode (Power-On Reset)
 ┌─────────────────────────────────────────────────────────────┐
 │ 20-Bit Segmented Addressing (PhysAddr = Segment*16 + Offset)│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Step 1: Load GDT (LGDT) & Set CR0.PE = 1
 32-Bit Protected Mode
 ┌─────────────────────────────────────────────────────────────┐
 │ 32-Bit Flat Addressing with Segment Descriptors (Ring 0)    │
 └─────────────┬───────────────────────────────┘
               │
               ▼ Step 2: Enable PAE (CR4.PAE=1), Page Tables (CR3),
               │         Long Mode (EFER.LME=1) & Paging (CR0.PG=1)
 64-Bit Long Mode (OS Kernel Ready!)
 ┌─────────────────────────────────────────────────────────────┐
 │ 64-Bit Flat Addressing with 4-Level/5-Level Page Tables     │
 └─────────────────────────────────────────────────────────────┘
```

---

#### Step 1: Global Descriptor Table (GDT) Synthesis and `LGDT`
In 32-bit Protected Mode and 64-bit Long Mode, memory segmentation is governed by 8-byte **Segment Descriptors** stored in a memory array called the **Global Descriptor Table (GDT)**:

```text
BITWISE LAYOUT OF AN 8-BYTE x86 SEGMENT DESCRIPTOR

 Double Word 1 (DW1 - Bits 63:32)
 ┌──────────────┬──────┬──────┬──────┬──────┬──────────────┬──────────────┐
 │ Base [31:24] │ G(1b)│ D(1b)│ L(1b)│AVL(1)│ Limit [19:16]│ Access Bytes │
 └──────────────┴──────┴──────┴──────┴──────┴──────────────┴──────────────┘

 Double Word 0 (DW0 - Bits 31:0)
 ┌──────────────────────────────────────────┬─────────────────────────────┐
 │ Base Address [23:0]                      │ Segment Limit [15:0]        │
 └──────────────────────────────────────────┴─────────────────────────────┘
```

Key Descriptor Bitfields:
* **Base Address ($32\text{ Bits}$)**: Starting physical memory address of the segment.
* **Segment Limit ($20\text{ Bits}$)**: Size of the segment in bytes or pages.
* **Privilege Level (`DPL` — Bits $[46:45]$)**: Descriptor Privilege Level ($00_2 = \text{Ring 0}$, $11_2 = \text{Ring 3}$).
* **Long Mode Flag (`L` — Bit 21 of DW1)**: $1 =$ Enables 64-bit Long Mode execution for this code segment.

Firmware builds the GDT in memory (defining a Null Descriptor, a 64-bit Kernel Code Segment, and a 64-bit Kernel Data Segment) and loads its base address into the hardware `GDTR` register using the `LGDT` instruction:

```x86asm
; x86 ASSEMBLY: LOADING GLOBAL DESCRIPTOR TABLE (GDT)
lgdt    [gdt_descriptor_pointer]    ; Loads 10-byte pointer (Limit + Base) into GDTR
```

---

#### Step 2: Entering 32-Bit Protected Mode
Firmware sets the **Protection Enable (`PE`) bit** (Bit 0) in Control Register $CR0$:

$$CR0.\text{PE} \Leftarrow 1$$

To flush 16-bit pre-fetched instructions from the CPU pipeline, firmware immediately executes a **Far Jump instruction (`JMP FAR`)**:

```x86asm
jmp     0x08:protected_mode_entry   ; 0x08 = Selector for 32-bit Code Segment
```

The CPU reloads the Code Segment register (`CS = 0x08`) and enters **32-Bit Protected Mode**!

---

#### Step 3: Entering 64-Bit Long Mode
To complete the transition to 64-bit execution:
1. Firmware sets Bit 5 (**Physical Address Extension / `PAE`**) in Control Register $CR4$:
   $$CR4.\text{PAE} \Leftarrow 1$$
2. Firmware loads the physical address of the 4-level root page table into Control Register $CR3$:
   $$CR3 \Leftarrow \text{Physical\_Address}(\text{PML4\_Page\_Table\_Root})$$
3. Firmware sets Bit 8 (**Long Mode Enable / `LME`**) in the Extended Feature Enable Register (`IA32_EFER`, MSR `0xC000_0080`):
   $$\text{EFER.LME} \Leftarrow 1$$
4. Firmware sets Bit 31 (**Paging Enable / `PG`**) in Control Register $CR0$:
   $$CR0.\text{PG} \Leftarrow 1$$
5. Firmware executes a far jump using a 64-bit Code Segment selector (`L-bit = 1` in GDT). **The CPU enters 64-Bit Long Mode!**

---

### Primitive 2: ARM64 Exception Level Transition (EL3 $\to$ EL2 $\to$ EL1 via `ERET`)

ARM64 (AArch64) processors power up at **Exception Level 3 (EL3)** in the Secure World.

To step down privilege and boot an operating system kernel running at **EL1** (or a Hypervisor at **EL2**), ARM firmware uses the **Exception Return (`ERET`)** instruction.

```text
ARM64 ERET PRIVILEGE DROP PIPELINE

 EL3 Secure Monitor Execution (Highest Privilege)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Set SPSR_EL3 = 0x3C5 (Target: EL1h, Interrupts Masked)  │
 │ 2. Set ELR_EL3  = Kernel_Entry_Point (e.g. 0x8000_0000)     │
 │ 3. Set SCR_EL3.NS = 1 (Grant Non-Secure World Access)       │
 └─────────────┬─────────────┘
               │
               ▼ Execute ERET Instruction!
 CPU Hardware Atomically:
  * Drops Exception Level from EL3 to EL1!
  * Loads Program Counter PC <= ELR_EL3 (0x8000_0000)!
  * Restores Processor State PSTATE <= SPSR_EL3!
               │
               ▼
 Operating System Kernel Begins Execution at EL1 in Non-Secure World!
```

#### The ARM64 `ERET` Transition Registers

Before executing `ERET`, firmware running in EL3 programs two hardware transition registers:

1. **Saved Program Status Register (`SPSR_EL3`)**: Defines the target Exception Level, stack pointer selection, and interrupt masking flags for the target state:
   * Bits $[3:0] = 4'b0101_2 \implies \text{Target Exception Level = EL1}$ using $\text{SP\_EL1}$.
   * Bits $[9:6] = 4'b1111_2 \implies \text{Mask all interrupts (Debug, SError, IRQ, FIQ)}$.

$$\text{SPSR\_EL3} \Leftarrow \text{0x0000\_03C5}$$

2. **Exception Link Register (`ELR_EL3`)**: Stores the target physical or virtual instruction address where execution will resume after `ERET`:

$$\text{ELR\_EL3} \Leftarrow \text{Target\_OS\_Kernel\_Entry\_Address}$$

3. **Secure Configuration Register (`SCR_EL3`)**: Firmware sets Bit 0 (`NS = 1`), transitioning the execution bus to the **Non-Secure World** so the OS kernel cannot access EL3 Secure World RAM!

```assembly
// ARM64 ASSEMBLY: EXCEPTION LEVEL DROP FROM EL3 TO EL1
mov     x0, #0x03C5             // Target: EL1h with SP_EL1, Interrupts Masked
msr     spsr_el3, x0            // Load SPSR_EL3

ldr     x0, =kernel_entry_point // Load target 64-bit kernel address
msr     elr_el3, x0            // Load ELR_EL3

mrs     x0, scr_el3
orr     x0, x0, #1              // Set SCR_EL3.NS = 1 (Non-Secure World)
msr     scr_el3, x0

isb                             // Instruction Synchronization Barrier (Flush Pipeline!)
eret                            // EXECUTE EXCEPTION RETURN! DROPS TO EL1 IMMEDIATELY!
```

---

### Primitive 3: RISC-V Privilege Transition (M-Mode $\to$ S-Mode via `mret`)

RISC-V processors power up in **Machine Mode (M-Mode)**, the highest privilege level.

To boot a Linux kernel running in **Supervisor Mode (S-Mode)**, RISC-V firmware (such as OpenSBI) executes the **Machine Mode Return (`mret`)** instruction.

```text
RISC-V MRET PRIVILEGE DROP PIPELINE

 Machine Mode (M-Mode / OpenSBI Firmware)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Set mstatus.MPP = 2'b01 (Target Previous Mode = S-Mode) │
 │ 2. Set mepc = Kernel_Entry_Point (e.g. 0x8020_0000)         │
 │ 3. Program PMP Registers (Grant S-Mode Access to DRAM)      │
 └─────────────┬─────────────┘
               │
               ▼ Execute mret Instruction!
 CPU Hardware Atomically:
  * Drops Privilege Level from M-Mode to S-Mode!
  * Sets Program Counter PC <= mepc (0x8020_0000)!
  * Sets mstatus.MIE <= mstatus.MPIE!
               │
               ▼
 Linux Kernel Begins Execution in Supervisor Mode (S-Mode)!
```

#### The RISC-V `mret` Transition Control Registers

Before executing `mret`, OpenSBI firmware programs three Control and Status Registers (CSRs):

1. **Machine Status Register (`mstatus`)**: Bits $[12:11]$ store the **Machine Previous Privilege (`MPP`)** field. The `mret` instruction inspects `MPP` to determine which privilege level to drop to:
   * `mstatus.MPP = 2'b00` $\implies$ Drop to User Mode (U-Mode).
   * `mstatus.MPP = 2'b01` $\implies$ **Drop to Supervisor Mode (S-Mode)**.
   * `mstatus.MPP = 2'b11` $\implies$ Remain in Machine Mode (M-Mode).

$$\text{mstatus.MPP} \Leftarrow 2'b01 \quad (\text{Target = S-Mode})$$

2. **Machine Exception Program Counter (`mepc`)**: Stores the target instruction address where execution will resume after `mret`:

$$\text{mepc} \Leftarrow \text{Kernel\_Entry\_Address}$$

3. **Physical Memory Protection (PMP) Configuration**: Before dropping to S-Mode, M-Mode firmware **MUST program PMP registers (`pmpcfg0` / `pmpaddr0`)** to grant S-Mode permission to access physical DRAM! If M-Mode forgets to program PMP, S-Mode will trigger an immediate Access Fault exception on its very first instruction fetch!

```riscv
# RISC-V ASSEMBLY: PRIVILEGE DROP FROM M-MODE TO S-MODE VIA OPENSBI
li      t0, (1 << 11)           # Bit 11 = MPP Bit 0 (Set MPP = 01_2 for S-Mode)
csrs    mstatus, t0             # Set mstatus.MPP = S-Mode

la      t1, linux_kernel_entry  # Load 64-bit kernel entry address
csrw    mepc, t1                # Store target in mepc CSR

# Program PMP0: Grant S-Mode Read/Write/Execute access to ALL RAM (0x0 to Top)
li      t2, -1                  # All ones (0xFFFFFFFFFFFFFFFF)
csrw    pmpaddr0, t2
li      t3, 0x1F                # PMP NAPOT mode, R/W/X permissions
csrw    pmpcfg0, t3

mret                            # EXECUTE MACHINE RETURN! DROPS TO S-MODE!
```

---

## 4. Engineering Realities: Un-Flushed Prefetch Pipelines and PMP Misconfigurations

In commercial platform firmware development, executing privilege transitions requires managing physical hardware edge cases to prevent hardware lockups and security vulnerabilities.

---

### 1. Un-Flushed Prefetch Instruction Pipeline Hazards

A critical real-world failure during mode transitions is the **Un-Flushed Prefetch Queue Hazard**.

To maximize execution throughput, high-speed CPU instruction fetch units read ahead, filling an internal **Prefetch Queue** with upcoming instructions:

```text
UN-FLUSHED PREFETCH QUEUE HAZARD

 CPU Core running in 16-Bit Real Mode
 ┌─────────────────────────────────────────────────────────────┐
 │ Instruction Queue holds 16-bit prefetched instructions      │
 └─────────────┬─────────────┘
               │
               ▼ Firmware sets CR0.PE = 1 (Enables 32-Bit Protected Mode!)
 CPU Pipeline attempts to execute next instruction from Queue...
 BUT Instruction Queue STILL HOLDS 16-BIT PREFETCHED OPCODES!
 Instruction Decoder interprets 16-bit opcode as 32-bit -> CRASH!
```

Trace the physical hardware crash:
1. The CPU is executing in 16-bit Real Mode. Its instruction prefetch queue contains 16-bit opcodes.
2. Firmware sets $CR0.\text{PE} = 1$ to enable Protected Mode.
3. On the very next clock cycle, the instruction decoder reads the next opcode from the prefetch queue.
4. **The Crash**: The instruction decoder is now operating in 32-bit mode, but the prefetch queue contains **16-bit opcodes**! The decoder misinterprets the 16-bit instruction, generates invalid control signals, and triggers a hardware exception!

#### The Hardware Invariant: Mandatory Barrier Synchronization
To prevent prefetch queue corruption during mode transitions, firmware **MUST execute an instruction barrier immediately before or after toggling privilege bits**:

```text
MANDATORY BARRIER SYNCHRONIZATION PER ARCHITECTURE

 Architecture │ Hardware Barrier Instruction │ Physical Pipeline Effect
──────────────┼──────────────────────────────┼─────────────────────────────────────────────
 x86 / x86-64 │ JMP FAR (Far Jump)           │ Flushes instruction queue & reloads CS
 ARM64        │ ISB (Instruction Barrier)    │ Flushes pipeline & re-fetches from ELR_EL3
 RISC-V       │ fence.i (Instruction Fence)  │ Flushes pipeline & synchronizes I-Cache
```

---

### 2. RISC-V PMP Lockout and Memory Faults

On RISC-V architectures, M-Mode firmware has complete, unrestricted access to physical memory regardless of PMP settings.

However, S-Mode (Supervisor Mode) and U-Mode (User Mode) **HAVE ZERO ACCESS TO PHYSICAL MEMORY BY DEFAULT** unless M-Mode explicitly programs Physical Memory Protection (PMP) registers!

If OpenSBI firmware configures `mstatus.MPP = 01` and executes `mret` *without* programming `pmpcfg0` and `pmpaddr0`:
1. The CPU drops privilege level to S-Mode.
2. S-Mode attempts its very first instruction fetch from physical RAM address `0x8020_0000`.
3. The PMP hardware checker inspects `pmpcfg0`, sees `Permission = NONE`, and **blocks the instruction fetch immediately**!
4. The CPU triggers an **Instruction Access Fault Exception**, freezing the boot sequence!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of x86 GDT descriptor structures, ARM `ERET` register setups, RISC-V `mret` CSR math, and mode transition execution latencies, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal platform software architect verifying the mode transition execution pipeline for a $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a 5-step mode transition sequence to step down privilege from Power-On Reset mode to 64-bit Kernel Mode:

```text
MODE TRANSITION SEQUENCE PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU execution clock frequency
 N_gdt_entries             │ 6 GDT Entries (48B)   │ Global Descriptor Table size (8 Bytes/entry)
 Cycles_lgdt               │ 16 Clock Cycles       │ LGDT instruction execution delay
 Cycles_far_jump           │ 32 Clock Cycles       │ JMP FAR execution & pipeline flush delay
 Cycles_msr_efer           │ 250 Clock Cycles      │ WRMSR IA32_EFER execution delay
 Cycles_page_table_setup   │ 1,200 Clock Cycles    │ Writing 4-level page table root to CR3
 Cycles_eret_mret          │ 24 Clock Cycles       │ ERET / mret atomic hardware drop delay
 T_dram_write_bw           │ 25.6 GB / Second      │ On-chip bus memory write bandwidth
```

#### Mode Transition Sequence Tasks:
1. **Step 1**: Construct a 6-entry GDT table ($48\text{ bytes}$) in memory and execute `LGDT` ($16\text{ cycles}$).
2. **Step 2**: Enable Protected Mode ($CR0.\text{PE} = 1$) and execute Far Jump 1 ($32\text{ cycles}$).
3. **Step 3**: Configure 4-level page tables and load $CR3$ ($1,200\text{ cycles}$).
4. **Step 4**: Enable Long Mode in `IA32_EFER` MSR ($250\text{ cycles}$) and set $CR0.\text{PG} = 1$.
5. **Step 5**: Execute Far Jump 2 into 64-bit Long Mode ($64\text{ cycles}$).

---

### The Hardware Execution Tasks:

1. Calculate the physical time $t_{\text{gdt\_write}}$ (in nanoseconds) required to write the 48-byte GDT table into RAM at $25.6\text{ GB/sec}$.
2. Calculate total CPU clock cycles $C_{\text{transition\_total}}$ and physical execution time $T_{\text{transition\_total}}$ (in microseconds) consumed by the complete 5-step x86 mode transition pipeline.
3. Compare the x86 5-step mode transition latency against an ARM64 `ERET` privilege drop sequence (configuring `SPSR_EL3`, `ELR_EL3`, `SCR_EL3`, `ISB`, and `ERET` consuming a total of $180\text{ CPU clock cycles}$). Calculate the time saved by ARM64 `ERET` over x86 mode switching.
4. Calculate the percentage reduction in mode transition delay delivered by ARM64 `ERET` over the x86 3-stage legacy transition pipeline.

---

### Step-by-Step Derivation

#### Step 1: Calculate GDT Memory Write Latency ($t_{\text{gdt\_write}}$)

Writing 6 GDT entries ($48\text{ bytes}$) to RAM at $25.6\text{ GB/sec}$ ($25.6 \times 10^9\text{ bytes/sec}$):

$$t_{\text{gdt\_write}} = \frac{\text{GDT Size}}{\text{DRAM Write BW}} = \frac{48\text{ Bytes}}{25.6 \times 10^9\text{ Bytes/sec}}$$

$$t_{\text{gdt\_write}} = 1.875 \times 10^{-9}\text{ seconds} = \mathbf{1.875 \text{ Nanoseconds}}$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{gdt\_write}} = \frac{1.875\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{6 \text{ CPU Clock Cycles}}$$

---

#### Step 2: Calculate Total x86 Mode Transition Latency ($T_{\text{transition\_total}}$)

Summing the CPU clock cycles across all 5 transition steps:

$$C_{\text{transition\_total}} = C_{\text{gdt\_write}} + C_{\text{lgdt}} + C_{\text{far\_jump1}} + C_{\text{page\_table\_setup}} + C_{\text{msr\_efer}} + C_{\text{far\_jump2}}$$

$$C_{\text{transition\_total}} = 6 + 16 + 32 + 1,200 + 250 + 64 = \mathbf{1,568 \text{ CPU Clock Cycles}}$$

Calculate physical execution time $T_{\text{transition\_total}}$ at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{transition\_total}} = 1,568 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{490.0 \text{ Nanoseconds}} \quad (0.490\ \mu\text{s})$$

The complete x86 Real Mode $\to$ Long Mode transition executes in **$490.0\text{ nanoseconds}$ ($1,568\text{ CPU clock cycles}$)**.

---

#### Step 3: Calculate ARM64 `ERET` Privilege Transition Latency

An ARM64 `ERET` privilege drop from EL3 to EL1 consumes $C_{\text{arm\_eret}} = 180\text{ CPU clock cycles}$:

$$t_{\text{arm\_eret}} = 180 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{56.25 \text{ Nanoseconds}} \quad (0.05625\ \mu\text{s})$$

##### Calculate Time Saved by ARM64 `ERET` over x86 Transition:

$$\Delta t_{\text{saved}} = T_{\text{transition\_total}} - t_{\text{arm\_eret}} = 490.0\text{ ns} - 56.25\text{ ns} = \mathbf{433.75 \text{ Nanoseconds Saved!}}$$

$$\text{CPU Cycles Saved} = 1,568 - 180 = \mathbf{1,388 \text{ CPU Clock Cycles Saved!}}$$

---

#### Step 4: Calculate Percentage Reduction in Mode Transition Delay

$$\text{Latency Reduction \%} = \left( 1 - \frac{t_{\text{arm\_eret}}}{T_{\text{transition\_total}}} \right) \times 100\% = \left( 1 - \frac{56.25\text{ ns}}{490.00\text{ ns}} \right) \times 100\%$$

$$\text{Latency Reduction \%} = (1 - 0.1148) \times 100\% = \mathbf{88.52\% \text{ Latency Reduction!}}$$

```text
PRIVILEGE TRANSITION PERFORMANCE COMPARISON SUMMARY

 Architecture / Mode     │ Transition Steps Required   │ CPU Cycles (3.2 GHz) │ Physical Latency (ns)
─────────────────────────┼─────────────────────────────┼──────────────────────┼───────────────────────
 x86-64 Real -> Long Mode│ 5 Steps (GDT, PE, PAE, LME) │ 1,568 Cycles         │ 490.00 ns
 ARM64 EL3 -> EL1 (ERET) │ 1 Step (ERET Instruction)   │   180 Cycles         │  56.25 ns
 RISC-V M -> S (mret)    │ 1 Step (mret Instruction)   │   160 Cycles         │  50.00 ns
─────────────────────────┴─────────────────────────────┴──────────────────────┴───────────────────────
 ARM64 ERET Advantage    │ 88.52% Latency Reduction vs x86-64 (1,388 CPU Cycles Saved!)
```

##### Engineering Conclusion:
Because ARM64 and RISC-V utilize dedicated hardware exception return instructions (`ERET` / `mret`) that update privilege levels, instruction pointers, and status flags in a single atomic hardware step, they execute privilege mode transitions **$8.71\times$ faster ($88.52\%$ latency reduction)** than legacy x86-64 3-stage segmented descriptor transitions!

---

### Sanity Check and Verification

Let us verify our mathematical and architectural results against CPU specifications:

1. **GDT Memory Size Verification**:
   * 6 entries $\times 8\text{ bytes/entry} = 48\text{ bytes}$.
   * At $25.6\text{ GB/sec}$, $48 / (25.6 \times 10^9) = 1.875\text{ ns}$.
   * In cycles at $3.2\text{ GHz}$: $1.875\text{ ns} / 0.3125\text{ ns/cycle} = 6.0\text{ cycles}$. Exact integer match!
2. **`ERET` Atomic Hardware State Swap Check**:
   * `ERET` atomically copies `SPSR_EL3` to `PSTATE` and `ELR_EL3` to `PC`.
   * Execution drops from EL3 to EL1 in $180\text{ cycles}$, eliminating the need for intermediate 32-bit protected mode jumps or segment descriptor reloads.
3. **PMP / GDT Boundary Safety Check**:
   * On x86, $CR0.\text{PG} = 1$ enables page table protection.
   * On RISC-V, `pmpcfg0` enables S-Mode memory protection.
   * Both architectures enforce memory isolation immediately upon mode drop, preventing unprivileged kernel access violations.

All x86 GDT segment descriptor bitfield maps, ARM `SPSR_EL3`/`ELR_EL3` registers, RISC-V `mstatus.MPP` bits, and $88.52\%$ mode transition latency reduction metrics evaluate with 100% mathematical, physical, and logical precision.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **x86 GDT/IDT Descriptor Setup**: The x86 privilege transition protocol where 8-byte segment descriptors defining memory limits and privilege rings ($DPL = 0 \dots 3$) are loaded into `GDTR`/`IDTR` registers (`LGDT`/`LIDT`), enabling Protected Mode ($CR0.\text{PE} = 1$) and 64-bit Long Mode ($\text{EFER.LME} = 1$) via far jump pipeline flushes.
* **ARM Exception Level Transitions (`ERET`)**: The ARM64 hardware privilege drop mechanism where software running at EL3 programs `SPSR_EL3` (target EL1 state) and `ELR_EL3` (target PC vector) and executes `ERET`, atomically stepping down privilege and switching to Non-Secure World execution.
* **RISC-V M-Mode to S-Mode OpenSBI Transition (`mret`)**: The RISC-V privilege drop protocol where Machine Mode firmware (OpenSBI) configures `mstatus.MPP = 01_2` (Supervisor Mode), sets `mepc` to the kernel entry address, programs PMP memory protection, and executes `mret` to drop to S-Mode execution.