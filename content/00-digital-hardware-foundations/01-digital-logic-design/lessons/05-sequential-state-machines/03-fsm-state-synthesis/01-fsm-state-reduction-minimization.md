# FSM State Reduction and Implication Table Minimization Mechanics

## The Silicon Penalty of Redundant Sequential States

When human engineers specify finite state machines (FSMs) for complex controllers—such as vending machines, industrial conveyor sorters, or telecommunication packet decoders—they naturally create redundant, duplicate states. As a human designer thinks through various operational scenarios, they often create separate state nodes to represent different historical paths that ultimately perform the exact same future actions and produce the exact same sequence of outputs.

In combinational logic, a redundant product term wastes a few logic gates. In sequential logic, however, a redundant state inflicts a severe, exponential physical penalty on hardware layout: **crossing a power-of-two state threshold forces the physical addition of an entire extra state flip-flop**.

The number of binary flip-flops $N$ required to store $K$ discrete system states is governed by the ceiling logarithm relationship:

$$
N = \lceil \log_2 K \rceil
$$

Where:
* $N$ is the number of physical flip-flops in the state register.
* $K$ is the number of states in the state transition diagram.
* $\lceil \dots \rceil$ represents the ceiling function, rounding up to the next integer.

```text
FLIP-FLOP CAPACITY THRESHOLD STEP-FUNCTION

 State Capacity Range │ Required Flip-Flops (N) │ Hardware Impact
──────────────────────┼─────────────────────────┼───────────────────────────
   1 to 2 States      │      1 Flip-Flop        │ Minimal Register Size
   3 to 4 States      │      2 Flip-Flops       │ Compact Control Logic
   5 to 8 States      │      3 Flip-Flops       │ 50% REGISTER EXPANSION!
   9 to 16 States     │      4 Flip-Flops       │ 33% REGISTER EXPANSION!
```

Look closely at the threshold between 4 states and 5 states in this table:
* An FSM with **4 states** requires $N = \lceil \log_2 4 \rceil = 2$ flip-flops.
* An FSM with **5 states** requires $N = \lceil \log_2 5 \rceil = 3$ flip-flops.

If a human engineer specifies a 5-state machine that contains just **one single redundant state**, that single duplicate state forces the hardware designer to instantiate a 3rd flip-flop in the state register! 

Adding a 3rd flip-flop does not merely add one storage cell. It adds a 3rd bit variable ($Q_2$) to every single next-state logic equation and every output decoder gate across the entire chip. It increases gate fan-in, inflates combinational logic die area by $50\%$, and adds routing trace congestion to the clock distribution tree.

```text
THE REDUNDANT STATE HARDWARE PENALTY

 5-State Machine (Un-Reduced)           4-State Machine (Reduced)
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ 3 State Flip-Flops (Q2..0)│          │ 2 State Flip-Flops (Q1..0)│
 │ Complex 3-Variable Logic  │          │ Lean 2-Variable Logic     │
 └───────────────────────────┘          └───────────────────────────┘
   1 Redundant State Present!              Redundant State ELIMINATED!
   (50% More Gates & Wiring)               (Saved 1 FF & 33% Gate Area)
```

How do we systematically analyze an un-reduced state machine, detect duplicate states that perform identical future work, and collapse them down to their absolute minimal state count without altering the system's external behavior by a single bit?

We use **Equivalent State Analysis** and the **State Reduction Table (Implication Table)** algorithm. By transforming state reduction into a rigorous, tabular elimination matrix, we can strip away duplicate states, cross power-of-two flip-flop boundaries, and minimize sequential hardware layout.

---

## The Hotel Reception Desk: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of state equivalence before diving into matrix algorithms, let us picture two customer service desks in a hotel lobby.

Imagine entering a hotel lobby that has two reception desks side by side: **Desk A** and **Desk B**.

```text
THE HOTEL RECEPTION DESK REDUNDANCY

         [ Hotel Guest Arrives with Request ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [ Desk A ]                        [ Desk B ]
```

