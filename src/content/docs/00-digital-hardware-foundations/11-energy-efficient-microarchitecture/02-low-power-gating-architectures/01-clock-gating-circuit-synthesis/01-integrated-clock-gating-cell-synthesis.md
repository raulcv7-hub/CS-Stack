---
title: "Integrated Clock Gating Cell Synthesis and Level-Sensitive Latch Mechanics"
---

# Integrated Clock Gating Cell Synthesis and Level-Sensitive Latch Mechanics

In high-performance microprocessors and System-on-Chip (SoC) designs, the clock distribution network—commonly known as the **Clock Tree**—is the single largest consumer of dynamic electrical power. To synchronize millions of state-storing flip-flops across a silicon die, a master clock generator drives high-frequency square wave voltage pulses through extensive networks of clock buffers and interconnect wires. Because a clock signal must toggle continuously on every single clock cycle ($0 \to 1 \to 0$), its switching activity factor is strictly $\alpha_{\text{clock}} = 1.0$. 

Even when a processor is performing no useful work—for instance, when an execution pipeline is stalled waiting for memory, or when an arithmetic register array holds the exact same data value for thousands of consecutive cycles—the clock tree continues charging and discharging the gate capacitances of millions of idle flip-flops. In an un-optimized processor, charging and discharging these idle clock pins can consume over **$40\%\text{ to } 50\%$ of the chip's total dynamic power budget**!

To stop this massive waste of energy, hardware designers use a technique called **Clock Gating**. Clock gating shuts off the clock signal to a group of registers whenever those registers do not need to update their stored values. 

However, gating a high-speed clock tree in physical hardware is fraught with danger. If you attempt to gate a clock signal using a simple logic gate (such as a basic two-input AND gate), any asynchronous change in the enable control signal while the clock is in a high state will chop the clock pulse in half. This produces a truncated, narrow voltage spike known as a **Runt Clock Pulse**. Runt clock pulses violate the setup and hold timing requirements of flip-flops, causing state registers to capture corrupted data or enter non-deterministic metastable states that crash the entire microchip.

To achieve massive dynamic power savings while guaranteeing $100\%$ glitch-free, hazard-free clock signals, modern digital synthesis tools automatically replace un-gated registers with specialized hardware components called **Integrated Clock Gating (ICG) Cells**. 

By pairing a level-sensitive transparent latch with an AND gate in a single cell, the ICG cell enforces a strict physical invariant: the clock enable signal is allowed to transition **only when the clock signal is in a low state**, completely eliminating glitches, hazard spikes, and runt clock pulses in silicon.

```text
THE UN-GATED VS. CLOCK-GATED REGISTER COMPARISON

 1. Un-Gated Register (Clock Toggles 100% of the Time):
 Master Clock CLK ──►[ Clock Buffer Tree ]──►[ Flip-Flop CLK Pin ]
                     (Toggles on EVERY cycle -> 50% Power Wasted!)

 2. Integrated Clock Gated Register (Clock Stopped When Idle):
 Master Clock CLK ──►[ ICG Cell ]───────────►[ Flip-Flop CLK Pin ]
                       ▲
 Enable Signal EN ─────┘ (Stops clock when EN = 0 -> Power Saved!)
```


### Analogy 2: The Interlocked Safety Gate (The Level-Sensitive Latch)

Now, let us examine the dangerous hazard of operating that sluice gate while the water wheel is moving.

Imagine a heavy mechanical press blade moving up and down on a strict 1-second rhythm (**The Clock Signal $CLK$**). When the blade is UP ($CLK = 1$), it is at the top of its stroke. When the blade is DOWN ($CLK = 0$), it rests at the bottom.

You want to insert a steel safety barrier (**The Enable Signal $EN$**) to stop the machine:

```text
MECHANICAL SAFETY INTERLOCK ANALOGY

 Hazardous Direct Insertion (Naive AND Gate):
 Blade Moving UP ──► Push Safety Barrier Mid-Stroke!
                     │
                     ▼
 BLADE CRASHES INTO BARRIER MID-STROKE! (Broken Blade / Runt Pulse!)

 Interlocked Insertion (Level-Sensitive Latch / ICG):
 Blade at BOTTOM (CLK = 0) ──► Safety Interlock Opens ──► Barrier Enters Safely!
 Blade Moves UP  (CLK = 1) ──► Safety Interlock Locks ──► Barrier Frozen in Place!
 (Barrier can ONLY move when blade is at the bottom -> Zero Crashing!)
```

If you push the steel safety barrier into the machine while the blade is halfway through its downward stroke ($CLK = 1$), the heavy blade slams into the top of your barrier mid-stroke! The blade gets jammed, warps, and snaps in half (**A Runt Clock Pulse / Hazard Glitch**). The machine is damaged and stops working unpredictably.

To prevent this collision, the machine builder installs a **Mechanical Safety Interlock**:
* The slot where the safety barrier slides in is fitted with a locking pin connected to the blade.
* When the blade is at the very bottom of its stroke resting on the floor ($CLK = 0$), the locking pin retracts, and the safety barrier can slide freely in or out (**Latch is Transparent**).
* The moment the blade begins moving upward ($CLK = 1$), the locking pin engages, **locking the safety barrier in its current position** (**Latch is Opaque / Frozen**).
* Even if you yank or push the barrier handle with all your strength while the blade is in the air ($CLK = 1$), the barrier cannot move!

Because the safety barrier is physically locked whenever the blade is in motion ($CLK = 1$), the barrier can *never* collide with the moving blade!

This mechanical safety interlock is the exact physical analogue of the **Level-Sensitive Latch inside an Integrated Clock Gating (ICG) Cell**:
* The moving blade is the **Master Clock Signal ($CLK$)**.
* The safety barrier handle is the **Enable Signal ($EN$)**.
* The locking pin that engages when the blade is up is the **Active-Low Level-Sensitive Latch**.
* Blocking barrier movement while the blade is in the air prevents **Runt Clock Pulses and Glitches**!


### The Catastrophic Failure of Naive AND-Gate Clock Gating

To eliminate this idle clock power, an inexperienced hardware designer might attempt to gate the clock tree by placing a simple 2-input AND gate directly on the clock line:

$$\text{Gated\_CLK} = \text{CLK} \cdot \text{EN}$$

```text
NAIVE AND-GATE CLOCK GATING (DO NOT USE IN HARDWARE!)

 Master Clock CLK ────►[ AND Gate ]────► Gated_CLK Output
 Enable Signal EN ────►[          ]
```

Let us trace the physical signal waveforms to see why this simple AND-gate approach fails catastrophically in real hardware!

Suppose the master clock $CLK$ is currently in a HIGH state ($CLK = 1$). While $CLK = 1$, the control logic evaluates an instruction and changes the enable signal $EN$ from $0 \to 1$ or from $1 \to 0$ mid-cycle.

```text
RUNT CLOCK PULSE GENERATION IN NAIVE AND-GATE CLOCK GATING

 Master Clock CLK  : ───┐       ┌───────┐       ┌───────┐       ┌───
                    └───┘       └───────┘       └───────┘       └───
 Enable Signal EN  : ───────────────┐       ┌───────────────────────
                                    │       │ (Transitions mid-high!)
 Gated_CLK Output  : ───────────────┐   ┌───┐       ┌───────┐       ───
                                    └───┘   └───┘       └───────┘
                                        ▲
                                        └── RUNT CLOCK PULSE! (Triggers Glitch!)
```

Look closely at the resulting `Gated_CLK` output waveform:
1. **Case A ($EN$ rises from $0 \to 1$ while $CLK = 1$)**:
   The AND gate output instantly rises from $0 \to 1$ in the middle of the clock's HIGH phase. This creates a narrow, clipped clock pulse that lasts for only a fraction of a normal clock period!
