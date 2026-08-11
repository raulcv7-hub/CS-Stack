---
title: "Asynchronous Ripple Counter Synthesis and Clock Ripple Delay Analysis"
---

# Asynchronous Ripple Counter Synthesis and Clock Ripple Delay Analysis

## The Cumulative Delay Penalty of Cascaded Asynchronous Clocks

In digital systems engineering, one of the most fundamental tasks required of sequential logic is event counting. A system needs to count clock pulses to measure elapsed time, track incoming data packets on a network bus, sequence multi-step operations, or divide a high-speed master clock down to lower operating frequencies.

When an engineer needs to build an $N$-bit binary counter—a circuit that steps through binary numbers from $000\dots0_2$ up to $111\dots1_2$—the simplest, most intuitive hardware approach is to chain several Toggle (T) flip-flops or JK flip-flops in series. 

In this cascaded structure, known as an **Asynchronous Ripple Counter**, the external input clock ($CLK$) is connected *only* to the first flip-flop (Bit 0, the least significant bit). Each subsequent flip-flop receives its clock trigger not from the global system clock, but directly from the output $Q$ (or $\overline{Q}$) of the flip-flop immediately preceding it.

```text
ASYNCHRONOUS RIPPLE COUNTER CASCADE STRUCTURE

 External Clock CLK ──►[ T-FF 0 ] ──► Q0 ──►[ T-FF 1 ] ──► Q1 ──►[ T-FF 2 ] ──► Q2
                       (Bit 0 LSB)          (Bit 1)              (Bit 2 MSB)
```

At first glance, this asynchronous design appears to be an ideal hardware solution. It requires no complex external combinational logic gates between stages, uses minimal silicon area, and is exceptionally easy to wire.

However, the moment this circuit is fabricated in physical silicon and operated at high clock frequencies, it encounters a severe physical limit: **Clock Ripple Delay**.

Because each flip-flop requires a finite time—its **Clock-to-Q Propagation Delay ($t_{\text{C2Q}}$)**—to update its output pin after receiving a clock edge, the state transition does not happen simultaneously across all bits. Instead, the clock signal must "ripple" sequentially through the flip-flop chain like a wave.

During a multi-bit transition (such as rolling over from binary $0111_2$ to $1000_2$), the counter bits do not flip all at once. For several nanoseconds while the carry wave propagates down the chain, the counter outputs briefly display false, intermediate **transient glitch states** ($0110_2, 0100_2, 0000_2$).

```text
TRANSIENT GLITCH STATES DURING A 4-BIT ROLLOVER (0111 -> 1000)

 Target State Transition :  0 1 1 1  ──────────────────────────►  1 0 0 0
                                 
 Actual Transient Path   :  0 1 1 1  ──(t_C2Q)──► 0 1 1 0  ──(2*t_C2Q)──► 0 1 0 0
                                                       │
                            1 0 0 0  ◄──(4*t_C2Q)───── 0 0 0 0 ◄──(3*t_C2Q)──┘
                            (Settled!)            (GLITCH STATES!)
```

If a downstream address decoder, a memory write controller, or a digital-to-analog converter reads the counter while this ripple wave is in motion, it will read these corrupted transient values and trigger catastrophic hardware errors.

Furthermore, as the counter width $N$ grows to 8, 16, or 32 bits, the cumulative ripple delay $T_{\text{ripple}} = N \cdot t_{\text{C2Q}}$ grows linearly, imposing a strict upper speed limit on how fast the counter can operate.

Understanding how asynchronous ripple counters operate—and why their $O(N)$ cumulative delay causes decoding glitches—is essential for mastering sequential circuit design and recognizing when a system must upgrade to a fully synchronous counter architecture.

---

## The Mechanical Odometer Rollover: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of clock ripple delay and transient glitch states, let us picture a mechanical mileage counter (an odometer) on a vintage automobile dashboard.

Imagine a mechanical odometer with four numbered wheels sitting side-by-side ($W_3, W_2, W_1, W_0$), displaying numbers from $0000$ to $9999$.

```text
THE MECHANICAL ODOMETER ROLLOVER MODEL

  Wheel 3 (Thousands)   Wheel 2 (Hundreds)   Wheel 1 (Tens)     Wheel 0 (Units)
       ┌───┐                 ┌───┐               ┌───┐              ┌───┐
       │ 0 │                 │ 9 │               │ 9 │              │ 9 │
       └───┘                 └───┘               └───┘              └───┘
```

Each wheel is driven by a small mechanical tooth. Wheel 0 is connected directly to the car's drive shaft. Wheel 1 is NOT connected to the drive shaft; it turns ONLY when Wheel 0 completes a full revolution and its mechanical tooth physically pushes Wheel 1 forward by one notch.

