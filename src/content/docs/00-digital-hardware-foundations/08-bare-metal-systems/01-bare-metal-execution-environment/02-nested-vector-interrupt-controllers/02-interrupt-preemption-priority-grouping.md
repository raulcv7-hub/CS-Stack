---
title: "Nested Interrupt Preemption, Priority Grouping, and Multi-Tier Vector Arbitration"
---

# Nested Interrupt Preemption, Priority Grouping, and Multi-Tier Vector Arbitration

## The Real-Time Emergency Blocking Crisis

In high-performance embedded systems and real-time control applications, a central processing unit (CPU) core manages multiple hardware peripherals simultaneously. A bare-metal microcontroller operating an electric motor, an automated braking system, or a high-speed optical network interface executes its main software loop while reacting to asynchronous hardware event signals called **Interrupt Requests ($IRQ$)**.

Suppose a microcontroller is actively servicing a low-priority interrupt. For example, a Universal Asynchronous Receiver-Transmitter (UART) serial port receives a diagnostic text character, triggering $IRQ_{10}$. 

The CPU halts its main program, saves its working registers onto the stack, and enters the UART **Interrupt Service Routine ($ISR$)**. Processing this slow diagnostic character in assembly takes $20\text{ microseconds}$ ($20,000\text{ nanoseconds}$).

Now, imagine that $2\text{ microseconds}$ into the UART $ISR$, a critical, life-threatening emergency occurs:
An electric motor inverter detects a destructive over-current voltage spike on a General Purpose Input/Output (GPIO) pin, triggering $IRQ_0$. 

To prevent the high-power transistors on the inverter board from overheating and physically exploding, the motor control $ISR$ must execute and disable the pulse-width modulation (PWM) outputs within **$200\text{ nanoseconds}$**!

```text
THE REAL-TIME PRIORITY BLOCKING DISASTER

 Time t = 0 us  : UART Character Arrives (IRQ 10) -> CPU enters UART ISR (Takes 20 us)
 Time t = 2 us  : MOTOR OVER-CURRENT SPIKE! (IRQ 0 - Must respond in 200 ns!)
                  │
                  ▼ (NO PREEMPTION: CPU stays locked in UART ISR!)
 Time t = 20 us : UART ISR finishes -> CPU finally enters Motor ISR...
                  ▲
                  └── 18 MICROSECONDS TOO LATE! (MOSFET Transistors EXPLODE!)
```

Look at the catastrophic hardware failure that occurs if the interrupt controller operates under a **Non-Nested Interrupt Policy**:

1. Under a non-nested policy, once the CPU enters the low-priority UART $ISR$, **all other hardware interrupts are blocked** until the UART $ISR$ finishes executing!
2. When the critical motor over-current $IRQ_0$ fires at $t = 2\text{ }\mu\text{s}$, the hardware interrupt controller sees that an $ISR$ is already active. It sets $IRQ_0$ to a pending state and forces the motor $ISR$ to wait in line.
3. The CPU spends the next $18\text{ microseconds}$ executing low-priority UART text formatting instructions.
4. By the time the UART $ISR$ finishes at $t = 20\text{ }\mu\text{s}$ and the CPU finally enters the motor $ISR$, **$18\text{ microseconds}$ have elapsed**—90 times longer than the motor's $200\text{-ns}$ safety limit!
5. The power transistors melt, and the hardware board is destroyed!

Non-nested interrupt execution fails in real-time embedded systems because it allows long, non-critical tasks to block time-critical safety events.

To solve this blocking crisis, hardware engineers cannot simply treat all interrupts as equal. The hardware interrupt controller requires two distinct capabilities:

1. **Nested Interrupt Preemption**: If a high-priority $IRQ$ fires while the CPU is midway through executing a low-priority $ISR$, the hardware must automatically **pause the low-priority $ISR$ mid-flight**, stack its state, and jump immediately to the high-priority $ISR$!
2. **Deterministic Sub-Priority Tie-Breaking**: What happens if two interrupts of equal preemption rank arrive at the exact same physical clock cycle? The hardware must resolve the tie predictably without allowing one to preempt the other if one is already running.

