content/00-digital-hardware-foundations/11-energy-efficient-microarchitecture/lessons/04-microarchitectural-power-management/02-processor-performance-states/02-power-aware-instruction-scheduling.md
# Power-Aware Instruction Scheduling and Energy-Efficient Issue Queue Architecture

In high-performance out-of-order superscalar microarchitectures, the instruction execution pipeline is built to maximize Instruction-Level Parallelism (ILP). A wide out-of-order core continuously fetches, decodes, and dispatches instructions into a centralized **Issue Queue** (also known as a Reservation Station Array) holding 64 to 128 instruction slots. Every clock cycle, the hardware scheduler scans the issue queue, identifies instructions whose input operands are ready, and dispatches up to 4, 6, or 8 instructions simultaneously into parallel execution units—such as integer ALUs, floating-point adders, and wide 512-bit SIMD vector engines.

In traditional out-of-order scheduling, the issue queue operates under a single, greedy objective: **Dispatch as many ready instructions as possible on every single clock cycle**, regardless of their power consumption or thermal cost.

However, different instruction types have vastly different physical power requirements:
* A simple integer addition instruction (`ADD r1, r2, r3`) toggles a few hundred logic gates in an integer ALU, dissipating a small dynamic power payload ($P_{\text{ADD}} \approx 2\text{ mW}$).
* A 512-bit vector floating-point multiply-accumulate instruction (`VFMA v1, v2, v3`) toggles over $50,000$ high-drive logic gates across a wide vector execution tree, dissipating a massive dynamic power payload ($P_{\text{VFMA}} \approx 16\text{ mW}$—eight times higher than an integer addition!).

Now, consider the physical catastrophe that occurs when an un-constrained issue queue encounters a dense vector compute loop and dispatches four 512-bit `VFMA` instructions simultaneously into adjacent execution units on the exact same clock cycle:

```text
UN-CONSTRAINED INSTRUCTION ISSUE POWER SPIKE DISASTER

 Issue Queue (Dispatches 4 VFMA Instructions Simultaneously)
 ┌─────────────────────────────────────────────────────────────┐
 │ VFMA 0 (16 mW) | VFMA 1 (16 mW) | VFMA 2 (16 mW) | VFMA 3 (16mW)│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 64-Bit / 512-Bit Vector Execution Units (1 mm^2 Silicon Area)
 ┌─────────────────────────────────────────────────────────────┐
 │ TOTAL INSTANTANEOUS POWER SURGE = 64 MILLIWATTS!            │
 │ Local Power Density Spikes > 350 W/cm^2!                    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 On-Die Thermal Sensor Fires Interrupt: Junction Temp > 110°C!
 Hardware Forces Emergency Frequency Drop: 3.2 GHz -> 1.6 GHz for 10,000 Cycles!
 (Greedy issue triggered thermal throttling, cutting core IPC in half!)
```

Trace the physical thermal collapse step-by-step:
1. The un-constrained scheduler sees four ready `VFMA` instructions and dispatches all four simultaneously into adjacent vector execution units on Cycle 1.
2. The local switching activity factor ($\alpha$) in the floating-point vector block surges to near $1.0$.
3. Instantaneous execution power spikes to **$64\text{ Milliwatts}$** in a tiny $1\text{ mm}^2$ region of silicon, creating a massive local power density exceeding $350\text{ W/cm}^2$.
4. **The Thermal Throttling Collapse**: Local junction temperature ($T_{\text{junction}}$) spikes past $110^\circ\text{C}$ in milliseconds. An on-die digital thermal sensor fires an emergency alert, forcing the power management unit to **halve the master clock frequency ($3.2\text{ GHz} \to 1.6\text{ GHz}$)** for the next 10,000 clock cycles to prevent the silicon die from melting!
5. **The Performance Penalty**: By greedily issuing four high-power vector instructions on a single cycle, the scheduler triggered a severe thermal throttling event that dropped the core's clock speed by $50\%$ for thousands of cycles!

Furthermore, the 64-entry issue queue itself is a massive energy sink: on every single clock cycle, the issue queue broadcasts $4 \text{ to } 8$ result tags across $64 \text{ to } 128$ entry comparator circuits ($512\text{ to } 1,024\text{ tag comparisons per cycle}$), burning up to **$25\%$ of the total core dynamic power budget** merely searching for ready instructions!

To eliminate thermal throttling spikes and cut issue queue dynamic power waste, modern energy-efficient microarchitectures employ **Power-Aware Instruction Scheduling** and **Energy-Efficient Issue Queues**.

---

## The Airport Tower Dispatcher and the Ticket Counter Loudspeaker

To build an intuitive, crystal-clear mental model of power-aware instruction scheduling, cycle power budgets, and low-power sub-banked issue queues before analyzing Content-Addressable Memory (CAM) comparator circuits, power-weighting algorithms, and thermal equations, let us consider two everyday analogies: an airport runway traffic controller and an automated bank ticket waiting room.

### Analogy 1: The Airport Runway Traffic Controller (Power-Aware Instruction Scheduling)

Imagine an airport air-traffic controller (**An Out-of-Order Instruction Scheduler**) managing aircraft departures (**Instruction Dispatches**) on a single physical runway (**The Execution Stage**).

