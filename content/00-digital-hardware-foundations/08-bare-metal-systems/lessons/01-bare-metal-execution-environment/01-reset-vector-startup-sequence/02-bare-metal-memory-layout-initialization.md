content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/01-bare-metal-execution-environment/01-reset-vector-startup-sequence/02-bare-metal-memory-layout-initialization.md
# Bare-Metal Memory Layout Initialization and Unrolled Startup Loops

## The Volatile Memory Garbage Crisis at Power-On Reset

When a silicon microchip powers up, electrical energy rushes into its internal memory structures. Physical Non-Volatile Flash memory (ROM) retains its programmed contents across power cycles because its floating-gate transistors store static electrical charges permanently. However, internal Static Random-Access Memory (SRAM) is volatile. 

During the initial millisecond of power-on reset, as the chip's internal power rails ramp up to their stable operating voltage, the bistable cross-coupled transistor pairs that form every SRAM memory cell settle into unpredictable, random electrical states. 

Some SRAM cells flip to a logical $1$, while neighboring cells flip to a logical $0$. As a result, the entire physical SRAM array becomes populated with random, un-deterministic voltage noise—a chaotic landscape of digital garbage.

```text
PHYSICAL SRAM STATE AT THE EXACT INSTANT OF POWER-ON RESET

 Non-Volatile Flash ROM (Firmware Code & Initial Values Preserved)
 ┌───────────────────────────────────────────────────────────┐
 │ Address 0x0800_1000 : 0x0000_002A  (Constant Value 42)    │
 └───────────────────────────────────────────────────────────┘

 Volatile Internal SRAM Array (Power-On Voltage Noise)
 ┌───────────────────────────────────────────────────────────┐
 │ Address 0x2000_0000 : 0xA57F_3B12  (Random Garbage!)      │
 │ Address 0x2000_0004 : 0x00FF_C389  (Random Garbage!)      │
 └───────────────────────────────────────────────────────────┘
 (SRAM contains un-deterministic voltage noise before initialization!)
```

Now, consider what happens when a software programmer compiles a bare-metal program containing global variables:

```c
/* GLOBAL VARIABLE DECLARATIONS IN SOFTWARE CODE */
uint32_t sensor_threshold = 42;  /* Initialized Global Variable (.data) */
uint32_t error_counter;          /* Un-initialized Global Variable (.bss) */
```

When this code is compiled, the software developer expects two non-negotiable execution invariants to hold true before the `main()` function begins:
1. **The Initialized Variable Contract**: Reading `sensor_threshold` must return its initial compiled value of **`42`** (`0x0000_002A`).
2. **The Zero-Initialized Variable Contract**: Reading `error_counter` must return exactly **`0`** (`0x0000_0000`).

However, inside the physical microchip, variables cannot be read directly from Flash ROM during program execution if those variables need to be modified later. 

Flash memory requires slow, multi-cycle erase and programming operations that cannot execute at CPU speed, whereas SRAM allows single-cycle reads and writes. Therefore, all global and static variables **must reside inside physical SRAM during program execution**.

If the CPU jumps directly to program execution without preparing its memory sections first:
* Reading `sensor_threshold` from its SRAM memory location returns random garbage (such as `0xA57F_3B12`) instead of `42`! The application executes incorrect control decisions, triggering catastrophic system failures.
* Reading `error_counter` from its SRAM location returns random garbage (such as `0x00FF_C389`) instead of `0`! The application assumes hundreds of system errors occurred before the chip even booted up!

A silicon processor cannot automatically guess which parts of its volatile SRAM memory should hold initial values from Flash and which parts should be cleared to zero!

To establish a valid, deterministic execution environment, the bare-metal assembly startup routine must execute an explicit **Memory Layout Initialization Phase** before handing control over to high-level application code. 

By executing a **`.data` Section ROM-to-RAM Copy** and a **`.bss` Section Zero-Initialization**, supported by **Word-Aligned Unrolled Copy Loops**, the bare-metal startup assembly transforms a noisy, chaotic SRAM array into a pristine, predictable software execution environment.

---

## The Hotel Room Sweep: A Mental Model for Memory Section Startup

To build an intuitive, crystal-clear mental model of memory section initialization before inspecting linker script symbols and assembly loop mechanics, let us consider an everyday analogy: **Preparing a Hotel Suite for a New Guest**.

Imagine you run an exclusive hotel (**Main System SRAM Memory**). A guest (**A High-Level Application Program**) is scheduled to check into Suite 200 (**The Executable RAM Space**) at 12:00 PM (**Application Entry Point `main()`**).

```text
THE HOTEL SUITE PREPARATION METAPHOR

 Un-cleaned Hotel Suite (Power-On SRAM Array)
 ┌───────────────────────────────────────────────────────────┐
 │ Drawer 1: Trash left by previous guest (Garbage Voltage)  │
 │ Drawer 2: Old papers left behind       (Garbage Voltage)  │
 └───────────────────────────────────────────────────────────┘
                               ▲
                               │
 Delivery Truck at Loading Dock (Non-Volatile Flash ROM)
 ┌───────────────────────────────────────────────────────────┐
 │ Pre-Packed Welcome Basket : Fruit, Water, Keycard (42)     │
 └───────────────────────────────────────────────────────────┘
```

When you inspect Suite 200 at 11:00 AM (**Power-On Reset**), you find the suite in an un-cleaned, chaotic state:
* The desk drawers are filled with trash left behind by the previous occupant (**Random SRAM Power-On Voltage Noise**).

The guest expects two specific arrangements upon arrival:
1. **Pre-Packed Amenities (`.data` Section)**: The guest ordered a welcome basket containing fresh fruit, bottled water, and a keycard stamped with code **42** (`sensor_threshold = 42`). This basket is currently sitting inside a delivery truck parked at the hotel loading dock (**Non-Volatile Flash ROM**).
2. **Clean Empty Drawers (`.bss` Section)**: All remaining drawers in the desk (`error_counter`) must be completely empty and swept clean of all trash (**Zero-Initialized Memory**), ready for the guest to store their clothes.

If you open the suite door for the guest at 12:00 PM without cleaning the room:
* The guest reaches into the welcome basket drawer and finds old trash instead of their keycard (`42`)!
* The guest opens a desk drawer expecting an empty space and finds old garbage instead of a clean drawer!

#### The Two-Step Cleaning Protocol

To prepare the suite properly, the head housekeeper (**The Bare-Metal Assembly Startup Loop**) executes a strict two-step protocol before 12:00 PM:

```text
THE TWO-STEP HOTEL CLEANING PROTOCOL

 Step 1: Unpack Welcome Basket from Loading Dock (.data ROM-to-RAM Copy)
 Delivery Truck (Flash ROM LMA) ──► Unpack Items ──► Desk Drawer 1 (SRAM VMA)
 (Copies pre-initialized values like '42' into their active RAM drawers!)

 Step 2: Sweep All Remaining Drawers (.bss Zero-Initialization)
 Broom Sweep ──► Erase Trash ──► Desk Drawer 2 (Set to 0000)
 (Sweeps all empty variable drawers until they contain 100% zero trash!)
```