You watch how Desk A and Desk B process guest requests:

1. **Guest Request 1 ("I want to check in")**:
   * Desk A takes your credit card, hands you Room Key 201, and directs you to Elevator 1.
   * Desk B takes your credit card, hands you Room Key 201, and directs you to Elevator 1.
2. **Guest Request 2 ("I need extra towels")**:
   * Desk A calls Housekeeping, issues Confirmation Ticket 5, and asks you to wait in the lobby.
   * Desk B calls Housekeeping, issues Confirmation Ticket 5, and asks you to wait in the lobby.
3. **Guest Request 3 ("Where is the dining room?")**:
   * Desk A points to the left corridor and hands you a breakfast menu.
   * Desk B points to the left corridor and hands you a breakfast menu.

Now ask yourself a simple common-sense question: **Is there any functional difference between Desk A and Desk B?**

None whatsoever! For every possible request a guest can present, Desk A and Desk B produce the exact same physical outputs (handing over the same room keys, issuing the same tickets) and transition you to the exact same future stage of your stay.

Having two separate reception desks doing the exact same thing wastes lobby floor space, requires paying two staff salaries, and complicates hotel operations. The hotel manager can simply **close Desk B and merge its duties into Desk A**!

```text
DESK MERGING ELIMINATES REDUNDANCY

 [ Desk A ] + [ Desk B ]  ──► MERGED INTO ──► [ Single Desk A ]
                                              (100% Identical Service,
                                               50% Less Floor Space!)
```

This merging of identical reception desks is the exact mental model behind **State Reduction**:
* Desk A and Desk B are **Equivalent States**.
* The guest requests are **Inputs ($X$)**.
* The room keys and elevator directions are **Outputs ($Y$)**.
* Merging Desk B into Desk A is **State Minimization**.

In sequential logic design, if two internal states produce identical outputs and transition to equivalent next states for all possible input events, they are mathematically redundant. We can collapse them into a single state, saving physical flip-flops on our microchip die.

---

## Mechanics of Equivalent State Analysis and Implication Table Minimization

To master state reduction, we must dissect the formal mechanics of its two core primitives:
1. **Equivalent State Definition**: The two mathematical criteria that must be satisfied for two states $S_a$ and $S_b$ to be declared equivalent.
2. **The State Reduction Table (Implication Table)**: The triangular matrix algorithm used to systematically evaluate state pair compatibility, resolve conditional dependencies, and collapse state transition diagrams.

---

### Primitive 1: Formal Definition of Equivalent States

Two states, $S_a$ and $S_b$, in a finite state machine are defined as **Equivalent ($S_a \equiv S_b$)** if and only if, starting from $S_a$ and $S_b$, the machine produces the **exact same output sequence** for every conceivable input sequence applied over time.

To test whether two states $S_a$ and $S_b$ are equivalent without applying infinite input sequences, we use the **Two-Part State Equivalence Theorem**.

Two states $S_a$ and $S_b$ are equivalent ($S_a \equiv S_b$) if and only if, for **every possible single-bit input vector $X$**:

1. **Output Condition**: The output generated by state $S_a$ must be identical to the output generated by state $S_b$:
   $$f(S_a, X) = f(S_b, X) \quad \forall X$$
2. **Next-State Condition**: The next state resulting from state $S_a$ must be equal or equivalent to the next state resulting from state $S_b$:
   $$g(S_a, X) \equiv g(S_b, X) \quad \forall X$$

Where:
* $S_a, S_b$ are the two candidate states being compared.
* $X$ is any valid binary input combination.
* $f(S, X)$ is the output function of the state machine.
* $g(S, X)$ is the next-state transition function of the state machine.

```text
THE TWO-PART EQUIVALENCE CRITERIA

               Are States Sa and Sb Equivalent?
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   CRITERION 1: OUTPUTS             CRITERION 2: NEXT STATES
   Do Sa and Sb produce the         Do Sa and Sb transition to equal 
   EXACT SAME output for all X?     or equivalent next states for all X?
            │                                 │
            ├──► NO  ──► NOT EQUIVALENT!      ├──► NO  ──► NOT EQUIVALENT!
            └──► YES ──► Check Criterion 2    └──► YES ──► EQUIVALENT! (Merge!)
```

