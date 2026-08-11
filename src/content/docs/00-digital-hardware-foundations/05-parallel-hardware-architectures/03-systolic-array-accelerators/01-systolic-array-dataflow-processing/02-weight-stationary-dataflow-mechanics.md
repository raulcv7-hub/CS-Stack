---
title: "Weight-Stationary Dataflow Architecture and Local Weight Register Mechanics"
---

# Weight-Stationary Dataflow Architecture and Local Weight Register Mechanics

## The Re-Streaming Memory Energy Drain and the Weight Access Friction

In modern artificial intelligence acceleration, deep learning inference, and digital signal processing, hardware accelerators perform billions of Multiply-Accumulate (MAC) operations every second. Whether a processor is evaluating a 2D convolutional layer inside an image recognition model or computing matrix-vector products inside a Large Language Model (LLM), the mathematical operation evaluates a fixed set of trained model parameters—called **Weights ($W$)**—against incoming streams of user data—called **Input Activations ($X$)**—to produce output results (**Output Activations $Y$**):

$$Y_{j,k} = \sum_{i=0}^{N-1} W_{i,j} \cdot X_{i,k}$$

Where:
* $Y_{j,k}$ is the output activation element at feature channel $j$ for input sample $k$.
* $W_{i,j}$ is the static neural network filter weight at input channel $i$, output channel $j$.
* $X_{i,k}$ is the input activation element at input channel $i$ for sample $k$.
* $N$ is the total number of input channels (e.g., $N = 1,024$).

Notice a fundamental mathematical property of deep learning workloads:
A single set of filter weights ($W$) is reused repeatedly across thousands of different input activation samples ($X_0, X_1, X_2 \dots X_{M-1}$). For example, a $3 \times 3$ convolutional filter containing 9 floating-point weights is applied to millions of pixels across an entire image frame!

Now, consider the physical energy catastrophe that occurs if a parallel processor architecture executes this matrix computation using a naive, non-stationary memory access policy:

```text
THE NAIVE WEIGHT RE-STREAMING ENERGY DRAIN

 Off-Chip DRAM / On-Chip SRAM Buffer (Storage of Weight W_0,0)
 ┌─────────────────────────────────────────────────────────────┐
 │ Weight W_0,0 stored at Memory Address 0x1000                │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
   Re-Fetch 1  │ (Input Sample X0)             │ Re-Fetch 1,000 (Input Sample X999)
   Cost: 5 pJ  │                               │ Cost: 5 pJ
               ▼                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Execution Processing Unit (Computes MAC: Y = Y + W * X)     │
 └─────────────────────────────────────────────────────────────┘
  (Reading W_0,0 1,000 times from memory burns 5,000 pJ of energy!)
```

Let us quantify the energy waste of re-streaming weights from memory:
1. **The Energy Cost Asymmetry**: In physical 7nm CMOS silicon manufacturing, executing a 16-bit Multiply-Accumulate (MAC) operation consumes approximately **$0.1 \text{ to } 0.5\text{ picojoules (pJ)}$** of electrical energy.
2. In contrast, reading a 16-bit weight operand from an on-chip SRAM Scratchpad Buffer consumes **$5\text{ pJ}$** ($10\times \text{to } 50\times$ more energy than the math operation!), and reading that same weight from off-chip DRAM memory consumes **$100 \text{ to } 600\text{ pJ}$** ($1,000\times$ more energy than the math operation!).

```text
SILICON ENERGY CONSUMPTION HIERARCHY

 Memory / Compute Operation           │ Energy Consumed per 16-Bit Word
──────────────────────────────────────┼─────────────────────────────────
 16-Bit Arithmetic MAC Operation      │ 0.2 pJ  (1x Base Math Cost)
 Local PE Register File Access        │ 0.1 pJ  (0.5x Math Cost - Ultra Low!)
 On-Chip SRAM Scratchpad Memory Read  │ 5.0 pJ  (25x Math Cost!)
 Off-Chip DRAM Memory Read            │ 200.0 pJ (1,000x Math Cost!)
```

Look at the physical energy numbers:
If a single weight $W_{0,0}$ is applied to 1,000 different input activations $X_0 \dots X_{999}$, reading $W_{0,0}$ from an on-chip SRAM buffer 1,000 separate times burns **$5,000\text{ picojoules}$ of energy fetching data**, compared to just **$200\text{ picojoules}$ doing actual arithmetic**!

Over $96\%$ of the processor's battery power and thermal energy budget is wasted moving the exact same, unchanging weight parameter back and forth across memory wires!

