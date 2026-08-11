content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/01-cache-side-channel-attacks/02-execution-unit-side-channels/02-variable-time-arithmetic-leakage.md
# Variable-Time Arithmetic Execution Leakage and Data-Dependent ALU Timing Mechanics

When a central processing unit executes basic mathematical instructions—such as integer multiplication or division—internal hardware execution units within the Arithmetic Logic Unit (ALU) perform multi-cycle digital arithmetic across physical transistor arrays. To optimize power consumption and maximize instruction throughput, computer architects equip hardware multipliers and dividers with early-termination logic, leading-zero detection circuits, and shift-skip algorithms like Booth's encoding or SRT division. These hardware optimizations allow the execution unit to complete an arithmetic instruction in fewer clock cycles whenever the input operands contain leading zeros, small numeric magnitudes, or repeated bit patterns. However, when these variable-time hardware execution units process sensitive cryptographic data—such as private keys, secret exponent bits, or internal modular arithmetic limbs—the physical clock cycle latency of a single `mul` or `div` instruction becomes a direct mathematical function of the secret data values. Even if a software developer writes "constant-time" code that contains zero conditional branches and zero secret-dependent memory accesses, the underlying hardware execution units themselves leak the secret key bits through nanosecond-level execution timing variations. By measuring the total execution duration of arithmetic operations over a high-resolution time-stamp counter, an unprivileged observer can reconstruct secret keys and internal cryptographic states without ever triggering a cache miss, violating memory permissions, or breaking operating system isolation boundaries.

```text
VARIABLE-TIME ARITHMETIC TIMING LEAKAGE

 Operand A (Secret Key Bits)  ──┐
                                ├──► [ Hardware Multiplier / Divider ]
 Operand B (Known Public Data) ──┘    (Early-Out / Leading Zero Logic)
                                               │
                                               ▼
 Variable Clock Cycle Duration: 1 Cycle (Small Data) vs 4 Cycles (Large Data)
                                               │
                                               ▼
 Attacker Measures Total Time ──► INFERS SECRET OPERAND MAGNITUDE AND BITS!
```

---

## The Cash Counting Machine and the Empty Bills

To build an intuitive, crystal-clear mental model of how variable-time arithmetic hardware leaks secret information, let us consider an everyday analogy: an automated cash counting machine at a bank.

Imagine a bank teller (the Victim Thread) working inside a private glass booth. The teller's job is to count stacks of paper bills containing secret monetary amounts (the Secret Key). An observer (the Attacker) stands outside the glass booth. The observer cannot see inside the booth, cannot see the money, and cannot read the numbers written on the bills. Software privacy rules strictly prohibit the bank from revealing the secret balance.

However, the bank booth is equipped with an automated currency counting machine (the Hardware Arithmetic Logic Unit).

This cash counting machine operates using a smart power-saving feature:
1. When a bill fed into the machine is a standard, printed banknote, an optical sensor reads the bill and counts it in exactly **1 second**.
2. When the machine detects an empty, blank piece of paper (representing a leading zero in a number), a fast optical sensor detects the blank paper instantly, bypasses the complex bill-verifier circuit, and passes the blank paper through in just **0.1 seconds**!

Now, imagine the bank teller feeds a 4-digit number represented as four paper sheets into the counting machine:
* If the secret number is **$0007$** (three blank leading sheets followed by one real bill), the machine processes the three blank sheets in $0.1 \times 3 = 0.3\text{ seconds}$, and processes the one real bill in $1.0\text{ second}$. The total counting time is **$1.3\text{ seconds}$**.
* If the secret number is **$9876$** (four real printed bills with no leading blank sheets), the machine processes all four bills through the complex verifier circuit. The total counting time is $1.0 \times 4 = \mathbf{4.0\text{ seconds}}$.

```text
CASH COUNTING MACHINE TIMING LEAKAGE

 Small Number (0007) ──► [3 Blanks (0.3s)] + [1 Bill (1.0s)]  ──► Total = 1.3s
 Large Number (9876) ──► [4 Real Bills (1.0s each)]          ──► Total = 4.0s
```

The observer sitting outside the glass booth cannot see the bills, but they can hear the whirring sound of the counting machine and use a stopwatch to measure the total time elapsed:
* **Scenario A**: The machine whirs for **$1.3\text{ seconds}$** and stops. The observer thinks: *"The machine finished in 1.3 seconds! That means the first three sheets were completely blank! The secret number must be very small (less than 10)!"*
* **Scenario B**: The machine whirs for **$4.0\text{ seconds}$** and stops. The observer thinks: *"The machine took a full 4.0 seconds! That means every single sheet contained real printed data! The secret number must be a large 4-digit number!"*

Notice what the observer accomplished:
* The observer never entered the glass booth.
* The observer never touched the secret money.
* The observer never broke any privacy laws or security locks.
* The observer simply listened to the physical time duration ($1.3\text{ seconds}$ versus $4.0\text{ seconds}$) required by the automated machine to process the input!
* The physical operational latency of the machine exposed the magnitude and leading-zero structure of the secret number with $100\%$ accuracy!

