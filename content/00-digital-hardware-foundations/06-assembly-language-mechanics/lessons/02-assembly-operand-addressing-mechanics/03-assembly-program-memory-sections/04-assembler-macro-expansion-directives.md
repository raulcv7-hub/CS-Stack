content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/02-assembly-operand-addressing-mechanics/03-assembly-program-memory-sections/04-assembler-macro-expansion-directives.md
# Assembler Macro Expansion Directives and Automated Code Repetition Mechanics

## The Duplication Maintenance Crisis: Why Manual Copy-Pasting in Assembly Invites Fatal Bugs

In low-level assembly language programming, software developers and firmware engineers frequently encounter tasks that require repeating near-identical instruction blocks or data structures multiple times throughout a program. 

Consider common low-level programming tasks:
* Saving 32 general-purpose registers onto the stack during an exception or context switch (`sd x1, 0(sp)`, `sd x2, 8(sp)`, `sd x3, 16(sp)`...).
* Generating a 64-entry hardware Interrupt Vector Table where every entry is a jump instruction targeting a specific handler subroutine.
* Constructing large mathematical lookup tables (such as sine wave tables or CRC checksum matrices) in the `.rodata` section.
* Writing polling loops that check memory status flags across multiple hardware channels.

Suppose an assembly developer attempts to write these repetitive structures by manually copying and pasting raw assembly code lines dozens or hundreds of times in a source file.

This manual copy-paste strategy triggers a severe software maintenance crisis: **The Duplication Maintenance Crisis**.

```text
THE COPY-PASTE DUPLICATION MAINTENANCE CRISIS

 Manual Copy-Pasting (100 Duplicate Lines)
 ┌─────────────────────────────────────────────────────────────┐
 │ Line  1: sd x1,  0(sp)                                      │
 │ Line  2: sd x2,  8(sp)                                      │
 │  :                                                          │
 │ Line 24: sd x24, 184(sp)  ◄── TYPO! (Wrote x24 instead of x25)│
 │ Line 25: sd x25, 192(sp)                                    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 FATAL SILENT STATE CORRUPTION! Register x25 never saved!
 (Manual copy-pasting introduces hidden typos and maintenance bugs!)
```

Let us trace the physical and logical failures that occur when code is duplicated manually:

1. **High Error & Typo Rate**: When a developer manually copies, pastes, and edits 32 register save lines, human fatigue inevitably leads to hidden typos—such as accidentally writing `sd x24, 184(sp)` twice and skipping register `x25` entirely! Register `x25` is never saved, causing silent register corruption when the function returns.
2. **Duplicate Symbol Collision Errors**: If a copied assembly block contains an internal branch jump label (such as `retry_loop:`), copying and pasting the block three times in the same source file generates three separate labels named `retry_loop:`. The assembler halts with a fatal **Duplicate Symbol Definition Error**!
3. **Rigid Code Maintenance**: If the stack frame alignment rule changes from 8-byte offsets to 16-byte offsets, or if the register save order must be altered, the developer is forced to locate and manually edit hundreds of scattered instruction lines throughout the project, risking new bugs on every edit.

How can assembly language tools automate repetitive code generation, parameterize instruction templates, and generate unique jump labels automatically without copying a single line by hand?

To eliminate manual copy-paste errors and automate code generation, assembly language pre-processors use **Assembler Macros (`.macro` / `.endm`)**, **Repetition Directives (`.rept` / `.endr` / `.irp`)**, and **Local Symbol Isolation (`local` / `\()`)**.

---

## The Industrial Stencil Press and the Rotating Date Stamp: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of assembler macros, text expansion, repetition directives, and local symbol isolation before analyzing pre-processor parsing trees and register-save generation loops, let us consider an everyday analogy: **The Legal Document Printing Press**.

Imagine a law firm (**The Assembly Source File**) preparing 100 identical corporate contracts (**Assembly Instruction Blocks**) for an international business deal.

```text
THE LEGAL DOCUMENT PRINTING PRESS METAPHOR

 Manual Handwriting (Copy-Paste Assembly)     Industrial Stencil Stamp (.macro)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Write 100 Pages by Hand   │                │ Single Master Rubber Stamp│
 │ Typos! Signature Collisions│                │ Stamps 100 Perfect Pages  │
 └───────────────────────────┘                └───────────────────────────┘
   (Manual Copy-Paste Errors)                   (Assembler Macro Expansion)
```

