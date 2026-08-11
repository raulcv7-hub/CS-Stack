---
title: "Modulo Loop Scheduling Architecture and Initiation Interval Mechanics"
---

# Modulo Loop Scheduling Architecture and Initiation Interval Mechanics

## The Loop Recurrence Stall and Spatial Hardware Resource Collision Crisis

In computer architecture, software loops—such as `for` loops and `while` loops—represent over $90\%$ of the total execution time of data-intensive algorithms, including digital signal filtering, matrix operations, image processing, and neural network inference. When executing a software loop over thousands or millions of iterations, a traditional von Neumann processor processes the loop sequentially: completing iteration $k$ before starting iteration $k+1$. 

In spatial computing architectures—such as Coarse-Grained Reconfigurable Arrays (CGRAs)—processing performance is maximized by mapping the mathematical operations of a loop across a two-dimensional grid of physical **Processing Elements (PEs)**. 

To achieve maximum throughput, a CGRA compiler cannot wait for iteration $k$ to exit the physical hardware grid before launching iteration $k+1$. Instead, the compiler must **Software Pipeline** the loop: launching new loop iterations into the physical PE grid at regular, clock-synchronous time intervals while previous iterations are still executing across downstream PEs!

```text
SEQUENTIAL LOOP VS SOFTWARE PIPELINED MODULO LOOP EXECUTION

 Sequential Non-Pipelined Execution (Slow & Un-Utilized)
 Iteration 0: [ PE0 ──► PE1 ──► PE2 ──► PE3 ]
 Iteration 1:                                 [ PE0 ──► PE1 ──► PE2 ──► PE3 ]
 (PEs 1, 2, 3 sit 75% IDLE while waiting for Iteration 0 to finish!)

 Modulo Pipelined Execution (High Throughput & Spatial Reuse)
 Iteration 0: [ PE0 ──► PE1 ──► PE2 ──► PE3 ]
 Iteration 1:          [ PE0 ──► PE1 ──► PE2 ──► PE3 ]
 Iteration 2:                 [ PE0 ──► PE1 ──► PE2 ──► PE3 ]
 (A new loop iteration launches every II clock cycles! 100% PE Utilization!)
```

However, attempting to overlap consecutive loop iterations across a physical PE grid encounters two severe microarchitectural friction barriers:

### 1. The Resource Collision Wall (ResMII)
A physical CGRA grid contains a finite, fixed number of physical hardware resources—for example, a $4 \times 4$ PE grid contains exactly 16 ALUs, 16 multipliers, and a fixed number of interconnect routing channels. 

If a loop Dataflow Graph (DFG) requires 8 multiplication operations, but the physical CGRA grid contains only **2 hardware multiplier units**, launching new loop iterations too frequently causes multiple loop iterations to attempt to use the exact same physical multiplier unit on the exact same clock cycle!

This hardware resource collision causes **Hardware Resource Gridlock**, forcing the pipeline to freeze or corrupting data words.


## The Commercial Bakery Assembly Line and the Recipe Feedback Constraint: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Modulo Loop Scheduling, Initiation Intervals ($II$), Resource-Constrained Bounds ($\text{ResMII}$), and Recurrence-Constrained Bounds ($\text{RecMII}$) before inspecting formal graph algorithms, reservation tables, and pipeline latency equations, let us consider an everyday analogy: **The Commercial Cake Bakery**.

Imagine a commercial cake bakery (**A Spatial CGRA Accelerator**) operating a 4-station automated kitchen pipeline (**A 4-PE Spatial Grid**):
1. **Station 0 (Mixer)**: Mixes batter ingredients (**PE 0 ALU**).
2. **Station 1 (Oven)**: Bakes the cake sponge (**PE 1 ALU**).
3. **Station 2 (Froster)**: Applies cream frosting (**PE 2 ALU**).
4. **Station 3 (Decorator)**: Adds fruit decorations (**PE 3 ALU**).

Each station takes **1 hour** to complete its task ($T_{\text{station}} = 1\text{ hour}$).

