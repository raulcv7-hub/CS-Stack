content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/03-systolic-array-accelerators/01-systolic-array-dataflow-processing/04-input-stationary-dataflow-mechanics.md
# Input-Stationary Dataflow Architecture and Activation Buffer Register Mechanics

## The Input Activation Re-Streaming Memory Bottleneck and Multi-Filter Convolution Energy Drain

In modern artificial intelligence acceleration, computer vision processing, and deep learning inference, hardware accelerators execute multi-channel convolutional neural network (CNN) layers and transformer multi-head attention blocks. In these workloads, a single input dataset—such as a $1080\text{p}$ high-definition camera video frame, a 3D medical MRI scan volume, or an audio spectrogram—is represented in digital memory as a dense multi-dimensional array called an **Input Activation Tensor ($X$)**.

To extract meaningful semantic features from this input image (such as detecting edges, textures, shapes, or object boundaries), the neural network applies **dozens or hundreds of different convolutional filter channels ($W^{(0)}, W^{(1)}, \dots, W^{(C-1)}$)** to the exact same input activation frame $X$.

Evaluating feature channel $c$ ($0 \le c < C$) requires computing a 3D tensor dot product between input activation frame $X$ and filter weight tensor $W^{(c)}$:

$$Y_{j,k}^{(c)} = \sum_{i=0}^{N-1} W_{i,j}^{(c)} \cdot X_{i,k}$$

Where:
* $Y_{j,k}^{(c)}$ is the output activation element at row $j$, column $k$ for output feature channel $c$.
* $W_{i,j}^{(c)}$ is the trained weight parameter at input channel $i$, output position $j$ for filter channel $c$.
* $X_{i,k}$ is the input activation element at input channel $i$, spatial position $k$ in the input image.
* $N$ is the number of input channels (e.g., $N = 256$).
* $C$ is the total number of output feature filters (e.g., $C = 128$ distinct filter kernels).

Notice the mathematical structure of this multi-filter computation:
The exact same input activation tensor $X$ must be evaluated against $C = 128$ different filter weight tensors ($W^{(0)} \dots W^{(127)}$) in succession!

Now, consider the physical energy and memory bandwidth catastrophe that occurs if a parallel processor architecture executes this multi-filter convolution using a non-stationary memory access policy:

```text
THE NAIVE INPUT ACTIVATION RE-STREAMING ENERGY DRAIN

 Off-Chip DRAM / On-Chip SRAM Buffer (Storage of Input Activation X)
 ┌─────────────────────────────────────────────────────────────┐
 │ Input Activation Image Frame X (10 Megabytes in Memory)     │
 └─────────────┬───────────────────────────────▲───────────────┘
               │                               │
   Read 1      │ (Evaluates Filter W^(0))      │ Read 128 (Evaluates Filter W^(127))
   Cost: 2.0 mJ│                               │ Cost: 2.0 mJ
               ▼                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Execution Processing Unit (Computes MAC: Y = W^(c) * X)     │
 └─────────────────────────────────────────────────────────────┘
  (Re-reading 10 MB image frame 128 times burns 256 mJ of memory energy!)
```

Let us quantify the energy waste of re-streaming input activations from memory:
1. **The Physical Memory Energy Hierarchy**: In $7\text{nm}$ CMOS silicon manufacturing, executing a 16-bit Multiply-Accumulate (MAC) math operation in digital logic consumes approximately **$0.1 \text{ to } 0.5\text{ picojoules (pJ)}$** of electrical energy.
2. In contrast, reading a 16-bit word from an on-chip SRAM Scratchpad Buffer consumes **$5\text{ pJ}$** ($10\times \text{to } 50\times$ more energy than the math operation!), and reading that same word from off-chip DRAM memory consumes **$200\text{ pJ}$** ($1,000\times$ more energy than the math operation!).

```text
SILICON ENERGY CONSUMPTION HIERARCHY PER 16-BIT WORD

 Memory / Compute Operation             │ Energy Consumed per 16-Bit Word
────────────────────────────────────────┼───────────────────────────────────
 16-Bit Multiply-Accumulate (MAC) Math  │ 0.2 pJ  (1x Base Math Cost)
 Local PE Activation Register Read      │ 0.1 pJ  (0.5x Math Cost - Ultra Low!)
 On-Chip SRAM Scratchpad Buffer Read    │ 5.0 pJ  (25x Math Cost!)
 Off-Chip DRAM Memory Read              │ 200.0 pJ (1,000x Math Cost!)
```

