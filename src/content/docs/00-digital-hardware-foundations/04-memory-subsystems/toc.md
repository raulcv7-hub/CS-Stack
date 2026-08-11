---
title: "04. Memory Subsystems - Table of Contents"
---

# memory-subsystems — Memory Subsystems Architecture

> **Assumed Prerequisites:** Scalar and out-of-order processor datapaths, register files, Load-Store Queues (LSQ), memory disambiguation, and memory bus cycles from `03-cpu-microarchitecture`.
> **Course Boundary:** Begins at SRAM cache cell mechanics, L1 cache pipeline integration, and hardware TLB architecture, progresses through cache placement policies, non-blocking caches, hardware memory consistency models (TSO/WMO/Fences), multi-core cache coherence protocols, digital DRAM command state machines, and NUMA directory interconnects, and ends at integrated memory subsystem synthesis.
> **Explicit Exclusions:** ❌ No analog electrical circuit physics, transmission line reflection, or On-Die Termination (ODT) resistor design (belongs to Electrical Engineering), ❌ No software OS virtual memory page table allocation algorithms or page fault handlers (handled in Layer 04 `virtual-memory-systems`), ❌ No C/C++ dynamic memory allocators or heap management (handled in Layer 01 `heap-memory-allocators`), ❌ No non-volatile storage, NVMe, or flash translation layers (handled in Layer 04 `solid-state-storage-systems`).

## 01-sram-cache-architectures — SRAM Cache Memory Architectures

### 01-sram-storage-mechanics — SRAM Storage Mechanics
* 01-sram-six-transistor-cell-mechanics — Problem: CPU operational speeds outpace main memory access speeds by orders of magnitude, stalling execution on memory reads. | Primitives: SRAM 6T cell, Memory Wall.
* 02-cache-line-spatial-locality — Problem: Fetching data byte-by-byte over memory buses wastes channel bandwidth and ignores adjacent memory access patterns. | Primitives: Cache line, Spatial locality.
* 03-temporal-locality-hit-metrics — Problem: Repeatedly fetching recently accessed instructions from main memory introduces redundant bus latency penalties. | Primitives: Temporal locality, Cache hit latency.
* 04-harvard-split-cache-invalidation — Problem: Modifying instruction code in memory creates inconsistency between data and instruction caches in split-bus architectures. | Primitives: Harvard split cache, Instruction cache invalidation.

### 02-cache-mapping-mechanics — Cache Mapping Mechanics
* 01-direct-mapped-cache-indexing — Problem: Searching an entire cache array for a specific address on every clock cycle requires excessive parallel comparison logic. | Primitives: Direct-mapped cache, Cache tag-index-offset decomposition.
* 02-conflict-miss-thrashing — Problem: Multiple active variables mapping to the same cache line index cause continuous ping-pong eviction loops. | Primitives: Conflict miss, Cache thrashing.
* 03-set-associative-way-selection — Problem: Direct-mapped caches suffer from high conflict miss rates, while fully-associative caches require power-hungry parallel comparators. | Primitives: Set-associative cache, Way selection logic.
* 04-pseudo-lru-replacement-state-machine — Problem: True LRU replacement in high-associativity caches requires large tracking registers and complex comparison trees. | Primitives: Pseudo-LRU replacement, Tree-PLRU state machine.

### 03-address-translation-caching — Translation Caching Mechanics
* 01-hardware-tlb-architecture — Problem: Translating virtual addresses to physical addresses on every memory reference adds multi-cycle page table lookup delays to the cache pipeline. | Primitives: Translation Lookaside Buffer, Page Table Walker.
* 02-virtually-indexed-physically-tagged-aliasing — Problem: Indexing L1 caches with virtual page offsets created by the OS introduces cache line synonym aliasing hazards. | Primitives: Virtually Indexed Physically Tagged cache, Cache synonym aliasing.
* 03-page-walk-cache-acceleration — Problem: Multi-level page table walking during TLB misses stalls the execution pipeline on sequential page table memory references. | Primitives: Page walk cache, MMU translation pipeline.

