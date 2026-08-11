content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/04-gpu-virtualization-translation/02-hardware-multi-instance-partitioning.md
# Multi-Instance GPU Architecture and Hardware Spatial Partitioning Mechanics

## The Noisy Neighbor Crisis and Multi-Tenant Memory Interference

In enterprise data centers and cloud computing platforms, high-end graphics processing units (GPUs) are massive, expensive hardware investments. A modern enterprise GPU die contains over 100 Streaming Multiprocessors (SMs), tens of thousands of parallel execution cores, dozens of shared Level 2 (L2) cache partitions, and up to 80 Gigabytes or 192 Gigabytes of high-bandwidth memory (HBM) delivering terabytes of data bandwidth per second. 

However, many real-world enterprise software workloads—such as real-time AI microservice inference, video stream transcoding, computer vision filtering, or interactive development environments—do not require the full computational power or memory capacity of an entire multi-terabyte GPU die. A single inference service might need only $10\%\text{ to } 20\%$ of the GPU's total execution capacity.

To maximize financial efficiency and cloud hardware utilization, data center operators attempt to run multiple independent software applications (**Multi-Tenancy**) on the exact same physical GPU die simultaneously.

In traditional GPU software virtualization (such as Time-Slicing or CUDA Multi-Process Service / MPS), multiple tenant applications share the GPU's hardware resources flexibly through software scheduling:

```text
TRADITIONAL TIME-SLICED / SOFTWARE MULTI-TENANCY (NO HARDWARE ISOLATION)

 Shared GPU Die (Tenant A and Tenant B Share All Hardware Logic)
 ┌─────────────────────────────────────────────────────────────┐
 │ Tenant A (Heavy Matrix Math)  │ Tenant B (Real-Time AI)     │
 ├───────────────────────────────┴─────────────────────────────┤
 │ Shared L2 Cache Slices (0..15) & Shared HBM Memory Channels │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         INTERFERENCE & SECURITY CRISIS (NOISY NEIGHBOR EFFECT!)
         Tenant A floods shared L2 cache -> Tenant B suffers 10x latency spikes!
```

Look at the severe physical and security failures that occur when multiple tenant applications share a GPU die without hardware-enforced isolation:

### 1. The Noisy Neighbor Interference Crisis (QoS Breakdown)
When Tenant A (a heavy matrix multiplication algorithm) and Tenant B (a real-time AI inference service with a strict $5\text{-millisecond}$ response deadline) run on the same GPU die:
* Tenant A's threads generate millions of global memory read requests per second, flooding the shared L2 cache partitions and HBM memory channels.
* Tenant A's data lines **evict Tenant B's active cache lines** from the shared L2 cache!
* When Tenant B attempts to read its memory, its requests miss in the L1 and L2 caches, forcing Tenant B to wait hundreds of clock cycles for off-chip DRAM line fills.
* Tenant B's execution latency spikes by **$500\%\text{ to } 1,000\%$**, violating its real-time Quality of Service (QoS) contract, simply because of Tenant A's memory activity!

### 2. Physical Cross-Tenant Security Leaks (Side-Channel Vulnerabilities)
When Tenant A and Tenant B share physical L2 cache slices, crossbar interconnect wires, and power distribution networks:
* Malicious Tenant A can execute timing-attack algorithms (such as `Flush+Reload` or `Prime+Probe`) to measure the precise clock-cycle delays required to access L2 cache lines.
* By observing when L2 cache lines are evicted or when memory bus channels experience contention, Tenant A can **reconstruct secret cryptographic keys or extract proprietary AI model weights** belonging to Tenant B!
* Software-level sandbox boundaries cannot prevent side-channel leaks occurring on shared physical silicon wires.

### 3. Fault Propagation and Crash Cascade
If Tenant A's software code contains a bug that triggers an illegal memory access or an un-recoverable hardware fault:
* Because the GPU's memory controllers and execution engines are shared, clearing the fault requires resetting the entire Streaming Multiprocessor complex or restarting the GPU driver.
* **Tenant B's running service is forcibly terminated and crashed**, even though Tenant B's code was $100\%$ bug-free!

We are trapped in an architectural dilemma:
* Running one small application per $10,000 GPU wastes $80\%+$ of the chip's compute and memory capacity, creating immense financial waste.
* Sharing a GPU die using software time-slicing or MPS causes severe memory bandwidth interference, destroys real-time latency guarantees, and exposes multi-tenant workloads to side-channel security leaks.

