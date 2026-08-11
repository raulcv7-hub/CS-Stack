---
title: "Systolic Array Dataflow Architecture and Processing Element Grid Mechanics"
---

# Systolic Array Dataflow Architecture and Processing Element Grid Mechanics

## The $N^3$ Memory Bandwidth Saturation Wall in Matrix Multiplication

In modern computational workloads—such as deep learning neural network training, computer vision filtering, 3D graphics transformations, and scientific linear algebra—the primary computational bottleneck is **Matrix Multiplication ($C = A \times B$)**. Whether a processor is calculating self-attention weights in a Large Language Model or solving systems of linear equations in a physical fluid simulation, the underlying execution engines spend over $80\%$ of their operational lifespan computing products and sums of large multi-dimensional matrices.

Mathematically, multiplying an $N \times N$ matrix $A$ by an $N \times N$ matrix $B$ to produce an $N \times N$ output matrix $C$ requires computing $N^2$ individual scalar dot products. Each element $C_{i,j}$ in the output matrix is defined by the inner product sum:

$$C_{i,j} = \sum_{k=0}^{N-1} A_{i,k} \cdot B_{k,j} \quad \text{for } 0 \le i, j < N$$

Where:
* $C_{i,j}$ is the output scalar element at row $i$, column $j$ in matrix $C$.
* $A_{i,k}$ is the scalar element at row $i$, column $k$ in input matrix $A$.
* $B_{k,j}$ is the scalar element at row $k$, column $j$ in input matrix $B$.
* $N$ is the matrix dimension size (e.g., $N = 1,024$).

To compute the entire output matrix $C$, the processor must execute **$N^3$ Multiply-Accumulate (MAC) operations** ($1,024^3 = 1,073,741,824\text{ MACs}$ for a $1024 \times 1024$ matrix!).

Now, consider what occurs at the physical hardware level if a processor attempts to compute matrix multiplication using a standard general-purpose CPU or vector architecture where operands are read from memory, processed in an ALU, and written back to registers or memory:

```text
THE NAIVE MEMORY FETCH BOTTLENECK (READING OPERANDS PER MAC)

 Memory (DRAM / SRAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Matrix A Entries | Matrix B Entries | Matrix C Accumulators │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
               │ 2 Memory Reads per MAC        │ 1 Memory Write per MAC
               ▼                               │
 ┌─────────────────────────────────────────────┴───────────────┐
 │ Standard Arithmetic Logic Unit (MAC: C = C + A * B)         │
 └─────────────────────────────────────────────────────────────┘
  (Requires 2N³ Memory Reads to compute N³ Arithmetic Operations!)
```

Let us trace the physical memory traffic required by this naive approach:
1. To compute a single MAC operation ($C_{i,j} \Leftarrow C_{i,j} + A_{i,k} \cdot B_{k,j}$), the ALU must fetch operand $A_{i,k}$ from memory and fetch operand $B_{k,j}$ from memory. That is **2 memory reads per MAC operation**.
2. For an $N \times N$ matrix multiplication requiring $N^3$ MAC operations, the memory subsystem must execute **$2 \cdot N^3$ memory reads**!
3. For a $1024 \times 1024$ matrix ($N = 1024$), computing 1.07 billion MAC operations requires **2.14 billion individual memory reads** from the memory hierarchy!

We can quantify this memory traffic bottleneck using the fundamental hardware metric called **Operational Intensity (Arithmetic Intensity)**:

$$\text{Operational Intensity} = \frac{\text{Total Arithmetic Operations (FLOPs)}}{\text{Total Memory Data Transferred (Bytes)}}$$

In the naive memory fetch approach, computing $1\text{ MAC}$ ($2\text{ FLOPs}$) requires reading two 32-bit floating-point numbers ($8\text{ bytes}$ total):

$$\text{Operational Intensity}_{\text{naive}} = \frac{2 \text{ FLOPs}}{8 \text{ Bytes}} = \mathbf{0.25 \text{ FLOPs / Byte}}$$

Look at this physical catastrophe:
Modern high-performance processing dies can compute **hundreds of TeraFLOPs ($10^{12}\text{ FLOPs/sec}$)** using dense parallel execution gates, but off-chip memory interconnects (such as HBM or GDDR DRAM) can deliver only a few **Terabytes per second ($10^{12}\text{ Bytes/sec}$)** of data bandwidth.

