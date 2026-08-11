# platform-bootstrapping — Platform Bootstrapping Architecture

> **Assumed Prerequisites:** DRAM memory controllers, timing parameters, and row buffer states from `04-memory-subsystems`; Reset vectors, privilege execution modes, and register initialization from `06-assembly-language-mechanics`; PCIe bus configuration space, ECAM addressing, and BAR decoding from `07-hardware-interconnects`.
> **Course Boundary:** Begins at the physical Power-On Reset (POR) signal and execution from the hardware Boot ROM reset vector, and ends at handing over a fully initialized hardware platform (DRAM trained, cores synchronized, buses enumerated, ACPI/FDT/SMBIOS tables generated, Root of Trust verified, SMM/TrustZone isolated) to the operating system bootloader or kernel.
> **Explicit Exclusions:** ❌ No operating system kernel bootloaders or OS kernel loading routines (handled in Layer 04 `operating-system-kernels`), ❌ No OS kernel device drivers or high-level C applications, ❌ No analog power regulator physics, PMIC voltage rails, or motherboard PCB trace layout.

## 01-power-on-reset-execution — Power-On Reset Execution Environment

### 01-power-on-reset-sequence — Power-On Reset Hardware Sequence
* 01-power-on-reset-state-machine — Problem: CPU execution cores cannot execute instructions after power-on until internal supply voltages stabilize and hardware state registers are cleared to a deterministic baseline. | Primitives: Power-On Reset (POR), Reset vector fetch.
* 02-boot-rom-code-execution — Problem: Executing instructions immediately after reset is constrained by uninitialized system RAM, forcing initial execution to run directly from read-only silicon ROM. | Primitives: Boot ROM execution, Memory-mapped Flash ROM aliasing.
* 03-system-clock-pll-initialization — Problem: Running platform initialization on a low-frequency default reset oscillator prevents high-speed bus transfers and DRAM training, requiring early clock tree and PLL multiplier configuration. | Primitives: System clock tree, Main PLL multiplier configuration.
* 04-cache-as-ram-staging — Problem: Subroutine calls and register context preservation fail without a stack, requiring initial stack allocation inside CPU internal SRAM or cache lines before DRAM is initialized. | Primitives: Temporary SRAM stack, Cache-as-RAM (CAR).
* 05-early-diagnostic-post-output — Problem: Debugging execution failures before DRAM initialization requires emitting low-overhead hardware status codes over basic bus interfaces. | Primitives: Port 0x80 POST codes, Bare-metal UART assembly logging, JTAG/SWO tracing.

### 02-hardware-root-of-trust — Hardware Root of Trust Authentication
* 01-immutable-boot-rom-verification — Problem: Loading unverified firmware binaries from external Flash storage allows malicious code execution before the operating system boots. | Primitives: Hardware Root of Trust (RoT), eFuse public key verification, Hardware write-protect.
* 02-cryptographic-chain-of-trust — Problem: Verifying subsequent boot stages requires verifying digital signatures using hardware-embedded public keys without leaking private keys or allowing version rollback attacks. | Primitives: Cryptographic Chain of Trust, Anti-rollback eFuse counters, Measured Boot TPM 2.0 PCR extension.
* 03-firmware-boot-stage-abstractions — Problem: Coordinating multi-stage firmware execution across different hardware architectures requires standardized early boot phase boundaries. | Primitives: UEFI PEI phase, ARM TF-A BL1/BL2 stages, OpenSBI M-mode execution.
* 04-cpu-microcode-patch-application — Problem: Memory controllers and CPU cores contain hardware silicon errata that cause platform crashes unless patched prior to DRAM training. | Primitives: Microcode patch loading, Early CPU errata mitigation.

## 02-dram-memory-calibration — DRAM Controller Calibration

### 01-dram-spd-discovery — Serial Presence Detect Topology Discovery
* 01-i2c-spd-eeprom-parsing — Problem: Memory controllers cannot configure physical timing parameters without discovering installed DRAM module capacities and CAS latencies from external EEPROM chips. | Primitives: Serial Presence Detect (SPD), I2C memory discovery.
* 02-dram-timing-parameter-synthesis — Problem: Programming incorrect clock cycle delays into memory controllers causes DRAM row buffer corruption and read errors. | Primitives: DRAM timing parameter matrix, Memory controller configuration.

### 02-dram-phy-training — Physical Layer Signal Calibration
* 01-dram-write-leveling-calibration — Problem: Physical trace length mismatches between clock and data lines cause clock-to-strobe skew at multi-gigahertz DDR frequencies. | Primitives: DRAM write leveling, Fly-by topology alignment.
* 02-dram-read-centering-eye-training — Problem: Temperature and voltage variations shift memory signal arrival times, requiring dynamic adjustment of delay lines to sample data in the center of the Data Eye. | Primitives: Read DQS centering, Data Eye Vref training, DFE equalization.
* 03-dram-memory-pattern-validation — Problem: Proceeding to load software onto unvalidated DRAM risks silent data corruption if physical memory cells or address lines are defective. | Primitives: Memory-mapped POST test, Pattern-based DRAM validation, Channel de-pop fallback, On-Die ECC initialization.
* 04-car-to-dram-context-migration — Problem: Transitioning execution from temporary Cache-as-RAM to trained physical DRAM requires migrating stack frames and global variables without losing execution context. | Primitives: Cache-as-RAM teardown, Stack migration execution.

