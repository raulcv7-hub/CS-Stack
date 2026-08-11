# Ripple Carry Adder Latency and Critical Path Delay Analysis

## The Multi-Bit Speed Barrier in Cascaded Arithmetic Networks

A single full adder cell is a fast, efficient combinational circuit. In modern CMOS silicon, a full adder can compute the sum and carry-out of three single-bit inputs ($A, B, C_{\text{in}}$) in just a fraction of a nanosecond. Because each full adder is a complete arithmetic unit capable of handling an incoming carry, the most obvious way to build a multi-bit adder—such as an 8-bit, 32-bit, or 64-bit adder for a central processing unit—is to chain $N$ full adders together in a simple line.

In this cascaded structure, known as a **Ripple Carry Adder (RCA)**, the carry-out pin ($C_{\text{out}}$) of each full adder is wired directly into the carry-in pin ($C_{\text{in}}$) of the next higher-order full adder.

```text
THE MULTI-BIT CASCADED RIPPLE CARRY ADDER

 Bit 0 (LSB)           Bit 1                 Bit 2                 Bit 3 (MSB)
 ┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
 │ Full     │ Cout0    │ Full     │ Cout1    │ Full     │ Cout2    │ Full     │ Cout3
 │ Adder 0  ├─────────►│ Adder 1  ├─────────►│ Adder 2  ├─────────►│ Adder 3  ├────────►
 └──────────┘          └──────────┘          └──────────┘          └──────────┘
```

At first glance, this cascaded design appears to solve the multi-bit addition problem completely. It uses minimal silicon area and simple, repeating layout blocks. However, the moment this circuit is fabricated in silicon, it encounters a severe physical speed barrier.

While all $N$ bits of operand $A$ ($A_0, A_1, \dots, A_{N-1}$) and all $N$ bits of operand $B$ ($B_0, B_1, \dots, B_{N-1}$) arrive at the adder inputs simultaneously, the **carry bits cannot be evaluated in parallel**. 

Full Adder 1 cannot compute its final sum and carry-out until Full Adder 0 finishes computing $C_{\text{out}0}$. Full Adder 2 cannot finish until Full Adder 1 emits $C_{\text{out}1}$. Full Adder 3 must wait for Full Adder 2, and so on. The carry bit must "ripple" sequentially through every single stage from the least significant bit (LSB) all the way to the most significant bit (MSB), like a row of falling dominoes.

This sequential ripple delay creates a long, continuous chain of active gates known as the **Critical Path Delay**. 

For a 64-bit processor, the carry signal must pass through 64 consecutive full adder stages before the most significant sum bit ($S_{63}$) and final carry ($C_{64}$) settle to valid, trustworthy binary values. Because a digital computer's clock frequency is strictly limited by the slowest path in its combinational logic, the linear $O(N)$ delay growth of the Ripple Carry Adder forces the entire processor to slow down its global operating frequency, creating a major performance bottleneck in computer arithmetic.

---

## The 64-Person Domino Chain: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of ripple carry latency and critical path delay, let us step away from microchips and picture a row of falling dominoes set up across a room.

Imagine a line of 64 dominoes stood on end, spaced 2 centimeters apart. Each domino represents one Full Adder stage in a 64-bit Ripple Carry Adder. 

```text
THE 64-DOMINO RIPPLE CHAIN ANALOGY

 Domino 0 (LSB)     Domino 1           Domino 2            Domino 63 (MSB)
   ┌───┐             ┌───┐              ┌───┐               ┌───┐
   │ 0 │  ───────►   │ 1 │   ───────►   │ 2 │   ... ───►    │ 63│
   └───┘             └───┘              └───┘               └───┘
  Tips First!       Waits for 0        Waits for 1         Waits for 62!
```

Suppose you tip over Domino 0 at the far left. 
* Domino 0 falls and knocks over Domino 1.
* Domino 1 falls and knocks over Domino 2.
* Domino 2 falls and knocks over Domino 3.
* The falling motion ripples sequentially down the line until, finally, Domino 63 falls to the ground.

Now, ask yourself three crucial physical questions about this domino chain:

1. **How fast does an individual domino fall?** An individual domino falls in just $0.1$ seconds. This represents the internal delay of a single Full Adder cell ($t_{\text{carry}}$).
2. **Can Domino 63 fall at the exact same moment you tip Domino 0?** Absolutely not! Even though Domino 63 is ready and standing, it is physically impossible for Domino 63 to fall until the wave of kinetic energy travels through all 63 preceding dominoes.
3. **How long does the entire 64-domino chain take to finish falling?** The total time is $64 \times 0.1 \text{ seconds} = 6.4 \text{ seconds}$!

This 6.4-second total falling time is the **Critical Path Delay**. Even though every individual domino falls in a lightning-fast 0.1 seconds, the cumulative delay of the chain is 64 times longer.

In a Ripple Carry Adder, the carry bit is that falling domino. The binary inputs $A$ and $B$ are like setting up the dominoes—they arrive everywhere at once. But the carry-out signal is a physical wave of voltage that must travel sequentially through every single Full Adder cell. Until that carry wave reaches the very last bit, the total sum is incomplete, and the computer must wait.

---

## Mechanics of Ripple Carry Adder Architecture and Latency Accumulation

To master the physics and performance of multi-bit addition, we must dissect the formal mechanics of its two core primitives:
1. **The Ripple Carry Adder (RCA)**: How $N$ single-bit Full Adders are connected in series to form an $N$-bit arithmetic word adder.
2. **The Critical Path Delay**: How gate propagation delays accumulate along the worst-case carry propagation path, imposing a strict upper limit on microprocessor clock frequency.

---

### Primitive 1: The Ripple Carry Adder (RCA) Architecture

An $N$-bit **Ripple Carry Adder (RCA)** accepts two $N$-bit binary input words:

$$
\mathbf{A} = (A_{N-1}, A_{N-2}, \dots, A_1, A_0)
$$

$$
\mathbf{B} = (B_{N-1}, B_{N-2}, \dots, B_1, B_0)
$$

And an initial input carry bit $C_0$ (also called $C_{\text{in}}$).

It produces an $N$-bit binary sum word $\mathbf{S} = (S_{N-1}, \dots, S_1, S_0)$ and a final outgoing carry bit $C_N$:

$$
\mathbf{S} = (S_{N-1}, S_{N-2}, \dots, S_1, S_0)
$$

$$
\text{Final Carry} = C_N
$$

Where:
* $A_k, B_k$ represent the $k$-th operand bits (for $0 \le k \le N-1$).
* $S_k$ represents the $k$-th local sum output bit.
* $C_k$ represents the carry bit generated by stage $k-1$ and fed into stage $k$.
* $C_0$ is the initial carry-in to the entire adder.
* $C_N$ is the final carry-out from the most significant stage $N-1$.

```text
COMPLETE 4-BIT RIPPLE CARRY ADDER ARCHITECTURE

 Input A3, B3         Input A2, B2         Input A1, B1         Input A0, B0
    │   │                │   │                │   │                │   │
    ▼   ▼                ▼   ▼                ▼   ▼                ▼   ▼
 ┌──────────┐  C3     ┌──────────┐  C2     ┌──────────┐  C1     ┌──────────┐
 │ Full     │◄────────┤ Full     │◄────────┤ Full     │◄────────┤ Full     │◄── Initial C0
 │ Adder 3  │         │ Adder 2  │         │ Adder 1  │         │ Adder 0  │
 └────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
   Carry C4             Sum S2               Sum S1               Sum S0
  (Final MSB)
```

#### 1. Stage-by-Stage Interconnect Equations

The $N$-bit Ripple Carry Adder is constructed by instantiating $N$ identical Full Adder cells ($\text{FA}_0, \text{FA}_1, \dots, \text{FA}_{N-1}$).

For every stage $k$ from $0$ to $N-1$, the internal stage equations are:

$$
S_k = A_k \oplus B_k \oplus C_k
$$

$$
C_{k+1} = (A_k \cdot B_k) + (C_k \cdot (A_k \oplus B_k))
$$

Where:
* $S_k$ is the local $k$-th sum bit.
* $C_{k+1}$ is the carry-out of stage $k$, which serves as the carry-in $C_{\text{in}}$ to stage $k+1$.
* $A_k, B_k$ are the $k$-th input operand bits.
* $C_k$ is the carry-in to stage $k$.

