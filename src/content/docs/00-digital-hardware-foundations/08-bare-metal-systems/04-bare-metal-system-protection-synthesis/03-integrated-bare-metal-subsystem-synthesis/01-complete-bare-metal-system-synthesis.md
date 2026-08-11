---
title: "Complete Bare-Metal System Synthesis, Event-Driven Assembly Loops, and Hardware SWO/ITM Tracing"
---

# Complete Bare-Metal System Synthesis, Event-Driven Assembly Loops, and Hardware SWO/ITM Tracing

## The Multi-Peripheral Coordination Failure and Silent System Freeze

In commercial bare-metal embedded systems engineering, low-level hardware modules and peripheral controllers do not operate in isolated academic environments. A real-world industrial control node, autonomous automotive module, or medical device must synthesize a vast array of hardware peripherals on a single silicon die:
* An ARM Cortex-M4 CPU core running at a high clock frequency ($168\text{ MHz}$ / $3.2\text{ GHz}$).
* A hardware vector table mapping reset handlers, fault routines, and peripheral interrupts.
* A Phase-Locked Loop (PLL) clock tree with Flash memory wait-state controllers.
* A Memory Protection Unit (MPU) enforcing Read-Only Flash, Execute-Never (`XN`) SRAM, and Stack Guard Regions.
* A Nested Vectored Interrupt Controller (NVIC) managing multi-tier preemption priorities.
* A General Purpose Input/Output (GPIO) subsystem with atomic bit-set-clear registers (`BSRR`) and external line controllers (`EXTI`).
* A hardware timer (`TIM2`) emitting periodic $100\text{-Hz}$ Master Trigger Output (`TRGO`) pulses.
* A 12-bit Analog-to-Digital Converter (`ADC1`) sampling sensor voltages triggered by `TIM2_TRGO`.
* A Direct Memory Access engine (`DMA1`) streaming ADC samples continuously into a $200\text{-sample}$ circular Ping-Pong double buffer in SRAM.
* A Serial Peripheral Interface controller (`SPI1`) communicating with an external Flash memory chip.
* An Independent Watchdog Timer (`IWDG`) enforcing hardware auto-reset protection against software hangs.

```text
THE MULTI-PERIPHERAL HARDWARE COORDINATION MATRIX

 ┌─────────────────────────────────────────────────────────────┐
 │ CPU Core Pipeline (168 MHz / 3.2 GHz)                       │
 ├─────────────────────────────────────────────────────────────┤
 │ Memory Protection Unit (MPU) -> Enforces Stack Guard        │
 ├─────────────────────────────────────────────────────────────┤
 │ NVIC Interrupt Controller    -> Manages Preemption Ranks    │
 ├─────────────────────────────────────────────────────────────┤
 │ TIM2 TRGO Hardware Trigger   -> Triggers ADC1 at 100 Hz     │
 ├─────────────────────────────────────────────────────────────┤
 │ DMA1 Circular Engine         -> Fills SRAM Ping-Pong Buffer │
 ├─────────────────────────────────────────────────────────────┤
 │ SPI1 Bus Controller          -> Reads External Flash        │
 ├─────────────────────────────────────────────────────────────┤
 │ IWDG Watchdog Timer          -> Enforces Hardware Auto-Reset│
 └─────────────────────────────────────────────────────────────┘
 (10+ Hardware Subsystems MUST execute concurrently without race conditions!)
```

If an embedded systems architect attempts to integrate these individual hardware peripherals without a unified **Event-Driven Assembly Execution Loop**, a formal **Bootstrapping Pipeline**, and **Non-Intrusive Hardware Tracing (SWO/ITM)**, three severe system-level hardware failures occur:

1. **Catastrophic Inter-Peripheral Race Conditions and Memory Corruption**:
   Suppose a $100\text{-Hz}$ timer interrupt ($IRQ_{\text{TIM2}}$) preempts a DMA Half-Transfer interrupt ($IRQ_{\text{DMA}}$) while the DMA $ISR$ is midway through updating a global processing flag in RAM. 

   If interrupt priorities and critical section barriers (`cpsid i` / `cpsie i`) are mis-configured, the timer $ISR$ reads corrupted, partially updated RAM flags, executing incorrect control decisions that damage physical machinery!

2. **The Low-Power Sleep Race Condition (The Missed-Event Permanent Freeze)**:
   If the main software loop attempts to enter low-power sleep state (`WFI`) by checking an event flag in RAM *without* masking interrupts first, an interrupt can fire in the split-second window between checking the flag and executing `WFI`. 

   The $ISR$ executes, sets the flag in RAM, and returns. The main loop then executes `WFI` and **goes to sleep forever**, unaware that the event already happened! The system freezes permanently until power is cycled!

3. **The "Blind System Debugging" Failure**:
   In a bare-metal environment, there is no operating system kernel, no display monitor, and no software `printf()` function. 

   If a complex system crashes silently or enters an infinite loop, attempting to debug the system by inserting software polling loops or toggling GPIO pins distorts real-time peripheral timing, hiding the bug! 

   Without a dedicated, zero-latency hardware tracing pipeline, engineers cannot inspect internal register states, variable values, or execution paths in real time.

