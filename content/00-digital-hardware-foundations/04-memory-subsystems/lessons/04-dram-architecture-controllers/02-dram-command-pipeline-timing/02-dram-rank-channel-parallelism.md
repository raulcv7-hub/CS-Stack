content/00-digital-hardware-foundations/04-memory-subsystems/lessons/04-dram-architecture-controllers/02-dram-command-pipeline-timing/02-dram-rank-channel-parallelism.md
# DRAM Rank and Channel Parallelism Mechanics

## The Single-Bank Bottleneck and the Parallelism Imperative

In high-speed digital computing architectures, main system Dynamic Random-Access Memory (DRAM) is tasked with delivering gigabytes of instruction and data payloads per second to CPU execution pipelines. However, an individual One-Transistor One-Capacitor (1T1C) DRAM row access is a slow, analog charge-redistribution process.

When a memory controller issues an `ACTIVATE` command to open a physical row of 1T1C cells inside a DRAM bank, the hardware must execute a multi-step physical sequence:
1. Raise the horizontal Word Line ($WL$) to open access transistors.
2. Allow microscopic femtofarad capacitors to dump charge onto long, capacitive vertical Bit Lines ($BL$).
3. Wait for differential sense amplifiers to sense tiny $\pm 50\text{-mV}$ voltage shifts and amplify them to full supply rails ($1.20\text{ V}$).
4. Latch the 8-Kilobyte row into the Row Buffer SRAM latches.
5. Re-charge the cell capacitors back to full voltage (**Active Restore Phase**).

This physical activation sequence requires a mandatory, un-bypassable time delay specified by the JEDEC memory standards: **The Row-to-Column Delay ($t_{\text{RCD}} \approx 14\text{ ns}$)**, which takes approximately **$44\text{ CPU clock cycles}$** on a $3.2\text{-GHz}$ processor.

Furthermore, if a subsequent memory access targets a different row in that same bank (**A Row Buffer Conflict**), the controller must first close the current row using a `PRECHARGE` command (**Row Precharge Time $t_{\text{RP}} \approx 14\text{ ns}$**), open the new row using `ACTIVATE` ($t_{\text{RCD}} \approx 14\text{ ns}$), and then issue the `READ` command (**CAS Latency $t_{\text{CL}} \approx 14\text{ ns}$**).

Total time required for a single-bank row conflict access = $t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} = 42\text{ nanoseconds}$ ($132\text{ CPU clock cycles}$).

```text
THE SINGLE-BANK SEQUENTIAL BOTTLENECK

 Req 1 (Row 10): [ PRE (14ns) ][ ACT (14ns) ][ READ (14ns) ] ──► 42 ns Total
 Req 2 (Row 20):                                             [ PRE (14ns) ][ ACT (14ns) ][ READ (14ns) ]
 (Single bank is LOCKED for 42 ns per access! All requests execute sequentially!)
```

Look at the physical bottleneck created by a single DRAM bank:
* During those 42 nanoseconds ($132\text{ CPU cycles}$), **the single DRAM bank is physically locked and busy!**
* If an 8-core CPU generates eight consecutive memory requests that target different rows in the *exact same* single DRAM bank, the requests cannot overlap. They must execute sequentially, one after another!
* Total latency for 8 requests = $8 \times 42\text{ ns} = \mathbf{336 \text{ nanoseconds}}$ ($1,075\text{ CPU clock cycles}$)!

Why should an 8-core processor sit idle for over 1,000 clock cycles waiting for a single DRAM bank to execute row activations sequentially, when we can build multiple independent memory structures operating concurrently in parallel?

To eliminate the single-bank bottleneck and hide long $t_{\text{RCD}}$ and $t_{\text{RP}}$ activation latencies, computer hardware architects divide the main memory system into a three-tiered parallel hierarchy: **Banks**, **Ranks**, and **Channels**.

By implementing **Bank-Level Parallelism (BLP)** and **Multi-Channel Address Interleaving**, the memory controller can issue an `ACTIVATE` command to Bank 0, and while Bank 0 is waiting 14 nanoseconds for its sense amplifiers to settle, the controller can immediately issue a second `ACTIVATE` command to Bank 1, a third to Bank 2, and a fourth to Bank 3!

While Banks 0, 1, 2, and 3 are opening their rows concurrently in the background, the memory bus data lines ($DQ$) operate at $100\%$ full capacity, transferring data back-to-back without a single clock cycle of idle stall time!

---

## The Multi-Checkout Supermarket: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of memory hierarchy parallelism, bank interleaving, and latency hiding before inspecting physical bus topologies and address mapping bit-swizzling schemes, let us consider an everyday analogy: **The Massive Supermarket Checkout Terminal**.

Imagine a giant supermarket filled with hungry customers (**CPU Memory Read Requests**) buying carts of groceries (**64-Byte Memory Lines**).

```text
THE SUPERMARKET CHECKOUT TERMINAL METAPHOR

 Customers (CPU Memory Requests)          Checkout Registers & Exit Doors
 ┌───────────────────────────┐            ┌───────────────────────────┐
 │ Carts of Groceries        │            │ Scanning Counter & Belt   │
 │ Need Fast Checkout        │            │ Scan Time: 30 Seconds     │
 └───────────────────────────┘            └───────────────────────────┘
   (Memory Read Demands)                    (DRAM Row Activation t_RCD)
```

To buy groceries, each customer must have their items scanned by a cashier at a checkout register (**DRAM Row Buffer / Sense Amplifiers**). Scanning a full cart of groceries takes **30 seconds** ($t_{\text{RCD}}$ activation delay).

