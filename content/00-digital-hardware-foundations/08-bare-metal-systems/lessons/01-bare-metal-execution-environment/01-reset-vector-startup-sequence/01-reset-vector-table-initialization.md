content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/01-bare-metal-execution-environment/01-reset-vector-startup-sequence/01-reset-vector-table-initialization.md
# The Power-On Vacuum and Hardware Vector Table Bootstrapping

## The Silicon Amnesia Crisis at Power-On Reset

Imagine applying electrical power to a bare-metal microchip. As the supply voltage ($V_{DD}$) ramps up from $0.0\text{ Volts}$ to its operating threshold of $3.3\text{ Volts}$, billions of microscopic transistors inside the central processing unit (CPU) transition from an inert, unpowered state into an active electrical state. 

During these first few nanoseconds, the internal flip-flops, general-purpose registers, and execution pipelines contain un-initialized, random electrical charges. The registers that hold the current program instruction address—the **Program Counter ($PC$)**—and the active stack memory address—the **Stack Pointer ($SP$)**—contain unpredictable garbage values.

```text
SILICON STATE AT THE EXACT INSTANT OF POWER-ON RESET

 Voltage V_DD : 0.0V ──► 3.3V (Power Rail Stabilizes)
                        │
                        ▼
 Internal CPU Registers (Un-initialized Transistor State):
 ┌───────────────────────────────────────────────────────────┐
 │ Program Counter (PC)    : 0x????_???? (Random Garbage!)   │
 │ Stack Pointer (SP)      : 0x????_???? (Random Garbage!)   │
 │ Register File (r0..r12) : 0x????_???? (Random Garbage!)   │
 └───────────────────────────────────────────────────────────┘
 (The CPU execution pipeline cannot run code without valid memory targets!)
```

How does a cold, silicon processor—devoid of an operating system, lacking a software loader, and completely unaware of where its instructions reside in physical memory—begin executing code safely on its very first clock cycle?

If the CPU blindly attempted to fetch its first instruction from a random memory address, one of three catastrophic hardware failures would occur immediately:

1. **Bus Fault Execution Crash**: The Program Counter ($PC$) might point to an un-mapped or non-existent physical memory location. The memory interconnect crossbar rejects the fetch request, triggering an immediate, un-recoverable hardware fault.
2. **Stack Memory Corruption**: If an early instruction or hardware interrupt attempts to push data onto the stack before the Stack Pointer ($SP$) is configured, the CPU writes data to a random memory address, overwriting critical peripheral control registers or corrupting internal system state.
3. **Execution Mode Failure**: On architectures that support multiple instruction set execution modes (such as 32-bit ARM mode versus 16-bit Thumb mode), fetching an instruction without configuring the execution mode control register causes the hardware instruction decoder to misinterpret the binary opcodes, executing garbage instructions.

A digital processor cannot guess where its code or stack memory resides in physical space!

To execute symbolic software code deterministically after a power-on or hard reset event, the CPU hardware requires a strict, pre-defined memory contract established at a fixed physical location in memory: **The Hardware Reset Vector Table**.

---

## The Nightstand Index Cards: A Mental Model for Vector Bootstrapping

To build a crystal-clear mental model of hardware vector table initialization before inspecting transistor-level state machines and bitwise memory maps, let us consider an everyday analogy: **Waking Up in a Pitch-Black Room**.

Imagine you wake up in the middle of the night in a completely pitch-black room (**Silicon Power-On Reset**). You have temporary amnesia:
* You do not know where your feet should stand (**The Initial Stack Pointer — $SP$**).
* You do not know where the light switch is located (**The Reset Handler / Program Counter — $PC$**).

```text
THE AMNESIAC IN THE DARK ROOM METAPHOR

 Pitch-Black Room (Power-On Silicon)
 ┌───────────────────────────────────────────────────────────┐
 │ You do not know where your feet stand (Stack Pointer).    │
 │ You do not know where the light switch is (Program Counter)│
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
 HARDWIRED NIGHTSTAND AT ADDRESS 0x0000_0000
 ┌───────────────────────────────────────────────────────────┐
 │ Index Card #0 : "Place your feet at solid floor spot #A"  │
 │ Index Card #1 : "Walk 5 steps forward to light switch #B" │
 └───────────────────────────────────────────────────────────┘
```

If you start running around in the dark without checking your surroundings, you will trip over a chair and injure yourself (**A Hardware Bus Fault Crash**).

However, the architect who built the room established a hardwired, non-negotiable rule: **Directly adjacent to the bed, at physical offset zero (`Address 0x0000_0000`), sits a small nightstand containing two index cards written in large, embossed letters**.

