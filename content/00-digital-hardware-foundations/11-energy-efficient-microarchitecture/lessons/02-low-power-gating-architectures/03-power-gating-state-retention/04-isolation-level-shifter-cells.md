content/00-digital-hardware-foundations/11-energy-efficient-microarchitecture/lessons/02-low-power-gating-architectures/03-power-gating-state-retention/04-isolation-level-shifter-cells.md
# Isolation Clamp Cells and Multi-Voltage Level Shifter Architecture

In energy-efficient System-on-Chip (SoC) microarchitectures, digital integrated circuits are partitioned into multiple independent power domains and voltage islands. To eliminate static subthreshold leakage power during idle periods, power gating techniques disconnect idle logic domains from their supply rails ($V_{\text{DD\_virtual}} \to 0.0\text{ V}$). Simultaneously, Dynamic Voltage and Frequency Scaling (DVFS) algorithms adjust the operational supply voltages of active domains independently—running high-throughput processing cores at $1.10\text{ Volts}$ while scaling low-power background controllers down to $0.70\text{ Volts}$.

However, when multiple power domains operating at different voltages or power states communicate across boundary interconnect wires, two severe physical hardware hazards occur at the domain interfaces: **Floating Output Crowbar Currents** and **Un-Shifted Voltage Leakage Spikes**.

Consider what occurs when a power-gated logic domain (Domain A) is turned OFF, while an adjacent receiving domain (Domain B) remains fully powered and active:

```text
THE FLOATING OUTPUT CROWBAR HAZARD AT POWER DOMAIN BOUNDARIES

 Domain A (Power-Gated: 0.0V)             Domain B (Always-Powered: 1.1V)
 ┌───────────────────────────┐            ┌───────────────────────────┐
 │ Unpowered CMOS Gate       │            │ Active Powered CMOS Gate  │
 │ Output FLOATS to 0.55V!   ├─ Wire ────►│ Input = 0.55V (FLOATING!) │
 └───────────────────────────┘            └─────────────┬─────────────┘
                                                        │
                                                        ▼
                                         BOTH PMOS AND NMOS TURN ON!
                                         Massive Crowbar Current to GND!
 (Unpowered Domain A causes continuous short-circuit leakage in active Domain B!)
```

Trace the physical hardware failure step-by-step:
1. When Domain A is powered down ($V_{\text{DD\_virtual\_A}} \to 0.0\text{ V}$), the output transistors inside Domain A stop driving valid high ($1.10\text{ V}$) or low ($0.0\text{ V}$) logic voltages.
2. The boundary output wire connecting Domain A to Domain B enters an un-driven **Floating State**, drifting to an intermediate analog voltage ($V_{\text{float}} \approx 0.55\text{ V}$).
3. This floating $0.55\text{-V}$ wire enters an active, powered CMOS logic gate inside Domain B ($V_{\text{DD\_B}} = 1.10\text{ V}$).
4. **The Crowbar Short-Circuit Event**: Inside Domain B's receiving gate, the $0.55\text{-V}$ input voltage turns the NMOS transistor ON ($V_{\text{GS,n}} = 0.55\text{ V} > V_{\text{th,n}}$) AND simultaneously turns the PMOS transistor ON ($|V_{\text{GS,p}}| = 1.10\text{ V} - 0.55\text{ V} = 0.55\text{ V} > |V_{\text{th,p}}|$).
5. A continuous, massive **Crowbar Short-Circuit Current ($I_{\text{crowbar}}$)** flows straight from Domain B's active $1.10\text{-V}$ power rail to Ground!

Look at the physical disaster:
An unpowered, turned-off logic domain causes adjacent, active domains to drain milliamperes of continuous short-circuit DC leakage current, while injecting floating, invalid logic states ('X' values) into downstream execution pipelines!

A second, related boundary hazard occurs when connecting active domains operating at different supply voltages:
If Domain A operates at $0.70\text{ Volts}$ and drives a logical High ($0.70\text{ V}$) directly into Domain B operating at $1.10\text{ Volts}$, the PMOS transistor inside Domain B's input gate sees a gate-to-source voltage of $|V_{\text{GS,p}}| = 1.10\text{ V} - 0.70\text{ V} = 0.40\text{ V}$. 

Because $0.40\text{ V} > |V_{\text{th,p}}|$, **the PMOS transistor NEVER turns OFF**! Continuous short-circuit leakage current flows through Domain B's $1.10\text{-V}$ power rail whenever Domain A drives a logical High!

To eliminate floating output crowbar currents, prevent invalid state propagation, and translate logic voltage levels cleanly between multi-voltage domains, microarchitects employ **Isolation Clamp Cells** and **Multi-Voltage Level Shifter Cells**.

---

## The Muted Intercom and the Currency Exchange Booth

To build an intuitive, crystal-clear mental model of isolation clamp cells, level shifters, clamp polarity selection, and cross-coupled differential level shifting before analyzing transistor schematics and UPF intent commands, let us consider two everyday analogies: an office intercom system and an international currency exchange booth.

### Analogy 1: The Unplugged Office Intercom (Isolation Clamp Cells)

Imagine two neighboring executive offices connected by an intercom wire: Office A (**Power-Gated Domain A**) and Office B (**Always-Powered Domain B**).

```text
THE UNPLUGGED INTERCOM ANALOGY FOR ISOLATION CLAMPS

 Un-Isolated Floating Intercom (Crowbar Leakage):
 Office A Unpowered ──► Intercom Wire Floats with Static Noise (0.55V)
                        │
                        ▼
 Office B Speaker B
 ```
