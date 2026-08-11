---
title: "On-Chip Digital Voltage Regulators and Dual-Rail SRAM Architecture"
---

# On-Chip Digital Voltage Regulators and Dual-Rail SRAM Architecture

In high-performance microprocessor design, scaling supply voltage ($V_{DD}$) down to lower levels is the most effective tool available for reducing energy consumption. Because dynamic power scales quadratically with supply voltage ($P_{\text{dyn}} = \alpha \cdot C_L \cdot V_{DD}^2 \cdot f$), dropping the operating voltage of an execution domain from $1.10\text{ Volts}$ down to $0.55\text{ Volts}$ slashes dynamic power dissipation by a staggering **$75\%$**!

However, when computer architects attempt to execute deep voltage scaling on a modern microprocessor, they run directly into two severe physical limits: **Off-Chip Voltage Ramping Latency** and **The SRAM Minimum Voltage ($V_{\text{min}}$) Barrier**.

To understand these two physical barriers, let us observe what happens inside a processor during aggressive voltage scaling:

1. **The Off-Chip Ramping Latency Barrier**:
   Traditionally, supply voltage is driven by an off-chip Power Management IC (PMIC) mounted on the motherboard. When the processor commands the PMIC to adjust the supply voltage across copper motherboard traces and package pins, the voltage ramps very slowly ($1 \text{ to } 10\text{ mV per microsecond}$).
   
   A $0.50\text{-Volt}$ voltage transition takes $50\text{ microseconds}$—a duration during which a $3.2\text{-GHz}$ processor executes **$160,000\text{ clock cycles}$**! The processor pipeline is forced to sit frozen in idle wait states for thousands of cycles while waiting for off-chip voltage to settle.

2. **The SRAM $V_{\text{min}}$ Degradation Barrier**:
   A modern microprocessor die is composed of two completely different types of digital circuits: **Combinational Logic Gates** (such as adders, multiplexers, and instruction decoders) and **SRAM Cache Bitcell Arrays** (such as L1, L2, and L3 caches made of 6-Transistor / 6T memory cells).

```text
THE VOLTAGE SCALING DISPARITY BETWEEN LOGIC AND SRAM

 Supply Voltage V_DD
  1.10V ┼─── Nominal Active Voltage (Logic & SRAM Active)
        │
  0.80V ┼─── SRAM Minimum Voltage V_min_SRAM (Bitcells flip below this!)
        │    ▲
        │    │ DIVERGENCE GAP (SRAM requires 0.80V, but Logic can run at 0.50V!)
        │    ▼
  0.50V ┴─── Logic Minimum Voltage V_min_logic (Combinational Logic functional)
 (Single-rail power grid forces whole chip to stay at 0.80V, wasting logic power!)
```

Look at the physical conflict between logic gates and memory cells:
* **Combinational Logic** can scale its supply voltage down to $0.50\text{ Volts}$ (the Near-Threshold Voltage regime) and continue functioning correctly without error.
* **6T SRAM Cache Bitcells**, however, rely on delicate electrostatic balances between internal cross-coupled transistors. When supply voltage drops below **$0.80\text{ Volts}$ ($V_{\text{min\_SRAM}}$)**, process variations cause internal noise margins to collapse. 
* Attempting to read or write a 6T SRAM cell below $0.80\text{ V}$ causes the cell to spontaneously flip its stored binary value (**Destructive Read / Static Memory Corruption**)!

If a processor uses a single, shared power rail for both logic and memory, **the entire microchip is trapped at $0.80\text{ Volts}$ by the cache memory**! The combinational logic is forbidden from scaling down to $0.50\text{ V}$, wasting over $60\%$ of potential power savings!

To break through both physical limits, modern microarchitectures deploy **Integrated Digital LDO (DLDO) Regulators** and **Dual-Rail SRAM Arrays**.


### Analogy 2: The Two-Pressure Bank Vault (Dual-Rail SRAM Array)

Now, consider a bank containing two distinct working areas:

```text
THE TWO-PRESSURE BANK VAULT ANALOGY

 Single-Rail Mistake (One Pressure For All):
 Whole Bank @ 0.80V ──► Vault Safe is Secure (Needs 0.80V)
                        Clerks illuminated at 0.80V (WASTING 60% POWER!)

 Dual-Rail Solution (Two Independent Power Lines):
 Memory Rail V_array (0.80V) ──► Vault Lock Safe (100% Secure!)
 Logic Rail V_logic  (0.50V) ──► Clerk's Counting Desk (60% Energy Saved!)
```

