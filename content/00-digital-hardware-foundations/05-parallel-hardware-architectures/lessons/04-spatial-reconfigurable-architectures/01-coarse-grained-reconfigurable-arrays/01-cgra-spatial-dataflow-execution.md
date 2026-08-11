content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/04-spatial-reconfigurable-architectures/01-coarse-grained-reconfigurable-arrays/01-cgra-spatial-dataflow-execution.md
# Coarse-Grained Reconfigurable Array Architecture and Spatial Dataflow Execution Mechanics

## The Instruction Overhead Energy Wall and von Neumann Control Dissipation

In traditional computer architecture, central processing units (CPUs), digital signal processors (DSPs), and graphics processing units (GPUs) operate under the **von Neumann execution model**. Under this model, instructions and data reside in memory. To execute a program, a processor core must continuously execute a multi-step instruction control cycle for every single operation:
1. **Instruction Fetch**: Read a 32-bit or 64-bit instruction word from an instruction cache or memory.
2. **Instruction Decode**: Parse the instruction opcode, identify source and destination register fields, and generate control signals.
3. **Operand Fetch**: Read input values from a multi-ported register file.
4. **Execution**: Pass the operands through an Arithmetic Logic Unit (ALU).
5. **Write-Back**: Write the result back to a register file and increment the Program Counter (PC).

Now, consider a high-throughput signal processing or multimedia algorithm—such as an Infinite Impulse Response (IIR) filter, a 2D image convolution, or a matrix kernel—that processes millions of incoming data samples in a continuous loop:

```c
// CONTINUOUS STREAMING KERNEL (REPETITIVE ALGORITHM)
for (int i = 0; i < 1000000; i++) {
    Y[i] = (A[i] * C1) + (B[i] * C2) + C3; // Same 5 operations executed 1,000,000 times!
}
```

When a traditional von Neumann processor executes this loop 1,000,000 times, it executes the **exact same 5 instructions 1,000,000 times in series**.

Let us analyze the physical energy consumption of executing this repetitive loop under the von Neumann model in $7\text{nm}$ CMOS silicon manufacturing:

```text
VON NEUMANN INSTRUCTION OVERHEAD VS ARITHMETIC WORK

 Energy Consumed per Operation
 ┌─────────────────────────────────────────────────────────────┐
 │ Instruction Fetch from Cache     : 4.0 pJ                   │
 │ Instruction Decode & Control     : 2.5 pJ                   │
 │ Register File Read & Write Ports : 3.0 pJ                   │
 ├─────────────────────────────────────────────────────────────┤
 │ ACTUAL 16-BIT ALU ARITHMETIC MATH : 0.2 pJ  (ONLY 2%!)      │
 └─────────────────────────────────────────────────────────────┘
  (Over 97% of total chip energy is wasted on instruction overhead!)
```

Look at the physical energy breakdown per mathematical operation:
* Performing a 16-bit addition or multiplication inside the physical ALU consumes approximately **$0.2\text{ picojoules (pJ)}$** of electrical energy.
* Fetching the instruction word from the L1 instruction cache consumes **$4.0\text{ pJ}$**.
* Decoding the instruction and driving control signals consumes **$2.5\text{ pJ}$**.
* Reading and writing the physical register file consumes **$3.0\text{ pJ}$**.

To execute $0.2\text{ pJ}$ of actual arithmetic math, the von Neumann processor burns **$9.5\text{ pJ}$ of control overhead**!

Over **$97\%$ of the processor's energy and power budget is wasted** reading, decoding, and routing instructions—for an algorithm whose instruction sequence never changes!

Why can we not simply build a custom, dedicated hardware circuit for that specific algorithm?

If we fabricate an Application-Specific Integrated Circuit (ASIC) with fixed copper wires connecting ALUs directly together, we eliminate $100\%$ of instruction fetch energy. However, an ASIC is completely rigid: once manufactured in silicon, its hardware functionality is permanently locked. If the algorithm changes, the multi-million-dollar ASIC chip becomes useless junk.

Conversely, what if we use a **Field-Programmable Gate Array (FPGA)**?
An FPGA provides reconfigurable hardware logic using 1-bit Look-Up Tables (LUTs) and bit-level routing switches. But configuring 32-bit arithmetic operations at the 1-bit LUT level requires enormous routing interconnect overhead, huge configuration bitstream sizes, long compilation times (hours), and low clock operating frequencies ($200\text{ MHz}$ vs $2.0\text{ GHz}$).

