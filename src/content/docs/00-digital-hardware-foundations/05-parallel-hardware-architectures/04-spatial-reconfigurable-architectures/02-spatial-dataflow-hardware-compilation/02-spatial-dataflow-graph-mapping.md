---
title: "Spatial Dataflow Graph Mapping Architecture and Interconnect Routing Congestion Resolution"
---

# Spatial Dataflow Graph Mapping Architecture and Interconnect Routing Congestion Resolution

## The Place-and-Route Bottleneck and Interconnect Wire Congestion Failure

In spatial reconfigurable computing, Coarse-Grained Reconfigurable Arrays (CGRAs) process computational workloads by eliminating the traditional von Neumann instruction-fetch cycle. Instead of fetching, decoding, and issuing instruction bytes from memory on every clock cycle, a CGRA maps the mathematical operations of a software loop directly across a two-dimensional grid of physical **Processing Elements (PEs)**. 

To execute a software program spatially, a compiler converts the code into a **Dataflow Graph (DFG)** $G = (V, E)$, where each vertex $v \in V$ represents a discrete mathematical operation (such as an addition, multiplication, or shift), and each directed edge $e = (u, v) \in E$ represents a data dependency (a value produced by operation $u$ that must be consumed as an input by operation $v$).

When a spatial compiler attempts to map a software loop's Dataflow Graph onto a physical $M \times N$ CGRA grid, it faces a two-phase microarchitectural challenge:
1. **Spatial Placement (Node Assignment)**: Assigning every computational vertex $v \in V$ to a specific physical cell $\text{PE}(i,j)$ on the silicon die.
2. **Interconnect Routing (Edge Pathing)**: Establishing a valid, non-overlapping physical wire path through Switch Boxes and routing channels for every directed data edge $e = (u, v) \in E$.

```text
SPATIAL COMPILATION: PLACEMENT AND ROUTING PIPELINE

 Compiler Dataflow Graph (DFG)            Physical CGRA Hardware Grid
 Vertices V: Operations (+, *, >>)        16 Physical PEs (4x4 Grid)
 Edges E   : Data Dependencies            Fixed Interconnect Wire Buses
 ┌───────────────────────────────┐        ┌───────────────────────────────┐
 │ Node A ──► Node B ──► Node C  │ ─────► │ PE(0,0) ──► PE(0,1) ──► PE(0,2)│
 └───────────────────────────────┘        └───────────────────────────────┘
  (Compiler must assign nodes to PEs and route edges without wire collisions!)
```

However, even if a physical CGRA grid possesses more than enough Processing Elements to place all mathematical operations (for example, mapping a 12-operation DFG onto a 16-PE physical grid), spatial compilation frequently suffers a catastrophic failure: **Interconnect Routing Congestion**.

Consider the physical electrical and routing limitations of a real-world CGRA interconnect:
* Between any two adjacent PEs, the physical silicon die contains a **fixed, limited number of word-level routing channels** (typically 1 or 2 32-bit buses per direction).
* If an operation in the DFG has a **High Fan-Out** (for example, an input variable $A$ whose value is consumed by 5 different downstream operations simultaneously), the data word must be routed to 5 separate PEs across the grid.
* If multiple data edges attempt to pass through the exact same Switch Box or use the exact same 32-bit bus channel on the same clock cycle, a **Routing Wire Collision** occurs!

```text
INTERCONNECT WIRE ROUTING COLLISION AT A SWITCH BOX

 Edge 1 (PE 0,0 -> PE 2,2) ──┐
                             ├──► [ Switch Box (0,1) Wire Bus ] ──► COLLISION!
 Edge 2 (PE 0,1 -> PE 1,1) ──┘    (Only 1 Physical Bus Available!)
 (Place-and-Route Compilation FAILS! Hardware cannot execute the loop!)
```

