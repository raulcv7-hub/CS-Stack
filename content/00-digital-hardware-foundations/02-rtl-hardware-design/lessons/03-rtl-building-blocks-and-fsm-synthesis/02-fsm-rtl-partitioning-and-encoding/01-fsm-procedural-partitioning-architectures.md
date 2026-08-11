# Procedural FSM Partitioning Architectures and Glitch-Free Registered Output Synthesis: Two-Block and Three-Block RTL Modeling

## The Monolithic FSM Monstrosity and Output Glitch Hazards

When a digital systems engineer designs a Finite State Machine (FSM) controller—such as an SPI bus master, an Ethernet frame parser, or a memory controller state engine—they must write code that executes three fundamentally distinct tasks:

1. **Sequential State Memory**: Storing the current state vector ($Q$) in a bank of edge-triggered flip-flops.
2. **Next-State Transition Logic**: Computing the next state vector ($Q_{\text{next}}$) as a combinational function of the current state and incoming inputs ($Q_{\text{next}} = g(Q, X)$).
3. **Output Control Decoding**: Computing the system output signals ($Y$) as a function of the state and inputs ($Y = f(Q)$ for Moore, or $Y = f(Q, X)$ for Mealy).

In introductory coding, junior engineers are often tempted to collapse all three tasks into a single, monolithic procedural block (`always_ff @(posedge clk)`). They write one giant `always_ff` block containing state transitions, next-state logic, and output signal assignments all mixed together.

In a basic software simulator, this monolithic single-block FSM appears to work. However, when the code is submitted to an industrial logic synthesis compiler or deployed on a high-speed microchip, a monolithic single-block FSM causes catastrophic physical hardware failures.

```text
THE MONOLITHIC FSM HARDWARE FAILURE

 Monolithic Single-Block Code (always_ff):
 ┌───────────────────────────────────────────────────────────┐
 │ State Storage + Next-State Logic + Output Assignments     │
 │ ALL MIXED TOGETHER IN ONE SEQUENTIAL BLOCK!               │
 └────────────────────────────┬──────────────────────────────┘
                              │
                              ▼
 Physical Silicon Failures:
 1. 1-Cycle Output Lag Bug (Outputs delayed by an extra clock cycle!)
 2. Inferred Feedback Latches & Synthesis Race Conditions
 3. Severe Static Timing Analysis (STA) Critical Path Degradation
```

A monolithic single-block FSM suffers from two major physical liabilities:

1. **The 1-Cycle Output Lag Bug**: Inside a sequential `always_ff` block, all signal assignments are registered by flip-flops. If you write `if (state == WORK) out_flag = 1;` inside an `always_ff` block, `out_flag` will NOT turn High when the state machine enters `WORK`. It will turn High **one full clock cycle LATER**! To make `out_flag` turn High during `WORK`, you are forced to write mind-bending code that predicts `WORK` while sitting in `IDLE`. The code becomes an unmaintainable, bug-ridden mess.
2. **Combinational Output Glitches**: If an engineer attempts to fix this output lag by converting the monolithic block into a single combinational block (`always_comb`), they lose state memory entirely! The synthesis tool infers transparent latches for the state register, causing transient output voltage spikes (**Glitches**) whenever state bits flip at slightly different nanoseconds.

In high-speed microchips operating at gigahertz frequencies, an output glitch on a memory write-enable line or a chip-select pin will corrupt stored data or trigger false bus transactions.

To design clean, maintainable, high-speed state machine controllers that produce 100% glitch-free outputs, digital engineering requires strictly partitioning RTL code into standardized modular blocks: the **Two-Block FSM Architecture** and the **Three-Block FSM Architecture**.

---

## The Three-Worker Assembly Line: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of why state machines must be partitioned into separate procedural blocks, let us step away from silicon chips and picture a busy bank drive-thru teller window.

Imagine a bank drive-thru processing customer transactions (deposits, withdrawals, balance checks). The drive-thru system must manage three distinct tasks:
1. **Memory**: Remembering which customer is currently at the window ($Q$).
2. **Traffic Planning**: Deciding which customer car in line should drive up next ($Q_{\text{next}}$).
3. **Cash Handling**: Counting out the cash payout to hand through the window ($Y$).

