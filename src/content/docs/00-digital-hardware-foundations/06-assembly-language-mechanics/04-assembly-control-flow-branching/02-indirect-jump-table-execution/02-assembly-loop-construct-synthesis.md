---
title: "Assembly Loop Construct Synthesis and Loop Guard Evaluation Mechanics"
---

# Assembly Loop Construct Synthesis and Loop Guard Evaluation Mechanics

## The Iterative Branch Overhead: How Naive Loop Layouts Waste Control Flow Instructions

In high-level computer programming, software algorithms rely continuously on iterative loop constructs (`while (i < n) { ... }`, `for (int i = 0; i < n; i++) { ... }`, or `do { ... } while (i < n)`). Whether a program is processing millions of database rows, scaling pixel arrays in a graphics engine, or performing matrix multiplication in a machine learning pipeline, code inside an iterative loop is executed repeatedly millions or billions of times.

When a software compiler or assembly programmer translates a high-level `while (i < n)` loop into machine code, the naive, direct approach is to place a conditional test at the top of the loop, followed by the loop body, and terminate with an unconditional jump at the bottom of the loop back to the top.

Consider what occurs at the physical hardware level when an un-optimized compiler executes a $1,000,000\text{-iteration}$ loop using this naive **Guard-at-Top Layout**:

```text
NAIVE GUARD-AT-TOP WHILE LOOP LAYOUT (2 JUMPS PER ITERATION)

 loop_top:
   1. bge x10, x11, loop_exit  ──► Conditional Test at Top (If i >= n, exit)
   2. ... Loop Body Instructions ...
   3. addi x10, x10, 1          ──► Increment loop counter (i++)
   4. j loop_top                ──► UNCONDITIONAL JUMP AT BOTTOM!
 loop_exit:
```

Trace the physical control flow execution across $1,000,000$ iterations:
1. **Iteration 1**:
   * The CPU executes the conditional branch at the top (`bge x10, x11, loop_exit`). The branch evaluates to Not-Taken.
   * The CPU executes the loop body instructions.
   * At the bottom, the CPU executes an unconditional jump (`j loop_top`), forcing the Program Counter ($PC$) to jump back to `loop_top`.
2. **Iteration 2**:
   * The CPU jumps back to `loop_top` and executes `bge x10, x11, loop_exit` **A SECOND TIME**!
   * The CPU executes the loop body.
   * The CPU executes `j loop_top` **A SECOND TIME**!

```text
CONTROL FLOW INEFFICIENCY OF NAIVE LOOP LAYOUT

 Per Iteration: 1 Conditional Branch (bge) + 1 Unconditional Jump (j)
 Total Control Instructions for 1,000,000 Iterations:
 1,000,000 Branches + 1,000,000 Jumps = 2,000,000 CONTROL INSTRUCTIONS!
 (1,000,000 unconditional jumps wasted running back to the top gate!)
```

Examine the physical waste inside the CPU execution core:
* On **EVERY SINGLE ITERATION**, the processor is forced to execute **TWO separate control flow jump instructions**: one conditional branch at the top (`bge`) PLUS one unconditional jump at the bottom (`j`)!
* Across $1,000,000$ iterations, the processor executes **2,000,000 control flow instructions**, wasting $1,000,000\text{ clock cycles}$ on useless `j loop_top` jumps!
* Executing two jump instructions per loop iteration doubles Branch Target Buffer (BTB) cache pollution, wastes instruction fetch bandwidth, and increases energy consumption.

How do we synthesize high-level `while` and `for` loops in assembly language so that every iteration executes **ONLY ONE single conditional branch instruction** at the bottom of the loop?

How does **Loop Inversion**—converting a `while` loop into a guarded `do-while` loop with a single initial **Loop Guard Evaluation**—eliminate $100\%$ of unconditional jumps from loop bodies and cut control flow instruction overhead by $50\%$?

