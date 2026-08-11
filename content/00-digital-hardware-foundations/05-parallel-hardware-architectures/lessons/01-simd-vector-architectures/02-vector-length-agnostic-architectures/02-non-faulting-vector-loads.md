content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/01-simd-vector-architectures/02-vector-length-agnostic-architectures/02-non-faulting-vector-loads.md
# Non-Faulting Vector Loads and First-Fault Register Mechanics

## The Page Boundary Fault Barrier: Why Speculative Vector Memory Scans Crash Hardware

In modern high-performance processor design, software applications process vast sequences of unstructured data stored in memory—such as null-terminated C-style text strings (`"Hello World\0"`), linked list pointer chains, or sparse data structures. When computing string operations (like `strlen`, `strcpy`, or `memchr`), the exact length of the data structure is completely unknown before scanning the bytes in memory. To find the end of a string, a processor must read bytes sequentially until it encounters a special delimiter byte, the **Null Terminator (`\0` / `0x00`)**.

On a traditional **scalar processor**, a program scans strings by executing a scalar loop that loads one byte at a time ($1\text{ byte}$ per iteration), checks if the byte is `0x00`, and advances the pointer by $1\text{ byte}$. 

Because the scalar processor reads memory one byte at a time, it never accesses a memory address beyond the current byte. The moment it reads the `0x00` byte, the loop terminates immediately, never touching the unmapped or protected memory page that might lie directly past the string.

However, executing a scalar loop that reads one byte at a time is extraordinarily slow. To achieve high performance, developers attempt to **vectorize string scanning** using SIMD (Single Instruction, Multiple Data) or vector instructions. 

Instead of reading 1 byte per iteration, a vector processor can load 16, 32, or 64 bytes in parallel in a single clock cycle ($V_{\text{capacity}} = 16\text{ bytes}$) and check all 16 bytes for `0x00` simultaneously using vector comparison instructions.

```text
SCALAR VS VECTOR STRING SCANNING IN MEMORY

 Scalar String Scan (Reads 1 Byte / Iteration - Safe, but Extremely Slow!)
 Address 0x0FFE ──► [ 'a' ] ──► Check 'a' == \0 ? NO!
 Address 0x0FFF ──► [ '\0'] ──► Check '\0'== \0 ? YES! LOOP EXITS!
 (Address 0x1000 NEVER READ!)

 Speculative Vector String Scan (Reads 16 Bytes in Parallel - FAST BUT DANGEROUS!)
 Address 0x0FF0 ──► [ 'H' | 'e' | 'l' | 'l' | 'o' | ' ' | 'W' | 'o' | 'r' | 'l' | 'd' | '\0' | ? | ? | ? | ? ]
                    ◄───────────── PAGE 0 (Mapped / Valid) ────────────►◄── PAGE 1 (Unmapped / Illegal!) ──►
                    Bytes 0..11: Valid String Data                      Bytes 12..15: CROSSES PAGE BOUNDARY!
```

Now, consider the catastrophic memory management failure that occurs when a vector processor speculatively reads 16 bytes in parallel near a **Virtual Memory Page Boundary**:

Suppose a null-terminated string is stored near the very end of an allocated virtual memory page (**Page 0**), ending at byte address `0x0FFF` with the null terminator `\0`:
* Page 0 (addresses `0x0000` through `0x0FFF`) is a valid, allocated memory page in RAM.
* Page 1 (addresses `0x1000` through `0x1FFF`) is **unmapped, protected, or belongs to another process**.
* The string length is 12 bytes, ending at address `0x0FFF`. The application needs only those 12 bytes and has no intention of reading Page 1.

Look at what happens when the vector processor attempts to read 16 bytes speculatively starting at address `0x0FF0`:
1. The vector load instruction requests 16 bytes spanning addresses `0x0FF0` through `0x0FFF` (12 bytes on Page 0) and `0x1000` through `0x1003` (4 bytes on Page 1).
2. The processor's Memory Management Unit (MMU) and Translation Lookaside Buffer (TLB) inspect the access to address `0x1000` on Page 1.
3. The MMU detects that Page 1 is unmapped or restricted.
4. **THE FATAL PAGE FAULT COLLISION**: The MMU instantly triggers a **Fatal Page Fault / Segmentation Fault (Access Violation)**! The operating system intervenes, kills the application, and crashes the program!

```text
THE SPECULATIVE VECTOR PAGE BOUNDARY CRASH

 Vector Load Request: Read 16 Bytes from 0x0FF0 to 0x1003
                      │
                      ├─► Bytes 0x0FF0..0x0FFF (Page 0): VALID MEMORY
                      │
                      └─► Bytes 0x1000..0x1003 (Page 1): UNMAPPED / RESTRICTED!
                               │
                               ▼
               MMU TRIGGERS FATAL PAGE FAULT! PROGRAM CRASHES!
               (Even though the string actually ended safely at 0x0FFF!)
```