This currency counting machine is the exact physical analogue of **Variable-Time Arithmetic Execution Leakage**:
* The bank teller is the **Victim Software Thread** (e.g., an RSA decryption or ECC point multiplication loop).
* The secret monetary amount is the **Secret Cryptographic Key**.
* Blank paper sheets are **Leading Zeros in Binary Operands**.
* Printed banknotes are **Active Non-Zero Binary Bits**.
* The automated counting machine is the **CPU Hardware Multiplier or Divider**.
* Skipping blank sheets in 0.1 seconds is the **Early-Out / Leading-Zero Count Circuit**.
* The stopwatch measuring $1.3\text{s}$ versus $4.0\text{s}$ is the **Hardware Time-Stamp Counter (`RDTSC`)**.

---

## Hardware Execution Units: Multipliers, Dividers, and Variable Clock Latencies

To understand why a microprocessor takes a variable number of clock cycles to multiply or divide two numbers, we must examine the digital logic architecture of hardware execution units inside the CPU core.

When an assembly instruction such as `imul` (integer multiplication) or `idiv` (integer division) is dispatched by the CPU scheduler, the operation is routed to a specialized physical execution unit within the Arithmetic Logic Unit (ALU).

```text
SUPERSCALAR ALU EXECUTION UNIT ROUTING

 Instruction Pipeline Dispatch
               │
               ├──► [ Integer Adder / Logic Unit ] ──► 1 Clock Cycle (Fixed)
               │
               ├──► [ Hardware Multiplier Core ]   ──► 1 to 4 Cycles (Variable!)
               │
               └──► [ Hardware Divider Core ]      ──► 6 to 40 Cycles (Variable!)
```

Unlike simple bitwise operations (`AND`, `OR`, `XOR`) or addition (`ADD`), which execute in a single fixed clock cycle ($1\text{ cycle}$), multiplication and division are inherently multi-step iterative mathematical operations.

---

### Hardware Multipliers and Early-Out (Leading-Zero) Optimization

In digital arithmetic, multiplying two 64-bit integers ($A \times B$) involves calculating partial products and summing them together. A full 64-bit by 64-bit array multiplier requires thousands of logic gates and substantial dynamic switching power.

To save silicon die area and dynamic power, processor architects design hardware multipliers using **Pipelined Iterative Multipliers** or **Shift-Add Architectures** with **Early-Out (Early Termination) Logic**.

#### The Early-Out Mechanism

Consider the binary multiplication of two 64-bit unsigned integers: $A \times B$.

$$\text{Operand } A = \text{0x0000\_0000\_1234\_5678}$$

$$\text{Operand } B = \text{0x0000\_0000\_0000\_0005}$$

Look at Operand $B$:
The upper 60 bits of Operand $B$ are all zeros (`0x0000_0000_0000_0000`). Only the lower 4 bits contain active data ($0101_2 = 5_{10}$).

If a hardware multiplier evaluates all 64 bits of Operand $B$ sequentially, it will spend 60 clock steps multiplying Operand $A$ by zero! Adding zero to a partial product sum produces no change in the result.

To eliminate this waste, hardware engineers install an **Early-Out Detection Circuit** (a Leading-Zero Count unit) at the input stage of the multiplier:

```text
EARLY-OUT MULTIPLIER HARDWARE BLOCK DIAGRAM

 Operand B (64 Bits) ──► [ Leading Zero Count (LZC) ] ──► Determines Active Bit Width
                                                                    │
                                                                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ Multiplier Processing Core                                       │
 │  * 16-Bit Active Operand  ──► Completes in 1 Clock Cycle!        │
 │  * 32-Bit Active Operand  ──► Completes in 2 Clock Cycles!       │
 │  * 48-Bit Active Operand  ──► Completes in 3 Clock Cycles!       │
 │  * 64-Bit Active Operand  ──► Completes in 4 Clock Cycles!       │
 └──────────────────────────────────────────────────────────────────┘
```

#### How the Early-Out Circuit Operates:

1. **Input Inspection**: Before computation begins, the Leading-Zero Count (LZC) circuit inspects the most significant bits (MSBs) of Operands $A$ and $B$.
2. **Bit-Width Chunking**: The multiplier partitions 64-bit operands into 16-bit processing chunks (blocks of 16 bits).
3. **Early Termination Check**:
   * If upper 48 bits are all zeros (or all ones for signed negative numbers), the multiplier processes only the lowest 16-bit block and terminates execution in **$1\text{ clock cycle}$**!
   * If upper 32 bits are all zeros, the multiplier processes two 16-bit blocks and terminates in **$2\text{ clock cycles}$**.
   * If upper 16 bits are all zeros, the multiplier processes three 16-bit blocks and terminates in **$3\text{ clock cycles}$**.
   * If all 64 bits contain active non-zero data, the multiplier executes its full pipeline in **$4\text{ clock cycles}$**.

```text
EARLY-OUT MULTIPLIER LATENCY SPECTRUM

 Active Bit-Width of Operand B │ Multiplier Execution Latency
───────────────────────────────┼───────────────────────────────
  1 to 16 Active Bits          │ 1 Clock Cycle  (Fastest!)
 17 to 32 Active Bits          │ 2 Clock Cycles
 33 to 48 Active Bits          │ 3 Clock Cycles
 49 to 64 Active Bits          │ 4 Clock Cycles (Slowest!)
```

