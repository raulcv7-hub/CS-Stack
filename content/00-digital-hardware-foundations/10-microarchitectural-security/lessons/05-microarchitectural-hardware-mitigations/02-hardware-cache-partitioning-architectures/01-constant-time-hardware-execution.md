content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/05-microarchitectural-hardware-mitigations/02-hardware-cache-partitioning-architectures/01-constant-time-hardware-execution.md
# Constant-Time Hardware Execution Units and Data-Independent Timing Guarantees

In modern high-performance microprocessors, digital arithmetic logic units (ALUs)—such as hardware multipliers, dividers, shift-rotate arrays, and floating-point units (FPUs)—are designed to execute mathematical instructions as fast as physically possible. To reduce dynamic energy consumption and maximize clock cycle efficiency, hardware architects equip these arithmetic execution units with early-termination logic, leading-zero detection circuits, and operand-dependent shortcut paths. When an arithmetic instruction processes inputs containing leading zeros, small numeric magnitudes, or repeating bit patterns, these hardware optimizations allow the execution unit to bypass remaining pipeline stages, returning the result in fewer clock cycles. However, when software executes sensitive cryptographic algorithms—such as RSA modular exponentiation, Elliptic Curve Cryptography (ECC) scalar multiplication, or Post-Quantum Cryptography (ML-KEM)—these variable-time hardware ALUs introduce a critical microarchitectural vulnerability. Even if a software engineer writes "constant-time" C code containing zero conditional branches and zero secret-dependent memory accesses, the physical execution time of individual assembly instructions (`mul`, `div`, `fadd`) fluctuates deterministically based on the numeric values of the secret operands sitting inside the registers. By measuring instruction latency using high-resolution time-stamp counters, an unprivileged attacker can infer secret key magnitudes, private exponent bits, and internal state values. To close this hardware side-channel permanently, modern processor architectures—such as ARM64, x86-64, and RISC-V—introduce explicit silicon-level **Data-Independent Timing (DIT)** controls and **Constant-Time Hardware Execution Units**. When software enables data-independent timing mode in hardware, the CPU's memory and execution pipelines disable all early-out bypass logic, forcing every arithmetic instruction to execute in a fixed, invariant number of clock cycles regardless of the operand data values, establishing a silicon-level guarantee of constant-time execution.

```text
DATA-DEPENDENT VS DATA-INDEPENDENT HARDWARE ALU LATENCY

 VARIABLE-TIME HARDWARE MULTIPLIER (DIT = 0 - UN-MITIGATED)
 Small Operand (0x0000_0005) ──► [ Early-Out Logic ] ──► 1 Clock Cycle (FAST)
 Large Operand (0x7FFF_FFFF) ──► [ Full Pipeline   ] ──► 4 Clock Cycles (SLOW)
 (Latency fluctuates based on secret operand magnitude -> TIMING LEAK!)

 CONSTANT-TIME HARDWARE MULTIPLIER (DIT = 1 - MITIGATED)
 Small Operand (0x0000_0005) ──► [ Fixed Pipeline  ] ──► 4 Clock Cycles
 Large Operand (0x7FFF_FFFF) ──► [ Fixed Pipeline  ] ──► 4 Clock Cycles
 (Latency is strictly INVARIANT across all operands -> ZERO TIMING LEAK!)
```

---

## The Metronome-Paced Chef and the Variable Oven

To build an intuitive, crystal-clear mental model of how data-dependent hardware execution units leak secret data and how Data-Independent Timing (DIT) eliminates timing variations, let us consider an everyday analogy: two bakers working at a commercial bakery.

Imagine two professional bakers, Baker A (representing a Variable-Time Hardware ALU) and Baker B (representing a Constant-Time Hardware ALU with DIT enabled), working in separate kitchens. Both bakers are tasked with baking custom cakes according to secret customer order slips (the Secret Cryptographic Key). An observer (the Attacker) stands outside the bakery holding a high-precision stopwatch. The observer cannot see inside the kitchen and cannot read the customer order slips.

The size and complexity of each cake depend on a secret number written on the order slip:
* **Small Order (Secret Data = Low Hamming Weight / Small Number)**: A simple 1-layer vanilla cake.
* **Large Order (Secret Data = High Hamming Weight / Large Number)**: A complex, multi-tier wedding cake.

```text
THE COMMERCIAL BAKERY ANALOGY

 Baker A: Variable-Time Execution          Baker B: Constant-Time Execution (DIT)
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Small Order  ──► 1 Minute │             │ Small Order  ──► 4 Minutes│
 │ Large Order  ──► 4 Minutes│             │ Large Order  ──► 4 Minutes│
 └─────────────┬─────────────┘             └─────────────┬─────────────┘
               │                                         │
               ▼                                         ▼
 Stopwatch Observer Measures Latency:       Stopwatch Observer Measures Latency:
 1 Min = Small Order (SECRET LEAKED!)       4 Mins = Small Order
 4 Mins = Large Order (SECRET LEAKED!)      4 Mins = Large Order (ZERO LEAK!)
```

Now, compare how Baker A and Baker B handle these orders:

### Scenario 1: Baker A (Variable-Time ALU with Early-Out Logic)
Baker A is focused purely on speed and efficiency:
1. When Baker A receives a **Small Order (1-layer cake)**, he uses a fast shortcut oven setting. The cake bakes in **1 minute**. The oven timer dings, and Baker A outputs the cake.
2. When Baker A receives a **Large Order (multi-tier cake)**, he must use the full, complex baking pipeline. The cake takes **4 minutes** to bake.
3. **The Observer's Discovery**: The observer standing outside listens for the oven timer ding:
   * If the ding occurs after **1 minute**, the observer notes: *"1 minute elapsed! Baker A baked a small 1-layer cake (Secret = Small Number)!"*
   * If the ding occurs after **4 minutes**, the observer notes: *"4 minutes elapsed! Baker A baked a large multi-tier cake (Secret = Large Number)!"*
4. The variable baking latency allowed the observer to discover the secret customer order without ever looking inside the kitchen!

### Scenario 2: Baker B (Constant-Time ALU with Data-Independent Timing)
Baker B operates under a strict security policy enforced by a mechanical metronome (**Data-Independent Timing / DIT Guarantee**):
1. The metronome ticks at a fixed, un-changeable rate of **4 minutes per cake** ($T_{\text{fixed}} = 4\text{ minutes}$).
2. When Baker B receives a **Small Order (1-layer cake)**, the cake finishes baking inside the oven in 1 minute. However, Baker B is **strictly forbidden from opening the oven door or outputting the cake until the 4-minute metronome cycle completes**! The cake sits in a holding queue inside the oven until Second 240.
3. When Baker B receives a **Large Order (multi-tier cake)**, it naturally takes 4 minutes to bake, completing right as the metronome ticks at Minute 4.
4. **The Observer's Result**: The observer standing outside listens for the oven door to open:
   * Small Order $\implies$ Oven opens at **Minute 4**.
   * Large Order $\implies$ Oven opens at **Minute 4**.
   * **Timing Delta $\Delta T = 4 - 4 = \mathbf{0 \text{ Minutes}}$!**
5. The observer's stopwatch measures the exact same 4-minute duration regardless of the order size. The observer learns **zero information** about the secret customer order!

```text
CONSTANT-TIME METRONOME TIMING DELTA

 Measured Output Latency:
 Small Order (1-Layer Cake) ──► Output at Minute 4 (Waits for Metronome)
 Large Order (4-Tier Cake)  ──► Output at Minute 4 (Full Baking Time)
                                        ▲
                                        └─ Timing Delta Delta_T = 0 Minutes!
```

This bakery scenario is the exact physical analogue of **Constant-Time Hardware Execution Units and DIT**:
* Baker A is a **Variable-Time Hardware Multiplier/Divider** with early-out optimizations.
* Baker B is a **Constant-Time Hardware Execution Unit with DIT Enabled**.
* Small versus large cake orders are **Small vs. Large Secret Binary Operands**.
* The 4-minute metronome is the **Hardware Data-Independent Timing (DIT) Fixed Cycle Invariant**.
* The observer's stopwatch is the **Hardware Time-Stamp Counter (`RDTSC` / `CNTVCT_EL0`)**.
* The zero timing delta ($\Delta T = 0$) is **Physical Side-Channel Immunity**.

---

## Microarchitectural Root Causes of Variable-Time Arithmetic

To understand how hardware execution units leak data, we must inspect the digital logic circuits inside modern CPU Arithmetic Logic Units (ALUs).

Microprocessors incorporate four primary classes of data-dependent variable-time optimizations in silicon:

```text
MICROARCHITECTURAL SOURCES OF VARIABLE-TIME ARITHMETIC

                       VARIABLE-TIME ALU OPTIMIZATIONS
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
 EARLY-OUT MULTIPLIERS       ITERATIVE SRT DIVIDERS       DENORMAL FLOATING-POINT TRAPS
 * Leading-Zero Count (LZC)  * Terminates early when      * Subnormal FP numbers trap to
   skips zero chunks.          partial remainder = 0.       slow microcode (~100+ cycles).
```

---

### 1. Early-Out Multipliers and Leading-Zero Count (LZC) Circuits

In digital arithmetic, multiplying two 64-bit integers ($A \times B$) requires calculating partial products and summing them together.

To save dynamic switching power and execution cycles, hardware engineers install a **Leading-Zero Count (LZC)** or **Leading-Sign Count (LSC)** circuit at the input stage of the multiplier.

```text
EARLY-OUT MULTIPLIER PIPELINE WITH LEADING-ZERO COUNT

 Operand A & Operand B (64 Bits)
               │
               ▼
 [ Leading-Zero Count (LZC) Circuit ] ──► Detects High-Order Zero Chunks
               │
     ┌─────────┴─────────────────────────────────────────┐
     ▼                                                   ▼
 Upper 48 Bits are Zeros (Small Data)   Upper Bits Populated (Large Data)
 Process 16-bit chunk ONLY!             Process All 64 bits!
 Latency = 1 Clock Cycle (FAST)         Latency = 4 Clock Cycles (SLOW)
```

If the high-order bits of Operand $B$ contain all zeros (for example, $B = 0x0000\_0000\_0000\_0005$), the LZC circuit detects that only the lowest 16 bits contain active data. 

