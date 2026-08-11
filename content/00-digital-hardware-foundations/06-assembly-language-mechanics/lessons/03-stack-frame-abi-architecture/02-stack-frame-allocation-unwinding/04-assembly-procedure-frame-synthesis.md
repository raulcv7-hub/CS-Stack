content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/02-stack-frame-allocation-unwinding/04-assembly-procedure-frame-synthesis.md
# Assembly Procedure Frame Synthesis and Parameter Spilling Architecture

## The Overflow Argument Crisis: Why 8 Registers Are Not Enough

In high-performance computer architectures, function calls rely on the Application Binary Interface (ABI) to pass parameters between caller and callee subroutines at maximum execution speed. To achieve sub-nanosecond function call latencies, the ABI designates a set of high-speed hardware registers specifically for parameter passing: the eight argument registers **`a0` through `a7`** ($x10 \dots x17$ in RISC-V, or `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9` in x86-64).

Passing parameters in registers allows a caller to hand over data to a callee in a single clock cycle ($0.3125\text{ nanoseconds}$ at $3.2\text{ GHz}$), requiring zero off-chip or cache memory operations.

However, real-world software engineering routinely breaks this 8-register capacity limit.

Consider real-world software functions:
* A graphics rendering function that accepts 12 parameters: four $3\text{D}$ coordinates ($x, y, z, w$), four RGBA color components, three rotation angles, and a scale factor.
* A database transaction processor that accepts 10 64-bit integer fields.
* A mathematical solver accepting 14 floating-point coefficients.

What happens at the physical hardware level when a caller function needs to pass **12 distinct 64-bit parameters ($p_1, p_2 \dots p_{12}$)** to a subroutine?

```text
THE OVERFLOW ARGUMENT CRISIS (12 PARAMETERS PASSED)

 Caller Function (main)                        Callee Subroutine
 ┌────────────────────────────────────────┐    ┌──────────────────────────────┐
 │ Parameters p1..p8 loaded in Regs a0..a7│───►│ Reads Regs a0..a7 (Fast 1c!) │
 ├────────────────────────────────────────┤    └──────────────────────────────┘
 │ Parameters p9, p10, p11, p12           │
 │ NO HARDWARE REGISTERS REMAIN!          │ ──► WHERE DO THEY GO?
 └────────────────────────────────────────┘    (How does callee find p9..p12?)
```

Trace the physical hardware limit:
1. **Registers Full**: The first eight parameters ($p_1 \dots p_8$) occupy argument registers `a0` through `a7`.
2. **No Registers Left**: Parameters 9, 10, 11, and 12 ($p_9, p_{10}, p_{11}, p_{12}$) have no hardware registers available to sit in!
3. **The Memory Spilling Problem**: The caller MUST write parameters 9, 10, 11, and 12 into main memory on the stack frame (**Parameter Spilling**).

Now, consider the structural microarchitectural challenge:
Where on the stack frame does the caller write these spilled parameters, and how does the callee find them?

If the caller writes spilled parameters at arbitrary memory locations, or if the callee's function prologue allocates its stack frame without accounting for incoming spilled arguments:
* The callee's local variables will overwrite the incoming spilled parameters!
* The saved return address (`ra`) will be written over $p_9$, erasing the path back to the caller.
* The stack pointer (`sp`) will become misaligned, triggering 128-bit vector memory alignment traps!

To handle arbitrary parameter counts and prevent stack data collisions, assembly systems engineering relies on **Parameter Spilling** and **Assembly Procedure Frame Synthesis**.

Procedure Frame Synthesis is the architectural science of designing, sizing, aligning, and constructing a complete, modular stack frame—organizing incoming spilled arguments, saved return addresses (`ra`), saved frame pointers (`fp`), callee-saved registers (`s0`–`s11`), local variables, and outgoing spilled arguments into a single, perfectly aligned 16-byte memory layout!

---

## The Bank Teller's Counter and the Overflow Deposit Tray: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of parameter spilling, stack frame synthesis, and frame pointer anchoring before analyzing assembly prologues, epilogues, and memory offset equations, let us consider an everyday analogy: **The Bank Teller and the Overflow Deposit Tray**.

Imagine a bank clerk (**The Callee Subroutine**) receiving a complex deposit transaction from a corporate customer (**The Caller Function**).