We are trapped in an architectural dilemma:
1. **von Neumann CPUs/GPUs**: Flexible, but burn $>97\%$ of their energy on instruction fetch and decode overheads.
2. **ASICs**: $100\%$ energy-efficient, but completely non-reconfigurable and non-programmable.
3. **Fine-Grained FPGAs**: Reconfigurable at the 1-bit level, but suffer from heavy wire routing overheads, low clock frequencies, and high configuration area.

To bridge the gap between CPU flexibility, ASIC efficiency, and FPGA re-configurability, computer architects implement **Coarse-Grained Reconfigurable Arrays (CGRAs)** and **Spatial Dataflow Execution**.

---

## The Plumber Pipe Network vs. The Recipe Reading Chef: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Coarse-Grained Reconfigurable Arrays, spatial dataflow routing, and instruction-fetch elimination before inspecting word-level processing element matrices, routing crossbars, and modulo loop scheduling equations, let us consider an everyday analogy: **The Automated Juice Factory**.

Imagine a factory producing fruit juice blends (**Output Data $Y$**) by mixing ingredients (**Input Data $A, B$**) according to a specific recipe: *Multiply Fruit A by 3, Add Fruit B, and Filter the mixture*.

```text
THE JUICE FACTORY ANALOGY

 Strategy 1: The Recipe-Reading Chef (von Neumann CPU Model)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1 Chef reads 1 recipe line from a book (Instruction Fetch)   │
 │ Chef pours 1 cup, steps back, reads next line (Decode)      │
 │ Chef carries cup to blender, steps back, reads next line... │
 └─────────────────────────────────────────────────────────────┘
  (Chef spends 95% of their day reading books and walking around!)

 Strategy 2: The Reconfigurable Pipe Network (CGRA Spatial Dataflow)
 ┌──────────┐      ┌──────────┐      ┌──────────┐
 │Tank A (In)├─────►│ 3x Valve ├─────►│ Add Pipe ├─────► Output Y
 └──────────┘      └──────────┘      └────▲─────┘
                                          │
                                     ┌────┴─────┐
                                     │Tank B(In)│
                                     └──────────┘
  (Pipes connected ONCE! Juice flows continuously at 1,000 gallons/hour!)
```

Let us observe two different operational designs for how the factory processes 1,000,000 gallons of fruit juice:

---

### Strategy 1: The Recipe-Reading Chef (von Neumann CPU Model)
The factory hires one chef (**The CPU Core**) who works with a single mixing bowl (**The Register File**) and a recipe book (**Instruction Memory**).

For every single cup of juice:
1. The chef opens the recipe book, reads Line 1: *"Measure 1 cup of Fruit A"* (**Instruction Fetch & Decode**). The chef measures Fruit A.
2. The chef reads Line 2: *"Multiply Fruit A by 3"*. The chef multiplies.
3. The chef reads Line 3: *"Add 1 cup of Fruit B"*. The chef measures and adds Fruit B.
4. The chef reads Line 4: *"Filter mixture"*. The chef filters.

Look at the physical waste of Strategy 1:
* To process 1,000,000 cups of juice, the chef **opens and reads the exact same recipe book 4,000,000 times in a row**!
* The chef spends $95\%$ of their workday walking back and forth reading books rather than actually pouring juice!

---

### Strategy 2: The Reconfigurable Pipe Network (CGRA Spatial Dataflow)
Instead of hiring a chef to read books repeatedly, the factory manager installs a grid of **Reconfigurable Valves and Pipes** (**A Coarse-Grained Reconfigurable Array / CGRA**).

The grid consists of 16 multi-function processing stations (**Processing Elements / PEs**: Multipliers, Adders, Filters) linked by adjustable pipe switches (**Word-Level Interconnect Routing**).

Before starting production:
1. **Configuration Phase (Setup)**: The manager sets Valve 0 to "Multiply by 3", sets Valve 1 to "Adder", and adjusts the pipe switches to connect Tank A $\to$ Valve 0 $\to$ Valve 1 $\leftarrow$ Tank B.
2. **Instruction-Free Production Phase (Spatial Execution)**:
   * The manager opens the main water supply valve **ONCE**.
   * Fruit juice flows continuously through the physical pipe network!
   * Tank A flows into Valve 0 (multiplied by 3), flows directly into Valve 1 (added to Tank B), and flows straight into the output bottles at **1,000 gallons per hour**!

```text
SPATIAL PIPE FLOW IN ACTION

 Configured Pipe Network:
 Tank A ──► [ Valve 0: x3 ] ──► [ Valve 1: + ] ──► Output Bottles Y
                                       ▲
 Tank B ───────────────────────────────┘
 (ZERO recipe books read during production! 100% fluid flow efficiency!)
```

