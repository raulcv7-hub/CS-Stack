content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/02-mmio-peripheral-register-control/02-hardware-timer-counter-subsystems/03-pwm-signal-generation-mechanics.md
# Hardware Pulse-Width Modulation, Capture/Compare Registers, and Center-Aligned Power Control

## The Binary Voltage Limitation and Linear Heat Waste

In digital silicon microarchitecture, logic gates and output drivers operate using two discrete electrical voltage levels: a logical $0$ representing $0.0\text{ Volts}$ (Ground / $GND$) and a logical $1$ representing full supply voltage $V_{DD}$ (typically $3.3\text{ Volts}$). A digital package pin cannot natively generate intermediate analog voltages—such as $1.65\text{ Volts}$ or $2.10\text{ Volts}$—because internal CMOS driver transistors are designed to operate purely as fully closed or fully open switches.

However, physical devices surrounding a microcontroller in real-world systems require **variable analog power levels**:
* An electric motor requires variable average voltage to adjust its rotational speed smoothly.
* An LED light fixture requires variable power to adjust its illumination brightness without flickering.
* A heating element or power supply regulator requires variable power delivery to maintain precise temperatures or output voltages.

In early electrical engineering, developers attempted to deliver variable analog power to a load by inserting a variable series resistor (**A Linear Voltage Regulator**) between the supply voltage and the load:

```text
LINEAR POWER REGULATION (HIGH THERMAL POWER WASTE)

 Supply Voltage V_DD (3.3V)
           │
           ▼
 ┌───────────────────────────┐
 │ Variable Series Resistor  │ ──► Dissipates Excess Energy as HEAT!
 │ R_series                  │     P_heat = I * (3.3V - V_target)
 └─────────┬─────────────────┘
           │
           ▼ Reduced Voltage V_target (1.65V)
 ┌───────────────────────────┐
 │ Load (Electric Motor)     │ ──► Receives 1.65V (50% Power)
 └───────────────────────────┘
 (50% of total electrical energy is WASTED as boiling heat in the resistor!)
```

Look at the catastrophic physical inefficiency of linear voltage regulation:
* To deliver $1.65\text{ Volts}$ ($50\%$ voltage) to an electric motor drawing $2\text{ Amperes}$ of current from a $3.3\text{-V}$ supply, the series resistor must drop $1.65\text{ Volts}$ across its terminals.
* The power wasted as pure heat inside the resistor ($P_{\text{heat}}$) is:
  $$P_{\text{heat}} = I \times (V_{DD} - V_{\text{target}}) = 2\text{ A} \times (3.3\text{ V} - 1.65\text{ V}) = \mathbf{3.30 \text{ Watts of Heat Waste!}}$$
* **Over $50\%$ of the battery power is burned off as heat**! The resistor gets boiling hot, requiring massive cooling heatsinks, and battery life collapses.

Why can we not simply use software assembly loops to toggle a GPIO pin ON ($3.3\text{V}$) and OFF ($0.0\text{V}$) rapidly to control power?

Because if software toggles a pin inside a main loop (`bit_set` $\to$ `delay` $\to$ `bit_clear` $\to$ `delay`):
1. **CPU Execution Pipeline Freeze**: The CPU core is $100\%$ occupied executing delay loops, unable to run application software.
2. **Timing Jitter and Acoustic Motor Whine**: When a hardware interrupt fires, the CPU pauses the toggling loop. The output pulse width distorts, causing electric motors to jerk violently and emit loud, annoying acoustic hums!

How can we generate ultra-precise, variable analog power levels with **$0\%$ resistor heat waste** and **$0\%$ CPU pipeline overhead**, driving high-power motors and dimmable LEDs at full wire speed?

To deliver high-efficiency variable power and eliminate software toggling jitter, hardware architectures employ **Pulse-Width Modulation (PWM)**, **Capture/Compare Registers (`CCR`)**, and **Center-Aligned PWM Modes**.

---

## The High-Speed Switch and the Red Water Line: A Mental Model for PWM

To build an intuitive, crystal-clear mental model of Pulse-Width Modulation, duty cycles, capture/compare match registers, and center-aligned counting modes before inspecting bitwise MMIO registers and assembly equations, let us consider an everyday analogy: **The Light Switch and the Water Tank**.

Imagine you are sitting in a room lit by a single light bulb connected to a standard mechanical light switch (**A Digital Output Pin**).

```text
THE HIGH-SPEED LIGHT SWITCH METAPHOR

 High-Speed Mechanical Light Switch (Digital Output Pin)
 ┌───────────────────────────┐
 │ Position 1: Fully ON  (1) │ ──► Zero Resistance (R = 0) -> Zero Heat Waste!
 │ Position 2: Fully OFF (0) │ ──► Zero Current    (I = 0) -> Zero Heat Waste!
 └─────────────┬─────────────┘
               │
               ▼ Flips ON and OFF 1,000 Times per Second!
 ┌───────────────────────────────────────────────────────────┐
 │ ROOM ILLUMINATION (Smooth Average Power Perceived by Eye) │
 └───────────────────────────────────────────────────────────┘
```

The light switch has two physical positions:
* **Fully ON ($3.3\text{V}$)**: Current flows freely with zero contact resistance ($R = 0 \implies P_{\text{heat}} = I^2 \cdot R = \mathbf{0 \text{ Watts}}$).
* **Fully OFF ($0.0\text{V}$)**: Zero current flows ($I = 0 \implies P_{\text{heat}} = I \cdot V = \mathbf{0 \text{ Watts}}$).

In BOTH positions, **zero electrical power is wasted as heat**!

Now, suppose you want the room to feel half-bright ($50\%$ average light power).