Look at the physical energy numbers:
If a 10-Megabyte input image frame $X$ ($5,242,880\text{ 16-bit pixels}$) is evaluated against $C = 128$ different filter channels:
* Under a non-stationary input dataflow, the processor re-reads the $10\text{-MB}$ image frame from memory **128 separate times**!
* Total data transferred across memory buses $= 128 \times 10\text{ MB} = \mathbf{1,280 \text{ Megabytes (1.28 GB)}}$!
* If the image is read from on-chip SRAM, this re-streaming burns **$33.55\text{ Joules}$ of memory read energy**. If read from off-chip DRAM, it burns **$1,342\text{ Joules}$**!

Over $98\%$ of the processor's thermal power budget and battery energy is burned moving the exact same, unchanging input image frame back and forth across memory wires!

In autonomous mobile robots, drone vision systems, and smartphone camera processors, re-fetching high-resolution input activation frames from memory causes rapid battery drain, severe thermal throttling, and dropped camera frame rates.

How do we design a hardware matrix accelerator that loads the input activation frame $X$ from memory **EXACTLY ONCE**, locks the activations inside the processing grid locally, and evaluates hundreds of filter weight channels ($W^{(0)} \dots W^{(C-1)}$) against them with zero activation re-streaming energy?

To eliminate activation re-streaming energy drain and achieve peak energy efficiency, computer architects use **Input-Stationary Dataflow Architectures** and **Activation Buffer Registers**.

---

## The Photo Lightboard and the 128 Filter Lenses: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of input-stationary dataflows, activation buffer registers, weight streaming, and energy reduction before inspecting transistor-level schematics, pre-loading protocols, and energy equations, let us consider an everyday analogy: **The Photo Inspection Laboratory**.

Imagine a lab technician (**A Processing Element / PE Cell**) working at a quality control station. The technician's job is to inspect a high-resolution film photograph (**An Input Activation $X_{i,k}$**) by applying 128 different colored optical filter lenses (**128 Filter Weights $W^{(0)} \dots W^{(127)}$**) over the photo to check for different defects, producing 128 inspection reports (**Output Activations $Y$**).

```text
THE PHOTO INSPECTION LABORATORY ANALOGY

 Lab Technician (Processing Element / PE Cell)
 ┌─────────────────────────────────────────────────────────────┐
 │ Workstation Lightboard                                      │
 │ Applying 1 Filter Lens takes 1 Second (0.2 pJ Energy)       │
 └─────────────────────────────────────────────────────────────┘
                               ▲
                               │ 100-Meter Walk to Central Vault
                               ▼
 Central Document Vault (Main System Memory DRAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Holds Heavy Film Photograph (Input Activation X)            │
 └─────────────────────────────────────────────────────────────┘
```

The heavy film photograph (**Input Activation $X$**) is stored inside a climate-controlled central vault (**Main System DRAM Memory**) located down a long 100-meter hallway. Walking to the central vault to retrieve the heavy photo takes **5 minutes of exhausting walking** ($200\text{ pJ}$ energy equivalent).

Let us observe two different operational strategies for how the technician inspects the photo against 128 filter lenses:

---

### Strategy 1: The Re-Fetching Method (Non-Stationary Input Flow)
The technician enforces an inefficient rule: *"I keep my lightboard completely empty. Every time I test a new filter lens, I walk down the hallway to the vault, get the photo, test the filter, and walk back to return the photo to the vault."*

Look at what happens when 128 filter lenses arrive:
1. **Filter 1**: The technician walks 100 meters to the vault, gets the photo, walks 100 meters back, applies Filter 1 in 1 second, and **walks 100 meters back to the vault to return the photo**!
2. **Filter 2**: The technician walks 100 meters to the vault again, gets the exact same photo, walks back, applies Filter 2, and returns the photo...
3. To test all 128 filters, the technician walks a total distance of **25,600 meters ($25.6\text{ kilometers}$)**!

```text
STRATEGY 1: RE-FETCHING PHOTO FOR EVERY FILTER

 Filter 1  : Walk 200m ──► Test Filter 1  ──► Walk 200m
 Filter 2  : Walk 200m ──► Test Filter 2  ──► Walk 200m
  :
 Filter 128: Walk 200m ──► Test Filter 128 ──► Walk 200m
 (Technician walks 25.6 kilometers to inspect ONE photo! Collapses from exhaustion!)
```

Look at the physical waste of Strategy 1:
The technician spent **$99.9\%$ of their energy walking down hallways** carrying the exact same photo back and forth, rather than actually inspecting filters! The technician collapses from physical exhaustion (**Thermal Throttling**).

---

### Strategy 2: The Stationary Lightboard Mount Method (Input-Stationary Dataflow)
Realizing the absurdity of walking down the hallway for every filter, the technician adopts **Input-Stationary Dataflow**:

Before the inspection begins:
1. The technician walks down the hallway to the central vault **EXACTLY ONCE**, retrieves the photo ($X$), walks back to their workstation, and **MOUNTS THE PHOTO DIRECTLY ONTO A LIGHTBOARD FRAME** (**Pre-Loading the Activation Buffer Register**).
2. As 128 different filter lenses ($W^{(0)} \dots W^{(127)}$) are passed across the desk one by one from left to right:
   * Filter 1 slides over the mounted photo ($X$). The technician inspects it in 1 second, records the result, and passes Filter 1 to the next desk!
   * Filter 2 slides over the mounted photo ($X$). The technician inspects it in 1 second, records the result, and passes Filter 2 to the next desk!
3. The technician evaluates all 128 filters smoothly.

```text
STRATEGY 2: STATIONARY LIGHTBOARD MOUNT METHOD (INPUT-STATIONARY)

 Morning: Walk 100m ONCE ──► Mount Photo on Lightboard Frame (Pre-Load)
 ─────────────────────────────────────────────────────────────
 Filter 1  : Slide Filter 1 over Photo (2 cm)   ──► Record Result!
 Filter 2  : Slide Filter 2 over Photo (2 cm)   ──► Record Result!
  :
 Filter 128: Slide Filter 128 over Photo (2 cm) ──► Record Result!
 (Technician walked 100 meters ONCE! Inspected 128 filters with 99.2% less energy!)
```

Notice what Strategy 2 achieved:
* **$99.2\%$ Reduction in Walking Distance**: The technician walked down the long hallway **ONCE** instead of 128 times!
* **Ultra-Low Energy Access**: Reading the photo mounted on the local lightboard took 2 centimeters of eye movement ($0.1\text{ pJ}$ local register energy) instead of walking 200 meters ($200\text{ pJ}$ DRAM energy)!
* **Maximum Inspection Throughput**: Filters were evaluated as fast as they could slide across the desk!

This photo inspection lab is the exact physical analogue of **Input-Stationary Dataflow and Activation Buffer Registers**:
* The lab technician is a **Processing Element (PE) Cell**.
* The film photograph is an **Input Activation ($X_{i,k}$)**.
* The 128 filter lenses are **128 Filter Weight Channels ($W^{(0)} \dots W^{(127)}$)**.
* The 100-meter hallway walk is a **High-Energy Off-Chip DRAM Read Access ($200\text{ pJ}$)**.
* The lightboard frame on the desk is an **Activation Buffer Register ($C_{\text{activation}}$ / Flip-Flop Latch inside the PE)**.
* Inspecting the mounted photo in 2 cm is a **0.1-pJ Local Register Read**.
* Mounting the photo onto the lightboard before filters arrive is **Activation Pre-Loading Staging**.

---

## Primitive 1: Input-Stationary Dataflow Architecture

Now that we possess a clear intuitive mental model of mounting the photo onto the workstation lightboard, let us examine the formal, rigorous engineering mechanics of **Input-Stationary Dataflow Architecture**.

In a 2D systolic array matrix accelerator, data items can be categorized into three operational streams:
1. **Input Activations ($X$)**: Feature map pixels or sequence embeddings.
2. **Weights ($W$)**: Trained model filter parameters.
3. **Partial Sums / Output Activations ($Y$)**: Intermediate or final accumulation results.

> **Input-Stationary Dataflow** is an accelerator dataflow architecture where input activations ($X_{i,k}$) are loaded from memory into local registers inside the Processing Elements (PEs) during a pre-loading phase and kept physically **STATIONARY** for hundreds or thousands of execution cycles, while filter weight matrices ($W$) stream horizontally across the array and partial sums ($Y$) stream vertically down the array.

```text
INPUT-STATIONARY DATAFLOW TOPOLOGY (4x4 PE GRID)

                   North Inputs: Partial Sums Y_in [Vertical Stream]
                       Y_in0    Y_in1    Y_in2    Y_in3
                         │        │        │        │
                         ▼        ▼        ▼        ▼
 West Inputs ──────► ┌───────┬────────┬────────┬────────┐
 Weights W_in        │PE(0,0)│ PE(0,1)│ PE(0,2)│ PE(0,3)│
 [Horizontal]        │[X0,0] │ [X0,1] │ [X0,2] │ [X0,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(1,0)│ PE(1,1)│ PE(1,2)│ PE(1,3)│
                     │[X1,0] │ [X1,1] │ [X1,2] │ [X1,3] │
                     ├───────┼────────┼────────┼────────┤
                     │PE(2,0)│ PE(2,1)│ PE(2,2)│ PE(2,3)│
                     │[X2,0] │ [X2,1] │ [X2,2] │ [X2,3] │
                     └───────┴────────┴────────┴────────┘
                         │        │        │        │
                         ▼        ▼        ▼        ▼
                   South Outputs: Updated Partial Sums Y_out
 (ALL ACTIVATIONS [Xi,k] ARE LOCKED STATIONARY INSIDE LOCAL PE REGISTERS!)
```

