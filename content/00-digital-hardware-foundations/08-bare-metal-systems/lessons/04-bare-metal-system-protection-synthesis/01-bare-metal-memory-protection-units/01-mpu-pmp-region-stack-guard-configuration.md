content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/04-bare-metal-system-protection-synthesis/01-bare-metal-memory-protection-units/01-mpu-pmp-region-stack-guard-configuration.md
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

---

## The Electric Fence and the Glass Window: A Mental Model for MPU Protection

To build an intuitive, crystal-clear mental model of Memory Protection Units, region base addresses, power-of-two size alignments, access permissions, and Execute-Never (`XN`) attributes before inspecting Memory-Mapped I/O (MMIO) registers and assembly equations, let us consider an everyday analogy: **The Shared Art Studio and the Bank Vault**.

Imagine a large commercial room (**Physical System SRAM Memory**) shared by two workers:
* A worker stacking heavy wooden crates (**The Descending Stack Pointer $SP$**).
* An artist sculpting fragile glass statues (**Global `.bss` Variables**).

```text
THE SHARED ART STUDIO METAPHOR

 Un-Protected Studio Floor (Un-Protected System RAM)
 ┌───────────────────────────────────────────────────────────┐
 │ Worker Stacking Crates    │ Artist Sculpting Glass        │
 │ (Stack Pointer SP)        │ (Global .bss Variables)       │
 └───────────────────────────┴───────────────────────────────┘
 (No wall between them! Worker backs up and crushes glass statues!)
```

There is no physical wall between them on the studio floor. As the worker stacks more crates, they keep backing up toward the artist's area. 

Eventually, the worker steps into the artist's workspace and crushes the fragile glass statues (**Silent Memory Corruption**)! 

The worker doesn't even realize they crushed the glass until hours later when the artist returns and finds the wreckage (**Delayed Software Crash**)!

---

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

---

### Step 2: The Display Glass Window (Execute-Never `XN` Attribute)

Now, consider a second scenario in a bank vault (**Data Memory in SRAM**):

Bank tellers store paper financial receipts (**Data Variables**) inside a storage room.

Normally, employees read numbers written on the paper receipts (**Data Read/Write**). 

However, a rogue visitor writes instructions on a paper receipt saying *"Hand over the keys"* and tries to feed the paper into the automatic robot manager's instruction reader (**The CPU Instruction Fetch Unit**)!

```text
THE DISPLAY GLASS WINDOW (EXECUTE-NEVER / XN)

 Paper Storage Room (SRAM Data Buffer)
 ┌───────────────────────────────────────────────────────────┐
 │ Tellers can READ and WRITE text on paper receipts.       │
 ├───────────────────────────────────────────────────────────┤
 │ DISPLAY GLASS WINDOW (Execute-Never / XN = 1)             │
 │ Physically BLOCKS paper from entering Instruction Slot!   │
 └───────────────────────────────────────────────────────────┘
  (Prevents anyone from executing instructions out of paper receipts!)
```

To prevent this attack, the bank manager installs a **Display Glass Window with an Instruction Slot Guard (Execute-Never / `XN = 1`)**:
* Tellers are permitted to read text through the glass and write on the paper (**Read/Write Allowed**).
* But the glass window **physically blocks any paper from being fed into the robot's instruction slot (`XN = 1`)**!
* If anyone attempts to feed paper from the storage room into the instruction slot, the slot jams instantly and an alarm rings (**Instruction Access Violation Fault `IACCVIOL`**)!

This art studio and bank vault system is the exact physical analogue of **Hardware Memory Protection Units, Stack Guard Regions, and Execute-Never Boundaries**:
* The shared studio floor is **Physical System SRAM Memory**.
* The worker stacking crates is the **Descending Stack Pointer ($SP$)**.
* The fragile glass statues are **Global `.bss` Variables**.
* The electrified floor strip is an **MPU Stack Guard Region (`AP = 000`)**.
* The instant shock is a **Hardware `MemManage` Fault Exception**.
* Paper financial receipts are **RAM Data Buffers**.
* The display glass window blocking the instruction slot is the **Execute-Never Attribute (`XN = 1`)**.

---

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

---

### 1. The MPU Region Base Address Register (`MPU_RBAR`)

To configure an MPU memory region, software first writes the region number ($0 \dots 7$) into the **MPU Region Number Register (`MPU_RNR`)**, or writes the region index directly into the lower bits of the **MPU Region Base Address Register (`MPU_RBAR`)**:

```text
MPU_RBAR REGISTER BITFIELD MAP

 Bit 31                                         Bit 5 Bit 4 Bit 3 Bit 2 Bit 0
 ┌───────────────────────────────────────────────────┬─────┬─────┬───────────┐
 │ ADDR[31:5]                                        │VALID│ REGION[3:0]   │
 │ (Physical Base Address aligned to Region Size)    │ (1b)│ (Region Index)│
 └───────────────────────────────────────────────────┴─────┴─────────────┴───┘
```

* **`ADDR[31:5]` (Bits $[31:5]$)**: Stores the 32-bit physical base address where the protected region begins in memory.
* **`VALID` (Bit 4)**: $1 =$ Overwrites the active region selection with the index in `REGION[3:0]`.
* **`REGION[3:0]` (Bits $[3:0]$)**: Selects the target hardware region index ($0 \dots 7$).

---

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

---

### 3. Access Permission Bits (`AP[2:0]`) and the Execute-Never (`XN`) Attribute

The upper bits of `MPU_RASR` define the access permissions enforced by the hardware comparators:

```text
ACCESS PERMISSION (AP[2:0]) FIELD ENCODING TABLE

 AP[2:0] Code │ Privileged Mode Access │ Unprivileged Mode Access │ Primary Usage Role
──────────────┼────────────────────────┼──────────────────────────┼─────────────────────────────
   3'b000     │ No Access              │ No Access                │ STACK GUARD REGIONS!
   3'b001     │ Read / Write           │ No Access                │ Kernel Memory / OS Stacks
   3'b010     │ Read / Write           │ Read-Only                │ Protected Data Buffers
   3'b011     │ Read / Write           │ Read / Write             │ User RAM / General SRAM
   3'b101     │ Read-Only              │ No Access                │ Kernel Constants
   3'b110     │ Read-Only              │ Read-Only                │ Flash ROM Code (.text)
```

#### A. `AP = 3'b000` (No Access — The Stack Guard Primitive)
Any attempt by the CPU pipeline to read, write, or fetch instructions from a region configured with `AP = 3'b000` triggers an **immediate Data Access Violation MemManage Fault (`DACCVIOL`)**!

#### B. `XN` Bit (Instruction Access Disable / Execute-Never — Bit 28)
* `XN = 0` (**Execution Permitted**): The CPU instruction fetch unit is allowed to fetch and decode machine opcodes from this memory region.
* `XN = 1` (**Execute-Never Enforced**):
  If the Program Counter ($PC$) ever points to an address inside an `XN = 1` region (e.g., due to a corrupted function pointer or code injection attack), the instruction fetch unit **blocks the fetch in $0\text{ clock cycles}$** and triggers an **Instruction Access Violation MemManage Fault (`IACCVIOL`)**!

```text
EXECUTE-NEVER (XN = 1) PROTECTION ENFORCEMENT

 CPU Program Counter attempts to fetch instruction from SRAM Address 0x2000_1000
                       │
                       ▼
 MPU Region 1 Comparator (Configured for SRAM Data: AP = 3'b011, XN = 1)
                       │
                       ▼ Checks XN Attribute: XN == 1!
 INSTRUCTION FETCH BLOCKED IN 0 CLOCK CYCLES!
 Asserts IACCVIOL Flag -> Triggers MemManage_Handler (Exception Vector 4)!
 (Code injection attack neutralized before a single opcode executes!)
```

---

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

---

### Step-by-Step Hardware Interception Trace of a Stack Overflow

Trace what happens when a software bug causes $SP$ to overflow:

```text
HARDWARE STACK OVERFLOW INTERCEPTION TIMELINE

 1. Nested Functions / Large Arrays push SP down to 0x2000_2004.
 2. Function executes: PUSH {r0-r3}  (Pushes 16 bytes onto stack)
 3. Hardware SP decrements: SP = 0x2000_2004 - 16 = 0x2000_1FF4
    (Address 0x2000_1FF4 falls INSIDE MPU Region 0 [0x2000_1F00..0x2000_1FFF]!)
                       │
                       ▼
 4. MPU Comparator evaluates access to 0x2000_1FF4:
    Region 0 matched! AP = 3'b000 (NO ACCESS ALLOWED!)
                       │
                       ▼
 5. MPU BLOCKS THE MEMORY BUS WRITE IN 0 CLOCK CYCLES!
 6. MPU sets DACCVIOL = 1 in SCB->CFSR!
 7. MPU assets MemManage Exception Vector 4 to CPU Core!
 (Global .bss variables at 0x2000_0000..0x2000_1EF0 remain 100% PRISTINE!)
```

