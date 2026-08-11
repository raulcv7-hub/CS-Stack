---
title: "Open-Page Policy Mechanics and Row Buffer Hit Optimization"
---

# Open-Page Policy Mechanics and Row Buffer Hit Optimization

## The Precharge-After-Read Penalty and Streaming Locality Destruction

In modern high-performance microprocessor architectures, central processing units and graphics accelerators generate billions of memory load and store requests every second. To service these requests, the memory controller communicates with main Dynamic Random-Access Memory (DRAM) chips over high-speed command and data buses.

Inside a DRAM chip, memory cells are organized as two-dimensional matrix banks composed of horizontal **Rows** and vertical **Columns**. When the memory controller opens a row using an `ACTIVATE` command, an entire row containing 8,192 bytes ($65,536\text{ bits}$) of data is transferred from microscopic $25\text{-femtofarad}$ storage capacitors into an array of high-speed sense amplifiers called **The Row Buffer**.

Opening a row requires a significant physical time delay specified by JEDEC memory standards: **The Row-to-Column Delay ($t_{\text{RCD}} \approx 14\text{ nanoseconds}$)**, which consumes approximately **$44\text{ CPU clock cycles}$** on a $3.2\text{-GHz}$ processor.

Once an 8-Kilobyte row is sitting open inside the Row Buffer, reading a specific 64-bit word using a `READ` command requires only the **Column Access Strobe Latency ($t_{\text{CL}} \approx 10\text{ nanoseconds}$)** ($32\text{ CPU clock cycles}$).

However, early memory controllers employed a naive row management strategy known as the **Closed-Page Policy (Auto-Precharge Policy)**.

Under a Closed-Page Policy, the memory controller automatically issues a `PRECHARGE` command immediately after every single `READ` or `WRITE` operation completes, closing the row and resetting all bit lines back to half supply voltage ($V_{DD}/2 = 0.60\text{ V}$).

```text
CLOSED-PAGE POLICY (AUTO-PRECHARGE AFTER EVERY ACCESS)

 Memory Access Request (Read 64 Bytes from Row 10, Col 0)
                          │
                          ▼
 [ ACTIVATE Row 10 ] ──► [ READ Col 0 ] ──► [ AUTOMATIC PRECHARGE Row 10! ]
 (t_RCD = 14 ns)          (t_CL = 10 ns)     (t_RP = 14 ns - Row Closed!)
```

Look at what happens under a Closed-Page Policy when a CPU core executes a streaming software workload (such as processing a video frame, initializing an array, or scanning a database table):

1. **Access 1 (`array[0]` at Row 10, Col 0)**: The memory controller issues `ACTIVATE Row 10` ($14\text{ ns}$), `READ Col 0` ($10\text{ ns}$), and then automatically issues `PRECHARGE Row 10` ($14\text{ ns}$). Total time = **$38\text{ nanoseconds}$**. Row 10 is now closed!
2. **Access 2 (`array[1]` at Row 10, Col 1)**: The CPU requests the next 64-byte block, which sits in the **EXACT SAME ROW 10**! But because the Closed-Page policy closed Row 10, the memory controller is forced to issue `ACTIVATE Row 10` AGAIN ($14\text{ ns}$), `READ Col 1` ($10\text{ ns}$), and `PRECHARGE Row 10` AGAIN ($14\text{ ns}$)! Total time = **$38\text{ nanoseconds}$**!
3. **Access 3 (`array[2]` at Row 10, Col 2)**: The memory controller opens Row 10 a third time ($14\text{ ns}$), reads ($10\text{ ns}$), and closes it again ($14\text{ ns}$)!

```text
CLOSED-PAGE STREAMING LATENCY DESTRUCTION

 Access 1 (Row 10, Col 0) ──► [ ACT 14ns ][ READ 10ns ][ PRE 14ns ] ──► 38 ns
 Access 2 (Row 10, Col 1) ──► [ ACT 14ns ][ READ 10ns ][ PRE 14ns ] ──► 38 ns
 Access 3 (Row 10, Col 2) ──► [ ACT 14ns ][ READ 10ns ][ PRE 14ns ] ──► 38 ns
 (Paid 28 nanoseconds of redundant open/close overhead for EVERY SINGLE ACCESS!)
```

