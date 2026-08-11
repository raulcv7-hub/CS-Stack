content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/03-systolic-array-accelerators/01-systolic-array-dataflow-processing/01-matrix-multiply-systolic-dataflow.md
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

---

## The Bucket Brigade and the Rhythmic Pumping Heart: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of systolic arrays, dataflow pipelining, processing element grids, and spatial data reuse before analyzing matrix equations, skewed wavefronts, and hardware timing state machines, let us consider an everyday analogy: **The Human Bucket Brigade vs. The Single Water Fetcher**.

Imagine a village where a house is on fire 100 meters away from a water well (**Main Memory DRAM**). The village needs 1,000 buckets of water delivered to the fire (**1,000 MAC Operations**).

```text
THE BUCKET BRIGADE ANALOGY

 Strategy 1: The Single Water Fetcher (Naive Memory Fetch)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1 Runner carries 1 bucket from Well to Fire (100 meters).    │
 │ Runs 100 meters back to Well to get Bucket 2...              │
 │ Runner runs 200,000 total meters! Collapses from exhaustion! │
 └─────────────────────────────────────────────────────────────┘

 Strategy 2: The Rhythmic 2D Bucket Brigade (Systolic Array Dataflow)
 ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐
 │P00├───►│P01├───►│P02├───►│P03├───►│P04│  (100 Workers standing
 └───┘    └───┘    └───┘    └───┘    └───┘   side-by-side in a grid!)
   │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼
 ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐
 │P10├───►│P11├───►│P12├───►│P13├───►│P14│  Buckets passed directly
 └───┘    └───┘    └───┘    └───┘    └───┘  hand-to-hand on every beat!
```

Let us observe two different operational strategies for how the villagers extinguish the fire:

---

### Strategy 1: The Single Water Fetcher (Naive Memory Access)
The village hires one fast runner (**A Standard Memory-Bound ALU**).
1. The runner fills Bucket 1 at the well, runs 100 meters to the fire, dumps the water, and **runs 100 meters back to the well** to fill Bucket 2!
2. To deliver 1,000 buckets of water, the runner must run a total distance of **200,000 meters ($200\text{ kilometers}$)**!
3. The runner collapses from physical exhaustion after delivering only 10 buckets (**Memory Interconnect Saturation**). The house burns down.

---

### Strategy 2: The 2D Rhythmic Bucket Brigade (Systolic Array Dataflow)
The village manager arranges 100 villagers (**Processing Elements / PEs**) in a two-dimensional grid standing side-by-side, spaced just 1 meter apart from each other.

The village manager holds a metronome set to tick once per second (**The Master Hardware Clock**).

Trace how Strategy 2 delivers water across time:
1. **On Beat 1 (Clock Edge 1)**: The villager standing next to the well fills Bucket 1 and hands it to Villager (0,0).
2. **On Beat 2 (Clock Edge 2)**: Villager (0,0) pours a cup of water into their local container (**Local MAC Operation**) and **passes Bucket 1 directly to Villager (0,1) sitting to their right**! Simultaneously, the well hands Bucket 2 to Villager (0,0).
3. **On Beat 3 (Clock Edge 3)**: Villager (0,1) passes Bucket 1 to Villager (0,2). Villager (0,0) passes Bucket 2 to Villager (0,1).
4. **Continuous Rhythmic Flow**: The buckets flow rhythmically down rows and across columns, passing directly **from hand to hand** between adjacent villagers!

Look at what Strategy 2 achieved:
* **Zero Running Back to the Well**: Once Bucket 1 enters the grid, it travels across 10 villagers in sequence! It is **reused 10 times** as it passes from hand to hand before leaving the grid!
* **100x Reduction in Well Trips**: The village fetched Bucket 1 from the well **ONLY ONCE**, but extracted 10 productive water uses out of it!
* **Rhythmic Heartbeat Pumping**: The water flows smoothly like blood pumped through a cardiovascular system (**The origin of the word "Systolic", from the Greek *systole* — contracting/pumping heart**).

This 2D rhythmic bucket brigade is the exact physical analogue of a **Systolic Array Dataflow and Processing Element Grid**:
* The water well is **Main DRAM Memory**.
* The house fire is the **Final Computed Output Matrix $C$**.
* The water buckets are **Input Matrix Data Elements ($A_{i,k}$ and $B_{k,j}$)**.
* The 100 villagers standing in a grid are a 2D **Processing Element (PE) Grid**.
* Pouring a cup of water at each villager is a **Multiply-Accumulate (MAC) Operation ($C \Leftarrow C + A \cdot B$)**.
* Passing buckets hand-to-hand on every metronome beat is **Rhythmic PE-to-PE Register Streaming**.
* Reusing Bucket 1 ten times without returning to the well is **Spatial Data Reuse**.

