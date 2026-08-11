---
title: "SystemVerilog Assertions (SVA) Architecture and Concurrent Property Evaluation Mechanics"
---

# SystemVerilog Assertions (SVA) Architecture and Concurrent Property Evaluation Mechanics

## The Verbosity and Isolation Failure of Procedural Protocol Checking

When a digital hardware verification team checks a complex multi-cycle bus protocol—such as verifying that an AXI memory request (`valid`) is followed by an acknowledge (`ready`) within four clock cycles, or ensuring that a FIFO buffer never experiences a write request while full—they encounter a severe code maintenance barrier if they attempt to write these checks using procedural testbench code (`if-else` blocks inside `always @(posedge clk)`).

Procedural code is fundamentally imperative: it describes *how* to step through execution line by line. To check a multi-cycle hardware protocol rule using procedural code, a verification engineer must manually build state machines, track integer cycle counters, and write complex flag management loops:

```text
THE PROCEDURAL PROTOCOL CHECKING SPAGHETTI

 Procedural Testbench Code (Imperative Spaghetti):
 always @(posedge clk) begin
   if (req && !tracking) begin
     tracking <= 1; timer <= 0;
   end else if (tracking) begin
     timer <= timer + 1;
     if (ack) begin tracking <= 0; end
     else if (timer == 4) begin $error("Timeout!"); end
   end
 end
 (Bloated, hard to audit, prone to state tracking bugs!)
```

Look at this procedural check: To enforce a simple two-line protocol rule ("Acknowledge must follow Request within 4 cycles"), the engineer was forced to write ten lines of procedural state-tracking code.

When a complex System-on-Chip (SoC) protocol contains 50 distinct multi-cycle rules, writing procedural checkers produces thousands of lines of bloated, hard-to-read code.

Even worse, procedural testbench checkers suffer from two critical architectural isolation failures:

1. **Failure to Check Internal Sub-Module Boundaries**: Procedural checkers written inside top-level testbenches can only observe top-level external chip pins. They cannot inspect signals deep inside internal sub-modules. If a protocol error occurs at an internal sub-module boundary 500 clock cycles before an external pin changes, the top-level procedural checker misses the root cause entirely.
2. **Event Queue Sampling Races**: Procedural checks written inside `always @(posedge clk)` blocks evaluate in the Active region of the simulator event queue. If a testbench check reads a signal at the exact same clock edge that an internal RTL module updates it, the procedural check may read the old value or the new value depending on arbitrary simulator scheduling order, generating false error alarms.

To specify multi-cycle hardware rules declaratively directly at the silicon module boundary, SystemVerilog provides a dedicated verification language extension: **SystemVerilog Assertions (SVA)**.

By replacing imperative procedural loops with declarative **Concurrent Sequences** (`sequence`) and **Property Checks** (`property`), SVA allows engineers to specify complex multi-cycle protocol invariants in a single, highly readable line of code.

---

## The Automated Speed Trap Camera: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how SystemVerilog Assertions evaluate multi-cycle protocol rules concurrently without interfering with hardware execution, let us picture a high-speed traffic enforcement system on a highway bridge.

Imagine a 1-kilometer bridge where the highway department enforces a strict traffic safety rule:

$$\text{"Any car that passes Marker A must pass Marker B within 30 seconds without stopping."}$$

```text
THE HIGHWAY TRAFFIC ENFORCEMENT PROBLEM

 Marker A (Start Line) ────────── 1 Kilometer ──────────► Marker B (Finish Line)
```

Let us compare two different ways the highway department can enforce this rule:

### Approach A: The Police Officer on a Motorcycle (Procedural Checking)
The department hires a police officer on a motorcycle. The officer sits at Marker A.
* When a blue sedan passes Marker A, the officer starts a handheld stopwatch, hops on the motorcycle, and chases the blue sedan down the bridge, checking the time at 10 seconds, 20 seconds, and 30 seconds.
* **The Problem**: What happens if three more cars pass Marker A while the officer is chasing the blue sedan? The officer cannot chase four cars simultaneously! The officer misses the other three cars entirely. 