Now, imagine the odometer currently displays **$0999$**, and the car drives one more tenth of a mile:

1. The drive shaft turns **Wheel 0** from $9$ to $0$.
2. As Wheel 0 passes $0$, its mechanical tooth strikes **Wheel 1**, causing Wheel 1 to turn from $9$ to $0$.
3. As Wheel 1 passes $0$, its tooth strikes **Wheel 2**, causing Wheel 2 to turn from $9$ to $0$.
4. As Wheel 2 passes $0$, its tooth strikes **Wheel 3**, causing Wheel 3 to turn from $0$ to $1$.

```text
MECHANICAL ODOMETER ROLLOVER SEQUENCE

 Initial State :  [ 0 ]  [ 9 ]  [ 9 ]  [ 9 ]
                   │      │      │      │
 Step 1        :  [ 0 ]  [ 9 ]  [ 9 ]  [ 0 ]  (Wheel 0 rolls over)
                   │      │      │
 Step 2        :  [ 0 ]  [ 9 ]  [ 0 ]  [ 0 ]  (Wheel 1 rolls over)
                   │      │
 Step 3        :  [ 0 ]  [ 0 ]  [ 0 ]  [ 0 ]  (Wheel 2 rolls over)
                   │
 Step 4        :  [ 1 ]  [ 0 ]  [ 0 ]  [ 0 ]  (Final Settled State: 1000!)
```

Now, imagine taking a high-speed photograph of the dashboard during those few milliseconds while the mechanical teeth are cascading:
* In the middle of the physical movement, you might photograph the wheels showing $0990$, $0900$, or $0000$!

If an automated traffic camera took a picture at the exact microsecond the gears were rippling, it would read the car's mileage as $0000$ instead of $1000$!

This mechanical gear cascade is the exact physical analogue of an **Asynchronous Ripple Counter**:
* The drive shaft turning Wheel 0 is the **External Input Clock ($CLK$)**.
* The mechanical tooth on each wheel is the **Flip-Flop Output ($Q_k$) acting as the clock for stage $k+1$**.
* The brief, blurry intermediate numbers ($0990, 0900, 0000$) are the **Transient Glitch States**.
* The time required for all four wheels to finish turning is the **Clock Ripple Delay**.

---

## Mechanics of Asynchronous Ripple Counter Synthesis

To master the physics of asynchronous sequential counting, we must dissect the formal mechanics of its two core primitives:
1. **The Asynchronous Ripple Counter**: How cascaded toggle flip-flops divide frequency and count binary states without a shared global clock.
2. **Clock Ripple Delay**: How individual gate delays accumulate linearly ($T_{\text{ripple}} = N \cdot t_{\text{C2Q}}$) across $N$ stages, creating transient output decoding hazards.

---

### Primitive 1: The Asynchronous Ripple Counter Architecture

An $N$-bit **Asynchronous Ripple Counter** consists of $N$ cascaded Toggle (T) or JK flip-flops ($\text{FF}_0, \text{FF}_1, \dots, \text{FF}_{N-1}$):
* Each flip-flop is configured in **Toggle Mode** ($T = 1$, or $J = 1, K = 1$).
* The external input clock ($CLK$) is connected **ONLY to the clock pin of $\text{FF}_0$** (Bit 0, the least significant bit).
* For all higher-order stages ($k \ge 1$), the clock input of $\text{FF}_k$ is driven directly by the output $Q_{k-1}$ (or complemented output $\overline{Q_{k-1}}$) of the preceding stage.

```text
4-BIT ASYNCHRONOUS RIPPLE UP-COUNTER SCHEMATIC

 Constant High (1) ───┬───────────┬───────────┬───────────┐
                      │           │           │           │
                      ▼           ▼           ▼           ▼
 Input CLK ──►[ > T  Q0 ]──►[ > T  Q1 ]──►[ > T  Q2 ]──►[ > T  Q3 ]
               │  FF 0  │   │  FF 1  │   │  FF 2  │   │  FF 3  │
               └───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
                   │            │            │            │
                   ▼            ▼            ▼            ▼
               Output Q0    Output Q1    Output Q2    Output Q3
               (Bit 0 LSB)  (Bit 1)      (Bit 2)      (Bit 3 MSB)
```

#### 1. How the Clock Triggering Direction Determines Up or Down Counting

