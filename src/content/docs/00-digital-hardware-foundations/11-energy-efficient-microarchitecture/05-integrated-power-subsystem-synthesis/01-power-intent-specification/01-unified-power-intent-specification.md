---
title: "Unified Power Format Specification and Power State Table Formalisms"
---

# Unified Power Format Specification and Power State Table Formalisms

In modern digital hardware engineering, hardware description languages such as SystemVerilog and VHDL are designed to model functional Boolean logic. An engineer writes RTL code to describe how data bits ($0$s and $1$s) flow through pipeline registers, arithmetic adders, multiplexers, and state machines. 

However, Boolean RTL code contains zero information about physical electrical power supplies!
* RTL code does not specify which transistors connect to an un-gated $1.0\text{-Volt}$ power rail versus a switchable $0.7\text{-Volt}$ power rail.
* RTL code does not specify which retention flip-flops require secondary, always-on auxiliary power lines ($V_{\text{DD\_always\_on}}$).
* RTL code does not specify where PMOS header power switches, boundary isolation clamp cells, or multi-voltage level shifters must be physically inserted into the silicon layout.

```text
THE ABSTRACTION GAP BETWEEN FUNCTIONAL RTL AND PHYSICAL POWER

 SystemVerilog Functional RTL Code            Physical Silicon Power Grid
 (Describes Boolean Logic: 0s & 1s)           (Requires Physical Voltage Rails)
 ┌───────────────────────────────┐            ┌───────────────────────────────┐
 │ always_ff @(posedge clk) begin│            │ V_DD_global = 1.0V (Always-On)│
 │   if (enable) q <= d;         │  MISSING!  │ V_DD_virtual = 0.0V (Sleep)   │
 │ end                           ├─ CANNOT ──►│ Header Switches (PMOS Arrays) │
 └───────────────────────────────┘  EXPRESS!  │ Isolation Clamps (AND/OR)     │
                                              │ Level Shifters (Cross-Coupled)│
                                              └───────────────────────────────┘
 (Functional RTL cannot express supply rails, power switches, or isolation cells!)
```

If a hardware engineering team attempts to solve this abstraction gap by manually instantiating foundry-specific power switches, level shifters, and isolation gates directly inside their functional SystemVerilog RTL code:
1. The SystemVerilog code becomes an un-maintainable, un-readable mess littered with low-level technology primitives, making the design impossible to port to a new manufacturing node or simulate cleanly.
2. Logic simulators treat powered-off hardware blocks as active Boolean gates ($0$s and $1$s), failing to detect floating output 'X' state corruptions or short-circuit DC leakage currents!
3. Physical design synthesis tools mismatch the intended power domain boundaries, resulting in catastrophic post-silicon layout failures where unpowered blocks drive active gates without isolation!

To bridge this gap without cluttering functional RTL code, the semiconductor industry established an open, standardized sideband specification language: **The Unified Power Format (UPF / IEEE 1801)**.

By writing a companion UPF power intent script alongside clean functional RTL code, hardware architects completely decouple power architecture from Boolean logic. 

Furthermore, by defining a formal **Power State Table (PST)** within UPF, engineers establish a verifiable mathematical contract that guides logic synthesis tools to automatically insert power switches, isolation cells, and level shifters, while enabling power-aware simulators (PA-Sim / NLP) and static power linters (VC LP, SpyGlass Power) to prove that the multi-voltage power architecture is $100\%$ bug-free before manufacturing physical silicon.


### Analogy 2: The City Commercial Zoning Laws (Power State Tables / PST)

Now, consider how the city's building inspector verifies that the skyscraper's multi-voltage power grid operates safely under all real-world conditions.

The city zoning board enforces a formal **Electrical Zoning Matrix (A Power State Table / PST)** that declares all legally allowed operational states for the building:

```text
CITY ELECTRICAL ZONING MATRIX (POWER STATE TABLE)

 Legal Building State │ Zone A (Office Floor) │ Zone B (Executive Suite) │ Safety Status
──────────────────────┼───────────────────────┼──────────────────────────┼───────────────────
 DAY_FULL_POWER       │ 110 Volts (ON)        │ 220 Volts (ON)           │ LEGAL (All Active)
 NIGHT_SAVINGS        │ 0 Volts (OFF)         │ 220 Volts (ON)           │ LEGAL (ISO Active)
 DEEP_BUILDING_SLEEP  │ 0 Volts (OFF)         │ 0 Volts (OFF)            │ LEGAL (All Sleep)
──────────────────────┼───────────────────────┼──────────────────────────┼───────────────────
 ILLEGAL_BACKFEED     │ 0 Volts (OFF)         │ 220 Volts (ON)           │ ILLEGAL! (Un-isolated
                      │ (Un-isolated!)        │                          │ Backfeed Risk!)
```