```text
THE DRIVE-THRU TELLER ORCHESTRATION MODEL

 Customer Car Line (Inputs X) ──► [ Drive-Thru Window System ] ──► Cash Payout (Output Y)
```

Let's compare two different ways to staff this drive-thru window:

---

### Setup A: The Single Overloaded Clerk (Monolithic 1-Block FSM)

The bank hires a single clerk and forces them to handle all three jobs simultaneously:
* The clerk stands at the window trying to count cash for Customer 1 ($Y$).
* At the exact same second, the clerk tries to remember if Customer 1 is finished ($Q$).
* At the exact same second, the clerk looks out the window to see if Customer 2 is pulling up ($X$), trying to calculate who should get cash next ($Q_{\text{next}}$).

```text
SETUP A: THE SINGLE OVERLOADED CLERK (1-BLOCK FSM)

 Single Clerk ──► Trying to count cash AND remember customer AND watch traffic!
                  (Gets confused! Hands Customer 2's cash to Customer 1!)
                  (Delays payout by a full cycle while sorting out the mess!)
```

Look at what happens to the single overloaded clerk:
The clerk gets confused! While counting cash for Customer 1, the clerk sees Customer 2 pulling up, gets distracted, and accidentally hands Customer 2's withdrawal receipt to Customer 1! To prevent mistakes, the clerk has to stop, lock the drawer, and delay handing out cash until the *next* turn. 

The cash payout is delayed, mismatched, and full of mistakes. This is the **Monolithic 1-Block FSM Failure**.

---

### Setup B: The Three-Worker Specialized Team (Three-Block FSM)

The bank replaces the single overloaded clerk with a specialized 3-worker team:

```text
SETUP B: THE THREE-WORKER SPECIALIZED TEAM (3-BLOCK FSM)

 Worker 1: The Ticket Memory Clerk (State Register - always_ff)
 ───────── Holds the official customer ticket (Q). 
           Updates the ticket ONLY when the master clock bell rings!

 Worker 2: The Traffic Planner (Next-State Logic - always_comb)
 ───────── Looks at current ticket Q and incoming car line X.
           Writes down the NEXT ticket number (Q_next) on a notepad.
           Does NOT touch the cash or the customer!

 Worker 3: The Dedicated Cashier (Output Logic - always_ff)
 ───────── Looks at the next ticket number (Q_next) on the notepad.
           Prepares the exact cash payout in advance.
           Hands out the cash INSTANTLY and cleanly on the clock bell!
```

```text
THREE-WORKER DIVISION OF LABOR

 Worker 2 (Planner) ──► Calculates Q_next on notepad ──┐
                                                      ├──► Clock Bell Rings!
 Worker 1 (Memory)  ──► Updates Ticket Q              │    (Everything syncs!)
 Worker 3 (Cashier) ──► Hands out Cash Y ─────────────┘
```

Look at how flawlessly this 3-worker team operates:
1. **Zero Confusion**: Worker 1 only holds the memory. Worker 2 only plans the next step. Worker 3 only prepares the cash.
2. **Zero Output Delay**: Because Worker 3 (the Cashier) looks at the Traffic Planner's notepad ($Q_{\text{next}}$) in advance, the exact correct cash is ready to hand out **the exact second the customer arrives at the window**!
3. **Zero Glitches**: Worker 3 hands cash through a secure motorized drawer that opens *only* on the clock bell, preventing any accidental cash drops or intermediate mistakes!

This 3-worker team is the exact physical analogue of a **Three-Block FSM Architecture**:
* Worker 1 is the **State Register (`always_ff`)**.
* Worker 2 is the **Next-State Logic (`always_comb`)**.
* Worker 3 is the **Registered Output Logic (`always_ff` evaluating `next_state`)**.

---

## Mechanics of FSM Procedural Partitioning Architectures

To master state machine synthesis, we must dissect the formal mechanics, SystemVerilog coding structures, and hardware gate topologies of the two industry-standard architectures: **The Two-Block FSM** and **The Three-Block FSM**.

---

### Primitive 1: The Two-Block FSM Architecture

