---
title: "Address Translation Services (ATS) and Page Request Interface (PRI) Mechanics"
---

# Address Translation Services (ATS) and Page Request Interface (PRI) Mechanics

## The Centralized IOMMU Translation Bottleneck and the Missing Endpoint Page Fault Crisis

In modern high-performance computing platforms, artificial intelligence (AI) accelerators, graphics processing units (GPUs), and multi-port $400\text{-Gigabit}$ Ethernet network cards interface directly with host central processing unit (CPU) cores and main system DRAM memory over PCI Express (PCIe) interconnect networks. An AI training accelerator containing hundreds of tensor calculation engines can generate tens of millions of concurrent Direct Memory Access (DMA) transactions every second to fetch neural network weight matrices from system RAM.

To enforce memory security, isolate Virtual Machines, and prevent rogue devices from overwriting kernel memory, all incoming DMA transactions must pass through a host **Input-Output Memory Management Unit (IOMMU)**. 

The IOMMU translates device IO Virtual Addresses ($\text{IOVA}$) into physical DRAM addresses ($\text{PA}$) by walking 4-level page tables stored in main system memory.

However, when high-throughput accelerators and multi-core GPUs attempt to scale their memory transfers through a traditional, centralized IOMMU, two severe system-level hardware barriers emerge: **The Centralized Translation Bottleneck** and **The Missing Endpoint Page Fault Crisis**.

```text
THE CENTRALIZED IOMMU TRANSLATION BOTTLENECK

 8 AI Accelerators / GPUs (50 Million DMA Requests / Sec)
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │ Accelerator │  │ Accelerator │  │ Accelerator │  │ Accelerator │
 └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
        │                │                │                │
        ▼                ▼                ▼                ▼
 ═══════╧════════════════╧════════════════╧════════════════╧════════ PCIe Interconnect
                                  │
                                  ▼ (50 Million Un-Translated IOVAs / Sec!)
               ┌─────────────────────────────────────┐
               │ CENTRALIZED HOST IOMMU              │
               │ (Host IOTLB Cache Thrashing!)       │
               │ (4-Level Page Walk Memory Delays!)  │
               └──────────────────┬──────────────────┘
                                  │
                                  ▼
               DMA READ/WRITE LATENCY EXPLODES TO 200+ NS!
               (Accelerator Tensor Engines Freeze in Memory Stalls!)
```

Let us analyze both barriers in technical detail:

### 1. The Centralized Translation Bottleneck
When 8 high-performance GPUs and accelerators issue 50 million DMA requests per second simultaneously, every single transaction carries an un-translated $\text{IOVA}$ that must stop at the central host IOMMU inside the CPU Root Complex.
* The host IOMMU's internal translation cache (IOTLB) is completely overwhelmed by the massive influx of virtual addresses (**IOTLB Cache Thrashing**).
* Over $90\%$ of incoming DMA transactions miss in the host IOTLB, forcing the host IOMMU to execute slow, 4-level page table walks in host DRAM memory.
* DMA read and write latencies explode from $1.5\text{ nanoseconds}$ up to **$200\text{ nanoseconds}$**, causing the accelerator's tensor calculation engines to sit frozen in memory stalls, wasting up to $70\%$ of the accelerator's computing power!


## The Central Information Kiosk vs. The Pocket VIP Pass: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Address Translation Services (ATS), local Address Translation Caches (ATC), translated TLP headers, and Page Request Interface (PRI) demand paging before inspecting bitwise ATS headers and page request message formats, let us consider an everyday analogy: **The Massive Amusement Park and the Local VIP Pass**.

Imagine a massive amusement park (**Main System DRAM Memory**) containing 10,000 rides (**Physical DRAM Memory Pages**).

Thousands of visitors (**Peripheral Accelerators / GPUs**) explore the park every day, wanting to enter rides (**Execute DMA Memory Writes and Reads**).

```text
THE AMUSEMENT PARK METAPHOR

 Visitors (Accelerator DMA Engines)             Central Information Kiosk
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Hold Virtual Vouchers     │                 │ Converts Vouchers to      │
 │ (IO Virtual Addresses)    │                 │ Physical Ride Tickets     │
 └───────────────────────────┘                 └───────────────────────────┘
```

To enter any ride, a visitor must present a valid **Physical Ride Ticket** (**Physical Address / PA**). However, visitors are handed only **Virtual Vouchers** (**IO Virtual Addresses / IOVAs**) when they enter the park.

Let us compare two operational strategies for managing ticket conversions:


### Strategy 2: The On-Board Pocket VIP Stamp (Address Translation Services / ATS)

To eliminate the central line, the park management introduces **Address Translation Services (ATS)** and hands each visitor an **On-Board Pocket Stamp (An Address Translation Cache / ATC inside the GPU)**!