1. **Index Card #0 (Word 0 at Address `0x0000_0000`)**:
   Reads: *"Place your feet firmly on the solid floor at Location $A$."* 
   This tells you exactly where the solid ground is located so you can stand up safely (**Initial Stack Pointer $SP$**).
2. **Index Card #1 (Word 1 at Address `0x0000_0004`)**:
   Reads: *"Walk directly to Location $B$ to flip the light switch."* 
   This tells you the exact coordinates of the light switch so you can turn on the lights and begin your day (**Reset Handler Address / Initial $PC$**).

Because you know the nightstand is *always* located at offset zero, you do not need to guess! 

On the very first second after waking up:
1. You reach out your hand to offset zero.
2. You read Card #0 and place your feet at Location $A$.
3. You read Card #1 and walk directly to Location $B$.

You are now standing safely with the lights on (**Execution Cycle Active**), ready to perform complex tasks!

This nightstand index card system is the exact physical analogue of **The Hardware Reset Vector Table**:
* The pitch-black room is the **Un-initialized Silicon Die**.
* The nightstand at offset zero is the **Reset Vector Table Base Address (`0x0000_0000`)**.
* Index Card #0 is **Word 0 (Initial Stack Pointer $SP$)**.
* Index Card #1 is **Word 1 (Reset Handler Address / Initial $PC$)**.
* Placing your feet at Location $A$ is **Loading the Top-of-RAM Address into Register `sp`**.
* Walking to Location $B$ is **Loading the Entry Point Address into Register `pc`**.

---

## Deep Mechanics of the Hardware Reset Vector Table

Now that we possess an intuitive mental model of the nightstand index cards, let us examine the formal, rigorous engineering mechanics of **Hardware Reset Vector Table Initialization**.

A **Reset Vector Table** is a contiguous array of 32-bit (4-byte) physical memory addresses located at the absolute base of the CPU's execution memory map (typically physical address `0x0000_0000` or an aliased boot memory region).

```text
32-BIT MEMORY MAP OF THE RESET VECTOR TABLE BASE REGION

 Physical Address │ Vector Table Entry Content         │ Hardware Function
──────────────────┼────────────────────────────────────┼─────────────────────────────────
  0x0000_0000     │ Initial Stack Pointer Value (SP)   │ Loaded into SP (r13) on Clock 1
  0x0000_0004     │ Reset Handler Address (PC + Thumb) │ Loaded into PC (r15) on Clock 2
  0x0000_0008     │ NMI Handler Address                │ Non-Maskable Interrupt Vector
  0x0000_000C     │ HardFault Handler Address          │ Hardware Fault Vector
  0x0000_0010     │ MemManage Fault Handler Address    │ MPU Protection Fault Vector
  0x0000_0014     │ BusFault Handler Address           │ Bus Error Fault Vector
  0x0000_0018     │ UsageFault Handler Address         │ Undefined Instruction Vector
```

When a Power-On Reset (POR) signal de-asserts, the CPU's internal reset state machine executes an automated, 2-stage hardware fetch sequence **before executing any software instructions**:

```text
HARDWARE BOOTSTRAPPING STATE MACHINE FLOW

 Power-On Reset De-asserted (POR = 0)
                 │
                 ▼
 Clock Cycle 1: Fetch 32-bit Word from Address 0x0000_0000
                Drive data onto Internal Bus -> Load into SP (r13)
                 │
                 ▼
 Clock Cycle 2: Fetch 32-bit Word from Address 0x0000_0004
                Drive data onto Internal Bus -> Extract LSB -> Load into PC (r15)
                 │
                 ▼
 Clock Cycle 3: Fetch First Instruction from Address in PC
                Begin Pipeline Execution! (Reset_Handler starts!)
```

---

### Word 0: The Initial Stack Pointer ($SP$) and the Full-Descending Stack Contract

The very first 32-bit word in the vector table (located at physical address `0x0000_0000`) contains the **Initial Stack Pointer ($SP$) value**.

Why does the hardware load the Stack Pointer *before* it loads the Program Counter?

In bare-metal embedded execution, hardware exceptions or nested interrupts can occur at any physical microsecond—even during the very first instruction of the startup routine! 

If an exception occurs while the Stack Pointer contains garbage:
* The CPU cannot push the interrupted execution context ($PC, LR, PSR, r0..r3$) onto the stack.
* The CPU suffers a nested, catastrophic hardware crash known as a **Lockup State**.