How can a single physical GPU die be partitioned into multiple smaller, completely independent GPU instances that guarantee **$100\%$ deterministic memory bandwidth, zero cache interference, zero side-channel security leaks, and complete hardware fault isolation**?

To solve this multi-tenancy virtualization crisis, modern GPU microarchitectures implement **Multi-Instance GPU (MIG) Architecture** and **Hardware Spatial Partitioning**.

---

## The Shared Apartment Building and the Soundproof Duplex Units: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Multi-Instance GPU architecture, hardware spatial partitioning, and Quality of Service (QoS) isolation before inspecting silicon partition maps, memory crossbar isolation circuits, and bandwidth equations, let us consider an everyday analogy: **The Luxury Office Building**.

Imagine a massive commercial skyscraper (**A High-End GPU Die**) containing **70 office rooms** (**70 Streaming Multiprocessors / SMs**), a giant central water supply system (**16 L2 Cache Slices**), and a central water main pipe connected to the city reservoir (**8 High-Bandwidth HBM Memory Channels**).

```text
THE COMMERCIAL SKYSCRAPER ANALOGY

 Scenario A: Open Open-Plan Office Space (Software Multi-Tenancy / Time-Slicing)
 ┌─────────────────────────────────────────────────────────────┐
 │ All 70 rooms and water pipes are shared with open doors.    │
 │ Tenant A runs a car wash in Room 1 (uses 95% of water!).    │
 │ Tenant B tries to run a dentist clinic in Room 2.          │
 │ Water pressure drops to zero! Tenant B cannot wash tools!  │
 └─────────────────────────────────────────────────────────────┘
  (Tenant A ruins Tenant B's business! Zero noise or water isolation!)

 Scenario B: Soundproof Duplex Suites with Private Plumbing (Hardware Spatial Partitioning / MIG)
 ┌───────────────────────────┬───────────────────────────┐
 │ Instance 1 (Suite A)      │ Instance 2 (Suite B)      │
 │ 35 Private Rooms (SMs)    │ 35 Private Rooms (SMs)    │
 │ 8 Private Water Tanks     │ 8 Private Water Tanks     │
 │ 4 Private Water Main Pipes│ 4 Private Water Main Pipes│
 └───────────────────────────┴───────────────────────────┘
  (100% physically isolated! Tenant A can NEVER affect Tenant B!)
```

The building manager wants to rent space to two different businesses:
* **Tenant A**: A heavy industrial car wash company (**Heavy AI Matrix Training**).
* **Tenant B**: A high-end dental surgery clinic (**Real-Time AI Microservice**).

Let us observe two different architectural designs for how the building manager organizes the skyscraper:

---

### Design 1: The Open-Plan Shared Floor (Software Multi-Tenancy)
The building manager leaves all doors open and lets both businesses use all 70 rooms and the shared water pipes freely.

Look at the physical disaster that unfolds:
1. **Water Pressure Collapse**: Tenant A turns on 50 high-pressure water hoses to wash cars.
2. Tenant A consumes $95\%$ of the building's total water flow.
3. In Room 2, the dentist (Tenant B) attempts to turn on a water tool to perform surgery on a patient.
4. **Water pressure drops to zero!** The dentist's tool stops working because Tenant A is using all the water!
5. **Eavesdropping**: Tenant A's workers walk past the dentist's open door and overhear confidential patient conversations (**Security Side-Channel Leak**).
6. **Fire Outbreak**: Tenant A accidentally starts a grease fire in Room 1. The fire department shuts off water to the entire building, forcing the dentist to cancel all surgeries (**Fault Propagation**)!

This is the exact analogue of **Software Multi-Tenancy Interference**.

---

### Design 2: Soundproof Duplex Suites with Private Plumbing (Multi-Instance GPU / MIG)
The building manager replaces the open floor plan with **Hardware Spatial Partitioning (MIG)**.

The manager erects thick concrete, soundproof firewall partitions through the building, dividing the skyscraper into two completely separate, independent **Duplex Suites**:

* **Duplex Suite 1 (Instance A)**: Contains 35 rooms (SMs), 8 dedicated water storage tanks (L2 Cache Slices), and 4 dedicated water main pipes (Memory Channels).
* **Duplex Suite 2 (Instance B)**: Contains 35 rooms (SMs), 8 dedicated water storage tanks (L2 Cache Slices), and 4 dedicated water main pipes (Memory Channels).

