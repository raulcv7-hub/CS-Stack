---
title: "Sub-Byte Microscaling Number Formats and Microscaling Unit Architecture"
---

# Sub-Byte Microscaling Number Formats and Microscaling Unit Architecture

## The Sub-Byte Exponent Wall and Memory Bandwidth Compression Bottlenecks

In modern high-performance artificial intelligence accelerators, deep learning neural networks have grown to astronomical scales. Large language models (LLMs) and multi-modal AI systems contain hundreds of billions—or even trillions—of trained parameter weights ($W$). During real-world inference and training, these multi-billion parameter models must stream their weights from off-chip High-Bandwidth Memory (HBM) or GDDR DRAM into on-chip processing units for every single token or frame generated.

When neural networks are executed using standard 16-bit floating-point formats (such as **FP16** or **BF16**), each parameter weight requires **2 bytes of memory**. 

Even when compressed to 8-bit floating-point (**FP8**) or 8-bit integer (**INT8**) formats, each parameter still consumes **1 byte of memory**. For a 500-billion parameter neural network model, loading the model parameters in FP8 requires transferring **500 Gigabytes of data** across off-chip memory buses for every single generated token.

To break this memory bandwidth wall, computer architects and algorithm researchers seek to compress data formats below 8 bits—into **Sub-Byte Formats** such as **4-bit integers (INT4)**, **4-bit floating-point (FP4)**, or **6-bit floating-point (FP6)**:

```text
THE MEMORY FOOTPRINT AND BANDWIDTH COMPRESSION TIMELINE

 500-Billion Parameter Neural Network Model
 ┌─────────────────────────────────────────────────────────────┐
 │ FP16 / BF16 (2.0 Bytes/Param) ──► 1,000 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ FP8  / INT8 (1.0 Byte/Param)  ──►   500 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ MXFP6       (0.75 Bytes/Param)──►   375 Gigabytes VRAM!     │
 ├─────────────────────────────────────────────────────────────┤
 │ MXFP4 / INT4(0.50 Bytes/Param)──►   250 Gigabytes VRAM!     │
 └─────────────────────────────────────────────────────────────┘
  (Sub-byte formats slash off-chip memory bandwidth by up to 75%!)
```

However, when chip designers attempt to construct a traditional, standalone floating-point format in 4 bits ($0.5\text{ bytes}$ per number), they encounter a fundamental mathematical and physical hardware barrier: **The Sub-Byte Exponent Allocation Wall**.

Consider the bit-field allocation dilemma of a 4-bit floating-point number ($E_a M_b$):
* A 4-bit container has only **4 total bits** to distribute among the Sign bit ($S$), Exponent bits ($E$), and Mantissa bits ($M$).
* **Option A: Allocate 1 Sign + 2 Exponent + 1 Mantissa ($E2M1$)**:
  A 2-bit exponent can represent only $2^2 = 4$ scale levels! 
  
  The dynamic range of a 2-bit exponent spans only a tiny range (e.g., $0.25 \text{ to } 4.0$). Any neural network activation or weight smaller than $0.25$ flushes to $0.0$ (**Underflow**), and any value larger than $4.0$ overflows to $+\infty$ (**Overflow**).
* **Option B: Allocate 1 Sign + 3 Exponent + 0 Mantissa ($E3M0$)**:
  Allocating 3 bits to the exponent provides a decent dynamic range, but leaves **0 bits for the mantissa**! The format cannot represent fractional precision, reducing all values to crude power-of-two coarse steps.

```text
THE 4-BIT FLOATING-POINT BIT-FIELD ALLOCATION DILEMMA

 Option A: E2M1 (1 Sign, 2 Exponent, 1 Mantissa)
 ┌──┬───────┬──────┐
 │S │ Exp(2)│Mant(1)│ ──► Dynamic Range is TINY (0.25 to 4.0)!
 └──┴───────┴──────┘      (Underflows & Overflows destroy AI accuracy!)

 Option B: E3M0 (1 Sign, 3 Exponent, 0 Mantissa)
 ┌──┬───────────┐
 │S │ Exponent(3)│    ──► ZERO Mantissa Bits!
 └──┴───────────┘         (No fractional precision! Crude power-of-two steps!)
```

