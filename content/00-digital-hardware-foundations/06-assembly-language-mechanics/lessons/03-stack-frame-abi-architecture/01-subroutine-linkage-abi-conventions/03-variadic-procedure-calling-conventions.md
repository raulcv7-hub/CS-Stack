content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/01-subroutine-linkage-abi-conventions/03-variadic-procedure-calling-conventions.md
# Variadic Procedure Calling Conventions and Hidden Return Pointer Mechanics

## The Dynamic Argument Boundary Breakdown: Why Fixed Register Passing Fails for Variadic and Large Struct Calls

In modern computer programming, function calls operate under a standardized set of rules established by the Application Binary Interface (ABI). Under standard fixed-argument function calls, the compiler and processor hardware follow a simple, deterministic agreement:
* The first eight integer or pointer arguments are placed into general-purpose argument registers (`a0` through `a7` in RISC-V, or `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9` in x86-64).
* The first eight floating-point arguments are placed into floating-point argument registers (`fa0` through `fa7` in RISC-V, or `xmm0` through `xmm7` in x86-64).
* Any additional arguments beyond eight are spilled onto the call stack frame.
* Small return values (such as an integer or a pointer $\le 16\text{ bytes}$) are returned directly in registers `a0` and `a1` (`RAX` and `RDX` in x86-64).

This fixed register passing protocol works seamlessly when the compiler knows the exact number and data types of every argument at compile time.

However, modern software engineering requires two critical function calling patterns that completely break this fixed register passing agreement:

1. **Large Structure Returns by Value**: A function that constructs and returns a 64-byte or 128-byte data structure by value (such as a $4 \times 4$ transformation matrix `struct Matrix4x4` or a 16-element array object).
2. **Variadic Functions (`printf`, `snprintf`, `scanf`)**: Functions that accept an arbitrary, unknown number of arguments of dynamic, runtime-determined data types (such as `printf("%d %f %s %ld", int_a, float_b, string_c, long_d)`).

Now, let us examine the physical hardware friction introduced by these two advanced function calling patterns:

```text
THE DYNAMIC ARGUMENT BOUNDARY BREAKDOWN

 Problem 1: Large Struct Returned by Value (64 Bytes Total)
 Callee Subroutine returns a 64-Byte Matrix4x4 structure.
 ┌─────────────────────────────────────────────────────────────┐
 │ 64-Byte Payload CANNOT fit in 2 Return Registers (a0, a1)!  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Where does Callee write 64 Bytes?
 (Writing directly to Caller Stack without a pointer corrupts stack frames!)

 Problem 2: Variadic Functions (printf with Dynamic Parameter Types)
 Caller passes: 1 String Pointer, 2 Integers, 1 Double Float.
 ┌─────────────────────────────────────────────────────────────┐
 │ Callee DOES NOT KNOW parameter types at compile time!       │
 │ Which registers hold integers? Which registers hold floats? │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ How does Callee unpack arguments?
 (Mismatched register reads produce corrupted garbage data!)
```

Trace the physical hardware breakdown in both scenarios:

* **In Large Structure Returns**: The callee subroutine generates a 64-byte matrix result. But the CPU's register file provides only two return registers (`a0` and `a1`), which can hold a maximum of **$16\text{ bytes}$** ($2 \times 8\text{ bytes}$). The 64-byte structure physically cannot fit inside the return registers! 
  
  If the callee attempts to write 64 bytes directly onto the caller's stack frame without a designated pointer, it will overwrite the caller's local variables, destroy the saved return address (`ra`), and crash the processor.

* **In Variadic Function Calls**: The caller passes a string, two integers, and a double-precision float to `printf`. Under standard ABI rules, integers go to `a0` and `a1`, while the float goes to floating-point register `fa0`. 
  
  However, the callee function `printf()` was compiled years ago as a generic library function! At compile time, `printf()`'s machine code has **no idea** how many arguments will be passed or whether `fa0` contains a valid float or uninitialized garbage! 
  
  If `printf()` attempts to read `fa0` when the caller passed the float in `a2`, `printf()` reads the wrong physical register, outputting corrupted garbage text to the screen!

How do computer architectures and compiler toolchains resolve these dynamic argument boundaries without corrupting stack memory or reading wrong registers?

