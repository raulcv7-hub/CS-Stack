---
title: "First-Ready First-Come First-Served Command Scheduling Mechanics"
---

# First-Ready First-Come First-Served Command Scheduling Mechanics

## The In-Order Command Queue Bottleneck and Row Buffer Conflict Thrashing

In high-performance multi-core computing systems, the central memory controller acts as the single critical gateway between high-speed CPU execution pipelines and main Dynamic Random-Access Memory (DRAM) chips. Operating at multi-gigahertz clock frequencies, CPU cores continuously dispatch memory read (load) and memory write (store) requests into the memory controller's command queue.

To process these incoming requests, the memory controller translates physical memory addresses into specific command sequences (`PRECHARGE`, `ACTIVATE`, `READ`, `WRITE`) dispatched across the physical memory bus.

However, as established in physical 1T1C cell dynamics, accessing data inside a DRAM memory bank is an analog charge-redistribution process governed by rigid JEDEC timing parameters:
1. **Row Activation Delay ($t_{\text{RCD}} \approx 14\text{ ns}$)**: Opening a 64-byte memory line inside a DRAM bank requires activating a Word Line, charge-sharing onto bit lines, amplifying voltages using sense amplifiers, and latching the 8-Kilobyte row into the bank's **Row Buffer**.
2. **Column Access Strobe Latency ($t_{\text{CL}} \approx 10\text{ ns}$)**: Reading a 64-bit word off an ALREADY OPEN Row Buffer takes only 10 nanoseconds.
3. **Row Precharge Delay ($t_{\text{RP}} \approx 14\text{ ns}$)**: Closing an open row requires de-asserting the Word Line and precharging all bit line wires back to half supply voltage ($V_{DD}/2$).

Because an 8-Kilobyte Row Buffer can hold only **one single row at a time per bank**, memory requests fall into two distinct performance classes:
* **Row Buffer Hit (Page Hit)**: The requested address resides in the row that is *already open* in the Row Buffer. Access time $= t_{\text{CL}} \approx \mathbf{10 \text{ nanoseconds}}$.
* **Row Buffer Conflict (Page Conflict)**: The requested address resides in a *different row* than the one currently open in the Row Buffer! The controller must close the current row (`PRECHARGE`), open the new row (`ACTIVATE`), and read the column (`READ`). Access time $= t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} \approx \mathbf{38 \text{ nanoseconds}}$ ($3.8\times$ slower!).

Now, consider what happens if a memory controller processes incoming memory requests using a naive, in-order **First-Come First-Served (FCFS / FIFO)** scheduling policy:

```text
IN-ORDER FCFS COMMAND QUEUE THRASHING

 Command Queue Arrival Sequence (Strict FIFO Execution):
 Req 1: Read Bank 0, Row 10 (Bank 0 is Closed -> Row Miss)
 Req 2: Read Bank 0, Row 20 (Row Conflict! Row 20 != Row 10)
 Req 3: Read Bank 0, Row 10 (Row Conflict! Row 10 != Row 20)
 Req 4: Read Bank 0, Row 20 (Row Conflict! Row 20 != Row 10)
```

Look at the disastrous execution sequence forced by strict in-order FCFS scheduling:

1. **Req 1 (Row 10)**: Bank 0 opens Row 10 (`ACT` $\to$ `READ`). Takes **$24\text{ ns}$** ($t_{\text{RCD}} + t_{\text{CL}}$). Row 10 is now open in the Row Buffer.
2. **Req 2 (Row 20)**: FCFS executes Req 2 next. Row 20 conflicts with open Row 10! The controller closes Row 10 (`PRE`), opens Row 20 (`ACT`), and reads (`READ`). Takes **$38\text{ ns}$** ($t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$). Row 20 is now open.
3. **Req 3 (Row 10)**: FCFS executes Req 3 next. Row 10 conflicts with open Row 20! The controller closes Row 20 (`PRE`), opens Row 10 (`ACT`), and reads (`READ`). Takes **$38\text{ ns}$**! Row 10 is open again.
4. **Req 4 (Row 20)**: FCFS executes Req 4 next. Row 20 conflicts with open Row 10! The controller closes Row 10 (`PRE`), opens Row 20 (`ACT`), and reads (`READ`). Takes **$38\text{ ns}$**!