To eliminate loop control waste and maximize pipeline throughput, assembly systems engineering uses **Loop Guard Evaluation** and **Assembly Loop Synthesis**.


### Policy A: Naive Guard-at-Top Policy (Naive `while` Assembly Layout)

1. Before starting a lap, the runner stops at an **Entry Gate at the Top of the Track** (`loop_top:`).
2. A gatekeeper asks: *"Is lap count < 100?"* (**Conditional Branch `bge i, n, exit`**).
3. The runner runs the 100-meter lap.
4. At the end of the lap, the runner is forced to turn around and **run all the way back to the Entry Gate at the Top** (**Unconditional Jump `j loop_top`**)!
5. The runner arrives at the Entry Gate, and the gatekeeper asks again: *"Is lap count < 100?"*

Look at the waste in Policy A:
* On every single lap, the runner pays **TWO control stops**: one gate check + one run-back jump!
* Running 100 laps required **200 control stops**!


## Primitive 1: Loop Guard Evaluation

Now that we possess an intuitive mental model of track entry gatekeepers and continuous oval circuits, let us examine the formal engineering mechanics of **Loop Guard Evaluation**.

High-level `while (i < n)` and `for (int i = 0; i < n; i++)` loops possess a fundamental semantic property: **the loop body must execute ZERO times if the initial condition is false upon entry** (e.g. `i = 10, n = 5`).

A `do { ... } while (i < n)` loop, by contrast, executes the loop body at least once before checking the condition.

To transform a `while` loop into an ultra-fast `do-while` style loop structure without violating the "zero-iteration" rule, compiler toolchains use **Loop Guard Evaluation**:

> **Loop Guard Evaluation** is an initial conditional branch check executed once before entering an inverted loop body, verifying that the loop's initial boundary conditions are valid ($i < n$). If the condition is false, execution jumps directly to the loop exit; if true, execution falls through directly into an inverted, 1-branch loop body.

```text
LOOP GUARD EVALUATION STRUCTURAL FLOW

 High-Level Code: while (i < n) { body(); }
                        │
                        ▼ (Compiled via Loop Guard Evaluation)
 Assembly Structure:
   1. Initial Guard Check: IF (i >= n) GOTO loop_exit; (Executes ONCE!)
   2. loop_body:
        body();
        i++;
        IF (i < n) GOTO loop_body;                    (Bottom Branch!)
   3. loop_exit:
```


## Primitive 2: Assembly Loop Synthesis and Loop Inversion

Now let us examine the second core primitive: **Assembly Loop Synthesis** and **Loop Inversion**.

> **Assembly Loop Synthesis** is the microarchitectural process of designing, structuring, and optimizing the instruction layout of an iterative loop in assembly language to minimize the number of control flow instructions executed per iteration, align with hardware branch predictors, and maximize pipeline instruction throughput.


#### 2. Inverted Guarded Loop Layout (Optimized `do-while` Style)
```riscv
# INVERTED GUARDED LOOP LAYOUT (1 CONTROL INST / ITERATION)

    bge  x10, x11, loop_exit  # 1. Initial Loop Guard (Executes ONCE on entry)
loop_body:
    # ... Loop Body Instructions ...
    addi x10, x10, 1          # i++
    blt  x10, x11, loop_body  # 2. SINGLE CONDITIONAL BRANCH AT BOTTOM!
loop_exit:
```
* **Control Instructions per Iteration**: $1\text{ conditional branch} = \mathbf{1 \text{ Control Inst}}$.
* **Hardware Advantage**: **Eliminates $100\%$ of unconditional jumps (`j loop_top`)** from the loop body! Cuts control flow instruction overhead by **$50\%$**!


## Real-World Silicon Engineering: BTFN Branch Prediction and Loop Unrolling

In commercial microprocessor design and high-performance compiler engineering, loop synthesis intersects with hardware branch prediction and instruction cache execution:

### 1. BTFN (Backward Taken, Forward Not-Taken) Static Branch Prediction