BZZZZZZ! Loud Static Buzz! (Burns Energy in Office B!)

 Isolated Intercom with Clamp Cell (Clean Mute):
 Office A Unpowered ──► [ Mute Isolation Clamp (ISO_EN = 0) ]
                        │
                        ▼ Clamped to 0.0V (Pure Silence!)
 Office B Speaker B Remains Completely Quiet! (Zero Energy Wasted!)
```

When Office A is powered and active, the worker in Office A speaks clearly into the intercom microphone, driving clean high-volume or zero-volume sound signals across the wire to Office B's speaker.

Now, suppose the worker in Office A finishes their shift, turns off the office lights, and unplugs their equipment (**Domain A Power Down**):
1. **Un-Isolated Intercom**: The unplugged microphone wire in Office A hangs loose in the air. The wire picks up ambient electromagnetic static, radio hum, and thermal noise, hovering at an intermediate voltage level (**Floating Voltage $0.55\text{ V}$**).
2. **The Result in Office B**: In active Office B, the intercom speaker receives this continuous $0.55\text{-V}$ static hum. The speaker buzzes loudly and continuously, vibrating its internal components and burning electrical power (**Crowbar Short-Circuit Leakage**)! The worker in Office B cannot concentrate due to the loud buzz.

#### The Isolation Clamp Solution:
To stop the static buzz, the building manager installs a **Mute Isolation Clamp (Isolation Cell)** on the intercom wire at Office B's doorway:
* As long as Office A is powered, the Mute Clamp is disengaged ($\text{ISO\_EN} = 1$). Sound passes through normally.
* The moment Office A turns off its power, the building manager engages the Mute Clamp ($\text{ISO\_EN} = 0$).
* The Mute Clamp **clamps the intercom wire at Office B's doorway to absolute silence ($0.0\text{ Volts}$)**!
* The speaker in Office B remains $100\%$ quiet, burning zero energy, regardless of how much static noise floats on Office A's unpowered wire!

---

### Analogy 2: The International Currency Exchange Booth (Level Shifter Cells)

Now, consider a different transaction problem between two neighboring countries: Country Low (**$0.70\text{-V}$ Power Domain A**) and Country High (**$1.10\text{-V}$ Power Domain B**).

Country Low uses a small currency coin (**0.70-Volt Logic High**), while Country High uses a large currency coin (**1.10-Volt Logic High**).

```text
CURRENCY EXCHANGE ANALOGY FOR LEVEL SHIFTERS

 Direct Un-Shifted Access (PMOS Never Turns OFF):
 Country Low Trader ──► Hands 0.70V Coin ──► Country High Vending Machine (1.10V)
                                             │
                                             ▼
 Vending Machine Coin Slot Stuck! (|V_gs| = 0.40V > V_th)
 Machine Buzzes Continuously & Burns Power!

 Level-Shifted Access (Level Shifter Cell):
 Country Low Trader ──► [ Currency Exchange Booth ] ──► Hands True 1.10V Coin
                        (Translates 0.70V -> 1.10V)    │
                                                        ▼
 Vending Machine Accepts 1.10V Coin & Turns OFF Cleanly!
```

A trader from Country Low walks into Country High and attempts to drop a $0.70\text{-V}$ coin directly into a vending machine designed for $1.10\text{-V}$ coins (**Input Inverter in Domain B**):

1. The vending machine's internal coin sensor compares the incoming $0.70\text{-V}$ coin against its $1.10\text{-V}$ operating rail.
2. The coin sensor detects that the $0.70\text{-V}$ coin is higher than Ground ($0.0\text{ V}$), so it accepts the coin.
3. **The Sensor Jam**: But the $0.70\text{-V}$ coin is $0.40\text{ V}$ short of the required $1.10\text{-V}$ top rail! The vending machine's internal upper shut-off valve (**The PMOS Transistor**) requires a full $1.10\text{ V}$ to shut off.
4. Because the $0.70\text{-V}$ coin cannot reach $1.10\text{ V}$, **the upper valve remains $40\%$ open indefinitely**!
5. Electricity flows continuously through the vending machine's internal coin mechanism, overheating the machine and burning power!

#### The Level Shifter Solution:
The border authority installs a **Currency Exchange Booth (Level Shifter Cell)** at the border:
* When the trader from Country Low presents a $0.70\text{-V}$ Logic High coin, the Currency Exchange Booth converts it into a **true $1.10\text{-V}$ Logic High coin**.
* When the trader presents a $0.0\text{-V}$ Logic Low coin, the booth passes $0.0\text{ V}$.
* The vending machine receives a crisp, full-amplitude $1.10\text{-V}$ coin, shut-off valves engage cleanly, and zero power is wasted!

---

## Physics of Isolation Clamp Cells

To analyze isolation clamp cells with engineering precision, let us examine the transistor-level mechanics of floating boundary wires and clamping logic.

When a power domain is switched OFF by opening its PMOS header power switches:
* The virtual power rail $V_{\text{DD\_virtual}}$ drops to $0.0\text{ V}$.
* Output drivers inside the power-gated domain lose their supply voltage.
* The physical output wire floats to an intermediate potential $V_{\text{float}}$, governed by parasitic leakage paths and subthreshold balance:

$$V_{\text{float}} \approx \frac{V_{\text{DD\_active}}}{2} \approx 0.40\text{ V} \dots 0.60\text{ V}$$

```text
CMOS INVERTER CROWBAR CURRENT AT INTERMEDIATE VOLTAGE

              Domain B Active Rail V_DD_B (1.10V)
                 │
              ┌──┴──┐
 Vin = 0.55V ─┤ PMOS│ (|V_gs,p| = 1.10V - 0.55V = 0.55V > |V_th,p| -> ON!)
              └──┬──┐
                 │  │
                 │  ▼ Massive Crowbar Current I_crowbar
                 │  │
              ┌──┴──┐
 Vin = 0.55V ─┤ NMOS│ (V_gs,n = 0.55V > V_th,n -> ON!)
              └──┬──┐
                 │
                GND (0.0V)
 (Both transistors turned ON simultaneously! Continuous DC short circuit!)