```text
IN-ORDER FCFS EXECUTION TIMELINE (ROW BUFFER THRASHING)

 Req 1 (Row 10) ──► [ ACT Row 10 ][ READ Col 0 ] (24 ns)
 Req 2 (Row 20) ──► [ PRE Row 10 ][ ACT Row 20 ][ READ Col 0 ] (38 ns) ──► CONFLICT!
 Req 3 (Row 10) ──► [ PRE Row 20 ][ ACT Row 10 ][ READ Col 0 ] (38 ns) ──► CONFLICT!
 Req 4 (Row 20) ──► [ PRE Row 10 ][ ACT Row 20 ][ READ Col 0 ] (38 ns) ──► CONFLICT!
 (Total Execution Time = 138 ns! Memory Bus efficiency drops below 20%!)
```

Look at the physical tragedy of this in-order execution sequence:
* The memory controller executed **three unnecessary precharges** and **three unnecessary activations**!
* It repeatedly closed Row 10 to open Row 20, and then closed Row 20 to open Row 10 again!
* This destructive ping-ponging is called **Row Buffer Thrashing**.
* Total execution time: **$138\text{ nanoseconds}$**. Over $80\%$ of memory bus cycles were wasted on redundant `PRECHARGE` and `ACTIVATE` command overheads, while actual data delivery ($DQ$) was stalled!

Why should a memory controller process requests in rigid arrival order when out-of-order request reordering can harvest massive row buffer hit performance?

To eliminate row buffer thrashing and maximize DRAM bus bandwidth, modern memory controllers use **First-Ready First-Come First-Served (FR-FCFS) Command Scheduling**.


### Strategy 1: The Strict FIFO Rule (First-Come First-Served / FCFS)

The bank manager enforces a rigid rule: *"Service customers strictly in the order they arrived in line, no matter what!"*

Look at what happens with four customers standing in line:
* **Customer 1 (Arrived 9:00 AM)**: Wants a form from **Binder A**.
* **Customer 2 (Arrived 9:01 AM)**: Wants a form from **Binder B**.
* **Customer 3 (Arrived 9:02 AM)**: Wants a form from **Binder A**.
* **Customer 4 (Arrived 9:03 AM)**: Wants a form from **Binder A**.

Trace the teller's actions under Strategy 1:
1. **Customer 1**: Teller walks to the vault, gets Binder A (14 mins), puts Binder A on the desk, and reads Customer 1's page (1 min). Total time = **15 mins**.
2. **Customer 2**: Teller must put Binder A away (14 mins), walk to the vault, get Binder B (14 mins), put Binder B on the desk, and read Customer 2's page (1 min). Total time = **29 mins**.
3. **Customer 3**: Teller must put Binder B away (14 mins), walk to the vault, get Binder A *again* (14 mins), put Binder A on the desk, and read Customer 3's page (1 min). Total time = **29 mins**.
4. **Customer 4**: Teller must put Binder A away (14 mins), get Binder A...

```text
STRICT FIFO TELLER WORKFLOW (FCFS STRATEGY)

 Customer 1 (Binder A) ──► Fetch Binder A (14m) + Read Page (1m)  ──► 15 Mins
 Customer 2 (Binder B) ──► Put A (14m) + Fetch B (14m) + Read (1m) ──► 29 Mins
 Customer 3 (Binder A) ──► Put B (14m) + Fetch A (14m) + Read (1m) ──► 29 Mins
 Customer 4 (Binder A) ──► Already open? NO, put away!            ──► 29 Mins
 (Total Time = 102 Minutes! Spent 84 minutes walking back and forth to vault!)
```

Look at how foolish this is! The teller spent **84 minutes running back and forth to the basement vault** opening and closing Binder A and Binder B repeatedly, while customers stood waiting for over an hour!


### The Starvation Threat and the Anti-Starvation Aging Clock

Now, consider a new threat under Strategy 2:
What if a continuous stream of new customers keep arriving every minute, all asking for pages from **Binder A**?

If the teller strictly prioritizes Binder A customers forever, **Customer 2 (who wants Binder B) will stand in line FOR DAYS AND NEVER BE SERVED!** This is **Customer Starvation**.

To prevent starvation, the manager installs an **Anti-Starvation Aging Clock**:
* Every customer receives a timestamp when they enter the line.
* If Customer 2's waiting time exceeds **30 minutes** (**Aging Threshold $A_{\text{max}}$**), Customer 2's priority is artificially boosted above all Binder A customers!
* The teller is forced to pause Binder A requests, put Binder A away, fetch Binder B, and service Customer 2!

