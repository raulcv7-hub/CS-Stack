content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/02-stack-frame-allocation-unwinding/01-stack-pointer-alignment-allocation.md
# Stack Pointer Alignment Mechanics and Red Zone Hazard Architecture

## The Misaligned Stack Collapse: Why Un-Aligned Stack Allocations Break Hardware Pipelines

In modern 64-bit computer architectures, the call stack is a contiguous region of high-speed memory managed dynamically by a dedicated architectural pointer called the **Stack Pointer (`sp` / $x2$ in RISC-V, `RSP` in x86-64)**. The call stack grows downward from high memory addresses toward low memory addresses. Every time a software subroutine (function) is called, it allocates a private block of memory on top of the stack—called a **Stack Frame**—by subtracting bytes from the Stack Pointer (`addi sp, sp, -N` in RISC-V, or `sub rsp, N` in x86-64).

Inside this stack frame, the function stores its saved return addresses, local variables, and spilled registers.

However, when a software function allocates a stack frame, it cannot subtract just any arbitrary number of bytes from the Stack Pointer.

Suppose an assembly programmer or an un-optimized compiler allocates a stack frame for a function that needs to store three 8-byte registers ($3 \times 8 = 24\text{ bytes}$).

If the programmer subtracts exactly $24\text{ bytes}$ from a Stack Pointer originally aligned at address `0x7FFF1000`:

$$sp_{\text{new}} = \text{0x7FFF1000} - 24_{10} = \text{0x7FFF1000} - \text{0x18}_{16} = \mathbf{\text{0x7FFF0FE8}}$$

At first glance, `0x7FFF0FE8` seems completely valid. Address `0x7FFF0FE8` ends in hex `8` ($1000_2$ in binary), which is naturally 8-byte aligned ($24 \pmod 8 == 0$).

Now, trace the catastrophic hardware failure that occurs later inside that function when a 128-bit vector/SIMD instruction (such as `vle64.v` in RISC-V Vector or `movaps` in x86-64) attempts to save a 128-bit ($16\text{-byte}$) vector register onto the stack frame:

```text
UN-ALIGNED STACK ALLOCATION VECTOR FAULT HAZARD

 Stack Pointer sp = 0x7FFF0FE8 (Aligned to 8 Bytes, BUT NOT 16 Bytes!)
 ┌─────────────────────────────────────────────────────────────┐
 │ 128-Bit Vector Store Instruction: movaps [rsp], xmm0        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Checks sp Alignment Bits [3:0]
 Address 0x7FFF0FE8 in Binary: ... 1111 1110 1000_2
 Bits [3:0] = 1000_2 != 0000_2! (MISALIGNED FOR 16-BYTE VECTOR ACCESS!)
                                │
                                ▼
 HARDWARE VECTOR ALIGNMENT FAULT EXCEPTION FIRED! CPU CRASHES!
```

Look at the physical hardware failure:
1. The 128-bit vector instruction requires its target memory address to be naturally aligned to a **16-byte physical memory boundary** ($sp[3:0] == 0000_2$).
2. The Stack Pointer `sp` was set to `0x7FFF0FE8`. Its lowest 4 bits are `1000_2` ($8_{10} \neq 0$).
3. The 128-bit ($16\text{-byte}$) vector payload straddles two separate 64-bit physical memory words across a cache line boundary!
4. On strict hardware architectures, the Load-Store unit detects $sp[3:0] \neq 0000_2$ and **instantly asserts a hardware Load/Store Address Misaligned Exception Trap**, halting execution!

Furthermore, in System V x86-64 ABI architectures, compiler optimizations utilize a 128-byte scratchpad region located *below* the stack pointer called **The Red Zone**.

If an assembly programmer or leaf function uses the Red Zone to store temporary variables without adjusting the stack pointer, and an **asynchronous hardware interrupt or kernel signal handler fires midway through execution**:
* The operating system kernel drops a **Signal Frame** onto the user stack starting at `RSP`!
* The kernel's signal frame **overwrites and destroys the 128 bytes below `RSP`**, wiping out the leaf function's Red Zone variables!
* When the interrupt finishes and returns, the leaf function reads corrupted garbage data and crashes.

