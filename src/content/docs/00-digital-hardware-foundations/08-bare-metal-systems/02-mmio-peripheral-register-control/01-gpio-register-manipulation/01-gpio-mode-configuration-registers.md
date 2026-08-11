---
title: "GPIO Register Control, Alternate Function Multiplexing, and Slew Rate Timing Closure"
---

# GPIO Register Control, Alternate Function Multiplexing, and Slew Rate Timing Closure

## The Package Pin Shortage and Signal Edge Degradation

In modern embedded systems engineering, an integrated circuit silicon die contains millions of transistors operating complex internal peripherals: high-speed Universal Asynchronous Receiver-Transmitter (UART) serial ports, Serial Peripheral Interface (SPI) buses, Inter-Integrated Circuit ($I^2C$) controllers, hardware timers, and Analog-to-Digital Converters (ADCs). 

However, the physical microchip package surrounding the silicon die has a strictly limited number of external metal pins (bumps or pads) extending out to the circuit board.

To solve this physical pin shortage, silicon architects design package pins as multi-purpose, reconfigurable physical interfaces. A single physical metal pin—such as pin `PA9` on Port A—is shared by multiple internal hardware modules:
* It can act as a simple digital Input reading a push-button.
* It can act as a general-purpose digital Output driving an LED.
* It can act as an Analog Input line connected to an internal ADC sampler.
* It can act as a high-speed hardware UART Transmit line (`USART1_TX`).

```text
THE MULTI-PURPOSE PACKAGE PIN MULTIPLEXING PROBLEM

 Internal Peripherals                            Physical Package Pad
 ┌───────────────────────────┐                   ┌───────────────────────────┐
 │ GPIO Output Driver        ├─[01]─┐            │ Physical Pin PA9          │
 ├───────────────────────────┤      │            │ (Single External Metal    │
 │ USART1_TX Hardware Engine ├─[10]─┼─►[ MUX ]──►│  Package Lead on PCB)     │
 ├───────────────────────────┤      │            │                           │
 │ ADC Analog Input Channel  ├─[11]─┘            └───────────────────────────┘
 └───────────────────────────┘
 (Which internal peripheral engine is allowed to drive physical Pin PA9?)
```

If a bare-metal assembly program attempts to drive or read a physical package pin without configuring its **Direction Mode Register (`MODER`)**, **Pull-Up/Pull-Down Resistors (`PUPDR`)**, **Output Type (`OTYPER`)**, **Output Slew Rate (`OSPEEDR`)**, and **Alternate Function Mapping Registers (`AFRL`/`AFRH`)**, three severe hardware failure modes occur:

1. **Internal Pin Multiplexing Collision**: The physical pin remains connected to its default hardware state. Writing data to the GPIO output register has zero effect because the physical metal pad is disconnected from the output driver, or worse, two internal drivers attempt to drive the wire simultaneously, causing short-circuit currents inside the silicon!
2. **Signal Edge Degradation and Timing Closure Failure**: When an alternate function (such as a $50\text{-MHz}$ SPI clock) is driven through a GPIO pin whose Output Slew Rate (`OSPEEDR`) is left at its low-power default setting ($2\text{ MHz}$ bandwidth), the output transistor cannot charge and discharge the PCB trace capacitance fast enough. 

The square-wave clock degrades into a sloped, rounded analog curve. The voltage fails to reach digital logic High ($V_{\text{IH}}$) before the clock period ends, causing data corruption across the serial bus!

```text
SLEW RATE TIMING FAILURE ON HIGH-SPEED CLOCK LINES

 50 MHz Target Clock Signal (5.0 ns Half-Period)
 ┌───────────────┐               ┌───────────────┐
 │ Digital '1'   │               │ Digital '1'   │
 └───────────────┴───────────────┴───────────────┘

 Low Slew Rate Output Waveform (Slow Transistor Charging Time)
     /───────────────\               /───────────────\
    /                 \             /                 \
  ─*───────────────────*───────────*───────────────────*── (Logic Threshold V_IH)
 (Voltage fails to reach V_IH before clock edge ends! DATA CORRUPTED!)
```