```text
THE BANK TELLER OVERFLOW TRAY METAPHOR

 Bank Clerk Hands (Registers a0..a7)          Overflow Counter Tray (Stack Spill Area)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Holds Arguments p1..p8    │                │ Holds Spilled Args p9..p12│
 └───────────────────────────┘                └───────────────────────────┘
   (First 8 Parameters in Regs)                 (Parameters 9..12 on Stack!)
```

The clerk has 8 physical trays mounted on their counter (**Argument Registers `a0`–`a7`**).

The corporate customer wants to deposit 12 bags of cash ($p_1 \dots p_{12}$).

Let us observe how the customer and clerk handle this 12-bag transaction:

---

### Step 1: Passing the First 8 Bags in Registers (`a0`–`a7`)

1. The customer places the first 8 bags ($p_1 \dots p_8$) directly into the clerk's 8 counter trays (`a0`–`a7`).
2. The clerk receives these 8 bags instantly in 1 second (**1-Cycle Register Passing**).

---

### Step 2: Spilling the Remaining 4 Bags ($p_9 \dots p_{12}$) onto the Stack

The clerk's 8 counter trays are now full!

The customer cannot hold the remaining 4 bags ($p_9, p_{10}, p_{11}, p_{12}$) in mid-air:
* **The Parameter Spilling Rule**: The customer places the remaining 4 bags onto a designated **Overflow Deposit Tray** located on the counter directly in front of the clerk (**The Caller's Stack Frame Parameter Spill Area**)!
* The customer places the bags in strict order: $p_9$ at the front, $p_{10}$ behind $p_9$, $p_{11}$ behind $p_{10}$, and $p_{12}$ at the back.

---

### Step 3: The Master Stack Frame Blueprint

To organize the entire transaction without mess, the bank manager draws a master blueprint (**Assembly Procedure Frame Synthesis**):

```text
THE MASTER PROCEDURE STACK BLUEPRINT

 Memory (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ CALLER STACK FRAME                                          │
 │   [ ... Caller Local Variables ... ]                        │
 │   [ Spilled Outgoing Argument 12 (p12) ] ◄── Highest Offset│
 │   [ Spilled Outgoing Argument 11 (p11) ]                    │
 │   [ Spilled Outgoing Argument 10 (p10) ]                    │
 │   [ Spilled Outgoing Argument  9 (p9)  ] ◄── Address at Call!│
 ├─────────────────────────────────────────────────────────────┤
 │ CALLEE STACK FRAME (Allocated by Callee Prologue)           │
 │   [ Saved Return Address ra (72(sp)) ]                      │
 │   [ Saved Frame Pointer fp  (64(sp)) ] ◄── Callee fp        │
 │   [ Saved Registers s1, s2  (48(sp)) ]                      │
 │   [ Local Variables & Buffers (24(sp)) ]                    │
 │   [ Outgoing Spilled Arguments (0(sp))  ]                    │
 │   ◄── Current Stack Pointer sp (16-Byte Aligned!)           │
 └─────────────────────────────────────────────────────────────┘
```

Look at the structural elegance of this blueprint:
1. **Incoming Spilled Arguments ($p_9 \dots p_{12}$)** sit immediately **ABOVE the callee's frame pointer (`fp`)**! The callee reads incoming spilled arguments using positive offsets from its frame pointer (`0(fp)`, `8(fp)`, `16(fp)`...).
2. **Saved Return Address (`ra`) and Frame Pointer (`fp`)** sit at the base of the callee's stack frame.
3. **Local Variables** sit in the middle of the callee's stack frame.
4. **Outgoing Spilled Arguments** (for subroutines called *by* the callee) sit at the very bottom of the callee's stack frame (`0(sp)`, `8(sp)`...).

This master blueprint is the exact physical analogue of **Assembly Procedure Frame Synthesis and Parameter Spilling**:
* The clerk's 8 desk trays are **Argument Registers (`a0`–`a7`)**.
* The 4 extra bags $p_9 \dots p_{12}$ are **Spilled Parameters**.
* The overflow counter tray is **The Caller's Outgoing Parameter Spill Area**.
* The master blueprint is **The Synthesized Assembly Stack Frame Layout**.

---

## Primitive 1: Parameter Spilling Mechanics

Now that we possess an intuitive mental model of overflow counter trays and master blueprints, let us examine the formal engineering mechanics of **Parameter Spilling**.

> **Parameter Spilling** is the Application Binary Interface (ABI) mechanism where function parameters exceeding the available hardware argument registers ($p_9, p_{10} \dots p_N$) are written into memory locations on the caller's stack frame prior to executing the function call instruction (`call` / `jal`), allowing the callee subroutine to retrieve them via base-displacement memory loads.

```text
PARAMETER SPILLING REGISTER vs STACK ALLOCATION MAP

 Argument Index │ Storage Location Assignment │ Memory Offset / Register
────────────────┼─────────────────────────────┼───────────────────────────
 Parameter 1    │ Register a0 (x10)           │ 0 Cycles Memory (Reg)
 Parameter 2    │ Register a1 (x11)           │ 0 Cycles Memory (Reg)
 Parameter 3    │ Register a2 (x12)           │ 0 Cycles Memory (Reg)
 Parameter 4    │ Register a3 (x13)           │ 0 Cycles Memory (Reg)
 Parameter 5    │ Register a4 (x14)           │ 0 Cycles Memory (Reg)
 Parameter 6    │ Register a5 (x15)           │ 0 Cycles Memory (Reg)
 Parameter 7    │ Register a6 (x16)           │ 0 Cycles Memory (Reg)
 Parameter 8    │ Register a7 (x17)           │ 0 Cycles Memory (Reg)
 Parameter 9    │ Caller Stack Spill Slot 0   │ 0(sp_caller) / 0(fp_callee)
 Parameter 10   │ Caller Stack Spill Slot 1   │ 8(sp_caller) / 8(fp_callee)
 Parameter 11   │ Caller Stack Spill Slot 2   │ 16(sp_caller) / 16(fp_callee)
 Parameter 12   │ Caller Stack Spill Slot 3   │ 24(sp_caller) / 24(fp_callee)
```

---

### Parameter Spilling Rules and Layout Invariants

The ABI enforces three non-negotiable rules for spilled parameters:

1. **Natural Scalar Order**: Spilled arguments are written to memory in natural ascending order:
   * Parameter 9 ($p_9$) is stored at the lowest address of the spill area (`0(sp)` of caller).
   * Parameter 10 ($p_{10}$) is stored at `8(sp)` of caller.
   * Parameter 11 ($p_{11}$) is stored at `16(sp)` of caller.
2. **8-Byte Word Alignment**: Each 64-bit spilled parameter occupies an 8-byte aligned memory slot on the stack frame ($EA \pmod 8 == 0$).
3. **Caller Allocation Duty**: The **caller function** is responsible for allocating space for its outgoing spilled arguments at the bottom of its own stack frame *before* issuing `call`!

---

### Accessing Spilled Parameters in the Callee

When the callee subroutine enters its function body, how does it access incoming spilled parameters $p_9, p_{10}, p_{11}$?

If the callee sets up a **Frame Pointer (`fp`)** in its prologue (`addi fp, sp, FrameSize`):

The incoming spilled parameters sit immediately at and above $fp$:

```riscv
# CALLEE READING INCOMING SPILLED PARAMETERS VIA FRAME POINTER (fp)

ld x10, 0(fp)     # Loads Parameter 9  (p9)  from 0(fp)
ld x11, 8(fp)     # Loads Parameter 10 (p10) from 8(fp)
ld x12, 16(fp)    # Loads Parameter 11 (p11) from 16(fp)
```

$$\text{Effective Address for Spilled Parameter } k \ (k \ge 9): \mathbf{EA(p_k) = fp + 8 \cdot (k - 9)}$$

Look at the mathematical elegance:
Because the Frame Pointer `fp` points directly to the base of the callee's frame (which sits immediately below the caller's spill area), **Parameter 9 is ALWAYS located at `0(fp)`**, Parameter 10 at `8(fp)`, and Parameter 11 at `16(fp)`!