```text
HARDWARE SPATIAL ISOLATION IN DUPLEX SUITES

 Duplex Suite 1 (Instance A)             Duplex Suite 2 (Instance B)
 ┌───────────────────────────┐           ┌───────────────────────────┐
 │ 35 Rooms (SMs)            │           │ 35 Rooms (SMs)            │
 │ 8 Storage Tanks (L2)      │  CONCRETE │ 8 Storage Tanks (L2)      │
 │ 4 Main Pipes (HBM)        │ FIREWALL  │ 4 Main Pipes (HBM)        │
 │ [ Car Wash Company ]      │ PARTITION │ [ Dental Clinic ]         │
 └─────────────┬─────────────┘           └─────────────┬─────────────┘
               │                                       │
               ▼                                       ▼
  100% Water Flow Guaranteed!             100% Water Flow Guaranteed!
```

Trace how Design 2 operates:
1. **$100\%$ Guaranteed Water Flow**: Tenant A turns on all 50 high-pressure car wash hoses in Suite 1.
   * Tenant A consumes $100\%$ of **Suite 1's water pipes**.
   * But Tenant A's pipes have **ZERO PHYSICAL CONNECTION** to Suite 2's water pipes!
   * In Suite 2, the dentist turns on their tool. Water pressure is **$100\%$ perfect and rock-solid**! The dentist performs surgery with zero latency spikes!
2. **Zero Eavesdropping**: Thick concrete firewalls prevent Tenant A from ever overhearing or inspecting Tenant B's space.
3. **Fire Containment**: If a fire breaks out in Suite 1, the concrete firewall contains the damage to Suite 1. Suite 2 continues operating normally!

This soundproof duplex suite design is the exact physical analogue of **Multi-Instance GPU (MIG) Architecture**:
* The skyscraper is the **Physical GPU Silicon Die**.
* The 70 office rooms are **70 Streaming Multiprocessors (SMs)**.
* The water storage tanks are **L2 Cache Partitions / Slices**.
* The main water pipes are **Off-Chip HBM DRAM Memory Channels**.
* The concrete firewalls are **Hardware Spatial Isolation Circuits**.
* The duplex suites are **Multi-Instance GPU (MIG) Instances**.
* Guaranteed water pressure is **Deterministic Quality of Service (QoS) Memory Bandwidth**.

---

## Primitive 1: Multi-Instance GPU (MIG) Architecture

Now that we possess a clear intuitive mental model of soundproof duplex suites and private plumbing, let us examine the formal, rigorous engineering mechanics of **Multi-Instance GPU (MIG) Architecture**.

> **A Multi-Instance GPU (MIG)** is a hardware-enforced GPU virtualization architecture where a monolithic GPU die is physically partitioned into up to $N$ independent, hardware-isolated GPU instances, where each instance is assigned its own dedicated, non-overlapping subset of Streaming Multiprocessors (SMs), L2 cache slices, memory controllers, crossbar interconnect paths, and DMA engines.

```text
MONOLITHIC GPU VS MULTI-INSTANCE GPU (MIG) HARDWARE MAPPING

 Monolithic GPU (Un-Partitioned Die)
 ┌─────────────────────────────────────────────────────────────┐
 │ 56 SMs | 16 L2 Cache Slices | 8 HBM Memory Channels         │
 │ (All resources shared flexibly by all running software)     │
 └─────────────────────────────────────────────────────────────┘

 Multi-Instance GPU Partitioned (7 Hardware Instances)
 ┌──────────┬──────────┬──────────┬──────────┬───┬──────────┐
 │ Instance │ Instance │ Instance │ Instance │...│ Instance │
 │  0 (1g)  │  1 (1g)  │  2 (1g)  │  3 (1g)  │   │  6 (1g)  │
 ├──────────┼──────────┼──────────┼──────────┼───┼──────────┤
 │ 8 SMs    │ 8 SMs    │ 8 SMs    │ 8 SMs    │...│ 8 SMs    │
 │ 2 L2 Slices│ 2 L2 Sl.│ 2 L2 Sl. │ 2 L2 Sl. │   │ 2 L2 Sl. │
 │ 1 HBM Ch.│ 1 HBM Ch.│ 1 HBM Ch.│ 1 HBM Ch.│   │ 1 HBM Ch.│
 └──────────┴──────────┴──────────┴──────────┴───┴──────────┘
  (7 Completely Independent GPUs Fabricated on 1 Single Silicon Die!)
```

