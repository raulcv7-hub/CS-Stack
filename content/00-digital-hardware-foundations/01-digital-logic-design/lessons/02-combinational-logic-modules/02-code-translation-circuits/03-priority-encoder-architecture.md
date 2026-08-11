# Priority Encoder Architecture and Valid Flag Arbitration Mechanics

## The Multiple-Input Collision Crisis in Real-World Digital Systems

In an idealized mathematical environment, a digital system assumes that when multiple input lines are connected to a circuit, exactly one input line will turn ON at a time. This assumption allows simple binary encoders to compress multiple physical wires down into a compact binary code. 

However, real-world physical electronics operates in an unpredictable, highly concurrent environment. Consider a computer system where four hardware components—a keyboard, a network interface card, a hard drive controller, and a power supply monitoring sensor—are all connected to a central processor. Each component possesses a dedicated signal line used to request the processor's immediate attention:

1. Input $D_0$: Keyboard key pressed.
2. Input $D_1$: Network packet arrived.
3. Input $D_2$: Hard drive data transfer complete.
4. Input $D_3$: Main power supply failure detected!

What happens when a user presses a key on the keyboard ($D_0 = 1$) at the exact same millisecond that a network packet arrives ($D_1 = 1$)? Or even worse, what if the power supply begins to fail ($D_3 = 1$) while the hard drive is finishing a data transfer ($D_2 = 1$)?

```text
THE MULTIPLE-INPUT COLLISION CRISIS

 Input D0 (Keyboard)   ─── Output: 1 ──┐
                                       │
 Input D1 (Network)    ─── Output: 1 ──┼───► [ Simple Binary Encoder ]
                                       │              │
 Input D2 (Hard Drive) ─── Output: 0 ──┤              ▼
                                       │    Corrupted Output: 11_2 (3!)
 Input D3 (Power Fail) ─── Output: 0 ──┘    (System thinks D3 fired!)
```

If we route these four request lines into a simple OR-gate binary encoder, a catastrophic logical corruption occurs. A simple encoder evaluates $Y_0 = D_1 + D_3$ and $Y_1 = D_2 + D_3$. When $D_0 = 1$ and $D_1 = 1$ fire simultaneously, the simple encoder evaluates $Y_0 = 1 + 0 = 1$ and $Y_1 = 0 + 0 = 0$, outputting binary code $01_2$ (decimal 1). The keyboard request ($D_0$) is completely swallowed and lost!

Even worse, if $D_1 = 1$ (Network) and $D_2 = 1$ (Hard Drive) fire together, the simple encoder evaluates $Y_0 = 1$ and $Y_1 = 1$, producing binary code $11_2$ (decimal 3). The processor receives a command for $D_3$ (Power Failure), triggering a critical emergency shutdown protocol when no power failure ever occurred!

A simple encoder cannot handle multiple simultaneous active inputs. It suffers from two critical physical flaws:
1. **Garbage Code Generation**: Simultaneous active inputs create corrupted output codes that correspond to unrequested channels.
2. **State Ambiguity**: When all inputs are $0$, the output code is $00_2$. But when input $D_0$ is active, the output code is ALSO $00_2$. The system cannot distinguish between a legitimate request on Channel 0 and a completely idle system.

To solve this collision crisis, digital engineering requires a dedicated arbitration circuit: a **Priority Encoder**. A priority encoder establishes a strict mathematical hierarchy across all input lines, ensuring that if multiple inputs fire at once, the highest-priority input is always encoded while lower-priority signals are suppressed. Furthermore, it incorporates an explicit **Valid Output Flag ($V$)** to eliminate state ambiguity.

---

## The Hospital Emergency Room Triage: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a priority encoder and its valid flag, let us step away from silicon chips and imagine a busy hospital emergency room.

Imagine a hospital triage desk with four patients waiting in the reception area:
* **Patient 0**: Has a minor paper cut ($D_0$).
* **Patient 1**: Has a sprained ankle ($D_1$).
* **Patient 2**: Has a deep arm laceration ($D_2$).
* **Patient 3**: Is suffering a critical cardiac arrest ($D_3$).

```text
THE HOSPITAL TRIAGE PRIORITY SYSTEM

 Patient 0 (Paper Cut)     ──► Priority 0 (Lowest)
 Patient 1 (Sprained Ankle)──► Priority 1
 Patient 2 (Deep Laceration)─► Priority 2
 Patient 3 (Heart Attack)  ──► Priority 3 (Highest!)
```

