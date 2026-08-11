content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/02-mmio-peripheral-register-control/02-hardware-timer-counter-subsystems/01-systick-system-timer-architecture.md
# SysTick System Timer Architecture, Core Tick Interrupts, and Deterministic Timekeeping

## The Failure of Software Instruction Delay Loops

In bare-metal embedded systems engineering, software applications frequently need to measure time intervals with absolute physical precision. An application may need to blink a heartbeat status LED at a rate of $1.0\text{ Hz}$ ($500\text{ milliseconds}$ ON, $500\text{ ms}$ OFF), poll a digital temperature sensor every $10\text{ milliseconds}$, or enforce a strict $1.0\text{-millisecond}$ task scheduling period.

In early, naive software implementations, developers attempted to create time delays by forcing the central processing unit (CPU) to execute empty instruction loops (**Software Delay Loops**):

```assembly
/* NAIVE SOFTWARE INSTRUCTION DELAY LOOP IN ASSEMBLY */
delay_loop:
    ldr     r0, =1600000        /* Load loop counter value */
delay_loop_counter:
    subs    r0, r0, #1          /* Decrement loop counter by 1 */
    bne     delay_loop_counter  /* Branch back if counter != 0 */
    bx      lr                  /* Return when loop reaches 0 */
```

While a software delay loop appears simple, relying on instruction loops for timekeeping causes three catastrophic systems engineering failures:

1. **Total CPU Utilization Collapse ($100\%$ Waste)**: While the CPU execution pipeline is trapped executing `subs` and `bne` instructions inside the delay loop, it cannot perform any useful application processing. The multi-gigahertz execution core is $100\%$ occupied doing useless counting, destroying energy efficiency and preventing multitasking.
2. **Frequency Sensitivity and Timing Instability**: The time taken by a software delay loop depends directly on the CPU system clock frequency ($f_{\text{CLK}}$). If the bare-metal software boosts the system clock from $16\text{ MHz}$ to $168\text{ MHz}$ to handle a heavy processing load, **the software delay loop executes ten times faster**! 

A $500\text{-ms}$ delay collapses to $50\text{ ms}$, ruining sensor sampling intervals and corrupting communication protocols!

```text
SOFTWARE DELAY LOOP INSTABILITY ACROSS CLOCK FREQUENCIES

 CPU Running at 16 MHz (16,000,000 cycles/sec)
 [ 8,000,000 Loop Iterations ] ──────────► Executes in EXACTLY 0.50 Seconds (500 ms)

 CPU Accelerated to 168 MHz (168,000,000 cycles/sec)
 [ 8,000,000 Loop Iterations ] ──► Executes in 0.047 Seconds (47 ms)!
 (Timing intervals collapse! Protocols fail! Software delay is un-portable!)
```

3. **Compiler and Pipeline Disruption**: If compiler optimization levels change (e.g., compiling with `-O3` instead of `-O0`) or if the CPU execution pipeline executes out-of-order instruction speculative fetches, the instruction loop count changes unpredictably, making deterministic timekeeping impossible.

Why can we not simply use standard peripheral hardware timers (such as `TIM2` or `TIM3`) on the peripheral bus matrix?

Because peripheral timers are attached to external peripheral buses (such as APB1 or APB2). 

Peripheral buses can be turned off during low-power sleep modes, re-clocked by peripheral prescalers, or omitted entirely in low-cost chip variants. 

Furthermore, code written for a timer on Port APB1 of one chip cannot be ported to a chip from a different manufacturer because peripheral register addresses differ!

To establish a universal, deterministic, portable time base that ticks predictably regardless of software compiler optimizations or peripheral bus configurations, processor architectures incorporate a core-coupled, hardware-driven **SysTick / CLINT System Timer**, a **Core Tick Interrupt**, and precise **Reload Value Calculation Mechanics**.

---

## The Counting Chef vs. The Kitchen Wall Clock: A Mental Model for Core Timekeeping

To build an intuitive, crystal-clear mental model of system tick timers, down-counting hardware registers, and core tick interrupts before inspecting memory-mapped registers, bitwise state tables, and assembly equations, let us consider an everyday analogy: **The Chef in a Busy Restaurant Kitchen**.

Imagine a chef (**The CPU Execution Core**) working in a restaurant kitchen, tasked with preparing a complex gourmet dinner (**Executing the Main Application Loop**).

```text
THE KITCHEN TIMEKEEPING METAPHOR

 Chef's Working Counter (CPU Core Execution)    Kitchen Wall Clock (SysTick Timer)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Chops Vegetables, Stirs   │                 │ 24-Bit Down-Counting      │
 │ Sauces, Prepares Meals    │                 │ Mechanical Hourglass      │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼ (100% Focused on Cooking!)                  │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ INDEPENDENT MECHANICAL WALL CLOCK CHIME (Core Tick Interrupt)           │
 │ Rings a loud Bell every 1.0 Second!                                     │
 └─────────────────────────────────────────────────────────────────────────┘
 (Chef cooks at full speed! Glances at clock ONLY when the bell rings!)
```

The chef needs to check an oven roasting a rack of lamb every $10\text{ minutes}$ (**Periodic Timekeeping Task**).

Let us compare two different timekeeping methods used by the chef:

---

