content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/04-spatial-reconfigurable-architectures/02-spatial-dataflow-hardware-compilation/01-modulo-loop-scheduling-cgra.md
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

---

### 2. The Recurrence Dependency Wall (RecMII)
In many real-world algorithms, loop iterations are not completely independent. A loop frequently contains an **Inter-Iteration Recurrence (Loop-Carried Dependency)**, where iteration $k+1$ requires a feedback value computed by iteration $k$:

```c
// LOOP WITH INTER-ITERATION RECURRENCE (FEEDBACK DEPENDENCY)
for (int i = 1; i < 1000; i++) {
    Y[i] = (A[i] * C1) + Y[i-1]; // Y[i] DEPENDS ON PREVIOUS RESULT Y[i-1]!
}
```

Look at the physical hardware constraint created by this feedback loop:
* Iteration $k+1$ cannot complete its addition until iteration $k$ has finished its own addition and passed the value $Y[k-1]$ back through the hardware interconnect!
* If the hardware passes data through a chain of 4 PEs (taking 4 clock cycles to compute $Y[k-1]$), **Iteration $k+1$ CANNOT start its dependent addition until 4 clock cycles later!**

If the compiler attempts to launch iteration $k+1$ after only 1 or 2 clock cycles, iteration $k+1$ reads a stale, un-initialized value for $Y[k-1]$, causing **Catastrophic Arithmetic Corruption**!

We are trapped in a compiler scheduling dilemma:
* Launching new loop iterations too slowly (e.g., waiting 10 cycles per iteration) leaves $90\%+$ of the physical CGRA PEs sitting completely idle, ruining throughput.
* Launching new loop iterations too fast causes physical ALU resource collisions or violates inter-iteration recurrence feedback timing, corrupting arithmetic data.

How does a spatial hardware compiler mathematically compute the exact, minimum allowable clock cycle delay between launching consecutive loop iterations without causing physical ALU resource collisions or violating recurrence dependencies?

To solve this spatial loop scheduling crisis, spatial compilers implement **Modulo Loop Scheduling** and compute the **Initiation Interval ($II$)**.

---

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

---

### Strategy 1: Non-Pipelined Sequential Production ($II = 4\text{ Hours}$)
The manager enforces a rigid, non-pipelined rule: *"We process one cake at a time! Cake 1 must be fully mixed, baked, frosted, and decorated before Cake 2 can enter Station 0!"*

Look at the inefficiency of Strategy 1:
* **Hours 1..4**: Cake 1 moves through Station 0, 1, 2, and 3.
* During Hour 2, Station 0 (Mixer) sits completely empty and idle doing nothing!
* During Hour 4, Stations 0, 1, and 2 sit completely empty!
* A new cake finishes every **4 hours** (**Initiation Interval $II = 4\text{ hours}$**).
* Producing 1,000 cakes takes **4,000 hours** ($166\text{ days}$)! Stations sit idle $75\%$ of the time.

---

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

---

### Strategy 3: The Recurrence Constraint Hazard ($\text{RecMII} = 2\text{ Hours}$)

Now, suppose the customer orders a special type of sourdough cake with a **Secret Feedback Recipe (Inter-Iteration Recurrence)**:

The recipe rule states: *"To mix batter for Cake $k+1$, the baker MUST add 1 cup of baked warm crumb taken directly from the baked sponge of Cake $k$!"*

Look at the physical hardware constraint created by this secret feedback rule:
1. Station 0 (Mixer) starts mixing Cake $k$ at Hour 0.
2. Cake $k$ moves to Station 1 (Oven) at Hour 1, and finishes baking at **Hour 2**.
3. Station 0 **CANNOT MIX Cake $k+1$ at Hour 1** because Cake $k$'s baked sponge will not exist until Hour 2!
4. Station 0 is physically forced to wait until **Hour 2** before it can start mixing Cake $k+1$!

```text
RECURRENCE CONSTRAINT IN ACTION (RecMII = 2 HOURS)

 Hour 0: Station 0 mixes Cake 1.
 Hour 1: Station 1 bakes Cake 1. (Station 0 MUST WAIT! Cake 1 sponge not ready!)
 Hour 2: Cake 1 sponge ready! Station 0 mixes Cake 2 using Cake 1's sponge!
 (Initiation Interval CANNOT be 1 hour! It is FORCED to be II = 2 hours!)
```