3. **Floating Input Current Leakage**: If an input pin is left floating in mid-air without an internal pull-up or pull-down resistor, static environmental electromagnetic fields cause the pin voltage to float at intermediate analog levels ($\sim 1.65\text{ Volts}$). 

This intermediate voltage turns both the PMOS and NMOS transistors inside the digital input buffer ON simultaneously, creating a direct short-circuit path between supply voltage ($V_{DD}$) and Ground ($GND$). The chip consumes massive DC leakage current, drains battery power, and generates localized heat!

A physical package pin cannot guess how it should behave!

To safely drive digital signals, route internal peripherals to package pins, and achieve high-frequency timing closure, bare-metal software must master **GPIO Register Control**, **Alternate Function Multiplexing**, and **Output Slew Rate Tuning**.


### Step 1: The Direction Control Lever (`MODER` — Input, Output, Alternate Function, Analog)

The manager sets the fundamental operational role of the door:
* **One-Way Entrance (`MODER = 00` — Input Mode)**: People can enter from the street into the building. The internal push handles are disabled.
* **One-Way Exit (`MODER = 01` — General Purpose Output Mode)**: People inside the building can push the door open to exit onto the street.
* **Express Train Tunnel (`MODER = 10` — Alternate Function Mode)**: The door is un-hooked from the general hallway and connected directly to a high-speed express train track (**USART1_TX Peripheral Engine**)!
* **Sealed Glass Window (`MODER = 11` — Analog Mode)**: The door is locked shut and both internal push handles and digital sensors are disconnected, allowing light (**Analog Voltages**) to pass through to a solar sensor (**The ADC Sampler**) without digital interference.


### Step 3: The Door Drive Mechanism (`OTYPER` — Push-Pull vs. Open-Drain)

How do internal workers open the door during exit mode?
* **Push-Pull Mechanism (`OTYPER = 0`)**: The door is equipped with two active motors: Motor A pushes the door OPEN (drives pin High to $3.3\text{V}$), and Motor B pulls the door CLOSED (drives pin Low to $0.0\text{V}$).
* **Open-Drain Mechanism (`OTYPER = 1`)**: Motor A is removed! The door has Motor B (which can pull the door CLOSED to $0.0\text{V}$), but relies on an external spring on the street to pull the door OPEN.
  
  *Why use Open-Drain?* If two people on the street are connected to the same door handle ($I^2C$ Shared Bus), two Push-Pull motors fighting each other will break the door! With Open-Drain, anyone can pull the line Low safely without electrical short circuits!


## Deep Mechanics of MODER, PUPDR, OTYPER, OSPEEDR, and AFR Registers

Now that we possess an intuitive mental model of multi-purpose building doors and hydraulic speed pistons, let us examine the formal, rigorous engineering mechanics of **GPIO Configuration Registers**.

In modern 32-bit microcontrollers, each GPIO port (e.g., Port A, Port B, Port C) controls 16 individual physical pins (Pins $0 \dots 15$). 

Every GPIO port is managed by a bank of Memory-Mapped I/O (MMIO) registers located at a dedicated physical memory base address (such as `GPIOA_BASE = 0x4002_0000`):

```text
GPIO PORT A MEMORY-MAPPED REGISTER MAP (BASE: 0x4002_0000)

 Register Name │ Offset │ Size   │ Primary Configuration Function
───────────────┼────────┼────────┼───────────────────────────────────────────────────────────
 GPIOA_MODER   │ 0x00   │ 32 Bits│ Pin Mode (2 Bits per Pin: Input/Output/AF/Analog)
 GPIOA_OTYPER  │ 0x04   │ 32 Bits│ Output Driver Type (1 Bit per Pin: Push-Pull/Open-Drain)
 GPIOA_OSPEEDR │ 0x08   │ 32 Bits│ Output Slew Rate / Speed (2 Bits per Pin: Low to Very High)
 GPIOA_PUPDR   │ 0x0C   │ 32 Bits│ Pull-Up / Pull-Down Resistors (2 Bits per Pin)
 GPIOA_IDR     │ 0x10   │ 32 Bits│ Input Data Register (Read physical pin voltage state)
 GPIOA_ODR     │ 0x14   │ 32 Bits│ Output Data Register (Write physical pin voltage state)
 GPIOA_BSRR    │ 0x18   │ 32 Bits│ Bit Set/Reset Register (Atomic 1-cycle pin toggling)
 GPIOA_AFRL    │ 0x20   │ 32 Bits│ Alternate Function Low Register (Pins 0 to 7: 4b/pin)
 GPIOA_AFRH    │ 0x24   │ 32 Bits│ Alternate Function High Register (Pins 8 to 15: 4b/pin)
```