---

### Standard MIG Instance Profiles

In modern enterprise GPUs (such as the NVIDIA A100, H100, and Blackwell architectures), the hardware supports standardized **GPU Instance Profiles**.

Instance profile names describe the hardware resources allocated to each instance:
$$\text{Profile Syntax: } \mathbf{\{G\}\text{g}.\mathbf{\{M\}\text{gb}}}$$
Where $\{G\}$ is the number of GPU Compute Slices (SM clusters) and $\{M\}$ is the volume of dedicated HBM physical memory in Gigabytes.

```text
STANDARD MIG INSTANCE PROFILE BREAKDOWN (80-GB GPU DIE)

 Instance Profile │ Active SMs │ L2 Cache Slices │ Dedicated HBM Memory │ Max Instances / GPU
──────────────────┼────────────┼─────────────────┼──────────────────────┼─────────────────────
 1g.10gb          │   7 SMs    │  2 L2 Slices    │  10 Gigabytes HBM    │ 7 Instances
 2g.20gb          │  14 SMs    │  4 L2 Slices    │  20 Gigabytes HBM    │ 3 Instances
 3g.40gb          │  28 SMs    │  8 L2 Slices    │  40 Gigabytes HBM    │ 2 Instances
 7g.80gb (Full)   │  56 SMs    │ 16 L2 Slices    │  80 Gigabytes HBM    │ 1 Instance
```

#### Key Microarchitectural Property of MIG Instances:
When a 7-instance configuration ($7 \times \text{1g.10gb}$) is activated:
* The operating system and user applications observe **7 completely separate, distinct physical GPUs** (e.g., `/dev/nvidia0` through `/dev/nvidia6`).
* Each instance runs its own independent GPU driver instance, its own CUDA memory allocators, and its own execution queues.
* To software, it is physically indistinguishable from having 7 small standalone GPUs plugged into separate PCIe slots!

---

## Primitive 2: Hardware Spatial Partitioning

Now let us examine the second core primitive: **Hardware Spatial Partitioning**.

How does the GPU hardware enforce complete physical isolation between MIG instances at the silicon gate level?

**Hardware Spatial Partitioning** operates by physically dividing three major hardware sub-systems across the GPU die:
1. **Compute Execution Partitioning (SM Clusters)**
2. **Memory Subsystem Partitioning (L2 Slices & HBM Controllers)**
3. **Interconnect & DMA Engine Partitioning (Crossbar Isolation)**

```text
HARDWARE SPATIAL PARTITIONING GATE-LEVEL ISOLATION

 ┌─────────────────────────────────────────────────────────────┐
 │ GPU SILICON DIE                                             │
 │                                                             │
 │   MIG INSTANCE 0 (HARDWARE ISOLATED)                        │
 │   ┌─────────────────┐  ┌─────────────────┐                  │
 │   │ SM Cluster 0    │  │ L2 Cache Slice 0│                  │
 │   │ (7 SMs)         │  │ (512 KB SRAM)   │                  │
 │   └────────┬────────┘  └────────┬────────┘                  │
 │            │ Dedicated          │ Dedicated                 │
 │            ▼ Crossbar Path      ▼ Memory Bus                │
 │   ┌──────────────────────────────────────┐                  │
 │   │ Dedicated HBM Memory Controller 0    │                  │
 │   └──────────────────┬───────────────────┘                  │
 │                      │ Physical HBM Wires                   │
 │                      ▼                                      │
 │   ┌──────────────────────────────────────┐                  │
 │   │ Dedicated HBM Memory Stacks (10 GB)  │                  │
 │   └──────────────────────────────────────┘                  │
 └─────────────────────────────────────────────────────────────┘
  (HARDWARE SWITCHES PREVENT ANY OTHER INSTANCE FROM TOUCHING THIS PATH!)
```

---

### 1. Compute Execution Partitioning (SM Cluster Isolation)

The Streaming Multiprocessors on the GPU die are grouped into physical **GPU Processing Clusters (GPCs)**.

When a MIG instance is created:
* Specific GPCs or individual SMs are hardwired to the instance's private instruction dispatch logic.
* Workloads executing on Instance 0 are **physically incapable of issuing instructions to SMs assigned to Instance 1**.
* If a thread block on Instance 0 enters an infinite execution loop, **only Instance 0's SMs are affected**. Instance 1's SMs continue executing at $100\%$ full speed!

---

