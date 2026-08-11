---
title: "Hardware Timer Prescalers, Auto-Reload Buffering, and Integer Frequency Scaling"
---

# Hardware Timer Prescalers, Auto-Reload Buffering, and Integer Frequency Scaling

## The High-Frequency Clock Overflow Barrier

In bare-metal embedded systems engineering, measuring time with microsecond or millisecond precision is a fundamental requirement. An embedded application may need to generate a $1.0\text{-kHz}$ audio tone, sample a sensor every $10.0\text{ milliseconds}$, or drive a $1.0\text{-Hz}$ status indicator LED.

Modern 32-bit microcontrollers operate at high CPU clock frequencies, such as $84\text{ MHz}$ or $168\text{ MHz}$ ($168,000,000\text{ clock ticks per second}$).

To measure time, hardware microcontrollers include peripheral **General-Purpose Hardware Timers** (such as `TIM2`, `TIM3`, `TIM4`). A hardware timer contains a digital register called the **Counter Register (`CNT`)** that increments by 1 on every pulse of its input clock.

On many microcontroller architectures, these hardware counter registers are **16 bits wide**. A 16-bit digital counter can store values ranging from $0$ up to $2^{16} - 1 = 65,535_{10}$ (`0xFFFF`).

Now, examine the physical hardware failure that occurs if a 16-bit counter register (`CNT`) is connected directly to an un-divided $168\text{-MHz}$ system clock:

```text
THE 16-BIT COUNTER OVERFLOW COLLISION AT 168 MHZ

 Input Clock : 168 MHz (168,000,000 Ticks per Second)
               │
               ▼
 16-Bit Counter Register (CNT: Counts from 0 to 65,535)
 ┌───────────────────────────────────────────────────────────┐
 │ 0 -> 1 -> 2 -> ... -> 65,535 -> OVERFLOW TO 0!            │
 └───────────────────────────────────────────────────────────┘
  (Counter overflows in 389.9 Microseconds / 2,564 Overflows per Second!)
```

Let us calculate the physical time $T_{\text{overflow}}$ required for a 16-bit counter to count from $0$ to $65,535$ at $168\text{ MHz}$:

$$T_{\text{overflow}} = \frac{\text{Maximum Counts}}{\text{Clock Frequency}} = \frac{65,536\text{ Ticks}}{168,000,000\text{ Ticks/sec}}$$

$$T_{\text{overflow}} \approx 0.00038997 \text{ Seconds} = \mathbf{389.97 \text{ Microseconds!}}$$

Look at the physical impossibility:
* Connected directly to a $168\text{-MHz}$ clock, a 16-bit counter **overflows and resets back to zero every $389.97\text{ microseconds}$**!
* In one single second, the 16-bit counter overflows **$2,564\text{ times}$**!
* If a software program wants to measure a human-scale time interval—such as $1.0\text{ second}$ ($1,000,000\text{ microseconds}$)—a raw 16-bit counter **cannot hold the count value** ($168,000,000 > 65,535$)!

If the system relied on software to catch and count 2,564 counter overflow interrupts every second, the CPU would spend over $50\%$ of its instruction execution capacity servicing timer interrupts, ruining real-time responsiveness and burning energy.

How can we slow down the input clock feeding a 16-bit counter so that it can measure long time intervals (such as $1.0\text{ second}$) without overflowing?

How do we program the timer hardware to count up to an exact custom target number (such as $10,000$) and reset back to zero automatically without software intervention?

And what happens if software updates the target count limit while the timer is actively counting mid-flight? How do we prevent hardware glitches where the counter misses its target limit and counts all the way to $65,535$?

To measure long time intervals, prevent high-frequency counter overflows, and execute glitch-free frequency updates, digital hardware timers incorporate a **Prescaler Register (`PSC`)**, an **Auto-Reload Register (`ARR`)**, and **Shadow Preload Registers**.


### Mechanism 1: The Reduction Gearbox (The Prescaler `PSC`)

To slow down the spinning motion, you install a mechanical **Reduction Gearbox (The Prescaler Register `PSC`)** between the raging river and the counting gear:

* You select a reduction gear ratio of **$16,800\text{ to } 1$** ($PSC + 1 = 16,800$).
* The reduction gearbox absorbs 16,800 rushing water pulses for every **1 single tooth movement** of the counting gear!
* The counting gear's speed drops from 168,000,000 turns per second down to **exactly 10,000 turns per second ($10\text{ kHz}$)**!

```text
THE REDUCTION GEARBOX (PRESCALER PSC)

 168,000,000 River Pulses/Sec ──► [ Gearbox: / 16,800 ] ──► 10,000 Gear Ticks/Sec (10 kHz)
 (The 16-bit counting gear now turns at a smooth, manageable pace!)
```