### 2. Pull-Up / Pull-Down Resistors (`GPIOA_PUPDR`)

The **GPIO Port Pull-Up/Pull-Down Register (`PUPDR`)** is a 32-bit register at offset `0x0C` containing 2-bit fields per pin:

```text
PUPDR FIELD DECODING

 Value  │ Mnemonic  │ Internal Transistor Action
────────┼───────────┼───────────────────────────────────────────────────────────
 2'b00  │ No Pull   │ Both internal pull transistors turned OFF (Floating).
 2'b01  │ Pull-Up   │ Activates weak internal PMOS resistor (~40 kΩ to V_DD).
 2'b10  │ Pull-Down │ Activates weak internal NMOS resistor (~40 kΩ to GND).
 2'b11  │ Reserved  │ Reserved.
```

```text
INTERNAL WEAK PULL-UP AND PULL-DOWN RESISTOR NETWORK

                  V_DD (3.3V)
                     │
                    [ ] Weak PMOS Pull-Up Transistor (~40 kΩ)
                     │  (Enabled when PUPDR = 2'b01)
                     ├────────► Physical Package Pad (Pin PA9)
                     │
                    [ ] Weak NMOS Pull-Down Transistor (~40 kΩ)
                     │  (Enabled when PUPDR = 2'b10)
                     ▼
                  GND (0.0V)
```

#### Hardware Function of Weak Pull Resistors:
When a pin is configured as a digital input connected to an open push-button:
* If the button is not pressed, the circuit is open. Without a pull resistor, the input pin floats at random noise voltages.
* Setting `PUPDR = 2'b01` (Pull-Up) applies a weak $40\text{-k}\Omega$ pull-up to $V_{DD}$, forcing `GPIOA_IDR` to read a solid digital $1$ when idle.
* When the button is pressed (connecting the pin to $GND$), current flows through the weak $40\text{-k}\Omega$ resistor to Ground, pulling the pin voltage cleanly to $0.0\text{V}$ (reading digital $0$) without causing a short circuit!


### 4. Output Slew Rate Control (`GPIOA_OSPEEDR`)

The **GPIO Port Output Speed Register (`OSPEEDR`)** is a 32-bit register at offset `0x08` containing 2-bit fields per pin:

```text
OSPEEDR FIELD DECODING AND MAXIMUM FREQUENCY RATINGS

 Value  │ Speed Mnemonic   │ Max Frequency │ Transistor Rise Time (t_rise)
────────┼──────────────────┼───────────────┼───────────────────────────────
 2'b00  │ Low Speed        │  2 MHz        │ ~50.0 Nanoseconds
 2'b01  │ Medium Speed     │ 25 MHz        │ ~10.0 Nanoseconds
 2'b10  │ High Speed       │ 50 MHz        │  ~5.0 Nanoseconds
 2'b11  │ Very High Speed  │100 MHz        │  ~2.0 Nanoseconds
```

#### The Physics of Transistor Channel Width and Slew Rate ($\frac{dV}{dt}$)

When a GPIO output pin transitions from $0 \to 1$, the output PMOS transistor must physically inject electrical charge into the parasitic capacitance ($C_{\text{load}}$) of the copper PCB trace and receiving input pins:

```text
PHYSICAL RC CHARGING OF PCB TRACE CAPACITANCE

 PMOS Output Transistor (Channel Resistance R_driver)
 V_DD (3.3V) ───[ Resistor R_driver ]───┬───► Physical Pin / PCB Trace
                                        │
                                      [===] Parasitic Capacitance C_load (~30 pF)
                                        │
                                       GND
```

The voltage rise time ($t_{\text{rise}}$) required for the pin to charge from $10\%$ to $90\%$ of $V_{DD}$ is governed by the physical $RC$ time constant:

$$t_{\text{rise}} \approx 2.2 \cdot R_{\text{driver}} \cdot C_{\text{load}}$$

The **Slew Rate ($\text{SR}$)** is defined as the maximum rate of voltage change over time:

$$\mathbf{\text{Slew Rate (SR)} = \frac{\Delta V}{\Delta t} = \frac{V_{\text{OH}} - V_{\text{OL}}}{t_{\text{rise}}}}$$

Where:
* $\Delta V$ is the voltage swing ($V_{\text{OH}} - V_{\text{OL}} \approx 3.3\text{V} - 0.0\text{V} = 3.3\text{V}$).
* $t_{\text{rise}}$ is the 10%-to-90% rise time in nanoseconds.
* $R_{\text{driver}}$ is the internal channel resistance of the output transistor.
* $C_{\text{load}}$ is the total external capacitive load on the PCB trace (typically $10 \text{ to } 50\text{ pF}$).

#### How `OSPEEDR` Alters Internal Transistor Channel Width
Inside the silicon die, each GPIO output stage consists of multiple parallel transistor channels. 

When you increase `OSPEEDR` from Low Speed (`00`) to Very High Speed (`11`):
1. The hardware switches additional parallel PMOS/NMOS transistor channels ON in the output driver stage.
2. The effective internal channel resistance ($R_{\text{driver}}$) drops from $150\ \Omega$ down to $15\ \Omega$!
3. Because $R_{\text{driver}}$ is smaller, charge flows into $C_{\text{load}}$ ten times faster, cutting $t_{\text{rise}}$ from $50\text{ ns}$ down to $2\text{ ns}$!

```text
SLEW RATE COMPARISON WAVEFORMS ACROSS OSPEEDR SETTINGS

 Voltage V_pin
  3.3V ┼───────────────── Very High Speed (OSPEEDR=11, t_rise = 2 ns)
       │                /
       │               /  Medium Speed (OSPEEDR=01, t_rise = 10 ns)
  1.65V┼──────────────/─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (Logic Threshold V_IH)
       │             /    Low Speed (OSPEEDR=00, t_rise = 50 ns)
  0.0V ┴────────────/───────────────────────────────► Time t
       ◄── 2 ns ──►
       ◄────── 10 ns ──────►
       ◄────────────────── 50 ns ──────────────────►
```


## Real-World Silicon Failures, Signal Ringing, and Glitchy Bus Transitions

In commercial digital design, failing to configure GPIO slew rates, drive types, and alternate functions correctly causes severe physical signal integrity failures.


### 2. Alternate Function Configuration Glitches

What happens if software switches a pin's mode register (`MODER`) to Alternate Function mode *before* setting the correct multiplexer code in `AFRL`/`AFRH`?

1. Default `AFRH` value for Pin 9 is `AF0` (`0x0` — System Debug line).
2. Software sets `GPIOA_MODER[19:18] = 2'b10` (Alternate Function).
3. The 16-to-1 MUX instantly connects physical pad `PA9` to `AF0` (System Debug), driving an unexpected low pulse onto the wire!
4. One instruction later, software writes `AF7` into `GPIOA_AFRH`.
5. **The Glitch**: A $312\text{-picosecond}$ false voltage glitch was transmitted onto the serial line, causing the receiving UART to interpret the glitch as a false Start Bit and corrupting the serial frame!

#### The Hardware Fix:
Always program the Alternate Function Select Register (`AFRL`/`AFRH`) **FIRST**, and set the Mode Register (`MODER = 2'b10`) **SECOND**!

```assembly
/* SAFE ALTERNATE FUNCTION CONFIGURATION SEQUENCE */
    /* 1. Set MUX code AF7 in AFRH FIRST while pin is still in Input Mode */
    ldr     r0, =GPIOA_AFRH
    ldr     r1, [r0]
    bic     r1, r1, #(0xF << 4)         /* Clear Pin 9 AF bits [7:4] */
    orr     r1, r1, #(0x7 << 4)         /* Insert AF7 (USART1_TX) */
    str     r1, [r0]

    /* 2. Enable Alternate Function Mode in MODER SECOND */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 18)        /* Clear Pin 9 MODER bits [19:18] */
    orr     r1, r1, #(0x2 << 18)        /* Set MODER = 2'b10 (Alternate Function) */
    str     r1, [r0]
    /* ZERO GLITCHES TRANSMITTED! */
```


