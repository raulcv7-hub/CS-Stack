---
title: "03-flattened-device-tree-synthesis — Flattened Device Tree (FDT) Binary Synthesis and DeviceTree Blob (DTB) Generation"
---

# 03-flattened-device-tree-synthesis — Flattened Device Tree (FDT) Binary Synthesis and DeviceTree Blob (DTB) Generation

## 1. The Heavy ACPI Overhead in Resource-Constrained Embedded Systems

When an embedded operating system kernel—such as Linux on ARM64 or RISC-V architectures—boots up on a System-on-Chip (SoC) platform, it requires a complete, accurate description of the physical hardware environment. The kernel needs to know the exact physical Memory-Mapped I/O (MMIO) base addresses of peripheral registers, the location and size of physical DRAM memory blocks, the assignment of hardware interrupt lines (GIC or PLIC IRQs) to specific peripherals, and the dependencies between system clock providers and reset controllers.

In enterprise server architectures, hardware discovery is handled by the Advanced Configuration and Power Interface (ACPI) specification. 

However, ACPI was designed for large, complex server platforms with high-power ACPI Machine Language (AML) execution requirements:
* ACPI requires an embedded bytecode interpreter (such as ACPICA) running inside the operating system kernel to execute AML control methods dynamically.
* ACPI tables require megabytes of system DRAM memory and complex, multi-tiered pointer structures (RSDP, XSDT, FADT, DSDT).
* ACPI initialization introduces significant software complexity, memory footprint overhead, and early boot execution delay.

On resource-constrained embedded systems, automotive SoCs, internet-of-things (IoT) gateways, and low-power microcontrollers, allocating megabytes of memory and embedding a full ACPI bytecode interpreter inside early boot firmware or minimal operating system kernels is completely unacceptable!

```text
ACPI OVERHEAD VS. LIGHTWEIGHT EMBEDDED REQUIREMENT

 1. Enterprise ACPI Model (Heavyweight Interpreter Required):
 OS Kernel ──► [ Embedded AML Bytecode Interpreter (ACPICA) ] ──► Parses ACPI Tables (MBs)
 (High memory footprint! Complex runtime execution engine!)

 2. Embedded DeviceTree Model (Ultra-Lightweight Static Binary):
 OS Kernel ──► [ Direct Token Scan Engine (0 Bytecode!) ] ──────► Parses DTB Image (KBs)
 (Microsecond parsing time! Sub-kilobyte memory footprint!)
```

Consider the system engineering constraints of an embedded platform:

1. **Memory Footprint Constraints**: An embedded device might possess only $16\text{ Megabytes}$ or $64\text{ Megabytes}$ of total system RAM. Burning $4\text{ Megabytes}$ ($6.25\%$ of total system RAM) purely on ACPI tables and bytecode interpreters wastes precious memory required for embedded application tasks.
2. **Boot Time Latency Constraints**: An automotive backup camera or industrial safety controller must initialize its display and sensor pipelines in less than **$50\text{ milliseconds}$** after power-on. Spending $150\text{ milliseconds}$ initializing an ACPI bytecode interpreter causes the system to fail real-time boot constraints.
3. **Hardware Non-Discoverability**: Unlike PCI Express devices, embedded SoC peripherals (such as UART serial ports, GPIO controllers, I2C buses, and hardware timers) sit at fixed MMIO addresses on the internal bus crossbar without any standard configuration header registers. They cannot be probed dynamically without triggering hardware bus faults.

An embedded operating system cannot use ACPI, nor can it probe un-mapped MMIO addresses blindly!

How can early boot firmware describe complex, non-discoverable hardware topologies—including memory addresses, interrupt lines, clock dependencies, and power domains—using an ultra-lightweight, byte-packed binary image that an embedded operating system kernel can parse in microseconds without executing bytecode or requiring complex runtime interpreters?

To eliminate ACPI runtime overheads and provide lightweight, OS-agnostic hardware description for embedded platforms, computer architectures employ the **Flattened Device Tree (FDT)** and **DeviceTree Blob (DTB) Generation**.