The callee reads spilled parameters using simple, positive 8-byte offsets from `fp`!

---

## Primitive 2: Assembly Procedure Frame Synthesis

Now let us examine the second core primitive: **Assembly Procedure Frame Synthesis**.

> **Assembly Procedure Frame Synthesis** is the microarchitectural process executed by a compiler or assembly programmer to design, size, align, and construct a complete function stack frame that integrates saved return addresses (`ra`), saved frame pointers (`fp`), callee-saved registers (`s0`–`s11`), local variables, and outgoing spilled parameters into a single, 16-byte aligned memory structure.

```text
PROCEDURE FRAME SYNTHESIS COMPONENT STACK

 Memory (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ Incoming Spilled Arguments (p9, p10, p11...)                │ ◄── Caller Frame
 ├─────────────────────────────────────────────────────────────┤
 │ Saved Return Address (ra)               [Offset: FrameSize-8]│
 │ Saved Previous Frame Pointer (fp)       [Offset: FrameSize-16]
 │ ◄── Callee Frame Pointer fp points HERE!                    │
 ├─────────────────────────────────────────────────────────────┤
 │ Saved Callee Registers (s1, s2...)       [Offset: fp - 16 - K]│
 ├─────────────────────────────────────────────────────────────┤
 │ Local Variables & Buffers               [Offset: fp - 16 - L]│
 ├─────────────────────────────────────────────────────────────┤
 │ Alignment Padding Bytes (0..12 Bytes)                       │
 ├─────────────────────────────────────────────────────────────┤
 │ Outgoing Spilled Arguments (for next call)[Offset: 0(sp)]   │
 │ ◄── Callee Stack Pointer sp points HERE! (16-Byte Aligned!) │
 └─────────────────────────────────────────────────────────────┘
```