### 2. Memory Subsystem Partitioning (L2 Cache & HBM Isolation)

This is the most important hardware partitioning layer. To eliminate the Noisy Neighbor effect, the shared L2 cache and off-chip memory channels are physically partitioned:

#### A. L2 Cache Slice Allocation:
* The $16\text{ MB}$ or $32\text{ MB}$ shared L2 cache is divided into $N_{\text{slices}}$ independent physical SRAM partitions.
* For a 7-instance MIG configuration, each instance receives **2 dedicated L2 cache slices** ($1\text{ MB}$ to $2\text{ MB}$ of private L2 SRAM).
* **Zero Cache Line Sharing**: Instance 0's memory requests can read and write *only* its assigned 2 L2 slices. Instance 0 cannot evict or inspect cache lines in Instance 1's L2 slices!

#### B. HBM Memory Channel Allocation:
* The off-chip High-Bandwidth Memory (HBM) system consists of 8 independent physical $1024\text{-bit}$ memory channels.
* In a 7-instance configuration, each MIG instance is assigned its own **dedicated physical HBM memory controller and physical DRAM stacks** ($10\text{ GB}$ of private HBM memory).
* **Guaranteed Memory Bandwidth**: Instance 0 has exclusive, un-contended access to its dedicated HBM channel, delivering deterministic, $100\%$ reproducible memory read/write bandwidth!

```text
MEMORY BANDWIDTH ISOLATION IN MIG

 Memory Channel 0 ──► Dedicated to MIG Instance 0 ──► Guaranteed 200 GB/sec!
 Memory Channel 1 ──► Dedicated to MIG Instance 1 ──► Guaranteed 200 GB/sec!
 Memory Channel 2 ──► Dedicated to MIG Instance 2 ──► Guaranteed 200 GB/sec!
 (Instance 0 flooding its channel has ZERO impact on Instance 1 or 2!)
```

---

### 3. Interconnect & DMA Engine Partitioning (Crossbar Isolation)

To route memory request packets between an instance's SMs and its assigned L2 cache slices without cross-tenant interference:
* The $M \times N$ Crossbar Interconnect matrix uses **Hardware Crosspoint Isolation Filters**.
* Crossbar switches are configured such that routing paths between Instance 0's SMs and Instance 1's L2 slices are **physically disabled in hardware**.
* Dedicated **Asynchronous Memory Copy Engines (DMA)** and hardware engines are assigned exclusively to each instance.

---

## Four Engineering Benefits of Hardware Spatial Partitioning

By enforcing spatial isolation at the silicon gate level, Multi-Instance GPU architecture delivers four critical enterprise engineering guarantees:

```text
THE FOUR GUARANTEES OF HARDWARE SPATIAL PARTITIONING

 1. Deterministic Latency & Bandwidth (QoS)
 ─────────► Memory bandwidth is 100% predictable. Zero Noisy Neighbor slowdowns!

 2. Hard Multi-Tenant Security Isolation
 ─────────► Zero shared caches/wires -> Eliminates Flush+Reload side-channel leaks!

 3. Fault Containment & Reliability
 ─────────► Software crash in Instance 0 stays inside Instance 0! Instance 1 runs safely.

 4. Maximum Infrastructure Utilization
 ─────────► 1 giant GPU hosts 7 independent production workloads simultaneously!
```

### 1. Deterministic Quality of Service (QoS)
In real-time AI applications (such as autonomous vehicle perception or real-time voice translation), response latency must be guaranteed (e.g., $t_{\text{latency}} \le 5.0\text{ ms}$). 

Under software time-slicing, a noisy neighbor could cause latency to spike to $50.0\text{ ms}$. Under MIG, **memory latency is $100\%$ deterministic and predictable**, guaranteeing QoS compliance!

### 2. Elimination of Side-Channel Security Leaks
Because L1 caches, L2 cache slices, crossbar paths, and memory controllers are physically disjoint ($\text{Slices}_{\text{Inst0}} \cap \text{Slices}_{\text{Inst1}} = \emptyset$), a malicious tenant in Instance 0 **cannot measure cache line timing or power fluctuations in Instance 1**, eliminating hardware side-channel attacks (`Flush+Reload`, `Prime+Probe`).

### 3. Fault Containment
If a buggy algorithm or out-of-bounds memory access triggers an un-handled kernel exception in Instance 0:
* The GPU driver resets **ONLY Instance 0's hardware blocks**.
* Instances 1 through 6 continue executing their production workloads with **zero interruption**!