### Method 1: The Counting Chef (Software Instruction Delay Loops)

The chef has no clock on the wall. To measure 10 minutes, the chef decides to count out loud in their head: *"1, 2, 3, 4, 5... 600 seconds!"*

Look at what happens in the kitchen:
1. While counting numbers in their head, the chef **cannot read recipes, chop vegetables, or stir sauces** because their brain is completely occupied counting numbers!
2. If another cook asks the chef a question (**A Hardware Interrupt**), the chef loses count, forgets what number they reached, and burns the lamb (**Data Corruption & Timing Loss**)!
3. If the chef drinks an espresso and starts counting twice as fast (**Clock Frequency Acceleration**), they open the oven door after only 5 minutes, serving raw, undercooked meat (**Protocol Failure**)!

This is **Software Instruction Delay Loop Failure**. The chef's mind is $100\%$ wasted doing primitive counting.

---

### Method 2: The Kitchen Wall Clock and Hourglass (The SysTick Hardware Timer)

To liberate the chef's brain, the restaurant owner hangs an independent **Mechanical Wall Clock with a Chime (The SysTick System Timer)** directly on the wall.

Inside the wall clock sits an inverted 24-bit mechanical hourglass (**The Down-Counting Current Value Register `VAL`**):

```text
THE SELF-FLIPPING MECHANICAL HOURGLASS

 Top Water Chamber (Reload Register LOAD)      Bottom Glass Chamber (Current Value VAL)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Holds 1,000 Drops of Water│                 │ Drains drop-by-drop!      │
 └─────────────┬─────────────┘                 └─────────────┬─────────────┘
               │                                             │
               ▼ (Drains 1 drop per clock tick)              ▼
 When Bottom Chamber reaches ZERO drops (VAL = 0):
 1. Mechanical spring INSTANTLY refills Bottom Chamber from Top Chamber!
 2. A loud chime bell RINGS! (Core Tick Interrupt Exception 15!)
```

1. **The Target Time Setting (`LOAD` Register)**: The chef sets the top water chamber to hold exactly **1,000 drops of water** (**The Reload Value $N_{\text{reload}}$**).
2. **The Water Draining (`VAL` Register)**: Every time the kitchen clock ticks, $1\text{ drop of water}$ drains out of the bottom glass chamber (**Current Value Register $VAL$ decrements by 1**).
3. **The Zero-Drop Chime (Core Tick Interrupt)**: When the last drop of water drains out and the bottom chamber reaches **0 drops**, a spring mechanism triggers two instant hardware actions:
   * **Automatic Refill**: The spring instantly flips 1,000 fresh drops back into the bottom chamber (**Auto-Reload from `LOAD` to `VAL`**).
   * **The Chime Bell**: A loud chime bell rings in the kitchen (**Core Tick Interrupt Exception 15**)!
4. **The Chef's Workflow**: The chef cooks, chops, and prepares meals at whatever speed they want (**Executing Main Software Code**). They do **not** count numbers in their head!
5. When the chime rings, the chef glances at the wall clock, increments an uptime counter on a notepad (`system_ticks++`), checks the oven, and immediately returns to cooking!

Look at what Method 2 achieved:
* **$100\%$ Chef Productivity**: The chef spent $100\%$ of their brain power cooking meals, completely freed from counting seconds!
* **Immunity to Cooking Speed**: Even if the chef drinks an espresso and chops vegetables ten times faster, **the wall clock continues ticking at its exact, steady 1-second physical rhythm**!
* **Zero Lost Ticks**: The automatic spring refilled the hourglass in 0 seconds without losing a single drop of water!

This kitchen wall clock is the exact physical analogue of **The SysTick System Timer**:
* The chef is the **CPU Core Execution Pipeline**.
* Preparing gourmet meals is the **Main Application Code Loop**.
* Counting numbers out loud is a **Software Instruction Delay Loop**.
* The mechanical wall clock is the **SysTick / CLINT Hardware Timer**.
* The top water chamber is the **Reload Value Register (`STK_LOAD`)**.
* The bottom draining chamber is the **Current Value Register (`STK_VAL`)**.
* The chime bell ringing is the **Core Tick Interrupt (Exception 15)**.
* Incrementing the notepad counter is the **System Tick Handler (`SysTick_Handler`)**.

---

## Primitive 1: SysTick / CLINT System Timer Architecture

Now that we possess an intuitive mental model of kitchen wall clocks and self-flipping hourglasses, let us examine the formal engineering mechanics of the **SysTick / CLINT System Timer**.

In modern processor architectures, the system timer is **not** a standard peripheral sitting on an external bus. 

On ARM Cortex-M processors, the timer—called **SysTick**—is a 24-bit down-counting hardware module integrated **directly inside the CPU core's System Control Space (SCS)** at Memory-Mapped I/O (MMIO) base address `0xE000_E010`.

On RISC-V processors, this function is provided by the 64-bit **Core-Local Interruptor (CLINT)** or **Core-Local Interrupt Controller (CLIC)** via the `mtime` and `mtimecmp` registers.