1. **Step 1 — Unpack Pre-Packed Items (`.data` ROM-to-RAM Copy)**:
   The housekeeper walks out to the delivery truck at the loading dock (**Flash ROM**), picks up the pre-packed welcome basket (`sensor_threshold = 42`), carries it into Suite 200 (**SRAM**), and places the items neatly into Desk Drawer 1 (**`.data` Section RAM Address**).
2. **Step 2 — Sweep Remaining Drawers (`.bss` Zero-Initialization)**:
   The housekeeper takes a broom (**A Zero-Filling Assembly Register `r0 = 0`**) and sweeps every remaining empty drawer in Suite 200 until all old trash is removed and every drawer contains exactly **zero debris** (`error_counter = 0`).

#### The Unrolled Broom Sweep (Word-Aligned Unrolling)

If the housekeeper sweeps the large room using a tiny $1\text{-inch}$ paintbrush (**Byte-by-Byte Memory Transfers**), cleaning the suite takes 4 hours! 

To speed up the cleaning process, the housekeeper switches to a **wide $4\text{-foot}$ industrial push-broom (**32-bit / 4-byte Word Transfers**) and pushes the broom with long, continuous strokes sweeping 4 drawers at once (**4x Unrolled Copy Loop**)!

The room is cleaned in 15 minutes instead of 4 hours!

When the guest opens the suite door at 12:00 PM:
* The welcome keycard (`42`) sits perfectly inside Desk Drawer 1.
* Every other drawer is completely clean (`0`).
* The guest begins their stay with $100\%$ perfection!

This hotel cleaning protocol is the exact physical analogue of **Bare-Metal Memory Layout Initialization**:
* The hotel suite is **Physical System SRAM Memory**.
* The delivery truck at the dock is **Non-Volatile Flash ROM**.
* The welcome basket is the **Initialized `.data` Section**.
* Un-packed empty drawers are the **Zero-Initialized `.bss` Section**.
* The head housekeeper is the **Bare-Metal Assembly Startup Loop**.
* The wide industrial push-broom is **Word-Aligned 32-bit Memory Transfers**.
* Sweeping 4 drawers at once is **Word-Aligned Loop Unrolling**.

---

## The Anatomy of Executable Memory Sections and Linker Symbols

To understand how bare-metal assembly startup routines copy initialized data and clear un-initialized variables, we must first examine how compilers and linkers partition executable programs into **Memory Sections** and define **Linker Symbols**.

When an assembly or C program is compiled, the compiler divides the program's instructions and data into standardized binary blocks called **Sections**.

```text
COMPILER AND LINKER MEMORY SECTION CLASSIFICATION

 Program Source Code Elements                 Target Memory Sections
 ┌─────────────────────────────────┐          ┌─────────────────────────────────┐
 │ Executable Instructions (code)  ├─────────►│ .text Section (Read-Only Flash) │
 ├─────────────────────────────────┤          ├─────────────────────────────────┤
 │ Constants / Read-Only Variables ├─────────►│ .rodata Section (Flash ROM)     │
 ├─────────────────────────────────┤          ├─────────────────────────────────┤
 │ Initialized Global Variables    ├─────────►│ .data Section (RAM VMA / ROM LMA│
 ├─────────────────────────────────┤          ├─────────────────────────────────┤
 │ Un-initialized Global Variables ├─────────►│ .bss Section (RAM VMA Only!)    │
 └─────────────────────────────────┘          └─────────────────────────────────┘
```

---

### The Four Core Memory Sections

#### 1. The `.text` Section (Executable Program Code)
* **Contents**: The binary machine instructions executed by the CPU pipeline (such as `ADD`, `SUB`, `LDR`, `STR`, `BNE`).
* **Memory Placement**: Stored permanently in non-volatile Flash ROM memory starting at address `0x0800_0000` (or aliased boot address `0x0000_0000`).
* **Execution Property**: Read-Only and Executable (`RX`).

#### 2. The `.rodata` Section (Read-Only Data)
* **Contents**: Constant variables (`const uint32_t MAX_LIMIT = 100;`), lookup tables, and string literals.
* **Memory Placement**: Stored permanently in non-volatile Flash ROM immediately following the `.text` section.
* **Execution Property**: Read-Only (`R`).

#### 3. The `.data` Section (Initialized Read-Write Variables)
* **Contents**: Global and static variables that are assigned explicit initial values in software source code:
  ```c
  uint32_t sensor_threshold = 42;
  uint8_t status_flags = 0xA5;
  ```
* **Dual-Address Memory Property (LMA vs VMA)**:
  Because `.data` variables must be **readable and writable** during program execution, they must reside in volatile SRAM memory. However, because SRAM loses its contents when power is turned off, their initial values (`42`, `0xA5`) must be stored permanently in non-volatile Flash ROM!
  
  Therefore, the `.data` section possesses two distinct memory addresses assigned by the linker:
  * **Load Memory Address (LMA)**: The physical address in **Flash ROM** where the initial binary bytes are stored permanently (`_sidata`).
  * **Virtual Memory Address (VMA)**: The physical address in **SRAM** where the variables will reside during execution (`_sdata` to `_edata`).

#### 4. The `.bss` Section (Un-Initialized / Zero-Initialized Variables)
* **Contents**: Global and static variables that are **not** assigned explicit initial values in software source code:
  ```c
  uint32_t error_counter;   /* Must be initialized to 0 at boot! */
  uint8_t rx_buffer[1024];  /* Must be initialized to 0 at boot! */
  ```
* **Flash Space Optimization**:
  Historical Trivia: The name `.bss` originates from an early 1950s assembly operator called **"Block Started by Symbol"**.
  
  Because all variables in `.bss` are defined to start at zero ($0x0000_0000$), **the `.bss` section occupies ZERO bytes of Flash ROM space**!
  
  If an application declares a $1\text{-Megabyte}$ global buffer array (`uint8_t big_buffer[1024*1024];`), storing 1 MB of zeros in Flash ROM would waste $1\text{ Megabyte}$ of expensive Flash storage. Instead, the linker records only the *size* of `.bss` ($1\text{ MB}$) in metadata, and relies on the bare-metal assembly startup loop to clear $1\text{ Megabyte}$ of SRAM to zero during boot-up!

---

### Linker Script Symbols: The Map of Physical Memory

How does the assembly startup routine know where the `.data` section begins in Flash ROM, where it should be copied in SRAM, and where the `.bss` section starts and ends?

The operating system or bare-metal build pipeline provides a **Linker Script (`.ld`)**. The linker script calculates the exact physical byte boundaries during build time and exports these boundaries as **Linker Symbols**:

```text
LINKER SCRIPT SYMBOL MEMORY MAP MAPPER

 Non-Volatile Flash ROM Memory Map
 Base: 0x0800_0000
 ┌───────────────────────────────────────────────────────────┐
 │ .text Section (Program Machine Instructions)              │
 ├───────────────────────────────────────────────────────────┤
 │ .rodata Section (Constants & String Literals)             │
 ├───────────────────────────────────────────────────────────┤ ◄── Symbol: _sidata
 │ .data Initial Values Image (LMA - Load Memory Address)    │ (Source address in Flash)
 └───────────────────────────────────────────────────────────┘

 Volatile System SRAM Memory Map
 Base: 0x2000_0000
 ┌───────────────────────────────────────────────────────────┐ ◄── Symbol: _sdata
 │ .data Section Active Variables (VMA - Virtual Memory Addr)│ (Destination start in RAM)
 ├───────────────────────────────────────────────────────────┤ ◄── Symbol: _edata
 │ .bss Section Un-initialized Variables (VMA)               │ (Destination end in RAM)
 │                                                           │     (And _sbss start in RAM)
 ├───────────────────────────────────────────────────────────┤ ◄── Symbol: _ebss
 │ Heap & Stack Memory Allocation Space                      │ (Destination end in RAM)
 └───────────────────────────────────────────────────────────┘
```

Let us examine the five mandatory linker symbols exported to the bare-metal assembly startup module:

```text
MANDATORY BARE-METAL LINKER SCRIPT SYMBOLS

 Symbol Name │ Memory Domain │ Physical Meaning & Usage in Startup Assembly
─────────────┼───────────────┼─────────────────────────────────────────────────────────────
  _sidata    │  Flash ROM    │ Start address of .data initial values image in Flash (LMA).
  _sdata     │  SRAM RAM     │ Start address of .data section active region in RAM (VMA).
  _edata     │  SRAM RAM     │ End address of .data section active region in RAM (VMA).
  _sbss      │  SRAM RAM     │ Start address of .bss section zero-fill region in RAM (VMA).
  _ebss      │  SRAM RAM     │ End address of .bss section zero-fill region in RAM (VMA).
```

#### Crucial Conceptual Distinction: Linker Symbols ARE Addresses!

In high-level C code, a variable represents a memory location that holds a value. 

In Linker Scripts and Assembly, **a Linker Symbol IS the address itself**!

When you reference `_sidata` in assembly:
* You are **not** reading a variable stored in memory.
* `_sidata` **is** the 32-bit physical address number generated by the linker during build time!

In ARM Assembly, you load the physical address represented by a linker symbol into a register using the pseudo-instruction `ldr`:

```assembly
/* LOADING LINKER SYMBOL ADDRESSES INTO ASSEMBLY REGISTERS */
ldr r0, =_sidata    /* r0 <= Physical LMA Address of .data in Flash (e.g., 0x0800_1000) */
ldr r1, =_sdata     /* r1 <= Physical VMA Start Address of .data in RAM (e.g., 0x2000_0000) */
ldr r2, =_edata     /* r2 <= Physical VMA End Address of .data in RAM   (e.g., 0x2000_0200) */
```

---

## Deep Mechanics of `.data` Copying and `.bss` Zeroing

Now that we understand memory sections and linker symbols, let us examine the formal, step-by-step engineering mechanics of the **`.data` Section ROM-to-RAM Copy** and **`.bss` Section Zero-Initialization**.

---

### Step 1: The `.data` Section ROM-to-RAM Copy Algorithm

To copy the initialized variable payload from non-volatile Flash ROM into volatile SRAM, the bare-metal assembly startup routine executes a memory transfer loop across three pointer registers:

$$\text{Source Read Pointer } (r_0) = \text{\_sidata} \quad (\text{Flash LMA})$$

$$\text{Destination Write Pointer } (r_1) = \text{\_sdata} \quad (\text{SRAM VMA Start})$$

$$\text{Destination End Boundary } (r_2) = \text{\_edata} \quad (\text{SRAM VMA End})$$

```text
.DATA ROM-TO-RAM COPY POINTER MECHANICS

 Flash ROM Address: _sidata (0x0800_1000)
 ┌───────────────────────────────────────────────────────────┐
 │ [ Word 0 (42) ] │ [ Word 1 (0xA5) ] │ ...                │
 └────────┬──────────────────────────────────────────────────┘
          │
          │ Assembly Read Loop: LDR r3, [r0], #4
          ▼
 System SRAM Address: _sdata (0x2000_0000) to _edata (0x2000_0200)
 ┌───────────────────────────────────────────────────────────┐
 │ [ Word 0 (42) ] │ [ Word 1 (0xA5) ] │ ...                │
 └───────────────────────────────────────────────────────────┘
   Assembly Write Loop: STR r3, [r1], #4
```

#### The Basic Un-Optimized Copy Loop (Word-by-Word)

In 32-bit ARM Assembly, a basic word-by-word copy loop processes memory in 4-byte ($32\text{-bit}$) increments:

```assembly
/* BASIC WORD-BY-WORD .DATA COPY LOOP IN ASSEMBLY */
    ldr     r0, =_sidata        /* r0 = Source address in Flash ROM (LMA) */
    ldr     r1, =_sdata         /* r1 = Destination start in SRAM (VMA) */
    ldr     r2, =_edata         /* r2 = Destination end in SRAM (VMA) */

copy_data_loop:
    cmp     r1, r2              /* Have we reached the end of .data in SRAM? (r1 == r2?) */
    bge     copy_data_done      /* If r1 >= r2, branch out of loop! */
    
    ldr     r3, [r0], #4        /* Load 32-bit word from Flash [r0], then r0 = r0 + 4 */
    str     r3, [r1], #4        /* Store 32-bit word to SRAM [r1], then r1 = r1 + 4 */
    b       copy_data_loop      /* Repeat loop! */

copy_data_done:
    /* .data section is now 100% initialized in SRAM! */
```

#### Dissecting the Assembly Opcodes:
* `ldr r3, [r0], #4` (**Load Register with Post-Increment**):
  1. Reads a 32-bit word from Flash memory at address `r0` and stores it into register `r3`.
  2. Automatically increments register `r0` by $4\text{ bytes}$ ($32\text{ bits}$): $r_0 \Leftarrow r_0 + 4$.
* `str r3, [r1], #4` (**Store Register with Post-Increment**):
  1. Writes the 32-bit word from register `r3` into SRAM memory at address `r1`.
  2. Automatically increments register `r1` by $4\text{ bytes}$: $r_1 \Leftarrow r_1 + 4$.
* `cmp r1, r2` & `bge copy_data_done`:
  Compares destination pointer `r1` against end boundary `r2`. When `r1 == r2`, all bytes have been copied!

---

### Step 2: The `.bss` Section Zero-Initialization Algorithm

Once the `.data` section is safely copied to SRAM, the bare-metal assembly startup routine immediately transitions to zero-initializing the `.bss` section.

$$\text{Zero Value Source Register } (r_0) = \text{0x0000\_0000}$$

$$\text{Destination Write Pointer } (r_1) = \text{\_sbss} \quad (\text{SRAM VMA Start})$$

$$\text{Destination End Boundary } (r_2) = \text{\_ebss} \quad (\text{SRAM VMA End})$$

