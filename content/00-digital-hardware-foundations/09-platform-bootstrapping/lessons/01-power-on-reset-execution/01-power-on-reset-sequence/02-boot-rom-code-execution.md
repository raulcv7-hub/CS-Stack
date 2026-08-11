content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/01-power-on-reset-execution/01-power-on-reset-sequence/02-boot-rom-code-execution.md
# 02-boot-rom-code-execution — Boot ROM Execution Environment and Memory-Mapped Flash ROM Aliasing

## 1. The RAM-Less Execution Paradox

When a central processing unit (CPU) completes its hardware Power-On Reset sequence, the Program Counter register is forcibly loaded with a specific, hardwired starting memory address known as the Reset Vector. On the very next clock cycle, the processor’s instruction fetch unit places this address onto the system memory bus, expecting to receive a valid binary instruction opcode.

However, the hardware environment at this exact millisecond presents a profound physical contradiction: **Main system memory (Dynamic Random-Access Memory, or DRAM) is completely offline, unconfigured, and unusable.**

```text
THE RAM-LESS EXECUTION CATCH-22

 CPU Execution Core (Wants Instructions)
 ┌─────────────────────────────────────────────────────────────┐
 │ Program Counter = Reset Vector (e.g., 0xFFFF_FFF0)          │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ (Memory Fetch Attempt)
 ┌─────────────────────────────────────────────────────────────┐
 │ Main System DRAM (DDR4 / DDR5)                              │
 │ Status: UNINITIALIZED, UNCALIBRATED, AND UNUSABLE!          │
 └─────────────────────────────────────────────────────────────┘
  (CPU needs instructions to initialize DRAM, but DRAM cannot hold code!)
```

Main system DRAM is not a simple block of static switches that works immediately upon receiving power. Modern DDR4 and DDR5 memory modules are complex, high-frequency analog subsystems. 

Before a DRAM chip can successfully store or return a single byte of data, its internal hardware controllers and physical layer (PHY) interfaces must undergo an extensive initialization sequence:

* The memory controller must communicate over an auxiliary serial bus ($I^2C$ or SMBus) to read the memory module's Serial Presence Detect (SPD) EEPROM chip to discover its storage capacity, rank structure, and required timing parameters.
* The memory controller must program exact clock cycle delays for Row Address Strobe ($\text{RAS}$) and Column Address Strobe ($\text{CAS}$) latencies into its command registers.
* The physical layer transceivers must execute high-frequency signal calibration, adjusting analog delay lines down to picosecond increments to align clock signals with data strobes (**Write Leveling** and **Read DQS Centering**).
* The memory controller must issue hardware initialization commands to clear row buffers and enable periodic capacitor refresh cycles so stored electrical charges do not evaporate.

This creates an absolute physical Catch-22: **The CPU needs to execute thousands of lines of complex software instructions to configure the DRAM memory controller, but the CPU cannot store or read those software instructions inside DRAM because DRAM is not yet configured.**

If the CPU attempts to read its initial instruction from an un-configured DRAM module, the memory controller will return random electrical noise, bus timing errors, or open-circuit floating values. 

The CPU will decode garbage as instructions, triggering immediate processor exceptions or hard lockups.

Furthermore, a second architectural problem emerges: The CPU's hardware-defined Reset Vector is fixed into the silicon design at a specific physical memory address—such as `0xFFFF_FFF0` (16 bytes below the 4-Gigabyte boundary in x86 architectures) or `0x0000_0000` (the bottom of memory in ARM architectures). 

How does the hardware guarantee that valid, non-volatile boot instructions appear at that exact physical address immediately upon power-on, without requiring expensive, high-capacity non-volatile storage to be fabricated directly onto the CPU die?

To resolve the RAM-less execution paradox and ensure instructions are available at the Reset Vector, computer architectures employ two integrated hardware primitives: **Boot ROM Execution** and **Memory-Mapped Flash ROM Aliasing**.

---

## 2. The Emergency Cardboard Map and the Periscope Mirror

To build an intuitive, crystal-clear mental model of Boot ROM execution and Memory-Mapped Flash Aliasing before inspecting transistor-level address decoders and bus timing diagrams, let us consider an everyday analogy: **An Architect Arriving at an Unbuilt Construction Site**.

Imagine a structural architect (**The CPU Execution Core**) arriving at a massive construction site in total darkness at 3:00 AM (**Power-On Reset**). 

The architect's goal is to construct a state-of-the-art, multi-story skyscraper command center (**Initialize System DRAM**).

```text
CONSTRUCTION SITE ANALOGY

 Architect (CPU Core)               Unbuilt Site (System RAM)
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │ Ready to Read Blueprints  │      │ Empty Mud Pit             │
 │ Needs Building Plan       │      │ (Unusable Command Center) │
 └─────────────┬─────────────┘      └───────────────────────────┘
               │
               ▼ Looks at Entrance Gate Sign
 ┌──────────────────────────────────────────────────────────────┐
 │ Emergency Metal Plaque & Periscope Mirror (Boot ROM / Flash) │
 └──────────────────────────────────────────────────────────────┘
```

