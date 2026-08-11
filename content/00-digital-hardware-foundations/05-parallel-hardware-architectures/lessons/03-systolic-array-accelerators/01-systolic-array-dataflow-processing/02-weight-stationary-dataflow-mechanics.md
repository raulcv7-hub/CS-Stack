content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/03-systolic-array-accelerators/01-systolic-array-dataflow-processing/02-weight-stationary-dataflow-mechanics.md
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

---

## The Passport Officer and the Desk Rubber Stamp: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of weight-stationary dataflows, local weight registers, activation streaming, and energy reduction before inspecting transistor-level registers, state machines, and energy equations, let us consider an everyday analogy: **The International Airport Customs Desk**.

Imagine an immigration officer (**A Processing Element / PE Cell**) working at an airport border counter. The officer's job is to inspect 1,000 arriving international passengers (**1,000 Input Activations $X_0 \dots X_{999}$**) and apply an official Entry Visa Stamp (**A Neural Network Weight $W$**) onto each passenger's passport to produce an approved document (**Output Activation $Y$**).

```text
THE AIRPORT CUSTOMS DESK ANALOGY

 Customs Officer (Processing Element / PE Cell)
 ┌─────────────────────────────────────────────────────────────┐
 │ Desk Work Surface                                           │
 │ Stamping 1 Passport takes 1 Second (0.2 pJ Energy)          │
 └─────────────────────────────────────────────────────────────┘
                               ▲
                               │ 100-Meter Walk to Central Vault
                               ▼
 Central Document Vault (Main System Memory DRAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Holds Official Entry Visa Rubber Stamp (Weight W)           │
 └─────────────────────────────────────────────────────────────┘
```

The rubber stamp (**Weight $W$**) is stored inside a secure central vault (**Main System DRAM Memory**) located down a long 100-meter hallway. Walking to the central vault to retrieve the stamp takes **5 minutes of exhausting walking** ($200\text{ pJ}$ energy equivalent).

Let us observe two different operational strategies for how the officer stamps 1,000 passenger passports:

---

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

---

### Strategy 2: The Stationary Desk Lock Method (Weight-Stationary Dataflow)
Realizing the absurdity of walking down the hallway for every passenger, the officer adopts **Weight-Stationary Dataflow**:

Before the first passenger arrives in the morning:
1. The officer walks down the hallway to the central vault **EXACTLY ONCE**, retrieves the rubber stamp, walks back to their desk, and **LOCKS THE STAMP DIRECTLY INTO A DESK DRAWER** (**Pre-Loading the Local Weight Register**).
2. As 1,000 passengers walk past the desk one by one:
   * Passenger 0 steps up to the desk. The officer reaches out 2 centimeters, opens the desk drawer, grabs the stamp, stamps Passport 0 in 1 second, and drops the stamp back into the drawer!
   * Passenger 1 steps up. The officer grabs the stamp from the desk drawer, stamps Passport 1, and drops it back into the drawer!
3. The officer processes all 1,000 passengers smoothly.

```text
STRATEGY 2: STATIONARY DESK LOCK METHOD (WEIGHT-STATIONARY)

 Morning: Walk 100m ONCE ──► Lock Stamp in Desk Drawer (Pre-Load)
 ─────────────────────────────────────────────────────────────
 Pass 0: Grab Stamp from Desk Drawer (2 cm) ──► Stamp Passport 0!
 Pass 1: Grab Stamp from Desk Drawer (2 cm) ──► Stamp Passport 1!
  :
 Pass 999: Grab Stamp from Desk Drawer (2 cm) ──► Stamp Passport 999!
 (Officer walked 100 meters ONCE! Stamped 1,000 passports with 99.9% less energy!)
```

Notice what Strategy 2 achieved:
* **$99.9\%$ Reduction in Walking Distance**: The officer walked down the long hallway **ONCE** instead of 1,000 times!
* **Ultra-Low Energy Access**: Reaching into the desk drawer took 2 centimeters of movement ($0.1\text{ pJ}$ local register energy) instead of walking 200 meters ($200\text{ pJ}$ DRAM energy)!
* **Maximum Passenger Throughput**: Passengers moved through the line continuously without stopping!

This customs desk is the exact physical analogue of **Weight-Stationary Dataflow and Local Weight Registers**:
* The customs officer is a **Processing Element (PE) Cell**.
* The rubber stamp is a **Filter Weight Parameter ($W_{i,j}$)**.
* The 1,000 arriving passengers are **1,000 Input Activations ($X_0 \dots X_{999}$)**.
* The 100-meter hallway walk is a **High-Energy Off-Chip DRAM Read Access ($200\text{ pJ}$)**.
* The desk drawer is a **Local Weight Register ($C_{\text{weight}}$ / Flip-Flop Latch inside the PE)**.
* Reaching into the desk drawer in 2 cm is a **0.1-pJ Local Register Read**.
* Locking the stamp into the drawer before passengers arrive is **Weight Pre-Loading Staging**.