```text
THE AIRPORT RUNWAY DISPATCHER ANALOGY

 Un-Constrained Greedy Dispatch (Thermal Throttling Collapse):
 4 Heavy Jumbo Jets (Vector VFMA) Dispatched Simultaneously!
 ┌─────────────────────────────────────────────────────────────┐
 │ [Jumbo 0] [Jumbo 1] [Jumbo 2] [Jumbo 3]                     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Combined Jet Engine Heat Blast Exceeds Runway Thermal Limit!
 Runway closed for 30 minutes to cool down! (50% Speed Drop!)

 Power-Aware Paced Dispatch (Interleaved Execution):
 Interleaves 1 Jumbo Jet + 2 Small Planes per cycle!
 ┌─────────────────────────────────────────────────────────────┐
 │ [Jumbo 0 (16mW)] [Small Plane 1 (2mW)] [Small Plane 2 (2mW)]│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Runway Heat stays 100% within safe limits!
 (Runway NEVER closes! Total weekly flight throughput increases by 80%!)
```

There are two types of aircraft waiting on the taxiway:
* **Heavy Jumbo Jets (512-bit Vector `VFMA` Instructions)**: They burn massive fuel and generate immense jet engine heat blasts ($16\text{ mW}$ each).
* **Small Two-Seater Planes (Simple Integer `ADD` Instructions)**: They burn very little fuel and generate minimal heat ($2\text{ mW}$ each).

Let us compare two dispatch policies used by the controller:

#### Policy A: Un-Constrained Greedy Dispatch (Standard OoO Scheduler)
The controller looks at the taxiway, sees four Jumbo Jets ready to take off, and launches **all four Jumbo Jets on the exact same second**!
* The combined exhaust blast of four Jumbo Jets creates an intense heat wave above the tarmac (**Thermal Hotspot Spike**).
* The airport safety authority immediately closes the runway for 30 minutes to allow the tarmac to cool down (**Thermal Throttling Frequency Drop**)!
* Total flight throughput collapses because the runway sits closed for half the day!

#### Policy B: Power-Aware Paced Dispatch (Power-Aware Scheduler)
The controller assigns a **Heat Weight** to each aircraft (Jumbo Jet $= 8\text{ units}$, Two-Seater $= 1\text{ unit}$) and enforces a **Maximum Per-Second Heat Budget ($12\text{ units}$)**:
* When four Jumbo Jets are ready, the controller sees that launching two Jumbo Jets ($8 + 8 = 16\text{ units}$) would exceed the heat budget ($12\text{ units}$).
* The controller launches **one Jumbo Jet ($8\text{ units}$) and two Two-Seater Planes ($1 + 1 = 2\text{ units}$)** on Cycle 1 ($10\text{ units total} \le 12\text{ units}$).
* On Cycle 2, it launches the second Jumbo Jet and two more Two-Seater Planes.
* The tarmac temperature remains cool and stable! **The runway NEVER closes**, and total weekly flight throughput increases by **$80\%$**!

---

### Analogy 2: The Ticket Counter Loudspeaker vs. Personal Room Beepers (Energy-Efficient Issue Queues)

Now, consider how 64 customers (**64 Issue Queue Entries**) wait for their numbers to be called at an automated municipal service center.

```text
THE TICKET COUNTER LOUDSPEAKER ANALOGY

 Un-Optimized Loudspeaker System (Traditional CAM Issue Queue):
 1 Ticket Number Ready ──► Broadcast over 64 Loudspeakers!
                            │
                            ▼
 ALL 64 Customers Stand Up, Read Ticket, & Compare Numbers!
 (63 customers sit back down annoyed -> 512 comparisons burn massive power!)

 Energy-Efficient Sub-Banked System (Gated Comparators):
 Customers divided into 8 Small Rooms of 8 People.
 Customers whose paperwork isn't ready TURN OFF THEIR SPEAKERS!
 ONLY 3 People in Room 1 check their tickets! (85% Energy Saved!)
```

#### Strategy A: Un-Optimized Loudspeaker System (Traditional CAM Issue Queue)
All 64 customers sit in one giant room.
* Whenever 1 ticket number is ready at the counter, a loud announcement is broadcast over 64 individual loudspeakers (**Common Data Bus Tag Broadcast**).
* **All 64 customers stand up, check their tickets, compare the number, and 63 customers sit back down** ($512\text{ tag comparisons per cycle}$)!
* The waiting room is chaotic, loud, and burns massive electricity running 64 loudspeakers every single second!

#### Strategy B: Sub-Banked Room System with Personal Beepers (Energy-Efficient Issue Queue)
Customers are divided into eight small, private waiting rooms holding 8 people each (**Sub-Banked Issue Queue**).
* Customers whose paperwork is not even ready yet (**Waiting for Un-Ready Operands**) **turn OFF their speakers completely** (**Validity-Gated Tag Matching**)!
* When a ticket is ready, the system beeps ONLY the speakers of customers whose paperwork is ready inside Room 1.
* Instead of 64 people standing up, **only 3 people check their tickets**!
* Electrical power consumption drops by **$85\%$**, and the waiting room operates quietly and efficiently!

