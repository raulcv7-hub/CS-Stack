---
title: "NUMA Node Latency Asymmetry and Non-Uniform Memory Access Mechanics"
---

# NUMA Node Latency Asymmetry and Non-Uniform Memory Access Mechanics

## The Centralized Bus Wiring Wall and the Uniform Access Collapse

In early multi-processor computer systems, server architectures were built around a centralized memory interconnect model known as **Uniform Memory Access (UMA)** or **Symmetric Multiprocessing (SMP)**. 

In a UMA architecture, multiple central processing unit (CPU) sockets are connected to a single, centralized external memory controller over a shared system memory bus. Because every CPU socket sits at an identical physical electrical distance from the central memory controller, every processor core observes the **exact same memory read and write latency** regardless of which physical memory module is accessed.

```text
UNIFORM MEMORY ACCESS (UMA / SMP) BUS ARCHITECTURE

 Socket 0 (Core 0..3)   Socket 1 (Core 4..7)   Socket 2 (Core 8..11)
 ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
 │ Local Caches     │   │ Local Caches     │   │ Local Caches     │
 └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
          │                      │                      │
 ═════════╧══════════════════════╧══════════════════════╧════════════
                  SHARED SYSTEM MEMORY BUS
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Centralized Memory Controller│
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Central Main Memory (DRAM)   │
              └──────────────────────────────┘
 (All CPU Sockets share 1 central bus; 100% Equal Access Latency!)
```

While UMA provided a simple, uniform programming model for early 2-socket and 4-socket servers, it encountered an insurmountable physical scaling barrier as processor core counts expanded: **The Centralized Interconnect Bus Wiring Wall**.

Let us examine the physical liabilities that cause UMA architectures to collapse when scaled to 8, 16, or 32 CPU sockets:

1. **Physical Pin Density and Circuit Board Trace Congestion**: Wiring dozens of CPU sockets to a single central memory controller requires routing thousands of parallel copper traces across the motherboard. Printed circuit board (PCB) real estate becomes completely saturated, causing severe electrical crosstalk and signal reflection.
2. **Central Controller Bottleneck**: A single memory controller can process only a limited number of memory commands per nanosecond. When 64 or 128 execution cores dispatch simultaneous memory load and store requests to a single central controller, the controller's command queues overflow, and bus arbitration stalls freeze the processor cores.
3. **Capacitive Bus Loading**: Connecting dozens of processor sockets to the same physical memory bus wires adds immense electrical parasitic capacitance. Driving high-capacitance wires forces the system to lower the memory bus clock frequency, severely degrading system memory bandwidth.

To break through the Centralized Bus Wiring Wall and scale multi-socket server systems to hundreds of execution cores, computer hardware architects abandoned centralized UMA architectures in favor of **Non-Uniform Memory Access (NUMA)**.

In a **Non-Uniform Memory Access (NUMA)** architecture, main memory is no longer centralized in one location. Instead, physical DRAM memory is **distributed directly across the CPU sockets**.

Each CPU socket—referred to as a **NUMA Node**—contains its own integrated execution cores, its own private cache hierarchy, and its own **integrated local memory controller** connected directly to local DRAM channels:

```text
NON-UNIFORM MEMORY ACCESS (NUMA) DISTRIBUTED TOPOLOGY

 NUMA NODE 0 (Socket 0)                     NUMA NODE 1 (Socket 1)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Core 0..3 + L1/L2 Caches  │              │ Core 4..7 + L1/L2 Caches  │
 ├───────────────────────────┤              ├───────────────────────────┤
 │ Integrated Controller 0   │              │ Integrated Controller 1   │
 └─────────────┬─────────────┘              └─────────────┬─────────────┘
               │                                          │
               ▼                                          ▼
   Local DRAM 0 (40 ns)                       Local DRAM 1 (40 ns)
               │                                          │
               └────────── Interconnect Link ─────────────┘
                           (120 ns Remote Latency)
```

