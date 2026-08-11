content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/02-mmio-peripheral-register-control/02-hardware-timer-counter-subsystems/02-hardware-timer-prescaler-counter.md
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

---

## The Water Wheel Gearbox and the Adjustable Gate: A Mental Model for Hardware Timers

To build an intuitive, crystal-clear mental model of prescalers, auto-reload registers, counter overflows, and shadow buffering before inspecting memory-mapped registers and assembly equations, let us consider an everyday analogy: **A Raging River Water Wheel**.

Imagine a raging mountain river (**High-Frequency System Clock $f_{\text{timer\_clk}}$**) flowing at a speed of 168 million water pulses per second ($168\text{ MHz}$).

```text
THE RAGING RIVER WATER WHEEL METAPHOR

 Raging River (168 MHz Input Clock)               Main Counting Gear (16-Bit CNT)
 ┌───────────────────────────┐                    ┌───────────────────────────┐
 │ 168,000,000 Pulses / Sec  │                    │ 65,536 Teeth Capacity     │
 └─────────────┬─────────────┘                    └─────────────▲─────────────┘
               │                                                │
               ▼ Rushing Water                                  │
 ┌──────────────────────────────────────────────────────────────┴─────────────┐
 │ REDUCTION GEARBOX (Prescaler PSC: Divide-by-16,800)                      │
 │ Slows rotation so Main Gear turns at 10,000 Teeth / Sec (10 kHz)          │
 └────────────────────────────────────────────────────────────────────────────┘
```

You need to measure a time interval of $1.0\text{ second}$ to trigger a church bell chime (**Update Interrupt Flag / `UIF`**).

You place a small counting gear (**16-Bit Counter Register `CNT`**) with 65,536 teeth in the water.

If you connect the counting gear directly to the raging river:
* The gear spins out of control, completing 2,564 full revolutions every second!
* The gear moves far too fast to measure $1.0\text{ second}$!

Let us observe how we install two mechanical mechanisms to control the gear:

---

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

---

### Mechanism 2: The Adjustable Stop-Gate (The Auto-Reload Register `ARR`)

Now, the counting gear is ticking smoothly at 10,000 teeth per second.

You want a bell to chime after **$1.0\text{ second}$** ($10,000\text{ teeth}$).

If you let the counting gear spin through all 65,536 teeth before chiming:
* The bell will chime after $6.5536\text{ seconds}$ ($\frac{65,536}{10,000\text{ Hz}}$). That is too long!

To make the bell chime after exactly 10,000 teeth ($1.0\text{ second}$), you place an **Adjustable Stop-Gate (The Auto-Reload Register `ARR`)** at tooth number **9,999**:

```text
THE ADJUSTABLE STOP-GATE (AUTO-RELOAD REGISTER ARR)

 Gear ticks: 0 -> 1 -> 2 -> ... -> 9,998 -> 9,999 (Hits Stop-Gate!)
                                               │
                                               ▼
 1. Mechanical Bell Chimes! (Update Interrupt Flag UIF = 1)
 2. Spring INSTANTLY resets gear back to Tooth 0! (Auto-Reload)
 3. Gear continues ticking 0 -> 1 -> 2... (Repeats 1.0-second cycle!)
```

1. The gear ticks from $0 \to 1 \to 2 \dots \to 9,999$ (which represents **$10,000\text{ total steps}$** counting 0).
2. The exact instant the gear touches tooth 9,999 (the stop-gate):
   * A mechanical hammer strikes a bell (**Sets `UIF = 1` / Triggers Timer Interrupt**).
   * A spring instantly snaps the gear back to **Tooth 0** in zero time (**Auto-Reload**).
3. The gear begins counting up again from $0 \to 9,999$.

The bell chimes once every **$1.000\text{ second}$** with $100\%$ mathematical perfection!

---

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

---

## Deep Mechanics of PSC, ARR, CNT, and EGR Registers

Now that we possess an intuitive mental model of reduction gearboxes, stop-gates, and holding drawers, let us examine the formal, rigorous engineering mechanics of **Hardware Timer Counter Subsystems**.

A General-Purpose Hardware Timer (such as `TIM2` or `TIM3`) is an autonomous digital state machine managed by a bank of Memory-Mapped I/O (MMIO) registers located at a dedicated base address (such as `TIM2_BASE = 0x4000_0000`):