By forcing the hardware to load $SP$ from Word 0 on clock cycle 1, the CPU guarantees that a valid, safe stack memory space exists **before a single line of software code is fetched or executed**!

#### The Descending Stack Memory Mapping Invariant

In standard computer architectures (such as ARM Cortex-M and RISC-V), stack memory operates under a **Full-Descending Stack Contract**:
* The stack grows **downward** in memory from high physical addresses toward low physical addresses.
* When data is pushed onto the stack, the Stack Pointer is decremented *first*, and then the data is written to the new address:

$$SP_{\text{new}} = SP_{\text{old}} - 4$$

$$\text{Memory}[SP_{\text{new}}] \Leftarrow \text{Data}$$

```text
FULL-DESCENDING STACK MEMORY LAYOUT IN RAM

 Physical RAM Memory
 High Address ──► ┌─────────────────────────────────┐ ◄── Initial SP (Word 0 Value: 0x2000_4000)
                  │ [ Unused / Stack Allocation ]   │
                  ├─────────────────────────────────┤ ◄── PUSH 1: SP decrements first (0x2000_3FC)
                  │ Stored Context / Pushed Register│
                  ├─────────────────────────────────┤ ◄── PUSH 2: SP decrements again (0x2000_3F8)
                  │ Stored Context / Pushed Register│
                  ├─────────────────────────────────┤
                  │     ░░░ Free Stack Space ░░░    │
                  │              │                  │
                  │              ▼ Grows Downward   │
 Low Address  ──► └─────────────────────────────────┘ ◄── RAM Start Address (0x2000_0000)
```

#### Calculating the Initial Stack Pointer Value

Because the stack grows downward, the initial value stored in Word 0 of the vector table must point to the **absolute top boundary of physical RAM memory** (one byte past the highest valid RAM address):

$$SP_{\text{initial}} = \text{RAM}_{\text{start\_address}} + \text{RAM}_{\text{total\_bytes}}$$

For a microcontroller with $16\text{ Kilobytes}$ ($16,384\text{ bytes}$) of internal SRAM starting at physical address `0x2000_0000`:

$$\text{RAM}_{\text{start\_address}} = \text{0x2000\_0000}$$

$$\text{RAM}_{\text{total\_bytes}} = 16 \times 1,024 = 16,384 \text{ Bytes} = \text{0x0000\_4000}$$

$$SP_{\text{initial}} = \text{0x2000\_0000} + \text{0x0000\_4000} = \mathbf{\text{0x2000\_4000}}$$

Look closely at the value `0x2000_4000`: 
* The highest accessible 32-bit word in RAM resides at address `0x2000_3FC` (spanning bytes `0x2000_3FC` through `0x2000_3FF`).
* Address `0x2000_4000` is one byte past the top of RAM!
* When the CPU performs its very first `PUSH` operation, $SP$ decrements *first* by 4 bytes ($0x2000\_4000 - 4 = \mathbf{0x2000\_3FC}$), placing the pushed data perfectly inside the top valid 32-bit word of physical RAM!

---

### Word 1: The Program Counter ($PC$) and the LSB Execution Mode Bit

The second 32-bit word in the vector table (located at physical address `0x0000_0004`) contains the physical memory address of the **Reset Handler** routine—the entry point of the bare-metal assembly startup code.

On clock cycle 2, the CPU hardware reads Word 1 and transfers its value into the **Program Counter ($PC$ / $r15$)**.

#### The LSB Execution Mode Bit (Thumb Bit Mechanics)

On ARM processors (such as ARM Cortex-M architecture), the instruction decoder operates exclusively in 16-bit/32-bit **Thumb Instruction State**.

To inform the CPU hardware that the target function executes in Thumb instruction mode, **bit 0 (the Least Significant Bit / LSB) of the target address MUST be set to $1$**!

```text
ARM THUMB-BIT ADDRESS MASKING MECHANICS

 Stored Vector Table Word 1 Value : 0x0800_01C1  (LSB = 1 -> Thumb Mode Flag!)
                                     │
                                     ├─► Bit 0 = 1 ──► Sets Execution State Register (EPSR.T = 1)
                                     │
                                     └─► Bits [31:1] ──► Masked Address Loaded into PC: 0x0800_01C0
```

When the CPU hardware loads Word 1 into $PC$:
1. The hardware inspects bit 0 of the fetched 32-bit value.
2. If bit 0 is $1$, the hardware sets the **Thumb State Bit ($T$-bit)** inside the Execution Program Status Register ($EPSR.T \Leftarrow 1$).
3. The hardware clears bit 0 ($\text{Address} \ \ \& \ \ \sim 1$) to align the address to a 2-byte boundary and loads the result into $PC$:

$$PC \Leftarrow \text{Word}_1 \ \ \& \ \ \text{0xFFFF\_FFFE}$$

$$EPSR.T \Leftarrow \text{Word}_1 \ \ \& \ \ 1$$

If a programmer accidentally stores an even address in Word 1 (e.g., `0x0800_01C0` with LSB $= 0$):
* $EPSR.T$ is set to $0$ (ARM Mode).
* Cortex-M processors do **not** support 32-bit ARM Mode execution!
* On the very first clock cycle, the instruction decoder detects an invalid execution state and triggers an immediate **HardFault Exception**, halting the chip before a single instruction executes!

---

### The AAPCS 8-Byte Stack Alignment Invariant

A fundamental architectural requirement in modern embedded execution is **The AAPCS 8-Byte Stack Alignment Invariant**.

According to the **ARM Architecture Procedure Call Standard (AAPCS)**, the Stack Pointer ($SP$) must remain aligned to an exact **8-byte (double-word) boundary** at all public function call boundaries and exception entries:

$$\mathbf{SP_{\text{initial}} \pmod 8 == 0} \quad \iff \quad \mathbf{(SP_{\text{initial}} \ \ \& \ \ 7) == 0}$$

```text
8-BYTE ALIGNED VS. MISALIGNED STACK POINTER BOUNDARIES

 8-Byte Aligned Initial SP (0x2000_4000) — LEGAL AAPCS BOUNDARY
 Address 0x2000_4000 : 0x2000_4000 & 7 = 000_2  <-- PASSED! Perfect Double-Word Alignment!

 Misaligned Initial SP (0x2000_4004) — ILLEGAL AAPCS BOUNDARY
 Address 0x2000_4004 : 0x2000_4004 & 7 = 100_2  <-- FAILED! Only 4-byte aligned!
```

#### Why 8-Byte Stack Alignment is Mandatory in Hardware

1. **64-Bit Double-Word Memory Instructions**: High-performance CPU execution units utilize 64-bit double-word load and store instructions (`LDRD` and `STRD` in ARM Assembly, or hardware floating-point register pushes `VSTM`). These instructions require 8-byte aligned memory addresses. If $SP$ is aligned to only 4 bytes (e.g., `0x2000_4004`), executing `STRD` triggers a hardware **Alignment Fault Exception**!
2. **Hardware Interruption Context Stacking**: When a hardware interrupt fires, the CPU automatically pushes 8 words ($32\text{ bytes}$) of context ($r0..r3, r12, LR, PC, xPSR$) onto the stack in hardware. If the stack is not 8-byte aligned, the automatic hardware stacking mechanism introduces extra alignment stall cycles or corrupts floating-point register states.

---

## Real-World Silicon Failures, Misalignments, and Vector Crashes

In commercial embedded systems engineering, failing to configure the reset vector table properly is one of the most common causes of un-bootable silicon. Let us examine three critical physical failure modes encountered in real-world microcontrollers.

---

### 1. The Off-By-Four Stack Allocation Crash

Consider a junior hardware engineer configuring the initial Stack Pointer for a chip with RAM spanning `0x2000_0000` to `0x2000_3FFF` ($16,384\text{ bytes}$).

The engineer calculates the highest addressable RAM word as `0x2000_3FC` and incorrectly writes `0x2000_3FC` into Word 0 of the vector table instead of `0x2000_4000`.

```text
OFF-BY-FOUR STACK ALLOCATION FAILURE

 Initial SP set to 0x2000_3FC (Highest valid word address)
                      │
                      ▼ CPU performs FIRST PUSH (Context Save / Function Call)
 Full-Descending Rule : SP decrements FIRST by 4 bytes!
 New SP = 0x2000_3FC - 4 = 0x2000_3F8
                      │
                      ▼
 RESULT: The top 4 bytes of RAM (0x2000_3FC .. 0x2000_3FF) ARE NEVER USED!
 (4 bytes of physical RAM wasted permanently! Potential 8-byte misalignment!)
```

* Because $SP$ decrements *before* writing data, setting initial $SP = \text{0x2000\_3FC}$ causes the first `PUSH` operation to write to `0x2000_3F8`.
* Bytes `0x2000_3FC` through `0x2000_3FF` become completely inaccessible to the stack, wasting physical RAM.
* Furthermore, `0x2000_3FC` is **not 8-byte aligned** ($0x2000\_3FC \pmod 8 = 4 \neq 0$), violating AAPCS invariants!

---

### 2. The Missing LSB Thumb Bit HardFault

