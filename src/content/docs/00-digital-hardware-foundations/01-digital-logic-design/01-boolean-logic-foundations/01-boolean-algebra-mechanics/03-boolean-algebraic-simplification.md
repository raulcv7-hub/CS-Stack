---
title: "Boolean Algebraic Simplification: Minimizing Gate Count and Propagation Delay"
---

# Boolean Algebraic Simplification: Minimizing Gate Count and Propagation Delay

## The Financial, Thermal, and Speed Penalty of Unsimplified Hardware Logic

When you convert a truth table directly into a canonical Sum of Products (SOP) expression, you obtain a circuit that is guaranteed to work with absolute mathematical correctness. However, canonical circuits are almost always enormously bloated. A canonical expression for an 8-input system might require dozens of AND gates, each taking 8 physical inputs, feeding into a massive 128-input OR gate. 

If you build that raw canonical circuit in silicon, you pay three severe physical penalties:
1. **Financial Penalty**: Every physical logic gate takes up precious area on a silicon wafer. A larger circuit requires a larger silicon die, which costs significantly more money to manufacture and reduces the number of chips that can fit on a single wafer.
2. **Thermal and Power Penalty**: Every time a logic gate toggles its output between $0$ and $1$, it consumes electrical energy and dissipates heat. A circuit with 100 unnecessary gates wastes power and creates thermal hot spots that can destroy the chip.
3. **Speed and Propagation Delay Penalty**: Signals do not travel through physical logic gates instantly. Every gate introduces a microscopic time delay—known as **Propagation Delay** ($t_{pd}$)—as physical charge builds up or drains away. If a signal must pass through 6 layers of unsimplified gates instead of 2 layers of simplified gates, the maximum operating clock frequency of the entire computer processor is severely crippled.

```text
CANONICAL BLOAT VERSUS SIMPLIFIED LOGIC

 Canonical Circuit (Bloated)            Simplified Circuit (Optimal)
 ┌─────────┐                            ┌─────────┐
 │ 8-In AND├──┐                         │ 2-In AND├──► Output Y
 └─────────┘  │   ┌──────────┐          └─────────┘    (Identical Logic)
 ┌─────────┐  ├──►│ 128-In OR├──► Y     
 │ 8-In AND├──┤   └──────────┘          Lower Cost
 └─────────┘  │                         Lower Power
      :       │                         Higher Speed!
 ┌─────────┐  │
 │ 8-In AND├──┘
 └─────────┘
```

Consider a real-world scenario where a unsimplified safety circuit contains the expression $(A \cdot B) + (A \cdot \overline{B})$. In physical hardware, this canonical expression requires two 2-input AND gates, one inverter (NOT gate), and one 2-input OR gate—a total of four physical components. Yet, if you examine the logic closely, variable $B$ is completely irrelevant! Whether $B$ is $0$ or $1$, as long as $A$ is $1$, the output is $1$. The entire four-gate network can be replaced by a single piece of wire carrying signal $A$.

How do we systematically transform a bloated, multi-gate Boolean expression into its leanest, fastest, and cheapest physical gate equivalent without altering its logical function? We use **Boolean Algebraic Simplification**. By applying a rigorous set of algebraic laws—anchored by **De Morgan's Laws** and the **Consensus Theorem**—we can strip away redundant logic gates, reduce gate input counts, and flatten processing delays.

---

## The Highway Route Analogy: Trimming Redundant Checkpoints

To understand how Boolean simplification works without getting intimidated by algebraic symbols, let us imagine a toll highway system designed to verify whether a truck is authorized to enter a city.

Suppose the city traffic authority sets up a checkpoint system with three physical toll booths: Booth $A$, Booth $B$, and Booth $C$. The authority writes down a legal rule for truck drivers:

*"A truck is permitted to enter the city if (it passes Booth A AND passes Booth B) OR if (it passes Booth A AND FAILS Booth B) OR if (it passes Booth B AND passes Booth C)."*

```text
TOLL HIGHWAY CHECKPOINT PATHS

 Route Option 1:  [ Pass A ]  AND  [ Pass B ]  ──┐
                                                 ├──► CITY ENTRY
 Route Option 2:  [ Pass A ]  AND  [ Fail B ]  ──┤
                                                 │
 Route Option 3:  [ Pass B ]  AND  [ Pass C ]  ──┘
```

Look at what happens to a truck driver approaching this system:
* Suppose the truck passes Booth $A$. Does it matter whether it passes or fails Booth $B$? No! If it passes Booth $B$, Route Option 1 grants entry. If it fails Booth $B$, Route Option 2 grants entry. In both cases, simply passing Booth $A$ is enough to enter the city! Booth $B$ is a completely redundant checkpoint for any truck that has passed Booth $A$.
* Now look at Route Option 3: `[ Pass B ] AND [ Pass C ]`. If a truck passes Booth $A$ and Booth $B$, it is already allowed in by Route Option 1. If it fails Booth $A$ but passes Booth $B$ and Booth $C$, it enters through Route Option 3. But wait! Is Route Option 3 necessary if we already know how Booth $A$ and Booth $B$ behave together?

