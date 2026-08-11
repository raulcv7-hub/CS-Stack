content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/02-stack-frame-allocation-unwinding/03-naked-function-assembly-entry-points.md
# Naked Function Attributes and Extended Inline Assembly Clobber List Mechanics

## The Compiler-Generated Prologue Interference: Why Low-Level Entry Points Require Un-Gated Functions

When a C/C++ compiler translates a high-level function into machine code, it automatically generates a standard function prologue (allocating stack space, saving `ra` and `fp`) and a standard function epilogue (restoring `ra` and `fp`, executing `ret`). This automatic prologue and epilogue generation works seamlessly for standard application software, ensuring that function call stacks remain structured and ABI compliant.

However, when software engineers build low-level systems code—such as bare-metal hardware trap handlers, operating system context switchers, bootloader entry points, or embedded interrupt service routines—compiler-generated prologues create a catastrophic hardware failure mode:

1. **Stack Pointer Corruption Before Context Save**: When a hardware exception or interrupt fires, the Stack Pointer (`sp`) may point to an un-trusted, corrupted user-space memory address. If the compiler automatically emits `sd ra, -8(sp)` upon function entry, it attempts to write to an un-trusted user stack *before* the software has a chance to switch to a secure kernel stack!
2. **Register State Corruption Before Save**: To calculate stack frame offsets or set up a frame pointer in its prologue, the compiler might use temporary registers (such as `t0` or `a0`). This overwrites the exact hardware register state of the interrupted user program *before* the trap handler can save those registers onto the stack!
3. **Embedded C Inline Assembly Register Erasure**: When a developer embeds raw assembly instructions inside a C function using `__asm__`, the compiler's register allocator remains unaware of which registers the inline assembly code modifies. The compiler continues using those same registers for C variables, resulting in silent variable corruption and crashes.

```text
COMPILER PROLOGUE INTERFERENCE AT TRAP ENTRY

 Hardware Exception / Interrupt Fires!
  │
  ▼ CPU jumps to Trap Handler C Function
 ┌─────────────────────────────────────────────────────────────┐
 │ COMPILER-GENERATED PROLOGUE (EXECUTES AUTOMATICALLY!)       │
 │   addi sp, sp, -32   ──► Modifies sp (May be INVALID!)      │
 │   sd   t0, 16(sp)    ──► OVERWRITES USER REG t0 BEFORE SAVE!│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 USER REGISTER t0 DESTROYED! KERNEL STACK OVERFLOW CRASH!
 (Compiler prologue executed BEFORE kernel could switch stack or save context!)
```

Trace the physical hardware failure:
* A hardware interrupt fires while a user application is running.
* The CPU jumps to the C interrupt handler function.
* The C compiler automatically inserted `sd t0, 16(sp)` at the very first byte of the function.
* Register `t0` held a critical user calculation value. **The compiler prologue overwrote `t0` before saving it!**
* When the interrupt handler finishes and returns to the user program, the user program reads corrupted data from `t0` and crashes!

How can we instruct C/C++ compilers to bypass automatic prologue and epilogue generation completely (**Naked Function Attribute `__attribute__((naked))`**), and how do we inform the compiler's optimization engine about register and memory modifications inside C inline assembly (**Extended Inline Assembly Clobber Lists `__asm__`**)?

To build safe, bare-metal entry points and reliable C-Assembly interfaces, systems engineering relies on **Naked Function Attributes** and **Extended Inline Assembly Clobber Lists**.

---

## The Un-Gated VIP Entrance and the Contractor's Warning Sign: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of naked functions, stack-pointer switching, and inline assembly clobber lists before analyzing C-compiler code generation, trap vector entry points, and `__asm__` clobber lists, let us consider an everyday analogy: **The High-Security Facility and the Emergency Response Unit**.

Imagine a high-security research facility (**The CPU Execution Engine**).

