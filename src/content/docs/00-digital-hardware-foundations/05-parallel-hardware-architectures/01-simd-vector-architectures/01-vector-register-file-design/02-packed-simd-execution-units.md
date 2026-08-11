---
title: "Packed SIMD Execution Units and Sub-Word Parallelism Mechanics"
---

# Packed SIMD Execution Units and Sub-Word Parallelism Mechanics

## The Carry Leakage Crisis: Why Scalar ALUs Ruin Packed Vector Throughput

In digital computer systems, the Arithmetic Logic Unit (ALU) is the primary computational engine inside a processor core. In a traditional scalar processor, a 64-bit ALU accepts two 64-bit binary numbers, performs an operation such as addition, subtraction, or bitwise logic, and outputs a 64-bit result. When adding two 64-bit integers, the ALU treats the entire 64-bit input vector as a single, indivisible numerical value. During addition, as each pair of bits is added from the least significant bit (Bit 0) to the most significant bit (Bit 63), any overflow from one bit position generates a **Carry Bit** that propagates sequentially or via lookahead trees to the next higher bit position.

Now, consider what happens when software needs to process image pixels, audio samples, or neural network weights. In an image processing application, each pixel color component (Red, Green, Blue, Alpha) is represented as an 8-bit unsigned integer ranging from $0$ (pure black) to $255$ (pure white). A 64-bit register can comfortably store **eight independent 8-bit pixel values** packed side-by-side:

```text
PACKED 8-BIT DATA LAYOUT INSIDE A 64-BIT REGISTER

 64-Bit Register Holding 8 Packed Pixel Values
 ┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
 │Pixel 7 │Pixel 6 │Pixel 5 │Pixel 4 │Pixel 3 │Pixel 2 │Pixel 1 │Pixel 0 │
 │(8 Bits)│(8 Bits)│(8 Bits)│(8 Bits)│(8 Bits)│(8 Bits)│(8 Bits)│(8 Bits)│
 └────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
  Bits 63..56                              ...              Bits 7..0
```

Suppose a programmer wants to brighten an image by adding a constant brightness value of $20$ to all eight pixels simultaneously.

If the processor lacks specialized SIMD (Single Instruction, Multiple Data) execution hardware, the execution engine faces two unacceptable options:

### Option 1: Sequential Iterative Execution (Low Throughput)
The processor can use its scalar ALU to process the eight pixels one by one in a loop:
1. Extract Pixel 0 (Bits 7..0), add $20$ in the scalar ALU, write to output.
2. Extract Pixel 1 (Bits 15..8), add $20$ in the scalar ALU, write to output.
3. Repeat for all 8 pixels...

```text
SEQUENTIAL SCALAR LOOPING (FORFEITS PARALLELISM)

 Pass 1: Add 20 to Pixel 0 ──► Output Pixel 0
 Pass 2: Add 20 to Pixel 1 ──► Output Pixel 1
  :
 Pass 8: Add 20 to Pixel 7 ──► Output Pixel 7
 (Paid 8 separate clock cycles to process data sitting in ONE register!)
```

This sequential loop requires **8 separate clock cycles** to process data that was already packed inside a single register! The processor forfeits all parallel execution throughput, leaving $87.5\%$ of its internal physical wiring idle on every cycle.


## The Partitioned Accordion Room: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of sub-word parallelism, carry-chain breaking, and packed execution units before analyzing logic gate circuits and saturation math, let us consider an everyday analogy: **The Convertible Conference Hall**.

Imagine a large hotel conference hall (**A 64-Bit Physical Execution Datapath**) measuring 64 meters long.

