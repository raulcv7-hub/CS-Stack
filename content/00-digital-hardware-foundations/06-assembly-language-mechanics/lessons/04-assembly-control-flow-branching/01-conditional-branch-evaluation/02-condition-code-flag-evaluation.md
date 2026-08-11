content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/04-assembly-control-flow-branching/01-conditional-branch-evaluation/02-condition-code-flag-evaluation.md
# Condition Code Flag Evaluation and Signed versus Unsigned Comparison Mechanics

## The Relational Comparison Dilemma: Why High-Level Logic Operators Require Low-Level Status Flags

In high-level programming languages (such as C, C++, Rust, or Python), software decision-making relies continuously on relational comparison operators: `if (a == b)`, `if (a < b)`, `if (a >= b)`, or `while (i < count)`. These relational operators allow programs to alter their execution flow dynamically based on runtime data values.

However, physical digital hardware—specifically the central processing unit's Arithmetic Logic Unit (ALU)—does not contain a single, monolithic "less than" or "greater than" logic gate. 

An ALU is a high-speed binary mathematical engine built primarily to perform fundamental binary arithmetic: **Addition ($A + B$)** and **Subtraction ($A - B$)**.

When an ALU compares two 64-bit binary numbers ($A$ and $B$), it does so by executing a 64-bit subtraction:

$$Y = A - B = A + (\sim B + 1)$$

Where:
* $Y$ is the 64-bit numerical difference output of the ALU subtractor.
* $A$ is the first 64-bit input operand.
* $B$ is the second 64-bit input operand.
* $\sim B + 1$ is the Two's Complement bitwise negation of operand $B$.

In addition to producing the 64-bit numerical difference $Y$, the ALU subtractor outputs four individual 1-bit electrical status signals called **Hardware Status Flags** (or **Condition Codes**):

1. **Zero Flag ($Z$)**: Asserts $1$ if the subtraction output is exactly zero ($A - B == 0$).
2. **Negative Flag ($N$)**: Asserts $1$ if the sign bit of the subtraction output is $1$ ($Y_{63} == 1$).
3. **Carry Flag ($C$)**: Asserts $1$ if the unsigned addition/subtraction produced an outgoing carry-out bit.
4. **Overflow Flag ($V$)**: Asserts $1$ if signed Two's Complement subtraction produced a result that exceeded the physical 64-bit signed integer boundary.

Now, we encounter a fundamental hardware friction: **The Relational Comparison Dilemma**.

```text
THE RELATIONAL COMPARISON DILEMMA

 ALU executes Subtraction: Y = A - B
 ┌─────────────────────────────────────────────────────────────┐
 │ Raw ALU Output: 64-Bit Difference Y                         │
 │ Hardware Flags: Z (Zero), N (Negative), C (Carry), V (Over) │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 How does the CPU convert 4 individual 1-bit flags (Z, N, C, V)
 into relational logic decisions like "Is Signed A < Signed B?"
 or "Is Unsigned A < Unsigned B?"
```

How does a CPU processor core take four separate 1-bit status flags ($Z, N, C, V$) and determine whether $A < B$, $A \le B$, or $A \ge B$?