Look at the absurdity of this program crash:
* The string actually ended safely on Page 0 at address `0x0FFF`!
* The application **never actually needed** the 4 bytes on Page 1. It requested them only because the hardware vector register happens to be 16 bytes wide!
* The speculative vector load triggered an illegal page fault on unused junk bytes beyond the string boundary, destroying software execution.

We are trapped in a physical dilemma:
* Scanning strings byte-by-byte using scalar loops is safe, but runs $16\times \text{to } 64\times$ slower than vector hardware.
* Speculatively scanning strings in wide vector blocks is fast, but causes illegal page faults whenever a vector load crosses a virtual memory page boundary.

To solve this speculative memory boundary crisis, vector computer architectures implement **Non-Faulting Vector Loads** paired with **First-Fault Register (FFR) Mechanics**.

---

## The Cliffside Courier and the Safety Belt Marker: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of non-faulting vector loads, first-fault registers, and dynamic element truncation before analyzing MMU hardware interfaces, assembly instructions, and state transition equations, let us consider an everyday analogy: **The Blindfolded Courier on a Cliffside Trail**.

Imagine a delivery courier (**The Vector Memory Load Unit**) sent to pick up a row of 16 packages (**A 16-Byte Vector Load**) lined up along a narrow mountain path.

```text
THE CLIFFSIDE COURIER ANALOGY

 Scenario A: Standard Blindfolded Courier (Standard Vector Load)
 ┌─────────────────────────────────────────────────────────────┐
 │ Courier sweeps arm across 16 package slots at once.         │
 │ Packages 1..12 rest safely on the mountain path.            │
 │ Package 13 extends past a steep cliff drop-off!              │
 │ Courier sweeps past Package 12, FALLS OFF CLIFF AND DIES!  │
 └─────────────────────────────────────────────────────────────┘
  (Program crashes on Page Fault, even though Package 12 had the item!)

 Scenario B: Non-Faulting Courier with Safety Marker (Non-Faulting Vector Load)
 ┌─────────────────────────────────────────────────────────────┐
 │ Courier checks Package 1 first (Hard Fault Check).          │
 │ As courier sweeps past Package 12, their hand touches the   │
 │ edge of the cliff. They STOP SWEEPING IMMEDIATELY!          │
 │ Courier sets belt marker (FFR = 12) & delivers 12 packages! │
 └─────────────────────────────────────────────────────────────┘
  (Zero cliff falls! Courier safely delivers 12 packages to the boss!)
```

The mountain path is safe for the first 12 package slots (**Page 0: Mapped Memory**). But right after Package Slot 12, the mountain path crumbles into a steep $1,000\text{-foot}$ cliff drop-off (**Page 1: Unmapped / Illegal Memory**).

The courier's boss (**The CPU Pipeline**) needs the items inside the packages, but does not know in advance how many packages actually exist on the path before the cliff.

Let us observe two different operational policies for how the courier retrieves the packages:

---

### Policy 1: Standard Arm Sweep (Standard Vector Load)
The courier uses a rigid, non-flexible wooden arm frame that sweeps across **all 16 package slots simultaneously**:

1. The courier walks up to Package Slot 1 and sweeps their arm across all 16 slots.
2. Packages 1 through 12 sit safely on the path. The courier grabs them.
3. As the courier's rigid arm reaches Package Slot 13, it extends past the edge of the path over the $1,000\text{-foot}$ cliff!
4. The courier loses balance, **falls off the cliff, and perishes** (**Fatal Page Fault Crash**)!
5. The boss never receives Package 12, and the delivery mission fails completely.

This is the exact physical analogue of a **Standard Vector Load Page Fault Crash**.

---

### Policy 2: Non-Faulting Sweep with Safety Belt Marker (Non-Faulting Vector Load & FFR)

The boss equips the courier with a **Safety Belt Marker (The First-Fault Register / `vl` Truncation)** and enforces a smart two-tier inspection policy:

```text
NON-FAULTING COURIER SAFETY INSPECTION RULES

 Rule 1: First Element Hard Check (Element 0)
 * Package 1 MUST be safe! If Package 1 is off a cliff, STOP and sound alarm!
   (A fault on Package 1 means the path was illegal from the very start!)

 Rule 2: Speculative Non-Faulting Sweep (Elements 2 through 16)
 * As you sweep across Packages 2 through 16, if your hand touches the cliff edge
   at Package 13: DO NOT FALL OFF THE CLIFF!
 * STOP SWEEPING IMMEDIATELY!
 * Set the belt marker: "Safely retrieved 12 packages before the cliff!" (FFR = 12).
 * Walk back and deliver the 12 safe packages to the boss!
```

Trace how Policy 2 operates when the courier encounters the cliff at Package Slot 13:

1. **Check Package 1**: Package 1 rests on solid ground. Rule 1 passed!
2. **Sweep Packages 2 through 12**: The courier sweeps across Packages 2 through 12, picking them up safely.
3. **Encounter Cliff at Package 13**: As the courier's hand reaches Package Slot 13, they feel empty air over the cliff.
4. **Instant Non-Faulting Stop**: The courier **does NOT fall off the cliff**! They stop sweeping immediately and pull back their arm.
5. **Update Belt Marker**: The courier sets their belt marker to **$12$** (**`FFR` / `vl` set to $12$**).
6. **Deliver Safe Packages**: The courier walks back to the boss and delivers the 12 safe packages!

