---
title: "Asynchronous Hardware Vectoring, Interrupt Controllers, and Register Context Preservation"
---

# Asynchronous Hardware Vectoring, Interrupt Controllers, and Register Context Preservation

## The Asynchronous Hardware Event Collision

In a bare-metal computer system, the central processing unit (CPU) executes a continuous, sequential stream of machine instructions. A typical program loop processes calculations, evaluates conditional branches, and updates data variables in memory, cycling through instructions on every tick of the system clock.

However, the physical world surrounding the microchip operates asynchronously. 

External hardware devices do not wait for the CPU to reach a specific line of code before generating events:
* A user presses an emergency stop push-button, causing a General Purpose Input/Output (GPIO) pin voltage to drop from $3.3\text{ Volts}$ to $0.0\text{ Volts}$ at a random nanosecond.
* A Universal Asynchronous Receiver-Transmitter (UART) communication interface finishes receiving a byte over an optical fiber link and needs to hand the byte to the CPU before the next incoming byte overwrites it.
* A hardware timer counter reaches its auto-reload match value, signaling that an exact $1.0\text{-millisecond}$ control period has elapsed.

How does a CPU execution pipeline react to these unpredictable, asynchronous hardware events?

In early, primitive computing architectures, software engineers attempted to handle asynchronous events using a technique called **Programmed Polling I/O**:

```c
/* PROGRAMMED POLLING I/O LOOP (UN-EFFICIENT CPU WASTAGE) */
void main_loop(void) {
    while (1) {
        if (UART0->SR & UART_SR_RXNE) { process_uart_byte(); }
        if (TIM2->SR & TIM_SR_UIF)    { process_timer_tick(); }
        if (EXTI->PR & EXTI_PR_PR0)   { process_button_press(); }
        execute_main_application_math();
    }
}
```

Look at the catastrophic engineering flaws of Programmed Polling I/O:

1. **Massive CPU Instruction Wastage**: The CPU burns over $99\%$ of its execution clock cycles repeatedly executing conditional `IF` branch statements, checking status flags inside peripheral registers that have not changed! The CPU pipeline is trapped doing useless administrative checking rather than executing application algorithms.
2. **Unacceptable and Variable Response Latency**: Suppose the CPU is midway through calculating a heavy 1,000-iteration mathematical matrix transformation when the emergency stop button is pressed (`EXTI_PR_PR0`). 

The CPU cannot respond to the button press until the entire matrix loop finishes $50\text{ microseconds}$ later! 

In real-time control systems (such as motor controllers or medical devices), a $50\text{-microsecond}$ delay in reacting to an emergency event causes physical damage, hardware destruction, or safety hazards.

```text
PROGRAMMED POLLING VS. HARDWARE INTERRUPT VECTORING

 Programmed Polling I/O (CPU trapped in status-checking loop):
 ┌───────────────────────────────────────────────────────────┐
 │ Check UART -> Check Timer -> Check GPIO -> Execute Math...│
 └─────────────────────────────┬─────────────────────────────┘
                               │ (99% CPU Cycles Wasted!)
                               ▼
 Hardware Interrupt Vectoring (CPU runs math 100% of the time!):
 ┌───────────────────────────────────────────────────────────┐
 │ Execute Application Math Algorithm (100% CPU Efficiency)  │
 └─────────────────────────────┬─────────────────────────────┘
                               ▲
                               │ Hardware IRQ Signal (Instant Jump!)
 ┌─────────────────────────────┴─────────────────────────────┐
 │ Hardware Interrupt Controller (NVIC / PLIC)               │
 └───────────────────────────────────────────────────────────┘
```

Why should a multi-gigahertz processor waste its computing capacity repeatedly polling hardware status registers, when we can build a dedicated, low-latency hardware engine that monitors peripheral lines in the background and **forces the CPU to jump directly to the correct event handler in a deterministic number of clock cycles**?

To eliminate polling delays, guarantee sub-microsecond event response times, and liberate the CPU execution pipeline, computer architectures employ a **Nested Vectored Interrupt Controller (NVIC / PLIC)**, an **Interrupt Vector Table**, and **Automated Hardware Context Saving**.


