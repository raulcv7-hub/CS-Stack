content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/05-privileged-isa-trap-architecture/02-hardware-trap-vector-execution/04-bare-metal-startup-trap-synthesis.md
# Bare-Metal Startup Assembly and Linker Script Symbol Integration Architecture

## The Uninitialized Hardware Chaos: Why Bare-Metal Systems Collapse Without Unified Assembly Bootstrapping

When electrical power is applied to a microchip (or when a hardware reset button is pressed), a microprocessor core exits its reset state and begins executing instructions at a hardwired physical memory address known as the **Reset Vector** (e.g., `0x0000000080000000`).

At this exact instant, the computer system is in a state of **Complete Uninitialized Hardware Chaos**:

1. **Random RAM Voltages**: Static RAM (SRAM) and Dynamic RAM (DRAM) cells contain completely random, unpredictable voltage noise ($0\text{s}$ and $1\text{s}$). The uninitialized data section (`.bss`) is filled with garbage data instead of zeros, and global variables in `.data` do not exist in RAM yet!
2. **Un-initialized Stack Pointer**: The Stack Pointer register (`sp` / $x2$) contains an unpredictable garbage value (e.g. `0x00000000`). Executing a standard function call (`call main`) or executing a stack store instruction (`sd ra, 0(sp)`) immediately writes to an invalid memory address, triggering a hardware memory access fault!
3. **Un-configured Trap Vectors**: The Machine Trap Vector register (`mtvec`) contains zeros. If an unexpected hardware exception or interrupt fires, the CPU attempts to jump to address `0x00000000`, causing a catastrophic hard lockup!
4. **Data Disconnected from ROM**: The initialized global variables (`.data`) are stored permanently inside non-volatile Flash ROM, but the program code expects to read and write them in volatile RAM!

```text
THE UNINITIALIZED BARE-METAL HARDWARE CHAOS AT POWER-ON

 Physical Reset Vector (0x80000000)
 ┌─────────────────────────────────────────────────────────────┐
 │ CPU Core Powers ON!                                         │
 ├─────────────────────────────────────────────────────────────┤
 │ * Stack Pointer sp = 0x00000000 (UN-INITIALIZED GARBAGE!)   │
 │ * RAM .bss Section = Random Noise Voltages (NOT ZERO!)      │
 │ * RAM .data Section = Empty (Initialized variables in ROM!) │
 │ * mtvec CSR = 0x00000000 (No Trap Handler Configured!)      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Executing "call main" immediately CRASHES the processor!
 (Cannot execute C/C++ code until bare-metal assembly bootstrapping finishes!)
```

Look at the physical impossibility:
A bare-metal system **CANNOT execute high-level C, C++, or Rust code (such as `main()`) upon power-on**!

High-level compiled code relies on a pre-existing ABI environment: it assumes `sp` points to valid stack RAM, `.bss` variables are zeroed, `.data` variables are loaded in RAM, and `mtvec` points to a valid exception handler.

Before a single line of application code can execute, a low-level **Bare-Metal Startup Assembly Routine (`crt0.s`)** must synthesize the entire execution environment in hardware: initializing control pointers, zeroing `.bss`, copying `.data` from ROM to RAM, configuring trap vectors, and establishing ABI calling conventions!

How do bare-metal startup assembly routines interface with the linker's physical memory map using **Linker Script Symbols (`_stack_top`, `_bss_start`, `_data_load_start`)**, and how do they synthesize a complete, crash-proof **Bare-Metal Bootstrapping Architecture**?

---

## The Un-Furnished Apartment and the Moving Crew: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of bare-metal startup assembly, linker script symbols, ROM-to-RAM copying, and trap vector setup before analyzing assembly loops, ELF linker scripts, and hardware reset state machines, let us consider an everyday analogy: **The Un-Furnished Apartment and the Professional Setup Crew**.

Imagine a family (**The High-Level Application Code / `main()`**) moving into a brand-new apartment building (**Main RAM Memory**).