```text
CPU CORE INTERNAL SYSTEM CONTROL SPACE (SCS) LAYOUT

 ARM Cortex-M Processor Core Silicon Die
 ┌───────────────────────────────────────────────────────────┐
 │ Execution Pipeline & General Register File (r0..r15)      │
 ├───────────────────────────────────────────────────────────┤
 │ System Control Space (SCS Base: 0xE000_E000)              │
 │                                                           │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ SysTick Timer Registers (Base: 0xE000_E010)         │  │
 │  │  * STK_CTRL  (Offset 0x00) : Control & Status Reg   │  │
 │  │  * STK_LOAD  (Offset 0x04) : 24-Bit Reload Register │  │
 │  │  * STK_VAL   (Offset 0x08) : 24-Bit Current Value   │  │
 │  │  * STK_CALIB (Offset 0x0C) : Calibration Register   │  │
 │  └─────────────────────────────────────────────────────┘  │
 │                                                           │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ Nested Vectored Interrupt Controller (NVIC)         │  │
 │  └─────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────┘
 (Integrated directly into the CPU core! Independent of peripheral buses!)
```

---

### The Four Core SysTick MMIO Registers

The SysTick system timer is controlled by four 32-bit registers located in the System Control Space:

```text
SYSTICK MMIO REGISTER MAP (BASE: 0xE000_E010)

 Byte Offset │ Register Name │ Width   │ Primary Hardware Function
─────────────┼───────────────┼─────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ STK_CTRL      │ 32 Bits │ Control and Status Register (Enable, Interrupt, Source)
  Offset 0x04│ STK_LOAD      │ 24 Bits │ Reload Value Register (24-bit countdown start value)
  Offset 0x08│ STK_VAL       │ 24 Bits │ Current Value Register (24-bit active down-counter)
  Offset 0x0C│ STK_CALIB     │ 32 Bits │ Calibration Register (Factory 10ms calibration value)
```

Let us dissect the exact bitfield functions of each register:

---

#### 1. SysTick Control and Status Register (`STK_CTRL` — Offset `0x00`)

The `STK_CTRL` register controls timer operation, clock source selection, interrupt generation, and wrap status flags:

```text
STK_CTRL REGISTER BITFIELD MAP

 Bit 31                     Bit 17 Bit 16      Bit 3 Bit 2      Bit 1   Bit 0
 ┌────────────────────────────────┬───────────┬──────┬──────────┬───────┬───────┐
 │ Reserved / Unused              │ COUNTFLAG │ Res  │CLKSOURCE │TICKINT│ENABLE │
 │ (Read as 0)                    │ (1 Bit)   │      │ (1 Bit)  │(1 Bit)│(1 Bit)│
 └────────────────────────────────┴───────────┴──────┴──────────┴───────┴───────┘
```

* **`ENABLE` (Bit 0)**:
  * $0 =$ SysTick counter disabled (timer paused).
  * $1 =$ SysTick counter enabled (down-counting active).
* **`TICKINT` (Bit 1)**:
  * $0 =$ Core Tick Interrupt disabled. Reaching 0 sets `COUNTFLAG`, but does not trigger an interrupt.
  * $1 =$ **Core Tick Interrupt enabled!** Reaching 0 asserts Exception Vector 15 (`SysTick_Handler`) to the CPU core.
* **`CLKSOURCE` (Bit 2)**:
  * $0 =$ Clock source is the External Reference Clock ($STCLK = HCLK / 8$).
  * $1 =$ **Clock source is the Core Processor Clock ($HCLK$)** (e.g., $168\text{ MHz}$).
* **`COUNTFLAG` (Bit 16 — Read-Only / Clear-on-Read)**:
  * Automatically set to $1$ by hardware whenever the `VAL` down-counter transitions from $1 \to 0$.
  * **Clear-on-Read Invariant**: Reading the `STK_CTRL` register automatically clears `COUNTFLAG` back to $0$!

---

#### 2. SysTick Reload Value Register (`STK_LOAD` — Offset `0x04`)

The `STK_LOAD` register is a **24-bit register (Bits $[23:0]$)** that stores the start value $N_{\text{reload}}$ that is automatically copied into the active counter (`VAL`) whenever `VAL` reaches 0.

$$\text{Valid Reload Range: } \quad 1 \le N_{\text{reload}} \le 2^{24} - 1 = \mathbf{16,777,215}$$

Bits $[31:24]$ are unused and hardwired to zero.

---

#### 3. SysTick Current Value Register (`STK_VAL` — Offset `0x08`)

The `STK_VAL` register is a **24-bit active down-counter (Bits $[23:0]$)**.
* On every clock cycle of the selected clock source, hardware decrements `VAL` by 1:

$$\text{VAL}_{\text{next}} \Leftarrow \text{VAL}_{\text{current}} - 1$$

#### The Write-to-Clear Hardware Invariant:
> **The `STK_VAL` Write Rule**: Writing **ANY value** (whether `0x00` or `0xFFFFFFFF`) to `STK_VAL` causes the hardware to **instantly clear `STK_VAL` to $0$ and clear the `COUNTFLAG` bit to $0$**!

This feature allows software startup routines to reset the counter state and prevent an immediate false interrupt when initializing the timer.

---

#### 4. SysTick Calibration Register (`STK_CALIB` — Offset `0x0C`)

A read-only register populated during silicon manufacturing containing factory-calibrated division constants:
* **`TENMS` (Bits $[23:0]$)**: Holds the exact reload value needed to achieve a $10\text{-millisecond}$ ($100\text{ Hz}$) tick period using the reference clock.

