---
title: "Bare-Metal DMA Channel Configuration, Ping-Pong Double Buffering, and Half-Transfer Interruption Mechanics"
---

# Bare-Metal DMA Channel Configuration, Ping-Pong Double Buffering, and Half-Transfer Interruption Mechanics

## The High-Bandwidth Peripheral Streaming Wall

In high-performance embedded systems engineering, microcontrollers interact with high-speed digital and analog sensors—such as an Analog-to-Digital Converter (ADC) sampling continuous audio waveforms at $1.0\text{ Megasamples per second}$ ($1\text{ MSPS}$), or a Serial Peripheral Interface (SPI) bus receiving an uncompressed video stream at $50\text{ Megabits per second}$.

When a peripheral hardware device generates or receives data at these extreme rates, a 16-bit or 32-bit digital sample arrives at the peripheral's Memory-Mapped I/O (MMIO) data register every **$1.0\text{ microsecond}$ ($1,000\text{ nanoseconds}$)**.

If a bare-metal software application attempts to transfer these incoming data samples into main System RAM using the central processing unit (CPU) core—either through software polling loops (`while (!(ADC1->SR & ADC_SR_EOC));`) or individual hardware interrupts (`ADC1_IRQHandler`)—the system hits an insurmountable physical performance barrier: **The CPU Pipeline Exhaustion Ceiling**.

```text
HIGH-BANDWIDTH SENSOR STREAMING VIA CPU INTERRUPTS (100% CPU WASTAGE)

 1 MSPS ADC Sensor (Generates 1 Sample every 1,000 Nanoseconds)
 ┌───────────────────────────┐
 │ New Sample Ready in DR    ├─► Triggers ADC Interrupt (IRQ 18)
 └───────────────────────────┘
                               │
                               ▼ CPU Hardware Auto-Stacking (12 Cycles)
 CPU Core Pipeline (3.2 GHz) ──► Pushes r0..r3, r12, LR, PC, xPSR onto Stack
                               │
                               ▼ Executes Assembly ISR (Read DR -> Write RAM)
                               │
                               ▼ CPU Hardware Unstacking (12 Cycles)
                               │ Pops 8 Registers off Stack -> Returns to Main
 ─────────────────────────────────────────────────────────────────────────────
 Total CPU Overhead = 24 Stacking Cycles + 16 ISR Cycles = 40 CPU Clock Cycles!
 At 1 MSPS -> 40,000,000 CPU Cycles / Sec BURNED ON REPETITIVE CONTEXT SWITCHES!
```

Trace the physical hardware cost of handling high-speed sensor samples using CPU interrupts:

1. An ADC sensor generates a sample every $1.0\ \mu\text{s}$ and asserts a hardware interrupt.
2. The CPU halts its main application program, executes 12 clock cycles of **Hardware Context Stacking** (pushing $r0..r3, r12, LR, PC, xPSR$ onto the stack memory), and branches to the Interrupt Service Routine ($ISR$).
3. The $ISR$ executes 16 assembly instructions: reading `ADC_DR`, storing the sample into a RAM array, incrementing a memory pointer, and clearing the `EOC` flag.
4. The CPU executes 12 clock cycles of **Hardware Context Unstacking** (popping 8 registers off the stack) and returns to the main loop.
5. **The Math of CPU Exhaustion**:
   * Total overhead per sample $= 12 \text{ (Stacking)} + 16 \text{ (ISR Execution)} + 12 \text{ (Unstacking)} = \mathbf{40 \text{ CPU Clock Cycles}}$.
   * At a $1\text{-MSPS}$ sample rate, the CPU executes this $40\text{-cycle}$ context-switch sequence $1,000,000\text{ times every second}$!
   * Total CPU cycles burned $= 1,000,000 \times 40 = \mathbf{40,000,000 \text{ Clock Cycles per Second}}$!

On a $40\text{-MHz}$ microcontroller, **$100\%$ of the processor's computing capacity is burned doing nothing but saving and restoring registers** to move 1-word samples from a peripheral pin into RAM! The CPU has zero execution cycles left to run real-time control algorithms, digital filtering, or motor management.