The multiplier bypasses the upper 3 processing stages, returning the result in **$1\text{ clock cycle}$** instead of the full **$4\text{ clock cycles}$**.

$$\text{Latency}(B) = \begin{cases} 1 \text{ Cycle} & \text{if } B < 2^{16} \quad (\text{Small Operand}) \\ 4 \text{ Cycles} & \text{if } B \ge 2^{48} \quad (\text{Large Operand}) \end{cases}$$

If Operand $B$ represents a secret cryptographic key, **the instruction execution time directly exposes whether $B < 2^{16}$ or $B \ge 2^{48}$**!

---

### 2. Iterative Dividers (SRT Division)

Hardware dividers (such as `div` or `idiv` on x86, or `sdiv`/`udiv` on ARM64) compute quotients iteratively using algorithms like **Sweeney-Robertson-Tocher (SRT) division**.

Unlike multipliers, which execute in 1 to 4 cycles, hardware division instructions take anywhere from **$6\text{ clock cycles}$ to $40\text{ clock cycles}$**:

$$T_{\text{div}}(A, B) = T_{\text{norm}} + \max\left(0, \left\lceil \frac{\text{MSB}(A) - \text{MSB}(B)}{Q_{\text{bits}}} \right\rceil \right) \cdot T_{\text{iter}}$$

Where:
* $T_{\text{div}}(A, B)$ is the total division execution latency in CPU clock cycles.
* $T_{\text{norm}}$ is the base normalization setup latency (e.g., $T_{\text{norm}} = 6\text{ cycles}$).
* $\text{MSB}(X)$ is the most significant non-zero bit position of integer $X$ ($\text{MSB}(X) \in [1, 64]$).
* $Q_{\text{bits}}$ is the number of quotient bits generated per iteration (e.g., $Q_{\text{bits}} = 2\text{ bits/cycle}$).
* $T_{\text{iter}}$ is the clock cycle cost per iteration ($T_{\text{iter}} = 1\text{ cycle}$).

When Dividend $A$ has many leading zeros (small magnitude) and Divisor $B$ is large, $\text{MSB}(A) - \text{MSB}(B) \le 0$, and the divider terminates in **$6\text{ clock cycles}$**. When Dividend $A$ is large and Divisor $B$ is small ($B = 2$), the divider executes for **$37\text{ clock cycles}$**!

---

### 3. Floating-Point Units (FPUs) and Subnormal (Denormal) Traps

In IEEE 754 floating-point arithmetic, numbers with extremely small magnitudes close to zero are called **Subnormal (or Denormal) Numbers**.

Modern FPUs process standard normalized floating-point numbers in fast hardware ($3 \text{ to } 5\text{ clock cycles}$). 

However, when an FPU instruction (`fadd`, `fmul`) encounters a subnormal number operand:
1. The hardware execution unit halts standard pipeline processing.
2. The CPU invokes an internal **Microcode Trap / Assist** to process the subnormal number using specialized microcode routines.
3. The instruction execution latency spikes from **$3\text{ clock cycles}$ up to $100+\text{ clock cycles}$**!

```text
FLOATING-POINT EXECUTION LATENCY SPIKE

 Standard Normalized Numbers   ──► Fast Hardware Pipeline  ──► 3 Clock Cycles
 Subnormal / Denormal Numbers  ──► Microcode Assist Trap   ──► 120 Clock Cycles!
                                                               ▲
                                                               └─ 40x Execution Delay Spike!
```

An attacker processing floating-point operations can detect whether an internal register holds a subnormal number by measuring whether the instruction executed in 3 cycles or 120 cycles!

---

## The Data-Independent Timing (DIT) Hardware Primitive

To eliminate data-dependent execution timing variations across all hardware ALUs, modern processor Instruction Set Architectures (ISAs) introduce explicit hardware control flags known as **Data-Independent Timing (DIT)** guarantees.

```text
DATA-INDEPENDENT TIMING (DIT) CONTROL PRIMITIVES

 Architecture │ Hardware DIT Control Primitive     │ Instruction / MSR Interface
──────────────┼────────────────────────────────────┼───────────────────────────────────────────
 ARM64        │ PSTATE.DIT Bit                     │ msr DIT, #1 / msr DIT, #0
 x86-64       │ DOITM (Data Operand Indep Timing)  │ wrmsr(MSR_IA32_MCU_OPT_CTRL, bit 0)
 RISC-V       │ Zkt Extension (Scalar Crypto DIT) │ Hardware-Enforced Fixed-Latency Profile
```

---

### 1. ARM64 Data-Independent Timing (`PSTATE.DIT`)

Starting with the ARMv8.4-A architecture (and deployed across modern mobile, server, and Apple Silicon processors), ARM introduced the **`PSTATE.DIT` (Data-Independent Timing)** bit in the Processor State register.

```assembly
; Enabling ARM64 Hardware Data-Independent Timing
    msr DIT, #1               ; Enable Hardware DIT Mode (PSTATE.DIT <= 1)
    
    ; --- CRITICAL CRYPTOGRAPHIC EXECUTION BLOCK ---
    ; All arithmetic instructions (MUL, DIV, ADD, SUB, CSEL, Vector ops)
    ; are GUARANTEED by silicon hardware to run in fixed, constant time!
    mul x0, x1, x2            ; Executes in EXACTLY 4 clock cycles (Always!)
    sdiv x3, x4, x5           ; Executes in EXACTLY 32 clock cycles (Always!)
    
    msr DIT, #0               ; Disable Hardware DIT Mode (PSTATE.DIT <= 0)
```