```text
.BSS ZERO-INITIALIZATION POINTER MECHANICS

 Register r0 = 0x0000_0000 (Constant Zero Source)
       │
       ▼ Assembly Write Loop: STR r0, [r1], #4
 System SRAM Address: _sbss (0x2000_0200) to _ebss (0x2000_0600)
 ┌───────────────────────────────────────────────────────────┐
 │ [ 0x0000_0000 ] │ [ 0x0000_0000 ] │ [ 0x0000_0000 ] ...   │
 └───────────────────────────────────────────────────────────┘
  (Overwrites power-on voltage noise with 100% clean zeros!)
```

#### The Basic Un-Optimized Zero Loop (Word-by-Word)

```assembly
/* BASIC WORD-BY-WORD .BSS ZEROING LOOP IN ASSEMBLY */
    movs    r0, #0              /* r0 = 0x0000_0000 (Constant zero register) */
    ldr     r1, =_sbss          /* r1 = Destination start of .bss in SRAM */
    ldr     r2, =_ebss          /* r2 = Destination end of .bss in SRAM */

zero_bss_loop:
    cmp     r1, r2              /* Have we reached the end of .bss in SRAM? (r1 == r2?) */
    bge     zero_bss_done       /* If r1 >= r2, branch out of loop! */
    
    str     r0, [r1], #4        /* Store 0x0000_0000 to SRAM [r1], then r1 = r1 + 4 */
    b       zero_bss_loop       /* Repeat loop! */

zero_bss_done:
    /* .bss section is now 100% zero-initialized in SRAM! */
```

#### Dissecting the Assembly Opcodes:
* `movs r0, #0`: Loads constant zero (`0x0000_0000`) into register `r0`.
* `str r0, [r1], #4`: Writes `0x0000_0000` to SRAM at address `r1`, overwriting whatever power-on voltage noise existed at that location, and increments `r1` by $4\text{ bytes}$.

---

## Word-Aligned Loop Unrolling and Bus Bandwidth Saturation

Why is executing a basic word-by-word copy loop considered sub-optimal in high-performance bare-metal engineering?

To understand why, we must analyze the **Instruction-to-Payload Ratio** of a basic loop.

In the basic word-by-word copy loop shown above:
To transfer **$1\text{ single 32-bit word}$ ($4\text{ bytes}$)** of data, the CPU pipeline executes **4 separate instructions**:
1. `cmp r1, r2` (Branch condition check)
2. `bge copy_data_done` (Conditional branch execution)
3. `ldr r3, [r0], #4` (Actual $4\text{-byte}$ data read)
4. `str r3, [r1], #4` (Actual $4\text{-byte}$ data write)

$$\text{Instruction Overhead Ratio} = \frac{4 \text{ Instructions Executed}}{1 \text{ Data Word Transferred}} = \mathbf{4 \text{ Instructions per Word!}}$$

Out of 4 instructions executed by the CPU pipeline, **2 instructions ($50\%$) are loop control overhead (`cmp` and `bne`)**! 

The CPU pipeline spends half its time checking branch conditions rather than moving memory bytes!

---

### The Power of Word-Aligned Loop Unrolling (4x Unrolling)

To eliminate loop control overhead and saturate the $32\text{-bit}$ memory bus, bare-metal engineers apply **Word-Aligned Loop Unrolling**.

In a **4x Unrolled Copy Loop**, the loop body is expanded to copy **4 words ($16\text{ bytes}$)** per loop iteration using multi-register load/store instructions (`ldmia` / `stmia` or multiple `LDR`/`STR` instructions):

```text
BASIC LOOP VS. 4X UNROLLED LOOP PIPELINE COMPARISON

 Basic 1x Loop (Transfers 16 Bytes in 4 Iterations):
 Iter 1 : [CMP][BGE][LDR][STR]
 Iter 2 : [CMP][BGE][LDR][STR]
 Iter 3 : [CMP][BGE][LDR][STR]
 Iter 4 : [CMP][BGE][LDR][STR]  ──► Total: 16 Instructions Executed!

 4x Unrolled Loop (Transfers 16 Bytes in 1 Iteration):
 Iter 1 : [CMP][BGE][LDR][LDR][LDR][LDR][STR][STR][STR][STR]
                                ──► Total: 10 Instructions Executed!
 (37.5% Reduction in Instruction Count! 4x Fewer Branch Delays!)
```

Let's examine the 4x unrolled `.data` copy loop in ARM Assembly:

```assembly
/* HIGH-PERFORMANCE 4X UNROLLED .DATA COPY LOOP IN ASSEMBLY */
    ldr     r0, =_sidata        /* r0 = Flash LMA Start */
    ldr     r1, =_sdata         /* r1 = SRAM VMA Start */
    ldr     r2, =_edata         /* r2 = SRAM VMA End */

    /* Calculate remaining words to check if unrolling is possible */
    sub     r3, r2, r1          /* r3 = Total bytes in .data (_edata - _sdata) */
    lsrs    r3, r3, #4          /* r3 = Number of 16-byte (4-word) blocks (r3 / 16) */
    beq     copy_data_bytes     /* If less than 16 bytes, jump to tail cleanup! */

copy_data_unrolled_loop:
    ldr     r4, [r0], #4        /* Load Word 0 from Flash */
    ldr     r5, [r0], #4        /* Load Word 1 from Flash */
    ldr     r6, [r0], #4        /* Load Word 2 from Flash */
    ldr     r7, [r0], #4        /* Load Word 3 from Flash */

    str     r4, [r1], #4        /* Store Word 0 to SRAM */
    str     r5, [r1], #4        /* Store Word 1 to SRAM */
    str     r6, [r1], #4        /* Store Word 2 to SRAM */
    str     r7, [r1], #4        /* Store Word 3 to SRAM */

    subs    r3, r3, #1          /* Decrement block counter */
    bne     copy_data_unrolled_loop /* Loop until all 16-byte blocks are copied! */

copy_data_bytes:
    /* Tail Cleanup Loop for Remaining 1..15 Bytes (Handling Misalignments) */
    cmp     r1, r2
    bge     copy_data_unrolled_done
    
    ldr     r4, [r0], #4
    str     r4, [r1], #4
    b       copy_data_bytes

copy_data_unrolled_done:
    /* .data Section Copy Complete! */
```

---

### Mathematical Proof of Cycle Savings via 4x Unrolling

Let us derive the exact CPU clock cycle savings achieved by 4x loop unrolling.

Suppose we need to copy a `.data` section containing $N_{\text{words}} = 256\text{ words}$ ($1,024\text{ bytes}$) on a processor where:
* `LDR` / `STR` instructions execute in $1\text{ clock cycle}$ each.
* `ADDS` / `SUBS` / `CMP` instructions execute in $1\text{ clock cycle}$.
* `BNE` branch instructions execute in $1\text{ cycle}$ when not taken, and $3\text{ cycles}$ when taken (branch penalty).

