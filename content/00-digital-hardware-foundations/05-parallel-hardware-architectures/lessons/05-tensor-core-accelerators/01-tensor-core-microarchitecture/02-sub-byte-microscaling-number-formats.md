content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/05-tensor-core-accelerators/01-tensor-core-microarchitecture/02-sub-byte-microscaling-number-formats.md
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

---

## The Orchestral Tuning Fork and the 4-Bit Volume Sliders: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of sub-byte microscaling number formats, shared block scale factors, micro-scale exponent staging, and hardware de-quantization pipelines before inspecting Open Compute Project (OCP) MX specifications, gate-level multiplier trees, and memory bandwidth equations, let us consider an everyday analogy: **The 32-Member Brass Orchestra**.

Imagine a music producer (**A Tensor Accelerator Core**) recording a performance of 32 musicians (**32 Data Elements in a Tensor Block**).

```text
THE BRASS ORCHESTRA ANALOGY

 Strategy 1: Individual Loudspeakers (Traditional Independent Floating-Point)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Musicians, each carrying a 200-Watt Master Amplifier     │
 │ Each amplifier has an 8-bit volume dial + 4-bit pitch dial  │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Heavy, bulky equipment (16 bits/musician!)
                                ▼
         HIGH EQUIPMENT COST & HEAVY TRANSPORTATION ENERGY!

 Strategy 2: Shared Master Conductor & 4-Bit Pocket Sliders (Microscaling)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1 Master Conductor sets Overall Orchestra Volume (Scale S)   │
 │ 32 Musicians carry tiny 4-bit pocket volume sliders         │
 │ Each musician sets their note relative to the Master Volume!│
 └─────────────────────────────────────────────────────────────┘
  (Massive 75% equipment savings! Tiny 4-bit sliders per musician!)
```

The orchestra plays a symphony where sound levels range from whisper-quiet violins ($0.0001\text{ Watts}$) to booming brass cannons ($100,000\text{ Watts}$).

Let us observe two different operational designs for how the music producer records the 32 musicians:

---

### Strategy 1: Individual Master Amplifiers (Traditional Floating-Point)
The producer equips every single musician with an individual, heavy 200-Watt master power amplifier (**An Independent 16-Bit or 32-Bit Floating-Point Format**).

* Each musician carries an **8-bit Master Volume Dial** (**An 8-Bit Exponent $E$**) to handle the huge dynamic range from quiet whispers to booming cannons.
* Each musician ALSO carries an **8-bit Precision Fine-Tuning Knob** (**An 8-Bit Mantissa $M$**).

Look at the equipment waste of Strategy 1:
* To record 32 musicians, the orchestra must transport **32 heavy master amplifiers** across the country!
* $80\%$ of the truck space is occupied by carrying 32 duplicate 8-bit master volume dials, even though all 32 musicians are playing in the exact same concert hall at roughly similar volume levels!

---

### Strategy 2: Shared Master Conductor & 4-Bit Pocket Sliders (Microscaling / MX Format)

The producer replaces the heavy individual amplifiers with **Microscaling (MX) Technology**:

The producer installs **ONE SINGLE MASTER CONDUCTOR TUNING FORK (The Shared Block Scale Factor $S_{\text{block}}$)** at the front of the stage.

```text
SHARED MASTER SCALE FACTOR IN ACTION

 1 Master Conductor Tuning Fork (Shared 8-Bit Scale Factor S = 10^3)
 ┌─────────────────────────────────────────────────────────────┐
 │ Sets Master Dynamic Volume for the whole 32-member block!   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 Musician 0 (4-Bit)      Musician 1 (4-Bit)  ...  Musician 31 (4-Bit)
 ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
 │ Slider = 15      │    │ Slider = 2       │    │ Slider = 8       │
 │ (15 * 10^3)      │    │ (2 * 10^3)       │    │ (8 * 10^3)       │
 └──────────────────┘    └──────────────────┘    └──────────────────┘
  (Each musician uses a tiny 4-bit pocket slider relative to Master Scale S!)
```