To combine all bare-metal hardware primitives into a rock-solid, zero-race-condition, energy-optimal, and fully debuggable system, computer architects synthesize an **Integrated Bare-Metal System**, an **Event-Driven Assembly Execution Loop**, and **Hardware SWO/ITM Tracing**.


### Step 1: The Master Conductor's Score (System Bootstrapping & NVIC Priorities)

To create music instead of noise, the conductor (**The System Bootstrapping Sequence**) establishes strict rules before the concert begins:

1. **Seat Assignments & Rules (MPU Setup)**:
   The conductor paints strict lines on the stage floor (**MPU Regions**). The violinists must stay in Section A (**RAM Data**), the trumpeters in Section B (**Flash ROM**), and an electrified fence separates the stage from the orchestra pit (**Stack Guard Region**)!
2. **Sheet Music Tuning (Clock Tree & PLL Setup)**:
   The conductor tunes all instruments to an exact $440\text{-Hz}$ tuning fork (**External Crystal HSE & PLL**).
3. **Soloist Hierarchy (NVIC Priority Grouping)**:
   The conductor assigns preemption ranks to every musician:
   * **Rank 0 (Highest)**: The timpanist warning of an emergency (**Motor Safety Over-Current**).
   * **Rank 1**: The violinist delivering data (**ADC DMA Half-Transfer**).
   * **Rank 2**: The trumpet player sending reports (**SPI Flash Read**).


### Step 3: The Single-Way Glass Recording Booth (Hardware SWO / ITM Tracing)

How does a music critic (**The Embedded Systems Engineer**) record and debug the performance without standing on stage or interrupting the musicians?

If the critic walks onto the stage and taps musicians on the shoulder to ask *"What note are you playing?"* (**Software Polling / Printf Debugging**), they disrupt the musicians and ruin the timing of the song!

Instead, the concert hall installs a **Single-Way Glass Recording Booth (Instrumentation Trace Macrocell / ITM)** equipped with a high-speed laser microphone (**Serial Wire Output / `SWO` Pin**):

```text
SINGLE-WAY GLASS RECORDING BOOTH (SWO / ITM TRACING)

 Orchestra Stage (CPU Core & Peripherals)
 ┌───────────────────────────────────────────────────────────┐
 │ Musicians play music at 10,000 notes / sec (3.2 GHz)      │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ One-Way Laser Microphone (1-Cycle ITM Write: 0.3125 ns!)
 ┌───────────────────────────────────────────────────────────┐
 │ SINGLE-WIRE OUTPUT PIN (SWO / TRACESWO Pin PB3)           │
 │ Streams diagnostic bytes asynchronously to External Laptop│
 └───────────────────────────────────────────────────────────┘
 (Zero performance impact! 100% non-intrusive real-time debugging!)
```

1. Inside the CPU core sits a dedicated hardware module: **The Instrumentation Trace Macrocell (ITM)**.
2. When an assembly instruction wants to log a diagnostic byte, it writes the byte to an **ITM Stimulus Register (`ITM_STIM0`)** in a single clock cycle ($0.3125\text{ ns}$).
3. The hardware ITM module takes the byte and streams it out of a dedicated physical pin (**`SWO` / `TRACESWO` Pin `PB3`**) asynchronously at high speed!
4. **Zero Performance Impact**: The orchestra plays at full $100\%$ speed. The critic receives real-time diagnostic logs on their laptop screen without the musicians ever knowing they are being recorded!

This symphony orchestra system is the exact physical analogue of **Complete Bare-Metal System Synthesis**:
* The conductor is the **Event-Driven Assembly Main Loop**.
* Musicians are **Hardware Peripherals (ADC, SPI, Timers, DMA, MPU)**.
* Preemption ranks are **NVIC Priority Grouping Settings**.
* Lowering the baton is **Executing `WFI` Low-Power Sleep**.
* The Glass Recording Booth is **Hardware ITM Tracing (`ITM_STIM0`)**.
* The single-wire microphone is the **Serial Wire Output Pin (`SWO`)**.


### The Master Bootstrapping Order Rule

Why must the initialization steps in the flowchart above execute in this exact, non-negotiable physical sequence?

1. **Memory Copy Before Code Execution**:
   Software cannot read initialized global variables (`.data`) or expect un-initialized flags (`.bss`) to be zero until the assembly startup loops copy values from Flash to RAM and clear `.bss`!
2. **MPU Protection Before Stack Usage**:
   The MPU Stack Guard Region must be activated *before* nested function calls occur, ensuring any early stack overflow is caught instantly.
3. **Flash Wait States Before PLL Clock Switch**:
   Flash wait states (`FLASH_ACR.LATENCY = 5`) MUST be configured *before* switching `SYSCLK` to $168\text{ MHz}$. Switching the clock first causes the CPU to fetch instructions faster than Flash memory can respond, triggering an immediate `HardFault` crash!
4. **Peripheral Clock Enables Before MMIO Access**:
   Peripheral clock gates in `RCC_AHB1ENR` / `RCC_APB1ENR` MUST be enabled before writing to peripheral registers, preventing `BusFault` exceptions.
5. **Global Interrupts Enabled LAST (`cpsie i`)**:
   Global interrupts MUST remain disabled (`cpsid i`) throughout initialization, turning ON only after all vector table handlers, DMA buffers, and peripheral control registers are $100\%$ initialized!


### The Mathematical Proof of Race-Free Sleep Entry