Furthermore, if the CPU uses a **Single Linear Memory Buffer** in RAM:
* While the CPU is actively reading and processing the first half of the RAM buffer, the hardware continues writing fresh incoming samples into the exact same memory locations.
* The CPU reads partially overwritten, corrupted data (**The Read-While-Write Race Condition**), causing signal distortion and software processing crashes!

How can we transfer millions of high-speed data words directly from peripheral data registers into system RAM **with ZERO CPU instruction execution and ZERO context-stacking overhead**, while isolating the CPU from data race conditions?

To eliminate CPU polling overheads and enable continuous, zero-copy data streaming, bare-metal hardware architectures employ **Bare-Metal DMA Channels**, **Ping-Pong Double Buffering**, and **Half-Transfer (`HT`) / Transfer-Complete (`TC`) Interrupts**.


### Strategy 1: The Manager's Hand-Carried Relay (CPU Interrupts / Polling)

In a poorly designed factory, there is no transport machinery. The manager enforces a primitive rule: *"Every time a bottle is filled, I will personally walk over, pick up the bottle, carry it across the room, place it in the crate, and walk back to my desk!"*

Look at what happens during the manager's workday:
1. Every single second, the machine bell rings (*"Bottle Filled!"*).
2. The manager stops analyzing business contracts, puts down their pen (**Context Stacking**), walks across the room, moves 1 bottle, walks back to their desk (**Context Unstacking**), and picks up their pen.
3. **The Disaster**: The manager spends $100\%$ of their day walking back and forth carrying single bottles! Business management stands completely frozen (**CPU Pipeline Exhaustion**).


### Strategy 3: The Two-Bucket Ping-Pong Relay (Circular Double Buffering)

Now, suppose the manager needs to perform quality-control lab tests on the bottles while the beverage machine is running continuously.

If the manager attempts to pick bottles out of the storage crate while the conveyor belt is actively dumping new bottles into the exact same crate:
* The manager's hands collide with the moving conveyor arm!
* Bottles knock against each other, spill soda, and break (**Read-While-Write Data Race Condition**)!

To solve this collision hazard, the manager replaces the single crate with a **Two-Bucket Rotating Crate System (Ping-Pong Double Buffering)**:

```text
THE TWO-BUCKET PING-PONG ROTATING CRATE SYSTEM

 Two-Bucket Storage Crate Array (Total Capacity = 200 Bottles)
 ┌───────────────────────────┬───────────────────────────┐
 │ BUCKET 0 (First 100 Slots)│ BUCKET 1 (Second 100 Slots│
 └─────────────┬─────────────┴─────────────┬─────────────┘
               ▲                           ▲
               │ Conveyor fills Bucket 0   │ Manager inspects Bucket 1
               └───────────────────────────┴─────────────────────────────┐
                                                                         │
 1. Conveyor fills Bucket 0 (Slots 1..100) ──► Rings Bell 1 (HT Interrupt)
    Conveyor switches automatically to Bucket 1!
    Manager inspects Bucket 0 in COMPLETE PEACE!
                                                                         │
 2. Conveyor fills Bucket 1 (Slots 101..200) ─► Rings Bell 2 (TC Interrupt)
    Conveyor wraps around automatically back to Bucket 0!
    Manager inspects Bucket 1 in COMPLETE PEACE!
```

Trace how the Two-Bucket Relay operates:

1. The storage crate is divided into two equal compartments: **Bucket 0 (First 100 Slots)** and **Bucket 1 (Second 100 Slots)**.
2. **Phase 1 (Filling Bucket 0)**:
   * The conveyor belt fills Bucket 0 (Slots 1 to 100).
   * Bucket 1 is completely empty and untouched.
3. **The Half-Way Bell (Half-Transfer Interrupt `HT`)**:
   * The exact second Bottle #100 drops into Bucket 0, a mechanical bell rings (**Half-Transfer Interrupt `HT`**)!
   * The conveyor belt **automatically switches its nozzle to begin filling Bucket 1**!
   * The manager walks over to **Bucket 0**, carries it to the lab, and inspects the 100 bottles in complete peace. **The conveyor belt is nowhere near Bucket 0! Zero collisions occur!**
