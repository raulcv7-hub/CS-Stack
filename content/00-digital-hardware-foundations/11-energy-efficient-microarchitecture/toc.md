# energy-efficient-microarchitecture — Energy-Efficient Microarchitecture

> **Assumed Prerequisites:** Combinational logic gates, sequential state machines, and multiplexers from `01-digital-logic-design`; SystemVerilog RTL syntax, simulation queues, and logic synthesis from `02-rtl-hardware-design`; scalar execution datapaths, instruction pipelines, and control units from `03-cpu-microarchitecture`.
> **Course Boundary:** Begins at physical CMOS power dissipation mechanics (dynamic switching vs. static leakage) and thermal density walls (*Dark Silicon*), progresses through hardware-managed clock gating, power gating, state retention, Dynamic Voltage and Frequency Scaling (DVFS), Power Domain Crossing (PDC), and microarchitectural idle C-states/P-states, and ends at Unified Power Format (UPF / IEEE 1801) power intent specification and complete energy-efficient microarchitectural subsystem synthesis.
> **Explicit Exclusions:** ❌ No analog transistor physics, semiconductor substrate fabrication, or PMIC power regulator PCB layout (belongs to Electrical Engineering), ❌ No operating system kernel energy governors or software power management policies (handled in Layer 04 `operating-system-kernels`), ❌ No high-level software application power optimization.

## 01-power-dissipation-foundations — CMOS Power Dissipation Mechanics

### 01-dynamic-power-dissipation — Dynamic Power Dissipation Mechanics
* 01-dynamic-power-capacitive-charging — Problem: High-frequency logic switching causes capacitive charging and discharging power losses that scale quadratically with supply voltage. | Primitives: Dynamic power dissipation, Switching activity factor.
* 02-short-circuit-current-dissipation — Problem: Simultaneous PMOS and NMOS channel conduction during finite signal transition slope times creates transient power spikes between supply and ground. | Primitives: Short-circuit power, Transition slope control.
* 03-thermal-hotspot-power-density — Problem: Concentrating high-frequency switching operations in compact execution units causes localized thermal hotspots and thermal runaway. | Primitives: Thermal hotspot, Thermal runaway.

### 02-static-leakage-thermal-limits — Static Leakage and Thermal Density Limits
* 01-subthreshold-gate-oxide-leakage — Problem: Sub-7nm transistor threshold voltage scaling increases subthreshold channel leakage and gate-oxide quantum tunneling current in idle circuits. | Primitives: Subthreshold leakage, Gate-oxide tunneling leakage.
* 02-pvt-corners-parasitic-power-modeling — Problem: Process, voltage, and temperature (PVT) variations cause severe static leakage inflation and timing slack degradation in post-layout silicon. | Primitives: PVT corner analysis, SPEF parasitic power extraction.
* 03-dark-silicon-thermal-density-wall — Problem: Thermal Design Power (TDP) limits prevent all transistors on a silicon die from operating simultaneously at maximum clock frequency. | Primitives: Dark silicon wall, Thermal Design Power (TDP).

## 02-low-power-gating-architectures — Low-Power Logic Gating Architecture

### 01-clock-gating-circuit-synthesis — Clock Tree Power Reduction
* 01-integrated-clock-gating-cell-synthesis — Problem: Toggling clock distribution trees to idle registers burns dynamic power unnecessarily when register data remains unchanged. | Primitives: Integrated Clock Gating (ICG) cell, Level-sensitive enable latch.
* 02-glitchless-clock-enable-fanout-timing — Problem: Driving massive register fanouts with ICG cells creates clock skew and critical path setup/hold timing violations. | Primitives: Glitchless clock gating, ICG fanout timing closure.
* 03-autonomous-fine-grained-stage-gating — Problem: Coarse-grained clock gating leaves inactive pipeline stages toggling when individual pipeline instructions stall or bubble. | Primitives: Fine-grained clock gating, Autonomous pipeline stage gating.

### 02-datapath-operand-isolation — Datapath Operand Isolation Mechanics
* 01-operand-isolation-combinational-gating — Problem: Unused arithmetic execution unit inputs continue toggling during non-arithmetic instruction execution, burning combinational dynamic power. | Primitives: Operand isolation, Combinational data gating.
* 02-lookahead-bus-enable-decoding — Problem: Multibit data buses introduce propagation delay when enable signals are decoded in the same clock cycle as valid data arrival. | Primitives: Lookahead enable decoding, Bus enable timing alignment.

### 03-power-gating-state-retention — Transistor Power-Down and Retention Mechanics
* 01-header-footer-power-switch-transistors — Problem: Idle logic blocks continue draining static leakage current unless physically disconnected from power or ground rails. | Primitives: Power switch transistors (Header/Footer), Inrush current mitigation.
* 02-staged-power-switch-enable-daisy-chaining — Problem: Rapidly powering on sleeping logic blocks triggers L*(di/dt) supply voltage drops that disrupt adjacent active power domains. | Primitives: Staged power switch enable, Daisy-chained power-up.
* 03-state-retention-power-gating-cells — Problem: Cutting supply voltage to a logic block destroys stored register states, forcing lengthy re-initialization upon power-up unless shadow latches are used. | Primitives: State Retention Power Gating (SRPG) cell, Break-even time (BET) calculation.
* 04-isolation-level-shifter-cells — Problem: Unpowered logic blocks driving floating outputs into powered domains create short-circuit leakage currents and invalid logic states. | Primitives: Isolation clamp cell, Level shifter cell.

