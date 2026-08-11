# Delta-Cycle Execution Dynamics and Zero-Delay Simulation Race Condition Mitigation

## The Illusion of Zero-Delay Logic and Causality Order Breakdown

When physical digital logic gates operate inside a silicon microchip, every single gate operation requires a finite amount of time. When an electrical signal at the input of an AND gate transitions from $0\text{ V}$ to $V_{DD}$, electrons must physically move through the silicon channel, charge the parasitic capacitance of the output wire, and pull the output terminal to $V_{DD}$. This physical process takes a measurable amount of time—typically 5 to 50 picoseconds in modern CMOS technology processes.

In physical silicon, causality is enforced by the laws of physics. If Gate A drives Gate B, and Gate B drives Gate C, the physical switching events occur in a natural, sequential time cascade:

```text
PHYSICAL SILICON SIGNAL PROPAGATION (FINITE GATE DELAYS)

 Input A Flips (t = 0.00 ps)
       │
       ▼
 [ Gate 1 (50 ps Delay) ] ──► Wire X Flips (t = 50.00 ps)
                                  │
                                  ▼
                            [ Gate 2 (50 ps Delay) ] ──► Output Y (t = 100.00 ps)
```

Notice how physical time $t$ advances naturally as the signal passes through each gate. At $t = 0\text{ ps}$, Input $A$ flips; at $t = 50\text{ ps}$, Wire $X$ flips; at $t = 100\text{ ps}$, Output $Y$ flips. Because physical time moves forward during every gate transition, there is zero ambiguity about cause and effect.

However, when software engineers write Register-Transfer Level (RTL) code in SystemVerilog to model complex microchips containing millions of gates, modeling the exact picosecond gate delay of every single AND, OR, and NOT gate is practically impossible. 

If a software simulator had to calculate temperature-dependent, voltage-dependent picosecond delays for millions of gates on every simulation step, a single second of hardware operation would take days to simulate on a computer workstation.

To achieve high simulation speeds, hardware description languages use **Zero-Delay Logic Modeling**. In RTL simulation, combinational logic gates and procedural assignments are modeled as if they execute in **zero physical time** (`#0`).

This zero-delay abstraction creates a severe architectural contradiction:

If Gate 1, Gate 2, and Gate 3 all operate in zero physical time, they ALL claim to update their outputs at the exact same physical simulation time instant (for example, at $t = 10.00\text{ ns}$).

```text
ZERO-DELAY SIMULATION AMBIGUITY AT t = 10.00 ns

 Input A Flips at t = 10.00 ns
       │
       ├──────────────────────────┬──────────────────────────┐
       ▼                          ▼                          ▼
 [ Gate 1 (0 ps) ]          [ Gate 2 (0 ps) ]          [ Gate 3 (0 ps) ]
 Claims update at 10.00 ns  Claims update at 10.00 ns  Claims update at 10.00 ns
```

How does a software simulator running on a single-threaded CPU decide which zero-delay gate to evaluate first at $t = 10.00\text{ ns}$?

If Gate 3 depends on the output of Gate 2, and Gate 2 depends on the output of Gate 1, evaluating Gate 3 *before* Gate 1 causes Gate 3 to read stale, outdated data! 

If the simulator's internal evaluation order is undefined, the output of your hardware model will change depending on how the compiler arranged the code in memory. This non-deterministic simulation failure is a **Zero-Delay Simulation Race Condition**.

To allow zero-delay hardware models to execute with 100% deterministic cause-and-effect ordering without advancing physical simulation time, SystemVerilog expands the time axis into a two-dimensional structure using **Delta Cycles ($\delta$)**.

---

## The Instantaneous Domino Cascade: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how delta cycles order cause-and-effect events within a single time instant, let us step away from microchips and picture a row of falling dominoes being filmed by a high-speed camera.

Imagine five dominoes standing in a line on a table: Domino 1, Domino 2, Domino 3, Domino 4, and Domino 5.

```text
THE HIGH-SPEED DOMINO CAMERA METAPHOR

 Domino 1    Domino 2    Domino 3    Domino 4    Domino 5
  ┌───┐       ┌───┐       ┌───┐       ┌───┐       ┌───┐
  │ 1 │  ──►  │ 2 │  ──►  │ 3 │  ──►  │ 4 │  ──►  │ 5 │
  └───┘       └───┘       └───┘       └───┘       └───┘
```