4. **Phase 2 (Filling Bucket 1)**:
   * The conveyor belt fills Bucket 1 (Slots 101 to 200).
5. **The Full-Crate Bell (Transfer-Complete Interrupt `TC`)**:
   * The exact second Bottle #200 drops into Bucket 1, a second bell rings (**Transfer-Complete Interrupt `TC`**)!
   * The conveyor belt **automatically wraps around back to Bucket 0**!
   * The manager carries **Bucket 1** to the lab, while the conveyor belt fills Bucket 0!

Look at what this Two-Bucket Relay achieved:
* **$100\%$ Continuous Un-interrupted Operation**: The beverage machine never stopped for a single microsecond!
* **Zero Data Collisions**: The manager processed stable, completed bottle sets in Bucket 0 while the conveyor filled Bucket 1.
* **$99.9\%$ Reduction in Manager Interruption**: The manager was interrupted **only twice every 200 bottles** (once at `HT`, once at `TC`), instead of 200 times!

This automated conveyor belt and two-bucket system is the exact physical analogue of **Bare-Metal DMA Channels, Ping-Pong Double Buffering, and HT/TC Interrupts**:
* The beverage machine is the **Peripheral Hardware Device (ADC / SPI / UART)**.
* Bottles of soda are **16-bit or 32-bit Data Samples**.
* The factory manager is the **CPU Core Execution Pipeline**.
* The automated conveyor belt is the **Bare-Metal DMA Channel**.
* Bucket 0 and Bucket 1 are **Half-Buffer 0 and Half-Buffer 1 in RAM**.
* The half-way bell is the **Half-Transfer Interrupt (`HT`)**.
* The full-crate bell is the **Transfer-Complete Interrupt (`TC`)**.
* Wrapping back to Bucket 0 automatically is **DMA Circular Mode (`CIRC = 1`)**.


### 1. The Internal Architecture of a Bare-Metal DMA Controller

In modern 32-bit microcontrollers, the **Direct Memory Access (DMA) Controller** is an autonomous hardware engine attached directly to the internal System Bus Matrix (AHB / AXI Crossbar). 

A single DMA controller contains multiple independent **DMA Channels or Streams** (e.g., DMA1 Channel 1 through Channel 7). 

Each DMA channel contains four primary Memory-Mapped I/O (MMIO) configuration registers located at a dedicated base address (such as `DMA1_Channel1_BASE = 0x4002_0008`):

```text
DMA1 CHANNEL 1 MMIO REGISTER MAP (BASE: 0x4002_0008)

 Byte Offset │ Register Name │ Width   │ Primary Hardware Function
─────────────┼───────────────┼─────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ DMA_CCRx      │ 32 Bits │ Channel Configuration Register (EN, CIRC, MINC, DIR, HTIE)
  Offset 0x04│ DMA_CNDTRx    │ 32 Bits │ Number of Data Items Register (16-bit down-counter)
  Offset 0x08│ DMA_CPARx     │ 32 Bits │ Peripheral Address Register (MMIO address of ADC/SPI)
  Offset 0x0C│ DMA_CMARx     │ 32 Bits │ Memory Address Register (Base RAM buffer address)
```

```text
DMA CHANNEL HARDWARE REGISTER ARCHITECTURE

 CPU Memory Bus Write (Initial MMIO Setup)
       │
       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ DMA CHANNEL REGISTERS                                       │
 │  * CPARx : Peripheral MMIO Address (e.g., &ADC1->DR)        │
 │  * CMARx : Memory RAM Base Address (e.g., &buffer[0])       │
 │  * CNDTRx: 16-Bit Down-Counter     (e.g., 200 Samples)      │
 └─────────────┬───────────────────────────────────────────────┘
               │ Hardware Peripheral Request Signal (ADC_DMAReq)
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ HARDWARE BUS MASTER ENGINE                                  │
 │ Executes AXI/AHB Bus Master Read from CPARx -> Write to CMARx│
 │ Increments CMARx (if MINC=1) & Decrements CNDTRx by 1       │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ When CNDTRx == 100 (Half) or CNDTRx == 0 (Complete)
 Asserts Interrupt Signals to CPU NVIC (HTIF / TCIF Flags)
```

