content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/05-tensor-core-accelerators/01-tensor-core-microarchitecture/03-stochastic-rounding-hardware.md
# Stochastic Rounding Hardware Architecture and Pseudo-Random Dither Mechanics

## The Gradient Stalling Crisis and Deterministic Quantization Bias in Low-Precision Training

In deep neural network training, artificial intelligence models learn complex mathematical representations through an iterative algorithm called **Gradient Descent Backpropagation**. During each training step, the execution engine evaluates the mathematical error between predicted outputs and ground-truth targets, calculates partial derivatives called **Gradients ($\nabla W$)**, and updates the network's weight parameters ($W$) by subtracting a tiny fraction of the gradient:

$$W_{\text{new}} = W_{\text{old}} - \eta \cdot \nabla W$$

Where:
* $W_{\text{new}}$ is the updated parameter weight.
* $W_{\text{old}}$ is the current parameter weight.
* $\eta$ is the learning rate parameter (a small scalar value, e.g., $\eta = 0.001$).
* $\nabla W$ is the gradient vector computed during backpropagation.

Notice the physical magnitude of the weight update term $\Delta W = \eta \cdot \nabla W$:
During the training of large neural networks, gradient updates are **microscopic fractional values**—frequently on the order of $10^{-5}, 10^{-6}, \text{or } 10^{-7}$.

Now, consider what occurs when deep learning engineers attempt to train neural networks using low-precision numerical representation formats—such as 16-bit half-precision floating-point (**FP16**), 8-bit floating-point (**FP8**), or 8-bit quantized integers (**INT8**)—to save memory bandwidth and increase compute density.

In any discrete numerical format, the smallest distance between two adjacent, representable grid numbers is called the **Least Significant Bit ($\text{LSB}$)** or **Quantization Step Size ($\epsilon$)**:

$$\text{Quantization Grid: } [\ \dots, \quad W, \quad W + \epsilon, \quad W + 2\epsilon, \quad W + 3\epsilon, \quad \dots \ ]$$

```text
THE DETERMINISTIC ROUNDING GRADIENT STALLING CRISIS

 Weight Parameter W = 10.000 (Current Grid Point)
 Next Grid Point    W + epsilon = 10.100 (Quantization Step epsilon = 0.100)
 Microscopic Update Delta_W = 0.020 (Gradient Update = 20% of Step Size)

 Standard Rounding-to-Nearest-Even (RNE / Deterministic Rounding):
 Round_Nearest(10.000 + 0.020) = Round_Nearest(10.020) ──► Truncates to 10.000!
 (Update 0.020 is ERASED ON EVERY SINGLE ITERATION!)
```

Let us trace the physical failure that occurs under standard **Rounding-to-Nearest-Even (RNE)** (the universal deterministic rounding mode used in standard IEEE-754 floating-point ALUs):

1. Suppose a weight parameter sits at quantization grid point $W = 10.000$, and the next representable grid point is $W + \epsilon = 10.100$ (where $\epsilon = 0.100$).
2. Backpropagation computes a small gradient update $\Delta W = +0.020$ (which is $20\%$ of the distance to the next grid point).
3. The true updated weight before rounding is $10.020$.
4. **The Deterministic Rounding Execution**: The hardware ALU applies standard Rounding-to-Nearest-Even to convert $10.020$ back to the discrete grid:
   * Distance to lower grid point $10.000$ is $0.020$.
   * Distance to upper grid point $10.100$ is $0.080$.
   * Because $10.020$ is closer to $10.000$, **standard deterministic rounding rounds $10.020$ DOWN to $10.000$**!
5. **The Gradient Stalling Event**: The weight parameter $W_{\text{new}}$ remains **$100\%$ unchanged at $10.000$** ($W_{\text{new}} = W_{\text{old}}$)!

Look at the catastrophic consequence if this training loop executes for $100,000$ iterations:
* Over 100,000 iterations, the cumulative sum of 100,000 updates of $+0.020$ should have increased the weight by **$+2,000.0$** ($100,000 \times 0.020 = 2,000$).
* But because standard deterministic rounding truncates $+0.020$ to zero on **every single iteration**, the weight value **never moves a single bit**!

$$\text{Final Weight after 100,000 iterations } W_{\text{final}} = \mathbf{10.000 \quad (0\% \text{ Learning Occurred!})}$$

This phenomenon is called **Gradient Stalling (Quantization Lockup)**.

Under low-precision deterministic rounding:
* Small gradient updates are systematically erased by round-to-nearest logic.
* The neural network stops learning, training loss diverges, and model accuracy collapses completely!

We are trapped in a physical and mathematical dilemma:
* Using high-precision FP32 formats prevents gradient stalling, but consumes prohibitive memory bandwidth and silicon die area.
* Using low-precision FP16, FP8, or INT8 formats with standard deterministic rounding erases small gradient updates, causing model training to diverge.

