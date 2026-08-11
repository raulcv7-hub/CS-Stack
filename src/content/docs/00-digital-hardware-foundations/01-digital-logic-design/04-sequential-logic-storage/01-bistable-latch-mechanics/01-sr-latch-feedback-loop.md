---
title: "Cross-Coupled Latch Feedback Loops and Set/Reset State Mechanics"
---

# Cross-Coupled Latch Feedback Loops and Set/Reset State Mechanics

## The Memoryless Limitation of Combinational Logic

Every combinational logic circuit—whether it is an adder, a multiplexer, an encoder, or a magnitude comparator—suffers from an absolute, physical limitation: **it cannot remember the past**. 

In a combinational circuit, the output at any given microsecond is determined purely, strictly, and exclusively by the inputs present at that exact same microsecond. The moment an input signal vanishes or changes, the output changes instantly. If you press a push-button connected to a combinational circuit, the output activates; the exact nanosecond you release your finger from the button, the output turns OFF and disappears forever.

```text
COMBINATIONAL LOGIC IS MEMORYLESS

 Input Signal Present (1)  ──► [ Combinational Logic ] ──► Output Active (1)
 Input Signal Removed (0)  ──► [ Combinational Logic ] ──► Output LOST (0)!
                                                            (No Memory)
```

Consider what would happen if a computer processor were built using only combinational logic:
* You press the 'A' key on a keyboard. The letter 'A' appears on the screen for the 10 milliseconds your finger touches the key. The moment you lift your finger, the letter 'A' vanishes from screen memory!
* A central processing unit calculates $5 + 3 = 8$. The result $8$ exists on the output wires for a few nanoseconds, but the moment the CPU moves to the next calculation, the number $8$ is permanently lost because there is no way to hold or store it.
* A factory safety sensor detects an overheating engine and pulses a warning line for 1 millisecond. Because the warning pulse is brief, the safety system forgets the hazard immediately after the pulse ends, allowing the engine to overheat and catch fire.

To build computers that can store variables, execute multi-step programs, or maintain operational states, digital engineering requires circuits that can **remember**. A memory circuit must be able to capture a binary value ($0$ or $1$) when commanded, hold that value continuously long after the original input signal has disappeared, and output that stored value on demand.

How do we take standard, memoryless logic gates—which normally only process immediate inputs—and force them to store information indefinitely?

We introduce **Positive Feedback Loops**. By feeding the output of a logic gate back into the input of a companion gate, we create a self-sustaining electronic memory loop. The fundamental hardware module that implements this feedback loop is the **Cross-Coupled Set/Reset (SR) Latch**.

---

## The Mechanical Toggle Light Relay: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how a feedback loop creates memory, let us step away from electronics and imagine a mechanical wall switch used to control an industrial hallway light.

Imagine a specialized wall switch equipped with two separate spring-loaded push-buttons: an **ON Button** (labeled $S$ for Set) and an **OFF Button** (labeled $R$ for Reset). Inside the switch is a mechanical steel seesaw mechanism connected to an indicator lamp ($Q$).

```text
THE MECHANICAL TOGGLE RELAY MODEL

 [ ON Button (Set) ] ──┐
                       ├──► [ Mechanical Seesaw Mechanism ] ──► Lamp (Q)
 [ OFF Button (Reset) ]┘
```

Let us trace how this mechanical seesaw behaves when you interact with it:

1. **Pressing the ON Button ($S = 1, R = 0$)**:
   You push the $S$ button down with your finger. The seesaw tilts to the right, closing an electrical contact. The lamp turns **ON** ($Q = 1$).

2. **Releasing the ON Button ($S = 0, R = 0$)**:
   You lift your finger off the $S$ button. A spring pushes the $S$ button back up to its rest position ($S = 0$). 
   What happens to the seesaw? **It stays tilted to the right!** The mechanical friction holds the contact closed. The lamp remains **ON ($Q = 1$)** even though your finger is no longer touching any button!
   This is the **Memory State (Hold)**. The mechanism remembers that you pressed the ON button in the past.

3. **Pressing the OFF Button ($S = 0, R = 1$)**:
   Later in the evening, you push the $R$ button down. The seesaw tilts back to the left, breaking the contact. The lamp turns **OFF ($Q = 0$)**.

4. **Releasing the OFF Button ($S = 0, R = 0$)**:
   You lift your finger off the $R$ button ($R = 0$). The seesaw stays tilted to the left. The lamp remains **OFF ($Q = 0$)**.

