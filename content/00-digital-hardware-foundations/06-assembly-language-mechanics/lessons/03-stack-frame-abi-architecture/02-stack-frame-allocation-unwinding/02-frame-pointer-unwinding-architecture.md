content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/02-stack-frame-allocation-unwinding/02-frame-pointer-unwinding-architecture.md
# Frame Pointer Unwinding Architecture and Call Frame Information Mechanics

## The Disoriented Stack Backtrace Collapse: Why Dynamic Stack Allocations Break Debuggers

In modern software systems, when a computer program suffers a runtime exception (such as a C++ `throw`/`catch`, a Rust `panic`, or an operating system segmentation fault), or when a performance profiler (such as `perf` or `gdb`) pauses execution to analyze CPU bottlenecks, the system must inspect memory to answer a fundamental question: **Which sequence of function calls brought execution to this exact instruction?**

Reconstructing this active call sequence—a process known as **Stack Unwinding** or **Stack Backtracing**—requires walking backward through the memory frames stored on the call stack.

Under static, fixed-size stack frames, every function allocates a known, constant number of bytes from the Stack Pointer (`sp`) upon entry. The distance between the Stack Pointer and the saved Return Address (`ra`) is constant across the entire function.

However, modern software engineering requires functions to allocate dynamic memory on the stack at runtime whose size is unknown at compile time—such as C `alloca()` allocations, variable-length arrays (`int32_t buffer[n]`), or dynamic stack frame adjustments.

Now, consider the physical microarchitectural failure that occurs when a debugger or exception unwinder attempts to walk the stack of a function that uses dynamic stack allocations:

```text
THE DYNAMIC STACK ALLOCATION UNWINDING COLLAPSE

 Stack Memory (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ main() Stack Frame                                          │
 ├─────────────────────────────────────────────────────────────┤
 │ process_data() Stack Frame Entry (Fixed 32 Bytes Allocated) │
 │   [ Saved Return Address ra ] (Sitting at offset +24)       │
 ├─────────────────────────────────────────────────────────────┤
 │ DYNAMIC ALLOCATION: alloca(N) executed at runtime!          │
 │ Stack Pointer sp shifts downward by UNKNOWN runtime N bytes!│
 ├─────────────────────────────────────────────────────────────┤
 │ Current Stack Pointer sp = 0x7FFF0E00 (Fluctuates!)         │
 └─────────────────────────────────────────────────────────────┘
  ▲
  └── Where is saved ra? Is it sp + 24? sp + 156? sp + 512?
      (STACK POINTER CANNOT BE USED TO LOCATE SAVED REGISTERS!)
```

Trace the physical backtrace failure step-by-step:
1. Function `process_data()` allocates a standard 32-byte stack frame. It saves the return address `ra` at offset `24(sp)`.
2. Inside the function body, `process_data()` reads a user input parameter $N$ and executes a dynamic stack allocation (`alloca(N)`), subtracting $N$ bytes from `sp` (`sp <= sp - N`).
3. The Stack Pointer `sp` moves downward by an unpredictable, runtime-determined distance!
4. A crash occurs! The debugger inspects the Stack Pointer `sp`.
5. **THE UNWINDING COLLAPSE**: The debugger attempts to locate the saved Return Address `ra` by reading `24(sp)`.
6. Because `sp` shifted down by $N$ bytes, `24(sp)` no longer points to `ra`! It points to **uninitialized garbage data inside the middle of the dynamic `alloca()` buffer**!

The debugger reads garbage data, loses its location on the stack, and fails to generate a backtrace. The C++ exception handler cannot locate the `catch` block, and the operating system halts with an un-handled crash!

If the Stack Pointer `sp` moves dynamically during function execution, how can a debugger, profiler, or exception handler reliably navigate backward through the stack frame chain to locate caller functions?

To enable $100\%$ reliable stack unwinding across dynamic stack allocations, computer architectures and compiler toolchains employ **Frame Pointer (`fp` / `s0`) Linked Chains** and **DWARF Call Frame Information (`.cfi_*`) Metadata Directives**.

---