Instead of installing a hot variable resistor, you flip the switch ON and OFF at an ultra-fast speed of **1,000 times per second ($1.0\text{ kHz}$)**:
* You keep the switch **ON for $0.5\text{ milliseconds}$**, and **OFF for $0.5\text{ milliseconds}$** during each $1.0\text{-ms}$ cycle.
* Because your eyes cannot detect a $1,000\text{-Hz}$ flicker, your brain averages the light pulses together.
* The room feels **perceptually half-bright ($50\%$ average power)**, yet **$100\%$ of the electrical energy went into the light bulb**, with $0\%$ wasted in the switch!

---

### The Water Bucket and the Red Line (`ARR` vs `CCR`)

How does a hardware timer generate these precise ON and OFF time ratios without CPU intervention?

Imagine a water bucket filling up at a steady rate (**The Hardware Counter Register `CNT`**):

```text
THE WATER BUCKET AND RED LINE METAPHOR

 Top Rim of Bucket (Auto-Reload Register ARR = 9,999)
 ┌───────────────────────────┐ ◄── Bucket dumps to 0 & resets!
 │                           │
 ├───────────────────────────┤ ◄── RED LINE MARKER (Capture/Compare Register CCR = 4,999)
 │ Water Level (CNT)         │     When Water reaches Red Line -> Output flips LOW (0)!
 └───────────────────────────┘
```

1. **The Top Rim of the Bucket (Auto-Reload Register `ARR`)**:
   Defines the total volume limit of the bucket ($ARR = 9,999$, representing a total period of $10,000$ steps).
2. **The Red Line Marker (Capture/Compare Register `CCR`)**:
   Halfway up the bucket, you paint a red line marker ($CCR = 4,999$).
3. **The Automated Output Flag**:
   A mechanical sensor watches the rising water level (`CNT`):
   * While water level is **below the red line** ($CNT < CCR$), the output flag stays **HIGH ($1$)**.
   * The moment water reaches or crosses the red line ($CNT \ge CCR$), the output flag instantly flips **LOW ($0$)**!
   * When water reaches the top rim ($CNT = ARR$), the bucket dumps out to 0 in a split second, and the output flag flips back **HIGH ($1$)**!

#### Sliding the Red Line (`CCR`):
By simply sliding the red line marker (`CCR`) up or down the bucket, you control the exact percentage of time the signal stays High:
* Slide `CCR` down to $10\%$ height ($CCR = 999$) $\implies$ Signal stays High for $10\%$ of the period (**$10\%$ Duty Cycle — Dim Light**).
* Slide `CCR` up to $75\%$ height ($CCR = 7,499$) $\implies$ Signal stays High for $75\%$ of the period (**$75\%$ Duty Cycle — Bright Light**).

---

### Sawtooth vs. Triangular Counting (Edge-Aligned vs. Center-Aligned PWM)

Now, how does the bucket fill and empty?

```text
SAWTOOTH VS TRIANGULAR COUNTING MODES

 Edge-Aligned Mode (Sawtooth Counter):
 Water fills up 0 -> 9,999, then DUMPS INSTANTLY to 0!
 Waveform: /|/|/| (Asymmetric, switching edges align at 0!)

 Center-Aligned Mode (Triangular Up-Down Counter):
 Water fills up 0 -> 9,999, then DRAINS SLOWLY 9,999 -> 0!
 Waveform: /\/\/\ (Symmetric, pulses are centered in time!)
```

* **Edge-Aligned Mode (Sawtooth Counter)**:
  The bucket fills up from $0 \to 9,999$ and dumps instantly back to $0$. 
  * *The Problem*: All PWM output channels flip High at the exact same millisecond ($CNT = 0$). In a 3-phase electric motor driver, turning ON all 3 high-power motor phases at the exact same microsecond causes massive current surges on the power supply and generates electromagnetic interference (**EMI Noise**)!
* **Center-Aligned Mode (Triangular Up-Down Counter)**:
  The bucket fills up from $0 \to 9,999$, and then **drains smoothly back down from $9,999 \to 0$**!
  * *The Advantage*: The generated High pulse is centered symmetrically around the midpoint of the period! 
  * When controlling 3-phase electric motors, center-aligned pulses spread out switching transitions across time, cancelling out high-frequency electromagnetic noise and eliminating acoustic motor whine!

This light switch and water bucket system is the exact physical analogue of **Pulse-Width Modulation and Center-Aligned PWM Control**:
* Flipping the switch 1,000 times/sec is **Pulse-Width Modulation (PWM)**.
* The ON-to-total-period ratio is the **Duty Cycle ($D$)**.
* The water bucket fills up according to the **Counter Register (`CNT`)**.
* The top rim is the **Auto-Reload Register (`ARR`)**.
* The red line marker is the **Capture/Compare Register (`CCR`)**.
* Sawtooth vs Triangular filling is **Edge-Aligned vs Center-Aligned PWM Mode**.

---

## Deep Mechanics of PWM Modes, CCR Registers, and Signal Generation

Now that we possess an intuitive mental model of high-speed light switches, red water lines, and triangular up-down counters, let us examine the formal, rigorous engineering mechanics of **Pulse-Width Modulation (PWM)**.

---

### 1. Mathematical Formulation of Average PWM Voltage and Duty Cycle

A **Pulse-Width Modulated (PWM)** signal is a continuous rectangular wave with a fixed frequency $f_{\text{PWM}}$ (and fixed period $T_{\text{period}} = \frac{1}{f_{\text{PWM}}}$) whose high-level time duration ($t_{\text{ON}}$) is dynamically controlled by hardware.

```text
PWM WAVEFORM TIMING PARAMETERS

 Voltage V_pin
  3.3V ┼──────┐                ┌──────┐
       │      │                │      │
  0.0V ┴──────┴────────────────┴──────┴────────────────► Time t
       ◄─t_ON─►◄────t_OFF─────►
       ◄─────── T_period ──────►
```