```text
MECHANICAL SWITCH OPERATIONAL MODES

 Action Taken                 │ Button Inputs │ Lamp Status (Q) │ System State
──────────────────────────────┼───────────────┼─────────────────┼──────────────────
 Press ON Button              │  S = 1, R = 0 │     Q = 1       │ SET (Turn ON)
 Release Button (Finger Off)  │  S = 0, R = 0 │     Q = 1       │ HOLD (Remember!)
 Press OFF Button             │  S = 0, R = 1 │     Q = 0       │ RESET (Turn OFF)
 Release Button (Finger Off)  │  S = 0, R = 0 │     Q = 0       │ HOLD (Remember!)
```

Notice what happens when both buttons are released ($S = 0, R = 0$): **The lamp value $Q$ depends on what you did in the past!**
* If the last button you pressed was $S$, $Q$ is $1$.
* If the last button you pressed was $R$, $Q$ is $0$.

Now, ask yourself a crucial physical question: What happens if a panicked person tries to press BOTH the ON button ($S = 1$) AND the OFF button ($R = 1$) at the exact same moment?

The mechanical seesaw experiences a severe conflict. Two opposing forces push on both sides simultaneously. The mechanism jams, the contacts enter an unstable middle position, and when the person releases both buttons at once, the seesaw randomly flops to the left or right depending on which finger slipped off a fraction of a millisecond earlier!

This jammed state is the **Forbidden/Invalid Condition** of an SR Latch.

This mechanical toggle relay is the exact physical analogue of a **Cross-Coupled SR Latch**:
* The $S$ button is the **Set Input** ($S$).
* The $R$ button is the **Reset Input** ($R$).
* The lamp state is the **Stored Bit Output** ($Q$).
* The mechanical friction holding the seesaw position is the **Cross-Coupled Feedback Loop**.

---

## Mechanics of Cross-Coupled Feedback and Latch Synthesis

To master sequential memory design, we must examine the formal mechanics of its two core primitives:
1. **The Cross-Coupled NOR/NAND Latch**: How two logic gates connected in a closed feedback loop create a bistable memory cell.
2. **Set/Reset State Mechanics**: The formal mathematical states of the latch—Set ($Q=1$), Reset ($Q=0$), Hold ($Q_{\text{next}}=Q_{\text{prev}}$), and the forbidden invalid state ($S=1, R=1$).

---

### Primitive 1: The Cross-Coupled NOR Latch Architecture

A **Bistable Latch** is a circuit that possesses two stable equilibrium states ($Q=1$ and $Q=0$). 

To construct a bistable latch out of basic logic gates, we take two 2-input **NOR gates** ($\text{NOR}_1$ and $\text{NOR}_2$) and cross-couple them:
* The output of $\text{NOR}_1$ (labeled $Q$) is connected directly to one input of $\text{NOR}_2$.
* The output of $\text{NOR}_2$ (labeled $\overline{Q}$) is connected directly to one input of $\text{NOR}_1$.

```text
CROSS-COUPLED NOR SR LATCH SCHEMATIC

 Input R (Reset) ────►┌─────────┐
                      │ NOR 1   ├───┬─────────► Output Q (Main Bit)
             ┌───────►└─────────┘   │
             │                      │ (Feedback Path 1)
             │                      │
             │ (Feedback Path 2)    │
             │                      │
             │        ┌─────────┐   │
             └────────┤ NOR 2   │◄──┘
 Input S (Set)  ─────►└────┬────┘
                           │
                           └──────────────────► Output Q' (Complemented Bit)
```

Look at the feedback structure in this schematic:
* NOR Gate 1 receives the **Reset input ($R$)** and feedback signal $\overline{Q}$.
* NOR Gate 2 receives the **Set input ($S$)** and feedback signal $Q$.
* The two outputs ($Q$ and $\overline{Q}$) are mathematically complementary under normal operation ($Q = 1 \implies \overline{Q} = 0$, and $Q = 0 \implies \overline{Q} = 1$).

To understand how this feedback loop holds memory, recall the fundamental operational rule of a **NOR gate**:
$$\text{NOR}(X, Y) = \overline{X + Y}$$
* If **ANY input** to a NOR gate is $1$, its output is forced to $0$.
* An output of $1$ occurs **ONLY if ALL inputs** are $0$.

---

### Primitive 2: Set/Reset State Mechanics

