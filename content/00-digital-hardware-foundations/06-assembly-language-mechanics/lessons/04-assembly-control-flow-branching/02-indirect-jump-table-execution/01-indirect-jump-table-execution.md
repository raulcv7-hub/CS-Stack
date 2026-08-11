content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/04-assembly-control-flow-branching/02-indirect-jump-table-execution/01-indirect-jump-table-execution.md
# Indirect Jump Table Execution and Control-Flow Integrity Landing Pad Architecture

## The Multi-Case Branching Bottleneck: Why Sequential Switches Destroy Pipeline Throughput

In high-level software development, programs frequently use multi-case decision statements to handle state machines, command parsers, event dispatchers, and object-oriented virtual method calls (`vtable` dispatch). A typical C/C++ `switch (state_id)` statement or network protocol parser might contain 20, 50, or even 100 distinct `case` execution targets.

Suppose an un-optimized software compiler translates a 100-case `switch` statement into a sequential chain of 100 conditional branch instructions (`if (x == 0) goto Case0; else if (x == 1) goto Case1; ...`):

```text
THE SEQUENTIAL BRANCH CHAIN BOTTLENECK (O(N) LATENCY)

 Multi-Case Evaluation Stream (100 Sequential Branches)
 ┌─────────────────────────────────────────────────────────────┐
 │ Case 0 Check: beq x10, x11, Case0  ──► (Not Equal)          │
 │ Case 1 Check: beq x10, x12, Case1  ──► (Not Equal)          │
 │ Case 2 Check: beq x10, x13, Case2  ──► (Not Equal)          │
 │ ...                                                         │
 │ Case 80 Check: beq x10, x90, Case80 ──► (MATCH! TAKEN!)     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Executed 80 Sequential Conditional Branch Instructions!
 (Execution delay scales linearly O(N)! BHT Predictor Flooded!)
```

Trace the physical performance collapse when evaluating this sequential branch chain:
1. **Linear $O(N)$ Time Complexity**: To reach `case 80:`, the CPU must fetch, decode, and evaluate **80 consecutive conditional branch instructions** sequentially! Execution delay scales linearly with the number of cases ($O(N)$ time complexity).
2. **Branch History Table (BHT) Pollution**: Executing 80 sequential branch instructions floods the CPU's front-end Branch History Table (BHT) with 80 separate branch predictions, evicting other active loops from the cache.
3. **Pipeline Misprediction Stalls**: If the `state_id` variable changes randomly on every pass, the front-end predictor misses repeatedly, triggering multiple 15-cycle pipeline flushes!

To achieve constant **$O(1)$ execution time** regardless of whether a `switch` statement contains 5 cases or 5,000 cases, compiler toolchains construct an **Assembly Jump Table** and execute an **Indirect Jump Instruction (`jalr` / `jmp`)**.

However, introducing indirect jumps creates a severe cybersecurity vulnerability: **Control-Flow Hijacking (JOP / ROP Attacks)**.

Unlike a direct jump (`jal label`), which has a fixed target address hardcoded into its instruction word, an **indirect jump instruction (`jalr x0, 0(rs1)`)** sets the Program Counter ($PC$) to an address loaded dynamically from a register ($rs1$).

If a malicious hacker exploits a memory corruption bug (such as a stack buffer overflow) to overwrite register $rs1$ or alter the jump table array in memory:
* The indirect jump instruction executes blindly, jumping to **any arbitrary memory address supplied by the attacker**!
* The attacker jumps into the middle of security-sensitive functions or gadget chains (**Jump-Oriented Programming - JOP**), completely bypassing system security boundaries.

How can a CPU execute $O(1)$ constant-time indirect jump tables while guaranteeing $100\%$ hardware security against Control-Flow Hijacking attacks?

To resolve jump tables in $O(1)$ time while defeating control-flow hijacking attacks, modern computer architectures combine **Hardware Bounds Checking**, **Indirect Jump Instructions (`jalr`)**, and **Control-Flow Integrity (CFI) Landing Pads (`Zicfilp` / `endbr64`)**.

---