### Strategy 1: The Surgeon Walks to the Lobby (Programmed Polling I/O)

Every 2 minutes, the surgeon puts down their scalpel, washes their hands, walks down three flights of stairs to the front lobby, asks the receptionist *"Any new patients?"*, walks back up to the operating room, washes their hands, and resumes the surgery!

Look at what happens:
* The 4-hour surgery takes 16 hours to finish because the surgeon spends $75\%$ of their time walking up and down stairs!
* If a critical heart attack patient arrives at 8:01 AM, they sit waiting in the lobby until the surgeon walks down at 8:02 AM!

This is the **Polling Latency Penalty**.


## Deep Mechanics of NVIC/PLIC, Vector Tables, and Context Stacking

Now that we possess an intuitive mental model of hospital emergency switchboards and clipboard context saving, let us examine the formal, rigorous engineering mechanics of **Nested Vectored Interrupt Controllers (NVIC / PLIC)**, **Interrupt Vector Tables**, and **Hardware Context Stacking**.


### 2. The Interrupt Vector Table Memory Map and Address Arithmetic

When the interrupt controller determines that an active $IRQ$ line must be serviced, it does **not** force the CPU to execute a generic software branching instruction.

Instead, the hardware executes **Vectored Dispatch**: it calculates the exact physical memory address holding the target **Interrupt Service Routine (ISR)** function pointer directly in silicon!

The **Interrupt Vector Table** is an aligned array of 32-bit (4-byte) physical memory addresses stored in non-volatile Flash ROM or SRAM starting at a base address defined by the **Vector Table Offset Register (`VTOR`)** (default `0x0000_0000` or `0x0800_0000`).

```text
DETAILED INTERRUPT VECTOR TABLE MEMORY MAP

 Memory Offset │ Vector Exception / IRQ Name       │ Vector Category
───────────────┼───────────────────────────────────┼─────────────────────────
  VTOR + 0x00  │ Initial Stack Pointer (SP)        │ Boot Parameter
  VTOR + 0x04  │ Reset Handler Address             │ System Exception 1
  VTOR + 0x08  │ NMI Handler Address               │ System Exception 2
  VTOR + 0x0C  │ HardFault Handler Address         │ System Exception 3
  VTOR + 0x10  │ MemManage Fault Handler Address   │ System Exception 4
  VTOR + 0x14  │ BusFault Handler Address          │ System Exception 5
  VTOR + 0x18  │ UsageFault Handler Address        │ System Exception 6
  ...          │ ...                               │ ...
  VTOR + 0x3C  │ SysTick Handler Address           │ System Exception 15
───────────────┼───────────────────────────────────┼─────────────────────────
  VTOR + 0x40  │ External Interrupt 0  (IRQ 0)     │ Peripheral Vector 0
  VTOR + 0x44  │ External Interrupt 1  (IRQ 1)     │ Peripheral Vector 1
  VTOR + 0x48  │ External Interrupt 2  (IRQ 2)     │ Peripheral Vector 2
  ...          │ ...                               │ ...
  VTOR + 0x400 │ External Interrupt 239 (IRQ 239)  │ Peripheral Vector 239
```

#### The Vector Address Calculation Formula

The vector table reserves the first 16 slots (offsets `0x00` through `0x3C`, 64 bytes total) for internal system exceptions (Reset, NMI, HardFault, SysTick).

External peripheral interrupts ($IRQ_0, IRQ_1, \dots, IRQ_n$) begin at **Vector Slot 16 (Offset `0x40`)**.

The exact physical memory address $\text{Vector\_Addr}(IRQ_n)$ containing the function pointer for external interrupt $n$ is calculated using the formula:

$$\mathbf{\text{Vector\_Addr}(IRQ_n) = \text{VTOR} + (16 + n) \times 4}$$

$$\mathbf{\text{Vector\_Addr}(IRQ_n) = \text{VTOR} + 64 + (n \times 4)}$$