---

## Primitive 2: Reload Value Calculation Mechanics

Now let us examine the second core primitive: **Reload Value Calculation Mechanics**.

How do we calculate the exact integer number $N_{\text{reload}}$ to write into the `STK_LOAD` register so that the SysTick timer ticks at a precise physical time period $T_{\text{tick}}$ (e.g., $1.0\text{ millisecond}$)?

### Deriving the Reload Value Formula

Let $f_{\text{CLK}}$ be the clock frequency feeding the SysTick timer in Hertz (cycles per second).
Let $T_{\text{clk}}$ be the clock period in seconds ($T_{\text{clk}} = \frac{1}{f_{\text{CLK}}}$).
Let $T_{\text{tick}}$ be the desired physical tick interval in seconds (e.g., $1.0\text{ ms} = 0.001\text{ s}$).

The number of clock cycles $C_{\text{required}}$ that elapse during physical time $T_{\text{tick}}$ is:

$$C_{\text{required}} = f_{\text{CLK}} \times T_{\text{tick}}$$

Now, analyze the down-counting sequence executed by the 24-bit hardware counter:

To count $C_{\text{required}}$ clock cycles, the counter counts down from $N_{\text{reload}}$ all the way down to $0$:

$$\text{Counting Sequence: } \quad N_{\text{reload}} \to (N_{\text{reload}} - 1) \to (N_{\text{reload}} - 2) \to \dots \to 1 \to 0$$

Count the total number of transition steps in this sequence:
Counting from $N_{\text{reload}}$ down to $0$ inclusive requires **$N_{\text{reload}} + 1$ clock cycles**!

$$\mathbf{C_{\text{required}} = N_{\text{reload}} + 1}$$

Equating the two expressions for $C_{\text{required}}$:

$$N_{\text{reload}} + 1 = f_{\text{CLK}} \times T_{\text{tick}}$$

Subtracting 1 from both sides yields **The Master Reload Value Equation**:

$$\mathbf{N_{\text{reload}} = \left( f_{\text{CLK}} \times T_{\text{tick}} \right) - 1}$$

Where:
* $N_{\text{reload}}$ is the 24-bit integer written into the `STK_LOAD` register.
* $f_{\text{CLK}}$ is the active SysTick input clock frequency in Hertz ($1 \le f_{\text{CLK}} \le 4.0 \times 10^9\text{ Hz}$).
* $T_{\text{tick}}$ is the desired physical tick period in seconds ($T_{\text{tick}} = \frac{1}{f_{\text{tick}}}$).

```text
24-BIT COUNTING SEQUENCE WITH AUTO-RELOAD

 Clock Ticks : ───[ N ]───►[ N-1 ]───►[ N-2 ]───► ... ───►[ 1 ]───►[ 0 ]───┐
                                                                           │
                                                                           ▼ (COUNTFLAG = 1 & IRQ 15!)
 Clock Ticks : ───[ N ]◄───────────────────────────────────────────────────┘
               (Auto-Reloads N into VAL in 0 clock cycles!)
```

---

### Step-by-Step Calculation Examples

#### Example 1: $1.0\text{-Millisecond}$ Tick ($1\text{ kHz}$) at $168\text{ MHz}$ System Clock
* Input Clock Frequency: $f_{\text{CLK}} = 168.0\text{ MHz} = 168,000,000\text{ Hz}$.
* Target Period: $T_{\text{tick}} = 1.0\text{ ms} = 0.001\text{ seconds}$.

1. Calculate required clock cycles ($C_{\text{required}}$):
   $$C_{\text{required}} = 168,000,000\text{ Hz} \times 0.001\text{ s} = 168,000 \text{ cycles}$$
2. Calculate Reload Value ($N_{\text{reload}}$):
   $$N_{\text{reload}} = 168,000 - 1 = \mathbf{167,999} = \mathbf{\text{0x0002\_903F}}$$
3. Verify 24-bit capacity bound ($N_{\text{reload}} \le 16,777,215$):
   $$167,999 \le 16,777,215 \quad (\mathbf{\text{24-BIT CAPACITY BOUND PASSED!}})$$

Write `167,999` (`0x0002_903F`) into `STK_LOAD`! The SysTick timer will trigger a Core Tick Interrupt every $1.000\text{ millisecond}$ with $100\%$ mathematical precision!

---

#### Example 2: The 24-Bit Overflow Limit Calculation

What is the longest physical time period $T_{\text{max}}$ that a 24-bit SysTick timer can measure in a single countdown cycle without stopping or using a prescaler?

The maximum value that can be stored in the 24-bit `STK_LOAD` register is:

$$N_{\text{max}} = 2^{24} - 1 = 16,777,215 = \text{0x00FF\_FFFF}$$

The maximum clock cycles measured is $N_{\text{max}} + 1 = 16,777,216\text{ cycles}$.

Let us calculate $T_{\text{max}}$ for a CPU running at $168\text{ MHz}$ ($f_{\text{CLK}} = 168\text{ MHz}$):

$$\mathbf{T_{\text{max}} = \frac{N_{\text{max}} + 1}{f_{\text{CLK}}} = \frac{16,777,216\text{ cycles}}{168,000,000\text{ Hz}} \approx 0.099864 \text{ seconds} \approx \mathbf{99.86 \text{ milliseconds}}}$$

