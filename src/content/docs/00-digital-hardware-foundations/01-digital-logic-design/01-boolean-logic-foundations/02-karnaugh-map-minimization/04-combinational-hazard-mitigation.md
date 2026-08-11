---
title: "Combinational Hazard Mitigation and Redundant Cover Term Synthesis"
---

# Combinational Hazard Mitigation and Redundant Cover Term Synthesis

## The Physical Failure of Instantaneous Switching Assumptions

In Boolean algebra and ideal digital logic theory, we assume that logic gates react instantaneously. When an input signal toggles from $0$ to $1$, we draw circuit timing diagrams with crisp, perfectly vertical square-wave edges. Under this mathematical idealization, a minimal Sum of Products (SOP) or Product of Sums (POS) expression is considered completely flawless if it produces the exact binary outputs specified by its truth table.

However, physical silicon switches do not exist in an idealized mathematical realm. Real electronic circuits are bound by the laws of physics. When an electrical voltage on a silicon wire shifts from low to high, electrons must physically flow, parasitic capacitances must charge or discharge, and transistors must transition through non-linear operating regions.

Every physical logic gate introduces a measurable time delay known as **Propagation Delay** ($t_{pd}$). 

```text
IDEALIZED SWITCHING VERSUS PHYSICAL PROPAGATION DELAY

 Ideal Theoretical Signal (t_pd = 0 ns):
 Voltage :  000000001111111100000000
                    ▲
                    │ (Instantaneous Vertical Transition)

 Real Physical Signal (t_pd > 0 ns):
 Voltage :  00000000/▔▔▔\11111111\___00000000
                    ◄───►
               t_pd Slope & Delay
```

Because different paths inside a circuit contain different numbers of gates and different wire lengths, signals traveling along two parallel paths will arrive at a downstream gate at slightly different times. 

When a single input variable flips state, one internal logic path may update a few nanoseconds faster than another. During that tiny window of time—when one path has updated but the second path has not yet reacted—the output of the circuit can momentarily collapse to an incorrect voltage level.

This transient, unintended output voltage spike is called a **Glitch** or a **Combinational Hazard**.

```text
THE PHYSICAL SIGNAL RACE CONDITION

 Input A Flips State (0 -> 1)
       │
       ├──────────────────────────┐
       ▼                          ▼
 Fast Path 1               Slow Path 2 (Inverter Delay)
 (Updates in 0.1 ns)       (Updates in 0.6 ns)
       │                          │
       └────────────┬─────────────┘
                    │
                    ▼
         UNINTENDED OUTPUT GLITCH!
         (Output drops for 0.5 ns)
```

In a simple digital display, a $0.5$-nanosecond glitch is completely invisible to human eyes. But in a high-speed computer processor, that same $0.5$-nanosecond glitch can have catastrophic consequences. If an unintended glitch fires on the write-enable wire of a register file, random noise will overwrite critical data in memory. If a glitch strikes an interrupt line, the CPU will execute a false emergency service routine. If a glitch occurs on an asynchronous reset wire, a satellite flight computer will randomly reboot in orbit.

Surprisingly, the primary cause of combinational hazards is **Boolean minimization itself**! By removing "redundant" terms to make a circuit smaller and faster, standard algebraic and Karnaugh map optimization removes the very terms that prevent signals from dropping during state transitions.

To build reliable digital hardware, engineers must understand how signal race conditions create **Static Hazards**, and how to systematically eliminate them by synthesizing redundant **Hazard Cover Terms**.

---

## The Relay Baton Handoff: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a combinational hazard, let us step away from electronics and imagine a 4x100 meter relay race on a track.

Imagine a relay team with two runners: Runner A and Runner B. Runner A is running around the track holding the baton ($1$). Runner B is standing in the exchange zone, waiting to receive the baton and continue the race ($1$).

To execute a successful handoff, Runner A must pass the baton to Runner B. The rule of the race is simple: **The team must maintain continuous possession of the baton ($1$) at all times during the handoff.**

```text
THE RELAY BATON HANDOFF MODEL

 Runner A (Holding Baton) ──► [ Exchange Zone ] ──► Runner B (Waiting)
                                      │
                                      ▼
                        Must Maintain Continuous 1!
```

Now consider what happens in two different execution scenarios:

### Scenario 1: The Flawless Overlapping Handoff (Hazard-Free)
Runner A enters the exchange zone. Runner B starts running alongside Runner A. For a brief distance of 5 meters, **both runners hold the baton together simultaneously**. Once Runner B has a firm grip on the baton, Runner A lets go and stops.

