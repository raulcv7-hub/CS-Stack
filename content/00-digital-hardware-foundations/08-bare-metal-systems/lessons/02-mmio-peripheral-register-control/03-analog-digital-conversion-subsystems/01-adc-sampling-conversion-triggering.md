content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/02-mmio-peripheral-register-control/03-analog-digital-conversion-subsystems/01-adc-sampling-conversion-triggering.md
# Analog-to-Digital Conversion Mechanics, Hardware Timer TRGO Triggers, and Sample-and-Hold Timing Closure

## The Continuous Analog Real World and Discrete Binary Registers

In digital silicon microarchitecture, execution cores, logic gates, and Memory-Mapped I/O (MMIO) registers operate exclusively on discrete binary numbers ($0$s and $1$s). A $32\text{-bit}$ register stores integers as structured bit patterns, where each bit represents a power of two.

However, the physical world surrounding the microchip is continuous and analog. 

Physical phenomena do not exist as neat digital integers:
* A lithium-ion battery voltage slowly declines from $4.20\text{ Volts}$ down to $3.00\text{ Volts}$ as it discharges.
* An industrial temperature sensor outputs a continuous, smooth analog voltage ranging from $0.000\text{ Volts}$ at $-40^\circ\text{C}$ to $3.300\text{ Volts}$ at $+125^\circ\text{C}$.
* A microphone generates a rapidly fluctuating analog AC audio voltage.

To allow a digital processor to measure, process, and react to these physical voltages, the microchip incorporates an **Analog-to-Digital Converter (ADC)**.

```text
CONTINUOUS ANALOG VOLTAGE VS. DISCRETE DIGITAL BINARY STEPS

 Continuous Analog Waveform (Infinite Voltage Resolution)
 Voltage V(t)
  3.3V ┼─────────────/\──────────────
       │            /  \
  1.65V┼───────────/────\────────────
       │          /      \
  0.0V ┴─────────/────────\──────────► Time t

 12-Bit Quantized Digital Steps (4,096 Discrete Binary Values)
 Digital Code D
  4095 ┼─────────────┌──┐────────────
       │            ┌┘  └┐
  2047 ┼───────────┌┘    └┐──────────
       │          ┌┘      └┐
     0 ┴──────────┴────────┴─────────► Time t
```

Converting a continuous physical voltage into a digital binary integer inside a bare-metal assembly environment introduces three severe physical and hardware processing barriers:

1. **Sample-and-Hold Capacitor Charging Delays**:
   An ADC cannot measure a moving voltage instantly. Before converting a voltage, the ADC's internal sampling stage must capture a snapshot of the voltage by charging a microscopic internal **Sample-and-Hold Capacitor ($C_{\text{sample}}$)** through internal and external input resistance ($R_{\text{src}} + R_{\text{ADC}}$). 
   
   If software triggers a conversion too quickly before the capacitor charges completely to the true input voltage, **the ADC measures a false, lower voltage number**, corrupting sensor accuracy!

2. **Sampling Time Jitter in Software Triggering**:
   If an assembly program attempts to trigger ADC conversions periodically using software loops or software timer interrupts, variable CPU instruction pipeline delays and nested interrupt preemption introduce **Sampling Jitter ($\Delta t$)**. 

   In digital signal processing (DSP), non-uniform sampling intervals distort the frequency spectrum of the sampled signal, generating false harmonic noise and invalidating Fast Fourier Transform (FFT) analysis!

```text
SAMPLING TIME JITTER DISTORTION IN SOFTWARE TRIGGERING

 Ideal Uniform Sampling Intervals (Exact 1.0 ms Spacing -> Zero Jitter)
 Voltage ┼──────*──────*──────*──────*──────*──────*──────► Time t
         ◄1.0ms►◄1.0ms►◄1.0ms►◄1.0ms►◄1.0ms►

 Jittered Software Sampling (Interrupt Delays Cause Variable Spacing)
 Voltage ┼──────*────────*────*───────*──────*────────*───► Time t
         ◄1.2ms►◄0.7ms►◄1.1ms►◄1.0ms►◄1.3ms► (HARMONIC NOISE GENERATED!)
```

3. **Register Overwrite and Overrun Errors**:
   An ADC conversion requires multiple clock cycles ($12 \text{ to } 15\text{ ADC clock cycles}$) to resolve all 12 bits. If the CPU attempts to read the ADC Data Register (`ADC_DR`) before conversion finishes, it reads old, stale garbage data. Conversely, if a new conversion completes before the CPU or DMA engine reads the previous sample out of `ADC_DR`, an **Overrun Error (`OVR`)** occurs, destroying data!

To measure physical analog voltages with microvolt accuracy, zero sampling jitter, and $100\%$ data integrity, bare-metal hardware architectures employ **Successive Approximation Register (SAR) ADCs**, **Hardware Timer TRGO Triggers**, and **End-of-Conversion (`EOC`) Flags**.

---

## The Water Cup Dip and the Metronome Strobe: A Mental Model for ADC Sampling

To build a crystal-clear mental model of sample-and-hold capacitor charging, successive approximation conversion, hardware trigger routing, and data flag synchronization before inspecting bitwise registers and assembly equations, let us consider an everyday analogy: **Measuring the Height of a Wavy River**.

Imagine an engineer (**The CPU Core Execution Pipeline**) standing beside a turbulent, wavy river (**A Continuous Analog Input Voltage**). The engineer needs to measure the exact height of the water level 1,000 times per second ($1.0\text{ kHz}$).

```text
THE WAVY RIVER MEASUREMENT METAPHOR

 Turbulent River (Continuous Analog Input Voltage)
 ┌───────────────────────────────────────────────────────────┐
 │ Wavy, Fluctuating Water Level                             │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ Narrow Pipe (Source Resistance R_src + R_ADC)
 ┌───────────────────────────────────────────────────────────┐
 │ Tiny Measuring Cup (Sample-and-Hold Capacitor C_sample)   │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ Sealed Water Sample
 ┌───────────────────────────────────────────────────────────┐
 │ Digital Balance Scale (12-Bit SAR Conversion Array)       │
 └───────────────────────────────────────────────────────────┘
```

The engineer uses three specific tools to perform this measurement:

---

### Step 1: The Water Cup Dip (The Sample-and-Hold Stage)

The engineer cannot weigh the entire flowing river at once! They must take a small sample.

To capture a sample, the engineer dips a tiny measuring cup (**The Internal Sample-and-Hold Capacitor $C_{\text{sample}} \approx 12\text{ pF}$**) into the river through a narrow inlet pipe (**Input Source Resistance $R_{\text{src}} + R_{\text{ADC}}$**):

* **The Charging Delay**: Because the inlet pipe is narrow, water takes a few microseconds to flow through the pipe and fill the cup to the exact same height as the river!
* **The Premature Pull-Out Error**: If the engineer dips the cup into the water and pulls it out after only 1 nanosecond, the cup is only half-full! 

  The engineer weighs the half-full cup and records a false, low water height!
* **The Solution ($t_{\text{sample}}$)**: The engineer **MUST leave the cup under water long enough ($t_{\text{sample}}$)** for the cup's water level to equalize $100\%$ with the river height before sealing the valve!

---

### Step 2: The Digital Balance Scale (Successive Approximation Conversion / SAR)

Once the measuring cup is filled and sealed (**Hold Phase**), the engineer pours the captured water onto a digital balance scale (**The 12-Bit Successive Approximation Register / SAR Array**).

The digital balance scale weighs the trapped water using **12 binary comparison steps**:

```text
SUCCESSIVE APPROXIMATION (SAR) BINARY SEARCH BALANCE

 Step 1  : Is Water Weight >= 50% Full-Scale (1.65V)?  YES -> Bit 11 = 1
 Step 2  : Is Water Weight >= 75% Full-Scale (2.475V)? NO  -> Bit 10 = 0
 Step 3  : Is Water Weight >= 62.5% Full-Scale?        YES -> Bit 9  = 1
 ...
 Step 12 : Final bit resolved! Output Digital Integer: 2748 (0x0ABC)
```

1. **Step 1 (Bit 11 - MSB)**: The scale compares the water sample against a $50\%$ reference weight ($1.65\text{V}$). The sample is heavier! The scale sets Bit 11 = $1$.
2. **Step 2 (Bit 10)**: The scale adds a $25\%$ weight ($2.475\text{V}$). The sample is lighter! The scale sets Bit 10 = $0$.
3. **Step 3 (Bit 9)**: The scale tries a $12.5\%$ weight. The sample is heavier! The scale sets Bit 9 = $1$.
4. **Steps 4 to 12**: The scale continues this binary search for 12 iterations, resolving all 12 bits down to the final Least Significant Bit (LSB)!
5. The scale outputs a digital integer: **`2748`** (out of $4,095$ max).

---

### Step 3: The Metronome Strobe Light (Timer `TRGO` Hardware Triggering)

How does the engineer ensure that samples are taken at **exact, uniform $1.0\text{-millisecond}$ intervals**?

If the engineer tries to press the cup-dip button manually while reading emails (**Software Execution Loops / CPU Interrupts**):
* Sometimes they press the button at $1.0\text{ ms}$, sometimes at $1.2\text{ ms}$, sometimes at $0.8\text{ ms}$ (**Sampling Jitter**).
* The recorded water levels form a distorted, noisy graph!

To eliminate human error, the engineer connects a precision quartz metronome (**Hardware Timer `TIMx`**) directly to the cup-dip button via a copper cable (**The Timer Trigger Output `TRGO` Signal Line**):

```text
TIMER TRGO HARDWARE TRIGGERING (ZERO JITTER!)

 Precision Metronome (Timer TIMx) ──► Flashes TRGO Pulse every 1.000000 ms!
                                           │
                                           ▼ (Hardware Signal Line)
 Cup Dip Button (ADC Start Conversion) ────┘
 (Dips cup automatically on the exact nanosecond! ZERO SAMPLING JITTER!)
```

* Every $1.000000\text{ millisecond}$ on the exact nanosecond, the metronome emits an electrical pulse (**`TRGO` Event**).
* The electrical pulse triggers the cup-dip mechanism automatically in hardware!
* **Sampling jitter drops to 0.000 nanoseconds!** The recorded water levels form a $100\%$ pure, noise-free digital representation of the river!

---

### Step 4: The Order Bell (End-of-Conversion `EOC` Flag)

When the digital balance scale finishes weighing the water sample (after 12 comparison steps):
1. The scale rings a loud bell (**Sets `EOC` Flag = 1 in Status Register `ADC_SR`**).
2. The waiter (**The CPU Core or DMA Engine**) hears the bell, knows fresh data is ready on the counter, and reads the digital number out of the data tray (`ADC_DR`).

This water cup measurement system is the exact physical analogue of **Analog-to-Digital Conversion, Sample-and-Hold Timing, TRGO Triggers, and EOC Flags**:
* The wavy river is the **Continuous Analog Input Voltage ($V_{\text{analog}}$)**.
* The tiny measuring cup is the **Sample-and-Hold Capacitor ($C_{\text{sample}}$)**.
* Leaving the cup under water is the **Sampling Time Window ($t_{\text{sample}}$)**.
* The 12 binary balance checks are the **12-Bit Successive Approximation Register (SAR) Algorithm**.
* The precision quartz metronome is the **Hardware Timer (`TIMx`)**.
* The copper trigger cable is the **Timer Master Trigger Output Line (`TRGO`)**.
* The order bell ringing is the **End-of-Conversion Flag (`EOC`)**.

---

## Deep Mechanics of SAR ADCs, Sample-and-Hold Charging Math, and TRGO Triggers

Now that we possess an intuitive mental model of water cup sampling, balance scales, and metronome strobe triggers, let us examine the formal, rigorous engineering mechanics of **Successive Approximation Register (SAR) ADCs**, **Sample-and-Hold $RC$ Charging Math**, and **Timer `TRGO` Hardware Triggering**.

---

### 1. The 12-Bit Successive Approximation Register (SAR) ADC Architecture

In modern 32-bit microcontrollers, the standard integrated ADC is a **12-Bit Successive Approximation Register (SAR) Converter**.

