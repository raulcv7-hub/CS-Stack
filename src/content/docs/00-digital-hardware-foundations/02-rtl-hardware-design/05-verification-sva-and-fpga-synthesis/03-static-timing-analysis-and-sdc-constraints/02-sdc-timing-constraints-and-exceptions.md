---
title: "Synopsys Design Constraints (SDC) Architecture and Timing Exception Mechanics"
---

# Synopsys Design Constraints (SDC) Architecture and Timing Exception Mechanics

When an Electronic Design Automation (EDA) tool—such as a logic synthesis compiler or a physical place-and-route engine—ingests a SystemVerilog Register-Transfer Level (RTL) module, it faces a fundamental physical information void.

The SystemVerilog source code describes the functional behavior of hardware gates and registers. However, SystemVerilog syntax contains zero information about time, physical distances, or circuit board environments. 

The RTL source code does not state whether a clock input pin runs at a slow $10\text{ MHz}$ or a high-speed $1.0\text{ GHz}$. It does not state whether an incoming data wire comes from an external memory chip located $5\text{ nanoseconds}$ away on a printed circuit board (PCB), or whether two clock pins on the chip originate from independent, un-synchronized crystal oscillators.

```text
 RTL Source Code (.sv) ──► [ Synthesis Compiler ] ──► NO TIME INFORMATION!
                           (Does not know if clock is 10 MHz or 1 GHz!)
                                       │
                                       ├───────────────────────────────┐
                                       ▼                               ▼
                          Over-Synthesizes Everything    Fails External Board Timing
                          (Huge Area & Power Wastage)   (Input Data Arrives Late)
```

Without explicit timing guidelines, the EDA compilation tool operates in the dark, leading to two severe physical failures:

1. **Over-Synthesis and Power/Area Wastage**: If the compiler assumes a worst-case $1.0\text{-GHz}$ clock target for a simple $10\text{-MHz}$ peripheral interface, it builds the circuit using massive, high-drive transistors and parallel carry-lookahead trees. The resulting silicon chip is ten times larger and consumes ten times more power than necessary.
2. **External Board Timing Violations**: If the compiler assumes that data arrives at a chip pin instantaneously, but the external PCB trace adds $4.0\text{ nanoseconds}$ of propagation delay, data arrives late at the internal registers. The physical chip suffers setup time violations and fails when soldered onto the circuit board.

Furthermore, across Clock Domain Crossing (CDC) boundaries or multi-cycle arithmetic paths, Static Timing Analysis (STA) engines attempt to calculate setup and hold checks between un-synchronized or multi-cycle clock edges, generating thousands of **false timing violations** that block build completion.

To guide synthesis and STA tools with 100% precision, hardware engineers provide a standardized configuration file written in **Synopsys Design Constraints (SDC)** format (or Xilinx Design Constraints `XDC` format for FPGAs).

By defining primary clocks (`create_clock`), external board boundary delays (`set_input_delay`, `set_output_delay`), and **Timing Exceptions** (`set_clock_groups`, `set_max_delay -datapath_only`, `set_false_path`, `set_multicycle_path`), we ensure that EDA compilers build optimal, high-speed physical silicon that operates flawlessly on real circuit boards.


### Part A: The Highway Speed Limit Signpost (Primary SDC Constraints)

Imagine a construction firm building a 50-mile asphalt highway between two cities.

```text
 Un-Marked Country Road (No SDC Constraints)
   Driver doesn't know speed limit ──► Drives 15 mph (Too Slow) or 120 mph (Crashes)

 Speed Limit Signpost Posted (SDC Constraint: create_clock -period 2.5)
   Driver maintains exact 60 mph speed ──► Arrives safely on time!
```

Consider how cars drive on this road under two different scenarios:

#### Scenario 1: The Un-Marked Country Road (No SDC Constraints)
The road has zero speed limit signs. Drivers entering the road have no idea how fast they are supposed to drive.
* Driver A drives at 15 mph, taking 3.5 hours to complete the trip and causing massive traffic jams.
* Driver B drives at 120 mph, loses control on a sharp curve, and crashes.

This un-marked road is the exact physical analogue of **compiling RTL code without SDC constraints**. The synthesis compiler does not know the target speed, leading to un-predictable physical hardware.

#### Scenario 2: The Posted Speed Limit Signpost (SDC Clock Constraints)
The highway department posts clear, legal speed limit signposts every 5 miles: **SPEED LIMIT 60 MPH** (`create_clock -period 2.500`).