Let us analyze the four operational states of the Cross-Coupled NOR SR Latch by tracing signal propagation through the feedback paths.

```text
NOR SR LATCH EXHAUSTIVE TRUTH TABLE

 Input S (Set) │ Input R (Reset) │ Output Q │ Output Q' │ Operational Mode / State
───────────────┼─────────────────┼──────────┼───────────┼───────────────────────────
       0       │        0        │  Q_prev  │  Q'_prev  │ HOLD (Memory Preserved)
       1       │        0        │    1     │     0     │ SET (Store Bit = 1)
       0       │        1        │    0     │     1     │ RESET (Store Bit = 0)
       1       │        1        │    0     │     0     │ FORBIDDEN / INVALID STATE!
```

---

#### Mode 1: The SET State ($S = 1, R = 0$)

Suppose we want to store a binary $1$ in the latch. We drive $S = 1$ and $R = 0$:

1. Input $S = 1$ enters NOR Gate 2.
2. Because one input to NOR Gate 2 is $1$, its output $\overline{Q}$ is immediately driven to $0$:
   $$\overline{Q} = \overline{S + Q} = \overline{1 + Q} = \overline{1} = 0$$
3. This new signal $\overline{Q} = 0$ travels along Feedback Path 1 into NOR Gate 1.
4. NOR Gate 1 now sees two zero inputs: $R = 0$ and $\overline{Q} = 0$. Its output $Q$ becomes:
   $$Q = \overline{R + \overline{Q}} = \overline{0 + 0} = \overline{0} = 1$$
5. Signal $Q = 1$ travels along Feedback Path 2 into NOR Gate 2, reinforcing its output at $\overline{Q} = 0$.

The latch enters the **SET State**: $Q = 1$ and $\overline{Q} = 0$.

```text
SIGNAL FLOW DURING SET OPERATION (S=1, R=0)

 S = 1 ──► [ NOR 2 ] ──► Q' = 0 ──┐
                                  ├──► [ NOR 1 (R=0) ] ──► Q = 1
                                  │                         │
                                  └─────────────────────────┘
```

---

#### Mode 2: Transitioning to the HOLD State ($S = 0, R = 0$)

Now, let us remove the Set input signal, setting $S = 0$ while keeping $R = 0$. What happens to output $Q$?

1. Input $S$ drops from $1$ to $0$.
2. NOR Gate 2 receives inputs $S = 0$ and feedback signal $Q = 1$.
3. NOR Gate 2 evaluates its output:
   $$\overline{Q} = \overline{S + Q} = \overline{0 + 1} = \overline{1} = 0$$
   Output $\overline{Q}$ **remains at $0$**!
4. NOR Gate 1 receives inputs $R = 0$ and feedback signal $\overline{Q} = 0$.
5. NOR Gate 1 evaluates its output:
   $$Q = \overline{0 + 0} = \overline{0} = 1$$
   Output $Q$ **remains at $1$**!

```text
SIGNAL FLOW DURING HOLD OPERATION (S=0, R=0, PREVIOUS Q=1)

 S = 0 ──► [ NOR 2 (Q=1) ] ──► Q' = 0 ──┐
                                        ├──► [ NOR 1 (R=0) ] ──► Q = 1 (LOCKED!)
                                        │                         │
                                        └─────────────────────────┘
```

Look at what happened: **The output $Q$ stayed at $1$ even though input $S$ returned to $0$!**

The feedback loop locked the data in place. As long as $S = 0$ and $R = 0$, the latch will hold $Q = 1$ for minutes, hours, or years as long as power is supplied.

---

#### Mode 3: The RESET State ($S = 0, R = 1$)

Suppose we want to clear the stored bit and store a binary $0$. We drive $S = 0$ and $R = 1$:

1. Input $R = 1$ enters NOR Gate 1.
2. Because one input to NOR Gate 1 is $1$, its output $Q$ is driven to $0$:
   $$Q = \overline{R + \overline{Q}} = \overline{1 + \overline{Q}} = \overline{1} = 0$$
3. Signal $Q = 0$ travels along Feedback Path 2 into NOR Gate 2.
4. NOR Gate 2 sees inputs $S = 0$ and $Q = 0$. Its output $\overline{Q}$ becomes:
   $$\overline{Q} = \overline{S + Q} = \overline{0 + 0} = \overline{0} = 1$$
5. Signal $\overline{Q} = 1$ travels along Feedback Path 1 into NOR Gate 1, reinforcing $Q = 0$.