Did the baton ever hit the ground? No! Because there was an **overlap period** where both runners held the baton, the baton state stayed at a continuous $1$.

### Scenario 2: The Mismatched Handoff (The Glitch!)
Now imagine Runner A gets tired and lets go of the baton a fraction of a second *before* Runner B reaches out to grab it. 

For a tiny fraction of a second—say, 0.1 seconds—neither runner is holding the baton. The baton falls to the track ($0$). A moment later, Runner B scoops the baton off the ground and continues running ($1$).

```text
THE MISMATCHED HANDOFF GLITCH

 Runner A Releases Baton ──► [ 0.1 sec GAP: Baton on Ground! (0) ] ──► Runner B Scoops Baton
                                            │
                                            ▼
                                  UNINTENDED GLITCH (0)!
```

Even though the team started with the baton ($1$) and ended with the baton ($1$), the temporary timing gap caused the baton state to drop to $0$.

This 0.1-second gap is the exact physical mechanism behind a **Static-1 Hazard**:
* Runner A releasing the baton represents a logic path turning OFF ($1 \to 0$).
* Runner B grabbing the baton represents a parallel logic path turning ON ($0 \to 1$).
* If the path turning OFF reacts faster than the path turning ON, the circuit drops the baton! The output momentarily collapses to $0$ before recovering to $1$.

To fix this problem on the track, the coach assigns a third runner (an assistant) to hold the baton across the entire exchange zone while the handoff happens. In digital electronics, that assistant runner is a **Hazard Cover Term**.

---

## Mechanics of Combinational Hazards and Cover Term Synthesis

To master hazard mitigation, we must dissect the formal mechanics of propagation delays, the three physical classes of hazards, and the systematic K-map synthesis technique used to eliminate them.

---

### Primitive 1: Static Hazards

A **Static Hazard** is a temporary, unintended output glitch that occurs when a single input variable changes state, while the circuit's steady-state mathematical truth table dictates that the output should remain completely constant.

Static hazards are divided into two distinct physical classes depending on the steady-state value of the output:

```text
CLASSIFICATION OF COMBINATIONAL HAZARDS

                      COMBINATIONAL HAZARDS
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
   STATIC HAZARDS                                DYNAMIC HAZARDS
 (Single Input Change)                         (Single Input Change)
   │                                             │
   ├──► Static-1 Hazard (1 -> 0 -> 1 Glitch)     └──► Multiple Transitions
   └──► Static-0 Hazard (0 -> 1 -> 0 Glitch)          (1 -> 0 -> 1 -> 0)
```

#### 1. Static-1 Hazard
A **Static-1 Hazard** occurs when an output is supposed to remain steady at $1$ during an input transition, but physically drops to $0$ for a brief transient duration before returning to $1$.

* Steady-State Expectation: $1 \to 1$
* Physical Behavior: $1 \to 0 \to 1$

Static-1 hazards occur exclusively in **Sum of Products (SOP) AND-OR circuits**.

#### 2. Static-0 Hazard
A **Static-0 Hazard** occurs when an output is supposed to remain steady at $0$ during an input transition, but physically spikes to $1$ for a brief transient duration before returning to $0$.

* Steady-State Expectation: $0 \to 0$
* Physical Behavior: $0 \to 1 \to 0$

Static-0 hazards occur exclusively in **Product of Sums (POS) OR-AND circuits**.

#### 3. Dynamic Hazard
A **Dynamic Hazard** occurs when an output is supposed to undergo a single transition (either $0 \to 1$ or $1 \to 0$), but instead oscillates multiple times (e.g., $0 \to 1 \to 0 \to 1$) before settling. Dynamic hazards occur only in deep, multi-level circuits with three or more cascaded gate stages.

---

### The Anatomical Dissection of a Static-1 Hazard

To understand how a static-1 hazard forms at the transistor level, let us build and analyze the classic hazard demonstration circuit.

Consider the simplified Boolean expression:

$$
Y = (A \cdot B) + (\overline{A} \cdot C)
$$

Where:
* $Y$ is the Boolean output signal.
* $A, B, C$ are binary input variables.
* $(A \cdot B)$ is the first product term (Gate 1).
* $(\overline{A} \cdot C)$ is the second product term (Gate 2).

```text
MINIMAL CIRCUIT EXHIBITING A STATIC-1 HAZARD

 Inputs A, B ──► [ AND Gate 1 ] ─────────────────┐
                                                 ├──► [ OR Gate 3 ] ──► Output Y
 Input A ──► [ NOT ] ──► A' ─┐                   │
                             ├─► [ AND Gate 2 ] ─┘
 Input C ────────────────────┘
```