This sub-banked system is the exact physical analogue of **Power-Aware Instruction Scheduling and Energy-Efficient Issue Queues**:
* Jumbo Jets are **512-Bit Vector `VFMA` Instructions**.
* Two-Seater Planes are **Simple Integer `ADD` Instructions**.
* Runway heat limits are **Thermal Design Power (TDP) Hotspot Thresholds**.
* Interleaving aircraft is **Power-Budget-Constrained Instruction Scheduling**.
* Loudspeakers broadcasting numbers are **Common Data Bus (CDB) Result Tag Broadcasts**.
* Turning off speakers for unprepared customers is **Validity-Gated Tag Comparator Gating**.

---

## The Microarchitecture of Power-Aware Instruction Scheduling

To implement power-aware instruction scheduling in physical hardware, the instruction dispatch and issue units are augmented with a **Power-Budget Tracking Engine**.

```text
POWER-AWARE INSTRUCTION SCHEDULER ARCHITECTURE

 Instruction Decode Stage
 ┌─────────────────────────────────────────────────────────────┐
 │ Assigns Power Weight (w_power) to Each Instruction Opcode   │
 │  * ADD / SUB  : w_power = 1  (Low Power: 2 mW)              │
 │  * LOAD / STR : w_power = 2  (Medium Power: 4 mW)           │
 │  * VFMA Vector: w_power = 8  (High Power: 16 mW)            │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Issue Queue & Power-Budget Scheduler
 ┌─────────────────────────────────────────────────────────────┐
 │ CYCLE POWER-BUDGET SCHEDULER (W_power_max = 12)             │
 │  * Sums w_power for candidate ready instructions.            │
 │  * IF Sum > W_power_max -> DEFER HIGH-POWER INSTRUCTION!    │
 │  * Selects lower-power ready instruction instead!           │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Dispatches Power-Balanced Instruction Bundle
 Parallel Execution Units (ALUs, FPUs, Vector Engines)
 (Peak power capped below thermal threshold; zero thermal throttling!)
```

---

### Step 1: Opcode Power-Weighting in Instruction Decode

During the instruction decode stage, an opcode lookup table assigns a 4-bit **Power Weight ($w_{\text{power}}$)** to each incoming instruction based on the physical switching capacitance ($C_L$) of its target execution unit:

$$\text{Power Weight } w_{\text{power}}(i) \propto P_{\text{exec}}(i) = \alpha \cdot C_{\text{unit}} \cdot V_{DD}^2 \cdot f$$

```text
INSTRUCTION OPCODE POWER-WEIGHTING MATRIX

 Instruction Opcode Class │ Target Execution Unit │ Power Weight (w_power) │ Dynamic Power (mW)
──────────────────────────┼───────────────────────┼────────────────────────┼────────────────────
 NOP / Simple Shift       │ Barrel Shifter / Reg  │       w = 0            │      0.5 mW
 Integer ADD / SUB / LOGIC│ Integer ALU           │       w = 1            │      2.0 mW
 Integer MUL / DIV        │ Iterative Multiplier  │       w = 3            │      6.0 mW
 Memory LOAD / STORE      │ Load-Store Unit       │       w = 2            │      4.0 mW
 FP ADD / SUB             │ Scalar FPU            │       w = 4            │      8.0 mW
 512-Bit Vector VFMA      │ Vector FMA Engine     │       w = 8            │     16.0 mW
```

---

### Step 2: Cycle Power-Budget Enforcement ($W_{\text{power\_max}}$)

The issue scheduler maintains a programmable **Cycle Power Budget Constraint ($W_{\text{power\_max}}$)** that represents the maximum total power weight allowed to be dispatched into execution units on a single clock cycle:

$$\mathbf{\sum_{m=1}^{W_{\text{issued}}} w_{\text{power}}(i_m) \le W_{\text{power\_max}}}$$

Where:
* $W_{\text{issued}}$ is the number of instructions selected for issue on cycle $t$ ($W_{\text{issued}} \le W_{\text{issue\_width}}$).
* $w_{\text{power}}(i_m)$ is the power weight of the $m$-th selected instruction.
* $W_{\text{power\_max}}$ is the maximum allowable cycle power weight threshold configured by the thermal management engine.

---

### The Power-Aware Scheduling Selection Algorithm

When the issue queue evaluates ready instructions on cycle $t$:

```text
POWER-AWARE SCHEDULING SELECTION ALGORITHM

 Candidate Ready Instructions in Issue Queue
   │
   ▼
 Sort Candidate Instructions by Age & Priority
   │
   ▼ Loop through candidates:
 Is (Current_Power_Sum + w_power(Candidate)) <= W_power_max?
   │
   ├─────────── YES ────────────┐
   │                            │ NO (Power Budget Exceeded!)
   ▼                            ▼
 Issue Candidate Instruction!   DEFER CANDIDATE TO NEXT CYCLE!
 Update Current_Power_Sum       Check next lower-power candidate!
```