Each contract requires a 5-line legal disclaimer clause, a client account ID, and an internal signature line label (**Branch Jump Label**).

Let us observe two different methods the law firm can use to prepare these 100 contracts:

---

### Method A: Manual Handwriting (Copy-Paste Assembly)

A clerk handwrites all 100 contracts line-by-line using a pen:
1. By page 45, the clerk gets tired and writes "Account #12" instead of "Account #45" (**Register Index Typo**)!
2. On every single contract, the clerk writes the signature line label: **`"SIGN_HERE:"`**.
3. When the filing auditor receives the stack of 100 contracts, they reject the entire batch:
   
   $$\text{"ERROR! You have 100 different signature lines named 'SIGN_HERE'! Which contract does 'SIGN_HERE' refer to?"}$$

4. The filing system halts with a **Duplicate Symbol Error**!

---

### Method B: The Master Stencil Stamp with Automatic Counter (`.macro` + `.rept` + `local`)

The office manager buys an **Industrial Printing Press** with an **Automatic Number Wheel**:

1. **Master Stencil (`.macro`)**: The 5-line legal clause is engraved **ONCE** onto a master rubber stamp template called `STAMP_CONTRACT(client_id)`.
2. **Automated Repetition (`.rept 100`)**: The manager turns the machine wheel to stamp out 100 contracts automatically in 1 second!
3. **Unique Signature Labels (`local` / `\()`)**: Every time the rubber stamp hits a page, an attached counter automatically clicks, generating a unique label: `SIGN_HERE_001`, `SIGN_HERE_002`, `SIGN_HERE_003`...

```text
AUTOMATED STENCIL STAMP WITH UNIQUE LABELS

 Master Stencil Template: STAMP_CONTRACT(client_id)
 ┌─────────────────────────────────────────────────────────────┐
 │ Line 1: Standard Legal Disclaimer Clause                   │
 │ Line 2: Account ID: \client_id                              │
 │ Line 3: SIGN_HERE_\():                                      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Stamped 100 Times Automatically!
 Contract Page 1  ──► Account #1  | Label: SIGN_HERE_001:
 Contract Page 2  ──► Account #2  | Label: SIGN_HERE_002:
 Contract Page 3  ──► Account #3  | Label: SIGN_HERE_003:
 (Zero handwriting typos! Zero duplicate symbol collisions!)
```

Look at what Method B achieved:
* The 5-line legal clause was written **ONLY ONCE** on the master stamp template.
* Zero handwriting typos occurred across 100 pages.
* Every single page received a **unique signature label** (`SIGN_HERE_001`, `SIGN_HERE_002`), eliminating symbol collisions!
* If the legal text changes tomorrow, the manager modifies the master rubber stamp **ONCE**, and all future contracts are updated instantly!

This industrial printing press is the exact physical analogue of **Assembler Macro Expansion and Repetition Directives**:
* The clerk handwriting pages is **Manual Copy-Pasting in Assembly**.
* The master rubber stamp template is an **Assembler Macro (`.macro`)**.
* The automatic number wheel is a **Repetition Directive (`.rept`)**.
* The automatic counter generating unique labels is a **Local Macro Symbol (`local` / `\()`)**.
* Stamping 100 pages in 1 second is **Textual Pre-Processor Macro Expansion**.

---

## Primitive 1: Assembler Macro Expansion (`.macro` / `.endm`)

Now that we possess a clear intuitive mental model of master rubber stamps and automated printing presses, let us examine the formal, rigorous engineering mechanics of **Assembler Macros**.

> **An Assembler Macro** is a named, parameterized code template defined in assembly source code that commands the assembler's pre-processor to expand and substitute the template's instruction block inline at every invocation site before assembling machine code.

```text
ASSEMBLER MACRO PRE-PROCESSOR TEXT EXPANSION FLOW

 Assembly Source File (.s)                     Expanded Assembly Stream (Memory)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ .macro PUSH_TWO r1, r2    │                 │ addi sp, sp, -16          │
 │   addi sp, sp, -16        │                 │ sd   x10, 0(sp)           │
 │   sd   \r1, 0(sp)         │ ───────────────►│ sd   x11, 8(sp)           │
 │   sd   \r2, 8(sp)         │                 ├───────────────────────────┤
 │ .endm                     │                 │ addi sp, sp, -16          │
 │                           │                 │ sd   x12, 0(sp)           │
 │ PUSH_TWO x10, x11         │ ───────────────►│ sd   x13, 8(sp)           │
 │ PUSH_TWO x12, x13         │                 └───────────────────────────┘
 └───────────────────────────┘
  (Macro calls expanded inline textually BEFORE machine code generation!)
```

