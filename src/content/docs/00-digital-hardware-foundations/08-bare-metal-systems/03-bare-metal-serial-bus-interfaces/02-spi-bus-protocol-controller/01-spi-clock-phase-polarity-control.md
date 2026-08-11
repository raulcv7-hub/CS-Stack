---
title: "SPI Bus Protocol Controllers, Clock Phase and Polarity Selection, and Chip Select Timing Closure"
---

# SPI Bus Protocol Controllers, Clock Phase and Polarity Selection, and Chip Select Timing Closure

## The Synchronous Clock Mismatch and Un-Aligned Sampling Crisis

In high-performance embedded systems engineering, microcontrollers must exchange data with high-speed external peripheral hardware—such as non-volatile Flash memory chips, graphical display controllers, digital signal processors (DSPs), and inertial measurement sensors (IMUs). 

While asynchronous interfaces (like UART) operate without a clock wire and are limited to modest speeds ($115,200\text{ baud}$), high-throughput systems require **Synchronous Serial Communication**, implemented via the **Serial Peripheral Interface (SPI)** protocol.

An SPI bus connects a master processor (**The SPI Master**) to one or more slave devices (**SPI Slaves**) using four dedicated physical signal wires:

1. **Serial Clock (`SCK`)**: Driven exclusively by the Master to synchronize data bit movement.
2. **Master-Out-Slave-In (`MOSI`)**: Drives data bits from Master to Slave.
3. **Master-In-Slave-Out (`MISO`)**: Drives data bits from Slave to Master.
4. **Chip Select (`CS#` / `NSS`)**: An active-low signal driven by the Master to select a specific slave device.

```text
4-WIRE SYNCHRONOUS SERIAL PERIPHERAL INTERFACE (SPI) BUS

 SPI Master Controller                               SPI Slave Device
 ┌───────────────────────────┐                       ┌───────────────────────────┐
 │ Serial Clock (SCK)        ├────── SCK Line ──────►│ Serial Clock Input (SCK)  │
 │ Master-Out-Slave-In (MOSI)├────── MOSI Line ─────►│ Master-Out-Slave-In (MOSI)│
 │ Master-In-Slave-Out (MISO)│◄───── MISO Line ──────┤ Master-In-Slave-Out (MISO)│
 │ Chip Select (CS#)         ├────── CS# Line ──────►│ Chip Select Input (CS#)   │
 └───────────────────────────┘                       └───────────────────────────┘
```

Because an SPI bus uses an explicit physical clock wire (`SCK`), transfers can operate at extreme frequencies—such as $50\text{ MHz}$ or $100\text{ MHz}$ ($100,000,000\text{ bits per second}$). 

At $50\text{ MHz}$, a single data bit is transmitted across the copper circuit board trace in an ultra-short time window lasting a mere **$20.0\text{ nanoseconds}$**.

However, different hardware peripherals manufactured by different silicon vendors are designed with completely different physical expectations regarding how the serial clock line (`SCK`) behaves:

* **Conflict 1: Idle Clock Polarity Mismatch**: Sensor A expects the clock line (`SCK`) to rest at a low voltage ($0.0\text{ Volts}$) when no data is being transferred. Sensor B expects `SCK` to rest at a high voltage ($3.3\text{ Volts}$) when idle. 

  If the Master drives `SCK` to the wrong resting voltage when activating the bus, the Slave interprets the initial voltage transition as a valid clock pulse, inserting a false extra bit at the front of the frame and corrupting all subsequent bytes!

* **Conflict 2: Active Sampling Edge Mismatch**: Sensor A shifts its data bits out onto the wire on the falling clock edge and expects the Master to sample the data line on the rising clock edge. Sensor B shifts data out on the rising clock edge and expects sampling on the falling edge. 

  If the Master samples the data line on the wrong clock edge, **it samples the wire while the voltage is actively transitioning**, reading unstable digital noise!