Whether an asynchronous counter counts **UP** ($000_2 \to 001_2 \to 010_2 \dots$) or **DOWN** ($111_2 \to 110_2 \to 101_2 \dots$) depends on two physical design factors:
1. Which output pin of the preceding stage ($Q$ or $\overline{Q}$) drives the next clock input.
2. Whether the flip-flops trigger on the **Falling Edge ($1 \to 0$)** or **Rising Edge ($0 \to 1$)** of their clock inputs.

```text
RIPPLE COUNTER DIRECTION MATRIX

 Flip-Flop Clock Trigger Type │ Trigger Source Connected │ Counting Direction
──────────────────────────────┼──────────────────────────┼────────────────────
 Negative-Edge (Falling 1->0) │ Driven by Q Output       │ UP-Counter
 Negative-Edge (Falling 1->0) │ Driven by Q' Output      │ DOWN-Counter
 Positive-Edge (Rising 0->1)  │ Driven by Q' Output      │ UP-Counter
 Positive-Edge (Rising 0->1)  │ Driven by Q Output       │ DOWN-Counter
```

Let us prove why connecting output $Q_{k-1}$ to a **negative-edge-triggered ($1 \to 0$)** clock pin produces an **UP-counter**:

Consider the binary counting sequence for two bits ($Q_1 Q_0$):

$$00_2 \longrightarrow 01_2 \longrightarrow 10_2 \longrightarrow 11_2 \longrightarrow 00_2$$

Look at when Bit 1 ($Q_1$) needs to toggle:
* From $00_2$ to $01_2$: Bit 0 ($Q_0$) goes $0 \to 1$. Bit 1 ($Q_1$) stays $0$.
* From $01_2$ to $10_2$: Bit 0 ($Q_0$) goes $1 \to 0$ (Falling edge!). At this exact moment, $Q_1$ must toggle from $0 \to 1$!
* From $10_2$ to $11_2$: Bit 0 ($Q_0$) goes $0 \to 1$. Bit 1 ($Q_1$) stays $1$.
* From $11_2$ to $00_2$: Bit 0 ($Q_0$) goes $1 \to 0$ (Falling edge!). At this exact moment, $Q_1$ must toggle from $1 \to 0$!

Notice the mathematical pattern:
> Bit $k$ must toggle if and only if Bit $k-1$ transitions from **$1$ to $0$ (a falling edge)**!

Because a negative-edge-triggered flip-flop toggles its output precisely when its clock input experiences a $1 \to 0$ falling transition, connecting $Q_{k-1}$ directly to $CLK_k$ creates an **UP-Counter** with zero extra logic gates!

---

#### 2. The 4-Bit Binary State Sequence

A 4-bit Ripple Up-Counter ($Q_3 Q_2 Q_1 Q_0$) cycles through $2^4 = 16$ unique binary states, from $0000_2$ (decimal 0) to $1111_2$ (decimal 15), before rolling over back to $0000_2$:

```text
4-BIT RIPPLE UP-COUNTER STATE SEQUENCE

 Clock Event │ Output Q3 (MSB) │ Output Q2 │ Output Q1 │ Output Q0 (LSB) │ Decimal Equivalent
─────────────┼─────────────────┼───────────┼───────────┼─────────────────┼────────────────────
   Initial   │        0        │     0     │     0     │        0        │         0
   Pulse 1   │        0        │     0     │     0     │        1        │         1
   Pulse 2   │        0        │     0     │     1     │        0        │         2
   Pulse 3   │        0        │     0     │     1     │        1        │         3
   Pulse 4   │        0        │     1     │     0     │        0        │         4
   Pulse 5   │        0        │     1     │     0     │        1        │         5
   Pulse 6   │        0        │     1     │     1     │        0        │         6
   Pulse 7   │        0        │     1     │     1     │        1        │         7
   Pulse 8   │        1        │     0     │     0     │        0        │         8
   Pulse 9   │        1        │     0     │     0     │        1        │         9
   Pulse 10  │        1        │     0     │     1     │        0        │        10
   Pulse 11  │        1        │     0     │     1     │        1        │        11
   Pulse 12  │        1        │     1     │     0     │        0        │        12
   Pulse 13  │        1        │     1     │     0     │        1        │        13
   Pulse 14  │        1        │     1     │     1     │        0        │        14
   Pulse 15  │        1        │     1     │     1     │        1        │        15
   Pulse 16  │        0        │     0     │     0     │        0        │ 0 (ROLLOVER!)
```

---

### Primitive 2: Clock Ripple Delay and Accumulation Physics

Now we perform a deep physical dissection of **Clock Ripple Delay**.

When a clock edge arrives at $\text{FF}_0$, the output $Q_0$ does not change instantly. The internal master and slave latches of $\text{FF}_0$ require a physical time delay—the **Clock-to-Q Delay ($t_{\text{C2Q}}$)**—for transistors to charge output node capacitances.