We are trapped in a physical and mathematical dilemma:
* Storing parameters in 8-bit or 16-bit formats saturates off-chip memory bus bandwidth and limits compute density per $\text{mm}^2$ of silicon.
* Building traditional, independent 4-bit floating-point numbers fails because 4 bits are physically insufficient to hold both a wide exponent range and high mantissa precision simultaneously.

How do computer architects design sub-byte number formats (FP4, FP6, INT4) that deliver the **massive $10^{-38} \text{ to } 10^{+38}$ dynamic range of an 8-bit exponent** alongside high mantissa precision, while consuming only **4 bits per element in memory**?

To solve the sub-byte exponent wall and eliminate off-chip memory bandwidth saturation, modern domain-specific tensor architectures implement **Sub-Byte Microscaling (MX) Number Formats** and **Microscaling Units**.


### Strategy 1: Individual Master Amplifiers (Traditional Floating-Point)
The producer equips every single musician with an individual, heavy 200-Watt master power amplifier (**An Independent 16-Bit or 32-Bit Floating-Point Format**).

* Each musician carries an **8-bit Master Volume Dial** (**An 8-Bit Exponent $E$**) to handle the huge dynamic range from quiet whispers to booming cannons.
* Each musician ALSO carries an **8-bit Precision Fine-Tuning Knob** (**An 8-Bit Mantissa $M$**).

Look at the equipment waste of Strategy 1:
* To record 32 musicians, the orchestra must transport **32 heavy master amplifiers** across the country!
* $80\%$ of the truck space is occupied by carrying 32 duplicate 8-bit master volume dials, even though all 32 musicians are playing in the exact same concert hall at roughly similar volume levels!


## Primitive 1: Sub-Byte Microscaling Number Formats (MXFP8, MXFP6, MXFP4, MXINT8)

Now that we possess a clear intuitive mental model of the shared master tuning fork and 4-bit pocket sliders, let us examine the formal, standardized engineering mechanics of **Sub-Byte Microscaling (MX) Number Formats**.

Promoutgated as an open industry standard by the Open Compute Project (OCP) Microscaling Formats (MX) Workgroup (backed by NVIDIA, AMD, Intel, Arm, Qualcomm, and Meta), **Microscaling (MX) Formats** define a family of block-scaled sub-byte data representations designed specifically for next-generation AI accelerators.

In an MX format, a tensor is partitioned into small, fixed-size blocks of $k$ contiguous elements (typically $k = 32\text{ elements}$).

> **A Microscaling (MX) Block** consists of a single shared 8-bit scale factor ($S_{\text{block}}$) paired with $k = 32$ sub-byte data elements ($x_0, x_1, \dots, x_{31}$), where the real mathematical value of each element $i$ is calculated as the product of the shared block scale factor and the sub-byte element value:

$$\mathbf{x_i = S_{\text{block}} \cdot m_i \quad \text{for } 0 \le i < 32}$$

Where:
* $x_i$ is the real-world floating-point value represented by element $i$.
* $S_{\text{block}}$ is the 8-bit shared block scale factor (formatted in **E8M0 floating-point format**).
* $m_i$ is the low-precision sub-byte element value (formatted in **FP8, FP6, FP4, or INT8**).

```text
MX BLOCK MEMORY STRUCTURAL LAYOUT (k = 32 ELEMENTS)

 32-Element Microscaled Block (MX Block)
 ┌──────────────────┬─────────────────────────────────────────────────┐
 │ Shared Scale S   │ 32 Sub-Byte Data Elements (m0, m1, m2 ... m31)  │
 │ (E8M0: 8 Bits)   │ (e.g. 32 x 4-Bit FP4 Elements = 128 Bits)       │
 └─────────┬────────┴────────────────────────┬────────────────────────┘
           │                                 │
           ▼                                 ▼
   Amortized Scale Cost            Sub-Byte Element Payload
   8 Bits / 32 = 0.25 Bits/Elem    4 Bits / Element
   (Total Effective Storage = 4.25 Bits per Parameter!)
```


