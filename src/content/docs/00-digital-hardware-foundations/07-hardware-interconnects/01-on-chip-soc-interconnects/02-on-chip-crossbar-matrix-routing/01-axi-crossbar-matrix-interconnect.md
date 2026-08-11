---
title: "AXI Crossbar Matrix Interconnects and Multi-Master Parallel Routing"
---

# AXI Crossbar Matrix Interconnects and Multi-Master Parallel Routing

## The Structural Port Blocking Crisis in Multi-Core Systems-on-Chip

In modern semiconductor design, a System-on-Chip (SoC) integrates a vast array of specialized processing units onto a single piece of silicon. A typical smartphone or server processor contains multiple central processing unit (CPU) cores, a graphics processing unit (GPU), an artificial intelligence neural processing unit (NPU), a direct memory access (DMA) controller, an image signal processor (ISP), and multiple high-speed wireless network interfaces.

Each of these processing units acts as an independent **Master IP Core** capable of initiating memory transfers. 

At the same time, the microchip contains multiple independent memory targets, known as **Slave Devices**—such as on-chip Static RAM (SRAM) Bank 0, SRAM Bank 1, a high-speed Peripheral Register Block, and multiple off-chip Dynamic RAM (DRAM) channels.

Consider what happens inside an SoC when four master cores need to communicate with four different slave targets at the exact same physical nanosecond:
* Master 0 (CPU Core 0) wants to read a data word from **SRAM Bank 0**.
* Master 1 (GPU Engine) wants to fetch a texture from **DRAM Channel 0**.
* Master 2 (DMA Engine) wants to stream a network packet into **SRAM Bank 1**.
* Master 3 (NPU Engine) wants to write computed neural weights to **DRAM Channel 1**.

```text
CONCURRENT NON-CONFLICTING MEMORY ACCESS ATTEMPT

 Master 0 (CPU 0) ──► Wants to read ──► Slave 0 (SRAM Bank 0)
 Master 1 (GPU)   ──► Wants to read ──► Slave 2 (DRAM Channel 0)
 Master 2 (DMA)   ──► Wants to write ─► Slave 1 (SRAM Bank 1)
 Master 3 (NPU)   ──► Wants to write ─► Slave 3 (DRAM Channel 1)
 (All four masters target COMPLETELY DIFFERENT physical slaves!)
```

Look closely at this access pattern:
Every single master core is requesting a **completely different physical slave device**. Master 0 needs Slave 0, Master 1 needs Slave 2, Master 2 needs Slave 1, and Master 3 needs Slave 3. 

There is zero fundamental data conflict between these four requests! None of the masters are competing for the same physical memory hardware.

However, if these four master cores are connected to the four slave targets using a single, traditional **Shared On-Chip Bus**, a severe system-level hardware failure occurs: **Structural Port Blocking**.

Because a single shared bus provides only one set of physical wires for the entire microchip:
1. The shared bus can transport only **one transaction at a time**.
2. Even though all four masters want to talk to four completely different slaves, the central bus arbiter grants access to Master 0 and **forces Masters 1, 2, and 3 to freeze in hardware stall cycles**!
3. Master 1 must wait for Master 0 to finish. Master 2 must wait for Master 1 to finish. Master 3 must wait for Master 2 to finish.
4. **Three out of the four masters sit idle**, wasting execution cycles and battery power.

```text
STRUCTURAL PORT BLOCKING ON A SHARED BUS

 Cycle 1 : Master 0 -> Slave 0 ──► GRANTED! (Uses shared bus wires)
           Master 1 -> Slave 2 ──► STALLED! (Interconnect lacks parallel wires!)
           Master 2 -> Slave 1 ──► STALLED! (Interconnect lacks parallel wires!)
           Master 3 -> Slave 3 ──► STALLED! (Interconnect lacks parallel wires!)
 (75% of potential system parallel memory bandwidth is COMPLETELY DESTROYED!)
```

Look at the tragedy of Structural Port Blocking:
The performance bottleneck is not caused by the memory devices themselves—SRAM Bank 1, DRAM Channel 0, and DRAM Channel 1 are sitting $100\%$ idle, waiting for data! 

The bottleneck is created **entirely by the interconnect itself**, because a shared bus lacks parallel physical wires to route non-conflicting transfers concurrently.