---

## Solved Industrial Engineering Exercise: Quantitative MIG Instance Allocation, Memory Bandwidth Guarantee, and QoS Isolation Analysis

To consolidate your complete mastery of Multi-Instance GPU architecture, hardware spatial partitioning, L2 slice allocations, HBM bandwidth guarantees, and Quality of Service (QoS) deterministic latency math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal cloud infrastructure architect designing a multi-tenant AI inference platform on a $2.0\text{ GHz}$ enterprise GPU die ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The physical GPU die contains:
* **70 Streaming Multiprocessors (SMs)**.
* **14 Physical L2 Cache Slices** ($1\text{ MB}$ per slice, $14\text{ MB}$ total L2 capacity).
* **7 Independent High-Bandwidth Memory (HBM) Controllers** ($10\text{ GB}$ HBM per controller, $70\text{ GB}$ total HBM capacity).
* Peak HBM Memory Bandwidth = $1,400\text{ Gigabytes/second}$ ($200\text{ GB/sec}$ per HBM controller).

```text
2.0 GHz ENTERPRISE GPU DIE SPECIFICATIONS

 Compute Hardware  : 70 SMs (7,000 CUDA Cores)
 L2 Cache Hardware : 14 L2 Cache Slices (14 MB Total)
 Memory Hardware   : 7 HBM Controllers (70 GB Total, 1,400 GB/sec Peak Bandwidth)
```

#### Workload Requirements:
Two enterprise customers rent space on this GPU:
* **Customer A (Heavy Offline AI Training)**: Requires a large compute allocation to train a neural network model.
* **Customer B (Real-Time Financial Inference Service)**: Executes real-time option pricing queries with a strict Quality of Service SLA requirement: **Average memory read access latency MUST remain below $15.0\text{ nanoseconds}$** ($30\text{ CPU clock cycles}$).

#### System Virtualization Options to Compare:
* **Option 1 (Software Time-Slicing / MPS — Un-Partitioned GPU)**:
  * Customer A and Customer B share all 70 SMs, 14 L2 slices, and 7 HBM channels.
  * Customer A's heavy training workload generates an L2 cache miss rate of $80\%$, flooding the shared L2 slices and memory channels.
  * Customer B's L2 hit rate drops from $90\%$ down to $20\%$ due to cache line eviction by Customer A.
  * L2 Hit Latency = $6.0\text{ ns}$ ($12\text{ cycles}$). HBM Miss Latency = $40.0\text{ ns}$ ($80\text{ cycles}$).
* **Option 2 (Hardware Spatial Partitioning — 2x MIG Instances: 3g.30gb and 4g.40gb)**:
  * **Instance A (4g.40gb)**: Allocated 40 SMs, 8 L2 Slices ($8\text{ MB}$), and 4 HBM Controllers ($40\text{ GB}$, $800\text{ GB/sec}$ bandwidth).
  * **Instance B (3g.30gb)**: Allocated 30 SMs, 6 L2 Slices ($6\text{ MB}$), and 3 HBM Controllers ($30\text{ GB}$, $600\text{ GB/sec}$ bandwidth).
  * Customer B runs exclusively in Instance B. Customer B's L2 hit rate remains rock-solid at **$90.0\%$**.

#### Your Objective

1. Calculate Customer B's Average Memory Access Time ($\text{AMAT}_{\text{Option1}}$) under **Option 1 (Software Time-Slicing / MPS)**, and determine if Customer B violates its $15.0\text{-ns}$ SLA contract.
2. Calculate Customer B's Average Memory Access Time ($\text{AMAT}_{\text{Option2}}$) under **Option 2 (MIG Hardware Spatial Partitioning)**, and determine if Customer B satisfies its $15.0\text{-ns}$ SLA contract.
3. Calculate the guaranteed HBM memory bandwidth (in GB/sec) dedicated exclusively to Customer A and Customer B under Option 2.
4. Calculate Customer B's **Memory Access Latency Reduction Factor** achieved by switching from Option 1 to Option 2.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Customer B's Performance under Option 1 (Software Time-Slicing / MPS)

Under Option 1, Customer A and Customer B share the L2 cache and HBM memory channels without hardware spatial isolation.