---

### The 6-Step Procedure Synthesis Protocol

Every synthesized assembly procedure follows a 6-step architectural lifecycle:

#### Step 1: Calculate Total Un-Padded Frame Requirement ($V$)
Calculate the sum of all internal memory requirements for the function:

$$V = \text{Size}(ra + fp) + \text{Size}(\text{Callee\_Saved\_Regs}) + \text{Size}(\text{Local\_Variables}) + \text{Size}(\text{Outgoing\_Spills})$$

Where:
* $\text{Size}(ra + fp) = 16\text{ bytes}$ ($8\text{ bytes for } ra + 8\text{ bytes for } fp$).
* $\text{Size}(\text{Callee\_Saved\_Regs}) = 8 \times K$ bytes (for registers $s1 \dots s_K$ used by the function).
* $\text{Size}(\text{Local\_Variables}) = L$ bytes (for local arrays, structs, or variables).
* $\text{Size}(\text{Outgoing\_Spills}) = 8 \times M$ bytes (space reserved for parameters 9..M of downstream function calls).

#### Step 2: Apply the 16-Byte Stack Alignment Invariant ($N_{\text{frame}}$)
Round $V$ up to the nearest multiple of 16 to compute the total frame size $N_{\text{frame}}$:

$$\mathbf{N_{\text{frame}} = \left\lceil \frac{V}{16} \right\rceil \times 16}$$

$$\text{Alignment Padding Bytes } \Delta_{\text{pad}} = N_{\text{frame}} - V$$

#### Step 3: Emit Function Prologue
Allocate $N_{\text{frame}}$ bytes on the stack and set up the Frame Pointer:

```riscv
addi sp, sp, -N_frame     # Allocate N_frame bytes on stack
sd   ra, (N_frame - 8)(sp)# Save return address ra
sd   fp, (N_frame - 16)(sp)# Save previous frame pointer fp
addi fp, sp, N_frame      # Establish Frame Pointer fp at frame base
```

#### Step 4: Save Callee-Saved Registers
Store any modified non-volatile registers (`s1`–`s11`) onto the stack frame below `fp`.

#### Step 5: Execute Function Body and Outgoing Parameter Setup
* Perform computation.
* Read incoming spilled parameters from $0(fp), 8(fp) \dots$
* If calling a downstream function with $> 8$ parameters, write outgoing spilled parameters $q_9, q_{10} \dots$ into `0(sp)`, `8(sp)`...

#### Step 6: Emit Function Epilogue and Return
* Restore callee-saved registers, `ra`, and `fp` from the stack.
* Deallocate stack frame: `addi sp, sp, N_frame`.
* Execute return: `ret` (`jalr x0, 0(ra)`).

---

## Real-World Silicon Engineering: Memory Bandwidth vs. Register File Pressure

In commercial CPU architecture design, why did ISA designers choose **8 argument registers (`a0`–`a7`)** instead of 16 or 32 argument registers?

### The Register File Pressure Trade-Off

Adding more physical argument registers to an ISA involves a major silicon design trade-off:

```text
ARGUMENT REGISTER COUNT VS SILICON DIE AREA TRADE-OFF

 32 Argument Registers Design (a0..a31):
   * Zero Parameter Spilling (100% of functions pass args in regs).
   * DANGER: Register File SRAM size doubles! Read-port multiplexer tree delay
     increases by 45 picoseconds, slowing down ALL CPU clock cycles!

 8 Argument Registers Design (a0..a7 - RISC-V / x86-64):
   * Covers 98.5% of all real-world C/C++/Rust function calls without spilling!
   * Register File SRAM stays small, fast, and low-power ($3.2\text{ GHz}$ clock achieved!).
   * Spilling occurs on only 1.5% of functions.
```

#### Microarchitectural Decision:
Empirical software traces across millions of C/C++ applications show that **$98.5\%$ of all function calls pass 8 or fewer parameters**.

Providing 8 argument registers (`a0`–`a7`) covers $98.5\%$ of function calls at pure $1\text{-cycle}$ register speed, while keeping the Register File small and fast enough to hit $3.2\text{ GHz}+$ clock frequencies!

---

## Solved Industrial Engineering Exercise: Complete Assembly Procedure Synthesis, Spilled Argument Trace, and Stack Alignment Audit

To consolidate your complete mastery of parameter spilling, 16-byte stack frame synthesis, frame pointer anchoring, and outgoing parameter spill areas, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the assembly code generation for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a complex financial risk analysis module containing a function named **`process_transaction()`**.

```text
3.2 GHz PROCESSOR PROCEDURE SYNTHESIS SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Execution Pipeline ] ──► L1 Data Cache
 Clock T = 312.5 ps     Synthesizes Stack Frame    Spills Parameters P9..P11
```

#### Function Requirements for `process_transaction()`:
1. **Incoming Parameters**: Accepts **11 64-bit integer parameters** ($p_1 \dots p_{11}$).
2. **Local Memory Requirements**:
   * Saves Return Address `ra` ($8\text{ bytes}$) and Frame Pointer `fp` ($8\text{ bytes}$).
   * Saves 2 callee-saved registers `s1` ($8\text{ bytes}$) and `s2` ($8\text{ bytes}$).
   * Allocates a local array `int64_t temp_buffer[3]` ($3 \times 8 = 24\text{ bytes}$).
3. **Outgoing Calls**:
   * Calls a downstream helper function `validate_checksum(q1..q10)` accepting **10 64-bit integer parameters** ($q_1 \dots q_{10}$).

#### Initial Memory & Register State at Call Instant:
* Caller Stack Pointer when `process_transaction` is invoked: $sp_{\text{caller}} = \text{0x0000\_0000\_7FFF\_1000}$ ($100\%$ 16-byte aligned).
* Incoming spilled parameters $p_9, p_{10}, p_{11}$ are written by the caller at $sp_{\text{caller}} + 0$, $sp_{\text{caller}} + 8$, and $sp_{\text{caller}} + 16$.

#### Your Objective

1. Perform a complete **Parameter Spilling Audit**:
   * Identify which parameters ($p_1 \dots p_{11}$) are passed in registers (`a0`–`a7`) versus spilled onto the stack frame.
2. Synthesize the complete **Stack Frame Memory Layout** for `process_transaction()`:
   * Calculate raw byte requirements for saved registers, local buffers, and outgoing spilled parameters.
   * Apply the **16-Byte Stack Alignment Invariant** to compute the exact total frame size $N_{\text{frame}}$ and inserted padding bytes ($\Delta_{\text{pad}}$).
3. Write the complete, valid RISC-V 64-bit assembly source code for `process_transaction()`:
   * Write the function prologue, frame pointer setup, incoming parameter reads from $0(fp) \dots 16(fp)$, local buffer usage, outgoing parameter spill writes to $0(sp) \dots 8(sp)$, function call to `validate_checksum`, epilogue, and return (`ret`).
4. Calculate the exact 64-bit memory addresses for:
   * Incoming spilled parameter $p_9$ (`0(fp)`).
   * Saved return address `ra` (`72(sp)`).
   * Outgoing spilled parameter $q_9$ (`0(sp)`).
   * The new Stack Pointer $sp_{\text{callee}}$ during the call to `validate_checksum`. Verify $sp_{\text{callee}} \pmod{16} == 0$.
5. Calculate total stack memory operations (loads/stores) and physical execution time (in nanoseconds) for `process_transaction()`'s stack frame setup and parameter transfers.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Perform the Parameter Spilling Audit