To prevent vector alignment traps and eliminate Red Zone signal corruption hazards, computer architectures enforce the **16-Byte Stack Alignment Invariant** and **Red Zone Protection Rules**.

---

## The Freight Elevator and the Hanging Safety Shelf: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of stack pointer alignment, 16-byte boundary enforcement, and Red Zone signal hazards before analyzing stack frame allocation math and C Call Frame Information (`.cfi_*`) directives, let us consider an everyday analogy: **The High-Rise Freight Elevator and the Hanging Safety Shelf**.

Imagine a high-rise storage building managed by a heavy-duty freight elevator (**The Call Stack**).

```text
THE FREIGHT ELEVATOR STACK METAPHOR

 High-Rise Warehouse (Call Stack Space)
 ┌─────────────────────────────────────────────────────────────┐
 │ Floor Level 100 (High Memory Start)                         │
 │ Elevator lowers DOWNWARD as new crates arrive               │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Elevator Position = Stack Pointer (sp)
 ┌─────────────────────────────────────────────────────────────┐
 │ Heavy Freight Elevator Platform                             │
 └─────────────────────────────────────────────────────────────┘
```

The elevator platform represents the current **Stack Pointer (`sp`)**. 

As new storage crates (**Stack Frames**) arrive, the elevator is lowered downward toward lower floor levels (**Stack Grows Downward**).

Let us observe two physical problems encountered by the warehouse workers:

---

### Problem 1: Misaligned Locking Pins (The 16-Byte Stack Alignment Invariant)

The elevator shaft has heavy-duty mechanical locking pins installed along the wall spaced at exact **16-inch intervals** ($0, 16, 32, 48, 64 \dots$ inches).

Heavy robotic forklift arms (**128-Bit Vector / SIMD Execution Units**) load massive 16-inch wide steel crates onto the elevator platform.

Suppose a worker lowers the elevator platform by an arbitrary distance of 12 inches, stopping the platform at height **36 inches** ($36 \pmod{16} \neq 0$).

Look at what happens when the robotic forklift attempts to load a 16-inch steel crate onto the platform:

```text
MISALIGNED ELEVATOR LOCKING PIN GEARS JAMMED

 48 Inches (Aligned Pin) ──► [ Structural Locking Pin ]
                             
 Elevator Platform       ──► ═══ Sitting at 36 Inches! (MISALIGNED!)
                             
 32 Inches (Aligned Pin) ──► [ Structural Locking Pin ]
                             ▲
                             └── Robotic forklift clamps at 32" and 48"!
                                 Elevator sitting at 36"!
                                 ROBOTIC GEARS JAM & SNAP! EMERGENCY SHUTOFF!
```

Trace the physical failure:
* The robotic arm's structural clamps are fixed at 32 inches and 48 inches.
* The elevator platform is sitting crooked at 36 inches!
* When the robotic arm attempts to clamp the 16-inch crate onto the platform, the clamps hit at an angle, the robotic gears jam, and an **Emergency Hardware Shutoff Alarm (Hardware Alignment Trap)** is triggered!

To prevent gear jams, the warehouse manager enforces **The 16-Inch Alignment Rule**:
> *"Whenever you lower the elevator to load crates, you MUST lower it by an exact multiple of 16 inches ($16, 32, 48, 64 \dots$) so the locking pins engage smoothly!"*

---

### Problem 2: The Hanging Safety Shelf (The 128-Byte Red Zone Hazard)

The elevator platform has a temporary 128-inch safety shelf hanging directly **below** the bottom of the elevator floor (**The 128-Byte Red Zone**).

When a worker needs to perform a quick 5-second measurement, instead of taking time to crank the heavy elevator winch down 16 inches, the worker simply sets two delicate measuring instruments down on the hanging safety shelf below the floor (**Zero Stack Pointer Allocation**).