Notice the tight cascading link: **$C_{k+1}$ depends directly on $C_k$**. This recursive dependency $C_{k+1} = f(C_k)$ is the exact mathematical definition of sequential carry rippling.

---

### Primitive 2: Critical Path Delay Analysis

To determine how fast an $N$-bit Ripple Carry Adder can operate in silicon, we must perform a rigorous **Critical Path Analysis**.

> **Definition of Critical Path**: The Critical Path is the longest continuous chain of logic gates between any input terminal and any output terminal in a combinational circuit. The total time required for a signal to propagate along this longest path defines the circuit's total delay.

#### 1. Internal Full Adder Gate Delays

Let us review the internal gate-level structure of a standard Full Adder cell ($\text{FA}_k$):
* **Sum Path ($S_k$)**: Uses two 2-input XOR gates in series:
  $$S_k = (A_k \oplus B_k) \oplus C_k$$
* **Carry Path ($C_{k+1}$)**: Uses one 2-input XOR gate, one 2-input AND gate, and one 2-input OR gate:
  $$C_{k+1} = (A_k \cdot B_k) + (C_k \cdot (A_k \oplus B_k))$$

```text
GATE-LEVEL PROPAGATION DELAYS INSIDE ONE FULL ADDER CELL

 Path 1 (Propagate Term Pk): A_k, B_k ──► [ XOR Gate ] ──► P_k
                             Delay = t_xor

 Path 2 (Local Sum S_k):     P_k, C_k ──► [ XOR Gate ] ──► S_k
                             Delay = t_xor + t_xor = 2 * t_xor

 Path 3 (Carry-Out C_k+1):   P_k, C_k ──► [ AND Gate ] ──► [ OR Gate ] ──► C_k+1
                             Delay = t_xor + t_and + t_or
```

Let us define the characteristic physical delays for our technology library:
* $t_{\text{xor}}$: Propagation delay of a 2-input XOR gate.
* $t_{\text{and}}$: Propagation delay of a 2-input AND gate.
* $t_{\text{or}}$: Propagation delay of a 2-input OR gate.
* $t_{\text{carry}}$: The propagation delay required for a carry-in signal $C_k$ to pass through stage $k$ and emerge as $C_{k+1}$:
  $$t_{\text{carry}} = t_{\text{and}} + t_{\text{or}}$$
  *(Note: When $C_k$ arrives, the propagate signal $P_k = A_k \oplus B_k$ has already been computed in parallel! So $C_k$ only needs to pass through 1 AND gate and 1 OR gate).*

#### 2. Tracing the $N$-Bit Critical Path Chronology

Let us trace the worst-case time delay required for all outputs to become stable after inputs $\mathbf{A}, \mathbf{B},$ and $C_0$ arrive at $t = 0$:

1. **Time $t = 0.0\text{ ns}$**:
   Inputs $\mathbf{A} = (A_{N-1} \dots A_0)$ and $\mathbf{B} = (B_{N-1} \dots B_0)$ arrive simultaneously at all $N$ Full Adder cells.

2. **Time $t = t_{\text{xor}}$**:
   All $N$ Full Adder cells compute their local Carry Propagate terms $P_k = A_k \oplus B_k$ in parallel!
   All $N$ Full Adder cells compute their local Carry Generate terms $G_k = A_k \cdot B_k$ in parallel ($t = t_{\text{and}}$)!

3. **Time $t = t_{\text{stage0}}$ (Bit 0 Computes First Carry $C_1$)**:
   Stage 0 ($\text{FA}_0$) combines $C_0$ with $P_0$ and $G_0$ to produce $C_1$:
   $$t_{C1} = t_{\text{xor}} + t_{\text{and}} + t_{\text{or}}$$

4. **Time $t = t_{C1} + (N - 2) \cdot t_{\text{carry}}$ (Rippling Through Middle Stages)**:
   The carry signal $C_1$ ripples through intermediate stages $\text{FA}_1, \text{FA}_2, \dots, \text{FA}_{N-2}$.
   Each intermediate stage adds a delay of $t_{\text{carry}} = t_{\text{and}} + t_{\text{or}}$.
   The carry $C_{N-1}$ arrives at the final stage $\text{FA}_{N-1}$ at time:
   $$t_{C_{N-1}} = t_{\text{xor}} + (N - 1) \cdot (t_{\text{and}} + t_{\text{or}})$$