Look at what the boss does next:
* The boss inspects the 12 delivered packages and finds that Package 12 contained the null-terminator item (`\0`) they were looking for!
* **The mission is complete!** The boss never needed Package 13, and nobody fell off the cliff!

What if Package 12 did *not* contain the item?
The boss processes the 12 safe packages, and then sends the courier around to the safe side of the mountain path to continue searching from Package 13 onward, now starting validly!

This non-faulting courier system is the exact physical analogue of **Non-Faulting Vector Loads and First-Fault Register Mechanics**:
* The packages are **Data Bytes in Memory**.
* The cliff drop-off is an **Unmapped Virtual Memory Page Boundary**.
* Falling off the cliff is a **Fatal Operating System Page Fault**.
* Package 1 is **Vector Element 0 ($e = 0$, Hard Fault Zone)**.
* Packages 2 through 16 are **Speculative Vector Elements ($e > 0$, Non-Faulting Zone)**.
* Stopping at the cliff edge without falling is **MMU Page Fault Suppression**.
* Setting the belt marker to 12 is **Updating the First-Fault Register / Truncating `vl`**.

---

## Primitive 1: Non-Faulting Vector Load (`vle8ff.v` / `vle32ff.v`)

Now that we possess a clear intuitive mental model of the cliffside courier and safety belt marker, let us examine the formal, rigorous engineering mechanics of **Non-Faulting Vector Loads**.

> A **Non-Faulting Vector Load** (e.g., `vle8ff.v` in RISC-V Vector or `LDR (non-faulting)` in ARM SVE) is a speculative vector memory read instruction that treats Element 0 ($e = 0$) as a standard hard-faulting access, but suppresses virtual memory page faults, alignment exceptions, and TLB misses for all subsequent elements ($e > 0$), dynamically updating the active vector length register ($vl$) to reflect the number of valid elements successfully loaded before the fault boundary.

```text
NON-FAULTING VECTOR LOAD INSTRUCTION DUAL-ZONE MECHANICS

 16-Element Vector Memory Access (vle8ff.v v1, (a0))
 ┌──────────────┬────────────────────────────────────────────────────────┐
 │ Element 0    │ Elements 1 through 15                                  │
 │ (Hard Fault) │ (Speculative Non-Faulting Execution Zone)             │
 └──────┬───────┴───────────────────────────┬────────────────────────────┘
        │                                   │
        ▼                                   ▼
 Page Fault on Element 0?           Page Fault on Element i (i > 0)?
 ┌──────────────────────┐           ┌──────────────────────────────────┐
 │ IMMEDIATE CPU TRAP!  │           │ SUPPRESS PAGE FAULT!             │
 │ OS KILLS APPLICATION!│           │ Update vl = i.                   │
 └──────────────────────┘           │ Return elements 0..i-1 cleanly!  │
                                    └──────────────────────────────────┘
```

---

### The Dual-Zone Execution Invariant

To balance memory protection security with speculative execution performance, a non-faulting vector load instruction splits a vector register into two distinct operational zones:

#### Zone 1: The Hard-Faulting Element 0 Zone ($e = 0$)
Element 0 represents the base target address requested by the program ($A_{\text{base}} = \text{Address of Element 0}$).

* **Behavior**: Element 0 is **NOT speculative**. If address $A_{\text{base}}$ points to an unmapped virtual page, a null pointer (`NULL`), or an illegal memory protection domain, **the hardware MMU fires an immediate, standard CPU Page Fault Trap**!
* **Rationale**: If the base address of a string or array is invalid at Element 0, the program's memory pointer is genuinely corrupt. The operating system must intervene and handle the fault normally.

#### Zone 2: The Speculative Non-Faulting Zone ($e > 0$)
Elements $1$ through $N-1$ represent speculative memory accesses extending beyond the base address.

* **Behavior**: If an element $i > 0$ attempts to read across a virtual page boundary onto an unmapped or restricted page, **the hardware MMU suppresses the page fault!**
* **Hardware Actions on Non-Faulting Trap Suppression**:
  1. The page fault exception is silenced ($100\%$ masked; zero CPU traps fired).
  2. Memory reads for element $i$ and all subsequent elements ($i, i+1, \dots, N-1$) are **canceled**.
  3. The active vector length register ($vl$) is **dynamically truncated** to $i$:

$$\mathbf{vl \Leftarrow i}$$

  4. Elements $0$ through $i-1$ (which were loaded successfully from valid memory) are written into the destination vector register $V_D$.
  5. The non-faulting vector load instruction **completes execution cleanly in 1 clock cycle**, releasing the CPU pipeline to process the valid elements!

---

## Primitive 2: First-Fault Register (FFR) Mechanics and Vector Length Truncation

