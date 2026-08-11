---
title: "Write-Back Policy Mechanics and Dirty Bit Tracking"
---

# Write-Back Policy Mechanics and Dirty Bit Tracking

## The Write-Through Interconnect Crisis and Deferred Memory Synchronization

In high-performance memory subsystems, write operations (stores) executed by a processor core present a fundamental architectural challenge. Unlike read operations (loads), which merely query existing data without altering memory state, store instructions perform destructive modifications to binary data in the system's address space.

When a processor core executes a store instruction (such as `STORE R1, [R2]`), it updates a specific byte, word, or quad-word payload. 

In a basic Write-Through cache architecture, every single store operation updates the local Level 1 (L1) Static RAM (SRAM) cache line and **immediately transmits a write request across the memory interconnect bus to lower-level memory** (such as the L2/L3 cache or main DRAM memory).

While Write-Through guarantees that main memory remains $100\%$ up-to-date at all times, it introduces a severe physical bottleneck: **Interconnect Store Traffic Saturation**.

Consider a processor core executing an intensive numerical loop that updates a local counter or accumulator variable inside a 64-byte memory line one million times in succession:

```c
uint64_t sum = 0;
for (int i = 0; i < 1000000; i++) {
    sum += data[i]; // 'sum' is written 1,000,000 times in memory!
}
```

Under a Write-Through Policy:
* Every single iteration of the loop executes a store instruction to the memory address holding `sum`.
* Every single store instruction forces the L1 cache controller to dispatch a multi-cycle write command across the off-chip memory interconnect bus to main DRAM.
* The memory bus is bombarded with **1,000,000 individual write transactions** for the exact same variable!

```text
WRITE-THROUGH SATURATION ON REPEATED STORES

 Store 1 (sum = 5)    ──► Dispatch Bus Write 1  ──► Main DRAM (50 ns)
 Store 2 (sum = 12)   ──► Dispatch Bus Write 2  ──► Main DRAM (50 ns)
 Store 3 (sum = 18)   ──► Dispatch Bus Write 3  ──► Main DRAM (50 ns)
  :
 Store 1M (sum = 5M)  ──► Dispatch Bus Write 1M ──► Main DRAM (50 ns)
 (1,000,000 off-chip write transactions executed for 1 single variable!)
```

Look at the absurdity of this physical behavior:
Out of those 1,000,000 off-chip write transactions, **999,999 were completely unnecessary**! 

Lower-level memory and external system components do not care about the 999,999 intermediate values computed by `sum` during the loop. They only care about the **final result** ($5,000,000$) when the calculation completes!

By forcing every intermediate store to traverse the memory bus, Write-Through saturates the interconnect, consumes massive dynamic power, and forces the CPU pipeline to freeze in write stall cycles, destroying system execution throughput.

How do we eliminate $99\%+$ of off-chip write traffic while permitting store instructions to execute at the full $1\text{-cycle}$ speed of local L1 SRAM?

To solve this interconnect crisis, modern high-performance microprocessors replace Write-Through with **The Write-Back Policy** and **Dirty Bit Tracking**.

Under a Write-Back Policy, when the processor executes a store instruction, the cache controller updates the local L1 SRAM cache line in a single clock cycle and **does NOT transmit a write command across the memory bus**. The write to lower-level memory is deferred entirely!

The processor continues executing subsequent instructions at full speed, repeatedly modifying the L1 cache line locally. 

The modified L1 cache line is transmitted across the memory bus to lower-level memory **ONLY when the line is evicted from the cache** to make room for a new incoming memory block!

However, deferring memory writes creates a critical hardware tracking problem:
> **The Eviction State Dilemma**: When a cache set row is full and a line must be evicted, how does the cache controller know whether a line has been modified by the CPU (requiring a bus write-back to DRAM) or remains pristine and untouched (allowing it to be silently overwritten without any bus traffic)?

To solve this dilemma, hardware architects add a 1-bit tracking flag to every physical cache line entry: **The Dirty Bit ($D$)**.


### Strategy 1: The Instant Delivery Strategy (Write-Through Policy)