#### Physical Hardware Bound:
At $168\text{ MHz}$, a 24-bit counter can measure a maximum single countdown period of **$99.86\text{ milliseconds}$**.

If an application needs to measure a $1.0\text{-second}$ delay:
* The application cannot write $1.0\text{ second}$ into `STK_LOAD` directly because $168,000,000 > 16,777,215$ (24-bit overflow!).
* Instead, the system programs SysTick to trigger a Core Tick Interrupt every $1.0\text{ ms}$, and an assembly software handler increments a **64-bit System Tick Counter** on every interrupt!

---

## Primitive 3: Core Tick Interrupt Execution (Exception 15)

Now let us examine the third core primitive: **Core Tick Interrupt Execution**.

When the SysTick down-counter `VAL` transitions from $1 \to 0$ while `TICKINT = 1` in `STK_CTRL`, the SysTick hardware asserts **Exception Vector 15 (`SysTick_Handler`)** directly to the CPU execution core.

```text
SYSTICK CORE TICK INTERRUPT DISPATCH PIPELINE

 SysTick Down-Counter VAL transitions from 1 -> 0
                       │
                       ▼
 1. Hardware sets STK_CTRL.COUNTFLAG = 1
 2. Hardware asserts Core Exception Vector 15 (SysTick_Handler)
                       │
                       ▼
 CPU Hardware Stacking Pipeline (12 Cycles)
 Pushes r0..r3, r12, LR, PC, xPSR onto Stack Memory (SP)
                       │
                       ▼
 Fetches SysTick_Handler Address from Vector Table Offset 0x0000_003C
 Executes SysTick_Handler Assembly Routine!
```

---

### Vector Table Location of SysTick

The SysTick interrupt is an internal CPU core exception. It is **not** an external peripheral $IRQ$.

In the ARM Cortex-M Vector Table, SysTick is assigned **Vector Slot 15 (Byte Offset `0x0000_003C`)**:

$$\text{SysTick\_Vector\_Addr} = \text{VTOR} + \text{0x0000\_003C}$$

```text
VECTOR TABLE EXCEPTION MAPPING FOR SYSTICK

 Vector Slot │ Offset   │ Exception Name     │ Functional Purpose
─────────────┼──────────┼────────────────────┼───────────────────────────────────────────
   Slot 1    │ 0x0000   │ Initial SP         │ Boot Stack Pointer
   Slot 2    │ 0x0004   │ Reset_Handler      │ Boot Entry Point
   ...       │ ...      │ ...                │ ...
   Slot 14   │ 0x0038   │ PendSV_Handler     │ OS Context Switch Pending
   Slot 15   │ 0x003C   │ SysTick_Handler    │ Core System Tick Timer Interrupt!
   Slot 16   │ 0x0040   │ EXTI0_IRQHandler   │ External Interrupt 0 (IRQ 0)
```

---

### Setting SysTick Interrupt Priority (`SCB->SHPR3`)

Because SysTick is a system exception rather than a peripheral $IRQ$, its preemption priority is **not** programmed in the peripheral priority registers (`NVIC->IPR`).

SysTick's priority is programmed inside the **System Handler Priority Register 3 (`SCB->SHPR3`)** located at System Control Space address `0xE000_ED24`:

```text
SCB->SHPR3 REGISTER BITFIELD MAP

 Bits [31:24]             Bits [23:16]             Bits [15:8]              Bits [7:0]
 ┌────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────┐
 │ SysTick Priority (8b)  │ PendSV Priority (8b)   │ Reserved               │ DebugMonitor Pri (8b)  │
 └────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────┘
```

#### Programming SysTick Priority in Assembly:
SysTick's 8-bit priority field sits in bits $[31:24]$ of `SCB->SHPR3`. To set SysTick to a medium preemption priority (e.g., `0x80`):

```assembly
/* PROGRAMMING SYSTICK PRIORITY IN SCB->SHPR3 */
    ldr     r0, =0xE000ED24     /* r0 = Address of SCB->SHPR3 */
    ldr     r1, [r0]            /* Read current SHPR3 value */
    bic     r1, r1, #(0xFF << 24)/* Clear top 8 bits (SysTick field) */
    orr     r1, r1, #(0x80 << 24)/* Set SysTick Priority = 0x80 */
    str     r1, [r0]            /* Write updated SHPR3 back */
```

---

## 64-Bit System Uptime Tracking in 32-Bit Assembly

To measure long time intervals (hours, days, or years) on a 32-bit CPU using a 24-bit SysTick timer, bare-metal software maintains a **64-bit System Tick Counter (`system_ticks`)** in RAM.

Every time `SysTick_Handler` executes (e.g., every $1.0\text{ ms}$), the assembly handler increments the 64-bit counter by 1.

### The 64-Bit Addition Assembly Pattern (`ADDS` / `ADC`)

On a 32-bit CPU architecture, a 64-bit integer is stored across two adjacent 32-bit registers or memory locations:
* **`system_ticks_low`**: Lower 32 bits ($[31:0]$).
* **`system_ticks_high`**: Upper 32 bits ($[63:32]$).