The detailed blueprints for the entire building are supposed to be stored inside the filing cabinets of the central command center.

Look at the paradox facing the architect:
* The architect cannot read the blueprints until they enter the central command center.
* But the central command center does not exist yet! It is currently just an empty, unpaved mud pit (**Un-configured System DRAM**).
* The architect cannot build the command center without reading the blueprints, but cannot read the blueprints until the command center is built!

To break this paradox, the construction company installs a small, indestructible **Emergency Metal Plaque (The Boot ROM)** right next to the site's main entrance gate.

Carved directly into the metal plaque are simple, basic emergency instructions (**Early Firmware Code**): *"Step 1: Grab the shovel from the gate. Step 2: Lay a temporary wooden plank over the mud. Step 3: Pave the foundation for the command center."*

Because the plaque is made of solid metal (**Non-Volatile Memory**), the instructions are permanently etched into it. They do not disappear when the lights are turned off at night, and they do not require a completed building to exist.

However, there is a second clever trick in this construction site:

The architect is legally required to look for instructions at a specific, hardwired location: **The Main Entrance Gate Signpost (The Reset Vector Address)**. 

Building the emergency metal plaque directly on the main gate signpost would be too expensive and take up too much physical space at the gate entrance. 

Instead, the construction company mounts the metal plaque in a secure underground bunker near the back of the property (**External SPI Flash Memory Chip**).

To make the underground plaque visible at the entrance gate, the engineers install a **Periscope Mirror System (Memory-Mapped Flash ROM Aliasing)**:

```text
THE PERISCOPE MIRROR ALIASING METAPHOR

 Entrance Gate Signpost (Reset Vector: 0xFFFF_FFF0)
 ┌───────────────────────────┐
 │ Architect Looks HERE      │
 └─────────────┬─────────────┘
               │
               ▼ Periscope Mirror System (Address Aliasing Decoder)
 ┌───────────────────────────┐
 │ Reflects Image from       │
 │ Underground Bunker Plaque │ (External Flash Memory)
 └───────────────────────────┘
```

When the architect stands at the entrance gate signpost and looks up, the periscope mirror reflects the image of the underground metal plaque directly into their eyes! 

To the architect, it appears as if the instructions are written directly on the gate signpost itself, even though the physical plaque is actually located in an underground bunker at the opposite end of the property.

The architect reads the reflected instructions, steps onto the site, lays the temporary wooden planks (**Configures Temporary Cache-as-RAM**), paves the foundation, and builds the central command center (**Initializes Main System DRAM**). 

Once the command center is built and its filing cabinets are accessible, the architect opens the cabinets, reads the master blueprints (**Loads the Operating System Kernel**), and begins full construction!

Breakdown of the analogy:
* The architect is the **CPU Execution Core**.
* The empty mud pit is **Un-configured System DRAM**.
* The emergency metal plaque is the **Non-Volatile Boot ROM / Flash Memory**.
* Carved instructions are **Boot ROM / Early Firmware Machine Code**.
* The entrance gate signpost is the **Hardwired Reset Vector Address**.
* The periscope mirror system is the **Hardware Address Aliasing Decoder**.
* Building the command center is **DRAM Training and Controller Calibration**.
* Master blueprints inside filing cabinets are the **Operating System Kernel**.

---

## 3. Boot ROM Execution Mechanics and Flash ROM Memory-Mapped Aliasing

Now that we possess a clear intuitive mental model of emergency metal plaques and periscope mirrors, let us examine the formal, rigorous engineering mechanics of **Boot ROM Execution** and **Memory-Mapped Flash ROM Aliasing**.

The execution of code prior to DRAM initialization requires dedicated non-volatile storage and specialized address decoding hardware within the system interconnect.

```text
BOOT ROM AND FLASH MEMORY ARCHITECTURAL CLASSIFICATION

                     NON-VOLATILE BOOT STORAGE
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
 On-Chip Mask Boot ROM                         External SPI NOR Flash ROM
 * Fabricated directly onto CPU silicon die.    * Separate physical IC chip on motherboard.
 * Read-only metal layers (Immutable).         * Communicates via Serial Peripheral Interface.
 * Ultra-fast access (1-2 clock cycles).       * Multi-cycle access latency (50-100 ns).
 * Small capacity (32 KB - 128 KB).            * Large capacity (16 MB - 64 MB).
```

---

### On-Chip Boot ROM versus External SPI NOR Flash ROM

Computer platforms generally divide early boot storage into two distinct hardware structures:

#### 1. On-Chip Mask Boot ROM (Internal Boot ROM)
In many modern System-on-Chip (SoC) architectures (such as ARM, RISC-V, and mobile processors), a small read-only memory array is etched directly onto the silicon die alongside the CPU cores. 

The binary data in a Mask ROM is permanently defined during semiconductor fabrication using the physical layout of the final metal interconnect layers.

