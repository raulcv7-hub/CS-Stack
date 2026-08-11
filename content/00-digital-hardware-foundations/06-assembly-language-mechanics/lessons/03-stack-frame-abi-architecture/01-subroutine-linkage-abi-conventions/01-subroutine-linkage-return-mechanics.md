content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/03-stack-frame-abi-architecture/01-subroutine-linkage-abi-conventions/01-subroutine-linkage-return-mechanics.md
# Subroutine Linkage Mechanics and Return Address Register Architecture

## The Stranded Program Counter Hazard: Why Simple Jumps Break Function Returns

In computer software execution, the central processing unit (CPU) reads and executes machine instructions sequentially from memory. The exact location of the instruction currently being executed is tracked by a dedicated 64-bit hardware register inside the CPU front-end called the **Program Counter ($PC$)**. On every standard execution cycle, the hardware automatically increments the Program Counter ($PC \Leftarrow PC + 4$) to fetch the next sequential instruction word from the Level 1 Instruction Cache.

However, modern software is built around modular, reusable blocks of code called **Subroutines** (also known as functions, procedures, or methods). 

When a program needs to execute a subroutine—such as computing a square root, rendering a graphics polygon, or formatting a text string—the CPU must interrupt its sequential flow, jump to the starting memory address of the subroutine, execute its instructions, and then **return back to the exact caller instruction where it left off**.

Now, consider what occurs at the physical silicon level if an Instruction Set Architecture (ISA) attempts to execute function calls using a simple, unconditional jump instruction (`jump target` / `j label`):

```text
THE STRANDED PROGRAM COUNTER HAZARD (UN-LINKED JUMP)

 Main Program Code Stream (Caller 1)           Subroutine Code (Callee)
 ┌────────────────────────────────────────┐    ┌──────────────────────────────┐
 │ Addr 0x00401000 : j my_function        ├───►│ Addr 0x00402000 : my_function│
 │ Addr 0x00401004 : addi x10, x10, 1     │    │   # ... Do work ...          │
 └────────────────────────────────────────┘    │ Addr 0x00402020 : j ???      │
                                               └──────────────┬───────────────┘
 Main Program Code Stream (Caller 2)                          │
 ┌────────────────────────────────────────┐                   │
 │ Addr 0x00401050 : j my_function        ├───────────────────┘
 │ Addr 0x00401054 : sub x11, x11, x12    │  Where should 'my_function' jump
 └────────────────────────────────────────┘  back to? Address 0x1004 or 0x1054?
                                             (THE ORIGIN LOCATION IS LOST!)
```

Trace the physical hardware failure when a simple jump instruction executes:
1. **The Jump Execution**: At address `0x00401000`, the CPU executes `j my_function`. The hardware sets the Program Counter to the subroutine's entry address: $PC \Leftarrow \text{0x00402000}$.
2. **Subroutine Execution**: The CPU executes the instructions inside `my_function`.
3. **The Return Failure**: The subroutine finishes its work at address `0x00402020`. It must now jump back to the instruction immediately following the call site (`0x00401004`).
4. **THE STRANDED PC HAZARD**: Because the simple jump instruction `j my_function` overwrote $PC$ without saving the previous location (`0x00401004`), **the origin return address was erased and lost forever**!

If the subroutine attempts to hardcode a return jump back to `0x00401004` (`j 0x00401004`), the function can be called from **only one single place** in the entire computer program!

If a second caller at address `0x00401050` calls `my_function`, the hardcoded return jump will erroneously send execution back to `0x00401004` (Caller 1) instead of `0x00401054` (Caller 2)! 

The program branches to the wrong memory location, executes completely unrelated code, corrupts registers, and crashes!

The hardware cannot guess where to return. To allow subroutines to be invoked from thousands of different memory locations throughout a program and return to their exact origin with $100\%$ precision, CPU hardware incorporates **Subroutine Linkage (`jal` / `call`)** and the **Return Address Register (`ra` / `x1`)**.

---

## The Traveler and the Automatic GPS Bookmark: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of subroutine linkage, return address preservation, and call-and-return execution paths before analyzing instruction encodings and stack frame memory layouts, let us consider an everyday analogy: **The Traveler and the Automatic GPS Return Bookmark**.

Imagine a business traveler (**The CPU Execution Core**) following a step-by-step printed travel itinerary (**The Main Program Code Stream**).