Notice what Strategy 2 achieved:
* **Zero Recipe Book Reading (Zero Instruction Fetch/Decode)**: During the entire 1,000,000-gallon production run, **not a single recipe book was opened**!
* **Continuous Spatial Streaming**: Data flowed through physical spatial paths like fluid through a pipe network, processing 1 sample per clock cycle at $100\%$ efficiency!
* **Re-configurability**: If tomorrow's recipe changes to *Fruit A + Fruit B * 2*, the manager does NOT rebuild the factory; they simply adjust the valve knobs and pipe switches (**CGRA Re-configuration**)!

This reconfigurable pipe network is the exact physical analogue of a **Coarse-Grained Reconfigurable Array (CGRA)**:
* Fruit juice ingredients are **Word-Level Data Streams ($16/32\text{-Bit}$ Integers or Floats)**.
* The chef reading recipe books is **von Neumann Instruction Fetching & Decoding**.
* The 16 multi-function valves are **Word-Level Processing Elements (PEs)**.
* The adjustable pipe switches are **Word-Level Reconfigurable Interconnects**.
* Configuring the valves once before opening the water supply is **Spatial Dataflow Graph (DFG) Mapping**.

---

## Primitive 1: Coarse-Grained Reconfigurable Array (CGRA) Architecture

Now that we possess a clear intuitive mental model of the reconfigurable pipe network, let us examine the formal, rigorous engineering mechanics of a **Coarse-Grained Reconfigurable Array (CGRA)**.

A CGRA is a spatial computing accelerator that sits on the silicon die alongside a host CPU core.

> **A Coarse-Grained Reconfigurable Array (CGRA)** is a spatial hardware architecture composed of a 2D mesh array of word-level (typically 16-bit or 32-bit) Processing Elements (PEs) interconnected by a programmable word-level routing network, designed to execute compute-intensive software loops by mapping loop Dataflow Graphs (DFGs) directly onto physical hardware space.

```text
CGRA SPATIAL HARDWARE MESH ARCHITECTURE

 Host CPU Core ──► Loads Configuration Contexts / Manages Memory DMA
                         │
                         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ COARSE-GRAINED RECONFIGURABLE ARRAY (CGRA 4x4 PE MESH)      │
 │                                                             │
 │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐│
 │   │ PE (0,0) ├────┤ PE (0,1) ├────┤ PE (0,2) ├────┤ PE (0,3) ││
 │   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘│
 │        │               │               │               │      │
 │   ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐│
 │   │ PE (1,0) ├────┤ PE (1,1) ├────┤ PE (1,2) ├────┤ PE (1,3) ││
 │   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘│
 │        │               │               │               │      │
 │   ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐│
 │   │ PE (2,0) ├────┤ PE (2,1) ├────┤ PE (2,2) ├────┤ PE (2,3) ││
 │   └──────────┘    └──────────┘    └──────────┘    └──────────┘│
 └──────────────────────────────┬──────────────────────────────┘
                                │ Streamed Data I/O
                                ▼
                   Scratchpad Data Memory (SRAM)
```

---

### Fine-Grained (FPGA) vs. Coarse-Grained (CGRA) Granularity

To understand why CGRAs achieve higher clock speeds and smaller die areas than FPGAs, we must examine the concept of **Hardware Granularity**:

```text
FINE-GRAINED (FPGA) VS COARSE-GRAINED (CGRA) GRANULARITY

 Fine-Grained FPGA Architecture (1-Bit Granularity)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1-Bit Look-Up Table (LUT) ──► 1-Bit Switch ──► 1-Bit Wire   │
 └─────────────────────────────────────────────────────────────┘
  (Requires 32 separate LUTs & 32 routing networks for a 32-bit addition!)

 Coarse-Grained CGRA Architecture (32-Bit Word Granularity)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32-Bit ALU (Add/Mul/Shift) ──► 32-Bit Bus Crossbar Routing   │
 └─────────────────────────────────────────────────────────────┘
  (1 single 32-bit PE executes 32-bit addition in 1 cycle!)
```

1. **Fine-Grained FPGAs (1-Bit Granularity)**:
   Operate on individual 1-bit boolean signals. To execute a 32-bit addition, an FPGA must configure thirty-two separate 1-bit Look-Up Tables (LUTs) and route 32 individual carry and data wires across the chip.
   * **Result**: Enormous routing wire overhead ($O(N^2)$ bit-wires), massive configuration memory size (Megabytes), and low clock speeds ($200\text{ MHz}$).
