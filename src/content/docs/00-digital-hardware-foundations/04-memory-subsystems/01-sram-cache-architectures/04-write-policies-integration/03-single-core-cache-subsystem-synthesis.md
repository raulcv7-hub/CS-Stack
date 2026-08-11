---
title: "Single-Core Cache Subsystem Synthesis and Datapath Integration"
---

# Single-Core Cache Subsystem Synthesis and Datapath Integration

## The Inter-Unit Feedback Friction and the Subsystem Integration Barrier

In high-performance microprocessor design, a Level 1 (L1) Data Cache is not a simple, monolithic memory chip. It is a highly complex, multi-unit digital subsystem composed of distinct sub-circuits operating in tight, clock-synchronous orchestration:

1. **SRAM Tag and Data Memory Arrays**: High-density 6-transistor (6T) SRAM matrices holding addresses, valid flags, dirty flags, and 64-byte payload blocks.
2. **Address Parsers and Index Decoders**: Combinational logic networks that split 64-bit virtual or physical addresses into Tag, Index, and Offset bit fields.
3. **Parallel Tag Comparator Banks**: High-speed digital comparators that evaluate whether an incoming address matches any stored tag across $N$ set ways simultaneously.
4. **Way Selection and Byte Alignment Multiplexers**: Steering trees that route data payloads between the SRAM array and CPU execution registers.
5. **Replacement Policy Engines (Tree-PLRU)**: Finite state machines that track way access histories and decode victim eviction candidates during cache misses.
6. **Write-Back Buffers (WBB)**: Asynchronous SRAM queues that decouple dirty line evictions from the critical read miss path.
7. **Line Refill and Critical-Word-First Forwarding Units**: Burst bus interface logic that streams incoming 64-byte blocks from lower memory into the cache while restarting the CPU pipeline as early as possible.

```text
THE CACHE SUBSYSTEM INTEGRATION CHALLENGE

 CPU Execution Pipeline Requests
  │  Address, Write Data, Read/Write Strobe
  ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ L1 CACHE SUBSYSTEM INTER-UNIT FEEDBACK NETWORK              │
 │                                                             │
 │  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐  │
 │  │ Index Decode ├────►│ SRAM Read    ├────►│ Tag Compare │  │
 │  └──────────────┘     └──────────────┘     └──────┬──────┘  │
 │                                                   │         │
 │  ┌──────────────┐     ┌──────────────┐            ▼         │
 │  │ WBB Buffer   │◄────┤ PLRU Engine  │◄──── Hit/Miss Logic  │
 │  └──────────────┘     └──────────────┘            │         │
 │                                                   ▼         │
 │                       Line Refill Unit ◄── Pipeline Stall   │
 └─────────────────────────────────────────────────────────────┘
  (Dozens of inter-unit feedback signals must settle within 1 clock cycle!)
```

While each of these sub-units can be analyzed and designed in isolation, combining them into a single, functional, single-core L1 Data Cache introduces a severe architectural challenge: **Inter-Unit Timing Feedback Loops**.

Consider the complex sequence of events that must occur inside the L1 Data Cache during a single $250\text{-picosecond}$ clock cycle ($4.0\text{ GHz}$ CPU clock frequency):

1. The CPU dispatches a memory address to the cache.
2. The index decoder activates an SRAM row across all $N$ ways.
3. The SRAM arrays output $N$ stored tag vectors and $N$ 64-byte data payloads.
4. $N$ parallel comparators evaluate whether any stored tag matches the CPU address tag.
5. Hit/Miss control logic evaluates whether a valid match occurred.
6. **If a Hit occurs on a Store instruction**:
   * The winning way's **Dirty Bit ($D$)** must be set to $1$.
   * The **Tree-PLRU replacement state machine** must update its directional tree bits to point away from the hit way.
   * The new byte payload must be written into the winning SRAM data way.
7. **If a Miss occurs**:
   * The CPU pipeline stall signal (`cpu_ready = 0`) must be asserted immediately.
   * The **Tree-PLRU eviction decoder** must inspect current set bits and identify the victim way.
   * The **Eviction Logic** must check if the victim way is dirty ($D == 1$).
   * If dirty, the 64-byte victim line must be moved into the **Write-Back Buffer (WBB)**, and a read fill request must be issued across the memory bus!

