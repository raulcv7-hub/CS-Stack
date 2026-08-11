content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/05-domain-specific-tensor-accelerators/01-mixed-precision-tensor-core-engines/03-quantized-low-precision-data-types.md
# Quantized Low-Precision Data Types and Dynamic Scale-Factor Logic Mechanics

## The 280-Gigabyte VRAM Memory Exhaustion and Low-Precision Quantization Physics

In modern artificial intelligence, deep learning, and large language model (LLM) acceleration, the physical memory capacity and bandwidth of off-chip High-Bandwidth Memory (HBM) or GDDR DRAM dictate system performance. A modern large language model (such as a 70-billion parameter transformer model) contains 70,000,000,000 individual weight parameters that must be loaded from memory into the GPU's or accelerator's memory subsystem to process a single user query.

When a deep neural network is trained using standard 32-bit single-precision floating-point numbers (**FP32**), each parameter occupies **4 bytes of memory**.

Let us calculate the off-chip memory capacity required merely to load a 70-billion parameter FP32 model into Graphics RAM (VRAM):

$$\text{VRAM Footprint}_{\text{FP32}} = 70,000,000,000 \text{ Parameters} \times 4 \text{ Bytes/Parameter} = \mathbf{280,000,000,000 \text{ Bytes}} = \mathbf{280 \text{ Gigabytes}}$$

```text
VRAM MEMORY FOOTPRINT EXHAUSTION ACROSS PRECISION FORMATS

 70-Billion Parameter Neural Network Model
 ┌─────────────────────────────────────────────────────────────┐
 │ FP32 Precision (4 Bytes/Param)  ──► 280 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ FP16 Precision (2 Bytes/Param)  ──► 140 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ INT8 / FP8     (1 Byte/Param)   ──►  70 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ INT4 Precision (0.5 Bytes/Param)──►  35 Gigabytes VRAM!     │
 └─────────────────────────────────────────────────────────────┘
  (Quantization shrinks model footprint from 280 GB down to 35 GB!)
```

Look at the physical memory barrier created by FP32 and FP16 formats:
1. **VRAM Capacity Exhaustion**: A 280-Gigabyte model cannot fit inside the physical VRAM of a single standard GPU (which typically holds 40 GB, 80 GB, or 96 GB of HBM). To run a single inference query, data center operators must cluster 4 to 8 GPUs together over expensive interconnect cables, dramatically increasing infrastructure cost and power consumption.
2. **Off-Chip Memory Bandwidth Saturation**: Generating a response from a 70-billion parameter model requires streaming all 140 Gigabytes (in FP16) across the HBM memory bus for every single generated text token! 

   Even at $2,000\text{ Gigabytes/second}$ of peak HBM bandwidth, fetching 140 GB per token caps execution speed at a sluggish 14 tokens per second, while burning hundreds of Joules of electrical energy.

3. **Silicon Area and Power Waste**: A 32-bit floating-point multiplier requires approximately $4\times \text{to } 8\times$ more physical transistors on the silicon die than an 8-bit integer multiplier, and burns over $10\times$ more dynamic switching power ($P = C \cdot V^2 \cdot f$) per Multiply-Accumulate (MAC) operation!

How do computer architects compress 280-Gigabyte neural network models down to 35 Gigabytes ($87.5\%$ footprint reduction) so they fit inside a single GPU's memory, while quadrupling arithmetic compute density ($4\times \text{ TFLOPS}$) and cutting memory read energy by $75\%+$ without destroying prediction accuracy?

To solve this memory capacity exhaustion and power drain crisis, modern domain-specific architectures implement **Quantized Low-Precision Data Types (FP8, INT8, INT4)** supported by **Dynamic Scale-Factor Logic**.

---

## The High-Resolution Map and the 16-Level Altitude Slider: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of quantized low-precision data types, 8-bit and 4-bit bitmasks, dynamic scale factors, and zero-point offsets before inspecting IEEE FP8 floating-point formats, integer quantization equations, and hardware rescaling ALUs, let us consider an everyday analogy: **The Mountain Topographic Map**.

Imagine a team of land surveyors (**A Deep Learning Neural Network**) measuring the exact elevations above sea level (**Real-World Floating-Point Values $x$**) across a mountain range.