Let us dissect the functional roles of each DMA register field:


### 3. The Number of Data Items Register (`DMA_CNDTRx`)

The **Number of Data Items Register (`CNDTR`)** is a 16-bit down-counter ($0 \dots 65,535$) at offset `0x04` that stores the total number of transactions remaining in the active buffer.

When software enables the channel (`EN = 1`):
1. On every peripheral DMA request pulse (e.g., an ADC conversion complete signal), the DMA engine transfers one data word from `CPAR` to `CMAR`.
2. The hardware decrements `CNDTR` by $1$:

$$\text{CNDTR}_{\text{next}} \Leftarrow \text{CNDTR}_{\text{current}} - 1$$

3. If `MINC = 1`, the memory address register increments by the data size $S_{\text{bytes}}$ ($1, 2, \text{or } 4\text{ bytes}$):

$$\text{CMAR}_{\text{next}} \Leftarrow \text{CMAR}_{\text{current}} + S_{\text{bytes}}$$


### The Complete Ping-Pong Hardware Execution Cycle

Trace the step-by-step hardware and software execution timeline across time as the DMA engine streams data in **Circular Mode (`CIRC = 1`)**:

```text
PING-PONG DOUBLE BUFFERING EXECUTION TIMELINE

 Time t = 0 : Program CNDTR = 200, CMAR = &adc_buffer[0], CIRC = 1, EN = 1
              DMA Engine starts filling Half-Buffer 0 in background...
              │
              ▼ (100 Samples transferred -> CNDTR reaches 100)
 Time t = T_half : CNDTR == 100! HARDWARE ASSERTS HALF-TRANSFER INTERRUPT (HTIF = 1)!
                   DMA Engine automatically continues filling Half-Buffer 1!
                   CPU ISR receives HTIF -> Processes Half-Buffer 0 (&adc_buffer[0..99])!
                   │
                   ▼ (100 More Samples transferred -> CNDTR reaches 0)
 Time t = T_full : CNDTR == 0! HARDWARE ASSERTS TRANSFER-COMPLETE INTERRUPT (TCIF = 1)!
                   HARDWARE CIRCULAR RELOAD: CNDTR <= 200, CMAR <= &adc_buffer[0]!
                   DMA Engine automatically resumes filling Half-Buffer 0!
                   CPU ISR receives TCIF -> Processes Half-Buffer 1 (&adc_buffer[100..199])!
                   │
                   ▼ (REPEATS FOREVER WITH ZERO DATA LOSS AND ZERO RACE CONDITIONS!)
```

#### Phase 1: Filling Half-Buffer 0
1. Software configures `CNDTR = 200`, `CMAR = &adc_buffer[0]`, enables `CIRC = 1`, `HTIE = 1`, `TCIE = 1`, and sets `EN = 1`.
2. As the ADC peripheral completes conversions, the DMA engine writes samples into `adc_buffer[0]`, `adc_buffer[1]`, `adc_buffer[2]`, ...
3. `CNDTR` decrements from $200 \to 199 \to 198 \dots$
4. Throughout Phase 1, **Half-Buffer 1 (`adc_buffer[100..199]`) is completely untouched and idle**.

#### Phase 2: The Half-Transfer Event (`HTIF = 1` / `CNDTR == 100`)
1. The exact sample tick where `CNDTR` decrements to **$100$** ($\frac{N_{\text{total}}}{2}$):
   * The DMA hardware sets **Bit 2 (`HTIF1`) in the Interrupt Status Register (`DMA_ISR`)**.
   * Because `HTIE = 1`, the DMA controller asserts the **Half-Transfer Hardware Interrupt** to the CPU NVIC!
2. **The Zero-Delay Pointer Switch**:
   * The DMA engine does **NOT** pause! On the very next peripheral sample tick, the DMA engine writes sample #101 to `adc_buffer[100]` (the start of Half-Buffer 1).
3. **CPU Background Processing**:
   * The CPU enters `DMA1_Channel1_IRQHandler`. The $ISR$ sees `HTIF1 == 1`.
   * The CPU processes **Half-Buffer 0 (`adc_buffer[0 .. 99]`)** in complete peace!
   * Because the DMA engine is currently writing to Half-Buffer 1, **zero read-while-write race conditions occur**!