```text
THE TRAVELER AND THE RETURN BOOKMARK METAPHOR

 Master Travel Itinerary (Main Program)       Chicago Branch Office (Subroutine)
 ┌────────────────────────────────────────┐   ┌──────────────────────────────┐
 │ Step 12 (Address 1000):                │   │ Step 1: Sign Contract        │
 │ "Fly to Chicago Branch Office!"        ├──►│ Step 2: Seal Documents       │
 ├────────────────────────────────────────┤   │ Step 3: Return Home!         │
 │ Step 13 (Address 1004):                │   └──────────────┬───────────────┘
 │ "Continue with Local Operations..."    │◄─────────────────┘
 └────────────────────────────────────────┘   (Where should the traveler fly
                                               back to? Step 13 or Step 85?)
```

The traveler reads their master itinerary page by page ($PC = \text{Current Step}$):
* At **Step 12 (Address 1000)**, the itinerary says: *"Fly immediately to the Chicago Branch Office to sign a contract, then return here to continue with Step 13 (Address 1004)!"*
* At **Step 84 (Address 2000)**, the itinerary *also* says: *"Fly immediately to the Chicago Branch Office to sign a contract, then return here to continue with Step 85 (Address 2004)!"*

Let us observe two different ways the traveler handles these trips:

---

### Strategy A: The Blind Flight (Plain Unconditional Jump)

The traveler reads Step 12: *"Fly to Chicago!"*
1. The traveler jumps on a plane and flies to Chicago without leaving a bookmark or recording where they came from.
2. The traveler signs the contract in Chicago.
3. The traveler finishes their work and looks at the Chicago wall map: *"Where do I fly back to?"*
4. **The Traveler is Stranded!** The traveler forgot whether they flew out from Step 13 (Address 1004) or Step 85 (Address 2004). They guess randomly, fly back to Step 85, execute the wrong business deal, and the corporation goes bankrupt!

This is the **Stranded Program Counter Hazard**.

---

### Strategy B: The Automatic GPS Return Bookmark (`jal` / `call`)

The airline company installs an **Automated GPS Return Bookmark Device (`jal ra, Chicago`)**:

```text
AUTOMATIC GPS RETURN BOOKMARK IN ACTION

 Step 12 (Address 1000): Executing `jal ra, Chicago`
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Save Return Address (1000 + 4 = 1004) into ra Pocket Note!│
 │ 2. Set Current Position PC <= Chicago Address (0x2000)      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 In Chicago: Finishing work ──► Read ra Pocket Note (1004) ──► Fly directly to 1004!
 (Return location preserved perfectly regardless of where the call came from!)
```

Look at how Strategy B operates:
1. **At Step 12 (Address 1000)**, the traveler steps onto the plane to Chicago (`jal ra, Chicago`).
2. **The Automatic Link Action**: Before the plane leaves the ground, the automatic GPS device calculates the traveler's next sequential step ($1000 + 4 = \mathbf{1004}$) and writes the number `1004` into a dedicated pocket notebook named **`ra` (The Return Address Register)**!
3. The traveler flies to Chicago and signs the contract.
4. When finished, the traveler checks their `ra` pocket notebook: *"Return Address = Step 13 (Address 1004)!"*
5. The traveler flies directly back to Address 1004 and continues their itinerary smoothly!

Now, observe what happens when a different traveler calls Chicago from **Step 84 (Address 2000)**:
1. The GPS device automatically writes $2000 + 4 = \mathbf{2004}$ into the `ra` pocket notebook!
2. The traveler flies to Chicago, finishes work, checks `ra`, and flies directly back to **Address 2004**!

Look at what Strategy B achieved:
* The Chicago office did not need to know where the caller came from in advance.
* The automatic GPS device saved the exact return link ($PC + 4$) into register `ra` **in 1 single step during the jump**!
* The subroutine can be called from New York, London, Paris, or Tokyo—it will ALWAYS return to the exact caller that invoked it!

This automatic GPS return bookmark is the exact physical analogue of **Subroutine Linkage**:
* The master travel itinerary is **Main Program Code Space in RAM**.
* Flying to Chicago is the **Jump-and-Link Instruction (`jal` / `call`)**.
* The pocket notebook is the **Return Address Register (`ra` / $x1$)**.
* Address 1004 ($PC + 4$) is the **Return Link Address**.
* Flying back to Address 1004 is the **Register-Indirect Return Jump (`jalr x0, 0(ra)` / `ret`)**.