When a CPU front-end fetches a conditional branch instruction in Stage 1 (IF) before the ALU has evaluated the condition in Stage 3 (EX), how does the hardware guess whether the branch will be Taken or Not-Taken?

If the Branch History Table (BHT) has no prior history for the branch address, static branch predictors apply the **BTFN Rule**:

$$\mathbf{\text{BTFN Rule: Backward Taken, Forward Not-Taken}}$$

```text
BTFN STATIC BRANCH PREDICTION MECHANICS

 Forward Branch (Target Address > Current PC):
   bge x10, x11, loop_exit  ──► PREDICTED NOT-TAKEN! (Fall through to loop body)

 Backward Branch (Target Address < Current PC):
   blt x10, x11, loop_body  ──► PREDICTED TAKEN! (Loop around curve immediately!)
```

* **Forward Branches (`bge x10, x11, loop_exit`)**: Target address is greater than current $PC$. Static predictor predicts **NOT-TAKEN** (assumes code will fall through).
* **Backward Branches (`blt x10, x11, loop_body`)**: Target address is less than current $PC$. Static predictor predicts **TAKEN** (assumes loop will repeat!).

#### The Architectural Harmony of Loop Inversion:
Look at how Loop Inversion aligns perfectly with BTFN hardware branch prediction:
1. The **Initial Loop Guard (`bge x10, x11, loop_exit`)** is a **Forward Branch**. Hardware predicts **NOT-TAKEN**, falling through directly into the loop body on cycle 1 with $0\text{ stall cycles}$!
2. The **Bottom Loop Branch (`blt x10, x11, loop_body`)** is a **Backward Branch**. Hardware predicts **TAKEN**, looping around the curve immediately with $0\text{ stall cycles}$!

Both branch instructions align $100\%$ with static hardware prediction rules!


## Solved Industrial Engineering Exercise: Loop Translation, Control Flow Overhead Comparison, and Execution Speedup Analysis

To consolidate your complete mastery of loop guard evaluation, loop inversion synthesis, backward branch prediction rules, and loop unrolling optimizations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation


#### Step 2: Write Assembly Code for Strategy 2 (Inverted Guarded Loop)

```riscv
# STRATEGY 2: INVERTED GUARDED LOOP (OPTIMIZED)

    li   x10, 0               # i = 0
    bge  x10, x11, loop_exit  # 1. INITIAL LOOP GUARD (Executes ONCE!)
    li   x14, 5               # Hoist constant multiplier 5 OUT of loop!
loop_body:
    slli x12, x10, 3          # x12 <= i * 8 bytes
    add  x12, x20, x12        # x12 <= &array[i]
    ld   x13, 0(x12)          # x13 <= array[i]
    mul  x13, x13, x14        # x13 <= array[i] * 5
    sd   x13, 0(x12)          # array[i] <= x13
    addi x10, x10, 1          # i++
    blt  x10, x11, loop_body  # 2. SINGLE CONDITIONAL BRANCH AT BOTTOM!
loop_exit:
```

##### Instruction Count per Iteration (Strategy 2):
* Loop Body Instructions: `slli` + `add` + `ld` + `mul` + `sd` + `addi` + `blt` = **7 Instructions / Iteration**.
* Control Flow Instructions per Iteration: **1 Control Inst / Iteration** (`blt`). Zero `j` jumps!


#### Step 4: Calculate Clock Cycles and Physical Execution Time ($N = 1,000,000$)

##### 1. Strategy 1 (Naive Guard-at-Top):
* Instructions per iteration = $9$.
* Total Clock Cycles = $1,000,000 \text{ iterations} \times 9 \text{ cycles/iter} = \mathbf{9,000,000 \text{ Clock Cycles}}$.
* Total Time $T_1 = 9,000,000 \times 0.3125\text{ ns} = \mathbf{2.8125 \text{ Milliseconds}}$.
* Total Control Instructions = $1,000,000 \times 2 = \mathbf{2,000,000 \text{ Control Instructions}}$.