In mobile smartphones, autonomous vehicles, and Edge AI devices, burning battery power re-fetching unchanging filter weights from memory causes severe thermal throttling, drains batteries in minutes, and caps AI performance.

How do we design a hardware matrix accelerator that loads each filter weight from memory **EXACTLY ONCE**, locks the weight inside the processing core locally, and reuses it thousands of times with zero memory read energy?

To eliminate weight re-streaming energy drain and achieve peak energy efficiency, computer architects use **Weight-Stationary Dataflow Architectures** and **Local Weight Registers**.


### Strategy 1: The Re-Fetching Method (Non-Stationary Weight Flow)
The officer enforces an inefficient rule: *"I keep my desk completely empty. Every time a passenger arrives, I walk down the hallway to the vault, get the stamp, stamp the passport, and walk back to return the stamp to the vault."*

Look at what happens when 1,000 passengers arrive in line:
1. Passenger 0 arrives. The officer walks 100 meters to the vault, gets the stamp, walks 100 meters back, stamps Passport 0 in 1 second, and **walks 100 meters back to the vault to return the stamp**!
2. Passenger 1 arrives. The officer walks 100 meters to the vault again, gets the exact same stamp, walks back, stamps Passport 1, and returns the stamp...
3. To process 1,000 passengers, the officer walks a total distance of **200,000 meters ($200\text{ kilometers}$)**!

```text
STRATEGY 1: RE-FETCHING STAMP FOR EVERY PASSENGER

 Pass 0: Walk 200m ──► Stamp Passport 0 ──► Walk 200m
 Pass 1: Walk 200m ──► Stamp Passport 1 ──► Walk 200m
  :
 Pass 999: Walk 200m ─► Stamp Passport 999 ─► Walk 200m
 (Officer walks 200 kilometers to stamp 1,000 passports! Collapses from exhaustion!)
```

Look at the physical waste of Strategy 1:
The officer spent **$99.9\%$ of their energy walking down hallways** carrying the exact same rubber stamp back and forth, rather than actually stamping passports! The officer collapses from physical exhaustion (**Thermal Throttling**).


## Primitive 1: Weight-Stationary Dataflow Architecture

Now that we possess a clear intuitive mental model of locking the rubber stamp inside the desk drawer, let us examine the formal, rigorous engineering mechanics of **Weight-Stationary Dataflow Architecture**.

In a 2D systolic array matrix accelerator, data items can be categorized into three operational streams:
1. **Weights ($W$)**: Trained model filter parameters.
2. **Input Activations ($X$)**: Feature map data streamed into the accelerator.
3. **Partial Sums / Output Activations ($Y$)**: Intermediate or final accumulation results.

> **Weight-Stationary Dataflow** is an accelerator dataflow architecture where weight parameters ($W_{i,j}$) are loaded from memory into local registers inside the Processing Elements (PEs) during a pre-loading phase and kept physically stationary for hundreds or thousands of execution cycles, while input activations ($X$) stream horizontally across the array and partial sums ($Y$) stream vertically down the array.

```text
WEIGHT-STATIONARY DATAFLOW TOPOLOGY (4x4 PE GRID)

                   North Inputs: Partial Sums Y_in [Vertical Stream]
                       Y_in0    Y_in1    Y_in2    Y_in3
                         │        │        │        │
                         ▼        ▼        ▼        ▼
 West Inputs ──────► ┌───────┬────────┬────────┬────────┐
 Input Activations   │PE(0,0)│ PE(0,1)│ PE(0,2)│ PE(0,3)│
 X_in [Horizontal]   │[W0,0] │ [W0,1] │ [W0,2] │ [W0,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(1,0)│ PE(1,1)│ PE(1,2)│ PE(1,3)│
                     │[W1,0] │ [W1,1] │ [W1,2] │ [W1,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(2,0)│ PE(2,1)│ PE(2,2)│ PE(2,3)│
                     │[W2,0] │ [W2,1] │ [W2,2] │ [W2,3] │
                     └───────┴────────┴────────┴────────┘
                         │        │        │        │
                         ▼        ▼        ▼        ▼
                   South Outputs: Updated Partial Sums Y_out
 (ALL WEIGHTS [Wi,j] ARE LOCKED STATIONARY INSIDE LOCAL PE REGISTERS!)
```


## Primitive 2: The Local Weight Register Architecture

Now let us examine the second core primitive: **The Local Weight Register**.

