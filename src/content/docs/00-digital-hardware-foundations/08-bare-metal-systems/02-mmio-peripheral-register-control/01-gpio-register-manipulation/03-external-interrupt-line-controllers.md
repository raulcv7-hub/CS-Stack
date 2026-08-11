---
title: "External Interrupt Controller Architecture, Edge-Trigger Detection, and Pending Flag Latching"
---

# External Interrupt Controller Architecture, Edge-Trigger Detection, and Pending Flag Latching

## The Asynchronous Transient Pulse Miss and the Polling Capacity Limit

In bare-metal embedded systems engineering, a central processing unit (CPU) executes software instructions sequentially. The CPU pipeline reads instructions from non-volatile Flash memory, processes arithmetic operations in its register file, and modifies memory-mapped registers.

However, external physical events occurring in the real world do not synchronize themselves with the CPU's clock cycles. 

A mechanical push-button is pressed by a human user, an optical sensor detects a passing item on a high-speed factory conveyor belt, or an external sensor chip pulls an active-low error line to Ground. These physical events manifest as **Asynchronous Voltage Transitions** on physical General Purpose Input/Output (GPIO) package pins.

If an assembly program attempts to detect these external voltage changes by continuously reading the GPIO Input Data Register (`GPIOA_IDR`) inside a main software execution loop (**Software Polling I/O**), two severe hardware failure modes occur:

1. **Missed High-Speed Transient Pulses**: Suppose an optical sensor on a conveyor belt detects a fast-moving object, generating a brief digital voltage pulse that stays High ($3.3\text{ Volts}$) for only **$50\text{ nanoseconds}$** before returning to Low ($0.0\text{ Volts}$). 

If the CPU's main polling loop takes $2.0\text{ microseconds}$ ($2,000\text{ nanoseconds}$) to complete one full iteration:
* The $50\text{-ns}$ pulse rises and falls completely **between two consecutive reads** of `GPIOA_IDR`!
* When the CPU reads `GPIOA_IDR`, the pin voltage has already returned to $0.0\text{V}$.
* The short physical event is **completely lost and un-detected by software**, causing factory line errors or missed data!

```text
MISSED HIGH-SPEED TRANSIENT PULSE IN SOFTWARE POLLING

 Physical Pin Voltage (50-ns Transient Pulse)
  3.3V ┼────┌────┐
       │    │    │ (Pulse lasts 50 ns!)
  0.0V ┴────┘    └──────────────────────────────────────────────
            ▲    ▲
            │    │ (Pulse rises and falls between polling reads!)
 Polling    │    │
 Read 1 ────*    │ (Read 1 sees 0.0V)
 Polling         │
 Read 2 ─────────* (Read 2 sees 0.0V -> 50-ns PULSE IS LOST FOREVER!)
```

2. **GPIO Input Registers Lack Edge-Detection and Latching Logic**: A standard GPIO Input Data Register (`IDR`) is a simple, un-latched digital buffer. It reflects **only the instantaneous voltage state** currently present on the physical pad. 

`IDR` cannot detect whether a voltage *changed* from $0 \to 1$ (Rising Edge) or $1 \to 0$ (Falling Edge), nor can it hold or memorize a past voltage transition. Furthermore, a GPIO input buffer has no physical wiring to trigger a hardware Interrupt Request ($IRQ$) line to the CPU core.

To catch high-speed asynchronous pulses, detect precise voltage edges ($\frac{dV}{dt}$), and wake or interrupt the CPU execution pipeline in real time, bare-metal hardware architectures employ a dedicated **External Interrupt Controller (`EXTI`)**, an **Edge-Trigger Detector**, and **Pending Flag Latching Logic**.


### Strategy 1: The Polling Watchman (Software Polling I/O)

The bank hires a security guard (**The CPU Execution Pipeline**) who sits at a desk. Every 10 seconds, the guard stands up, walks to the window, looks at the door (**Reads `GPIOA_IDR`**), and walks back to their desk.

* **The Failure**: A fast intruder opens the door, steps inside, and closes the door in 2 seconds (**50-ns Transient Pulse**). 
* When the guard looks out the window 8 seconds later, the door is closed! The guard assumes everything is safe, while the intruder is inside the vault!
* Furthermore, the guard spends $100\%$ of their workday walking back and forth to the window, unable to perform any administrative paperwork (**$100\%$ CPU Utilization Wasted**).


### Strategy 3: The Multi-Door Switchboard (`SYSCFG_EXTICR`)

Suppose the bank has 4 exterior doors on the ground floor: Door A0, Door B0, Door C0, and Door D0.

