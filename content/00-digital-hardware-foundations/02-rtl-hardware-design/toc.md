# RTL Hardware Design — Register-Transfer Level Circuit Synthesis, Event-Driven Simulation, and Clock-Domain Crossing

> **Assumed Prerequisites:** Combinational logic gates, Boolean algebra, flip-flops, registers, and finite state machines (FSMs) from `01. digital-logic-design`.
> **Course Boundary:** Begins at hardware description language abstractions (Verilog/SystemVerilog) for structural and behavioral RTL modeling and ends at event-driven simulation, CDC synchronization, SystemVerilog Assertions (SVA), Static Timing Analysis (STA), and FPGA/ASIC logic synthesis.
> **Explicit Exclusions:** ❌ No analog transistor physics or silicon layout geometry, ❌ No complex multi-stage CPU microarchitecture pipelines (handled in `03. cpu-microarchitecture`), ❌ No high-level software application code (C/C++).

## 01-hdl-syntax-and-structural-modeling — Hardware Description Language Abstractions and Structural RTL Design

### 01-verilog-module-hierarchy-and-data-types — Module Encapsulation, Nets, and Vector Operations
* 01-module-hierarchy-and-port-interfaces — Problem: Drawing complex schematics by hand fails when scaling to multi-module hardware architectures. | Primitives: Module instantiation, port interfaces, explicit port mapping, ref port synthesis limits.
* 02-nets-variables-and-vector-slicing — Problem: Mismatched bit widths and improper net declarations cause silent signal truncation and wire floating. | Primitives: Logic data types, 2-state vs 4-state logic, vector concatenation, bit-slicing, out-of-bounds access mechanics.
* 03-systemverilog-structs-and-interfaces — Problem: Wiring dozens of individual port signals between modules creates unmaintainable, error-prone interconnect code. | Primitives: SystemVerilog interface, modports, packed vs unpacked structs, interface ref ports.
* 04-systemverilog-packages-and-compilation-units — Problem: Duplicating parameter definitions and typedefs across multiple RTL files creates namespace pollution and compilation mismatches. | Primitives: SystemVerilog package, compilation unit scope (`$unit`), local module typedefs, explicit symbol imports.

### 02-procedural-blocks-and-assignment-mechanics — Procedural Execution and Assignment Dualities
* 01-blocking-versus-non-blocking-assignments — Problem: Mixing assignment operators in procedural blocks introduces simulation race conditions and misaligns software execution with physical hardware behavior. | Primitives: Blocking assignments (`=`), non-blocking assignments (`<=`), always_ff, always_comb, always_latch.
* 02-combinational-always-and-latch-inference — Problem: Incomplete conditional branching in procedural logic infers unintended transparent latches that waste area and introduce timing hazards. | Primitives: Always_comb, implicit latch inference, default assignment pattern, unique/unique0 case.
* 03-static-linting-and-rtl-code-quality — Problem: Syntax-valid RTL code can contain hidden synthesis-simulation mismatches, such as declaration initializations (`logic q = 0`) that fail on ASICs. | Primitives: Static linting (Verilator/SpyGlass CDC), ASIC vs FPGA declaration initializations, X-optimism vs X-pessimism, default_nettype none.

## 02-simulation-engine-and-timing-mechanics — Event-Driven Simulation Engines and Delta-Cycle Execution

### 01-stratified-event-queue-and-scheduling — Event Scheduling Regions and Zero-Delay Simulation
* 01-stratified-event-queue-regions — Problem: Simulating concurrent physical hardware on single-threaded CPUs causes non-deterministic execution if event evaluation order is undefined. | Primitives: Stratified event queue, Preponed/Active/NBA/Observed/Postponed regions.
* 02-delta-cycle-execution-and-race-conditions — Problem: Zero-delay signal evaluation across multiple procedural blocks causes race conditions where outputs depend on simulator execution order. | Primitives: Delta cycle, zero-delay race condition, 2-state vs 4-state simulation performance penalty.

### 02-parameterized-rtl-generation — Reusable Structural Generation and IO Drivers
* 01-parameterized-modules-and-generate-blocks — Problem: Hardcoding vector widths and component counts forces complete RTL rewrites whenever word sizes or channel counts change. | Primitives: Parameterized modules, parameter type T, localparam, generate loops, generate if.
* 02-tristate-buffers-and-bidirectional-io-rtl — Problem: Direct connection of multiple output drivers to internal RTL signals causes simulation contention and hardware short circuits. | Primitives: High-impedance modeling (`1'bz`), bidirectional IO (`inout`), I/O pad boundaries.