```text
THE COMMERCIAL BAKERY KITCHEN ANALOGY

 Station 0 (Mixer) ──► Station 1 (Oven) ──► Station 2 (Froster) ──► Station 3 (Decorator)
 [ Takes 1 Hour ]      [ Takes 1 Hour ]     [ Takes 1 Hour ]        [ Takes 1 Hour ]
```

The bakery receives an order to produce **1,000 identical cakes** (**1,000 Loop Iterations**).

Let us observe three different operational strategies for how the bakery manager schedules cake production:


### Strategy 2: Modulo Pipelined Production ($II = 1\text{ Hour}$)
The manager introduces **Modulo Pipelined Scheduling**:
* **Hour 1**: Station 0 mixes Cake 1.
* **Hour 2**: Cake 1 moves to Station 1 (Oven). **Simultaneously, Station 0 mixes Cake 2!**
* **Hour 3**: Cake 1 moves to Station 2 (Froster), Cake 2 moves to Station 1 (Oven), and **Station 0 mixes Cake 3!**

Look at what Strategy 2 achieves:
* A new cake enters Station 0 **every single hour** (**Initiation Interval $II = 1\text{ hour}$**)!
* All 4 stations operate at $100\%$ full capacity simultaneously.
* Producing 1,000 cakes takes **1,003 hours** ($41\text{ days}$) instead of 4,000 hours—a **$4\times$ throughput speedup**!

```text
MODULO PIPELINED KITCHEN TIMELINE (II = 1 HOUR)

 Hour 1 : [ Cake 1: Mixer ]
 Hour 2 : [ Cake 1: Oven    ]  [ Cake 2: Mixer ]
 Hour 3 : [ Cake 1: Froster ]  [ Cake 2: Oven    ]  [ Cake 3: Mixer ]
 Hour 4 : [ Cake 1: Decor.  ]  [ Cake 2: Froster ]  [ Cake 3: Oven    ]  [ Cake 4: Mixer ]
 (A new completed cake emerges from the kitchen EVERY SINGLE HOUR!)
```


## Primitive 1: Modulo Loop Scheduling

Now that we possess a clear intuitive mental model of the commercial bakery assembly line, let us examine the formal, rigorous engineering mechanics of **Modulo Loop Scheduling**.

In compiler engineering for spatial reconfigurable architectures, **Modulo Loop Scheduling** is the primary software-pipelined loop optimization algorithm.

> **Modulo Loop Scheduling** is an architectural compiler scheduling technique that overlaps consecutive iterations of a loop across physical spatial Processing Elements (PEs) by initiating new loop iterations at a fixed, constant clock cycle interval called the **Initiation Interval ($II$)**, subject to hardware resource bounds ($\text{ResMII}$) and recurrence dependency bounds ($\text{RecMII}$).

```text
MODULO LOOP SCHEDULING TIME-SPACE MAPPING

 Loop Iteration k Dataflow Graph (DFG) mapped to 4-PE Array
 Time (Cycles) │ PE (0,0)      │ PE (0,1)      │ PE (1,0)      │ PE (1,1)
───────────────┼───────────────┼───────────────┼───────────────┼───────────────
   Cycle 0     │ Iter 0 (Op A) │               │               │
   Cycle 1     │ Iter 1 (Op A) │ Iter 0 (Op B) │               │  ◄── II = 1 Cycle!
   Cycle 2     │ Iter 2 (Op A) │ Iter 1 (Op B) │ Iter 0 (Op C) │
   Cycle 3     │ Iter 3 (Op A) │ Iter 2 (Op B) │ Iter 1 (Op C) │ Iter 0 (Op D)
```


## Primitive 2: The Initiation Interval ($II$) and Minimum Bounds ($\text{ResMII}$ & $\text{RecMII}$)

Now let us examine the second core primitive: **The Initiation Interval ($II$)** and its two mathematical lower bounds.

