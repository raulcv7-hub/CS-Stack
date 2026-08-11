---
title: "Gate-Level Simulation, Standard Delay Format (SDF) Back-Annotation, and Reset Warning Suppression"
---

# Gate-Level Simulation, Standard Delay Format (SDF) Back-Annotation, and Reset Warning Suppression

When a digital hardware verification team tests a complex Register-Transfer Level (RTL) module—such as a 64-bit pipelined CPU core, a 4K video frame buffer, or a high-speed satellite telemetry processor—they typically begin by running event-driven software simulations on the high-level SystemVerilog source code.

In a functional RTL simulation, the simulator engine evaluates logic gates, multiplexers, and state machine transitions as **zero-delay mathematical abstractions** (`#0`).

The software simulator assumes that when an input wire changes state at time $t = 10.00\text{ ns}$, the output of an adder or state decoder updates instantaneously at $t = 10.00\text{ ns}$.

```text
 RTL Simulation (Zero-Delay Abstraction #0)
   Input A Flips ──► Gate Output Y Flips INSTANTLY (0.0 ns!)
   (Masks physical glitches, wire skews, and clock tree delays!)

 Gate-Level Simulation with SDF Back-Annotation
   Input A Flips ──► [ Cell Delay: 0.35 ns ] ──► [ Wire Delay: 1.20 ns ]
                     Output Y Flips AFTER 1.55 ns!
   (Exposes real-world glitches, race conditions, and setup failures!)
```

While functional RTL simulation is fast and essential for verifying high-level algorithmic logic, it creates a dangerous illusion of perfection.

In physical silicon, logic gates do not evaluate in zero time. Electrons take a measurable number of picoseconds to travel through silicon transistors and charge microscopic copper wire capacitances.

Because real physical gates and copper wires have delay, two major real-world hardware failure modes occur in physical silicon that **functional RTL simulation is completely blind to**:

1. **Transient Gate Glitches (Runt Pulses)**: In a complex combinational decoder, if two input signals arrive at a gate $0.2\text{ nanoseconds}$ apart due to wire length differences, the gate output emits a transient, fractional-width voltage spike (**a Glitch**). If this glitch touches an asynchronous reset line or a clock enable pin, it corrupts stored register memory. Functional RTL simulation evaluates both inputs at time $t = 10.00\text{ ns}$ simultaneously, masking the glitch completely!
2. **Clock Tree Skew and Reset Recovery Failures**: In a physical chip, the master clock signal takes different amounts of time to travel through the clock distribution tree to different flip-flops. If a reset signal is released right as a delayed clock edge arrives at Flip-Flop B, Flip-Flop B enters **Metastability** and misses the reset release, while Flip-Flop A exits reset correctly. The state machine desynchronizes and crashes. Functional RTL simulation assumes all flip-flops receive clock and reset at the exact same instant, missing the power-on failure!

To catch these real-world physical timing hazards, race conditions, and clock-tree glitches before spending millions of dollars fabricating a silicon wafer, hardware verification engineers execute **Gate-Level Simulation (GLS)**.

Gate-Level Simulation takes the post-synthesis structural netlist (`.v`) and back-annotates exact, physical nanosecond delays into every standard cell gate using a **Standard Delay Format (SDF)** file (`.sdf`) via the SystemVerilog system task `$sdf_annotate()`.

However, running Gate-Level Simulation introduces two severe simulation hazards:
* **Reset Initialization Warning Storms**: Spurious setup/hold/recovery timing warnings fired by standard cell models during power-on reset before clock trees stabilize.
* **Zero-Delay / Delta-Cycle Oscillation Loops**: Un-initialized feedback loops in the gate netlist that cause the simulator to crash at time $t = 0\text{ ns}$.

By mastering Gate-Level Simulation, SDF back-annotation, reset warning suppression, and netlist initialization, we verify that our hardware will execute deterministically on physical silicon.


### Method 2: The Physical Scale Model in a High-Speed Wind Tunnel (GLS + SDF)
Now, the engineers build a physical scale model of the aircraft, place it inside a high-speed wind tunnel, and blast $600\text{-mph}$ air streams across the wings while shaking the platform with hydraulic actuators (**Gate-Level Simulation with SDF Delays**).

