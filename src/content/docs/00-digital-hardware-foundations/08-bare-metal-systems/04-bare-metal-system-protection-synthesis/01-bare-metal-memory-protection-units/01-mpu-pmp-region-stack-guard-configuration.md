---
title: "Hardware Memory Protection Units, Stack Guard Regions, and Execute-Never (XN) Boundaries"
---

# Hardware Memory Protection Units, Stack Guard Regions, and Execute-Never (XN) Boundaries

## The Silent Stack Corruption and Un-Protected RAM Hazard

In a bare-metal microcontroller operating without a virtual memory page-table system, the CPU's execution core accesses physical Static RAM (SRAM) and Flash ROM memory directly over physical bus lines. 

The physical SRAM memory array is shared contiguously between the full-descending Stack Pointer ($SP$), un-initialized global variables (`.bss` section), initialized global variables (`.data` section), and dynamic heap memory.

Because the stack memory grows **downward** from higher memory addresses toward lower memory addresses as functions execute nested calls, push register frames, and allocate local stack arrays:

If a program executes a deeply nested sequence of function calls or allocates a large array on the stack that exceeds the allocated stack memory space, the Stack Pointer ($SP$) crosses its lower boundary (**The Stack Overflow Hazard**).

```text
CONTIGUOUS SRAM MEMORY LAYOUT AND UN-PROTECTED STACK OVERFLOW

 High Memory Address (0x2000_4000)
 ┌───────────────────────────────────────────────────────────┐ ◄── Initial SP (Top of RAM)
 │ Active Stack Memory Space                                 │
 │                                                           │
 │  │ Stack Grows Downward                                   │
 │  ▼ (Deep Recursion / Large Local Array Allocated)         │
 ├───────────────────────────────────────────────────────────┤ ◄── Allocated Stack Limit
 │ SILENT STACK OVERFLOW CORRUPTION ZONE                     │
 │ Stack Pointer (SP) steps past boundary into .bss RAM!     │
 ├───────────────────────────────────────────────────────────┤ ◄── Global .bss Variables
 │ Global Error Flags / System Configuration Constants       │ (OVERWRITTEN WITH STACK TRASH!)
 └───────────────────────────────────────────────────────────┘
 Low Memory Address (0x2000_0000)
```

Look at the catastrophic hardware failure that occurs during an un-protected stack overflow:

1. **Silent Memory Corruption**: The Stack Pointer ($SP$) steps directly into the adjacent SRAM memory region holding global variables (`.bss` and `.data`).
2. **No Hardware Alarm**: Because standard SRAM memory cells accept read and write operations at any physical address, **the bus matrix executes the write quietly without raising an error**!
3. **Delayed System Failure**: Stack data (such as temporary loop counters or return addresses) silently overwrites critical global variables, such as system status flags or sensor calibration constants. 
   
   The software continues executing for seconds or hours until it reads the corrupted global variable, resulting in non-deterministic crashes, erratic machine behavior, or physical safety hazards.

Why can we not rely on software bounds checking (e.g., placing `if (sp < limit)` checks in every function) to prevent stack overflows?

Because software bounds checking:
* Burns $10\%\text{ to } 20\%$ of the CPU's processing capacity executing redundant comparison instructions.
* **Fails completely during hardware interrupts**: When a hardware interrupt ($IRQ$) fires, the CPU hardware pushes an 8-register context frame ($32\text{ bytes}$) onto the stack **in hardware before executing a single line of software instruction**! Software bounds checking cannot prevent hardware auto-stacking from overwriting RAM!

Furthermore, if an attacker or software bug writes binary machine code into an SRAM data buffer, the CPU can jump into SRAM and **execute the injected machine code**, hijacking system control unless SRAM is explicitly configured as non-executable!

How can we place an instantaneous hardware guardrail at the bottom of the stack memory that halts the CPU on the exact clock cycle a stack overflow occurs—*before* a single byte of global variable RAM is overwritten?