### Scenario and Parameters

You are a senior bare-metal systems architect configuring physical package pins `PA9` and `PA10` for an enterprise $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates at supply voltage $V_{DD} = 3.3\text{ Volts}$.

```text
3.2 GZ BARE-METAL SERVER CONTROLLER GPIO CONFIGURATION

 Physical Pins under Configuration:
 ┌─────────────────────────────────────────────────────────────┐
 │ Pin PA9  : USART1_TX (Transmitter Output) @ 10 Megabaud     │
 │ Pin PA10 : USART1_RX (Receiver Input)   with Weak Pull-Up │
 └─────────────────────────────────────────────────────────────┘
  MMIO Base Address : GPIOA_BASE = 0x4002_0000
  PCB Trace Load    : C_load = 30.0 pF (Capacitance)
```

#### Peripheral Hardware Functional Requirements:
1. **Pin `PA9` (`USART1_TX`)**:
   * Must be configured for **Alternate Function Mode** connected to `USART1_TX` ($AF7$).
   * Must use **Push-Pull Output Drive** (`OTYPER = 0`).
   * Must achieve a 10%-to-90% rise time $t_{\text{rise}} \le \mathbf{4.0 \text{ nanoseconds}}$ over PCB trace capacitance $C_{\text{load}} = 30.0\text{ pF}$ to support $10\text{-Megabaud}$ serial rates.
2. **Pin `PA10` (`USART1_RX`)**:
   * Must be configured for **Alternate Function Mode** connected to `USART1_RX` ($AF7$).
   * Must enable an internal **Weak Pull-Up Resistor** (`PUPDR = 01`) to maintain a stable digital High state ($3.3\text{V}$) when the serial line is idle or disconnected.

#### Available Slew Rate Driver Resistance Options (`OSPEEDR`):
* `OSPEEDR = 2'b00` (Low Speed): $R_{\text{driver}} = 150.0\ \Omega$
* `OSPEEDR = 2'b01` (Medium Speed): $R_{\text{driver}} = 60.0\ \Omega$
* `OSPEEDR = 2'b10` (High Speed): $R_{\text{driver}} = 30.0\ \Omega$
* `OSPEEDR = 2'b11` (Very High Speed): $R_{\text{driver}} = 15.0\ \Omega$

#### Your Objective

1. Calculate the 10%-to-90% voltage rise time $t_{\text{rise}}$ for all four `OSPEEDR` settings driving $C_{\text{load}} = 30.0\text{ pF}$ using $t_{\text{rise}} \approx 2.2 \cdot R_{\text{driver}} \cdot C_{\text{load}}$.
2. Determine the minimum `OSPEEDR` setting for `PA9` that satisfies $t_{\text{rise}} \le 4.0\text{ ns}$ while minimizing high-frequency EMI.
3. Calculate the exact 32-bit hexadecimal values to be written into `GPIOA_MODER`, `GPIOA_OTYPER`, `GPIOA_OSPEEDR`, `GPIOA_PUPDR`, and `GPIOA_AFRH` to configure both `PA9` and `PA10`.
4. Write the complete, production-ready ARM Assembly configuration routine that safely programs these registers without disturbing neighboring pins (Pins $0 \dots 8$ and $11 \dots 15$).
5. Verify mathematical, physical, and logical correctness.


#### Step 2: Determine Bitfield Values for GPIOA MMIO Registers

Let me calculate the exact bit patterns for `PA9` and `PA10`:

##### 1. Mode Register (`GPIOA_MODER` — Offset `0x00`):
Both `PA9` and `PA10` require **Alternate Function Mode (`2'b10`)**.
* `PA9` Field (Bits $[19:18]$) $= 10_2$
* `PA10` Field (Bits $[21:20]$) $= 10_2$
* Combined Bitmask for Bits $[21:18] = 1010_2 = \mathbf{\text{0xA}}$ (positioned at Shift 18: `0xA << 18` $= \mathbf{\text{0x0028\_0000}}$).