Suppose you tip over Domino 1 at exactly **12:00:00 PM**.

Now, consider how two different observers record this event:

### Observer A: The Standard Wall Clock (Physical Simulation Time $t$)
Observer A looks at a standard wall clock that only measures seconds. 
* At 12:00:00 PM, Domino 1 falls.
* At 12:00:00 PM, Domino 2 falls.
* At 12:00:00 PM, Domino 3 falls.
* At 12:00:00 PM, Domino 4 falls.
* At 12:00:00 PM, Domino 5 falls.

To Observer A's wall clock, all five dominoes fell at the exact same physical time: **12:00:00 PM**. 

If Observer A tries to explain *why* Domino 5 fell using only the wall clock, they run into a causality problem: *"Domino 5 fell at 12:00:00 PM, and Domino 1 fell at 12:00:00 PM. Which one caused which?"*

### Observer B: The High-Speed Sub-Frame Camera (Delta Cycles $\delta$)
Observer B uses a high-speed camera that records 1,000 sub-frames within that single second of 12:00:00 PM. The camera labels these sub-frames as Delta 0 ($\delta_0$), Delta 1 ($\delta_1$), Delta 2 ($\delta_2$), and so on.

Let's look at Observer B's sub-frame film strip for time 12:00:00 PM:

```text
SUB-FRAME FILM STRIP AT TIME 12:00:00 PM

 Sub-Frame delta_0 (12:00:00 PM) ──► Finger pushes Domino 1.
 Sub-Frame delta_1 (12:00:00 PM) ──► Domino 1 strikes Domino 2.
 Sub-Frame delta_2 (12:00:00 PM) ──► Domino 2 strikes Domino 3.
 Sub-Frame delta_3 (12:00:00 PM) ──► Domino 3 strikes Domino 4.
 Sub-Frame delta_4 (12:00:00 PM) ──► Domino 4 strikes Domino 5.
```

Look at what Observer B's sub-frame camera reveals:
* To the outside world (the wall clock $t$), the entire sequence happened instantaneously at **12:00:00 PM**.
* But inside the camera (the simulator engine), the events were strictly ordered across sub-frames $\delta_0 \to \delta_1 \to \delta_2 \to \delta_3 \to \delta_4$.
* Cause and effect were preserved perfectly! Domino 1 caused Domino 2 to fall in $\delta_1$, which caused Domino 3 to fall in $\delta_2$.

This high-speed sub-frame camera is the exact physical analogue of **Delta-Cycle Execution**:
* The wall clock time (12:00:00 PM) is **Physical Simulation Time ($t$)**.
* The high-speed sub-frames ($\delta_0, \delta_1, \delta_2$) are **Delta Cycles ($\delta$)**.
* The domino chain is a **Cascade of Combinational Logic Gates**.

Delta cycles allow a software simulator to process cause-and-effect logic chains step by step without advancing the main physical simulation clock $t$!

---

## Mechanics of Two-Dimensional Simulation Time ($t, \delta$)

To master simulation behavior, we must formalize how SystemVerilog tracks time across two dimensions.

Simulation time in SystemVerilog is not a single scalar number. It is a **two-dimensional composite tuple**:

$$
T_{\text{sim}} = (t, \, \delta)
$$

Where:
* $t \in \mathbb{R}_{\ge 0}$ is the **Physical Simulation Time**, measured in user time units (e.g., nanoseconds, picoseconds). This time advances ONLY when explicit delay controls (`#10`, `#0.5ns`) or clock edge delays (`@(posedge clk)`) occur.
* $\delta \in \mathbb{N}_0$ is the **Delta Cycle Iteration Count**, a non-negative integer ($0, 1, 2, 3, \dots$). This count advances automatically whenever zero-delay events trigger new evaluation passes at the current physical time $t$.

