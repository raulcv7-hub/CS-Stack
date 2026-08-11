---
title: "Modulo-N Arbitrary Sequence Counter Synthesis and Synchronous Clear Mechanics"
---

# Modulo-N Arbitrary Sequence Counter Synthesis and Synchronous Clear Mechanics

## The Non-Power-of-Two Truncation Failure in Digital Arithmetic

Standard binary counters designed with $K$ flip-flops possess a natural counting capacity equal to a power of two ($2^K = 2, 4, 8, 16, 32, 64 \dots$). A 4-bit binary counter naturally cycles through 16 states ($0000_2$ to $1111_2$, or $0$ to $15_{10}$) before rolling over back to zero.

However, real-world digital applications rarely operate on convenient power-of-two intervals. 

Consider the timing and measurement systems that surround our daily lives:
* A digital wristwatch or wall clock requires a seconds and minutes counter that counts from $0$ to $59$ (**Modulo-60 Counter**) before resetting to zero.
* That same clock requires an hour counter that counts from $1$ to $12$ (**Modulo-12 Counter**) or $0$ to $23$ (**Modulo-24 Counter**).
* A digital multimeter or numeric LED display driver requires a Binary-Coded Decimal (BCD) decade counter that counts from $0$ to $9$ (**Modulo-10 Counter**).
* An automotive engine crankshaft sensor requires a counter that resets after $360$ pulses (**Modulo-360 Counter**).

If an engineer attempts to build a Modulo-10 counter ($0 \to 9$) by taking a standard 4-bit binary counter ($0 \to 15$) and truncating its sequence using an **Asynchronous Clear Pin ($\overline{\text{CLR}}$)** connected to an AND gate that detects state $10_{10}$ ($1010_2$), a severe physical hardware failure occurs.

```text
THE HAZARDOUS ASYNCHRONOUS RESET TRUNCATION TRAP

 Standard 4-Bit Counter ──► State 1010_2 (10) ──► NAND Gate ──► Asynchronous Clear Pin
 (Counts 0 to 15)                                                (Flashes 1010_2 for 1 ns!)
                                                                         │
                                                                         ▼
                                                            SPURIOUS GLITCH SPIKE!
```

To trigger an asynchronous clear pin, the counter MUST physically enter state $1010_2$ first! 

For a brief window of $1$ to $3$ nanoseconds, the counter outputs briefly display the forbidden state $1010_2$ ($10_{10}$). The moment state $1010_2$ appears, the clearing gate fires, driving the reset pin low and wiping the counter back to $0000_2$.

This brief $1010_2$ voltage pulse is a **Transient Asynchronous Reset Glitch**. It causes two catastrophic failure modes:
1. **Output Glitching**: Downstream decoders or memory buses connected to the counter read the transient $1010_2$ state, causing false display blinks or corrupted memory writes.
2. **Partial Reset Race Conditions**: Because flip-flops have slightly different internal transistor clear delays, the asynchronous reset pulse might successfully clear Flip-Flop 1 while failing to clear Flip-Flop 3! The counter ends up trapped in an illegal hybrid state ($1000_2$).

To build reliable digital counters that truncate sequences at arbitrary limits ($N \neq 2^K$), digital engineering eliminates asynchronous clear shortcuts. Instead, we use **Synchronous Clear Logic**, detecting terminal state $N-1$ to force a clean, clock-synchronized reset to zero on the very next active clock edge.

---

## The 12-Hour Wall Clock: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of synchronous truncation before examining gate schematics, let us examine a familiar mechanical object: an analog 12-hour wall clock.

Imagine an analog wall clock hanging in a school classroom. The clock face has numbers from 1 to 12. The hour hand steps forward by one tick every hour ($CLK$).

```text
THE 12-HOUR WALL CLOCK TRUNCATION MODEL

 Current Hour Hand Position: [ 11 ] ──► [ 12 ] ──► [ 1 ] ──► [ 2 ] ...
                                           ▲
                                           │ (Resets smoothly back to 1!)
```

How does the clock handle the transition after 12 o'clock?
Does the hour hand advance to **13 o'clock**, sit there for a microsecond while a mechanical hammer slaps the hand back to 1?

Of course not! If the clock advanced to 13 before resetting, anyone looking at the clock at that exact microsecond would see an invalid "13 o'clock" reading.

