content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/05-privileged-isa-trap-architecture/02-hardware-trap-vector-execution/02-context-save-restore-trap-handlers.md
# Context Save and Restore Architecture for Trap Handlers and Lazy Status Tracking Mechanics

## The Interrupted State Erasure Hazard: Why Trap Handlers Destroy User State Without Context Preservation

In a high-performance central processing unit (CPU) running at a master clock frequency of $3.2\text{ GHz}$, an active user application program executes software by storing its working data across the entire general-purpose register file ($x1 \dots x31$), floating-point register file ($f0 \dots f31$), and vector register file ($v0 \dots v31$). These architectural registers hold active loop counters, memory pointers, floating-point geometry coordinates, and vector arrays essential to the program's ongoing calculations.

At an arbitrary, unpredictable clock cycle, an event occurs that interrupts the running program:
1. **Asynchronous Hardware Interrupt**: A network card signals an incoming packet, a disk controller completes a DMA block transfer, or a hardware timer count reaches zero.
2. **Synchronous Software Trap**: The user application executes a system call (`ecall`), suffers a page fault, or encounters an arithmetic exception.

When a trap or interrupt occurs, the CPU hardware overrides the Program Counter ($PC$) and jumps immediately to the operating system kernel's **Trap Handler Routine** in memory.

Now, consider the physical microarchitectural disaster that unfolds if the trap handler routine begins executing machine instructions without preserving the interrupted program's register state:

```text
THE INTERRUPTED STATE ERASURE HAZARD

 User Program Running (Registers x1..x31 hold loop counters & data)
 ┌─────────────────────────────────────────────────────────────┐
 │ Reg x10 = Loop Counter (100) | Reg x11 = Pointer (0x1000)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ HARDWARE INTERRUPT FIRES!
 CPU jumps to Trap Handler Routine in Kernel Memory!
 ┌─────────────────────────────────────────────────────────────┐
 │ TRAP HANDLER EXECUTES WITHOUT CONTEXT PRESERVATION!          │
 │   addi x10, x0, 42    ──► OVERWRITES User Reg x10 with 42!   │
 │   sd   x11, 0(x20)    ──► OVERWRITES User Reg x11!           │
 │   mret / sret         ──► Returns to User Program            │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 User Program resumes execution: Reads x10 expecting 100, finds 42!
 (USER PROGRAM DATA PERMANENTLY ERASED AND CORRUPTED!)
```

Trace the physical state destruction:
1. **State Overwrite**: The trap handler routine must execute machine instructions to process the interrupt. To perform its work, the trap handler loads its own variables into general-purpose registers $x1 \dots x31$, floating-point registers $f0 \dots f31$, and vector registers $v0 \dots v31$.
2. **User Data Erasure**: The trap handler's instructions write directly into the architectural register file, **permanently overwriting the user program's loop counters and memory pointers**!
3. **Resumed Execution Failure**: When the trap handler finishes and executes a trap return instruction (`mret` / `sret`), execution returns to the user program. The user program attempts to read register $x10$ expecting its loop counter ($100$), but reads the trap handler's leftover data ($42$) instead!
4. The user application calculates incorrect math, corrupts memory files, or crashes instantly.

Furthermore, saving and restoring large coprocessor register files—such as 32 64-bit floating-point registers ($256\text{ bytes}$) and 32 512-bit vector registers ($2,048\text{ bytes}$)—on **EVERY SINGLE TRAP** consumes hundreds of clock cycles and floods the stack memory bus with megabytes of unnecessary traffic!

We face two interconnected physical engineering challenges:
* How does a hardware trap handler construct a complete **Register Context Frame** on a secure kernel stack, preserving and restoring user state with $100\%$ fidelity?
* How do hardware status flags—specifically **Lazy Status Tracking bits (`FS` and `VS` in `mstatus`)**—allow the trap handler to skip saving massive floating-point and vector registers when they have not been modified, saving up to $90\%$ of trap overhead?
* How do privileged **Trap Return Instructions (`mret` / `sret`)** atomically restore the Program Counter, privilege level, and global interrupt enable states in a single, indivisible hardware clock cycle?