```text
THE TWO-DIMENSIONAL TIME AXIS (t, delta)

 Physical Time t = 10.00 ns ───► Delta 0 (t=10.00ns, delta=0)
                                 │
                                 ▼ (Zero-delay event re-triggered)
                                 Delta 1 (t=10.00ns, delta=1)
                                 │
                                 ▼ (Zero-delay event re-triggered)
                                 Delta 2 (t=10.00ns, delta=2)
                                 │
                                 ▼ (No more events! Advance physical time t)
 Physical Time t = 20.00 ns ───► Delta 0 (t=20.00ns, delta=0)
```

---

### The Rules of Time Advancement

The SystemVerilog simulator engine advances the composite time tuple $(t, \delta)$ according to two strict mathematical rules:

#### Rule 1: Delta Advance Rule (Zero Physical Time Elapsed)
If an event executing at composite time $(t, \delta_k)$ modifies a signal that triggers another combinational block at the same physical time $t$, physical time stays constant ($t$), while the delta count increments by one:

$$
(t, \, \delta_k) \xrightarrow{\quad \text{Zero-delay evaluation pass} \quad} (t, \, \delta_{k+1})
$$

#### Rule 2: Physical Time Advance Rule
When all event queue regions for the current delta cycle $\delta_k$ at physical time $t$ become completely empty (no more active, inactive, or NBA events), the simulator resets the delta count to zero ($\delta_0$) and advances physical time $t$ to the next scheduled delay event:

$$
(t, \, \delta_k) \xrightarrow{\quad \text{Delay statement } \#D \quad} (t + D, \, \delta_0)
$$

---

## How Delta Cycles Propagate Combinational Logic Chains

To see delta-cycle execution in action, let us trace a cascade of three combinational logic gates operating with zero delay (`#0`) at physical time $t = 10.00\text{ ns}$.

Consider three SystemVerilog continuous assignments connected in series:

```systemverilog
logic a, x, y, z;

assign x = ~a;    // Gate 1: Inverter
assign y = x & b; // Gate 2: AND Gate
assign z = y | c; // Gate 3: OR Gate
```

```text
THREE-STAGE COMBINATIONAL GATE CASCADE

 Input A ──► [ Gate 1: NOT ] ──► Wire X ──► [ Gate 2: AND ] ──► Wire Y ──► [ Gate 3: OR ] ──► Output Z
                                             ▲                              ▲
 Input B ────────────────────────────────────┘                              │
 Input C ───────────────────────────────────────────────────────────────────┘
```

Suppose inputs $b = 1$ and $c = 0$. At physical time $t = 10.00\text{ ns}$, input $a$ flips from $0$ to $1$. 

Let us trace how the simulator processes this cascade across delta cycles:

---

### Delta Cycle 0 ($t = 10.00\text{ ns}, \delta_0$)

1. **Active Region**:
   * Input $a$ changes from $0$ to $1$ at $t = 10.00\text{ ns}$.
   * The simulator detects that Gate 1 (`assign x = ~a`) is sensitive to $a$.
   * Gate 1 evaluates: $x = \sim 1 = 0$.
   * Variable $x$ updates to $0$ immediately in the Active region of $\delta_0$.
2. **Delta Transition**:
   * The change on variable $x$ ($1 \to 0$) triggers Gate 2 (`assign y = x & b`), which is sensitive to $x$.
   * Because Gate 2 was triggered by an event in $\delta_0$, the simulator schedules Gate 2 to execute in **Delta Cycle 1 ($\delta_1$)** at the exact same physical time $t = 10.00\text{ ns}$!

---

### Delta Cycle 1 ($t = 10.00\text{ ns}, \delta_1$)

1. **Active Region**:
   * Gate 2 (`assign y = x & b`) executes.
   * Gate 2 reads updated $x = 0$ and current $b = 1$.
   * Gate 2 evaluates: $y = 0 \, \& \, 1 = 0$.
   * Variable $y$ updates to $0$ immediately in the Active region of $\delta_1$.
2. **Delta Transition**:
   * The change on variable $y$ triggers Gate 3 (`assign z = y | c`), which is sensitive to $y$.
   * The simulator schedules Gate 3 to execute in **Delta Cycle 2 ($\delta_2$)** at physical time $t = 10.00\text{ ns}$!

---

### Delta Cycle 2 ($t = 10.00\text{ ns}, \delta_2$)

1. **Active Region**:
   * Gate 3 (`assign z = y | c`) executes.
   * Gate 3 reads updated $y = 0$ and current $c = 0$.
   * Gate 3 evaluates: $z = 0 \mid 0 = 0$.
   * Variable $z$ updates to $0$ immediately in $\delta_2$.
2. **Quiescence (End of Delta Loop)**:
   * No further signals changed state. The event queue for $t = 10.00\text{ ns}$ is completely empty!
   * The simulator freezes delta cycle processing for $t = 10.00\text{ ns}$ and waits for the next physical clock edge or delay event.

```text
DELTA CYCLE PROPAGATION CHRONOLOGY (ALL AT t = 10.00 ns)

 Time Step (t, delta) │ Event Evaluated       │ Signal Updated │ Causality Action
──────────────────────┼───────────────────────┼────────────────┼───────────────────────────────
   (10.00 ns, delta0) │ Input 'a' flips 0->1  │  x = ~a = 0    │ Triggers Gate 2 for delta1
   (10.00 ns, delta1) │ Gate 2 (y = x & b)    │  y = 0 & 1 = 0 │ Triggers Gate 3 for delta2
   (10.00 ns, delta2) │ Gate 3 (z = y | c)    │  z = 0 | 0 = 0 │ Quiescence! Settled.
```

Look at this table! 

The signal $a \to x \to y \to z$ propagated through three consecutive gates across three delta cycles ($\delta_0 \to \delta_1 \to \delta_2$), **all at physical simulation time $t = 10.00\text{ ns}$**.

Cause and effect were preserved with 100% mathematical rigor.

---

## Anatomy of Zero-Delay Simulation Race Conditions

Now that we understand delta cycles, we can examine the exact physical mechanism of a **Zero-Delay Simulation Race Condition**.

> **Definition of a Zero-Delay Race Condition**: A simulation race condition occurs when two or more concurrent procedural blocks execute within the exact same delta cycle $(t, \delta_k)$, where one block writes to a variable and another block reads that same variable using **blocking assignments (`=`)**. The output of the simulation depends entirely on the arbitrary internal order in which the simulator chooses to execute those blocks.

Let us analyze two classic zero-delay race scenarios to see how race conditions corrupt simulation output.

---

### Race Scenario 1: The Inter-Block Sequential Race (Flip-Flop Pipeline Collapse)

Consider two sequential procedural blocks written by a designer who incorrectly used **blocking assignments (`=`)** instead of non-blocking assignments (`<=`):

```systemverilog
// INFLAMMATORY CODE WITH ZERO-DELAY RACE CONDITION
logic clk;
logic [7:0] d, q1, q2;

// Block 1 (Intended to be Pipeline Stage 1)
always @(posedge clk) begin
    q1 = d;
end

// Block 2 (Intended to be Pipeline Stage 2)
always @(posedge clk) begin
    q2 = q1;
end
```

Both `always` blocks trigger on the exact same rising clock edge `posedge clk` at time $t = 10.00\text{ ns}, \delta_0$.

Because both blocks are placed in the Active Region for $\delta_0$, the simulator engine is free to execute Block 1 first OR Block 2 first.

Let us trace the two possible execution orders:

#### Execution Order A (Simulator Vendor X runs Block 1 first):
1. **Delta 0, Active Region — Block 1 executes**:
   * Reads $d = 8\text{'hA5}$.
   * Updates $q1 = 8\text{'hA5}$ **immediately** (blocking assignment!).
2. **Delta 0, Active Region — Block 2 executes**:
   * Reads $q1$ (which was ALREADY updated to $8\text{'hA5}$ by Block 1!).
   * Updates $q2 = 8\text{'hA5}$ **immediately**.
3. **Result under Order A**:
   $$q1 = 8\text{'hA5}, \quad q2 = 8\text{'hA5}$$
   Data $d$ passed through BOTH flip-flops in a single clock cycle! The pipeline collapsed!

#### Execution Order B (Simulator Vendor Y runs Block 2 first):
1. **Delta 0, Active Region — Block 2 executes**:
   * Reads $q1$ (**OLD VALUE** $8\text{'h00}$ before the clock edge!).
   * Updates $q2 = 8\text{'h00}$ **immediately**.
2. **Delta 0, Active Region — Block 1 executes**:
   * Reads $d = 8\text{'hA5}$.
   * Updates $q1 = 8\text{'hA5}$ **immediately**.
3. **Result under Order B**:
   $$q1 = 8\text{'hA5}, \quad q2 = 8\text{'h00}$$
   Data $d$ moved into $q1$, while $q2$ captured old $q1$. The pipeline worked correctly!

```text
SIMULATOR EXECUTION ORDER RACE CONDITION

 Order A (Block 1 then Block 2) ──► q1 = 8'hA5, q2 = 8'hA5  (Pipeline Collapsed!)
 Order B (Block 2 then Block 1) ──► q1 = 8'hA5, q2 = 8'h00  (Pipeline Worked!)
                                     │
                                     ▼
                  NON-DETERMINISTIC SIMULATION FAILURE!
          (Behavior changes depending on EDA Tool or Compiler Flags!)
```

This is a disastrous zero-delay race condition. The exact same RTL code produces two completely different behaviors depending on compiler vendor or file ordering!

---

### Race Scenario 2: The Combinational-Sequential Clock Edge Race

Consider a combinational block that generates a control signal `enable`, and a sequential block that samples `enable` on the same clock edge:

```systemverilog
// COMBINATIONAL-SEQUENTIAL RACE HAZARD
logic clk, enable, data_in, data_out;

// Combinational Block
always @(*) begin
    enable = ~data_in; // Uses blocking assignment '='
end

// Sequential Block
always @(posedge clk) begin
    if (enable) begin
        data_out <= 1'b1;
    end
end
```

Suppose `data_in` changes at the exact same physical time $t = 10.00\text{ ns}$ that `posedge clk` arrives:
* If the simulator evaluates the combinational block first at $\delta_0$, `enable` updates to its new value *before* the sequential block checks `if (enable)`.
* If the simulator evaluates the sequential block first at $\delta_0$, the sequential block reads the *old* value of `enable` *before* the combinational block updates it!

Once again, simulation output depends on arbitrary software scheduling order.

---

## How Non-Blocking Assignments (`<=`) Eradicate Zero-Delay Races

How does SystemVerilog eliminate zero-delay race conditions permanently?

By using **Non-Blocking Assignments (`<=`)** for all sequential logic!

Let us rewrite Race Scenario 1 using non-blocking assignments (`<=`):

```systemverilog
// RACE-FREE SYSTEMVERILOG PIPELINE CODE
logic clk;
logic [7:0] d, q1, q2;

// Block 1
always_ff @(posedge clk) begin
    q1 <= d; // Non-blocking assignment!
end

// Block 2
always_ff @(posedge clk) begin
    q2 <= q1; // Non-blocking assignment!
end
```

Let us trace both possible execution orders using the Stratified Event Queue's **NBA Region**:

---

### Execution Order A under Non-Blocking Assignments (Block 1 first):

1. **Delta 0 ($\delta_0$), Active Region — Block 1 executes**:
   * Reads $d = 8\text{'hA5}$.
   * Schedules update $q1 \Leftarrow 8\text{'hA5}$ in the **NBA Queue**.
   * **$q1$ IS NOT UPDATED YET!** ($q1$ remains $8\text{'h00}$).
2. **Delta 0 ($\delta_0$), Active Region — Block 2 executes**:
   * Reads $q1$ (which is STILL $8\text{'h00}$!).
   * Schedules update $q2 \Leftarrow 8\text{'h00}$ in the **NBA Queue**.
   * **$q2$ IS NOT UPDATED YET!**
3. **Delta 0 ($\delta_0$), NBA Region (Flushing Queue)**:
   * Simulator applies both scheduled updates simultaneously:
     $$q1 = 8\text{'hA5}, \quad q2 = 8\text{'h00}$$

---

### Execution Order B under Non-Blocking Assignments (Block 2 first):

1. **Delta 0 ($\delta_0$), Active Region — Block 2 executes**:
   * Reads $q1 = 8\text{'h00}$.
   * Schedules update $q2 \Leftarrow 8\text{'h00}$ in the **NBA Queue**.
2. **Delta 0 ($\delta_0$), Active Region — Block 1 executes**:
   * Reads $d = 8\text{'hA5}$.
   * Schedules update $q1 \Leftarrow 8\text{'hA5}$ in the NBA Queue.
3. **Delta 0 ($\delta_0$), NBA Region (Flushing Queue)**:
   * Simulator applies both scheduled updates simultaneously:
     $$q1 = 8\text{'hA5}, \quad q2 = 8\text{'h00}$$

```text
RACE-FREE DETERMINISTIC EXECUTION VIA NBA QUEUE

 Execution Order A (Block 1 then Block 2) ──► q1 = 8'hA5, q2 = 8'h00
 Execution Order B (Block 2 then Block 1) ──► q1 = 8'hA5, q2 = 8'h00
                                               │
                                               ▼
                         100% DETERMINISTIC RESULT!
           (Identical behavior on ALL EDA tools and compilers!)
```

Look at the result: **Order A and Order B produced the EXACT SAME DETERMINISTIC RESULT!**

Because non-blocking assignments defer variable updates into the NBA region, **all blocks read the old, stable pre-clock values during the Active region**, completely eliminating the evaluation order dependency!

---

## Engineering Reality: `#0` Delays, Infinite Loops, and STA Mismatches

In real-world commercial chip development, understanding delta cycles is critical for debugging simulation failures and avoiding synthesis pitfalls.

### 1. The `#0` Inactive Region Anti-Pattern

In legacy Verilog code, engineers who did not understand non-blocking assignments often tried to fix race conditions by inserting explicit zero-delay controls: `#0`.

```systemverilog
// DANGEROUS LEGACY ANTI-PATTERN (DO NOT USE #0!)
always @(posedge clk) begin
    #0 q1 = d; // Pushes assignment into Inactive region!
end
```

#### Why `#0` Delays Destroy Code Quality:
1. **Secondary Race Conditions**: Writing `#0` pushes the execution from the Active region into the **Inactive Region**. If another engineer writes `#0` in a second block, those two `#0` blocks now race against each other in the Inactive region! You have simply moved the race condition to a different region of the event queue!
2. **Simulation Slowdown**: Forcing the simulator to switch back and forth between Active and Inactive event queue regions degrades simulation performance by up to 300%.
3. **Synthesis Ignorance**: Logic synthesis tools **completely ignore `#0` delays**. The synthesis tool strips out the `#0`, building a physical circuit that behaves differently from your simulation!

**Rule**: **NEVER use `#0` delays in RTL hardware design.** Use non-blocking assignments (`<=`) for sequential logic instead.

---

### 2. Delta-Cycle Infinite Loops (Combinational Oscillation Crashes)

What happens if an engineer accidentally writes a combinational logic loop without a clock or delay?

```systemverilog
// COMBINATIONAL OSCILLATION LOOP
logic a, b;

assign a = ~b;
assign b = a;
```

Let's trace this code across delta cycles at physical time $t = 10.00\text{ ns}$:
1. **Delta 0 ($\delta_0$)**: $a$ changes $0 \to 1$. Triggers $b = a$.
2. **Delta 1 ($\delta_1$)**: $b$ changes $0 \to 1$. Triggers $a = \sim b$.
3. **Delta 2 ($\delta_2$)**: $a$ changes $1 \to 0$. Triggers $b = a$.
4. **Delta 3 ($\delta_3$)**: $b$ changes $1 \to 0$. Triggers $a = \sim b$.

```text
DELTA-CYCLE INFINITE LOOPING

 (t=10.00ns, delta0) : a = 1 ──► Triggers b
 (t=10.00ns, delta1) : b = 1 ──► Triggers a
 (t=10.00ns, delta2) : a = 0 ──► Triggers b
 (t=10.00ns, delta3) : b = 0 ──► Triggers a ...
 (Loop continues infinitely at physical time t = 10.00 ns!)
```

The simulator loops through delta cycles $\delta_0, \delta_1, \delta_2, \dots, \delta_{10000}$ at physical time $t = 10.00\text{ ns}$ without ever advancing simulation time $t$. 

Eventually, the simulator safety limit is reached, and the simulation crashes with a fatal error:
`Fatal Error: Iteration limit reached (10000 delta cycles) at time 10.00 ns. Possible zero-delay oscillation loop between signal 'a' and 'b'.`

---

## Solved Industrial Engineering Exercise: Multi-Stage Pipeline Simulation Trace and Delta-Cycle Race Audit

To consolidate your complete mastery of delta cycles, zero-delay simulation, event queue scheduling regions, and race condition mitigation, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics chip design team is auditing a 3-stage data pipeline for a radar signal processor.

The circuit consists of three cascaded register stages ($\text{FF}_1 \to \text{FF}_2 \to \text{FF}_3$) receiving an 8-bit input stream `d[7:0]`.

```text
RADAR 3-STAGE PIPELINE REGISTER SUBSYSTEM

 Input d[7:0] ──► [ FF 1 (q1) ] ──► [ FF 2 (q2) ] ──► [ FF 3 (q3) ] ──► Output
```

#### Initial Conditions at Time $t = 50.00\text{ ns}$ (Delta 0, Before Clock Edge):
* Input `d = 8'hFF` ($255_{10}$)
* Current Pipeline Registers: `q1 = 8'hAA`, `q2 = 8'h55`, `q3 = 8'h00`.

A rising clock edge `posedge clk` arrives at physical time $t = 50.00\text{ ns}$.

#### Your Objective

1. Audit **Design A** (written incorrectly using blocking assignments `=`) across two different simulator execution orderings (Order 1: $\text{FF}_1 \to \text{FF}_2 \to \text{FF}_3$; Order 2: $\text{FF}_3 \to \text{FF}_2 \to \text{FF}_1$). Show that Design A suffers from a zero-delay simulation race condition.
2. Audit **Design B** (written correctly using non-blocking assignments `<=`). Trace the exact delta-cycle chronology ($t, \delta$) and event queue regions (Active, NBA, Postponed) for both execution orderings, proving 100% deterministic results.
3. Calculate the delta-cycle iteration count at which final values settle.
4. Verify mathematical and structural correctness.

---

### Step-by-Step Derivation

#### Step 1: Audit Design A (Blocking Assignments `=`)

##### Flawed Code (Design A):
```systemverilog
always @(posedge clk) q1 = d;  // Block 1
always @(posedge clk) q2 = q1; // Block 2
always @(posedge clk) q3 = q2; // Block 3
```

##### Execution Order 1 (Simulator runs Block 1 $\to$ Block 2 $\to$ Block 3):
1. **Time $t = 50.00\text{ ns}, \delta_0$, Active Region**:
   * Block 1 runs: `q1` updates immediately to `d` (`8'hFF`).
   * Block 2 runs: `q2` reads `q1` (already `8'hFF`!) and updates `q2` immediately to `8'hFF`.
   * Block 3 runs: `q3` reads `q2` (already `8'hFF`!) and updates `q3` immediately to `8'hFF`.
2. **Result Order 1**: `q1 = 8'hFF`, `q2 = 8'hFF`, `q3 = 8'hFF`. (Pipeline Collapsed!).

##### Execution Order 2 (Simulator runs Block 3 $\to$ Block 2 $\to$ Block 1):
1. **Time $t = 50.00\text{ ns}, \delta_0$, Active Region**:
   * Block 3 runs: `q3` reads `q2` (`8'h55`) and updates `q3 = 8'h55`.
   * Block 2 runs: `q2` reads `q1` (`8'hAA`) and updates `q2 = 8'hAA`.
   * Block 1 runs: `q1` reads `d` (`8'hFF`) and updates `q1 = 8'hFF`.
2. **Result Order 2**: `q1 = 8'hFF`, `q2 = 8'hAA`, `q3 = 8'h55`. (Pipeline Worked!).

```text
DESIGN A (BLOCKING '=') AUDIT SUMMARY

 Simulator Order 1 (Block 1 -> 2 -> 3) ──► q1 = 8'hFF, q2 = 8'hFF, q3 = 8'hFF
 Simulator Order 2 (Block 3 -> 2 -> 1) ──► q1 = 8'hFF, q2 = 8'hAA, q3 = 8'h55
                                            │
                                            ▼
                       FATAL ZERO-DELAY RACE CONDITION!
```

Design A is non-deterministic. It fails the audit!

---

#### Step 2: Audit Design B (Non-Blocking Assignments `<=`)

##### Correct Code (Design B):
```systemverilog
always_ff @(posedge clk) q1 <= d;  // Block 1
always_ff @(posedge clk) q2 <= q1; // Block 2
always_ff @(posedge clk) q3 <= q2; // Block 3
```

Let me trace both execution orderings through the Stratified Event Queue:

##### Execution Order 1 (Simulator runs Block 1 $\to$ Block 2 $\to$ Block 3):

1. **Time $t = 50.00\text{ ns}, \delta_0$, Active Region Phase**:
   * **Block 1**: Reads $d = 8\text{'hFF}$. Schedules `q1 <= 8'hFF` in NBA Queue. (`q1` stays `8'hAA`).
   * **Block 2**: Reads current $q1 = 8\text{'hAA}$. Schedules `q2 <= 8'hAA` in NBA Queue. (`q2` stays `8'h55`).
   * **Block 3**: Reads current $q2 = 8\text{'h55}$. Schedules `q3 <= 8'h55` in NBA Queue. (`q3` stays `8'h00`).
2. **Time $t = 50.00\text{ ns}, \delta_0$, NBA Region Phase (Flushing Queue)**:
   * Simulator applies all scheduled non-blocking updates simultaneously:
     * `q1` updates to `8'hFF`.
     * `q2` updates to `8'hAA`.
     * `q3` updates to `8'h55`.

##### Execution Order 2 (Simulator runs Block 3 $\to$ Block 2 $\to$ Block 1):

1. **Time $t = 50.00\text{ ns}, \delta_0$, Active Region Phase**:
   * **Block 3**: Reads current $q2 = 8\text{'h55}$. Schedules `q3 <= 8'h55` in NBA Queue.
   * **Block 2**: Reads current $q1 = 8\text{'hAA}$. Schedules `q2 <= 8'hAA` in NBA Queue.
   * **Block 1**: Reads $d = 8\text{'hFF}$. Schedules `q1 <= 8'hFF` in NBA Queue.
2. **Time $t = 50.00\text{ ns}, \delta_0$, NBA Region Phase (Flushing Queue)**:
   * Simulator applies all scheduled non-blocking updates simultaneously:
     * `q1` updates to `8'hFF`.
     * `q2` updates to `8'hAA`.
     * `q3` updates to `8'h55`.

```text
DESIGN B (NON-BLOCKING '<=') AUDIT SUMMARY

 Simulator Order 1 (Block 1 -> 2 -> 3) ──► q1 = 8'hFF, q2 = 8'hAA, q3 = 8'h55
 Simulator Order 2 (Block 3 -> 2 -> 1) ──► q1 = 8'hFF, q2 = 8'hAA, q3 = 8'h55
                                            │
                                            ▼
                     100% DETERMINISTIC RACE-FREE RESULT!
```

Design B produces **100% identical, deterministic results** under all execution orderings!

---

#### Step 3: Delta Cycle Settling Time Calculation

* The clock edge fired at physical time $t = 50.00\text{ ns}$.
* All RHS expressions evaluated in Delta Cycle 0 Active Region ($t=50.00\text{ ns}, \delta_0$).
* All LHS updates flushed in Delta Cycle 0 NBA Region ($t=50.00\text{ ns}, \delta_0$).
* No new zero-delay events were re-triggered.

The simulation settled in **exactly 1 delta cycle ($\delta_0$)** at physical time $t = 50.00\text{ ns}$.

---

#### Step 4: Verification Against Hardware Pipeline Intention

Let us check the pipeline data movement:
* Stage 1 (`q1`) received new data `d` (`8'hFF`).
* Stage 2 (`q2`) received previous `q1` (`8'hAA`).
* Stage 3 (`q3`) received previous `q2` (`8'h55`).

Every data byte advanced through the pipeline by **exactly one stage**. The 3-stage register pipeline is 100% verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Delta Cycle ($\delta$)**: An infinitesimal zero-delay evaluation pass within a single physical simulation time step $t$ (composite time $T = (t, \delta)$) that allows causa-effect cascades of zero-delay combinational logic to propagate and settle without advancing physical simulation time.
* **Zero-Delay Simulation Race Condition**: A non-deterministic simulation failure that occurs when two concurrent procedural blocks execute within the same delta cycle and evaluate shared variables using blocking assignments (`=`), causing simulation output to depend on arbitrary software scheduling order.