* **Advantages**: Ultra-fast access latency (accessible in $1 \text{ to } 2\text{ CPU clock cycles}$), absolute physical security (cannot be modified, erased, or tampered with by malware), and guaranteed availability immediately upon power-on.
* **Limitations**: Extremely expensive in terms of silicon die area, and $100\%$ un-modifiable. If a software bug exists in the Mask ROM code, the physical chip must be scrapped and re-fabricated. Consequently, Mask ROMs are kept as small as possible (typically $32\text{ KB}$ to $128\text{ KB}$), containing only minimal code to initialize basic buses and verify the next boot stage.

#### 2. External SPI NOR Flash ROM (System Firmware Flash)
Because full platform firmware (such as UEFI or Coreboot) requires $16\text{ MB}$ to $64\text{ MB}$ of storage capacity, storing all firmware on-chip is cost-prohibitive. 

Instead, the main firmware binary is stored in an external, non-volatile **Serial Peripheral Interface (SPI) NOR Flash ROM** chip mounted on the motherboard.

* **Advantages**: Large storage capacity ($16\text{ MB} \text{ to } 128\text{ MB}$), cost-effective, and field-upgradable (can be re-flashed with firmware updates).
* **Limitations**: High access latency. Communicating over a serial SPI bus requires transmitting command bytes, address bytes, and dummy wait-state cycles, requiring dozens or hundreds of clock cycles per read operation.

---

### Memory-Mapped Flash ROM Aliasing Mechanics

To execute instructions from external SPI Flash or internal Boot ROM immediately upon reset, the non-volatile memory must appear directly within the CPU's physical address space.

When a CPU core executes a instruction fetch, it drives a physical address onto its internal memory bus. 

The CPU has no concept of "files" or "SPI commands"; it simply requests bytes from a physical numerical address $A$.

> **Memory-Mapped I/O (MMIO) Flash Mapping**: The system interconnect crossbar routes any memory read request targeting a specific physical address window directly to the SPI Flash Controller, which automatically converts the memory read into serial SPI clock pulses and returns the Flash data bytes back to the CPU data bus.

However, a critical hardware problem arises: **The Reset Vector Address Mismatch**.

Different processor architectures hardwire their reset vectors to different locations in the physical address space:

```text
PHYSICAL RESET VECTOR LOCATIONS ACROSS ARCHITECTURES

 Architecture │ Hardwired Reset Vector Address │ Memory Location Description
──────────────┼────────────────────────────────┼─────────────────────────────────────────────
 x86 / x86-64 │ 0xFFFF_FFF0                    │ 16 Bytes below 4 GB (Top of 32-bit Space)
 ARM64        │ 0x0000_0000_0000_0000          │ Bottom of 64-bit Address Space
 RISC-V       │ 0x0000_1000 or 0x8000_0000     │ Platform Boot ROM Base Address
```

If the external SPI Flash chip contains a $16\text{-Megabyte}$ firmware image, the physical storage cells inside the Flash chip are indexed from byte offset `0x0000_0000` to `0x00FF_FFFF`.

How does byte offset `0x00FD_0000` inside a 16MB SPI Flash chip appear at physical address `0xFFFF_FFF0` when an x86 CPU powers on?

The system interconnect uses **Hardware Address Aliasing**.

```text
MEMORY-MAPPED FLASH ALIASING DATAPATH (x86 EXAMPLE)

 CPU Physical Address Space (4 GB / 32-Bit Space)
 ┌─────────────────────────────────────────┐
 │ 0x0000_0000 : Main System DRAM (Offline)│
 │   ...                                   │
 │ 0xFF00_0000 to 0xFFFF_FFFF (Top 16 MB)  │
 └────────────────────┬────────────────────┘
                      │
                      ▼ System Interconnect Aliasing Decoder
 ┌─────────────────────────────────────────┐
 │ Strips Upper Address Bits [31:24]       │
 │ Maps 0xFFFF_FFF0 -> SPI Flash Offset    │
 └────────────────────┬────────────────────┘
                      │
                      ▼ Serial SPI Commands
 ┌─────────────────────────────────────────┐
 │ External 16 MB SPI NOR Flash Memory     │
 │ Physical Offsets: 0x0000_0000 - 0x00FF_FFFF
 └─────────────────────────────────────────┘
  (The top 16 MB of 32-bit address space is ALIASED to the 16 MB SPI Flash!)
```

#### Mathematical Formulation of Address Aliasing

Address aliasing occurs when an interconnect address decoder ignores or manipulates certain upper address bits, mapping multiple distinct CPU virtual or physical addresses to the exact same physical storage locations.

Let $A_{\text{cpu}}$ be the 32-bit physical address driven by the CPU during an instruction fetch.

The system interconnect's **Top-of-Memory Address Decoder** evaluates $A_{\text{cpu}}$ using a range-matching boolean equation:

$$\text{Select}_{\text{Flash}} = \begin{cases} 1 & \text{if } A_{\text{cpu}} \ge \text{0xFF00\_0000} \quad \text{AND} \quad A_{\text{cpu}} \le \text{0xFFFF\_FFFF} \\ 0 & \text{otherwise} \end{cases}$$

When $\text{Select}_{\text{Flash}} = 1$, the interconnect captures the request and routes it to the SPI Flash controller.