All of these sub-units depend on each other's outputs **within the exact same clock cycle or across tightly coupled state transitions**!

If the inter-unit feedback logic is designed naively—for instance, allowing the output of tag comparison to pass through complex PLRU bit updates, eviction decoding, and WBB push logic before driving the CPU stall line—the combinational gate delay ($t_{\text{logic}}$) exceeds $1.5\text{ nanoseconds}$.

The critical path delay collapses the maximum operating frequency of the entire CPU core from $4.0\text{ GHz}$ down to $666\text{ MHz}$!

To synthesize an L1 Data Cache that runs at full multi-gigahertz speeds without race conditions or critical path timing violations, digital engineers must design a unified **Integrated Single-Core Cache Subsystem** managed by a high-speed **Cache Controller Datapath and State Machine**.


### The Disaster of Un-Coordinated Operations (Un-Integrated Subsystem)

Imagine what happens if these six operations run independently without a master coordinator:

* A passenger arrives at 12:00 PM asking for Suitcase #7432.
* The barcode scanner checks Row 42. At the exact same second, the robotic organizer decides to clear out a shelf in Row 42, while a cargo plane unloads a new suitcase into Row 42, and the decontamination bay attempts to ship a suitcase away!
* The suitcases collide on the conveyor belt! The barcode scanner reads the wrong suitcase, the robotic organizer drops a passenger's bag into the recycling bin, and the passenger receives someone else's luggage.

This chaos is what happens when RTL hardware units are wired together without a master controller: **Race Conditions, Signal Contention, and Data Corruption**.


## Primitive 1: The Integrated Single-Core Cache Subsystem Architecture

Now that we possess a clear intuitive mental model of the airport baggage terminal, let us examine the formal engineering architecture of an **Integrated Single-Core Cache Subsystem**.

An integrated L1 Data Cache subsystem acts as a complete, self-contained hardware module that sits between the CPU execution pipeline and the lower-level memory interconnect bus.

### Top-Level Module Interface Signals

Let us define the complete signal interface of an integrated L1 Data Cache module:

```text
INTEGRATED L1 CACHE SUBSYSTEM MODULE INTERFACE

 CPU Pipeline Interface                      Lower Memory Bus Interface
 ┌──────────────────────────┐               ┌──────────────────────────┐
 │ cpu_clk (Master Clock)   │               │ mem_clk (Bus Clock)      │
 │ cpu_reset_n (Reset)      │               │ mem_req (Bus Request)    │
 │ cpu_addr[63:0] (Address) │               │ mem_we (Write/Read_n)    │
 │ cpu_wdata[63:0] (Data)   ├─► L1 CACHE ──►│ mem_addr[63:0] (Address) │
 │ cpu_req (Request Strobe) │   SUBSYSTEM   │ mem_wdata[511:0] (Line)  │
 │ cpu_we (Write/Read_n)    │               │ mem_rdata[511:0] (Line)  │
 │ cpu_byte_en[7:0] (Mask)  │               │ mem_ready (Bus Acknow)   │
 │ cpu_rdata[63:0] (Output) │               └──────────────────────────┘
 │ cpu_ready (Stall Control)│
 └──────────────────────────┘
```

#### 1. CPU Pipeline Interface (High-Speed Core Side):
* `cpu_clk` (input): Master CPU clock ($4.0\text{ GHz}$).
* `cpu_reset_n` (input): Active-low master reset line.
* `cpu_addr[63:0]` (input): 64-bit virtual or physical memory address.
* `cpu_wdata[63:0]` (input): 64-bit data payload for store instructions.
* `cpu_req` (input): Active-high strobe indicating a valid memory read or write request from the CPU.
* `cpu_we` (input): Read/Write control flag ($1 = \text{Store/Write}$, $0 = \text{Load/Read}$).
* `cpu_byte_en[7:0]` (input): 8-bit byte enable mask for partial word store instructions.
* `cpu_rdata[63:0]` (output): 64-bit data payload returned to CPU register file on loads.
* `cpu_ready` (output): Active-high pipeline flow signal ($1 = \text{Cache Ready/Hit}$, $0 = \text{Cache Miss/Stall CPU}$).