---

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

---

### The Three Operational Phases of Weight-Stationary Dataflow

A Weight-Stationary Systolic Accelerator operates across three distinct chronological execution phases:

#### Phase 1: Weight Pre-Loading Phase (Staging Weights into PEs)
Before matrix computation begins, the memory controller streams the filter weight matrix $W$ into the 2D PE grid.
* Weight $W_{i,j}$ is loaded into the **Local Weight Register** of $\text{PE}(i,j)$.
* Once loaded, the weight write-enable control line is disabled ($\text{WE}_{\text{weight}} \Leftarrow 0$).
* **The Weight is Locked!** It will not move or change for the duration of the current input activation batch.

#### Phase 2: Activation Streaming and Computation Phase
With all weights $W_{i,j}$ locked inside their respective PEs:
* **Horizontal Stream (West to East)**: Input activation $X_{i,k}$ enters the West edge of Row $i$ and streams horizontally through $\text{PE}(i,0) \to \text{PE}(i,1) \to \text{PE}(i,2) \dots$
* **Vertical Stream (North to South)**: Partial sum $Y_{j,k}$ enters the North edge of Column $j$ (initialized to $0.0$) and streams vertically down through $\text{PE}(0,j) \to \text{PE}(1,j) \to \text{PE}(2,j) \dots$
* **Local MAC Computation**: Inside $\text{PE}(i,j)$, the local MAC engine reads the stationary weight $W_{i,j}$ from its local register, multiplies it by the passing input activation $X_{i,k}$, adds the product to the incoming partial sum $Y_{\text{in}}$, and passes the updated partial sum $Y_{\text{out}}$ to the South neighbor!

$$\mathbf{Y_{\text{out}} = Y_{\text{in}} + (W_{i,j} \cdot X_{\text{in}})}$$

#### Phase 3: Result Collection Phase
The completed output activations $Y_{j,k}$ emerge from the South edge of the PE grid and are written out to Scratchpad Memory or global DRAM.

---

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

---

### Hardware Components inside a Weight-Stationary PE:

1. **The Local Weight Register ($W_{i,j}$)**:
   * A 16-bit or 32-bit register connected directly to the input of the multiplier circuit via short $10\text{-micrometer}$ wires.
   * **Energy Cost**: Reading $W_{i,j}$ from this local register consumes **less than $0.1\text{ picojoules}$** of energy per cycle—over $50\times$ less energy than reading from on-chip SRAM, and $2,000\times$ less energy than reading from off-chip DRAM!

2. **The Multiply-Accumulate (MAC) Circuit**:
   * A 16-bit floating-point or integer multiplier paired with a 32-bit accumulator adder.
   * Computes $Y_{\text{out}} = Y_{\text{in}} + (W_{i,j} \cdot X_{\text{in}})$ in **1 single clock cycle**.

3. **Activation Register ($X_{\text{out}}$)**:
   * Latches $X_{\text{in}}$ on `posedge clk` and passes it to the East neighbor $\text{PE}(i, j+1)$ on the next clock cycle.

4. **Partial Sum Register ($Y_{\text{out}}$)**:
   * Latches $Y_{\text{out}}$ on `posedge clk` and passes it to the South neighbor $\text{PE}(i+1, j)$ on the next clock cycle.

---

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

---

### Total Energy Calculation 1: Non-Stationary Dataflow (Re-Fetching Weights)

In a non-stationary architecture, every time a new input activation $X_k$ is processed, all $N^2$ weights are re-read from on-chip SRAM memory:

$$\text{Weight Reads}_{\text{non\_stationary}} = N^2 \times M \text{ reads from SRAM}$$

$$\text{Activation Reads}_{\text{non\_stationary}} = N \times M \text{ reads from SRAM}$$

$$\text{Total Energy}_{\text{non\_stationary}} = (N^2 \cdot M \cdot E_{\text{SRAM}}) + (N \cdot M \cdot E_{\text{SRAM}}) + (N^2 \cdot M \cdot E_{\text{MAC}})$$

$$\mathbf{\text{Total Energy}_{\text{non\_stationary}} = (N^2 \cdot M) \cdot (E_{\text{SRAM}} + E_{\text{MAC}}) + (N \cdot M \cdot E_{\text{SRAM}})}$$

---

