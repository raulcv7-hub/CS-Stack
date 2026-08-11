---
title: "GPU Crossbar Interconnect Architecture and Partitioned L2 Cache Mechanics"
---

# GPU Crossbar Interconnect Architecture and Partitioned L2 Cache Mechanics

## The Monolithic L2 Bottleneck and Interconnect Port Contention Crisis

In modern graphics processing units (GPUs) and massively parallel SIMT architectures, memory performance relies on a multi-tiered memory hierarchy. A high-end GPU contains dozens of independent execution engines called **Streaming Multiprocessors (SMs)**—typically 64, 80, 128, or more SMs per silicon die. Each SM hosts thousands of active scalar threads organized into execution warps. When thread instructions miss their local, private Level 1 (L1) Data Caches, the memory requests travel downstream to read or write the shared **Level 2 (L2) Cache** and off-chip High-Bandwidth Memory (HBM) or GDDR DRAM.

On every single clock cycle, hundreds of memory read and write requests are emitted concurrently across the entire GPU die.

Now, consider the physical hardware crisis that occurs if a GPU microarchitect attempts to design the shared L2 cache as a **single, monolithic, centralized memory block**:

```text
THE MONOLITHIC L2 CACHE INTERCONNECT BOTTLENECK

 80 Streaming Multiprocessors (SMs) Emitting Memory Requests
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │ SM 0 │ SM 1 │ SM 2 │ SM 3 │...│SM 76 │SM 77 │SM 78 │SM 79 │
 └──┬───┴──┬───┴──┬───┴──┬───┴───┴──┬───┴──┬───┴──┬───┴──┬───┘
    │      │      │      │          │      │      │      │
    ▼      ▼      ▼      ▼          ▼      ▼      ▼      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ MONOLITHIC CENTRALIZED L2 CACHE MEMORY BLOCK                │
 │ Single Shared Input Interface & Memory Controller           │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         80-TO-1 INTERCONNECT CONGESTION & PORT ARBITRATION STALL!
         (75 out of 80 SMs sit frozen waiting for access!)
```

Trace the physical wire congestion and memory arbitration failure in a monolithic design:
1. **Un-routable Wire Congestion**: Routing memory request wires from 80 separate SMs distributed across a $600\text{ mm}^2$ silicon die to a single centralized L2 cache block requires hundreds of thousands of long, intersecting copper traces. The wire routing channels consume massive silicon area, creating severe layout gridlock.
2. **Extreme Access Port Contention**: A single memory block can service only a few read or write commands per clock cycle. If 80 SMs request memory data simultaneously, the centralized L2 cache can service perhaps 2 or 4 requests, forcing the remaining 76 SMs to **stall in interconnect arbitration queues**!
3. **Single Point of Failure for Memory Bandwidth**: The total bandwidth of the GPU is capped by the single interface of the centralized L2 cache. The multi-terabyte-per-second bandwidth of off-chip HBM memory channels is completely choked by the single L2 bottleneck.

How do computer architects connect 80 or 128 requesting SMs to multi-terabyte-per-second memory subsystems without causing wire routing gridlock or port contention stalls?

To solve this problem, GPU microarchitects implement **Partitioned L2 Caches** linked by a high-bandwidth **GPU Crossbar Interconnect**.

Instead of building one giant L2 cache block, the hardware divides the shared L2 cache into **$N$ independent, parallel physical L2 cache slices (partitions)**. Each L2 partition is placed directly next to its own dedicated off-chip HBM/DRAM memory controller.

To route memory packets between the $M$ requesting SMs and the $N$ target L2 partitions concurrently, the GPU implements an $M \times N$ **Crossbar Interconnect Switch Matrix**.

By scattering memory addresses evenly across $N$ L2 partitions using **Address Hashing**, up to $N$ independent SMs can read or write $N$ different L2 partitions **at the exact same physical nanosecond without interfering with each other!**


### Design 1: The Monolithic Central Baggage Hall (Centralized L2 Cache)
The airport builds one single, giant **Central Baggage Hall** in the middle of the airport.
1. At 12:00 PM, 80 planes land simultaneously at 80 gates. All 80 planes send luggage trucks to the single Central Baggage Hall.
2. The single entrance road to the Central Baggage Hall is **completely jammed with luggage trucks** (**Interconnect Wire Congestion**).
3. The Central Baggage Hall has only 4 unloading doors. It services 4 trucks, while **76 trucks sit idling on the tarmac for hours** waiting for their turn (**Memory Arbitration Stalls**)!