A developer writes a custom assembly startup file for an ARM Cortex-M processor. They define the entry point function `Reset_Handler` at memory address `0x0800_0200`.

In their assembly vector table file, they manually hardcode the address value:

```assembly
/* INCORRECT VECTOR TABLE DEFINITION (CAUSES HARDFAULT!) */
.section .isr_vector, "a"
.word 0x20004000        /* Word 0: Initial Stack Pointer */
.word 0x08000200        /* Word 1: Reset Handler Address (LSB = 0 -> ERROR!) */
```

Trace the hardware failure when power is applied:
1. Clock Cycle 1: $SP \Leftarrow \text{0x2000\_4000}$ (Success).
2. Clock Cycle 2: $PC \Leftarrow \text{0x0800\_0200}$. Bit 0 is $0$.
3. The hardware sets $EPSR.T \Leftarrow 0$ (ARM State).
4. Clock Cycle 3: The Cortex-M instruction decoder attempts to decode the first instruction at `0x0800_0200` in ARM state.
5. **HARDFAULT!** Cortex-M hardware does not support ARM state. The processor locks up before executing a single line of assembly code.

#### The Assembly Fix (`.thumb_func` / Symbolic Labels):
When using symbolic labels in assembly, the assembler automatically sets bit 0 if the function is declared with the `.thumb_func` directive:

```assembly
/* CORRECTED ASSEMBLY VECTOR TABLE DEFINITION */
.syntax unified
.cpu cortex-m4
.thumb

.section .isr_vector, "a"
.word _stack_top        /* Word 0: Symbol provided by Linker Script */
.word Reset_Handler     /* Word 1: Assembler sets LSB = 1 automatically! */

.section .text
.type Reset_Handler, %function
.thumb_func
Reset_Handler:
    /* First valid instruction executes cleanly! */
    cpsid i             /* Disable interrupts during startup */
    b .                 /* Infinite loop */
```

---

### 3. Memory Remapping at Address `0x0000_0000`

In modern System-on-Chip (SoC) architectures, physical non-volatile Flash memory (ROM) is mapped at a high memory address (e.g., `0x0800_0000`), while internal SRAM is mapped at `0x2000_0000`.

Why does the CPU fetch its vector table from physical address `0x0000_0000` if Flash is located at `0x0800_0000`?

SoC designers incorporate a **Memory Remapping Hardware Multiplexer (BOOT0 / BOOT1 Pin Configuration)**:

```text
MEMORY REMAPPING AT ADDRESS 0x0000_0000

 BOOT0 Pin = 0 (Normal Flash Boot)
 [ Address 0x0000_0000 ] ──► [ Memory MUX ] ──► Aliased to Flash (0x0800_0000)

 BOOT0 Pin = 1 (System Bootloader Boot)
 [ Address 0x0000_0000 ] ──► [ Memory MUX ] ──► Aliased to System ROM (0x1FFF_0000)
```

* **Flash Boot Mode (`BOOT0 = 0`)**: The hardware remapping MUX mirrors physical address range `0x0800_0000`..`0x0800_00FF` onto address range `0x0000_0000`..`0x0000_00FF`. When the CPU fetches from `0x0000_0000`, it is reading the first words of Flash memory transparently!
* **System Memory Boot Mode (`BOOT0 = 1`)**: The MUX mirrors internal factory System ROM (containing a vendor bootloader) onto `0x0000_0000`, allowing the chip to execute UART/USB recovery bootloaders.

---

## Solved Industrial Engineering Exercise: Quantitative Reset Vector Table Calculation and Alignment Verification

To consolidate your complete mastery of hardware vector table initialization, memory layout calculations, bitwise Thumb-bit masking, AAPCS 8-byte stack alignment invariants, and clock cycle execution traces, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior bare-metal systems engineer writing a production assembly startup module and linker configuration for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GHz BARE-METAL SERVER MANAGEMENT CONTROLLER

 Memory Map Configuration:
 ┌─────────────────────────────────────────────────────────────┐
 │ Flash Memory (ROM) : 64 KB (0x0800_0000 to 0x0800_FFFF)     │
 │ Internal SRAM (RAM): 16 KB (0x2000_0000 to 0x2000_3FFF)     │
 └─────────────────────────────────────────────────────────────┘
  Assembly Entry Point : Reset_Handler @ 0x0800_02A4