```text
THE CONVERTIBLE CONFERENCE HALL ANALOGY

 Scenario A: One Un-Partitioned Hall (Scalar 64-Bit Mode)
 ┌─────────────────────────────────────────────────────────────┐
 │ 64-Meter Open Conference Hall                               │
 │ Sound Echoes Continuously from Meter 0 to Meter 63          │
 └─────────────────────────────────────────────────────────────┘

 Scenario B: Partitioned into 8 Small Rooms (Packed 8-Bit SIMD Mode)
 ┌───┬───┬───┬───┬───┬───┬───┬───┐
 │R7 │R6 │R5 │R4 │R3 │R2 │R1 │R0 │ (8 Soundproof Dividers Dropped!)
 └───┴───┴───┴───┴───┴───┴───┴───┘
 (Sound cannot leak between rooms! 8 Meetings happen simultaneously!)
```

The hall is used to host corporate meetings (**Mathematical Operations**). Sound generated inside the hall travels along the floor from one end to the other (**Carry Propagation**).

Let us observe two different ways the hotel manager configures this hall:


### Scenario B: Eight Small Partitioned Rooms (Sub-Word SIMD Operation)
Now, suppose 8 different small companies arrive at the hotel simultaneously, each needing a small 8-meter room for a private team meeting.

If the manager leaves the hall wide open:
* Company 0 speaks in Section 0 (Meters 0..7).
* If Company 0 gets excited and shouts loudly (**Generates a Carry Overflow $C_8 = 1$**), their voice echoes into Section 1 (Meters 8..15).
* Company 1's meeting in Section 1 is disrupted and ruined by Company 0's noise (**Data Corruption via Carry Leakage**)!

To prevent this disruption, the hotel manager drops **7 soundproof folding partitions** (**Carry-Chain Breakers**) down from the ceiling at 8-meter intervals!

Look at what happens now:
1. The soundproof walls block all acoustic vibrations from crossing between sections.
2. Company 0 can shout as loudly as they want in Room 0; their voice hits the soundproof partition at Meter 7 and **stops dead**! Zero noise leaks into Room 1!
3. All 8 companies hold their meetings **simultaneously in parallel** inside the same building without interfering with each other!

```text
SOUNDPROOF PARTITION IN ACTION (CARRY BREAKING)

 Room 0 (Meters 0..7)          Room 1 (Meters 8..15)
 Company 0 Shouts Loudly! ──► [ Soundproof Divider ] ──► Room 1 STAYS QUIET!
                              (Carry Bit Blocked!)       (Zero Noise Leakage!)
```

Notice what this convertible hall achieves:
* **Dynamic Re-configurability**: When a single large company arrives, the manager folds the walls up into the ceiling (**Un-broken 64-Bit Scalar Adder**). When 8 small companies arrive, the manager drops the soundproof walls down (**8 Parallel 8-Bit Sub-Word Adders**).
* **Parallel Throughput**: 8 meetings complete in 1 hour instead of taking 8 hours sequentially!
* **Isolation**: The soundproof dividers guarantee that noise in one room never corrupts another room.

This convertible conference hall is the exact physical analogue of a **Packed SIMD Execution Unit and Sub-Word Parallelism**:
* The 64-meter hall is the **64-Bit Physical ALU Datapath**.
* Sound traveling down the hall is **Carry Propagation ($C_0 \to C_{63}$)**.
* Company 0 shouting loudly is a **Sub-Word Arithmetic Overflow ($C_8 = 1$)**.
* The soundproof folding partitions are **Transistor Carry-Chain Breakers**.
* Holding 8 meetings simultaneously is **Sub-Word Parallel Execution**.


### Transistor-Level Mechanics of Carry-Chain Breakers

To understand how carry propagation is severed in hardware, let us examine the Boolean logic of carry generation in a binary adder.

In a binary adder, for any bit position $i$, two input bits $A_i$ and $B_i$ produce a **Carry Generate signal ($G_i$)** and a **Carry Propagate signal ($P_i$)**:

$$G_i = A_i \cdot B_i$$

$$P_i = A_i \oplus B_i$$

Where:
* $G_i = 1$ if bit position $i$ generates a new carry bit on its own ($A_i = 1$ and $B_i = 1$).
* $P_i = 1$ if bit position $i$ will pass an incoming carry bit $C_i$ through to the next bit position $C_{i+1}$ ($A_i \neq B_i$).