```

### Deriving the Crowbar Short-Circuit Current ($I_{\text{crowbar}}$)

When $V_{\text{float}} = 0.55\text{ V}$ enters a powered CMOS inverter operating at $V_{\text{DD\_B}} = 1.10\text{ V}$ with threshold voltages $V_{\text{th,n}} = |V_{\text{th,p}}| = 0.25\text{ V}$:

Both NMOS and PMOS transistors operate in saturation/linear conduction:

$$V_{\text{gs,n}} = 0.55\text{ V} > 0.25\text{ V} \implies \text{NMOS is ON}$$

$$|V_{\text{gs,p}}| = 1.10\text{ V} - 0.55\text{ V} = 0.55\text{ V} > 0.25\text{ V} \implies \text{PMOS is ON}$$

The continuous DC crowbar current $I_{\text{crowbar}}$ flowing through the active domain's input gate is modeled by the saturation current equation:

$$I_{\text{crowbar}} \approx \frac{1}{2} \mu_n C_{\text{ox}} \left(\frac{W_n}{L_n}\right) (V_{\text{float}} - V_{\text{th,n}})^2$$

Where:
* $I_{\text{crowbar}}$ is the steady-state short-circuit leakage current in Amperes ($\text{A}$).
* $\mu_n C_{\text{ox}} \left(\frac{W_n}{L_n}\right)$ is the NMOS transconductance parameter in $\text{A/V}^2$.
* $V_{\text{float}}$ is the floating input voltage in Volts ($\text{V}$).
* $V_{\text{th,n}}$ is the NMOS threshold voltage in Volts ($\text{V}$).

For a typical $28\text{nm}$ input buffer with $W_n/L_n = 10$, $I_{\text{crowbar}}$ can reach **$50 \text{ to } 200\ \mu\text{A}$ per input pin**! 

Across a 128-bit boundary bus, un-isolated floating inputs drain over **$20\text{ milliamperes}$ of continuous DC current ($22\text{ mW}$ of wasted power)** inside the *active* power domain!

---

### Isolation Clamp Cell Topologies

To eliminate $I_{\text{crowbar}}$, an **Isolation Clamp Cell** is inserted on every boundary wire between the unpowered output port and the powered input port.

There are three standard hardware topologies for isolation clamp cells:

```text
THREE ISOLATION CLAMP CELL TOPOLOGIES

 1. Clamp-to-0 (AND-Based Isolation Cell):
 Unpowered A_float ──►┌──────┐
                      │ AND  ├──────► Y_clamped = 0.0V (Solid Ground!)
 Active ISO_EN ──────►└──────┘
 (When ISO_EN = 0 during sleep, output is clamped to 0.0V)

 2. Clamp-to-1 (OR-Based Isolation Cell):
 Unpowered A_float ──►┌──────┐
                      │ OR   ├──────► Y_clamped = V_DD_B (Solid High!)
 Inv_ISO_EN ─────────►└──────┘
 (When ISO_EN = 0 / Inv_ISO_EN = 1, output is clamped to V_DD_B)

 3. Latch-Freezing Isolation Cell:
 Unpowered A_float ──►[ D  LATCH  Q ]──► Y_clamped = Last Valid State
 ISO_EN ─────────────►[ Clock En  ]
 (When ISO_EN = 0, latch freezes output at last valid value before sleep!)
```

#### 1. Clamp-to-0 (AND-Based Isolation Cell)
* **Structure**: A 2-input AND gate where one input connects to the unpowered domain's output wire ($A_{\text{float}}$) and the second input connects to the isolation control signal ($\text{ISO\_EN}$).
* **Operation**:
  * Active Mode ($\text{ISO\_EN} = 1$): $Y_{\text{clamped}} = A_{\text{float}} \cdot 1 = A_{\text{float}}$. Signal passes through.
  * Sleep Mode ($\text{ISO\_EN} = 0$): $Y_{\text{clamped}} = A_{\text{float}} \cdot 0 = \mathbf{0.0 \text{ Volts}}$.
* **Result**: The active receiving domain sees a solid $0.0\text{-V}$ Ground logic level. $V_{\text{gs,n}} = 0.0\text{ V} < V_{\text{th,n}}$, turning the NMOS transistor OFF and dropping $I_{\text{crowbar}}$ to **absolute zero**!

#### 2. Clamp-to-1 (OR-Based Isolation Cell)
* **Structure**: A 2-input OR gate driven by $A_{\text{float}}$ and an active-low isolation signal ($\overline{\text{ISO\_EN}}$).
* **Operation**:
  * Sleep Mode ($\text{ISO\_EN} = 0 \implies \overline{\text{ISO\_EN}} = 1$): $Y_{\text{clamped}} = A_{\text{float}} \lor 1 = \mathbf{V_{\text{DD\_B}}}$.
* **Result**: The active receiving domain sees a solid $V_{\text{DD\_B}}$ High logic level. $|V_{\text{gs,p}}| = 0.0\text{ V} < |V_{\text{th,p}}|$, turning the PMOS transistor OFF and dropping $I_{\text{crowbar}}$ to **absolute zero**!

#### 3. Latch-Freezing Isolation Cell
* **Structure**: A level-sensitive transparent D-latch powered by the receiving domain's always-on rail.
* **Operation**: When $\text{ISO\_EN} = 0$, the latch freezes its output at the **last valid logic state** present before the domain powered down.

---

### How to Select Clamp Polarity (Clamp-to-0 vs. Clamp-to-1)

How does a system architect decide whether a boundary wire should be clamped to '0' or '1'?

The selection depends strictly on the **functionality of the receiving active logic gates**:

```text
CLAMP POLARITY SELECTION RULES

 Receiving Control Signal Type │ Required Clamp Value │ Reason to Prevent System Failure