The **Two-Block FSM Architecture** partitions the state machine into two distinct procedural blocks:

1. **Block 1 (Sequential State Register)**: A single `always_ff` block that models the $N$-bit state register flip-flops. It updates current state $Q$ to next state $Q_{\text{next}}$ on every active clock edge.
2. **Block 2 (Combinational Next-State and Output Logic)**: A single `always_comb` block that computes BOTH the next state $Q_{\text{next}} = g(Q, X)$ AND the combinational system outputs $Y = f(Q, X)$.

```text
TWO-BLOCK FSM ARCHITECTURE SCHEMATIC

                         ┌───────────────────────────────┐
                         │     STATE REGISTER (Block 1)  │
                         │  always_ff @(posedge clk)     │
                         └──────────────┬────────────────┘
                                        │
                                        ├──────────────────────────┐
                                        │ Current State Q          │
                                        ▼                          ▼
 External Inputs X ──► ┌──────────────────────────────────────────────┐
                       │ COMBINATIONAL LOGIC BLOCK (Block 2)          │
                       │ always_comb                                  │
                       │   * Next-State Logic: Q_next = g(Q, X)       │
                       │   * Output Logic    : Y      = f(Q, X)       │
                       └──────────────┬──────────────────┬────────────┘
                                      │                  │
                                      ▼                  ▼
                              Next State Q_next   Combinational Output Y
                              (To State Reg)      (Un-registered!)
```

#### Complete Synthesizable SystemVerilog 2-Block FSM Template

Let me show you the clean, standardized SystemVerilog template for a Two-Block FSM:

```systemverilog
// SYSTEMVERILOG TWO-BLOCK FSM TEMPLATE
module TwoBlockFsm (
    input  logic clk,
    input  logic reset_n,
    input  logic start_cmd,
    input  logic done_flag,
    output logic busy_out,
    output logic valid_out
);

    // 1. Enumerated State Type Declaration
    typedef enum logic [1:0] {
        ST_IDLE = 2'b00,
        ST_WORK = 2'b01,
        ST_DONE = 2'b10
    } state_e;

    state_e current_state, next_state;

    // -----------------------------------------------------------------
    // BLOCK 1: SEQUENTIAL STATE REGISTER (always_ff)
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            current_state <= ST_IDLE; // Reset to safe initial state
        end else begin
            current_state <= next_state; // Advance to next state
        end
    end

    // -----------------------------------------------------------------
    // BLOCK 2: COMBINATIONAL NEXT-STATE & OUTPUT LOGIC (always_comb)
    // -----------------------------------------------------------------
    always_comb begin
        // A. Default Assignments (Guarantees 100% Latch-Free Synthesis!)
        next_state = current_state;
        busy_out   = 1'b0;
        valid_out  = 1'b0;

        // B. State Transition and Output Decoding Matrix
        unique case (current_state)
            ST_IDLE: begin
                busy_out = 1'b0;
                if (start_cmd) begin
                    next_state = ST_WORK;
                end
            end

            ST_WORK: begin
                busy_out = 1'b1; // Combinational Moore output for WORK state
                if (done_flag) begin
                    next_state = ST_DONE;
                end
            end

            ST_DONE: begin
                valid_out  = 1'b1; // Combinational Moore output for DONE state
                next_state = ST_IDLE;
            end

            default: begin
                next_state = ST_IDLE; // Safe state recovery
            end
        endcase
    end

endmodule
```

#### Advantages of the Two-Block Architecture:
* **High Readability**: State transitions and output decoding are written together inside the `case` statement, making the control algorithm extremely easy for humans to read and audit.
* **Instant Output Response**: Because outputs (`busy_out`, `valid_out`) are decoded combinationally in Block 2, they turn High **immediately on the same clock cycle** that `current_state` enters that state.

#### Disadvantages of the Two-Block Architecture:
* **Combinational Output Glitches**: Because outputs are generated by combinational logic gates, any transient voltage spike on state bits or input signals will appear as a glitch on the output pins.
* **Timing Closure Bottlenecks**: In a large system, the combinational output path extends into downstream modules, increasing critical path logic delay ($t_{\text{logic}}$) and reducing maximum clock frequency ($f_{\text{max}}$).