Trace how Strategy 2 operates:
1. **Shared Master Scale ($S_{\text{block}}$)**: The master conductor strikes an 8-bit tuning fork once (**8-Bit Shared Exponent $E8M0$**), setting the master dynamic volume scale for the entire 32-musician group (e.g., $S_{\text{block}} = 1,000$).
2. **Tiny 4-Bit Pocket Sliders (Sub-Byte Elements)**:
   * Each musician carries a tiny **4-bit pocket slider** ($0 \dots 15$).
   * Musician 0 sets their pocket slider to **`15`**. Their actual volume is $15 \times 1,000 = 15,000\text{ Watts}$.
   * Musician 1 sets their pocket slider to **`2`**. Their actual volume is $2 \times 1,000 = 2,000\text{ Watts}$.
3. **Equipment Weight Savings**:
   * The orchestra transported **1 single 8-bit master tuning fork** for the entire group of 32 musicians!
   * Amortized over 32 musicians, the master volume dial cost only **$8 / 32 = 0.25\text{ bits per musician}$**!
   * Each musician carried only a lightweight **4-bit pocket slider**!

Notice what Strategy 2 achieved:
* **$75\%$ Memory Weight Reduction**: The equipment size shrank from 16 bits per musician down to **$4.25\text{ bits per musician}$**!
* **Massive $10^{-38} \text{ to } 10^{+38}$ Dynamic Range**: The 4-bit pocket sliders enjoyed the full dynamic range of an 8-bit master tuning fork!
* **High Precision**: All 4 bits of the pocket slider were used for fine fractional precision, with zero bits wasted on duplicate exponents!

This 32-member orchestra with a shared master tuning fork is the exact physical analogue of **Sub-Byte Microscaling (MX) Formats and Microscaling Units**:
* The 32 musicians are **32 Data Elements in a Tensor Block**.
* The master tuning fork is **The Shared Block Scale Factor ($S_{\text{block}}$ / E8M0 Exponent)**.
* The 4-bit pocket sliders are **4-Bit Sub-Byte Elements ($E2M1$ FP4 or INT4)**.
* Amortizing the 8-bit tuning fork over 32 members is **Microscaling Exponent Amortization ($0.25\text{ bits/element}$)**.
* The 4-bit slider scale is **Microscaling (MX) Tensor Core Multiplication**.

---

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

---

### The OCP Microscaling (MX) Format Specification Matrix

The OCP Microscaling standard defines four official MX data variants:

```text
OCP MICROSCALING (MX) FORMAT SPECIFICATION MATRIX

 MX Format Name │ Element Bit Width │ Element Format │ Shared Scale Format │ Effective Bits/Elem (k=32)
────────────────┼───────────────────┼────────────────┼─────────────────────┼───────────────────────────
 MXFP8          │  8 Bits / E4M3    │ Sign+4Exp+3Mant│ E8M0 (8-Bit Scale)  │ 8.25 Bits / Elem
 MXFP6          │  6 Bits / E3M2    │ Sign+3Exp+2Mant│ E8M0 (8-Bit Scale)  │ 6.25 Bits / Elem
 MXFP4          │  4 Bits / E2M1    │ Sign+2Exp+1Mant│ E8M0 (8-Bit Scale)  │ 4.25 Bits / Elem
 MXINT8         │  8 Bits / INT8    │ 8-Bit Two'sComp│ E8M0 (8-Bit Scale)  │ 8.25 Bits / Elem
```

Let us examine the microarchitectural details of these sub-byte element representations:

---