#### The Duty Cycle ($D$) Definition:
The **Duty Cycle ($D$)** is defined as the dimensionless ratio of the High active time ($t_{\text{ON}}$) to the total period time ($T_{\text{period}}$), expressed as a fraction or percentage:

$$\mathbf{D = \frac{t_{\text{ON}}}{T_{\text{period}}} = \frac{t_{\text{ON}}}{t_{\text{ON}} + t_{\text{OFF}}}}$$

$$\mathbf{D_{\%}} = \left( \frac{t_{\text{ON}}}{T_{\text{period}}} \right) \times 100\%$$

Where:
* $t_{\text{ON}}$ is the duration where the signal voltage is High ($V_{DD} = 3.3\text{V}$) in seconds.
* $t_{\text{OFF}}$ is the duration where the signal voltage is Low ($GND = 0.0\text{V}$) in seconds.
* $T_{\text{period}}$ is the total period of one PWM cycle ($T_{\text{period}} = t_{\text{ON}} + t_{\text{OFF}}$) in seconds.

#### Deriving Average Analog Voltage ($V_{\text{avg}}$):
The average analog voltage ($V_{\text{avg}}$) delivered to a physical load over one full period $T_{\text{period}}$ is calculated by integrating the instantaneous voltage $V(t)$ over time:

$$V_{\text{avg}} = \frac{1}{T_{\text{period}}} \int_{0}^{T_{\text{period}}} V(t) \, dt$$

Since $V(t) = V_{DD}$ for $0 \le t < t_{\text{ON}}$, and $V(t) = 0$ for $t_{\text{ON}} \le t < T_{\text{period}}$:

$$V_{\text{avg}} = \frac{1}{T_{\text{period}}} \left( \int_{0}^{t_{\text{ON}}} V_{DD} \, dt + \int_{t_{\text{ON}}}^{T_{\text{period}}} 0 \, dt \right) = \frac{V_{DD} \cdot t_{\text{ON}}}{T_{\text{period}}}$$

$$\mathbf{V_{\text{avg}} = D \times V_{DD}}$$

Where:
* $V_{\text{avg}}$ is the effective DC voltage perceived by an analog load (e.g., motor or LED) in Volts.
* $D$ is the fractional Duty Cycle ($0.0 \le D \le 1.0$).
* $V_{DD}$ is the digital supply voltage (e.g., $3.3\text{ Volts}$).

```text
AVERAGE VOLTAGE OUTPUT AT VARIOUS DUTY CYCLES (V_DD = 3.3V)

 Duty Cycle (D) │ High Time (t_ON) │ Low Time (t_OFF) │ Average Output Voltage (V_avg)
────────────────┼──────────────────┼──────────────────┼─────────────────────────────────
   0% (D = 0.00)│ 0.0 * T_period   │ 1.0 * T_period   │ 0.00 Volts (Fully OFF)
  25% (D = 0.25)│ 0.25 * T_period  │ 0.75 * T_period  │ 0.825 Volts
  50% (D = 0.50)│ 0.50 * T_period  │ 0.50 * T_period  │ 1.65 Volts (Half Power)
  75% (D = 0.75)│ 0.75 * T_period  │ 0.25 * T_period  │ 2.475 Volts
 100% (D = 1.00)│ 1.00 * T_period  │ 0.0 * T_period   │ 3.30 Volts (Full Power)
```

---

### 2. The Capture/Compare Register (`TIMx_CCRx`) and Output Stage Hardware

To generate PWM waveforms automatically without CPU intervention, a hardware timer incorporates dedicated **Capture/Compare Channels**.

A 4-channel timer contains four independent Memory-Mapped I/O registers: `TIMx_CCR1`, `TIMx_CCR2`, `TIMx_CCR3`, and `TIMx_CCR4`.

```text
INTERNAL HARDWARE BLOCK DIAGRAM OF A PWM CHANNEL

 Counter CNT ──┐
               ├─►[ 32-Bit Digital Comparator ]
 Register CCR ─┘   (Evaluates: Is CNT < CCR?)
                         │
                         ▼ Match Signal
 ┌───────────────────────────────────────────────────────────┐
 │ OUTPUT COMPARE MODE LOGIC (TIMx_CCMR1 Register)           │
 │  * OC1M = 3'b110 -> PWM Mode 1                            │
 └───────────────────────┬───────────────────────────────────┘
                         │
                         ▼ Waveform Signal
 ┌───────────────────────────────────────────────────────────┐
 │ OUTPUT POLARITY & ENABLE LOGIC (TIMx_CCER Register)       │
 │  * CC1P = 0 -> Active High | CC1E = 1 -> Driver Active    │
 └───────────────────────┬───────────────────────────────────┘
                         │
                         ▼ Physical Pin Pad
                  Output Pin (TIMx_CH1)
```

#### Hardware Control Registers for PWM Channel 1:

1. **Capture/Compare Mode Register 1 (`TIMx_CCMR1`)** at offset `0x18`:
   Controls the functional operating mode of Channel 1 via the **`OC1M[2:0]` Output Compare 1 Mode bits**:
   * **`OC1M = 3'b110` (PWM Mode 1 — Standard Active High PWM)**:
     * While $\text{CNT} < \text{CCR1}$, the channel output is **ACTIVE (High / 1)**.
     * While $\text{CNT} \ge \text{CCR1}$, the channel output is **INACTIVE (Low / 0)**.
   * **`OC1M = 3'b111` (PWM Mode 2 — Inverted Active Low PWM)**:
     * While $\text{CNT} < \text{CCR1}$, the channel output is **INACTIVE (Low / 0)**.
     * While $\text{CNT} \ge \text{CCR1}$, the channel output is **ACTIVE (High / 1)**.
   * **`OC1PE = 1` (Output Compare 1 Preload Enable)**: Enables shadow register buffering for `CCR1`, ensuring that duty cycle updates written by software transition smoothly on the next Update Event (`UEV`) without generating output glitches.