To track multiple cars concurrently, the police department would need to hire 50 officers on 50 motorcycles, leading to high costs, clogged traffic, and human errors.

This motorcycle chase is the exact physical analogue of **Procedural Protocol Checking**.

---

### Approach B: The Automated Radar Speed Camera (Concurrent SVA)

The highway department replaces the motorcycle officer with an **Automated Radar Camera Network (SVA)**:

```text
THE AUTOMATED CAMERA NETWORK (CONCURRENT SVA)

 Marker A Camera (Trigger Sensor)              Marker B Camera (Target Sensor)
 ┌──────────────────────────────┐              ┌──────────────────────────────┐
 │ Detects Car at Marker A      ├─────────────►│ Checks Arrival within 30s    │
 └──────────────────────────────┘              └──────────────────────────────┘
  (Spawns a parallel thread for                 (Evaluates Property Check!)
   EVERY car that crosses Marker A!)
```

Look at how the automated camera system operates:
1. **Parallel Thread Spawning**: The camera at Marker A does not chase cars. The instant a car crosses Marker A, the camera system spawns a lightweight, independent digital tracking thread for *that specific car*.
2. **Concurrent Monitoring**: If 100 cars cross Marker A within five seconds, the system manages 100 parallel tracking threads simultaneously in software.
3. **Declarative Rule Enforcement**: Each thread monitors its assigned car:
   * If the car reaches Marker B within 30 seconds, the thread completes silently (`PASS`).
   * If 30 seconds expire and the car has not reached Marker B, the camera snaps a photo and issues an error ticket (`FAIL / $error`)!

Notice what the automated camera system achieved:
* **Zero Performance Overhead**: The cameras do not slow down the traffic on the bridge.
* **Multi-Threaded Parallel Evaluation**: It tracks 100 cars simultaneously with 100% mathematical precision.
* **Declarative Specification**: The engineer did not write code to chase cars; they simply declared the rule: `Car_at_A |=> ##[1:30] Car_at_B`.

This automated camera system is the exact physical analogue of **SystemVerilog Assertions (SVA)**:
* Passing Marker A is the **Antecedent Trigger Condition**.
* Arriving at Marker B within 30 seconds is the **Consequent Expectation**.
* The camera system spawning parallel threads is **Concurrent SVA Property Evaluation**.

---

## Mechanics of SystemVerilog Assertions (SVA)

To master assertion-based verification, we must dissect the formal mechanics of the two types of assertions and the SVA execution pipeline:
1. **Immediate Assertions (`assert`)**: Procedural checks evaluated synchronously inside execution blocks.
2. **Concurrent Assertions (`assert property`)**: Multi-cycle temporal checkers evaluated across clock steps in the Preponed and Observed event queue regions.

---

### Primitive 1: Immediate Assertions vs. Concurrent Assertions

SystemVerilog supports two fundamental classes of assertions:

```text
IMMEDIATE VERSUS CONCURRENT ASSERTIONS

 Immediate Assertion (assert)            Concurrent Assertion (assert property)
 ┌───────────────────────────┐           ┌───────────────────────────┐
 │ * Evaluated in Active     │           │ * Evaluated in Observed   │
 │   region inside always    │           │   region across clock     │
 │   procedural blocks.      │           │   edges (@posedge clk).   │
 │ * Single-cycle boolean    │           │ * Multi-cycle temporal    │
 │   check (No ## delays).   │           │   sequences (uses ##).    │
 └───────────────────────────┘           └───────────────────────────┘
```

#### 1. Immediate Assertions (`assert (expression)`)
An **Immediate Assertion** is a procedural statement executed inline within an `always_comb` or `always_ff` block. It behaves like a simple conditional check (`if (!expression) $error()`).