* All drivers maintain an exact 60 mph pace.
* Cars arrive at the destination safely, predictably, and on schedule.

This posted speed limit signpost is the exact physical analogue of **`create_clock` SDC Constraints**.


## Mechanics of Primary SDC Boundary Constraints

To master SDC authoring, we must dissect the formal Command Language (TCL) syntax, physical equations, and boundary models of primary SDC constraints.

SDC files are written in **Tool Command Language (TCL)**, the universal scripting language supported by all commercial ASIC and FPGA tools (Synopsys Design Compiler, Cadence Genus, AMD Vivado, Intel Quartus).


### Primitive 2: External Input Delay Constraints (`set_input_delay`)

An input pin on a microchip does not receive data instantaneously at $t = 0\text{ ns}$. In a physical system, input data is launched by an **external chip** on the circuit board and travels down a PCB copper trace before entering the target chip's input pin.

The **`set_input_delay`** command models the physical propagation delay ($t_{\text{ext\_in}}$) that elapses on the circuit board *outside* the chip before the data reaches the input pin.

```text
 EXTERNAL BOARD TIMING MODEL (set_input_delay)

 External Chip                     Target Chip Pin               Internal Register
 [ Launch FF_ext ] ─── t_ext_in ──► [ Input Port ] ─── t_internal ──► [ Capture FF_int ]
 ◄─────────────────────────────── Total T_clk ───────────────────────────────►
```

```tcl
# SDC COMMAND: External board delay for input port 'sensor_data' is 2.2 ns
set_input_delay -clock clk_main -max 2.200 [get_ports sensor_data]
set_input_delay -clock clk_main -min 0.800 [get_ports sensor_data]
```

Where:
* `-clock clk_main`: Identifies the reference clock driving the external launch register.
* `-max 2.200`: Specifies the maximum external board delay $t_{\text{ext\_in,max}} = 2.200\text{ ns}$ (used for **Setup Analysis**).
* `-min 0.800`: Specifies the minimum external board delay $t_{\text{ext\_in,min}} = 0.800\text{ ns}$ (used for **Hold Analysis**).

#### Mathematical Impact on Internal Setup Timing Slack:

When `set_input_delay` is applied, the chip's internal setup required time is reduced by the external board delay:

$$T_{\text{internal\_setup\_budget}} = T_{\text{clk}} - t_{\text{ext\_in,max}} - t_{\text{su\_internal}}$$

For $T_{\text{clk}} = 5.000\text{ ns}$, $t_{\text{ext\_in,max}} = 2.200\text{ ns}$, and $t_{\text{su\_internal}} = 0.300\text{ ns}$:

$$T_{\text{internal\_setup\_budget}} = 5.000\text{ ns} - 2.200\text{ ns} - 0.300\text{ ns} = \mathbf{2.500 \text{ ns}}$$

Look at this calculation:
The chip's internal combinational logic between the input pin and the first internal register has **only $2.500\text{ nanoseconds}$ left** to process the incoming signal! 

If you fail to specify `set_input_delay`, the synthesis tool assumes $t_{\text{ext\_in}} = 0\text{ ns}$, allocating all $4.700\text{ ns}$ to internal logic. On the real circuit board, the input data arrives $2.2\text{ ns}$ late, causing setup violations and chip failure!


## SDC Timing Exceptions and Clock Domain Crossing (CDC) Rules

In complex System-on-Chip (SoC) architectures, not all data paths operate on a single clock cycle or a single clock domain.

When Static Timing Analysis (STA) encounters asynchronous clock domain crossings or multi-cycle arithmetic blocks, applying standard 1-cycle timing checks generates false timing errors.

To override standard timing checks on special hardware paths, we write **SDC Timing Exceptions**.


### Primitive 5: The Danger of `set_false_path` vs. `set_max_delay -datapath_only` on CDC Paths

When hardware designers want to disable timing checks on a single Clock Domain Crossing wire (such as a 1-bit control pulse entering a 2-FF synchronizer), many legacy engineers write:

```tcl
# DANGEROUS LEGACY SDC COMMAND (DO NOT USE FOR CDC DATAPATHS!)
set_false_path -from [get_pins u_src/q_reg/C] -to [get_pins u_sync/ff1_reg/D]
```

#### Why `set_false_path` is DANGEROUS on CDC Paths:
The `set_false_path` command tells the place-and-route tool: **"This path does not exist. Turn OFF all timing checks, all delay limits, and all placement constraints on this wire!"**

