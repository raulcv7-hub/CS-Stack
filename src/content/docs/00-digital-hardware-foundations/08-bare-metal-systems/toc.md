---
title: "08. Bare Metal Systems - Table of Contents"
---

# 08-bare-metal-systems — Bare-Metal Systems Architecture

> **Assumed Prerequisites:** Assembly language mechanics, register file manipulation, stack frame management, and subroutine linkage from `06-assembly-language-mechanics`; Memory-Mapped I/O (MMIO) address decoding, hardware interrupt vectoring (MSI/legacy vectoring), and peripheral interconnects from `07-hardware-interconnects`.
> **Course Boundary:** Begins at hardware reset vector table initialization and bare-metal memory section setup, progresses through PLL clock tree initialization, Nested Vectored Interrupt Controller (NVIC / PLIC) priority management, MMIO register control for GPIO, external line interrupts, hardware timers, Watchdog timers, ADC sampling, UART, SPI, I2C controllers, DMA peripheral offloading, and MPU stack guards, and ends at bare-metal low-power sleep states (`WFI`/`WFE`) and integrated event-driven bare-metal system synthesis in pure Assembly.
> **Explicit Exclusions:** ❌ No C/C++ programming language code, pointers, or compilers (handled in Layer 01 `imperative-programming-foundations`), ❌ No Real-Time Operating System (RTOS) kernels or task schedulers (handled in Layer 04 `real-time-operating-systems`), ❌ No virtual memory page tables or MMU address translation walkers (handled in Layer 04 `virtual-memory-systems`), ❌ No high-level host software driver APIs.

## 01-bare-metal-execution-environment — Bare-Metal Execution Environment

### 01-reset-vector-startup-sequence — Reset Vector Initialization
* 01-reset-vector-table-initialization — Problem: CPU reset hardware cannot execute symbolic software code without a hardwired memory vector table mapping initial stack pointers and instruction entry points. | Primitives: Reset vector table, Initial Stack Pointer (`SP`), AAPCS 8-byte stack alignment.
* 02-bare-metal-memory-layout-initialization — Problem: Global variables and initialized data sections in RAM contain garbage values after power-on reset unless initialized from ROM symbols using word-aligned unrolled copy loops. | Primitives: `.data` section ROM-to-RAM copy, `.bss` zero-initialization, Word-aligned unrolling.
* 03-system-clock-pll-initialization — Problem: Peripherals requiring precise high-speed clock frequencies fail to operate if the CPU boots on a low-accuracy internal RC oscillator without configuring Flash wait states, external crystal oscillators, and Phase-Locked Loops. | Primitives: Phase-Locked Loop (PLL), Flash wait states, Memory remap.

### 02-nested-vector-interrupt-controllers — Nested Vectored Interrupt Controller Architecture
* 01-interrupt-vector-table-dispatch — Problem: Peripheral hardware signals cannot trigger CPU handler routines without a low-latency hardware vector table mapping IRQ numbers to instruction addresses. | Primitives: Nested Vectored Interrupt Controller (NVIC/PLIC), Interrupt Vector Table, Context saving (`mstatus`/`PRIMASK`).
* 02-interrupt-preemption-priority-grouping — Problem: High-priority peripheral events get blocked behind long-running low-priority interrupt handlers unless hardware supports nested preemption and sub-priorities. | Primitives: Interrupt preemption priority, Priority grouping.
* 03-interrupt-tail-chaining-latency — Problem: Popping and pushing register stacks between back-to-back hardware interrupts introduces redundant clock cycle overheads. | Primitives: Interrupt tail-chaining, Late arriving interrupt optimization.
* 04-hardware-fault-exception-handlers — Problem: Accessing un-clocked MMIO registers or executing invalid memory instructions triggers hardware faults that freeze the CPU indefinitely without default fault handlers and register extraction. | Primitives: `HardFault` / `BusFault` handler, `CFSR`/`BFAR` fault register extraction, Dummy ISR fallback.

## 02-mmio-peripheral-register-control — Memory-Mapped I/O Peripheral Control

### 01-gpio-register-manipulation — General Purpose I/O Control
* 01-gpio-mode-configuration-registers — Problem: Pin multiplexing, output slew rates, and digital drive strengths collide if GPIO pins are driven without configuring direction, pull-up/pull-down, and alternate function registers. | Primitives: GPIO direction register, Alternate function mapping, Output slew rate (`OSPEEDR`).
* 02-atomic-bit-manipulation-registers — Problem: Modifying single GPIO bits using read-modify-write assembly loops creates race conditions when interrupts modify the same register concurrently. | Primitives: Atomic Bit Set-Clear Register (`BSRR`), Bit Banding.
* 03-external-interrupt-line-controllers — Problem: Detecting asynchronous external pin voltage transitions requires dedicated edge-triggered interrupt controller logic to map pin events to CPU IRQs and clear pending bits. | Primitives: External Interrupt Controller (`EXTI`), Edge-trigger detector, Pending bit clearing.

### 02-hardware-timer-counter-subsystems — Hardware Timer Subsystems
* 01-systick-system-timer-architecture — Problem: Executing deterministic, periodic timekeeping in bare-metal assembly requires a core-integrated hardware tick timer that operates independently of peripheral clocks. | Primitives: SysTick / CLINT System Timer, Core tick interrupt, Reload value calculation.
* 02-hardware-timer-prescaler-counter — Problem: High-frequency CPU clocks overflow short 16-bit timer counters too quickly for human-scale timing intervals without exact prescaler and auto-reload integer calculations. | Primitives: Timer prescaler register, Auto-reload register (`ARR`).
* 03-pwm-signal-generation-mechanics — Problem: Generating precise analog-like power delivery or motor speed control with digital pins requires hardware counter-compare match toggling across center-aligned or edge-aligned modes. | Primitives: Pulse-Width Modulation (PWM), Capture/Compare register (`CCR`), Center-aligned PWM.
* 04-watchdog-timer-reset-architecture — Problem: Software loops hanging in infinite deadlocks or premature refresh loops freeze embedded devices permanently without hardware windowed auto-reset protection. | Primitives: Hardware Watchdog Timer (WDT), Windowed watchdog refresh.