The SPI Flash Controller calculates the corresponding byte offset $O_{\text{flash}}$ inside the 16MB Flash memory by stripping the top address bits:

$$O_{\text{flash}} = A_{\text{cpu}} \quad \mathbf{\text{AND}} \quad \text{0x00FF\_FFFF}$$

$$\mathbf{O_{\text{flash}} = A_{\text{cpu}} - \text{0xFF00\_0000}}$$

Let us evaluate this aliasing equation for the x86 Reset Vector $A_{\text{reset}} = \text{0xFFFF\_FFF0}$:

$$O_{\text{flash}} = \text{0xFFFF\_FFF0} - \text{0xFF00\_0000} = \mathbf{\text{0x00FF\_FFF0}}$$

#### The Physical Result:
When the CPU fetches an instruction from physical address `0xFFFF_FFF0`, the aliasing decoder translates this request into a read targeting byte offset `0x00FF_FFF0` (16 bytes below the top of the 16MB Flash chip). 

The Flash memory chip returns the opcode stored at that offset, and the CPU begins executing boot code! The entire $16\text{-MB}$ Flash ROM is **aliased** into the top $16\text{-MB}$ window of the CPU's 32-bit address space.

---

### Dynamic Memory Remapping (The Post-Boot Alias Toggle)

On architectures such as ARM and RISC-V, the Reset Vector is located at the very bottom of memory ($\text{Address } 0x0000\_0000$).

During early power-on, the hardware interconnect sets an internal aliasing flip-flop:

$$\text{ALIAS\_CTRL} = 1 \implies \text{Address } 0x0000\_0000 \to \text{Mapped to On-Chip Boot ROM}$$

The CPU boots cleanly from Boot ROM at address `0x0000_0000`.

However, once system DRAM is initialized, the operating system requires physical address `0x0000_0000` to hold the real DRAM-based **Interrupt Vector Table**.

To free address `0x0000_0000` for DRAM, the firmware writes to an interconnect system configuration register (**`REMAP_REG`**):

$$\text{ALIAS\_CTRL} \Leftarrow 0 \implies \text{Address } 0x0000\_0000 \to \text{Mapped to Main System DRAM}$$

```text
DYNAMIC MEMORY REMAPPING STATE TRANSITION

 1. Power-On Reset State (ALIAS_CTRL = 1):
    Address 0x0000_0000 ──► Mapped to On-Chip Boot ROM (Boot Code Executed)

 2. Post-DRAM Initialization State (ALIAS_CTRL = 0):
    Address 0x0000_0000 ──► Mapped to Main System DRAM (Interrupt Vector Table)
    (Boot ROM relocated to 0x1F00_0000 or disabled!)
```

Toggling `ALIAS_CTRL` removes the Boot ROM alias from address `0x0000_0000` and hands full control of the bottom-of-memory space to physical DRAM!

---

### Execution Constraints in a Read-Only Flash Environment

Executing software directly from Flash ROM (an environment known as **Execute-in-Place / XIP**) introduces severe software execution constraints that do not exist when running from DRAM:

```text
EXECUTION CONSTRAINTS IN READ-ONLY FLASH ROM

 Constraint             │ Physical Hardware Cause                │ Software / Assembly Consequence
────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────
 No Writable Variables  │ Flash ROM cannot accept STORE commands │ No global variables (.data / .bss sections).
                        │ in single clock cycles.                │ All state MUST fit in CPU registers!
────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────
 No Hardware Stack      │ Stack operations (PUSH/POP) execute    │ Subroutine calls (CALL/RET) fail unless
                        │ memory writes (STORE to SP).           │ stack is staged in CAR / CPU registers.
────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────
 High Read Latency      │ Serial SPI interface requires multi-   │ Instruction fetch unit suffers pipeline
                        │ cycle clock pulses per word.           │ stalls (front-end instruction starvation).
```

Because Flash memory cannot be modified with standard memory store instructions (`STORE`), early boot assembly code must be written with extreme discipline:
* Global variables cannot be used.
* All temporary variables must be held strictly inside CPU general-purpose registers (`R0-R12` in ARM, `x1-x31` in RISC-V, `EAX/EBX/ECX/EDX` in x86).
* Subroutines cannot use standard `PUSH` and `POP` stack instructions until a temporary stack is established in CPU internal SRAM or Cache-as-RAM (CAR).

---

## 4. Flash Bus Speedups, Pipeline Hazards, and Hardware Write Protection

In commercial System-on-Chip engineering, booting directly from Flash ROM introduces critical physical failure modes and performance bottlenecks that hardware architects must manage.

### 1. Serial SPI Interface Modes and Clock Speedup

When a computer first powers on, the external SPI Flash controller operates in its safest, most conservative hardware mode: **Single-SPI Mode ($1\text{-bit}$ I/O)** running at a low default clock frequency (typically $10\text{ MHz} \text{ to } 20\text{ MHz}$).

In Single-SPI Mode, transferring a single 32-bit ($4\text{-byte}$) instruction word over one data wire ($MOSI/MISO$) requires 32 clock cycles!

At $20\text{ MHz}$ ($50\text{ ns}$ per clock cycle), reading one instruction word takes:

$$T_{\text{fetch}} = 32 \times 50\text{ ns} = \mathbf{1,600 \text{ nanoseconds}} \quad (1.6\ \mu\text{s})$$

If a $3.2\text{-GHz}$ CPU core attempts to execute code directly over a 1-bit SPI bus at $20\text{ MHz}$, the CPU will sit frozen in instruction fetch stalls for **5,120 clock cycles for every single instruction**!

To eliminate this instruction starvation bottleneck, early boot code immediately executes a **SPI Bus Clock & Width Speedup**:

```text
SPI BUS WIDTH MODES EVOLUTION

 1. Single-SPI Mode (1 Data Line - MISO/MOSI):
 [ SPI Clk ] ─── [ Data Bit 0 ] ──► 32 Clock Cycles per 32-bit Word

 2. Quad-SPI / QSPI Mode (4 Parallel Data Lines - IO0, IO1, IO2, IO3):
 [ SPI Clk ] ─── [ Bit 3 ][ Bit 2 ][ Bit 1 ][ Bit 0 ] ──► 8 Clock Cycles per Word!

 3. Octal-SPI / OSPI Mode (8 Parallel Data Lines - IO0 .. IO7):
 [ SPI Clk ] ─── [ 8 Bits Parallel ] ──► 4 Clock Cycles per Word!
```

#### Quad-SPI (QSPI) and Octal-SPI (OSPI) Acceleration:
1. **Quad-SPI (QSPI)**: Re-configures the SPI controller and Flash chip to use 4 parallel data lines ($IO_0, IO_1, IO_2, IO_3$). Data transfer speed quadruples ($8\text{ clock cycles per 32-bit word}$).
2. **Octal-SPI (OSPI)**: Uses 8 parallel data lines ($IO_0 \dots IO_7$), transferring a full byte on every single clock edge (Dual Data Rate / DDR OSPI transfers a 32-bit word in $2\text{ clock cycles}$!).
3. **Increasing Clock Frequency**: The firmware programs the system clock generator to boost the SPI clock frequency from $20\text{ MHz}$ up to $100\text{ MHz} \text{ or } 133\text{ MHz}$.

By switching to QSPI/OSPI mode at $100\text{ MHz}$, instruction fetch latency drops from $1,600\text{ ns}$ down to **$40\text{ ns}$ ($40\times$ speedup!)**, allowing the CPU pipeline to run efficiently.

---

### 2. The Remap Pipeline Flush Hazard

When firmware toggles the memory remap control register (`REMAP_REG`) to change physical address `0x0000_0000` from Boot ROM to DRAM, a severe pipeline hazard occurs: **The Instruction Prefetch Pipe-Clean Hazard**.

Modern CPU cores do not fetch instructions one-by-one. The Instruction Fetch unit reads ahead, filling an internal **Prefetch Instruction Queue** with upcoming instructions.

```text
REMAP PIPELINE FLUSH HAZARD

 CPU Instruction Queue (Filled before Remap Toggle):
 [ Instr 1 (Boot ROM) ][ Instr 2 (Boot ROM) ][ Instr 3 (Boot ROM) ]
                                 │
                                 ▼ Firmware writes REMAP_REG = 0!
 Memory Address 0x0000_0000 toggles from Boot ROM to DRAM!
                                 │
                                 ▼
 CPU Pipeline executes Instr 3 from Queue...
 BUT Instruction Fetch Unit fetches Instr 4 from DRAM Address 0x0000_0010!
 (Code stream split! Half Boot ROM code, half DRAM garbage -> CRASH!)
```

Trace the catastrophic failure sequence if the remap register is toggled carelessly:

1. The CPU is executing boot code at address `0x0000_0080` inside Boot ROM.
2. The Instruction Fetch unit has already prefetched instructions at `0x0000_0084`, `0x0000_0088`, and `0x0000_008C` into its internal queue.
3. The CPU executes a store instruction writing `0` to `REMAP_REG`. Physical address `0x0000_0000` instantly switches from Boot ROM to DRAM.
4. The CPU finishes executing `0x0000_0080` from its queue.
5. On the next cycle, the Instruction Fetch unit needs the next instruction. It issues a fetch to `0x0000_0090`.
6. **The Crash**: Physical address `0x0000_0090` now maps to **uninitialized DRAM**, which contains random garbage! The CPU decodes garbage, executes an illegal instruction, and crashes!

#### The Hardware / Software Solution: Absolute Branching and Pipeline Serialization

To safely toggle memory remap registers without crashing:

```text
SAFE MEMORY REMAP EXECUTION SEQUENCE

 1. Execute Far Jump to High Un-Aliased Address (e.g., JMP 0xFF00_1000)
    (PC leaves the aliased 0x0000_0000 region completely!)
 2. Execute Instruction Synchronization Barrier (ISB / fence.i / CPUID)
    (Flushes all prefetched instructions from CPU queue!)
 3. Write REMAP_REG = 0 (Toggle Address 0x0000_0000 to DRAM)
 4. Execute second Barrier (Guarantees REMAP commit before next fetch)
 5. Jump back to target DRAM address!
```