Now, trace what happens if an unexpected **Emergency Fire Drill** occurs (**An Asynchronous Hardware Interrupt / Kernel Signal Handler**):

```text
THE HANGING SAFETY SHELF (RED ZONE CORRUPTION)

 Elevator Floor (Position of Stack Pointer sp)
 ═══════════════════════════════════════════════════════════════
   Hanging Safety Shelf (128-Byte Red Zone below sp)
   ┌───────────────────────────────────────────────────────────┐
   │ Worker leaves delicate instruments here without moving sp!│
   └───────────────────────────────────────────────────────────┘
     ▲
     │ Emergency Firefighters drop down from above during Fire Drill!
     │ Firefighters land on hanging shelf and TRAMPLE instruments!
```

Trace the catastrophe during the fire drill:
1. Firefighters (**The Operating System Kernel**) drop down the elevator shaft to inspect the building.
2. The firefighters land directly on top of the hanging safety shelf below the elevator floor!
3. The firefighters' heavy boots **trample and crush the worker's delicate measuring instruments**!
4. When the fire drill ends and the worker reaches under the floor to retrieve their instruments, they find smashed trash!

This elevator warehouse is the exact physical analogue of **Stack Pointer Alignment and Red Zone Mechanics**:
* The elevator position is the **Stack Pointer (`sp` / `RSP`)**.
* Lowering the elevator is **Stack Frame Allocation (`addi sp, sp, -N`)**.
* 16-inch locking pins are the **16-Byte Stack Alignment Invariant ($sp \pmod{16} == 0$)**.
* Robotic forklift gear jams are **Hardware Vector Memory Alignment Traps**.
* The hanging safety shelf is the **System V x86-64 128-Byte Red Zone**.
* Firefighters dropping down during a fire drill is an **Asynchronous Hardware Interrupt / Signal Handler**.

---

## Primitive 1: The 16-Byte Stack Alignment Invariant

Now that we possess an intuitive mental model of 16-inch elevator locking pins and hanging safety shelves, let us examine the formal engineering mechanics of **The 16-Byte Stack Alignment Invariant**.

In modern 64-bit Application Binary Interface (ABI) standards—including RISC-V LP64D, ARM64 (AArch64), and x86-64 System V—the call stack is governed by a non-negotiable mathematical rule:

> **The 16-Byte Stack Alignment Invariant**: The Stack Pointer (`sp` / `RSP`) MUST be aligned to a 16-byte physical memory boundary at the exact instant a function call instruction (`call` / `jal`) is executed.

$$\mathbf{\text{Stack Alignment Condition: } sp \pmod{16} == 0 \quad \iff \quad sp[3:0] == 0000_2}$$

Where:
* $sp$ is the 64-bit physical memory address stored in the Stack Pointer register.
* $sp[3:0]$ represents the lowest 4 bits of the Stack Pointer binary address vector.

```text
16-BYTE STACK ALIGNMENT BINARY MASK CHECK

 Stack Pointer Address (Hex) │ Binary Lowest 4 Bits [3:0] │ Alignment Status
─────────────────────────────┼────────────────────────────┼───────────────────
 0x000000007FFF1000          │ 0000_2                     │ 100% 16-B ALIGNED!
 0x000000007FFF1008          │ 1000_2 (8 Bytes)           │ MISALIGNED! (Fault)
 0x000000007FFF1010          │ 0000_2                     │ 100% 16-B ALIGNED!
 0x000000007FFF1018          │ 1000_2 (8 Bytes)           │ MISALIGNED! (Fault)
```

---

### Calculating Aligned Stack Frame Sizes ($N_{\text{aligned}}$)

When an assembly function requires $V$ bytes of memory space on its stack frame to store saved registers (`ra`, `s0`–`s11`) and local variables, the programmer or compiler **CANNOT simply subtract $V$ bytes from `sp`** if $V$ is not a multiple of 16!

The required stack allocation size $N_{\text{aligned}}$ must be rounded **UP** to the nearest multiple of 16:

$$\mathbf{N_{\text{aligned}} = \left\lceil \frac{V}{16} \right\rceil \times 16}$$