Now, each tooth movement on the counting gear represents a precise time step of **$100\text{ microseconds}$** ($\frac{1}{10,000\text{ Hz}} = 0.0001\text{ s}$)!


### Mechanism 3: The Holding Drawer (Shadow Preload Registers & `ARPE`)

Now, consider what happens if you want to change the bell interval from $1.0\text{ second}$ ($ARR = 9,999$) to $0.5\text{ seconds}$ ($ARR = 4,999$) **while the gear is actively spinning**:

Suppose the gear is currently sitting at **Tooth 7,000**.
* You reach in and move the physical stop-gate directly to **Tooth 4,999**.
* **The Hardware Glitch**: The gear is sitting at tooth 7,000, but the gate is now behind it at tooth 4,999!
* The gear **misses the gate**! It keeps spinning up to tooth 65,535, overflows to 0, and then ticks up to 4,999!
* The bell chimed after **$6.8\text{ seconds}$** instead of $0.5\text{ seconds}$! The timing loop glitched severely!

```text
STOP-GATE MID-FLIGHT CHANGE GLITCH (UN-BUFFERED ARR)

 Gear is at Tooth 7,000 ──► You move Stop-Gate back to Tooth 4,999!
                            │
                            ▼
 Gear is past Tooth 4,999! Gear MISSED the Stop-Gate!
 Gear MUST count all the way to 65,535 -> 0 -> 4,999! (TIMING GLITCH!)
```

To prevent this glitch, the manager installs a **Holding Drawer (The Shadow Preload Register)**:
* When you write a new limit (4,999), you do **NOT** move the physical stop-gate immediately. You drop the new number into the Holding Drawer (**Preload Register**).
* The gear continues spinning safely toward its old gate at 9,999.
* The exact millisecond the gear reaches 9,999 and the bell chimes (**An Update Event `UEV`**), the holding drawer opens automatically, and the physical stop-gate moves to 4,999!
* **Zero timing glitches occur!** The timing update completes seamlessly on the next cycle!

This water wheel system is the exact physical analogue of **Hardware Timers, Prescalers, Auto-Reload Registers, and Shadow Buffering**:
* The raging river is the **Timer Input Clock ($f_{\text{timer\_clk}}$)**.
* The reduction gearbox is the **Prescaler Register (`PSC`)**.
* The main counting gear is the **Counter Register (`CNT`)**.
* The adjustable stop-gate is the **Auto-Reload Register (`ARR`)**.
* Striking the bell is the **Update Interrupt Flag (`UIF`)**.
* The holding drawer is the **Auto-Reload Preload Shadow Register (`ARPE`)**.


### 1. The Prescaler Register (`TIMx_PSC`)

The **Prescaler Register (`PSC`)** is a 16-bit MMIO register at offset `0x28`. 

It controls an internal 16-bit hardware frequency divider that divides the incoming timer clock $f_{\text{timer\_clk}}$ down to a lower counter clock frequency $f_{\text{cnt\_clk}}$:

$$\mathbf{f_{\text{cnt\_clk}} = \frac{f_{\text{timer\_clk}}}{\text{PSC} + 1}}$$

Where:
* $f_{\text{cnt\_clk}}$ is the clock frequency driving the main counter register (`CNT`) in Hertz.
* $f_{\text{timer\_clk}}$ is the input clock frequency supplying the timer peripheral in Hertz.
* $\text{PSC}$ is the 16-bit integer value written into the `TIMx_PSC` register ($0 \le \text{PSC} \le 65,535$).

```text
PRESCALER FREQUENCY DIVISION PIPELINE

 Input Clock f_timer_clk (168 MHz)
       │
       ▼
 ┌───────────────────────────────────────────────────────────┐
 │ 16-BIT PRESCALER COUNTER (Increments 0 .. PSC)           │
 │ Divides input clock by (PSC + 1)                          │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ Output Counter Clock f_cnt_clk
 ┌───────────────────────────────────────────────────────────┐
 │ MAIN COUNTER REGISTER (CNT)                               │
 │ Increments on every f_cnt_clk pulse                       │
 └───────────────────────────────────────────────────────────┘
```

#### The $+1$ Off-By-One Invariant in Prescaler Hardware
Notice the $+1$ term in the denominator:

$$\text{Division Factor} = \text{PSC} + 1$$