### 04-write-policies-integration — Write Policies Integration
* 01-write-through-policy-mechanics — Problem: Writing every store operation directly to main memory saturates bus bandwidth and stalls execution. | Primitives: Write-through policy, Bus store traffic.
* 02-write-back-dirty-bit-mechanics — Problem: Holding modified data in cache without updating main memory risks data loss unless dirty lines are explicitly tracked. | Primitives: Write-back policy, Dirty bit tracking.
* 03-single-core-cache-subsystem-synthesis — Problem: Integrating tag decoders, way multiplexers, replacement state machines, and write-back logic into a single-core cache creates complex timing feedback paths. | Primitives: Integrated single-core cache, Cache controller datapath.

## 02-non-blocking-caches-memory-models — Non-Blocking Caches and Memory Models

### 01-write-allocation-buffering — Write Allocation Buffering Mechanics
* 01-write-allocate-policy-mechanics — Problem: Store misses force the CPU to wait for write target lines to be retrieved from main memory before completing the write. | Primitives: Write-allocate policy, Write-no-allocate policy.
* 02-write-buffer-store-merging — Problem: Write-through and write-back eviction operations stall the CPU pipeline while waiting for memory bus availability. | Primitives: Write buffer queue, Store merging.

### 02-non-blocking-cache-mshr — MSHR Non-Blocking Architecture
* 01-non-blocking-cache-concurrency — Problem: Out-of-order CPUs stall on the first cache miss if the cache controller cannot process subsequent independent memory requests. | Primitives: Non-blocking cache, Hit-under-miss capability.
* 02-miss-status-holding-register-architecture — Problem: Tracking multiple outstanding memory misses without duplicating physical address requests requires structured hardware tracking tables. | Primitives: Miss Status Holding Register (MSHR), Miss merging.

### 03-hardware-memory-consistency-models — Hardware Memory Consistency Models
* 01-total-store-order-memory-model — Problem: Buffering store operations in private CPU write buffers causes memory instructions to execute out of program order across cores. | Primitives: Total Store Order (TSO), Store buffer reordering.
* 02-weak-memory-ordering-acquire-release — Problem: Strict TSO ordering constraints limit aggressive out-of-order memory execution in ARM and RISC-V multi-core architectures. | Primitives: Weak memory ordering, Acquire-release semantics.
* 03-hardware-memory-fence-execution — Problem: Out-of-order memory execution prevents multi-threaded software from synchronizing flag variables reliably without hardware serialization. | Primitives: Memory fence instruction, Hardware pipeline drain.

### 04-hardware-prefetching-engines — Hardware Prefetching Engines
* 01-hardware-stride-prefetching-mechanics — Problem: Waiting for cache misses to trigger line fetches wastes execution cycles during predictable memory traversals. | Primitives: Hardware stride prefetcher, Reference prediction table.
* 02-stream-buffer-architecture — Problem: Prefetched cache line pollution displaces active working-set data in primary cache sets. | Primitives: Stream buffer, Prefetch queue.

## 03-cache-coherence-protocols — Cache Coherence Protocols

### 01-bus-snooping-coherence — Bus Snooping Invalidation
* 01-cache-coherence-hazard-identification — Problem: Private caches in multi-core processors allow cores to modify local data lines without notifying other cores, causing stale reads. | Primitives: Cache coherence hazard, Coherence invariant.
* 02-snooping-bus-invalidation-mechanics — Problem: Broadcast coherence queries saturate shared interconnects if every cache read triggers a global bus query. | Primitives: Bus snooping, Bus invalidation signal.

### 02-mesi-coherence-state-machines — MESI Protocol Machines
* 01-mesi-protocol-state-transitions — Problem: Differentiating between clean shared lines, private un-modified lines, and modified lines requires a structured state engine per cache line. | Primitives: MESI states, Coherence state transition.
* 02-mesi-bus-transaction-arbitration — Problem: Concurrent coherence write requests from multiple cores cause race conditions on shared bus lines. | Primitives: Bus transaction arbitration, Read-for-Ownership.