---

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

---

### Mathematical Proof of $O(N)$ Operational Intensity Expansion

Let us mathematically prove how a Systolic Array converts a memory-bound problem into a compute-bound problem.

Consider multiplying two $N \times N$ matrices $A$ and $B$:
* Total data volume of matrix $A$ = $N^2$ elements ($N^2 \times 4\text{ bytes}$).
* Total data volume of matrix $B$ = $N^2$ elements ($N^2 \times 4\text{ bytes}$).
* Total Memory Data Read = $2 \cdot N^2 \times 4\text{ bytes} = \mathbf{8 \cdot N^2 \text{ Bytes}}$.

Total arithmetic operations required for matrix multiplication = $N^3$ MACs = $\mathbf{2 \cdot N^3 \text{ FLOPs}}$.

In an $N \times N$ Systolic Array:
1. Matrix $A$ is read from memory **ONCE**: $N^2$ elements.
2. Matrix $B$ is read from memory **ONCE**: $N^2$ elements.
3. As the $N^2$ elements of $A$ and $N^2$ elements of $B$ stream into the 2D PE grid, each element is passed across $N$ adjacent PEs in sequence.

We calculate the **Systolic Operational Intensity ($\text{OI}_{\text{systolic}}$)**:

$$\text{OI}_{\text{systolic}} = \frac{\text{Total Arithmetic Operations}}{\text{Total Memory Bytes Transferred}} = \frac{2 \cdot N^3 \text{ FLOPs}}{8 \cdot N^2 \text{ Bytes}} = \mathbf{\frac{N}{4} \quad \text{FLOPs / Byte}}$$

Where:
* $\text{OI}_{\text{systolic}}$ is the operational intensity of an $N \times N$ systolic array in FLOPs per byte.
* $N$ is the physical grid dimension of the systolic array (e.g., $N = 256$ for a $256 \times 256$ PE grid).

```text
OPERATIONAL INTENSITY SCALING WITH ARRAY SIZE (N)

 Systolic Array Dimension (N) │ Memory Read Volume (Bytes) │ Total Compute (FLOPs) │ Operational Intensity
──────────────────────────────┼────────────────────────────┼───────────────────────┼────────────────────────
 N = 1 (Single Scalar ALU)    │ 8 Bytes                    │ 2 FLOPs               │ 0.25 FLOPs / Byte
 N = 16 x 16 Systolic Grid    │ 2,048 Bytes                │ 8,192 FLOPs           │ 4.00 FLOPs / Byte
 N = 128 x 128 Systolic Grid  │ 131,072 Bytes              │ 4,194,304 FLOPs       │ 32.00 FLOPs / Byte
 N = 256 x 256 (Google TPU)   │ 524,288 Bytes (0.5 MB)     │ 33,554,432 FLOPs      │ 64.00 FLOPs / Byte!
```

Look at the extraordinary mathematical transformation in this table!
* On a single ALU ($N = 1$), operational intensity was a miserable **$0.25\text{ FLOPs/Byte}$**.
* On a $256 \times 256$ Systolic Array ($N = 256$), operational intensity explodes by $256\times$ to **$64.00\text{ FLOPs/Byte}$**!

By reading 0.5 Megabytes of matrix data into a $256 \times 256$ systolic grid once, the hardware executes **33.5 million operations**! 

The memory interconnect is completely un-burdened, and the hardware transitions from being memory-bandwidth bound to being $100\%$ compute-bound, operating at full clock speeds!

---

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

---

### The Three Internal Components of a Processing Element

Every PE in a 2D systolic grid contains three internal hardware sub-circuits:

1. **The Multiply-Accumulate (MAC) Engine**:
   * A high-speed 32-bit floating-point or integer multiplier paired with a 32-bit or 64-bit adder:

$$\mathbf{\text{MAC Operation: } C_{i,j} \Leftarrow C_{i,j} + (A_{\text{in}} \cdot B_{\text{in}})}$$

2. **The Local Accumulator Register ($C_{i,j}$)**:
   * A local 32-bit or 64-bit hardware register that holds the partial sum for output matrix element $C_{i,j}$.