### Total Energy Calculation 2: Weight-Stationary Dataflow

In a Weight-Stationary architecture, the $N^2$ weights are read from SRAM **ONCE** during pre-loading. For all $M$ subsequent input samples, weights are read locally from the **Local Weight Register ($E_{\text{reg}}$)**:

$$\text{Weight Reads from SRAM}_{\text{stationary}} = N^2 \text{ reads (Pre-load Phase ONCE!)}$$

$$\text{Weight Reads from Local Reg}_{\text{stationary}} = N^2 \times (M - 1) \text{ reads from Local Register}$$

$$\text{Total Energy}_{\text{stationary}} = (N^2 \cdot E_{\text{SRAM}}) + (N^2 \cdot (M - 1) \cdot E_{\text{reg}}) + (N \cdot M \cdot E_{\text{SRAM}}) + (N^2 \cdot M \cdot E_{\text{MAC}})$$

$$\mathbf{\text{Total Energy}_{\text{stationary}} = N^2 \cdot E_{\text{SRAM}} + N^2 M \cdot E_{\text{reg}} + N M \cdot E_{\text{SRAM}} + N^2 M \cdot E_{\text{MAC}}}$$

---

### Evaluating Energy Savings for a Real-World Workload

Let us evaluate both energy equations for a real-world neural network layer:
* Matrix size $N = 256$ ($N^2 = 65,536\text{ weights}$).
* Batch size $M = 1,000$ input activation samples ($1,000\text{ images}$).
* Total MACs $= 256^2 \times 1,000 = \mathbf{65,536,000 \text{ MACs}}$.

#### 1. Non-Stationary Energy Calculation:
$$\text{Total Energy}_{\text{non\_stationary}} = 65,536,000 \cdot (5.0\text{ pJ} + 0.2\text{ pJ}) + (256 \times 1000 \cdot 5.0\text{ pJ})$$

$$\text{Total Energy}_{\text{non\_stationary}} = 65,536,000 \cdot 5.2\text{ pJ} + 1,280,000\text{ pJ} = 340,787,200 + 1,280,000 = \mathbf{342,067,200 \text{ pJ}} = \mathbf{342.07 \text{ Millijoules}}$$

#### 2. Weight-Stationary Energy Calculation:
$$\text{Total Energy}_{\text{stationary}} = (65,536 \cdot 5.0) + (65,536 \times 999 \cdot 0.1) + (256,000 \cdot 5.0) + (65,536,000 \cdot 0.2)$$

$$\text{Total Energy}_{\text{stationary}} = 327,680 + 6,547,046 + 1,280,000 + 13,107,200 = \mathbf{21,261,926 \text{ pJ}} = \mathbf{21.26 \text{ Millijoules}}$$

```text
ENERGY CONSUMPTION COMPARISON (65.5 MILLION MACs)

 Dataflow Architecture    │ Weight Read Source │ Total Energy (mJ) │ Energy Savings %
──────────────────────────┼────────────────────┼───────────────────┼──────────────────
 Non-Stationary Dataflow  │ On-Chip SRAM       │ 342.07 mJ         │ 0.0% (Baseline)
 Weight-Stationary        │ Local PE Register  │  21.26 mJ         │ 93.8% ENERGY SAVED!
                          │ (Pre-loaded Once!) │ (320.8 mJ Saved!) │ (16.1x MORE EFFICIENT!)
```

Look at the extraordinary result:
Weight-Stationary Dataflow reduced total processing energy from $342.07\text{ Millijoules}$ down to **$21.26\text{ Millijoules}$**—an **$85.8\%$ energy reduction ($16.1\times$ energy efficiency improvement)** for the exact same neural network calculation!

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Weight-Stationary Dataflow Energy, PE Latch Mechanics, and Throughput Analysis

To consolidate your complete mastery of Weight-Stationary Dataflow architectures, local weight registers, activation streaming, and energy savings calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Weight Memory Read Energy (System A vs System B)

Total weight matrix size = 256 weights ($2\text{ bytes each} = 512\text{ bytes}$).
Total input activation samples = $2,000\text{ samples}$.

##### 1. System A Weight Read Energy (Non-Stationary):
Weights are read from On-Chip SRAM ($E_{\text{SRAM}} = 4.00\text{ pJ}$) on every sample ($2,000\text{ times}$):

$$\text{Weight Reads}_A = 256 \text{ weights} \times 2,000 \text{ samples} = 512,000 \text{ reads}$$

$$\text{Energy}_{\text{weight\_A}} = 512,000 \text{ reads} \times 4.00 \text{ pJ/read} = \mathbf{2,048,000 \text{ pJ}} = \mathbf{2.048 \text{ Millijoules }} (2,048\text{ }\mu\text{J})$$