#### 2. Lower Memory Bus Interface (Interconnect Side):
* `mem_req` (output): Active-high request to lower-level memory (L2 cache or DRAM).
* `mem_we` (output): Memory bus operation type ($1 = \text{Dirty Write-Back}$, $0 = \text{Line Read Fill}$).
* `mem_addr[63:0]` (output): 64-byte aligned block address for line fills or write-backs.
* `mem_wdata[511:0]` (output): 64-byte ($512\text{-bit}$) evicted dirty line payload.
* `mem_rdata[511:0]` (input): 64-byte ($512\text{-bit}$) incoming line payload from lower memory.
* `mem_ready` (input): Active-high acknowledge from memory bus controller indicating transaction completion.


## Primitive 2: Cache Controller Datapath and Control FSM

To manage state transitions, memory bus requests, pipeline stalls, and dirty line evictions without race conditions, the heart of the integrated cache subsystem is the **Master Cache Controller Finite State Machine (FSM)**.

### The Master Cache Controller State Transition Graph

The Master Cache Controller FSM is structured around five primary operational states:

```text
MASTER CACHE CONTROLLER FSM STATE TRANSITION GRAPH

                 Power-On / Reset
                        │
                        ▼
            ┌───────────────────────┐
            │   ST_IDLE_LOOKUP      │◄───────┐
            │  (1-Cycle Hit Path)   │        │
            └───────────┬───────────┘        │
                        │                    │
            Cache Miss  │ (cpu_ready = 0)    │ Refill & Update Complete
                        ▼                    │
            ┌───────────────────────┐        │
            │   ST_EVICT_CHECK      │        │
            │ (Inspect Victim Line) │        │
            └───────────┬───────────┘        │
                        │                    │
           ┌────────────┴────────────┐       │
           │ Victim Clean (D=0)      │ Victim Dirty (D=1)
           ▼                         ▼       │
   ┌───────────────┐         ┌─────────────┐ │
   │ ST_MEM_READ   │         │ ST_WBB_PUSH │ │
   │ (Issue Fill)  │         │ (Push WBB)  │ │
   └───────┬───────┘         └──────┬──────┘ │
           │                        │        │
           └────────────┬───────────┘        │
                        ▼                    │
            ┌───────────────────────┐        │
            │   ST_REFILL_WAIT      │────────┘
            │ (Stream & Write SRAM) │
            └───────────────────────┘
```

Let us examine the exact hardware responsibilities, signal assertions, and transition conditions for each state in the Master Cache Controller FSM:


### State 2: `ST_EVICT_CHECK` (Victim Inspection)

In `ST_EVICT_CHECK`, the cache controller analyzes the victim line selected for eviction by the Tree-PLRU replacement engine.

#### Hardware Actions in `ST_EVICT_CHECK`:
1. The Tree-PLRU engine decodes the 3 tree bits ($B_0, B_1, B_2$) for the indexed set, generating a One-Hot victim way select vector $(E_3, E_2, E_1, E_0)$.
2. The controller reads the Valid bit ($V_{\text{victim}}$) and Dirty bit ($D_{\text{victim}}$) of the selected victim way:
   * **Case A: Victim is Invalid or Clean ($V_{\text{victim}} == 0 \quad \mathbf{\text{OR}} \quad D_{\text{victim}} == 0$)**:
     No dirty write-back is required! The victim slot can be silently overwritten.
     **State Transition**: Moves directly to `ST_MEM_READ`!
   * **Case B: Victim is Valid and Dirty ($V_{\text{victim}} == 1 \quad \mathbf{\text{AND}} \quad D_{\text{victim}} == 1$)**:
     The victim line contains modified data that exists nowhere else in the computer!
     **State Transition**: Moves to `ST_WBB_PUSH`!


### State 4: `ST_MEM_READ` (Issuing Line Fill Request)

In `ST_MEM_READ`, the controller issues a 64-byte line fill read request to the lower-level memory interconnect (L2 Cache or main DRAM).

#### Hardware Actions in `ST_MEM_READ`:
1. The controller asserts `mem_req = 1`, `mem_we = 0` (Read request).
2. Sets `mem_addr` to the 64-byte aligned block address of the missing line:

$$\text{mem\_addr} = \text{cpu\_addr} \quad \mathbf{\&} \quad \sim 63$$

Where:
* $\text{mem\_addr}$ is the 64-byte aligned block address sent over the bus.
* $\text{cpu\_addr}$ is the target virtual/physical address requested by the CPU.
* $\sim 63$ is the bitwise mask clearing the lowest 6 offset bits.

3. Waits for lower memory to acknowledge the request (`mem_ready == 1`).
4. **State Transition**: Once `mem_ready == 1` is received, moves to `ST_REFILL_WAIT`!


## Critical Path Timing Analysis and Synthesis Optimization Strategies

In modern $4.0\text{-GHz}$ processors, synthesizing an integrated cache controller presents severe **Static Timing Analysis (STA)** challenges.

Let us trace the three primary critical path timing loops inside the integrated cache subsystem to understand where timing bottlenecks occur and how hardware architects optimize them.


### Industrial Optimization Strategy: Speculative Way Steering

How do high-performance commercial processor synthesis tools close timing on L1 caches at $4.0\text{ GHz}$?

They use **Speculative Way Steering (Fast-Path Speculation)**!

#### How Speculative Way Steering Works:
1. Instead of waiting for the $80\text{-ps}$ Tag comparison and $30\text{-ps}$ Hit logic to finish before driving the 4-to-1 Way Selection MUX, the cache controller **predicts which way will hit in advance** (for example, predicting that Way 0 will hit using the Tree-PLRU state)!
2. The MUX steers Way 0's data payload to the CPU register file **speculatively** during SRAM sensing ($t = 200\text{ ps}$).
3. In parallel, the Tag comparators evaluate.
   * **If Way 0 Hits (90% of the time!)**: Data is ALREADY at the CPU register! The Tag comparison merely validates the speculative read. Hit latency drops from $425\text{ ps}$ down to **$220\text{ ps}$**, meeting $4.0\text{ GHz}$ timing closure!
   * **If Way 0 Misses but Way 2 Hits**: The speculation failed. The controller cancels the register write, stalls the pipeline for 1 extra clock cycle, and steers Way 2's data on the second cycle.

```text
SPECULATIVE WAY STEERING TIMING ACCELERATION

 Standard Sequential Path : [ SRAM Read ] ──► [ Tag Compare ] ──► [ Way MUX ] ──► Data (425 ps - FAILS!)

 Speculative Fast Path    : [ SRAM Read ] ──► [ Speculative Way MUX ] ───────────► Data (220 ps - PASSED!)
                            [ Tag Compare (Validates in Parallel) ]
```

Speculative way steering breaks the long Tag-Compare-to-Way-MUX feedback loop, allowing L1 data caches to achieve multi-gigahertz execution speeds!


### Scenario and Parameters

You are a senior microarchitect auditing the integrated L1 Data Cache subsystem for a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution CPI of $\text{CPI}_{\text{ideal}} = 1.0\text{ cycle/instruction}$.

The L1 Data Cache is an **Integrated $32\text{-KB}$ 4-Way Set-Associative Cache**:
* Total Capacity $C = 32\text{ KB} = 32,768\text{ bytes}$.
* Line Size $L = 64\text{ bytes}$ ($S = 128\text{ sets}$, $I = 7\text{ bits}$, $O = 6\text{ bits}$, $T = 51\text{ bits}$).
* Write Policy: **Write-Back with Write-Allocate**.
* Replacement Policy: **3-bit Tree-PLRU per set**.
* Queue Hardware: **2-entry Write-Back Buffer (WBB)**.

```text
3.2 GHz INTEGRATED L1 CACHE SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ L1 Data Cache Controller FSM ] ──► [ Write-Back Buffer ] ──► L2 Cache
 Clock T = 312.5 ps     (ST_IDLE -> ST_EVICT -> ST_REFILL)    (2-Entry 64B Queue)      Hit = 12c
```

#### Memory Interconnect & L2 Cache Latencies:
* Shared L2 Cache Read Line-Fill Latency: $T_{\text{L2\_read}} = 12\text{ clock cycles}$ ($3.75\text{ ns}$).
* Shared L2 Cache Write-Back Drain Latency: $T_{\text{L2\_write}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).