3. **Neighbor-to-Neighbor Pipeline Registers**:
   * **Horizontal Pipeline Register ($A_{\text{out}}$)**: Captures input $A_{\text{in}}$ arriving from the West neighbor on `posedge clk` and drives it directly to the East neighbor on the next clock cycle.
   * **Vertical Pipeline Register ($B_{\text{out}}$)**: Captures input $B_{\text{in}}$ arriving from the North neighbor on `posedge clk` and drives it directly to the South neighbor on the next clock cycle.

---

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

---

## Skewed Wavefront Data Alignment and Systolic Execution Chronology

To execute matrix multiplication $C = A \times B$ on a 2D systolic array correctly, input operands cannot be dumped into the grid randomly. 

Because data takes 1 clock cycle to travel from one PE to its neighbor, input matrix elements must be fed into the array edges in a mathematically precise, time-staggered pattern called **Skewed Wavefront Data Alignment**.

---

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

---

### Step-by-Step Execution Chronology of a $3 \times 3$ Systolic Matrix Multiplication

Let us trace the complete hardware execution timeline of a $3 \times 3$ matrix multiplication $C = A \times B$ across clock cycles $t = 1 \text{ to } 7$:

```text
3x3 SYSTOLIC ARRAY MESH LAYOUT

                  North Inputs (Matrix B)
                     B00    B01    B02
                      │      │      │
                      ▼      ▼      ▼
 West Inputs ──►  ┌──────┬──────┬──────┐
 (Matrix A)       │PE(0,0)│PE(0,1)│PE(0,2)│
                  ├──────┼──────┼──────┤
                  │PE(1,0)│PE(1,1)│PE(1,2)│
                  ├──────┼──────┼──────┤
                  │PE(2,0)│PE(2,1)│PE(2,2)│
                  └──────┴──────┴──────┘
```

#### Cycle 1 ($t = 1$):
* West edge: $A_{0,0}$ enters PE $(0,0)$.
* North edge: $B_{0,0}$ enters PE $(0,0)$.
* **PE $(0,0)$ computes**: $C_{0,0} \Leftarrow C_{0,0} + (A_{0,0} \cdot B_{0,0})$.

#### Cycle 2 ($t = 2$):
* $A_{0,0}$ moves East from PE $(0,0) \to$ PE $(0,1)$.
* $B_{0,0}$ moves South from PE $(0,0) \to$ PE $(1,0)$.
* New West inputs: $A_{0,1}$ enters PE $(0,0)$; $A_{1,0}$ enters PE $(1,0)$.
* New North inputs: $B_{0,1}$ enters PE $(0,1)$; $B_{1,0}$ enters PE $(0,0)$.
* **Active MAC Computations**:
  * PE $(0,0)$ computes: $C_{0,0} \Leftarrow C_{0,0} + (A_{0,1} \cdot B_{1,0})$.
  * PE $(0,1)$ computes: $C_{0,1} \Leftarrow C_{0,1} + (A_{0,0} \cdot B_{0,1})$.
  * PE $(1,0)$ computes: $C_{1,0} \Leftarrow C_{1,0} + (A_{1,0} \cdot B_{0,0})$.

#### Cycle 3 ($t = 3$ — Peak Wavefront Concurrency):
* Wavefront reaches PE $(1,1)$!
* $A_{1,0}$ moves East to PE $(1,1)$; $B_{0,1}$ moves South to PE $(1,1)$.
* **PE $(1,1)$ computes**: $C_{1,1} \Leftarrow C_{1,1} + (A_{1,0} \cdot B_{0,1})$.
* PE $(0,0)$ computes its 3rd and final MAC: $C_{0,0} \Leftarrow C_{0,0} + (A_{0,2} \cdot B_{2,0})$.
* **$C_{0,0}$ IS NOW $100\%$ FULLY COMPUTED!**

#### Cycle 7 ($t = 3N - 2 = 7$):
* The final wavefront element $A_{2,2} \cdot B_{2,2}$ completes at PE $(2,2)$.
* **All $N^2 = 9$ matrix elements $C_{i,j}$ are fully computed inside the $3 \times 3$ PE grid!**

```text
TOTAL EXECUTION TIME FOR AN N x N SYSTOLIC ARRAY

 Total Clock Cycles to Multiply Two N x N Matrices = 3N - 2
 For N = 3   : 3(3) - 2 = 7 Clock Cycles
 For N = 256 : 3(256) - 2 = 766 Clock Cycles (vs 16.7 Million Cycles Scalar!)
```

Look at the extraordinary speedup:
Multiplying two $256 \times 256$ matrices requires $2 \cdot (256)^3 = \mathbf{33.5 \text{ million FLOPs}}$.