2. **Coarse-Grained CGRAs (16/32-Bit Word Granularity)**:
   Operate on complete **16-bit or 32-bit data words**. The fundamental building block is not a 1-bit LUT, but a full 32-bit Processing Element containing a multi-function 32-bit ALU, shifter, and local register file.
   * **Result**: Bus routing operates on 32-bit word buses rather than single bits. Routing wire overhead drops by $90\%$, configuration context size shrinks from Megabytes to **Kilobytes**, and clock speeds reach **$1.0 \text{ to } 2.0\text{ GHz}$**!

---

### Hardware Anatomy of a CGRA Processing Element (PE)

Each individual Processing Element (PE) inside a CGRA grid is a compact, word-level execution cell containing four functional components:

```text
HARDWARE ANATOMY OF A CGRA PROCESSING ELEMENT (PE_i,j)

 Interconnect Inputs (North, South, East, West 32-Bit Buses)
 ┌──────┬──────┬──────┬──────┐
 │North │South │ East │ West │
 └─┬────┴─┬────┴──┬───┴─┬────┘
   │      │       │     │
   ▼      ▼       ▼     ▼
 ┌───────────────────────────┐
 │ Input MUXes (Context Reg) │◄── Configured by Context RAM
 └─────────────┬─────────────┘
               │ Operand A & B (32 Bits)
               ▼
 ┌───────────────────────────┐
 │ 32-Bit Multi-Function ALU │ (Add, Sub, Mul, Shift, Logic,
 └─────────────┬─────────────┘  Pass-Through)
               │
               ▼ Result
 ┌───────────────────────────┐
 │ Local Register File (1-4) │ (Holds local state / Constants)
 └─────────────┬─────────────┘
               │
               ▼ Output Bus to Neighbors (North, South, East, West)
```

1. **32-Bit Multi-Function ALU**: Executes standard arithmetic and logic operations (`ADD`, `SUB`, `MUL`, `SHL`, `SHR`, `AND`, `OR`, `XOR`, `PASS`).
2. **Input Selection Multiplexers**: Selects input operands $A$ and $B$ from neighboring PEs (North, South, East, West, or diagonal neighbors) or from the local register file.
3. **Local Register File (1 to 4 Words)**: Small internal registers used to store loop invariants, mathematical constants, or temporary values across clock cycles.
4. **Configuration Context Register**: A local memory latch holding the PE's current configuration instruction (which ALU operation to perform and which input MUX channels to select).

---

## Primitive 2: Spatial Dataflow Routing

Now let us examine the second core primitive: **Spatial Dataflow Routing**.

In a von Neumann CPU, code is executed as a temporal sequence of instructions over time. 

In a CGRA, a software loop is compiled into a **Dataflow Graph (DFG)** and mapped directly across physical hardware space.

> **Spatial Dataflow Routing** is the architectural process of mapping the nodes (operations) and edges (data dependencies) of a compiler Dataflow Graph (DFG) onto physical Processing Elements and reconfigurable interconnect buses inside a CGRA, allowing data tokens to flow through physical silicon paths without instruction fetch or decode cycles.

```text
MAPPING A COMPILER DATAFLOW GRAPH (DFG) TO PHYSICAL HARDWARE SPACE

 Software Equation: Y = (A + B) * (A - B)

 Compiler Dataflow Graph (DFG)          Mapped CGRA Physical Grid
     [ A ]       [ B ]                     ┌──────────┐    ┌──────────┐
      │   \     /   │                      │ PE(0,0)  ├───►│ PE(0,1)  │
      │    \   /    │                      │ (A + B)  │    │ (A - B)  │
      ▼     \ /     ▼                      └────┬─────┘    └────┬─────┘
   [ A+B ]   X   [ A-B ]                        │               │
      │     / \     │                           ▼               ▼
      │    /   \    │                      ┌──────────────────────────┐
      ▼   /     \   ▼                      │ PE(1,0) Multiply (x)     │
     [ Multiply (x) ]                      └────────────┬─────────────┘
            │                                           │
            ▼                                           ▼
       [ Output Y ]                             Physical Output Y
```

---

### The Modulo Loop Scheduling Algorithm (Modulo Mapping)

How does a CGRA compiler map a complex software loop containing 20 operations onto a 16-PE physical grid?

The compiler uses **Modulo Loop Scheduling** to map loop iterations across physical space and time:

1. **Initiation Interval ($II$)**: The number of clock cycles between starting consecutive iterations of the loop.
   * If $II = 1$, a new loop iteration enters the CGRA grid on **every single clock cycle**, achieving maximum theoretical throughput!