As SoCs scale from 4 cores to 16, 32, or 64 cores, forcing all cores to share a single bus path destroys over $95\%$ of the chip's theoretical memory bandwidth. High-speed processor cores spend almost all of their operational lifespan frozen in interconnect stalls.

How do we design an on-chip interconnect that provides **independent, parallel physical communication pathways** between every master core and every slave target?

How do we allow Master 0 to talk to Slave 0, Master 1 to talk to Slave 2, and Master 2 to talk to Slave 1 **all at the exact same physical nanosecond** without any interference?

And when two masters *do* genuinely compete for the exact same slave target at the same time, how do we arbitrate the conflict locally at that specific slave port without stalling unrelated transfers across the rest of the microchip?

To eliminate structural port blocking and unleash true multi-master parallel memory bandwidth, digital computer architects replace shared buses with **The AXI Crossbar Matrix Interconnect**.


### Design 1: The Single-Lane Alleyway (Shared On-Chip Bus)

In a poorly designed airport, all four shuttle companies must share a **single-lane, one-way alleyway** that connects to all four terminals.

Look at what happens during peak morning rush hour:
1. Bus 0 (CPU) enters the single-lane alleyway heading toward Terminal 0.
2. Bus 1 (GPU) arrives right behind Bus 0. Bus 1 wants to go to Terminal 2 on the opposite side of the airport.
3. **The Single-Lane Alley Bottleneck**: Even though Terminal 2 is completely empty and its loading dock is open, **Bus 1 is trapped behind Bus 0 in the single-lane alley**!
4. Bus 1 cannot pass Bus 0. Bus 1 must sit idling its engine for 10 minutes while Bus 0 stops at Terminal 0, unloads passengers, and drives away.
5. Buses 2 and 3 sit trapped in line behind Bus 1!

```text
SINGLE-LANE ALLEYWAY BLOCKING (SHARED BUS)

 [ Bus 0 (Heading to Term 0) ] ──► [ Unloading at Term 0 ]
 [ Bus 1 (Heading to Term 2) ] ──► TRAPPED IN ALLEY! (Cannot pass Bus 0!)
 [ Bus 2 (Heading to Term 1) ] ──► TRAPPED IN ALLEY!
 (Terminals 1, 2, and 3 sit EMPTY while 3 buses wait in a single line!)
```

Look at the absurdity of Design 1: Terminals 1, 2, and 3 are wide open, but 3 out of 4 buses are sitting idle in a single-lane traffic jam!


## Primitive 1: The AXI Crossbar Matrix Architecture

Now that we possess an intuitive mental model of the multi-lane airport matrix interchange, let us examine the formal, rigorous engineering mechanics of an **AXI Crossbar Matrix Interconnect**.

An **AXI Crossbar Matrix Interconnect** (also called an $M \times N$ Crossbar Switch) is an on-chip switching network that connects $M$ Master IP Cores to $N$ Slave Targets through a grid of parallel multiplexers and demultiplexers.

```text
M x N AXI CROSSBAR MATRIX STRUCTURAL TOPOLOGY

                      Slave 0        Slave 1        ...      Slave N-1
                   (S0 Interface) (S1 Interface)          (SN-1 Interface)
                         │              │                     │
 Master 0 (M0) ─────────[X]────────────[ ]──────────...───────[ ]
                         │              │                     │
 Master 1 (M1) ─────────[ ]────────────[X]──────────...───────[ ]
                         │              │                     │
   :                     :              :                     :
                         │              │                     │
 Master M-1 (MM-1) ─────[ ]────────────[ ]──────────...───────[X]
                         │              │                     │
                         ▼              ▼                     ▼
                   [Arbiter S0]   [Arbiter S1]          [Arbiter SN-1]
```


## Primitive 2: Multi-Master Interconnect Routing and Per-Slave Arbitration

How does an AXI Crossbar Matrix route an incoming memory request from a specific Master core to the correct Slave target, and how does it resolve conflicts when multiple Masters target the same Slave?

The crossbar matrix executes two distinct hardware mechanisms:
1. **Front-End Master Address Decoding & Demultiplexing**
2. **Back-End Per-Slave Target Arbitration & Multiplexing**

