---
title: "Header and Footer Power Switch Transistors and Inrush Current Mitigation"
---

# Header and Footer Power Switch Transistors and Inrush Current Mitigation

In digital integrated circuit design, clock gating is a powerful technique for reducing dynamic switching power. By stopping the clock tree from toggling the clock pins of idle registers, clock gating drops dynamic power dissipation ($P_{\text{dyn}} = \alpha \cdot C_L \cdot V_{DD}^2 \cdot f$) to near zero. However, clock gating does **nothing** to stop static leakage power!

In advanced sub-7nm process nodes, transistors left physically connected to power rails continue leaking subthreshold and gate-oxide currents ($I_{\text{sub}} + I_{\text{gate}}$) even when their clock inputs are completely frozen. If a large execution block—such as an NPU neural tensor engine, a 64-bit vector unit, or a graphics shader core—sits idle for thousands of clock cycles, keeping its transistors connected to the supply rails drains continuous static leakage energy, draining battery reserves and heating up the silicon die for zero computational benefit.

To eliminate static leakage power during idle periods, computer architects use **Power Gating**. Power gating physically disconnects an idle logic block from its power supply rail ($V_{DD}$) or ground rail ($GND$) using high-threshold transistor switches.

However, physically cutting power to a silicon block introduces two major hardware engineering hazards:
1. **Virtual Rail Collapse and State Loss**: Disconnecting the power rail causes the internal virtual voltage rail ($V_{DD\_virtual}$) to collapse to $0.0\text{ Volts}$, eliminating $100\%$ of static leakage current. But when the virtual power rail collapses, **all stored data values in flip-flops and latches inside that power domain are completely destroyed**!
2. **The Inrush Current Spike**: When the power domain is commanded to wake up, connecting the $1.0\text{-Volt}$ global power supply rail to the completely empty, discharged virtual power rail ($0.0\text{ V}$) triggers a massive, instantaneous surge of electrical current: **Inrush Current**. 

This sudden surge of current creates an inductive $L \cdot \frac{di}{dt}$ voltage droop on the global power supply grid. This voltage droop propagates across the motherboard, dropping the supply voltage of neighboring active CPU cores and causing setup timing violations that crash the entire microprocessor!

To safely power-down idle silicon blocks without causing supply voltage crashes, hardware engineers employ **Header and Footer Power Switch Transistors** paired with **Inrush Current Mitigation** techniques.

```text
HEADER VS. FOOTER POWER GATING TOPOLOGY

 1. Header Power Switch (PMOS)          2. Footer Power Switch (NMOS)
 Real Supply V_DD                       Real Supply V_DD
    │                                      │
 ┌──┴──┐                                ┌──┴──┐
 │ PMOS│ Power Switch (Header)          │Logic│ Active Logic Block
 └──┬──┘ Driven by SLEEP_N              │Block│ (Un-gated V_DD)
    │                                   └──┬──┘
    ▼ Virtual Supply V_DD_virtual          │ Virtual Ground GND_virtual
 ┌──┴──┐                                ┌──┴──┐
 │Logic│ Active Logic Block             │ NMOS│ Power Switch (Footer)
 │Block│ (Power-Gated)                  └──┬──┘ Driven by SLEEP
 └──┬──┘                                   │
    │                                      ▼
 Real Ground GND                       Real Ground GND
```


### Analogy 2: Filling the Depressurized Pipe Network (Inrush Current Mitigation)

Now, imagine the homeowner returns from vacation and wants to turn the water back ON.

The home's internal pipes are completely empty and depressurized at 0 PSI (**Discharged Virtual Rail $V_{DD\_virtual} = 0\text{ V}$**). Outside in the street, the main municipal water pipe is running at high pressure (**Global Power Rail $V_{DD} = 1.0\text{ V}$**).