## The 100-Story Elevator Keypad and the Security Gate Guard: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of indirect jump tables, $O(1)$ address dispatching, bounds checking, and Control-Flow Integrity landing pads before inspecting assembly jump tables, register scaling, and `Zicfilp` / `CET` hardware specifications, let us consider an everyday analogy: **The 100-Story Skyscraper Elevator**.

Imagine a visitor (**The CPU Execution Engine**) visiting a 100-story corporate skyscraper (**Main System Memory Space**).

```text
THE MULTI-CASE ELEVATOR KEYPAD METAPHOR

 Scenario A: Sequential Hallway Inspection (O(N) Conditional Branches)
 ┌─────────────────────────────────────────────────────────────┐
 │ Floor 1? No. Floor 2? No. Floor 3? No ... Floor 80? YES!    │
 │ (Visitor stops 80 times! Takes 80 seconds!)                 │
 └─────────────────────────────────────────────────────────────┘

 Scenario B: Direct Jump Table Keypad (O(1) Indirect Jump)
 ┌─────────────────────────────────────────────────────────────┐
 │ Press "80" on Keypad -> Lookup Table Entry 80 -> Floor 80!  │
 │ (Elevator shoots directly to Floor 80 in 1 single trip!)    │
 └─────────────────────────────────────────────────────────────┘
```

The visitor needs to reach **Apartment 80** to attend a meeting (**Execute `case 80:`**).

Let us observe three different navigation methods for reaching Apartment 80:

---

### Method A: Sequential Hallway Inspection ($O(N)$ Sequential Branches)

The building has no elevator keypad. On every single floor, a hallway guard stops the visitor:
* *"Are you going to Floor 1? No. Floor 2? No. Floor 3? No..."*

To reach Floor 80, the visitor is stopped and inspected **80 times in a row**!
* The trip takes 80 seconds ($O(N)$ execution delay).
* If the building has 1,000 floors, reaching Floor 800 takes 800 seconds!

---

### Method B: The Direct Jump Table Keypad ($O(1)$ Indirect Jump)

The building manager installs a **Direct Elevator Keypad Array**:
1. The visitor steps into the elevator and types index number `80` into the keypad (**Register $rs1 = 80$**).
2. The elevator reads Row 80 in a master floor directory table sitting in memory (**The Assembly Jump Table Array**).
3. Row 80 contains the exact 64-bit coordinate for Floor 80.
4. The elevator shoots **directly to Floor 80 in 1 single trip** ($O(1)$ time complexity)!

Whether the building has 10 floors or 10,000 floors, reaching any floor takes **exactly 1 single trip**!

---

### Method C: The Security Landing Pad Guard (Control-Flow Integrity `Zicfilp` / `endbr64`)

Now, consider a security threat:
An intruder hacks the elevator keypad, overrides the directory table, types coordinate `0x9999`, and jumps into the middle of a private, locked bedroom (**A Control-Flow Hijacking Attack**)!

To defeat intruders, the building manager installs **Certified Security Landing Pads (`Zicfilp` / `endbr64`)**:

```text
CFI LANDING PAD SECURITY GUARD AT DESTINATION

 Indirect Jump Lands at Target Memory Address
                     │
                     ▼
 [ Is first instruction a Certified Landing Pad (lpad / endbr64)? ]
   ├─► YES ──► Target is certified! Execution continues safely!
   └─► NO  ──► CONTROL-FLOW HIJACKING DETECTED!
               Trip Hardware Trap Exception! (Crash Process!)
```

1. Every valid, public entrance door in the building is marked with a **Special Certified Landing Pad Sign (`endbr64` in x86 / `lpad` in RISC-V Zicfilp)**.
2. Whenever the elevator executes an indirect jump, the security guard standing at the destination door checks:
   * *"Is there a Certified Landing Pad Sign on this door?"*
   * **IF YES**: The visitor enters safely!
   * **IF NO** (The jump landed on an un-certified instruction or inside a private bedroom): The security guard **TRIPS THE EMERGENCY ALARM (Control-Flow Integrity Exception Trap)** and shuts down the building instantly!