```text
DESIGN 1: CENTRAL BAGGAGE HALL (TRAFFIC GRIDLOCK)

 80 Planes Land at 80 Gates ──► 80 Trucks Rush to 1 Central Hall
                                │
                                ▼
         Single Entrance Road Jammed! 76 Trucks Frozen on Tarmac!
         (Airport throughput collapses due to 80-to-1 bottleneck!)
```

Look at the failure: The airport's luggage processing speed is choked by the single Central Baggage Hall's entrance doors.


## Primitive 1: Partitioned L2 Cache Architecture

Now that we possess a clear intuitive mental model of regional baggage terminals, let us examine the formal engineering mechanics of **Partitioned L2 Cache Architecture**.

In a GPU microarchitecture, the shared Level 2 (L2) cache is not a single memory array. It is physically partitioned into $N_{\text{slices}}$ independent, self-contained SRAM memory blocks called **L2 Cache Slices** (or **L2 Partitions**).

Typically, the number of L2 partitions matches or relates to the number of off-chip memory channels (e.g., $N_{\text{slices}} = 8, 16, 24, \text{or } 32$ partitions).

```text
PARTITIONED L2 CACHE AND MEMORY CHANNEL TOPOLOGY

 16-Partition L2 Cache Memory Subsystem
 ┌─────────────────────────────────────────────────────────────┐
 │ L2 Slice 0  │ L2 Slice 1  │ L2 Slice 2  │ ... │ L2 Slice 15 │
 │ (512 KB)    │ (512 KB)    │ (512 KB)    │     │ (512 KB)    │
 └──────┬──────┴──────┬──────┴──────┬──────┴─────┴──────┬──────┘
        │             │             │                   │
        ▼             ▼             ▼                   ▼
 ┌───────────┐ ┌───────────┐ ┌───────────┐       ┌───────────┐
 │ DRAM Ch 0 │ │ DRAM Ch 1 │ │ DRAM Ch 2 │  ...  │ DRAM Ch15 │
 └───────────┘ └───────────┘ └───────────┘       └───────────┘
  (Each 512-KB L2 Slice is tightly coupled to its own DRAM Channel!)
```


### Address Hashing and Interleaving Across L2 Slices

How does the GPU memory subsystem assign physical memory addresses ($A$) to specific L2 cache slices to ensure that memory requests are distributed evenly across all $N_{\text{slices}}$ partitions?

The GPU uses **Address Hashing (Bit-Swizzling)**.

Let $A$ be a 64-bit physical memory byte address emitted by an SM on an L1 cache miss.

In a simple modulo interleaving scheme with $N_{\text{slices}} = 16 = 2^4$ partitions and a cache line size of $L = 128\text{ bytes}$ ($2^7$ bytes):

$$\mathbf{\text{L2\_Slice\_ID}(A) = \left\lfloor \frac{A}{128} \right\rfloor \pmod{16}}$$

In digital hardware logic, taking the word address modulo $16$ requires zero active logic gates—it is implemented by extracting **bits $[10:7]$ of the physical address vector**:

$$\mathbf{\text{L2\_Slice\_ID}(A) = A[10:7]}$$

```text
PHYSICAL ADDRESS BIT PARSING FOR 16 L2 SLICES (128-BYTE LINE)

 Bit 63                                              Bit 11 Bit 10 Bit 7 Bit 6  Bit 0
 ┌─────────────────────────────────────────────────────────┬────────────┬───────────┐
 │ L2 Tag & Set Index Bits                                 │L2 Slice ID │ Line Off  │
 └─────────────────────────────────────────────────────────┴────────────┴───────────┘
  ◄───────────────────────────────────────────────────────► ◄── 4 Bits ─► ◄─ 7 Bits ─►
                                                            (Selects 0..15)
```