The carry bit $C_{i+1}$ sent to the next higher bit position is defined by the fundamental recurrence equation:

$$C_{i+1} = G_i + (P_i \cdot C_i)$$

```text
UN-BROKEN CARRY PROPAGATION CHAIN (SCALAR MODE)

 Bit 7 (Sub-word 0 End)                  Bit 8 (Sub-word 1 Start)
 C7 ──► [ Generate G7 / Propagate P7 ] ──► C8 = G7 + (P7 * C7) ──► C9...
        (Carry flows freely from Bit 7 to Bit 8!)
```

In a standard scalar adder, the carry out from Bit 7 ($C_8$) flows directly into the carry input of Bit 8.


## Primitive 2: SIMD Execution Units and Datapath Integration

Now that we understand sub-word carry-chain breaking, let us examine the complete microarchitectural layout of a **Packed SIMD Execution Unit**.

An execution core designed for vector processing contains a bank of specialized SIMD functional units operating in parallel:

```text
PACKED SIMD EXECUTION UNIT DATAPATH

 Source Register A [128 Bits]            Source Register B [128 Bits]
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ A15 │ A14 │ ... │ A1 │ A0 │          │ B15 │ B14 │ ... │ B1 │ B0 │
 └──┬─────┬──────────┬────┬──┘          └──┬─────┬──────────┬────┬──┘
    │     │          │    │                │     │          │    │
    ▼     ▼          ▼    ▼                ▼     ▼          ▼    ▼
 ┌──────────────────────────────┐       ┌──────────────────────────────┐
 │ Configurable Sub-word Adders │       │ Configurable Multipliers     │
 │ (8b / 16b / 32b / 64b Mode)  │       │ (PMULLW / PMULHW Engine)     │
 └──────────────┬───────────────┘       └──────────────┬───────────────┘
                │                                      │
                ▼                                      ▼
 ┌──────────────────────────────┐       ┌──────────────────────────────┐
 │ Saturation Clamping Logic    │       │ Pack / Unpack Permute MUXes  │
 └──────────────┬───────────────┘       └──────────────┬───────────────┘
                │                                      │
                └───────────────────┬──────────────────┘
                                    ▼
                      Destination Register C [128 Bits]
```

A complete SIMD Execution Unit integrates four specialized sub-circuits:
1. **Configurable Sub-Word Adders/Subtractors**: Perform parallel additions and subtractions with carry-chain breaking.
2. **Sub-Word Multipliers**: Perform parallel multi-element multiplications with high/low product selection.
3. **Saturation Clamping Logic**: Clamps arithmetic overflow/underflow to maximum or minimum numerical boundaries rather than wrapping around.
4. **Pack/Unpack and Permute Multiplexers**: Re-arrange, widen, or narrow sub-word data elements between vector registers.


### Hardware Saturation Clamping Mechanics

To eliminate clipping distortion, SIMD execution units provide **Saturation Arithmetic** instructions (e.g., `PADDSB` - Packed Add Unsigned Saturation Byte).

Under Saturation Arithmetic, if an operation exceeds the maximum representable value $MAX\_INT$ or falls below $MIN\_INT$, the hardware **clamps the result at the boundary limit**:

$$\text{Unsigned 8-Bit Saturation Addition: } \mathbf{\text{Saturate}_{U8}(A + B) = \min(A + B, \, 255)}$$

$$\text{Signed 8-Bit Saturation Addition: } \mathbf{\text{Saturate}_{S8}(A + B) = \max(-128, \, \min(A + B, \, 127))}$$

```text
SATURATION CLAMPING HARDWARE CIRCUIT

 Raw 8-Bit Adder Sum S[7:0] & Carry Out C8
                     │
                     ▼
        Did Carry Out C8 == 1?
                     │
            ┌────────┴────────┐
            │ YES             │ NO
            ▼                 ▼
   Clamp Output to 255   Pass Raw Sum S[7:0]
   (8'b1111_1111)        (Un-modified)
```

