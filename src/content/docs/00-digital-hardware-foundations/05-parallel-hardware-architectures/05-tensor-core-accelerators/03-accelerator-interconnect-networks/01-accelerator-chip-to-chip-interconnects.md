---
title: "Accelerator Scale-Up Link Architecture and Direct Chip-to-Chip Interconnect Mechanics"
---

# Accelerator Scale-Up Link Architecture and Direct Chip-to-Chip Interconnect Mechanics

## The PCIe Bandwidth Bottleneck and Multi-GPU Inter-Die Communication Friction

In modern artificial intelligence infrastructure, large-scale deep learning models—such as 100-billion to 1-trillion parameter Large Language Models (LLMs)—exceed the memory capacity and computational capability of any single physical GPU or tensor accelerator die. To train or serve these massive neural networks, system architects construct **Distributed Multi-GPU Accelerator Nodes**, clustering 8, 16, or 32 high-performance accelerator dies inside a single server chassis.

During distributed tensor processing (such as Tensor Parallelism, Pipeline Parallelism, or All-Reduce gradient accumulation), parallel execution engines running on different physical accelerator dies must continuously exchange multi-gigabyte tensors of weights, activations, and gradients.

However, when multiple accelerator dies attempt to communicate across a standard motherboard architecture using **PCI Express (PCIe Gen 4 / Gen 5 / Gen 6)** expansion slots, the system encounters a severe physical performance bottleneck: **The PCIe Bandwidth Asymmetry Barrier**.

```text
THE PCIe MOTHERBOARD BANDWIDTH ASYMMETRY BARRIER

 GPU 0 Accelerator Die (Internal HBM3 Memory: 3,200 GB/sec)
 ┌─────────────────────────────────────────────────────────────┐
 │ 3.2 Terabytes / Second Internal HBM Memory Bandwidth        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ (GPU 0 Memory Stream)
 ┌─────────────────────────────────────────────────────────────┐
 │ Standard PCIe Gen 5 x16 Slot Interface                      │
 │ MAXIMUM BANDWIDTH: 64 Gigabytes / Second (50x SLOWER!)      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ (Double-Hop Host CPU Intermediary)
 ┌─────────────────────────────────────────────────────────────┐
 │ Host CPU System RAM (Stalls execution; 5.0 us Latency!)     │
 └─────────────────────────────────────────────────────────────┘
```

Let us evaluate the physical performance friction created by standard PCIe motherboard interconnects:

### 1. The $50\times$ Bandwidth Asymmetry Gap
A modern tensor accelerator die contains off-chip High-Bandwidth Memory (HBM3) delivering an internal memory read bandwidth of **$3.2 \text{ to } 4.8\text{ Terabytes per second}$ ($3,200 \text{ to } 4,800\text{ GB/sec}$)**.

In contrast, a top-tier **PCIe Gen 5 x16 slot** provides a maximum theoretical bandwidth of only **$64\text{ Gigabytes per second (GB/sec)}$** per direction ($128\text{ GB/sec}$ bidirectional).

$$\text{Bandwidth Asymmetry Ratio} = \frac{\text{Internal HBM Bandwidth}}{\text{PCIe Slot Bandwidth}} = \frac{3,200 \text{ GB/sec}}{64 \text{ GB/sec}} = \mathbf{50.0\times \text{ Bandwidth Gap!}}$$

Look at this physical mismatch:
Internal memory streams at $3,200\text{ GB/sec}$, but sending data to an adjacent GPU sitting in the next PCIe slot is restricted to a narrow $64\text{ GB/sec}$ pipe! 

When 8 GPUs exchange tensor gradients during All-Reduce operations, the PCIe bus becomes completely saturated, and high-speed Tensor Cores spend over $80\%$ of their time sitting idle waiting for inter-chip data transfers to complete.