#### Tracing Address Interleaving:
* Address `0x0000_0000` (Line 0): Bits $[10:7] = 0000_2 \implies \mathbf{\text{L2 Slice 0}}$.
* Address `0x0000_0080` (Line 1): Bits $[10:7] = 0001_2 \implies \mathbf{\text{L2 Slice 1}}$.
* Address `0x0000_0100` (Line 2): Bits $[10:7] = 0010_2 \implies \mathbf{\text{L2 Slice 2}}$.
* Address `0x0000_0780` (Line 15): Bits $[10:7] = 1111_2 \implies \mathbf{\text{L2 Slice 15}}$.
* Address `0x0000_0800` (Line 16): Bits $[10:7] = 0000_2 \implies \mathbf{\text{L2 Slice 0 \ (Wraps Around!)}}$.

Notice the result: As a GPU program streams through a large data array in global memory, **consecutive 128-byte cache lines are automatically scattered across L2 Slices 0 through 15 in rotating sequence**! 

All 16 L2 partitions and all 16 off-chip DRAM channels operate at $100\%$ full parallel capacity!


## Primitive 2: GPU Crossbar Interconnect Matrix

Now let us examine the second core primitive: **The GPU Crossbar Interconnect Matrix**.

To route memory request packets between $M$ requesting Streaming Multiprocessors and $N$ target L2 Cache Slices, the GPU implements a high-speed, many-to-many switching network: **The $M \times N$ Crossbar Interconnect**.

> **A GPU Crossbar Interconnect** is a hardware switching matrix comprising $M$ input ports (connected to $M$ SM execution cores) and $N$ output ports (connected to $N$ L2 cache partitions) that allows up to $\min(M, N)$ independent, non-conflicting memory request packets to be routed concurrently across physical bus cross-points in a single clock cycle.

```text
M x N CROSSBAR SWITCH MATRIX SCHEMATIC (4 SMs to 4 L2 SLICES)

              Target L2 Slice 0   Target L2 Slice 1   Target L2 Slice 2   Target L2 Slice 3
                      │                   │                   │                   │
 SM 0 Request Address ┼───────[ X ]───────┼───────[   ]───────┼───────[   ]───────┼───────[   ]
                      │                   │                   │                   │
 SM 1 Request Address ┼───────[   ]───────┼───────[   ]───────┼───────[ X ]───────┼───────[   ]
                      │                   │                   │                   │
 SM 2 Request Address ┼───────[   ]───────┼───────[ X ]───────┼───────[   ]───────┼───────[   ]
                      │                   │                   │                   │
 SM 3 Request Address ┼───────[   ]───────┼───────[   ]───────┼───────[   ]───────┼───────[ X ]
                      │                   │                   │                   │
 (4 SMs communicate with 4 L2 Slices SIMULTANEOUSLY via cross-points [ X ]!)
```


### Crossbar Arbitration and Conflict Resolution

What happens if SM 0 and SM 1 **BOTH request data from L2 Slice 0 on the exact same clock cycle**?

Because L2 Slice 0's input port can accept only one request packet per cycle, a **Crossbar Output Port Conflict** occurs!

The Crossbar Interconnect handles port conflicts through **Crossbar Arbitration**:

```text
CROSSBAR PORT CONFLICT RESOLUTION

 SM 0 Requests L2 Slice 0 ──┐
                            ├──► [ Crossbar Arbiter for L2 Slice 0 ]
 SM 1 Requests L2 Slice 0 ──┘    (Evaluates Priority Policy e.g., Round-Robin)
                                       │
                                       ├─► Cycle 1: Grants SM 0! (SM 1 Stalled)
                                       └─► Cycle 2: Grants SM 1!
```

1. The Crossbar Arbiter for L2 Slice 0 receives both requests ($\text{Req}_{0,0} = 1$ and $\text{Req}_{1,0} = 1$).
2. The arbiter applies a **Round-Robin Priority Policy**:
   * **Cycle 1**: Arbiter grants access to **SM 0** ($\text{Grant}_{0,0} \Leftarrow 1$). SM 0's packet is routed to L2 Slice 0. SM 1 is stalled.
   * **Cycle 2**: Arbiter grants access to **SM 1** ($\text{Grant}_{1,0} \Leftarrow 1$). SM 1's packet is routed to L2 Slice 0.
3. The conflict is resolved deterministically in 2 clock cycles!