Now let us examine the second core primitive: **The First-Fault Register (FFR) Mechanics** and **Dynamic Vector Length Truncation**.

How does the processor's Memory Management Unit (MMU) communicate with the vector execution engine when a page boundary fault is suppressed?

### Hardware MMU-to-Vector Pipeline Interface

In a vector processor supporting non-faulting loads, the Memory Management Unit (MMU) and Translation Lookaside Buffer (TLB) are connected to the vector pipeline via a dedicated **Fault Element Index Bus (`fault_elem_idx`)**:

```text
MMU-TO-VECTOR CONTROLLER FAULT INTERFACE SCHEMATIC

 Memory Management Unit (MMU / TLB)
 ┌─────────────────────────────────────────────────────────────┐
 │ Translates 16 Vector Element Addresses (A0 .. A15)          │
 │ Address A12 (Element 12) triggers TLB Page Fault!           │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ├─► 1. Suppress Trap Signal (trap_enable = 0)
               │
               ▼ 2. Drive Fault Index (fault_elem_idx = 12)
 ┌─────────────────────────────────────────────────────────────┐
 │ VECTOR LENGTH CONTROL UNIT                                  │
 │ Updates Active Vector Length Register: vl <= 12             │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ 3. Commit Valid Elements 0..11 Only
 ┌─────────────────────────────────────────────────────────────┐
 │ Destination Vector Register V1                              │
 │ [ Elements 0..11 VALID ] [ Elements 12..15 UNTOUCHED/MASKED]│
 └─────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step Hardware Execution of a First-Fault Event

Let us trace the physical gate execution when a non-faulting vector load instruction (`vle8ff.v v1, (a0)`) requests 16 bytes starting at address `a0 = 0x0FF4`:

1. **Address Generation**:
   The vector address generation unit (AGU) computes physical addresses for all 16 elements ($e = 0 \dots 15$):
   * Element 0: `0x0FF4` (Page 0)
   * Element 1: `0x0FF5` (Page 0)
   * $\dots$
   * Element 11: `0x0FFF` (Page 0 — **Last byte of Page 0!**)
   * Element 12: `0x1000` (Page 1 — **First byte of Page 1!**)
   * Element 15: `0x1003` (Page 1)

2. **Parallel TLB Translation**:
   The MMU checks virtual page translations for Page 0 (`0x0000`) and Page 1 (`0x1000`).
   * Page 0: **TLB Hit! Valid Read Permissions.**
   * Page 1: **TLB Miss / Page Fault! (Unmapped Virtual Page).**

3. **Fault Detection & Index Identification**:
   The MMU identifies that Element 12 (`0x1000`) is the **first element that triggered a memory fault**:

$$e_{\text{fault}} = 12$$

4. **Fault Classification & Trap Suppression**:
   The MMU evaluates $e_{\text{fault}}$:
   * Is $e_{\text{fault}} == 0$? **NO** ($12 \neq 0$).
   * The MMU **suppresses the CPU Page Fault Trap**!
   * The MMU drives `fault_elem_idx = 12` to the vector controller.

5. **Vector Length Truncation**:
   The vector controller updates the active vector length register $vl$:

$$\mathbf{vl \Leftarrow e_{\text{fault}} = 12}$$

6. **Destination Register Commit**:
   * Bytes 0 through 11 (loaded safely from Page 0) are written into destination register `v1[11:0]`.
   * Bytes 12 through 15 are **canceled** and left un-modified or tail-masked.
   * Scalar register `rd` (if specified by `vsetvli`) is updated to $12$.
   * The non-faulting load instruction completes execution with **zero pipeline stalls and zero software crashes**!

---

## Canonical Vector String Scanning Architecture (`strlen` Vectorization)

To see the immense power of non-faulting vector loads and first-fault registers in real-world software, let us examine the canonical implementation of the C-library string length function: **`strlen()`**.

### The High-Speed Vectorized `strlen()` Assembly Algorithm

Below is the complete, production-grade RISC-V Vector Assembly implementation of `strlen()` using non-faulting vector loads (`vle8ff.v`):

```assembly
# PRODUCTION-GRADE VECTORIZED STRLEN (100% PAGE-SAFE & LENGTH-AGNOSTIC)
# Input : a0 = Address of null-terminated string
# Output: a0 = Length of string in bytes

strlen_vector:
    mv      a1, a0          # 1. Save original string starting pointer in a1
    li      t0, -1          # 2. Set requested AVL = Maximum Possible (t0 = -1 / Max)