## The Cavern Diver's Steel Rings and Topo-Map: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of frame pointer linked chains, dynamic stack allocations, and DWARF Call Frame Information metadata before analyzing stack frame layouts, assembly unwinding loops, and `.eh_frame` binary tables, let us consider an everyday analogy: **The Cavern Diver and the Emergency Rescue Team**.

Imagine a deep-sea diver (**The CPU Execution Pipeline**) exploring a deep underwater cavern system composed of multiple connected rooms (**The Call Stack Frames**).

```text
THE CAVERN DIVER STACK UNWINDING METAPHOR

 Surface Entrance (Top of Stack / main)
 ┌─────────────────────────────────────────────────────────────┐
 │ Room 0: main() Base Entry                                   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Diver descends deeper
 ┌─────────────────────────────────────────────────────────────┐
 │ Room 1: process_data() Base Entry                           │
 │ Fixed Steel Ring Installed Here! (Frame Pointer fp)        │
 ├─────────────────────────────────────────────────────────────┤
 │ Dynamic Equipment Bags Unpacked Here (alloca / VLA)         │
 │ Bottom Anchor Rope (Stack Pointer sp moves dynamically!)   │
 └─────────────────────────────────────────────────────────────┘
```

The diver lowers their main anchor rope (**The Stack Pointer `sp`**) deeper into the cavern as they enter new rooms.

Let us observe two physical problems faced by the emergency rescue team (**The Debugger / Exception Unwinder**) if the diver gets trapped by a cave-in:

---

### Scenario A: Dynamic Equipment Unpacking (Unwinding Collapse without `fp`)

The diver enters Room 1. The entrance depth of Room 1 was 100 feet.
1. Inside Room 1, the diver dynamically unpacks 3 extra equipment bags (`alloca()`), lowering the bottom end of their rope (`sp`) down to **180 feet**.
2. A cave-in occurs! The rescue team at the surface needs to climb down the rope and locate the entrance to Room 0 (the caller function).
3. The rescue team assumes every room is 30 feet tall: *"Room 0's door must be 30 feet above the bottom of the rope!"*
4. The rescue team climbs up 30 feet from the bottom (`sp + 30`), arriving at depth $180 - 30 = \mathbf{150 \text{ feet}}$.
5. **RESCUE FAILURE**: Depth 150 feet is inside a solid rock wall! The rescue team is lost, and the diver cannot be rescued!

---

### Scenario B: The Fixed Steel Ring Anchor (The Frame Pointer `fp` / `s0`)

To solve this problem, the diver installs a **Fixed Steel Ring (Frame Pointer `fp`)** at the exact entrance of Room 1 *before* unpacking any equipment bags:

```text
STEEL RING FRAME POINTER LINKAGE (FRAME POINTER UNWINDING)

 Room 0 Entrance ──► [ Steel Ring 0 (fp_previous) ]
                            ▲
                            │ Saved Frame Pointer Link (0(fp))
                            │
 Room 1 Entrance ──► [ Steel Ring 1 (fp_current) ]
                     │
                     ▼ Dynamic Equipment Unpacked Below fp!
                     [ Bottom Rope End sp ] (Moves dynamically!)
```

Trace how Scenario B enables instant rescue:
1. Upon entering Room 1, the diver bolts a steel ring (**Frame Pointer `fp`**) to the wall at depth 100 feet.
2. The diver connects a thin steel guide wire from Steel Ring 1 back to **Steel Ring 0** at the entrance of Room 0 (**Saved Frame Pointer Link**).
3. Now, the diver can unpack as many dynamic equipment bags as they want! The bottom rope end (`sp`) moves down to 180 feet, 250 feet, 300 feet...
4. When a cave-in occurs, the rescue team ignores the bottom rope end (`sp`).
5. The rescue team climbs directly to **Steel Ring 1 (`fp`)**, reads the connected guide wire, and walks straight up to Steel Ring 0!

---

### Scenario C: The Topographical Map (DWARF Call Frame Information `.cfi_*`)

What if the diver doesn't want to carry heavy steel rings (**Frame Pointer Elimination for Speed**)?