1. **Candidate Identification**: The scheduler identifies all instructions in the queue whose input operands are ready ($R_1 = 1 \land R_2 = 1$).
2. **Priority Ordering**: Ready instructions are sorted by age (oldest instructions first to preserve program progress) and critical-path status.
3. **Power Budget Evaluation**:
   * The scheduler evaluates the first ready instruction $i_1$ (e.g., a 512-bit `VFMA` with $w = 8$).
   * $w(i_1) = 8 \le W_{\text{power\_max}} (12) \implies$ **Issue $i_1$!** $\text{Current\_Power\_Sum} \Leftarrow 8$.
   * The scheduler evaluates the second ready instruction $i_2$ (a second 512-bit `VFMA` with $w = 8$).
   * $\text{Current\_Power\_Sum} + w(i_2) = 8 + 8 = 16 > W_{\text{power\_max}} (12) \implies \mathbf{\text{POWER BUDGET EXCEEDED!}}$
   * **The Power-Aware Deferral**: The scheduler **DEFERS $i_2$ to the next clock cycle**!
   * The scheduler checks the third ready instruction $i_3$ (an integer `ADD` with $w = 1$).
   * $8 + 1 = 9 \le 12 \implies \mathbf{\text{Issue } i_3!}$ $\text{Current\_Power\_Sum} \Leftarrow 9$.

#### Microarchitectural Result:
Instead of issuing two heavy vector `VFMA` instructions together ($16 + 16 = 32\text{ mW}$ spike), the scheduler issued one `VFMA` and two integer `ADD` instructions ($16 + 2 + 2 = 20\text{ mW}$). 

Peak execution power is capped, local thermal hotspots are smoothed across time, and **thermal throttling is $100\%$ prevented**!

---

## Energy-Efficient Issue Queue Architecture

While power-aware scheduling manages the power of *downstream execution units*, the **Issue Queue itself** is a major source of dynamic power consumption inside an out-of-order core.

To understand why traditional Content-Addressable Memory (CAM) issue queues burn so much power, we must analyze the physical mechanics of **Result Tag Broadcasting**.

```text
TRADITIONAL CAM ISSUE QUEUE TAG BROADCAST (POWER DRAIN)

 Common Data Bus (CDB) Result Tags (Tag Broadcast: 4 Tags x 8 Bits)
 ═══════════════╤═══════════════╤═══════════════╤═══════════════
                │               │               │
                ▼               ▼               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 64-ENTRY CAM ISSUE QUEUE (512 Parallel Tag Comparators)     │
 │ Slot 0  : [ Tag_src1 vs CDB ] [ Tag_src2 vs CDB ] (Active!) │
 │ Slot 1  : [ Tag_src1 vs CDB ] [ Tag_src2 vs CDB ] (Active!) │
 │ ...                                                         │
 │ Slot 63 : [ Tag_src1 vs CDB ] [ Tag_src2 vs CDB ] (Active!) │
 └─────────────────────────────────────────────────────────────┘
  (ALL 512 comparators evaluate on EVERY cycle -> 25% of core power wasted!)
```

### The $O(N_{\text{entries}} \cdot N_{\text{cdb}})$ Tag Comparison Problem

In a 64-entry issue queue ($N_{\text{entries}} = 64$):
* Each entry contains 2 source operand tag registers ($src1$ and $src2$).
* On every clock cycle, up to 4 execution units complete calculations and broadcast their result tags ($N_{\text{cdb}} = 4$) on the Common Data Bus (CDB).
* Every single entry in the queue compares its $src1$ and $src2$ tags against all 4 broadcast result tags:

$$\mathbf{\text{Total Tag Comparisons per Cycle} = 2 \cdot N_{\text{entries}} \cdot N_{\text{cdb}} = 2 \cdot 64 \cdot 4 = 512 \text{ Comparisons/Cycle}}$$

Executing 512 multi-bit comparator evaluations every single clock cycle causes high-capacitance match lines inside the CAM array to charge and discharge continuously, burning up to **$25\%$ of the total core dynamic power budget**!

---

### Low-Power Modification 1: Validity-Gated Tag Matching

Why should an issue queue slot evaluate its tag comparator if its operand is **ALREADY READY**?

If a 64-bit instruction's source operand $src1$ was already loaded from the register file during decode, its ready bit is set to $1$ ($R_1 = 1$). That operand is waiting for nothing!

In a traditional CAM issue queue, the comparator for $src1$ continues evaluating against CDB broadcasts on every single cycle, wasting power comparing an operand that is already present!

#### The Validity-Gated Comparator Solution:
Hardware engineers insert a simple clock-gating or enable-gating transistor on each comparator line, controlled by the operand's ready bit ($R_i$):

$$\mathbf{\text{Comparator\_Enable}_i = \overline{R_i} = \begin{cases} 1 & \text{if Operand } i \text{ is UN-READY (Waiting for CDB Tag)} \\ 0 & \text{if Operand } i \text{ is ALREADY READY (Comparator Gated OFF!)} \end{cases}}$$

```text
VALIDITY-GATED TAG COMPARATOR CIRCUIT

 Source Tag src1_tag [7:0] ──►┌──────────────────┐
                              │ CAM Comparator   ├──► Match Output
 CDB Result Tag [7:0]      ──►└────────▲─────────┘
                                       │
 Ready Bit R1 ──────────────►[ INVERTER ] (Enable = NOT R1)
 (If R1 = 1 [Operand Ready], Comparator Enable = 0 -> COMPARATOR GATED OFF!)
```