The latch enters the **RESET State**: $Q = 0$ and $\overline{Q} = 1$.

If we now release the Reset button ($S = 0, R = 0$), NOR Gate 1 sees $R = 0$ and $\overline{Q} = 1$, keeping $Q = 0$. The latch holds $Q = 0$ indefinitely!

---

#### Mode 4: The Forbidden / Invalid State ($S = 1, R = 1$)

What happens if an engineer accidentally drives both inputs high simultaneously ($S = 1, R = 1$)?

1. Input $R = 1$ enters NOR Gate 1 $\implies Q$ is forced to $0$.
2. Input $S = 1$ enters NOR Gate 2 $\implies \overline{Q}$ is forced to $0$.

Both outputs become $0$ simultaneously ($Q = 0$ and $\overline{Q} = 0$)!

```text
FORBIDDEN STATE COLLAPSE (S=1, R=1)

 S = 1 ──► [ NOR 2 ] ──► Q' = 0 ──┐
                                  ├──► BOTH OUTPUTS ARE ZERO!
 R = 1 ──► [ NOR 1 ] ──► Q  = 0 ──┘    (Violates Q' = NOT(Q) Complementarity!)
```

This state is called **Forbidden or Invalid** for two critical hardware reasons:

1. **Violation of Complementarity**: By definition, output $\overline{Q}$ must be the exact logical inverse of output $Q$. Having $Q = 0$ and $\overline{Q} = 0$ at the same time breaks the fundamental definition of the latch outputs.
2. **Metastable Race Condition upon Release**: If inputs $S$ and $R$ transition from $(1, 1)$ back to the Hold state $(0, 0)$ simultaneously, both NOR gates suddenly see two zero inputs. Both gates try to drive their outputs to $1$ at the same time. 
   Because microscopic gate propagation delays are never perfectly identical, the two gates enter an unpredictable race condition. The output will oscillate wildly or settle into a random state ($Q=1$ or $Q=0$) depending on thermal noise.

**The Golden Rule of NOR SR Latches**:
> A digital control circuit MUST guarantee that inputs $S$ and $R$ are **never active at the same time** ($S \cdot R = 0$).

---

## Characteristic Equation and State Transition Tables

To model the behavior of an SR Latch in mathematical software or formal verification tools, we express its next state $Q_{\text{next}}$ (the state after the next signal propagation) as a function of the current inputs $S, R$ and the current state $Q$.

### The Next-State Characteristic Table

```text
SR LATCH NEXT-STATE CHARACTERISTIC TABLE

 Current State Q │ Input S │ Input R │ Next State Q_next │ Action / Mode
─────────────────┼─────────┼─────────┼───────────────────┼───────────────
        0        │    0    │    0    │         0         │ Hold (Stay 0)
        0        │    0    │    1    │         0         │ Reset to 0
        0        │    1    │    0    │         1         │ Set to 1
        0        │    1    │    1    │         X         │ INVALID STATE!
        1        │    0    │    0    │         1         │ Hold (Stay 1)
        1        │    0    │    1    │         0         │ Reset to 0
        1        │    1    │    0    │         1         │ Set to 1
        1        │    1    │    1    │         X         │ INVALID STATE!
```

### Deriving the Characteristic Equation

Mapping $Q_{\text{next}}$ onto a Karnaugh Map with inputs $S, R, Q$:

$$
Q_{\text{next}} = S + (\overline{R} \cdot Q) \quad \text{subject to } (S \cdot R = 0)
$$

Where:
* $Q_{\text{next}}$ is the state of the latch output in the next time step.
* $S$ is the Set control input.
* $R$ is the Reset control input.
* $\overline{R}$ is the inverted Reset input.
* $Q$ is the current state of the latch output.
* $S \cdot R = 0$ is the non-negotiable operational constraint preventing the forbidden state.

Look at this characteristic equation:
* If $S = 1$ (and $R = 0$): $Q_{\text{next}} = 1 + (1 \cdot Q) = 1$ (Set!).
* If $R = 1$ (and $S = 0$): $Q_{\text{next}} = 0 + (0 \cdot Q) = 0$ (Reset!).
* If $S = 0$ and $R = 0$: $Q_{\text{next}} = 0 + (1 \cdot Q) = Q$ (Hold!).

---

## Cross-Coupled NAND SR Latch ($\overline{S}\,\overline{R}$ Latch)

While NOR latches use active-high inputs ($1$ to Set, $1$ to Reset), digital systems frequently construct SR latches using **NAND gates**.