---

### The Three Operational Phases of Input-Stationary Dataflow

An Input-Stationary Systolic Accelerator operates across three distinct chronological execution phases:

#### Phase 1: Activation Pre-Loading Phase (Staging Activations into PEs)
Before matrix computation begins, the memory controller streams the input activation tile $X$ into the 2D PE grid.
* Activation $X_{i,k}$ is loaded into the **Activation Buffer Register** of $\text{PE}(i,k)$.
* Once loaded, the activation write-enable control line is disabled ($\text{WE}_{\text{activation}} \Leftarrow 0$).
* **The Activation is Locked!** It will not move or change while multiple filter weight matrices stream through the grid.

#### Phase 2: Weight Streaming and Computation Phase
With all input activations $X_{i,k}$ locked inside their respective PEs:
* **Horizontal Stream (West to East)**: Filter weights $W_{i,j}^{(c)}$ for channel $c$ enter the West edge of Row $i$ and stream horizontally through $\text{PE}(i,0) \to \text{PE}(i,1) \to \text{PE}(i,2) \dots$
* **Vertical Stream (North to South)**: Partial sum $Y_{j,k}^{(c)}$ enters the North edge of Column $j$ (initialized to $0.0$) and streams vertically down through $\text{PE}(0,j) \to \text{PE}(1,j) \to \text{PE}(2,j) \dots$
* **Local MAC Computation**: Inside $\text{PE}(i,k)$, the local MAC engine reads the stationary activation $X_{i,k}$ from its local register, multiplies it by the passing filter weight $W_{i,j}^{(c)}$, adds the product to the incoming partial sum $Y_{\text{in}}$, and passes the updated partial sum $Y_{\text{out}}$ to the South neighbor!

$$\mathbf{Y_{\text{out}} = Y_{\text{in}} + (X_{i,k} \cdot W_{i,j}^{(c)})}$$

#### Phase 3: Next Activation Tile Pre-loading Phase
Once all $C$ filter channels ($W^{(0)} \dots W^{(C-1)}$) have streamed through the grid, output activations $Y$ are complete. 

The memory controller loads the *next* input activation tile $X_{\text{next}}$ into the PEs, and the process repeats!

---

## Primitive 2: The Activation Buffer Register Architecture

Now let us examine the second core primitive: **The Activation Buffer Register**.

An **Activation Buffer Register** is a small, specialized 16-bit or 32-bit SRAM flip-flop register embedded directly inside the physical silicon layout of every Processing Element (PE) cell.

### Hardware Datapath Architecture of an Input-Stationary PE

Let us inspect the gate-level schematic of an Input-Stationary Processing Element $\text{PE}(i,k)$:

```text
INPUT-STATIONARY PROCESSING ELEMENT (PE_i,k) SCHEMATIC

                  North Input: Partial Sum Y_in [32 Bits]
                             │
                             ▼
                    ┌─────────────────┐
                    │ Y_in Register   │
                    └────────┬────────┘
                             │
  West Input W_in            │             East Output W_out
  [16 Bits]                  ▼             [16 Bits]
  ──────────►[ W_in Reg ]─►( X ) ──►[ W_out Reg ]──────────►
                             ▲
                             │ (Stationary Activation Read: 0.1 pJ!)
                    ┌────────┴────────┐
                    │ ACTIVATION      │ ◄── Pre-Loaded Activation X_i,k
                    │ BUFFER REGISTER │     (LOCKED STATIONARY!)
                    │ (X_ik)          │
                    └─────────────────┘
                             │
                             ▼ (Product X_ik * W_in)
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

### Hardware Components inside an Input-Stationary PE:

1. **The Activation Buffer Register ($X_{i,k}$)**:
   * A 16-bit or 32-bit register connected directly to the multiplier input port via short $10\text{-micrometer}$ wires.
   * **Energy Cost**: Reading $X_{i,k}$ from this local register consumes **less than $0.1\text{ picojoules}$** of energy per cycle—over $50\times$ less energy than reading from on-chip SRAM, and $2,000\times$ less energy than reading from off-chip DRAM!

2. **The Multiply-Accumulate (MAC) Circuit**:
   * A 16-bit floating-point or integer multiplier paired with a 32-bit accumulator adder.
   * Computes $Y_{\text{out}} = Y_{\text{in}} + (X_{i,k} \cdot W_{\text{in}})$ in **1 single clock cycle**.

3. **Weight Pipeline Register ($W_{\text{out}}$)**:
   * Latches $W_{\text{in}}$ on `posedge clk` and passes it to the East neighbor $\text{PE}(i, k+1)$ on the next clock cycle.

4. **Partial Sum Register ($Y_{\text{out}}$)**:
   * Latches $Y_{\text{out}}$ on `posedge clk` and passes it to the South neighbor $\text{PE}(i+1, k)$ on the next clock cycle.

---

## Energy Mathematical Framework: Comparing Input-Stationary vs. Non-Stationary Dataflows

To prove why Input-Stationary Dataflow provides massive energy savings for multi-filter convolutional layers, let us build a rigorous mathematical model of memory read energy consumption.

### Energy Model Equations

Let $N \times N$ be the dimensions of the input activation frame $X$ ($N^2$ activation elements).
Let $C$ be the number of filter weight channels ($W^{(0)}, W^{(1)}, \dots, W^{(C-1)}$) evaluated against $X$.
Total MAC operations required $= N^2 \cdot C\text{ MACs}$.

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

### Total Energy Calculation 1: Non-Stationary Dataflow (Re-Fetching Activations)

In a non-stationary architecture, every time a new filter channel $W^{(c)}$ is evaluated, all $N^2$ input activation elements are re-read from on-chip SRAM memory:

$$\text{Activation Reads}_{\text{non\_stationary}} = N^2 \times C \text{ reads from SRAM}$$

$$\text{Weight Reads}_{\text{non\_stationary}} = N^2 \times C \text{ reads from SRAM}$$

$$\text{Total Energy}_{\text{non\_stationary}} = (N^2 \cdot C \cdot E_{\text{SRAM}}) + (N^2 \cdot C \cdot E_{\text{SRAM}}) + (N^2 \cdot C \cdot E_{\text{MAC}})$$

$$\mathbf{\text{Total Energy}_{\text{non\_stationary}} = (N^2 \cdot C) \cdot (2 \cdot E_{\text{SRAM}} + E_{\text{MAC}})}$$

---

### Total Energy Calculation 2: Input-Stationary Dataflow

In an Input-Stationary architecture, the $N^2$ input activation elements are read from SRAM **ONCE** during pre-loading. For all $C$ subsequent filter channels, activations are read locally from the **Activation Buffer Register ($E_{\text{reg}}$)**:

$$\text{Activation Reads from SRAM}_{\text{stationary}} = N^2 \text{ reads (Pre-load Phase ONCE!)}$$

$$\text{Activation Reads from Local Reg}_{\text{stationary}} = N^2 \times (C - 1) \text{ reads from Local Register}$$

$$\text{Weight Reads from SRAM}_{\text{stationary}} = N^2 \times C \text{ reads from SRAM}$$

$$\text{Total Energy}_{\text{stationary}} = (N^2 \cdot E_{\text{SRAM}}) + (N^2 \cdot (C - 1) \cdot E_{\text{reg}}) + (N^2 \cdot C \cdot E_{\text{SRAM}}) + (N^2 \cdot C \cdot E_{\text{MAC}})$$

$$\mathbf{\text{Total Energy}_{\text{stationary}} = N^2 \cdot E_{\text{SRAM}} + N^2 C \cdot E_{\text{reg}} + N^2 C \cdot E_{\text{SRAM}} + N^2 C \cdot E_{\text{MAC}}}$$

---

### Evaluating Energy Savings for a Real-World Workload

Let us evaluate both energy equations for a real-world convolutional layer:
* Input activation size $N \times N = 256 \times 256$ ($N^2 = 65,536\text{ activation pixels}$).
* Number of filter channels $C = 128$ distinct convolutional filters.
* Total MACs $= 65,536 \times 128 = \mathbf{8,388,608 \text{ MACs}}$.

#### 1. Non-Stationary Energy Calculation:
$$\text{Total Energy}_{\text{non\_stationary}} = 8,388,608 \cdot (2 \cdot 5.0\text{ pJ} + 0.2\text{ pJ})$$

$$\text{Total Energy}_{\text{non\_stationary}} = 8,388,608 \cdot 10.2\text{ pJ} = \mathbf{85,563,801.6 \text{ pJ}} = \mathbf{85.56 \text{ Millijoules}}$$

#### 2. Input-Stationary Energy Calculation:
$$\text{Total Energy}_{\text{stationary}} = (65,536 \cdot 5.0) + (65,536 \times 127 \cdot 0.1) + (8,388,608 \cdot 5.0) + (8,388,608 \cdot 0.2)$$

$$\text{Total Energy}_{\text{stationary}} = 327,680 + 832,307 + 41,943,040 + 1,677,721 = \mathbf{44,780,748 \text{ pJ}} = \mathbf{44.78 \text{ Millijoules}}$$

```text
ENERGY CONSUMPTION COMPARISON (8.38 MILLION MACs)

 Dataflow Architecture    │ Activation Read Source │ Total Energy (mJ) │ Energy Savings %