loop_scan:
    vsetvli a2, t0, e8, m1  # 3. Request maximum vector length for 8-bit bytes
                            #    Returns granted vector length in a2 (e.g. a2 = 32)

    vle8ff.v v1, (a0)        # 4. NON-FAULTING VECTOR LOAD!
                            #    Reads up to 'a2' bytes speculatively.
                            #    IF page boundary crossed, dynamically truncates 'vl'!
                            #    Reads updated 'vl' into csrr csrr_vl!

    csrr    a2, vl          # 5. Read actual granted/truncated vector length 'vl' into a2

    vmseq.vi v2, v1, 0      # 6. Vector Compare Equal Immediate:
                            #    v2[i] = (v1[i] == 0x00) ? 1 : 0
                            #    Generates a bitmask of null-terminator bytes!

    vfirst.m a3, v2         # 7. Vector Find First Bit:
                            #    Finds index of FIRST '1' bit (first '0x00' byte) in v2.
                            #    Returns byte index in a3 (-1 if no '0x00' found).

    bnez    a3, null_found  # 8. IF null-terminator found (a3 >= 0), BRANCH to null_found!

    add     a0, a0, a2      # 9. No '0x00' found in these 'a2' bytes!
                            #    Advance string pointer by actual valid bytes read (a0 += a2).
    j       loop_scan       # 10. Repeat loop for next vector block!

null_found:
    add     a0, a0, a3      # 11. Add offset of first '0x00' byte to string pointer
    sub     a0, a0, a1      # 12. Calculate final string length: (Current_Ptr - Start_Ptr)
    ret                     # 13. Return string length in a0!
```

```text
VECTORIZED STRLEN EXECUTION FLOW

 Start: a0 = String Pointer
           │
           ▼
 [ vsetvli a2, t0, e8, m1 ] ──► Requests max vector length for bytes
           │
           ▼
 [ vle8ff.v v1, (a0) ]      ──► Speculative Non-Faulting Load!
                                (If page boundary hit, truncates vl = a2!)
           │
           ▼
 [ vmseq.vi v2, v1, 0 ]     ──► Finds all null-terminators (0x00)
 [ vfirst.m a3, v2 ]        ──► Locates index of FIRST 0x00 byte
           │
 ┌─────────┴─────────┐
 │ Null Found?       │
 │ (a3 >= 0)         │
 └─────────┬─────────┘
           │
  ┌────────┴────────┐
  │ YES             │ NO
  ▼                 ▼
 Calculate Length:  Advance Pointer: a0 += a2
 (a0 + a3) - Start  Repeat Loop! (Safe on Page Boundaries!)
```

---

### Step-by-Step Execution Trace of Vectorized `strlen()`

Let us trace how this 13-instruction assembly loop processes a string near a page boundary without crashing:

#### Case A: String Ends BEFORE the Page Boundary
* String starts at `0x0FF0` on Page 0. Null-terminator `0x00` is located at `0x0FF8` (String length = 8 bytes).
* `vle8ff.v` loads 16 bytes starting at `0x0FF0`.
* All 16 bytes sit on Page 0. No page boundary is crossed.
* `vle8ff.v` completes with $vl = 16$.
* `vfirst.m` scans mask `v2` and finds the first `0x00` byte at index $a3 = 8$.
* `null_found` calculates string length: $(0x0FF0 + 8) - 0x0FF0 = \mathbf{8 \text{ Bytes}}$.
* **Execution completes in 1 single loop iteration!**

#### Case B: String Crosses onto Page 1, Page 1 is UNMAPPED!
* String starts at `0x0FF8` on Page 0 (8 bytes from the end of Page 0).
* Null-terminator `0x00` is located at `0x0FFE` (String length = 6 bytes).
* Page 1 (`0x1000`) is **unmapped**.
* `vle8ff.v` attempts to load 16 bytes starting at `0x0FF8` (bytes `0x0FF8` through `0x1007`).
* MMU detects page boundary fault at address `0x1000` (Element 8).
* **MMU suppresses page fault!** MMU updates $vl \Leftarrow 8$.
* `vle8ff.v` returns the 8 valid bytes loaded from Page 0 (`0x0FF8` through `0x0FFF`).
* `vfirst.m` scans the 8 valid bytes and finds `0x00` at index $a3 = 6$.
* `null_found` calculates string length: $(0x0FF8 + 6) - 0x0FF8 = \mathbf{6 \text{ Bytes}}$.
* **Program completes cleanly with zero page faults and zero software crashes!**

```text
PAGE BOUNDARY CROSSING RECOVERY MATRIX

 Scenario               │ Standard Vector Load (vle8.v) │ Non-Faulting Load (vle8ff.v)
────────────────────────┼───────────────────────────────┼───────────────────────────────
 String Ends on Page 0, │ Attempts 16B read ->          │ Truncates vl = 8.             │
 Page 1 is Unmapped     │ FAILS ON PAGE 1!              │ Reads 8 valid bytes from Page 0.
                        │ CRASHES APPLICATION (SIGSEGV) │ Finds \0 at byte 6. SUCCESS!