```text
ARM64 PSTATE.DIT HARDWARE ENFORCEMENT

 Software executes: msr DIT, #1
                       │
                       ▼
 CPU Hardware Pipeline Sets PSTATE.DIT <= 1
 ┌─────────────────────────────────────────────────────────────┐
 │ SILICON HARDWARE ACTIONS (DIT = 1 ACTIVE)                   │
 │  1. Disables Early-Out LZC Logic in Multipliers.           │
 │  2. Enforces Fixed-Iteration Loops in Hardware Dividers.    │
 │  3. Disables Denormal Microcode Traps (Flushes to Zero).    │
 │  4. Enforces Fixed-Latency Vector Shift/Rotate Operations.  │
 └─────────────────────────────────────────────────────────────┘
```

#### What `PSTATE.DIT = 1` Guarantees in Hardware:
When `PSTATE.DIT` is set to $1$:
1. **Early-Out Multipliers Disabled**: Multiplier logic disables early-termination shortcuts. A 64-bit multiplication *always* executes for the maximum pipeline depth ($4\text{ clock cycles}$) regardless of leading zeros.
2. **Fixed-Iteration Dividers**: Hardware dividers process the maximum number of quotient iterations ($32\text{ clock cycles}$), returning results in constant time.
3. **Denormal Flush-to-Zero**: Subnormal floating-point numbers are handled in constant hardware cycles without triggering slow microcode assists.
4. **Data-Independent Load/Store Addressing**: Memory address generation and vector operations execute with uniform physical bus timing.

---

### 2. x86-64 Data Operand Independent Timing Mode (DOITM)

On x86-64 processors (Intel Ice Lake, Alder Lake, Raptor Lake, and server processors), Intel introduced **Data Operand Independent Timing Mode (DOITM)**.

Software (or the operating system kernel) enables DOITM by writing to Model-Specific Register `IA32_MCU_OPT_CTRL` (MSR address `0x123`):

```c
// Enabling x86-64 DOITM via MSR Write (Linux Kernel)
void enable_x86_doitm(void) {
    uint64_t val = rdmsr(0x123);
    val |= (1ULL << 0); // Set Bit 0: DOITM Enable
    wrmsr(0x123, val);  // Enable Data Operand Independent Timing!
}
```

When DOITM is enabled:
* Instructions such as `imul`, `mul`, `div`, `idiv`, `aesenc`, and vector SIMD instructions are guaranteed to execute in **fixed, data-independent clock cycle counts**.

---

### 3. RISC-V Scalar Cryptography Extension (`Zkt`)

In the open-source RISC-V ISA, the **`Zkt` Extension (Data-Independent Timing for Cryptography)** defines a formal profile requirement for RISC-V hardware implementations:

When a RISC-V CPU core implements `Zkt`:
* Every instruction defined in the Base Integer ISA (`ADD`, `SUB`, `MUL`, `DIV`, `SLT`, etc.) and Cryptography Extensions (`AES`, `SHA`) **MUST execute in data-independent execution time**.
* The execution latency $T(A, B)$ must be identical for all valid input operand bit patterns ($A, B \in \mathbb{Z}_{2^{XLEN}}$).

---

## Mathematical Proof of Zero Timing Leakage under DIT

Let us prove mathematically why enabling Data-Independent Timing ($DIT = 1$) eliminates timing side-channel leakage completely.

Let $D_{\text{secret}} \in \{0, 1\}^B$ be a $B$-bit secret cryptographic key payload processed by an arithmetic execution unit inside the CPU.

Let $T_{\text{ALU}}(D_{\text{secret}})$ be the physical execution time (in CPU clock cycles) required by the ALU to execute the instruction as a function of operand $D_{\text{secret}}$.

### 1. Un-Mitigated Variable-Time ALU ($DIT = 0$):
The execution time $T_{\text{ALU}}$ is a non-constant function of the operand's Hamming Weight $HW(D_{\text{secret}})$ or Leading Zero Count $LZC(D_{\text{secret}})$:

$$T_{\text{ALU}}(D_{\text{secret}}) = f\left( LZC(D_{\text{secret}}) \right)$$

$$\Delta T = \left| T_{\text{ALU}}(D_1) - T_{\text{ALU}}(D_2) \right| > 0 \quad (\text{for } D_1 \neq D_2)$$

Because $\Delta T > 0$, an attacker measuring total execution time $T$ over $M$ samples computes a non-zero mutual information $I(T; D_{\text{secret}}) > 0$, **exfiltrating secret key bits**!

---

### 2. Hardware DIT Enforced ALU ($DIT = 1$):
When `DIT = 1` is active, the silicon hardware forces the execution pipeline to run for a fixed, maximum clock cycle bound ($T_{\text{max\_fixed}}$) for all valid operands:

$$\mathbf{T_{\text{ALU}}(D_{\text{secret}}) \equiv T_{\text{max\_fixed}} \quad (\forall D_{\text{secret}} \in \{0, 1\}^B)}$$

Now, let us evaluate the timing delta $\Delta T$ between two arbitrary secret inputs $D_1$ and $D_2$:

$$\Delta T = \left| T_{\text{ALU}}(D_1) - T_{\text{ALU}}(D_2) \right| = \left| T_{\text{max\_fixed}} - T_{\text{max\_fixed}} \right| \equiv \mathbf{0.0000 \text{ Clock Cycles!}}$$

```text
TIMING DELTA EQUATION COMPARISON

 Un-Mitigated (DIT = 0) : Delta T = | T_ALU(D1) - T_ALU(D2) | > 0  <-- TIMING LEAK!
 Mitigated    (DIT = 1) : Delta T = | T_fixed  - T_fixed  | = 0  <-- 100% SECURE!
```

#### Mathematical Security Result:
Because $T_{\text{ALU}}(D_{\text{secret}})$ is a constant function:
* The variance of execution timing is zero: $\text{Var}(T_{\text{ALU}}) = 0$.
* The mutual information between execution time $T$ and secret key $D_{\text{secret}}$ collapses to zero:
  $$\mathbf{I(T; D_{\text{secret}}) \equiv 0.0000 \text{ Bits}}$$
* The physical timing side-channel is **$100\%$ closed in hardware!**

---

## Industry Impact: Post-Quantum Cryptography and Performance Trade-Offs

The availability of hardware Data-Independent Timing controls has reshaped modern software development, particularly in high-security applications like **Post-Quantum Cryptography (PQC)** and open-source security libraries.

```text
DIT APPLICATION ACROSS CRITICAL SOFTWARE

                         DIT HARDWARE ENFORCEMENT
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
 POST-QUANTUM CRYPTO (PQC)    OPENSSL & LIBSODIUM          OPERATING SYSTEM KERNELS
 * ML-KEM & ML-DSA algorithms * Enables DIT in assembly    * Enables DIT during kernel
   require DIT to prevent      entry points for AES,       crypto API calls and
   number-theoretic timing.    ECC, and Poly1305 loops.    syscall transitions.
```

### 1. Post-Quantum Cryptography (NIST ML-KEM / Kyber & ML-DSA / Dilithium)

Next-generation Post-Quantum Cryptographic algorithms—such as **ML-KEM (Kyber)** and **ML-DSA (Dilithium)**—rely heavily on polynomial multiplication in Galois rings ($R_q = \mathbb{Z}_q[X]/(X^n + 1)$) using the **Number Theoretic Transform (NTT)**.

During NTT polynomial multiplication, the algorithm executes millions of modular reductions and integer multiplications.

If executed on a variable-time hardware multiplier without `DIT`:
* Polynomial coefficients containing small values or leading zeros execute faster than coefficients containing large values.
* Attackers measuring execution timing can recover the secret polynomial coefficients, **breaking post-quantum encryption in real time!**

By enabling `DIT = 1` during NTT polynomial processing, post-quantum libraries guarantee that every polynomial multiplication executes in constant time, securing post-quantum algorithms on modern hardware.

---

### 2. Performance Trade-Offs: DIT vs Non-DIT Workloads

Why do microprocessors not enable Data-Independent Timing ($DIT = 1$) permanently for all software?

Because early-out hardware optimizations provide significant performance and energy benefits for general-purpose, non-security application software!

```text
PERFORMANCE VS SECURITY TRADE-OFF MATRIX

 Workload Type            │ Recommended DIT State │ IPC / Execution Speed │ Security Posture
──────────────────────────┼───────────────────────┼───────────────────────┼───────────────────────────
 General App (Video/3D)   │ DIT = 0 (Disabled)    │ Maximum Speed (+12%)  │ Variable-Time (Unsafe)
 Cryptographic Software   │ DIT = 1 (Enabled)     │ Fixed Constant Speed  │ 100% Side-Channel Immune!
```

1. **Non-Cryptographic Code (Video Encoding, 3D Games, Browsers)**:
   Disabling DIT ($DIT = 0$) allows early-out multipliers and dividers to speed up array calculations and physics engines, delivering **$5\%\text{ to } 15\%$ higher IPC** and lower dynamic energy consumption.
2. **Cryptographic Code (OpenSSL, TLS, SSH, PQC)**:
   Enabling DIT ($DIT = 1$) during key operations sacrifices early-out performance shortcuts in exchange for **$100\%$ hardware timing side-channel immunity**.

#### Best Practice Engineering Pattern:
Cryptographic libraries toggle DIT dynamically—setting `DIT = 1` upon entering a cryptographic function, and restoring `DIT = 0` upon returning to general application code.

---

## Solved Industrial Engineering Exercise: Quantitative Multiplier Early-Out Timing, DIT Enforcement, and Post-Quantum NTT Key Extraction Proof