2. **Case B ($EN$ falls from $1 \to 0$ while $CLK = 1$)**:
   The AND gate output instantly drops from $1 \to 0$ before $CLK$ completes its normal high duration. This chops the active clock pulse short!

These truncated, narrow voltage spikes are called **Runt Clock Pulses** or **Clock Glitches**.


## Anatomic Structure of the Integrated Clock Gating (ICG) Cell

To guarantee that clock enable transitions occur cleanly without ever producing runt pulses or glitches, semiconductor foundries and physical design tools use a specialized, pre-engineered standard cell: **The Integrated Clock Gating (ICG) Cell**.

A standard positive-edge Integrated Clock Gating (ICG) cell consists of three internal logic components integrated into a single physical layout block:
1. An **Active-Low / Level-Sensitive Transparent D-Latch**.
2. A **2-Input Clock AND Gate**.
3. An optional **Test Enable OR Gate** (used for Design-for-Test / DFT scan chain testing).

```text
INTEGRATED CLOCK GATING (ICG) CELL SCHEMATIC

 Enable EN ───►[ OR Gate ]──►[ D   LATCH   Q ]──► EN_latched
 Test TE   ───►[         ]   │ (Active Low)  │        │
                             │               │        │
 Master CLK ─────────────────┤ G_n (Inverted)│        ▼
            │                └───────────────┘    ┌──────┐
            └────────────────────────────────────►│ AND  ├─► Gated_CLK
                                                  └──────┘
```

Let us examine the exact connection of these internal components:
* The primary functional enable signal $EN$ and the manufacturing test enable signal $TE$ enter the inputs of a 2-input OR gate. This produces an effective enable signal: $EN_{\text{eff}} = EN \mid TE$.
* $EN_{\text{eff}}$ feeds the Data input ($D$) of the level-sensitive latch.
* The master clock $CLK$ is connected to the **active-low enable pin ($\overline{G}$)** of the latch.
* The output of the latch, denoted as $EN_{\text{latched}}$, feeds one input of the 2-input AND gate.
* The master clock $CLK$ connects directly to the second input of the AND gate.
* The output of the AND gate drives the safe, glitch-free gated clock line: $\text{Gated\_CLK}$.


### The Inviolable ICG Handshake Invariant

By placing a level-sensitive latch before the AND gate, the ICG cell enforces a mathematical invariant:

> **The ICG Invariant**: The latched enable signal $EN_{\text{latched}}$ is permitted to change state ONLY during the LOW phase of the master clock ($CLK = 0$).

$$\mathbf{\text{Transition of } EN_{\text{latched}} \implies (CLK == 0)}$$

Because $EN_{\text{latched}}$ is constant whenever $CLK = 1$, the AND gate equation $\text{Gated\_CLK} = CLK \cdot EN_{\text{latched}}$ simplifies during the clock's HIGH phase to:

$$\text{Gated\_CLK} = 1 \cdot \text{Constant} = \text{Constant}$$

The output $\text{Gated\_CLK}$ can **never** experience a mid-high transition! Glitches and runt clock pulses are $100\%$ mathematically impossible in physical silicon!


## Static Timing Analysis and Setup/Hold Constraints on ICG Cells

In modern Physical Design and Static Timing Analysis (STA), inserting an Integrated Clock Gating (ICG) cell introduces a new, highly critical timing path that must be verified during chip sign-off: **The Clock Enable Setup and Hold Timing Path**.

```text
ICG CLOCK ENABLE TIMING PATH

 Master Clock CLK ──►[ Reg A ]──►[ Control Logic ]──► EN ──►[ ICG Cell ]
                     (CLK-to-Q)    (Logic Delay)           (Setup/Hold)
```

Look at the timing path leading to the ICG cell's enable pin ($EN$):
1. On the rising edge of Clock Cycle $N-1$, Register A launches a control signal.
2. The signal propagates through combinational control logic to compute the enable signal $EN$.
3. The enable signal $EN$ travels across interconnect wires to the $D$ input of the IOMMU/ICG level-sensitive latch.
4. **The Setup Constraint**: The enable signal $EN$ **MUST arrive and stabilize at the ICG latch input BEFORE the master clock $CLK$ falls to 0** (or rises to 1, depending on latch polarity)!