2. **Configuration Context Rotation**:
   If a DFG requires more operations than there are physical PEs, the CGRA uses **Dynamic Context Rotation**:
   * On Cycle 0, PE(0,0) acts as an Adder.
   * On Cycle 1, PE(0,0) switches its internal context register and acts as a Multiplier!
   * The local configuration Context Memory inside each PE cycles through a small ring buffer of $II$ instructions ($0 \dots II-1$), allowing a $4 \times 4$ PE grid to execute arbitrarily large loop structures!

```text
MODULO CONTEXT ROTATION IN A CGRA PE (II = 2)

 PE (0,0) Configuration Ring Buffer
 Cycle 0 (Context 0) ──► Execute ADD  (Operand A + Operand B)
 Cycle 1 (Context 1) ──► Execute MUL  (Operand C * Operand D)
 Cycle 2 (Context 0) ──► Execute ADD  (Loop Repeats!)
 (A 4x4 CGRA executes a 32-operation DFG with Initiation Interval II = 2!)
```

---

## Hardware Energy and Area Comparisons: CPU vs. GPU vs. FPGA vs. CGRA

To understand where CGRAs fit in the computing ecosystem, let us compare the physical characteristics of all four major processing architectures:

```text
HARDWARE PARADIGM COMPARISON MATRIX

 Architecture Paradigm │ Granularity  │ Instruction Overhead │ Energy Efficiency │ Re-configurability Time
───────────────────────┼──────────────┼──────────────────────┼───────────────────┼─────────────────────────
 von Neumann CPU       │ 64-Bit Scalar│ VERY HIGH (>95%)     │ Low (~0.1 TOPS/W) │ 1 Cycle (Program Code)
 SIMT GPU              │ 32-Bit Vector│ HIGH (~70%)          │ Moderate (~2 TOPS/W)│ 1 Cycle (Kernel Code)
 Fine-Grained FPGA     │ 1-Bit LUT    │ ZERO (0%)            │ High (~5 TOPS/W)  │ Seconds to Minutes
 Coarse-Grained CGRA   │ 32-Bit Word  │ ZERO (0% during loop)│ EXCELLENT (>15 TOPS/W)│ Nanoseconds (Contexts)
 Hardwired ASIC        │ Fixed Silicon│ ZERO (0%)            │ MAXIMUM (~30 TOPS/W)│ ZERO (Non-Reconfigurable!)
```

Look at the architectural position of the CGRA:
* **Energy Efficiency ($>15\text{ TOPS/Watt}$)**: By eliminating instruction fetching and decoding during loop execution, CGRAs achieve energy efficiency close to hardwired ASICs!
* **Re-configurability Speed (Nanoseconds)**: By using 32-bit word-level configuration contexts, CGRAs reconfigure their hardware layout in a few clock cycles ($1 \text{ to } 5\text{ ns}$), compared to minutes for an FPGA!

---

## Real-World Engineering Realities: Data Memory Bandwidth and Control-Flow Handling

In real-world semiconductor engineering, mapping software loops to CGRAs requires solving two critical system integration challenges: **Memory Streaming Bandwidth** and **Conditional Branch Handling**.

---

### 1. Decoupled Stream Buffers and Scratchpad DMA Engines

A CGRA grid containing 16 PEs operating at $1.5\text{ GHz}$ can consume and produce up to 32 32-bit data words on every single clock cycle!

If the CGRA is connected to off-chip DRAM memory using standard load/store requests, the memory bus will immediately freeze in a bandwidth stall.

To feed the spatial grid at full speed:
* CGRAs are paired with **Decoupled Stream Buffers** and on-chip **Scratchpad DMA Engines**.
* Before launching a loop on the CGRA, a dedicated Scratchpad DMA engine streams the input data array from main DRAM into local on-chip SRAM scratchpad buffers.
* The Stream Buffers push data into the West/North edges of the CGRA grid at **$1\text{ word per clock cycle}$**, matching the spatial dataflow rate of the PE mesh perfectly!

```text
DECOUPLED STREAM BUFFER INPUT PIPELINE

 Main System DRAM Memory
       │
       ▼ (High-Speed DMA Burst Load)
 On-Chip Scratchpad SRAM Buffer (128 KB)
       │
       ▼ (1 Word/Cycle Continuous Stream)
 CGRA West Input Stream Buffers ──► CGRA PE Grid (100% Compute Utilization!)
```

---

### 2. Predicated Execution for Conditional Branches

How does a spatial dataflow grid handle an `if-else` statement inside a loop if the hardware contains no central Program Counter to jump to branch targets?

CGRAs handle conditional branches using **Predicated Execution**:

```c
// CONDITIONAL LOOP STATEMENT
if (A[i] > 0) {
    Y[i] = A[i] * 5; // IF-Path
} else {
    Y[i] = A[i] + 2; // ELSE-Path
}
```