During the wind tunnel test:
1. **Un-predicted Vibration (Gate Glitches)**: At $550\text{ mph}$, the air flowing over the left wingtip creates an un-expected vortex ($0.2\text{-ns}$ gate glitch). The wingtip begins to vibrate violently. The engineers modify the wing shape to eliminate the vortex before manufacturing the full-sized aircraft.
2. **Thermal Expansion Strain (Clock Tree Skew)**: The heat from the jet engine expands the titanium frame by 2 millimeters, causing the landing gear latch to jam ($t_{\text{skew}}$ timing violation). The engineers adjust the latch tolerance to accommodate the thermal expansion.

This physical wind tunnel test is the exact physical analogue of **Gate-Level Simulation with SDF Back-Annotation**:
* The scale model is the **Synthesized Gate Netlist (`.v`)**.
* The $600\text{-mph}$ wind stream is the **SDF Physical Delay File (`.sdf`)**.
* Discovering wingtip vibration is **Detecting Gate Glitches and Setup/Hold Timing Violations BEFORE Fabricating Silicon!**


### Primitive 1: The Synthesized Gate-Level Netlist (`.v`)

A **Gate-Level Netlist** is a structural Verilog file emitted by a logic synthesis tool (such as Synopsys Design Compiler, Cadence Genus, or Yosys) or a physical place-and-route tool.

Unlike a high-level SystemVerilog RTL source file, a gate-level netlist contains **ZERO behavioral constructs**:
* No `always_comb` or `always_ff` blocks.
* No `if-else` decision trees or `case` statements.
* No mathematical operators (`+`, `-`, `*`, `/`).
* No SystemVerilog structs, enums, or interfaces.

Instead, a gate-level netlist consists **EXCLUSIVELY of physical standard cell instantiations** from the target foundry's cell library, connected together by 1-bit `wire` declarations.

```verilog
// STRUCTURAL GATE-LEVEL NETLIST (Output of Logic Synthesis)
module TelemetryProcessor (
    clk, reset_n, data_in, data_out
);
    input  clk;
    input  reset_n;
    input  [7:0] data_in;
    output [7:0] data_out;

    // Internal 1-bit interconnect wires
    wire net_g1_out, net_g2_out, clk_buffered;

    // Standard Cell Instantiations from Foundry Library
    sky130_fd_sc_hd__clkbuf_1 u_clk_buf (
        .A (clk),
        .X (clk_buffered)
    );

    sky130_fd_sc_hd__nand2_1 u_gate_1 (
        .A (data_in[0]),
        .B (data_in[1]),
        .Y (net_g1_out)
    );

    sky130_fd_sc_hd__dff_1 u_reg_0 (
        .CLK (clk_buffered),
        .D   (net_g1_out),
        .Q   (data_out[0])
    );

endmodule
```

Notice that each standard cell (e.g., `sky130_fd_sc_hd__dff_1`) is an instance of a behavioral simulation model provided by the semiconductor foundry.


### Primitive 3: Simulator Back-Annotation via `$sdf_annotate()`

When a software simulator starts up, standard cell behavioral models contain default or zero delays.

To overwrite those default delays with exact physical nanosecond delays from the SDF file, the testbench calls the SystemVerilog system task **`$sdf_annotate()`**:

```systemverilog
// SYSTEMVERILOG SDF BACK-ANNOTATION SYSTEM TASK
$sdf_annotate(
    "sdf_file_path",     // Path to the .sdf text file
    [module_instance],   // Target instance in testbench (e.g., u_dut)
    ["config_log_file"], // Path to output annotation log file
    ["sdf_corner"],      // Corner selection: "MAXIMUM", "MINIMUM", "TYPICAL"
    ["scale_factors"],   // Scale factor multiplier (default "1.0:1.0:1.0")
    ["setup_hold_option"]// "FROM_MTBF", "REAL_IO"
);
```

#### Complete Testbench Back-Annotation Example:

```systemverilog
module tb_GateLevelSimulation;

    // Testbench signals
    logic clk;
    logic reset_n;
    logic [7:0] data_in;
    logic [7:0] data_out;

    // Instantiate Gate-Level Netlist DUT
    TelemetryProcessor u_dut (
        .clk      (clk),
        .reset_n  (reset_n),
        .data_in  (data_in),
        .data_out (data_out)
    );

    // BACK-ANNOTATE SDF DELAYS AT SIMULATION STARTUP
    initial begin
        $display("[GLS INFO] Annotating SDF physical delays into Gate-Level Netlist...");
        
        // Annotate worst-case MAX delays for Setup Timing Analysis
        $sdf_annotate(
            "TelemetryProcessor_max.sdf", // SDF file
            u_dut,                        // Target DUT instance
            "sdf_annotation.log",         // Annotation log
            "MAXIMUM"                     // Select MAX column (Worst-case)
        );
        
        $display("[GLS INFO] SDF Annotation Complete! Physical delays active.");
    end

endmodule
```

