# Stratified Event Queue Architecture: Simulation Scheduling Regions, Delta-Cycle Mechanics, and Active-NBA Dualities

## The Concurrency Paradox of Single-Threaded Event Simulation

When a physical digital microchip is fabricated in silicon, every single transistor, logic gate, and flip-flop operates in 100% continuous, physical parallelism. If a microchip contains five million flip-flops connected to a global clock tree, all five million flip-flops sample their inputs and begin updating their outputs at the exact same physical nanosecond. There is no central manager deciding which flip-flop goes first; physical electron flow occurs simultaneously across the entire silicon die.

However, when a digital hardware engineer writes Hardware Description Language (HDL) code in SystemVerilog and runs a simulation on a workstation, that simulation does NOT run on five million parallel hardware processors. It runs on a software simulator executing on a standard, single-threaded central processing unit (CPU).

A single-threaded software CPU can execute only one instruction at a time. It cannot evaluate five million flip-flops simultaneously. It must execute the simulation line by line, block by block, in a sequential software loop.

```text
THE CONCURRENCY PARADOX IN HARDWARE SIMULATION

 Physical Silicon Hardware (100% Parallel):
 All 5,000,000 Flip-Flops Update SIMULTANEOUSLY at t = 10.00 ns!

 Single-Threaded Software Simulator (Sequential CPU):
 Executing Block 1 ──► Executing Block 2 ──► Executing Block 3 ...
 (Must evaluate parallel events one by one in software!)
```

This creates the **Concurrency Paradox of Hardware Simulation**:
* How can a single-threaded software program simulate millions of concurrent, parallel hardware events deterministically?
* If a simulator has five hundred procedural `always` blocks that all trigger on the exact same rising clock edge, which block does the simulator execute first?
* What happens if Block A reads a variable that Block B modifies on the same clock edge? If the simulator happens to run Block A before Block B, it gets one result. If it runs Block B before Block A, it gets a completely different result!

Without a strict, standardized execution ordering engine, hardware simulation becomes non-deterministic. The same SystemVerilog code would produce one set of outputs when compiled with Simulator Vendor X, and a completely different set of outputs when compiled with Simulator Vendor Y. Worse, adding a simple print statement (`$display`) to debug your code could change the internal execution order, making bugs magically appear or disappear!

To solve this concurrency paradox and guarantee that every compliant simulator produces **100% deterministic, identical hardware simulation results**, the IEEE 1800 SystemVerilog standard defines a precise execution engine: the **Stratified Event Queue Architecture**.

By dividing every simulation time step into strict, ordered **Scheduling Regions**—most notably the **Active Region** and the **Non-Blocking Assignment (NBA) Region**—the simulator engine orchestrates zero-delay hardware execution with total mathematical determinism.

---

## The Two-Stage Office Mailroom: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how the Stratified Event Queue orders time and events before diving into simulator specification details, let us step away from microchips and picture an office mailroom system.

Imagine an office building with four managers: Manager A, Manager B, Manager C, and Manager D. Each manager sits at a desk with an incoming mail tray and an outgoing mail tray. The managers communicate by writing memo letters to each other.

```text
THE OFFICE MAILROOM COMMUNICATION SYSTEM

 Manager A's Desk              Manager B's Desk
 ┌──────────────────────┐      ┌──────────────────────┐
 │ Incoming Mail Tray   │      │ Incoming Mail Tray   │
 ├──────────────────────┤      ├──────────────────────┤
 │ Outgoing Mail Tray   │      │ Outgoing Mail Tray   │
 └──────────────────────┘      └──────────────────────┘
```

Suppose the company president issues a rule: *"At 9:00 AM every morning ($CLK$), everyone must process their incoming mail and send their response memos to the other managers."*

Let us compare two different ways the office can run this morning mail routine:

---

### Unorganized Mail Routine (Simulation Race Conditions)

In the unorganized office, there is no mail carrier. As soon as Manager A writes a memo to Manager B, Manager A immediately runs down the hallway and drops the memo directly onto Manager B's desk at 9:01 AM.

Look at what happens to Manager B:
* Manager B is currently reading their morning mail. 
* Suddenly, Manager A drops a new memo onto Manager B's desk. 
* Manager B reads Manager A's new memo and uses it to write a response to Manager C.
* But Manager C already processed their mail at 9:00 AM and went out for coffee!