#### Initial Subsystem State at Set Row 0 (Bits $[12:6] = \text{7'b0000000}_2$):
All 4 ways in Set 0 are currently occupied by valid data lines:
* **Way 0**: Tag = `0x0000_0000_0001_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0004_0000`).
* **Way 1**: Tag = `0x0000_0000_0002_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0008_0000`).
* **Way 2**: Tag = `0x0000_0000_0003_0`, Valid = 1, Dirty = 1 (Holds DIRTY line at `0x0000_0000_000C_0000`).
* **Way 3**: Tag = `0x0000_0000_0004_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0010_0000`).
* **Tree-PLRU Bits**: Currently point to **Way 2 as the victim candidate** ($B_0 = 1, B_2 = 0$).

#### The Workload Execution Sequence:
The CPU pipeline executes three consecutive memory operations targeting Set Row 0:
* **Operation 1 (Clock Cycle 1)**: `LOAD R1, [0x0000_0000_0004_0000]` (Targeting Way 0).
* **Operation 2 (Clock Cycle 2)**: `STORE R2, [0x0000_0000_0004_0008]` (Targeting Way 0).
* **Operation 3 (Clock Cycle 3)**: `LOAD R3, [0x0000_0000_0005_0000]` (Targeting new address mapping to Set 0!).

#### Your Objective

1. Trace the Master Cache Controller FSM state transitions, internal signal assertions, and bit flag updates for **Operation 1** (`LOAD` hit on Way 0).
2. Trace the Master Cache Controller FSM state transitions, internal signal assertions, and bit flag updates for **Operation 2** (`STORE` hit on Way 0). Show the exact Dirty bit update ($D_0 \Leftarrow 1$).
3. Trace the Master Cache Controller FSM state transitions across ALL phases for **Operation 3** (`LOAD` miss targeting Set 0 where victim Way 2 is DIRTY):
   * Trace FSM states: `ST_IDLE_LOOKUP` $\to$ `ST_EVICT_CHECK` $\to$ `ST_WBB_PUSH` $\to$ `ST_MEM_READ` $\to$ `ST_REFILL_WAIT` $\to$ `ST_IDLE_LOOKUP`.
   * Trace WBB buffer queue loading and background L2 write-back.
4. Calculate the total CPU stall cycles incurred during Operation 3 **with** the Write-Back Buffer versus **without** a Write-Back Buffer.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Trace Operation 2 — Store Hit on Way 0 (`0x0000_0000_0004_0008`)