#### The Timing Setup
Suppose inputs $B$ and $C$ are both fixed at $1$ ($B = 1, C = 1$). 
Substituting $B = 1$ and $C = 1$ into our output equation:

$$
Y = (A \cdot 1) + (\overline{A} \cdot 1) = A + \overline{A} = 1
$$

By the **Complement Law** of Boolean algebra ($A + \overline{A} = 1$), the output $Y$ must mathematically equal $1$ regardless of whether $A$ is $0$ or $1$.

Now, let us trace what happens when input $A$ switches from $1$ to $0$.

#### Step-by-Step Microsecond Signal Progression

Assume the physical propagation delays for the gates in our technology library are:
* Inverter (NOT gate) delay: $t_{\text{inv}} = 1.0 \text{ ns}$
* AND gate delay: $t_{\text{and}} = 1.0 \text{ ns}$
* OR gate delay: $t_{\text{or}} = 1.0 \text{ ns}$

```text
TIMING CHRONOLOGY OF THE STATIC-1 HAZARD

  [t = 0.0 ns]  Initial Steady State (A = 1, B = 1, C = 1)
    │           • Gate 1 (A·B) = 1  │  Gate 2 (A'·C) = 0  │  Output Y = 1
    ▼
  [t = 1.0 ns]  Input A Switches (1 ─► 0)
    │           • Signal A drops to 0 immediately
    │           • Signal A' remains 0 (Inverter delay in progress)
    ▼
  [t = 2.0 ns]  Gate 1 Output Drops (1 ─► 0)
    │           • Gate 1 output falls to 0
    │           • Inverter finishes: Signal A' becomes 1
    │           • BOTH Gate 1 and Gate 2 outputs are 0 simultaneously!
    ▼
  [t = 3.0 ns]  Glitch Appears at Output Y!
    │           • Gate 3 (OR) evaluates (0 + 0) ──► Output Y collapses to 0
    │           • Gate 2 output finishes rising to 1
    ▼
  [t = 4.0 ns]  Circuit Recovers
                • Gate 3 (OR) evaluates (0 + 1) ──► Output Y pulls back to 1
```

```text
STATIC-1 HAZARD TIMING WAVEFORMS

 Time (ns) :  0.0     1.0     2.0     3.0     4.0     5.0
              ├───────┼───────┼───────┼───────┼───────┤

 Input A    : ────────┐
                      └───────────────────────────────

 Gate 1(AB) : ────────────────┐
                              └────────────────────────

 Gate 2(A'C):                         ┌───────────────
              ────────────────────────┘

 Output Y   : ────────────────┐       ┌───────────────
                              └───────┘
                                  ▲
                                  │ HAZARD GLITCH TO 0 (1.0 ns)
```

Between $t = 3.0 \text{ ns}$ and $t = 4.0 \text{ ns}$, Output $Y$ collapsed to $0$! The circuit dropped the relay baton during the transition from $A$ to $\overline{A}$.

---

### Primitive 2: Hazard Cover Term Synthesis

How do we eliminate a static hazard permanently? We use **Hazard Cover Term Synthesis**.

#### 1. Visual Hazard Identification on a Karnaugh Map

To detect static hazards visually, map the function onto a Karnaugh Map and inspect the rectangular loops of $1$s.

Let us map $Y = (A \cdot B) + (\overline{A} \cdot C)$ onto a 3-variable K-Map:

```text
KARNAUGH MAP OF HAZARD-PRONE FUNCTION Y = AB + A'C

             BC = 00       BC = 01       BC = 11       BC = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
   A = 0  │      0      │      1      │      1      │      0      │
          │             │  (Cell 1)   │  (Cell 3)   │             │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
   A = 1  │      0      │      0      │      1      │      1      │
          │             │             │  (Cell 7)   │  (Cell 6)   │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Look at how the loops are drawn in a standard minimal SOP design:
* Loop 1 covers term $(\overline{A} \cdot C)$: Cells 1 and 3 ($A=0, BC=01$ and $BC=11$).
* Loop 2 covers term $(A \cdot B)$: Cells 7 and 6 ($A=1, BC=11$ and $BC=10$).

```text
VISUAL HAZARD DIAGNOSIS RULE

 Look at Cell 3 (011) and Cell 7 (111):
 * Both cells contain a 1!
 * They are physically ADJACENT on the grid.
 * BUT Cell 3 is in Loop 1, while Cell 7 is in Loop 2!
 * There is NO LOOP that covers BOTH Cell 3 and Cell 7 together!