* Customer A's heavy memory activity causes Customer B's L2 cache hit rate to drop to $h_{\text{L2\_B}} = 20.0\%\quad (0.20)$.
* Customer B's L2 miss rate = $1 - 0.20 = \mathbf{80.0\%} \quad (0.80)$.
* L2 Hit Latency $T_{\text{L2\_hit}} = 6.0\text{ ns}$ ($12\text{ clock cycles}$).
* HBM Read Latency $T_{\text{HBM\_miss}} = 40.0\text{ ns}$ ($80\text{ clock cycles}$).

##### 1. Calculate Customer B's AMAT under Option 1 ($\text{AMAT}_{\text{Option1}}$):

$$\text{AMAT}_{\text{Option1}} = T_{\text{L2\_hit}} + (\text{Miss Rate} \times T_{\text{HBM\_miss}})$$

$$\text{AMAT}_{\text{Option1}} = 6.0\text{ ns} + (0.80 \times 40.0\text{ ns}) = 6.0\text{ ns} + 32.0\text{ ns} = \mathbf{38.0 \text{ nanoseconds}}$$

##### Express in Clock Cycles ($T_{\text{clk}} = 0.500\text{ ns}$):

$$\text{AMAT}_{\text{Option1\_cycles}} = \frac{38.0\text{ ns}}{0.500\text{ ns/cycle}} = \mathbf{76 \text{ Clock Cycles}}$$

##### 2. Evaluate SLA Contract Compliance:
* Customer B's SLA Target: $\text{AMAT} \le 15.0\text{ ns}$.
* Actual AMAT under Option 1: $\text{AMAT}_{\text{Option1}} = 38.0\text{ ns}$.

$$\mathbf{38.0 \text{ ns}} > 15.0 \text{ ns} \quad (\mathbf{\text{SLA CONTRACT VIOLATED! Customer B suffers 253\% latency overload!}})$$

Software time-slicing caused Customer B to violate its SLA contract due to noisy neighbor memory interference from Customer A!

---

#### Step 2: Analyze Customer B's Performance under Option 2 (MIG Hardware Spatial Partitioning)

Under Option 2, Customer B runs inside dedicated **Instance B (3g.30gb)** with 6 private L2 cache slices and 3 private HBM controllers.

* Customer A has **zero access** to Instance B's L2 slices.
* Customer B's L2 cache hit rate remains protected at $h_{\text{L2\_B}} = 90.0\%\quad (0.90)$.
* Customer B's L2 miss rate = $1 - 0.90 = \mathbf{10.0\%} \quad (0.10)$.

##### 1. Calculate Customer B's AMAT under Option 2 ($\text{AMAT}_{\text{Option2}}$):

$$\text{AMAT}_{\text{Option2}} = T_{\text{L2\_hit}} + (\text{Miss Rate} \times T_{\text{HBM\_miss}})$$

$$\text{AMAT}_{\text{Option2}} = 6.0\text{ ns} + (0.10 \times 40.0\text{ ns}) = 6.0\text{ ns} + 4.0\text{ ns} = \mathbf{10.0 \text{ nanoseconds}}$$

##### Express in Clock Cycles ($T_{\text{clk}} = 0.500\text{ ns}$):

$$\text{AMAT}_{\text{Option2\_cycles}} = \frac{10.0\text{ ns}}{0.500\text{ ns/cycle}} = \mathbf{20 \text{ Clock Cycles}}$$

##### 2. Evaluate SLA Contract Compliance:
* Customer B's SLA Target: $\text{AMAT} \le 15.0\text{ ns}$.
* Actual AMAT under Option 2: $\text{AMAT}_{\text{Option2}} = 10.0\text{ ns}$.

$$\mathbf{10.0 \text{ ns}} < 15.0 \text{ ns} \quad (\mathbf{\text{SLA CONTRACT SATISFIED! 5.0 ns timing margin achieved!}})$$

Hardware spatial partitioning brought Customer B back into full SLA compliance with a $5.0\text{-ns}$ safety margin!

---

#### Step 3: Calculate Guaranteed Dedicated HBM Memory Bandwidth under Option 2

Each HBM controller delivers $200\text{ GB/sec}$ of peak memory bandwidth.

##### 1. Customer A (Instance A: 4g.40gb — 4 HBM Controllers):

$$\text{BW}_{\text{InstanceA}} = 4 \text{ HBM Controllers} \times 200 \text{ GB/sec/controller} = \mathbf{800.0 \text{ GB/sec Guaranteed!}}$$

##### 2. Customer B (Instance B: 3g.30gb — 3 HBM Controllers):