## The Congested Rural Dirt Road vs. The Private High-Speed Maglev Bridge: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of accelerator scale-up links, peer-to-peer (P2P) direct memory access, PAM4 SerDes high-speed signaling, and unified inter-die address spaces before inspecting hardware physical layer (PHY) schematics, packet routing matrices, and All-Reduce exchange timing equations, let us consider an everyday analogy: **The Two Industrial Factory Towns**.

Imagine two large industrial manufacturing cities (**GPU 0 Accelerator Die** and **GPU 1 Accelerator Die**) sitting 5 miles apart.

```text
THE INDUSTRIAL FACTORY TOWNS ANALOGY

 City 0 (GPU 0 Die & Local HBM VRAM)        City 1 (GPU 1 Die & Local HBM VRAM)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Factory Floor & Warehouse │              │ Factory Floor & Warehouse │
 │ Internal Speed: 3,200 mph │              │ Internal Speed: 3,200 mph │
 └───────────────────────────┘              └───────────────────────────┘
```

Inside City 0, internal automated conveyor belts (**HBM Memory Bus**) move heavy steel parts at a speed of **3,200 miles per hour** ($3,200\text{ GB/sec}$ equivalent).

City 0 needs to send 1,000 heavy steel parts (**A Multi-Gigabyte Tensor Payload**) to City 1.

Let us observe two different transportation infrastructure designs for how City 0 sends parts to City 1:


### Strategy 2: The Private High-Speed Maglev Bridge (Accelerator Scale-Up Link)
Realizing the waste of the rural dirt road, the mayors of City 0 and City 1 build a **Private, 16-Lane Direct Maglev Express Bridge (An Accelerator Scale-Up Link / NVLink)** directly between the two cities!

The Maglev bridge completely bypasses the Federal Capital City (**Bypasses Host CPU & System RAM**)!

```text
STRATEGY 2: PRIVATE MAGLEV EXPRESS BRIDGE (SCALE-UP LINK)

 City 0 ═════════════════════════════════════════════════════════► City 1
          16-Lane High-Speed Maglev Bridge (900 mph Direct Speed!)
 (Takes 10 SECONDS! Zero Federal Capital stops! Zero driver paperwork!)
```

Trace how cargo travels under Strategy 2:
1. **Direct Connection**: City 0's conveyor belt connects directly to the entrance of the Maglev bridge.
2. **High-Speed Direct Transit**: A Maglev train carrying the steel parts enters the bridge and travels directly to City 1 at a speed of **900 miles per hour** ($900\text{ GB/sec}$)!
3. **Zero Federal Stops**: The train does NOT stop at the Federal Capital, does NOT unload into government warehouses, and requires zero paperwork (**Zero Host CPU & Driver Interruption**)!
4. **Direct Delivery**: The Maglev train arrives directly at City 1's factory floor in **10 seconds** ($0.5\text{ }\mu\text{s}$ latency)!

Notice what Strategy 2 achieved:
* **$14\times$ Higher Inter-City Speed**: Cargo velocity jumped from $64\text{ mph}$ up to **$900\text{ mph}$ ($900\text{ GB/sec}$)**!
* **$99\%$ Latency Reduction**: Delivery time dropped from 5 hours down to 10 seconds because the double-hop through the Federal Capital was eliminated.
* **Continuous Industrial Flow**: Factory machines in City 0 and City 1 operated in seamless synchronization.

This private high-speed Maglev bridge is the exact physical analogue of **Accelerator Scale-Up Links and Direct Peer-to-Peer (P2P) Interconnects**:
* City 0 and City 1 are **GPU 0 and GPU 1 Accelerator Dies**.
* Steel parts are **Data Tensors (Weights, Activations, Gradients)**.
* The public 1-lane dirt road is a **Standard PCIe Motherboard Bus**.
* The Federal Capital City is **Host CPU System RAM and OS Drivers**.
* The 16-lane private Maglev bridge is an **Accelerator Scale-Up Link (NVLink / Infinity Fabric)**.
* Travelling directly across the Maglev bridge in 10 seconds is **Direct Peer-to-Peer (P2P) Memory Access**.