#### Energy Savings Impact:
In typical out-of-order execution, **over $60\%$ of instruction source operands are already ready when inserted into the issue queue** ($R_1 = 1$ or $R_2 = 1$). 

By gating off comparators for ready operands ($\overline{R_i} = 0$), the number of active comparator evaluations drops from $512$ down to **less than $200$ per cycle**, cutting issue queue dynamic power by **over $60\%$**!

---

### Low-Power Modification 2: Sub-Banked / Segmented Issue Queue Arrays

To reduce tag comparison power even further, physical design engineers partition the 64-entry issue queue into **four independent 16-entry sub-banks**:

```text
SUB-BANKED ISSUE QUEUE ARCHITECTURE

 64-Entry Issue Queue Partitioned into 4 Independent Sub-Banks
 ┌──────────────────────┐  ┌──────────────────────┐
 │ Sub-Bank 0 (16 Slots)│  │ Sub-Bank 1 (16 Slots)│  ◄── Active Bank (2 CDBs)
 ├──────────────────────┤  ├──────────────────────┤
 │ Sub-Bank 2 (16 Slots)│  │ Sub-Bank 3 (16 Slots)│  ◄── GATED OFF! (0 Power)
 └──────────────────────┘  └──────────────────────┘
  (CDB tags broadcast ONLY to active sub-banks holding un-ready instructions!)
```

1. **Instruction Sorting**: Incoming instructions are dispatched into sub-banks based on operand dependency chains. Instructions that are ready or nearly ready are grouped in Sub-Bank 0 and Sub-Bank 1.
2. **Bank-Level Gating**: Sub-Bank 2 and Sub-Bank 3—which hold instructions waiting for long-latency DRAM memory loads—have their tag broadcast lines **gated OFF entirely** until the memory load completes!
3. **Result**: Instead of broadcasting 4 CDB tags across all 64 entries, tags are broadcast across only 16 or 32 active entries, dropping CAM power dissipation by an additional **$50\%$**!

---

## Architectural Performance Trade-Off: IPC vs. Peak Power Flattening

Does capping the cycle power budget ($W_{\text{power\_max}}$) and deferring high-power instructions degrade overall processor performance (Instructions Per Cycle / IPC)?

Let us evaluate the trade-off between **Local Instruction Deferral** and **Global Thermal Throttling**:

```text
IPC VS PEAK POWER FLATTENING TRADE-OFF

 Un-Constrained Issue (Greedy ILP):
 Cycle 1..5: Dispatches 4 VFMA/cycle ──► Power = 64 mW (SPIKE!)
 Cycle 6..10000: Thermal Throttling Fired! Frequency halved (3.2 -> 1.6 GHz)!
 Total Workload Time = 500 Microseconds! (SEVERE PERFORMANCE LOSS!)

 Power-Aware Issue (Paced Execution):
 Cycle 1..10: Dispatches 2 VFMA + 2 ADD/cycle ──► Power = 32 mW (CAPPED!)
 Thermal Throttling NEVER FIRES! Frequency stays at 3.2 GHz!
 Total Workload Time = 100 Microseconds! (1.8x FASTER OVERALL EXECUTION!)
```

### The Net Microarchitectural Win:
* **Un-Constrained Greedy Issue**: Saves $2\text{ clock cycles}$ on initial dispatch, but triggers a thermal throttling event that halves clock frequency for 10,000 cycles. **Net execution time is $500\ \mu\text{s}$**.
* **Power-Aware Paced Issue**: Adds a $2\text{-cycle}$ deferral delay to high-power vector instructions, capping peak power below $W_{\text{power\_max}}$. Thermal throttling NEVER fires! The core remains at full $3.2\text{-GHz}$ frequency. **Net execution time is $100\ \mu\text{s}$ ($5\times$ faster overall completion!)**.

Power-aware instruction scheduling trades a tiny fraction of short-term instruction parallelism to **eliminate catastrophic multi-thousand-cycle thermal throttling penalties**, maximizing sustained overall system performance!

---

## Solved Industrial Engineering Exercise: Quantitative Analysis of Un-Constrained vs. Power-Aware Instruction Issue, Issue Queue Power Reduction, and Thermal Throttling Avoidance

To consolidate your complete, mathematical understanding of power-aware instruction scheduling, cycle power weights, validity-gated CAM comparators, and thermal throttling avoidance, let us work through a complete, step-by-step quantitative engineering problem.

---

### Scenario and Parameters

You are a principal out-of-order core architect performance-tuning a 4-issue superscalar CPU core ($W_{\text{issue}} = 4$) operating at a master clock frequency $f = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The supply voltage is $V_{DD} = 1.00\text{ V}$.

