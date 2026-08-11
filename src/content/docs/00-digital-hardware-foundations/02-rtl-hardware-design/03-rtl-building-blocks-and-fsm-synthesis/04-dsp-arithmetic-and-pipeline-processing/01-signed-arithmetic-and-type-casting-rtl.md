---
title: "Signed Arithmetic Modeling, SystemVerilog Type Casting, and Arithmetic Shift Mechanics"
---

# Signed Arithmetic Modeling, SystemVerilog Type Casting, and Arithmetic Shift Mechanics

When digital hardware engineers design mathematical processing units in SystemVerilog—such as digital signal processing (DSP) filters, audio gain scalers, satellite radar trackers, or neural network matrix accelerators—they must process binary vectors that represent both positive and negative quantities. In digital hardware, negative numbers are represented using Two's Complement notation, where the Most Significant Bit (MSB) carries a negative power weight ($-2^{N-1}$).

However, at the physical silicon level, copper wires do not know whether they are carrying signed or unsigned numbers. An 8-bit bus carrying the bit pattern `8'b1111_1100` is simply eight physical wires carrying high ($V_{DD}$) and low ($0\text{ V}$) voltages. 

To a Two's Complement signed unit, `8'b1111_1100` represents the negative integer **$-4_{10}$**. To an unsigned unit, that exact same bit pattern represents the positive integer **$+252_{10}$**.

```text
THE DUAL INTERPRETATION OF BIT PATTERN 8'b1111_1100

 Physical 8-Bit Bus : [ 1 ] [ 1 ] [ 1 ] [ 1 ] [ 1 ] [ 1 ] [ 0 ] [ 0 ]
                       │
                       ├────────► Signed Two's Complement : -4 Decimal
                       │
                       └────────► Unsigned Binary Vector  : +252 Decimal
```

Because SystemVerilog must decide how to synthesize logic gates for expressions involving multi-bit logic vectors, the language defines a default rule: **all declared logic vectors are treated as UNSIGNED binary numbers by default.**

This default unsigned rule creates one of the most dangerous, silent failure modes in hardware engineering: **Infectious Unsigned Expression Propagation**.

If an engineer writes an arithmetic expression containing multiple variables—such as adding a signed audio sample $A$ to a calibration offset $B$—SystemVerilog evaluates the signedness of every operand in the expression. If **even ONE operand** in the entire expression is unsigned (or if an operand is a vector slice `bus[3:0]` or a concatenation `{a, b}`), SystemVerilog silently converts **ALL operands in the expression to unsigned!**

```text
INFECTIOUS UNSIGNED EXPRESSION PROPAGATION

 Expression: Y = Signed_A + Unsigned_B
                    │           │
                    ▼           ▼
 SystemVerilog Rule: ONE Unsigned Operand CONVERTS ALL Operands to Unsigned!
                    │
                    ▼
 Evaluated As: Y = Unsigned_A + Unsigned_B
                   (Negative Signed_A is zero-extended into a HUGE positive number!)