To preserve user state and eliminate unnecessary register saving overhead, modern computer architectures implement **Register Context Save/Restore Frames**, **Lazy Status Tracking (`FS` / `VS` bits)**, and **Atomic Trap Return Instructions (`mret` / `sret`)**.

---

## The Artist's Studio and the Emergency Repair Crew: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of trap context save/restore frames, lazy coprocessor tracking, and atomic trap returns before inspecting assembly stack layout diagrams, `mstatus` bitmask fields, and `mret` hardware state transitions, let us consider an everyday analogy: **The Artist's Workbench and the Emergency Repair Crew**.

Imagine a professional artist (**The User-Mode Application**) working in a private studio (**The Architectural Register File**).

```text
THE ARTIST'S WORKBENCH AND REPAIR CREW METAPHOR

 Artist Studio Workbench (Architectural Registers x1..x31)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Handheld Paint Brushes (x1..x31) - ACTIVE WORK           │
 │ 32 Heavy 3D Clay Sculptures (f0..f31, v0..v31) - UNTOUCHED │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ EMERGENCY FIRE ALARM FIRES!
 Emergency Repair Crew (Hardware Trap Handler) rushes in!
 Must fix water pipe without disturbing a single brush or sculpture!
```

The artist has 32 delicate handheld paint brushes (**General-Purpose Registers $x1 \dots x31$**) and 32 heavy, 500-pound clay sculptures (**Floating-Point / Vector Registers $f0 \dots f31, v0 \dots v31$**) laid out on their workbench.

Suddenly, an emergency water pipe bursts (**A Hardware Trap / Exception Fires**)!

An Emergency Repair Crew (**The Trap Handler Routine**) rushes into the studio to fix the pipe.

Let us observe three different operational policies used by the repair crew:

---

### Policy 1: Blind Un-Saved Work (Context Corruption)

1. The repair crew rushes in, dumps their heavy wrenches directly onto the artist's workbench, and knocks over the paint brushes and clay sculptures!
2. The repair crew fixes the pipe.
3. The repair crew leaves.
4. The artist returns to their workbench: all their paint brushes are covered in grease, the clay sculptures are smashed, and months of artwork are **permanently destroyed**!

This is the **Interrupted State Erasure Hazard**.

---

### Policy 2: Complete Context Save and Restore

1. Before touching a single wrench, the repair crew carefully picks up every single paint brush ($x1 \dots x31$) and every 500-pound clay sculpture ($f0 \dots f31, v0 \dots v31$) and packs them into a padded transport container (**The Kernel Trap Context Frame on the Stack**).
2. The crew fixes the water pipe.
3. Before leaving, the crew places every paint brush and clay sculpture back in its exact millimeter position on the workbench (**Context Restore**).
4. The crew exits and locks the door (**Executes `mret` / `sret`**).
5. The artist resumes painting with $100\%$ zero knowledge that a repair crew ever entered the room!

---

### Policy 3: Lazy Status Tracking (`mstatus.FS` and `mstatus.VS` Bits)

The repair crew manager notices an opportunity to save time:
* Packing and unpacking 32 500-pound clay sculptures takes 30 minutes!
* The manager installs a small status indicator sign on the studio wall (**`mstatus.FS` and `mstatus.VS` bits**):
  * **`FS = 00_2` (Off / Disabled)**: The artist has not even turned on the 3D clay station today!
  * **`FS = 01_2` (Initial / Clean)**: The clay sculptures are sitting in factory boxes, completely untouched!
  * **`FS = 11_2` (Dirty)**: The artist modified the clay sculptures today!

```text
LAZY STATUS TRACKING WALL SIGN (mstatus.FS / VS)

 Check Wall Sign before packing heavy sculptures:
   * FS == 01_2 (Clean) ──► SKIPS PACKING 32 HEAVY SCULPTURES!
                            (Saves 30 minutes of heavy lifting!)
   * FS == 11_2 (Dirty) ──► Must pack sculptures to stack!
```