Where:
* $V$ is the raw un-padded byte requirement of local variables and saved registers.
* $N_{\text{aligned}}$ is the actual 16-byte aligned stack allocation size subtracted from `sp`.

#### Stack Allocation Padding Examples:

1. **Example A (Function needs 8 bytes to save `ra`)**:
   $$V = 8 \text{ Bytes} \implies N_{\text{aligned}} = \left\lceil \frac{8}{16} \right\rceil \times 16 = 1 \times 16 = \mathbf{16 \text{ Bytes}}$$
   * The function allocates 16 bytes (`addi sp, sp, -16`), inserting 8 bytes of padding.

2. **Example B (Function needs 24 bytes to save `ra`, `s0`, `s1`)**:
   $$V = 24 \text{ Bytes} \implies N_{\text{aligned}} = \left\lceil \frac{24}{16} \right\rceil \times 16 = 2 \times 16 = \mathbf{32 \text{ Bytes}}$$
   * The function allocates 32 bytes (`addi sp, sp, -32`), inserting 8 bytes of padding.

3. **Example C (Function needs 40 bytes)**:
   $$V = 40 \text{ Bytes} \implies N_{\text{aligned}} = \left\lceil \frac{40}{16} \right\rceil \times 16 = 3 \times 16 = \mathbf{48 \text{ Bytes}}$$

```riscv
# PROLOGUE STACK ALLOCATION WITH 16-BYTE ALIGNMENT PADDING

func_example:
    # Function needs 24 bytes (ra, s0, s1). 24 is NOT a multiple of 16!
    # Round UP to 32 bytes to preserve 16-byte alignment!
    
    addi sp, sp, -32       # Allocate 32 bytes (16-byte aligned!)
    sd   ra, 24(sp)        # Save return address
    sd   s0, 16(sp)        # Save frame pointer
    sd   s1, 8(sp)         # Save s1 register
    # Offset 0(sp) is 8-byte padding space!
```

---

## Primitive 2: The 128-Byte Red Zone Hazard

Now let us examine the second core primitive: **The 128-Byte Red Zone Hazard**.

In the System V x86-64 ABI (the standard binary interface for Linux, macOS, and BSD on x86-64), compiler architects introduced a specialized performance optimization called **The Red Zone**.

> **The Red Zone** is a 128-byte memory region immediately below the current stack pointer (`RSP - 1` down to `RSP - 128`) that is reserved for leaf functions to store temporary local variables **without adjusting the stack pointer register**.

```text
SYSTEM V x86-64 RED ZONE MEMORY LAYOUT

 Address Space
 ┌─────────────────────────────────────────────────────────────┐
 │ Caller Stack Frame                                          │
 ├─────────────────────────────────────────────────────────────┤
 │ Stack Pointer RSP ──► Current Top of Stack                  │
 ├─────────────────────────────────────────────────────────────┤
 │ THE 128-BYTE RED ZONE REGION (RSP - 1 down to RSP - 128)    │
 │ (Leaf functions store local data here WITHOUT sub rsp, N!)  │
 └─────────────────────────────────────────────────────────────┘
```

---

### The Performance Advantage of the Red Zone

In short leaf functions (functions that do not call any other subroutines), storing temporary variables inside the 128-byte Red Zone saves two instructions in every function execution:
* Omits `sub rsp, N` in the function prologue.
* Omits `add rsp, N` in the function epilogue.

```x86asm
; OPTIMIZED LEAF FUNCTION USING THE RED ZONE (x86-64)
leaf_function:
    mov [rsp - 8], rdi     ; Store parameter 1 into Red Zone without modifying RSP!
    mov [rsp - 16], rsi    ; Store parameter 2 into Red Zone!
    add rdi, rsi
    mov rax, rdi
    ret                    ; Returns in 1 cycle! (Zero RSP allocation overhead!)
```

---

### The Asynchronous Interrupt Data Corruption Hazard

Why is the Red Zone considered a severe **Hazard** in bare-metal systems, operating system kernels, and hardware trap handlers?