Now, trace how Visitor 0 operates under Strategy 2:

```text
STRATEGY 2: THE POCKET VIP STAMP (ATS / ATC CACHING)

 Step 1 (Translation Request - ATSRd):
 Visitor asks Central Kiosk ONCE: "Convert Voucher #42 into 100 Physical Tickets!"
 Kiosk validates permissions and hands Visitor translated tickets (ATSRsp).
 Visitor stores translated tickets on their Pocket Stamp (GPU ATC Cache)!

 Step 2 (Translated Access - AT = 2'b10):
 For the next 1,000 rides, Visitor walks STRAIGHT TO RIDE #42, shows Pocket Stamp,
 and enters the ride in 1 SECOND! (ZERO LINES AT CENTRAL KIOSK!)
```

1. **Step 1 (ATS Translation Request `ATSRd`)**: Before riding Ride #42 for the first time, Visitor 0 walks to the Central Kiosk ONCE and asks: *"Please convert Virtual Voucher #42 into physical tickets for the next 100 rides!"*
2. **Step 2 (Local ATC Caching)**: The Central Kiosk verifies permissions and hands Visitor 0 the translated physical tickets. Visitor 0 **stamps the translated tickets onto their On-Board Pocket Stamp (Local ATC Cache)**.
3. **Step 3 (Direct Fast-Track Entry `AT = 2'b10`)**: For the next 1,000 rides, Visitor 0 walks **STRAIGHT to Ride #42**, shows their Pocket Stamp (**Translated TLP Header**), and enters the ride in **1 second**!
   * The Central Kiosk is **COMPLETELY BYPASSED!**
   * The line at the Central Kiosk disappears, and visitors enjoy rides at full speed!


## Primitive 1: Address Translation Services (ATS) Architecture

Now that we possess a clear intuitive mental model of local VIP stamps and maintenance pagers, let us examine the formal engineering mechanics of **Address Translation Services (ATS)**.

> **Address Translation Services (ATS)** is a PCI-SIG hardware capability protocol that enables PCIe Endpoint devices (such as GPUs, SmartNICs, and AI accelerators) to request, receive, and cache IOVA-to-PA address translations locally inside an on-chip **Address Translation Cache (ATC)** on the endpoint silicon die, offloading address translation duties from the central host IOMMU.

```text
ADDRESS TRANSLATION SERVICES (ATS) PROTOCOL FLOW

 PCIe Endpoint Accelerator (GPU / SmartNIC)             Host Root Complex / Central IOMMU
 ┌─────────────────────────────────────────┐            ┌───────────────────────────────┐
 │ Local ATC Cache Miss for IOVA 0x4000    │            │ IOMMU Page Table Matrix       │
 └────────────────────┬────────────────────┘            └───────────────▲───────────────┘
                      │                                                 │
                      │ 1. Translation Request TLP (ATSRd)              │
                      ├────────────────────────────────────────────────►│
                      │    (Carries IOVA 0x4000 & Requester BDF)        │
                      │                                                 │
                      │ 2. Translation Completion TLP (ATSRsp / CplD)   │
                      │◄────────────────────────────────────────────────┤
                      │    (Returns Physical Address PA = 0x9000 + R/W) │
                      ▼                                                 │
 Stores PA 0x9000 in Local ATC Cache!                                   │
                      │                                                 │
                      ▼                                                 │
 Executes Translated DMA Write TLP (AT = 2'b10, PA = 0x9000) ───────────┘
 (Bypasses Host IOMMU Page Table Walk Completely! 1-Cycle Direct DRAM Access!)
```


### The Translated TLP Header Field (`AT[1:0]`)

How does the central host IOMMU know whether an incoming DMA TLP carries an un-translated virtual address or a pre-translated physical address?

The PCIe specification includes a 2-bit **Address Type (`AT`) Field** in DW0 of every TLP Header (bits $[3:2]$):

```text
ADDRESS TYPE (AT) FIELD ENCODING IN TLP HEADER

 AT[1:0] Code │ TLP Address Mode   │ Host IOMMU Action upon Packet Arrival
──────────────┼────────────────────┼───────────────────────────────────────────────────────────
   2'b00      │ Un-Translated TLP  │ Must intercept packet & execute 4-level DRAM page walk.
   2'b01      │ Translation Request│ Process ATS Request (ATSRd) & return PA in Completion.
   2'b10      │ Translated TLP!    │ BYPASS IOMMU PAGE TABLES! Route PA directly to DRAM!
   2'b11      │ Reserved           │ Reserved.
```