──────────────────────────┼────────────────────────┼───────────────────┼──────────────────
 Non-Stationary Dataflow  │ On-Chip SRAM Buffer    │ 85.56 mJ          │ 0.0% (Baseline)
 Input-Stationary (IS)    │ Local PE Register      │ 44.78 mJ          │ 47.6% ENERGY SAVED!
                          │ (Pre-loaded Once!)     │ (40.78 mJ Saved!) │ (1.91x MORE EFFICIENT!)
```

Look at the result:
Input-Stationary Dataflow reduced total processing energy from $85.56\text{ Millijoules}$ down to **$44.78\text{ Millijoules}$**—a **$47.6\%$ energy reduction ($1.91\times$ energy efficiency improvement)** for the exact same multi-filter convolutional calculation!

---

## Dataflow Comparison Matrix: WS vs. OS vs. IS

To select the optimal dataflow for a specific AI hardware architecture, computer architects compare **Input-Stationary (IS)** against **Weight-Stationary (WS)** and **Output-Stationary (OS)** dataflows:

```text
THE THREE ACCELERATOR DATAFLOW TAXONOMIES

 Feature / Property       │ Input-Stationary (IS)   │ Weight-Stationary (WS)  │ Output-Stationary (OS)
──────────────────────────┼─────────────────────────┼─────────────────────────┼─────────────────────────
 Stationary Operand       │ Activations (X_ik)      │ Weights (W_ij)          │ Partial Sums (Y_ij)
 Streaming Operands       │ Weights (W) & Sums (Y)  │ Activations & Sums      │ Weights & Activations
 Primary Energy Saved     │ Activation Read Energy  │ Weight Read Energy      │ Partial Sum Write Energy
 Best Workload Match      │ Single Input Frame,     │ Large Batch Inferences, │ Deep Accumulation,
                          │ 100s of Filter Channels │ Fixed Filter Weights    │ Large Matrix Products
```

### When Does Input-Stationary WIN?
1. **Single-Frame High-Resolution Vision ($M = 1, C \gg 1$)**: When an autonomous vehicle or drone processes a single camera video frame against 128 or 256 filter channels, locking the input image inside PEs eliminates redundant image re-reading.
2. **Real-Time Sensor Streams**: When input samples arrive continuously in real time and must be processed immediately without waiting to build a large batch.

---

## Solved Industrial Engineering Exercise: Quantitative Input-Stationary Dataflow Energy, Activation Register Latch Mechanics, and Throughput Analysis

To consolidate your complete mastery of Input-Stationary Dataflow architectures, activation buffer registers, filter weight streaming, and energy savings calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect designing a $1.6\text{ GHz}$ Mobile Vision AI Accelerator chip ($T_{\text{clk}} = 0.625\text{ ns} = 625\text{ ps}$).

The accelerator features a physical **$16 \times 16$ Input-Stationary Processing Element Grid** ($N = 16$, 256 total PEs: $\text{PE}_{0,0} \dots \text{PE}_{15,15}$).

```text
1.6 GHz MOBILE VISION ACCELERATOR WITH 16x16 INPUT-STATIONARY PE GRID

 Clock Frequency           : 1.6 GHz (T_clk = 625 ps)
 PE Array Dimensions       : 16 x 16 Processing Elements (256 Total PEs)
 Data Format               : 16-Bit Half-Precision Floats (2 Bytes / Element)
 Single PE MAC Energy      : E_MAC = 0.20 pJ
 Local PE Reg Read         : E_reg = 0.10 pJ
 On-Chip SRAM Read         : E_SRAM = 5.00 pJ
 Off-Chip DRAM Read        : E_DRAM = 200.00 pJ