```systemverilog
// IMMEDIATE ASSERTION EXAMPLE
always_comb begin
    if (enable_write) begin
        // Immediate check: Address must not be out of bounds RIGHT NOW
        assert (address < 16'h8000) else $error("[IMMEDIATE FAIL] Address Out of Bounds!");
    end
end
```

##### Physical Limitation of Immediate Assertions:
Immediate assertions evaluate in the **Active Region** of the simulator event queue. If signals are currently toggling during combinational evaluation in the current time step, an immediate assertion may evaluate during a transient glitch, firing a **false error alarm** before signals have settled.

---

#### 2. Concurrent Assertions (`assert property (...)`)
A **Concurrent Assertion** is a declarative temporal statement that evaluates multi-cycle properties across specified clock edges (`@(posedge clk)`).

```systemverilog
// CONCURRENT ASSERTION EXAMPLE
// Rule: Whenever 'req' is asserted High, 'ack' MUST be High 1 cycle later!
assert property (@(posedge clk) req |=> ack) 
    else $error("[CONCURRENT FAIL] Request not acknowledged on next cycle!");
```

##### Why Concurrent Assertions Are Glitch-Free:
Concurrent assertions do NOT sample signals in the Active region. Instead, they use a two-phase event queue mechanism:

1. **Preponed Region Sampling**: On the active clock edge, the SVA engine samples the values of all target signals in the **Preponed Region** (at the very beginning of the time step, *before* any clock edge updates occur). This guarantees reading stable, pre-clock signal values.
2. **Observed Region Evaluation**: The SVA engine evaluates the property check in the **Observed Region** (after all Active and NBA region signal updates have completely settled for the time step).

```text
CONCURRENT SVA EVENT QUEUE TIMING PIPELINE

 Time Step t (Clock Edge):
 1. Preponed Region ──► SNAPSHOT STABLE SIGNALS (req, ack) BEFORE CLOCK EDGE!
                        (Guarantees zero-glitch inputs)
                             │
                             ▼
 2. Active & NBA    ──► RTL Logic Executes & Updates
                             │
                             ▼
 3. Observed Region ──► EVALUATE CONCURRENT ASSERTION PROPERTY!
                        (Checks if req_preponed |=> ack_stable)
```

Because of Preponed region sampling and Observed region evaluation, **Concurrent Assertions are 100% immune to combinational glitches and simulator execution races!**

---

### Primitive 2: SVA Sequences (`sequence`) and Delay Operators (`##`)

A **Sequence** is a multi-cycle linear temporal pattern built from Boolean expressions and clock delay operators.

A sequence is declared using the `sequence` and `endsequence` keywords:

```systemverilog
// DECLARING AN SVA SEQUENCE
sequence s_req_then_ack;
    req ##1 ack; // 'req' is True on Cycle k, AND 'ack' is True on Cycle k+1
endsequence
```

#### 1. The Cycle Delay Operator (`##N` and `##[min:max]`)

The cycle delay operator `##` specifies how many active clock cycles must elapse between events:

* **Fixed Delay (`##N`)**: `a ##2 b` means signal `a` is true on cycle $k$, and signal `b` MUST be true on cycle $k+2$.
* **Range Delay (`##[min:max]`)**: `a ##[1:4] b` means signal `a` is true on cycle $k$, and signal `b` MUST become true on some cycle between $k+1$ and $k+4$.
* **Unbounded Delay (`##[1:$]`)**: `a ##[1:$] b` means signal `a` is true on cycle $k$, and signal `b` MUST eventually become true on some future clock cycle (eventual completion).

```text
SVA CYCLE DELAY OPERATOR TIMING PATTERNS

 Sequence: a ##2 b
 Cycle k   : Signal 'a' = 1
 Cycle k+1 : Any signal state
 Cycle k+2 : Signal 'b' MUST = 1 (PASS!)

 Sequence: a ##[1:3] b
 Cycle k   : Signal 'a' = 1
 Cycle k+1..k+3 : Signal 'b' becomes 1 on ANY of these cycles (PASS!)
```

---

#### 2. SVA Repetition Operators (`[*N]`, `[=N]`, `[->N]`)

