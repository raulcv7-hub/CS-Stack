# Two's Complement Representation and Sign Bit Extension Mechanics

## The Silicon Transistor Dilemma: Representing Negative Quantities Without a Physical Minus Sign

At the microscopic level, a digital computer processor is composed entirely of microscopic semiconductor switches. These switches can only inhabit two physical states: an open switch driving a wire to $0\text{ V}$ (Logic $0$), or a closed switch driving a wire to supply voltage (Logic $1$). Nature does not provide a physical minus sign symbol ("$-$") inside silicon transistors. There is no copper trace that can natively carry a hyphen to indicate a negative number.

Yet, real-world computation requires representing negative quantities continuously. A financial database must record monetary debts and account deficits; a flight control computer must process negative altitude rates and backward acceleration vectors; a graphics processing unit must calculate negative spatial coordinates.

If an arithmetic logic unit needs to process negative numbers, how do we encode negative integers using strictly strings of ones and zeros?

Early computer designers attempted two intuitive, naive encoding schemes:

1. **Sign-Magnitude Representation**: Dedicate the leftmost bit (the Most Significant Bit or MSB) to act as a sign flag ($0$ for positive, $1$ for negative), while using the remaining bits to store the positive magnitude.
2. **One's Complement Representation**: Represent a negative number by simply flipping every single bit of its positive counterpart ($0 \to 1$ and $1 \to 0$).

Both naive approaches failed catastrophically when implemented in physical silicon circuits.

```text
THE NAIVE ENCODING FAILURE (SIGN-MAGNITUDE AND ONE'S COMPLEMENT)

 Sign-Magnitude (+0 vs -0):     +0 = 0000_2    vs    -0 = 1000_2
 One's Complement (+0 vs -0):   +0 = 0000_2    vs    -0 = 1111_2
                                      │
                                      ▼
                        DUAL-ZERO AMBIGUITY HAZARD!
            (Wastes State Space & Breaks Standard Addition Gates)
```

Both naive encoding schemes suffer from three fatal hardware engineering flaws:

* **The Dual-Zero Ambiguity**: They produce two distinct binary representations for the number zero: a "positive zero" ($+0$) and a "negative zero" ($-0$). In a 4-bit Sign-Magnitude system, $+0$ is $0000_2$ and $-0$ is $1000_2$. A central processing unit checking if a balance reached zero must build extra, expensive logic gates just to check if the result is $+0$ OR $-0$, wasting clock cycles and silicon area.
* **Hardware Adder Incompatibility**: If you add $+5$ ($0101_2$) and $-5$ ($1101_2$ in Sign-Magnitude) using a standard binary full adder, the circuit computes $0101_2 + 1101_2 = 0010_2$ ($+2$), which is completely wrong! To perform subtraction, the processor would need to build a completely separate, heavy subtractor circuit alongside its adder circuit.
* **End-Around Carry Requirements**: One's Complement addition produces a leftover carry bit that must be fed back into the least significant bit in a second addition pass, doubling the critical path delay of arithmetic operations.

To solve this hardware arithmetic crisis, digital engineering relies on a mathematical encoding scheme: **Two's Complement Representation**. By defining negative numbers through modular arithmetic complementation ($\overline{A} + 1$), two's complement unifies addition and subtraction into a single physical adder circuit, eliminates the dual-zero ambiguity, and allows signed numbers to be expanded across wider processor buses using **Sign Bit Extension**.

---

## The Circular Odometer Rollover: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Two's Complement representation before diving into algebraic equations, let us look at a mechanical device we encounter in everyday life: a car's mechanical mileage counter (an odometer).

Imagine a mechanical odometer on a car dashboard that has four digits, displaying numbers from $0000$ to $9999$.

```text
THE MECHANICAL ODOMETER ROLLOVER WHEEL

 Drive Forward (+) ──►  0000  ──►  0001  ──►  0002  ──►  0003
                         ▲
                         │ (Zero Point)
                         ▼
 Drive Backward (-) ──► 0000  ──►  9999  ──►  9998  ──►  9997
```

Suppose the car is brand new and the odometer reads exactly $0000$.
* If you drive the car **forward** by 1 mile, the mechanical wheel clicks forward to **$0001$**. This represents $+1$.
* If you drive forward by 2 miles, the odometer reads **$0002$** ($+2$).
* Now, imagine you put the car in reverse and drive **backward** by 1 mile starting from $0000$. What does the mechanical wheel display?