If the city traffic department hires an engineer to simplify this rule, the engineer tears down the redundant toll booths and rewrites the law into just two streamlined paths:

*"A truck is permitted to enter the city if (it passes Booth A) OR if (it passes Booth B AND passes Booth C)."*

```text
SIMPLIFIED HIGHWAY ROUTE

 Streamlined Option 1:  [ Pass A ]  ──────────────────┐
                                                      ├──► CITY ENTRY
 Streamlined Option 2:  [ Pass B ]  AND  [ Pass C ] ──┘
```

The simplified rule produces the exact same decisions for every truck in existence, but it eliminates an entire physical toll booth, reduces waiting lines, and saves thousands of dollars in operational costs.

This trimming of redundant route options is the exact mental model behind Boolean algebraic simplification.
* Combining `(Pass A AND Pass B) OR (Pass A AND Fail B)` into just `Pass A` is the **Rule of Complementarity and Absorption**.
* Recognizing that an overlapping third path is made completely redundant by the interaction of the first two paths is the **Consensus Theorem**.
* Converting complex negative rules into simple positive rules is **De Morgan's Laws**.

---

## Mechanics of Boolean Algebraic Simplification and Core Primitives

Boolean algebra is an algebraic system defined over a set of two discrete elements $\{0, 1\}$ using two fundamental binary operations—AND ($\cdot$) and OR ($+$)—and one unary operation—NOT ($\overline{\phantom{X}}$ or $'$).

Unlike standard high-school algebra where variables can represent any real number from negative infinity to positive infinity, Boolean variables are strictly binary:

$$
A \in \{0, 1\}
$$

Because variables can only ever be $0$ or $1$, Boolean algebra obeys a set of foundational postulates and theorems that have no direct equivalent in standard arithmetic.

---

### Fundamental Boolean Postulates and Single-Variable Axioms

Before we master our two advanced primitives (De Morgan's Laws and the Consensus Theorem), we must establish the fundamental algebraic identities that govern single variables. Every complex simplification is built from these elementary rules:

```text
FUNDAMENTAL BOOLEAN ALGEBRAIC AXIOMS

 Rule Name              AND Form (Product)          OR Form (Sum)
──────────────────────┼───────────────────────────┼───────────────────────────
 Identity Law         │  A * 1 = A                │  A + 0 = A
 Null (Annulment)     │  A * 0 = 0                │  A + 1 = 1
 Idempotent Law       │  A * A = A                │  A + A = A
 Complement Law       │  A * A' = 0               │  A + A' = 1
 Double Negation      │  (A')' = A                │  (A')' = A
 Commutative Law      │  A * B = B * A            │  A + B = B + A
 Associative Law      │  (A * B) * C = A * (B * C)│  (A + B) + C = A + (B + C)
 Distributive Law     │  A * (B + C) = AB + AC    │  A + (B * C) = (A+B)*(A+C)
 Absorption Law       │  A * (A + B) = A          │  A + (A * B) = A
 Elimination Law      │  A * (A' + B) = A * B     │  A + (A' * B) = A + B
```

Let us highlight three of these axioms that trip up beginners most frequently:

1. **The Distributive Law over Addition**: In standard real-number algebra, $A + (B \cdot C)$ cannot be expanded. In Boolean algebra, OR distributes over AND just as AND distributes over OR!
   $$A + (B \cdot C) = (A + B) \cdot (A + C)$$
2. **The Absorption Law**: $A + (A \cdot B) = A$. Why? If $A = 0$, then $0 + (0 \cdot B) = 0 + 0 = 0$. If $A = 1$, then $1 + (1 \cdot B) = 1 + 1 = 1$. The variable $B$ has zero influence on the outcome!
3. **The Elimination Law**: $A + (\overline{A} \cdot B) = A + B$. If $A = 1$, the expression is $1$. If $A = 0$, then $\overline{A} = 1$, so the expression becomes $0 + (1 \cdot B) = B$. Thus, $A + (\overline{A} \cdot B)$ behaves identically to $A + B$.

---

### Primitive 1: De Morgan's Laws

**De Morgan's Laws** are the most powerful transformation tools in digital logic engineering. Discovered by the mathematician Augustus De Morgan, these two laws define how to distribute a negation (NOT operation) over a combined AND or OR expression.

They allow engineers to convert AND operations into OR operations and vice versa, providing the mathematical foundation for converting circuits between NAND logic, NOR logic, SOP forms, and POS forms.

#### 1. Formal Statement of De Morgan's Laws

##### First Law (Negation of a Product / NAND Duality):
The complement of a logical AND product of two variables is equal to the logical OR sum of their individual complements.

$$
\overline{A \cdot B} = \overline{A} + \overline{B}
$$

Where:
* $A$ and $B$ are binary input variables.
* $\overline{A \cdot B}$ is the negation of the AND product (a NAND operation).
* $\overline{A} + \overline{B}$ is the OR sum of inverted variables.

##### Second Law (Negation of a Sum / NOR Duality):
The complement of a logical OR sum of two variables is equal to the logical AND product of their individual complements.

$$
\overline{A + B} = \overline{A} \cdot \overline{B}
$$

Where:
* $A$ and $B$ are binary input variables.
* $\overline{A + B}$ is the negation of the OR sum (a NOR operation).
* $\overline{A} \cdot \overline{B}$ is the AND product of inverted variables.

```text
DE MORGAN'S LAWS VISUAL SUMMARY

 First Law (NAND to Inverted-OR):
   [ NOT over (A AND B) ]   ──► EQUIVALENT TO ──►   [ (NOT A) OR (NOT B) ]

 Second Law (NOR to Inverted-AND):
   [ NOT over (A OR B) ]    ──► EQUIVALENT TO ──►   [ (NOT A) AND (NOT B) ]
```

#### 2. The Informal Memory Rule: "Break the Line, Change the Sign"

To apply De Morgan's Laws to complex multi-variable expressions without making algebraic errors, digital engineers use a simple procedural rule:

1. **Break the overarching negation line** (the bar over the expression).
2. **Change the operation sign** directly beneath where the break occurred (change AND $\cdot$ to OR $+$, or change OR $+$ to AND $\cdot$).

```text
PROCEDURAL DEMORGAN TRANSFORMATION

 Initial Expression:          Overarching Bar:   ─────────────
                              Operation:         A  *  B  *  C

 Step 1: Break the Bar ──►    Individual Bars:   ─  ─  ─  ─  ─
                              Operation:         A  *  B  *  C

                                                 ─     ─     ─
 Step 2: Change Sign   ──►    Final Result:      A  +  B  +  C  =  A' +  B' +  C'                         
```

Let us apply "Break the Line, Change the Sign" to a 3-variable NOR function $\overline{A + B + C}$:
$$\overline{A + B + C} = \overline{A} \cdot \overline{B} \cdot \overline{C}$$

Now let us apply it to a nested complex expression $\overline{(A \cdot B) + (C \cdot D)}$:
$$\overline{(A \cdot B) + (C \cdot D)} = \overline{(A \cdot B)} \cdot \overline{(C \cdot D)}$$

Applying De Morgan's First Law to each individual term:
$$\overline{(A \cdot B)} \cdot \overline{(C \cdot D)} = (\overline{A} + \overline{B}) \cdot (\overline{C} + \overline{D})$$

Look at what we achieved: we transformed an inverted Sum of Products into a clean Product of Sums (POS) using two simple algebraic steps!

#### 3. Rigorous Proof of De Morgan's First Law via Truth Table Exhaustion

To prove beyond any doubt that $\overline{A \cdot B} = \overline{A} + \overline{B}$, we construct an exhaustive truth table evaluating both sides of the equation across all $2^2 = 4$ possible states of inputs $A$ and $B$:

```text
TRUTH TABLE PROOF OF DE MORGAN'S FIRST LAW

 Row │ A │ B │ A * B │ NOT(A * B) │ A' │ B' │ A' + B' │ Column Equality Check
─────┼───┼───┼───────┼────────────┼────┼────┼─────────┼─────────────────────────────────────────────
  0  │ 0 │ 0 │   0   │     1      │ 1  │ 1  │    1    │ Col 4 (1) == Col 7 (1)  [MATCH!]
  1  │ 0 │ 1 │   0   │     1      │ 1  │ 0  │    1    │ Col 4 (1) == Col 7 (1)  [MATCH!]
  2  │ 1 │ 0 │   0   │     1      │ 0  │ 1  │    1    │ Col 4 (1) == Col 7 (1)  [MATCH!]
  3  │ 1 │ 1 │   1   │     0      │ 0  │ 0  │    0    │ Col 4 (0) == Col 7 (0)  [MATCH!]
```

Column 4 ($\overline{A \cdot B}$) and Column 7 ($\overline{A} + \overline{B}$) are identical for every single row. The equivalence is absolute.

#### 4. Gate Duality: Converting NAND/NOR Networks

De Morgan's Laws prove that a **NAND gate** (an AND gate followed by an inverter) is logically identical to an **Inverted-Input OR gate** (an OR gate whose inputs are individually inverted).

Similarly, a **NOR gate** (an OR gate followed by an inverter) is logically identical to an **Inverted-Input AND gate**.

```text
LOGIC GATE DUALITIES VIA DE MORGAN

 NAND Gate Duality:
   [ A, B ] ──► [ NAND Gate ] ──► Y   ===   [ A', B' ] ──► [ OR Gate ] ──► Y

 NOR Gate Duality:
   [ A, B ] ──► [ NOR Gate  ] ──► Y   ===   [ A', B' ] ──► [ AND Gate ] ──► Y
```

This duality is the cornerstone of modern silicon design. Microprocessor fabrication facilities heavily favor NAND and NOR gates over basic AND and OR gates because NAND/NOR structures are physically smaller, faster, and consume less power in CMOS silicon. De Morgan's Laws allow engineers to instantly convert standard SOP AND-OR circuits into pure NAND-NAND networks without altering the underlying logic.

---

### Primitive 2: The Consensus Theorem

While De Morgan's Laws deal with negations and operational dualities, the **Consensus Theorem** deals with hidden redundancies across multiple product or sum terms.

The Consensus Theorem allows an engineer to look at a multi-term Boolean expression and immediately identify a term that is completely redundant—meaning it can be erased from the equation without changing the output for any input state!

#### 1. Formal Statement of the Consensus Theorem

##### Sum of Products (SOP) Form:
In a Boolean expression containing three product terms of the form $A \cdot B + \overline{A} \cdot C + B \cdot C$, the term $B \cdot C$ is redundant and can be eliminated:

$$
A \cdot B + \overline{A} \cdot C + B \cdot C = A \cdot B + \overline{A} \cdot C
$$

Where:
* $A$ is the variable that appears in both uncomplemented ($A$) and complemented ($\overline{A}$) form across two terms.
* $B$ is the variable associated with $A$.
* $C$ is the variable associated with $\overline{A}$.
* $B \cdot C$ is the **Consensus Term** formed by multiplying the remaining variables associated with $A$ and $\overline{A}$.

##### Product of Sums (POS) Dual Form:
In a Boolean expression containing three sum terms of the form $(A + B) \cdot (\overline{A} + C) \cdot (B + C)$, the term $(B + C)$ is redundant and can be eliminated:

$$
(A + B) \cdot (\overline{A} + C) \cdot (B + C) = (A + B) \cdot (\overline{A} + C)
$$

Where:
* $(B + C)$ is the consensus sum term.

#### 2. Intuitive Breakdown: Why is the Consensus Term Redundant?

Why does the term $B \cdot C$ disappear? Let us analyze the system using case-by-case reasoning on the variable $A$:

```text
CASE-BY-CASE ANALYSIS OF THE CONSENSUS THEOREM

 Expression: Y = (A * B) + (A' * C) + (B * C)

 CASE 1: Assume A = 1
   Substitute A = 1 into expression:
   Y = (1 * B) + (0 * C) + (B * C)
   Y = B + 0 + (B * C)
   Y = B + (B * C)              <── Apply Absorption Law: B + BC = B!
   Y = B

   Notice that when A = 1, the term (A * B) evaluates to B.
   The consensus term (B * C) is absorbed by B!

 CASE 2: Assume A = 0
   Substitute A = 0 into expression:
   Y = (0 * B) + (1 * C) + (B * C)
   Y = 0 + C + (B * C)
   Y = C + (B * C)              <── Apply Absorption Law: C + BC = C!
   Y = C

   Notice that when A = 0, the term (A' * C) evaluates to C.
   The consensus term (B * C) is absorbed by C!
```

Conclusion:
* When $A = 1$, the output is governed entirely by $B$. The term $B \cdot C$ does not matter.
* When $A = 0$, the output is governed entirely by $C$. The term $B \cdot C$ does not matter.

In all possible universes, the term $B \cdot C$ is completely redundant! It adds physical logic gates to the circuit without contributing a single bit of useful work.

#### 3. Rigorous Algebraic Proof of the Consensus Theorem

We can prove the Consensus Theorem algebraically using fundamental Boolean axioms (Identity, Complement, and Distributive Laws):

Start with the left-hand side (LHS):
$$LHS = A \cdot B + \overline{A} \cdot C + B \cdot C$$

**Step 1**: Multiply the consensus term $B \cdot C$ by $1$ (Identity Law, since $X \cdot 1 = X$):
$$LHS = A \cdot B + \overline{A} \cdot C + B \cdot C \cdot (1)$$

**Step 2**: Substitute $1 = (A + \overline{A})$ using the Complement Law ($X + \overline{X} = 1$):
$$LHS = A \cdot B + \overline{A} \cdot C + B \cdot C \cdot (A + \overline{A})$$

**Step 3**: Expand $B \cdot C \cdot (A + \overline{A})$ using the Distributive Law:
$$LHS = A \cdot B + \overline{A} \cdot C + (A \cdot B \cdot C) + (\overline{A} \cdot B \cdot C)$$

**Step 4**: Regroup terms using Commutative and Associative Laws to bring similar variables together:
$$LHS = [A \cdot B + (A \cdot B \cdot C)] + [\overline{A} \cdot C + (\overline{A} \cdot B \cdot C)]$$

**Step 5**: Factor out $(A \cdot B)$ from the first group, and $(\overline{A} \cdot C)$ from the second group:
$$LHS = A \cdot B \cdot (1 + C) + \overline{A} \cdot C \cdot (1 + B)$$

**Step 6**: Apply the Null (Annulment) Law ($1 + X = 1$):
$$LHS = A \cdot B \cdot (1) + \overline{A} \cdot C \cdot (1)$$

**Step 7**: Apply the Identity Law ($X \cdot 1 = X$):
$$LHS = A \cdot B + \overline{A} \cdot C = RHS$$

The algebraic proof is complete. By adding $(A + \overline{A})$ and expanding, we proved that the consensus term $B \cdot C$ dissolves entirely into the surrounding terms.

---

## Engineering Reality: Trade-offs, Glitches, and Dynamic Hazards

In pure mathematics, erasing a redundant term like $B \cdot C$ via the Consensus Theorem is always a victory because it reduces gate count. In physical computer engineering, however, there are critical real-world edge cases where erasing a consensus term can cause a circuit to fail!

### 1. Static Hazards and Glitches in Physical Circuits

A **Static Hazard** is a temporary, unwanted voltage spike (a "glitch") that occurs on a circuit's output line when a single input variable changes state.

Consider our simplified Consensus circuit $Y = (A \cdot B) + (\overline{A} \cdot C)$. 

Suppose inputs are currently set to $B = 1$ and $C = 1$. The output equation becomes:
$$Y = (A \cdot 1) + (\overline{A} \cdot 1) = A + \overline{A} = 1$$

Mathematically, the output $Y$ should stay rock-solid at $1$ regardless of whether $A$ is $0$ or $1$.

Now imagine the input $A$ switches from $1$ to $0$. 
In physical silicon, the signal $A$ travels directly to the first AND gate, while it must pass through an inverter (NOT gate) to become $\overline{A}$ before reaching the second AND gate. The inverter introduces a propagation delay $t_{\text{inv}} = 0.5 \text{ ns}$.

```text
TIMING MISALIGNMENT CAUSING A STATIC-1 HAZARD

 Time t = 0.0 ns:  A = 1. Gate 1 (A*B) is 1. Gate 2 (A'*C) is 0. Output Y = 1.
 Time t = 0.1 ns:  A switches to 0. Gate 1 immediately drops to 0!
                   BUT A' has NOT arrived at Gate 2 yet (Inverter Delay!).
                   Gate 2 is STILL 0!
                   Output Y = 0 + 0 = 0 !!! <── UNINTENDED GLITCH!
 Time t = 0.5 ns:  A' finally arrives at Gate 2. Gate 2 turns to 1.
                   Output Y recovers to 1.
```

For a brief window of $0.5 \text{ ns}$, both AND gates output $0$, causing the output $Y$ to drop to $0$ when it should have stayed at $1$! This momentary drop to $0$ is a **Static-1 Hazard**.

```text
STATIC-1 HAZARD TIMING WAVEFORM

 Signal A :  11111111111110000000000000000
                          │
                          ▼
 Output Y :  11111111111110001111111111111
                          ▲
                          │
                  UNINTENDED GLITCH (0)
```

If this output $Y$ is connected to the clock or write-enable pin of a memory register, that $0.5 \text{ ns}$ glitch can permanently corrupt stored data in a computer!

### 2. The Solution: Re-injecting the Consensus Term!

How do digital engineers eliminate this dangerous glitch? **By deliberately adding the Consensus Term $B \cdot C$ back into the circuit!**

If we build the circuit as $Y = (A \cdot B) + (\overline{A} \cdot C) + (B \cdot C)$:
When $B = 1$ and $C = 1$, the consensus term $B \cdot C$ evaluates to $1 \cdot 1 = 1$, independent of variable $A$ or any inverter delays!

```text
GLITCH-FREE CIRCUIT WITH CONSENSUS COVER TERM

 Inputs (B=1, C=1) ──► [ Consensus Gate: B * C ] ──► Output = 1 (ALWAYS HELD HIGH)
                       (Holds Y = 1 steady during A's transition)
```

The third gate acts as a "hazard cover" that holds the output high while signal $A$ is transitioning through the inverter.

**The Engineering Trade-off**:
* **For Minimal Area and Low Power**: Eliminate consensus terms to minimize gate count.
* **For High Reliability and Glitch-Free Operations**: Retain consensus terms to cover transition hazards in critical control lines.

---

## Solved Industrial Engineering Exercise: Avionics Fuel Management Unit

To master Boolean simplification, De Morgan's Laws, the Consensus Theorem, and gate delay analysis, we will solve a comprehensive, step-by-step avionics engineering problem.

---

### Scenario and Parameters

An aerospace defense contractor is designing the automatic safety valve controller for a jet engine's auxiliary fuel line ($F$). The system receives inputs from four onboard digital sensors:

1. **Main Tank Pressure Sensor ($A$)**:
   * $A = 0$: Main tank pressure normal.
   * $A = 1$: Main tank pressure dangerously high.
2. **Auxiliary Pump Switch ($B$)**:
   * $B = 0$: Auxiliary pump OFF.
   * $B = 1$: Auxiliary pump ON.
3. **Crossfeed Valve Lever ($C$)**:
   * $C = 0$: Crossfeed valve closed.
   * $C = 1$: Crossfeed valve open.
4. **Fire Suppression Signal ($D$)**:
   * $D = 0$: Fire suppression system inactive.
   * $D = 1$: Fire suppression system active (FIRE DETECTED!).

```text
JET ENGINE FUEL MANAGEMENT CONTROLLER

 Sensor Inputs (A, B, C, D) ──► [ Fuel Valve Safety Logic ] ──► Fuel Valve Actuator (F)
```

#### Raw Canonical SOP Specification

The junior avionics team derived the initial raw unsimplified Sum of Products expression for the fuel valve actuator $F$ from an exhaustive 16-row flight specification truth table:

$$
F = (\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) + (\overline{A} \cdot B \cdot C \cdot \overline{D}) + (A \cdot B \cdot \overline{C} \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D}) + (B \cdot C \cdot \overline{D})
$$

Where:
* $F$ is the binary control output ($F=1$ opens the fuel line, $F=0$ closes it).
* $A, B, C, D$ are the four binary flight sensors.

#### Your Objective

1. Calculate the initial physical component count (AND gates, OR gates, Inverters) and maximum gate propagation levels required to implement the raw expression $F$.
2. Apply Boolean algebraic axioms and the Consensus Theorem to simplify expression $F$ into its minimal SOP form.
3. Apply De Morgan's Laws to convert the simplified SOP expression into an equivalent all-NAND implementation suitable for radiation-hardened CMOS fabrication.
4. Compare the initial and final circuits in terms of gate count, total inputs (fan-in load), and processing latency.

---

### Step-by-Step Derivation

#### Step 1: Analyze the Raw Unsimplified Expression

The raw expression is:
$$F = (\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) + (\overline{A} \cdot B \cdot C \cdot \overline{D}) + (A \cdot B \cdot \overline{C} \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D}) + (B \cdot C \cdot \overline{D})$$