The alarm system has **only 1 Siren Line for Channel 0 (`EXTI0`)**.

To select which physical door is monitored, the manager installs a **4-Position Rotary Switchboard (`SYSCFG_EXTICR1`)**:
* Setting the switch to Position 0 connects Channel 0 (`EXTI0`) to Door A0 (`PA0`).
* Setting the switch to Position 1 connects Channel 0 (`EXTI0`) to Door B0 (`PB0`).

```text
4-POSITION ROTARY SWITCHBOARD (SYSCFG_EXTICR)

 Door PA0 ──[00]─┐
 Door PB0 ──[01]─┤
 Door PC0 ──[10]─┼─►[ Rotary Switch ]──► EXTI Line 0 (EXTI0)
 Door PD0 ──[11]─┘      ▲
                        │ (Position Select: SYSCFG_EXTICR1)
```

This laser tripwire system is the exact physical analogue of **The External Interrupt Controller (`EXTI`)**:
* The vault door is a **Physical Package Pin (`PA0`)**.
* The laser beam breaking is a **Voltage Edge Transition ($\frac{dV}{dt}$)**.
* The optical edge sensor is the **Edge-Trigger Detector (`RTSR`/`FTSR`)**.
* The latching alarm bell is the **Pending Register (`EXTI_PR`)**.
* The manual reset button is **Write-1-to-Clear (`W1C`) Pending Bit Clearing**.
* The 4-position rotary switchboard is the **System Configuration Multiplexer (`SYSCFG_EXTICR`)**.


### 1. The Pin Multiplexer (`SYSCFG_EXTICR1` .. `SYSCFG_EXTICR4`)

Because physical pins across different GPIO ports share the same pin index number (e.g., `PA0`, `PB0`, `PC0`, `PD0` all share index 0), they **cannot all trigger $EXTI_0$ simultaneously**.

The System Configuration Controller (**`SYSCFG`**) provides four 32-bit multiplexer registers (**`SYSCFG_EXTICR1` through `SYSCFG_EXTICR4`**) at base address `0x4001_3800` that route specific GPIO ports to the corresponding `EXTI` line:

```text
SYSCFG_EXTICR1 REGISTER BITFIELD MAP (OFFSET 0x08)

 Bits [15:12]             Bits [11:8]              Bits [7:4]               Bits [3:0]
 ┌────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────┐
 │ EXTI3 Pin Select (4b)  │ EXTI2 Pin Select (4b)  │ EXTI1 Pin Select (4b)  │ EXTI0 Pin Select (4b)  │
 └────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────┘
```

Each 4-bit field selects which GPIO port drives that specific `EXTI` line:

$$\text{Port Selection Code: } \quad 0000_2 = \text{Port A}, \quad 0001_2 = \text{Port B}, \quad 0010_2 = \text{Port C}, \quad 0011_2 = \text{Port D}$$

#### Example Mapping Calculation:
To route physical pin `PB0` (Pin 0 of Port B) to $EXTI_0$:
1. $EXTI_0$ is controlled by bits $[3:0]$ of `SYSCFG_EXTICR1`.
2. Port B corresponds to selection code `0001_2` (`0x1`).
3. Write `0x1` into bits $[3:0]$ of `SYSCFG_EXTICR1`. The hardware multiplexer connects physical pad `PB0` directly to $EXTI_0$'s edge detector!


### 3. Pending Register Latching and Write-1-to-Clear (`W1C`) Mechanics

When the edge-trigger detector outputs a 1-cycle $\text{Trigger}_k$ pulse, the pulse enters the **Pending Register (`EXTI_PR`)** at offset `0x14`.

The `EXTI_PR` register consists of 23 independent **SR Latch Flip-Flops**.

```text
EXTI_PR LATCH CIRCUIT AND WRITE-1-TO-CLEAR (W1C) LOGIC

 Edge Trigger Pulse ──► [ SET Input ] ──┐
                                        ▼
                                ┌───────────────┐
                                │ SR Latch      ├─► EXTI_PR Bit k = 1 (Rings Bell!)
                                └───────▲───────┘
                                        │
 Data Bus Write Bit k = 1 ──────────────┘ [ RESET Input ] (W1C Action!)
 (Writing 1 resets Latch to 0! Writing 0 does nothing!)
```

#### How the Pending Latch Operates:
1. When $\text{Trigger}_k = 1$ fires, it hits the SET input of the SR latch.
2. Bit $k$ of `EXTI_PR` flips to $1$ ($\text{EXTI\_PR}_k \Leftarrow 1$).
3. Even if the external pin voltage drops to zero $1\text{ nanosecond}$ later, **$\text{EXTI\_PR}_k$ REMAINS LOCKED AT $1$**! The event is memorized safely in hardware.


