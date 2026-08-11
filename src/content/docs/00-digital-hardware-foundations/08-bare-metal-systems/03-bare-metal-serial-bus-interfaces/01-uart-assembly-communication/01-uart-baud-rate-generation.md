---
title: "Bare-Metal UART Baud Rate Generation, Fractional Clock Dividers, and Phase Drift Closure"
---

# Bare-Metal UART Baud Rate Generation, Fractional Clock Dividers, and Phase Drift Closure

## The Clockless Asynchronous Phase Drift Failure

In digital computer systems, microcontrollers must frequently communicate with external peripheral devices—such as GPS modules, Bluetooth transceivers, motor controllers, or human operator terminals—across long distance cables. 

To minimize physical hardware costs and reduce printed circuit board (PCB) trace complexity, software engineers prefer to use **Asynchronous Serial Communication**, implemented via a **Universal Asynchronous Receiver-Transmitter (UART)** peripheral.

Unlike synchronous buses (such as SPI or $I^2C$), an asynchronous UART link **does not share a physical clock wire** between the transmitter and the receiver. 

The physical interconnect consists of only two signal wires:
* **Transmit Line (`TX`)**: Drives outgoing serial data bits.
* **Receive Line (`RX`)**: Samples incoming serial data bits.

Because there is no shared clock wire traveling alongside the data line, the receiving device must reconstruct the exact timing of incoming data bits using its own internal clock source.

To transmit a single byte of data (e.g., character `'A'` $= \text{0x41} = 0100\_0001_2$), the transmitter wraps the 8 data bits inside a standardized **10-Bit Asynchronous Serial Frame**:

```text
ANATOMY OF A 10-BIT ASYNCHRONOUS SERIAL FRAME

 Idle State (3.3V)                                              Stop Bit (3.3V)
 ─────────┐                                                    ┌─────────
          │ Start Bit (0.0V)                                   │
          └───────────┬───┬───┬───┬───┬───┬───┬───┬───────────┘
                      │ D0│ D1│ D2│ D3│ D4│ D5│ D6│ D7│
                      ◄─────── 8 Data Bits (LSB First) ───────►
                      ◄────────────── 10 Total Bits ──────────►
```

1. **Idle State**: When no data is being sent, the line is held continuously High ($3.3\text{ Volts}$ / Logic $1$).
2. **Start Bit**: The transmitter pulls the line Low ($0.0\text{ Volts}$ / Logic $0$) for exactly **1 bit period ($T_{\text{bit}}$)** to signal the start of a frame.
3. **8 Data Bits**: The transmitter outputs the 8 data bits sequentially, Least Significant Bit (LSB) first, holding each bit for $T_{\text{bit}}$ seconds.
4. **Stop Bit**: The transmitter drives the line back High ($3.3\text{ Volts}$) for at least $T_{\text{bit}}$ seconds to reset the line to idle.

Now, consider the physical hardware disaster that occurs if the receiver's internal clock is slightly faster or slightly slower than the transmitter's clock:

The receiver detects the falling edge ($1 \to 0$) of the Start Bit and starts its local bit-sampling clock. 

To sample incoming data bits reliably, the receiver attempts to sample the voltage at the **dead center of each bit window** ($0.5\ \text{bit}$, $1.5\ \text{bits}$, $2.5\ \text{bits} \dots 9.5\ \text{bits}$).

If the receiver's clock frequency is mismatched by even a small percentage:
* On Bit 0 (Start Bit), the sampling point is close to the middle ($0.50\ \text{bits}$).
* On Bit 1 ($D_0$), the sampling point drifts slightly ($1.53\ \text{bits}$).
* On Bit 5 ($D_4$), the sampling point drifts further toward the bit edge ($5.65\ \text{bits}$).
* By Bit 9 (Stop Bit), the cumulative phase drift has accumulated across 10 bit periods! **The receiver samples the line right during the voltage transition between bits**!

```text
CUMULATIVE SAMPLING PHASE DRIFT ACROSS A 10-BIT FRAME

 Transmitter Bit Windows (Exact 1.0 T_bit Spacing)
 ┌───────────┬───────────┬───────────┬─── ... ───┬───────────┐
 │ Start (0) │ Data 0    │ Data 1    │           │ Stop (1)  │
 └───────────┴───────────┴───────────┴─── ... ───┴───────────┘
  0.0       1.0         2.0         3.0         9.0        10.0 (Bit Times)

 Receiver Sampling Points (Clock Running 5% Too Fast!)
 ───*───────────*───────────*─────────── ... ───────*─────────► Time t
   0.47        1.42        2.37                    8.95
                                                    ▲
                                                    │ SAMPLES ON EDGE! (DATA CORRUPTED!)
```