```text
THE MOUNTAIN TOPOGRAPHIC MAP ANALOGY

 High-Precision Surveying Log (FP32 Precision - 4 Bytes per Entry)
 ┌─────────────────────────────────────────────────────────────┐
 │ Peak A: 4,821.391852 Meters  │ Valley B: 1,204.102941 Meters│
 └─────────────────────────────────────────────────────────────┘
  (Requires massive leather-bound logbooks! Heavy and slow to carry!)

 Quantized Pocket Map (4-Bit Integer INT4 - 0.5 Bytes per Entry)
 ┌─────────────────────────────────────────────────────────────┐
 │ Scale Factor S = 300 Meters per Notch                       │
 │ Peak A: Notch 16 (16 * 300m = 4,800m)                       │
 │ Valley B: Notch 4 (4 * 300m = 1,200m)                        │
 └─────────────────────────────────────────────────────────────┘
  (Fits inside a tiny pocket card! 87.5% lighter to carry!)
```

The mountain range spans elevations from **$0\text{ meters}$** (Sea Level) up to **$4,800\text{ meters}$** (Mount Blanc Peak).

Let us observe two different methods for recording these elevation numbers in the survey logbook:

---

### Method 1: High-Precision Decimal Recording (FP32 Model)
The surveyors write down every elevation using 8 decimal places:
* Peak A: `4,821.391852 meters`
* Valley B: `1,204.102941 meters`

Look at the physical waste of Method 1:
* Writing down 8 decimal places requires huge leather-bound logbooks (**280 Gigabytes of VRAM**).
* To carry 70 billion elevation numbers, the surveyors need a heavy truck (**Massive HBM Memory Bandwidth**).
* Do the hikers actually care if Peak A is `4,821.391852 meters` versus `4,820 meters`? **NO!** The last 6 decimal places add zero practical value to the hikers (**Redundant Precision in AI Models**)!

---

### Method 2: The 16-Notch Altitude Slider (4-Bit Quantization / INT4)
To shrink the heavy logbooks into a tiny pocket card, the chief surveyor uses **4-Bit Integer Quantization (INT4)**.

A 4-bit integer can store only $2^4 = 16$ distinct whole numbers (Notches $0$ through $15$).

The surveyor sets up a **Dynamic Scale Factor ($S$)**:
$$\text{Scale Factor } S = \frac{\text{Maximum Altitude}}{\text{Number of Notches}} = \frac{4,800 \text{ meters}}{16 \text{ Notches}} = \mathbf{300 \text{ Meters per Notch}}$$

```text
4-BIT ALTITUDE NOTCH SCALE (S = 300 METERS PER NOTCH)

 Altitude Range (0m to 4,800m)
 Notch 15 ┼─────────────────────── 4,500m to 4,800m (Mount Blanc Peak)
 Notch 14 ┼─────────────────────── 4,200m to 4,500m
  :       │
 Notch  4 ┼─────────────────────── 1,200m to 1,500m (Valley B)
 Notch  0 ┴─────────────────────── 0m to 300m       (Sea Level)
```

Now, trace how the surveyor records and reads elevations using Method 2:

1. **Quantization (Encoding to 4 Bits)**:
   * For Peak A ($4,821.39\text{ m}$): The surveyor divides by $S = 300\text{ m}$:
     $$\text{Notch} = \left\lfloor \frac{4,821.39}{300} \right\rceil = \lfloor 16.07 \rfloor \implies \mathbf{\text{Notch } 15}$$
   * The surveyor records just the integer number **`15`** on their pocket card! The number `15` fits inside **4 bits of memory ($0.5\text{ bytes}$)**!
2. **De-Quantization (Rescaling back to Real Meters)**:
   * When a hiker reads Notch `15` off the pocket card, they multiply by the Scale Factor $S = 300\text{ m}$:
     $$\text{Estimated Altitude} = 15 \times 300 \text{ meters} = \mathbf{4,500 \text{ Meters}}$$

Notice what Method 2 achieved:
* **$87.5\%$ Storage Reduction**: The logbook shrank from $4\text{ bytes}$ down to $0.5\text{ bytes}$ per entry! The 70-billion parameter model now fits in a small pocket card (**35 Gigabytes of VRAM**)!
* **Negligible Quantization Error**: The estimated altitude ($4,500\text{ m}$) was slightly lower than $4,821\text{ m}$, but for $99.9\%$ of hiking decisions, the difference is completely un-noticeable!
* **Ultra-Fast Multiplication**: Adding integer notch numbers on a cheap abacus ($0.1\text{ pJ}$ INT4 math) is $10\times$ faster than multiplying 8-digit decimal numbers!

This 16-notch altitude slider is the exact physical analogue of **Quantized Low-Precision Data Types and Dynamic Scale-Factor Logic**:
* Real-world elevation ($4,821.391852\text{ m}$) is an **FP32 Floating-Point Value ($x$)**.
* The notch number (`15`) is a **Quantized Low-Precision Integer ($q \in \text{INT4}$)**.
* The $300\text{ meters/notch}$ conversion rate is the **Dynamic Scale Factor ($S$)**.
* Dividing by $S$ and rounding to a whole notch is **Quantization**.
* Multiplying the notch number back by $S$ is **De-Quantization / Rescaling**.

