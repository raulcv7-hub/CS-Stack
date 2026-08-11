---
title: "Output-Stationary Dataflow Architecture and Accumulator Register Grid Mechanics"
---

# Output-Stationary Dataflow Architecture and Accumulator Register Grid Mechanics

## The Partial Sum Writeback Crisis and Intermediate Accumulation Memory Drain

In high-performance artificial intelligence accelerators, neural network processors, and 3D graphics engines, matrix multiplication ($Y = W \cdot X$) is the core mathematical operation. Computing the matrix product of a trained weight matrix $W$ and an input activation matrix $X$ requires evaluating millions or billions of Multiply-Accumulate (MAC) operations. To calculate a single scalar entry $Y_{i,j}$ inside the output matrix $Y$, the processor must sum $K$ individual product terms across the inner matrix dimension $K$:

$$Y_{i,j} = \sum_{k=0}^{K-1} W_{i,k} \cdot X_{k,j} = (W_{i,0} \cdot X_{0,j}) + (W_{i,1} \cdot X_{1,j}) + (W_{i,2} \cdot X_{2,j}) + \dots + (W_{i,K-1} \cdot X_{K-1,j})$$

Where:
* $Y_{i,j}$ is the final output activation element at row $i$, column $j$ in output matrix $Y$.
* $W_{i,k}$ is the weight parameter at row $i$, column $k$ in weight matrix $W$.
* $X_{k,j}$ is the input activation element at row $k$, column $j$ in activation matrix $X$.
* $K$ is the inner dot-product accumulation depth (e.g., $K = 1,024$).

Notice the mathematical nature of this accumulation process:
Computing one single output element $Y_{i,j}$ requires $K$ sequential additions ($K$ accumulation steps). As the inner product steps through $k = 0 \dots K-1$, the calculation generates $K-1$ intermediate partial results called **Partial Sums ($Y_{i,j}^{(k)}$)**:

$$Y_{i,j}^{(0)} = W_{i,0} \cdot X_{0,j}$$

$$Y_{i,j}^{(1)} = Y_{i,j}^{(0)} + (W_{i,1} \cdot X_{1,j})$$

$$Y_{i,j}^{(2)} = Y_{i,j}^{(1)} + (W_{i,2} \cdot X_{2,j})$$

$$\dots$$

$$Y_{i,j}^{(K-1)} = Y_{i,j}^{(K-2)} + (W_{i,K-1} \cdot X_{K-1,j}) \quad (\text{Final Complete Output } Y_{i,j})$$

Now, consider the physical energy catastrophe that occurs if a parallel processor architecture executes this inner product summation using a naive, non-stationary memory access policy:

```text
THE NAIVE PARTIAL SUM MEMORY WRITEBACK ENERGY DRAIN

 Execution Processing Unit (Computes MAC: Y_next = Y_prev + W * X)
 ┌─────────────────────────────────────────────────────────────┐
 │ Calculates Step k: Y_ij_k = Y_ij_k-1 + (W_ik * X_kj)        │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
  Write Step k │ (Consumes 5 pJ to SRAM)       │ Read Step k+1 (5 pJ)
  Cost: 5 pJ   │                               │ Cost: 5 pJ
               ▼                               │
 ┌─────────────────────────────────────────────┴───────────────┐
 │ Scratchpad Shared Memory / DRAM Buffer                      │
 │ Stores Intermediate Partial Sum Y_ij_k                      │
 └─────────────────────────────────────────────────────────────┘
  (Writing & reading partial sum 1,020 times burns 10,000 pJ of energy!)
```

Let us quantify the energy waste of streaming intermediate partial sums back and forth to memory:
1. **The Energy Cost Asymmetry**: In physical $7\text{nm}$ CMOS silicon manufacturing, executing a 16-bit Multiply-Accumulate (MAC) operation in digital logic consumes approximately **$0.1 \text{ to } 0.5\text{ picojoules (pJ)}$** of electrical energy.
2. In contrast, writing a 32-bit partial sum out to an on-chip SRAM Scratchpad Buffer and reading it back on the next cycle consumes **$5 \text{ to } 10\text{ pJ}$ per MAC step** ($10\times \text{to } 50\times$ more energy than the math operation itself!). Writing partial sums out to off-chip DRAM memory consumes **$200 \text{ to } 600\text{ pJ}$** ($1,000\times$ more energy than the math operation!).