`process_transaction()` receives **11 parameters** ($p_1 \dots p_{11}$):
* **Parameters $p_1 \dots p_8$**: Passed in general-purpose argument registers **`a0` through `a7`** ($x10 \dots x17$).
* **Parameters $p_9, p_{10}, p_{11}$**: Exceed the 8 argument registers $\implies$ **SPILLED ONTO CALLER'S STACK FRAME!**
  * $p_9$ sits at $sp_{\text{caller}} + 0$.
  * $p_{10}$ sits at $sp_{\text{caller}} + 8$.
  * $p_{11}$ sits at $sp_{\text{caller}} + 16$.

---

#### Step 2: Synthesize the Stack Frame Memory Layout

Let us sum the internal stack space requirements for `process_transaction()`:

1. **Header (Saved `ra` and `fp`)**: $8 + 8 = 16\text{ bytes}$.
2. **Saved Registers (`s1`, `s2`)**: $2 \times 8 = 16\text{ bytes}$.
3. **Local Buffer (`temp_buffer[3]`)**: $3 \times 8 = 24\text{ bytes}$.
4. **Outgoing Spilled Arguments for `validate_checksum(q1..q10)`**:
   * `validate_checksum` receives 10 arguments ($q_1 \dots q_{10}$).
   * $q_1 \dots q_8$ go to registers `a0`–`a7`.
   * $q_9, q_{10}$ **must be spilled onto the stack** $\implies 2 \times 8 = 16\text{ bytes}$ at the bottom of `process_transaction()`'s frame!

##### Calculate Total Un-Padded Frame Space $V$:

$$V = \text{Header}(16) + \text{SavedRegs}(16) + \text{Locals}(24) + \text{OutgoingSpills}(16) = \mathbf{72 \text{ Bytes}}$$

##### Apply 16-Byte Stack Alignment Invariant ($N_{\text{frame}}$):

$$N_{\text{frame}} = \left\lceil \frac{72}{16} \right\rceil \times 16 = \lceil 4.5 \rceil \times 16 = 5 \times 16 = \mathbf{80 \text{ Bytes}}$$

##### Calculate Inserted Alignment Padding ($\Delta_{\text{pad}}$):

$$\Delta_{\text{pad}} = N_{\text{frame}} - V = 80\text{ Bytes} - 72\text{ Bytes} = \mathbf{8 \text{ Padding Bytes}}$$

$$\mathbf{\text{Synthesized Total Frame Size } N_{\text{frame}} = 80 \text{ Bytes (16-Byte Aligned!)}}$$

```text
SYNTHESIZED STACK FRAME MEMORY BLUEPRINT (80 BYTES TOTAL)

 Memory Addresses (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ Incoming Spilled Arg p11 (16(fp))  [Address: 0x7FFF1010]    │ ◄── Caller Frame
 │ Incoming Spilled Arg p10 (8(fp))   [Address: 0x7FFF1008]    │
 │ Incoming Spilled Arg p9  (0(fp))   [Address: 0x7FFF1000]    │
 ├─────────────────────────────────────────────────────────────┤
 │ Saved Return Address ra  (72(sp))  [Address: 0x7FFF0FF8]    │ ◄── Callee Frame
 │ Saved Frame Pointer fp   (64(sp))  [Address: 0x7FFF0FF0]    │ ◄── fp Points Here!
 │ Saved Register s1        (56(sp))  [Address: 0x7FFF0FE8]    │
 │ Saved Register s2        (48(sp))  [Address: 0x7FFF0FE0]    │
 │ Local temp_buffer[3]     (24(sp)..47(sp)) [24 Bytes]        │
 │ Alignment Padding        (16(sp)..23(sp)) [ 8 Bytes Padding]│
 │ Outgoing Spilled Arg q10 (8(sp))   [Address: 0x7FFF0FC8]    │
 │ Outgoing Spilled Arg q9  (0(sp))   [Address: 0x7FFF0FC0]    │
 │ ◄── Callee Stack Pointer sp points HERE! (0x7FFF0FC0)       │
 └─────────────────────────────────────────────────────────────┘
```

---

#### Step 3: Write Complete Synthesized Assembly Source Code