#### The Implication Cascade Rule
Notice Criterion 2: $S_a$ and $S_b$ are equivalent if their next states $g(S_a, X)$ and $g(S_b, X)$ are equivalent.

This creates a conditional chain called an **Implication**:
*"State $S_1$ and State $S_2$ are equivalent IF AND ONLY IF State $S_3$ and State $S_4$ are also equivalent!"*

If we later discover that $S_3$ and $S_4$ are NOT equivalent, then the implication chain breaks backward, and $S_1$ and $S_2$ are proven to be NOT equivalent!

To track these multi-step implication chains across 8, 12, or 20 states without making logic errors, engineers use the **Implication Table**.

---

### Primitive 2: The State Reduction Table (Implication Table)

The **State Reduction Table** (also known as an **Implication Table**) is a lower-triangular matrix used to evaluate pairwise compatibility for all possible state pairs in a finite state machine.

For an FSM with $K$ states ($S_0, S_1, \dots, S_{K-1}$), the total number of unique state pairs that must be evaluated is given by the combination formula:

$$
P_{\text{pairs}} = \frac{K \cdot (K - 1)}{2}
$$

Where:
* $P_{\text{pairs}}$ is the total number of state pairs to evaluate.
* $K$ is the total number of un-reduced states in the initial specification.

For a 6-state machine ($K=6$), the number of pairs is $\frac{6 \times 5}{2} = 15$ pairs. For an 8-state machine ($K=8$), $P_{\text{pairs}} = \frac{8 \times 7}{2} = 28$ pairs.

```text
STRUCTURE OF A 6-STATE IMPLICATION TABLE

  S1 │  (S0,S1)
  S2 │  (S0,S2)  (S1,S2)
  S3 │  (S0,S3)  (S1,S3)  (S2,S3)
  S4 │  (S0,S4)  (S1,S4)  (S2,S4)  (S3,S4)
  S5 │  (S0,S5)  (S1,S5)  (S2,S5)  (S3,S5)  (S4,S5)
     └──────────────────────────────────────────
          S0        S1       S2       S3       S4
```

Notice the lower-triangular structure:
* The vertical axis lists states $S_1$ through $S_{K-1}$.
* The horizontal axis lists states $S_0$ through $S_{K-2}$.
* Each cell in the grid represents the unique state pair $(S_i, S_j)$.

---

### The 4-Step Implication Table Minimization Algorithm

To reduce any state machine to its minimal state representation using an Implication Table, follow this deterministic 4-step algorithm:

#### Step 1: Initial Output Compatibility Pass (Immediate Rejection)
Inspect every state pair $(S_i, S_j)$ in the implication table:
* Compare the output vectors $f(S_i, X)$ and $f(S_j, X)$ for all inputs $X$.
* If state $S_i$ and state $S_j$ produce **different outputs** for any input $X$, they violate Criterion 1. **Cross out the cell with a large 'X' mark!** They can never be equivalent.
* If state $S_i$ and state $S_j$ produce **identical outputs** for all inputs $X$, move to Step 2!

```text
STEP 1: OUTPUT COMPATIBILITY CHECK

 Pair (Sa, Sb) Output Check:
   * Output of Sa for input X=0 : 0
   * Output of Sb for input X=0 : 1  ──► OUTPUT MISMATCH!
                                          Cross out cell with 'X'!
```

#### Step 2: Implication Entry Pass (Writing Next-State Conditions)
For each cell $(S_i, S_j)$ that survived Step 1 (outputs matched):
* Look at the next states $g(S_i, X)$ and $g(S_j, X)$ for each input $X$.
* If the next states are identical for all inputs (e.g., for $X=0$, both go to $S_3$; for $X=1$, both go to $S_4$), write a **checkmark ($\checkmark$)** in the cell! The pair is unconditionally equivalent.
* If the next states are different, write down the **implied next-state pair(s)** inside the cell.
  For example, if input $X=0$ sends $S_i \to S_a$ and $S_j \to S_b$, write $(S_a, S_b)$ inside cell $(S_i, S_j)$.