The wheel rolls backward past zero, cascading all four digits to **$9999$**!

Ask yourself a fundamental question: What does the number $9999$ represent on this car's dashboard?
Because driving backward 1 mile from $0000$ lands on $9999$, the number **$9999$ naturally behaves as $-1$**!

What happens if you now drive forward 1 mile starting from $9999$?
$9999 + 1 = 10000$. But because the odometer only has four digits, the high $1$ falls off the left side, and the display resets to **$0000$**!
$$9999 + 1 = 0000 \quad \iff \quad (-1) + 1 = 0$$

The mechanical rollover automatically solved the addition problem!

Now let us apply this exact same rollover wheel logic to a **4-bit binary odometer** that can only display 4 binary digits ($0$s and $1$s):

```text
THE 4-BIT BINARY CIRCULAR NUMBER WHEEL

                      0000 (0)
                1111 (-1)   0001 (+1)
           1110 (-2)             0010 (+2)
        1101 (-3)                   0011 (+3)
      1100 (-4)                       0100 (+4)
        1011 (-5)                   0101 (+5)
           1010 (-6)             0110 (+6)
                1001 (-7)   0111 (+7)
                      1000 (-8)
```

Look at this 4-bit binary wheel:
* Start at $0000$ ($0$) and step forward: $0001 (+1), 0010 (+2), 0011 (+3), \dots, 0111 (+7)$.
* Start at $0000$ ($0$) and step **backward** by 1: the 4-bit wheel rolls over to **$1111_2$**. Therefore, $1111_2$ is **$-1$**!
* Step backward by 2: the wheel shows **$1110_2$**. Therefore, $1110_2$ is **$-2$**!
* Step backward by 3: the wheel shows **$1101_2$**. Therefore, $1101_2$ is **$-3$**!

Look at the Most Significant Bit (MSB, the leftmost bit) on this wheel:
* Every positive number ($0$ to $+7$) starts with an MSB of **$0$** ($0000_2$ to $0111_2$).
* Every negative number ($-1$ to $-8$) starts with an MSB of **$1$** ($1111_2$ down to $1000_2$).

This circular rollover continuum is **Two's Complement Representation**. It requires no special minus signs. Negative numbers are simply the natural binary values you reach when you step backward from zero on a finite binary wheel.

---

## Mechanics of Two's Complement Conversion and Modular Complementarity

To master Two's Complement in digital hardware design, we must examine the formal mathematical mechanics of Two's Complement Conversion, range boundaries, and Sign Bit Extension.

---

### Primitive 1: Two's Complement Conversion ($\overline{A} + 1$)

How do we convert a positive binary number $A$ into its negative Two's Complement equivalent $-A$ in hardware without manually counting backward on a wheel?

Mathematically, in an $N$-bit binary system, the Two's Complement of a number $A$ is defined as its modular complement with respect to $2^N$:

$$
-A \equiv 2^N - A \pmod{2^N}
$$

Where:
* $-A$ is the $N$-bit Two's Complement representation of negative $A$.
* $2^N$ is the modular modulus for an $N$-bit system (e.g., $2^4 = 16$ for a 4-bit system).
* $A$ is the positive binary integer magnitude.

#### The Bit-Inversion Plus One Hardware Shortcut

Performing subtraction $2^N - A$ directly in hardware would require a subtractor circuit—defeating the goal of avoiding subtractor gates!

Fortunately, Boolean algebra provides a mathematical identity that allows us to compute $2^N - A$ using only **inversion (NOT gates) and a single addition of 1**:

Notice that $2^N - 1$ in binary is a string of all $1$s ($1111_2$ for $N=4$).
If you subtract any number $A$ from a string of all $1$s, no borrows ever occur! Subtracting $A$ from $1111_2$ is identical to flipping every bit of $A$ (computing its Bitwise NOT, $\overline{A}$):

$$
(2^N - 1) - A = \overline{A}
$$

Rearranging this algebraic equation to isolate $2^N - A$:

$$
2^N - A = \overline{A} + 1
$$

