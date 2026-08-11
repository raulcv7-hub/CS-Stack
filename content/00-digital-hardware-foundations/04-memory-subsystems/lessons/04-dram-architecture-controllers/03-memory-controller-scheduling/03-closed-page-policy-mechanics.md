content/00-digital-hardware-foundations/04-memory-subsystems/lessons/04-dram-architecture-controllers/03-memory-controller-scheduling/03-closed-page-policy-mechanics.md
# Closed-Page Policy Mechanics and Auto-Precharge Command Scheduling

## The Open-Page Conflict Penalty and Random-Access Latency Thrashing

In high-performance digital computing architectures, main system Dynamic Random-Access Memory (DRAM) is organized as a three-dimensional hierarchy of Channels, Ranks, and Banks. Each individual DRAM bank consists of a two-dimensional matrix array holding hundreds of thousands of horizontal **Rows** and vertical **Columns** of One-Transistor One-Capacitor (1T1C) storage cells.

When a memory controller accesses data inside a DRAM bank, it must first issue an **`ACTIVATE` Command** specifying a Row Address $R_A$. 

Opening Row $R_A$ triggers an analog charge-redistribution process: the bank's horizontal Word Line ($WL_A$) opens 65,536 cell access transistors, dumping microscopic capacitive charges onto vertical Bit Lines. 

Cross-coupled differential Sense Amplifiers sense tiny $\pm 50\text{-millivolt}$ voltage deltas, amplify them to full supply rails ($1.20\text{ V}$ or $0.0\text{ V}$), and latch the entire 8-Kilobyte row into an on-chip SRAM array called **The Row Buffer**.

Opening a row requires a mandatory physical delay specified by JEDEC memory standards: **The Row-to-Column Delay ($t_{\text{RCD}} \approx 14\text{ nanoseconds}$)**, which consumes approximately **$45\text{ CPU clock cycles}$** on a $3.2\text{-GHz}$ processor.

Once the 8-Kilobyte row is sitting open inside the Row Buffer, reading a specific 64-bit word using a **`READ` Command** requires only the **Column Access Strobe Latency ($t_{\text{CL}} \approx 10\text{ nanoseconds}$)** ($32\text{ CPU clock cycles}$).

In workloads with high spatial locality (such as streaming video processing or sequential array scans), memory controllers employ an **Open-Page Policy**, leaving the row open in the Row Buffer after a read or write operation completes. 

As long as subsequent memory requests target the same open row (**Row Buffer Hits**), the controller issues `READ` commands directly ($10\text{ ns}$), skipping row activation ($14\text{ ns}$) and row precharging ($14\text{ ns}$).

However, when a multi-core processor executes software workloads characterized by **random, non-sequential, or multi-threaded memory access patterns**—such as database B-tree index lookups, graph analytics, pointer chasing, or multi-socket server traffic from 64 independent CPU cores—the Open-Page Policy encounters a severe physical performance wall: **The Row Buffer Conflict Penalty**.

```text
THE OPEN-PAGE CONFLICT PENALTY ON RANDOM ACCESSES

 Open-Page Policy: Leaves Row 10 Open in Bank 0 Row Buffer
                      │
 CPU Requests Address in Row 20 (Row Buffer Conflict!)
                      │
                      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ STEP 1: PRECHARGE Row 10 (t_RP = 14 ns)                     │
 ├─────────────────────────────────────────────────────────────┤
 │ STEP 2: ACTIVATE Row 20  (t_RCD = 14 ns)                    │
 ├─────────────────────────────────────────────────────────────┤
 │ STEP 3: READ Column Word (t_CL = 10 ns)                     │
 └─────────────────────────────────────────────────────────────┘
  Total Access Latency = 14 + 14 + 10 = 38 NANOSECONDS (122 CPU Cycles!)
```

Look at the physical timing breakdown when an Open-Page controller experiences a Row Buffer Conflict:
1. Because Row 10 was left open, the controller must first close Row 10 by issuing a **`PRECHARGE` Command**, waiting for the Row Precharge Time ($t_{\text{RP}} \approx 14\text{ ns}$).
2. The controller then opens the newly requested Row 20 by issuing an **`ACTIVATE` Command**, waiting for the Row-to-Column Delay ($t_{\text{RCD}} \approx 14\text{ ns}$).
3. Finally, the controller issues the **`READ` Command**, waiting for the CAS Latency ($t_{\text{CL}} \approx 10\text{ ns}$).

Total access latency for a Row Buffer Conflict: **$38\text{ nanoseconds}$ ($122\text{ CPU clock cycles}$)**.

Now, notice the hidden penalty imposed by leaving Row 10 open:
If the memory controller had **closed Row 10 immediately after the previous access** (returning Bank 0 to the Precharged/Closed State), Bank 0 would have been sitting ready and closed when the request for Row 20 arrived!

The controller would have needed to execute only two steps: `ACTIVATE Row 20` ($14\text{ ns}$) $\to$ `READ Col` ($10\text{ ns}$). Total access latency: **$24\text{ nanoseconds}$ ($77\text{ CPU clock cycles}$)**.