How do computer architects design a hardware rounding unit that allows low-precision neural networks to accumulate microscopic gradient updates over millions of iterations with **zero systematic quantization bias and $100\%$ mathematical fidelity**, without expanding register bit-widths?

To solve the gradient stalling crisis, modern AI tensor architectures implement **Stochastic Rounding Hardware Units (SRU)** driven by **Hardware Pseudo-Random Number Generators (PRNG)**.

---

## The Bank Cashier's Probability Wheel and the Unbiased Penny Jar: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of stochastic rounding, expectation-preserving probabilistic rounding, pseudo-random dither injection, and linear feedback shift registers before inspecting gate-level arithmetic circuits, LFSR polynomials, and training convergence equations, let us consider an everyday analogy: **The Charity Fundraising Jar**.

Imagine a charitable organization (**A Neural Network Weight Parameter $W$**) collecting small cash donations (**Small Gradient Updates $\Delta W = \$0.20$**) from visitors.

```text
THE CHARITY FUNDRAISING JAR ANALOGY

 Donor gives $0.20 Donation (Microscopic Gradient Update Delta_W)
 ┌─────────────────────────────────────────────────────────────┐
 │ Charity Bank Account (Accepts ONLY $1.00 Bills / Grid Steps)│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         HOW DOES THE BANK CASHIER HANDLE A $0.20 DONATION?
```

The bank where the charity deposits its funds enforces a strict physical constraint: **The bank account accepts ONLY $\$1.00$ bills** (**Quantization Step Size $\epsilon = \$1.00$**). The bank does NOT accept fractional coins, dimes, or pennies.

Let us observe two different bank cashier operational policies for handling a $\$0.20$ donation:

---

### Policy 1: Deterministic Nearest-Dollar Rounding (Standard Round-to-Nearest)

The bank cashier applies standard deterministic rounding: *"I round every deposit to the nearest $\$1.00$ bill. If a deposit is less than $\$0.50$, I round it down to $\$0.00$ and throw the change in the trash!"*

Look at what happens when 1,000 donors give $\$0.20$ each:
1. Donor 1 gives $\$0.20$. The cashier rounds $\$0.20$ down to **$\$0.00$** and throws the $\$0.20$ in the trash.
2. Donor 2 gives $\$0.20$. The cashier rounds $\$0.20$ down to **$\$0.00$** and throws it in the trash.
3. $\dots$
4. Donor 1,000 gives $\$0.20$. The cashier rounds it down to **$\$0.00$**!

```text
POLICY 1 TIMELINE (DETERMINISTIC NEAREST-DOLLAR ROUNDING)

 Donor 1 ($0.20) ──► Cashier rounds to $0.00 ──► Throws $0.20 in trash!
 Donor 2 ($0.20) ──► Cashier rounds to $0.00 ──► Throws $0.20 in trash!
  :
 Donor 1,000 ($0.20) ──► Cashier rounds to $0.00!
 (Total Bank Account Balance = $0.00! $200.00 in total donations LOST!)
```

Look at the catastrophic result of Policy 1:
1,000 donors gave a total of **$\$200.00$** ($1,000 \times \$0.20 = \$200.00$). But the bank account balance displays **$\mathbf{\$0.00}$**! 

Every single donation was systematically erased by deterministic rounding! This is **Gradient Stalling**.

---

### Policy 2: Probabilistic Stochastically-Dithered Rounding (Stochastic Rounding)

The bank manager replaces the rigid cashier with a **Probability Wheel (A Stochastic Rounding Unit)**.

When a donor gives a $\$0.20$ donation, the cashier calculates the probability $p$ based on the donation's fraction of a dollar:

$$p = \frac{\$0.20}{\$1.00} = 0.20 \quad (\mathbf{20\% \text{ Chance of Rounding UP to } \$1.00})$$

The cashier spins a 100-slot probability roulette wheel (**Hardware Pseudo-Random Generator**):
* **$20\%$ of the wheel slots** say: *"Round UP to $\$1.00$ bill!"*
* **$80\%$ of the wheel slots** say: *"Round DOWN to $\$0.00$!"*

```text
POLICY 2 TIMELINE (STOCHASTIC PROBABILISTIC ROUNDING)

 Donor 1 ($0.20) ──► Spin Wheel (Lands on 12 <= 20) ──► Round UP to $1.00!
 Donor 2 ($0.20) ──► Spin Wheel (Lands on 85 > 20)  ──► Round DOWN to $0.00!
 Donor 3 ($0.20) ──► Spin Wheel (Lands on 42 > 20)  ──► Round DOWN to $0.00!
  :
 Donor 1,000 ($0.20) ──► Wheel lands on "UP" approximately 200 times!
 (Total Bank Account Balance = $200.00! EXACT EXPECTED VALUE RECOVERED!)
```