---

### Primitive 2: The Three-Block FSM Architecture (Glitch-Free Registered Outputs)

To eliminate combinational output glitches and maximize clock frequency ($f_{\text{max}}$), high-speed hardware engineering uses the **Three-Block FSM Architecture**.

The Three-Block FSM completely isolates all three tasks into dedicated procedural blocks:

1. **Block 1 (Sequential State Register - `always_ff`)**: Updates `current_state <= next_state` on `posedge clk`.
2. **Block 2 (Combinational Next-State Logic - `always_comb`)**: Computes `next_state = g(current_state, X)`. Contains NO output signal assignments!
3. **Block 3 (Sequential Registered Output Logic - `always_ff`)**: Computes and registers output signals $Y$ on `posedge clk` by **looking ahead at `next_state`**!

```text
THREE-BLOCK FSM ARCHITECTURE SCHEMATIC

                         ┌───────────────────────────────┐
                         │     STATE REGISTER (Block 1)  │
                         │  always_ff @(posedge clk)     │
                         └──────────────┬────────────────┘
                                        │
                                        ├──────────────────────────┐
                                        │ Current State Q          │
                                        ▼                          ▼
 External Inputs X ──► ┌───────────────────────────────┐  ┌────────┴──────────────┐
                       │   NEXT-STATE LOGIC (Block 2)  │  │ REGISTERED OUTPUTS    │
                       │   always_comb                 │  │ (Block 3: always_ff)  │
                       │   next_state = g(Q, X)        │  │ Y <= f(next_state)    │
                       └──────────────┬────────────────┘  └──────────┬────────────┘
                                      │                              │
                                      ▼                              ▼
                              Next State Q_next              Registered Output Y
                           (To Block 1 and Block 3!)         (100% Glitch-Free!)
```

---

### The Look-Ahead Registering Trick in Block 3

Here is the secret mathematical mechanism that makes the Three-Block FSM work without introducing a 1-clock-cycle output delay:

In Block 3, the output flip-flops do NOT evaluate `current_state`. **They evaluate `next_state`!**

```systemverilog
// BLOCK 3: REGISTERED OUTPUT LOGIC (EVALUATES NEXT_STATE!)
always_ff @(posedge clk or negedge reset_n) begin
    if (!reset_n) begin
        busy_out  <= 1'b0;
        valid_out <= 1'b0;
    end else begin
        // Default Output Values
        busy_out  <= 1'b0;
        valid_out <= 1'b0;

        // EVALUATE NEXT_STATE (LOOK-AHEAD REGISTERING!)
        unique case (next_state)
            ST_WORK: busy_out  <= 1'b1;
            ST_DONE: valid_out <= 1'b1;
            default: ;
        endcase
    end
end
```

#### Why Evaluating `next_state` Eliminates Output Lag:
Trace what happens on the rising clock edge when the state machine transitions from `ST_IDLE` to `ST_WORK`:

1. **Before the clock edge**: `current_state` is `ST_IDLE`. Block 2 evaluates `next_state = ST_WORK`.
2. **On the rising clock edge**:
   * Block 1 captures `current_state <= ST_WORK`.
   * Block 3 captures `busy_out <= 1'b1` (because Block 3 read `next_state = ST_WORK`!).
3. **On the exact same clock edge**, `current_state` enters `ST_WORK` AND `busy_out` turns High!

```text
TIMING ALIGNMENT OF LOOK-AHEAD REGISTERED OUTPUTS

 Clock Edge 1 (Transition IDLE -> WORK):
   * State Register (Block 1) captures current_state <= ST_WORK
   * Output Register (Block 3) captures busy_out <= 1'b1 (from next_state!)
   * RESULT: State WORK and busy_out = 1 arrive at the EXACT SAME CLOCK EDGE!
```

There is **zero clock cycle delay**, and because `busy_out` is emitted by a physical flip-flop, it is **100% free of combinational glitches!**

---

## Mealy versus Moore Output Glitch Dynamics

Why do combinational outputs glitch in the first place, and why are Mealy outputs more vulnerable than Moore outputs?

To understand glitch formation, we must examine how signals propagate through combinational decoding gates.