```text
MASTER ADDRESS DECODING AND PER-SLAVE ARBITRATION DATAPATH

 Master 0 (M0) Address [63:0]
       │
       ▼
 [ M0 Address Decoder ] ──► Decodes Address -> Targets Slave 1!
       │
       ▼ Requests Crosspoint (0,1)
 ┌─────────────────────────────────────────────────────────────┐
 │ SLAVE 1 TARGET ARBITER & MUX                                │
 │ Evaluates requests targeting Slave 1:                       │
 │  * Request from M0? YES (Requested Crosspoint 0,1)         │
 │  * Request from M2? YES (Requested Crosspoint 2,1)         │
 │                                                             │
 │ Arbiter selects M0! Grants Crosspoint (0,1) MUX path!       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
                       To Slave 1 Target Port
```


### Step 2: Per-Slave Target Arbitration

In a shared bus, there is only **one single global arbiter** for the entire microchip.

In an AXI Crossbar Matrix, there is **NO single global arbiter**! Instead, the crossbar places an **independent Target Arbiter at every Slave Port $j$** ($j \in [0, N-1]$):

* **Arbiter 0** manages requests targeting Slave 0.
* **Arbiter 1** manages requests targeting Slave 1.
* **Arbiter $N-1$** manages requests targeting Slave $N-1$.

#### How Per-Slave Arbitration Operates:

On every clock cycle, Arbiter $j$ inspects the incoming request signals targeting its slave port from all $M$ masters ($\text{Crosspoint\_Req}_{0, j}, \text{Crosspoint\_Req}_{1, j}, \dots, \text{Crosspoint\_Req}_{M-1, j}$):

1. **Scenario A: Single Master Targets Slave $j$**:
   If only Master 0 requests Slave $j$ ($\text{Crosspoint\_Req}_{0, j} == 1$, all others $0$):
   * Arbiter $j$ grants access to Master 0 immediately ($\text{Crosspoint\_Grant}_{0, j} \Leftarrow 1$).
   * The 4-to-1 MUX at Slave Port $j$ connects Master 0's address and data wires directly to Slave $j$.
   * The transfer begins in **$1\text{ single clock cycle}$**!

2. **Scenario B: Multiple Masters Target Slave $j$ (Target Port Conflict)**:
   If Master 0 AND Master 2 both request Slave $j$ simultaneously ($\text{Crosspoint\_Req}_{0, j} == 1$ and $\text{Crosspoint\_Req}_{2, j} == 1$):
   * Arbiter $j$ applies its internal priority policy (e.g., Round-Robin) to select a single winner (e.g., Master 0).
   * Arbiter $j$ asserts $\text{Crosspoint\_Grant}_{0, j} \Leftarrow 1$ and keeps $\text{Crosspoint\_Grant}_{2, j} = 0$.
   * Master 0's transfer proceeds to Slave $j$.
   * Master 2 receives `READY = 0` on its address channel and stalls until Master 0 finishes.

```text
PER-SLAVE TARGET ARBITRATION INDEPENDENCE

 Arbiter 0 (Managing Slave 0): Resolving conflict between M0 and M2 ──► M2 Stalled at S0
 Arbiter 1 (Managing Slave 1): Servicing M1 with ZERO CONFLICT!   ──► M1 Reads S1 at 100% Speed!
 Arbiter 2 (Managing Slave 2): Servicing M3 with ZERO CONFLICT!   ──► M3 Writes S2 at 100% Speed!
 (Arbiter 0's local conflict does NOT affect Arbiter 1, 2, or 3!)
```

#### The Fundamental Advantage of Per-Slave Arbitration:
Notice that Arbiter 0's local conflict between Master 0 and Master 2 **has ZERO EFFECT on Arbiter 1 or Arbiter 2**! 

Master 1 communicating with Slave 1, and Master 3 communicating with Slave 2, continue transferring data at full multi-gigahertz speeds with $100\%$ zero stalls!


### 1. The Crossbar Silicon Area Explosion ($O(M \times N)$ Complexity)

As SoC designers add more master cores ($M$) and more slave targets ($N$) to a microchip, the physical silicon die area occupied by a full $M \times N$ crossbar matrix grows quadratically according to $O(M \times N)$ complexity:

$$\text{Total Multiplexer Switches} = 5 \times M \times N$$

$$\text{Total Interconnect Wire Traces} = 5 \times (M \times W_{\text{bus}} + N \times W_{\text{bus}})$$