A 12-bit SAR ADC contains four internal hardware blocks:
1. **Sample-and-Hold Circuit**: A analog switch ($R_{\text{ADC}}$) and sampling capacitor ($C_{\text{sample}}$).
2. **12-Bit Capacitive DAC (Digital-to-Analog Converter)**: Generates precise internal reference comparison voltages ($V_{\text{DAC}}$).
3. **High-Speed Analog Voltage Comparator**: Compares the trapped sample voltage $V_{\text{sample}}$ against the internal reference $V_{\text{DAC}}$.
4. **Successive Approximation Register & Control Logic**: Executes a 12-step binary search algorithm to resolve bits $11 \dots 0$.

```text
12-BIT SUCCESSIVE APPROXIMATION REGISTER (SAR) ADC SCHEMATIC

 Analog Input Pin (V_analog)
        │
       [ ] Sampling Switch (R_ADC ~600 Ohms)
        │
        ├───[===] Sampling Capacitor (C_sample ~12 pF)
        │     │
        │    GND
        ▼
 ┌─────────────┐
 │ (+) Input   │
 │ Analog      ├─► [ Voltage Comparator ] ──► Comparison Result (0 or 1)
 │ (-) Input   │                                      │
 └──────▲──────┘                                      ▼
        │                                   ┌───────────────────┐
        │ Internal Reference V_DAC          │ 12-Bit SAR Logic  │
 ┌──────┴──────────────┐                    │ Register & Control│
 │ 12-Bit Internal DAC ├◄── 12-Bit Code ────┤ (Bits 11 .. 0)    │
 └─────────────────────┘                    └───────────────────┘
```

---

### Mathematical Quantization & LSB Resolution Equation

A 12-bit ADC quantizes an analog input voltage $V_{\text{analog}}$ (ranging from $0.0\text{V}$ to positive reference voltage $V_{\text{REF}+} = 3.3\text{V}$) into a $12\text{-bit}$ unsigned binary integer $D_{\text{ADC}} \in [0, 4095]$.

The total number of discrete quantization steps $N_{\text{steps}}$ for an $N_{\text{bits}}$-bit converter is:

$$N_{\text{steps}} = 2^{N_{\text{bits}}} - 1 = 2^{12} - 1 = \mathbf{4,095 \text{ Steps}}$$

The physical voltage value represented by one **Least Significant Bit (LSB)**—known as the **Voltage Resolution ($V_{\text{LSB}}$)**—is:

$$\mathbf{V_{\text{LSB}} = \frac{V_{\text{REF}+}}{2^{N_{\text{bits}}} - 1} = \frac{3.30 \text{ V}}{4,095} \approx \mathbf{805.861 \ \mu\text{Volts per LSB}}}$$

#### Ideal Conversion Equation ($V_{\text{analog}} \to D_{\text{ADC}}$):

$$D_{\text{ADC}} = \left\lfloor \frac{V_{\text{analog}}}{V_{\text{REF}+}} \times 4,095 \right\rceil$$

#### Reconstructed Analog Voltage Equation ($D_{\text{ADC}} \to V_{\text{analog}}$):

$$\mathbf{V_{\text{analog}} = \frac{D_{\text{ADC}}}{4,095} \times V_{\text{REF}+}}$$

Where:
* $D_{\text{ADC}}$ is the 12-bit digital integer read from `ADC_DR` ($0 \le D_{\text{ADC}} \le 4,095$).
* $V_{\text{REF}+}$ is the positive analog reference voltage (typically $3.30\text{ Volts}$).
* $V_{\text{analog}}$ is the calculated physical analog voltage in Volts.

```text
12-BIT QUANTIZATION EXAMPLES (V_REF+ = 3.30V)

 Digital Code D_ADC │ Hexadecimal Value │ Calculated Analog Voltage V_analog
────────────────────┼───────────────────┼────────────────────────────────────
         0          │      0x000        │ 0.0000 Volts (Ground)
      1024          │      0x400        │ 0.8252 Volts
      2047          │      0x7FF        │ 1.6496 Volts (~Half Scale V_REF/2)
      3072          │      0xC00        │ 2.4748 Volts
      4095          │      0xFFF        │ 3.3000 Volts (Full Scale V_REF+)
```

---

### 2. Sample-and-Hold Charging Math ($t_{\text{sample}}$)

Before the 12-step SAR binary search can begin, the sampling switch must close for a duration called the **Sampling Time Window ($t_{\text{sample}}$)** to charge $C_{\text{sample}}$.

During $t_{\text{sample}}$, the internal capacitor $C_{\text{sample}}$ charges exponentially through the combined resistance of the external signal source ($R_{\text{src}}$) and the internal analog switch ($R_{\text{ADC}}$):

$$\text{Total Resistance } R_{\text{total}} = R_{\text{src}} + R_{\text{ADC}}$$

```text
SAMPLE-AND-HOLD RC CHARGING CIRCUIT

 External Sensor Source (R_src)    Internal ADC Switch (R_ADC)
 V_analog ───[ Resistor R_src ]────[ Resistor R_ADC ]───┬───► To Comparator
                                                        │
                                                      [===] C_sample (~12 pF)
                                                        │
                                                       GND
```

The instantaneous voltage across the sampling capacitor $V_{\text{cap}}(t)$ over time $t$ follows the classic $RC$ exponential charging equation:

$$V_{\text{cap}}(t) = V_{\text{analog}} \times \left( 1 - e^{-\frac{t}{R_{\text{total}} \cdot C_{\text{sample}}}} \right)$$

#### Deriving Minimum Sampling Time for 12-Bit Accuracy

To achieve full 12-bit conversion accuracy, the error between $V_{\text{cap}}$ and true $V_{\text{analog}}$ at the end of the sampling window **MUST be less than $\frac{1}{2}\text{ LSB}$**!

$$\text{Required Error Bound: } \quad \frac{|V_{\text{analog}} - V_{\text{cap}}(t_{\text{sample}})|}{V_{\text{analog}}} \le \frac{1}{2 \times 2^{12}} = \frac{1}{2^{13}} = \frac{1}{8,192}$$

Substitute the exponential charging equation into the error bound:

$$e^{-\frac{t_{\text{sample}}}{R_{\text{total}} \cdot C_{\text{sample}}}} \le \frac{1}{8,192}$$