* **State 1 (`DAY_FULL_POWER`)**: Zone A is ON ($110\text{ V}$), Zone B is ON ($220\text{ V}$). All office equipment is active.
* **State 2 (`NIGHT_SAVINGS`)**: Zone A is OFF ($0\text{ V}$), Zone B is ON ($220\text{ V}$). Safety mute doors at Zone A's exit **MUST be locked in the closed position** to prevent unpowered static from entering Zone B!
* **State 3 (`ILLEGAL_BACKFEED`)**: Zone A is OFF ($0\text{ V}$), Zone B is ON ($220\text{ V}$), but the safety mute doors are left open! The city building inspector flags this state as a **CRITICAL ZONING ERROR** because $220\text{-V}$ power will backfeed into unpowered Zone A fixtures!

The Power State Table (PST) is the official rulebook that static power linters and simulators check to catch power architecture bugs *before* the building is constructed!


### 1. Power Domains (`create_power_domain`)

A **Power Domain** is a logical grouping of RTL design hierarchy instances that share a common primary power supply net and primary ground supply net.

```tcl
# Create the top-level always-on power domain
create_power_domain PD_TOP

# Create a power-gated low-voltage power domain for the CPU core
create_power_domain PD_CPU -elements {core_inst/cpu_top}
```

* `PD_TOP`: Encloses the top-level System Agent, I/O controllers, and power management unit. It remains always-on.
* `PD_CPU`: Encloses the hierarchical RTL block `core_inst/cpu_top`. All logic gates inside `cpu_top` belong to the `PD_CPU` power domain.


### 3. Power Switches (`create_power_switch`)

A **Power Switch** command instructs the logic synthesis tool to insert an array of PMOS header switch transistors between an un-gated supply net (`VDD_CPU_REAL`) and a virtual supply net (`VDD_CPU_VIRTUAL`), controlled by an RTL sleep signal:

```tcl
# Create PMOS Header Power Switch for PD_CPU
create_power_switch psw_cpu \
    -domain PD_CPU \
    -input_supply_port  {in  VDD_CPU_REAL} \
    -output_supply_port {out VDD_CPU_VIRTUAL} \
    -control_port       {sleep_n pmu_inst/cpu_sleep_n} \
    -on_state           {cpu_on_state in {!sleep_n}}
```

```text
UPF POWER SWITCH SYNTHESIS MAPPING

 UPF Command Specification:              Synthesized Silicon Hardware:
 create_power_switch psw_cpu             VDD_CPU_REAL (Un-gated 0.8V)
   -input_supply_port in                   │
   -output_supply_port out               ┌─┴─┐ PMOS Header Switch Array
   -control_port sleep_n ───────────────►│   │ (Controlled by cpu_sleep_n)
                                         └─┬─┘
                                           │
                                           ▼ VDD_CPU_VIRTUAL (Switchable)
```

* `-control_port {sleep_n pmu_inst/cpu_sleep_n}`: Binds the physical switch gates to the RTL control signal `cpu_sleep_n` generated by the Power Management Unit.
* `-on_state {cpu_on_state in {!sleep_n}}`: Declares that the switch is ON when `cpu_sleep_n` is active (logical $0$).


### 5. Level Shifter Policies (`set_level_shifter`)

A **Level Shifter Policy** instructs synthesis tools to insert voltage translation cells on signals crossing between domains operating at different supply voltages:

```tcl
# Define level shifter strategy for low-voltage domain PD_CPU (0.80V -> 1.00V)
set_level_shifter ls_cpu_out \
    -domain PD_CPU \
    -applies_to outputs \
    -rule low_to_high \
    -location self
```

* `-rule low_to_high`: Automatically identifies all boundary signals leaving `PD_CPU` ($0.80\text{ V}$) and entering higher-voltage domain `PD_TOP` ($1.00\text{ V}$).
* Synthesis tools insert **Cross-Coupled Differential Level Shifters** on all 256 output lines, converting $0.80\text{-V}$ High signals to $1.00\text{-V}$ High signals cleanly!