Suppose Patient 0 (paper cut) and Patient 1 (sprained ankle) are sitting in the waiting room when suddenly Patient 3 (heart attack) is rushed through the front doors. All three patients are present in the room at the exact same time ($D_0 = 1, D_1 = 1, D_3 = 1$).

How does the triage doctor handle this situation?
* The doctor does **NOT** average the patients' conditions together to treat a non-existent middle illness.
* The doctor does **NOT** get confused and treat the paper cut first just because Patient 0 arrived earlier.
* The doctor looks at all active patients, identifies Patient 3 as holding the **highest priority**, and immediately directs all medical staff to treat Patient 3!

While Patient 3 is being treated in the operating room, Patient 0 and Patient 1 must wait. Once Patient 3 is fully stabilized and leaves the room ($D_3 = 0$), the doctor re-evaluates the remaining patients ($D_0 = 1, D_1 = 1$) and immediately treats Patient 1 (sprained ankle), because Priority 1 is now the highest active priority remaining.

```text
TRIAGE DOCTOR EVALUATION FLOW

 Patients Present: [ P0 (Cut), P1 (Ankle), P3 (Heart Attack) ]
                               │
                               ▼
            Who has the HIGHEST Priority Index?
                               │
                               ▼
             Select Patient 3 (Heart Attack)!
             (Suppress Patient 0 and Patient 1)
```

Now, what if the waiting room is completely empty?
The triage nurse looks at the empty room and flips a status switch on the wall from **BUSY** to **IDLE**. This switch tells incoming ambulances whether the hospital is currently treating an active patient or waiting for work.

This hospital triage system is the exact physical analogue of a **Priority Encoder**:
* The patients ($D_0, D_1, D_2, D_3$) are the **Data Inputs**.
* The medical priority ranking ($3 > 2 > 1 > 0$) is the **Input Priority Structure**.
* The doctor's decision is the **Compressed Binary Output Code** ($Y_1, Y_0$).
* The nurse's IDLE/BUSY switch is the **Valid Output Flag ($V$)**.

In digital logic, a priority encoder replaces human medical judgment with an array of cascading inhibition gates that automatically suppress lower-numbered input lines whenever a higher-numbered input line is active.

---

## Mechanics of Priority Encoder Architecture and Valid Flag Arbitration

To master priority encoder design, we must dissect the formal mechanics of its two core primitives:
1. **The Priority Encoder**: How inputs are evaluated through priority suppression logic to produce an unambiguous binary output code.
2. **The Valid Output Flag ($V$)**: How an independent status line monitors all inputs to eliminate the ambiguity between an active zero-index input and an idle system.

---

### Primitive 1: The 4-to-2 Priority Encoder (4:2 Priority Encoder)

A 4-to-2 Priority Encoder accepts four binary input lines ($D_0, D_1, D_2, D_3$), assigns the highest priority to $D_3$ and the lowest priority to $D_0$, and produces a 2-bit binary output code $Y = (Y_1, Y_0)$ alongside a 1-bit Valid Output Flag ($V$).

```text
4-TO-2 PRIORITY ENCODER FUNCTIONAL BLOCK

 Input D0 (Priority 0 - Low)  ───┐
 Input D1 (Priority 1)        ───┼───► [ 4:2 Priority Encoder ] ──┬──► Output Y1 (MSB)
 Input D2 (Priority 2)        ───┤                                ├──► Output Y0 (LSB)
 Input D3 (Priority 3 - High) ───┘                                └──► Valid Flag V
```

#### 1. Truth Table Derivation with Don't Care Wildcards ($X$)

To express the priority hierarchy in a truth table, we use **Don't Care ($X$)** symbols. 

If a higher-priority input line is active ($1$), the state of all lower-priority input lines is completely irrelevant—whether those lower-priority lines are $0$ or $1$, the output code MUST represent the higher-priority line!

```text
4-TO-2 PRIORITY ENCODER TRUTH TABLE

 Input D3 │ Input D2 │ Input D1 │ Input D0 │ Output Y1 │ Output Y0 │ Valid Flag V │ Active Selection
──────────┼──────────┼──────────┼──────────┼───────────┼───────────┼──────────────┼───────────────────
    0     │    0     │    0     │    0     │     0     │     0     │      0       │ NONE (System Idle)
    0     │    0     │    0     │    1     │     0     │     0     │      1       │ Input D0 Selected
    0     │    0     │    1     │    X     │     0     │     1     │      1       │ Input D1 Selected
    0     │    1     │    X     │    X     │     1     │     0     │      1       │ Input D2 Selected
    1     │    X     │    X     │    X     │     1     │     1     │      1       │ Input D3 Selected
```