#### Phase 3: The Transfer-Complete Event (`TCIF = 1` / `CNDTR == 0`)
1. The DMA engine continues writing samples into `adc_buffer[100 .. 199]`. `CNDTR` decrements $100 \to 99 \dots \to 0$.
2. The exact sample tick where `CNDTR` reaches **$0$**:
   * The DMA hardware sets **Bit 1 (`TCIF1`) in `DMA_ISR`**.
   * The DMA controller asserts the **Transfer-Complete Hardware Interrupt** to the CPU NVIC!
3. **The Hardware Circular Reload**:
   * Because `CIRC = 1`, the DMA hardware automatically reloads `CNDTR \Leftarrow 200` and resets `CMAR \Leftarrow \&adc\_buffer[0]` in **$0\text{ clock cycles}$**!
   * The DMA engine immediately resumes writing sample #201 into `adc_buffer[0]` (Half-Buffer 0).
4. **CPU Background Processing**:
   * The CPU enters `DMA1_Channel1_IRQHandler`. The $ISR$ sees `TCIF1 == 1`.
   * The CPU processes **Half-Buffer 1 (`adc_buffer[100 .. 199]`)** in complete peace!

$$\mathbf{\text{Continuous Data Flow: } \quad \text{Buffer 0 Processing} \iff \text{Buffer 1 Filling}}$$

$$\mathbf{\text{Buffer 1 Processing} \iff \text{Buffer 0 Filling}}$$


## Real-World Silicon Realities: Cache Invalidation and Overrun Hazards

In commercial high-speed embedded systems engineering, implementing Ping-Pong DMA double buffering requires handling L1 Data Cache coherence and CPU processing overrun hazards.


### 2. The CPU Processing Overrun Hazard

What happens if the CPU's signal processing algorithm takes **too long** to process Half-Buffer 0?

Suppose Half-Buffer 0 takes $100\text{ microseconds}$ for the DMA engine to fill.

If the CPU's `HT` $ISR$ takes **$120\text{ microseconds}$** to process Half-Buffer 0:

```text
CPU PROCESSING OVERRUN HAZARD

 Time 0 us ────────────► Time 100 us ───────────► Time 200 us
 DMA fills Buffer 0    │ DMA fills Buffer 1      │ DMA wraps to Buffer 0!
                       │                         │
                       ▼                         ▼
 CPU processing Buffer 0 (Takes 120 us!) ────────┼──► DMA OVERWRITES BUFFER 0
                                                 │    WHILE CPU IS STILL READING IT!
                                                 ▼
                                     DATA CORRUPTED! (Read-While-Write Crash!)
```

* At $t = 100\ \mu\text{s}$, DMA finishes Buffer 0 and starts filling Buffer 1. CPU starts processing Buffer 0.
* At $t = 200\ \mu\text{s}$, DMA finishes Buffer 1 and **wraps around to start overwriting Buffer 0**!
* But the CPU is *still* processing Buffer 0 ($120\ \mu\text{s}$ required $\implies$ finishes at $t = 220\ \mu\text{s}$)!
* The DMA engine writes fresh samples over the exact RAM slots the CPU is actively reading (**Read-While-Write Overrun**)!

#### The System Rule for Double Buffering:
To guarantee $100\%$ data safety:

$$\mathbf{\text{CPU Processing Time per Half-Buffer } (T_{\text{proc}}) \quad < \quad \text{DMA Fill Time per Half-Buffer } (T_{\text{fill}})}$$

$$T_{\text{fill}} = \frac{N_{\text{half\_buffer}}}{f_{\text{sampling}}}$$

If $T_{\text{proc}} \ge T_{\text{fill}}$, software **MUST increase the buffer size $N_{\text{half\_buffer}}$** or optimize the processing algorithm in assembly!


### Scenario and Parameters

You are a principal bare-metal systems architect designing an ultrasonic audio processing subsystem for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