This intelligent bank teller system is the exact physical analogue of **FR-FCFS Memory Command Scheduling**:
* The bank teller is the **Memory Controller Command Scheduler**.
* Document binders in the vault are **DRAM Rows (8 KB each)**.
* The reading tray on the desk is the **DRAM Bank Row Buffer**.
* The customer queue is the **Memory Controller Command Queue**.
* Serving Customers 1, 3, and 4 sequentially from Binder A is **Row Buffer Hit Reordering (First-Ready)**.
* The 30-minute aging threshold is the **Anti-Starvation Aging Threshold ($A_{\text{max}}$)**.


### The Two Fundamental Rules of FR-FCFS

Whenever the memory controller's command scheduler needs to select a request from its queue to dispatch across the memory bus, it applies two strict, sequential priority rules:

#### Rule 1: First-Ready Priority (Row Buffer Hit Optimization)
> **Rule 1**: Prioritize requests that target an **ALREADY OPEN Row Buffer** in their destination DRAM bank over requests that require opening a new row or precharging a conflicting row, **regardless of their arrival order in the queue**.

* **Hardware Action**: The scheduler checks the status of all DRAM bank row buffers. If Request $X$ arrived at $t = 10\text{ ns}$ and causes a Row Conflict, while Request $Y$ arrived later at $t = 15\text{ ns}$ and is a Row Buffer Hit, **Request $Y$ is reordered ahead of Request $X$**!

$$\text{Status}(Req_Y) == \text{Row\_Hit} \quad \mathbf{\text{AND}} \quad \text{Status}(Req_X) == \text{Row\_Conflict} \implies \text{Priority}(Req_Y) > \text{Priority}(Req_X)$$

#### Rule 2: First-Come First-Served Priority (Age Preservation)
> **Rule 2**: If multiple requests have the same readiness status (e.g., both are Row Buffer Hits, or both are Row Buffer Misses), **prioritize the older request that arrived earlier in time**.

$$\text{Status}(Req_A) == \text{Status}(Req_B) \quad \mathbf{\text{AND}} \quad \text{Age}(Req_A) > \text{Age}(Req_B) \implies \text{Priority}(Req_A) > \text{Priority}(Req_B)$$

Where:
* $\text{Status}(Req)$ indicates whether a request is a Row Buffer Hit, Row Buffer Miss, or Row Buffer Conflict.
* $\text{Age}(Req)$ is the time duration the request has spent waiting inside the command queue.
* $\text{Priority}(Req)$ is the calculated scheduling priority level.


## Primitive 2: Memory Command Queue Reordering and Out-of-Order Memory Execution

To execute FR-FCFS scheduling in physical silicon, the memory controller does not use a simple shift-register FIFO queue. It employs a **Content-Addressable Out-of-Order Command Queue Array**.

### Hardware Architecture of an Out-of-Order Command Queue

An out-of-order memory command queue consists of $M$ physical register entries (typically $M = 16, 32, \text{or } 64$ slots) monitored by parallel hardware evaluators:

```text
OUT-OF-ORDER COMMAND QUEUE HARDWARE ARCHITECTURE

 CPU Memory Requests ──► [ Command Queue Entry Array (32 Slots) ]
                               │
                               ├─────────────────────────────────┐
                               ▼                                 ▼
                 [ Bank State Tracker Array ]      [ Age Counter Array ]
                 (Tracks open rows for Bank 0..15)  (Increments every cycle)
                               │                                 │
                               └────────────────┬────────────────┘
                                                ▼
                                 [ FR-FCFS Priority Evaluator ]
                                                │
                                                ▼
                                 Dispatches Highest Priority Command!
```

Let us dissect the structural fields stored inside each entry of an out-of-order command queue:

```text
ANATOMY OF A COMMAND QUEUE ENTRY

 ┌───────┬────────────┬──────┬──────┬───────┬──────────────┬──────────────┐
 │ Valid │ Command    │ Bank │ Row  │ Column│ Age Counter  │ Ready Flag   │
 │ (V)   │ Type (R/W) │ ID   │ Addr │ Addr  │ (12 Bits)    │ (1 Bit)      │
 ├───────┼────────────┼──────┼──────┼───────┼──────────────┼──────────────┤
 │ 1 Bit │ 2 Bits     │ 4B   │ 17B  │ 10B   │ 12 Bits      │ 1 Bit        │
 └───────┴────────────┴──────┴──────┴───────┴──────────────┴──────────────┘
```

