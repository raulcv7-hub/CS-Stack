content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/01-bare-metal-execution-environment/02-nested-vector-interrupt-controllers/01-interrupt-vector-table-dispatch.md
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

---

## The Emergency Room Switchboard: A Mental Model for Interrupt Vectoring

To build an intuitive, crystal-clear mental model of hardware interrupt controllers, vector table lookups, and register context preservation before inspecting transistor-level state machines and bitwise memory maps, let us consider an everyday analogy: **A Hospital Emergency Room**.

Imagine a chief surgeon (**The CPU Execution Core**) performing a complex 4-hour heart surgery (**Executing the Main Program Loop**).

```text
THE HOSPITAL EMERGENCY ROOM METAPHOR

 Chief Surgeon (CPU Execution Core)            Emergency Switchboard Operator
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Operating Room (Main Loop)│                 │ Monitored Switchboard     │
 │ Performing 4-Hour Surgery │                 │ Numbered Indicator Lights │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼                                             │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ HARDWARE INTERRUPT VECTOR DIRECTORY (Vector Table)                      │
 │ Line 16 (IRQ 0 - Heart Attack) ──► Directs to Operating Room #101       │
 │ Line 17 (IRQ 1 - Stroke)       ──► Directs to Operating Room #102       │
 │ Line 18 (IRQ 2 - Broken Bone)  ──► Directs to Operating Room #103       │
 └─────────────────────────────────────────────────────────────────────────┘
```

The surgeon needs to know if an emergency patient arrives at the hospital.

Let us compare two operational strategies for handling incoming emergency patients:

---

### Strategy 1: The Surgeon Walks to the Lobby (Programmed Polling I/O)

Every 2 minutes, the surgeon puts down their scalpel, washes their hands, walks down three flights of stairs to the front lobby, asks the receptionist *"Any new patients?"*, walks back up to the operating room, washes their hands, and resumes the surgery!

Look at what happens:
* The 4-hour surgery takes 16 hours to finish because the surgeon spends $75\%$ of their time walking up and down stairs!
* If a critical heart attack patient arrives at 8:01 AM, they sit waiting in the lobby until the surgeon walks down at 8:02 AM!

This is the **Polling Latency Penalty**.

---

### Strategy 2: The Emergency Switchboard Operator (NVIC / PLIC)

The hospital hires a dedicated **Emergency Switchboard Operator (The Interrupt Controller / NVIC)** who sits at a central console connected to emergency call lines (**Hardware Interrupt Request Lines — $IRQ$**).

The switchboard console features a **Numbered Indicator Light Panel (Interrupt Vector Table)**:
* Line 16 ($IRQ_0$ - Heart Attack): Linked to **Operating Room #101**.
* Line 17 ($IRQ_1$ - Stroke): Linked to **Operating Room #102**.
* Line 18 ($IRQ_2$ - Broken Bone): Linked to **Operating Room #103**.

Now, trace how the switchboard operator handles an incoming emergency at 8:01 AM:

```text
THE SWITCHBOARD OPERATOR INTERRUPT SEQUENCE

 1. Line 16 Flashes (IRQ 0 - Heart Attack Patient Arrives!)
    Operator intercepts signal instantly!
    │
    ▼
 2. Operator Signals Surgeon (Hardware Interrupt Asserted)
    Surgeon pauses surgery instantly!
    │
    ▼
 3. Surgeon Writes Snapshot on Clipboard (Hardware Context Stacking)
    Writes down exact scalpel position & blood pressure on clipboard!
    │
    ▼
 4. Operator Looks at Panel (Vector Table Lookup)
    Line 16 points to Operating Room #101 (Vector Address 0x0800_0180)!
    Surgeon walks STRAIGHT to Room #101 in 10 seconds!
    │
    ▼
 5. Surgeon Treats Heart Attack (Interrupt Service Routine - ISR)
    Surgeon finishes treatment, reads clipboard, and returns to main surgery!
```

Trace the four critical steps executed by the surgeon and switchboard:

1. **Instant Signal Interception (Interrupt Request $IRQ$)**: Line 16 flashes red ($IRQ_0$ goes High). The operator intercepts the signal in a nanosecond.
2. **Preserving the Surgery State (Context Stacking)**: The surgeon cannot just walk away without recording their work! They take a clipboard, quickly write down where they left off, where the scalpel was placed, and the patient's vital signs (**Saving Registers $r0..r3, r12, LR, PC, xPSR$ onto the Stack**), and clip the board to the door.
3. **Zero-Delay Direct Routing (Vector Table Lookup)**: The operator does not ask *"Who called?"*. They look at Line 16, read the panel directory (*"Line 16 $\rightarrow$ Room #101"*), and tell the surgeon: *"Go directly to Room #101!"* The surgeon walks straight to Room #101 without asking a single question (**Vectored Interrupt Dispatch**)!
4. **Resuming the Surgery (Exception Return `EXC_RETURN`)**: When the heart attack patient is stabilized, the surgeon walks back to the main operating room, reads their clipboard (**Unstacking Registers**), picks up the scalpel at the exact millimeter where they left off, and resumes the main surgery seamlessly!

```text
SURGEON CONTEXT STACKING & UNSTACKING

 Main Surgery (Main Loop) ──► Write Clipboard (Stacking) ──► Room #101 (ISR)
                                                             │
 Main Surgery Resumed     ◄── Read Clipboard (Unstacking) ◄──┘
```

Notice what Strategy 2 achieved:
* **$100\%$ Surgeon Efficiency**: The surgeon spent $100\%$ of their time performing surgery until an actual emergency occurred!
* **Deterministic Sub-Microsecond Response**: The surgeon arrived at Room #101 in 10 seconds, regardless of what part of the main surgery they were executing!
* **Zero State Corruption**: The clipboard snapshot guaranteed that the main surgery resumed with zero errors!

This hospital emergency switchboard is the exact physical analogue of **Nested Vectored Interrupt Controllers and Vector Table Dispatch**:
* The chief surgeon is the **CPU Execution Core**.
* Main heart surgery is the **Main Application Program Loop**.
* Emergency call lines are **Hardware Interrupt Request Lines ($IRQ$)**.
* The switchboard operator is the **Nested Vectored Interrupt Controller (NVIC / PLIC)**.
* The numbered indicator panel is the **Interrupt Vector Table**.
* Writing on the clipboard is **Hardware-Automated Context Saving (Stacking)**.
* Walking directly to Room #101 is **Vectored Interrupt Dispatch**.
* Reading the clipboard to resume surgery is **Unstacking and Exception Return (`EXC_RETURN`)**.

---

## Deep Mechanics of NVIC/PLIC, Vector Tables, and Context Stacking

Now that we possess an intuitive mental model of hospital emergency switchboards and clipboard context saving, let us examine the formal, rigorous engineering mechanics of **Nested Vectored Interrupt Controllers (NVIC / PLIC)**, **Interrupt Vector Tables**, and **Hardware Context Stacking**.

---

### 1. The Architecture of the Interrupt Controller (NVIC / PLIC)

An **Interrupt Controller** is a high-speed, specialized hardware sub-engine integrated directly into the processor core or attached to the system bus:
* On ARM Cortex-M processors, this unit is called the **Nested Vectored Interrupt Controller (NVIC)**.
* On RISC-V processors, this unit is called the **Platform-Level Interrupt Controller (PLIC)** or **Core-Local Interrupt Controller (CLIC)**.

```text
INTERNAL HARDWARE BLOCK DIAGRAM OF AN INTERRUPT CONTROLLER

 Hardware Peripherals (UART, Timers, GPIO)
  │ IRQ 0 (UART RX)      ┌───────────────────────────────────────────┐
  ├─────────────────────►│ INTERRUPT CONTROLLER (NVIC / PLIC)        │
  │ IRQ 1 (Timer Overflow│  * Enable Registers  (ISER0..7)           │
  ├─────────────────────►│  * Pending Registers (ISPR0..7)           │
  │ IRQ 2 (GPIO Button)  │  * Priority Registers(IPR0..59)           │
  └─────────────────────►│  * Priority Preemption Evaluator Logic    │
                         └─────────────────────┬─────────────────────┘
                                               │
                                               ▼ Output Core Signals
                         ┌───────────────────────────────────────────┐
                         │ CPU CORE EXECUTION PIPELINE               │
                         │  * Asserts Interrupt Signal               │
                         │  * Drives Vector Address onto Fetch Bus   │
                         └───────────────────────────────────────────┘
```

#### The Internal Register Array of the Interrupt Controller

To manage hundreds of asynchronous peripheral lines, the interrupt controller incorporates three primary arrays of Memory-Mapped I/O (MMIO) control registers:

1. **Interrupt Set-Enable Registers (`ISER0` .. `ISER7`)**:
   Bit-mapped registers where setting bit $k$ to $1$ enables hardware $IRQ_k$. If bit $k$ is $0$, $IRQ_k$ is masked (ignored by hardware).
2. **Interrupt Set-Pending Registers (`ISPR0` .. `ISPR7`)**:
   Bit-mapped registers where bit $k$ turns to $1$ the exact nanosecond peripheral line $IRQ_k$ fires, recording the hardware event even if the CPU is currently busy or interrupts are temporarily disabled.
3. **Interrupt Priority Registers (`IPR0` .. `IPR59`)**:
   8-bit registers assigned to each $IRQ$, storing a programmable numerical priority value ($0 \dots 255$). Lower numerical values represent **higher physical preemption priority** ($0 =$ Highest Priority).

---

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

---

### 3. Hardware-Automated Context Saving (Stacking) and Unstacking

Before the CPU execution pipeline can overwrite its general-purpose registers to execute the Interrupt Service Routine (ISR), it must preserve the active working context of the interrupted main program.

On modern real-time architectures (such as ARM Cortex-M), context saving is executed **100% automatically by silicon hardware in parallel with the vector fetch**!

#### The 8-Register Hardware Auto-Stacking Frame

When an $IRQ$ is accepted, the CPU hardware automatically decrements the active Stack Pointer ($SP$) by 8 words ($32\text{ bytes}$) and pushes **8 core registers** onto the stack in a single hardware operation:

```text
HARDWARE AUTO-STACKING FRAME ON THE STACK (SP)

 High Memory Address
 ┌───────────────────────────────────────────────────────────┐ ◄── SP Before Interrupt
 │ xPSR  (Execution Program Status Register)                 │
 ├───────────────────────────────────────────────────────────┤
 │ PC    (Return Address to Main Program)                    │
 ├───────────────────────────────────────────────────────────┤
 │ LR    (Link Register / EXC_RETURN Value)                  │
 ├───────────────────────────────────────────────────────────┤
 │ r12   (Intra-Procedure-Call Scratch Register)             │
 ├───────────────────────────────────────────────────────────┤
 │ r3    (Argument / Scratch Register 3)                     │
 ├───────────────────────────────────────────────────────────┤
 │ r2    (Argument / Scratch Register 2)                     │
 ├───────────────────────────────────────────────────────────┤
 │ r1    (Argument / Scratch Register 1)                     │
 ├───────────────────────────────────────────────────────────┤
 │ r0    (Argument / Scratch Register 0)                     │
 └───────────────────────────────────────────────────────────┘ ◄── SP After Stacking
 Low Memory Address (Aligned to 8-Byte Boundary!)
```

#### Why Are These Specific 8 Registers Stacked by Hardware?
These 8 registers ($xPSR, PC, LR, r12, r0..r3$) represent the **Caller-Saved Registers** defined by the C Application Binary Interface (ABI):
* By saving $r0..r3$ and $r12$ in hardware, any standard C function or assembly routine can be executed as an ISR **without needing custom software entry/exit wrapper code**!
* The remaining registers ($r4..r11$) are **Callee-Saved Registers**. If the ISR modified $r4..r11$, the C compiler automatically generates `PUSH {r4-r11}` instructions at the start of the ISR function body.

#### Hardware Stacking Latency (12 Clock Cycles)
Pushing 8 words onto the memory stack takes **12 clock cycles** on a 32-bit bus. 

During these 12 clock cycles:
* Cycles 1–8: Hardware pushes the 8 registers onto the stack memory over the data bus.
* Cycles 9–12: Hardware reads the target ISR address from the vector table over the instruction bus.

Because data stacking and instruction vector fetching occur **simultaneously over separate internal buses (Harvard Architecture)**, the total interrupt entry latency is reduced to just **12 clock cycles ($3.75\text{ nanoseconds}$ at $3.2\text{ GHz}$)**!

---

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

---

### 5. The Hardware Exception Return Mechanism (`EXC_RETURN` / `mret`)

When an Interrupt Service Routine (ISR) finishes executing, how does the CPU hardware know that it should exit interrupt mode, unstack the 8 saved registers from RAM, and return to the main application loop?

When an interrupt entry occurs, the CPU hardware **loads a special 32-bit magic value into the Link Register ($LR$ / $r14$)** called **`EXC_RETURN`**:

```text
EXC_RETURN SPECIAL LINK REGISTER VALUES

 Value          │ Return Execution Mode │ Target Stack Pointer Used
────────────────┼───────────────────────┼───────────────────────────
  0xFFFF_FFF9   │ Handler Mode (Nested) │ Main Stack Pointer (MSP)
  0xFFFF_FFFD   │ Thread Mode (Main)    │ Process Stack Pointer (PSP)
  0xFFFF_FFE9   │ Thread Mode with FPU  │ Process Stack Pointer (PSP)
```

```text
HARDWARE UNSTACKING VIA EXC_RETURN INSTRUCTION

 ISR Function ends with standard return: BX LR (where LR = 0xFFFFFFFD)
                               │
                               ▼
 CPU Hardware detects LSB pattern 0xF...FD in Program Counter!
                               │
                               ▼
 1. Hardware triggers Automatic Unstacking Pipeline (12 Cycles).
 2. Pops r0..r3, r12, LR, PC, xPSR off Stack memory (SP).
 3. Restores EPSR.T bit and restores original SP.
 4. Resumes Main Application Loop at exact restored PC address!
```

1. During normal function calls, $LR$ holds a physical return address (e.g., `0x0800_01A4`).
2. During an interrupt entry, the hardware sets $LR = \text{0xFFFFFFFD}$ (a special reserved address range above physical memory).
3. When the ISR executes its standard function return instruction (`bx lr`), the hardware detects the top bits `0xF...` being loaded into $PC$.
4. **The Hardware Unstacking Event**: The CPU detects `EXC_RETURN`, halts normal instruction fetches, and triggers the **Automated Hardware Unstacking Pipeline**:
   * Reads 8 words ($r0..r3, r12, LR, PC, xPSR$) off the stack memory.
   * Restores general-purpose registers $r0..r3$ and $r12$.
   * Restores $EPSR.T$ execution state from the saved $xPSR$.
   * Restores $SP \Leftarrow SP + 32$.
   * Sets $PC \Leftarrow \text{Saved } PC$.
5. The main application loop resumes execution on the very next clock cycle with **$100\%$ zero state corruption**!

---

## Real-World Silicon Failures, Spurious IRQs, and Race Conditions

In production embedded software engineering, interrupt vectoring code is exposed to severe physical edge cases that can freeze microcontrollers or cause sporadic, un-reproducible system crashes.

---

### 1. The Infinite ISR Re-Triggering Lockup (Un-Cleared Pending Flags)

Consider a junior systems engineer writing a bare-metal assembly handler for a GPIO button interrupt (`EXTI0_IRQHandler` on $IRQ_0$).

When the button is pressed, the hardware peripheral sets bit 0 in its **Pending Register (`EXTI_PR`)** to $1$. The NVIC detects the pending bit and triggers `EXTI0_IRQHandler`.

The engineer writes the following assembly ISR:

```assembly
/* BAD ISR HANDLER (CAUSES INFINITE INTERRUPT RE-TRIGGERING!) */
EXTI0_IRQHandler:
    /* Perform user action (e.g., toggle LED) */
    ldr     r0, =GPIO_ODR
    ldr     r1, [r0]
    eor     r1, r1, #1
    str     r1, [r0]
    
    bx      lr                  /* ERROR! FORGOT TO CLEAR EXTI_PR PENDING BIT! */
```

Trace the catastrophic hardware lockup that occurs when `bx lr` executes:

```text
INFINITE ISR RE-TRIGGERING LOOP

 1. EXTI Pending Bit PR0 = 1 ──► NVIC triggers EXTI0_IRQHandler.
 2. ISR executes LED toggle...
 3. ISR executes 'bx lr' WITHOUT CLEARING PR0!
 4. Hardware Unstacks registers and returns to Main Program...
                               │
                               ▼ AT THE VERY NEXT CLOCK CYCLE!
 5. NVIC sees EXTI Pending Bit PR0 is STILL = 1!
 6. NVIC RE-TRIGGERS EXTI0_IRQHandler IMMEDIATELY!
 (The CPU is trapped executing EXTI0_IRQHandler 100% of the time! Main loop FROZEN!)
```

* Because the engineer forgot to clear the peripheral's pending bit (`EXTI_PR`), the hardware $IRQ$ line remains asserted High.
* The moment the CPU finishes unstacking and exits the ISR, the NVIC sees `Pending Bit = 1` and **re-triggers the exact same ISR immediately on the very next clock cycle**!
* The main program loop never executes a single instruction again. The system enters an **Infinite ISR Re-Triggering Lockup**.