Trace what happens when an **asynchronous hardware interrupt** (such as a timer interrupt, network packet arrival, or page fault trap) fires while `leaf_function` is actively using the Red Zone:

```text
RED ZONE CORRUPTION TIMELINE DURING HARDWARE INTERRUPTS

 1. Leaf Function stores temporary data at [RSP - 8] in Red Zone.
                                │
                                ▼
 2. HARDWARE INTERRUPT FIRES! (e.g., Timer IRQ)
    CPU hardware switches to Kernel Interrupt Handler.
    Kernel pushes Interrupt Trap Frame onto the User Stack starting at RSP!
                                │
                                ▼
 3. Kernel Interrupt Frame OVERWRITES [RSP - 8]!
    (Data stored at [RSP - 8] is COMPLETELY DESTROYED!)
                                │
                                ▼
 4. Interrupt finishes and executes iret.
    Leaf Function resumes and reads [RSP - 8] ──► READS CORRUPTED GARBAGE! (CRASH!)
```

Trace the physical corruption step-by-step:
1. `leaf_function` writes $42$ into `[RSP - 8]` inside the Red Zone.
2. A hardware timer interrupt fires. The CPU hardware jumps to the kernel's interrupt handler.
3. The kernel's interrupt handler **uses the existing user stack** and pushes $128\text{ bytes}$ of saved registers (`RIP`, `CS`, `RFLAGS`, `RSP`, `SS`) starting at address `RSP`!
4. The kernel's register push writes directly over address `[RSP - 8]`, **destroying the $42$ written by `leaf_function`**!
5. When the interrupt handler finishes (`iret`) and returns to `leaf_function`, `leaf_function` reads `[RSP - 8]` expecting $42$, but reads kernel register garbage instead!

---

### The Kernel Prohibition Rule (`-mno-red-zone`)

Because hardware interrupts can fire at any unpredictable clock cycle, **THE RED ZONE CANNOT BE USED IN OPERATING SYSTEM KERNELS, INTERRUPT HANDLERS, OR BARE-METAL FIRMWARE**!

Every production kernel compiler (GCC / Clang compiling Linux, FreeBSD, or bare-metal embedded software) **MUST BE PASSED THE `-mno-red-zone` COMPILER FLAG**:

```bash
# COMPILING KERNEL CODE WITH RED ZONE DISABLED
gcc -mno-red-zone -ffreestanding -c kernel_main.c -o kernel_main.o
```

Passing `-mno-red-zone` forces the compiler to explicitly allocate stack space (`sub rsp, N`) for all local variables, ensuring that no data ever sits below `RSP` where an interrupt frame could crush it!

---

## Real-World Silicon Engineering: Vector Alignment Traps and DWARF CFI Unwinding

In commercial microprocessor design and production software toolchains, stack alignment and allocation mechanics intersect with vector processing and debugging tools.

### 1. Vector Memory Alignment Traps

Modern High-Performance Computing (HPC) software uses wide Vector / SIMD register extensions (such as $128\text{-bit}$ ARM NEON, $256\text{-bit}$ x86 AVX, or $512\text{-bit}$ RISC-V Vector / AVX-512).

When a vector instruction saves a 256-bit ($32\text{-byte}$) vector register onto the stack (`vse64.v` or `vmovaps`):
* The hardware requires the memory address to be **32-byte aligned** ($sp[4:0] == 00000_2$).

If the Stack Pointer `sp` was misaligned by an earlier function:
* The 256-bit vector store straddles **two 64-byte L1 Data Cache lines**!
* Strict hardware memory controllers raise a **Store Address Misaligned Exception Trap**, killing the application process instantly!

---

### 2. DWARF Call Frame Information (`.cfi_*`) Directives

How do debuggers (GDB) and C++ exception handlers (`throw` / `catch`) walk up the call stack when a crash occurs if the stack frame was dynamically resized?

The assembler embeds **Call Frame Information (CFI)** directives inside the `.text` section:

```riscv
# DWARF CFI DIRECTIVES FOR STACK UNWINDING

func_example:
    .cfi_startproc            # 1. Inform debugger: Function entry point
    addi sp, sp, -32
    .cfi_def_cfa_offset 32    # 2. Inform debugger: Stack shifted down by 32 bytes
    sd   ra, 24(sp)
    .cfi_offset 1, -8         # 3. Inform debugger: Saved ra is at CFA - 8 bytes
    
    # ... Function Body ...
    
    ld   ra, 24(sp)
    addi sp, sp, 32
    .cfi_def_cfa_offset 0     # 4. Inform debugger: Stack restored to 0
    ret
    .cfi_endproc              # 5. Inform debugger: Function exit point
```

When a crash occurs, GDB reads these `.cfi_*` metadata tables to calculate the exact Stack Pointer offset at every instruction line, allowing it to reconstruct a perfect stack backtrace (`bt`) even if the frame pointer `fp` was omitted!

---

## Solved Industrial Engineering Exercise: Stack Frame Allocation Math, 16-Byte Alignment Verification, and Red Zone Hazard Audit

To consolidate your complete mastery of 16-byte stack alignment mathematics, padding calculations, Red Zone interrupt hazards, and DWARF CFI directives, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior firmware microarchitect auditing the stack frame allocation and exception resilience for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is executing a real-world signal processing pipeline containing two functions:

1. **Function 1 (`process_audio_frame`)**: A non-leaf function that requires local stack storage for:
   * Saving Return Address `ra` ($8\text{ bytes}$).
   * Saving Frame Pointer `fp` ($8\text{ bytes}$).
   * Saving 3 callee-saved registers (`s1`, `s2`, `s3`) ($3 \times 8 = 24\text{ bytes}$).
   * Local array buffer `int32_t pcm_samples[5]` ($5 \times 4 = 20\text{ bytes}$).
2. **Function 2 (`fast_filter_leaf`)**: An x86-64 user-space leaf function optimized to use the 128-byte Red Zone without adjusting `RSP`.

#### Initial Hardware Register State:
* Initial Stack Pointer before `process_audio_frame` entry: $sp_{\text{initial}} = \text{0x0000\_0000\_7FFF\_1000}$ ($100\%$ 16-byte aligned).

#### Your Objective

1. Calculate the raw un-padded stack space $V$ required by `process_audio_frame`.
2. Calculate the required 16-byte aligned stack allocation size $N_{\text{aligned}}$ and determine the exact number of padding bytes ($\Delta_{\text{pad}}$) inserted.
3. Write the complete RISC-V 64-bit assembly prologue and epilogue for `process_audio_frame` using $N_{\text{aligned}}$ and DWARF `.cfi_*` directives. Verify that the new stack pointer $sp_{\text{new}}$ satisfies $sp_{\text{new}} \pmod{16} == 0$.
4. Perform a **Red Zone Hazard Audit** on Function 2 (`fast_filter_leaf`):
   * Trace what happens when an asynchronous hardware timer interrupt fires during `fast_filter_leaf` in:
     * **Case A**: User-space execution under Linux OS (Kernel switches to dedicated kernel stack).
     * **Case B**: Bare-metal kernel-mode execution compiled WITHOUT `-mno-red-zone` (Interrupt handler uses current `RSP`).
5. Calculate the physical execution time (in nanoseconds) saved by using the Red Zone in Function 2 vs allocating a 16-byte stack frame.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Calculate Raw Stack Space $V$ and Aligned Allocation $N_{\text{aligned}}$

Let us sum the raw byte requirements for `process_audio_frame`:
* Saved Return Address `ra`: $8\text{ bytes}$.
* Saved Frame Pointer `fp`: $8\text{ bytes}$.
* Saved Registers `s1, s2, s3`: $3 \times 8 = 24\text{ bytes}$.
* Local Array `pcm_samples[5]`: $5 \times 4 = 20\text{ bytes}$.

$$\text{Raw Stack Space } V = 8 + 8 + 24 + 20 = \mathbf{60 \text{ Bytes}}$$

