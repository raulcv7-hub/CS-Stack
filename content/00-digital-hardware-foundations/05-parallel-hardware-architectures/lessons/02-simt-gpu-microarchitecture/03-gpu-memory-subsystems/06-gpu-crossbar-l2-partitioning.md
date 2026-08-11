content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/03-gpu-memory-subsystems/06-gpu-crossbar-l2-partitioning.md
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

---

## The 80-Gate Airport and 16 Regional Luggage Terminals: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of partitioned L2 caches, $M \times N$ crossbar interconnects, address hashing, and credit-based flow control before inspecting gate-level crossbar matrices, routing arbitration state machines, and memory bandwidth equations, let us consider an everyday analogy: **The International Airport Baggage Network**.

Imagine a massive international airport terminal (**A High-Performance GPU Subsystem**) with **80 arrival gates** (**80 Streaming Multiprocessors / SMs**).

```text
THE AIRPORT BAGGAGE NETWORK ANALOGY

 80 Arrival Gates (80 SMs)                 16 Regional Luggage Terminals (16 L2 Slices)
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Planes Land & Unload      │             │ Regional Luggage Belts    │
 │ 80 Planes Arrive at Once  │             │ Process Bags in Parallel  │
 └───────────────────────────┘             └───────────────────────────┘
```

On every flight, passengers (**Memory Request Packets**) unload from planes at the gates and need to drop off their luggage at baggage claim areas (**Shared L2 Cache Memory**).

Let us observe two different operational designs for how the airport manages baggage claim:

---

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

---

### Design 2: Partitioned Terminals & Multi-Lane Express Highway (Partitioned L2 & Crossbar)

The airport manager replaces the single hall with **Partitioned L2 Slices** and a **Crossbar Express Highway Network**:

#### 1. Partitioned Luggage Terminals (L2 Cache Partitions / Slices)
The airport builds **16 smaller, independent Regional Baggage Terminals** (Terminal 0 to Terminal 15) distributed around the perimeter of the airport die. Each regional terminal is paired directly with its own highway exit to the city (**An Off-Chip HBM DRAM Memory Channel**).

#### 2. Luggage Ticket Hashing (Address-Hashed Interleaving)
To prevent all trucks from rushing to the same regional terminal, the airport assigns luggage to terminals based on the **last 4 digits of the luggage ticket number**:

$$\text{Target Terminal Number} = \text{Ticket Number} \pmod{16}$$

* Ticket #100**00** $\implies$ Go to **Terminal 0**.
* Ticket #100**01** $\implies$ Go to **Terminal 1**.
* Ticket #100**15** $\implies$ Go to **Terminal 15**.

Because ticket numbers are evenly distributed, luggage trucks automatically scatter evenly across all 16 regional terminals!

#### 3. Multi-Lane Express Highway Network (The GPU $80 \times 16$ Crossbar Interconnect)
The airport builds an $80 \times 16$ **Multi-Lane Express Highway System** connecting every single gate directly to every single regional terminal:

```text
DESIGN 2: PARTITIONED TERMINALS AND CROSSBAR HIGHWAY

 80 Gates (SMs)               $80 \times 16$ Crossbar Express Network        16 Terminals (L2 Slices)
 ┌──────────┐                 ┌───────────────────────────┐               ┌──────────┐
 │ Gate 0   ├─────────────────┼─► Express Lane 0 -> T0   ─┼──────────────►│Term. 0   │
 ├──────────┤                 │   Express Lane 1 -> T1   │               ├──────────┤
 │ Gate 1   ├─────────────────┼─► Express Lane 2 -> T2   ─┼──────────────►│Term. 1   │
 ├──────────┤                 │   ...                     │               ├──────────┤
 │ Gate 79  ├─────────────────┼─► Express Lane 15 -> T15 ─┼──────────────►│Term. 15  │
 └──────────┘                 └───────────────────────────┘               └──────────┘
  (16 trucks drop off luggage at 16 different terminals AT THE EXACT SAME SECOND!)
```

Trace how Design 2 operates at 12:00 PM:
1. 80 planes land at 80 gates. Trucks load luggage.
2. Truck 0 at Gate 0 heads to Terminal 0. Truck 1 at Gate 1 heads to Terminal 1. Truck 15 at Gate 15 heads to Terminal 15.
3. **16 trucks drop off luggage at 16 different regional terminals AT THE EXACT SAME SECOND!**
4. The remaining trucks wait in short, 5-truck queues at the 16 regional terminals rather than 1 giant 80-truck line.
5. Total luggage processing throughput increases by **$1,600\%$ ($16\times$ speedup)**!