Notice what happened under Strategy 3:
* The feedback dependency from Station 1 back to Station 0 created a **Recurrence Constraint ($\text{RecMII} = 2\text{ hours}$)**.
* Attempting to force $II = 1\text{ hour}$ would cause Station 0 to mix Cake $k+1$ without the baked crumb, **ruining the cake recipe**!
* The manager is mathematically forced to set the Initiation Interval to **$II = 2\text{ hours}$**.

This commercial bakery is the exact physical analogue of **Modulo Loop Scheduling on CGRAs**:
* The 1,000 cakes are **1,000 Loop Iterations**.
* The 4 kitchen stations are **4 Physical Processing Elements (PEs)**.
* The 1-hour time between launching cakes is the **Initiation Interval ($II$)**.
* Kitchen equipment capacity limits are **Resource Constraints ($\text{ResMII}$)**.
* Taking baked crumb from Cake $k$ to mix Cake $k+1$ is an **Inter-Iteration Recurrence Dependency ($\text{RecMII}$)**.
* Setting $II = 2\text{ hours}$ to honor the recipe feedback is **Modulo Scheduling Retiming**.

---

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

---

### The Modulo Property Invariant

Why is it called *Modulo* scheduling?

In a modulo-scheduled loop with Initiation Interval $II$, any operation $u$ scheduled to execute at clock cycle $t(u)$ in iteration 0 will execute at clock cycle $t(u) + (k \cdot II)$ in iteration $k$.

To prevent two operations from competing for the exact same physical PE on the same clock cycle, the compiler evaluates the **Modulo Time Slot ($M_{\text{slot}}$)**:

$$\mathbf{M_{\text{slot}}(u) = t(u) \pmod{II}}$$

Where:
* $t(u)$ is the scheduled clock cycle of operation $u$ in iteration 0.
* $II$ is the Initiation Interval of the loop.
* $M_{\text{slot}}(u)$ is the modulo time slot ($0 \le M_{\text{slot}} < II$).

#### The Modulo Resource Reservation Invariant:
Two operations $u$ and $v$ that require the **same physical hardware resource** (e.g., the same multiplier in PE 0) can be scheduled in the same loop if and only if their modulo time slots are distinct:

$$\mathbf{M_{\text{slot}}(u) \neq M_{\text{slot}}(v) \quad \text{whenever } \text{Resource}(u) == \text{Resource}(v)}$$

If $M_{\text{slot}}(u) == M_{\text{slot}}(v)$, operation $u$ from iteration $k$ and operation $v$ from iteration $k+1$ will attempt to use the physical resource at the exact same clock cycle, causing a **Resource Collision**!

---

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

---

### Bound 1: Resource-Constrained Minimum Initiation Interval ($\text{ResMII}$)

The **Resource-Constrained Minimum Initiation Interval ($\text{ResMII}$)** is the lower bound on $II$ imposed strictly by the physical hardware resource limits of the CGRA grid (number of ALUs, multipliers, memory load ports).

#### The ResMII Calculation Equation:
Let $R$ be the set of all hardware resource types in the CGRA (e.g., $R = \{\text{ALUs}, \text{Multipliers}, \text{Memory Ports}\}$).

For a specific resource type $r \in R$:
* Let $\text{Demand}(r)$ be the total number of operations of type $r$ required by one loop iteration in the Dataflow Graph (DFG).
* Let $\text{Supply}(r)$ be the total number of physical hardware units of type $r$ available in the CGRA grid.

$$\mathbf{\text{ResMII} = \max_{r \in R} \left\lceil \frac{\text{Demand}(r)}{\text{Supply}(r)} \right\rceil}$$

```text
RESMII DERIVATION EXAMPLE

 Loop DFG Demand          : 8 Multiplications + 4 Additions
 CGRA Grid Supply         : 2 Physical Multipliers + 4 Physical ALUs

 ResMII Calculation:
 Multiplier Demand/Supply = 8 / 2 = 4.0 Cycles
 ALU Demand/Supply        = 4 / 4 = 1.0 Cycle
 ResMII = Max(4.0, 1.0)   = 4 CLOCK CYCLES!
```

#### Example ResMII Derivation:
Suppose a loop DFG requires **8 multiplication operations** ($\text{Demand}(\text{Mul}) = 8$), and the CGRA grid contains **2 physical hardware multipliers** ($\text{Supply}(\text{Mul}) = 2$):