```

When a negative Two's Complement number (like $-4_{10} = \text{8'b1111\_1100}$) is silently converted to an unsigned number:
1. **Zero-Extension Corruption**: When assigning the 8-bit result to a wider 16-bit register, the simulator and synthesis tool apply **Zero-Extension** instead of **Sign-Extension**. Instead of expanding $-4$ to `16'b1111_1111_1111_1100` ($-4_{10}$), the hardware builds a zero-extender that outputs `16'b0000_0000_1111_1100` ($+252_{10}$)!
2. **Shift Operator Degradation**: When performing a right shift on a negative number using the arithmetic shift operator (`>>>`), the presence of an unsigned operand causes the operator to degrade into a standard **Logical Right Shift (`>>`)**. Instead of filling vacated top bits with copies of the sign bit, the shifter fills top bits with zeros, turning negative values into large positive numbers.

To prevent signedness contamination, hardware designers must master SystemVerilog's **Signed Type Declarations (`logic signed`)**, explicit **Type Casting (`$signed()`)**, and **Arithmetic Right Shift (`>>>`)** mechanics.


### Part B: The Apple Inventory Counter (Unsigned Numbers)

Now imagine a second sensor in the warehouse: an automated optical counter ($B$) that counts crates of apples passing along a conveyor belt. The apple counter also uses an 8-bit digital readout screen.
* It can count $0, 1, 2, \dots, 255$ crates.
* It has no minus sign. It has zero concept of "negative crates." A crate count is strictly an **unsigned quantity**.


### The Solution: The Red "Signed" Stamp (`$signed()`)

How do we fix this warehouse computer bug?

We stamp an explicit red "SIGNED TEMPERATURE" label (**`$signed()`**) onto Sensor $A$'s reading before feeding it into the computer.

```text
EXPLICIT SIGNED STAMP ENFORCEMENT ($signed)

 Temp Sensor A (-5 C) ──► [ $signed() Stamp ] ──► Computer forced to use Signed Math!
                                                 Top 8 bits filled with SIGN BIT (1s)!
 Result in 16-Bit Ledger: 1111_1111_1111_1101 (-3 C Correct!)
```

When the computer sees the `$signed()` stamp on Sensor $A$:
1. It recognizes that the top bit ($1$) is a **negative sign bit**.
2. When expanding the result to a 16-bit ledger, it applies **Sign-Extension**, filling the top 8 bits with ones (`1111_1111_2`).
3. The 16-bit ledger records `16'b1111_1111_1111_1101`, which equals **$-3_{10}$**!

This red "SIGNED" stamp is the exact physical analogue of SystemVerilog's **`$signed()` type casting operator**.


### Primitive 1: Signed Vector Declarations (`logic signed`)

By default, any multi-bit vector declared in SystemVerilog without an explicit signedness modifier is **unsigned**:

```systemverilog
// Unsigned Vector Declarations (Default SystemVerilog Behavior)
logic [7:0] unsigned_val; // Unsigned vector: represents integers 0 to 255
```

To declare a vector as a Two's Complement signed quantity, you must explicitly insert the **`signed`** keyword between the data type and the bit-range specification:

```systemverilog
// Signed Two's Complement Vector Declarations
logic signed [7:0] signed_val; // Signed vector: represents integers -128 to +127
```

```text
SIGNED VS UNSIGNED VECTOR DECLARATION SYNTAX

 logic        [7:0] unsigned_var; // Unsigned vector (Range: 0 to 255)
 logic signed [7:0] signed_var;   // Two's Complement Signed vector (Range: -128 to +127)
        ▲
        │
  'signed' keyword placed BEFORE bit range [7:0]!
```

#### Mathematical Value Formula for Signed Vectors

For an $N$-bit Two's Complement signed vector $\mathbf{V} = (b_{N-1}, b_{N-2}, \dots, b_1, b_0)$ declared as `logic signed [N-1:0]`:

The decimal value $V_{\text{decimal}}$ represented by vector $\mathbf{V}$ is given by:

$$V_{\text{decimal}} = -b_{N-1} \cdot 2^{N-1} + \sum_{k=0}^{N-2} b_k \cdot 2^k$$

Where:
* $b_{N-1}$ is the Most Significant Bit (MSB, the sign bit).
* $b_k \in \{0, 1\}$ is the binary bit value at position $k$.
* $-2^{N-1}$ is the negative power weight of the sign bit.
* $+2^k$ are the positive power weights of lower bits $k \in \{0, 1, \dots, N-2\}$.

```text
TWO'S COMPLEMENT POSITIONAL WEIGHT MAP (8-BIT SIGNED)

 Bit Position  │   Bit 7   │  Bit 6  │  Bit 5  │  Bit 4  │  Bit 3  │  Bit 2  │  Bit 1  │  Bit 0  
───────────────┼───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────
 Bit Weight    │ -2^7=-128 │ +2^6=64 │ +2^5=32 │ +2^4=16 │  +2^3=8 │  +2^2=4 │  +2^1=2 │  +2^0=1 
               │ (SIGN BIT)│         │         │         │         │         │         │         
```