```text
THE UN-FURNISHED APARTMENT METAPHOR

 Moving Truck parked on street (Non-Volatile Flash ROM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Holds Furniture & Boxes (.data Section)                     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Moving Crew arrives BEFORE family!
 Empty RAM Apartment Building
 ┌─────────────────────────────────────────────────────────────┐
 │ Room 1 (Call Stack)  ──► Set up heavy bed frame (_stack_top)│
 │ Room 2 (.data RAM)   ──► Unpack furniture from truck!       │
 │ Room 3 (.bss RAM)    ──► Sweep room 100% clean to zero!     │
 │ Security Alarm       ──► Set up fire alarm (mtvec)!         │
 └─────────────────────────────────────────────────────────────┘
```

When the key is turned in the front door at 8:00 AM (**Power-On Reset**), the apartment is in **Complete Chaos**:
* There are no beds, no furniture, and no food in the kitchen.
* All the family's furniture is packed inside a moving truck parked on the street (**Flash ROM**).
* The living room floor is covered in construction dust and trash (**RAM Garbage Noise**).
* The emergency fire alarm system is turned OFF (**Un-configured `mtvec`**).

If the family tries to walk into the apartment and sleep right away (**Executing `main()` directly**):
* They trip over construction debris in the dark, break their legs, and end up in the hospital (**System Crash**)!

---

### The Setup Crew Protocol (`crt0.s` Startup Assembly)

To make the apartment liveable, a specialized **Setup Crew (`crt0.s` Startup Assembly)** arrives 2 hours *before* the family:

1. **Set Up the Bed Frame (Initialize Stack Pointer `sp`)**:
   * The setup crew immediately installs a heavy bed frame at the exact top corner of the bedroom (**Sets `sp = _stack_top`**).
   * Now workers have a safe place to rest tools!
2. **Set Up Emergency Alarms (Configure Trap Vector `mtvec`)**:
   * The setup crew plugs in the fire alarm control panel and writes the fire station phone number on the wall (**Sets `mtvec = trap_entry_handler`**).
3. **Unpack Furniture from Truck (Copy `.data` from ROM to RAM)**:
   * The setup crew carries sofa sets and dining tables out of the moving truck parked on the street (**Flash ROM**) and arranges them inside the living room (**RAM `.data` Section**).
4. **Sweep the Floor Clean (Zero-Initialize `.bss` in RAM)**:
   * The setup crew takes brooms and sweeps every grain of construction dust out of the empty storage room until the floor is $100\%$ clean (**Clears `.bss` RAM to Zeros**)!
5. **Open the Front Door for the Family (`call main`)**:
   * ONLY AFTER the beds are built, furniture is unpacked, floors are swept, and fire alarms are armed does the setup crew open the front door and invite the family inside to start their day (**Executes `call main`**)!

This setup crew protocol is the exact physical analogue of **Bare-Metal Startup Assembly**:
* The moving truck on the street is **Non-Volatile Flash ROM (`.rodata` / `.data` LMA)**.
* The empty apartment RAM is **Volatile System SRAM / DRAM (`.data` VMA / `.bss`)**.
* Building the bed frame is **Initializing the Stack Pointer (`la sp, _stack_top`)**.
* Setting up the fire alarm is **Configuring `mtvec`**.
* Unpacking furniture is **ROM-to-RAM Data Copying**.
* Sweeping the floor clean is **Zeroing the `.bss` Section**.
* Inviting the family inside is **Calling `main()`**.

---

## Primitive 1: Linker Script Symbol Integration (`_stack_top`, `_bss_start`, `_data_start`)

Now that we possess a clear intuitive mental model of moving trucks and apartment setup crews, let us examine the formal engineering mechanics of **Linker Script Symbol Integration**.

When a bare-metal C or Assembly program is compiled, the compiler produces un-linked object files (`.o`). 

The **Linker (`ld`)** combines these object files according to a blueprint file called the **Linker Script (`linker.ld`)**.