```

#### Memory Map Specifications:
* **Flash Memory (ROM)**: Total Capacity $= 64\text{ Kilobytes}$ ($65,536\text{ bytes}$), physical base address = `0x0800_0000`.
* **Internal SRAM (RAM)**: Total Capacity $= 16\text{ Kilobytes}$ ($16,384\text{ bytes}$), physical base address = `0x2000_0000`.
* **Reset Handler Function (`Reset_Handler`)**: Located by the compiler at Flash byte address `0x0800_02A4`.
* **NMI Handler Function (`NMI_Handler`)**: Located at Flash byte address `0x0800_0310`.
* **HardFault Handler Function (`HardFault_Handler`)**: Located at Flash byte address `0x0800_0380`.

#### Your Objective

1. Calculate the exact 32-bit hexadecimal value that MUST be stored in **Word 0 (`0x0000_0000`)** of the vector table to initialize the Stack Pointer ($SP$) to the top of physical RAM.
2. Prove mathematically that your calculated $SP_{\text{initial}}$ value satisfies the **AAPCS 8-Byte Stack Alignment Invariant**.
3. Calculate the exact 32-bit hexadecimal values that MUST be stored in **Word 1 (`0x0000_0004`)**, **Word 2 (`0x0000_0008`)**, and **Word 3 (`0x0000_000C`)** of the vector table, applying Thumb-bit LSB encoding.
4. Construct the complete 16-byte raw memory byte layout (in Little-Endian format) representing the first 4 words of Flash memory starting at `0x0800_0000`.
5. Trace the step-by-step CPU execution pipeline state ($SP, PC, EPSR.T, \text{Address Bus}$) across the first 4 clock cycles ($t = 0.0\text{ ns}$ to $t = 1.25\text{ ns}$) after reset release.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Initial Stack Pointer ($SP_{\text{initial}}$) Value (Word 0)

The internal SRAM spans from `0x2000_0000` with a size of $16\text{ KB}$ ($16,384\text{ bytes}$).

$$\text{RAM}_{\text{start\_address}} = \text{0x2000\_0000}$$

$$\text{RAM}_{\text{size\_bytes}} = 16 \times 1,024 = 16,384 \text{ Bytes} = \text{0x0000\_4000}$$

$$\text{SP}_{\text{initial}} = \text{RAM}_{\text{start\_address}} + \text{RAM}_{\text{size\_bytes}}$$

$$\text{SP}_{\text{initial}} = \text{0x2000\_0000} + \text{0x0000\_4000} = \mathbf{\text{0x2000\_4000}}$$

##### Word 0 Value:
$$\mathbf{\text{Word 0 (Address 0x0000\_0000)} = \text{0x2000\_4000}}$$

---

#### Step 2: Verify AAPCS 8-Byte Stack Alignment Invariant

To verify AAPCS 8-byte alignment, we evaluate $\text{SP}_{\text{initial}} \pmod 8$:

$$\text{SP}_{\text{initial}} = \text{0x2000\_4000} = 536,887,296_{10}$$

$$\frac{536,887,296}{8} = 67,110,912.0 \quad (\mathbf{\text{Exact Integer! Remainder = 0}})$$

Bitwise verification (checking lowest 3 bits):

$$\text{0x2000\_4000} \ \ \& \ \ 7 = \text{0000\_0000_2} \ \ \& \ \ 0000\_0111_2 = \mathbf{000_2}$$

$$\mathbf{\text{AAPCS Alignment Check: } \text{0x2000\_4000} \ \ \& \ \ 7 == 0 \quad (\text{ALIGNMENT INVARIANT PASSED!})}$$

The initial Stack Pointer is $100\%$ compliant with double-word 8-byte alignment rules.

---

#### Step 3: Calculate Vector Table Entry Values for Words 1, 2, and 3

Each entry address in the ARM Cortex-M vector table MUST have its Least Significant Bit (LSB / Bit 0) set to $1$ to encode Thumb state execution ($EPSR.T = 1$).

##### 1. Word 1 (Reset Handler at `0x0800_02A4`):
$$\text{Word 1 Value} = \text{0x0800\_02A4} \mid 1 = \mathbf{\text{0x0800\_02A5}}$$

##### 2. Word 2 (NMI Handler at `0x0800_0310`):
$$\text{Word 2 Value} = \text{0x0800\_0310} \mid 1 = \mathbf{\text{0x0800\_0311}}$$

##### 3. Word 3 (HardFault Handler at `0x0800_0380`):
$$\text{Word 3 Value} = \text{0x0800\_0380} \mid 1 = \mathbf{\text{0x0800\_0381}}$$

```text
VECTOR TABLE WORD VALUES SUMMARY

 Vector Offset │ Vector Target Name │ Raw Physical Addr │ Encoded Vector Word (LSB=1)