To handle large structure returns and dynamic variadic functions safely, assembly systems engineering relies on **Hidden Return Pointers** and **Variadic Calling Conventions**.

---

## The Catering Order Form and the Hidden Storage Table: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of hidden return pointers, variadic argument save areas, and vector register count passing before inspecting assembly stack frame layouts and register dumping loops, let us consider an everyday analogy: **The Restaurant Catering Order**.

Imagine a restaurant waiter (**The CPU Caller Function `main()`**) taking orders for a master kitchen chef (**The Callee Subroutine `create_matrix()` / `printf()`**).

```text
THE CATERING ORDER FORM METAPHOR

 Waiter Hands (Registers a0..a7)              Kitchen Counter (Main Memory)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Plate 1 (a0) | Plate 2 (a1)│               │ Large 500-Pound Cake      │
 └───────────────────────────┘                └───────────────────────────┘
   (Small Integer Arguments)                    (Large Struct Passed by Value)
```

The waiter carries meals on plates using their two hands (**Return Registers `a0` and `a1`**). Each hand can hold a standard 8-inch plate ($8\text{ bytes}$).

Let us observe how the waiter and chef handle two difficult customer orders:

---

### Problem 1: The 500-Pound Wedding Cake (Large Struct Returned by Value)

A customer orders a $4 \times 4$ tier wedding cake weighing 500 pounds (**A 64-Byte Structure Returned by Value**).

The chef bakes the cake inside the kitchen. When the cake is ready, the chef must hand it back to the waiter.