Look at the physical failure:
If the cumulative phase drift exceeds **$\pm 50\%$ of a half-bit window ($\pm 2.5\%$ to $\pm 5.0\%$ overall baud rate error)**:
* The receiver samples the wrong bit or samples during a voltage rise/fall transition edge.
* The receiver reads corrupted data bytes or fails to detect the High Stop Bit at the end of the frame, triggering a hardware **Framing Error (`FE`)**.

Why do simple integer clock dividers fail to generate accurate baud rates?

Suppose a microcontroller's peripheral bus clock operates at $f_{\text{PCLK}} = 84\text{ MHz}$ ($84,000,000\text{ Hz}$), and we need a standard industry baud rate of $115,200\text{ bits per second}$.

To divide $84\text{ MHz}$ down to $115,200\text{ baud}$ with a standard $16\times$ oversampling clock generator, the required hardware division factor ($USARTDIV$) is:

$$USARTDIV = \frac{84,000,000}{16 \times 115,200} = \frac{84,000,000}{1,843,200} = \mathbf{45.57291667}$$

If the hardware clock divider can divide *only* by whole integer numbers (truncating $45.5729 \to 45$):

$$\text{Baud}_{\text{actual}} = \frac{84,000,000}{16 \times 45} = \mathbf{116,666.67 \text{ Baud}}$$

$$\text{Baud Rate Error} = \frac{116,666.67 - 115,200}{115,200} \times 100\% = \mathbf{+1.273\% \text{ Error}}$$

Combine this $+1.273\%$ integer division error with a $\pm 1.5\%$ crystal oscillator temperature drift, and **the total clock error exceeds $\pm 2.5\%$**, causing serial communication to collapse into continuous framing errors!

To eliminate integer division rounding errors and achieve sub-percent baud rate accuracy across arbitrary peripheral clock frequencies, microcontrollers incorporate a **Fractional Baud Rate Generator** and a **Fractional Baud Rate Register (`USART_BRR`)**.


### Step 1: The Fast Wristwatch Disaster (Clock Drift & Phase Failure)

Suppose the second dancer's wristwatch is running slightly fast, ticking every **$0.950\text{ seconds}$ ($5\%$ timing error)**!

Look at what happens across the 10 steps:
* Step 0 (Start): Second dancer steps at $0.475\text{s}$ (Close to the $0.500\text{s}$ middle).
* Step 1 ($D_0$): Second dancer steps at $1.425\text{s}$ (First dancer steps at $1.500\text{s}$).
* Step 5 ($D_4$): Second dancer steps at $5.225\text{s}$ (First dancer steps at $5.500\text{s}$).
* Step 9 ($D_7$): Second dancer steps at $8.075\text{s}$! 

  By Step 9, the second dancer is **a full half-second ahead of the first dancer**! 

  The second dancer steps while the first dancer is still moving between positions. They collide and fall over (**Framing Error**)!

```text
CUMULATIVE DRIFT IN THE DANCE ROUTINE

 First Dancer (Exact 1.0s Spacing) : ─── 0.5s ─────── 1.5s ─────── 2.5s ... ─────── 9.5s
 Second Dancer (Fast 0.95s Watch)  : ─── 0.475s ───── 1.425s ──── 2.375s ... ───── 8.55s
                                                                                  ▲
                                                                                  │ 0.95s TOO EARLY! (COLLISION!)
```


### Step 3: The Intermittent Extra-Tick Gear (Fractional Baud Rate Divisor)

Now, how do you make a mechanical clock divide an $84\text{-MHz}$ clock to get $115,200\text{ baud}$ when the exact math requires dividing by **$45.5729$**?

You cannot build a physical gear with $45.5729$ teeth! You can only build a gear with 45 teeth or 46 teeth.
* If you use a 45-tooth gear, the clock runs too fast ($116,666\text{ baud}$).
* If you use a 46-tooth gear, the clock runs too slow ($114,130\text{ baud}$).