Because $\text{FF}_1$ uses $Q_0$ as its clock signal, $\text{FF}_1$ receives its clock edge **$t_{\text{C2Q}}$ nanoseconds LATER** than $\text{FF}_0$!

Similarly, $\text{FF}_2$ receives its clock edge $t_{\text{C2Q}}$ nanoseconds later than $\text{FF}_1$, and $2 \cdot t_{\text{C2Q}}$ nanoseconds later than $\text{FF}_0$.

```text
CASCADED CLOCK-TO-Q PROPAGATION TIMING PATH

 External CLK Edge (t = 0.0 ns)
       │
       ▼
 [ FF 0 Toggles ] ──► Q0 Ready at t = 1 * t_C2Q
                         │
                         ▼ (Triggers FF 1 Clock Input)
                   [ FF 1 Toggles ] ──► Q1 Ready at t = 2 * t_C2Q
                                           │
                                           ▼ (Triggers FF 2 Clock Input)
                                     [ FF 2 Toggles ] ──► Q2 Ready at t = 3 * t_C2Q
```

#### Total Worst-Case Ripple Delay Formula

For an $N$-bit Asynchronous Ripple Counter, the worst-case propagation delay $T_{\text{ripple}}$ required for the entire counter to settle to a valid state occurs during a full $N$-bit rollover (such as $0111\dots1_2 \to 1000\dots0_2$ or $1111\dots1_2 \to 0000\dots0_2$).

During a full $N$-bit rollover, the carry wave must travel through **all $N$ flip-flops in series**:

$$
T_{\text{ripple}}(N) = N \cdot t_{\text{C2Q}}
$$

Where:
* $T_{\text{ripple}}(N)$ is the total worst-case propagation delay of an $N$-bit ripple counter.
* $N$ is the number of bits (flip-flop stages) in the counter.
* $t_{\text{C2Q}}$ is the individual Clock-to-Q propagation delay of a single flip-flop stage.

```text
TOTAL RIPPLE DELAY SCALING BY BIT WIDTH

 Counter Bit Width (N) │ Formula (N * t_C2Q) │ Total Ripple Delay (for t_C2Q = 1.5 ns)
───────────────────────┼─────────────────────┼─────────────────────────────────────────
     4-Bit Counter     │      4 * t_C2Q      │                6.0 ns
     8-Bit Counter     │      8 * t_C2Q      │               12.0 ns
    16-Bit Counter     │     16 * t_C2Q      │               24.0 ns
    32-Bit Counter     │     32 * t_C2Q      │               48.0 ns
```

Look at that 32-bit row:
To update a 32-bit counter, the output vector takes **$48.0\text{ nanoseconds}$** to settle!

---

### Nanosecond Dissection of a 4-Bit Rollover Glitch ($0111_2 \to 1000_2$)

To understand why ripple delay creates false intermediate states, let us trace a 4-bit ripple up-counter transitioning from $0111_2$ (decimal 7) to $1000_2$ (decimal 8).

Assume each flip-flop has a Clock-to-Q delay $t_{\text{C2Q}} = 1.5\text{ ns}$.

The initial state is $\mathbf{Q} = (Q_3, Q_2, Q_1, Q_0) = 0111_2$.

At time $t = 0.0\text{ ns}$, the 8th external input clock edge arrives at $\text{FF}_0$:

```text
NANOSECOND CHRONOLOGY OF THE 0111_2 -> 1000_2 ROLLOVER

 Time t = 0.0 ns : External CLK Edge Arrives at FF 0
   * Inputs: Q = (0, 1, 1, 1). Decimal 7.
   * FF 0 receives clock edge, begins toggling Q0 (1 -> 0).

 Time t = 1.5 ns : FF 0 Finish Toggling (Q0 becomes 0)
   * Output Vector Q becomes: (0, 1, 1, 0) = DECIMAL 6!  ◄── GLITCH STATE 1!
   * Q0 transitioned 1 -> 0 (Falling Edge!).
   * This falling edge triggers FF 1 clock input!
   * FF 1 begins toggling Q1 (1 -> 0).

 Time t = 3.0 ns : FF 1 Finish Toggling (Q1 becomes 0)
   * Output Vector Q becomes: (0, 1, 0, 0) = DECIMAL 4!  ◄── GLITCH STATE 2!
   * Q1 transitioned 1 -> 0 (Falling Edge!).
   * This falling edge triggers FF 2 clock input!
   * FF 2 begins toggling Q2 (1 -> 0).

 Time t = 4.5 ns : FF 2 Finish Toggling (Q2 becomes 0)
   * Output Vector Q becomes: (0, 0, 0, 0) = DECIMAL 0!  ◄── GLITCH STATE 3!
   * Q2 transitioned 1 -> 0 (Falling Edge!).
   * This falling edge triggers FF 3 clock input!
   * FF 3 begins toggling Q3 (0 -> 1).

 Time t = 6.0 ns : FF 3 Finish Toggling (Q3 becomes 1)
   * Output Vector Q becomes: (1, 0, 0, 0) = DECIMAL 8!  ◄── FINAL SETTLED STATE!
```