```text
INRUSH WATER SURGE AND NEIGHBORHOOD PRESSURE DROP

 Sudden Valve Slam (Un-Mitigated Inrush):
 Main Water (60 PSI) ──► Slam Master Valve OPEN!
                         │
                         ▼ Water Rushes at Maximum Velocity into Empty Pipes!
                         Street Main Pressure Drops from 60 PSI -> 20 PSI!
                         (Neighbor's shower turns cold! Appliances fail!)

 Staged Bypass Valve (Mitigated Inrush):
 Main Water (60 PSI) ──► Open Tiny 10% Bypass Valve First!
                         │
                         ▼ Pipes Pressurize Slowly (0 -> 50 PSI over 5 Secs)
                         Open Main Valve Wide! (ZERO Street Pressure Drop!)
```

Consider what happens if the homeowner slams the master valve wide open in a fraction of a second:
1. High-pressure water from the street main rushes into the empty, 0-PSI home pipes at maximum velocity to fill the vacuum (**Inrush Current Surge $I_{\text{inrush}}$**).
2. Because the water draw is so sudden and massive, **the water pressure in the street main drops from 60 PSI down to 20 PSI** (**Global Voltage Droop $L \cdot \frac{di}{dt}$**)!
3. Neighboring houses on the exact same street (**Adjacent Active CPU Cores**) suddenly suffer a severe drop in water pressure! Their showers turn cold, and their appliances malfunction!

#### The Engineering Solution (Staged Bypass Valves):
To prevent neighborhood pressure drops, the plumber installs a **Two-Stage Bypass Valve Assembly (Staged Power Switch Enable / Daisy-Chaining)**:
* First, the homeowner opens a tiny $10\%$ bypass valve (**Weak Primer Power Switch**).
* Water trickles into the empty home pipes slowly over 5 seconds. The internal pipe pressure rises smoothly from 0 PSI to 50 PSI without affecting street pressure.
* Once the home pipes are $90\%$ pressurized, the homeowner opens the main $100\%$ valve wide open (**Main Power Switches**)!
* Zero pressure drop occurs on the street, and all neighboring houses continue running perfectly!


### Topology 1: PMOS Header Power Switches

A **Header Power Switch** consists of one or more PMOS transistors connected between the global real supply rail ($V_{DD\_global}$) and the local virtual supply rail ($V_{DD\_virtual}$).

The PMOS header switch is controlled by an **active-low sleep signal ($\text{SLEEP\_N}$)**:

* **Active Mode ($\text{SLEEP\_N} = 1 / 1.0\text{ V}$)**:
  The PMOS gate-to-source voltage is $V_{\text{gs,p}} = 1.0\text{ V} - 1.0\text{ V} = 0.0\text{ V}$. 
  
  Wait! For a PMOS transistor, $V_{\text{gs,p}} = 0\text{ V}$ turns the transistor **ON** (because the active-low enable is driven to Ground: $V_{\text{gate}} = 0\text{ V} \implies V_{\text{gs,p}} = 0 - V_{DD} = -V_{DD}$).
  
  The PMOS channel conducts, tying the virtual rail $V_{DD\_virtual}$ directly to $V_{DD\_global}$. The logic block operates normally.

* **Sleep Mode ($\text{SLEEP\_N} = 0 / 0.0\text{ V} \implies V_{\text{gate}} = V_{DD} \implies V_{\text{gs,p}} = 0\text{ V}$)**:
  The PMOS gate voltage is driven to $V_{DD}$. $V_{\text{gs,p}} = 0\text{ V} > V_{\text{th,p}}$. The PMOS transistor turns **OFF**.
  
  The virtual supply rail $V_{DD\_virtual}$ is disconnected from $V_{DD\_global}$ and floats down to $0.0\text{ V}$ as internal leakage currents discharge $C_{\text{virtual}}$.


### Comparing Header (PMOS) vs. Footer (NMOS) Switches

Which topology should a digital architect select for a given power domain? Let us compare their physical parameters:

```text
HEADER (PMOS) VS. FOOTER (NMOS) POWER SWITCH MATRIX

 Physical Parameter     │ Header Power Switch (PMOS)     │ Footer Power Switch (NMOS)
────────────────────────┼────────────────────────────────┼─────────────────────────────────
 Carrier Mobility       │ Lower (Holes: ~120 cm^2/V-s)   │ Higher (Electrons: ~300 cm^2/V-s)
 Required Transistor W  │ Larger (~2.0x to 2.5x Width)   │ Smaller (~1.0x Width)
 Silicon Area Overhead  │ Higher Area Overhead           │ Lower Area Overhead (Saves Area)
 Virtual Rail Behavior  │ V_DD_virtual drops to 0V       │ GND_virtual floats up to V_DD
 Substrate Noise Impact │ Minimal Substrate Noise        │ High Ground Bounce Noise
 Dominant Industry Use  │ Dominant for Digital CPU Cores │ Used in Memory Arrays / GPUs
```

1. **Area Advantage of NMOS Footers**:
   Because electron mobility in NMOS channels ($\mu_n$) is $2 \times \text{ to } 2.5\times$ higher than hole mobility in PMOS channels ($\mu_p$), an NMOS footer transistor provides the same channel resistance $R_{\text{on}}$ using **less than half the physical silicon area** of a PMOS header transistor!
2. **Noise and Substrate Advantage of PMOS Headers**:
   When a PMOS header is in Sleep Mode, $V_{DD\_virtual}$ drops to $0.0\text{ V}$, while the true ground substrate ($GND_{\text{global}} = 0.0\text{ V}$) remains anchored to $0.0\text{ V}$. 
   
   In an NMOS footer in Sleep Mode, $GND_{\text{virtual}}$ floats up to $V_{DD} = 1.0\text{ V}$. This causes body-bias shifts and injects ground bounce noise into adjacent un-gated logic.

For this reason, **PMOS Header Switches are the dominant industry choice** for power-gating digital CPU cores, execution units, and network processing blocks.


### Deriving the Required Power Switch Transistor Width ($W_{\text{switch}}$)

To keep performance degradation under $1\%$, physical design tools enforce a maximum allowable voltage drop constraint:

$$\Delta V_{\text{switch}} \le \Delta V_{\text{max\_allowed}} \quad (\text{typically } \Delta V_{\text{max\_allowed}} \le 0.01 \cdot V_{DD} \approx 10\text{ mV})$$

The channel resistance $R_{\text{switch}}$ of a PMOS header transistor operating in its linear region is:

$$R_{\text{switch}} = \frac{1}{\mu_p C_{\text{ox}} \left(\frac{W_{\text{switch}}}{L}\right) (V_{DD} - |V_{\text{th,p}}|)}$$

To achieve a target total resistance $R_{\text{switch\_total}}$ across an array of $M$ parallel power switches, we substitute $R_{\text{switch\_total}} = \frac{\Delta V_{\text{max\_allowed}}}{I_{\text{active}}}$ and solve for the total required PMOS channel width $W_{\text{switch\_total}}$:

$$\mathbf{W_{\text{switch\_total}} \ge \frac{L \cdot I_{\text{active}}}{\mu_p C_{\text{ox}} \cdot (V_{DD} - |V_{\text{th,p}}|) \cdot \Delta V_{\text{max\_allowed}}}}$$

Where:
* $W_{\text{switch\_total}}$ is the total combined width of all PMOS power switch transistors in meters ($\text{m}$).
* $L$ is the physical channel length of the power switch transistor in meters ($\text{m}$).
* $I_{\text{active}}$ is the peak active current drawn by the power domain in Amperes ($\text{A}$).
* $\mu_p C_{\text{ox}}$ is the PMOS process transconductance gain in $\text{A/V}^2$.
* $V_{DD}$ is the global supply voltage in Volts ($\text{V}$).
* $|V_{\text{th,p}}|$ is the PMOS threshold voltage magnitude in Volts ($\text{V}$).
* $\Delta V_{\text{max\_allowed}}$ is the maximum allowable $I \cdot R$ voltage drop in Volts ($\text{V}$).

