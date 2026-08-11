# Blocking versus Non-Blocking Assignments: Procedural Execution Dualities, Event Scheduling, and Pipeline Synthesis

## The Disconnect Between Sequential Software Execution and Parallel Hardware Behavior

When software engineers write programs in languages like C, C++, or Python, they rely on an absolute, fundamental assumption: **instructions execute sequentially, one line after another, in strict top-to-bottom order**. If a software program contains the lines `a = b;` followed immediately by `c = a;`, the CPU executes the first line, updates variable `a` in memory, and then executes the second line using the newly updated value of `a`.

When digital hardware engineers write code using Hardware Description Languages (HDLs) like SystemVerilog, they use syntax that looks remarkably similar to software code. They write procedural blocks (`always_comb`, `always_ff`) containing `if` statements, `case` statements, and variable assignments.

However, physical digital hardware is fundamentally **not software**. 

In physical silicon, there is no single central processor executing your HDL lines one by one. Physical microchips are composed of millions of independent, parallel transistors, logic gates, and registers operating concurrently. On every single active edge of a global clock signal, thousands of physical flip-flops across the chip sample their inputs and update their outputs at the exact same physical nanosecond.

```text
SOFTWARE SEQUENTIAL EXECUTION VS HARDWARE PARALLEL CONCURRENCY

 Software CPU (Line-by-Line):           Physical Silicon (100% Parallel):
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ Line 1: Execute a = b;    │         │ Gate 1  ──► Operates NOW! │
 │   (Wait for completion)   │         │ Gate 2  ──► Operates NOW! │
 │ Line 2: Execute c = a;    │         │ FF 1    ──► Updates NOW!  │
 └───────────────────────────┘         │ FF 2    ──► Updates NOW!  │
  Sequential Time Delay                 └───────────────────────────┘
                                        Simultaneous Clock Transition
```

This creates a profound engineering challenge for simulator developers and hardware designers:
* How does a software simulator, running on a single-threaded CPU, simulate millions of parallel hardware gates that all change state simultaneously?
* How do we write procedural code in SystemVerilog that accurately describes physical parallel hardware without creating **simulation race conditions** or **simulation-versus-synthesis mismatches**?

If an engineer uses the wrong assignment operator inside a SystemVerilog procedural block, two catastrophic failure modes occur:

1. **Simulation Race Conditions**: Two different software simulators (or two different runs of the same simulator) will execute the exact same SystemVerilog code in a different internal order. Simulator A predicts that your circuit outputs a $1$, while Simulator B predicts that your circuit outputs a $0$.
2. **Simulation-Versus-Synthesis Mismatches**: The SystemVerilog simulator predicts that your design works perfectly during testing. But when you compile the code into physical silicon (FPGA or ASIC), the logic synthesis tool interprets the assignment operators differently, building a physical circuit that behaves completely differently from the simulation, causing system crashes on the actual circuit board.

To bridge the gap between single-threaded software simulation and multi-million-gate parallel hardware, SystemVerilog provides two distinct procedural assignment operators: **Blocking Assignments (`=`)** and **Non-Blocking Assignments (`<=`)**.

Understanding the exact event-scheduling mechanics of these two operators is the single most important skill required to write synthesizable, race-free RTL hardware design.

---

## The Relay Race Baton Pass vs. The Synchronous Bucket Line: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of blocking versus non-blocking assignments before examining simulator event queues and gate synthesis, let us picture two different physical teamwork scenarios.

### Scenario 1: The Relay Race Baton Pass (Blocking Assignment `=`)

Imagine three runners standing in a line on a track: Runner A, Runner B, and Runner C. Runner A holds a wooden baton. 

The coach gives an instruction:
1. *"Runner A, hand your baton to Runner B immediately."*
2. *"Runner B, hand your baton to Runner C immediately."*

```text
THE SEQUENTIAL RELAY RACE BATON PASS (BLOCKING '=')

 Step 1: Runner A hands baton to Runner B.
         Runner B receives baton IMMEDIATELY.
          │
          ▼ (Step 2 is BLOCKED until Step 1 completes!)
 Step 2: Runner B hands baton to Runner C.
         Runner C receives baton IMMEDIATELY.

 Result: The baton traveled from A to C in a SINGLE procedural pass!
```

Look at how this baton pass executes:
* Runner A hands the baton to Runner B. Runner B holds the baton in their hand **right now**.
* Runner B then immediately turns around and hands that same baton to Runner C.
* The instruction for Step 2 was **blocked** from happening until Step 1 was completely finished.
* In a single procedural pass, the baton traveled all the way from Runner A to Runner C!

This sequential baton pass is the exact physical analogue of a **Blocking Assignment (`=`)**. 