The gallery director enforces a strict rule: *"Every single brushstroke applied to the canvas in the studio MUST be duplicated at the public gallery immediately."*

1. At 9:00 AM, the painter applies **Brushstroke #1** to the canvas on their easel.
2. To obey the rule, the painter stops painting, packs the canvas, hires a delivery truck, drives 2 hours to the gallery, paints Brushstroke #1 on the gallery wall, drives 2 hours back to the studio, and finally applies Brushstroke #2 at 1:00 PM!
3. Painting a canvas with 10,000 brushstrokes takes **10,000 delivery truck trips** ($20,000\text{ hours}$ of driving time) for a painting that required only 2.7 hours of actual brushwork!

The painter spends $99.9\%$ of their life driving delivery trucks on the highway. This is the **Write-Through Bus Saturation Problem**.


## Primitive 1: The Write-Back Cache Policy

Now that we possess a clear, intuitive mental model of deferred canvas delivery, let us examine the formal, rigorous engineering mechanics of **The Write-Back Cache Policy**.

> **The Write-Back Policy** is a cache write management strategy where store instructions modify the targeted data word in the local L1 SRAM cache array instantly ($1\text{ clock cycle}$) **without transmitting write commands to lower-level memory**. The update to lower-level memory is deferred until the modified cache line is evicted from the cache array.


#### 1. Write Hit Mechanics (Data Present in L1 Cache)

A **Write Hit** occurs when the memory address targeted by a store instruction matches a valid tag entry in the L1 Data Cache ($\text{Valid} == 1 \quad \mathbf{\text{AND}} \quad \text{Tag\_Match} == 1$).

When a Write Hit occurs in a Write-Back cache:
1. **Local SRAM Update**: The cache controller writes the new byte, word, or quad-word payload into the SRAM data array line at the specified offset in $1\text{ clock cycle}$.
2. **Dirty Bit Assertion**: The cache controller sets the line's **Dirty Bit ($D$)** to $1$:

$$D \Leftarrow 1$$

3. **Zero Bus Traffic**: **NO write command is dispatched across the memory bus!** The lower-level memory hierarchy (L2/L3 or DRAM) is **not** notified.
4. **Pipeline Continuation**: The CPU pipeline resumes executing subsequent instructions immediately on the very next clock cycle.

```text
WRITE HIT EXECUTION IN WRITE-BACK CACHE

 CPU Store (SW) ──► Updates L1 SRAM Line (1 Cycle) ──► Sets Dirty Bit D = 1
                    (ZERO BUS TRANSACTIONS DISPATCHED! CPU CONTINUES!)
```


#### 3. Line Eviction Mechanics (Clean vs. Dirty Lines)

When a cache miss occurs (read miss or write miss) and the targeted cache set row is $100\%$ full, the replacement algorithm (LRU / PLRU) selects an existing line to be **evicted** to make room for the incoming memory block.

Before overwriting the evicted line's SRAM slot, the cache controller inspects the evicted line's **Dirty Bit ($D$)**:

```text
LINE EVICTION DECISION FLOW

 Cache Miss Occurs ──► Target Set Full ──► Select Eviction Line
                                                  │
                                       Inspect Dirty Bit (D)
                                                  │
                                        ┌─────────┴─────────┐
                                        │ D == 0            │ D == 1
                                        ▼                   ▼
                                 SILENT EVICTION     DIRTY WRITE-BACK
                                 Overwrite Line      Write 64-Byte Block
                                 Zero Bus Writes!    to L2 / Main DRAM
```

##### Case A: Evicting a Clean Line ($D == 0$)
If $D == 0$, the line has never been modified by a store instruction since it was loaded from main memory. The data in the L1 cache is **$100\%$ identical to main memory**.
* **Action**: The cache controller **silently overwrites the SRAM slot** with the new incoming memory line (**Silent Eviction**).
* **Bus Traffic**: **Zero bus write transactions generated!**