Instead, the clock uses an internal **predictive cam gear**:
* When the hour hand arrives at **12 o'clock** (Terminal State $N-1$), an internal mechanical lever is armed.
* The clock stays at 12 o'clock for the entire hour.
* When the next hourly gear tick arrives ($CLK$), the armed lever smoothly guides the hour hand directly to **1 o'clock**!

```text
PREDICTIVE SYNCHRONOUS ROLLOVER

 Hour Hand at 12 ──► Lever ARMED (Terminal State Detected!)
                     Next Gear Tick Arrives (Clock Edge)
                     Hand Moves Smoothly 12 -> 1! (NO 13 EVER SHOWN!)
```

Notice what happened on this wall clock:
1. **Zero Invalid Numbers**: The clock face NEVER displayed 13. The transition went cleanly from 12 directly to 1.
2. **Clock-Synchronized Movement**: The reset to 1 occurred on the exact same regular hourly gear tick as every other number transition.

This mechanical clock mechanism is the exact physical analogue of **Synchronous Clear Logic**:
* The numbers 1 through 12 are the **Modulo-$N$ Counter States ($0 \dots N-1$)**.
* The number 12 is the **Terminal State ($N-1$)**.
* The predictive lever arming is the **Synchronous Clear Signal ($\text{SCLR}$)**.
* The next hourly gear tick is the **Active Clock Edge ($CLK$)**.

---

## Mechanics of Modulo-N Counter Synthesis

To master arbitrary sequence counter design, we must dissect the formal mechanics of its two core primitives:
1. **The Modulo-$N$ Counter**: A sequential state machine engineered to cycle through exactly $N$ distinct states ($0, 1, \dots, N-1$) and reset back to $0$ on the $N$-th clock pulse.
2. **Synchronous Clear Logic ($\text{SCLR}$)**: The clock-synchronized control logic that detects terminal state $N-1$ and forces all state flip-flops to load zero on the next active clock edge without generating asynchronous reset glitches.

---

### Primitive 1: The Modulo-N Counter Architecture

The **Modulus ($N$)** of a counter is defined as the total number of unique state representations in its repeating cycle.

* A standard 4-bit binary counter has a natural modulus of $N = 2^4 = 16$ (states $0$ to $15$).
* A BCD decade counter has a modulus of $N = 10$ (states $0$ to $9$).
* A digital clock seconds counter has a modulus of $N = 60$ (states $0$ to $59$).

To build a Modulo-$N$ counter, we first determine the minimum number of flip-flops $K$ required to hold $N$ states:

$$
K = \lceil \log_2 N \rceil
$$

Where:
* $K$ is the number of flip-flops in the counter register.
* $N$ is the desired counting modulus.
* $\lceil \dots \rceil$ represents the ceiling function.

```text
COUNTER MODULUS FLIP-FLOP SELECTION

 Desired Modulus (N) │ Required Flip-Flops (K) │ Natural Un-Truncated Capacity (2^K)
─────────────────────┼─────────────────────────┼─────────────────────────────────────
    N = 6 (Modulo-6) │  K = Ceil(log2 6) = 3   │              2^3 = 8
   N = 10 (Modulo-10)│  K = Ceil(log2 10) = 4  │              2^4 = 16
   N = 12 (Modulo-12)│  K = Ceil(log2 12) = 4  │              2^4 = 16
   N = 60 (Modulo-60)│  K = Ceil(log2 60) = 6  │              2^6 = 64
```

Notice that when $N$ is not an exact power of two, $2^K > N$. 

This means there are **$2^K - N$ unused states** that must be bypassed by our truncation logic!

---

### Primitive 2: Synchronous Clear Logic Mechanics

To truncate a counter's sequence cleanly at count $N-1$ without generating asynchronous glitches, we use **Synchronous Clear Logic ($\text{SCLR}$)**.

Instead of detecting state $N$ to fire an asynchronous reset, **we detect state $N-1$ (the Terminal State) while the counter is still sitting safely in state $N-1$**.

```text
SYNCHRONOUS CLEAR VS ASYNCHRONOUS RESET COMPARISON

 Asynchronous Reset (HAZARDOUS!):
   Detects State N ──► Slaps Asynchronous Clear Pin ──► Glitch Spike & Race Condition!

 Synchronous Clear (GLITCH-FREE!):
   Detects State N-1 ──► Arms Synchronous Clear (SCLR=1) ──► Resets on NEXT Clock Edge!
```