> **The Initiation Interval ($II$)** is the number of clock cycles between the launch of successive, consecutive iterations of a software loop. A smaller $II$ yields higher execution throughput ($1/II$ iterations per cycle).

```text
INITIATION INTERVAL (II) MATHEMATICAL BOUNDS

 Initiation Interval II >= Max( ResMII, RecMII )
                            │       │
      ┌─────────────────────┘       └─────────────────────┐
      ▼                                                   ▼
 Resource-Constrained Lower Bound              Recurrence-Constrained Lower Bound
 ResMII = Max_r ( Demand(r) / Supply(r) )     RecMII = Max_c ( Latency(c) / Distance(c) )
```

To find the minimum valid integer Initiation Interval ($II$) for a software loop, the spatial compiler computes two independent mathematical lower bounds:
1. **Resource-Constrained Minimum Initiation Interval ($\text{ResMII}$)**
2. **Recurrence-Constrained Minimum Initiation Interval ($\text{RecMII}$)**

The absolute lower bound for $II$ is the maximum of these two constraints:

$$\mathbf{II_{\text{min}} = \max(\text{ResMII}, \ \text{RecMII})}$$

$$\mathbf{II = \left\lceil \max(\text{ResMII}, \ \text{RecMII}) \right\rceil}$$


### Bound 2: Recurrence-Constrained Minimum Initiation Interval ($\text{RecMII}$)

The **Recurrence-Constrained Minimum Initiation Interval ($\text{RecMII}$)** is the lower bound on $II$ imposed by directed feedback cycles (loop-carried dependencies) in the loop Dataflow Graph.

In a loop DFG, an **Inter-Iteration Recurrence Cycle ($c$)** is a directed path of operations where an operation in iteration $k+d$ depends on the result computed by an operation in iteration $k$.

```text
INTER-ITERATION RECURRENCE CYCLE IN A DATAFLOW GRAPH (DFG)

 Iteration k: [ Op 1: Multiply ] ──► [ Op 2: Add ] ──► [ Op 3: Shift ]
                      ▲                                      │
                      └─────────── Feedback y[i-1] ──────────┘
                         (Cycle Latency = 3c, Iteration Distance d = 1)
```

For any directed recurrence cycle $c$ in the DFG:
* Let $\text{Latency}(c)$ be the total cumulative hardware clock cycles required to execute all operations along cycle $c$ (including PE ALU delays and interconnect wire routing delays).
* Let $\text{Distance}(c)$ be the **Loop Iteration Distance ($d$)** of the recurrence edge (e.g., $d = 1$ for `y[i-1]`, $d = 2$ for `y[i-2]`).

#### The RecMII Calculation Equation:
The minimum initiation interval required to satisfy recurrence cycle $c$ is the ratio of total cycle latency to iteration distance:

$$\mathbf{\text{RecMII} = \max_{c \in C} \left\lceil \frac{\text{Latency}(c)}{\text{Distance}(c)} \right\rceil}$$

Where:
* $C$ is the set of all directed feedback cycles in the loop Dataflow Graph.
* $\text{Latency}(c)$ is the total delay in clock cycles around feedback cycle $c$.
* $\text{Distance}(c)$ is the iteration distance $d \ge 1$ of the feedback edge.

#### Example RecMII Derivation:
Suppose a loop contains a feedback cycle $c$ where:
* Operation 1 (Multiplier) takes $2\text{ clock cycles}$.
* Operation 2 (Adder) takes $1\text{ clock cycle}$.
* Routing interconnect wire takes $1\text{ clock cycle}$.
* Total Cycle Latency $\text{Latency}(c) = 2 + 1 + 1 = \mathbf{4 \text{ Clock Cycles}}$.
* The feedback edge connects `y[i-1]` ($\text{Distance}(c) = 1$ iteration).

$$\text{RecMII} = \left\lceil \frac{4 \text{ Cycles}}{1 \text{ Iteration}} \right\rceil = \mathbf{4 \text{ Clock Cycles}}$$