## Architectural Scaling: Crossbar Switches vs. 2D Mesh Networks-on-Chip (NoC)

While an $M \times N$ crossbar switch provides ultra-low latency ($1 \text{ to } 2\text{ clock cycles}$) and maximum interconnect bandwidth, physical silicon area constraints limit crossbar scaling.

### The $O(M \cdot N)$ Crossbar Area Limit

The physical area of an $M \times N$ crossbar switch matrix scales with the product of input ports $M$ and output ports $N$:

$$\text{Area}_{\text{crossbar}} \propto M \times N \times W_{\text{bus\_width}}$$

Where:
* $M$ is the number of requesting SM cores (e.g., $80$ SMs).
* $N$ is the number of L2 cache partitions (e.g., $16$ partitions).
* $W_{\text{bus\_width}}$ is the width of the packet data bus in bits (e.g., $128\text{ bits}$).

```text
INTERCONNECT AREA SCALING: CROSSBAR VS 2D MESH NOC

 80 x 16 Crossbar Switch Matrix (Ultra-Fast, but High Area)
 Area = 80 x 16 x 128 = 163,840 Wire Crossing Units! (Near Scaling Ceiling!)

 2D Mesh Network-on-Chip (NoC - Scalable to 256+ SMs)
 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │SM0 │ L2_0├────►│SM1 │ L2_1├────►│SM2 │ L2_2├────►│SM3 │ L2_3│
 └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
      ▼                ▼                ▼                ▼
 (Short local router hops; scales linearly O(M+N) to hundreds of cores!)
```

* For an $80 \times 16$ crossbar, the matrix contains $80 \times 16 = \mathbf{1,280 \text{ crosspoint switches}}$, which fits comfortably on a modern GPU die.
* However, if a future GPU scales to $256\text{ SMs}$ and $64\text{ L2 partitions}$, a full crossbar would require $256 \times 64 = \mathbf{16,384 \text{ crosspoint switches}}$!

To scale beyond 100 SMs, ultra-large GPUs transition from single monolithic crossbars to **2D Mesh Networks-on-Chip (NoC)**, where SMs and L2 partitions are arranged in a grid connected by 2D packet routers using wormhole routing!


### Scenario and Parameters

You are a principal memory systems architect designing the L2 cache and interconnect subsystem for a $2.0\text{ GHz}$ GPU ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The GPU contains **64 Streaming Multiprocessors** (SM 0 through SM 63) connected via an $80 \times 16$ Crossbar Interconnect to **16 independent L2 Cache Partitions** (L2 Slice 0 through L2 Slice 15).

```text
2.0 GHz GPU SUBSYSTEM WITH 16-PARTITION L2 CACHE & CROSSBAR

 64 SM Cores (SM 0 .. SM 63) ──► [ 64 x 16 Crossbar Switch Matrix ] ──► 16 L2 Cache Slices
 Clock T = 500 ps                 Crossbar Latency = 2 Cycles          HBM3 Ch = 1,600 GB/s
```

#### Subsystem Memory Specifications:
* Total Shared L2 Cache Capacity: $32\text{ Megabytes}$ ($32,768\text{ KB}$).
* L2 Partitioning: 16 L2 Cache Slices ($N_{\text{slices}} = 16$).
* L2 Slice Size: $\frac{32,768\text{ KB}}{16} = 2,048\text{ KB} = \mathbf{2 \text{ Megabytes per slice}}$.
* L2 Cache Line Size: $128\text{ Bytes}$ ($W_{\text{line}} = 128\text{ bytes}$).
* Crossbar Interconnect Latency: $T_{\text{xbar}} = 2\text{ clock cycles}$ ($1.00\text{ ns}$) per packet traversal.
* L2 Cache Hit Latency: $T_{\text{L2\_hit}} = 12\text{ clock cycles}$ ($6.00\text{ ns}$).
* L2 Partition Input Port Capacity: Each L2 slice can accept **1 memory request packet per clock cycle**.

#### Workload Memory Request Event:
At physical time $t = 0.0\text{ ns}$ (Clock Cycle 0), four SM cores dispatch L1-miss read requests simultaneously:
* **SM 0**: Requests byte address $A_0 = \text{0x0001\_0080}$ (`65,664_10`).
* **SM 1**: Requests byte address $A_1 = \text{0x0001\_0100}$ (`65,792_10`).
* **SM 2**: Requests byte address $A_2 = \text{0x0001\_0880}$ (`67,712_10`).
* **SM 3**: Requests byte address $A_3 = \text{0x0001\_0180}$ (`65,920_10`).