### The Physical High-Speed SerDes Layer (PAM4 Signaling)

How do scale-up links achieve $14\times \text{to } 28\times$ higher bandwidth than PCIe Gen 5 slots within a compact physical footprint?

Scale-up links utilize high-speed **Serializer/Deserializer (SerDes)** physical layers operating with **Pulse Amplitude Modulation 4-Level (PAM4)** signaling.

```text
NRZ (2-LEVEL) VS PAM4 (4-LEVEL) SIGNALING COMPARISON

 NRZ Signaling (1 Bit per Symbol / Clock Edge)
 Voltage
  1.0V ┼─────────────── Logical '1'
       │
  0.0V ┼─────────────── Logical '0'  (Transmits 1 Bit / Symbol)

 PAM4 Signaling (2 Bits per Symbol / Clock Edge)
 Voltage
  1.0V ┼─────────────── Symbol '11' (3)
  0.66V┼─────────────── Symbol '10' (2)
  0.33V┼─────────────── Symbol '01' (1)
  0.0V ┼─────────────── Symbol '00' (0)  (Transmits 2 Bits / Symbol!)
```

#### 1. Traditional NRZ (Non-Return-to-Zero) Signaling:
Transmits 2 voltage levels ($0.0\text{V} = \text{bit } 0$, $1.0\text{V} = \text{bit } 1$). Each clock cycle symbol transmits **1 bit of data**.

#### 2. Advanced PAM4 (Pulse Amplitude Modulation 4-Level) Signaling:
Transmits 4 distinct voltage levels ($0.0\text{V} = 00_2$, $0.33\text{V} = 01_2$, $0.66\text{V} = 10_2$, $1.0\text{V} = 11_2$).
* **2 Bits per Symbol**: On every single clock cycle edge, PAM4 transmits **2 bits of data**!
* **Doubled Throughput**: Running a PAM4 SerDes lane at $28\text{ Gigabaud}$ symbol rate yields a data transmission rate of **$56\text{ Gigabits per second (Gbps)}$ per physical wire pair**!


## Primitive 2: Direct Peer-to-Peer (P2P) Memory Interconnect

Now let us examine the second core primitive: **The Direct Peer-to-Peer (P2P) Memory Interconnect**.

Having an $1.8\text{-TB/sec}$ physical scale-up link is useless if the software protocol still requires copying data through the host CPU's memory.

To achieve maximum performance, scale-up links enforce **Direct Peer-to-Peer (P2P) Memory Mapping**.

> **Direct Peer-to-Peer (P2P) Memory Access** is a hardware interconnect protocol and address translation mechanism that maps the physical High-Bandwidth Memory (HBM) arrays of multiple discrete accelerator dies into a single, unified, globally-addressable physical address space, allowing execution engines (Tensor Cores / DMA) on GPU 0 to read or write memory locations on GPU 1 directly across scale-up links with zero host CPU intervention.

```text
UNIFIED PEER-TO-PEER (P2P) MEMORY ADDRESS MAPPING

 64-Bit Global Unified Physical Address Space
 ┌─────────────────────────────────────────────────────────────┐
 │ Addresses 0x0000_0000 .. 0x000F_FFFF ──► GPU 0 Local HBM    │
 ├─────────────────────────────────────────────────────────────┤
 │ Addresses 0x0010_0000 .. 0x001F_FFFF ──► GPU 1 Remote HBM   │
 ├─────────────────────────────────────────────────────────────┤
 │ Addresses 0x0020_0000 .. 0x002F_FFFF ──► GPU 2 Remote HBM   │
 └─────────────────────────────────────────────────────────────┘
```


## Multi-GPU Scale-Up Topologies: Mesh vs. Switched NVSwitch Networks

When connecting 8 GPUs inside a single server chassis, how do hardware architects arrange the scale-up links between the 8 accelerator dies?

There are two primary scale-up network topologies: **Direct Mesh / Cube Topologies** and **Switched NVSwitch Topologies**.