Where:
* $\text{VTOR}$ is the physical base address stored in the Vector Table Offset Register (e.g., `0x0800_0000`).
* $n$ is the numerical hardware Interrupt Request number ($n \in [0, 239]$).
* $4$ is the word size in bytes for a 32-bit memory address pointer.

#### Example Vector Address Calculation:
Suppose a UART peripheral is assigned to $IRQ_5$ on a microcontroller with $\text{VTOR} = \text{0x0800\_0000}$:

$$\text{Vector\_Addr}(IRQ_5) = \text{0x0800\_0000} + (16 + 5) \times 4$$

$$\text{Vector\_Addr}(IRQ_5) = \text{0x0800\_0000} + (21 \times 4) = \text{0x0800\_0000} + 84_{10} = \text{0x0800\_0000} + \text{0x54}$$

$$\mathbf{\text{Vector\_Addr}(IRQ_5) = \text{0x0800\_0054}}$$

On clock cycle 2 of the interrupt sequence, the CPU hardware reads the 32-bit word stored at physical memory address `0x0800_0054` and transfers that address directly into the Program Counter ($PC$)!


### 4. Interrupt Masking Registers (`PRIMASK` / `FAULTMASK` / `mstatus`)

To execute critical code sequences that cannot tolerate interruption (such as updating multi-byte shared data structures or modifying clock tree configurations), bare-metal software must be able to disable hardware interrupts temporarily.

#### The `PRIMASK` Special Register (ARM Architecture)

In ARM Cortex-M processors, global interrupt masking is controlled by a 1-bit special register called **`PRIMASK` (Priority Mask Register)**:

```text
PRIMASK REGISTER STATES AND CONTROL INSTRUCTIONS

 PRIMASK = 0  ──► ALL INTERRUPTS ENABLED (Default Execution State)
                  (Peripherals can trigger IRQ handlers normally)

 PRIMASK = 1  ──► ALL CONFIGURABLE INTERRUPTS DISABLED / MASKED!
                  (Only NMI and HardFault can interrupt the CPU!)
```

#### Assembly Control Instructions for Interrupt Masking:
* `cpsid i` (**Change Processor State — Disable Interrupts**):
  Sets `PRIMASK = 1`. All configurable interrupts ($IRQ_0 \dots IRQ_{239}$) are blocked immediately.
* `cpsie i` (**Change Processor State — Enable Interrupts**):
  Clears `PRIMASK = 0`. Interrupt processing resumes normally.

#### The Critical Section State Preservation Rule

A major software engineering flaw in bare-metal assembly is turning interrupts back on unconditionally using `cpsie i` at the end of a function:

```assembly
/* UNSAFE CRITICAL SECTION (CORRUPTS NESTED INTERRUPT STATE!) */
bad_critical_function:
    cpsid   i                   /* Disable interrupts (PRIMASK = 1) */
    /* ... Perform critical memory update ... */
    cpsie   i                   /* ERROR! Unconditionally enables interrupts! */
    bx      lr                  /* Return to caller */
```

#### Why is `cpsie i` Unsafe in Nested Functions?
Suppose `Function A` disables interrupts using `cpsid i` and then calls `bad_critical_function`. 

When `bad_critical_function` executes `cpsie i`, **it turns interrupts back ON prematurely**, destroying `Function A`'s intended critical section protection!

#### The Safe Assembly Solution: Saving and Restoring `PRIMASK` State

To write safe, re-entrant critical sections in assembly, software **MUST read, save, and restore the original `PRIMASK` state**:

```assembly
/* SAFE RE-ENTRANT CRITICAL SECTION IN ASSEMBLY */
safe_critical_function:
    mrs     r0, PRIMASK         /* r0 <= Read current PRIMASK state (0 or 1) */
    cpsid   i                   /* Disable interrupts for our critical section */
    
    /* ... Perform critical memory update safely ... */
    
    msr     PRIMASK, r0         /* RESTORE original PRIMASK state saved in r0! */
    bx      lr                  /* Return cleanly (Interrupt state preserved!) */
```