> **A Linker Script Symbol** is an address-only label defined inside a Linker Script (`linker.ld`) that exports physical memory addresses—such as the top of stack RAM (`_stack_top`), the RAM start/end boundaries of `.bss` (`_bss_start`, `_bss_end`), or the ROM/RAM locations of `.data` (`_data_load_start`, `_data_ram_start`)—allowing startup assembly code to reference physical memory boundaries dynamically without hardcoding fixed numbers.

```text
LINKER SCRIPT (linker.ld) MEMORY MAP BLUEPRINT

 MEMORY {
     FLASH (rx)  : ORIGIN = 0x80000000, LENGTH = 512K  /* Non-Volatile ROM */
     RAM   (rwx) : ORIGIN = 0x80080000, LENGTH = 128K  /* Volatile SRAM    */
 }

 SECTIONS {
     .text : {
         *(.text*)
     } > FLASH

     .data : AT(LOADADDR(.text) + SIZEOF(.text)) {
         _data_ram_start = .;   /* RAM Destination Address */
         *(.data*)
         _data_ram_end = .;
     } > RAM
     _data_load_start = LOADADDR(.data); /* ROM Source Address */

     .bss : {
         _bss_start = .;        /* RAM BSS Start Address */
         *(.bss*)
         _bss_end = .;          /* RAM BSS End Address */
     } > RAM

     _stack_top = ORIGIN(RAM) + LENGTH(RAM); /* RAM Stack Top Address */
 }
```

---

### Understanding VMA versus LMA

A critical concept in bare-metal linker script architecture is the distinction between **VMA** and **LMA**:

1. **Virtual Memory Address (VMA)**: The execution memory address where a section **resides when running** (e.g., RAM address `0x80080000`).
2. **Load Memory Address (LMA)**: The storage memory address where a section **is stored at power-on before execution** (e.g., Flash ROM address `0x80010000`).

```text
VMA VS LMA MEMORY MAPPING FOR INITIALIZED DATA (.data)

 Flash ROM Storage Space (LMA = 0x80010000)
 ┌─────────────────────────────────────────────────────────────┐
 │ Initialized .data Variable Values (Stored Permanently)      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Startup Copy Loop (crt0.s)
 SRAM Memory Execution Space (VMA = 0x80080000)
 ┌─────────────────────────────────────────────────────────────┐
 │ Active .data Variables (Read/Write Execution by main())     │
 └─────────────────────────────────────────────────────────────┘
```

Look at the difference:
* `.text` (Code) has $\text{VMA} == \text{LMA}$ (Executes directly from Flash ROM at `0x80000000`).
* `.data` (Variables) has $\text{VMA} \neq \text{LMA}$! It is **stored in Flash ROM at LMA `0x80010000`**, but **executed in RAM at VMA `0x80080000`**!

The bare-metal startup assembly code MUST read the linker symbols `_data_load_start` (ROM LMA), `_data_ram_start` (RAM VMA), and `_data_ram_end` to copy the `.data` payload from ROM into RAM before `main()` starts!

---

## Primitive 2: Bare-Metal Startup Assembly Architecture (`crt0.s`)

Now let us examine the second core primitive: **Bare-Metal Startup Assembly Architecture (`crt0.s`)**.

> **Bare-Metal Startup Assembly (`crt0.s` — C Runtime 0)** is the low-level assembly entry routine located at the hardware Reset Vector that initializes hardware control pointers, zeros the `.bss` RAM section, copies the `.data` section from ROM to RAM, configures trap vectors, and establishes the 16-byte aligned call stack before issuing `call main`.

```text
THE 6-STAGE BARE-METAL BOOTSTRAPPING PIPELINE

 Power-On Reset (PC = 0x80000000)
  │
  ▼ Stage 1: Stack & Global Pointer Initialization
 la sp, _stack_top  |  la gp, __global_pointer$
  │
  ▼ Stage 2: Trap Vector Configuration
 la t0, trap_entry_handler  |  csrw mtvec, t0
  │
  ▼ Stage 3: ROM-to-RAM Data Copying (.data Section)
 Copy bytes from _data_load_start (ROM) to _data_ram_start (RAM)
  │
  ▼ Stage 4: RAM BSS Zero-Initialization (.bss Section)
 Write 64-bit zeros from _bss_start to _bss_end
  │
  ▼ Stage 5: Argument & Alignment Setup
 li a0, 0 (argc = 0)  |  li a1, 0 (argv = NULL)
  │
  ▼ Stage 6: Transfer Control to C/C++ Application
 call main
```