Look at the physical hardware structure of NUMA:
* **Local Memory Access**: When Core 0 (on NUMA Node 0) reads data from DRAM connected directly to Node 0's local memory controller, the access is ultra-fast, taking only **$40\text{ to } 50\text{ nanoseconds}$**.
* **Remote Memory Access**: When Core 0 needs to read data from DRAM connected to Node 1's memory controller (across the hall), Core 0 cannot access Node 1's DRAM directly! Core 0 must transmit a request packet across a high-speed point-to-point interconnect link (such as Intel UPI or AMD Infinity Fabric), hop through Node 1's uncore logic, and query Node 1's memory controller, taking **$110 \text{ to } 150\text{ nanoseconds}$**!

This physical disparity between local and remote memory access speeds is called **NUMA Node Latency Asymmetry**.

Remote memory accesses take **$2\times \text{to } 3.5\times$ longer** than local memory accesses!

If a software operating system or multi-threaded application is unaware of NUMA topology and randomly allocates memory pages or migrates threads across remote sockets, application performance degrades dramatically. Software thread execution freezes, blocked by remote memory latency penalties.

To design high-throughput multi-socket systems and optimize concurrent software, computer engineers must master the physical mechanics of NUMA topology architectures, point-to-point interconnect link hops, local versus remote latency ratios ($R_{\text{NUMA}}$), and OS page allocation strategies.


### Model 1: Centralized Mega-Archive (Uniform Access / UMA Model)

The state government builds one single, giant **Central Archive** in the exact geographic center of the state, 50 miles away from all four towns (**Centralized UMA Memory**). None of the towns have local libraries.

Look at the consequences of Model 1:
1. Every morning, all 32 researchers from all four towns must drive 50 miles down the exact same central highway to reach the Central Archive.
2. The central highway and the archive parking lot become completely jammed with traffic (**Interconnect Bus Bottleneck**).
3. Every researcher spends **60 minutes driving** ($150\text{ cycles}$ equivalent) to get every single book, regardless of which town they live in!

The system is $100\%$ uniform (everyone pays 60 minutes), but it is slow, congested, and un-scalable.


## Primitive 1: Non-Uniform Memory Access (NUMA) Topology Architecture

Now that we possess a clear, intuitive mental model of local branch libraries and cross-town couriers, let us examine the formal engineering mechanics of **Non-Uniform Memory Access (NUMA) Topology Architecture**.

A **NUMA Node** is a physical hardware grouping located on a single silicon socket (or multi-chip module die) that integrates three primary hardware components:
1. **Execution Cores & Private Caches**: A cluster of 8, 16, 32, or 64 CPU cores with private L1/L2 caches and a shared L3 cache.
2. **Integrated Memory Controller (IMC)**: One or more local memory controllers connected to physical DRAM channels attached directly to that socket's DIMM slots.
3. **Interconnect Router & Port Interfaces**: High-speed packet routing logic connected to point-to-point physical links that join this socket to adjacent sockets.

```text
PHYSICAL HARDWARE ANATOMY OF A 4-NODE NUMA SERVER TOPOLOGY

 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ NUMA NODE 0 (Socket 0)    │  Link 01     │ NUMA NODE 1 (Socket 1)    │
 │ [Cores 0..15 + L3 Cache]  ├─────────────►│ [Cores 16..31 + L3 Cache] │
 │ [Integrated Controller 0] │◄─────────────┤ [Integrated Controller 1] │
 └─────────────┬─────────────┘              └─────────────┬─────────────┘
               │                                          │
       Link 02 │                                  Link 13 │
               ▼                                          ▼
 ┌─────────────┴─────────────┐              ┌─────────────┴─────────────┐
 │ NUMA NODE 2 (Socket 2)    │  Link 23     │ NUMA NODE 3 (Socket 3)    │
 │ [Cores 32..47 + L3 Cache] ├─────────────►│ [Cores 48..63 + L3 Cache] │
 │ [Integrated Controller 2] │◄─────────────┤ [Integrated Controller 3] │
 └───────────────────────────┘              └───────────────────────────┘
```


### Hop Count and Interconnect Distance

The latency of a remote memory access depends directly on the **Interconnect Hop Count ($H$)**: the number of point-to-point physical links a memory request packet must traverse to reach the target NUMA node's memory controller.