---

### Syntax and Parameter Substitution Mechanics

In the GNU Assembler (`as`), a macro is defined using the **`.macro`** and **`.endm`** directives:

```riscv
# MACRO DEFINITION SYNTAX (GNU ASSEMBLER)

.macro MACRO_NAME parameter_1, parameter_2, parameter_3
    # Assembly instruction template using \parameter_1, \parameter_2
.endm
```

#### The Parameter Substitution Operator (`\parameter_name`)
Inside the body of a macro template, formal parameters are referenced by placing a backslash (`\`) in front of the parameter name:

1. When the assembler encounters `PUSH_TWO x10, x11`, the pre-processor intercepts the call.
2. It assigns formal parameter `\r1 = x10` and formal parameter `\r2 = x11`.
3. It performs **textual string substitution**, replacing every instance of `\r1` with `x10` and `\r2` with `x11` **before assembling machine opcodes**!

---

### Macro Inlining vs. Subroutine Calls (`call` / `ret`)

A crucial architectural distinction separates **Assembler Macro Inlining** from **Subroutine Function Calls (`call` / `ret`)**:

```text
MACRO INLINING VS SUBROUTINE CALL COMPARISON

 Macro Inlining (.macro):
 Invocation Site 1 ──► [ Inlined Instruction Block ]  (0 Jump Penalty, Larger Binary)
 Invocation Site 2 ──► [ Inlined Instruction Block ]

 Subroutine Call (call / ret):
 Invocation Site 1 ──► jal ra, function ──┐
                                          ├──► [ Shared Subroutine Code ] ──► ret
 Invocation Site 2 ──► jal ra, function ──┘    (Saves Binary Space, Pays Jump Delay)
```

```text
MACRO VS SUBROUTINE PERFORMANCE COMPARISON MATRIX

 Architectural Property │ Assembler Macro (.macro)      │ Subroutine Call (call / ret)
────────────────────────┼───────────────────────────────┼─────────────────────────────────────────────
 Code Placement          │ Inlined Inline at Call Site   │ Shared Single Memory Target Location
 Execution Latency      │ FASTEST (0 Jump/Return Delay) │ Pays Jump (jal) + Return (ret) Penalties
 Stack Memory Overhead  │ ZERO Stack Allocation Needed  │ Must Save Return Address (ra) on Stack
 Binary Code Size       │ Expands with every call site  │ Fixed Size (Shared by all callers)
 Best Usage Domain      │ Short 2-5 Instruction Blocks  │ Large Complex Functions (>10 Instructions)
```

#### Architectural Decision Rule:
* **Use Macros (`.macro`)** for short 2-to-5 instruction sequences (like register pushes, bit manipulation masks, or CSR reads) where eliminating jump latency is worth a tiny increase in binary code size.
* **Use Subroutines (`call`)** for large functions where saving binary code space is more important than paying a 2-cycle jump overhead.

---

## Primitive 2: Automated Repetition Directives (`.rept` / `.endr` / `.irp`)

Now let us examine the second core primitive: **Automated Repetition Directives**.

While a named macro (`.macro`) is ideal for code blocks invoked at different locations throughout a file, what if a developer needs to repeat an instruction block 50 times sequentially in **one single location** (for example, filling an L1 cache line or generating a vector table)?

Creating a named macro and calling it 50 times in a row is still tedious.

To automate sequential code duplication, assembly language provides **Repetition Directives**: **`.rept`**, **`.endr`**, and **`.irp`**.

```text
REPETITION DIRECTIVE TYPES

                 REPETITION DIRECTIVES
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
 FIXED COUNT REPETITION (.rept N)     ITERATIVE PARAMETER REPETITION (.irp)
 Duplicates code block N times        Iterates over a list of items
 sequentially in place.              (e.g., list of registers).
```

---

### 1. Fixed-Count Repetition (`.rept N` / `.endr`)

* **Syntax**:
  ```riscv
  .rept N
      # Assembly instructions to duplicate N times
  .endr
  ```
* **Mechanics**: The pre-processor duplicates the enclosed assembly code block exactly $N$ times sequentially at the current memory location counter.

#### Real-World Example: NOP Padding for Cache Line Alignment
```riscv
.text
.align 6                  # Align to 64-byte boundary
.rept 8
    addi x0, x0, 0        # Emits 8 consecutive NOP instructions (32 bytes padding)
.endr
```

The assembler expands `.rept 8` into eight consecutive `addi x0, x0, 0` instructions in memory, requiring only 3 lines of source code!

---

### 2. Iterative Parameter Repetition (`.irp`)

* **Syntax**:
  ```riscv
  .irp parameter_variable, item_1, item_2, item_3, ...
      # Assembly template using \parameter_variable
  .endr
  ```
* **Mechanics**: The pre-processor loops through the provided item list, assigning each item to `\parameter_variable` and expanding the code block once per item.

#### Real-World Example: Register Block Clearing
Suppose an exception handler needs to clear registers `x5`, `x6`, `x7`, and `x8` to zero on startup:

```riscv
# AUTOMATED REGISTER CLEARING USING .IRP

.irp reg, x5, x6, x7, x8
    addi \reg, x0, 0     # Clears register \reg
.endr
```

```text
.IRP PRE-PROCESSOR EXPANSION TRACE

 Input Directive:
 .irp reg, x5, x6, x7, x8
     addi \reg, x0, 0
 .endr

 Expanded Output Code Stream:
 addi x5, x0, 0          # Pass 1: \reg = x5
 addi x6, x0, 0          # Pass 2: \reg = x6
 addi x7, x0, 0          # Pass 3: \reg = x7
 addi x8, x0, 0          # Pass 4: \reg = x8
```

Look at the power of `.irp`:
The pre-processor expands the 3-line `.irp` block into four clean assembly instructions automatically, eliminating manual register index typos!

---

## Primitive 3: Local Symbol Isolation (`local` / `\()`)

Now let us address the most dangerous hazard in macro expansion: **The Duplicate Symbol Collision Hazard**.

### The Duplicate Symbol Hazard Explained

Suppose an assembly developer writes a macro that implements a polling loop waiting for a memory flag to become non-zero (`WAIT_FOR_FLAG`):

```riscv
# NAIVE MACRO DEFINITION (CONTAINING A JUMP LABEL)

.macro WAIT_FOR_FLAG flag_ptr
check_loop:              # DANGER! Local jump label inside macro!
    lw   x10, 0(\flag_ptr)
    beqz x10, check_loop # Branch back if flag is zero
.endm
```

Look at what happens if the developer calls `WAIT_FOR_FLAG` **twice** in the same assembly source file:

```riscv
# TWO MACRO CALLS IN THE SAME SOURCE FILE
WAIT_FOR_FLAG x20        # Call 1: Expands check_loop:
# ...
WAIT_FOR_FLAG x21        # Call 2: Expands check_loop: AGAIN!
```

```text
DUPLICATE SYMBOL COLLISION HAZARD

 Expanded Assembly Output:
 check_loop:             # First expansion of label check_loop
     lw   x10, 0(x20)
     beqz x10, check_loop
 # ...
 check_loop:             # SECOND EXPANSION OF LABEL check_loop!
     lw   x10, 0(x21)    # ASSEMBLER ERROR: Symbol 'check_loop' is already defined!
     beqz x10, check_loop
```

The assembler halts compilation with a fatal error: `Error: symbol 'check_loop' is already defined`!

Because the label name `check_loop:` was hardcoded inside the macro, invoking the macro multiple times generated duplicate labels in the same file.

---

### The Solution: The `local` Directive and Parameter Concatenation (`\()`)

To eliminate duplicate symbol collisions, the assembler provides the **`local` Directive**:

> **The `local` Directive** commands the assembler pre-processor to treat a specified label name inside a macro as a local symbol, automatically generating a unique, un-ambiguous internal symbol name (e.g., `.L0001`, `.L0002`, `.L0003`) on every expansion pass.

```riscv
# REPAIRED MACRO USING LOCAL SYMBOL ISOLATION

.macro WAIT_FOR_FLAG flag_ptr
    local check_loop     # ISOLATES 'check_loop' AS A UNIQUE LOCAL SYMBOL!
check_loop:
    lw   x10, 0(\flag_ptr)
    beqz x10, check_loop
.endm
```

Trace how the assembler expands `WAIT_FOR_FLAG` twice using `local`:

```text
LOCAL SYMBOL EXPANSION RESOLUTION

 Expansion 1 (WAIT_FOR_FLAG x20):
 .L0001:                 # Assembler generated unique label .L0001!
     lw   x10, 0(x20)
     beqz x10, .L0001

 Expansion 2 (WAIT_FOR_FLAG x21):
 .L0002:                 # Assembler generated unique label .L0002!
     lw   x10, 0(x21)
     beqz x10, .L0002
 (Zero symbol collisions! Code compiles and executes perfectly!)
```

#### The Macro Parameter Concatenation Operator (`\()`)
When appending a macro parameter directly to another text string (for example, generating custom register names or custom label suffixes), the pre-processor uses **`\()`** to terminate the parameter name cleanly:

```riscv
.macro CREATE_LABEL index
    handler_\()\index:   # Concatenates "handler_" with parameter \index
        ret
.endm

CREATE_LABEL 5           # Expands to: handler_5: ret
```

---

## Real-World Silicon Engineering: Automated Interrupt Vector Tables and Context Save Boilerplates

In commercial software development, macro expansion and repetition directives are essential for building bare-metal embedded systems and operating system kernels.

### 1. Automated Interrupt Vector Table Construction

In bare-metal microcontrollers (such as ARM Cortex-M or RISC-V MCUs), the hardware **Interrupt Vector Table** requires an array of 32 or 64 uniform jump instructions aligned to a 256-byte boundary:

```riscv
# AUTOMATED 32-ENTRY TRAP VECTOR TABLE SYNTHESIS

.section .vectors, "ax"
.align 8                         # Align to 256-byte boundary (2^8 = 256)

.global vector_table
vector_table:
    .set i, 0
    .rept 32
        j trap_handler_\()\i     # Synthesizes: j trap_handler_0, j trap_handler_1 ...
        .set i, i + 1            # Increment loop counter
    .endr
```

Look at what this 7-line assembly block achieves:
* It automatically generates **32 unique jump instructions** (`j trap_handler_0` through `j trap_handler_31`).
* It occupies exactly $32 \times 4\text{ bytes} = 128\text{ bytes}$ of physical memory space.
* Zero manual copy-pasting was required! If the table size expands to 64 entries tomorrow, changing `.rept 32` to `.rept 64` updates the entire hardware vector table in 1 second!

---

### 2. Automated Context Save/Restore Boilerplates

When an operating system kernel executes a context switch or services an exception, it must save all general-purpose registers onto the stack.

Using `.irp`, the entire 31-register context save block is synthesized in 3 lines of clean assembly:

```riscv
# AUTOMATED CONTEXT SAVE BOILERPLATE

.macro SAVE_CONTEXT
    addi sp, sp, -248            # Allocate 31 slots x 8 bytes = 248 bytes on stack
    .set offset, 0
    .irp reg, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15, x16, x17, x18, x19, x20, x21, x22, x23, x24, x25, x26, x27, x28, x29, x30, x31
        sd \reg, \offset\()(sp)  # Synthesizes: sd x1, 0(sp), sd x2, 8(sp) ...
        .set offset, offset + 8
    .endr
.endm
```

The pre-processor generates **31 consecutive `sd` store instructions** with perfectly calculated 8-byte stack offsets (`0(sp)`, `8(sp)`, `16(sp)` $\dots$ `240(sp)`), guaranteeing zero offset calculation errors!

---

## Solved Industrial Engineering Exercise: Macro Expansion, Local Symbol Isolation, and Vector Table Synthesis

To consolidate your complete mastery of assembler macros, `.rept` / `.irp` repetition loops, `local` symbol isolation, and vector table synthesis, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior firmware microarchitect designing the bare-metal startup and exception handling subsystem for a $3.2\text{ GHz}$ 64-bit RISC-V processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor requires two hardware assembly components:
1. A parameterized macro **`SAVE_QUAD_REGISTERS`** that takes four register names, allocates 32 bytes on the stack frame, and saves the four registers sequentially.
2. A polling macro **`POLL_LOCK`** that polls a memory address until it becomes zero (`0`), using `local` symbol isolation so it can be called multiple times in the same source file without label collisions.
3. An automated **16-Entry Hardware Interrupt Vector Table** generated using `.rept`.

```text
3.2 GHz PROCESSOR FIRMWARE MACRO SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Assembler Pre-Processor ] ──► [ Output Binary Image ]
 Clock T = 312.5 ps     Expands Macros & Repetitions    16-Entry Vector Table