```text
THE VIP ENTRANCE AND CLOBBER WARNING SIGN METAPHOR

 Standard Building Entrance (Standard C Function)
 ┌─────────────────────────────────────────────────────────────┐
 │ Bouncer automatically takes visitor's coat and bag (Stack)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Emergency SWAT Team Entry (Hardware Interrupt / Trap Entry)
 Bouncer tries to take SWAT team's rifles! (CRASH / CORRUPTION!)

 Naked VIP Entrance (__attribute__((naked)))
 ┌─────────────────────────────────────────────────────────────┐
 │ Bouncer FIRED! Zero automatic coat/bag checks.               │
 │ SWAT team enters with raw, 100% custom protocol!            │
 └─────────────────────────────────────────────────────────────┘
```

The facility employs an automated security bouncer (**The Compiler-Generated Prologue/Epilogue**) stationed at every room door.

Let us observe two physical problems in this facility:

---

### Scenario A: The Bouncer vs. The Emergency SWAT Team (Naked Function Need)

When standard employees (**Standard C Functions**) enter a room:
1. The automated bouncer grabs the employee's coat and backpack, checks their ID, and stores their bag in a locker (**Allocates Stack Frame & Saves `ra`/`fp`**).
2. When the employee leaves, the bouncer returns their coat and bag, and unlocks the door (**Restores Stack & Executes `ret`**).

Now, an emergency alarm sounds! An emergency SWAT Response Team (**A Hardware Interrupt / Exception Trap**) rushes into the building to secure a crime scene (**Save Interrupted User Context**):
* As the SWAT team rushes through the door, the automated bouncer grabs the SWAT leader's rifle, forces them to take off their boots, and tries to store their radio in a locker before letting them in!
* By the time the SWAT team breaks free from the bouncer, **the evidence is destroyed** because the bouncer interfered before the team could secure the room!

#### The Solution: The Un-Gated VIP Entrance (`__attribute__((naked))`)
The building manager removes the automated bouncer from the emergency room entrance completely (**`__attribute__((naked))`**):
* The emergency room has **zero automatic coat checks and zero automatic exit locks**.
* The SWAT team enters through an un-gated doorway, executes their custom security protocol (swapping the un-trusted bag for a secure facility backpack, and saving all equipment manually), and exits using their own custom protocol (`mret`)!

---

### Scenario B: The Independent Contractor's Warning Sign (Inline Assembly Clobber List)

Inside a shared office, an Office Manager (**The C Compiler**) manages 32 desk trays (**Architectural Registers $x0 \dots x31$**).
* The manager stores the "Project Budget" in Tray 10 (`x10`) and "Employee Count" in Tray 11 (`x11`).

An Independent Contractor (**An Inline Assembly Block `__asm__`**) walks into the office to perform a quick 5-second task:
* The contractor uses Tray 10 and Tray 11 for their own scratchpad calculations, dumping trash into them!
* **The Failure**: The contractor leaves without telling the Office Manager. The manager walks over to Tray 10, reads the contractor's trash, and uses it as the "Project Budget"!

#### The Solution: The Contractor's Warning Sign (The Clobber List)
Before starting work, the contractor writes a formal warning sign on the manager's desk:

$$\text{"WARNING: I AM CLOBBERING TRAY 10, TRAY 11, AND THE FILING CABINET!"}$$

```text
THE CONTRACTOR'S CLOBBER WARNING SIGN

 Contractor writes warning sign: "Clobbered: Tray 10, Tray 11, Memory!"
                               │
                               ▼
 Office Manager reads warning sign BEFORE contractor starts!
 Manager moves Project Budget out of Tray 10 into a safe locker!
 (Zero data corruption! Office Manager reloads clean data from RAM later!)
```

Look at what the warning sign achieved:
* The Office Manager read the warning sign, **moved the Project Budget out of Tray 10 into a safe locker BEFORE the contractor started**, and re-read the filing cabinet fresh from RAM afterward!
* Zero data corruption occurred!

This facility setup is the exact physical analogue of **Naked Functions and Clobber Lists**:
* The automated bouncer is **Compiler-Generated Prologue/Epilogue Code**.
* The SWAT team is **A Bare-Metal Trap / Interrupt Handler**.
* Removing the bouncer is **`__attribute__((naked))`**.
* The contractor's warning sign is **The Extended Inline Assembly Clobber List (`: "clobbers"`)**.