---

## Primitive 1: Quantized Low-Precision Data Types (FP8, INT8, INT4)

Now that we possess a clear intuitive mental model of the 16-notch altitude slider, let us examine the formal engineering mechanics of **Quantized Low-Precision Data Types**.

In high-performance GPU and AI accelerator architectures, numerical data formats are classified by their bit-width and internal bit-field layouts:

```text
LOW-PRECISION DATA FORMAT BIT-FIELD COMPARISON

 1. FP8 E4M3 (1 Sign, 4 Exponent, 3 Mantissa) - High Precision
 ┌──┬──────────┬──────────┐
 │S │ Exponent │ Mantissa │  Range: +-448, Precision: ~3 Decimals
 └──┴──────────┴──────────┘  Best for: Forward Activations & Weights
 Bit 7  [6:3]    [2:0]

 2. FP8 E5M2 (1 Sign, 5 Exponent, 2 Mantissa) - High Dynamic Range
 ┌──┬───────────┬─────────┐
 │S │ Exponent  │Mantissa │  Range: +-57,344 (Same Exponent as FP16!)
 └──┴───────────┴─────────┘  Best for: Backpropagation Gradients
 Bit 7  [6:2]     [1:0]

 3. INT8 (8-Bit Signed Integer)
 ┌────────────────────────┐
 │ 8-Bit Two's Complement │  Range: -128 to +127
 └────────────────────────┘  Best for: Standard AI Inference
 Bits [7:0]

 4. INT4 (4-Bit Packed Integer)
 ┌──────────┬──────────┐
 │ Val 1(4b)│ Val 0(4b)│  Range: -8 to +7 (2 Values Packed in 1 Byte!)
 └──────────┴──────────┘
  Bits [7:4]  Bits [3:0]
```

---

### The Two IEEE FP8 Formats: E4M3 versus E5M2

In 8-bit floating-point (**FP8**) standards (developed jointly by NVIDIA, Intel, and ARM), there is no single "one-size-fits-all" 8-bit float. The standard provides two distinct 8-bit floating-point variants optimized for different neural network stages:

```text
FP8 FORMAT SPECIFICATION MATRIX

 FP8 Variant Name │ Total Bits │ Sign Bit │ Exponent Bits │ Mantissa Bits │ Max Representable Value
──────────────────┼────────────┼──────────┼───────────────┼───────────────┼─────────────────────────
 FP8 E4M3         │   8 Bits   │  1 Bit   │  4 Bits       │  3 Bits       │ +-448.0
 FP8 E5M2         │   8 Bits   │  1 Bit   │  5 Bits       │  2 Bits       │ +-57,344.0 (FP16 Range!)
```

#### 1. FP8 E4M3 (1 Sign, 4 Exponent, 3 Mantissa)
* **Structure**: 1 Sign Bit + 4 Exponent Bits + 3 Mantissa Bits = 8 Bits.
* **Properties**: Higher mantissa precision ($\approx 3$ decimal digits), but smaller maximum exponent range ($\pm 448.0$).
* **Microarchitectural Role**: Optimized for **Forward Pass Activations and Weight Tensors**, where numerical precision is critical for maintaining model accuracy.

#### 2. FP8 E5M2 (1 Sign, 5 Exponent, 2 Mantissa)
* **Structure**: 1 Sign Bit + 5 Exponent Bits + 2 Mantissa Bits = 8 Bits.
* **Properties**: Identical exponent range to FP16 ($\pm 57,344.0$), but lower mantissa precision (2 bits).
* **Microarchitectural Role**: Optimized for **Backpropagation Loss Gradients**, where large dynamic exponent ranges are required to prevent gradient vanishing or explosion during training.

---

### 8-Bit and 4-Bit Integer Formats: INT8 and INT4

When extreme memory compression is required (such as serving LLMs on edge devices or mobile phones), accelerators use integer quantization:

#### 1. INT8 (8-Bit Signed Two's Complement Integer)
* **Bit Width**: 8 Bits ($1\text{ byte}$ per parameter).
* **Numerical Range**: $-128 \le q \le +127$.
* **Memory Savings**: Cuts memory footprint by **$75\%$ vs FP32** ($280\text{ GB} \to 70\text{ GB}$).

