# cpu-microarchitecture — CPU Microarchitecture

> **Assumed Prerequisites:** Combinational logic gates, binary ALUs, status condition flags (Z, C, N, V), registers, multiplexers, Finite State Machines (FSMs), and basic SystemVerilog RTL synthesis concepts from `01. digital-logic-design` and `02. rtl-hardware-design`.
> **Course Boundary:** Begins at scalar single-cycle datapath and control unit synthesis and ends at fully integrated out-of-order superscalar microarchitectures with front-end micro-op caches, instruction fusion, Tomasulo's algorithm, physical register renaming, load-store queue memory disambiguation, branch prediction (Gshare/TAGE), reorder buffer commitment, and simultaneous multithreading (SMT).
> **Explicit Exclusions:** ❌ No software assembly programming language syntax or OS ABI calling conventions (handled in `06. assembly-language-mechanics`), ❌ No complex DRAM memory controllers or multi-level L1/L2/L3 cache coherence protocols (handled in `04. memory-subsystems`), ❌ No hardware MMU/TLB page table walkers or virtual memory translation (handled in `04. memory-subsystems`), ❌ No multi-lane SIMD vector execution engines or GPU SIMT architectures (handled in `05. parallel-hardware-architectures`), ❌ No high-level programming language code (C/C++).

## 01-scalar-processor-datapaths — Scalar Execution Datapaths and Control Engines

### 01-single-cycle-datapath-synthesis — Single-Cycle Architecture and Instruction Decoding
* 01-instruction-fetch-and-von-neumann-architecture — Problem: Executing sequential instructions requires a structured, clock-driven state machine to cycle through instruction fetch, PC increment, and memory access without state corruption. | Primitives: Von Neumann execution cycle, Instruction Fetch (IF) datapath, Program Counter (PC) increment logic.
* 02-memory-alignment-and-endianness-hardware — Problem: CPU architectures attempting to access unaligned memory addresses across word boundaries face data bus corruption and multi-cycle bus stalls. | Primitives: Memory alignment routing hardware, Unaligned access penalties, Endianness byte-swapping logic.
* 03-single-cycle-datapath-and-decoder-synthesis — Problem: Executing distinct instruction types (R-type, I-type, Load/Store, Branch) in a single clock cycle requires a unified combinational datapath with multiplexed control signals. | Primitives: Single-cycle datapath, Main Control Unit decoder, ALU Control Unit.

### 02-multicycle-and-microcoded-control — Multicycle Execution and Microcode State Machines
* 01-multicycle-datapath-and-register-sharing — Problem: Single-cycle datapaths force the clock period to match the worst-case propagation delay of the slowest instruction, wasting time on fast instructions. | Primitives: Multicycle datapath, Intermediate state registers, Shared ALU resource.
* 02-microcoded-control-unit-architecture — Problem: Hardwired FSM control units for complex multi-step instructions become exponentially large, unmaintainable, and difficult to modify. | Primitives: Microcode Control Store, Microinstruction ROM, Micro-program Counter ($\mu$PC).

### 03-hardware-execution-units-and-fpus — Integer Multipliers, Dividers, and Floating-Point Units
* 01-hardware-fixed-point-shifter-and-barrel-array — Problem: Multi-bit shifts and fixed-point scaling operations require many clock cycles if evaluated iteratively through standard adders. | Primitives: Barrel shifter datapath, Fixed-point scaling logic.
* 02-booths-algorithm-and-iterative-multipliers — Problem: Multi-bit signed multiplication cannot evaluate in a single clock cycle without massive physical combinational gate arrays or Wallace/Dadda adder trees. | Primitives: Booth's algorithm multiplier, Multi-cycle shift-add datapath, Wallace tree reduction.
* 03-restoring-and-non-restoring-hardware-dividers — Problem: Integer division requires multi-cycle iterative trial subtractions, stalling the execution pipeline if un-optimized. | Primitives: Restoring divider, Non-restoring divider datapath, SRT division mechanics.
* 04-ieee754-floating-point-adder-and-multiplier-core — Problem: Executing IEEE-754 floating-point addition and multiplication in software requires hundreds of integer instructions, bottlenecking mathematical processing. | Primitives: Floating-Point Unit (FPU) datapath, Mantissa/Exponent alignment logic, Normalization and rounding core.

## 02-pipelined-processor-architectures — Pipelined Execution and Hazard Mitigation