1. **The Clerk's Counting Desk (Combinational Logic)**: Clerks count paper bills. They can work under dim $0.50\text{-Volt}$ lighting ($V_{\text{logic}} = 0.50\text{ V}$). They move slightly slower, but burn very little electricity.
2. **The High-Security Vault Lock (6T SRAM Bitcell Array)**: An electronic lock holds the vault doors shut. The lock requires a minimum voltage of **$0.80\text{ Volts}$ ($V_{\text{min\_SRAM}}$)** to operate. If voltage drops to $0.50\text{ V}$, the electronic lock fails, and the vault doors swing open, spilling cash onto the floor (**Data Corruption / Bit-Flip**)!

#### The Single-Rail Mistake:
If the bank connects the clerk's desk and the vault lock to the exact same electrical wire, you are forced to keep the whole building at $0.80\text{ V}$ to keep the vault lock secure! The clerks work under bright, expensive lighting, wasting $60\%$ of their energy budget!

#### The Dual-Rail Solution:
You run **Two Independent Power Wires**:
* **Wire 1 (Memory Array Rail $V_{\text{array}}$)**: Held constant at $0.80\text{ V}$ to power the vault lock, keeping the cash $100\%$ secure!
* **Wire 2 (Logic Rail $V_{\text{logic}}$)**: Connects to the clerk's desk, dimming their lights down to $0.50\text{ V}$!

The vault stays locked and secure, while the counting desk saves $60\%$ of its energy!

This two-wire bank is the exact physical analogue of a **Dual-Rail SRAM Array**:
* The clerk's desk is **Combinational Logic (Address Decoders, ALUs)**.
* The vault lock is the **6T SRAM Storage Bitcell Array**.
* Wire 1 is the **Array Supply Rail ($V_{\text{array}}$)**.
* Wire 2 is the **Logic Supply Rail ($V_{\text{logic}}$)**.


### How an On-Chip DLDO Operates in Hardware

An Integrated DLDO consists of three core hardware components:
1. **Parallel PMOS Pass-Gate Array**: An array of $N$ parallel PMOS switch transistors connected between $V_{\text{in}}$ and $V_{\text{out}}$.
2. **High-Speed Flash Comparator**: Compares the local output voltage $V_{\text{out}}$ against a target digital reference voltage $V_{\text{ref}}$.
3. **Digital Control Barrel Shift Register**: Turns individual PMOS pass-gates ON or OFF to adjust the total channel resistance $R_{\text{pass\_array}}$.

#### The DLDO Control Loop:
* The equivalent channel resistance of the pass-gate array is $R_{\text{pass\_array}} = \frac{R_{\text{single\_pmos}}}{K_{\text{active}}}$, where $K_{\text{active}}$ is the number of currently active PMOS switches.
* The output voltage is governed by Ohm's Law across the pass array:
  $$V_{\text{out}} = V_{\text{in}} - (I_{\text{load}} \cdot R_{\text{pass\_array}})$$
* **If $V_{\text{out}}$ drops below $V_{\text{ref}}$ (Load Increase)**: The comparator detects $V_{\text{out}} < V_{\text{ref}}$ and signals the shift register to turn ON more parallel PMOS switches ($K_{\text{active}} \uparrow$). $R_{\text{pass\_array}}$ drops, pulling $V_{\text{out}}$ back up to $V_{\text{ref}}$!
* **If $V_{\text{out}}$ rises above $V_{\text{ref}}$ (Load Decrease)**: The comparator signals the shift register to turn OFF PMOS switches ($K_{\text{active}} \downarrow$). $R_{\text{pass\_array}}$ increases, restoring $V_{\text{out}}$ down to $V_{\text{ref}}$!

#### Power Conversion Efficiency of a DLDO ($\eta_{\text{DLDO}}$):
Because a DLDO drops voltage through resistive pass-gates, its electrical power efficiency $\eta_{\text{DLDO}}$ is the ratio of output voltage to input voltage:

$$\mathbf{\eta_{\text{DLDO}} = \frac{V_{\text{out}}}{V_{\text{in}}} \times 100\%}$$