#### Transistor Clamping Circuitry:
1. The 8-bit sub-word adder computes the raw sum $S[7:0]$ and outputs carry bit $C_8$.
2. A 2-to-1 output multiplexer inspects $C_8$:
   * **If $C_8 == 0$ (No Overflow)**: The MUX selects the raw adder output $S[7:0]$.
   * **If $C_8 == 1$ (Overflow Occurred!)**: The MUX overrides the adder output and **forces all 8 output bits to $1$ (`8'b1111_1111` = $255$)**!

The pixel value remains rock-solid at $255$ (pure white). Visual and acoustic integrity is $100\%$ preserved!


### 1. Low-Half Packed Multiply (`PMULLW` — Packed Multiply Low Word)
* **Operation**: Computes $A_i \times B_i = P_i[31:0]$, but discards bits $[31:16]$ and **stores only the lower 16 bits $P_i[15:0]$**.
* **Destination**: Fits cleanly back into a standard 64-bit destination register ($4 \times 16\text{ bits} = 64\text{ bits}$).
* **Usage**: Standard integer arithmetic where products are known not to exceed 16-bit capacity.


### 3. Widening / Lengthening Packed Multiply (`VMULL` / `VWMUL`)
* **Operation**: Multiplies 16-bit source elements and **preserves all 32 bits of each product**.
* **Destination**: Writes the result into a **double-wide 128-bit vector register pair** ($V_D, V_{D+1}$).
* **Usage**: High-precision scientific and neural network matrix computations where zero precision loss is permitted.


### 2. Packing / Demoting Units (`PACKUSWB` / `UNZIP`)

After computing high-precision 16-bit arithmetic results, the algorithm needs to convert the 16-bit words back into 8-bit pixel bytes before saving the image to disk.

A **Pack (or Demote / Unzip)** unit takes 16-bit words, applies saturation clamping ($0 \dots 255$), and packs the lower 8 bits of each word back into a dense 8-bit byte vector:

```text
PACKING 16-BIT WORDS BACK TO 8-BIT BYTES

 Source A (128b Words): [ W3 (16b) │ W2 (16b) │ W1 (16b) │ W0 (16b) ]
                        ──────────── Saturate & Pack ────────────
 Packed Result (32b)  : [ B3 (8b)  │ B2 (8b)  │ B1 (8b)  │ B0 (8b)  ]
```

Together, Pack and Unpack units allow software to seamlessly transition between high-density 8-bit storage and high-precision 16-bit or 32-bit execution without pipeline stalls.


### Scenario and Parameters

You are a senior microarchitect designing a 64-bit SIMD Execution Unit for an embedded digital signal processor (DSP) operating at a clock frequency $f_{\text{clk}} = 2.4\text{ GHz}$ ($T_{\text{clk}} = 0.4167\text{ ns} = 416.7\text{ ps}$).

The physical execution datapath consists of a **64-Bit Re-configurable SIMD Adder/Subtractor Unit** equipped with programmable carry-chain breakers at 8-bit and 16-bit boundaries.

```text
2.4 GHz SIMD EXECUTION UNIT ARCHITECTURE

 64-Bit Configurable SIMD ALU ──► [ Carry-Chain Breaker Array ] ──► [ Saturation Clamping Logic ]
 Clock Frequency = 2.4 GHz        Supported Modes: 1x64b, 2x32b, 4x16b, 8x8b
```

#### Physical Hardware Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 2.4\text{ GHz}$ ($T_{\text{clk}} = 416.7\text{ ps}$).
* Single-Instruction Execution Time: $1\text{ clock cycle}$ ($416.7\text{ ps}$).
* 64-Bit Register A Payload: `64'hFA0A_8005_10FE_00FF`
* 64-Bit Register B Payload: `64'h100F_8005_2003_0001`

#### Your Objective