##### 2. Strategy 2 (Inverted Guarded Loop):
* Instructions per iteration = $7$.
* Total Clock Cycles = $1 \text{ guard cycle} + (1,000,000 \times 7) = \mathbf{7,000,001 \text{ Clock Cycles}}$.
* Total Time $T_2 = 7,000,001 \times 0.3125\text{ ns} = \mathbf{2.1875 \text{ Milliseconds}}$.
* Total Control Instructions = $1 \text{ top guard} + 1,000,000 \text{ bottom branches} = \mathbf{1,000,001 \text{ Control Instructions}}$.

##### 3. Strategy 3 (Inverted Loop Unrolled by 4):
* Outer loop iterations = $\frac{1,000,000}{4} = 250,000\text{ iterations}$.
* Instructions per outer iteration = $17$.
* Total Clock Cycles = $2 \text{ setup} + (250,000 \times 17) = \mathbf{4,250,002 \text{ Clock Cycles}}$.
* Total Time $T_3 = 4,250,002 \times 0.3125\text{ ns} = \mathbf{1.3281 \text{ Milliseconds}}$.
* Total Control Instructions = $1 \text{ guard} + 250,000 \text{ branches} = \mathbf{250,001 \text{ Control Instructions}}$.


### Sanity Check and Verification

Let us verify our mathematical, structural, and control flow results:

1. **Control Flow Reduction Verification**:
   * Strategy 1 control insts = $2,000,000$. Strategy 2 control insts = $1,000,001$.
   * Reduction = $\frac{2,000,000 - 1,000,001}{2,000,000} \times 100\% = \mathbf{49.99995\% \approx 50.0\% \text{ Reduction!}}$
   * Confirms that loop inversion eliminates 1 control instruction per iteration!
2. **BTFN Branch Predictor Alignment Verification**:
   * Strategy 2 uses `blt x10, x11, loop_body` at the bottom.
   * `loop_body` address < current $PC \implies$ Backward Branch!
   * BTFN hardware rule predicts TAKEN with $99.9\%$ accuracy, verifying 0 prediction stalls!
3. **Execution Time Verification**:
   * Strategy 1: $9,000,000 \times 0.3125\text{ ns} = 2,812,500\text{ ns} = 2.8125\text{ ms}$. Correct!
   * Strategy 2: $7,000,001 \times 0.3125\text{ ns} = 2,187,500\text{ ns} = 2.1875\text{ ms}$. Correct!
   * Strategy 3: $4,250,002 \times 0.3125\text{ ns} = 1,328,125\text{ ns} = 1.3281\text{ ms}$. Correct!

All loop layout structure mappings, loop guard evaluations, control flow reduction percentages, BTFN predictor alignments, and execution speedup metrics evaluate with 100% mathematical, physical, and logical precision.


## The Track Runner's Entry Gate vs. The Continuous Oval Circuit: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of loop guard evaluation, loop inversion, and bottom-branch execution before analyzing assembly instruction structures, BTFN branch prediction rules, and loop unrolling math, let us consider an everyday analogy: **The Track Runner and the Stadium Gate**.

Imagine an athlete (**The CPU Execution Pipeline**) running 100 laps (**Iterative Loop Execution**) around a stadium track.

```text
THE TRACK RUNNER LOOP LAYOUT METAPHOR

 Policy A: Naive Guard-at-Top Policy (Naive while Loop)
 ┌─────────────────────────────────────────────────────────────┐
 │ Start of Lap: Stop at Entry Gate -> Check: "Laps < 100?"    │
 │ Run Lap Body (100 Meters)                                   │
 │ End of Lap: Turn Around -> Run Back to Entry Gate (Jump!)   │
 └─────────────────────────────────────────────────────────────┘
  (2 Control Stops per Lap = 200 Total Control Instructions!)

 Policy B: Inverted Loop with Entry Guard (Optimized Loop Synthesis)
 ┌─────────────────────────────────────────────────────────────┐
 │ BEFORE ENTERING: Check "Laps > 0?" ONCE at Entrance Gate!   │
 │ Inside Oval Track: Run Lap Body (100 Meters)                │
 │ End of Lap: Single Gate Check -> "More Laps?" -> Loop!      │
 └─────────────────────────────────────────────────────────────┘
  (1 Control Check per Lap = 101 Total Control Instructions!)
```