This multi-terminal airport is the exact physical analogue of **Partitioned L2 Caches and GPU Crossbar Interconnects**:
* The 80 arrival gates are **80 Streaming Multiprocessors (SMs)**.
* The luggage trucks are **Memory Request Packets (Loads / Stores)**.
* The 16 regional baggage terminals are **16 Independent L2 Cache Slices / Partitions**.
* The highway exits to the city are **16 Off-Chip HBM/GDDR DRAM Channels**.
* Luggage ticket modulo assignment is **Address-Hashed Interleaving**.
* The $80 \times 16$ multi-lane express highway is **The GPU Crossbar Interconnect Matrix**.

---

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

---

### Internal Structure of an L2 Cache Partition

Each individual L2 Cache Slice is an autonomous memory subsystem containing four physical components:

1. **SRAM Tag and Data Memory Arrays**: A high-density set-associative SRAM array (typically 16-way or 24-way set associative, e.g., $512\text{ KB}$ per slice).
2. **Partition Request Buffer (Input Queue)**: A First-In, First-Out (FIFO) queue that buffers incoming memory request packets from the crossbar interconnect.
3. **Partition Coherence & Atomic Processing Unit**: Hardware logic that enforces L2 coherence and executes **Near-Memory Atomic Operations** (`atomicAdd` in L2) directly inside the partition.
4. **Dedicated DRAM Memory Controller Interface**: A direct, high-bandwidth internal bus connecting the L2 slice to its assigned off-chip HBM or GDDR DRAM channel controller.

---

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

---

### Non-Power-of-Two Hashing (XOR Swizzling)

What if a GPU contains a non-power-of-two number of L2 partitions (such as 24 or 40 L2 slices)? Or what if a program accesses memory with a stride that happens to match the simple modulo bits $[10:7]$?

To prevent bank hot-spotting on strided accesses, modern GPUs use **XOR Hash Permutations**:

$$\mathbf{\text{L2\_Slice\_ID}(A) = \text{Hash}\Big( A[10:7] \quad \mathbf{\text{XOR}} \quad A[18:15] \quad \mathbf{\text{XOR}} \quad A[26:23] \Big) \pmod{N_{\text{slices}}}}$$

XOR hashing scrambles high-order address bits into the slice selection index, guaranteeing uniform pseudo-random traffic distribution across all L2 partitions even for non-power-of-two strides!

---

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

---

### Hardware Anatomy of a Cross-Point Switch

A crossbar matrix consists of a grid of vertical and horizontal metal signal lines. At every intersection between an input line (from SM $m$) and an output line (to L2 Slice $n$), sits a **Crosspoint Switch Element**:

```text
CROSSPOINT SWITCH ELEMENT DETAIL

 Input Bus from SM m (Address, Data, Control)
 ──────────────┬─────────────────────────────
               │
              ┌┴┐
              │ ├─► Transmission Gate (FET Switch)
              └┬┘
               │  Controlled by Crossbar Arbiter Grant Signal (Grant_m,n = 1)
               ▼
 Output Bus to L2 Slice n
```

When SM $m$ requests data from L2 Slice $n$:
1. The Crossbar Arbiter verifies that L2 Slice $n$'s input port is free.
2. The arbiter asserts the grant signal: $\text{Grant}_{m,n} \Leftarrow 1$.
3. The transmission gates at crosspoint $(m, n)$ turn ON, creating a direct physical electrical connection between SM $m$ and L2 Slice $n$.
4. Memory address and data packets flow through crosspoint $(m, n)$ in **$1 \text{ to } 2\text{ clock cycles}$**!

---

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

---

## Interconnect Flow Control: Credit-Based Queue Management

To prevent high-speed crossbar packet transmissions from overflowing the input request queues at L2 cache partitions, GPUs implement **Credit-Based Flow Control**.

### How Credit-Based Flow Control Operates

Every SM's interconnect port maintains a hardware **Credit Counter** for each target L2 partition:

```text
CREDIT-BASED FLOW CONTROL STATE MACHINE

 SM 0 Interconnect Port for L2 Slice 0
 ┌─────────────────────────────────────────────────────────────┐
 │ Credit Counter Reg = 4 (L2 Slice 0 has 4 open FIFO slots)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        Is Credit Counter > 0?  │
                                │
             ┌──────────────────┴──────────────────┐
             │ YES                                 │ NO (Credits = 0)
             ▼                                     ▼
      Transmit Packet!                     PAUSE TRANSMISSION!
      Decrement Credit: Credits -= 1.      Wait for L2 Credit Return!
```

1. **Initialization**: At power-on, L2 Slice 0 has 4 open slots in its input FIFO buffer. SM 0's Credit Counter for L2 Slice 0 is initialized to **$4$**.
2. **Packet Transmission**: When SM 0 transmits a memory request packet to L2 Slice 0 over the crossbar, SM 0 **decrements its credit counter**:

$$\text{Credits}_{\text{SM0} \to \text{L2\_0}} \Leftarrow \text{Credits}_{\text{SM0} \to \text{L2\_0}} - 1$$

3. **Transmission Pause ($0\text{ Credits}$)**: If SM 0's credit counter for L2 Slice 0 reaches **$0$**, SM 0 **stops transmitting packets to L2 Slice 0 immediately**! 
   
   This prevents SM 0 from overflowing L2 Slice 0's input FIFO queue, guaranteeing zero dropped packets!
4. **Credit Return**: When L2 Slice 0 processes a request and frees a slot in its input FIFO buffer, it sends a 1-bit **Credit Return Signal** back across the interconnect to SM 0.
5. SM 0 increments its credit counter ($\text{Credits} \Leftarrow \text{Credits} + 1$) and resumes packet transmission!

---

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

---

## Solved Industrial Engineering Exercise: Quantitative L2 Partition Hashing, Crossbar Port Arbitration, and Throughput Analysis

To consolidate your complete mastery of partitioned L2 cache architectures, low-order address hashing, $M \times N$ crossbar port contention, and memory bandwidth calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate L2 Slice Mapping for Addresses $A_0 \dots A_3$

We convert addresses to binary and extract bits $[10:7]$ (4 bits for 16 slices):