Let us dissect each of the 6 stages in technical detail:

---

### Stage 1: Stack and Global Pointer Initialization

The very first two instructions executed at power-on reset initialize the **Stack Pointer (`sp`)** and **Global Pointer (`gp`)**:

```riscv
.section .text.init
.global _start
_start:
    # 1. Initialize Stack Pointer sp to top of RAM
    la   sp, _stack_top        # sp <= 0x800A0000 (Top of SRAM)

    # 2. Initialize Global Pointer gp for Linker Relaxation
    .option push
    .option norelax
    la   gp, __global_pointer$ # gp <= 0x80080800 (Center of .sdata)
    .option pop
```

* **`la sp, _stack_top`**: Reads the linker symbol `_stack_top` (e.g. `0x800A0000`) and writes it into $sp$. The stack is now ready to handle function calls and register pushes!
* **`.option norelax`**: Disables linker relaxation *specifically for loading `gp`*, ensuring that loading `gp` does not attempt to use `gp` before `gp` is initialized!

---

### Stage 2: Trap Vector Configuration

Before executing any complex loop or memory copy operation, the startup code configures the **Machine Trap Vector (`mtvec`)**:

```riscv
    # 3. Configure Machine Trap Vector mtvec
    la   t0, trap_entry_handler # Load trap handler entry address
    csrw mtvec, t0              # mtvec <= trap_entry_handler
```

If a hardware memory fault or bus error occurs during memory initialization, the CPU jumps cleanly to `trap_entry_handler` instead of executing a silent hard lockup!

---

### Stage 3: ROM-to-RAM Data Copying (`.data` Section)

The startup code copies initialized global variables from Flash ROM (`_data_load_start`) into SRAM RAM (`_data_ram_start` up to `_data_ram_end`):

```riscv
    # 4. Copy .data Section from Flash ROM to SRAM RAM
    la   t0, _data_load_start   # ROM Source Address (LMA)
    la   t1, _data_ram_start    # RAM Destination Start (VMA)
    la   t2, _data_ram_end      # RAM Destination End

copy_data_loop:
    bgeu t1, t2, copy_data_done # IF RAM pointer >= RAM end, copy complete!
    ld   t3, 0(t0)              # Read 64-bit word from Flash ROM
    sd   t3, 0(t1)              # Write 64-bit word into SRAM RAM
    addi t0, t0, 8              # Advance ROM source pointer by 8 bytes
    addi t1, t1, 8              # Advance RAM dest pointer by 8 bytes
    j    copy_data_loop

copy_data_done:
```

```text
ROM-TO-RAM DATA COPYING LOOP MECHANICS

 Flash ROM (Source: _data_load_start)       SRAM RAM (Dest: _data_ram_start)
 ┌──────────────────────────────────┐       ┌──────────────────────────────────┐
 │ [ 0x123456789ABCDEF0 ] (Word 0)  ├──────►│ [ 0x123456789ABCDEF0 ] (Word 0)  │
 │ [ 0x000000000000002A ] (Word 1)  ├──────►│ [ 0x000000000000002A ] (Word 1)  │
 └──────────────────────────────────┘       └──────────────────────────────────┘
  (Iterates until RAM destination address reaches _data_ram_end!)
```

---

### Stage 4: RAM BSS Zero-Initialization (`.bss` Section)

The startup code clears all uninitialized global variables in RAM to zero:

```riscv
    # 5. Zero-Initialize .bss Section in RAM
    la   t1, _bss_start         # RAM BSS Start Address
    la   t2, _bss_end           # RAM BSS End Address

zero_bss_loop:
    bgeu t1, t2, zero_bss_done  # IF RAM pointer >= BSS end, zeroing complete!
    sd   x0, 0(t1)              # Write 64 bits of HARDWIRED ZERO (x0) into RAM!
    addi t1, t1, 8              # Advance RAM pointer by 8 bytes
    j    zero_bss_loop

zero_bss_done:
```