### 03-moesi-mesif-protocols — Advanced Coherence Protocols
* 01-moesi-owner-state-cache-transfers — Problem: Forcing a modified cache line to be written back to main memory before sharing it with another core introduces unnecessary DRAM latency. | Primitives: MOESI Owner state, Inter-cache line transfer.
* 02-mesif-forward-state-protocol — Problem: Multiple cores holding clean shared lines simultaneously flood the bus with redundant responses during cache query requests. | Primitives: MESIF Forward state, Response designation.
* 03-inclusive-exclusive-cache-filtering — Problem: Duplicating L1 cache contents inside L2/L3 caches wastes capacity, while non-inclusive caches complicate coherence invalidation filtering. | Primitives: Inclusive cache policy, Exclusive cache policy, Victim cache.

## 04-dram-architecture-controllers — Digital DRAM Controllers

### 01-dram-bank-architecture — DRAM Bank Architecture
* 01-one-transistor-one-capacitor-cell-mechanics — Problem: Storing bits as microscopic electrical charges on capacitors causes data leakage, making static storage impossible. | Primitives: 1T1C DRAM cell, Destructive read.
* 02-dram-periodic-refresh-mechanics — Problem: Capacitor charge leakage degrades stored binary states unless memory lines are systematically recharged. | Primitives: Periodic refresh cycle, Refresh penalty stall.
* 03-dram-matrix-row-buffer-architecture — Problem: Connecting address lines directly to millions of 1T1C cells requires an impossible number of physical package pins. | Primitives: Row buffer, DRAM bank array, RAS-CAS address multiplexing.

### 02-dram-command-pipeline-timing — DRAM Command Pipeline Timing
* 01-dram-timing-parameters-activation — Problem: Opening, reading, and closing a DRAM row requires precise clock-cycle delays that penalize random row accesses. | Primitives: DRAM timing parameters, Row buffer hit conflict.
* 02-dram-rank-channel-parallelism — Problem: A single DRAM bank cannot service new requests while precharging its row buffer, creating memory bus stalls. | Primitives: Bank-level parallelism, DRAM rank, Memory channel, Bank group parallelism.
* 03-dram-burst-strobe-data-alignment — Problem: High-frequency memory transfers require clock-synchronous strobe signals to capture multi-word data bursts deterministically. | Primitives: DRAM burst transfer, Data Strobe signal alignment.

### 03-memory-controller-scheduling — Memory Controller Scheduling
* 01-fr-fcfs-command-scheduling — Problem: Processing memory requests in strict arrival order causes continuous row buffer conflicts and degrades bus bandwidth. | Primitives: FR-FCFS scheduling, Command queue reordering.
* 02-open-page-policy-mechanics — Problem: Closing DRAM rows immediately after every access wastes precharge and activation cycles during streaming workloads. | Primitives: Open-page policy, Row buffer hit optimization.
* 03-closed-page-policy-mechanics — Problem: Keeping DRAM rows open indefinitely causes severe precharge latency penalties when subsequent accesses hit different rows. | Primitives: Closed-page policy, Auto-precharge command.
* 04-dram-controller-pipeline-synthesis — Problem: Integrating command queues, FR-FCFS schedulers, timing counters, and PHY bus interfaces into a unified controller creates complex timing loops. | Primitives: Integrated DRAM controller, Memory controller command pipeline.

## 05-numa-topologies-system-integration — NUMA System Integration

### 01-numa-directory-architecture — NUMA Directory Architecture
* 01-numa-node-latency-asymmetry — Problem: Connecting dozens of CPU sockets to a single centralized memory controller creates a physical wiring and bandwidth bottleneck. | Primitives: Non-Uniform Memory Access, Local versus remote latency.
* 02-directory-based-coherence-architecture — Problem: Bus snooping fails to scale across multi-socket NUMA systems because broadcasting invalidations floods point-to-point interconnects. | Primitives: Directory-based coherence, Directory state vector, Point-to-point invalidation.

### 02-integrated-memory-subsystem-synthesis — Integrated Memory Subsystem Synthesis
* 01-complete-memory-subsystem-integration — Problem: Integrating L1/L2/L3 caches, non-blocking MSHRs, hardware TSO consistency, snooping/directory coherence, DRAM controllers, and NUMA interconnects creates massive cross-domain feedback and deadlock hazards. | Primitives: Integrated memory subsystem, End-to-end memory pipeline.