Look at how Policy 3 operates:
1. The repair crew enters the studio and packs the 32 handheld paint brushes (takes 10 seconds).
2. The crew checks the wall sign: **`FS = 01_2` (Clean)**!
3. The crew manager orders: *"The artist hasn't touched the heavy clay sculptures today! **LEAVE THE SCULPTURES ON THE SHELF! DO NOT WASTE TIME PACKING THEM!**"*
4. The repair crew fixes the pipe in 15 seconds, saving 30 minutes of heavy lifting (**Lazy Context Saving**)!

This studio repair crew is the exact physical analogue of **Trap Context Save/Restore and Lazy Status Tracking**:
* The artist's paint brushes are **General-Purpose Registers ($x1 \dots x31$)**.
* The heavy 500-pound clay sculptures are **Floating-Point & Vector Registers ($f0 \dots f31, v0 \dots v31$)**.
* The padded transport container is **The Kernel Trap Context Frame on the Stack**.
* The wall indicator sign is **The `mstatus.FS` and `mstatus.VS` Bits**.
* Skipping untouched sculptures is **Lazy Coprocessor State Preservation**.
* Locking the door and exiting is **The `mret` / `sret` Trap Return Instruction**.

---

## Primitive 1: The Register Context Save and Restore Frame

Now that we possess a clear intuitive mental model of padded transport containers and studio repair crews, let us examine the formal engineering mechanics of **The Register Context Frame**.

> **A Register Context Frame** is a standardized, 16-byte aligned memory structure allocated on the kernel stack during a trap entry that stores the exact 64-bit contents of all interrupted general-purpose ($x1 \dots x31$), floating-point ($f0 \dots f31$), and Control Status Registers (`mepc`, `mstatus`, `mcause`, `mtval`).

```text
TRAP CONTEXT FRAME MEMORY LAYOUT ON KERNEL STACK

 Memory Addresses (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ Interrupted User Code Stack Space                           │
 ├─────────────────────────────────────────────────────────────┤
 │ [ Fault Value / Address (mtval / stval) ]  Offset: 280(sp)  │
 │ [ Exception Cause Code (mcause / scause) ] Offset: 272(sp)  │
 │ [ Machine Status Register (mstatus)      ] Offset: 264(sp)  │
 │ [ Interrupted Program Counter (mepc)     ] Offset: 256(sp)  │
 ├─────────────────────────────────────────────────────────────┤
 │ [ Saved General-Purpose Registers x1..x31] Offset: 0..248   │
 │ ◄── Kernel Stack Pointer sp points HERE! (288-Byte Frame)   │
 └─────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step Context Save Execution (`trap_entry_handler`)

When a hardware trap occurs, the kernel's trap entry handler executes a 4-step context save sequence in assembly:

1. **Atomic Stack Pointer Swap**: The handler executes `csrrw sp, mscratch, sp` to swap the un-trusted user stack pointer for a secure, 16-byte aligned kernel stack pointer.
2. **Context Frame Allocation**: The handler allocates $288\text{ bytes}$ on the kernel stack frame:
   $$\mathtt{addi \ sp, \ sp, \ -288}$$
3. **General-Purpose Register Preservation**: The handler stores all 31 general-purpose registers ($x1 \dots x31$) onto the stack frame using 64-bit store instructions (`sd x1, 0(sp)`, `sd x3, 16(sp)` $\dots$ `sd x31, 240(sp)`).
4. **Exception CSR Preservation**: The handler reads `mepc`, `mstatus`, `mcause`, and `mtval` using CSR read instructions (`csrr t0, mepc`) and stores them in the context frame header at offsets `256(sp)`, `264(sp)`, `272(sp)`, and `280(sp)`.

---

## Primitive 2: Lazy Status Tracking (`mstatus.FS` and `mstatus.VS`)

Now let us examine the second core primitive: **Lazy Status Tracking**.

In high-performance computing, floating-point units (FPUs) and Vector units contain massive register files:
* 32 64-bit Floating-Point Registers ($f0 \dots f31$) $= 256\text{ bytes}$.
* 32 512-bit Vector Registers ($v0 \dots v31$) $= 2,048\text{ bytes}$.

Saving $2,304\text{ bytes}$ of coprocessor registers on every single system call or interrupt requires executing **288 memory store instructions**!

To eliminate this massive memory bandwidth penalty, the CPU hardware implements **Lazy Status Tracking**.

> **Lazy Status Tracking** is a microarchitectural state machine managed by hardware status bits in `mstatus` (`FS` for Floating-Point, `VS` for Vector) that tracks whether coprocessor registers have been modified, allowing trap handlers to skip saving untouched floating-point or vector registers on stack frame allocations.

```text
MSTATUS FS / VS COPROCESSOR STATE ENCODING TABLE

 State Bits [1:0] │ State Name │ Hardware Meaning & Context Action