This elevator system is the exact physical analogue of **Indirect Jump Tables and Control-Flow Integrity**:
* Typing index 80 into the keypad is passing a `switch` index in register $x10$ to an **Indirect Jump Instruction (`jalr` / `jmp`)**.
* The master floor directory table is an **Assembly Jump Table (`.rodata` Array of Pointers)**.
* The 1-trip elevator ride is **$O(1)$ Constant-Time Memory Dispatch**.
* The Certified Security Landing Pad Sign is **Hardware Control-Flow Integrity (`Zicfilp` / `endbr64`)**.

---

## Primitive 1: Indirect Jump Instructions (`jalr` / `jmp`) and Bounds Checking

Now that we possess an intuitive mental model of elevator keypads, master directory tables, and security landing pads, let us examine the formal engineering mechanics of **Indirect Jump Instructions** and **Jump Tables**.

> **An Indirect Jump Instruction (`jalr` / `jmp`)** is a control flow instruction that sets the Program Counter ($PC$) to a target memory address loaded dynamically from an architectural register ($rs1$), enabling $O(1)$ constant-time jump table dispatches for multi-case `switch` statements and virtual method calls.

```text
INDIRECT JUMP (JALR) HARDWARE EXECUTION DATAPATH

 Base Address Register rs1 (holds Jump Table Entry Pointer)
  │ (64 Bits)
  ▼
 [ Sign-Extend(Imm12) Offset ] ──► [ 64-Bit AGU Adder ] ──► Target Address EA
                                                                 │
                                                                 ▼
 Program Counter (PC) <= EA & ~1 ◄───────────────────────────────┘
 (Sets PC directly to register contents! Dynamic jump in 1 cycle!)
```

---

### Anatomy of an Assembly Jump Table

An **Assembly Jump Table** is an array of 64-bit memory address pointers stored in the read-only data section (`.rodata`). Entry $k$ inside the jump table holds the starting address of `case k:`.

```riscv
# JUMP TABLE STRUCTURE IN READ-ONLY DATA SECTION (.rodata)

.rodata
.align 3                     # 8-byte alignment (2^3 = 8)
switch_jump_table:
    .dword case_0_handler    # Entry 0: 64-bit pointer to case 0 code
    .dword case_1_handler    # Entry 1: 64-bit pointer to case 1 code
    .dword case_2_handler    # Entry 2: 64-bit pointer to case 2 code
    .dword case_3_handler    # Entry 3: 64-bit pointer to case 3 code
```

---

### The Mandatory Hardware Bounds Check

Before indexing a jump table, the processor **MUST execute an Unsigned Bounds Check** on the input `switch` index variable.

Why is bounds checking mandatory?
If a program has 4 `switch` cases ($0 \dots 3$), but a user inputs index $x10 = 99$ or $x10 = -1$, reading `switch_jump_table[99]` accesses arbitrary memory outside the table, jumping to garbage addresses!

```riscv
# HARDWARE BOUNDS CHECKING AND JUMP TABLE DISPATCH (RISC-V)

# Input: x10 holds the switch case index variable (state_id)

    li   x11, 4                  # 1. Load maximum case count N_max = 4
    bgeu x10, x11, default_case  # 2. UNSIGNED BOUNDS CHECK: IF x10 >= 4, jump to default!

    # --- 3. CALCULATE JUMP TABLE ENTRY ADDRESS ---
    la   x13, switch_jump_table  # Load base address of jump table into x13
    slli x12, x10, 3             # Scale index: x12 <= x10 * 8 (8 bytes per pointer)
    add  x12, x13, x12           # x12 <= Base_Addr + (state_id * 8)

    # --- 4. EXECUTE INDIRECT JUMP ---
    ld   x14, 0(x12)             # Read 64-bit target pointer from jump table into x14
    jalr x0, 0(x14)              # Indirect Jump: PC <= x14 (Jumps to case code in O(1) time!)

default_case:
    # ... Default case handling ...
    ret
```

Let us trace this $O(1)$ dispatch sequence:
1. **Unsigned Bounds Check (`bgeu x10, x11`)**: Verifies $0 \le x10 < 4$ in 1 single instruction. (Unsigned comparison treats negative numbers as large numbers $> 4$, capturing both upper and lower bounds!).
2. **Offset Scaling (`slli x12, x10, 3`)**: Multiplies index $x10$ by 8 bytes ($x10 \ll 3$).
3. **Pointer Read (`ld x14, 0(x12)`)**: Reads the 64-bit target address from `.rodata`.
4. **Indirect Jump (`jalr x0, 0(x14)`)**: Sets $PC \Leftarrow x14$. Execution jumps directly to the target `case` code in **$O(1)$ constant time**!