$$\text{ResMII} = \left\lceil \frac{8 \text{ Multiplications}}{2 \text{ Multipliers}} \right\rceil = \mathbf{4 \text{ Clock Cycles}}$$

This means the physical multipliers cannot process new iterations faster than **once every 4 clock cycles** ($\text{ResMII} = 4$). Attempting $II = 1, 2, \text{or } 3$ would overflow the physical multipliers!

---

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

---

## Modulo Reservation Tables and Hardware Context Memory

To generate a valid Modulo Schedule, spatial compilers construct a 2D matrix called a **Modulo Reservation Table (MRT)**.

### Constructing a Modulo Reservation Table

A Modulo Reservation Table maps physical hardware resources (rows) against modulo time slots $0 \dots II-1$ (columns):

$$\text{MRT Dimensions: } \mathbf{N_{\text{resources}} \times II}$$

```text
MODULO RESERVATION TABLE (MRT) FOR II = 3 CYCLES (4 PEs)

 Physical Resource │ Modulo Slot 0 (t % 3 == 0) │ Modulo Slot 1 (t % 3 == 1) │ Modulo Slot 2 (t % 3 == 2)
───────────────────┼────────────────────────────┼────────────────────────────┼────────────────────────────
 PE(0,0) [ALU]     │ Op A (Iter 0, 3, 6...)     │ Op D (Iter 0, 3, 6...)     │ [ FREE ]
 PE(0,1) [ALU]     │ [ FREE ]                   │ Op B (Iter 0, 3, 6...)     │ Op E (Iter 0, 3, 6...)
 PE(1,0) [MUL]     │ Op C (Iter 0, 3, 6...)     │ [ FREE ]                   │ [ FREE ]
 PE(1,1) [ALU]     │ [ FREE ]                   │ [ FREE ]                   │ Op F (Iter 0, 3, 6...)
```

#### How the Compiler Fills the MRT:
1. The compiler sets $II = \text{max}(\text{ResMII}, \text{RecMII})$.
2. The compiler schedules each operation $u$ in the loop DFG to a physical PE $(i,j)$ at clock cycle $t(u)$.
3. The compiler calculates $M_{\text{slot}} = t(u) \pmod{II}$.
4. **Collision Check**:
   * If MRT cell $[\text{PE}(i,j), M_{\text{slot}}]$ is empty, the compiler assigns operation $u$ to that cell (**Valid Placement!**).
   * If MRT cell $[\text{PE}(i,j), M_{\text{slot}}]$ is already occupied, a **Modulo Resource Conflict** has occurred!
5. **Conflict Resolution**: If a conflict occurs, the compiler either delays $t(u)$ by 1 cycle, selects a different physical PE, or increments $II \Leftarrow II + 1$ and rebuilds the MRT!

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Modulo Schedule Derivation, RecMII Cycle Bounds, and CGRA Throughput Analysis

To consolidate your complete mastery of Modulo Loop Scheduling, initiation intervals ($II$), ResMII resource bounds, RecMII recurrence bounds, Modulo Reservation Tables, and loop execution speedup calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Resource-Constrained Minimum Initiation Interval ($\text{ResMII}$)

Let us evaluate the hardware resource demand of 1 loop iteration against the $2 \times 2$ CGRA supply:

* **Multiplier Demand**: Op 1 (`MUL`) requires 1 multiplication.
  * Hardware Supply: 1 Multiplier ($\text{PE}_{1,0}$).
  * $\text{ResMII}_{\text{mul}} = \left\lceil \frac{1}{1} \right\rceil = \mathbf{1 \text{ Cycle}}$.

* **ALU Demand**: Op 2 (`ADD`) + Op 3 (`ADD`) require 2 additions.
  * Hardware Supply: 3 ALUs ($\text{PE}_{0,0}, \text{PE}_{0,1}, \text{PE}_{1,1}$).
  * $\text{ResMII}_{\text{alu}} = \left\lceil \frac{2}{3} \right\rceil = \mathbf{1 \text{ Cycle}}$.

$$\mathbf{\text{ResMII} = \max(1, 1) = 1 \text{ Clock Cycle}}$$

Based purely on hardware resource supply, the array could theoretically launch a new iteration on **every single clock cycle** ($\text{ResMII} = 1$).