---

## Primitive 1: Subroutine Linkage (`jal` / `call`)

Now that we possess a clear intuitive mental model of automatic GPS return bookmarks, let us examine the formal, rigorous engineering mechanics of **Subroutine Linkage**.

> **Subroutine Linkage** is a hardware hardware execution mechanism where a jump instruction atomically calculates the return address of the next sequential instruction ($PC + 4$) and writes it into a designated architectural register (the Return Address Register `ra`) *at the exact same physical clock cycle* that it loads the Program Counter ($PC$) with the target subroutine's starting address.

```text
JUMP-AND-LINK (JAL) ATOMIC HARDWARE DATAPATH

 Current Instruction: jal ra, target_subroutine (at Address PC)
  │
  ├─► Return Link Adder  ──► Return_Address <= PC + 4 ──► Write to Register ra (x1)
  │                                                        (Saved in 1 Clock Cycle!)
  └─► Branch Target Adder──► Target_Address <= PC + Imm ──► Write to Program Counter (PC)
                                                           (Jumps to Subroutine!)
```

---

### The Hardware Mechanics of Jump-and-Link (`jal rd, offset`)

In modern 32-bit RISC architectures (such as RISC-V RV32I/RV64I), the primary subroutine linkage instruction is **`jal` (Jump and Link)**.

`jal` uses the 21-bit signed J-type immediate format to encode a relative byte displacement offset ($Imm21$).

When the CPU pipeline executes `jal rd, offset` at memory address $PC$:

$$\text{Hardware Equation 1 (Link Step): } \mathbf{rd \Leftarrow PC + 4}$$

$$\text{Hardware Equation 2 (Jump Step): } \mathbf{PC \Leftarrow PC + \text{SignExtend}(Imm21)}$$

Where:
* $rd$ is the architectural destination register selected to hold the return link (by ABI convention, $rd = x1 = \mathtt{ra}$).
* $PC$ is the 64-bit memory address of the `jal` instruction currently being executed.
* $PC + 4$ is the memory address of the next sequential instruction immediately following `jal`.
* $Imm21$ is the 21-bit signed immediate displacement offset embedded inside the instruction word.

Look at the atomic perfection of this hardware design:
1. **Zero Multi-Instruction Overhead**: The return address ($PC + 4$) is computed and written to register $rd$ **in the exact same clock cycle** that $PC$ jumps to the target address!
2. **Zero Memory Accesses**: The return address is stored in a fast, local SRAM register (`ra`), requiring zero off-chip memory bus access!

---

### Symbolic Assembly Pseudo-Instructions: `call` and `tail`

To simplify software development, assembly language pre-processors provide high-level pseudo-instructions that map directly onto `jal`:

```text
SUBROUTINE CALL PSEUDO-INSTRUCTION EXPANSION

 High-Level Assembly Code │ Real Hardware Instruction Executed │ Target Distance Range
──────────────────────────┼────────────────────────────────────┼─────────────────────────
 call target_function     │ jal ra, target_offset              │ Within +- 1 Megabyte
 call distant_function    │ auipc ra, upper20                  │ Anywhere in 32-Bit
                          │ jalr  ra, lower12(ra)              │ Address Space (+- 2 GB!)
 tail function_name       │ jal   x0, function_name            │ Tail Call (Discards ra!)
```

1. **Near Subroutine Calls (`call target`)**:
   If the target subroutine is located within $\pm 1\text{ Megabyte}$ ($\pm 2^{20}\text{ bytes}$) of the current $PC$, the assembler translates `call target` into a single 32-bit instruction:
   $$\mathtt{call \ target} \quad \mathbf{\longrightarrow} \quad \mathbf{\mathtt{jal \ ra, \ target\_offset}}$$

2. **Distant Subroutine Calls (`call distant_target`)**:
   If the target subroutine is located beyond $1\text{ Megabyte}$ (up to $\pm 2\text{ Gigabytes}$ away), the assembler expands `call` into a 2-instruction composite sequence using `auipc` and `jalr`:
   ```riscv
   auipc ra, %pcrel_hi(distant_target) # ra <= PC + (Upper 20 Bits << 12)
   jalr  ra, %pcrel_lo(label)(ra)      # ra <= PC + 4; PC <= ra + Lower 12 Bits
   ```