```

#### Memory System Specifications:
* L1 Instruction Cache Line Size = $64\text{ bytes}$.
* Instruction execution speed = $1\text{ instruction per clock cycle}$ ($312.5\text{ ps}$).

#### Your Objective

1. Write the complete, valid RISC-V assembly definition for **`SAVE_QUAD_REGISTERS`** using `.macro` and parameter substitution (`\r1, \r2, \r3, \r4`).
2. Write the complete, valid RISC-V assembly definition for **`POLL_LOCK`** using `.macro`, `local poll_loop`, `lw`, and `bnez`.
3. Show the exact pre-processor expanded assembly output when `POLL_LOCK x20` and `POLL_LOCK x21` are invoked sequentially in the same source file, demonstrating how the assembler generates unique internal symbols (`.L0001`, `.L0002`) to prevent duplicate symbol errors.
4. Write the `.rept 16` repetition sequence synthesizing the 16-entry hardware interrupt vector table starting at label `hardware_vector_table:`, aligned to a 256-byte boundary (`.align 8`).
5. Calculate the exact code memory footprint (in bytes) of the generated 16-entry vector table and the execution time (in nanoseconds) required to execute one `POLL_LOCK` iteration on a local L1 cache hit.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Define the `SAVE_QUAD_REGISTERS` Macro

```riscv
# 1. PARAMETERIZED REGISTER SAVE MACRO DEFINITION