When a signal must hold true for multiple consecutive cycles, SystemVerilog provides **Repetition Operators**:

##### A. Consecutive Repetition (`a [*N]` or `a [*min:max]`)
Signal `a` must hold true for $N$ consecutive clock cycles without interruption:

```systemverilog
// 'req' must stay High for 3 consecutive clock cycles, followed by 'ack'
sequence s_burst;
    req [*3] ##1 ack; // Equivalent to: req ##1 req ##1 req ##1 ack
endsequence
```

##### B. Non-Consecutive Repetition (`a [=N]`)
Signal `a` must evaluate true $N$ times, but those occurrences do NOT need to be on consecutive clock cycles:

```systemverilog
// Signal 'valid' must occur 2 times before 'done' arrives
sequence s_non_consecutive;
    valid [=2] ##1 done;
endsequence
```

---

### Primitive 3: SVA Properties (`property`) and Implication Operators (`|->` vs `|=>`)

A **Property** is a higher-level verification rule that combines sequences with conditional trigger logic using **Implication Operators**.

A property is declared using the `property` and `endproperty` keywords:

```systemverilog
// DECLARING AN SVA PROPERTY
property p_req_ack_protocol;
    @(posedge clk) req |=> ack;
endproperty

// Asserting the property
assert property (p_req_ack_protocol);
```

An implication statement consists of two parts:

$$\text{Antecedent (Trigger)} \quad \Longrightarrow \quad \text{Consequent (Expectation)}$$

* **Antecedent**: The trigger condition on the left side of the implication operator.
* **Consequent**: The required outcome on the right side that MUST evaluate true if the antecedent matched.

SystemVerilog provides two distinct implication operators: **Overlapping Implication (`|->`)** and **Non-Overlapping Implication (`|=>`)**.

---

#### 1. Overlapping Implication (`|->`)

In **Overlapping Implication (`|->`)**, if the antecedent matches on clock cycle $k$, the consequent MUST begin evaluating on the **EXACT SAME clock cycle $k$**:

$$
\text{antecedent} \quad |\to \quad \text{consequent}
$$

```systemverilog
// OVERLAPPING IMPLICATION (|->)
// "IF 'enable' is High on cycle k, THEN 'select' MUST be High on cycle k!"
property p_overlapping;
    @(posedge clk) enable |-> select;
endproperty
```

```text
OVERLAPPING IMPLICATION (|->) TIMING ALIGNMENT

 Cycle k :  enable = 1 (Antecedent Match!)
            │
            ▼
 Cycle k :  select MUST = 1 ON SAME CYCLE k! (Overlapping Evaluation)
```

---

#### 2. Non-Overlapping Implication (`|=>`)

In **Non-Overlapping Implication (`|=>`)**, if the antecedent matches on clock cycle $k$, the consequent MUST begin evaluating on the **NEXT clock cycle $k+1$**:

$$
\text{antecedent} \quad |\Rightarrow \quad \text{consequent} \quad \equiv \quad \text{antecedent} \quad |\to \quad \#\#1 \quad \text{consequent}
$$

```systemverilog
// NON-OVERLAPPING IMPLICATION (|=>)
// "IF 'req' is High on cycle k, THEN 'ack' MUST be High on cycle k+1!"
property p_non_overlapping;
    @(posedge clk) req |=> ack;
endproperty
```

```text
NON-OVERLAPPING IMPLICATION (|=>) TIMING ALIGNMENT

 Cycle k   :  req = 1 (Antecedent Match!)
              │
              ▼
 Cycle k+1 :  ack MUST = 1 ON NEXT CYCLE k+1! (Non-Overlapping Evaluation)
```

```text
IMPLICATION OPERATOR COMPARISON MATRIX

 Operator Name                │ Symbol │ Equivalent Sequence Form │ Consequent Start Cycle
──────────────────────────────┼────────┼──────────────────────────┼────────────────────────
 Overlapping Implication      │  |->   │ A |-> B                  │ Cycle k (Same Cycle)
 Non-Overlapping Implication  │  |=>   │ A |-> ##1 B              │ Cycle k+1 (Next Cycle)
```