Look at line `sd x0, 0(t1)`:
The startup loop uses the **Hardwired Zero Register (`x0`)** to write 64 bits of physical zero voltage ($0.0\text{ V}$) into RAM on every pass!

---

### Stage 5 & 6: ABI Parameter Setup and Transfer to `main()`

```riscv
    # 6. Setup Standard C ABI Parameters for main(argc, argv)
    li   a0, 0                  # argc = 0 (Zero command line arguments)
    li   a1, 0                  # argv = NULL (No argument vector pointer)

    # 7. Transfer Control to C/C++ Application Entry Point
    call main                   # Jump-and-Link to main()!

    # 8. Bare-Metal Post-Main Infinite Catch Loop
    # If main() returns unexpectedly, catch execution in low-power idle loop:
post_main_catch:
    wfi                         # Wait For Interrupt (Low-Power Sleep)
    j    post_main_catch
```

Look at line `post_main_catch`:
In a bare-metal microcontroller, **there is no operating system to return to** if `main()` returns!

If `main()` finishes, execution falls into an infinite `wfi` (Wait For Interrupt) sleep loop, putting the CPU into a safe, low-power idle state!

---

## Real-World Silicon Engineering: Flash ROM Wait States and Fast Startup Optimizations

In commercial microcontroller and SoC design, bare-metal startup execution is optimized for speed and safety:

### 1. Flash ROM Access Wait States
Flash ROM memory is significantly slower than CPU pipeline frequencies ($70\text{ ns}$ access time vs $0.3125\text{ ns}$ clock cycle).
* Reading instructions or data from Flash ROM requires configuring **Flash Wait States** (`FLASH_ACR` register) before running memory copy loops!
* If the startup assembly code executes `ld t3, 0(t0)` from Flash ROM before setting Flash Wait States, the Flash chip returns corrupted garbage data, crashing the boot sequence!

---