And how can we configure physical memory regions so that Flash ROM is strictly Read-Only, and SRAM data buffers are strictly Non-Executable (**Execute-Never / `XN`**)?

To enforce physical memory boundaries in hardware without CPU performance penalties, computer architectures employ the **Memory Protection Unit (MPU / PMP)**, **Stack Guard Regions**, and **Execute-Never (`XN`) Regions**.


### Step 1: The Electric Fence (The MPU Stack Guard Region)

To protect the glass statues, the building manager installs a $1\text{-foot}$ wide **Electrified Strip on the Floor (An MPU Stack Guard Region)** right at the boundary line between the crate stacking area and the glass statues:

```text
THE ELECTRIFIED STRIP (STACK GUARD REGION)

 Crate Stacking Area          Electrified Strip          Glass Statue Area
 ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
 │ Stack Pointer Space       │ NO-ACCESS STRIP           │ Global .bss Variables     │
 │ (Allowed Access)          │ (Touch = INSTANT SHOCK!)  │ (Allowed Access)          │
 └───────────────────────────┴───────────────────────────┴───────────────────────────┘
                               ▲
                               └── The moment worker's boot touches the strip:
                                   INSTANT SHOCK! Alarm rings! Worker HALTS!
                                   (Glass Statues 100% Protected!)
```

The electrified strip is programmed with a strict physical rule: **NO ACCESS ALLOWED (`AP = 000`)**!
* As long as the worker stays in the crate stacking area, nothing happens.
* The exact millisecond the worker's boot touches the electrified strip (**Stack Pointer decrements into the Guard Region**):
  * **INSTANT SHOCK!** An alarm rings in $0\text{ seconds}$ (**Triggers a MemManage Hardware Fault**)!
  * The worker halts immediately before taking another step.
  * **The glass statues are $100\%$ undamaged!**


## Deep Mechanics of MPU Registers, Region Sizing, and Permission Attributes

Now that we possess an intuitive mental model of electric floor strips and glass window instruction guards, let us examine the formal, rigorous engineering mechanics of **Memory Protection Units (MPUs)**, **Region Base Addresses**, **Power-of-Two Alignments**, and **Access Permissions**.

In modern 32-bit processors (such as ARM Cortex-M3/M4/M7 microcontrollers), the **Memory Protection Unit (MPU)** is a hardware module integrated directly inside the CPU core's System Control Space (SCS) at base address `0xE000_ED90`.

```text
SYSTEM CONTROL SPACE (SCS) MPU REGISTER MAP (BASE: 0xE000_ED90)

 Byte Offset │ Register Name │ Width   │ Primary Hardware Function
─────────────┼───────────────┼─────────┼───────────────────────────────────────────────────────────
  Offset 0x00│ MPU_TYPE      │ 32 Bits │ Type Register (Reports number of hardware regions: 8 or 16)
  Offset 0x04│ MPU_CTRL      │ 32 Bits │ Control Register (Enable MPU, PRIVDEFENA, HFNMIENA)
  Offset 0x08│ MPU_RNR       │ 32 Bits │ Region Number Register (Selects active region 0..7)
  Offset 0x0C│ MPU_RBAR      │ 32 Bits │ Region Base Address Register (Sets physical base ADDR)
  Offset 0x10│ MPU_RASR      │ 32 Bits │ Region Attribute and Size Register (Size, AP, XN, TEX)
```

```text
MPU HARDWARE CROSSBAR COMPARATOR ARCHITECTURE

 CPU Memory Access Request (Address A, Read/Write/Fetch)
       │
       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ MPU REGION COMPARATORS (Parallel Evaluation Across 8 Regions)│
 │  * Region 0 Comparator : Is A in Region 0? Check AP & XN!   │
 │  * Region 1 Comparator : Is A in Region 1? Check AP & XN!   │
 │  * ...                                                      │
 │  * Region 7 Comparator : Is A in Region 7? Check AP & XN!   │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ Permission OK                 ▼ Violation Detected!
 Execute Memory Bus Access              Block Memory Access Immediately!
 (1-Cycle Zero Overhead!)               Assert MemManage Fault to CPU!
```