──────────────────────────────┼──────────────────────┼─────────────────────────────────────────────
 Active-High Enable (EN = 1)   │ Clamp-to-0 (0.0V)    │ Prevents false activation of receiving block
 Active-Low Reset (RST_N = 0)  │ Clamp-to-1 (V_DD)   │ Prevents false hardware resets during sleep!
 Active-High Interrupt (IRQ=1) │ Clamp-to-0 (0.0V)    │ Prevents fake interrupt requests to CPU
 Multi-Bit Data Bus (D[63:0])  │ Clamp-to-0 or Latch  │ Minimizes static power & prevents 'X' states
```

#### The Critical Reset Line Example:
Suppose a power-gated domain drives an **active-low reset line ($\text{RST\_N}$)** into an active, always-powered domain.
* If a designer incorrectly selects a **Clamp-to-0** isolation cell on $\text{RST\_N}$:
* When Domain A powers down, the isolation cell clamps $\text{RST\_N}$ to $0.0\text{ V}$.
* **System Failure**: The receiving active domain sees $\text{RST\_N} = 0$ and **triggers a false hardware reset**, crashing the active domain!
* **The Correct Fix**: $\text{RST\_N}$ **MUST use a Clamp-to-1 isolation cell** so that $\text{RST\_N} = V_{\text{DD\_B}}$ during sleep, preserving active execution!

---

## Physics of Multi-Voltage Level Shifter Cells

Now let us examine the second boundary primitive: **Level Shifter Cells**.

In modern SoCs utilizing Dynamic Voltage and Frequency Scaling (DVFS), different processing domains operate at different supply voltages:
* **Low-Voltage Domain A**: $V_{\text{DD\_low}} = 0.70\text{ V}$ (e.g., a low-power sensor hub or idle CPU core).
* **High-Voltage Domain B**: $V_{\text{DD\_high}} = 1.10\text{ V}$ (e.g., a high-frequency GPU or memory controller).

---

### High-to-Low Level Shifters ($V_{\text{DD\_high}} \to V_{\text{DD\_low}}$)

When a $1.10\text{-V}$ High logic signal from Domain B is driven into a $0.70\text{-V}$ receiving gate in Domain A:

```text
HIGH-TO-LOW LEVEL SHIFTER (SIMPLE BUFFER)

 High Domain B Signal (1.10V High / 0.0V Low)
       │
       ▼
 ┌──────────┐  Powered by V_DD_low (0.70V)
 │ Inverter ├─────────────────────────────────► Output Signal to Domain A
 └────┬─────┘                                  (0.70V High / 0.0V Low)
      │
     GND
```

Evaluate the PMOS transistor in Domain A's input inverter when receiving $V_{\text{in}} = 1.10\text{ V}$:

$$V_{\text{gs,p}} = V_{\text{in}} - V_{\text{DD\_low}} = 1.10\text{ V} - 0.70\text{ V} = +0.40\text{ V}$$

Because $V_{\text{gs,p}} = +0.40\text{ V} > 0.0\text{ V}$, the PMOS transistor is **strongly turned OFF**!

#### Physical Result:
High-to-Low level conversion is trivial! A simple standard buffer or inverter powered by $V_{\text{DD\_low}}$ functions as a safe High-to-Low level shifter because a $1.10\text{-V}$ signal easily turns off a $0.70\text{-V}$ PMOS transistor without DC leakage.

---

### Low-to-High Level Shifters ($V_{\text{DD\_low}} \to V_{\text{DD\_high}}$)

Now consider the opposite, dangerous direction: Domain A ($V_{\text{DD\_low}} = 0.70\text{ V}$) drives a logical High ($0.70\text{ V}$) into Domain B ($V_{\text{DD\_high}} = 1.10\text{ V}$).

Evaluate the PMOS transistor inside Domain B's input inverter when receiving $V_{\text{in}} = 0.70\text{ V}$:

$$V_{\text{gs,p}} = V_{\text{in}} - V_{\text{DD\_high}} = 0.70\text{ V} - 1.10\text{ V} = \mathbf{-0.40 \text{ Volts}}$$

Compare $|V_{\text{gs,p}}|$ against the PMOS threshold voltage $|V_{\text{th,p}}| \approx 0.25\text{ V}$:

$$|V_{\text{gs,p}}| = 0.40\text{ V} > |V_{\text{th,p}}| \, (0.25\text{ V}) \implies \mathbf{\text{PMOS IS TURNED ON!}}$$

#### The Un-Shifted Failure:
The PMOS transistor in $1.10\text{-V}$ Domain B **NEVER TURNS OFF** when receiving a $0.70\text{-V}$ High signal! 

Both PMOS and NMOS transistors remain conducting simultaneously, draining continuous DC short-circuit current from Domain B's $1.10\text{-V}$ supply rail to Ground!

To convert $0.70\text{-V}$ High signals to $1.10\text{-V}$ High signals cleanly, hardware engineers use a **Cross-Coupled Differential Level Shifter Cell**.

---

### Architecture of a Cross-Coupled Differential Level Shifter

A standard Low-to-High Level Shifter consists of four transistors operating in a differential latch topology, powered by $V_{\text{DD\_high}}$:

```text
CROSS-COUPLED DIFFERENTIAL LEVEL SHIFTER SCHEMATIC

                        High Supply Rail V_DD_high (1.10V)
                           │                       │
                       ┌───┴───┐               ┌───┴───┐
                       │PMOS P1│               │PMOS P2│
                       └───┬───┘               └───┬───┘
                           │   ▲               ▲   │
                           │   └──────┐ ┌──────┘   │
                           ├──────────┼─┼──────────┤
                           │          │ │          │
                           ▼ Out_n    │ │          ▼ Out_p ──► Output (1.10V)
                       ┌───┴───┐      │ │      ┌───┴───┐
  In_low (0.70V) ─────►│NMOS N1│      └─┼─────►│NMOS N2│◄── Inv_In_low (0.70V)
                       └───┬───┘        │      └───┬───┘
                           │            │          │
                          GND          GND        GND