#### The Sizing Trade-off:
* **Making $W_{\text{switch}}$ too small**: $R_{\text{switch}}$ is high. The $I \cdot R$ voltage drop exceeds $\Delta V_{\text{max\_allowed}}$, slowing down the CPU core and causing setup timing violations.
* **Making $W_{\text{switch}}$ too large**: $R_{\text{switch}}$ is tiny, but the power switches occupy massive silicon area ($3\%\text{ to } 10\%$ of total die area!) and drain static leakage current through their own channels during sleep mode!


### The $L \cdot \frac{di}{dt}$ Inductive Power Supply Noise

The global power supply grid connecting the external power supply unit (PSU) to the silicon die passes through physical package bond wires, C4 micro-bumps, and motherboard traces. These physical metal connections possess parasitic inductance, denoted as $L_{\text{package}}$ (typically $0.1 \text{ to } 1.0\text{ nanoHenries}$).

According to Faraday's Law of Induction, a rapid change in current over time ($\frac{di}{dt}$) through an inductor generates an inductive voltage drop ($\Delta V_{\text{droop}}$):

$$\mathbf{\Delta V_{\text{droop}} = L_{\text{package}} \cdot \frac{d I_{\text{inrush}}}{dt}}$$

Where:
* $\Delta V_{\text{droop}}$ is the inductive voltage droop on the global $V_{DD\_global}$ supply rail in Volts ($\text{V}$).
* $L_{\text{package}}$ is the total parasitic package inductance in Henries ($\text{H}$).
* $\frac{d I_{\text{inrush}}}{dt}$ is the rate of change of inrush current over time in Amperes per second ($\text{A/s}$).

```text
GLOBAL V_DD VOLTAGE DROOP WAVEFORM DURING UN-MITIGATED WAKEUP

 Voltage
  1.00V ┼─── Stable Global V_DD ──────┐               ┌─── Restored
        │                              \  Voltage     /
  0.80V ┼───────────────────────────────\─ Droop ────/──── Minimum V_min
        │                                \          /
  0.70V ┴─────────────────────────────────┴────────┴──────► Time
                                           ▲
                                           │ SETUP TIMING FAULT IN ADJACENT CORES!
```

#### The Global System Failure:
Look at what this inductive voltage droop does to neighboring logic:
1. The power switch turns ON instantly. Current surges from $0 \to 5\text{ Amperes}$ in $20\text{ picoseconds}$ ($\frac{di}{dt} = 2.5 \times 10^{11}\text{ A/s}$).
2. The inductive voltage droop $\Delta V_{\text{droop}} = (0.5 \times 10^{-9}\text{ H}) \times (2.5 \times 10^{11}\text{ A/s}) = \mathbf{125 \text{ mV}}$!
3. The global supply voltage $V_{DD\_global}$ across the **entire microprocessor** drops from $1.00\text{ V}$ down to $0.875\text{ V}$!
4. Neighboring active CPU cores running at $3.5\text{ GHz}$ suffer immediate **Setup Timing Violations** because their supply voltage dropped below $V_{\text{min}}$.
5. The CPU executes corrupted instructions, leading to system crashes or kernel panics!


### Strategy 2: Two-Phase "Mother-Daughter" Power Switch Architecture

In a **Mother-Daughter Power Switch Architecture**, two distinct sizes of power switch transistors are used:

1. **Mother Switches (Weak Pre-Charge Switches)**: Narrow PMOS transistors with high channel resistance ($R_{\text{mother}}$) distributed across the power domain.
2. **Daughter Switches (Main Operational Switches)**: Wide PMOS transistors with low channel resistance ($R_{\text{daughter}}$).

```text
MOTHER-DAUGHTER POWER SWITCH ARCHITECTURE

 Real Supply V_DD
    │
    ├───────[ Mother Switch: High R_mother ]──────┐ (Turns ON First: Limits Inrush!)
    │                                              │
    └───────[ Daughter Switch: Low R_daughter ]────┼──► Virtual Supply V_DD_virtual
                                                   │   (Turns ON Second: Low I*R Drop!)
                                                [C_virtual]
                                                   │
                                                  GND
```