Why do **Signed Comparisons** (`a < b` using Two's Complement signed integers) and **Unsigned Comparisons** (`a < b` using raw memory addresses, pointers, or unsigned integers) require **completely different Boolean logic formulas** over $Z, N, C, V$?

And what happens when Two's Complement signed subtraction **overflows ($V = 1$)**, causing the Negative Flag ($N$) to lie about the true relational sign of the result?

To evaluate high-level relational operators at multi-gigahertz speeds, computer architectures use **Condition Code Flag Evaluation Matrices** and **Overflow-Unmasking Boolean Logic**.

---

## The Bank Balance Scale and the Four Dashboard Lights: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of condition code flag evaluation, status register flags, and signed vs. unsigned comparison formulas before inspecting logic gate schematics and Two's Complement overflow truth tables, let us consider an everyday analogy: **The Bank Balance Scale and the Four Dashboard Lights**.

Imagine a bank auditing machine (**The CPU ALU Execution Unit**) comparing two account balances: Balance A (**Register $A$**) and Balance B (**Register $B$**).

```text
THE BANK BALANCE SCALE DASHBOARD METAPHOR

 Subtraction Action: A - B
 ┌─────────────────────────────────────────────────────────────┐
 │ Z Light (Zero Flag)     ──► ON if Balance A == Balance B    │
 │ N Light (Negative Flag) ──► ON if Difference has Negative Sign│
 │ C Light (Carry Flag)    ──► ON if Unsigned A >= Unsigned B  │
 │ V Light (Overflow Flag) ──► ON if Container Overflowed!     │
 └─────────────────────────────────────────────────────────────┘
```

The auditing machine compares the balances by subtracting Balance B from Balance A ($A - B$).

On the dashboard of the auditing machine sit **4 Color-Coded Indicator Lights ($Z, N, C, V$)**:
* **Zero Light ($Z$)**: Turns ON ($1$) if $A - B = 0$ (meaning Balance A is exactly equal to Balance B).
* **Negative Light ($N$)**: Turns ON ($1$) if the subtraction result has a negative sign.
* **Carry Light ($C$)**: Turns ON ($1$) if an unsigned subtraction required no borrow (meaning Unsigned $A \ge \text{Unsigned } B$).
* **Overflow Light ($V$)**: Turns ON ($1$) if the subtraction result was too large or too negative to fit inside the machine's container!

Let us observe how the bank auditor evaluates whether **Balance A is Less Than Balance B ($A < B$)** across two different account types:

---

### Scenario 1: Unsigned Comparison (Raw Money Amounts / Memory Addresses)

In Scenario 1, the accounts hold raw, non-negative unsigned numbers (such as memory addresses or raw item counts). Money cannot be negative.

The auditor wants to check if **Unsigned $A <_{\text{unsigned}} \text{Unsigned } B$**.

Look at how simple the audit is:
* The auditor looks **ONLY at the Carry Light ($C$)**!
* If Unsigned $A \ge B$, no borrow was needed, so **Carry Light $C = 1$**.
* If Unsigned $A < B$, a borrow was required, so **Carry Light $C = 0$**!

$$\mathbf{\text{Unsigned Less Than Condition: } C == 0}$$

The auditor checks a single light ($C == 0$). Zero complex math required!

---

### Scenario 2: Signed Comparison (Accounts with Debts and Negative Balances)

In Scenario 2, accounts can hold positive balances or negative debts using Two's Complement signed numbers.

Suppose $A = +100$ and $B = +50$:
* $A - B = +100 - (+50) = \mathbf{+50}$.
* Negative Light $N = 0$, Overflow Light $V = 0$.
* Is $A < B$? **NO** ($+100 > +50$).

Suppose $A = -50$ and $B = +100$:
* $A - B = -50 - (+100) = \mathbf{-150}$.
* Negative Light $N = 1$ (Negative result!), Overflow Light $V = 0$.
* Is $A < B$? **YES** ($-50 < +100$).

Now, observe **The Signed Overflow Trap ($V = 1$)**:
Suppose $A = -100$ (a negative debt) and $B = +100$ in a small 8-bit container that can hold numbers only from $-128 \text{ to } +127$.

The auditor subtracts:

$$A - B = -100 - (+100) = \mathbf{-200}$$

Look at the container disaster:
$-200$ **CANNOT FIT** inside the 8-bit container ($-200 < -128$)!

The container overflows and wraps around to **$+56$ (a positive number!)**!

Look at the dashboard lights:
* Because the container wrapped around to $+56$, the **Negative Light $N$ is OFF ($N = 0$)**!
* If the auditor looked at the Negative Light $N$ alone, the light would say: *"Hey, $N = 0$, so $A - B$ is positive, which means $A \ge B$!"*
* **THAT IS A LIE!** $-100$ is NOT greater than $+100$! The Negative Light lied because an overflow occurred!
* But look at the **Overflow Light $V$**: $V$ is **ON ($V = 1$)**!

```text
THE SIGNED OVERFLOW TRAP (UNMASKING THE LIE)

 Calculation: -100 - (+100) = -200 (Exceeds 8-bit limit!)
 Output Wrapped to: +56 (Positive Sign!)

 Dashboard Lights:
   * Negative Light N = 0 (LIES! Says result is positive!)
   * Overflow Light V = 1 (ALERT! Container Overflowed!)

 Unmasking Formula (N XOR V):
   N XOR V = 0 XOR 1 = 1  ──► TRUE! -100 IS LESS THAN +100!
 (The Exclusive-OR of N and V unmasked the overflow lie!)
```

How does the auditor unmask the lie and find the truth?
The auditor applies **The Exclusive-OR Unmasking Formula ($N \oplus V$)**:

$$\mathbf{\text{Signed Less Than Condition: } N \oplus V == 1}$$

Let us test $N \oplus V$ on our overflow trap ($N = 0, V = 1$):

$$N \oplus V = 0 \oplus 1 = \mathbf{1 \quad (\text{TRUE! } -100 < +100!)}$$

Look at what $N \oplus V$ achieved:
By taking the Exclusive-OR of the Negative Light ($N$) and the Overflow Light ($V$), **the auditor unmasked the overflow lie and discovered the true mathematical sign**!

This bank balance scale is the exact physical analogue of **Condition Code Flag Evaluation**:
* Registers $A$ and $B$ are **ALU Input Operands**.
* The 4 dashboard lights are **Hardware Status Flags ($Z, N, C, V$)**.
* The Carry Light test ($C == 0$) is **Unsigned Comparison ($A <_{\text{unsigned}} B$)**.
* The Exclusive-OR unmasking formula ($N \oplus V == 1$) is **Signed Comparison ($A <_{\text{signed}} B$)**.

---

## Primitive 1: Condition Code Flag Evaluation Mechanics

Now that we possess an intuitive mental model of bank balance scales and dashboard lights, let us examine the formal, rigorous engineering mechanics of **Condition Code Flag Evaluation**.

When an ALU executes a 64-bit subtraction $Y = A - B$, the four 1-bit hardware status flags (**Zero $Z$**, **Negative $N$**, **Carry $C$**, **Overflow $V$**) are generated concurrently in physical silicon gates:

```text
64-BIT ALU STATUS FLAG GENERATION SCHEMATIC

 64-Bit Operand A [63:0] ──┐
 64-Bit Operand B [63:0] ──┼─► [ 64-Bit ALU Subtractor ] ──► Result Y [63:0]
                           │        (A - B)                        │
                           │                                       ├─► NOR Gate ──► Z Flag
                           │                                       ├─► Bit 63 ────► N Flag
                           │                                       ├─► CarryOut ──► C Flag
                           └─ CarryIn XOR CarryOut ────────────────┴─► XOR Gate ──► V Flag
```

---

### Gate-Level Definitions of the Four Hardware Status Flags

Let us define the precise mathematical and Boolean gate logic for each status flag:

#### 1. Zero Flag ($Z$)
* **Definition**: Asserts $1$ if every single bit of the 64-bit ALU subtraction result $Y$ is zero ($Y == 0x0000000000000000$).
* **Boolean Gate Formula**: A 64-input NOR gate applied across all output bits $Y[63:0]$:

$$\mathbf{Z = \overline{Y_{63} \lor Y_{62} \lor Y_{61} \lor \dots \lor Y_0}}$$

#### 2. Negative / Sign Flag ($N$)
* **Definition**: Asserts $1$ if the Most Significant Bit ($MSB$) of the 64-bit ALU subtraction result $Y$ is $1$ (indicating a negative number in Two's Complement representation).
* **Boolean Gate Formula**: Connected directly to output wire $Y[63]$:

$$\mathbf{N = Y_{63}}$$

#### 3. Carry Flag ($C$)
* **Definition**: In addition, $C$ represents an outgoing unsigned carry-out bit ($C_{64}$). In 64-bit subtraction ($A - B = A + \sim B + 1$), $C = 1$ indicates **NO BORROW occurred** ($A \ge_{\text{unsigned}} B$), while $C = 0$ indicates **A BORROW occurred** ($A <_{\text{unsigned}} B$).
* **Boolean Gate Formula**: Connected to the Carry-Out wire of the MSB adder stage:

$$\mathbf{C = \text{CarryOut}_{63}}$$

#### 4. Overflow Flag ($V$)
* **Definition**: Asserts $1$ if Two's Complement signed subtraction produces a result that exceeds the physical 64-bit signed integer boundary ($-2^{63} \text{ to } +2^{63} - 1$).
* **Boolean Gate Formula**: Computed as the Exclusive-OR of the Carry-In and Carry-Out of the MSB adder stage:

$$\mathbf{V = \text{CarryIn}_{63} \oplus \text{CarryOut}_{63}}$$

---

## Primitive 2: Signed versus Unsigned Comparison Mechanics

Now let us examine the second core primitive: **Signed versus Unsigned Comparison Mechanics**.

Why does the distinction between signed and unsigned numbers matter so deeply in assembly language?

Consider the 64-bit hexadecimal value **`0xFFFFFFFFFFFFFFFF`**:
* **Interpreted as Unsigned**: Represents the maximum possible 64-bit positive integer: **$+18,446,744,073,709,551,615_{10}$**.
* **Interpreted as Signed (Two's Complement)**: Represents the negative integer: **$-1_{10}$**.

Now, compare `0xFFFFFFFFFFFFFFFF` ($A$) with `0x0000000000000001` ($B = +1_{10}$):

```text
SIGNED VS UNSIGNED COMPARISON DISCREPANCY

 Comparing A (0xFFFFFFFFFFFFFFFF) with B (0x0000000000000001)

 Unsigned Evaluation (Raw Magnitudes):
   A (+18.4 x 10^18) vs B (+1) ──► Unsigned A IS GREATER THAN B! (A > B)

 Signed Two's Complement Evaluation:
   A (-1)            vs B (+1) ──► Signed A IS LESS THAN B!    (A < B)
```

Look at the contradiction:
* In **Unsigned Comparison**: $A >_{\text{unsigned}} B$ (because $18.4 \times 10^{18} > 1$).
* In **Signed Comparison**: $A <_{\text{signed}} B$ (because $-1 < +1$).

Because the same binary bit pattern yields completely opposite relational truths depending on whether data is signed or unsigned, **hardware architectures provide two distinct sets of condition evaluation formulas** over flags $Z, N, C, V$.

---

### Complete Taxonomy of Condition Code Evaluation Formulas

The following matrix summarizes the exact Boolean flag formulas used by processor hardware to evaluate all 10 relational operators:

```text
RELATIONAL OPERATOR CONDITION CODE EVALUATION MATRIX

 Relational Condition │ x86 Mnemonic │ RISC-V Mnemonic │ Hardware Flag Boolean Formula
──────────────────────┼──────────────┼─────────────────┼───────────────────────────────
 Equal (A == B)       │ JE / JZ      │ BEQ             │ Z == 1
 Not Equal (A != B)   │ JNE / JNZ    │ BNE             │ Z == 0
 Unsigned <           │ JB / JNAE    │ BLTU            │ C == 0  (Borrow required)
 Unsigned >=          │ JAE / JNC    │ BGEU            │ C == 1  (No borrow)
 Unsigned <=          │ JBE / JNA    │ -               │ (C == 0) OR (Z == 1)
 Unsigned >           │ JA / JNBE    │ -               │ (C == 1) AND (Z == 0)
 Signed <             │ JL / JNGE    │ BLT             │ N XOR V == 1
 Signed >=            │ JGE / JNL    │ BGE             │ N XOR V == 0
 Signed <=            │ JLE / JNG    │ -               │ (N XOR V == 1) OR (Z == 1)
 Signed >             │ JG / JNLE    │ -               │ (N XOR V == 0) AND (Z == 0)
```

---

### Mathematical Proof of $N \oplus V$ for Signed Comparison ($A <_{\text{signed}} B$)

To understand why $N \oplus V == 1$ is mathematically infallible for signed comparisons, let us prove all four possible combinations of $N$ and $V$:

$$\mathbf{\text{Signed Less Than Condition: } N \oplus V == 1}$$

#### Case 1: No Overflow ($V = 0$)
When no Two's Complement overflow occurs ($V = 0$), the Negative Flag $N$ tells the exact truth:
* $N = 1 \implies A - B < 0 \implies A <_{\text{signed}} B$.
* $N \oplus V = 1 \oplus 0 = \mathbf{1 \quad (\text{TRUE: } A < B)}$.
* $N = 0 \implies A - B \ge 0 \implies A \ge_{\text{signed}} B$.
* $N \oplus V = 0 \oplus 0 = \mathbf{0 \quad (\text{FALSE: } A \ge B)}$.

#### Case 2: Positive Overflow ($V = 1$)
Positive overflow occurs when subtracting a negative number from a positive number ($A > 0, B < 0$), but the mathematical result $A - B$ exceeds $+2^{63}-1$, wrapping around to a **negative sign ($N = 1$)**.
* The ALU output has $N = 1$ (LIES! Says result is negative).
* But $A$ was positive and $B$ was negative, so $A >_{\text{signed}} B$ is the true mathematical fact!
* Apply $N \oplus V$:

$$N \oplus V = 1 \oplus 1 = \mathbf{0 \quad (\text{FALSE: } A \text{ is NOT less than } B!)}$$

The Exclusive-OR unmasked the positive overflow, correctly returning $0$ (False)!

#### Case 3: Negative Overflow ($V = 1$)
Negative overflow occurs when subtracting a positive number from a negative number ($A < 0, B > 0$), but the mathematical result $A - B$ falls below $-2^{63}$, wrapping around to a **positive sign ($N = 0$)**.
* The ALU output has $N = 0$ (LIES! Says result is positive).
* But $A$ was negative and $B$ was positive, so $A <_{\text{signed}} B$ is the true mathematical fact!
* Apply $N \oplus V$:

$$N \oplus V = 0 \oplus 1 = \mathbf{1 \quad (\text{TRUE: } A \text{ IS less than } B!)}$$

The Exclusive-OR unmasked the negative overflow, correctly returning $1$ (True)!

Across all possible mathematical cases, **$N \oplus V == 1$ provides a $100\%$ mathematically perfect signed comparison test**!

---

## Real-World Silicon Engineering: Status Register Dependencies vs. Flagless RISC Architectures

In commercial CPU microarchitecture design, how status flags are managed creates a major physical design divergence between CISC and RISC processors.

### 1. The Status Register Dependency Bottleneck (CISC / ARM)

In architectures with an explicit status register (such as x86 `EFLAGS` or ARM `CPSR`):
* Every single arithmetic instruction (`ADD`, `SUB`, `AND`, `OR`) updates the status flags by default.
* In a high-frequency out-of-order execution pipeline, executing multiple arithmetic instructions in parallel creates a heavy **Status Register Dependency**:

```text
STATUS REGISTER RENAME DEPENDENCY STALL

 Cycle 1: ADD x10, x11, x12  ──► Modifies EFLAGS Register
 Cycle 2: SUB x13, x14, x15  ──► Modifies EFLAGS Register
 Cycle 3: JE  target_label   ──► MUST WAIT FOR SUB TO FINISH WRITING EFLAGS!
 (Conditional branch cannot execute until SUB updates EFLAGS!)
```

The conditional branch instruction `JE` must wait for the exact preceding `SUB` instruction to finish writing `EFLAGS`, creating pipeline dependency stalls!

---

### 2. The RISC-V Flagless Solution

To eliminate status register dependency stalls, RISC-V **eliminates explicit status flag registers ($Z, C, N, V$) completely**!

Instead of setting flags in Instruction 1 and testing them in Instruction 2, RISC-V uses **Flagless Compare-and-Branch Instructions**:

```riscv
# RISC-V FLAGLESS CONDITIONAL BRANCH INSTRUCTIONS

beq  x10, x11, label    # Branch if x10 == x11 (Equal)
bne  x10, x11, label    # Branch if x10 != x11 (Not Equal)
blt  x10, x11, label    # Branch if Signed x10 < Signed x11
bge  x10, x11, label    # Branch if Signed x10 >= Signed x11
bltu x10, x11, label    # Branch if Unsigned x10 < Unsigned x11
bgeu x10, x11, label    # Branch if Unsigned x10 >= Unsigned x11
```

#### How Flagless Branches Work in Silicon:
1. The branch instruction `blt x10, x11, label` feeds registers `x10` and `x11` directly into the ALU subtractor inside the EX stage.
2. The ALU pre-evaluates $N \oplus V$ internally in $10\text{ picoseconds}$.
3. If $N \oplus V == 1$, the branch is taken immediately in the same cycle!
4. **Zero Status Registers Are Modified!** Subsequent instructions execute in parallel without a single status register dependency stall!

---

## Solved Industrial Engineering Exercise: ALU Flag Generation, Signed vs. Unsigned Condition Evaluation, and Branch Decision Audit

To consolidate your complete mastery of condition code flag generation ($Z, C, N, V$), signed vs. unsigned relational evaluation formulas, and branch decision logic, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the ALU and Condition Code Evaluation Unit for an industrial $3.2\text{ GHz}$ 64-bit processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The ALU evaluates a 64-bit subtraction $Y = A - B$ across three critical test cases:

```text
3.2 GHz PROCESSOR CONDITION CODE EVALUATION SUBSYSTEM

 Registers A & B ──► [ 64-Bit Subtractor ] ──► Flags (Z, C, N, V) ──► Branch Evaluator
 Clock T = 312.5 ps   Computes Y = A - B       Condition Formulas     Taken / Not Taken
```

#### Test Cases (64-Bit Hexadecimal Input Values):
1. **Test Case 1 (Equal Values)**:
   * $A = \text{0x0000\_0000\_0000\_0042}$ ($+66_{10}$)
   * $B = \text{0x0000\_0000\_0000\_0042}$ ($+66_{10}$)
2. **Test Case 2 (Unsigned vs. Signed Discrepancy)**:
   * $A = \text{0xFFFF\_FFFF\_FFFF\_FFFF}$ (Unsigned $18.4 \times 10^{18}$ / Signed $-1_{10}$)
   * $B = \text{0x0000\_0000\_0000\_0001}$ (Unsigned $1_{10}$ / Signed $+1_{10}$)
3. **Test Case 3 (Signed Two's Complement Overflow)**:
   * $A = \text{0x7FFF\_FFFF\_FFFF\_FFFF}$ (Maximum 64-bit Signed Integer $+2^{63}-1$)
   * $B = \text{0xFFFF\_FFFF\_FFFF\_FFFF}$ (Signed $-1_{10}$)

#### Your Objective

1. For each Test Case (1, 2, and 3):
   * Compute the 64-bit subtraction result $Y = A - B = A + (\sim B + 1)$.
   * Determine the state of all four 1-bit hardware status flags: **Zero ($Z$)**, **Negative ($N$)**, **Carry ($C$)**, and **Overflow ($V$)**.
2. Evaluate the following relational branch conditions for each test case using the hardware flag formulas:
   * Equal ($A == B \implies Z == 1$)
   * Unsigned Less Than ($A <_{\text{unsigned}} B \implies C == 0$)
   * Signed Less Than ($A <_{\text{signed}} B \implies N \oplus V == 1$)
3. Prove why Test Case 2 yields DIFFERENT results for Unsigned Less Than vs. Signed Less Than.
4. Calculate the propagation delay through the Condition Code Evaluator logic gate tree and verify static timing slack within the $312.5\text{-ps}$ clock period budget.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Evaluate Test Case 1 ($A = +66$, $B = +66$)

$A = \text{0x0000\_0000\_0000\_0042}$, $B = \text{0x0000\_0000\_0000\_0042}$.

##### 1. Subtraction Math $Y = A - B$:

$$Y = 66_{10} - 66_{10} = \mathbf{0 \quad (\text{0x0000\_0000\_0000\_0000})}$$

##### 2. Status Flag Generation:
* **Zero Flag ($Z$)**: Result $Y == 0 \implies \mathbf{Z = 1}$.
* **Negative Flag ($N$)**: Bit $Y[63] = 0 \implies \mathbf{N = 0}$.
* **Carry Flag ($C$)**: Subtraction $A + (\sim B + 1)$ produces CarryOut $= 1 \implies \mathbf{C = 1}$ (No borrow required!).
* **Overflow Flag ($V$)**: No signed overflow occurred $\implies \mathbf{V = 0}$.

##### 3. Relational Branch Evaluation:
* **Equal ($A == B$)**: $Z == 1 \implies \mathbf{\text{TRUE (Branch Taken!)}}$
* **Unsigned Less Than ($A <_{\text{unsigned}} B$)**: $C == 0 \implies 1 == 0 \implies \mathbf{\text{FALSE}}$
* **Signed Less Than ($A <_{\text{signed}} B$)**: $N \oplus V = 0 \oplus 0 = 0 \implies \mathbf{\text{FALSE}}$

---

#### Step 2: Evaluate Test Case 2 ($A = \text{0xFFFF...FFFF}$, $B = \text{0x0000...0001}$)

Unsigned Values: $A = 18.4 \times 10^{18}$, $B = 1$.
Signed Values: $A = -1_{10}$, $B = +1_{10}$.

##### 1. Subtraction Math $Y = A - B$:

$$Y = -1_{10} - (+1_{10}) = -2_{10} = \mathbf{\text{0xFFFF\_FFFF\_FFFF\_FFFE}}$$

##### 2. Status Flag Generation:
* **Zero Flag ($Z$)**: Result $Y \neq 0 \implies \mathbf{Z = 0}$.
* **Negative Flag ($N$)**: Bit $Y[63] = 1 \implies \mathbf{N = 1}$ (Negative result!).
* **Carry Flag ($C$)**: Adding $\text{0xFF...FF} + \text{0xFF...FE} + 1$ produces $\text{CarryOut} = 1 \implies \mathbf{C = 1}$ (Unsigned $A \ge B$, no borrow!).
* **Overflow Flag ($V$)**: Subtracting $+1$ from $-1$ yields $-2$ (well within 64-bit bounds) $\implies \mathbf{V = 0}$.

##### 3. Relational Branch Evaluation:
* **Equal ($A == B$)**: $Z == 1 \implies 0 == 1 \implies \mathbf{\text{FALSE}}$
* **Unsigned Less Than ($A <_{\text{unsigned}} B$)**: $C == 0 \implies 1 == 0 \implies \mathbf{\text{FALSE}}$ (Unsigned $18.4 \times 10^{18} > 1$).
* **Signed Less Than ($A <_{\text{signed}} B$)**: $N \oplus V = 1 \oplus 0 = \mathbf{1 \implies \text{TRUE!}}$ (Signed $-1 < +1$).

```text
TEST CASE 2 DISCREPANCY ANALYSIS

 Unsigned Comparison : A (18.4x10^18) vs B (1)  ──► C == 0 is FALSE! (A is GREATER!)
 Signed Comparison   : A (-1)        vs B (+1) ──► N XOR V is TRUE!  (A is LESS!)
 (Demonstrates why signed vs unsigned comparison requires different flag formulas!)
```

---

#### Step 3: Evaluate Test Case 3 ($A = +2^{63}-1$, $B = -1$)

$A = \text{0x7FFF\_FFFF\_FFFF\_FFFF}$ ($+9.22 \times 10^{18}$).
$B = \text{0xFFFF\_FFFF\_FFFF\_FFFF}$ ($-1_{10}$).

##### 1. Subtraction Math $Y = A - B$:

$$Y = (+2^{63} - 1) - (-1) = (+2^{63} - 1) + 1 = \mathbf{+2^{63}}$$

Look at the binary output $Y$:

$$Y = \text{0x7FFF\_FFFF\_FFFF\_FFFF} + 1 = \mathbf{\text{0x8000\_0000\_0000\_0000}}$$

In 64-bit Two's Complement representation, `0x8000_0000_0000_0000` is **$-2^{63}$ (Negative Number!)**!

Adding $+1$ to $+2^{63}-1$ caused a **Signed Two's Complement Overflow**!

##### 2. Status Flag Generation:
* **Zero Flag ($Z$)**: Result $Y \neq 0 \implies \mathbf{Z = 0}$.
* **Negative Flag ($N$)**: Bit $Y[63] = 1 \implies \mathbf{N = 1}$ (The ALU output has a negative sign bit!).
* **Carry Flag ($C$)**: $\text{0x7FFF...FF} + \text{0x0000...00} + 1$ produces $\text{CarryOut} = 0 \implies \mathbf{C = 0}$.
* **Overflow Flag ($V$)**: Subtracting a negative number from a positive number yielded a negative result $\implies \mathbf{V = 1}$ (Overflow occurred!).

##### 3. Relational Branch Evaluation:
* **Signed Less Than ($A <_{\text{signed}} B$)**:
  * If we naively looked at $N$ alone ($N = 1$), we would incorrectly conclude that $+2^{63}-1 < -1$ (**FALSE LIE!**).
  * Apply the $N \oplus V$ Unmasking Formula:

$$N \oplus V = 1 \oplus 1 = \mathbf{0 \implies \text{FALSE!}}$$

$$\mathbf{\text{RESULT: } A \ge B \quad (+2^{63}-1 \text{ is GREATER THAN } -1! \text{ OVERFLOW UNMASKED!})}$$

---

#### Step 4: Summary Table and Condition Evaluator Timing Closure

Let us summarize the status flags and relational evaluations across all three test cases:

```text
STATUS FLAGS AND RELATIONAL BRANCH EVALUATION SUMMARY

 Parameter / Flag       │ Test Case 1 (66 vs 66)  │ Test Case 2 (-1 vs +1)  │ Test Case 3 (+MAX vs -1)
────────────────────────┼─────────────────────────┼─────────────────────────┼───────────────────────────
 Input A                │ 0x0000_0000_0000_0042   │ 0xFFFF_FFFF_FFFF_FFFF   │ 0x7FFF_FFFF_FFFF_FFFF
 Input B                │ 0x0000_0000_0000_0042   │ 0x0000_0000_0000_0001   │ 0xFFFF_FFFF_FFFF_FFFF
 Subtraction Output Y   │ 0x0000_0000_0000_0000   │ 0xFFFF_FFFF_FFFF_FFFE   │ 0x8000_0000_0000_0000
 Zero Flag (Z)          │ 1                       │ 0                       │ 0
 Negative Flag (N)      │ 0                       │ 1                       │ 1
 Carry Flag (C)         │ 1                       │ 1                       │ 0
 Overflow Flag (V)      │ 0                       │ 0                       │ 1 (OVERFLOW!)
 Equal (A == B)         │ TRUE  (Z == 1)          │ FALSE (Z == 0)          │ FALSE (Z == 0)
 Unsigned < (C == 0)    │ FALSE (C == 1)          │ FALSE (C == 1)          │ TRUE  (C == 0)
 Signed < (N XOR V)     │ FALSE (0 XOR 0 = 0)     │ TRUE  (1 XOR 0 = 1)     │ FALSE (1 XOR 1 = 0!)
```

##### Condition Code Evaluator Timing Closure Verification:
Given:
* ALU Subtractor Delay: $t_{\text{ALU}} = 120.0\text{ ps}$
* Flag Generation Logic ($Z, C, N, V$): $t_{\text{flags}} = 25.0\text{ ps}$
* $N \oplus V$ XOR Condition Gate: $t_{\text{XOR}} = 10.0\text{ ps}$
* Branch MUX Control Setup Time: $t_{\text{setup}} = 20.0\text{ ps}$

$$\text{Total Evaluator Path Delay } t_{\text{cond\_path}} = 120.0\text{ ps} + 25.0\text{ ps} + 10.0\text{ ps} + 20.0\text{ ps} = \mathbf{175.0 \text{ picoseconds}}$$

$$\text{Timing Slack} = T_{\text{clk}} - t_{\text{cond\_path}} = 312.5\text{ ps} - 175.0\text{ ps} = \mathbf{+137.5 \text{ picoseconds}}$$

The $175.0\text{-picosecond}$ Condition Code Evaluator path meets $3.2\text{-GHz}$ clock timing closure with a large positive slack of **$+137.5\text{ picoseconds}$**, confirming that condition code evaluation executes within a single clock cycle.

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and flag logic results:

1. **Test Case 1 Verification**:
   * $66 - 66 = 0 \implies Z = 1, N = 0, C = 1, V = 0$. $A == B$ is TRUE. Correct!
2. **Test Case 2 Verification**:
   * Unsigned: $18.4 \times 10^{18} > 1 \implies C = 1 \implies A <_{\text{unsigned}} B$ is FALSE.
   * Signed: $-1 < +1 \implies N \oplus V = 1 \oplus 0 = 1 \implies A <_{\text{signed}} B$ is TRUE. Correct!
3. **Test Case 3 Signed Overflow Verification**:
   * $+2^{63}-1 > -1 \implies A \ge_{\text{signed}} B$.
   * $N \oplus V = 1 \oplus 1 = 0 \implies A <_{\text{signed}} B$ evaluated to FALSE, correctly unmasking the overflow!

All ALU flag generation equations, signed vs. unsigned condition formulas, Two's Complement overflow unmasking proofs, and timing slack metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Condition Code Evaluation**: The hardware process of analyzing 1-bit ALU status flags (**Zero $Z$**, **Carry $C$**, **Negative $N$**, **Overflow $V$**) using specific Boolean logic formulas ($Z == 1$, $C == 0$, $N \oplus V == 1$) to evaluate relational logic operators ($==, \neq, <, \ge$) and drive conditional branch decisions.
* **Signed versus Unsigned Comparison**: The microarchitectural distinction where **unsigned comparisons** evaluate raw memory magnitude using the Carry Flag ($C == 0 \implies A <_{\text{unsigned}} B$), while **signed comparisons** evaluate Two's Complement relational order using the Exclusive-OR of Negative and Overflow flags ($\mathbf{N \oplus V == 1} \implies A <_{\text{signed}} B$) to unmask overflow errors.
