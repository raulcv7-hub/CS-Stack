---
title: "01. Digital Logic Design - Table of Contents"
---

﻿# digital-logic-design — Digital Logic Design

> **Assumed Prerequisites:** Discrete bit axiom ($0$ and $1$) and functional behavior of basic logic gates (`AND`, `OR`, `NOT`).
> **Course Boundary:** Begins at combining logic gates into Boolean functions and ends in a complete functional 8-bit Arithmetic Logic Unit (ALU) with condition flags ($Z, C, N, V$) integrated with a Control Finite State Machine (FSM).
> **Explicit Exclusions:** Zero analog physics/voltages, zero transistors/MOSFETs, zero Hardware Description Languages (Verilog/VHDL/SystemVerilog), zero high-level programming language code, zero microarchitecture pipelines or CPU instruction decoding.

## 01-boolean-logic-foundations — Fundamentals of Boolean Logic Synthesis

### 01-boolean-algebra-mechanics — Operational Boolean Algebra and Truth Tables
* 01-truth-table-synthesis — Problem: Expressing arbitrary multi-input logic requirements without ambiguity. | Primitives: Truth table, canonical Boolean function.
* 02-canonical-forms-representation — Problem: Converting truth tables into standard algebraic expressions for logic gate implementation. | Primitives: Sum of Products (SOP), Product of Sums (POS).
* 03-boolean-algebraic-simplification — Problem: Reducing gate count and signal delay using algebraic axioms. | Primitives: De Morgan laws, consensus theorem.
* 04-universal-gate-completeness — Problem: Synthesizing arbitrary Boolean logic using only NAND or NOR gates for manufacturing efficiency. | Primitives: Functional completeness, NAND/NOR logic tree.
* 05-xor-xnor-algebraic-mechanics — Problem: Simplifying controlled inversion and parity expressions using specialized XOR/XNOR identities. | Primitives: XOR algebraic identities, controlled inverter logic.

### 02-karnaugh-map-minimization — Visual Optimization and Hazard Analysis
* 01-karnaugh-map-grouping — Problem: Minimizing Boolean expressions without error-prone algebraic manipulation. | Primitives: Gray code indexing, Karnaugh map (K-Map).
* 02-dont-care-conditions-optimization — Problem: Exploiting unused input states to achieve minimal hardware layout. | Primitives: Don't Care condition ($X$), essential prime implicant.
* 03-quine-mccluskey-tabular-minimization — Problem: Minimizing Boolean logic functions with more than four input variables where visual maps fail. | Primitives: Prime implicant chart, tabular minimization.
* 04-combinational-hazard-mitigation — Problem: Preventing transient output glitches caused by unequal gate propagation delays. | Primitives: Static hazard, hazard cover term.

## 02-combinational-logic-modules — Standard Combinational Building Blocks

### 01-data-routing-circuits — Multiplexing, Demultiplexing and Bus Buffering
* 01-multiplexer-circuit-synthesis — Problem: Selecting a single data line from multiple sources using digital selection signals. | Primitives: Multiplexer (MUX), selector bus.
* 02-demultiplexer-circuit-synthesis — Problem: Routing a single data source to one of multiple output channels. | Primitives: Demultiplexer (DEMUX), address decoding.
* 03-tristate-buffer-bus-driver — Problem: Connecting multiple circuit outputs to a shared data line without signal collisions. | Primitives: High-impedance state ($Z$), bus contention.

### 02-code-translation-circuits — Binary Decoding, Encoding and Display Drivers
* 01-binary-decoder-architecture — Problem: Converting encoded $N$-bit binary inputs into $2^N$ unique active lines. | Primitives: Binary decoder, active-low enable.
* 02-binary-encoder-architecture — Problem: Compressing $2^N$ mutually exclusive active lines into an $N$-bit binary code. | Primitives: Binary encoder, active line compression.
* 03-priority-encoder-architecture — Problem: Resolving input line collisions when multiple signal lines fire simultaneously. | Primitives: Priority encoder, valid output flag.
* 04-seven-segment-decoder-driver — Problem: Converting binary-coded decimal values into control signals for visual display segments. | Primitives: BCD decoder, display segment logic.

