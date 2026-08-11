---
title: "03-privilege-level-boot-transitions — Boot-Time CPU Privilege Level Transitions and Hardware Register Control"
---

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


### Step 1: Arrival at Floor 3 (Power-On Reset)
When the security officer arrives at 8:00 AM (**Power-On Reset**), they enter directly onto **Floor 3 (Master Vault Level)**. 

Why? Because the officer needs to turn on the main building circuit breakers, unlock the office doors, and calibrate the security alarms (**Initialize Clocks, DRAM, and PCIe**).


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


#### Step 2: Entering 32-Bit Protected Mode
Firmware sets the **Protection Enable (`PE`) bit** (Bit 0) in Control Register $CR0$:

$$CR0.\text{PE} \Leftarrow 1$$

To flush 16-bit pre-fetched instructions from the CPU pipeline, firmware immediately executes a **Far Jump instruction (`JMP FAR`)**:

```x86asm
jmp     0x08:protected_mode_entry   ; 0x08 = Selector for 32-bit Code Segment
```

The CPU reloads the Code Segment register (`CS = 0x08`) and enters **32-Bit Protected Mode**!


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


## 4. Engineering Realities: Un-Flushed Prefetch Pipelines and PMP Misconfigurations

In commercial platform firmware development, executing privilege transitions requires managing physical hardware edge cases to prevent hardware lockups and security vulnerabilities.


### 2. RISC-V PMP Lockout and Memory Faults

On RISC-V architectures, M-Mode firmware has complete, unrestricted access to physical memory regardless of PMP settings.

However, S-Mode (Supervisor Mode) and U-Mode (User Mode) **HAVE ZERO ACCESS TO PHYSICAL MEMORY BY DEFAULT** unless M-Mode explicitly programs Physical Memory Protection (PMP) registers!

If OpenSBI firmware configures `mstatus.MPP = 01` and executes `mret` *without* programming `pmpcfg0` and `pmpaddr0`:
1. The CPU drops privilege level to S-Mode.
2. S-Mode attempts its very first instruction fetch from physical RAM address `0x8020_0000`.
3. The PMP hardware checker inspects `pmpcfg0`, sees `Permission = NONE`, and **blocks the instruction fetch immediately**!
4. The CPU triggers an **Instruction Access Fault Exception**, freezing the boot sequence!


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


### Step-by-Step Derivation

#### Step 1: Calculate GDT Memory Write Latency ($t_{\text{gdt\_write}}$)

Writing 6 GDT entries ($48\text{ bytes}$) to RAM at $25.6\text{ GB/sec}$ ($25.6 \times 10^9\text{ bytes/sec}$):

$$t_{\text{gdt\_write}} = \frac{\text{GDT Size}}{\text{DRAM Write BW}} = \frac{48\text{ Bytes}}{25.6 \times 10^9\text{ Bytes/sec}}$$

$$t_{\text{gdt\_write}} = 1.875 \times 10^{-9}\text{ seconds} = \mathbf{1.875 \text{ Nanoseconds}}$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{gdt\_write}} = \frac{1.875\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{6 \text{ CPU Clock Cycles}}$$


#### Step 3: Calculate ARM64 `ERET` Privilege Transition Latency

An ARM64 `ERET` privilege drop from EL3 to EL1 consumes $C_{\text{arm\_eret}} = 180\text{ CPU clock cycles}$:

$$t_{\text{arm\_eret}} = 180 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{56.25 \text{ Nanoseconds}} \quad (0.05625\ \mu\text{s})$$

##### Calculate Time Saved by ARM64 `ERET` over x86 Transition:

$$\Delta t_{\text{saved}} = T_{\text{transition\_total}} - t_{\text{arm\_eret}} = 490.0\text{ ns} - 56.25\text{ ns} = \mathbf{433.75 \text{ Nanoseconds Saved!}}$$

$$\text{CPU Cycles Saved} = 1,568 - 180 = \mathbf{1,388 \text{ CPU Clock Cycles Saved!}}$$


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