Trace 1,000 donors under Policy 2:
1. For Donor 1 ($\$0.20$), the wheel lands on slot 12 ($12 \le 20$). The cashier rounds **UP to $\$1.00$**!
2. For Donor 2 ($\$0.20$), the wheel lands on slot 85 ($85 > 20$). The cashier rounds **DOWN to $\$0.00$**.
3. Over 1,000 donors, the wheel lands on "Round UP" approximately **$200\text{ times}$** ($20\% \times 1,000 = 200$).
4. The bank account receives 200 $\$1.00$ bills.
5. Total bank account balance = **$\mathbf{\$200.00}$**!

Notice what Policy 2 achieved:
* **Zero Systematic Bias**: Not a single penny was lost or thrown away! The mathematical expected value $E[\text{Balance}]$ is **EXACTLY $\$200.00$**!
* **Unbiased Learning**: Microscopic updates were accumulated successfully into a coarse $\$1.00$ grid without expanding the logbook size!

This probability roulette wheel is the exact physical analogue of **Stochastic Rounding Hardware and Pseudo-Random Dither Mechanics**:
* The charity bank account is a **Low-Precision Weight Parameter ($W$)**.
* The $\$1.00$ bill grid is the **Quantization Step Size ($\epsilon / \text{LSB}$)**.
* The microscopic $\$0.20$ donation is a **Small Gradient Update ($\Delta W$)**.
* The 100-slot probability wheel is a **Hardware Pseudo-Random Number Generator (PRNG / LFSR)**.
* Spinning the wheel and rounding UP or DOWN is **Hardware Stochastic Rounding (SRU)**.
* Recovering the exact $\$200.00$ balance is **Unbiased Mathematical Expectation ($E[\text{SR}(x)] = x$)**.

---

## Primitive 1: Stochastic Rounding (SR) Mathematical Mechanics

Now that we possess a clear intuitive mental model of the bank cashier's probability wheel, let us examine the formal, rigorous engineering mechanics of **Stochastic Rounding (SR)**.

In mathematical hardware arithmetic, Stochastic Rounding is defined as a probabilistic rounding operator $\text{SR}(x)$ that maps a high-precision real-world number $x \in \mathbb{R}$ to an adjacent point on a discrete quantization grid $X_{\text{grid}}$:

Let $x$ be a high-precision floating-point or fixed-point value lying between two adjacent representable grid points $x_{\text{floor}}$ and $x_{\text{ceil}}$:

$$x_{\text{floor}} \le x \le x_{\text{ceil}}$$

$$\text{Quantization Grid Step Size } \epsilon = x_{\text{ceil}} - x_{\text{floor}}$$

Let $d$ be the normalized fractional distance of $x$ between $x_{\text{floor}}$ and $x_{\text{ceil}}$ ($0 \le d \le 1$):

$$d = \frac{x - x_{\text{floor}}}{x_{\text{ceil}} - x_{\text{floor}}} = \frac{x - x_{\text{floor}}}{\epsilon}$$

> **Stochastic Rounding Definition**: The Stochastic Rounding operator $\text{SR}(x)$ maps $x$ to $x_{\text{ceil}}$ with probability $p = d$, and to $x_{\text{floor}}$ with probability $1 - p = 1 - d$:

$$\mathbf{\text{SR}(x) = \begin{cases} x_{\text{ceil}} & \text{with probability } p = \frac{x - x_{\text{floor}}}{\epsilon} \\ x_{\text{floor}} & \text{with probability } 1 - p = 1 - \frac{x - x_{\text{floor}}}{\epsilon} \end{cases}}$$

```text
STOCHASTIC ROUNDING PROBABILITY DENSITY

 Quantization Grid Points: x_floor and x_ceil (Step Size = epsilon)
 Input Value x = x_floor + (d * epsilon)
 
       x_floor ◄───────────────── x ────────► x_ceil
       (Prob = 1 - d)                       (Prob = d)
```

---

### Mathematical Proof of Unbiased Expectation ($E[\text{SR}(x)] = x$)

The most important microarchitectural property of Stochastic Rounding is that it is **Mathematically Unbiased**.

Let us prove that the expected value $E[\text{SR}(x)]$ of the stochastically rounded result is **EXACTLY equal to the un-rounded input $x$**:

$$E[\text{SR}(x)] = \Big( x_{\text{ceil}} \cdot p \Big) + \Big( x_{\text{floor}} \cdot (1 - p) \Big)$$

Substitute $x_{\text{ceil}} = x_{\text{floor}} + \epsilon$ and $p = \frac{x - x_{\text{floor}}}{\epsilon}$:

$$E[\text{SR}(x)] = (x_{\text{floor}} + \epsilon) \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right) + x_{\text{floor}} \cdot \left( 1 - \frac{x - x_{\text{floor}}}{\epsilon} \right)$$

Expand the terms:

$$E[\text{SR}(x)] = x_{\text{floor}} \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right) + \epsilon \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right) + x_{\text{floor}} - x_{\text{floor}} \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right)$$

Cancel out the opposing $x_{\text{floor}} \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right)$ terms:

$$E[\text{SR}(x)] = \epsilon \cdot \left( \frac{x - x_{\text{floor}}}{\epsilon} \right) + x_{\text{floor}}$$

Cancel $\epsilon$ in the numerator and denominator:

$$E[\text{SR}(x)] = (x - x_{\text{floor}}) + x_{\text{floor}} = \mathbf{x}$$

$$\mathbf{E[\text{SR}(x)] = x \quad (\text{PROOF COMPLETE!})}$$

#### The Fundamental Hardware Takeaway:
**Stochastic Rounding introduces ZERO systematic quantization bias!** 

Over thousands of training steps, the statistical average of the rounded weights inside the memory registers matches the exact, infinite-precision mathematical trajectory of the neural network!

---

## Primitive 2: Hardware Stochastic Rounding Unit (SRU) and Dither Injection

Now let us examine the second core primitive: **The Hardware Stochastic Rounding Unit (SRU)** and **Pseudo-Random Dither Injection Mechanics**.

How do chip designers implement probabilistic rounding in digital CMOS silicon gates so that it executes in **a single clock cycle ($1\text{ cycle}$ latency)** without slowing down Tensor Core execution?

A physical **Hardware Stochastic Rounding Unit (SRU)** combines two digital logic sub-circuits:
1. **A Hardware Pseudo-Random Number Generator (PRNG)**
2. **A Dither Injection Adder and Truncation Unit**

```text
HARDWARE STOCHASTIC ROUNDING UNIT (SRU) DATAPATH

 High-Precision Input Mantissa M_in [23 Bits]
 ┌─────────────────────────────────────────────────────────────┐
 │ Upper Keep Bits M_keep [10b] │ Lower Fraction Bits M_frac[13b]│
 └─────────────┬────────────────┴──────────────┬───────────────┘
               │                               │
               │                               ▼
               │                   ┌───────────────────────┐
               │                   │ Hardware PRNG (LFSR)  │
               │                   │ Uniform Noise R [13b] │
               │                   └───────────┬───────────┘
               │                               │
               │                               ▼
               │                   ┌───────────────────────┐
               │                   │ 13-Bit Dither Adder   │
               │                   │ Carry_Out = M_frac + R│
               │                   └───────────┬───────────┘
               │                               │ Carry Out (0 or 1)
               ▼                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 10-Bit Rounding Incrementer Adder                           │
 │ M_out = M_keep + Carry_Out                                  │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Output Low-Precision Mantissa M_out [10 Bits] (Stochastically Rounded!)
```

---

### Step-by-Step Hardware Dither Injection Algorithm

Suppose the SRU receives a high-precision 23-bit mantissa $M_{\text{in}}$ and needs to round it down to a low-precision 10-bit mantissa $M_{\text{out}}$ (e.g., converting an FP32 accumulator result down to an FP16 register output):

#### Step 1: Bit Field Separation
The 23-bit input mantissa $M_{\text{in}}$ is split into two fields:
* **Upper Keep Bits ($M_{\text{keep}}$ — 10 Bits)**: The high-order bits that will be retained in the final output.
* **Lower Fraction Bits ($M_{\text{frac}}$ — 13 Bits)**: The low-order fractional bits that represent the distance $d$ to the next grid point ($0 \le M_{\text{frac}} < 2^{13}$).

#### Step 2: Hardware Pseudo-Random Dither Generation
On every clock cycle, a high-speed **Linear Feedback Shift Register (LFSR)** or Galois PRNG generates a uniform, pseudo-random $13\text{-bit}$ integer $R$:

$$R \sim U[0, \ 2^{13} - 1]$$

Where $R$ is an integer uniformly distributed between $0$ and $8,191$ ($2^{13} - 1$).

#### Step 3: Dither Addition & Carry-Out Extraction
The SRU adds the $13\text{-bit}$ random dither $R$ directly to the $13\text{-bit}$ lower fraction bits $M_{\text{frac}}$ using a 13-bit hardware integer adder:

$$\text{Sum}_{\text{dither}} = M_{\text{frac}} + R$$

The adder produces a 1-bit **Carry-Out signal ($C_{\text{out}} \in \{0, 1\}$)**:

$$\mathbf{C_{\text{out}} = \begin{cases} 1 & \text{if } (M_{\text{frac}} + R) \ge 2^{13} \quad (\text{Overflow / Round UP!}) \\ 0 & \text{if } (M_{\text{frac}} + R) < 2^{13} \quad (\text{No Overflow / Round DOWN!}) \end{cases}}$$

#### Step 4: Upper Mantissa Increment
The carry-out signal $C_{\text{out}}$ is added directly to the upper 10-bit keep bits $M_{\text{keep}}$ using a 10-bit incrementer adder:

$$\mathbf{M_{\text{out}} = M_{\text{keep}} + C_{\text{out}}}$$

---

### Mathematical Proof of Hardware Dither Probability

Why does adding random noise $R$ to the lower fraction bits $M_{\text{frac}}$ produce the exact probability $p = d$?

Let us evaluate the probability that $C_{\text{out}} = 1$:

$$P(C_{\text{out}} = 1) = P(M_{\text{frac}} + R \ge 2^{13}) = P(R \ge 2^{13} - M_{\text{frac}})$$

Since $R$ is uniformly distributed over the $2^{13}$ possible integer values in $[0, 2^{13}-1]$, the number of values of $R$ that satisfy $R \ge 2^{13} - M_{\text{frac}}$ is exactly $M_{\text{frac}}$:

$$\mathbf{P(C_{\text{out}} = 1) = \frac{M_{\text{frac}}}{2^{13}} = d \quad (\text{EXACT PROBABILISTIC MATCH!})}$$

Look at the simplicity of this hardware logic:
A single 13-bit integer adder and an LFSR generate **stochastic rounding with $100\%$ mathematical probability accuracy in 1 single clock cycle**!

---

## Hardware Pseudo-Random Number Generators: LFSR and xorshift Circuits

To feed the dither adders of a 32-lane Tensor Core with independent random numbers on every clock cycle ($32 \times 13 = 416\text{ random bits per cycle}$), the GPU must integrate lightweight, high-speed **Hardware Pseudo-Random Number Generators (PRNGs)**.

### Linear Feedback Shift Registers (LFSR)

The most area-efficient hardware PRNG is a **Galois Linear Feedback Shift Register (LFSR)**.

A Galois LFSR consists of a shift register connected to a feedback network constructed from Exclusive-OR (XOR) gates placed at specific polynomial tap positions:

```text
GALOIS LINEAR FEEDBACK SHIFT REGISTER (LFSR) SCHEMATIC

 16-Bit Galois LFSR (Polynomial: x^16 + x^14 + x^13 + x^11 + 1)
 ┌───┐   ┌───┐         ┌───┐   ┌───┐         ┌───┐   ┌───┐
 │b15├──►│b14├─(XOR)──►│b13├──►│b12├─(XOR)──►│b11├──►│b10│ ...
 └───┘   └───┘   ▲     └───┘   └───┘   ▲     └───┘   └───┘
   │             │                     │
   └─────────────┴─────────────────────┘ (Feedback from MSB)
 (Generates a pseudo-random sequence of 65,535 non-zero numbers per cycle!)
```

#### Microarchitectural Properties of Hardware LFSRs:
1. **Maximal Period ($2^n - 1$)**: A 16-bit LFSR with a primitive feedback polynomial (e.g., $x^{16} + x^{14} + x^{13} + x^{11} + 1$) steps through $65,535$ pseudo-random bit patterns before repeating.
2. **Minimal Silicon Die Area**: A 16-bit LFSR requires **only 16 flip-flops and 3 XOR gates**! Its physical die area is less than $50\text{ }\mu\text{m}^2$ in $7\text{nm}$ CMOS technology.
3. **Single-Cycle Output**: Generates 16 fresh pseudo-random bits on every single `posedge clk`.

---

## Comparing Rounding Modes: RNE vs. RZ vs. SR

To understand why Stochastic Rounding has become the gold standard for low-precision AI training hardware, let us compare the three primary hardware rounding modes across deep learning criteria:

```text
HARDWARE ROUNDING MODE COMPARISON MATRIX

 Rounding Mode           │ Mathematical Formula           │ Quantization Bias │ Allows Low-Prec Training?
─────────────────────────┼────────────────────────────────┼───────────────────┼───────────────────────────
 Round-to-Nearest-Even   │ Round to closest grid point    │ High (Stalls ΔW)  │ NO (Diverges in FP8/INT8)
 Round-toward-Zero (RZ)  │ Truncate fractional bits       │ Negative Bias     │ NO (Severe Bias Degradation)
 Stochastic Rounding(SR) │ Probabilistic p = d            │ ZERO (Unbiased)   │ YES! (100% Convergence!)
```