A cross-coupled NAND latch is built by connecting the output of $\text{NAND}_1$ ($Q$) to one input of $\text{NAND}_2$, and the output of $\text{NAND}_2$ ($\overline{Q}$) back to $\text{NAND}_1$.

```text
CROSS-COUPLED NAND S'-R' LATCH SCHEMATIC

 Input S' (Active-Low Set)   ──►┌──────────┐
                                │ NAND 1   ├───┬─────► Output Q
                       ┌───────►└──────────┘   │
                       │                       │ (Feedback 1)
                       │ (Feedback 2)          │
                       │        ┌──────────┐   │
                       └────────┤ NAND 2   │◄──┘
 Input R' (Active-Low Reset) ──►└────┬─────┘
                                     │
                                     └───────────────► Output Q'
```

Because NAND gates output $1$ when any input is $0$, a NAND-based SR latch operates with **Active-Low Inputs**, denoted as $\overline{S}$ and $\overline{R}$ (or $S'$ and $R'$):

```text
NAND S'-R' LATCH TRUTH TABLE (ACTIVE-LOW CONTROL)

 Input S' (Set) │ Input R' (Reset) │ Output Q │ Output Q' │ Operational Mode
────────────────┼──────────────────┼──────────┼───────────┼───────────────────────
       1        │        1         │  Q_prev  │  Q'_prev  │ HOLD (Memory Preserved)
       0        │        1         │    1     │     0     │ SET (Store Bit = 1)
       1        │        0         │    0     │     1     │ RESET (Store Bit = 0)
       0        │        0         │    1     │     1     │ FORBIDDEN / INVALID!
```

Notice the key differences in a NAND $\overline{S}\overline{R}$ Latch:
* **Hold State**: Occurs when both inputs are **HIGH** ($\overline{S}=1, \overline{R}=1$).
* **Set State**: Triggered by pulling $\overline{S}$ **LOW** ($\overline{S}=0, \overline{R}=1$).
* **Reset State**: Triggered by pulling $\overline{R}$ **LOW** ($\overline{S}=1, \overline{R}=0$).
* **Forbidden State**: Occurs when both inputs are pulled **LOW** ($\overline{S}=0, \overline{R}=0$).

```text
NOR LATCH VS NAND LATCH COMPARISON

 Feature                │ Cross-Coupled NOR Latch      │ Cross-Coupled NAND Latch
────────────────────────┼──────────────────────────────┼─────────────────────────────
 Active Input Level     │ Active-High (1 to trigger)   │ Active-Low (0 to trigger)
 Hold State Inputs      │ S = 0, R = 0                 │ S' = 1, R' = 1
 Set Trigger            │ S = 1, R = 0                 │ S' = 0, R' = 1
 Reset Trigger          │ S = 0, R = 1                 │ S' = 1, R' = 0
 Forbidden State Inputs │ S = 1, R = 1                 │ S' = 0, R' = 0
 Forbidden Output State │ Q = 0, Q' = 0                │ Q = 1, Q' = 1
```

---

## Engineering Reality: Mechanical Switch Debouncing and Metastability

In industrial electronics, SR latches are not merely abstract memory cells; they solve critical real-world physical engineering problems.

### 1. The Physical Problem of Switch Contact Bounce

When a human operator presses a mechanical push-button or toggles a switch on an industrial control panel, the physical metal contacts inside the switch do not close smoothly. 

Instead, due to mechanical elasticity, the metal contacts **bounce off each other** rapidly for 5 to 20 milliseconds before settling into a solid connection.

```text
MECHANICAL SWITCH CONTACT BOUNCE VOLTAGE WAVEFORM

 Voltage :  0V ──► ▔|_|▔|_|▔▔|_|▔▔▔▔▔▔▔ (5ms to 20ms of Rapid Voltage Glitches!)
                   ◄─────────────────►
                      Bounce Noise
```

If this raw switch line is connected directly to a high-speed digital counter, the counter will see 15 or 20 rapid voltage pulses and count 20 button presses instead of 1!

### 2. Switch Debouncing Using an SR Latch

To convert a noisy, bouncing mechanical switch into a single, pristine digital pulse, engineers use a Single-Pole Double-Throw (SPDT) switch connected to an **SR Latch**.