## 03-rtl-building-blocks-and-fsm-synthesis — Synchronous Storage, FSMs, Protocols, and DSP Arithmetic

### 01-synchronous-storage-and-reset-architecture — Register Arrays, Reset Synchronization, and Power Domains
* 01-synchronous-register-arrays-and-pipelines — Problem: Un-gated register updates overwrite stored data on every clock cycle, requiring data recirculation or clock enable steering. | Primitives: RTL clock enable, pipeline register, register retiming.
* 02-reset-strategies-and-synchronizer-bridges — Problem: De-asserting asynchronous resets during clock edges triggers setup/hold violations that corrupt register pipeline initial states. | Primitives: Asynchronous reset, reset recovery/removal timing, reset synchronizer bridge, Reset Domain Crossing (RDC), warm vs cold reset.
* 03-clock-tree-gating-and-power-domains — Problem: Creating procedural clock dividers in RTL introduces severe clock skew and runt pulses, degrading physical clock tree structures. | Primitives: Integrated Clock Gating (ICG) cell, UPF (IEEE 1801) power domains, isolation cells, level shifters, clock enable vs clock gating.
* 04-ram-and-rom-behavioral-inference-rtl — Problem: Incorrect procedural coding of memory arrays prevents synthesis tools from inferring dedicated Block RAM primitives, wasting logic gates. | Primitives: RAM inference, True Dual-Port BRAM, Distributed RAM (LUT RAM), byte-enable masking, read-first vs write-first semantics, $readmemh initialization.

### 02-fsm-rtl-partitioning-and-encoding — Finite State Machine Structural Partitioning and Fault Tolerance
* 01-fsm-procedural-partitioning-architectures — Problem: Combining state transitions and output decoding into a single procedural block produces output glitches and unmaintainable code. | Primitives: Two-block FSM, Three-block FSM, look-ahead registered outputs.
* 02-fsm-enum-encoding-and-safe-state-recovery — Problem: Corrupted state vectors entering unassigned binary states cause state machines to lock up permanently in production. | Primitives: SystemVerilog enum states, fsm_encoding attributes, default state recovery, Triple Modular Redundancy (TMR).

### 03-streaming-protocols-and-bus-arbitration — Ready/Valid Handshakes, Elastic Skid Buffers, and Arbiters
* 01-ready-valid-streaming-and-skid-buffers — Problem: Direct combinational backpressure in high-speed streaming datapaths creates long critical paths that degrade clock frequency. | Primitives: Ready/Valid handshake, backpressure anti-deadlock rule, combinational vs registered Skid Buffer, elastic pipeline.
* 02-bus-arbitration-architectures — Problem: Coordinating multiple master modules attempting to access a single shared bus resource requires fair, deterministic grant allocation. | Primitives: Fixed-priority arbiter, Round-Robin arbiter, Weighted Round-Robin, starvation prevention mask.

### 04-dsp-arithmetic-and-pipeline-processing — Fixed-Point DSP Arithmetic, Saturation, and Hardware Dividers
* 01-signed-arithmetic-and-type-casting-rtl — Problem: Mixing signed and unsigned vectors in RTL expressions causes inadvertent unsigned zero-extension and corrupted arithmetic operations. | Primitives: Signed type casting (`$signed`), arithmetic shift (`>>>`), sign extension.
* 02-fixed-point-dsp-arithmetic-and-saturation — Problem: Processing real-world DSP signals in RTL without saturation logic causes catastrophic overflow wrap-around and audio/video clipping noise. | Primitives: Fixed-point Q-format, convergent rounding vs truncation, saturation logic, iterative dividers (CORDIC / Restoring divider).

## 04-metastability-and-clock-domain-crossing — Metastability Mitigation and Multi-Clock Domain Synchronization

### 01-metastability-and-single-bit-cdc — Physical Metastability and Synchronizer Chains
* 01-metastability-and-mtbf-quantification — Problem: Asynchronous signals entering a clock domain during setup/hold windows cause flip-flops to enter non-deterministic metastable states. | Primitives: Metastable resolution time, MTBF calculation, process node/temperature impact.
* 02-two-flip-flop-synchronizer-mechanics — Problem: Sampling single-bit asynchronous inputs directly in control state machines causes state register corruption. | Primitives: 2-FF synchronizer, ASYNC_REG attribute, CDC reconvergence hazard.
* 03-pulse-synchronizer-circuit-design — Problem: Short control pulses generated in a fast clock domain may be missed entirely when sampled by a slower clock domain. | Primitives: Pulse synchronizer, toggle-based pulse extension, minimum pulse spacing constraint.