The MPU contains parallel digital comparators that continuously monitor every memory access generated by the CPU execution pipeline ($PC$ fetches, $SP$ pushes, and data load/stores) against up to **8 or 16 programmable region definitions** in $0\text{ clock cycles}$!


### 2. The MPU Region Attribute and Size Register (`MPU_RASR`)

The **MPU Region Attribute and Size Register (`MPU_RASR`)** at offset `0x10` defines the physical size, subregion disable mask, access permissions, and execution attributes for the selected region:

```text
MPU_RASR REGISTER BITFIELD MAP

 Bit 31 Bit 28 Bit 27 Bit 26 Bit 24 Bit 21 Bit 16 Bit 15 Bit 8 Bit 5   Bit 1 Bit 0
 ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬─────────┬─────────┬─────┬─────┐
 │ XN   │ Res  │ AP   │ Res  │ TEX  │ S    │ C, B │ SRD     │ Reserved│ SIZE│ENABLE
 │ (1b) │      │ (3b) │      │ (3b) │ (1b) │ (2b) │ (8 Bits)│         │ (5b)│ (1b)│
 └──────┴──────┴──────┴──────┴──────┴──────┴──────┴─────────┴─────────┴─────┴─────┘
```

Let us dissect the most critical fields of `MPU_RASR`:

#### A. The `ENABLE` Bit (Bit 0)
$1 =$ Activates this region comparator. $0 =$ Disables this region.

#### B. The `SIZE[5:1]` Field (Bits $[5:1]$ — Power-of-Two Region Sizing)
In ARMv7-M MPU architecture, every region size $S$ **MUST be an exact mathematical power of two ($2^N$ bytes)**, where $32\text{ Bytes} \le S \le 4\text{ Gigabytes}$.

The 5-bit `SIZE` field encodes the exponent value according to **The Power-of-Two Size Equation**:

$$\mathbf{\text{Region Size } S = 2^{\text{SIZE} + 1} \text{ Bytes}} \quad \iff \quad \mathbf{\text{SIZE} = \log_2(S) - 1}$$

```text
MPU REGION SIZE FIELD ENCODING TABLE

 SIZE Field Value │ Binary Code │ Encoded Formula (2^(SIZE+1)) │ Physical Region Size
──────────────────┼─────────────┼──────────────────────────────┼───────────────────────
     4 (0x04)     │   00100_2   │ 2^(4 + 1) = 2^5              │ 32 Bytes (MINIMUM!)
     5 (0x05)     │   00101_2   │ 2^(5 + 1) = 2^6              │ 64 Bytes
     7 (0x07)     │   00111_2   │ 2^(7 + 1) = 2^8              │ 256 Bytes
    11 (0x0B)     │   01011_2   │ 2^(11 + 1) = 2^12            │ 4,096 Bytes (4 KB)
    15 (0x0F)     │   01111_2   │ 2^(15 + 1) = 2^16            │ 65,536 Bytes (64 KB)
    19 (0x13)     │   10011_2   │ 2^(19 + 1) = 2^20            │ 1,048,576 Bytes (1 MB)
    31 (0x1F)     │   11111_2   │ 2^(31 + 1) = 2^32            │ 4 Gigabytes (MAXIMUM)
```

#### C. The MPU Base Address Alignment Invariant
Because the region size $S$ is enforced via bitmasking in physical hardware comparators:

> **The MPU Base Address Alignment Invariant**: An MPU region of size $S = 2^B$ bytes **MUST be physically placed at a base address $ADDR_{\text{base}}$ that is an exact mathematical multiple of $S$**!

$$\mathbf{ADDR_{\text{base}} \pmod S == 0} \quad \iff \quad \mathbf{ADDR_{\text{base}} \ \ \& \ \ (S - 1) == 0}$$