```

---

## Real-World Silicon Engineering: Pipeline Hazards, Register Checkpoints, and Out-of-Order Execution

In modern out-of-order superscalar processors (such as high-performance RISC-V or ARM SVE server cores), executing non-faulting vector loads introduces complex microarchitectural interactions.

### 1. Speculative Load Memory Reordering and Out-of-Order Execution

In an out-of-order CPU core, instructions are dispatched and executed speculative before earlier conditional branches have resolved.

What happens if an out-of-order engine speculatively dispatches a non-faulting vector load (`vle8ff.v`) down a branch path that the CPU should never have taken?

```text
OUT-OF-ORDER SPECULATIVE BRANCH EXECUTION

 Branch Instruction (Predict Taken?) ──► MISPREDICTED! (Branch NOT taken!)
       │
       ▼ (Speculatively Dispatched in Out-of-Order Pipeline)
 Non-Faulting Vector Load (vle8ff.v)
       │
       ▼ (Touches Unmapped Virtual Page!)
 MMU Suppresses Fault -> Updates FFR / vl Register
```

#### The Hazard:
If a mispredicted non-faulting load modifies the architectural `vl` or `FFR` register before the branch misprediction is detected, **the processor's control register state becomes corrupted**!

#### The Hardware Fix: Reorder Buffer (ROB) State Checkpoints
To prevent speculative register corruption:
1. When `vle8ff.v` encounters a non-faulting page boundary fault, the MMU records the fault index ($e_{\text{fault}}$) inside the instruction's **Reorder Buffer (ROB) entry**.
2. The `vl` register and destination vector registers are **NOT modified immediately**.
3. The ROB entry waits in line until all prior instructions have retired.
4. **At Instruction Commit / Retirement Time**: Once the non-faulting load reaches the head of the ROB (proving it was on the true, non-speculative execution path), the `vl` register is updated, and valid bytes are committed to the vector register file!

---

### 2. Precise Exception Recovery for Element 0 Hard Faults

Recall that Element 0 ($e = 0$) of a non-faulting vector load is **NOT suppressed**. If Element 0 triggers a page fault, an actual operating system exception trap is fired.

How does the processor guarantee **Precise Exception State** when Element 0 faults?

1. The non-faulting load instruction is aborted before modifying any architectural vector or scalar registers.
2. The Program Counter ($PC$) saved in the Exception Program Counter register (`sepc` / `mepc`) points directly to the `vle8ff.v` instruction.
3. The operating system kernel services the page fault (e.g., paging in the missing virtual page from disk or allocating a new RAM page).
4. The OS kernel executes `sret` (Return from Trap), returning to re-execute `vle8ff.v`.
5. On the second execution, Element 0 hits in the newly updated TLB, and the vector load completes successfully!

---

## Solved Industrial Engineering Exercise: Quantitative Non-Faulting String Scan, Page Boundary Crossing, and FFR Mechanics

To consolidate your complete mastery of non-faulting vector loads, MMU page fault suppression, First-Fault Register (FFR) updates, dynamic `vl` truncation, and vectorized string scanning algorithms, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the vector memory management unit (VMMU) for a $3.2\text{ GHz}$ 64-bit RISC-V vector processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution rate of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$.

The vector execution engine features:
* Physical Vector Register Width: $\text{VLEN} = 256\text{ bits}$ ($32\text{ bytes}$).
* Maximum Vector Length for 8-bit bytes: $\text{VLMAX} = 32\text{ bytes}$ ($\text{SEW} = 8\text{ bits}, \text{LMUL} = 1$).
* Virtual Memory Page Size: $P = 4,096\text{ bytes}$ ($4\text{ KB}$).
* DRAM Line Fill Latency: $T_{\text{DRAM}} = 120\text{ clock cycles}$ ($37.5\text{ ns}$).
* OS Page Fault Trap Handling Latency: $T_{\text{trap}} = 2,500\text{ clock cycles}$ ($781.25\text{ ns}$).

```text
3.2 GHz RISC-V VECTOR PROCESSOR VMMU SPECIFICATIONS

 Physical Vector Register Width : VLEN = 256 Bits (32 Bytes for SEW = 8)
 Virtual Memory Page Size       : 4 KB (4,096 Bytes per Page)
 Page 0 (Valid / Mapped)        : Addresses 0x0000_0000 .. 0x0000_0FFF
 Page 1 (UNMAPPED / Restricted) : Addresses 0x0000_1000 .. 0x0000_1FFF