#### Mathematical Formulation of Multiplier Latency

Let $T_{\text{mul}}(A, B)$ be the physical clock cycle execution time required to multiply 64-bit integer $A$ by 64-bit integer $B$.

The latency function is governed by the maximum active bit-width ($\text{MSB}$) between the two operands:

$$M_{\text{active}} = \max\left( \text{MSB}(A), \, \text{MSB}(B) \right)$$

$$\mathbf{T_{\text{mul}}(A, B) = T_{\text{base}} + \left\lceil \frac{M_{\text{active}}}{K_{\text{chunk}}} \right\rceil \cdot T_{\text{step}}}$$

Where:
* $T_{\text{mul}}(A, B)$ is the total multiplication latency in CPU clock cycles.
* $T_{\text{base}}$ is the base overhead latency for instruction decode and issue (typically $T_{\text{base}} = 1\text{ cycle}$).
* $\text{MSB}(X)$ is the position of the most significant non-zero bit in integer $X$ ($\text{MSB}(X) \in [1, 64]$).
* $K_{\text{chunk}}$ is the bit-width of the hardware multiplier's processing block (e.g., $K_{\text{chunk}} = 16\text{ bits}$).
* $T_{\text{step}}$ is the clock cycle cost per additional processing chunk (typically $T_{\text{step}} = 1\text{ cycle}$).
* $\lceil \cdot \rceil$ is the ceiling function.

Let us evaluate $T_{\text{mul}}(A, B)$ for two different numerical inputs on a chip where $T_{\text{base}} = 0$, $K_{\text{chunk}} = 16$, and $T_{\text{step}} = 1$:

#### Example 1: Small Secret Value ($B = 5_{10} = 0000\_0101_2 \implies \text{MSB}(B) = 3$)

$$T_{\text{mul}}(A, 5) = 0 + \left\lceil \frac{3}{16} \right\rceil \cdot 1 = \lceil 0.1875 \rceil \cdot 1 = \mathbf{1 \text{ Clock Cycle}}$$

#### Example 2: Large Secret Value ($B = 2^{60} \implies \text{MSB}(B) = 61$)

$$T_{\text{mul}}(A, 2^{60}) = 0 + \left\lceil \frac{61}{16} \right\rceil \cdot 1 = \lceil 3.8125 \rceil \cdot 1 = \mathbf{4 \text{ Clock Cycles}}$$

$$\text{Timing Delta } \Delta T = 4 - 1 = \mathbf{3 \text{ Clock Cycles}}$$

Look at the physical result:
The exact same `imul` assembly instruction takes **$1\text{ clock cycle}$** for $B = 5$, and takes **$4\text{ clock cycles}$** for $B = 2^{60}$! 

A $3\text{-cycle}$ timing delta exists purely based on the numeric value of Operand $B$!

---

### Hardware Dividers and Iterative Quotient Generation (SRT Division)

While multipliers exhibit latency variations ranging from 1 to 4 cycles, **hardware dividers exhibit much larger latency variations—ranging from 6 to over 40 clock cycles!**

Division ($A / B$) cannot be computed in a single forward pass because each quotient bit depends on the remainder generated by previous subtraction steps.

Modern high-speed CPU hardware dividers utilize **Sweeney-Robertson-Tocher (SRT) Division** or **Non-Restoring Division** algorithms.

```text
SRT HARDWARE DIVIDER EXECUTION DATAPATH

 Dividend A & Divisor B ──► [ Normalization Shifter ] ──► Align MSB Bits
                                                                │
                                                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ Iterative Quotient Digit Selection Table (Lookup ROM)        │
 │  * Generates 2 or 4 Quotient Bits per Cycle                  │
 │  * Subtracts Normalized Divisor from Remainder               │
 │  * Terminates when Remainder == 0 OR Bit Limit Reached       │
 └──────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
 Total Division Time = 6 Cycles (Small Dividend) to 40 Cycles (Large Dividend)!
```

#### How Hardware Dividers Operate:

1. **Normalization Phase**: The divider calculates the difference between the most significant bit of Dividend $A$ and Divisor $B$:
   $$\Delta \text{MSB} = \text{MSB}(A) - \text{MSB}(B)$$
   If Dividend $A$ is small ($\text{MSB}(A)$ is low) and Divisor $B$ is large ($\text{MSB}(B)$ is high), the quotient is zero or very small, requiring few shift-subtraction steps!
2. **Iterative Digit Generation**: The divider generates $2\text{ or } 4\text{ quotient bits}$ per clock cycle.
3. **Early Zero Termination**: If the partial remainder becomes zero before all 64 quotient bits are calculated, the hardware divider **terminates execution immediately**, returning the result to the pipeline!

#### Mathematical Formulation of Divider Latency

Let $T_{\text{div}}(A, B)$ be the physical clock cycle execution time required to divide $A$ by $B$.

$$\mathbf{T_{\text{div}}(A, B) = T_{\text{norm}} + \max\left(0, \left\lceil \frac{\text{MSB}(A) - \text{MSB}(B)}{Q_{\text{bits}}} \right\rceil \right) \cdot T_{\text{cycle}}}$$