An external 12-bit ADC peripheral (`ADC1`) samples an ultrasonic microphone at a continuous rate $f_{\text{sample}} = \mathbf{200.000 \text{ kSPS}}$ ($200,000\text{ samples per second}$).

```text
3.2 GZ SERVER CONTROLLER ULTRASONIC DMA SUBSYSTEM

 ADC1 Peripheral (200 kSPS = 5.0 us/sample) ──► DMA1 Channel 1 (CIRC = 1)
 ┌─────────────────────────────────────────┐   ┌───────────────────────────────┐
 │ Produces 16-Bit Sample every 5.0 us     ├──►│ Fills adc_buffer[400] in RAM  │
 └─────────────────────────────────────────┘   └───────────────┬───────────────┘
                                                               │
                                                               ▼
 Interrupts: HTIF1 (Slot 200) & TCIF1 (Slot 400) ──────────────┘
```

#### Subsystem Specifications:
* **Sampling Rate ($f_{\text{sample}}$)**: $200,000\text{ samples/second}$ ($T_{\text{sample}} = 5.00\ \mu\text{s}$ per 16-bit half-word sample).
* **RAM Allocation**: A contiguous 16-bit array `adc_buffer[400]` ($400\text{ Half-Words} = 800\text{ Bytes}$ total) allocated in SRAM at physical base address `0x2000_0800`.
  * Half-Buffer 0: `&adc_buffer[0]` through `&adc_buffer[199]` ($200\text{ samples}$).
  * Half-Buffer 1: `&adc_buffer[200]` through `&adc_buffer[399]` ($200\text{ samples}$).
* **DMA Channel**: `DMA1 Channel 1` mapped to `ADC1` requests (`CPAR = 0x4001204C` - `ADC1_DR`).
* **CPU Processing Requirement**: The CPU execution pipeline requires $1,600\text{ clock cycles}$ ($0.50\ \mu\text{s}$) to process one 200-sample half-buffer in assembly.

#### Your Objective

1. Calculate the time $T_{\text{fill\_half}}$ (in microseconds and milliseconds) required for the DMA engine to fill one 200-sample half-buffer.
2. Verify mathematically whether the CPU processing time ($T_{\text{proc}} = 0.50\ \mu\text{s}$) satisfies the Ping-Pong Overrun Safety Invariant ($T_{\text{proc}} < T_{\text{fill\_half}}$).
3. Calculate the total CPU clock cycles burned per second and percentage CPU offloading achieved by DMA double buffering compared to handling every ADC sample via individual CPU interrupts ($40\text{ cycles/sample}$).
4. Write the complete, production-ready ARM Assembly initialization function `DMA1_ADC1_Init` that configures `DMA1_Channel1` (`CPAR`, `CMAR`, `CNDTR`, `CCR` with `CIRC = 1`, `MINC = 1`, `PSIZE = 16-bit`, `MSIZE = 16-bit`, `HTIE = 1`, `TCIE = 1`) and enables `ADC1` DMA requests (`ADC1_CR2.DMA = 1`).
5. Write the production assembly `DMA1_Channel1_IRQHandler` that evaluates `HTIF1` vs `TCIF1`, clears flags in `DMA1_IFCR`, and processes the corresponding half-buffer.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Verify Ping-Pong Overrun Safety Invariant

Given:
* CPU Processing Time per Half-Buffer ($T_{\text{proc}}$) $= 1,600\text{ CPU cycles} = \mathbf{0.500 \text{ Microseconds}}$ ($500.0\text{ ns}$).
* DMA Half-Buffer Fill Time ($T_{\text{fill\_half}}$) $= \mathbf{1,000.00 \text{ Microseconds}}$.

$$\text{Overrun Safety Check: } \quad T_{\text{proc}} \, (0.50\ \mu\text{s}) \quad < \quad T_{\text{fill\_half}} \, (1,000.0\ \mu\text{s}) \quad (\mathbf{\text{OVERRUN INVARIANT PASSED!}})$$

$$\text{CPU Processing Margin} = \frac{T_{\text{fill\_half}}}{T_{\text{proc}}} = \frac{1,000.0\ \mu\text{s}}{0.50\ \mu\text{s}} = \mathbf{2,000\times \text{ Safety Margin!}}$$