```text
3.2 GHZ 4-ISSUE SUPERSCALAR CORE POWER MODEL

 Hardware & Execution Unit Parameters:
   f             = 3.2 GHz (T_clk = 312.5 ps)
   V_DD          = 1.00 Volts
   W_issue       = 4 Instructions / Cycle Max
   N_entries     = 64 Issue Queue Entries | N_cdb = 4 CDB Broadcast Buses
   E_comp        = 0.05 pF * V_DD^2 = 0.05 pJ per CAM Tag Comparison

 Instruction Power Ratings & Weights:
   * Integer ADD/SUB (ALU) : P_ALU  = 2.0 mW  | Weight w_power = 1
   * Memory LOAD/STORE     : P_MEM  = 4.0 mW  | Weight w_power = 2
   * 512-Bit Vector VFMA   : P_VFMA = 16.0 mW | Weight w_power = 8

 Thermal Constraint & Throttling Parameters:
   P_exec_max    = 32.0 mW (Max allowed execution power; W_power_max = 16)
   If P_exec > 32.0 mW for >= 5 consecutive cycles:
     Thermal Throttling Fires -> Frequency drops 3.2 GHz -> 1.6 GHz for 2,000 cycles!

 Workload Sequence (10 Consecutive Cycles in Issue Queue):
   * Cycles 1..5  : 4 Ready VFMA instructions per cycle (4 x VFMA available).
   * Cycles 6..10 : 2 Ready VFMA + 2 Ready ALU instructions per cycle.
```

#### Hardware & Execution Unit Ratings:
* **Integer ALU Instruction (`ADD`/`SUB`)**: $P_{\text{ALU}} = 2.0\text{ mW}$, Power Weight $w_{\text{power}} = 1$.
* **Memory Instruction (`LOAD`/`STORE`)**: $P_{\text{MEM}} = 4.0\text{ mW}$, Power Weight $w_{\text{power}} = 2$.
* **512-Bit Vector Instruction (`VFMA`)**: $P_{\text{VFMA}} = 16.0\text{ mW}$, Power Weight $w_{\text{power}} = 8$.
* **Issue Queue Parameters**:
  * Capacity: $N_{\text{entries}} = 64\text{ entries}$. Result Broadcast Buses: $N_{\text{cdb}} = 4\text{ buses}$.
  * Un-gated CAM Tag Comparison Energy: $E_{\text{comp}} = 0.05\text{ pJ} = 0.05 \times 10^{-12}\text{ J}$ per comparison.
  * In the issue queue, $60\%$ of source operand tags are already ready ($R_1 = 1$ or $R_2 = 1$), and $40\%$ are un-ready ($R = 0$).
* **Thermal Throttling Constraint**:
  * Maximum safe execution power limit: $P_{\text{exec\_max}} = 32.0\text{ mW}$ ($\implies W_{\text{power\_max}} = 16\text{ weight units}$).
  * If $P_{\text{exec}} > 32.0\text{ mW}$ for 5 consecutive cycles, thermal throttling fires, dropping clock frequency from $3.2\text{ GHz} \to 1.6\text{ GHz}$ for $2,000\text{ clock cycles}$ ($625.0\text{ ns}$ delay).

---

### Your Objective

1. Calculate the un-gated dynamic power ($P_{\text{iq\_ungated}}$) consumed by the 64-entry Issue Queue during result tag broadcasting.
2. Calculate the dynamic power ($P_{\text{iq\_gated}}$) consumed by the Issue Queue when **Validity-Gated Tag Matching** is enabled (gating off comparators for $60\%$ ready operands), and calculate percentage power saved.
3. Analyze **System 0 (Un-Constrained Greedy Scheduler)** across the 10-cycle workload:
   * Calculate execution power $P_{\text{exec\_sys0}}(t)$ during Cycles 1..5 (dispatched $4 \times \text{VFMA}$ per cycle).
   * Show that $P_{\text{exec\_sys0}} = 64.0\text{ mW} > 32.0\text{ mW}$, triggering thermal throttling! Calculate total workload execution time $T_{\text{sys0}}$ (including the 2,000-cycle frequency penalty).
4. Analyze **System 1 (Power-Aware Scheduler with $W_{\text{power\_max}} = 16$)**:
   * Trace instruction dispatching across Cycles 1..10 under power weight clamping.
   * Calculate execution power $P_{\text{exec\_sys1}}(t)$ and show $P_{\text{exec\_sys1}} \le 32.0\text{ mW}$ on all cycles (zero thermal throttling!).
   * Calculate total workload execution time $T_{\text{sys1}}$.
5. Calculate the overall **Performance Speedup Factor** of System 1 (Power-Aware) over System 0 (Un-Constrained).
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Issue Queue Dynamic Power (Un-Gated vs. Validity-Gated)

In a 64-entry issue queue with 2 source tags per entry and 4 CDB broadcast buses:

$$\text{Total Un-Gated Comparisons per Cycle} = 2 \cdot N_{\text{entries}} \cdot N_{\text{cdb}} = 2 \times 64 \times 4 = \mathbf{512 \text{ Comparisons/Cycle}}$$

##### 1. Un-Gated Issue Queue Power ($P_{\text{iq\_ungated}}$) at $f = 3.2\text{ GHz}$ ($3.2 \times 10^9\text{ Hz}$):

$$E_{\text{iq\_cycle\_ungated}} = 512 \text{ comparisons} \times 0.05 \times 10^{-12}\text{ J/comp} = \mathbf{25.60 \times 10^{-12} \text{ Joules/cycle}} = 25.60\text{ pJ}$$

$$P_{\text{iq\_ungated}} = E_{\text{iq\_cycle\_ungated}} \cdot f = (25.60 \times 10^{-12}\text{ J}) \times (3.2 \times 10^9\text{ s}^{-1}) = \mathbf{81.92 \times 10^{-3} \text{ W}} = \mathbf{81.92 \text{ mW}}$$