Where:
* $T_{\text{div}}(A, B)$ is the total division latency in CPU clock cycles.
* $T_{\text{norm}}$ is the base normalization and setup delay (e.g., $T_{\text{norm}} = 6\text{ cycles}$).
* $\text{MSB}(A)$ and $\text{MSB}(B)$ are the positions of the most significant non-zero bits in $A$ and $B$.
* $Q_{\text{bits}}$ is the number of quotient bits generated per clock cycle (e.g., $Q_{\text{bits}} = 2\text{ bits/cycle}$).
* $T_{\text{cycle}}$ is the cycle cost per quotient iteration ($T_{\text{cycle}} = 1\text{ cycle}$).

```text
HARDWARE DIVIDER LATENCY EXAMPLES

 Operation (A / B)               │ Active MSB Delta │ Division Execution Latency
─────────────────────────────────┼──────────────────┼────────────────────────────
 0x0000_0005 / 0x1234_5678       │ MSB(A) < MSB(B)  │ 6 Clock Cycles  (Fastest!)
 0x0000_FFFF / 0x0000_0002       │ Delta MSB = 15   │ 14 Clock Cycles
 0x7FFF_FFFF_FFFF_FFFF / 0x0002  │ Delta MSB = 62   │ 37 Clock Cycles (Slowest!)
```

Look at the division latency range:
Depending on the values of $A$ and $B$, an integer division instruction (`idiv` or `div`) takes anywhere from **$6\text{ clock cycles}$ to $37\text{ clock cycles}$**!

This $31\text{-cycle}$ timing variance is a massive information leakage channel!

---

## Cryptographic Exploitation: Extracting Secrets from Variable-Time Arithmetic

Now that we understand how hardware multipliers and dividers take a variable number of clock cycles depending on operand values, let us trace how an attacker exploits this hardware behavior to steal private cryptographic keys.

### Big-Integer Multi-Precision Arithmetic in Cryptography

Cryptographic algorithms—such as **RSA**, **Diffie-Hellman (DH)**, and **Elliptic Curve Cryptography (ECC)**—do not operate on small 32-bit or 64-bit integers. They operate on massive **Big-Integer numbers** ranging from 256 bits (for ECC) up to 2,048 or 4,096 bits (for RSA).

Because a 64-bit CPU cannot multiply two 2,048-bit numbers in a single machine instruction, software software libraries (such as OpenSSL, Libgcrypt, or Mbed TLS) break big-range numbers down into arrays of 64-bit words called **Limbs**:

$$\text{Big Integer } X = [X_0, X_1, X_2, X_3 \dots X_{n-1}]$$

Where each limb $X_k$ is a standard 64-bit unsigned integer stored in a CPU register or memory array.

```text
BIG-INTEGER MULTI-PRECISION LIMB DECOMPOSITION

 256-Bit Big Integer X:
 [ Limb 3 (Bits 255:192) ][ Limb 2 (Bits 191:128) ][ Limb 1 (Bits 127:64) ][ Limb 0 (Bits 63:0) ]
 ◄──────── 64 Bits ──────► ◄────── 64 Bits ──────► ◄───── 64 Bits ──────► ◄──── 64 Bits ────►
```

When software multiplies two big integers ($X \times Y$), it executes a software loop that multiplies every 64-bit limb of $X$ by every 64-bit limb of $Y$ using hardware multiplication instructions (`mul` or `mulq`):

```c
// Big-Integer Multi-Precision Schoolbook Multiplication Loop
void big_int_multiply(uint64_t *result, uint64_t *X, uint64_t *Y, int n) {
    for (int i = 0; i < n; i++) {
        uint64_t carry = 0;
        for (int j = 0; j < n; j++) {
            // EXECUTING 64-BIT HARDWARE MULTIPLY INSTRUCTION!
            // If X[i] or Y[j] has leading zeros, 'mul' runs FAST (1 cycle)!
            // If X[i] and Y[j] are large, 'mul' runs SLOW (4 cycles)!
            unsigned __int128 product = (unsigned __int128)X[i] * Y[j] + result[i + j] + carry;
            result[i + j] = (uint64_t)product;
            carry = (uint64_t)(product >> 64);
        }
        result[i + n] = carry;
    }
}
```

Look closely at the inner loop above:
The software author wrote a clean, linear loop with **no conditional branches** and **no array lookups**. Software developers often assume this code is "constant-time."

However, inside the inner loop sits the hardware multiplication operator: `X[i] * Y[j]`.

If limb `X[i]` contains a secret key word that happens to have leading zeros (e.g., `X[i] = 0x0000_0000_0000_0042`), the hardware CPU multiplier executes `X[i] * Y[j]` in **$1\text{ clock cycle}$**!

If limb `X[i]` contains a large secret key word (e.g., `X[i] = 0xF123_4567_89AB_CDEF`), the hardware CPU multiplier executes `X[i] * Y[j]` in **$4\text{ clock cycles}$**!

---

### Accumulating Microarchitectural Timing Deltas

A 2,048-bit RSA multiplication multiplying two 32-limb numbers ($n = 32$) executes $32 \times 32 = \mathbf{1,024 \text{ hardware 64-bit multiply instructions}}$ in a single big-integer multiplication step!