The CPU finishes processing Half-Buffer 0 in $0.50\ \mu\text{s}$, leaving **$999.50\ \mu\text{s}$ of idle time** before the DMA engine finishes filling Half-Buffer 1! Zero read-while-write race conditions occur.


#### Step 4: Write Complete Production Assembly Driver (`DMA1_ADC1_Init` & `ISR`)

Here is the complete, production-ready ARM Assembly driver for configuring `DMA1 Channel 1` in Circular Ping-Pong mode:

```assembly
/* PRODUCTION BARE-METAL PING-PONG DMA DRIVER IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_AHB1ENR,     0x40023830        /* AHB1 Clock Enable (DMA1, GPIOA) */
.equ RCC_APB2ENR,     0x40023844        /* APB2 Clock Enable (ADC1) */

.equ ADC1_BASE,       0x40012000
.equ ADC1_CR2,        0x40012008        /* ADC1 Control Register 2 (DMA Bit) */
.equ ADC1_DR,         0x4001204C        /* ADC1 Data Register */

.equ DMA1_BASE,       0x40020000
.equ DMA1_ISR,        0x40020000        /* DMA Interrupt Status Register */
.equ DMA1_IFCR,       0x40020004        /* DMA Interrupt Flag Clear Reg */

.equ DMA1_CCR1,       0x40020008        /* Channel 1 Configuration Register */
.equ DMA1_CNDTR1,     0x4002000C        /* Channel 1 Number of Data Items */
.equ DMA1_CPAR1,      0x40020010        /* Channel 1 Peripheral Address */
.equ DMA1_CMAR1,      0x40020014        /* Channel 1 Memory Address */

.equ NVIC_ISER0,      0xE000E100        /* NVIC Interrupt Set-Enable Reg 0 */

/* RAM Buffer Allocation */
.section .bss
.align 3
.global adc_buffer
adc_buffer:
    .space 800                          /* 400 Half-Words (16-Bit) = 800 Bytes */

.section .text
.global DMA1_ADC1_Init
.type DMA1_ADC1_Init, %function
.thumb_func
DMA1_ADC1_Init:
    push    {r4, lr}

    /* Step 1: Enable DMA1 Clock in RCC (AHB1ENR Bit 21) */
    ldr     r0, =RCC_AHB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 21)          /* Set DMA1EN = 1 */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* Step 2: Disable DMA1 Channel 1 during setup (EN = 0) */
    ldr     r0, =DMA1_CCR1
    movs    r1, #0
    str     r1, [r0]

    /* Step 3: Program Peripheral Address (CPAR1 = &ADC1_DR = 0x4001204C) */
    ldr     r0, =DMA1_CPAR1
    ldr     r1, =ADC1_DR
    str     r1, [r0]

    /* Step 4: Program Memory Base Address (CMAR1 = &adc_buffer[0]) */
    ldr     r0, =DMA1_CMAR1
    ldr     r1, =adc_buffer
    str     r1, [r0]

    /* Step 5: Program Total Buffer Size (CNDTR1 = 400 Samples) */
    ldr     r0, =DMA1_CNDTR1
    ldr     r1, =400                    /* Total 400 samples (200 per half) */
    str     r1, [r0]

    /* Step 6: Configure CCR1: CIRC=1, MINC=1, PSIZE=16b, MSIZE=16b, HTIE=1, TCIE=1 */
    /* Bits: CIRC(5)=1, MINC(7)=1, PSIZE[9:8]=01, MSIZE[11:10]=01, HTIE(2)=1, TCIE(1)=1 */
    ldr     r0, =DMA1_CCR1
    ldr     r1, =((1 << 5) | (1 << 7) | (0x1 << 8) | (0x1 << 10) | (1 << 2) | (1 << 1))
    str     r1, [r0]

    /* Step 7: Enable DMA1 Channel 1 Interrupt in NVIC (DMA1_Channel1_IRQn = IRQ 11) */
    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 11)              /* Enable IRQ 11 in NVIC_ISER0 */
    str     r1, [r0]

    /* Step 8: Enable ADC1 DMA Requests (Set DMA Bit 8 in ADC1_CR2) */
    ldr     r0, =ADC1_CR2
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 8)           /* Set DMA = 1 */
    str     r1, [r0]

    /* Step 9: Enable DMA1 Channel 1 (EN = 1 in CCR1) */
    ldr     r0, =DMA1_CCR1
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 0)           /* Set EN = 1 */
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size DMA1_ADC1_Init, .-DMA1_ADC1_Init


/* PRODUCTION PING-PONG DMA INTERRUPT SERVICE ROUTINE */
.global DMA1_Channel1_IRQHandler
.type DMA1_Channel1_IRQHandler, %function
.thumb_func
DMA1_Channel1_IRQHandler:
    push    {r4, r5, lr}

    /* Step 1: Read DMA1 Interrupt Status Register (DMA1_ISR) */
    ldr     r0, =DMA1_ISR
    ldr     r1, [r0]                    /* r1 = DMA1_ISR flags */

    /* ==================================================================== */
    /* CHECK 1: HALF-TRANSFER INTERRUPT (HTIF1 = Bit 2)                     */
    /* ==================================================================== */
    tst     r1, #(1 << 2)               /* Test HTIF1 flag */
    beq     check_tcif

    /* Clear HTIF1 flag in DMA1_IFCR using Write-1-to-Clear (CHTIF1 = Bit 2) */
    ldr     r2, =DMA1_IFCR
    movs    r3, #(1 << 2)
    str     r3, [r2]                    /* Clear HTIF1 */

    /* PROCESS HALF-BUFFER 0 (&adc_buffer[0 .. 199]) IN ASSEMBLY */
    ldr     r0, =adc_buffer             /* r0 = Pointer to Half-Buffer 0 */
    movs    r1, #200                    /* r1 = 200 samples */
    bl      process_dsp_buffer          /* Call DSP processing function! */
    b       isr_exit

check_tcif:
    /* ==================================================================== */
    /* CHECK 2: TRANSFER-COMPLETE INTERRUPT (TCIF1 = Bit 1)                 */
    /* ==================================================================== */
    tst     r1, #(1 << 1)               /* Test TCIF1 flag */
    beq     isr_exit

    /* Clear TCIF1 flag in DMA1_IFCR using Write-1-to-Clear (CTCIF1 = Bit 1) */
    ldr     r2, =DMA1_IFCR
    movs    r3, #(1 << 1)
    str     r3, [r2]                    /* Clear TCIF1 */

    /* PROCESS HALF-BUFFER 1 (&adc_buffer[200 .. 399]) IN ASSEMBLY */
    ldr     r0, =adc_buffer
    add     r0, r0, #400                /* r0 = &adc_buffer[200] (Offset 400 bytes) */
    movs    r1, #200                    /* r1 = 200 samples */
    bl      process_dsp_buffer          /* Call DSP processing function! */

isr_exit:
    dsb                                 /* Memory barrier */
    pop     {r4, r5, pc}
.size DMA1_Channel1_IRQHandler, .-DMA1_Channel1_IRQHandler

/* Dummy DSP Buffer Processing Function */
process_dsp_buffer:
    /* Inputs: r0 = Buffer Pointer, r1 = Sample Count */
    /* (Executes fast assembly DSP math on completed half-buffer...) */
    bx      lr
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Bare-Metal DMA Channel**: A dedicated hardware-driven memory transfer controller inside the bus matrix that connects a peripheral data register (`CPAR`) to a RAM memory address (`CMAR`), decrementing a 16-bit counter (`CNDTR`) on every sample tick without executing CPU instructions.
* **Ping-Pong Double Buffering**: A circular memory management architecture (`CIRC = 1`) where a continuous RAM array is partitioned into two equal half-buffers, allowing the DMA hardware to fill Buffer 0 while the CPU processes Buffer 1, and vice versa.
* **Half-Transfer (`HT`) / Transfer-Complete (`TC`) Interrupts**: Hardware status signals generated by the DMA channel when the down-counter reaches half-capacity (`HTIF = 1`) or zero (`TCIF = 1`), notifying the CPU to process the completed half-buffer without Read-While-Write data race conditions.