### 01-five-stage-pipeline-synthesis — Classical Pipelined Datapath Design
* 01-five-stage-pipeline-register-partitioning — Problem: Un-pipelined processors leave major execution sub-units idle during operation, limiting instruction throughput. | Primitives: 5-stage pipeline (IF-ID-EX-MEM-WB), Pipeline registers (IF/ID, ID/EX, EX/MEM, MEM/WB), Instruction Throughput ($f_{\text{max}}$).
* 02-pipelined-control-unit-and-signal-propagation — Problem: Control signals decoded in the ID stage must arrive at execution, memory, and writeback units on the exact clock cycles those units process the instruction. | Primitives: Pipelined control signal propagation, Control bus pipelining.

### 02-pipeline-hazard-detection-and-resolution — Data and Control Hazard Resolution
* 01-data-hazards-and-operand-forwarding — Problem: A pipelined instruction attempting to read a register before a preceding in-flight instruction completes writeback reads stale data. | Primitives: Data hazard (RAW), Hazard Detection Unit, Operand Forwarding (Bypassing) unit, Back-to-back bypassing.
* 02-load-use-hazards-and-pipeline-stalling — Problem: Operand forwarding cannot eliminate hazards when a load instruction is immediately followed by an instruction that consumes the loaded data. | Primitives: Load-use data hazard, Pipeline Stall Unit, Interlock bubble insertion.
* 03-control-hazards-and-branch-penalty-flushing — Problem: Conditional branch instructions alter the Program Counter in the EX stage, causing speculative instructions already fetched into IF and ID stages to be invalid. | Primitives: Control hazard, Branch penalty delay, Pipeline Flushing.

### 03-precise-exceptions-and-pipelined-synthesis — Precise Interrupts and Full Pipeline Integration
* 01-precise-exception-handling-and-pipeline-commit — Problem: Hardware exceptions (such as arithmetic overflow or illegal instructions) occurring mid-pipeline must not corrupt register state for un-committed instructions. | Primitives: Precise exceptions, Exception Cause Register, EPC saving, Pipeline Exception Flush.
* 02-complete-five-stage-pipelined-core-synthesis — Problem: Integrating forwarding units, stall units, branch flushing, and exception controllers into a single pipeline creates complex inter-unit feedback loops. | Primitives: Integrated 5-stage pipelined processor core, Pipeline Control Unit integration.

## 03-branch-prediction-and-speculative-execution — Dynamic Branch Prediction and Speculative Control

### 01-dynamic-direction-prediction — Branch Direction Prediction Architectures
* 01-static-branch-prediction-and-branch-delay-slots — Problem: Static branch prediction strategies (like Assume-Not-Taken) suffer severe performance penalties when loops execute repeatedly. | Primitives: Static branch prediction, Branch Delay Slot, Branch Direction Penalty.
* 02-bimodal-two-bit-saturating-counter-predictors — Problem: Single-bit branch history predictors mispredict twice on every loop execution (once on entering, once on exiting). | Primitives: 2-bit saturating counter state machine, Bimodal Branch History Table (BHT).
* 03-two-level-adaptive-gshare-and-tage-predictors — Problem: Bimodal predictors fail to recognize correlated branch patterns, while simple Gshare predictors suffer from history interference under long global histories. | Primitives: Global History Register (GHR), Gshare predictor, TAGE (TAgged GEometric history length) predictor.

### 02-branch-target-and-return-prediction — Branch Target Address and Indirect Jump Acceleration
* 01-branch-target-buffer-architecture — Problem: Even if a branch direction is predicted correctly in the ID stage, computing the target jump address introduces a 1-cycle fetch delay. | Primitives: Branch Target Buffer (BTB), Target Address Cache, Zero-cycle branch penalty.
* 02-indirect-branch-prediction-and-return-stacks — Problem: Function returns and indirect jump instructions target dynamic addresses that vary per call site, causing BTB misses. | Primitives: Return Stack Buffer (RSB), Indirect Branch Target Buffer (iBTB).

## 04-front-end-decoupling-and-superscalar-pipelines — Multi-Issue In-Order Pipelines and Front-End Decoupling

