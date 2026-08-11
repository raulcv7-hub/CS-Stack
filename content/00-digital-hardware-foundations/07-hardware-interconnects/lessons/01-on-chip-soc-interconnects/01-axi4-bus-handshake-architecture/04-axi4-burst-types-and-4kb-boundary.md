content/00-digital-hardware-foundations/07-hardware-interconnects/lessons/01-on-chip-soc-interconnects/01-axi4-bus-handshake-architecture/04-axi4-burst-types-and-4kb-boundary.md
# AXI4 Burst Modes, Strobe Masking, and the 4KB Boundary Invariant

## The Address Bus Overhead Penalty and Unaligned Memory Crossing Hazard

In high-performance System-on-Chip (SoC) architectures, integrated circuits process massive amounts of binary data every second. Processing units—such as central processing unit (CPU) cores, graphics processing units (GPUs), and direct memory access (DMA) engines—frequently move large contiguous blocks of memory across on-chip interconnect wires. A GPU might fetch a $64\text{-byte}$ cache line representing a graphics texture, a DMA engine might stream a $4\text{-Kilobyte}$ network packet into main memory, or an audio processor might read a continuous stream of sound samples from a peripheral buffer.

In early on-chip bus architectures, if a processor core needed to transfer 16 words of data (64 bytes total), it executed the transfer by issuing 16 individual, isolated memory transactions. For every single 4-byte word, the processor placed an address on the bus, waited for the address handshake to complete, transmitted the data word, and then repeated the entire process for the next address.

This single-word transfer strategy introduces a severe microarchitectural bottleneck: **Address Channel Overhead Saturation**.

```text
SINGLE-WORD TRANSFER OVERHEAD WASTAGE

 Read 1: [ Address Phase (1 Cycle) ] ──► [ Data Phase (1 Cycle) ]
 Read 2: [ Address Phase (1 Cycle) ] ──► [ Data Phase (1 Cycle) ]
 Read 3: [ Address Phase (1 Cycle) ] ──► [ Data Phase (1 Cycle) ]
 Read 4: [ Address Phase (1 Cycle) ] ──► [ Data Phase (1 Cycle) ]
 (Spent 4 address cycles and 4 data cycles to move 16 bytes of data!)
```

To understand why issuing individual address requests for every word is so inefficient, we must look at the physical mechanics of bus interconnects:
* Transmitting a physical address across on-chip wires requires driving up to 64 address traces ($ADDR[63:0]$) and multiple control flags ($SIZE, BURST, ID, LOCK, PROT$), consuming substantial dynamic switching power ($P = C \cdot V^2 \cdot f$).
* Paying a full address handshake cycle ($VALID/READY$) for every single 4-byte word cuts the maximum possible data throughput of the interconnect in half!

To eliminate address overhead, modern interconnects use **Burst Transfers**. In a burst transfer, the master core transmits **a single starting address ONCE**, along with a burst length parameter ($LEN$). 

The interconnect and slave memory target then automatically calculate all subsequent sequential addresses in the background, streaming multiple data words back-to-back over consecutive clock cycles!

```text
BURST TRANSFER EFFICIENCY (AXI4 BURST MODE)

 AXI4 Burst: [ Single Address Phase (1 Cycle) ] ──► [ Data 1 ][ Data 2 ][ Data 3 ][ Data 4 ]
 (Paid address overhead ONCE for 4 consecutive data words!)
```

However, replacing single-word transfers with multi-word burst transfers introduces two profound physical hardware hazards:

1. **The Un-Aligned Byte-Masking Problem**: What happens when a processor wants to write a single 8-bit byte or 16-bit half-word to an un-aligned address over a wide 64-bit ($8\text{-byte}$) or 128-bit ($16\text{-byte}$) data bus? The wide data bus carries 8 or 16 bytes simultaneously. If the master drives the entire bus onto the memory cell array, it will overwrite and destroy the neighboring 7 or 15 bytes of data!
2. **The 4KB Boundary Crossing Hazard**: In System-on-Chip architectures, physical memory addresses are partitioned into $4\text{-Kilobyte}$ ($4,096\text{-byte}$) page regions assigned to different physical hardware devices (such as an SRAM block, an Ethernet controller, or a DRAM channel). 

What happens if a long 16-word burst transfer starts at address `0x0FF0` (near the upper boundary of a $4\text{-KB}$ page assigned to Slave A) and attempts to burst linearly without stopping?

```text
THE 4KB BOUNDARY CROSSING HAZARD

 Physical Memory Address Space
 ┌─────────────────────────────────────────┬─────────────────────────────────────────┐
 │ SLAVE A ADDRESS REGION (Page 0)         │ SLAVE B ADDRESS REGION (Page 1)         │
 │ Address Range: 0x0000_0000 - 0x0000_0FFF│ Address Range: 0x0000_1000 - 0x0000_1FFF│
 └────────────────────┬────────────────────┴────────────────────┬────────────────────┘
                      │                                         │
 Burst Starts at 0x0FF0 ──► [ Word 0 ][ Word 1 ] ... ──► CROSSES BOUNDARY! ──► [ Word 4 ]
 (Burst unexpectedly spills into Slave B's memory space without an address handshake!)
```

If the burst transfer is allowed to increment blindly past address `0x0FFF` into `0x1000`:
* The burst transfer crosses the $4\text{ KB}$ boundary and spills directly into **Slave B's physical address region**!
* But Slave B **never received an address request or handshake** on its address channel! Slave B has no idea a burst is arriving.
* Meanwhile, Slave A continues receiving data words that now belong to Slave B, overwriting its own internal memory!
* The interconnect crossbar matrix suffers a routing protocol failure, leading to corrupted data, slave response errors (`SLVERR` / `DECERR`), or un-recoverable hardware system deadlocks!

To prevent data corruption and guarantee interconnect protocol safety, modern SoC interconnects—such as the Advanced eXtensible Interface 4 (**AXI4**) specification—enforce three foundational primitives: **Specialized AXI4 Burst Modes (`INCR`, `WRAP`, `FIXED`)**, **Byte-Strobe Masking (`WSTRB`)**, and **The Inviolable 4KB Boundary Protection Rule**.

---

## The Freight Train and the County Line: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of burst types, byte-strobe masking, and $4\text{ KB}$ boundary protection before inspecting gate-level address calculation logic and timing matrices, let us consider an everyday analogy: **The Freight Train Delivery System**.