#### The Golden Rule of Synchronous Truncation:
> To build a Modulo-$N$ counter that counts from $0$ to $N-1$, construct a combinational decoder that detects **Terminal State $Q = N-1$**. The output of this decoder drives the **Synchronous Clear ($\text{SCLR}$)** control line. On the next rising clock edge, the counter resets to $000\dots0_2$ cleanly and synchronously.

```text
SYNCHRONOUS CLEAR CONTROL EQUATION

 SCLR = Decoder_Output(Q == N - 1) * Count_Enable
```

---

## Detailed Case Study 1: The BCD Decade Counter (Modulo-10)

A **Binary-Coded Decimal (BCD) Decade Counter** is a Modulo-10 counter that cycles through ten states ($0000_2$ to $1001_2$, or decimal $0$ to $9$).

* Desired Modulus: $N = 10$.
* Required Flip-Flops: $K = \lceil \log_2 10 \rceil = 4$ flip-flops ($Q_3, Q_2, Q_1, Q_0$).
* Terminal State ($N - 1$): Decimal $9 = 1001_2$ ($Q_3=1, Q_2=0, Q_1=0, Q_0=1$).

```text
BCD DECADE COUNTER (MODULO-10) STATE TRANSITION SEQUENCE

 Count 0 (0000_2) ──► Count 1 (0001_2) ──► ... ──► Count 9 (1001_2 - TERMINAL STATE!)
         ▲                                                       │
         └────────────── Next Clock Edge (SCLR = 1) ─────────────┘
```

### Deriving the Synchronous Clear Decoder for Modulo-10

We need to detect when the counter reaches Terminal State $9_{10}$ ($Q_3 Q_2 Q_1 Q_0 = 1001_2$).

Since $Q_3 = 1$ and $Q_0 = 1$ in state $9_{10}$ (and $Q_3=1$ never occurs for any lower state between 0 and 8), we can decode state $9$ using a simple 2-input AND gate:

$$
\text{SCLR} = Q_3 \cdot Q_0 \cdot \text{CE}
$$

Where:
* $\text{SCLR}$ is the synchronous clear signal fed into the counter's control input.
* $Q_3$ is the MSB flip-flop output bit (weight 8).
* $Q_0$ is the LSB flip-flop output bit (weight 1).
* $\text{CE}$ is the master count enable control line.

```text
MODULO-10 BCD DECOUPLING DECODER SCHEMATIC

 Output Q3 (MSB = 1) ──┐
 Output Q0 (LSB = 1) ──┼──► [ AND Gate ] ──► Synchronous Clear SCLR
 Count Enable CE    ───┘                     (Arms SCLR = 1 when Count = 9!)
```

### Tracing the Modulo-10 Rollover Clock Edge ($9 \to 0$)

Let us trace the nanosecond chronology of the Modulo-10 counter as it reaches count 9:

1. **Count = 8 ($1000_2$)**:
   $Q_3 = 1, Q_0 = 0 \implies \text{SCLR} = 1 \cdot 0 = 0$. The counter increments normally.
2. **Count = 9 ($1001_2$) — Terminal State Reached!**:
   * Output vector becomes $1001_2$.
   * The AND gate evaluates $\text{SCLR} = Q_3 \cdot Q_0 = 1 \cdot 1 = 1$.
   * **Synchronous Clear is ARMED!** $\text{SCLR} = 1$ sits waiting at the flip-flop clear inputs during the entire duration of count 9.
3. **Next Clock Edge ($CLK = 0 \to 1$)**:
   * The rising clock edge arrives at all four flip-flops simultaneously.
   * Because $\text{SCLR} = 1$, all four flip-flops clear their stored bits to **$0000_2$ (Decimal 0)** in a single, perfectly synchronized step!
   * $\text{SCLR}$ automatically drops back to $0$ because $Q_3$ and $Q_0$ are now $0$.

```text
TIMING WAVEFORMS FOR MODULO-10 SYNCHRONOUS ROLLOVER

 Count Q[3:0] :  0111(7) ──► 1000(8) ──► 1001(9) ─────────► 0000(0) ──► 0001(1)
                                            │                 ▲
 SCLR Signal  :  000000000000000000000000111111111111110000000000000000000000
                                         ◄────────────►
                                          SCLR Armed during Count 9!
                                          NO GLITCHES! Clean 9 -> 0 transition!
```

