---
title: "Hardware Fault Exception Handling, Status Register Extraction, and Dummy Vector Fallbacks"
---

# Hardware Fault Exception Handling, Status Register Extraction, and Dummy Vector Fallbacks

## The Un-Clocked Bus Freeze and Un-Handled Exception Lockup

In bare-metal embedded software, a central processing unit (CPU) executes a continuous stream of assembly machine instructions. The processor reads instructions from non-volatile Flash memory (ROM), computes mathematical results in its general-purpose register file, and modifies peripherals by executing load and store instructions targeting Memory-Mapped I/O (MMIO) addresses.

However, during real-world hardware execution, a single incorrect assembly instruction or missing hardware configuration step can violate the physical execution rules of the silicon die:

1. **The Un-Clocked MMIO Access Hazard**: Suppose a software program attempts to write to a General Purpose Input/Output (GPIO) register at address `0x4002_0014` to toggle an LED. However, the software forgot to enable the clock gate for GPIO Port A in the Reset and Clock Control (RCC) peripheral (`RCC_AHB1ENR`). 

When the CPU pipeline executes `str r1, [0x4002_0014]`, the physical bus crossbar routes the write request to the GPIO peripheral. Because the peripheral's clock is turned off, its internal register bus interface is dead. 

The peripheral does **not** respond on the bus. The interconnect crossbar waits for an acknowledgment, times out, and asserts a hardware **Bus Error Signal** back to the CPU pipeline.

```text
THE UN-CLOCKED MMIO BUS ERROR CRASH

 CPU Core Execution Pipeline (Executes: str r1, [0x4002_0014])
 ┌───────────────────────────────────────────────────────────┐
 │ Requests write to GPIO Port A MMIO Register (0x4002_0014) │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ (AHB Interconnect Crossbar Bus)
 GPIO Port A Peripheral (Clock Gate RCC_AHB1ENR = 0 [DISABLED!])
 ┌───────────────────────────────────────────────────────────┐
 │ PERIPHERAL CLOCK IS OFF! Bus Interface Unresponsive!     │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ (Interconnect Bus Timeout!)
 AHB Crossbar asserts Bus Error Signal to CPU!
 (CPU Hardware Pipeline triggers a BusFault Exception!)
```

2. **The Invalid State or Instruction Hazard**: Suppose an assembly program executes an indirect jump instruction (`bx r0`), but bit 0 of register `r0` is accidentally set to $0$ (selecting ARM instruction state instead of 16-bit Thumb state). 

Because compact microcontrollers do not support 32-bit ARM instruction state, the hardware instruction decoder cannot interpret the fetched opcode, triggering a **UsageFault Exception**.

3. **The Un-Aligned Memory Access Hazard**: Suppose the CPU attempts to execute a 32-bit word load (`ldr r0, [r1]`), but register `r1` contains an un-aligned byte address like `0x2000_0001`. On architectures with strict alignment enforcement, the memory bus controller rejects the un-aligned access, triggering an **Alignment UsageFault Exception**.

What happens inside the microchip when one of these hardware faults occurs?

If the bare-metal software firmware has **not** configured dedicated, low-level exception handler routines in its vector table:
* The CPU hardware attempts to fetch the fault handler function pointer from an un-mapped or blank vector table entry (`0x0000_0000`).
* Reading address zero returns garbage or fails, triggering a second fault while trying to process the first fault (**A Double Fault**).
* The CPU enters a physical **Lockup State**: the processor halts instruction fetching entirely, freezes all internal execution, and asserts a hardware lockup signal. 

The microchip becomes a dead piece of silicon, requiring a hard power cycle or external hardware reset to recover!

```text
THE UN-HANDLED FAULT LOCKUP CASCADE

 Hardware Bus Error / Unaligned Access occurs
                       │
                       ▼
 CPU looks up Fault Handler in Vector Table (Offset 0x0000_000C)
 Vector Entry is Blank / Un-programmed (0x0000_0000)
                       │
                       ▼
 CPU attempts to jump to address 0x0000_0000 -> DOUBLE FAULT!
                       │
                       ▼
 HARDWARE LOCKUP STATE ENFORCED! (CPU Clock Frozen! System Unresponsive!)
```

Why should an embedded microchip freeze permanently when a bus error or unaligned access occurs, when we can write low-level assembly **HardFault and BusFault Handlers** that intercept the crash, extract the exact instruction address and memory fault status from diagnostic hardware registers, and safely recover or reset the system?