```text
STEP 2: IMPLICATION ENTRY IN SURVIVING CELLS

 Cell (Sa, Sb)
 ┌──────────────┐
 │   (Sc, Sd)   │ ──► "Sa and Sb are equivalent IF AND ONLY IF
 └──────────────┘      Sc and Sd are proven to be equivalent!"
```

#### Step 3: Iterative Propagation Pass (Chain Invalidation)
Repeatedly scan all uncrossed cells in the implication table:
* Look at the implied state pairs written inside an uncrossed cell.
* If any implied pair $(S_c, S_d)$ written inside cell $(S_i, S_j)$ has been **crossed out ('X')** elsewhere in the table, then cell $(S_i, S_j)$ is ALSO invalid! **Cross out cell $(S_i, S_j)$ with an 'X'!**
* Repeat this scanning pass again and again until a full pass completes without crossing out any new cells.

```text
STEP 3: ITERATIVE CHAIN INVALIDATION

 Cell (Sa, Sb) contains implied pair (Sc, Sd).
 Scan table ──► Find that Cell (Sc, Sd) has an 'X' (Invalidated!)
                 │
                 ▼
 Cross out Cell (Sa, Sb) with an 'X'! (Chain Broken!)
```

#### Step 4: Extract Equivalent State Classes and Re-Draw State Table
Examine the remaining cells in the table that have **NOT been crossed out**:
* Any uncrossed cell $(S_i, S_j)$ represents a pair of **proven Equivalent States ($S_i \equiv S_j$)**.
* Group equivalent states into **Equivalence Partition Classes** (e.g., if $S_1 \equiv S_3$ and $S_3 \equiv S_5$, then $\{S_1, S_3, S_5\}$ forms a single merged state!).
* Replace all occurrences of $S_3$ and $S_5$ with $S_1$ in the state transition table.
* Construct the final **Minimized State Table**.

---

## Method 2: The Row-Matching Shortcut for Simple Tables

Before building a full Implication Table, digital engineers often perform a fast preliminary pass over the state table using the **Row-Matching Method**.

In a state transition table, two rows are directly identical if:
1. They produce the exact same output values for all inputs.
2. They specify the exact same next-state transitions for all inputs.

```text
ROW-MATCHING DIRECT IDENTIFICATION

 State Row │ Next State (X=0) │ Next State (X=1) │ Output Y (X=0) │ Output Y (X=1)
───────────┼──────────────────┼──────────────────┼────────────────┼────────────────
  Row S2   │        S4        │        S1        │       0        │       1
  Row S5   │        S4        │        S1        │       0        │       1
  ▲                                                                        ▲
  └──────────────────────── EXACT MATCHING ROWS! ──────────────────────────┘
                            State S5 is identical to S2! Merge S5 into S2!
```

### The Row-Matching Algorithm:
1. Inspect the state table for two rows that have identical next-state columns and identical output columns.
2. Delete one of the duplicate rows (say, $S_5$).
3. Replace every reference to $S_5$ in the remaining table with $S_2$.
4. Repeat the inspection! Merging $S_5$ into $S_2$ may cause two *other* rows to become identical, triggering a cascade of row simplifications.

While Row-Matching is fast, it cannot detect indirect, multi-step implication chains (e.g., $S_1 \equiv S_2$ depends on $S_3 \equiv S_4$, which depends on $S_1 \equiv S_2$). For complex state machines, the **Implication Table algorithm** is required for 100% complete state reduction.

---

## Engineering Reality: Power-of-Two Boundaries and Glitch Prevention

While reducing states always simplifies software models, in hardware engineering, the primary metric of success is whether state reduction successfully **crosses a power-of-two flip-flop boundary**.