### Why Stochastic Rounding Is Superior for Low-Precision AI Training:
* **Round-to-Nearest-Even (RNE)**: Erases microscopic gradient updates ($\Delta W < 0.5 \epsilon$). Training divergence occurs when parameters are quantized to FP8 or INT8.
* **Round-toward-Zero (Truncation / RZ)**: Always rounds toward zero, creating a systematic negative force that shrinks all weight parameters across training, degrading final model accuracy.
* **Stochastic Rounding (SR)**: Preserves small gradient updates probabilistically, eliminates systematic quantization bias, and allows **FP8 and INT8 training pipelines to achieve $100\%$ of full FP32 accuracy**!

---

## Solved Industrial Engineering Exercise: Quantitative Stochastic Rounding Pipeline Trace, Unbiased Expectation Proof, and Gradient Accumulation Simulation

To consolidate your complete mastery of stochastic rounding hardware, dither injection pipelines, Galois LFSR pseudo-random generators, and unbiased expectation mechanics, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal arithmetic logic architect auditing a $2.0\text{ GHz}$ AI training accelerator chip ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The accelerator features a **Stochastic Rounding Unit (SRU)** embedded inside each Tensor Core lane.

```text
2.0 GHz AI ACCELERATOR STOCHASTIC ROUNDING UNIT (SRU)

 Clock Frequency          : 2.0 GHz (T_clk = 500 ps)
 Input Format (Acc)       : 16-Bit Fixed-Point (8 Integer Bits + 8 Fraction Bits)
 Output Format (Quantized): 8-Bit Fixed-Point (8 Integer Bits, 0 Fraction Bits)
 Quantization Step Size   : epsilon = 1.000 (LSB = 1)
 PRNG Generator           : 8-Bit Hardware LFSR (Generates R in range 0..255)
 SRU Latency              : 1 Clock Cycle (0.500 ns)
```

#### Hardware Bit Field Parsing:
* High-Precision Input $x$ (16 Bits): `Upper Keep Bits M_keep [15:8] (8 Bits)` + `Lower Fraction Bits M_frac [7:0] (8 Bits)`.
* For any input $x$, $M_{\text{frac}}$ represents the exact fractional distance $d$ to the next integer ($d = M_{\text{frac}} / 256$).
* The 8-bit LFSR generates a pseudo-random integer $R \in [0, 255]$.
* The SRU computes $\text{Sum}_{\text{dither}} = M_{\text{frac}} + R$. If $\text{Sum}_{\text{dither}} \ge 256$ ($C_{\text{out}} = 1$), $M_{\text{out}} = M_{\text{keep}} + 1$ (Round UP). Otherwise $M_{\text{out}} = M_{\text{keep}}$ (Round DOWN).