#### 1. Cycle Consumption for Basic 1x Loop:
Per word iteration (4 cycles):
* `cmp r1, r2` = 1 cycle
* `bge` = 1 cycle (not taken)
* `ldr r3, [r0], #4` = 1 cycle
* `str r3, [r1], #4` = 1 cycle
* `b copy_data_loop` = 3 cycles (branch taken penalty)
* **Total Cycles per Word** $= 1 + 1 + 1 + 1 + 3 = \mathbf{7 \text{ Clock Cycles per Word}}$

$$\text{Total Cycles (Basic 1x Loop)} = 256 \text{ words} \times 7 \text{ cycles/word} = \mathbf{1,792 \text{ Clock Cycles}}$$

#### 2. Cycle Consumption for 4x Unrolled Loop:
Per 16-byte block iteration (4 words = 16 bytes):
* `ldr r4..r7` (4 words) $= 4 \times 1 = 4\text{ cycles}$
* `str r4..r7` (4 words) $= 4 \times 1 = 4\text{ cycles}$
* `subs r3, r3, #1` $= 1\text{ cycle}$
* `bne` $= 3\text{ cycles}$ (branch taken)
* **Total Cycles per 16-Byte Block** $= 4 + 4 + 1 + 3 = \mathbf{12 \text{ Clock Cycles per 4 Words}}$

$$\text{Average Cycles per Word (4x Unrolled)} = \frac{12 \text{ cycles}}{4 \text{ words}} = \mathbf{3.0 \text{ Clock Cycles per Word}}$$

Number of 16-byte iterations $= \frac{256}{4} = 64\text{ iterations}$.

$$\text{Total Cycles (4x Unrolled Loop)} = 64 \text{ iterations} \times 12 \text{ cycles/iter} = \mathbf{768 \text{ Clock Cycles}}$$

```text
LOOP EFFICIENCY PERFORMANCE COMPARISON

 Metric                     │ Basic 1x Copy Loop   │ 4x Unrolled Copy Loop │ Performance Gain
────────────────────────────┼──────────────────────┼───────────────────────┼──────────────────
 Cycles per Word            │ 7.0 Clock Cycles     │ 3.0 Clock Cycles      │ 57.1% Faster!
 Total Cycles (1024 Bytes)  │ 1,792 Clock Cycles   │ 768 Clock Cycles      │ 1,024 Cycles Saved
 Bus Utilization %          │ 28.6% (2/7 Cycles)   │ 66.7% (8/12 Cycles)   │ 2.33x Throughput
```

$$\text{Speedup Factor} = \frac{\text{Cycles}_{\text{Basic}}}{\text{Cycles}_{\text{Unrolled}}} = \frac{1,792}{768} \approx \mathbf{2.333\times \text{ Performance Speedup!}}$$

By applying 4x loop unrolling, the bare-metal assembly startup routine executes **$2.333\times$ faster ($57.1\%$ reduction in startup time)**, saturating the physical memory bus and accelerating system boot-up!

---

## Tail Cleanup Loops and Un-Aligned Boundary Handling

In real-world software engineering, the total size of the `.data` or `.bss` section is determined by whatever global variables the application programmer declared.

What happens if the total size of the `.data` section is **not an exact multiple of 16 bytes** (for 4x unrolling) or **not an exact multiple of 4 bytes** (for 32-bit word transfers)?

For example, suppose an application declares three global variables:
```c
uint32_t threshold = 42;  /* 4 Bytes */
uint16_t status = 0xA5;    /* 2 Bytes */
uint8_t flag = 1;          /* 1 Byte  */
/* Total .data size = 4 + 2 + 1 = 7 Bytes! */
```

If an assembly unrolled loop blindly assumes every `.data` section is a multiple of 16 bytes and executes two 16-byte copy iterations ($32\text{ bytes}$ total), **it will write $25\text{ bytes}$ of garbage past the end of `.data`**, overwriting adjacent `.bss` variables or stack memory!

To handle arbitrary section lengths with mathematical precision, bare-metal assembly startup modules use a **Two-Tiered Loop Architecture**:
1. **The Primary Unrolled Block Loop**: Copies $16\text{-byte}$ (4-word) blocks for as long as possible ($\lfloor \text{Size} / 16 \rfloor$ iterations).
2. **The Secondary Tail Cleanup Loop**: Copies any remaining $1 \dots 15\text{ bytes}$ byte-by-byte or word-by-word to finish the section safely!

```text
TWO-TIERED LOOP ARCHITECTURE WITH TAIL CLEANUP

 Total .data Section Size = 38 Bytes (0x2000_0000 to 0x2000_0026)
 ┌───────────────────────────────────────────────────────────┐
 │ Block 0 (16 Bytes) │ Block 1 (16 Bytes) │ Tail (6 Bytes)  │
 └─────────┬──────────────────┬──────────────────┬───────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    4x Unrolled Loop   4x Unrolled Loop   Tail Cleanup Loop
    (Iter 1: 16 Bytes) (Iter 2: 16 Bytes) (Byte-by-Byte Loop)
```

---

## Real-World Silicon Failures, Misalignments, and Flash Latency Stalls

In commercial embedded systems engineering, memory initialization code must account for physical hardware realities such as memory alignment constraints and Flash ROM access wait-states.

---

### 1. The Un-Aligned Word Access Hardware Fault

On many 32-bit CPU architectures (such as ARM Cortex-M0 or older MIPS architectures), executing a 32-bit word load (`LDR`) or store (`STR`) instruction targeting an address that is **not a multiple of 4** ($ADDR \pmod 4 \neq 0$) triggers a hardware **Alignment Fault Exception (`UsageFault`)**!

Suppose a poorly written linker script defines section boundaries on odd byte addresses:
```ld
/* BAD LINKER SCRIPT (UN-ALIGNED SECTION BOUNDARIES!) */
_sdata = 0x20000001; /* Odd byte address! Not 4-byte aligned! */
```

When the assembly startup loop executes `ldr r4, [r0], #4` targeting `0x2000_0001`:
* The memory bus controller detects an un-aligned 32-bit access attempt.
* The CPU hardware triggers an immediate `UsageFault` or `HardFault` exception, crashing the microchip on the second clock cycle of boot-up!

#### The Hardware Fix (`.balign 4` / `ALIGN(4)`):
To prevent un-aligned memory faults, linker scripts and assembly files **MUST enforce 4-byte or 8-byte section alignment** using alignment directives:

```ld
/* PRODUCTION LINKER SCRIPT WITH STRICT 4-BYTE ALIGNMENT */
.data : ALIGN(4)
{
    _sdata = .;         /* Mark VMA start of .data (Guaranteed 4-byte aligned!) */
    *(.data*)
    . = ALIGN(4);       /* Force end of .data to 4-byte boundary */
    _edata = .;         /* Mark VMA end of .data */
} > RAM AT > FLASH
```

---

### 2. Flash Wait-States and Read-Ahead Buffers

When a CPU operates at a high clock frequency (such as $3.2\text{ GHz}$ or $160\text{ MHz}$), physical Flash ROM memory cells cannot respond in a single clock cycle. Reading a byte from Flash ROM requires **Flash Wait-States** ($N_{\text{wait\_states}} \approx 3 \text{ to } 5\text{ clock cycles}$).