```text
SDF BACK-ANNOTATION SIMULATION DATAFLOW

 Gate-Level Netlist (.v)  ──┐
 Target Cell Library (.v) ──┼──► [ Simulator Engine ] ◄── $sdf_annotate()
 Physical Delays (.sdf)   ──┘    (Overwrites zero delays with SDF nanoseconds!)
```

When `$sdf_annotate()` executes at $t = 0\text{ ns}$:
1. The simulator parses `TelemetryProcessor_max.sdf`.
2. It matches instance path `u_dut/u_reg_0_` in the netlist with `(INSTANCE u_top/u_reg/u_reg_0_)` in the SDF file.
3. It overwrites the internal delay parameters of `sky130_fd_sc_hd__dff_1` so that $t_{\text{C2Q}} = 0.420\text{ ns}$, $t_{\text{routing}} = 1.850\text{ ns}$, and $t_{\text{su}} = 0.300\text{ ns}$.

Now, every signal transition in the simulation executes with exact, physical nanosecond delays!


### Hazard 1: Reset Initialization Warning Storms

In standard cell libraries, flip-flop simulation models contain internal timing check tasks (`$setup`, `$hold`, `$recovery`, `$removal`) that verify timing compliance during simulation.

Consider what happens during the first $50\text{ nanoseconds}$ of a Gate-Level Simulation when the circuit powers up:

1. At $t = 0\text{ ns}$, the master clock generator starts toggling.
2. The asynchronous reset line (`reset_n`) transitions from $0 \to 1$ to release the chip from reset.
3. Because the clock tree has physical propagation delays ($t_{\text{clk\_tree}}$), different flip-flops across the netlist receive the reset release signal at slightly different nanoseconds.
4. Input data pins ($D$) on uninitialized flip-flops hold unknown `X` states.

```text
UN-SUPPRESSED GLS LOG (50,000 Spurious Reset Warnings!)

 [12.35 ns] $recovery violation on u_top/u_fsm/state_reg[0] (CLR vs CLK)
 [12.35 ns] $hold violation on u_top/u_fsm/state_reg[1] (D vs CLK)
 [12.35 ns] $setup violation on u_top/u_fsm/state_reg[2] (D vs CLK) ...
 (Console log flooded with 50,000 non-fatal warnings during power-on!)
```

The standard cell models detect that $D$ sat at `X` or that `reset_n` transitioned near a clock edge during initial power-on.

The standard cell models immediately fire **tens of thousands of timing violation warnings**!

#### Why Reset Warning Storms Must Be Suppressed:
These initial power-on warnings are **spurious non-fatal artifacts**. During the power-on reset phase, the chip is *supposed* to be in reset; system state is not expected to be valid until *after* reset release completes!

However, flooding the console log with 50,000 false reset warnings makes it impossible for verification engineers to spot *real* timing violations that occur later during normal operation.


### Hazard 2: Zero-Delay / Delta-Cycle Oscillation Loops at Netlist Startup

A second major Gate-Level Simulation hazard occurs at time $t = 0\text{ ns}$ before SDF back-annotation takes effect.

In a synthesized netlist, certain physical standard cell topologies contain **combinational feedback loops**—such as cross-coupled NOR gates in an asynchronous latch, or feedback inverters in a clock-gating cell.

At time $t = 0\text{ ns}$, before SDF delays are loaded, all gates evaluate with zero delay (`#0`).

If Gate A and Gate B form a feedback loop and start up holding un-initialized `X` states:

$$\text{Gate A} = \sim \text{Gate B} \quad \text{and} \quad \text{Gate B} = \sim \text{Gate A}$$

```text
ZERO-DELAY DELTA-CYCLE OSCILLATION LOOP AT t = 0.00 ns

 Un-initialized Gate A (X) ──► [ NOT Gate 1 ] ──► Gate B (~X = X)
                                                     │
                                                     ▼
 Un-initialized Gate B (X) ◄── [ NOT Gate 2 ] ◄──────┘
 (Endless delta-cycle loop at t = 0.00 ns -> SIMULATOR CRASH!)
```