───────────────┼────────────────────┼───────────────────┼──────────────────────────────
  0x0000_0000  │ Initial SP         │ 0x2000_4000       │ 0x2000_4000 (Stack Top)
  0x0000_0004  │ Reset_Handler      │ 0x0800_02A4       │ 0x0800_02A5 (Thumb Encoded)
  0x0000_0008  │ NMI_Handler        │ 0x0800_0310       │ 0x0800_0311 (Thumb Encoded)
  0x0000_000C  │ HardFault_Handler  │ 0x0800_0380       │ 0x0800_0381 (Thumb Encoded)
```

---

#### Step 4: Construct Raw Memory Byte Map (Little-Endian Format)

In Little-Endian byte ordering (standard for ARM and x86 architectures), the least significant byte of a 32-bit word is stored at the lowest physical memory byte address:

$$\text{32-bit Word: } \text{0xHH\_MM\_LL\_ZZ} \implies \text{Byte 0: 0xZZ}, \ \text{Byte 1: 0xLL}, \ \text{Byte 2: 0xMM}, \ \text{Byte 3: 0xHH}$$

##### Byte Decomposition:
* **Word 0 (`0x2000_4000`)**: `0x00, 0x40, 0x00, 0x20`
* **Word 1 (`0x0800_02A5`)**: `0xA5, 0x02, 0x00, 0x08`
* **Word 2 (`0x0800_0311`)**: `0x11, 0x03, 0x00, 0x08`
* **Word 3 (`0x0800_0381`)**: `0x81, 0x03, 0x00, 0x08`

```text
16-BYTE RAW LITTLE-ENDIAN MEMORY MAP AT FLASH BASE (0x0800_0000)

 Byte Address │ Hex Byte │ Target Word Membership
──────────────┼──────────┼───────────────────────────────────────────────────
  0x0800_0000 │   0x00   │ ┐
  0x0800_0001 │   0x40   │ │ Word 0: Initial Stack Pointer (0x2000_4000)
  0x0800_0002 │   0x00   │ │
  0x0800_0003 │   0x20   │ ┘
──────────────┼──────────┼───────────────────────────────────────────────────
  0x0800_0004 │   0xA5   │ ┐
  0x0800_0005 │   0x02   │ │ Word 1: Reset_Handler Address (0x0800_02A5)
  0x0800_0006 │   0x00   │ │
  0x0800_0007 │   0x08   │ ┘
──────────────┼──────────┼───────────────────────────────────────────────────
  0x0800_0008 │   0x11   │ ┐
  0x0800_0009 │   0x03   │ │ Word 2: NMI_Handler Address (0x0800_0311)
  0x0800_000A │   0x00   │ │
  0x0800_000B │   0x08   │ ┘
──────────────┼──────────┼───────────────────────────────────────────────────
  0x0800_000C │   0x81   │ ┐
  0x0800_000D │   0x03   │ │ Word 3: HardFault_Handler Address (0x0800_0381)
  0x0800_000E │   0x00   │ │
  0x0800_000F │   0x08   │ ┘
```

---

#### Step 5: CPU Clock Cycle Execution Trace Post-Reset

Operating at $f_{\text{clk}} = 3.2\text{ GHz}$, one clock cycle period is:

$$T_{\text{clk}} = \frac{1}{3.2 \times 10^9 \text{ Hz}} = 0.3125 \times 10^{-9} \text{ s} = \mathbf{0.3125 \text{ nanoseconds}} \quad (312.5\text{ ps})$$

Let us trace the physical hardware signals across the first 4 clock cycles:

##### 1. Clock Cycle 1 ($t = 0.0000\text{ ns}$ to $t = 0.3125\text{ ns}$):
* **Hardware Event**: Power-On Reset (POR) de-asserts. The internal reset state machine drives address `0x0000_0000` onto the internal memory bus.
* **Bus Response**: Memory returns Word 0 (`0x2000_4000`).
* **Register Update**: Stack Pointer register $SP (r13) \Leftarrow \mathbf{\text{0x2000\_4000}}$.

##### 2. Clock Cycle 2 ($t = 0.3125\text{ ns}$ to $t = 0.6250\text{ ns}$):
* **Hardware Event**: State machine drives address `0x0000_0004` onto the memory bus.
* **Bus Response**: Memory returns Word 1 (`0x0800_02A5`).
* **Register & Flag Update**:
  * LSB Inspection: Bit 0 of `0x0800_02A5` is $1 \implies EPSR.T \Leftarrow \mathbf{1}$ (Thumb State Confirmed!).
  * Address Masking: $\text{0x0800\_02A5} \ \ \& \ \ \sim 1 = \text{0x0800\_02A4}$.
  * Program Counter register $PC (r15) \Leftarrow \mathbf{\text{0x0800\_02A4}}$.

##### 3. Clock Cycle 3 ($t = 0.6250\text{ ns}$ to $t = 0.9375\text{ ns}$):
* **Hardware Event**: The CPU instruction fetch unit drives address `0x0800_02A4` onto the memory bus to fetch the first actual software instruction of `Reset_Handler`.
* **Bus Response**: Flash memory returns the 16-bit opcode for `cpsid i` (`0xB672` — Disable Interrupts).
* **Pipeline Action**: Instruction enters the IF/ID pipeline stage.

##### 4. Clock Cycle 4 ($t = 0.9375\text{ ns}$ to $t = 1.2500\text{ ns}$):
* **Hardware Event**: The CPU executes `cpsid i` at address `0x0800_02A4`. $PC$ increments to `0x0800_02A6`.
* **System State**: The bare-metal assembly startup routine is now actively executing!

```text
CPU BOOTSTRAPPING CLOCK CYCLE EXECUTION TRACE

 Time (ns)  │ Clock │ Bus Address Bus │ Fetched Data  │ Register State Updates