Why must interrupts be masked using `cpsid i` *before* checking event flags in RAM?

Consider the race condition that occurs if interrupts are NOT masked before checking flags:

#### The Unsafe Sequence (Vulnerable to Permanent Lockup):
1. Main loop reads `event_flag` from RAM (`0`). Main loop decides no work is ready.
2. **THE RACE EVENT**: An $IRQ$ fires right after the `CMP` instruction, but *before* `WFI` executes!
3. The CPU enters the $ISR$, processes the hardware event, sets `event_flag = 1` in RAM, and returns (`bx lr`).
4. The main loop resumes at the `WFI` instruction!
5. **The Lockup**: The main loop executes `WFI` and **goes to sleep**, completely unaware that `event_flag` was just set to $1$! The CPU sleeps forever, and the event is never processed!

#### The Safe Assembly Sequence (`cpsid i` + `WFI`):

```assembly
/* SAFE RACE-FREE EVENT-DRIVEN SLEEP LOOP IN ASSEMBLY */
event_loop_safe:
    cpsid   i                   /* Step 1: Mask IRQ servicing (PRIMASK = 1) */

    ldr     r0, =event_flags
    ldr     r1, [r0]            /* Step 2: Read event flags from RAM */
    cmp     r1, #0              /* Are any event flags set (r1 != 0)? */
    bne     dispatch_events     /* If work is ready, jump to dispatch! */

    /* Step 3A: No work ready -> Enter WFI sleep safely! */
    dsb                         /* Data Synchronization Barrier */
    wfi                         /* SLEEP! CPU clock freezes here! */

    /* WAKEUP MECHANICS: In ARM architecture, a pending IRQ WILL WAKE WFI */
    /* EVEN WHEN PRIMASK = 1! The CPU wakes up and continues to Step 3B! */

dispatch_events:
    cpsie   i                   /* Step 3B: Unmask IRQ servicing -> Executes pending ISR! */

    /* Process event data in assembly... */
    bl      process_active_events

    /* REFRESH WATCHDOG ONLY IN MAIN LOOP AFTER VERIFYING SYSTEM HEALTH! */
    ldr     r2, =IWDG_KR
    ldr     r3, =0xAAAA         /* Magic Key 0xAAAA = Refresh Watchdog */
    str     r3, [r2]

    b       event_loop_safe     /* Repeat master event loop! */
```

#### Why `cpsid i` + `WFI` is $100\%$ Race-Free in Silicon:
Per the ARM Architecture Specification:
> **The `WFI` Masked-Wakeup Invariant**: An enabled hardware interrupt ($IRQ$) whose pending bit is set in the NVIC **WILL WAKE THE CPU FROM `WFI` SLEEP EVEN WHEN `PRIMASK = 1` (INTERRUPTS MASKED)**!

If an $IRQ$ fires after `cpsid i` and sets its pending bit:
1. The CPU reaches the `wfi` instruction.
2. The hardware NVIC detects that a pending $IRQ$ exists.
3. **The CPU DOES NOT SLEEP!** `wfi` completes in $0\text{ sleep cycles}$!
4. The CPU proceeds directly to `cpsie i`, unmasks `PRIMASK`, and enters the $ISR$ immediately!
5. Zero events are ever missed, and zero sleep deadlocks occur!


### Internal Structure of the ITM Peripheral

The ITM peripheral provides **32 independent Stimulus Registers (`ITM_STIM0` .. `ITM_STIM31`)** mapped to MMIO offsets `0x000` through `0x07C`:

```text
ITM STIMULUS REGISTER MAP (BASE: 0xE000_0000)

 Byte Offset │ Register Name │ Width   │ Functional Diagnostic Purpose
─────────────┼───────────────┼─────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ ITM_STIM0     │ 32 Bits │ Stimulus Port 0 (Standard ASCII Console / Log Output)
  Offset 0x04│ ITM_STIM1     │ 32 Bits │ Stimulus Port 1 (OS Task / Event ID Tracing)
  Offset 0x08│ ITM_STIM2     │ 32 Bits │ Stimulus Port 2 (Error & Exception Logging)
  ...        │ ...           │ ...     │ ...
  Offset 0xE00│ ITM_TER      │ 32 Bits │ Trace Enable Register (Bitmask enabling Ports 0..31)
  Offset 0xE80│ ITM_TCR      │ 32 Bits │ Trace Control Register (ITM Enable, Bus ID, Speed)
```

#### How ITM Tracing Operates in Hardware:

1. **The 1-Cycle Software Write**:
   To log a diagnostic ASCII character (e.g., `'A'` $= \text{0x41}$) or a 32-bit variable value in assembly:
   
   Software writes the value directly to **ITM Stimulus Register 0 (`ITM_STIM0`)**:
   ```assembly
   /* NON-INTRUSIVE ITM TRACE LOGGING IN ASSEMBLY */
   ldr     r0, =0xE0000000     /* r0 = ITM_STIM0 Address */
   movs    r1, #0x41           /* r1 = ASCII 'A' */
   strb    r1, [r0]            /* Write byte to ITM_STIM0 (1 Clock Cycle!) */
   ```