This means iteration $k+1$ **cannot be launched sooner than 4 clock cycles after iteration $k$**, because the feedback value `y[k-1]` will not physically exist in hardware until Cycle 4!


### Hardware Execution via Rotating Context Memory

Once a valid Modulo Reservation Table is constructed for $II$, how does the physical CGRA hardware execute it?

Each PE inside the CGRA grid contains a small **Configuration Context Memory (Ring Buffer)** of depth $II$:

```text
PE(0,0) ROTATING CONTEXT MEMORY (II = 3)

 Context Memory Slot 0 (Cycle % 3 == 0) ──► Execute Op A (ADD Input_West, Input_North)
 Context Memory Slot 1 (Cycle % 3 == 1) ──► Execute Op D (SUB Input_East, Const_C)
 Context Memory Slot 2 (Cycle % 3 == 2) ──► Execute NOP (PASS Through)
                                            ▲
 Modulo Pointer Address = (Cycle_Count % 3)─┘
```

On every clock cycle, a master modulo hardware counter increments:

$$\text{Context\_Address} = \text{Cycle\_Count} \pmod{II}$$

Each PE reads its local Context Memory slot at `Context_Address`, re-configuring its ALU operation and input MUX channels in **1 clock cycle**! 

The 2D PE grid cycles through its configuration slots $0, 1, \dots, II-1$ continuously, processing 1 new loop iteration every $II$ clock cycles with zero instruction-fetch overhead!


### Scenario and Parameters

You are a senior compiler and microarchitecture engineer designing the modulo loop scheduler for a $1.6\text{ GHz}$ spatial CGRA accelerator ($T_{\text{clk}} = 0.625\text{ ns} = 625\text{ ps}$).

The CGRA features a $2 \times 2$ physical Processing Element grid (**4 PEs**):
* $\text{PE}_{0,0}$: 32-bit Multi-Function ALU (Add, Sub, Shift) + 1-cycle interconnect.
* $\text{PE}_{0,1}$: 32-bit Multi-Function ALU (Add, Sub, Shift) + 1-cycle interconnect.
* $\text{PE}_{1,0}$: 32-bit Hardware Multiplier Unit (`MUL`).
* $\text{PE}_{1,1}$: 32-bit Multi-Function ALU (Add, Sub, Shift) + 1-cycle interconnect.

```text
1.6 GHz 2x2 CGRA HARDWARE GRID

 PE(0,0) [ALU] ───────────────► PE(0,1) [ALU]
    │                              │
    ▼                              ▼
 PE(1,0) [MUL] ───────────────► PE(1,1) [ALU]
 (Grid Supply: 3 Multi-Function ALUs + 1 Hardware Multiplier PE(1,0))
```

#### The Workload Loop Kernel:
The accelerator compiles an IIR digital filter kernel processing **$1,000,000\text{ streaming audio samples}$** ($N = 1,000,000\text{ iterations}$):

```c
// IIR DIGITAL FILTER KERNEL (WITH LOOP RECURRENCE)
for (int i = 1; i < 1000000; i++) {
    t1 = A[i] * C1;          // Op 1: Multiplication (MUL)
    t2 = t1 + B[i];          // Op 2: Addition (ADD)
    Y[i] = t2 + Y[i-1];      // Op 3: Recurrence Addition (ADD) - DEPENDS ON Y[i-1]!
}
```

#### Hardware Operation Delays:
* Operation 1 (`MUL` on $\text{PE}_{1,0}$): $T_{\text{mul}} = 2\text{ clock cycles}$ execution delay.
* Operation 2 (`ADD` on ALU): $T_{\text{add}} = 1\text{ clock cycle}$ execution delay.
* Operation 3 (`ADD` on ALU): $T_{\text{rec\_add}} = 1\text{ clock cycle}$ execution delay.
* Interconnect Wire Delay between PEs: $T_{\text{wire}} = 1\text{ clock cycle}$.

#### Your Objective