During the `.data` ROM-to-RAM copy loop:
* Every `LDR` instruction reading from Flash ROM (`_sidata`) pays a $5\text{-cycle}$ Flash latency penalty!
* The CPU pipeline stalls waiting for the Flash memory controller to drive data onto the internal bus.

#### Hardware Mitigation: Enabling Flash Prefetch and Instruction Caches

Before executing the `.data` copy loop in assembly, high-performance startup routines **enable the Flash Prefetch Buffer and Instruction Cache (I-Cache)** inside the Flash Memory Controller MMIO registers:

```assembly
/* ENABLNG FLASH PREFETCH & LATENCY CYCLES BEFORE COPY LOOP */
    ldr     r0, =FLASH_ACR      /* r0 = Flash Access Control Register MMIO Address */
    ldr     r1, [r0]            /* Read current FLASH_ACR value */
    orr     r1, r1, #(1 << 8)   /* Set PRFTEN bit (Enable Prefetch Buffer) */
    orr     r1, r1, #(1 << 9)   /* Set ICEN bit   (Enable Instruction Cache) */
    str     r1, [r0]            /* Write updated FLASH_ACR back */
    
    /* Flash reads now execute 4x faster! Proceed to .data copy loop! */
```

---

## Solved Industrial Engineering Exercise: Quantitative Memory Initialization, Unrolled Loop Clock Cycle Analysis, and Assembly Synthesis

To consolidate your complete mastery of memory layout initialization, linker script symbol arithmetic, word-aligned loop unrolling, and assembly startup synthesis, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior bare-metal systems engineer writing the production assembly startup module for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

```text
3.2 GZ BARE-METAL SERVER MANAGEMENT CONTROLLER MEMORY MAP

 Non-Volatile Flash ROM (Base: 0x0800_0000)
 ┌───────────────────────────────────────────────────────────┐
 │ .text & .rodata Sections                                  │
 ├───────────────────────────────────────────────────────────┤ ◄── _sidata = 0x0800_1000
 │ .data Initial Values Image (Size = 512 Bytes)              │ (Flash LMA Start)
 └───────────────────────────────────────────────────────────┘

 Volatile System SRAM (Base: 0x2000_0000)
 ┌───────────────────────────────────────────────────────────┐ ◄── _sdata = 0x2000_0000
 │ .data Active Section (VMA Size = 512 Bytes)               │ (SRAM VMA Start)
 ├───────────────────────────────────────────────────────────┤ ◄── _edata = 0x2000_0200
 │ .bss Un-initialized Section (VMA Size = 1,024 Bytes)      │ (SRAM VMA End / _sbss Start)
 ├───────────────────────────────────────────────────────────┤ ◄── _ebss  = 0x2000_0600
 │ Stack Memory Space                                        │ (SRAM VMA End of .bss)
 └───────────────────────────────────────────────────────────┘
```

#### Linker Script Symbol Address Assignments:
* `_sidata` (Flash LMA Start of `.data`) = `0x0800_1000`
* `_sdata`  (SRAM VMA Start of `.data`) = `0x2000_0000`
* `_edata`  (SRAM VMA End of `.data`)   = `0x2000_0200` ($\text{Size}_{\text{data}} = 512\text{ Bytes} = 128\text{ Words}$)
* `_sbss`   (SRAM VMA Start of `.bss`)  = `0x2000_0200`
* `_ebss`   (SRAM VMA End of `.bss`)    = `0x2000_0600` ($\text{Size}_{\text{bss}} = 1,024\text{ Bytes} = 256\text{ Words}$)

#### Execution Pipeline Instruction Latency Specifications:
* `LDR` / `STR` (Single 32-bit Word Transfer) = $1\text{ CPU Clock Cycle}$ ($0.3125\text{ ns}$).
* `LDRB` / `STRB` (Single 8-bit Byte Transfer) = $1\text{ CPU Clock Cycle}$ ($0.3125\text{ ns}$).
* `LDMIA` / `STMIA` (Multi-Register 4-Word Transfer) = $4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* `ADDS` / `SUBS` / `CMP` (Arithmetic / Comparison) = $1\text{ CPU Clock Cycle}$ ($0.3125\text{ ns}$).
* `BNE` / `BGE` (Conditional Branch) = $1\text{ Cycle}$ when not taken; $3\text{ Cycles}$ when taken (branch penalty).

#### Your Objective

1. Calculate the exact size in bytes and 32-bit words for both the `.data` section and the `.bss` section.
2. Calculate total CPU clock cycles burned and physical time consumed (in nanoseconds) to complete the `.data` section copy under three approaches:
   * **Approach A**: Naive Byte-by-Byte Copy Loop (`LDRB`/`STRB`).
   * **Approach B**: Basic Word-Aligned Copy Loop (`LDR`/`STR` 1x).
   * **Approach C**: High-Performance 4x Unrolled Word Copy Loop (`LDMIA`/`STMIA` 4x).
3. Calculate total CPU clock cycles burned and physical time consumed (in nanoseconds) to complete the `.bss` section zero-initialization under:
   * **Approach A**: Naive Byte-by-Byte Zero Loop (`STRB`).
   * **Approach B**: Basic Word-Aligned Zero Loop (`STR` 1x).
   * **Approach C**: High-Performance 4x Unrolled Zero Loop (`STMIA` 4x).
4. Calculate total boot-up time saved (in nanoseconds) and percentage speedup by using 4x Unrolled Loops (Approach C) over Naive Byte Loops (Approach A) for the combined `.data` + `.bss` memory initialization.
5. Write the complete, production-ready ARM Assembly startup routine executing 4x unrolled `.data` copying and 4x unrolled `.bss` zeroing.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Memory Section Sizes

##### 1. `.data` Section Size Calculation:

$$\text{Size}_{\text{data\_bytes}} = \text{\_edata} - \text{\_sdata} = \text{0x2000\_0200} - \text{0x2000\_0000} = \text{0x0200} = \mathbf{512 \text{ Bytes}}$$

$$\text{Size}_{\text{data\_words}} = \frac{512\text{ Bytes}}{4\text{ Bytes/Word}} = \mathbf{128 \text{ Words (32-bit Words)}}$$

##### 2. `.bss` Section Size Calculation:

$$\text{Size}_{\text{bss\_bytes}} = \text{\_ebss} - \text{\_sbss} = \text{0x2000\_0600} - \text{0x2000\_0200} = \text{0x0400} = \mathbf{1,024 \text{ Bytes}}$$

$$\text{Size}_{\text{bss\_words}} = \frac{1,024\text{ Bytes}}{4\text{ Bytes/Word}} = \mathbf{256 \text{ Words (32-bit Words)}}$$

---

#### Step 2: Calculate `.data` Section Copy Execution Timing ($512\text{ Bytes} / 128\text{ Words}$)