```text
MULTI-GPU SCALE-UP NETWORK TOPOLOGIES (8 GPUs)

 1. Direct Fully-Connected / Mesh Topology (Direct Link Attach)
 ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐
 │GPU 0 ├═════┤GPU 1 ├═════┤GPU 2 ├═════┤GPU 3 │
 └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘
    ║            ║            ║            ║  (Direct point-to-point links)
 ┌──┴───┐     ┌──┴───┐     ┌──┴───┐     ┌──┴───┐ (Multi-hop routing needed if
 │GPU 4 ├═════┤GPU 5 ├═════┤GPU 6 ├═════┤GPU 7 │  not fully connected!)
 └──────┘     └──────┘     └──────┘     └──────┘

 2. Switched NVSwitch Topology (Centralized Interconnect Switch)
 GPU 0  GPU 1  GPU 2  GPU 3  GPU 4  GPU 5  GPU 6  GPU 7
   ║      ║      ║      ║      ║      ║      ║      ║
 ┌═╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩═┐
 │ CENTRALIZED SCALE-UP SWITCH NETWORK (NVSwitch)     │
 └────────────────────────────────────────────────────┘
  (ANY GPU can communicate with ANY GPU at full 1.8 TB/s bandwidth in 1 Hop!)
```


### 2. Switched NVSwitch Topologies (Centralized Interconnect Switch)
* **Structure**: GPUs do not connect directly to each other. Instead, all scale-up links from all 8 GPUs connect to specialized high-speed **Interconnect Switch Chips (NVSwitch)** sitting on the server board.
* **Advantage**: **Non-Blocking Any-to-Any Bisection Bandwidth**!
  * GPU 0 can communicate with GPU 7 at the **exact same $1.8\text{-TB/sec}$ bandwidth** as GPU 0 communicating with GPU 1!
  * Every GPU pair is separated by **a single switch hop ($0.1\text{ }\mu\text{s}$ latency)**.
* **Use Case**: The gold standard architecture for large language model (LLM) training nodes (e.g. NVIDIA HGX H100/B200 boards).


### How Ring All-Reduce Operates across Scale-Up Links:

1. **Vector Segmentation**: Each GPU's gradient vector $V$ is partitioned into 4 equal segments ($v[0], v[1], v[2], v[3]$).
2. **Ring Transmission Steps ($2 \cdot (N - 1)$ Steps)**:
   * **Step 1**: GPU $k$ uses its scale-up link to transmit segment $v[k]$ directly into the P2P memory space of its clockwise neighbor GPU $(k+1) \pmod 4$.
   * **Step 2**: The receiving GPU's Tensor Core or DMA unit executes an atomic addition (`atomicAdd`) or vector add, adding the incoming segment to its local segment in real time!
   * **Step 3**: The updated partial sum is immediately forwarded to the next neighbor in the ring!

#### Performance Comparison:

$$\text{PCIe Double-Hop All-Reduce Time } (64 \text{ GB/s}) \approx \mathbf{125.0 \text{ Microseconds}}$$

$$\text{NVLink 4 Scale-Up Ring All-Reduce Time } (900 \text{ GB/s}) = \mathbf{8.8 \text{ Microseconds}}$$

$$\mathbf{\text{Speedup Factor} = \frac{125.0}{8.8} = 14.20\times \text{ Performance Advantage!}}$$

By using scale-up links and direct P2P memory access, the multi-GPU gradient exchange executed **$14.2\times$ faster**, reducing training synchronization overhead from milliseconds down to microseconds!


### Scenario and Parameters

You are a principal interconnect systems architect auditing an 8-GPU deep learning training server node ($G_0 \dots G_7$).

Each GPU accelerator die operates at a clock frequency $f_{\text{clk}} = 2.0\text{ GHz}$ ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

Each GPU features an internal High-Bandwidth Memory (HBM3) subsystem delivering $3,200\text{ GB/sec}$ of local VRAM bandwidth.