### 4. Interrupt Masking vs. Event Masking (`IMR` / `EMR`)

Once $\text{EXTI\_PR}_k = 1$ is latched, the pending signal splits into two independent hardware paths controlled by two mask registers:

```text
EXTI SIGNAL PATH SPLITTING (IMR VS EMR)

                       ┌──► [ AND Gate ] ──► [ EXTI_IMR Bit k ] ──► NVIC IRQ Line (Trigger ISR)
 EXTI_PR Bit k = 1 ────┤
                       └──► [ AND Gate ] ──► [ EXTI_EMR Bit k ] ──► Event Pulse Line (Wake WFE)
```

#### A. Interrupt Mask Register (`EXTI_IMR` — Offset `0x00`)
* If $\text{EXTI\_IMR}_k = 1$, the pending signal passes through the AND gate to the core CPU's Nested Vectored Interrupt Controller (NVIC).
* The NVIC executes standard interrupt processing, context stacking, and jumps to the $ISR$ handler.

#### B. Event Mask Register (`EXTI_EMR` — Offset `0x04`)
* If $\text{EXTI\_EMR}_k = 1$, the pending signal bypasses the NVIC and drives a 1-cycle **Hardware Event Pulse** directly to the CPU core execution unit.
* **The `WFE` Wakeup Mechanism**: If the CPU is currently sleeping in a low-power **Wait For Event (`WFE`)** state, the Event Pulse **wakes the CPU core instantly WITHOUT executing an $ISR$ function or stacking registers**!
* Software resumes execution at the instruction immediately following `WFE` with zero context-switching overhead!


### 1. Mechanical Switch Contact Bouncing (The Glitch Flood)

When a human user presses a physical tactile push-button, the metal contacts inside the switch do **not** make a clean, instantaneous transition from $3.3\text{V}$ to $0.0\text{V}$.

On a microscopic time scale ($100\ \mu\text{s} \text{ to } 5\text{ ms}$), the physical metal contacts bounce against each other multiple times before settling, generating a rapid stream of **10 to 50 false edge transitions**!

```text
MECHANICAL SWITCH CONTACT BOUNCING WAVEFORM

 Button Pressed
 Voltage 3.3V ──┐  ┌─┐  ┌──┐  ┌─┐
                │  │ │  │  │  │ │
         0.0V   └──┘ └──┘  └──┘ └─── [ Settles at 0.0V after 2 ms ]
                ◄── 2 ms Bouncing Window ──►
                (Triggers 20 False EXTI Interrupts in 2 milliseconds!)
```

#### The Hardware Failure:
If $EXTI_0$ is configured for falling edge detection on a mechanical button pin, the $EXTI$ controller detects every single bounce micro-edge, triggering **20 consecutive $ISR$ executions in 2 milliseconds**! 

The CPU burns $100\%$ of its time executing redundant button $ISRs$.

#### The Engineering Fix: Software Debounce Filtering in Assembly
To defeat mechanical contact bounce, the $ISR$ must disable the $EXTI$ line, start a hardware timer ($20\text{ ms}$ debounce window), and verify that the pin voltage remains stable before re-enabling the interrupt:

```assembly
/* ASSEMBLY DEBOUNCE FILTERING STRATEGY INSIDE ISR */
EXTI0_IRQHandler:
    /* 1. Mask EXTI0 interrupt immediately to block bounce glitches */
    ldr     r0, =EXTI_IMR
    ldr     r1, [r0]
    bic     r1, r1, #(1 << 0)           /* Clear Bit 0 (Mask EXTI0) */
    str     r1, [r0]

    /* 2. Clear pending bit */
    ldr     r2, =EXTI_PR
    movs    r3, #(1 << 0)
    str     r3, [r2]                    /* Write 1 to clear PR0 */
    dsb

    /* 3. Start a 20-ms Timer to re-enable EXTI0 after bouncing stops! */
    ldr     r4, =TIM2_CR1
    movs    r5, #1                      /* Enable TIM2 */
    str     r5, [r4]

    bx      lr                          /* Exit ISR safely! */
```


### 3. Memory Barrier (`DSB`) Requirement During Pending Bit Clearing

On processors with out-of-order execution or write-buffering bus matrices (such as ARM Cortex-M4 / Cortex-M7):

When software executes `str r3, [EXTI_PR]` to clear the pending bit, the write payload enters an internal **Write Buffer**.