When a simulator encounters a blocking assignment `a = b;`, it evaluates the right-hand side (`b`), updates the left-hand side (`a`) **immediately**, and **blocks** the next line of code from running until that update is finished. The next line sees the newly updated value of `a`.

---

### Scenario 2: The Fire Brigade Bucket Line (Non-Blocking Assignment `<=`)

Now, picture a completely different scenario: three firefighters standing side-by-side in a bucket line, passing water buckets to extinguish a fire.

* Firefighter A holds Bucket 1.
* Firefighter B holds Bucket 2.
* Firefighter C holds Bucket 3.

The chief stands nearby with a whistle. The chief instructs the firefighters:
*"When I blow the whistle ($CLK$), everyone simultaneously pass the bucket in your hands to the person on your right!"*

```text
THE SYNCHRONOUS BUCKET LINE SWAP (NON-BLOCKING '<=')

 Chief Blows Whistle! (Active Clock Edge CLK)
 ┌───────────────────────────┬───────────────────────────┐
 │ Firefighter A passes B1   │ Firefighter B passes B2   │
 │ to Firefighter B.         │ to Firefighter C.         │
 └───────────────────────────┴───────────────────────────┘
   (All evaluations happen BEFORE any buckets change hands!)

 Result: Firefighter B receives B1, Firefighter C receives B2.
         Bucket 1 did NOT travel to C in one step!
```

Look at how the bucket line executes when the whistle blows ($CLK$ edge):
1. Firefighter B looks at the bucket currently in their hands (Bucket 2) **before** moving it.
2. Firefighter A looks at the bucket currently in their hands (Bucket 1) **before** moving it.
3. On the whistle blast, Firefighter B passes Bucket 2 to Firefighter C, while Firefighter A passes Bucket 1 to Firefighter B **at the exact same instant**.
4. Does Firefighter C receive Bucket 1? **NO!** Firefighter C receives Bucket 2 (the bucket Firefighter B was holding *before* the whistle blew).

Firefighter B did not pass Bucket 1 to Firefighter C because all firefighters evaluated what they were holding **simultaneously before any bucket changed hands**.

This synchronous bucket swap is the exact physical analogue of a **Non-Blocking Assignment (`<=`)**.

When a simulator encounters a non-blocking assignment `a <= b;`, it evaluates the right-hand side (`b`) immediately using current values, but **defers (does not block)** the assignment to `a`. It schedules the update to happen at the very end of the time step, after all other expressions have finished evaluating. 

Every statement in the block reads the *old* values of variables before any updates take place!

---

## Mechanics of Blocking Assignments (`=`) and Combinational Logic

To master SystemVerilog procedural design, we must dissect the formal mechanics of blocking assignments, non-blocking assignments, and the simulator event queue.

---

### Primitive 1: Blocking Assignment Mechanics (`=`)

A **Blocking Assignment** uses the standard equals sign (`=`).

```systemverilog
// Syntax of a Blocking Assignment
variable_name = expression;
```

When a SystemVerilog simulator evaluates a blocking assignment inside a procedural block (`always_comb`, `always_ff`, or `initial`):

1. **RHS Evaluation**: The simulator reads and evaluates the Right-Hand Side (RHS) `expression` immediately using the current values of all variables.
2. **Immediate LHS Update**: The simulator immediately updates the Left-Hand Side (LHS) `variable_name` with the newly computed value.
3. **Procedural Blocking**: The simulator **blocks** the execution of any subsequent statements inside the same procedural block until the LHS update has completed.

```text
BLOCKING ASSIGNMENT EXECUTION TIMELINE

 Statement 1: x = a + b;  ──► 1. Evaluate (a + b)
                             2. UPDATE x IMMEDIATELY
                             3. Unblock next line...
                                   │
                                   ▼
 Statement 2: y = x * c;  ──► 1. Evaluate (x * c) USING NEW VALUE OF x!
                             2. UPDATE y IMMEDIATELY
```

#### Code Example: Sequential Propagation with Blocking Assignments

Consider the following procedural block executing with blocking assignments:

```systemverilog
logic [7:0] a, b, x, y;

always_comb begin
    x = a + b; // Line 1: Computes (a + b) and updates 'x' IMMEDIATELY
    y = x * 2; // Line 2: Computes (x * 2) using the NEW value of 'x' from Line 1!
end
```

Let's trace this execution step-by-step:
* Suppose $a = 3$ and $b = 4$.
* Line 1 executes: $a + b = 3 + 4 = 7$. Variable $x$ is updated to $7$ **immediately**.
* Line 2 executes: $x \times 2 = 7 \times 2 = 14$. Variable $y$ is updated to $14$.
* Result: $x = 7$ and $y = 14$.

---

### Why Blocking Assignments (`=`) Are Used for Combinational Logic