```text
SAMPLING EDGE MISMATCH DATA CORRUPTION

 MOSI Data Line Transitioning ───/──────────────\──────────────/───
                                 ▲ (Voltage changing 0 -> 3.3V!)
 Master Clock Edge (WRONG!) ─────┘
 (Master samples during voltage rise! Reads unstable noise!)
```

* **Conflict 3: Chip Select Setup & Hold Violations**: If the Master pulls the Chip Select line (`CS#`) Low and immediately drives the first clock edge without a minimum physical setup time ($t_{\text{lead}}$), or releases `CS#` High before the final bit finishes settling ($t_{\text{lag}}$), the Slave's internal SPI logic fails to decode the first or last bit!

To guarantee zero data corruption across multi-vendor synchronous peripherals, bare-metal hardware architectures employ **Clock Polarity (`CPOL`)**, **Clock Phase (`CPHA`)**, **SPI Modes 0 through 3**, and **Chip Select (`CS#`) Guard Delays**.


### Step 1: Setting Room Idle Light (`CPOL` — Clock Polarity)

Before starting the performance, the photographers agree on the dark room's resting state (**Clock Polarity / `CPOL`**):

* **`CPOL = 0` (Resting Pitch-Black / Clock Idle Low)**:
  When no cards are being shown, the strobe light is turned **OFF ($0.0\text{V}$)**. The first change in light will be a **Rising Flash ($0 \to 1$)**.
* **`CPOL = 1` (Resting Bright Light / Clock Idle High)**:
  When no cards are being shown, the strobe light is kept continuously **ON ($3.3\text{V}$)**. The first change in light will be a **Falling Dim ($1 \to 0$)**.


### Step 3: The Meeting Room Doorbell (Chip Select Guard Delay `CS#`)

Before Photographer A starts flashing the strobe light, they ring a doorbell outside Photographer B's room (**Pull Chip Select `CS#` Low**).

Photographer B is sitting at a desk. When the doorbell rings:

1. **Lead Guard Delay ($t_{\text{lead}}$)**:
   Photographer A cannot ring the doorbell and flash the strobe light at the exact same microsecond! 
   
   Photographer A **must wait 100 nanoseconds ($t_{\text{lead}}$)** after pulling `CS#` Low, giving Photographer B time to stand up, pick up their camera, and look at the wall.
2. **Lag Guard Delay ($t_{\text{lag}}$)**:
   After the final strobe light flash, Photographer A **must wait 100 nanoseconds ($t_{\text{lag}}$)** before releasing the doorbell High (`CS# = 1`), ensuring Photographer B finishes saving the final photo to memory!

```text
CHIP SELECT GUARD DELAYS (t_lead AND t_lag)

 Chip Select (CS#) : ───┐                                       ┌───
                        └───────────────────────────────────────┘
                        ◄─t_lead─►                     ◄─t_lag─►
 Serial Clock (SCK): ────────────┌─┐─┌─┐─┌─┐─┌─┐─┌─┐─┌─┐─────────
```

This photographer and strobe light system is the exact physical analogue of **SPI Clock Modes, `CPOL`, `CPHA`, and `CS#` Guard Delays**:
* Photographer A is the **SPI Master (`MOSI`)**.
* Photographer B is the **SPI Slave (`MISO`)**.
* The strobe light is the **Serial Clock (`SCK`)**.
* Colored cards are **Data Bits**.
* Resting light state is **Clock Polarity (`CPOL`)**.
* Photo snap edge is **Clock Phase (`CPHA`)**.
* Ringing the doorbell is **Asserting Chip Select (`CS# = 0`)**.
* Waiting before/after flashing is **Lead ($t_{\text{lead}}$) and Lag ($t_{\text{lag}}$) Guard Delay**.


### 1. The Four Standard SPI Modes (Modes 0, 1, 2, 3)

The combination of `CPOL` (2 states) and `CPHA` (2 states) defines **Four Standard SPI Operational Modes**:

$$\text{Total SPI Modes} = 2^{\text{CPOL}} \times 2^{\text{CPHA}} = \mathbf{4 \text{ Modes (Mode 0, Mode 1, Mode 2, Mode 3)}}$$

```text
SPI MODES SUMMARY TABLE

 SPI Mode │ CPOL Value │ CPHA Value │ Clock Idle State │ Data Sampling Edge  │ Data Shift Edge
──────────┼────────────┼────────────┼──────────────────┼─────────────────────┼──────────────────
  Mode 0  │     0      │     0      │ Low  (0.0V)      │ 1st Edge (Rising)   │ 2nd Edge (Falling)
  Mode 1  │     0      │     1      │ Low  (0.0V)      │ 2nd Edge (Falling)  │ 1st Edge (Rising)
  Mode 2  │     1      │     0      │ High (3.3V)      │ 1st Edge (Falling)  │ 2nd Edge (Rising)
  Mode 3  │     1      │     1      │ High (3.3V)      │ 2nd Edge (Rising)   │ 1st Edge (Falling)
```

Let us dissect the exact physical bit-level waveforms for all four SPI modes:


#### SPI Mode 1 (`CPOL = 0, CPHA = 1`)
* **Clock Idle Voltage**: `SCK` rests **Low ($0.0\text{V}$)** when idle.
* **Shifting Edge**: Data is shifted out on the **1st Clock Edge (Rising Edge $0 \to 1$)**.
* **Sampling Edge**: Data is sampled on the **2nd Clock Edge (Falling Edge $1 \to 0$)**.

#### SPI Mode 2 (`CPOL = 1, CPHA = 0`)
* **Clock Idle Voltage**: `SCK` rests **High ($3.3\text{V}$)** when idle.
* **Sampling Edge**: Data is sampled on the **1st Clock Edge (Falling Edge $1 \to 0$)**.
* **Shifting Edge**: Data is shifted out on the **2nd Clock Edge (Rising Edge $0 \to 1$)**.

#### SPI Mode 3 (`CPOL = 1, CPHA = 1`) — Second Most Widely Used
* **Clock Idle Voltage**: `SCK` rests **High ($3.3\text{V}$)** when idle.
* **Shifting Edge**: Data is shifted out on the **1st Clock Edge (Falling Edge $1 \to 0$)**.
* **Sampling Edge**: Data is sampled on the **2nd Clock Edge (Rising Edge $0 \to 1$)**.


### 3. Data Setup ($t_{\text{setup}}$) and Hold ($t_{\text{hold}}$) Timing Margins

Why does shifting data out on one clock edge and sampling data on the opposite clock edge guarantee reliable communication at $50\text{ MHz}$?

Because it maximizes the **Data Setup Time ($t_{\text{setup}}$)** and **Data Hold Time ($t_{\text{hold}}$)**!

```text
DATA EYE WINDOW AND SETUP/HOLD TIMING MARGINS

 Data Line (MOSI) : ───[ Bit N-1 ]───────X───────[ Bit N Data Valid ]───────X───
                                         │               ▲                  │
                                         │               │                  │
 Serial Clock (SCK): ────────────────────┼───────────────┼──────────────────┤
                                         ▲               │                  ▲
                                   Shift Edge            │            Shift Edge
                                                    Sampling Edge
                                         ◄─── t_setup ──►◄─── t_hold ──────►
                                         ◄───────── t_valid_window ─────────►
```

#### Definitions of Timing Margins:
* **Data Valid Window ($t_{\text{valid\_window}}$)**: The time duration during which the data line voltage remains completely stable at a solid digital $1$ or $0$. In SPI, the valid window equals half a clock period:
  $$t_{\text{valid\_window}} = \frac{T_{\text{SCK}}}{2} = \frac{1}{2 \times f_{\text{SCK}}}$$
* **Setup Time ($t_{\text{setup}}$)**: The minimum time the data signal must remain stable *before* the sampling clock edge arrives.
* **Hold Time ($t_{\text{hold}}$)**: The minimum time the data signal must remain stable *after* the sampling clock edge has passed.