2. **Capture/Compare Enable Register (`TIMx_CCER`)** at offset `0x20`:
   Connects the internal PWM waveform generator to the physical package pad:
   * **`CC1E` (Bit 0 — Channel 1 Output Enable)**: $1 =$ Connects the PWM signal generator to physical pin `TIMx_CH1`.
   * **`CC1P` (Bit 1 — Channel 1 Output Polarity)**:
     * $0 =$ Active High (Logical $1 \implies 3.3\text{V}$).
     * $1 =$ Active Low (Logical $1 \implies 0.0\text{V}$).

---

### 3. Edge-Aligned PWM vs. Center-Aligned PWM Mechanics

Digital hardware timers generate PWM waveforms using two distinct counting directions: **Edge-Aligned Mode** and **Center-Aligned Mode**.

---

#### A. Edge-Aligned PWM Mode (`TIMx_CR1.CMS = 2'b00`)

In **Edge-Aligned Mode**, the counter (`CNT`) operates as a simple up-counter ($0 \to \text{ARR}$). 

The counter counts from $0$ up to $\text{ARR}$, sets the Update Interrupt Flag (`UIF = 1`), resets to $0$ on the next clock tick, and repeats:

```text
EDGE-ALIGNED UP-COUNTING PWM WAVEFORM GENERATION

 Counter CNT
  ARR ┼                  /|                  /|
      │                 / |                 / |
  CCR ┼───────────────/───┼───────────────/───┼── (Compare Match Mark)
      │             /     |             /     |
    0 ┴───────────/───────┴───────────/───────┴──────────► Time t
                  ◄─t_ON─►◄──t_OFF──►
                  ◄──── T_period ───►

 PWM Output Pin (PWM Mode 1):
 3.3V ┼───────────┐       ┌───────────┐       ┌───────
 0.0V ┴───────────┴───────┴───────────┴───────┴───────► Time t
```

#### Mathematical Formulas for Edge-Aligned PWM:

##### 1. PWM Frequency ($f_{\text{PWM\_edge}}$):

$$\mathbf{f_{\text{PWM\_edge}} = \frac{f_{\text{timer\_clk}}}{(\text{PSC} + 1) \times (\text{ARR} + 1)}}$$

##### 2. Duty Cycle ($D_{\text{edge}}$) in PWM Mode 1 (`OC1M = 3'b110`):
The counter steps through $\text{ARR} + 1$ total counts ($0 \dots \text{ARR}$). 

The signal remains High for $\text{CCR}$ counts ($0 \dots \text{CCR}-1$):

$$\mathbf{D_{\text{edge}} = \frac{\text{CCR}}{\text{ARR} + 1}}$$

$$\mathbf{t_{\text{ON}} = \frac{\text{CCR}}{f_{\text{cnt\_clk}}} = \text{CCR} \times \frac{\text{PSC} + 1}{f_{\text{timer\_clk}}}}$$

---

#### B. Center-Aligned PWM Mode (`TIMx_CR1.CMS = 2'b01 / 10 / 11`)

In **Center-Aligned Mode**, the counter (`CNT`) operates as an **Up-Down Triangular Counter**:
1. **Up-Counting Phase**: The counter counts up from $0 \to \text{ARR}$.
2. **Down-Counting Phase**: Upon reaching $\text{ARR}$, the counter turns around and counts down from $\text{ARR} \to 0$!

```text
CENTER-ALIGNED UP-DOWN COUNTING PWM WAVEFORM GENERATION

 Counter CNT
  ARR ┼        /\                  /\
      │       /  \                /  \
  CCR ┼─────/────\──────────────/────\──────────── (Compare Match Mark)
      │    /      \            /      \
    0 ┴──/──────────\────────/──────────\─────────► Time t
         ◄── t_ON ──►
         ◄─────── T_period = 2 * ARR ────────────►

 PWM Output Pin (PWM Mode 1):
 3.3V ┼────┌────────┐──────────┌────────┐─────────
 0.0V ┴────┴────────┴──────────┴────────┴─────────► Time t
           ◄─Symmetric─►
```

#### Mathematical Formulas for Center-Aligned PWM:

Because the counter travels up from $0 \to \text{ARR}$ AND down from $\text{ARR} \to 0$, one full PWM period requires **$2 \times \text{ARR}$ counter steps**!

##### 1. Center-Aligned PWM Frequency ($f_{\text{PWM\_center}}$):

$$\mathbf{f_{\text{PWM\_center}} = \frac{f_{\text{timer\_clk}}}{2 \times (\text{PSC} + 1) \times \text{ARR}}}$$

##### 2. Center-Aligned Duty Cycle ($D_{\text{center}}$) in PWM Mode 1:

$$\mathbf{D_{\text{center}} = \frac{\text{CCR}}{\text{ARR}}}$$

$$\mathbf{t_{\text{ON}} = \frac{2 \times \text{CCR}}{f_{\text{cnt\_clk}}}}$$

Notice that for the exact same $\text{PSC}$ and $\text{ARR}$ settings:
$$\mathbf{f_{\text{PWM\_center}} \approx \frac{1}{2} \cdot f_{\text{PWM\_edge}}}$$

Center-aligned mode runs at **half the frequency** of edge-aligned mode because the counter travels up and down!

---

### 4. EMI Noise and Current Ripple Reduction in Center-Aligned PWM

Why do electric vehicle motor drivers, power inverters, and high-efficiency switching regulators strictly require **Center-Aligned PWM Mode**?

Consider a 3-phase electric motor driven by three PWM channels ($CH_1, CH_2, CH_3$):