1. Analyze the loop Dataflow Graph (DFG) and compute the **Resource-Constrained Minimum Initiation Interval ($\text{ResMII}$)** based on physical hardware supply vs demand.
2. Identify the inter-iteration recurrence feedback cycle $c$ in the DFG and compute the **Recurrence-Constrained Minimum Initiation Interval ($\text{RecMII}$)** based on cycle latency and iteration distance.
3. Calculate the valid Minimum Initiation Interval ($II = \max(\text{ResMII}, \text{RecMII})$).
4. Construct a valid **Modulo Reservation Table (MRT)** mapping Operations 1, 2, and 3 across the $2 \times 2$ PE grid over modulo time slots $0 \dots II-1$.
5. Calculate total execution time (in milliseconds) for $1,000,000\text{ iterations}$ under Modulo Pipelined Execution ($II$) versus Sequential Non-Pipelined Execution ($II_{\text{seq}} = T_{\text{total\_iter}}$).
6. Calculate the **Performance Speedup Factor** of Modulo Scheduling over Sequential Execution.
7. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Recurrence-Constrained Minimum Initiation Interval ($\text{RecMII}$)

Now, we analyze the inter-iteration feedback cycle in Op 3 (`Y[i] = t2 + Y[i-1]`):

* Op 3 computes $Y[i]$ using $Y[i-1]$ computed by Op 3 in the previous iteration ($k-1$).
* Recurrence Cycle $c$: Op 3 ($\text{PE}_{\text{add}}$) feeds its output back into Op 3's input for the next iteration!
* Let us calculate the total feedback cycle latency $\text{Latency}(c)$:
  * Op 3 Addition Execution Latency: $T_{\text{rec\_add}} = 1\text{ clock cycle}$.
  * Interconnect Wire Feedback Routing Latency back to PE input: $T_{\text{wire}} = 1\text{ clock cycle}$.
  * Total Cycle Latency $\text{Latency}(c) = 1 + 1 = \mathbf{2 \text{ Clock Cycles}}$.
* Iteration Distance $\text{Distance}(c) = 1$ iteration (depends on `Y[i-1]`).

Applying the RecMII formula:

$$\mathbf{\text{RecMII} = \left\lceil \frac{\text{Latency}(c)}{\text{Distance}(c)} \right\rceil = \left\lceil \frac{2 \text{ Cycles}}{1 \text{ Iteration}} \right\rceil = 2 \text{ Clock Cycles}}$$

$$\text{RecMII} = \mathbf{2 \text{ Clock Cycles}}$$

##### Recurrence Constraint Result:
Because Op 3 requires 2 clock cycles to complete its addition and route $Y[k-1]$ back to its input register, **iteration $k+1$ CANNOT be launched sooner than 2 clock cycles after iteration $k$**!


#### Step 4: Construct the Modulo Reservation Table (MRT) for $II = 2$

$II = 2 \implies$ Modulo time slots are **Slot 0** ($t \pmod 2 == 0$) and **Slot 1** ($t \pmod 2 == 1$).

Let us schedule the 3 operations for Iteration 0 ($k=0$):

1. **Op 1 (`MUL`: `t1 = A[i] * C1`)**:
   * Assigned to $\text{PE}_{1,0}$ (Multiplier) at Cycle $t = 0$.
   * $T_{\text{mul}} = 2\text{ cycles}$ (spans Cycles 0 and 1).
   * Modulo Slots: Occupies $[\text{PE}_{1,0}, \text{Slot } 0]$ and $[\text{PE}_{1,0}, \text{Slot } 1]$.
2. **Op 2 (`ADD`: `t2 = t1 + B[i]`)**:
   * Receives `t1` from $\text{PE}_{1,0}$ at Cycle 2 (via 1-cycle wire to $\text{PE}_{1,1}$).
   * Assigned to $\text{PE}_{1,1}$ (ALU) at Cycle $t = 2$.
   * Modulo Slot: $2 \pmod 2 = \mathbf{\text{Slot } 0}$. Occupies $[\text{PE}_{1,1}, \text{Slot } 0]$.