#### Mathematical Calculation of Timing Slack:
Let $t_{\text{prop}}$ be the PCB trace propagation delay ($t_{\text{prop}} \approx 0.1\text{ ns}$).
Let $t_{\text{su\_slave}}$ be the required setup time of the slave chip (e.g., $t_{\text{su\_slave}} = 3.0\text{ ns}$).

At $f_{\text{SCK}} = 50\text{ MHz}$ ($T_{\text{SCK}} = 20.0\text{ ns}$):

$$t_{\text{valid\_window}} = \frac{20.0\text{ ns}}{2} = 10.0\text{ ns}$$

$$\text{Available Setup Slack } (t_{\text{slack}}) = t_{\text{valid\_window}} - t_{\text{prop}} - t_{\text{su\_slave}}$$

$$t_{\text{slack}} = 10.0\text{ ns} - 0.1\text{ ns} - 3.0\text{ ns} = \mathbf{+6.90 \text{ Nanoseconds Positive Margin!}}$$

Because the shifting edge and sampling edge are separated by a full half-period ($10.0\text{ ns}$), the receiver enjoys a massive $+6.90\text{-ns}$ setup margin, guaranteeing $100\%$ zero bit-errors!


## Real-World Silicon Failures, Bus Floating Glitches, and SPI Mode Collisions

In commercial embedded systems engineering, mis-configuring SPI clock modes or leaving bus lines floating leads to severe physical hardware failures.


### 2. Multi-Slave `MISO` Line Floating Noise

In a multi-slave SPI system, multiple slave devices share the exact same `MISO` data line connected back to the Master:

```text
MULTI-SLAVE MISO BUS FLOATING NOISE HAZARD

 SPI Master MISO Pin (Input Mode)
 ┌───────────────────────────────────────────────────────────┐
 │ Un-driven Floating MISO Line (All CS# Lines = 1 High)    │
 └─────────────────────────────┬─────────────────────────────┘
                               │
 ┌─────────────────────────────┼─────────────────────────────┐
 │                             │                             │
 ▼                             ▼                             ▼
Slave 0 (CS0#=1)              Slave 1 (CS1#=1)              Slave 2 (CS2#=1)
MISO = High-Z (Z)            MISO = High-Z (Z)            MISO = High-Z (Z)
 (No slave is driving the wire! MISO floats at intermediate 1.65V voltage!)
 (Master reads random noise bits when no slave is selected!)
```

#### The Hazard:
When all `CS#` lines are High ($1$), every slave's `MISO` output buffer is in High-Impedance state ($Z$).
* The shared `MISO` copper trace floats in mid-air at an intermediate voltage ($\sim 1.65\text{V}$).
* The Master's digital input buffer sees $1.65\text{V}$ and consumes **DC short-circuit leakage current**.
* If the Master attempts to read `SPI1_DR` while no slave is selected, it reads random electromagnetic noise!

#### The Hardware Solution:
Always enable an internal weak **Pull-Up Resistor (`PUPDR = 01`)** on the Master's `MISO` input pin!

When all slaves are deselected ($Z$), the weak pull-up resistor pulls the `MISO` line cleanly to $3.3\text{V}$ (reading digital $1$), preventing floating gate leakage and noise.


### Scenario and Parameters

You are a senior bare-metal systems architect configuring the `SPI1` bus interface for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is connected over a 4-wire SPI bus to an external $64\text{-Megabit}$ Industrial Flash Memory Chip (`Winbond W25Q64`).

```text
3.2 GZ SERVER PROCESSOR SPI1 FLASH MEMORY SUBSYSTEM

 Host CPU (3.2 GHz) ──► [ SPI1 Peripheral @ 0x4001_3000 ] ──► External Flash W25Q64
 Clock f_PCLK2 = 84.000 MHz                             Requires SPI Mode 3 (CPOL=1, CPHA=1)
                                                        Max Clock f_SCK <= 25.0 MHz
```