##### Approach A: Naive Byte-by-Byte Copy Loop ($512\text{ Byte Iterations}$)
Loop Instructions per byte:
* `cmp r1, r2` = 1 cycle
* `bge` = 1 cycle (not taken)
* `ldrb r3, [r0], #1` = 1 cycle
* `strb r3, [r1], #1` = 1 cycle
* `b copy_loop` = 3 cycles (branch taken)
* **Total Cycles per Byte** $= 1 + 1 + 1 + 1 + 3 = \mathbf{7 \text{ Cycles/Byte}}$

$$\text{Cycles}_{\text{data\_ApproachA}} = 512 \text{ bytes} \times 7 \text{ cycles/byte} = \mathbf{3,584 \text{ CPU Clock Cycles}}$$

$$T_{\text{data\_ApproachA}} = 3,584 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{1,120.00 \text{ nanoseconds}} \quad (1.120\ \mu\text{s})$$

##### Approach B: Basic Word-Aligned Copy Loop ($128\text{ Word Iterations}$)
Loop Instructions per word (4 bytes):
* `cmp r1, r2` = 1 cycle
* `bge` = 1 cycle
* `ldr r3, [r0], #4` = 1 cycle
* `str r3, [r1], #4` = 1 cycle
* `b copy_loop` = 3 cycles
* **Total Cycles per Word** $= 1 + 1 + 1 + 1 + 3 = \mathbf{7 \text{ Cycles/Word}}$

$$\text{Cycles}_{\text{data\_ApproachB}} = 128 \text{ words} \times 7 \text{ cycles/word} = \mathbf{896 \text{ CPU Clock Cycles}}$$

$$T_{\text{data\_ApproachB}} = 896 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{280.00 \text{ nanoseconds}} \quad (0.280\ \mu\text{s})$$

##### Approach C: High-Performance 4x Unrolled Word Copy Loop ($32\text{ Iterations of 16 Bytes}$)
Loop Instructions per 16-byte block (4 words):
* `ldmia r0!, {r4-r7}` (4 words) $= 4\text{ cycles}$
* `stmia r1!, {r4-r7}` (4 words) $= 4\text{ cycles}$
* `subs r3, r3, #1` $= 1\text{ cycle}$
* `bne` $= 3\text{ cycles}$ (branch taken)
* **Total Cycles per 16-Byte Block** $= 4 + 4 + 1 + 3 = \mathbf{12 \text{ Cycles/Block}}$

Number of 16-byte blocks $= \frac{512}{16} = 32\text{ iterations}$.

$$\text{Cycles}_{\text{data\_ApproachC}} = 32 \text{ iterations} \times 12 \text{ cycles/iter} = \mathbf{384 \text{ CPU Clock Cycles}}$$

$$T_{\text{data\_ApproachC}} = 384 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{120.00 \text{ nanoseconds}} \quad (0.120\ \mu\text{s})$$

---

#### Step 3: Calculate `.bss` Section Zero-Initialization Timing ($1,024\text{ Bytes} / 256\text{ Words}$)

##### Approach A: Naive Byte-by-Byte Zero Loop ($1,024\text{ Byte Iterations}$)
Loop Instructions per byte:
* `cmp r1, r2` = 1 cycle
* `bge` = 1 cycle
* `strb r0, [r1], #1` = 1 cycle
* `b zero_loop` = 3 cycles
* **Total Cycles per Byte** $= 1 + 1 + 1 + 3 = \mathbf{6 \text{ Cycles/Byte}}$

$$\text{Cycles}_{\text{bss\_ApproachA}} = 1,024 \text{ bytes} \times 6 \text{ cycles/byte} = \mathbf{6,144 \text{ CPU Clock Cycles}}$$

$$T_{\text{bss\_ApproachA}} = 6,144 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{1,920.00 \text{ nanoseconds}} \quad (1.920\ \mu\text{s})$$

##### Approach B: Basic Word-Aligned Zero Loop ($256\text{ Word Iterations}$)
Loop Instructions per word (4 bytes):
* `cmp r1, r2` = 1 cycle
* `bge` = 1 cycle
* `str r0, [r1], #4` = 1 cycle
* `b zero_loop` = 3 cycles
* **Total Cycles per Word** $= 1 + 1 + 1 + 3 = \mathbf{6 \text{ Cycles/Word}}$

$$\text{Cycles}_{\text{bss\_ApproachB}} = 256 \text{ words} \times 6 \text{ cycles/word} = \mathbf{1,536 \text{ CPU Clock Cycles}}$$

$$T_{\text{bss\_ApproachB}} = 1,536 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{480.00 \text{ nanoseconds}} \quad (0.480\ \mu\text{s})$$

##### Approach C: High-Performance 4x Unrolled Zero Loop ($64\text{ Iterations of 16 Bytes}$)
Loop Instructions per 16-byte block (4 words):
* `stmia r1!, {r4-r7}` (where `r4..r7` are pre-cleared zeros) $= 4\text{ cycles}$
* `subs r3, r3, #1` $= 1\text{ cycle}$
* `bne` $= 3\text{ cycles}$
* **Total Cycles per 16-Byte Block** $= 4 + 1 + 3 = \mathbf{8 \text{ Cycles/Block}}$

Number of 16-byte blocks $= \frac{1,024}{16} = 64\text{ iterations}$.

$$\text{Cycles}_{\text{bss\_ApproachC}} = 64 \text{ iterations} \times 8 \text{ cycles/iter} = \mathbf{512 \text{ CPU Clock Cycles}}$$

$$T_{\text{bss\_ApproachC}} = 512 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{160.00 \text{ nanoseconds}} \quad (0.160\ \mu\text{s})$$

---

#### Step 4: Calculate Combined Memory Initialization Time & Speedup

Let us sum the combined execution time for `.data` copy + `.bss` zeroing across all three approaches:

```text
COMBINED MEMORY INITIALIZATION PERFORMANCE SUMMARY

 Approach Method            │ Total CPU Cycles (.data + .bss) │ Total Execution Time (ns) │ Speedup vs Naive
────────────────────────────┼─────────────────────────────────┼───────────────────────────┼────────────────────
 Approach A (Byte Loops)    │ 3,584 + 6,144 = 9,728 Cycles    │ 3,040.00 ns (3.040 us)    │ 1.000x (Baseline)
 Approach B (1x Word Loops) │ 896 + 1,536 = 2,432 Cycles      │   760.00 ns (0.760 us)    │ 4.000x
 Approach C (4x Unrolled)   │ 384 + 512 = 896 Cycles          │   280.00 ns (0.280 us)    │ 10.857x FASTER!
```

##### 1. Total Boot-Up Time Saved:

$$\Delta T_{\text{saved}} = T_{\text{ApproachA}} - T_{\text{ApproachC}} = 3,040.00\text{ ns} - 280.00\text{ ns} = \mathbf{2,760.00 \text{ Nanoseconds Saved!}} \quad (2.760\ \mu\text{s})$$

##### 2. Overall Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{ApproachA}}}{T_{\text{ApproachC}}} = \frac{9,728 \text{ cycles}}{896 \text{ cycles}} = \frac{3,040.00\text{ ns}}{280.00\text{ ns}} \approx \mathbf{10.8571\times \text{ Performance Speedup!}}$$