---

## Detailed Case Study 2: The Modulo-6 Tens Counter ($0 \to 5$)

In a digital clock, the "seconds" display requires two cascaded counters:
1. A **Units Counter**: Counts $0$ to $9$ (Modulo-10 BCD counter).
2. A **Tens Counter**: Counts $0$ to $5$ (**Modulo-6 Counter**).

When the units counter reaches $9$ and rolls over to $0$, it triggers the tens counter to increment. When the tens counter reaches $5$ and rolls over to $0$, the total seconds display transitions from $59 \to 00$!

Let us synthesize the **Modulo-6 Tens Counter**:

* Desired Modulus: $N = 6$.
* Required Flip-Flops: $K = \lceil \log_2 6 \rceil = 3$ flip-flops ($Q_2, Q_1, Q_0$).
* Natural Capacity: $2^3 = 8$ states ($000_2$ to $111_2$).
* Terminal State ($N - 1$): Decimal $5 = 101_2$ ($Q_2=1, Q_1=0, Q_0=1$).

```text
MODULO-6 STATE TRANSITION TABLE (0 TO 5)

 Decimal Count │ Binary State Q2 Q1 Q0 │ Terminal State Check │ Synchronous Clear (SCLR)
───────────────┼───────────────────────┼──────────────────────┼───────────────────────────
       0       │          000          │     Normal Count     │          SCLR = 0
       1       │          001          │     Normal Count     │          SCLR = 0
       2       │          010          │     Normal Count     │          SCLR = 0
       3       │          011          │     Normal Count     │          SCLR = 0
       4       │          100          │     Normal Count     │          SCLR = 0
       5       │          101          │   TERMINAL STATE!    │          SCLR = 1 (Armed!)
   6 (Unused)  │          110          │     Unused State     │             X
   7 (Unused)  │          111          │     Unused State     │             X
```

### Deriving the Synchronous Clear Decoder for Modulo-6

We need to detect Terminal State $5_{10}$ ($Q_2 Q_1 Q_0 = 101_2$).

Since $Q_2 = 1$ and $Q_0 = 1$ in state $5_{10}$ (and $Q_2=1$ never occurs for any lower state between 0 and 4), we decode state $5$ using a 2-input AND gate:

$$
\text{SCLR}_{\text{mod6}} = Q_2 \cdot Q_0 \cdot \text{CE}
$$

Where:
* $\text{SCLR}_{\text{mod6}}$ is the synchronous clear signal for the Modulo-6 counter.
* $Q_2$ is the MSB flip-flop output bit (weight 4).
* $Q_0$ is the LSB flip-flop output bit (weight 1).
* $\text{CE}$ is the enable signal (driven by the $TC$ flag of the Modulo-10 units counter!).

```text
MODULO-6 SYNCHRONOUS CLEAR DECODER SCHEMATIC

 Output Q2 (MSB = 1) ──┐
 Output Q0 (LSB = 1) ──┼──► [ AND Gate ] ──► Synchronous Clear SCLR_mod6
 Enable CE (from TC0) ─┘                     (Arms SCLR = 1 when Count = 5!)
```

---

## Cascading Modulo-N Counters: Building a 00-to-59 Digital Clock Seconds Stage

Now let us combine our **Modulo-10 Units Counter** ($\text{CNT}_{10}$) and our **Modulo-6 Tens Counter** ($\text{CNT}_6$) into a complete, glitch-free 00-to-59 Digital Clock Seconds Stage!

### Architectural Interconnect Protocol:
1. **Clock Tree**: Both counters share the **exact same global $1\text{ Hz}$ clock line ($CLK_{1\text{Hz}}$)**.
2. **Units Counter ($\text{CNT}_{10}$)**:
   * Counts $0 \to 9$.
   * Generates Terminal Count Flag $TC_{10} = Q_3 \cdot Q_0 \cdot \text{CE}$.
3. **Tens Counter ($\text{CNT}_6$)**:
   * Its Count Enable input ($\text{CE}_6$) is driven directly by $TC_{10}$!
   * It increments **only on the exact clock cycle when the units counter is sitting at 9**!