To provide both dynamic preemption and deterministic tie-breaking, modern interrupt controllers employ **Interrupt Preemption Priorities** and configurable **Priority Grouping (`PRIGROUP`)**.


### Scenario 1: Nested Preemption (Heart Attack Interrupts Paper Cut)

1. **8:00 AM**: Patient A arrives with a minor paper cut (**Priority Rank 2 — Low Priority $ISR$**). The doctor begins applying a small bandage.
2. **8:02 AM**: Patient B arrives in an ambulance suffering a life-threatening heart attack (**Priority Rank 0 — High Priority $IRQ$**).
3. **The Preemption Action**:
   * The triage nurse evaluates Patient B's rank ($0$) against Patient A's rank ($2$).
   * Because Rank $0$ is a far higher emergency severity than Rank $2$, **the nurse commands the doctor to STOP bandaging Patient A immediately**!
   * The doctor writes a quick note on Patient A's chart (*"Bandage half-applied at 8:02 AM"* — **Hardware Context Stacking**), leaves Patient A in Treatment Room 2, and runs to the Trauma Bay to treat Patient B (**Nested $ISR$ Execution**)!
4. **8:10 AM**: The doctor finishes stabilizing Patient B's heart attack.
5. **Resuming Patient A**: The doctor walks back to Treatment Room 2, reads Patient A's chart (**Unstacking Context**), finishes applying the bandage, and discharges Patient A!

```text
NESTED PREEMPTION TIMELINE

 08:00 AM : Doctor treats Patient A (Paper Cut - Rank 2)
 08:02 AM : Patient B arrives (Heart Attack - Rank 0)
            │
            ▼ PREEMPTION EVENT! (Doctor pauses Patient A!)
 08:02 AM : Doctor treats Patient B (Heart Attack - Rank 0) ──► Saved at 8:10 AM!
            │
            ▼ Doctor returns to Patient A!
 08:10 AM : Doctor finishes Patient A (Paper Cut) ──► Discharged at 8:12 AM!
 (Heart attack patient saved in 0 seconds! Paper cut completed with zero errors!)
```

Look at the life-saving power of Nested Preemption:
Patient B was treated in 0 seconds, while Patient A was paused safely and resumed later!


## Primitive 1: Interrupt Preemption Priority

Now that we possess an intuitive mental model of ER doctors and triage ranks, let us examine the formal engineering mechanics of **Interrupt Preemption Priority**.

In a bare-metal processor equipped with a Nested Vectored Interrupt Controller (such as the ARM Cortex-M NVIC or RISC-V PLIC/CLIC), every external hardware $IRQ$ line is assigned a dedicated 8-bit Memory-Mapped I/O (MMIO) register called the **Interrupt Priority Register (`IPR0` .. `IPR59`)**.

```text
8-BIT INTERRUPT PRIORITY REGISTER (`IPR_k`) BITFIELD MAP

 Bit 7       Bit 6       Bit 5       Bit 4       Bit 3       Bit 0
 ┌───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
 │ Priority  │ Priority  │ Priority  │ Priority  │ Un-used / │ Un-used / │
 │ Bit 3     │ Bit 2     │ Bit 1     │ Bit 0     │ Read as 0 │ Read as 0 │
 └───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
  ◄──────── 4 Implemented Priority Bits (MSB) ──────► ◄─ 4 Un-implemented ─►
```


### The Preemption Rule

When a new hardware interrupt $IRQ_{\text{new}}$ fires while the CPU is actively executing an Interrupt Service Routine $ISR_{\text{active}}$, the interrupt controller evaluates **The Preemption Condition**:

$$\mathbf{\text{Preempt Active ISR} \iff \text{Priority}(IRQ_{\text{new}}) < \text{Priority}(ISR_{\text{active}})}$$