──────────────────┼────────────┼─────────────────────────────────────────────────────────────
       00_2       │ Off        │ Coprocessor disabled! Any FP/Vector inst triggers Trap!
       01_2       │ Initial    │ Coprocessor enabled, but registers are in initial 0 state.
       10_2       │ Clean      │ Coprocessor enabled; registers NOT modified since last save!
                  │            │ ──► LAZY SAVE SKIPS SAVING COPROCESSOR REGISTERS!
       11_2       │ Dirty      │ Coprocessor registers MODIFIED by user code!
                  │            │ ──► MUST SAVE ALL COPROCESSOR REGISTERS TO STACK!
```

```text
LAZY CONTEXT SAVING DECISION TREE

 Trap Handler enters Context Save Phase
  │
  ▼
 Inspect mstatus.FS bits:
  ├─► FS == 10_2 (Clean) ──► SKIPS SAVING f0..f31! Saves 256 Bytes of Memory Writes!
  └─► FS == 11_2 (Dirty) ──► Saves f0..f31 to Stack! Resets FS <= 10_2 (Clean).
```

---

### How Lazy Context Saving Accelerates Traps in Silicon

1. **Hardware Dirty Tracking**:
   When the user application executes its first floating-point instruction (e.g. `fadd.s f0, f1, f2`), the CPU hardware automatically sets **`mstatus.FS = 11_2` (Dirty)**.
2. **Trap Handler Inspection**:
   When a trap occurs, the kernel reads `mstatus` and inspects bits `[14:13]` (`FS`):
   * **If `mstatus.FS == 10_2` (Clean)**: No floating-point instructions were executed since the last restore! The handler **skips saving $f0 \dots f31$**, saving **32 memory stores ($256\text{ bytes}$) and 32 clock cycles**!
   * **If `mstatus.FS == 11_2` (Dirty)**: Floating-point registers were modified. The handler saves $f0 \dots f31$ onto the stack, and resets `mstatus.FS` back to **`10_2` (Clean)**!

---

## Primitive 3: The Trap Return Instruction (`mret` / `sret`)

Now let us examine the third core primitive: **The Trap Return Instruction (`mret` / `sret`)**.

Once the operating system trap handler finishes processing an exception and restores the saved register context from the stack, it must return execution to the interrupted user program.

Can the trap handler return using a standard function return instruction (`ret` / `jalr x0, 0(ra)`)?

**NO!** A standard `ret` instruction only changes the Program Counter ($PC$). It cannot lower the CPU privilege mode from Kernel Mode back to User Mode, nor can it re-enable global hardware interrupts!

To execute a complete state restoration, the CPU provides privileged **Trap Return Instructions (`mret` / `sret`)**.

> **A Trap Return Instruction (`mret` in Machine Mode / `sret` in Supervisor Mode)** is a privileged hardware instruction that atomically restores the Program Counter ($PC$), demotes the CPU privilege mode back to the interrupted level, and re-enables global interrupts in a single, indivisible hardware clock cycle.

```text
MRET / SRET HARDWARE ATOMIC STATE RESTORATION

 Executing mret Instruction in M-Mode (1 Clock Cycle):
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Restore Program Counter : PC <= mepc                     │
 │ 2. Demote Privilege Mode   : Mode <= mstatus.MPP (U or S)   │
 │ 3. Re-enable Interrupts   : mstatus.MIE <= mstatus.MPIE     │
 └─────────────────────────────────────────────────────────────┘
  (All 3 state restorations execute atomically on 1 clock edge!)