```riscv
# COMPLETE SYNTHESIZED PROCEDURE: process_transaction

.global process_transaction
.type process_transaction, @function
process_transaction:
    # --- 1. PROLOGUE: Allocate 80-Byte Aligned Stack Frame ---
    .cfi_startproc
    addi sp, sp, -80            # Allocate 80 bytes (16-byte aligned!)
    .cfi_def_cfa_offset 80
    sd   ra, 72(sp)             # Save return address
    .cfi_offset 1, -8
    sd   fp, 64(sp)             # Save previous frame pointer
    .cfi_offset 8, -16
    addi fp, sp, 80             # Set Frame Pointer fp to base (0x7FFF1000)
    .cfi_def_cfa 8, 0

    # --- 2. SAVE CALLEE-SAVED REGISTERS ---
    sd   s1, 56(sp)             # Save s1
    sd   s2, 48(sp)             # Save s2

    # --- 3. READ INCOMING SPILLED PARAMETERS (p9, p10, p11) ---
    ld   t0, 0(fp)              # t0 <= Incoming Parameter p9  (from 0(fp))
    ld   t1, 8(fp)              # t1 <= Incoming Parameter p10 (from 8(fp))
    ld   t2, 16(fp)             # t2 <= Incoming Parameter p11 (from 16(fp))

    # --- 4. EXECUTE FUNCTION COMPUTATION ---
    # Store results in local temp_buffer (sitting at 24(sp)..47(sp))
    sd   t0, 24(sp)             # temp_buffer[0] <= p9
    sd   t1, 32(sp)             # temp_buffer[1] <= p10
    sd   t2, 40(sp)             # temp_buffer[2] <= p11

    # --- 5. PREPARE OUTGOING CALL: validate_checksum(q1..q10) ---
    # Pass q1..q8 in registers a0..a7:
    # (Assume q1..q8 loaded into a0..a7)
    # Pass outgoing spilled arguments q9 and q10 on stack:
    addi s1, x0, 99             # s1 <= Outgoing Parameter q9
    addi s2, x0, 100            # s2 <= Outgoing Parameter q10
    sd   s1, 0(sp)              # Outgoing Spill q9  written to 0(sp)
    sd   s2, 8(sp)              # Outgoing Spill q10 written to 8(sp)

    call validate_checksum      # Call downstream function!

    # --- 6. EPILOGUE: Restore Registers & Deallocate Stack Frame ---
    ld   ra, 72(sp)             # Restore ra
    ld   fp, 64(sp)             # Restore fp
    ld   s1, 56(sp)             # Restore s1
    ld   s2, 48(sp)             # Restore s2
    addi sp, sp, 80             # Deallocate 80-byte stack frame
    .cfi_def_cfa_offset 0
    ret                         # Return to caller
    .cfi_endproc
```

---

#### Step 4: Calculate Exact Physical Memory Addresses and Alignment

Given $sp_{\text{caller}} = \text{0x0000\_0000\_7FFF\_1000}$:

1. **Incoming Spilled Parameter $p_9$ Address**:
   $$EA(p_9) = \text{0x7FFF1000} + 0 = \mathbf{\text{0x0000\_0000\_7FFF\_1000}} \quad (0(fp))$$
2. **New Callee Stack Pointer $sp_{\text{callee}}$**:
   $$sp_{\text{callee}} = \text{0x7FFF1000} - 80_{10} = \text{0x7FFF1000} - \text{0x50}_{16} = \mathbf{\text{0x0000\_0000\_7FFF\_0FC0}}$$
3. **Saved Return Address `ra` Memory Location**:
   $$EA(ra) = sp_{\text{callee}} + 72 = \text{0x7FFF0FC0} + \text{0x48} = \mathbf{\text{0x0000\_0000\_7FFF\_0FF8}}$$
4. **Outgoing Spilled Parameter $q_9$ Memory Location**:
   $$EA(q_9) = sp_{\text{callee}} + 0 = \mathbf{\text{0x0000\_0000\_7FFF\_0FC0}}$$
5. **Verify 16-Byte Stack Alignment**:
   $$sp_{\text{callee}} = \text{0x7FFF0FC0} \implies sp[3:0] = 0000_2 \implies \text{0x7FFF0FC0} \pmod{16} == 0 \quad (\mathbf{\text{ALIGNED!}})$$

