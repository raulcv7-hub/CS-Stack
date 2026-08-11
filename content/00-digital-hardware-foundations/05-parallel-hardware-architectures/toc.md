# parallel-hardware-architectures — Parallel Hardware Architectures

> **Assumed Prerequisites:** Out-of-order execution and scalar FPUs from `03-cpu-microarchitecture`; L1/L2/L3 cache line fills (64 bytes), memory bandwidth limits, and DRAM timing parameters from `04-memory-subsystems`.
> **Course Boundary:** Begins at SIMD vector processing extensions on CPUs (connecting 64-byte L1 cache fills directly to 512-bit vector registers) and ends at hardware Tensor Processing Units (TPUs), Systolic Arrays, CGRAs, and domain-specific AI accelerators integrated with High-Bandwidth Memory (HBM).
> **Explicit Exclusions:** ❌ No analog electronics, semiconductor substrate fabrication physics, or micro-bump physical mechanics, ❌ No high-level GPU programming languages or host APIs (CUDA, OpenCL, Vulkan, HIP, Metal - handled in Layer 10), ❌ No deep learning framework code or model training algorithms (handled in Layer 10), ❌ No multi-socket NUMA directory coherence protocols or DRAM memory controllers (handled in `04-memory-subsystems`), ❌ No high-level software application C/C++ code.

## 01-simd-vector-architectures — SIMD Vector Processing Architectures

### 01-vector-register-file-design — Vector Register File Architecture
* 01-vector-register-file-partitioning — Problem: Scalar register files cannot store wide data vectors without massive physical pin congestion and area overhead. | Primitives: Vector register file, Vector lane.
* 02-packed-simd-execution-units — Problem: Executing operations on wide vector registers using scalar ALUs requires sequential iteration, forfeiting parallel throughput. | Primitives: SIMD execution unit, Sub-word parallelism.
* 03-vector-horizontal-reduction-units — Problem: Computing reductions across elements within a single vector register requires cross-lane data routing that vertical SIMD ALUs cannot execute. | Primitives: Horizontal reduction tree, Cross-lane interconnect.
* 04-vector-floating-point-exception-handling — Problem: Parallel floating-point operations generating traps across multiple vector lanes cause status register contention and execution pipeline stalls. | Primitives: Vector exception status register, Parallel trap masking.
* 05-vector-power-frequency-throttling — Problem: Executing wide 512-bit SIMD vector units causes sudden dynamic power spikes and voltage droops, forcing hardware frequency throttling. | Primitives: Vector frequency throttling, Voltage droop mitigation.

### 02-vector-length-agnostic-architectures — Vector Length Agnostic Architectures
* 01-vector-length-agnostic-programming — Problem: Hardcoding fixed vector register widths into instruction encodings forces complete software re-compilation whenever hardware vector widths change. | Primitives: Vector length register, Length-agnostic ISA.
* 02-non-faulting-vector-loads — Problem: Speculative vector memory accesses crossing page boundaries trigger illegal page faults before vector loop bounds are known. | Primitives: Non-faulting vector load, First-fault register.

### 03-vector-memory-subsystems — Vector Memory Access Architecture
* 01-vector-strided-memory-access — Problem: Non-contiguous memory strides cause scalar load loops to stall vector register fills. | Primitives: Vector strided access, Stride generator.
* 02-vector-scatter-gather-engine — Problem: Indirect pointer-based array indexing causes non-linear memory accesses that cannot be fetched via constant strides. | Primitives: Scatter-gather unit, Vector index register.

### 04-vector-control-predication — Vector Execution Predication
* 01-vector-predicate-masking-mechanics — Problem: Conditional branching inside vector loops forces scalar fallback or invalidates execution across entire vector lanes. | Primitives: Vector predicate mask, Lane disabling.

## 02-simt-gpu-microarchitecture — SIMT GPU Core Architecture