1. **Far Jump to Un-Aliased High Memory**: Before toggling `REMAP_REG`, the boot code executes an unconditional jump (`JMP`) to an absolute, high physical memory address (e.g., `0xFF00_1000`) that does **not** depend on the `0x0000_0000` alias.
2. **Instruction Pipeline Barrier**: The code executes an **Instruction Synchronization Barrier** (`ISB` in ARM, `fence.i` in RISC-V, or a serializing instruction like `CPUID` in x86). This forces the CPU to completely discard and flush all prefetched instructions from its internal queue.
3. **Toggle Remap Register**: The CPU writes to `REMAP_REG`.
4. **Second Pipeline Barrier**: A second barrier is executed to guarantee that the `REMAP_REG` store transaction has fully committed across the bus before any subsequent instruction fetch is initiated.

---

### 3. Hardware Write Protection (`WP#`) and SPI Glitch Immunity

SPI NOR Flash chips store critical system firmware binaries. If a physical power supply fluctuation or noise transient occurs on the motherboard during power-on, the SPI controller could accidentally interpret electrical noise as a Flash Erase or Flash Program command, permanently corrupting the system firmware!

To protect Flash memory from corruption, the hardware platform incorporates **Hardware Write Protection Pins (`WP#`)**:

```text
HARDWARE SPI FLASH WRITE-PROTECTION SCHEMATIC

 Motherboard Reset Controller
 ┌───────────────────────────┐     WP# Pin (Active Low)    ┌──────────────────┐
 │ Hardware Power-Good       ├────────────────────────────►│ SPI NOR Flash    │
 │ Asserted = 1 (Normal)     │                             │ Internal Status  │
 │ De-asserted = 0 (Reset)   │                             │ Register Locked! │
 └───────────────────────────┘                             └──────────────────┘
  (SPI Flash hardware blocks ALL write/erase commands while WP# = 0!)
```

* The SPI Flash chip contains a physical, active-low **Write Protect Pin (`WP#`)** and a status register **Status Register Write Disable (SRWD)** bit.
* While the system is booting or undergoing reset, motherboard hardware forces `WP# = 0`.
* When `WP# = 0`, the internal control logic inside the Flash chip **physically disables the high-voltage charge pumps** required to erase or write Flash memory cells.
* Even if noise causes the SPI bus to transmit a Flash Erase command, the Flash chip ignores the command in hardware, preserving firmware integrity!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Boot ROM execution, QSPI Flash bus latencies, address aliasing decoding, and instruction fetch performance, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal firmware performance architect optimizing the early boot sequence of a $2.4\text{-GHz}$ 64-bit SoC processor.

The CPU core operates at a clock frequency:

$$f_{\text{cpu}} = 2.4\text{ GHz} = 2.4 \times 10^9\text{ Hz}$$

The CPU clock period $T_{\text{cpu}}$ is:

$$T_{\text{cpu}} = \frac{1}{2.4 \times 10^9\text{ Hz}} = 0.41667\text{ nanoseconds} = 416.67\text{ picoseconds}$$

```text
SYSTEM BOOTSTRAPPING PERFORMANCE PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 A_reset                   │ 0x0000_0000_FFFF_FFF0 │ Hardwired 64-bit Reset Vector Address
 Flash_Size                │ 16 Megabytes (16 MB)  │ Physical capacity of external QSPI NOR Flash
 Flash_Window_Base         │ 0x0000_0000_FF00_0000 │ Base address of 16MB Memory-Mapped Flash Window
 f_spi_default             │ 20.0 MHz (1-bit SPI)  │ Default power-on SPI clock frequency
 f_spi_fast                │ 100.0 MHz (4-bit QSPI)│ Fast-mode Quad-SPI clock frequency
 T_flash_access            │ 32 Bits (4 Bytes)     │ Size of 1 instruction fetch (32-bit opcode)
```

#### QSPI Command Phase Overhead (Protocol Specifications):
When reading a 32-bit instruction word over the Quad-SPI bus, the transaction consists of three sequential protocol phases:

1. **Command & Address Phase**: Transmits 1 command byte + 3 address bytes $= 4\text{ bytes} = 32\text{ bits}$. In Quad-SPI mode (4 bits per clock cycle), this phase requires:
   $$N_{\text{cmd\_cycles}} = \frac{32\text{ bits}}{4\text{ bits/cycle}} = 8\text{ SPI Clock Cycles}$$
2. **Dummy Wait-State Phase**: The Flash chip requires $N_{\text{dummy}} = 6\text{ SPI Clock Cycles}$ of idle wait-states to stabilize its internal sensing amplifiers.
3. **Data Phase**: Transmits the 32-bit instruction word ($4\text{ bytes} = 32\text{ bits}$). In Quad-SPI mode (4 bits per clock cycle), this phase requires:
   $$N_{\text{data\_cycles}} = \frac{32\text{ bits}}{4\text{ bits/cycle}} = 8\text{ SPI Clock Cycles}$$

---

### The Hardware Execution Tasks:

1. Calculate the exact physical byte offset $O_{\text{flash}}$ inside the 16MB QSPI Flash chip corresponding to the CPU Reset Vector address $A_{\text{reset}} = \text{0x0000\_0000\_FFFF\_FFF0}$.
2. Calculate the total physical fetch time $T_{\text{fetch\_slow}}$ and CPU clock stall cycles $C_{\text{stall\_slow}}$ per 32-bit instruction when running in **Default Single-SPI Mode at $20\text{ MHz}$** (where all phases transmit on 1 data line at 1 bit/cycle, plus 8 dummy cycles).
3. Calculate the total physical fetch time $T_{\text{fetch\_fast}}$ and CPU clock stall cycles $C_{\text{stall\_fast}}$ per 32-bit instruction after firmware upgrades the bus to **Fast Quad-SPI (QSPI) Mode at $100\text{ MHz}$**.
4. Calculate the effective instruction execution throughput in **MIPS (Million Instructions Per Second)** for Single-SPI Mode vs Fast Quad-SPI Mode, and compute the overall **Speedup Factor**.

---

### Step-by-Step Derivation

#### Step 1: Calculate Flash Byte Offset $O_{\text{flash}}$ for Reset Vector $A_{\text{reset}}$

The top $16\text{ MB}$ window of the 32-bit physical address space ($\text{0xFF00\_0000}$ to $\text{0xFFFF\_FFFF}$) is aliased to the 16MB external Flash ROM.

Using the address aliasing equation:

$$O_{\text{flash}} = A_{\text{reset}} \quad \mathbf{\text{AND}} \quad \text{0x00FF\_FFFF}$$

$$O_{\text{flash}} = \text{0x0000\_0000\_FFFF\_FFF0} \quad \mathbf{\text{AND}} \quad \text{0x0000\_0000\_00FF\_FFFF}$$

$$\mathbf{O_{\text{flash}} = \text{0x00FF\_FFF0}} \quad (16,777,200_{10} \text{ Bytes})$$

The Reset Vector address $\text{0xFFFF\_FFF0}$ aliases to byte offset **`0x00FF_FFF0`** (16 bytes below the upper limit of the 16MB Flash memory).

---

#### Step 2: Calculate Fetch Latency in Default Single-SPI Mode ($20\text{ MHz}$, $1\text{-bit}$ I/O)

In Single-SPI Mode ($1\text{ bit per clock cycle}$):
* Clock Frequency $f_{\text{spi\_default}} = 20.0\text{ MHz} \implies T_{\text{spi\_slow}} = \frac{1}{20 \times 10^6\text{ Hz}} = \mathbf{50.0 \text{ nanoseconds}}$.
* Command & Address Phase ($4\text{ bytes} = 32\text{ bits}$ on 1 line): $32\text{ SPI cycles}$.
* Dummy Phase: $8\text{ SPI cycles}$.
* Data Phase ($4\text{ bytes} = 32\text{ bits}$ on 1 line): $32\text{ SPI cycles}$.

$$\text{Total SPI Cycles per Read } (N_{\text{cycles\_slow}}) = 32 + 8 + 32 = \mathbf{72 \text{ SPI Clock Cycles}}$$

Calculate total physical fetch time $T_{\text{fetch\_slow}}$:

$$T_{\text{fetch\_slow}} = N_{\text{cycles\_slow}} \cdot T_{\text{spi\_slow}}$$

$$T_{\text{fetch\_slow}} = 72 \cdot 50.0\text{ ns} = \mathbf{3,600.0 \text{ nanoseconds}} \quad (3.60\ \mu\text{s})$$

Calculate CPU clock stall cycles $C_{\text{stall\_slow}}$ at $2.4\text{ GHz}$ ($T_{\text{cpu}} = 0.41667\text{ ns}$):

$$C_{\text{stall\_slow}} = \frac{T_{\text{fetch\_slow}}}{T_{\text{cpu}}} = \frac{3,600.0\text{ ns}}{0.41667\text{ ns/cycle}} = \mathbf{8,640 \text{ CPU Clock Cycles per Instruction!}}$$

In Single-SPI Mode, the CPU burns **$8,640\text{ clock cycles}$** waiting for every single 32-bit instruction fetch!

---

#### Step 3: Calculate Fetch Latency in Fast Quad-SPI Mode ($100\text{ MHz}$, $4\text{-bit}$ I/O)

In Fast Quad-SPI Mode ($4\text{ bits per clock cycle}$):
* Clock Frequency $f_{\text{spi\_fast}} = 100.0\text{ MHz} \implies T_{\text{spi\_fast}} = \frac{1}{100 \times 10^6\text{ Hz}} = \mathbf{10.0 \text{ nanoseconds}}$.
* Command & Address Phase ($32\text{ bits}$ on 4 lines): $8\text{ SPI cycles}$.
* Dummy Phase: $6\text{ SPI cycles}$.
* Data Phase ($32\text{ bits}$ on 4 lines): $8\text{ SPI cycles}$.

$$\text{Total SPI Cycles per Read } (N_{\text{cycles\_fast}}) = 8 + 6 + 8 = \mathbf{22 \text{ SPI Clock Cycles}}$$

