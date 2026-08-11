content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/05-domain-specific-tensor-accelerators/01-mixed-precision-tensor-core-engines/02-hardware-structural-sparsity-acceleration.md
# Hardware Structural Sparsity Acceleration and Sparse Tensor Core Mechanics

## The Zero-Multiplication Energy Waste and Unstructured Sparsity Indirection Bottleneck

In deep neural network training and inference, artificial intelligence algorithms learn complex mathematical representations by training millions or billions of parameters called **Weights ($W$)**. During deep learning training, network optimization techniques—such as weight pruning and magnitude thresholding—reveal an extraordinary mathematical property of neural networks: **Sparsity**. Up to $50\%\text{ to } 90\%$ of the trained weight parameters inside a neural network can be set to exact numerical zero ($0.0$) without degrading model prediction accuracy!

When a pruned neural network with $50\%$ zero weights is evaluated on a conventional **Dense Processing Unit** (such as a standard dense CUDA core or a dense Tensor Core), the execution engine evaluates every single matrix multiplication operand regardless of whether it is zero or non-zero:

$$Y_{i,j} = \sum_{k=0}^{K-1} W_{i,k} \cdot X_{k,j}$$

Consider what occurs in physical silicon when a dense matrix accelerator executes a matrix multiplication containing $50\%$ zero weights:

```text
THE WASTED COMPUTATION CRISIS IN DENSE MATRIX ACCELERATORS

 Dense Matrix Multiplication with 50% Zero Weights (1,000,000 Operations)
 ┌─────────────────────────────────────────────────────────────┐
 │ 500,000 Operations: Non-Zero Weight * Activation (USEFUL)   │
 ├─────────────────────────────────────────────────────────────┤
 │ 500,000 Operations: ZERO Weight * Activation    (WASTED!)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         500,000 CLOCK CYCLES WASTED MULTIPLYING BY ZERO!
         (50% Memory Bandwidth & 50% Silicon Compute Power Wasted!)
```

Trace the physical energy and execution time wasted by a dense accelerator:
1. **Wasted Memory Read Bandwidth**: The memory controller reads 500,000 zero weights ($0.0$) from off-chip DRAM or High-Bandwidth Memory (HBM). Transferring billions of zeros across motherboard memory buses burns gigajoules of energy and consumes $50\%$ of the chip's off-chip memory bandwidth.
2. **Wasted Clock Cycles and Silicon Power**: Inside the dense multiplier gates, the arithmetic logic unit executes $0.0 \times X_{k,j} = 0.0$ for 500,000 operations. The hardware burns dynamic switching power ($P_{\text{dyn}} = C_{\text{eff}} \cdot V^2 \cdot f$) and spends 500,000 clock cycles computing a sum of zeros!

Why cannot we simply compress the sparse matrix in memory using traditional software sparse formats (such as Compressed Sparse Row / CSR or Coordinate / COO) to skip the zeros?

Attempting to accelerate **Unstructured Sparsity** (where zeros are scattered randomly across the matrix) using traditional sparse indexing formats introduces severe microarchitectural friction:

```text
UNSTRUCTURED SPARSITY INDIRECT POINTER INDEXING BOTTLENECK

 Unstructured Sparse Weight Vector : [ 0.5,  0.0,  0.0,  1.2,  0.0,  3.1,  0.0,  0.0 ]
 CSR Column Index Vector col_idx    : [  0 ,             3 ,        5            ]

 Target Address for Activation X    : Base_Addr + (col_idx[i] * 4 Bytes)
 (Indirect pointer lookups cause memory bank conflicts & irregular crossbars!)
```

Look at the physical hardware penalty of unstructured sparsity:
* **Indirect Pointer Lookups**: Fetching activation $X$ requires reading a column index array `col_idx[i]` first, computing address $A = A_{\text{base}} + \text{col\_idx}[i] \times 4$, and fetching $X$.
* **Memory Bank Conflicts and Irregular Crossbar Routing**: Because `col_idx[i]` contains arbitrary, non-linear integers, 32 parallel execution lanes attempt to read 32 scattered memory locations simultaneously, triggering severe L1 SRAM bank conflicts and crossbar interconnect stalls!
* **High Metadata Overhead**: Storing 32-bit column indices for every non-zero weight adds more memory overhead than the original zero weights, completely destroying any performance gain!

We are trapped in an architectural dilemma:
* Dense matrix accelerators spend $50\%$ of their clock cycles and memory bandwidth computing useless $0.0 \times X$ operations.
* Unstructured sparse architectures use indirect pointer indexing (`col_idx`), which causes memory bank conflicts, irregular crossbar stalls, and high metadata storage overheads that run slower than dense code.