Where:
* $M$ is the number of master ports.
* $N$ is the number of slave ports.
* $W_{\text{bus}}$ is the width of the data bus in bits (e.g., 64 bits or 128 bits).

Let us calculate the hardware multiplexer and wiring growth as an SoC scales:

```text
CROSSBAR SILICON AREA AND MULTIPLEXER EXPANSION MATRIX

 Crossbar Size (M x N) │ Crosspoint MUXes (5 Channels) │ Total Wire Traces (64b Bus) │ Relative Area
───────────────────────┼───────────────────────────────┼─────────────────────────────┼────────────────
 2 x 2 Crossbar        │ 20 MUX Switches               │ 512 Parallel Wires          │ 1x (Base)
 4 x 4 Crossbar        │ 80 MUX Switches               │ 1,024 Parallel Wires        │ 4x
 8 x 8 Crossbar        │ 320 MUX Switches              │ 2,048 Parallel Wires        │ 16x
 16 x 16 Crossbar      │ 1,280 MUX Switches            │ 4,096 Parallel Wires        │ 64x!
 32 x 32 Crossbar      │ 5,120 MUX Switches            │ 8,192 Parallel Wires        │ 256x!!
```

Look at the physical scaling numbers in this table:
* Scaling from a $2 \times 2$ crossbar to a $16 \times 16$ crossbar increases multiplexer count from 20 to **1,280 switches** ($64\times$ area increase!).
* The number of parallel copper wire traces running across the chip expands to **4,096 physical wires**!

If an SoC design team attempts to build a full $32 \times 32$ or $64 \times 64$ crossbar matrix, **the interconnect wires and multiplexer trees will occupy more silicon die surface area than the CPU and GPU cores themselves**! 

Furthermore, routing 8,192 parallel copper traces across the chip creates massive wire congestion, increasing capacitive cross-talk noise and consuming high dynamic switching power.


## Solved Industrial Engineering Exercise: Quantitative Crossbar Throughput Scaling, Concurrent Routing, and Target Contention Analysis

To consolidate your complete mastery of AXI crossbar matrix architecture, $M \times N$ crosspoint multiplexing, per-slave target arbitration, and parallel bandwidth acceleration, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Analyze System 0 (Legacy On-Chip Shared Bus)

Under a single shared bus, only 1 master can transmit at any time. All 4 requests execute sequentially in order of Master priority ($M_0 \to M_1 \to M_2 \to M_3$).

##### 1. Master 0 ($M_0 \to S_0$ SRAM 0):
* Address Phase = $1\text{ cycle}$. SRAM Read Latency = $2\text{ cycles}$. Data Burst = $8\text{ cycles}$.
* Total Time = $1 + 2 + 8 = \mathbf{11 \text{ clock cycles}}$ ($5.50\text{ ns}$).
* Completes at Cycle 11 ($t = 5.50\text{ ns}$).

##### 2. Master 1 ($M_1 \to S_1$ SRAM 1):
* Stalled behind $M_0$ for 11 cycles!
* Address Phase = $1\text{ cycle}$. SRAM Read Latency = $2\text{ cycles}$. Data Burst = $8\text{ cycles}$.
* Total Time = $11 + 1 + 2 + 8 = \mathbf{22 \text{ clock cycles}}$ ($11.00\text{ ns}$).
* Completes at Cycle 22 ($t = 11.00\text{ ns}$).

##### 3. Master 2 ($M_2 \to S_2$ DRAM 0):
* Stalled behind $M_0$ and $M_1$ for 22 cycles!
* Address Phase = $1\text{ cycle}$. DRAM Read Latency = $20\text{ cycles}$. Data Burst = $8\text{ cycles}$.
* Total Time = $22 + 1 + 20 + 8 = \mathbf{51 \text{ clock cycles}}$ ($25.50\text{ ns}$).
* Completes at Cycle 51 ($t = 25.50\text{ ns}$).

##### 4. Master 3 ($M_3 \to S_0$ SRAM 0):
* Stalled behind $M_0, M_1, M_2$ for 51 cycles!
* Address Phase = $1\text{ cycle}$. SRAM Read Latency = $2\text{ cycles}$. Data Burst = $8\text{ cycles}$.
* Total Time = $51 + 1 + 2 + 8 = \mathbf{62 \text{ clock cycles}}$ ($31.00\text{ ns}$).
* Completes at Cycle 62 ($t = 31.00\text{ ns}$).