### 01-warp-execution-engines — Warp Execution Architecture
* 01-simt-execution-model-mechanics — Problem: Managing thousands of independent thread instruction pointers in hardware requires excessive control logic silicon. | Primitives: SIMT execution model, Warp thread grouping.
* 02-hardware-warp-scheduler-architecture — Problem: Long memory latencies stall GPU execution lanes if thread schedules cannot switch instantly. | Primitives: Hardware warp scheduler, Zero-overhead thread switching.
* 03-special-function-unit-pipeline — Problem: Evaluating transcendental mathematical functions using standard IEEE-754 ALUs requires dozens of execution cycles. | Primitives: Special Function Unit (SFU), Quadratic interpolation pipeline.
* 04-asynchronous-hardware-transaction-barriers — Problem: Synchronizing warp execution using static barrier instructions freezes execution lanes during background DMA memory staging. | Primitives: Hardware transaction barrier, Asynchronous arrive-wait counter.
* 05-intra-warp-register-shuffle — Problem: Exchanging data between threads in the same warp via scratchpad shared memory incurs unnecessary memory pipeline latency. | Primitives: Warp shuffle instruction, Lane register crossbar.

### 02-branch-divergence-engines — Branch Divergence Resolution Architecture
* 01-divergence-stack-branch-execution — Problem: Threads within the same warp taking different conditional execution paths cause instruction serialization. | Primitives: Branch divergence stack, Re-convergence IP point.
* 02-warp-level-active-masking — Problem: Executing divergent paths requires tracking which individual threads are active during instruction dispatch. | Primitives: Active thread mask, Divergent execution penalty.

### 03-gpu-memory-subsystems — GPU Memory Subsystem Architecture
* 01-scratchpad-shared-memory-bank-conflicts — Problem: Simultaneous multi-thread accesses to the same SRAM bank cause memory access serialization. | Primitives: Scratchpad shared memory, Bank conflict resolution.
* 02-coalesced-global-memory-access — Problem: Unaligned or non-contiguous thread memory requests waste DRAM bus bandwidth by issuing duplicate line fills. | Primitives: Memory coalescing unit, Coalesced bus transaction.
* 03-asynchronous-memory-copy-engines — Problem: Staging global memory data into scratchpad shared memory through intermediate register files wastes register file bandwidth and execution cycles. | Primitives: Asynchronous memory copy, Direct SRAM transfer.
* 04-gpu-hardware-atomic-units — Problem: Concurrent multi-thread read-modify-write operations on shared memory locations cause data races and pipeline stalls. | Primitives: GPU hardware atomic unit, Near-memory ALU.
* 05-gpu-scoped-memory-consistency — Problem: Enforcing global cache coherence across thousands of GPU cores on every store operation consumes prohibitive interconnect bandwidth. | Primitives: Scoped memory consistency, Scope-based cache flush.
* 06-gpu-crossbar-l2-partitioning — Problem: Routing memory traffic from dozens of execution cores to multiple L2 cache partitions causes interconnect contention. | Primitives: GPU crossbar interconnect, Partitioned L2 cache.

### 04-gpu-virtualization-translation — GPU Virtualization Memory Translation Architecture
* 01-gpu-multi-level-tlb-translation — Problem: Parallel address translation for thousands of concurrent GPU threads saturates single-entry TLB structures. | Primitives: GPU multi-level TLB, Page Fault Engine.
* 02-hardware-multi-instance-partitioning — Problem: Sharing a GPU among multiple independent tenant workloads without hardware isolation causes spatial interference and security leaks. | Primitives: Multi-Instance GPU (MIG), Hardware spatial partitioning.

## 03-systolic-array-accelerators — Systolic Array Matrix Accelerators

### 01-systolic-array-dataflow-processing — Systolic Array Dataflow Processing
* 01-matrix-multiply-systolic-dataflow — Problem: Reading matrix operands from memory for every multiply-accumulate operation saturates memory interconnect bandwidth. | Primitives: Systolic array, Processing Element (PE) grid.
* 02-weight-stationary-dataflow-mechanics — Problem: Re-streaming neural network filter weights from memory for every input activation wastes register file energy. | Primitives: Weight-stationary dataflow, Local weight register.
* 03-output-stationary-dataflow-mechanics — Problem: Streaming partial accumulation results back and forth to external memory drains battery power and increases latency. | Primitives: Output-stationary dataflow, Accumulator register grid.
* 04-input-stationary-dataflow-mechanics — Problem: Re-loading streaming input activations for static matrix operations causes redundant memory fetch traffic. | Primitives: Input-stationary dataflow, Activation buffer register.

## 04-spatial-reconfigurable-architectures — Spatial Reconfigurable Architectures