```text
TIM2 MMIO REGISTER MAP (BASE: 0x4000_0000)

 Byte Offset │ Register Name │ Width   │ Primary Hardware Function
─────────────┼───────────────┼─────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ TIM2_CR1      │ 16 Bits │ Control Register 1 (Counter Enable, ARPE, DIR Mode)
  Offset 0x0C│ TIM2_DIER     │ 16 Bits │ DMA / Interrupt Enable Register (UIE Bit)
  Offset 0x10│ TIM2_SR       │ 16 Bits │ Status Register (UIF Update Interrupt Flag)
  Offset 0x14│ TIM2_EGR      │ 16 Bits │ Event Generation Register (UG Update Generation Bit)
  Offset 0x24│ TIM2_CNT      │ 16/32b  │ Counter Register (Active counting value)
  Offset 0x28│ TIM2_PSC      │ 16 Bits │ Prescaler Register (Clock division factor PSC)
  Offset 0x2C│ TIM2_ARR      │ 16/32b  │ Auto-Reload Register (Target count limit)
```

---

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

---

### 2. The Auto-Reload Register (`TIMx_ARR`) and Counter (`TIMx_CNT`)

The **Counter Register (`CNT`)** at offset `0x24` is the active up-counter. On every pulse of $f_{\text{cnt\_clk}}$, `CNT` increments by 1.

The **Auto-Reload Register (`ARR`)** at offset `0x2C` stores the target count limit $N_{\text{target}}$.

#### The Up-Counting Loop Sequence:
1. `CNT` starts counting at $0$.
2. On every tick of $f_{\text{cnt\_clk}}$, `CNT` increments: $0 \to 1 \to 2 \dots \to \text{ARR}$.
3. When `CNT` reaches $\text{ARR}$:
   * On the next clock tick, hardware sets the **Update Interrupt Flag (`UIF` = Bit 0 of `TIMx_SR`)** to $1$.
   * Hardware automatically resets $\text{CNT} \Leftarrow 0$ (**Auto-Reload**).
   * Hardware generates an **Update Event (`UEV`)**.

```text
UP-COUNTING SEQUENCE WITH AUTO-RELOAD

 Clock Ticks: ───[ 0 ]───►[ 1 ]───► ... ───►[ ARR-1 ]───►[ ARR ]───┐
                                                            │
                                                            ▼ (UIF = 1 & UEV Event!)
 Clock Ticks: ───[ 0 ]◄─────────────────────────────────────┘
              (CNT resets to 0 automatically on next tick!)
```

#### The $+1$ Off-By-One Invariant in Auto-Reload Math
Notice that counting from $0$ up to $\text{ARR}$ inclusive requires **$\text{ARR} + 1$ total counter steps**:

$$\text{Total Steps per Overflow Cycle} = \text{ARR} + 1$$

* If software writes $\text{ARR} = 9,999$, the counter ticks through $0, 1, 2 \dots 9,999$, executing **$10,000\text{ total steps}$**!

---

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

---

### 3. Shadow Registers and Preload Buffering (`TIMx_CR1.ARPE`)

In advanced digital timers, the Auto-Reload Register (`ARR`) is actually composed of **two physical registers in silicon**:

1. **The Preload Register (Software-Accessible MMIO Register)**: The address `0x4000_002C` written by CPU software instructions.
2. **The Shadow Register (Hardware Execution Register)**: The actual physical comparator register used by the digital counting logic to compare against `CNT`.

```text
SHADOW REGISTER PRELOAD BUFFERING ARCHITECTURE

 CPU Assembly Write: STR r1, [TIM2_ARR]
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ PRELOAD REGISTER (Software Memory-Mapped Register)        │
 └─────────────┬─────────────────────────────────────────────┘
               │
               │ Transfer deferred until Update Event (UEV)!
               ▼ (Controlled by ARPE Bit in TIMx_CR1)
 ┌───────────────────────────────────────────────────────────┐
 │ SHADOW REGISTER (Hardware Execution Comparator)          │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ Compared against CNT on every tick
 ┌───────────────────────────────────────────────────────────┐
 │ COUNTER REGISTER (CNT)                                    │
 └───────────────────────────────────────────────────────────┘
```

#### The Auto-Reload Preload Enable Bit (`ARPE` — Bit 7 of `TIMx_CR1`)