* **The Physical Limitation**: The waiter's two hands (`a0` and `a1`) can hold only 8-inch plates ($16\text{ bytes}$ total). The 500-pound cake **cannot physically fit in the waiter's hands**!
* **The Hidden Return Pointer Solution**:
  1. BEFORE ordering the cake, the waiter sets up a heavy wooden table in the dining room (**Allocates a 64-Byte Memory Buffer on the Caller's Stack Frame**).
  2. The waiter writes the address of this wooden table on a small slip of paper and places it in their **first hand (`a0` / `rdi`)**: *"Chef, write/build the cake directly on THIS table address!"* (**The Hidden Return Pointer**).
  3. The waiter shifts all explicit customer order notes to their remaining hands (`a1`, `a2`, `a3`...).
  4. The chef bakes the cake and writes its 64-byte layers **directly onto the dining room table address specified by `a0`**!
  5. The waiter returns holding `a0` (the table address). The 500-pound cake was delivered smoothly without breaking the waiter's hands!

```text
THE HIDDEN RETURN POINTER SOLUTION

 Waiter allocates Table in Dining Room (Caller Stack Buffer: 64 Bytes)
 Waiter places Table Address in First Hand (Reg a0 <= 0x7FFF0040)
                               │
                               ▼
 Chef receives Table Address in a0 ──► Bakes 500-pound cake DIRECTLY on Table!
                                       (No 8-inch plates broken!)
```

---

### Problem 2: The Mystery Buffet Order (Variadic Function `printf`)

A customer orders a mystery buffet tray containing a dynamic, unpredictable combination of items: 2 mini-burgers, 3 sodas, and 1 slice of pie (**Variadic Function Call `printf("%d %d %f", a, b, c)`)**.

The chef in the kitchen does not know in advance how many items were ordered or whether they are food or drinks!

* **The Variadic Calling Convention Solution**:
  1. **Standardized Hand Loading**: To prevent confusion, the waiter places all food items and drink items into **general-purpose plates (`a0`–`a7`) in strict order**, rather than splitting drinks onto separate ice trays!
  2. **The Vector Count Tag (`%al` in x86-64)**: In x86-64, the waiter writes a number on a small chalk tag attached to their apron (**Register `%al`**): *"I used 1 ice tray for drinks!"*
  3. **The Kitchen Dump Tray (Argument Save Area)**: Upon receiving the order, the chef immediately dumps all incoming plates (`a0`–`a7`) and ice trays onto a single, continuous **Kitchen Dump Tray (The Argument Save Area on the Stack)**.
  4. The chef can now read all items sequentially from the Kitchen Dump Tray as a single, continuous array using a simple pointer, without ever making a mistake!

```text
KITCHEN DUMP TRAY (VARIADIC ARGUMENT SAVE AREA)

 Waiter hands over plates a0..a7 ──► Chef dumps ALL plates onto Dump Tray
                                     ┌─────────────────────────────────┐
                                     │ Item 0 │ Item 1 │ Item 2 │ ...  │
                                     └─────────────────────────────────┘
                                      ▲
                                      └── Chef reads items sequentially!
```

This catering workflow is the exact physical analogue of **Variadic Calling Conventions and Hidden Return Pointers**:
* The waiter is **The Caller Function (`main()`)**.
* The chef is **The Callee Subroutine (`create_matrix()` / `printf()`)**.
* The waiter's hands are **Argument Registers (`a0`–`a7` / `rdi`, `rsi`...)**.
* The 500-pound cake is a **Large Structure Returned by Value**.
* The table address slip in `a0` is **The Hidden Return Pointer**.
* The chalk tag `%al` is **The Vector Register Count Indicator**.
* Dumping plates onto the counter is **Creating the Variadic Argument Save Area**.

---

## Primitive 1: Hidden Return Pointer Mechanics for Large Structures

Now that we possess a clear intuitive mental model of hidden return pointers and dining room tables, let us examine the formal, rigorous engineering mechanics of **Hidden Return Pointers**.

When a programming language function returns a structure by value (for example, `struct Matrix4x4 create_matrix()`), the compiler and hardware must determine how to transport the structure's bytes from the callee back to the caller.

The Application Binary Interface (ABI) partitions structure returns into two size categories:

```text
ABI STRUCTURE RETURN SIZE CLASSIFICATION

 Structure Size Category │ Hardware Transport Mechanism │ Register Usage
─────────────────────────┼──────────────────────────────┼───────────────────────────────
 Small Struct (<= 16B)   │ Returned in Registers        │ Reg a0 (lower 8B), a1 (upper 8B)
 Large Struct (> 16B)    │ Hidden Return Pointer        │ Reg a0 holds Stack Buffer Addr
```

---

### The Hidden Return Pointer Protocol Steps

For any structure exceeding 16 bytes ($> 128\text{ bits}$), the ABI enforces **The Hidden Return Pointer Protocol**:

```text
HIDDEN RETURN POINTER PROTOCOL STEP-BY-STEP

 CALLER SIDE (main):
 1. Allocate 64B Buffer on Caller Stack Frame (0(sp))
 2. Write Buffer Address into First Argument Register: a0 <= 0(sp)
 3. Shift Explicit Parameters: explicit_param_1 -> a1, explicit_param_2 -> a2 ...
 4. Execute `call create_matrix`
                               │
                               ▼
 CALLEE SIDE (create_matrix):
 5. Receive Hidden Buffer Address in a0!
 6. Construct 64-byte matrix result inside local registers.
 7. Store 64-byte result DIRECTLY into memory at 0(a0), 8(a0), 16(a0) ...
 8. Return buffer address in a0 (a0 <= 0(sp)).
 9. Execute `ret`
```

Let us trace the physical hardware steps in detail:

#### Step 1: Caller Stack Buffer Allocation
Before calling the subroutine, the caller function (`main()`) allocates a temporary memory buffer on its own stack frame equal to the byte size of the structure (e.g., $64\text{ bytes}$ for a $4 \times 4$ float matrix):

$$\text{Caller Stack Allocation: } \mathtt{addi \ sp, \ sp, \ -64}$$

#### Step 2: Implicit Register Injection into `a0` / `rdi`
The caller writes the 64-bit memory address of this newly allocated stack buffer directly into the **first argument register**:
* **RISC-V ABI**: Register **`a0`** ($x10$).
* **x86-64 System V ABI**: Register **`rdi`**.

$$\mathbf{\text{RegisterFile}[a0] \Leftarrow \text{Caller\_Stack\_Buffer\_Address}}$$

#### Step 3: Explicit Argument Shift
Because argument register `a0` is now occupied by the Hidden Return Pointer, **all explicit parameters passed to the function are shifted right by one register position**!
* Explicit Argument 1 moves from `a0` $\to$ **`a1`**.
* Explicit Argument 2 moves from `a1` $\to$ **`a2`**.
* Explicit Argument 3 moves from `a2` $\to$ **`a3`**, and so on.

#### Step 4: Callee Direct Memory Stores
The callee subroutine (`create_matrix()`) receives the hidden stack buffer address in register `a0`.

As the callee constructs the 64-byte matrix result, it writes the 64 bytes **directly into the caller's stack memory** using base-displacement store instructions relative to `a0`:

```riscv
# CALLEE WRITES 64-BYTE MATRIX DIRECTLY INTO CALLER'S STACK BUFFER
sd  x11, 0(a0)         # Store Matrix Row 0 (Bytes 0..7)   at 0(a0)
sd  x12, 8(a0)         # Store Matrix Row 1 (Bytes 8..15)  at 8(a0)
sd  x13, 16(a0)        # Store Matrix Row 2 (Bytes 16..23) at 16(a0)
sd  x14, 24(a0)        # Store Matrix Row 3 (Bytes 24..31) at 24(a0)
# ... Writes remaining 32 bytes ...
```

#### Step 5: Function Return
The callee leaves the buffer address in `a0` and executes `ret`.

When execution returns to the caller, the caller finds its 64-byte structure **already populated inside its own stack frame at `0(sp)`**, ready for immediate use!

---

## Primitive 2: Variadic Calling Conventions (`va_list`) and Register Dumping

Now let us examine the second core primitive: **Variadic Calling Conventions** and **Argument Register Dumping**.

A **Variadic Function** is a subroutine that can take a variable number of arguments whose types and counts are determined dynamically at runtime rather than at compile time:

```c
// C VARIADIC FUNCTION CALL EXAMPLES
printf("Status: %d", status);                       // 1 Format String, 1 Int
printf("Co-ords: %d, %d, %f", x, y, temp);          // 1 Format String, 2 Ints, 1 Float
printf("Matrix: %f %f %f %f", m0, m1, m2, m3);      // 1 Format String, 4 Floats
```

---

### The Variadic Register Assignment Rules (RISC-V vs. x86-64)

Because a variadic function's machine code is compiled long before the function is called, the callee cannot know which registers hold integer arguments versus floating-point arguments.

To eliminate ambiguity, hardware ABIs enforce specialized variadic argument packing rules:

#### 1. RISC-V Variadic ABI Rule (General-Purpose Register Coercion)
In the RISC-V C ABI, all variadic arguments passed in the unnamed (`...`) portion of the argument list **MUST BE PASSED IN GENERAL-PURPOSE REGISTERS (`a0`–`a7`) OR SPILLED ONTO THE STACK**!

* Floating-point arguments passed as fixed parameters (before `...`) use floating-point registers (`fa0`–`fa7`).
* Floating-point arguments passed inside the variadic `...` portion are **coerced into general-purpose registers (`a0`–`a7`)**!

```text
RISC-V VARIADIC ARGUMENT REGISTER MAPPING

 Function Signature: printf(const char *fmt, ...)
 Call Site         : printf("Temp: %f", float_val)

 Register Mapping:
  * Register a0 <= Address of format string "Temp: %f"  (Fixed Parameter)
  * Register a1 <= Bit representation of float_val!    (Variadic Parameter coerced to a1!)
  * Register fa0 <= UNUSED for variadic portion!
```

By forcing all variadic parameters into general-purpose registers (`a0`–`a7`), the callee `printf()` needs to inspect **only one register file (`a0`–`a7`)** to retrieve all arguments!

---

#### 2. x86-64 System V Variadic ABI Rule & The `%al` Vector Count Indicator

In the x86-64 System V ABI (Linux / macOS), floating-point and vector arguments are passed in 128-bit vector registers (`XMM0` through `XMM7`).

When calling a variadic function in x86-64, how does the callee know how many `XMM` vector registers were used by the caller?

The ABI enforces **The `%al` Vector Count Indicator Rule**:

> **The `%al` Register Rule**: Before executing a `call` instruction to a variadic function, the caller MUST write the **exact number of vector/floating-point registers used (0 to 8)** into register **`%al`** (the lower 8 bits of register `RAX`)!

```x86asm
; x86-64 CALLER PREPARING VARIADIC CALL: printf("Temp: %f", float_val)
mov   rdi, offset fmt_string  ; Argument 1: Format string in RDI
movss xmm0, float_val         ; Argument 2: Float value in XMM0
mov   al, 1                   ; %al <= 1 (Informs callee that EXACTLY 1 XMM reg was used!)
call  printf
```

```text
THE %al VECTOR REGISTER COUNT INDICATOR

 Register %al = 0 ──► Callee SKIPS saving XMM registers to stack! (Saves 128 Bytes!)
 Register %al = 1 ──► Callee saves ONLY XMM0 to stack!
 Register %al = 8 ──► Callee saves XMM0..XMM7 to stack!
```

#### Why the `%al` Register Saves Massive Performance:
When the variadic callee (`printf()`) begins executing, its prologue inspects `%al`:
* If `%al == 0` (no floating-point arguments passed), `printf()` **skips saving `XMM0`–`XMM7` onto the stack**, saving 128 bytes of stack memory writes and 16 execution clock cycles!

---

### The Argument Save Area (Dumping Registers for `va_list`)

Inside C/C++ libraries, variadic functions access their arguments using the standard `va_start()`, `va_arg()`, and `va_end()` macros.

How does `va_arg()` retrieve parameters when some arguments were passed in registers (`a0`–`a7`) and others were spilled onto the stack?

To allow `va_arg()` to traverse arguments as a continuous array, the variadic function's prologue executes an **Argument Register Dump**:

```riscv
# VARIADIC FUNCTION PROLOGUE: DUMPING ARGUMENT REGISTERS TO STACK

.global printf
printf:
    # 1. Allocate Argument Save Area on Callee Stack Frame
    addi sp, sp, -64          # Allocate 64 bytes (8 registers x 8 bytes)

    # 2. DUMP all incoming argument registers to stack in contiguous order!
    sd   a0, 0(sp)            # Slot 0 <= Format string pointer
    sd   a1, 8(sp)            # Slot 1 <= Variadic Arg 1
    sd   a2, 16(sp)           # Slot 2 <= Variadic Arg 2
    sd   a3, 24(sp)           # Slot 3 <= Variadic Arg 3
    sd   a4, 32(sp)           # Slot 4 <= Variadic Arg 4
    sd   a5, 40(sp)           # Slot 5 <= Variadic Arg 5
    sd   a6, 48(sp)           # Slot 6 <= Variadic Arg 6
    sd   a7, 56(sp)           # Slot 7 <= Variadic Arg 7

    # 3. Initialize va_list pointer to point to Slot 1 (0(sp) + 8)
    addi x20, sp, 8           # va_list pointer = &Argument_Save_Area[1]
```

```text
VARIADIC ARGUMENT SAVE AREA ON STACK FRAME

 Callee Stack Frame (Contiguous Argument Array)
 ┌───────────────────────────┬───────────────────────────┬───┐
 │ Slot 0: Arg a0 (Format)   │ Slot 1: Arg a1 (VarArg 1) │...│
 └───────────────────────────┴───────────────────────────┴───┘
                              ▲
                              └── va_list pointer starts here!
                                  va_arg() simply adds +8 to advance!
```

Look at what the Argument Register Dump achieves:
* By dumping `a0` through `a7` into a contiguous memory block on the stack, the variadic function converts discrete hardware registers into a **continuous 1D array in RAM**!
* The `va_arg()` macro simply increments a 64-bit pointer by $+8\text{ bytes}$ (`va_list += 8`) to fetch the next argument, achieving $100\%$ reliable argument traversal!

---

## Real-World Silicon Engineering: Memory Traffic and C++ Return Value Optimization (RVO)

In commercial software development, understanding hidden return pointers and variadic overheads enables software engineers and compilers to apply high-level optimizations:

### 1. The Cost of Large Struct Returns vs. Return Value Optimization (RVO)

Returning large structures by value via hidden return pointers requires executing multiple memory stores in the callee and multiple memory loads in the caller:

$$\text{Memory Operations} = \frac{\text{Struct Size}}{8} \text{ Stores in Callee} \ + \ \frac{\text{Struct Size}}{8} \text{ Loads in Caller}$$

For a 64-byte matrix structure:
$$\text{Memory Operations} = 8 \text{ Stores} + 8 \text{ Loads} = \mathbf{16 \text{ Memory Accesses }} (\approx 16 \text{ Clock Cycles})$$

#### C++ Return Value Optimization (RVO):
Modern C++17 and Rust compilers eliminate these 16 memory operations through **Return Value Optimization (RVO / Named RVO)**:
* Instead of creating a local matrix inside the callee's stack frame and copying it to the caller's buffer at return time, **the compiler constructs the matrix directly inside the caller's buffer from the very first instruction**!
* The 16 copying memory operations are reduced to **$0$ redundant copies**, running at maximum execution speed!

---

### 2. Passing Large Structs by Reference (`const Struct*`)

To prevent hidden return pointer and parameter spilling overheads, experienced C/C++ developers pass structures larger than 16 bytes by **const reference or pointer**:

```c
// POOR PERFORMANCE: Passes 64-byte struct by value (Spills across registers & stack!)
void process_matrix(struct Matrix4x4 m);

// OPTIMAL PERFORMANCE: Passes 8-byte pointer in register a0 (0 Memory Spills!)
void process_matrix(const struct Matrix4x4 *m);
```

Passing a 64-byte struct by pointer passes a single 64-bit address in register `a0`, reducing parameter passing overhead by **$87.5\%$**!

---

## Solved Industrial Engineering Exercise: Large Struct Return Analysis, Hidden Pointer Assembly Generation, and Variadic Stack Dump Audit

To consolidate your complete mastery of hidden return pointers, variadic argument save areas, vector register count passing (`%al`), and large structure ABI returns, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the function call performance and stack memory traffic for a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is executing a 3D graphics pipeline module. Function `main()` executes two function calls:

1. **Call 1**: `struct Matrix4x4 create_projection_matrix(float fov, float aspect)`
   * `struct Matrix4x4` contains 16 32-bit floats ($64\text{ bytes}$ total size).
   * Explicit parameters: `fov` ($32\text{-bit float}$) and `aspect` ($32\text{-bit float}$).
2. **Call 2**: `printf("Matrix ID: %d, Volts: %f", node_id, voltage)`
   * Variadic call passing format string pointer, 32-bit integer `node_id`, and 64-bit double float `voltage`.

```text
3.2 GHz PROCESSOR GRAPHICS PIPELINE CALL SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Execution Pipeline ] ──► L1 Data Cache
 Clock T = 312.5 ps     Hidden Return Pointer     DUMP Area on Stack
```

#### Memory System Specifications:
* `main()` Stack Pointer at Call 1 = `0x0000_0000_7FFF_0000`.
* L1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Each 64-bit store (`sd`) or load (`ld`) to L1 stack memory takes $1\text{ clock cycle}$ ($0.3125\text{ ns}$).

#### Your Objective

1. For **Call 1 (`create_projection_matrix`)**:
   * Calculate the 64-byte stack buffer allocation on `main()`'s stack frame.
   * Trace the register assignments for the Hidden Return Pointer (`a0`) and explicit parameters (`fov`, `aspect`).
   * Write the complete RISC-V 64-bit assembly sequence for `create_projection_matrix()` that uses `a0` to store the 64-byte matrix into `main()`'s stack frame.
2. For **Call 2 (`printf`)**:
   * Trace register assignments for the format string, `node_id`, and `voltage` under RISC-V variadic ABI rules.
   * Write the `printf()` assembly prologue that allocates and populates the **Argument Save Area** on the stack.
3. Calculate the total memory stack operations (stores/loads) and physical execution time (in nanoseconds) generated by both function calls.
4. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Trace Call 1 (`create_projection_matrix`) Register Assignments & Hidden Pointer

`struct Matrix4x4` size = $64\text{ bytes} > 16\text{ bytes} \implies$ **MUST USE HIDDEN RETURN POINTER!**

##### 1. Caller Stack Allocation (`main()`):
`main()` allocates $64\text{ bytes}$ on its stack frame at `0(sp)` (address `0x7FFF0000 - 64 = 0x7FFF0000` assuming `sp` already allocated):

$$\text{Hidden Return Pointer Address} = \text{0x0000\_0000\_7FFF\_0000}$$

##### 2. Register Assignment with Argument Shift:
* **Register `a0` ($x10$)**: Receives the **Hidden Return Pointer** (`0x0000_0000_7FFF_0000`).
* **Register `fa0` ($f10$)**: Receives explicit float parameter 1 (`fov`).
* **Register `fa1` ($f11$)**: Receives explicit float parameter 2 (`aspect`).

```text
CALL 1 REGISTER ASSIGNMENT MAP

 Register Name │ Register Role               │ Value Assigned
───────────────┼─────────────────────────────┼───────────────────────────────────
 Register a0   │ Hidden Return Pointer       │ 0x0000_0000_7FFF_0000 (Stack Addr)
 Register fa0  │ Explicit Argument 1 (fov)   │ Float fov
 Register fa1  │ Explicit Argument 2 (aspect)│ Float aspect
```

---

#### Step 2: Write Assembly for `create_projection_matrix` (Callee Side)

The callee receives the hidden buffer address in `a0` and writes the 16 32-bit floats ($64\text{ bytes}$) directly into `main()`'s stack frame:

```riscv
# CALLEE IMPLEMENTATION: create_projection_matrix

.global create_projection_matrix
create_projection_matrix:
    # --- Matrix Calculation in Floating-Point Registers f0..f15 ---
    # ... (Calculates 16 float values) ...

    # --- Write 64-Byte Matrix Payload Directly to Hidden Buffer in 0(a0) ---
    fsw  f0,  0(a0)           # Store float 0  at offset 0
    fsw  f1,  4(a0)           # Store float 1  at offset 4
    fsw  f2,  8(a0)           # Store float 2  at offset 8
    fsw  f3,  12(a0)          # Store float 3  at offset 12
    fsw  f4,  16(a0)          # Store float 4  at offset 16
    fsw  f5,  20(a0)          # Store float 5  at offset 20
    fsw  f6,  24(a0)          # Store float 6  at offset 24
    fsw  f7,  28(a0)          # Store float 7  at offset 28
    fsw  f8,  32(a0)          # Store float 8  at offset 32
    fsw  f9,  36(a0)          # Store float 9  at offset 36
    fsw  f10, 40(a0)          # Store float 10 at offset 40
    fsw  f11, 44(a0)          # Store float 11 at offset 44
    fsw  f12, 48(a0)          # Store float 12 at offset 48
    fsw  f13, 52(a0)          # Store float 13 at offset 52
    fsw  f14, 56(a0)          # Store float 14 at offset 56
    fsw  f15, 60(a0)          # Store float 15 at offset 60

    # Return hidden buffer address in a0 (a0 is already 0x7FFF0000!)
    ret                       # Return to main()
```

##### Memory Operations for Call 1:
* Callee stores 16 32-bit floats ($16\text{ stores}$).
* Caller reads floats from stack as needed.

---

#### Step 3: Trace Call 2 (`printf`) Register Assignments & Argument Save Area

Call 2: `printf("Matrix ID: %d, Volts: %f", node_id, voltage)`.
* Format string pointer = `fmt_ptr`.
* `node_id` = 32-bit int ($42_{10}$).
* `voltage` = 64-bit double float ($12.5_{10}$).

##### 1. RISC-V Variadic Register Coercion Rules:
Under RISC-V variadic ABI, variadic parameters (`node_id` and `voltage`) are coerced into **general-purpose integer registers (`a0`–`a7`)**:
* **Register `a0` ($x10$)**: Format string pointer `fmt_ptr`.
* **Register `a1` ($x11$)**: `node_id` ($42_{10}$).
* **Register `a2` ($x12$)**: 64-bit double float `voltage` ($12.5_{10}$) **coerced into integer register `a2`**!

##### 2. Write `printf` Assembly Prologue (Argument Register Dump):

```riscv
# VARIADIC CALLEE PROLOGUE: DUMPING ARGUMENTS TO STACK

.global printf
printf:
    # 1. Allocate 64-byte Argument Save Area on Callee Stack
    addi sp, sp, -64          # Allocate 64 bytes (8 regs x 8 bytes)

    # 2. Dump all incoming general-purpose argument registers to stack
    sd   a0, 0(sp)            # Offset 0  <= Format String Pointer
    sd   a1, 8(sp)            # Offset 8  <= Variadic Arg 1 (node_id = 42)
    sd   a2, 16(sp)           # Offset 16 <= Variadic Arg 2 (voltage = 12.5)
    sd   a3, 24(sp)           # Offset 24 <= Un-used Arg 3
    sd   a4, 32(sp)           # Offset 32 <= Un-used Arg 4
    sd   a5, 40(sp)           # Offset 40 <= Un-used Arg 5
    sd   a6, 48(sp)           # Offset 48 <= Un-used Arg 6
    sd   a7, 56(sp)           # Offset 56 <= Un-used Arg 7

    # 3. Initialize va_list pointer to point to Slot 1 (0(sp) + 8)
    addi x20, sp, 8           # va_list = &Argument_Save_Area[1] (Points to a1!)
```

---

#### Step 4: Calculate Memory Operations and Physical Execution Time

Let us count total memory operations and physical execution time for both function calls:

##### 1. Call 1 (`create_projection_matrix`):
* 16 32-bit float stores (`fsw`) to `0(a0) ... 60(a0)` = $16\text{ memory stores}$.
* Execution time = $16\text{ stores} \times 1\text{ cycle/store} = 16\text{ clock cycles}$.

$$T_{\text{Call1}} = 16 \times 0.3125\text{ ns} = \mathbf{5.000 \text{ nanoseconds}}$$

##### 2. Call 2 (`printf` Prologue Dump):
* 8 64-bit double-word stores (`sd`) to `0(sp) ... 56(sp)` = $8\text{ memory stores}$.
* Execution time = $8\text{ stores} \times 1\text{ cycle/store} = 8\text{ clock cycles}$.

$$T_{\text{Call2\_prologue}} = 8 \times 0.3125\text{ ns} = \mathbf{2.500 \text{ nanoseconds}}$$

##### 3. Combined Memory Operations & Total Execution Delay:

$$\text{Total Memory Operations} = 16 + 8 = \mathbf{24 \text{ Memory Store Operations}}$$

$$\text{Total Stack Memory Traffic} = (16 \times 4\text{ B}) + (8 \times 8\text{ B}) = 64\text{ B} + 64\text{ B} = \mathbf{128 \text{ Bytes Total Traffic}}$$

$$T_{\text{total\_delay}} = 5.000\text{ ns} + 2.500\text{ ns} = \mathbf{7.500 \text{ nanoseconds}} \quad (24\text{ CPU Clock Cycles})$$

```text
CALL SUBSYSTEM MEMORY TRAFFIC SUMMARY

 Function Call          │ Memory Stores Executed │ Memory Traffic (Bytes) │ Execution Time (ns)
────────────────────────┼────────────────────────┼────────────────────────┼─────────────────────
 Call 1 (Matrix 4x4)    │ 16 Stores (fsw)        │ 64 Bytes               │ 5.000 ns (16 Cycles)
 Call 2 (printf Dump)   │ 8 Stores  (sd)         │ 64 Bytes               │ 2.500 ns (8 Cycles)
────────────────────────┴────────────────────────┴────────────────────────┴─────────────────────
 TOTALS                 │ 24 Memory Operations   │ 128 Bytes Total        │ 7.500 ns (24 Cycles)
```

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and ABI convention results:

1. **Hidden Return Pointer Verification**:
   * `struct Matrix4x4` size = $64\text{ bytes} > 16\text{ bytes}$.
   * Hidden return pointer was correctly placed in `a0`, shifting explicit parameters to `fa0` and `fa1`.
   * Callee wrote 64 bytes directly into caller's stack frame at `0(a0)` through `60(a0)`. Verified!
2. **Variadic Register Coercion Verification**:
   * `voltage` (float) was coerced into integer register `a2` ($x12$), complying $100\%$ with RISC-V variadic ABI rules.
   * `printf` dumped `a0` through `a7` into a contiguous 64-byte array on the stack, allowing `va_arg()` to advance by $+8\text{ bytes}$ sequentially.
3. **Timing and Memory Traffic Verification**:
   * Total stack memory traffic = $128\text{ bytes}$.
   * At $3.2\text{ GHz}$, 24 memory store operations complete in $24 \times 0.3125\text{ ns} = 7.500\text{ nanoseconds}$, verifying $100\%$ timing closure.

All hidden return pointer offset derivations, variadic register coercion maps, argument save area stack dumps, and physical execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Hidden Return Pointer**: An implicit pointer passed in the first argument register (`a0` / `rdi`) when calling a function that returns a structure larger than 16 bytes by value, commanding the callee to write its multi-word result directly into a buffer pre-allocated on the caller's stack frame.
* **Variadic Call Convention**: The ABI protocol governing functions with dynamic parameter lists (`printf`), where variadic arguments are coerced into general-purpose registers (`a0`–`a7`) or stack slots and dumped into a contiguous **Argument Save Area** on the callee's stack frame to enable sequential array traversal via `va_arg()`.