To consolidate your complete mastery of variable-time hardware arithmetic, early-out multiplier math, `DIT` hardware enforcement, and post-quantum timing delta analysis, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior hardware security architect auditing a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates a 64-bit hardware multiplier (`mul` instruction) with the following physical latency characteristics when `DIT = 0` (Data-Independent Timing disabled):
* **Base Instruction Setup Overhead**: $T_{\text{base}} = 1\text{ CPU Clock Cycle}$.
* **Processing Chunk Size**: $K_{\text{chunk}} = 16\text{ bits}$.
* **Cycle Cost per Active Chunk**: $T_{\text{step}} = 1\text{ CPU Clock Cycle}$.
* **Early-Out Multiplier Latency Formula ($DIT = 0$)**:
  $$T_{\text{mul}}(A, B) = 1 + \left\lceil \frac{\max(\text{MSB}(A), \text{MSB}(B))}{16} \right\rceil \text{ Clock Cycles}$$
  Where $\text{MSB}(X)$ is the most significant non-zero bit position of integer $X$ ($\text{MSB} \in [1, 64]$).

When `DIT = 1` (Data-Independent Timing enabled), the hardware multiplier disables early-out logic and enforces a fixed, constant execution latency:

$$T_{\text{mul\_DIT1}}(A, B) \equiv \mathbf{5 \text{ CPU Clock Cycles}} \quad (\forall A, B)$$

```text
3.2 GHz RISC-V HARDWARE MULTIPLIER SPECIFICATIONS

 Hardware Multiplier Latency Profile:
 * DIT = 0 (Variable-Time): MSB <= 16 -> 2 Cycles | MSB <= 32 -> 3 Cycles
                            MSB <= 48 -> 4 Cycles | MSB <= 64 -> 5 Cycles
 * DIT = 1 (Constant-Time): Fixed 5 Clock Cycles for ALL operands!
```

The server executes a 256-coefficient Post-Quantum Number Theoretic Transform (NTT) polynomial multiplication loop. The loop processes 256 64-bit polynomial coefficient multiplications ($A_i \times B_i$ for $i \in [0, 255]$).

Public operand polynomial $A$ has all 256 coefficients fully populated ($\text{MSB}(A_i) = 64$ for all $i$).

You are auditing two secret key polynomials:
* **Secret Polynomial Alpha ($B_{\alpha}$)**: All 256 coefficients are large, fully populated numbers ($\text{MSB}(B_{\alpha, i}) = 64$ for all $i \in [0, 255]$).
* **Secret Polynomial Beta ($B_{\beta}$)**: 128 coefficients are small numbers ($\text{MSB}(B_{\beta, i}) = 12$ for $i \in [0, 127]$), while the remaining 128 coefficients are large numbers ($\text{MSB}(B_{\beta, i}) = 64$ for $i \in [128, 255]$).

#### Your Objective

1. Calculate the single-instruction execution latency $T_{\text{mul}}$ (in clock cycles and nanoseconds) when multiplying a large coefficient ($\text{MSB} = 64$) versus a small coefficient ($\text{MSB} = 12$) when `DIT = 0`.
2. Calculate the total physical execution time $T_{\text{NTT\_Alpha\_DIT0}}$ and $T_{\text{NTT\_Beta\_DIT0}}$ (in clock cycles and microseconds) for the 256-multiplication NTT polynomial loop under Polynomial Alpha versus Polynomial Beta when `DIT = 0`.
3. Calculate the resulting **NTT Execution Timing Delta ($\Delta T_{\text{DIT0}}$)** in clock cycles and microseconds when `DIT = 0`. Explain how an attacker uses this timing delta to extract secret polynomial structure.
4. Evaluate hardware enforcement with **`DIT = 1` active**:
   * Recalculate $T_{\text{NTT\_Alpha\_DIT1}}$ and $T_{\text{NTT\_Beta\_DIT1}}$.
   * Prove mathematically that $\Delta T_{\text{DIT1}} \equiv 0.0000\ \mu\text{s}$, completely closing the timing side-channel.
5. Calculate the percentage execution time penalty added to Polynomial Beta when enabling `DIT = 1`.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Single-Instruction `mul` Latencies ($DIT = 0$)

We apply the multiplier latency formula for $DIT = 0$:

$$T_{\text{mul}}(A, B) = 1 + \left\lceil \frac{\max(\text{MSB}(A), \text{MSB}(B))}{16} \right\rceil$$

##### 1. For Large Coefficient ($\text{MSB}(A_i) = 64, \text{MSB}(B_{\text{large}}) = 64$):

$$M_{\text{active}} = \max(64, 64) = 64$$

$$T_{\text{mul\_large}} = 1 + \left\lceil \frac{64}{16} \right\rceil = 1 + \lceil 4.0 \rceil = 1 + 4 = \mathbf{5 \text{ CPU Clock Cycles}}$$

In nanoseconds ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{mul\_large\_ns}} = 5 \times 0.3125 \text{ ns} = \mathbf{1.5625 \text{ Nanoseconds}}$$

##### 2. For Small Coefficient ($\text{MSB}(A_i) = 64, \text{MSB}(B_{\text{small}}) = 12$):
Notice that the hardware multiplier evaluates $\max(\text{MSB}(A_i), \text{MSB}(B_i))$.

Because public operand $A_i$ has $\text{MSB}(A_i) = 64$:

$$M_{\text{active}} = \max(64, 12) = \mathbf{64}$$