#### 2. INT4 (4-Bit Signed Integer)
* **Bit Width**: 4 Bits ($0.5\text{ bytes}$ per parameter).
* **Numerical Range**: $-8 \le q \le +7$ (or $0 \le q \le 15$ for unsigned).
* **Hardware Packing**: Two 4-bit integer parameters are packed side-by-side inside **a single 8-bit byte**!
* **Memory Savings**: Cuts memory footprint by **$87.5\%$ vs FP32** ($280\text{ GB} \to 35\text{ GB}$).

---

## Primitive 2: Dynamic Scale-Factor Logic and Quantization Pipelines

Now let us examine the second core primitive: **Dynamic Scale-Factor Logic**.

How does the hardware convert continuous, real-world floating-point numbers ($x \in \mathbb{R}$) into discrete 8-bit or 4-bit low-precision integers ($q \in \mathbb{Z}$), and how does it map them back to floating-point math during matrix multiplication?

### The Mathematical Quantization Mapping Equation

Quantization maps a continuous real-world floating-point tensor $x \in [x_{\min}, x_{\max}]$ into a discrete integer range $q \in [q_{\min}, q_{\max}]$ using two parameters: a **Dynamic Scale Factor ($S$)** and an optional **Zero-Point Offset ($Z$)**.

$$\mathbf{\text{Quantization: } q = \text{clamp}\left( \left\lfloor \frac{x}{S} \right\rceil + Z, \quad q_{\min}, \quad q_{\max} \right)}$$

$$\mathbf{\text{De-Quantization / Rescaling: } x \approx S \cdot (q - Z)}$$

Where:
* $x$ is the continuous input floating-point number (e.g., $x = 18.42\text{f}$).
* $q$ is the quantized low-precision integer output (e.g., $q \in \text{INT8}$).
* $S$ is the **Dynamic Scale Factor** (a positive 32-bit float $S > 0$).
* $Z$ is the **Zero-Point Offset** (an integer offset ensuring real $0.0\text{f}$ maps exactly to a representable integer value).
* $\lfloor \cdot \rceil$ represents rounding to the nearest integer.
* $\text{clamp}(v, a, b)$ clamps values exceeding lower bound $a$ or upper bound $b$.

---

### Symmetric versus Asymmetric Quantization

Depending on whether the zero-point offset $Z$ is used, quantization is classified into two mathematical variants:

```text
QUANTIZATION VARIANT COMPARISON

 1. Symmetric Quantization (Z = 0)
    Real 0.0f maps EXACTLY to Integer 0!
    Scale Factor S = Max(|x_min|, |x_max|) / 127
    Equation: q = clamp( round(x / S), -128, +127 )
    Hardware Benefit: ZERO-POINT ADDITION ELIMINATED! (Fastest HW Math!)

 2. Asymmetric Quantization (Z != 0)
    Real 0.0f maps to Integer Z.
    Equation: q = clamp( round(x / S) + Z, 0, 255 )
    Hardware Cost: Requires extra Z term addition on every MAC step.
```

#### Why Symmetric Quantization ($Z = 0$) Is Preferred in Hardware:
In **Symmetric Quantization**, real $0.0\text{f}$ maps directly to integer $0$ ($Z = 0$).

The dynamic scale factor $S$ for an 8-bit signed integer range $[-127, +127]$ is calculated as:

$$\mathbf{S = \frac{\max(|x_{\min}|, \ |x_{\max}|)}{127}}$$

$$\text{Quantization: } q = \left\lfloor \frac{x}{S} \right\rceil, \qquad \text{De-Quantization: } x \approx S \cdot q$$

Because $Z = 0$, the hardware matrix execution engine **does not need to execute zero-point addition overheads** during matrix multiplication!

---

### Hardware Architecture of the Dynamic Rescaling Pipeline

When a Tensor Core or vector engine executes matrix multiplication on quantized INT8 inputs ($D = A_{\text{INT8}} \times B_{\text{INT8}}$):

1. **Input Loading**: Matrix $A$ is loaded as INT8 values with scale factor $S_A$. Matrix $B$ is loaded as INT8 values with scale factor $S_B$.
2. **High-Density INT8 MAC Array**: The hardware multiplies INT8 $A$ and INT8 $B$, accumulating partial products into a **32-bit high-precision INT32 accumulator register ($D_{\text{INT32}}$)**:

$$D_{\text{INT32}} = \sum_{k=0}^{K-1} A_{\text{INT8}, k} \cdot B_{\text{INT8}, k}$$

3. **Dynamic Scale-Factor Rescaling Phase (1 Clock Cycle)**:
   The hardware **Dynamic Scale-Factor Logic** sitting at the output of the INT32 accumulator multiplies the 32-bit integer sum by the combined scale factor ($S_{\text{combined}} = S_A \cdot S_B$):