### 01-superscalar-in-order-pipelines — Multi-Issue In-Order Microarchitectures
* 01-superscalar-multi-issue-datapath-synthesis — Problem: Single-issue pipelined processors hit a hard throughput ceiling of $\text{IPC} \le 1.0$, leaving execution units underutilized. | Primitives: Superscalar multi-issue datapath, Dual-issue instruction alignment, Structural resource conflict arbitration.
* 02-superscalar-hazard-detection-and-alignment — Problem: Issuing two instructions simultaneously requires detecting data hazards between the two co-issued instructions within the same clock cycle. | Primitives: Intra-cycle hazard detection, Intra-issue forwarding, Dual-issue pipeline stall.

### 02-front-end-decoupling-and-op-fusion — Micro-Op Caches and Instruction Fusion
* 01-micro-op-caches-and-decoupled-front-ends — Problem: Decoding complex variable-length instructions on every clock cycle introduces high front-end energy and latency overheads. | Primitives: Decoded Stream Buffer ($\mu\text{op}$ Cache), Micro-operation ($\mu\text{op}$) decoding, Front-end decoupling.
* 02-macro-op-and-micro-op-fusion — Problem: Passing multiple simple instructions through separate pipeline stages increases control tracking overhead and occupies reservation station slots. | Primitives: Macro-Op Fusion, Micro-Op Fusion, Instruction stream compaction.

## 05-out-of-order-execution-and-multithreading — Dynamic Scheduling, Renaming, Memory Disambiguation, and SMT

### 01-register-renaming-and-dependency-elimination — Eliminating False Data Dependencies
* 01-register-aliasing-and-false-dependencies — Problem: Software compilers reuse a small set of architectural registers, creating artificial Write-After-Read (WAR) and Write-After-Write (WAW) pipeline stalls. | Primitives: True data dependency (RAW), Anti-dependency (WAR), Output dependency (WAW), Architectural vs Physical Registers.
* 02-register-alias-table-and-renaming-map — Problem: Mapping a limited set of architectural registers to a larger physical register file requires real-time tracking of active register mappings and physical allocation strategies. | Primitives: Register Alias Table (RAT), Free List Manager, Physical Register File (PRF - R10k vs P6 architectures).

### 02-tomasulo-algorithm-and-out-of-order-execution — Out-of-Order Instruction Issue and Execution
* 01-reservation-stations-and-tomasulo-issue — Problem: In-order instruction dispatch halts the entire processor when an independent instruction behind a stalled instruction is ready to execute. | Primitives: Out-of-Order (OoO) Execution, Tomasulo Algorithm, Reservation Stations, Dispatch Unit.
* 02-common-data-bus-and-execution-broadcasting — Problem: Out-of-order execution units completing calculations at different clock cycles must distribute results to all dependent instructions waiting in reservation stations. | Primitives: Common Data Bus (CDB), Result Tag Broadcasting, Snooping execution units.

### 03-memory-disambiguation-and-speculative-commit — Out-of-Order Memory Execution and Speculative Commit
* 01-load-store-queue-and-memory-disambiguation — Problem: Memory load and store instructions cannot execute out of order blindly because two different instructions might target the same memory address. | Primitives: Load-Store Queue (LSQ), Memory Disambiguation, Store-to-Load Forwarding, Store Sets prediction.
* 02-reorder-buffer-architecture-and-in-order-commit — Problem: Executing instructions out of order breaks precise exception handling and state recovery when branch predictions fail. | Primitives: Reorder Buffer (ROB), In-Order Commit (Retirement), Speculative Execution State.
* 03-speculative-rollback-and-misprediction-recovery — Problem: When a branch misprediction is detected out of order, all speculatively executed state changes must be purged without corrupting architectural registers. | Primitives: Speculative Rollback, RAT checkpoint recovery, ROB State Flushing.

### 04-simultaneous-multithreading-and-core-integration — SMT Hardware Multithreading and Full Out-of-Order Integration
* 01-simultaneous-multithreading-architecture — Problem: Long-latency execution stalls (like memory misses) leave out-of-order execution units idle even with dynamic scheduling. | Primitives: Simultaneous Multithreading (SMT), Duplicated architectural state, Shared execution resources, ICNT/FLUSH fetch policies.
* 02-complete-out-of-order-superscalar-core-integration — Problem: Integrating register renaming, reservation stations, common data buses, load-store queues, reorder buffers, and SMT into a unified processor core creates massive interconnect and state-coordination complexity. | Primitives: Out-of-Order Superscalar Core Integration, Complete OoO Processing Engine, Interlock priority cascade.