### 2. Dual-Core Bootstrapping and Core Parking
In a multi-core bare-metal system (e.g. 4 CPU cores powering ON at the same reset vector `0x80000000`):
* **Core 0 (Primary Boot Core)**: Executes the full startup routine (zeroing `.bss`, copying `.data`).
* **Cores 1..3 (Secondary Cores)**: Must NOT execute `.bss` zeroing or `.data` copying simultaneously (or they will corrupt Core 0's memory writes!).
* **Core Parking**: Cores 1..3 check their Core ID register (`mhartid`). If `mhartid != 0`, they jump immediately to a **Low-Power Parked Wait Loop (`wfi`)** until Core 0 finishes initialization and sends an Inter-Processor Interrupt (IPI)!

```text
MULTI-CORE BARE-METAL BOOTSTRAPPING FLOW

 All Cores Power ON at Reset Vector (0x80000000)
  │
  ▼ Read Hardware Core ID (mhartid CSR)
  ├─► mhartid == 0 (Primary Core 0) ──► Executes full crt0.s startup!
  └─► mhartid != 0 (Secondary Core) ──► Jumps to Parked WFI Loop!
                                        (Waits for Core 0 IPI wakeup!)
```

---

## Solved Industrial Engineering Exercise: Complete Bare-Metal Bootstrapping Synthesis, Linker Map Analysis, and Boot Timing Budget

To consolidate your complete mastery of bare-metal startup assembly (`crt0.s`), Linker Script symbols (`_stack_top`, `_bss_start`, `_data_load_start`), ROM-to-RAM copying, `.bss` zeroing, and multi-core boot loops, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior firmware microarchitect designing the bare-metal bootloader and Linker Script for an industrial $3.2\text{ GHz}$ 64-bit RISC-V microcontroller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The microcontroller hardware contains two memory blocks:
* **Flash ROM**: $512\text{ KB}$ non-volatile memory starting at address `0x0000_0000_8000_0000`.
* **SRAM RAM**: $128\text{ KB}$ volatile memory starting at address `0x0000_0000_8008_0000`.

```text
3.2 GHz BARE-METAL MICROCONTROLLER MEMORY SYSTEM

 CPU Core (3.2 GHz) ──► Flash ROM (0x80000000, 512KB) ──► Non-Volatile (.text, .data LMA)
 Clock T = 312.5 ps     SRAM RAM  (0x80080000, 128KB) ──► Volatile     (.data VMA, .bss, Stack)
```

#### Linker Map Symbol Values (Produced by `linker.ld`):
* `_text_start` = `0x0000_0000_8000_0000` (Flash ROM Start).
* `_text_end` = `0x0000_0000_8001_0000` ($64\text{ KB}$ of code).
* `_data_load_start` (LMA in ROM) = `0x0000_0000_8001_0000`.
* `_data_ram_start` (VMA in RAM) = `0x0000_0000_8008_0000`.
* `_data_ram_end` (VMA in RAM) = `0x0000_0000_8008_2000` ($8\text{ KB}$ initialized data = $1,024$ 64-bit words).
* `_bss_start` (RAM) = `0x0000_0000_8008_2000`.
* `_bss_end` (RAM) = `0x0000_0000_8008_A000` ($32\text{ KB}$ uninitialized data = $4,096$ 64-bit words).
* `_stack_top` (RAM) = `0x0000_0000_800A_0000` (Top of $128\text{-KB}$ SRAM RAM).
* `trap_entry_handler` = `0x0000_0000_8000_0100`.

#### Memory System Performance Parameters:
* SRAM RAM Write Latency = $1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Flash ROM Read Latency (with Wait States) = $4\text{ clock cycles}$ ($1.25\text{ ns}$).
* ROM-to-RAM Copy Loop Latency = 1 Flash Read ($4\text{ cycles}$) + 1 SRAM Write ($1\text{ cycle}$) + 2 Loop Overhead Cycles = **$7\text{ clock cycles per 64-bit word}$**.
* BSS Zeroing Loop Latency = 1 SRAM Write ($1\text{ cycle}$) + 2 Loop Overhead Cycles = **$3\text{ clock cycles per 64-bit word}$**.

#### Your Objective

1. Write the complete, valid Linker Script SECTIONS block (`linker.ld`) defining `.text`, `.data`, `.bss`, and `_stack_top`.
2. Write the complete, valid RISC-V 64-bit bare-metal startup assembly routine (`crt0.s`) that:
   * Initializes `sp` to `_stack_top` and `gp` to `__global_pointer$`.
   * Configures `mtvec` to `trap_entry_handler`.
   * Copies `.data` from ROM (`_data_load_start`) to RAM (`_data_ram_start` to `_data_ram_end`).
   * Zeros `.bss` in RAM from `_bss_start` to `_bss_end`.
   * Sets `a0 = 0`, `a1 = 0`, and executes `call main`.
   * Includes post-main `wfi` catch loop.
3. Calculate the exact physical execution time (in microseconds and CPU clock cycles) for:
   * ROM-to-RAM `.data` copying ($8\text{ KB} = 1,024\text{ words}$).
   * RAM `.bss` zeroing ($32\text{ KB} = 4,096\text{ words}$).
   * Total Bootstrapping Time before `main()` is entered.
4. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Write the Linker Script (`linker.ld`)

```text
/* BARE-METAL LINKER SCRIPT (linker.ld) */

MEMORY {
    FLASH (rx)  : ORIGIN = 0x80000000, LENGTH = 512K
    RAM   (rwx) : ORIGIN = 0x80080000, LENGTH = 128K
}

SECTIONS {
    .text : {
        _text_start = .;
        *(.text.init)
        *(.text*)
        *(.rodata*)
        _text_end = .;
    } > FLASH

    .data : AT(_text_end) {
        _data_ram_start = .;
        *(.data*)
        _data_ram_end = .;
    } > RAM
    _data_load_start = LOADADDR(.data);

    .bss : {
        _bss_start = .;
        *(.bss*)
        *(COMMON)
        _bss_end = .;
    } > RAM

    . = ALIGN(8);
    __global_pointer$ = _data_ram_start + 0x800;
    _stack_top = ORIGIN(RAM) + LENGTH(RAM); /* 0x80080000 + 128K = 0x800A0000 */
}
```

---

#### Step 2: Write the Complete Bare-Metal Startup Assembly (`crt0.s`)

```riscv
# BARE-METAL C RUNTIME STARTUP ROUTINE (crt0.s)

.section .text.init
.global _start
.type _start, @function
_start:
    # --- STAGE 1: INITIALIZE STACK & GLOBAL POINTERS ---
    la   sp, _stack_top          # sp <= 0x800A0000 (Top of SRAM RAM)

    .option push
    .option norelax
    la   gp, __global_pointer$   # gp <= 0x80080800 (Center of .sdata)
    .option pop

    # --- STAGE 2: CONFIGURE TRAP VECTOR (mtvec) ---
    la   t0, trap_entry_handler  # Load trap entry address
    csrw mtvec, t0               # mtvec <= trap_entry_handler

    # --- STAGE 3: COPY .DATA SECTION FROM FLASH ROM TO SRAM RAM ---
    la   t0, _data_load_start    # t0 <= 0x80010000 (ROM Source LMA)
    la   t1, _data_ram_start     # t1 <= 0x80080000 (RAM Dest VMA)
    la   t2, _data_ram_end       # t2 <= 0x80082000 (RAM End)

copy_data_loop:
    bgeu t1, t2, copy_data_done  # IF RAM pointer >= RAM end, copy done!
    ld   t3, 0(t0)               # Read 64-bit word from Flash ROM (4 cycles)
    sd   t3, 0(t1)               # Write 64-bit word into SRAM RAM  (1 cycle)
    addi t0, t0, 8               # ROM ptr += 8
    addi t1, t1, 8               # RAM ptr += 8
    j    copy_data_loop

copy_data_done:

    # --- STAGE 4: ZERO-INITIALIZE .BSS SECTION IN SRAM RAM ---
    la   t1, _bss_start          # t1 <= 0x80082000 (RAM BSS Start)
    la   t2, _bss_end            # t2 <= 0x8008A000 (RAM BSS End)

zero_bss_loop:
    bgeu t1, t2, zero_bss_done   # IF RAM pointer >= BSS end, zeroing done!
    sd   x0, 0(t1)               # Write 64-bit ZERO (x0) into RAM (1 cycle)
    addi t1, t1, 8               # RAM ptr += 8
    j    zero_bss_loop

zero_bss_done:

    # --- STAGE 5: ABI PARAMETERS & TRANSFER TO MAIN ---
    li   a0, 0                   # argc = 0
    li   a1, 0                   # argv = NULL
    call main                    # Jump-and-Link to main()!

    # --- STAGE 6: BARE-METAL CATCH LOOP ---
post_main_catch:
    wfi                          # Low-power sleep if main() returns
    j    post_main_catch
```

---

#### Step 3: Calculate Bootstrapping Clock Cycles and Execution Time

##### 1. ROM-to-RAM `.data` Copying Time ($8\text{ KB} = 1,024\text{ words}$):
* Number of 64-bit words $= \frac{8,192\text{ bytes}}{8\text{ bytes/word}} = 1,024\text{ words}$.
* Latency per word = $7\text{ clock cycles}$ (1 ROM Read [4c] + 1 RAM Write [1c] + 2 Loop Overhead [2c]).

$$\text{Cycles}_{.data} = 1,024 \text{ words} \times 7 \text{ cycles/word} = \mathbf{7,168 \text{ Clock Cycles}}$$

$$T_{.data} = 7,168 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.00000224 \text{ seconds}} = \mathbf{2.240 \text{ Microseconds}}$$