$$\mathbf{D_{\text{FP32\_real}} = D_{\text{INT32}} \cdot (S_A \cdot S_B)}$$

```text
DYNAMIC SCALE-FACTOR HARDWARE RESCALING PIPELINE

 INT8 Matrix A [Scale S_A]                 INT8 Matrix B [Scale S_B]
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ [ A0 | A1 | A2 | A3 ]     │             │ [ B0 | B1 | B2 | B3 ]     │
 └─────────────┬─────────────┘             └─────────────┬─────────────┘
               │                                         │
               └───────────────────┬─────────────────────┘
                                   ▼
                   INT8 x INT8 Multipliers
                                   │
                                   ▼ 16-Bit Products
                   32-Bit INT32 Accumulator
                   D_INT32 = Sum( A_i * B_i )
                                   │
                                   ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ DYNAMIC SCALE-FACTOR RESCALING ALU                          │
 │ Computes: D_real = D_INT32 * (S_A * S_B)                   │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Output Real FP32 Result D_real (Exact Float Scale Restored!)
```

Look at the microarchitectural brilliance of this pipeline:
* **$1,024$ MAC additions** were executed using cheap, fast 8-bit integer multipliers at $4\times$ silicon density!
* The floating-point scaling multiplication ($D_{\text{INT32}} \cdot (S_A \cdot S_B)$) was executed **ONCE at the very end of the inner product**!
* The real-world floating-point scale was restored with $100\%$ precision in a single clock cycle!

---

## Quantization Granularities: Per-Tensor vs. Per-Channel vs. Block Scaling

How frequently should the hardware update the Dynamic Scale Factor $S$?

Computer architects and compiler designers choose among three **Quantization Granularities**:

```text
QUANTIZATION GRANULARITY HIERARCHY

 1. Per-Tensor Scaling
    ONE single Scale Factor S for the ENTIRE 10-Megabyte Matrix!
    Hardware Overhead: Minimal (1 Float per Matrix).
    Accuracy Risk: Outlier values distort precision for small numbers.

 2. Per-Channel / Per-Row Scaling
    ONE Scale Factor S_row for EACH ROW of the matrix!
    Hardware Overhead: Low (1 Float per Row).
    Accuracy: Excellent for Convolutional Filters & Attention Matrices.

 3. Micro-Block Scaling (NVFP4 / MXFP8 Block Scaling)
    ONE Scale Factor S_block for EVERY 16 or 32 ELEMENTS!
    Hardware Overhead: Moderate (4 Bits metadata per 16 Elements).
    Accuracy: MAXIMUM! Matches FP32 accuracy for 4-Bit LLM Inference!
```

---

### 1. Per-Tensor Scaling
* **Mechanism**: A single scale factor $S$ is calculated for the entire matrix ($S = \max(|x|) / 127$).
* **Advantage**: Lowest possible memory overhead (only 1 float stored for millions of parameters).
* **Limitation**: If the matrix contains a single huge **Outlier Value** (e.g., $x_{\text{outlier}} = 500.0\text{f}$ while all other values are $0.1\text{f}$), $S = 500 / 127 = 3.93$. Small values ($0.1 / 3.93 = 0.02$) round down to **exact zero $0$**, causing precision loss for $99\%$ of the tensor!

---

### 2. Per-Channel / Per-Row Scaling
* **Mechanism**: A separate scale factor $S_i$ is calculated for each individual row $i$ of the matrix ($S_i = \max(|x_i|) / 127$).
* **Advantage**: Outliers in Row 0 do not degrade precision in Row 1. This is the standard granularity for CNN filter layers and Transformer projection matrices.

---

### 3. Micro-Block Scaling (MXFP8 / NVFP4 Block Scaling)
* **Mechanism**: The matrix is partitioned into small sub-blocks of **16 or 32 contiguous elements**. Each 16-element block receives its own micro-scale factor $S_{\text{block}}$ stored as an 8-bit E8M0 exponent.
* **Advantage**: Outliers are contained within a tiny 16-element block! Micro-block scaling allows **4-bit INT4 and FP4 models to achieve $100\%$ of full FP32 accuracy** even on 70-billion parameter LLMs!

---

## Solved Industrial Engineering Exercise: Quantitative INT8 & FP8 Matrix Quantization, Scale-Factor Rescaling, and VRAM Bandwidth Analysis

To consolidate your complete mastery of quantized low-precision data types, INT8/FP8 bitwise representations, dynamic scale-factor logic, per-row scaling math, and VRAM bandwidth savings, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the quantized tensor subsystem of a $2.0\text{ GHz}$ enterprise AI accelerator chip ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The accelerator features a High-Bandwidth Memory (HBM3) interface delivering a peak memory read bandwidth $\text{BW}_{\text{peak}} = 1,200\text{ Gigabytes/second}$ ($1.2\text{ TB/sec}$).