The transfer of data from the Preload Register to the Shadow Register is controlled by the **`ARPE` bit**:

* **`ARPE = 0` (Preload Disabled — Un-buffered Mode)**:
  When software writes a new value to `TIMx_ARR`, the value is written **immediately into both the Preload AND Shadow registers**.
  * *Hazard*: If `CNT` has already passed the new `ARR` value (e.g., `CNT = 7000`, new `ARR = 4000`), `CNT` misses the match, counts all the way up to $65,535$, overflows to $0$, and then counts up to $4,000$—causing a severe timing glitch!

* **`ARPE = 1` (Preload Enabled — Shadow Buffered Mode)**:
  When software writes a new value to `TIMx_ARR`, the value is written **ONLY into the Preload Register**.
  * The active Shadow Register continues holding the old `ARR` limit!
  * **Glitch-Free Transfer**: On the next hardware **Update Event (`UEV`)** (when `CNT` reaches the old `ARR` limit and resets to 0), the hardware automatically copies the new value from the Preload Register into the Shadow Register!
  * Timing updates transition seamlessly on exact period boundaries without glitches!

```text
UN-BUFFERED VS SHADOW-BUFFERED ARR UPDATE TIMING

 Un-Buffered Mode (ARPE = 0 — Glitch Hazard!):
 CNT = 7000 ──► Software writes ARR = 4000 ──► CNT misses 4000!
                CNT counts 7000 -> 65,535 -> 0 -> 4000! (MASSIVE DELAY GLITCH!)

 Shadow-Buffered Mode (ARPE = 1 — Glitch-Free!):
 CNT = 7000 ──► Software writes Preload = 4000 ──► Shadow ARR remains 9999!
                CNT counts 7000 -> 9999 (UEV Event!) -> Preload copies to Shadow!
                CNT resets to 0 -> counts 0 -> 4000! (100% GLITCH-FREE!)
```

---

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

---

## Real-World Silicon Realities: The APB Clock Multiplier Trap and Pulse Alignment

In commercial System-on-Chip design, configuring hardware timers requires understanding physical bus clock multipliers and counting alignment modes.

---

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

---

### 2. Up-Counting vs. Down-Counting vs. Center-Aligned Counting Modes

Digital hardware timers can be configured in three counting directions via the **`DIR` and `CMS` bits in `TIMx_CR1`**:

```text
TIMER COUNTING DIRECTION MODES

 1. Up-Counting Mode (DIR = 0, CMS = 00 — Default)
 CNT : 0 ──► 1 ──► 2 ──► ... ──► ARR ──► OVERFLOW to 0 (UIF = 1)

 2. Down-Counting Mode (DIR = 1, CMS = 00)
 CNT : ARR ──► ARR-1 ──► ... ──► 1 ──► 0 ──► UNDERFLOW to ARR (UIF = 1)

 3. Center-Aligned Mode (CMS = 01, 10, 11)
 CNT : 0 ──► 1 ──► ... ──► ARR-1 ──► ARR ──► ARR-1 ──► ... ──► 1 ──► 0 (UIF = 1)
       ◄─── Up-Counting Phase ───► ◄─── Down-Counting Phase ───►
```

1. **Up-Counting Mode (`DIR = 0`)**: `CNT` counts from $0 \to \text{ARR}$, sets `UIF = 1`, and resets to $0$.
2. **Down-Counting Mode (`DIR = 1`)**: `CNT` counts from $\text{ARR} \to 0$, sets `UIF = 1`, and reloads $\text{ARR}$.
3. **Center-Aligned Mode (`CMS = 01/10/11`)**: `CNT` counts up from $0 \to \text{ARR}$, and then **counts down from $\text{ARR} \to 0$**.
   * *Why use Center-Aligned Mode?* Used in Pulse-Width Modulation (PWM) motor controllers to generate symmetric, low-noise PWM pulses that reduce harmonic distortion in electric motors!

---

## Solved Industrial Engineering Exercise: Quantitative Prescaler Calculation, Shadow Register Trace, and Assembly Timer Synthesis