```text
00-TO-59 DIGITAL CLOCK SECONDS STAGE SCHEMATIC

 Global 1Hz Clock CLK ──┬───────────────────────────────┐
                        │                               │
 Master Enable CE ─────►│ Modulo-10 Units Counter       │ Modulo-6 Tens Counter
                        │ (Counts 0..9)                 │ (Counts 0..5)
                        │                               │
                        │ Outputs Q[3:0]  TC10 Flag ───►│ Count Enable (CE6) Outputs Q[2:0]
                        └───────────────────────────────┴───────────────────────────────────┘
```

### Trace of the 59 -> 00 Rollover Transition

Let us trace the exact state of both counters as time ticks from 58 to 59 to 00 seconds:

```text
00-TO-59 CASCADED CLOCK ROLLOVER TIMING TRACE

 Time (Sec) │ Tens Q[2:0] │ Units Q[3:0] │ TC10 Flag │ SCLR_mod6 │ Action on NEXT Clock Edge
────────────┼─────────────┼──────────────┼───────────┼───────────┼───────────────────────────────────
     58     │   101 (5)   │   1000 (8)   │     0     │     0     │ Units increments 8 -> 9. Tens holds.
     59     │   101 (5)   │   1001 (9)   │     1     │     1     │ BOTH CLEAR TO 00! (59 -> 00)
     00     │   000 (0)   │   0000 (0)   │     0     │     0     │ Units increments 0 -> 1. Tens holds.
```

Look at Second 59:
* Units Counter holds $9$ ($1001_2$) $\implies TC_{10} = 1$.
* Tens Counter holds $5$ ($101_2$) AND sees $CE_6 = TC_{10} = 1 \implies \text{SCLR}_{\text{mod6}} = 1$!
* On the very next clock edge, **BOTH counters clear to zero simultaneously ($59 \to 00$)!**

Zero glitches! Zero intermediate false numbers! The clock transitions from 59 to 00 with 100% mathematical precision.

---

## Non-Zero Bound Counters: Modulo-N Counters with Offset Ranges

In many digital engineering applications, a Modulo-$N$ counter does not start at $0$. It must cycle through $N$ states between an arbitrary lower bound $L$ and upper bound $H$.

* A 12-hour wall clock counter cycles from **$1$ to $12$** (Modulo-12 with Offset 1).
* A calendar month counter cycles from **$1$ to $12$** (Modulo-12 with Offset 1).
* A programmable frequency synthesizer cycles from **$4$ to $11$** (Modulo-8 with Offset 4).

```text
OFFSET COUNTER RANGE COMPARISON

 Standard Modulo-12 Counter  :  0 ──► 1 ──► 2 ──► ... ──► 11 ──► 0
 12-Hour Offset Clock Counter:  1 ──► 2 ──► 3 ──► ... ──► 12 ──► 1  (Offset = +1)
```

### Synthesizing an Offset Modulo-N Counter ($L \to H$)

To build a counter that cycles from lower bound $L$ to upper bound $H$:

1. **Calculate Modulus ($N$)**:
   $$N = H - L + 1$$
2. **Detect Upper Bound ($H$)**:
   Build a combinational decoder that detects Terminal State $Q = H$. The output of this decoder drives the **Parallel Load Enable Line ($\text{LOAD}$)**.
3. **Preset Lower Bound ($L$)**:
   Connect the hardwired binary code for lower bound $L$ to the counter's **Parallel Data Inputs ($P_{K-1} \dots P_0$)**.
4. **Execution**:
   When the counter reaches $H$, the decoder asserts $\text{LOAD} = 1$. On the next clock edge, instead of resetting to $0$, the counter **loads the parallel value $L$**, continuing the cycle $L \to H \to L$ seamlessly!

```text
OFFSET COUNTER PRESET LOAD ARCHITECTURE

 Parallel Inputs P[3:0] = Binary Code for Lower Bound L (e.g. 0001 for 1)
        │
        ▼
 ┌──────────────┐
 │ Counter Block│ ──► Current State Q[3:0] ──► [ Decoder: Detect State H ]
 │ (LOAD Pin)   │◄───────────────────────────── (Arms LOAD = 1 at Count H!)
 └──────────────┘
```

---

## Engineering Reality: Timing Closure and Glitch-Free Decoding

When designing Modulo-$N$ counters for high-speed systems, engineers must evaluate two physical timing constraints:

### 1. Synchronous Clear Setup Time Constraint
The Terminal State decoder ($\text{SCLR} = m_{N-1}(Q) \cdot \text{CE}$) is a combinational logic block.

When the counter enters Terminal State $N-1$, the decoder needs time $t_{\text{dec}}$ to evaluate the state bits and drive the $\text{SCLR}$ line High.

The $\text{SCLR}$ signal must arrive at the flip-flop clear inputs at least $t_{\text{su}}$ **BEFORE** the next clock edge arrives!

$$
T_{\text{clk,min}} \ge t_{\text{C2Q}} + t_{\text{dec}} + t_{\text{su}}
$$

Where:
* $T_{\text{clk,min}}$ is the minimum safe clock period.
* $t_{\text{C2Q}}$ is the flip-flop Clock-to-Q delay.
* $t_{\text{dec}}$ is the propagation delay through the terminal state decoder AND gate.
* $t_{\text{su}}$ is the setup time of the flip-flop synchronous clear input.

### 2. Comparison: Asynchronous vs. Synchronous Truncation

```text
TRUNCATION ARCHITECTURE PERFORMANCE MATRIX

 Feature                    │ Asynchronous Reset Truncation │ Synchronous Clear Truncation
────────────────────────────┼───────────────────────────────┼───────────────────────────────
 Glitch-Free Outputs        │ FAILS! (Spurious 1-ns spikes) │ 100% GLITCH-FREE!
 Terminal State Decoded     │ State N (Transient state)     │ State N-1 (Stable state)
 Clock Tree Alignment       │ Asynchronous / Unaligned      │ Fully Synchronous with Clock
 Partial Reset Risk         │ High (Transistor race risk)   │ ZERO Risk
 Maximum Clock Frequency    │ Low (Limited by reset pulse)  │ High (Limited by t_dec + t_su)
 Recommended Use Case       │ NEVER in digital systems!     │ Industry Standard Gold Method
```

---

## Solved Industrial Engineering Exercise: 24-Hour Digital Clock Hours Stage

To consolidate your complete mastery of Modulo-$N$ counters, synchronous clear logic, offset ranges, and multi-stage counter cascading, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics instrumentation firm is designing the 24-hour timekeeping module ($00:00:00$ to $23:59:59$) for a commercial airliner's flight deck clock.

The **Hours Stage** receives a 1-bit **Minute Rollover Pulse ($CE_{\text{hr}}$)** from the minutes counter once every 3,600 seconds.

```text
24-HOUR DIGITAL CLOCK HOURS STAGE

 Minute Rollover Pulse (CE_hr) ──► [ 24-Hour BCD Hours Stage ] ──► Tens Digit H_tens[1:0]
 Master Clock 1 Hz ────────────► [ (Counts 00 to 23)        ] ──► Units Digit H_units[3:0]
```

The Hours Stage consists of two BCD counters:
1. **Hours Units Counter ($\text{HR}_{\text{units}}$)**: A 4-bit counter ($U_3, U_2, U_1, U_0$) displaying hours $0$ to $9$.
2. **Hours Tens Counter ($\text{HR}_{\text{tens}}$)**: A 2-bit counter ($T_1, T_0$) displaying tens of hours $0$ to $2$.

#### System Operating Requirements

1. **Standard Rollover ($09 \to 10$ and $19 \to 20$)**:
   * The Units counter counts $0 \to 9$ and rolls over to $0$, triggering the Tens counter to increment.
2. **24-Hour Rollover ($23 \to 00$)**:
   * When the total display reaches **23 hours** ($\text{HR}_{\text{tens}} = 2$, $\text{HR}_{\text{units}} = 3$) AND $CE_{\text{hr}} = 1$, **BOTH counters must clear to $00$ simultaneously** on the next clock edge!
3. The system must be 100% synchronous, glitch-free, and use synchronous clear logic throughout.

#### Your Objective

1. Calculate the modulus $N$ for the complete hours stage.
2. Derive the Boolean equation for the standard Units terminal count flag $TC_{\text{u9}}$ (detecting unit count 9).
3. Derive the Boolean equation for the 24-hour master reset signal $\text{SCLR}_{23}$ (detecting count 23).
4. Construct the complete state transition table for the $23 \to 00$ rollover logic.
5. Draw the complete gate-level interconnect schematic for the 24-hour hours stage.
6. Simulate the hours stage across the transition sequence $22 \to 23 \to 00$.