```

**The Universal Visual Hazard Rule**:
> A static hazard exists whenever two adjacent $1$s (or adjacent $0$s) on a Karnaugh Map are covered by **different, non-overlapping loops**. Moving between those two cells requires transitioning between two independent logic gates, creating a race condition.

```text
ADJACENT CELLS IN SEPARATE LOOPS (HAZARD PRESENT)

 Cell 3 (1) ──[ Non-Overlapping Loop Boundary ]──► Cell 7 (1)
  (Loop 1)                                          (Loop 2)
```

#### 2. Synthesizing the Redundant Hazard Cover Term

To eliminate the hazard, we apply a simple geometric repair: **draw an additional, overlapping loop that spans directly across the boundary between Cell 3 and Cell 7!**

```text
ADDING THE REDUNDANT HAZARD COVER TERM

             BC = 11
          ┌───────────┐
   A = 0  │     1     │ (Cell 3)
          ├───────────┤  ▲
   A = 1  │     1     │ (Cell 7)
          └───────────┘  │
                         └─► DRAW A NEW 2-CELL VERTICAL LOOP!
                             Encloses Cells 3 and 7 together!
```

Let us extract the Boolean product term for this new vertical loop (Cells 3 and 7):
* **Variable $A$**: Rows are $A=0$ and $A=1$. Variable $A$ changes ($0 \to 1$). **DISCARD $A$!**
* **Variable $B$**: Column index is $BC=11$. $B = 1$ for both cells. **KEEP $B$**.
* **Variable $C$**: Column index is $BC=11$. $C = 1$ for both cells. **KEEP $C$**.

The new hazard cover term is:

$$
\text{Cover Term} = B \cdot C
$$

Notice what this term is: **It is the Consensus Term!**

#### 3. The Hazard-Free SOP Expression

We add the cover term $B \cdot C$ into our original function:

$$
Y_{\text{hazard-free}} = (A \cdot B) + (\overline{A} \cdot C) + (B \cdot C)
$$

Where:
* $(A \cdot B)$ is Gate 1 (Primary logic term).
* $(\overline{A} \cdot C)$ is Gate 2 (Primary logic term).
* $(B \cdot C)$ is Gate 4 (Redundant Hazard Cover Term).

```text
HAZARD-FREE HARDWARE SCHEMATIC

 Inputs A, B ──────► [ AND Gate 1 ] ───────┐
                                           │
 Inputs A', C ─────► [ AND Gate 2 ] ───────┼──► [ OR Gate 4 ] ──► Output Y
                                           │    (Glitch-Free!)
 Inputs B, C ──────► [ AND Gate 3 ] ───────┘
                     (Hazard Cover Gate)
```

#### Why the Cover Term Eliminates the Glitch

Let us re-evaluate the physical transition ($A: 1 \to 0$) with $B = 1$ and $C = 1$ using our new hazard-free circuit:

When $B = 1$ and $C = 1$, Gate 3 computes $1 \cdot 1 = 1$. 

Notice that Gate 3 does **NOT** depend on variable $A$ or the inverter! While Gate 1 is turning OFF and Gate 2 is waiting for the inverter delay, **Gate 3 holds the OR gate input steady at $1$ across the entire transition window.**

```text
GLITCH MITIGATION TIMING CHRONOLOGY

 Time t = 2.0 ns (During Transition):
   * Gate 1 Output = 0  (Dropping)
   * Gate 2 Output = 0  (Waiting for inverter delay)
   * Gate 3 Output = 1  (STEADY HIGH! Unaffected by A!)
   * Gate 4 Output Y = 0 + 0 + 1 = 1 !!!  <── NO GLITCH!
```

The baton was never dropped! Gate 3 held the baton steady during the exchange between Gate 1 and Gate 2.

---

### Mitigating Static-0 Hazards in POS Circuits

Static-0 hazards occur in two-level OR-AND (Product of Sums) circuits when an output is supposed to remain steady at $0$, but transiently spikes to $1$.

The mitigation procedure is the exact dual of the SOP method:
1. Map the POS function onto a Karnaugh Map using $0$s.
2. Locate any pair of adjacent $0$s that are covered by **different, non-overlapping maxterm loops**.
3. Add a redundant **POS Hazard Cover Term** (a sum term) that encloses both adjacent $0$s.

```text
DUALITY OF HAZARD COVER SYNTHESIS

 SOP Circuits (AND-OR)                 POS Circuits (OR-AND)
───────────────────────────────────── ──────────────────────────────────────
 Prevents Static-1 Hazards (1->0->1)   Prevents Static-0 Hazards (0->1->0)
 Groups adjacent 1s                    Groups adjacent 0s
 Adds redundant AND cover term (B*C)   Adds redundant OR cover term (B + C)
 Maintains OR input high during shift   Maintains AND input low during shift