```text
DEBOUNCING CIRCUIT USING A NAND S'-R' LATCH

 +5V (VDD) ───[ Resistor R1 ]───► S' Input ───┐
                                              ├──► [ NAND SR Latch ] ──► Clean Debounced
 +5V (VDD) ───[ Resistor R2 ]───► R' Input ───┘                        Output Q
                                     ▲
 SPDT Switch Mechanical Arm ─────────┘
 (Switches between Grounding S' and Grounding R')
```

How does the SR latch eliminate switch bounce?
1. At rest, the switch arm grounds input $\overline{R}$ ($\overline{R} = 0, \overline{S} = 1$). The latch is in the **RESET state** ($Q = 0$).
2. When the operator pushes the switch toward position $A$, the arm leaves contact $B$. Inputs become $\overline{S} = 1, \overline{R} = 1$ (Hold state). Output $Q$ stays at $0$.
3. The instant the arm makes its **very first physical contact** with position $A$, input $\overline{S}$ drops to $0$ ($\overline{S} = 0, \overline{R} = 1$). The SR latch instantly transitions to the **SET state ($Q = 1$)**!
4. As the arm bounces off contact $A$ during the next 10 milliseconds, inputs flip between $(\overline{S}=1, \overline{R}=1)$ and $(\overline{S}=0, \overline{R}=1)$.
5. Look at what those bounce states are: **Hold state and Set state!** Both states dictate $Q = 1$!
6. The latch output $Q$ transitions to $1$ on the very first micro-contact and **stays rock-solid at $1$**, ignoring all subsequent mechanical bounces!

```text
DEBOUNCED OUTPUT WAVEFORM

 Raw Switch Contact :  111111010100000000000000 (Noisy Bounces)
 Latch Output Q     :  000000111111111111111111 (PRISTINE DIGITAL EDGE!)
                             ▲
                             │ Transition occurs on FIRST contact!
```

---

## Solved Industrial Engineering Exercise: Automated Boiler Safety Lockout System

To consolidate your complete mastery of cross-coupled NOR and NAND latches, Set/Reset state mechanics, truth table analysis, characteristic equations, and switch debouncing, we will now walk through a complete, step-by-step industrial safety problem.

---

### Scenario and Parameters

An industrial chemical processing plant uses a high-pressure steam boiler. The boiler safety system requires a hardware **Safety Lockout Latch** ($Q$) to control the main gas valve ($V$).

```text
BOILER SAFETY LOCKOUT MODULE

 Over-Pressure Sensor (S) ───┐
                             ├──► [ Safety Lockout Latch ] ──► Gas Valve Power (Q)
 Reset Push-Button (R)    ───┘                                 (1 = Fuel Open, 0 = Lockout)
```

The system monitors two binary signals:
1. **Over-Pressure Sensor ($S$)**:
   * $S = 0$: Boiler pressure normal.
   * $S = 1$: Critical over-pressure event detected!
2. **Manual Control Room Reset Button ($R$)**:
   * $R = 0$: Reset button at rest (not pressed).
   * $R = 1$: Operator pressing manual reset button.

#### System Safety Requirements

1. **Normal Operation**: When the system is initialized, the latch is in the SET state ($Q = 1$), keeping the gas valve open ($V = 1$).
2. **Emergency Lockout**: If the over-pressure sensor pulses high ($S = 1$), the latch must immediately transition to the RESET state ($Q = 0$), shutting off the gas valve ($V = 0$).
3. **Persistent Lockout**: Once an over-pressure event occurs, the gas valve MUST remain tightly CLOSED ($Q = 0$) even after the pressure drops back to normal ($S = 0$). The boiler must NOT automatically restart!
4. **Manual Recovery**: The gas valve can only reopen ($Q = 1$) when an operator manually presses the Reset button ($R = 1$), provided the over-pressure hazard has cleared ($S = 0$).
5. **Safety Conflict Prevention**: If an operator presses the Reset button ($R = 1$) while an over-pressure event is actively occurring ($S = 1$), the emergency shutoff MUST take absolute priority ($Q = 0$).

#### Your Objective

1. Determine whether a NOR-based or NAND-based SR latch is naturally suited for this active-high safety specification.
2. Draw the complete cross-coupled gate schematic for the boiler lockout latch.
3. Write the complete state transition table for all sensor and reset combinations.
4. Derive the next-state equation $Q_{\text{next}}$ for the lockout system.
5. Simulate the system across a complete industrial emergency and recovery cycle.

---

### Step-by-Step Derivation

#### Step 1: Select Latch Architecture