```

---

### The Three Atomic Hardware Actions of `mret`

When `mret` executes in Machine Mode, the CPU hardware performs three atomic operations on a single rising clock edge:

1. **Program Counter Restoration**:
   The Program Counter is loaded with the address stored in `mepc`:
   $$\mathbf{PC \Leftarrow \text{mepc}}$$
2. **Privilege Mode Demotion**:
   The active hardware privilege mode is restored from the Machine Previous Privilege field (`MPP`, bits `[12:11]` in `mstatus`):
   $$\mathbf{\text{Current\_Mode} \Leftarrow \text{mstatus.MPP}}$$
3. **Global Interrupt Re-Enabling**:
   Global interrupts are re-enabled by restoring the Machine Interrupt Enable bit (`MIE`, bit 3) from the Machine Previous Interrupt Enable bit (`MPIE`, bit 7):
   $$\mathbf{\text{mstatus.MIE} \Leftarrow \text{mstatus.MPIE}}$$

The user application resumes execution in User Mode at address `mepc` with interrupts fully re-enabled!

---

## Real-World Silicon Engineering: Vector Register Traffic and Dual-Stack Isolation

In commercial high-performance microprocessors, context save and restore architecture intersects with hardware security and vector processing:

### 1. Vector Register Stack Traffic (`VS` Bits)

In processors supporting the RISC-V Vector extension (RVV) or x86 AVX-512, saving 32 512-bit vector registers requires **$2,048\text{ bytes}$ of stack memory writes** ($256\text{ double-word stores}$).

At 1 store per clock cycle, saving vector context takes **256 clock cycles ($80\text{ nanoseconds}$ at $3.2\text{ GHz}$)**!

By implementing **Lazy Vector Tracking (`mstatus.VS`)**, over $95\%$ of standard system calls and interrupts skip vector context saving entirely, saving $80\text{ nanoseconds}$ of latency per trap!

---

### 2. Dual-Stack Isolation (`mscratch` / `sscratch`)

To prevent user-mode stack overflows from crashing the kernel during trap entry:
* Register `mscratch` holds the base address of a dedicated $8\text{-KB}$ **Kernel Trap Stack**.
* Line 1 of `trap_entry_handler` executes `csrrw sp, mscratch, sp`.
* User `sp` is safely quarantined in `mscratch`, while `sp` receives the clean kernel stack pointer!

```text
DUAL-STACK ISOLATION VIA MSCRATCH

 User Mode Execution (sp = User Stack 0x7FFF0E00, mscratch = Kernel Stack 0x80002000)
  │
  ▼ Hardware Trap Fired!
 Executes: csrrw sp, mscratch, sp
  │
  ▼ After Swap:
  * sp       <= 0x80002000 (CLEAN KERNEL STACK!)
  * mscratch <= 0x7FFF0E00 (QUARANTINED USER STACK!)
 (Kernel stores context safely on Kernel Stack!)
```

---

## Solved Industrial Engineering Exercise: Complete Context Frame Synthesis, Lazy `FS` Status Audit, and `mret` Timing Analysis

To consolidate your complete mastery of register context save/restore architecture, lazy status tracking (`mstatus.FS`/`VS`), and atomic trap return instructions (`mret`), we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior operating system kernel microarchitect auditing the trap handling subsystem for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes user-mode applications with floating-point (FPU) hardware enabled.

```text
3.2 GHz PROCESSOR TRAP CONTEXT SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Trap Entry Handler ] ──► [ Lazy FS/VS Checker ] ──► Kernel Stack
 Clock T = 312.5 ps     Atomic Context Save       Skips FP if Clean         mstatus, mepc