A **Local Weight Register** is a small, specialized 16-bit or 32-bit SRAM flip-flop register embedded directly inside the physical silicon layout of every Processing Element (PE) cell.

### Hardware Datapath Architecture of a Weight-Stationary PE

Let us inspect the gate-level schematic of a Weight-Stationary Processing Element $\text{PE}(i,j)$:

```text
WEIGHT-STATIONARY PROCESSING ELEMENT (PE_i,j) SCHEMATIC

                  North Input: Partial Sum Y_in [32 Bits]
                             │
                             ▼
                    ┌─────────────────┐
                    │ Y_in Register   │
                    └────────┬────────┘
                             │
  West Input X_in            │             East Output X_out
  [16 Bits]                  ▼             [16 Bits]
  ──────────►[ X_in Reg ]─►( X ) ──►[ X_out Reg ]──────────►
                             ▲
                             │ (Stationary Weight Read: 0.1 pJ!)
                    ┌────────┴────────┐
                    │ LOCAL WEIGHT    │ ◄── Pre-Loaded Weight W_i,j
                    │ REGISTER (W_ij) │     (LOCKED STATIONARY!)
                    └─────────────────┘
                             │
                             ▼ (Product W_ij * X_in)
                           ( + )
                             │
                             ▼
                    ┌─────────────────┐
                    │ Y_out Register  │
                    └────────┬────────┘
                             │
                             ▼
                  South Output: Updated Y_out [32 Bits]
```


## Energy Mathematical Framework: Comparing Weight-Stationary vs. Non-Stationary Dataflows

To prove why Weight-Stationary Dataflow is the undisputed industry standard for AI inference chips (such as Google TPUs and Tesla FSD chips), let us build a rigorous mathematical model of memory energy consumption.

### Energy Model Equations

Let $N$ be the dimension of an $N \times N$ weight matrix ($W$).
Let $M$ be the number of input activation samples ($X_0 \dots X_{M-1}$) processed in a batch (Batch Size $M$).
Total MAC operations required $= N^2 \cdot M\text{ MACs}$.

Let $E_{\text{MAC}}$ be the energy required to execute one 16-bit MAC operation ($\approx 0.2\text{ pJ}$).
Let $E_{\text{reg}}$ be the energy required to read a word from a local PE register ($\approx 0.1\text{ pJ}$).
Let $E_{\text{SRAM}}$ be the energy required to read a word from on-chip SRAM memory ($\approx 5.0\text{ pJ}$).
Let $E_{\text{DRAM}}$ be the energy required to read a word from off-chip DRAM memory ($\approx 200.0\text{ pJ}$).

```text
ENERGY PARAMETER SPECIFICATION TABLE

 Energy Parameter │ Physical Meaning                          │ Energy Value (pJ)
──────────────────┼───────────────────────────────────────────┼───────────────────
 E_MAC            │ 16-Bit Multiply-Accumulate Math Execution │ 0.2 pJ
 E_reg            │ Local PE Register File Read               │ 0.1 pJ
 E_SRAM           │ On-Chip SRAM Scratchpad Buffer Read       │ 5.0 pJ
 E_DRAM           │ Off-Chip DRAM Memory Read                 │ 200.0 pJ
```


### Total Energy Calculation 2: Weight-Stationary Dataflow

In a Weight-Stationary architecture, the $N^2$ weights are read from SRAM **ONCE** during pre-loading. For all $M$ subsequent input samples, weights are read locally from the **Local Weight Register ($E_{\text{reg}}$)**:

$$\text{Weight Reads from SRAM}_{\text{stationary}} = N^2 \text{ reads (Pre-load Phase ONCE!)}$$

$$\text{Weight Reads from Local Reg}_{\text{stationary}} = N^2 \times (M - 1) \text{ reads from Local Register}$$

$$\text{Total Energy}_{\text{stationary}} = (N^2 \cdot E_{\text{SRAM}}) + (N^2 \cdot (M - 1) \cdot E_{\text{reg}}) + (N \cdot M \cdot E_{\text{SRAM}}) + (N^2 \cdot M \cdot E_{\text{MAC}})$$

$$\mathbf{\text{Total Energy}_{\text{stationary}} = N^2 \cdot E_{\text{SRAM}} + N^2 M \cdot E_{\text{reg}} + N M \cdot E_{\text{SRAM}} + N^2 M \cdot E_{\text{MAC}}}$$


## Dataflow Taxonomy: Weight-Stationary vs. Output-Stationary vs. Input-Stationary