Let us calculate the total clock cycle difference for an entire 2,048-bit multiplication when secret input $X$ contains small limbs versus large limbs:

#### Scenario A: Secret Input $X$ Contains All Small Limbs (Leading Zeros)
Every one of the 1,024 `mul` instructions encounters the hardware Early-Out circuit and executes in $1\text{ clock cycle}$:

$$T_{\text{big\_mul\_small}} = 1,024 \text{ multiplications} \times 1 \text{ cycle/mul} = \mathbf{1,024 \text{ CPU Clock Cycles}}$$

#### Scenario B: Secret Input $X$ Contains All Large Limbs (No Zeros)
Every one of the 1,024 `mul` instructions executes in full 4-cycle pipeline latency:

$$T_{\text{big\_mul\_large}} = 1,024 \text{ multiplications} \times 4 \text{ cycles/mul} = \mathbf{4,096 \text{ CPU Clock Cycles}}$$

$$\mathbf{\text{Accumulated Timing Delta } \Delta T = 4,096 - 1,024 = 3,072 \text{ Clock Cycles!}}$$

```text
ACCUMULATED BIG-INTEGER TIMING DELTA

 Scenario A (Small Limbs) : [ 1,024 Multiply Instructions x 1 Cycle ] ──► Total = 1,024 Cycles
 Scenario B (Large Limbs) : [ 1,024 Multiply Instructions x 4 Cycles] ──► Total = 4,096 Cycles
                                                                          ▲
                                                                          └─ Delta = 3,072 Cycles!
```

Look at the size of this accumulated timing delta:
**A timing difference of $3,072\text{ clock cycles}$ ($0.96\text{ microseconds}$ at $3.2\text{ GHz}$)!**

An attacker process running on the same machine—or even measuring network packet response times over a low-latency local network connection—can measure this $3,072\text{-cycle}$ execution time difference using standard system timers.