Look at the consequences of an interconnect routing collision:
1. **Mapping Failure (Place-and-Route Failure)**: If the spatial compiler cannot find a valid, collision-free physical wire path for every data edge in the DFG, **the spatial compilation process fails completely**!
2. **Execution Collapse**: When place-and-route fails, the accelerator cannot configure its spatial pipeline. The loop cannot execute on the CGRA and is forced to fall back to a slow, energy-draining CPU core, burning $30\times \text{to } 50\times$ more energy per operation!
3. **Sub-Optimal PE Allocation**: To bypass wire congestion, compilers are often forced to leave $50\%+$ of the physical PEs completely empty, reducing the accelerator's spatial compute density and hardware utilization.

How does a spatial compiler automatically place Dataflow Graph nodes on a 2D PE grid to minimize wire routing lengths?

How do spatial routers negotiate wire conflicts, use idle PEs as routing repeaters, and resolve interconnect congestion to guarantee $100\%$ successful spatial place-and-route mapping?

To solve the routing congestion bottleneck, spatial hardware compilers employ **Manhattan Distance Placement Optimization**, **Pass-Through Routing Nodes**, and **PathFinder Negotiated Congestion Routing Algorithms**.


### Strategy 1: Naive Random Placement (Routing Gridlock & Planning Failure)

The planner places the factories randomly across the island without considering supply pipe connections:
1. The Oil Refinery (**Factory A**) is placed on Lot (0,0) at the Northwest corner.
2. The Plastic Plant (**Factory B**), which needs oil directly from Factory A, is placed on Lot (3,3) at the Southeast corner!
3. To connect Factory A to Factory B, the planner must lay a 6-block supply pipe across the middle of the island.
4. Meanwhile, 5 other factories also need oil from Factory A (**High Fan-Out**).
5. All 5 supply pipes attempt to run through the 2-lane road at Lot (1,1) (**Routing Congestion**).

```text
STRATEGY 1: NAIVE PLACEMENT (ROUTING GRIDLOCK)

 Factory A (Lot 0,0) ──► 5 Pipelines Rush to Road (1,1) ──► ROAD OVERFLOWS!
                                                            (Planning FAILS!)
```

Look at the physical disaster of Strategy 1:
* Road (1,1) cannot hold 5 supply pipes simultaneously. The road overflows!
* The planner cannot find an open path for the 5th pipe. **The city construction project fails and is canceled (Place-and-Route Compilation Failure)!**


## Primitive 1: Spatial Dataflow Graph (DFG) Mapping

Now that we possess a clear intuitive mental model of the island city planner, let us examine the formal, rigorous engineering mechanics of **Spatial Dataflow Graph (DFG) Mapping**.

A compiler for a Coarse-Grained Reconfigurable Array accepts high-level software source code (such as a C `for` loop) and converts it into a mathematical directed graph: **The Dataflow Graph (DFG)**.

> **A Dataflow Graph (DFG)** is a directed graph $G = (V, E)$ representing the spatial computation of a loop, where each vertex $v \in V$ represents a word-level operation (addition, multiplication, bitwise shift, memory load) and each directed edge $e = (u, v) \in E$ represents a data dependency carrying a data word from producer vertex $u$ to consumer vertex $v$.

```text
COMPILER DATAFLOW GRAPH (DFG) ANATOMY

 Software Statement: Y[i] = (A[i] + B[i]) * C - 5;

 Dataflow Graph G = (V, E)
 Vertices V = { Op0: Load A, Op1: Load B, Op2: Add, Op3: Mul, Op4: Sub, Op5: Store Y }
 Directed Edges E = { (Op0->Op2), (Op1->Op2), (Op2->Op3), (Op3->Op4), (Op4->Op5) }

 Graph Schematic:
 [ Op0: Load A ] ──┐
                   ├──► [ Op2: Add ] ──► [ Op3: Mul C ] ──► [ Op4: Sub 5 ] ──► [ Op5: Store Y ]
 [ Op1: Load B ] ──┘
```


### Placement Optimization: Minimizing Manhattan Wire Lengths

To make edge routing as easy as possible and prevent wire congestion, the compiler's Placement Engine uses a cost function that minimizes the **Manhattan Distance ($D_{\text{Manhattan}}$)** between connected operations.

Let $u$ and $v$ be two connected operations in the DFG ($e = (u, v) \in E$).

If operation $u$ is placed at physical coordinates $(i_u, j_u)$ and operation $v$ is placed at physical coordinates $(i_v, j_v)$ on the 2D PE grid, the Manhattan Wire Distance between them is:

$$\mathbf{D_{\text{Manhattan}}(u, v) = |i_u - i_v| + |j_u - j_v|}$$

Where:
* $i_u, j_u$ are the row and column coordinates of physical $\text{PE}_u$.
* $i_v, j_v$ are the row and column coordinates of physical $\text{PE}_v$.

```text
MANHATTAN WIRE DISTANCE ON A 2D GRID

 PE Grid Placement: PE_u at (0,0), PE_v at (2,3)
 (0,0) [PE_u] ───► (0,1) ───► (0,2) ───► (0,3)
                                           │
                                           ▼
                                         (1,3)
                                           │
                                           ▼
                                         (2,3) [PE_v]
 Distance D_Manhattan = |0 - 2| + |0 - 3| = 2 + 3 = 5 Hops!
```

#### Placement Cost Function:
The compiler's Placement Engine evaluates the total wire cost of a placement candidate using the sum of Manhattan distances across all edges in the DFG:

$$\mathbf{\text{Cost}_{\text{placement}} = \sum_{(u, v) \in E} D_{\text{Manhattan}}(u, v) \cdot \text{Weight}(u, v)}$$

By using optimization algorithms (such as Simulated Annealing or Force-Directed Placement), the compiler shifts vertices around the grid to minimize $\text{Cost}_{\text{placement}}$, placing strongly-connected operations in adjacent physical PEs ($D_{\text{Manhattan}} = 1$).


### Mechanism 1: Pass-Through PEs (`PE_PASS` / Identity Routing Nodes)

What happens if operation $u$ at $\text{PE}(0,0)$ needs to send a data word to operation $v$ at $\text{PE}(0,3)$, but all direct horizontal routing channels between Row 0 PEs are occupied?

The router uses an un-occupied intermediate PE—for example, $\text{PE}(0,1)$—as a **Pass-Through PE (`PE_PASS`)**:

> A **Pass-Through PE (`PE_PASS`)** is an idle, un-allocated Processing Element that the router configures to act as a pure hardware wire-repeater node, taking a data word arriving on one input bus (e.g., West) and passing it directly out to another output bus (e.g., East or South) without modifying its arithmetic value.

```text
PASS-THROUGH PE (PE_PASS) ROUTING NODE

 PE(0,0) [Producer Op u] ──► PE(0,1) [PE_PASS (Repeater)] ──► PE(0,2) [Consumer Op v]
                            (ALU configured to PASS input!
                            Value passed through unmodified in 1 clock cycle!)
```

#### How a PE Executes Pass-Through:
* The router configures $\text{PE}(0,1)$'s ALU to execute the identity pass-through operation:

$$\text{PE}_{\text{ALU\_Op}} \Leftarrow \text{PASS\_WEST} \implies \mathbf{\text{Output}_{\text{East}} = \text{Input}_{\text{West}}}$$

* The data word travels through $\text{PE}(0,1)$ in $1\text{ clock cycle}$, hopping across the physical grid to reach $\text{PE}(0,2)$!
* Pass-Through PEs allow the router to detour data around congested areas of the grid, turning idle PEs into flexible routing infrastructure.


## Edge Case Engineering: High Fan-Out Data Splitting and Routing Failure Recovery

In complex spatial programs, compilers encounter two difficult edge cases: **High Fan-Out Bus Splitting** and **Routing Failure Recovery**.

### 1. High Fan-Out Bus Splitting (Tree Multicasting)

When a single operation $u$ produces a data value that is consumed by $N_{\text{consumers}} = 5$ or $6$ downstream operations across the grid (High Fan-Out):

If the router attempts to create 6 separate, independent point-to-point wire paths from $u$'s PE, the outgoing routing channels at $u$'s Switch Box will immediately overflow!

```text
HIGH FAN-OUT STEINER TREE MULTICASTING

 High Fan-Out Producer Op u
            │
            ▼
     [ Switch Box (0,0) ] ──► Splitter Branch
            │
            ├───► East Branch  ──► Feeds Consumer 1 & Consumer 2
            │
            └───► South Branch ──► Feeds Consumer 3 & Consumer 4
 (1 outgoing wire split into a Steiner Tree; saves 60% interconnect area!)
```