### 1. Crossing the Flip-Flop Threshold

Consider two state reduction scenarios in physical microchip design:

#### Scenario A: Reducing 8 States to 6 States
* Initial State Count: $K = 8 \implies N = \lceil \log_2 8 \rceil = 3$ Flip-Flops.
* Reduced State Count: $K' = 6 \implies N = \lceil \log_2 6 \rceil = 3$ Flip-Flops.
* **Hardware Impact**: The state register still requires **3 flip-flops**. However, the next-state logic gets smaller because 2 states became Don't Care ($X$) conditions during state assignment.

#### Scenario B: Reducing 5 States to 4 States (Crossing the Boundary!)
* Initial State Count: $K = 5 \implies N = \lceil \log_2 5 \rceil = 3$ Flip-Flops.
* Reduced State Count: $K' = 4 \implies N = \lceil \log_2 4 \rceil = 2$ Flip-Flops.
* **Hardware Impact**: **MASSIVE SAVINGS!** The physical state register shrinks from 3 flip-flops down to 2 flip-flops. One entire storage cell is removed, cutting register silicon area by $33\%$ and simplifying all combinational next-state logic equations across the board.

```text
POWER-OF-TWO THRESHOLD BOUNDARY SAVINGS

 5-State Machine (Un-Reduced)           4-State Machine (Reduced)
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ 3 State Flip-Flops        │ ──────►  │ 2 State Flip-Flops        │
 │ 3-Variable Next-State Logic│          │ 2-Variable Next-State Logic│
 └───────────────────────────┘          └───────────────────────────┘
   Crossed 2^k Boundary! Saved 1 Physical Flip-Flop & 33% Logic Area!
```

**Hardware Design Golden Rule**:
> Always audit state reduction specifically around power-of-two boundaries ($3 \to 2$, $5 \to 4$, $9 \to 8$, $17 \to 16$). Eliminating a single state that crosses a power-of-two threshold yields massive silicon die and power savings.

---

## Solved Industrial Engineering Exercise: Automated Vending Machine State Reduction

To consolidate your complete mastery of equivalent states, row-matching, implication table matrix algorithms, and flip-flop boundary reduction, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An automated retail systems firm is engineering the hardware state controller for a beverage vending machine.

The controller receives a 1-bit input signal $X$:
* $X = 0$: No coin inserted / Idle clock cycle.
* $X = 1$: Valid $25\phi$ quarter coin inserted.

The controller drives a 1-bit output signal $Y$:
* $Y = 0$: Insufficient funds (Dispense solenoid OFF).
* $Y = 1$: $75\phi$ reached! Dispense beverage item (Dispense solenoid ON).

```text
VENDING MACHINE STATE CONTROLLER

 Coin Sensor Input X ──► [ Un-Reduced FSM Controller ] ──► Dispense Solenoid Y
 System Clock CLK   ──► [     (7 Initial States)    ]    (1 = Dispense Drink)
```

#### Un-Reduced System Specification Table

The junior systems team drafted an initial 7-state FSM specification ($S_0, S_1, S_2, S_3, S_4, S_5, S_6$):

```text
UN-REDUCED 7-STATE VENDING MACHINE STATE TABLE

 Current State │ Next State (Input X = 0) │ Next State (Input X = 1) │ Output Y (X = 0) │ Output Y (X = 1)
───────────────┼──────────────────────────┼──────────────────────────┼──────────────────┼──────────────────
      S0       │            S0            │            S1            │        0         │        0
      S1       │            Constants S1   │            S2            │        0         │        0
      S2       │            S2            │            S3            │        0         │        0
      S3       │            S3            │            S4            │        0         │        1
      S4       │            S0            │            S1            │        0         │        0
      S5       │            S2            │            S3            │        0         │        0
      S6       │            S3            │            S4            │        0         │        1
```

*Note on Row $S_1$: In row $S_1$, when $X=0$, Next State is $S_1$.