```text
3-PHASE SWITCHING CURRENTS: EDGE-ALIGNED VS CENTER-ALIGNED

 Edge-Aligned 3-Phase Switching (All 3 Channels Switch High AT THE EXACT SAME INSTANT!)
 CH1 : ──┐┌───────────────────────
 CH2 : ──┐┌───────────────────────
 CH3 : ──┐┌───────────────────────
          ▲
          └── MASSIVE SIMULTANEOUS CURRENT SPIKE ON POWER SUPPLY! (High EMI!)

 Center-Aligned 3-Phase Switching (Switching Edges Distributed Symmetrically!)
 CH1 : ────┌──────────────┐───────
 CH2 : ──┌───┌──────────┐───┐─────
 CH3 : ┌───────┌──────┐───────┐───
         ▲     ▲      ▲
         └─────┴──────┴── Switching transitions distributed across time! (Low EMI!)
```

#### Physical Analysis of Switching Noise:
1. **Edge-Aligned Mode Failure**:
   In Edge-Aligned mode, all 3 PWM channels reset to $0$ simultaneously at $CNT = 0$. 

   All three high-power MOSFET transistors turn ON at the exact same physical nanosecond!
   
   This creates a massive, abrupt current surge on the power supply bus ($\frac{dI}{dt} > 1,000\text{ A/}\mu\text{s}$), generating electromagnetic radiation (**EMI Noise**) that disrupts nearby radio receivers and creates high-frequency acoustic motor hum.

2. **Center-Aligned Mode Triumph**:
   In Center-Aligned mode, pulses are centered around the midpoint of the triangular wave.
   
   As duty cycles vary across the 3 phases, the switching transitions ($0 \to 1$ and $1 \to 0$) are **distributed symmetrically across time**!
   
   No two phases switch at the exact same nanosecond. Current surges are smoothed out, high-frequency EMI noise drops by **over $20\text{ dB}$**, and electric motors operate in complete, whisper-quiet efficiency!

---

### 5. Generating Exact 0% and 100% Duty Cycles Safely

In digital power control, software must be able to turn a PWM channel completely OFF ($0\%$ Duty Cycle) or completely ON ($100\%$ Duty Cycle) without hardware glitches.

Under **PWM Mode 1** (`OC1M = 3'b110`) in Edge-Aligned Mode:

#### 1. Generating $0\%$ Duty Cycle ($t_{\text{ON}} = 0\text{ ns}$):
Software sets $\text{CCR1} = 0$.
* The condition $\text{CNT} < \text{CCR1}$ is **NEVER TRUE** (since $\text{CNT}$ starts at $0$, and $0 < 0$ is False!).
* The output pin remains **held strictly Low ($0.0\text{V}$) for $100\%$ of the period**!

#### 2. Generating $100\%$ Duty Cycle ($t_{\text{ON}} = T_{\text{period}}$):
Software sets $\text{CCR1} \ge \text{ARR} + 1$.
* The condition $\text{CNT} < \text{CCR1}$ is **ALWAYS TRUE** for all counter values $0 \dots \text{ARR}$.
* The output pin remains **held strictly High ($3.3\text{V}$) for $100\%$ of the period**!

```text
EXTREME DUTY CYCLE REGISTER VALUES (PWM MODE 1)

 Desired Duty Cycle │ CCR Register Value Setting │ Physical Output Pin Behavior
────────────────────┼────────────────────────────┼───────────────────────────────
       0%           │ CCR1 = 0                   │ Output held LOW  (0.0V) 100%
      50%           │ CCR1 = (ARR + 1) / 2       │ Output High 50%, Low 50%
     100%           │ CCR1 >= ARR + 1            │ Output held HIGH (3.3V) 100%
```

---

## Real-World Silicon Failures, Shoot-Through Short Circuits, and Dead-Time Insertion

In high-power industrial engineering (such as driving H-bridge motor drivers, DC-DC buck converters, or electric vehicle inverters), configuring PWM outputs requires managing critical physical power hazards.

---

### 1. The H-Bridge Shoot-Through Short Circuit Hazard

In an H-Bridge motor driver or synchronous buck converter, a single motor phase is driven by two power MOSFET transistors connected in series between $V_{DD}$ ($24\text{V}$) and Ground ($GND$):
* **High-Side MOSFET ($Q_{\text{top}}$)**: Connects the motor pin to $V_{DD}$.
* **Low-Side MOSFET ($Q_{\text{bot}}$)**: Connects the motor pin to Ground ($GND$).

To drive the motor forward, $Q_{\text{top}}$ is turned ON and $Q_{\text{bot}}$ is turned OFF. To reverse, $Q_{\text{top}}$ is turned OFF and $Q_{\text{bot}}$ is turned ON.

```text
H-BRIDGE POWER STAGE AND SHOOT-THROUGH SHORT CIRCUIT

 Power Supply V_DD (24V)
           │
          [ ] High-Side MOSFET (Q_top)
           │
           ├──────────────► To Motor Phase W
           │
          [ ] Low-Side MOSFET  (Q_bot)
           │
          GND
 (If Q_top and Q_bot turn ON at the SAME INSTANT -> DIRECT SHORT CIRCUIT!)
 (24V shorts to Ground! Transistors explode in nanoseconds!)
```

#### The Physical Shoot-Through Hazard:
Power MOSFET transistors do **not** turn OFF instantaneously! Due to internal gate charge ($Q_g$), a transistor takes **$100 \text{ to } 500\text{ nanoseconds}$ to fully turn OFF** after its control signal drops to Low.

If the PWM controller turns $Q_{\text{top}}$ ON at the exact same nanosecond that it commands $Q_{\text{bot}}$ to turn OFF:
* $Q_{\text{bot}}$ is still conducting current while $Q_{\text{top}}$ starts conducting!
* Both transistors are **ON simultaneously for $200\text{ nanoseconds}$**!
* A direct $24\text{-Volt}$-to-Ground short circuit occurs (**Shoot-Through Current Spike**).
* Hundreds of Amperes of short-circuit current rush through the transistors, destroying the power board in a cloud of smoke!