Why is $1$ added to $\text{PSC}$?
Because an internal 16-bit prescaler counter counts from $0$ up to $\text{PSC}$ inclusive!
* If software writes $\text{PSC} = 0$, the prescaler counts $0 \to 0$ (takes $1$ clock cycle) $\implies \mathbf{\text{Divide-by-1}}$ (No clock division!).
* If software writes $\text{PSC} = 1$, the prescaler counts $0 \to 1$ (takes $2$ clock cycles) $\implies \mathbf{\text{Divide-by-2}}$.
* If software writes $\text{PSC} = 16,799$, the prescaler divides by $16,799 + 1 = \mathbf{16,8 00}$.


### Master Timer Overflow Frequency and Period Equations

Combining the Prescaler division factor ($\text{PSC} + 1$) and the Auto-Reload step count ($\text{ARR} + 1$), we derive the **Master Timer Overflow Equations**:

#### 1. Master Timer Overflow Frequency ($f_{\text{overflow}}$):

$$\mathbf{f_{\text{overflow}} = \frac{f_{\text{timer\_clk}}}{(\text{PSC} + 1) \times (\text{ARR} + 1)}}$$

#### 2. Master Timer Overflow Period ($T_{\text{overflow}}$):

$$\mathbf{T_{\text{overflow}} = \frac{(\text{PSC} + 1) \times (\text{ARR} + 1)}{f_{\text{timer\_clk}}}}$$

Where:
* $f_{\text{overflow}}$ is the frequency at which the timer reaches $\text{ARR}$ and triggers interrupts in Hertz.
* $T_{\text{overflow}}$ is the physical time period between consecutive overflow interrupts in seconds ($T_{\text{overflow}} = \frac{1}{f_{\text{overflow}}}$).
* $f_{\text{timer\_clk}}$ is the input clock frequency supplying the timer in Hertz.
* $\text{PSC}$ is the 16-bit prescaler register value ($0 \le \text{PSC} \le 65,535$).
* $\text{ARR}$ is the auto-reload register value ($0 \le \text{ARR} \le 65,535$ for 16-bit timers).

```text
TIMER PERIOD CALCULATION PARAMETERS

 Input Timer Clock f_timer_clk = 84,000,000 Hz (84 MHz)
 Target Period T_overflow = 1.000 Second (1.0 Hz)

 Choose PSC = 8,399  => (PSC + 1) = 8,400  => f_cnt_clk = 84 MHz / 8,400 = 10,000 Hz
 Choose ARR = 9,999  => (ARR + 1) = 10,000 => T_overflow = 10,000 / 10,000 = 1.000 Sec!
```


### 4. The Event Generation Register (`TIMx_EGR.UG`)

When initializing a timer in assembly, software programs `PSC` and `ARR`. 

However, because `PSC` and `ARR` utilize shadow registers, the newly programmed prescaler and auto-reload values **do not take effect until an Update Event (`UEV`) occurs**!

If the timer is currently stopped, an Update Event will *never* occur, and the prescaler will remain un-initialized!

To force an immediate transfer of programmed values from Preload registers into Shadow registers during initial setup, software writes a $1$ to the **Update Generation Bit (`UG` — Bit 0 of `TIMx_EGR`)**:

```assembly
/* FORCING SHADOW REGISTER RELOAD DURING INITIALIZATION */
    ldr     r0, =TIM2_EGR
    movs    r1, #1              /* Set UG bit (Bit 0) */
    str     r1, [r0]            /* Forces immediate UEV: Copies PSC & ARR to Shadow! */
```

#### The Phantom Interrupt Trap of `EGR.UG = 1`:
Writing `UG = 1` forces a hardware Update Event. 

However, generating an Update Event **automatically sets the Update Interrupt Flag (`UIF = 1` in `TIMx_SR`)**!

If software enables the timer interrupt (`TIMx_DIER.UIE = 1`) before clearing `UIF`, **the CPU will trigger an immediate, false timer interrupt** before the timer even starts counting!

#### The Required Initialization Rule:
Always clear `TIMx_SR.UIF = 0` **AFTER** writing `TIMx_EGR.UG = 1`, and **BEFORE** enabling the NVIC timer interrupt!

```assembly
/* CORRECTED INITIALIZATION SEQUENCE */
    str     r1, [TIM2_EGR]      /* 1. Force shadow register reload (UG = 1) */
    
    ldr     r0, =TIM2_SR
    movs    r1, #0
    str     r1, [r0]            /* 2. CLEAR PHANTOM UIF FLAG (UIF = 0)! */
    
    ldr     r0, =TIM2_DIER
    movs    r1, #1
    str     r1, [r0]            /* 3. Enable Timer Interrupt (UIE = 1) safely! */
```


### 1. The APB Clock Multiplier Trap ($2\times$ Clock Multiplication)