```text
ENERGY CONSUMPTION HIERARCHY PER ACCUMULATION STEP

 Memory / Compute Operation             │ Energy Consumed per 32-Bit Word
────────────────────────────────────────┼───────────────────────────────────
 16-Bit Arithmetic MAC Math Execution   │ 0.2 pJ  (1x Base Math Cost)
 Local PE Accumulator Register Write    │ 0.1 pJ  (0.5x Math Cost - Ultra Low!)
 On-Chip SRAM Partial Sum Read/Write    │ 10.0 pJ (50x Math Cost!)
 Off-Chip DRAM Partial Sum Read/Write   │ 400.0 pJ (2,000x Math Cost!)
```

Look at the physical energy numbers:
If an inner product dimension is $K = 1,024$, calculating one single output entry $Y_{i,j}$ by writing and reading 1,023 intermediate partial sums back and forth to an on-chip SRAM buffer burns **over $10,000\text{ picojoules}$ of energy moving intermediate data**, compared to just **$200\text{ picojoules}$ doing actual arithmetic**!

Over $98\%$ of the processor's thermal energy budget and battery power is burned moving un-finished, intermediate partial sums across memory wires—for data that software will discard the moment the next accumulation step finishes!

Furthermore, streaming partial sums back and forth to memory floods the memory interconnect buses, causing memory buffer contention and stalling the execution pipeline.

How do we design a hardware matrix accelerator that holds the partial sum $Y_{i,j}$ locally inside the processing core for all $K$ accumulation cycles, performs $K$ additions locally at sub-picojoule speeds, and writes the completed output $Y_{i,j}$ to memory **EXACTLY ONCE**?

To eliminate partial sum memory writeback energy drain and achieve peak energy efficiency, computer architects use **Output-Stationary Dataflow Architectures** and **Accumulator Register Grids**.


### Strategy 1: The Intermediate Vault Staging Method (Non-Stationary Output)

The accountant enforces a rigid, inefficient rule: *"I will not keep running totals on my desk! Every time I add one check transaction, I must write the new partial sum on a slip of paper, walk down the hallway to the central vault, lock the paper in a drawer, and then walk back to my desk."*

Look at what happens as 1,000 check transactions arrive one by one:
1. **Check 1 arrives ($+\$10$)**: The accountant types $0 + 10 = \$10$. The accountant writes `"$10"` on a slip of paper, walks 100 meters to the vault, locks the paper in a drawer, and walks 100 meters back to their desk.
2. **Check 2 arrives ($+\$5$)**: The accountant walks 100 meters to the vault, unlocks the drawer, reads `"$10"`, walks back to their desk, types $10 + 5 = \$15$, writes `"$15"` on a new slip, walks 100 meters back to the vault, and locks the paper in the drawer!
3. **Checks 3 through 1,000**: The accountant repeats this back-and-forth walking process for all 1,000 checks!

```text
STRATEGY 1: INTERMEDIATE VAULT STAGING (NON-STATIONARY)

 Check 1: Add $10 ──► Walk 100m to Vault ──► Store $10  ──► Walk 100m
 Check 2: Walk 100m ─► Fetch $10 ──► Add $5 ──► Store $15 ──► Walk 100m
  :
 Check 1,000: Walk 200 kilometers total to calculate ONE monthly balance!
 (Accountant collapses from physical exhaustion before finishing!)
```

Look at the physical waste of Strategy 1:
To sum 1,000 checks, the accountant walked **200,000 meters ($200\text{ kilometers}$)** back and forth to the vault! Over $99.9\%$ of their physical energy was burned walking down hallways carrying un-finished intermediate totals, rather than actually adding numbers!


## Primitive 1: Output-Stationary Dataflow Architecture

Now that we possess a clear intuitive mental model of the desk adding machine, let us examine the formal, rigorous engineering mechanics of **Output-Stationary Dataflow Architecture**.

In a 2D systolic array matrix accelerator, data items can be categorized into three operational streams:
1. **Weights ($W$)**: Trained model filter parameters.
2. **Input Activations ($X$)**: Feature map data streamed into the accelerator.
3. **Partial Sums / Output Activations ($Y$)**: Intermediate or final accumulation results.