Let us count the physical components needed to implement this raw formula directly:
* **Term 1**: $(\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) \to$ Requires one 4-input AND gate.
* **Term 2**: $(\overline{A} \cdot B \cdot C \cdot \overline{D}) \to$ Requires one 4-input AND gate.
* **Term 3**: $(A \cdot B \cdot \overline{C} \cdot \overline{D}) \to$ Requires one 4-input AND gate.
* **Term 4**: $(A \cdot \overline{B} \cdot C \cdot \overline{D}) \to$ Requires one 4-input AND gate.
* **Term 5**: $(B \cdot C \cdot \overline{D}) \to$ Requires one 3-input AND gate.
* **Level 2 Combiner**: One 5-input OR gate to combine the 5 product terms.
* **Inverters**: All 4 variables appear in inverted form ($\overline{A}, \overline{B}, \overline{C}, \overline{D}$), requiring 4 NOT gates.

```text
RAW COMPONENT SUMMARY
* Inverters (NOT gates): 4
* Level-1 AND gates: 4 (4-input) + 1 (3-input) = 5 gates
* Level-2 OR gate: 1 (5-input)
* TOTAL GATE COUNT = 10 physical gates
* TOTAL GATE INPUTS (Fan-in sum) = 4 + (4*4 + 3) + 5 = 28 input pins
```