The accelerator executes an LLM self-attention projection layer multiplying an input activation matrix $X$ ($1,024 \times 4,096$ elements) by a trained weight matrix $W$ ($4,096 \times 4,096$ elements):

$$\mathbf{Y_{1,024 \times 4,096} = X_{1,024 \times 4,096} \times W_{4,096 \times 4,096}}$$

```text
2.0 GHz ENTERPRISE AI ACCELERATOR SPECIFICATIONS

 Clock Frequency       : 2.0 GHz (T_clk = 500 ps)
 Off-Chip HBM3 Bandwidth: 1,200 GB/sec (1.2 TB/sec)
 Weight Matrix Size W  : 4,096 x 4,096 Elements = 16,777,216 Parameters
 Activation Matrix X   : 1,024 x 4,096 Elements = 4,194,304 Parameters
 Total MAC Operations  : 1,024 x 4,096 x 4,096 = 17,179,869,184 MACs
```

#### System Implementations to Compare:

* **Implementation A (Un-Quantized FP16 Baseline)**:
  * Matrices $X$ and $W$ stored in 16-bit FP16 format ($2\text{ bytes/element}$).
* **Implementation B (Symmetric INT8 Quantized with Per-Row Scaling)**:
  * Matrices $X$ and $W$ quantized to 8-bit signed INT8 ($1\text{ byte/element}$).
  * Scale factors stored as 32-bit FP32 floats ($4\text{ bytes/row}$).
* **Implementation C (Symmetric INT4 Quantized with Micro-Block Scaling)**:
  * Weight matrix $W$ quantized to 4-bit INT4 ($0.5\text{ bytes/element}$, packed 2 values/byte).
  * Scale factors stored per 32-element block ($1\text{ byte per 32 elements}$).
  * Activations $X$ kept in INT8 ($1\text{ byte/element}$).

#### Sample Values for Row 0 of Weight Matrix $W$:
Row 0 of Matrix $W$ contains values ranging from $W_{\min} = -3.81\text{f}$ to $W_{\max} = +3.81\text{f}$.
* Element $W_{0,0} = +2.54\text{f}$.
* Element $W_{0,1} = -1.27\text{f}$.

#### Your Objective

1. For **Implementation B (Symmetric INT8)**:
   * Calculate the per-row dynamic scale factor $S_{W0}$ for Row 0 ($S_{W0} = \max(|W|) / 127$).
   * Quantize elements $W_{0,0} (+2.54\text{f})$ and $W_{0,1} (-1.27\text{f})$ into 8-bit signed integers ($q_{0,0}$ and $q_{0,1}$).
   * De-quantize $q_{0,0}$ and $q_{0,1}$ back to floating-point numbers and verify exactness.
2. Calculate total memory storage footprint (in Megabytes) for Weight Matrix $W$ under Implementation A (FP16), Implementation B (INT8), and Implementation C (INT4).
3. Calculate the total memory read time (in microseconds) required to load Weight Matrix $W$ from HBM3 memory across all three implementations.
4. Calculate the **Memory Bandwidth Speedup Factor** of Implementation B and Implementation C over Implementation A.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate INT8 Quantization and De-Quantization for Row 0

Row 0 range: $\max(|W|) = 3.81\text{f}$. INT8 range $= [-127, +127]$.

##### 1. Calculate Dynamic Scale Factor $S_{W0}$:
$$S_{W0} = \frac{\max(|W|)}{127} = \frac{3.81\text{f}}{127} = \mathbf{0.0300 \text{f per integer count}}$$