How can a GPU or AI accelerator enforce a **structured, hardware-aligned sparsity pattern** that compresses sparse weight matrices by $50\%$ in memory, eliminates metadata overhead, and **doubles matrix multiplication throughput ($2\times \text{ TFLOPS}$)** using deterministic, conflict-free crossbar alignment?

To solve this zero-multiplication waste and unstructured indexing crisis, modern domain-specific architectures implement **2:4 Structural Sparsity** and **Sparse Tensor Cores**.

---

## The Grocery Cashier and the 2-Out-Of-4 Coupon Pass: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of 2:4 structural sparsity, 2-bit metadata indexing, sparse matrix compression, and compressed MAC pipelines before inspecting transistor-level multiplexers, PTX assembly opcodes, and TFLOPS performance scaling equations, let us consider an everyday analogy: **The Automated Grocery Checkout Scanner**.

Imagine a grocery store checkout line (**A Matrix Processing Pipeline**) processing items (**Input Activations $X$**) according to a list of discount coupons (**Filter Weights $W$**).

```text
THE GROCERY CHECKOUT LINE ANALOGY

 Grocery Cashier (Dense Accelerator)        2:4 Structured Coupon Scanner (Sparse Tensor Core)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Scans 4 Items + 4 Coupons │              │ Scans 2 Valid Coupons +   │
 │ 2 Coupons are EXPIRED ($0)│              │ 2-Bit Position Index      │
 └───────────────────────────┘              └───────────────────────────┘
  (Spends 50% of time scanning $0 coupons!)  (Skips $0 coupons! 2x Speedup!)
```

Each group of 4 items on the conveyor belt arrives with a sheet of 4 possible manufacturer coupons.

However, after checking the coupons, the store manager discovers that **in every group of 4 coupons, exactly 2 coupons are expired ($0.0\text{ value}$)** and only **2 coupons are valid non-zero discounts**.

Let us observe two different operational strategies for how the checkout cashier processes these coupons:

---

### Strategy 1: The Dense Cashier (Dense Tensor Execution)
The cashier operates strictly line-by-line without checking for expired coupons in advance:

1. Cashier scans Item 0, scans Coupon 0 (Valid: $\$5.00$ off). Computes $X_0 \times \$5.00$.
2. Cashier scans Item 1, scans Coupon 1 (**EXPIRED: $\$0.00$ off**). Computes $X_1 \times \$0.00 = \$0.00$.
3. Cashier scans Item 2, scans Coupon 2 (**EXPIRED: $\$0.00$ off**). Computes $X_2 \times \$0.00 = \$0.00$.
4. Cashier scans Item 3, scans Coupon 3 (Valid: $\$2.00$ off). Computes $X_3 \times \$2.00$.

Look at the physical waste of Strategy 1:
* The cashier spent **$50\%$ of their time scanning expired $\$0.00$ coupons** and multiplying items by zero!
* Processing 4 items took **4 scanning cycles**.

---

### Strategy 2: The 2:4 Structured Coupon Scanner (Sparse Tensor Core)
To double checkout speed, the store manager installs an automated **2:4 Structured Coupon Scanner**:

The manager enforces a strict **2:4 Structural Rule**:
> **The 2:4 Structural Rule**: In every contiguous group of 4 coupons, software must prune away the 2 smallest coupons, leaving **EXACTLY 2 valid non-zero coupons and 2 zeros**.

Before printing the coupon sheets, the store manager **discards the 2 expired $\$0.00$ coupons completely**!

Instead of printing 4 coupons on paper, the manager prints:
1. **The 2 Valid Coupons Only** (Compressed Payload: $\$5.00$ and $\$2.00$).
2. A tiny **2-Bit Location Tag** showing which original items the 2 valid coupons belonged to (`Tag: Item 0 and Item 3`).

```text
2:4 STRUCTURED COUPON COMPRESSION IN ACTION

 Original 4-Coupon Sheet : [ $5.00 (Valid) │ $0.00 (Expired) │ $0.00 (Expired) │ $2.00 (Valid) ]
                           ─────────────────────────────────────────────────────────────────
 Compressed Payload     : [ $5.00 │ $2.00 ]  +  Location Tag [ Item 0, Item 3 ]
                          (50% Paper Size Saved! 100% Zero Coupons Eliminated!)
```

Now, trace how Strategy 2 executes the checkout:
1. **$50\%$ Less Paper (Memory Bandwidth Savings)**: The delivery truck carries **half-size coupon envelopes** because expired $\$0.00$ coupons were never printed!
2. **Instant Item Alignment (Metadata Indexing)**:
   * The 2:4 Coupon Scanner reads the 2-bit location tag: `Item 0 and Item 3`.
   * The scanner's mechanical arm instantly picks up **Item 0 and Item 3**, completely bypassing Items 1 and 2!