2. **Zero CPU Pipeline Delay**:
   Writing to `ITM_STIM0` takes **$1\text{ single CPU clock cycle}$ ($0.3125\text{ ns}$ at $3.2\text{ GHz}$)**! 
   
   Unlike UART software printing (which takes $86,805\text{ ns}$ per byte), writing to ITM is **$277,000\times$ faster**, introducing $0\%$ measurable timing distortion to real-time control loops!

3. **Asynchronous Serial SWO Output**:
   The internal **Trace Port Interface Unit (TPIU)** encapsulates the written byte into an ITM trace packet and serializes it out through a single dedicated physical pin: **The Serial Wire Output pin (`SWO` / `TRACESWO` on GPIO pin `PB3`)**.

4. **External Debugger Reception**:
   An external JTAG/SWD debug probe (such as an ST-Link, J-Link, or Keil ULINK) reads the high-speed serial stream from the `SWO` pin and displays the ASCII text or variable values on the developer's laptop screen in real time!


### 2. Priority Collisions Between DMA Interrupts and Peripheral Timers

When integrating a high-speed ADC DMA engine with a periodic $100\text{-Hz}$ control timer:

If the ADC DMA Half-Transfer interrupt (`HTIF`) and the Timer `TRGO` overflow interrupt fire at the exact same physical clock cycle:
* The NVIC evaluates their programmed preemption priorities (`IPR` registers).
* **If $IRQ_{\text{DMA}}$ and $IRQ_{\text{Timer}}$ have the same Preemption Priority**:
  * The NVIC uses the **Vector Position Tie-Breaker** (lower $IRQ$ number wins!).
  * $IRQ_{11}$ (DMA1 Channel 1) beats $IRQ_{28}$ (TIM2).
  * DMA $ISR$ executes first; Timer $ISR$ is set to Pending state and executes immediately afterward via **Tail-Chaining ($6\text{ cycles}$)**!


### Scenario and Parameters

You are the chief bare-metal systems architect synthesizing the complete firmware for an enterprise $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ ENTERPRISE SERVER MANAGEMENT CONTROLLER SUBSYSTEM

 Complete System Component Inventory:
 ┌─────────────────────────────────────────────────────────────┐
 │ CPU Core (3.2 GHz)           │ Flash ROM (64 KB @ 0x0800)  │
 │ Internal SRAM (16 KB @ 0x2000)│ MPU Guard (256B @ 0x2000_1F00)│
 │ PLL Clock Tree (168 MHz)     │ NVIC Priority Grouping (PRIGROUP=5)│
 │ TIM2 TRGO Timer (100 Hz)     │ ADC1 DMA Ping-Pong Buffer (200s)│
 │ SPI1 Flash Reader (21 MHz)   │ IWDG Watchdog Timer (2.0s)  │
 │ Hardware ITM Tracer (SWO)    │ Race-Free WFI Event Loop    │
 └─────────────────────────────────────────────────────────────┘
```

#### Complete Subsystem Operating Parameters:
* **System Clock**: $f_{\text{SYSCLK}} = \mathbf{168.000 \text{ MHz}}$ ($T_{\text{HCLK}} = 5.952\text{ ns}$). Flash Wait States $= 5$ (`FLASH_ACR.LATENCY = 5`).
* **SRAM Memory Layout**: Base `0x2000_0000`, Size $16\text{ KB}$ (`0x2000_4000` Top of RAM / Initial $SP$).
  * `.data` Section: Size $= 512\text{ Bytes}$ (`_sdata = 0x2000_0000`, `_edata = 0x2000_0200`, `_sidata = 0x0800_1000`).
  * `.bss` Section: Size $= 1,024\text{ Bytes}$ (`_sbss = 0x2000_0200`, `_ebss = 0x2000_0600`).
  * MPU Stack Guard Region 2: Base `0x2000_1F00`, Size $= 256\text{ Bytes}$, `AP = 3'b000` (No Access), `XN = 1`.
* **TIM2 TRGO & ADC1 DMA**: `TIM2` generates `TRGO` pulses at $100.0\text{ Hz}$ ($10.0\text{ ms}$ period). `ADC1` samples `PA0` and transfers samples via `DMA1 Channel 1` into `adc_buffer[400]` in Circular Ping-Pong mode.
* **IWDG Watchdog**: Prescaler $= 32$ ($D_{\text{prescaler}} = 32$), $RLR = 1,999 \implies \text{Timeout } T_{\text{IWDG}} = \mathbf{2.000 \text{ Seconds}}$.

#### Your Objective

1. Calculate the total CPU clock cycles and physical time consumed during the complete **Master System Bootstrapping Pipeline** (from reset release through .data copy, .bss zeroing, MPU setup, PLL clock lock, and peripheral initialization) before entering the main loop.
2. Trace the physical state transitions of the **Race-Free Event-Driven Assembly Main Loop** when a `DMA1` Half-Transfer interrupt (`HTIF1`) fires at $t = 10.0\text{ ms}$:
   * Show `cpsid i` masking, event flag checking, `WFI` sleep entry, interrupt wakeup, `cpsie i` unmasking, event task execution, ITM logging, and `IWDG` watchdog refresh.
3. Calculate the total CPU power savings (in percent) achieved by the event-driven `WFI` main loop compared to a software polling loop over a 1.0-second operating window (active processing time $= 2.0\text{ ms}$ per second).
4. Write the complete, production-ready, fully synthesized ARM Assembly program (`main.s` / `startup.s`) integrating the reset vector table, bootstrapping pipeline, MPU stack guard, PLL clock setup, DMA Ping-Pong ISR, ITM trace logging, IWDG refresh, and race-free `WFI` main loop.
5. Verify mathematical, structural, and system correctness.