```text
TRANSIENT GLITCH WAVEFORM TIMING MAP

 Real Time (ns) │ Vector Q3 Q2 Q1 Q0 │ Decimal Output │ State Classification
────────────────┼────────────────────┼────────────────┼───────────────────────
   t = 0.0 ns   │        0111        │       7        │ Initial Valid State
   t = 1.5 ns   │        0110        │       6        │ TRANSIENT GLITCH 1!
   t = 3.0 ns   │        0100        │       4        │ TRANSIENT GLITCH 2!
   t = 4.5 ns   │        0000        │       0        │ TRANSIENT GLITCH 3!
   t = 6.0 ns   │        1000        │       8        │ Final Settled State
```

Study this timing chronology carefully!
During the transition from 7 to 8, the physical output pins of the counter briefly displayed **6, then 4, then 0, before finally reaching 8**!

For a duration of $4.5\text{ nanoseconds}$, the output vector displayed completely false arithmetic numbers!

```text
THE OUTPUT DECODER HAZARD

 Counter Outputs Q3..Q0 ──► [ Decoder: Detect State 4 ] ──► OUTPUT SPIKE (GLITCH)!
                             (Fires FALSELY during 0100_2!)
```

If a downstream address decoder is wired to detect "State 4" ($0100_2$), that decoder will emit a **false voltage spike** at $t = 3.0\text{ ns}$, triggering unwanted system actions even though the counter was simply trying to count from 7 to 8!

---

## Maximum Operating Frequency Limits of Ripple Counters

Because the output vector takes $T_{\text{ripple}} = N \cdot t_{\text{C2Q}}$ to settle to a valid state, the input clock period $T_{\text{clk}}$ MUST be set longer than the total ripple delay:

$$
T_{\text{clk}} > N \cdot t_{\text{C2Q}}
$$

Where:
* $T_{\text{clk}}$ is the minimum period of the input clock signal ($T_{\text{clk}} = \frac{1}{f_{\text{clk}}}$).
* $N$ is the number of bits in the counter.
* $t_{\text{C2Q}}$ is the single-stage Clock-to-Q flip-flop propagation delay.

Rearranging this inequality gives the **Maximum Operating Clock Frequency ($f_{\text{max}}$)** of an Asynchronous Ripple Counter:

$$
f_{\text{max}} = \frac{1}{N \cdot t_{\text{C2Q}}}
$$

Where:
* $f_{\text{max}}$ is the maximum frequency at which the ripple counter can be clocked reliably.

```text
MAXIMUM OPERATING FREQUENCY VS BIT WIDTH (for t_C2Q = 2.0 ns)

 Bit Width (N) │ Total Ripple Delay (N * 2.0 ns) │ Maximum Clock Frequency f_max
───────────────┼─────────────────────────────────┼───────────────────────────────
    2 Bits     │             4.0 ns              │          250.0 MHz
    4 Bits     │             8.0 ns              │          125.0 MHz
    8 Bits     │            16.0 ns              │           62.5 MHz
   16 Bits     │            32.0 ns              │           31.25 MHz
   32 Bits     │            64.0 ns              │           15.625 MHz!
```

Notice the severe speed limitation:
* A 2-bit ripple counter can run at $250\text{ MHz}$.
* A 32-bit ripple counter drops down to **$15.625\text{ MHz}$**!

If you attempt to clock a 32-bit ripple counter faster than $15.625\text{ MHz}$, new clock pulses will arrive at $FF_0$ before the previous carry wave has reached $FF_{31}$, causing the counter to lose track of time and emit completely chaotic binary numbers.

---

## Engineering Trade-Off Analysis: Asynchronous vs. Synchronous Design

Why do digital hardware engineers ever use Asynchronous Ripple Counters if they suffer from ripple delays, transient glitches, and low maximum clock frequencies?

Because ripple counters offer significant advantages in specific low-power, non-critical application domains.