$$T_{\text{mul}}(A_i, B_{\text{small}}) = 1 + \left\lceil \frac{64}{16} \right\rceil = 1 + 4 = \mathbf{5 \text{ CPU Clock Cycles!}}$$

```text
CRITICAL LESSON IN OPERAND MAX-EVALUATION

 Operation: A_i * B_i
 If A_i is LARGE (MSB = 64) and B_i is SMALL (MSB = 12):
 max(64, 12) = 64 ==> Multiplier executes in FULL 5 CYCLES!
 (The large public operand A_i PREVENTED early-out termination!)
```

##### What if the Multiplier Inspects ONLY Operand B (The Second Operand)?
In hardware architectures where early-out logic inspects **ONLY the second operand ($B_i$)** (instruction formatted as `mul A_i, B_i`):

$$T_{\text{mul\_small\_B}} = 1 + \left\lceil \frac{\text{MSB}(B_{\text{small}})}{16} \right\rceil = 1 + \left\lceil \frac{12}{16} \right\rceil = 1 + \lceil 0.75 \rceil = 1 + 1 = \mathbf{2 \text{ CPU Clock Cycles}}$$

In nanoseconds:

$$T_{\text{mul\_small\_B\_ns}} = 2 \times 0.3125 \text{ ns} = \mathbf{0.6250 \text{ Nanoseconds}}$$

$$\text{Single-Instruction Timing Delta } \Delta t = 5 - 2 = \mathbf{3 \text{ CPU Clock Cycles (0.9375 ns)}}$$

When placed in the second operand position, a small coefficient executes in **$2\text{ clock cycles}$** ($0.6250\text{ ns}$) instead of $5\text{ clock cycles}$ ($1.5625\text{ ns}$)!

---

#### Step 2: Calculate Total NTT Polynomial Execution Time ($DIT = 0$)

The NTT loop executes $256$ 64-bit coefficient multiplications ($A_i \times B_i$ for $i \in [0, 255]$), where secret coefficients $B_i$ occupy the second operand position.

##### 1. Polynomial Alpha ($B_{\alpha}$ — All 256 Coefficients Large, $\text{MSB} = 64$):
All 256 multiplications execute with $B_i \text{ MSB} = 64 \implies 5\text{ cycles/mul}$:

$$T_{\text{NTT\_Alpha\_DIT0}} = 256 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{1,280 \text{ CPU Clock Cycles}}$$

In microseconds ($T_{\text{clk}} = 0.3125\text{ ns} = 0.0003125\ \mu\text{s}$):

$$T_{\text{NTT\_Alpha\_DIT0\_us}} = 1,280 \times 0.0003125 \ \mu\text{s} = \mathbf{0.4000 \text{ Microseconds}} \quad (400.0\text{ ns})$$

##### 2. Polynomial Beta ($B_{\beta}$ — 128 Small Coefficients [$\text{MSB} = 12$], 128 Large Coefficients [$\text{MSB} = 64$]):
* 128 small coefficients execute at $2\text{ cycles/mul} = 128 \times 2 = 256\text{ cycles}$.
* 128 large coefficients execute at $5\text{ cycles/mul} = 128 \times 5 = 640\text{ cycles}$.

$$T_{\text{NTT\_Beta\_DIT0}} = 256 + 640 = \mathbf{896 \text{ CPU Clock Cycles}}$$

In microseconds:

$$T_{\text{NTT\_Beta\_DIT0\_us}} = 896 \times 0.0003125 \ \mu\text{s} = \mathbf{0.2800 \text{ Microseconds}} \quad (280.0\text{ ns})$$

```text
NTT POLYNOMIAL EXECUTION TIMING SUMMARY (DIT = 0)

 Polynomial Configuration     │ 64-Bit Mul Latencies     │ Total 256-Mul Execution Time
──────────────────────────────┼──────────────────────────┼──────────────────────────────
 Polynomial Alpha (All Large) │ 256 Muls x 5 Cycles      │ 1,280 Clock Cycles (0.400 us)
 Polynomial Beta (128 Small)  │ (128 x 2c) + (128 x 5c)  │   896 Clock Cycles (0.280 us)
```

---

#### Step 3: Calculate NTT Timing Delta ($\Delta T_{\text{DIT0}}$)

$$\Delta T_{\text{DIT0}} = T_{\text{NTT\_Alpha\_DIT0}} - T_{\text{NTT\_Beta\_DIT0}} = 1,280 - 896 = \mathbf{384 \text{ CPU Clock Cycles}}$$

In microseconds:

$$\Delta T_{\text{DIT0\_us}} = 0.4000\ \mu\text{s} - 0.2800\ \mu\text{s} = \mathbf{0.1200 \text{ Microseconds}} \quad (120.0\text{ ns})$$

##### Microarchitectural Attack Result:
When `DIT = 0`, processing Polynomial Beta (128 small coefficients) takes **$120.0\text{ nanoseconds}$ ($384\text{ clock cycles}$) less time** than processing Polynomial Alpha!

An attacker measuring the total execution time of the NTT loop observes this $120\text{-ns}$ timing speedup, discovering that 128 coefficients of secret Polynomial Beta contain small numeric magnitudes!

---

#### Step 4: Verify Hardware DIT Enforcement (`DIT = 1`)