```text
INTERCONNECT HOP COUNT LATENCY SCALING

 1. Fully-Connected Mesh (1 Hop to Any Node)
 Node 0 ─── Link 01 ───► Node 1  (Latency = 1 Hop  ~ 90 ns)
 Node 0 ─── Link 02 ───► Node 2  (Latency = 1 Hop  ~ 90 ns)
 Node 0 ─── Link 03 ───► Node 3  (Latency = 1 Hop  ~ 90 ns)

 2. Ring / 2D Torus Topology (Multi-Hop Latency Variance)
 Node 0 ─── Link 01 ───► Node 1 ─── Link 12 ───► Node 2
 (Node 0 to Node 2 requires 2 HOPS! Latency = 2 Hops ~ 140 ns!)
```

1. **Local Access ($H = 0\text{ Hops}$)**: The memory request targets DRAM connected directly to the local socket.
   * Path: `Core 0 -> Local L3 Cache -> Local IMC -> Local DRAM`.
   * Latency: $T_{\text{local}} \approx \mathbf{40 \text{ to } 50 \text{ nanoseconds}}$.
2. **1-Hop Remote Access ($H = 1\text{ Hop}$)**: The memory request targets DRAM connected to a directly adjacent socket.
   * Path: `Core 0 -> Local L3 Miss -> Local Router -> UPI Link 01 -> Node 1 Router -> Node 1 IMC -> Node 1 DRAM`.
   * Latency: $T_{\text{remote,1-hop}} \approx \mathbf{90 \text{ to } 110 \text{ nanoseconds}}$.
3. **2-Hop Remote Access ($H = 2\text{ Hops}$)**: The memory request must traverse two physical links (hopping through an intermediate socket) to reach the target node.
   * Path: `Core 0 -> Router 0 -> Link 01 -> Router 1 -> Link 12 -> Router 2 -> Node 2 IMC -> Node 2 DRAM`.
   * Latency: $T_{\text{remote,2-hop}} \approx \mathbf{130 \text{ to } 170 \text{ nanoseconds}}$!

Every additional interconnect hop adds **$35 \text{ to } 50\text{ nanoseconds}$** of packet serialization and routing delay to the memory access!


### Mathematical Model of NUMA AMAT and Effective CPI

To calculate the performance impact of NUMA latency asymmetry on multi-threaded application execution, we adapt the **Average Memory Access Time (AMAT)** equation to incorporate local versus remote access distributions.

Let $f_{\text{local}}$ be the fraction of memory accesses that target local node DRAM ($0.0 \le f_{\text{local}} \le 1.0$).

Let $f_{\text{remote}}$ be the fraction of memory accesses that target remote node DRAM ($f_{\text{remote}} = 1.0 - f_{\text{local}}$).

The **Integrated NUMA AMAT Equation** is expressed as:

$$\mathbf{\text{AMAT}_{\text{NUMA}} = T_{\text{L1}} + \Big( h_{m,\text{L1}} \cdot \big( f_{\text{local}} \cdot T_{\text{local}} + f_{\text{remote}} \cdot T_{\text{remote}} \big) \Big)}$$

Where:
* $\text{AMAT}_{\text{NUMA}}$ is the Average Memory Access Time in nanoseconds.
* $T_{\text{L1}}$ is the L1 cache hit latency ($\approx 1.0\text{ ns}$).
* $h_{m,\text{L1}}$ is the combined L1/L2/L3 cache miss rate ($0.0 \le h_{m,\text{L1}} \le 1.0$).
* $f_{\text{local}}$ is the fraction of cache misses targeting local node DRAM.
* $f_{\text{remote}}$ is the fraction of cache misses targeting remote node DRAM ($1 - f_{\text{local}}$).
* $T_{\text{local}}$ is the local DRAM memory access latency ($\approx 45\text{ ns}$).
* $T_{\text{remote}}$ is the remote DRAM memory access latency ($\approx 135\text{ ns}$).

Substituting $T_{\text{remote}} = R_{\text{NUMA}} \cdot T_{\text{local}}$:

$$\text{AMAT}_{\text{NUMA}} = T_{\text{L1}} + \Big( h_{m,\text{L1}} \cdot T_{\text{local}} \cdot \big( f_{\text{local}} + f_{\text{remote}} \cdot R_{\text{NUMA}} \big) \Big)$$