---

### 1. Moore Output Glitches ($Y = f(Q)$)

In a Moore state machine, outputs are generated by decoding state bits: $Y = f(Q_1, Q_0)$.

Suppose a state machine transitions from State $S_1$ ($Q_1 Q_0 = 01_2$) to State $S_2$ ($Q_1 Q_0 = 10_2$). 

In physical silicon, flip-flop $\text{FF}_0$ might transition from $1 \to 0$ in $0.3\text{ ns}$, while flip-flop $\text{FF}_1$ transitions from $0 \to 1$ in $0.5\text{ ns}$ due to wire length differences.

```text
MOORE STATE TRANSITION GLITCH FORMATION

 Target State Transition :  0 1 (State S1)  ──────────────►  1 0 (State S2)
                                 
 Actual Physical Path    :  0 1  ──(t = 0.3 ns)──►  0 0  ──(t = 0.5 ns)──►  1 0
                                                    │
                                                    ▼
                                         TRANSIENT STATE S0 (00)!
                                         (Output Decoder emits 1-ns Glitch Spike!)
```

During that $0.2\text{-ns}$ window between $t = 0.3\text{ ns}$ and $t = 0.5\text{ ns}$, the state register outputs briefly hold the intermediate vector $00_2$ (State $S_0$)! 

The Moore output decoder sees $00_2$ and emits a brief **$0.2\text{-ns}$ voltage glitch spike** on the output wire!

---

### 2. Mealy Output Glitches ($Y = f(Q, X)$)

In a Mealy state machine, outputs depend on BOTH state bits AND external inputs ($Y = f(Q, X)$).

Because external input wires $X$ connect directly through logic gates to output $Y$, **any noise spike, crosstalk glitch, or bounce occurring on input $X$ at ANY time during the clock cycle passes straight through to output $Y$ in real time!**

```text
MEALY INPUT NOISE FEEDTHROUGH GLITCH

 External Input X (Noise Spike / Glitch)
                    │
                    ▼
 [ Mealy Output Decoder Y = f(Q, X) ] ──► Output Y GLITCHES IN REAL TIME!
                                          (Noise leaks directly to actuators!)
```

Even if the state register $Q$ remains completely stable, a glitch on input $X$ corrupts output $Y$.

---

### 3. The 3-Block Solution for Both Moore and Mealy Machines

By using the **Three-Block FSM Architecture** and passing the output through dedicated output flip-flops, **both Moore and Mealy outputs are completely cleansed of glitches**.

The output flip-flops sample the decoded result at the rising clock edge, filtering out all intermediate signal switching and presenting a rock-solid, clean voltage level to downstream silicon components.

```text
GLITCH FILTERING VIA OUTPUT REGISTERING

 Glitchy Combinational Output ──► [ Output Flip-Flop ] ──► Clean Registered Output
 (Contains 0.2-ns Spikes)         (Samples ONLY on posedge clk) (100% GLITCH-FREE!)
```

---

## Engineering Reality: Timing Closure and Output Pad Driving

In physical System-on-Chip (SoC) design and FPGA compilation, partitioning FSMs into Three-Block architectures delivers two major physical performance benefits:

### 1. Static Timing Analysis (STA) Critical Path Decoupling

In a Two-Block FSM, the combinational path from the state register extends through the output decoder, through the inter-module bus, and into the next module's combinational logic. This long multi-module gate chain creates a huge critical path delay ($t_{\text{logic}}$), reducing maximum operating clock frequency ($f_{\text{max}}$).

In a Three-Block FSM, the output is emitted directly by a flip-flop. The critical path is **decoupled**:
* Path 1: FSM State Register $\to$ Output Register ($t_{\text{C2Q}} + t_{\text{decoder}} + t_{\text{su}}$).
* Path 2: Output Register $\to$ Downstream Module ($t_{\text{C2Q}} + t_{\text{downstream\_logic}} + t_{\text{su}}$).

By breaking the long combinational chain into two shorter register-to-register stages, the maximum clock frequency $f_{\text{max}}$ of the entire microchip increases significantly!