```

#### The Vision Neural Network Workload:
The accelerator processes a $16 \times 16$ input activation image tile ($X$, $256\text{ elements}$) against **$C = 512\text{ different filter channels}$** ($W^{(0)} \dots W^{(511)}$, each $16 \times 16$).

Total MAC operations $= 16 \times 16 \times 512 = \mathbf{131,072 \text{ MAC Operations}}$ ($262,144\text{ FLOPs}$).

#### System Implementations to Compare:

* **System A (Non-Stationary Architecture — Re-Fetching Activations)**:
  * Input activation tile $X$ is re-read from On-Chip SRAM for every filter channel ($512\text{ times}$).
* **System B (Input-Stationary Architecture — Activation Buffer Register Lock)**:
  * Input activation tile $X$ is pre-loaded from On-Chip SRAM into PE Activation Buffer Registers **ONCE**.
  * For all 512 filter channels, activations are read locally from PE registers ($E_{\text{reg}} = 0.10\text{ pJ}$).

#### Your Objective

1. Calculate the total energy consumed (in Microjoules, $\mu\text{J}$) by activation memory reads for **System A (Non-Stationary)** vs **System B (Input-Stationary)** across the 512-filter workload.
2. Calculate the total overall energy consumed (including activation reads, weight reads, and MAC math execution) for System A vs System B.
3. Calculate the **Percentage Energy Reduction** and **Energy Efficiency Factor** achieved by System B over System A.
4. Calculate total execution time (in microseconds) for the $16 \times 16$ Input-Stationary PE grid to process all 512 filter channels (including 16-cycle pre-load phase and $3N-2$ wavefront streaming).
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Activation Memory Read Energy (System A vs System B)

Total activation tile size = 256 activation elements ($2\text{ bytes each} = 512\text{ bytes}$).
Total filter channels $C = 512\text{ channels}$.

##### 1. System A Activation Read Energy (Non-Stationary):
Activations are read from On-Chip SRAM ($E_{\text{SRAM}} = 5.00\text{ pJ}$) for every filter channel ($512\text{ times}$):

$$\text{Activation Reads}_A = 256 \text{ elements} \times 512 \text{ channels} = 131,072 \text{ reads}$$

$$\text{Energy}_{\text{activation\_A}} = 131,072 \text{ reads} \times 5.00 \text{ pJ/read} = \mathbf{655,360 \text{ pJ}} = \mathbf{0.65536 \text{ Millijoules }} (655.36\text{ }\mu\text{J})$$

##### 2. System B Activation Read Energy (Input-Stationary):
* Pre-load Phase: 256 activation elements read from SRAM **ONCE**:
  $$\text{Energy}_{\text{preload}} = 256 \times 5.00 \text{ pJ} = 1,280 \text{ pJ}$$
* Execution Phase: 256 activation elements read from Local PE Registers ($E_{\text{reg}} = 0.10\text{ pJ}$) for 511 remaining channels:
  $$\text{Energy}_{\text{local\_reg}} = 256 \times 511 \times 0.10 \text{ pJ} = 13,081.6 \text{ pJ}$$

$$\text{Energy}_{\text{activation\_B}} = 1,280 + 13,081.6 = \mathbf{14,361.6 \text{ pJ}} = \mathbf{0.01436 \text{ Millijoules }} (14.36\text{ }\mu\text{J})$$

##### Activation Memory Energy Reduction:

$$\text{Activation Energy Reduction} = \left( 1 - \frac{14.36\text{ }\mu\text{J}}{655.36\text{ }\mu\text{J}} \right) \times 100\% = \mathbf{97.81\% \text{ Energy Reduction!}}$$

Locking activations inside PE registers reduced activation memory energy by **$97.81\%$**!

---

#### Step 2: Calculate Total System Processing Energy (System A vs System B)

Total MAC operations $= 131,072\text{ MACs}$.
Weight reads ($W$): 256 weight elements per channel $\times 512\text{ channels} = 131,072\text{ weight reads}$ from SRAM ($E_{\text{SRAM}} = 5.00\text{ pJ}$).

$$\text{Energy}_{\text{weights}} = 131,072 \text{ reads} \times 5.00 \text{ pJ/read} = 655,360 \text{ pJ} = \mathbf{0.65536 \text{ mJ}}$$

$$\text{Energy}_{\text{MAC\_math}} = 131,072 \text{ MACs} \times 0.20 \text{ pJ/MAC} = 26,214.4 \text{ pJ} = \mathbf{0.02621 \text{ mJ}}$$

##### 1. Total System A Energy:
$$\text{Total Energy}_A = \text{Energy}_{\text{activation\_A}} + \text{Energy}_{\text{weights}} + \text{Energy}_{\text{MAC\_math}}$$

$$\text{Total Energy}_A = 0.65536\text{ mJ} + 0.65536\text{ mJ} + 0.02621\text{ mJ} = \mathbf{1.33693 \text{ Millijoules }} (1,336.9\text{ }\mu\text{J})$$

##### 2. Total System B Energy:
$$\text{Total Energy}_B = \text{Energy}_{\text{activation\_B}} + \text{Energy}_{\text{weights}} + \text{Energy}_{\text{MAC\_math}}$$

$$\text{Total Energy}_B = 0.01436\text{ mJ} + 0.65536\text{ mJ} + 0.02621\text{ mJ} = \mathbf{0.69593 \text{ Millijoules }} (695.9\text{ }\mu\text{J})$$

---

#### Step 3: Calculate Overall Energy Savings and Efficiency Factor

$$\text{Total Energy Reduction} = \left( 1 - \frac{0.69593\text{ mJ}}{1.33693\text{ mJ}} \right) \times 100\% = \mathbf{47.95\% \text{ Total Energy Saved!}}$$

$$\text{Energy Efficiency Factor} = \frac{\text{Total Energy}_A}{\text{Total Energy}_B} = \frac{1.33693\text{ mJ}}{0.69593\text{ mJ}} \approx \mathbf{1.921\times \text{ Energy Efficiency Gain!}}$$

```text
SYSTEM ENERGY OPTIMIZATION SUMMARY

 System Architecture       │ Activation Memory Energy │ Total Processing Energy │ Energy Efficiency