```

#### Hardware Memory & Register Parameters:
* Interrupted User State:
  * User $PC = \text{0x0000\_0000\_0040\_1080}$.
  * User $sp = \text{0x0000\_0000\_7FFF\_0E00}$.
  * `mstatus` CSR = $\text{0x0000\_0000\_0000\_2000}$ (`mstatus.FS = 01_2` $\implies$ **CLEAN / UNTOUCHED STATE**).
  * `mscratch` CSR = $\text{0x0000\_0000\_8000\_2000}$ (Kernel Stack Base Pointer).
* Context Frame Sizes:
  * General-Purpose Context Block ($x1 \dots x31$ + 4 CSRs) $= 288\text{ bytes}$ (16-byte aligned).
  * Floating-Point Context Block ($f0 \dots f31$ + `fcsr`) $= 264\text{ bytes}$ (16-byte aligned).
* Memory Latency: Each 64-bit store (`sd`/`fsd`) or load (`ld`/`fld`) to L1 stack RAM takes $1\text{ clock cycle}$ ($0.3125\text{ ns}$).

#### Tested Execution Scenarios:
* **Scenario A (Eager Save — Lazy Tracking Disabled)**: Trap handler blindly saves ALL 31 general-purpose registers AND ALL 32 floating-point registers on every trap.
* **Scenario B (Lazy Save — Lazy `mstatus.FS` Enabled)**: Trap handler inspects `mstatus.FS`. Since `FS == 01_2` (Clean), it saves ONLY general-purpose registers, skipping $f0 \dots f31$!

#### Your Objective

1. Write the complete RISC-V 64-bit assembly implementation for the **Context Save Phase** and **Context Restore Phase** of Scenario B (Lazy Save).
2. Trace the exact values written into `mepc`, `mcause`, `mtval`, and `mstatus` when an Illegal Instruction Exception (`0xFFFFFFFF` at $PC = \text{0x00401080}$) fires.
3. Calculate total memory operations (stores/loads) and memory traffic volume (in bytes) executed during context save/restore for:
   * **Scenario A (Eager Save)**.
   * **Scenario B (Lazy Save)**.
4. Calculate physical execution time (in nanoseconds) and the **Performance Speedup Factor** of Scenario B over Scenario A.
5. Trace the 3 atomic actions executed by `mret` during the final trap return.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Write Assembly Implementation for Scenario B (Lazy Context Save/Restore)

```riscv
# LAZY TRAP CONTEXT SAVE AND RESTORE ROUTINE

.global trap_entry_handler
trap_entry_handler:
    # --- PHASE 1: ATOMIC STACK POINTER SWAP ---
    csrrw sp, mscratch, sp      # Swap user sp with kernel stack pointer in mscratch!

    # --- PHASE 2: ALLOCATE GENERAL-PURPOSE CONTEXT FRAME (288 Bytes) ---
    addi  sp, sp, -288          # Allocate 288-byte aligned kernel frame

    # --- PHASE 3: SAVE GENERAL-PURPOSE REGISTERS x1..x31 ---
    sd    x1,   0(sp)           # Save ra
    sd    x3,  16(sp)           # Save gp
    sd    x4,  24(sp)           # Save tp
    sd    x5,  32(sp)           # Save t0
    # ... Saves x6..x31 in slots 40(sp)..240(sp) ...
    sd    x31, 240(sp)

    # Save original user sp (from mscratch) and Exception CSRs:
    csrr  t0, mscratch;  sd t0, 8(sp)    # User sp at 8(sp)
    csrr  t0, mepc;      sd t0, 248(sp)  # mepc at 248(sp)
    csrr  t0, mstatus;   sd t0, 256(sp)  # mstatus at 256(sp)
    csrr  t0, mcause;    sd t0, 264(sp)  # mcause at 264(sp)
    csrr  t0, mtval;     sd t0, 272(sp)  # mtval at 272(sp)

    # --- PHASE 4: LAZY FLOATING-POINT STATUS AUDIT ---
    srli  t1, t0, 13            # Shift mstatus to inspect FS bits [14:13]
    andi  t1, t1, 3             # t1 <= mstatus.FS (01 = Clean, 11 = Dirty)
    li    t2, 3                 # t2 <= 3 (Dirty state mask)
    bne   t1, t2, skip_fp_save  # IF FS != 3 (NOT DIRTY!), SKIP SAVING f0..f31!

    # (If Dirty: Allocate 264 bytes & save f0..f31... SKIPPED IN SCENARIO B!)