---

## Primitive 1: Naked Function Attributes (`__attribute__((naked))`)

Now that we possess an intuitive mental model of un-gated VIP entrances and automated bouncers, let us examine the formal, rigorous engineering mechanics of **Naked Function Attributes**.

In the GNU C/C++ compiler toolchain (`gcc` / `clang`), declaring a function with the **`__attribute__((naked))`** attribute instructs the compiler to omit all automatic stack frame allocation, register preservation, and return instructions.

> **A Naked Function** is a C/C++ function declared with `__attribute__((naked))` for which the compiler generates **ZERO prologue instructions** (no `addi sp, sp, -N`, no `sd ra`, no `sd fp`) and **ZERO epilogue instructions** (no `ld ra`, no `ret`). The function body consists strictly of the raw assembly instructions written inside it.

```c
// NAKED FUNCTION DECLARATION SYNTAX IN C

void __attribute__((naked)) trap_entry_handler(void) {
    __asm__ volatile (
        "csrrw sp, mscratch, sp \n\t"  // 1. Atomic stack pointer swap!
        "addi  sp, sp, -256     \n\t"  // 2. Allocate kernel stack frame
        "sd    x1, 8(sp)        \n\t"  // 3. Save user ra
        // ... (Raw Assembly Context Save) ...
        "mret                   \n\t"  // 4. Custom Trap Return!
    );
}
```

---

### Why Naked Functions Are Indispensable for Hardware Trap Handlers

In bare-metal embedded systems and operating system kernels, why is `__attribute__((naked))` mandatory for trap entry points?

Let us examine the three physical hardware requirements that require naked functions:

#### 1. Atomic Stack Pointer Switching (`mscratch` / `sscratch`)
When a hardware exception fires while running an un-privileged user process, the Stack Pointer (`sp`) points to an **un-trusted user-mode stack**.
* If the user program suffered a stack overflow or corrupted `sp` ($sp = \text{0x00000000}$), executing a standard compiler prologue (`sd ra, -8(sp)`) immediately triggers a **Secondary Kernel Store Access Fault Trap**, crashing the kernel!
* A **Naked Function** allows the trap handler to execute an atomic CSR swap instruction (`csrrw sp, mscratch, sp`) **before any memory writes occur**, swapping the un-trusted user `sp` for a secure kernel stack pointer!

#### 2. Saving the Complete CPU Context ($x1 \dots x31$)
A standard C function prologue saves only callee-saved registers (`s0`–`s11`). It leaves temporary registers (`t0`–`t6`) and argument registers (`a0`–`a7`) un-saved!
* An interrupt handler MUST save **ALL 31 general-purpose registers ($x1 \dots x31$)** to guarantee that the interrupted user program can resume with zero register corruption.
* A naked function allows the developer to write a raw, 31-register context save block manually!

#### 3. Custom Hardware Trap Return Instructions (`mret` / `sret`)
Standard C functions terminate with a `ret` instruction (`jalr x0, 0(ra)`), which returns to a caller in the same privilege mode.
* Hardware exception handlers MUST terminate with a privileged hardware trap return instruction (**`mret`** in Machine Mode, **`sret`** in Supervisor Mode, or **`iret`** in x86-64).
* `mret` restores the Program Counter from `mepc` and restores the previous privilege level and interrupt enable bits in `mstatus`.
* A naked function allows placing `mret` at the end of the function without the compiler inserting an unwanted `ret` instruction after it!

---

## Primitive 2: Extended Inline Assembly (`__asm__`) and Clobber Lists

Now let us examine the second core primitive: **Extended Inline Assembly** and **Clobber Lists**.

When writing systems software in C/C++, developers frequently need to embed short snippets of raw assembly instructions directly inside C functions using the **`__asm__`** statement.

To allow the C compiler's optimization engine and register allocator to interoperate safely with raw assembly instructions, GNU C defines **Extended Inline Assembly**:

```c
// EXTENDED INLINE ASSEMBLY SYNTAX

__asm__ volatile (
    "assembly instruction template"
    : output_operands              /* Section 1: Output C variables */
    : input_operands               /* Section 2: Input C variables */
    : clobber_list                 /* Section 3: Clobbered registers & memory */
);
```

Let us dissect the four functional sections of an extended `__asm__` block:

1. **Assembly Instruction Template**: A string literal containing raw assembly instructions (e.g., `"csrr %0, mepc \n\t amoswap.w %1, %2, (%3)"`).
2. **Output Operands (`: "=r"(c_var)`)**: Specifies C variables that receive output values calculated by the assembly code. The compiler assigns a physical register (represented as `%0`, `%1`) to each variable.
3. **Input Operands (`: "r"(c_var)`)**: Specifies C variables providing input values to the assembly code.
4. **The Clobber List (`: "clobber_1", "clobber_2"`)**: The critical compiler notification list!

---

### The Mechanics of the Clobber List

What is a **Clobber List**?

> **A Clobber List** is the third operand section of an extended `__asm__` statement where the developer explicitly lists all hardware registers, memory regions, or condition flags that are modified (clobbered) by the inline assembly code, commanding the compiler's register allocator to evacuate live C variables from those registers before entering the assembly block.

```text
CLOBBER LIST COMPILER REGISTER ALLOCATION ACTION

 Extended __asm__ Statement with Clobber List: "t0", "a0", "memory"
                                │
                                ▼
 C Compiler Register Allocator Action:
 1. "t0" Clobbered ──► Moves C variable 'count' OUT of register t0!
 2. "a0" Clobbered ──► Saves register a0 onto stack before __asm__!
 3. "memory"       ──► Flushes all cached C variables from registers to RAM!
```

---

### The Three Types of Clobber Declarations

#### 1. Specific Architectural Register Clobbers (`: "t0", "x10", "a1"`)
* **Problem**: The inline assembly code uses register `t0` ($x5$) as a temporary calculation scratchpad.
* **Clobber Declaration**: `: "t0"` (or `: "x5"`).
* **Compiler Action**: The compiler's register allocator marks `t0` as destroyed across the `__asm__` block. If `t0` currently holds a live C variable, the compiler **moves that variable to another register or saves it on the stack before executing the `__asm__` block**!

#### 2. Memory Clobber (`: "memory"`)
* **Problem**: The inline assembly code modifies data in RAM via a pointer (`sd x10, 0(x20)`), or executes a memory barrier (`fence`). But the C compiler cached the value of that memory variable inside a CPU register (`x15`)!
* **Clobber Declaration**: `: "memory"`.
* **Compiler Action**: Acts as a **Compiler Memory Barrier**. The compiler assumes that **ANY memory variable in RAM may have been modified by the assembly code**. The compiler invalidates all memory variables currently cached in CPU registers and forces the CPU to **reload them fresh from RAM after the `__asm__` block**!

#### 3. Condition Code Clobber (`: "cc"`)
* **Problem**: The inline assembly code executes arithmetic or comparisons that alter hardware status condition flags ($Z, C, N, V$).
* **Clobber Declaration**: `: "cc"`.
* **Compiler Action**: Informs the compiler that status condition flags were overwritten, preventing the compiler from relying on previous flag comparisons.

---

### The `volatile` Qualifier in `__asm__ volatile`

Why should inline assembly statements almost always include the **`volatile`** qualifier?

```c
__asm__ volatile ( "csrw mstatus, %0" : : "r"(status_val) : "memory" );
```

If an `__asm__` block has no output variables, the compiler's Dead Code Elimination (DCE) optimization pass may assume the assembly code has no useful effect and **DELETE THE ENTIRE ASSEMBLY BLOCK FROM THE BINARY**!

Adding **`volatile`** commands the compiler:
> *"Do NOT delete, optimize away, or reorder this assembly block across other instructions, even if its outputs appear unused!"*

---

## Real-World Silicon Engineering: Operating System Syscall Entries and Atomic Interlocking

In commercial software systems (such as Linux, FreeBSD, and real-time embedded kernels), naked functions and extended inline assembly clobbers are used every day at the operating system boundary.