#### The Hardware Fix (Writing 1 to Clear Pending Bits):
Peripherals require software to write a $1$ to the pending bit to clear it (Write-1-to-Clear / `W1C` hardware mechanics):

```assembly
/* CORRECTED ISR HANDLER (CLEARS PENDING BIT PROPERLY) */
EXTI0_IRQHandler:
    /* 1. Toggle LED */
    ldr     r0, =GPIO_ODR
    ldr     r1, [r0]
    eor     r1, r1, #1
    str     r1, [r0]
    
    /* 2. CLEAR EXTI PENDING BIT BY WRITING 1 TO EXTI_PR BIT 0 */
    ldr     r0, =EXTI_PR
    movs    r1, #(1 << 0)       /* Write 1 to Bit 0 to clear pending state */
    str     r1, [r0]
    
    /* 3. Memory Barrier to ensure clear completes before exit */
    dsb                         /* Data Synchronization Barrier */
    
    bx      lr                  /* Return cleanly to main loop! */
```

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Vector Calculation, Stacking Cycle Analysis, and Assembly Synthesis

To consolidate your complete mastery of hardware interrupt controllers, vector table address arithmetic, context stacking latencies, and assembly ISR synthesis, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Vector Table Memory Address for $IRQ_{12}$

We apply the Vector Address Calculation Formula for $IRQ_{12}$ ($n = 12$):

$$\text{Vector\_Addr}(IRQ_n) = \text{VTOR} + (16 + n) \times 4$$

$$\text{Vector\_Addr}(IRQ_{12}) = \text{0x0800\_0000} + (16 + 12) \times 4$$

$$\text{Vector\_Addr}(IRQ_{12}) = \text{0x0800\_0000} + (28 \times 4) = \text{0x0800\_0000} + 112_{10}$$

Convert $112_{10}$ to Hexadecimal ($112 = 7 \times 16 \implies \text{0x70}$):

$$\mathbf{\text{Vector\_Addr}(IRQ_{12}) = \text{0x0800\_0000} + \text{0x0000\_0070} = \text{0x0800\_0070}}$$

The function pointer for $IRQ_{12}$ is stored at physical memory address **`0x0800_0070`**!

---

#### Step 2: Calculate Stored Vector Word Value for `TIM3_IRQHandler`

The target function `TIM3_IRQHandler` is located at Flash byte address `0x0800_04A2`.

To encode Thumb execution state ($EPSR.T = 1$), bit 0 must be set to $1$:

$$\text{Word Value} = \text{0x0800\_04A2} \mid 1 = \mathbf{\text{0x0800\_04A3}}$$

Memory location `0x0800_0070` MUST store the 32-bit value **`0x0800_04A3`**!

---

#### Step 3: Calculate Stack Pointer & Auto-Stacking Frame Layout

Before $IRQ_{12}$ arrived, $SP = \text{0x2000\_3FC0}$.

Hardware pushes 8 words ($32\text{ bytes}$) onto the stack.

##### 1. Calculate New Stack Pointer ($SP_{\text{stacked}}$):

$$SP_{\text{stacked}} = SP_{\text{initial}} - 32 = \text{0x2000\_3FC0} - \text{0x0000\_0020} = \mathbf{\text{0x2000\_3FA0}}$$

##### 2. Verify AAPCS 8-Byte Stack Alignment Invariant:

$$SP_{\text{stacked}} \pmod 8 = \text{0x2000\_3FA0} \pmod 8 = 0 \quad (\mathbf{\text{8-BYTE ALIGNMENT PRESERVED!}})$$

##### 3. Map the 8-Word Stacking Frame in SRAM Memory:

```text
STACKING FRAME MEMORY MAPPING (0x2000_3FA0 TO 0x2000_3FBF)

 Stack Address │ Stored Register │ Stored 32-Bit Hexadecimal Value
───────────────┼─────────────────┼─────────────────────────────────────────────
  0x2000_3FC0  │ (Pre-IRQ SP)    │ 0x2000_3FC0 (Initial Top of Stack)
  0x0000_3FBC  │ xPSR            │ 0x0100_0000 (Thumb Bit T = 1)
  0x0000_3FB8  │ PC              │ 0x0800_1240 (Return Address to Main Loop)
  0x0000_3FB4  │ LR              │ 0x0800_1100 (Caller Link Register)
  0x0000_3FB0  │ r12             │ 0x0000_0032 (50_10)
  0x0000_3FAC  │ r3              │ 0x0000_0028 (40_10)
  0x0000_3FA8  │ r2              │ 0x0000_001E (30_10)
  0x0000_3FA4  │ r1              │ 0x0000_0014 (20_10)
  0x0000_3FA0  │ r0              │ 0x0000_000A (10_10) ◄── New SP Position
```