skip_fp_save:

    # --- PHASE 5: EXECUTE C TRAP DISPATCHER ---
    csrr  a0, mepc
    csrr  a1, mcause
    csrr  a2, mtval
    call  c_trap_dispatcher

    # --- PHASE 6: RESTORE GENERAL-PURPOSE REGISTERS ---
    ld    x1,   0(sp)           # Restore ra
    ld    x3,  16(sp)           # Restore gp
    # ... Restores x4..x31 ...
    ld    x31, 240(sp)

    ld    t0,  8(sp)            # Read user sp from 8(sp)
    csrw  mscratch, t0          # Put user sp into mscratch
    addi  sp, sp, 288           # Deallocate kernel stack
    csrrw sp, mscratch, sp      # Swap sp back to user stack!

    # --- PHASE 7: ATOMIC TRAP RETURN ---
    mret                        # Atomic hardware return to U-Mode!
```

---

#### Step 2: Trace Exception CSR Values (Illegal Instruction `0xFFFFFFFF`)

When the Illegal Instruction Exception fires at $PC = \text{0x00401080}$:
* **`mepc`**: Latches the faulting $PC$ address:
  $$\text{mepc} \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_1080}}$$
* **`mcause`**: Loaded with Cause Code 2 (Illegal Instruction):
  $$\text{mcause} \Leftarrow \mathbf{2 \quad (\text{0x0000\_0000\_0000\_0002})}$$
* **`mtval`**: Loaded with raw illegal instruction word:
  $$\text{mtval} \Leftarrow \mathbf{\text{0x0000\_0000\_FFFF\_FFFF}}$$
* **`mstatus`**: Preserves active `FS` state ($\text{mstatus.FS} = 01_2 \implies \text{Clean}$).

---

#### Step 3: Calculate Memory Operations and Data Traffic Volume

##### Scenario A (Eager Save — Saves All 31 GPRs + 32 FP Registers):
* General-Purpose Context: 31 GPRs + 5 CSRs $= 36\text{ stores} + 36\text{ loads} = 72\text{ memory ops}$.
* Floating-Point Context: 32 FP Regs + 1 FCSR $= 33\text{ stores} + 33\text{ loads} = 66\text{ memory ops}$.

$$\text{Total Memory Operations (Scenario A)} = 72 + 66 = \mathbf{138 \text{ Memory Operations}}$$

$$\text{Total Stack Memory Traffic (Scenario A)} = 138 \text{ ops} \times 8 \text{ bytes/op} = \mathbf{1,104 \text{ Bytes Total Traffic}}$$

---

##### Scenario B (Lazy Save — `FS == 01_2` Clean, Skips FP Registers!):
* General-Purpose Context: 31 GPRs + 5 CSRs $= 36\text{ stores} + 36\text{ loads} = 72\text{ memory ops}$.
* Floating-Point Context: **0 Stores + 0 Loads** (Skipped via Lazy FS check!).

$$\text{Total Memory Operations (Scenario B)} = \mathbf{72 \text{ Memory Operations}}$$

$$\text{Total Stack Memory Traffic (Scenario B)} = 72 \text{ ops} \times 8 \text{ bytes/op} = \mathbf{576 \text{ Bytes Total Traffic}}$$

```text
CONTEXT TRAFFIC BENCHMARK COMPARISON

 Scenario Name         │ Memory Ops │ Stack Traffic (Bytes) │ Execution Time (ns)
───────────────────────┼────────────┼───────────────────────┼─────────────────────
 Scenario A (Eager)    │ 138 Ops    │ 1,104 Bytes           │ 43.125 ns (138c)
 Scenario B (Lazy FS)  │  72 Ops    │   576 Bytes           │ 22.500 ns (72c)