#### Your Objective

1. Calculate the initial number of state flip-flops $N_{\text{initial}}$ required for this 7-state machine.
2. Perform a preliminary **Row-Matching Pass** on the un-reduced state table to identify and merge directly identical state rows.
3. Construct the complete lower-triangular **Implication Table Matrix** for all remaining state pairs.
4. Execute the 4-step Implication Table algorithm to find all **Equivalent States**.
5. Construct the final **Minimized State Table** and calculate the new required flip-flop count $N_{\text{final}}$.
6. Calculate the percentage savings in physical state register flip-flops.

---

### Step-by-Step Derivation

#### Step 1: Calculate Initial Flip-Flop Count

The initial un-reduced state machine contains $K = 7$ states ($S_0, S_1, S_2, S_3, S_4, S_5, S_6$).

Applying the flip-flop capacity formula:

$$
N_{\text{initial}} = \lceil \log_2 7 \rceil = \mathbf{3 \text{ Flip-Flops}}
$$

The un-reduced design requires 3 physical flip-flops in its state register.

---

#### Step 2: Preliminary Row-Matching Pass

Let us inspect the un-reduced state table for identical rows:

Look at **Row $S_3$** and **Row $S_6$**:
* Row $S_3$: Next State $(X=0) = S_3$, Next State $(X=1) = S_4$, Output $(X=0) = 0$, Output $(X=1) = 1$.
* Row $S_6$: Next State $(X=0) = S_3$, Next State $(X=1) = S_4$, Output $(X=0) = 0$, Output $(X=1) = 1$.

Row $S_3$ and Row $S_6$ are **100% identical in all columns**!

$$
S_3 \equiv S_6
$$

We immediately merge $S_6$ into $S_3$:
1. Delete Row $S_6$ from the table.
2. Replace all occurrences of $S_6$ in the table with $S_3$.

Look at **Row $S_0$** and **Row $S_4$**:
* Row $S_0$: Next State $(X=0) = S_0$, Next State $(X=1) = S_1$, Output $(X=0) = 0$, Output $(X=1) = 0$.
* Row $S_4$: Next State $(X=0) = S_0$, Next State $(X=1) = S_1$, Output $(X=0) = 0$, Output $(X=1) = 0$.

Row $S_0$ and Row $S_4$ are **100% identical in all columns**!

$$
S_0 \equiv S_4
$$

We immediately merge $S_4$ into $S_0$:
1. Delete Row $S_4$ from the table.
2. Replace all occurrences of $S_4$ in the table with $S_0$.

Look at **Row $S_2$** and **Row $S_5$**:
* Row $S_2$: Next State $(X=0) = S_2$, Next State $(X=1) = S_3$, Output $(X=0) = 0$, Output $(X=1) = 0$.
* Row $S_5$: Next State $(X=0) = S_2$, Next State $(X=1) = S_3$, Output $(X=0) = 0$, Output $(X=1) = 0$.

Row $S_2$ and Row $S_5$ are **100% identical in all columns**!

$$
S_2 \equiv S_5
$$

We immediately merge $S_5$ into $S_2$:
1. Delete Row $S_5$ from the table.
2. Replace all occurrences of $S_5$ in the table with $S_2$.

#### Intermediate State Table After Row-Matching:
Our state table is now reduced to 4 states ($S_0, S_1, S_2, S_3$):

```text
INTERMEDIATE STATE TABLE AFTER ROW-MATCHING

 Current State │ Next State (X = 0) │ Next State (X = 1) │ Output Y (X = 0) │ Output Y (X = 1)
───────────────┼────────────────────┼────────────────────┼──────────────────┼──────────────────
      S0       │         S0         │         S1         │        0         │        0
      S1       │         S1         │         S2         │        0         │        0
      S2       │         S2         │         S3         │        0         │        0
      S3       │         S3         │         S0         │        0         │        1
```

*(Note: In row $S_3$, Next State for $X=1$ was $S_4$, which became $S_0$!).*

---