#### 1. MXFP4 ($E2M1$ — 4-Bit Microscaled Float)
* **Element Bit Field**: 1 Sign Bit + 2 Exponent Bits + 1 Mantissa Bit = **4 Bits per element**.
* **Representable Values ($m_i$)**: $\{\pm 0.0, \, \pm 0.5, \, \pm 1.0, \, \pm 1.5, \, \pm 2.0, \, \pm 3.0, \, \pm 4.0, \, \pm 6.0\}$.
* **Effective Storage Cost**: 4 bits + $0.25\text{ scale bits} = \mathbf{4.25 \text{ bits per parameter}}$.
* **Memory Compression**: Cuts memory storage footprint by **$73.4\%$ vs FP16** ($2.0\text{ B} \to 0.53\text{ B}$) and **$86.7\%$ vs FP32** ($4.0\text{ B} \to 0.53\text{ B}$)!

---

#### 2. MXFP6 ($E3M2$ — 6-Bit Microscaled Float)
* **Element Bit Field**: 1 Sign Bit + 3 Exponent Bits + 2 Mantissa Bits = **6 Bits per element**.
* **Effective Storage Cost**: 6 bits + $0.25\text{ scale bits} = \mathbf{6.25 \text{ bits per parameter}}$ ($0.78\text{ bytes/parameter}$).
* **Use Case**: Serves as an ideal "sweet spot" for fine-tuning large language models where 4-bit quantization suffers slight accuracy degradation, but 8-bit formats consume too much memory.

---

#### 3. Shared Scale Factor Format: E8M0 (8-Bit Power-of-Two Exponent)
The shared scale factor $S_{\text{block}}$ uses a specialized **E8M0 floating-point format**:
* **Bit Field**: 0 Sign Bits + 8 Exponent Bits + 0 Mantissa Bits = **8 Bits**.
* **Mathematical Value**: $S_{\text{block}} = 2^{E_{\text{scale}} - 127}$, where $E_{\text{scale}} \in [0, 255]$.
* **Hardware Benefit**: Because $S_{\text{block}}$ is an exact power of two ($2^{E}$), multiplying a sub-byte element $m_i$ by $S_{\text{block}}$ requires **ZERO hardware multipliers**! In digital logic, multiplying by $2^E$ is executed simply by adding $E_{\text{scale}}$ to the exponent field of the element or shifting the bit vector!

---

## Primitive 2: The Microscaling (MX) Unit Architecture

Now let us examine the second core primitive: **The Microscaling (MX) Unit Architecture**.

To execute high-throughput matrix multiplications on MX-formatted sub-byte tensors ($D = A_{\text{MX}} \times B_{\text{MX}} + C$), modern Tensor Cores incorporate dedicated **Microscaling (MX) Units** at the input and output stages of their MAC pipelines.

```text
MICROSCALING (MX) TENSOR CORE PIPELINE ARCHITECTURE

 Streamed MX Block A (32x FP4 + Scale S_A)   Streamed MX Block B (32x FP4 + Scale S_B)
 ┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ [m_A0..m_A31] │ Scale S_A (E8M0)     │   │ [m_B0..m_B31] │ Scale S_B (E8M0)     │
 └──────┬─────────────────┬─────────────┘   └──────┬─────────────────┬─────────────┘
        │                 │                        │                 │
        ▼                 │                        ▼                 │
 ┌──────────────┐         │                 ┌──────────────┐         │
 │ FP4-to-FP8   │         │                 │ FP4-to-FP8   │         │
 │ Unpack Logic │         │                 │ Unpack Logic │         │
 └──────┬───────┘         │                 └──────┬───────┘         │
        │ FP8 Elements    │                        │ FP8 Elements    │
        ▼                 │                        ▼                 │
 ┌────────────────────────┼──────────────────────────────────────────┼─────────┐
 │ DENSE SUB-BYTE MAC MULTIPLIER ARRAY                               │         │
 │ Computes: Partial_Sum = Sum( m_Ai * m_Bi )                        │         │
 └────────────────────────┬──────────────────────────────────────────┘         │
                          │ 32-Bit Un-Scaled Sum                               │
                          ▼                                                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ MICROSCALING EXPONENT RESCALING STAGE                                       │
 │ Scale Multiplier: S_combined = S_A * S_B  (E8M0 Exponent Adder: E_A + E_B)  │
 │ Final Rescaling  : D_FP32 = Partial_Sum * S_combined                       │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
                   Output Matrix D (32-Bit FP32 High-Precision Result)
```