1. Software executes `PUSH {r0-r3}`. $SP$ decrements into address `0x2000_1FF4`.
2. Address `0x2000_1FF4` falls inside MPU Region 0 (`0x2000_1F00` through `0x2000_1FFF`).
3. MPU Region 0 comparator evaluates the write request:
   $$\text{Access Check: } \quad \text{AP} == 3'b000 \implies \mathbf{\text{PERMISSION DENIED!}}$$
4. **THE HARDWARE INTERCEPTION**:
   * The MPU **blocks the write payload from reaching SRAM memory cells**.
   * The MPU sets Bit 1 (`DACCVIOL — Data Access Violation`) in the `SCB->CFSR` status register.
   * The MPU stores `0x2000_1FF4` in the `SCB->MMFAR` fault address register.
   * The MPU asserts **`MemManage_Handler` (Exception Vector 4)** to the CPU core on the exact clock cycle of the violation!
5. **System Recovery**: The `MemManage_Handler` logs the stack overflow error and resets the CPU safely, completely preserving the integrity of global variables!

---

## Real-World Silicon Engineering: MPU Region Overlap Rules and Memory Barriers

In commercial embedded systems engineering, configuring MPU registers requires handling region overlap priorities and memory barrier instruction sequences.

---

### 1. MPU Region Overlapping Priority Rules

What happens if a physical memory address falls inside **two different MPU regions simultaneously**?

For example:
* **Region 1**: Covers all of SRAM (`0x2000_0000` to `0x2000_3FFF`, $16\text{ KB}$) with `AP = 3'b011` (Full Read-Write).
* **Region 0 (Stack Guard)**: Covers `0x2000_1F00` to `0x2000_1FFF` ($256\text{ Bytes}$) with `AP = 3'b000` (No Access).

Address `0x2000_1F50` falls inside **BOTH Region 1 AND Region 0**!

```text
MPU OVERLAPPING REGION PRIORITY RULE

 Physical Address 0x2000_1F50 falls in BOTH Region 0 AND Region 1!
 ┌───────────────────────────────────────────────────────────┐
 │ Region 1: SRAM Background (AP = 3'b011 - Read-Write)      │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ Region 0: Stack Guard (AP = 3'b000 - No Access!)    │  │
 │  └─────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────┘
  (HIGHER REGION INDEX WINS! Region 1 overrides Region 0 if numbers overlap!)
```

#### The Hardware Overlap Priority Invariant:
> **The Higher-Region Index Priority Invariant**: When a memory address falls into multiple active MPU regions, **the attributes of the HIGHEST REGION NUMBER ($R_{\text{max}}$) ALWAYS WIN**!

$$\text{Active Region Attributes} = \text{Region}_{\max(k_1, k_2, \dots, k_n)}$$

#### Critical Configuration Rule:
Because Region 1 ($R_1$) has a higher index number than Region 0 ($R_0$), **Region 1 would OVERRIDE Region 0**, turning the Stack Guard into Read-Write memory!

To ensure the Stack Guard overrides the background SRAM region:
* **Background SRAM**: MUST be assigned to **Region 0 ($R_0$)**!
* **Stack Guard Region**: MUST be assigned to a higher region index, such as **Region 1 ($R_1$) or Region 7 ($R_7$)**!

```text
CORRECT OVERLAPPING REGION ASSIGNMENT

 Region 0 (Background SRAM) : 0x2000_0000 (16 KB, AP = 3'b011 - Read-Write)
 Region 1 (Stack Guard)     : 0x2000_1F00 (256 B, AP = 3'b000 - NO ACCESS!)
 (Region 1 > Region 0 -> Stack Guard OVERRIDES background SRAM correctly!)
```

---

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

---

## Solved Industrial Engineering Exercise: Quantitative MPU Region Calculation, Stack Guard Alignment, and Assembly Driver Synthesis

To consolidate your complete mastery of MPU hardware architecture, power-of-two region size encoding (`SIZE`), base address alignment verification, `AP` access permission bitmasks, `XN` execute-never flags, and assembly driver configurations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate `SIZE` Field Values and Verify Alignment

We apply the Power-of-Two Size Equation ($\text{SIZE} = \log_2(S) - 1$):

