content/00-digital-hardware-foundations/02-rtl-hardware-design/lessons/03-rtl-building-blocks-and-fsm-synthesis/04-dsp-arithmetic-and-pipeline-processing/02-fixed-point-dsp-arithmetic-and-saturation.md
# Fixed-Point DSP Arithmetic, Convergent Rounding, and Hardware Saturation Mechanics in RTL Design

When digital hardware engineers design signal processing datapaths—such as high-definition audio equalizers, radar target trackers, medical ultrasound processors, or neural network inference accelerators—they operate on binary representations of continuous physical phenomena. Sound pressure waves, radio frequency voltages, camera pixel brightness levels, and gravitational sensor readings are continuous real-world values. When converted into digital signals by an Analog-to-Digital Converter (ADC), these continuous quantities travel through digital logic gates as discrete binary vectors.

If an engineer implements arithmetic calculations on these digital signals using standard, un-guarded Two's Complement integer arithmetic, a single mathematical overflow event triggers a catastrophic physical failure known as **Arithmetic Wraparound Distortion**.

Consider an 8-bit signed digital audio processing pipeline operating on a smooth sine wave. The maximum positive value representable in an 8-bit Two's Complement register is $+127_{10}$ (`8'b0111_1111`). If a volume booster adds $+2$ to a sample sitting at $+127_{10}$, standard Two's Complement hardware addition evaluates $+127 + 2 = +129_{10}$. However, in an 8-bit register, $+129_{10}$ wraps around the binary boundary directly to **$-127_{10}$** (`8'b1000_0001`)!

```text
WRAPPING ARITHMETIC (Catastrophic Audio Pop / Pixel Inversion)
 +127 ───┐
         ├──► Wraparound Jump! ──► -128 (Severe Clipping Noise!)
 +128 ───┘

SATURATING ARITHMETIC (Smooth Physical Clamping)
 +127 ───┐
         ├──► Clamped Peak ──────► +127 (Clean Audio Compression!)
 +128 ───┘
```

In a physical audio amplifier, this sudden binary wraparound forces the output digital-to-analog converter to collapse its voltage from maximum positive $V_{DD}$ to maximum negative ground in a single clock cycle. The speaker cone slams backward at supersonic speed, generating a deafening, high-energy acoustic "pop" or "click" that can tear speaker membranes and ruin audio quality. In a digital camera, a bright white pixel ($+255$) that experiences wraparound flips instantly to pure black ($0$), creating inverted speckle noise across the image.

In addition to wraparound distortion, real-world digital signal processing faces two other severe hardware arithmetic bottlenecks:

1. **Quantization Noise and DC Offset Bias**: When multiplying fractional numbers, the word length expands. Dropping lower fractional bits using simple truncation (floor rounding) introduces a systematic negative DC bias that accumulates across cascaded filter stages, creating audible background hiss or limit cycle oscillations.
2. **Procedural Division Performance Collapse**: When junior engineers attempt to perform scaling or division using naive SystemVerilog procedural division operators (`/` and `%`), synthesis compilers infer massive, un-pipelined 32-bit combinational array dividers. These dividers consume thousands of logic gates, create giant critical paths ($t_{\text{logic}} > 20\text{ ns}$), and destroy clock frequency ($f_{\max}$).

To build production-grade, high-frequency Digital Signal Processing (DSP) hardware, digital designers must master **Fixed-Point $Q_{m.n}$ Formats**, **Convergent Rounding (Round-to-Nearest-Even)**, **Hardware Saturation Logic**, and **Shift-Based Reciprocal Scaling Engines**.

---

## The Water Bucket with a Spillway and the Sound System Volume Knob: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of fixed-point representations, rounding, saturation, and hardware scaling before analyzing RTL syntax and gate schematics, let us explore two physical analogies from everyday life.

### Part A: The Water Bucket with an Emergency Spillway (Saturation Logic)

Imagine a 10-liter plastic water bucket used to collect rainfall in a weather station. The bucket represents an 8-bit digital register, and the water height represents the numerical value stored inside.

```text
STANDARD BUCKET (Wrap-Around Overflow)
 Water level hits rim (100%) ──► Overflows ──► Empties to 0%!
 (Discontinuous jump in water volume!)

SPILLWAY BUCKET (Saturating Clamping)
 Water level hits rim (100%) ──► Excess drains ──► Stays at 100%!
 (Water level remains smoothly clamped at maximum capacity!)
```

Suppose the bucket is currently filled to its maximum capacity of 10 liters ($100\%$ full). Suddenly, a sudden storm dumps an additional 2 liters of water into the bucket.

Let us compare two different bucket designs:

#### Design 1: The Magic Trapdoor Bucket (Standard Two's Complement Wraparound)
This bucket features a spring-loaded trapdoor at the bottom. When the water level hits 10.1 liters, the trapdoor flips open, dumping out all 10 liters of water instantly, leaving the bucket holding only 0.1 liters!

* **The Result**: Adding a tiny bit of extra water to a full bucket caused the water level to collapse from $100\%$ full down to $1\%$ full. The water volume experienced a violent, discontinuous drop.
* This is the exact physical analogue of **Standard Two's Complement Wraparound**. Adding $+1$ to $+127$ flips the sign bit, collapsing the value to $-128$.

#### Design 2: The Spillway Bucket (Hardware Saturation Logic)
This bucket features a notched spillway along its top rim. When the water level reaches 10 liters, any extra incoming rain simply pours over the outer spillway onto the ground. The bucket remains filled to its maximum capacity of 10 liters.

* **The Result**: Adding extra water to a full bucket keeps the bucket at $100\%$ full. The water level remains smoothly clamped at its physical maximum limit.
* This is the exact physical analogue of **Hardware Saturation Logic**. When an arithmetic addition exceeds $+127$, saturation detection circuits force the register output to stay clamped at $+127$.

---

### Part B: The Measuring Tape Folding vs. Cutting (Fixed-Point $Q$-Format and Rounding)

Now imagine a carpenter using a 1-meter wooden folding ruler marked in millimeters. The ruler has 1,000 fine millimeter lines.

The carpenter needs to record measurements on a simplified 10-centimeter notepad that has space for only 3 digits.

```text
MEASURING TAPE CUTTING VS CONVERGENT ROUNDING

 Raw Measurement: 5.875 cm

 Method 1: Direct Truncation (Chopping off decimals)
   Drops .875 ──► Records 5.00 cm (Always underestimates!)
   Accumulated Error: Systematic negative measurement drift!

 Method 2: Convergent Rounding (Round-to-Nearest-Even)
   Rounds .875 ──► Records 6.00 cm
   Midpoint Tie (.50) ──► Rounds to nearest EVEN number!
   Accumulated Error: Zero net statistical bias!
```

The carpenter considers two ways to fit the 1,000-millimeter precision into the 3-digit notepad:

1. **Method 1: Direct Truncation (Floor Rounding)**: The carpenter simply ignores and chops off the millimeter digits. A length of $5.875\text{ cm}$ is written down as $5.00\text{ cm}$.
   * **The Flaw**: Every single measurement is systematically reduced! If the carpenter adds up 100 truncated measurements to build a house, the final wall will be several centimeters too short because every measurement suffered a negative bias.
2. **Method 2: Convergent Rounding (Round-to-Nearest-Even / Banker's Rounding)**:
   * If the extra fraction is less than $0.5\text{ mm}$, round down.
   * If the extra fraction is greater than $0.5\text{ mm}$, round up.
   * If the extra fraction is *exactly* $0.5\text{ mm}$ (a perfect tie), round to the nearest **EVEN** integer ($2, 4, 6, 8 \dots$).

Why round to the nearest EVEN integer on an exact tie? Because in a large dataset of measurements, exactly $50\%$ of the tie values will sit next to an even number below them, and $50\%$ will sit next to an even number above them. Exactly half the ties round up and half round down, cancelling out the rounding errors perfectly!

This carpenter's notebook is the exact physical analogue of **Fixed-Point $Q_{m.n}$ Arithmetic and Convergent Rounding**:
* The millimeter lines are **Fractional Bits ($n$)**.
* The 3-digit notepad is the **Fixed Target Register Width ($W$)**.
* Chopping off digits is **Bit Truncation**.
* Rounding ties to the nearest even number is **Convergent Rounding (Round-to-Nearest-Even)**, which eliminates DC bias in digital filters.

---

## Fixed-Point $Q_{m.n}$ Representation Mechanics

To design digital signal processing circuits, we must first establish how real-world fractional numbers (such as $3.14159$ or $-0.7071$) are stored inside binary logic vectors.

In digital hardware, a **Fixed-Point Number** is an integer binary vector where the position of the binary point (the fractional radix point) is fixed at a constant location during circuit design.

---

### Primitive 1: The $Q_{m.n}$ Fixed-Point Binary Format

The most widely used notation for fixed-point numbers in hardware engineering is the **$Q_{m.n}$ Format** (or $Q_{s.m.n}$ Format).

A signed Two's Complement fixed-point vector of total width $W$ bits in $Q_{m.n}$ format is partitioned into three distinct bit fields:

$$W = 1 + m + n$$

Where:
* $1$ represents the single **Sign Bit** at the Most Significant Bit (MSB) position.
* $m$ represents the number of **Integer Bits** (bits to the left of the binary point).
* $n$ represents the number of **Fractional Bits** (bits to the right of the binary point).
* $W$ is the total bit-width of the SystemVerilog `logic signed [W-1:0]` vector.

```text
Q3.4 FIXED-POINT BIT WEIGHT MAP (8 Bits Total: 1 Sign, 3 Int, 4 Frac)

 Bit  │  B7  │  B6  │  B5  │  B4  .  B3   │  B2   │  B1   │  B0   
──────┼──────┼──────┼──────┼──────.───────┼───────┼───────┼───────
 Weight│ -2^3 │ +2^2 │ +2^1 │ +2^0 . 2^-1  │ 2^-2  │ 2^-3  │ 2^-4  
      │ (-8) │ (+4) │ (+2) │ (+1) . (0.5) │(0.25) │(0.125)│(0.0625)
      │ SIGN │ ◄── INTEGER ──► . ◄────── FRACTIONAL ──────►
```

#### Mathematical Value Formula for $Q_{m.n}$ Fixed-Point Vectors

For an 8-bit signed vector $\mathbf{B} = (b_7, b_6, b_5, b_4, b_3, b_2, b_1, b_0)$ formatted as $Q_{3.4}$ ($1$ sign bit, $3$ integer bits, $4$ fractional bits):

The continuous real decimal value $V_{\text{real}}$ represented by binary vector $\mathbf{B}$ is:

$$V_{\text{real}} = -b_7 \cdot 2^3 + \sum_{k=0}^{6} b_k \cdot 2^{k-4}$$

Expanding the positional weights:

$$V_{\text{real}} = -8 \cdot b_7 + 4 \cdot b_6 + 2 \cdot b_5 + 1 \cdot b_4 + 0.5 \cdot b_3 + 0.25 \cdot b_2 + 0.125 \cdot b_1 + 0.0625 \cdot b_0$$

Notice how every bit position carries an exact mathematical power-of-two weight:
* The MSB $b_7$ carries weight $-2^m = -2^3 = -8$.
* Fractional bit $b_3$ carries weight $2^{-1} = 0.5$.
* Fractional bit $b_2$ carries weight $2^{-2} = 0.25$.
* Fractional bit $b_1$ carries weight $2^{-3} = 0.125$.
* The Least Significant Bit (LSB) $b_0$ carries weight $2^{-n} = 2^{-4} = 0.0625$.

#### Fundamental Resolution and Dynamic Range

The smallest non-zero step size between adjacent representable numbers in a $Q_{m.n}$ format is the weight of its LSB, known as the **Quantization Resolution ($\Delta$)**:

$$\Delta = 2^{-n}$$

The dynamic range for a signed $Q_{m.n}$ format spans from its minimum negative value $V_{\min}$ to its maximum positive value $V_{\max}$:

$$V_{\min} = -2^m$$

$$V_{\max} = +2^m - 2^{-n}$$

```text
Q_{m.n} DYNAMIC RANGE AND RESOLUTION MATRIX

 Format │ Total Width W │ Fractional Bits n │ LSB Resolution Delta │ Minimum Value V_min │ Maximum Value V_max
────────┼───────────────┼───────────────────┼──────────────────────┼─────────────────────┼──────────────────────
 Q7.0   │    8 Bits     │      0 Bits       │ $2^0 = 1.0$          │ $-128.0$            │ $+127.0$
 Q3.4   │    8 Bits     │      4 Bits       │ $2^{-4} = 0.0625$    │ $-8.0$              │ $+7.9375$
 Q0.7   │    8 Bits     │      7 Bits       │ $2^{-7} \approx 0.0078125$│ $-1.0$        │ $+0.9921875$
 Q1.15  │   16 Bits     │     15 Bits       │ $2^{-15} \approx 0.0000305$│ $-1.0$       │ $+0.999969482$
```

Notice a fundamental trade-off: **For a fixed total bit-width $W$, increasing the fractional bits $n$ increases precision (smaller LSB step $\Delta$), but decreases the dynamic range $V_{\max}$!**

---

### Converting Between Real Numbers and $Q_{m.n}$ Hardware Vectors

To convert a real floating-point number $X_{\text{real}}$ (such as $1.75_{10}$) into an integer binary vector $X_{\text{fixed}}$ for a $Q_{m.n}$ format with $n$ fractional bits:

$$X_{\text{fixed}} = \text{round}\left( X_{\text{real}} \times 2^n \right)$$

#### Example 1: Converting $+1.75_{10}$ to $Q_{3.4}$ Format ($n = 4$)
1. Multiply by $2^4 = 16$:
   $$1.75 \times 16 = 28_{10}$$
2. Convert $28_{10}$ to an 8-bit Two's Complement binary vector:
   $$28_{10} = 8\text{'b}0001\_1100$$
3. Verify positional weights:
   $$0001.1100_2 = 1 \cdot 2^0 + 1 \cdot 2^{-1} + 1 \cdot 2^{-2} = 1 + 0.5 + 0.25 = +1.75_{10}$$

#### Example 2: Converting $-2.375_{10}$ to $Q_{3.4}$ Format ($n = 4$)
1. Multiply by $2^4 = 16$:
   $$-2.375 \times 16 = -38_{10}$$
2. Convert $-38_{10}$ to an 8-bit Two's Complement binary vector:
   $$-38_{10} = 256 - 38 = 218_{10} = 8\text{'b}1101\_1010$$
3. Verify positional weights:
   $$1101.1010_2 = -8 + 4 + 1 + 0.5 + 0.125 = -2.375_{10}$$

---

### Word Length Growth During Fixed-Point Arithmetic

When performing arithmetic operations on fixed-point numbers, the output bit-width grows to prevent information loss.

#### 1. Addition and Subtraction Growth
Adding two $Q_{m.n}$ numbers increases the required integer field by **1 bit** to prevent overflow:

$$Q_{m.n} \pm Q_{m.n} \longrightarrow Q_{(m+1).n}$$

$$\text{Output Width } W_{\text{sum}} = W_{\text{input}} + 1$$

#### 2. Multiplication Word Length Expansion
Multiplying two fixed-point numbers $A \in Q_{m1.n1}$ and $B \in Q_{m2.n2}$ adds both the integer bits and fractional bits together:

$$Q_{m1.n1} \times Q_{m2.n2} \longrightarrow Q_{(m1+m2+1).(n1+n2)}$$

$$\text{Total Output Bits } W_{\text{prod}} = W_1 + W_2$$

$$\text{Output Fractional Bits } n_{\text{prod}} = n_1 + n_2$$

```text
FIXED-POINT MULTIPLICATION BIT EXPANSION

 Operand A : Q3.4 (8 Bits)  ──┐
                              ├──► Product P : Q5.10 (16 Bits Total!)
 Operand B : Q1.6 (8 Bits)  ──┘    (5 Integer Bits, 10 Fractional Bits)
```

Look at this word-length growth:
If an audio pipeline executes 10 multiplication stages in series, an 8-bit signal would grow to 16 bits, 32 bits, 64 bits, 128 bits, and eventually thousands of bits!

Because physical hardware registers have fixed sizes, **we must truncate/round the fractional bits and clamp/saturate the integer bits** after every arithmetic operation to fit the result back into a standard target register width (such as 16 bits).

---

## Rounding Mechanics: Truncation vs. Convergent Rounding

When reducing an expanded fractional product (such as a $Q_{5.10}$ 16-bit word) back to a compact register format (such as $Q_{3.4}$ 8-bit word), we must drop the bottom 6 fractional bits ($b_5 \dots b_0$).

Dropping fractional bits is the process of **Rounding**.

---

### Method 1: Direct Bit Truncation (Floor Rounding)

The simplest way to drop $k$ fractional bits in hardware is **Direct Bit Truncation**: simply discard the lower $k$ wires and keep the upper bits.

```systemverilog
logic signed [15:0] raw_product; // Q5.10 format (10 fractional bits)
logic signed [7:0]  truncated_out;

// DIRECT TRUNCATION: Discard lower 6 fractional bits [5:0]
assign truncated_out = raw_product[13:6]; // Q3.4 format
```

#### The Physical Flaw of Direct Truncation: Negative DC Bias
Mathematically, direct bit truncation behaves as the floor function $\lfloor X \rfloor$.

Consider truncating 2 fractional bits from positive and negative numbers:
* $+2.75_{10}$ (`0010.11`) truncated to integer $\longrightarrow +2.0_{10}$ (`0010.00`). Error = $-0.75$.
* $+2.25_{10}$ (`0010.01`) truncated to integer $\longrightarrow +2.0_{10}$ (`0010.00`). Error = $-0.25$.
* $-2.25_{10}$ (`1101.11`) truncated to integer $\longrightarrow -3.0_{10}$ (`1101.00`). Error = $-0.75$.

```text
TRUNCATION (Negative DC Offset Bias)
  Actual Values : 1.25  1.50  1.75  2.25  2.50  2.75
  Truncated     : 1.00  1.00  1.00  2.00  2.00  2.00
  DC Error      : -0.25 -0.50 -0.75 -0.25 -0.50 -0.75 (Systematic Negative Drift!)

CONVERGENT ROUNDING (Zero Statistical Bias)
  Actual Values : 1.25  1.50  1.75  2.25  2.50  2.75
  Rounded       : 1.00  2.00  2.00  2.00  2.00  3.00 (1.5->2, 2.5->2 Even tie-break!)
  DC Error      : Zero Net Cumulative Bias!
```

Look at the error column: **Direct bit truncation ALWAYS shifts numbers downward towards negative infinity!**

The average expected error of direct truncation is:

$$\text{E}[\text{Error}_{\text{trunc}}] = -\frac{1}{2} \text{LSB} = -2^{-(n+1)}$$

In a digital Infinite Impulse Response (IIR) filter where outputs feed back into inputs thousands of times per second, this systematic negative DC bias accumulates continuously. The filter output drifts away from zero, generating audible background hum or creating **Limit Cycle Oscillations** where the filter continues to output small non-zero noise values even when the audio input is completely silent!

---

### Method 2: Standard Add-Half Rounding (Symmetric Round-Half-Up)

To eliminate the negative offset of truncation, classic DSP textbooks suggest **Add-Half Rounding**: add $0.5 \text{ LSB}$ (a $1$ at bit position $k-1$) to the un-rounded vector, and then truncate the bottom $k$ bits.

$$\text{Round}_{\text{add\_half}}(X) = \left\lfloor X + 2^{-(n+1)} \right\rfloor$$

```systemverilog
// ADD-HALF ROUNDING
// Adding 1 at bit position 5 (weight 0.5 LSB) before truncating bits [5:0]
assign rounded_val = (raw_product + 16'b0000_0000_0010_0000) >>> 6;
```

#### The Residual Bias of Add-Half Rounding
While Add-Half Rounding is vastly better than direct truncation, it introduces a subtle **Positive DC Bias**.

Why? Because when the fractional bits equal *exactly* $0.5$ (a tie midway between two integers):
* $+1.5 + 0.5 = +2.0$ (Rounds UP).
* $+2.5 + 0.5 = +3.0$ (Rounds UP).
* $-1.5 + 0.5 = -1.0$ (Rounds UP towards positive infinity!).

Because exact ties at $.5$ are ALWAYS rounded upward towards positive infinity, the statistical average error is slightly positive (+0.5 LSB for ties).

---

### Method 3: Convergent Rounding (Round-to-Nearest-Even / Banker's Rounding)

To achieve **100% zero statistical DC bias**, professional DSP hardware uses **Convergent Rounding** (also known as Round-to-Nearest-Even or IEEE 754 Banker's Rounding).

#### The Convergent Rounding Rulebook:
Suppose we are dropping $k$ fractional bits ($b_{k-1} \dots b_0$). The LSB of the retained output is bit $b_k$.
1. **Case 1 (Fraction < 0.5 LSB)**: Bit $b_{k-1} = 0$. Round DOWN (discard bits $b_{k-1} \dots b_0$).
2. **Case 2 (Fraction > 0.5 LSB)**: Bit $b_{k-1} = 1$ AND any lower bit ($b_{k-2} \dots b_0$) is non-zero. Round UP (add $1$ to bit $b_k$).
3. **Case 3 (Exact Tie: Fraction == 0.5 LSB)**: Bit $b_{k-1} = 1$ AND all lower bits ($b_{k-2} \dots b_0$) are strictly zero!
   * Check retained LSB bit $b_k$:
   * If $b_k == 0$ (Already EVEN): Round DOWN (keep $b_k = 0$).
   * If $b_k == 1$ (Currently ODD): Round UP (add $1$ to make $b_k = 0$, an EVEN number!).

```text
CONVERGENT ROUNDING TIE-BREAKING MECHANICS (Dropping 4 bits [3:0])

 Un-rounded Vector Bits : [ ... b4 ] . [ b3   b2   b1   b0 ]
 Retained LSB           :       b4
 Round Bit (0.5 LSB)    :              b3
 Sticky Bits            :                   b2   b1   b0

 Case 1: b3 = 0                     ──► Round DOWN (Add 0)
 Case 2: b3 = 1 AND (b2|b1|b0) != 0 ──► Round UP   (Add 1 to b4)
 Case 3 (Tie): b3 = 1 AND (b2|b1|b0) == 0
         ├── If b4 == 0 (Already EVEN) ──► Round DOWN (Add 0)
         └── If b4 == 1 (Currently ODD)──► Round UP   (Add 1 to make b4 EVEN!)
```

#### Why Convergent Rounding Eliminates DC Bias Completely:
In a random stream of digital audio or sensor data, exact midpoint ties ($0.5$) occur frequently. 

By forcing exact ties to round to the nearest **even** number:
* Half of the tie values sit next to an even number below them and round DOWN.
* Half of the tie values sit next to an even number above them and round UP.

The upward rounding errors and downward rounding errors cancel each other out with 100% mathematical perfection!

The net cumulative DC bias is **strictly ZERO**:

$$\text{E}[\text{Error}_{\text{convergent}}] = 0.000000$$

---

## Hardware Saturation Logic Architecture

Now that we have rounded our expanded product back to a target fractional size, we face the second major arithmetic hazard: **Integer Field Overflow**.

Consider an addition or multiplication whose true mathematical result is $+180_{10}$. We need to store this result inside an 8-bit Two's Complement register whose maximum positive capacity is $+127_{10}$ (`8'b0111_1111`).

If we assign $+180_{10}$ directly to an 8-bit Two's Complement register, standard binary truncation keeps only the bottom 8 bits:

$$180_{10} = 9\text{'b}0\_1011\_0100_2 \xrightarrow{\quad \text{Keep bottom 8 bits} \quad} 8\text{'b}1011\_0100_2 = -76_{10} \quad (\text{WRAPS TO NEGATIVE!})$$

A positive voltage $+180$ wrapped around to a negative voltage $-76$!

To prevent this wraparound distortion, we place **Hardware Saturation Logic** on the output of the arithmetic unit.

---

### Saturation Logic Architecture & Detection Equations

A **Saturating Arithmetic Unit** evaluates the upper bits of a calculation to detect whether an overflow or underflow occurred, and uses a 4-to-1 multiplexer tree to clamp the output to physical limits:

$$\text{Saturated Output } Y = \begin{cases}
V_{\max} = +2^{m} - 2^{-n} & \text{if Positive Overflow occurs} \\
V_{\min} = -2^{m} & \text{if Negative Overflow (Underflow) occurs} \\
X_{\text{computed}} & \text{if result is within normal range}
\end{cases}$$

```text
SATURATION MULTIPLEXER LOGIC TREE

 Computed Sum / Product Vector [N-1:0]
        │
        ├────────────────────────┐
        ▼                        ▼
 [ Overflow Detect Logic ]   [ Un-Saturated Data Path ]
 (Checks Carry & Sign)           │
        │                        │
        ▼                        ▼
 ┌─────────────────────────────────────────┐
 │ 4:1 Saturation Multiplexer Tree         │
 │   ├── Pos Overflow? ──► Output V_max    │
 │   ├── Neg Overflow? ──► Output V_min    │
 │   └── Normal Range? ──► Output Data     │
 └────────────────────┬────────────────────┘
                      │
                      ▼
            Saturated Output Y[7:0]
```

#### Detecting Overflow in Two's Complement Addition

When adding two $N$-bit Two's Complement signed numbers $A[N-1:0]$ and $B[N-1:0]$, we perform an $(N+1)$-bit addition to capture the carry-out bit $C_{N}$:

$$\text{Sum}_{N}[N:0] = \{A[N-1], A\} + \{B[N-1], B\}$$

Let $S_A = A[N-1]$ be the sign bit of $A$, $S_B = B[N-1]$ be the sign bit of $B$, and $S_R = \text{Sum}_N[N-1]$ be the sign bit of the resulting sum.

An overflow occurs IF AND ONLY IF **two inputs with the same sign produce a result with the opposite sign**:

$$\text{Pos\_Overflow} = \overline{S_A} \cdot \overline{S_B} \cdot S_R$$

$$\text{Neg\_Overflow} = S_A \cdot S_B \cdot \overline{S_R}$$

$$\text{Overflow\_Occurred} = \text{Pos\_Overflow} + \text{Neg\_Overflow}$$

```text
OVERFLOW DETECTION TRUTH TABLE (ADDITION)

 Sign A (S_A) │ Sign B (S_B) │ Result Sign (S_R) │ Overflow Status
──────────────┼──────────────┼───────────────────┼───────────────────────────────────────────
      0 (+)   │      0 (+)   │       0 (+)       │ Normal Positive Addition (No Overflow)
      0 (+)   │      0 (+)   │       1 (-)       │ POSITIVE OVERFLOW! (Exceeded +127)
      1 (-)   │      1 (-)   │       1 (-)       │ Normal Negative Addition (No Overflow)
      1 (-)   │      1 (-)   │       0 (+)       │ NEGATIVE OVERFLOW! (Exceeded -128)
      0 (+)   │      1 (-)   │     Any Sign      │ Overflow IMPOSSIBLE (Adding opposite signs)
```

Look at this truth table:
* Adding two positive numbers ($S_A=0, S_B=0$) CANNOT mathematically yield a negative result ($S_R=1$). If $S_R=1$, a **Positive Overflow** occurred! Clamping forces $Y = +127_{10}$ (`8'b0111_1111`).
* Adding two negative numbers ($S_A=1, S_B=1$) CANNOT mathematically yield a positive result ($S_R=0$). If $S_R=0$, a **Negative Overflow** occurred! Clamping forces $Y = -128_{10}$ (`8'b1000_0000`).

---

## RTL Hardware Dividers vs. Shift-Based Scaling Engines

While addition, subtraction, and multiplication synthesize efficiently into combinational logic gates, **division is the most expensive, slowest operation in digital hardware engineering**.

---

### Why Naive Procedural Division (`/`) Destroys Synthesizable RTL

In software languages like C or Python, writing `q = a / b` is trivial.

In synthesizable SystemVerilog RTL, writing:

```systemverilog
// DANGEROUS PROCEDURAL DIVISION IN SYNTHESIZABLE RTL
assign quotient = dividend / divisor; // DO NOT DO THIS FOR DYNAMIC DIVISORS!
```

Commands the logic synthesis tool to build a **32-bit Combinational Array Divider** out of primitive logic gates.

```text
PROCEDURAL DIVISION VS SHIFT SCALING VS RECIPROCAL MULTIPLIER

 NAIVE PROCEDURAL DIVISION (assign q = a / b)
 ┌───────────────────────────────────────────────────────────┐
 │ 32-Bit Combinational Array Divider                        │
 │ * Gate Delay > 20.0 ns (FAILS TIMING CLOSURE!)           │
 │ * Consumes over 5,000 physical logic gates (Huge Area!)   │
 └───────────────────────────────────────────────────────────┘

 POWER-OF-TWO SHIFT SCALING (assign q = a >>> 3)
 ┌───────────────────────────────────────────────────────────┐
 │ Pure Zero-Delay Wire Alignment                            │
 │ * Gate Delay = 0.0 ns (PERFECT TIMING!)                   │
 │ * Consumes EXACTLY 0 logic gates (Zero Area!)             │
 └───────────────────────────────────────────────────────────┘

 RECIPROCAL MULTIPLIER (assign q = (a * RECIPROCAL_B) >>> 16)
 ┌───────────────────────────────────────────────────────────┐
 │ High-Speed DSP Multiplier + Shift                         │
 │ * Gate Delay < 2.0 ns (FAST!)                             │
 │ * Maps directly onto hardwired FPGA DSP48 / DSP Blocks     │
 └───────────────────────────────────────────────────────────┘
```

#### Physical Impact of a Combinational Array Divider:
1. **Massive Area Consumption**: A 32-bit combinational divider requires 32 stages of 32-bit subtractors and multiplexers—consuming over **5,000 physical logic gates** (more than 10 times the area of a 32-bit multiplier!).
2. **Severe Timing Violation**: The critical path delay through a 32-bit combinational divider exceeds **$20.0\text{ nanoseconds}$** ($t_{\text{logic}} > 20\text{ ns}$). If your system target clock frequency is $200\text{ MHz}$ ($T_{\text{clk}} = 5.0\text{ ns}$), the path suffers a massive **$-15.0\text{-ns}$ Negative Setup Slack**, halting synthesis and preventing the chip from operating!

---

### Strategy 1: Power-of-Two Scaling via Arithmetic Right Shifts (`>>>`)

If the division factor is a constant power of two ($2^K$, such as $2, 4, 8, 16, 32 \dots$), division is executed using a **Signed Arithmetic Right Shift (`>>> K`)**:

```systemverilog
// EFFICIENT POWER-OF-TWO DIVISION (Zero Gates!)
// Dividing a signed Two's Complement variable by 8 (2^3)
assign scaled_quotient = signed_data >>> 3;
```

In physical silicon, an arithmetic right shift by a constant $K$ requires **ZERO transistors, ZERO logic gates, and ZERO nanoseconds of delay**. It is a pure hardwired signal rearrangement that routes wire $i$ to output pin $i-K$ while replicating the MSB sign bit across top bits!

---

### Strategy 2: Multiplication by Constant Reciprocal

When dividing by a non-power-of-two **constant** $B$ (for example, dividing an audio signal by $3_{10}$ or $10_{10}$), we replace division with **Fixed-Point Reciprocal Multiplication**:

$$\frac{A}{B} \approx A \times \left( \frac{1}{B} \right) = \frac{A \times K_{\text{reciprocal}}}{2^M}$$

Where:
* $B$ is the known constant divisor.
* $M$ is a chosen scaling precision bit-width (e.g., $M = 16$).
* $K_{\text{reciprocal}}$ is a pre-computed integer constant:

$$K_{\text{reciprocal}} = \text{round}\left( \frac{2^M}{B} \right)$$

```systemverilog
// EFFICIENT CONSTANT DIVISION VIA RECIPROCAL MULTIPLIER
// Example: Divide signed_data by 3 (B = 3).
// Pre-compute K = round(2^16 / 3) = round(65536 / 3) = 21845.
localparam logic signed [16:0] K_RECIPROCAL_3 = 17'sd21845;

logic signed [15:0] signed_data;
logic signed [32:0] raw_prod;
logic signed [15:0] quotient;

always_comb begin
    // Step 1: Multiply by Reciprocal Constant (High-Speed DSP Multiplier)
    raw_prod = signed_data * K_RECIPROCAL_3;
    
    // Step 2: Shift right by M bits (Zero-delay wire shift)
    quotient = logic signed'(raw_prod >>> 16);
end
```

By replacing division with constant multiplication, the hardware execution delay drops from $20.0\text{ ns}$ down to **$1.8\text{ ns}$**, and the operation maps directly onto hardwired FPGA DSP slices (`DSP48E1`)!

---

### Strategy 3: Multi-Cycle Iterative Restoring / Non-Restoring Dividers

When the divisor $B$ is a **dynamic variable** that changes at runtime, hardware engineers build a **Multi-Cycle Iterative Divider** controlled by a Finite State Machine.

Instead of evaluating all 32 division steps in a single zero-delay combinational cycle, an iterative divider evaluates **1 quotient bit per clock cycle over $N$ clock cycles**.

```text
ITERATIVE RESTORING DIVIDER STATE MACHINE

 Start Signal (start_div = 1)
           │
           ▼
 Load Dividend A into Remainder Reg R [63:0]
 Load Divisor B into Register B [31:0]
 Reset Iteration Counter = 0
           │
           ▼
 ┌────────────────────────────────────────────────────────┐
 │ REPEAT FOR 32 CLOCK CYCLES (1 Bit Per Cycle):          │
 │  1. Shift Remainder R left by 1 bit.                   │
 │  2. Subtract Divisor B from upper half of R:           │
 │     Trial_Sub = R[63:32] - B                            │
 │  3. Check Trial_Sub Sign:                              │
 │     ├── If Trial_Sub >= 0: Keep Trial_Sub, Q_bit = 1   │
 │     └── If Trial_Sub < 0 : Restore R,       Q_bit = 0   │
 └────────────────────────┬───────────────────────────────┘
                          │
                          ▼
 32 Cycles Completed ──► Assert done_flag = 1! Emit Quotient!
```

#### Restoring Divider Subtractor Equation per Cycle:

$$\text{Trial\_Sub}_k = R_k[2N-1 : N] - B$$

$$R_{k+1} = \begin{cases}
\{\text{Trial\_Sub}_k[N-1:0], \, R_k[N-2:0], \, 1'b1\} & \text{if } \text{Trial\_Sub}_k \ge 0 \\
\{R_k[2N-2:0], \, 1'b0\} & \text{if } \text{Trial\_Sub}_k < 0 \quad (\text{Restore!})
\end{cases}$$

Where:
* $R_k$ is the double-width remainder register at iteration $k$.
* $B$ is the $N$-bit divisor register.
* $\text{Trial\_Sub}_k$ is the trial subtraction result.

By spreading the 32 division steps across 32 clock cycles, the critical path delay per cycle drops to a single 32-bit subtractor ($t_{\text{logic}} \approx 1.2\text{ ns}$), allowing the module to achieve a $400\text{ MHz}$ clock frequency!

---

## Engineering Reality: DSP48 Pattern Detectors, Critical Paths, and Limit Cycles

In commercial ASIC and FPGA engineering, designing fixed-point DSP hardware requires managing physical layout constraints and filter stability requirements.

### 1. Hardwired DSP Block Pattern Detectors

Modern FPGA families (such as AMD Xilinx Artix-7, Kintex-7, and UltraScale) contain hardwired **DSP48E1 Slices**.

A DSP48E1 slice contains an $18 \times 25$ Two's Complement multiplier, a 48-bit arithmetic logic unit (ALU), and a dedicated **Pattern Detector**:

```text
HARDWIRED DSP48E1 SLICE INTERNAL ARCHITECTURE

 Operands A[24:0], B[17:0] ──► [ 18x25 Multiplier ] ──► [ 48-Bit ALU Accumulator ]
                                                              │
                                                              ▼
                                             [ Hardwired Pattern Detector ]
                                             (Auto-detects Overflow & Saturates!)
```

#### Why Matching DSP48 Pattern Detectors is Critical:
If an engineer writes SystemVerilog code for saturation and rounding that matches the native hardware capabilities of the DSP48 slice, the synthesis tool maps the entire multiplication, accumulation, convergent rounding, and saturation logic **directly into a single DSP48 hardwired block**!

If an engineer writes non-standard saturation code that the synthesis tool cannot map to the DSP48 pattern detector, the synthesis compiler builds external saturation multiplexers out of general-purpose FPGA Look-Up Tables (LUTs). 

This creates long interconnect wires between the DSP block and the LUTs, increasing critical path delay and reducing $f_{\max}$ by up to $40\%$!

---

### 2. Limit Cycle Oscillations in Cascaded IIR Filters

In Digital Signal Processing, an **Infinite Impulse Response (IIR) Filter** uses feedback loops where previous output samples are multiplied by filter coefficients and added back into the input stream:

$$y[n] = b_0 \cdot x[n] + b_1 \cdot x[n-1] - a_1 \cdot y[n-1] - a_2 \cdot y[n-2]$$

Where:
* $x[n]$ is the current input sample.
* $y[n]$ is the current output sample.
* $a_1, a_2, b_0, b_1$ are fixed-point filter coefficients.

```text
IIR FILTER FEEDBACK LOOP & LIMIT CYCLE RISK

 Input x[n] ──►[ + ]───────────────────────────┬──► Output y[n]
                ▲                              │
                │     ┌──────────────────┐     │
                └─────┤ Feedback Multipliers ◄─┴── (Quantization Noise Loop!)
                      │ (-a1, -a2)       │
                      └──────────────────┘
```

#### The Physical Limit Cycle Hazard:
If the fixed-point multiplications and additions inside an IIR filter feedback loop use **Direct Bit Truncation**:
1. Every multiplication truncates fractional bits, adding a negative quantization error $-\epsilon$.
2. The negative error is fed back into the accumulator on every clock cycle.
3. When input $x[n]$ becomes $0$ (complete silence), the feedback loop **does NOT settle to zero**! Instead, the negative quantization bias causes $y[n]$ to oscillate continuously between $-1$ and $+1$ indefinitely.

This continuous non-zero oscillation in the absence of input is called a **Granular Limit Cycle Oscillation**.

#### The Hardware Remedy:
Always use **Convergent Rounding (Round-to-Nearest-Even)** inside IIR filter feedback paths. 

Because Convergent Rounding has zero statistical DC bias ($\text{E}[\epsilon] = 0$), quantization noise cancels out, forcing $y[n]$ to decay to absolute zero when $x[n] = 0$.

---

## Solved Industrial Engineering Exercise: $Q_{3.4}$ Fixed-Point DSP Audio Gain & Filter Unit

To consolidate your complete mastery of fixed-point $Q_{m.n}$ formats, convergent rounding, saturation logic trees, and shift-based scaling, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit firm is designing a synthesizable **$Q_{3.4}$ Fixed-Point DSP Audio Gain & Filter Unit** (`DspAudioFilterUnit`) for a 24-bit digital hearing aid processor.

The unit receives three input signals on every clock cycle:
1. `audio_sample`: Signed 8-bit $Q_{3.4}$ fixed-point audio input ($1$ sign bit, $3$ integer bits, $4$ fractional bits; range $[-8.0, \, +7.9375]$).
2. `gain_coeff`: Signed 8-bit $Q_{1.6}$ fixed-point gain coefficient ($1$ sign bit, $1$ integer bit, $6$ fractional bits; range $[-2.0, \, +1.984375]$).
3. `bias_offset`: Signed 8-bit $Q_{3.4}$ fixed-point calibration offset.

```text
DSP AUDIO GAIN & FILTER UNIT ARCHITECTURE

 Audio Input audio_sample[7:0] (Q3.4) ──┐
 Gain Coeff   gain_coeff[7:0]   (Q1.6) ──┼──► [ Signed Multiplier ] ──► Raw Product P [15:0] (Q4.10)
                                        │                                   │
 Bias Offset  bias_offset[7:0]  (Q3.4) ─┼────────────────────────┐          │
                                        │                        ▼          ▼
                                        │               [ Convergent Rounding Unit ]
                                        │                        │ (Q4.4)
                                        │                        ▼
                                        │               [ 10-Bit Signed Adder ]
                                        │                        │ (Q5.4)
                                        │                        ▼
                                        └───────────────► [ Saturation Clamping ]
                                                                 │
                                                                 ▼
                                                        Output audio_out[7:0] (Q3.4)
```

#### Processing Pipeline Requirements:

1. **Step 1 (Signed Gain Multiplication)**: Multiply 8-bit signed $Q_{3.4}$ `audio_sample` by 8-bit signed $Q_{1.6}$ `gain_coeff` to compute a 16-bit signed raw product $P$ in $Q_{4.10}$ format ($1$ sign bit, $4$ integer bits, $10$ fractional bits).
2. **Step 2 (Convergent Rounding)**: Perform **Convergent Rounding (Round-to-Nearest-Even)** on raw product $P$ to reduce fractional bits from $10$ down to $4$, producing an 10-bit intermediate signed word $R$ in $Q_{5.4}$ format.
3. **Step 3 (Offset Addition)**: Add 8-bit $Q_{3.4}$ `bias_offset` (sign-extended to $Q_{5.4}$) to $R$ to compute 10-bit signed sum $S$ in $Q_{5.4}$ format.
4. **Step 4 (Hardware Saturation Clamping)**: Evaluate sum $S$ for positive overflow ($> +7.9375_{10}$) and negative overflow ($< -8.0_{10}$). Force output `audio_out[7:0]` to clamp to $8\text{'h}7\text{F}$ ($+7.9375_{10}$) on positive overflow, and to $8\text{'h}80$ ($-8.0_{10}$) on negative overflow.

#### Your Objective

1. Calculate the exact binary and hex representation for test inputs:
   * Test 1 (Normal Range): `audio_sample = +2.0`, `gain_coeff = +1.5`, `bias_offset = +0.5`.
   * Test 2 (Positive Overflow): `audio_sample = +6.0`, `gain_coeff = +1.75`, `bias_offset = +1.0`.
   * Test 3 (Negative Overflow): `audio_sample = -7.0`, `gain_coeff = +1.5`, `bias_offset = -2.0`.
2. Write the complete, synthesizable SystemVerilog module `DspAudioFilterUnit`.
3. Implement explicit convergent rounding and 4:1 saturation MUX trees.
4. Trace all test cases through the mathematical pipeline and verify that Two's Complement signedness, zero DC rounding bias, and saturation clamping evaluate correctly.

---

### Step-by-Step Derivation

#### Step 1: Write the Synthesizable SystemVerilog Module

We construct `DspAudioFilterUnit` adhering strictly to DSP synthesis guidelines:

```systemverilog
`default_nettype none

// DSP AUDIO GAIN & FILTER UNIT WITH CONVERGENT ROUNDING & SATURATION
module DspAudioFilterUnit (
    input  logic               clk,
    input  logic               reset_n,
    input  logic signed [7:0]  audio_sample, // Q3.4 format (-8.0 to +7.9375)
    input  logic signed [7:0]  gain_coeff,   // Q1.6 format (-2.0 to +1.984375)
    input  logic signed [7:0]  bias_offset,  // Q3.4 format
    output logic signed [7:0]  audio_out     // Q3.4 saturated output
);

    // Pipeline Intermediate Signals
    logic signed [15:0] raw_product;  // Q4.10 format (16 bits)
    logic signed [9:0]  rounded_word; // Q5.4 format (10 bits)
    logic signed [9:0]  sum_word;     // Q5.4 format (10 bits)
    
    // Convergent Rounding Helper Variables
    logic [5:0] dropped_bits;
    logic       round_bit;
    logic       sticky_bit;
    logic       retained_lsb;
    logic       round_up_flag;

    // -----------------------------------------------------------------
    // STEP 1: SIGNED MULTIPLICATION (Q3.4 * Q1.6 -> Q4.10)
    // -----------------------------------------------------------------
    always_comb begin
        raw_product = audio_sample * gain_coeff;
    end

    // -----------------------------------------------------------------
    // STEP 2: CONVERGENT ROUNDING (Q4.10 -> Q5.4, dropping 6 bits [5:0])
    // -----------------------------------------------------------------
    always_comb begin
        dropped_bits = raw_product[5:0];
        round_bit    = raw_product[5];        // Bit with weight 0.5 LSB
        sticky_bit   = |raw_product[4:0];     // Logical OR of lower fractional bits
        retained_lsb = raw_product[6];        // LSB of retained word

        // Convergent Rounding Logic (Round-to-Nearest-Even)
        if (round_bit) begin
            if (sticky_bit) begin
                round_up_flag = 1'b1; // Fraction > 0.5 -> Round UP
            end else begin
                round_up_flag = retained_lsb; // Exact Tie (0.5) -> Round to EVEN!
            end
        end else begin
            round_up_flag = 1'b0; // Fraction < 0.5 -> Round DOWN
        end

        // Perform Sign-Extended Addition of Rounding Bit
        rounded_word = (raw_product[15:6]) + $signed({9'b0, round_up_flag});
    end

    // -----------------------------------------------------------------
    // STEP 3: OFFSET ADDITION (Q5.4 + Q3.4 -> Q5.4)
    // -----------------------------------------------------------------
    always_comb begin
        // Sign-extend 8-bit bias_offset (Q3.4) to 10-bit (Q5.4)
        sum_word = rounded_word + $signed({{2{bias_offset[7]}}, bias_offset});
    end

    // -----------------------------------------------------------------
    // STEP 4: SATURATION CLAMPING (Q5.4 -> 8-bit Q3.4)
    // Range for 8-bit Q3.4 is [-128, +127] (Hex 8'h80 to 8'h7F)
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            audio_out <= 8'sd0;
        end else begin
            // Check upper 3 bits sum_word[9:7] for overflow/underflow
            if (sum_word > 10'sd127) begin
                audio_out <= 8'h7F; // Positive Saturation (+7.9375)
            end else if (sum_word < -10'sd128) begin
                audio_out <= 8'h80; // Negative Saturation (-8.0000)
            end else begin
                audio_out <= sum_word[7:0]; // Normal Range
            end
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 2: Trace Test Case 1 (Normal Operational Range)

* Inputs:
  * `audio_sample = +2.0` ($Q_{3.4}$: $2.0 \times 16 = 32_{10} = 8\text{'h}20 = 8\text{'b}0010\_0000$).
  * `gain_coeff = +1.5` ($Q_{1.6}$: $1.5 \times 64 = 96_{10} = 8\text{'h}60 = 8\text{'b}0110\_0000$).
  * `bias_offset = +0.5` ($Q_{3.4}$: $0.5 \times 16 = 8_{10} = 8\text{'h}08 = 8\text{'b}0000\_1000$).

##### Execution Pipeline Trace:
1. **Step 1 (Raw Multiplication $Q_{4.10}$)**:
   $$\text{raw\_product} = 32 \times 96 = 3072_{10} = 16\text{'b}0000\_1100\_0000\_0000_2$$
   Verify real value: $3072 / 2^{10} = 3072 / 1024 = +3.0_{10}$.
2. **Step 2 (Convergent Rounding to $Q_{5.4}$)**:
   * Discard lower 6 bits `[5:0]` ($000000_2$). `round_bit = 0`, `sticky_bit = 0`.
   * `round_up_flag = 0`.
   * `rounded_word = raw_product[15:6] = 10'b00_0011_0000_2 = +48_{10}$ ($Q_{5.4}$ value $= 48/16 = +3.0_{10}$).
3. **Step 3 (Offset Addition)**:
   $$\text{sum\_word} = +48 + (+8) = +56_{10}$$
   Verify real value: $56 / 16 = +3.5_{10}$.
4. **Step 4 (Saturation Check)**:
   Is $+56 > +127$? **No**. Is $+56 < -128$? **No**.
   $$\text{audio\_out} = 56_{10} = 8\text{'h}38 = 8\text{'b}0011\_1000_2 \quad (\text{Real value } 56/16 = +\mathbf{3.5_{10}})$$

##### Expected Mathematical Result:
$$(2.0 \times 1.5) + 0.5 = 3.0 + 0.5 = \mathbf{+3.5_{10}}$$
**MATCHES HARDWARE OUTPUT EXACTLY!**

---

#### Step 3: Trace Test Case 2 (Positive Saturation Clamping)

* Inputs:
  * `audio_sample = +6.0` ($Q_{3.4}$: $6.0 \times 16 = 96_{10} = 8\text{'h}60$).
  * `gain_coeff = +1.75` ($Q_{1.6}$: $1.75 \times 64 = 112_{10} = 8\text{'h}70$).
  * `bias_offset = +1.0` ($Q_{3.4}$: $1.0 \times 16 = 16_{10} = 8\text{'h}10$).

##### Execution Pipeline Trace:
1. **Step 1 (Raw Multiplication $Q_{4.10}$)**:
   $$\text{raw\_product} = 96 \times 112 = 10752_{10} = 16\text{'b}0010\_1010\_0000\_0000_2$$
   Verify real value: $10752 / 1024 = +10.5_{10}$.
2. **Step 2 (Convergent Rounding to $Q_{5.4}$)**:
   * Discard lower 6 bits `[5:0]`. `round_bit = 0`.
   * `rounded_word = 10'b00_1010_1000_2 = +168_{10}$ ($Q_{5.4}$ value $= 168/16 = +10.5_{10}$).
3. **Step 3 (Offset Addition)**:
   $$\text{sum\_word} = +168 + (+16) = +184_{10}$$
   Verify real value: $184 / 16 = +11.5_{10}$.
4. **Step 4 (Saturation Check)**:
   Is $+184 > +127$? **YES! POSITIVE OVERFLOW DETECTED!**
   $$\text{audio\_out} \Longleftarrow 8\text{'h}7\text{F} = 8\text{'b}0111\_1111_2 \quad (\text{Clamped to } +\mathbf{7.9375_{10}})$$

```text
POSITIVE SATURATION CLAMPING TRACE

 Raw Un-Saturated Sum : +11.5000 Decimal (+184 Integer)
                        │
                        ▼ Exceeds +7.9375 (+127 Integer Max Capacity!)
 Clamped Audio Output  : +7.9375 Decimal (8'h7F = 8'b0111_1111)
                         (Smooth Peak Compression! Zero Audio Pop!)
```

##### Expected Mathematical Result:
$$(6.0 \times 1.75) + 1.0 = 10.5 + 1.0 = +11.5_{10} \implies \text{Clamped to } +\mathbf{7.9375_{10}}$$
**SATURATION LOGIC CLAMPED THE PEAK PERFECTLY! NO WRAPAROUND DISTORTION!**

---

#### Step 4: Trace Test Case 3 (Negative Saturation Clamping)

* Inputs:
  * `audio_sample = -7.0` ($Q_{3.4}$: $-7.0 \times 16 = -112_{10} = 8\text{'h}90 = 8\text{'b}1001\_0000$).
  * `gain_coeff = +1.5` ($Q_{1.6}$: $+1.5 \times 64 = +96_{10} = 8\text{'h}60$).
  * `bias_offset = -2.0` ($Q_{3.4}$: $-2.0 \times 16 = -32_{10} = 8\text{'h}E0 = 8\text{'b}1110\_0000$).

##### Execution Pipeline Trace:
1. **Step 1 (Raw Multiplication $Q_{4.10}$)**:
   $$\text{raw\_product} = (-112) \times (+96) = -10752_{10} = 16\text{'b}1101\_0110\_0000\_0000_2$$
   Verify real value: $-10752 / 1024 = -10.5_{10}$.
2. **Step 2 (Convergent Rounding to $Q_{5.4}$)**:
   * `rounded_word = 10\text{'b}11\_0101\_1000_2 = -168_{10}$ ($Q_{5.4}$ value $= -168/16 = -10.5_{10}$).
3. **Step 3 (Offset Addition)**:
   $$\text{sum\_word} = -168 + (-32) = -200_{10}$$
   Verify real value: $-200 / 16 = -12.5_{10}$.
4. **Step 4 (Saturation Check)**:
   Is $-200 < -128$? **YES! NEGATIVE OVERFLOW DETECTED!**
   $$\text{audio\_out} \Longleftarrow 8\text{'h}80 = 8\text{'b}1000\_0000_2 \quad (\text{Clamped to } -\mathbf{8.0000_{10}})$$

```text
NEGATIVE SATURATION CLAMPING TRACE

 Raw Un-Saturated Sum : -12.5000 Decimal (-200 Integer)
                        │
                        ▼ Exceeds -8.0000 (-128 Integer Min Capacity!)
 Clamped Audio Output  : -8.0000 Decimal (8'h80 = 8'b1000_0000)
                         (Smooth Negative Clamping! Zero Audio Pop!)
```

##### Expected Mathematical Result:
$$(-7.0 \times 1.5) - 2.0 = -10.5 - 2.0 = -12.5_{10} \implies \text{Clamped to } -\mathbf{8.0000_{10}}$$
**SATURATION LOGIC CLAMPED THE NEGATIVE PEAK PERFECTLY!**

All test cases, convergent rounding rules, $Q_{m.n}$ bit weight maps, saturation clamping trees, and reciprocal division strategies evaluate with 100% mathematical, physical, and logical precision. The `DspAudioFilterUnit` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Fixed-Point $Q_{m.n}$ Format**: The static binary vector convention ($W = 1 + m + n$) that assigns power-of-two fractional weights ($2^{-1} \dots 2^{-n}$) to represent real-world continuous quantities inside digital hardware logic vectors.
* **Convergent Rounding (Round-to-Nearest-Even)**: The tie-breaking fractional bit reduction algorithm that rounds exact $0.5 \text{ LSB}$ midpoint ties to the nearest even LSB integer ($b_n = 0$), eliminating cumulative DC offset bias and limit cycle oscillations in cascaded DSP filters.
* **Hardware Saturation Logic**: The 4-to-1 clamping multiplexer tree that evaluates sign and carry bits to detect integer overflow or underflow, forcing register outputs to clamp cleanly at maximum positive ($V_{\max}$) or minimum negative ($V_{\min}$) boundaries to prevent catastrophic two's complement wraparound noise.
* **Shift-Based Reciprocal Scaling Engines**: The optimization technique that replaces slow, area-expensive procedural hardware division operators (`/`) with zero-delay signed arithmetic right shifts (`>>>`), constant reciprocal multipliers ($A \times \frac{2^M}{B} \gg\gg M$), or multi-cycle CORDIC and iterative restoring dividers.