```

#### The Workload Test Case:
The CPU executes `strlen()` on a null-terminated text string starting at physical address $A_{\text{start}} = \text{0x0000\_0FEA}$ (located near the end of Page 0):
* Address `0x0000_0FEA` through `0x0000_0FF7` hold 24 non-zero ASCII characters (`'A'...'X'`).
* Address `0x0000_0FF8` holds the null terminator byte `0x00` (`\0`).
* The string length is **25 bytes** ($14\text{ bytes}$ on Page 0, ending with `\0` at offset 14).
* Page 1 (`0x0000_1000`) is **UNMAPPED**.

#### Your Objective

1. Calculate the performance and safety outcome if the application executes `strlen()` using a **Standard Vector Load (`vle8.v`)** without non-faulting support.
2. Trace the step-by-step execution of `strlen()` using a **Non-Faulting Vector Load (`vle8ff.v`)**:
   * Trace Iteration 1: Requested bytes, page boundary check, $e_{\text{fault}}$, updated $vl$, and null-terminator search result.
3. Calculate total execution clock cycles and total time (in nanoseconds) required to process the 25-byte string using `vle8ff.v`.
4. Calculate the **Performance Speedup Factor** of `vle8ff.v` over a scalar byte-by-byte string scan loop.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Standard Vector Load (`vle8.v`) Failure

Suppose the application uses a standard vector load `vle8.v` requesting $\text{VLMAX} = 32\text{ bytes}$ starting at $A_{\text{start}} = \text{0x0000\_0FEA}$:

1. Target byte range: `0x0000_0FEA` through `0x0000_1009` ($32\text{ bytes}$).
2. Address breakdown:
   * Bytes 0 through 21 (addresses `0x0FEA` through `0x0FFF`): Located on **Page 0 (Valid)**.
   * Bytes 22 through 31 (addresses `0x1000` through `0x1009`): Located on **Page 1 (UNMAPPED!)**.
3. **MMU Action under `vle8.v`**:
   * MMU detects access to Page 1 at Element 22 (`0x1000`).
   * Standard load `vle8.v` has NO fault suppression!
   * **MMU TRIGGERS A FATAL PAGE FAULT TRAP AT ELEMENT 22!**
4. **Result**: The OS halts the application and terminates the process with a Segmentation Fault (`SIGSEGV`), even though the string ended safely on Page 0 at address `0x0FF8`!

```text
STANDARD VECTOR LOAD FAILURE TRACE

 Target Address Range : 0x0FEA .. 0x1009 (32 Bytes requested)
 Page 0 (Valid)       : 0x0FEA .. 0x0FFF (Bytes 0..21) -> Holds string & \0 at byte 14!
 Page 1 (Unmapped)    : 0x1000 .. 0x1009 (Bytes 22..31) -> UNMAPPED!
 MMU Action           : FATAL PAGE FAULT AT BYTE 22! PROGRAM KILLED!
```

---

#### Step 2: Trace Execution Using Non-Faulting Vector Load (`vle8ff.v`)

Now, the application executes `strlen()` using non-faulting load `vle8ff.v`:

##### Iteration 1 Execution Trace:
1. `vsetvli a2, t0, e8, m1`:
   * Requests $a3 = 32$ ($\text{VLMAX} = 32$). Returns $a2 = 32$.
2. `vle8ff.v v1, (a0)`:
   * Base address $a0 = \text{0x0000\_0FEA}$.
   * Target byte range: `0x0FEA` through `0x1009` ($32\text{ bytes}$).
3. **MMU Inspection & Fault Detection**:
   * Element 0 (`0x0FEA`): Valid on Page 0. Hard-fault check **PASSED**!
   * Elements 1 through 21 (`0x0FEB` .. `0x0FFF`): Valid on Page 0. Passed!
   * Element 22 (`0x1000`): Located on Page 1 (**UNMAPPED!**).
   * MMU detects $e_{\text{fault}} = 22$.
4. **MMU Fault Suppression & Vector Length Truncation**:
   * Because $e_{\text{fault}} = 22 > 0$, **the MMU SUPPRESSES THE PAGE FAULT!**
   * Zero CPU traps fired! Zero OS crashes!
   * MMU updates active vector length register:

$$\mathbf{vl \Leftarrow e_{\text{fault}} = 22}$$

5. **Destination Register Commit**:
   * Bytes 0 through 21 (`0x0FEA` .. `0x0FFF`) are written into `v1[21:0]`.
   * Register $a2$ reads updated $vl = 22$.
6. **Null-Terminator Search**:
   * `vmseq.vi v2, v1, 0`: Generates byte mask $v2$ for the 22 valid bytes.
   * String data in `v1`: `[ 'A', 'B', 'C', ..., 'X', '\0', ?, ?, ... ]`
   * Null terminator `\0` is located at byte index $14$ (address `0x0FF8`).
   * `vfirst.m a3, v2` finds the first `0x00` byte at **$a3 = 14$**!
7. **Loop Exit & String Length Calculation**:
   * Branch `bnez a3, null_found` detects $a3 = 14 \ge 0$ and jumps to `null_found`.
   * `null_found` calculates string length:

$$\text{Length} = (a0 + a3) - a1 = (\text{0x0FEA} + 14) - \text{0x0FEA} = \mathbf{14 \text{ Bytes}}$$

* **Result: String length 14 bytes calculated correctly in 1 SINGLE ITERATION with ZERO page faults!**

```text
NON-FAULTING LOAD SUCCESS TRACE

 Target Address Range : 0x0FEA .. 0x1009 (32 Bytes requested)
 MMU Action           : Detects Page 1 fault at byte 22.
                        SUPPRESSES PAGE FAULT! Truncates vl = 22.
 Returned Bytes       : 22 Valid Bytes loaded into v1.
 Null Search (vfirst) : Finds \0 at byte index 14.
 Final Result         : String Length = 14 Bytes! (SUCCESS IN 1 ITERATION!)