```

#### Detailed Physical Operation of the Differential Level Shifter:

1. **Input Stage ($V_{\text{DD\_low}} = 0.70\text{ V}$ Domain)**:
   * The incoming $0.70\text{-V}$ signal $In_{\text{low}}$ drives the gate of NMOS transistor $N_1$.
   * An inverter powered by $V_{\text{DD\_low}}$ produces the complementary signal $\overline{In_{\text{low}}}$, driving the gate of NMOS transistor $N_2$.
2. **When $In_{\text{low}} = 0.70\text{ V}$ (Logic High in $0.70\text{-V}$ Domain)**:
   * $N_1$ turns **ON** ($V_{\text{gs,N1}} = 0.70\text{ V} > V_{\text{th,n}}$), pulling node $Out_n$ down to Ground ($0.0\text{ V}$).
   * $\overline{In_{\text{low}}} = 0.0\text{ V}$, turning $N_2$ **OFF**.
   * Because node $Out_n$ is pulled to $0.0\text{ V}$, it drives the gate of PMOS transistor $P_2$.
   * $P_2$ turns **ON** ($V_{\text{gs,P2}} = 0.0\text{ V} - 1.10\text{ V} = -1.10\text{ V}$), pulling output node $Out_p$ up to **FULL $V_{\text{DD\_high}} = 1.10\text{ Volts}$**!
   * Node $Out_p = 1.10\text{ V}$ feeds back to the gate of PMOS transistor $P_1$.
   * $P_1$ turns **OFF** ($V_{\text{gs,P1}} = 1.10\text{ V} - 1.10\text{ V} = 0.0\text{ V}$), breaking DC current flow completely!

#### The Physical Level-Shifting Result:
* The input $In_{\text{low}} = 0.70\text{ V}$ was shifted up to a **pure, full-amplitude $Out_p = 1.10\text{ Volts}$**!
* Both $P_1$ and $N_2$ are turned completely OFF in steady state. **Zero DC short-circuit leakage current flows!**

---

## Unified Power Format (UPF / IEEE 1801) Isolation and Level Shifter Intent

In modern ASIC design flows, physical boundary cells (Isolation Clamps and Level Shifters) are not written manually by hand in SystemVerilog RTL code.

Instead, hardware architects write a **Unified Power Format (UPF / IEEE 1801)** power intent specification file alongside the RTL code.

The logic synthesis and Place & Route (P&R) EDA tools (such as Synopsys Design Compiler, IC Compiler II, or Cadence Innovus) read the UPF file and **automatically insert isolation clamp cells and level shifter cells into the gate-level netlist**!

```text
UPF POWER INTENT SPECIFICATION FLOW

 SystemVerilog RTL Code + IEEE 1801 UPF File
 ┌─────────────────────────────────────────────────────────────┐
 │ set_isolation iso_out -domain PD_A -applies_to outputs     │
 │   -clamp_value 0 -location parent                           │
 │ set_level_shifter ls_out -domain PD_LOW -applies_to outputs │
 │   -location self -rule low_to_high                          │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Logic Synthesis / Place & Route EDA Tools
 Gate-Level Physical Netlist with Injected Boundary Cells
 ┌─────────────────────────────────────────────────────────────┐
 │ Auto-Inserted AND-based Isolation Clamps & Level Shifters   │
 └─────────────────────────────────────────────────────────────┘
```

---

### Standard UPF Commands for Boundary Cells

Here are the exact IEEE 1801 UPF commands used to specify isolation and level shifting strategies:

#### 1. Specifying Isolation Clamp Strategy (`set_isolation`)
```tcl
# Define isolation strategy for power domain PD_A
create_isolation_policy iso_domain_A \
    -domain PD_A \
    -applies_to outputs \
    -clamp_value 0 \
    -location parent

# Connect isolation control signal
connect_isolation_logic iso_domain_A \
    -isolation_signal PMU_ISO_EN \
    -isolation_sense high
```
* `-clamp_value 0`: Forces all output boundary wires of domain `PD_A` to $0.0\text{ V}$ during power-down.
* `-location parent`: Places the isolation clamp cells physically in the receiving, always-powered parent domain ($V_{\text{DD\_active}}$).

#### 2. Specifying Level Shifter Strategy (`set_level_shifter`)
```tcl
# Define level shifter strategy for low-voltage domain PD_LOW
create_level_shifter_policy ls_domain_low \
    -domain PD_LOW \
    -applies_to outputs \
    -rule low_to_high \
    -location self