The runner's goal is to execute 100 laps around the track.

Let us observe two different operational policies for running 100 laps:


### Policy B: Inverted Loop with Entry Guard (Optimized Assembly Synthesis)

The track coach replaces the track layout with **Loop Inversion**:

1. **The Initial Loop Guard Check**: BEFORE the runner steps onto the track, the gatekeeper asks **ONCE**: *"Is initial lap count > 0?"* (**Loop Guard Evaluation**).
   * If the initial count is $0$, the runner goes home immediately without ever stepping onto the track!
2. **The Continuous Oval Track**: If count $> 0$, the runner enters the oval track.
3. The runner runs the 100-meter lap.
4. At the bottom of the lap, a single sensor asks: *"Is lap count < 100?"*
   * **If YES**: The runner seamlessly loops around the curve and starts the next lap!
   * **If NO**: The runner leaves the track!

```text
POLICY B CONTINUOUS OVAL CIRCUIT (ZERO RUN-BACK JUMPS)

 Entrance Gate ──► Check ONCE: "Laps > 0?" ──► Enter Oval Track
                                                    │
 ┌──────────────────────────────────────────────────┴──────────┐
 │ Run 100-Meter Lap Body                                      │
 └──────────────────────────────────────────────────┬──────────┘
                                                    │
 Check "Laps < 100?" at Bottom ──► YES ─────────────┘ (Loops around curve!)
                                 ──► NO  ─────────────► Exit Track!
```

Look at what Policy B achieved:
* **Zero Run-Back Jumps**: The runner NEVER executes an unconditional jump back to the entry gate!
* **1 Control Check per Lap**: Every lap executes **ONLY ONE single conditional branch at the bottom**!
* Running 100 laps required **101 control checks** (1 initial guard check + 100 bottom branches)—cutting control flow overhead by **$49.5\%$**!

This track layout is the exact physical analogue of **Assembly Loop Synthesis and Loop Inversion**:
* Running a lap is executing the **Loop Body**.
* The gatekeeper at the top is the **Naive Guard-at-Top `while` Loop**.
* The initial check before entering is the **Loop Guard Evaluation (`bge i, n, loop_exit`)**.
* The single bottom sensor is **Loop Inversion (`blt i, n, loop_body`)**.


### The Structural Anatomy of Loop Guard Evaluation

Let us trace how the compiler structures the initial guard check in RISC-V assembly:

```riscv
# INITIAL LOOP GUARD EVALUATION IN ASSEMBLY

    # Register Setup: x10 = i (loop counter), x11 = n (loop bound)
    
    bge  x10, x11, loop_exit  # INITIAL LOOP GUARD EVALUATION!
                              # Evaluates: IF (i >= n), skip loop entirely!
                              # Executed EXACTLY ONCE on entry!

loop_body:
    # ... Loop Body Instructions ...
    addi x10, x10, 1          # Increment loop counter: i++
    blt  x10, x11, loop_body  # SINGLE CONDITIONAL BRANCH AT BOTTOM!

loop_exit:
```

Trace the physical execution paths:
1. **Zero-Iteration Path ($i \ge n$ on entry)**:
   * The initial guard `bge x10, x11, loop_exit` evaluates to **TAKEN**.
   * Execution jumps directly to `loop_exit`, skipping the loop body completely in $1\text{ branch instruction}$!
2. **Multi-Iteration Path ($i < n$ on entry)**:
   * The initial guard `bge` evaluates to **NOT-TAKEN**.
   * Execution falls through directly into `loop_body`.
   * The initial guard instruction is **NEVER EXECUTED AGAIN** for the remainder of the loop!