```

---

## Engineering Reality: Minimal Gate Area versus Hazard-Free Reliability

In introductory digital logic courses, students are taught that the ultimate goal of design is to find the absolute smallest Boolean expression with the fewest possible gates. In real-world industrial engineering, however, **minimal gate count and hazard-free reliability are in direct conflict.**

```text
THE GREAT HARDWARE DESIGN TRADE-OFF

 Minimal Area Design (Minimal SOP)     Hazard-Free Design (Covered SOP)
 ─────────────────────────────────     ─────────────────────────────────
 * Removes all redundant terms.        * Retains redundant cover terms.
 * Uses smallest silicon die area.     * Uses slightly larger die area.
 * Consumes minimal static power.      * Consumes slightly more power.
 * DANGEROUS: Contains glitches!       * SAFE: Guaranteed glitch-free!
 * Used for non-critical data paths.   * MANDATORY for clocks and resets.
```

### When Must You Synthesize Hazard Cover Terms?

Digital designers do not add hazard cover terms to every single circuit on a chip, because doing so would increase chip size and power consumption. Instead, engineers apply hazard cover terms selectively based on the function of the signal line:

1. **Clock Lines and Reset Lines (MANDATORY COVER)**:
   If a control line drives the Clock, Reset, or Preset pin of a memory register or flip-flop, **a single glitch will ruin system state**. These lines MUST be synthesized with hazard cover terms.
2. **Asynchronous Memory Write Enables (MANDATORY COVER)**:
   If a logic circuit drives the Write-Enable ($\text{WE}$) pin of an SRAM module, a $0.5\text{-ns}$ glitch will corrupt memory addresses. These lines MUST be hazard-free.
3. **Synchronous Bus Data Paths (COVER OPTIONAL)**:
   If a logic circuit drives a data pipeline whose output is sampled only on a stable clock edge long after transients have settled, intermediate glitches do not matter. Designers omit cover terms on data paths to save silicon area.

---

## Solved Industrial Engineering Exercise: Nuclear Reactor Emergency Quench System

To consolidate your complete mastery of gate propagation delays, timing waveforms, static-1 hazard diagnosis, static-0 hazard diagnosis, K-map hazard identification, and cover term synthesis, we will now walk through a complete, step-by-step aerospace/nuclear safety engineering problem.

---

### Scenario and Parameters

A nuclear power station is engineering the hardware safety interlock for an automated Emergency Coolant Injection Valve ($Q$). The valve controller monitors four binary sensors:

1. **Core Temperature Sensor ($A$)**:
   * $A = 0$: Temperature normal.
   * $A = 1$: Core over-temperature hazard!
2. **Primary Coolant Pressure Switch ($B$)**:
   * $B = 0$: Primary pressure low (coolant leak!).
   * $B = 1$: Primary pressure nominal.
3. **Secondary Backup Pump Switch ($C$)**:
   * $C = 0$: Secondary pump OFF.
   * $C = 1$: Secondary pump ON.
4. **Manual Control Room Switch ($D$)**:
   * $D = 0$: Manual switch OFF.
   * $D = 1$: Manual switch ON.

```text
NUCLEAR REACTOR SAFETY CONTROL SYSTEM

 Core Temp (A)   Primary Press (B)   Backup Pump (C)   Manual Switch (D)
       │                 │                  │                  │
       └─────────────────┼──────────────────┴──────────────────┘
                         │
                         ▼
          ┌──────────────────────────────┐
          │ Coolant Safety Interlock     │
          └──────────────┬───────────────┘
                         │
                         ▼
             Coolant Injection Valve (Q)
             (0 = Closed, 1 = Open / Quench)