### 02-multi-bit-cdc-protocols-and-fifo — Multi-Bit Clock Domain Crossing (CDC) Architectures
* 01-handshake-cdc-protocol-architecture — Problem: Synchronizing multi-bit data buses with independent 2-FF chains causes bit-skew corruption when data bits arrive out of phase. | Primitives: Req/Ack CDC handshake, data bus stabilization window, crosstalk skew risk.
* 02-asynchronous-fifo-cdc-synchronization — Problem: High-throughput streaming data transferred between independent clock domains cannot tolerate multi-cycle handshake pauses. | Primitives: Asynchronous FIFO, Gray code pointer synchronization, non-power-of-2 depth Dual-n Gray handling, PPM frequency drift margin.
* 03-glitchless-clock-multiplexing-architecture — Problem: Switching between two active asynchronous clock sources using standard multiplexers causes runt pulses and clock domain glitches. | Primitives: Glitchless clock mux, cross-coupled negative-edge enable, watchdog failover.

## 05-verification-sva-and-fpga-synthesis — SystemVerilog Assertions, Self-Checking Testbenches, Logic Synthesis, and STA

### 01-assertion-based-verification-and-testbenches — Testbench Architecture, Functional Coverage, and SystemVerilog Assertions
* 01-self-checking-testbench-architecture — Problem: Manually inspecting waveform signals for multi-cycle hardware modules is slow, non-repeatable, and prone to human oversight. | Primitives: Self-checking testbench, task-based stimulus driver, golden queue scoreboard, constrained random generation (CRV).
* 02-functional-coverage-and-verification-metrics — Problem: Driving random test vectors without quantitative coverage metrics leaves critical hardware edge cases un-verified. | Primitives: Covergroup, coverpoint, cross coverage, $past/$rose/$fell/$stable system functions, code vs functional coverage database merging.
* 03-systemverilog-assertions-sva-mechanics — Problem: Catching multi-cycle protocol violations at module boundaries using raw procedural checks requires bloated, hard-to-read verification code. | Primitives: Immediate vs deferred (`assert final`) vs concurrent assertions, sequences (`##`, `[*N]`, `intersect`, `throughout`), properties (`|->`, `|=>`), cover property, `bind` keyword, Formal Property Verification (FPV) alignment (`assume`).

### 02-synthesis-pipeline-and-technology-mapping — Logic Synthesis, Gate Netlist Generation, and Floorplanning
* 01-rtl-synthesis-and-gate-netlist-generation — Problem: High-level RTL code must be compiled into target-specific physical gates and LUT netlists without altering logical function. | Primitives: Logic synthesis pipeline, elaboration, Boolean optimization, standard cell library (`.lib`), gate netlist generation.
* 02-fpga-technology-mapping-and-primitive-inference — Problem: Abstract Boolean logic networks must be mapped efficiently onto pre-fabricated FPGA resources without exhausting slice capacity. | Primitives: LUT6 mapping, BRAM mapping, DSP block mapping, high-fanout register duplication, Pblocks floorplanning.

### 03-static-timing-analysis-and-sdc-constraints — Static Timing Analysis, SDC Exceptions, and Gate-Level Simulation
* 01-static-timing-analysis-and-slack-calculation — Problem: Physical wire and gate propagation delays can cause setup and hold time violations that crash hardware at target frequencies. | Primitives: Static Timing Analysis (STA), Setup Slack, Hold Slack, Clock Skew, Clock Jitter, recovery/removal timing slack, MCMM multi-corner STA.
* 02-sdc-timing-constraints-and-exceptions — Problem: STA engines generate false timing violations on CDC boundaries and multi-cycle paths unless explicit timing exceptions are defined. | Primitives: SDC constraints (`create_clock`, `set_input_delay`, `set_output_delay`), `set_clock_groups -asynchronous`, `set_max_delay -datapath_only` vs `set_false_path`, `set_multicycle_path`.
* 03-gate-level-simulation-and-sdf-backannotation — Problem: Functional RTL simulations do not reflect physical gate delays, interconnect skews, or glitches present in synthesized silicon netlists. | Primitives: Gate-Level Simulation (GLS), Standard Delay Format (SDF) back-annotation, reset warning suppression, zero-delay loop suppression.

### 04-capstone-system-integration — Integrated Subsystem Synthesis and Headless Workflows
* 01-multi-domain-cdc-subsystem-synthesis — Problem: Integrating asynchronous FIFOs, FSM controllers, and register files into a single system requires unified CDC synchronization, SVA checking, Tcl/Make CI/CD scripting, and timing closure. | Primitives: Multi-domain RTL integration, capstone system verification, Tcl/Make headless synthesis workflow, QoR report parsing.