### Comparing the Three Canonical Loop Layouts

To understand why Loop Inversion is the gold standard of compiler code generation, let us compare the three canonical loop layout structures in assembly:

#### 1. Naive Guard-at-Top Layout (`while` Style)
```riscv
# NAIVE GUARD-AT-TOP WHILE LOOP LAYOUT (2 CONTROL INSTS / ITERATION)

loop_top:
    bge  x10, x11, loop_exit  # 1. Top Conditional Test (Branch to exit if i >= n)
    # ... Loop Body Instructions ...
    addi x10, x10, 1          # i++
    j    loop_top             # 2. Unconditional Jump at Bottom!
loop_exit:
```
* **Control Instructions per Iteration**: $1\text{ conditional branch} + 1\text{ unconditional jump} = \mathbf{2 \text{ Control Insts}}$.
* **Hardware Flaw**: Executes an unnecessary `j loop_top` jump on every single pass!


#### 3. Pointer-Based Decrementing Loop Layout
When iterating over arrays or buffers, replacing an incrementing index comparison (`i < n`) with a **Pointer Comparison** or **Counting Down to Zero** further optimizes the loop:

```riscv
# POINTER-BASED DECREMENTING LOOP LAYOUT (OPTIMIZED)

    # Register Setup: x10 = loop_counter (n), x12 = ptr
    blez x10, loop_exit       # Initial Loop Guard (Exit if n <= 0)
loop_body:
    # ... Process data at 0(x12) ...
    addi x12, x12, 8          # Advance pointer: ptr += 8 bytes
    addi x10, x10, -1         # Decrement counter: n--
    bnez x10, loop_body       # SINGLE BRANCH: Compare against x0 (zero register!)
loop_exit:
```

* **Hardware Advantage**: `bnez x10, loop_body` compares register `x10` directly against the hardwired zero register `x0`. The compiler does not need to hold an upper bound $n$ in a separate register, freeing up a register slot!

```text
LOOP SYNTHESIS STRUCTURE COMPARISON MATRIX

 Loop Layout Type        │ Initial Guard Check │ Bottom Branch Target │ Control Insts / Iteration
─────────────────────────┼─────────────────────┼──────────────────────┼───────────────────────────
 Naive Guard-at-Top      │ None (Check at top) │ Unconditional `j`    │ 2 Jumps (1 Branch + 1 Jump)
 Inverted Guarded Loop   │ Top Guard (`bge`)   │ Conditional `blt`    │ 1 Jump  (0 Uncond Jumps!)
 Pointer Decrementing    │ Top Guard (`blez`)  │ Conditional `bnez`   │ 1 Jump  (Compares with x0)
```


### 2. Loop Unrolling (`.rept` / Unrolled Iterations)

To push execution speed even further, optimizing compilers combine **Loop Inversion** with **Loop Unrolling**:

> **Loop Unrolling** is an optimization where the compiler replicates the body of an inverted loop $K$ times (e.g., $K = 4$), processing $K$ elements per iteration and executing the bottom branch check only once every $K$ elements.

```riscv
# INVERTED LOOP UNROLLED BY FACTOR OF 4

    blez x11, loop_exit       # Initial Guard
loop_body_unrolled:
    # Process Element i+0, Element i+1, Element i+2, Element i+3
    ld   x12, 0(x20);  sd x12, 0(x21)
    ld   x13, 8(x20);  sd x13, 8(x21)
    ld   x14, 16(x20); sd x14, 16(x21)
    ld   x15, 24(x20); sd x15, 24(x21)

    addi x20, x20, 32         # Advance source ptr by 32 bytes
    addi x21, x21, 32         # Advance dest ptr by 32 bytes
    addi x10, x10, -4         # Decrement counter by 4
    bgtz x10, loop_body_unrolled # Single branch for 4 elements!
loop_exit:
```