#### Hardware & Timing Specifications:
* **APB2 Bus Clock Frequency**: $f_{\text{PCLK2}} = \mathbf{84.000 \text{ MHz}}$ ($84,000,000\text{ Hz}$).
* **Target Flash Memory (`W25Q64`) Requirements**:
  * **Supported SPI Mode**: **SPI Mode 3 (`CPOL = 1, CPHA = 1`)**.
  * **Maximum Clock Frequency**: $f_{\text{SCK\_max}} = \mathbf{25.000 \text{ MHz}}$.
  * **Flash Setup Time Requirement**: $t_{\text{su\_flash}} = \mathbf{5.0 \text{ nanoseconds}}$.
  * **Flash Hold Time Requirement**: $t_{\text{hold\_flash}} = \mathbf{5.0 \text{ nanoseconds}}$.
  * **Chip Select Lead Time Requirement**: $t_{\text{lead\_min}} = \mathbf{20.0 \text{ nanoseconds}}$ (Delay between `CS#` Low and 1st `SCK` edge).
  * **Chip Select Lag Time Requirement**: $t_{\text{lag\_min}} = \mathbf{20.0 \text{ nanoseconds}}$ (Delay between last `SCK` edge and `CS#` High).
* **Physical PCB Trace Parameters**:
  * Trace Propagation Delay: $t_{\text{prop}} = \mathbf{0.50 \text{ nanoseconds}}$.

#### Your Objective

1. Calculate the minimum valid baud rate division factor ($2^{\text{BR}+1}$) in `SPI1_CR1.BR[2:0]` that produces $f_{\text{SCK}} \le 25.000\text{ MHz}$ from $f_{\text{PCLK2}} = 84.000\text{ MHz}$.
2. Calculate the actual physical clock frequency $f_{\text{SCK}}$ and period $T_{\text{SCK}}$ (in nanoseconds) synthesized by the selected prescaler.
3. Calculate the available Data Valid Window ($t_{\text{valid\_window}}$) and the **Setup Timing Slack ($t_{\text{slack}}$)** for the Flash memory chip at the synthesized clock frequency.
4. Calculate the exact number of NOP delay instructions (at $T_{\text{clk}} = 0.3125\text{ ns}$) required in assembly to satisfy the $t_{\text{lead\_min}} = 20.0\text{ ns}$ Lead Guard Delay on `CS#`.
5. Write the complete, production-ready ARM Assembly routine `SPI1_Flash_Init` that configures `SPI1_CR1` for Mode 3 master operation and programs `GPIOA_BSRR` for `CS#` control.
6. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Setup Timing Slack ($t_{\text{slack}}$)

In SPI Mode 3 (`CPOL = 1, CPHA = 1`), data is shifted on falling edges and sampled on rising edges.

The available Data Valid Window ($t_{\text{valid\_window}}$) is one half-period of $T_{\text{SCK}}$:

$$t_{\text{valid\_window}} = \frac{T_{\text{SCK}}}{2} = \frac{47.619\text{ ns}}{2} = \mathbf{23.8095 \text{ Nanoseconds}}$$

Calculate Setup Timing Slack ($t_{\text{slack}}$):

$$t_{\text{slack}} = t_{\text{valid\_window}} - t_{\text{prop}} - t_{\text{su\_flash}}$$

$$t_{\text{slack}} = 23.8095\text{ ns} - 0.50\text{ ns} - 5.00\text{ ns} = \mathbf{+18.3095 \text{ Nanoseconds Positive Slack!}}$$

##### Timing Closure Result:
The Flash memory chip enjoys a massive **$+18.31\text{-ns}$ positive setup slack**, guaranteeing $100\%$ reliable, zero-bit-error data transfers at $21.0\text{ MHz}$!


#### Step 4: Complete Production Assembly Initialization Routine (`SPI1_Flash_Init`)