Where:
* $\text{Priority}(IRQ_{\text{new}})$ is the numerical preemption priority value of the incoming interrupt.
* $\text{Priority}(ISR_{\text{active}})$ is the numerical preemption priority value of the currently executing $ISR$.

```text
PREEMPTION DECISION MATRIX

 Current Active ISR Priority │ Incoming IRQ Priority │ Action Executed by Hardware
─────────────────────────────┼───────────────────────┼─────────────────────────────────────────────
    0x20 (Priority Level 2)  │  0x00 (Priority Lvl 0)│ PREEMPT IMMEDIATELY! Stack new ISR frame!
    0x20 (Priority Level 2)  │  0x20 (Priority Lvl 2)│ DO NOT PREEMPT! Set IRQ to Pending state.
    0x20 (Priority Level 2)  │  0x40 (Priority Lvl 4)│ DO NOT PREEMPT! Set IRQ to Pending state.
```

If $\text{Priority}(IRQ_{\text{new}}) < \text{Priority}(ISR_{\text{active}})$, the interrupt controller **immediately pauses $ISR_{\text{active}}$ mid-instruction, pushes a second nested context frame onto the stack, and jumps to $ISR_{\text{new}}$**!


### The `PRIGROUP` Division Table

By writing a value from $0 \text{ to } 7$ into the 3-bit `PRIGROUP` field (`AIRCR[10:8]`), the hardware shifts the binary boundary dividing Preemption Bits from Sub-Priority Bits:

```text
PRIGROUP FIELD CONFIGURATION TABLE (FOR 4 IMPLEMENTED MSB BITS)

 PRIGROUP Value │ Binary Split [Preempt : Sub] │ Preemption Levels │ Sub-Priority Levels
────────────────┼──────────────────────────────┼───────────────────┼──────────────────────
    3'b000 (0)  │  7 Bits Preempt : 1 Bit Sub  │ 16 Levels (0..15) │ 1 Level (No Sub-P)
    3'b100 (4)  │  3 Bits Preempt : 1 Bit Sub  │  8 Levels (0..7)  │ 2 Levels (0..1)
    3'b101 (5)  │  2 Bits Preempt : 2 Bits Sub │  4 Levels (0..3)  │ 4 Levels (0..3)
    3'b110 (6)  │  1 Bit Preempt  : 3 Bits Sub │  2 Levels (0..1)  │ 8 Levels (0..7)
    3'b111 (7)  │  0 Bits Preempt : 4 Bits Sub │  1 Level (None!)  │ 16 Levels (0..15)
```

#### Mathematical Formulas for Preemption and Sub-Priority Grouping

Let $P_{\text{bits}}$ be the number of bits allocated to Preemption Priority, and $S_{\text{bits}}$ be the number of bits allocated to Sub-Priority.

For a hardware implementation with $B_{\text{impl}}$ implemented MSB bits (e.g., $B_{\text{impl}} = 4$ bits):

$$P_{\text{bits}} = \max\left(0, \ \text{7} - \text{PRIGROUP\_Value}\right)$$

$$S_{\text{bits}} = B_{\text{impl}} - P_{\text{bits}}$$

$$\text{Number of Preemption Groups} = 2^{P_{\text{bits}}}$$

$$\text{Number of Sub-Priorities per Group} = 2^{S_{\text{bits}}}$$


## Nested Context Stacking Mechanics and Memory Consumption

When a high-priority interrupt preempts a currently executing low-priority interrupt handler, how does the CPU execution pipeline manage its hardware registers?

The CPU utilizes **Nested Hardware Auto-Stacking**.

### The Nested Stack Memory Layout

Recall that upon entering any exception, the hardware automatically pushes 8 caller-saved registers ($xPSR, PC, LR, r12, r0..r3$) onto the active stack memory—occupying **$32\text{ bytes}$ per nesting level**.

If an application experiences $D$ levels of nested interrupt preemption, the physical stack memory must accommodate $D$ consecutive $32\text{-byte}$ hardware stack frames plus any local variables allocated by the assembly $ISR$ handlers:

$$\mathbf{\text{Total Stack Memory Consumed} = \sum_{k=1}^{D} \left( 32\text{ Bytes} + \text{Local\_Variables}_k \right)}$$

```text
NESTED STACK FRAME LAYOUT ON THE MAIN STACK POINTER (MSP)

 High Memory Address
 ┌───────────────────────────────────────────────────────────┐ ◄── SP Initial (Main Loop)
 │ Interrupted Main Program Execution Context (32 Bytes)     │
 ├───────────────────────────────────────────────────────────┤ ◄── SP Level 1
 │ Low-Priority ISR_A Local Stack Variables                  │
 ├───────────────────────────────────────────────────────────┤
 │ Low-Priority ISR_A Context Frame (32 Bytes)               │
 ├───────────────────────────────────────────────────────────┤ ◄── SP Level 2 (Preemption!)
 │ High-Priority ISR_B Local Stack Variables                 │
 ├───────────────────────────────────────────────────────────┤
 │ High-Priority ISR_B Context Frame (32 Bytes)               │
 └───────────────────────────────────────────────────────────┘ ◄── SP Level 3 (Current Active SP)
 Low Memory Address
```

#### The Stack Depth Invariant:
To prevent un-controlled nested preemption from overflowing physical SRAM memory and corrupting adjacent global variables, embedded systems engineers **must bound the maximum number of preemption priority levels**!


## Real-World Silicon Failures, Priority Inversions, and Stack Exhaustion

In production embedded systems engineering, mis-configuring preemption priorities and `PRIGROUP` registers causes catastrophic, un-reproducible field failures.


### 2. The `AIRCR` Vector Key Protection Barrier

In ARM Cortex-M processors, the `PRIGROUP` field resides inside the **Application Interrupt and Reset Control Register (`SCB->AIRCR`)**.

Because modifying `AIRCR` can also trigger a system-wide hardware reset or alter global interrupt priority grouping, the silicon manufacturer guards `AIRCR` with a **16-bit Vector Key Protection Barrier**:

```text
SCB->AIRCR REGISTER BITFIELD LAYOUT

 Bit 31                               Bit 16 Bit 15 Bit 11 Bit 10   Bit 8 Bit 7       Bit 0
 ┌──────────────────────────────────────────┬──────────────┬─────────────┬───────────────┐
 │ VECTKEY / VECTKEYSTAT Field (16 Bits)    │ ENDIANNESS   │ PRIGROUP    │ SYSRESETREQ   │
 │ (MUST write 0x05FA to unlock register!)  │ (1 Bit)      │ (3 Bits)    │ (1 Bit)       │
 └──────────────────────────────────────────┴──────────────┴─────────────┴───────────────┘
```

#### The Write Rule:
To modify the `PRIGROUP` field in `SCB->AIRCR`, software **MUST write the magic key value `0x05FA` into the upper 16 bits (`VECTKEY[15:0]`) in the exact same write instruction**:

$$\text{Write Value to AIRCR} = (\text{0x05FA} \ll 16) \ \mid \ (\text{Desired PRIGROUP Value} \ll 8)$$

If software attempts to write to `SCB->AIRCR` without `0x05FA` in the upper 16 bits:
* The hardware **ignores the write completely**!
* `PRIGROUP` remains unchanged, and the preemption settings fail quietly!


### Scenario and Parameters