---

## Primitive 2: Control-Flow Integrity (CFI) Landing Pads (`Zicfilp` / `endbr64`)

Now let us examine the second core primitive: **Control-Flow Integrity (CFI) Landing Pads**.

While jump tables achieve $O(1)$ execution speed, indirect jumps (`jalr x0, 0(x14)`) present a severe security risk:
If a hacker exploits a memory bug to overwrite register `x14` or the jump table in RAM, the CPU will jump to whatever illegal address the hacker supplied (**Jump-Oriented Programming - JOP Attack**)!

To defeat JOP attacks at the hardware hardware level, modern CPU architectures enforce **Forward-Edge Control-Flow Integrity (CFI)**.

```text
CONTROL-FLOW INTEGRITY (CFI) LANDING PAD ARCHITECTURE

 Indirect Jump Execution: jalr x0, 0(x14)  ──► Target Address: 0x00402000
                                                     │
                                                     ▼
 [ CPU Hardware Checks First Instruction at Target Address 0x00402000 ]
  ├─► Is Instruction a Certified Landing Pad? (lpad / endbr64)
  │    ├─► YES ──► Target is certified! Execution continues safely!
  │    └─► NO  ──► SECURITY VIOLATION!
  │                Assert Hardware CFI Fault Exception Trap! (Kills Process!)
```

---

### The Landing Pad Invariant

Under hardware Control-Flow Integrity (such as RISC-V **`Zicfilp` extension**, Intel **`CET / IBT` (`endbr64`)**, or ARM **`v8.5-A BTI` (`bti`)**):

> **The CFI Landing Pad Invariant**: Whenever an indirect jump (`jalr` / `jmp`) executes, the very first instruction located at the destination target memory address MUST be a specialized **Landing Pad Instruction (`lpad` / `endbr64`)**.

```text
CFI LANDING PAD INSTRUCTIONS ACROSS ARCHITECTURES

 Architecture │ Extension Name │ Landing Pad Mnemonic │ Hardware Security Action
──────────────┼────────────────┼──────────────────────┼─────────────────────────────────────────────
 RISC-V 64    │ Zicfilp        │ lpad label_id        │ Verifies 20-bit label ID match on indirect jump
 x86-64       │ Intel CET      │ endbr64              │ End Branch 64-bit Landing Pad Marker
 ARM64        │ ARMv8.5-A BTI  │ bti c / bti j        │ Branch Target Identification Marker
```

---

### How Hardware Enforces Landing Pad Security

When a CPU with `Zicfilp` or `CET` enabled executes an indirect jump (`jalr x0, 0(x14)`):

1. **State Machine Activation**: The CPU sets an internal hardware state flag: $\text{CFI\_State} \Leftarrow \text{WAITING\_FOR\_LPAD}$.
2. **Instruction Fetch at Target**: The CPU fetches the first 32-bit instruction word from destination address $PC_{\text{target}}$.
3. **Hardware Landing Pad Audit**:
   * If the instruction at $PC_{\text{target}}$ is a valid **`lpad` / `endbr64`** instruction, the hardware state resets ($\text{CFI\_State} \Leftarrow \text{NORMAL}$) and execution continues safely!
   * If the instruction at $PC_{\text{target}}$ is **NOT a landing pad** (meaning the jump landed in the middle of code or on an un-certified memory address):
     * The CPU **instantly asserts a Control-Flow Integrity Fault Exception Trap (`mcause = 2`)**!
     * The pipeline is flushed, and the process is killed in $1\text{ clock cycle}$ before the attacker can execute a single malicious instruction!

```riscv
# TARGET CASE HANDLERS WITH CFI LANDING PADS (RISC-V ZICFILP)

.text
case_0_handler:
    lpad 0                    # 1. HARDWARE LANDING PAD (Certified Entry Point!)
    # ... Case 0 Execution Logic ...
    ret

case_1_handler:
    lpad 0                    # 1. HARDWARE LANDING PAD (Certified Entry Point!)
    # ... Case 1 Execution Logic ...
    ret
```