```
* `-rule low_to_high`: Automatically identifies all output signals leaving `PD_LOW` ($0.70\text{ V}$) and entering higher-voltage domains ($1.10\text{ V}$).
* `-location self`: Places the cross-coupled level shifter cells at the boundary of `PD_LOW`.

---

### Power-Aware Simulation (PA-Sim / NLP) 'X' State Propagation

During RTL simulation, how do verification engineers verify that isolation clamp cells have been specified correctly?

Standard Verilog simulators do not model power rails; they treat all wires as active $1$s or $0$s.

Hardware teams use **Power-Aware Simulators (PA-Sim / Native Low Power - NLP)**:
1. When a power domain enters Sleep Mode in UPF, the PA-Sim engine **automatically forces all un-isolated output signals inside that domain to an 'X' (unknown/floating) state**.
2. If an engineer forgot to specify an isolation clamp cell on a boundary wire, the 'X' value propagates directly into the receiving active domain.
3. The downstream active control state machine receives the 'X' state and enters an illegal state, triggering an immediate **Simulation Testbench Assertion Failure**!
4. This power-aware simulation check guarantees $100\%$ boundary isolation verification before sending the chip to the silicon foundry!

---

## Solved Industrial Engineering Exercise: Quantitative Analysis of Un-Isolated Crowbar Leakage, Un-Shifted PMOS Conduction, and UPF Boundary Cell Insertion

To consolidate your complete, mathematical understanding of isolation clamp cells, level shifters, crowbar short-circuit leakage, and UPF boundary rules, let us work through a complete, step-by-step quantitative engineering problem.

---

### Scenario and Parameters

You are a principal physical design sign-off architect auditing a multi-voltage, power-gated SoC fabricated on a $28\text{nm}$ CMOS technology node.

The SoC contains two power domains:
* **Domain A (Power-Gated Low-Voltage Domain)**: Operates at $V_{\text{DD\_low}} = 0.70\text{ V}$. When power-gated, $V_{\text{DD\_virtual\_A}} \to 0.0\text{ V}$.
* **Domain B (Always-On High-Voltage Domain)**: Operates at $V_{\text{DD\_high}} = 1.10\text{ V}$.

```text
28NM MULTI-VOLTAGE SOC BOUNDARY MODEL

 Domain A (Low-Voltage: 0.70V / Power-Gated) ──128 Boundary Wires──► Domain B (High-Voltage: 1.10V / Always-On)
 
 Domain B Input Inverter Transistor Parameters:
   PMOS: mu_p * C_ox * (W_p/L_p) = 1.20 mA/V^2 | |V_th_p| = 0.25 Volts
   NMOS: mu_n * C_ox * (W_n/L_n) = 2.40 mA/V^2 |  V_th_n  = 0.25 Volts

 Boundary Conditions to Evaluate:
   Scenario 1 (Un-Isolated Sleep)   : Domain A OFF -> 128 Wires Float to V_float = 0.55V into Domain B
   Scenario 2 (Un-Shifted Active)  : Domain A ON (0.70V High) -> Drives 0.70V High into Domain B (1.10V)
   Scenario 3 (Fully Isolated & Shifted): AND Clamps (0.0V) + Cross-Coupled Level Shifters Installed