Look at what the physical place-and-route tool does when it sees `set_false_path`:
* It sees zero constraints on the wire between `u_src` and `u_sync`.
* To solve floorplan congestion for other parts of the chip, it places `u_src` on the far left side of the chip die, and places `u_sync` on the far right side of the chip die!
* The interconnect wire stretching across the chip die adds a **$6.0\text{-nanosecond}$ copper wire routing delay ($t_{\text{routing}} = 6.0\text{ ns}$)**!

Now recall our 2-FF synchronizer formula for metastable resolution time ($t_{\text{met}}$):

$$t_{\text{met}} = T_{\text{clk}} - t_{\text{C2Q}} - t_{\text{routing}} - t_{\text{su}}$$

Subtracting $6.0\text{ ns}$ of wire delay ($t_{\text{routing}} = 6.0\text{ ns}$) makes $t_{\text{met}}$ **NEGATIVE**!

The 2-FF synchronizer fails to resolve metastability before the second clock edge, **destroying the Mean Time Between Failures (MTBF)** and causing the chip to crash in the field!

```text
SET_FALSE_PATH VS SET_MAX_DELAY -DATAPATH_ONLY

 Using set_false_path (NO WIRE ROUTING LIMIT!):
 [ Launch FF ] ────────────── 6.0 ns Long Copper Trace ──────────────► [ 2-FF Sync ]
               (Destroys MTBF by subtracting 6.0 ns from t_met!)

 Using set_max_delay 2.0 -datapath_only (STRICT WIRE ROUTING LIMIT!):
 [ Launch FF ] ── 0.5 ns Wire ──► [ 2-FF Sync ]
               (Forces close physical placement! Preserves t_met & MTBF!)
```


### Primitive 6: Multicycle Paths (`set_multicycle_path`)

In complex arithmetic hardware (such as a 32-bit floating-point divider, an iterative CORDIC rotator, or a multi-stage matrix multiplier), a combinational calculation path may require **more than one clock cycle** to complete its output.

Consider a 32-bit floating-point divider whose combinational logic path delay is $t_{\text{logic}} = 7.0\text{ nanoseconds}$. 

The system operates at a clock period $T_{\text{clk}} = 3.0\text{ nanoseconds}$ ($333\text{ MHz}$).

If no timing exception is written:
1. The STA engine assumes the divider must finish in **1 clock cycle ($3.0\text{ ns}$)**.
2. It calculates Setup Slack: $T_{\text{setup\_slack}} = 3.0\text{ ns} - 7.0\text{ ns} = \mathbf{-4.0 \text{ ns}}$ (Massive Timing Failure!).
3. The synthesis tool attempts to fix this "failure" by expanding the divider with huge, high-drive transistors, wasting thousands of logic gates.

However, the hardware architecture was designed to hold the divider inputs constant for **3 full clock cycles ($N = 3$)**, giving the divider $3 \times 3.0\text{ ns} = 9.0\text{ nanoseconds}$ to complete its calculation!

To inform the synthesis and STA tools that this path is allocated 3 clock cycles, we write a **Multicycle Path Constraint (`set_multicycle_path`)**:

```tcl
# MULTICYCLE PATH SDC CONSTRAINTS (N = 3 Clock Cycles)

# 1. Setup Constraint: Allocate 3 clock cycles (3 * T_clk = 9.0 ns) for Setup Check
set_multicycle_path 3 -setup \
    -from [get_pins u_fpu/mult_stage_reg[*]/C] \
    -to   [get_pins u_fpu/result_reg[*]/D]

# 2. Hold Constraint: Move Hold Check boundary back to Cycle N-1 = 2
set_multicycle_path 2 -hold \
    -from [get_pins u_fpu/mult_stage_reg[*]/C] \
    -to   [get_pins u_fpu/result_reg[*]/D]
```

```text
MULTICYCLE PATH TIMING APERTURE (N = 3 Cycles)

 Launch Clock Edge (t = 0.0 ns)
               │
               ├───────────────────────────────────► Data Arrives at t = 7.0 ns
               │
 Standard Setup Check (t = 3.0 ns) ──► (WOULD FAIL HERE WITHOUT MULTICYCLE!)
                               │
 Multicycle Setup Check (t = 9.0 ns) ──────────────► Required Time (3 * T_clk)
                                                     T_slack = 9.0 - 7.0 = +2.0 ns (PASS!)
```