```text
HARDWARE ARCHITECTURAL COMPARISON

 Feature                    │ Asynchronous Ripple Counter │ Synchronous Counter
────────────────────────────┼─────────────────────────────┼──────────────────────────────
 Inter-Stage Logic Gates    │ ZERO (No AND/OR gates!)     │ High (Requires Carry Trees)
 Silicon Die Area           │ MINIMAL (Lowest cost)       │ Larger (Extra logic gates)
 Power Dissipation          │ LOWEST (Clock toggles low)  │ Higher (All FFs clocked at once)
 High-Frequency Speed      │ POOR (Scales as O(N) delay) │ FASTEST (Scales as O(1) delay)
 Output Glitch Susceptibility│ HIGH (Transient glitching)  │ ZERO (All bits update together)
 Clock Tree Loading         │ Drives ONLY Bit 0 (Tiny)    │ Drives ALL N Bits (Heavy load)
```

### 1. When to Use Asynchronous Ripple Counters
* **Simple Frequency Dividers**: When you only need to divide a clock frequency by $2^N$ and do not care about output decoding glitches.
* **Ultra-Low-Power Battery Devices**: Because $CLK$ only drives flip-flop $FF_0$, and subsequent stages toggle at progressively halved frequencies ($\frac{f}{2}, \frac{f}{4}, \frac{f}{8}$), dynamic power consumption ($P = \alpha C V^2 f$) is dramatically lower than in a synchronous counter where all $N$ flip-flops switch simultaneously.
* **Low-Cost Event Counters**: Where counting speed is low (e.g., tallying objects on a slow conveyor belt).

### 2. When to Avoid Asynchronous Ripple Counters
* **High-Speed Microprocessor ALUs**: Where execution occurs at gigahertz frequencies.
* **Decoded State Controllers**: Where counter outputs drive combinational decoders, multiplexers, or memory address lines (where glitches cause catastrophic short circuits or data corruption).

---

## Solved Industrial Engineering Exercise: 4-Bit Asynchronous Telemetry Counter and Glitch Analysis

To consolidate your complete mastery of asynchronous ripple counter synthesis, clock ripple delay calculations, transient glitch state tracing, and maximum operating frequency limits, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics systems firm is designing a 4-bit event counter module for a satellite's particle detector payload.

The module receives a stream of digital pulses from a radiation sensor ($CLK_{\text{sensor}}$). A 4-bit Asynchronous Ripple Up-Counter ($\text{FF}_0, \text{FF}_1, \text{FF}_2, \text{FF}_3$) counts the total number of detected particle impacts.

```text
SATELLITE PARTICLE DETECTOR COUNTER MODULE

 Sensor Pulse CLK_sensor ──► [ 4-Bit Ripple Up-Counter ] ──► Count Bus Q[3:0]
                              (Negative-Edge T Flip-Flops)         │
                                                                   ▼
                                                       [ 2-to-4 Address Decoder ]
                                                       (Fires when Count = 4!)
```

An onboard telemetry status decoder monitors the counter outputs ($Q_3, Q_2, Q_1, Q_0$) and fires a **Packet Full Flag ($Y_{\text{full}}$)** whenever the count reaches decimal 4 ($0100_2$).

#### Physical CMOS Flip-Flop Specifications:
* Flip-Flop Clock-to-Q Propagation Delay: $t_{\text{C2Q}} = 2.0\text{ ns}$
* 2-to-4 Decoder Propagation Delay: $t_{\text{dec}} = 1.0\text{ ns}$

#### Your Objective

1. Draw the complete gate-level schematic for the 4-bit Asynchronous Ripple Up-Counter using negative-edge-triggered T flip-flops.
2. Calculate the total worst-case Clock Ripple Delay $T_{\text{ripple}}$ for the 4-bit counter.
3. Calculate the maximum safe operating sensor pulse frequency $f_{\text{max}}$.
4. Trace the nanosecond-by-nanosecond transition chronology when the counter rolls over from **decimal 3 ($0011_2$) to decimal 4 ($0100_2$)**.
5. Determine whether the Packet Full Decoder ($Y_{\text{full}}$, which triggers on $0100_2$) experiences a **transient false glitch** during the transition from **decimal 7 ($0111_2$) to decimal 8 ($1000_2$)**. Calculate the exact duration of the false glitch spike.

---

### Step-by-Step Derivation

#### Step 1: Draw the 4-Bit Asynchronous Ripple Up-Counter Schematic

To build an UP-counter using negative-edge-triggered flip-flops:
* We configure all four flip-flops in Toggle Mode ($T_0 = 1, T_1 = 1, T_2 = 1, T_3 = 1$).
* Sensor clock $CLK_{\text{sensor}}$ connects to $CLK_0$ of $\text{FF}_0$.
* Output $Q_0$ connects to $CLK_1$ of $\text{FF}_1$.
* Output $Q_1$ connects to $CLK_2$ of $\text{FF}_2$.
* Output $Q_2$ connects to $CLK_3$ of $\text{FF}_3$.

