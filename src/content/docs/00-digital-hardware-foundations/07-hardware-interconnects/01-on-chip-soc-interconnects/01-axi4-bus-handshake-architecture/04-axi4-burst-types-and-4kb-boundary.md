---
title: "AXI4 Burst Modes, Strobe Masking, and the 4KB Boundary Invariant"
---

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


## Real-World Silicon Engineering: Burst Alignment, FIFO Streaming, and Un-Aligned Accesses

In commercial System-on-Chip engineering, mastering AXI4 burst modes and strobe masking is critical for writing efficient hardware description code (Verilog/SystemVerilog) and designing high-throughput memory engines.

### 1. FIFO Streaming using `FIXED` Bursts

Consider a high-speed PCIe network interface card (NIC) streaming network packets into an SoC. 

The network card contains a single 32-bit hardware FIFO register mapped to memory address `0x4000_0000`.

To read 64 words ($256\text{ bytes}$) out of this single FIFO register:
* If the DMA engine used an `INCR` burst starting at `0x4000_0000`, the address would increment to `0x4000_0004, 0x4000_0008, ...`, reading un-mapped control registers and crashing the device!
* By using a **`FIXED` Burst (`ARBURST = 2'b00`, `ARLEN = 63`)**, the AXI4 address channel transmits `ARADDR = 0x4000_0000` once. 
* The address remains fixed at `0x4000_0000` for all 64 transfers, popping 64 consecutive words out of the FIFO buffer at full bus speed!


## Solved Industrial Engineering Exercise: Quantitative AXI4 Burst Address Calculations, WRAP Boundary Wrapping, and 4KB Boundary Splitting

To consolidate your complete mastery of AXI4 burst modes, `WRAP` boundary calculations, narrow transfer `WSTRB` masking, and $4\text{ KB}$ boundary split algorithms, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