To increment a 64-bit integer atomically in assembly, we use the **Add with Carry (`ADC`) instruction pair**:

```assembly
/* 64-BIT ATOMIC UPTIME TICK INCREMENT IN ASSEMBLY */
.global SysTick_Handler
.type SysTick_Handler, %function

.section .text
.thumb_func
SysTick_Handler:
    /* Load 64-bit system_ticks value from RAM into r0 (Low) and r1 (High) */
    ldr     r2, =system_ticks
    ldr     r0, [r2, #0]        /* r0 = system_ticks_low  (Bits [31:0]) */
    ldr     r1, [r2, #4]        /* r1 = system_ticks_high (Bits [63:32]) */

    /* Increment 64-bit value using Add-with-Carry */
    adds    r0, r0, #1          /* Add 1 to lower 32 bits; sets CARRY flag if overflow! */
    adc     r1, r1, #0          /* Add CARRY flag (0 or 1) to upper 32 bits! */

    /* Store updated 64-bit value back to RAM */
    str     r0, [r2, #0]
    str     r1, [r2, #4]

    bx      lr                  /* Return from exception */
.size SysTick_Handler, .-SysTick_Handler
```

```text
64-BIT ADDITION WITH CARRY (ADDS / ADC) MECHANICS

 Lower 32-Bit Addition (ADDS r0, r0, #1):
 0xFFFFFFFF + 1 = 0x00000000  ──► Sets Hardware CARRY Flag (C = 1)!

 Upper 32-Bit Addition (ADC r1, r1, #0):
 0x00000000 + 0 + CARRY(1) = 0x00000001!
 (64-bit counter transitions from 0x00000000_FFFFFFFF to 0x00000001_00000000!)
```

#### How `ADDS` and `ADC` Work:
1. `adds r0, r0, #1`: Increments lower 32 bits. If $r0$ overflows from `0xFFFFFFFF` to `0x00000000`, the CPU hardware sets the **Carry Flag ($C = 1$)** in the status register ($xPSR$).
2. `adc r1, r1, #0`: Adds $0$ plus the Carry Flag ($C$) to the upper 32 bits. If $C = 1$, $r1$ is incremented by 1!
3. The 64-bit counter increments flawlessly across $2^{64}$ ticks without overflow errors!

---

## Real-World Silicon Realities: Deep Sleep Stalls and 24-Bit Boundary Wraps

In commercial embedded systems engineering, utilizing SysTick for bare-metal timekeeping requires managing hardware edge cases.

---

### 1. SysTick Behavior in Deep Sleep Modes (`WFI` / `WFE`)

When a bare-metal microcontroller enters a low-power sleep state by executing a **Wait For Interrupt (`WFI`)** instruction, the CPU core's internal clock tree ($HCLK$) is turned off to save battery power.

Because SysTick is integrated directly inside the CPU core:
* If `STK_CTRL.CLKSOURCE = 1` ($HCLK$) is selected, **SysTick stops counting when the CPU enters `WFI` sleep**!
* The system time base freezes while the CPU sleeps!

#### The Hardware Solution: External Reference Clock ($CLKSOURCE = 0$)
To keep SysTick ticking during low-power CPU sleep:
* Set `STK_CTRL.CLKSOURCE = 0` to drive SysTick from an **External Low-Power Reference Clock** ($STCLK$, such as an external $32.768\text{-kHz}$ crystal oscillator).
* SysTick continues down-counting in deep sleep, firing Exception 15 to wake the CPU periodically!

---

### 2. Reading `STK_VAL` In-Flight: The 24-Bit Down-Counting Roll-Over

When software attempts to measure sub-millisecond elapsed time by reading `STK_VAL` directly during program execution:

Remember two critical hardware properties of `STK_VAL`:
1. **Down-Counting Direction**: `STK_VAL` counts **DOWNWARD** ($1000 \to 999 \to 998 \dots \to 0$).
2. **Auto-Reload Instant Reset**: When `STK_VAL` reaches $0$, it rolls over to $N_{\text{reload}}$ on the next clock tick.

#### Calculating Elapsed Ticks Between Two Readings ($t_1$ and $t_2$):

Suppose software reads `STK_VAL` at time 1 ($V_1$), executes an algorithm, and reads `STK_VAL` at time 2 ($V_2$).

Because the counter counts *downward*:

$$\text{If } V_1 \ge V_2 \quad (\text{No Reload Occurred}): \quad \mathbf{\Delta \text{Ticks} = V_1 - V_2}$$

$$\text{If } V_1 < V_2 \quad (\text{Counter Wrapped Around } 0): \quad \mathbf{\Delta \text{Ticks} = (V_1 + N_{\text{reload}} + 1) - V_2}$$

```text
ELAPSED TICKS CALCULATION DURING COUNTER WRAPAROUND

 Case 1: No Counter Wraparound (V1 = 800, V2 = 500)
 Delta Ticks = 800 - 500 = 300 Ticks Elapsed.

 Case 2: Counter Wrapped Around 0 (V1 = 100, V2 = 900, LOAD = 999)
 Delta Ticks = (100 + 999 + 1) - 900 = 1100 - 900 = 200 Ticks Elapsed!
```

---

## Solved Industrial Engineering Exercise: Quantitative SysTick Reload Calculation, Sub-Millisecond Timekeeping, and Assembly Synthesis