---

## Primitive 2: The Return Address Register (`ra` / `x1`) and Register Return Jump (`ret`)

Now let us examine the second core primitive: **The Return Address Register (`ra` / `x1`)** and the register return jump (`ret`).

In standard RISC-V Application Binary Interface (ABI) conventions, register **$x1$** is assigned the dedicated role of **Return Address Register (`ra`)**.

> **The Return Address Register (`ra` / $x1$)** is a general-purpose architectural register reserved by software ABI agreements specifically to hold the 64-bit return address ($PC + 4$) generated by subroutine call instructions (`jal` / `call`).

---

### Mechanics of the Register-Indirect Return Jump (`jalr`)

When a subroutine finishes executing its instructions, it must read the return address stored in register `ra` ($x1$) and set the Program Counter back to that location.

How does the processor execute a jump to an address held inside a register?

It uses **`jalr` (Jump and Link Register)**—an I-type instruction that performs an unconditional register-indirect jump:

$$\text{jalr rd, offset(rs1)}$$

When `jalr rd, offset(rs1)` executes in hardware:

$$\text{Temp} \Leftarrow PC + 4$$

$$\mathbf{PC \Leftarrow (\text{RegisterFile}[rs1] + \text{SignExtend}(Imm12)) \quad \mathbf{\&} \quad \sim 1}$$

$$\mathbf{rd \Leftarrow \text{Temp}}$$

Where:
* $rs1$ is the source base register holding the target address (for function returns, $rs1 = \mathtt{ra} = x1$).
* $Imm12$ is a 12-bit signed immediate displacement offset (for standard returns, $Imm12 = 0$).
* $\sim 1$ clears bit 0 of the calculated address, ensuring that the target $PC$ is always 2-byte or 4-byte aligned!
* $rd$ is the destination register selected to receive $PC + 4$.

---

### The `ret` Pseudo-Instruction (The Zero-Register Bit Sink Trick)

To execute a function return, the subroutine needs to jump to `ra`, but it does **NOT** want to overwrite another register with $PC + 4$!

How does `jalr` discard the new $PC + 4$ link value when executing a return?

It sets destination register $rd$ to **`x0` (the hardwired zero register)**!

$$\mathbf{\mathtt{jalr \ x0, \ 0(ra)}}$$

Look at what happens during `jalr x0, 0(ra)`:
1. $PC$ is set to $\text{RegisterFile}[ra] + 0 = \mathbf{\text{Return Address}}$.
2. The hardware attempts to write $PC + 4$ into destination register `x0`.
3. Because $x0$ is hardwired to Ground, **the link value is safely discarded into the $x0$ Bit Sink**!

#### The Assembly Pseudo-Instruction: `ret`
To keep assembly code clean, the assembler provides the **`ret` (Return)** pseudo-instruction:

$$\mathbf{\mathtt{ret}} \quad \mathbf{\longrightarrow} \quad \mathbf{\mathtt{jalr \ x0, \ 0(ra)}}$$

Every time an assembly programmer writes `ret`, the assembler expands it into `jalr x0, 0(ra)`, returning execution to the caller in **1 single clock cycle**!

```text
SUBROUTINE CALL AND RETURN INSTRUCTION MATCH

 Caller Code (Main Program)                  Subroutine Code (Callee)
 ┌──────────────────────────────────────┐    ┌──────────────────────────────┐
 │ Addr 0x00401000: call my_function    ├───►│ Addr 0x00402000: my_function │
 │   (Sets ra <= 0x00401004)            │    │   # ... Do work ...          │
 ├──────────────────────────────────────┤    │ Addr 0x0040201C: ret         │
 │ Addr 0x00401004: addi x10, x10, 1    │◄───┤   (Executes jalr x0, 0(ra))  │
 │   (Execution resumes here!)          │    └──────────────────────────────┘
 └──────────────────────────────────────┘
```

---

## The Nested Call Hazard: Why Non-Leaf Subroutines Must Save `ra`

Now we encounter a critical multi-function execution hazard that every systems software engineer must master: **The Nested Subroutine Return Address Overwrite Hazard**.

### Leaf Functions vs. Non-Leaf Functions