3. **Compressed Double-Speed Math**:
   * Scanner multiplies Item 0 by $\$5.00$, and Item 3 by $\$2.00$ **simultaneously in 2 scanning cycles**!
4. **Result**: The 4-item customer order was processed in **2 scanning cycles instead of 4 cycles**!

```text
CHECKOUT TIMELINE COMPARISON

 Strategy 1 (Dense Cashier) : [ Scan 0 ] ──► [ Scan 1 ($0) ] ──► [ Scan 2 ($0) ] ──► [ Scan 3 ]
                              (4 Scanning Cycles required)

 Strategy 2 (2:4 Scanner)   : [ Scan Items 0 & 3 Simultaneously ] ──► [ Complete! ]
                              (2 Scanning Cycles required - 2x FASTER!)
```

Notice what Strategy 2 achieved:
* **$2\times$ Processing Speedup**: The checkout completed in **2 cycles instead of 4 cycles ($2\times \text{ TFLOPS}$)**!
* **$50\%$ Paper Savings**: Paper coupon storage and delivery truck bandwidth were cut in half.
* **Deterministic Alignment**: Because the rule enforced *exactly 2 valid coupons out of 4*, the scanner's mechanical arm used simple, fixed hardware multiplexers rather than searching through messy piles!

This 2:4 structured coupon scanner is the exact physical analogue of **2:4 Hardware Structural Sparsity and Sparse Tensor Cores**:
* The 4 items on the belt are **4 Input Activations ($X_0, X_1, X_2, X_3$)**.
* The 4 coupons are **4 Filter Weights ($W_0, W_1, W_2, W_3$)**.
* Expired $\$0.00$ coupons are **Pruned Zero Weights ($0.0$)**.
* Printing 2 valid coupons + location tag is **2:4 Weight Matrix Compression**.
* The 2-bit location tag is **2-Bit Sparsity Metadata ($I_{\text{meta}}$)**.
* Picking up Items 0 and 3 directly is **Metadata Multiplexer Selection**.
* Scanning in 2 cycles instead of 4 is **$2\times$ Sparse Tensor Core TFLOPS Acceleration**.

---

## Primitive 1: 2:4 Structural Sparsity

Now that we possess a clear intuitive mental model of the 2:4 structured coupon scanner, let us examine the formal, rigorous engineering mechanics of **2:4 Structural Sparsity**.

To accelerate matrix multiplication in hardware without incurring the complex pointer-chasing overheads of unstructured sparsity, computer architects and software engineers enforce a strict physical constraint on the weight matrix: **$N:M$ Structured Sparsity** (specifically $2:4$ structural sparsity).

> **2:4 Structural Sparsity** is a fine-grained, hardware-aligned matrix pruning constraint where every contiguous block of $M = 4$ weight elements in a matrix must contain **at least $N = 2$ zero values ($50\%$ structured zero sparsity)**, allowing the non-zero weight elements to be compressed by $2:1$ in memory and processed at $2\times$ throughput on specialized hardware tensor engines.

```text
2:4 STRUCTURAL SPARSITY MATRIX CONSTRAINT

 Dense Weight Vector W (16 Elements)
 ┌────────┬────────┬────────┬────────┬───┬────────┬────────┬────────┬────────┐
 │ W0=0.5 │ W1=0.0 │ W2=0.0 │ W3=1.2 │...│ W12=0.0│ W13=3.1│ W14=0.0│ W15=0.8│
 └────────┴────────┴────────┴────────┴───┴────────┴────────┴────────┴────────┘
  ◄─────── Block 0 (2 Zeros!) ──────►     ◄─────── Block 3 (2 Zeros!) ──────►

 Verification of 2:4 Structural Rule:
 * Block 0 [W0..W3]   : Non-zero = {W0, W3}, Zeros = {W1, W2} ──► 2 Zeros! (VALID)
 * Block 1 [W4..W7]   : Non-zero = {W4, W6}, Zeros = {W5, W7} ──► 2 Zeros! (VALID)
 * Block 2 [W8..W11]  : Non-zero = {W9, W11},Zeros = {W8, W10}──► 2 Zeros! (VALID)
 * Block 3 [W12..W15] : Non-zero = {W13,W15},Zeros = {W12,W14}──► 2 Zeros! (VALID)
```

---

### The 2:4 Weight Matrix Compression Engine

Because every contiguous group of 4 weights contains exactly 2 non-zero values and 2 zeros, the hardware compressor compresses the weight matrix $W$ before storing it in global DRAM or L2 cache:

#### 1. Non-Zero Weight Payload Extraction:
For each 4-element block ($W_0, W_1, W_2, W_3$), the 2 zero values are discarded. The 2 non-zero values ($W_{\text{nz0}}$ and $W_{\text{nz1}}$) are packed together into a contiguous compressed weight array:

$$\text{Compressed Weight Payload} = [\quad W_{\text{nz0}}, \quad W_{\text{nz1}} \quad]$$

Since each 16-bit weight is reduced from 4 elements ($8\text{ bytes}$) down to 2 elements ($4\text{ bytes}$), **the weight memory footprint is reduced by $50\%$ ($2:1$ compression ratio)**!

#### 2. 2-Bit Metadata Index Generation:
To remember where $W_{\text{nz0}}$ and $W_{\text{nz1}}$ originally resided within the 4-element block, the compressor generates a **2-Bit Metadata Index ($I_{\text{meta}}$)** for each non-zero element:

$$I_{\text{meta}} \in \{00_2, \, 01_2, \, 10_2, \, 11_2\} \implies \{ \text{Position } 0, \, 1, \, 2, \text{ or } 3 \}$$

```text
2:4 WEIGHT COMPRESSION AND METADATA GENERATION SCHEMATIC

 Un-Compressed 4-Weight Block: [ W0 = +1.5f,  W1 = 0.0f,  W2 = 0.0f,  W3 = -2.8f ]
                                ─────────────── Compress ───────────────
 Compressed 16-Bit Weight Payload : [ W_nz0 = +1.5f,  W_nz1 = -2.8f ]  (32 Bits Total)
 2-Bit Metadata Index Vector       : [ Index_0 = 00_2,  Index_1 = 11_2 ]  ( 4 Bits Total)
```

Look at the compact metadata size:
* To store the positions of two non-zero elements within a 4-element block, the hardware requires **two 2-bit indices—a total of only 4 bits of metadata per 4 weights**!
* Metadata storage overhead is less than **$6.25\%$** of the compressed weight payload size, completely eliminating the $100\%+$ metadata overheads of unstructured sparse formats!

---

## Primitive 2: Sparse Tensor Core Architecture and Compressed MAC Pipelines

Now let us examine the second core primitive: **Sparse Tensor Core Architecture and Compressed MAC Pipelines**.

A **Sparse Tensor Core** is a domain-specific hardware matrix engine built with integrated **Metadata Index Decoders** and **Compressed Multiply-Accumulate (MAC) Pipelines**.

```text
SPARSE TENSOR CORE HARDWARE ARCHITECTURE

 Compressed 2:4 Sparse Weights      Metadata Indices         Dense Activations
 [ W_nz0 | W_nz1 ] (16-Bit Floats)  [ Index_0 | Index_1 ]    [ X0 | X1 | X2 | X3 ]
            │                              │                           │
            │                              ▼                           │
            │                     ┌─────────────────┐                  │
            │                     │ Metadata MUX    ├──────────────────┘
            │                     │ Selection Unit  │ (Selects X_index0 & X_index1)
            │                     └────────┬────────┘
            │                              │
            ▼                              ▼ Selected Activations X_sel
 ┌─────────────────────────────────────────────────────────────┐
 │ COMPRESSED MAC MULTIPLIER ARRAY                             │
 │  - Multiplies W_nz0 * X_index0                              │
 │  - Multiplies W_nz1 * X_index1                              │
 │  - Accumulates both products into 32-Bit Accumulator C!     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
                   Output Activation D (2x TFLOPS Speedup!)
```

---

### The Three Hardware Pipeline Stages of a Sparse Tensor Core

To compute matrix products at $2\times$ throughput using compressed $2:4$ sparse weights, a Sparse Tensor Core executes a 3-stage hardware pipeline:

#### Stage 1: Metadata Decoding and Activation Selection
1. The Sparse Tensor Core reads 2 compressed non-zero weights ($W_{\text{nz0}}, W_{\text{nz1}}$) and their 4-bit metadata index (`Index_0`, `Index_1`).
2. Simultaneously, the core reads a dense 4-element activation vector ($X_0, X_1, X_2, X_3$).
3. **The Metadata Multiplexer Unit**: A bank of 4-to-1 data multiplexers inspects `Index_0` and `Index_1` and **extracts the 2 matching activation elements ($X_{\text{sel0}}$ and $X_{\text{sel1}}$)** out of the 4 dense activations:

$$X_{\text{sel0}} = X[\text{Index\_0}], \quad X_{\text{sel1}} = X[\text{Index\_1}]$$

```text
METADATA MULTIPLEXER ACTIVATION SELECTION

 Metadata Indices: Index_0 = 0 (00_2), Index_1 = 3 (11_2)
 Dense Activations: [ X0 = 4.0f │ X1 = 1.0f │ X2 = 9.0f │ X3 = 7.0f ]
                    └─────┬─────┴───────────────────────┴─────┬─────┘
                          │                                   │
                          ▼                                   ▼
 Selected Activations: X_sel0 = X0 (4.0f)            X_sel1 = X3 (7.0f)
 (Un-selected activations X1 and X2 are bypassed in 1 clock cycle!)
```