To consolidate your complete mastery of hardware timer prescalers, auto-reload registers, APB clock doublers, shadow preload buffering, and assembly MMIO initialization, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior bare-metal systems architect configuring `TIM2` (a 32-bit general-purpose hardware timer on APB1) for a $3.2\text{ GHz}$ ARM Cortex-M4 server management processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ SERVER PROCESSOR TIM2 HARDWARE TIMER CONFIGURATION

 System Clock HCLK = 168.000 MHz
 APB1 Prescaler PPRE1 = /4 ──► PCLK1 = 42.000 MHz
 APB1 Timer Clock Doubler ──► f_timer_clk = 2 x 42 MHz = 84.000 MHz!

 Target Overflow Requirements:
 ┌─────────────────────────────────────────────────────────────┐
 │ Overflow Period T_overflow = 500.0 Milliseconds (0.500 s)   │
 │ Target Interrupt Rate f_overflow = 2.000 Hz                 │
 └─────────────────────────────────────────────────────────────┘
  MMIO Base Address : TIM2_BASE = 0x4000_0000
  NVIC Interrupt   : TIM2_IRQn (IRQ 28) @ Vector Slot 44
```

#### Subsystem Clock Specifications:
* System Clock ($HCLK$): $168.000\text{ MHz}$.
* APB1 Bus Prescaler ($PPRE1$): Divide-by-4 $\implies f_{\text{PCLK1}} = 42.000\text{ MHz}$.
* Because $PPRE1 = 4 \neq 1$, the APB1 timer clock doubler is active:

$$f_{\text{timer\_clk}} = 2 \times f_{\text{PCLK1}} = 2 \times 42.000\text{ MHz} = \mathbf{84.000 \text{ MHz}} \quad (84,000,000\text{ Hz})$$

#### Design Constraints:
1. Configure `TIM2_PSC` and `TIM2_ARR` to generate an overflow period $T_{\text{overflow}} = \mathbf{500.0 \text{ milliseconds}}$ ($0.500\text{ s}$).
2. The prescaler must slow down the counter clock $f_{\text{cnt\_clk}}$ to exactly **$10.000\text{ kHz}$ ($10,000\text{ Hz}$)**.
3. Enable Auto-Reload Preload buffering (`ARPE = 1`).
4. Enable the Update Interrupt (`UIE = 1`) and clear all initial phantom update flags before enabling the NVIC $IRQ_{28}$.

#### Your Objective

1. Calculate the exact 16-bit integer value to be written into `TIM2_PSC` to produce $f_{\text{cnt\_clk}} = 10.000\text{ kHz}$ from $f_{\text{timer\_clk}} = 84.000\text{ MHz}$.
2. Calculate the exact 32-bit integer value to be written into `TIM2_ARR` to achieve $T_{\text{overflow}} = 500.0\text{ ms}$.
3. Trace the step-by-step assembly configuration sequence, demonstrating how writing `TIM2_EGR.UG = 1` reloads shadow registers and why clearing `TIM2_SR.UIF = 0` is required.
4. Calculate the total CPU clock cycles saved per second by using `TIM2` hardware auto-reload interrupts instead of software loop polling.
5. Write the complete, production-ready ARM Assembly initialization function `TIM2_Init` and interrupt service routine `TIM2_IRQHandler`.
6. Verify mathematical, physical, and logical correctness.

---

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

---

#### Step 2: Calculate Auto-Reload Register Value (`TIM2_ARR`)

We want an overflow period $T_{\text{overflow}} = 0.500\text{ seconds}$ ($500.0\text{ ms}$).

With $f_{\text{cnt\_clk}} = 10,000\text{ Hz}$, the required number of counter steps $C_{\text{required}}$ is:

$$C_{\text{required}} = f_{\text{cnt\_clk}} \times T_{\text{overflow}} = 10,000\text{ ticks/sec} \times 0.500\text{ sec} = \mathbf{5,0 00 \text{ Ticks}}$$

Since counting from $0 \to \text{ARR}$ requires $\text{ARR} + 1$ steps:

$$\text{ARR} + 1 = 5,000 \implies \text{ARR} = 5,000 - 1 = \mathbf{4,999} = \mathbf{\text{0x0000\_1387}}$$

##### Auto-Reload Result:
Writing `4,999` (`0x1387`) into `TIM2_ARR` causes `TIM2` to trigger an Update Event every $500.0\text{ milliseconds}$ ($2.0\text{ Hz}$ rate)!

---

#### Step 3: Verify Master Timer Equation

Let us verify $T_{\text{overflow}}$ using the Master Equation:

$$T_{\text{overflow}} = \frac{(\text{PSC} + 1) \times (\text{ARR} + 1)}{f_{\text{timer\_clk}}}$$

$$T_{\text{overflow}} = \frac{(8,399 + 1) \times (4,999 + 1)}{84,000,000\text{ Hz}} = \frac{8,400 \times 5,000}{84,000,000} = \frac{42,000,000}{84,000,000} = \mathbf{0.5000 \text{ Seconds (500.0 ms)!}}$$

The period is $100\%$ mathematically exact!

---

#### Step 4: Calculate CPU Cycle Savings over Software Polling

If software polled a $500\text{-ms}$ delay loop at $3.2\text{ GHz}$ ($3.2 \times 10^9\text{ cycles/sec}$):
* Software polling burns $3.2 \times 10^9 \times 0.500 = \mathbf{1,600,000,000 \text{ CPU Clock Cycles}}$ per delay!

Under `TIM2` Hardware Auto-Reload Execution:
* CPU setup $= 40\text{ cycles}$.
* Hardware timer counts in the background for $500\text{ ms}$ ($0\text{ CPU cycles}$).
* CPU handles completion ISR $= 160\text{ cycles}$.
* Total CPU Cycles Burned $= 40 + 160 = \mathbf{200 \text{ CPU Clock Cycles}}$!

$$\text{Percentage CPU Cycles Saved} = \left( 1 - \frac{200}{1,600,000,000} \right) \times 100\% = \mathbf{99.9999875\% \text{ CPU Cycle Offloading!}}$$

Hardware `TIM2` offloads **$99.9999875\%$ of the CPU's workload**, liberating $1.6\text{ billion}$ clock cycles per second for application processing!

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and register configuration results against hardware specifications:

1. **Prescaler Clock Division Verification**:
   * $f_{\text{timer\_clk}} = 84,000,000\text{ Hz}$ (due to $2\times$ APB1 doubler).
   * $\text{PSC} = 8,399 \implies \text{Division Factor} = 8,399 + 1 = 8,400$.
   * $f_{\text{cnt\_clk}} = 84,000,000 / 8,400 = 10,000\text{ Hz}$ ($100\ \mu\text{s per tick}$). Math verified $100\%$!

2. **Auto-Reload Period Verification**:
   * $\text{ARR} = 4,999 \implies \text{Steps} = 4,999 + 1 = 5,000\text{ steps}$.
   * $T_{\text{overflow}} = 5,000 / 10,000\text{ Hz} = \mathbf{0.500 \text{ seconds}} = \mathbf{500.0 \text{ ms}}$. Matches requirement $100\%$!

3. **Initialization Sequence Protection**:
   * `EGR.UG = 1` was written to force shadow register updates.
   * `TIM2_SR.UIF = 0` was cleared *immediately after* `UG = 1` to eliminate the phantom startup interrupt.
   * `TIM2_CR1.ARPE = 1` was enabled to guarantee glitch-free future `ARR` updates.

All prescaler division equations, auto-reload period derivations, APB clock doubler verifications, shadow register preload rules, and assembly configuration steps evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Timer Prescaler Register (`TIMx_PSC`)**: A 16-bit MMIO register that divides the input timer clock frequency ($f_{\text{timer\_clk}}$) by an integer factor $\text{PSC} + 1$, slowing down the tick rate of the hardware counter ($f_{\text{cnt\_clk}} = \frac{f_{\text{timer\_clk}}}{\text{PSC} + 1}$) to prevent high-frequency counter overflows.
* **Auto-Reload Register (`TIMx_ARR`)**: An MMIO register that defines the maximum up-count limit $N_{\text{target}}$. When `CNT` reaches $\text{ARR}$, the hardware sets the Update Interrupt Flag (`UIF`), auto-reloads `CNT` back to $0$ on the next clock tick, and generates an Update Event (`UEV`) with period $T_{\text{overflow}} = \frac{(\text{PSC} + 1)(\text{ARR} + 1)}{f_{\text{timer\_clk}}}$.
* **Shadow Preload Buffering (`ARPE`)**: A dual-register hardware architecture (Preload Register + Shadow Register) controlled by bit `ARPE` in `TIMx_CR1` that defers software `ARR` updates until the next hardware Update Event (`UEV`), preventing timing glitches when modifying timer periods mid-flight.