Calculate total physical fetch time $T_{\text{fetch\_fast}}$:

$$T_{\text{fetch\_fast}} = N_{\text{cycles\_fast}} \cdot T_{\text{spi\_fast}}$$

$$T_{\text{fetch\_fast}} = 22 \cdot 10.0\text{ ns} = \mathbf{220.0 \text{ nanoseconds}} \quad (0.220\ \mu\text{s})$$

Calculate CPU clock stall cycles $C_{\text{stall\_fast}}$ at $2.4\text{ GHz}$ ($T_{\text{cpu}} = 0.41667\text{ ns}$):

$$C_{\text{stall\_fast}} = \frac{T_{\text{fetch\_fast}}}{T_{\text{cpu}}} = \frac{220.0\text{ ns}}{0.41667\text{ ns/cycle}} = \mathbf{528 \text{ CPU Clock Cycles per Instruction}}$$

In Fast QSPI Mode, the CPU stall duration per instruction fetch drops from $8,640$ cycles down to **$528\text{ clock cycles}$**!

---

#### Step 4: Calculate MIPS Execution Throughput and Speedup Factor

The effective instruction throughput in MIPS (Million Instructions Per Second) is:

$$\text{MIPS} = \frac{1 \times 10^6}{T_{\text{fetch\_seconds}} \times 10^6} = \frac{1}{T_{\text{fetch\_seconds}} \times 10^6}$$

##### 1. Single-SPI Mode Throughput ($\text{MIPS}_{\text{slow}}$):

$$\text{MIPS}_{\text{slow}} = \frac{1}{3,600.0 \times 10^{-9}\text{ s}} = \frac{1}{0.0000036\text{ s}} \approx \mathbf{0.2778 \text{ MIPS}} \quad (277,778 \text{ Instructions/sec})$$

##### 2. Fast Quad-SPI Mode Throughput ($\text{MIPS}_{\text{fast}}$):

$$\text{MIPS}_{\text{fast}} = \frac{1}{220.0 \times 10^{-9}\text{ s}} = \frac{1}{0.00000022\text{ s}} \approx \mathbf{4.5455 \text{ MIPS}} \quad (4,545,454 \text{ Instructions/sec})$$

##### 3. Calculate Overall QSPI Acceleration Speedup Factor:

$$\text{Speedup Factor} = \frac{T_{\text{fetch\_slow}}}{T_{\text{fetch\_fast}}} = \frac{3,600.0\text{ ns}}{220.0\text{ ns}} = \frac{8,640\text{ cycles}}{528\text{ cycles}} \approx \mathbf{16.364\times \text{ Performance Speedup!}}$$

```text
BOOT FLASH EXECUTION PERFORMANCE COMPARISON

 Operating Mode    │ Bus Width │ Clock Freq │ Fetch Latency │ CPU Stall Cycles │ Throughput (MIPS)
───────────────────┼───────────┼────────────┼───────────────┼──────────────────┼───────────────────
 Single-SPI Mode   │ 1 Bit     │  20 MHz    │ 3,600.0 ns    │ 8,640 Cycles     │  0.2778 MIPS
 Fast Quad-SPI Mode│ 4 Bits    │ 100 MHz    │   220.0 ns    │   528 Cycles     │  4.5455 MIPS
───────────────────┴───────────┴────────────┴───────────────┴──────────────────┴───────────────────
 Speedup Factor    │ 4x Width  │ 5x Clock   │ 16.36x Faster │ 16.36x Less Stall│ 16.36x Throughput!
```

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against interconnect principles:

1. **Physical Frequency vs Speedup Ratio Check**:
   * Bus width increased by $4\times$ (1 bit $\to$ 4 bits).
   * Bus clock frequency increased by $5\times$ (20 MHz $\to$ 100 MHz).
   * Raw bit-rate capacity increased by $4 \times 5 = 20\times$.
   * Why is the instruction throughput speedup $16.36\times$ instead of $20.0\times$?
   * Because fixed protocol overheads (such as the 6 dummy wait-state cycles required by the Flash memory core) do not scale linearly with bus width! This matches physical hardware behavior with $100\%$ accuracy.
2. **CPU Clock Ratio Precision Check**:
   * Single-SPI: $3,600.0\text{ ns} / 0.416667\text{ ns/cycle} = 8,640.0\text{ cycles}$.
   * Quad-SPI: $220.0\text{ ns} / 0.416667\text{ ns/cycle} = 528.0\text{ cycles}$.
   * Ratio: $8,640 / 528 = 16.3636\times$.
   * The nanosecond and CPU clock cycle derivations match with $100\%$ precision!

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Boot ROM Execution**: The hardware execution environment where a CPU fetches and executes initial boot instructions directly from non-volatile storage (on-chip Mask ROM or external NOR Flash) without relying on writable system DRAM or stack memory.
* **Memory-Mapped Flash ROM Aliasing**: The interconnect address decoding mechanism that mirrors or maps physical non-volatile Flash storage into the exact physical address space location targeted by the CPU's hardwired Reset Vector (`0xFFFF_FFF0` or `0x0000_0000`).