##### Case B: Evicting a Dirty Line ($D == 1$)
If $D == 1$, the CPU has modified one or more bytes inside this 64-byte line while it resided in the L1 cache. Main memory holds stale, outdated data for this address.
* **Action**: The cache controller reads the entire 64-byte line from the L1 SRAM data array and dispatches a **64-Byte Write-Back Burst Transaction** across the memory bus to update lower-level memory!
* **Bus Traffic**: A single 64-byte block write is transmitted over the bus. Once written to lower memory, the line's dirty status is cleared.


### The Four Valid/Dirty State Combinations

The combination of the Valid bit ($V$) and Dirty bit ($D$) defines four possible hardware states for any physical cache line entry:

```text
VALID / DIRTY STATE COMBINATION MATRIX

 V Flag │ D Flag │ State Name      │ Physical Hardware Meaning
────────┼────────┼─────────────────┼───────────────────────────────────────────────────────────
   0    │   0    │ INVALID         │ Uninitialized slot. Contains no usable data.
   0    │   1    │ ILLEGAL / UNUSED│ Invalid line cannot be dirty! Hardware resets D to 0.
   1    │   0    │ VALID CLEAN     │ Valid line. Identical to main memory. (Silent Eviction!)
   1    │   1    │ VALID DIRTY     │ Valid line. Modified by CPU! (Requires Write-Back!)
```

Let's examine the three active operational states:

1. **INVALID ($V=0, D=0$)**: The cache line slot is empty or uninitialized. On a cache miss, an incoming line can be placed into this slot immediately without any eviction.
2. **VALID CLEAN ($V=1, D=0$)**: The line contains valid data that matches lower-level memory exactly. If this line needs to be evicted, it can be **silently overwritten** ($0\text{ bus write traffic}$).
3. **VALID DIRTY ($V=1, D=1$)**: The line contains modified data written by the CPU that exists **ONLY inside this L1 cache**. If this line is evicted, it **MUST be written back to lower-level memory** to prevent data loss.


## Architectural Comparison: Write-Through versus Write-Back

To select the correct write policy for a specific hardware architecture, computer engineers evaluate the trade-offs between Write-Through and Write-Back policies across four key engineering dimensions:

```text
WRITE-THROUGH VS WRITE-BACK COMPREHENSIVE MATRIX

 Architectural Property │ Write-Through Policy          │ Write-Back Policy
────────────────────────┼───────────────────────────────┼─────────────────────────────────────────────
 Off-Chip Bus Traffic   │ EXTREMELY HIGH (100% Stores)  │ EXTREMELY LOW (Filtered by L1 Cache!)
 Store Execution Latency│ Slow (Stalls on bus writes)   │ Ultra-Fast (1 Clock Cycle L1 SRAM Hit)
 Metadata Storage Area  │ 1 Bit / Line (Valid Bit Only) │ 2 Bits / Line (Valid Bit + Dirty Bit)
 Eviction Complexity    │ Simple (Silent Overwrite)     │ Requires Write-Back Logic & Buffers
 Main Memory Consistency│ ALWAYS 100% Up to Date        │ Temporarily Stale (Inconsistent with L1)
 Power-Loss Recovery    │ Zero Data Loss                │ Un-flushed Dirty Lines Lost on Sudden Power-Off
```

### 1. Interconnect Bandwidth Efficiency
* **Write-Through**: Every store instruction generates an off-chip bus transaction. Bandwidth consumption is high and completely independent of cache hit rates.
* **Write-Back**: Store operations are absorbed locally inside L1 SRAM. Off-chip write traffic occurs *only* when a dirty line is evicted. On typical workloads, Write-Back reduces off-chip write traffic by **$90\%$ to $99\%$**!

### 2. Burst Transfer Protocols
* **Write-Through**: Transmits small, fragmented 4-byte or 8-byte write payloads across the bus. Small transfers suffer from high bus command overhead relative to payload size.
* **Write-Back**: When a dirty line is evicted, it is transmitted as a **full 64-byte block burst**. Burst transfers maximize memory bus protocol efficiency, driving data at peak channel wire speeds.

### 3. Hardware Complexity
* **Write-Through**: Simple hardware. No dirty bits needed, and evictions are always silent overwrites.
* **Write-Back**: Requires 1 Dirty bit per line, a 64-byte write-back buffer, and state machines to manage dirty line evictions.