* **Phase 1 (Pre-Charge)**: The sleep controller turns ON *only* the Mother switches. $R_{\text{mother}}$ limits inrush current to a safe, constant value while pre-charging $C_{\text{virtual}}$ to $90\%$ of $V_{DD}$.
* **Phase 2 (Main Tie-Off)**: Once $V_{DD\_virtual} \ge 0.90 \cdot V_{DD}$, the controller turns ON the Daughter switches, providing a low-resistance path ($R_{\text{daughter}}$) for active execution!


### Scenario and Parameters

You are a senior physical design sign-off engineer configuring a power-gated vector processing execution unit on a $28\text{nm}$ CMOS technology node.

The execution unit operates at a global supply voltage $V_{DD\_global} = 0.95\text{ V}$ and a master clock frequency $f = 2.8\text{ GHz}$ ($T_{\text{clk}} = 357.14\text{ ps}$).

```text
28NM POWER-GATED VECTOR UNIT CIRCUIT MODEL

 Power Domain Specifications:
   V_DD_global       = 0.95 Volts
   I_active_max      = 450.0 mA (0.450 A Peak Active Current)
   C_virtual         = 120.0 pF (120.0 * 10^-12 F Virtual Rail Load)
   L_package         = 0.50 nH (0.50 * 10^-9 H Package Inductance)

 PMOS Header Transistor Parameters:
   L                 = 30.0 nm (0.030 um Channel Length)
   mu_p * C_ox       = 150.0 uA/V^2 (0.000150 A/V^2 Process Gain)
   |V_th_p|          = 0.25 Volts
   Delta V_max       = 9.5 mV (1% Max Allowed Voltage Drop)

 Un-Mitigated Turn-On Time:
   t_turnon          = 20.0 ps (All switches turn ON simultaneously)
```

#### Hardware & Process Parameters:
* Global Supply Voltage: $V_{DD\_global} = 0.95\text{ V}$.
* Peak Active Current Draw: $I_{\text{active\_max}} = 450.0\text{ mA} = 0.450\text{ A}$.
* Virtual Power Rail Load Capacitance: $C_{\text{virtual}} = 120.0\text{ pF} = 120.0 \times 10^{-12}\text{ F}$.
* Maximum Allowable Active $I \cdot R$ Voltage Drop: $\Delta V_{\text{max\_allowed}} = 9.5\text{ mV} = 0.0095\text{ V}$ ($1.0\%$ of $V_{DD\_global}$).
* PMOS Header Switch Parameters:
  * Channel Length: $L = 30.0\text{ nm} = 0.030\ \mu\text{m}$.
  * Process Transconductance Gain: $\mu_p C_{\text{ox}} = 150.0\ \mu\text{A/V}^2 = 150.0 \times 10^{-6}\text{ A/V}^2$.
  * Threshold Voltage Magnitude: $|V_{\text{th,p}}| = 0.25\text{ V}$.
* Package Parasitic Inductance: $L_{\text{package}} = 0.50\text{ nH} = 0.50 \times 10^{-9}\text{ H}$.
* Un-mitigated Power Switch Turn-On Time: $t_{\text{turnon}} = 20.0\text{ ps} = 20.0 \times 10^{-12}\text{ s}$.


### Step-by-Step Derivation

#### Step 1: Calculate Maximum Allowable Power Switch Resistance ($R_{\text{switch\_total}}$)

Using Ohm's Law for the active $I \cdot R$ voltage drop constraint:

$$\Delta V_{\text{switch}} = I_{\text{active\_max}} \cdot R_{\text{switch\_total}} \le \Delta V_{\text{max\_allowed}}$$

$$R_{\text{switch\_total}} \le \frac{\Delta V_{\text{max\_allowed}}}{I_{\text{active\_max}}}$$

Substitute $I_{\text{active\_max}} = 0.450\text{ A}$ and $\Delta V_{\text{max\_allowed}} = 0.0095\text{ V}$:

$$R_{\text{switch\_total}} = \frac{0.0095\text{ V}}{0.450\text{ A}} = \mathbf{0.02111 \ \Omega} = \mathbf{21.11 \text{ m}\Omega}$$