Assume low-order bit-swizzling address hashing for 16 L2 slices ($128\text{-byte}$ lines):

$$\text{L2\_Slice\_ID}(A) = \left\lfloor \frac{A}{128} \right\rfloor \pmod{16} = A[10:7]$$

#### Your Objective

1. Calculate the target L2 Slice IDs ($\text{L2\_Slice\_ID}$) for addresses $A_0, A_1, A_2, A_3$.
2. Determine if any **Crossbar Output Port Conflicts** occur among the four requests.
3. Trace the crossbar arbitration schedule and calculate the exact clock cycle when each SM's request packet arrives at its target L2 slice.
4. Calculate the total completion time (in nanoseconds) for all four memory reads to hit in L2 and return data to their respective SMs.
5. Calculate the effective interconnect memory throughput (in GB/sec) achieved for this 4-request transaction.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Crossbar Arbitration and Port Conflict Resolution

Let us analyze the target L2 slices for the four requests:
* **SM 0** targets **L2 Slice 1**.
* **SM 1** targets **L2 Slice 2**.
* **SM 2** targets **L2 Slice 1** $\implies$ **PORT CONFLICT WITH SM 0 ON L2 SLICE 1!**
* **SM 3** targets **L2 Slice 3**.

##### Crossbar Arbitration Trace at Cycle 0 ($t = 0.0\text{ ns}$):
* **L2 Slice 2 Port**: Requested ONLY by SM 1 $\implies$ **Granted immediately to SM 1!**
* **L2 Slice 3 Port**: Requested ONLY by SM 3 $\implies$ **Granted immediately to SM 3!**
* **L2 Slice 1 Port**: Requested by BOTH SM 0 and SM 2 $\implies$ **PORT CONFLICT!**
  * Round-Robin Arbiter grants **SM 0 on Cycle 0** ($\text{Grant}_{0,1} \Leftarrow 1$).
  * **SM 2 is STALLED** and held in queue for 1 cycle.


#### Step 4: Calculate Effective Throughput

Total Data Returned = 4 memory lines $\times 128\text{ bytes} = \mathbf{512 \text{ Bytes}}$.

Total completion time for all 4 requests = Cycle 17 ($8.50\text{ nanoseconds}$).

$$\text{Effective Throughput} = \frac{512\text{ Bytes}}{8.50 \times 10^{-9}\text{ s}} \approx \mathbf{60.235 \times 10^9 \text{ Bytes/sec}} = \mathbf{60.235 \text{ GB/sec}}$$

##### Efficiency Loss from Port Conflict:
* If SM 2 had targeted L2 Slice 0 instead of L2 Slice 1 (Zero port conflict), all 4 requests would have completed at Cycle 16 ($8.00\text{ ns}$).
* Total completion time = $8.00\text{ ns}$.
* Conflict-Free Throughput $= \frac{512\text{ Bytes}}{8.00 \times 10^{-9}\text{ s}} = \mathbf{64.000 \text{ GB/sec}}$.

$$\text{Port Conflict Bandwidth Loss} = \frac{64.000 - 60.235}{64.000} \times 100\% = \mathbf{5.88\% \text{ Throughput Loss}}$$

A single 1-cycle port conflict on L2 Slice 1 caused a $5.88\%$ reduction in effective interconnect throughput for that 4-request burst.


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **GPU Crossbar Interconnect**: A high-speed $M \times N$ switching matrix that connects $M$ requesting Streaming Multiprocessors to $N$ target L2 cache partitions, enabling up to $N$ non-conflicting memory request packets to be routed concurrently across physical crosspoints in a single clock cycle.
* **Partitioned L2 Cache**: The microarchitectural division of the shared L2 cache into $N$ independent physical SRAM slices linked to dedicated DRAM memory controllers, using low-order bit-swizzling or XOR address hashing ($\text{Slice\_ID} = A[10:7]$) to scatter consecutive memory blocks and prevent central interconnect bottlenecks.