### The Solution: The Write-Back Buffer (WBB) Queue

To prevent dirty line write-backs from delaying critical read fetches, modern cache controllers insert a small SRAM FIFO queue called a **Write-Back Buffer (WBB)** between the L1 Data Cache and the memory bus:

```text
WRITE-BACK BUFFER (WBB) NON-BLOCKING EVICTION SCHEMATIC

 CPU Memory Read Miss at Address A
             │
             ├──────────────────────────────────────────────────────┐
             ▼                                                      ▼
 Evicted Dirty Line B ──► Moves to Write-Back Buffer (WBB)    Read Line A from DRAM
 (Shifted out of L1 in 1 Cycle!)                               (Issued to DRAM IMMEDIATELY!)
                                                                    │
 CPU Resumes Execution IMMEDIATELY on Line A Arrival!               ▼
                                                         Line A Loaded into L1
                                                                    │
 Background Memory Bus Controller                                   ▼
 Drains Dirty Line B from WBB to DRAM in Background ◄───────────────┘
```

#### How the Write-Back Buffer Eliminates Read-Miss Delays:

Trace the optimized execution flow when a miss selects a dirty line $B$:

1. **Instant Line Offloading ($1\text{ Cycle}$)**: The cache controller reads dirty Line $B$ out of the L1 SRAM array and moves it into the **Write-Back Buffer (WBB)** in a single clock cycle. The L1 cache slot is now empty!
2. **Immediate Read Fetch**: The cache controller dispatches the read request for the CPU's desired Line $A$ to main DRAM **IMMEDIATELY on Cycle 1**, without waiting for Line $B$ to be written to DRAM!
3. **Early Pipeline Restart**: Main DRAM returns Line $A$ in 120 clock cycles. Line $A$ is loaded into the freed L1 slot, and the CPU pipeline **resumes execution immediately**!
4. **Background Write-Back Drain**: While the CPU continues executing instructions using Line $A$, a background memory bus controller pops dirty Line $B$ from the WBB and writes it to DRAM in the background over the next 120 cycles.

```text
WRITE-BACK BUFFER TIMING COMPARISON

 Naive Sequential Eviction : [ Writeback Line B (120c) ] ──► [ Read Line A (120c) ] ──► CPU Resumes (240c)

 WBB Non-Blocking Eviction: [ Read Line A from DRAM (120c) ] ─────────────────────────► CPU Resumes (120c!)
                            [ Writeback Line B to DRAM in Background (120c) ]
                            (CPU Miss Penalty reduced by 50%! 120 Cycles Saved!)
```

By buffering dirty line evictions in a Write-Back Buffer, the CPU's cache miss penalty is cut in half—from $240\text{ cycles}$ down to **$120\text{ cycles}$**—completely hiding dirty writeback latencies behind read line fills!


### Scenario and Parameters

You are a principal memory systems architect designing the L1 Data Cache for a $3.6\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.2778\text{ ns} = 277.8\text{ ps}$).

The processor executes a high-throughput database indexing workload at an execution rate of $100\text{ MIPS}$ ($100,000,000\text{ instructions/second}$).

```text
3.6 GHz SERVER PROCESSOR WITH WRITE-BACK L1 DATA CACHE

 CPU Core (3.6 GHz) ──► [ L1 Data Cache (32 KB, Write-Back) ] ──► [ Shared L2 Cache / DRAM ]
 Clock T = 277.8 ps     Read Hit Rate = 98%, Write Hit = 95%        Miss Penalty = 120 Cycles
```

#### Workload Instruction Mix Parameters:
* Total Execution Speed: $100\text{ MIPS}$ ($100,000,000\text{ instructions/second}$).
* Ideal Execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming all L1 access hits).
* Workload Instruction Mix:
  * $70\%$ Arithmetic, Logic, and Branch Instructions ($f_{\text{arith}} = 0.70$).
  * $20\%$ Memory Read / Load Instructions (`LD`, $f_{\text{load}} = 0.20$).
  * $10\%$ Memory Write / Store Instructions (`SD`, $f_{\text{store}} = 0.10$, $8\text{-byte}$ double-word stores).