Imagine a long cargo train (**A Burst Transfer**) traveling along a railroad track (**The Data Bus $WDATA / RDATA$**) to deliver package boxes (**Data Words**) to various buildings along the track (**Slave Memory Targets**).

```text
THE FREIGHT TRAIN DELIVERY METAPHOR

 Locomotive Engine (Address Phase)          Cargo Cars (Data Transfers)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Single Locomotive Engine  │              │ Sequence of Cargo Cars    │
 │ Gives Directions Once     │              │ Delivers Packages         │
 └───────────────────────────┘              └───────────────────────────┘
   (Address Phase: AWADDR / ARLEN)            (Data Phase: WDATA / RDATA)
```

Sending a individual delivery truck for every single box takes too long and clogs the road. So instead, the logistics manager attaches 8 cargo cars behind **1 single locomotive engine**! The engine carries the destination directions (**The Address Phase**), and the attached cars carry the packages (**The Data Burst**).

Let us observe three different types of delivery operations required by the town, and the strict property boundary rule enforced by the county sheriff:

---

### Operation 1: The Three Types of Freight Trains (AXI4 Burst Modes)

Depending on the job, the train operates in one of three distinct delivery modes:

#### Mode 1: The Straight-Line Delivery Train (`INCR` — Incrementing Burst)
The train moves straight forward along the track, stopping at House #10, House #11, House #12, House #13, House #14, and so on.
* **Application**: Used when a program reads or writes a continuous, linear array of data stored side-by-side in memory.