───────────────────────┴────────────┴───────────────────────┴─────────────────────
 SAVINGS / SPEEDUP     │ 66 Ops Cut │ 528 Bytes Saved!      │ 1.92x FASTER! (48% Cut!)
```

---

#### Step 4: Calculate Physical Execution Time and Speedup Factor

At $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

##### 1. Scenario A Execution Time:

$$T_{\text{ScenarioA}} = 138 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{43.125 \text{ Nanoseconds}}$$

##### 2. Scenario B Execution Time:

$$T_{\text{ScenarioB}} = 72 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{22.500 \text{ Nanoseconds}}$$

##### 3. Calculate Speedup Factor:

$$\text{Speedup Factor} = \frac{T_{\text{ScenarioA}}}{T_{\text{ScenarioB}}} = \frac{43.125\text{ ns}}{22.500\text{ ns}} = \frac{138\text{ cycles}}{72\text{ cycles}} = \mathbf{1.92\times \text{ Performance Acceleration!}}$$

Lazy status tracking (`mstatus.FS`) cut context memory traffic by **$47.8\%$** and accelerated trap overhead by **$1.92\times$**!

---

#### Step 5: Trace the 3 Atomic Actions of `mret`

When the trap handler finishes and executes `mret` at Phase 7:
1. **Restore $PC$**: $PC \Leftarrow \text{mepc} = \mathbf{\text{0x0000\_0000\_0040\_1080}}$.
2. **Restore Privilege Mode**: $\text{Current\_Mode} \Leftarrow \text{mstatus.MPP} = \mathbf{\text{U-Mode (User Privilege)}}$.
3. **Re-Enable Global Interrupts**: $\text{mstatus.MIE} \Leftarrow \text{mstatus.MPIE} = \mathbf{1 \quad (\text{Interrupts Re-Enabled!})}$.

Execution resumes in the user application at address `0x00401080` with $100\%$ original register state intact!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and lazy status results:

1. **Lazy Status Logic Verification**:
   * Initial `mstatus.FS = 01_2` (Clean).
   * Branch `bne t1, t2, skip_fp_save` evaluated $01_2 \neq 11_2 \implies$ TAKEN!
   * Floating-point stores were $100\%$ bypassed, verifying lazy context mechanics.
2. **Stack Traffic Reduction Verification**:
   * Scenario A traffic = $1,104\text{ bytes}$. Scenario B traffic = $576\text{ bytes}$.
   * Bytes saved = $1,104 - 576 = 528\text{ bytes}$ ($66 \text{ memory ops} \times 8\text{ B}$). Math verified!
3. **`mret` Hardware State Verification**:
   * $PC$ restored to `0x00401080`. Privilege mode restored to U-Mode.
   * User application resumes with zero data corruption!

All trap context frame allocations, lazy `FS` status checks, stack memory traffic reductions, and atomic `mret` hardware state restorations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Register Context Save/Restore**: The microarchitectural procedure executed upon trap entry where the CPU saves all interrupted general-purpose ($x1 \dots x31$), floating-point ($f0 \dots f31$), and control registers onto a 16-byte aligned kernel stack frame, restoring them prior to trap return to guarantee $100\%$ state preservation.
* **Lazy Status Tracking (`FS` / `VS` Bits)**: A hardware state machine in `mstatus` (`00_2 = Off, 01_2 = Initial, 10_2 = Clean, 11_2 = Dirty`) that tracks whether coprocessor registers have been modified, allowing trap handlers to skip saving untouched floating-point or vector registers and cutting trap overhead by up to $90\%$.
* **Trap Return Instruction (`mret` / `sret`)**: A privileged hardware instruction that atomically restores the Program Counter ($PC \Leftarrow \text{mepc}$), demotes the CPU privilege mode to the interrupted level ($\text{Mode} \Leftarrow \text{MPP}$), and re-enables global interrupts ($\text{MIE} \Leftarrow \text{MPIE}$) in a single 1-cycle clock transition.
```