Where:
* $\eta_{\text{DLDO}}$ is the power conversion efficiency as a percentage ($\%$).
* $V_{\text{out}}$ is the regulated output domain voltage in Volts ($\text{V}$).
* $V_{\text{in}}$ is the incoming un-regulated supply voltage in Volts ($\text{V}$).

If $V_{\text{in}} = 1.00\text{ V}$ and $V_{\text{out}} = 0.85\text{ V}$, the DLDO operates at an extraordinary **$85\%$ efficiency**, completing voltage transitions in **less than $500\text{ nanoseconds}$**!


### The Read Operation and Destructive Bit-Flip Physics

Let us trace what happens physically inside a 6T bitcell during a **Read Operation**:

1. **Pre-charge Phase**: Before reading, the two complementary bitlines ($BL$ and $\overline{BL}$) are precharged to supply voltage $V_{DD}$.
2. **Initial State**: Suppose the bitcell holds logical '0' at internal node $Q$ ($V_Q = 0.0\text{ V}$) and logical '1' at node $\overline{Q}$ ($V_{\overline{Q}} = V_{DD}$).
3. **Wordline Activation**: The Wordline ($WL$) is driven High ($WL = V_{DD}$), turning ON access NMOS transistors $M_5$ and $M_6$.
4. **Current Flow at Node $Q$**:
   * Bitline $BL$ is at $V_{DD}$. Node $Q$ is at $0.0\text{ V}$.
   * Current flows from $BL$ through access transistor $M_5$ and driver transistor $M_1$ down to Ground.
   * As current flows through $M_5$ and $M_1$, the two transistors form a voltage divider!

The intermediate voltage $V_Q$ at node $Q$ during the read operation rises above $0.0\text{ V}$:

$$V_Q \approx V_{DD} \cdot \left( \frac{R_{\text{DS,M1}}}{R_{\text{DS,M5}} + R_{\text{DS,M1}}} \right)$$

Where:
* $V_Q$ is the transient voltage rise at internal node $Q$ in Volts ($\text{V}$).
* $R_{\text{DS,M1}}$ is the channel resistance of driver NMOS $M_1$ in Ohms ($\Omega$).
* $R_{\text{DS,M5}}$ is the channel resistance of access NMOS $M_5$ in Ohms ($\Omega$).


## Dual-Rail SRAM Array Architecture and Level Shifting

To allow combinational logic gates to scale down to $0.50\text{ Volts}$ while protecting 6T SRAM bitcells from collapsing, microarchitects disconnect the cache array from the main logic power grid and build a **Dual-Rail SRAM Array**.

```text
DUAL-RAIL SRAM ARRAY ARCHITECTURE

 Memory Array Power Rail V_array (Fixed High: 0.85V - 1.00V)
 ──────────────┬───────────────────────────────────────────────
               │
               ▼ Powers 6T Bitcell Cross-Coupled Latching Core
 ┌─────────────────────────────────────────────────────────────┐
 │ 6T SRAM BITCELL ARRAY (Millions of Storage Cells)           │
 │ [ 6T Cell 0 ]   [ 6T Cell 1 ]   [ 6T Cell 2 ]   ...         │
 └─────────────▲───────────────────────────────────────────────┘
               │
               ├─ Level-Shifted Wordlines & Bitlines (0.85V)
               │
 ┌─────────────┴───────────────────────────────────────────────┐
 │ PERIPHERAL SRAM LOGIC (Address Decoders, Sense Amps, MUXes) │
 └─────────────▲───────────────────────────────────────────────┘
               │
 ──────────────┴───────────────────────────────────────────────
 Logic Power Rail V_logic (Scales Dynamically: 0.50V - 1.00V)
```


### Boundary Level-Shifting in Dual-Rail SRAM

When the CPU operates in a low-voltage DVFS state ($V_{\text{logic}} = 0.50\text{ V}$), the row address decoders output a $0.50\text{-V}$ High wordline signal ($WL$).

If $WL = 0.50\text{ V}$ were connected directly to access NMOS transistors $M_5/M_6$ in a bitcell powered by $V_{\text{array}} = 0.85\text{ V}$:
* The gate voltage $WL = 0.50\text{ V}$ would be insufficient to turn ON the access transistors strongly ($V_{\text{gs,M5}} = 0.50\text{ V} - 0.0\text{ V} = 0.50\text{ V} \approx V_{\text{th}}$).
* The access transistors would remain in weak inversion, making it impossible to read or write the cell!