---

#### Stage 2: Compressed Multiply-Accumulate (MAC) Execution
The two non-zero weights ($W_{\text{nz0}}, W_{\text{nz1}}$) and the two selected activations ($X_{\text{sel0}}, X_{\text{sel1}}$) are fed directly into a **Compressed 2-Element MAC Array**:

$$\mathbf{\text{Partial\_Product} = (W_{\text{nz0}} \cdot X_{\text{sel0}}) + (W_{\text{nz1}} \cdot X_{\text{sel1}})}$$

Look at the hardware efficiency:
* A conventional dense Tensor Core requires **4 physical multipliers** to compute $W_0 X_0 + W_1 X_1 + W_2 X_2 + W_3 X_3$.
* A Sparse Tensor Core computes the exact same mathematical sum using **ONLY 2 PHYSICAL MULTIPLIERS**!
* By eliminating 2 out of 4 multipliers, the Sparse Tensor Core cuts multiplier silicon area in half, allowing twice as many matrix operations to fit on the same silicon die!

---

#### Stage 3: High-Precision Accumulation
The partial product is added directly to a 32-bit high-precision accumulator register $C_{\text{FP32}}$:

$$\mathbf{D_{\text{FP32}} = C_{\text{FP32}} + (W_{\text{nz0}} \cdot X_{\text{sel0}}) + (W_{\text{nz1}} \cdot X_{\text{sel1}})}$$

The operation completes in $1 \text{ to } 2\text{ clock cycles}$, delivering mathematically exact results with $0.0\times$ wasted zero-multiplication cycles!

---

## The $2:4$ Sparse Training and Pruning Workflow

How does a software developer or AI engineer convert a dense neural network model into a $2:4$ structurally sparse model that can run on Sparse Tensor Cores?

The transformation follows a three-step **Sparse Fine-Tuning Workflow**:

```text
2:4 SPARSE NEURAL NETWORK TRAINING WORKLOAD FLOW

 1. Dense Network Training
    Train standard FP32 / BF16 dense neural network to full convergence.
            │
            ▼
 2. 2:4 Structural Pruning
    Inspect weights in contiguous 4-element blocks.
    Prune (zero out) the 2 smallest-magnitude weights in every block!
            │
            ▼
 3. Sparse Retraining / Fine-Tuning
    Retrain non-zero weights for 1..2 epochs with 2:4 zero masks locked.
    Network recovers 100% of original dense prediction accuracy!
```

1. **Step 1: Dense Model Training**: Train a standard, dense neural network model using normal floating-point operations until the model converges.
2. **Step 2: 2:4 Magnitude Pruning**:
   * For every weight tensor in the model, divide the weights into contiguous 4-element vectors ($W_0, W_1, W_2, W_3$).
   * Evaluate the absolute magnitudes of the 4 weights ($|W_0|, |W_1|, |W_2|, |W_3|$).
   * **Force the 2 smallest-magnitude weights to exact numerical zero ($0.0$)**!
3. **Step 3: Sparse Fine-Tuning**:
   * Retrain the model for a few additional epochs while keeping the $2:4$ zero mask locked in place.
   * The remaining non-zero weights adjust their values to compensate for the pruned weights.
   * **Result**: The $2:4$ structurally sparse model recovers **$100\%$ of its original dense accuracy** (e.g., ImageNet classification accuracy or LLM perplexity score remains unchanged!), but now runs **$2\times$ faster on Sparse Tensor Cores**!

---

## Solved Industrial Engineering Exercise: Quantitative 2:4 Sparse Tensor Core Matrix Multiplication, Metadata Decoding, and Throughput Acceleration

To consolidate your complete mastery of 2:4 structural sparsity, 2-bit metadata indexing, compressed weight payloads, metadata multiplexer alignment, and Sparse Tensor Core TFLOPS speedup calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the Sparse Tensor Core execution subsystem of a $2.0\text{ GHz}$ enterprise AI accelerator chip ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The processor SM contains **4 Sparse Tensor Cores** operating on a $16 \times 8 \times 32$ sparse matrix tile macro-instruction:

$$\mathtt{mma.sp.sync.aligned.m16n8k32 \ \ d, \ \ a\_compressed, \ \ b, \ \ c, \ \ metadata}$$