Take the natural logarithm ($\ln$) of both sides:

$$\frac{t_{\text{sample}}}{R_{\text{total}} \cdot C_{\text{sample}}} \ge \ln(8,192) \approx \mathbf{9.0109}$$

Solving for minimum sampling time $t_{\text{sample\_min}}$ yields **The Master ADC Sampling Time Equation**:

$$\mathbf{t_{\text{sample\_min}} \ge 9.011 \times (R_{\text{src}} + R_{\text{ADC}}) \times C_{\text{sample}}}$$

Where:
* $t_{\text{sample\_min}}$ is the minimum required sampling window duration in seconds.
* $R_{\text{src}}$ is the output impedance of the external analog sensor in Ohms ($\Omega$).
* $R_{\text{ADC}}$ is the internal switch resistance of the ADC in Ohms (typically $R_{\text{ADC}} \approx 600\ \Omega$).
* $C_{\text{sample}}$ is the internal sampling capacitance in Farads (typically $C_{\text{sample}} \approx 12\text{ pF} = 12 \times 10^{-12}\text{ F}$).

```text
EXPONENTIAL CAPACITOR CHARGING VS. SAMPLING WINDOW

 Voltage V_cap
  3.3V ┼───────────────────────────── True V_analog Line
       │                           /
       │                          /  t_sample = 9.011 * RC (99.988% Charged -> 100% Acc!)
  1.65V┼                         / ◄── 1/2 LSB Error Boundary
       │   t_sample TOO SHORT!  /
  0.0V ┴───/───────────────────/─────────────────────────────► Time t
       ◄── 3 * RC ──►
       (Only 95% charged!        ◄──────── 9.011 * RC ───────►
        Measures false low!)     (Fully charged to true voltage!)
```

#### Example Sampling Time Calculation:
Suppose an external sensor has output impedance $R_{\text{src}} = 10\text{ k}\Omega = 10,000\ \Omega$, $R_{\text{ADC}} = 600\ \Omega$, and $C_{\text{sample}} = 12\text{ pF}$:

$$R_{\text{total}} = 10,000 + 600 = 10,600\ \Omega$$

$$t_{\text{sample\_min}} \ge 9.011 \times 10,600 \ \Omega \times (12 \times 10^{-12}\text{ F})$$

$$t_{\text{sample\_min}} \ge 9.011 \times (1.272 \times 10^{-7}\text{ s}) = \mathbf{1.146 \times 10^{-6} \text{ Seconds}} = \mathbf{1.146 \text{ Microseconds}}$$

If the ADC clock operates at $f_{\text{ADC}} = 14\text{ MHz}$ ($T_{\text{ADC}} = 71.4\text{ ns}$):

$$\text{Required Cycles} = \frac{1.146 \times 10^{-6}\text{ s}}{71.4 \times 10^{-9}\text{ s/cycle}} = \mathbf{16.05 \text{ ADC Cycles}}$$

Programming `ADC_SMPR2.SMP = 3'b011` ($28\text{ cycles}$) guarantees $t_{\text{sample}} = 28 \times 71.4\text{ ns} = 2.0\ \mu\text{s} > 1.146\ \mu\text{s}$, achieving $100\%$ full 12-bit conversion accuracy!

---

### 3. Hardware Timer `TRGO` Triggering (Zero-Jitter Sampling)

To eliminate software sampling jitter ($\Delta t$), high-performance microcontrollers feature **Direct Hardware Trigger Interconnections** between general-purpose timers and the ADC peripheral.

Instead of writing `SWSTART = 1` in software or executing an interrupt handler, a hardware timer is configured to emit a **Trigger Output (`TRGO`)** signal pulse on every counter update event.

```text
TIMER TRGO TO ADC HARDWARE TRIGGER INTERCONNECT

 Hardware Timer TIM2                               ADC Peripheral
 ┌───────────────────────────┐                     ┌───────────────────────────┐
 │ Counter CNT = ARR (Update)│                     │ External Trigger Logic    │
 ├───────────────────────────┤                     ├───────────────────────────┤
 │ Master Mode Reg (MMS=010) ├────── TRGO Line ───►│ EXTEN = 01 (Rising Edge)  │
 │ Emits TRGO Pulse on Match │  (Direct Silicon    │ EXTSEL = 0110 (TIM2 TRGO) │
 └───────────────────────────┘   Hardware Wire!)   └─────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                  Hardware Starts ADC Conversion!
                                                  (0.000 ns Software Jitter!)
```

#### Configuring the Hardware Trigger Pipeline:

1. **Configure Timer Master Mode (`TIMx_CR2.MMS = 3'b010`)**:
   Sets the timer's Master Mode to emit a `TRGO` pulse whenever the counter updates ($CNT = ARR$).
2. **Configure ADC External Trigger Source (`ADC_CR2.EXTSEL`)**:
   Selects the specific timer `TRGO` line as the trigger source for regular ADC channels (e.g., `EXTSEL = 4'b0110` selects `TIM2_TRGO`).
3. **Enable External Trigger Edge Detection (`ADC_CR2.EXTEN = 2'b01`)**:
   Configures the ADC to trigger conversion start **on the rising edge of the incoming `TRGO` hardware pulse**.

When the timer counter overflows, the `TRGO` pulse travels across an internal silicon wire directly to the ADC hardware. 

The ADC begins sampling **in less than $1\text{ nanosecond}$**, completely independent of CPU execution state, current interrupt priority, or software pipeline stalls!

---

### 4. Conversion Flags, Data Alignment, and Overrun Protection

Once the 12-bit SAR conversion finishes, the ADC updates its Memory-Mapped I/O registers:

```text
ADC STATUS AND DATA REGISTERS (BASE: 0x4001_2000)

 Byte Offset │ Register Mnemonic │ Bitfield & Hardware Function
─────────────┼───────────────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ ADC_SR            │ Status Register (Bit 1 = EOC, Bit 5 = OVR Overrun)
  Offset 0x04│ ADC_CR1           │ Control Register 1 (Resolution, EOCIE Interrupt Enable)
  Offset 0x08│ ADC_CR2           │ Control Register 2 (ADON Power, SWSTART, ALIGN, EXTEN)
  Offset 0x0C│ ADC_SMPR2         │ Sample Time Register 2 (Channel 0..9 Sample Cycles)
  Offset 0x4C│ ADC_DR            │ Data Register (16-bit register holding 12-bit result)
```