```text
UNORGANIZED MAIL ROUTINE: NON-DETERMINISTIC CHAOS

 9:01 AM: Manager A writes memo to Manager B ──► Drops on B's desk immediately!
 9:02 AM: Manager B reads A's NEW memo       ──► Writes memo to Manager C.
 9:03 AM: Manager C already finished!         ──► Manager C MISSED the update!

 Result: Information flow depends on WHO RAN DOWN THE HALLWAY FIRST!
```

Notice the disaster: The outcome of the morning mail depends entirely on **who ran down the hallway first**. If Manager C checked their desk before Manager B wrote the memo, Manager C missed the information. If Manager C checked their desk after, Manager C got the information. The system is non-deterministic and chaotic.

---

### The Stratified Mailroom Routine (The Stratified Event Queue)

To restore total order, the company hires an official Mail Carrier and enforces a **Two-Phase Stratified Mailroom Routine**:

```text
THE TWO-PHASE STRATIFIED MAILROOM ROUTINE

 Phase 1: The Drafting Phase (ACTIVE REGION)
 9:00 AM ──► Everyone sits at their desk.
             Everyone reads the mail in their INCOMING tray.
             Everyone writes their response memos and puts them in OUTGOING.
             CRITICAL RULE: NOBODY TOUCHES ANYONE ELSE'S DESK!

 Phase 2: The Mail Delivery Phase (NBA REGION)
 9:15 AM ──► The Mail Carrier walks through the office.
             Collects ALL letters from OUTGOING trays.
             Delivers ALL letters to INCOMING trays SIMULTANEOUSLY.

 Phase 3: The Reading Phase (OBSERVED / POSTPONED REGION)
 9:30 AM ──► Everyone opens their incoming tray to read the new, stable mail.
```

Let's trace Phase 1 and Phase 2 carefully:

1. **In Phase 1 (Active Region)**: Manager B reads the mail sitting in their incoming tray at 9:00 AM. Even if Manager A finishes writing a new memo for Manager B at 9:02 AM, Manager A **places it in their own outgoing tray**. Manager A does NOT deliver it to Manager B yet!
   * Manager B evaluates their decisions using the **OLD mail** that was present at 9:00 AM.
2. **In Phase 2 (NBA Region)**: The Mail Carrier flushes all outgoing trays simultaneously.
   * Manager B receives Manager A's new memo.
   * Manager C receives Manager B's new memo.

Did Manager B's new memo affect Manager C during Phase 1? **NO!** Because Manager B's new memo was held in the outgoing tray until Phase 2, Manager C evaluated their 9:00 AM decisions using Manager B's *previous* mail.

```text
STRATIFIED ROUTINE: 100% DETERMINISTIC EXECUTION

 All managers evaluate RHS using OLD incoming mail (Active Phase)
                                │
                                ▼
 Mail Carrier delivers ALL new memos simultaneously (NBA Phase)
                                │
                                ▼
 Everyone receives new mail for the NEXT time step!
 (Execution order no longer matters! Results are 100% identical!)
```

This two-phase mailroom routine is the exact mental model behind SystemVerilog's **Stratified Event Queue**:
* Reading incoming mail and drafting memos is the **Active Region** (RHS evaluation).
* The outgoing mail tray holding undelivered letters is the **Non-Blocking Assignment (NBA) Queue**.
* The Mail Carrier delivering all letters simultaneously is the **NBA Flush Region**.
* Reading stable mail at 9:30 AM is the **Postponed / Observed Region**.

---

## Mechanics of the IEEE 1800 Stratified Event Queue

Now that we possess the intuitive mental model of two-phase mail scheduling, we will examine the formal, rigorous engineering mechanics of the **IEEE 1800 SystemVerilog Stratified Event Queue**.

---

### Time Steps vs. Delta Cycles ($\delta$)

A SystemVerilog simulation progresses through two distinct dimensions of time:

1. **Simulation Time ($t$)**: Physical time tracked by the simulator in discrete units (e.g., $t = 0\text{ ns}, 10\text{ ns}, 20\text{ ns}$). Simulation time advances when delay statements like `#10` or clock period waits occur.
2. **Delta Cycles ($\delta$)**: Infinitesimal, zero-delay execution steps that occur **within a single simulation time instant $t$**.