.macro SAVE_QUAD_REGISTERS r1, r2, r3, r4
    addi sp, sp, -32            # Allocate 32 bytes on stack (4 regs x 8 bytes)
    sd   \r1, 0(sp)             # Store first register at offset 0
    sd   \r2, 8(sp)             # Store second register at offset 8
    sd   \r3, 16(sp)            # Store third register at offset 16
    sd   \r4, 24(sp)            # Store fourth register at offset 24
.endm
```

##### Pre-Processor Expansion Verification:
If invoked as `SAVE_QUAD_REGISTERS x5, x6, x7, x8`:
* `\r1` $\to$ `x5`, `\r2` $\to$ `x6`, `\r3` $\to$ `x7`, `\r4` $\to$ `x8`.
* Generates 5 instructions ($20\text{ bytes}$ of machine code).

---

#### Step 2: Define the `POLL_LOCK` Macro with Local Symbol Isolation

```riscv
# 2. POLLING MACRO WITH LOCAL SYMBOL ISOLATION

.macro POLL_LOCK lock_ptr_reg
    local poll_loop             # ISOLATES 'poll_loop' AS A UNIQUE LOCAL SYMBOL!
poll_loop:
    lw   x10, 0(\lock_ptr_reg)  # Read lock variable from memory address
    bnez x10, poll_loop         # If lock != 0 (busy), retry loop!