```text
TRANSLATED TLP HEADER ADDRESS TYPE (AT = 2'b10)

 TLP Header Double Word 0 (DW0)
 ┌──────┬───────────┬──────┬──────┬──────┬───────┬───────────────────────────┐
 │ Fmt  │ Type      │ TC   │ Attr │ AT   │ Length│ TLP Header DW0            │
 │ (3b) │ (5b)      │ (3b) │ (3b) │(2b)  │ (10b) │ AT = 2'b10 (TRANSLATED!)  │
 └──────┴───────────┴──────┴──────┴──┬───┴───────┴───────────────────────────┘
                                     ▲
                                     └── AT = 2'b10 TELLS HOST:
                                         "This address is PRE-TRANSLATED!
                                          Bypass IOMMU page tables!"
```

#### The Hardware Acceleration Impact of `AT = 2'b10`:
When an incoming DMA write TLP arrives at the host Root Complex with **`AT = 2'b10`**:
* The host IOMMU **completely bypasses its page table walk logic**!
* The IOMMU routes the TLP's physical address directly to the DRAM memory controller in **$1\text{ single clock cycle}$**!
* Memory read/write latencies drop from $200\text{ ns}$ down to **$1.5\text{ ns}$**, unleashing full multi-gigabit wire speed!


## Primitive 2: The Page Request Interface (PRI) Mechanics

Now let us examine the second core primitive: **The Page Request Interface (PRI)**.

While ATS allows endpoints to cache valid translations, **the Page Request Interface (PRI)** provides a hardware protocol for handling **I/O Page Faults**.

> **The Page Request Interface (PRI)** is a PCI-SIG extended capability protocol that allows a PCIe Endpoint device to detect un-mapped virtual memory pages ($\text{IOVA}$ misses) and request the host operating system kernel to allocate and page-in missing physical DRAM pages on demand, enabling true **Hardware Demand Paging**.

```text
PAGE REQUEST INTERACTION: ATS + PRI DEMAND PAGING

 PCIe Endpoint Accelerator (GPU)                         Host OS Kernel / IOMMU
 ┌─────────────────────────────────────────┐            ┌───────────────────────────────┐
 │ Local ATC Miss for IOVA 0x4000          │            │ Page Fault Handler            │
 ├─────────────────────────────────────────┤            └───────────────▲───────────────┘
 │ Sends ATSRd Request to Host IOMMU       │                            │
 ├─────────────────────────────────────────┤                            │
 │ Host returns ATSRsp = Invalid Page!     │                            │
 ├─────────────────────────────────────────┤                            │
 │ DOES NOT CRASH! SUSPENDS DMA TASK!      │                            │
 ├─────────────────────────────────────────┤                            │
 │ 1. Dispatches PageReq Message TLP ──────┼────── Msg ────────────────►│
 │    (Requests OS to Page-In IOVA 0x4000) │                            │ (OS Allocates RAM &
 │                                         │                            │  loads page from SSD!)
 │                                         │                            │
 │ 2. Receives PageRsp Message TLP (Success)│◄───── Msg ─────────────────┤
 ├─────────────────────────────────────────┤                            │
 │ 3. Re-issues ATSRd -> Gets Valid PA!    │                            │
 │ 4. Resumes DMA Transfer Successfully!   │                            │
 └─────────────────────────────────────────┘                            └───────────────────────────────┘
```


### Comparative Architecture: Traditional IOMMU vs. ATS + PRI

The following matrix compares traditional centralized IOMMU translation against ATS and PRI hardware demand paging:

```text
TRANSLATION AND PAGE FAULT ARCHITECTURE COMPARISON MATRIX

 Interconnect Feature     │ Traditional Centralized IOMMU │ ATS + PRI Accelerated Interconnect
──────────────────────────┼───────────────────────────────┼─────────────────────────────────────────────
 Translation Location     │ Central Host IOMMU Only       │ Distributed On-Chip Endpoint ATC Caches
 Central IOMMU Load       │ 100% of all DMA Transactions  │ < 0.5% (Only ATC Misses & Invalidation)
 DMA Translation Latency  │ 150 ns - 200 ns (Page Walk)   │ 0.625 ns (1-Cycle Local ATC Hit!)
 Memory Pinning Needed    │ MANDATORY (All RAM Pinned!)   │ ZERO (Supports Hardware Demand Paging!)
 Un-Mapped IOVA Access    │ PCIe Link Reset / Crash       │ PRI PageReq -> OS Pages In RAM -> Resumes!
```


## Solved Industrial Engineering Exercise: Quantitative ATS Offloading, ATC Hit Acceleration, and PRI Demand Paging Trace