#### 1. MXFP4 ($E2M1$ — 4-Bit Microscaled Float)
* **Element Bit Field**: 1 Sign Bit + 2 Exponent Bits + 1 Mantissa Bit = **4 Bits per element**.
* **Representable Values ($m_i$)**: $\{\pm 0.0, \, \pm 0.5, \, \pm 1.0, \, \pm 1.5, \, \pm 2.0, \, \pm 3.0, \, \pm 4.0, \, \pm 6.0\}$.
* **Effective Storage Cost**: 4 bits + $0.25\text{ scale bits} = \mathbf{4.25 \text{ bits per parameter}}$.
* **Memory Compression**: Cuts memory storage footprint by **$73.4\%$ vs FP16** ($2.0\text{ B} \to 0.53\text{ B}$) and **$86.7\%$ vs FP32** ($4.0\text{ B} \to 0.53\text{ B}$)!


#### 3. Shared Scale Factor Format: E8M0 (8-Bit Power-of-Two Exponent)
The shared scale factor $S_{\text{block}}$ uses a specialized **E8M0 floating-point format**:
* **Bit Field**: 0 Sign Bits + 8 Exponent Bits + 0 Mantissa Bits = **8 Bits**.
* **Mathematical Value**: $S_{\text{block}} = 2^{E_{\text{scale}} - 127}$, where $E_{\text{scale}} \in [0, 255]$.
* **Hardware Benefit**: Because $S_{\text{block}}$ is an exact power of two ($2^{E}$), multiplying a sub-byte element $m_i$ by $S_{\text{block}}$ requires **ZERO hardware multipliers**! In digital logic, multiplying by $2^E$ is executed simply by adding $E_{\text{scale}}$ to the exponent field of the element or shifting the bit vector!


### The 3 Pipeline Stages of a Microscaling (MX) Tensor Engine

A Microscaling Tensor Engine evaluates microscaled matrix tiles across three hardware pipeline stages:

#### Stage 1: Sub-Byte Unpacking and Mantissa Staging
1. The MX unit receives a 32-element MX block containing 32 4-bit FP4 elements ($m_A$) and their shared 8-bit scale factor $S_A$.
2. **Unpack Logic**: The 4-bit elements are unpacked and sign-extended into 8-bit internal execution registers ($m_{A,i} \to \text{FP8}$ format).
3. The shared scale factors $S_A$ and $S_B$ (in E8M0 format) are routed directly to the **Scale Multiplier Unit** at the tail end of the pipeline.

#### Stage 2: Dense Sub-Byte MAC Multiplier Array Execution
The 32 unpacked sub-byte element pairs ($m_{A,i}$ and $m_{B,i}$) enter a high-density $32 \times 32$ sub-byte multiplier matrix:
* **Sub-Byte Multiplier Density**: Because 4-bit or 6-bit multipliers are $4\times \text{to } 8\times$ smaller than 16-bit multipliers, the silicon die packs **thousands of sub-byte multipliers** into a tiny physical area.
* The multiplier array computes the inner un-scaled dot product sum ($P_{\text{unscaled}}$):

$$\mathbf{P_{\text{unscaled}} = \sum_{i=0}^{31} (m_{A,i} \cdot m_{B,i})}$$

Notice that this inner dot product is computed **without multiplying by the scale factors $S_A$ or $S_B$ yet**!

#### Stage 3: Shared Scale Exponent Rescaling ($S_{\text{combined}} = S_A \cdot S_B$)
In the final pipeline stage, the un-scaled integer/float product $P_{\text{unscaled}}$ is rescaled to its true mathematical floating-point magnitude:
1. The **Scale Multiplier Unit** adds the two 8-bit E8M0 scale exponents ($E_A$ and $E_B$):

$$E_{\text{combined}} = E_A + E_B - 127 \implies \mathbf{S_{\text{combined}} = S_A \cdot S_B = 2^{E_{\text{combined}}}}$$

2. A single 32-bit floating-point multiplier multiplies the un-scaled partial sum $P_{\text{unscaled}}$ by $S_{\text{combined}}$:

$$\mathbf{D_{\text{FP32}} = P_{\text{unscaled}} \cdot S_{\text{combined}} = \left( \sum_{i=0}^{31} m_{A,i} \cdot m_{B,i} \right) \cdot (S_A \cdot S_B)}$$