To prevent CPU lockups and enable deep hardware crash diagnostics, bare-metal architectures employ **HardFault and BusFault Exception Handlers**, **Fault Register Parsing (`CFSR`, `BFAR`, `HFSR`)**, and **Dummy Vector Fallbacks**.


### Policy 1: No Emergency Rescue Plan (Un-Handled Fault Lockup)

The flight company installs no emergency parachutes or diagnostic black boxes:
1. At 10:00 AM, the pilot accidentally steers the jet into an un-mapped, forbidden mountain peak (**An Un-Clocked MMIO Bus Error**).
2. The jet crashes into the mountain. Because there is no emergency team or parachute system, the aircraft is destroyed, and the wreckage sits burning in the forest forever (**CPU Lockup State**).
3. The flight company has **no idea why the jet crashed**: Did the engine stall? Did the pilot faint? Did a wing snap? 

No diagnostic data exists, so every future jet sent on the same route crashes at the exact same location!


### Policy 3: The Catch-All Air Traffic Controller (Dummy Vector Fallback)

What if a rogue radio signal commands the jet to land at an un-assigned, blank airstrip (**An Un-Handled Peripheral Interrupt $IRQ$**)?

Instead of letting the jet fly into empty space, the airport installs a **Catch-All Air Traffic Control Tower (`Default_Handler` / Dummy ISR)**:
* If a radio signal specifies an un-assigned airstrip, the control tower automatically redirects the jet to a safe, designated holding pattern (**An Infinite Trap Loop `b .`**).
* The jet circles safely in the holding pattern until the flight engineer attaches a debug cable to inspect its status!

This jet aircraft system is the exact physical analogue of **Hardware Fault Exception Handling and Diagnostic Register Extraction**:
* The jet pilot is the **CPU Execution Pipeline**.
* Flying through valid airspace is **Executing Valid Machine Code**.
* Striking an un-mapped mountain is an **Un-Clocked MMIO Bus Fault**.
* The cockpit control snapshot is **Hardware Context Stacking ($r0..r3, r12, LR, PC, xPSR$)**.
* The Black Box Recorder is the **System Control Block Fault Registers (`CFSR`, `BFAR`, `HFSR`)**.
* GPS coordinates of the crash are the **BusFault Address Register (`BFAR`)**.
* Component failure codes are the **Configurable Fault Status Register (`CFSR`)**.
* The rescue helicopter team is the **Assembly `HardFault` / `BusFault` Handler**.
* The catch-all air traffic tower is the **`Default_Handler` Dummy Fallback ISR**.


### 1. The Hardware System Control Block (SCB) Fault Register Architecture

On ARM Cortex-M processors, hardware diagnostic data recorded during a fault exception is stored in a dedicated group of Memory-Mapped I/O (MMIO) registers inside the **System Control Block (SCB)**, located starting at physical address `0xE000_ED00`.

```text
SCB FAULT DIAGNOSTIC REGISTER ARRAY (BASE: 0xE000_ED00)

 Memory Offset │ Register Mnemonic  │ Register Name & Width
───────────────┼────────────────────┼───────────────────────────────────────────────────────────
  Offset 0x28  │ SCB->CFSR          │ Configurable Fault Status Register (32 Bits)
               │  * Bits [7:0]      │   - MMFSR (MemManage Fault Status - 8 Bits)
               │  * Bits [15:8]     │   - BFSR  (BusFault Status - 8 Bits)
               │  * Bits [31:16]    │   - UFSR  (UsageFault Status - 16 Bits)
───────────────┼────────────────────┼───────────────────────────────────────────────────────────
  Offset 0x2C  │ SCB->HFSR          │ HardFault Status Register (32 Bits)
  Offset 0x34  │ SCB->MMFAR         │ MemManage Fault Address Register (32 Bits)
  Offset 0x38  │ SCB->BFAR          │ BusFault Address Register (32 Bits)
```


### 3. Precise vs. Imprecise Bus Faults

A critical distinction in hardware fault debugging is the difference between a **Precise Bus Fault** and an **Imprecise Bus Fault**:

```text
PRECISE VS IMPRECISE BUS FAULT EXECUTION TIMING

 Precise Bus Fault (PRECISERR = 1, BFARVALID = 1)
 CPU executes: ldr r0, [0x4002_0000] (Un-clocked MMIO Read)
 Bus Error returned IMMEDIATELY before next instruction executes!
 Result: Stacked PC points EXACTLY to "ldr r0, [0x4002_0000]"! BFAR holds 0x4002_0000!

 Imprecise Bus Fault (IMPRECISERR = 1, BFARVALID = 0)
 CPU executes: str r0, [0x4002_0000] (Buffered MMIO Write)
 Write enters CPU Write Buffer -> CPU continues executing 5 more instructions...
 Bus Error returned 5 instructions LATER!
 Result: Stacked PC points to instruction #6! BFAR is INVALID!
```

#### Why Imprecise Bus Faults Are Hard to Debug:
When a CPU executes a store instruction (`STR`), it places the write address and data into an internal **Write Buffer** so the pipeline can continue executing subsequent instructions without waiting for the slow memory bus.
* If the write fails in the bus crossbar 5 clock cycles later, the CPU has already executed 5 subsequent instructions!
* When the `BusFault` exception fires, the stacked $PC$ points to instruction #6, **NOT** the original `STR` instruction!
* Furthermore, `BFARVALID = 0`, meaning the `BFAR` register does **not** hold the faulting address.

#### The Hardware Fix (`DISDEFWBUF` Bit):
To force all bus faults to be precise during debugging, software can set bit 1 (`DISDEFWBUF`) in the **Auxiliary Control Register (`SCB->ACTLR`)**:

$$\text{Set } \text{SCB->ACTLR.DISDEFWBUF} = 1 \implies \mathbf{\text{Disables Write Buffering (Forces ALL Bus Faults to be PRECISE!)}}$$

When write buffering is disabled, the CPU pipeline pauses on every store instruction until the bus acknowledges completion. If a bus fault occurs, `PRECISERR = 1` and `BFARVALID = 1` are guaranteed, capturing the exact faulting instruction and address!


### 5. Extracting the Faulting Instruction Address ($PC$) from the Stack

Once register `r0` holds the base address of the stacked context frame, the faulting instruction address ($PC$) can be extracted using simple memory offset arithmetic.

The 8-register stacking frame layout in memory is:

```text
STACK FRAME MEMORY OFFSETS FROM BASE ADDRESS (r0)

 Offset Address │ Register Name  │ Functional Meaning in Diagnostic Handler
────────────────┼────────────────┼───────────────────────────────────────────────────────────
   r0 + 0       │ r0             │ Argument / Scratch Register 0 at crash time
   r0 + 4       │ r1             │ Argument / Scratch Register 1 at crash time
   r0 + 8       │ r2             │ Argument / Scratch Register 2 at crash time
   r0 + 12      │ r3             │ Argument / Scratch Register 3 at crash time
   r0 + 16      │ r12            │ Scratch Register r12 at crash time
   r0 + 20      │ LR (r14)       │ Caller Link Register at crash time
   r0 + 24      │ PC (r15)       │ EXACT INSTRUCTION ADDRESS THAT CAUSED THE FAULT!
   r0 + 28      │ xPSR           │ Execution Program Status Register at crash time
```

#### Extracting $PC$ in Assembly:

To read the faulting instruction address $PC$ from the stack frame:

$$\text{Faulting\_PC} = \text{Memory}[r0 + 24]$$

$$\text{Faulting\_LR} = \text{Memory}[r0 + 20]$$

In assembly code:
```assembly
    ldr     r1, [r0, #24]       /* r1 <= Read stacked PC (Faulting Instruction Address!) */
    ldr     r2, [r0, #20]       /* r2 <= Read stacked LR (Caller Return Address!) */
```

The value loaded into `r1` is the **exact physical byte address of the assembly instruction that triggered the crash**!


## Real-World Silicon Failures, Un-Clocked MMIO Crashes, and Lockup States

In commercial embedded systems engineering, diagnosing fault handlers requires navigating hardware edge cases.


### 2. The Double Fault Lockup State

What happens if a `HardFault` occurs, the CPU jumps to `HardFault_Handler`, and **a second fault occurs INSIDE the `HardFault_Handler` itself** (for example, if the stack memory is full and the `HardFault_Handler` attempts to push registers onto a corrupted stack)?

