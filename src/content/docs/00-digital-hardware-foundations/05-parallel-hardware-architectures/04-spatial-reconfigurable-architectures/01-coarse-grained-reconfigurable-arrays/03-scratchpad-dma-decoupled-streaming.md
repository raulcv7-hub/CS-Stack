---
title: "Scratchpad DMA Engine Architecture and Decoupled Stream Buffer Mechanics"
---

# Scratchpad DMA Engine Architecture and Decoupled Stream Buffer Mechanics

## The Memory Operand Staging Bottleneck and CPU Intervention Stalls

In high-performance spatial reconfigurable computing, Coarse-Grained Reconfigurable Arrays (CGRAs) achieve massive processing throughput by mapping software loops directly across a two-dimensional grid of Processing Elements (PEs). In these spatial dataflow architectures, instruction fetch and decode cycles are eliminated during loop execution. Data words stream continuously through physical silicon routing paths between neighboring 32-bit ALUs, processing one or more data tokens on every single clock cycle.

However, the high-speed spatial execution grid does not exist in isolation. All raw data operands—such as large 2D image frames, audio signal buffers, or scientific matrix arrays—initially reside in high-capacity, off-chip **Global Main Memory (DRAM)**.

Reading a data word from off-chip DRAM memory is an inherently high-latency operation, requiring **400 to 800 clock cycles** ($200 \text{ to } 400\text{ nanoseconds}$) for memory controller activation, row-buffer selection, and bus transmission.

Now, consider the physical hardware disaster that occurs if a spatial CGRA grid attempts to fetch data operands directly from off-chip DRAM using standard CPU-driven software loops or un-buffered blocking memory accesses:

```text
CPU-DRIVEN MEMORY STAGING BOTTLENECK

 Host CPU Core (Manually Copying Data Word-by-Word)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. CPU Reads Word from Off-Chip DRAM (Stalls 600 Cycles!)   │
 │ 2. CPU Writes Word to On-Chip Scratchpad SRAM Buffer        │
 │ 3. CPU Triggers CGRA Execution Pipeline                      │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
               ▼                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Spatial CGRA PE Grid (16 Processing Elements)               │
 └─────────────────────────────────────────────────────────────┘
  (CPU spends 99% of time copying data; CGRA sits 100% FROZEN!)
```

Let us analyze the two severe microarchitectural failures of this approach:

### 1. The CPU Intervention Overhead Trap
If the host CPU core must manually supervise memory data transfers—reading data words from main memory, writing them into on-chip buffers, and updating memory pointers in software:
* The host CPU core spends **$99\%+$ of its clock cycles executing repetitive memory copy loops**, completely stalling general-purpose application execution.
* The CPU instruction pipeline, branch predictors, and cache controllers burn significant electrical power simply moving bytes from one memory space to another.


## The Autonomous Freight Elevator and the Buffer Assembly Line: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Scratchpad DMA engines, decoupled stream buffers, asynchronous memory staging, and Decoupled Access-Execute (DAE) pipelines before inspecting gate-level hardware state machines, DMA descriptors, and memory stream latency equations, let us consider an everyday analogy: **The Automobile Factory Assembly Line**.

Imagine a team of 16 factory workers (**A 16-PE Spatial CGRA Grid**) working on an automated assembly line located on the 5th floor of a manufacturing plant (**On-Chip Silicon Die**).

```text
THE AUTOMOBILE FACTORY ANALOGY

 Factory Assembly Workers (Spatial CGRA Grid)
 ┌─────────────────────────────────────────────────────────────┐
 │ 16 Workers assemble car engines on a fast conveyor belt.    │
 │ Assembly line moves at 1 engine component per second.       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Needs Constant Supply of Steel Parts
 Central Supply Warehouse (Off-Chip Global DRAM Memory)
 ┌─────────────────────────────────────────────────────────────┐
 │ Located in the basement 5 floors below (Long Latency!).     │
 └─────────────────────────────────────────────────────────────┘
```