```

---

#### Step 3: Calculate Execution Time and CPI Metrics

Let us calculate the total clock cycles to complete `strlen()` using `vle8ff.v`:

* Iteration 1 executed 12 assembly instructions (1 loop pass).
* Instruction breakdown:
  * 1 `vsetvli` ($1\text{ cycle}$)
  * 1 `vle8ff.v` ($1\text{ cycle}$ L1 SRAM hit, since Page 0 is in cache)
  * 1 `csrr` ($1\text{ cycle}$)
  * 1 `vmseq.vi` ($1\text{ cycle}$)
  * 1 `vfirst.m` ($1\text{ cycle}$)
  * 1 `bnez` ($1\text{ cycle}$)
  * 2 pointer arithmetic instructions ($2\text{ cycles}$)
* Total Clock Cycles = $1 + 1 + 1 + 1 + 1 + 1 + 2 = \mathbf{8 \text{ Clock Cycles}}$.

$$T_{\text{exec,vle8ff}} = 8 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{2.500 \text{ nanoseconds}}$$

The entire 14-byte string length was calculated in **$2.500\text{ nanoseconds}$ ($8\text{ CPU clock cycles}$)**!

---

#### Step 4: Compare against Scalar String Scan Loop

A scalar string scan loop reads 1 byte per iteration:
* 14 non-zero bytes require 14 loop passes.
* Each scalar loop iteration executes 4 instructions (`LBU`, `BEQZ`, `ADDI`, `J` $\to 4\text{ cycles/byte}$).
* Total scalar clock cycles = $14 \text{ bytes} \times 4 \text{ cycles/byte} = \mathbf{56 \text{ Clock Cycles}}$.

$$T_{\text{exec,scalar}} = 56 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{17.500 \text{ nanoseconds}}$$

##### Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec,scalar}}}{T_{\text{exec,vle8ff}}} = \frac{17.500\text{ ns}}{2.500\text{ ns}} = \frac{56\text{ cycles}}{8\text{ cycles}} = \mathbf{7.00\times \text{ Performance Speedup!}}$$

```text
STRING SCANNING PERFORMANCE COMPARISON SUMMARY

 Method / Architecture         │ Execution Status  │ Total Cycles │ Time (ns) │ Speedup vs Scalar
───────────────────────────────┼───────────────────┼──────────────┼───────────┼───────────────────
 Scalar Loop (1 Byte/Iter)     │ Safe              │ 56 Cycles    │ 17.50 ns  │ 1.00x (Baseline)
 Standard Vector Load (vle8.v) │ FATAL PAGE FAULT! │ CRASHED!     │ CRASHED!  │ FAILED (0.0x)
 Non-Faulting Load (vle8ff.v)  │ SAFE & FAST!      │  8 Cycles    │  2.50 ns  │ 7.00x FASTER!
                               │ (vl = 22)         │ (85.7% Cut)  │ (15.0 ns) │ (+600% Gain)
```

##### Engineering Conclusion:
By suppressing speculative page boundary faults and dynamically truncating $vl = 22$, the non-faulting vector load `vle8ff.v` eliminated page boundary crashes entirely while delivering a **$7.00\times$ performance speedup ($600\%$ throughput gain)** over scalar code!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and masking results against memory management principles:

1. **Page Boundary Alignment Verification**:
   * Base address = `0x0FEA`. Page 0 end = `0x0FFF`.
   * Bytes on Page 0 = `0x0FFF` - `0x0FEA` + 1 = $4,095 - 4,074 + 1 = \mathbf{22 \text{ Bytes}}$.
   * MMU fault index $e_{\text{fault}} = 22$.
   * Updated $vl = 22$. Page boundary byte count is $100\%$ exact!
2. **Hard Fault vs Non-Faulting Distinction**:
   * If base address $a0$ were `0x1000` (Unmapped Page 1), $e_{\text{fault}} = 0$.
   * Hard fault rule triggers: $e_{\text{fault}} == 0 \implies$ Page Fault Trap fired immediately!
   * System security and memory protection are $100\%$ preserved.
3. **Null-Terminator Location Check**:
   * String started at `0x0FEA`. Null terminator at `0x0FF8`.
   * Byte offset = `0x0FF8` - `0x0FEA` = $14\text{ bytes}$.
   * Offset $14 < 22$ (valid byte range). Null terminator was safely captured within the 22 valid bytes loaded.

All MMU fault suppression logic, First-Fault Register updates, dynamic $vl$ truncation calculations, and vectorized `strlen()` speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Non-Faulting Vector Load (`vle8ff.v` / `vle32ff.v`)**: A speculative vector memory read instruction that treats Element 0 as a standard hard-faulting access, but suppresses virtual memory page faults and TLB misses for all subsequent elements ($e > 0$), allowing safe vector string and pointer traversals near page boundaries.
* **First-Fault Register (FFR / Dynamic $vl$ Truncation)**: The hardware control mechanism that captures the first faulting element index ($e_{\text{fault}} = i$) during a speculative vector load and dynamically truncates the active vector length register ($vl \Leftarrow i$), committing only valid prior elements ($0 \dots i-1$) to the vector register file without triggering CPU traps.