#### Mode 2: The Circular Shelf Delivery Train (`WRAP` — Wrapping Burst)
Imagine a warehouse containing a circular storage shelf with 8 numbered slots (Slots #0 through #7).
A worker needs to fill the entire 8-slot shelf. However, the worker needs **Slot #5 FIRST** because a customer is standing there waiting for Item #5!

How does the `WRAP` train work?
1. The train delivers Item #5 first to Slot #5 (**Critical Word First**!).
2. The train continues forward to deliver Item #6 to Slot #6, and Item #7 to Slot #7.
3. Upon reaching the end of the 8-slot shelf, **the train wraps around to the beginning** and delivers Item #0 to Slot #0, Item #1 to Slot #1, Item #2 to Slot #2, Item #3 to Slot #3, and Item #4 to Slot #4!

```text
CIRCULAR SHELF WRAP DELIVERY (CRITICAL WORD FIRST)

 Start at Slot 5 ──► Deliver #5 ──► Deliver #6 ──► Deliver #7 ──┐
                                                                 │ WRAP AROUND!
 Deliver #4 ◄── Deliver #3 ◄── Deliver #2 ◄── Deliver #1 ◄── Deliver #0 ◄┘
 (All 8 slots filled starting from Slot 5, wrapping around cleanly!)
```

* **Application**: Used for **CPU Cache Line Fills**! When a CPU core suffers a cache miss on byte offset 20, it needs offset 20 *immediately* to un-stall its execution pipeline. The `WRAP` burst fetches the critical word first, and then wraps around to fetch the rest of the 64-byte line!

#### Mode 3: The Stationary Drop Window Train (`FIXED` — Fixed Address Burst)
The train stops at a single fixed warehouse window (Window #42) and unloads 8 packages sequentially into the exact same window one after another.
* **Application**: Used when streaming data into or out of a single peripheral hardware buffer, such as an audio speaker FIFO or a network packet FIFO!

---

### Operation 2: The Stencil Masking Template (Byte-Strobe Masking `WSTRB`)

Suppose a wide cargo car carries 8 large storage compartments side-by-side ($64\text{-bit}$ wide bus). The worker wants to drop a small package into **ONLY Compartment #3**, while leaving Compartments #0, #1, #2, #4, #5, #6, and #7 completely untouched.

How does the worker prevent the other 7 compartments from being overwritten?

The worker places a **Metal Stencil Template (`WSTRB` Mask)** over the cargo car!

```text
THE STENCIL MASK TEMPLATE (BYTE STROBE MASKING)

 Cargo Car (64-Bit Wide Data Bus):
 [ Comp 7 ][ Comp 6 ][ Comp 5 ][ Comp 4 ][ Comp 3 ][ Comp 2 ][ Comp 1 ][ Comp 0 ]
 ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 │ MASK=0  │ MASK=0  │ MASK=0  │ MASK=0  │ MASK=1  │ MASK=0  │ MASK=0  │ MASK=0  │
 └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
                                             │
                                             ▼ ONLY Compartment 3 is written!
```

* The stencil template has a hole open **ONLY over Compartment #3** (`WSTRB[3] = 1`).
* Compartments #0, #1, #2, #4, #5, #6, #7 are covered by solid metal (`WSTRB = 0`).
* When the cargo is dumped, only Compartment #3 receives data! The other 7 compartments remain completely protected.

---

### Operation 3: The County Line Boundary Fence ($4\text{ KB}$ Boundary Rule)

Now, consider the physical property boundary rule enforced by the county sheriff:

Town A (Owner of Page 0) and Town B (Owner of Page 1) are separated by a strict **County Line Fence at Mile Marker 4,096 ($4\text{ KB}$ Boundary)**.

```text
THE COUNTY LINE BOUNDARY FENCE (4KB BOUNDARY RULE)

 Town A Property (Page 0)                   Town B Property (Page 1)
 ┌─────────────────────────────────────────┬─────────────────────────────────────────┐
 │ Mile 0 .............. Mile 4,095        │ Mile 4,096 ............. Mile 8,191     │
 └─────────────────────────────────────────┴─────────────────────────────────────────┘
                                           ▲
                                           │ COUNTY LINE FENCE (4KB Boundary)
```

The Sheriff enforces an absolute rule:
> **The County Line Rule**: A cargo train authorized to deliver inside Town A is **STRICTLY FORBIDDEN from crossing the County Line Fence at Mile Marker 4,096 in a single continuous run!**

Why? Because Town B has its own customs gate, its own property taxes, and its own security guards. 

If a train starting at Mile Marker 4,090 tries to drive straight across the fence to Mile Marker 4,106 in one continuous run:
* Town B's guards will not be expecting the train.
* The train will crash through the fence, causing property damage and system-wide legal gridlock!

#### The Required Solution:
If a logistics delivery needs to cross from Mile Marker 4,090 to Mile Marker 4,106, the logistics manager **MUST SPLIT the delivery into TWO SEPARATE TRAIN RUNS**:
* **Train Run 1**: Delivers from Mile 4,090 to Mile 4,095 (stops right before the fence inside Town A).
* **Train Run 2**: Stops at Town B's Customs Gate, shows new papers, and delivers from Mile 4,096 to Mile 4,106 inside Town B.

This railroad system is the exact physical analogue of **AXI4 Burst Modes, Strobe Masking, and $4\text{ KB}$ Boundary Protection**:
* The cargo train is an **AXI4 Burst Transfer**.
* The locomotive engine is the **Address Phase (`AWADDR` / `ARADDR`)**.
* The individual cargo cars are **Data Transfers (`WDATA` / `RDATA`)**.
* `INCR`, `WRAP`, and `FIXED` trains are the **Three AXI4 Burst Modes**.
* The stencil template is the **Write Byte-Strobe Mask Vector (`WSTRB`)**.
* The County Line Fence at Mile 4,096 is the **$4\text{ KB}$ ($4,096\text{-byte}$) Physical Memory Boundary**.
* Splitting the train run at the fence is **Hardware $4\text{ KB}$ Boundary Burst Splitting**.

---

## Primitive 1: AXI4 Burst Modes and Byte-Strobe Masking

Now that we possess a clear intuitive mental model of cargo trains, stencil templates, and county line fences, let us examine the formal engineering mechanics of **AXI4 Burst Modes** and **Byte-Strobe Masking**.

In the AXI4 protocol, a master core initiates a burst transfer by transmitting a single starting address alongside four burst control parameters on the address channel (`AR` for reads, `AW` for writes):

$$\text{Address Channel Control Vector} = \left[\quad \text{AxADDR}, \quad \text{AxLEN}, \quad \text{AxSIZE}, \quad \text{AxBURST} \quad\right]$$

Where:
* $\text{AxADDR}$ is the starting physical byte address of the transfer (32-bit or 64-bit vector).
* $\text{AxLEN}$ is the 8-bit Burst Length code, specifying the exact number of data transfers in the burst:

$$\text{Number of Transfers } (N_{\text{transfers}}) = \text{AxLEN} + 1$$

An 8-bit $\text{AxLEN}$ value ($00000000_2 = 0$ to $11111111_2 = 255$) allows a single AXI4 burst to stream **1 to 256 data transfers** in a single transaction!

* $\text{AxSIZE}$ is the 3-bit Burst Size code, specifying the size of each individual data transfer in bytes:

$$\text{Bytes per Transfer } (N_{\text{bytes}}) = 2^{\text{AxSIZE}}$$

For example:
  * $\text{AxSIZE} = 3'b000 \implies 2^0 = \mathbf{1 \text{ Byte}}$
  * $\text{AxSIZE} = 3'b001 \implies 2^1 = \mathbf{2 \text{ Bytes }} (16\text{-bit Half-Word})$
  * $\text{AxSIZE} = 3'b010 \implies 2^2 = \mathbf{4 \text{ Bytes }} (32\text{-bit Word})$
  * $\text{AxSIZE} = 3'b011 \implies 2^3 = \mathbf{8 \text{ Bytes }} (64\text{-bit Double-Word})$

* $\text{AxBURST}$ is the 2-bit Burst Type code, selecting one of three mathematical address calculation modes.

---

### The Three AXI4 Burst Modes (`FIXED`, `INCR`, `WRAP`)

```text
AXI4 BURST MODES ADDRESS CALCULATION SUMMARY

 Mode 1: FIXED (AxBURST = 00)
 Addr_0 = AxADDR ──► Addr_1 = AxADDR ──► Addr_2 = AxADDR (Constant Address)

 Mode 2: INCR  (AxBURST = 01)
 Addr_0 = AxADDR ──► Addr_1 = Addr_0 + N_bytes ──► Addr_2 = Addr_1 + N_bytes

 Mode 3: WRAP  (AxBURST = 10)
 Addr_0 = AxADDR ──► Addr_1 = Addr_0 + N_bytes ──► (Wraps at Boundary!)
```

#### 1. `FIXED` Burst Mode ($\text{AxBURST} = 2'b00$)
* **Address Mechanics**: The target byte address remains **$100\%$ constant** for every transfer in the burst:

$$\text{Address}_k = \text{AxADDR} \quad (\forall k \in [0, \text{AxLEN}])$$

* **Primary Application**: Streaming data into or out of a single peripheral hardware FIFO register (e.g., an Ethernet network card transmit FIFO or an audio codec output buffer). Every write payload is pushed into the exact same memory-mapped register address.

#### 2. `INCR` (Incrementing) Burst Mode ($\text{AxBURST} = 2'b01$)
* **Address Mechanics**: The target byte address increments linearly after each transfer by the transfer size $N_{\text{bytes}}$:

$$\text{Address}_0 = \text{AxADDR}$$
$$\text{Address}_k = \text{Address}_{k-1} + 2^{\text{AxSIZE}} \quad (\text{for } k \ge 1)$$

* **Primary Application**: Sequential array processing, vector mathematics, buffer copies, and general system DRAM transfers.

#### 3. `WRAP` (Wrapping) Burst Mode ($\text{AxBURST} = 2'b10$)
* **Address Mechanics**: The target address increments linearly like an `INCR` burst. However, if the address reaches a higher **Wrap Boundary**, the address **wraps around** to the lower boundary of the memory block!

To calculate the wrap parameters:
The total byte capacity of a wrapping burst ($N_{\text{total\_bytes}}$) is:

$$N_{\text{total\_bytes}} = (\text{AxLEN} + 1) \times 2^{\text{AxSIZE}}$$

The lower **Wrap Boundary Address** ($\text{Addr}_{\text{wrap\_lower}}$) is calculated by aligning the starting address down to a multiple of $N_{\text{total\_bytes}}$:

$$\text{Addr}_{\text{wrap\_lower}} = \left\lfloor \frac{\text{AxADDR}}{N_{\text{total\_bytes}}} \right\rfloor \times N_{\text{total\_bytes}}$$

The upper **Wrap Boundary Address** ($\text{Addr}_{\text{wrap\_upper}}$) is:

$$\text{Addr}_{\text{wrap\_upper}} = \text{Addr}_{\text{wrap\_lower}} + N_{\text{total\_bytes}}$$

For any step $k$, if the incremented address reaches $\text{Addr}_{\text{wrap\_upper}}$, it wraps around to $\text{Addr}_{\text{wrap\_lower}}$:

$$\text{Address}_k = \begin{cases} \text{Address}_{k-1} + 2^{\text{AxSIZE}} & \text{if } \text{Address}_{k-1} + 2^{\text{AxSIZE}} < \text{Addr}_{\text{wrap\_upper}} \\ \text{Addr}_{\text{wrap\_lower}} & \text{if } \text{Address}_{k-1} + 2^{\text{AxSIZE}} == \text{Addr}_{\text{wrap\_upper}} \end{cases}$$

```text
AXI4 WRAP BURST ADDRESS SEQUENCE EXAMPLE

 Starting Addr = 0x1014 | AxLEN = 3 (4 Transfers) | AxSIZE = 2 (4 Bytes)
 Total Burst Bytes = 4 x 4 = 16 Bytes (0x10)
 Wrap Boundaries: Lower = 0x1010 | Upper = 0x1020

 Transfer 0 : 0x1014  (Critical Word First!)
 Transfer 1 : 0x1018  (Increments by 4)
 Transfer 2 : 0x101C  (Increments by 4 -> Reaches 0x1020 Upper Boundary!)
 Transfer 3 : 0x1010  (WRAPS AROUND to Lower Boundary 0x1010!)
```

* **Primary Application**: **Critical-Word-First CPU Cache Line Fills**! When a CPU pipeline suffers a cache miss on address `0x1014`, it requests `0x1014` first so execution can un-stall immediately, and the `WRAP` burst fetches the rest of the 16-byte cache line (`0x1018, 0x101C, 0x1010`) without writing outside the cache line's aligned block.

---

### Narrow Transfers and Byte-Strobe Masking (`WSTRB`)

On a modern System-on-Chip, the physical Write Data channel bus (`WDATA`) is wide—typically $64\text{ bits}$ ($8\text{ bytes}$), $128\text{ bits}$ ($16\text{ bytes}$), or $512\text{ bits}$ ($64\text{ bytes}$) wide.

What happens when a CPU core executes a store instruction writing a single 8-bit byte (`uint8_t`) or 16-bit half-word (`uint16_t`) to an address on a 64-bit data bus?

This operation is called a **Narrow Transfer** (a transfer where $N_{\text{bytes}} < W_{\text{bus\_bytes}}$).

If the master drives a 1-byte payload onto a 64-bit data bus and the slave writes all 64 bits into its memory cells, **the 7 un-written byte positions will overwrite and corrupt neighboring memory**!

To execute narrow transfers safely, AXI4 provides a dedicated mask vector on the Write Data channel: **The Write Byte-Strobe Mask (`WSTRB`)**.

```text
WRITE BYTE-STROBE MASKING (WSTRB) ON A 64-BIT DATA BUS

 WDATA[63:0] Bus Wires:
 [ Byte 7 ][ Byte 6 ][ Byte 5 ][ Byte 4 ][ Byte 3 ][ Byte 2 ][ Byte 1 ][ Byte 0 ]
 ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 │ WSTRB=0 │ WSTRB=0 │ WSTRB=0 │ WSTRB=0 │ WSTRB=1 │ WSTRB=0 │ WSTRB=0 │ WSTRB=0 │
 └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
                                             │
                                             ▼ ONLY Byte Lane 3 is written to SRAM!
```

#### How `WSTRB` Masking Operates:
The `WSTRB` vector contains **one mask bit for every 8-bit byte lane** on the `WDATA` bus:

$$\text{Width of } \text{WSTRB} = \frac{\text{Width of } \text{WDATA}}{8}$$

For a 64-bit data bus ($8\text{ bytes}$), `WSTRB` is an 8-bit vector (`WSTRB[7:0]`):
* $\text{WSTRB}[k] = 1 \implies$ Byte lane $k$ (`WDATA[8k+7 : 8k]`) contains valid data. The slave target **MUST write Byte $k$** into its memory cells.
* $\text{WSTRB}[k] = 0 \implies$ Byte lane $k$ contains invalid data. The slave target **MUST NOT modify Byte $k$** in its memory cells.

By setting `WSTRB = 8'b0000_1000`, a CPU core writes exactly Byte 3 over a 64-bit bus while preserving Bytes 0, 1, 2, 4, 5, 6, 7 with $100\%$ mathematical safety!

---

## Primitive 2: The 4KB Boundary Protection Rule

Now let us examine the second core primitive of this lesson: **The 4KB Boundary Protection Rule**.

In modern computer architectures, memory management units (MMUs) and interconnect address decoders partition physical memory into $4\text{-Kilobyte}$ ($4,096\text{-byte}$) page regions.

A $4\text{ KB}$ physical memory page is an aligned block of 4,096 bytes starting at an address whose lowest 12 bits are all zero (`12'b0000_0000_0000` = `0x000`).

In an SoC interconnect crossbar matrix, **slave devices are assigned address regions mapped in exact multiples of $4\text{ KB}$**:
* Slave Target A (Ethernet Controller) $\to$ Mapped to `0x0000_0000` through `0x0000_0FFF` (Page 0).
* Slave Target B (SRAM Block) $\to$ Mapped to `0x0000_1000` through `0x0000_1FFF` (Page 1).

```text
SLAVE ADDRESS MAPPING AT 4KB PAGE BOUNDARIES

 Address Range: 0x0000_0000 to 0x0000_0FFF ──► Mapped to SLAVE A (Page 0)
 ═════════════════════════════════════════════════════════════════════════ 4KB BOUNDARY (0x1000)
 Address Range: 0x0000_1000 to 0x0000_1FFF ──► Mapped to SLAVE B (Page 1)
```

---

### The Inviolable AXI4 4KB Boundary Rule

Because interconnect crossbar switches decode address routing using the upper page address bits ($\text{ADDR}[63:12]$), the AXI4 specification enforces an absolute, non-negotiable architectural invariant:

> **The 4KB Boundary Invariant**: A single AXI4 burst transaction MUST NOT cross a $4\text{ KB}$ ($4,096\text{-byte}$) physical address boundary.

$$\mathbf{\text{Addr}_{\text{start}} \quad \text{and} \quad \text{Addr}_{\text{end}} \quad \text{MUST reside within the EXACT SAME 4KB Page!}}$$

$$\left\lfloor \frac{\text{Addr}_{\text{start}}}{4096} \right\rfloor == \left\lfloor \frac{\text{Addr}_{\text{end}}}{4096} \right\rfloor$$

Where:
* $\text{Addr}_{\text{start}}$ is the starting byte address of the burst ($\text{AxADDR}$).
* $\text{Addr}_{\text{end}}$ is the byte address of the final transfer in the burst:

$$\text{Addr}_{\text{end}} = \text{AxADDR} + \left( (\text{AxLEN} + 1) \times 2^{\text{AxSIZE}} \right) - 1$$

---

### What Happens if a Burst Violates the 4KB Boundary?

Suppose a buggy DMA engine or master core attempts to issue an `INCR` burst starting at address $\text{AxADDR} = \text{0x0000\_0FC0}$ with $\text{AxLEN} = 15$ ($16\text{ transfers}$) and $\text{AxSIZE} = 3$ ($8\text{ bytes/transfer}$).

Let us calculate the total burst payload and ending address:

$$\text{Total Burst Bytes} = 16 \times 8\text{ bytes} = 128\text{ bytes}$$

$$\text{Addr}_{\text{end}} = \text{0x0000\_0FC0} + 128 - 1 = \text{0x0000\_103F}$$

Look at the starting and ending addresses:
* $\text{Addr}_{\text{start}} = \text{0x0000\_0FC0}$ (Sits inside **Page 0 / Slave A**).
* $\text{Addr}_{\text{end}} = \text{0x0000\_103F}$ (Sits inside **Page 1 / Slave B**)!

The burst starts at byte 4,032 inside Slave A, crosses the $4\text{ KB}$ boundary (`0x1000`), and attempts to write 64 bytes into Slave B!

```text
4KB BOUNDARY VIOLATION CATASTROPHE

 Trans 0..7  (Addrs 0x0FC0..0x0FFF) ──► Routed to Slave A (Page 0)
 Trans 8..15 (Addrs 0x1000..0x103F) ──► Crosses 4KB Boundary into Page 1!
                                        Crossbar routed AWADDR ONLY TO SLAVE A!
                                        Slave B NEVER received an AWADDR handshake!
                                        Slave A receives 64 bytes meant for Slave B!
```

Trace the catastrophic hardware breakdown:
1. During the address phase (`AW`), the crossbar matrix inspected `AWADDR = 0x0000_0FC0`. Since `0x0FC0` sits in Page 0, the crossbar routed the write address handshake **ONLY TO SLAVE A**.
2. Slave B received **zero address handshakes**! Slave B's write channel is idle.
3. As the master streams the 16 data transfers over the `W` channel, transfers 0 through 7 ($64\text{ bytes}$) write safely into Slave A.
4. On transfer 8, the address increments to `0x1000`. But the crossbar is STILL routing the `W` data channel to Slave A!
5. **Slave A receives 64 bytes of data meant for Slave B!** Slave A overwrites its own memory registers with corrupted data.
6. Slave B never receives its data. The master expects a single write response (`BRESP`), but Slave A returns an error (`SLVERR`), or the interconnect crossbar hangs permanently, waiting for a response from Slave B that was never initiated!

---

### Hardware 4KB Boundary Splitting Logic

To prevent $4\text{ KB}$ boundary violations, all master IP cores and DMA engines incorporate **Hardware 4KB Boundary Splitting Logic**.

Before issuing an `INCR` burst with starting address $A_{\text{start}}$, length $L_{\text{burst}} = \text{AxLEN} + 1$, and size $N_{\text{bytes}} = 2^{\text{AxSIZE}}$, the hardware calculates the **Maximum Bytes Allowed Before the Boundary**:

$$\text{Bytes\_To\_Boundary} = 4096 - (A_{\text{start}} \ \ \& \ \ 4095)$$

Where:
* $A_{\text{start}} \ \ \& \ \ 4095$ extracts the lowest 12 bits of the starting address (the offset within the $4\text{ KB}$ page).

The hardware compares total requested burst bytes against $\text{Bytes\_To\_Boundary}$:

$$\text{Total\_Requested\_Bytes} = L_{\text{burst}} \times N_{\text{bytes}}$$

If $\text{Total\_Requested\_Bytes} > \text{Bytes\_To\_Boundary}$, **the hardware MUST SPLIT the request into TWO SEPARATE AXI4 TRANSACTIONS**:

```text
HARDWARE 4KB BOUNDARY SPLITTING LOGIC

 Requested Burst: 128 Bytes starting at 0x0FC0 (Crosses 0x1000!)
                             │
                             ▼
 Calculate Bytes_To_Boundary = 4096 - (0x0FC0 & 4095) = 64 Bytes
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
 TRANSACTION 1 (Page 0)          TRANSACTION 2 (Page 1)
 Address : 0x0FC0                Address : 0x1000
 Length  : 64 Bytes (AxLEN = 7)  Length  : 64 Bytes (AxLEN = 7)
 Target  : SLAVE A               Target  : SLAVE B
 (Both transactions are 100% legal and isolated within 4KB page bounds!)
```

* **Transaction 1**: Starts at $A_{\text{start}} = \text{0x0FC0}$, length $= 64\text{ bytes}$ ($\text{AxLEN} = 7$). Finishes at address `0x0FFF` (the exact end of Page 0 / Slave A).
* **Transaction 2**: Starts at address $\text{0x1000}$ (the start of Page 1 / Slave B), length $= 64\text{ bytes}$ ($\text{AxLEN} = 7$). Finishes at address `0x103F`.

Both transactions are $100\%$ legal under AXI4 protocol rules. 

The crossbar matrix routes Transaction 1 cleanly to Slave A, and routes Transaction 2 cleanly to Slave B with a new address handshake. Zero data corruption occurs, and zero protocol errors are triggered!

---

## Real-World Silicon Engineering: Burst Alignment, FIFO Streaming, and Un-Aligned Accesses

In commercial System-on-Chip engineering, mastering AXI4 burst modes and strobe masking is critical for writing efficient hardware description code (Verilog/SystemVerilog) and designing high-throughput memory engines.

### 1. FIFO Streaming using `FIXED` Bursts

Consider a high-speed PCIe network interface card (NIC) streaming network packets into an SoC. 

The network card contains a single 32-bit hardware FIFO register mapped to memory address `0x4000_0000`.

To read 64 words ($256\text{ bytes}$) out of this single FIFO register:
* If the DMA engine used an `INCR` burst starting at `0x4000_0000`, the address would increment to `0x4000_0004, 0x4000_0008, ...`, reading un-mapped control registers and crashing the device!
* By using a **`FIXED` Burst (`ARBURST = 2'b00`, `ARLEN = 63`)**, the AXI4 address channel transmits `ARADDR = 0x4000_0000` once. 
* The address remains fixed at `0x4000_0000` for all 64 transfers, popping 64 consecutive words out of the FIFO buffer at full bus speed!

---

### 2. Critical-Word-First Cache Line Fills using `WRAP` Bursts

When a CPU core experiences an L1 Data Cache miss on byte address `0x201C` inside a $64\text{-byte}$ cache line spanning `0x2000` through `0x203F`:

If the cache controller used an `INCR` burst starting at `0x2000`:
* The memory controller would return bytes `0x2000..0x2007` first, `0x2008..0x200F` second, `0x2010..0x2017` third, and finally byte `0x201C` fourth!
* The CPU execution pipeline sits frozen for 4 clock cycles waiting for byte `0x201C`.

By using a **`WRAP` Burst (`ARADDR = 0x201C`, `ARLEN = 7`, `ARSIZE = 3`, `ARBURST = 2'b10`)**:
1. Transfer 0 returns byte `0x201C` **FIRST** (**Critical Word First!**). The CPU pipeline un-stalls immediately on Cycle 1!
2. Transfers 1 through 4 return `0x2020, 0x2028, 0x2030, 0x2038`.
3. Transfer 5 reaches the upper $64\text{-byte}$ boundary (`0x2040`) and **wraps around** to lower boundary `0x2000`!
4. Transfers 5, 6, 7 return `0x2000, 0x2008, 0x2010`.

```text
WRAP BURST CACHE LINE FILL TIMING ACCELERATION

 INCR Burst (Standard) : [ 0x2000 ][ 0x2008 ][ 0x2010 ][ 0x201C (CPU Un-stalls Here) ]
                         ◄──────── 4 Cycles Delay ────────►

 WRAP Burst (Optimal)  : [ 0x201C (CPU Un-stalls HERE!) ][ 0x2020 ][ 0x2028 ] ...
                         ◄── 1 Cycle ──►
 (CPU un-stalls 3 clock cycles earlier!)
```

The `WRAP` burst filled the entire 64-byte L1 cache line while un-stalling the CPU pipeline **3 clock cycles earlier**!

---

## Solved Industrial Engineering Exercise: Quantitative AXI4 Burst Address Calculations, WRAP Boundary Wrapping, and 4KB Boundary Splitting

To consolidate your complete mastery of AXI4 burst modes, `WRAP` boundary calculations, narrow transfer `WSTRB` masking, and $4\text{ KB}$ boundary split algorithms, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the DMA engine and interconnect crossbar of a $2.0\text{ GHz}$ 64-bit SoC processor ($T_{\text{clk}} = 0.50\text{ ns} = 500\text{ ps}$).

The SoC uses a 64-bit wide AXI4 data bus ($W_{\text{bus}} = 8\text{ bytes}$, $64\text{ bits}$).

```text
2.0 GHZ SOC AXI4 INTERCONNECT SUBSYSTEM

 DMA Engine Master ──► [ AXI4 Crossbar Matrix ] ──┬──► Slave A (Page 0: 0x0000..0x0FFF)
 Clock T = 500 ps      64-Bit Data Bus (8 Bytes)  └──► Slave B (Page 1: 0x1000..0x1FFF)
```

You are tasked with analyzing two distinct hardware transaction scenarios:

* **Scenario A (CPU Cache Line Fill WRAP Burst)**:
  A CPU core issues a Read `WRAP` burst to fill a 32-byte cache line after a miss on byte address $A_{\text{start}} = \text{0x0000\_1014}$.
  * Burst Parameters: `ARADDR = 0x0000_1014`, `ARLEN = 3` ($4\text{ transfers}$), `ARSIZE = 2` ($4\text{ bytes/transfer}$), `ARBURST = 2'b10` (`WRAP`).

* **Scenario B (DMA Linear Buffer Transfer Crossing 4KB Boundary)**:
  A DMA engine attempts to issue a single linear `INCR` write burst to transfer a $128\text{-byte}$ data buffer starting at physical address $A_{\text{start}} = \text{0x0000\_0FC0}$.
  * Desired Transfer Parameters: `AWADDR = 0x0000_0FC0`, `AWLEN = 15` ($16\text{ transfers}$), `AWSIZE = 3` ($8\text{ bytes/transfer}$), `AWBURST = 2'b01` (`INCR`).

#### Your Objective

1. For **Scenario A (`WRAP` Burst)**:
   * Calculate the total burst byte capacity $N_{\text{total\_bytes}}$, the lower wrap boundary address $\text{Addr}_{\text{wrap\_lower}}$, and the upper wrap boundary address $\text{Addr}_{\text{wrap\_upper}}$.
   * Derive the exact 4-step physical byte address sequence ($\text{Address}_0 \dots \text{Address}_3$) generated on the `ARADDR` bus.
2. For **Scenario B (4KB Boundary Crossing)**:
   * Calculate the ending address $\text{Addr}_{\text{end}}$ of the requested 128-byte burst and prove mathematically that it violates the $4\text{ KB}$ boundary rule at address `0x0000_1000`.
   * Calculate $\text{Bytes\_To\_Boundary}$ and determine how the hardware 4KB boundary splitting logic divides this request into **two legal AXI4 transactions** (Transaction 1 and Transaction 2), specifying `AWADDR`, `AWLEN`, and `AWSIZE` for both.
3. Calculate the total clock cycles and execution time required to complete both split transactions in Scenario B over the 64-bit AXI4 bus.
4. Verify mathematical, structural, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Scenario A (CPU Cache Line Fill `WRAP` Burst)

Given parameters: $A_{\text{start}} = \text{0x0000\_1014}$, $\text{ARLEN} = 3$ ($4\text{ transfers}$), $\text{ARSIZE} = 2$ ($2^2 = 4\text{ bytes/transfer}$).

##### 1. Calculate Total Burst Capacity ($N_{\text{total\_bytes}}$):
$$N_{\text{total\_bytes}} = (\text{ARLEN} + 1) \times 2^{\text{ARSIZE}} = (3 + 1) \times 4\text{ bytes} = 4 \times 4 = \mathbf{16 \text{ Bytes}}$$

##### 2. Calculate Lower Wrap Boundary Address ($\text{Addr}_{\text{wrap\_lower}}$):

$$\text{Addr}_{\text{wrap\_lower}} = \left\lfloor \frac{A_{\text{start}}}{N_{\text{total\_bytes}}} \right\rfloor \times N_{\text{total\_bytes}}$$

$$\text{Addr}_{\text{wrap\_lower}} = \left\lfloor \frac{\text{0x1014}}{16} \right\rfloor \times 16 = 257 \times 16 = 4112_{10} = \mathbf{\text{0x0000\_1010}}$$

##### 3. Calculate Upper Wrap Boundary Address ($\text{Addr}_{\text{wrap\_upper}}$):

$$\text{Addr}_{\text{wrap\_upper}} = \text{Addr}_{\text{wrap\_lower}} + N_{\text{total\_bytes}} = \text{0x1010} + 16 = \mathbf{\text{0x0000\_1020}}$$

##### 4. Derive the 4-Step Address Sequence ($\text{Address}_0 \dots \text{Address}_3$):
Each step increments the address by $N_{\text{bytes}} = 4\text{ bytes}$:

* **Transfer 0 ($k = 0$)**: $\text{Address}_0 = A_{\text{start}} = \mathbf{\text{0x0000\_1014}}$ (Critical Word returned FIRST!).
* **Transfer 1 ($k = 1$)**: $\text{Address}_1 = \text{0x1014} + 4 = \mathbf{\text{0x0000\_1018}}$.
* **Transfer 2 ($k = 2$)**: $\text{Address}_2 = \text{0x1018} + 4 = \mathbf{\text{0x0000\_101C}}$.
* **Transfer 3 ($k = 3$)**:
  * Incrementing $\text{0x101C} + 4 = \text{0x1020}$.
  * Since $\text{0x1020} == \text{Addr}_{\text{wrap\_upper}}$, **the address WRAPS AROUND to $\text{Addr}_{\text{wrap\_lower}}$**!
  * $\text{Address}_3 = \mathbf{\text{0x0000\_1010}}$.

```text
SCENARIO A WRAP BURST ADDRESS SEQUENCE

 Transfer 0 : Address 0x0000_1014  (Critical Word First!)
 Transfer 1 : Address 0x0000_1018
 Transfer 2 : Address 0x0000_101C  (Reaches Upper Boundary 0x1020!)
 Transfer 3 : Address 0x0000_1010  (WRAPS to Lower Boundary 0x1010!)
 (All 16 bytes fetched within aligned block 0x1010..0x101F!)
```

---

#### Step 2: Analyze Scenario B (DMA 4KB Boundary Crossing & Splitting)

Given parameters: $A_{\text{start}} = \text{0x0000\_0FC0}$, $\text{AWLEN} = 15$ ($16\text{ transfers}$), $\text{AWSIZE} = 3$ ($8\text{ bytes/transfer}$).

##### 1. Prove 4KB Boundary Violation:
Total burst bytes = $16 \times 8 = 128\text{ bytes}$.

$$\text{Addr}_{\text{end}} = A_{\text{start}} + \text{Total Bytes} - 1 = \text{0x0000\_0FC0} + 128 - 1 = \mathbf{\text{0x0000\_103F}}$$

Compare Page Numbers for start and end addresses ($4\text{ KB Page Number} = \lfloor \text{Addr} / 4096 \rfloor$):

$$\text{Page}(\text{Addr}_{\text{start}}) = \left\lfloor \frac{\text{0x0FC0}}{4096} \right\rfloor = 0 \quad (\text{Page 0 / Slave A})$$

$$\text{Page}(\text{Addr}_{\text{end}}) = \left\lfloor \frac{\text{0x103F}}{4096} \right\rfloor = 1 \quad (\text{Page 1 / Slave B})$$

Since $\text{Page}(\text{Addr}_{\text{start}}) \neq \text{Page}(\text{Addr}_{\text{end}})$, **the requested burst VIOLATES the 4KB boundary rule**!

---

##### 2. Calculate Hardware 4KB Boundary Splitting:
The hardware boundary splitting logic calculates $\text{Bytes\_To\_Boundary}$:

$$\text{Bytes\_To\_Boundary} = 4096 - (A_{\text{start}} \ \ \& \ \ 4095) = 4096 - (\text{0x0FC0} \ \ \& \ \ \text{0x0FFF})$$

$$\text{Bytes\_To\_Boundary} = 4096 - 4032_{10} = \mathbf{64 \text{ Bytes}}$$

The hardware splits the 128-byte request into **two separate 64-byte AXI4 transactions**:

##### Transaction 1 (Page 0 / Slave A Portion):
* Target Bytes = $64\text{ bytes}$.
* Number of Transfers = $\frac{64\text{ bytes}}{8\text{ bytes/transfer}} = 8\text{ transfers}$.
* **`AWADDR_1`** = $\mathbf{\text{0x0000\_0FC0}}$
* **`AWLEN_1`** = $8 - 1 = \mathbf{7}$ ($8\text{ transfers}$)
* **`AWSIZE_1`** = $\mathbf{3}$ ($8\text{ bytes/transfer}$)
* **`AWBURST_1`** = $\mathbf{2'b01}$ (`INCR`)
* Address Range: `0x0000_0FC0` to `0x0000_0FFF` ($100\%$ inside Page 0!).

##### Transaction 2 (Page 1 / Slave B Portion):
* Remaining Bytes = $128 - 64 = 64\text{ bytes}$.
* Number of Transfers = $\frac{64\text{ bytes}}{8\text{ bytes/transfer}} = 8\text{ transfers}$.
* **`AWADDR_2`** = $\mathbf{\text{0x0000\_1000}}$ (Starts exactly at the $4\text{ KB}$ boundary!)
* **`AWLEN_2`** = $8 - 1 = \mathbf{7}$ ($8\text{ transfers}$)
* **`AWSIZE_2`** = $\mathbf{3}$ ($8\text{ bytes/transfer}$)
* **`AWBURST_2`** = $\mathbf{2'b01}$ (`INCR`)
* Address Range: `0x0000_1000` to `0x0000_103F` ($100\%$ inside Page 1!).

```text
SCENARIO B SPLIT TRANSACTION PARAMETERS

 Transaction 1 (Target: Slave A / Page 0)
   AWADDR = 0x0000_0FC0 | AWLEN = 7 (8 Transfers x 8B = 64B) | AWBURST = INCR
   Spans Addrs: 0x0000_0FC0 to 0x0000_0FFF (Stops at 4KB boundary!)

 Transaction 2 (Target: Slave B / Page 1)
   AWADDR = 0x0000_1000 | AWLEN = 7 (8 Transfers x 8B = 64B) | AWBURST = INCR
   Spans Addrs: 0x0000_1000 to 0x0000_103F (Starts at 4KB boundary!)
```

---

#### Step 3: Calculate Total Completion Execution Time for Scenario B

Let us calculate the execution timing across the 64-bit AXI4 bus operating at $2.0\text{ GHz}$ ($T_{\text{clk}} = 0.50\text{ ns}$):

##### 1. Transaction 1 Execution Timing:
* Address Handshake Phase (`AW` channel): $1\text{ clock cycle}$ (Cycle 0).
* Data Payload Phase (`W` channel): 8 transfers streamed back-to-back = $8\text{ clock cycles}$ (Cycles 1 to 8).
* Write Response Phase (`B` channel): $1\text{ clock cycle}$ (Cycle 9).
* Transaction 1 completes at **Cycle 9 ($t = 4.50\text{ ns}$)**.

##### 2. Transaction 2 Execution Timing (Pipelined Overlap):
Because AXI4 features independent channels, the DMA engine can issue Transaction 2's write address on `AW` **while Transaction 1's data is still streaming on `W`**!

* `AWADDR_2` (`0x1000`) dispatched on `AW` channel at Cycle 1 ($t = 0.50\text{ ns}$).
* Transaction 2's data streaming begins on `W` channel immediately at Cycle 9 (after Transaction 1 finishes `WLAST`).
* 8 transfers streamed = $8\text{ clock cycles}$ (Cycles 9 to 16).
* Write Response Phase (`B` channel) for Transaction 2 completes at Cycle 17.

##### Total Pipelined Completion Time ($T_{\text{total}}$):

$$\text{Total Clock Cycles} = 1\text{ (Addr 1)} + 8\text{ (Data 1)} + 8\text{ (Data 2)} + 1\text{ (Resp 2)} = \mathbf{18 \text{ Clock Cycles}}$$

$$T_{\text{total}} = 18\text{ cycles} \times 0.50\text{ ns/cycle} = \mathbf{9.00 \text{ nanoseconds}}$$

##### Effective DMA Write Bandwidth ($\text{BW}_{\text{DMA}}$):
Total payload transferred = $128\text{ bytes}$.

$$\text{BW}_{\text{DMA}} = \frac{128\text{ Bytes}}{9.00 \times 10^{-9}\text{ s}} \approx \mathbf{14.222 \times 10^9 \text{ Bytes/sec}} = \mathbf{14.222 \text{ GB/sec}}$$

```text
PIPELINED 4KB SPLIT BURST TIMING CHRONOLOGY

 Cycle  0 : AW Channel ──► Dispatches AWADDR_1 (0x0FC0)
 Cycle  1 : AW Channel ──► Dispatches AWADDR_2 (0x1000) [PIPELINED!]
            W Channel  ──► Streams Data 1 (Transfers 0..7, Cycles 1..8)
 Cycle  9 : W Channel  ──► Streams Data 2 (Transfers 0..7, Cycles 9..16)
 Cycle 17 : B Channel  ──► Receives BRESP 2 -> TRANSACTION COMPLETE! (9.0 ns)
```

By splitting the $4\text{ KB}$ boundary crossing burst and pipelining the address dispatches, the DMA engine streamed all 128 bytes with $100\%$ protocol safety, achieving an effective transfer rate of **$14.222\text{ GB/sec}$**!

---

### Sanity Check and Verification

Let us verify our mathematical and hardware boundary calculations against AXI4 specification rules:

1. **WRAP Boundary Alignment Check**:
   * $\text{Addr}_{\text{wrap\_lower}} = \text{0x1010}$, $\text{Addr}_{\text{wrap\_upper}} = \text{0x1020}$.
   * Total bytes = $16\text{ bytes}$.
   * Sequence: `0x1014` $\to$ `0x1018` $\to$ `0x101C` $\to$ `0x1010`.
   * Every address in the sequence is $100\%$ within the range $[\text{0x1010}, \text{0x101F}]$. Boundary check verified!
2. **4KB Boundary Page Containment Check**:
   * Transaction 1 range: `0x0FC0` to `0x0FFF` ($\lfloor \text{Addr}/4096 \rfloor = 0 \implies \text{Page 0}$).
   * Transaction 2 range: `0x1000` to `0x103F` ($\lfloor \text{Addr}/4096 \rfloor = 1 \implies \text{Page 1}$).
   * Neither transaction crosses a $4\text{ KB}$ boundary internally. $100\%$ boundary rule compliance verified!
3. **Data Volume Conservation**:
   * Original request: $128\text{ bytes}$.
   * Transaction 1 ($64\text{ B}$) + Transaction 2 ($64\text{ B}$) = $128\text{ bytes}$. Zero data payload loss.

All wrap boundary formulas, 4KB page splitting calculations, byte address sequence traces, and pipelined execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **AXI4 Burst Modes (`INCR`/`WRAP`/`FIXED`)**: The three address calculation modes of AXI4 burst transfers, where `INCR` increments addresses linearly for streaming buffers, `FIXED` holds addresses constant for peripheral FIFOs, and `WRAP` wraps addresses within an aligned block to support Critical-Word-First CPU cache line fills.
* **4KB Boundary Protection**: The inviolable AXI4 hardware invariant requiring every burst transfer to remain strictly within a single $4\text{-Kilobyte}$ ($4,096\text{-byte}$) physical memory page, necessitating hardware boundary splitting logic to divide page-crossing requests into separate, isolated AXI4 transactions.