A $256 \times 256$ Systolic Array completes the entire $33.5\text{-million FLOP}$ matrix multiplication in **JUST 766 CLOCK CYCLES**!

---

## Real-World Silicon Engineering: Tiling, Un-Equal Matrices, and Drain Cycles

While the theoretical $N \times N$ Systolic Array model is mathematically elegant, real-world chip designers must adapt the hardware to handle practical engineering realities.

---

### 1. Matrix Tiling / Blocking for Fixed Hardware Arrays

What happens if an AI model needs to multiply a $4096 \times 4096$ matrix, but the physical hardware systolic array fabricated on the chip is fixed at $256 \times 256$ PEs (such as a Google TPU v3 matrix core)?

A $4096 \times 4096$ matrix cannot fit into a $256 \times 256$ grid in one pass!

The software compiler and hardware controller use **Matrix Tiling (Blocking)**:
1. The large $4096 \times 4096$ matrix is sliced into small $256 \times 256$ sub-matrix tiles.
2. The $256 \times 256$ tiles are streamed through the physical $256 \times 256$ systolic array one by one.
3. Partial sum matrix tiles are accumulated in local high-speed SRAM Scratchpad Buffers until the full $4096 \times 4096$ matrix product is complete.

```text
MATRIX TILING OVER A FIXED PHYSICAL SYSTOLIC ARRAY

 Large 4096x4096 Matrix A            Fixed 256x256 Physical Systolic Array
 ┌──────┬──────┬──────┬──────┐
 │Tile00│Tile01│Tile02│ ...  │ ──► Streamed tile-by-tile through 256x256 PE Grid!
 ├──────┼──────┼──────┼──────┤     (Accumulated in local Scratchpad SRAM!)
 │Tile10│Tile11│Tile12│ ...  │
 └──────┴──────┴──────┴──────┘
```

---

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

---

## Solved Industrial Engineering Exercise: Quantitative $3 \times 3$ Systolic Array Matrix Multiplication, Wavefront Timing, and Operational Intensity Analysis

To consolidate your complete mastery of systolic array dataflow architectures, 2D processing element (PE) grids, skewed wavefront alignment, $3N-2$ timing calculations, and operational intensity scaling, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Theoretical MACs, FLOPs, and Memory Traffic

For $3 \times 3$ matrix multiplication ($N = 3$):

##### 1. Total MAC Operations ($N^3$):
$$\text{Total MACs} = N^3 = 3^3 = \mathbf{27 \text{ MAC Operations}}$$

$$\text{Total FLOPs } (2 \text{ FLOPs per MAC}) = 27 \times 2 = \mathbf{54 \text{ FLOPs}}$$

##### 2. Memory Traffic Comparison:
* **Naive Memory Read Model**: Each MAC reads $A_{i,k}$ ($4\text{ B}$) and $B_{k,j}$ ($4\text{ B}$) $= 8\text{ Bytes}$.
  $$\text{Memory Data Read}_{\text{naive}} = 27 \text{ MACs} \times 8 \text{ Bytes/MAC} = \mathbf{216 \text{ Bytes}}$$
  $$\text{Operational Intensity}_{\text{naive}} = \frac{54 \text{ FLOPs}}{216 \text{ Bytes}} = \mathbf{0.25 \text{ FLOPs / Byte}}$$

* **Systolic Array Dataflow Model**:
  Matrix $A$ ($9 \text{ floats} \times 4\text{ B} = 36\text{ B}$) and Matrix $B$ ($9 \text{ floats} \times 4\text{ B} = 36\text{ B}$) are read from memory **ONCE**:
  $$\text{Memory Data Read}_{\text{systolic}} = 36 \text{ Bytes} + 36 \text{ Bytes} = \mathbf{72 \text{ Bytes}}$$
  $$\text{Operational Intensity}_{\text{systolic}} = \frac{54 \text{ FLOPs}}{72 \text{ Bytes}} = \mathbf{0.75 \text{ FLOPs / Byte}}$$

##### Operational Intensity Result:
The $3 \times 3$ Systolic Array increased operational intensity by **$3\times$** ($0.25 \to 0.75\text{ FLOPs/Byte}$), reducing memory traffic by $66.7\%$!

---

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

---