## Formal Syntax and Structure of Power State Tables (PST)

A **Power State Table (PST)** is a formal multi-domain operational matrix defined within UPF that declares all legally allowed operational states for the SoC.

The PST serves as the single source of truth for power-aware simulation engines (PA-Sim / NLP) and static power rule checkers (VC LP, SpyGlass Power).

```text
POWER STATE TABLE (PST) STRUCTURE

 Supply Ports / Nets Included in PST:
   1. VDD_TOP      (Always-On System Agent Rail)
   2. VDD_CPU_REAL (Un-gated CPU Core Supply Rail)
   3. psw_cpu/out  (Virtual Switchable CPU Supply Rail VDD_CPU_VIRTUAL)

 ┌─────────────────┬──────────────┬──────────────┬──────────────┐
 │ PST State Name  │ VDD_TOP      │ VDD_CPU_REAL │ psw_cpu/out  │
 ├─────────────────┼──────────────┼──────────────┼──────────────┤
 │ PST_FULL_PERF   │ ON_100 (1.0V)│ ON_080 (0.8V)│ ON_080 (0.8V)│
 │ PST_LOW_POWER   │ ON_100 (1.0V)│ ON_080 (0.8V)│ OFF    (0.0V)│
 │ PST_DEEP_SLEEP  │ ON_100 (1.0V)│ OFF    (0.0V)│ OFF    (0.0V)│
 └─────────────────┴──────────────┴──────────────┴──────────────┘
```


### How Static Power Linters Use the PST to Catch Hardware Bugs

During physical design sign-off, static power checkers (such as Synopsys VC LP or Siemens SpyGlass Power) evaluate every inter-domain boundary wire against the legal states defined in `soc_pst`:

```text
STATIC POWER LINTING (VC LP) WITH PST FORMAL VERIFICATION

 Inter-Domain Wire: PD_CPU Output -> PD_TOP Input
 Check against PST State 'PST_CPU_SLEEP':
   * VDD_TOP = ON_100 (1.00V)
   * psw_cpu/out = OFF_000 (0.00V)

 Linter Verification Question:
 "In state PST_CPU_SLEEP, is there an Isolation Cell enabled on this wire?"

 ┌─────────────────────────────────────────────────────────────┐
 │ IF YES ──► PASS! Boundary signal clamped to 0.0V cleanly!   │
 │ IF NO  ──► CRITICAL LINT ERROR! Floating Output Hazard!     │
 └─────────────────────────────────────────────────────────────┘
  (Linters catch missing isolation cells in 5 seconds before layout!)
```

1. The linter inspects state `PST_CPU_SLEEP`: `psw_cpu/out = OFF_000` ($0.0\text{ V}$), while `VDD_TOP_PORT = ON_100` ($1.00\text{ V}$).
2. The linter traces every wire originating in `PD_CPU` and terminating in `PD_TOP`.
3. **The Rule Check**: For every boundary wire, the linter checks if an active isolation policy (`iso_cpu_out`) is bound to that wire.
4. **Bug Catching**: If an engineer added a new 32-bit interrupt signal to the SystemVerilog RTL code but **forgot to update the UPF script**, the linter detects that the 32 interrupt lines are un-isolated during `PST_CPU_SLEEP`.
5. The linter flags a **`FATAL_UPF_ISO_MISSING` Error**, preventing a multi-million-dollar silicon re-spin!


## Solved Industrial Engineering Exercise: Quantitative Analysis of UPF Specification, Power State Table Verification, and Automated Boundary Cell Insertion

To consolidate your complete, mathematical understanding of UPF power intent specifications, Power State Table (PST) formalisms, un-isolated crowbar leakage calculations, and automated boundary cell insertion, let us work through a complete, step-by-step quantitative engineering problem.


### Your Objective