Here is the complete, production-ready ARM Assembly routine that configures `PA4` (`CS#`), `PA5` (`SCK`), `PA6` (`MISO`), `PA7` (`MOSI`), and initializes `SPI1` for Mode 3 master operation:

```assembly
/* PRODUCTION BARE-METAL SPI1 MODE 3 INITIALIZATION IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_AHB1ENR,     0x40023830        /* AHB1 Clock Enable (GPIOA) */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Clock Enable (SPI1) */

.equ GPIOA_BASE,      0x40020000
.equ GPIOA_MODER,     0x40020000        /* GPIOA Mode Register */
.equ GPIOA_OSPEEDR,   0x40020008        /* GPIOA Output Speed Register */
.equ GPIOA_PUPDR,     0x4002000C        /* GPIOA Pull-Up/Pull-Down Reg */
.equ GPIOA_BSRR,      0x40020018        /* GPIOA Bit Set/Reset Register */
.equ GPIOA_AFRL,      0x40020020        /* GPIOA Alternate Function Low */

.equ SPI1_BASE,       0x40013000
.equ SPI1_CR1,        0x40013000        /* SPI1 Control Register 1 */
.equ SPI1_SR,         0x40013008        /* SPI1 Status Register */
.equ SPI1_DR,         0x4001300C        /* SPI1 Data Register */

.global SPI1_Flash_Init
.type SPI1_Flash_Init, %function

.section .text
.thumb_func
SPI1_Flash_Init:
    push    {r4, r5, lr}

    /* ==================================================================== */
    /* STEP 1: ENABLE CLOCKS FOR GPIOA (AHB1) AND SPI1 (APB2) FIRST         */
    /* ==================================================================== */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* GPIOAEN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 12)          /* SPI1EN = 1 (Bit 12) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* ==================================================================== */
    /* STEP 2: CONFIGURE GPIO PINS: PA4(CS#), PA5(SCK), PA6(MISO), PA7(MOSI)*/
    /* ==================================================================== */
    /* PA4: General Output (CS#), PA5/PA6/PA7: Alternate Function AF5 */
    ldr     r0, =GPIOA_AFRL
    ldr     r1, [r0]
    ldr     r2, =0x0000FFFF             /* Clear AF bits for Pins 4..7 */
    bic     r1, r1, r2
    ldr     r2, =0x55500000             /* AF5 for PA5, PA6, PA7 (0x5) */
    orr     r1, r1, r2
    str     r1, [r0]

    /* Set PA6 (MISO) Weak Pull-Up (PUPDR[13:12] = 2'b01) */
    ldr     r0, =GPIOA_PUPDR
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 12)
    orr     r1, r1, #(0x1 << 12)        /* MISO Pull-Up prevents floating noise! */
    str     r1, [r0]

    /* Set PA4 Output = HIGH (Deselect Flash CS# = 1 initially) */
    ldr     r0, =GPIOA_BSRR
    movs    r1, #(1 << 4)               /* Set PA4 High */
    str     r1, [r0]

    /* Set MODER: PA4=Output(01), PA5/6/7=AltFunc(10) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    ldr     r2, =~(0xFF << 8)           /* Clear MODER bits for PA4..PA7 */
    and     r1, r1, r2
    ldr     r2, =(0xA9 << 8)            /* PA4=01 (Out), PA5/6/7=10 (AF) */
    orr     r1, r1, r2
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 3: CONFIGURE SPI1_CR1 FOR MODE 3 (CPOL=1, CPHA=1), PRESCALER /4 */
    /* ==================================================================== */
    /* Ensure SPI1 is disabled first (SPE = 0) */
    ldr     r0, =SPI1_CR1
    movs    r1, #0
    str     r1, [r0]

    /* Program CR1: MSTR=1, CPOL=1, CPHA=1, BR=3'b001 (/4 = 21MHz), SSM=1, SSI=1 */
    /* BR[2:0]=001 (bit 3), MSTR=1 (bit 2), CPOL=1 (bit 1), CPHA=1 (bit 0) */
    /* SSM=1 (bit 9), SSI=1 (bit 8) */
    ldr     r1, =((1 << 2) | (1 << 1) | (1 << 0) | (1 << 3) | (1 << 8) | (1 << 9))
    str     r1, [r0]

    /* Enable SPI1 Peripheral (SPE = 1) */
    orr     r1, r1, #(1 << 6)           /* Set Bit 6 (SPE = 1) */
    str     r1, [r0]

    dsb
    pop     {r4, r5, pc}
.size SPI1_Flash_Init, .-SPI1_Flash_Init


/* PRODUCTION ASSEMBLY FUNCTION TO READ A BYTE FROM FLASH IN MODE 3 */
.global SPI1_ReadByte
.type SPI1_ReadByte, %function
.thumb_func
SPI1_ReadByte:
    /* Inputs: r0 = Dummy byte to transmit (0xFF) */
    /* Returns: r0 = Received byte from Flash */
    push    {r4, lr}

    /* 1. Pull CS# Low (PA4 = 0) */
    ldr     r1, =GPIOA_BSRR
    ldr     r2, =(1 << (4 + 16))        /* Reset PA4 (CS# = 0) */
    str     r2, [r1]

    /* 2. Lead Guard Delay (t_lead = 20 ns -> 64 NOP cycles) */
    movs    r3, #16
cs_lead_delay:
    subs    r3, r3, #1
    bne     cs_lead_delay

    /* 3. Transmit Dummy Byte over SPI1_DR */
    ldr     r1, =SPI1_BASE
    strh    r0, [r1, #0x0C]             /* Write dummy byte to SPI1_DR */

    /* 4. Wait for RXNE = 1 (Read Register Not Empty) */
wait_rxne:
    ldrh    r2, [r1, #0x08]             /* Read SPI1_SR */
    tst     r2, #(1 << 0)               /* Test Bit 0 (RXNE) */
    beq     wait_rxne

    /* 5. Read Converted Byte from SPI1_DR */
    ldrh    r0, [r1, #0x0C]             /* r0 <= Received Data Byte */

    /* 6. Wait for BSY = 0 (Bus Not Busy) before releasing CS# */
wait_not_busy:
    ldrh    r2, [r1, #0x08]             /* Read SPI1_SR */
    tst     r2, #(1 << 7)               /* Test Bit 7 (BSY) */
    bne     wait_not_busy

    /* 7. Lag Guard Delay (t_lag = 20 ns) */
    movs    r3, #16
cs_lag_delay:
    subs    r3, r3, #1
    bne     cs_lag_delay

    /* 8. Pull CS# High (PA4 = 1) */
    ldr     r1, =GPIOA_BSRR
    movs    r2, #(1 << 4)               /* Set PA4 High */
    str     r2, [r1]

    pop     {r4, pc}
.size SPI1_ReadByte, .-SPI1_ReadByte
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Clock Polarity (`CPOL`)**: An MMIO configuration bit (`SPI_CR1.CPOL`) that defines the default steady-state voltage level of the serial clock line (`SCK`) when no transfer is active ($0 = \text{Low} / 0.0\text{V}$, $1 = \text{High} / 3.3\text{V}$).
* **Clock Phase (`CPHA`)**: An MMIO configuration bit (`SPI_CR1.CPHA`) that dictates which clock edge captures (samples) data ($0 = \text{First Edge}$, $1 = \text{Second Edge}$) relative to the idle clock state, defining SPI Modes 0 through 3.
* **Chip Select (`CS#` / `NSS`) Guard Delay**: The mandatory physical time delays ($t_{\text{lead}}$ and $t_{\text{lag}}$) enforced between pulling `CS#` Low and driving the first `SCK` edge, and between the last `SCK` edge and pulling `CS#` High, preventing slave state machine decoding errors.