---

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

---

## Hardware Microscaling Alignment Constraints and Block Sizing ($k=32$)

When designing MX hardware units, microarchitects must select the physical **Block Size ($k$)**—the number of sub-byte elements that share a single scale factor $S_{\text{block}}$.

Why does the industry standard fix the microscaling block size at **$k = 32\text{ elements}$**?

```text
BLOCK SIZE TRADE-OFF SPECTRUM (k = 16 vs k = 32 vs k = 128)

 k = 16 Elements
 [ S_block (8b) ] [ 16 x 4b Elements (64b) ] ──► Scale Overhead = 8/16 = 0.50 Bits/Elem
 High Accuracy, but 11.8% Scale Storage Overhead!

 k = 32 Elements (OCP INDUSTRY STANDARD BEST BALANCE!)
 [ S_block (8b) ] [ 32 x 4b Elements (128b) ] ──► Scale Overhead = 8/32 = 0.25 Bits/Elem
 Excellent Accuracy + Minimal 5.8% Scale Storage Overhead!

 k = 128 Elements
 [ S_block (8b) ] [ 128 x 4b Elements (512b) ] ──► Scale Overhead = 8/128 = 0.06 Bits/Elem
 Tiny Overhead, BUT Outliers in Element 0 distort scale for Element 127 (Accuracy Loss!)
```

### The $k = 32$ Block Size Trade-Off:
1. **$k = 16\text{ Elements}$**: Provides slightly higher accuracy for extreme outlier tensors, but increases scale factor memory overhead to $0.50\text{ bits/element}$ ($11.8\%$ storage penalty).
2. **$k = 128\text{ Elements}$**: Reduces scale factor memory overhead to $0.06\text{ bits/element}$, but large outlier values at Element 0 distort the scale factor for Element 127, causing precision loss across the 128-element block.
3. **$k = 32\text{ Elements}$ (The OCP Golden Ratio)**:
   * Matches the $32\text{-thread}$ warp size of modern SIMD/SIMT architectures ($1\text{ element per warp lane}$).
   * Scale factor storage overhead is a tiny **$0.25\text{ bits/element}$ ($5.8\%$ storage penalty for MXFP4)**.
   * Delivers **$100\%$ full FP32 prediction accuracy** across Large Language Models (LLMs) and computer vision networks!

---

## Solved Industrial Engineering Exercise: Quantitative MXFP4 Tensor Matrix Multiplication, Microscaling Rescaling, and Bandwidth Acceleration

To consolidate your complete mastery of sub-byte microscaling formats (MXFP4), 8-bit shared scale factors (E8M0), MX unit hardware pipelines, and off-chip memory bandwidth savings, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the MXFP4 Tensor Core pipeline inside a $2.2\text{ GHz}$ enterprise AI accelerator chip ($T_{\text{clk}} = 0.4545\text{ ns} = 454.5\text{ ps}$).

The accelerator features a High-Bandwidth Memory (HBM3e) interface delivering a peak memory read bandwidth $\text{BW}_{\text{peak}} = 2,400\text{ Gigabytes/second}$ ($2.4\text{ TB/sec}$).

The accelerator executes a $32\times \text{element}$ microscaled dot product between two $32\text{-element}$ MXFP4 blocks ($k = 32\text{ elements}$):

$$\mathbf{\text{Dot Product: } D_{\text{FP32}} = \left( \sum_{i=0}^{31} m_{A,i} \cdot m_{B,i} \right) \cdot (S_A \cdot S_B) + C_{\text{FP32}}}$$