$$\mathbf{D_{16 \times 8} = A_{\text{sparse\_16}\times 32} \times B_{32 \times 8} + C_{16 \times 8}}$$

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR SPARSE TENSOR CORE SPECIFICATIONS

 Clock Frequency         : 2.0 GHz (T_clk = 500 ps)
 Macro-Instruction       : mma.sp.sync (D_16x8 = A_16x32 * B_32x8 + C_16x8)
 Weight Matrix Sparsity  : 2:4 Structural Sparsity (50% Zeros)
 Weight Input Format (A) : Compressed FP16 (2 Non-Zeros per 4-Element Block)
 Activation Format (B)   : Dense FP16 (16-Bit Floats)
 Accumulator Format (C,D): Dense FP32 (32-Bit Floats)
 Execution Latency       : 2 Clock Cycles per mma.sp.sync instruction (1.00 ns)
```

#### Hardware Workload Parameters:
* **Un-Compressed Dense Matrix $A$**: $16 \times 32 = 512\text{ FP16 elements}$ ($1,024\text{ bytes}$).
* **Compressed 2:4 Sparse Matrix $A$ Payload**: $16 \times 16 = 256\text{ FP16 non-zero elements}$ ($512\text{ bytes}$).
* **Metadata Index Payload for Matrix $A$**: 2 bits per non-zero weight $= 256 \times 2\text{ bits} = 512\text{ bits} = \mathbf{64 \text{ Bytes}}$.
* **Dense Activation Matrix $B$**: $32 \times 8 = 256\text{ FP16 elements}$ ($512\text{ bytes}$).
* **Dense Accumulator Matrix $C$**: $16 \times 8 = 128\text{ FP32 elements}$ ($512\text{ bytes}$).

#### Un-Compressed Weight Block 0 (Row 0, Columns 0..3 of Matrix $A$):
$$W_{\text{block0}} = [\quad W_0 = +2.5\text{f}, \quad W_1 = 0.0\text{f}, \quad W_2 = 0.0\text{f}, \quad W_3 = -4.0\text{f} \quad]$$

#### Corresponding Dense Activation Vector (Col 0, Rows 0..3 of Matrix $B$):
$$X_{\text{col0}} = [\quad X_0 = +3.0\text{f}, \quad X_1 = +8.0\text{f}, \quad X_2 = +1.0\text{f}, \quad X_3 = +2.0\text{f} \quad]$$

#### Your Objective

1. Generate the **Compressed Weight Payload** and **2-Bit Metadata Indices** for $W_{\text{block0}}$.
2. Trace **Stage 1 (Metadata Decoding & Multiplexer Selection)**: Show which 2 activation elements are selected from $X_{\text{col0}}$ by the metadata multiplexers.
3. Trace **Stage 2 (Compressed MAC Execution)**: Compute the exact floating-point product sum computed by the Sparse Tensor Core for $W_{\text{block0}} \cdot X_{\text{col0}}$.
4. Calculate total floating-point operations (FLOPs) executed per instruction and compare memory read volume (in Bytes) between **Dense Tensor Execution** vs **2:4 Sparse Tensor Execution**.
5. Calculate the sustained compute throughput (in **TFLOPS**) of 4 Sparse Tensor Cores running `mma.sp.sync` at $2.0\text{ GHz}$.
6. Calculate the **Performance Speedup Factor** of Sparse Tensor Core execution over Dense Tensor Core execution.
7. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Compress $W_{\text{block0}}$ and Generate 2-Bit Metadata Indices

Un-compressed block: $W_{\text{block0}} = [+2.5\text{f}, \ 0.0\text{f}, \ 0.0\text{f}, \ -4.0\text{f}]$.

##### 1. Extract Non-Zero Payload:
* Non-zero element 0: $W_{\text{nz0}} = \mathbf{+2.5\text{f}}$ (Original Position $0$).
* Non-zero element 1: $W_{\text{nz1}} = \mathbf{-4.0\text{f}}$ (Original Position $3$).

$$\mathbf{\text{Compressed Weight Payload} = [\quad +2.5\text{f}, \quad -4.0\text{f} \quad] \quad (4 \text{ Bytes Total})}$$

##### 2. Generate 2-Bit Metadata Indices ($I_{\text{meta}}$):
* Position of $W_{\text{nz0}} (+2.5\text{f})$ is $0 \implies \text{Index\_0} = \mathbf{00_2} = 0_{10}$.
* Position of $W_{\text{nz1}} (-4.0\text{f})$ is $3 \implies \text{Index\_1} = \mathbf{11_2} = 3_{10}$.

$$\mathbf{\text{2-Bit Metadata Vector } I_{\text{meta}} = [\quad \text{Index\_0} = 00_2, \quad \text{Index\_1} = 11_2 \quad] \quad (4 \text{ Bits Total})}$$

```text
WEIGHT COMPRESSION AND METADATA DERIVATION SUMMARY

 Original 4-Element Weight Vector : [ +2.5f │  0.0f │  0.0f │ -4.0f ]
                                    ─────────────────────────────────
 Compressed 16-Bit Weight Payload : [ +2.5f │ -4.0f ]  (32 Bits / 4 Bytes)
 2-Bit Metadata Indices           : [ Index 0 (00_2) │ Index 3 (11_2) ] (4 Bits)
 (50% Weight Payload Compression Achieved!)