#### The Hardware Solution: Steiner Tree Multicasting
Instead of routing 6 separate paths, the router constructs a **Steiner Minimal Tree**:
* The Switch Box at $u$'s PE outputs **1 single wire bus**.
* At an intermediate Switch Box down the grid, the routing multiplexer executes a **Multicast Split**, copying the incoming 32-bit word onto both its East and South output buses simultaneously!
* A single data word travels along the trunk of the tree and splits into branches near the consumers, saving $60\%+$ of interconnect wire channels!


## Solved Industrial Engineering Exercise: Quantitative Spatial DFG Placement, PathFinder Negotiated Congestion Routing, and Execution Throughput Analysis

To consolidate your complete mastery of spatial Dataflow Graph mapping, Manhattan distance placement cost functions, Pass-Through PEs, and PathFinder negotiated congestion routing, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Manhattan Wire Distances (Placement X vs Placement Y)

DFG Edges to route: $E = \{ (0 \to 2), \ (1 \to 2), \ (2 \to 3) \}$.

Fixed Placements: Node 0 at $(0,0)$, Node 1 at $(0,2)$, Node 3 at $(2,2)$.

##### 1. Candidate Placement X (Node 2 at $\text{PE}(2,0)$):
* Edge $(0 \to 2)$: Distance from $(0,0)$ to $(2,0) \implies |0 - 2| + |0 - 0| = \mathbf{2 \text{ Hops}}$.
* Edge $(1 \to 2)$: Distance from $(0,2)$ to $(2,0) \implies |0 - 2| + |2 - 0| = 2 + 2 = \mathbf{4 \text{ Hops}}$.
* Edge $(2 \to 3)$: Distance from $(2,0)$ to $(2,2) \implies |2 - 2| + |0 - 2| = \mathbf{2 \text{ Hops}}$.

$$\text{Total Distance}_{\text{PlacementX}} = 2 + 4 + 2 = \mathbf{8 \text{ Total Wire Hops}}$$

##### 2. Candidate Placement Y (Node 2 at $\text{PE}(1,1)$ — Center PE):
* Edge $(0 \to 2)$: Distance from $(0,0)$ to $(1,1) \implies |0 - 1| + |0 - 1| = 1 + 1 = \mathbf{2 \text{ Hops}}$.
* Edge $(1 \to 2)$: Distance from $(0,2)$ to $(1,1) \implies |0 - 1| + |2 - 1| = 1 + 1 = \mathbf{2 \text{ Hops}}$.
* Edge $(2 \to 3)$: Distance from $(1,1)$ to $(2,2) \implies |1 - 2| + |1 - 2| = 1 + 1 = \mathbf{2 \text{ Hops}}$.

$$\text{Total Distance}_{\text{PlacementY}} = 2 + 2 + 2 = \mathbf{6 \text{ Total Wire Hops}}$$

```text
MANHATTAN PLACEMENT DISTANCE COMPARISON

 Placement Candidate │ Node 2 Position │ Total Manhattan Wire Hops │ Placement Cost Rank
─────────────────────┼─────────────────┼───────────────────────────┼──────────────────────
 Candidate X         │ PE(2,0)         │ 8 Hops                    │ Higher Wire Demand
 Candidate Y         │ PE(1,1) Center  │ 6 Hops                    │ OPTIMAL MINIMUM! (25% Cut)
```

Candidate Placement Y reduces total Manhattan wire hops from 8 down to **6 hops ($25\%$ reduction in wire demand)**! Candidate Y is selected by the Placement Engine.


#### Step 3: Trace PathFinder Negotiated Congestion Routing

The router detects that Wire $r_{\text{South}}$ (from (0,1) to (1,1)) is overused by 2 edges.

##### Iteration 1 (Congestion Penalty Evaluation):
* $\text{Occupancy}(r_{\text{South}}) = 2$, $\text{Capacity} = 1$.
* Present Congestion Penalty $p(r) = 1 + (2 - 1) \times 10.0 = \mathbf{11.0}$.
* Wire Cost $\text{Cost}(r_{\text{South}}) = (1.0 + 1.0) \times 11.0 = \mathbf{22.0}$.