The assembly line requires a continuous supply of heavy steel engine parts (**Data Operands**). The main supply warehouse (**Off-Chip DRAM Memory**) is located in the basement 5 floors below. 

Taking a manual trip down to the basement warehouse to fetch a box of parts takes **10 minutes** ($600\text{ seconds}$).

Let us observe two different operational procedures for supplying parts to the assembly line:


### Procedure 2: The Autonomous Freight Elevator & Buffer Conveyor (DMA & Stream Buffer)

The factory owner installs two automated hardware delivery systems:
1. **An Autonomous Freight Elevator (The Scratchpad DMA Engine)**
2. **An Assembly Line Buffer Hopper (The Decoupled Stream Buffer)**

```text
PROCEDURE 2: AUTONOMOUS ELEVATOR & BUFFER HOPPER (DECOUPLED STREAMING)

 Manager issues 1 Order Ticket: "Fetch 1,000 Boxes to 5th Floor Storage!"
                                │
                                ▼
 Autonomous Freight Elevator (DMA) runs in background ──► Unloads to 5th Floor Storage!
                                                           │
                                                           ▼
 Buffer Hopper (Stream Buffer) feeds conveyor belt at 1 Part / Second!
 (Assembly line runs CONTINUOUSLY without stopping for a single second!)
```

Trace how Procedure 2 operates:

#### 1. Single Command Initialization (DMA Command Trigger)
Before production starts, the factory manager writes a single 1-page order ticket (**A DMA Descriptor**): *"Fetch 1,000 boxes of engine parts from Basement Shelf 500 and deliver them to 5th Floor Storage Room B."* 

The manager presses the start button on the elevator (**Triggers the DMA Engine**) and **immediately walks away to manage other business**!

#### 2. Autonomous Background Transport (Scratchpad DMA Engine)
The autonomous freight elevator runs up and down between the basement and the 5th floor in the background. It loads high-capacity pallets of parts and stores them inside 5th Floor Storage Room B (**On-Chip Scratchpad SRAM Memory**). 

The assembly workers do NOT touch the elevator!

#### 3. Continuous Buffer Streaming (Decoupled Stream Buffer)
An automated loading hopper (**The Decoupled Stream Buffer**) sits between Storage Room B and the assembly line.
* The hopper pre-loads 10 parts into its local feeder chute.
* As Worker 1 reaches out their hand, the hopper drops **1 part into their hand every single second**!
* If the freight elevator experiences a minor 5-second delay, **the assembly line never notices**, because the hopper's feeder chute absorbs the delay!

Notice what Procedure 2 achieved:
* **Zero Manager Interruption (Zero CPU Overhead)**: The manager spent 1 second writing an order ticket and $0\text{ seconds}$ carrying boxes.
* **$100\%$ Assembly Line Productivity**: The 16 workers assembled engines continuously at 1 part per second without stopping for a single second!
* **Complete Latency Hiding**: The 10-minute elevator trip was completely hidden behind the local buffer hopper.

This autonomous freight elevator and buffer hopper system is the exact physical analogue of **Scratchpad DMA Engines and Decoupled Stream Buffers**:
* The 16 assembly workers are **16 Processing Elements (PEs) in a CGRA Grid**.
* The 5-floor stair walk is **Off-Chip DRAM Read Latency ($600\text{ cycles}$)**.
* The factory manager is **The Host CPU Core**.
* The 1-page order ticket is a **DMA Control Descriptor**.
* The autonomous freight elevator is **The Scratchpad DMA Engine**.
* 5th Floor Storage Room B is **On-Chip Scratchpad SRAM Memory**.
* The automated buffer hopper is a **Decoupled Stream Buffer (FIFO Queue)**.


### The Structure of a DMA Control Descriptor

To initiate a direct memory transfer, the host CPU writes a small 16-byte or 32-bit control data structure called a **DMA Descriptor** into the DMA engine's memory-mapped control registers:

```text
DMA DESCRIPTOR CONTROL REGISTER FIELDS

 ┌─────────────────────────────────────────────────────────────┐
 │ Source Address Register (Src_Addr)    : 64-Bit DRAM Address │
 ├─────────────────────────────────────────────────────────────┤
 │ Destination Address Register (Dst_Addr): 32-Bit SRAM Address │
 ├─────────────────────────────────────────────────────────────┤
 │ Transfer Length Register (Transfer_Len): Total Bytes (e.g. 64KB)│
 ├─────────────────────────────────────────────────────────────┤
 │ Element Stride Register (Stride_Bytes): Stride Step Size    │
 ├─────────────────────────────────────────────────────────────┤
 │ Control & Status Register (Control_Flags): Start, Int_Enable │
 └─────────────────────────────────────────────────────────────┘
```

1. **Source Address Register (`Src_Addr`)**: The 64-bit physical or virtual starting memory address in off-chip DRAM where the data array resides (e.g., `0x0000_7FFF_8000_0000`).
2. **Destination Address Register (`Dst_Addr`)**: The 32-bit address inside the local on-chip Scratchpad SRAM array where the data block will be stored (e.g., `0x0000_1000`).
3. **Transfer Length Register (`Transfer_Len`)**: The total payload size to be transferred in bytes (e.g., $65,536\text{ bytes} = 64\text{ KB}$).
4. **Stride Register (`Stride_Bytes`)**: Specifies whether the transfer is contiguous ($S = 0$) or strided (e.g., reading a column of a 2D matrix where $S = \text{Row\_Width}$).
5. **Control and Status Register (`Control_Flags`)**: Contains the `START` trigger bit, transaction completion interrupt enable flags, and status flags (`BUSY`, `DONE`, `ERROR`).


## Primitive 2: Decoupled Stream Buffers (Decoupled Access-Execute)

Now let us examine the second core primitive: **The Decoupled Stream Buffer**.

While the Scratchpad DMA Engine stages large data blocks from off-chip DRAM into on-chip SRAM, how does data move from the on-chip SRAM into the boundary Processing Elements (PEs) of the spatial CGRA grid?

If a boundary PE ($\text{PE}_{0,0}$) must issue explicit SRAM address reads on every clock cycle, address generation logic and SRAM port contention can still create pipeline stalls.

To decouple address generation from spatial math execution, microarchitects implement **The Decoupled Access-Execute (DAE) Paradigm** using **Decoupled Stream Buffers**.

> **A Decoupled Stream Buffer** is an asynchronous hardware interface comprising a Stream Address Generation Unit (AGU) and a high-speed First-In, First-Out (FIFO) queue positioned between Scratchpad SRAM and the boundary PEs of a CGRA grid, designed to pre-fetch data words from SRAM into FIFO buffers so that PEs can consume data operands in $1\text{ clock cycle}$ without executing address math or waiting on SRAM memory access latencies.

```text
DECOUPLED STREAM BUFFER HARDWARE ARCHITECTURE

 Scratchpad SRAM Memory (On-Chip)
 ┌─────────────────────────────────────────────────────────────┐
 │ Staged Data Array (e.g., 64 KB Image Tile)                  │
 └─────────────┬───────────────────────────────────────────────┘
               │ SRAM Read Port (Driven by Stream AGU)
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ DECOUPLED STREAM BUFFER INTERFACE                           │
 │                                                             │
 │  ┌───────────────────────────────────────────────────────┐  │
 │  │ Stream Address Generation Unit (Stream AGU)           │  │
 │  │ Auto-calculates: Addr_k = Base + (k * Stride)         │  │
 │  └───────────────────────────┬───────────────────────────┘  │
 │                              │                              │
 │                              ▼ Pre-fetched Data Words       │
 │  ┌───────────────────────────────────────────────────────┐  │
 │  │ Asynchronous Stream FIFO Queue (e.g., 8-Word Buffer)  │  │
 │  │ [ Word 3 │ Word 2 │ Word 1 │ Word 0 ]                 │  │
 │  └───────────────────────────┬───────────────────────────┘  │
 └─────────────┬────────────────┴──────────────────────────────┘
               │ Handshake Signals: Valid / Ready (1 Word / Cycle)
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Spatial CGRA PE Grid (Boundary PE_0,0 Input Port)           │
 └─────────────────────────────────────────────────────────────┘
```