```text
4-BIT ASYNCHRONOUS RIPPLE UP-COUNTER SCHEMATIC

 High (1) ────┬──────────────┬──────────────┬──────────────┐
              │              │              │              │
              ▼              ▼              ▼              ▼
 Sensor CLK ─►o> T  Q0 ─────►o> T  Q1 ─────►o> T  Q2 ─────►o> T  Q3
              │ FF 0  │      │ FF 1  │      │ FF 2  │      │ FF 3  │
              └───┬───┘      └───┬───┘      └───┬───┘      └───┬───┘
                  │              │              │              │
                  ▼              ▼              ▼              ▼
              Output Q0      Output Q1      Output Q2      Output Q3
             (Bit 0 LSB)     (Bit 1)        (Bit 2)        (Bit 3 MSB)
```

*(Note: `o>` represents a negative-edge-triggered clock terminal).*

---

#### Step 2: Calculate Worst-Case Clock Ripple Delay ($T_{\text{ripple}}$)

The counter has $N = 4$ flip-flop stages, each with $t_{\text{C2Q}} = 2.0\text{ ns}$.

Applying the worst-case ripple delay formula:

$$
T_{\text{ripple}}(4) = N \cdot t_{\text{C2Q}} = 4 \cdot 2.0\text{ ns} = \mathbf{8.0 \text{ ns}}
$$

The maximum worst-case ripple delay is **$8.0\text{ nanoseconds}$**.

---

#### Step 3: Calculate Maximum Safe Operating Frequency ($f_{\text{max}}$)

To ensure the counter output vector fully settles before the next sensor pulse arrives:

$$
f_{\text{max}} = \frac{1}{T_{\text{ripple}}} = \frac{1}{8.0\text{ ns}} = \frac{1}{8.0 \times 10^{-9}\text{ s}} = 125,000,000\text{ Hz} = \mathbf{125.0 \text{ MHz}}
$$

The particle detector sensor pulse rate must not exceed **$125.0\text{ MHz}$**.

---

#### Step 4: Trace the $0011_2 \to 0100_2$ (Decimal 3 to 4) Transition Chronology

Initial State at $t = 0.0\text{ ns}$: $\mathbf{Q} = 0011_2$ ($Q_3=0, Q_2=0, Q_1=1, Q_0=1$).

Sensor pulse 4 arrives at $CLK_0$ at $t = 0.0\text{ ns}$:

1. **Time $t = 0.0\text{ ns}$**:
   $CLK_{\text{sensor}}$ falling edge arrives at $\text{FF}_0$. $\text{FF}_0$ begins toggling $Q_0$ from $1 \to 0$.

2. **Time $t = 2.0\text{ ns}$ ($1 \cdot t_{\text{C2Q}}$)**:
   $\text{FF}_0$ finishes toggling. Output $Q_0$ becomes $0$.
   Current Output Vector: $\mathbf{Q} = 0010_2$ (Decimal 2!).
   Because $Q_0$ transitioned $1 \to 0$ (falling edge!), it triggers the clock input of $\text{FF}_1$.
   $\text{FF}_1$ begins toggling $Q_1$ from $1 \to 0$.

3. **Time $t = 4.0\text{ ns}$ ($2 \cdot t_{\text{C2Q}}$)**:
   $\text{FF}_1$ finishes toggling. Output $Q_1$ becomes $0$.
   Current Output Vector: $\mathbf{Q} = 0000_2$ (Decimal 0!).
   Because $Q_1$ transitioned $1 \to 0$ (falling edge!), it triggers the clock input of $\text{FF}_2$.
   $\text{FF}_2$ begins toggling $Q_2$ from $0 \to 1$.

4. **Time $t = 6.0\text{ ns}$ ($3 \cdot t_{\text{C2Q}}$)**:
   $\text{FF}_2$ finishes toggling. Output $Q_2$ becomes $1$.
   Current Output Vector: $\mathbf{Q} = 0100_2$ (Decimal 4!).
   Because $Q_2$ transitioned $0 \to 1$ (rising edge!), it does **NOT** trigger negative-edge $\text{FF}_3$.
   The ripple wave stops!