---

#### Data Alignment Options (`ADC_CR2.ALIGN`)

The ADC Data Register (`ADC_DR`) is a 16-bit register, but the converted result is 12 bits.

Software configures bit 11 (`ALIGN`) in `ADC_CR2` to choose the data alignment:

```text
DATA ALIGNMENT IN 16-BIT DATA REGISTER (ADC_DR)

 Right-Alignment (ALIGN = 0 — Default for Integer Arithmetic)
 Bit 15                   Bit 12 Bit 11                                Bit 0
 ┌──────────────────────────────┬───────────────────────────────────────────┐
 │ 0  0  0  0                   │ D11  D10  D9  D8  D7  D6  D5  D4  D3..D0  │
 └──────────────────────────────┴───────────────────────────────────────────┘
  ◄── 4 Zero Extension Bits ──►  ◄────── 12-Bit Conversion Result ─────────►

 Left-Alignment (ALIGN = 1 — Ideal for Fast 8-Bit Fractional Processing)
 Bit 15                                Bit 4 Bit 3                       Bit 0
 ┌──────────────────────────────────────────┬───────────────────────────────┐
 │ D11  D10  D9  D8  D7  D6  D5  D4  D3..D0  │ 0  0  0  0                    │
 └──────────────────────────────────────────┴───────────────────────────────┘
  ◄────── 12-Bit Conversion Result ─────────► ◄── 4 Zero Padding Bits ────────►
```

* **Right Alignment (`ALIGN = 0` — Standard Integer Mode)**:
  Bits $[11:0]$ hold the 12-bit conversion value ($0 \dots 4095$). Bits $[15:12]$ are zero-extended. Reading `ADC_DR` yields an immediate integer value suitable for math calculations.
* **Left Alignment (`ALIGN = 1` — Fast 8-Bit Mode)**:
  Bits $[15:4]$ hold the 12-bit value. Reading the high byte (`ADC_DR >> 8`) extracts a fast 8-bit truncated sample ($0 \dots 255$) in a single shift instruction!

---

#### The End-of-Conversion (`EOC`) Flag and Read-to-Clear Mechanics

When conversion finishes, hardware sets **Bit 1 (`EOC`) in `ADC_SR` to $1$.

#### How `EOC` Is Cleared:
1. **Hardware Read-to-Clear**: Reading the `ADC_DR` data register **automatically clears `EOC = 0`** in hardware!
2. **Software Write-0-to-Clear**: Software can manually clear `EOC` by writing $0$ to bit 1 of `ADC_SR`.

#### Overrun Error Handling (`OVR` = Bit 5 of `ADC_SR`)
If a new conversion finishes and sets `EOC = 1` while the previous conversion's `EOC` flag has not been cleared (because the CPU or DMA engine failed to read `ADC_DR` in time):
* Hardware sets the **Overrun Flag (`OVR = 1`)**.
* The new conversion value is discarded (or overwrites `ADC_DR`, depending on configuration), and an `OVR` error interrupt is raised!

---

## Real-World Silicon Engineering: Source Impedance Droop, Self-Calibration, and Analog Noise

In commercial hardware engineering, achieving full 12-bit accuracy requires navigating real-world analog physical hazards.

---

### 1. High Source Impedance $R_{\text{src}}$ Voltage Droop

Suppose an engineer connects a high-impedance temperature sensor ($R_{\text{src}} = 100\text{ k}\Omega$) directly to an ADC input pin.

If the sampling time is left at its default value ($t_{\text{sample}} = 3\text{ ADC cycles} = 214\text{ ns}$ at $14\text{ MHz}$):

$$\text{Required } t_{\text{sample\_min}} = 9.011 \times (100,000 + 600) \times (12 \times 10^{-12}\text{ F}) \approx \mathbf{10.88 \text{ Microseconds}}$$

```text
HIGH SOURCE IMPEDANCE VOLTAGE DROOP HAZARD

 Sensor Input V_analog = 2.50V (High Impedance R_src = 100 kΩ)
                       │
                       ▼
 Short Sampling Window (t_sample = 0.214 us << 10.88 us Required!)
 Capacitor C_sample charges to ONLY 1.20V before switch opens!
                       │
                       ▼
 ADC Converts 1.20V Sample ──► Reads Code 1489 (1.20V) INSTEAD OF Code 3102 (2.50V)!
 (Measurement Error = 1.30 Volts / 1,613 LSBs Error!)
```

#### Physical Failure:
Because $214\text{ ns} \ll 10.88\ \mu\text{s}$, $C_{\text{sample}}$ charges to only $1.20\text{V}$ before the sampling switch opens. 

The ADC measures $1.20\text{V}$ instead of the true $2.50\text{V}$, introducing a massive **$1.30\text{-Volt}$ measurement error ($1,613\text{ LSBs}$ error!)**.

#### Engineering Fixes:
1. **Increase Sampling Cycles**: Set `ADC_SMPR2.SMP = 3'b111` ($480\text{ cycles} = 34.28\ \mu\text{s} > 10.88\ \mu\text{s}$).
2. **Add an External Op-Amp Buffer**: Place an operational amplifier (unity-gain buffer with $R_{\text{out}} < 10\ \Omega$) between the high-impedance sensor and the ADC pin!

---

### 2. ADC Self-Calibration Sequence

Inside every ADC silicon die, microscopic manufacturing variations across transistors create small offset errors (the ADC might read `0x005` when connected to exact Ground).

To eliminate offset errors, modern ADCs include an automated **Self-Calibration Engine**:

```assembly
/* PRODUCTION ADC SELF-CALIBRATION SEQUENCE IN ASSEMBLY */
    /* 1. Enable ADC Power (ADON = 1) */
    ldr     r0, =ADC1_CR2
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set ADON bit */
    str     r1, [r0]

    /* 2. Reset Calibration Registers (RSTCAL = 1) */
    orr     r1, r1, #(1 << 3)           /* Set RSTCAL bit */
    str     r1, [r0]
wait_rstcal:
    ldr     r1, [r0]
    tst     r1, #(1 << 3)               /* Test RSTCAL bit */
    bne     wait_rstcal                 /* Wait until RSTCAL clears to 0! */

    /* 3. Start Self-Calibration (CAL = 1) */
    orr     r1, r1, #(1 << 2)           /* Set CAL bit */
    str     r1, [r0]
wait_cal:
    ldr     r1, [r0]
    tst     r1, #(1 << 2)               /* Test CAL bit */
    bne     wait_cal                    /* Wait until CAL clears to 0! */

    /* ADC is now 100% self-calibrated and offset-corrected! */
```

---

## Solved Industrial Engineering Exercise: Quantitative 12-Bit ADC Sampling, Timer TRGO Calculation, and Assembly Driver Synthesis

To consolidate your complete mastery of 12-bit SAR ADC mechanics, $RC$ sample-and-hold charging calculations, timer `TRGO` hardware triggers, and assembly driver configurations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal bare-metal sensor systems architect designing an automated battery monitoring system for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates at analog reference voltage $V_{\text{REF}+} = \mathbf{3.300 \text{ Volts}}$.

```text
3.2 GHz SERVER PROCESSOR BATTERY MONITORING ADC SUBSYSTEM

 Battery Sensor (R_src = 4.0 kΩ) ──► Pin PA0 (ADC1_IN0) ──► 12-Bit SAR ADC1
                                                            │
 Timer TIM2 TRGO Trigger (100 Hz Rate) ────────────────────┘
 Clock f_timer_clk = 84.000 MHz
```

#### Hardware & Sensor Specifications:
* **Analog Input Pin**: `PA0` connected to Channel 0 of `ADC1` (`ADC1_IN0`).
* **External Battery Sensor Output Impedance**: $R_{\text{src}} = 4.0\text{ k}\Omega = 4,000\ \Omega$.
* **ADC1 Internal Switch Parameters**: $R_{\text{ADC}} = 600\ \Omega$, $C_{\text{sample}} = 12.0\text{ pF} = 12 \times 10^{-12}\text{ F}$.
* **ADC Clock Frequency**: $f_{\text{ADC}} = \mathbf{14.000 \text{ MHz}}$ ($T_{\text{ADC}} \approx 71.4285\text{ ns}$).
* **Hardware Trigger Requirement**: `TIM2` Update Event `TRGO` must trigger `ADC1` conversions at a precise rate of **$100.0\text{ Hz}$** ($T_{\text{sample\_period}} = 10.0\text{ ms}$).
* **`TIM2` Input Clock**: $f_{\text{timer\_clk}} = 84.000\text{ MHz}$ ($84,000,000\text{ Hz}$).

#### Your Objective

1. Calculate the minimum physical sampling time $t_{\text{sample\_min}}$ (in microseconds) required for 12-bit accuracy ($1/2\text{ LSB}$ bound).
2. Determine the minimum valid clock cycle setting for `ADC1_SMPR2.SMP0` ($3, 15, 28, 56, 84, 112, 144, \text{or } 480\text{ cycles}$) that satisfies $t_{\text{sample\_min}}$.
3. Calculate the total conversion time $t_{\text{conv}}$ (sampling cycles $+ 12\text{ SAR cycles}$) in microseconds.
4. Calculate the exact `TIM2_PSC` and `TIM2_ARR` register values to synthesize a $100.0\text{-Hz}$ `TRGO` hardware trigger signal.
5. An incoming conversion reads $D_{\text{ADC}} = \mathbf{2,785_{10}}$ (`0xAE1`) from `ADC1_DR`. Calculate the corresponding physical analog sensor voltage $V_{\text{analog}}$.
6. Write the complete, production-ready ARM Assembly routine `ADC1_TIM2_Init` that configures `PA0`, `TIM2` (`TRGO` master mode), `ADC1` (`EXTSEL`, `EXTEN`, `SMPR2`), and handles the `EOC` interrupt in `ADC1_IRQHandler`.
7. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Minimum Sampling Time $t_{\text{sample\_min}}$

Total charging resistance $R_{\text{total}}$:

$$R_{\text{total}} = R_{\text{src}} + R_{\text{ADC}} = 4,000\ \Omega + 600\ \Omega = \mathbf{4,600 \ \Omega}$$

Apply the Master Sampling Time Equation ($C_{\text{sample}} = 12\text{ pF}$):

$$t_{\text{sample\_min}} \ge 9.011 \times R_{\text{total}} \times C_{\text{sample}}$$

$$t_{\text{sample\_min}} \ge 9.011 \times 4,600 \ \Omega \times (12 \times 10^{-12}\text{ F})$$

$$t_{\text{sample\_min}} \ge 9.011 \times (5.52 \times 10^{-8}\text{ s}) = 4.974 \times 10^{-7}\text{ s} = \mathbf{0.4974 \text{ Microseconds}} \quad (497.4\text{ ns})$$

##### Convert $t_{\text{sample\_min}}$ to ADC Clock Cycles at $f_{\text{ADC}} = 14.0\text{ MHz}$ ($T_{\text{ADC}} = 71.4285\text{ ns}$):

$$\text{Required Cycles} = \frac{497.4\text{ ns}}{71.4285\text{ ns/cycle}} = \mathbf{6.96 \text{ ADC Clock Cycles}}$$

##### Select Sampling Cycle Setting (`ADC1_SMPR2.SMP0`):
* Options: $3\text{ cycles } (214\text{ ns})$, $15\text{ cycles } (1,071\text{ ns})$, $28\text{ cycles } (2,000\text{ ns}) \dots$
* Selecting **$15\text{ Cycles}$ (`SMP0 = 3'b001`)** provides $t_{\text{sample}} = 15 \times 71.4285\text{ ns} = \mathbf{1.0714 \ \mu\text{s}} > 0.4974\ \mu\text{s}$ ($\mathbf{\text{TIMING CLOSURE PASSED!}}$).

---

#### Step 2: Calculate Total ADC Conversion Time ($t_{\text{conv}}$)

Total conversion cycles $N_{\text{conv\_cycles}}$:

$$N_{\text{conv\_cycles}} = N_{\text{sample\_cycles}} + 12 \text{ SAR Resolution Cycles} = 15 + 12 = \mathbf{27 \text{ ADC Cycles}}$$

Calculate total physical conversion time $t_{\text{conv}}$:

$$t_{\text{conv}} = 27 \text{ cycles} \times \frac{1}{14,000,000\text{ Hz}} = \frac{27}{14,000,000} \approx 1.92857 \times 10^{-6}\text{ s} = \mathbf{1.9286 \text{ Microseconds}}$$

Each ADC conversion takes **$1.9286\text{ microseconds}$** from trigger pulse to data ready!

---

#### Step 3: Calculate `TIM2` Prescaler & Auto-Reload for $100.0\text{-Hz}$ `TRGO` Trigger

Target $f_{\text{TRGO}} = 100.0\text{ Hz}$ ($T = 10.0\text{ ms}$). Input clock $f_{\text{timer\_clk}} = 84,000,000\text{ Hz}$.

##### 1. Select Prescaler `TIM2_PSC` to yield $10.000\text{ kHz}$ counter clock ($10,000\text{ Hz}$):

$$\text{PSC} + 1 = \frac{84,000,000\text{ Hz}}{10,000\text{ Hz}} = 8,400 \implies \mathbf{\text{TIM2\_PSC} = 8,399} = \mathbf{\text{0x20CF}}$$

##### 2. Select Auto-Reload `TIM2_ARR` for $100.0\text{-Hz}$ overflow rate ($10,000\text{ Hz} / 100\text{ Hz} = 100\text{ steps}$):

$$\text{ARR} + 1 = \frac{10,000\text{ Hz}}{100\text{ Hz}} = 100 \implies \mathbf{\text{TIM2\_ARR} = 99} = \mathbf{\text{0x0063}}$$

`TIM2` will emit a `TRGO` pulse every $10.000\text{ milliseconds}$ ($100.0\text{ Hz}$) with $0.000\text{ ns}$ jitter!

---

#### Step 4: Calculate Physical Sensor Voltage from $D_{\text{ADC}} = 2,785_{10}$

Given $D_{\text{ADC}} = 2,785_{10}$ (`0xAE1`), $V_{\text{REF}+} = 3.300\text{ V}$:

$$V_{\text{analog}} = \frac{D_{\text{ADC}}}{4,095} \times V_{\text{REF}+} = \frac{2,785}{4,095} \times 3.300\text{ V}$$

$$\frac{2,785}{4,095} \approx 0.68009768$$

$$V_{\text{analog}} = 0.68009768 \times 3.300\text{ V} = \mathbf{2.2443 \text{ Volts}}$$

Digital code `2,785` represents a physical sensor voltage of **$2.2443\text{ Volts}$**!

---

#### Step 5: Complete Production Assembly Driver Initialization & ISR

Here is the complete, production-ready ARM Assembly code for configuring `PA0`, `TIM2` (`TRGO`), `ADC1`, and `ADC1_IRQHandler`:

```assembly
/* PRODUCTION BARE-METAL ADC1 & TIM2 TRGO TRIGGER INITIALIZATION */
.syntax unified
.cpu cortex-m4
.thumb

/* MMIO Register Base Addresses */
.equ RCC_APB1ENR,     0x40023840        /* APB1 Clock Enable (TIM2) */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Clock Enable (ADC1, GPIOA) */
.equ RCC_AHB1ENR,     0x40023830        /* AHB1 Clock Enable (GPIOA) */

.equ GPIOA_BASE,      0x40020000
.equ GPIOA_MODER,     0x40020000        /* GPIOA Mode Register */

.equ TIM2_BASE,       0x40000000
.equ TIM2_CR1,        0x40000000        /* TIM2 Control Register 1 */
.equ TIM2_CR2,        0x40000004        /* TIM2 Control Register 2 (MMS) */
.equ TIM2_PSC,        0x40000028        /* TIM2 Prescaler Register */
.equ TIM2_ARR,        0x4000002C        /* TIM2 Auto-Reload Register */
.equ TIM2_EGR,        0x40000014        /* TIM2 Event Generation Reg */

.equ ADC1_BASE,       0x40012000
.equ ADC1_SR,         0x40012000        /* Status Register (EOC Bit 1) */
.equ ADC1_CR1,        0x40012004        /* Control Register 1 (EOCIE) */
.equ ADC1_CR2,        0x40012008        /* Control Register 2 (EXTEN, EXTSEL, ADON) */
.equ ADC1_SMPR2,      0x4001200C        /* Sample Time Register 2 (SMP0) */
.equ ADC1_SQR3,       0x40012034        /* Regular Sequence Register 3 (SQ1) */
.equ ADC1_DR,         0x4001204C        /* Data Register */

.equ NVIC_ISER0,      0xE000E100        /* NVIC Interrupt Set-Enable Reg 0 */

.global ADC1_TIM2_Init
.type ADC1_TIM2_Init, %function

.section .text
.thumb_func
ADC1_TIM2_Init:
    push    {r4, lr}

    /* Step 1: Enable Clocks for GPIOA (AHB1), TIM2 (APB1), and ADC1 (APB2) */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* GPIOAEN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* TIM2EN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 8)           /* ADC1EN = 1 */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* Step 2: Configure PA0 for Analog Mode (MODER0 = 2'b11) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    orr     r1, r1, #(0x3 << 0)          /* Set MODER0 = 2'b11 (Analog Mode) */
    str     r1, [r0]

    /* Step 3: Configure TIM2 for TRGO Output on Update Event (MMS = 3'b010) */
    ldr     r0, =TIM2_PSC
    ldr     r1, =8399                   /* PSC = 8,399 -> 10 kHz count clock */
    str     r1, [r0]

    ldr     r0, =TIM2_ARR
    movs    r1, #99                     /* ARR = 99 -> 100 Hz overflow rate */
    str     r1, [r0]

    ldr     r0, =TIM2_CR2
    ldr     r1, [r0]
    bic     r1, r1, #(0x7 << 4)         /* Clear MMS bits [6:4] */
    orr     r1, r1, #(0x2 << 4)         /* MMS = 3'b010 (TRGO on Update Event) */
    str     r1, [r0]

    ldr     r0, =TIM2_EGR
    movs    r1, #1                      /* Force shadow register reload (UG = 1) */
    str     r1, [r0]

    /* Step 4: Configure ADC1 Sample Time (15 Cycles -> SMP0 = 3'b001) */
    ldr     r0, =ADC1_SMPR2
    ldr     r1, [r0]
    bic     r1, r1, #(0x7 << 0)         /* Clear SMP0 bits [2:0] */
    orr     r1, r1, #(0x1 << 0)         /* SMP0 = 3'b001 (15 Cycles) */
    str     r1, [r0]

    /* Set Channel 0 (PA0) as 1st Conversion in Regular Sequence (SQR3) */
    ldr     r0, =ADC1_SQR3
    ldr     r1, [r0]
    bic     r1, r1, #(0x1F << 0)        /* Clear SQ1 bits [4:0] */
    str     r1, [r0]                    /* SQ1 = 0 (Channel 0) */

    /* Configure External Trigger: EXTEN = 01 (Rising Edge), EXTSEL = 0110 (TIM2_TRGO) */
    ldr     r0, =ADC1_CR2
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 28)        /* Clear EXTEN bits [29:28] */
    orr     r1, r1, #(0x1 << 28)        /* EXTEN = 2'b01 (Rising Edge Trigger) */
    bic     r1, r1, #(0xF << 24)        /* Clear EXTSEL bits [27:24] */
    orr     r1, r1, #(0x6 << 24)        /* EXTSEL = 4'b0110 (TIM2_TRGO) */
    orr     r1, r1, #(1 << 0)           /* ADON = 1 (Power ON ADC1) */
    str     r1, [r0]

    /* Step 5: Enable EOC Interrupt in ADC1_CR1 and NVIC */
    ldr     r0, =ADC1_CR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 5)           /* Set EOCIE = 1 (End of Conversion IRQ Enable) */
    str     r1, [r0]

    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 18)              /* Enable ADC_IRQn (IRQ 18) in NVIC */
    str     r1, [r0]

    /* Step 6: Start TIM2 Counter (CEN = 1) */
    ldr     r0, =TIM2_CR1
    movs    r1, #1
    str     r1, [r0]                    /* TIM2 starts emitting 100Hz TRGO pulses! */

    dsb
    pop     {r4, pc}
.size ADC1_TIM2_Init, .-ADC1_TIM2_Init


/* PRODUCTION ADC INTERRUPT SERVICE ROUTINE (ADC1_IRQHandler) */
.global ADC1_IRQHandler
.type ADC1_IRQHandler, %function
.thumb_func
ADC1_IRQHandler:
    push    {r4, lr}

    /* Step 1: Read Converted 12-Bit Value from ADC1_DR (AUTO-CLEARS EOC FLAG!) */
    ldr     r0, =ADC1_DR
    ldr     r1, [r0]                    /* r1 <= 12-bit D_ADC Result (Reads & Clears EOC) */

    /* Step 2: Store Fresh Voltage Sample in RAM */
    ldr     r2, =0x20000000             /* SRAM Sample Location */
    str     r1, [r2]

    /* Memory barrier to complete read before exception exit */
    dsb
    pop     {r4, pc}
.size ADC1_IRQHandler, .-ADC1_IRQHandler
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and hardware trigger results against silicon specifications:

1. **Sampling Time Closure Check**:
   * Minimum required $t_{\text{sample\_min}} = 0.4974\ \mu\text{s}$.
   * Selected 15-cycle window $= 15 \times \frac{1}{14\text{ MHz}} = 1.0714\ \mu\text{s}$.
   * $1.0714\ \mu\text{s} > 0.4974\ \mu\text{s} \implies \mathbf{\text{TIMING CLOSURE PASSED!}}$ ($C_{\text{sample}}$ charges to $> 99.988\%$ accuracy).

2. **`TRGO` Hardware Trigger Rate Verification**:
   * $\text{PSC} = 8,399 \implies f_{\text{cnt\_clk}} = 84\text{ MHz} / 8,400 = 10\text{ kHz}$.
   * $\text{ARR} = 99 \implies f_{\text{TRGO}} = 10\text{ kHz} / 100 = 100.0\text{ Hz}$.
   * Hardware trigger interval $= \frac{1}{100\text{ Hz}} = \mathbf{10.000 \text{ ms}}$ with $0.000\text{ ns}$ jitter!

3. **Analog Voltage Reconstruction Check**:
   * $D_{\text{ADC}} = 2,785$.
   * $V_{\text{analog}} = \frac{2,785}{4,095} \times 3.300\text{ V} = 2.2443\text{ V}$.
   * Reading `0xAE1` accurately reconstructs $2.2443\text{ Volts}$.

4. **`EOC` Read-to-Clear Check**:
   * `ADC1_IRQHandler` executed `ldr r1, [ADC1_DR]`.
   * Reading `ADC1_DR` automatically clears `EOC = 0` in hardware without requiring a separate write to `ADC_SR`, preventing false second ISR entries!

All $RC$ sample-and-hold charging equations, 12-bit quantization formulas, timer `TRGO` trigger rates, read-to-clear `EOC` flag mechanics, and assembly driver configurations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Analog-to-Digital Converter (ADC)**: A 12-bit Successive Approximation Register (SAR) mixed-signal hardware peripheral that charges a sample-and-hold capacitor ($C_{\text{sample}}$) and quantizes an analog input voltage $V_{\text{analog}}$ into a digital binary integer $D_{\text{ADC}} = \lfloor \frac{V_{\text{analog}}}{V_{\text{REF}+}} \cdot 4095 \rceil$.
* **Timer TRGO Trigger**: A hardware trigger interconnection line that connects a General-Purpose Timer's master output (`TRGO`) directly to an ADC's external start trigger (`EXTSEL`), starting conversion on an exact clock edge with zero software sampling jitter ($\Delta t = 0$).
* **End-of-Conversion (`EOC`) Flag**: A hardware status flag (`ADC_SR.EOC`) set to $1$ when a 12-bit conversion finishes and data is latched into `ADC_DR`, automatically cleared to $0$ when software or a DMA engine reads `ADC_DR`.