---

### Step-by-Step Derivation

#### Step 1: Calculate System Modulus and State Spaces

* Total hours in a full day cycle: 24 hours ($00, 01, 02, \dots, 23$).
* System Modulus: $N = 24$.
* Terminal State ($N - 1$): Decimal $23$ ($\text{Tens} = 2_{10} = 10_2$, $\text{Units} = 3_{10} = 0011_2$).

---

#### Step 2: Derive Standard Units Terminal Count Flag ($TC_{\text{u9}}$)

The Units counter ($\text{HR}_{\text{units}}$) must trigger a tens increment when it reaches $9_{10}$ ($U_3 U_2 U_1 U_0 = 1001_2$):

$$
TC_{\text{u9}} = U_3 \cdot U_0 \cdot CE_{\text{hr}}
$$

Where:
* $TC_{\text{u9}}$ is the terminal count flag for units digit 9.
* $U_3, U_0$ are the MSB and LSB of the Units counter.
* $CE_{\text{hr}}$ is the minute rollover enable pulse.

---

#### Step 3: Derive 24-Hour Master Reset Signal ($\text{SCLR}_{23}$)

The 24-hour master reset must fire when the combined display holds $23$ ($\text{Tens} = 2$, $\text{Units} = 3$) AND the minute rollover pulse $CE_{\text{hr}} = 1$:

* $\text{Tens} = 2_{10} = 10_2 \implies T_1 = 1, T_0 = 0$.
* $\text{Units} = 3_{10} = 0011_2 \implies U_1 = 1, U_0 = 1$.

Writing the master 24-hour terminal state detection equation:

$$
\text{SCLR}_{23} = T_1 \cdot U_1 \cdot U_0 \cdot CE_{\text{hr}}
$$

Where:
* $\text{SCLR}_{23}$ is the master 24-hour synchronous clear signal.
* $T_1$ is Bit 1 of the Tens counter ($T_1=1$ for tens digit 2).
* $U_1, U_0$ are Bits 1 and 0 of the Units counter ($U_1=1, U_0=1$ for units digit 3).
* $CE_{\text{hr}}$ is the minute rollover pulse.

```text
24-HOUR TERMINAL STATE DECODER SCHEMATIC

 Tens Bit T1 (1) ──┐
 Units Bit U1 (1) ─┼──► [ 4-Input AND Gate ] ──► Master Clear SCLR23
 Units Bit U0 (1) ─┤                             (Arms SCLR23 = 1 at Count 23!)
 Minute Pulse CE ──┘
```

---

#### Step 4: Derive Combined Clear Equations for Units and Tens Counters

Both counters must clear under two distinct conditions:

##### 1. Units Counter Synchronous Clear ($\text{SCLR}_{\text{units}}$):
The Units counter must clear to $0$ if it reaches 9 ($TC_{\text{u9}} = 1$) OR if the 24-hour master reset fires ($\text{SCLR}_{23} = 1$):

$$
\text{SCLR}_{\text{units}} = TC_{\text{u9}} + \text{SCLR}_{23} = (U_3 \cdot U_0 \cdot CE_{\text{hr}}) + (T_1 \cdot U_1 \cdot U_0 \cdot CE_{\text{hr}})
$$

##### 2. Tens Counter Synchronous Clear ($\text{SCLR}_{\text{tens}}$):
The Tens counter must clear to $0$ when the 24-hour master reset fires ($\text{SCLR}_{23} = 1$):

$$
\text{SCLR}_{\text{tens}} = \text{SCLR}_{23} = T_1 \cdot U_1 \cdot U_0 \cdot CE_{\text{hr}}
$$

##### 3. Tens Counter Count Enable ($\text{CE}_{\text{tens}}$):
The Tens counter increments whenever the Units counter reaches 9 ($TC_{\text{u9}} = 1$):

$$
\text{CE}_{\text{tens}} = TC_{\text{u9}} = U_3 \cdot U_0 \cdot CE_{\text{hr}}
$$

---

#### Step 5: Draw Complete Gate-Level Interconnect Schematic