#### Why BOTH Setup and Hold Multicycle Commands Are Mandatory:
When you write `set_multicycle_path 3 -setup`, the STA engine moves the **Setup Check** from Clock Edge 1 to Clock Edge 3 ($3 \cdot T_{\text{clk}}$).

By default, the STA engine automatically moves the **Hold Check** to one cycle prior to the new setup edge (Clock Edge 2, at $2 \cdot T_{\text{clk}}$)!

If you do not specify `set_multicycle_path 2 -hold`, the STA engine will check hold time against Clock Edge 2 ($6.0\text{ ns}$ later), calculating a **false hold violation**!

Writing `set_multicycle_path 2 -hold` moves the Hold Check back to Clock Edge 0 ($0.0\text{ ns}$), restoring correct hold analysis.

$$\text{Hold Multicycle Value} = \text{Setup Multicycle Value} - 1$$


### 2. SDC Rule Precedence and Order Dependencies

SDC files are evaluated sequentially from top to bottom. If two SDC commands conflict, the STA engine resolves the conflict using strict precedence rules:

```text
SDC CONSTRAINT PRECEDENCE HIERARCHY

 1. set_clock_groups -asynchronous  (Highest Priority: Overrides everything!)
       ▲
       │
 2. set_false_path                  (Overrides max_delay and standard clocks)
       ▲
       │
 3. set_max_delay / set_min_delay   (Overrides standard clock periods)
       ▲
       │
 4. create_clock / create_generated_clock (Base Priority)
```

#### Golden Rules of SDC File Organization:
1. **Define Clocks First**: Always place `create_clock` and `create_generated_clock` commands at the very top of your SDC file.
2. **Define Boundary Delays Second**: Place `set_input_delay` and `set_output_delay` commands after clock definitions.
3. **Define Timing Exceptions Last**: Place `set_clock_groups`, `set_max_delay -datapath_only`, and `set_multicycle_path` commands at the bottom of the file so they override default clock checks cleanly.


### Scenario and Parameters

An avionics defense firm is authoring the production SDC constraints file (`satellite_top.sdc`) for a military satellite's flight computer FPGA (`SatelliteTop`).

```text
SATELLITE TOP-LEVEL SDC CONSTRAINT BOUNDARIES

 External Radar Sensor                  Satellite FPGA Top Level                External Motor Actuator
 [ External Radar Chip ] ──► t_ext_in ──► [ Input: sensor_data[7:0] ]             │
 (Driven by clk_fast)                     │                                      │
                                          ▼                                      │
 Primary Oscillator ───────────────► [ Port: clk_fast (200 MHz) ]                │
 Secondary Oscillator ─────────────► [ Port: clk_slow (50 MHz)  ]                │
                                          │                                      │
                                          ├─► [ 3-Cycle Floating-Point FPU ]     │
                                          │                                      │
                                          ├─► [ CDC 2-FF Sync irq_pulse ]        │
                                          │                                      │
                                          ▼                                      ▼
                                     [ Output: actuator_out[3:0] ] ──► t_ext_out ──► [ External Motor ]
```

#### Subsystem Clock and Interface Specifications:

1. **Primary Clock (`clk_fast`)**: Driven by a $200.0\text{-MHz}$ onboard oscillator ($T_{\text{fast}} = 5.000\text{ ns}$, $50\%$ duty cycle) entering top-level port `clk_fast_pin`.
2. **Secondary Clock (`clk_slow`)**: Driven by an independent $50.0\text{-MHz}$ standby oscillator ($T_{\text{slow}} = 20.000\text{ ns}$, $50\%$ duty cycle) entering top-level port `clk_slow_pin`.
3. **Input Interface (`sensor_data[7:0]`)**: Driven on `clk_fast` by an external radar sensor chip on the circuit board.
   * Maximum external board delay: $t_{\text{ext\_in,max}} = 2.200\text{ ns}$.
   * Minimum external board delay: $t_{\text{ext\_in,min}} = 0.800\text{ ns}$.
4. **Output Interface (`actuator_out[3:0]`)**: Drives an external motor controller chip on `clk_fast`.
   * Maximum external board trace delay + external setup time: $t_{\text{ext\_out,max}} = 1.800\text{ ns}$.
   * Minimum external board trace delay - external hold time: $t_{\text{ext\_out,min}} = 0.500\text{ ns}$.