```text
TIMING CHRONOLOGY OF 3 -> 4 TRANSITION

 Time t = 0.0 ns : Sensor Pulse Arrives
 Time t = 2.0 ns : Q0 becomes 0 ──► Output Vector Q = 0010_2 (Decimal 2)
 Time t = 4.0 ns : Q1 becomes 0 ──► Output Vector Q = 0000_2 (Decimal 0)
 Time t = 6.0 ns : Q2 becomes 1 ──► Output Vector Q = 0100_2 (Decimal 4 - SETTLED!)
```

Total settling time for this transition = **$6.0\text{ nanoseconds}$**.

---

#### Step 5: Glitch Analysis on the $0111_2 \to 1000_2$ (Decimal 7 to 8) Rollover

The Packet Full Decoder $Y_{\text{full}}$ monitors the output vector and fires ($1$) when $\mathbf{Q} = 0100_2$ (decimal 4).

Let us trace what happens when the counter rolls over from **decimal 7 ($0111_2$) to decimal 8 ($1000_2$)**:

1. **At $t = 0.0\text{ ns}$**: Initial State $\mathbf{Q} = 0111_2$ (Decimal 7). Decoder $Y_{\text{full}} = 0$.
2. **At $t = 2.0\text{ ns}$**: $\text{FF}_0$ toggles $Q_0$ from $1 \to 0$. Vector becomes $\mathbf{Q} = 0110_2$ (Decimal 6). Decoder $Y_{\text{full}} = 0$.
3. **At $t = 4.0\text{ ns}$**: $\text{FF}_1$ toggles $Q_1$ from $1 \to 0$. Vector becomes **$\mathbf{Q} = 0100_2$ (Decimal 4!)**.
   * **CRITICAL FAULT**: The counter vector briefly matches $0100_2$!
   * The Packet Full Decoder sees $\mathbf{Q} = 0100_2$ and begins switching $Y_{\text{full}} \to 1$!
   * After decoder delay $t_{\text{dec}} = 1.0\text{ ns}$ (at $t = 5.0\text{ ns}$), **$Y_{\text{full}}$ pulses HIGH to $1$**!
4. **At $t = 6.0\text{ ns}$**: $\text{FF}_2$ toggles $Q_2$ from $1 \to 0$. Vector becomes $\mathbf{Q} = 0000_2$ (Decimal 0).
   * The decoder sees $\mathbf{Q} = 0000_2$ and begins switching $Y_{\text{full}} \to 0$.
   * At $t = 7.0\text{ ns}$, $Y_{\text{full}}$ returns to $0$.
5. **At $t = 8.0\text{ ns}$**: $\text{FF}_3$ toggles $Q_3$ from $0 \to 1$. Final vector settles at $\mathbf{Q} = 1000_2$ (Decimal 8).

```text
TRANSIENT FALSE GLITCH SPIKE ON PACKET FULL DECODER

 Real Time (ns) │ Vector Q3 Q2 Q1 Q0 │ Decimal Output │ Decoder Y_full Status
────────────────┼────────────────────┼────────────────┼───────────────────────
   t = 0.0 ns   │        0111        │       7        │       Y_full = 0
   t = 2.0 ns   │        0110        │       6        │       Y_full = 0
   t = 4.0 ns   │        0100        │       4        │       Y_full starts rising!
   t = 5.0 ns   │        0100        │       4        │       Y_full = 1 (FALSE GLITCH SPIKE!)
   t = 7.0 ns   │        0000        │       0        │       Y_full returns to 0
   t = 8.0 ns   │        1000        │       8        │       Y_full = 0 (Settled)
```

##### Glitch Duration Analysis:
* False glitch spike on $Y_{\text{full}}$ starts at $t = 5.0\text{ ns}$ and ends at $t = 7.0\text{ ns}$.
* Total false glitch duration = **$2.0\text{ nanoseconds}$**!

##### Engineering Conclusion:
During the transition from 7 to 8, the Packet Full Flag fired a **$2.0\text{-nanosecond}$ false alarm glitch**, telling the satellite computer that a packet was full when the counter was actually at 8!

This exercise proves why asynchronous ripple counters cannot be used directly with combinational decoders in high-speed hardware, necessitating the upgrade to synchronous counter architectures.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Asynchronous Ripple Counter**: A sequential binary counting module constructed by cascading $N$ toggle storage cells in series, where each stage's clock input is driven by the output $Q$ of the preceding stage rather than a shared global clock.
* **Clock Ripple Delay**: The cumulative linear propagation delay ($T_{\text{ripple}} = N \cdot t_{\text{C2Q}}$) that accumulates as state transitions ripple sequentially through an asynchronous flip-flop chain, creating transient glitch states during multi-bit rollovers and limiting maximum operating clock frequency ($f_{\text{max}} = \frac{1}{N \cdot t_{\text{C2Q}}}$).