## 03-dynamic-voltage-frequency-scaling — Dynamic Voltage and Frequency Scaling (DVFS)

### 01-dvfs-hardware-architecture — Voltage and Frequency Domain Management
* 01-voltage-frequency-domain-partitioning — Problem: Running an entire SoC at a single uniform voltage and frequency wastes energy in low-throughput execution domains. | Primitives: Voltage domain, Frequency domain.
* 02-hardware-dvfs-controller-state-machine — Problem: Changing clock frequency without coordinating supply voltage transitions causes setup timing violations and transistor breakdown. | Primitives: Hardware DVFS controller, Voltage-frequency sequencing.
* 03-power-domain-crossing-synchronization — Problem: Communicating across adjacent power domains operating at different supply voltages and frequencies causes signal degradation and timing faults. | Primitives: Power Domain Crossing (PDC) bridge, Asynchronous multi-voltage CDC.

### 02-adaptive-voltage-clocking-systems — Power Supply Noise and Adaptive Execution
* 01-voltage-droop-transient-mitigation — Problem: Sudden dynamic current surges cause L*(di/dt) voltage droops that trigger setup time violations in execution pipelines. | Primitives: Voltage droop, Decoupling capacitor array (Decap).
* 02-adaptive-clocking-critical-path-monitors — Problem: Fixed clock margins designed for worst-case voltage droops penalize nominal execution frequency and energy efficiency. | Primitives: Adaptive clocking, Critical Path Monitor (CPM).
* 03-on-chip-voltage-regulators-dual-rail-sram — Problem: Logic Vmin drops lower than SRAM array retention Vmin, causing memory corruption during deep voltage scaling. | Primitives: Integrated Digital LDO (DLDO/FIVR), Dual-rail SRAM array.

## 04-microarchitectural-power-management — Microarchitectural State Power Management

### 01-processor-idle-power-states — Processor Idle C-State Control
* 01-microarchitectural-c-state-transitions — Problem: Deep idle execution pauses waste static power unless pipeline stages, caches, and clock generators are systematically powered down. | Primitives: Processor C-states, Pipeline flush evacuation.
* 02-drowsy-sram-cache-retention — Problem: Completely powering off cache arrays forces expensive DRAM re-fetches upon wakeup, while full-voltage retention drains static leakage power. | Primitives: Drowsy SRAM cache, Low-voltage cache retention.

### 02-processor-performance-states — Processor Active P-State Control
* 01-performance-p-state-coordination — Problem: Dynamically matching instruction throughput demand to processor frequency requires hardware-managed workload evaluation and per-chip eFuse binning. | Primitives: Processor P-states (HWP/CPPC), Per-chip eFuse binning.
* 02-power-aware-instruction-scheduling — Problem: Out-of-order execution pipelines dispatching instructions without energy constraints trigger thermal throttling spikes. | Primitives: Power-aware instruction scheduling, Energy-efficient issue queue.
* 03-low-power-frontend-micro-op-caches — Problem: Decoding complex variable-length instructions on every clock cycle consumes excessive front-end energy. | Primitives: Micro-op (uop) cache, Low-power instruction fetch filter.

## 05-integrated-power-subsystem-synthesis — Integrated Energy-Efficient Subsystem Synthesis

### 01-power-intent-specification — IEEE 1801 Power Intent Specification
* 01-unified-power-intent-specification — Problem: Designing power-gated, multi-voltage RTL architectures without standardized power intent specifications leads to synthesis and physical layout mismatches. | Primitives: Unified Power Format (UPF / IEEE 1801), Power State Table (PST).
* 02-power-aware-simulation-static-linting — Problem: Incorrectly isolated power domain boundaries induce floating 'X' state corruptions in RTL simulation and physical Place & Route layout. | Primitives: Power-aware simulation (PA-Sim / NLP), Low-power static linting.

### 02-complete-power-subsystem-synthesis — Complete Power Subsystem Integration
* 01-power-state-transition-deadlock-prevention — Problem: Unsynchronized power-state transition state machines trigger hardware deadlocks between power controllers, clock generators, and CPU cores. | Primitives: Power state transition FSM, Power control handshake protocol.
* 02-complete-energy-efficient-subsystem-synthesis — Problem: Integrating clock gating, power gating with SRPG cells, isolation, level shifters, PDC bridges, DVFS controllers, and UPF specifications into a CPU core requires unified synthesis and power estimation. | Primitives: Integrated energy-efficient subsystem, Activity-driven power estimation (VCD/FSDB).