In software engineering, functions are classified into two structural categories:

1. **Leaf Functions**: A subroutine that performs its work **WITHOUT calling any other subroutines**. A leaf function is the "end of the branch" in the call tree.
2. **Non-Leaf Functions**: A subroutine that calls one or more other subroutines during its execution.

```text
LEAF VS NON-LEAF CALL TREE TOPOLOGY

 Leaf Function (Safe in ra):
 main() ──► jal ra, leaf_function() ──► ret (Returns safely to main!)

 Non-Leaf Function (Corrupts ra if un-saved!):
 main() ──► jal ra, non_leaf_func() ──► jal ra, helper_func() ──► OVERWRITES ra!
```

---

### The Nested Call Register Corruption Trace

Watch what happens in physical hardware if a **Non-Leaf Function** fails to save register `ra` onto the stack before calling another function:

Consider three functions: `main()` at `0x00401000`, `func_A()` at `0x00402000`, and `func_B()` at `0x00403000`.

```text
NESTED CALL REGISTER CORRUPTION TIMELINE

 1. main() at Address 0x00401000 executes: call func_A
    * Hardware sets ra <= 0x00401004
    * Hardware sets PC <= 0x00402000 (Jumps to func_A)

 2. func_A() at Address 0x00402010 executes: call func_B  (NESTED CALL!)
    * Hardware sets ra <= 0x00402014!
    * CATASTROPHE! Return address 0x00401004 (back to main) IS OVERWRITTEN & ERASED!

 3. func_B() finishes at Address 0x00403020 and executes: ret
    * Hardware reads ra (0x00402014) and sets PC <= 0x00402014.
    * Execution returns to func_A at 0x00402014. (So far so good!)

 4. func_A() finishes at Address 0x00402030 and executes: ret
    * Hardware reads ra (0x00402014!).
    * Hardware sets PC <= 0x00402014!
    * CATASTROPHE! func_A JUMPS BACK TO ITSELF IN AN INFINITE EXECUTION LOOP!
```

Look at the hardware disaster at Step 2:
Because register `ra` is a single physical SRAM register inside the CPU, executing the second `call func_B` **overwrote `ra` with `0x00402014`**, permanently erasing `0x00401004` (the way back to `main()`)!

When `func_A()` executed `ret` at Step 4, it read `ra` (`0x00402014`), jumping back into its own body in an **infinite execution loop**! The application froze and crashed.

---

### The ABI Solution: Saving `ra` on the Stack Frame

To prevent return address corruption during nested calls, the Application Binary Interface (ABI) enforces a strict **Non-Leaf Function Prologue/Epilogue Rule**:

> **Non-Leaf Function Rule**: Any function that calls another subroutine MUST save the return address register `ra` onto its **Call Stack Frame** in its function prologue before executing any `call` instruction, and MUST restore `ra` from the stack in its epilogue before executing `ret`!

```riscv
# NON-LEAF FUNCTION PROLOGUE AND EPILOGUE PATTERN

func_A:
    # --- FUNCTION PROLOGUE ---
    addi sp, sp, -16          # 1. Allocate 16 bytes on Call Stack
    sd   ra, 8(sp)            # 2. SAVE original ra (0x00401004) onto Stack!

    # --- FUNCTION BODY ---
    call func_B               # 3. Overwrites ra with (0x00402014). (Stack has original!)

    # --- FUNCTION EPILOGUE ---
    ld   ra, 8(sp)            # 4. RESTORE original ra (0x00401004) from Stack!
    addi sp, sp, 16           # 5. Deallocate Stack Frame
    ret                       # 6. Jumps to 0x00401004 (Returns safely to main!)
```

Look at how saving `ra` on the stack rescues the execution flow:
1. `func_A` saves the original `ra` (`0x00401004`) onto its stack frame at `8(sp)`.
2. `func_A` calls `func_B`. Register `ra` is overwritten with `0x00402014`.
3. `func_B` finishes and returns to `func_A`.
4. `func_A` restores `ra` from `8(sp)` (`ra \Leftarrow \text{0x00401004}`).
5. `func_A` executes `ret`. The CPU reads `ra` (`0x00401004`) and **returns safely to `main()`**!

---

## Microarchitectural Realities: Return Address Stack (RAS) Branch Prediction