.endm
```

---

#### Step 3: Trace Sequential Expansion of `POLL_LOCK` (Symbol Resolution)

When the source code contains two consecutive invocations:

```riscv
POLL_LOCK x20                   # First call: Polls address in x20
# ... intermediate code ...
POLL_LOCK x21                   # Second call: Polls address in x21
```

The assembler pre-processor expands the text stream into:

```riscv
# PRE-PROCESSOR EXPANSION OUTPUT

# --- First Invocation Expansion (POLL_LOCK x20) ---
.L0001:                         # Unique local symbol .L0001 generated!
    lw   x10, 0(x20)
    bnez x10, .L0001

# ... intermediate code ...

# --- Second Invocation Expansion (POLL_LOCK x21) ---
.L0002:                         # Unique local symbol .L0002 generated!
    lw   x10, 0(x21)
    bnez x10, .L0002
```

```text
PRE-PROCESSOR LOCAL SYMBOL RESOLUTION SUMMARY

 Invocation Site 1 (POLL_LOCK x20) ──► Generates Label .L0001: | bnez x10, .L0001
 Invocation Site 2 (POLL_LOCK x21) ──► Generates Label .L0002: | bnez x10, .L0002
 (Zero duplicate symbol collisions! Both loops compile and execute cleanly!)