For example:
* A $256\text{-byte}$ region ($S = 256 = 2^8$) **MUST** start at an address where the bottom 8 bits are zero (`ADDR & 0xFF == 0`, e.g., `0x2000_0100`).
* If a programmer attempts to place a $256\text{-byte}$ region at base address `0x2000_0050`, **the hardware MPU comparator masks out the lower 8 bits**, forcing the region to start at `0x2000_0000` and corrupting the intended boundary protection!

```text
BASE ADDRESS ALIGNMENT VIOLATION HAZARD

 Intended Base Address : 0x2000_0050 (Size = 256 Bytes / Mask = 0xFF00_0000)
 Hardware MPU Mask    : Base Address & ~0x0000_00FF
 Actual Hardware Base : 0x2000_0000 (FORCED DOWN TO 0x2000_0000 IN SILICON!)
 (Region covers wrong memory addresses! Boundary protection fails!)
```

#### D. The Subregion Disable Field (`SRD` — Bits $[15:8]$)
What happens if you need to protect a $12\text{-Kilobyte}$ buffer? $12\text{ KB}$ is not a power of two!
The MPU provides **Subregion Disabling (`SRD`)**:
* Every MPU region is divided into **8 equal subregions** (each subregion size $= S / 8$).
* Setting bit $k$ of the 8-bit `SRD` field to $1$ **disables protection for subregion $k$**, allowing non-power-of-two memory layouts to be constructed!


## Primitive 3: Configuring a Hardware Stack Guard Region

Now let us examine how to synthesize these primitives into a production-grade **Hardware Stack Guard Region**.

Consider a bare-metal microcontroller with SRAM memory spanning `0x2000_0000` to `0x2000_3FFF` ($16\text{ KB}$).
* The full-descending stack grows downward from initial $SP = \text{0x2000\_4000}$.
* The bottom boundary of the allocated stack space is located at `0x2000_2000` (Stack size $= 8\text{ KB}$).
* Immediately below `0x2000_2000` sit global variables (`.bss` and `.data` from `0x2000_0000` to `0x2000_1FFF`).

```text
STACK GUARD REGION PLACEMENT AT MEMORY BOUNDARY

 High Memory Address (0x2000_4000)
 ┌───────────────────────────────────────────────────────────┐ ◄── Initial SP (Top of RAM)
 │ Active Stack Memory Region (8 KB Allocated)               │
 ├───────────────────────────────────────────────────────────┤ ◄── Stack Limit Address (0x2000_2000)
 │ MPU REGION 0: STACK GUARD REGION (Size = 256 Bytes)      │
 │ Physical Range: 0x2000_1F00 to 0x2000_1FFF               │
 │ Attributes    : AP = 3'b000 (No Access), XN = 1           │
 ├───────────────────────────────────────────────────────────┤ ◄── Global Variables Boundary
 │ Global .bss and .data Memory Space                        │
 └───────────────────────────────────────────────────────────┘
 Low Memory Address (0x2000_0000)
```

### The Stack Guard Configuration Strategy

We place **MPU Region 0** directly at the boundary between the stack and global variables:
1. **Base Address (`MPU_RBAR`)**: Set to physical address `0x2000_1F00` (a $256\text{-byte}$ block immediately below `0x2000_2000`).
2. **Alignment Verification**: Address `0x2000_1F00` $\pmod{256} = 0$ ($\mathbf{\text{256-BYTE ALIGNED!}}$).
3. **Region Size (`MPU_RASR.SIZE`)**: Set to $256\text{ Bytes}$ (`SIZE = 7` $\implies 2^{7+1} = 256$).
4. **Access Permissions (`MPU_RASR.AP`)**: Set to **`3'b000` (NO ACCESS ALLOWED)**.
5. **Execute-Never (`MPU_RASR.XN`)**: Set to **`1` (EXECUTE-NEVER)**.


## Real-World Silicon Engineering: MPU Region Overlap Rules and Memory Barriers