```text
SIMULATION TIME VS DELTA CYCLES

 Physical Simulation Time t = 10.00 ns
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ Delta Cycle 0 (delta_0) ──► Delta Cycle 1 (delta_1) ──► Delta Cycle 2 ...│
 └───────────────────────────────────────────────────────────────────────────┘
  (All delta cycles occur at the EXACT SAME physical simulation time t = 10.00 ns!)
```

#### Why Delta Cycles ($\delta$) Are Mandatory for Hardware Simulation
In physical silicon, a combinational gate cascade (such as an AND gate feeding an OR gate feeding a Multiplexer) takes a few picoseconds of propagation delay. However, to speed up software simulation, hardware models often simulate combinational gates with **zero delay** (`#0`).

If an AND gate output changes at $t = 10.00\text{ ns}$, the connected OR gate must re-evaluate its output at $t = 10.00\text{ ns}$. 

The simulator uses **Delta Cycles ($\delta_0, \delta_1, \delta_2, \dots$)** to order these zero-delay combinational evaluations sequentially without advancing the main physical simulation clock $t$!

$$
t_{\text{effective}} = t + n \cdot \delta
$$

Where:
* $t_{\text{effective}}$ is the composite simulation time.
* $t$ is the current physical simulation time step (e.g., $10.00\text{ ns}$).
* $n$ is the current delta-cycle iteration count ($n \ge 0$).
* $\delta$ is an infinitesimal time increment ($0\text{ ns}$).

---

### The Major Scheduling Regions of the Stratified Event Queue

Within every single delta cycle ($\delta$), the SystemVerilog simulator processes events through a series of ordered **Scheduling Regions**.

The IEEE 1800 standard divides the event queue into five primary region sets:

```text
IEEE 1800 STRATIFIED EVENT QUEUE REGION FLOWCHART

               ┌─────────────────────────────────────────┐
               │ 1. PREPONED REGION                      │
               │    * Sample stable values for SVAs      │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │ 2. ACTIVE REGION SET                    │
               │    * Active Region (Evaluate =, <= RHS) │
               │    * Inactive Region (Process #0)       │
               │    * NBA Region (Flush <= LHS updates)  │
               └────────────────────┬────────────────────┘
                                    │ (Events re-triggered? Loop back to Active!)
                                    ▼
               ┌─────────────────────────────────────────┐
               │ 3. OBSERVED REGION                      │
               │    * Evaluate Concurrent Assertions(SVA)│
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │ 4. REACTIVE REGION SET                  │
               │    * Reactive Region (Testbench code)   │
               │    * Re-NBA Region (Testbench <= LHS)   │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │ 5. POSTPONED REGION                     │
               │    * Execute $strobe, $monitor, VCD logs│
               └─────────────────────────────────────────┘
```

Let us dissect each major region set in deep technical detail:

---

### 1. The Preponed Region
The **Preponed Region** executes at the very beginning of a time step, before any signal changes or events occur in the current time step $t$.

* **Purpose**: To sample and snapshot the steady-state values of all signals at the end of the previous time step.
* **Primary Client**: SystemVerilog Concurrent Assertions (SVA). Assertions read preponed values to evaluate property checks (`assert property`) against stable data, preventing false assertion triggers caused by transient signal switching within the current time step.

---

### 2. The Active Region Set (RTL Design Core)

The **Active Region Set** is where 99% of synthesizable RTL hardware logic is evaluated and updated. It contains three sub-regions that execute in strict sequence:

```text
THE ACTIVE REGION SET SUB-REGIONS

 Active Region ──► Inactive Region ──► NBA Region
 (Eval =, <= RHS)   (Process #0)       (Update <= LHS)
       ▲                                      │
       └─────── (Loop back if NBA triggers) ──┘
```

#### A. The Active Region
* **Evaluates**:
  * Blocking assignments (`=`) inside procedural blocks (`always_comb`, `always_ff`).
  * Right-Hand Side (RHS) expressions of non-blocking assignments (`<=`).
  * Continuous assignments (`assign`).
  * System tasks like `$display` and `$write`.
* **Updates**:
  * Left-Hand Side (LHS) variables of blocking assignments (`=`) **immediately**.