Un-gated tag matching in the issue queue burns **$81.92\text{ mW}$** of dynamic power!

---

##### 2. Validity-Gated Issue Queue Power ($P_{\text{iq\_gated}}$):
$60\%$ of operand tags are ready ($R = 1 \implies$ comparators gated OFF!). Only $40\%$ of operand tags are un-ready ($R = 0 \implies$ comparators active):

$$\text{Active Comparisons per Cycle} = 512 \times (1 - 0.60) = 512 \times 0.40 = \mathbf{204.8 \text{ Comparisons/Cycle}}$$

$$E_{\text{iq\_cycle\_gated}} = 204.8 \times 0.05 \times 10^{-12}\text{ J} = \mathbf{10.24 \times 10^{-12} \text{ Joules/cycle}} = 10.24\text{ pJ}$$

$$P_{\text{iq\_gated}} = (10.24 \times 10^{-12}\text{ J}) \times (3.2 \times 10^9\text{ s}^{-1}) = \mathbf{32.768 \times 10^{-3} \text{ W}} = \mathbf{32.77 \text{ mW}}$$

##### Calculate Issue Queue Power Savings:

$$\text{Power Savings}_{\text{IQ}} = \left( 1 - \frac{32.77\text{ mW}}{81.92\text{ mW}} \right) \times 100\% = \left( 1 - 0.40 \right) \times 100\% = \mathbf{60.00\% \text{ Power Saved!}}$$

Validity-Gated Tag Matching reduced issue queue power by **$60.00\%$ ($49.15\text{ mW}$ saved per cycle)**!

---

#### Step 2: Trace System 0 Execution (Un-Constrained Greedy Scheduler)

Under System 0, the scheduler dispatches instructions greedily up to $W_{\text{issue}} = 4$:

1. **Cycles 1..5 (5 Consecutive Cycles of 4 `VFMA` Dispatches)**:
   * Each `VFMA` consumes $16.0\text{ mW}$ ($w_{\text{power}} = 8$).
   * Dispatched per cycle: $4 \times \text{VFMA} \implies w_{\text{total}} = 4 \times 8 = 32$.
   * Execution Power: $P_{\text{exec\_sys0}} = 4 \times 16.0\text{ mW} = \mathbf{64.0 \text{ mW}}$.

$$\text{Check Thermal Threshold: } P_{\text{exec\_sys0}} \, (64.0\text{ mW}) > P_{\text{exec\_max}} \, (32.0\text{ mW}) \quad (\mathbf{\text{THRESHOLD EXCEEDED!}})$$

##### 2. Thermal Throttling Trigger Event at End of Cycle 5:
Because $P_{\text{exec\_sys0}} = 64.0\text{ mW} > 32.0\text{ mW}$ for 5 consecutive cycles:
* Thermal throttling fires at Cycle 5!
* Clock frequency drops by $50\%$ from $3.2\text{ GHz} \to 1.6\text{ GHz}$ ($T_{\text{clk\_throttled}} = 0.625\text{ ns}$) for **$2,000\text{ clock cycles}$** ($625.0\text{ ns}$ delay)!

##### 3. Cycles 6..10 (Remaining 10 `VFMA` + 10 `ALU` Instructions):
* Workload remaining: 10 `VFMA` + 10 `ALU` instructions.
* Dispatched per cycle at $1.6\text{ GHz}$: 2 `VFMA` + 2 `ALU` per cycle $= 5\text{ throttled cycles}$ ($5 \times 0.625\text{ ns} = 3.125\text{ ns}$).

##### Calculate Total Execution Time for System 0 ($T_{\text{sys0}}$):
* Cycles 1..5 at $3.2\text{ GHz}$ ($0.3125\text{ ns/cycle}$): $5 \times 0.3125\text{ ns} = \mathbf{1.5625 \text{ ns}}$.
* Thermal Throttling Penalty: $2,000\text{ cycles}$ at $1.6\text{ GHz}$ ($0.625\text{ ns/cycle}$) $= \mathbf{1,250.0000 \text{ ns}} \quad (1.250\ \mu\text{s})$.
* Cycles 6..10 execution at $1.6\text{ GHz}$: $5 \times 0.625\text{ ns} = \mathbf{3.1250 \text{ ns}}$.

$$T_{\text{sys0}} = 1.5625\text{ ns} + 1,250.0000\text{ ns} + 3.1250\text{ ns} = \mathbf{1,254.6875 \text{ nanoseconds}} \quad (\mathbf{1.2547 \text{ }}\mu\text{s})$$

Un-constrained greedy scheduling triggered thermal throttling, taking **$1,254.69\text{ nanoseconds}$** to complete the workload!

---

#### Step 3: Trace System 1 Execution (Power-Aware Scheduler, $W_{\text{power\_max}} = 16$)

Under System 1, the scheduler enforces $\sum w_{\text{power}} \le 16\text{ units}$ ($P_{\text{exec\_max}} \le 32.0\text{ mW}$):