To bridge the voltage gap between $V_{\text{logic}} (0.50\text{ V})$ and $V_{\text{array}} (0.85\text{ V})$, the SRAM macro embeds **Low-to-High Level Shifters** at the outputs of the wordline decoders and write drivers:

```text
WORDLINE DRIVER LEVEL SHIFTING AT SRAM BOUNDARY

 Logic Domain (V_logic = 0.50V)        Memory Array Domain (V_array = 0.85V)
 ┌──────────────────────────┐          ┌──────────────────────────┐
 │ Address Decoder Output   ├─────────►│ Low-to-High Level        ├─► Wordline WL
 │ (0.50V Logic High)       │          │ Shifter (0.50V -> 0.85V) │   (0.85V High)
 └──────────────────────────┘          └──────────────────────────┘
```

The level shifter converts the $0.50\text{-V}$ decoded wordline pulse into a **crisp $0.85\text{-V}$ wordline pulse**, turning access transistors $M_5/M_6$ fully ON and enabling flawless memory access at sub-nanosecond speeds!


## Solved Industrial Engineering Exercise: Quantitative Analysis of DLDO Ramping Latency, Single-Rail vs. Dual-Rail $V_{\text{min}}$ Limits, and Energy Savings

To consolidate your complete, mathematical understanding of integrated digital LDO regulators, 6T SRAM $V_{\text{min}}$ breakdown limits, dual-rail power grid partitioning, and energy savings calculations, let us work through a complete, step-by-step industrial hardware engineering problem.


### Your Objective

1. Calculate the voltage transition ramping time $t_{\text{ramp}}$ (in microseconds and CPU clock cycles at $3.2\text{ GHz}$) for a $0.50\text{-V}$ voltage step ($1.00\text{ V} \to 0.50\text{ V}$) using the off-chip PMIC vs the on-chip DLDO.
2. Calculate total power dissipation ($P_{\text{total0}} = P_{\text{dyn0}} + P_{\text{leak0}}$) for **System 0 (Single-Rail)** operating at its lowest safe limit $V_{DD} = 0.80\text{ V}$ ($f_{\text{low}} = 1.0\text{ GHz}$).
3. Calculate total power dissipation ($P_{\text{total1}} = P_{\text{dyn1}} + P_{\text{leak1}}$) for **System 1 (Dual-Rail)** operating with $V_{\text{logic}} = 0.50\text{ V}$ and $V_{\text{array}} = 0.80\text{ V}$ ($f_{\text{low}} = 1.0\text{ GHz}$).
4. Calculate net power saved (in mW) and percentage power reduction achieved by System 1 over System 0 during low-power operation.
5. Calculate total energy saved in Joules ($\Delta E_{\text{saved}}$) over a $1.0\text{-second}$ low-power execution trace.
6. Verify mathematical, physical, and logical correctness.


#### Step 2: Analyze System 0 Power (Single-Rail Trapped at $0.80\text{ V}$)

In System 0, the single power rail is trapped at $V_{\text{min\_SRAM}} = 0.80\text{ V}$ to prevent memory bit-flips. Both logic and array operate at $0.80\text{ V}$ ($f_{\text{low}} = 1.0\text{ GHz} = 1.0 \times 10^9\text{ Hz}$).

##### 1. Dynamic Power Calculation ($V_{DD} = 0.80\text{ V}, f_{\text{low}} = 1.0\text{ GHz}$):
Total capacitance $C_{\text{total}} = C_{\text{logic}} + C_{\text{array}} = 500.0\text{ pF} + 180.0\text{ pF}$.
Total weighted switching activity:

$$\sum \alpha C = (0.15 \times 500.0\text{ pF}) + (0.04 \times 180.0\text{ pF}) = 75.0\text{ pF} + 7.2\text{ pF} = \mathbf{82.2 \text{ pF}} = 82.2 \times 10^{-12}\text{ F}$$

$$P_{\text{dyn0}} = (\sum \alpha C) \cdot V_{DD}^2 \cdot f_{\text{low}}$$