---

#### Step 4: Calculate Total Interrupt Entry Latency

The total entry latency $T_{\text{entry}}$ spans hardware stacking (12 cycles) plus instruction prefetch pipeline fill (2 cycles):

$$\text{Total Entry Cycles} = 12 \text{ (Stacking)} + 2 \text{ (Fetch/Decode)} = \mathbf{14 \text{ CPU Clock Cycles}}$$

Convert to physical time at $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{entry\_time}} = 14 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{4.375 \text{ nanoseconds}}$$

The CPU halts the main loop and executes the first instruction of `TIM3_IRQHandler` in **$4.375\text{ nanoseconds}$ ($14\text{ CPU clock cycles}$)** after $IRQ_{12}$ fires!

---

#### Step 5: Complete Production Assembly ISR Synthesis (`TIM3_IRQHandler`)

Here is the complete, production-ready ARM Assembly Interrupt Service Routine for Timer 3:

```assembly
/* PRODUCTION BARE-METAL TIMER 3 INTERRUPT SERVICE ROUTINE */
.syntax unified
.cpu cortex-m4
.thumb

/* MMIO Register Base Addresses */
.equ TIM3_BASE,       0x40000400
.equ TIM3_SR,         0x40000410        /* Timer 3 Status Register */

.equ GPIOA_BASE,      0x40020000
.equ GPIOA_ODR,       0x40020014        /* GPIO Port A Output Data Register */

.global TIM3_IRQHandler
.type TIM3_IRQHandler, %function

.section .text
.thumb_func
TIM3_IRQHandler:
    /* Step 1: Perform User Action - Toggle LED on GPIOA Pin 5 */
    ldr     r0, =GPIOA_ODR
    ldr     r1, [r0]
    eor     r1, r1, #(1 << 5)           /* Toggle Bit 5 */
    str     r1, [r0]

    /* Step 2: CLEAR TIMER 3 PENDING INTERRUPT BIT (TIM3_SR.UIF = 0) */
    ldr     r2, =TIM3_SR
    ldr     r3, [r2]
    bic     r3, r3, #(1 << 0)           /* Clear Bit 0 (Update Interrupt Flag) */
    str     r3, [r2]

    /* Step 3: MEMORY BARRIER (Ensures clear completes before ISR exit!) */
    dsb                                 /* Data Synchronization Barrier */

    /* Step 4: HARDWARE EXCEPTION RETURN (Triggers Unstacking Pipeline) */
    /* Loading EXC_RETURN (0xFFFFFFFD) into PC restores r0..r3, r12, LR, PC, xPSR */
    bx      lr
.size TIM3_IRQHandler, .-TIM3_IRQHandler
```

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Nested Vectored Interrupt Controller (NVIC / PLIC)**: A core-coupled hardware sub-engine that monitors asynchronous peripheral $IRQ$ lines, evaluates preemption priorities, manages hardware-automated context stacking, and drives the Program Counter ($PC$) directly to target vector addresses in a deterministic $12\text{ to } 14\text{ clock cycles}$.
* **Interrupt Vector Table**: A hardwired or $\text{VTOR}$-mapped memory array where entry $16 + n$ holds the 32-bit physical instruction address ($\text{Vector\_Addr} = \text{VTOR} + (16+n) \times 4$) of the Interrupt Service Routine (ISR) assigned to $IRQ_n$.
* **Automated Context Stacking**: The hardware mechanism that automatically pushes 8 caller-saved registers ($r0..r3, r12, LR, PC, xPSR$) onto the stack memory ($SP \Leftarrow SP - 32$) upon interrupt entry, enabling standard assembly or C functions to execute as ISRs without manual register wrappers.
* **`PRIMASK` Critical Section Preservation**: The practice of reading, saving, and restoring the 1-bit `PRIMASK` register (`mrs r0, PRIMASK` $\to$ `cpsid i` $\to$ `msr PRIMASK, r0`) to execute atomic critical sections without destroying pre-existing nested interrupt enable states.