### 03-analog-digital-conversion-subsystems — Analog-to-Digital Converter Control
* 01-adc-sampling-conversion-triggering — Problem: Measuring physical analog sensor voltages into digital assembly registers requires calibrating sample-and-hold timing, self-calibration, and hardware timer `TRGO` triggers to eliminate sampling jitter. | Primitives: Analog-to-Digital Converter (ADC), Timer `TRGO` trigger, End-of-Conversion (`EOC`) flag.

## 03-bare-metal-serial-bus-interfaces — Bare-Metal Serial Communication Interfaces

### 01-uart-assembly-communication — Universal Asynchronous Receiver-Transmitter Interface
* 01-uart-baud-rate-generation — Problem: Asynchronous serial communication fails to decode data bits if the receiver clock drifts beyond baud rate timing tolerances without fractional baud rate divisors. | Primitives: Baud rate generator, Fractional baud rate register.
* 02-uart-fifo-interrupt-driven-io — Problem: Polling UART status registers in software loops freezes the CPU execution pipeline during slow multi-byte serial transfers, risking FIFO overrun and framing errors. | Primitives: UART FIFO buffer, Interrupt-driven UART transmission, Overrun / Framing error handling.

### 02-spi-bus-protocol-controller — Serial Peripheral Interface Protocol Control
* 01-spi-clock-phase-polarity-control — Problem: Master and slave SPI devices corrupt data transfers if clock idle states, sampling clock edges, and Chip Select (`CS#`) guard delays are mismatched. | Primitives: Clock Polarity (`CPOL`), Clock Phase (`CPHA`), Chip Select (`CS#`) guard delay.
* 02-spi-master-shift-register-transfer — Problem: Exchanging full-duplex bytes with external sensors or Flash chips requires transmitting dummy bytes in assembly to generate clock pulses. | Primitives: SPI Shift Register, Dummy byte transmission.

### 03-i2c-bus-controller-mechanics — Inter-Integrated Circuit Bus Control
* 01-i2c-start-stop-ack-signaling — Problem: Multi-master open-drain bus communication requires software-free detection of START/STOP conditions, NACK generation, and open-drain bus arbitration. | Primitives: $I^2C$ START/STOP condition generator, NACK signaling, Open-drain bus arbitration.
* 02-i2c-state-machine-addressing — Problem: Communicating with multi-byte $I^2C$ slave sensors requires managing clock-stretching state machines and manual GPIO clock-toggling bus recovery sequences when SDA is stuck Low. | Primitives: $I^2C$ master state machine, Clock stretching detection, Bus recovery sequence.

### 04-bare-metal-dma-peripheral-offloading — Bare-Metal DMA Peripheral Offloading
* 01-bare-metal-dma-channel-configuration — Problem: Streaming high-bandwidth sensor payloads from SPI or ADC peripherals into RAM via CPU assembly polling loops burns 100% of processor execution cycles. | Primitives: Bare-metal DMA channel, Ping-Pong double buffering, Half-Transfer (`HT`) / Transfer-Complete (`TC`) interrupts.

## 04-bare-metal-system-protection-synthesis — Bare-Metal System Protection Synthesis

### 01-bare-metal-memory-protection-units — Hardware Memory Protection Architecture
* 01-mpu-pmp-region-stack-guard-configuration — Problem: Stack overflow hazards in bare-metal assembly silently overwrite adjacent global variables without hardware memory region boundary protection and Read-Only Flash regions. | Primitives: Memory Protection Unit (MPU/PMP), Stack guard region, Execute-Never (`XN`) region.
* 02-mmio-memory-barrier-synchronization — Problem: Out-of-order execution or pipeline write buffering causes MMIO register accesses to execute out of program order without hardware memory barriers. | Primitives: Data Memory Barrier (`DMB`/`DSB`/`ISB`), `fence.io` memory barrier.

### 02-bare-metal-sleep-state-mechanics — Low-Power Sleep States
* 01-wait-for-interrupt-event-execution — Problem: Keeping the CPU clock tree active when waiting for peripheral events drains battery power unnecessarily, while floating GPIO pins cause analog current leakage in deep sleep. | Primitives: Wait For Interrupt (`WFI`), Wait For Event (`WFE`), Analog leakage prevention.
* 02-sleep-wakeup-latency-optimization — Problem: Transitioning deep sleep modes powers down internal clock trees, delaying event response latencies when re-stabilizing PLL oscillators upon wakeup. | Primitives: Wakeup latency, Low-power clock manager, PLL re-stabilization sequence.

### 03-integrated-bare-metal-subsystem-synthesis — Integrated Bare-Metal Subsystem Synthesis
* 01-complete-bare-metal-system-synthesis — Problem: Integrating reset vectors, PLL clock trees, NVIC priority grouping, MMIO GPIO, hardware timers, watchdog timers, ADC sampling, SPI/I2C controllers, DMA streams, MPU stack guards, and low-power sleep state loops into a single bare-metal assembly system introduces complex interrupt race conditions, SWO/ITM hardware tracing needs, and timing hazards. | Primitives: Integrated bare-metal system, Event-driven assembly execution loop, Hardware SWO/ITM tracing.