### 03-data-validation-comparison — Error Detection and Magnitude Comparison
* 01-parity-generator-checker-circuits — Problem: Detecting single-bit transmission errors in binary data words. | Primitives: Parity generator, XOR error detection tree.
* 02-magnitude-comparator-circuits — Problem: Comparing two multi-bit binary numbers for equality and magnitude in hardware. | Primitives: Equality comparator, magnitude cascade.

## 03-binary-arithmetic-circuits — Discrete Binary Arithmetic Systems

### 01-binary-addition-circuits — Addition and Carry Propagation
* 01-half-adder-logic-design — Problem: Adding two single-bit binary inputs without a carry input. | Primitives: Half adder, XOR sum logic.
* 02-full-adder-logic-design — Problem: Cascading single-bit additions with carry input support. | Primitives: Full adder, carry propagation logic.
* 03-ripple-carry-adder-latency — Problem: Chaining single-bit adders introduces propagation delay proportional to bit width. | Primitives: Ripple carry adder (RCA), critical path delay.
* 04-carry-lookahead-adder-acceleration — Problem: Eliminating sequential carry propagation delay in wide adders. | Primitives: Carry Generate ($G$), Carry Propagate ($P$).
* 05-bcd-adder-circuit-design — Problem: Adding Binary-Coded Decimal digits directly in hardware with automatic correction when sums exceed nine. | Primitives: BCD adder, decimal correction logic.

### 02-signed-subtraction-circuits — Two's Complement Subtraction Architecture
* 01-twos-complement-representation — Problem: Representing negative integers in binary hardware without dedicated sign hardware. | Primitives: Two's complement conversion, sign bit extension.
* 02-adder-subtractor-circuit-design — Problem: Unifying addition and subtraction into a single combinational circuit. | Primitives: Controlled inverter (XOR), combined adder-subtractor.

### 03-advanced-arithmetic-circuits — High-Speed Shifting and Array Multiplication
* 01-barrel-shifter-circuit-design — Problem: Executing multi-bit logical and arithmetic bit shifts in a single clock cycle. | Primitives: Barrel shifter, shift control bus.
* 02-combinational-array-multiplier — Problem: Multiplying unsigned binary numbers in pure combinational hardware. | Primitives: Array multiplier, partial product matrix.

## 04-sequential-logic-storage — Clocked Sequential Storage and Memory Arrays

### 01-bistable-latch-mechanics — Unclocked Memory and Feedback Loops
* 01-sr-latch-feedback-loop — Problem: Preserving state in hardware using cross-coupled logic feedback loops. | Primitives: Cross-coupled NOR/NAND latch, Set/Reset state.
* 02-gated-sr-latch-enable — Problem: Controlling state update windows in bistable latches using a clock enable signal. | Primitives: Gated SR latch, enable gate.
* 03-gated-d-latch-transparency — Problem: Eliminating invalid input states in latches by forcing complementary inputs. | Primitives: Gated D-latch, level transparency.

### 02-flip-flop-edge-triggering — Clock Synchronized State Storage
* 01-master-slave-d-flip-flop — Problem: Preventing data race conditions during level-sensitive transparency. | Primitives: Edge-triggered D flip-flop, master-slave topology.
* 02-toggle-flip-flop-mechanics — Problem: Inverting stored state deterministically on clock pulses for counting operations. | Primitives: T flip-flop, JK toggle logic.
* 03-flip-flop-timing-margins — Problem: Preventing state corruption caused by setup and hold timing violations around clock edges. | Primitives: Setup time ($t_{su}$), Hold time ($t_h$).