## Real-World Silicon Failures, Spurious IRQs, and Race Conditions

In production embedded software engineering, interrupt vectoring code is exposed to severe physical edge cases that can freeze microcontrollers or cause sporadic, un-reproducible system crashes.


### 2. Spurious Interrupts and the Default Dummy ISR Fallback

What happens if electrical noise or an un-configured peripheral line triggers an $IRQ$ number whose entry in the vector table was left blank (`0x0000_0000`)?

1. The NVIC accepts the noisy $IRQ_{15}$ signal.
2. The NVIC reads Vector Table offset `0x0000_007C` (Slot for $IRQ_{15}$).
3. Memory returns `0x0000_0000` (Blank entry).
4. The CPU transfers `0x0000_0000` into $PC$ and attempts to fetch an instruction from address zero.
5. **SYSTEM CRASH!** The CPU jumps to address zero, corrupting its stack or triggering an immediate `HardFault`.

#### The Production Assembly Solution: Default Dummy Catch-All ISR

To prevent un-assigned vector entries from crashing the system, production assembly vector tables map **all unused vector slots to a Default Catch-All Dummy ISR (`Default_Handler`)**:

```assembly
/* PRODUCTION VECTOR TABLE WITH CATCH-ALL DUMMY HANDLERS */
.section .isr_vector, "a"
.word _stack_top                /* Vector 0: Initial SP */
.word Reset_Handler             /* Vector 1: Reset */
.word NMI_Handler               /* Vector 2: NMI */
.word HardFault_Handler         /* Vector 3: HardFault */
.word Default_Handler           /* Vector 4: MemManage (Default) */
.word Default_Handler           /* Vector 5: BusFault  (Default) */
/* ... Map all un-assigned peripheral vectors to Default_Handler ... */
.word EXTI0_IRQHandler          /* Vector 16: IRQ 0 (Assigned) */
.word Default_Handler           /* Vector 17: IRQ 1 (Un-assigned Catch-All) */

.section .text
.thumb_func
Default_Handler:
    /* Catch-all trap for spurious or un-handled interrupts */
    b       .                   /* Infinite trap loop for debugging */
```


### Scenario and Parameters

You are a principal bare-metal systems architect writing the interrupt vectoring subsystem for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor uses a 32-bit Harvard architecture with an internal Vector Table Offset Register ($\text{VTOR}$) programmed to physical Flash memory address:

$$\text{VTOR} = \mathbf{\text{0x0800\_0000}}$$

```text
3.2 GZ BARE-METAL SERVER CONTROLLER INTERRUPT VECTORING

 Memory Vector Map: VTOR = 0x0800_0000
 ┌─────────────────────────────────────────────────────────────┐
 │ Vector Table Base @ 0x0800_0000                             │
 │ Peripheral IRQ 12 (Timer 3 Interrupt)                       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Target Timer ISR Assembly Function: TIM3_IRQHandler @ 0x0800_04A2
 Stack Memory Pointer (SP): Currently at 0x2000_3FC0 (8-Byte Aligned)
```

#### Subsystem Specifications:
* **Target Peripheral Event**: Timer 3 Overflow Interrupt assigned to **$IRQ_{12}$** (External Interrupt 12).
* **Target Assembly ISR Function**: `TIM3_IRQHandler` located in Flash memory at address `0x0800_04A2`.
* **CPU Execution Context before Interrupt**:
  * Program Counter $PC = \text{0x0800\_1240}$
  * Link Register $LR = \text{0x0800\_1100}$
  * Status Register $xPSR = \text{0x0100\_0000}$ (Thumb State Bit $T = 1$)
  * Stack Pointer $SP = \text{0x2000\_3FC0}$
  * Registers $r0 = 10, r1 = 20, r2 = 30, r3 = 40, r12 = 50$