#### The Spatial Predication Mapping:
1. Both the `if`-path (`MUL`) and `else`-path (`ADD`) are assigned to **separate physical PEs in the grid simultaneously**!
2. PE(0,0) evaluates the condition `A[i] > 0` and generates a 1-bit boolean predicate flag $P$.
3. PE(1,0) computes $A[i] \times 5$. PE(1,1) computes $A[i] + 2$.
4. A downstream **Multiplexer PE (PE 2,0)** uses predicate flag $P$ to select the correct output word ($Y[i] = P \ ? \ \text{Result}_{\text{MUL}} : \text{Result}_{\text{ADD}}$).

```text
SPATIAL PREDICATION IN A CGRA GRID

                      [ PE(0,0): Condition (A[i] > 0) ]
                               │ Predicate Flag P (1 or 0)
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 [ PE(1,0): A[i] * 5 ]                 [ PE(1,1): A[i] + 2 ]
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
            [ PE(2,0): MUX (Selects based on P) ] ──► Output Y[i]
 (Both paths execute spatially in parallel; MUX selects valid result!)
```

Both execution paths run spatially in parallel, completely eliminating branch misprediction stalls!

---

## Solved Industrial Engineering Exercise: Quantitative CGRA Spatial DFG Mapping, Control Energy Reduction, and Throughput Analysis

To consolidate your complete mastery of Coarse-Grained Reconfigurable Arrays, spatial Dataflow Graph (DFG) mapping, instruction-fetch energy elimination, and initiation interval ($II$) scheduling, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect designing a $1.5\text{ GHz}$ CGRA accelerator ($T_{\text{clk}} = 0.6667\text{ ns} = 666.7\text{ ps}$).

The accelerator features a $4 \times 4$ physical Processing Element grid (**16 PEs**: $\text{PE}_{0,0} \dots \text{PE}_{3,3}$, 32-bit word width).

```text
1.5 GHz CGRA ACCELERATOR SPECIFICATIONS

 Clock Frequency       : 1.5 GHz (T_clk = 666.7 ps)
 CGRA Grid Dimensions  : 4 x 4 Processing Elements (16 Total PEs, 32-Bit)
 Single 32-Bit ALU Math: E_math = 0.25 pJ per operation
 Instruction Fetch/Dec : E_ctrl = 9.50 pJ per operation (CPU von Neumann)
```

#### The Workload Loop Kernel:
The processor executes an image sharpening kernel processing an array of **$1,000,000\text{ 32-bit pixel samples}$** ($N = 1,000,000$):

```c
// IMAGE SHARPENING KERNEL (5 OPERATIONS PER SAMPLE)
for (int i = 0; i < 1000000; i++) {
    t1 = A[i] * C1;          // Op 1: Multiplication
    t2 = B[i] * C2;          // Op 2: Multiplication
    t3 = t1 + t2;            // Op 3: Addition
    t4 = t3 - C3;            // Op 4: Subtraction
    Y[i] = t4 >> 2;          // Op 5: Right Shift
}
```

Total operations required = $1,000,000 \text{ iterations} \times 5 \text{ ops/iter} = \mathbf{5,000,000 \text{ Operations}}$.

#### System Implementations to Compare:

* **System A (von Neumann RISC CPU Core)**:
  * Executes the 5 operations sequentially in a loop ($5\text{ instructions per iteration}$).
  * Requires instruction fetch, decode, and register file read/write for every operation ($E_{\text{ctrl}} = 9.50\text{ pJ}$ control overhead per operation).
  * CPI = $1.0\text{ cycle/instruction} \implies 5\text{ clock cycles per loop iteration}$.
* **System B (CGRA Spatial Dataflow Accelerator)**:
  * Maps the 5-operation Dataflow Graph (DFG) spatially across 5 PEs on the $4 \times 4$ CGRA grid with Initiation Interval $II = 1$ cycle.
  * Instruction fetch and decode are **TURNED OFF COMPLETELY** during the 1,000,000-sample loop run ($E_{\text{ctrl}} = 0.0\text{ pJ}$)!
  * Each sample streams through the spatial pipeline in $1\text{ clock cycle}$ per iteration.

#### Your Objective

1. Calculate total energy consumed (in Millijoules, $\text{mJ}$) for control overhead vs actual math execution in **System A (von Neumann CPU)**.
2. Calculate total energy consumed (in Millijoules, $\text{mJ}$) in **System B (CGRA Spatial Accelerator)** across the 1,000,000-sample workload.
3. Calculate the **Percentage Energy Reduction** and **Energy Efficiency Gain** achieved by System B over System A.
4. Calculate total execution time (in milliseconds) and operational throughput (in GFLOPS/GOPS) for System A vs System B.
5. Calculate the overall **Performance Speedup Factor** of System B over System A.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Energy Consumption for System A (von Neumann CPU)

