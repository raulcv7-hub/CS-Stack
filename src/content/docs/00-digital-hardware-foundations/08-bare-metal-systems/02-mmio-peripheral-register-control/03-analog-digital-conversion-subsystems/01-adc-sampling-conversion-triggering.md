---
title: "Analog-to-Digital Conversion Mechanics, Hardware Timer TRGO Triggers, and Sample-and-Hold Timing Closure"
---

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


### Step 1: The Water Cup Dip (The Sample-and-Hold Stage)

The engineer cannot weigh the entire flowing river at once! They must take a small sample.

To capture a sample, the engineer dips a tiny measuring cup (**The Internal Sample-and-Hold Capacitor $C_{\text{sample}} \approx 12\text{ pF}$**) into the river through a narrow inlet pipe (**Input Source Resistance $R_{\text{src}} + R_{\text{ADC}}$**):

* **The Charging Delay**: Because the inlet pipe is narrow, water takes a few microseconds to flow through the pipe and fill the cup to the exact same height as the river!
* **The Premature Pull-Out Error**: If the engineer dips the cup into the water and pulls it out after only 1 nanosecond, the cup is only half-full! 

  The engineer weighs the half-full cup and records a false, low water height!
* **The Solution ($t_{\text{sample}}$)**: The engineer **MUST leave the cup under water long enough ($t_{\text{sample}}$)** for the cup's water level to equalize $100\%$ with the river height before sealing the valve!


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


## Deep Mechanics of SAR ADCs, Sample-and-Hold Charging Math, and TRGO Triggers

Now that we possess an intuitive mental model of water cup sampling, balance scales, and metronome strobe triggers, let us examine the formal, rigorous engineering mechanics of **Successive Approximation Register (SAR) ADCs**, **Sample-and-Hold $RC$ Charging Math**, and **Timer `TRGO` Hardware Triggering**.


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


## Real-World Silicon Engineering: Source Impedance Droop, Self-Calibration, and Analog Noise

In commercial hardware engineering, achieving full 12-bit accuracy requires navigating real-world analog physical hazards.


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


#### Step 2: Calculate Total ADC Conversion Time ($t_{\text{conv}}$)

Total conversion cycles $N_{\text{conv\_cycles}}$:

$$N_{\text{conv\_cycles}} = N_{\text{sample\_cycles}} + 12 \text{ SAR Resolution Cycles} = 15 + 12 = \mathbf{27 \text{ ADC Cycles}}$$

Calculate total physical conversion time $t_{\text{conv}}$:

$$t_{\text{conv}} = 27 \text{ cycles} \times \frac{1}{14,000,000\text{ Hz}} = \frac{27}{14,000,000} \approx 1.92857 \times 10^{-6}\text{ s} = \mathbf{1.9286 \text{ Microseconds}}$$

Each ADC conversion takes **$1.9286\text{ microseconds}$** from trigger pulse to data ready!


#### Step 4: Calculate Physical Sensor Voltage from $D_{\text{ADC}} = 2,785_{10}$

Given $D_{\text{ADC}} = 2,785_{10}$ (`0xAE1`), $V_{\text{REF}+} = 3.300\text{ V}$:

$$V_{\text{analog}} = \frac{D_{\text{ADC}}}{4,095} \times V_{\text{REF}+} = \frac{2,785}{4,095} \times 3.300\text{ V}$$

$$\frac{2,785}{4,095} \approx 0.68009768$$

$$V_{\text{analog}} = 0.68009768 \times 3.300\text{ V} = \mathbf{2.2443 \text{ Volts}}$$

Digital code `2,785` represents a physical sensor voltage of **$2.2443\text{ Volts}$**!


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