* **Behavior**: If a blocking assignment updates variable `x`, any process waiting on `x` is immediately triggered and added to the Active Region for evaluation.

#### B. The Inactive Region
* **Evaluates**: Events delayed by explicit zero-delay controls (`#0`).
* **Engineering Guidance**: **NEVER USE `#0` IN RTL DESIGN.** Using `#0` forces the simulator to defer event processing into the Inactive region, introducing artificial execution delays that mask design bugs and create non-deterministic simulation-synthesis mismatches.

#### C. The Non-Blocking Assignment (NBA) Region
* **Evaluates**: **Flushes the NBA Queue!**
* **Updates**:
  * Left-Hand Side (LHS) variables of non-blocking assignments (`<=`).
* **Loopback Trigger**: If an NBA variable update in this region causes a clock or signal edge that triggers another procedural block, **the simulator loops back to the Active Region** to evaluate the newly triggered blocks!

---

### 3. The Observed Region
The **Observed Region** executes after the Active, Inactive, and NBA regions have completely settled for the current time step.

* **Purpose**: To evaluate SystemVerilog Concurrent Assertions (`assert property`).
* **Behavior**: By evaluating assertions in the Observed region, SVA properties read stable, fully updated signal values after all non-blocking assignments (`<=`) in the NBA region have finished updating.

---

### 4. The Reactive Region Set (Testbench Verification Core)
The **Reactive Region Set** is designed specifically to execute non-synthesizable testbench code (SystemVerilog `program` blocks and verification drivers).

* **Purpose**: To isolate testbench stimulus generation from RTL hardware execution.
* **Behavior**: Testbenches running in the Reactive region observe stable RTL signals generated in the Active/NBA regions, preventing race conditions between testbench drivers and RTL DUT (Device Under Test) signals.

---

### 5. The Postponed Region
The **Postponed Region** is the final region executed at the very end of a simulation time step, after all delta-cycle activity for time $t$ has completely ceased.

* **Purpose**: To perform read-only logging and waveform dumping.
* **Clients**: System tasks `$strobe`, `$monitor`, and VCD/FSDB waveform dumping engines.
* **Inviolable Guarantee**: No signal value can be modified in the Postponed region. Reading a signal in Postponed guarantees reading the final, stable, settled value for time step $t$.

---

## Detailed Event-Driven Trace: Active vs. NBA Queue Execution

To see how the Stratified Event Queue guarantees deterministic simulation, let us trace a 2-stage pipeline register across a single clock edge transition.

Consider two cascaded flip-flops (`q1` and `q2`) written correctly using non-blocking assignments (`<=`):

```systemverilog
always_ff @(posedge clk) begin
    q1 <= d;  // Non-blocking assignment 1
    q2 <= q1; // Non-blocking assignment 2
end
```

Initial State at $t = 10.00\text{ ns}$ before the clock edge:
* $d = 1$, $q1 = 0$, $q2 = 0$.

At $t = 10.00\text{ ns}$, the rising clock edge `posedge clk` fires. Let us trace the simulator's internal event queue step by step:

```text
EVENT QUEUE TRACE FOR 2-STAGE PIPELINE REGISTER

 Time t = 10.00 ns (Delta Cycle 0)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ 1. ACTIVE REGION:                                                         │
 │    * Block triggered by 'posedge clk'.                                   │
 │    * Line 1 Evaluated: RHS 'd' = 1.                                       │
 │      Schedule (q1 <= 1) in NBA Queue. DO NOT UPDATE q1 YET!               │
 │    * Line 2 Evaluated: RHS 'q1' = 0 (OLD VALUE!).                         │
 │      Schedule (q2 <= 0) in NBA Queue. DO NOT UPDATE q2 YET!               │
 ├───────────────────────────────────────────────────────────────────────────┤
 │ 2. INACTIVE REGION:                                                       │
 │    * Empty (No #0 events).                                                │
 ├───────────────────────────────────────────────────────────────────────────┤
 │ 3. NBA REGION (FLUSH QUEUE!):                                             │
 │    * Update q1 = 1.                                                       │
 │    * Update q2 = 0 (Received OLD q1 value = 0!).                          │
 ├───────────────────────────────────────────────────────────────────────────┤
 │ 4. POSTPONED REGION:                                                      │
 │    * $strobe prints: q1 = 1, q2 = 0.                                      │
 └───────────────────────────────────────────────────────────────────────────┘
```