To consolidate your complete mastery of Address Translation Services (ATS), local Address Translation Caches (ATC), translated TLP headers (`AT = 2'b10`), and Page Request Interface (PRI) demand paging, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Analyze System 0 (Centralized Host IOMMU — No ATS/PRI)

Under System 0, every one of the 10,000,000 DMA transactions carries an un-translated $\text{IOVA}$ (`AT = 2'b00`) and must be translated by the central host IOMMU.

Assuming $100\%$ of pages are pre-pinned, every transaction incurs a 4-level page table walk delay $T_{\text{walk}} = 480\text{ CPU clock cycles}$ ($150.0\text{ ns}$).

##### 1. Total Address Translation Delay ($\text{Cycles}_{\text{System0}}$):

$$\text{Cycles}_{\text{System0}} = 10,000,000 \text{ transactions} \times 480 \text{ cycles/transaction} = \mathbf{4,800,000,000 \text{ CPU Clock Cycles}}$$

##### 2. Total Translation Execution Time ($T_{\text{trans\_total,0}}$) at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{trans\_total,0}} = 4,800,000,000 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{1.500 \text{ Seconds}}$$

Under System 0, the central IOMMU burns **$1.500\text{ seconds}$** ($4.8\text{ billion CPU cycles}$) purely translating addresses!


##### Path B: Local ATC Misses Mapped in DRAM ($0.18\%$ / $18,000\text{ transactions}$):
* Endpoint dispatches `ATSRd` request to host IOMMU.
* Transit to Host ($10.0\text{ ns}$) + Host Page Walk ($150.0\text{ ns}$) + Return `ATSRsp` ($10.0\text{ ns}$) + ATC Load ($0.625\text{ ns}$) $= 170.625\text{ ns}$ ($546\text{ CPU clock cycles}$).

$$\text{Cycles}_{\text{PathB}} = 18,000 \times 546 \text{ cycles} = \mathbf{9,828,000 \text{ CPU Clock Cycles}} \quad (0.00307125\text{ s})$$


##### Sum Total Translation Delay for System 1 ($\text{Cycles}_{\text{System1}}$):

$$\text{Cycles}_{\text{System1}} = \text{Cycles}_{\text{PathA}} + \text{Cycles}_{\text{PathB}} + \text{Cycles}_{\text{PathC}}$$

$$\text{Cycles}_{\text{System1}} = 19,960,000 + 9,828,000 + 65,220,000 = \mathbf{95,008,000 \text{ CPU Clock Cycles}}$$

$$T_{\text{trans\_total,1}} = 95,008,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{0.02969 \text{ Seconds}} \quad (29.69\text{ ms})$$

```text
SYSTEM 1 TRANSLATION DELAY BREAKDOWN (10,000,000 TRANSACTIONS)

 Transaction Category     │ Count        │ Latency per Item │ Total Cycles   │ Total Time (s)
──────────────────────────┼──────────────┼──────────────────┼────────────────┼────────────────
 Path A: ATC Hits (99.8%) │ 9,980,000    │ 2 Cycles (0.6ns) │ 19,960,000     │ 0.00624 s
 Path B: ATS Misses (0.18%)│    18,000    │ 546 Cycles (170ns)│  9,828,000     │ 0.00307 s
 Path C: PRI Faults (0.02%)│     2,000    │ 32,610 Cycles    │ 65,220,000     │ 0.02038 s
──────────────────────────┼──────────────┼──────────────────┼────────────────┼────────────────
 TOTAL SYSTEM 1 EXECUTN   │ 10,000,000   │ -                │ 95,008,000     │ 0.02969 s
```


### Sanity Check and Verification

Let us verify our mathematical and protocol state results against PCIe ATS/PRI specifications:

1. **ATC Hit Ratio Offloading Check**:
   * Out of $10,000,000$ requests, $9,980,000$ hit in the local ATC cache.
   * Central host IOMMU processed only $20,000$ requests ($0.2\%$), verifying $99.8\%$ offloading of central IOMMU hardware!
2. **`AT = 2'b10` Header Bit Verification**:
   * All $9,980,000$ ATC hits dispatched DMA write TLPs with `AT = 2'b10` (Translated).
   * Host IOMMU bypassed page tables for all $9,980,000$ packets, matching $100\%$ of specification requirements.
3. **PRI Message Handshake Verification**:
   * `PageReq` message TLP carried `PRG Index = 5` and un-mapped address `0x2_0000_0000`.
   * `PageRsp` message TLP echoed `PRG Index = 5` with `Response = Success`.
   * Message handshake enabled hardware demand paging with zero PCIe link resets.

All bitwise TLP `AT` field encodings, ATS translation request/completion state sequences, PRI page request message handshakes, and $50.52\times$ performance speedup metrics evaluate with 100% mathematical, physical, and logical precision.