The specification defines **Active-High Control Signals**:
* $S = 1$ triggers Emergency Lockout.
* $R = 1$ triggers Manual Reset.
* $S = 0, R = 0$ is the normal running state where previous status must be held.

Looking at our primitives:
* A **Cross-Coupled NOR Latch** uses active-high inputs ($S=1$ Sets, $R=1$ Resets, $S=0, R=0$ Holds).
* A **Cross-Coupled NAND Latch** uses active-low inputs ($0$ to trigger).

Therefore, the **Cross-Coupled NOR Latch** is the perfect, direct match for this active-high safety system!

*(Note on Pin Assignment: To make $S=1$ perform Emergency Lockout ($Q=0$), we connect Over-Pressure Sensor $S$ to the NOR latch's Reset pin, and Manual Reset Button $R$ to the NOR latch's Set pin!).*

Let us define the latch input connections explicitly:
* Latch Set Input $S_{\text{latch}} = \text{Reset Button } R$.
* Latch Reset Input $R_{\text{latch}} = \text{Over-Pressure Sensor } S$.

```text
BOILER LOCKOUT LATCH GATE SCHEMATIC

 Pressure Sensor S (Over-Pressure) ──►┌─────────┐
                                      │ NOR 1   ├───┬─────► Gas Valve Q
                             ┌───────►└─────────┘   │       (0 = Locked Out)
                             │      (Feedback)      │
                             │        ┌─────────┐   │
                             └────────┤ NOR 2   │◄──┘
 Manual Reset R (Button) ────────────►└─────────┘
```

---

#### Step 2: Construct the State Transition Table

Let us evaluate the boiler lockout state transitions for all combinations of Pressure Sensor $S$, Reset Button $R$, and Current Lockout State $Q$:

```text
BOILER SAFETY LOCKOUT STATE TRANSITION TABLE

 Current State Q │ Sensor S │ Button R │ Next State Q_next │ Boiler Operating Mode
─────────────────┼──────────┼──────────┼───────────────────┼──────────────────────────────────────────
   1 (Running)   │    0     │    0     │         1         │ Normal Flight/Operation. HOLD Q=1.
   1 (Running)   │    1     │    0     │         0         │ OVER-PRESSURE EVENT! Lockout (Q=0).
   1 (Running)   │    0     │    1     │         1         │ Running, Reset pressed. Stay Q=1.
   1 (Running)   │    1     │    1     │         0         │ OVER-PRESSURE WINS OVER RESET! Lockout.
   0 (Locked Out)│    0     │    0     │         0         │ Hazard cleared, awaiting reset. HOLD Q=0.
   0 (Locked Out)│    1     │    0     │         0         │ Hazard active. Stay Locked Out (Q=0).
   0 (Locked Out)│    0     │    1     │         1         │ OPERATOR RESET! Gas Valve Reopens (Q=1).
   0 (Locked Out)│    1     │    1     │         0         │ RESET BLOCKED BY HAZARD! Stay Q=0.
```

Look at the safety priority in Row 3 and Row 7 ($S=1, R=1$):
When $S = 1$ (Over-Pressure) and $R = 1$ (Reset Button Pressed):
* Sensor $S=1$ enters NOR 1, forcing Gas Valve $Q = \overline{1 + \overline{Q}} = 0$.
* The gas valve **immediately shuts OFF ($Q = 0$)**, overriding the operator's reset button press!
* Safety Requirement 5 is 100% satisfied by the physics of NOR Gate 1!

---

#### Step 3: Derive the Next-State Equation $Q_{\text{next}}$

Using $S_{\text{latch}} = R$ and $R_{\text{latch}} = S$:

Substitute into the NOR latch characteristic equation $Q_{\text{next}} = S_{\text{latch}} + \overline{R_{\text{latch}}} \cdot Q$:

$$
Q_{\text{next}} = R + (\overline{S} \cdot Q) \quad \text{subject to Priority Constraint } (S \cdot R = 0 \implies \text{Override } S \text{ wins})
$$

Writing the exact, priority-adjusted Boolean equation for $Q_{\text{next}}$:

$$
Q_{\text{next}} = \overline{S} \cdot (R + Q)
$$

Where:
* $Q_{\text{next}}$ is the gas valve state in the next time step ($1 = \text{Open}, 0 = \text{Closed}$).
* $\overline{S}$ is the inverted Over-Pressure Sensor signal ($\overline{S} = 1$ when pressure is safe).
* $R$ is the Manual Reset Button signal.
* $Q$ is the current gas valve state.