5. **Time $t = T_{\text{critical}}$ (Final MSB Sum $S_{N-1}$ and Final Carry $C_N$ Settle)**:
   The final stage $\text{FA}_{N-1}$ receives $C_{N-1}$ and computes the final sum bit $S_{N-1}$ through its second XOR gate:
   $$T_{\text{critical}} = t_{C_{N-1}} + t_{\text{xor}} = 2 \cdot t_{\text{xor}} + (N - 1) \cdot (t_{\text{and}} + t_{\text{or}})$$

```text
CRITICAL PATH TIMING DERIVATION

 T_critical = [ Initial XOR Delay ] + [ (N-1) Ripple Carry Stages ] + [ Final XOR Delay ]
            = t_xor                 + (N - 1) * (t_and + t_or)     + t_xor
            = 2 * t_xor             + (N - 1) * (t_and + t_or)
```

#### Mathematical Formula for $N$-Bit RCA Critical Path Delay:

$$
T_{\text{critical}}(N) = 2 \cdot t_{\text{xor}} + (N - 1) \cdot (t_{\text{and}} + t_{\text{or}})
$$

Where:
* $T_{\text{critical}}(N)$ is the total worst-case propagation delay of an $N$-bit Ripple Carry Adder.
* $N$ is the number of bits in the adder word width.
* $t_{\text{xor}}$ is the delay of a 2-input XOR gate.
* $t_{\text{and}}$ is the delay of a 2-input AND gate.
* $t_{\text{or}}$ is the delay of a 2-input OR gate.

Notice the linear term: **$(N - 1) \cdot (t_{\text{and}} + t_{\text{or}})$**. The delay grows as a direct linear function $O(N)$ of word length $N$!

---

### Maximum Operating Clock Frequency ($f_{\text{max}}$)

In a synchronous digital processor, arithmetic operations take place between global clock pulses. To ensure that an adder never outputs corrupted data, the clock period $T_{\text{clk}}$ must be set **longer than the Critical Path Delay**:

$$
T_{\text{clk}} \ge T_{\text{critical}} + t_{\text{setup}} + t_{\text{skew}}
$$

Where:
* $T_{\text{clk}}$ is the period of the main system clock.
* $T_{\text{critical}}$ is the adder's worst-case propagation delay.
* $t_{\text{setup}}$ is the setup time required by destination register flip-flops.
* $t_{\text{skew}}$ is the maximum clock arrival uncertainty across the silicon die.

The maximum operating clock frequency $f_{\text{max}}$ of the processor is the reciprocal of the clock period:

$$
f_{\text{max}} = \frac{1}{T_{\text{clk}}} \le \frac{1}{T_{\text{critical}} + t_{\text{setup}} + t_{\text{skew}}}
$$

```text
CLOCK FREQUENCY HARDWARE LIMITATION

 If T_critical = 10.0 ns  ──► T_clk = 10.0 ns  ──► f_max = 1 / 10ns = 100 MHz
 If T_critical =  2.0 ns  ──► T_clk =  2.0 ns  ──► f_max = 1 / 2ns  = 500 MHz!
```

This equation shows why critical path delay is so vital in computer engineering: **Reducing $T_{\text{critical}}$ directly increases the clock frequency of the entire CPU!**

---

## Input-Dependent Delay Dynamics: Worst-Case versus Best-Case Vectors

An important real-world property of the Ripple Carry Adder is that its actual signal propagation delay varies depending on the specific numbers being added!

### 1. The Worst-Case Input Vector ($O(N)$ Full Ripple)

The worst-case delay occurs when an arithmetic operation requires a carry bit to travel through **every single stage** from Bit 0 all the way to Bit $N-1$.

Consider adding $\mathbf{A} = 11111111_2$ (decimal 255) and $\mathbf{B} = 00000001_2$ (decimal 1) with $C_0 = 0$ in an 8-bit adder:

```text
WORST-CASE CARRY PROPAGATION PATTERN

 Column Index:    7   6   5   4   3   2   1   0
 Input A     :    1   1   1   1   1   1   1   1
 Input B     :    0   0   0   0   0   0   0   1
 Carry-In    :   c7  c6  c5  c4  c3  c2  c1   0
                ─── ─── ─── ─── ─── ─── ─── ───
 Process     :   At Bit 0: 1 + 1 = 0, Carry-Out c1 = 1!
                 At Bit 1: 1 + 0 + c1(1) = 0, Carry-Out c2 = 1!
                 At Bit 2: 1 + 0 + c2(1) = 0, Carry-Out c3 = 1!
                 ...
                 Carries RIPPLE through ALL 8 STAGES to c8!
```

Trace what happens:
* Bit 0 evaluates $1 + 1 = 0$, generating $C_1 = 1$.
* Bit 1 evaluates $1 + 0 + C_1(1) = 0$, generating $C_2 = 1$.
* Bit 2 evaluates $1 + 0 + C_2(1) = 0$, generating $C_3 = 1$.
* The carry ripples through **all 8 stages**, ending at $C_8 = 1$ and producing sum $\mathbf{S} = 00000000_2$.

This addition triggers the **maximum critical path delay** $T_{\text{critical}}(8)$.

### 2. The Best-Case Input Vector ($O(1)$ Zero Propagation)

The best-case delay occurs when no stage generates or propagates a carry, or when carries are absorbed immediately in the first stage.

Consider adding $\mathbf{A} = 00000000_2$ and $\mathbf{B} = 00000000_2$ with $C_0 = 0$:
* Bit 0 evaluates $0 + 0 + 0 = 0$, generating $C_1 = 0$.
* All carry bits stay at $0$ immediately.
* The sum outputs settle in just **$2 \cdot t_{\text{xor}}$** (the delay of two XOR gates)!

```text
BEST-CASE ZERO PROPAGATION PATTERN

 Column Index:    7   6   5   4   3   2   1   0
 Input A     :    0   0   0   0   0   0   0   0
 Input B     :    0   0   0   0   0   0   0   0
 Carry-In    :    0   0   0   0   0   0   0   0
               ─── ─── ─── ─── ─── ─── ─── ───
 Process     :  No carries generated anywhere!
                Outputs settle in 2 * t_xor (O(1) Delay).
```

### Why Synchronous Processors Must Design for the Worst Case
Even though many arithmetic additions finish in 1 or 2 gate delays, a synchronous CPU cannot change its clock speed on a cycle-by-cycle basis. The clock period $T_{\text{clk}}$ **MUST be set to accommodate the Worst-Case Input Vector**. 

The CPU must wait for the worst-case 64-bit carry ripple even when performing simple additions that generate no carries!

---

## Scaling Barriers: The Linear $O(N)$ Latency Wall

Let us evaluate how the Critical Path Delay of a Ripple Carry Adder scales as computer architectures evolve from 8-bit microcontrollers to 64-bit supercomputers.

Assume standard physical gate delays:
* $t_{\text{xor}} = 1.0\text{ ns}$
* $t_{\text{and}} = 0.5\text{ ns}$
* $t_{\text{or}} = 0.5\text{ ns}$
* Single-stage carry delay $t_{\text{carry}} = t_{\text{and}} + t_{\text{or}} = 1.0\text{ ns}$

Using $T_{\text{critical}}(N) = 2 \cdot t_{\text{xor}} + (N - 1) \cdot t_{\text{carry}}$:

```text
RIPPLE CARRY ADDER SCALING TABLE

 Word Width (N Bits) │ Critical Path Delay T_critical │ Max Frequency (Theoretical)
─────────────────────┼────────────────────────────────┼───────────────────────────────
   4 Bits (Nibble)   │  2(1.0) + 3(1.0) =  5.0 ns     │  f_max = 200.0 MHz
   8 Bits (Byte)     │  2(1.0) + 7(1.0) =  9.0 ns     │  f_max = 111.1 MHz
  16 Bits (Half-Word)│  2(1.0) + 15(1.0) = 17.0 ns    │  f_max =  58.8 MHz
  32 Bits (Word)     │  2(1.0) + 31(1.0) = 33.0 ns    │  f_max =  30.3 MHz
  64 Bits (Double)   │  2(1.0) + 63(1.0) = 65.0 ns    │  f_max =  15.3 MHz!
```