Look at what happened in the Active Region:
* When Line 2 `q2 <= q1` evaluated its RHS, **`q1` was still 0** because `q1 <= 1` was held in the NBA queue!
* Both `q1` and `q2` received their scheduled updates simultaneously when the simulator entered the NBA region.

This two-stage scheduling guarantees that `q2` receives the value `q1` held *before* the clock edge, matching physical silicon hardware with 100% mathematical precision!

---

## Engineering Reality: Race Conditions, `$display` vs. `$strobe`, and Oscillation Loops

While the Stratified Event Queue provides a deterministic framework, improper HDL coding practices can bypass these safeguards, introducing simulation race conditions and simulator crashes.

### 1. The Active Region Race: `$display` vs. Non-Blocking Assignments

A very common source of confusion for engineers is using `$display` to debug sequential flip-flop variables inside an `always_ff` block:

```systemverilog
// CONFUSING DEBUG PRINT IN SEQUENTIAL BLOCK
always_ff @(posedge clk) begin
    q1 <= d;
    $display("Time %0t: q1 = %b", $time, q1); // WHAT WILL THIS PRINT?
end
```

#### What Value Will `$display` Print?

Let's trace the event queue regions:
1. Both `q1 <= d` and `$display` execute in the **Active Region**.
2. In the Active Region, `q1 <= d` evaluates RHS `d` and schedules the update for the **NBA Region**.
3. Variable `q1` has **NOT been updated yet** in the Active Region!
4. `$display` executes in the Active Region and prints the **OLD value of `q1`** (the value before the clock edge!).

```text
$DISPLAY VS $STROBE EXECUTION REGIONS

 Active Region : $display executes HERE! ──► Prints OLD q1 value!
                 q1 <= d scheduled in NBA.

 NBA Region    : q1 updates to new 'd' value!

 Postponed Reg : $strobe executes HERE!  ──► Prints NEW q1 value!
```

#### The Hardware Solution: Use `$strobe` for Sequential Debugging
If you want to print the newly updated value of a sequential variable after the clock edge, use **`$strobe`** instead of `$display`:

```systemverilog
always_ff @(posedge clk) begin
    q1 <= d;
    $strobe("Time %0t: Stable q1 = %b", $time, q1); // Prints NEW stable q1!
end
```

Because `$strobe` executes in the **Postponed Region** (after the NBA region has flushed), it is guaranteed to print the final, stable, updated value of `q1`!

---

### 2. The Zero-Delay Combinational Oscillation Loop (Delta-Cycle Crash)

What happens if an engineer accidentally writes a combinational logic block with an un-clocked feedback loop?

```systemverilog
// COMBINATIONAL OSCILLATION LOOP HAZARD
logic a, b;

always_comb begin
    a = ~b; // Inverter 1
end

always_comb begin
    b = a;  // Wire feedback
end
```

#### How the Simulator Crashes in a Delta-Cycle Loop:

Trace the simulator event queue at time $t = 10.00\text{ ns}$:
1. **Delta 0 ($\delta_0$)**: `a` changes $0 \to 1$ in Active Region.
2. This triggers Block 2: `b` changes $0 \to 1$ in Active Region.
3. This triggers Block 1: `a` changes $1 \to 0$ in Delta 1 ($\delta_1$).
4. This triggers Block 2: `b` changes $1 \to 0$ in Delta 1 ($\delta_1$).
5. The simulator loops endlessly between Active and Delta regions: $\delta_0, \delta_1, \delta_2, \dots, \delta_{10000}$ **without ever advancing physical simulation time $t$!**

```text
ZERO-DELAY DELTA-CYCLE OSCILLATION LOOP

 Delta 0: a = 1 ──► Triggers Block 2 ──► b = 1
                      │
                      ▼ (Triggers Block 1 in Delta 1!)
 Delta 1: a = 0 ──► Triggers Block 2 ──► b = 0
                      │
                      ▼ (Triggers Block 1 in Delta 2!)
 Delta 2: a = 1 ──► Infinite loop at SAME simulation time t!
```

After 10,000 delta iterations at time $t = 10.00\text{ ns}$, the simulator halts with a fatal crash error:
`Fatal Error: Infinite delta-cycle loop detected at time 10.00 ns. Exceeded max delta count limit (10000).`