To restrict active voltage drop to $\le 9.5\text{ mV}$, the combined parallel resistance of all PMOS header switches must not exceed **$21.11\text{ milliohms}$**.


#### Step 3: Calculate Un-Mitigated Inrush Current and Voltage Droop

If all $13,534\ \mu\text{m}$ of PMOS header switches turn ON simultaneously ($t_{\text{turnon}} = 20.0\text{ ps}$):

##### 1. Peak Un-Mitigated Inrush Current ($I_{\text{inrush\_unmitigated}}$):
At $t = 0$, $V_{DD\_virtual} = 0.0\text{ V}$:

$$I_{\text{inrush\_unmitigated}} = \frac{V_{DD\_global}}{R_{\text{switch\_total}}} = \frac{0.95\text{ V}}{0.021111\ \Omega} = \mathbf{45.00 \text{ Amperes!}}$$

Look at this value! 
Peak inrush current $I_{\text{inrush\_unmitigated}} = 45.0\text{ A}$ is **$100\times$ larger than the normal active current $I_{\text{active\_max}} = 0.450\text{ A}$**!

##### 2. Rate of Change of Current ($\frac{di}{dt}$):
The current ramps from $0 \to 45.0\text{ A}$ in $t_{\text{turnon}} = 20.0\text{ ps}$ ($20.0 \times 10^{-12}\text{ s}$):

$$\frac{di}{dt} = \frac{45.0\text{ A}}{20.0 \times 10^{-12}\text{ s}} = \mathbf{2.25 \times 10^{12} \text{ A/sec}}$$

##### 3. Inductive Voltage Droop ($\Delta V_{\text{droop\_unmitigated}}$):
Given package inductance $L_{\text{package}} = 0.50\text{ nH} = 0.50 \times 10^{-9}\text{ H}$:

$$\Delta V_{\text{droop\_unmitigated}} = L_{\text{package}} \cdot \frac{di}{dt}$$

$$\Delta V_{\text{droop\_unmitigated}} = (0.50 \times 10^{-9}\text{ H}) \times (2.25 \times 10^{12}\text{ A/s}) = \mathbf{1,125.0 \text{ mV}} = \mathbf{1.125 \text{ Volts!}}$$

##### Un-Mitigated Result:
An un-mitigated voltage droop of $1.125\text{ V}$ on a $0.95\text{-V}$ supply rail collapses $V_{DD\_global}$ to $0.0\text{ V}$, **crashing the entire CPU instantly**!


#### Step 5: Evaluate Compliance with Maximum Noise Limit ($\Delta V_{\text{noise\_max}} = 50.0\text{ mV}$)

* **Un-Mitigated Voltage Droop**: $1,125.0\text{ mV} > 50.0\text{ mV}$ ($\mathbf{\text{FAIL! CRASHES CPU}}$).
* **Staged Activation Voltage Droop**: $45.0\text{ mV} \le 50.0\text{ mV}$ ($\mathbf{\text{PASSED! SAFE OPERATION}}$).

Staging the power-up sequence across 3 delay phases reduced supply noise by **$25\text{ times}$**, keeping voltage droop within the safe $50.0\text{-mV}$ noise margin!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Power Switch Transistors (Header / Footer)**: High-threshold PMOS header transistors (connected to $V_{DD}$) or NMOS footer transistors (connected to $GND$) that physically disconnect idle logic blocks from power supply rails during sleep states, collapsing virtual power rail voltages ($V_{DD\_virtual} \to 0\text{ V}$) to eliminate static subthreshold and gate leakage currents.
* **Inrush Current Mitigation**: Hardware activation strategies—such as staged multi-phase enable sequences, daisy-chained delay lines, and two-phase mother-daughter switches—that limit the rate of change of charging current ($\frac{di}{dt}$) when powering ON a discharged virtual power rail ($C_{\text{virtual}}$), preventing $L \cdot \frac{di}{dt}$ inductive supply voltage droops from crashing neighboring active power domains.