## 03-multi-core-smp-initialization — Multi-Core Processor Initialization

### 01-smp-core-parking-architecture — Secondary Core Parking Architecture
* 01-bootstrap-processor-selection — Problem: Concurrent execution of the reset vector by all CPU cores in a multi-core socket causes race conditions and stack corruption. | Primitives: Bootstrap Processor (BSP), Application Processor (AP) selection.
* 02-application-processor-parking-states — Problem: Unselected secondary CPU cores consume excessive power and interfere with platform initialization unless placed into hardware parking states. | Primitives: Core parking state, Wait-for-SIPI loop, WFE/WFI loop.
* 03-privilege-level-boot-transitions — Problem: Booting operating system kernels requires transitioning CPU execution cores through hardware privilege levels while initializing architecture-specific control registers. | Primitives: x86 GDT/IDT descriptor setup, ARM Exception Level transitions (EL3/EL2), RISC-V M-Mode to S-Mode OpenSBI transition.

### 02-smp-core-wakeup-sequence — Application Processor Wakeup Mechanics
* 01-inter-processor-interrupt-wakeup — Problem: Bringing secondary parked cores into active execution requires structured hardware signaling without corrupting shared platform state. | Primitives: Startup Inter-Processor Interrupt (INIT-SIPI), PSCI CPU_ON call.
* 02-smp-coherence-synchronization-barrier — Problem: Allowing secondary cores to execute application code before their local caches and APIC state are synchronized causes platform deadlocks. | Primitives: Core synchronization barrier, Multi-core APIC initialization.

## 04-platform-bus-enumeration — Platform Bus Topology Enumeration

### 01-pcie-bus-tree-scanning — PCI Express Topology Tree Scanning
* 01-pcie-recursive-bus-enumeration — Problem: Operating systems cannot access peripheral devices without recursively scanning root ports, switches, and endpoints to assign Bus, Device, and Function numbers. | Primitives: Recursive bus scanning, BDF topology tree.
* 02-base-address-register-allocation — Problem: Peripheral device memory windows collide if physical Memory-Mapped I/O ranges are assigned without calculating required BAR sizes and reserving hot-plug padding. | Primitives: BAR resource allocation, Non-overlapping MMIO assignment, Hot-plug bridge padding, Early IOMMU protection.

### 02-system-description-tables — System Description Table Construction
* 01-acpi-table-structure-synthesis — Problem: Operating systems require a standardized, OS-agnostic hardware description format in RAM to discover CPU core counts, NUMA nodes, and interrupt routing. | Primitives: ACPI table generation, RSDP/MADT/SRAT/SLIT/PRT structures, ASL/AML table injection.
* 02-smbios-hardware-inventory-synthesis — Problem: System management software cannot inspect physical hardware serial numbers and memory slot topology without structured BIOS data tables in RAM. | Primitives: SMBIOS table structure, Hardware inventory management.
* 03-flattened-device-tree-synthesis — Problem: Embedded operating systems on ARM and RISC-V architectures require a lightweight compiled binary tree to discover non-discoverable memory-mapped peripherals. | Primitives: Flattened Device Tree (FDT), DeviceTree Blob (DTB) generation.

## 05-firmware-security-isolation — Firmware Security Isolation

### 01-system-management-mode — System Management Mode Memory Isolation
* 01-smm-smram-isolation-setup — Problem: Platform management routines requiring total isolation from the operating system kernel must configure protected hardware memory regions before kernel boot. | Primitives: System Management Mode (SMM), SMRAM relocation, SMM_LOCK configuration, SMI handler setup.

### 02-trustzone-security-partitioning — TrustZone Secure World Partitioning
* 01-trustzone-secure-world-partitioning — Problem: Hardware-enforced security domains in ARM architectures require partitioning physical memory and peripheral access before launching unprivileged execution environments. | Primitives: TrustZone Controller (TZC-400), Secure World partitioning, Memory encryption engine enablement (TME/SME/CCA).

## 06-kernel-execution-handoff — Platform Execution Handoff

### 01-cpu-mode-transition — CPU Execution Mode Transition
* 01-long-mode-architectural-entry — Problem: Booting 64-bit operating systems requires transitioning CPU execution cores from initial reset modes into 64-bit long mode with flat address spaces. | Primitives: CPU execution mode transition, Long mode entry.
* 02-firmware-memory-map-handoff — Problem: Operating systems overwrite critical firmware tables or reserved memory regions if the platform firmware does not pass an explicit physical memory map. | Primitives: Firmware memory map (E820/EFI), Reserved memory classification, UEFI Boot vs Runtime Services.
* 03-nvram-variable-storage-persistence — Problem: Preserving boot configuration choices and secure boot keys across system reboots requires managing non-volatile variable storage regions in Flash ROM. | Primitives: NVRAM variable storage, UEFI non-volatile variable management, A/B dual-bank fault tolerance.

### 02-bootstrapping-subsystem-synthesis — Integrated Platform Bootstrapping Synthesis
* 01-complete-bootstrapping-synthesis — Problem: Integrating power-on reset, Root of Trust verification, DRAM training, SMP core wakeup, PCIe enumeration, ACPI/FDT table generation, SMM/TrustZone isolation, and KASLR entropy seeding into a unified bootloader handoff introduces complex initialization dependencies and timing hazards. | Primitives: Integrated platform bootstrapping, Firmware handoff contract, KASLR RNG seeding.