### 1. The Linux Kernel Syscall Entry Point

When a user application executes a system call (`syscall` in x86-64 or `ecall` in RISC-V):
1. The CPU hardware conmutatorizes privilege levels and jumps to the kernel's trap entry address.
2. The entry point function MUST be declared as **`__attribute__((naked))`**.
3. The naked handler executes `csrrw sp, sscratch, sp` to switch to the kernel stack, saves user registers, and then calls standard C kernel functions (`do_syscall()`).

Without `__attribute__((naked))`, kernel entry points could not safely handle user-mode exceptions.

---

### 2. Lock-Free Atomic Operations in C (`amoswap` / `cmpxchg`)

High-performance C libraries (such as lock-free data structures) embed atomic assembly instructions using extended `__asm__`:

```c
// ATOMIC 64-BIT SWAP IN C USING EXTENDED INLINE ASSEMBLY

uint64_t atomic_swap(uint64_t *ptr, uint64_t new_val) {
    uint64_t old_val;

    __asm__ volatile (
        "amoswap.d.aqrl %0, %2, (%1)"  // Atomic Swap with Acquire/Release
        : "=r" (old_val)               // Output %0: C variable old_val
        : "r" (ptr), "r" (new_val)     // Inputs %1 & %2: Pointers and values
        : "memory"                     // Memory clobber: Invalidate cached RAM
    );

    return old_val;
}
```

Because `: "memory"` is declared in the clobber list, the C compiler guarantees that surrounding C code will re-read memory fresh after `atomic_swap()` completes!

---

## Solved Industrial Engineering Exercise: Naked Trap Handler Synthesis, Context Save Frame Alignment, and Extended Inline Assembly Clobber Audit

To consolidate your complete mastery of naked function attributes (`__attribute__((naked))`), Extended Inline Assembly (`__asm__`), atomic stack pointer switching, and clobber list declarations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior operating system kernel architect designing the bare-metal exception entry point and atomic device status updater for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The system requires two low-level C/Assembly interface components:

1. **Component 1 (Naked Trap Entry Handler)**: A C-declared trap entry function `trap_entry_handler()` that must handle user-mode exceptions without compiler prologue interference.
   * Must atomically swap the user Stack Pointer with a secure kernel stack pointer stored in the `mscratch` CSR (`csrrw sp, mscratch, sp`).
   * Must save all 31 general-purpose registers ($x1 \dots x31$) onto the 16-byte aligned kernel stack ($31 \times 8 = 248\text{ bytes} \implies$ rounded UP to $256\text{ bytes}$ for 16-byte alignment).
   * Must call the C dispatcher function `c_trap_dispatcher(mepc, mcause, mtval)`.
   * Must restore all 31 registers, swap `sp` back to user stack, and exit using `mret`.
2. **Component 2 (C Atomic Status Updater)**: A C function `update_device_status(uint64_t *status_ptr, uint64_t new_val)` that executes a 64-bit atomic swap (`amoswap.d.aqrl`) inside an extended `__asm__ volatile` block.

```text
3.2 GHz KERNEL TRAP & ATOMIC INLINE ASSEMBLY SUBSYSTEM

 Hardware Exception Trap Fired
  │
  ▼
 [ Naked Function trap_entry_handler ] ──► Atomic sp Swap via mscratch CSR
 (0 Compiler Prologue Instructions!)        Saves 31 Regs on Kernel Stack
                                           Calls c_trap_dispatcher()
                                           Restores 31 Regs -> Exec mret
```

#### Your Objective

1. Explain why declaring `trap_entry_handler()` as a standard C function (without `__attribute__((naked))`) causes catastrophic kernel stack corruption when an exception fires in user mode.
2. Write the complete, syntactically valid C/Assembly implementation of `trap_entry_handler()` using `__attribute__((naked))` and raw assembly statements.
3. Write the complete C function `update_device_status()` containing an extended `__asm__ volatile` block with correct output operands, input operands, and **Clobber List declarations (`: "memory"`)**.
4. Calculate the total memory operations (stores/loads) and physical execution time (in nanoseconds) required to save and restore the 31-register context frame inside `trap_entry_handler()`.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Prove Why Standard C Functions Fail for Trap Entry