3. **Op 3 (`ADD`: `Y[i] = t2 + Y[i-1]`)**:
   * Receives `t2` from $\text{PE}_{1,1}$ at Cycle 3 (via 1-cycle wire to $\text{PE}_{0,1}$).
   * Assigned to $\text{PE}_{0,1}$ (ALU) at Cycle $t = 3$.
   * Modulo Slot: $3 \pmod 2 = \mathbf{\text{Slot } 1}$. Occupies $[\text{PE}_{0,1}, \text{Slot } 1]$.
   * Feedback path: $\text{PE}_{0,1}$ output $Y[i-1]$ routes back to $\text{PE}_{0,1}$ input at Cycle $3 + 2 = 5$ (Slot $5 \pmod 2 = 1$), matching Iteration 1's Op 3 schedule perfectly!

```text
VALID MODULO RESERVATION TABLE (MRT) (II = 2 CYCLES)

 Physical PE Resource │ Modulo Slot 0 (Cycle % 2 == 0) │ Modulo Slot 1 (Cycle % 2 == 1)
──────────────────────┼────────────────────────────────┼────────────────────────────────
 PE(0,0) [ALU]        │ [ FREE ]                       │ [ FREE ]
 PE(0,1) [ALU]        │ [ FREE ]                       │ Op 3: Add Y[i] (Iter k)
 PE(1,0) [MUL]        │ Op 1: Mul t1 (Iter k, Cycle 1) │ Op 1: Mul t1 (Iter k, Cycle 2)
 PE(1,1) [ALU]        │ Op 2: Add t2 (Iter k)          │ [ FREE ]
```

##### Collision Check:
Every MRT cell contains at most 1 operation. **Zero resource collisions! Zero recurrence violations!**


#### Step 6: Calculate Performance Speedup Factor

$$\text{Speedup} = \frac{T_{\text{exec\_sequential}}}{T_{\text{exec\_modulo}}} = \frac{3.750\text{ ms}}{1.250\text{ ms}} = \frac{6,000,000\text{ cycles}}{2,000,004\text{ cycles}} \approx \mathbf{3.000\times \text{ Performance Advantage!}}$$

```text
MODULO SCHEDULING PERFORMANCE OPTIMIZATION SUMMARY

 Scheduling Mode         │ Initiation Interval (II) │ Total Cycles     │ Execution Time │ Speedup Factor
─────────────────────────┼──────────────────────────┼──────────────────┼────────────────┼───────────────────
 Sequential Non-Pipelined│ II = 6 Cycles            │ 6,000,000 Cycles │ 3.750 ms       │ 1.00x (Baseline)
 Modulo Loop Pipelined   │ II = 2 Cycles (RecMII)   │ 2,000,004 Cycles │ 1.250 ms       │ 3.00x FASTER!
                         │ (66.7% Cycle Reduction)  │ (2.500 ms Saved) │ (+200% Gain)   │
```

##### Engineering Conclusion:
By deriving the exact recurrence lower bound ($\text{RecMII} = 2$) and constructing a valid Modulo Reservation Table, the spatial compiler software-pipelined the IIR filter loop at $II = 2\text{ cycles}$, cutting total execution time from $3.750\text{ ms}$ down to $1.250\text{ ms}$—delivering a **$3.00\times$ performance speedup ($200\%$ throughput gain)** while maintaining $100\%$ arithmetic recurrence correctness!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Modulo Loop Scheduling**: A spatial software-pipelining compiler optimization that overlaps consecutive iterations of a loop across physical Processing Elements (PEs) by initiating new iterations at a constant time interval ($II$), maximizing spatial hardware utilization and loop throughput.
* **Initiation Interval ($II$)**: The fixed number of clock cycles between launching successive loop iterations into a spatial CGRA grid, lower-bounded by resource constraints ($\text{ResMII} = \max \lceil \text{Demand} / \text{Supply} \rceil$) and recurrence feedback constraints ($\text{RecMII} = \max \lceil \text{Latency} / \text{Distance} \rceil$).