#### The Unrolling Speedup Math:
For a loop processing $1,000,000$ elements:
* Standard Inverted Loop: Executes $1,000,000\text{ branch instructions}$.
* Loop Unrolled by 4: Executes $\frac{1,000,000}{4} = \mathbf{250,000 \text{ branch instructions}}$!
* **Loop control instruction overhead is reduced by $75\%$**!


### Scenario and Parameters

You are a senior microarchitect auditing the loop execution performance of an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a vector processing loop that iterates $1,000,000$ times ($N = 1,000,000$) to scale an array of 64-bit integers: `array[i] = array[i] * 5`.

```text
3.2 GHz PROCESSOR LOOP SYNTHESIS BENCHMARK

 CPU Core (3.2 GHz) ──► [ 5-Stage Pipeline ] ──► L1 Data Cache
 Clock T = 312.5 ps     BTFN Branch Predictor   Array N = 1,000,000
```

#### Hardware Parameters:
* Base Array Pointer in register `x20` = `0x0000_0000_2000_1000`.
* Loop Counter $i$ in register `x10` ($i = 0 \dots 1,000,000$).
* Loop Bound $N = 1,000,000$ in register `x11`.
* Execution Latencies:
  * Standard ALU instructions (`addi`, `slli`, `add`, `mul`): $1\text{ clock cycle}$ ($0.3125\text{ ns}$).
  * Memory Load/Store (`ld`/`sd`): $1\text{ clock cycle}$ L1D hit.
  * Correctly predicted branch: $1\text{ clock cycle}$ (0 stall cycles).
  * Unconditional Jump (`j`): $1\text{ clock cycle}$ base execution.

The software team implements the vector loop using three competing assembly synthesis strategies:

1. **Strategy 1 (Naive Guard-at-Top Loop)**: Conditional branch at top (`bge`), unconditional jump at bottom (`j`).
2. **Strategy 2 (Inverted Guarded Loop)**: Initial loop guard at entrance (`bge`), conditional backward branch at bottom (`blt`).
3. **Strategy 3 (Inverted Guarded Loop Unrolled by 4)**: Unrolled 4 times with single bottom branch (`blt`).

#### Your Objective

1. Write the complete, valid RISC-V 64-bit assembly source code for **Strategy 1**, **Strategy 2**, and **Strategy 3**.
2. For each strategy, calculate:
   * Total number of instructions executed per iteration.
   * Total control flow instructions (branches + jumps) executed across the $1,000,000\text{-element}$ array.
   * Total execution clock cycles and total physical execution time (in milliseconds).
3. Calculate the percentage reduction in control flow instructions and the **Execution Speedup Factor** of Strategy 2 and Strategy 3 over Strategy 1.
4. Verify mathematical, structural, and timing correctness.


#### Step 1: Write Assembly Code for Strategy 1 (Naive Guard-at-Top)

```riscv
# STRATEGY 1: NAIVE GUARD-AT-TOP WHILE LOOP

    li   x10, 0               # i = 0
loop_top:
    bge  x10, x11, loop_exit  # 1. Top Conditional Test (If i >= N, exit)
    slli x12, x10, 3          # x12 <= i * 8 bytes
    add  x12, x20, x12        # x12 <= &array[i]
    ld   x13, 0(x12)          # x13 <= array[i]
    li   x14, 5               # x14 <= 5
    mul  x13, x13, x14        # x13 <= array[i] * 5
    sd   x13, 0(x12)          # array[i] <= x13
    addi x10, x10, 1          # i++
    j    loop_top             # 2. Unconditional Jump at Bottom!
loop_exit:
```

##### Instruction Count per Iteration (Strategy 1):
* Loop Body Instructions: `bge` + `slli` + `add` + `ld` + `li` + `mul` + `sd` + `addi` + `j` = **9 Instructions / Iteration**.
* Control Flow Instructions per Iteration: $1\text{ branch } (bge) + 1\text{ jump } (j) = \mathbf{2 \text{ Control Insts / Iteration}}$.