If `trap_entry_handler()` is declared as a standard C function (without `__attribute__((naked))`):

1. **Compiler Prologue Execution**: The compiler automatically emits:
   ```riscv
   addi sp, sp, -256    # Subtracts 256 from USER-MODE Stack Pointer!
   sd   ra, 248(sp)     # Writes to UN-TRUSTED USER-MODE STACK MEMORY!
   ```
2. **The Security & Stability Failure**:
   * If the exception occurred because the user program had a corrupted or invalid `sp` (e.g., $sp = \text{0x00000000}$), executing `sd ra, 248(sp)` instantly triggers a **Secondary Kernel Store Access Fault Trap**!
   * The kernel crashes before executing a single line of trap handling code!
3. **Register Corruption**: The compiler prologue uses temporary registers (like `t0` or `a0`) to compute stack offsets before saving user registers, permanently corrupting the user's `t0` register value!

##### Conclusion:
Standard C function prologues **MUST BE BYPASSED** using `__attribute__((naked))`.

---

#### Step 2: Write the Complete Naked Trap Handler (`trap_entry_handler`)

```c
// 1. BARE-METAL NAKED TRAP HANDLER IN C WITH EMBEDDED RAW ASSEMBLY

void c_trap_dispatcher(uint64_t mepc, uint64_t mcause, uint64_t mtval);

void __attribute__((naked)) trap_entry_handler(void) {
    __asm__ volatile (
        # --- STEP 1: ATOMIC STACK POINTER SWAP ---
        # Swap user sp with kernel stack pointer stored in mscratch CSR!
        "csrrw sp, mscratch, sp \n\t"

        # --- STEP 2: ALLOCATE KERNEL STACK FRAME (256 Bytes = 16-Byte Aligned) ---
        "addi  sp, sp, -256 \n\t"

        # --- STEP 3: SAVE ALL 31 GENERAL-PURPOSE REGISTERS (x1..x31) ---
        "sd    x1,   8(sp)  \n\t"   # Save ra
        # Note: Original user sp is now in mscratch! Save x3..x31 first:
        "sd    x3,  24(sp)  \n\t"   # Save gp
        "sd    x4,  32(sp)  \n\t"   # Save tp
        "sd    x5,  40(sp)  \n\t"   # Save t0
        "sd    x6,  48(sp)  \n\t"   # Save t1
        "sd    x7,  56(sp)  \n\t"   # Save t2
        "sd    x8,  64(sp)  \n\t"   # Save s0/fp
        "sd    x9,  72(sp)  \n\t"   # Save s1
        "sd    x10, 80(sp)  \n\t"   # Save a0
        "sd    x11, 88(sp)  \n\t"   # Save a1
        "sd    x12, 96(sp)  \n\t"   # Save a2
        "sd    x13, 104(sp) \n\t"   # Save a3
        "sd    x14, 112(sp) \n\t"   # Save a4
        "sd    x15, 120(sp) \n\t"   # Save a5
        "sd    x16, 128(sp) \n\t"   # Save a6
        "sd    x17, 136(sp) \n\t"   # Save a7
        "sd    x18, 144(sp) \n\t"   # Save s2
        "sd    x19, 152(sp) \n\t"   # Save s3
        "sd    x20, 160(sp) \n\t"   # Save s4
        "sd    x21, 168(sp) \n\t"   # Save s5
        "sd    x22, 176(sp) \n\t"   # Save s6
        "sd    x23, 184(sp) \n\t"   # Save s7
        "sd    x24, 192(sp) \n\t"   # Save s8
        "sd    x25, 200(sp) \n\t"   # Save s9
        "sd    x26, 208(sp) \n\t"   # Save s10
        "sd    x27, 216(sp) \n\t"   # Save s11
        "sd    x28, 224(sp) \n\t"   # Save t3
        "sd    x29, 232(sp) \n\t"   # Save t4
        "sd    x30, 240(sp) \n\t"   # Save t5
        "sd    x31, 248(sp) \n\t"   # Save t6

        # Save original user sp (currently in mscratch) into slot 16(sp):
        "csrr  t0, mscratch \n\t"
        "sd    t0, 16(sp)   \n\t"

        # --- STEP 4: PREPARE ARGUMENTS & CALL C DISPATCHER ---
        "csrr  a0, mepc     \n\t"   # Arg 0: mepc (Fault PC)
        "csrr  a1, mcause   \n\t"   # Arg 1: mcause (Cause Code)
        "csrr  a2, mtval    \n\t"   # Arg 2: mtval (Fault Value/Addr)
        "call  c_trap_dispatcher \n\t" # Call C trap logic!

        # --- STEP 5: RESTORE ALL 31 REGISTERS ---
        "ld    x1,   8(sp)  \n\t"   # Restore ra
        "ld    x3,  24(sp)  \n\t"   # Restore gp
        "ld    x4,  32(sp)  \n\t"   # Restore tp
        "ld    x5,  40(sp)  \n\t"   # Restore t0
        "ld    x6,  48(sp)  \n\t"   # Restore t1
        "ld    x7,  56(sp)  \n\t"   # Restore t2
        "ld    x8,  64(sp)  \n\t"   # Restore s0/fp
        "ld    x9,  72(sp)  \n\t"   # Restore s1
        "ld    x10, 80(sp)  \n\t"   # Restore a0
        "ld    x11, 88(sp)  \n\t"   # Restore a1
        "ld    x12, 96(sp)  \n\t"   # Restore a2
        "ld    x13, 104(sp) \n\t"   # Restore a3
        "ld    x14, 112(sp) \n\t"   # Restore a4
        "ld    x15, 120(sp) \n\t"   # Restore a5
        "ld    x16, 128(sp) \n\t"   # Restore a6
        "ld    x17, 136(sp) \n\t"   # Restore a7
        "ld    x18, 144(sp) \n\t"   # Restore s2
        "ld    x19, 152(sp) \n\t"   # Restore s3
        "ld    x20, 160(sp) \n\t"   # Restore s4
        "ld    x21, 168(sp) \n\t"   # Restore s5
        "ld    x22, 176(sp) \n\t"   # Restore s6
        "ld    x23, 184(sp) \n\t"   # Restore s7
        "ld    x24, 192(sp) \n\t"   # Restore s8
        "ld    x25, 200(sp) \n\t"   # Restore s9
        "ld    x26, 208(sp) \n\t"   # Restore s10
        "ld    x27, 216(sp) \n\t"   # Restore s11
        "ld    x28, 224(sp) \n\t"   # Restore t3
        "ld    x29, 232(sp) \n\t"   # Restore t4
        "ld    x30, 240(sp) \n\t"   # Restore t5
        "ld    x31, 248(sp) \n\t"   # Restore t6

        # Restore original user sp from 16(sp) into mscratch, then swap back:
        "ld    t0,  16(sp)  \n\t"
        "csrw  mscratch, t0 \n\t"
        "addi  sp, sp, 256  \n\t"   # Deallocate kernel stack
        "csrrw sp, mscratch, sp \n\t" # Swap sp back to user stack!

        # --- STEP 6: PRIVILEGED TRAP RETURN ---
        "mret \n\t"                 # Hardware return to user mode!
    );
}
```