```text
2.0 GHz 8-GPU ACCELERATOR SERVER NODE SPECIFICATIONS

 Clock Frequency         : 2.0 GHz (T_clk = 500 ps)
 Local HBM3 VRAM Speed   : 3,200 GB/sec per GPU
 PCIe Gen 5 x16 Slot Speed: 64.0 GB/sec per direction (Host CPU Double-Hop)
 PCIe P2P Latency        : T_PCIe_P2P = 5.0 Microseconds (5,000 ns)
 NVLink 4 Scale-Up Speed : 900.0 GB/sec per GPU (18 Links x 50 GB/s)
 NVLink P2P Latency      : T_NVLink_P2P = 0.6 Microseconds (600 ns)
```

#### The Workload All-Reduce Task:
At the end of a backpropagation training step, all 8 GPUs must execute a Ring All-Reduce gradient exchange over a **$1.6\text{-Gigabyte}$ gradient tensor payload** ($D_{\text{tensor}} = 1.6 \times 10^9\text{ Bytes}$).

Mathematically, the total data volume transferred per GPU during a Ring All-Reduce exchange across $N = 8\text{ GPUs}$ is:

$$\mathbf{\text{Data Transferred per GPU } D_{\text{transfer}} = 2 \cdot \left( \frac{N - 1}{N} \right) \cdot D_{\text{tensor}}}$$

#### System Implementations to Compare:

* **System A (Standard PCIe Gen 5 Motherboard Bus — CPU Double-Hop)**:
  * Transfers data across PCIe Gen 5 slots ($64.0\text{ GB/sec}$ per direction).
  * Incurs 7 ring transfers, each paying PCIe double-hop latency ($T_{\text{PCIe\_P2P}} = 5.0\text{ }\mu\text{s}$).
* **System B (NVLink 4 Dedicated Scale-Up Links — Direct P2P)**:
  * Transfers data across direct NVLink 4 scale-up links ($900.0\text{ GB/sec}$ per GPU).
  * Incurs 7 ring transfers, each paying direct P2P latency ($T_{\text{NVLink\_P2P}} = 0.6\text{ }\mu\text{s}$).

#### Your Objective

1. Calculate the total data volume transferred per GPU ($D_{\text{transfer}}$) for the $1.6\text{-GB}$ gradient tensor across 8 GPUs.
2. For **System A (Standard PCIe Gen 5)**:
   * Calculate the data transfer time ($T_{\text{xfer\_A}}$) and total ring latency delay ($T_{\text{latency\_A}}$).
   * Calculate total All-Reduce completion time (in milliseconds).
3. For **System B (NVLink 4 Scale-Up Links)**:
   * Calculate the data transfer time ($T_{\text{xfer\_B}}$) and total ring latency delay ($T_{\text{latency\_B}}$).
   * Calculate total All-Reduce completion time (in milliseconds).
4. Calculate the overall **Performance Speedup Factor** of System B over System A for the $1.6\text{-GB}$ All-Reduce gradient exchange.
5. Calculate the effective inter-GPU communication bandwidth utilization percentage ($\% \text{ of HBM Speed}$) for System A vs System B.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Analyze System A (Standard PCIe Gen 5 Motherboard Bus)

Bandwidth $\text{BW}_A = 64.0\text{ GB/sec} = 64.0 \times 10^9\text{ Bytes/sec}$.

Ring steps $= 2 \cdot (N - 1) = 2 \cdot 7 = \mathbf{14 \text{ Ring Transfer Steps}}$.

##### 1. Data Transfer Time ($T_{\text{xfer\_A}}$):
$$T_{\text{xfer\_A}} = \frac{D_{\text{transfer}}}{\text{BW}_A} = \frac{2.80 \times 10^9 \text{ Bytes}}{64.0 \times 10^9 \text{ Bytes/sec}} = \mathbf{0.04375 \text{ seconds}} = \mathbf{43.750 \text{ milliseconds}}$$