### 01-coarse-grained-reconfigurable-arrays — Coarse-Grained Reconfigurable Array Architecture
* 01-cgra-spatial-dataflow-execution — Problem: Fetching and decoding instruction streams on every cycle for fixed spatial algorithms consumes excessive control power. | Primitives: Coarse-Grained Reconfigurable Array (CGRA), Spatial dataflow routing.
* 02-on-chip-network-topologies — Problem: Communicating data between hundreds of spatial processing elements without shared buses causes interconnect wiring gridlock. | Primitives: Network-on-Chip (NoC), Wormhole packet routing.
* 03-scratchpad-dma-decoupled-streaming — Problem: Spatial dataflow processing elements stall if memory operand staging requires manual CPU intervention. | Primitives: Scratchpad DMA engine, Decoupled stream buffer.

## 05-tensor-core-accelerators — Tensor Core Domain-Specific Accelerators

### 01-tensor-core-microarchitecture — Tensor Core Execution Engine
* 01-mixed-precision-mac-array-synthesis — Problem: Single-precision floating-point matrix units consume prohibitive silicon die area and energy at scale. | Primitives: Mixed-precision MAC unit, Tensor processing core.
* 02-sub-byte-microscaling-number-formats — Problem: High-precision floating-point formats consume excessive memory bandwidth and MAC silicon area in AI workloads. | Primitives: Sub-byte FP8/INT4 format, Microscaling (MXFP) unit.
* 03-stochastic-rounding-hardware — Problem: Standard nearest-even rounding in low-precision accumulation causes gradient quantization bias and training divergence. | Primitives: Stochastic rounding unit, Hardware pseudo-random generator.
* 04-warp-matrix-multiply-accumulate — Problem: Individual SIMT threads executing scalar MAC instructions cannot coordinate warp-wide matrix tile operations efficiently. | Primitives: Warp Matrix Multiply Accumulate (WMMA), Cooperative warp tile operation.
* 05-hardware-structured-sparsity-engines — Problem: Computing zero-value matrix entries wastes execution energy and memory bandwidth in deep learning workloads. | Primitives: Hardware structured sparsity, Sparse tensor engine.
* 06-unstructured-sparsity-hardware-engines — Problem: Non-zero values in arbitrary non-structured sparse matrices cannot be aligned to fixed 2:4 structured sparsity bitmap execution units. | Primitives: Unstructured sparsity engine, Index compression decoder.

### 02-high-bandwidth-memory-subsystems — High-Bandwidth Memory Architecture
* 01-hbm-interposer-stack-architecture — Problem: Standard DDR DRAM buses cannot deliver the terabytes-per-second memory bandwidth required by parallel tensor engines. | Primitives: High-Bandwidth Memory (HBM), 1024-bit wide memory bus interface.
* 02-hbm-hardware-error-resilience — Problem: Microscopic thermal expansion and dense physical stacking in 3D HBM dies increase soft bit-flip error rates during tensor execution. | Primitives: HBM multi-tier ECC, Sideband error correction.

### 03-accelerator-interconnect-networks — Accelerator Interconnect Networks
* 01-accelerator-chip-to-chip-interconnects — Problem: Scaling tensor computations across multiple accelerator dies requires higher bandwidth than standard PCIe slots provide. | Primitives: Accelerator scale-up link, Direct chip-to-chip interconnect.
* 02-switched-interconnect-router-architecture — Problem: Point-to-point inter-chip links cannot scale to hundreds of accelerator nodes without multi-hop latency bottlenecks. | Primitives: Switched interconnect router, In-network reduction engine.
* 03-cxl-heterogeneous-cache-coherence — Problem: Maintaining software-managed memory copies between host CPU memory and accelerator attached memory introduces driver overheads and latency penalties. | Primitives: CXL.cache protocol, CXL.mem protocol.

## 06-integrated-parallel-system-synthesis — Integrated Parallel Hardware System Synthesis

### 01-parallel-subsystem-integration — Heterogeneous Parallel Subsystem Synthesis
* 01-heterogeneous-parallel-subsystem-synthesis — Problem: Integrating scalar CPUs, SIMT GPU cores, tensor systolic arrays, and HBM controllers creates complex interconnect arbitration and Roofline performance bottlenecks. | Primitives: Integrated parallel subsystem, Roofline performance model.