---

## The Vacuous Success Hazard and SVA Coverage (`cover property`)

A major real-world pitfall in assertion-based verification is the **Vacuous Success Hazard** (also called the False Pass Trap).

To understand how an assertion can produce a "Vacuous Success," examine how mathematical implication works:

$$\text{Antecedent } A \implies \text{Consequent } B$$

In formal mathematical logic, an implication statement $A \implies B$ evaluates to **TRUE** if $A$ is FALSE, regardless of whether $B$ is true or false!

Now, consider what happens when you run a simulation with this assertion:

```systemverilog
// VACUOUS SUCCESS HAZARD EXAMPLE
property p_interrupt_check;
    @(posedge clk) irq_trigger |=> ##2 handle_ack;
endproperty

assert property (p_interrupt_check);
```

Suppose that during a 100,000-cycle simulation run, a bug in your testbench causes `irq_trigger` to stay Low ($0$) for the entire simulation.

* On cycle 1: `irq_trigger = 0` (Antecedent False) $\implies$ Implication passes **VACUOUSLY**!
* On cycle 2: `irq_trigger = 0` (Antecedent False) $\implies$ Implication passes **VACUOUSLY**!
* ...
* On cycle 100,000: `irq_trigger = 0` $\implies$ Implication passes **VACUOUSLY**!

The simulator prints a summary report: `p_interrupt_check: 100,000 PASSED, 0 FAILED`.

The verification engineer looks at the report, sees 100,000 passes, and assumes the interrupt handler works perfectly! In reality, **`irq_trigger` was never tested even once during the entire simulation!**

```text
THE VACUOUS SUCCESS HAZARD

 Assertion: irq_trigger |=> ##2 handle_ack
 Input: irq_trigger stays 0 for 100,000 cycles!
                       │
                       ▼
 Simulator Result: 100,000 PASSED! (0 Failed)
                   (FALSE CONFIDENCE! Antecedent NEVER fired!)
```

---

### How to Detect Vacuous Successes: `cover property`

To prevent vacuous successes from creating false confidence, every concurrent assertion MUST be paired with a SystemVerilog **Coverage Directive (`cover property`)**:

* **`assert property (p_rule)`**: Enforces that the rule is never violated.
* **`cover property (p_rule)`**: Measures whether the antecedent trigger condition actually occurred during simulation!

```systemverilog
// PAIRING ASSERTION WITH COVERAGE DIRECTIVE
property p_interrupt_check;
    @(posedge clk) irq_trigger |=> ##2 handle_ack;
endproperty

// Enforce rule non-violation
A_INTERRUPT_CHECK: assert property (p_interrupt_check)
    else $error("[SVA FAIL] Interrupt acknowledged incorrectly!");

// Measure whether the trigger actually fired in simulation!
C_INTERRUPT_TRIGGER: cover property (p_interrupt_check);
```

When you view the final coverage report:
* If `A_INTERRUPT_CHECK` has 0 failures, BUT `C_INTERRUPT_TRIGGER` shows **0 hits**, the verification suite alerts you: *"Warning: `p_interrupt_check` passed vacuously! You must update your stimulus driver to trigger `irq_trigger`!"*

---

## External SVA Binding (`bind` Keyword Architecture)

When writing synthesizable RTL code for a microchip, commercial coding standards prohibit editing synthesizable source files directly to insert non-synthesizable verification assertions. 

Modifying synthesizable files creates version control conflicts between design and verification teams.

To attach assertions to an RTL module without modifying a single line of the synthesizable source file, SystemVerilog provides the **`bind`** keyword.