Let us test this equation:
* If $S = 1$ (Over-pressure): $\overline{S} = 0 \implies Q_{\text{next}} = 0 \cdot (R + Q) = 0$ (Gas valve locks out immediately!).
* If $S = 0$ (Pressure safe) and $R = 0$: $Q_{\text{next}} = 1 \cdot (0 + Q) = Q$ (Holds current state!).
* If $S = 0$ (Pressure safe) and $R = 1$ (Reset pressed): $Q_{\text{next}} = 1 \cdot (1 + Q) = 1$ (Gas valve reopens!).

---

#### Step 4: Complete Industrial Emergency Cycle Simulation

Let us trace the boiler lockout system through an actual real-world emergency timeline:

```text
TIMELINE OF INDUSTRIAL BOILER EMERGENCY & RECOVERY

 Time t0 (Startup)            : S = 0, R = 1 ──► Latch SETS (Q = 1). Gas Valve OPEN.
 Time t1 (Normal Operation)   : S = 0, R = 0 ──► Latch HOLDS (Q = 1). Gas Valve OPEN.
 Time t2 (PRESSURE SPIKE!)    : S = 1, R = 0 ──► Latch RESETS (Q = 0). GAS VALVE SLAMS SHUT!
 Time t3 (Pressure Normalizes): S = 0, R = 0 ──► Latch HOLDS (Q = 0). VALVE STAYS SHUT!
 Time t4 (Foolish Early Reset): S = 1, R = 1 ──► Hazard Active! Latch FORCES Q = 0!
 Time t5 (Safe Operator Reset): S = 0, R = 1 ──► Hazard Cleared! Latch SETS (Q = 1). RESTARTED!
```

##### Detailed Chronology Verification:

1. **Time $t_1$ (Normal Operation)**:
   $S = 0, R = 0, Q = 1 \implies Q_{\text{next}} = \overline{0} \cdot (0 + 1) = 1 \cdot 1 = 1$.
   The boiler operates normally. Gas valve stays open.

2. **Time $t_2$ (Pressure Spike $S = 1$)**:
   A pressure surge triggers sensor $S = 1$.
   $Q_{\text{next}} = \overline{1} \cdot (0 + 1) = 0 \cdot 1 = 0$.
   The lockout latch resets instantly. **The gas valve shuts OFF ($Q = 0$).**

3. **Time $t_3$ (Pressure Drops Back to Normal $S = 0$)**:
   The pressure drops back below threshold ($S = 0$). The operator has not arrived yet ($R = 0$).
   $Q_{\text{next}} = \overline{0} \cdot (0 + 0) = 1 \cdot 0 = 0$.
   **The gas valve stays tightly CLOSED ($Q = 0$).** The persistent feedback loop prevented an automatic, dangerous re-ignition!

4. **Time $t_4$ (Operator Attempts Early Reset During Active Hazard $S = 1, R = 1$)**:
   An operator tries to force a restart while the boiler is still over-pressurized ($S = 1, R = 1$).
   $Q_{\text{next}} = \overline{1} \cdot (1 + 0) = 0 \cdot 1 = 0$.
   **The lockout latch refuses to open ($Q = 0$).** The emergency safety override holds.

5. **Time $t_5$ (Safe Manual Reset $S = 0, R = 1$)**:
   The pressure hazard is fully resolved ($S = 0$). The operator presses Reset ($R = 1$).
   $Q_{\text{next}} = \overline{0} \cdot (1 + 0) = 1 \cdot 1 = 1$.
   **The lockout latch sets ($Q = 1$).** The gas valve safely reopens and the boiler resumes operation.

All five safety requirements are 100% satisfied by the cross-coupled NOR SR latch.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Cross-Coupled NOR/NAND Latch**: The fundamental bistable sequential memory building block formed by connecting two logic gates in a closed positive feedback loop, allowing a digital circuit to store and hold a single bit of information ($Q$) long after input signals have vanished.
* **Set/Reset State Mechanics**: The operational state transitions of an SR memory cell—Set ($Q=1$), Reset ($Q=0$), Hold ($Q_{\text{next}}=Q$), and the Forbidden/Invalid state ($S=1, R=1$ for NOR, or $\overline{S}=0, \overline{R}=0$ for NAND)—governed by the characteristic equation $Q_{\text{next}} = S + \overline{R}Q$ with non-overlapping input constraints ($S \cdot R = 0$).