> **The Open-Page Penalty**: Leaving the wrong row open added an unnecessary **$14\text{-nanosecond}$ $t_{\text{RP}}$ precharge delay** to every single random memory access! The memory access took $58\%$ longer ($38\text{ ns vs } 24\text{ ns}$) simply because the controller left an idle row open in the Row Buffer!

When random memory workloads exhibit a Row Buffer Hit Rate of less than $50\%$, the Open-Page Policy becomes a major liability, flooding the memory bus with redundant precharge stalls and degrading system execution speed.

To eliminate these precharge stall penalties during random and multi-threaded memory workloads, memory subsystem engineers employ **The Closed-Page Policy** and **Auto-Precharge Command Scheduling**.

Under a Closed-Page Policy, the memory controller automatically closes (precharges) the open DRAM row immediately after every column read or write operation completes. 

By leveraging hardware **Auto-Precharge Flags (`RDA` / `WRA`)** embedded directly inside read and write command payloads, the memory controller commands the DRAM chip to execute precharging automatically in the background, ensuring that memory banks return to the clean, precharged state instantly and preparing them for subsequent accesses to any arbitrary row.

---

## The Clean Countertop and the Immediate Return Policy: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of the Closed-Page policy, auto-precharge command scheduling, and precharge timing constraints before inspecting transistor-level state machines and nanosecond timing equations, let us consider an everyday analogy: **The Professional Kitchen and the Appliance Lockers**.

Imagine a busy head chef (**The CPU Memory Controller**) preparing gourmet meals in a commercial kitchen. The chef uses specialized appliances (**Memory Data Words**) stored inside a central storage room (**A DRAM Memory Bank**).

```text
THE PROFESSIONAL KITCHEN METAPHOR

 Chef's Station (Memory Controller)          Central Storage Room (DRAM Bank)
 ┌───────────────────────────┐               ┌───────────────────────────┐
 │ Clean Preparation Counter │               │ Appliance Lockers         │
 │ Holds 1 Appliance Box     │               │ Holds 131,072 Tool Boxes  │
 │ Pick-Up Time: 1 Second    │               │ Retrieval Time: 14 Mins   │
 └───────────────────────────┘               └───────────────────────────┘
   (High-Speed Row Buffer Latch)               (Slow DRAM 1T1C Matrix)
```

Inside the storage room are **131,072 heavy lockers (DRAM Rows)**. Each locker holds **1,000 specialized tools (Column Words)**.

In the middle of the kitchen sits a single **Preparation Counter (The Row Buffer)**. The counter is small: it can hold **only one locker box (8 Kilobytes of data)** at a time.

Unlocking a locker, carrying the heavy box to the counter, and opening the lid takes **14 minutes** ($t_{\text{RCD}}$ Row Activation). Grabbing a tool off the open box on the counter takes **1 minute** ($t_{\text{CL}}$ Column Read). Packing the box, closing the lid, and locking it back in the storage room takes **14 minutes** ($t_{\text{RP}}$ Row Precharge).

Let us compare how two different kitchen policies handle a chef who works on **random, un-predictable recipes**:

---

### Policy 1: The Open Workbench Policy (Open-Page Policy on Random Tasks)

The shop manager tells the chef: *"Leave whatever locker box you opened sitting on the preparation counter indefinitely just in case you need it again!"*