```text
SYSTEMVERILOG SVA BIND ARCHITECTURE

 Synthesizable RTL File (CpuCore.sv)    External Verification File (CpuCore_sva.sv)
 ┌────────────────────────────────┐    ┌─────────────────────────────────────────┐
 │ module CpuCore (               │    │ module CpuCore_sva (                    │
 │   input clk, reset_n, req, ack │    │   input clk, reset_n, req, ack          │
 │ );                             │    │ );                                      │
 │   // Pure Synthesizable RTL    │    │   assert property (@(posedge clk) ...); │
 │ endmodule                      │    │ endmodule                               │
 └────────────────────────────────┘    └─────────────────────────────────────────┘
                 ▲                                          │
                 └──────────────── BIND COMMAND ────────────┘
                   bind CpuCore CpuCore_sva u_sva_bind (.*);
                   (Instantiates SVA module INSIDE CpuCore automatically!)
```

### How `bind` Works in Hardware Verification:

1. You write your synthesizable hardware module in `CpuCore.sv`.
2. You write a separate verification module containing SVA assertions in `CpuCore_sva.sv`.
3. In a top-level testbench file, you issue a single `bind` command:

```systemverilog
// EXTERNAL SVA BIND STATEMENT
// Binds the verification module 'CpuCore_sva' directly INTO 'CpuCore'!
bind CpuCore CpuCore_sva u_cpu_assertions_bind (
    .clk     (clk),
    .reset_n (reset_n),
    .req     (req),
    .ack     (ack)
);
```

During simulation, the compiler automatically instantiates `CpuCore_sva` inside every instance of `CpuCore` across the chip die, granting SVA assertions direct internal access to all module wires while leaving the synthesizable `CpuCore.sv` file 100% clean and untouched!

---

## Solved Industrial Engineering Exercise: SVA Verification Suite for an AXI-Lite Handshake Bus

To consolidate your complete mastery of SystemVerilog Assertions, sequences, properties, implication operators (`|->`, `|=>`), coverage directives, and external `bind` statements, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics chip design team is building an AXI-Lite Memory Bus Interface module (`AxiLiteMaster`) for a satellite's flight guidance processor.

```text
AXI-LITE BUS INTERFACE PROTOCOL

 Master Module (AxiLiteMaster)                 Slave Memory Module
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Output: axi_valid         ├────────────────►│ Input:  axi_valid         │
 │ Output: axi_addr[31:0]    ├────────────────►│ Input:  axi_addr[31:0]    │
 │ Output: axi_wdata[31:0]   ├────────────────►│ Input:  axi_wdata[31:0]   │
 │ Input:  axi_ready         │◄────────────────┤ Output: axi_ready         │
 └───────────────────────────┘                 └───────────────────────────┘
```

The bus protocol consists of four signals:
* `clk`: 100 MHz receiving clock.
* `reset_n`: Active-low reset.
* `axi_valid`: Active-high valid signal (Master asserts when driving valid address and data).
* `axi_ready`: Active-high ready signal (Slave asserts when ready to accept transaction).
* `axi_addr[31:0]`: 32-bit address bus.
* `axi_wdata[31:0]`: 32-bit write data bus.

#### AXI-Lite Protocol Invariants to Enforce:

1. **Rule 1 (Handshake Response Time)**: Whenever `axi_valid` is asserted High ($1$), `axi_ready` MUST respond High ($1$) within **at most 4 clock cycles** (`axi_valid |-> ##[0:4] axi_ready`).
2. **Rule 2 (Data Stability Rule)**: Whenever `axi_valid` is asserted High ($1$), the address bus `axi_addr` and data bus `axi_wdata` MUST remain completely **stable and un-changing** on every subsequent clock cycle until `axi_ready` goes High!
3. **Rule 3 (No Premature De-assertion)**: Once `axi_valid` is asserted High ($1$), it MUST NOT drop Low ($0$) until `axi_ready` has been asserted High (`axi_valid && !axi_ready |=> axi_valid`).

#### Your Objective