$$\text{BW}_{\text{InstanceB}} = 3 \text{ HBM Controllers} \times 200 \text{ GB/sec/controller} = \mathbf{600.0 \text{ GB/sec Guaranteed!}}$$

$$\text{Total System Bandwidth Check} = 800.0 + 600.0 = \mathbf{1,400.0 \text{ GB/sec}} \quad (100\%\text{ GPU HBM Bandwidth Allocated})$$

---

#### Step 4: Calculate Memory Access Latency Reduction Factor

Let us calculate the performance gain experienced by Customer B when moving from Option 1 to Option 2:

$$\text{Latency Reduction Factor} = \frac{\text{AMAT}_{\text{Option1}}}{\text{AMAT}_{\text{Option2}}} = \frac{38.0\text{ ns}}{10.0\text{ ns}} = \frac{76\text{ cycles}}{20\text{ cycles}} = \mathbf{3.80\times \text{ Latency Reduction!}}$$

$$\text{Percentage Latency Reduction} = \left( 1 - \frac{10.0\text{ ns}}{38.0\text{ ns}} \right) \times 100\% = \mathbf{73.68\% \text{ Latency Cut!}}$$

```text
MIG VIRTUALIZATION PERFORMANCE OPTIMIZATION SUMMARY

 Virtualization Option      │ Customer B L2 Hit Rate │ Customer B AMAT │ SLA Compliance │ Guaranteed Bandwidth
────────────────────────────┼────────────────────────┼─────────────────┼────────────────┼──────────────────────
 Option 1 (MPS Time-Slice)  │ 20.0% (Interference)   │ 38.0 ns (76c)   │ VIOLATED!      │ Un-predictable
 Option 2 (MIG Hardware)    │ 90.0% (Isolated!)      │ 10.0 ns (20c)   │ SATISFIED!     │ 600.0 GB/sec (100%)
                            │ (+70.0% Hit Gain)      │ (73.7% Cut!)    │ (3.80x Faster!)│ (Deterministic QoS)
```

##### Engineering Conclusion:
By activating Multi-Instance GPU (MIG) hardware spatial partitioning, Customer B's average memory access latency was reduced from $38.0\text{ ns}$ down to $10.0\text{ ns}$—a **$3.80\times$ latency reduction ($73.68\%$ latency cut)** that completely eliminated noisy neighbor interference and restored $100\%$ SLA contract compliance!

---

### Sanity Check and Verification

Let us verify our mathematical and physical hardware results against GPU microarchitecture principles:

1. **Hardware Resource Partitioning Check**:
   * Total SMs: $40\text{ (Inst A)} + 30\text{ (Inst B)} = 70\text{ SMs}$. $100\%$ allocated.
   * Total L2 Slices: $8\text{ (Inst A)} + 6\text{ (Inst B)} = 14\text{ Slices}$. $100\%$ allocated.
   * Total HBM Controllers: $4\text{ (Inst A)} + 3\text{ (Inst B)} = 7\text{ Controllers}$. $100\%$ allocated.
   * Zero un-allocated or overlapping hardware resources!
2. **QoS Isolation Verification**:
   * In Option 2, Instance B's L2 cache slices ($6\text{ MB}$) are physically isolated. Customer A cannot issue a single read or write command to Instance B's L2 slices.
   * Customer B's L2 hit rate ($90\%$) is mathematically protected from external eviction.
3. **AMAT Cycle Conversion Check**:
   * At $2.0\text{ GHz}$ ($T_{\text{clk}} = 0.500\text{ ns}$): $38.0\text{ ns} / 0.500\text{ ns} = 76\text{ cycles}$.
   * $10.0\text{ ns} / 0.500\text{ ns} = 20\text{ cycles}$. Latency conversion is $100\%$ exact.

All instance allocation profiles, hardware spatial isolation boundaries, HBM bandwidth guarantees, and SLA latency metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Multi-Instance GPU (MIG)**: A hardware-enforced GPU virtualization architecture that physically partitions a monolithic GPU silicon die into up to 7 independent GPU instances, assigning non-overlapping subsets of Streaming Multiprocessors, L2 cache slices, and HBM memory channels to each instance.
* **Hardware Spatial Partitioning**: The silicon-level isolation technique that restricts memory crossbar paths, L2 cache partitions, and physical memory controllers to dedicated instances, guaranteeing $100\%$ deterministic Quality of Service (QoS), zero multi-tenant memory interference, zero side-channel security leaks, and complete hardware fault containment.