Let us observe three different operational designs for this supermarket:

---

### Design 1: The Single Cashier Register (Single-Bank Bottleneck)

The supermarket installs only **one single cashier register** (**Single DRAM Bank**).
1. Customer 1 arrives at Register 0. The cashier begins scanning Customer 1's groceries. It takes **30 seconds** to scan the cart ($t_{\text{RCD}}$).
2. While Register 0 is scanning Customer 1, Customers 2, 3, 4, 5, 6, 7, and 8 must stand in a single line behind Customer 1 waiting for their turn!
3. Customer 8 waits **240 seconds (4 minutes)** just to reach the scanner!

```text
SINGLE CASHIER REGISTER (SINGLE-BANK BOTTLENECK)

 Customer 1 : [ 30-Second Item Scanning (Register 0) ] ──► Exits Store
 Customer 2 :                                          [ 30-Second Item Scanning ] ──► Exits
 Customer 3 :                                                                   [ 30s Scan ]
 (Customer 8 waits 4 full minutes in line because only 1 register exists!)
```

The supermarket's customer throughput is severely throttled by one cashier's physical scanning speed. The single register is $100\%$ saturated, while customers wait in a long line.

---

### Design 2: Multi-Register Parallelism (Bank-Level Parallelism - BLP)

The supermarket manager installs **8 parallel cashier registers** (**8 DRAM Banks**: Register 0 to Register 7) in the store. However, all 8 registers share a single exit door (**Shared Memory Data Bus $DQ$**).

Passing through the exit door takes only **2 seconds** per customer (**Column Read $t_{\text{CL}}$**).

Look at how the supermarket operates now:
1. Customer 1 goes to Register 0. Cashier 0 begins scanning ($30\text{s}$ scan time).
2. **SIMULTANEOUSLY AT THE EXACT SAME SECOND**:
   * Customer 2 goes to Register 1. Cashier 1 begins scanning ($30\text{s}$ scan time)!
   * Customer 3 goes to Register 2. Cashier 2 begins scanning ($30\text{s}$ scan time)!
   * Customer 4 goes to Register 3. Cashier 3 begins scanning...
3. All 8 cashiers are scanning groceries **in parallel at the exact same physical time**!
4. At $t = 30\text{ seconds}$, all 8 cashiers finish scanning simultaneously!
   * Customer 1 walks through the exit door (takes 2 seconds).
   * Customer 2 walks through the exit door (takes 2 seconds).
   * Customer 3 walks through the exit door...

```text
MULTI-REGISTER PARALLELISM (LATENCY HIDING VIA BLP)

 Register 0 : [ 30s Scan ] ──► Exit (2s)
 Register 1 : [ 30s Scan ] ──────► Exit (2s)
 Register 2 : [ 30s Scan ] ──────────► Exit (2s)
 Register 3 : [ 30s Scan ] ──────────────► Exit (2s)
 (All 8 30-second scanning delays happen IN PARALLEL! Exit door is used continuously!)
```

Look at what happened:
* The 30-second scanning delays for Customers 1 through 8 happened **simultaneously in parallel**!
* The exit door was used continuously without pausing. Customer 8 exited the store in **44 seconds** instead of 240 seconds ($5.5\times$ faster throughput!).
* The 30-second scanning delay was **completely hidden** behind bank-level parallelism!

---

### Design 3: Multi-Building Independent Outlets (Multi-Channel Memory)

What if 100 customers arrive at once? 8 registers share 1 single exit door, so the exit door becomes a bottleneck.

To scale further, the supermarket company builds **two completely separate building outlets** (**Dual-Channel Memory System**):
* **Building Outlet A (Channel 0)**: Has its own 8 registers and its own dedicated exit road.
* **Building Outlet B (Channel 1)**: Has its own 8 registers and its own dedicated exit road.

```text
DUAL-BUILDING INDEPENDENT OUTLETS (DUAL-CHANNEL)

 Building Outlet A (Channel 0) ──► 8 Registers ──► Exit Road A (64-Bit Bus A)
 Building Outlet B (Channel 1) ──► 8 Registers ──► Exit Road B (64-Bit Bus B)
 (Two customers leave the property at the EXACT SAME SECOND on separate roads!)
```

Now, two customers can leave the property at the **exact same physical second** on separate exit roads without any traffic interference! Memory bandwidth is doubled!

This multi-building supermarket is the exact physical analogue of **DRAM Rank and Channel Parallelism**:
* Grocery carts are **64-Byte CPU Memory Requests**.
* The 30-second item scan is the **Row Activation Delay ($t_{\text{RCD}}$)**.
* The 8 cashier registers are **8 Independent DRAM Banks**.
* Passing through the exit door in 2 seconds is the **Column Read ($t_{\text{CL}}$)**.
* Hiding the 30-second scan time across registers is **Bank-Level Parallelism (BLP)**.
* Two separate building outlets with separate exit roads are **Dual-Channel Memory Controllers**.

---

## Primitive 1: The Three-Tier Memory Hierarchy (Banks, Ranks, Channels)

Now that we possess a clear intuitive mental model of multi-register supermarkets and independent exit roads, let us examine the formal engineering architecture of the **Three-Tier DRAM Parallelism Hierarchy**: **Banks**, **Ranks**, and **Channels**.

A modern memory subsystem is organized into three distinct tiers of physical parallelism:

```text
THREE-TIER MEMORY HIERARCHY ARCHITECTURE

                     [ Memory Controller ]
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
 [ Channel 0 (Bus A: 64b) ]                 [ Channel 1 (Bus B: 64b) ]
         │                                           │
   ┌─────┴─────┐                               ┌─────┴─────┐
   ▼           ▼                               ▼           ▼
[ Rank 0 ]  [ Rank 1 ]                      [ Rank 0 ]  [ Rank 1 ]
   │           │                               │           │
 ┌─┴─┐       ┌─┴─┐                           ┌─┴─┐       ┌─┴─┐
 ▼   ▼       ▼   ▼                           ▼   ▼       ▼   ▼
Bank0..15   Bank0..15                       Bank0..15   Bank0..15
```

Let us dissect the physical structure, hardware independence, and performance role of each tier from top to bottom:

---

### Tier 1: Memory Channels (Highest Independence)

A **Memory Channel** is an entirely independent physical memory interface managed by its own dedicated hardware Memory Controller.

* **Physical Structure**: A channel includes its own 64-bit data bus ($DQ_0 \dots DQ_{63}$), its own Command/Address bus lines ($\overline{RAS}, \overline{CAS}, \overline{WE}, A_0 \dots A_{17}$), and its own clock tree lines ($CK / \overline{CK}$).
* **Degree of Independence**: **$100\%$ Complete Parallel Independence**.
  * Channel 0 and Channel 1 share **zero physical wires**.
  * Channel 0 can be executing an $8\text{-byte}$ write transaction while Channel 1 is executing an $8\text{-byte}$ read transaction at the exact same physical nanosecond!
* **Bandwidth Scaling**: Adding a second memory channel doubles the total theoretical memory bus bandwidth:

$$\text{BW}_{\text{total}} = N_{\text{channels}} \times \text{BW}_{\text{channel}}$$

Where:
* $\text{BW}_{\text{total}}$ is the total system peak memory bandwidth in Bytes per second.
* $N_{\text{channels}}$ is the number of independent physical memory channels.
* $\text{BW}_{\text{channel}}$ is the peak memory bandwidth of a single channel.

* **Usage**: Server platforms feature 4-channel, 8-channel, or 12-channel memory architectures (e.g., AMD EPYC and Intel Xeon Scalable processors).

---

### Tier 2: Memory Ranks (Shared Bus Sub-Systems)

A **Memory Rank** is a physical collection of individual DRAM memory chips wired together on a Dual Inline Memory Module (DIMM) board to share a single 64-bit memory channel bus.

* **Physical Structure**: A standard $64\text{-bit}$ memory bus channel connects to a DIMM module. Since an individual DRAM chip might be only 8 bits wide ($x8$ chip) or 16 bits wide ($x16$ chip), eight $x8$ DRAM chips are wired side-by-side in parallel to form a single **$64\text{-bit}$ Rank**.
* **Multi-Rank DIMMs**: A single physical DIMM card can contain 1, 2, or 4 Ranks (Single-Rank / 1R, Dual-Rank / 2R, Quad-Rank / 4R):
  * **Rank 0**: The first group of eight $x8$ chips sharing the bus.
  * **Rank 1**: The second group of eight $x8$ chips sharing the exact same physical bus wires!

```text
DUAL-RANK DIMM BOARD LAYOUT (SHARED 64-BIT BUS)

 Shared Command / Address Bus & Data Bus DQ[63:0]
 ═══════════╤═══════════════════════════════╤════════════════════════════
            │ Chip Select CS0_n             │ Chip Select CS1_n
            ▼                               ▼
 ┌─────────────────────────┐     ┌─────────────────────────┐
 │ RANK 0 (8x x8 DRAM Chips)│     │ RANK 1 (8x x8 DRAM Chips)│
 │ [C0][C1][C2]...[C7]     │     │ [C0][C1][C2]...[C7]     │
 └─────────────────────────┘     └─────────────────────────┘
  (Rank 0 and Rank 1 share the data bus wires DQ; active Rank selected by CS_n!)
```

#### Degree of Independence & Rank Switching Overhead:
Ranks on the same channel share the physical $DQ$ data bus wires. Therefore, Rank 0 and Rank 1 **cannot transmit data simultaneously**. 

However, Ranks provide **Inter-Rank Command Parallelism**:
* While Rank 0 is transferring data over the $DQ$ bus, the memory controller can issue an `ACTIVATE` command to Rank 1 in the background!
* **Rank Switching Overhead ($t_{\text{WTR}} / t_{\text{RTR}}$)**: When the memory controller stops reading Rank 0 and begins reading Rank 1 on the same channel, output transistor drivers on Rank 0 chips must turn OFF before Rank 1 drivers turn ON. 

The controller MUST insert **2 to 4 dead clock cycles ($t_{\text{WTR}}$ Rank Bus Turnaround Delay)** to prevent electrical driver short-circuit contention on the $DQ$ pins!

---

### Tier 3: Memory Banks and Bank Groups (Sub-Array Level Parallelism - BLP)

A **Memory Bank** is an individual 2D matrix storage array sitting inside a single DRAM chip, equipped with its own dedicated Row Buffer and Sense Amplifier array.

* **Physical Structure**: A single $16\text{-Gb}$ DRAM chip contains **16 or 32 independent Banks** (e.g., Bank 0 through Bank 15).
* **Bank Groups (DDR4 and DDR5)**: To increase internal transfer speeds without increasing package pin counts, DDR4 and DDR5 organize banks into **Bank Groups** (e.g., 4 Bank Groups containing 4 Banks each):
  * Accessing different banks within the **SAME Bank Group** requires a longer column-to-column delay: $t_{\text{CCD\_L}} \approx 6\text{ bus cycles}$.
  * Accessing banks in **DIFFERENT Bank Groups** requires a shorter column-to-column delay: $t_{\text{CCD\_S}} \approx 4\text{ bus cycles}$!