**Engineering Rule**: Always ensure combinational logic paths are acyclic (no un-clocked feedback loops).

---

## Solved Industrial Engineering Exercise: Event Queue Trace of a 3-Stage Pipeline with Status Flag Monitor

To consolidate your complete mastery of the Stratified Event Queue, scheduling regions, delta cycles, Active versus NBA updates, and `$strobe` printing, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit design team is verifying the execution pipeline of an avionics flight data processor.

The circuit contains:
1. A **2-Stage Register Pipeline** (`q1` and `q2`) driven by clock `clk`.
2. A **Combinational Status Flag** (`flag_match`) that evaluates whether `q1 == q2`.
3. A **Testbench Monitoring Unit** that logs values using both `$display` and `$strobe`.

```text
AVIONICS PIPELINE WITH COMBINATIONAL STATUS MONITOR

 Data Input d ──► [ FF 1 (q1) ] ──► [ FF 2 (q2) ] ──► Output
                        │                │
                        └───────┬────────┘
                                ▼
                    [ Comparator (q1 == q2) ] ──► Status flag_match
```

#### System Code:

```systemverilog
`default_nettype none

module PipelineMonitor (
    input  logic       clk,
    input  logic [7:0] d,
    output logic [7:0] q1,
    output logic [7:0] q2,
    output logic       flag_match
);

    // 1. Sequential 2-Stage Pipeline (Non-Blocking)
    always_ff @(posedge clk) begin
        q1 <= d;
        q2 <= q1;
    end

    // 2. Combinational Status Flag (Blocking / Continuous)
    always_comb begin
        flag_match = (q1 == q2);
    end

endmodule
```

#### Initial Conditions at Time $t = 20.00\text{ ns}$ (Delta 0, Before Clock Edge):
* `d = 8'hA5` ($165_{10}$)
* `q1 = 8'h00` ($0_{10}$)
* `q2 = 8'h00` ($0_{10}$)
* `flag_match = 1'b1` (since $00 == 00$)

#### Test Event:
At time $t = 20.00\text{ ns}$, a rising clock edge `posedge clk` arrives.

#### Your Objective

1. Trace the exact event queue region progression (Active, Inactive, NBA, Observed, Postponed) and delta-cycle iterations ($\delta_0, \delta_1, \dots$) for time step $t = 20.00\text{ ns}$.
2. Determine the exact value printed by `$display` executing in the Active region during the clock edge.
3. Determine the exact value printed by `$strobe` executing in the Postponed region.
4. Calculate the final stable values of `q1`, `q2`, and `flag_match` at the end of time step $t = 20.00\text{ ns}$.
5. Verify mathematical and structural correctness.

---

### Step-by-Step Derivation

#### Step 1: Trace Delta Cycle 0 ($\delta_0$) — Active Region Phase

Rising clock edge `posedge clk` arrives at time $t = 20.00\text{ ns}$.

The simulator enters **Time $t = 20.00\text{ ns}$, Delta Cycle 0 ($\delta_0$)**:

##### 1. Active Region Processing:
* The `always_ff @(posedge clk)` block is triggered.
* **Line 1 (`q1 <= d`) Evaluates**:
  * Reads current $d = \text{8'hA5}$.
  * Schedules update `q1 <= 8'hA5` in the **NBA Queue**.
  * `q1` is NOT updated yet! (`q1` remains `8'h00`).
* **Line 2 (`q2 <= q1`) Evaluates**:
  * Reads current $q1 = \text{8'h00}$ (**OLD VALUE!**).
  * Schedules update `q2 <= 8'h00` in the **NBA Queue**.
  * `q2` is NOT updated yet!
* **Testbench `$display` Execution**:
  * If a `$display("q1=%h", q1)` executes in the Active region, it reads the UN-UPDATED value of `q1`.
  * **`$display` prints: `q1 = 00`**.

##### 2. Inactive Region Processing:
* Empty (no `#0` events).

---

#### Step 2: Trace Delta Cycle 0 ($\delta_0$) — NBA Region Phase

The simulator enters the **NBA Region** at time $t = 20.00\text{ ns}$ ($\delta_0$):

##### NBA Queue Flush:
* The simulator applies all scheduled non-blocking updates simultaneously:
  1. `q1` updates to **`8'hA5`**.
  2. `q2` updates to **`8'h00`**.

```text
NBA REGION FLUSH AT DELTA 0

 Scheduled NBA Updates Executed:
   q1: 8'h00 ──► 8'hA5  (UPDATED!)
   q2: 8'h00 ──► 8'h00  (UNCHANGED)
```

Notice what happened: Signal `q1` changed value from `8'h00` to `8'hA5`!

Because `q1` changed value, the combinational block `always_comb` (which depends on `q1`) is **triggered for a new delta cycle!**

The simulator loops back to the Active Region for **Delta Cycle 1 ($\delta_1$)**!

---

#### Step 3: Trace Delta Cycle 1 ($\delta_1$) — Re-Triggered Active Phase

The simulator enters **Time $t = 20.00\text{ ns}$, Delta Cycle 1 ($\delta_1$)**:

##### 1. Active Region Processing:
* The `always_comb` block executes:
  `flag_match = (q1 == q2);`
* Reads updated $q1 = \text{8'hA5}$ and $q2 = \text{8'h00}$.
* Evaluates $(\text{8'hA5} == \text{8'h00}) \implies \text{FALSE } (\text{1'b0})$.
* `flag_match` updates immediately to **`1'b0`**.

##### 2. NBA Region Processing:
* Empty (no new non-blocking assignments scheduled).
* No further signals changed state. Delta cycle iterations end for $t = 20.00\text{ ns}$!

---

#### Step 4: Trace Postponed Region Phase

The simulator enters the **Postponed Region** at the end of time step $t = 20.00\text{ ns}$:

##### `$strobe` Execution:
* System task `$strobe("Stable q1=%h, q2=%h, match=%b", q1, q2, flag_match)` executes.
* Reads final, fully-settled signal values:
  * $q1 = \text{8'hA5}$
  * $q2 = \text{8'h00}$
  * $flag\_match = \text{1'b0}$
* **`$strobe` prints: `Stable q1 = A5, q2 = 00, match = 0`**.

```text
COMPLETE EVENT QUEUE CHRONOLOGY SUMMARY

 Delta 0 Active Region   ──► $display prints OLD q1 = 00. Schedules NBA updates.
 Delta 0 NBA Region      ──► q1 updates to 8'hA5. Triggers always_comb!
 Delta 1 Active Region   ──► always_comb evaluates (8'hA5 == 8'h00). flag_match = 0.
 Postponed Region        ──► $strobe prints FINAL STABLE VALUES: q1=A5, q2=00, match=0.
```

---

#### Step 5: Verification of Results

Let's review our complete simulation audit:

1. **`$display` vs `$strobe` Print Comparison**:
   * `$display` printed `q1 = 00` (read in Active region before NBA flush).
   * `$strobe` printed `q1 = A5` (read in Postponed region after NBA flush).
   * **Verification**: Demonstrates why `$strobe` is mandatory for logging stable sequential state updates.

2. **Final Settled Output Vector at $t = 20.00\text{ ns}$**:
   * `q1` = `8'hA5` ($165_{10}$)
   * `q2` = `8'h00` ($0_{10}$)
   * `flag_match` = `1'b0` (since $165 \neq 0$)

3. **Pipeline Behavior Check**:
   * Data $8\text{'hA5}$ moved into Stage 1 (`q1`).
   * Stage 2 (`q2`) retained its previous value ($8\text{'h00}$).
   * Status flag correctly reported non-matching pipeline stages.

All event queue regions, delta cycles, and signal values evaluate with 100% mathematical, physical, and logical precision. The `PipelineMonitor` event trace is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Stratified Event Queue**: The standardized IEEE 1800 simulation execution engine that divides every simulation time step into discrete, ordered scheduling regions (Preponed, Active, Inactive, NBA, Observed, Reactive, Postponed) to simulate parallel physical hardware on single-threaded CPUs with total mathematical determinism.
* **Active vs. NBA Scheduling Regions**: The fundamental two-phase execution duality where Right-Hand Side (RHS) expressions are evaluated during the Active Region and Left-Hand Side (LHS) non-blocking assignments (`<=`) are updated during the NBA Region, ensuring all flip-flops sample pre-clock input states before any output changes state.