```

---

#### Step 2: Trace Stage 1 — Metadata Decoding & Multiplexer Selection

Dense Activations: $X_{\text{col0}} = [X_0 = +3.0\text{f}, \ X_1 = +8.0\text{f}, \ X_2 = +1.0\text{f}, \ X_3 = +2.0\text{f}]$.

Metadata Indices: $\text{Index\_0} = 0$, $\text{Index\_1} = 3$.

##### Metadata Multiplexer Action:
* Multiplexer 0 receives $\text{Index\_0} = 0 \implies$ Selects activation $X_0$:

$$X_{\text{sel0}} = X[\text{Index\_0}] = X_0 = \mathbf{+3.0\text{f}}$$

* Multiplexer 1 receives $\text{Index\_1} = 3 \implies$ Selects activation $X_3$:

$$X_{\text{sel1}} = X[\text{Index\_1}] = X_3 = \mathbf{+2.0\text{f}}$$

Activations $X_1 (+8.0\text{f})$ and $X_2 (+1.0\text{f})$ are **completely bypassed** by the multiplexers!

---

#### Step 3: Trace Stage 2 — Compressed MAC Execution

The Sparse Tensor Core feeds compressed weights ($+2.5\text{f}, -4.0\text{f}$) and selected activations ($+3.0\text{f}, +2.0\text{f}$) into its 2-element MAC array:

$$\text{Partial Product} = (W_{\text{nz0}} \cdot X_{\text{sel0}}) + (W_{\text{nz1}} \cdot X_{\text{sel1}})$$

$$\text{Partial Product} = (+2.5\text{f} \cdot +3.0\text{f}) + (-4.0\text{f} \cdot +2.0\text{f})$$

$$\text{Partial Product} = (+7.5\text{f}) + (-8.0\text{f}) = \mathbf{-0.5\text{f}}$$

##### Mathematical Verification against Dense Calculation:
Dense product $= (2.5 \cdot 3.0) + (0.0 \cdot 8.0) + (0.0 \cdot 1.0) + (-4.0 \cdot 2.0) = 7.5 + 0 + 0 - 8.0 = \mathbf{-0.5\text{f}}$.

The Sparse Tensor Core computed the exact mathematical sum **$-0.5\text{f}$** while executing **half the multiplications**!

---

#### Step 4: Calculate Total FLOPs and Memory Volume Comparison

For a $M \times N \times K = 16 \times 8 \times 32$ Sparse Tensor Core instruction (`mma.sp.sync`):

##### 1. Total Effective FLOPs Executed:
Equivalent dense operations $= 2 \times M \times N \times K = 2 \times 16 \times 8 \times 32 = \mathbf{8,192 \text{ FLOPs per Instruction}}$!

##### 2. Memory Read Volume Comparison (Weight Matrix $A$):

* **Dense Matrix $A$ ($16 \times 32$ FP16 elements)**:
  $$\text{Memory Volume}_{\text{dense}} = 512 \text{ elements} \times 2 \text{ Bytes/element} = \mathbf{1,024 \text{ Bytes}}$$

* **2:4 Sparse Matrix $A$ (Payload + Metadata)**:
  $$\text{Compressed Payload} = 256 \text{ non-zero elements} \times 2 \text{ Bytes/element} = 512 \text{ Bytes}$$
  $$\text{Metadata Payload} = 256 \text{ indices} \times 0.25 \text{ Bytes/index} = 64 \text{ Bytes}$$
  $$\text{Memory Volume}_{\text{sparse}} = 512 + 64 = \mathbf{576 \text{ Bytes}}$$

$$\text{Memory Savings} = \left( 1 - \frac{576\text{ Bytes}}{1,024\text{ Bytes}} \right) \times 100\% = \mathbf{43.75\% \text{ Net Memory Savings}}$$

Including metadata overhead, 2:4 structural sparsity reduced weight memory read volume by **$43.75\%$** ($1,024\text{ B} \to 576\text{ B}$)!

---

#### Step 5: Calculate Sustained Compute Throughput (TFLOPS) and Speedup

The SM contains 4 physical Sparse Tensor Cores executing `mma.sp.sync` at $f_{\text{clk}} = 2.0\text{ GHz}$ ($T_{\text{clk}} = 0.500\text{ ns}$).

* Each `mma.sp.sync` instruction executes 8,192 effective FLOPs in $T_{\text{mma}} = 2\text{ clock cycles}$.
* 4 Sparse Tensor Cores executing in parallel execute 2 `mma.sp.sync` instructions per clock cycle ($2 \times 8,192 = 16,384\text{ FLOPs per clock cycle}$).

##### 1. Calculate Sustained Sparse Tensor Throughput ($\text{Throughput}_{\text{Sparse}}$):

$$\text{Throughput}_{\text{Sparse}} = 16,384 \text{ FLOPs/cycle} \times (2.0 \times 10^9 \text{ cycles/sec}) = \mathbf{32,768 \times 10^9 \text{ FLOPs/sec}} = \mathbf{32.768 \text{ TFLOPS}}$$

##### 2. Compare against Dense Tensor Core Throughput:
A dense Tensor Core executes 4,096 FLOPs per instruction $\implies \text{Throughput}_{\text{Dense}} = \mathbf{16.384 \text{ TFLOPS}}$.

##### 3. Calculate Performance Speedup Factor:

$$\text{Speedup}_{\text{Sparse/Dense}} = \frac{\text{Throughput}_{\text{Sparse}}}{\text{Throughput}_{\text{Dense}}} = \frac{32.768\text{ TFLOPS}}{16.384\text{ TFLOPS}} = \mathbf{2.00\times \text{ Performance Advantage!}}$$

```text
SPARSE TENSOR CORE PERFORMANCE OPTIMIZATION SUMMARY

 Tensor Execution Mode  │ Memory Payload (Matrix A) │ Effective FLOPs / Inst │ Sustained Throughput