#### The Fractional Solution:
You use a **45-tooth gear equipped with a 16-step Fractional Side-Cam (`DIV_Fraction`)**!

To achieve a division factor of $45 + \frac{9}{16} = 45.5625$:
* For 7 clock cycles, the gear rotates with **45 teeth**.
* On the 8th clock cycle, the side-cam engages, extending the rotation by 1 extra tick (**46 teeth**)!
* Over 16 clock cycles, the gear rotates 7 times at 45 teeth and 9 times at 46 teeth.

$$\text{Average Division Ratio} = \frac{(7 \times 45) + (9 \times 46)}{16} = \frac{315 + 414}{16} = \frac{729}{16} = \mathbf{45.5625}$$

```text
FRACTIONAL GEAR INTERPOLATION (45 VS 46 TEETH INTERLEAVING)

 Clock Cycles :  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
 Gear Teeth   : [45][46][45][46][45][46][45][46][45][46][45][46][45][46][45][46]
                ◄───────────────────── Average = 45.5625 Teeth ────────────────────────►
```

Look at the mathematical miracle:
By interleaving 45-tick and 46-tick cycles in hardware, the *average* clock division ratio equals **$45.5625$**!

The baud rate error drops from $+1.273\%$ down to **$-0.022\%$**, delivering rock-solid, zero-error serial communication!

This dance routine system is the exact physical analogue of **UART Baud Rate Generation, 16x Oversampling, and Fractional `USART_BRR` Registers**:
* The blindfolded dancers are the **UART Transmitter (`TX`) and Receiver (`RX`)**.
* The 10 dance steps are the **10-Bit Asynchronous Serial Frame**.
* Fast watch drift is **Baud Rate Clock Mismatch**.
* The 16x strobe light is **16x Hardware Oversampling**.
* Majority voting on flashes 7, 8, 9 is **3-Sample Bit Noise Filtering**.
* The 16-step side-cam is the **Fractional Baud Rate Register (`USART_BRR`)**.


### 1. The 16x Oversampling Sampler Pipeline

In modern UART hardware (such as the ARM Cortex-M / STM32 USART peripheral), the receiver's `RX` input pin does **not** sample the incoming line once per bit period.

The UART hardware uses an internal high-speed sampling clock running at **16 times the target baud rate ($16 \times \text{Baud}$)**.

```text
16X OVERSAMPLING BIT WINDOW AND MAJORITY VOTING SAMPLER

 Incoming RX Serial Bit Window (1 Bit Duration = 16 Sampling Ticks)
 Ticks:  1   2   3   4   5   6  [7   8   9] 10  11  12  13  14  15  16
        ───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───
 RX Line:  1   1   1   1   1   1   1   1   1   1   1   1   1   1   1   1
                                   ▲   ▲   ▲
                                   │   │   │
                                   └───┴───┴──► Samples 7, 8, 9 Fed to Majority Voter!
                                                (2-out-of-3 votes = Logic 1)
```

#### How the 16x Sampler Executes Frame Alignment and Noise Filtering:

1. **Start Bit Detection ($1 \to 0$ Edge)**:
   While the line is Idle ($1$), the 16x sampler continuously monitors the `RX` pin. The exact nanosecond a falling edge ($1 \to 0$) occurs, the 16x sampler resets its internal bit-tick counter to 0.
2. **Start Bit Validation (Ticks 7, 8, 9)**:
   The sampler waits until ticks 7, 8, and 9 of the Start Bit window arrive (the dead center of the Start Bit). It samples the line voltage on all three ticks:
   * If at least 2 out of the 3 samples read Low ($0.0\text{V}$), the Start Bit is confirmed valid!
   * If 2 out of 3 samples read High ($3.3\text{V}$), the hardware detects a false noise spike, aborts frame reception, and returns to Idle state.
3. **Data Bit Majority Sampling (Ticks 7, 8, 9)**:
   For each of the next 8 data bits, the sampler samples the line on ticks 7, 8, and 9 of that bit's 16-tick window:

$$\mathbf{\text{Bit\_Value} = \text{Majority\_Vote}(\text{Sample}_7, \, \text{Sample}_8, \, \text{Sample}_9)}$$

   If all three samples agree ($111_2$ or $000_2$), the data bit is clean. If one sample disagrees ($101_2$), the hardware sets the **Noise Error Flag (`NE` in `USART_SR`)** to alert software that the line suffered electrical interference!