### Choice 1: The Heavy Mechanical Robot Guide (Enterprise ACPI Model)

The museum offers the team a heavy, complex mechanical robot guide (**An ACPI AML Bytecode Interpreter**):
* The robot carries thousands of internal gears, steam engines, and instruction books.
* When the team reaches a locked door, the robot runs a 10-minute mechanical script to unlock the door.
* **The Problem**: The robot weighs 500 pounds (**Megabytes of RAM Footprint**)! On a narrow mountain trail leading to an embedded temple, the expedition team cannot carry the robot without collapsing from exhaustion.


## 3. Formal Mechanics of Flattened Device Trees and DTB Generation

Now that we possess an intuitive mental model of compressed wooden token scrolls, let us examine the formal, rigorous engineering mechanics of **Flattened Device Trees (FDT)** and **DeviceTree Blob (DTB) Generation**.

The DeviceTree specification (managed by devicetree.org and widely used in Linux, U-Boot, OpenSBI, and FreeBSD) organizes hardware description into a hierarchical tree structure consisting of **Nodes** (representing hardware components) and **Properties** (representing key-value attributes).

```text
DEVICETREE HIERARCHICAL NODE TREE

 Root Node ("/")
 ├─► cpus
 │   ├─► cpu@0  (Property: compatible = "riscv,hart", reg = <0>)
 │   └─► cpu@1  (Property: compatible = "riscv,hart", reg = <1>)
 ├─► memory@80000000 (Property: device_type = "memory", reg = <0x80000000 0x40000000>)
 └─► soc
     ├─► serial@10000000 (Property: compatible = "ns16550a", reg = <0x10000000 0x100>)
     └─► interrupt-controller@0x0c000000 (Property: #interrupt-cells = <1>)
```


### Primitive 2: Binary Layout of a DeviceTree Blob (DTB / FDT)

The human-readable `.dts` file is compiled by the **DeviceTree Compiler (`dtc`)** into a compact, byte-packed, 32-bit Big-Endian binary image called a **DeviceTree Blob (`.dtb`)** or **Flattened Device Tree (FDT)**.

```text
DEVICETREE BLOB (DTB) BINARY MEMORY LAYOUT

 Byte Offset 0x00
 ┌─────────────────────────────────────────────────────────────┐
 │ FDT HEADER (40 Bytes / 10 Double Words)                     │
 │  * Magic Number    : 0xD00D_FEED (32-Bit Big-Endian)        │
 │  * Total Size      : Total DTB binary size in bytes          │
 │  * Section Offsets : Pointers to Reserve Map, Struct, Strings│
 ├─────────────────────────────────────────────────────────────┤
 │ MEMORY RESERVATION BLOCK (Alignment-Protected RAM Ranges)   │
 │  * Array of (64-Bit Address, 64-Bit Length) Tuples          │
 │  * Terminated by (0x0000_0000_0000_0000, 0x0000_0000_0000_0000)│
 ├─────────────────────────────────────────────────────────────┤
 │ STRUCTURE BLOCK (Token Stream)                              │
 │  * FDT_BEGIN_NODE ("soc\0")                                 │
 │  * FDT_PROP       ("compatible" = "simple-bus\0")           │
 │  * FDT_END_NODE                                             │
 ├─────────────────────────────────────────────────────────────┤
 │ STRINGS BLOCK (Property Name String Table)                  │
 │  * "compatible\0", "reg\0", "interrupts\0", "phandle\0"       │
 └─────────────────────────────────────────────────────────────┘
```

The compiled `.dtb` binary consists of four contiguous sections:

#### Section 1: The FDT Header (40 Bytes / 10 Double Words)
Every `.dtb` image begins with a standardized $40\text{-byte}$ header stored in **Big-Endian byte order**:

```text
FDT HEADER REGISTER FIELD MAP (40 BYTES)

 DW Offset │ Field Name          │ Size   │ Description & Value
───────────┼─────────────────────┼────────┼───────────────────────────────────────────────────────────
   DW0     │ magic               │ 4 B    │ 32-Bit Magic Number: 0xD00D_FEED (Big-Endian!)
   DW1     │ totalsize           │ 4 B    │ Total binary size of the DTB image in bytes.
   DW2     │ off_dt_struct       │ 4 B    │ Byte offset from start of DTB to Structure Block.
   DW3     │ off_dt_strings      │ 4 B    │ Byte offset from start of DTB to Strings Block.
   DW4     │ off_mem_rsvmap      │ 4 B    │ Byte offset from start of DTB to Memory Reserve Map.
   DW5     │ version             │ 4 B    │ FDT Header Version (Version 17 = 0x0000_0011).
   DW6     │ last_comp_version   │ 4 B    │ Backward Compatible Version (Version 16 = 0x0000_0010).
   DW7     │ boot_cpuid_phys     │ 4 B    │ Physical CPU Core ID executing the boot sequence.
   DW8     │ size_dt_strings     │ 4 B    │ Size of the Strings Block in bytes.
   DW9     │ size_dt_struct      │ 4 B    │ Size of the Structure Block in bytes.
```

$$\mathbf{\text{Header Validation Rule: } \quad \text{Read32\_BE}(\text{DTB\_Base}) == \text{0xD00D\_FEED}}$$

#### Section 2: Memory Reservation Block
An array of $64\text{-bit}$ (Address, Length) pairs specifying physical RAM regions that the OS kernel **MUST NOT ALLOCATE** to user applications (such as memory occupied by early Boot ROM tables or security monitors). 

The list terminates with a null tuple (`0x0000_0000_0000_0000, 0x0000_0000_0000_0000`).

#### Section 3: Structure Block (The Token Stream)
The core tree structure encoded as a linear stream of $32\text{-bit}$ Big-Endian **Tokens**:

```text
FDT STRUCTURE TOKEN TYPES

 Token Name       │ Token Value   │ Token Stream Payload
──────────────────┼───────────────┼───────────────────────────────────────────────────────────
 FDT_BEGIN_NODE   │ 0x0000_0001   │ Null-terminated ASCII Node Name (padded to 4-byte boundary)
 FDT_END_NODE     │ 0x0000_0002   │ Zero payload (Closes the current node level)
 FDT_PROP         │ 0x0000_0003   │ Length (4B), Name Offset (4B), Property Value (padded)
 FDT_NOP          │ 0x0000_0004   │ Zero payload (No-operation token used for in-place patching)
 FDT_END          │ 0x0000_0009   │ Zero payload (Terminates the Structure Block)
```

#### Section 4: Strings Block
A simple array of null-terminated ASCII strings storing property names (`"compatible\0"`, `"reg\0"`, `"interrupts\0"`). 

Instead of embedding duplicate property name strings inside every `FDT_PROP` token, `FDT_PROP` tokens store a 32-bit offset pointing into the shared Strings Block, saving significant binary space!


### Runtime Bootloader DTB Patching and CPU Register Handoff

Before early bootloader firmware (such as U-Boot, OpenSBI, or EDK2) hands control over to the operating system kernel, it executes **In-Place DTB Patching**:

```text
IN-PLACE DTB PATCHING AND REGISTER HANDOFF

 Early Firmware (U-Boot / OpenSBI)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Reads trained DRAM size -> Overwrites memory node reg!   │
 │ 2. Reads kernel cmdline -> Overwrites /chosen bootargs!    │
 └─────────────┬───────────────────────────────┬───────────────┘
               │
               ▼ CPU Handoff Register Contract
 ┌─────────────────────────────────────────────────────────────┐
 │ ARM64 Architecture  : Register X0 = Physical DTB Address    │
 │ RISC-V Architecture : Register a1 = Physical DTB Address    │
 └─────────────────────────────────────────────────────────────┘
```

#### The Three Dynamic Bootloader DTB Patches:
1. **Dynamic RAM Node Patching**: Firmware reads the actual calibrated DRAM capacity from memory controller registers and updates the `memory` node's `reg` property in the DTB.
2. **Command-Line Injection**: Firmware reads boot choices (such as root filesystem location) and writes the ASCII string to the `/chosen` node's `bootargs` property (`bootargs = "console=ttyS0,115200 root=/dev/vda1 rw"`).
3. **MAC Address Injection**: Firmware reads unique Ethernet MAC addresses from silicon eFuses and writes them to the network card's `local-mac-address` property.