1. **Valid Bit ($V$)**: Indicates whether this slot holds an active pending memory request.
2. **Command Type**: Specifies whether the request is a Read (`READ`), Write (`WRITE`), or Control operation.
3. **Bank / Row / Column Addresses**: Decoded physical memory coordinates.
4. **Age Counter**: A 12-bit digital counter that increments on every clock cycle. Used to measure request age for Rule 2 (FCFS) and anti-starvation logic.
5. **Ready Flag**: A dynamic Boolean bit calculated continuously by comparing the entry's Bank and Row addresses against the **Bank State Tracker**:
   * $\text{Ready} = 1 \implies$ Entry's target bank is currently OPEN to the entry's target Row ($\text{Row Buffer Hit}$).
   * $\text{Ready} = 0 \implies$ Entry's target bank is closed or open to a different row ($\text{Row Miss/Conflict}$).


## Real-World Engineering Realities: Starvation Prevention, Aging Thresholds, and Write Batching

In commercial memory controller design (such as controllers in Intel Core, AMD Zen, and ARM Neoverse processors), implementing raw FR-FCFS introduced two critical edge-case failures that required advanced hardware mitigations: **Request Starvation** and **Read/Write Bus Turnaround Overhead**.


### 2. Read/Write Bus Batching ($t_{\text{WTR}} / t_{\text{RTW}}$ Turnaround Delays)

On a physical DDR memory bus, data wires ($DQ$) are bi-directional.
* Reading data requires DRAM chips to drive $DQ$ wires while the memory controller listens.
* Writing data requires the memory controller to drive $DQ$ wires while DRAM chips listen.

Switching the direction of the data bus wires between a `READ` command and a `WRITE` command requires turning off output transistor drivers and waiting for electrical reflections to damp down.

JEDEC standards mandate two **Bus Turnaround Delays**:
1. **Write-to-Read Delay ($t_{\text{WTR}}$)**: Delay required when switching from a `WRITE` to a `READ` command ($\approx 15 \text{ to } 25\text{ ns}$).
2. **Read-to-Write Delay ($t_{\text{RTW}}$)**: Delay required when switching from a `READ` to a `WRITE` command ($\approx 10 \text{ to } 15\text{ ns}$).

```text
BUS TURNAROUND PENALTY ON ALTERNATING READS/WRITES

 Command Stream : [ READ ] ──► (t_RTW Delay: 15ns) ──► [ WRITE ] ──► (t_WTR Delay: 25ns) ──► [ READ ]
 (Alternating reads and writes wastes 40 ns of bus time on wire turnaround delays!)
```

#### The Hardware Fix: Read/Write Batching
To eliminate bus turnaround delays, FR-FCFS schedulers incorporate **Read/Write Batching**:

```text
READ/WRITE BATCHING OPTIMIZATION

 Un-Batched Alternating Stream : [ R1 ][ W1 ][ R2 ][ W2 ][ R3 ][ W3 ] (5 Turnaround Delays!)

 Batched Stream               : [ R1 ][ R2 ][ R3 ] ──(1 Turnaround)──► [ W1 ][ W2 ][ W3 ]
                                (Zero turnaround delays inside batches!)
```

1. **Read Batch Phase**: The scheduler services a batch of 8 to 16 `READ` commands continuously. Data flows from DRAM to CPU with zero turnaround delays.
2. **High-Watermark Switch**: When the Write Buffer fills up to a high-watermark threshold (e.g., $80\%$ full), the scheduler executes **ONE single bus turnaround** ($t_{\text{RTW}}$) and switches to...
3. **Write Batch Phase**: The scheduler services a batch of 8 to 16 `WRITE` commands continuously, draining the Write Buffer into DRAM.
4. The scheduler executes **ONE bus turnaround** ($t_{\text{WTR}}$) and returns to the Read Batch phase.

Read/Write Batching reduces bus turnaround delays by over **$85\%$**, maximizing sustained memory bus throughput!


### Scenario and Parameters

You are a principal memory systems architect auditing the memory controller for a $3.2\text{ GHz}$ 8-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor connects to a DDR4-3200 DRAM memory module operating at a bus clock frequency $f_{\text{bus}} = 1,600\text{ MHz}$ ($T_{\text{bus}} = 0.625\text{ ns} = 625\text{ ps}$).

```text
3.2 GHz SERVER PROCESSOR WITH FR-FCFS MEMORY CONTROLLER

 CPU Cores (3.2 GHz) ──► [ Out-of-Order Command Queue (8 Slots) ] ──► DDR4-3200 DRAM
 Clock T = 312.5 ps      FR-FCFS Scheduler + Anti-Starvation         Bus T = 625 ps
```