Total operations $= 5,000,000\text{ operations}$.

For each operation in System A:
* Control Overhead Energy $E_{\text{ctrl}} = 9.50\text{ pJ}$.
* Actual Math Energy $E_{\text{math}} = 0.25\text{ pJ}$.
* Total Energy per Operation $= 9.50 + 0.25 = \mathbf{9.75 \text{ pJ/op}}$.

##### 1. Total Control Overhead Energy (System A):
$$\text{Energy}_{\text{ctrl\_A}} = 5,000,000 \text{ ops} \times 9.50 \text{ pJ/op} = 47,500,000 \text{ pJ} = \mathbf{47.50 \text{ Millijoules}}$$

##### 2. Total Math Energy (System A):
$$\text{Energy}_{\text{math\_A}} = 5,000,000 \text{ ops} \times 0.25 \text{ pJ/op} = 1,250,000 \text{ pJ} = \mathbf{1.25 \text{ Millijoules}}$$

##### 3. Total System A Energy ($E_{\text{total\_A}}$):
$$E_{\text{total\_A}} = \text{Energy}_{\text{ctrl\_A}} + \text{Energy}_{\text{math\_A}} = 47.50\text{ mJ} + 1.25\text{ mJ} = \mathbf{48.75 \text{ Millijoules}}$$

$$\text{Percentage Energy Wasted on Control} = \frac{47.50\text{ mJ}}{48.75\text{ mJ}} \times 100\% = \mathbf{97.44\% \text{ Energy Wasted!}}$$

System A burned **$48.75\text{ mJ}$ of energy**, with $97.44\%$ of that energy wasted on instruction fetching and decoding!

---

#### Step 2: Calculate Energy Consumption for System B (CGRA Accelerator)

In System B, the 5-node Dataflow Graph is mapped to 5 PEs ($\text{PE}_{0,0}, \text{PE}_{0,1}, \text{PE}_{1,0}, \text{PE}_{1,1}, \text{PE}_{2,0}$).

* Instruction fetch and decode units are **turned OFF** ($E_{\text{ctrl}} = 0.0\text{ pJ}$).
* Local inter-PE interconnect routing energy $= 0.05\text{ pJ/op}$.
* Actual Math Energy $E_{\text{math}} = 0.25\text{ pJ/op}$.
* Total Energy per Operation $= 0.25 + 0.05 = \mathbf{0.30 \text{ pJ/op}}$.

##### Total System B Energy ($E_{\text{total\_B}}$):
$$E_{\text{total\_B}} = 5,000,000 \text{ ops} \times 0.30 \text{ pJ/op} = 1,500,000 \text{ pJ} = \mathbf{1.50 \text{ Millijoules}}$$

---

#### Step 3: Calculate Energy Reduction and Efficiency Gain

$$\text{Energy Reduction} = \left( 1 - \frac{E_{\text{total\_B}}}{E_{\text{total\_A}}} \right) \times 100\% = \left( 1 - \frac{1.50\text{ mJ}}{48.75\text{ mJ}} \right) \times 100\%$$

$$\text{Energy Reduction} = (1 - 0.03077) \times 100\% = \mathbf{96.92\% \text{ Total Energy Saved!}}$$

$$\text{Energy Efficiency Factor} = \frac{E_{\text{total\_A}}}{E_{\text{total\_B}}} = \frac{48.75\text{ mJ}}{1.50\text{ mJ}} \approx \mathbf{32.50\times \text{ Energy Efficiency Gain!}}$$

```text
ENERGY CONSUMPTION COMPARISON SUMMARY (5.0 MILLION OPERATIONS)

 Architecture Model      │ Control Overhead │ Math Energy │ Total Energy │ Energy Efficiency
─────────────────────────┼──────────────────┼─────────────┼──────────────┼───────────────────
 System A (von Neumann)  │ 47.50 mJ (97.4%) │ 1.25 mJ     │ 48.75 mJ     │ 1.00x (Baseline)
 System B (CGRA Spatial) │  0.00 mJ (0.0%)  │ 1.50 mJ     │  1.50 mJ     │ 32.50x FASTER!
                         │ (100% Control Cut)│ (Includes   │ (96.9% Cut!) │ (+3,150% Gain)
                         │                  │  Wire pJ)   │              │
```

---

#### Step 4: Calculate Execution Time and Throughput (System A vs System B)