##### Cycle 2 Execution (`ST_IDLE_LOOKUP`):
1. Address `0x0000_0000_0004_0008` arrives from CPU (`cpu_req = 1`, `cpu_we = 1`, `cpu_wdata = 64'h1234_5678_9ABC_DEF0`).
   * Index bits $[12:6] = \text{7'b0000000}_2 \implies$ Set Row 0.
   * Tag bits $[63:13] = \text{51'h0000\_0000\_0001\_0}$.
2. Parallel comparators evaluate: Way 0 matches! $\text{Hit}_0 = 1 \implies \text{Global\_Hit} = 1$.
3. **Data Write**: `cpu_wdata` is written into Way 0 SRAM data payload at offset index 8.
4. **Dirty Bit Update**: Way 0 Dirty bit is set to $1$ ($\mathbf{D_0 \Leftarrow 1}$).
5. **Control Assertions**: `cpu_ready = 1`. **ZERO memory bus commands issued!**
6. **Tree-PLRU State Update**: $B_0 \Leftarrow 1, B_1 \Leftarrow 1$.
7. **FSM State**: Remains in **`ST_IDLE_LOOKUP`**! Operation completes in **1 clock cycle** ($0.3125\text{ ns}$).

```text
STATE OF SET ROW 0 AFTER OPERATION 2

 Set 0 Way 0 : Tag = 0x0000_0000_0001_0 | Valid = 1 | DIRTY = 1 (Modified!)
 Set 0 Way 1 : Tag = 0x0000_0000_0002_0 | Valid = 1 | Dirty = 0
 Set 0 Way 2 : Tag = 0x0000_0000_0003_0 | Valid = 1 | DIRTY = 1
 Set 0 Way 3 : Tag = 0x0000_0000_0004_0 | Valid = 1 | Dirty = 0
 Tree-PLRU Candidate Way for Eviction : WAY 2 (B0 = 1, B2 = 0)
```


##### Cycle 4: Victim Inspection Phase (`ST_EVICT_CHECK`)
1. Tree-PLRU decoder inspects current tree bits ($B_0 = 1, B_2 = 0$) and identifies **Way 2 as the victim way**.
2. Controller reads Way 2 metadata:
   * Tag = `0x0000_0000_0003_0` (Address `0x0000_0000_000C_0000`).
   * Valid bit $V_2 = 1$.
   * **Dirty bit $D_2 = 1$ (VICTIM LINE IS DIRTY!)**.
3. Because $D_2 == 1$, the dirty line must be offloaded before overwriting!
4. FSM transitions to **`ST_WBB_PUSH`**!


##### Cycle 6: Memory Bus Line Fill Request (`ST_MEM_READ`)
1. Controller dispatches read request to L2 Cache:
   * `mem_req = 1`, `mem_we = 0`.
   * `mem_addr = 0x0000_0000_0005_0000`.
2. L2 Cache acknowledges request (`mem_ready = 1`).
3. FSM transitions to **`ST_REFILL_WAIT`**!


#### Step 4: Calculate CPU Stall Cycles With vs Without Write-Back Buffer

Let us compare the CPU stall penalty for Operation 3 under two hardware configurations:

##### Configuration A: With Write-Back Buffer (WBB Queue Installed)
* Cycle 3: Miss detected.
* Cycle 4: Inspect Way 2.
* Cycle 5: Move Way 2 to WBB ($1\text{ cycle}$).
* Cycle 6: Issue L2 Read Fill ($1\text{ cycle}$).
* Cycles 7..18: L2 Read Fill Wait ($12\text{ cycles}$).
* Cycle 18: Critical Word Forwarded, `cpu_ready = 1` asserted.

$$\text{Total CPU Stall Cycles (With WBB)} = 18 - 2 = \mathbf{16 \text{ clock cycles}} \quad (5.0\text{ ns})$$

##### Configuration B: Naive Sequential Eviction (No WBB Queue)
Without a WBB queue, the controller must write dirty Way 2 back to L2 Cache **BEFORE** issuing the read fill for Line $A_3$:
* Step 1: Write-back dirty Way 2 to L2 Cache ($T_{\text{L2\_write}} = 8\text{ clock cycles}$).
* Step 2: Issue Read Line Fill for Line $A_3$ to L2 Cache ($1\text{ cycle}$).
* Step 3: Wait for L2 Read Line Fill ($T_{\text{L2\_read}} = 12\text{ clock cycles}$).

$$\text{Total CPU Stall Cycles (No WBB)} = 1 + 8 + 1 + 12 = \mathbf{22 \text{ clock cycles}} \quad (6.875\text{ ns})$$

##### Performance Advantage of Write-Back Buffer:

$$\text{Stall Reduction} = 22\text{ cycles} - 16\text{ cycles} = \mathbf{6 \text{ clock cycles saved per dirty miss!}}$$

$$\text{Latency Reduction Percentage} = \frac{6}{22} \times 100\% = \mathbf{27.3\% \text{ Stall Reduction!}}$$

By offloading the dirty line into a Write-Back Buffer, the integrated cache controller reduced CPU stall latency during dirty miss evictions by **$27.3\%$**, allowing the processor pipeline to restart 6 clock cycles earlier!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Integrated Single-Core Cache**: A clock-synchronous hardware memory subsystem that integrates SRAM tag/data matrices, parallel tag comparators, Tree-PLRU replacement engines, Write-Back Buffers, and line refill units into a single cohesive module governed by a master control state machine.
* **Cache Controller Datapath**: The physical inter-unit interconnect topology and control state machine (`ST_IDLE_LOOKUP` $\to$ `ST_EVICT_CHECK` $\to$ `ST_WBB_PUSH` $\to$ `ST_MEM_READ` $\to$ `ST_REFILL_WAIT`) that manages hit/miss determination, pipeline stall signal driving (`cpu_ready`), non-blocking dirty line offloading, and Critical-Word-First data forwarding.