The simulator engine evaluates Gate A ($X \to \overline{X}$), which immediately triggers Gate B ($X \to \overline{X}$), which immediately triggers Gate A!

Because both gates evaluate in zero physical time (`#0`), the simulator loops through **10,000 delta cycles at physical time $t = 0.00\text{ ns}$**, and crashes with a fatal error:

```text
Fatal Error: Iteration limit reached (10000 delta cycles) at time 0.00 ns.
             Possible zero-delay oscillation loop between u_dut/u_gate1 and u_dut/u_gate2.
```


## Engineering Reality: GLS Performance Overhead and Corner Selection

In commercial semiconductor engineering, executing Gate-Level Simulation involves practical performance trade-offs that verification managers must budget for.

### 1. The GLS Performance Penalty

Gate-Level Simulation runs **$10\times \text{ to } 100\times$ SLOWER** than high-level SystemVerilog RTL simulation!

Why?
* **RTL Simulation**: A 32-bit addition `y = a + b` is executed by the workstation CPU in a **single 64-bit host machine instruction**!
* **Gate-Level Simulation**: A 32-bit adder consists of 200 individual standard cells (`sky130_NOR2`, `sky130_NAND2`). The simulator must evaluate 200 separate gate events, schedule 200 SDF delays in the event queue, and trace 200 1-bit wire toggles!

```text
SIMULATION SPEED COMPARISON

 RTL Simulation  : [ 32-Bit Addition ] ──► Executed in 1 CPU Instruction!  (100,000 cycles/sec)
 Gate-Level Sim  : [ 200 Standard Cells]──► Executed in 200 Event Passes!   (1,000 cycles/sec)
                   (100x SLOWER EXECUTION SPEED!)
```

#### Industrial GLS Verification Strategy:
Because GLS is slow, hardware teams do NOT run full 10-million-iteration regression suites at the gate level!

* **RTL Level**: Run 10,000,000 constrained random test vectors to verify $100\%$ functional logic coverage.
* **Gate Level (GLS)**: Run a targeted subset of **1,000 critical test vectors** (such as power-on reset, bootloader sequence, and maximum burst transfers) with SDF back-annotation to verify physical timing, clock tree sanity, and reset release.


## Solved Industrial Engineering Exercise: Gate-Level Simulation Audit with SDF Back-Annotation

To consolidate your complete mastery of Gate-Level Simulation, SDF back-annotation, `$sdf_annotate()`, reset warning suppression, and physical setup/hold hazard detection, we will now walk through a complete, step-by-step digital engineering problem.


### Step-by-Step Derivation

#### Step 1: Write the Complete Gate-Level Testbench Module

We construct `tb_TelemetryProcessorGls` incorporating SDF annotation, dynamic warning suppression, and test vector injection:

```systemverilog
`default_nettype none