> **Output-Stationary Dataflow** is an accelerator dataflow architecture where partial sum output accumulators ($Y_{i,j}$) are initialized to zero and held physically **STATIONARY** inside the local registers of the Processing Elements (PEs) for the entire duration of an inner product accumulation ($K$ cycles), while both weight matrices ($W$) and input activation matrices ($X$) stream continuously through the grid.

```text
OUTPUT-STATIONARY DATAFLOW TOPOLOGY (4x4 PE GRID)

                   North Inputs: Input Activations X_in [Vertical Stream]
                       X_in0    X_in1    X_in2    X_in3
                         │        │        │        │
                         ▼        ▼        ▼        ▼
 West Inputs ──────► ┌───────┬────────┬────────┬────────┐
 Weights W_in        │PE(0,0)│ PE(0,1)│ PE(0,2)│ PE(0,3)│
 [Horizontal]        │[Y0,0] │ [Y0,1] │ [Y0,2] │ [Y0,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(1,0)│ PE(1,1)│ PE(1,2)│ PE(1,3)│
                     │[Y1,0] │ [Y1,1] │ [Y1,2] │ [Y1,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(2,0)│ PE(2,1)│ PE(2,2)│ PE(2,3)│
                     │[Y2,0] │ [Y2,1] │ [Y2,2] │ [Y2,3] │
                     └───────┴────────┴────────┴────────┘
  (ALL OUTPUT ACCUMULATORS [Yi,j] ARE LOCKED STATIONARY INSIDE LOCAL PEs!)
```


## Primitive 2: The Accumulator Register Grid Architecture

Now let us examine the second core primitive: **The Accumulator Register Grid**.

An **Accumulator Register Grid** is a 2D array of $N \times N$ Processing Elements where each PE contains a high-precision local accumulator register ($C_{\text{accum}}$) designed to hold running partial sums locally without memory writeback traffic.

### Hardware Datapath Architecture of an Output-Stationary PE

Let us inspect the gate-level schematic of an Output-Stationary Processing Element $\text{PE}(i,j)$:

```text
OUTPUT-STATIONARY PROCESSING ELEMENT (PE_i,j) SCHEMATIC

                  North Input: Activation X_in [16 Bits]
                             │
                             ▼
                    ┌─────────────────┐
                    │ X_in Register   │
                    └────────┬────────┘
                             │
  West Input W_in            │             East Output W_out
  [16 Bits]                  ▼             [16 Bits]
  ──────────►[ W_in Reg ]─►( X ) ──►[ W_out Reg ]──────────►
                             │
                             ▼ (Product W_in * X_in)
                           ( + )
                             │
                             ▼
                    ┌─────────────────┐
                    │ LOCAL OUTPUT    │ ◄── Partial Sum Y_ij Accumulator
                    │ ACCUMULATOR     │     (32-Bit / 64-Bit Reg)
                    │ REGISTER (Y_ij) │     (LOCKED STATIONARY!)
                    └────────┬────────┘
                             │
                             ▼
                  South Output: Activation X_out [16 Bits]
```


### Sub-Word Accumulation Expansion (Bit-Width Extension)

Why is the local accumulator register $Y_{i,j}$ inside an Output-Stationary PE designed with a **wider bit-width** than the input operands $W$ and $X$?

Consider multiplying two 8-bit quantized integer operands ($W \in \text{INT8}, X \in \text{INT8}$):
* $W$ ranges from $-128 \text{ to } +127$.
* $X$ ranges from $-128 \text{ to } +127$.
* The product $W \cdot X$ requires **16 bits of precision** (ranging from $-16,256 \text{ to } +16,384$).

If an algorithm accumulates $K = 1,024$ of these 16-bit products into a single sum:

$$\text{Maximum Possible Sum} = 1,024 \times 16,384 = \mathbf{16,777,216}$$

A 16-bit signed integer can hold a maximum value of only $32,767$! 

If the local accumulator register were only 16 bits wide, **the running total would overflow after accumulating just 3 products**, ruining the calculation!

To prevent accumulation overflow during long inner products ($K = 1,024 \text{ or } 4,096$), Output-Stationary PEs use **Sub-Word Accumulation Expansion**:

$$\text{Input Operands: } W \in \text{INT8 } (8\text{b}), \quad X \in \text{INT8 } (8\text{b})$$

$$\text{Multiplier Output: } P \in \text{INT16 } (16\text{b})$$