```text
CRITICAL PATH DECOUPLING VIA THREE-BLOCK FSM

 Two-Block FSM (Un-registered Output):
 Clock ──► [ State Reg ] ──► [ Output Dec ] ──► [ Bus Wires ] ──► [ Downstream Logic ] ──► Reg
           ◄───────────────────────────── Long Critical Path ────────────────────────────►

 Three-Block FSM (Registered Output):
 Clock ──► [ State Reg ] ──► [ Output Dec ] ──► [ Output Reg ] ──► [ Downstream Logic ] ──► Reg
           ◄───── Short Path 1 ────────────►   ◄──────────── Short Path 2 ──────────────►
```

### 2. FPGA I/O Block (IOB) Register Packing

In FPGA architectures, the physical input/output pads at the outer edge of the chip contain dedicated, hardwired flip-flops called **I/O Block (IOB) Registers**.

When an FSM output is generated by a 3-Block registered structure (`always_ff`), the FPGA synthesis tool automatically packs that output flip-flop directly into the physical IOB pad at the edge of the silicon.

```text
FPGA IOB REGISTER PACKING

 FPGA Logic Array                         FPGA Silicon Edge Pad (IOB)
 ┌───────────────────────────┐            ┌───────────────────────────┐
 │ FSM State Register        │            │ Dedicated IOB Flip-Flop   │
 │ Next-State Logic          ├─── Wires ─►│ (Packed into Output Pin!) ├──► Physical Chip Pin
 └───────────────────────────┘            └───────────────────────────┘
                                           Zero Output Routing Delay (t_co < 1 ns!)
```

Packing the output flip-flop into the IOB pad reduces the chip's **Clock-to-Output Delay ($t_{\text{co}}$)** to less than 1 nanosecond, meeting strict high-speed bus interfaces like PCIe, DDR, and Ethernet.

---

## Solved Industrial Engineering Exercise: High-Speed Glitch-Free SPI Bus Controller

To consolidate your complete mastery of 2-block versus 3-block FSM architectures, look-ahead registered output decoding, glitch elimination, and SystemVerilog state machine coding, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics defense firm is engineering the 3-block FSM controller for a satellite's **Serial Peripheral Interface (SPI) Bus Master** (`SpiMasterController`).

The controller manages a 4-step serial transmission sequence across four states (`ST_IDLE`, `ST_LOAD`, `ST_TRANSMIT`, `ST_DONE`):

```text
SPI BUS MASTER FSM STATE TRANSITIONS

                  start_tx = 0
            ┌──────────────────────┐
            │                      ▼
     ┌──────┴───────┐  start_tx=1 ┌──────────────┐
     │ ST_IDLE      ├────────────►│ ST_LOAD      │
     └──────────────┘             └──────┬───────┘
            ▲                            │
            │                            ▼
     ┌──────┴───────┐  tx_done=1  ┌──────────────┐
     │ ST_DONE      │◄────────────┤ ST_TRANSMIT  │
     └──────────────┘             └──────────────┘
```

The controller drives three physical output signals:
1. `spi_cs_n`: Active-low Chip Select line ($0 = \text{Asserted/Active}, 1 = \text{De-asserted}$).
2. `spi_sclk_en`: Active-high Serial Clock Enable ($1 = \text{Run SPI Clock}, 0 = \text{Stop Clock}$).
3. `tx_busy`: Active-high Controller Busy Flag ($1 = \text{Busy Processing}, 0 = \text{Idle}$).

#### System Output Requirements Matrix:

```text
SPI CONTROLLER MOORE OUTPUT MATRIX

 State Name   │ State Code [1:0] │ spi_cs_n (Active Low) │ spi_sclk_en │ tx_busy │ Functional Mode
──────────────┼──────────────────┼───────────────────────┼─────────────┼─────────┼─────────────────────────────
 ST_IDLE      │      2'b00       │           1           │      0      │    0    │ Bus Idle (CS High, SCLK OFF)
 ST_LOAD      │      2'b01       │           0           │      0      │    1     │ Load Data (CS Low, SCLK OFF)
 ST_TRANSMIT  │      2'b10       │           0           │      1      │    1     │ Stream Bits (CS Low, SCLK ON)
 ST_DONE      │      2'b11       │           0           │      0      │    1     │ Finish Frame (CS Low, SCLK OFF)
```