---

### 2. The Hardware Solution: Dead-Time Insertion (`TIM1_BDTR`)

To prevent shoot-through short circuits, advanced PWM timers (such as `TIM1` and `TIM8`) incorporate **Hardware Dead-Time Generators (`BDTR` Register)**.

When driving complementary PWM outputs ($CH_1$ and $CH_1N$):

The hardware dead-time generator automatically inserts a programmable delay window (**Dead-Time $t_{\text{dead}}$**) between turning OFF one transistor and turning ON the other!

```text
DEAD-TIME INSERTION WAVEFORM (PREVENTING SHOOT-THROUGH)

 High-Side Gate Q_top : ──┐                  ┌─────────────────
                          └──────────────────┘
 Low-Side Gate Q_bot  : ───────┐                  ┌────────────
                               └──────────────────┘
                          ◄─t_DT─►            ◄─t_DT─►
                          (DEAD-TIME: BOTH TRANSISTORS ARE OFF!)
```

#### How Dead-Time Protects Power Transistors:
1. At $t = 0$: $Q_{\text{top}}$ turns OFF.
2. **Dead-Time Delay ($t_{\text{dead}} = 500\text{ ns}$)**: The hardware timer **holds BOTH $Q_{\text{top}}$ and $Q_{\text{bot}}$ OFF** for $500\text{ nanoseconds}$!
3. During $t_{\text{dead}}$, $Q_{\text{top}}$ finishes discharging its gate and turns completely OFF.
4. At $t = 500\text{ ns}$: $Q_{\text{bot}}$ is safely turned ON!
5. **Zero short circuits occur!** Power stage efficiency and hardware reliability are $100\%$ preserved.

---

## Solved Industrial Engineering Exercise: Quantitative PWM Frequency, Duty Cycle Math, Center-Aligned Calculations, and Assembly Synthesis

To consolidate your complete mastery of Pulse-Width Modulation, capture/compare registers (`CCR`), edge-aligned vs. center-aligned frequency equations, and assembly register configurations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior bare-metal power systems architect designing a high-efficiency 3-phase electric motor controller for a $3.2\text{ GHz}$ ARM Cortex-M4 server cooling fan processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The timer peripheral `TIM1` is connected to the high-speed APB2 bus operating at clock frequency $f_{\text{timer\_clk}} = \mathbf{168.000 \text{ MHz}}$ ($168,000,000\text{ Hz}$).

```text
3.2 GZ SERVER PROCESSOR PWM MOTOR CONTROLLER CONFIGURATION

 Input Timer Clock f_timer_clk = 168.000 MHz
 ┌─────────────────────────────────────────────────────────────┐
 │ Advanced Timer TIM1 (MMIO Base: 0x4001_0000)                │
 │ Channel 1 Output Pin: PA8 (TIM1_CH1)                        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Target Motor PWM Requirements:
 * Operating Mode     : Center-Aligned PWM Mode 1 (CMS = 2'b01)
 * PWM Frequency      : f_PWM = 20.000 kHz (20,000 Hz - Whisper Quiet!)
 * Desired Duty Cycle : D = 35.0% (35.0% Average Motor Power)
```

#### Hardware Timer Constraints:
* Timer Prescaler: Set to $\text{PSC} = 0$ (No clock division $\implies \text{Prescaler Factor} = 0 + 1 = \mathbf{1}$).
* Counter Clock Frequency: $f_{\text{cnt\_clk}} = \frac{168,000,000}{1} = \mathbf{168.000 \text{ MHz}}$.
* Timer Mode: **Center-Aligned Up-Down Counting Mode 1 (`CMS = 2'b01`)**.
* Output Compare Channel 1: **PWM Mode 1 (`OC1M = 3'b110`)** with Preload Enabled (`OC1PE = 1`).
* Output Enable: Enable Channel 1 Output (`CC1E = 1`) and Main Output Enable (`MOE = 1` in `TIM1_BDTR`).

#### Your Objective

1. Calculate the exact integer value to be written into the Auto-Reload Register (`TIM1_ARR`) to synthesize an exact Center-Aligned PWM frequency $f_{\text{PWM}} = \mathbf{20.000 \text{ kHz}}$ ($20,000\text{ Hz}$).
2. Calculate the exact integer value to be written into the Capture/Compare Register 1 (`TIM1_CCR1`) to achieve an exact Duty Cycle $D = \mathbf{35.0\%}$.
3. Calculate the active High time $t_{\text{ON}}$ (in microseconds) and active Low time $t_{\text{OFF}}$ (in microseconds) of the output PWM signal during each $50.0\ \mu\text{s}$ period.
4. Calculate the average analog voltage $V_{\text{avg}}$ delivered to the cooling fan motor if $V_{DD} = 3.30\text{ Volts}$.
5. Write the complete, production-ready ARM Assembly initialization routine `TIM1_PWM_Init` that configures `TIM1_ARR`, `TIM1_CCR1`, `TIM1_CCMR1`, `TIM1_CCER`, `TIM1_BDTR`, and `GPIOA_AFRH` for pin `PA8`.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Auto-Reload Register Value (`TIM1_ARR`) for Center-Aligned Mode

We apply the Center-Aligned PWM Frequency Formula:

$$f_{\text{PWM\_center}} = \frac{f_{\text{timer\_clk}}}{2 \times (\text{PSC} + 1) \times \text{ARR}}$$

Given:
* $f_{\text{PWM\_center}} = 20,000\text{ Hz}$
* $f_{\text{timer\_clk}} = 168,000,000\text{ Hz}$
* $\text{PSC} = 0 \implies (\text{PSC} + 1) = 1$

Substitute values into the equation:

$$20,000 = \frac{168,000,000}{2 \times 1 \times \text{ARR}} = \frac{168,000,000}{2 \times \text{ARR}} = \frac{84,000,000}{\text{ARR}}$$

Solve for $\text{ARR}$:

$$\text{ARR} = \frac{84,000,000}{20,000} = \mathbf{4,200}$$

Convert $4,200_{10}$ to Hexadecimal:

$$\text{ARR} = 4,200_{10} = \mathbf{\text{0x0000\_1068}}$$

##### Auto-Reload Result:
Writing `4,200` (`0x1068`) into `TIM1_ARR` sets the Center-Aligned PWM period to exactly **$50.0\text{ microseconds}$ ($20.000\text{ kHz}$)**!

---

#### Step 2: Calculate Capture/Compare Register 1 Value (`TIM1_CCR1`) for $35.0\%$ Duty Cycle

In Center-Aligned PWM Mode 1, the duty cycle formula is:

$$D = \frac{\text{CCR1}}{\text{ARR}}$$

Given $D = 35.0\% = 0.350$ and $\text{ARR} = 4,200$:

$$0.350 = \frac{\text{CCR1}}{4,200}$$

$$\text{CCR1} = 0.350 \times 4,200 = \mathbf{1,470}$$

Convert $1,470_{10}$ to Hexadecimal:

$$\text{CCR1} = 1,470_{10} = \mathbf{\text{0x0000\_05BE}}$$

##### Capture/Compare Result:
Writing `1,470` (`0x05BE`) into `TIM1_CCR1` achieves a **$35.0\%$ Duty Cycle** with $100\%$ mathematical precision!

---

#### Step 3: Calculate Signal Timing ($t_{\text{ON}}, t_{\text{OFF}}$) and Average Analog Voltage ($V_{\text{avg}}$)

##### 1. Total PWM Period ($T_{\text{period}}$):

$$T_{\text{period}} = \frac{1}{f_{\text{PWM}}} = \frac{1}{20,000\text{ Hz}} = 0.000050 \text{ Seconds} = \mathbf{50.00 \text{ Microseconds}}$$

##### 2. Active High Time ($t_{\text{ON}}$):

$$t_{\text{ON}} = D \times T_{\text{period}} = 0.350 \times 50.00\ \mu\text{s} = \mathbf{17.50 \text{ Microseconds}}$$

##### 3. Active Low Time ($t_{\text{OFF}}$):

$$t_{\text{OFF}} = T_{\text{period}} - t_{\text{ON}} = 50.00\ \mu\text{s} - 17.50\ \mu\text{s} = \mathbf{32.50 \text{ Microseconds}}$$

##### 4. Average Analog Voltage ($V_{\text{avg}}$) at $V_{DD} = 3.30\text{ V}$:

$$V_{\text{avg}} = D \times V_{DD} = 0.350 \times 3.30\text{ V} = \mathbf{1.155 \text{ Volts}}$$

```text
PWM SIGNAL TIMING AND POWER SUMMARY

 PWM Frequency (f_PWM)         : 20.000 kHz (50.00 us Period)
 Active High Time (t_ON)       : 17.50 us (35.0% of Period)
 Active Low Time (t_OFF)       : 32.50 us (65.0% of Period)
 Average Analog Voltage (V_avg): 1.155 Volts (0% Heat Waste!)
```

---

#### Step 4: Complete Production Assembly Initialization Routine (`TIM1_PWM_Init`)

Here is the complete, production-ready ARM Assembly routine that configures `PA8` for Alternate Function $AF1$ (`TIM1_CH1`) and initializes `TIM1` for Center-Aligned PWM Mode 1:

```assembly
/* PRODUCTION BARE-METAL TIM1 CENTER-ALIGNED PWM INITIALIZATION ROUTINE */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Peripheral Clock Enable */
.equ RCC_AHB1ENR,     0x40023830        /* AHB1 Peripheral Clock Enable */

.equ GPIOA_BASE,      0x40020000
.equ GPIOA_MODER,     0x40020000        /* Mode Register */
.equ GPIOA_OSPEEDR,   0x40020008        /* Output Speed Register */
.equ GPIOA_AFRH,      0x40020024        /* Alternate Function High Register */

.equ TIM1_BASE,       0x40010000
.equ TIM1_CR1,        0x40010000        /* Control Register 1 */
.equ TIM1_CCMR1,      0x40010018        /* Capture/Compare Mode Register 1 */
.equ TIM1_CCER,       0x40010020        /* Capture/Compare Enable Register */
.equ TIM1_PSC,        0x40010028        /* Prescaler Register */
.equ TIM1_ARR,        0x4001002C        /* Auto-Reload Register */
.equ TIM1_CCR1,       0x40010034        /* Capture/Compare Register 1 */
.equ TIM1_BDTR,       0x40010044        /* Break and Dead-Time Register */
.equ TIM1_EGR,        0x40010014        /* Event Generation Register */

.global TIM1_PWM_Init
.type TIM1_PWM_Init, %function

.section .text
.thumb_func
TIM1_PWM_Init:
    push    {r4, lr}

    /* ==================================================================== */
    /* STEP 1: ENABLE GPIOA AND TIM1 PERIPHERAL CLOCKS                      */
    /* ==================================================================== */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set Bit 0 (GPIOAEN = 1) */
    str     r1, [r0]

    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set Bit 0 (TIM1EN = 1) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* ==================================================================== */
    /* STEP 2: CONFIGURE PA8 FOR ALTERNATE FUNCTION 1 (TIM1_CH1)            */
    /* ==================================================================== */
    /* Program AFRH for Pin 8 -> AF1 (Bits [3:0] = 0x1) */
    ldr     r0, =GPIOA_AFRH
    ldr     r1, [r0]
    bic     r1, r1, #(0xF << 0)          /* Clear bits [3:0] (PA8 AF field) */
    orr     r1, r1, #(0x1 << 0)          /* Set AF1 (TIM1_CH1) */
    str     r1, [r0]

    /* Set PA8 Speed to Very High Speed (OSPEEDR = 2'b11) */
    ldr     r0, =GPIOA_OSPEEDR
    ldr     r1, [r0]
    orr     r1, r1, #(0x3 << 16)        /* Set bits [17:16] = 2'b11 */
    str     r1, [r0]

    /* Set PA8 Mode to Alternate Function (MODER = 2'b10) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 16)        /* Clear bits [17:16] */
    orr     r1, r1, #(0x2 << 16)        /* Set bits [17:16] = 2'b10 */
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 3: CONFIGURE TIM1 PRESCALER AND AUTO-RELOAD (ARR = 4200)       */
    /* ==================================================================== */
    ldr     r0, =TIM1_PSC
    movs    r1, #0                      /* PSC = 0 (Divide by 1) */
    str     r1, [r0]

    ldr     r0, =TIM1_ARR
    ldr     r1, =4200                   /* ARR = 4200 for 20 kHz Center-Aligned */
    str     r1, [r0]

    /* Set Initial Duty Cycle CCR1 = 1470 (35.0% Duty Cycle) */
    ldr     r0, =TIM1_CCR1
    ldr     r1, =1470
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 4: CONFIGURE CHANNEL 1 FOR PWM MODE 1 WITH PRELOAD ENABLE       */
    /* ==================================================================== */
    /* CCMR1: OC1M = 3'b110 (PWM Mode 1), OC1PE = 1 (Preload Enable) */
    ldr     r0, =TIM1_CCMR1
    ldr     r1, [r0]
    bic     r1, r1, #(0x7 << 4)         /* Clear OC1M bits [6:4] */
    orr     r1, r1, #(0x6 << 4)         /* Set OC1M = 3'b110 (PWM Mode 1) */
    orr     r1, r1, #(1 << 3)           /* Set OC1PE = 1 (Preload Enable) */
    str     r1, [r0]

    /* CCER: CC1E = 1 (Enable Channel 1 Output), CC1P = 0 (Active High) */
    ldr     r0, =TIM1_CCER
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set CC1E = 1 */
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 5: SET CENTER-ALIGNED MODE 1 AND ADVANCED TIMER MOE BIT         */
    /* ==================================================================== */
    /* TIM1_CR1: CMS = 2'b01 (Center-Aligned Mode 1), ARPE = 1 */
    ldr     r0, =TIM1_CR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 5)           /* Set CMS[0] = 1 (CMS = 2'b01) */
    orr     r1, r1, #(1 << 7)           /* Set ARPE = 1 */
    str     r1, [r0]

    /* TIM1_BDTR: Set MOE = 1 (Main Output Enable for Advanced Timers!) */
    ldr     r0, =TIM1_BDTR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 15)          /* Set Bit 15 (MOE = 1) */
    str     r1, [r0]

    /* Step 6: Force Shadow Register Reload (EGR.UG = 1) */
    ldr     r0, =TIM1_EGR
    movs    r1, #1
    str     r1, [r0]

    /* Step 7: Start TIM1 Counter (CEN = 1 in TIM1_CR1) */
    ldr     r0, =TIM1_CR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set Bit 0 (CEN = 1) */
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size TIM1_PWM_Init, .-TIM1_PWM_Init
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and register configuration results against hardware specifications:

1. **Center-Aligned Frequency Verification**:
   * $f_{\text{PWM\_center}} = \frac{f_{\text{timer\_clk}}}{2 \times (\text{PSC} + 1) \times \text{ARR}} = \frac{168,000,000}{2 \times 1 \times 4,200} = \frac{168,000,000}{8,400} = \mathbf{20,000 \text{ Hz}} = \mathbf{20.000 \text{ kHz}}$.
   * Exact match with $20.000\text{-kHz}$ requirement!

2. **Duty Cycle Verification**:
   * $D = \frac{\text{CCR1}}{\text{ARR}} = \frac{1,470}{4,200} = \mathbf{0.350} = \mathbf{35.0\%}$.
   * Exact match with $35.0\%$ target duty cycle!

3. **Advanced Timer MOE Bit Check**:
   * `TIM1_BDTR` Bit 15 (`MOE = 1`) was set. On advanced timers (`TIM1`/`TIM8`), forgetting to set `MOE = 1` keeps the physical output driver disconnected, resulting in a dead $0.0\text{-V}$ output despite valid counter execution! Setting `MOE = 1` guarantees active PWM output on pin `PA8`.

All center-aligned frequency equations, duty cycle ratios, $V_{\text{avg}}$ voltage integrations, advanced timer `MOE` output enables, and assembly configuration steps evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Pulse-Width Modulation (PWM)**: A digital technique for delivering variable average analog power ($V_{\text{avg}} = D \cdot V_{DD}$) to physical loads without heat waste by toggling a digital pin High and Low at a constant high frequency ($f_{\text{PWM}}$) while modulating the Duty Cycle ratio ($D = \frac{t_{\text{ON}}}{T_{\text{period}}}$).
* **Capture/Compare Register (`TIMx_CCRx`)**: An MMIO comparator register that holds a target threshold $CCR$; the hardware continuously compares $CNT$ against $CCR$, toggling the physical output pin when $CNT == CCR$ in $0\text{ CPU cycles}$ according to the selected mode (`OC1M`).
* **Center-Aligned PWM Mode**: An advanced timer mode where the counter $CNT$ operates as an up-down triangular counter ($0 \to ARR \to 0$), creating symmetric output pulses centered around the mid-period point to distribute switching edges, eliminate high-frequency harmonic current spikes, and reduce electromagnetic interference (EMI).