In combinational logic circuits, physical logic gates have no memory. Signals propagate continuously through cascades of gates. If the output of an Adder gate feeds into the input of a Multiplier gate, any change at the Adder input immediately propagates through the Adder and into the Multiplier.

```text
COMBINATIONAL GATE CASCADE (HARDWARE EQUIVALENT OF '=')

 Inputs A, B ──► [ Adder Gate ] ──► Wire X ──► [ Multiplier Gate ] ──► Output Y
                 (Computes A+B)                 (Computes X * 2)
```

Because blocking assignments update variables immediately and allow subsequent lines to use the newly computed values, **blocking assignments (`=`) perfectly match the physical propagation behavior of combinational logic gates**.

#### The Hardware Synthesis Rule for Combinational Logic:
> Always use **blocking assignments (`=`)** inside combinational procedural blocks (`always_comb`).

---

## Mechanics of Non-Blocking Assignments (`<=`) and Sequential Logic

Now let us examine the opposite assignment operator: the **Non-Blocking Assignment (`<=`)**.

---

### Primitive 2: Non-Blocking Assignment Mechanics (`<=`)

A **Non-Blocking Assignment** uses the less-than-or-equal symbol (`<=`). 

```systemverilog
// Syntax of a Non-Blocking Assignment
variable_name <= expression;
```