#### Critical Timing Requirement:
Output `spi_cs_n` MUST drop to $0\text{ V}$ (active-low assert) **on the exact same clock edge** that the FSM transitions from `ST_IDLE` to `ST_LOAD`. It must NOT lag by an extra clock cycle, and MUST be **100% free of combinational glitches**.

#### Your Objective

1. Implement the controller using the **Three-Block FSM Architecture** in SystemVerilog.
2. Use look-ahead evaluation over `next_state` in Block 3 to register all three outputs (`spi_cs_n`, `spi_sclk_en`, `tx_busy`) with zero cycle lag and zero glitches.
3. Calculate the total physical flip-flop count and gate count for the 3-block FSM.
4. Simulate the controller through a complete transmission cycle (`start_tx = 1`, `tx_done = 1`), tracing all state bits and output signals.
5. Verify mathematical and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Write the Three-Block FSM SystemVerilog Module

We write `SpiMasterController` using three cleanly separated procedural blocks:

```systemverilog
`default_nettype none

module SpiMasterController (
    input  logic clk,
    input  logic reset_n,
    input  logic start_tx,
    input  logic tx_done,
    output logic spi_cs_n,   // Registered active-low chip select
    output logic spi_sclk_en,// Registered serial clock enable
    output logic tx_busy     // Registered controller busy flag
);

    // 1. State Enumeration Definition
    typedef enum logic [1:0] {
        ST_IDLE     = 2'b00,
        ST_LOAD     = 2'b01,
        ST_TRANSMIT = 2'b10,
        ST_DONE     = 2'b11
    } state_e;

    state_e current_state, next_state;

    // -----------------------------------------------------------------
    // BLOCK 1: SEQUENTIAL STATE REGISTER (always_ff)
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            current_state <= ST_IDLE;
        end else begin
            current_state <= next_state;
        end
    end

    // -----------------------------------------------------------------
    // BLOCK 2: COMBINATIONAL NEXT-STATE LOGIC (always_comb)
    // -----------------------------------------------------------------
    always_comb begin
        // Default Next State (Hold current state)
        next_state = current_state;

        unique case (current_state)
            ST_IDLE: begin
                if (start_tx) next_state = ST_LOAD;
            end

            ST_LOAD: begin
                next_state = ST_TRANSMIT;
            end

            ST_TRANSMIT: begin
                if (tx_done) next_state = ST_DONE;
            end

            ST_DONE: begin
                next_state = ST_IDLE;
            end

            default: begin
                next_state = ST_IDLE;
            end
        endcase
    end

    // -----------------------------------------------------------------
    // BLOCK 3: REGISTERED OUTPUT LOGIC (always_ff evaluating NEXT_STATE!)
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            spi_cs_n    <= 1'b1; // Default de-asserted High
            spi_sclk_en <= 1'b0; // Default clock disabled
            tx_busy     <= 1'b0; // Default not busy
        end else begin
            // Default Output Values for next clock cycle
            spi_cs_n    <= 1'b1;
            spi_sclk_en <= 1'b0;
            tx_busy     <= 1'b0;

            // LOOK-AHEAD REGISTERING VIA NEXT_STATE EVALUATION
            unique case (next_state)
                ST_IDLE: begin
                    spi_cs_n    <= 1'b1;
                    spi_sclk_en <= 1'b0;
                    tx_busy     <= 1'b0;
                end

                ST_LOAD: begin
                    spi_cs_n    <= 1'b0; // CS drops LOW on entry to LOAD!
                    spi_sclk_en <= 1'b0;
                    tx_busy     <= 1'b1;
                end

                ST_TRANSMIT: begin
                    spi_cs_n    <= 1'b0; // CS stays LOW during TRANSMIT!
                    spi_sclk_en <= 1'b1; // Enable SCLK!
                    tx_busy     <= 1'b1;
                end

                ST_DONE: begin
                    spi_cs_n    <= 1'b0; // CS stays LOW during DONE!
                    spi_sclk_en <= 1'b0;
                    tx_busy     <= 1'b1;
                end

                default: begin
                    spi_cs_n    <= 1'b1;
                    spi_sclk_en <= 1 meb0;
                    tx_busy     <= 1'b0;
                end
            endcase
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 2: Analyze Hardware Resource Footprint