While Weight-Stationary is the dominant dataflow for convolution and transformer inference accelerators, computer architects classify matrix accelerator dataflows into three fundamental taxonomies based on **which operand remains locked stationary inside the PE**:

```text
ACCELERATOR DATAFLOW TAXONOMY SPECTRUM

 1. Weight-Stationary (WS) ──► Weights W locked inside PEs.
                               X streams West-to-East; Y streams North-to-South.
                               Best for: CNNs, LLM Inference, Batch Processing.

 2. Output-Stationary (OS) ──► Partial sums Y locked inside PE Accumulators.
                               W streams West-to-East; X streams North-to-South.
                               Best for: High-precision Accumulation, Ultra-large Matrices.

 3. Input-Stationary (IS)  ──► Activations X locked inside PEs.
                               W streams West-to-East; Y streams North-to-South.
                               Best for: Streaming Real-Time Sensor Processing.
```

### 1. Weight-Stationary (WS Dataflow)
* **Stationary Operand**: Weights $W_{i,j}$ locked in PE Local Weight Registers.
* **Streaming Operands**: Activations $X$ stream horizontally; partial sums $Y$ stream vertically.
* **Primary Advantage**: Minimizes weight read energy. Highly efficient when the same weight matrix is reused across many input activations ($M \gg 1$).

### 2. Output-Stationary (OS Dataflow)
* **Stationary Operand**: Partial Sum Accumulators $Y_{i,j}$ locked inside PEs.
* **Streaming Operands**: Weights $W$ stream horizontally; activations $X$ stream vertically.
* **Primary Advantage**: Eliminates partial sum memory traffic! Partial sums stay inside high-precision 32-bit/64-bit PE accumulators until computation is complete, then written out once.

### 3. Input-Stationary (IS Dataflow)
* **Stationary Operand**: Input Activations $X_{i,k}$ locked inside PEs.
* **Streaming Operands**: Weights $W$ stream horizontally; partial sums $Y$ stream vertically.
* **Primary Advantage**: Minimizes activation read energy. Ideal when input activation frames (e.g. high-resolution camera video) are stationary while multiple neural network filter layers are evaluated against them.


### Scenario and Parameters

You are a senior microarchitect designing a $1.6\text{ GHz}$ Edge AI Accelerator chip ($T_{\text{clk}} = 0.625\text{ ns} = 625\text{ ps}$).

The accelerator features a physical **$16 \times 16$ Weight-Stationary Processing Element Grid** ($N = 16$, 256 total PEs: $\text{PE}_{0,0} \dots \text{PE}_{15,15}$).

```text
1.6 GHz EDGE AI ACCELERATOR WITH 16x16 WEIGHT-STATIONARY PE GRID

 Clock Frequency       : 1.6 GHz (T_clk = 625 ps)
 PE Array Dimensions   : 16 x 16 Processing Elements (256 Total PEs)
 Data Format           : 16-Bit Half-Precision Floats (2 Bytes / Element)
 Single PE MAC Energy  : E_MAC = 0.25 pJ
 Local PE Reg Read     : E_reg = 0.08 pJ
 On-Chip SRAM Read     : E_SRAM = 4.00 pJ
 Off-Chip DRAM Read    : E_DRAM = 160.00 pJ
```

#### The Neural Network Workload:
The accelerator executes a convolutional feature layer multiplying a $16 \times 16$ weight matrix ($W$, $256\text{ elements}$) against a batch of **$2,000\text{ input activation vectors}$** ($X_0 \dots X_{1999}$, $2,000 \times 16\text{ elements}$).

Total MAC operations $= 16 \times 16 \times 2,000 = \mathbf{512,000 \text{ MAC Operations}}$ ($1,024,000\text{ FLOPs}$).

#### System Implementations to Compare:

* **System A (Non-Stationary Architecture — Re-Fetching Weights)**:
  * Weights $W$ are re-read from On-Chip SRAM on every single input activation sample ($2,000\text{ times}$).
* **System B (Weight-Stationary Architecture — Local Weight Register Lock)**:
  * Weights $W$ are pre-loaded from On-Chip SRAM into PE Local Weight Registers **ONCE**.
  * For all 2,000 input activation samples, weights are read locally from PE registers ($E_{\text{reg}} = 0.08\text{ pJ}$).

#### Your Objective