##### Iteration 2 (Rip-Up and Re-Routing Edge $(1 \to 2)$):
The router rips up Edge $(1 \to 2)$ and re-routes it using Dijkstra's shortest-path search:
* **Option A (Original Path via (0,1))**: Cost $= 1.0 \text{ (West bus)} + 22.0 \text{ (South bus)} = \mathbf{23.0}$.
* **Option B (Detour Path via (1,2))**:
  * Route: $\text{PE}(0,2) \xrightarrow{\quad \text{South bus } r_7 \quad} \text{PE}(1,2) \xrightarrow{\quad \text{West bus } r_8 \quad} \text{PE}(1,1)$.
  * Wire $r_7$ Cost $= 1.0$ ($\text{Occupancy} = 1$).
  * Wire $r_8$ Cost $= 1.0$ ($\text{Occupancy} = 1$).
  * Total Detour Cost $= 1.0 + 1.0 = \mathbf{2.0}$.

##### PathFinder Selection:
The router selects **Option B (Detour Path via $\text{PE}(1,2)$)** because its cost ($2.0$) is $11.5\times$ cheaper than congested Option A ($23.0$)!

```text
PATHFINDER CONGESTION RESOLUTION SUMMARY

 Edge (0 -> 2) Route : PE(0,0) ──► PE(0,1) [PE_PASS] ──► PE(1,1) [Node 2]
 Edge (1 -> 2) Route : PE(0,2) ──► PE(1,2) [PE_PASS] ──► PE(1,1) [Node 2]
 (Edge 2 detoured via PE(1,2)! ZERO WIRE COLLISIONS REMAIN!)
```

##### Final Collision-Free Wire Allocation:
* Edge $(0 \to 2)$: Uses East bus $(0,0)\to(0,1)$ and South bus $(0,1)\to(1,1)$. Occupancy $= 1$.
* Edge $(1 \to 2)$: Uses South bus $(0,2)\to(1,2)$ and West bus $(1,2)\to(1,1)$. Occupancy $= 1$.
* Edge $(2 \to 3)$: Uses South bus $(1,1)\to(2,1)$ and East bus $(2,1)\to(2,2)$. Occupancy $= 1$.

**$100\%$ Collision-Free Place-and-Route Completed Successfully!**


### Sanity Check and Verification

Let us verify our mathematical, structural, and routing results against spatial compilation principles:

1. **Manhattan Distance Calculation Check**:
   * Candidate X: $(0,0) \to (2,0) = 2$; $(0,2) \to (2,0) = 4$; $(2,0) \to (2,2) = 2$. Total $= 2 + 4 + 2 = 8$ hops.
   * Candidate Y: $(0,0) \to (1,1) = 2$; $(0,2) \to (1,1) = 2$; $(1,1) \to (2,2) = 2$. Total $= 2 + 2 + 2 = 6$ hops.
   * Placement cost reduction $8 \to 6$ verified!
2. **PathFinder Cost Inflation Check**:
   * Overused wire $r_{\text{South}}$ penalty $p(r) = 1 + (2 - 1) \times 10 = 11.0$.
   * Inflation cost $= (1 + 1) \times 11 = 22.0$.
   * Detour cost $= 1.0 + 1.0 = 2.0$.
   * Since $2.0 < 22.0$, PathFinder detour selection is $100\%$ mathematically guaranteed!
3. **Pipeline Throughput Check**:
   * $II = 1$ cycle per sample.
   * At $1.6\text{ GHz}$ ($0.625\text{ ns}$), $1,000,000$ samples take $1,000,003$ cycles $= 0.625\text{ ms}$.
   * Throughput $= 4 \text{ ops} / 0.625\text{ ns} = 6.40\text{ GOPS}$. Math is $100\%$ exact.

All Dataflow Graph mappings, Manhattan placement cost functions, Pass-Through PE routing nodes, PathFinder cost inflation equations, and $6.40\text{-GOPS}$ spatial throughput metrics evaluate with 100% mathematical, physical, and logical precision.