### Handshake Protocol: Valid / Ready Signaling

Data flow between the Decoupled Stream Buffer FIFO and the boundary PE is controlled by a simple 2-wire hardware **Handshake Protocol**:

```text
VALID / READY HANDSHAKE PROTOCOL

 Stream Buffer FIFO                         Boundary Processing Element (PE)
 ┌──────────────────────────┐               ┌───────────────────────────┐
 │ Stream FIFO Queue        ├──────────────►│ Input Register            │
 │                          │  Data [32b]   │                           │
 │                          ├──────────────►│                           │
 │                          │  VALID Signal │                           │
 │                          │               │                           │
 │                          │◄──────────────┤                           │
 │                          │  READY Signal │                           │
 └──────────────────────────┘               └───────────────────────────┘
```

* **`VALID` Signal (Output from Stream Buffer)**: Asserted high (`VALID = 1`) when the Stream FIFO queue contains at least 1 valid data word.
* **`READY` Signal (Output from Boundary PE)**: Asserted high (`READY = 1`) when the boundary PE is ready to consume a data word on the current clock cycle.

#### The Transaction Transfer Invariant:
A data word transfer occurs if and only if **BOTH `VALID` AND `READY` ARE HIGH ON THE SAME CLOCK EDGE**:

$$\mathbf{\text{Transfer Event} = (\text{VALID} == 1) \quad \mathbf{\text{AND}} \quad (\text{READY} == 1)}$$

```text
HANDSHAKE TRANSACTION SCENARIOS

 Scenario 1: Smooth Dataflow (VALID = 1, READY = 1)
 ──► Data word transferred in 1 Clock Cycle! FIFO pops 1 word. PE executes math.

 Scenario 2: Memory Delay / Buffer Underflow (VALID = 0, READY = 1)
 ──► Stream FIFO is empty! PE detects VALID = 0 and STALLS gracefully!
     No invalid data or garbage numbers enter the spatial pipeline.

 Scenario 3: Execution Backpressure (VALID = 1, READY = 0)
 ──► PE is busy or stalled downstream. Stream FIFO holds data and asserts Backpressure.
```

By using `VALID` / `READY` handshaking, the spatial PE grid automatically pauses if memory data is delayed (`VALID = 0`), and automatically resumes when data arrives—**preventing garbage data from entering the spatial pipeline** without requiring complex control software!


## Solved Industrial Engineering Exercise: Quantitative Scratchpad DMA Burst Staging, Stream Buffer Latency Hiding, and Throughput Analysis

To consolidate your complete mastery of Scratchpad DMA engines, DMA descriptors, decoupled stream buffers, `VALID`/`READY` handshaking, double-buffering staging pipelines, and throughput calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate DMA Tile Fetch Time ($T_{\text{DMA\_Fetch}}$)

Tile size $= 16,384\text{ bytes}$. DRAM Burst Speed $= 20\text{ Bytes/cycle}$ ($5\text{ words/cycle}$).

##### 1. DRAM Burst Transmission Cycles ($T_{\text{burst}}$):
$$T_{\text{burst}} = \frac{16,384 \text{ Bytes}}{20 \text{ Bytes/cycle}} = \mathbf{819.2 \text{ Clock Cycles}} \implies \mathbf{820 \text{ Clock Cycles}}$$

##### 2. Total DMA Tile Fetch Time ($T_{\text{DMA\_Fetch}}$):
Includes DRAM initial access latency ($400\text{ cycles}$) + burst transmission ($820\text{ cycles}$):

$$T_{\text{DMA\_Fetch}} = T_{\text{DRAM\_lat}} + T_{\text{burst}} = 400 + 820 = \mathbf{1,220 \text{ Clock Cycles}}$$