##### 2. System B Weight Read Energy (Weight-Stationary):
* Pre-load Phase: 256 weights read from SRAM **ONCE**:
  $$\text{Energy}_{\text{preload}} = 256 \times 4.00 \text{ pJ} = 1,024 \text{ pJ}$$
* Execution Phase: 256 weights read from Local PE Registers ($E_{\text{reg}} = 0.08\text{ pJ}$) for 1,999 remaining samples:
  $$\text{Energy}_{\text{local\_reg}} = 256 \times 1,999 \times 0.08 \text{ pJ} = 40,939.52 \text{ pJ}$$

$$\text{Energy}_{\text{weight\_B}} = 1,024 + 40,939.52 = \mathbf{41,963.52 \text{ pJ}} = \mathbf{0.04196 \text{ Millijoules }} (41.96\text{ }\mu\text{J})$$

##### Weight Memory Energy Reduction:

$$\text{Weight Energy Reduction} = \left( 1 - \frac{41.96\text{ }\mu\text{J}}{2,048.0\text{ }\mu\text{J}} \right) \times 100\% = \mathbf{97.95\% \text{ Energy Reduction!}}$$

Locking weights inside PE registers reduced weight memory energy by **$97.95\%$**!

---

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

---

#### Step 3: Calculate Overall Energy Savings and Efficiency Factor

$$\text{Total Energy Reduction} = \left( 1 - \frac{0.29796\text{ mJ}}{2.30400\text{ mJ}} \right) \times 100\% = \mathbf{87.07\% \text{ Total Energy Saved!}}$$

$$\text{Energy Efficiency Factor} = \frac{\text{Total Energy}_A}{\text{Total Energy}_B} = \frac{2.30400\text{ mJ}}{0.29796\text{ mJ}} \approx \mathbf{7.732\times \text{ Energy Efficiency Gain!}}$$

```text
SYSTEM ENERGY OPTIMIZATION SUMMARY

 System Architecture     │ Weight Memory Energy │ Total Processing Energy │ Energy Efficiency
─────────────────────────┼──────────────────────┼─────────────────────────┼───────────────────
 System A (Non-Stationary)│ 2,048.0 uJ           │ 2,304.0 uJ (2.30 mJ)    │ 1.00x (Baseline)
 System B (Weight-Station)│    41.96 uJ          │   298.0 uJ (0.30 mJ)    │ 7.73x MORE EFFICIENT!
                         │ (98.0% Weight Cut!)  │ (87.1% Total Cut!)      │ (+673% Energy Gain)
```

---

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

---

### Sanity Check and Verification

Let us verify our mathematical and physical energy results against hardware design principles:

1. **Pre-loading Overhead Amortization Check**:
   * Pre-loading took 16 cycles out of 2,046 total cycles ($0.78\%$ time overhead).
   * Pre-loading consumed $1.024\text{ }\mu\text{J}$ out of $298.0\text{ }\mu\text{J}$ ($0.34\%$ energy overhead).
   * Pre-loading cost is completely negligible ($< 1\%$), proving $100\%$ amortization across 2,000 samples!
2. **Local Register Energy Advantage**:
   * Reading weights from local PE registers ($0.08\text{ pJ}$) vs SRAM ($4.00\text{ pJ}$) saved $3.92\text{ pJ}$ per read.
   * $512,000 \text{ reads} \times 3.92\text{ pJ} = 2,007,040\text{ pJ} = 2.007\text{ mJ}$ saved. Matches total weight energy savings ($2.048 - 0.042 = 2.006\text{ mJ}$).
3. **PE Array Utilization Efficiency**:
   * Array executed 2,000 sample vectors in 2,046 clock cycles.
   * Array pipeline utilization $= \frac{2,000}{2,046} \times 100\% = \mathbf{97.75\% \text{ PE Efficiency}}$!

All local weight register latch mechanics, energy reduction calculations, pre-loading staging overheads, and GFLOPS throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Weight-Stationary Dataflow**: An accelerator dataflow architecture where trained filter weights ($W_{i,j}$) are loaded from memory into local Processing Element (PE) registers once and kept stationary for thousands of cycles, while input activations ($X$) and partial sums ($Y$) stream through the grid to eliminate $98\%+$ of weight memory read energy.
* **Local Weight Register**: A small SRAM flip-flop register embedded directly inside each PE cell that holds a weight parameter stationary, connecting directly to the PE's multiplier input to enable ultra-low-energy ($<0.1\text{ pJ}$) local weight reads.