---

#### Step 3: Write C Extended Inline Assembly Function with Clobber List (`update_device_status`)

```c
// 2. ATOMIC STATUS UPDATE WITH EXTENDED INLINE ASSEMBLY & CLOBBER LIST

#include <stdint.h>

uint64_t update_device_status(uint64_t *status_ptr, uint64_t new_val) {
    uint64_t old_val;

    __asm__ volatile (
        "amoswap.d.aqrl %0, %2, (%1) \n\t" # Atomic 64-bit Swap with Acquire/Release
        : "=r" (old_val)                   # Output %0: C variable old_val
        : "r" (status_ptr), "r" (new_val)  # Inputs %1 & %2: Pointers and values
        : "memory"                         # CLOBBER LIST: Informs C compiler that RAM was modified!
    );

    return old_val;
}
```

##### Clobber List Verification:
* `: "memory"` informs the compiler that RAM at `status_ptr` was modified. The compiler flushes cached C variables from CPU registers back to memory!

---

#### Step 4: Calculate Memory Operations and Execution Latency

Let us count the total memory stack operations and execution cycles inside `trap_entry_handler()`:

##### 1. Context Save Phase:
* 31 64-bit register stores (`sd`) to kernel stack $= 31\text{ stores}$.
* Memory traffic = $31 \times 8\text{ bytes} = \mathbf{248 \text{ Bytes}}$.
* Execution time = $31\text{ stores} \times 1\text{ cycle/store} = 31\text{ clock cycles}$.