#### Step 3: Construct the Implication Table for Remaining States ($S_0, S_1, S_2, S_3$)

To verify if any further state reductions are possible among $S_0, S_1, S_2, S_3$, we build a lower-triangular Implication Table for the 4 remaining states:

Number of pairs to evaluate:
$$P_{\text{pairs}} = \frac{4 \times 3}{2} = 6 \text{ pairs}$$

The 6 pairs are: $(S_0,S_1), (S_0,S_2), (S_0,S_3), (S_1,S_2), (S_1,S_3), (S_2,S_3)$.

```text
4-STATE IMPLICATION TABLE TEMPLATE

  S1 │  (S0,S1)
  S2 │  (S0,S2)  (S1,S2)
  S3 │  (S0,S3)  (S1,S3)  (S2,S3)
     └───────────────────────────
          S0        S1       S2
```

##### Pass 1: Output Compatibility Check
Inspect outputs $Y(X=0), Y(X=1)$ for each state:
* $S_0$: Outputs $(0, 0)$
* $S_1$: Outputs $(0, 0)$
* $S_2$: Outputs $(0, 0)$
* $S_3$: Outputs $(0, 1) \implies$ Output mismatch for $X=1$!

Cross out all pairs containing $S_3$ with an 'X':
* Cross out $(S_0, S_3)$
* Cross out $(S_1, S_3)$
* Cross out $(S_2, S_3)$

##### Pass 2: Fill Implication Entries for Surviving Cells
For the remaining 3 cells:

1. **Cell $(S_0, S_1)$**:
   * For $X=0$: Next states are $S_0$ and $S_1 \implies$ Implies pair $(S_0, S_1)$.
   * For $X=1$: Next states are $S_1$ and $S_2 \implies$ Implies pair $(S_1, S_2)$.
   * Enter implied pair $(S_1, S_2)$ into Cell $(S_0, S_1)$.

2. **Cell $(S_0, S_2)$**:
   * For $X=0$: Next states are $S_0$ and $S_2 \implies$ Implies pair $(S_0, S_2)$.
   * For $X=1$: Next states are $S_1$ and $S_3 \implies$ Implies pair $(S_1, S_3)$.
   * Enter implied pair $(S_1, S_3)$ into Cell $(S_0, S_2)$.

3. **Cell $(S_1, S_2)$**:
   * For $X=0$: Next states are $S_1$ and $S_2 \implies$ Implies pair $(S_1, S_2)$.
   * For $X=1$: Next states are $S_2$ and $S_3 \implies$ Implies pair $(S_2, S_3)$.
   * Enter implied pair $(S_2, S_3)$ into Cell $(S_1, S_2)$.

```text
IMPLICATION TABLE AFTER PASS 2

  S1 │  (S1,S2)
  S2 │  (S1,S3)   (S2,S3)
  S3 │    X         X        X
     └───────────────────────────
          S0        S1       S2
```

##### Pass 3: Iterative Invalidation Pass
* Inspect **Cell $(S_0, S_2)$**: Contains implied pair $(S_1, S_3)$. But Cell $(S_1, S_3)$ has an **'X'**!
  $\implies$ **Cross out Cell $(S_0, S_2)$ with an 'X'!**
* Inspect **Cell $(S_1, S_2)$**: Contains implied pair $(S_2, S_3)$. But Cell $(S_2, S_3)$ has an **'X'**!
  $\implies$ **Cross out Cell $(S_1, S_2)$ with an 'X'!**
* Inspect **Cell $(S_0, S_1)$**: Contains implied pair $(S_1, S_2)$. But Cell $(S_1, S_2)$ was just crossed out!
  $\implies$ **Cross out Cell $(S_0, S_1)$ with an 'X'!**

All 6 cells in the implication table are crossed out with 'X'!
Therefore, no further state equivalences exist among $S_0, S_1, S_2, S_3$.

The minimal state machine consists of **exactly 4 states**: $S_0, S_1, S_2, S_3$.

---