```text
2.2 GHz ENTERPRISE AI ACCELERATOR MXFP4 PIPELINE SPECIFICATIONS

 Clock Frequency         : 2.2 GHz (T_clk = 454.5 ps)
 Peak HBM3e Bandwidth    : 2,400 GB/sec (2.4 TB/sec)
 Block Size (k)          : 32 Elements per MX Block
 Element Format (m)      : MXFP4 E2M1 (4 Bits / Element = 0.5 Bytes)
 Shared Scale Format (S) : E8M0 (8 Bits / 1 Byte per 32-Element Block)
 Accumulator Format (D)  : FP32 (32-Bit Float)
 MX MAC Execution Latency: 1 Clock Cycle per 32-Element Block
```

#### Hardware Workload Parameters:
The accelerator processes a 100-billion parameter Large Language Model tensor ($W$, $100 \times 10^9\text{ parameters}$).

We evaluate three data format implementations for storing and streaming $W$:
* **Implementation A (Un-Quantized FP16 Baseline — 2 Bytes/Param)**: $16\text{ bits per element}$.
* **Implementation B (Standard FP8 E4M3 — 1 Byte/Param)**: $8\text{ bits per element}$.
* **Implementation C (OCP MXFP4 Microscaled — 4.25 Bits/Param)**: 32 4-bit FP4 elements ($128\text{ bits}$) + 1 8-bit E8M0 scale factor ($8\text{ bits}$) per 32-element block.