---

#### Step 2: Algebraic Simplification using Boolean Axioms and Consensus

Let us simplify $F$ step by step, explicitly stating every axiom used.

Raw Expression:
$$F = (\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) + (\overline{A} \cdot B \cdot C \cdot \overline{D}) + (A \cdot B \cdot \overline{C} \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D}) + (B \cdot C \cdot \overline{D})$$

##### Grouping 1: Combine Terms 1 and 2
Look at Term 1 $(\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D})$ and Term 2 $(\overline{A} \cdot B \cdot C \cdot \overline{D})$.
Factor out common variables $(\overline{A} \cdot B \cdot \overline{D})$ using the Distributive Law:

$$(\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) + (\overline{A} \cdot B \cdot C \cdot \overline{D}) = \overline{A} \cdot B \cdot \overline{D} \cdot (\overline{C} + C)$$

Apply Complement Law ($\overline{C} + C = 1$) and Identity Law ($X \cdot 1 = X$):

$$\overline{A} \cdot B \cdot \overline{D} \cdot (1) = \overline{A} \cdot B \cdot \overline{D}$$

Our expression now becomes:
$$F = (\overline{A} \cdot B \cdot \overline{D}) + (A \cdot B \cdot \overline{C} \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D}) + (B \cdot C \cdot \overline{D})$$