#### Dynamic Range Boundaries:
An $N$-bit `logic signed` vector covers the asymmetric integer range:

$$\text{Range} = \left[ -2^{N-1}, \, +2^{N-1} - 1 \right]$$

* For an 8-bit `logic signed [7:0]`: Range is $[-128, \, +127]$.
* For a 16-bit `logic signed [15:0]`: Range is $[-32768, \, +32767]$.


### Primitive 3: Explicit Type Casting (`$signed()` and `$unsigned()`)

To override default unsigned propagation and force SystemVerilog to evaluate an expression using Two's Complement signed arithmetic, we use **SystemVerilog Type Casting Functions**:

* **`$signed(expression)`**: Forces the compiler to treat `expression` as a signed Two's Complement quantity.
* **`$unsigned(expression)`**: Forces the compiler to treat `expression` as an unsigned quantity.

```systemverilog
logic signed [7:0] a; // Signed
logic        [7:0] b; // Unsigned
logic signed [15:0] result;

// EXPLICIT SIGNED CASTING
// $signed(b) forces 'b' to be treated as signed!
// The addition is now evaluated as SIGNED!
assign result = a + $signed(b); 
```

#### How `$signed()` Controls Bit-Width Extension in Assignments

When assigning a narrower $N$-bit expression to a wider $M$-bit target variable ($M > N$), the signedness of the expression dictates how the top $M - N$ bits are filled:

```text
BIT-WIDTH EXTENSION DYNAMICS

 Assigning 8-bit expression to 16-bit target:

 Unsigned Expression ──► ZERO-EXTENSION ──► Top 8 bits filled with 0s (0000_0000)
 Signed Expression   ──► SIGN-EXTENSION ──► Top 8 bits filled with SIGN BIT (a[7])
```

Let's compare the bit-level extension results for an 8-bit negative value $a = 8\text{'b}1111\_1100$ ($-4_{10}$):

```systemverilog
logic        [7:0]  u_val = 8'b1111_1100; // Unsigned +252
logic signed [7:0]  s_val = 8'b1111_1100; // Signed -4
logic signed [15:0] target1, target2;

assign target1 = u_val;          // Zero-Extension: 16'b0000_0000_1111_1100 (+252)
assign target2 = $signed(u_val); // Sign-Extension: 16'b1111_1111_1111_1100 (-4)
```

By applying `$signed(u_val)`, the hardware synthesis compiler builds a **Sign Extender** that replicates bit 7 across bits $[15:8]$, preserving the Two's Complement value $-4_{10}$ with 100% mathematical fidelity.


### Primitive 4: Arithmetic Shift Right (`>>>`) Mechanics

The **Arithmetic Shift Right (`>>>`)** operator is specifically engineered to perform signed division by powers of two ($2^K$) on Two's Complement numbers.

$$\text{Target} = \text{Operand} \gg\gg K$$

Where:
* $\text{Operand}$ is the vector being shifted right.
* $K$ is the integer shift count ($K \ge 0$).
* $\gg\gg$ is the arithmetic shift right operator.

#### The Dual Behavior Rule of `>>>`:
The behavior of the `>>>` operator depends **CRITICALLY** on the signedness of its left operand:

1. **If Operand is SIGNED (`logic signed`)**:
   `>>>` performs a true **Arithmetic Shift Right**. Vacated top bit positions (MSBs) are filled with **copies of the Sign Bit ($b_{N-1}$)**.
2. **If Operand is UNSIGNED (`logic` default)**:
   `>>>` **DEGRADES to a Logical Shift Right (`>>`)**! Vacated top bit positions (MSBs) are filled with **zeros ($0$)**, ignoring the sign bit!