Now, watch what happens when the chef prepares a random menu requiring tools from completely different lockers:
1. **Recipe Step 1 (Needs Blender from Locker #10)**: Chef unlocks Locker #10, carries it to the counter (14 mins), and grabs the blender (1 min). Total time = **15 minutes**. Locker #10 is left sitting open on the counter!
2. **Recipe Step 2 (Needs Meat Grinder from Locker #20)**: The chef needs Locker #20, but **Locker #10 is cluttering the counter**!
   * The chef must stop, pack Locker #10 (14 mins), carry Locker #10 back to the storage room, lock it up, unlock Locker #20 (14 mins), carry Locker #20 to the counter, and grab the meat grinder (1 min).
   * Total time = **29 minutes** (**Row Buffer Conflict**)!

```text
OPEN WORKBENCH TIMELINE (RANDOM TASKS = CONFLICT PENALTIES)

 Step 1 (Locker #10) ──► Unlock #10 (14m) + Grab (1m) ──► Locker #10 Left OPEN! (15m)
 Step 2 (Locker #20) ──► Lock #10 (14m) + Unlock #20 (14m) + Grab (1m) ──► 29 Mins!
                         (Paid a 14-minute packing penalty because #10 was left open!)
```

Look at the penalty: Because the chef left Locker #10 sitting open on the counter, Step 2 took **29 minutes** instead of 15 minutes! The chef paid a 14-minute packing penalty ($t_{\text{RP}}$) on the spot.

---

### Policy 2: The Immediate Return Policy with Automated Assistant (Closed-Page / Auto-Precharge Policy)

The shop manager replaces the open workbench policy with an **Immediate Return Policy** enforced by an **Automated Kitchen Assistant (The Auto-Precharge Engine)**:

*"Whenever the chef grabs a tool from a locker box, the Automated Assistant will IMMEDIATELY pack the box, carry it back to the storage room, and lock it up in the background while the chef is cooking!"*

Now, trace how the chef executes the exact same random menu:

1. **Recipe Step 1 (Needs Blender from Locker #10)**:
   * The chef requests the blender with an **Auto-Return Instruction (`READ` with Auto-Precharge)**.
   * The chef unlocks Locker #10, places it on the counter (14 mins), and grabs the blender (1 min).
   * **Automated Action**: As the chef walks back to the stove with the blender, the Automated Assistant **packs Locker #10 and locks it back in the storage room in the background** ($14\text{ mins}$)!
   * **The counter is now $100\%$ CLEAN and EMPTY!**
2. **Recipe Step 2 (Needs Meat Grinder from Locker #20)**:
   * The chef needs Locker #20. They look at the preparation counter: **IT IS ALREADY CLEAN!**
   * The chef does NOT have to pack Locker #10!
   * The chef simply unlocks Locker #20 (14 mins) and grabs the meat grinder (1 min).
   * Total time = **15 minutes**!

```text
IMMEDIATE RETURN TIMELINE (CLOSED-PAGE AUTO-PRECHARGE)

 Step 1 (Locker #10) ──► Unlock #10 (14m) + Grab (1m) ──► Assistant Locks #10 in Background!
 Step 2 (Locker #20) ──► Counter ALREADY CLEAN! Unlock #20 (14m) + Grab (1m) ──► 15 Mins!
                         (Saved 14 minutes because the counter was pre-cleaned!)
```

Look at what Policy 2 achieved for random tasks:
* The preparation counter was **always kept clean and empty**.
* When Step 2 required Locker #20, the chef **saved 14 minutes** because they did not have to clean up Locker #10 on the spot!
* Total time for Step 2 dropped from $29\text{ minutes}$ down to **$15\text{ minutes}$**—a **$48\%$ execution time reduction**!

This kitchen system is the exact physical analogue of **The Closed-Page Policy and Auto-Precharge Scheduling**:
* The chef is the **CPU Memory Controller**.
* Locker #10 in the storage room is **DRAM Row 10 (8 KB of data)**.
* The preparation counter is the **DRAM Bank Row Buffer**.
* Unlocking a locker (14 mins) is **Row Activation ($t_{\text{RCD}} \approx 14\text{ ns}$)**.
* Grabbing a tool (1 min) is **Column Read ($t_{\text{CL}} \approx 10\text{ ns}$)**.
* Packing a locker (14 mins) is **Row Precharge ($t_{\text{RP}} \approx 14\text{ ns}$)**.
* The Automated Assistant packing the box in the background is the **Auto-Precharge Command Flag (`RDA` / `WRA`)**.

---

## Primitive 1: The Closed-Page Memory Management Policy

Now that we possess a clear intuitive mental model of the immediate return policy and automated assistant, let us examine the formal engineering mechanics of **The Closed-Page Memory Management Policy**.

> **The Closed-Page Policy** is a memory controller row management strategy where, after a `READ` or `WRITE` command completes, the memory controller **immediately issues a `PRECHARGE` command to close the opened DRAM row**, de-asserting the Word Line ($WL = 0\text{ V}$) and precharging all vertical bit line wires back to half supply voltage ($V_{DD}/2$) to return the bank to the clean, precharged state.

```text
CLOSED-PAGE POLICY COMMAND TIMING FLOW

 Memory Access Request (Read Row 10, Col 0)
                      │
                      ▼
 [ ACTIVATE Row 10 ] ──► [ READ Col 0 ] ──► [ PRECHARGE Row 10 ]
 (t_RCD = 14 ns)          (t_CL = 10 ns)     (t_RP = 14 ns)
                                             │
                                             ▼
                                    BANK 0 CLOSED & PRECHARGED!
                                    (Ready for ANY future row!)
```

---

### Command Sequences: Open-Page vs. Closed-Page on Random Accesses

To see why the Closed-Page Policy is mathematically superior for random memory access workloads, let us compare the command sequences and total access latencies for $N$ consecutive requests targeting **different, un-correlated rows** in the same DRAM bank ($R_0 \neq R_1 \neq R_2 \dots \neq R_{N-1}$):

#### 1. Command Sequence under Open-Page Policy (Causing Conflicts):
Because the Open-Page policy leaves the previous row open, every single access after the first incurs a full 3-step Row Buffer Conflict (`PRECHARGE` $\to$ `ACTIVATE` $\to$ `READ`):

$$\text{Commands}_{\text{Open\_Random}} = \text{ACT}(R_0) \to \text{READ}(C_0) \ \to \ \sum_{i=1}^{N-1} \Big( \text{PRE}(R_{i-1}) \to \text{ACT}(R_i) \to \text{READ}(C_i) \Big)$$

$$\text{Latency}_{\text{Open\_Random}}(N) = (t_{\text{RCD}} + t_{\text{CL}}) + (N - 1) \times (t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}})$$

Where:
* $N$ is the number of random memory requests targeting different rows in the same bank.
* $t_{\text{RCD}}$ is the Row-to-Column Delay ($\approx 14\text{ ns}$).
* $t_{\text{CL}}$ is the Column Access Strobe Latency ($\approx 10\text{ ns}$).
* $t_{\text{RP}}$ is the Row Precharge Delay ($\approx 14\text{ ns}$).

#### 2. Command Sequence under Closed-Page Policy:
Because the Closed-Page policy precharges the bank after every access, every access finds the bank precharged, requiring only a 2-step sequence (`ACTIVATE` $\to$ `READ`):

$$\text{Commands}_{\text{Closed\_Random}} = \sum_{i=0}^{N-1} \Big( \text{ACT}(R_i) \to \text{READ}(C_i) \to \text{PRE}(R_i) \Big)$$

$$\text{Latency}_{\text{Closed\_Random}}(N) = N \times (t_{\text{RCD}} + t_{\text{CL}} + t_{\text{RP}})$$

Notice a critical timing subtlety!
Although the closed-page total formula $N \times (t_{\text{RCD}} + t_{\text{CL}} + t_{\text{RP}})$ looks similar, the **Precharge Phase ($t_{\text{RP}}$) executes in parallel with CPU pipeline processing of the read data**!

For the CPU execution core waiting for read data, the critical-path read latency seen by the CPU on every closed-page access is **ONLY $t_{\text{RCD}} + t_{\text{CL}}$ ($24\text{ ns}$)**!

The $14\text{-ns}$ precharge delay ($t_{\text{RP}}$) happens *after* the read data has already been driven onto the bus, hiding the precharge delay from the CPU!

```text
CRITICAL PATH LATENCY SEEN BY CPU ON RANDOM ACCESSES

 Open-Page Conflict Latency (CPU Stalls) : [ PRE 14ns ][ ACT 14ns ][ READ 10ns ] ──► 38 ns
                                           ◄────────── CPU STALLED ───────────►

 Closed-Page Access Latency (CPU Stalls) : [ ACT 14ns ][ READ 10ns ] [ PRE 14ns in background ]
                                           ◄── CPU STALLED ──► (Data delivered at 24ns!)
                                           (CPU un-stalled 14 ns EARLIER!)
```

#### Mathematical Latency Comparison for 4 Random Accesses:
For $N = 4$ random accesses to different rows ($t_{\text{RCD}} = 14\text{ ns}, t_{\text{CL}} = 10\text{ ns}, t_{\text{RP}} = 14\text{ ns}$):
* **Open-Page Critical Path CPU Stall**:
  $$\text{Stall}_{\text{Open}} = (14 + 10) + 3 \times (14 + 14 + 10) = 24 + (3 \times 38) = 24 + 114 = \mathbf{138 \text{ nanoseconds}}$$
* **Closed-Page Critical Path CPU Stall**:
  $$\text{Stall}_{\text{Closed}} = 4 \times (14 + 10) = 4 \times 24 = \mathbf{96 \text{ nanoseconds}}$$

$$\text{Stall Time Saved} = 138\text{ ns} - 96\text{ ns} = \mathbf{42 \text{ nanoseconds saved }} (\mathbf{30.4\% \text{ Stall Reduction!}})$$

Closing the row immediately reduced critical-path CPU stall time by **$30.4\%$** across the four random accesses!

---

## Primitive 2: Auto-Precharge (RDA / WRA) Hardware Command Scheduling

To implement the Closed-Page Policy efficiently without bloating memory bus traffic with separate `PRECHARGE` commands, memory controller hardware utilizes **Auto-Precharge Commands**.

> **Auto-Precharge** is a JEDEC-standard DRAM hardware mechanism where a single command flag embedded inside a `READ` or `WRITE` command commands the DRAM chip's internal state machine to **automatically initiate a row precharge operation** as soon as internal physical timing constraints ($t_{\text{RAS}}, t_{\text{RTP}}, t_{\text{WR}}$) expire, without requiring the memory controller to dispatch an explicit `PRECHARGE` command over the bus.

---

### The $A_{10}$ Address Pin Encoding Mechanics

How does the memory controller communicate an Auto-Precharge command to a DRAM chip?

In JEDEC memory specifications (DDR3, DDR4, DDR5), address pin **$A_{10}$** (Address Pin 10) serves a dual physical purpose during column read and write commands:

```text
ADDRESS PIN A10 AUTO-PRECHARGE ENCODING

 Memory Bus Command Issued: READ or WRITE (Pins A[9:0] hold Column Address)
                                  │
                       Inspect Address Pin A10
                                  │
         ┌────────────────────────┴────────────────────────┐
         │ A10 == 0                                        │ A10 == 1
         ▼                                                 ▼
 STANDARD READ / WRITE                             READ / WRITE WITH AUTO-PRECHARGE
 (Command: READ / WRITE)                           (Command: RDA / WRA)
 Row remains OPEN in Row Buffer after access.     DRAM chip AUTOMATICALLY precharges
                                                   row when timing constraints expire!
```

* **Standard Read/Write (`READ` / `WRITE`)**: Address pin $A_{10} = 0$. The DRAM chip executes the column access and leaves the row open in the Row Buffer.
* **Read with Auto-Precharge (`RDA`)**: Address pin $A_{10} = 1$ during a `READ` command. The DRAM chip executes the column read and **automatically initiates a precharge cycle** as soon as internal timing rules allow!
* **Write with Auto-Precharge (`WRA`)**: Address pin $A_{10} = 1$ during a `WRITE` command. The DRAM chip receives the write payload and **automatically initiates a precharge cycle** as soon as write recovery timing rules allow!

#### Why $A_{10}$ Encoding Is a Major Hardware Optimization:
Using $A_{10} = 1$ encoding eliminates the need to dispatch an explicit `PRECHARGE` command over the command bus! 

This saves command bus bandwidth, frees up command scheduling slots, and allows the memory controller to schedule requests to other banks without issuing closing commands.

---

### Auto-Precharge Timing Constraints ($t_{\text{RTP}}$ and $t_{\text{WR}}$)

When an Auto-Precharge read (`RDA`) or write (`WRA`) command is issued, when does the DRAM chip physically trigger the internal precharge?

The DRAM chip's internal state machine cannot trigger precharge immediately on the next clock cycle. It must wait for specific physical analog constraints to expire:

```text
AUTO-PRECHARGE INTERNAL TIMING CONSTRAINTS

 1. Read with Auto-Precharge (RDA) Internal Trigger Time:
    Precharge begins AFTER t_RTP (Read-to-Precharge Delay) AND t_RAS (Row Active Time) expire!
    t_RDA_start = max( t_RTP,  t_RAS - t_RCD )

 2. Write with Auto-Precharge (WRA) Internal Trigger Time:
    Precharge begins AFTER write payload is fully written AND t_WR (Write Recovery Time) expires!
    t_WRA_start = t_CWD + t_BURST + t_WR
```

Let us dissect the physical parameters governing auto-precharge timing:

#### 1. $t_{\text{RTP}}$ — Read-to-Precharge Delay (Read Auto-Precharge Constraint)
* **Definition**: The minimum physical time delay required between issuing a `READ` command and initiating an internal `PRECHARGE`.
* **Physical Cause**: Internal sense amplifier read-bus lines must finish sensing data before the Word Line can be de-asserted.
* **JEDEC Constraint**: For `RDA`, precharge starts after $t_{\text{RTP}}$ cycles from the `RDA` command, provided the row has also satisfied the minimum Row Active Time ($t_{\text{RAS}}$):

$$\text{Start Time}(\text{Precharge}_{\text{RDA}}) = T_{\text{RDA}} + \max\Big( t_{\text{RTP}}, \ (t_{\text{RAS}} - t_{\text{RCD}}) \Big)$$

Where:
* $T_{\text{RDA}}$ is the time instant when the `RDA` command was issued.
* $t_{\text{RTP}}$ is the Read-to-Precharge delay ($\approx 7.5\text{ ns}$).
* $t_{\text{RAS}}$ is the Row Active Time ($\approx 35\text{ ns}$).
* $t_{\text{RCD}}$ is the Row-to-Column Delay ($\approx 14\text{ ns}$).

---

#### 2. $t_{\text{WR}}$ — Write Recovery Time (Write Auto-Precharge Constraint)
* **Definition**: The minimum physical time delay required between the **completion of the final data word write burst** on the $DQ$ bus and initiating an internal `PRECHARGE`.

$$\text{Start Time}(\text{Precharge}_{\text{WRA}}) = T_{\text{WRA}} + t_{\text{CWD}} + t_{\text{BURST}} + t_{\text{WR}}$$

Where:
* $T_{\text{WRA}}$ is the time instant when the `WRA` command was issued.
* $t_{\text{CWD}}$ is the Column Write Delay (time from command to first write byte on $DQ$ bus, $\approx 10\text{ ns}$).
* $t_{\text{BURST}}$ is the time duration of the 64-byte data burst ($4\text{ memory clock cycles} \approx 2.5\text{ ns}$).
* $t_{\text{WR}}$ is the Write Recovery Time ($\approx 15\text{ ns}$).

```text
WRITE AUTO-PRECHARGE (WRA) TIMING CHRONOLOGY

 WRA Command Issued ──► Data Burst Transmitted on DQ Bus ──► Write Recovery t_WR ──► PRECHARGE STARTS!
                        ◄──────── t_CWD + t_BURST ───────►  ◄─── t_WR (15 ns) ──►
```

#### Why $t_{\text{WR}}$ Is Critical for Data Safety:
When a write payload is transmitted over the $DQ$ bus, the data bytes pass through the sense amplifiers and access transistors $M_1$ into the 1T1C storage capacitors. 

Re-charging microscopic capacitors through transistor channels during a write operation takes time ($t_{\text{WR}} \approx 15\text{ ns}$).

If the DRAM chip executed precharge before $t_{\text{WR}}$ expired, the Word Line would turn OFF prematurely, **trapping partial voltage inside the capacitors and corrupting the written data**!

---

## Architectural Comparison: Closed-Page vs. Open-Page Policies

To select the optimal page management policy for a specific multi-core computing platform, hardware engineers evaluate the trade-offs between Closed-Page and Open-Page policies across four critical architectural dimensions:

```text
CLOSED-PAGE VS OPEN-PAGE COMPREHENSIVE COMPARISON MATRIX

 Architectural Property │ Closed-Page Policy (Auto-Precharge)│ Open-Page Policy
────────────────────────┼────────────────────────────────────┼──────────────────────────────────
 Row Buffer Management  │ Precharged automatically after read│ Left Open in Row Buffer
 Best Workload Type     │ Random / Multi-Socket Server / NUMA│ Sequential / Vector / Graphics
 Page Hit Latency       │ t_RCD + t_CL (~24 ns)              │ t_CL (~10 ns - FASTEST!)
 Page Conflict Latency  │ t_RCD + t_CL (~24 ns - LOW!)       │ t_RP + t_RCD + t_CL (~38 ns - SLOW!)
 Command Bus Overhead   │ Zero extra commands (via A10=1)    │ Requires explicit PRECHARGE
 Multi-Core Interference│ IMMUNE (No bank thrashing)         │ HIGH (Cores thrash open rows)
 Memory Controller Power│ Higher (Frequent Activates)        │ Lower (Reuses open rows)
```

### 1. Multi-Core / Multi-Socket Thread Interference
In enterprise server processors containing 32, 64, or 128 execution cores, dozens of independent threads issue memory requests concurrently to the same DRAM banks.
* **Open-Page Failure**: Core 0 opens Row 10 in Bank 0. Before Core 0 can issue a second request, Core 5 dispatches a request targeting Row 99 in Bank 0, forcing a Row Buffer Conflict. Core 12 then requests Row 50... Open rows are constantly thrashed by inter-core thread competition, causing $90\%+$ of accesses to suffer $38\text{-ns}$ conflict penalties!
* **Closed-Page Solution**: By closing rows immediately via Auto-Precharge, the memory controller guarantees that every core finds the bank precharged ($24\text{ ns}$ access time). Thread interference penalties are completely eliminated!

### 2. Predictability in Real-Time Systems
In safety-critical embedded systems (such as automotive flight controllers or medical robotics), execution time predictability is paramount.
* **Open-Page**: Access latency fluctuates wildly between $10\text{ ns}$ (Hit) and $38\text{ ns}$ (Conflict), making worst-case execution time (WCET) bounds difficult to prove.
* **Closed-Page**: Every access takes a deterministic, bounded time ($t_{\text{RCD}} + t_{\text{CL}} = 24\text{ ns}$), simplifying real-time schedulability proofs!

---

## Solved Industrial Engineering Exercise: Quantitative Closed-Page vs. Open-Page Memory Access Trace and AMAT Analysis

To consolidate your complete mastery of Closed-Page policy mechanics, Auto-Precharge timing constraints ($t_{\text{RTP}}, t_{\text{WR}}$), row conflict latency comparisons, and multi-core access pattern optimizations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior memory subsystem architect auditing the memory controller for a $3.2\text{ GHz}$ 64-bit multi-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor connects to a DDR4-3200 DRAM memory module operating at a memory bus clock frequency $f_{\text{bus}} = 1,600\text{ MHz}$ ($T_{\text{bus}} = 0.625\text{ ns} = 625\text{ ps}$).

```text
3.2 GHz SERVER PROCESSOR WITH DDR4-3200 MEMORY CONTROLLER

 CPU Core (3.2 GHz) ──► [ Memory Controller ] ──► [ DDR4-3200 DRAM Array ]
 Clock T = 312.5 ps     Bus T = 625 ps            t_RCD=14ns, t_CL=10ns, t_RP=14ns
```

#### Memory System Hardware Specifications:
* $t_{\text{CL}}$ (CAS Read Latency) = $10.0\text{ ns}$ ($32\text{ CPU clock cycles}$).
* $t_{\text{RCD}}$ (Row-to-Column Activate Delay) = $14.0\text{ ns}$ ($44.8\text{ CPU clock cycles}$).
* $t_{\text{RP}}$ (Row Precharge Delay) = $14.0\text{ ns}$ ($44.8\text{ CPU clock cycles}$).
* $t_{\text{RTP}}$ (Read-to-Precharge Delay) = $7.5\text{ ns}$ ($24\text{ CPU clock cycles}$).
* $t_{\text{WR}}$ (Write Recovery Time) = $15.0\text{ ns}$ ($48\text{ CPU clock cycles}$).
* $t_{\text{CWD}}$ (Column Write Delay) = $10.0\text{ ns}$ ($32\text{ CPU clock cycles}$).
* $t_{\text{BURST}}$ (64-Byte Burst Time) = $2.5\text{ ns}$ ($8\text{ CPU clock cycles}$).

#### Workload Request Trace:
An 8-core server workload dispatches a sequence of **100,000 memory requests** to Bank 0 with a low Row Buffer Hit Rate of **$H_{\text{row}} = 20.0\%\quad (0.20)$**:
* $20.0\%\quad (20,000\text{ requests})$ target the open row (Row Buffer Hits).
* $80.0\%\quad (80,000\text{ requests})$ target different rows in Bank 0 (Row Buffer Conflicts under Open-Page).

#### Your Objective

1. Calculate the exact critical-path CPU stall latency (in nanoseconds and CPU clock cycles) for a read operation under:
   * Open-Page Policy Row Buffer Hit.
   * Open-Page Policy Row Buffer Conflict.
   * Closed-Page Policy (Auto-Precharge).
2. Calculate the Average Memory Access Time ($\text{AMAT}_{\text{Open}}$) and total execution time (in milliseconds) for the 100,000-request workload under the **Open-Page Policy**.
3. Calculate the Average Memory Access Time ($\text{AMAT}_{\text{Closed}}$) and total execution time (in milliseconds) for the 100,000-request workload under the **Closed-Page Policy**.
4. Calculate the exact **Performance Speedup Factor** of the Closed-Page Policy over the Open-Page Policy for this random multi-core workload.
5. Calculate the exact minimum time $t_{\text{WRA\_start}}$ (in nanoseconds after command dispatch) when internal auto-precharge actually begins executing inside the DRAM chip following a Write with Auto-Precharge (`WRA`) command.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Critical-Path Latencies for All Access Scenarios

Let us compute the critical-path CPU stall latency for each access type:

##### 1. Open-Page Policy Row Buffer Hit Latency ($T_{\text{open\_hit}}$):
$$\text{Command: READ}$$

$$T_{\text{open\_hit}} = t_{\text{CL}} = \mathbf{10.0 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{open\_hit}} = \frac{10.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{32 \text{ CPU Clock Cycles}}$$

##### 2. Open-Page Policy Row Buffer Conflict Latency ($T_{\text{open\_conflict}}$):
$$\text{Command Sequence: PRECHARGE } \to \text{ ACTIVATE } \to \text{ READ}$$

$$T_{\text{open\_conflict}} = t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} = 14.0\text{ ns} + 14.0\text{ ns} + 10.0\text{ ns} = \mathbf{38.0 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{open\_conflict}} = \frac{38.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{121.6 \text{ CPU Clock Cycles}}$$

##### 3. Closed-Page Policy Access Latency ($T_{\text{closed}}$):
$$\text{Command Sequence: ACTIVATE } \to \text{ READ with Auto-Precharge (RDA)}$$

Critical-path read data is delivered to the CPU at $t_{\text{RCD}} + t_{\text{CL}}$:

$$T_{\text{closed}} = t_{\text{RCD}} + t_{\text{CL}} = 14.0\text{ ns} + 10.0\text{ ns} = \mathbf{24.0 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{closed}} = \frac{24.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{76.8 \text{ CPU Clock Cycles}}$$

```text
CRITICAL-PATH LATENCY SUMMARY TABLE

 Scenario                    │ Command Sequence          │ Time (ns) │ CPU Clock Cycles
─────────────────────────────┼───────────────────────────┼───────────┼──────────────────
 Open-Page Row Hit           │ READ                      │  10.0 ns  │  32.0 Cycles
 Closed-Page (Auto-Precharge)│ ACTIVATE -> RDA           │  24.0 ns  │  76.8 Cycles
 Open-Page Row Conflict      │ PRECHARGE -> ACT -> READ  │  38.0 ns  │ 121.6 Cycles
```

---

#### Step 2: Analyze Workload Execution under Open-Page Policy

Workload = 100,000 requests. Row Buffer Hit Rate $H_{\text{row}} = 0.20$ ($20.0\%$).
* Row Hits ($20.0\%$): $20,000\text{ requests} \times 10.0\text{ ns} = 200,000\text{ ns}$.
* Row Conflicts ($80.0\%$): $80,000\text{ requests} \times 38.0\text{ ns} = 3,040,000\text{ ns}$.

##### 1. Calculate Average Memory Access Time ($\text{AMAT}_{\text{Open}}$):

$$\text{AMAT}_{\text{Open}} = (H_{\text{row}} \cdot T_{\text{open\_hit}}) + \Big( (1 - H_{\text{row}}) \cdot T_{\text{open\_conflict}} \Big)$$

$$\text{AMAT}_{\text{Open}} = (0.20 \times 10.0\text{ ns}) + (0.80 \times 38.0\text{ ns}) = 2.0\text{ ns} + 30.4\text{ ns} = \mathbf{32.40 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{Open}} = \frac{32.40\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{103.68 \text{ CPU Clock Cycles}}$$

##### 2. Calculate Total Execution Time ($T_{\text{exec,Open}}$):

$$T_{\text{exec,Open}} = 100,000 \text{ requests} \times 32.40\text{ ns/request} = \mathbf{3,240,000 \text{ nanoseconds}} \quad (3.24\text{ ms})$$

---

#### Step 3: Analyze Workload Execution under Closed-Page Policy

Under the Closed-Page Policy, every request finds the bank precharged, paying $T_{\text{closed}} = 24.0\text{ ns}$:

##### 1. Calculate Average Memory Access Time ($\text{AMAT}_{\text{Closed}}$):

$$\text{AMAT}_{\text{Closed}} = t_{\text{RCD}} + t_{\text{CL}} = 14.0\text{ ns} + 10.0\text{ ns} = \mathbf{24.00 \text{ nanoseconds}}$$

$$\text{CPU Cycles}_{\text{Closed}} = \frac{24.00\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{76.80 \text{ CPU Clock Cycles}}$$

##### 2. Calculate Total Execution Time ($T_{\text{exec,Closed}}$):

$$T_{\text{exec,Closed}} = 100,000 \text{ requests} \times 24.00\text{ ns/request} = \mathbf{2,400,000 \text{ nanoseconds}} \quad (2.40\text{ ms})$$

---

#### Step 4: Calculate Performance Speedup Factor

Let us calculate the performance speedup achieved by using the Closed-Page Policy over the Open-Page Policy for this random multi-core workload:

$$\text{Speedup} = \frac{\text{AMAT}_{\text{Open}}}{\text{AMAT}_{\text{Closed}}} = \frac{32.40\text{ ns}}{24.00\text{ ns}} = \frac{3,240,000\text{ ns}}{2,400,000\text{ ns}} = \mathbf{1.350\times \text{ Performance Advantage!}}$$

```text
CLOSED-PAGE VS OPEN-PAGE PERFORMANCE RESULTS (20% ROW HIT RATE)

 Memory Policy      │ AMAT (ns) │ CPU Stall Cycles │ Execution Time │ Speedup Factor
────────────────────┼───────────┼──────────────────┼────────────────┼──────────────────
 Open-Page Policy   │ 32.40 ns  │ 103.68 Cycles    │    3.24 ms     │ 1.00x (Baseline)
 Closed-Page Policy │ 24.00 ns  │  76.80 Cycles    │    2.40 ms     │ 1.35x FASTER!
                    │ (25.9% Cut)│ (26.9 Cys Saved)│ (0.84 ms Saved)│ (35% Gain!)
```

##### Engineering Conclusion:
Because the multi-core workload exhibited low spatial locality ($H_{\text{row}} = 20\% < 50\%$), the Closed-Page Policy reduced average memory access latency from $32.40\text{ ns}$ down to $24.00\text{ ns}$—delivering a **$1.35\times$ performance speedup ($35\%$ throughput gain)**!

---

#### Step 5: Calculate Internal Write Auto-Precharge Trigger Time ($t_{\text{WRA\_start}}$)

For a Write with Auto-Precharge (`WRA`) command issued at $t = 0\text{ ns}$, calculate when the DRAM chip internally initiates row precharging.

We use the Write Auto-Precharge timing equation:

$$\text{Start Time}(\text{Precharge}_{\text{WRA}}) = t_{\text{CWD}} + t_{\text{BURST}} + t_{\text{WR}}$$

Given $t_{\text{CWD}} = 10.0\text{ ns}$, $t_{\text{BURST}} = 2.5\text{ ns}$, $t_{\text{WR}} = 15.0\text{ ns}$:

$$\text{Start Time}(\text{Precharge}_{\text{WRA}}) = 10.0\text{ ns} + 2.5\text{ ns} + 15.0\text{ ns} = \mathbf{27.50 \text{ nanoseconds}}$$

$$\text{Start Time in CPU Cycles} = \frac{27.50\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{88 \text{ CPU Clock Cycles}}$$

##### Physical Timing Result:
Internal row precharging begins automatically inside the DRAM chip at $t = 27.50\text{ ns}$ ($88\text{ CPU clock cycles}$) after the `WRA` command was issued, ensuring $100\%$ write recovery safety for the cell capacitors!

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against DRAM principles:

1. **Threshold Comparison Check**:
   * Physical threshold $H_{\text{threshold}} = \frac{14}{14 + 14} = 50.0\%$.
   * Workload hit rate $H_{\text{row}} = 20.0\% < 50.0\% \implies$ Closed-Page is mathematically proven to be faster.
   * Speedup calculation ($1.35\times$) matches threshold theory $100\%$.
2. **Open-Page AMAT Verification**:
   * $\text{AMAT}_{\text{Open}} = 38.0 - (0.20 \times 28.0) = 38.0 - 5.6 = 24.0 + 8.4 = 32.40\text{ ns}$.
   * Matches component sum ($2.0 + 30.4 = 32.40\text{ ns}$) exactly!
3. **Write Recovery Safety Check**:
   * $t_{\text{WRA\_start}} = 27.50\text{ ns}$.
   * Total time until bank is fully precharged = $27.50\text{ ns} + t_{\text{RP}} (14.0\text{ ns}) = 41.50\text{ ns}$.
   * Precharge finishes at $t = 41.50\text{ ns}$, ready for the next `ACTIVATE` command.

All $H_{\text{threshold}}$ evaluations, closed-page critical path latencies, $A_{10}$ auto-precharge $t_{\text{WR}}$ trigger times, and speedup ratios evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Closed-Page Policy**: A memory controller row management policy that automatically precharges and closes a DRAM row immediately after a read or write operation completes, keeping memory banks in the precharged state to eliminate $t_{\text{RP}}$ precharge penalties ($14\text{ ns}$) during random or multi-threaded access patterns ($H_{\text{row}} < 50\%$).
* **Auto-Precharge Command (`RDA` / `WRA`)**: A JEDEC-standard DRAM hardware feature where asserting address pin $A_{10} = 1$ during a `READ` or `WRITE` command signals the DRAM chip's internal state machine to initiate an automatic row precharge as soon as write recovery ($t_{\text{WR}}$) or read ($t_{\text{RTP}}$) timing constraints expire, saving command bus bandwidth.