```

##### Result:
Because `local poll_loop` was declared, the pre-processor generated `.L0001` and `.L0002`. Zero duplicate symbol collisions occurred!

---

#### Step 4: Synthesize the 16-Entry Interrupt Vector Table via `.rept`

```riscv
# 3. AUTOMATED 16-ENTRY HARDWARE INTERRUPT VECTOR TABLE

.section .vectors, "ax"          # Allocates in executable vector section
.align 8                         # Aligns to 256-byte boundary (2^8 = 256)

.global hardware_vector_table
hardware_vector_table:
    .set vec_idx, 0
    .rept 16
        j interrupt_handler_\()\vec_idx # Generates: j interrupt_handler_0 ... 15
        .set vec_idx, vec_idx + 1       # Increment loop index
    .endr
```

##### Pre-Processor Expansion Output:
The `.rept 16` block generates 16 consecutive jump instructions in memory:
* `j interrupt_handler_0`
* `j interrupt_handler_1`
* `j interrupt_handler_2`
* $\dots$
* `j interrupt_handler_15`

---

#### Step 5: Calculate Code Memory Footprints and Execution Latencies

##### 1. Vector Table Memory Footprint Calculation:
Each jump instruction (`j`) is a 32-bit RISC-V instruction ($4\text{ bytes}$).
Number of table entries = 16.

$$\text{Vector Table Size} = 16 \text{ entries} \times 4 \text{ bytes/entry} = \mathbf{64 \text{ Bytes}}$$

The entire 16-entry vector table occupies **exactly 64 bytes** (fitting $100\%$ inside a single L1 Instruction Cache line!).

##### 2. `POLL_LOCK` Loop Execution Latency (1 Iteration on L1 Hit):
Each iteration of `POLL_LOCK` executes:
* 1 `lw` instruction ($1\text{ cycle}$ L1D hit).
* 1 `bnez` instruction ($1\text{ cycle}$ branch evaluation).

$$\text{Cycles per Iteration} = 1 + 1 = \mathbf{2 \text{ Clock Cycles}}$$

$$\text{Physical Time per Iteration} = 2 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{0.625 \text{ nanoseconds}}$$

Each polling check executes in **$0.625\text{ nanoseconds}$ ($2\text{ clock cycles}$)**!

```text
EXECUTION AND FOOTPRINT SUMMARY TABLE

 Component Name             │ Instruction Count │ Memory Footprint │ Execution Latency
────────────────────────────┼───────────────────┼──────────────────┼───────────────────
 SAVE_QUAD_REGISTERS Macro  │ 5 Instructions    │ 20 Bytes         │ 5 Clock Cycles
 POLL_LOCK Loop Iteration   │ 2 Instructions    │ 8 Bytes          │ 2 Cycles (0.625ns)
 16-Entry Vector Table      │ 16 Instructions   │ 64 Bytes         │ 1 L1I Cache Line!
```

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and pre-processor expansion results:

1. **Vector Table Size Verification**:
   * 16 jump instructions $\times 4\text{ bytes} = 64\text{ bytes}$.
   * Alignment `.align 8` $\implies 2^8 = 256\text{ bytes}$ boundary alignment ($64 \pmod{256} == 0$).
   * Fits perfectly inside a single 64-byte L1I cache line!
2. **Local Symbol Uniqueness Verification**:
   * Expansion 1 used `.L0001`. Expansion 2 used `.L0002`.
   * Proves $100\%$ isolation against duplicate symbol definition errors.
3. **Stack Alignment Verification in `SAVE_QUAD_REGISTERS`**:
   * Allocated stack space = $32\text{ bytes}$.
   * $32 \pmod{16} == 0 \implies$ Preserves 16-byte stack alignment invariant!

All macro parameter substitutions, repetition loop expansions, local symbol label isolations, vector table byte footprints, and execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Assembler Macro (`.macro`)**: A named, parameterized text template that commands the assembler's pre-processor to perform string parameter substitution (`\param`) and expand instruction blocks inline at every call site before machine code generation, eliminating manual copy-paste errors and jump penalties.
* **Repetition Directive (`.rept`)**: A pre-processor loop directive (`.rept N` / `.endr` or `.irp`) that automatically duplicates an assembly instruction block $N$ times sequentially at the current memory location, enabling automated synthesis of hardware vector tables and context-save boilerplates.