```text
SHARED SCALE RESCALING SAVINGS MATH

 Un-Optimized Rescaling (32 Scale Multiplications per Block):
 P_i = (m_Ai * S_A) * (m_Bi * S_B)  ──► Requires 32 Floating-Point Scale Multipliers!

 Microscaled Rescaling (1 Scale Multiplication per Block):
 P_total = Sum( m_Ai * m_Bi ) * (S_A * S_B) ──► Requires ONLY 1 Scale Multiplier!
 (31 Floating-Point Scale Multipliers ELIMINATED! 96.9% Scale Energy Saved!)
```

Look at the microarchitectural brilliance of the MX pipeline:
Instead of executing 32 separate floating-point scale multiplications ($m_{A,i} \cdot S_A \cdot m_{B,i} \cdot S_B$), the MX Unit executes **32 cheap sub-byte multiplications**, sums them, and performs **ONE single scale multiplication for the entire 32-element block**!

Scale factor execution overhead is reduced by **$96.9\%$ ($31/32$ scale multiplications eliminated)**!


## Solved Industrial Engineering Exercise: Quantitative MXFP4 Tensor Matrix Multiplication, Microscaling Rescaling, and Bandwidth Acceleration

To consolidate your complete mastery of sub-byte microscaling formats (MXFP4), 8-bit shared scale factors (E8M0), MX unit hardware pipelines, and off-chip memory bandwidth savings, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Memory Footprint for 100-Billion Parameter Model

Model size $N_{\text{params}} = 100,000,000,000\text{ parameters}$.

##### 1. Implementation A (FP16 Baseline — $16\text{ Bits} = 2\text{ Bytes/Param}$):
$$\text{Footprint}_A = 100 \times 10^9 \text{ params} \times 2 \text{ Bytes/param} = \mathbf{200.0 \text{ Gigabytes (200 GB)}}$$

##### 2. Implementation B (Standard FP8 — $8\text{ Bits} = 1\text{ Byte/Param}$):
$$\text{Footprint}_B = 100 \times 10^9 \text{ params} \times 1 \text{ Byte/param} = \mathbf{100.0 \text{ Gigabytes (100 GB)}}$$

##### 3. Implementation C (OCP MXFP4 Microscaled — $k = 32\text{ Elements}$):
* Number of 32-element blocks $= \frac{100 \times 10^9}{32} = 3,125,000,000\text{ blocks}$.
* Element Payload Storage $= 100 \times 10^9 \text{ params} \times 0.5 \text{ Bytes/param} = 50,000,000,000\text{ Bytes} = 50.0\text{ GB}$.
* Shared Scale Factor Storage $= 3,125,000,000 \text{ blocks} \times 1 \text{ Byte/block} = 3,125,000,000\text{ Bytes} = 3.125\text{ GB}$.

$$\text{Footprint}_C = 50.0\text{ GB} + 3.125\text{ GB} = \mathbf{53.125 \text{ Gigabytes (53.125 GB)}}$$

$$\text{Effective Bits per Parameter (MXFP4)} = \frac{53.125 \times 10^9 \times 8 \text{ Bits}}{100 \times 10^9 \text{ Params}} = \mathbf{4.25 \text{ Bits / Parameter}}$$

```text
VRAM MODEL FOOTPRINT COMPARISON (100-BILLION PARAMETERS)

 Implementation Format │ Payload Storage │ Scale Metadata │ Total VRAM Size │ Memory Savings %
───────────────────────┼─────────────────┼────────────────┼─────────────────┼──────────────────
 Implementation A FP16 │ 200.00 GB       │ 0.000 GB       │ 200.00 GB       │ 0.0% (Baseline)
 Implementation B FP8  │ 100.00 GB       │ 0.000 GB       │ 100.00 GB       │ 50.0% Saved
 Implementation C MXFP4│  50.00 GB       │ 3.125 GB (5.9%)│  53.125 GB      │ 73.4% SAVED!
```


#### Step 3: Trace MX Block 0 Execution and Exponent Rescaling

Given:
* $S_A = 16.0\text{f}$ ($E_A = 131_{10}$), $S_B = 0.25\text{f}$ ($E_B = 125_{10}$).
* Pair 0: $m_{A,0} \cdot m_{B,0} = (+2.0) \times (+3.0) = \mathbf{+6.0\text{f}}$.
* Pair 1: $m_{A,1} \cdot m_{B,1} = (-1.5) \times (+4.0) = \mathbf{-6.0\text{f}}$.
* Remaining 30 Pairs Sum: $\sum_{i=2}^{31} (m_{A,i} \cdot m_{B,i}) = \mathbf{100.0\text{f}}$.
* Initial Accumulator $C_{\text{FP32}} = \mathbf{10.0\text{f}}$.