##### Calculate 16-Byte Aligned Allocation ($N_{\text{aligned}}$):

$$N_{\text{aligned}} = \left\lceil \frac{V}{16} \right\rceil \times 16 = \left\lceil \frac{60}{16} \right\rceil \times 16 = \lceil 3.75 \rceil \times 16 = 4 \times 16 = \mathbf{64 \text{ Bytes}}$$

##### Calculate Inserted Padding Bytes ($\Delta_{\text{pad}}$):

$$\Delta_{\text{pad}} = N_{\text{aligned}} - V = 64\text{ Bytes} - 60\text{ Bytes} = \mathbf{4 \text{ Padding Bytes}}$$

The assembler inserts **4 padding bytes**, advancing stack allocation from $60 \to 64\text{ bytes}$ to preserve the 16-byte alignment invariant!

---

#### Step 2: Write Assembly Prologue, Epilogue, and Verify Stack Alignment

```riscv
# PROCESS_AUDIO_FRAME ASSEMBLY PROLOGUE & EPILOGUE

.global process_audio_frame
.type process_audio_frame, @function
process_audio_frame:
    # --- PROLOGUE (64-Byte 16-Byte Aligned Allocation) ---
    .cfi_startproc
    addi sp, sp, -64            # 1. Allocate 64 bytes on stack frame
    .cfi_def_cfa_offset 64
    sd   ra, 56(sp)             # 2. Save Return Address ra at top
    .cfi_offset 1, -8
    sd   fp, 48(sp)             # 3. Save Frame Pointer fp
    .cfi_offset 8, -16
    sd   s1, 40(sp)             # 4. Save s1 register
    sd   s2, 32(sp)             # 5. Save s2 register
    sd   s3, 24(sp)             # 6. Save s3 register
    addi fp, sp, 64             # 7. Set Frame Pointer fp to base of frame

    # --- FUNCTION BODY ---
    # pcm_samples[5] array sits at 4(sp) through 23(sp) (20 Bytes)
    # Bytes 0(sp)..3(sp) hold 4 Padding Bytes!
    # ... Function logic & calls ...

    # --- EPILOGUE ---
    ld   ra, 56(sp)             # Restore ra
    ld   fp, 48(sp)             # Restore fp
    ld   s1, 40(sp)             # Restore s1
    ld   s2, 32(sp)             # Restore s2
    ld   s3, 24(sp)             # Restore s3
    addi sp, sp, 64             # Deallocate 64 bytes
    .cfi_def_cfa_offset 0
    ret
    .cfi_endproc
```

##### Verify Stack Alignment at Runtime ($sp_{\text{initial}} = \text{0x7FFF1000}$):

$$sp_{\text{new}} = \text{0x0000\_0000\_7FFF\_1000} - 64_{10} = \text{0x0000\_0000\_7FFF\_1000} - \text{0x40}_{16} = \mathbf{\text{0x0000\_0000\_7FFF\_0FC0}}$$

Test lowest 4 binary bits of $sp_{\text{new}}$ (`0x0FC0` = `1111_1100_0000_2`):

$$sp_{\text{new}}[3:0] == 0000_2 \implies \text{0x7FFF0FC0} \pmod{16} == 0 \quad (\mathbf{\text{100\% 16-BYTE ALIGNED!}})$$

---

#### Step 3: Perform Red Zone Hazard Audit on Function 2 (`fast_filter_leaf`)

Function 2 uses the 128-byte Red Zone on x86-64, storing data at `[RSP - 8]` and `[RSP - 16]` without executing `sub rsp, 16`.

##### Case A: User-Space Execution (Linux OS Environment)
1. A timer interrupt fires while `fast_filter_leaf` is executing.
2. The CPU hardware switches to Kernel Mode (Ring 0).
3. The Linux OS kernel **switches the Stack Pointer from user `RSP` to a dedicated Kernel Stack Pointer** (`sscratch` / Task Kernel Stack).
4. The interrupt trap frame is pushed onto the **Kernel Stack**, NOT the user stack!
5. User-space Red Zone data at `[RSP - 8]` is **$100\%$ UNTOUCHED AND SAFE**!