In modern superscalar, out-of-order processors, instruction execution pipelines do not wait for an instruction to reach the Execute stage before fetching the next instruction. 

To maintain high throughput, the CPU front-end uses **Branch Predictors** to predict jump target addresses during the Instruction Fetch (IF) stage.

When the front-end decoder encounters a register return jump (`ret` / `jalr x0, 0(ra)`), how can the CPU predict the target address of `ra` in $1\text{ clock cycle}$ before reading the Register File in stage 2?

High-performance processors incorporate a specialized hardware prediction structure: **The Return Address Stack (RAS)**.

```text
HARDWARE RETURN ADDRESS STACK (RAS) PREDICTOR

 CPU Front-End Instruction Decoder
  │
  ├─► Sees `call` instruction (jal ra)  ──► Pushes PC + 4 onto RAS Stack
  │                                          │
  │                                          ▼
  │                                   ┌──────────────┐
  │                                   │ RAS Stack    │ (Top = 0x00401004)
  │                                   └──────────────┘
  │                                          │
  └─► Sees `ret` instruction (jalr x0, 0(ra))▼
      Pops Top Address from RAS (0x00401004) ──► Feeds PC Fetch Unit in 1 Cycle!
      (100% Speculative Prediction Hit Rate!)
```

### How the RAS Hardware Predictor Operates:

1. **On `call` (`jal ra`)**: When the front-end decoder detects a subroutine call instruction, it automatically **pushes $PC + 4$ onto the top of the internal hardware RAS stack** in the background.
2. **On `ret` (`jalr x0, 0(ra)`)**: When the front-end decoder detects a return instruction, it **pops the top address from the RAS stack** and feeds it directly to the Instruction Fetch unit as the speculative next $PC$!
3. **Prediction Accuracy**: Because function calls and returns follow strict LIFO (Last-In, First-Out) stack order, the RAS hardware achieves a **$99\%+$ branch prediction hit rate**, completely eliminating return jump stalls!

---

## Solved Industrial Engineering Exercise: Nested Subroutine Linkage Trace, Stack `ra` Preservation, and RAS Prediction Analysis

To consolidate your complete mastery of subroutine linkage mechanics, return address preservation, nested call stack handling, and RAS branch prediction timing, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the function call performance and execution trace for a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution rate of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming L1 cache hits and valid branch predictions).

The processor executes a nested function sequence where `main()` calls `compute_average()`, which in turn calls `sum_array()`.

```text
3.2 GHz PROCESSOR NESTED CALL EXECUTION PIPELINE

 CPU Core (3.2 GHz) ──► [ Front-End RAS Predictor ] ──► [ 5-Stage Execution Pipeline ]
 Clock T = 312.5 ps     16-Entry Hardware Stack         L1I/L1D Hit = 1 Cycle
```

#### Memory Address & Instruction Map:
* **`main()` Call Site**:
  * Address `0x0000_0000_0040_1020`: `call compute_average` (Target address `0x0000_0000_0040_2000`).
  * Address `0x0000_0000_0040_1024`: `addi x10, x10, 1` (Next instruction in `main()`).
* **`compute_average()` Subroutine**:
  * Entry Address `0x0000_0000_0040_2000`.
  * Address `0x0000_0000_0040_2018`: `call sum_array` (Target address `0x0000_0000_0040_3000`).
  * Address `0x0000_0000_0040_201C`: `sd x10, 0(x20)` (Next instruction in `compute_average()`).
  * Exit Address `0x0000_0000_0040_2040`: `ret`.
* **`sum_array()` Subroutine (Leaf Function)**:
  * Entry Address `0x0000_0000_0040_3000`.
  * Exit Address `0x0000_0000_0040_3030`: `ret`.

#### Your Objective

1. Trace the execution sequence assuming `compute_average()` **FAILS to save `ra` to the stack**. Show how `ra` is corrupted and prove mathematically why the execution pipeline enters an infinite loop.
2. Write the correct RISC-V 64-bit assembly prologue and epilogue for `compute_average()` that allocates 16 bytes on the call stack (`sp`), saves `ra` (`sd ra, 8(sp)`), and restores `ra` (`ld ra, 8(sp)`).
3. Trace the step-by-step state of register `ra`, stack memory `8(sp)`, and the hardware **Return Address Stack (RAS)** across the entire nested call sequence: `main()` $\to$ `compute_average()` $\to$ `sum_array()` $\to$ `compute_average()` $\to$ `main()`.
4. Calculate the total execution clock cycles and total physical time (in nanoseconds) to complete the call-and-return chain, assuming all instructions execute in $1\text{ clock cycle}$ with $100\%$ RAS prediction accuracy.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Trace `ra` Corruption and Infinite Loop in Buggy Un-Saved Code