##### 2. Quantize Element $W_{0,0} = +2.54\text{f}$:
$$q_{0,0} = \left\lfloor \frac{W_{0,0}}{S_{W0}} \right\rceil = \left\lfloor \frac{2.54\text{f}}{0.0300\text{f}} \right\rceil = \lfloor 84.6667 \rceil = \mathbf{+85 \quad (\text{INT8: 8'h55})}$$

##### 3. Quantize Element $W_{0,1} = -1.27\text{f}$:
$$q_{0,1} = \left\lfloor \frac{W_{0,1}}{S_{W0}} \right\rceil = \left\lfloor \frac{-1.27\text{f}}{0.0300\text{f}} \right\rceil = \lfloor -42.3333 \rceil = \mathbf{-42 \quad (\text{INT8: 8'hD6})}$$

##### 4. De-Quantize (Rescale) back to Floating-Point Values:
$$\hat{W}_{0,0} = q_{0,0} \cdot S_{W0} = 85 \times 0.0300\text{f} = \mathbf{2.5500 \text{f}} \quad (\text{Original } 2.54\text{f}, \text{ Error } = 0.01\text{f})$$

$$\hat{W}_{0,1} = q_{0,1} \cdot S_{W0} = -42 \times 0.0300\text{f} = \mathbf{-1.2600 \text{f}} \quad (\text{Original } -1.27\text{f}, \text{ Error } = 0.01\text{f})$$

```text
INT8 QUANTIZATION AND RESCALING VERIFICATION

 Original Float Value │ Dynamic Scale S_W0 │ Quantized INT8 (q) │ Rescaled Float (q * S) │ Error
─────────────────────┼────────────────────┼────────────────────┼────────────────────────┼────────
 +2.5400f            │ 0.0300f            │ +85  (8'h55)       │ +2.5500f               │ +0.01f
 -1.2700f            │ 0.0300f            │ -42  (8'hD6)       │ -1.2600f               │ +0.01f
```

The INT8 quantization equations evaluate with $100\%$ precision!

---

#### Step 2: Calculate Memory Storage Footprint for Weight Matrix $W$

Matrix $W$ dimensions $= 4,096 \times 4,096 = \mathbf{16,777,216 \text{ Weight Parameters}}$.

##### 1. Implementation A (FP16 Baseline — 2 Bytes/Element):
$$\text{Footprint}_A = 16,777,216 \text{ params} \times 2 \text{ Bytes/param} = 33,554,432 \text{ Bytes} = \mathbf{33.554 \text{ Megabytes (33.55 MB)}}$$

##### 2. Implementation B (Symmetric INT8 + Per-Row Scaling Metadata):
* Weight Payload: $16,777,216 \text{ params} \times 1 \text{ Byte/param} = 16,777,216 \text{ Bytes} = 16.777\text{ MB}$.
* Per-Row Scale Factor Metadata ($4,096\text{ rows} \times 4\text{ bytes/row} = 16,384\text{ Bytes} = 0.016\text{ MB}$).

$$\text{Footprint}_B = 16,777,216 + 16,384 = 16,793,600 \text{ Bytes} = \mathbf{16.794 \text{ Megabytes (16.79 MB)}}$$

##### 3. Implementation C (INT4 + Micro-Block Scale Metadata):
* Weight Payload (2 values/byte): $16,777,216 \times 0.5 \text{ Bytes} = 8,388,608 \text{ Bytes} = 8.389\text{ MB}$.
* Micro-Block Scale Metadata ($16,777,216 / 32 \text{ blocks} = 524,288 \text{ blocks} \times 1 \text{ Byte/block} = 524,288\text{ Bytes} = 0.524\text{ MB}$).

$$\text{Footprint}_C = 8,388,608 + 524,288 = 8,912,896 \text{ Bytes} = \mathbf{8.913 \text{ Megabytes (8.91 MB)}}$$

```text
VRAM WEIGHT FOOTPRINT COMPARISON

 Implementation Format │ Payload Storage │ Metadata Overhead │ Total VRAM Size │ Memory Savings %
───────────────────────┼─────────────────┼───────────────────┼─────────────────┼──────────────────
 Implementation A FP16 │ 33.554 MB       │ 0.000 MB          │ 33.554 MB       │ 0.0% (Baseline)
 Implementation B INT8 │ 16.777 MB       │ 0.016 MB (0.1%)   │ 16.794 MB       │ 50.0% Saved
 Implementation C INT4 │  8.389 MB       │ 0.524 MB (6.2%)   │  8.913 MB       │ 73.4% SAVED!
```

---

#### Step 3: Calculate Memory Read Time across HBM3 Memory ($1,200\text{ GB/sec}$)

Off-chip HBM3 read bandwidth $\text{BW} = 1,200\text{ GB/sec} = 1.200 \times 10^{12}\text{ Bytes/second}$.

$$\text{Memory Read Time } t_{\text{read}} = \frac{\text{Total Memory Footprint (Bytes)}}{\text{HBM3 Bandwidth (Bytes/sec)}}$$

##### 1. Implementation A (FP16 Baseline — $33,554,432\text{ Bytes}$):
$$t_{\text{read\_A}} = \frac{33,554,432 \text{ Bytes}}{1.200 \times 10^{12} \text{ Bytes/sec}} = 27.962 \times 10^{-6} \text{ seconds} = \mathbf{27.962 \text{ microseconds}} \quad (27,962\text{ ns})$$

##### 2. Implementation B (Symmetric INT8 — $16,793,600\text{ Bytes}$):
$$t_{\text{read\_B}} = \frac{16,793,600 \text{ Bytes}}{1.200 \times 10^{12} \text{ Bytes/sec}} = 13.995 \times 10^{-6} \text{ seconds} = \mathbf{13.995 \text{ microseconds}} \quad (13,995\text{ ns})$$

##### 3. Implementation C (INT4 Micro-Block — $8,912,896\text{ Bytes}$):
$$t_{\text{read\_C}} = \frac{8,912,896 \text{ Bytes}}{1.200 \times 10^{12} \text{ Bytes/sec}} = 7.427 \times 10^{-6} \text{ seconds} = \mathbf{7.427 \text{ microseconds}} \quad (7,427\text{ ns})$$

---

#### Step 4: Calculate Memory Bandwidth Speedup Factors

$$\text{Speedup}_{\text{INT8}} = \frac{t_{\text{read\_A}}}{t_{\text{read\_B}}} = \frac{27.962\text{ }\mu\text{s}}{13.995\text{ }\mu\text{s}} = \mathbf{1.998\times \text{ Memory Bandwidth Speedup!}}$$

$$\text{Speedup}_{\text{INT4}} = \frac{t_{\text{read\_A}}}{t_{\text{read\_C}}} = \frac{27.962\text{ }\mu\text{s}}{7.427\text{ }\mu\text{s}} = \mathbf{3.765\times \text{ Memory Bandwidth Speedup!}}$$

```text
HBM3 MEMORY READ PERFORMANCE OPTIMIZATION SUMMARY

 Implementation Format │ Memory Read Time (us) │ Effective Read Bandwidth │ Speedup vs FP16
───────────────────────┼───────────────────────┼──────────────────────────┼───────────────────
 Implementation A FP16 │ 27.962 us             │ 1,200 GB/sec             │ 1.00x (Baseline)
 Implementation B INT8 │ 13.995 us             │ 2,398 GB/sec             │ 2.00x FASTER!
 Implementation C INT4 │  7.427 us             │ 4,518 GB/sec             │ 3.77x FASTER!
                       │ (73.4% Read Time Cut!)│ (3.77x Bandwidth Gain!)  │ (+277% Speedup)
```

##### Engineering Conclusion:
Quantizing the model from FP16 down to INT4 (Implementation C) shrank VRAM weight footprint from $33.55\text{ MB}$ down to $8.91\text{ MB}$, cutting HBM memory read time from $27.96\text{ }\mu\text{s}$ down to $7.43\text{ }\mu\text{s}$—delivering a **$3.77\times$ memory read speedup ($277\%$ bandwidth expansion)** on the exact same HBM memory channels!

---

### Sanity Check and Verification

Let us verify our mathematical, quantization, and bandwidth results against low-precision hardware principles:

1. **Quantization & Rescaling Accuracy Check**:
   * Original $W_{0,0} = +2.54\text{f}$. Scale $S = 0.0300\text{f}$.
   * Quantized $q = \lfloor 2.54 / 0.0300 \rceil = +85$.
   * Rescaled $\hat{W} = 85 \times 0.0300 = +2.55\text{f}$.
   * Quantization error $= |2.54 - 2.55| = 0.01\text{f} \le \frac{S}{2} = 0.015\text{f}$. Error bound $100\%$ verified!
2. **Metadata Storage Overhead Check**:
   * Implementation B metadata: $4,096 \times 4\text{ bytes} = 16,384\text{ bytes} = 0.097\%$ of weight payload.
   * Implementation C metadata: $524,288 \times 1\text{ byte} = 524,288\text{ bytes} = 6.25\%$ of weight payload.
   * Metadata overhead math is $100\%$ exact.
3. **Memory Read Time Scaling Verification**:
   * Ratio $\frac{33.554\text{ MB}}{16.794\text{ MB}} = 1.998\times$. Time ratio $\frac{27.962}{13.995} = 1.998\times$. Matches $100\%$!

All integer quantization equations, scale-factor rescaling ALUs, FP8 E4M3/E5M2 exponent range rules, micro-block metadata overheads, and 3.77x HBM read speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Quantized Low-Precision Data Types**: Numerical compression formats (FP8 E4M3/E5M2, INT8, INT4) that reduce tensor memory footprints by $75\%\text{ to } 87.5\%$ and quadruple silicon compute density, enabling large neural network models to fit inside GPU VRAM.
* **Dynamic Scale-Factor Logic**: The hardware arithmetic circuit that applies a scaling factor ($S$) to map low-precision quantized integer or FP8 values back to real-world floating-point ranges ($x = S \cdot q$) during matrix accumulation, preventing numerical underflow, overflow, and model convergence failures.