#### Step 2: Trace Event-Driven Main Loop and DMA `HT` Interrupt Execution

Initial State: CPU enters `main_event_loop`. `system_flags = 0`.

##### 1. Cycle 0 ($t = 0.0\text{ ms}$ — Entering Sleep):
* Main loop executes `cpsid i` (Masks IRQ servicing, `PRIMASK = 1`).
* Reads `system_flags` ($0$). No tasks pending!
* Executes `dsb` followed by `wfi`.
* **CPU CLOCK TREE HALTS!** $HCLK = 0\text{ Hz}$. CPU enters low-power sleep mode ($P_{\text{dynamic}} = 0\text{ W}$).

##### 2. Event $t = 10.0\text{ ms}$ (DMA1 Channel 1 Half-Transfer Interrupt `HTIF1` Fires!):
* `DMA1 Channel 1` finishes writing 100 samples into `adc_buffer[0..99]`.
* DMA hardware sets `HTIF1 = 1` in `DMA1_ISR` and asserts $IRQ_{11}$ to the NVIC.
* **WFI WAKEUP EVENT**: The NVIC detects pending $IRQ_{11}$.
* **The CPU Wakes Up Instantly** (`wfi` completes in $0\text{ sleep cycles}$)!
* The CPU proceeds to the next instruction: `cpsie i` (Unmasks `PRIMASK = 0`).

##### 3. $ISR$ Execution (`DMA1_Channel1_IRQHandler`):
* CPU hardware stacks 8 registers ($32\text{ bytes}$) and jumps to `DMA1_Channel1_IRQHandler`.
* $ISR$ reads `DMA1_ISR`, detects `HTIF1 = 1`, and writes $1$ to `CHTIF1` in `DMA1_IFCR` (Clears flag!).
* $ISR$ sets Bit 0 (`BUF0_READY = 1`) in global variable `system_flags` in RAM.
* $ISR$ executes `dsb` and `bx lr` (Unstacks registers and returns to main loop!).

##### 4. Event Processing in Main Loop:
* Main loop sees `BUF0_READY = 1`.
* Main loop calls `process_buffer_0()` in assembly to run DSP calculations on `adc_buffer[0..99]`.
* Main loop writes **`ITM_STIM0 = 0x41` ('A')** to stream diagnostic confirmation out of the single-wire `SWO` pin in $1\text{ clock cycle}$ ($0.3125\text{ ns}$)!
* Main loop clears Bit 0 in `system_flags`.
* **WATCHDOG REFRESH**: Main loop writes `0xAAAA` to `IWDG_KR` (Refreshes $2.0\text{-second}$ watchdog!).
* Main loop loops back to `cpsid i` $\to$ checks flags ($0$) $\to$ **`wfi` (Re-enters Low-Power Sleep!)**.

```text
SYNTHESIZED EVENT-DRIVEN EXECUTION CHRONOLOGY

 Time (ms) │ Executing Subsystem Domain   │ Power Level │ Hardware / Register Action
───────────┼──────────────────────────────┼─────────────┼─────────────────────────────────────────────
   0.00    │ Main Event Loop (wfi)        │ 0.05 mW     │ CPU Clock HCLK Frozen! Sleeping...
  10.00    │ DMA1 Hardware Interrupt (HT) │ 120.0 mW    │ WFI Wakes! ISR sets BUF0_READY = 1.
  10.01    │ Main Loop Event Processing   │ 120.0 mW    │ DSP Math on Buffer 0; Writes ITM_STIM0 ('A')
  10.05    │ Main Loop Watchdog Refresh   │ 120.0 mW    │ Writes 0xAAAA to IWDG_KR!
  10.06    │ Main Event Loop (wfi)        │ 0.05 mW     │ CPU Clock HCLK Frozen! Re-enters Sleep!
```


#### Step 4: Complete Production Assembly Subsystem Synthesis Code

Here is the complete, fully synthesized ARM Assembly source file (`main.s`):