$$P_{\text{dyn0}} = (82.2 \times 10^{-12}\text{ F}) \times (0.80\text{ V})^2 \times (1.0 \times 10^9\text{ Hz})$$

$$P_{\text{dyn0}} = (82.2 \times 10^{-12}) \times 0.64 \times (1.0 \times 10^9) = 82.2 \times 0.64 \times 10^{-3} = \mathbf{52.608 \text{ mW}}$$

##### 2. Static Leakage Power Calculation ($V_{DD} = 0.80\text{ V}$):
Leakage scaling factor at $0.80\text{ V} = (0.80 / 1.00)^2 = 0.64$.

$$I_{\text{leak0\_total}} = (10.0\text{ mA} + 4.0\text{ mA}) \times 0.64 = 14.0\text{ mA} \times 0.64 = \mathbf{8.960 \text{ mA}}$$

$$P_{\text{leak0}} = I_{\text{leak0\_total}} \cdot V_{DD} = 0.008960\text{ A} \times 0.80\text{ V} = \mathbf{7.168 \text{ mW}}$$

##### 3. Total System 0 Power ($P_{\text{total0}}$):

$$P_{\text{total0}} = P_{\text{dyn0}} + P_{\text{leak0}} = 52.608\text{ mW} + 7.168\text{ mW} = \mathbf{59.776 \text{ mW}}$$


#### Step 4: Calculate Power Savings and Energy Saved Over 1.0 Second

Compare System 0 (Single-Rail) vs. System 1 (Dual-Rail):

$$\Delta P_{\text{saved}} = P_{\text{total0}} - P_{\text{total1}} = 59.776\text{ mW} - 26.656\text{ mW} = \mathbf{33.120 \text{ mW Saved!}}$$

##### Percentage Power Reduction:

$$\text{Power Savings \%} = \left( 1 - \frac{P_{\text{total1}}}{P_{\text{total0}}} \right) \times 100\% = \left( 1 - \frac{26.656\text{ mW}}{59.776\text{ mW}} \right) \times 100\%$$

$$\text{Power Savings \%} = (1 - 0.4459) \times 100\% = \mathbf{55.41\% \text{ Total Power Reduction!}}$$

##### Total Energy Saved over 1.0-Second Low-Power Execution ($\Delta E_{\text{saved}}$):

$$\Delta E_{\text{saved}} = \Delta P_{\text{saved}} \cdot t_{\text{trace}} = 0.033120\text{ W} \times 1.00\text{ s} = \mathbf{0.03312 \text{ Joules Saved!}}$$

```text
DUAL-RAIL SRAM SYSTEM POWER SAVINGS SUMMARY

 Architecture Configuration  │ Logic V_DD │ Array V_DD │ Total System Power │ Power Reduction %
─────────────────────────────┼────────────┼────────────┼────────────────────┼───────────────────
 System 0 (Single-Rail 0.80V)│   0.80 V   │   0.80 V   │     59.776 mW      │   0.0% (Baseline)
 System 1 (Dual-Rail 0.50V)  │   0.50 V   │   0.80 V   │     26.656 mW      │  55.41% SAVED!
 (Dual-Rail architecture cuts system power by more than 2.24x!)
```

##### Engineering Conclusion:
By deploying a Dual-Rail SRAM architecture with an on-chip DLDO regulator, System 1 **reduced total low-power execution power by $55.41\%$ ($33.12\text{ mW}$ saved per second)** while completing voltage transitions $25\times$ faster than an off-chip PMIC and protecting $100\%$ of cache data integrity!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Integrated Digital LDO (DLDO / FIVR)**: An on-chip voltage regulator circuit (utilizing parallel PMOS switch arrays or integrated buck inductors) that steps down global supply voltages locally on the silicon die, executing sub-microsecond voltage domain transitions ($100 \dots 500\text{ ns}$) to eliminate off-chip PMIC ramping wait stalls.
* **Dual-Rail SRAM Array**: A memory macro architecture that splits the power distribution network into two independent rails—a fixed high-voltage array rail ($V_{\text{array}} \ge V_{\text{min\_SRAM}}$) to preserve 6T bitcell static noise margins, and a variable low-voltage logic rail ($V_{\text{logic}}$) to allow combinational logic to scale deeply into low-power regimes without memory data corruption.