$$\text{Percentage Time Saved} = \left( 1 - \frac{280.00\text{ ns}}{3,040.00\text{ ns}} \right) \times 100\% = \mathbf{90.789\% \text{ Reduction in Memory Initialization Time!}}$$

---

#### Step 5: Complete Production Assembly Startup Routine

Here is the complete, production-ready ARM Assembly startup routine executing 4x unrolled `.data` copying and 4x unrolled `.bss` zeroing:

```assembly
/* PRODUCTION BARE-METAL MEMORY LAYOUT INITIALIZATION ROUTINE */
.syntax unified
.cpu cortex-m4
.thumb

.global Reset_Handler
.type Reset_Handler, %function

.section .text
.thumb_func
Reset_Handler:
    /* Step 0: Disable interrupts during memory layout setup */
    cpsid   i

    /* ==================================================================== */
    /* STEP 1: HIGH-PERFORMANCE 4X UNROLLED .DATA SECTION ROM-TO-RAM COPY   */
    /* ==================================================================== */
    ldr     r0, =_sidata        /* r0 = Source LMA address in Flash ROM */
    ldr     r1, =_sdata         /* r1 = Destination VMA start in SRAM */
    ldr     r2, =_edata         /* r2 = Destination VMA end in SRAM */

    sub     r3, r2, r1          /* r3 = Total bytes in .data (_edata - _sdata) */
    lsrs    r3, r3, #4          /* r3 = Number of 16-byte blocks (r3 / 16) */
    beq     copy_data_tail      /* If size < 16 bytes, skip to tail cleanup! */

copy_data_unrolled_loop:
    /* Load 4 words (16 bytes) from Flash ROM in a single multi-register instruction */
    ldmia   r0!, {r4, r5, r6, r7}
    /* Store 4 words (16 bytes) into SRAM in a single multi-register instruction */
    stmia   r1!, {r4, r5, r6, r7}
    
    subs    r3, r3, #1          /* Decrement 16-byte block counter */
    bne     copy_data_unrolled_loop

copy_data_tail:
    /* Tail Cleanup Loop for Remaining Words (< 16 Bytes) */
    cmp     r1, r2              /* Have we reached _edata? */
    bge     data_copy_complete
    
    ldr     r4, [r0], #4        /* Copy single 32-bit word */
    str     r4, [r1], #4
    b       copy_data_tail

data_copy_complete:

    /* ==================================================================== */
    /* STEP 2: HIGH-PERFORMANCE 4X UNROLLED .BSS SECTION ZERO-INITIALIZATION*/
    /* ==================================================================== */
    ldr     r1, =_sbss          /* r1 = Destination VMA start of .bss in SRAM */
    ldr     r2, =_ebss          /* r2 = Destination VMA end of .bss in SRAM */

    sub     r3, r2, r1          /* r3 = Total bytes in .bss (_ebss - _sbss) */
    lsrs    r3, r3, #4          /* r3 = Number of 16-byte blocks (r3 / 16) */
    
    /* Clear working registers to zero */
    movs    r4, #0
    movs    r5, #0
    movs    r6, #0
    movs    r7, #0
    
    beq     zero_bss_tail       /* If size < 16 bytes, skip to tail cleanup! */

zero_bss_unrolled_loop:
    /* Store 4 zero-words (16 bytes) into SRAM in a single instruction */
    stmia   r1!, {r4, r5, r6, r7}
    
    subs    r3, r3, #1          /* Decrement 16-byte block counter */
    bne     zero_bss_unrolled_loop

zero_bss_tail:
    /* Tail Cleanup Loop for Remaining Words (< 16 Bytes) */
    cmp     r1, r2              /* Have we reached _ebss? */
    bge     bss_zero_complete
    
    str     r4, [r1], #4        /* Store single zero-word */
    b       zero_bss_tail

bss_zero_complete:

    /* ==================================================================== */
    /* STEP 3: TRANSITION TO APPLICATION ENTRY POINT                        */
    /* ==================================================================== */
    cpsie   i                   /* Re-enable interrupts */
    bl      main                /* Jump to C/Assembly main() application! */

    /* Trap loop if main() ever returns */
    b       .
.size Reset_Handler, .-Reset_Handler
```

---

### Sanity Check and Verification

Let us verify our mathematical and physical execution results against assembly and system principles:

1. **`.data` Section Size & Loop Count Check**:
   * $\text{Size}_{\text{data}} = \text{0x2000\_0200} - \text{0x2000\_0000} = 512\text{ bytes}$.
   * Number of 16-byte blocks $= 512 / 16 = 32\text{ iterations}$.
   * Unrolled loop cycles $= 32 \times 12 = 384\text{ cycles}$.
   * At $3.2\text{ GHz}$ ($0.3125\text{ ns/cycle}$), $384 \times 0.3125\text{ ns} = 120.0\text{ ns}$. Matches calculation $100\%$!

2. **`.bss` Section Size & Loop Count Check**:
   * $\text{Size}_{\text{bss}} = \text{0x2000\_0600} - \text{0x2000\_0200} = 1,024\text{ bytes}$.
   * Number of 16-byte blocks $= 1,024 / 16 = 64\text{ iterations}$.
   * Unrolled loop cycles $= 64 \times 8 = 512\text{ cycles}$.
   * At $3.2\text{ GHz}$ ($0.3125\text{ ns/cycle}$), $512 \times 0.3125\text{ ns} = 160.0\text{ ns}$. Matches calculation $100\%$!

3. **Speedup Ratio Verification**:
   * Total Naive Cycles $= 3,584 + 6,144 = 9,728\text{ cycles}$.
   * Total 4x Unrolled Cycles $= 384 + 512 = 896\text{ cycles}$.
   * Speedup Factor $= \frac{9,728}{896} = \mathbf{10.8571\times}$.
   * Time reduction $= (3,040 - 280) / 3,040 = 90.789\%$ time saved.

All memory section size calculations, 4x unrolled instruction loop counts, Little-Endian memory pointer progressions, and $10.857\times$ startup acceleration metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **`.data` Section ROM-to-RAM Copy**: The bare-metal assembly startup process that reads pre-initialized variable values from non-volatile Flash ROM Load Memory Addresses (LMA `_sidata`) and writes them to their corresponding volatile SRAM Virtual Memory Addresses (VMA `_sdata` to `_edata`) before application execution begins.
* **`.bss` Section Zero-Initialization**: The bare-metal assembly startup process that clears un-initialized global and static variable memory regions in SRAM (from VMA `_sbss` to `_ebss`) to constant zero (`0x0000_0000`), overwriting power-on volatile voltage noise without wasting non-volatile Flash ROM storage space.
* **Word-Aligned Loop Unrolling**: The assembly loop optimization technique that processes memory in multi-word blocks (such as $16\text{-byte}$ / 4-word transfers using `LDMIA`/`STMIA`) rather than byte-by-byte, reducing branch comparison overheads and saturating the physical 32-bit memory bus to accelerate system boot-up by over $10\times$.