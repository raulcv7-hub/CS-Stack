---
title: "02-boot-rom-code-execution — Boot ROM Execution Environment and Memory-Mapped Flash ROM Aliasing"
---

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


## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Boot ROM execution, QSPI Flash bus latencies, address aliasing decoding, and instruction fetch performance, let us walk through a complete, step-by-step quantitative engineering calculation.


### The Hardware Execution Tasks:

1. Calculate the exact physical byte offset $O_{\text{flash}}$ inside the 16MB QSPI Flash chip corresponding to the CPU Reset Vector address $A_{\text{reset}} = \text{0x0000\_0000\_FFFF\_FFF0}$.
2. Calculate the total physical fetch time $T_{\text{fetch\_slow}}$ and CPU clock stall cycles $C_{\text{stall\_slow}}$ per 32-bit instruction when running in **Default Single-SPI Mode at $20\text{ MHz}$** (where all phases transmit on 1 data line at 1 bit/cycle, plus 8 dummy cycles).
3. Calculate the total physical fetch time $T_{\text{fetch\_fast}}$ and CPU clock stall cycles $C_{\text{stall\_fast}}$ per 32-bit instruction after firmware upgrades the bus to **Fast Quad-SPI (QSPI) Mode at $100\text{ MHz}$**.
4. Calculate the effective instruction execution throughput in **MIPS (Million Instructions Per Second)** for Single-SPI Mode vs Fast Quad-SPI Mode, and compute the overall **Speedup Factor**.


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


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Boot ROM Execution**: The hardware execution environment where a CPU fetches and executes initial boot instructions directly from non-volatile storage (on-chip Mask ROM or external NOR Flash) without relying on writable system DRAM or stack memory.
* **Memory-Mapped Flash ROM Aliasing**: The interconnect address decoding mechanism that mirrors or maps physical non-volatile Flash storage into the exact physical address space location targeted by the CPU's hardwired Reset Vector (`0xFFFF_FFF0` or `0x0000_0000`).