────────────┼───────┼─────────────────┼───────────────┼─────────────────────────────────────────────
   0.0000   │  C1   │ 0x0000_0000     │ 0x2000_4000   │ SP (r13) <= 0x2000_4000
   0.3125   │  C2   │ 0x0000_0004     │ 0x0800_02A5   │ PC (r15) <= 0x0800_02A4, EPSR.T <= 1
   0.6250   │  C3   │ 0x0800_02A4     │ 0xB672        │ IF Stage <= "cpsid i" Opcode
   0.9375   │  C4   │ 0x0800_02A6     │ Next Opcode   │ EX Stage <= "cpsid i" (Interrupts Disabled)
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and protocol results against system principles:

1. **Stack Boundary Verification**:
   * Initial $SP = \text{0x2000\_4000}$.
   * Physical SRAM byte range $= \text{0x2000\_0000} \dots \text{0x2000\_3FFF}$.
   * When the first 4-byte `PUSH` instruction executes, $SP$ decrements *first*:
     $$SP_{\text{pushed}} = \text{0x2000\_4000} - 4 = \mathbf{\text{0x2000\_3FC}}$$
   * Data is stored into physical bytes `0x2000_3FC`, `0x2000_3FD`, `0x2000_3FE`, `0x2000_3FF`.
   * This matches the absolute top valid word of physical SRAM memory with $100\%$ precision! Zero bytes of RAM are wasted.

2. **AAPCS Double-Word Alignment Check**:
   * $SP_{\text{initial}} \pmod 8 = \text{0x2000\_4000} \pmod 8 = 0$.
   * $SP_{\text{pushed}} \pmod 8 = \text{0x2000\_3FC} \pmod 8 = 4$.
   * Pushing a single 32-bit register leaves $SP$ 4-byte aligned; pushing two registers ($8\text{ bytes}$) restores 8-byte AAPCS alignment!

3. **Thumb Execution Mode State Verification**:
   * Stored Word 1 $= \text{0x0800\_02A5}$.
   * Bit $0 = 1 \implies EPSR.T = 1$.
   * $PC = \text{0x0800\_02A4}$ (2-byte aligned instruction entry point).
   * The CPU enters Thumb state safely without triggering a HardFault exception.

All initial $SP$ calculations, 8-byte AAPCS alignment checks, Thumb-bit LSB encodings, Little-Endian memory maps, and 4-cycle execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Reset Vector Table**: A hardwired, sequential array of 32-bit physical memory addresses located at physical address `0x0000_0000` (or aliased boot memory) that provides the hardware CPU reset state machine with its initial Stack Pointer ($SP$) and Program Counter ($PC$) entry point.
* **Initial Stack Pointer ($SP$)**: The 32-bit memory address stored at Word 0 (`0x0000_0000`) of the vector table, pointing to one byte past the top boundary of physical RAM ($\text{RAM}_{\text{base}} + \text{RAM}_{\text{size}}$) to establish a full-descending stack before executing software code.
* **AAPCS 8-Byte Stack Alignment**: The architectural invariant requiring the Stack Pointer to remain aligned to an 8-byte boundary ($SP \pmod 8 == 0$) at public interface boundaries and exception entries, preventing alignment faults during double-word (`LDRD`/`STRD`) or floating-point memory operations.