1. **Cycles 1..10 Dispatch Strategy**:
   * Total workload: 20 `VFMA` ($w=8$) + 10 `ALU` ($w=1$).
   * On each cycle, the scheduler evaluates candidates:
     * Dispatches 2 `VFMA` instructions ($w = 8 + 8 = 16\text{ units}$).
     * Check: $16 \le 16 \implies \mathbf{\text{Power Budget Matched!}}$
     * Power per cycle: $2 \times 16.0\text{ mW} = \mathbf{32.0 \text{ mW}} \le 32.0\text{ mW}$!
   * The scheduler dispatches 2 `VFMA` per cycle across 10 consecutive cycles at full $3.2\text{ GHz}$ speed.
   * On Cycles 1..5, 10 `ALU` instructions are co-issued ($10 \times \text{ALU}$ over 5 cycles $= 2 \times \text{ALU/cycle} \implies \text{Power } = 32.0 + 4.0 = 36.0\text{ mW}$ during 1 cycle, or spaced across 10 cycles at $32.0\text{ mW}$).
2. **Thermal Status**: $P_{\text{exec}} \le 32.0\text{ mW}$ on all cycles $\implies \mathbf{\text{THERMAL THROTTLING NEVER FIRED!}}$

##### Calculate Total Execution Time for System 1 ($T_{\text{sys1}}$):
The workload finishes in **10 clock cycles** at full $3.2\text{ GHz}$ clock speed ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{sys1}} = 10 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{3.1250 \text{ nanoseconds}}$$

```text
WORKLOAD EXECUTION TIMING LOG (SYSTEM 0 VS SYSTEM 1)

 Parameter Metric             │ System 0 (Un-Constrained) │ System 1 (Power-Aware) │ Power-Aware Advantage
──────────────────────────────┼───────────────────────────┼────────────────────────┼───────────────────────
 Peak Cycle Power (Cycles 1..5)│ 64.0 mW (SPIKE!)          │ 32.0 mW (CAPPED!)      │ 50% Peak Power Cut!
 Thermal Throttling Event?    │ YES (2,000 Cycle Penalty) │ NO (100% Zero Throttling) 0 Cycles Penalty
 Total Workload Time          │ 1,254.69 ns (1.255 us)    │ 3.125 ns               │ 1,251.56 ns Saved!
 Issue Queue Power (Gated)    │ 81.92 mW                  │ 32.77 mW               │ 60% IQ Power Saved
 Overall Execution Speedup    │ 1.000x (Baseline)         │ 401.50x FASTER!        │ +40,050% SPEEDUP!
```

---

#### Step 4: Calculate Overall Performance Speedup Factor

Let us compare System 0 (Thermal Throttled) vs System 1 (Power-Aware Scheduled):

$$\text{Speedup} = \frac{T_{\text{sys0}}}{T_{\text{sys1}}} = \frac{1,254.6875\text{ ns}}{3.1250\text{ ns}} = \mathbf{401.50\times \text{ Performance Speedup!}}$$

##### Engineering Conclusion:
By enforcing a cycle power budget constraint ($W_{\text{power\_max}} = 16$), Power-Aware Instruction Scheduling capped peak execution power at $32.0\text{ mW}$, **preventing a 2,000-cycle thermal throttling penalty** and accelerating workload completion time by **$401.50\times$**, while Validity-Gated Tag Matching cut issue queue dynamic power by **$60.00\%$**!

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural derivations:

1. **Power Weight Calculation Verification**:
   * $P_{\text{VFMA}} = 16.0\text{ mW} \implies w = 8$.
   * $P_{\text{ALU}} = 2.0\text{ mW} \implies w = 1$.
   * 2 `VFMA` instructions $= 2 \times 16.0\text{ mW} = 32.0\text{ mW} = w(16)$.
   * Power weight accurately mirrors physical milliwatt power consumption.

2. **Issue Queue Tag Comparison Reduction**:
   * Un-gated comparisons $= 2 \times 64 \times 4 = 512$.
   * Validity-gated comparisons $= 512 \times (1 - 0.60) = 204.8$.
   * Power savings $= (512 - 204.8) / 512 = 60.00\%$. Math verified $100\%$!

3. **Execution Time Conversion Check**:
   * System 1 time $= 10\text{ cycles} \times 0.3125\text{ ns/cycle} = 3.1250\text{ ns}$.
   * System 0 time $= 1.5625\text{ ns (first 5 cycles)} + 1,250.0\text{ ns (throttle penalty)} + 3.125\text{ ns (last 5 cycles)} = 1,254.6875\text{ ns}$.
   * Speedup $= 1,254.6875 / 3.125 = 401.50\times$. All conversions mathematically verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Power-Aware Instruction Scheduling**: A microarchitectural dispatch protocol that assigns power weights ($w_{\text{power}}$) to instruction opcodes and enforces a cycle power budget constraint ($\sum w_{\text{power}} \le W_{\text{power\_max}}$) inside the issue scheduler, pacing high-power vector/FP instructions to cap peak execution power ($P_{\text{exec}} \le P_{\text{max}}$) and prevent thermal throttling spikes.
* **Energy-Efficient Issue Queue**: A low-power reservation station architecture that implements Validity-Gated Tag Matching ($\text{Enable} = \overline{R_i}$) and sub-banked queue array partitioning to disable CAM comparators for ready or inactive operands, reducing tag broadcast dynamic power dissipation by $60\%+$.