1. Write a dedicated SVA verification module `AxiLiteProtocolChecker` containing SystemVerilog properties, assertions, and coverage directives for all three protocol rules.
2. Use `$stable()` to enforce the Data Stability Rule.
3. Write a top-level testbench module `tb_AxiLiteVerification` that binds `AxiLiteProtocolChecker` to the `AxiLiteMaster` RTL module using the `bind` keyword.
4. Simulate the system through three test cases: a valid handshake, a data stability violation, and a handshake timeout violation.
5. Verify that SVA assertions fire correctly on protocol violations.

---

### Step-by-Step Derivation

#### Step 1: Write the SVA Verification Module (`AxiLiteProtocolChecker`)

We write `AxiLiteProtocolChecker` using clean, declarative SystemVerilog properties:

```systemverilog
`default_nettype none

module AxiLiteProtocolChecker (
    input logic        clk,
    input logic        reset_n,
    input logic        axi_valid,
    input logic        axi_ready,
    input logic [31:0] axi_addr,
    input logic [31:0] axi_wdata
);

    // -----------------------------------------------------------------
    // PROPERTY 1: HANDSHAKE RESPONSE TIME (Ready within 4 cycles)
    // -----------------------------------------------------------------
    property p_ready_response_timeout;
        @(posedge clk) disable iff (!reset_n)
        axi_valid |-> ##[0:4] axi_ready;
    endproperty

    A_READY_TIMEOUT: assert property (p_ready_response_timeout)
        else $error("[SVA ERROR 1] AXI-Lite Ready failed to respond within 4 cycles!");

    C_READY_TIMEOUT: cover property (p_ready_response_timeout);


    // -----------------------------------------------------------------
    // PROPERTY 2: DATA STABILITY RULE ($stable on addr and wdata)
    // While valid is High and ready is Low, addr and wdata MUST NOT change!
    // -----------------------------------------------------------------
    property p_data_stability;
        @(posedge clk) disable iff (!reset_n)
        (axi_valid && !axi_ready) |=> $stable(axi_addr) && $stable(axi_wdata);
    endproperty

    A_DATA_STABILITY: assert property (p_data_stability)
        else $error("[SVA ERROR 2] AXI-Lite Address or Data changed while waiting for Ready!");

    C_DATA_STABILITY: cover property (p_data_stability);


    // -----------------------------------------------------------------
    // PROPERTY 3: NO PREMATURE DE-ASSERTION OF VALID
    // Once valid is High, it MUST stay High until ready is High!
    // -----------------------------------------------------------------
    property p_valid_persistence;
        @(posedge clk) disable iff (!reset_n)
        (axi_valid && !axi_ready) |=> axi_valid;
    endproperty

    A_VALID_PERSISTENCE: assert property (p_valid_persistence)
        else $error("[SVA ERROR 3] AXI-Lite Valid dropped prematurely before Ready was asserted!");

    C_VALID_PERSISTENCE: cover property (p_valid_persistence);

endmodule

`default_nettype wire
```

---

#### Step 2: Bind the SVA Module to the RTL Target

We write the top-level testbench using the `bind` keyword to attach `AxiLiteProtocolChecker` directly into `AxiLiteMaster`:

```systemverilog
`default_nettype none

// TOP-LEVEL TESTBENCH WITH SVA BINDING
module tb_AxiLiteVerification;

    logic        clk;
    logic        reset_n;
    logic        axi_valid;
    logic        axi_ready;
    logic [31:0] axi_addr;
    logic [31:0] axi_wdata;

    // Clock Generator (100 MHz, T = 10 ns)
    always #5 clk = ~clk;

    // Synthesizable Target RTL Module Instantiation
    AxiLiteMaster u_master (
        .clk       (clk),
        .reset_n   (reset_n),
        .axi_valid (axi_valid),
        .axi_ready (axi_ready),
        .axi_addr  (axi_addr),
        .axi_wdata (axi_wdata)
    );

    // BIND SVA ASSERTION CHECKER DIRECTLY INTO RTL MODULE!
    bind AxiLiteMaster AxiLiteProtocolChecker u_sva_checker (
        .clk       (clk),
        .reset_n   (reset_n),
        .axi_valid (axi_valid),
        .axi_ready (axi_ready),
        .axi_addr  (axi_addr),
        .axi_wdata (axi_wdata)
    );

    // Test Control Logic
    initial begin
        clk       = 1'b0;
        reset_n   = 1'b0;
        axi_ready = 1'b0;

        #25;
        reset_n = 1'b1; // Release reset

        // Test Cases executed here...
    end