```text
NUMA LATENCY IMPACT ANALYSIS

 AMAT = T_L1 + h_m_L1 * T_local * [ f_local + (1 - f_local) * R_NUMA ]
                                              │
                                              └── NUMA Latency Multiplier Penalty!
```

Look at this mathematical formula with extreme care:
If a multi-threaded application suffers $f_{\text{remote}} = 0.80$ ($80\%$ of its memory misses target remote sockets) on a system with $R_{\text{NUMA}} = 3.0\times$:

$$\text{Latency Multiplier} = 0.20 + (0.80 \times 3.0) = 0.20 + 2.40 = \mathbf{2.60\times}$$

The application pays a **$2.60\times$ penalty on every memory miss**, causing CPU pipelines to freeze and destroying multi-threaded software throughput!


### 1. OS First-Touch Page Allocation Policy

When an application allocates a large memory array using `malloc()` or `mmap()`, the operating system kernel does **NOT** allocate physical DRAM pages immediately. It merely reserves virtual address space.

Physical DRAM pages are allocated on the **First Touch**:

> **First-Touch Allocation Policy**: The operating system allocates physical DRAM pages on the specific NUMA node where the CPU thread that **first writes (touches)** to the memory page is running!

```c
// EXAMPLE: FIRST-TOUCH ALLOCATION IN MULTI-THREADED C CODE
double *matrix = malloc(N * sizeof(double));

// PARALLEL FIRST-TOUCH INITIALIZATION LOOP
#pragma omp parallel for
for (int i = 0; i < N; i++) {
    matrix[i] = 0.0; // FIRST TOUCH! Page allocated on local NUMA node of thread i!
}
```

#### Why First-Touch Matters:
If a single master thread running on Core 0 initializes the entire 16-GB array in a single loop before spawning 16 worker threads across 16 sockets:
* **All 16 Gigabytes of physical DRAM are allocated on NUMA Node 0!**
* When worker threads on Nodes 1 through 15 run, **$100\%$ of their memory accesses are REMOTE ACCESSES** across socket links to Node 0!
* The system suffers total NUMA remote latency collapse.

By initializing the array in parallel using the exact same multi-threaded loop that processes the data, **each worker thread first-touches its own partition**, allocating physical DRAM pages locally on its own NUMA socket ($f_{\text{local}} \to 1.0$)!


## Solved Industrial Engineering Exercise: Quantitative NUMA Latency Asymmetry, Thread Migration Penalty, and Effective CPI Analysis

To consolidate your complete mastery of NUMA topologies, local versus remote memory latency asymmetry ($R_{\text{NUMA}}$), interconnect hop delays, and multi-socket CPI calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate NUMA Latency Ratios ($R_{\text{NUMA}}$)

Local DRAM latency $T_{\text{local}} = 40.0\text{ ns}$.

##### 1. 1-Hop NUMA Ratio ($R_{\text{NUMA,1}}$):
$$R_{\text{NUMA,1}} = \frac{T_{\text{remote,1}}}{T_{\text{local}}} = \frac{75.0\text{ ns}}{40.0\text{ ns}} = \mathbf{1.875\times}$$

##### 2. 2-Hop NUMA Ratio ($R_{\text{NUMA,2}}$):
$$R_{\text{NUMA,2}} = \frac{T_{\text{remote,2}}}{T_{\text{local}}} = \frac{110.0\text{ ns}}{40.0\text{ ns}} = \mathbf{2.750\times}$$

A 2-hop remote memory access takes **$2.75\times$ longer** than a local memory access!


#### Step 3: Analyze Scenario B (Un-Optimized Random Allocation)

LLC misses are distributed: $25\%$ Local ($40\text{ ns}$), $50\%$ 1-Hop ($75\text{ ns}$), $25\%$ 2-Hop ($110\text{ ns}$).

##### 1. Calculate Average DRAM Access Latency ($T_{\text{DRAM,B}}$):
$$T_{\text{DRAM,B}} = (0.25 \times 40.0\text{ ns}) + (0.50 \times 75.0\text{ ns}) + (0.25 \times 110.0\text{ ns})$$

$$T_{\text{DRAM,B}} = 10.0\text{ ns} + 37.5\text{ ns} + 27.5\text{ ns} = \mathbf{75.00 \text{ nanoseconds}} \quad (240\text{ CPU Cycles})$$