##### 1. Address $A_0 = \text{0x0001\_0080} \ (65,664_{10})$:
* Binary representation: `0000_0000_0000_0001_0000_0000_1000_0000_2`
* Bit extraction:
  * Line offset bits $[6:0] = \text{7'b000\_0000}_2 = 0_{10}$.
  * Slice Index bits $[10:7] = \text{4'b0001}_2 = \mathbf{1_{10}}$.
* $\text{L2\_Slice\_ID}(A_0) = \mathbf{\text{L2 Slice 1}}$.

##### 2. Address $A_1 = \text{0x0001\_0100} \ (65,792_{10})$:
* Binary representation: `0000_0000_0000_0001_0000_0001_0000_0000_2`
* Bit extraction:
  * Slice Index bits $[10:7] = \text{4'b0010}_2 = \mathbf{2_{10}}$.
* $\text{L2\_Slice\_ID}(A_1) = \mathbf{\text{L2 Slice 2}}$.

##### 3. Address $A_2 = \text{0x0001\_0880} \ (67,712_{10})$:
* Binary representation: `0000_0000_0000_0001_0000_1000_1000_0000_2`
* Bit extraction:
  * Slice Index bits $[10:7] = \text{4'b0001}_2 = \mathbf{1_{10} \quad (\text{COLLISION WITH SM 0!})}$.
* $\text{L2\_Slice\_ID}(A_2) = \mathbf{\text{L2 Slice 1}}$.

##### 4. Address $A_3 = \text{0x0001\_0180} \ (65,920_{10})$:
* Binary representation: `0000_0000_0000_0001_0000_0011_0000_0000_2`
* Bit extraction:
  * Slice Index bits $[10:7] = \text{4'b0011}_2 = \mathbf{3_{10}}$.
* $\text{L2\_Slice\_ID}(A_3) = \mathbf{\text{L2 Slice 3}}$.

```text
ADDRESS PARSING AND SLICE MAPPING SUMMARY

 SM ID │ Physical Address Hex │ Line Offset [6:0] │ Slice Index [10:7] │ Target L2 Slice
───────┼──────────────────────┼───────────────────┼────────────────────┼─────────────────
 SM 0  │     0x0001_0080      │       0x00        │       4'b0001 (1)  │ L2 Slice 1
 SM 1  │     0x0001_0100      │       0x00        │       4'b0010 (2)  │ L2 Slice 2
 SM 2  │     0x0001_0880      │       0x00        │       4'b0001 (1)  │ L2 Slice 1 (PORT CONFLICT!)
 SM 3  │     0x0001_0180      │       0x00        │       4'b0011 (3)  │ L2 Slice 3
```

---

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

---

#### Step 3: Trace Packet Arrival and L2 Read Completion Times

Crossbar traversal takes $T_{\text{xbar}} = 2\text{ clock cycles}$ ($1.00\text{ ns}$). L2 hit latency $T_{\text{L2\_hit}} = 12\text{ clock cycles}$ ($6.00\text{ ns}$).

##### 1. SM 0 Request (Targets L2 Slice 1):
* Cycle 0: Crossbar granted. Traverses crossbar ($2\text{ cycles}$).
* Cycle 2 ($t = 1.00\text{ ns}$): Arrives at L2 Slice 1 input queue.
* Cycle 2 to 14: L2 Slice 1 reads SRAM array ($12\text{ cycles}$).
* Cycle 14 to 16: Data returns across crossbar to SM 0 ($2\text{ cycles}$).
* **SM 0 Data Arrival**: **Cycle 16 ($8.00\text{ ns}$)**.

##### 2. SM 1 Request (Targets L2 Slice 2):
* Cycle 0: Crossbar granted. Traverses crossbar ($2\text{ cycles}$).
* Cycle 2 ($t = 1.00\text{ ns}$): Arrives at L2 Slice 2 input queue.
* **SM 1 Data Arrival**: **Cycle 16 ($8.00\text{ ns}$)**.

##### 3. SM 3 Request (Targets L2 Slice 3):
* Cycle 0: Crossbar granted. Traverses crossbar ($2\text{ cycles}$).
* **SM 3 Data Arrival**: **Cycle 16 ($8.00\text{ ns}$)**.

##### 4. SM 2 Request (Targets L2 Slice 1 — Stalled 1 Cycle by Port Conflict):
* Cycle 0: Stalled by arbiter.
* Cycle 1 ($t = 0.50\text{ ns}$): Crossbar granted to SM 2! Traverses crossbar ($2\text{ cycles}$).
* Cycle 3 ($t = 1.50\text{ ns}$): Arrives at L2 Slice 1 input queue.
* Cycle 3 to 15: L2 Slice 1 reads SRAM array ($12\text{ cycles}$).
* Cycle 15 to 17: Data returns across crossbar to SM 2 ($2\text{ cycles}$).
* **SM 2 Data Arrival**: **Cycle 17 ($8.50\text{ ns}$)**.

```text
CROSSBAR TRANSACTION TIMING MATRIX

 SM ID │ Target Slice │ Crossbar Grant Cycle │ L2 Arrival Cycle │ Data Return to SM
───────┼──────────────┼──────────────────────┼──────────────────┼───────────────────
 SM 0  │ L2 Slice 1   │ Cycle 0 (0.00 ns)    │ Cycle 2 (1.00 ns)│ Cycle 16 (8.00 ns)
 SM 1  │ L2 Slice 2   │ Cycle 0 (0.00 ns)    │ Cycle 2 (1.00 ns)│ Cycle 16 (8.00 ns)
 SM 3  │ L2 Slice 3   │ Cycle 0 (0.00 ns)    │ Cycle 2 (1.00 ns)│ Cycle 16 (8.00 ns)
 SM 2  │ L2 Slice 1   │ Cycle 1 (0.50 ns)    │ Cycle 3 (1.50 ns)│ Cycle 17 (8.50 ns)
```

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and address hashing results against GPU hardware principles:

1. **Address Hashing Bit Extraction Check**:
   * Address $A_0 = \text{0x10080} = 0001\_0000\_0000\_1000\_0000_2$.
   * Bits $[10:7] = 0001_2 = 1_{10} \implies$ L2 Slice 1. Correct!
   * Address $A_2 = \text{0x10880} = 0001\_0000\_1000\_1000\_0000_2$.
   * Bits $[10:7] = 0001_2 = 1_{10} \implies$ L2 Slice 1. Collision confirmed!
2. **Parallel Crossbar Throughput Verification**:
   * SM 0, SM 1, SM 3 routed to 3 different L2 slices (Slices 1, 2, 3) concurrently in 1 cycle.
   * Proves that the $80 \times 16$ crossbar executed 3 non-conflicting transfers in parallel on Cycle 0!
3. **Latency Sum Check**:
   * SM 0: 0 (grant) + 2 (xbar) + 12 (L2) + 2 (return) = 16 cycles ($8.00\text{ ns}$).
   * SM 2: 1 (stall) + 2 (xbar) + 12 (L2) + 2 (return) = 17 cycles ($8.50\text{ ns}$).
   * All hardware timing parameters match with $100\%$ precision.

All address bit extraction masks, crossbar port arbitration grants, L2 slice interleaving distributions, and memory throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **GPU Crossbar Interconnect**: A high-speed $M \times N$ switching matrix that connects $M$ requesting Streaming Multiprocessors to $N$ target L2 cache partitions, enabling up to $N$ non-conflicting memory request packets to be routed concurrently across physical crosspoints in a single clock cycle.
* **Partitioned L2 Cache**: The microarchitectural division of the shared L2 cache into $N$ independent physical SRAM slices linked to dedicated DRAM memory controllers, using low-order bit-swizzling or XOR address hashing ($\text{Slice\_ID} = A[10:7]$) to scatter consecutive memory blocks and prevent central interconnect bottlenecks.