##### Grouping 2: Combine $(\overline{A} \cdot B \cdot \overline{D})$ with $(A \cdot B \cdot \overline{C} \cdot \overline{D})$
Look at the new term $(\overline{A} \cdot B \cdot \overline{D})$ and Term 3 $(A \cdot B \cdot \overline{C} \cdot \overline{D})$.
Factor out common variables $(B \cdot \overline{D})$:

$$(\overline{A} \cdot B \cdot \overline{D}) + (A \cdot B \cdot \overline{C} \cdot \overline{D}) = B \cdot \overline{D} \cdot [\overline{A} + (A \cdot \overline{C})]$$

Apply Elimination Law: $\overline{A} + (A \cdot \overline{C}) = \overline{A} + \overline{C}$.

$$= B \cdot \overline{D} \cdot (\overline{A} + \overline{C}) = (\overline{A} \cdot B \cdot \overline{D}) + (B \cdot \overline{C} \cdot \overline{D})$$

Our expression now becomes:
$$F = (\overline{A} \cdot B \cdot \overline{D}) + (B \cdot \overline{C} \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D}) + (B \cdot C \cdot \overline{D})$$

##### Grouping 3: Combine $(B \cdot \overline{C} \cdot \overline{D})$ with $(B \cdot C \cdot \overline{D})$
Look at term $(B \cdot \overline{C} \cdot \overline{D})$ and Term 5 $(B \cdot C \cdot \overline{D})$.
Factor out $(B \cdot \overline{D})$:

$$(B \cdot \overline{C} \cdot \overline{D}) + (B \cdot C \cdot \overline{D}) = B \cdot \overline{D} \cdot (\overline{C} + C) = B \cdot \overline{D} \cdot (1) = B \cdot \overline{D}$$

Our expression now simplifies to:
$$F = (\overline{A} \cdot B \cdot \overline{D}) + (B \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D})$$

##### Grouping 4: Apply Absorption Law
Look at the terms $(\overline{A} \cdot B \cdot \overline{D}) + (B \cdot \overline{D})$.
By the Absorption Law ($X + X \cdot Y = X$), letting $X = B \cdot \overline{D}$ and $Y = \overline{A}$:

$$(B \cdot \overline{D}) + (\overline{A} \cdot B \cdot \overline{D}) = B \cdot \overline{D}$$

The term $(\overline{A} \cdot B \cdot \overline{D})$ is absorbed entirely!

Our expression is now reduced to:
$$F = (B \cdot \overline{D}) + (A \cdot \overline{B} \cdot C \cdot \overline{D})$$

##### Grouping 5: Apply Distributive and Elimination Laws
Factor out $\overline{D}$ from both terms:
$$F = \overline{D} \cdot [B + (A \cdot \overline{B} \cdot C)]$$

Apply the Elimination Law inside the brackets: $B + (\overline{B} \cdot A \cdot C) = B + (A \cdot C)$.