Let me calculate the total physical flip-flops and gates synthesized for `SpiMasterController`:

1. **Block 1 (State Register)**: 2 D Flip-Flops (`current_state[1:0]`).
2. **Block 2 (Next-State Logic)**: Combinational AND/OR gates computing `next_state[1:0]` (~6 gates).
3. **Block 3 (Registered Outputs)**: **3 D Flip-Flops** (`spi_cs_n`, `spi_sclk_en`, `tx_busy`).

$$\text{Total Flip-Flops} = 2 \text{ (State Reg)} + 3 \text{ (Output Regs)} = \mathbf{5 \text{ Flip-Flops}}$$

```text
THREE-BLOCK FSM RESOURCE FOOTPRINT

 State Register Flip-Flops : [ FF 1 ] [ FF 0 ]  (2 Flip-Flops)
 Output Register Flip-Flops: [ FF_cs_n ] [ FF_sclk_en ] [ FF_busy ]  (3 Flip-Flops)
 Total Sequential Memory   : 5 Edge-Triggered D Flip-Flops
 Output Signal Quality     : 100% GLITCH-FREE REGISTERED DRIVERS!
```

---

#### Step 3: Simulation Trace of Transmission Cycle

Let us trace the simulation across a complete transmission cycle (`start_tx = 1`, `tx_done = 1`):

```text
SPI CONTROLLER TIMING SIMULATION TRACE

 Clock Edge │ Inputs (start_tx, tx_done) │ Current State │ Next State │ spi_cs_n │ spi_sclk_en │ tx_busy │ Controller Action
────────────┼────────────────────────────┼───────────────┼────────────┼──────────┼─────────────┼─────────┼──────────────────────────────
  Initial   │           0, 0             │    ST_IDLE    │  ST_IDLE   │    1     │      0      │    0    │ Idle / Bus Standing
  Edge 1    │           1, 0             │    ST_IDLE    │  ST_LOAD   │    1     │      0      │    0    │ start_tx = 1 detected!
  Edge 2    │           0, 0             │    ST_LOAD    │ST_TRANSMIT │    0     │      0      │    1    │ CS DROPS LOW! (Exact Align!)
  Edge 3    │           0, 0             │  ST_TRANSMIT  │ST_TRANSMIT │    0     │      1      │    1    │ SCLK ENABLED! Streaming...
  Edge 4    │           0, 1             │  ST_TRANSMIT  │  ST_DONE   │    0     │      1      │    1    │ tx_done = 1 detected!
  Edge 5    │           0, 0             │    ST_DONE    │  ST_IDLE   │    0     │      0      │    1    │ SCLK OFF, CS still Low
  Edge 6    │           0, 0             │    ST_IDLE    │  ST_IDLE   │    1     │      0      │    0    │ CS RISES HIGH! Transmission Done!
```

##### Timing Alignment Check at Edge 2:
* At Edge 1, `start_tx = 1` was evaluated while in `ST_IDLE`. Block 2 computed `next_state = ST_LOAD`.
* Block 3 read `next_state = ST_LOAD` and scheduled `spi_cs_n <= 1'b0`.
* On Edge 2, `current_state` entered `ST_LOAD` **and `spi_cs_n` dropped to $0$ on the exact same clock edge!**
* **Zero clock cycle lag! Zero output glitches!**

All simulation cycles, timing alignments, and registered outputs evaluate with 100% mathematical, physical, and logical precision. The 3-Block SPI Bus Controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Two-Block FSM Architecture**: A modular state machine layout that isolates sequential state storage (`always_ff`) from combinational next-state and output logic (`always_comb`), providing high code readability and instant combinational output response.
* **Three-Block FSM Architecture**: A high-speed state machine layout that isolates state storage (`always_ff`), next-state logic (`always_comb`), and registered output logic (`always_ff` evaluating `next_state`), producing 100% glitch-free outputs and maximizing clock frequency ($f_{\text{max}}$) through critical path decoupling.