##### Case B: Bare-Metal Kernel Mode Execution (Without `-mno-red-zone`)
1. The CPU is already running in Kernel Mode. `RSP` points to the kernel stack.
2. A hardware interrupt fires. The CPU does NOT switch stacks! It uses the current `RSP`.
3. The hardware interrupt handler pushes $128\text{ bytes}$ of interrupt context (`RIP`, `CS`, `RFLAGS`, `RSP`, `SS`) starting at `RSP`!
4. **CATASTROPHIC DATA CORRUPTION**: The interrupt frame writes directly over addresses `[RSP - 8]` and `[RSP - 16]`, **destroying `fast_filter_leaf`'s local variables**!
5. When `fast_filter_leaf` resumes, it reads corrupted garbage and triggers a kernel panic!

```text
RED ZONE AUDIT SUMMARY

 Execution Domain │ -mno-red-zone Flag Used? │ Red Zone Safety Status
──────────────────┼──────────────────────────┼─────────────────────────────────────────────────
 User-Space OS    │ No (Default Allowed)     │ SAFE (OS uses separate kernel stack on trap)
 Bare-Metal / KNL │ NO (DANGEROUS BUG!)      │ CORRUPTED! (Interrupt frame overwrites data!)
 Bare-Metal / KNL │ YES (-mno-red-zone)      │ SAFE (Stack explicitly allocated via sub rsp)
```

---

#### Step 4: Calculate Time Saved by Red Zone Optimization in User-Space

In user-space, omitting `sub rsp, 16` (prologue) and `add rsp, 16` (epilogue) saves **2 clock cycles** per function execution:

$$\text{Cycles Saved} = 2 \text{ Clock Cycles}$$

$$\text{Time Saved} = 2 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{0.625 \text{ nanoseconds per function call}}$$

For a leaf function invoked $100,000,000\text{ times per second}$, the Red Zone optimization saves:

$$\text{Time Saved per Sec} = 100,000,000 \times 0.625 \text{ ns} = \mathbf{0.0625 \text{ seconds}} \quad (62.5\text{ ms saved / 6.25\% CPU Speedup!})$$

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and alignment results:

1. **Stack Frame Alignment Check**:
   * Raw space $V = 60\text{ bytes}$. Aligned size $N_{\text{aligned}} = 64\text{ bytes}$.
   * $sp_{\text{initial}} = \text{0x7FFF1000}$. $sp_{\text{new}} = \text{0x7FFF0FC0}$.
   * $\text{0x7FFF0FC0} \pmod{16} == 0$. 16-byte alignment invariant verified!
2. **Padding Math Check**:
   * $60 + 4 = 64\text{ bytes}$. Padding $\Delta_{\text{pad}} = 4\text{ bytes}$.
   * Array `pcm_samples` placed at `4(sp)`, leaving bytes `0(sp)..3(sp)` as alignment padding. Verified!
3. **Red Zone Audit Verification**:
   * Bare-metal execution without `-mno-red-zone` proved $100\%$ vulnerable to interrupt frame corruption.
   * Passing `-mno-red-zone` forces explicit stack allocation, eliminating Red Zone signal hazards.

All stack allocation formulas, 16-byte alignment modulo checks, Red Zone hazard audits, and DWARF CFI frame unwinding directives evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Stack Alignment Invariant**: The non-negotiable ABI mathematical requirement ($sp \pmod{16} == 0$) that mandates aligning the Stack Pointer to a 16-byte physical memory boundary at every function call, preventing hardware vector/SIMD misaligned memory access traps.
* **Red Zone Hazard**: The data corruption condition that occurs when a leaf function stores temporary data in the 128-byte region below the Stack Pointer (`RSP - 128`) without adjusting `RSP`, exposing data to destruction by asynchronous hardware interrupts or OS kernel signal frames unless disabled via `-mno-red-zone`.