### Design-for-Test (DFT) Scan Chain Integration

During semiconductor manufacturing, every manufactured chip must undergo rigorous physical testing using Automatic Test Pattern Generation (ATPG) to detect physical silicon defects (such as shorted wires or broken transistors).

During ATPG testing, test vectors are shifted sequentially through long chains of flip-flops called **Scan Chains**.

What happens if an ICG cell has its functional enable signal $EN = 0$ during manufacturing test mode?
* The clock to downstream flip-flops is gated OFF!
* The downstream flip-flops cannot shift test vectors!
* Manufacturing test coverage drops, and defective chips escape into production!

To solve this problem, all production ICG cells include a dedicated **Test Enable (`TE`) or Scan Enable (`SE`)** input pin:

```text
DFT SCAN TEST ENABLE OVERRIDE IN ICG CELL

 Functional Enable EN ──►[ OR Gate ]──► Latch D Input
 Test Enable TE       ──►[         ]
 (When TE = 1 during manufacturing test, clock is 100% UN-GATED!)
```

* During normal user software execution, $TE = 0$. The ICG cell operates under the control of the functional enable signal $EN$.
* During manufacturing test mode, the ATPG test controller asserts **$TE = 1$**.
* The internal OR gate forces $EN_{\text{eff}} = EN \mid TE = 1$, **un-gating the clock tree unconditionally**!
* All downstream flip-flops receive continuous clock pulses, allowing $100\%$ full scan chain testability across the entire chip!


### Scenario and Parameters

You are a senior physical design engineer optimizing a 64-bit vector register file in a $2.5\text{-GHz}$ microprocessor core ($T_{\text{clk}} = 400.0\text{ ps}$).

The supply voltage is $V_{DD} = 0.90\text{ V}$.

```text
64-BIT VECTOR REGISTER FILE CLOCK GATING MODEL

 System Parameters:
   f             = 2.5 GHz (T_clk = 400.0 ps)
   V_DD          = 0.90 Volts
   N_ff          = 64 Flip-Flops
   Alpha_enable  = 0.12 (Register written on 12% of clock cycles)

 Un-Gated MUX-Recirculating Register Parameters:
   C_clk_pin     = 3.2 fF per flip-flop clock pin
   C_mux         = 2.1 fF per MUX select input pin
   Alpha_mux     = 0.12

 Integrated Clock Gating (ICG) Cell Parameters:
   C_icg_clk     = 6.5 fF (Single ICG clock input pin capacitance)
   t_setup_latch = 22.0 ps (Internal latch setup time)
   t_clk_to_q    = 75.0 ps (Launching register delay)
   t_skew        = 12.0 ps (Clock skew)
```

#### Circuit Parameters:
* Number of Flip-Flops in Vector Register: $N_{\text{ff}} = 64\text{ flip-flops}$.
* Register Write Enable Activity: $\alpha_{\text{enable}} = 0.12$ (the register is written with new data on $12\%$ of clock cycles, and sits idle for $88\%$ of cycles).
* Un-Gated MUX-Recirculating Architecture:
  * Flip-Flop Clock Pin Capacitance: $C_{\text{clk\_pin}} = 3.2\text{ fF} = 3.2 \times 10^{-15}\text{ F}$.
  * Recirculating MUX Select Pin Capacitance: $C_{\text{mux}} = 2.1\text{ fF} = 2.1 \times 10^{-15}\text{ F}$.
* Integrated Clock Gating (ICG) Cell Architecture:
  * Single ICG Clock Input Pin Capacitance: $C_{\text{icg\_clk}} = 6.5\text{ fF} = 6.5 \times 10^{-15}\text{ F}$.
  * Internal Latch Setup Time: $t_{\text{setup\_latch}} = 22.0\text{ ps}$.