To keep a $100\text{-TeraFLOP}$ computing engine $100\%$ busy, the memory subsystem would need to deliver:

$$\text{Required Bandwidth} = \frac{100 \times 10^{12} \text{ FLOPs/sec}}{0.25 \text{ FLOPs/Byte}} = \mathbf{400 \text{ Terabytes / second!}}$$

The physical memory bus cannot deliver 400 Terabytes per second across motherboard traces! 

The off-chip memory bus becomes completely saturated, and the multi-billion-transistor arithmetic ALUs spend $98\%+$ of their operational lifespan sitting completely frozen, **starved for data because the memory bus cannot feed them operands fast enough!**

How do we design a hardware processing engine that computes $N^3$ MAC operations while reading input matrix operands from memory **ONLY ONCE**, reusing data elements locally hundreds or thousands of times inside the silicon die without returning to memory?

To break the $N^3$ memory bandwidth saturation wall, computer architects replace memory-bound ALUs with **Systolic Array Dataflow Architectures** and **Processing Element (PE) Grids**.


### Strategy 1: The Single Water Fetcher (Naive Memory Access)
The village hires one fast runner (**A Standard Memory-Bound ALU**).
1. The runner fills Bucket 1 at the well, runs 100 meters to the fire, dumps the water, and **runs 100 meters back to the well** to fill Bucket 2!
2. To deliver 1,000 buckets of water, the runner must run a total distance of **200,000 meters ($200\text{ kilometers}$)**!
3. The runner collapses from physical exhaustion after delivering only 10 buckets (**Memory Interconnect Saturation**). The house burns down.


## Primitive 1: The Systolic Array Dataflow

Now that we possess a clear intuitive mental model of the 2D bucket brigade and rhythmic pumping, let us examine the formal engineering mechanics of **The Systolic Array Dataflow**.