When software enables Data-Independent Timing (`DIT = 1`):
* The CPU hardware disables early-out logic inside the multiplier.
* **EVERY 64-bit multiplication is forced to execute for the fixed latency of $5\text{ clock cycles}$** regardless of operand values!

##### 1. Calculate Polynomial Alpha Execution Time (`DIT = 1`):

$$T_{\text{NTT\_Alpha\_DIT1}} = 256 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{1,280 \text{ CPU Clock Cycles}} \quad (0.4000\ \mu\text{s})$$

##### 2. Calculate Polynomial Beta Execution Time (`DIT = 1`):

$$T_{\text{NTT\_Beta\_DIT1}} = 256 \text{ multiplications} \times 5 \text{ cycles/mul} = \mathbf{1,280 \text{ CPU Clock Cycles}} \quad (0.4000\ \mu\text{s})$$

##### 3. Calculate Fixed Timing Delta ($\Delta T_{\text{DIT1}}$):

$$\Delta T_{\text{DIT1}} = T_{\text{NTT\_Alpha\_DIT1}} - T_{\text{NTT\_Beta\_DIT1}} = 1,280 - 1,280 = \mathbf{0 \text{ CPU Clock Cycles}}$$

$$\mathbf{\Delta T_{\text{DIT1\_us}} \equiv 0.0000 \text{ Microseconds!}}$$

```text
HARDWARE DIT DEFENSE VERIFICATION

 System Mode                   │ T_exec(Alpha) │ T_exec(Beta) │ Timing Delta DeltaT
───────────────────────────────┼───────────────┼──────────────┼─────────────────────
 DIT = 0 (Variable-Time ALU)   │ 0.4000 us     │ 0.2800 us    │ +0.1200 us (LEAKAGE!)
 DIT = 1 (Constant-Time ALU)   │ 0.4000 us     │ 0.4000 us    │  0.0000 us (SECURE!)
```

##### Engineering Conclusion:
Enabling the hardware **Data-Independent Timing bit (`DIT = 1`)** completely eliminated the $120.0\text{-ns}$ timing delta, rendering the NTT polynomial execution time $100\%$ constant and closing the arithmetic timing side-channel in hardware!

---

#### Step 5: Calculate Percentage Performance Penalty of `DIT = 1` on Polynomial Beta

We compare Polynomial Beta's execution time with `DIT = 1` ($1,280\text{ cycles}$) against `DIT = 0` ($896\text{ cycles}$):

$$\Delta T_{\text{penalty}} = 1,280 - 896 = \mathbf{384 \text{ CPU Clock Cycles}} \quad (120.0\text{ ns})$$

$$\text{Execution Time Increase \%} = \frac{\Delta T_{\text{penalty}}}{T_{\text{NTT\_Beta\_DIT0}}} \times 100\% = \frac{384}{896} \times 100\% \approx \mathbf{42.86\% \text{ Execution Time Increase}}$$

##### Performance Analysis:
Enabling `DIT = 1` increases the physical execution time of Polynomial Beta by **$42.86\%$ ($120.0\text{ ns}$)** because it intentionally sacrifices early-out performance shortcuts in exchange for **$100\%$ hardware side-channel security**!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against CPU design principles:

1. **Early-Out Multiplier Latency Check**:
   * Large coefficient ($\text{MSB} = 64$): $1 + \lceil 64/16 \rceil = 1 + 4 = 5\text{ cycles}$.
   * Small coefficient ($\text{MSB} = 12$): $1 + \lceil 12/16 \rceil = 1 + 1 = 2\text{ cycles}$.
   * Delta per small coefficient $= 5 - 2 = 3\text{ cycles}$.
2. **Polynomial Loop Accumulation Check**:
   * Polynomial Beta has 128 small coefficients.
   * Accumulated cycle savings $= 128 \times 3\text{ cycles} = 384\text{ cycles}$.
   * $1,280 - 384 = 896\text{ cycles}$. Matches $T_{\text{NTT\_Beta\_DIT0}}$ with $100\%$ precision!
3. **DIT Security Invariant Check**:
   * With `DIT = 1`, all 256 multiplications execute in 5 cycles $= 1,280\text{ cycles}$.
   * $\Delta T = 1,280 - 1,280 = 0\text{ cycles}$.
   * Zero-leakage invariant mathematically proven!

All Early-Out multiplier latency formulas, Post-Quantum NTT polynomial loop accumulations, `DIT` constant-time enforcement proofs, and $42.86\%$ performance overhead calculations evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Constant-time execution unit**: A digital arithmetic logic unit (ALU, multiplier, divider, FPU) designed in silicon to complete mathematical operations in a fixed, invariant number of clock cycles ($T_{\text{ALU}} \equiv T_{\text{fixed}}$) regardless of operand numerical values, leading-zero counts, or subnormal state.
* **Data-independent timing guarantee (DIT)**: A hardware ISA control primitive (such as ARM64 `PSTATE.DIT`, x86 `DOITM`, or RISC-V `Zkt`) that commands the CPU's out-of-order execution engine to disable early-out bypass logic and microcode traps, guaranteeing zero data-dependent execution latency variations across arithmetic instructions.