Examine the catastrophic inefficiency of the Closed-Page policy during streaming workloads:
* The 8-Kilobyte Row Buffer held **128 consecutive 64-byte cache lines**.
* Yet, the Closed-Page policy opened Row 10, read a single 64-byte line, and **immediately slammed the row shut**, throwing away the remaining 127 cache lines sitting in the Row Buffer!
* For every single 64-byte cache line access, the system paid **$28\text{ nanoseconds}$ of redundant `ACTIVATE` ($t_{\text{RCD}}$) and `PRECHARGE` ($t_{\text{RP}}$) overhead**, while actual data delivery ($t_{\text{CL}}$) took only $10\text{ nanoseconds}$!
* Over **$73.6\%$ of memory execution time was wasted** repeatedly opening and closing the exact same row!

To eliminate this redundant precharge penalty and exploit the spatial locality inherent in software workloads, modern high-performance memory controllers implement **The Open-Page Policy** and **Row Buffer Hit Optimization**.

Under an Open-Page Policy, after a `READ` or `WRITE` command completes, the memory controller **leaves the active row open in the Row Buffer SRAM latches**. 

If subsequent memory requests target the same open row, the memory controller issues **`READ` or `WRITE` commands directly ($10\text{ ns}$)**, skipping the $14\text{-ns}$ `PRECHARGE` and $14\text{-ns}$ `ACTIVATE` phases entirely!

However, leaving rows open indefinitely introduces a secondary physical hazard: **Row Buffer Conflict Penalties**. 

If the memory controller leaves Row 10 open, but the CPU's next request targets Row 20 in the same bank, the controller must close Row 10 before opening Row 20, paying a $38\text{-ns}$ penalty.

Understanding how Open-Page policies optimize row buffer hits, how adaptive hardware inactivity timeouts balance page hits against page conflicts, and how memory controllers profile access patterns dynamically is essential for modern memory subsystem engineering.


### Policy 1: The Strict Lock-and-Key Policy (Closed-Page Policy)

The shop foreman enforces a paranoid safety rule: *"Whenever you pick up a tool, you MUST immediately pack the toolbox, lock the lid, and return it to the central vault before picking up your next tool!"*

Watch the woodworker build a wooden table requiring 4 different tools from **Toolbox #10**:

1. **Need Screwdriver (Toolbox #10, Tool 0)**: Woodworker unlocks the vault, carries Toolbox #10 to the workbench (14 mins), picks up the screwdriver (1 min), packs Toolbox #10, and locks it back in the vault (14 mins). Total time = **29 minutes**.
2. **Need Pliers (Toolbox #10, Tool 1)**: Woodworker unlocks the vault, carries Toolbox #10 back to the workbench (14 mins), picks up pliers (1 min), packs Toolbox #10, and locks it in the vault (14 mins). Total time = **29 minutes**.
3. **Need Hammer (Toolbox #10, Tool 2)**: Woodworker unlocks the vault, carries Toolbox #10 back... Total time = **29 minutes**.
4. **Need Chisel (Toolbox #10, Tool 3)**: Total time = **29 minutes**.

```text
CLOSED-PAGE WORKSHOP TIMELINE (PARANOID LOCK-AND-KEY)

 Tool 0 (Screwdriver) ──► Unlock #10 (14m) + Pick (1m) + Lock #10 (14m) ──► 29 Mins
 Tool 1 (Pliers)      ──► Unlock #10 (14m) + Pick (1m) + Lock #10 (14m) ──► 29 Mins
 Tool 2 (Hammer)      ──► Unlock #10 (14m) + Pick (1m) + Lock #10 (14m) ──► 29 Mins
 Tool 3 (Chisel)      ──► Unlock #10 (14m) + Pick (1m) + Lock #10 (14m) ──► 29 Mins
 (Total Time = 116 Minutes! Spent 112 minutes moving the exact same toolbox!)
```

Look at the absurdity! The woodworker spent **112 minutes unlocking and locking Toolbox #10 four times in a row**, just to grab four tools from the exact same box!


### The Conflict Risk and Strategy 3: The Adaptive Inactivity Timer

Now, consider a new situation: What if the woodworker finishes with Toolbox #10, leaves it open on the workbench, and walks away for lunch?

Two hours later, a new project requires **Toolbox #20**:
* The woodworker arrives at the workbench, sees Toolbox #10 sitting there open, and is forced to pack Toolbox #10 (14 mins), return it to the vault, fetch Toolbox #20 (14 mins), and pick up a tool (1 min). Total time = **29 minutes** (**Row Buffer Conflict**).

To prevent open toolboxes from cluttering the workbench when the woodworker goes to lunch, the foreman installs an **Adaptive Inactivity Timer (Hardware Down-Counter)**:

```text
ADAPTIVE INACTIVITY TIMER

 Toolbox #10 Left Open on Workbench
                 │
  Has Woodworker touched Toolbox #10 in the last 5 minutes?
                 │
        ┌────────┴────────┐
        │ YES             │ NO (Workbench Idle for 5 Mins)
        ▼                 ▼
   Keep Open!       APPRENTICE PACKS TOOLBOX IN BACKGROUND!
   (Expect hits!)   Returns Toolbox #10 to vault while
                    woodworker is eating lunch!
                    Workbench is now CLEAN and READY for Toolbox #20!
```

If the workbench sits idle for 5 minutes without any tool pickups, an apprentice automatically packs Toolbox #10 and locks it back in the vault in the background while the woodworker is away!

When the woodworker returns needing Toolbox #20, **the workbench is clean**, avoiding a conflict delay!

This workshop system is the exact physical analogue of **The Open-Page Policy and Adaptive Row Buffer Management**:
* The woodworker is the **Memory Controller Command Scheduler**.
* Toolbox #10 in the vault is **DRAM Row 10 (8 KB of data)**.
* The open workbench tray is the **DRAM Bank Row Buffer**.
* Grabbing a tool in 1 minute is a **Row Buffer Hit ($t_{\text{CL}} \approx 10\text{ ns}$)**.
* Unlocking a toolbox (14 mins) is **Row Activation ($t_{\text{RCD}} \approx 14\text{ ns}$)**.
* Packing a toolbox (14 mins) is **Row Precharge ($t_{\text{RP}} \approx 14\text{ ns}$)**.
* The 5-minute apprentice timer is the **Adaptive Hardware Inactivity Down-Counter**.


### Command Sequences: Closed-Page vs. Open-Page Policy

To see why the Open-Page Policy provides such massive performance gains for workloads with spatial locality, let us compare the exact command sequences dispatched over the memory bus for $N$ consecutive requests targeting the same DRAM row $R_A$:

#### 1. Command Sequence under Closed-Page Policy (Auto-Precharge):
Every single request executes a full 3-command cycle (`ACT` $\to$ `READ` $\to$ `PRE`):

$$\text{Commands}_{\text{Closed}} = N \times \Big( \text{ACTIVATE}(R_A) \ \to \ \text{READ}(C_i) \ \to \ \text{PRECHARGE}(R_A) \Big)$$

$$\text{Latency}_{\text{Closed}}(N) = N \times (t_{\text{RCD}} + t_{\text{CL}} + t_{\text{RP}})$$

Where:
* $N$ is the number of consecutive memory requests targeting Row $R_A$.
* $t_{\text{RCD}}$ is the Row-to-Column Delay ($\approx 14\text{ ns}$).
* $t_{\text{CL}}$ is the Column Access Strobe Latency ($\approx 10\text{ ns}$).
* $t_{\text{RP}}$ is the Row Precharge Delay ($\approx 14\text{ ns}$).

#### 2. Command Sequence under Open-Page Policy:
The first request opens the row (`ACT` $\to$ `READ`). The remaining $N-1$ requests issue ONLY `READ` commands!

$$\text{Commands}_{\text{Open}} = \text{ACTIVATE}(R_A) \ \to \ \text{READ}(C_0) \ \to \ \text{READ}(C_1) \ \to \dots \to \ \text{READ}(C_{N-1})$$

$$\text{Latency}_{\text{Open}}(N) = t_{\text{RCD}} + (N \times t_{\text{CL}})$$

```text
COMMAND SEQUENCE COMPARISON FOR N = 4 CONSECUTIVE READS

 Closed-Page : [ACT][READ][PRE] [ACT][READ][PRE] [ACT][READ][PRE] [ACT][READ][PRE]
               (4 Activates + 4 Reads + 4 Precharges = 152 ns Total Delay!)

 Open-Page   : [ACT][READ] [READ] [READ] [READ]
               (1 Activate + 4 Reads + 0 Precharges = 54 ns Total Delay!)
               (64.5% Reduction in Execution Time!)
```

#### Mathematical Latency Reduction:
For $N = 4$ consecutive accesses to an 8-KB row ($t_{\text{RCD}} = 14\text{ ns}, t_{\text{CL}} = 10\text{ ns}, t_{\text{RP}} = 14\text{ ns}$):
* $\text{Latency}_{\text{Closed}}(4) = 4 \times (14 + 10 + 14) = 4 \times 38\text{ ns} = \mathbf{152 \text{ nanoseconds}}$.
* $\text{Latency}_{\text{Open}}(4) = 14 + (4 \times 10) = 14 + 40\text{ ns} = \mathbf{54 \text{ nanoseconds}}$.

$$\text{Latency Saved} = 152\text{ ns} - 54\text{ ns} = \mathbf{98 \text{ nanoseconds saved }} (\mathbf{64.5\% \text{ Execution Time Reduction!}})$$

Leaving the row open saved $98\text{ nanoseconds}$ ($313\text{ CPU clock cycles}$) by eliminating redundant `ACTIVATE` and `PRECHARGE` command cycles!


### The Mathematical Row Buffer Hit Rate Threshold ($H_{\text{threshold}}$)

When does an Open-Page Policy outperform a Closed-Page Policy?

Let us derive the exact mathematical **Row Buffer Hit Threshold ($H_{\text{threshold}}$)** that determines whether an Open-Page Policy improves or degrades system performance.

Let $H_{\text{row}}$ be the **Row Buffer Hit Rate** ($0.0 \le H_{\text{row}} \le 1.0$), representing the fraction of memory accesses that target an already open row in the Row Buffer.

The fraction of accesses that target a different row in an open bank is $(1 - H_{\text{row}})$.

#### 1. Average DRAM Access Latency under Closed-Page Policy ($\text{AMAT}_{\text{Closed}}$):
In a Closed-Page Policy, every access pays $t_{\text{RCD}} + t_{\text{CL}}$ (since every row is closed after use):

$$\text{AMAT}_{\text{Closed}} = t_{\text{RCD}} + t_{\text{CL}}$$

#### 2. Average DRAM Access Latency under Open-Page Policy ($\text{AMAT}_{\text{Open}}$):
In an Open-Page Policy, a fraction $H_{\text{row}}$ of accesses pay $t_{\text{CL}}$ (Row Hits), while a fraction $(1 - H_{\text{row}})$ pay $t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$ (Row Conflicts):

$$\text{AMAT}_{\text{Open}} = (H_{\text{row}} \cdot t_{\text{CL}}) + \Big( (1 - H_{\text{row}}) \cdot (t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}) \Big)$$

Expanding and simplifying:

$$\text{AMAT}_{\text{Open}} = (H_{\text{row}} \cdot t_{\text{CL}}) + t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} - (H_{\text{row}} \cdot t_{\text{RP}}) - (H_{\text{row}} \cdot t_{\text{RCD}}) - (H_{\text{row}} \cdot t_{\text{CL}})$$

$$\text{AMAT}_{\text{Open}} = (t_{\text{RCD}} + t_{\text{CL}} + t_{\text{RP}}) - \Big( H_{\text{row}} \cdot (t_{\text{RP}} + t_{\text{RCD}}) \Big)$$

#### 3. Deriving the Threshold $H_{\text{threshold}}$:
The Open-Page Policy is faster than the Closed-Page Policy when $\text{AMAT}_{\text{Open}} < \text{AMAT}_{\text{Closed}}$:

$$(t_{\text{RCD}} + t_{\text{CL}} + t_{\text{RP}}) - \Big( H_{\text{row}} \cdot (t_{\text{RP}} + t_{\text{RCD}}) \Big) < t_{\text{RCD}} + t_{\text{CL}}$$

$$t_{\text{RP}} < H_{\text{row}} \cdot (t_{\text{RP}} + t_{\text{RCD}})$$

$$\mathbf{H_{\text{threshold}} > \frac{t_{\text{RP}}}{t_{\text{RP}} + t_{\text{RCD}}}}$$

Where:
* $H_{\text{threshold}}$ is the minimum Row Buffer Hit Rate required for Open-Page to outperform Closed-Page.
* $t_{\text{RP}}$ is the Row Precharge Time ($\approx 14\text{ ns}$).
* $t_{\text{RCD}}$ is the Row-to-Column Delay ($\approx 14\text{ ns}$).

```text
ROW BUFFER HIT RATE THRESHOLD DERIVATION

 H_threshold = t_RP / (t_RP + t_RCD)
             = 14 ns / (14 ns + 14 ns)
             = 14 / 28
             = 0.50  (50.0% Row Buffer Hit Rate!)
```

#### The Fundamental 50% Threshold Rule:
For standard DDR memory where $t_{\text{RP}} \approx t_{\text{RCD}}$:
* If the workload achieves a Row Buffer Hit Rate **$H_{\text{row}} > 50\%$**, **The Open-Page Policy is FASTER**.
* If the workload achieves a Row Buffer Hit Rate **$H_{\text{row}} < 50\%$**, **The Closed-Page Policy is FASTER**.


## Architectural Comparison: Open-Page versus Closed-Page Policies

To select the optimal page management policy for a specific computing system, memory systems engineers evaluate the trade-offs across four key architectural domains:

```text
PAGE MANAGEMENT POLICY COMPREHENSIVE MATRIX

 Architectural Property │ Closed-Page Policy          │ Open-Page Policy             │ Adaptive Hybrid Policy
────────────────────────┼─────────────────────────────┼──────────────────────────────┼──────────────────────────────
 Row State Post-Access  │ Auto-Precharged (Closed)    │ Left Open in Row Buffer      │ Open, then closes on timeout
 Best Workload Type     │ Random / Multi-Threaded     │ Sequential / Streaming       │ Universal (All Workloads)
 Access Hit Latency     │ Constant t_RCD + t_CL (~24ns)│ Fast t_CL (~10ns on Hit)     │ Fast t_CL (~10ns on Hit)
 Access Conflict Latency│ Low (No precharge needed)   │ High (t_RP + t_RCD + t_CL)   │ Low (Background precharge)
 Memory Controller Power│ Higher (Frequent Activates) │ Lower (Fewer Activates/PRE)  │ Optimized
 Target System Domain   │ Multi-Socket Servers (NUMA) │ Graphics GPUs / Desktop PCs  │ Modern Core Processors
```

### 1. Workload Access Patterns
* **Streaming / Sequential Workloads (Video, AI Tensors, Vector Math)**:
  Access 128 consecutive cache lines within each 8-KB row ($H_{\text{row}} \approx 99.2\%$). 
  **Open-Page Policy is up to $3.5\times$ faster!**
* **Random / Un-Correlated Workloads (Database B-Trees, Graph Traversal, Multi-Socket NUMA)**:
  Every access targets a different row or different bank ($H_{\text{row}} < 10\%$).
  **Closed-Page Policy is up to $1.5\times$ faster!**

### 2. Energy Consumption
Opening a DRAM row (`ACTIVATE`) requires driving $65,536\text{ bit lines}$ from $0.60\text{ V}$ to $1.20\text{ V}$, drawing significant dynamic current ($I_{\text{DD0}}$).
* **Closed-Page Policy**: Executes `ACTIVATE` and `PRECHARGE` on every single access, consuming high dynamic power.
* **Open-Page Policy**: Reuses open Row Buffers, reducing total `ACTIVATE` commands by up to $90\%$, dramatically lowering memory power dissipation!


### Scenario and Parameters

You are a principal memory systems architect designing the DDR4 memory controller for a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor connects to a DDR4-3200 DRAM memory module operating at a bus clock frequency $f_{\text{bus}} = 1,600\text{ MHz}$ ($T_{\text{bus}} = 0.625\text{ ns} = 625\text{ ps}$).

```text
3.2 GHz SERVER PROCESSOR WITH DDR4-3200 MEMORY CONTROLLER

 CPU Core (3.2 GHz) ──► [ Memory Controller ] ──► [ DDR4-3200 DRAM Bank ]
 Clock T = 312.5 ps     Bus T = 625 ps            t_RCD=14ns, t_CL=10ns, t_RP=14ns
```

#### Memory System Hardware Specifications:
* $t_{\text{CL}}$ (CAS Read Latency) = $10.0\text{ ns}$ ($32\text{ CPU clock cycles}$).
* $t_{\text{RCD}}$ (Row-to-Column Activate Delay) = $14.0\text{ ns}$ ($44.8\text{ CPU clock cycles}$).
* $t_{\text{RP}}$ (Row Precharge Delay) = $14.0\text{ ns}$ ($44.8\text{ CPU clock cycles}$).
* $t_{\text{RAS}}$ (Row Active Time) = $35.0\text{ ns}$ ($112\text{ CPU clock cycles}$).
* L1/L2 Cache Line Size = $64\text{ bytes}$.
* DRAM Row Buffer Size per Bank = $8,192\text{ bytes}$ ($8\text{ KB} = 128\text{ cache lines}$ per row).

#### Workload Traces to Compare:
The processor executes two different memory benchmark kernels, each generating **$1,000,000\text{ memory read requests}$**:

* **Benchmark 1 (Sequential Image Filtering Kernel)**:
  * High spatial locality.
  * Achieving a Row Buffer Hit Rate of **$H_{\text{row,1}} = 90.0\%\quad (0.90)$**.
  * $10.0\%$ of accesses target closed/conflicting rows.
* **Benchmark 2 (Random Graph Pointer Chasing Kernel)**:
  * Low spatial locality (random accesses).
  * Achieving a Row Buffer Hit Rate of **$H_{\text{row,2}} = 15.0\%\quad (0.15)$**.
  * $85.0\%$ of accesses target conflicting rows.

#### Your Objective

1. Calculate the theoretical **Row Buffer Hit Threshold ($H_{\text{threshold}}$)** for this memory system.
2. For **Benchmark 1 ($H_{\text{row,1}} = 90\%$)**:
   * Calculate Average Memory Access Time ($\text{AMAT}_{\text{Closed}}$) under a **Closed-Page Policy**.
   * Calculate Average Memory Access Time ($\text{AMAT}_{\text{Open}}$) under an **Open-Page Policy**.
   * Calculate total execution time (in milliseconds) and the **Performance Speedup Factor** of Open-Page over Closed-Page.
3. For **Benchmark 2 ($H_{\text{row,2}} = 15\%$)**:
   * Calculate Average Memory Access Time ($\text{AMAT}_{\text{Closed}}$) under a **Closed-Page Policy**.
   * Calculate Average Memory Access Time ($\text{AMAT}_{\text{Open}}$) under an **Open-Page Policy**.
   * Calculate total execution time (in milliseconds) and explain why Closed-Page is faster for Benchmark 2.
4. Evaluate an **Adaptive Inactivity Timeout Optimization**: An adaptive down-counter closes idle rows during quiet periods, eliminating conflict penalties for $80\%$ of Benchmark 2's misses.
   * Recalculate Benchmark 2's new optimized AMAT ($\text{AMAT}_{\text{Adaptive}}$) and total execution time.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Analyze Benchmark 1 ($H_{\text{row,1}} = 90.0\%$)

Workload executes $1,000,000\text{ memory read requests}$.

##### 1. Closed-Page Policy Performance ($\text{AMAT}_{\text{Closed,1}}$):
Under Closed-Page, every access pays $t_{\text{RCD}} + t_{\text{CL}}$ ($14\text{ ns} + 10\text{ ns} = 24\text{ ns}$):

$$\text{AMAT}_{\text{Closed,1}} = t_{\text{RCD}} + t_{\text{CL}} = 14.0\text{ ns} + 10.0\text{ ns} = \mathbf{24.00 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{Closed,1}} = \frac{24.00\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{76.8 \text{ CPU Clock Cycles}}$$

$$\text{Total Time}_{\text{Closed,1}} = 1,000,000 \text{ reads} \times 24.00\text{ ns/read} = \mathbf{24,000,000 \text{ nanoseconds}} \quad (24.00\text{ ms})$$

##### 2. Open-Page Policy Performance ($\text{AMAT}_{\text{Open,1}}$):
* $90.0\%\quad (900,000\text{ accesses})$ are Row Buffer Hits $\implies T_{\text{hit}} = t_{\text{CL}} = 10.0\text{ ns}$.
* $10.0\%\quad (100,000\text{ accesses})$ are Row Buffer Conflicts $\implies T_{\text{conflict}} = t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} = 14 + 14 + 10 = 38.0\text{ ns}$.

$$\text{AMAT}_{\text{Open,1}} = (H_{\text{row,1}} \cdot t_{\text{CL}}) + \Big( (1 - H_{\text{row,1}}) \cdot (t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}) \Big)$$

$$\text{AMAT}_{\text{Open,1}} = (0.90 \times 10.0\text{ ns}) + (0.10 \times 38.0\text{ ns}) = 9.00\text{ ns} + 3.80\text{ ns} = \mathbf{12.80 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{Open,1}} = \frac{12.80\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{40.96 \text{ CPU Clock Cycles}}$$

$$\text{Total Time}_{\text{Open,1}} = 1,000,000 \text{ reads} \times 12.80\text{ ns/read} = \mathbf{12,800,000 \text{ nanoseconds}} \quad (12.80\text{ ms})$$

##### 3. Calculate Performance Speedup Factor for Benchmark 1:

$$\text{Speedup}_1 = \frac{\text{AMAT}_{\text{Closed,1}}}{\text{AMAT}_{\text{Open,1}}} = \frac{24.00\text{ ns}}{12.80\text{ ns}} = \mathbf{1.875\times \text{ Performance Speedup!}}$$

For Benchmark 1 ($H_{\text{row,1}} = 90\% > 50\%$), the Open-Page Policy is **$1.875\times$ faster ($87.5\%$ throughput gain)**!


#### Step 4: Evaluate Adaptive Hardware Inactivity Timeout Optimization

Now, an adaptive down-counter is added. When a row sits idle, it is closed in the background.

For Benchmark 2, $80\%$ of its $850,000$ non-hit accesses ($680,000\text{ accesses}$) find the bank precharged (Closed Miss $= 24\text{ ns}$), while only $20\%$ ($170,000\text{ accesses}$) suffer a Row Conflict ($38\text{ ns}$):

##### 1. Calculate Optimized Adaptive AMAT ($\text{AMAT}_{\text{Adaptive}}$):
* $15.0\%\quad (150,000\text{ accesses})$ Row Hits = $10.0\text{ ns}$.
* $68.0\%\quad (680,000\text{ accesses})$ Closed Misses = $24.0\text{ ns}$.
* $17.0\%\quad (170,000\text{ accesses})$ Row Conflicts = $38.0\text{ ns}$.

$$\text{AMAT}_{\text{Adaptive}} = (0.15 \times 10.0) + (0.68 \times 24.0) + (0.17 \times 38.0)$$

$$\text{AMAT}_{\text{Adaptive}} = 1.50\text{ ns} + 16.32\text{ ns} + 6.46\text{ ns} = \mathbf{24.28 \text{ nanoseconds}}$$

$$\text{Total Time}_{\text{Adaptive}} = 1,000,000 \text{ reads} \times 24.28\text{ ns/read} = \mathbf{24,280,000 \text{ nanoseconds}} \quad (24.28\text{ ms})$$

##### 2. Speedup of Adaptive Policy over Naive Open-Page on Benchmark 2:

$$\text{Speedup}_{\text{Adaptive}} = \frac{\text{AMAT}_{\text{Open,2}}}{\text{AMAT}_{\text{Adaptive}}} = \frac{33.80\text{ ns}}{24.28\text{ ns}} \approx \mathbf{1.392\times \text{ Performance Advantage!}}$$

```text
PAGE MANAGEMENT POLICY PERFORMANCE RESULTS SUMMARY

 Workload Kernel │ Closed-Page AMAT │ Open-Page AMAT │ Adaptive AMAT │ Winning Policy
─────────────────┼──────────────────┼────────────────┼───────────────┼─────────────────────────
 Benchmark 1     │ 24.00 ns         │ 12.80 ns       │ 12.80 ns      │ Open-Page (1.88x Faster)
 (90% Row Hits)  │ (76.8 Cycles)    │ (41.0 Cycles)  │ (40.96 Cycles)│
─────────────────┼──────────────────┼────────────────┼───────────────┼─────────────────────────
 Benchmark 2     │ 24.00 ns         │ 33.80 ns       │ 24.28 ns      │ Closed/Adaptive
 (15% Row Hits)  │ (76.8 Cycles)    │ (108.2 Cycles) │ (77.7 Cycles) │ (Open-Page was 41% slow!)
```

##### Engineering Conclusion:
* For Benchmark 1 ($H_{\text{row}} = 90\% > 50\%$), the Open-Page Policy reduced average memory access latency from $24.0\text{ ns}$ down to $12.8\text{ ns}$ (**$1.875\times$ speedup**).
* For Benchmark 2 ($H_{\text{row}} = 15\% < 50\%$), naive Open-Page degraded latency to $33.8\text{ ns}$, but adding an adaptive inactivity timeout reduced latency back to $24.28\text{ ns}$ (**$1.392\times$ speedup over naive Open-Page**), achieving optimal performance across both workloads!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Open-Page Policy**: A memory controller row management policy that leaves an activated DRAM row open in the Row Buffer SRAM latches after a read or write operation completes, enabling subsequent requests targeting the same row (Row Buffer Hits) to execute at high speeds ($t_{\text{CL}} \approx 10\text{ ns}$) without repeating `PRECHARGE` ($t_{\text{RP}}$) and `ACTIVATE` ($t_{\text{RCD}}$) cycles.
* **Row Buffer Hit Optimization**: The architectural strategy of reordering and batching memory requests to maximize the Row Buffer Hit Rate ($H_{\text{row}}$), reducing average memory access time whenever $H_{\text{row}}$ exceeds the physical threshold $H_{\text{threshold}} = \frac{t_{\text{RP}}}{t_{\text{RP}} + t_{\text{RCD}}} \approx 50\%$.