#### DDR4-3200 Timing Parameters (in Memory Bus Cycles $t_{\text{CK}} = 0.625\text{ ns}$):
* $t_{\text{CL}}$ (CAS Read Latency) = $14\text{ }t_{\text{CK}} = 8.75\text{ ns}$ ($28\text{ CPU cycles}$).
* $t_{\text{RCD}}$ (Row-to-Column Activate Delay) = $14\text{ }t_{\text{CK}} = 8.75\text{ ns}$ ($28\text{ CPU cycles}$).
* $t_{\text{RP}}$ (Row Precharge Delay) = $14\text{ }t_{\text{CK}} = 8.75\text{ ns}$ ($28\text{ CPU cycles}$).
* $t_{\text{RAS}}$ (Row Active Time) = $36\text{ }t_{\text{CK}} = 22.50\text{ ns}$ ($72\text{ CPU cycles}$).
* Anti-Starvation Aging Threshold: $A_{\text{max}} = 100\text{ bus clock cycles}$ ($62.5\text{ ns}$).

#### Initial Subsystem State at Bus Cycle 0 ($t = 0.0\text{ ns}$):
* **Bank 0**: Currently has **Row 10 OPEN in its Row Buffer** ($t_{\text{RAS}}$ satisfied).
* **Bank 1**: Currently **Precharged / Closed**.

#### Command Queue State at Bus Cycle 0 ($t = 0.0\text{ ns}$):
The 6-slot command queue holds six pending memory read requests (`READ`):

```text
INITIAL COMMAND QUEUE STATE (BUS CYCLE 0)

 Slot ID │ Target Address       │ Arrival Cycle │ Row Status         │ Initial Age
─────────┼──────────────────────┼───────────────┼────────────────────┼─────────────
 Req 1   │ Bank 0, Row 20, Col 0│ Bus Cycle 0   │ Conflict (Row 10)  │ 0 Cycles
 Req 2   │ Bank 0, Row 10, Col 8│ Bus Cycle 1   │ HIT (Row 10 Open!) │ 0 Cycles
 Req 3   │ Bank 1, Row 50, Col 0│ Bus Cycle 2   │ Closed (Bank 1)    │ 0 Cycles
 Req 4   │ Bank 0, Row 10, Col 16│Bus Cycle 3   │ HIT (Row 10 Open!) │ 0 Cycles
 Req 5   │ Bank 0, Row 20, Col 8│ Bus Cycle 4   │ Conflict (Row 10)  │ 0 Cycles
 Req 6   │ Bank 0, Row 10, Col 24│Bus Cycle 5   │ HIT (Row 10 Open!) │ 0 Cycles
```

#### Your Objective

1. Trace the exact request execution sequence and bus dispatch cycles ($t_{\text{bus}}$ in $t_{\text{CK}}$) under a **Naive In-Order FCFS Scheduler** (strict arrival order: Req 1 $\to$ Req 2 $\to$ Req 3 $\to$ Req 4 $\to$ Req 5 $\to$ Req 6). Calculate total execution time.
2. Trace the exact request execution sequence and bus dispatch cycles under the **FR-FCFS Scheduler** (First-Ready First-Come First-Served). Show how FR-FCFS reorders requests to maximize Row Buffer Hits.
3. Calculate total execution time (in nanoseconds) and the **Performance Speedup Factor** of FR-FCFS over FCFS.
4. Verify whether any request exceeded the Anti-Starvation Aging Threshold ($A_{\text{max}} = 100\text{ cycles}$).
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Analyze Out-of-Order FR-FCFS Execution

Now let us trace the same queue under the **FR-FCFS Scheduler**:

##### Priority Evaluation at Bus Cycle 0 ($t = 0.0\text{ ns}$):
* Bank 0 has **Row 10 OPEN**.
* Scheduler evaluates Readiness for all 6 requests:
  * **Req 2 (Row 10)**: READY (Row Buffer Hit!).
  * **Req 4 (Row 10)**: READY (Row Buffer Hit!).
  * **Req 6 (Row 10)**: READY (Row Buffer Hit!).
  * Req 1, 3, 5: NOT READY (Conflict or Closed).
* **FR-FCFS Rule 1 (First-Ready) Fires!**
  * Schedulers selects among Req 2, 4, 6 using Rule 2 (FCFS / Age): Req 2 arrived first at Cycle 1!
  * **Req 2 IS REORDERED TO THE FRONT OF THE QUEUE!**