endmodule

`default_nettype wire
```

---

#### Step 3: Simulation and Assertion Error Verification

Let us simulate our SVA checker across three operational scenarios:

```text
AXI-LITE SVA PROTOCOL SIMULATION TRACE

 Clock Cycle │ axi_valid │ axi_ready │ axi_addr    │ SVA Property Assertion Status
─────────────┼───────────┼───────────┼─────────────┼─────────────────────────────────────────────
   Cycle 1   │     1     │     0     │ 32'h00040000│ Antecedents match (axi_valid = 1)
   Cycle 2   │     1     │     0     │ 32'h00040000│ $stable(axi_addr) = TRUE (PASS!)
   Cycle 3   │     1     │     1     │ 32'h00040000│ axi_ready = 1 within 2 cycles (PASS!)
─────────────┼───────────┼───────────┼─────────────┼─────────────────────────────────────────────
   Cycle 10  │     1     │     0     │ 32'h00040000│ Valid = 1, Ready = 0
   Cycle 11  │     1     │     0     │ 32'h00040004│ ADDR CHANGED! $stable(axi_addr) = FALSE!
             │           │           │             │ [SVA ERROR 2 FIRED!]
─────────────┼───────────┼───────────┼─────────────┼─────────────────────────────────────────────
   Cycle 20  │     1     │     0     │ 32'h00080000│ Valid = 1, Ready = 0 (Cycle 0)
   Cycle 21..24│   1     │     0     │ 32'h00080000│ Ready stays 0 for 4 cycles...
   Cycle 25  │     1     │     0     │ 32'h00080000│ TIMEOUT EXPIRED! (5 cycles without Ready)
             │           │           │             │ [SVA ERROR 1 FIRED!]
```

##### Detailed SVA Evaluation:

1. **Test Case 1 (Valid Transaction, Cycles 1 to 3)**:
   * `axi_valid = 1`, `axi_ready = 1` on cycle 3 (within 2 cycles).
   * `axi_addr` remained stable (`32'h00040000`).
   * **All three SVA properties PASSED!**
2. **Test Case 2 (Data Instability Violation, Cycle 11)**:
   * `axi_valid = 1` and `axi_ready = 0`.
   * On cycle 11, `axi_addr` changed from `32'h00040000` to `32'h00040004`.
   * Property `p_data_stability` evaluated `$stable(axi_addr) == FALSE`.
   * **`A_DATA_STABILITY` FIRED AN IMMEDIATE ERROR LOG AT CYCLE 11!**
3. **Test Case 3 (Ready Response Timeout, Cycles 20 to 25)**:
   * `axi_valid = 1`, but `axi_ready` remained $0$ for 5 consecutive clock cycles.
   * Property `p_ready_response_timeout` evaluated `##[0:4] axi_ready == FALSE`.
   * **`A_READY_TIMEOUT` FIRED AN IMMEDIATE ERROR LOG AT CYCLE 25!**

All protocol violations were caught at the exact nanosecond they occurred without looking at a single waveform.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **SystemVerilog Concurrent Assertions (SVA)**: Declarative, multi-cycle temporal verification statements (`assert property`) evaluated across clock steps in the Preponed and Observed event queue regions, providing glitch-free protocol checking directly at module boundaries.
* **Overlapping vs. Non-Overlapping Implication (`|->` vs `|=>`)**: The SVA conditional operators that define temporal triggers: overlapping implication (`|->`) evaluates the consequent on the exact same clock cycle as the antecedent; non-overlapping implication (`|=>`) evaluates the consequent on the next clock cycle (`##1`).