```text
BANK-LEVEL PARALLELISM (BLP) IN A 16-BANK DRAM CHIP

 DRAM Chip Die
 ┌─────────────────────────────────────────────────────────────────┐
 │ Bank 0 Row Buffer: Holds Row 100 Open  (Active / Ready)         │
 │ Bank 1 Row Buffer: Holds Row 200 Open  (Active / Ready)         │
 │ Bank 2 Row Buffer: Executing PRECHARGE (Closing Row 50...)       │
 │ Bank 3 Row Buffer: Executing ACTIVATE  (Opening Row 300...)     │
 ├─────────────────────────────────────────────────────────────────┤
 │ Shared Data Bus Output Buffer (DQ Driver)                        │
 └──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
                     Shared Memory Bus DQ[63:0]
```

#### The Power of Bank-Level Parallelism (BLP):
Bank-Level Parallelism allows the memory controller to **overlap $t_{\text{RCD}}$ (Row Activate) and $t_{\text{RP}}$ (Row Precharge) delays across multiple banks**:
1. Cycle 0: Memory controller issues `ACTIVATE Bank 0, Row 100` ($t_{\text{RCD}}$ timer starts on Bank 0).
2. Cycle 2: Memory controller issues `ACTIVATE Bank 1, Row 200` ($t_{\text{RCD}}$ timer starts on Bank 1).
3. Cycle 4: Memory controller issues `ACTIVATE Bank 2, Row 300` ($t_{\text{RCD}}$ timer starts on Bank 2).
4. Cycle 14: Bank 0's $t_{\text{RCD}}$ timer expires! Controller issues `READ Bank 0, Col 0`. Data transmitted on $DQ$ bus!
5. Cycle 18: Bank 1's $t_{\text{RCD}}$ timer expires! Controller issues `READ Bank 1, Col 0`. Data transmitted on $DQ$ bus!

Look at the result: **Four slow $14\text{-ns}$ row activations executed concurrently in the background!** 

The memory data bus ($DQ$) ran at $100\%$ full bandwidth without a single stall cycle!

---

## Primitive 2: Address Interleaving Mapping Schemes

How does the Memory Controller convert a flat 64-bit physical memory address emitted by the CPU (`0x0000_0000_1000_0040`) into specific Channel, Rank, Bank, Row, and Column coordinates?

$$\text{CPU Physical Address [63:0]} \xrightarrow{\quad \text{Address Interleaving Mapper} \quad} \left\{ \text{Channel, Rank, Bank Group, Bank, Row, Column} \right\}$$

The choice of **which address bits map to which memory hierarchy levels** determines whether a program achieves $100\%$ Bank-Level Parallelism or suffers catastrophic memory bus stalls.

Let us compare two fundamental address mapping schemes: **Row-Interleaved (High-Order Mapping)** versus **Bank/Channel-Interleaved (Low-Order Bit-Swizzling)**.

---

### Scheme 1: Row-Interleaved Mapping (High-Order Mapping — POOR PERFORMANCE)

In **Row-Interleaved Mapping**, high-order address bits are assigned to Channel, Rank, and Bank selection, while low-order address bits are assigned to Column and Row addresses:

```text
ROW-INTERLEAVED ADDRESS BIT MAPPING (HIGH-ORDER MAPPING)

 Bit 63                             Bit 28 Bit 27  Bit 24 Bit 23    Bit 6 Bit 5  Bit 0
 ┌────────────────────────────────────────┬──────┬───────┬──────────────┬───────────┐
 │ Channel Select                         │ Rank │ Bank  │ Row Address  │ Col / Off │
 └────────────────────────────────────────┴──────┴───────┴──────────────┴───────────┘
```

#### Why Row-Interleaved Mapping Causes Performance Catastrophes:
Consider a program sequentially reading a large $1\text{-Megabyte}$ array (`array[0]` through `array[262144]`):
1. Element 0 (Address `0x000000`): Maps to **Channel 0, Rank 0, Bank 0, Row 0**.
2. Element 1 (Address `0x000040`): Maps to **Channel 0, Rank 0, Bank 0, Row 0** (Column 1).
3. Element 128 (Address `0x002000`): Maps to **Channel 0, Rank 0, Bank 0, Row 1**!

Look at what happens during streaming array processing under High-Order Mapping:
* All 262,144 elements of the array land inside **Channel 0, Rank 0, Bank 0**!
* Channels 1, 2, 3 sit **$100\%$ COMPLETELY IDLE and WASTED**!
* Ranks 1, 2, 3 sit **$100\%$ COMPLETELY IDLE**!
* Banks 1 through 15 sit **$100\%$ COMPLETELY IDLE**!

The entire 1-Megabyte array processing workload is dumped onto **1 single DRAM bank**, causing continuous Row Buffer Conflicts and zero parallelism!

---

### Scheme 2: Bank/Channel-Interleaved Mapping (Low-Order Bit-Swizzling — OPTIMAL PERFORMANCE)

In **Bank/Channel-Interleaved Mapping**, low-order address bits (immediately above the 64-byte cache line offset bits $[5:0]$) are assigned to **Channel and Bank selection**:

```text
LOW-ORDER BANK/CHANNEL INTERLEAVED ADDRESS BIT MAPPING

 Bit 63                                    Bit 18 Bit 17  Bit 14 Bit 13  Bit 12 Bit 11 Bit 6 Bit 5 Bit 0
 ┌───────────────────────────────────────────────┬──────┬───────┬──────┬───────┬──────┬──────┐
 │ Row Address (Upper Bits)                      │ Rank │ Bank  │ Row  │Channel│ Col  │ Offset│
 └───────────────────────────────────────────────┴──────┴───────┴──────┴───────┴──────┴──────┘
                                                        ▲              ▲
                                                        │              └── Low Bits [7:6] Select Channel!
                                                        └───────────────── Low Bits [11:8] Select Bank!
```

Let us trace where consecutive 64-byte cache lines land under Low-Order Interleaved Mapping:
* **Cache Line 0** (Address `0x0000`): Channel Bits $= 00_2$, Bank Bits $= 0000_2 \implies \mathbf{\text{Channel 0, Bank 0}}$.
* **Cache Line 1** (Address `0x0040`): Channel Bits $= 01_2$, Bank Bits $= 0000_2 \implies \mathbf{\text{Channel 1, Bank 0}}$.
* **Cache Line 2** (Address `0x0080`): Channel Bits $= 10_2$, Bank Bits $= 0000_2 \implies \mathbf{\text{Channel 2, Bank 0}}$.
* **Cache Line 3** (Address `0x00C0`): Channel Bits $= 11_2$, Bank Bits $= 0000_2 \implies \mathbf{\text{Channel 3, Bank 0}}$.
* **Cache Line 4** (Address `0x0100`): Channel Bits $= 00_2$, Bank Bits $= 0001_2 \implies \mathbf{\text{Channel 0, Bank 1}}$.
* **Cache Line 5** (Address `0x0140`): Channel Bits $= 01_2$, Bank Bits $= 0001_2 \implies \mathbf{\text{Channel 1, Bank 1}}$.

```text
LOW-ORDER INTERLEAVING DISTRIBUTES STREAMING LINES

 Cache Line 0 (0x000) ──► Channel 0, Bank 0
 Cache Line 1 (0x040) ──► Channel 1, Bank 0  (Parallel Channel!)
 Cache Line 2 (0x080) ──► Channel 2, Bank 0  (Parallel Channel!)
 Cache Line 3 (0x0C0) ──► Channel 3, Bank 0  (Parallel Channel!)
 Cache Line 4 (0x100) ──► Channel 0, Bank 1  (Parallel Bank!)
 (Streaming memory reads automatically spread across ALL channels and banks!)
```

Look at the extraordinary hardware optimization achieved by Low-Order Bit-Swizzling:
* As a program streams sequentially through memory, **consecutive 64-byte cache lines are automatically scattered across all physical channels and all physical banks in rotating sequence**!
* All 4 memory channels transmit data in parallel ($4\times$ memory bus bandwidth!).
* All 16 DRAM banks execute row activations ($t_{\text{RCD}}$) concurrently in the background!
* Memory access stalls drop to near zero!

---

## Memory Channel Bandwidth Scaling Equations

To quantify the performance of multi-channel memory systems, computer architects calculate **Peak Theoretical Memory Bandwidth ($\text{BW}_{\text{peak}}$)** and **Effective Memory Bandwidth ($\text{BW}_{\text{effective}}$)**.

### Peak Theoretical Memory Bandwidth Formula

For a memory subsystem containing $N_{\text{channels}}$ independent physical memory channels operating with Double Data Rate (DDR) signaling:

$$\text{BW}_{\text{peak}} = N_{\text{channels}} \times f_{\text{bus}} \times W_{\text{bus\_bytes}} \times 2$$

Where:
* $\text{BW}_{\text{peak}}$ is the peak theoretical memory bandwidth in Bytes per second ($\text{B/s}$ or $\text{GB/s}$).
* $N_{\text{channels}}$ is the number of independent physical memory channels (e.g., $1, 2, 4, 8, 12$).
* $f_{\text{bus}}$ is the physical memory bus clock frequency in Hertz ($\text{Hz}$).
* $W_{\text{bus\_bytes}}$ is the physical width of the data bus per channel in bytes (typically $8\text{ bytes} = 64\text{ bits}$).
* $2$ is the DDR multiplier (data transferred on both rising and falling clock edges).

```text
MEMORY BANDWIDTH SCALING WITH CHANNEL COUNT

 Architecture Configuration │ Bus Frequency │ Bus Width / Ch │ Peak Bandwidth
────────────────────────────┼───────────────┼────────────────┼─────────────────
 Single-Channel DDR4-3200   │ 1,600 MHz     │ 8 Bytes (64b)  │ 25.6 GB/sec
 Dual-Channel DDR4-3200     │ 1,600 MHz     │ 8 Bytes (64b)  │ 51.2 GB/sec (2x)
 Quad-Channel DDR4-3200     │ 1,600 MHz     │ 8 Bytes (64b)  │ 102.4 GB/sec (4x)
 8-Channel DDR5-4800 (Server)│ 2,400 MHz    │ 8 Bytes (64b)  │ 307.2 GB/sec (12x!)
```

#### Example Calculation (Dual-Channel DDR4-3200):
For a Dual-Channel ($N_{\text{channels}} = 2$) DDR4-3200 system ($f_{\text{bus}} = 1,600\text{ MHz} = 1.6 \times 10^9\text{ Hz}$):

$$\text{BW}_{\text{peak}} = 2 \times (1.6 \times 10^9\text{ Hz}) \times 8\text{ bytes} \times 2 = \mathbf{51.2 \times 10^9 \text{ Bytes/sec}} = \mathbf{51.2 \text{ GB/sec}}$$