#### The Architecture-Specific CPU Register Handoff Contract:
When firmware executes the final jump instruction to the operating system kernel, it passes the physical memory address of the DTB image in a designated CPU register:

* **ARM64 (AArch64) Contract**: Register `X0` MUST contain the $64\text{-bit}$ physical DRAM memory address of the DeviceTree Blob (`.dtb`).
* **RISC-V Contract**: Register `a1` (`x11`) MUST contain the $64\text{-bit}$ physical DRAM memory address of the DeviceTree Blob (`.dtb`).

The OS kernel reads register `X0` / `a1`, validates the magic number `0xD00D_FEED` at that address, and begins parsing the hardware topology!


### 2. In-Place DTB Expansion Memory Overlap

When early bootloaders execute in-place DTB patching (e.g., adding `bootargs` or new memory nodes):
* The DTB binary image expands in size.
* If the bootloader allocated an exact, un-padded RAM buffer for the DTB (e.g., $2,048\text{ bytes}$), appending new property strings causes the DTB to **overflow its allocated RAM window**.
* The expanding DTB overwrites adjacent memory buffers in RAM, corrupting early kernel page tables!

#### Engineering Solution: Padding Tokens and `FDT_NOP` Reserves
To prevent memory overlap during patching:
1. The DeviceTree Compiler (`dtc -p 1024`) automatically appends $1,024\text{ bytes}$ of empty padding space filled with `FDT_NOP` (`0x0000_0004`) tokens at the end of the Structure Block.
2. When the bootloader injects new properties, it overwrites the `FDT_NOP` tokens, keeping the total DTB binary size $100\%$ constant without overflowing into adjacent memory!


### Scenario & Parameters

You are a principal embedded systems architect optimizing the early boot pipeline of a $3.2\text{-GHz}$ 64-bit ARM64 server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor boots an embedded Linux kernel using a DeviceTree Blob (DTB) stored in physical DRAM memory at address `0x0000_0000_8000_0000`.

```text
SYSTEM DEVICETREE BLOB PARSING PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU execution clock frequency
 T_dram_read               │ 37.5 Nanoseconds      │ Main DRAM memory read latency (120 CPU cycles)
 BW_ram_read               │ 25.6 GB / Second      │ On-chip bus memory read bandwidth
 Size_dtb_initial          │ 3,584 Bytes           │ Initial compiled DTB binary size
 N_patch_bootargs          │ 64 Bytes              │ Size of bootargs string injected by U-Boot
 N_patch_memory            │ 16 Bytes              │ Size of memory reg property injected by U-Boot
 Cycles_token_parse        │ 4 Clock Cycles / Token│ CPU cycles required to parse 1 32-bit FDT token
```

#### Hardware DTB Binary Structure Breakdown:
* **FDT Header Size**: $40\text{ Bytes}$ ($10\text{ Double Words}$).
* **Memory Reservation Block**: $16\text{ Bytes}$ (terminating empty entry).
* **Initial Structure Block Size**: $2,560\text{ Bytes}$ ($640\text{ tokens}$ of $4\text{ bytes}$ each).
* **Initial Strings Block Size**: $968\text{ Bytes}$.


### Step-by-Step Derivation

#### Step 1: Validate Initial DTB Binary Size and Magic Field

Summing the four DTB sections:

$$S_{\text{dtb\_initial}} = \text{Header } (40\text{ B}) + \text{Reserve Map } (16\text{ B}) + \text{Structure Block } (2,560\text{ B}) + \text{Strings Block } (968\text{ B})$$

$$S_{\text{dtb\_initial}} = 40 + 16 + 2,560 + 968 = \mathbf{3,584 \text{ Bytes}}$$

##### Magic Field Value:
The 32-bit Big-Endian magic number stored at byte offset `0x00` of the DTB Header is:

$$\mathbf{\text{Header.magic} = \text{0xD00D\_FEED}}$$