Look at the 64-bit row in this table:
* An 8-bit Ripple Carry Adder completes in $9.0\text{ ns}$ ($111\text{ MHz}$).
* A 64-bit Ripple Carry Adder completes in $65.0\text{ ns}$ ($15.3\text{ MHz}$).

To add two 64-bit numbers, a pure Ripple Carry Adder takes **more than seven times longer** than an 8-bit adder! A 15.3 MHz clock speed is completely unacceptable for modern microprocessors running at 3.0 GHz or 5.0 GHz.

```text
THE SCALING WALL OF RIPPLE CARRY ADDITION

 Latency (ns)
   70 ┼                                                  * (64-Bit: 65 ns)
   60 ┼                                                 
   50 ┼                                                
   40 ┼                                   * (32-Bit: 33 ns)
   30 ┼                                  
   20 ┼                     * (16-Bit: 17 ns)
   10 ┼        * (8-Bit: 9 ns)
    0 ┴────────┴────────────┴─────────────┴──────────────┴──────►
              8-Bit        16-Bit        32-Bit        64-Bit
                             Word Length N
```

This linear $O(N)$ latency wall demonstrates why pure Ripple Carry Adders are restricted to small 4-bit or 8-bit microcontroller sub-blocks. For 32-bit and 64-bit high-speed ALUs, computer architects replace or augment the ripple cascade with parallel carry acceleration techniques, such as **Carry Lookahead Adders (CLA)**.

---

## Solved Industrial Engineering Exercise: 8-Bit Avionics ALU Adder Subsystem

To consolidate your complete mastery of Ripple Carry Adder architecture, gate-level carry propagation, critical path delay modeling, $f_{\text{max}}$ calculations, and worst-case input vector evaluation, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics defense firm is engineering the 8-bit primary integer addition block for a satellite flight computer's central Processing Unit. The block uses an 8-bit Ripple Carry Adder ($\text{RCA}_8$) built from eight cascaded Full Adder cells ($\text{FA}_0$ through $\text{FA}_7$).

```text
SATELLITE 8-BIT RIPPLE CARRY ADDER SUBSYSTEM

 Input A[7:0] ──┐
 Input B[7:0] ──┼──► [ 8-Bit Ripple Carry Adder ] ──┬──► Sum Output S[7:0]
 Carry-In Cin0──┘                                   └──► Final Carry Output C8
```

The system processes two 8-bit unsigned binary operands:

$$
\mathbf{A} = (A_7, A_6, A_5, A_4, A_3, A_2, A_1, A_0)
$$

$$
\mathbf{B} = (B_7, B_6, B_5, B_4, B_3, B_2, B_1, B_0)
$$

And an initial carry-in $C_0 = 0$.

#### Physical CMOS Technology Library Delay Specifications:
* 2-Input XOR Gate Delay: $t_{\text{xor}} = 0.8\text{ ns}$
* 2-Input AND Gate Delay: $t_{\text{and}} = 0.4\text{ ns}$
* 2-Input OR Gate Delay: $t_{\text{or}} = 0.4\text{ ns}$
* Destination Flip-Flop Register Setup Time: $t_{\text{setup}} = 0.6\text{ ns}$
* Clock Tree Uncertainty Skew: $t_{\text{skew}} = 0.3\text{ ns}$

#### Your Objective

1. Calculate the single-stage carry propagation delay $t_{\text{carry}}$ and single-stage sum delay $t_{\text{sum}}$ for one Full Adder cell.
2. Calculate the exact worst-case Critical Path Delay $T_{\text{critical}}$ for the entire 8-bit Ripple Carry Adder.
3. Calculate the maximum safe operating clock frequency $f_{\text{max}}$ for the satellite ALU.
4. Simulate the 8-bit RCA on the worst-case carry ripple addition problem $\mathbf{A} = 11111111_2$ ($255_{10}$) and $\mathbf{B} = 00000001_2$ ($1_{10}$) with $C_0 = 0$.
5. Evaluate all intermediate carry bits ($C_1$ through $C_8$), verify the final sum vector $\mathbf{S}$, and confirm mathematical correctness against decimal arithmetic.