##### 2. Calculate $\text{AMAT}_B$:
$$\text{AMAT}_B = 1.0\text{ ns} + (0.02 \times 75.00\text{ ns}) = 1.0\text{ ns} + 1.50\text{ ns} = \mathbf{2.50 \text{ nanoseconds}}$$

$$\text{AMAT}_{B,\text{cycles}} = \frac{2.50\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{8.00 \text{ CPU Clock Cycles}}$$

##### 3. Calculate Effective CPI ($\text{CPI}_B$):
$$\text{CPI}_B = 1.0 + (0.20 \times 0.02 \times 240) = 1.0 + 0.960 = \mathbf{1.960 \text{ cycles/instruction}}$$

##### 4. Calculate Total Execution Time ($T_{\text{exec,B}}$):
$$N_{\text{cycles,B}} = 100,000,000 \text{ inst} \times 1.960 \text{ cycles/inst} = 196,000,000 \text{ clock cycles}$$

$$T_{\text{exec,B}} = 196,000,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{0.061250 \text{ seconds}} \quad (61.250\text{ ms})$$


#### Step 5: Calculate Performance Speedup Factors

Let us compare Scenario A (Optimal Local Allocation) against Scenario B (Random) and Scenario C (Migrated):

##### 1. Speedup of Scenario A over Scenario B (Random Page Allocation):

$$\text{Speedup}_{\text{A vs B}} = \frac{T_{\text{exec,B}}}{T_{\text{exec,A}}} = \frac{61.250\text{ ms}}{47.250\text{ ms}} = \frac{1.960\text{ CPI}}{1.512\text{ CPI}} \approx \mathbf{1.296\times \text{ Performance Advantage!}}$$

##### 2. Speedup of Scenario A over Scenario C (Thread Migration Collapse):

$$\text{Speedup}_{\text{A vs C}} = \frac{T_{\text{exec,C}}}{T_{\text{exec,A}}} = \frac{75.250\text{ ms}}{47.250\text{ ms}} = \frac{2.408\text{ CPI}}{1.512\text{ CPI}} \approx \mathbf{1.5925\times \text{ Performance Advantage!}}$$

```text
NUMA HARDWARE ALLOCATION PERFORMANCE SUMMARY

 Scenario                     │ Avg DRAM Latency │ Effective CPI     │ Execution Time │ Speedup vs Local
──────────────────────────────┼──────────────────┼───────────────────┼────────────────┼──────────────────
 Scenario A (100% Local)      │ 40.00 ns         │ 1.512 Cycles/Inst │    47.25 ms    │ 1.00x (Optimal)
 Scenario B (Random 4-Socket) │ 75.00 ns         │ 1.960 Cycles/Inst │    61.25 ms    │ 1.30x SLOWER
 Scenario C (2-Hop Migrated)  │ 110.00 ns        │ 2.408 Cycles/Inst │    75.25 ms    │ 1.59x SLOWER!
                              │ (2.75x Latency)  │ (59.3% Higher CPI)│ (28.0 ms Saved)│ (59.3% Speedup!)
```

##### Engineering Conclusion:
By using OS First-Touch page allocation and CPU thread affinity, Scenario A eliminated $100\%$ of remote interconnect hops, reducing execution time from $75.25\text{ ms}$ down to $47.25\text{ ms}$—delivering a **$1.593\times$ performance speedup ($59.3\%$ throughput gain)** on the exact same multi-socket server hardware!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Non-Uniform Memory Access (NUMA)**: A distributed multi-socket memory architecture where physical main memory is partitioned directly across processor sockets (NUMA Nodes), providing high-bandwidth local memory access while connecting sockets via high-speed point-to-point interconnect links (QPI / UPI / Infinity Fabric).
* **Local versus Remote Latency Asymmetry ($R_{\text{NUMA}}$)**: The physical performance factor ($R_{\text{NUMA}} = \frac{T_{\text{remote}}}{T_{\text{local}}} \approx 1.8\times \text{to } 3.5\times$) reflecting the additional interconnect routing hop delays required when a CPU core accesses DRAM connected to a remote processor socket.