────────────────────────┼───────────────────────────┼────────────────────────┼───────────────────────
 Dense Tensor Core      │ 1,024 Bytes               │ 4,096 FLOPs            │ 16.384 TFLOPS
 2:4 Sparse Tensor Core │   576 Bytes (43.8% Saved!)│ 8,192 FLOPs            │ 32.768 TFLOPS
                        │ (1.78x Bandwidth Gain!)   │ (2x Math Density!)     │ (2.00x FASTER!)
```

##### Engineering Conclusion:
By enforcing $2:4$ structural sparsity and utilizing Sparse Tensor Cores, the accelerator doubled effective matrix compute throughput from $16.384\text{ TFLOPS}$ up to **$32.768\text{ TFLOPS}$ ($2.00\times$ performance speedup)** on the exact same silicon die area, while cutting weight memory read bandwidth demand by $43.75\%$!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and metadata results against Sparse Tensor Core microarchitecture principles:

1. **2:4 Compression Ratio Check**:
   * Original non-zero elements $= 4$, zeros $= 2$. Ratio $= 2/4 = 50\%$ non-zero density.
   * Compressed payload $= 256$ elements $\times 2\text{ bytes} = 512\text{ bytes}$.
   * Metadata payload $= 256 \times 2\text{ bits} = 512\text{ bits} = 64\text{ bytes}$.
   * Total sparse footprint $= 512 + 64 = 576\text{ bytes} < 1,024\text{ bytes}$. Compression ratio $1.78\times$ verified!
2. **Metadata Multiplexer Decoding Verification**:
   * Index 0 selected $X_0 = +3.0\text{f}$. Index 3 selected $X_3 = +2.0\text{f}$.
   * MAC product $= (2.5 \times 3.0) + (-4.0 \times 2.0) = 7.5 - 8.0 = -0.5\text{f}$.
   * Matches dense calculation $(-0.5\text{f})$ with $100\%$ mathematical precision.
3. **Throughput Scaling Verification**:
   * Dense: $16 \times 8 \times 16 = 2,048\text{ MACs} \times 2 = 4,096\text{ FLOPs}$.
   * Sparse: $16 \times 8 \times 32 = 4,096\text{ MACs} \times 2 = 8,192\text{ FLOPs}$.
   * Throughput ratio $\frac{8,192}{4,096} = 2.00\times$. Speedup math is $100\%$ exact.

All 2:4 structured pruning constraints, 2-bit metadata index extraction masks, metadata multiplexer alignment logic, $43.75\%$ memory payload compressions, and 32.768-TFLOPS throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **2:4 Structural Sparsity**: A fine-grained, hardware-aligned matrix pruning constraint where every contiguous block of 4 weight elements contains at least 2 zero values ($50\%$ zero sparsity), enabling $2:1$ data compression in memory and $2\times$ throughput acceleration.
* **Sparse Tensor Core**: A domain-specific hardware matrix engine equipped with 2-bit metadata index decoders and compressed MAC pipelines that bypasses zero multiplications, fetching only non-zero weight pairs ($W_{\text{nz0}}, W_{\text{nz1}}$) and matching activations ($X_{\text{sel0}}, X_{\text{sel1}}$) to double compute TFLOPS on the exact same silicon die area.