By analyzing how total execution time varies across different public inputs, the attacker applies **Differential Timing Analysis (Kocher's Timing Attack)** to solve for the secret key limbs one by one!

---

## Hardware and Software Mitigations: Constant-Time Execution and Cryptographic Blinding

To protect cryptographic algorithms against variable-time arithmetic execution leakage, hardware architects and software developers deploy three layers of defense.

```text
THREE-TIER ARITHMETIC LEAKAGE DEFENSES

                               ARITHMETIC LEAKAGE DEFENSES
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         ▼                                  ▼                                  ▼
 HARDWARE DIT BIT (ARM DIT = 1)   CONSTANT-TIME HARDWARE ALUs       CRYPTOGRAPHIC BLINDING
 * Enforces fixed-cycle ALU mode  * Hardware multiplier/divider     * Masks secret key with random
   for all arithmetic instructions.  always runs for max cycles.      value before multiplication.
```

---

### Defense 1: Hardware Data-Independent Timing (ARM DIT Bit)

To provide a true hardware guarantee of constant-time execution, modern processor architectures—most notably ARM64 (ARMv8.4-A+)—have introduced a specialized hardware control register bit: **Data-Independent Timing (`DIT`)**.

```text
ARM64 PSTATE.DIT CONTROL REGISTER BIT

 Processor State Register (PSTATE)
 ┌─────────────────────────────────────────────────────────────┐
 │ N │ Z │ C │ V │ ... │ DIT │ ...                             │
 └─────────────────────────┬───────────────────────────────────┘
                           ▲
                           └── BIT DIT = 1 ENFORCES FIXED-CYCLE ALU EXECUTION!
```

#### How the Hardware DIT Bit Operates:

When software sets `PSTATE.DIT = 1` (or executes `msr DIT, #1`):

1. **Early-Out Circuits Disabled**: The CPU hardware disables all early-termination and leading-zero detection circuits inside multipliers, dividers, and vector shift units.
2. **Fixed-Cycle Execution**: The CPU guarantees that every arithmetic instruction (`mul`, `div`, `add`, `sub`, vector operations) completes in a **fixed, deterministic number of clock cycles regardless of the numeric values in the input registers**!
   * A 64-bit multiplication *always* takes exactly $4\text{ clock cycles}$, whether $B = 0$ or $B = 2^{63}$.
   * A 64-bit division *always* takes exactly $37\text{ clock cycles}$, whether $A = 0$ or $A = 2^{63}$.
3. **Zero Timing Leakage**: The execution latency function becomes completely constant:

$$T_{\text{mul}}(A, B) = T_{\text{constant\_max}} \quad (\forall A, B)$$

$$\mathbf{\Delta T = T_{\text{mul}}(A, B_1) - T_{\text{mul}}(A, B_2) \equiv 0.0000 \text{ Clock Cycles!}}$$

The physical timing side-channel is $100\%$ closed in hardware!

---

### Defense 2: Constant-Time Hardware Execution Units (Full-Cycle Pipeline Design)

In security-focused CPU cores (such as secure RISC-V cores or cryptographic co-processors), hardware engineers do not install Early-Out logic at all.

The hardware multiplier is designed as a fixed-depth pipelined Wallace tree or Montgomery multiplier that executes for an un-changeable number of clock cycles (e.g., exactly $3\text{ clock cycles}$) for all input operands.

```text
FIXED-CYCLE HARDWARE MULTIPLIER DATAPATH

 Operands A & B ──► [ Fixed 3-Stage Wallace Tree Pipeline ] ──► Always 3 Cycles
                    (Zero Early-Out Logic / Zero Branching)
```

* **Advantage**: $100\%$ immune to arithmetic timing leakage by physical design.
* **Trade-off**: Slightly higher average power consumption on non-cryptographic general-purpose software, because the multiplier cannot terminate early on small numbers.

---

### Defense 3: Software Cryptographic Blinding (Operand Masking)

If software must run on legacy CPUs where hardware multipliers exhibit variable-time early-out behavior and no `DIT` bit exists, software developers apply **Cryptographic Blinding (Masking)**.

Before executing a secret-dependent modular multiplication or exponentiation step ($A^d \pmod N$), software multiplies secret exponent $d$ or base $A$ by a fresh, random number $r$ generated by a hardware random number generator (TRNG):

$$\text{Blinded Base } A' = (A \cdot r^e) \pmod N$$

1. The mathematical operation is executed on the **randomized blinded value $A'$**.
2. Because $A'$ is randomized by $r$, its binary representation contains a random distribution of $1\text{s}$ and $0\text{s}$.
3. The hardware multiplier's early-out timing variations now reflect the **random number $r$**, rather than the secret key!
4. After computation completes, software un-blinds the result by dividing out $r$, recovering the true output.

An attacker measuring execution timing receives random noise with zero statistical correlation to the secret key!

---

## Solved Industrial Engineering Exercise: Quantitative Early-Out Multiplier Leakage, Big-Integer Timing Accumulation, and DIT Bit Defense Verification

To consolidate your complete mastery of variable-time arithmetic execution leakage, early-out multiplier math, big-integer timing accumulation, and DIT hardware defense verification, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal microarchitectural security engineer auditing a 64-bit RISC-V processor operating at a clock frequency $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates an 64-bit hardware multiplier (`mul` instruction) with the following physical latency characteristics:
* **Base Instruction Setup Overhead**: $T_{\text{base}} = 1\text{ CPU Clock Cycle}$.
* **Processing Chunk Size**: $K_{\text{chunk}} = 16\text{ bits}$.
* **Cycle Cost per Active Chunk**: $T_{\text{step}} = 1\text{ CPU Clock Cycle}$.
* **Latency Formula**:
  $$T_{\text{mul}}(A, B) = 1 + \left\lceil \frac{\max(\text{MSB}(A), \text{MSB}(B))}{16} \right\rceil \text{ Clock Cycles}$$

```text
3.2 GHz RISC-V HARDWARE MULTIPLIER SPECIFICATIONS

 Hardware Multiplier (64-Bit Early-Out Core)
 ┌─────────────────────────────────────────────────────────────┐
 │ Active Bit-Width MSB <= 16  ──► 1 + 1 = 2 Clock Cycles      │
 │ Active Bit-Width MSB <= 32  ──► 1 + 2 = 3 Clock Cycles      │
 │ Active Bit-Width MSB <= 48  ──► 1 + 3 = 4 Clock Cycles      │
 │ Active Bit-Width MSB <= 64  ──► 1 + 4 = 5 Clock Cycles      │
 └─────────────────────────────────────────────────────────────┘
```

The server executes a 256-bit ECC scalar point multiplication loop. The loop processes a 256-bit secret scalar $K$ consisting of 4 64-bit limbs:

$$K = [K_3, K_2, K_1, K_0]$$

Each iteration of the scalar multiplication loop performs 16 64-bit hardware multiplications ($4 \times 4$ limb matrix multiplication) to compute $R = K \times P$.

Public base point $P = [P_3, P_2, P_1, P_0]$ is known to the attacker, with all limbs fully populated ($\text{MSB}(P_j) = 64$ for all $j \in [0, 3]$).

You are tasked with analyzing two secret key vectors:
* **Key Vector Alpha ($K_{\alpha}$)**: All 4 limbs are fully populated large numbers ($\text{MSB}(K_{\alpha, i}) = 64$ for all $i \in [0, 3]$).
* **Key Vector Beta ($K_{\beta}$)**: Limbs $K_{\beta, 0}$ and $K_{\beta, 1}$ are small numbers ($\text{MSB}(K_{\beta, 0}) = 12$, $\text{MSB}(K_{\beta, 1}) = 8$), while $K_{\beta, 2}$ and $K_{\beta, 3}$ are fully populated ($\text{MSB} = 64$).

#### Your Objective

1. Calculate the physical execution latency (in clock cycles and nanoseconds) of a single 64-bit hardware `mul` instruction for:
   * A large limb with $\text{MSB} = 64$.
   * A small limb with $\text{MSB} = 12$.
2. Calculate the total clock cycle execution time $T_{\text{mult\_Alpha}}$ and $T_{\text{mult\_Beta}}$ for the complete 16-multiplication matrix ($4 \times 4$ limbs) under Key Vector Alpha versus Key Vector Beta.
3. Calculate the accumulated timing delta $\Delta T = T_{\text{mult\_Alpha}} - T_{\text{mult\_Beta}}$ in clock cycles and nanoseconds.
4. Verify the performance impact when the software sets the hardware **Data-Independent Timing bit (`DIT = 1`)**:
   * Recalculate $T_{\text{mult\_Alpha}}$ and $T_{\text{mult\_Beta}}$ with `DIT = 1` active.
   * Prove mathematically that $\Delta T_{\text{DIT}} \equiv 0.0000\text{ ns}$.
5. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Single 64-Bit `mul` Instruction Latencies

We apply the multiplier latency formula:

$$T_{\text{mul}}(A, B) = 1 + \left\lceil \frac{\max(\text{MSB}(A), \text{MSB}(B))}{16} \right\rceil$$

##### 1. For Large Limb ($\text{MSB}(K_{\text{large}}) = 64$, $\text{MSB}(P) = 64$):

$$M_{\text{active}} = \max(64, 64) = 64$$

$$T_{\text{mul\_large}} = 1 + \left\lceil \frac{64}{16} \right\rceil = 1 + \lceil 4.0 \rceil = 1 + 4 = \mathbf{5 \text{ CPU Clock Cycles}}$$

In nanoseconds ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{mul\_large\_ns}} = 5 \times 0.3125 \text{ ns} = \mathbf{1.5625 \text{ Nanoseconds}}$$