#### Workload Test Case:
A backpropagation training loop updates a weight parameter currently sitting at $W = 10$ ($M_{\text{keep}} = 10_d = \text{8'h0A}, M_{\text{frac}} = 0$).

The loop executes **1,000 backpropagation iterations**, adding a microscopic gradient update $\Delta W = +0.250$ ($M_{\text{frac}} = 64_{10}$, since $64 / 256 = 0.250$) on every iteration.

#### Your Objective

1. Calculate the probability $p$ of rounding UP on any single iteration under Stochastic Rounding.
2. Evaluate **System A (Standard Round-to-Nearest-Even / RNE)**:
   * Trace the updated weight $W_{\text{new}}$ after 1 iteration and after 1,000 iterations.
3. Evaluate **System B (Hardware Stochastic Rounding Unit / SRU)**:
   * Trace the expected number of Round UP events ($C_{\text{out}} = 1$) out of 1,000 iterations.
   * Calculate the expected final weight $E[W_{\text{final}}]$ after 1,000 iterations.
   * Prove mathematically that $E[W_{\text{final}}]$ matches the un-quantized continuous truth $W_{\text{true}} = 10 + (1,000 \times 0.250) = 260$.
4. Trace a 4-cycle execution sample for System B given LFSR random outputs $R = [100, 200, 210, 50]$ for input $x = 10.250$ ($M_{\text{keep}} = 10, M_{\text{frac}} = 64$).
5. Calculate the **Quantization Error Elimination Ratio** of System B over System A.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Probability $p$ and System A (Standard RNE) Trace

Input value $x = W + \Delta W = 10 + 0.250 = 10.250$.
* $x_{\text{floor}} = 10, x_{\text{ceil}} = 11$. Quantization step $\epsilon = 1.0$.
* Fractional distance $d = \frac{10.250 - 10}{1.0} = 0.250$.
* Fraction bits $M_{\text{frac}} = 0.250 \times 256 = \mathbf{64_{10} \quad (\text{8'h40})}$.

##### 1. Probability $p$ of Rounding UP under Stochastic Rounding:
$$\mathbf{p = d = 0.250 \quad (25.0\% \text{ Probability of Rounding UP to } 11)}$$

$$\mathbf{1 - p = 0.750 \quad (75.0\% \text{ Probability of Rounding DOWN to } 10)}$$

##### 2. System A (Standard Round-to-Nearest-Even / RNE) Execution:
On iteration 1:
* $x = 10.250$.
* Distance to $10$ is $0.250$. Distance to $11$ is $0.750$.
* RNE rounds to nearest integer $\implies \text{RNE}(10.250) = \mathbf{10}$.
* Weight update $\Delta W$ is **truncated to 0**! Updated weight $W_1 = 10$.

After 1,000 iterations:
* Every iteration evaluates $10.250 \to 10$.

$$\mathbf{W_{\text{final\_SystemA}} = 10 \quad (\text{TOTAL GRADIENT STALLING!})}$$

$$\text{Quantization Error}_A = |W_{\text{true}} - W_{\text{final\_A}}| = |260 - 10| = \mathbf{250.0 \quad (96.15\% \text{ Error!})}$$

Standard deterministic rounding erased all 1,000 gradient updates, leaving the weight completely stuck at 10!

---

#### Step 2: System B (Hardware Stochastic Rounding Unit / SRU) Trace

In System B, the 8-bit LFSR generates a pseudo-random integer $R \in [0, 255]$ on every iteration.

Condition for Carry-Out $C_{\text{out}} = 1$ (Round UP to 11):

$$\text{Sum}_{\text{dither}} = M_{\text{frac}} + R = 64 + R \ge 256 \implies R \ge 256 - 64 \implies \mathbf{R \ge 192}$$

Out of 256 possible values of $R \in [0, 255]$, there are exactly $256 - 192 = 64$ values that satisfy $R \ge 192$:

$$P(C_{\text{out}} = 1) = \frac{64}{256} = 0.250 \quad (\mathbf{25.0\% \text{ Exact Probability!}})$$

##### 1. Expected Number of Round UP Events in 1,000 Iterations:
$$N_{\text{round\_up}} = 1,000 \text{ iterations} \times 0.250 = \mathbf{250 \text{ Iterations}}$$

$$N_{\text{round\_down}} = 1,000 \text{ iterations} \times 0.750 = \mathbf{750 \text{ Iterations}}$$

##### 2. Calculate Expected Final Weight $E[W_{\text{final\_SystemB}}]$:
Each Round UP event adds $+1$ to $W$. Each Round DOWN event adds $0$ to $W$:

$$E[W_{\text{final\_SystemB}}] = W_{\text{initial}} + (N_{\text{round\_up}} \cdot 1) + (N_{\text{round\_down}} \cdot 0)$$

$$E[W_{\text{final\_SystemB}}] = 10 + (250 \times 1) + (750 \times 0) = 10 + 250 = \mathbf{260.0}$$

##### 3. Compare with Un-Quantized Continuous Truth ($W_{\text{true}}$):
$$W_{\text{true}} = 10 + (1,000 \times 0.250) = \mathbf{260.0}$$

$$\mathbf{E[W_{\text{final\_SystemB}}] == W_{\text{true}} = 260.0 \quad (\mathbf{\text{UNBIASED EXPECTATION PROVEN!}})}$$

$$\text{Quantization Error}_B = |260.0 - 260.0| = \mathbf{0.000 \quad (0.0\% \text{ Systematic Error!})}$$

```text
EXPECTATION AND ACCUMULATION COMPARISON

 System Configuration  │ 1,000-Iter Final Weight │ Quantization Bias Error │ Gradient Stalling
───────────────────────┼─────────────────────────┼─────────────────────────┼───────────────────
 Continuous Truth      │ 260.0                   │ 0.000                   │ None
 System A (RNE)        │  10.0                   │ 250.000 (96.15% Error!) │ TOTAL STALL!
 System B (Hardware SR)│ 260.0 (Expected)        │ 0.000   (0.0% Error!)   │ ZERO STALL!
```

---

#### Step 3: Trace 4-Cycle Execution Sample for System B

Input $x = 10.250$ ($M_{\text{keep}} = 10$, $M_{\text{frac}} = 64$).
LFSR outputs for 4 cycles: $R = [100, 200, 210, 50]$.

##### 1. Cycle 1 ($R_1 = 100$):
* $\text{Sum}_{\text{dither}} = M_{\text{frac}} + R_1 = 64 + 100 = 164$.
* Check $164 \ge 256$? **NO** ($C_{\text{out}} = 0$).
* Output $M_{\text{out}} = M_{\text{keep}} + 0 = \mathbf{10}$ (Round DOWN).

##### 2. Cycle 2 ($R_2 = 200$):
* $\text{Sum}_{\text{dither}} = M_{\text{frac}} + R_2 = 64 + 200 = 264$.
* Check $264 \ge 256$? **YES** ($C_{\text{out}} = 1$).
* Output $M_{\text{out}} = M_{\text{keep}} + 1 = \mathbf{11}$ (Round UP!).

##### 3. Cycle 3 ($R_3 = 210$):
* $\text{Sum}_{\text{dither}} = M_{\text{frac}} + R_3 = 64 + 210 = 274$.
* Check $274 \ge 256$? **YES** ($C_{\text{out}} = 1$).
* Output $M_{\text{out}} = M_{\text{keep}} + 1 = \mathbf{11}$ (Round UP!).

##### 4. Cycle 4 ($R_4 = 50$):
* $\text{Sum}_{\text{dither}} = M_{\text{frac}} + R_4 = 64 + 50 = 114$.
* Check $114 \ge 256$? **NO** ($C_{\text{out}} = 0$).
* Output $M_{\text{out}} = M_{\text{keep}} + 0 = \mathbf{10}$ (Round DOWN).

```text
4-CYCLE HARDWARE STOCHASTIC ROUNDING TRACE

 Cycle │ LFSR Noise R │ M_frac + R │ Overflow? (C_out) │ Output M_out │ Rounding Action
───────┼──────────────┼────────────┼───────────────────┼──────────────┼───────────────────
   1   │ 100          │ 64+100=164 │ NO  (C_out = 0)   │ 10           │ Round DOWN
   2   │ 200          │ 64+200=264 │ YES (C_out = 1)   │ 11           │ Round UP!
   3   │ 210          │ 64+210=274 │ YES (C_out = 1)   │ 11           │ Round UP!
   4   │  50          │ 64+50 =114 │ NO  (C_out = 0)   │ 10           │ Round DOWN
```

##### 4-Cycle Average Output:
$$\text{Average Output} = \frac{10 + 11 + 11 + 10}{4} = \frac{42}{4} = \mathbf{10.50}$$

(Notice how in just 4 cycles, the hardware average $10.50$ is approaching the continuous truth, whereas standard RNE produces $10.00$ continuously!).

---

#### Step 4: Calculate Quantization Error Elimination Ratio

$$\text{Error Elimination Ratio} = \frac{\text{Error}_{\text{SystemA}}}{\text{Error}_{\text{SystemB\_expected}}} = \frac{250.0}{0.000} \to \mathbf{\infty \quad (100\% \text{ Systematic Error Eliminated!)}}$$

##### Engineering Conclusion:
By incorporating a 1-cycle Hardware Stochastic Rounding Unit (SRU) with an 8-bit LFSR pseudo-random generator, System B eliminated $100\%$ of systematic quantization bias, preventing gradient stalling and allowing low-precision 8-bit training pipelines to achieve the exact mathematical convergence of full FP32 training!

---

### Sanity Check and Verification

Let us verify our mathematical, probability, and hardware circuit results against arithmetic principles:

1. **Probability Distribution Verification**:
   * Fraction $M_{\text{frac}} = 64 \implies d = 64 / 256 = 0.250$.
   * $P(R \ge 192) = \frac{256 - 192}{256} = \frac{64}{256} = 0.250$.
   * Hardware carry-out probability matches exact mathematical probability $p = d = 0.250$ with $100\%$ precision.
2. **Unbiased Expectation Proof Check**:
   * $E[\text{SR}(x)] = (11 \times 0.25) + (10 \times 0.75) = 2.75 + 7.50 = 10.250$.
   * Matches exact input $x = 10.250$. Expectation proof verified!
3. **1-Cycle Hardware Pipeline Latency Check**:
   * 8-bit dither addition ($64 + R$) and 8-bit incrementer ($M_{\text{keep}} + C_{\text{out}}$) execute in series in less than $0.30\text{ ns}$.
   * Fits comfortably within the $0.500\text{-ns}$ clock period ($2.0\text{ GHz}$), confirming 1-cycle execution speed!

All probability density functions, expectation proofs, LFSR dither adder paths, and $100\%$ quantization bias elimination metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Stochastic Rounding Hardware**: A probabilistic hardware rounding unit that rounds a high-precision arithmetic value $x$ to an adjacent low-precision grid point ($x_{\text{floor}}$ or $x_{\text{ceil}}$) with probability proportional to its proximity ($p = (x - x_{\text{floor}}) / \epsilon$), eliminating systematic quantization bias and preventing gradient stalling in low-precision AI training ($E[\text{SR}(x)] = x$).
* **Hardware Pseudo-Random Generator (PRNG / LFSR Dither Injection)**: A high-speed digital logic circuit (such as a Galois Linear Feedback Shift Register) that generates uniform pseudo-random noise bits ($R$) every clock cycle to inject dither into lower fraction bits before truncation, executing single-cycle unbiased stochastic rounding in silicon.