##### 2. RAM `.bss` Zero-Initialization Time ($32\text{ KB} = 4,096\text{ words}$):
* Number of 64-bit words $= \frac{32,768\text{ bytes}}{8\text{ bytes/word}} = 4,096\text{ words}$.
* Latency per word = $3\text{ clock cycles}$ (1 RAM Write [1c] + 2 Loop Overhead [2c]).

$$\text{Cycles}_{.bss} = 4,096 \text{ words} \times 3 \text{ cycles/word} = \mathbf{12,288 \text{ Clock Cycles}}$$

$$T_{.bss} = 12,288 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.00000384 \text{ seconds}} = \mathbf{3.840 \text{ Microseconds}}$$

##### 3. Total Bootstrapping Execution Summary (before `main()` entry):

$$\text{Total Boot Cycles} = 7,168 + 12,288 + 12 \text{ (setup insts)} = \mathbf{19,468 \text{ CPU Clock Cycles}}$$

$$\text{Total Boot Time} = 19,468 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{6.08375 \text{ Microseconds}}$$

```text
BARE-METAL BOOTSTRAPPING PERFORMANCE SUMMARY

 Boot Stage               │ Word Count │ Cycles / Word │ Stage Cycles │ Physical Time (us)
──────────────────────────┼────────────┼───────────────┼──────────────┼───────────────────
 Stage 1 & 2 Setup        │ -          │ -             │ 12 Cycles    │ 0.00375 us
 Stage 3: .data Copy ROM->RAM│ 1,024    │ 7 Cycles      │ 7,168 Cycles │ 2.24000 us
 Stage 4: .bss RAM Zeroing│ 4,096      │ 3 Cycles      │ 12,288 Cycles│ 3.84000 us
 Stage 5 & 6: main() Call │ -          │ -             │ 0 Cycles     │ 0.00000 us
──────────────────────────┴────────────┴───────────────┴──────────────┴───────────────────
 TOTAL BOOTSTRAP OVERHEAD │ 5,120 Words│ 3.80 Avg      │ 19,468 Cycles│ 6.08375 us
```