The concept of systolic computing (first proposed by H.T. Kung and Charles Leiserson in 1978 and popularized in modern AI hardware accelerators like Google's Tensor Processing Units / TPUs) is defined by a fundamental hardware principle:

> **The Systolic Array Principle**: A systolic array is a 2D grid of homogeneous, tightly-coupled Processing Elements (PEs) where data operands drawn from memory flow rhythmically in specific directions through short, local register connections between neighboring PEs, being reused $O(N)$ times at internal nodes before returning to memory.

```text
DATAFLOW COMPARISON: CONVENTIONAL VS SYSTOLIC ARRAY

 Conventional Processing (Low Reuse, Memory Bound)
 Memory ──► Read ──► ALU ──► Write ──► Memory
 (Operational Intensity = 0.25 FLOPs / Byte)

 Systolic Array Dataflow (High Reuse, Compute Bound)
 Memory ──► PE(0,0) ──► PE(0,1) ──► PE(0,2) ──► PE(0,3) ──► Output
              │           │           │           │
              ▼           ▼           ▼           ▼
            PE(1,0) ──► PE(1,1) ──► PE(1,2) ──► PE(1,3) ──► Output
 (Data read ONCE from memory, reused N times across adjacent PEs!)
 (Operational Intensity = O(N) FLOPs / Byte!)
```


## Primitive 2: The Processing Element (PE) Grid Architecture

Now that we understand why systolic dataflows achieve $O(N)$ data reuse, let us examine the formal microarchitectural anatomy of the individual hardware cells that make up the array: **The Processing Element (PE) Grid**.

A **Processing Element (PE)** is a compact, self-contained hardware arithmetic cell. 

A **Processing Element Grid** is a 2D mesh of $N \times N$ identical PEs connected strictly to their immediate North, South, East, and West neighbors via 1-clock-cycle pipeline registers.

```text
INTERNAL ANATOMY OF A SINGLE PROCESSING ELEMENT (PE_i,j)

                    North Input B_in [32 Bits]
                             │
                             ▼
                    ┌─────────────────┐
                    │ B_in Register   │
                    └────────┬────────┘
                             │
  West Input A_in            │             East Output A_out
  [32 Bits]                  ▼             [32 Bits]
  ──────────►[ A_in Reg ]─►( X ) ──►[ A_out Reg ]──────────►
                             │
                             ▼ (Product A * B)
                           ( + ) ◄── Accumulator Reg C_ij
                             │
                             ▼
                    ┌─────────────────┐
                    │ B_out Register  │
                    └────────┬────────┘
                             │
                             ▼
                    South Output B_out [32 Bits]
```


### Why Local Neighbor Wiring Minimizes Power and Area

Look closely at the physical connections of PE $(i,j)$ in the grid:

$$\text{PE}(i,j) \text{ connects ONLY to } \text{PE}(i, j-1) \ [\text{West}], \ \text{PE}(i, j+1) \ [\text{East}], \ \text{PE}(i-1, j) \ [\text{North}], \ \text{PE}(i+1, j) \ [\text{South}]$$

```text
LOCAL NEIGHBOR-ONLY MESH WIRING (NO CROSSBARS!)

 PE(0,0) ──────► PE(0,1) ──────► PE(0,2) ──────► PE(0,3)
    │               │               │               │
    ▼               ▼               ▼               ▼
 PE(1,0) ──────► PE(1,1) ──────► PE(1,2) ──────► PE(1,3)
    │               │               │               │
    ▼               ▼               ▼               ▼
 PE(2,0) ──────► PE(2,1) ──────► PE(2,2) ──────► PE(2,3)
 (All wires are short 1-millimeter local connections between adjacent cells!)
```

#### Microarchitectural Benefits of Neighbor-Only Wiring:
1. **Short Wire Lengths**: Wires between adjacent PEs are less than a millimeter long on the silicon die. Long $10\text{-millimeter}$ crossbar traces are completely eliminated!
2. **Low Parasitic Capacitance**: Short wires have minuscule parasitic capacitance ($C_{\text{wire}}$), allowing signals to travel between PEs in less than **$100\text{ picoseconds}$**!
3. **Low Dynamic Power**: Charging short local wires consumes $90\%$ less dynamic switching power ($P = C \cdot V^2 \cdot f$) than driving global interconnect buses.


### The Skewed Input Alignment Rule

Consider a $3 \times 3$ Matrix Multiplication executed on a $3 \times 3$ Systolic Array:

$$\text{Matrix A (Feeds horizontally from the West)} = \begin{bmatrix} A_{0,0} & A_{0,1} & A_{0,2} \\ A_{1,0} & A_{1,1} & A_{1,2} \\ A_{2,0} & A_{2,1} & A_{2,2} \end{bmatrix}$$

$$\text{Matrix B (Feeds vertically from the North)} = \begin{bmatrix} B_{0,0} & B_{0,1} & B_{0,2} \\ B_{1,0} & B_{1,1} & B_{1,2} \\ B_{2,0} & B_{2,1} & B_{2,2} \end{bmatrix}$$

Why must the input matrices be delayed before entering the grid?

Look at the physical distance $A_{0,0}$ and $B_{0,0}$ must travel to meet at PE $(0,0)$ versus where $A_{1,0}$ and $B_{0,1}$ meet at PE $(1,1)$:
* Element $A_{0,0}$ enters PE $(0,0)$ on **Clock Cycle 1**.
* Element $A_{1,0}$ (Row 1 of Matrix A) must meet $B_{0,1}$ (Column 1 of Matrix B) at PE $(1,1)$.
* But PE $(1,1)$ sits 1 hop south and 1 hop east of the inputs! Data takes 1 extra cycle to reach Row 1 and Column 1.
* Therefore, Row 1 of Matrix A must be **delayed by 1 clock cycle** relative to Row 0!
* Row 2 of Matrix A must be **delayed by 2 clock cycles** relative to Row 0!

```text
SKEWED INPUT WAVEFRONT ALIGNMENT FOR A 3x3 SYSTOLIC ARRAY

 Matrix A (West Inputs)                     Matrix B (North Inputs)
 Row 0: [ A02  A01  A00 ]                   Col 0:  Col 1:  Col 2:
 Row 1: [ A12  A11  A10  0  ]                 B20     0       0
 Row 2: [ A22  A21  A20  0   0  ]             B10    B21      0
                                              B00    B11     B22
                                               0     B01     B12
 (Each row/col delayed by i cycles!)           0      0      B02
```

#### The Skewed Delay Formula:
For any input element $A_{i,k}$ in Row $i$ of Matrix A, the clock cycle $t_{\text{entry}}(i,k)$ when it enters the West edge of the array is:

$$\mathbf{t_{\text{entry\_A}}(i,k) = i + k + 1}$$

For any input element $B_{k,j}$ in Column $j$ of Matrix B, the clock cycle $t_{\text{entry}}(k,j)$ when it enters the North edge of the array is:

$$\mathbf{t_{\text{entry\_B}}(k,j) = j + k + 1}$$

Where:
* $i$ is the row index of Matrix A ($0 \le i < N$).
* $j$ is the column index of Matrix B ($0 \le j < N$).
* $k$ is the inner dot-product summation index ($0 \le k < N$).


## Real-World Silicon Engineering: Tiling, Un-Equal Matrices, and Drain Cycles

While the theoretical $N \times N$ Systolic Array model is mathematically elegant, real-world chip designers must adapt the hardware to handle practical engineering realities.


### 2. Output Drain Cycles (Extracting Matrix $C$ from the Grid)

Once all $N^3$ MAC operations have completed, the computed output matrix elements $C_{i,j}$ are sitting inside the accumulator registers of the $N \times N$ PEs.

How does the hardware get the output matrix $C$ out of the grid and back into memory?

Hardware architects use two primary **Output Drain Mechanisms**:

1. **Shift-Out Drain (Systolic Read-Out)**:
   When computation completes, a `DRAIN` command causes all PEs to shift their accumulated $C_{i,j}$ values vertically downward (from North to South) or horizontally rightward (from West to East), streaming the output matrix $C$ out of the grid edges over $N$ clock cycles.
2. **Double-Buffered Output Registers**:
   Each PE contains two accumulator registers: an Active Accumulator ($C_{\text{active}}$) and a Shadow Output Latch ($C_{\text{shadow}}$). 
   * When computation finishes, $C_{\text{active}}$ is copied into $C_{\text{shadow}}$ in **1 clock cycle**.
   * While the previous matrix result $C_{\text{old}}$ is being read out of $C_{\text{shadow}}$ in the background, the PE grid **immediately begins computing the NEXT matrix multiplication ($C_{\text{new}}$)** on $C_{\text{active}}$ without waiting!


### Scenario and Parameters

You are a senior microarchitect auditing a $2.0\text{ GHz}$ AI matrix accelerator chip ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The accelerator features a physical **$3 \times 3$ Systolic Processing Element Grid** ($N = 3$, 9 total PEs: $\text{PE}_{0,0} \dots \text{PE}_{2,2}$) executing Output-Stationary dataflow.

```text
2.0 GHz AI ACCELERATOR WITH 3x3 SYSTOLIC PE GRID

 Clock Frequency           : 2.0 GHz (T_clk = 500 ps)
 Physical Array Grid       : 3 x 3 Processing Elements (9 Total PEs)
 Data Format               : 32-Bit Single-Precision Floats (4 Bytes / Element)
 Single PE MAC Latency     : 1 Clock Cycle (0.500 ns)
 Off-Chip DRAM Read Cost   : 100 Clock Cycles per 64-Byte Line Fill (50.0 ns)
```

#### Input Matrices $A$ and $B$ ($3 \times 3$ Single-Precision Floats):

$$\text{Matrix } A = \begin{bmatrix} 2.0 & 1.0 & 0.0 \\ 3.0 & 0.0 & 4.0 \\ 1.0 & 2.0 & 1.0 \end{bmatrix}, \quad \text{Matrix } B = \begin{bmatrix} 1.0 & 0.0 & 2.0 \\ 0.0 & 3.0 & 1.0 \\ 4.0 & 1.0 & 0.0 \end{bmatrix}$$

The input matrices are streamed into the $3 \times 3$ PE grid using skewed wavefront timing:
* West Inputs (Matrix $A$): Row 0 enters at $t=1$, Row 1 enters at $t=2$, Row 2 enters at $t=3$.
* North Inputs (Matrix $B$): Col 0 enters at $t=1$, Col 1 enters at $t=2$, Col 2 enters at $t=3$.

#### Your Objective

1. Calculate the total theoretical MAC operations and total floating-point operations (FLOPs) required to compute $C = A \times B$.
2. Calculate the **Operational Intensity** (FLOPs per Byte of memory read) for this $3 \times 3$ matrix multiplication using a **Naive Memory Read Model** vs a **Systolic Array Dataflow Model**.
3. Trace the step-by-step MAC computations inside **$\text{PE}_{0,0}$** (Top-Left) and **$\text{PE}_{1,1}$** (Center) across clock cycles $t = 1 \text{ to } 7$.
4. Calculate the total completion time (in clock cycles and nanoseconds) for all 9 output elements $C_{i,j}$ to be fully computed inside the $3 \times 3$ PE grid.
5. Calculate the **Performance Speedup Factor** of the $3 \times 3$ Systolic Array over a single scalar ALU executing the same matrix multiplication sequentially.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Trace Execution Chronology inside $\text{PE}_{0,0}$ and $\text{PE}_{1,1}$

Let us trace input arrival and MAC updates $C \Leftarrow C + (A \cdot B)$ across clock cycles $t = 1 \dots 7$:

##### 1. Tracing Top-Left Cell $\text{PE}_{0,0}$ (Computes $C_{0,0} = A_{0,0}B_{0,0} + A_{0,1}B_{1,0} + A_{0,2}B_{2,0}$):
* **Cycle 1 ($t = 1$)**:
  * West input: $A_{0,0} = 2.0$. North input: $B_{0,0} = 1.0$.
  * $\text{PE}_{0,0}$ computes: $C_{0,0} \Leftarrow 0.0 + (2.0 \times 1.0) = \mathbf{2.0}$.
* **Cycle 2 ($t = 2$)**:
  * West input: $A_{0,1} = 1.0$. North input: $B_{1,0} = 0.0$.
  * $\text{PE}_{0,0}$ computes: $C_{0,0} \Leftarrow 2.0 + (1.0 \times 0.0) = \mathbf{2.0}$.
* **Cycle 3 ($t = 3$)**:
  * West input: $A_{0,2} = 0.0$. North input: $B_{2,0} = 4.0$.
  * $\text{PE}_{0,0}$ computes: $C_{0,0} \Leftarrow 2.0 + (0.0 \times 4.0) = \mathbf{2.0}$.
  * **$C_{0,0}$ IS FULLY COMPUTED! Final $C_{0,0} = \mathbf{2.0}$.**


#### Step 3: Calculate Array Execution Time and Performance Speedup

Using the $3N - 2$ execution formula for an $N \times N$ systolic array ($N = 3$):

$$T_{\text{systolic}} = 3N - 2 = 3(3) - 2 = \mathbf{7 \text{ Clock Cycles}}$$

$$\text{Time in Nanoseconds} = 7 \text{ cycles} \times 0.500 \text{ ns/cycle} = \mathbf{3.500 \text{ nanoseconds}}$$

##### Single Scalar ALU Sequential Execution Time (Baseline):
A single scalar ALU executing 27 MACs sequentially (assuming 1 cycle per MAC):

$$T_{\text{scalar}} = 27 \text{ MACs} \times 1 \text{ cycle/MAC} = \mathbf{27 \text{ Clock Cycles}} \quad (13.500\text{ ns})$$

##### Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{scalar}}}{T_{\text{systolic}}} = \frac{27 \text{ cycles}}{7 \text{ cycles}} = \mathbf{3.857\times \text{ Performance Advantage!}}$$

```text
SYSTOLIC ARRAY PERFORMANCE OPTIMIZATION SUMMARY

 Execution Architecture  │ Total Clock Cycles │ Execution Time (ns) │ Operational Intensity
─────────────────────────┼────────────────────┼─────────────────────┼───────────────────────
 Single Scalar ALU       │ 27 Cycles          │ 13.50 ns            │ 0.25 FLOPs / Byte
 3x3 Systolic PE Grid    │  7 Cycles          │  3.50 ns            │ 0.75 FLOPs / Byte
                         │ (74.1% Saved!)     │ (10.00 ns Saved)    │ (3.0x Higher Intensity!)
```

##### Engineering Conclusion:
The $3 \times 3$ Systolic Array computed all 27 MAC operations in **7 clock cycles ($3.500\text{ ns}$)** instead of 27 cycles—delivering a **$3.86\times$ performance speedup** while reducing memory read traffic by $66.7\%$!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Systolic Array Dataflow**: A specialized parallel computing architecture where data operands drawn from memory flow rhythmically through a grid of interconnected processing units, being reused $O(N)$ times across neighboring cells before returning to memory to eliminate off-chip memory bandwidth saturation.
* **Processing Element (PE) Grid**: A 2D matrix of homogeneous hardware cells containing a local Multiply-Accumulate (MAC) engine, an accumulator register ($C_{i,j}$), and direct neighbor-to-neighbor pipeline registers (North $\to$ South, West $\to$ East) that execute matrix products with $O(N)$ operational intensity scaling.