In commercial embedded systems engineering, configuring MPU registers requires handling region overlap priorities and memory barrier instruction sequences.


### 2. Memory Barriers During MPU Enabling (`DMB` and `ISB`)

When assembly software programs `MPU_CTRL.ENABLE = 1` to turn on memory protection:

If out-of-order instruction prefetching or write buffering occurs, the CPU pipeline might attempt to fetch or execute subsequent memory instructions **before the MPU hardware comparators are fully energized**!

To ensure MPU settings take effect instantly before any subsequent memory instruction executes, software **MUST insert Memory Barrier Instructions**:

```assembly
/* MANDATORY MEMORY BARRIERS WHEN ENABLING MPU */
    ldr     r0, =MPU_CTRL
    movs    r1, #5              /* ENABLE = 1, PRIVDEFENA = 1 */
    str     r1, [r0]

    dsb                         /* Data Synchronization Barrier: Flushes write buffer */
    isb                         /* Instruction Synchronization Barrier: Flushes pipeline */
    /* MPU is now 100% active! Safe to proceed. */
```

* `dsb` (**Data Synchronization Barrier**): Forces all outstanding memory writes (including the write to `MPU_CTRL`) to complete before the next instruction executes.
* `isb` (**Instruction Synchronization Barrier**): Flushes the CPU's instruction prefetch pipeline, forcing the processor to re-fetch all future instructions through the newly activated MPU comparators!


### Scenario and Parameters

You are a principal bare-metal systems security architect configuring the Memory Protection Unit (MPU) for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER MPU CONFIGURATION

 System Memory Layout:
 ┌─────────────────────────────────────────────────────────────┐
 │ Flash ROM Memory : 64 KB (0x0800_0000 to 0x0800_FFFF)       │
 │ System SRAM Memory: 16 KB (0x2000_0000 to 0x2000_3FFF)       │
 ├─────────────────────────────────────────────────────────────┤
 │ Stack Allocation : Top = 0x2000_4000, Limit = 0x2000_2000   │
 └─────────────────────────────────────────────────────────────┘
  MMIO Base Address  : MPU_BASE = 0xE000_ED90
```

#### Security Protection Requirements:
1. **Region 0 (Flash ROM Executable Code)**:
   * Memory Range: `0x0800_0000` ($64\text{ KB}$ capacity).
   * Permissions: **Read-Only / Executable** (`AP = 3'b110`, `XN = 0`).
2. **Region 1 (Background SRAM Data Memory)**:
   * Memory Range: `0x2000_0000` ($16\text{ KB}$ capacity).
   * Permissions: **Read-Write / Execute-Never** (`AP = 3'b011`, `XN = 1` to block RAM code injection!).
3. **Region 2 (Stack Guard Region)**:
   * Positioned immediately below the stack limit `0x2000_2000` (spanning `0x2000_1F00` to `0x2000_1FFF`, $256\text{ Bytes}$).
   * Overrides Region 1 via higher region priority index ($R_2 > R_1$).
   * Permissions: **NO ACCESS ALLOWED / Execute-Never** (`AP = 3'b000`, `XN = 1`).

#### Your Objective

1. Calculate the exact 5-bit `SIZE` field values for Region 0 ($64\text{ KB}$), Region 1 ($16\text{ KB}$), and Region 2 ($256\text{ Bytes}$).
2. Verify mathematically that the base addresses (`0x0800_0000`, `0x2000_0000`, `0x2000_1F00`) satisfy the MPU Base Address Alignment Invariant.
3. Calculate the complete 32-bit hexadecimal values for `MPU_RBAR` and `MPU_RASR` for all three regions.
4. Calculate the physical time savings (in nanoseconds) provided by 1-cycle MPU hardware stack overflow detection versus executing a 10-instruction software bounds-checking loop on every function call.
5. Write the complete, production-ready ARM Assembly initialization routine `MPU_Security_Init` that configures all three regions, enables the MPU with `PRIVDEFENA = 1`, and executes `DSB`/`ISB` memory barriers.
6. Verify mathematical, structural, and security correctness.