1. Calculate the theoretical computational throughput (in **Millions of Operations Per Second / MFLOPS or MOPS**) when the SIMD ALU operates in:
   * Mode 1: $1 \times 64\text{-bit}$ Scalar Mode.
   * Mode 2: $2 \times 32\text{-bit}$ SIMD Mode.
   * Mode 3: $4 \times 16\text{-bit}$ SIMD Mode.
   * Mode 4: $8 \times 8\text{-bit}$ SIMD Mode.
2. Evaluate **Unsigned 8-Bit SIMD Addition with Modular Wrap-Around** on Registers A and B:
   * Specify the 8-bit Keep-Carry control vector (`Keep_Carry[56:0]`).
   * Calculate the exact 64-bit hex output produced by the 8 parallel sub-word adders.
   * Identify any sub-word carry overflows ($C_8, C_{16}, \dots, C_{64}$) and demonstrate that zero carry leakage occurred across sub-word boundaries.
3. Evaluate **Unsigned 8-Bit SIMD Addition with Saturation Clamping** on Registers A and B:
   * Calculate the exact 64-bit hex output produced when saturation clamping logic is enabled.
   * Identify which sub-words were clamped to $255$ (`8'hFF`).
4. Calculate the **Performance Speedup Factor** of Mode 4 ($8 \times 8\text{-bit}$ SIMD) over a scalar execution loop running on a single-word ALU.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Unsigned 8-Bit SIMD Addition with Modular Wrap-Around

Inputs:
* `Register A = 64'hFA_0A_80_05_10_FE_00_FF`
* `Register B = 64'h10_0F_80_05_20_03_00_01`

Let us break Registers A and B into eight 8-bit bytes (Byte 7 down to Byte 0):

```text
8-BIT SUB-WORD INPUT PAYLOAD BREAKDOWN

 Byte Index │ Register A (Hex / Dec) │ Register B (Hex / Dec) │ Un-clamped Sum (Dec) │ Raw Sum (Hex) │ Carry Out
────────────┼────────────────────────┼────────────────────────┼──────────────────────┼───────────────┼───────────
   Byte 7   │  0xFA  (250)           │  0x10  (16)            │ 250 + 16 = 266       │  0x0A (10)    │ C_64 = 1
   Byte 6   │  0x0A  (10)            │  0x0F  (15)            │  10 + 15 = 25        │  0x19 (25)    │ C_56 = 0
   Byte 5   │  0x80  (128)           │  0x80  (128)           │ 128 + 128 = 256      │  0x00 (0)     │ C_48 = 1
   Byte 4   │  0x05  (5)             │  0x05  (5)             │   5 + 5  = 10        │  0x0A (10)    │ C_40 = 0
   Byte 3   │  0x10  (16)            │  0x20  (32)            │  16 + 32 = 48        │  0x30 (48)    │ C_32 = 0
   Byte 2   │  0xFE  (254)           │  0x03  (3)             │ 254 + 3  = 257       │  0x01 (1)     │ C_24 = 1
   Byte 1   │  0x00  (0)             │  0x00  (0)             │   0 + 0  = 0         │  0x00 (0)     │ C_16 = 0
   Byte 0   │  0xFF  (255)           │  0x01  (1)             │ 255 + 1  = 256       │  0x00 (0)     │ C_8  = 1
```

##### 1. Keep-Carry Control Vector:
To sever carry leakage at all 8-bit boundaries ($C_8, C_{16}, C_{24}, C_{32}, C_{40}, C_{48}, C_{56}$):