#### L1 Data Cache Parameters ($32\text{-KB}$ Direct-Mapped, $64\text{-Byte}$ Lines):
* L1 Data Cache Capacity: $C = 32\text{ KB} = 32,768\text{ bytes}$.
* Cache Line Size: $L = 64\text{ bytes}$.
* Number of Sets: $S = \frac{32,768}{64} = 512\text{ sets}$.
* L1 Read Hit Rate: $h_{r,\text{read}} = 98.0\%\quad (h_{m,\text{read}} = 2.0\% = 0.02)$.
* L1 Write Hit Rate: $h_{r,\text{write}} = 95.0\%\quad (h_{m,\text{write}} = 5.0\% = 0.05)$.
* L1 Cache Hit Latency: $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.2778\text{ ns}$).
* **Dirty Line Eviction Ratio ($P_{\text{dirty}}$)**: $40.0\%\quad (0.40)$ of all evicted cache lines are Dirty ($D = 1$). $60.0\%$ are Clean ($D = 0$).

#### Memory Interconnect Bus & Lower Memory Parameters:
* Memory Bus Width: $64\text{ bits}$ ($8\text{ bytes}$).
* Main Memory DRAM Miss Penalty: $T_{\text{penalty}} = 120\text{ clock cycles}$ ($33.33\text{ ns}$).
* Un-buffered Write-Through Store Bus Stall: $T_{\text{write\_through}} = 20\text{ clock cycles}$ ($5.56\text{ ns}$).

#### Your Objective

1. Calculate the total **Store Instruction Execution Rate** ($N_{\text{stores}}$) and the resulting **Off-Chip Write Bandwidth** under a Write-Through Policy ($\text{BW}_{\text{write\_through}}$) in Megabytes per second (MB/sec).
2. Calculate the total **L1 Cache Line Eviction Rate** ($N_{\text{evictions}}$) per second under the Write-Back Policy.
3. Calculate the resulting **Off-Chip Write-Back Bandwidth** ($\text{BW}_{\text{write\_back}}$) in MB/sec, and determine the exact **Percentage Reduction in Write Bus Traffic** achieved by switching from Write-Through to Write-Back!
4. Calculate the Average Memory Access Time ($\text{AMAT}$) and effective CPI ($\text{CPI}_{\text{effective}}$) for:
   * System A: Write-Through L1 Cache without Write Buffer.
   * System B: Write-Back L1 Cache with Write-Back Buffer (WBB).
5. Calculate the overall **Performance Speedup Factor** of System B over System A.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Write-Back Eviction Rate and Off-Chip Write Bandwidth

Now let us evaluate the write traffic generated by the **Write-Back Policy**.

In a Write-Back cache with Write-Allocate, off-chip write traffic occurs **ONLY when a dirty line ($D = 1$) is evicted from the L1 cache**.

##### 1. Calculate Total L1 Memory Accesses per Second ($N_{\text{accesses}}$):
* Load instructions: $f_{\text{load}} = 0.20 \implies 20,000,000\text{ loads/sec}$.
* Store instructions: $f_{\text{store}} = 0.10 \implies 10,000,000\text{ stores/sec}$.

$$N_{\text{accesses}} = N_{\text{loads}} + N_{\text{stores}} = 20,000,000 + 10,000,000 = \mathbf{30,000,000 \text{ memory accesses / second}}$$

##### 2. Calculate Total L1 Cache Misses per Second ($N_{\text{misses}}$):
* Read misses: $20,000,000 \times 0.02 = 400,000\text{ read misses/sec}$.
* Write misses: $10,000,000 \times 0.05 = 500,000\text{ write misses/sec}$.

$$N_{\text{misses}} = 400,000 + 500,000 = \mathbf{900,000 \text{ total cache misses / second}}$$

##### 3. Calculate Dirty Line Eviction Rate ($N_{\text{dirty\_evictions}}$):
Each cache miss forces a new line to be loaded, evicting an existing line. 
Given $P_{\text{dirty}} = 40.0\%\quad (0.40)$ of evicted lines are dirty:

$$N_{\text{dirty\_evictions}} = N_{\text{misses}} \times P_{\text{dirty}} = 900,000 \text{ misses/sec} \times 0.40 = \mathbf{360,000 \text{ dirty evictions / second}}$$

Out of $10,000,000\text{ store instructions}$, only **$360,000\text{ dirty evictions}$** ever generate off-chip write traffic!

##### 4. Calculate Write-Back Off-Chip Bandwidth ($\text{BW}_{\text{write\_back}}$):
Each dirty eviction writes back a full **$64\text{-byte}$ cache line block**:

$$\text{BW}_{\text{write\_back}} = N_{\text{dirty\_evictions}} \times L = 360,000 \text{ evictions/sec} \times 64 \text{ bytes/line}$$

$$\text{BW}_{\text{write\_back}} = \mathbf{23,040,000 \text{ Bytes / second}} = \mathbf{23.04 \text{ MB/sec}}$$

##### 5. Calculate Bandwidth Reduction Percentage:

$$\text{Traffic Reduction} = \left( 1 - \frac{\text{BW}_{\text{write\_back}}}{\text{BW}_{\text{write\_through}}} \right) \times 100\% = \left( 1 - \frac{23.04\text{ MB/s}}{80.00\text{ MB/s}} \right) \times 100\%$$

$$\text{Traffic Reduction} = (1 - 0.288) \times 100\% = \mathbf{71.2\% \text{ Reduction in Write Bus Traffic!}}$$

Switching to a Write-Back policy eliminated **$71.2\%$ of all off-chip write traffic**, saving immense memory interconnect power and channel bandwidth!


#### Step 4: Calculate Performance Speedup Factor

Let us calculate the overall execution time for $100,000,000\text{ instructions}$ at $3.6\text{ GHz}$ ($T_{\text{clk}} = 0.2778\text{ ns}$):

##### System A Execution Time ($T_{\text{exec,A}}$):
$$T_{\text{exec,A}} = 100,000,000 \text{ inst} \times 3.48 \text{ cycles/inst} \times 0.27778 \times 10^{-9}\text{ s} = \mathbf{0.09667 \text{ seconds}} \quad (96.67\text{ ms})$$

##### System B Execution Time ($T_{\text{exec,B}}$):
$$T_{\text{exec,B}} = 100,000,000 \text{ inst} \times 2.08 \text{ cycles/inst} \times 0.27778 \times 10^{-9}\text{ s} = \mathbf{0.05778 \text{ seconds}} \quad (57.78\text{ ms})$$

##### Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec,A}}}{T_{\text{exec,B}}} = \frac{\text{CPI}_{\text{SystemA}}}{\text{CPI}_{\text{SystemB}}} = \frac{3.48}{2.08} \approx \mathbf{1.673\times \text{ Performance Advantage!}}$$

```text
WRITE POLICY PERFORMANCE COMPARISON SUMMARY

 Architectural Metric   │ System A (Write-Through) │ System B (Write-Back + WBB) │ Performance Gain
────────────────────────┼──────────────────────────┼─────────────────────────────┼───────────────────
 Off-Chip Write Traffic │ 80.00 MB/sec             │ 23.04 MB/sec                │ 71.2% Reduction!
 Effective Execution CPI│ 3.48 Cycles / Inst       │ 2.08 Cycles / Inst          │ 40.2% Reduction
 Execution Time (100M)  │ 96.67 Milliseconds       │ 57.78 Milliseconds          │ 38.89 ms Saved!
 System Speedup Factor  │ 1.00x (Base)             │ 1.673x FASTER!              │ 67.3% SPEEDUP!
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Write-Back Policy**: A cache write management strategy where store instructions modify the local L1 SRAM cache line instantly ($1\text{ clock cycle}$) without transmitting write commands to lower memory, deferring lower-level memory updates until the modified line is evicted from the cache array.
* **Dirty Bit Tracking**: A 1-bit hardware status flag ($D$) stored in the metadata of every physical cache line entry that tracks whether the line has been modified by a store instruction ($D = 1$, requiring a 64-byte write-back on eviction) or remains pristine ($D = 0$, allowing silent eviction without bus traffic).