---

### Step-by-Step Derivation

#### Step 1: Calculate Single-Stage Full Adder Delays

Using the technology library specifications:

1. **Single-Stage Carry Delay ($t_{\text{carry}}$)**:
   The time required for an incoming carry $C_k$ to pass through an AND gate and an OR gate to emerge as $C_{k+1}$:
   $$t_{\text{carry}} = t_{\text{and}} + t_{\text{or}} = 0.4\text{ ns} + 0.4\text{ ns} = 0.8\text{ ns}$$

2. **Single-Stage Sum Delay ($t_{\text{sum}}$)**:
   The time required for operand inputs $A_k, B_k$ to pass through two consecutive XOR gates to emerge as $S_k$:
   $$t_{\text{sum}} = 2 \cdot t_{\text{xor}} = 2 \cdot 0.8\text{ ns} = 1.6\text{ ns}$$

---

#### Step 2: Derive the 8-Bit Critical Path Delay ($T_{\text{critical}}$)

The 8-bit Ripple Carry Adder has $N = 8$ stages ($\text{FA}_0$ to $\text{FA}_7$).

Applying the Critical Path Delay formula:

$$
T_{\text{critical}}(8) = 2 \cdot t_{\text{xor}} + (N - 1) \cdot (t_{\text{and}} + t_{\text{or}})
$$

Substituting $N = 8$, $t_{\text{xor}} = 0.8\text{ ns}$, and $(t_{\text{and}} + t_{\text{or}}) = 0.8\text{ ns}$:

$$
T_{\text{critical}}(8) = 2 \cdot (0.8\text{ ns}) + (8 - 1) \cdot (0.8\text{ ns})
$$

$$
T_{\text{critical}}(8) = 1.6\text{ ns} + 7 \cdot (0.8\text{ ns}) = 1.6\text{ ns} + 5.6\text{ ns} = 7.2\text{ ns}
$$

The worst-case Critical Path Delay of the 8-bit RCA is **$7.2\text{ nanoseconds}$**.

---

#### Step 3: Calculate Maximum Operating Clock Frequency ($f_{\text{max}}$)

The minimum safe clock period $T_{\text{clk}}$ must include $T_{\text{critical}}$, setup time $t_{\text{setup}}$, and clock skew $t_{\text{skew}}$:

$$
T_{\text{clk}} = T_{\text{critical}} + t_{\text{setup}} + t_{\text{skew}}
$$

Substituting values:

$$
T_{\text{clk}} = 7.2\text{ ns} + 0.6\text{ ns} + 0.3\text{ ns} = 8.1\text{ ns}
$$

Now calculate the maximum safe clock frequency $f_{\text{max}}$:

$$
f_{\text{max}} = \frac{1}{T_{\text{clk}}} = \frac{1}{8.1\text{ ns}} = \frac{1}{8.1 \times 10^{-9}\text{ s}} \approx 123,456,790\text{ Hz} \approx 123.46\text{ MHz}
$$

The satellite ALU can safely operate at a maximum clock frequency of **$123.46\text{ MHz}$**.

---

#### Step 4: Simulate Worst-Case Addition $\mathbf{A} = 11111111_2 + \mathbf{B} = 00000001_2$ ($C_0 = 0$)

Let us trace the carry ripple through every single stage from Bit 0 to Bit 7.

##### Stage 0 ($\text{FA}_0$, LSB):
* Inputs: $A_0 = 1, B_0 = 1, C_0 = 0$.
* Local Sum $S_0 = A_0 \oplus B_0 \oplus C_0 = 1 \oplus 1 \oplus 0 = 0$.
* Carry-Out $C_1 = (A_0 \cdot B_0) + (C_0 \cdot (A_0 \oplus B_0)) = (1 \cdot 1) + (0 \cdot 0) = 1 + 0 = 1$.
* **Status**: $S_0 = 0, C_1 = 1$ (Generated at $t = 2.4\text{ ns}$).