```text
DOUBLE FAULT LOCKUP STATE SEQUENCE

 1. Initial Fault occurs (Bus Error in main code).
 2. CPU attempts to enter HardFault_Handler.
 3. Hardware attempts to push Stack Frame -> STACK IS CORRUPTED!
 4. Second Fault occurs DURING HardFault entry! (DOUBLE FAULT!)
                               │
                               ▼
 HARDWARE LOCKUP STATE ENFORCED!
 (CPU freezes completely, asserts LOCKUP pin, requires hardware reset!)
```

* A fault occurring during fault entry is a **Double Fault**.
* The CPU cannot recover from a double fault. It enters a physical **Lockup State**, halting its clock tree and asserting an external `LOCKUP` output pin.
* The only way to recover from a lockup state is a hardware reset (such as a Watchdog reset or external `NRST` pin pull-down).


### Scenario and Parameters

You are a principal systems software architect writing a production diagnostic `HardFault_Handler` for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ BARE-METAL SERVER MANAGEMENT CONTROLLER HARDFAULT DIAGNOSTIC

 System Control Block (SCB) Base: 0xE000_ED00
 ┌─────────────────────────────────────────────────────────────┐
 │ SCB->CFSR  @ 0xE000_ED28 : Configurable Fault Status Reg   │
 │ SCB->HFSR  @ 0xE000_ED2C : HardFault Status Register       │
 │ SCB->BFAR  @ 0xE000_ED38 : BusFault Address Register       │
 └─────────────────────────────────────────────────────────────┘
  Main Stack Pointer (MSP) Base : 0x2000_3F80 (Stack Frame)
```

#### Hardware Fault State Snapshot at Crash Time:
A hardware crash occurs in production. The CPU enters `HardFault_Handler`.
* Link Register ($LR / r14$) on exception entry contains `EXC_RETURN` $= \mathbf{\text{0xFFFFFFF9}}$ (`32'b1111_1111_1111_1111_1111_1111_1111_1001_2$).
* Main Stack Pointer ($MSP$) $= \mathbf{\text{0x2000\_3F80}}$.
* Process Stack Pointer ($PSP$) $= \text{0x2000\_1000}$.
* Memory contents of the 8-word Stack Frame starting at `0x2000_3F80`:
  * `[0x2000_3F80]` ($r0$) $= \text{0x0000\_0010}$
  * `[0x2000_3F84]` ($r1$) $= \text{0x4002\_0014}$
  * `[0x2000_3F88]` ($r2$) $= \text{0x0000\_0001}$
  * `[0x2000_3F8C]` ($r3$) $= \text{0x0000\_0000}$
  * `[0x2000_3F90]` ($r12$) $= \text{0x0000\_00A5}$
  * `[0x2000_3F94]` ($LR$) $= \text{0x0800\_01A4}$
  * `[0x2000_3F98]` ($PC$) $= \mathbf{\text{0x0800\_02C8}}$ (Stacked Program Counter)
  * `[0x2000_3F9C]` ($xPSR$) $= \text{0x0100\_0000}$
* **SCB Register Memory Readings**:
  * `SCB->CFSR` (`0xE000_ED28`) $= \mathbf{\text{0x0000\_8200}}$ (`32'b0000_0000_0000_0000_1000_0010_0000_0000_2`)
  * `SCB->HFSR` (`0xE000_ED2C`) $= \text{0x4000\_0000}$ (`FORCED = 1`)
  * `SCB->BFAR` (`0xE000_ED38`) $= \mathbf{\text{0x4002\_0014}}$

#### Your Objective

1. Analyze `EXC_RETURN` ($LR = \text{0xFFFFFFF9}$) and prove mathematically whether the stacked context frame resides on the Main Stack Pointer ($MSP$) or Process Stack Pointer ($PSP$).
2. Extract the exact physical memory address of the instruction that caused the crash ($PC$), and the caller's return address ($LR$).
3. Parse the 32-bit `SCB->CFSR` value (`0x0000_8200`) and `SCB->BFAR` value (`0x4002_0014`):
   * Identify which sub-register flags (`UFSR`, `BFSR`, `MMFSR`) are active.
   * Determine whether the fault was a Precise or Imprecise Bus Fault.
   * State the exact physical MMIO memory address that caused the crash.
4. Write the complete, production-ready ARM Assembly `HardFault_Handler` that:
   * Inspects `EXC_RETURN` to select $MSP$ vs $PSP$.
   * Extracts $PC$, $LR$, `CFSR`, and `BFAR` into registers `r0`, `r1`, `r2`, `r3`.
   * Branches to a C/Assembly diagnostic logger function `HardFault_Decoder`.