// GATE-LEVEL TESTBENCH WITH SDF BACK-ANNOTATION & RESET SUPPRESSION
module tb_TelemetryProcessorGls;

    // Testbench Control Signals
    logic        clk;
    logic        reset_n;
    logic [15:0] data_in;
    logic [15:0] data_out;

    // Verification Metrics
    int unsigned error_count = 0;

    // Clock Generator (100 MHz Default Period = 10.0 ns)
    real clock_period = 10.000;
    
    initial clk = 1'b0;
    always #(clock_period / 2.0) clk = ~clk;

    // Instantiation of Synthesized Gate-Level Netlist DUT
    TelemetryProcessor u_dut (
        .clk      (clk),
        .reset_n  (reset_n),
        .data_in  (data_in),
        .data_out (data_out)
    );

    // -----------------------------------------------------------------
    // 1. SDF BACK-ANNOTATION AT SIMULATION STARTUP (t = 0 ns)
    // -----------------------------------------------------------------
    initial begin
        $display("[GLS INFO] Time %0t | Starting SDF Back-Annotation...", $time);
        
        // Annotate worst-case MAX delays into u_dut instance
        $sdf_annotate(
            "TelemetryProcessor_max.sdf", // Path to SDF file
            u_dut,                        // Target netlist instance
            "sdf_annotation.log",         // Annotation log output
            "MAXIMUM"                     // Select MAX delay corner
        );
        
        $display("[GLS INFO] Time %0t | SDF Annotation Complete!", $time);
    end

    // -----------------------------------------------------------------
    // 2. DYNAMIC TIMING WARNING SUPPRESSION & RESET CONTROL
    // -----------------------------------------------------------------
    initial begin
        // Initialize Inputs
        reset_n = 1'b0; // Assert Active-Low Reset
        data_in = 16'h0000;

        // SUPPRESS SPURIOUS RESET TIMING CHECK WARNINGS
        $disable_warnings("timing", u_dut);
        $display("[GLS INFO] Time %0t | Timing checks DISABLED for power-on reset.", $time);

        // Hold reset low for 100 ns
        #100;
        
        // Release Reset
        reset_n = 1'b1;
        $display("[GLS INFO] Time %0t | Power-on Reset Released.", $time);

        // Wait 20 ns for clock tree and flip-flops to settle
        #20;

        // RE-ENABLE TIMING CHECK WARNINGS FOR OPERATIONAL AUDIT
        $enable_warnings("timing", u_dut);
        $display("[GLS INFO] Time %0t | Timing checks RE-ENABLED. Physical STA active.", $time);
    end

    // -----------------------------------------------------------------
    // 3. STIMULUS INJECTION & TIMING VIOLATION TEST
    // -----------------------------------------------------------------
    initial begin
        // Wait for reset release and warning re-enable
        #130;

        // TEST 1: Normal Operational Mode (100 MHz, Period = 10.0 ns)
        $display("\n--- TEST 1: Normal Operational Mode (100 MHz) ---");
        @(posedge clk);
        data_in <= 16'hA55A;
        @(posedge clk);
        data_in <= 16'h1234;
        repeat (3) @(posedge clk);

        if (data_out === 16'h1234) begin
            $display("[PASS] Time %0t | Test 1 Normal Mode Executed Cleanly! data_out = %h", 
                     $time, data_out);
        end else begin
            $error("[FAIL] Time %0t | Test 1 Unexpected Output! data_out = %h", 
                   $time, data_out);
        end

        // TEST 2: Inject Over-Speed Clock Pulse (Force $setup Violation!)
        $display("\n--- TEST 2: Injecting Over-Speed Clock Pulse (666 MHz, T = 1.5 ns) ---");
        @(posedge clk);
        data_in <= 16'hFFFF;
        
        // Sudden clock frequency jump to 666 MHz (T = 1.5 ns)
        // Path delay is ~3.2 ns -> GUARANTEED SETUP VIOLATION!
        clock_period = 1.500; 

        #10; // Run for 10 ns at over-speed clock

        // Verify that standard cell model detected setup violation and set data_out = X
        if ($isunknown(data_out)) begin
            $display("[PASS] Time %0t | Standard Cell Model Correctly Detected $setup Violation!", $time);
            $display("       Output data_out corrupted to 'X' as physically expected: %h", data_out);
        end else begin
            $error("[FAIL] Time %0t | Standard Cell Model FAILED to detect $setup Violation!", $time);
        end

        // Return clock to safe frequency and finish
        clock_period = 10.000;
        #50;

        $display("\n==================================================");
        $display("     GATE-LEVEL SIMULATION AUDIT COMPLETE         ");
        $display("==================================================");
        $finish;
    end

endmodule

`default_nettype wire
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Gate-Level Simulation (GLS)**: The post-synthesis / post-layout verification methodology that simulates a structural gate netlist (`.v`) containing standard cell primitives to detect real-world physical gate delays, interconnect wire skews, and timing hazards un-modeled by RTL simulation.
* **Standard Delay Format (SDF) Back-Annotation**: The IEEE 1497 standard process (`$sdf_annotate()`) where an SDC-derived physical delay file (`.sdf`) overwrites default simulation delays in standard cell models with exact nanosecond cell propagation delays (`IOPATH`), wire delays (`INTERCONNECT`), and timing check apertures (`SETUP`, `HOLD`, `RECOVERY`, `REMOVAL`).
* **Reset Timing Warning Suppression**: The verification technique that disables simulator timing check tasks (`$disable_warnings` / `+no_notifier`) during power-on reset to eliminate spurious, non-fatal setup/hold warning storms before clock trees stabilize.
* **Zero-Delay Delta-Cycle Loop Suppression**: The netlist initialization method that pre-charges registers (`+vcs+initreg`) and applies SDF back-annotation at time $t = 0\text{ ns}$ to prevent un-initialized feedback loops from triggering infinite delta-cycle crashes.