##### 4. Remaining Queue Requests (Req 1, Req 3, Req 5):
At Bus Cycle 3, no more requests target Row 10. All remaining requests are NOT READY.
* Rule 2 (FCFS / Age) applies among Req 1, Req 3, Req 5: **Req 1 is oldest (arrived Cycle 0)!**
* Bus Cycle 3: Issue `PRECHARGE Bank 0` ($t_{\text{RP}} = 14\text{ cycles}$).
* Parallel Bank Activation: At Bus Cycle 4, Bank 1 is idle. Issue **`ACTIVATE Bank 1, Row 50` (Req 3)** in parallel!

##### 5. Req 1 (`Bank 0, Row 20, Col 0` — Conflict execution):
* Cycle 3: `PRECHARGE Bank 0` ($14\text{ cycles}$).
* Cycle 17: `ACTIVATE Bank 0, Row 20` ($14\text{ cycles}$).
* Cycle 31: `READ Bank 0, Col 0` ($t_{\text{CL}} = 14\text{ cycles}$). Data arrives at **Cycle 45** ($28.125\text{ ns}$).

##### 6. Req 5 (`Bank 0, Row 20, Col 8` — Row Hit on Row 20!):
* Row 20 is now open in Bank 0!
* Bus Cycle 32: Issue **`READ Bank 0, Col 8`**. Data arrives at **Cycle 46** ($28.75\text{ ns}$).

##### 7. Req 3 (`Bank 1, Row 50, Col 0` — Parallel Bank Access!):
* Bank 1 was activated at Cycle 4 ($t_{\text{RCD}}$ completed at Cycle 18).
* Bus Cycle 33: Issue **`READ Bank 1, Col 0`**. Data arrives at **Bus Cycle 47** ($29.375\text{ ns}$).

```text
FR-FCFS REORDERED EXECUTION TIMELINE

 Bus Cycle │ Command Dispatched │ Target Request  │ Resulting Action
───────────┼────────────────────┼─────────────────┼───────────────────────────
   Cycle 0 │ READ Bank 0, Col 8 │ Req 2 (Row 10)  │ Row 10 Hit (Reordered!)
   Cycle 1 │ READ Bank 0, Col 16│ Req 4 (Row 10)  │ Row 10 Hit (Reordered!)
   Cycle 2 │ READ Bank 0, Col 24│ Req 6 (Row 10)  │ Row 10 Hit (Reordered!)
   Cycle 3 │ PRECHARGE Bank 0   │ Req 1 (Row 20)  │ Closing Row 10
   Cycle 4 │ ACTIVATE Bank 1    │ Req 3 (Bank 1)  │ Opening Bank 1 (Parallel!)
  Cycle 17 │ ACTIVATE Bank 0    │ Req 1 (Row 20)  │ Opening Row 20
  Cycle 31 │ READ Bank 0, Col 0 │ Req 1 (Row 20)  │ Data Arrives Cycle 45
  Cycle 32 │ READ Bank 0, Col 8 │ Req 5 (Row 20)  │ Row 20 Hit (Reordered!)
  Cycle 33 │ READ Bank 1, Col 0 │ Req 3 (Bank 1)  │ Data Arrives Cycle 47!
```


#### Step 4: Verify Anti-Starvation Threshold ($A_{\text{max}}$)

* Maximum Age threshold: $A_{\text{max}} = 100\text{ bus cycles}$.
* Req 1 arrived at Cycle 0. Req 1 was serviced at Bus Cycle 31 ($31\text{ cycles}$ age).
* $31\text{ cycles} < 100\text{ cycles} \implies$ **Req 1 did NOT exceed $A_{\text{max}}$**.
* No starvation threshold overrides were triggered. The reordering was $100\%$ valid.


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **First-Ready First-Come First-Served (FR-FCFS)**: An out-of-order memory command scheduling algorithm that prioritizes requests targeting currently open Row Buffers (First-Ready) over closed or conflicting row requests, falling back to arrival order (First-Come) among requests with equal readiness, maximizing memory bus bandwidth utilization.
* **Memory Command Queue Reordering**: The hardware capability of an out-of-order memory controller to inspect all pending requests in its command queue, reordering requests to harvest Row Buffer Hits and batch read/write transfers while using anti-starvation aging counters ($A_{\text{max}}$) to enforce forward progress for all software threads.