```

#### Hardware & Interface Parameters:
* Number of Boundary Wires: $N_{\text{wires}} = 128\text{ interconnect wires}$ running from Domain A to Domain B.
* Domain B Input Inverter Transistor Parameters:
  * PMOS Transconductance: $\beta_p = \mu_p C_{\text{ox}} \left(\frac{W_p}{L_p}\right) = 1.20\text{ mA/V}^2 = 1.20 \times 10^{-3}\text{ A/V}^2$.
  * NMOS Transconductance: $\beta_n = \mu_n C_{\text{ox}} \left(\frac{W_n}{L_n}\right) = 2.40\text{ mA/V}^2 = 2.40 \times 10^{-3}\text{ A/V}^2$.
  * Threshold Voltages: $V_{\text{th,n}} = |V_{\text{th,p}}| = 0.25\text{ V}$.
* Boundary Cell Overhead (Scenario 3):
  * 128 AND Isolation Clamp Cells + 128 Level Shifter Cells total static/dynamic overhead $P_{\text{overhead}} = 0.150\text{ mW} = 0.150 \times 10^{-3}\text{ W}$.

---

### Your Objective

1. Analyze **Scenario 1 (Un-Isolated Sleep)**:
   * Domain A powers down ($V_{\text{DD\_virtual\_A}} \to 0.0\text{ V}$). All 128 boundary wires float to $V_{\text{float}} = 0.55\text{ V}$.
   * Calculate the crowbar short-circuit current per line ($I_{\text{crowbar}}$) and total DC leakage power ($P_{\text{leak\_unisolated}}$) dissipated in Domain B's 128 input gates.
2. Analyze **Scenario 2 (Un-Shifted Active Operation)**:
   * Domain A is active at $0.70\text{ V}$. Domain A drives a logical High ($0.70\text{ V}$) directly into Domain B ($1.10\text{ V}$) without a level shifter.
   * Calculate PMOS gate-to-source voltage $|V_{\text{gs,p}}|$ in Domain B, single-line PMOS leakage current ($I_{\text{pmos\_unshifted}}$), and total un-shifted DC leakage power ($P_{\text{leak\_unshifted}}$) across all 128 lines.
3. Analyze **Scenario 3 (Fully Isolated & Level-Shifted Solution)**:
   * Calculate total static power ($P_{\text{static\_Scenario3}}$) when AND Isolation Clamps (clamp-to-0) and Cross-Coupled Level Shifters are enabled.
4. Calculate net power saved (in mW) and percentage leakage reduction achieved by Scenario 3 over Scenario 1 and Scenario 2.
5. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Scenario 1 (Un-Isolated Sleep — Floating Input Crowbar Leakage)

All 128 boundary wires float to $V_{\text{float}} = 0.55\text{ V}$ into Domain B ($V_{\text{DD\_high}} = 1.10\text{ V}$).

##### 1. Evaluate Transistor States in Domain B Input Gates:
* NMOS: $V_{\text{gs,n}} = 0.55\text{ V} > V_{\text{th,n}} \, (0.25\text{ V}) \implies \mathbf{\text{NMOS is ON (Saturation)!}}$
* PMOS: $|V_{\text{gs,p}}| = 1.10\text{ V} - 0.55\text{ V} = 0.55\text{ V} > |V_{\text{th,p}}| \, (0.25\text{ V}) \implies \mathbf{\text{PMOS is ON (Saturation)!}}$

Both transistors conduct simultaneously in saturation!

##### 2. Calculate Short-Circuit Crowbar Current per Line ($I_{\text{crowbar}}$):
Using the saturation current equation for the NMOS transistor ($V_{\text{gs,n}} = 0.55\text{ V}$, $V_{\text{th,n}} = 0.25\text{ V}$):

$$I_{\text{crowbar}} = \frac{1}{2} \cdot \beta_n \cdot (V_{\text{gs,n}} - V_{\text{th,n}})^2$$

$$I_{\text{crowbar}} = \frac{1}{2} \cdot (2.40 \times 10^{-3}\text{ A/V}^2) \cdot (0.55\text{ V} - 0.25\text{ V})^2$$

$$I_{\text{crowbar}} = (1.20 \times 10^{-3}) \cdot (0.30\text{ V})^2 = (1.20 \times 10^{-3}) \cdot (0.09) = \mathbf{0.108 \times 10^{-3} \text{ A}} = \mathbf{108.0 \text{ }\mu\text{A per line}}$$

##### 3. Calculate Total Un-Isolated Crowbar Leakage Power ($P_{\text{leak\_unisolated}}$) across 128 lines:

$$I_{\text{total\_crowbar}} = 128 \text{ lines} \times 108.0 \times 10^{-6}\text{ A/line} = \mathbf{0.013824 \text{ Amperes}} = \mathbf{13.824 \text{ mA}}$$

$$P_{\text{leak\_unisolated}} = I_{\text{total\_crowbar}} \cdot V_{\text{DD\_high}} = 0.013824\text{ A} \times 1.10\text{ V} = \mathbf{0.015206 \text{ Watts}} = \mathbf{15.206 \text{ mW}}$$

In Scenario 1, unpowered Domain A causes active Domain B to drain **$15.206\text{ mW}$ of continuous DC short-circuit leakage power**!

---

#### Step 2: Analyze Scenario 2 (Un-Shifted Active Operation — Low-to-High Leakage)

Domain A ($0.70\text{ V}$) drives a logical High ($0.70\text{ V}$) directly into Domain B ($1.10\text{ V}$) without a level shifter.

##### 1. Calculate PMOS $|V_{\text{gs,p}}|$ in Domain B:

$$|V_{\text{gs,p}}| = V_{\text{DD\_high}} - V_{\text{in}} = 1.10\text{ V} - 0.70\text{ V} = \mathbf{0.40 \text{ Volts}}$$

Since $|V_{\text{gs,p}}| = 0.40\text{ V} > |V_{\text{th,p}}| \, (0.25\text{ V})$, **the PMOS transistor NEVER turns OFF!**

##### 2. Calculate Un-Shifted PMOS Current per Line ($I_{\text{pmos\_unshifted}}$):
The PMOS transistor operates in saturation with $V_{\text{sg,p}} = 0.40\text{ V}$:

$$I_{\text{pmos\_unshifted}} = \frac{1}{2} \cdot \beta_p \cdot (|V_{\text{gs,p}}| - |V_{\text{th,p}}|)^2$$

$$I_{\text{pmos\_unshifted}} = \frac{1}{2} \cdot (1.20 \times 10^{-3}\text{ A/V}^2) \cdot (0.40\text{ V} - 0.25\text{ V})^2$$

$$I_{\text{pmos\_unshifted}} = (0.60 \times 10^{-3}) \cdot (0.15\text{ V})^2 = (0.60 \times 10^{-3}) \cdot (0.0225) = \mathbf{0.0135 \times 10^{-3} \text{ A}} = \mathbf{13.50 \text{ }\mu\text{A per line}}$$

##### 3. Calculate Total Un-Shifted Leakage Power ($P_{\text{leak\_unshifted}}$) across 128 lines:

$$I_{\text{total\_unshifted}} = 128 \text{ lines} \times 13.50 \times 10^{-6}\text{ A/line} = \mathbf{0.001728 \text{ Amperes}} = \mathbf{1.728 \text{ mA}}$$

$$P_{\text{leak\_unshifted}} = I_{\text{total\_unshifted}} \cdot V_{\text{DD\_high}} = 0.001728\text{ A} \times 1.10\text{ V} = \mathbf{0.0019008 \text{ Watts}} = \mathbf{1.901 \text{ mW}}$$

In Scenario 2, driving $0.70\text{-V}$ High signals directly into $1.10\text{-V}$ Domain B drains **$1.901\text{ mW}$ of continuous DC short-circuit leakage power**!

---

#### Step 3: Analyze Scenario 3 (Fully Isolated & Level-Shifted Solution)

Under Scenario 3, AND Isolation Clamps (clamp-to-0) and Cross-Coupled Level Shifters are installed at the boundary.

* **During Sleep Mode**: Isolation clamps force input lines to $0.0\text{ V}$. $I_{\text{crowbar}} = 0.0\text{ A}$.
* **During Active Mode**: Level shifters shift $0.70\text{-V}$ High signals to full $1.10\text{-V}$ High signals. $|V_{\text{gs,p}}| = 1.10\text{ V} - 1.10\text{ V} = 0.0\text{ V} < |V_{\text{th,p}}| \implies I_{\text{pmos}} = 0.0\text{ A}$.
* **Total Boundary Leakage**: DC short-circuit leakage is reduced to **$0.0\text{ mW}$**!
* **Overhead Power**: The 128 isolation clamps + 128 level shifters dissipate a total overhead power $P_{\text{overhead}} = \mathbf{0.150 \text{ mW}}$.

```text
BOUNDARY POWER PERFORMANCE COMPARISON

 Boundary Configuration Scenario │ Physical Failure Mode          │ Total DC Leakage Power