##### 2. Context Restore Phase:
* 31 64-bit register loads (`ld`) from kernel stack $= 31\text{ loads}$.
* Memory traffic = $31 \times 8\text{ bytes} = \mathbf{248 \text{ Bytes}}$.
* Execution time = $31\text{ loads} \times 1\text{ cycle/load} = 31\text{ clock cycles}$.

##### 3. Total Context Switching Overhead:
$$\text{Total Memory Operations} = 31\text{ stores} + 31\text{ loads} = \mathbf{62 \text{ Memory Operations}}$$

$$\text{Total Stack Traffic Volume} = 248\text{ B} + 248\text{ B} = \mathbf{496 \text{ Bytes Total Traffic}}$$

$$\text{Total Context Latency} = 31\text{ cycles} + 31\text{ cycles} = \mathbf{62 \text{ CPU Clock Cycles}}$$

$$T_{\text{context\_overhead}} = 62 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{19.375 \text{ nanoseconds}}$$

```text
NAKED TRAP HANDLER PERFORMANCE SUMMARY

 Execution Phase         │ Memory Operations │ Stack Traffic Volume │ Execution Latency
─────────────────────────┼───────────────────┼──────────────────────┼───────────────────
 Context Save (31 Regs)  │ 31 Stores (sd)    │ 248 Bytes            │ 31 Cycles (9.69 ns)
 Context Restore (31 Regs)│ 31 Loads (ld)     │ 248 Bytes            │ 31 Cycles (9.69 ns)
─────────────────────────┴───────────────────┴──────────────────────┴───────────────────
 TOTAL CONTEXT OVERHEAD  │ 62 Memory Ops     │ 496 Bytes Total      │ 62 Cycles (19.38 ns)
```

The entire 31-register context save and restore sequence completes in **$19.375\text{ nanoseconds}$ ($62\text{ CPU clock cycles}$)** with $100\%$ kernel stack safety!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and C-Assembly interface results:

1. **Stack Pointer Swap Safety Check**:
   * `csrrw sp, mscratch, sp` executed on Line 1 *before* any stack store (`sd`) instruction!
   * The user stack pointer was safely moved to `mscratch`, and `sp` was loaded with a validated kernel stack pointer, preventing user stack overflow crashes.
2. **16-Byte Stack Alignment Check**:
   * Kernel stack frame allocated = $256\text{ bytes}$.
   * $256 \pmod{16} == 0 \implies 100\%$ 16-byte stack alignment preserved!
3. **Clobber List Safety Check**:
   * `update_device_status()` declared `: "memory"` in its clobber list.
   * Proves C compiler will reload modified pointer values fresh from RAM after the `__asm__` block.

All naked function prologueless entry points, atomic `mscratch` stack switches, extended inline assembly clobber lists, and context save/restore timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Naked Function Attribute (`__attribute__((naked))`)**: A GNU C compiler attribute that completely suppresses the generation of automatic function prologues and epilogues, allowing developers to write raw, un-gated assembly entry points for hardware trap handlers and context switchers.
* **Inline Assembly Clobber List (`__asm__`)**: The fourth operand section of an extended C inline assembly block (`: "memory", "t0"`) that formally notifies the compiler's register allocator and instruction scheduler about overwritten registers and modified memory addresses, preventing variable corruption and stale register caching.