* Timing Path Parameters:
  * Launching Register Delay: $t_{\text{clk\_to\_q}} = 75.0\text{ ps}$.
  * Clock Skew: $t_{\text{skew}} = 12.0\text{ ps}$.


### Step-by-Step Derivation

#### Step 1: Calculate Dynamic Power for Un-Gated MUX-Recirculating Register ($P_{\text{ungated}}$)

In an un-gated MUX-recirculating register, the clock tree drives all 64 flip-flop clock pins on every single clock cycle ($\alpha_{\text{clock}} = 1.0$). 

Additionally, when $EN$ toggles ($\alpha_{\text{enable}} = 0.12$), the MUX select pins consume dynamic power.

##### 1. Total Un-Gated Clock Tree Switched Capacitance ($C_{\text{ungated\_clk}}$):

$$C_{\text{ungated\_clk}} = N_{\text{ff}} \times C_{\text{clk\_pin}} = 64 \times 3.2 \times 10^{-15}\text{ F} = \mathbf{204.8 \text{ fF}} = 204.8 \times 10^{-15}\text{ F}$$

##### 2. Total MUX Select Switched Capacitance ($C_{\text{ungated\_mux}}$):

$$C_{\text{ungated\_mux}} = N_{\text{ff}} \times C_{\text{mux}} = 64 \times 2.1 \times 10^{-15}\text{ F} = \mathbf{134.4 \text{ fF}} = 134.4 \times 10^{-15}\text{ F}$$

##### 3. Total Un-Gated Dynamic Power Dissipation ($P_{\text{ungated}}$):

$$P_{\text{ungated}} = \left( \alpha_{\text{clock}} \cdot C_{\text{ungated\_clk}} \cdot V_{DD}^2 \cdot f \right) + \left( \alpha_{\text{enable}} \cdot C_{\text{ungated\_mux}} \cdot V_{DD}^2 \cdot f \right)$$

Evaluate $V_{DD}^2 \cdot f$:

$$V_{DD}^2 \cdot f = (0.90\text{ V})^2 \times (2.5 \times 10^9\text{ Hz}) = 0.81\text{ V}^2 \times 2.5 \times 10^9\text{ s}^{-1} = \mathbf{2.025 \times 10^9 \text{ V}^2/s}$$

Calculate clock pin power ($P_{\text{clk\_pin}}$):

$$P_{\text{clk\_pin}} = (204.8 \times 10^{-15}\text{ F}) \times (2.025 \times 10^9\text{ V}^2/\text{s}) = \mathbf{414.72 \times 10^{-6} \text{ W}} = 414.72\ \mu\text{W}$$

Calculate MUX select power ($P_{\text{mux\_select}}$):

$$P_{\text{mux\_select}} = 0.12 \times (134.4 \times 10^{-15}\text{ F}) \times (2.025 \times 10^9\text{ V}^2/\text{s}) = \mathbf{32.6592 \times 10^{-6} \text{ W}} = 32.66\ \mu\text{W}$$

Summing both components:

$$P_{\text{ungated}} = 414.72\ \mu\text{W} + 32.66\ \mu\text{W} = \mathbf{447.38 \times 10^{-6} \text{ Watts}} = \mathbf{447.38 \text{ }\mu\text{W}}$$

The un-gated register array consumes **$447.38\ \mu\text{W}$** of dynamic power.


#### Step 3: Calculate Percentage Power Reduction Achieved by ICG

$$\text{Power Savings} = \left( 1 - \frac{P_{\text{icg}}}{P_{\text{ungated}}} \right) \times 100\% = \left( 1 - \frac{75.37\ \mu\text{W}}{447.38\ \mu\text{W}} \right) \times 100\%$$

$$\text{Power Savings} = (1 - 0.16847) \times 100\% = \mathbf{83.15\% \text{ Dynamic Power Reduction!}}$$