$$\mathbf{\text{Keep\_Carry}[56:0] = \text{8'b0000\_0000}}$$

##### 2. Modular Wrap-Around Output Calculation:
* Byte 7: $250 + 16 = 266 \pmod{256} = 10 \implies \mathbf{\text{0x0A}}$ (Carry $C_{64} = 1$).
* Byte 6: $10 + 15 = 25 \implies \mathbf{\text{0x19}}$ (Carry $C_{56} = 0$).
* Byte 5: $128 + 128 = 256 \pmod{256} = 0 \implies \mathbf{\text{0x00}}$ (Carry $C_{48} = 1$).
* Byte 4: $5 + 5 = 10 \implies \mathbf{\text{0x0A}}$ (Carry $C_{40} = 0$).
* Byte 3: $16 + 32 = 48 \implies \mathbf{\text{0x30}}$ (Carry $C_{32} = 0$).
* Byte 2: $254 + 3 = 257 \pmod{256} = 1 \implies \mathbf{\text{0x01}}$ (Carry $C_{24} = 1$).
* Byte 1: $0 + 0 = 0 \implies \mathbf{\text{0x00}}$ (Carry $C_{16} = 0$).
* Byte 0: $255 + 1 = 256 \pmod{256} = 0 \implies \mathbf{\text{0x00}}$ (Carry $C_8 = 1$).

$$\mathbf{\text{Output Result (Modular Wrap-Around)} = \text{64'h0A\_19\_00\_0A\_30\_01\_00\_00}}$$

##### Proof of Zero Carry Leakage:
Look at Byte 1 ($0x00$): Even though Byte 0 generated $C_8 = 1$, the AND gate carry-chain breaker forced $C_8 = 0$ at Byte 1's input. Byte 1 evaluated $0 + 0 + 0 = 0$ (`0x00`). **Zero carry leakage occurred!**


#### Step 4: Calculate Performance Speedup Factor

Let us compare the time required to add 1,000,000 pairs of 8-bit image pixels ($1,000,000\text{ operations}$) at $f_{\text{clk}} = 2.4\text{ GHz}$ ($T_{\text{clk}} = 0.4167\text{ ns}$):

##### 1. Scalar Execution Loop (1 operation per instruction):
* Requires $1,000,000\text{ instructions}$.
* Total Clock Cycles = $1,000,000\text{ cycles}$.

$$T_{\text{scalar}} = 1,000,000 \times 0.4167 \times 10^{-9}\text{ s} = \mathbf{0.0004167 \text{ seconds}} \quad (416.7\text{ }\mu\text{s})$$

##### 2. SIMD Mode 4 ($8 \times 8\text{-bit}$ SIMD Execution):
* Each SIMD instruction processes 8 pixels in parallel.
* Required SIMD Instructions = $\frac{1,000,000}{8} = 125,000\text{ instructions}$.
* Total Clock Cycles = $125,000\text{ cycles}$.

$$T_{\text{SIMD}} = 125,000 \times 0.4167 \times 10^{-9}\text{ s} = \mathbf{0.0000521 \text{ seconds}} \quad (52.1\text{ }\mu\text{s})$$

##### 3. Calculate Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{scalar}}}{T_{\text{SIMD}}} = \frac{416.7\text{ }\mu\text{s}}{52.1\text{ }\mu\text{s}} = \frac{1,000,000\text{ cycles}}{125,000\text{ cycles}} = \mathbf{8.00\times \text{ Performance Speedup!}}$$

##### Engineering Conclusion:
By enabling sub-word parallelism in Mode 4 ($8 \times 8\text{-bit}$ SIMD), the execution unit increased throughput from $2,400\text{ MOPS}$ to $19,200\text{ MOPS}$, cutting total execution time from $416.7\text{ }\mu\text{s}$ down to $52.1\text{ }\mu\text{s}$—a **$8.00\times$ performance speedup ($700\%$ throughput gain)**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **SIMD Execution Unit**: A specialized, high-throughput physical execution engine that processes multiple data elements packed side-by-side within wide vector registers in a single clock cycle.
* **Sub-word Parallelism**: A microarchitectural technique that dynamically configures a wide physical ALU datapath into multiple independent narrower sub-word ALUs (e.g., 8x8b, 4x16b, 2x32b) by inserting controllable logic gate switches (Carry-Chain Breakers) to prevent carry leakage between adjacent packed elements.