---

## Real-World Silicon Engineering: Indirect Branch Target Buffers (IBTB) and Vtables

In commercial high-frequency microprocessors, indirect jumps present two physical performance challenges:

### 1. Indirect Branch Target Buffer (IBTB) Prediction

Unlike direct jumps (`jal`), whose target address is fixed at compile time, an indirect jump (`jalr x0, 0(x14)`) can jump to a different memory address on every execution pass (for example, a C++ virtual method call `shape->draw()` where `shape` changes from `Circle` to `Square` to `Triangle`).

To prevent 3-cycle pipeline stalls on indirect jumps:
* Modern CPUs incorporate an **Indirect Branch Target Buffer (IBTB)**.
* The IBTB uses a multi-entry SRAM cache indexed by recent branch history to predict the target address of $x14$ in Stage 1 (IF).
* If the IBTB predicts correctly, the indirect jump executes with **0 stall cycles**!

---

### 2. C++ Virtual Method Table (Vtable) Dispatch

In object-oriented programming (C++ / Rust trait objects), calling a virtual function executes an indirect jump through an in-memory **Vtable Array**:

```cpp
// C++ VIRTUAL METHOD CALL
Shape* shape = get_shape();
shape->draw(); // Compiles to an Indirect Jump through Vtable!
```

```riscv
# ASSEMBLY COMPILATION OF C++ VIRTUAL METHOD CALL
ld   x10, 0(x20)       # 1. Read Vtable Pointer from Object at 0(x20)
ld   x14, 16(x10)      # 2. Read draw() function pointer from Vtable at offset 16
jalr ra, 0(x14)        # 3. Indirect Call to draw() method!
```

At the destination `draw()` method, the first instruction is **`lpad`**, validating the virtual method call under hardware CFI!

---

## Solved Industrial Engineering Exercise: 10-Case Jump Table Synthesis, Bounds Checking, CFI Landing Pad Audit, and Execution Latency

To consolidate your complete mastery of indirect jump table execution, bounds checking math, $O(1)$ dispatching, and Control-Flow Integrity landing pads (`Zicfilp` / `endbr64`), we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing a 10-case state-machine dispatch kernel for a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$) supporting the `Zicfilp` Control-Flow Integrity extension.

The processor evaluates a multi-case state machine `switch (state_id)` where $0 \le \text{state\_id} \le 9$ ($10\text{ total cases}$).

```text
3.2 GHz PROCESSOR JUMP TABLE DISPATCH PIPELINE

 CPU Core (3.2 GHz) ──► [ Bounds Checker ] ──► [ Jump Table Read ] ──► jalr + lpad Check
 Clock T = 312.5 ps     Unsigned Comparison    Reads .rodata Pointer    CFI Security Audit
```

#### Hardware & Software Parameters:
* State ID input variable sits in register `x10` (`a0`).
* Base address of `switch_jump_table` = `0x0000_0000_1000_2000`.
* Jump Table entries stored in `.rodata` as 64-bit absolute address pointers ($8\text{ bytes per entry}$).
* L1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Indirect Jump Execution Latency = $1\text{ clock cycle}$ (assuming IBTB hit).

#### Test Execution Scenarios:
* **Scenario A (Valid Case 7 Access)**: Input `x10 = 7`. Jump Table entry 7 points to `case_7_handler` at address `0x0000_0000_0040_3000`.
* **Scenario B (Out-of-Bounds Index Access)**: Input `x10 = 15` ($15 \ge 10$).
* **Scenario C (Security Intrusion Attempt)**: An attacker overwrites Jump Table entry 3 with address `0x0000_0000_0040_3004` (pointing to the middle of `case_3_handler`, bypassing the `lpad` instruction at `0x0000_0000_0040_3000`).

#### Your Objective