```text
POWER SAVINGS SUMMARY FOR 64-BIT REGISTER

 Configuration Mode          │ Dynamic Power (uW) │ Power Reduction %
─────────────────────────────┼────────────────────┼───────────────────
 Un-Gated MUX Recirculating  │     447.38 uW      │   0.0% (Baseline)
 Integrated Clock Gated (ICG)│      75.37 uW      │  83.15% SAVED!
 (Power consumption reduced by over 5.9x!)
```

Using an ICG cell reduces dynamic clock power by **$83.15\%$ ($372.01\ \mu\text{W}$ saved)**!


#### Step 5: Analyze Runt Pulse Hazard for Naive AND-Gate Clock Gating

Suppose a naive 2-input AND gate is used instead of an ICG cell. 

At clock period $T_{\text{clk}} = 400.0\text{ ps}$ with a $50\%$ duty cycle, the master clock $CLK$ remains HIGH ($1$) for $200.0\text{ ps}$ (from $t = 0\text{ ps}$ to $t = 200\text{ ps}$) and LOW ($0$) for $200.0\text{ ps}$.

Suppose $EN$ transitions from $0 \to 1$ at $t = 30.0\text{ ps}$ ($30.0\text{ ps}$ after $CLK$ went HIGH):

1. From $t = 0\text{ ps}$ to $t = 30.0\text{ ps}$, $CLK = 1$ and $EN = 0 \implies \text{Gated\_CLK} = 0$.
2. At $t = 30.0\text{ ps}$, $EN$ rises to $1$. Since $CLK = 1$, the AND gate output $\text{Gated\_CLK}$ **instantly rises from $0 \to 1$**!
3. At $t = 200.0\text{ ps}$, $CLK$ drops to $0$. $\text{Gated\_CLK}$ drops from $1 \to 0$.

##### Calculate Runt Pulse Width ($\tau_{\text{runt}}$):

$$\tau_{\text{runt}} = 200.0\text{ ps} - 30.0\text{ ps} = \mathbf{170.0 \text{ picoseconds}}$$

Now suppose $EN$ transitions from $1 \to 0$ at $t = 180.0\text{ ps}$ ($20.0\text{ ps}$ before $CLK$ drops):

1. At $t = 180.0\text{ ps}$, $EN$ drops to $0$. $\text{Gated\_CLK}$ **instantly drops from $1 \to 0$**!

##### Calculate Truncated Runt Pulse Width ($\tau_{\text{runt\_short}}$):

$$\tau_{\text{runt\_short}} = 180.0\text{ ps} - 0.0\text{ ps} = \mathbf{18.0 \text{ picoseconds!}}$$

##### Evaluate Timing Failure:
The minimum required flip-flop clock pulse width is $t_{\text{pw\_min}} = 120.0\text{ ps}$.

$$\tau_{\text{runt\_short}} \, (18.0\text{ ps}) < t_{\text{pw\_min}} \, (120.0\text{ ps}) \quad (\mathbf{\text{TIMING VIOLATION & STATE CORRUPTION!}})$$

The $18.0\text{-ps}$ runt pulse violates $t_{\text{pw\_min}}$ by **$102.0\text{ picoseconds}$**, causing downstream flip-flops to enter **metastability and corrupt stored register values**! 

This proves why the level-sensitive latch inside the ICG cell is physically mandatory to guarantee zero glitches.


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Integrated Clock Gating (ICG) Cell**: A pre-engineered standard cell combining a level-sensitive transparent latch, an AND gate, and test override logic that safely gates clock tree branches to idle registers, eliminating dynamic clock power without producing hazard glitches or runt pulses.
* **Level-Sensitive Enable Latch**: The active-low transparent latch inside an ICG cell that locks the latched enable signal ($EN_{\text{latched}}$) whenever the master clock is HIGH ($CLK = 1$), ensuring that clock enable transitions take effect exclusively during the clock's LOW phase ($CLK = 0$) to guarantee glitch-free clock gating.