##### 1. Stage 2: Un-Scaled Dot Product Sum ($P_{\text{unscaled}}$):
$$P_{\text{unscaled}} = (m_{A,0} \cdot m_{B,0}) + (m_{A,1} \cdot m_{B,1}) + \sum_{i=2}^{31} (m_{A,i} \cdot m_{B,i})$$

$$P_{\text{unscaled}} = (+6.0) + (-6.0) + 100.0 = \mathbf{100.0\text{f}}$$

##### 2. Stage 3: Shared Scale Exponent Addition ($S_{\text{combined}} = S_A \cdot S_B$):
Using E8M0 exponent addition:

$$E_{\text{combined}} = E_A + E_B - 127 = 131 + 125 - 127 = \mathbf{129_{10}}$$

$$S_{\text{combined}} = 2^{129 - 127} = 2^2 = \mathbf{4.0\text{f}}$$

Check via floating-point multiplication: $S_A \cdot S_B = 16.0 \times 0.25 = \mathbf{4.0\text{f}}$. E8M0 exponent addition verified!

##### 3. Final Rescaled Output $D_{\text{FP32}}$:
$$D_{\text{FP32}} = C_{\text{FP32}} + (P_{\text{unscaled}} \cdot S_{\text{combined}})$$

$$D_{\text{FP32}} = 10.0\text{f} + (100.0\text{f} \times 4.0\text{f}) = 10.0\text{f} + 400.0\text{f} = \mathbf{410.0\text{f}}$$

$$\mathbf{D_{\text{FP32}} = 410.0\text{f} \quad (\text{32'h43CE0000})}$$

```text
MX BLOCK 0 EXECUTION TRACE SUMMARY

 Un-Scaled Dot Product Sum P_unscaled : (+6.0) + (-6.0) + 100.0 = 100.0f
 Combined Scale S_combined (E8M0)      : S_A * S_B = 16.0 * 0.25 = 4.0f (2^2)
 Rescaled Product Payload             : 100.0f * 4.0f = 400.0f
 Final FP32 Accumulator Result D_FP32 : 10.0f + 400.0f = 410.0f (32'h43CE0000)
```


### Sanity Check and Verification

Let us verify our mathematical, scale-factor, and MX block results against hardware design principles:

1. **E8M0 Exponent Scale Addition Check**:
   * $S_A = 16.0 = 2^4 \implies E_A = 4 + 127 = 131$.
   * $S_B = 0.25 = 2^{-2} \implies E_B = -2 + 127 = 125$.
   * Combined exponent $E_{\text{combined}} = 131 + 125 - 127 = 129 \implies 2^{129 - 127} = 2^2 = 4.0\text{f}$.
   * Scale factor product $16.0 \times 0.25 = 4.0\text{f}$ verified!
2. **Scale Amortization Storage Check**:
   * 32 FP4 elements $= 32 \times 4\text{ bits} = 128\text{ bits} = 16\text{ bytes}$.
   * 1 E8M0 scale $= 8\text{ bits} = 1\text{ byte}$.
   * Total block storage $= 16 + 1 = 17\text{ bytes}$.
   * Bits per parameter $= \frac{17 \times 8}{32} = 4.25\text{ bits/parameter}$. Storage footprint math is $100\%$ exact.
3. **Rescaled Accumulator Result Check**:
   * $D_{\text{FP32}} = 10.0 + (100.0 \times 4.0) = 410.0\text{f}$.
   * Hex representation: $410.0 = 1.6015625 \times 2^8 \implies \text{Exponent } 135_{10} = 10000111_2$, $\text{Mantissa } 0.6015625 = 10011010000000000000000_2 \implies \text{32'h43CE0000}$. Matches exact IEEE-754 representation!

All OCP microscaling bit-field specifications, E8M0 shared exponent addition rules, MX unit 3-stage hardware pipeline traces, and 3.77x HBM read speedup metrics evaluate with 100% mathematical, physical, and logical precision.