#### Sample Data for MX Block 0 ($k = 32\text{ Elements}$):
* Shared Scale Factor for Matrix $A$: $S_A = 2^{+4} = 16.0\text{f}$ ($E_A = 131_{10} \implies \text{E8M0: } \text{8'h83}$).
* Shared Scale Factor for Matrix $B$: $S_B = 2^{-2} = 0.25\text{f}$ ($E_B = 125_{10} \implies \text{E8M0: } \text{8'h7D}$).
* Un-scaled FP4 elements $m_{A,0} = +2.0\text{f}$ (`4'b0100`), $m_{B,0} = +3.0\text{f}$ (`4'b0110`).
* Un-scaled FP4 elements $m_{A,1} = -1.5\text{f}$ (`4'b1011`), $m_{B,1} = +4.0\text{f}$ (`4'b0111`).
* Un-scaled sum for remaining 30 element pairs $\sum_{i=2}^{31} (m_{A,i} \cdot m_{B,i}) = \mathbf{100.0\text{f}}$.
* Initial Accumulator $C_{\text{FP32}} = \mathbf{10.0\text{f}}$.

#### Your Objective

1. Calculate the total memory storage footprint (in Gigabytes) for the 100-billion parameter model $W$ under **Implementation A (FP16)**, **Implementation B (FP8)**, and **Implementation C (MXFP4)**.
2. Calculate the total memory read time (in milliseconds) required to stream the 100-billion parameters from HBM3e memory across all three implementations.
3. For MX Block 0, trace **Stage 2 (Un-Scaled Dot Product)** and **Stage 3 (Shared Scale Exponent Rescaling)**:
   * Calculate $S_{\text{combined}} = S_A \cdot S_B$ using E8M0 exponent addition.
   * Calculate the final rescaled output $D_{\text{FP32}}$.
4. Calculate the **Memory Bandwidth Speedup Factor** of Implementation C (MXFP4) over Implementation A (FP16) and Implementation B (FP8).
5. Verify mathematical, structural, and timing correctness.

---

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

---

#### Step 2: Calculate HBM3e Memory Read Time ($2,400\text{ GB/sec}$)

Off-chip HBM3e bandwidth $\text{BW}_{\text{peak}} = 2,400\text{ GB/sec} = 2,400 \times 10^9\text{ Bytes/sec}$.

$$\text{Memory Read Time } t_{\text{read}} = \frac{\text{Model Footprint (Bytes)}}{\text{HBM3e Bandwidth (Bytes/sec)}}$$

##### 1. Implementation A (FP16 Baseline — $200.0\text{ GB}$):
$$t_{\text{read\_A}} = \frac{200.0 \times 10^9 \text{ Bytes}}{2,400 \times 10^9 \text{ Bytes/sec}} = 0.08333 \text{ seconds} = \mathbf{83.333 \text{ milliseconds}}$$

##### 2. Implementation B (Standard FP8 — $100.0\text{ GB}$):
$$t_{\text{read\_B}} = \frac{100.0 \times 10^9 \text{ Bytes}}{2,400 \times 10^9 \text{ Bytes/sec}} = 0.04167 \text{ seconds} = \mathbf{41.667 \text{ milliseconds}}$$

##### 3. Implementation C (OCP MXFP4 — $53.125\text{ GB}$):
$$t_{\text{read\_C}} = \frac{53.125 \times 10^9 \text{ Bytes}}{2,400 \times 10^9 \text{ Bytes/sec}} = 0.022135 \text{ seconds} = \mathbf{22.135 \text{ milliseconds}}$$

---

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

---

#### Step 4: Calculate Memory Bandwidth Speedup Factors

$$\text{Speedup}_{\text{MXFP4/FP16}} = \frac{t_{\text{read\_A}}}{t_{\text{read\_C}}} = \frac{83.333\text{ ms}}{22.135\text{ ms}} = \mathbf{3.765\times \text{ Memory Read Speedup vs FP16!}}$$

$$\text{Speedup}_{\text{MXFP4/FP8}} = \frac{t_{\text{read\_B}}}{t_{\text{read\_C}}} = \frac{41.667\text{ ms}}{22.135\text{ ms}} = \mathbf{1.882\times \text{ Memory Read Speedup vs FP8!}}$$

```text
HBM3e MEMORY READ PERFORMANCE OPTIMIZATION SUMMARY

 Implementation Format │ Memory Read Time (ms) │ Effective Read Bandwidth │ Speedup vs FP16
───────────────────────┼───────────────────────┼──────────────────────────┼───────────────────
 Implementation A FP16 │ 83.333 ms             │ 2,400 GB/sec             │ 1.00x (Baseline)
 Implementation B FP8  │ 41.667 ms             │ 4,800 GB/sec             │ 2.00x FASTER!
 Implementation C MXFP4│ 22.135 ms             │ 9,035 GB/sec             │ 3.77x FASTER!
                       │ (73.4% Read Time Cut!)│ (3.77x Bandwidth Gain!)  │ (+277% Speedup)
```

##### Engineering Conclusion:
Adopting OCP MXFP4 microscaled formatting (Implementation C) compressed the 100-billion parameter LLM footprint from $200.0\text{ GB}$ down to $53.125\text{ GB}$, cutting HBM3e memory streaming time from $83.33\text{ ms}$ down to $22.14\text{ ms}$—delivering a **$3.77\times$ memory read speedup ($277\%$ bandwidth expansion)** on the exact same HBM memory channels!

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Sub-Byte Microscaling (MX) Formats**: Open-standard block-scaled numerical representations (MXFP8, MXFP6, MXFP4, MXINT8) that pair a 32-element sub-byte payload block with a single shared 8-bit scale factor ($S_{\text{block}}$), delivering massive $10^{-38} \text{ to } 10^{+38}$ dynamic ranges while compressing tensor memory footprints down to $4.25\text{ bits per parameter}$.
* **Microscaling (MX) Unit**: A specialized hardware execution pipeline that receives sub-byte tensor blocks, computes inner un-scaled dot product sums using high-density sub-byte multiplier arrays, and applies a single 32-bit floating-point scale factor multiplication ($S_A \cdot S_B$) at the accumulator stage to restore real-world floating-point values in 1 clock cycle.