Adding a second memory channel doubles total memory bandwidth from $25.6\text{ GB/sec}$ to **$51.2\text{ GB/sec}$**!

---

### Effective Memory Bandwidth and Bank Efficiency ($\eta_{\text{BLP}}$)

In physical silicon, a memory system cannot achieve $100\%$ of its peak theoretical bandwidth because of timing parameter delays ($t_{\text{RCD}}, t_{\text{RP}}, t_{\text{WTR}}$), refresh stalls ($t_{\text{RFC}}$), and row buffer conflicts.

We express **Effective Memory Bandwidth ($\text{BW}_{\text{effective}}$)** as:

$$\mathbf{\text{BW}_{\text{effective}} = \text{BW}_{\text{peak}} \times \eta_{\text{BLP}} \times (1 - \text{Overhead}_{\text{REF}})}$$

Where:
* $\text{BW}_{\text{effective}}$ is the actual usable data throughput in GB/sec.
* $\text{BW}_{\text{peak}}$ is the peak theoretical memory bandwidth.
* $\eta_{\text{BLP}}$ is the **Bank-Level Parallelism Efficiency Factor** ($0.0 \le \eta_{\text{BLP}} \le 1.0$), determined by how effectively address interleaving hides $t_{\text{RCD}}$ activation latencies across banks.
* $\text{Overhead}_{\text{REF}}$ is the background refresh loss fraction ($\approx 0.045 \text{ to } 0.090$).

#### Impact of Address Interleaving on $\eta_{\text{BLP}}$:
* **Under High-Order Row-Interleaved Mapping (Single Bank Thrashing)**:
  $\eta_{\text{BLP}} \approx 0.25$ ($25\%$ efficiency!). Effective Bandwidth drops to $12.8\text{ GB/sec}$.
* **Under Low-Order Bank-Interleaved Mapping (Optimal Parallelism)**:
  $\eta_{\text{BLP}} \approx 0.92$ ($92\%$ efficiency!). Effective Bandwidth reaches **$47.1\text{ GB/sec}$**!

---

## Solved Industrial Engineering Exercise: Quantitative Bank-Level Parallelism, Channel Interleaving, and Throughput Analysis

To consolidate your complete mastery of three-tier memory hierarchy architectures, Bank-Level Parallelism ($BLP$), low-order address interleaving, rank switching turnaround delays ($t_{\text{WTR}}$), and multi-channel bandwidth scaling, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal memory subsystem architect designing the memory controller for a $3.2\text{ GHz}$ 8-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a streaming scientific simulation algorithm that reads **$64\text{ consecutive 64-byte cache lines}$** ($4,096\text{ bytes}$ total data payload) in a high-speed loop.

```text
3.2 GHz 8-CORE SERVER PROCESSOR WITH MULTI-CHANNEL MEMORY

 CPU Core (3.2 GHz) ──► [ Memory Controller ] ──┬──► Channel 0 (64-Bit Bus)
 Clock T = 312.5 ps     DDR4-3200 @ 1600 MHz    └──► Channel 1 (64-Bit Bus)
```

#### Memory System Architectural Specifications:
* Memory Technology: DDR4-3200 ($f_{\text{bus}} = 1,600\text{ MHz}$, $T_{\text{bus}} = 0.625\text{ ns}$).
* Data Bus Width per Channel: $64\text{ bits}$ ($8\text{ bytes}$).
* 64-Byte Cache Line Burst Transfer Time: $4\text{ bus cycles} = 2.50\text{ ns}$ ($8\text{ CPU clock cycles}$).
* Memory Timing Parameters:
  * $t_{\text{RCD}}$ (Row Activation Delay) = $14\text{ bus cycles} = 8.75\text{ ns}$ ($28\text{ CPU clock cycles}$).
  * $t_{\text{CL}}$ (CAS Read Latency) = $14\text{ bus cycles} = 8.75\text{ ns}$ ($28\text{ CPU clock cycles}$).
  * $t_{\text{RP}}$ (Row Precharge Delay) = $14\text{ bus cycles} = 8.75\text{ ns}$ ($28\text{ CPU clock cycles}$).
  * $t_{\text{WTR}}$ (Rank Bus Turnaround Delay) = $4\text{ bus cycles} = 2.50\text{ ns}$ ($8\text{ CPU clock cycles}$).

#### System Architectures to Compare:

* **System 0 (Single-Channel, Single-Bank Mapping — Un-Interleaved)**:
  * All 64 cache lines land in **Channel 0, Bank 0** across different rows.
  * Every line access incurs a Row Buffer Conflict ($t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$).
* **System 1 (Single-Channel, 8-Bank Low-Order Interleaved)**:
  * Single 64-bit Channel 0.
  * Low-order address bits scatter the 64 cache lines sequentially across **8 independent Banks** (Bank 0 through Bank 7) in rotating order.
* **System 2 (Dual-Channel, 8-Bank Low-Order Interleaved)**:
  * Two independent 64-bit channels (Channel 0 and Channel 1).
  * Low-order address bits scatter the 64 cache lines across **2 Channels and 8 Banks**.

#### Your Objective

