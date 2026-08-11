# hardware-interconnects — Hardware Interconnects Architecture

> **Assumed Prerequisites:** Single-cycle and pipelined CPU datapaths, Load-Store Queues (LSQ), out-of-order execution, and memory disambiguation from `03-cpu-microarchitecture`; L1/L2/L3 cache line fills (64 bytes), write buffers, memory controllers, DRAM timing parameters, and multi-socket NUMA topologies from `04-memory-subsystems`; Memory-Mapped I/O (MMIO) register addressing from `06-assembly-language-mechanics`.
> **Course Boundary:** Begins at on-chip system-on-chip (SoC) bus interconnects (AHB, AXI4, Crossbars) and off-chip point-to-point serial interfaces (PCIe) and ends at hardware DMA engines, IOMMU address translation, heterogeneous cache-coherent interconnects (CXL), and integrated SoC interconnect subsystem synthesis.
> **Explicit Exclusions:** ❌ No operating system kernel device drivers or C/C++ driver code (handled in Layer 04 `device-driver-subsystems`), ❌ No high-level host software application APIs (OpenCL, CUDA, Vulkan - Layer 10), ❌ No analog High-Speed SerDes physical transceiver circuit design or PCB signal reflections (Electrical Engineering), ❌ No multi-socket directory coherence protocols (handled in `04-memory-subsystems`).

## 01-on-chip-soc-interconnects — On-Chip System-on-Chip Interconnects

### 01-axi4-bus-handshake-architecture — AXI4 Bus Handshake Architecture
* 01-shared-bus-contention-bottlenecks — Problem: Shared parallel internal buses suffer from high capacitive loading and arbitration contention when multiple IP cores execute concurrent memory requests. | Primitives: On-chip shared bus, Centralized bus arbitration.
* 02-axi4-channel-handshake-mechanics — Problem: Coupling read and write address/data channels into a single unified bus transaction forces pipeline stalls during asymmetric memory latencies. | Primitives: AXI4 five-channel architecture, Valid/Ready handshake protocol.
* 03-axi4-split-transaction-pipelining — Problem: Waiting for a slow memory response before issuing subsequent read or write commands locks internal interconnect channels. | Primitives: Split-transaction bus, Out-of-order transaction ID tag.
* 04-axi4-burst-types-and-4kb-boundary — Problem: Un-aligned memory accesses crossing 4KB page boundaries violate slave address decoding without wrapping/incrementing burst constraints and byte-strobe masking. | Primitives: AXI4 burst modes (`INCR`/`WRAP`/`FIXED`), 4KB boundary protection.

### 02-on-chip-crossbar-matrix-routing — On-Chip Crossbar Matrix Routing
* 01-axi-crossbar-matrix-interconnect — Problem: Connecting M master IP cores to N slave memory targets via a single shared bus causes structural port blocking. | Primitives: AXI crossbar matrix, Multi-master interconnect.
* 02-axi-ordering-rules-hazard-mitigation — Problem: Reordering AXI transactions with identical ID tags across crossbar switches causes Read-After-Write (RAW) data corruption. | Primitives: AXI transaction ordering rule, Interconnect ID hazard mitigation.
* 03-axi-exclusive-access-monitors — Problem: Multi-core hardware cannot execute atomic read-modify-write operations across AXI interconnects without reservation tracking and exclusive response signals. | Primitives: AXI exclusive access (`ARLOCK`/`AWLOCK`), Reservation monitor (`EXOKAY`).
* 04-register-slice-timing-closure — Problem: Long combinational propagation paths across large crossbar matrices degrade clock frequency without pipelined register slices. | Primitives: Interconnect register slice, Timing closure bridge.
* 05-data-width-cdc-converter-bridges — Problem: Interfacing high-frequency wide master cores with low-frequency narrow slave peripherals causes bus protocol mismatches. | Primitives: Data width converter, Asynchronous CDC bridge.

## 02-pcie-protocol-stack-topology — PCI Express Protocol Stack

### 01-pcie-layered-protocol-stack — PCIe Protocol Layering
* 01-parallel-bus-skew-limitation — Problem: Multi-wire parallel expansion buses (PCI/PCI-X) experience clock-to-data trace skew at high clock frequencies, limiting transfer speeds. | Primitives: Point-to-point serial link, Differential signaling lane.
* 02-pcie-transaction-layer-packets — Problem: Inefficient raw memory transfers lack structured payload framing, TLP routing mechanisms (Address/BDF/Implicit), and flow control credits. | Primitives: Transaction Layer Packet (TLP), TLP routing mechanism.
* 03-pcie-data-link-layer-reliability — Problem: Physical transmission noise across high-speed serial links corrupts transaction packet bits during transit, triggering replay buffer overflows. | Primitives: Data Link Layer Packet (DLLP), Replay buffer NAK retry.
* 04-pcie-credit-based-flow-control — Problem: Transmitting transaction packets faster than a receiver's internal buffer can process causes packet drops and link congestion. | Primitives: Credit-based flow control, Flow control buffer credit update.
* 05-pcie-flit-mode-framing — Problem: Variable-length TLP headers introduce framing overhead and alignment complexity at Gen6/Gen7 PAM4 multi-gigabit speeds. | Primitives: FLIT mode framing, PAM4 encoding payload.