$$F = \overline{D} \cdot [B + (A \cdot C)]$$

Distribute $\overline{D}$ back into the expression:

$$F = (B \cdot \overline{D}) + (A \cdot C \cdot \overline{D})$$

##### Checking for Consensus Redundancy
Let us check if the Consensus Theorem applies to $F = (B \cdot \overline{D}) + (A \cdot C \cdot \overline{D})$.
Both terms contain $\overline{D}$. There are no opposing pairs ($X$ and $\overline{X}$). Thus, this expression is in **minimal Sum of Products form**.

$$\text{Simplified SOP: } F = (B \cdot \overline{D}) + (A \cdot C \cdot \overline{D})$$

---

#### Step 3: De Morgan Transformation to All-NAND Logic

Fabrication facilities require converting this simplified SOP into a **pure NAND-NAND circuit** for radiation-hardened space deployment.

Start with the simplified SOP expression:
$$F = (B \cdot \overline{D}) + (A \cdot C \cdot \overline{D})$$

Apply **Double Negation** ($X = \overline{\overline{X}}$) over the entire expression:

$$F = \overline{\overline{(B \cdot \overline{D}) + (A \cdot C \cdot \overline{D})}}$$

Apply **De Morgan's Second Law** ($\overline{X + Y} = \overline{X} \cdot \overline{Y}$) to the inner negation bar:

$$F = \overline{\overline{(B \cdot \overline{D})} \cdot \overline{(A \cdot C \cdot \overline{D})}}$$

Look at this magnificent equation:
1. $\overline{(B \cdot \overline{D})}$ is a 2-input NAND gate.
2. $\overline{(A \cdot C \cdot \overline{D})}$ is a 3-input NAND gate.
3. The overarching outer bar $\overline{[\dots \cdot \dots]}$ is a 2-input NAND gate that combines the two terms!

The entire circuit is now implemented using **only NAND gates**!

```text
ALL-NAND CIRCUIT IMPLEMENTATION

 Level 1 NAND Gates              Level 2 NAND Gate
 ┌────────────────┐
 │ NAND (B, D')   ├─────────────────┐
 └────────────────┘                 │
                                    ▼
 ┌────────────────┐              ┌──────┐
 │ NAND (A, C, D')├─────────────►│ NAND ├──► Output F
 └────────────────┘              └──────┘
```

---

#### Step 4: Quantitative Engineering Comparison

Let us compare the raw canonical circuit against our simplified all-NAND circuit:

```text
QUANTITATIVE HARDWARE OPTIMIZATION SUMMARY

 Engineering Metric       │ Raw Canonical Circuit │ Simplified NAND Circuit │ Improvement (%)
──────────────────────────┼───────────────────────┼─────────────────────────┼─────────────────
 Inverters (NOT gates)    │           4           │            1 (only D')  │  75.0% Reduction
 Level-1 Gates            │ 5 AND gates           │ 2 NAND gates            │  60.0% Reduction
 Level-2 Gates            │ 1 OR gate (5-input)   │ 1 NAND gate (2-input)   │  80.0% Pin Red.
 Total Physical Gates     │ 10 gates              │ 4 gates                 │  60.0% Reduction
 Total Input Pin Load     │ 28 pins               │ 8 pins                  │  71.4% Reduction
 Max Gate Delay Levels    │ 3 levels (NOT+AND+OR) │ 2 levels (NOT+NAND)     │  33.3% Faster!
```

By applying Boolean simplification, De Morgan's Laws, and algebraic reduction:
* We eliminated **6 out of 10 physical gates** (a $60\%$ reduction in silicon die area).
* We reduced total input pin connections from **28 to 8** (a $71.4\%$ reduction in wiring complexity and power consumption).
* We reduced propagation delay levels from **3 to 2**, increasing the maximum operating clock frequency of the fuel unit by **$33.3\%$**!

---

### Sanity Check and Verification

To verify that our simplified all-NAND formula $F = \overline{\overline{(B \cdot \overline{D})} \cdot \overline{(A \cdot C \cdot \overline{D})}}$ is 100% identical to the raw canonical specification, let us test three critical flight scenarios:

#### Scenario 1: Engine Fire Detected ($D = 1$)
* **Sensors**: $D = 1$. $\overline{D} = 0$.
* **Raw Specification Check**: Every term in the raw specification contains $\overline{D}$. Since $\overline{D} = 0$, every term is $0$. Output $F = 0$ (Fuel valve closes immediately to extinguish fire).
* **Simplified NAND Evaluation**:
  * Level 1 Gate 1: $\overline{B \cdot 0} = \overline{0} = 1$.
  * Level 1 Gate 2: $\overline{A \cdot C \cdot 0} = \overline{0} = 1$.
  * Level 2 Gate: $\overline{1 \cdot 1} = \overline{1} = 0$.
  * Output $F = 0$. **MATCH!**

#### Scenario 2: Main Tank Pressure High, Crossfeed Open, Fire Normal ($A=1, B=0, C=1, D=0$)
* **Sensors**: $A=1, B=0, C=1, D=0$.
* **Raw Specification Check**:
  * Term 4 in raw expression: $(A \cdot \overline{B} \cdot C \cdot \overline{D}) = (1 \cdot 1 \cdot 1 \cdot 1) = 1$.
  * Output $F = 1$.
* **Simplified NAND Evaluation**:
  * Level 1 Gate 1: $\overline{B \cdot \overline{D}} = \overline{0 \cdot 1} = \overline{0} = 1$.
  * Level 1 Gate 2: $\overline{A \cdot C \cdot \overline{D}} = \overline{1 \cdot 1 \cdot 1} = \overline{1} = 0$.
  * Level 2 Gate: $\overline{1 \cdot 0} = \overline{0} = 1$.
  * Output $F = 1$. **MATCH!**

#### Scenario 3: Auxiliary Pump ON, Fire Normal ($A=0, B=1, C=0, D=0$)
* **Sensors**: $A=0, B=1, C=0, D=0$.
* **Raw Specification Check**:
  * Term 1 in raw expression: $(\overline{A} \cdot B \cdot \overline{C} \cdot \overline{D}) = (1 \cdot 1 \cdot 1 \cdot 1) = 1$.
  * Output $F = 1$.
* **Simplified NAND Evaluation**:
  * Level 1 Gate 1: $\overline{B \cdot \overline{D}} = \overline{1 \cdot 1} = \overline{1} = 0$.
  * Level 1 Gate 2: $\overline{A \cdot C \cdot \overline{D}} = \overline{0 \cdot 0 \cdot 1} = \overline{0} = 1$.
  * Level 2 Gate: $\overline{0 \cdot 1} = \overline{0} = 1$.
  * Output $F = 1$. **MATCH!**

The simplified all-NAND circuit is mathematically flawless, physically minimal, and fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **De Morgan's Laws**: The algebraic identities $\overline{A \cdot B} = \overline{A} + \overline{B}$ and $\overline{A + B} = \overline{A} \cdot \overline{B}$ that govern the distribution of negation over logical products and sums, enabling functional duality and transformation between NAND and NOR logic networks.
* **Consensus Theorem**: The reduction theorem stating that $A \cdot B + \overline{A} \cdot C + B \cdot C = A \cdot B + \overline{A} \cdot C$, proving that the consensus term $B \cdot C$ is algebraically redundant and can be removed to reduce gate count or deliberately retained as a hazard cover to prevent static output glitches.