```text
24-HOUR DIGITAL CLOCK HOURS STAGE SCHEMATIC

 Minute Pulse CE_hr ───┬──────────────────────────────────┐
                       │                                  │
                       ▼                                  ▼
 ┌───────────────────────────┐  TC_u9 Flag  ┌───────────────────────────┐
 │ Units Counter HR_units    ├─────────────►│ Tens Counter HR_tens      │
 │ (Counts 0..9)             │              │ (Counts 0..2)             │
 └─────────────┬─────────────┘              └─────────────┬─────────────┘
               │                                          │
               │ Units Bits U1, U0                        │ Tens Bit T1
               └───────────────┬──────────────────────────┘
                               │
                               ▼
                   ┌──────────────────────┐
                   │ 24-Hour Decoder      ├─► SCLR23 ──► Clear Both Counters!
                   │ (T1 * U1 * U0 * CE)  │              (Triggers 23 -> 00!)
                   └──────────────────────┘
```

---

### Step-by-Step Simulation and Verification

Let us trace the hours stage across the transition sequence $22 \to 23 \to 00$:

```text
24-HOUR CLOCK ROLLOVER TIMING TRACE

 Time / Event │ Tens T[1:0] │ Units U[3:0] │ Display │ TC_u9 │ SCLR23 │ Next State on Clock Edge
──────────────┼─────────────┼──────────────┼─────────┼───────┼────────┼───────────────────────────
 Hour 22      │   10 (2)    │   0010 (2)   │   22    │   0   │   0    │ Units -> 3, Tens -> 2 (23)
 Hour 23      │   10 (2)    │   0011 (3)   │   23    │   0   │   1    │ BOTH CLEAR TO 00! (23->00)
 Hour 00      │   00 (0)    │   0000 (0)   │   00    │   0   │   0    │ Units -> 1, Tens -> 0 (01)
```

##### Detailed Chronology Evaluation:

1. **At Hour 22 ($\text{Tens} = 10_2$, $\text{Units} = 0010_2$, $CE_{\text{hr}} = 1$)**:
   * $\text{SCLR}_{23} = T_1 \cdot U_1 \cdot U_0 \cdot CE_{\text{hr}} = 1 \cdot 1 \cdot 0 \cdot 1 = 0$.
   * $TC_{\text{u9}} = U_3 \cdot U_0 \cdot CE_{\text{hr}} = 0 \cdot 0 \cdot 1 = 0$.
   * On the next clock edge, Units counter increments $2 \to 3$. Tens counter holds $2$.
   * Display becomes **23**. Correct!

2. **At Hour 23 ($\text{Tens} = 10_2$, $\text{Units} = 0011_2$, $CE_{\text{hr}} = 1$) — Terminal State 23!**:
   * $\text{SCLR}_{23} = T_1 \cdot U_1 \cdot U_0 \cdot CE_{\text{hr}} = 1 \cdot 1 \cdot 1 \cdot 1 = \mathbf{1}$!
   * **Master 24-Hour Clear is ARMED!** Both $\text{SCLR}_{\text{units}}$ and $\text{SCLR}_{\text{tens}}$ receive $1$.
   * On the next clock edge, **BOTH counters clear to 0 simultaneously ($23 \to 00$)!**
   * Display becomes **00**. Correct!

3. **At Hour 00 ($\text{Tens} = 00_2$, $\text{Units} = 0000_2$)**:
   * $\text{SCLR}_{23} = 0 \cdot 0 \cdot 0 \cdot 1 = 0$. Clear disarms automatically.
   * Display progresses normally $00 \to 01 \to 02 \dots$

##### Verification Results:
* Did the display ever flash an invalid "24" reading? **NO!** The transition went cleanly from 23 to 00.
* Was the rollover 100% clock-synchronized? **YES!** Both counters cleared together on the exact same clock pulse.

All simulation steps, gate equations, and timing windows evaluate with 100% mathematical and physical precision. The 24-hour avionics clock stage is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Modulo-N Counter**: A sequential binary counting module engineered to cycle through exactly $N$ distinct states ($0, 1, \dots, N-1$) before automatically resetting to $0$, bridging the gap between natural power-of-two binary counting capacity ($2^K$) and real-world non-power-of-two system intervals.
* **Synchronous Clear Logic**: The clock-synchronized truncation mechanism ($\text{SCLR} = m_{N-1}(Q) \cdot \text{CE}$) that detects terminal state $N-1$ and forces all state flip-flops to load zero on the next active clock edge, eliminating the transient voltage glitches, race conditions, and output corruptions caused by asynchronous clear reset shortcuts.