##### Stage 1 ($\text{FA}_1$):
* Inputs: $A_1 = 1, B_1 = 0$, Incoming Carry $C_1 = 1$.
* Local Sum $S_1 = A_1 \oplus B_1 \oplus C_1 = 1 \oplus 0 \oplus 1 = 0$.
* Carry-Out $C_2 = (A_1 \cdot B_1) + (C_1 \cdot (A_1 \oplus B_1)) = (1 \cdot 0) + (1 \cdot 1) = 0 + 1 = 1$.
* **Status**: $S_1 = 0, C_2 = 1$ (Ready at $t = 3.2\text{ ns}$).

##### Stage 2 ($\text{FA}_2$):
* Inputs: $A_2 = 1, B_2 = 0$, Incoming Carry $C_2 = 1$.
* Local Sum $S_2 = 1 \oplus 0 \oplus 1 = 0$.
* Carry-Out $C_3 = (1 \cdot 0) + (1 \cdot 1) = 1$.
* **Status**: $S_2 = 0, C_3 = 1$ (Ready at $t = 4.0\text{ ns}$).

##### Stage 3 ($\text{FA}_3$):
* Inputs: $A_3 = 1, B_3 = 0, C_3 = 1 \implies S_3 = 0, C_4 = 1$ (Ready at $t = 4.8\text{ ns}$).

##### Stage 4 ($\text{FA}_4$):
* Inputs: $A_4 = 1, B_4 = 0, C_4 = 1 \implies S_4 = 0, C_5 = 1$ (Ready at $t = 5.6\text{ ns}$).

##### Stage 5 ($\text{FA}_5$):
* Inputs: $A_5 = 1, B_5 = 0, C_5 = 1 \implies S_5 = 0, C_6 = 1$ (Ready at $t = 6.4\text{ ns}$).

##### Stage 6 ($\text{FA}_6$):
* Inputs: $A_6 = 1, B_6 = 0, C_6 = 1 \implies S_6 = 0, C_7 = 1$ (Ready at $t = 7.2\text{ ns}$).

##### Stage 7 ($\text{FA}_7$, MSB):
* Inputs: $A_7 = 1, B_7 = 0$, Incoming Carry $C_7 = 1$.
* Local Sum $S_7 = 1 \oplus 0 \oplus 1 = 0$.
* Final Carry-Out $C_8 = (1 \cdot 0) + (1 \cdot 1) = 1$.
* **Status**: $S_7 = 0, C_8 = 1$ (Final result settles at $t = 7.2\text{ ns}$).

---

#### Step 5: Verify Result Against Decimal Arithmetic

Assembling the output sum vector $\mathbf{S}$ and final carry $C_8$:
* Final Carry $C_8 = 1$.
* Sum Vector $\mathbf{S} = (S_7, S_6, S_5, S_4, S_3, S_2, S_1, S_0) = 00000000_2$.
* Combined 9-Bit Output Frame $(C_8, \mathbf{S}) = 100000000_2$.

Converting to decimal:
* Input $\mathbf{A} = 11111111_2 = 255_{10}$.
* Input $\mathbf{B} = 00000001_2 = 1_{10}$.
* Expected Decimal Sum: $255 + 1 = 256_{10}$.
* Circuit Output: $100000000_2 = 1 \cdot 2^8 + 0 \cdot 2^7 + \dots + 0 \cdot 2^0 = 256_{10}$.

$$255_{10} + 1_{10} = 256_{10} \quad \iff \quad 11111111_2 + 00000001_2 = 100000000_2$$

The carry rippled through all 8 stages, settling at $T_{\text{critical}} = 7.2\text{ ns}$. The simulation matches decimal mathematics with 100% precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Ripple Carry Adder (RCA)**: A multi-bit binary adder architecture constructed by cascading $N$ single-bit Full Adders in series, where the carry-out terminal $C_{k+1}$ of stage $k$ connects directly to the carry-in terminal $C_{\text{in}}$ of stage $k+1$, creating a simple, low-area structure whose performance is limited by sequential carry rippling.
* **Critical Path Delay**: The longest continuous chain of gate propagation delays through a combinational logic circuit—formulated for an $N$-bit RCA as $T_{\text{critical}} = 2 \cdot t_{\text{xor}} + (N - 1) \cdot (t_{\text{and}} + t_{\text{or}})$—which establishes the maximum operational clock frequency $f_{\text{max}}$ of a synchronous digital system.