Let us trace the bug when `compute_average()` omits saving `ra` on the stack:

1. **Cycle 1 ($PC = \text{0x00401020}$, `main()`)**:
   * Executes `call compute_average`.
   * Hardware sets `ra` ($x1$) $\Leftarrow \text{0x00401020} + 4 = \mathbf{\text{0x00401024}}$.
   * Hardware sets $PC \Leftarrow \mathbf{\text{0x00402000}}$. Jumps to `compute_average()`.
2. **Cycle 7 ($PC = \text{0x00402018}$, `compute_average()`)**:
   * Executes `call sum_array` (**NESTED CALL WITHOUT STACK SAVE!**).
   * Hardware sets `ra` ($x1$) $\Leftarrow \text{0x00402018} + 4 = \mathbf{\text{0x0040201C}}$.
   * **CATASTROPHE**: Return address `0x00401024` (back to `main()`) is **OVERWRITTEN AND ERASED FROM `ra`**!
   * Hardware sets $PC \Leftarrow \mathbf{\text{0x00403000}}$. Jumps to `sum_array()`.
3. **Cycle 19 ($PC = \text{0x00403030}$, `sum_array()`)**:
   * Executes `ret` (`jalr x0, 0(ra)`).
   * Reads `ra` (`0x0040201C`). Hardware sets $PC \Leftarrow \mathbf{\text{0x0040201C}}$. Returns to `compute_average()`.
4. **Cycle 28 ($PC = \text{0x00402040}$, `compute_average()`)**:
   * Executes `ret` (`jalr x0, 0(ra)`).
   * Reads `ra` (`0x0040201C`!). Hardware sets $PC \Leftarrow \mathbf{\text{0x0040201C}}$.
   * **INFINITE LOOP FIRED**: Execution jumps back to `0x0040201C` inside `compute_average()`, calling `sum_array()` again forever!

```text
BUGGY EXECUTION TRACE (INFINITE LOOP PROOF)

 Step 1: main() calls compute_average() ──► ra <= 0x00401024
 Step 2: compute_average() calls sum_array() ──► ra <= 0x0040201C (OVERWRITTEN!)
 Step 3: sum_array() executes ret       ──► PC <= 0x0040201C (Returns to compute_avg)
 Step 4: compute_average() executes ret ──► PC <= 0x0040201C (JUMPS TO ITSELF!)
 (Execution locked in infinite loop at 0x0040201C!)
```

---

#### Step 2: Write Correct Prologue and Epilogue for `compute_average()`

To prevent `ra` corruption, `compute_average()` must save `ra` on its stack frame:

```riscv
# CORRECT NON-LEAF SUBROUTINE IMPLEMENTATION

.global compute_average
compute_average:
    # --- PROLOGUE: Allocate Stack Frame & Save ra ---
    addi sp, sp, -16          # 1. Allocate 16 bytes on stack frame
    sd   ra, 8(sp)            # 2. SAVE original ra (0x00401024) onto stack!

    # --- SUBROUTINE BODY ---
    # ... Prepare arguments ...
    call sum_array            # 3. Call nested leaf function! (Overwrites ra with 0x0040201C)
    sd   x10, 0(x20)          # 4. Process result

    # --- EPILOGUE: Restore ra & Deallocate Stack Frame ---
    ld   ra, 8(sp)            # 5. RESTORE original ra (0x00401024) from stack!
    addi sp, sp, 16           # 6. Deallocate 16 bytes from stack
    ret                       # 7. Jumps to 0x00401024 (Returns safely to main()!)
```

---

#### Step 3: Trace Corrected Execution, Stack State, and RAS Predictor

Let us trace the complete corrected execution flow across all four functions:

```text
CORRECTED NESTED CALL TRACE WITH RAS STACK AND REGISTER STATES

 Event # │ Instruction Executed │ PC Address │ Reg ra (x1) │ Stack 8(sp) │ RAS Top Entry
─────────┼──────────────────────┼────────────┼─────────────┼─────────────┼───────────────
 Initial │ main() starts        │ 0x00401000 │ Uninitialized│ -           │ Empty
   1     │ call compute_average │ 0x00401020 │ 0x00401024  │ -           │ 0x00401024
   2     │ sd ra, 8(sp)         │ 0x00402004 │ 0x00401024  │ 0x00401024  │ 0x00401024
   3     │ call sum_array       │ 0x00402018 │ 0x0040201C  │ 0x00401024  │ 0x0040201C
   4     │ sum_array() executes │ 0x00403000 │ 0x0040201C  │ 0x00401024  │ 0x0040201C
   5     │ sum_array() ret      │ 0x00403030 │ 0x0040201C  │ 0x00401024  │ Pops 0x0040201C
   6     │ ld ra, 8(sp)         │ 0x00402038 │ 0x00401024  │ 0x00401024  │ 0x00401024
   7     │ compute_avg ret      │ 0x00402040 │ 0x00401024  │ 0x00401024  │ Pops 0x00401024
 Final   │ main() resumes!      │ 0x00401024 │ 0x00401024  │ -           │ Empty (SUCCESS!)
```

##### Trace Highlights:
1. **Event 1 (`call compute_average`)**: `ra` set to `0x00401024`. RAS pushes `0x00401024`.
2. **Event 2 (`sd ra, 8(sp)`)**: Original return address `0x00401024` is safely written into RAM at `8(sp)`.
3. **Event 3 (`call sum_array`)**: `ra` overwritten with `0x0040201C`. RAS pushes `0x0040201C`.
4. **Event 5 (`ret` in `sum_array`)**: RAS pops `0x0040201C`. Execution returns to `compute_average()` at `0x0040201C`.
5. **Event 6 (`ld ra, 8(sp)`)**: Register `ra` is restored from RAM: `ra` $\Leftarrow$ `0x00401024`.
6. **Event 7 (`ret` in `compute_average`)**: RAS pops `0x00401024`. Execution returns to `main()` at `0x00401024`!

---

#### Step 4: Calculate Total Execution Time

Assuming 28 total instructions executed across the entire call-and-return chain, with $100\%$ L1 cache hits and $100\%$ RAS prediction accuracy:

$$\text{Total Clock Cycles} = 28 \text{ instructions} \times 1.0 \text{ cycles/instruction} = \mathbf{28 \text{ Clock Cycles}}$$

$$T_{\text{execution}} = 28 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{8.750 \text{ nanoseconds}}$$

The complete nested function call, stack allocation, register preservation, and return execution finished in **$8.750\text{ nanoseconds}$ ($28\text{ CPU clock cycles}$)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and return address logic:

1. **Return Address Link Verification**:
   * `call compute_average` at `0x00401020` $\implies$ Next instruction = `0x00401024`.
   * `call sum_array` at `0x00402018` $\implies$ Next instruction = `0x0040201C`.
   * `sum_array()` ret returned to `0x0040201C`.
   * `compute_average()` ret returned to `0x00401024`.
   * Execution returned to `main()` with $100\%$ mathematical precision!
2. **RAS Stack Balance Check**:
   * Number of `call` pushes = 2 (`0x00401024`, `0x0040201C`).
   * Number of `ret` pops = 2 (`0x0040201C`, `0x00401024`).
   * Final RAS stack depth = $0$ (Empty). Hardware stack balanced perfectly!
3. **Stack Frame Alignment Check**:
   * Allocated stack space = $16\text{ bytes}$.
   * $16 \pmod{16} == 0 \implies$ Preserves 16-byte stack alignment invariant!

All jump-and-link calculations, stack `ra` save/restore state traces, RAS predictor operations, and execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Subroutine Linkage (`jal` / `call`)**: The atomic hardware execution mechanism where a jump instruction calculates the return address ($PC + 4$) and writes it into a destination register ($rd = \mathtt{ra} = x1$) at the exact same physical clock cycle that it sets $PC$ to the target subroutine address.
* **Return Address Register (`ra` / $x1$)**: The architectural register reserved by ABI conventions to hold the 64-bit return address ($PC + 4$) generated by function calls, which non-leaf subroutines MUST save onto their call stack frame before executing nested calls to prevent return address corruption and infinite loops.