The diver writes a precise **Topographical Map (.cfi_* Directives)** in a waterproof journal before entering the cave:
* *"At depth instruction step 1, Room 0's door is 16 feet above the rope end."*
* *"At depth instruction step 2, after unpacking Bag A, Room 0's door is 48 feet above the rope end."*

The rescue team reads the topographical map, checks the diver's exact instruction step ($PC$), calculates the exact distance from `sp`, and climbs straight out without needing physical steel rings!

This cavern system is the exact physical analogue of **Frame Pointer Unwinding and Call Frame Information**:
* The cavern rooms are **Call Stack Frames**.
* The bottom rope end is the **Stack Pointer (`sp` / `RSP`)**.
* Unpacking dynamic equipment bags is **Dynamic Stack Allocation (`alloca()` / VLAs)**.
* Fixed steel rings are **Frame Pointers (`fp` / `s0` / `RBP`)**.
* The connected guide wire between rings is the **Saved Frame Pointer Linked Chain**.
* The topographical map is **DWARF Call Frame Information (`.cfi_def_cfa`, `.cfi_offset`)**.

---

## Primitive 1: The Frame Pointer (`fp` / `s0`) Linked Chain Architecture

Now that we possess an intuitive mental model of fixed steel rings and guide wires, let us examine the formal engineering mechanics of **The Frame Pointer (`fp` / `s0`)**.

In standard RISC-V ABI conventions, register **$x8$** is assigned the dedicated role of **Frame Pointer (`fp` / `s0`)** (corresponding to `RBP` in x86-64).

> **The Frame Pointer (`fp` / `s0` / $x8$)** is an architectural control register reserved by ABI conventions to hold a fixed base memory address pointing to the start of the current function's stack frame. Unlike the Stack Pointer `sp` (which moves dynamically during execution), the Frame Pointer `fp` remains $100\%$ stationary throughout the entire execution of a function.

```text
FRAME POINTER LINKED CHAIN MEMORY LAYOUT

 Stack Memory (High Addresses -> Low Addresses)
 ┌─────────────────────────────────────────────────────────────┐
 │ main() Stack Frame                                          │
 │   [ Local Variables ... ]                                   │
 │   [ Saved Previous Frame Pointer (fp_main = 0) ] ◄─────┐   │
 ├────────────────────────────────────────────────────────┼────┤
 │ process_data() Stack Frame                             │    │
 │   [ Saved Return Address ra (0x00401024) ]             │    │
 │   [ Saved Frame Pointer fp_main ] ─────────────────────┘    │
 │   ◄── Current Frame Pointer fp points HERE! (Fixed Base)    │
 │   [ ... Dynamic alloca() allocations ... ]                  │
 │   ◄── Current Stack Pointer sp points HERE! (Fluctuates!)   │
 └─────────────────────────────────────────────────────────────┘
```

---

### The Standard Frame Pointer Stack Layout

When a function utilizes a Frame Pointer, its function prologue establishes a standardized 16-byte memory header at the base of its stack frame:

$$\text{Memory}[fp + 0] = \mathbf{fp_{\text{caller}} \quad (\text{Address of Previous Function's Frame Pointer})}$$

$$\text{Memory}[fp + 8] = \mathbf{ra_{\text{caller}} \quad (\text{Return Address to Previous Function})}$$

Look at the structure formed across memory:
Every active function's stack frame contains a 64-bit pointer ($fp_{\text{caller}}$) pointing directly to the base of its caller's stack frame!

Together, these pointers form an unbroken **Single Linked List in RAM** stretching from the current executing function all the way back to `main()`!

---

### $O(1)$ Stack Backtracing Algorithm via Frame Pointers

How does a crash profiler or debugger walk up the stack using Frame Pointers?

Because every frame pointer $fp$ points directly to a 2-word header ($fp_{\text{caller}}$ and $ra_{\text{caller}}$), the unwinding algorithm is a simple 4-step pointer dereference loop:

```c
// BARE-METAL FRAME POINTER STACK UNWINDING ALGORITHM
struct StackFrame {
    struct StackFrame *previous_fp; // Memory[fp + 0]: Points to caller's fp
    uint64_t           return_ra;   // Memory[fp + 8]: Return address to caller
};

void print_stack_backtrace(uint64_t current_fp) {
    struct StackFrame *frame = (struct StackFrame *)current_fp;
    
    while (frame != NULL) {
        printf("Caller Return PC: 0x%016LX\n", frame->return_ra);
        frame = frame->previous_fp; // Move to previous frame in 1 STEP!
    }
}
```

```text
FRAME POINTER LINKED CHAIN TRAVERSAL FLOW

 Current Frame Pointer fp_current (0x7FFF0EB0)
       │
       ├─► Read 8(fp)  ──► Return Address ra_1 (0x00402044)
       └─► Read 0(fp)  ──► Dereference previous_fp (0x7FFF0F40)
                                 │
                                 ▼
 Frame Pointer fp_previous (0x7FFF0F40)
       │
       ├─► Read 8(fp)  ──► Return Address ra_2 (0x00401024)
       └─► Read 0(fp)  ──► Dereference previous_fp (0x00000000 -> END OF STACK!)
```

#### Why Frame Pointer Unwinding is Outstanding for Real-Time Systems:
* **$O(1)$ Constant-Time Step**: Moving from one stack frame to the next requires **only two memory reads** ($0(fp)$ and $8(fp)$).
* **Zero Binary Metadata Required**: The debugger does not need external debug files or binary symbol tables to reconstruct the call stack!

---

## Primitive 2: DWARF Call Frame Information (`.cfi_*`) and Frame Pointer Elimination

While Frame Pointers enable instant $O(1)$ stack unwinding, using register $x8$ (`s0`/`fp`) as a dedicated frame pointer introduces two microarchitectural trade-offs:

1. **Lost Register Opportunity**: Reserving $x8$ as a frame pointer reduces the number of available general-purpose registers from 31 down to 30.
2. **Instruction Overhead**: Every function prologue and epilogue must execute two extra instructions (`sd fp, 0(sp)` and `addi fp, sp, 16`) to maintain the frame pointer chain.

To recover this register and eliminate stack overhead, production compilers (such as GCC or Clang compiling with `-fomit-frame-pointer`) perform **Frame Pointer Elimination**:

> **Frame Pointer Elimination** is a compiler optimization where register `fp` ($x8$) is freed from acting as a frame pointer and reused as a general-purpose scratchpad register (`s0`). Stack unwinding is shifted from physical hardware registers to compiled binary metadata tables called **DWARF Call Frame Information (CFI)**.

---

### Mechanics of DWARF Call Frame Information (`.cfi_*`)

When Frame Pointer Elimination is active, how can a debugger unwind the stack when the Stack Pointer `sp` moves dynamically?

The compiler embeds **DWARF Call Frame Information (CFI)** metadata tables directly into a special, read-only binary section named **`.eh_frame`** (Executable Handler Frame).

CFI defines a mathematical abstraction called the **Canonical Frame Address (CFA)**:

> **The Canonical Frame Address (CFA)** is defined as the value of the Stack Pointer `sp` at the exact instant the function was called in the caller (before the current function allocated its stack frame).

$$\mathbf{\text{CFA} = sp_{\text{caller\_entry}}}$$

```text
CANONICAL FRAME ADDRESS (CFA) ABSTRACTION

 Caller Stack Frame
 ┌─────────────────────────────────────────────────────────────┐
 │ Canonical Frame Address (CFA = sp + 32)                     │
 ├─────────────────────────────────────────────────────────────┤
 │ Current Function Stack Frame (Allocated 32 Bytes)           │
 │   [ Saved ra ]  (Located at CFA - 8)                          │
 │   [ Saved s0 ]  (Located at CFA - 16)                         │
 │ Current Stack Pointer sp ───────────────────────────────────┤
 └─────────────────────────────────────────────────────────────┘
```

---

### The Four Primary `.cfi_*` Assembler Directives

To construct the `.eh_frame` table, the assembler provides four core CFI directives:

```text
DWARF CFI DIRECTIVES MATRIX

 Directive Syntax          │ Unwinder Action & Rule
───────────────────────────┼───────────────────────────────────────────────────────────
 .cfi_startproc            │ Marks function entry. Initializes CFI state table for function.
 .cfi_def_cfa_offset N     │ Informs unwinder: CFA = sp + N. (Executed after addi sp, sp, -N).
 .cfi_offset reg, offset   │ Informs unwinder: Register `reg` is saved at memory address CFA + offset.
 .cfi_def_cfa reg, offset  │ Changes CFA base register from `sp` to `reg` (e.g. when using fp).
 .cfi_endproc              │ Marks function exit. Closes CFI state table for function.
```

Let us trace how the compiler emits `.cfi_*` directives alongside assembly instructions:

```riscv
# ASSEMBLY PROLOGUE WITH DWARF CFI DIRECTIVES

.global process_data
process_data:
    .cfi_startproc              # 1. Start CFI tracking for process_data
    addi sp, sp, -32            # Allocate 32-byte stack frame
    .cfi_def_cfa_offset 32      # 2. Inform unwinder: CFA = sp + 32
    
    sd   ra, 24(sp)             # Save return address at 24(sp)
    .cfi_offset 1, -8           # 3. Inform unwinder: ra (x1) is saved at CFA - 8
    
    sd   s0, 16(sp)             # Save s0 register at 16(sp)
    .cfi_offset 8, -16          # 4. Inform unwinder: s0 (x8) is saved at CFA - 16

    # --- FUNCTION BODY ---
    # ...
    
    # --- EPILOGUE ---
    ld   ra, 24(sp)
    ld   s0, 16(sp)
    addi sp, sp, 32
    .cfi_def_cfa_offset 0       # 5. Inform unwinder: CFA = sp + 0
    ret
    .cfi_endproc                # 6. End CFI tracking
```

---

### How Exception Handlers Use the `.eh_frame` Table

When a C++ exception (`throw`) or crash occurs at Program Counter $PC_x$:

```text
DWARF UNWINDING STATE LOOKUP TABLE AT RUNTIME

 Instruction Address PC │ CFA Definition │ Saved ra Location │ Saved s0 Location
────────────────────────┼────────────────┼───────────────────┼───────────────────
 0x00401000 (Entry)     │ sp + 0         │ In Register ra    │ In Register s0
 0x00401004 (addi sp)   │ sp + 32        │ In Register ra    │ In Register s0
 0x00401008 (sd ra)     │ sp + 32        │ CFA - 8           │ In Register s0
 0x0040100C (sd s0)     │ sp + 32        │ CFA - 8           │ CFA - 16
```

1. The unwinder queries the `.eh_frame` table using the current $PC_x$ value.
2. The table returns the exact CFA rule for that specific instruction byte (e.g. $\text{CFA} = sp + 32$).
3. The unwinder calculates $\text{CFA}$, retrieves saved return address `ra` from $\text{CFA} - 8$, and restores caller registers.
4. Execution unwinds cleanly to the caller without requiring physical frame pointer registers!

---

## Architectural Comparison: Frame Pointer Unwinding vs. DWARF CFI Unwinding

Systems engineers compare Frame Pointer Unwinding and DWARF CFI Unwinding across performance and diagnostic dimensions:

```text
UNWINDING MECHANISM COMPARISON MATRIX

 Performance / Architectural Property │ Frame Pointer Unwinding (fp) │ DWARF CFI Unwinding (.eh_frame)
──────────────────────────────────────┼──────────────────────────────┼──────────────────────────────────
 Normal Execution Overhead             │ ~1-2% Performance Slowdown   │ ZERO Overhead (0% Slowdown!)
 Extra Architectural Register Used     │ YES (Consumes x8 / s0 / fp)  │ NO (Frees x8 for ALU calculations)
 Binary Executable Size Impact         │ Zero Extra Binary Sections   │ Adds .eh_frame section (~10-15%)
 Backtrace Speed in Debugger / Profiler│ Ultra-Fast O(1) Pointer Hop  │ Slower Binary Table Binary Search
 Usable in Real-Time eBPF Tracing?     │ YES (Safe in Kernel / eBPF)  │ NO (Complex table parsing)
 Primary Software Domain               │ Linux Kernel, Profilers, RT  │ Release Binaries, C++ Exceptions
```

---

## Real-World Silicon Engineering: Zero-Cost Exception Handling and eBPF Tracing

In commercial software development, selecting between Frame Pointers and DWARF CFI impacts system tracing tools:

### 1. "Zero-Cost" C++ Exception Handling

In modern C++ and Rust runtimes, exception handling is called **Zero-Cost Exception Handling**:
* During normal execution path (when no exception is thrown), **zero clock cycles are spent on exception setup**. No frame pointers or try/catch registration blocks are executed!
* Only when an exception is thrown does the runtime pay the cost of parsing `.eh_frame` tables to unwind the stack.

---

### 2. Linux Kernel eBPF and Performance Profilers (`perf`)

In Linux kernel performance profiling (using `perf` or eBPF tracing tools):
* eBPF programs run inside kernel space on every interrupt to capture stack traces (`perf record -g`).
* Parsing complex DWARF `.eh_frame` tables inside a high-frequency kernel interrupt handler is too slow and risky!
* Therefore, the Linux kernel and performance-critical server binaries (such as databases compiled for profiling) are compiled with **`-fno-omit-frame-pointer`**!
* `perf` walks $fp$ linked chains in nanoseconds, capturing $100,000$ stack traces per second with near-zero CPU overhead!

---

## Solved Industrial Engineering Exercise: Frame Pointer Chain Unwinding, Dynamic Stack Allocation, and DWARF CFI Table Reconstruction

To consolidate your complete mastery of frame pointer architectures, linked stack frame chains, dynamic stack allocations (`alloca()`), and DWARF CFI metadata rules, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior systems software architect writing a bare-metal crash dump profiler for a $3.2\text{ GHz}$ 64-bit RISC-V server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

A crash occurs inside a 3-level function call chain:

$$\mathtt{main()} \quad \longrightarrow \quad \mathtt{parse\_payload()} \quad \longrightarrow \quad \mathtt{process\_buffer()}$$

```text
3.2 GHz CRASH UNWINDING SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Crash Profiler ] ──► Walks Stack Memory
 Clock T = 312.5 ps     Reads fp and sp        Reconstructs Call Stack
```

#### Memory Stack State at Crash Instant ($PC_{\text{crash}} = \text{0x0000\_0000\_0040\_3020}$):
* Current Stack Pointer: $sp = \text{0x0000\_0000\_7FFF\_0E00}$.
* Current Frame Pointer: $fp = \text{0x0000\_0000\_7FFF\_0EB0}$.
* Note: `process_buffer()` executed a dynamic allocation (`alloca(128)`), shifting $sp$ downward by 128 bytes after setting $fp$!

#### Stack Memory Dump around $fp = \text{0x0000\_0000\_7FFF\_0EB0}$:
* Memory at `0x7FFF0EB0` ($0(fp)$): Holds value **`0x0000_0000_7FFF_0F40`** (Previous Frame Pointer $fp_{\text{parse}}$).
* Memory at `0x7FFF0EB8` ($8(fp)$): Holds value **`0x0000_0000_0040_2044`** (Return Address $ra_{\text{parse}}$).

#### Stack Memory Dump around $fp_{\text{parse}} = \text{0x0000\_0000\_7FFF\_0F40}$:
* Memory at `0x7FFF0F40` ($0(fp_{\text{parse}})$): Holds value **`0x0000_0000_7FFF_1000`** (Previous Frame Pointer $fp_{\text{main}}$).
* Memory at `0x7FFF0F48` ($8(fp_{\text{parse}})$): Holds value **`0x0000_0000_0040_1024`** (Return Address $ra_{\text{main}}$).

#### Stack Memory Dump around $fp_{\text{main}} = \text{0x0000\_0000\_7FFF\_1000}$:
* Memory at `0x7FFF1000`: Holds value **`0x0000_0000_0000_0000`** (End of Stack Chain!).

#### Your Objective

1. Show why unwinding the stack using $sp$ alone fails due to `alloca(128)` dynamic stack allocation.
2. Trace the **Frame Pointer Linked Chain** step-by-step from $fp_{\text{crash}}$ up to $fp == 0$, reconstructing the exact call stack backtrace (Function addresses and return locations for all 3 functions).
3. Write the DWARF CFI assembly directives (`.cfi_startproc`, `.cfi_def_cfa`, `.cfi_offset`, `.cfi_endproc`) for `process_buffer()`.
4. Calculate the physical time (in nanoseconds) required by the crash profiler to walk the 3-frame stack chain in RAM (assuming $1\text{ clock cycle}$ per L1 Data Cache load).
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Prove Why $sp$-Based Unwinding Fails Under Dynamic Allocation

In `process_buffer()`, $sp = \text{0x7FFF0E00}$, while $fp = \text{0x7FFF0EB0}$.
* Difference = $\text{0x7FFF0EB0} - \text{0x7FFF0E00} = \text{0x0B0} = \mathbf{176_{10} \text{ bytes}}$.
* The function allocated a standard 48-byte stack frame PLUS a dynamic 128-byte `alloca()` buffer ($48 + 128 = 176\text{ bytes}$).

If a debugger assumes a fixed stack frame of $48\text{ bytes}$ and attempts to find saved $ra$ at $sp + 40$:

$$\text{Address Checked} = \text{0x7FFF0E00} + 40 = \text{0x7FFF0E28}$$

Address `0x7FFF0E28` sits inside the **middle of the dynamic `alloca()` buffer**, containing raw user data! 

The debugger reads garbage data and **FAILS TO UNWIND THE STACK**!

---

#### Step 2: Trace Frame Pointer Linked Chain Unwinding

Now let us walk the **Frame Pointer Linked Chain** using $fp = \text{0x0000\_0000\_7FFF\_0EB0}$:

##### Frame 1 (Crash Site: `process_buffer()`):
* Current $PC = \text{0x00403020}$ (`process_buffer()`).
* Current $fp_1 = \text{0x7FFF0EB0}$.
* Read Return Address $ra_1 = \text{Memory}[fp_1 + 8] = \text{Memory}[\text{0x7FFF0EB8}] = \mathbf{\text{0x0000\_0000\_0040\_2044}}$.
* Read Caller Frame Pointer $fp_2 = \text{Memory}[fp_1 + 0] = \text{Memory}[\text{0x7FFF0EB0}] = \mathbf{\text{0x0000\_0000\_7FFF\_0F40}}$.

##### Frame 2 (Caller 1: `parse_payload()`):
* Return Address from Frame 1 points into `parse_payload()` at $PC = \text{0x00402044}$.
* Current $fp_2 = \text{0x7FFF0F40}$.
* Read Return Address $ra_2 = \text{Memory}[fp_2 + 8] = \text{Memory}[\text{0x7FFF0F48}] = \mathbf{\text{0x0000\_0000\_0040\_1024}}$.
* Read Caller Frame Pointer $fp_3 = \text{Memory}[fp_2 + 0] = \text{Memory}[\text{0x7FFF0F40}] = \mathbf{\text{0x0000\_0000\_7FFF\_1000}}$.

##### Frame 3 (Caller 2: `main()`):
* Return Address from Frame 2 points into `main()` at $PC = \text{0x00401024}$.
* Current $fp_3 = \text{0x7FFF1000}$.
* Read Caller Frame Pointer $fp_4 = \text{Memory}[fp_3 + 0] = \text{Memory}[\text{0x7FFF1000}] = \mathbf{\text{0x0000\_0000\_0000\_0000}}$.
* **$fp_4 == 0 \implies$ END OF STACK CHAIN REACHED!**

```text
RECONSTRUCTED CALL STACK BACKTRACE

 Frame 0 (Top / Crash) : process_buffer() at PC = 0x00403020 (fp = 0x7FFF0EB0)
 Frame 1               : parse_payload()  at PC = 0x00402044 (fp = 0x7FFF0F40)
 Frame 2 (Root)        : main()           at PC = 0x00401024 (fp = 0x7FFF1000)
 (Stack chain fully reconstructed in 100% correct order despite alloca()!)
```

---

#### Step 3: Write DWARF CFI Assembly Directives for `process_buffer()`

```riscv
# PROCESS_BUFFER ASSEMBLY WITH DWARF CFI DIRECTIVES

.global process_buffer
.type process_buffer, @function
process_buffer:
    .cfi_startproc
    addi sp, sp, -48            # Allocate 48-byte fixed stack frame
    .cfi_def_cfa_offset 48
    sd   ra, 40(sp)             # Save return address
    .cfi_offset 1, -8
    sd   fp, 32(sp)             # Save previous frame pointer
    .cfi_offset 8, -16
    addi fp, sp, 48             # Establish Frame Pointer fp
    .cfi_def_cfa 8, 0           # Define CFA relative to fp! (fp + 0)

    # --- Dynamic Allocation ---
    sub  sp, sp, a0             # Dynamic alloca(a0) shifts sp!
    # Note: CFA is anchored to fp, so unwinder is immune to sp shifts!

    # ... Function Body & Crash ...

    # --- Epilogue ---
    addi sp, fp, -48            # Restore sp from fp!
    ld   ra, 40(sp)
    ld   fp, 32(sp)
    addi sp, sp, 48
    .cfi_def_cfa_offset 0
    ret
    .cfi_endproc
```

---

#### Step 4: Calculate Profiler Unwinding Execution Time

Walking the 3-frame stack chain required executing 6 memory loads from L1 Data Cache ($2\text{ loads per frame}$ for $fp$ and $ra$):

$$\text{Total Memory Operations} = 3 \text{ frames} \times 2 \text{ loads/frame} = \mathbf{6 \text{ L1 Cache Loads}}$$

$$\text{Total Unwinding Clock Cycles} = 6 \text{ loads} \times 1 \text{ cycle/load} = \mathbf{6 \text{ CPU Clock Cycles}}$$

$$T_{\text{unwind\_time}} = 6 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{1.875 \text{ nanoseconds}}$$

The profiler reconstructed the complete 3-frame backtrace in **$1.875\text{ nanoseconds}$ ($6\text{ CPU clock cycles}$)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and unwinding results:

1. **Frame Pointer Linked Chain Verification**:
   * $fp_1 (\text{0x7FFF0EB0}) \to fp_2 (\text{0x7FFF0F40}) \to fp_3 (\text{0x7FFF1000}) \to 0$.
   * Memory addresses increase strictly monotonically upward toward higher addresses!
   * $0x7FFF0EB0 < 0x7FFF0F40 < 0x7FFF1000$, validating stack growth downward.
2. **Dynamic Allocation Immunity Verification**:
   * Even though $sp$ moved down to `0x7FFF0E00` due to `alloca(128)`, $fp$ remained anchored at `0x7FFF0EB0`.
   * Unwinder accessed $0(fp)$ and $8(fp)$ directly, completely immune to $sp$ shifts!
3. **CFI CFA Anchor Verification**:
   * `.cfi_def_cfa 8, 0` anchored the Canonical Frame Address to $fp + 0$.
   * Proves DWARF unwinder can walk the stack even if frame pointers are omitted in release mode.

All frame pointer linked chain traversals, dynamic stack allocation offsets, DWARF CFI metadata rules, and backtrace execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Frame Pointer (`fp` / `s0` / $x8$)**: An architectural register reserved by ABI conventions to hold a fixed base address pointing to the start of the active function's stack frame ($0(fp) = fp_{\text{caller}}, 8(fp) = ra_{\text{caller}}$), establishing a linked stack chain in RAM that enables $O(1)$ stack backtracing during crashes and dynamic `alloca()` allocations.
* **Call Frame Information (`.cfi_startproc` / `.cfi_def_cfa`)**: DWARF assembler metadata directives that define rules for calculating the Canonical Frame Address (CFA) and register recovery locations relative to instruction Program Counters ($PC$), enabling "zero-cost" exception unwinding without dedicated physical frame pointers.