You are a principal embedded systems architect designing the interrupt prioritization engine for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor implements $B_{\text{impl}} = \mathbf{4 \text{ Priority Bits}}$ in physical silicon (the top 4 bits of each 8-bit `IPR` register, bits $[7:4]$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER PRIORITY ENGINE

 System Configuration:
 ┌─────────────────────────────────────────────────────────────┐
 │ Priority Register Implementation: 4 Bits (MSBs [7:4])       │
 │ System Control Register         : SCB->AIRCR                │
 │ Configured PRIGROUP             : 3'b101 (PRIGROUP = 5)     │
 └─────────────────────────────────────────────────────────────┘
```

#### Assigned Hardware Peripherals and Priority Bytes:
1. **Motor Inverter Over-Current ($IRQ_0$)**: Assigned Priority Byte $= \mathbf{\text{0x20}}$ (`0010_0000_2`).
2. **High-Speed SPI Sensor ($IRQ_1$)**: Assigned Priority Byte $= \mathbf{\text{0x30}}$ (`0011_0000_2`).
3. **UART Telemetry Port ($IRQ_2$)**: Assigned Priority Byte $= \mathbf{\text{0x40}}$ (`0100_0000_2`).
4. **System Tick Timer ($IRQ_3$)**: Assigned Priority Byte $= \mathbf{\text{0x80}}$ (`1000_0000_2`).

#### System Execution Events:
Software programs `SCB->AIRCR.PRIGROUP = 5` (`3'b101`).

At physical time $t = 0.0\text{ ns}$, the CPU is executing its main application loop.
* At $t = 10.0\text{ ns}$, **UART ($IRQ_2$, `0x40`)** fires.
* At $t = 20.0\text{ ns}$ (while UART $ISR$ is active), **SPI ($IRQ_1$, `0x30`)** fires.
* At $t = 25.0\text{ ns}$ (while SPI $ISR$ is active), **Motor ($IRQ_0$, `0x20`)** fires.
* At $t = 26.0\text{ ns}$, **SysTick ($IRQ_3$, `0x80`)** fires.

#### Your Objective

1. For `PRIGROUP = 5` and $B_{\text{impl}} = 4$ implemented bits, calculate the exact number of Preemption Bits ($P_{\text{bits}}$), Sub-Priority Bits ($S_{\text{bits}}$), total Preemption Groups, and Sub-Priorities per group.
2. Calculate the **Preemption Group Number** and **Sub-Priority Value** for each of the 4 peripherals ($IRQ_0, IRQ_1, IRQ_2, IRQ_3$).
3. Trace the step-by-step nested execution sequence and stack pointer changes ($SP$) across time:
   * Show which $IRQs$ execute **Nested Preemption** and which execute **Tail-Chaining**.
   * Calculate the maximum nested stack memory overhead (in bytes and stack frames) consumed during the peak preemption depth.
4. Write the production ARM Assembly code to program `SCB->AIRCR.PRIGROUP = 5` using the `0x05FA` VECTKEY unlocking barrier.
5. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Preemption Group & Sub-Priority for Each Peripheral

We decompose each peripheral's 8-bit priority byte into Preemption Bits $[7:6]$ and Sub-Priority Bits $[5:4]$:

##### 1. Motor Inverter ($IRQ_0$, Priority Byte $= \text{0x20} = \mathbf{0010\_0000_2}$):
* Preemption Bits $[7:6] = 00_2 = \mathbf{0}$
* Sub-Priority Bits $[5:4] = 10_2 = \mathbf{2}$
* **Classification**: **Preemption Group 0, Sub-Priority 2**

##### 2. SPI Sensor ($IRQ_1$, Priority Byte $= \text{0x30} = \mathbf{0011\_0000_2}$):
* Preemption Bits $[7:6] = 00_2 = \mathbf{0}$
* Sub-Priority Bits $[5:4] = 11_2 = \mathbf{3}$
* **Classification**: **Preemption Group 0, Sub-Priority 3**

##### 3. UART Telemetry ($IRQ_2$, Priority Byte $= \text{0x40} = \mathbf{0100\_0000_2}$):
* Preemption Bits $[7:6] = 01_2 = \mathbf{1}$
* Sub-Priority Bits $[5:4] = 00_2 = \mathbf{0}$
* **Classification**: **Preemption Group 1, Sub-Priority 0**

##### 4. SysTick Timer ($IRQ_3$, Priority Byte $= \text{0x80} = \mathbf{1000\_0000_2}$):
* Preemption Bits $[7:6] = 10_2 = \mathbf{2}$
* Sub-Priority Bits $[5:4] = 00_2 = \mathbf{0}$
* **Classification**: **Preemption Group 2, Sub-Priority 0**

```text
PERIPHERAL PRIORITY CLASSIFICATION TABLE (PRIGROUP = 5)

 Peripheral Target │ Priority Byte │ Preemption Group [7:6] │ Sub-Priority [5:4] │ Preemption Rank
───────────────────┼───────────────┼────────────────────────┼────────────────────┼─────────────────
 Motor IRQ 0       │     0x20      │ Group 0                │ Sub-Priority 2     │ Highest Rank
 SPI Sensor IRQ 1  │     0x30      │ Group 0                │ Sub-Priority 3     │ Second Highest
 UART Port IRQ 2   │     0x40      │ Group 1                │ Sub-Priority 0     │ Third Highest
 SysTick IRQ 3     │     0x80      │ Group 2                │ Sub-Priority 0     │ Lowest Rank
```


#### Step 4: Write Assembly Routine for `AIRCR.PRIGROUP` Unlocking

Here is the production ARM Assembly code to program `SCB->AIRCR.PRIGROUP = 5` using the `0x05FA` VECTKEY unlocking key:

```assembly
/* PRODUCTION ARM ASSEMBLY ROUTINE TO CONFIGURE PRIGROUP = 5 */
.syntax unified
.cpu cortex-m4
.thumb

.equ SCB_AIRCR,       0xE000ED0C        /* Application Interrupt & Reset Control Reg */
.equ VECTKEY_MAGIC,   0x05FA            /* 16-Bit Unlock Key Required by Silicon */

.global System_SetPriorityGrouping
.type SystemClock_Config, %function

.section .text
.thumb_func
System_SetPriorityGrouping:
    push    {r4, r5, lr}

    /* Step 1: Read current SCB->AIRCR register value */
    ldr     r0, =SCB_AIRCR
    ldr     r1, [r0]

    /* Step 2: Clear PRIGROUP bits [10:8] and upper VECTKEY bits [31:16] */
    ldr     r2, =0x00000700             /* Bitmask for PRIGROUP bits [10:8] */
    bic     r1, r1, r2                  /* Clear PRIGROUP bits */
    ldr     r2, =0xFFFF0000             /* Bitmask for upper VECTKEY bits */
    bic     r1, r1, r2                  /* Clear VECTKEY bits */

    /* Step 3: Combine VECTKEY (0x05FA << 16) and PRIGROUP (5 << 8) */
    ldr     r3, =(VECTKEY_MAGIC << 16)  /* 0x05FA0000 */
    orr     r1, r1, r3                  /* Insert Unlock Key */
    orr     r1, r1, #(5 << 8)           /* Insert PRIGROUP = 5 (3'b101) */

    /* Step 4: Write combined value back to SCB->AIRCR */
    str     r1, [r0]

    /* Step 5: Execute Data Synchronization Barrier to enforce write */
    dsb
    isb

    pop     {r4, r5, pc}
.size System_SetPriorityGrouping, .-System_SetPriorityGrouping
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Interrupt Preemption Priority**: The upper $N$ bits of an 8-bit priority register (`IPR_k`) that dictate whether an incoming $IRQ$ has a sufficiently lower numerical priority value than the currently active $ISR$ to pause it mid-execution and stack a new nested exception frame.
* **Priority Grouping (`PRIGROUP`)**: The 3-bit binary control field (`SCB->AIRCR.PRIGROUP`) that dynamically positions the boundary dividing an 8-bit priority register into upper Preemption Priority bits ($P_{\text{bits}} = 7 - \text{PRIGROUP}$) and lower Sub-Priority tie-breaking bits ($S_{\text{bits}} = B_{\text{impl}} - P_{\text{bits}}$).
* **Tail-Chaining vs. Preemption Decision Matrix**: The hardware arbitration logic that executes **Nested Preemption** ($12\text{-cycle}$ entry latency) when an incoming $IRQ$ belongs to a strictly higher preemption group, or **Tail-Chaining** ($6\text{-cycle}$ transition latency) when equal or lower preemption group $IRQs$ arrive, skipping redundant stack popping and pushing.