To consolidate your complete mastery of SysTick timer architecture, 24-bit reload value equations, core tick interrupt handling, and 64-bit assembly tick tracking, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior bare-metal systems architect configuring the core timekeeping engine for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor system clock operates at $f_{\text{HCLK}} = \mathbf{168.000 \text{ MHz}}$ ($168,000,000\text{ Hz}$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER SYSTICK TIMEKEEPING

 Core Clock f_HCLK = 168.000 MHz
 ┌─────────────────────────────────────────────────────────────┐
 │ SysTick Timer (MMIO Base: 0xE000_E010)                      │
 │ Target Tick Period: 10.0 Milliseconds (100 Hz Tick Rate)    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Core Exception Vector 15 : SysTick_Handler @ 0x0800_03C0
 Global 64-Bit Counter in RAM: system_ticks @ 0x2000_0100
```

#### Functional Requirements:
1. **Target Tick Rate**: Configure SysTick to generate a **$10.0\text{-millisecond}$ ($100\text{ Hz}$)** periodic Core Tick Interrupt using the core processor clock ($CLKSOURCE = 1$).
2. **Interrupt Priority**: Set SysTick exception preemption priority to medium-low level `0x80` in `SCB->SHPR3`.
3. **Sub-Millisecond Timekeeping Function**: Write an assembly function `get_elapsed_microseconds` that reads $VAL$ and `system_ticks` to return the total elapsed time in microseconds ($\mu\text{s}$).

#### Your Objective

1. Calculate the exact 24-bit integer $N_{\text{reload}}$ to be written into `STK_LOAD` for a $10.0\text{-ms}$ tick period at $168\text{ MHz}$.
2. Verify that $N_{\text{reload}}$ falls within the 24-bit capacity bound ($N_{\text{reload}} \le 16,777,215$).
3. Calculate the exact 32-bit hexadecimal value to be written into `STK_CTRL` to enable the counter, enable the core tick interrupt, and select the CPU core clock.
4. Calculate the physical time resolution (in nanoseconds) of a single SysTick down-count tick.
5. Write the complete, production-ready ARM Assembly initialization function `SysTick_Init` and interrupt handler `SysTick_Handler`.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate SysTick Reload Value ($N_{\text{reload}}$)

Given:
* $f_{\text{CLK}} = 168,000,000\text{ Hz}$.
* $T_{\text{tick}} = 10.0\text{ ms} = 0.010\text{ seconds}$.

We apply the Master Reload Value Equation:

$$N_{\text{reload}} = (f_{\text{CLK}} \times T_{\text{tick}}) - 1$$

$$N_{\text{reload}} = (168,000,000\text{ Hz} \times 0.010\text{ s}) - 1$$

$$N_{\text{reload}} = 1,680,000 - 1 = \mathbf{1,679,999 \text{ Counts}}$$

Convert `1,679,999` to Hexadecimal:

$$1,679,999_{10} = \mathbf{\text{0x0019\_A03F}}$$

##### Verify 24-Bit Bound ($N_{\text{reload}} \le 16,777,215$):

$$1,679,999 \le 16,777,215 \quad (\mathbf{\text{24-BIT BOUND PASSED!}})$$

Writing `1,679,999` (`0x0019_A03F`) into `STK_LOAD` yields an exact $10.0\text{-ms}$ period!

---

#### Step 2: Determine Bitmask Values for `STK_CTRL`

We construct the 32-bit control word for `STK_CTRL` (Offset `0x00`):
* Bit 0 (`ENABLE`) $= 1$ (Enable counter).
* Bit 1 (`TICKINT`) $= 1$ (Enable Core Tick Interrupt Exception 15).
* Bit 2 (`CLKSOURCE`) $= 1$ (Select Core Clock $HCLK = 168\text{ MHz}$).

$$\text{STK\_CTRL Bitmask} = (1 \ll 2) \ \mid \ (1 \ll 1) \ \mid \ (1 \ll 0) = 4 + 2 + 1 = \mathbf{7} = \mathbf{\text{0x0000\_0007}}$$

Writing `0x0000_0007` to `STK_CTRL` enables SysTick with core clocking and interrupts!

---

#### Step 3: Calculate Single Tick Resolution and Sub-Millisecond Conversion

The physical duration of a single down-count tick ($\Delta t_{\text{single\_tick}}$) is:

$$\Delta t_{\text{single\_tick}} = \frac{1}{f_{\text{CLK}}} = \frac{1}{168,000,000\text{ Hz}} \approx \mathbf{5.95238 \text{ nanoseconds}}$$

##### Sub-Millisecond Microsecond Calculation Formula:
To calculate elapsed microseconds ($\mu\text{s}$) within the current $10\text{-ms}$ tick:

$$\text{Elapsed Ticks} = N_{\text{reload}} - \text{VAL} = 1,679,999 - \text{VAL}$$

$$\text{Elapsed Microseconds } (\mu\text{s}) = (\text{system\_ticks} \times 10,000) + \left( \frac{1,679,999 - \text{VAL}}{168} \right)$$

---

#### Step 4: Write Production Assembly Initialization and Handler Routines

Here is the complete, production-ready ARM Assembly code for SysTick timekeeping:

```assembly
/* PRODUCTION BARE-METAL SYSTICK INITIALIZATION & HANDLER IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* SysTick MMIO Register Addresses */
.equ STK_CTRL,        0xE000E010        /* Control and Status Register */
.equ STK_LOAD,        0xE000E014        /* Reload Value Register */
.equ STK_VAL,         0xE000E018        /* Current Value Register */
.equ SCB_SHPR3,       0xE000ED24        /* System Handler Priority Register 3 */

/* 64-Bit Uptime Counter in SRAM */
.section .bss
.align 3
.global system_ticks
system_ticks:
    .space 8                            /* 8 Bytes (64 bits) for tick counter */

.section .text
.global SysTick_Init
.type SysTick_Init, %function
.thumb_func
SysTick_Init:
    push    {r4, lr}

    /* Step 1: Disable SysTick during configuration */
    ldr     r0, =STK_CTRL
    movs    r1, #0
    str     r1, [r0]                    /* STK_CTRL = 0 */

    /* Step 2: Program 24-bit Reload Value for 10ms (1,679,999 = 0x0019A03F) */
    ldr     r0, =STK_LOAD
    ldr     r1, =1679999                /* N_reload = (168MHz * 10ms) - 1 */
    str     r1, [r0]

    /* Step 3: Clear Current Value Register (STK_VAL <= 0) */
    ldr     r0, =STK_VAL
    movs    r1, #0
    str     r1, [r0]                    /* Writing 0 clears VAL and COUNTFLAG */

    /* Step 4: Set SysTick Priority = 0x80 in SCB->SHPR3 */
    ldr     r0, =SCB_SHPR3
    ldr     r1, [r0]
    bic     r1, r1, #(0xFF << 24)       /* Clear top 8 bits */
    orr     r1, r1, #(0x80 << 24)       /* Set SysTick Priority = 0x80 */
    str     r1, [r0]

    /* Step 5: Enable SysTick, Core Clock, and Interrupt (STK_CTRL <= 0x07) */
    ldr     r0, =STK_CTRL
    movs    r1, #7                      /* ENABLE=1, TICKINT=1, CLKSOURCE=1 */
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size SysTick_Init, .-SysTick_Init


/* 64-BIT ATOMIC SYSTICK INTERRUPT HANDLER */
.global SysTick_Handler
.type SysTick_Handler, %function
.thumb_func
SysTick_Handler:
    /* Increment 64-bit system_ticks counter in RAM */
    ldr     r2, =system_ticks
    ldr     r0, [r2, #0]                /* r0 = system_ticks_low */
    ldr     r1, [r2, #4]                /* r1 = system_ticks_high */

    adds    r0, r0, #1                  /* Increment low 32 bits; sets CARRY */
    adc     r1, r1, #0                  /* Add CARRY to high 32 bits */

    str     r0, [r2, #0]
    str     r1, [r2, #4]

    bx      lr                          /* Return from exception */
.size SysTick_Handler, .-SysTick_Handler
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and bitwise results against hardware specifications:

1. **Reload Value Calculation Verification**:
   * $N_{\text{reload}} = 1,679,999$.
   * Number of counted cycles $= N_{\text{reload}} + 1 = 1,680,000\text{ cycles}$.
   * Tick period $= \frac{1,680,000\text{ cycles}}{168,000,000\text{ Hz}} = \mathbf{0.010 \text{ seconds}} = \mathbf{10.0 \text{ milliseconds}}$.
   * Exact match with $100\%$ mathematical precision!

2. **24-Bit Boundary Capacity Check**:
   * $N_{\text{reload}} = 1,679,999 = \text{0x0019\_A03F} \le \text{0x00FF\_FFFF} (16,777,215)$.
   * The reload value fits comfortably inside the 24-bit `STK_LOAD` register without overflow.

3. **64-Bit Addition Atomicity Check**:
   * `adds r0, r0, #1` followed by `adc r1, r1, #0`.
   * When `system_ticks_low` overflows from `0xFFFFFFFF` to `0x00000000`, the hardware Carry flag $C=1$ increments `system_ticks_high` by 1.
   * Total 64-bit uptime capacity $= 2^{64} \times 10\text{ ms} \approx \mathbf{5.84 \times 10^9 \text{ years}}$, guaranteeing zero counter overflow throughout the operational lifespan of the server!

All 24-bit reload value equations, $10.0\text{-ms}$ period derivations, 64-bit atomic addition assembly instructions, and System Control Space MMIO bitfield configurations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **SysTick / CLINT System Timer**: A 24-bit core-coupled down-counting hardware timer integrated directly inside the CPU System Control Space (`0xE000_E010`), independent of peripheral bus clock trees, that provides a standardized physical time base across bare-metal systems.
* **Core Tick Interrupt**: Exception Vector 15 (`SysTick_Handler`), triggered automatically by hardware when the 24-bit down-counter `VAL` transitions from $1 \to 0$, waking the processor or interrupting background software loops to increment a 64-bit system uptime counter in RAM.
* **Reload Value Calculation**: The mathematical equation $N_{\text{reload}} = (f_{\text{CLK}} \times T_{\text{tick}}) - 1$ used to program the 24-bit `STK_LOAD` register, accounting for $N+1$ down-count steps to produce exact physical timekeeping intervals.