───────────────────────────┼──────────────────────────┼─────────────────────────┼───────────────────
 System A (Non-Stationary) │ 655.36 uJ                │ 1,336.93 uJ (1.34 mJ)   │ 1.00x (Baseline)
 System B (Input-Stationary)│  14.36 uJ                │   695.93 uJ (0.70 mJ)   │ 1.92x MORE EFFICIENT!
                           │ (97.8% Activation Cut!)  │ (48.0% Total Cut!)      │ (+92.1% Energy Gain)
```

---

#### Step 4: Calculate Execution Time for System B

Execution timeline for a $16 \times 16$ Input-Stationary array evaluating $C = 512$ filter channels:

1. **Activation Pre-loading Phase**: Staging 16 rows of activations into the grid $= 16\text{ clock cycles}$.
2. **Pipelined Wavefront Streaming Phase**:
   * Skewed setup delay for 16 rows $= 16 - 1 = 15\text{ clock cycles}$.
   * Streaming 512 filter channels $= 512\text{ clock cycles}$.
   * Array drain cycles $= 16 - 1 = 15\text{ clock cycles}$.

$$\text{Total Execution Cycles} = 16 \text{ (Pre-load)} + 15 \text{ (Setup)} + 512 \text{ (Streaming)} + 15 \text{ (Drain)} = \mathbf{558 \text{ Clock Cycles}}$$

##### Calculate Total Execution Time ($T_{\text{exec}}$) at $1.6\text{ GHz}$ ($T_{\text{clk}} = 0.625\text{ ns}$):

$$T_{\text{exec}} = 558 \text{ cycles} \times 0.625 \times 10^{-9}\text{ s/cycle} = \mathbf{0.34875 \text{ microseconds}} \quad (348.75\text{ ns})$$

##### Compute Operational Throughput (GFLOPS):
Total FLOPs $= 262,144\text{ FLOPs}$.

$$\text{Throughput} = \frac{262,144 \text{ FLOPs}}{0.34875 \times 10^{-6}\text{ s}} \approx \mathbf{751.67 \times 10^9 \text{ FLOPs/sec}} = \mathbf{751.67 \text{ GFLOPS}}$$

The Input-Stationary AI accelerator evaluated 512 filter channels against the image tile in **$348.75\text{ nanoseconds}$** while operating at **$751.67\text{ GFLOPS}$** of sustained compute throughput!

---

### Sanity Check and Verification

Let us verify our mathematical and physical energy results against hardware design principles:

1. **Pre-loading Overhead Amortization Check**:
   * Pre-loading took 16 cycles out of 558 total cycles ($2.87\%$ time overhead).
   * Pre-loading consumed $1.28\text{ }\mu\text{J}$ out of $695.9\text{ }\mu\text{J}$ ($0.18\%$ energy overhead).
   * Pre-loading cost is completely negligible ($< 0.2\%$), proving $100\%$ amortization across 512 filter channels!
2. **Local Register Energy Advantage**:
   * Reading activations from local PE registers ($0.10\text{ pJ}$) vs SRAM ($5.00\text{ pJ}$) saved $4.90\text{ pJ}$ per read.
   * $131,072 \text{ reads} \times 4.90\text{ pJ} = 642,252.8\text{ pJ} = 0.642\text{ mJ}$ saved. Matches total activation energy savings ($0.655 - 0.014 = 0.641\text{ mJ}$).
3. **PE Array Utilization Efficiency**:
   * Array executed 512 filter channels in 558 clock cycles.
   * Array pipeline utilization $= \frac{512}{558} \times 100\% = \mathbf{91.76\% \text{ PE Efficiency}}$!

All local activation buffer register latch mechanics, energy reduction calculations, pre-loading staging overheads, and GFLOPS throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Input-Stationary Dataflow**: An accelerator dataflow architecture where input activation feature maps ($X_{i,k}$) are loaded from memory into local Processing Element (PE) registers once and kept stationary for hundreds of cycles, while filter weights ($W$) and partial sums ($Y$) stream through the grid to eliminate $97\%+$ of activation memory read energy.
* **Activation Buffer Register**: A small SRAM flip-flop register embedded directly inside each PE cell that holds an activation element stationary, connecting directly to the PE's multiplier input to enable ultra-low-energy ($<0.1\text{ pJ}$) local activation reads.