##### 1. System A Execution Time ($T_{\text{exec\_A}}$):
5 instructions per iteration $\times 1,000,000\text{ iterations} = 5,000,000\text{ clock cycles}$.

$$T_{\text{exec\_A}} = 5,000,000 \text{ cycles} \times 0.6667 \times 10^{-9}\text{ s/cycle} = \mathbf{0.003333 \text{ seconds}} \quad (3.333\text{ ms})$$

$$\text{Throughput}_A = \frac{5,000,000 \text{ ops}}{0.003333 \text{ s}} = \mathbf{1.500 \times 10^9 \text{ GOPS}} = \mathbf{1.50 \text{ GOPS}}$$

##### 2. System B Execution Time ($T_{\text{exec\_B}}$):
With $II = 1$, the CGRA spatial pipeline accepts a new input sample on **every single clock cycle**!
* Pipeline latency to fill 3 spatial PE stages $= 3\text{ clock cycles}$.
* 1,000,000 samples complete in $1,000,000 + 3 = 1,000,003\text{ clock cycles}$.

$$T_{\text{exec\_B}} = 1,000,003 \text{ cycles} \times 0.6667 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0006667 \text{ seconds}} \quad (0.667\text{ ms})$$

$$\text{Throughput}_B = \frac{5,000,000 \text{ ops}}{0.0006667 \text{ s}} = \mathbf{7.500 \times 10^9 \text{ GOPS}} = \mathbf{7.50 \text{ GOPS}}$$

---

#### Step 5: Calculate Performance Speedup Factor

$$\text{Speedup} = \frac{T_{\text{exec\_A}}}{T_{\text{exec\_B}}} = \frac{3.333\text{ ms}}{0.667\text{ ms}} = \frac{5,000,000\text{ cycles}}{1,000,003\text{ cycles}} \approx \mathbf{5.000\times \text{ Performance Advantage!}}$$

```text
EXECUTION TIME AND THROUGHPUT SUMMARY

 System Model            │ Execution Cycles │ Total Time (ms) │ Throughput (GOPS) │ Speedup Factor
─────────────────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────
 System A (von Neumann)  │ 5,000,000 Cycles │ 3.333 ms        │ 1.50 GOPS         │ 1.00x (Base)
 System B (CGRA Spatial) │ 1,000,003 Cycles │ 0.667 ms        │ 7.50 GOPS         │ 5.00x FASTER!
                         │ (80% Cycles Cut) │ (2.666 ms Saved)│ (+6.00 GOPS!)     │ (+400% Gain)
```

##### Engineering Conclusion:
By mapping the software loop spatially onto a 5-PE CGRA dataflow network, System B **eliminated $100\%$ of instruction fetch and decode energy**, cutting total energy consumption by **$96.92\%$** ($48.75\text{ mJ} \to 1.50\text{ mJ}$) while delivering a **$5.00\times$ performance speedup** ($1.50\text{ GOPS} \to 7.50\text{ GOPS}$)!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and energy results against spatial computing principles:

1. **Instruction Fetch Energy Elimination Check**:
   * System A control energy $= 5,000,000 \times 9.50\text{ pJ} = 47.50\text{ mJ}$.
   * System B control energy $= 0.00\text{ mJ}$ (configured once during setup).
   * Control energy savings $= 100\%$, matching spatial hardware physics.
2. **Initiation Interval ($II = 1$) Pipeline Check**:
   * System B accepts 1 new input sample per cycle.
   * 1,000,000 samples processed in $1,000,003\text{ clock cycles}$.
   * Speedup $= 5,000,000 / 1,000,003 = 4.999985\approx 5.000\times$. Math is $100\%$ exact.
3. **Word-Level Granularity Advantage**:
   * Using 32-bit PEs instead of 1-bit LUTs allowed the CGRA to run at full $1.5\text{ GHz}$ clock speeds with lightweight, 32-bit crossbar routing switches.

All spatial Dataflow Graph (DFG) mappings, word-level PE configuration contexts, control energy elimination calculations, Initiation Interval ($II$) pipeline bounds, and GOPS throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Coarse-Grained Reconfigurable Array (CGRA)**: A spatial computing architecture composed of a 2D mesh of 16-bit or 32-bit Processing Elements (ALUs/registers) linked by word-level reconfigurable interconnects, bridging the gap between CPUs and FPGAs by eliminating instruction fetch and decode overheads during loop execution.
* **Spatial Dataflow Routing**: The architectural technique of compiling software loop Dataflow Graphs (DFGs) directly onto physical PE grid space and interconnect switches, allowing data tokens to stream continuously through silicon paths without fetching or decoding instructions on every clock cycle.