##### 2. For Small Limb ($\text{MSB}(K_{\text{small}}) = 12$, $\text{MSB}(P) = 64$ — WAIT! CAREFUL CHECK!):
Notice that the multiplication is $K_i \times P_j$.

The formula takes $\max(\text{MSB}(K_i), \text{MSB}(P_j))$.

Since public base point limbs $P_j$ are fully populated ($\text{MSB}(P_j) = 64$):

$$M_{\text{active}} = \max(12, 64) = \mathbf{64}$$

$$T_{\text{mul}}(K_{\text{small}}, P_j) = 1 + \left\lceil \frac{64}{16} \right\rceil = \mathbf{5 \text{ Clock Cycles}}$$

```text
CRITICAL LESSON IN MULTIPLIER OPERAND ORDERING

 Operation: K_i * P_j
 If P_j is LARGE (MSB = 64) and K_i is SMALL (MSB = 12):
 max(12, 64) = 64 ==> Multiplier executes in FULL 5 CYCLES!
 (The large public operand P_j PREVENTED early-out termination!)
```

##### Microarchitectural Discovery:
If the multiplier inspects BOTH operands and uses $\max(\text{MSB}(A), \text{MSB}(B))$, multiplying a small secret $K_i$ by a large public $P_j$ will **NOT** terminate early because $P_j$ has $\text{MSB} = 64$!

#### What if the Multiplier Inspects ONLY Operand B (The Second Operand)?
In many hardware multipliers, the Early-Out logic inspects **ONLY the second operand (Operand B)**!

Let us evaluate the latency if the software structures the instruction as `mul P_j, K_i` (where $K_i$ is placed in Operand B position):

$$T_{\text{mul\_B\_small}} = 1 + \left\lceil \frac{\text{MSB}(K_{\text{small}})}{16} \right\rceil = 1 + \left\lceil \frac{12}{16} \right\rceil = 1 + \lceil 0.75 \rceil = 1 + 1 = \mathbf{2 \text{ Clock Cycles!}}$$

$$\text{Single-Instruction Timing Delta } \Delta t = 5 - 2 = \mathbf{3 \text{ CPU Clock Cycles!}}$$

Placed in Operand B position, a small secret limb $K_{\text{small}}$ executes in **$2\text{ clock cycles}$ ($0.625\text{ ns}$)** instead of $5\text{ clock cycles}$ ($1.5625\text{ ns}$)!

---

#### Step 2: Calculate Total Matrix Multiplication Execution Time ($4 \times 4$ Limbs)

The 256-bit multiplication computes $16$ 64-bit multiplications ($K_i \times P_j$ for $i \in [0, 3], j \in [0, 3]$) where $K_i$ is placed in the Operand B position.

##### 1. Key Vector Alpha ($K_{\alpha}$ — All 4 Limbs Large, $\text{MSB} = 64$):
All 16 multiplications execute with Operand B $\text{MSB} = 64$ ($5\text{ cycles/mul}$):

$$T_{\text{mult\_Alpha}} = 16 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{80 \text{ CPU Clock Cycles}}$$

In nanoseconds:

$$T_{\text{mult\_Alpha\_ns}} = 80 \times 0.3125 \text{ ns} = \mathbf{25.00 \text{ Nanoseconds}}$$

##### 2. Key Vector Beta ($K_{\beta}$ — Limbs 0 & 1 Small [$\text{MSB} \le 16$], Limbs 2 & 3 Large [$\text{MSB} = 64$]):
* Limbs $K_{\beta, 0}$ and $K_{\beta, 1}$ generate 8 multiplications ($4 \times 2$) with Operand B $\text{MSB} \le 16 \implies 2\text{ cycles/mul}$.
* Limbs $K_{\beta, 2}$ and $K_{\beta, 3}$ generate 8 multiplications ($4 \times 2$) with Operand B $\text{MSB} = 64 \implies 5\text{ cycles/mul}$.