─────────────────────────────────┼────────────────────────────────┼────────────────────────
 Scenario 1: Un-Isolated Sleep   │ Floating Output Crowbar Leak   │ 15.206 mW (CRASH!)
 Scenario 2: Un-Shifted Active   │ Un-Shifted PMOS DC Conduction  │  1.901 mW (LEAKAGE!)
 Scenario 3: Isolated & Shifted  │ None (100% Hardware Protected) │  0.150 mW (OVERHEAD)
```

---

#### Step 4: Calculate Power Savings and Percentage Reductions

##### 1. Power Saved in Sleep Mode (Scenario 3 vs Scenario 1):

$$\Delta P_{\text{saved\_sleep}} = 15.206\text{ mW} - 0.150\text{ mW} = \mathbf{15.056 \text{ mW Saved!}}$$

$$\text{Leakage Reduction \%} = \left( 1 - \frac{0.150\text{ mW}}{15.206\text{ mW}} \right) \times 100\% = \mathbf{99.01\% \text{ Leakage Reduction in Sleep!}}$$

##### 2. Power Saved in Active Mode (Scenario 3 vs Scenario 2):

$$\Delta P_{\text{saved\_active}} = 1.901\text{ mW} - 0.150\text{ mW} = \mathbf{1.751 \text{ mW Saved!}}$$

$$\text{Leakage Reduction \%} = \left( 1 - \frac{0.150\text{ mW}}{1.901\text{ mW}} \right) \times 100\% = \mathbf{92.11\% \text{ Leakage Reduction in Active Mode!}}$$

##### Engineering Conclusion:
Installing Isolation Clamps and Level Shifters eliminated $15.206\text{ mW}$ of floating output crowbar leakage (**$99.01\%$ leakage reduction in sleep mode**) and eliminated $1.901\text{ mW}$ of un-shifted PMOS conduction (**$92.11\%$ leakage reduction in active mode**), protecting the SoC against 'X' state corruptions and short-circuit current destruction!

---

### Sanity Check and Verification

Let us verify our mathematical and physical derivations:

1. **Crowbar Current Formula Check**:
   * $V_{\text{gs,n}} - V_{\text{th,n}} = 0.55\text{ V} - 0.25\text{ V} = 0.30\text{ V}$.
   * $I_{\text{crowbar}} = 0.5 \times 2.40 \text{ mA/V}^2 \times (0.30)^2 = 1.20 \times 0.09 = 0.108\text{ mA} = 108.0\ \mu\text{A}$.
   * 128 lines $\times 108\ \mu\text{A} = 13.824\text{ mA}$.
   * Power $= 13.824\text{ mA} \times 1.10\text{ V} = 15.2064\text{ mW}$. Math verified $100\%$!

2. **Level Shifter PMOS Conduction Check**:
   * Un-shifted $|V_{\text{gs,p}}| - |V_{\text{th,p}}| = (1.10 - 0.70) - 0.25 = 0.15\text{ V}$.
   * $I_{\text{pmos}} = 0.5 \times 1.20 \text{ mA/V}^2 \times (0.15)^2 = 0.60 \times 0.0225 = 0.0135\text{ mA} = 13.50\ \mu\text{A}$.
   * 128 lines $\times 13.50\ \mu\text{A} = 1.728\text{ mA}$.
   * Power $= 1.728\text{ mA} \times 1.10\text{ V} = 1.9008\text{ mW}$. Math verified $100\%$!

3. **Level Shifter Differential Lock Invariant**:
   * When $In_{\text{low}} = 0.70\text{ V}$, $N_1$ pulls $Out_n \to 0.0\text{ V}$, turning $P_2$ ON to drive $Out_p \to 1.10\text{ V}$.
   * $Out_p = 1.10\text{ V}$ turns $P_1$ OFF completely ($V_{\text{gs,P1}} = 0.0\text{ V}$).
   * Cross-coupled PMOS latch eliminates DC current path $100\%$ in steady state.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Isolation Clamp Cell**: A boundary logic gate (AND-based clamp-to-0, OR-based clamp-to-1, or latch-based freeze) powered by an active receiving domain that clamps floating outputs of an unpowered domain to a solid, deterministic logic level ($0.0\text{ V}$ or $V_{DD}$), preventing short-circuit crowbar leakage currents and 'X' state corruptions in active downstream gates.
* **Level Shifter Cell**: A multi-voltage boundary translation circuit—such as a cross-coupled differential level shifter—that shifts digital signal voltage swings between unequal supply voltage domains ($V_{\text{DD\_low}} \leftrightarrow V_{\text{DD\_high}}$), ensuring that receiving transistors turn OFF completely to eliminate continuous DC short-circuit leakage.