$$\mathbf{\text{Local Accumulator Register: } Y_{i,j} \in \text{INT32 } (32\text{b}) \quad (\text{Holds up to } 130,000 \text{ MACs without Overflow!})}$$

```text
ACCUMULATOR BIT-WIDTH EXPANSION (PREVENTS OVERFLOW)

 Input W (INT8)   : [ 8 Bits ]
 Input X (INT8)   : [ 8 Bits ]
                    ──────────
 Product W * X    : [ 16 Bits ]  (Range: -16,256 .. +16,384)
                    ──────────
 Local Accumulator: [ 32 Bits ]  (Range: -2,147,483,648 .. +2,147,483,647!)
 (Accumulates over 100,000 products with ZERO bit overflow!)
```

By pairing 8-bit or 16-bit inputs with a **32-bit wide local accumulator register**, the PE executes thousands of accumulation steps with $100\%$ mathematical precision and zero overflow risks!


### Total Energy Calculation 1: Non-Stationary Partial Sum Dataflow

In a non-stationary architecture, after every single MAC step, the intermediate partial sum $Y_{i,j}^{(k)}$ is written to on-chip SRAM, and then read back from SRAM on the next step:

$$\text{Partial Sum Writes to SRAM} = N^2 \times K \text{ writes}$$

$$\text{Partial Sum Reads from SRAM} = N^2 \times (K - 1) \text{ reads}$$

$$\text{Total Partial Sum Memory Energy}_{\text{non\_stationary}} = N^2 \cdot K \cdot E_{\text{SRAM}} + N^2 \cdot (K-1) \cdot E_{\text{SRAM}}$$

$$\mathbf{\text{Partial Sum Energy}_{\text{non\_stationary}} \approx 2 \cdot N^2 \cdot K \cdot E_{\text{SRAM}}}$$


### Evaluating Energy Savings for a Real-World Workload

Let us evaluate both energy equations for a real-world neural network layer:
* Output Matrix Size $N \times N = 256 \times 256$ ($N^2 = 65,536\text{ output elements}$).
* Inner Accumulation Depth $K = 1,024$ product terms.
* Total MACs $= 65,536 \times 1,024 = \mathbf{67,108,864 \text{ MAC Operations}}$.

#### 1. Non-Stationary Partial Sum Energy Calculation:
$$\text{Total Energy}_{\text{non\_stationary}} \approx 2 \times 65,536 \times 1,024 \times 5.0\text{ pJ}$$

$$\text{Total Energy}_{\text{non\_stationary}} \approx 134,217,728 \times 5.0\text{ pJ} = \mathbf{671,088,640 \text{ pJ}} = \mathbf{671.09 \text{ Millijoules}}$$

#### 2. Output-Stationary Partial Sum Energy Calculation:
$$\text{Total Energy}_{\text{stationary}} = (65,536 \times 1,024 \times 0.1\text{ pJ}) + (65,536 \times 5.0\text{ pJ})$$

$$\text{Total Energy}_{\text{stationary}} = 6,710,886\text{ pJ} + 327,680\text{ pJ} = \mathbf{7,038,566 \text{ pJ}} = \mathbf{7.04 \text{ Millijoules}}$$

```text
PARTIAL SUM ENERGY CONSUMPTION COMPARISON (67.1 MILLION MACs)

 Dataflow Architecture    │ Partial Sum Location │ Partial Sum Energy │ Energy Savings %
──────────────────────────┼──────────────────────┼────────────────────┼──────────────────
 Non-Stationary Dataflow  │ On-Chip SRAM Buffer  │ 671.09 mJ          │ 0.0% (Baseline)
 Output-Stationary (OS)   │ Local PE Accumulator │   7.04 mJ          │ 98.95% ENERGY SAVED!
                          │ (Written ONCE at End)│ (664.05 mJ Saved!) │ (95.3x MORE EFFICIENT!)
```

Look at the extraordinary result:
Output-Stationary Dataflow reduced partial sum memory energy from $671.09\text{ Millijoules}$ down to **$7.04\text{ Millijoules}$**—a **$98.95\%$ energy reduction ($95.3\times$ energy efficiency improvement)** for the exact same matrix calculation!


## Solved Industrial Engineering Exercise: Quantitative Output-Stationary Dataflow Energy, Accumulator Bit-Width Expansion, and Throughput Analysis