1. Calculate the total completion time $T_{\text{exec}}$ (in nanoseconds and CPU clock cycles) and effective memory bandwidth $\text{BW}_{\text{effective}}$ (in GB/sec) for **System 0 (Single-Bank Un-Interleaved)**.
2. Calculate total completion time $T_{\text{exec}}$ and effective memory bandwidth $\text{BW}_{\text{effective}}$ for **System 1 (8-Bank Parallelism, Single Channel)**. Demonstrate how $t_{\text{RCD}}$ activation delays are hidden across parallel banks.
3. Calculate total completion time $T_{\text{exec}}$ and effective memory bandwidth $\text{BW}_{\text{effective}}$ for **System 2 (Dual-Channel, 8-Bank Parallelism)**.
4. Calculate the overall **Performance Speedup Factors**: System 1 vs. System 0, and System 2 vs. System 0.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze System 0 (Single-Channel, Single-Bank Un-Interleaved)

In System 0, all 64 cache lines land in Channel 0, Bank 0 across 64 different rows.
* Every single access incurs a **Row Buffer Conflict** ($t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$).
* Time per 64-byte line access:
  $$T_{\text{line\_conflict}} = t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} + T_{\text{burst}}$$
  $$T_{\text{line\_conflict}} = 8.75\text{ ns} + 8.75\text{ ns} + 8.75\text{ ns} + 2.50\text{ ns} = \mathbf{28.75 \text{ nanoseconds}}$$

##### Total Completion Time (System 0):
For 64 cache lines ($4,096\text{ bytes}$ total payload):

$$T_{\text{System0}} = 64 \text{ lines} \times 28.75\text{ ns/line} = \mathbf{1,840.0 \text{ nanoseconds}} \quad (5,888\text{ CPU Clock Cycles})$$

##### Effective Memory Bandwidth (System 0):

$$\text{BW}_{\text{System0}} = \frac{4,096\text{ Bytes}}{1,840.0 \times 10^{-9}\text{ s}} \approx \mathbf{2.226 \times 10^9 \text{ Bytes/sec}} = \mathbf{2.226 \text{ GB/sec}}$$

In System 0, the single-bank bottleneck degrades memory bandwidth down to just **$2.226\text{ GB/sec}$** ($8.7\%$ of bus capacity!).

---

#### Step 2: Analyze System 1 (Single-Channel, 8-Bank Low-Order Interleaved)

In System 1, low-order address bits scatter the 64 cache lines sequentially across 8 independent Banks (Bank 0, Bank 1, Bank 2, ..., Bank 7) on Channel 0.

Let us trace the memory controller command schedule:

1. **Cycle 0 ($t = 0.0\text{ ns}$)**: Issue `ACTIVATE Bank 0, Row 0`. (Bank 0 opens; ready for read at $t = 8.75\text{ ns}$).
2. **Cycle 2 ($t = 1.25\text{ ns}$)**: Issue `ACTIVATE Bank 1, Row 0`. (Bank 1 opens; ready at $t = 10.0\text{ ns}$).
3. **Cycle 4 ($t = 2.50\text{ ns}$)**: Issue `ACTIVATE Bank 2, Row 0`. (Bank 2 opens; ready at $t = 11.25\text{ ns}$).
4. ...
5. **Cycle 14 ($t = 8.75\text{ ns}$)**: Bank 0 is ready! Issue `READ Bank 0, Col 0`.
   * Data burst for Line 0 transmits on $DQ$ bus from $t = 17.50\text{ ns}$ to $t = 20.00\text{ ns}$ ($2.5\text{ ns}$ duration).
6. **Cycle 18 ($t = 11.25\text{ ns}$)**: Bank 1 is ready! Issue `READ Bank 1, Col 0`.
   * Data burst for Line 1 transmits on $DQ$ bus from $t = 20.00\text{ ns}$ to $t = 22.50\text{ ns}$.

```text
SYSTEM 1 PIPELINED COMMAND AND BUS TIMING CHRONOLOGY

 Time (ns) │ Memory Bus Command Dispatched │ Active Bank Status │ DQ Data Bus Action
───────────┼───────────────────────────────┼────────────────────┼───────────────────────────────
   0.00    │ ACTIVATE Bank 0               │ Bank 0 Opening     │ -
   1.25    │ ACTIVATE Bank 1               │ Bank 1 Opening     │ -
   2.50    │ ACTIVATE Bank 2               │ Bank 2 Opening     │ -
   3.75    │ ACTIVATE Bank 3               │ Bank 3 Opening     │ -
   :       │ :                             │ :                  │ :
   8.75    │ READ Bank 0                   │ Bank 0 Ready       │ -
  11.25    │ READ Bank 1                   │ Bank 1 Ready       │ Line 0 Transmitting (17.5-20.0ns)
  13.75    │ READ Bank 2                   │ Bank 2 Ready       │ Line 1 Transmitting (20.0-22.5ns)
  16.25    │ READ Bank 3                   │ Bank 3 Ready       │ Line 2 Transmitting (22.5-25.0ns)
```

##### Notice the Pipelined Execution:
* The initial $t_{\text{RCD}} + t_{\text{CL}}$ setup delay ($17.50\text{ ns}$) is paid **ONCE** for the very first line!
* After $t = 17.50\text{ ns}$, **a new 64-byte line payload completes every $2.50\text{ nanoseconds}$** back-to-back!
* The remaining 63 cache lines stream over the bus in $63 \times 2.50\text{ ns} = 157.50\text{ ns}$.

##### Total Completion Time (System 1):

$$T_{\text{System1}} = \text{Initial Setup Delay} + (64 \text{ lines} \times T_{\text{burst\_time}})$$

$$T_{\text{System1}} = 17.50\text{ ns} + (64 \times 2.50\text{ ns}) = 17.50\text{ ns} + 160.00\text{ ns} = \mathbf{177.50 \text{ nanoseconds}} \quad (568\text{ CPU Clock Cycles})$$