#### Step 3: Calculate Memory Write Time for Updated DTB Image ($t_{\text{dtb\_write}}$)

Writing $3,664\text{ bytes}$ to DRAM at $25.6\text{ GB/sec}$ ($25.6 \times 10^9\text{ bytes/sec}$):

$$t_{\text{dtb\_write}} = \frac{S_{\text{dtb\_final}}}{\text{BW}_{\text{ram\_write}}} = \frac{3,664\text{ Bytes}}{25.6 \times 10^9\text{ Bytes/sec}}$$

$$t_{\text{dtb\_write}} = 1.43125 \times 10^{-7}\text{ seconds} = \mathbf{143.125 \text{ Nanoseconds}}$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{dtb\_write}} = \frac{143.125\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{458 \text{ CPU Clock Cycles}}$$

Writing the patched DTB binary image to DRAM takes **$143.125\text{ nanoseconds}$ ($458\text{ CPU cycles}$)**.


#### Step 5: Calculate Total DTB Overhead and Compare Against ACPI

Total end-to-end DTB setup and parsing latency ($T_{\text{dtb\_total}}$):

$$T_{\text{dtb\_total}} = t_{\text{dtb\_write}} + t_{\text{dtb\_parse}} = 143.125\text{ ns} + 825.000\text{ ns} = \mathbf{968.125 \text{ Nanoseconds}} = \mathbf{0.968125 \text{ Microseconds}}$$

Total CPU Clock Cycles Consumed:

$$C_{\text{dtb\_total}} = 458 + 2,640 = \mathbf{3,098 \text{ CPU Clock Cycles}}$$

##### Compare against Traditional ACPI Parsing ($T_{\text{acpi\_total}} = 150.0\ \mu\text{s} = 150,000.0\text{ ns}$):

$$\text{Speedup Factor} = \frac{T_{\text{acpi\_total}}}{T_{\text{dtb\_total}}} = \frac{150,000.0\text{ ns}}{968.125\text{ ns}} \approx \mathbf{154.939\times \text{ Performance Speedup!}}$$

```text
DEVICETREE BLOB VS ACPI PARSING PERFORMANCE SUMMARY

 Architectural Metric    │ Traditional ACPI Model   │ DeviceTree Blob (DTB) Model    │ DTB Advantage
─────────────────────────┼──────────────────────────┼────────────────────────────────┼───────────────────
 Parsing Execution Engine│ AML Bytecode Interpreter │ Static Token Stream Scanner    │ Zero Bytecode Engine
 Total Memory Footprint  │ > 4,194,304 Bytes (4 MB) │ 3,664 Bytes (3.6 KB!)          │ 99.91% RAM Saved!
 Hardware Parsing Time   │ 150.000 Microseconds     │ 0.968 Microseconds (968.1 ns)  │ 149.03 us Saved!
 Overall Speedup Factor  │ 1.000x (Baseline)        │ 154.939x FASTER!               │ +15,394% SPEEDUP!
```

##### Engineering Conclusion:
By replacing complex ACPI tables and bytecode interpreters with a static, $3,664\text{-byte}$ **DeviceTree Blob (DTB)**, the embedded platform reduced hardware description memory footprint by **$99.91\%$** and accelerated hardware parsing speed by **$154.939\times$ ($15,394\%$ speedup)**—enabling the kernel to discover all MMIO peripherals in less than $1\text{ microsecond}$!


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Flattened Device Tree (FDT)**: A static, hierarchical hardware description format that represents non-discoverable SoC hardware components (MMIO base addresses, IRQ lines, clock providers, and memory boundaries) as a tree of nodes and properties in human-readable source text (`.dts`) and compiled 32-bit big-endian binary representation (`.dtb`).
* **DeviceTree Blob (DTB) Generation**: The early bootloader process of compiling, patching (injecting RAM bounds and kernel `bootargs`), and passing a byte-packed binary image (`.dtb`) to the operating system kernel via CPU registers (`X0` / `a1`), enabling embedded OS kernels to discover physical hardware in sub-microsecond speeds without executing bytecode interpreters.