##### 2. Total Interconnect Latency Delay ($T_{\text{latency\_A}}$):
14 ring transfer steps $\times 5.0\text{ }\mu\text{s}$ latency per step:

$$T_{\text{latency\_A}} = 14 \times 5.0\text{ }\mu\text{s} = 70.0\text{ }\mu\text{s} = \mathbf{0.070 \text{ milliseconds}}$$

##### 3. Total All-Reduce Completion Time (System A):
$$T_{\text{total\_A}} = T_{\text{xfer\_A}} + T_{\text{latency\_A}} = 43.750\text{ ms} + 0.070\text{ ms} = \mathbf{43.820 \text{ milliseconds}} \quad (43,820\text{ }\mu\text{s})$$

System A requires **$43.820\text{ milliseconds}$** to synchronize the 1.6-GB gradient tensor.


#### Step 4: Calculate Performance Speedup Factor and Bandwidth Utilization Ratio

##### 1. Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{total\_A}}}{T_{\text{total\_B}}} = \frac{43.820\text{ ms}}{3.1195\text{ ms}} \approx \mathbf{14.047\times \text{ Performance Advantage!}}$$

$$\text{Synchronization Time Saved} = 43.820\text{ ms} - 3.120\text{ ms} = \mathbf{40.700 \text{ milliseconds Saved per Step!}}$$

##### 2. Inter-GPU Communication Speed vs. Internal HBM Speed ($3,200\text{ GB/sec}$):

$$\text{Interconnect Ratio (System A - PCIe)} = \frac{64.0 \text{ GB/s}}{3,200 \text{ GB/s}} \times 100\% = \mathbf{2.00\% \text{ of HBM Speed (Severe Bottleneck!)}}$$

$$\text{Interconnect Ratio (System B - NVLink 4)} = \frac{900.0 \text{ GB/s}}{3,200 \text{ GB/s}} \times 100\% = \mathbf{28.125\% \text{ of HBM Speed (High Balance!)}}$$

```text
MULTI-GPU GRADIENT ALL-REDUCE PERFORMANCE SUMMARY

 System Architecture        │ Interconnect Speed │ All-Reduce Time (1.6GB)│ Speedup Factor
────────────────────────────┼────────────────────┼────────────────────────┼───────────────────
 System A (PCIe Gen5 Slot)  │ 64.0 GB/sec        │ 43.820 ms              │ 1.00x (Baseline)
 System B (NVLink 4 Scale-Up)│ 900.0 GB/sec       │  3.120 ms              │ 14.05x FASTER!
                            │ (14.1x Bandwidth!) │ (40.70 ms Saved!)      │ (+1,305% Gain)
```

##### Engineering Conclusion:
By installing dedicated NVLink 4 scale-up links and enabling direct peer-to-peer (P2P) memory access, System B eliminated host CPU double-hop latencies and expanded inter-die bandwidth by $14.1\times$, reducing gradient synchronization time from $43.82\text{ ms}$ down to $3.12\text{ ms}$—delivering a **$14.05\times$ performance speedup ($1,305\%$ throughput gain)** on the 1.6-GB All-Reduce workload!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Accelerator Scale-Up Link**: A specialized, ultra-high-bandwidth point-to-point physical interconnect (such as NVLink, Infinity Fabric, or Xe Link) that connects discrete accelerator dies directly, bypassing standard PCIe motherboard slots to deliver $900 \text{ GB/s} \text{ to } 1.8\text{ TB/s}$ of inter-die bandwidth using high-density PAM4 SerDes signaling.
* **Direct Peer-to-Peer (P2P) Memory Interconnect**: A hardware memory protocol that maps the local High-Bandwidth Memory (HBM) of multiple accelerator dies into a single, unified globally-addressable physical address space, allowing one accelerator's execution engines to read or write remote GPU memory directly across scale-up links with sub-microsecond latency ($0.5\text{ }\mu\text{s}$) and zero host CPU intervention.