* **Hardware Latency Parameters**:
  * Hardware Auto-Stacking Delay (8 words pushed to SRAM) $= 12\text{ CPU Clock Cycles}$ ($3.75\text{ ns}$).
  * Vector Table Read Delay over Flash Bus $= 2\text{ CPU Clock Cycles}$ ($0.625\text{ ns}$).
  * Hardware Unstacking Delay upon `EXC_RETURN` $= 12\text{ CPU Clock Cycles}$ ($3.75\text{ ns}$).

#### Your Objective

1. Calculate the exact physical memory address $\text{Vector\_Addr}(IRQ_{12})$ inside the vector table that holds the function pointer for $IRQ_{12}$.
2. Calculate the exact 32-bit hexadecimal value that MUST be stored at $\text{Vector\_Addr}(IRQ_{12})$ to properly encode `TIM3_IRQHandler` with Thumb LSB execution state.
3. Calculate the new Stack Pointer address ($SP_{\text{stacked}}$) after hardware auto-stacking completes, and list the exact 32-bit values pushed to each memory address on the stack.
4. Calculate the total physical latency $T_{\text{entry}}$ (in nanoseconds and CPU clock cycles) from the instant $IRQ_{12}$ fires until the first instruction of `TIM3_IRQHandler` executes in the pipeline.
5. Write the complete, production-ready ARM Assembly ISR `TIM3_IRQHandler` that safely toggles an LED on GPIO Port A, clears Timer 3's pending bit (`TIM3_SR`), executes a memory barrier (`DSB`), and returns cleanly using `EXC_RETURN`.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Stored Vector Word Value for `TIM3_IRQHandler`

The target function `TIM3_IRQHandler` is located at Flash byte address `0x0800_04A2`.

To encode Thumb execution state ($EPSR.T = 1$), bit 0 must be set to $1$:

$$\text{Word Value} = \text{0x0800\_04A2} \mid 1 = \mathbf{\text{0x0800\_04A3}}$$

Memory location `0x0800_0070` MUST store the 32-bit value **`0x0800_04A3`**!


#### Step 4: Calculate Total Interrupt Entry Latency

The total entry latency $T_{\text{entry}}$ spans hardware stacking (12 cycles) plus instruction prefetch pipeline fill (2 cycles):

$$\text{Total Entry Cycles} = 12 \text{ (Stacking)} + 2 \text{ (Fetch/Decode)} = \mathbf{14 \text{ CPU Clock Cycles}}$$

Convert to physical time at $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{entry\_time}} = 14 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{4.375 \text{ nanoseconds}}$$

The CPU halts the main loop and executes the first instruction of `TIM3_IRQHandler` in **$4.375\text{ nanoseconds}$ ($14\text{ CPU clock cycles}$)** after $IRQ_{12}$ fires!


### Sanity Check and Verification

Let us verify our mathematical, physical, and protocol state results against system principles:

1. **Vector Table Offset Calculation Check**:
   * Offset for $IRQ_{12} = (16 + 12) \times 4 = 28 \times 4 = 112 = \text{0x70}$.
   * $\text{VTOR} + \text{0x70} = \text{0x0800\_0000} + \text{0x0000\_0070} = \mathbf{\text{0x0800\_0070}}$. Math verified!
2. **Stack Frame Memory Boundary Verification**:
   * Initial $SP = \text{0x2000\_3FC0}$.
   * Final $SP = \text{0x2000\_3FA0}$.
   * Memory allocated $= \text{0x2000\_3FC0} - \text{0x2000\_3FA0} = 32\text{ bytes} = 8\text{ words}$.
   * All 8 caller-saved registers ($r0..r3, r12, LR, PC, xPSR$) are completely preserved in RAM.
3. **Pending Bit Clear Check**:
   * `TIM3_SR` Bit 0 (`UIF`) cleared via `bic r3, r3, #(1 << 0)` followed by `dsb` barrier.
   * This prevents infinite ISR re-triggering loops upon `bx lr` execution!

All vector table address calculations, 8-word auto-stacking frame layouts, $14\text{-cycle}$ entry latencies, and assembly ISR execution steps evaluate with 100% mathematical, physical, and logical precision.