5. **Multi-Cycle Arithmetic Block (`u_fpu`)**: An internal floating-point multiplier requires **3 full clock cycles ($N = 3$)** on `clk_fast` to complete its calculation from register `u_fpu/a_reg[*]` to `u_fpu/res_reg[*]`.
6. **Clock Domain Crossing (`irq_pulse`)**: Single-bit control signal originating from register `u_irq/q_reg` on `clk_fast` crossing to 2-FF synchronizer `u_slow_sync/ff1_reg` on `clk_slow`.
   * MUST enforce a maximum wire routing delay limit of $2.000\text{ ns}$ without using dangerous `set_false_path`.

#### Internal Flip-Flop Library Parameters:
* Internal Flip-Flop Setup Time: $t_{\text{su}} = 0.300\text{ ns}$.
* Internal Flip-Flop Clock-to-Q Delay: $t_{\text{C2Q,max}} = 0.400\text{ ns}$.

#### Your Objective

1. Write the complete, production-grade SDC constraints file (`satellite_top.sdc`) in TCL format.
2. Calculate the remaining internal setup budget $T_{\text{internal\_setup}}$ for input port `sensor_data[7:0]`.
3. Calculate the remaining internal output delay budget $T_{\text{internal\_output}}$ for output port `actuator_out[3:0]`.
4. Calculate the multicycle setup time budget $T_{\text{multicycle\_setup}}$ allocated to the floating-point unit `u_fpu`.
5. Prove why `set_max_delay 2.000 -datapath_only` protects the CDC MTBF compared to `set_false_path`.


#### Step 2: Calculate Internal Setup Budget for Input Port `sensor_data`

Given:
* $T_{\text{fast}} = 5.000\text{ ns}$.
* External Board Delay $t_{\text{ext\_in,max}} = 2.200\text{ ns}$.
* Internal Flip-Flop Setup Time $t_{\text{su}} = 0.300\text{ ns}$.

$$\text{Internal Setup Budget } T_{\text{internal\_setup}} = T_{\text{fast}} - t_{\text{ext\_in,max}} - t_{\text{su}}$$

$$T_{\text{internal\_setup}} = 5.000\text{ ns} - 2.200\text{ ns} - 0.300\text{ ns} = \mathbf{2.500 \text{ ns}}$$

##### Analysis:
The internal combinational logic between chip input port `sensor_data` and the first internal register has **$2.500\text{ nanoseconds}$** to compute its logic.


#### Step 4: Calculate Multicycle Setup Time Budget for `u_fpu`

Given:
* Primary Clock Period $T_{\text{fast}} = 5.000\text{ ns}$.
* Multicycle Setup Multiplier $N = 3$.
* Internal Flip-Flop Setup Time $t_{\text{su}} = 0.300\text{ ns}$.

$$T_{\text{multicycle\_setup\_budget}} = (N \cdot T_{\text{fast}}) - t_{\text{su}}$$

$$T_{\text{multicycle\_setup\_budget}} = (3 \times 5.000\text{ ns}) - 0.300\text{ ns} = 15.000\text{ ns} - 0.300\text{ ns} = \mathbf{14.700 \text{ ns}}$$

##### Analysis:
By specifying `set_multicycle_path 3 -setup`, the floating-point multiplier logic has **$14.700\text{ nanoseconds}$** to compute its calculation instead of $4.700\text{ ns}$! 

The synthesis compiler will not over-synthesize the multiplier with massive gates.


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Primary SDC Constraints (`create_clock`, `set_input_delay`, `set_output_delay`)**: The foundational TCL commands that define physical clock periods ($T_{\text{clk}}$) and external board-level propagation delays ($t_{\text{ext}}$), establishing the internal timing budget for synthesis and Static Timing Analysis.
* **Asynchronous Clock Groups (`set_clock_groups -asynchronous`)**: The SDC constraint that isolates independent clock domains, commanding the STA engine to ignore false timing checks across asynchronous CDC boundaries.
* **Datapath-Only Max Delay (`set_max_delay -datapath_only`) vs. `set_false_path`**: The critical CDC constraint distinction where `set_false_path` disables ALL checks (allowing wire delays to stretch indefinitely and destroying MTBF), whereas `set_max_delay -datapath_only` ignores clock alignment checks while enforcing a strict physical wire routing limit ($t_{\text{routing}} \le T_{\text{max}}$) to preserve $t_{\text{met}}$ and MTBF.
* **Multicycle Paths (`set_multicycle_path`)**: The timing exception constraint that allocates $N$ clock cycles ($N \cdot T_{\text{clk}}$) to complex arithmetic logic paths, preventing synthesis engines from over-synthesizing multi-cycle operations.