```

#### The Uncovered Minimal Specification

The plant software team used standard Karnaugh map minimization to derive a "minimal" SOP expression for the valve control output $Q$:

$$
Q_{\text{minimal}} = (A \cdot \overline{B}) + (B \cdot C \cdot \overline{D})
$$

Where:
* $Q = 1$ opens the emergency coolant valve to flood the reactor core.
* $A, B, C, D$ are the four binary nuclear plant sensors.

#### The Plant Hazard Inspection

During plant commissioning, safety auditors discover that when the backup pump is running ($C = 1$), manual switch is OFF ($D = 0$), and core temperature is high ($A = 1$), toggling the primary pressure switch $B$ from $0$ to $1$ causes the emergency valve to momentarily glitch to $0$ (CLOSE) for 1.2 nanoseconds. This momentary valve closure causes a hydraulic water-hammer shockwave that damages the coolant piping!

#### Your Objective

1. Construct the complete 16-cell Karnaugh Map for $Q_{\text{minimal}}$.
2. Identify the exact physical input transition that causes the static-1 hazard.
3. Prove the existence of the glitch by performing a detailed nanosecond timing derivation of the signal race condition.
4. Synthesize the redundant **Hazard Cover Term** needed to eliminate the glitch.
5. Derive the complete, hazard-free Boolean equation and verify its operation.

---

### Step-by-Step Derivation

#### Step 1: Construct and Populate the 4-Variable K-Map

Let me map $Q_{\text{minimal}} = (A \cdot \overline{B}) + (B \cdot C \cdot \overline{D})$ onto a 16-cell K-Map grid with $AB$ on the rows and $CD$ on the columns:

* **Term 1**: $(A \cdot \overline{B}) \implies$ Covers all cells where $A=1, B=0$ (Row $AB=10$, all 4 columns: Cells 8, 9, 11, 10).
* **Term 2**: $(B \cdot C \cdot \overline{D}) \implies$ Covers all cells where $B=1, C=1, D=0$ (Rows $AB=01$ and $AB=11$, column $CD=10$: Cells 6 and 14).

```text
KARNAUGH MAP FOR Q_MINIMAL = (A·B') + (B·C·D')

           CD = 00   CD = 01   CD = 11   CD = 10
         ┌─────────┬─────────┬─────────┬─────────┐
 AB = 00 │    0    │    0    │    0    │    0    │
         ├─────────┼─────────┼─────────┼─────────┤
 AB = 01 │    0    │    0    │    0    │    1    │ ◄── Term 2 (Cell 6)
         ├─────────┼─────────┼─────────┼─────────┤
 AB = 11 │    0    │    0    │    0    │    1    │ ◄── Term 2 (Cell 14)
         ├─────────┼─────────┼─────────┼─────────┤
 AB = 10 │    1    │    1    │    1    │    1    │ ◄── Term 1 (Row 10)
         └─────────┴─────────┴─────────┴─────────┘
```

---

#### Step 2: Visual Hazard Diagnosis on the K-Map

Let us inspect the active $1$s on the K-map grid:
* **Loop 1** covers Term 1 $(A \cdot \overline{B})$: Cells 8, 9, 11, and 10 (entire bottom row $AB=10$).
* **Loop 2** covers Term 2 $(B \cdot C \cdot \overline{D})$: Cells 6 and 14 (vertical pair at column $CD=10$).

Look at **Cell 10 ($ABCD = 1010_2$)** and **Cell 14 ($ABCD = 1110_2$)**:
* Cell 10 contains a $1$ (part of Loop 1).
* Cell 14 contains a $1$ (part of Loop 2).
* Cell 10 and Cell 14 are **physically adjacent** on the grid! (They differ by only 1 bit: variable $B$ changes from $0$ to $1$).
* **CRITICAL FAULT**: Cell 10 is in Loop 1, while Cell 14 is in Loop 2. **There is no loop that covers both Cell 10 and Cell 14 together!**

```text
UNCOVERED ADJACENT CELL BOUNDARY

 Cell 10 (1010_2, Loop 1) ──[ Non-Overlapping Boundary ]──► Cell 14 (1110_2, Loop 2)
```

Transitioning between Cell 10 ($ABCD = 1010_2$) and Cell 14 ($ABCD = 1110_2$) means flipping variable $B$ while holding $A=1, C=1, D=0$. This is the exact transition identified by the plant auditors!

---

#### Step 3: Nanosecond Timing Derivation of the Glitch

Let us trace the physical logic gates during the transition from Cell 10 ($ABCD = 1010_2$) to Cell 14 ($ABCD = 1110_2$).

The physical circuit implementation of $Q = (A \cdot \overline{B}) + (B \cdot C \cdot \overline{D})$ contains:
* Inverter 1 (for $\overline{B}$): Delay $t_{\text{inv}} = 1.0 \text{ ns}$.
* Inverter 2 (for $\overline{D}$): Delay $t_{\text{inv}} = 1.0 \text{ ns}$.
* Gate 1 (2-input AND for $A \cdot \overline{B}$): Delay $t_{\text{and}} = 1.0 \text{ ns}$.
* Gate 2 (3-input AND for $B \cdot C \cdot \overline{D}$): Delay $t_{\text{and}} = 1.0 \text{ ns}$.
* Gate 3 (2-input OR combiner): Delay $t_{\text{or}} = 1.0 \text{ ns}$.

```text
PHYSICAL CIRCUIT LAYOUT AND PROPAGATION DELAYS

 Input B ──► [ NOT 1 (1.0ns) ] ──► B' ──┐
 Input A ───────────────────────────────┴──► [ AND 1 (1.0ns) ] ──┐
                                                                 ├──► [ OR 3 (1.0ns) ] ──► Q
 Input B ───────────────────────────────┐                        │
 Input C ───────────────────────────────┼──► [ AND 2 (1.0ns) ] ──┘
 Input D ──► [ NOT 2 (1.0ns) ] ──► D' ──┘