#### Step 2: Construct `MPU_RBAR` and `MPU_RASR` Bitfield Registers

##### 1. Region 0 (Flash ROM: Base `0x0800_0000`, Size $64\text{KB}$, `AP = 3'b110` Read-Only, `XN = 0`):
* `MPU_RBAR0`: Base `0x0800_0000` | `VALID = 1` | `REGION = 0` $\implies \mathbf{\text{0x0800\_0010}}$
* `MPU_RASR0`:
  * `XN` (Bit 28) $= 0$
  * `AP` (Bits $[26:24]$) $= 110_2 = 6$ (Read-Only)
  * `TEX,C,B` (Bits $[21:16]$) $= 000110_2 = \text{0x06}$ (Flash normal memory)
  * `SRD` (Bits $[15:8]$) $= 0x00$ (All subregions enabled)
  * `SIZE` (Bits $[5:1]$) $= 15 \ll 1 = 30 = \text{0x1E}$
  * `ENABLE` (Bit 0) $= 1$

$$\mathbf{\text{MPU\_RASR0} = \text{0x0606\_001F}}$$

##### 2. Region 1 (SRAM Data: Base `0x2000_0000`, Size $16\text{KB}$, `AP = 3'b011` Read-Write, `XN = 1`):
* `MPU_RBAR1`: Base `0x2000_0000` | `VALID = 1` | `REGION = 1` $\implies \mathbf{\text{0x2000\_0011}}$
* `MPU_RASR1`:
  * `XN` (Bit 28) $= 1$ (Execute-Never enabled for RAM!)
  * `AP` (Bits $[26:24]$) $= 011_2 = 3$ (Full Read-Write)
  * `TEX,C,B` (Bits $[21:16]$) $= 000110_2 = \text{0x06}$ (SRAM normal memory)
  * `SIZE` (Bits $[5:1]$) $= 13 \ll 1 = 26 = \text{0x1A}$
  * `ENABLE` (Bit 0) $= 1$

$$\mathbf{\text{MPU\_RASR1} = \text{0x1306\_001B}}$$

##### 3. Region 2 (Stack Guard: Base `0x2000_1F00`, Size $256\text{B}$, `AP = 3'b000` No Access, `XN = 1`):
* `MPU_RBAR2`: Base `0x2000_1F00` | `VALID = 1` | `REGION = 2` $\implies \mathbf{\text{0x2000\_1F12}}$
* `MPU_RASR2`:
  * `XN` (Bit 28) $= 1$ (Execute-Never)
  * `AP` (Bits $[26:24]$) $= 000_2 = 0$ (**NO ACCESS ALLOWED!**)
  * `SIZE` (Bits $[5:1]$) $= 7 \ll 1 = 14 = \text{0x0E}$
  * `ENABLE` (Bit 0) $= 1$

$$\mathbf{\text{MPU\_RASR2} = \text{0x1000\_000F}}$$

```text
MPU REGION CONFIGURATION SUMMARY

 Region Index │ Base Address │ Size   │ AP[2:0] Code │ XN Bit │ MPU_RASR Hex Value
──────────────┼──────────────┼────────┼──────────────┼────────┼────────────────────
  Region 0    │ 0x0800_0000  │ 64 KB  │ 3'b110 (RO)  │   0    │ 0x0606_001F
  Region 1    │ 0x2000_0000  │ 16 KB  │ 3'b011 (RW)  │   1    │ 0x1306_001B
  Region 2    │ 0x2000_1F00  │ 256 B  │ 3'b000 (NONE)│   1    │ 0x1000_000F (Guard)
```


#### Step 4: Complete Production ARM Assembly MPU Driver Routine

Here is the complete, production-ready ARM Assembly initialization routine:

```assembly
/* PRODUCTION BARE-METAL MPU STACK GUARD CONFIGURATION ROUTINE */
.syntax unified
.cpu cortex-m4
.thumb

/* MPU MMIO Register Base Addresses */
.equ MPU_BASE,        0xE000ED90
.equ MPU_CTRL,        0xE000ED94        /* Control Register */
.equ MPU_RBAR,        0xE000ED9C        /* Region Base Address Register */
.equ MPU_RASR,        0xE000EDA0        /* Region Attribute and Size Register */

.global MPU_Security_Init
.type MPU_Security_Init, %function

.section .text
.thumb_func
MPU_Security_Init:
    push    {r4, r5, lr}

    /* Step 1: Disable MPU during configuration */
    ldr     r0, =MPU_CTRL
    movs    r1, #0
    str     r1, [r0]                    /* MPU_CTRL = 0 */

    /* ==================================================================== */
    /* REGION 0: FLASH ROM (64 KB, READ-ONLY, EXECUTABLE)                  */
    /* ==================================================================== */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x08000010             /* Base = 0x0800_0000, VALID=1, REGION=0 */
    str     r1, [r0]

    ldr     r0, =MPU_RASR
    ldr     r1, =0x0606001F             /* AP=110 (RO), XN=0, SIZE=15 (64KB), ENABLE=1 */
    str     r1, [r0]

    /* ==================================================================== */
    /* REGION 1: BACKGROUND SRAM (16 KB, READ-WRITE, EXECUTE-NEVER)         */
    /* ==================================================================== */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x20000011             /* Base = 0x2000_0000, VALID=1, REGION=1 */
    str     r1, [r0]

    ldr     r0, =MPU_RASR
    ldr     r1, =0x1306001B             /* AP=011 (RW), XN=1, SIZE=13 (16KB), ENABLE=1 */
    str     r1, [r0]

    /* ==================================================================== */
    /* REGION 2: STACK GUARD REGION (256 BYTES, NO ACCESS, EXECUTE-NEVER)   */
    /* ==================================================================== */
    ldr     r0, =MPU_RBAR
    ldr     r1, =0x20001F12             /* Base = 0x2000_1F00, VALID=1, REGION=2 */
    str     r1, [r0]

    ldr     r0, =MPU_RASR
    ldr     r1, =0x1000000F             /* AP=000 (NO ACCESS!), XN=1, SIZE=7 (256B), ENABLE=1 */
    str     r1, [r0]

    /* ==================================================================== */
    /* STEP 2: ENABLE MPU WITH PRIVILEGED DEFAULT BACKGROUND MAP            */
    /* ==================================================================== */
    /* MPU_CTRL: ENABLE = 1 (Bit 0), PRIVDEFENA = 1 (Bit 2 - Privileged default) */
    ldr     r0, =MPU_CTRL
    movs    r1, #5                      /* ENABLE=1, PRIVDEFENA=1 */
    str     r1, [r0]

    /* Step 3: Execute Memory Barriers to enforce MPU settings immediately */
    dsb                                 /* Data Synchronization Barrier */
    isb                                 /* Instruction Synchronization Barrier */

    pop     {r4, r5, pc}
.size MPU_Security_Init, .-MPU_Security_Init
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Memory Protection Unit (MPU / PMP)**: A core-coupled hardware security module that monitors every memory access generated by the CPU execution pipeline in $0\text{ clock cycles}$, enforcing programmable region base addresses, power-of-two alignment rules ($ADDR \pmod S == 0$), access permissions (`AP`), and Execute-Never (`XN`) execution limits.
* **Stack Guard Region**: A dedicated, low-level MPU memory region (configured with `AP = 3'b000` No-Access permissions) positioned at the lower boundary of the stack memory space that intercepts stack overflow attempts in hardware, triggering a `MemManage` fault before global variables can be overwritten.
* **Execute-Never (`XN`) Region**: An MPU region attribute (`XN = 1` in `MPU_RASR`) that prevents the CPU instruction fetch unit from fetching opcodes out of SRAM or MMIO memory spaces, blocking code-injection attacks and wild branches into data buffers.