To consolidate your complete mastery of Output-Stationary Dataflow architectures, accumulator register grids, sub-word accumulation expansion, and energy savings calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Verify Accumulator Overflow Margin

Input operands $W \in \text{INT8}$ ($-128 \dots +127$) and $X \in \text{INT8}$ ($-128 \dots +127$).

##### 1. Maximum Product Value ($P_{\text{max}}$):
$$P_{\text{max}} = (-128) \times (-128) = \mathbf{16,384}$$

##### 2. Maximum Accumulated Sum after $K = 2,048$ steps ($Y_{\text{max}}$):
$$Y_{\text{max}} = K \times P_{\text{max}} = 2,048 \times 16,384 = \mathbf{33,554,432}$$

##### 3. Maximum Capacity of 32-Bit Signed Integer Accumulator Register:
$$\text{Max Value (INT32)} = 2^{31} - 1 = \mathbf{2,147,483,647}$$

##### Overflow Safety Ratio:
$$\text{Safety Margin} = \frac{2,147,483,647}{33,554,432} \approx \mathbf{64.0\times \text{ Headroom Margin!}}$$

$$\text{Maximum } K \text{ before Overflow} = \frac{2,147,483,647}{16,384} \approx \mathbf{131,072 \text{ Accumulation Steps!}}$$

The 32-bit local accumulator register can accumulate up to **131,072 products** before overflowing! 

For $K = 2,048$, the accumulator has a $64\times$ safety headroom margin. Zero arithmetic overflow occurs!


#### Step 3: Calculate Energy Reduction and Efficiency Factor

$$\text{Partial Sum Energy Reduction} = \left( 1 - \frac{0.11100\text{ mJ}}{25.16582\text{ mJ}} \right) \times 100\% = \mathbf{99.56\% \text{ Partial Sum Energy Saved!}}$$

$$\text{Energy Efficiency Factor} = \frac{\text{Energy}_{\text{partial\_A}}}{\text{Energy}_{\text{partial\_B}}} = \frac{25.16582\text{ mJ}}{0.11100\text{ mJ}} \approx \mathbf{226.7\times \text{ Energy Efficiency Gain!}}$$

```text
PARTIAL SUM ENERGY OPTIMIZATION SUMMARY

 System Architecture        │ Partial Sum Location │ Energy Consumed (mJ) │ Energy Efficiency Gain
────────────────────────────┼──────────────────────┼──────────────────────┼────────────────────────
 System A (Non-Stationary)  │ On-Chip SRAM Buffer  │ 25.166 mJ            │ 1.00x (Baseline)
 System B (Output-Stationary)│ Local PE Accumulator │  0.111 mJ            │ 226.7x MORE EFFICIENT!
                            │ (Drained ONCE at end)│ (25.05 mJ Saved!)    │ (+22,570% Energy Gain)
```

##### Energy Result:
Locking partial sums inside local 32-bit PE accumulator registers reduced partial sum memory energy by **$99.56\%$ ($226.7\times$ energy efficiency gain)**!


### Sanity Check and Verification

Let us verify our mathematical, structural, and energy results against hardware design principles:

1. **Accumulator Overflow Margin Verification**:
   * Max accumulated value $= 33,554,432$.
   * 32-bit signed max $= 2,147,483,647$.
   * $33,554,432 < 2,147,483,647$. Zero overflow verified!
2. **PE Grid Pipeline Utilization Check**:
   * Accumulation phase $= 2,048\text{ cycles}$. Total execution time $= 2,111\text{ cycles}$.
   * Array pipeline utilization $= \frac{2,048}{2,111} \times 100\% = \mathbf{97.02\% \text{ PE Efficiency}}$!
3. **Drain Phase Energy Amortization**:
   * Drain phase energy $= 1,024 \times 6.0\text{ pJ} = 6.144\text{ nJ}$.
   * Total accumulation energy $= 104.858\text{ }\mu\text{J}$.
   * Drain phase energy overhead $= \frac{0.006144}{104.858} \approx \mathbf{0.0058\% \text{ Overhead}}$.
   * Drain phase energy cost is completely negligible ($< 0.01\%$), proving $100\%$ amortization across $K = 2,048$ steps!

All local accumulator register bit-width expansions, 32-bit INT32 overflow margins, partial sum energy reduction calculations, and TFLOPS throughput metrics evaluate with 100% mathematical, physical, and logical precision.