Study this truth table carefully:
* **Row 0**: All inputs are $0$. Output code is $00_2$, but the Valid Flag $V = 0$. The system is IDLE.
* **Row 1**: Only $D_0 = 1$. Output code $Y_1 Y_0 = 00_2$, and $V = 1$. Input $D_0$ is selected.
* **Row 2**: $D_1 = 1$, while $D_3 = 0, D_2 = 0$. Input $D_0$ is $X$ (Don't Care!). Whether $D_0$ is $0$ or $1$, the output code is $01_2$ (decimal 1) and $V = 1$.
* **Row 3**: $D_2 = 1$, while $D_3 = 0$. Inputs $D_1$ and $D_0$ are $X$ (Don't Care!). The output code is $10_2$ (decimal 2) and $V = 1$.
* **Row 4**: $D_3 = 1$ (Highest Priority!). Inputs $D_2, D_1, D_0$ are ALL $X$ (Don't Care!). As long as $D_3 = 1$, the output code is $11_2$ (decimal 3) and $V = 1$, regardless of what any other input is doing!

---

### Primitive 2: The Valid Output Flag ($V$)

The **Valid Output Flag ($V$)** is an indispensable status primitive in priority encoder architecture. It resolves the **All-Zero Ambiguity** by acting as a binary master indicator:

$$
V = D_0 + D_1 + D_2 + D_3
$$

Where:
* $V$ is the Valid Output Flag.
* $D_0, D_1, D_2, D_3$ are the binary data input lines.
* $+$ represents the logical OR operation.

```text
VALID FLAG AMBIGUITY RESOLUTION

 Input Condition                  │ Output Code (Y1, Y0) │ Valid Flag (V) │ System Meaning
──────────────────────────────────┼──────────────────────┼────────────────┼──────────────────────────────
 All Inputs = 0 (Idle)            │        00_2          │     V = 0      │ IDLE! Ignore code 00_2.
 Only D0 = 1 (Channel 0 Active)   │        00_2          │     V = 1      │ VALID! Process Channel 0!
```

Without the Valid Flag $V$, a receiving microprocessor reading binary code $00_2$ cannot determine whether Channel 0 requested service or if the system is completely at rest. The Valid Flag provides $100\%$ operational clarity.

---

### Deriving the Gate-Level Boolean Equations

To build a 4-to-2 Priority Encoder out of physical logic gates, we extract the Boolean equations for $Y_1, Y_0,$ and $V$ directly from our truth table.

#### 1. Deriving Output Bit $Y_1$ (MSB)
Looking at the truth table, $Y_1 = 1$ in Row 3 ($D_2 = 1$ with $D_3 = 0$) and Row 4 ($D_3 = 1$).

$$
Y_1 = (\overline{D_3} \cdot D_2) + D_3
$$

Applying the **Elimination Law** of Boolean algebra ($X + \overline{X} \cdot Y = X + Y$, where $X = D_3$ and $Y = D_2$):

$$
Y_1 = D_2 + D_3
$$

Where:
* $Y_1$ is the MSB of the encoded output bus.
* $D_2$ is input line 2.
* $D_3$ is input line 3.

#### 2. Deriving Output Bit $Y_0$ (LSB)
Looking at the truth table, $Y_0 = 1$ in Row 2 ($D_1 = 1$ with $D_3 = 0, D_2 = 0$) and Row 4 ($D_3 = 1$).

$$
Y_0 = (\overline{D_3} \cdot \overline{D_2} \cdot D_1) + D_3
$$

Applying the Elimination Law ($X + \overline{X} \cdot Y = X + Y$, where $X = D_3$ and $Y = \overline{D_2} \cdot D_1$):

$$
Y_0 = (\overline{D_2} \cdot D_1) + D_3
$$

Where:
* $Y_0$ is the LSB of the encoded output bus.
* $D_1$ is input line 1.
* $\overline{D_2}$ is the inverted input line 2 (which suppresses $D_1$ when $D_2$ is active!).
* $D_3$ is input line 3.

#### 3. Deriving Valid Flag $V$
As established, $V$ turns $1$ if ANY input line is $1$:

$$
V = D_0 + D_1 + D_2 + D_3
$$

```text
4-TO-2 PRIORITY ENCODER GATE-LEVEL SCHEMATIC

D2 ──► [ NOT ] ──► D2' ──┐
                         ├──► [ AND ] ──┐
D1 ──────────────────────┘              ├──► [ OR 0 ] ──► Output Y0 (LSB)
     ┌──────────────────────────────────┘
D3 ──┤
     └──────────────────────────────────┐
                                        ├──► [ OR 1 ] ──► Output Y1 (MSB)
D2 ─────────────────────────────────────┘

D0 ──┐
D1 ──┼─────────────────────────────────► ┌──────────┐
D2 ──┼─────────────────────────────────► │ 4-INP OR ├──► Valid Flag V
D3 ──┘                                   └──────────┘
```

Look at how elegant this circuit is!
* The inverter on $D_2$ ($\overline{D_2}$) physically blocks $D_1$ from passing through AND Gate 0 whenever $D_2 = 1$. This is the **priority inhibition mechanism**.
* $D_3$ bypasses the lower gates entirely and feeds directly into both output OR gates, automatically forcing $Y_1 Y_0 = 11_2$ whenever $D_3 = 1$.

---

## The 8-to-3 Priority Encoder (74LVC148 Architecture)

When scaling up to an 8-to-3 Priority Encoder (8:3 Priority Encoder), the system accepts 8 input lines ($D_0$ through $D_7$), assigns the highest priority to $D_7$ and the lowest to $D_0$, and produces a 3-bit binary output code $Y = (Y_2, Y_1, Y_0)$ along with the Valid Flag $V$.

```text
8-TO-3 PRIORITY ENCODER FUNCTIONAL BLOCK

 Input D0 (Lowest Priority)  ──┐
 Input D1                    ──┤
 Input D2                    ──┤
 Input D3                    ──┼──► [ 8:3 Priority Encoder ] ──┬──► Output Y2 (MSB)
 Input D4                    ──┤                               ├──► Output Y1
 Input D5                    ──┤                               ├──► Output Y0 (LSB)
 Input D6                    ──┤                               └──► Valid Flag V
 Input D7 (Highest Priority) ──┘
```

### Boolean Equations for an 8-to-3 Priority Encoder

By applying the same priority inhibition logic across all 8 inputs, we derive the Boolean equations for $Y_2, Y_1, Y_0,$ and $V$:

#### 1. MSB Output ($Y_2$):
$Y_2$ must be $1$ if $D_4, D_5, D_6,$ or $D_7$ is active (since binary codes 4, 5, 6, 7 all have $Y_2 = 1$):

$$
Y_2 = D_4 + D_5 + D_6 + D_7
$$

#### 2. Middle Bit Output ($Y_1$):
$Y_1$ must be $1$ for inputs 2, 3, 6, 7. But inputs 2 and 3 must be suppressed if inputs 4 or 5 are active!

$$
Y_1 = D_6 + D_7 + (\overline{D_5} \cdot \overline{D_4} \cdot D_3) + (\overline{D_5} \cdot \overline{D_4} \cdot D_2)
$$

Factoring out $(\overline{D_5} \cdot \overline{D_4})$:

$$
Y_1 = D_6 + D_7 + \left( \overline{D_5} \cdot \overline{D_4} \cdot (D_2 + D_3) \right)
$$

#### 3. LSB Output ($Y_0$):
$Y_0$ must be $1$ for inputs 1, 3, 5, 7, with higher-priority suppression terms applied:

$$
Y_0 = D_7 + (\overline{D_6} \cdot D_5) + (\overline{D_6} \cdot \overline{D_4} \cdot D_3) + (\overline{D_6} \cdot \overline{D_4} \cdot \overline{D_2} \cdot D_1)
$$

#### 4. Valid Flag ($V$):
$$
V = D_0 + D_1 + D_2 + D_3 + D_4 + D_5 + D_6 + D_7
$$

Where:
* $Y_2, Y_1, Y_0$ are the 3 encoded binary output bits.
* $V$ is the Valid Output Flag.
* $D_0 \dots D_7$ are the 8 prioritized input lines.

---

## Cascading Priority Encoders: Building 16-to-4 Priority Trees

In large computer systems, a processor may need to manage 16, 32, or 64 hardware interrupt request lines. How do we build a 16-to-4 Priority Encoder using smaller 8-to-3 Priority Encoder chips?

Commercial priority encoders (such as the industry-standard 74LVC148) include two additional cascading control pins specifically designed for modular expansion:
1. **Enable Input ($\overline{EI}$ or $\overline{EN}$)**: Active-low input that enables the encoder chip. When $\overline{EI} = 1$, the chip is disabled and forces all outputs inactive.
2. **Enable Output ($\overline{EO}$)**: Active-low output that goes LOW ($0$) if and only if the chip is enabled ($\overline{EI} = 0$) AND **NONE of its data inputs are active**. It acts as a "Pass-the-Pencil" signal to the next lower-priority encoder chip!

```text
COMMERCIAL PRIORITY ENCODER CASCADING PINS

 Enable Input (EI') ────► [ 8:3 Priority Encoder ] ───► Enable Output (EO')
                           (Data Inputs D0..D7)         (Active 0 when NO inputs fire)
```

### Constructing a 16-to-4 Priority Encoder Using Two 8-to-3 Encoders

To build a 16-to-4 Priority Encoder for inputs $D_0$ through $D_{15}$ using two 8-to-3 Priority Encoders:

1. **High-Priority Unit (Encoder 1)**:
   * Receives higher-priority inputs $D_8$ through $D_{15}$.
   * Enable Input $\overline{EI}_1$ is grounded ($0\text{ V}$, permanently enabled).
   * Generates lower output bits $(Y_2^{(1)}, Y_1^{(1)}, Y_0^{(1)})$ and Enable Output $\overline{EO}_1$.
2. **Low-Priority Unit (Encoder 0)**:
   * Receives lower-priority inputs $D_0$ through $D_7$.
   * Enable Input $\overline{EI}_0$ is connected directly to the Enable Output $\overline{EO}_1$ of Encoder 1!
   * Generates lower output bits $(Y_2^{(0)}, Y_1^{(0)}, Y_0^{(0)})$.
3. **MSB Output Bit ($Y_3$)**:
   * Output bit $Y_3 = 1$ whenever ANY input on Encoder 1 ($D_8 \dots D_{15}$) is active. This is simply the inverted Enable Output of Encoder 1: $Y_3 = \overline{\overline{EO}_1} = V_1$!

```text
HIERARCHICAL 16-TO-4 CASCADED PRIORITY ENCODER TREE

 Higher Inputs D8..D15 ──► [ Encoder 1 (High Priority) ] ──► Outputs Y2..Y0 (Unit 1)
                            (EI1' = 0, Permanently ON)   ──► Enable Out EO1' ──┐
                                                                               │
 Lower Inputs D0..D7 ────► [ Encoder 0 (Low Priority)  ] ◄── Enable In EI0'  ──┘
                            (Outputs Y2..Y0 Unit 0)
                                    │
                                    ▼
                 [ Output Combination Logic ] ──► Final 4-Bit Bus (Y3, Y2, Y1, Y0)
```

How does this cascading mechanism operate during runtime?
* **If an input between $D_8$ and $D_{15}$ fires**: Encoder 1 processes the high-priority request. Its Enable Output $\overline{EO}_1$ goes HIGH ($1$), which immediately **DISABLES Encoder 0**! Encoder 0 is completely shut down, suppressing all lower-priority requests $D_0 \dots D_7$. MSB $Y_3$ is set to $1$.
* **If NO inputs between $D_8$ and $D_{15}$ fire**: Encoder 1 detects no active inputs. Its Enable Output $\overline{EO}_1$ goes LOW ($0$), which **ENABLES Encoder 0**! Encoder 0 now processes lower-priority requests $D_0 \dots D_7$. MSB $Y_3$ is set to $0$.

This cascading architecture allows engineers to chain priority encoders infinitely to handle 32, 64, or 128 prioritized hardware channels with perfect mathematical rigor.

---

## Engineering Reality: Real-Time Interrupt Handling and Glitch Suppression

In computer architecture, the single most critical application of priority encoders is the **Interrupt Controller** (such as the Programmable Interrupt Controller or APIC in modern CPUs).

### 1. The CPU Interrupt Request (IRQ) Problem

A computer processor connects to dozens of peripheral devices. When a device needs attention, it pulls a hardware **Interrupt Request (IRQ)** line high.

If two devices trigger interrupts simultaneously:
* A disk drive finishing a sector read (IRQ 14).
* A emergency thermal sensor reporting CPU overheating (IRQ 0 - Highest Priority).

The Priority Encoder instantly resolves the race condition, encoding IRQ 0 and presenting binary code $0000_2$ to the CPU control unit. The CPU pauses its current program and immediately executes the thermal emergency handler, saving the hardware from physical destruction.

```text
REAL-TIME INTERRUPT ARBITRATION PIPELINE

 Hardware IRQs (0..15) ──► [ Priority Encoder ] ──► 4-Bit Vector ──► CPU Control Unit
                                 │
                                 └──► Valid Flag V (Triggers Interrupt Pin!)
```

### 2. Spurious Glitches During Priority Preemption

When a higher-priority input turns ON while a lower-priority input is currently being processed ($D_1 = 1$, and then $D_3$ turns ON), the internal logic gates of the priority encoder undergo a rapid transition.

Because signal paths through internal inverters take time ($t_{\text{inv}}$), the output bus $Y$ can briefly output a 1-nanosecond transient garbage code during the preemption switch.

To prevent the CPU from reading a corrupted interrupt vector during this transient switch:
1. The Valid Flag $V$ or an external **Interrupt Acknowledge ($\overline{\text{INTA}}$)** signal is used to latch the priority encoder output into a stable register.
2. The CPU samples the vector only when signals have completely settled, ensuring 100% glitch-free arbitration.

---

## Solved Industrial Engineering Exercise: Jet Fighter Flight Control Interrupt Controller

To consolidate your complete mastery of priority encoders, valid flags, priority inhibition logic, cascading expansion, and IRQ arbitration, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics computer in a jet fighter uses a 4-channel prioritized Interrupt Request (IRQ) controller to manage flight operations. The system monitors four hardware interrupt lines ($D_0, D_1, D_2, D_3$):

1. **Fuel Level Monitor ($D_0$)**: Priority 0 (Lowest Priority).
2. **Navigation Radar Update ($D_1$)**: Priority 1.
3. **Flight Control Surface Actuator ($D_2$)**: Priority 2.
4. **Missile Warning System ($D_3$)**: Priority 3 (Highest Priority!).

```text
AVIONICS IRQ ARBITRATION CONTROLLER

 Fuel Level (D0) ────────┐
 Nav Radar (D1)  ────────┼───► [ Avionics Priority Encoder ] ──┬──► Vector (Y1, Y0)
 Flight Actuator (D2) ───┤                                     └──► CPU INT (V)
 Missile Warning (D3) ───┘
```

The module must output a 2-bit Interrupt Vector $Y = (Y_1, Y_0)$ to the main CPU, along with a master CPU Interrupt Trigger Flag ($V$).

#### System Operating Requirements

1. The module must encode the highest-priority active input line according to the hierarchy $D_3 > D_2 > D_1 > D_0$.
2. Lower-priority requests must be completely suppressed when a higher-priority request is active.
3. The Valid Flag $V$ must equal $1$ if at least one IRQ line is active, and $0$ if all IRQ lines are idle ($0$).
4. An auxiliary **Critical Hazard Alarm ($A_{\text{crit}}$)** must fire ($1$) if either Priority 2 ($D_2$) or Priority 3 ($D_3$) is active.

#### Your Objective

1. Construct the complete 16-row truth table for the 4-to-2 Priority Encoder with inputs $(D_3, D_2, D_1, D_0)$ and outputs $(Y_1, Y_0, V, A_{\text{crit}})$.
2. Derive the minimal Boolean equations for $Y_1, Y_0, V,$ and $A_{\text{crit}}$.
3. Draw the gate-level schematic and calculate total physical gate count and input pin loading.
4. Verify system performance across three critical flight combat scenarios.

---

### Step-by-Step Derivation

#### Step 1: Construct the Exhaustive Truth Table

The system has $N = 4$ binary inputs ($D_3, D_2, D_1, D_0$), resulting in $2^4 = 16$ possible input combinations. We evaluate the priority rules row by row:

* Priority Hierarchy: $D_3 > D_2 > D_1 > D_0$.
* Critical Alarm $A_{\text{crit}} = 1$ if $D_2 = 1$ OR $D_3 = 1$.

```text
EXHAUSTIVE AVIONICS IRQ PRIORITY TRUTH TABLE

 Row │ D3 │ D2 │ D1 │ D0 │ Output Y1 │ Output Y0 │ Valid Flag V │ Critical Alarm Acrit │ Active Selection & Reason
─────┼────┼────┼────┼────┼───────────┼───────────┼──────────────┼──────────────────────┼─────────────────────────────────────────────
  0  │ 0  │ 0  │ 0  │ 0  │     0     │     0     │      0       │          0           │ NO IRQs ACTIVE. System IDLE (V=0).
  1  │ 0  │ 0  │ 0  │ 1  │     0     │     0     │      1       │          0           │ IRQ 0 (Fuel Level): Vector 00_2.
  2  │ 0  │ 0  │ 1  │ 0  │     0     │     1     │      1       │          0           │ IRQ 1 (Nav Radar): Vector 01_2.
  3  │ 0  │ 0  │ 1  │ 1  │     0     │     1     │      1       │          0           │ IRQ 1 (01_2). D0 suppressed by D1!
  4  │ 0  │ 1  │ 0  │ 0  │     1     │     0     │      1       │          1           │ IRQ 2 (Actuator): Vector 10_2. Alarm ON!
  5  │ 0  │ 1  │ 0  │ 1  │     1     │     0     │      1       │          1           │ IRQ 2 (10_2). D0 suppressed by D2!
  6  │ 0  │ 1  │ 1  │ 0  │     1     │     0     │      1       │          1           │ IRQ 2 (10_2). D1 suppressed by D2!
  7  │ 0  │ 1  │ 1  │ 1  │     1     │     0     │      1       │          1           │ IRQ 2 (10_2). D1,D0 suppressed by D2!
  8  │ 1  │ 0  │ 0  │ 0  │     1     │     1     │      1       │          1           │ IRQ 3 (Missile): Vector 11_2. Alarm ON!
  9  │ 1  │ 0  │ 0  │ 1  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D0 suppressed by D3!
 10  │ 1  │ 0  │ 1  │ 0  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D1 suppressed by D3!
 11  │ 1  │ 0  │ 1  │ 1  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D1,D0 suppressed by D3!
 12  │ 1  │ 1  │ 0  │ 0  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D2 suppressed by D3!
 13  │ 1  │ 1  │ 0  │ 1  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D2,D0 suppressed by D3!
 14  │ 1  │ 1  │ 1  │ 0  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). D2,D1 suppressed by D3!
 15  │ 1  │ 1  │ 1  │ 1  │     1     │     1     │      1       │          1           │ IRQ 3 (11_2). All lower suppressed!
```

---

#### Step 2: Derive Minimal Boolean Equations

Using K-map optimization or algebraic reduction on our truth table:

##### 1. Equation for MSB Vector Output ($Y_1$):
$Y_1 = 1$ for Rows 4 through 15.
Inspecting the table, $Y_1 = 1$ whenever $D_2 = 1$ OR $D_3 = 1$:

$$
Y_1 = D_2 + D_3
$$

##### 2. Equation for LSB Vector Output ($Y_0$):
$Y_0 = 1$ for Rows 2, 3 (where $D_1=1$ and $D_2=0, D_3=0$) and Rows 8 through 15 (where $D_3=1$):

$$
Y_0 = (\overline{D_2} \cdot D_1) + D_3
$$

##### 3. Equation for Valid Flag ($V$):
$V = 1$ if ANY input line is $1$:

$$
V = D_0 + D_1 + D_2 + D_3
$$

##### 4. Equation for Critical Alarm ($A_{\text{crit}}$):
$A_{\text{crit}} = 1$ if $D_2 = 1$ OR $D_3 = 1$.
Notice that $A_{\text{crit}}$ is mathematically identical to $Y_1$!

$$
A_{\text{crit}} = Y_1 = D_2 + D_3
$$

Where:
* $Y_1, Y_0$ are the 2 bits of the CPU interrupt vector.
* $V$ is the CPU master interrupt trigger line.
* $A_{\text{crit}}$ is the critical hazard alarm signal.
* $D_0, D_1, D_2, D_3$ are the four prioritized IRQ sensor inputs.

---

#### Step 3: Gate Schematic and Resource Summary

We construct the complete avionics IRQ controller using the following physical gates:
* One NOT gate (to generate $\overline{D_2}$).
* One 2-input AND gate (to compute $\overline{D_2} \cdot D_1$).
* Two 2-input OR gates (for $Y_1$ and $Y_0$).
* One 4-input OR gate (for Valid Flag $V$).

```text
AVIONICS IRQ PRIORITY CONTROLLER SCHEMATIC

D2 ──► [ NOT ] ──► D2' ──┐
                         ├──► [ AND ] ──┐
D1 ──────────────────────┘              ├──► [ OR 0 ] ──► Vector Y0 (LSB)
D3 ──┬──────────────────────────────────┘
     │
D2 ──┼──────────────────────────────────┐
     │                                  ├──► [ OR 1 ] ──► Vector Y1 & Acrit
     └──────────────────────────────────┘

D0 ──┐
D1 ──┼─────────────────────────────────► ┌──────────┐
D2 ──┼─────────────────────────────────► │ 4-INP OR ├──► Valid Flag V
D3 ──┘                                   └──────────┘
```

```text
HARDWARE RESOURCE SUMMARY
* NOT Gates (Inverters): 1
* 2-Input AND Gates: 1
* 2-Input OR Gates: 2
* 4-Input OR Gates: 1
* Total Physical Gates: 5 gates
* Total Input Pin Load: 11 pins
```

---

### Sanity Check and Verification

Let us verify our avionics IRQ controller equations across three high-stress combat flight scenarios.

#### Scenario 1: Multiple Simultaneous Interrupts During Combat
* **Flight Situation**: The jet's navigation radar updates ($D_1 = 1$), the flight control surface moves ($D_2 = 1$), and a missile lock warning fires ($D_3 = 1$) at the exact same instant! Fuel status is normal ($D_0 = 0$).
* **Inputs**: $D_3 = 1, D_2 = 1, D_1 = 1, D_0 = 0$ (Row 14).
* **Expected Result**: Missile Warning ($D_3$, Priority 3) MUST override all other requests. Vector $Y = 11_2$ (decimal 3), Valid Flag $V = 1$, Critical Alarm $A_{\text{crit}} = 1$.
* **Formula Evaluation**:
  * $Y_1 = D_2 + D_3 = 1 + 1 = 1$
  * $Y_0 = (\overline{D_2} \cdot D_1) + D_3 = (\overline{1} \cdot 1) + 1 = (0 \cdot 1) + 1 = 1$
  * $V = D_0 + D_1 + D_2 + D_3 = 0 + 1 + 1 + 1 = 1$
  * $A_{\text{crit}} = Y_1 = 1$
* **Results**: Vector $Y_1 Y_0 = 11_2$, $V = 1$, $A_{\text{crit}} = 1$. **MISSILE WARNING ARBITRATED PERFECTLY!** Lower-priority requests $D_2$ and $D_1$ were completely suppressed.

#### Scenario 2: Routine Fuel Level Check in Calm Flight
* **Flight Situation**: Only the fuel level monitor requests attention ($D_0 = 1$). All other sensors are idle ($D_3 = 0, D_2 = 0, D_1 = 0$).
* **Inputs**: $D_3 = 0, D_2 = 0, D_1 = 0, D_0 = 1$ (Row 1).
* **Expected Result**: Fuel Request ($D_0$, Priority 0) encoded. Vector $Y = 00_2$ (decimal 0), Valid Flag $V = 1$, Critical Alarm $A_{\text{crit}} = 0$.
* **Formula Evaluation**:
  * $Y_1 = D_2 + D_3 = 0 + 0 = 0$
  * $Y_0 = (\overline{D_2} \cdot D_1) + D_3 = (\overline{0} \cdot 0) + 0 = 0$
  * $V = 0 + 0 + 0 + 1 = 1$
  * $A_{\text{crit}} = Y_1 = 0$
* **Results**: Vector $Y_1 Y_0 = 00_2$, $V = 1$, $A_{\text{crit}} = 0$. **FUEL CHECK ARBITRATED PERFECTLY!** No critical alarm fired.

#### Scenario 3: System Standby (No Active Interrupts)
* **Flight Situation**: All sensors idle ($D_3 = 0, D_2 = 0, D_1 = 0, D_0 = 0$).
* **Inputs**: $D_3 = 0, D_2 = 0, D_1 = 0, D_0 = 0$ (Row 0).
* **Expected Result**: Vector $Y = 00_2$, BUT Valid Flag $V = 0$ (System Idle!). CPU ignores vector $00_2$.
* **Formula Evaluation**:
  * $Y_1 = 0 + 0 = 0$
  * $Y_0 = (\overline{0} \cdot 0) + 0 = 0$
  * $V = 0 + 0 + 0 + 0 = 0$
  * $A_{\text{crit}} = 0$
* **Results**: Vector $Y_1 Y_0 = 00_2$, $V = 0$, $A_{\text{crit}} = 0$. **IDLE STATE VERIFIED!**

All scenarios evaluate with 100% mathematical and logical precision. The avionics IRQ controller is fully verified and ready for deployment.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Priority Encoder**: A combinational logic circuit that resolves multiple simultaneous active input lines by enforcing a strict mathematical priority hierarchy, encoding only the active input channel assigned the highest priority index while suppressing all lower-priority signals.
* **Valid Output Flag ($V$)**: An explicit status output line ($V = D_0 + D_1 + \dots + D_{N-1}$) that turns $1$ if at least one input line is active and $0$ when all inputs are idle, eliminating the All-Zero Ambiguity between an active zero-index input and an idle system.