```assembly
/* COMPLETE SYNTHESIZED BARE-METAL SUBSYSTEM ENGINE IN ARM ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* ==================================================================== */
/* MMIO REGISTER ADDRESS MAP                                            */
/* ==================================================================== */
.equ RCC_AHB1ENR,     0x40023830
.equ RCC_APB1ENR,     0x40023840
.equ RCC_APB2ENR,     0x40023844
.equ RCC_CR,          0x40023800
.equ RCC_CFGR,        0x40023808
.equ FLASH_ACR,       0x40023C00

.equ GPIOA_MODER,     0x40020000
.equ GPIOA_AFRH,      0x40020024
.equ GPIOA_OSPEEDR,   0x40020008

.equ TIM2_CR1,        0x40000000
.equ TIM2_CR2,        0x40000004
.equ TIM2_PSC,        0x40000028
.equ TIM2_ARR,        0x4000002C
.equ TIM2_EGR,        0x40000014

.equ ADC1_SR,         0x40012000
.equ ADC1_CR1,        0x40012004
.equ ADC1_CR2,        0x40012008
.equ ADC1_SMPR2,      0x4001200C
.equ ADC1_DR,         0x4001204C

.equ DMA1_ISR,        0x40020000
.equ DMA1_IFCR,       0x40020004
.equ DMA1_CCR1,       0x40020008
.equ DMA1_CNDTR1,     0x4002000C
.equ DMA1_CPAR1,      0x40020010
.equ DMA1_CMAR1,      0x40020014

.equ IWDG_KR,         0x40003000
.equ IWDG_PR,         0x40003004
.equ IWDG_RLR,        0x40003008

.equ MPU_CTRL,        0xE000ED94
.equ MPU_RBAR,        0xE000ED9C
.equ MPU_RASR,        0xE000EDA0
.equ SCB_AIRCR,       0xE000ED0C
.equ NVIC_ISER0,      0xE000E100
.equ ITM_STIM0,       0xE0000000

/* RAM Data Allocations */
.section .bss
.align 3
.global system_flags
system_flags:
    .space 4                            /* 32-bit Event Flags */
.global adc_buffer
adc_buffer:
    .space 400                          /* 200 Samples Ping-Pong Buffer (400 Bytes) */

/* ==================================================================== */
/* HARDWARE VECTOR TABLE                                                */
/* ==================================================================== */
.section .isr_vector, "a"
.word 0x20004000                        /* Vector 0: Initial Stack Pointer (Top of RAM) */
.word Reset_Handler                     /* Vector 1: Reset Handler Entry */
.word Default_Handler                   /* Vector 2: NMI */
.word HardFault_Handler                 /* Vector 3: HardFault Handler */
.word Default_Handler                   /* Vector 4: MemManage */
.word Default_Handler                   /* Vector 5: BusFault */
.word Default_Handler                   /* Vector 6: UsageFault */
.word 0, 0, 0, 0                        /* Reserved */
.word Default_Handler                   /* Vector 11: SVCall */
.word Default_Handler                   /* Vector 12: DebugMon */
.word 0                                 /* Reserved */
.word Default_Handler                   /* Vector 14: PendSV */
.word Default_Handler                   /* Vector 15: SysTick */

/* External Peripheral Vectors */
.word Default_Handler                   /* IRQ 0: WWDG */
.word 0, 0, 0, 0, 0, 0, 0, 0, 0, 0      /* IRQs 1..9 */
.word Default_Handler                   /* IRQ 10: RTC */
.word DMA1_Channel1_IRQHandler          /* IRQ 11: DMA1 Channel 1 Handler */
.word 0, 0, 0, 0, 0, 0                  /* IRQs 12..17 */
.word Default_Handler                   /* IRQ 18: ADC1 Handler */

/* Set weak default catch-all aliases */
.weak Default_Handler
.thumb_set Default_Handler, Infinite_Trap_Loop

.section .text
.syntax unified
.type Reset_Handler, %function
.thumb_func
Reset_Handler:
    cpsid   i                           /* Disable interrupts during startup */

    /* ---------------------------------------------------------------- */
    /* 1. COPY .DATA SECTION FROM FLASH TO SRAM (4x Unrolled Word Loop) */
    /* ---------------------------------------------------------------- */
    ldr     r0, =_sidata
    ldr     r1, =_sdata
    ldr     r2, =_edata
    sub     r3, r2, r1
    lsrs    r3, r3, #4                  /* r3 = Number of 16-byte blocks */
    beq     copy_data_tail

copy_data_loop:
    ldmia   r0!, {r4, r5, r6, r7}
    stmia   r1!, {r4, r5, r6, r7}
    subs    r3, r3, #1
    bne     copy_data_loop

copy_data_tail:
    cmp     r1, r2
    bge     data_done
    ldr     r4, [r0], #4
    str     r4, [r1], #4
    b       copy_data_tail
data_done:

    /* ---------------------------------------------------------------- */
    /* 2. ZERO .BSS SECTION IN SRAM (4x Unrolled Word Loop)             */
    /* ---------------------------------------------------------------- */
    ldr     r1, =_sbss
    ldr     r2, =_ebss
    sub     r3, r2, r1
    lsrs    r3, r3, #4
    movs    r4, #0
    movs    r5, #0
    movs    r6, #0
    movs    r7, #0
    beq     zero_bss_tail

zero_bss_loop:
    stmia   r1!, {r4, r5, r6, r7}
    subs    r3, r3, #1
    bne     zero_bss_loop

zero_bss_tail:
    cmp     r1, r2
    bge     bss_done
    str     r4, [r1], #4
    b       zero_bss_tail
bss_done:

    /* ---------------------------------------------------------------- */
    /* 3. CONFIGURE MPU STACK GUARD REGION                              */
    /* ---------------------------------------------------------------- */
    /* Region 0: Flash ROM (0x0800_0000, 64KB, RO, Executable) */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x08000010
    str     r1, [r0]
    ldr     r0, =MPU_RASR
    ldr     r1, =0x0606001F
    str     r1, [r0]

    /* Region 1: SRAM Data (0x2000_0000, 16KB, RW, XN=1) */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x20000011
    str     r1, [r0]
    ldr     r0, =MPU_RASR
    ldr     r1, =0x1306001B
    str     r1, [r0]

    /* Region 2: Stack Guard Region (0x2000_1F00, 256B, NO-ACCESS, XN=1) */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x20001F12
    str     r1, [r0]
    ldr     r0, =MPU_RASR
    ldr     r1, =0x1000000F
    str     r1, [r0]

    /* Enable MPU with PRIVDEFENA=1 */
    ldr     r0, =MPU_CTRL
    movs    r1, #5
    str     r1, [r0]
    dsb
    isb

    /* ---------------------------------------------------------------- */
    /* 4. CONFIGURE SYSTEM CLOCK TREE (HSE -> PLL -> 168 MHz SYSCLK)     */
    /* ---------------------------------------------------------------- */
    /* Enable HSE Crystal (8 MHz) */
    ldr     r0, =RCC_CR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 16)
    str     r1, [r0]
wait_hse:
    ldr     r1, [r0]
    tst     r1, #(1 << 17)
    beq     wait_hse

    /* Set Flash Wait States = 5, Prefetch = 1 */
    ldr     r2, =FLASH_ACR
    ldr     r3, [r2]
    orr     r3, r3, #5
    orr     r3, r3, #(1 << 8)
    str     r3, [r2]

    /* Configure Prescalers & PLL (168 MHz Output) */
    ldr     r0, =RCC_CFGR
    ldr     r1, [r0]
    orr     r1, r1, #(0x5 << 10)       /* PPRE1 = /4 (42 MHz) */
    orr     r1, r1, #(0x4 << 13)       /* PPRE2 = /2 (84 MHz) */
    str     r1, [r0]

    /* Enable PLL */
    ldr     r0, =RCC_CR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 24)
    str     r1, [r0]
wait_pll:
    ldr     r1, [r0]
    tst     r1, #(1 << 25)
    beq     wait_pll

    /* Switch SYSCLK to PLL */
    ldr     r0, =RCC_CFGR
    ldr     r1, [r0]
    orr     r1, r1, #0x2
    str     r1, [r0]

    /* ---------------------------------------------------------------- */
    /* 5. CONFIGURE NVIC PRIORITY GROUPING (PRIGROUP = 5)              */
    /* ---------------------------------------------------------------- */
    ldr     r0, =SCB_AIRCR
    ldr     r1, =(0x05FA0000 | (5 << 8))
    str     r1, [r0]

    /* ---------------------------------------------------------------- */
    /* 6. INITIALIZE PERIPHERALS: GPIO, TIM2 TRGO, ADC1 DMA, IWDG       */
    /* ---------------------------------------------------------------- */
    /* Enable Peripherals Clock Gates */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #((1 << 0) | (1 << 21)) /* GPIOAEN = 1, DMA1EN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #((1 << 0) | (1 << 12)) /* TIM2EN = 1, IWDGEN = 1 */
    str     r1, [r0]

    ldr     r0, =RCC_APB2ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 8)           /* ADC1EN = 1 */
    str     r1, [r0]
    dsb

    /* Configure PA0 for Analog Input (MODER0 = 2'b11) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, [r0]
    orr     r1, r1, #0x3
    str     r1, [r0]

    /* Configure TIM2 TRGO Output at 100 Hz (MMS = 3'b010) */
    ldr     r0, =TIM2_PSC
    ldr     r1, =8399
    str     r1, [r0]
    ldr     r0, =TIM2_ARR
    movs    r1, #99
    str     r1, [r0]
    ldr     r0, =TIM2_CR2
    movs    r1, #(0x2 << 4)
    str     r1, [r0]

    /* Configure DMA1 Channel 1 for Circular Ping-Pong Buffering */
    ldr     r0, =DMA1_CPAR1
    ldr     r1, =ADC1_DR
    str     r1, [r0]
    ldr     r0, =DMA1_CMAR1
    ldr     r1, =adc_buffer
    str     r1, [r0]
    ldr     r0, =DMA1_CNDTR1
    movs    r1, #400
    str     r1, [r0]
    ldr     r0, =DMA1_CCR1
    ldr     r1, =((1 << 5) | (1 << 7) | (0x1 << 8) | (0x1 << 10) | (1 << 2) | (1 << 1) | (1 << 0))
    str     r1, [r0]                    /* CIRC=1, MINC=1, PSIZE=16b, MSIZE=16b, HTIE=1, TCIE=1, EN=1 */

    /* Configure ADC1 with TIM2 TRGO Trigger & DMA Enable */
    ldr     r0, =ADC1_SMPR2
    movs    r1, #0x1
    str     r1, [r0]                    /* 15 Cycles Sample Time */
    ldr     r0, =ADC1_CR2
    ldr     r1, =((1 << 28) | (0x6 << 24) | (1 << 8) | (1 << 0))
    str     r1, [r0]                    /* EXTEN=01, EXTSEL=TIM2_TRGO, DMA=1, ADON=1 */

    /* Enable DMA1 Channel 1 IRQ 11 in NVIC */
    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 11)
    str     r1, [r0]

    /* Start TIM2 Counter (CEN = 1) */
    ldr     r0, =TIM2_CR1
    movs    r1, #1
    str     r1, [r0]

    /* Initialize IWDG Watchdog Timer (2.0s Timeout) */
    ldr     r0, =IWDG_KR
    ldr     r1, =0x5555                 /* Unlock PR and RLR */
    str     r1, [r0]
    ldr     r0, =IWDG_PR
    movs    r1, #3                      /* Prescaler /32 */
    str     r1, [r0]
    ldr     r0, =IWDG_RLR
    ldr     r1, =1999                   /* RLR = 1,999 */
    str     r1, [r0]
    ldr     r0, =IWDG_KR
    ldr     r1, =0xCCCC                 /* Start Watchdog */
    str     r1, [r0]

    /* ---------------------------------------------------------------- */
    /* 7. ENTER RACE-FREE EVENT-DRIVEN LOW-POWER MAIN LOOP             */
    /* ---------------------------------------------------------------- */
    cpsie   i                           /* Unmask global interrupts! */

main_event_loop:
    cpsid   i                           /* Mask IRQs to check event_flags safely */

    ldr     r0, =system_flags
    ldr     r1, [r0]
    cmp     r1, #0                      /* Any event flags set in RAM? */
    bne     dispatch_system_events

    /* No events ready: Sleep safely in WFI mode! */
    dsb
    wfi                                 /* HALT CPU CLOCK! (0.05 mW Power Mode) */

dispatch_system_events:
    cpsie   i                           /* Unmask IRQs to service pending ISR */

    /* Read and clear system_flags */
    ldr     r0, =system_flags
    ldr     r1, [r0]
    movs    r2, #0
    str     r2, [r0]                    /* Clear flags */

    /* Log ITM Diagnostic Trace Byte out of SWO pin ('A' = 0x41) */
    ldr     r3, =ITM_STIM0
    movs    r4, #0x41
    strb    r4, [r3]                    /* 1-Cycle Non-Intrusive ITM Trace Write! */

    /* REFRESH IWDG WATCHDOG ONLY IN MAIN LOOP AFTER TASK VERIFICATION! */
    ldr     r3, =IWDG_KR
    ldr     r4, =0xAAAA                 /* Magic Key 0xAAAA = Refresh Watchdog */
    str     r4, [r3]

    b       main_event_loop             /* Loop back to sleep again! */

/* ==================================================================== */
/* DMA1 CHANNEL 1 INTERRUPT SERVICE ROUTINE                              */
/* ==================================================================== */
.global DMA1_Channel1_IRQHandler
.type DMA1_Channel1_IRQHandler, %function
.thumb_func
DMA1_Channel1_IRQHandler:
    push    {r4, lr}

    ldr     r0, =DMA1_ISR
    ldr     r1, [r0]

    /* Check Half-Transfer Flag (HTIF1 = Bit 2) */
    tst     r1, #(1 << 2)
    beq     check_tc

    /* Clear HTIF1 flag in DMA1_IFCR (W1C) */
    ldr     r2, =DMA1_IFCR
    movs    r3, #(1 << 2)
    str     r3, [r2]

    /* Set Bit 0 (BUF0_READY) in system_flags */
    ldr     r4, =system_flags
    ldr     r5, [r4]
    orr     r5, r5, #1
    str     r5, [r4]
    b       isr_exit

check_tc:
    /* Check Transfer-Complete Flag (TCIF1 = Bit 1) */
    tst     r1, #(1 << 1)
    beq     isr_exit

    /* Clear TCIF1 flag in DMA1_IFCR (W1C) */
    ldr     r2, =DMA1_IFCR
    movs    r3, #(1 << 1)
    str     r3, [r2]

    /* Set Bit 1 (BUF1_READY) in system_flags */
    ldr     r4, =system_flags
    ldr     r5, [r4]
    orr     r5, r5, #2
    str     r5, [r4]

isr_exit:
    dsb
    pop     {r4, pc}

/* ==================================================================== */
/* HARDFAULT EXCEPTION DIAGNOSTIC HANDLER                               */
/* ==================================================================== */
.global HardFault_Handler
.type HardFault_Handler, %function
.thumb_func
HardFault_Handler:
    tst     lr, #4
    ite     eq
    mrseq   r0, msp
    mrsne   r0, psp
    /* r0 points to Stack Frame [r0, r1, r2, r3, r12, LR, PC, xPSR] */
    ldr     r1, [r0, #24]               /* r1 = Faulting PC Instruction Address */

    /* Log Fault PC via ITM Stimulus Port 0 */
    ldr     r2, =ITM_STIM0
    str     r1, [r2]

Infinite_Trap_Loop:
    b       .                           /* Trap CPU safely for debugging */
.size Reset_Handler, .-Reset_Handler
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Integrated Bare-Metal System**: The synthesized, end-to-end bare-metal firmware architecture that unifies reset vectoring, memory section initialization, PLL clock tree locks, MPU stack guard regions, NVIC priority grouping, DMA circular ping-pong buffering, and hardware watchdog protection into a single deterministic, zero-race-condition execution fabric.
* **Event-Driven Assembly Execution Loop**: The master software architecture pattern where the CPU remains parked in atomic low-power sleep (`cpsid i` $\to$ flag check $\to$ `wfi` $\to$ `cpsie i`) for $99\%+$ of its operational life, waking up only when hardware $ISRs$ or DMA completion events update flags in RAM.
* **Hardware SWO/ITM Tracing**: A non-intrusive diagnostic hardware mechanism (Instrumentation Trace Macrocell at `0xE000_0000`) that streams diagnostic bytes out of a single physical pin (`SWO`) in $1\text{ CPU clock cycle}$, enabling real-time bare-metal debugging without stalling execution pipelines.

TERMINADO