```text
SYSTEM 0 SHARED BUS CHRONOLOGY

 Cycles 0..11  : Master 0 (CPU 0 -> SRAM 0)  ──► Completes at Cycle 11 (5.5 ns)
 Cycles 11..22 : Master 1 (CPU 1 -> SRAM 1)  ──► Completes at Cycle 22 (11.0 ns)
 Cycles 22..51 : Master 2 (GPU   -> DRAM 0)  ──► Completes at Cycle 51 (25.5 ns)
 Cycles 51..62 : Master 3 (DMA   -> SRAM 0)  ──► Completes at Cycle 62 (31.0 ns)
 (Total Time = 62 Clock Cycles / 31.0 Nanoseconds!)
```

##### System 0 Performance Metrics:
* Total Execution Time ($T_{\text{System0}}$): **62 Clock Cycles ($31.00 \text{ nanoseconds}$)**.
* Total Data Transferred = 4 masters $\times 64\text{ bytes} = 256\text{ Bytes}$.
* Effective Memory Bandwidth ($\text{BW}_{\text{System0}}$):

$$\text{BW}_{\text{System0}} = \frac{256\text{ Bytes}}{31.00 \times 10^{-9}\text{ s}} \approx \mathbf{8.258 \times 10^9 \text{ Bytes/sec}} = \mathbf{8.258 \text{ GB/sec}}$$


#### Step 3: Calculate Performance Speedup Factors

Let us compare System 0 (Shared Bus) vs. System 1 (AXI Crossbar Matrix):

##### 1. Total Execution Time Reduction:

$$\text{Time Reduction} = \left( 1 - \frac{T_{\text{System1}}}{T_{\text{System0}}} \right) \times 100\% = \left( 1 - \frac{14.50\text{ ns}}{31.00\text{ ns}} \right) \times 100\%$$

$$\text{Time Reduction} = (1 - 0.4677) \times 100\% = \mathbf{53.23\% \text{ Reduction in Total Execution Time!}}$$

##### 2. Overall System Throughput Speedup Factor:

$$\text{Speedup}_{\text{total}} = \frac{T_{\text{System0}}}{T_{\text{System1}}} = \frac{62\text{ cycles}}{29\text{ cycles}} = \frac{31.00\text{ ns}}{14.50\text{ ns}} \approx \mathbf{2.1379\times \text{ Performance Speedup!}}$$

```text
AXI CROSSBAR MATRIX PERFORMANCE OPTIMIZATION SUMMARY

 System Configuration      │ Total Execution Cycles │ Total Time (ns) │ Effective Bandwidth │ Speedup Factor
───────────────────────────┼────────────────────────┼─────────────────┼─────────────────────┼──────────────────
 System 0 (Shared Bus)     │ 62 Clock Cycles        │ 31.00 ns        │  8.258 GB/sec       │ 1.00x (Baseline)
 System 1 (AXI Crossbar)   │ 29 Clock Cycles        │ 14.50 ns        │ 17.655 GB/sec       │ 2.138x FASTER!
                           │ (53.2% Time Saved!)    │ (16.5 ns Saved) │ (+9.40 GB/sec)      │ (+113.8% Gain)
```

##### Engineering Conclusion:
By replacing the single shared bus with a $4 \times 4$ AXI Crossbar Matrix, Masters 0, 1, and 2 executed their memory requests concurrently in parallel on Cycle 0. 

Total stream completion time collapsed from $31.00\text{ ns}$ down to $14.50\text{ ns}$—delivering a **$2.138\times$ performance speedup ($113.8\%$ memory bandwidth increase)**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **AXI Crossbar Matrix**: An $M \times N$ on-chip interconnect switching network that connects $M$ Master IP cores to $N$ Slave Targets through five parallel channel multiplexer grids ($5 \times M \times N$ crosspoints), eliminating structural port blocking by enabling non-conflicting memory transfers to execute concurrently.
* **Multi-Master Interconnect**: An interconnect architecture that routes transactions from multiple concurrent master cores using independent per-slave target arbiters, isolating target port conflicts locally so that a conflict at Slave $S_0$ does not stall unrelated transfers targeting Slaves $S_1, S_2, \dots, S_{N-1}$.