1. Write the complete, syntactically correct **UPF (IEEE 1801) Script** for `PD_TOP` and `PD_CPU`, including supply nets, power switch, isolation policy, level shifter policy, and Power State Table (`soc_pst`).
2. Calculate total DC crowbar leakage power ($P_{\text{leak\_crowbar\_bug}}$) drained in `PD_TOP` during `PST_CPU_SLEEP` due to the 32 un-isolated lines in the buggy UPF script.
3. Calculate total un-shifted PMOS leakage power ($P_{\text{leak\_unshifted\_bug}}$) drained in `PD_TOP` during `PST_FULL_PERF` across all 256 lines if level shifters were omitted in UPF.
4. Calculate total boundary cell overhead power ($P_{\text{overhead\_correct}}$) when all 256 lines are properly isolated and level-shifted in the corrected UPF script.
5. Calculate net power saved (in mW) and percentage leakage reduction in `PST_CPU_SLEEP` achieved by correcting the UPF specification.
6. Verify mathematical, structural, and UPF syntax correctness.


#### Step 2: Calculate Crowbar Leakage Power from Buggy UPF Script ($P_{\text{crowbar\_bug}}$)

In the buggy UPF script, 32 output lines were omitted from `set_isolation`. During `PST_CPU_SLEEP`, `psw_cpu/out = OFF_000` ($0.00\text{ V}$), and the 32 un-isolated lines float to $0.50\text{ V}$ into `PD_TOP` ($V_{\text{DD\_TOP}} = 1.00\text{ V}$).

Each floating line drains $I_{\text{crowbar}} = 150.0\ \mu\text{A} = 150.0 \times 10^{-6}\text{ A}$.

##### 1. Total Crowbar Current for 32 Floating Lines ($I_{\text{crowbar\_total\_bug}}$):

$$I_{\text{crowbar\_total\_bug}} = 32 \text{ lines} \times 150.0 \times 10^{-6}\text{ A/line} = \mathbf{4.80 \times 10^{-3} \text{ Amperes}} = \mathbf{4.80 \text{ mA}}$$

##### 2. Total Crowbar Leakage Power ($P_{\text{crowbar\_bug}}$) at $V_{\text{DD\_TOP}} = 1.00\text{ V}$:

$$P_{\text{crowbar\_bug}} = I_{\text{crowbar\_total\_bug}} \cdot V_{\text{DD\_TOP}} = (4.80 \times 10^{-3}\text{ A}) \times 1.00\text{ V} = \mathbf{4.800 \times 10^{-3} \text{ Watts}} = \mathbf{4.800 \text{ mW}}$$

The 32 un-isolated lines drain **$4.800\text{ mW}$ of continuous DC short-circuit leakage power** inside `PD_TOP` during sleep mode!


#### Step 4: Calculate Corrected UPF Boundary Overhead ($P_{\text{overhead\_correct}}$)

In the corrected UPF script, all 256 lines are equipped with AND Isolation Clamps and Level Shifters.

Per-line cell overhead $P_{\text{cell\_overhead}} = 0.0025\text{ mW} = 2.5 \times 10^{-6}\text{ W}$.

$$P_{\text{overhead\_correct}} = 256 \text{ lines} \times 0.0025\text{ mW/line} = \mathbf{0.640 \text{ mW}} = 0.000640\text{ W}$$

The total hardware boundary overhead for 256 isolated and level-shifted lines is **$0.640\text{ mW}$**.


### Sanity Check and Verification

Let us verify our mathematical, structural, and UPF syntax derivations:

1. **UPF Command Grammar Verification**:
   * `create_power_domain`: Correctly scoped elements (`core_inst/cpu_top`).
   * `create_power_switch`: Correct input (`VDD_CPU_REAL`), output (`VDD_CPU_VIRTUAL`), control (`cpu_sleep_n`).
   * `set_isolation`: `-clamp_value 0 -location parent` correctly places cells in $1.00\text{-V}$ `PD_TOP`.
   * `set_level_shifter`: `-rule low_to_high -location parent` correctly shifts $0.80\text{ V} \to 1.00\text{ V}$.
   * `add_pst_state`: All state vectors match declared supply ports in `soc_pst`.

2. **Crowbar Power Calculation Verification**:
   * $I_{\text{crowbar\_total}} = 32 \times 150.0\ \mu\text{A} = 4.80\text{ mA}$.
   * $P = 4.80\text{ mA} \times 1.00\text{ V} = 4.800\text{ mW}$. Math verified $100\%$.

3. **Dimensional Analysis Check**:
   * $[\Delta P_{\text{saved}}] = \text{mW} - \text{mW} = \mathbf{\text{mW}}$.
   * $[I \cdot V] = \text{Amperes} \cdot \text{Volts} = \mathbf{\text{Watts}}$.
   * Units scale correctly across all equations.