This is the **Two's Complement Conversion Rule**:
> To find the negative Two's Complement representation of any binary number $A$, **invert all of its bits ($\overline{A}$) and add $1$ to the result.**

```text
TWO'S COMPLEMENT CONVERSION PIPELINE

 Positive Number A  ──► [ Bitwise Inverter (NOT) ] ──► Bitwise Complement A'
                                                             │
                                                             ▼
 Negative Number (-A) ◄── [ Binary Adder (+ 1) ] ────────────┘
```

#### Step-by-Step Conversion Example: Finding $-5$ in a 4-Bit System

Let us find the 4-bit Two's Complement representation of $-5_{10}$:

1. **Start with positive $+5_{10}$ in 4-bit binary**:
   $$+5_{10} = 0101_2$$
2. **Invert every bit ($\overline{A}$, One's Complement)**:
   $$\overline{0101_2} = 1010_2$$
3. **Add $1$ to the inverted result**:
   $$1010_2 + 0001_2 = 1011_2$$

Therefore, in a 4-bit system, **$-5_{10} = 1011_2$**.

Let us check this against our modular definition $2^N - A$:
$$2^4 - 5 = 16 - 5 = 11_{10} = 1011_2$$
The bit-inversion shortcut $\overline{A} + 1$ produces the exact same result as $2^N - A$!

---

### Uniqueness of Zero in Two's Complement

Why does Two's Complement eliminate the dual-zero ambiguity ($+0$ vs $-0$) that plagued Sign-Magnitude and One's Complement?

Let us apply the Two's Complement rule ($\overline{A} + 1$) to positive zero ($0000_2$) in a 4-bit system:

1. Start with $+0_{10} = 0000_2$.
2. Invert all bits: $\overline{0000_2} = 1111_2$.
3. Add $1$:
   $$1111_2 + 0001_2 = 10000_2$$

```text
TWO'S COMPLEMENT CONVERSION OF ZERO

 Start:          0 0 0 0  (+0)
 Invert Bits:    1 1 1 1
 Add 1:        + 0 0 0 1
                ─────────
 Result:       1 0 0 0 0
               │ └──┬──┘
               │    └── 4-Bit Result = 0000_2 (Zero!)
               └─────── 5th Carry Bit Discarded (Overflow out of 4-bit bus)
```

Look at the 4-bit result: **$0000_2$**!
The 5th carry bit ($1$) falls off the left edge of the 4-bit bus and is discarded by hardware. 

Taking the Two's Complement of zero returns $0000_2$. **Zero is uniquely represented by $0000_2$**. There is no $-0$.

---

### Dynamic Range of $N$-Bit Two's Complement

In an $N$-bit Two's Complement system, the total $2^N$ available states are divided between positive numbers, zero, and negative numbers:

* **Positive Numbers**: $1$ to $2^{N-1} - 1$ (MSB is $0$).
* **Zero**: $0$ (MSB is $0$).
* **Negative Numbers**: $-1$ down to $-2^{N-1}$ (MSB is $1$).

The general formula for the valid numerical range of an $N$-bit Two's Complement system is:

$$
\text{Range} = \left[ -2^{N-1}, \, +2^{N-1} - 1 \right]
$$

Where:
* $N$ is the number of bits in the binary register.
* $-2^{N-1}$ is the minimum (most negative) representable integer.
* $+2^{N-1} - 1$ is the maximum (most positive) representable integer.

```text
TWO'S COMPLEMENT DYNAMIC RANGE COMPARISON

 Bit Width (N) │ Total States (2^N) │ Minimum Negative (-2^(N-1)) │ Maximum Positive (+2^(N-1) - 1)
───────────────┼────────────────────┼──────────────────────────────┼─────────────────────────────────
     4 Bits    │         16         │             -8               │               +7
     8 Bits    │        256         │            -128              │              +127
    16 Bits    │       65,536       │           -32,768            │             +32,767
    32 Bits    │   4,294,967,296    │       -2,147,483,648         │         +2,147,483,647
```

Notice an asymmetric property: **There is one more negative number than positive numbers!**
In a 4-bit system, the range is $[-8, +7]$. The number $-8$ ($1000_2$) exists, but $+8$ does not fit in 4 bits. This asymmetry occurs because zero occupies one of the positive-MSB slots ($0000_2$).

---

### Primitive 2: Sign Bit Extension Mechanics

In computer processors, data registers often have different bit widths. A CPU might load a 4-bit or 8-bit signed integer from a sensor and need to copy it into a 16-bit or 32-bit internal register before performing arithmetic.

If a number is positive (e.g., $+5_{10} = 0101_2$), expanding it from 4 bits to 8 bits is intuitive: you simply pad the left side with zeros:

$$+5_{10} \text{ (4-bit)} = 0101_2 \quad \longrightarrow \quad +5_{10} \text{ (8-bit)} = 00000101_2$$

What happens if you try to pad a **negative number** with zeros?

Take $-5_{10}$ in 4-bit Two's Complement: $1011_2$.
If you pad the left side with zeros to make an 8-bit number ($00001011_2$), look at what you get:
$$00001011_2 = +11_{10} \neq -5_{10}$$

Padding a negative number with zeros completely corrupts its value! It turned a negative number into a positive number because the MSB became $0$!

To expand a signed Two's Complement number to a wider bit width without altering its numerical value, hardware must use **Sign Bit Extension**.

**The Sign Bit Extension Rule**:
> To expand an $N$-bit Two's Complement signed number to a wider $M$-bit bus ($M > N$), **replicate the Most Significant Bit (the Sign Bit) across all new upper bit positions.**

```text
SIGN BIT EXTENSION HARDWARE OPERATION

 Positive Case (MSB = 0):
  4-Bit Value:          0 1 0 1   (+5)
  Extended to 8-Bit:  0 0 0 0 0 1 0 1   (+5)  ◄── Upper bits filled with 0s!

 Negative Case (MSB = 1):
  4-Bit Value:          1 0 1 1   (-5)
  Extended to 8-Bit:  1 1 1 1 1 0 1 1   (-5)  ◄── Upper bits filled with 1s!
```

#### Mathematical Proof of Sign Bit Extension

Why does copying the MSB ($1$) preserve the exact negative value?

Recall how a negative Two's Complement number is evaluated in positional notation. The Most Significant Bit $b_{N-1}$ carries a **negative weight** of $-2^{N-1}$, while all lower bits $b_k$ carry positive weights $+2^k$:

$$
\text{Value} = -b_{N-1} \cdot 2^{N-1} + \sum_{k=0}^{N-2} b_k \cdot 2^k
$$

Where:
* $b_{N-1}$ is the sign bit (MSB), weighted negatively as $-2^{N-1}$.
* $b_k$ are the lower data bits, weighted positively as $+2^k$.

Let us evaluate 4-bit $-5_{10} = 1011_2$ using positional weights:
$$\text{Value} = (-1 \cdot 2^3) + (0 \cdot 2^2) + (1 \cdot 2^1) + (1 \cdot 2^0) = -8 + 0 + 2 + 1 = -5_{10}$$

Now let us evaluate the sign-extended 8-bit representation $11111011_2$:
$$\text{Value} = (-1 \cdot 2^7) + (1 \cdot 2^6) + (1 \cdot 2^5) + (1 \cdot 2^4) + (1 \cdot 2^3) + (0 \cdot 2^2) + (1 \cdot 2^1) + (1 \cdot 2^0)$$
$$\text{Value} = -128 + 64 + 32 + 16 + 8 + 0 + 2 + 1 = -128 + 123 = -5_{10}$$

The value is **$-5_{10}$**!

The sum of the new positive power weights ($+64 + 32 + 16 + 8 = +120$) exactly offsets the increased negative weight of the new MSB ($-128$ instead of $-8$), leaving the net numerical value completely unchanged!

---

## Unified Addition and Subtraction in Hardware

The greatest achievement of Two's Complement representation is that **it allows a binary adder circuit to perform both addition AND subtraction using the exact same hardware!**

Consider subtracting $3$ from $7$ ($7 - 3 = 4$).
In Two's Complement, subtracting $3$ is identical to adding negative $3$:

$$
7 - 3 = 7 + (-3)
$$

In a 4-bit system:
* $+7_{10} = 0111_2$
* $-3_{10} = 1101_2$ (derived via $\overline{0011_2} + 1 = 1100_2 + 1 = 1101_2$)

Let us feed $0111_2$ and $1101_2$ directly into a standard 4-bit binary adder:

```text
4-BIT TWO'S COMPLEMENT ADDITION: 7 + (-3)

   Carry-In Bits:   1 1 1 1 0
   Operand A (+7):    0 1 1 1
   Operand B (-3):  + 1 1 0 1
                    ─────────
   Raw 5-Bit Result:1 0 0 1 0
                    │ └──┬──┘
                    │    └── 4-Bit Result = 0100_2 (+4 Decimal!)
                    └─────── 5th Carry Bit Discarded
```

Look at the 4-bit output: **$0100_2 = +4_{10}$**!

The standard binary full adder performed subtraction without knowing or caring that one of its inputs was negative! It simply executed standard binary addition, and the modular complementation of Two's Complement produced the correct answer automatically.

---

## Arithmetic Overflow in Two's Complement

What happens if an addition produces a result that exceeds the valid range $[-2^{N-1}, +2^{N-1}-1]$ of an $N$-bit system?

For example, in a 4-bit system (range $-8$ to $+7$), what happens if we add $+5$ ($0101_2$) and $+4$ ($0100_2$)?
Mathematically, $5 + 4 = +9$. But $+9$ cannot fit in a 4-bit signed system (maximum positive value is $+7$).

Let us feed $0101_2$ ($+5$) and $0100_2$ ($+4$) into a 4-bit binary adder:

```text
TWO'S COMPLEMENT ARITHMETIC OVERFLOW

   Carry-In Bits:   0 1 0 0 0
   Operand A (+5):    0 1 0 1
   Operand B (+4):  + 0 1 0 0
                    ─────────
   4-Bit Result  :    1 0 0 1  (-7 Decimal! OVERFLOW ERROR!)
```

Look at the result: $1001_2 = -7_{10}$!
Adding two positive numbers produced a **negative result**! This condition is called **Arithmetic Overflow**.

### Detecting Two's Complement Overflow in Hardware

How does a processor detect that an arithmetic overflow has occurred?

An overflow occurs if and only if:
1. Adding two positive numbers yields a negative result.
2. Adding two negative numbers yields a positive result.

In hardware gate logic, **Arithmetic Overflow ($V$)** is detected by comparing the carry entering the MSB position ($C_{\text{in,MSB}}$) with the carry leaving the MSB position ($C_{\text{out,MSB}}$) using an **XOR gate**:

$$
V = C_{\text{in,MSB}} \oplus C_{\text{out,MSB}}
$$

Where:
* $V$ is the Overflow Flag ($V = 1$ indicates arithmetic overflow corruption).
* $C_{\text{in,MSB}}$ is the carry bit entering the most significant bit stage.
* $C_{\text{out,MSB}}$ is the carry bit leaving the most significant bit stage.

```text
HARDWARE OVERFLOW DETECTION GATE

 Carry into MSB (Cin,MSB)   ──┐
                              ├──► [ XOR Gate ] ──► Overflow Flag V
 Carry out of MSB (Cout,MSB) ─┘                    (1 = Arithmetic Overflow!)
```

In our $+5 + (+4)$ example:
* Carry into MSB bit $3$: $C_{\text{in,3}} = 1$.
* Carry out of MSB bit $3$: $C_{\text{out,3}} = 0$.
* $V = 1 \oplus 0 = 1$ (**OVERFLOW DETECTED!**).

The processor immediately sets its Overflow Flag ($V = 1$) to alert the operating system that the calculation exceeded hardware limits.

---

## Solved Industrial Engineering Exercise: Flight Control Bus Expansion and Signed Arithmetic

To solidify your complete mastery of Two's Complement conversion, Sign Bit Extension, signed arithmetic, and overflow detection, we will now walk through a complete, step-by-step aerospace software and hardware engineering problem.

---

### Scenario and Parameters

An avionics defense firm is engineering the Flight Data Recorder (FDR) bus interface for a fighter jet. The pitch-rate sensor emits a 4-bit signed Two's Complement integer $A[3:0]$ representing angular pitch velocity in degrees per second.

The FDR internal telemetry processor operates on an **8-bit signed data bus**.

```text
AVIONICS BUS EXPANSION AND ARITHMETIC INTERFACE

 4-Bit Sensor Bus A[3:0] ──► [ Sign Extension Unit ] ──► 8-Bit Extended Bus A_ext[7:0]
                                                               │
 8-Bit Offset Bus B[7:0] ──────────────────────────────────────┼──► [ 8-Bit Signed Adder ]
                                                               │
                                                               ▼
                                                    Telemetry Result & Flags
```

The system receives two inputs:
1. Sensor Pitch Velocity: $A = 1101_2$ (4-bit Two's Complement).
2. Calibration Offset: $B = 00000110_2$ (8-bit Two's Complement, $+6_{10}$).

#### Your Objective

1. Convert the 4-bit Two's Complement sensor value $A = 1101_2$ into its decimal equivalent to identify the pitch rate.
2. Perform **Sign Bit Extension** to expand $A = 1101_2$ from 4 bits to 8 bits ($A_{\text{ext}}[7:0]$). Verify algebraically that its decimal value is preserved.
3. Perform 8-bit Two's Complement addition of $A_{\text{ext}}[7:0] + B[7:0]$ in binary.
4. Calculate the 8-bit Two's Complement representation of $-A_{\text{ext}}$ using the bit-inversion plus one rule ($\overline{X} + 1$).
5. Evaluate whether arithmetic overflow occurred ($V = C_{\text{in,MSB}} \oplus C_{\text{out,MSB}}$).

---

### Step-by-Step Derivation

#### Step 1: Decimal Evaluation of 4-Bit Sensor Value $A = 1101_2$

Input $A = 1101_2$ is a 4-bit Two's Complement signed number.
The MSB ($A_3 = 1$) indicates a **negative quantity**.

To find its negative magnitude, we apply positional weight expansion:

$$
\text{Value} = -A_3 \cdot 2^3 + A_2 \cdot 2^2 + A_1 \cdot 2^1 + A_0 \cdot 2^0
$$

Substituting $A_3=1, A_2=1, A_1=0, A_0=1$:

$$
\text{Value} = -1 \cdot 2^3 + 1 \cdot 2^2 + 0 \cdot 2^1 + 1 \cdot 2^0 = -8 + 4 + 0 + 1 = -3_{10}
$$

The sensor is reporting a pitch velocity of **$-3\text{ degrees/sec}$** (nose pitching downward).

---

#### Step 2: Sign Bit Extension from 4 Bits to 8 Bits

We need to expand $A = 1101_2$ from 4 bits to 8 bits ($A_{\text{ext}}[7:0]$).

1. Identify the Sign Bit (MSB, Bit 3): $A_3 = 1$.
2. Replicate $A_3 = 1$ across all new upper bit positions (Bits 7, 6, 5, 4):

$$
A_{\text{ext}}[7:0] = 11111101_2
$$

##### Algebraic Verification of 8-Bit Value:
Using positional weights for an 8-bit Two's Complement number:

$$
\text{Value} = -A_7 \cdot 2^7 + \sum_{k=0}^{6} A_k \cdot 2^k
$$

$$
\text{Value} = -1 \cdot 128 + 1 \cdot 64 + 1 \cdot 32 + 1 \cdot 16 + 1 \cdot 8 + 1 \cdot 4 + 0 \cdot 2 + 1 \cdot 1
$$

$$
\text{Value} = -128 + 64 + 32 + 16 + 8 + 4 + 0 + 1 = -128 + 125 = -3_{10}
$$

The sign-extended 8-bit value $11111011_2$ is **$-3_{10}$**. The sign extension preserved the exact numerical value!

---

#### Step 3: Perform 8-Bit Two's Complement Addition ($A_{\text{ext}} + B$)

We add $A_{\text{ext}} = 11111101_2$ ($-3_{10}$) and calibration offset $B = 00000110_2$ ($+6_{10}$):

```text
8-BIT SIGNED BINARY ADDITION: (-3) + (+6)

   Carry Bits:     1 1 1 1 1 1 0 0 0
   A_ext (-3):       1 1 1 1 1 1 0 1
   B     (+6):     + 0 0 0 0 0 1 1 0
                   ─────────────────
   9-Bit Result:   1 0 0 0 0 0 0 1 1
                   │ └──────┬──────┘
                   │        └── 8-Bit Result = 00000011_2 (+3 Decimal!)
                   └────────── 9th Carry Bit C8 Discarded
```

Let us evaluate the 8-bit result $00000011_2$:
$$\text{Result} = 00000011_2 = +3_{10}$$

Decimal check: $(-3) + (+6) = +3_{10}$.
The 8-bit Two's Complement addition performed signed arithmetic with 100% mathematical perfection!

---

#### Step 4: Compute $-A_{\text{ext}}$ using Bit-Inversion Plus One ($\overline{X} + 1$)

We calculate the positive magnitude of $A_{\text{ext}} = 11111101_2$ (which is $-(-3) = +3_{10}$):

1. **Invert all bits of $A_{\text{ext}}$**:
   $$\overline{11111101_2} = 00000010_2$$
2. **Add $1$**:
   $$00000010_2 + 00000001_2 = 00000011_2$$

Result: $-A_{\text{ext}} = 00000011_2 = +3_{10}$.
The Two's Complement conversion rule worked flawlessly.

---

#### Step 5: Evaluate Overflow Flag ($V$)

Let us check if arithmetic overflow occurred during $A_{\text{ext}} + B$:
* Carry into MSB (Bit 7): $C_{\text{in,7}} = 1$.
* Carry out of MSB (Bit 7): $C_{\text{out,7}} = 1$.

Evaluating the Overflow Flag equation $V = C_{\text{in,MSB}} \oplus C_{\text{out,MSB}}$:

$$
V = 1 \oplus 1 = 0
$$

$V = 0$ (No Overflow!). The result $+3_{10}$ is within the valid 8-bit range $[-128, +127]$.

---

### Sanity Check and Verification

Let us verify our Two's Complement and Sign Extension calculations against three edge-case flight scenarios:

#### Scenario A: Maximum Negative Sensor Reading ($A = 1000_2$)
* **Input**: $A = 1000_2$ (4-bit Two's Complement).
* **Positional Weight Check**: $-1 \cdot 2^3 + 0 = -8_{10}$.
* **Sign Extension to 8-Bit**: Sign bit is $A_3 = 1$. Replicating $1$s yields $11111000_2$.
* **8-Bit Positional Evaluation**: $-128 + 64 + 32 + 16 + 8 = -128 + 120 = -8_{10}$.
* **Verification**: Value $-8_{10}$ preserved! **SIGN EXTENSION SUCCESSFUL!**

#### Scenario B: Zero Sensor Reading ($A = 0000_2$)
* **Input**: $A = 0000_2$ ($0_{10}$).
* **Sign Extension**: Sign bit is $A_3 = 0$. Replicating $0$s yields $00000000_2$ ($0_{10}$).
* **Two's Complement Conversion of Zero**: Invert $00000000_2 \to 11111111_2$. Add $1 \to 100000000_2$. Discard 9th bit $\to 00000000_2$.
* **Verification**: Zero is uniquely $00000000_2$. **ZERO UNIQUENESS PROVEN!**

#### Scenario C: Overflow Condition During Addition
* **Operands**: Add $+100_{10}$ ($01100100_2$) and $+50_{10}$ ($00110010_2$).
* **Expected Result**: $100 + 50 = 150_{10}$. But maximum 8-bit signed value is $+127_{10}$! Must trigger $V = 1$.
* **Binary Addition**:
  $$01100100_2 + 00110010_2 = 10010110_2 \quad (-106_{10}!)$$
* **Carry Analysis**: Carry into Bit 7 = $1$. Carry out of Bit 7 = $0$.
* **Overflow Evaluation**: $V = 1 \oplus 0 = 1$.
* **Verification**: $V = 1$. **OVERFLOW DETECTED IMMEDIATELY!**

All scenarios evaluate with 100% mathematical precision. The Two's Complement and Sign Bit Extension mechanics are fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Two's Complement Conversion**: The binary encoding scheme where the negative of a number $A$ is generated by inverting all its bits and adding one ($\overline{A} + 1$), eliminating negative zero ambiguities and allowing signed addition and subtraction to be executed by identical binary adder hardware.
* **Sign Bit Extension**: The hardware technique of replicating the Most Significant Bit (the sign bit) across new upper bit positions when expanding a signed Two's Complement number to a wider bus width, preserving its exact negative or positive arithmetic value.