```

##### Steady State at Cell 10 ($A=1, B=0, C=1, D=0$):
* $\overline{B} = 1, \overline{D} = 1$.
* Gate 1 Output $(A \cdot \overline{B}) = 1 \cdot 1 = 1$.
* Gate 2 Output $(B \cdot C \cdot \overline{D}) = 0 \cdot 1 \cdot 1 = 0$.
* Gate 3 Output $Q = 1 + 0 = 1$. (Valve OPEN).

##### Dynamic Transition: Variable $B$ Flips from $0$ to $1$ at $t = 0.0 \text{ ns}$:
* **At $t = 0.0 \text{ ns}$**: Variable $B$ turns to $1$.
* **At $t = 0.0 \text{ ns}$**: Signal $B$ arrives instantly at Gate 2 input. Gate 2 now sees inputs ($B=1, C=1, \overline{D}=1$). Gate 2 begins switching, but needs $1.0 \text{ ns}$ delay!
* **At $t = 0.0 \text{ ns}$**: Signal $B$ arrives at NOT 1. Inverter begins switching to output $\overline{B}=0$, needing $1.0 \text{ ns}$ delay!
* **At $t = 1.0 \text{ ns}$**: NOT 1 output $\overline{B}$ finally drops to $0$. Gate 1 now sees $A=1, \overline{B}=0$. Gate 1 begins switching to output $0$, needing $1.0 \text{ ns}$ delay!
* **At $t = 1.0 \text{ ns}$**: Gate 2 finishes its $1.0 \text{ ns}$ delay and switches its output to $1$!
* **Wait! Look at Gate 1**: Gate 1 receives $\overline{B}=0$ at $t=1.0\text{ ns}$ and drops its output to $0$ at $t = 2.0 \text{ ns}$.
* **Look at Gate 2**: Gate 2 received $B=1$ at $t=0.0\text{ ns}$ and raised its output to $1$ at $t = 1.0 \text{ ns}$.

Notice the relative timing:
* Gate 2 rises to $1$ at $t = 1.0 \text{ ns}$.
* Gate 1 drops to $0$ at $t = 2.0 \text{ ns}$.
* Gate 2 turned ON *before* Gate 1 turned OFF! There is no glitch during $0 \to 1$ transition!

##### What about the Reverse Transition? Variable $B$ Flips from $1$ to $0$ (Cell 14 to Cell 10):
Let us trace $B$ switching from $1$ back to $0$ at $t = 0.0 \text{ ns}$:
* **At $t = 0.0 \text{ ns}$**: Variable $B$ drops to $0$.
* **At $t = 0.0 \text{ ns}$**: Signal $B=0$ arrives at Gate 2 input immediately. Gate 2 evaluates $0 \cdot 1 \cdot 1 = 0$. Gate 2 output will drop to $0$ at $t = 1.0 \text{ ns}$!
* **At $t = 0.0 \text{ ns}$**: Signal $B=0$ arrives at NOT 1. Inverter begins switching to $\overline{B}=1$, needing $1.0 \text{ ns}$ delay.
* **At $t = 1.0 \text{ ns}$**: Gate 2 output drops to $0$ (after its $1.0 \text{ ns}$ delay).
* **At $t = 1.0 \text{ ns}$**: NOT 1 output $\overline{B}$ finally rises to $1$. Gate 1 sees $A=1, \overline{B}=1$. Gate 1 begins switching to $1$, needing $1.0 \text{ ns}$ delay!
* **AT TIME $t = 1.0 \text{ ns}$ TO $t = 2.0 \text{ ns}$**:
  * Gate 2 Output = $0$ (dropped at $t = 1.0 \text{ ns}$).
  * Gate 1 Output = $0$ (still waiting, will rise at $t = 2.0 \text{ ns}$).
  * Gate 3 OR Gate receives $(0 + 0 = 0)$!
* **At $t = 2.0 \text{ ns}$**: Gate 3 OR gate outputs $Q = 0$!
* **At $t = 3.0 \text{ ns}$**: Gate 1 output rises to $1$. Gate 3 OR gate recovers $Q = 1$.

Between $t = 2.0 \text{ ns}$ and $t = 3.0 \text{ ns}$, Output $Q$ collapsed to $0$! 

The 1.0-nanosecond static-1 hazard predicted by our K-map analysis is **proven**!

---

#### Step 4: Synthesize the Redundant Hazard Cover Term

To eliminate the static-1 hazard between Cell 10 ($1010_2$) and Cell 14 ($1110_2$), we draw a new **2-cell vertical cover loop** that spans directly across Cell 10 and Cell 14!

```text
K-MAP WITH HAZARD COVER TERM ADDED

             CD = 10
  AB = 01 │     1     │ (Cell 6)
  AB = 11 │     1     │ (Cell 14) ──┐
  AB = 10 │     1     │ (Cell 10) ──┴──► DRAW NEW COVER LOOP (CELLS 14 AND 10)!