1. Write the complete, valid RISC-V 64-bit assembly implementation for the `switch` dispatch kernel, including:
   * Unsigned bounds checking (`bgeu`) against $N_{\text{max}} = 10$.
   * Jump Table base address loading (`la x13, switch_jump_table`).
   * Offset scaling (`slli x12, x10, 3`).
   * Pointer loading (`ld x14, 0(x12)`).
   * Indirect jump (`jalr x0, 0(x14)`).
2. Trace **Scenario A (`x10 = 7`)**: Calculate the exact memory address read in `.rodata`, verify bounds checking pass, and show the target jump destination.
3. Trace **Scenario B (`x10 = 15`)**: Show how the unsigned bounds checker prevents out-of-bounds memory reading and redirects execution to `default_case_handler`.
4. Trace **Scenario C (Security Intrusion Attempt)**: Show how the hardware `Zicfilp` landing pad check detects that `0x00403004` lacks an `lpad` instruction, triggering an **Illegal Instruction / CFI Exception Trap**.
5. Calculate total execution cycles and physical execution time (in nanoseconds) for processing Scenario A.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Write the Complete Assembly Jump Table Kernel

```riscv
# COMPLETE 10-CASE JUMP TABLE DISPATCH KERNEL WITH BOUNDS CHECKING

.text
.global dispatch_state_machine
dispatch_state_machine:
    # --- STEP 1: UNSIGNED BOUNDS CHECKING ---
    li   x11, 10                  # Load N_max = 10 into x11
    bgeu x10, x11, default_handler # IF state_id >= 10 (Unsigned), jump to default!

    # --- STEP 2: CALCULATE JUMP TABLE ENTRY ADDRESS ---
    la   x13, switch_jump_table   # x13 <= Base Address 0x10002000
    slli x12, x10, 3              # x12 <= state_id * 8 (Offset in bytes)
    add  x12, x13, x12            # x12 <= 0x10002000 + (state_id * 8)

    # --- STEP 3: READ TARGET POINTER AND EXECUTE INDIRECT JUMP ---
    ld   x14, 0(x12)              # Read 64-bit target pointer from jump table
    jalr x0, 0(x14)               # Indirect jump to target in x14!

default_handler:
    # ... Default case logic ...
    ret

# --- JUMP TABLE IN READ-ONLY DATA SECTION (.rodata) ---
.rodata
.align 3                          # 8-byte natural alignment
switch_jump_table:
    .dword case_0_handler
    .dword case_1_handler
    .dword case_2_handler
    .dword case_3_handler
    .dword case_4_handler
    .dword case_5_handler
    .dword case_6_handler
    .dword case_7_handler
    .dword case_8_handler
    .dword case_9_handler

# --- CASE HANDLERS WITH CFI LANDING PADS ---
.text
case_7_handler:
    lpad 7                        # CFI LANDING PAD (Valid Target Marker!)
    # ... Case 7 Logic ...
    ret
```

---

#### Step 2: Trace Scenario A (Valid Case 7 Access, `x10 = 7`)

1. **Bounds Check**:
   * Evaluates `bgeu x10, x11` ($7 \ge 10 \implies \mathbf{\text{FALSE!}}$).
   * Bounds check passes cleanly!
2. **Offset Scaling**:
   * $x12 \Leftarrow 7 \times 8 = \mathbf{56_{10} \text{ bytes }} (\text{0x38}_{16})$.
3. **Jump Table Entry Memory Address Calculation**:
   * $EA_{\text{table}} = \text{0x10002000} + \text{0x38} = \mathbf{\text{0x10002038}}$.
4. **Pointer Read**:
   * `ld x14, 0(x12)` reads memory at `0x10002038`.
   * Memory contains pointer `0x0000_0000_0040_3000` (`case_7_handler`).
5. **Indirect Jump Execution**:
   * `jalr x0, 0(x14)` sets $PC \Leftarrow \mathbf{\text{0x0000\_0000\_0040\_3000}}$.
6. **CFI Landing Pad Verification**:
   * First instruction at `0x00403000` is **`lpad 7`**.
   * Hardware verifies valid landing pad! **Execution continues safely!**

---

#### Step 3: Trace Scenario B (Out-of-Bounds Index, `x10 = 15`)

1. **Bounds Check**:
   * Evaluates `bgeu x10, x11` ($15 \ge 10 \implies \mathbf{\text{TRUE!}}$).