#### Step 4: Final Minimized State Table and Flip-Flop Savings

Our final reduced state table contains 4 states ($S_0, S_1, S_2, S_3$):

```text
FINAL MINIMIZED 4-STATE VENDING MACHINE TABLE

 Current State │ Next State (X = 0) │ Next State (X = 1) │ Output Y (X = 0) │ Output Y (X = 1) │ Vending Mode
───────────────┼────────────────────┼────────────────────┼──────────────────┼──────────────────┼──────────────────────
  S0 (Idle)    │         S0         │         S1         │        0         │        0         │ 0c Deposited
  S1 (25c)     │         S1         │         S2         │        0         │        0         │ 25c Deposited
  S2 (50c)     │         S2         │         S3         │        0         │        0         │ 50c Deposited
  S3 (75c)     │         S3         │         S0         │        0         │        1         │ 75c -> DISPENSE DRINK!
```

##### Calculate Final Flip-Flop Count ($N_{\text{final}}$):
$$N_{\text{final}} = \lceil \log_2 4 \rceil = \mathbf{2 \text{ Flip-Flops}}$$

##### Calculate Hardware Savings:
* Initial Un-Reduced Register: 3 Flip-Flops ($K = 7$).
* Final Minimized Register: 2 Flip-Flops ($K = 4$).

$$\text{Flip-Flop Reduction} = \frac{3 - 2}{3} \times 100\% = \mathbf{33.3\% \text{ Savings!}}$$

By eliminating 3 redundant states, we crossed a power-of-two flip-flop boundary ($7 \to 4$), removing 1 physical flip-flop and cutting state register hardware area by **$33.3\%$**!

---

### Sanity Check and Verification

Let us verify that our 4-state minimized vending machine produces the exact same behavioral output sequence as the original 7-state specification across a $1.00\$$ purchase sequence ($X = 1, 1, 1$).

#### 1. Simulation on Original 7-State Machine:
* **Start in $S_0$**: Output $Y = 0$.
* **Coin 1 ($X=1$)**: Transition to $S_1$. Output $Y = 0$.
* **Coin 2 ($X=1$)**: Transition to $S_2$. Output $Y = 0$.
* **Coin 3 ($X=1$)**: Transition to $S_3$. Output $Y = 1$ (**DISPENSE DRINK!**). Next State $S_4$.
* **Idle ($X=0$)**: From $S_4$, transition to $S_0$. Output $Y = 0$.
* **Total Coins Needed**: 3 Quarters ($75\phi$). Drink dispensed on 3rd coin!

#### 2. Simulation on Minimized 4-State Machine:
* **Start in $S_0$**: Output $Y = 0$.
* **Coin 1 ($X=1$)**: Transition to $S_1$. Output $Y = 0$.
* **Coin 2 ($X=1$)**: Transition to $S_2$. Output $Y = 0$.
* **Coin 3 ($X=1$)**: Transition to $S_3$. Output $Y = 1$ (**DISPENSE DRINK!**). Next State $S_0$.
* **Idle ($X=0$)**: From $S_0$, stay in $S_0$. Output $Y = 0$.
* **Total Coins Needed**: 3 Quarters ($75\phi$). Drink dispensed on 3rd coin!

Both machines produce the **exact same behavioral output stream**! The 4-state reduced machine uses $33.3\%$ fewer flip-flops, $50\%$ less silicon area, and is 100% mathematically verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Equivalent State**: Two states $S_a$ and $S_b$ in a finite state machine that produce identical output vectors for all possible input combinations ($f(S_a, X) = f(S_b, X)$) and transition to equal or equivalent next states ($g(S_a, X) \equiv g(S_b, X)$), allowing them to be merged into a single state to reduce hardware footprint.
* **State Reduction Table (Implication Table)**: A lower-triangular matrix algorithm used to evaluate pairwise compatibility across all state pairs in an FSM, systematically invalidating incompatible pairs through output mismatch checks and iterative implication chain analysis to extract minimal state equivalence partitions.