```

Let us extract the Boolean product term for this new 2-cell vertical group (Cells 10 and 14):
* **Variable $A$**: Rows involved are $AB=11$ and $AB=10$. $A = 1$ for both cells. **KEEP $A$**.
* **Variable $B$**: Rows involved are $AB=11$ and $AB=10$. $B$ changes ($1 \to 0$). **DISCARD $B$!**
* **Variable $C$**: Column index is $CD=10$. $C = 1$ for both cells. **KEEP $C$**.
* **Variable $D$**: Column index is $CD=10$. $D = 0$ for both cells. **KEEP $\overline{D}$**.

The redundant Hazard Cover Term is:

$$
\text{Hazard Cover Term} = A \cdot C \cdot \overline{D}
$$

---

#### Step 5: Derive the Complete Hazard-Free Boolean Equation

We add our new Hazard Cover Term $(A \cdot C \cdot \overline{D})$ into the original expression:

$$
Q_{\text{hazard-free}} = (A \cdot \overline{B}) + (B \cdot C \cdot \overline{D}) + (A \cdot C \cdot \overline{D})
$$

Where:
* $(A \cdot \overline{B})$ is Primary Gate 1.
* $(B \cdot C \cdot \overline{D})$ is Primary Gate 2.
* $(A \cdot C \cdot \overline{D})$ is Redundant Cover Gate 4.

```text
HAZARD-FREE COOLANT CONTROL SCHEMATIC

 Inputs A, B' ──────► [ AND Gate 1 ] ───────┐
                                            │
 Inputs B, C, D' ───► [ AND Gate 2 ] ───────┼──► [ OR Gate 4 ] ──► Quench Valve Q
                                            │    (GLITCH FREE!)
 Inputs A, C, D' ───► [ AND Gate 3 ] ───────┘
                      (Hazard Cover Gate)
```

---

### Sanity Check and Verification

Let us re-evaluate the reverse transition ($B: 1 \to 0$) with $A=1, C=1, D=0$ using our new hazard-free circuit:

When $A = 1, C = 1, D = 0$, Cover Gate 3 computes:

$$
\text{Gate 3 Output} = A \cdot C \cdot \overline{D} = 1 \cdot 1 \cdot \overline{0} = 1 \cdot 1 \cdot 1 = 1
$$

Notice that Cover Gate 3 does **NOT** depend on variable $B$ or Inverter 1! 

While Primary Gate 2 is turning OFF and Primary Gate 1 is waiting for the inverter delay, **Cover Gate 3 holds its output steady at $1$**, keeping the OR gate input high across the entire transition.

```text
GLITCH-FREE TRANSITION CHRONOLOGY WITH COVER TERM

 Time t = 1.0 ns to 2.0 ns (Transition Window):
   * Primary Gate 1 Output = 0  (Waiting for inverter delay)
   * Primary Gate 2 Output = 0  (Dropped)
   * Cover Gate 3 Output   = 1  (STEADY HIGH! Unaffected by B!)
   * Output Q = 0 + 0 + 1  = 1  <── NO GLITCH! VALVE STAYS OPEN!
```

The hydraulic water-hammer shockwave is completely eliminated. The nuclear reactor safety interlock is mathematically verified, hazard-free, and safe for plant operation.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Static Hazard**: A transient, unintended output voltage glitch ($1 \to 0 \to 1$ for Static-1, or $0 \to 1 \to 0$ for Static-0) that occurs in a combinational logic circuit when a single input variable flips state, caused by unequal signal propagation delays along parallel internal gate paths.
* **Hazard Cover Term**: A redundant prime implicant added to a Boolean expression that encloses adjacent, non-overlapping Karnaugh map loops, maintaining a steady logical state across gate transitions to eliminate static race conditions on critical control lines.