##### 2. Tracing Center Cell $\text{PE}_{1,1}$ (Computes $C_{1,1} = A_{1,0}B_{0,1} + A_{1,1}B_{1,1} + A_{1,2}B_{2,1}$):
* **Cycle 1 ($t = 1$)**: Inputs $A_{1,0}$ and $B_{0,1}$ have not reached $\text{PE}_{1,1}$ yet. $\text{PE}_{1,1}$ idle ($C_{1,1} = 0.0$).
* **Cycle 2 ($t = 2$)**: Inputs $A_{1,0}$ and $B_{0,1}$ enter array edges at $\text{PE}_{1,0}$ and $\text{PE}_{0,1}$.
* **Cycle 3 ($t = 3$)**:
  * $A_{1,0} (3.0)$ passes East from $\text{PE}_{1,0} \to \text{PE}_{1,1}$.
  * $B_{0,1} (0.0)$ passes South from $\text{PE}_{0,1} \to \text{PE}_{1,1}$.
  * $\text{PE}_{1,1}$ computes: $C_{1,1} \Leftarrow 0.0 + (3.0 \times 0.0) = \mathbf{0.0}$.
* **Cycle 4 ($t = 4$)**:
  * $A_{1,1} (0.0)$ passes East to $\text{PE}_{1,1}$; $B_{1,1} (3.0)$ passes South to $\text{PE}_{1,1}$.
  * $\text{PE}_{1,1}$ computes: $C_{1,1} \Leftarrow 0.0 + (0.0 \times 3.0) = \mathbf{0.0}$.
* **Cycle 5 ($t = 5$)**:
  * $A_{1,2} (4.0)$ passes East to $\text{PE}_{1,1}$; $B_{2,1} (1.0)$ passes South to $\text{PE}_{1,1}$.
  * $\text{PE}_{1,1}$ computes: $C_{1,1} \Leftarrow 0.0 + (4.0 \times 1.0) = \mathbf{4.0}$.
  * **$C_{1,1}$ IS FULLY COMPUTED! Final $C_{1,1} = \mathbf{4.0}$.**

```text
3x3 OUTPUT MATRIX C COMPUTED RESULT VERIFICATION

 Matrix C = A x B
 [ 2.0  1.0  0.0 ]   [ 1.0  0.0  2.0 ]   [ (2+0+0)  (0+3+0)  (4+1+0) ]   [ 2.0  3.0  5.0 ]
 [ 3.0  0.0  4.0 ] x [ 0.0  3.0  1.0 ] = [ (3+0+16) (0+0+4)  (6+0+0) ] = [19.0  4.0  6.0 ]
 [ 1.0  2.0  1.0 ]   [ 4.0  1.0  0.0 ]   [ (1+0+4)  (0+6+1)  (2+2+0) ]   [ 5.0  7.0  4.0 ]
 (PE(0,0) = 2.0 and PE(1,1) = 4.0 match exact matrix multiplication math!)
```

---

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

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against systolic dataflow principles:

1. **Wavefront Skew Verification**:
   * Last element $A_{2,2} \cdot B_{2,2}$ entered $\text{PE}_{2,2}$ at cycle $t = 2 + 2 + 1 + 2 = 7$.
   * Total array completion cycle $3N - 2 = 3(3) - 2 = 7$ cycles. Skew timing is $100\%$ exact.
2. **Matrix Multiplication Result Check**:
   * $C_{0,0} = (2 \cdot 1) + (1 \cdot 0) + (0 \cdot 4) = 2.0$. Matches $\text{PE}_{0,0}$ trace!
   * $C_{1,1} = (3 \cdot 0) + (0 \cdot 3) + (4 \cdot 1) = 4.0$. Matches $\text{PE}_{1,1}$ trace!
3. **Data Reuse Factor Check**:
   * Total MACs = 27. Total input floats read = 18.
   * Average reuse per float $= 27 / 18 = 1.5$ MAC uses per float (vs 0.5 in scalar).
   * Operational intensity increased from $0.25$ to $0.75\text{ FLOPs/Byte}$, matching $3\times$ reduction in memory reads.

All systolic grid inter-PE dataflows, skewed wavefront timing equations, $3N-2$ cycle bounds, and operational intensity scaling factors evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Systolic Array Dataflow**: A specialized parallel computing architecture where data operands drawn from memory flow rhythmically through a grid of interconnected processing units, being reused $O(N)$ times across neighboring cells before returning to memory to eliminate off-chip memory bandwidth saturation.
* **Processing Element (PE) Grid**: A 2D matrix of homogeneous hardware cells containing a local Multiply-Accumulate (MAC) engine, an accumulator register ($C_{i,j}$), and direct neighbor-to-neighbor pipeline registers (North $\to$ South, West $\to$ East) that execute matrix products with $O(N)$ operational intensity scaling.