```text
ARITHMETIC SHIFT RIGHT (>>>) DUAL BEHAVIOR

 Vector: 8'b1111_1000 (-8 Decimal)

 Case 1: Operand is SIGNED (logic signed)
   Result = 8'b1111_1000 >>> 2  ──► 8'b1111_1110 (-2 Decimal!)
   Top 2 bits filled with copies of SIGN BIT (1)!

 Case 2: Operand is UNSIGNED (logic default)
   Result = 8'b1111_1000 >>> 2  ──► 8'b0011_1110 (+62 Decimal! DEGRADED TO LSR!)
   Top 2 bits filled with ZEROS (0)!
```

#### Step-by-Step Comparison: `>>` vs `>>>` on Negative Vector

Let us trace shifting the 8-bit negative vector $V = 8\text{'b}1111\_1000$ ($-8_{10}$) right by 2 positions:

$$\text{Desired Mathematical Result: } \left\lfloor \frac{-8}{2^2} \right\rfloor = \left\lfloor \frac{-8}{4} \right\rfloor = -2_{10} = 8\text{'b}1111\_1110$$

##### 1. Logical Shift Right (`V >> 2`):
* All bits move right by 2 positions.
* Top 2 vacated bits are filled with **zeros ($00_2$)**.
* Output Vector = $8\text{'b}0011\_1110 = +62_{10}$.
* **Result**: **WRONG!** Negative $-8$ became positive $+62$.

##### 2. Arithmetic Shift Right on Signed Type (`$signed(V) >>> 2`):
* All bits move right by 2 positions.
* Top bit $V[7] = 1$ (Sign Bit).
* Top 2 vacated bits are filled with **copies of Sign Bit $V[7]$ ($11_2$)**.
* Output Vector = $8\text{'b}1111\_1110 = -2_{10}$.
* **Result**: **CORRECT!** $-8 / 4 = -2_{10}$.

```text
LOGICAL VS ARITHMETIC SHIFT COMPARISON TABLE

 Operation Expression │ Input Type │ Vector Bit Operation  │ Output Vector │ Decimal Value
──────────────────────┼────────────┼───────────────────────┼───────────────┼───────────────
   V >> 2 (Logical)   │ Unsigned   │ 00_1111_10 (Zero-fill)│ 8'b0011_1110  │  +62 (WRONG!)
   V >>> 2 (Degraded) │ Unsigned   │ 00_1111_10 (Zero-fill)│ 8'b0011_1110  │  +62 (WRONG!)
 $signed(V) >>> 2     │ Signed     │ 11_1111_10 (Sign-fill)│ 8'b1111_1110  │   -2 (CORRECT!)
```


### Pitfall 1: The Sliced Vector Signedness Loss Trap

A classic mistake occurs when an engineer declares a variable as `logic signed`, but then slices a subset of its bits before shifting:

```systemverilog
// DANGEROUS SLICED VECTOR SIGNEDNESS LOSS
logic signed [15:0] raw_audio_sample;
logic signed [15:0] scaled_sample;

// BUG: Slicing raw_audio_sample[7:0] STRIPS the 'signed' attribute!
// The slice raw_audio_sample[7:0] becomes UNSIGNED!
// '>>> 2' degrades to a zero-fill logical right shift!
assign scaled_sample = raw_audio_sample[7:0] >>> 2; 
```

```text
SLICED VECTOR SIGNEDNESS LOSS MECHANISM

 logic signed [15:0] raw_audio_sample;  ──► SIGNED TYPE
                        │
                        ▼ Slicing [7:0]
 raw_audio_sample[7:0]                  ──► STRIPS SIGNED TYPE! BECOMES UNSIGNED!
                        │
                        ▼ Passed to >>> 2
 Arithmetic Shift Right >>> 2            ──► DEGRADES TO LOGICAL ZERO-FILL SHIFT!
```

#### The Fix: Explicitly Cast the Slice with `$signed()`
Whenever you slice a bit range from a signed vector, you **MUST** re-apply `$signed()` to the slice:

```systemverilog
// CORRECT SIGNED SLICE SHIFT
assign scaled_sample = $signed(raw_audio_sample[7:0]) >>> 2; // Correct Sign-Extension!
```


### Pitfall 3: Concatenation in Signed Comparisons

Another major hazard occurs when comparing concatenated vectors against signed values:

```systemverilog
logic signed [7:0] val_a;
logic signed [7:0] val_b;

// DANGEROUS CONCATENATION COMPARISON
if ({val_a, val_b} < 0) begin
    // THIS BRANCH WILL NEVER BE EXECUTED!
end
```

#### Why This Branch Is Never Executed:
Because vector concatenation `{val_a, val_b}` **always yields an unsigned result**, SystemVerilog strips signedness and evaluates `{val_a, val_b}` as an unsigned 16-bit number ($0 \dots 65535$).

An unsigned number can NEVER be less than 0! The compiler optimizes away the `if` branch completely!

#### The Fix:
Cast the concatenated vector using `$signed()`:

```systemverilog
// CORRECT SIGNED CONCATENATION COMPARISON
if ($signed({val_a, val_b}) < 0) begin
    // Executed correctly when MSB val_a[7] == 1!
end
```


### Scenario and Parameters

An aerospace contractor is engineering the **Multi-Sensor Environmental Temperature & Calibration Processor** (`SensorDataProcessor`) for an orbital satellite payload.

The module receives three digital inputs:
1. An 8-bit signed Two's Complement raw temperature sample (`logic signed [7:0] raw_temp`), range $-128^\circ\text{C}$ to $+127^\circ\text{C}$.
2. An 8-bit unsigned factory calibration offset (`logic [7:0] cal_offset`), range $0$ to $255$.
3. A 2-bit scaling shift control (`logic [1:0] shift_scale`), specifying an arithmetic right shift by $0, 1, 2,$ or $3$ bit positions.

```text
MULTI-SENSOR TEMPERATURE PROCESSOR ARCHITECTURE

 Signed Raw Temp raw_temp[7:0] ──────┐
 Unsigned Calib cal_offset[7:0] ─────┼──► [ Sensor Data Processor ] ──► Processed Temp[15:0]
 Shift Control shift_scale[1:0] ─────┘
```

The module must compute a 16-bit signed output vector `processed_temp_out[15:0]` following three exact processing steps:

1. **Step 1 (Signed Addition)**: Add signed `raw_temp` to unsigned `cal_offset` without unsigned expression contamination.
2. **Step 2 (Arithmetic Scaling)**: Scale the intermediate 9-bit signed sum arithmetically (`>>>`) by `shift_scale` positions, preserving Two's Complement sign bits.
3. **Step 3 (Sign-Extended Output Assignment)**: Assign the scaled 9-bit signed result to `processed_temp_out[15:0]` with explicit sign extension.

#### Your Objective

1. Write the complete, synthesizable SystemVerilog module `SensorDataProcessor`.
2. Enforce ``default_nettype none` to prevent implicit net creation bugs.
3. Simulate the module across three distinct test cases:
   * **Test 1 (Positive Temperature)**: `raw_temp = +20` (`8'h14`), `cal_offset = 10` (`8'h0A`), `shift_scale = 1` (Shift Right 1).
   * **Test 2 (Negative Temperature)**: `raw_temp = -40` (`8'hD8`), `cal_offset = 10` (`8'h0A`), `shift_scale = 2` (Shift Right 2).
   * **Test 3 (Mixed-Sign Multiplication)**: Multiply `raw_temp = -8` (`8'hF8`) by unsigned `cal_offset = 5` (`8'h05`), verifying correct negative product $-40_{10}$ (`16'hFFD8`).
4. Trace the intermediate calculations at every step and verify that Two's Complement signedness is preserved throughout.
5. Demonstrate what happens if `$signed()` is omitted from `cal_offset` or if `>>` is used instead of `>>>`.


#### Step 2: Trace Test Case 1 (Positive Temperature)

* Inputs:
  * `raw_temp = +20` (`8'b0001_0100` = `8'h14`).
  * `cal_offset = 10` (`8'b0000_1010` = `8'h0A`).
  * `shift_scale = 1` (`2'b01`, Shift Right by 1 position).

##### Step-by-Step Execution Trace:
1. **Step 1 (Signed Addition)**:
   * `raw_temp` sign-extended to 9 bits: `9'sb0_0001_0100` ($+20_{10}$).
   * `cal_offset` zero-extended to 9 bits and cast to signed: `$signed(9'b0_0000_1010)` ($+10_{10}$).
   * `sum_raw = +20 + 10 = +30_{10}` (`9'sb0_0001_1110`).
2. **Step 2 (Arithmetic Shift Right `>>> 1`)**:
   * `sum_scaled = 9'sb0_0001_1110 >>> 1 = 9'sb0_0000_1111` ($+15_{10}$).
   * Top bit $0$ replicated.
3. **Step 3 (Sign Extension to 16 Bits)**:
   * `processed_temp_out = 16'sb0000_0000_0000_1111` ($+15_{10}$ = `16'h000F`).

```text
TEST CASE 1 EXECUTION TRACE

 raw_temp (+20)           : 0 _ 0 0 0 1 _ 0 1 0 0  (9-Bit Signed +20)
 $signed({1'b0, cal})     : 0 _ 0 0 0 0 _ 1 0 1 0  (9-Bit Signed +10)
                            ─────────────────────
 sum_raw (+30)            : 0 _ 0 0 0 1 _ 1 1 1 0  (9-Bit Signed +30)
 sum_scaled (>>> 1)       : 0 _ 0 0 0 0 _ 1 1 1 1  (9-Bit Signed +15)
 processed_temp_out (16b) : 16'h000F (+15 Decimal!)
```

##### Mathematical Check:
$$\frac{+20 + 10}{2^1} = \frac{30}{2} = \mathbf{+15_{10}}$$
**MATCHES HARDWARE OUTPUT EXACTLY!**


#### Step 4: Trace Test Case 3 (Mixed-Sign Multiplication)

* Inputs:
  * `raw_temp = -8` (`8'b1111_1000` = `8'hF8`).
  * `cal_offset = 5` (`8'b0000_0101` = `8'h05`).

##### Step-by-Step Execution Trace:
1. `raw_temp` = $-8_{10}$.
2. `cal_offset` zero-extended and cast to signed: `$signed({1'b0, cal_offset}) = +5_{10}$.
3. Multiplication:
   $$\text{mult\_product\_out} = (-8_{10}) \times (+5_{10}) = \mathbf{-40_{10}}$$
4. Convert $-40_{10}$ to 16-bit Two's Complement:
   $$-40_{10} = 65536 - 40 = 65496_{10} = 16\text{'b}1111\_1111\_1101\_1000_2 = \mathbf{16\text{'h}FFD8}$$

```text
MIXED-SIGN MULTIPLICATION TRACE

 raw_temp (-8)            : 1 1 1 1 _ 1 0 0 0  (8-Bit Signed)
 $signed({1'b0, cal})     : 0 _ 0 0 0 0 _ 0 1 0 1  (9-Bit Signed +5)
                            ─────────────────────
 mult_product_out (-40)   : 16'hFFD8 (-40 Decimal!)
```

##### Demonstration of Flawed Unsigned Contamination:
If the engineer had omitted `$signed()` from `cal_offset` in Test Case 3 (`raw_temp * cal_offset`):
* `raw_temp` ($-8_{10}$) would be converted to unsigned $+248_{10}$.
* Unsigned multiplication: $248 \times 5 = +1240_{10}$ (`16'h04D8`).
* Output `mult_product_out` would equal **$+1240_{10}$** instead of **$-40_{10}$**!

```text
FLAWED vs SANITIZED MULTIPLICATION OUTPUT

 Flawed Unsigned Code Output  :  16'h04D8 (+1240 Decimal) ──► CATASTROPHIC ERROR!
 Sanitized Signed Code Output :  16'hFFD8 (-40 Decimal)   ──► 100% PERFECT MATH!
```

All test cases, signedness rules, arithmetic right shifts, and type casting operations evaluate with 100% mathematical, physical, and logical precision. The `SensorDataProcessor` module is fully verified.