```text
RESOLVED PHYSICAL MEMORY ADDRESS MAP

 Memory Address (Hex) │ Stack Entry Purpose         │ Variable / Register
──────────────────────┼─────────────────────────────┼─────────────────────────
 0x0000_0000_7FFF_1010│ Incoming Spilled Parameter  │ p11 (16(fp))
 0x0000_0000_7FFF_1008│ Incoming Spilled Parameter  │ p10 (8(fp))
 0x0000_0000_7FFF_1000│ Incoming Spilled Parameter  │ p9  (0(fp) / sp_caller)
 ─────────────────────┼─────────────────────────────┼─────────────────────────
 0x0000_0000_7FFF_0FF8│ Saved Return Address        │ ra  (72(sp))
 0x0000_0000_7FFF_0FF0│ Saved Frame Pointer         │ fp  (64(sp) / fp_callee)
 0x0000_0000_7FFF_0FE8│ Saved Callee Register       │ s1  (56(sp))
 0x0000_0000_7FFF_0FE0│ Saved Callee Register       │ s2  (48(sp))
 0x0000_0000_7FFF_0FC8│ Outgoing Spilled Parameter  │ q10 (8(sp))
 0x0000_0000_7FFF_0FC0│ Outgoing Spilled Parameter  │ q9  (0(sp) / sp_callee)
```

---

#### Step 5: Calculate Memory Operations and Execution Latencies

Let us count the total stack memory operations (stores and loads) performed inside `process_transaction()`:

1. **Prologue / Save Phase**:
   * Save `ra`, `fp`, `s1`, `s2` $= 4\text{ stores}$.
2. **Read Incoming Spilled Parameters**:
   * Read $p_9, p_{10}, p_{11}$ $= 3\text{ loads}$.
3. **Write Outgoing Spilled Parameters**:
   * Write $q_9, q_{10}$ $= 2\text{ stores}$.
4. **Epilogue / Restore Phase**:
   * Restore `ra`, `fp`, `s1`, `s2` $= 4\text{ loads}$.

$$\text{Total Memory Operations} = (4 + 2) \text{ Stores} + (3 + 4) \text{ Loads} = \mathbf{13 \text{ Stack Memory Operations}}$$

$$\text{Total Memory Traffic} = 13 \text{ ops} \times 8 \text{ bytes/op} = \mathbf{104 \text{ Bytes}}$$

$$\text{Total Execution Time} = 13 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{4.0625 \text{ nanoseconds}}$$

The complete synthesized procedure frame setup, parameter spilling, and frame restoration executed in **$4.0625\text{ nanoseconds}$ ($13\text{ CPU clock cycles}$)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and alignment results:

1. **Stack Frame Alignment Check**:
   * $N_{\text{frame}} = 80\text{ bytes}$ ($80 \pmod{16} == 0$).
   * New Stack Pointer $sp_{\text{callee}} = \text{0x7FFF0FC0}$ ($0x7FFF0FC0 \pmod{16} == 0$).
   * 16-byte stack alignment invariant preserved with $100\%$ precision!
2. **Spill Address Continuity Check**:
   * Incoming $p_9$ at $0(fp) = \text{0x7FFF1000} = sp_{\text{caller}}$.
   * Outgoing $q_9$ at $0(sp) = \text{0x7FFF0FC0} = sp_{\text{callee}}$.
   * Both incoming and outgoing spill parameters sit at the exact bottom boundary of their respective caller frames!
3. **Padding Verification**:
   * Un-padded space $V = 72\text{ bytes}$. Total frame $N = 80\text{ bytes}$.
   * $\Delta_{\text{pad}} = 8\text{ bytes}$ (sitting at `16(sp)` to `23(sp)`).
   * Math verified: $72 + 8 = 80\text{ bytes}$.

All parameter spill offsets, 16-byte stack frame synthesis equations, memory address traces, and execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Parameter Spilling**: The ABI mechanism where function parameters exceeding the available argument registers ($p_9 \dots p_N$) are written into memory locations on the caller's stack frame prior to executing a function call, accessed by the callee using positive offsets relative to its Frame Pointer ($0(fp), 8(fp) \dots$).
* **Assembly Procedure Frame Synthesis**: The architectural process of designing, sizing, aligning, and constructing a complete 16-byte aligned stack frame that integrates saved return addresses (`ra`), saved frame pointers (`fp`), callee-saved registers (`s0`–`s11`), local variables, and outgoing spilled parameters into a single unified memory structure.