2. **Branch Taken**:
   * Execution branches directly to `default_handler`.
   * **Zero memory reads from the Jump Table occur!** Out-of-bounds memory reading is $100\%$ prevented!

---

#### Step 4: Trace Scenario C (Security Intrusion Attempt to `0x00403004`)

1. Attacker overwrites Jump Table entry 3 with `0x00403004` (skipping the 4-byte `lpad 7` instruction at `0x00403000`).
2. `jalr x0, 0(x14)` jumps to $PC \Leftarrow \text{0x00403004}$.
3. **Hardware CFI Audit**:
   * The hardware checks the first 32-bit instruction word at `0x00403004`.
   * Instruction at `0x00403004` is a standard arithmetic instruction, **NOT an `lpad` instruction**!
4. **Hardware Response**:
   * The CPU asserts the **Control-Flow Integrity Fault Exception Trap**!
   * The pipeline is instantly flushed, `mcause` is loaded with the CFI fault code, and the process is killed!

```text
SCENARIO C SECURITY INTRUSION TRACE

 Target Address Jumped To : 0x00403004 (Skipped lpad instruction!)
 Instruction at 0x00403004: addi x10, x10, 1 (NOT AN LPAD INSTRUCTION!)
                            │
                            ▼
 HARDWARE CFI SECURITY FAULT ASSERTED!
 Pipeline Flushed! Process Killed in 1 Clock Cycle! (JOP Attack Defeated!)
```

---

#### Step 5: Calculate Execution Latency for Scenario A

Let us trace execution clock cycles for Scenario A:
* `li x11, 10`: 1 cycle.
* `bgeu x10, x11`: 1 cycle (Branch Not Taken).
* `la x13, switch_jump_table`: 1 cycle.
* `slli x12, x10, 3`: 1 cycle.
* `add x12, x13, x12`: 1 cycle.
* `ld x14, 0(x12)`: 1 cycle (L1D Cache Hit).
* `jalr x0, 0(x14)`: 1 cycle (IBTB Hit + `lpad` check).

$$\text{Total Execution Cycles} = 1 + 1 + 1 + 1 + 1 + 1 + 1 = \mathbf{7 \text{ Clock Cycles}}$$

$$\text{Total Physical Time} = 7 \text{ cycles} \times 0.3125 \text{ ns/cycle} = \mathbf{2.1875 \text{ nanoseconds}}$$

Whether `state_id` was $0, 3, 7,$ or $9$, the dispatch kernel completes in **$2.1875\text{ nanoseconds}$ ($7\text{ clock cycles}$)**—achieving true $O(1)$ constant-time execution!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and security results:

1. **Jump Table Offset Math**:
   * Base = `0x10002000`. Index $7 \times 8 = 56_{10} = \text{0x38}_{16}$.
   * Target entry address = `0x10002000` $+ \text{0x38} = \text{0x10002038}$. Correct!
2. **Bounds Checking Logic Verification**:
   * Unsigned `bgeu` handles both large positive indices ($15 \ge 10$) and negative numbers (in Two's Complement, $-1 = \text{0xFF...FF} \ge 10$ unsigned). Both redirect to `default_handler` safely!
3. **CFI Security Compliance**:
   * `lpad` instruction present at `0x00403000` allowed valid jump.
   * Absence of `lpad` at `0x00403004` triggered an immediate hardware CFI trap, defeating the JOP attack.

All jump table address derivations, bounds checking unsigned logic proofs, CFI landing pad security checks, and $O(1)$ execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Indirect Jump Instruction (`jalr` / `jmp`)**: A control flow instruction that sets the Program Counter ($PC$) to a target memory address stored dynamically inside a register ($rs1$), enabling $O(1)$ constant-time jump table array dispatches for multi-case `switch` statements and virtual method calls.
* **Control-Flow Integrity Landing Pad (`Zicfilp` / `endbr64`)**: A hardware security primitive (`lpad` in RISC-V Zicfilp or `endbr64` in x86-64 CET) that mandates that all indirect jumps MUST land on a certified landing pad instruction at the target destination, instantly triggering a hardware exception trap if an indirect jump attempts to land on an un-certified memory address.