1. Calculate the total energy consumed (in Microjoules, $\mu\text{J}$) by weight memory reads for **System A (Non-Stationary)** vs **System B (Weight-Stationary)** across the 2,000-sample workload.
2. Calculate the total overall energy consumed (including weight reads, activation reads, and MAC math execution) for System A vs System B.
3. Calculate the **Percentage Energy Reduction** and **Energy Efficiency Factor** achieved by System B over System A.
4. Calculate total execution time (in microseconds) for the $16 \times 16$ Weight-Stationary PE grid to process all 2,000 input samples (including 16-cycle pre-load phase and $3N-2$ wavefront streaming).
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Total System Processing Energy (System A vs System B)

Total MAC operations = $512,000\text{ MACs}$.
Activation reads ($X$): 16 activation elements per sample $\times 2,000\text{ samples} = 32,000\text{ activation reads}$ from SRAM ($E_{\text{SRAM}} = 4.00\text{ pJ}$).

$$\text{Energy}_{\text{activations}} = 32,000 \text{ reads} \times 4.00 \text{ pJ/read} = 128,000 \text{ pJ} = \mathbf{0.128 \text{ mJ}}$$

$$\text{Energy}_{\text{MAC\_math}} = 512,000 \text{ MACs} \times 0.25 \text{ pJ/MAC} = 128,000 \text{ pJ} = \mathbf{0.128 \text{ mJ}}$$

##### 1. Total System A Energy:
$$\text{Total Energy}_A = \text{Energy}_{\text{weight\_A}} + \text{Energy}_{\text{activations}} + \text{Energy}_{\text{MAC\_math}}$$

$$\text{Total Energy}_A = 2.048\text{ mJ} + 0.128\text{ mJ} + 0.128\text{ mJ} = \mathbf{2.304 \text{ Millijoules }} (2,304\text{ }\mu\text{J})$$

##### 2. Total System B Energy:
$$\text{Total Energy}_B = \text{Energy}_{\text{weight\_B}} + \text{Energy}_{\text{activations}} + \text{Energy}_{\text{MAC\_math}}$$

$$\text{Total Energy}_B = 0.04196\text{ mJ} + 0.128\text{ mJ} + 0.128\text{ mJ} = \mathbf{0.29796 \text{ Millijoules }} (298.0\text{ }\mu\text{J})$$


#### Step 4: Calculate Execution Time for System B

Execution timeline for a $16 \times 16$ Weight-Stationary array processing $M = 2,000$ activation samples:

1. **Weight Pre-loading Phase**: Staging 16 rows of weights into the grid $= 16\text{ clock cycles}$.
2. **Pipelined Wavefront Activation Phase**:
   * Skewed setup delay for 16 rows $= 16 - 1 = 15\text{ clock cycles}$.
   * Streaming 2,000 activation samples $= 2,000\text{ clock cycles}$.
   * Array drain cycles $= 16 - 1 = 15\text{ clock cycles}$.

$$\text{Total Execution Cycles} = 16 \text{ (Pre-load)} + 15 \text{ (Setup)} + 2,000 \text{ (Streaming)} + 15 \text{ (Drain)} = \mathbf{2,046 \text{ Clock Cycles}}$$

##### Calculate Total Execution Time ($T_{\text{exec}}$) at $1.6\text{ GHz}$ ($T_{\text{clk}} = 0.625\text{ ns}$):

$$T_{\text{exec}} = 2,046 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{1.27875 \text{ microseconds}} \quad (1,278.75\text{ ns})$$

##### Compute Operational Throughput (GFLOPS):
Total FLOPs $= 1,024,000\text{ FLOPs}$.

$$\text{Throughput} = \frac{1,024,000 \text{ FLOPs}}{1.27875 \times 10^{-6}\text{ s}} \approx \mathbf{800.78 \times 10^9 \text{ FLOPs/sec}} = \mathbf{800.78 \text{ GFLOPS}}$$

The Weight-Stationary AI accelerator processed 512,000 MAC operations in **$1.279\text{ microseconds}$** while operating at **$800.78\text{ GFLOPS}$** of sustained compute throughput!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Weight-Stationary Dataflow**: An accelerator dataflow architecture where trained filter weights ($W_{i,j}$) are loaded from memory into local Processing Element (PE) registers once and kept stationary for thousands of cycles, while input activations ($X$) and partial sums ($Y$) stream through the grid to eliminate $98\%+$ of weight memory read energy.
* **Local Weight Register**: A small SRAM flip-flop register embedded directly inside each PE cell that holds a weight parameter stationary, connecting directly to the PE's multiplier input to enable ultra-low-energy ($<0.1\text{ pJ}$) local weight reads.