##### 1. Region 0 (Flash ROM — $64\text{ KB} = 65,536\text{ Bytes} = 2^{16}\text{ Bytes}$):
$$\text{SIZE}_0 = \log_2(65,536) - 1 = 16 - 1 = \mathbf{15} \quad (\mathbf{\text{0x0F}} = \text{5'b01111})$$

* Alignment Check: $\text{Base } \text{0x0800\_0000} \pmod{65,536} = 0 \implies \mathbf{\text{ALIGNED!}}$

##### 2. Region 1 (SRAM Data — $16\text{ KB} = 16,384\text{ Bytes} = 2^{14}\text{ Bytes}$):
$$\text{SIZE}_1 = \log_2(16,384) - 1 = 14 - 1 = \mathbf{13} \quad (\mathbf{\text{0x0D}} = \text{5'b01101})$$

* Alignment Check: $\text{Base } \text{0x2000\_0000} \pmod{16,384} = 0 \implies \mathbf{\text{ALIGNED!}}$

##### 3. Region 2 (Stack Guard — $256\text{ Bytes} = 2^8\text{ Bytes}$):
$$\text{SIZE}_2 = \log_2(256) - 1 = 8 - 1 = \mathbf{7} \quad (\mathbf{\text{0x07}} = \text{5'b00111})$$

* Alignment Check: $\text{Base } \text{0x2000\_1F00} = 536,878,848_{10}$.

$$\frac{536,878,848}{256} = 2,097,183.0 \quad (\mathbf{\text{Exact Integer! Remainder = 0! ALIGNED!}})$$

---

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

---

#### Step 3: Calculate Performance Advantage over Software Bounds Checking

* **Software Bounds Checking Overhead**: Executing a 10-instruction software stack bounds check (`ldr`, `cmp`, `ble`, `bne`...) on every function call at $3.2\text{ GHz}$ burns $10\text{ CPU cycles}$ ($3.125\text{ ns}$) per function call. Across $10,000,000\text{ function calls per second}$:
  $$\text{Software Wasted Time} = 10,000,000 \times 3.125\text{ ns} = \mathbf{31.250 \text{ Milliseconds/Sec}} \quad (3.125\% \text{ CPU Overhead})$$
* **Hardware MPU Stack Guard Overhead**: $0\text{ instruction cycles}$ during normal execution ($0.000\text{ ns}$). Interception executes in $0\text{ cycles}$ via parallel hardware comparators!

$$\text{Performance Offloading} = \mathbf{100\% \text{ Software Cycle Elimination!}}$$

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and bitwise MPU configuration results against silicon specifications:

1. **Power-of-Two Size Encoding Verification**:
   * Region 0 ($64\text{ KB}$): $\text{SIZE} = 15 \implies 2^{15+1} = 2^{16} = 65,536\text{ Bytes} = 64\text{ KB}$.
   * Region 1 ($16\text{ KB}$): $\text{SIZE} = 13 \implies 2^{13+1} = 2^{14} = 16,384\text{ Bytes} = 16\text{ KB}$.
   * Region 2 ($256\text{ Bytes}$): $\text{SIZE} = 7 \implies 2^{7+1} = 2^8 = 256\text{ Bytes}$.
   * Size calculations verified $100\%$!

2. **Base Address Alignment Verification**:
   * Region 0 Base `0x0800_0000` $\pmod{65,536} = 0 \implies \mathbf{\text{ALIGNED!}}$
   * Region 1 Base `0x2000_0000` $\pmod{16,384} = 0 \implies \mathbf{\text{ALIGNED!}}$
   * Region 2 Base `0x2000_1F00` $\pmod{256} = 0 \implies \mathbf{\text{ALIGNED!}}$

3. **Overlapping Priority Verification**:
   * Stack Guard (Region 2) sits inside SRAM (Region 1).
   * Region 2 ($R_2$) has a higher region index number than Region 1 ($R_1$).
   * Under the Higher-Region Index Priority Invariant, Region 2's `AP = 3'b000` (No Access) overrides Region 1's `AP = 3'b011` (Read-Write) for addresses `0x2000_1F00` to `0x2000_1FFF`, guaranteeing $100\%$ stack overflow hardware interception!

All MPU power-of-two size encodings, base address alignment checks, access permission bitfield maps, region priority overlap rules, and assembly configuration routines evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Memory Protection Unit (MPU / PMP)**: A core-coupled hardware security module that monitors every memory access generated by the CPU execution pipeline in $0\text{ clock cycles}$, enforcing programmable region base addresses, power-of-two alignment rules ($ADDR \pmod S == 0$), access permissions (`AP`), and Execute-Never (`XN`) execution limits.
* **Stack Guard Region**: A dedicated, low-level MPU memory region (configured with `AP = 3'b000` No-Access permissions) positioned at the lower boundary of the stack memory space that intercepts stack overflow attempts in hardware, triggering a `MemManage` fault before global variables can be overwritten.
* **Execute-Never (`XN`) Region**: An MPU region attribute (`XN = 1` in `MPU_RASR`) that prevents the CPU instruction fetch unit from fetching opcodes out of SRAM or MMIO memory spaces, blocking code-injection attacks and wild branches into data buffers.