---

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

---

#### Step 3: Determine Valid Initiation Interval ($II$)

We take the maximum of $\text{ResMII}$ and $\text{RecMII}$:

$$II = \max(\text{ResMII}, \ \text{RecMII}) = \max(1 \text{ cycle}, \ 2 \text{ cycles}) = \mathbf{2 \text{ Clock Cycles}}$$

$$\mathbf{II = 2 \text{ Clock Cycles}}$$

The compiler sets the Initiation Interval to **$II = 2\text{ clock cycles}$**.

---

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

---

#### Step 5: Calculate Execution Time (Modulo Pipelined vs Sequential)

Workload size $N = 1,000,000\text{ iterations}$. Clock $f_{\text{clk}} = 1.6\text{ GHz}$ ($T_{\text{clk}} = 0.625\text{ ns}$).

##### 1. Sequential Non-Pipelined Execution (No Overlap):
Total execution time for 1 single iteration $T_{\text{seq\_iter}} = T_{\text{mul}}(2) + T_{\text{wire}}(1) + T_{\text{add}}(1) + T_{\text{wire}}(1) + T_{\text{rec\_add}}(1) = \mathbf{6 \text{ Clock Cycles}}$.

$$\text{Total Cycles}_{\text{sequential}} = 1,000,000 \text{ iterations} \times 6 \text{ cycles/iter} = \mathbf{6,000,000 \text{ Clock Cycles}}$$

$$T_{\text{exec\_sequential}} = 6,000,000 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{0.003750 \text{ seconds}} \quad (3.750\text{ ms})$$

##### 2. Modulo Pipelined Execution ($II = 2\text{ Clock Cycles}$):
Pipeline fill latency for Iteration 0 $= 6\text{ clock cycles}$.
Remaining 999,999 iterations launch every $II = 2\text{ clock cycles}$:

$$\text{Total Cycles}_{\text{modulo}} = 6 \text{ (Fill)} + (1,000,000 - 1) \times 2 = 6 + 1,999,998 = \mathbf{2,000,004 \text{ Clock Cycles}}$$

$$T_{\text{exec\_modulo}} = 2,000,004 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0012500025 \text{ seconds}} \quad (1.250\text{ ms})$$

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and scheduling bounds against compiler principles:

1. **RecMII Bound Verification**:
   * Feedback loop: Op 3 $\to$ Op 3 next iteration.
   * Op 3 exec ($1\text{ c}$) + feedback wire ($1\text{ c}$) $= 2\text{ cycles}$. Distance $d = 1$.
   * $\text{RecMII} = \lceil 2 / 1 \rceil = 2\text{ cycles}$. Bound math $100\%$ exact.
2. **ResMII Bound Verification**:
   * 1 Multiplier needed / 1 available $= 1\text{ c}$.
   * 2 ALUs needed / 3 available $= 1\text{ c}$.
   * $\text{ResMII} = \max(1, 1) = 1\text{ cycle}$.
   * Final $II = \max(1, 2) = 2\text{ cycles}$. Constraint dominance verified!
3. **Modulo Reservation Table Collision Check**:
   * Op 1 occupies $[\text{PE}_{1,0}, \text{Slot 0}]$ and $[\text{PE}_{1,0}, \text{Slot 1}]$.
   * Op 2 occupies $[\text{PE}_{1,1}, \text{Slot 0}]$.
   * Op 3 occupies $[\text{PE}_{0,1}, \text{Slot 1}]$.
   * Zero overlapping cell assignments. Modulo schedule is $100\%$ collision-free!

All ResMII resource bounds, RecMII recurrence cycle calculations, Modulo Reservation Table placements, $II = 2$ rotating context addresses, and $3.00\times$ pipeline speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Modulo Loop Scheduling**: A spatial software-pipelining compiler optimization that overlaps consecutive iterations of a loop across physical Processing Elements (PEs) by initiating new iterations at a constant time interval ($II$), maximizing spatial hardware utilization and loop throughput.
* **Initiation Interval ($II$)**: The fixed number of clock cycles between launching successive loop iterations into a spatial CGRA grid, lower-bounded by resource constraints ($\text{ResMII} = \max \lceil \text{Demand} / \text{Supply} \rceil$) and recurrence feedback constraints ($\text{RecMII} = \max \lceil \text{Latency} / \text{Distance} \rceil$).