##### Effective Memory Bandwidth (System 1):

$$\text{BW}_{\text{System1}} = \frac{4,096\text{ Bytes}}{177.50 \times 10^{-9}\text{ s}} \approx \mathbf{23.076 \times 10^9 \text{ Bytes/sec}} = \mathbf{23.076 \text{ GB/sec}}$$

By exploiting 8-bank parallelism to hide $t_{\text{RCD}}$ activation latencies, memory bandwidth jumped from $2.226\text{ GB/sec}$ to **$23.076\text{ GB/sec}$** ($90.1\%$ of peak bus capacity!).

---

#### Step 3: Analyze System 2 (Dual-Channel, 8-Bank Parallelism)

In System 2, low-order address interleaving scatters the 64 cache lines across **2 independent 64-bit physical channels** (Channel 0 and Channel 1).

* Channel 0 receives 32 cache lines ($2,048\text{ bytes}$).
* Channel 1 receives 32 cache lines ($2,048\text{ bytes}$).
* Both channels execute their line fills **100% concurrently in parallel on separate physical wires**!

##### Total Completion Time (System 2):
Completion time is determined by 32 cache lines streaming over one channel in parallel with the other:

$$T_{\text{System2}} = \text{Initial Setup Delay} + (32 \text{ lines} \times 2.50\text{ ns})$$

$$T_{\text{System2}} = 17.50\text{ ns} + (32 \times 2.50\text{ ns}) = 17.50\text{ ns} + 80.00\text{ ns} = \mathbf{97.50 \text{ nanoseconds}} \quad (312\text{ CPU Clock Cycles})$$

##### Effective Memory Bandwidth (System 2):

$$\text{BW}_{\text{System2}} = \frac{4,096\text{ Bytes}}{97.50 \times 10^{-9}\text{ s}} \approx \mathbf{42.010 \times 10^9 \text{ Bytes/sec}} = \mathbf{42.010 \text{ GB/sec}}$$

---

#### Step 4: Calculate Performance Speedup Factors

```text
MEMORY PARALLELISM PERFORMANCE COMPARISON SUMMARY

 Architecture Configuration  │ Total Time (ns) │ CPU Stall Cycles │ Effective Bandwidth │ Speedup vs Base
─────────────────────────────┼─────────────────┼──────────────────┼─────────────────────┼──────────────────
 System 0 (Single-Bank)      │ 1,840.0 ns      │ 5,888 Cycles     │  2.226 GB/sec       │ 1.00x (Baseline)
 System 1 (8-Bank Interleaved)│   177.5 ns      │   568 Cycles     │ 23.076 GB/sec       │ 10.37x FASTER!
 System 2 (Dual-Channel 8-B) │    97.5 ns      │   312 Cycles     │ 42.010 GB/sec       │ 18.87x FASTER!
```

##### 1. Speedup of System 1 (8-Bank Parallelism) over System 0:

$$\text{Speedup}_{\text{System1}} = \frac{T_{\text{System0}}}{T_{\text{System1}}} = \frac{1,840.0\text{ ns}}{177.5\text{ ns}} = \mathbf{10.366\times \text{ Performance Advantage!}}$$

##### 2. Speedup of System 2 (Dual-Channel) over System 0:

$$\text{Speedup}_{\text{System2}} = \frac{T_{\text{System0}}}{T_{\text{System2}}} = \frac{1,840.0\text{ ns}}{97.5\text{ ns}} = \mathbf{18.872\times \text{ Performance Advantage!}}$$

---

### Sanity Check and Verification

Let us verify our mathematical and structural results against memory architecture principles:

1. **Bank Latency Hiding Check**:
   * Single-bank access took $28.75\text{ ns}$ per line.
   * Interleaved 8-bank streaming took $2.50\text{ ns}$ per line (burst time) after initial setup.
   * $t_{\text{RCD}}$ and $t_{\text{RP}}$ activation delays were $100\%$ hidden behind bank parallelism.
2. **Channel Bandwidth Scaling Check**:
   * Peak Dual-Channel DDR4-3200 bandwidth = $51.2\text{ GB/sec}$.
   * System 2 achieved $42.010\text{ GB/sec}$ ($82.1\%$ of peak dual-channel capacity!).
3. **CPU Stall Cycle Reduction**:
   * CPU stall time collapsed from $5,888\text{ clock cycles}$ down to $312\text{ clock cycles}$, delivering an **$18.87\times$ speedup** for the processing pipeline!

All bank-level latency hiding pipelines, low-order address interleaving schemes, rank turnaround constraints, and multi-channel bandwidth scaling equations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Bank-Level Parallelism (BLP)**: The hardware architecture feature where multiple independent DRAM bank arrays execute $t_{\text{RCD}}$ row activations and $t_{\text{RP}}$ precharges concurrently in the background, hiding analog access delays and delivering continuous $100\%$ memory data bus utilization.
* **DRAM Rank**: A physical collection of DRAM chips sharing the same 64-bit command/address bus and data bus wires on a DIMM module, where individual ranks are enabled via chip-select lines ($\overline{CS}$) with small inter-rank bus turnaround delays ($t_{\text{WTR}}$).
* **Memory Channel**: A completely independent, decoupled physical memory interconnect channel featuring its own dedicated memory controller, command/address bus, and 64-bit data bus ($DQ$), multiplying total system memory bandwidth linearly ($N_{\text{channels}} \times \text{BW}_{\text{channel}}$).