$$T_{\text{mult\_Beta}} = (8 \times 2 \text{ cycles}) + (8 \times 5 \text{ cycles}) = 16 + 40 = \mathbf{56 \text{ CPU Clock Cycles}}$$

In nanoseconds:

$$T_{\text{mult\_Beta\_ns}} = 56 \times 0.3125 \text{ ns} = \mathbf{17.50 \text{ Nanoseconds}}$$

```text
256-BIT MULTI-PRECISION TIMING SUMMARY

 Key Configuration          │ 64-Bit Mul Latencies       │ Total 256-Bit Execution Time
────────────────────────────┼────────────────────────────┼──────────────────────────────
 Key Alpha (All 4 Limbs Large)│ 16 Muls x 5 Cycles         │ 80 Clock Cycles (25.00 ns)
 Key Beta (2 Small, 2 Large)│ (8 x 2c) + (8 x 5c)        │ 56 Clock Cycles (17.50 ns)
```

---

#### Step 3: Calculate Accumulated Timing Delta ($\Delta T$)

$$\Delta T = T_{\text{mult\_Alpha}} - T_{\text{mult\_Beta}} = 80 - 56 = \mathbf{24 \text{ CPU Clock Cycles}}$$

In nanoseconds:

$$\Delta T_{\text{ns}} = 25.00\text{ ns} - 17.50\text{ ns} = \mathbf{7.50 \text{ Nanoseconds}}$$

##### Result:
Having 2 small limbs in a 256-bit secret key causes the entire multiplication step to run **$7.50\text{ nanoseconds}$ ($24\text{ clock cycles}$) faster**! 

An attacker process running on the same core or over a low-latency network measures this $24\text{-cycle}$ timing delta, discovering that Limbs 0 and 1 contain small numeric values!

---

#### Step 4: Verify Hardware DIT Bit Defense (`DIT = 1`)

When software sets `DIT = 1`:
* The CPU disables Early-Out logic inside the hardware multiplier.
* **EVERY 64-bit multiplication is forced to execute for the maximum pipeline depth ($5\text{ clock cycles}$)** regardless of operand values!

##### Recalculating Key Vector Beta with `DIT = 1`:

$$T_{\text{mult\_Beta\_DIT}} = 16 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{80 \text{ CPU Clock Cycles}}$$

$$T_{\text{mult\_Alpha\_DIT}} = 16 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{80 \text{ CPU Clock Cycles}}$$

##### Recalculating Timing Delta ($\Delta T_{\text{DIT}}$):

$$\Delta T_{\text{DIT}} = T_{\text{mult\_Alpha\_DIT}} - T_{\text{mult\_Beta\_DIT}} = 80 - 80 = \mathbf{0 \text{ Clock Cycles}}$$

$$\mathbf{\Delta T_{\text{DIT\_ns}} \equiv 0.0000 \text{ Nanoseconds!}}$$

```text
HARDWARE DIT DEFENSE VERIFICATION

 With DIT = 0 (Default) : Delta T = 24 Clock Cycles (7.50 ns)  <-- LEAKAGE PRESENT!
 With DIT = 1 (Hardware): Delta T =  0 Clock Cycles (0.00 ns)  <-- 100% TIMING CLOSED!
```

##### Engineering Conclusion:
Enabling the hardware **Data-Independent Timing bit (`DIT = 1`)** completely eliminated the $24\text{-cycle}$ timing delta, rendering the execution time $100\%$ constant and closing the arithmetic timing side-channel in hardware!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural deductions against hardware arithmetic principles:

1. **Early-Out Latency Formula Check**:
   * Large limb ($\text{MSB} = 64$): $1 + \lceil 64/16 \rceil = 1 + 4 = 5\text{ cycles}$.
   * Small limb ($\text{MSB} = 12$): $1 + \lceil 12/16 \rceil = 1 + 1 = 2\text{ cycles}$.
   * Latency delta per small limb $= 5 - 2 = 3\text{ cycles}$.
2. **Matrix Accumulation Check**:
   * Key Beta has 2 small limbs. Each small limb is multiplied by 4 public $P_j$ limbs $= 2 \times 4 = 8\text{ small multiplications}$.
   * Accumulated cycle savings $= 8 \times 3\text{ cycles} = 24\text{ cycles}$.
   * $80 - 24 = 56\text{ cycles}$. Matches $T_{\text{mult\_Beta}}$ with $100\%$ precision!
3. **DIT Constant-Time Enforcement Check**:
   * With `DIT = 1`, all 16 multiplications execute in 5 cycles $= 80\text{ cycles}$.
   * $\Delta T = 80 - 80 = 0\text{ cycles}$.
   * Zero leakage verified with $100\%$ mathematical certainty!

All Early-Out multiplier latency formulas, Big-Integer limb matrix accumulations, timing delta derivations, and DIT hardware defense verifications evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Data-dependent execution timing**: A microarchitectural hardware behavior where arithmetic execution units (multipliers, dividers, shift-adders) complete instructions in a variable number of clock cycles based on operand numeric values, leading-zero counts, or sign-extension bit patterns.
* **Variable-time ALU leakage**: The information security vulnerability arising when secret cryptographic keys or private exponent limbs are processed by variable-time hardware ALUs, exposing secret operand magnitudes and bit structures through end-to-end execution timing variations.