### 03-register-storage-arrays — Multi-Bit Register Architectures and Memory Files
* 01-parallel-load-register-architecture — Problem: Capturing and holding multi-bit parallel data words synchronously on clock edges. | Primitives: Parallel load register, load enable gate.
* 02-shift-register-topologies — Problem: Converting data between serial and parallel formats across consecutive clock cycles. | Primitives: Shift register, SIPO/PISO conversion.
* 03-multiport-register-file-synthesis — Problem: Reading and writing multiple data registers simultaneously using address decoders and tri-state buses. | Primitives: Register file, multi-port address decoding.

## 05-sequential-state-machines — Programmable Logic and State Controller Synthesis

### 01-programmable-logic-structures — ROM, PLA and PAL Logic Synthesis
* 01-read-only-memory-logic-synthesis — Problem: Implementing arbitrary multi-output truth tables using fixed decoder arrays and OR arrays. | Primitives: Read-Only Memory (ROM), lookup table synthesis.
* 02-programmable-logic-array-architecture — Problem: Minimizing hardware footprint by programming both AND and OR gate planes. | Primitives: Programmable Logic Array (PLA), Programmable Array Logic (PAL).

### 02-fsm-controller-architectures — Synchronous State Transition Architectures
* 01-moore-fsm-architecture-design — Problem: Designing state controllers where outputs depend strictly on current state. | Primitives: Moore state machine, state transition logic.
* 02-mealy-fsm-architecture-design — Problem: Designing state controllers where outputs react asynchronously to inputs. | Primitives: Mealy state machine, output logic decoder.

### 03-fsm-state-synthesis — State Optimization, Encoding and Excitation Logic
* 01-fsm-state-reduction-minimization — Problem: Eliminating redundant states in FSM specifications to minimize flip-flop and gate counts. | Primitives: Equivalent state, state reduction table.
* 02-state-encoding-optimization — Problem: Assigning binary codes to state variables to simplify combinational transition logic. | Primitives: Binary state encoding, One-Hot state encoding.
* 03-flip-flop-excitation-tables — Problem: Mapping next-state logic requirements to specific flip-flop inputs during FSM synthesis. | Primitives: Excitation table, next-state equation.
* 04-next-state-output-logic-synthesis — Problem: Deriving minimal combinational logic gate equations for FSM state transitions and outputs. | Primitives: Transition logic minimization, FSM gate schematic.

### 04-sequential-counter-circuits — Ripple Delays and Synchronous Counters
* 01-asynchronous-ripple-counter-latency — Problem: Cascading flip-flop clocks introduces accumulated propagation delay across bits. | Primitives: Asynchronous ripple counter, clock ripple delay.
* 02-synchronous-counter-design — Problem: Eliminating clock ripple delay by clocking all flip-flops simultaneously. | Primitives: Synchronous counter, terminal count flag.
* 03-modulo-n-arbitrary-sequence-counter — Problem: Truncating natural binary counting sequences to implement arbitrary modulo-N cycles. | Primitives: Modulo-N counter, synchronous clear logic.

## 06-arithmetic-logic-unit-integration — Synthesis of the Arithmetic Logic Unit

### 01-alu-combinational-core — Operations and Condition Flag Generation
* 01-arithmetic-logic-operation-multiplexing — Problem: Combining arithmetic, logic, and shift operations into a single output bus. | Primitives: ALU operation select code, bus multiplexing logic.
* 02-arithmetic-condition-flags-generation — Problem: Detecting mathematical conditions (zero, overflow, sign, carry) and capturing them synchronously. | Primitives: Condition flags ($Z, N, V, C$), Status Register.

### 02-alu-sequential-integration — Bus Connections and Sequential FSM Control
* 01-tristate-bus-datapath-interconnect — Problem: Routing operands and results between register files and ALU without dedicated multiplexer trees for every source. | Primitives: Internal datapath bus, tri-state register output driver.
* 02-fsm-driven-alu-controller-integration — Problem: Orchestrating multi-step ALU operations using a sequential FSM controller. | Primitives: Datapath control word, integrated ALU controller.