#### Step 3: Write Assembly Code for Strategy 3 (Unrolled by 4)

```riscv
# STRATEGY 3: INVERTED GUARDED LOOP UNROLLED BY 4

    li   x10, 0               # i = 0
    bge  x10, x11, loop_exit  # Initial Loop Guard
    li   x14, 5               # Constant 5
loop_body_unrolled:
    # --- Iteration 0 ---
    slli x12, x10, 3; add x12, x20, x12; ld x13, 0(x12); mul x13, x13, x14; sd x13, 0(x12)
    # --- Iteration 1 ---
    ld x13, 8(x12); mul x13, x13, x14; sd x13, 8(x12)
    # --- Iteration 2 ---
    ld x13, 16(x12); mul x13, x13, x14; sd x13, 16(x12)
    # --- Iteration 3 ---
    ld x13, 24(x12); mul x13, x13, x14; sd x13, 24(x12)

    addi x10, x10, 4          # i += 4
    blt  x10, x11, loop_body_unrolled # Single branch per 4 elements!
loop_exit:
```

##### Instruction Count per Iteration (Strategy 3):
* 4 elements processed per outer loop iteration.
* Total instructions per 4 elements = $17\text{ instructions} \implies \mathbf{4.25 \text{ Instructions / Element}}$.
* Control Flow Instructions: $250,000\text{ branches}$ across $1,000,000$ elements = **$0.25$ Control Insts / Element**!


##### Performance Comparison Summary Table:

```text
LOOP SYNTHESIS BENCHMARK PERFORMANCE SUMMARY

 Strategy / Metric          │ Total Insts / Elem │ Control Insts (1M) │ Total Time (ms) │ Speedup Factor
────────────────────────────┼────────────────────┼────────────────────┼─────────────────┼───────────────
 Strategy 1 (Naive Top)     │ 9.00 Insts         │ 2,000,000 Insts    │ 2.8125 ms       │ 1.00x (Base)
 Strategy 2 (Inverted)      │ 7.00 Insts         │ 1,000,001 Insts    │ 2.1875 ms       │ 1.29x FASTER!
 Strategy 3 (Unrolled x4)   │ 4.25 Insts         │   250,001 Insts    │ 1.3281 ms       │ 2.12x FASTER!
```

##### Speedup Calculations:
* **Strategy 2 Speedup over Strategy 1**:
  $$\text{Speedup}_2 = \frac{2.8125\text{ ms}}{2.1875\text{ ms}} = \frac{9,000,000}{7,000,000} = \mathbf{1.29\times \text{ Performance Advantage! (22.2% Time Cut)}}$$
* **Strategy 3 Speedup over Strategy 1**:
  $$\text{Speedup}_3 = \frac{2.8125\text{ ms}}{1.3281\text{ ms}} = \frac{9,000,000}{4,250,000} = \mathbf{2.12\times \text{ Performance Advantage! (52.8% Time Cut)}}$$

##### Engineering Conclusion:
* **Loop Inversion (Strategy 2)** eliminated **$1,000,000$ unconditional jump instructions** ($50\%$ cut in control flow overhead) and hoisted invariant code, delivering a **$1.29\times$ speedup**!
* **Loop Inversion + Unrolling (Strategy 3)** cut control flow instructions by **$87.5\%$** ($250,001$ control insts total), delivering a **$2.12\times$ performance speedup**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Loop Guard Evaluation**: An initial conditional branch check executed once before entering an inverted loop body, verifying that the loop's initial boundary conditions are valid ($i < N$) so execution can safely jump directly into a `do-while` style loop structure.
* **Assembly Loop Synthesis**: The microarchitectural optimization technique of restructuring high-level loops (`while`, `for`) into inverted guarded loops using a single backward conditional branch at the bottom (`blt`), eliminating $100\%$ of unconditional jumps (`j loop_top`), cutting control flow overhead by $50\%$, and aligning with hardware BTFN branch predictors.