##### 2. Output Type Register (`GPIOA_OTYPER` — Offset `0x04`):
`PA9` requires **Push-Pull Output (`1'b0`)**.
* `PA9` Bit (Bit $9$) $= 0$.

##### 3. Output Speed Register (`GPIOA_OSPEEDR` — Offset `0x08`):
`PA9` requires **Medium Speed (`2'b01`)**.
* `PA9` Field (Bits $[19:18]$) $= 01_2$ (positioned at Shift 18: `0x1 << 18` $= \mathbf{\text{0x0004\_0000}}$).

##### 4. Pull-Up / Pull-Down Register (`GPIOA_PUPDR` — Offset `0x0C`):
`PA9` requires **No Pull (`2'b00`)**; `PA10` requires **Weak Pull-Up (`2'b01`)**.
* `PA9` Field (Bits $[19:18]$) $= 00_2$
* `PA10` Field (Bits $[21:20]$) $= 01_2$
* Combined Bitmask for Bits $[21:18] = 0100_2 = \mathbf{\text{0x4}}$ (positioned at Shift 18: `0x4 << 18` $= \mathbf{\text{0x0010\_0000}}$).

##### 5. Alternate Function High Register (`GPIOA_AFRH` — Offset `0x24`):
Both `PA9` and `PA10` require **$AF7$ (`4'b0111` / `0x7`)**.
* `PA9` 4-bit Field (Bits $[7:4]$) $= 0111_2 = \text{0x7}$
* `PA10` 4-bit Field (Bits $[11:8]$) $= 0111_2 = \text{0x7}$
* Combined Bitmask for Bits $[11:4] = \text{0x77}$ (positioned at Shift 4: `0x77 << 4` $= \mathbf{\text{0x0000\_0770}}$).

```text
CONFIGURED GPIO MMIO BITFIELD SUMMARY

 Register Name │ Target Bit Range │ Binary Pattern │ Hex Shift Value │ Target Function
───────────────┼──────────────────┼────────────────┼─────────────────┼───────────────────────────────
 GPIOA_AFRH    │ Bits [11:4]      │   0111_0111_2  │  0x0000_0770    │ Route PA9/PA10 to AF7 (USART1)
 GPIOA_MODER   │ Bits [21:18]     │   1010_2       │  0x0028_0000    │ Set PA9/PA10 to Alt Function
 GPIOA_OSPEEDR │ Bits [19:18]     │   01_2         │  0x0004_0000    │ Set PA9 Slew Rate to Medium
 GPIOA_PUPDR   │ Bits [21:18]     │   0100_2       │  0x0010_0000    │ Set PA10 Internal Pull-Up
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and bitwise configuration results against silicon specifications:

1. **Slew Rate Timing Closure Check**:
   * Target maximum rise time $t_{\text{rise}} \le 4.0\text{ ns}$.
   * Calculated Medium Speed rise time $t_{\text{rise\_01}} = 3.96\text{ ns}$.
   * $3.96\text{ ns} \le 4.0\text{ ns} \implies \mathbf{\text{TIMING CLOSURE PASSED!}}$
2. **Bitwise Bitmask Alignment Verification**:
   * `GPIOA_AFRH` bits $[11:4]$ programmed with `0x77` $\implies \text{PA9} = AF7 (\text{USART1\_TX}), \text{PA10} = AF7 (\text{USART1\_RX})$.
   * `GPIOA_MODER` bits $[21:18]$ programmed with `0xA` ($1010_2$) $\implies \text{PA9} = \text{Alternate Function}, \text{PA10} = \text{Alternate Function}$.
   * `GPIOA_PUPDR` bits $[21:18]$ programmed with `0x4` ($0100_2$) $\implies \text{PA9} = \text{No Pull}, \text{PA10} = \text{Weak Pull-Up}$.
3. **Glitch-Free Sequencing Verification**:
   * `AFRH` MUX code was programmed *before* enabling Alternate Function Mode in `MODER`, preventing intermediate output glitches on `PA9`.
   * `RCC_AHB1ENR` clock gate was enabled *before* accessing `GPIOA` MMIO registers, preventing `BusFault` exceptions!

All $RC$ rise-time calculations, driver resistance choices, bitwise MMIO register masks, and assembly configuration steps evaluate with 100% mathematical, physical, and logical precision.