### 02-pcie-device-configuration-architecture — PCIe Device Configuration Architecture
* 01-pcie-bar-address-decoding — Problem: CPU software cannot access peripheral device registers without dynamic physical memory range allocation and hardware base address decoding. | Primitives: PCIe Configuration Space, Base Address Register (BAR).
* 02-pcie-message-signaled-interrupts — Problem: Dedicated physical interrupt wires (INTx) scale poorly on high-density SoCs and introduce race conditions with DMA memory transfers. | Primitives: Message Signaled Interrupts (MSI/MSI-X), In-band interrupt TLP.
* 03-pcie-sr-iov-hardware-virtualization — Problem: Sharing a physical PCIe endpoint among multiple virtual machines without hardware isolation forces expensive software emulation. | Primitives: Single Root I/O Virtualization (SR-IOV), Physical vs Virtual Functions (PF/VF).
* 04-pcie-error-poisoning-completion-timeouts — Problem: Packet corruption or dropped completions on PCIe links freeze CPU pipelines without hardware error detection and poisoning mechanisms. | Primitives: Advanced Error Reporting (AER), TLP poisoning.
* 05-pcie-ltssm-link-equalization — Problem: High-frequency serial links suffer from signal degradation without hardware state machine training and transmitter/receiver equalization. | Primitives: Link Training and Status State Machine (LTSSM), Link equalization.
* 06-pcie-aspm-low-power-states — Problem: Idle peripheral links consume high static power without dynamic low-power link state management. | Primitives: Active State Power Management (ASPM), L0s/L1 power link states.

## 03-peripheral-memory-transfer-subsystems — Peripheral Memory Transfer Subsystems

### 01-hardware-dma-engines — Direct Memory Access Architecture
* 01-cpu-polled-io-throughput-penalty — Problem: Forcing the CPU to copy every byte between peripheral devices and main DRAM wastes execution cycles and stalls pipelines. | Primitives: Direct Memory Access (DMA), Hardware DMA engine.
* 02-scatter-gather-dma-descriptors — Problem: Transferring large, non-contiguous physical memory buffers with simple register-based DMA requires constant CPU interruption per block and un-aligned packing. | Primitives: Scatter-gather DMA, Completion queue pointers.
* 03-dma-cache-coherence-snooping — Problem: A DMA engine writing data directly to main DRAM without notifying the CPU cache hierarchy leaves stale lines inside L1/L2 caches. | Primitives: Snoop-assisted DMA write, DMA cache coherence.
* 04-ddio-direct-data-injection — Problem: Writing DMA payloads to off-chip DRAM forces CPU cores to suffer L3 cache misses when reading peripheral input data. | Primitives: Data Direct I/O (DDIO), Direct LLC data injection.

### 02-iommu-memory-translation — Hardware IOMMU Memory Isolation
* 01-dma-physical-addressing-vulnerability — Problem: Malicious or buggy peripheral devices issuing raw physical address DMA transfers can overwrite kernel memory or bypass virtual memory isolation. | Primitives: Input-Output Memory Management Unit (IOMMU), IO Virtual Address (IOVA).
* 02-iommu-page-table-walk-acceleration — Problem: Translating IOVAs to physical addresses on every DMA packet adds latency to peripheral data transfers. | Primitives: IOMMU page table walk, IOTLB translation cache.
* 03-iommu-interrupt-remapping — Problem: Guest virtual machines in a multi-tenant server can spoof or intercept device interrupts without hardware interrupt vector remapping. | Primitives: Interrupt remapping, Vector isolation table.
* 04-iommu-ats-pri-address-translation — Problem: High-throughput endpoints experience IOMMU translation bottlenecks when all address translations must execute at the host IOMMU. | Primitives: Address Translation Services (ATS), Page Request Interface (PRI).
* 05-pasid-shared-virtual-memory — Problem: User-space applications cannot dispatch DMA transfers directly from user-virtual addresses without kernel memory pinning and translation overhead. | Primitives: Process Address Space ID (PASID), Shared Virtual Memory (SVM).

## 04-coherent-accelerator-interconnects — Heterogeneous Coherent Interconnects

### 01-cxl-protocol-architecture — Compute Express Link Architecture
* 01-host-accelerator-memory-copy-overhead — Problem: Maintaining separate, un-coordinated memory pools between host CPUs and PCIe-attached accelerators requires expensive software memory copies. | Primitives: Heterogeneous cache coherence, Compute Express Link (CXL).
* 02-cxl-sub-protocol-multiplexing — Problem: Unifying I/O access, host cache snooping, and device-attached memory access over a single physical link requires distinct transaction protocols. | Primitives: CXL.io protocol, CXL.cache protocol.
* 03-cxl-mem-protocol-expanders — Problem: Scaling main memory capacity beyond motherboard DIMM slots requires low-latency, device-attached memory expansion over serial links. | Primitives: CXL.mem protocol, Type 3 memory expander.
* 04-cxl-memory-bias-coherence-modes — Problem: Frequent ping-ponging of cache line ownership between host CPU and accelerator device during local compute phases wastes interconnect bandwidth. | Primitives: Host Bias mode, Device Bias mode.
* 05-cxl-memory-pooling-mld-devices — Problem: Allocating static memory capacity to individual server nodes leads to stranded memory and poor utilization across cloud data centers. | Primitives: CXL memory pooling, Multi-Logical Device (MLD).

## 05-integrated-interconnect-subsystem-synthesis — Integrated Interconnect Subsystem Synthesis

### 01-interconnect-subsystem-integration — Integrated SoC Interconnect Subsystem
* 01-interconnect-virtual-channel-deadlock-prevention — Problem: Sharing interconnect buffer queues among requests, invalidations, and data responses creates circular dependencies and protocol deadlocks. | Primitives: Interconnect Virtual Channels (VC), Protocol deadlock prevention.
* 02-complete-interconnect-subsystem-synthesis — Problem: Integrating AXI crossbars, PCIe Root Complexes, DMA engines, IOMMUs with ATS/PASID, and CXL memory controllers into a unified SoC creates complex arbitration contention and timing hazards. | Primitives: Integrated interconnect subsystem, End-to-end I/O transaction datapath.