##### Engineering Conclusion:
The bare-metal startup routine synthesized the entire execution environment—copying $8\text{ KB}$ of initialized data, zeroing $32\text{ KB}$ of BSS memory, configuring stack/trap pointers, and calling `main()`—in just **$6.08375\text{ microseconds}$ ($19,468\text{ CPU clock cycles}$)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and bare-metal bootstrapping results:

1. **Stack Pointer Memory Alignment Check**:
   * `_stack_top` = `0x800A0000` ($0x800A0000 \pmod{16} == 0$).
   * Initial $sp$ is $100\%$ 16-byte aligned, satisfying the ABI invariant for `call main`.
2. **ROM-to-RAM Data Copy Boundary Check**:
   * Source range: `0x80010000` to `0x80012000` ($8,192\text{ bytes}$).
   * Dest range: `0x80080000` to `0x80082000` ($8,192\text{ bytes}$).
   * Exactly $1,024$ 64-bit words copied. Verified!
3. **RAM BSS Zeroing Boundary Check**:
   * Range: `0x80082000` to `0x8008A000` ($32,768\text{ bytes}$).
   * Exactly $4,096$ 64-bit words zeroed using hardwired `x0`. Verified!
4. **Boot Timing Verification**:
   * Total cycles $= 7168 + 12288 + 12 = 19468$.
   * $19468 \times 0.3125\text{ ns} = 6083.75\text{ ns} = 6.08375\text{ }\mu\text{s}$. Math verified to exact picosecond!

All bare-metal startup assembly stages, linker script VMA/LMA symbol mappings, ROM-to-RAM copy loops, BSS zeroing routines, and boot timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Bare-Metal Startup Assembly (`crt0.s`)**: The low-level assembly entry routine located at the hardware Reset Vector that initializes `sp` and `gp`, configures trap vectors (`mtvec`), copies the `.data` section from Flash ROM to SRAM RAM, zero-initializes `.bss` RAM, and sets up C ABI parameters before calling `main()`.
* **Linker Script Symbol Integration**: The technique of referencing address-only linker script symbols (`_stack_top`, `_bss_start`, `_data_load_start`) inside assembly code (`la sp, _stack_top`), allowing software startup routines to dynamically resolve physical ROM LMA and RAM VMA boundaries without hardcoding fixed memory addresses.
```