If the assembly code immediately executes `bx lr` (exception return) before the write buffer flushes to the physical `EXTI_PR` register in memory:
1. The CPU executes `bx lr` and un-stacks registers.
2. On the very next clock cycle, the NVIC checks `EXTI_PR`.
3. Because the write buffer has not flushed to memory yet, `EXTI_PR` **still reads $1$**!
4. The NVIC incorrectly re-triggers the exact same $ISR$ again!

#### The Hardware Fix:
Always insert a **Data Synchronization Barrier (`DSB`)** instruction immediately after writing to `EXTI_PR`:

```assembly
    str     r3, [EXTI_PR]               /* Clear pending bit */
    dsb                                 /* Force write buffer to commit to memory! */
    bx      lr                          /* Exit ISR safely */
```


### Scenario and Parameters

You are a senior bare-metal systems architect configuring an external security sensor line for an enterprise $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER EXTI CONFIGURATION

 Physical Security Sensor Input:
 ┌─────────────────────────────────────────────────────────────┐
 │ Physical Pin PB3 (Pin 3 of Port B)                          │
 │ Sensor Voltage: Normally HIGH (3.3V)                        │
 │ Alarm Event   : Voltage Drops to LOW (0.0V) -> FALLING EDGE!│
 └─────────────────────────────────────────────────────────────┘
  MMIO Base Addresses:
  SYSCFG Base : 0x4001_3800  (SYSCFG_EXTICR1 @ Offset 0x08)
  EXTI Base   : 0x4001_3C00  (IMR @ 0x00, FTSR @ 0x0C, PR @ 0x14)
  NVIC IRQ    : External Interrupt 9 (EXTI3_IRQn) @ Vector Slot 25
```

#### Functional Requirements:
1. **Pin Selection**: Map physical pin **`PB3`** (Pin 3 of Port B) to $EXTI_3$ using `SYSCFG_EXTICR1`.
2. **Edge Trigger Selection**: Configure $EXTI_3$ to detect **Falling Edges ONLY** ($1 \to 0$ voltage drops). Disable rising edge detection.
3. **Interrupt Un-masking**: Enable $EXTI_3$ in `EXTI_IMR` and enable $IRQ_9$ in the NVIC (`NVIC_ISER0` bit 9).
4. **Assembly ISR Handler (`EXTI3_IRQHandler`)**:
   * Clear $EXTI_3$'s pending bit in `EXTI_PR` using Write-1-to-Clear (`W1C`) mechanics.
   * Execute a Data Synchronization Barrier (`DSB`).
   * Toggle an alarm status flag in RAM.

#### Your Objective

1. Calculate the exact 32-bit hexadecimal value to be written into `RCC_APB2ENR` to enable the `SYSCFG` clock gate (Bit 14).
2. Calculate the exact 32-bit hexadecimal bitmask to be written into `SYSCFG_EXTICR1` to map `PB3` to $EXTI_3$.
3. Calculate the bitmask values for `EXTI_FTSR`, `EXTI_RTSR`, and `EXTI_IMR` for line $EXTI_3$.
4. Calculate the exact physical memory address inside the Vector Table (`VTOR = 0x0800_0000`) that holds the function pointer for $EXTI_3$ ($IRQ_9$).
5. Write the complete, production-ready ARM Assembly configuration routine and `EXTI3_IRQHandler` assembly handler.
6. Verify mathematical, structural, and logical correctness.


#### Step 2: Configure EXTI Trigger and Mask Registers

For line $EXTI_3$ (Bit 3):

1. **Falling Trigger Register (`EXTI_FTSR` — Offset `0x0C`)**:
   Enable falling edge detection for bit 3:
   $$\text{FTSR Bitmask} = (1 \ll 3) = \mathbf{\text{0x0000\_0008}}$$

2. **Rising Trigger Register (`EXTI_RTSR` — Offset `0x08`)**:
   Disable rising edge detection for bit 3:
   $$\text{RTSR Clear Mask} = \sim(1 \ll 3) = \mathbf{\text{0xFFFF\_FFF7}}$$

3. **Interrupt Mask Register (`EXTI_IMR` — Offset `0x00`)**:
   Unmask interrupt line 3:
   $$\text{IMR Bitmask} = (1 \ll 3) = \mathbf{\text{0x0000\_0008}}$$


#### Step 4: Write Production Assembly Setup and ISR Routines

Here is the complete, production-ready ARM Assembly code for configuring $EXTI_3$ and servicing the interrupt:

```assembly
/* PRODUCTION BARE-METAL EXTI3 CONFIGURATION AND ISR IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Peripheral Clock Enable */
.equ SYSCFG_EXTICR1,  0x40013808        /* SYSCFG EXTI Configuration Reg 1 */