$$T_{\text{DMA\_Fetch\_us}} = 1,220 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{0.7625 \text{ microseconds}} \quad (762.5\text{ ns})$$

The Scratchpad DMA Engine fetches a full $16\text{-KB}$ tile in **$1,220\text{ clock cycles}$ ($0.7625\text{ }\mu\text{s}$)**.


#### Step 3: Calculate Total Workload Execution Time (System A vs System B)

Workload size $= 1,000\text{ tiles}$.

##### 1. System A (CPU-Driven Single Buffer — Un-Overlapped):
For each tile, System A pays:
* CPU setup time $= 160\text{ cycles}$.
* DRAM tile fetch time $= 1,220\text{ cycles}$.
* CGRA compute time $= 4,096\text{ cycles}$.

$$T_{\text{tile\_A}} = 160 + 1,220 + 4,096 = \mathbf{5,476 \text{ Clock Cycles per Tile}}$$

$$\text{Total Cycles}_A = 1,000 \text{ tiles} \times 5,476 \text{ cycles/tile} = \mathbf{5,476,000 \text{ Clock Cycles}}$$

$$T_{\text{exec\_A}} = 5,476,000 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0034225 \text{ seconds}} \quad (\mathbf{3.4225 \text{ ms}})$$


#### Step 4: Calculate Performance Speedup Factor and CPU Cycles Saved

##### 1. Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec\_A}}}{T_{\text{exec\_B}}} = \frac{3.4225\text{ ms}}{2.5609\text{ ms}} = \frac{5,476,000\text{ cycles}}{4,097,380\text{ cycles}} \approx \mathbf{1.3365\times \text{ Performance Advantage!}}$$

##### 2. Calculate Host CPU Clock Cycles Saved:
* System A required CPU manual intervention on every tile $= 1,000 \times 160 = 160,000\text{ CPU cycles}$.
* System B required CPU intervention ONCE $= 160\text{ CPU cycles}$.

$$\text{CPU Cycles Saved} = 160,000 - 160 = \mathbf{159,840 \text{ CPU Clock Cycles Saved!}}$$

$$\text{CPU Overhead Reduction} = \left( 1 - \frac{160}{160,000} \right) \times 100\% = \mathbf{99.90\% \text{ CPU Interruption Cut!}}$$

```text
MEMORY STAGING PERFORMANCE OPTIMIZATION SUMMARY

 System Implementation   │ Tile Staging Latency │ Total Time (1,000 Tiles)│ CPU Overhead Cycles
─────────────────────────┼──────────────────────┼─────────────────────────┼─────────────────────
 System A (CPU Single-Buf)│ 5,476 Cycles / Tile  │ 3.4225 ms               │ 160,000 Cycles
 System B (DMA Double-Buf)│ 4,097 Cycles / Tile  │ 2.5609 ms               │     160 Cycles
                         │ (25.2% Latency Cut!) │ (0.8616 ms Saved!)      │ (99.9% CPU Freed!)
```

##### Engineering Conclusion:
By using an Autonomous Scratchpad DMA Engine and Decoupled Stream Buffers with double-buffering, System B freed the host CPU for **$99.90\%$ of its cycles**, completely hid $600\text{-cycle}$ DRAM memory latencies, and reduced total 1,000-tile execution time from $3.4225\text{ ms}$ down to $2.5609\text{ ms}$—delivering a **$1.337\times$ performance speedup ($33.7\%$ throughput gain)**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Scratchpad DMA Engine**: An autonomous hardware memory controller that transfers data blocks directly between off-chip DRAM and on-chip Scratchpad SRAM using high-speed burst transactions, driven by software descriptors without consuming host CPU execution cycles.
* **Decoupled Stream Buffer**: A hardware interface comprising a Stream Address Generation Unit (AGU) and asynchronous FIFO queue positioned between Scratchpad SRAM and CGRA boundary PEs, which pre-fetches data words into local queues so that spatial processing elements can consume data operands in $1\text{ clock cycle}$ without executing address math or waiting on SRAM memory access latencies.