*(Note: Although `<=" looks like the mathematical "less than or equal to" comparison operator, inside a SystemVerilog procedural block, `<=" is an assignment operator!)*

When a SystemVerilog simulator evaluates a non-blocking assignment inside a procedural block:

1. **RHS Evaluation**: The simulator reads and evaluates the Right-Hand Side (RHS) `expression` immediately using the current values of variables at that exact microsecond.
2. **Scheduling the LHS Update**: The simulator **does NOT update** the Left-Hand Side (LHS) `variable_name` immediately. Instead, it places the updated value into a temporary simulator queue called the **Non-Blocking Assignment (NBA) Event Queue**.
3. **Non-Blocking Continuation**: The simulator **does NOT block** subsequent lines of code! It immediately proceeds to evaluate the next line of code in the block **using the OLD, UN-UPDATED values of all variables**.
4. **Deferred Update Phase**: At the very end of the current simulation time step (after all procedural blocks have evaluated their RHS expressions), the simulator empties the NBA queue and applies all scheduled LHS variable updates simultaneously!

```text
NON-BLOCKING ASSIGNMENT EXECUTION TIMELINE

 Time t (Clock Edge):
 Statement 1: x <= a;  ──► 1. Evaluate 'a' using current value
                           2. Schedule update (x = a) in NBA Queue
                           3. DO NOT BLOCK! Proceed immediately...
                                 │
                                 ▼
 Statement 2: y <= x;  ──► 1. Evaluate 'x' USING OLD VALUE OF x!
                           2. Schedule update (y = x) in NBA Queue

 End of Time Step t:
 NBA Queue Flush       ──► APPLY ALL UPDATES SIMULTANEOUSLY!
                           x gets new value 'a'.
                           y gets OLD value of 'x'!
```

#### Code Example: Parallel Pipeline Register with Non-Blocking Assignments

Consider the exact same sequence of statements, but written using non-blocking assignments inside a sequential clock block:

```systemverilog
logic [7:0] a, x, y;

always_ff @(posedge clk) begin
    x <= a; // Line 1: Evaluates 'a', schedules 'x' update in NBA Queue
    y <= x; // Line 2: Evaluates 'x' (OLD VALUE!), schedules 'y' update in NBA Queue
end
```

Let's trace this execution step-by-step across consecutive clock cycles:

##### Initial State before Clock Edge 1:
* Suppose $a = 10$, $x = 5$, and $y = 2$.

##### Clock Edge 1 Arrives:
1. **Line 1 Evaluation**: Reads current $a = 10$. Schedules $x \Leftarrow 10$ in the NBA Queue.
2. **Line 2 Evaluation**: Reads current $x = 5$ (**OLD VALUE!** $x$ has not been updated yet!). Schedules $y \Leftarrow 5$ in the NBA Queue.
3. **NBA Queue Execution (End of Time Step)**:
   * Variable $x$ updates to $10$.
   * Variable $y$ updates to $5$.
* Result after Clock Edge 1: $x = 10$, $y = 5$.

Notice what happened: $y$ received $5$ (the value $x$ held *before* the clock edge), while $x$ received $10$. Data moved forward by exactly one stage in a pipeline!

```text
PIPELINE REGISTER STEP-BY-STEP DATA MOVEMENT

 Initial State :  a = 10   ──►   x = 5    ──►   y = 2
                                 │              │
 Clock Edge 1  :  a = 10   ──►   x = 10   ──►   y = 5   (q1 gets a, q2 gets OLD x!)
 Clock Edge 2  :  a = 20   ──►   x = 20   ──►   y = 10  (q1 gets new a, q2 gets 10!)
```

This behavior maps 100% perfectly to two physical edge-triggered flip-flops connected in series ($\text{FF}_1 \to \text{FF}_2$).

#### The Hardware Synthesis Rule for Sequential Logic:
> Always use **non-blocking assignments (`<=`)** inside sequential procedural blocks (`always_ff @(posedge clk)`).

---

## The Stratified Event Queue: How Simulators Schedule Time Steps

To understand why mixing `=` and `<=` causes simulation bugs, we must peek under the hood of the SystemVerilog simulator engine and examine the **Stratified Event Queue**.

When you run a hardware simulation, the simulator divides time into discrete steps ($t_0, t_1, t_2, \dots$). Within a single time step $t$, the simulator executes events across multiple ordered **Scheduling Regions**:

```text
SIMULATOR STRATIFIED EVENT QUEUE REGIONS (IEEE 1800 STANDARD)

              ┌──────────────────────────────────────────┐
              │ 1. Active Region                         │
              │    * Evaluate RHS of blocking '='        │
              │    * Update LHS of blocking '='          │
              │    * Evaluate RHS of non-blocking '<='   │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │ 2. Inactive Region                       │
              │    * Process #0 delay events             │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │ 3. NBA Region (Non-Blocking Assign)      │
              │    * FLUSH NBA QUEUE!                    │
              │    * Update LHS of non-blocking '<='     │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │ 4. Postponed Region                      │
              │    * Execute $strobe / $monitor          │
              └──────────────────────────────────────────┘
```

Let's trace how the simulator processes these regions during a clock edge:

1. **Active Region**:
   * The simulator evaluates continuous assignments (`assign`).
   * The simulator evaluates blocking assignments (`=`): it computes RHS and **updates LHS immediately**.
   * The simulator evaluates non-blocking assignments (`<=`): it computes RHS **and pushes the update into the NBA queue**.
2. **NBA Region (Non-Blocking Assignment Update Region)**:
   * After ALL active region evaluations finish, the simulator enters the NBA region.
   * It flushes the NBA queue, applying all scheduled non-blocking LHS updates simultaneously.
3. **Re-Triggering Active Region**:
   * If any non-blocking update in the NBA region changes a signal that triggers another block (for example, a clock or enable line), the simulator loops back to the Active Region to evaluate the triggered blocks.

---

## The Collapsed Pipeline Disaster: What Happens When You Mix Up Assignments

To understand why incorrect assignment choices ruin hardware designs, let us analyze two classic hardware coding disasters.

---

### Disaster 1: Collapsing a Pipeline Register using Blocking Assignments in Sequential Blocks

Suppose an engineer wants to build a 3-stage shift register pipeline ($\text{FF}_1 \to \text{FF}_2 \to \text{FF}_3$) to delay a data signal by 3 clock cycles.

The engineer incorrectly uses **blocking assignments (`=`)** inside a sequential clock block:

```systemverilog
// INCORRECT HARDWARE CODE (DO NOT DO THIS!)
logic [7:0] d, q1, q2, q3;

always_ff @(posedge clk) begin
    q1 = d;  // Line 1: Updates q1 IMMEDIATELY to 'd'
    q2 = q1; // Line 2: Updates q2 IMMEDIATELY to NEW q1 (which is 'd'!)
    q3 = q2; // Line 3: Updates q3 IMMEDIATELY to NEW q2 (which is 'd'!)
end
```

```text
THE COLLAPSED PIPELINE DISASTER

 Intended 3-Stage Hardware Pipeline:
 Data d ──► [ FF 1 (q1) ] ──► [ FF 2 (q2) ] ──► [ FF 3 (q3) ] ──► Output
             (3 Clock Cycles of Delay Intended)

 Actual Synthesized Circuit (Using Blocking '='):
 Data d ────────────────────────────────────────► [ FF 3 (q3) ] ──► Output
             (Pipeline COLLAPSED into 1 single flip-flop!)
             (FF1 and FF2 optimized away as redundant wires!)
```

#### What Happens in Simulation and Synthesis:
1. **Line 1** executes: `q1` is updated to `d` immediately.
2. **Line 2** executes: `q2` reads `q1` (which is already `d`!) and updates `q2` to `d` immediately.
3. **Line 3** executes: `q3` reads `q2` (which is already `d`!) and updates `q3` to `d` immediately.

In a single clock edge, the signal `d` passed straight through all three variables! The 3-stage delay pipeline **collapsed into a single 1-stage register**! Flip-flops `q1` and `q2` were eliminated by the synthesis tool as redundant wires.

#### The Correct Fix:
Rewrite the sequential block using **non-blocking assignments (`<=`)**:

```systemverilog
// CORRECT PIPELINE HARDWARE CODE
always_ff @(posedge clk) begin
    q1 <= d;  // Schedules q1 update with 'd'
    q2 <= q1; // Schedules q2 update with OLD q1!
    q3 <= q2; // Schedules q3 update with OLD q2!
end
```

With non-blocking assignments, `q2` samples the value `q1` held *before* the clock edge, and `q3` samples the value `q2` held *before* the clock edge. The 3-stage pipeline is preserved with 100% fidelity.

---

### Disaster 2: Inter-Block Race Conditions with Blocking Assignments

What if an engineer splits the 3-stage pipeline across three separate `always` blocks, but still uses blocking assignments (`=`)?

```systemverilog
// INTER-BLOCK RACE CONDITION HAZARD
logic [7:0] d, q1, q2;

// Block 1
always_ff @(posedge clk) begin
    q1 = d;
end

// Block 2
always_ff @(posedge clk) begin
    q2 = q1; // DEPENDS ON BLOCK 1!
end
```

#### Why This Creates a Fatal Simulation Race Condition:
Both `always_ff` blocks trigger on the exact same rising clock edge (`posedge clk`). 

Because the IEEE SystemVerilog standard does NOT specify which `always` block a simulator must execute first, different simulators will execute these two blocks in a different order:

* **Simulator A (Executes Block 1 first, then Block 2)**:
  1. Block 1 executes: `q1` updates to `d` immediately.
  2. Block 2 executes: `q2` reads NEW `q1` (which is `d`).
  3. Result: `q2` gets `d` (1 cycle of delay).
* **Simulator B (Executes Block 2 first, then Block 1)**:
  1. Block 2 executes: `q2` reads OLD `q1`.
  2. Block 1 executes: `q1` updates to `d`.
  3. Result: `q2` gets OLD `q1` (2 cycles of delay!).

```text
INTER-BLOCK SIMULATION RACE CONDITION

 Simulator A Order (Block 1 -> Block 2):
   Block 1 updates q1 = d  ──►  Block 2 reads NEW q1  ──► q2 gets d (1 Cycle)

 Simulator B Order (Block 2 -> Block 1):
   Block 2 reads OLD q1    ──►  Block 1 updates q1 = d  ──► q2 gets OLD q1 (2 Cycles)
                                 │
                                 ▼
              NON-DETERMINISTIC SIMULATION BEHAVIOR!
```

The simulation is non-deterministic! Changing simulators or adding a debug flag changes your hardware's timing behavior!

#### How Non-Blocking Assignments Eliminate the Race:
If both blocks use **non-blocking assignments (`<=`)**:

```systemverilog
// RACE-FREE INTER-BLOCK CODE
always_ff @(posedge clk) begin
    q1 <= d;
end

always_ff @(posedge clk) begin
    q2 <= q1;
end
```

* **If Simulator A executes Block 1 first**:
  1. Block 1 reads `d`, schedules `q1 <= d` in NBA queue.
  2. Block 2 reads OLD `q1`, schedules `q2 <= q1_old` in NBA queue.
  3. NBA queue flushes: `q1` gets `d`, `q2` gets `q1_old`.
* **If Simulator B executes Block 2 first**:
  1. Block 2 reads OLD `q1`, schedules `q2 <= q1_old` in NBA queue.
  2. Block 1 reads `d`, schedules `q1 <= d` in NBA queue.
  3. NBA queue flushes: `q1` gets `d`, `q2` gets `q1_old`.

Both simulators produce the **EXACT SAME DETERMINISTIC RESULT!** The race condition is completely eradicated.

---

## The Eight Commandments of SystemVerilog Assignments (Cummings' Rules)

To ensure that your SystemVerilog code always simulates deterministically and synthesizes into race-free physical hardware, Cliff Cummings formulated the industry-standard rules for procedural assignments:

```text
THE SYSTEMVERILOG ASSIGNMENT RULES MATRIX

 Procedural Block Type │ Target Hardware       │ Required Assignment Operator
───────────────────────┼───────────────────────┼───────────────────────────────
 always_ff             │ Sequential Flip-Flops │ Non-Blocking (<=)
 always_comb           │ Combinational Gates   │ Blocking (=)
 always_latch          │ Transparent Latches   │ Non-Blocking (<=)
 assign (Continuous)   │ Combinational Wires   │ Procedural Assignments FORBIDDEN!
```

### The Eight Commandments:

1. **Rule 1**: When modeling **sequential logic** (`always_ff @(posedge clk)`), use **non-blocking assignments (`<=`)**.
2. **Rule 2**: When modeling **combinational logic** (`always_comb`), use **blocking assignments (`=`)**.
3. **Rule 3**: When modeling **latches** (`always_latch`), use **non-blocking assignments (`<=`)**.
4. **Rule 4**: When modeling both sequential and combinational logic inside the same `always_ff` block, use **non-blocking assignments (`<=`)**.
5. **Rule 5**: **NEVER mix blocking (`=`) and non-blocking (`<=`) assignments inside the same procedural block!**
6. **Rule 6**: **NEVER assign to the same variable from more than one `always` block!** Multiple drivers create simulation race conditions and physical short circuits.
7. **Rule 7**: Do NOT use `$strobe` or `#0` delays to fix simulation race conditions. Use proper assignment operators instead.
8. **Rule 8**: Do NOT use blocking assignments (`=`) in sequential blocks to "save lines of code". It will cause pipeline collapse or simulation-synthesis mismatches.

---

## Engineering Reality: Simulation-Versus-Synthesis Mismatches

Why do simulation-versus-synthesis mismatches happen, and why are they the most dangerous bugs in digital engineering?

A **Simulation-Versus-Synthesis Mismatch** occurs when a SystemVerilog simulator predicts one behavior during testing, but the logic synthesis tool builds physical hardware that behaves completely differently on the actual silicon chip.

```text
SIMULATION-VERSUS-SYNTHESIS MISMATCH

 SystemVerilog Source Code
           │
           ├───────────────────────────────┐
           ▼                               ▼
 [ RTL Simulator Engine ]        [ Logic Synthesis Tool ]
   (Obeys procedural execution)    (Obeys physical gate topology)
           │                               │
           ▼                               ▼
   Simulation PASSED!             Physical Chip FAILS!
 (Predicts valid behavior)        (Circuit crashes on board!)
```

### Why Synthesis Tools Ignore Procedural Execution Delays
A SystemVerilog simulator is a software program that interprets procedural lines over time steps. If you write bad code with blocking assignments in sequential blocks, the simulator executes those lines sequentially in its Active event region.

A logic synthesis tool, however, **does not run a simulator**. The synthesis tool parses your SystemVerilog code, infers physical hardware components (flip-flops, multiplexers, gates), and connects them together. 

If you write:

```systemverilog
always_ff @(posedge clk) begin
    a = b;
    c = a;
end
```

* **The Simulator** executes `a = b` first, then executes `c = a` using new `a`.
* **The Synthesis Tool** analyzes the dataflow: it sees that variable `a` is assigned `b`, and variable `c` is assigned `a`. It infers that `c` is functionally equal to `b`. It synthesizes a single flip-flop for `c` connected directly to `b`, and completely deletes the flip-flop for `a`!

If your testbench relied on `a` holding a 1-cycle delayed version of `b`, your simulation passed, but your physical chip fails in the factory!

By adhering strictly to Cummings' Rules (non-blocking `<=` for sequential, blocking `=` for combinational), you guarantee that simulator event scheduling matches physical silicon topology with 100% mathematical precision.

---

## Solved Industrial Engineering Exercise: 4-Stage Arithmetic Pipeline Register

To consolidate your complete mastery of blocking versus non-blocking assignments, event queue scheduling, pipeline synthesis, and race-free RTL design, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are designing an onboard **Data Conditioning and 4-Stage Pipeline Processor** for a satellite's high-speed radar imaging payload.

The module receives an 8-bit raw data stream (`logic [7:0] raw_data`) and an active-high data valid flag (`logic data_valid`).

```text
RADAR DATA CONDITIONING PIPELINE ARCHITECTURE

 Raw Input raw_data[7:0] ──► [ Combinational Pre-Filter ] ──► Filtered Data
                                                                  │
                                                                  ▼
 Output Result y[7:0] ◄── [ Stage 3 ] ◄── [ Stage 2 ] ◄── [ Stage 1 ]
                          (4-Stage Synchronous Register Pipeline)
```

#### System Processing Requirements

The module consists of two distinct processing stages:

1. **Stage 1: Combinational Pre-Filter Block**:
   * Evaluates if `data_valid` is High.
   * If `data_valid == 1`, compute `filtered_data = (raw_data * 2) + 8'h05`.
   * If `data_valid == 0`, compute `filtered_data = 8'h00`.
   * MUST be implemented in a dedicated combinational procedural block (`always_comb`).
2. **Stage 2: 3-Stage Sequential Pipeline Register Array**:
   * On every rising edge of `clk`, data must pass through three cascaded register stages:
     * `pipe_reg1` captures `filtered_data`.
     * `pipe_reg2` captures `pipe_reg1`.
     * `pipe_reg3` captures `pipe_reg2`.
     * Output `processed_out` emits `pipe_reg3`.
   * If active-low `reset_n == 0`, all pipeline registers must clear synchronously to `8'h00`.
   * MUST be implemented in a dedicated sequential procedural block (`always_ff @(posedge clk)`).

#### Your Objective

1. Write the SystemVerilog module `RadarPipelineProcessor` applying Cummings' Rules strictly (blocking `=` for combinational, non-blocking `<=` for sequential).
2. Draw the complete physical hardware schematic inferred by the synthesis tool.
3. Trace the step-by-step simulation event queue behavior across 4 clock cycles for a given test input.
4. Demonstrate what happens if an inexperienced engineer incorrectly uses blocking assignments (`=`) inside the sequential pipeline block.
5. Verify mathematical and structural correctness.

---

### Step-by-Step Derivation

#### Step 1: Write the Synthesizable SystemVerilog Module

We construct the module using two cleanly separated procedural blocks:

```systemverilog
`default_nettype none

module RadarPipelineProcessor (
    input  logic       clk,
    input  logic       reset_n,
    input  logic       data_valid,
    input  logic [7:0] raw_data,
    output logic [7:0] processed_out
);

    // Internal Signals
    logic [7:0] filtered_data;
    logic [7:0] pipe_reg1;
    logic [7:0] pipe_reg2;
    logic [7:0] pipe_reg3;

    // -----------------------------------------------------------------
    // 1. COMBINATIONAL PRE-FILTER BLOCK (Uses Blocking '=' Assignments)
    // -----------------------------------------------------------------
    always_comb begin
        if (data_valid) begin
            filtered_data = (raw_data << 1) + 8'h05; // Immediate evaluation
        end else begin
            filtered_data = 8'h00;
        end
    end

    // -----------------------------------------------------------------
    // 2. SEQUENTIAL PIPELINE BLOCK (Uses Non-Blocking '<=' Assignments)
    // -----------------------------------------------------------------
    always_ff @(posedge clk) begin
        if (!reset_n) begin
            pipe_reg1     <= 8'h00;
            pipe_reg2     <= 8'h00;
            pipe_reg3     <= 8'h00;
            processed_out <= 8'h00;
        end else begin
            pipe_reg1     <= filtered_data; // Non-blocking: scheduled in NBA
            pipe_reg2     <= pipe_reg1;     // Samples OLD pipe_reg1!
            pipe_reg3     <= pipe_reg2;     // Samples OLD pipe_reg2!
            processed_out <= pipe_reg3;     // Samples OLD pipe_reg3!
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 2: Draw the Inferred Physical Hardware Schematic

Let me trace the physical hardware components synthesized by the compiler:

```text
INFERRED HARDWARE SCHEMATIC

 Raw Data[7:0] ──► [ Shift Left 1 ] ──► [ Adder (+5) ]
                                              │
 Data Valid ─────────────────► [ 2:1 MUX ] ───┘
                                   │ (filtered_data)
                                   ▼
                             ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
                             │ D      Q │      │ D      Q │      │ D      Q │      │ D      Q │
                             │ pipe_reg1├─────►│ pipe_reg2├─────►│ pipe_reg3├─────►│proc_out  ├─► Output
                             │  (FF 1)  │      │  (FF 2)  │      │  (FF 3)  │      │  (FF 4)  │
                             └────▲─────┘      └────▲─────┘      └────▲─────┘      └────▲─────┘
                                  │                 │                 │                 │
 Global Clock CLK ────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

Look at the physical schematic:
* The `always_comb` block synthesized into a shifter, an adder, and a 2:1 multiplexer.
* The `always_ff` block synthesized into **four physical D flip-flops in series** (`pipe_reg1`, `pipe_reg2`, `pipe_reg3`, `proc_out`).
* All four flip-flops share the same global clock `clk`.

---

#### Step 3: Trace Cycle-by-Cycle Simulation Behavior

Let us trace the module across 4 clock cycles with test input `raw_data = 8'd10` (`8'h0A`) and `data_valid = 1`.

##### Combinational Pre-Filter Evaluation:
$$filtered\_data = (10 \times 2) + 5 = 20 + 5 = 25 \quad (8\text{'h}19)$$

Initial State before Clock 1 (after reset):
`pipe_reg1 = 8'h00`, `pipe_reg2 = 8'h00`, `pipe_reg3 = 8'h00`, `processed_out = 8'h00`.

```text
CYCLE-BY-CYCLE PIPELINE SIMULATION TRACE

 Clock Edge  │ filtered_data │ pipe_reg1 │ pipe_reg2 │ pipe_reg3 │ processed_out │ Hardware Action
─────────────┼───────────────┼───────────┼───────────┼───────────┼───────────────┼─────────────────────────────
 Initial (t0)│     8'h19     │   8'h00   │   8'h00   │   8'h00   │     8'h00     │ Reset State
 Clock Edge 1│     8'h19     │   8'h19   │   8'h00   │   8'h00   │     8'h00     │ FF1 captures 8'h19 (25)
 Clock Edge 2│     8'h19     │   8'h19   │   8'h19   │   8'h00   │     8'h00     │ FF2 captures 8'h19 (25)
 Clock Edge 3│     8'h19     │   8'h19   │   8'h19   │   8'h19   │     8'h00     │ FF3 captures 8'h19 (25)
 Clock Edge 4│     8'h19     │   8'h19   │   8'h19   │   8'h19   │     8'h19     │ FF4 emits 8'h19 to Output!
```

##### Event Queue Chronology on Clock Edge 1:
1. **Active Region**:
   * `pipe_reg1 <= 8'h19` scheduled in NBA queue.
   * `pipe_reg2 <= 8'h00` (OLD `pipe_reg1`) scheduled in NBA queue.
   * `pipe_reg3 <= 8'h00` (OLD `pipe_reg2`) scheduled in NBA queue.
   * `processed_out <= 8'h00` (OLD `pipe_reg3`) scheduled in NBA queue.
2. **NBA Region**:
   * All updates applied simultaneously: `pipe_reg1` becomes `8'h19`, others stay `8'h00`.

The data value $25$ (`8'h19`) advances through the pipeline by **exactly one stage per clock cycle**. On Clock Edge 4 (after 4 clock delays), `processed_out` emits $25$.

---

#### Step 4: Demonstrating the Blocking Assignment Failure Case

Suppose a junior engineer incorrectly modifies the sequential block to use **blocking assignments (`=`)**:

```systemverilog
// INCORRECT SEQUENTIAL BLOCK WITH BLOCKING '=
always_ff @(posedge clk) begin
    if (!reset_n) begin
        // ...
    end else begin
        pipe_reg1     = filtered_data; // Line 1: Immediately updates pipe_reg1 = 8'h19
        pipe_reg2     = pipe_reg1;     // Line 2: Immediately updates pipe_reg2 = NEW pipe_reg1 (8'h19!)
        pipe_reg3     = pipe_reg2;     // Line 3: Immediately updates pipe_reg3 = NEW pipe_reg2 (8'h19!)
        processed_out = pipe_reg3;     // Line 4: Immediately updates processed_out = 8'h19!
    end
end
```

#### What Happens on Clock Edge 1 with Blocking Assignments?
1. Line 1 executes: `pipe_reg1` becomes `8'h19` immediately.
2. Line 2 executes: `pipe_reg2` reads `pipe_reg1` (already `8'h19`!) and becomes `8'h19` immediately.
3. Line 3 executes: `pipe_reg3` reads `pipe_reg2` (already `8'h19`!) and becomes `8'h19` immediately.
4. Line 4 executes: `processed_out` reads `pipe_reg3` (already `8'h19`!) and emits `8'h19` immediately!

```text
COLLAPSED PIPELINE TIMING COMPARISON

 Correct Code (Non-Blocking <=):  processed_out updates on Clock Edge 4 (4 Cycles Delay)
 Incorrect Code (Blocking = )   :  processed_out updates on Clock Edge 1 (0 Cycles Delay!)
                                  (PIPELINE COLLAPSED! 3 STAGES OF DELAY LOST!)
```

The 4-stage pipeline **collapsed into a 1-stage register**! 

The synthesis tool deletes `pipe_reg1`, `pipe_reg2`, and `pipe_reg3` as redundant wires, creating a simulation-versus-synthesis mismatch that ruins the radar timing architecture.

---

### Sanity Check and Verification

Let us verify our correct non-blocking implementation (`<=`) against all system requirements:

1. **Rule Compliance Check**:
   * `always_comb` block uses blocking assignments (`=`). **PASS!**
   * `always_ff` block uses non-blocking assignments (`<=`). **PASS!**
   * Zero mixing of `=` and `<=` inside individual blocks. **PASS!**
   * All variables assigned in exactly one `always` block. **PASS!**

2. **Pipeline Delay Verification**:
   * Output `processed_out` receives data after exactly 4 clock edges ($t_1, t_2, t_3, t_4$).
   * Mathematical output value = $(10 \times 2) + 5 = 25_{10} = 8\text{'h}19$.
   * **Result**: Data pipeline integrity is 100% verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Blocking Assignments (`=`)**: The procedural assignment operator that evaluates its right-hand side and updates its left-hand side variable immediately, blocking subsequent statement execution within the same block to model combinational gate propagation in `always_comb` logic.
* **Non-Blocking Assignments (`<=`)**: The procedural assignment operator that evaluates its right-hand side using current time-step values and defers the left-hand side update to the Non-Blocking Assignment (NBA) region of the simulator event queue, enabling simultaneous state updates to model synchronous register pipelines and flip-flops in `always_ff` logic without race conditions.