5. Verify mathematical, structural, and diagnostic correctness.


#### Step 2: Extract Faulting $PC$ and Return $LR$ from Stack Frame

The stack frame base address is $MSP = \text{0x2000\_3F80}$.

We apply the Stack Frame Offset Map:
* $r0 = \text{Memory}[0x2000\_3F80 + 0] = \text{0x0000\_0010}$
* $r1 = \text{Memory}[0x2000\_3F80 + 4] = \text{0x4002\_0014}$
* $r2 = \text{Memory}[0x2000\_3F80 + 8] = \text{0x0000\_0001}$
* $r3 = \text{Memory}[0x2000\_3F80 + 12] = \text{0x0000\_0000}$
* $r12 = \text{Memory}[0x2000\_3F80 + 16] = \text{0x0000\_00A5}$
* $LR_{\text{caller}} = \text{Memory}[0x2000\_3F80 + 20] = \mathbf{\text{0x0800\_01A4}}$
* $PC_{\text{faulting}} = \text{Memory}[0x2000\_3F80 + 24] = \mathbf{\text{0x0800\_02C8}}$

##### Extracted Register Values:
* **Faulting Instruction Address ($PC$)**: **`0x0800_02C8`** (The instruction at Flash address `0x0800_02C8` caused the crash!).
* **Caller Return Address ($LR$)**: **`0x0800_01A4`**.


#### Step 4: Write Complete Assembly `HardFault_Handler` Routine

Here is the complete, production-ready ARM Assembly `HardFault_Handler` that extracts stacked registers, reads SCB fault registers, and branches to a diagnostic handler:

```assembly
/* PRODUCTION BARE-METAL HARDFAULT HANDLER IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* System Control Block (SCB) Register Offsets */
.equ SCB_CFSR,         0xE000ED28        /* Configurable Fault Status Register */
.equ SCB_HFSR,         0xE000ED2C        /* HardFault Status Register */
.equ SCB_BFAR,         0xE000ED38        /* BusFault Address Register */

.global HardFault_Handler
.type HardFault_Handler, %function

.section .text
.thumb_func
HardFault_Handler:
    /* Step 1: Determine whether MSP or PSP was active at crash time */
    tst     lr, #4                      /* Test Bit 2 of EXC_RETURN (LR) */
    ite     eq
    mrseq   r0, msp                     /* If Bit 2 == 0, r0 <= MSP (0x2000_3F80) */
    mrsne   r0, psp                     /* If Bit 2 == 1, r0 <= PSP */

    /* r0 now points to the base of the 8-word Stack Frame */

    /* Step 2: Extract Faulting PC and LR from Stack Frame */
    ldr     r1, [r0, #24]               /* r1 <= Stacked PC (Faulting Instruction Addr) */
    ldr     r2, [r0, #20]               /* r2 <= Stacked LR (Caller Return Addr) */

    /* Step 3: Read SCB Diagnostic Registers (CFSR and BFAR) */
    ldr     r3, =SCB_CFSR
    ldr     r3, [r3]                    /* r3 <= Read SCB->CFSR Status Register Value */

    ldr     r4, =SCB_BFAR
    ldr     r4, [r4]                    /* r4 <= Read SCB->BFAR Fault Address Value */

    /* Step 4: Branch to C/Assembly Diagnostic Decoder (r0=Stack, r1=PC, r2=LR, r3=CFSR, r4=BFAR) */
    bl      HardFault_Decoder

    /* Trap loop if decoder returns */
    b       .
.size HardFault_Handler, .-HardFault_Handler
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **`HardFault` / `BusFault` Handler**: Low-level assembly exception routines that capture hardware execution errors (un-clocked MMIO accesses, unaligned memory operations, illegal states), preventing un-handled CPU lockup states and enabling system recovery.
* **`CFSR` / `BFAR` Fault Register Extraction**: The hardware diagnostic process of reading the Configurable Fault Status Register (`CFSR`), BusFault Address Register (`BFAR`), and stacked register frame ($PC, LR, r0..r3$) from SCB memory space to pinpoint the exact assembly instruction and physical memory address that caused a crash.
* **Dummy ISR Fallback (`Default_Handler`)**: A weak-aliased catch-all assembly routine mapped across all un-assigned vector table entries to safely trap spurious or un-handled hardware interrupts, preventing the CPU from jumping into un-mapped memory.