A very common trap for embedded systems engineers is calculating timer prescaler values assuming the timer input clock $f_{\text{timer\_clk}}$ equals the peripheral bus clock ($PCLK1$ or $PCLK2$).

In many microcontroller architectures (such as ARM Cortex-M / STM32), the hardware incorporates an **Automatic APB Timer Clock Doubler**:

```text
THE APB CLOCK MULTIPLIER HARDWARE TRAP

 System Clock HCLK = 168 MHz
       │
       ▼ APB1 Prescaler (PPRE1 = /4)
 APB1 Peripheral Bus Clock PCLK1 = 42 MHz
       │
       ▼ APB1 Timer Clock Doubler Hardware Logic
 If PPRE1 != 1 ──► Timer Input Clock f_timer_clk = PCLK1 x 2 = 84 MHz!
                   (f_timer_clk is 84 MHz, NOT 42 MHz!)
```

#### The Clock Doubling Rule:
* If the APB prescaler is 1 ($\text{PPRE} = 1$), the timer clock equals the APB bus clock: $f_{\text{timer\_clk}} = f_{\text{PCLK}}$.
* If the APB prescaler is **NOT 1** ($\text{PPRE} \neq 1$, e.g., $\text{PPRE1} = /4$), hardware **automatically multiplies the APB clock by 2** to feed the timers!

$$\mathbf{f_{\text{timer\_clk}} = 2 \times f_{\text{PCLK1}} = 2 \times 42 \text{ MHz} = 84 \text{ MHz}}$$

If an engineer calculates prescaler values assuming $f_{\text{timer\_clk}} = 42\text{ MHz}$, **the timer will run twice as fast as expected**, generating $2.0\text{-Hz}$ interrupts instead of $1.0\text{-Hz}$ interrupts!


## Solved Industrial Engineering Exercise: Quantitative Prescaler Calculation, Shadow Register Trace, and Assembly Timer Synthesis

To consolidate your complete mastery of hardware timer prescalers, auto-reload registers, APB clock doublers, shadow preload buffering, and assembly MMIO initialization, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Prescaler Register Value (`TIM2_PSC`)

We want the counter clock frequency $f_{\text{cnt\_clk}}$ to equal $10,000\text{ Hz}$ ($10.000\text{ kHz}$).

Given input timer clock $f_{\text{timer\_clk}} = 84,000,000\text{ Hz}$:

$$f_{\text{cnt\_clk}} = \frac{f_{\text{timer\_clk}}}{\text{PSC} + 1}$$

$$10,000\text{ Hz} = \frac{84,000,000\text{ Hz}}{\text{PSC} + 1}$$

$$\text{PSC} + 1 = \frac{84,000,000}{10,000} = 8,400$$

$$\text{PSC} = 8,400 - 1 = \mathbf{8,399} = \mathbf{\text{0x0000\_20CF}}$$

##### Prescaler Result:
Writing `8,399` (`0x20CF`) into `TIM2_PSC` divides the $84\text{-MHz}$ input clock by $8,400$, producing an exact $10.000\text{-kHz}$ counter tick rate ($100\ \mu\text{s}$ per tick)!


#### Step 3: Verify Master Timer Equation

Let us verify $T_{\text{overflow}}$ using the Master Equation:

$$T_{\text{overflow}} = \frac{(\text{PSC} + 1) \times (\text{ARR} + 1)}{f_{\text{timer\_clk}}}$$

$$T_{\text{overflow}} = \frac{(8,399 + 1) \times (4,999 + 1)}{84,000,000\text{ Hz}} = \frac{8,400 \times 5,000}{84,000,000} = \frac{42,000,000}{84,000,000} = \mathbf{0.5000 \text{ Seconds (500.0 ms)!}}$$

The period is $100\%$ mathematically exact!


#### Step 5: Complete Production Assembly Startup Routine

Here is the complete, production-ready ARM Assembly configuration and ISR routine:

```assembly
/* PRODUCTION BARE-METAL TIM2 INITIALIZATION & ISR IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_APB1ENR,     0x40023840        /* APB1 Peripheral Clock Enable */
.equ TIM2_BASE,       0x40000000
.equ TIM2_CR1,        0x40000000        /* Control Register 1 */
.equ TIM2_DIER,       0x4000000C        /* DMA/Interrupt Enable Register */
.equ TIM2_SR,         0x40000010        /* Status Register */
.equ TIM2_EGR,        0x40000014        /* Event Generation Register */
.equ TIM2_CNT,        0x40000024        /* Counter Register */
.equ TIM2_PSC,        0x40000028        /* Prescaler Register */
.equ TIM2_ARR,        0x4000002C        /* Auto-Reload Register */

.equ NVIC_ISER0,      0xE000E100        /* NVIC Interrupt Set-Enable Reg 0 */

.global TIM2_Init
.type TIM2_Init, %function

.section .text
.thumb_func
TIM2_Init:
    push    {r4, lr}

    /* Step 1: Enable TIM2 Peripheral Clock in RCC (APB1ENR Bit 0) */
    ldr     r0, =RCC_APB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set Bit 0 (TIM2EN = 1) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* Step 2: Stop TIM2 Counter during configuration */
    ldr     r0, =TIM2_CR1
    movs    r1, #0
    str     r1, [r0]                    /* CR1 = 0 */

    /* Step 3: Program Prescaler (PSC = 8,399 -> Divide 84 MHz to 10 kHz) */
    ldr     r0, =TIM2_PSC
    ldr     r1, =8399
    str     r1, [r0]

    /* Step 4: Program Auto-Reload Register (ARR = 4,999 -> 500 ms Period) */
    ldr     r0, =TIM2_ARR
    ldr     r1, =4999
    str     r1, [r0]

    /* Step 5: Enable Preload Buffering (ARPE = 1 in TIM2_CR1) */
    ldr     r0, =TIM2_CR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 7)           /* Set Bit 7 (ARPE = 1) */
    str     r1, [r0]

    /* Step 6: Force Shadow Register Reload (EGR.UG = 1) */
    ldr     r0, =TIM2_EGR
    movs    r1, #1                      /* Set Bit 0 (UG = 1) */
    str     r1, [r0]

    /* Step 7: CLEAR PHANTOM UIF FLAG IN TIM2_SR (UIF = 0) */
    ldr     r0, =TIM2_SR
    movs    r1, #0                      /* Write 0 to clear UIF flag */
    str     r1, [r0]

    /* Step 8: Enable Update Interrupt in TIM2_DIER (UIE = 1) */
    ldr     r0, =TIM2_DIER
    movs    r1, #1                      /* Set Bit 0 (UIE = 1) */
    str     r1, [r0]

    /* Step 9: Enable TIM2 IRQ 28 in NVIC (NVIC_ISER0 Bit 28) */
    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 28)              /* Set Bit 28 (TIM2 IRQn) */
    str     r1, [r0]

    /* Step 10: Start TIM2 Counter (CEN = 1 in TIM2_CR1) */
    ldr     r0, =TIM2_CR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set Bit 0 (CEN = 1) */
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size TIM2_Init, .-TIM2_Init


/* PRODUCTION TIM2 INTERRUPT SERVICE ROUTINE */
.global TIM2_IRQHandler
.type TIM2_IRQHandler, %function
.thumb_func
TIM2_IRQHandler:
    /* Step 1: CLEAR TIM2 UPDATE INTERRUPT FLAG (TIM2_SR.UIF = 0) */
    ldr     r0, =TIM2_SR
    movs    r1, #0                      /* Write 0 to clear UIF */
    str     r1, [r0]

    /* Step 2: Execute Memory Barrier to ensure clear completes */
    dsb

    /* Step 3: Execute 500-ms Periodic Application Task */
    /* (e.g., toggle heartbeat LED or increment tick counter) */

    bx      lr                          /* Exception return */
.size TIM2_IRQHandler, .-TIM2_IRQHandler
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Timer Prescaler Register (`TIMx_PSC`)**: A 16-bit MMIO register that divides the input timer clock frequency ($f_{\text{timer\_clk}}$) by an integer factor $\text{PSC} + 1$, slowing down the tick rate of the hardware counter ($f_{\text{cnt\_clk}} = \frac{f_{\text{timer\_clk}}}{\text{PSC} + 1}$) to prevent high-frequency counter overflows.
* **Auto-Reload Register (`TIMx_ARR`)**: An MMIO register that defines the maximum up-count limit $N_{\text{target}}$. When `CNT` reaches $\text{ARR}$, the hardware sets the Update Interrupt Flag (`UIF`), auto-reloads `CNT` back to $0$ on the next clock tick, and generates an Update Event (`UEV`) with period $T_{\text{overflow}} = \frac{(\text{PSC} + 1)(\text{ARR} + 1)}{f_{\text{timer\_clk}}}$.
* **Shadow Preload Buffering (`ARPE`)**: A dual-register hardware architecture (Preload Register + Shadow Register) controlled by bit `ARPE` in `TIMx_CR1` that defers software `ARR` updates until the next hardware Update Event (`UEV`), preventing timing glitches when modifying timer periods mid-flight.