.equ EXTI_BASE,       0x40013C00
.equ EXTI_IMR,        0x40013C00        /* Interrupt Mask Register */
.equ EXTI_RTSR,       0x40013C08        /* Rising Trigger Selection Reg */
.equ EXTI_FTSR,       0x40013C0C        /* Falling Trigger Selection Reg */
.equ EXTI_PR,         0x40013C14        /* Pending Register (W1C) */

.equ NVIC_ISER0,      0xE000E100        /* NVIC Interrupt Set-Enable Reg 0 */

.global EXTI3_Config
.type EXTI3_Config, %function

.section .text
.thumb_func
EXTI3_Config:
    push    {r4, r5, lr}

    /* Step 1: Enable SYSCFG Peripheral Clock in RCC (Bit 14) */
    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 14)          /* Set Bit 14 (SYSCFGEN = 1) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* Step 2: Map PB3 to EXTI3 in SYSCFG_EXTICR1 (Bits [15:12] = 0x1) */
    ldr     r0, =SYSCFG_EXTICR1
    ldr     r1, [r0]
    ldr     r2, =0xFFFF0FFF             /* Clear mask for bits [15:12] */
    and     r1, r1, r2
    orr     r1, r1, #(0x1 << 12)        /* Insert 0x1 (Port B) into EXTI3 field */
    str     r1, [r0]

    /* Step 3: Configure EXTI3 for Falling Edge Trigger ONLY */
    /* Enable Falling Edge in FTSR */
    ldr     r0, =EXTI_FTSR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 3)           /* Set Bit 3 (FTSR3 = 1) */
    str     r1, [r0]

    /* Disable Rising Edge in RTSR */
    ldr     r0, =EXTI_RTSR
    ldr     r1, [r0]
    bic     r1, r1, #(1 << 3)           /* Clear Bit 3 (RTSR3 = 0) */
    str     r1, [r0]

    /* Step 4: Unmask EXTI3 Line in EXTI_IMR */
    ldr     r0, =EXTI_IMR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 3)           /* Set Bit 3 (MR3 = 1) */
    str     r1, [r0]

    /* Step 5: Enable IRQ 9 in NVIC (NVIC_ISER0 Bit 9) */
    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 9)               /* Enable IRQ 9 (EXTI3_IRQn) */
    str     r1, [r0]
    dsb

    pop     {r4, r5, pc}
.size EXTI3_Config, .-EXTI3_Config


/* PRODUCTION ASSEMBLY INTERRUPT SERVICE ROUTINE (EXTI3_IRQHandler) */
.global EXTI3_IRQHandler
.type EXTI3_IRQHandler, %function
.thumb_func
EXTI3_IRQHandler:
    /* Step 1: CLEAR PENDING BIT IN EXTI_PR USING WRITE-1-TO-CLEAR (W1C) */
    ldr     r0, =EXTI_PR
    movs    r1, #(1 << 3)               /* Bitmask: Write 1 to Bit 3 */
    str     r1, [r0]                    /* W1C Action: Clears PR3 Latch! */

    /* Step 2: DATA SYNCHRONIZATION BARRIER (Flushes bus write buffer!) */
    dsb

    /* Step 3: Execute Security Alarm Action (e.g., set alarm flag in RAM) */
    ldr     r2, =0x20000000             /* SRAM Flag Address */
    movs    r3, #1                      /* Alarm Active Code */
    str     r3, [r2]

    /* Step 4: EXCEPTION RETURN */
    bx      lr
.size EXTI3_IRQHandler, .-EXTI3_IRQHandler
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **External Interrupt Controller (`EXTI`)**: A hardware peripheral containing multiplexer routing (`SYSCFG_EXTICR`), edge-trigger detectors (`RTSR`/`FTSR`), mask registers (`IMR`/`EMR`), and pending status latches (`PR`) that maps physical GPIO pin edge transitions to core CPU $IRQ$ lines.
* **Edge-Trigger Detector**: A digital logic circuit comparing current ($\text{Pin}_t$) and previous ($\text{Pin}_{t-1}$) pin voltage states that generates a 1-cycle trigger pulse only during voltage transitions ($\frac{dV}{dt}$), catching high-speed $50\text{-ns}$ transient events that software polling loops miss.
* **Pending Bit Clearing (`W1C`)**: The hardware mechanism where writing a logical `1` to a bit in the `EXTI_PR` register resets the internal SR latch, clearing the pending flag to prevent infinite ISR re-triggering loops without altering other active pending bits.