### 3. Bitwise Anatomy of the Baud Rate Register (`USART_BRR`)

To store the floating-point division factor $USARTDIV$ in hardware without floating-point math units, the 16-bit **Baud Rate Register (`USART_BRR`)** at offset `0x08` encodes $USARTDIV$ as a **Fixed-Point Binary Number**:

```text
BITWISE MAP OF THE BAUD RATE REGISTER (USART_BRR)

 Bit 15                               Bit 4 Bit 3           Bit 0
 ┌─────────────────────────────────────────┬─────────────────┐
 │ DIV_Mantissa[11:0]                      │ DIV_Fraction[3:0]│
 │ (12-Bit Unsigned Integer Part: 0..4,095)│ (4-Bit Fraction)│
 └─────────────────────────────────────────┴─────────────────┘
  ◄────── 12-Bit Mantissa (Integer) ──────► ◄─ 4-Bit Fraction ─►
```

The 16 bits of `USART_BRR` are divided into two fields:
1. **`DIV_Mantissa[11:0]` (Bits $[15:4]$ — 12 Bits)**:
   Holds the 12-bit unsigned integer portion of $USARTDIV$ ($0 \dots 4,095$).
2. **`DIV_Fraction[3:0]` (Bits $[3:0]$ — 4 Bits)**:
   Holds the 4-bit fractional portion of $USARTDIV$, representing 16ths ($\frac{0}{16} \dots \frac{15}{16}$).

#### Mathematical Conversion Between $USARTDIV$ and `USART_BRR` Word

The relationship between the fixed-point `USART_BRR` register value and $USARTDIV$ is:

$$USARTDIV = \text{DIV\_Mantissa} + \frac{\text{DIV\_Fraction}}{16}$$

To calculate the exact 16-bit integer word $N_{\text{BRR}}$ to be written into `USART_BRR`:

Multiply $USARTDIV$ by $16$ and round to the nearest integer:

$$\mathbf{N_{\text{BRR}} = \text{round}\left( USARTDIV \times 16 \right)}$$

Substitute the master $USARTDIV$ equation into $N_{\text{BRR}}$:

$$N_{\text{BRR}} = \text{round}\left( \frac{f_{\text{PCLK}}}{16 \times \text{Baud\_Target}} \times 16 \right)$$

Simplifying yields **The Direct `USART_BRR` Calculation Equation**:

$$\mathbf{N_{\text{BRR}} = \text{round}\left( \frac{f_{\text{PCLK}}}{\text{Baud\_Target}} \right)}$$

Where:
* $N_{\text{BRR}}$ is the 16-bit integer written directly into `USART_BRR`.
* $f_{\text{PCLK}}$ is the peripheral bus clock frequency supplying the UART in Hertz.
* $\text{Baud\_Target}$ is the desired baud rate in bits per second.

```text
DIRECT BRR REGISTER VALUE CALCULATION EXAMPLES

 Example 1: f_PCLK = 84,000,000 Hz, Target Baud = 115,200
 N_BRR = round( 84,000,000 / 115,200 ) = round( 729.16667 ) = 729
 N_BRR = 729 = 0x02D9  => DIV_Mantissa = 0x02D (45), DIV_Fraction = 0x9 (9)
 Synthesized USARTDIV = 45 + (9/16) = 45.5625

 Example 2: f_PCLK = 42,000,000 Hz, Target Baud = 9,600
 N_BRR = round( 42,000,000 / 9,600 ) = round( 4375.0 ) = 4375
 N_BRR = 4375 = 0x1117 => DIV_Mantissa = 0x111 (273), DIV_Fraction = 0x7 (7)
 Synthesized USARTDIV = 273 + (7/16) = 273.4375
```


## Real-World Silicon Failures, Clock Drift, and Framing Error Interrupts

In production bare-metal systems engineering, setting up UART baud rates requires handling hardware status flags and physical crystal drift anomalies.


### 2. The Un-Clocked USART Peripheral Bus Fault

A common trap for bare-metal assembly developers is attempting to program `USART_BRR` **before enabling the USART peripheral clock gate in the Reset and Clock Control (RCC) controller**:

```assembly
/* INCORRECT ASSEMBLY INITIALIZATION (UN-CLOCKED USART MMIO ACCESS!) */
    ldr     r0, =USART1_BRR
    ldr     r1, =0x02D9         /* Baud rate 115,200 divisor */
    str     r1, [r0]            /* CRASH! USART1 CLOCK IS TURNED OFF! */
```

Because `USART1` sits on the APB2 peripheral bus, its MMIO registers are un-powered until bit 4 (`USART1EN`) in `RCC_APB2ENR` is set to $1$. 

Executing `str r1, [r0]` while `USART1EN = 0` causes the APB bus bridge to time out and assert a hardware **BusFault / HardFault Exception**, freezing the CPU!

#### The Required Sequence:
Always write `RCC_APB2ENR` to enable the peripheral clock **FIRST**, execute a Data Synchronization Barrier (`DSB`), and **THEN** program `USART_BRR`!


### Scenario and Parameters

You are a principal bare-metal communications architect configuring the `USART1` peripheral for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The `USART1` peripheral is connected to the high-speed **APB2 bus** operating at clock frequency $f_{\text{PCLK2}} = \mathbf{84.000 \text{ MHz}}$ ($84,000,000\text{ Hz}$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER USART1 BAUD RATE SYNTHESIS

 APB2 Peripheral Bus Clock f_PCLK2 = 84.000 MHz
 ┌─────────────────────────────────────────────────────────────┐
 │ Universal Synchronous Asynchronous Receiver Transmitter 1   │
 │ MMIO Base Address : USART1_BASE = 0x4001_1000               │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Target Communication Requirements:
 * Desired Serial Baud Rate : Baud_target = 115,200 Bits/Sec
 * Oversampling Mode        : 16x Oversampling (OVER8 = 0 in USART_CR1)
 * Physical Pins            : PA9 (USART1_TX), PA10 (USART1_RX)
```

#### Subsystem Specifications:
* Input Peripheral Clock: $f_{\text{PCLK2}} = 84,000,000\text{ Hz}$.
* Desired Target Baud Rate: $\text{Baud}_{\text{target}} = 115,200\text{ bits/second}$.
* Oversampling Factor: $16\times$ (`OVER8 = 0`).
* Physical Pin Mapping: `PA9` mapped to Alternate Function $AF7$ (`USART1_TX`), `PA10` mapped to $AF7$ (`USART1_RX`).

#### Your Objective

1. Calculate the exact floating-point division factor $USARTDIV$.
2. Decompose $USARTDIV$ into its 12-bit integer mantissa (`DIV_Mantissa`) and 4-bit fractional part (`DIV_Fraction`).
3. Calculate the exact 16-bit hexadecimal integer value $N_{\text{BRR}}$ to be written into the `USART1_BRR` register.
4. Calculate the actual physical baud rate $\text{Baud}_{\text{actual}}$ synthesized by the hardware using $N_{\text{BRR}}$.
5. Calculate the percentage baud rate error $\text{Error}_{\%}$ and verify whether it satisfies the physical timing closure limit ($|\text{Error}_{\%}| < 2.5\%$).
6. Write the complete, production-ready ARM Assembly routine `USART1_Init` that enables the `USART1` clock in `RCC_APB2ENR`, configures `PA9`/`PA10` in `GPIOA_MODER` and `GPIOA_AFRH`, programs `USART1_BRR`, and enables the transmitter (`TE = 1`) and receiver (`RE = 1`) in `USART1_CR1`.
7. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Actual Synthesized Baud Rate ($\text{Baud}_{\text{actual}}$)

Using $N_{\text{BRR}} = 729$:

$$\text{Baud}_{\text{actual}} = \frac{f_{\text{PCLK2}}}{N_{\text{BRR}}} = \frac{84,000,000\text{ Hz}}{729} \approx \mathbf{115,226.337 \text{ Bits/Second}}$$

The physical hardware will transmit serial bits at **$115,226.337\text{ baud}$**.


#### Step 4: Write Complete Production Assembly Initialization Routine (`USART1_Init`)

Here is the complete, production-ready ARM Assembly configuration routine:

```assembly
/* PRODUCTION BARE-METAL USART1 BAUD RATE & HARDWARE INITIALIZATION */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_AHB1ENR,     0x40023830        /* AHB1 Clock Enable (GPIOA) */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Clock Enable (USART1) */

.equ GPIOA_BASE,      0x40020000
.equ GPIOA_MODER,     0x40020000        /* GPIOA Mode Register */
.equ GPIOA_OSPEEDR,   0x40020008        /* GPIOA Output Speed Register */
.equ GPIOA_PUPDR,     0x4002000C        /* GPIOA Pull-Up/Pull-Down Reg */
.equ GPIOA_AFRH,      0x40020024        /* GPIOA Alternate Function High */

.equ USART1_BASE,     0x40011000
.equ USART1_SR,       0x40011000        /* Status Register */
.equ USART1_DR,       0x40011004        /* Data Register */
.equ USART1_BRR,      0x40011008        /* Baud Rate Register */
.equ USART1_CR1,      0x4001100C        /* Control Register 1 */

.global USART1_Init
.type USART1_Init, %function

.section .text
.thumb_func
USART1_Init:
    push    {r4, lr}

    /* ==================================================================== */
    /* STEP 1: ENABLE CLOCKS FOR GPIOA (AHB1) AND USART1 (APB2) FIRST       */
    /* ==================================================================== */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* GPIOAEN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 4)           /* USART1EN = 1 (Bit 4) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* ==================================================================== */
    /* STEP 2: CONFIGURE PA9 (TX) AND PA10 (RX) FOR ALTERNATE FUNCTION AF7  */
    /* ==================================================================== */
    /* Program AFRH: PA9 -> AF7, PA10 -> AF7 (Bits [11:4] = 0x77) */
    ldr     r0, =GPIOA_AFRH
    ldr     r1, [r0]
    bic     r1, r1, #(0xFF << 4)        /* Clear bits [11:4] */
    orr     r1, r1, #(0x77 << 4)        /* Set AF7 for PA9 and PA10 */
    str     r1, [r0]

    /* Set PA9 (TX) Slew Rate to Medium Speed (OSPEEDR = 2'b01) */
    ldr     r0, =GPIOA_OSPEEDR
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 18)        /* Clear bits [19:18] */
    orr     r1, r1, #(0x1 << 18)        /* Set Medium Speed */
    str     r1, [r0]

    /* Set PA10 (RX) Weak Pull-Up (PUPDR = 2'b01) */
    ldr     r0, =GPIOA_PUPDR
    ldr     r1, [r0]
    bic     r1, r1, #(0x3 << 20)        /* Clear bits [21:20] */
    orr     r1, r1, #(0x1 << 20)        /* Set Pull-Up */
    str     r1, [r0]

    /* Set PA9 and PA10 Mode to Alternate Function (MODER = 2'b10) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    bic     r1, r1, #(0xF << 18)        /* Clear bits [21:18] */
    orr     r1, r1, #(0xA << 18)        /* Set MODER = 2'b10 for PA9/PA10 */
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 3: PROGRAM FRACTIONAL BAUD RATE REGISTER (USART1_BRR = 0x02D9)  */
    /* ==================================================================== */
    ldr     r0, =USART1_BRR
    ldr     r1, =0x02D9                 /* N_BRR = 729 (Baud = 115,226.3 Bps) */
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 4: ENABLE TRANSMITTER, RECEIVER, AND USART PERIPHERAL (CR1)     */
    /* ==================================================================== */
    /* CR1: UE = 1 (Bit 13), TE = 1 (Bit 3), RE = 1 (Bit 2), OVER8 = 0 (16x) */
    ldr     r0, =USART1_CR1
    ldr     r1, =((1 << 13) | (1 << 3) | (1 << 2))
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size USART1_Init, .-USART1_Init
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Baud Rate Generator**: A hardware clock synthesis unit inside a UART peripheral that divides an input peripheral bus clock ($f_{\text{PCLK}}$) using 16x (or 8x) oversampling logic to generate exact, clockless bit-transmission and bit-sampling time intervals ($\text{Baud} = \frac{f_{\text{PCLK}}}{16 \times USARTDIV}$).
* **Fractional Baud Rate Register (`USART_BRR`)**: An MMIO register that encodes the fixed-point division factor $USARTDIV$ as a 12-bit integer mantissa (`DIV_Mantissa`) and a 4-bit fractional divisor (`DIV_Fraction` representing 16ths), allowing software to synthesize sub-integer clock division ratios ($N_{\text{BRR}} = \text{round}(\frac{f_{\text{PCLK}}}{\text{Baud\_Target}})$) to eliminate timing drift and achieve $< 2.5\%$ baud rate error.