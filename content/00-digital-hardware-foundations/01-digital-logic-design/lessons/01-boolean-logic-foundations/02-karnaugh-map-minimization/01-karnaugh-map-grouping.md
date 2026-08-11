# Karnaugh Map Grouping and Gray Code Spatial Optimization

## The High Error Rate of Symbolic Algebraic Simplification

Simplifying Boolean expressions using algebraic laws requires human intuition, trial-and-error factoring, and constant alertness. When an engineer attempts to reduce a multi-term 4-variable expression by applying the Distributive, Absorption, and Elimination laws by hand, small human errors inevitably creep in. A single missed bar over a variable or an overlooked factoring opportunity results in an unoptimized or flatly incorrect physical circuit.

Consider a 4-variable Sum of Products expression extracted directly from an industrial control truth table containing eight active minterms:

$$
Y = (\overline{A}\overline{B}\overline{C}\overline{D}) + (\overline{A}\overline{B}\overline{C}D) + (\overline{A}B\overline{C}\overline{D}) + (\overline{A}B\overline{C}D) + (A\overline{B}C\overline{D}) + (A\overline{B}CD) + (ABC\overline{D}) + (ABCD)
$$

Where:
* $Y$ is the Boolean output signal.
* $A, B, C, D$ are the four binary input variables.

To simplify this expression algebraically, an engineer must manually group minterms, factor out common variable combinations, and apply complementation identities ($\overline{X} + X = 1$) across multiple steps. If the engineer fails to recognize that term 1 and term 3 can be factored together while simultaneously factoring term 1 with term 2, they will fail to find the minimal logic circuit.

```text
THE SYMBOLIC ALGEBRAIC FACTORING MAZE

 8 Minterm Expression ──► [ Manual Factoring ] ──► Missed Term Factor?
                                   │                       │
                                   ▼                       ▼
                         Human Error Prone          Bloated Circuit!
```

What if we could eliminate symbolic algebraic manipulation entirely? What if we could take any $2^N$-row truth table, fold it into a two-dimensional visual grid, and read the minimal Boolean expression directly off the map by drawing loops around adjacent $1$s?

This visual, spatial optimization method is the **Karnaugh Map (K-Map)**. By arranging truth table states using a special non-binary numbering system called **Gray Code Indexing**, the K-Map translates complex algebraic complementation laws into simple geometric adjacency. If two $1$s are physically adjacent on a K-Map grid, their corresponding minterms differ by exactly one variable—meaning that variable can be eliminated instantly without writing a single line of algebra.

---

## The Neighborhood Map Analogy: Visualizing Physical Adjacency

To build an intuitive, crystal-clear mental model of a Karnaugh Map, let us leave electronic circuits behind and picture a two-dimensional grid map of a residential neighborhood.

Imagine a city planned on a square grid. Each house on the grid has a two-part address. The first part represents the **North-South Street**, and the second part represents the **East-West Avenue**.

```text
RESIDENTIAL GRID MAP ANALOGY

                    Avenue 0 (West)      Avenue 1 (East)
                 ┌────────────────────┬────────────────────┐
 Street 0 (North)│  House (0, 0)      │  House (0, 1)      │
                 ├────────────────────┼────────────────────┤
 Street 1 (South)│  House (1, 0)      │  House (1, 1)      │
                 └────────────────────┴────────────────────┘
```

Suppose a mail carrier needs to deliver packages to House $(0,0)$ and House $(0,1)$. The mail carrier notices something important: both houses are located on **Street 0**. The Avenue coordinate changes ($0$ versus $1$), but the Street coordinate remains constant at $0$.

Instead of giving two separate instructions (*"Deliver to Street 0, Avenue 0" AND "Deliver to Street 0, Avenue 1"*), the postal supervisor gives a single, simplified visual instruction:
*"Deliver to the entire top block of Street 0!"*

By grouping the two neighboring houses together into a single block, the Avenue variable disappears from the instruction!

```text
VISUAL BLOCK GROUPING ELIMINATES A VARIABLE

 House (0,0)  AND  House (0,1)  ──► GROUPED TOGETHER ──► "Entire Street 0"
 (Avenue 0)        (Avenue 1)                             (Avenue Irrelevant!)
```

This is the exact principle behind a **Karnaugh Map**. A K-Map is a two-dimensional neighborhood map of truth table states. Each cell in the grid represents one minterm. When two adjacent cells both contain a $1$, we draw a loop around them. Grouping those two cells together into a single block allows us to visually drop the variable that changes between them, leaving behind a dramatically simplified Boolean term.

---

## Mechanics of Gray Code Indexing and K-Map Construction

To understand why geometric adjacency on a K-Map corresponds to algebraic simplification, we must examine the mathematical engine that drives the grid: **Gray Code Indexing**.

---

### Primitive 1: Gray Code Indexing and Single-Bit Adjacency

In standard binary counting, transitioning from one number to the next often causes multiple bits to toggle simultaneously.

Look at standard 2-bit binary counting:

```text
STANDARD BINARY COUNTING SEQUENCE

 Decimal Value │ Binary Representation │ Bit Toggles from Previous Row
───────────────┼───────────────────────┼───────────────────────────────
       0       │          00           │ -
       1       │          01           │ 1 Bit Toggles (Bit 0)
       2       │          10           │ 2 Bits Toggle! (Bit 0 and Bit 1)
       3       │          11           │ 1 Bit Toggles (Bit 0)
```

Notice what happens when counting from decimal 1 ($01_2$) to decimal 2 ($10_2$): **both bits flip at the same time**. Bit 0 changes from $1$ to $0$, and Bit 1 changes from $0$ to $1$.

Why is this multi-bit change a disaster for visual circuit optimization?
Recall the Boolean complementation identity:

$$
X \cdot \overline{Y} + X \cdot Y = X \cdot (\overline{Y} + Y) = X \cdot (1) = X
$$

To eliminate a variable algebraically, two product terms must be **identical in every variable except exactly ONE**, where that single variable appears uncomplemented in one term and complemented in the other.

If two adjacent cells in a grid corresponded to standard binary $01$ and $10$, two variables would change at once. We could not eliminate anything!

To solve this problem, Frank Gray invented **Gray Code Indexing** (also known as reflected binary code). In a Gray code sequence, **adjacent values differ by exactly one binary bit position**.

```text
2-BIT GRAY CODE SEQUENCE

 Decimal Index │ Gray Code Value │ Toggled Bit Position │ Variable Difference
───────────────┼─────────────────┼──────────────────────┼────────────────────
       0       │       00        │ -                    │ Base State
       1       │       01        │ Bit 0 Toggles        │ Differs by 1 Bit
       2       │       11        │ Bit 1 Toggles        │ Differs by 1 Bit
       3       │       10        │ Bit 0 Toggles        │ Differs by 1 Bit
```

Look at the Gray code sequence: $00 \to 01 \to 11 \to 10$.
* From $00$ to $01$: Only Bit 0 changes.
* From $01$ to $11$: Only Bit 1 changes.
* From $11$ to $10$: Only Bit 0 changes.
* From $10$ back to $00$ (wrapping around): Only Bit 1 changes!

This single-bit change property is called **Unit Distance Adjacency**. Gray code guarantees that any two physically adjacent positions in the sequence differ by a single bit.

```text
UNIT DISTANCE ADJACENCY OF GRAY CODE

 00 ──(1 Bit Diff)──► 01 ──(1 Bit Diff)──► 11 ──(1 Bit Diff)──► 10
  ▲                                                              │
  └────────────────────────(1 Bit Diff)──────────────────────────┘
                      (Cyclic Wrap-Around Adjacency)
```

---

### Primitive 2: Karnaugh Map Grid Layouts and Structural Adjacency

A **Karnaugh Map** is a two-dimensional array of cells where the rows and columns are indexed using Gray Code. Because the headers use Gray code, **physical adjacency on the grid guarantees logical adjacency in Boolean algebra.**

Let us examine the construction of K-Maps for 2, 3, and 4 variables.

#### 1. The 2-Variable Karnaugh Map ($2^2 = 4$ Cells)

For a system with 2 variables ($A, B$), the grid has 2 rows (for variable $A$) and 2 columns (for variable $B$):

```text
2-VARIABLE KARNAUGH MAP GRID

               B = 0         B = 1
          ┌─────────────┬─────────────┐
   A = 0  │  Cell 0     │  Cell 1     │
          │  (A' * B')  │  (A' * B)   │
          ├─────────────┼─────────────┤
   A = 1  │  Cell 2     │  Cell 3     │
          │  (A * B')   │  (A * B)    │
          └─────────────┴─────────────┘
```

Look at Cell 0 ($\overline{A}\overline{B}$) and Cell 1 ($\overline{A}B$). They sit horizontally adjacent to each other. Variable $A$ is $0$ for both cells. Variable $B$ changes from $0$ to $1$. If both cells contain a $1$, we group them together:

$$
\overline{A}\overline{B} + \overline{A}B = \overline{A}(\overline{B} + B) = \overline{A}(1) = \overline{A}
$$

The variable $B$ drops out completely, leaving just $\overline{A}$!

#### 2. The 3-Variable Karnaugh Map ($2^3 = 8$ Cells)

For a system with 3 variables ($A, B, C$), we assign variable $A$ to the rows ($A=0, A=1$) and variables $B, C$ to the columns.

The column headers **MUST** follow 2-bit Gray code: $00, 01, 11, 10$.

```text
3-VARIABLE KARNAUGH MAP GRID (8 CELLS)

             BC = 00       BC = 01       BC = 11       BC = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
   A = 0  │  Cell 0     │  Cell 1     │  Cell 3     │  Cell 2     │
          │ (A' B' C')  │ (A' B' C)   │ (A' B  C)   │ (A' B  C')  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
   A = 1  │  Cell 4     │  Cell 5     │  Cell 7     │  Cell 6     │
          │ (A  B' C')  │ (A  B' C)   │ (A  B  C)   │ (A  B  C')  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Notice the cell numbering order in the top row: **Cell 0, Cell 1, Cell 3, Cell 2**.
Cell 3 comes BEFORE Cell 2 because column $11_2$ (decimal 3) precedes column $10_2$ (decimal 2) in Gray code ordering!

#### 3. The 4-Variable Karnaugh Map ($2^4 = 16$ Cells)

For a system with 4 variables ($A, B, C, D$), we assign variables $A, B$ to the rows and variables $C, D$ to the columns. Both row and column headers use 2-bit Gray code ($00, 01, 11, 10$):

```text
4-VARIABLE KARNAUGH MAP GRID (16 CELLS)

             CD = 00       CD = 01       CD = 11       CD = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
  AB = 00 │  Cell 0     │  Cell 1     │  Cell 3     │  Cell 2     │
          │ (A'B'C'D')  │ (A'B'C'D)   │ (A'B'C D)   │ (A'B'C D')  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 01 │  Cell 4     │  Cell 5     │  Cell 7     │  Cell 6     │
          │ (A'B C'D')  │ (A'B C'D)   │ (A'B C D)   │ (A'B C D')  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 11 │  Cell 12    │  Cell 13    │  Cell 15    │  Cell 14    │
          │ (A B C'D')  │ (A B C'D)   │ (A B C D)   │ (A B C D')  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 10 │  Cell 8     │  Cell 9     │  Cell 11    │  Cell 10    │
          │ (A B'C'D')  │ (A B'C'D)   │ (A B'C D)   │ (A B'C D')  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Study this 16-cell grid carefully. Notice how row 3 ($AB=11$) comes before row 4 ($AB=10$), and column 3 ($CD=11$) comes before column 4 ($CD=10$). This layout is the heart of visual Boolean optimization.

---

### Primitive 3: Toroidal Wrap-Around Adjacency

A common trap for beginners is assuming that adjacency on a K-Map stops at the outer boundaries of the grid. It does not!

Because Gray code is cyclic ($10$ differs from $00$ by only 1 bit), **the left edge of a K-Map is physically adjacent to the right edge, and the top edge is physically adjacent to the bottom edge.**

A Karnaugh Map is not a flat sheet of paper; mathematically, it is a **Torus** (a donut shape).

```text
TOROIDAL WRAP-AROUND ADJACENCY

 Left Edge ◄──────────── (Wrap-Around Adjacency) ────────────► Right Edge
 Column 00 (CD = 00)                                           Column 10 (CD = 10)

 Top Edge  ▲                                                   ▲
           │──────────── (Wrap-Around Adjacency) ──────────────│
 Bottom Edge  ▼                                                ▼
 Row 00 (AB = 00)                                              Row 10 (AB = 10)
```

What does this mean for grouping $1$s?
* Cell 0 ($0000$) on the far top-left is adjacent to Cell 2 ($0010$) on the far top-right!
* Cell 0 ($0000$) on the far top-left is adjacent to Cell 8 ($1000$) on the far bottom-left!
* The four extreme corners of a 4-variable map—Cell 0 ($0000$), Cell 2 ($0010$), Cell 8 ($1000$), and Cell 10 ($1010$)—are all mutually adjacent and form a valid group of 4 cells!

```text
THE FOUR-CORNER GROUPING ON A 4-VARIABLE K-MAP

  Cell 0 (Top-Left)  ◄────────────────────────►  Cell 2 (Top-Right)
          ▲                                             ▲
          │                                             │
          ▼                                             ▼
  Cell 8 (Bottom-Left) ◄──────────────────────►  Cell 10 (Bottom-Right)
```

---

## The Non-Negotiable Rules of K-Map Grouping

To extract the minimal Boolean expression from a Karnaugh Map without errors, you must follow five strict mathematical rules when drawing loops around $1$s.

```text
SUMMARY OF K-MAP GROUPING RULES

 Rule 1: Group Size Power      │ Group size MUST be 1, 2, 4, 8, or 16 (2^k).
 Rule 2: Rectangular Shape     │ Groups MUST be rectangles or squares. No diagonals!
 Rule 3: Maximize Group Size   │ Make groups as LARGE as possible to eliminate variables.
 Rule 4: Minimize Group Count  │ Use as FEW groups as possible to minimize product terms.
 Rule 5: Overlapping Allowed   │ Groups MAY overlap if it helps make other groups larger.
```

Let us examine each rule in detail:

### Rule 1: Group Sizes Must Be Powers of 2
Groups can contain $1, 2, 4, 8,$ or $16$ cells ($2^k$ where $k = 0, 1, 2, 3, 4$). You can **NEVER** create a group of 3, 5, 6, or 7 cells.

* A group of **1 cell** ($2^0$) eliminates **0 variables** (retains all 4 variables as a minterm).
* A group of **2 cells** ($2^1$) eliminates **1 variable** (yields a 3-variable product term).
* A group of **4 cells** ($2^2$) eliminates **2 variables** (yields a 2-variable product term).
* A group of **8 cells** ($2^3$) eliminates **3 variables** (yields a 1-variable product term).
* A group of **16 cells** ($2^4$) eliminates **all 4 variables** (the output is a constant $1$).

```text
VARIABLE ELIMINATION POWER BY GROUP SIZE

 Group Size (Cells) │ Variables Eliminated │ Remaining Term Size (for 4-Var Map)
────────────────────┼──────────────────────┼─────────────────────────────────────
     1 (2^0)        │     0 Variables      │ 4 Variables (e.g. A'B'C'D)
     2 (2^1)        │     1 Variable       │ 3 Variables (e.g. A'B'C)
     4 (2^2)        │     2 Variables      │ 2 Variables (e.g. A'C)
     8 (2^3)        │     3 Variables      │ 1 Variable  (e.g. A)
    16 (2^4)        │     4 Variables      │ Constant 1  (Y = 1)
```

### Rule 2: Groups Must Be Rectangular
All loops must form solid rectangles or squares. L-shapes, diagonal lines, and T-shapes are strictly illegal because they do not represent consistent variable complementation.

```text
VALID VERSUS INVALID K-MAP GROUP SHAPES

 VALID GROUPS (Rectangular)           INVALID GROUPS (Illegal!)
 ┌───┬───┐    ┌───┐                   ┌───┬───┐
 │ 1 │ 1 │    │ 1 │                   │ 1 │ 1 │
 └───┴───┘    ├───┤                   └───┼───┤
              │ 1 │                       │ 1 │  ◄── L-Shape! Illegal!
              └───┘                       └───┘
 2x1 Horizontal  1x2 Vertical
```

### Rule 3: Maximize Group Size (Essential Prime Implicants)
Always make every group as large as possible. If a cell containing a $1$ can be part of a group of 4, do not leave it in a group of 2! Larger groups eliminate more variables, resulting in smaller gates.

* A **Prime Implicant** is a rectangle of $1$s that cannot be merged into a larger valid group.
* An **Essential Prime Implicant** is a prime implicant that contains at least one $1$ that is not covered by any other prime implicant.

### Rule 4: Minimize Total Number of Groups
To minimize the number of Level-2 OR terms, use the smallest possible number of groups that covers every $1$ on the map.

### Rule 5: Overlapping and Sharing $1$s
Cells containing a $1$ can be included in multiple groups. Because $X + X = X$ in Boolean algebra, sharing a $1$ with a neighboring group to make that neighboring group larger is completely valid and encouraged!

---

## How to Read Simplified Product Terms Directly Off the Map

Once you have drawn your rectangular groups of $1$s on a K-Map, how do you read the resulting simplified Boolean term for a group without writing any algebra?

Use this simple 2-step visual inspection rule:

1. **Examine the row variables** for all cells in the group:
   * If a row variable stays constant at $0$ across all cells in the group, include it as an inverted variable ($\overline{X}$).
   * If a row variable stays constant at $1$ across all cells in the group, include it as a non-inverted variable ($X$).
   * If a row variable changes between $0$ and $1$ across the cells in the group, **DISCARD IT ENTIRELY!**

2. **Examine the column variables** for all cells in the group:
   * Apply the exact same constant-versus-changing rule to the column variables.

3. Multiply the remaining constant variables together to form the product term for that group.

```text
VISUAL TERM READING ALGORITHM

 For each group on the map:
   │
   ├──► Does Variable A change inside the group? ──► YES ──► DISCARD A!
   │                                             └──► NO  ──► KEEP A (A or A')
   │
   ├──► Does Variable B change inside the group? ──► YES ──► DISCARD B!
   │                                             └──► NO  ──► KEEP B (B or B')
   │
   ├──► Does Variable C change inside the group? ──► YES ──► DISCARD C!
   │                                             └──► NO  ──► KEEP C (C or C')
   │
   └──► Does Variable D change inside the group? ──► YES ──► DISCARD D!
                                                 └──► NO  ──► KEEP D (D or D')
```

Let us test this visual reading method on a concrete 4-cell group.

Suppose we have a 4-cell horizontal group covering Cells 4, 5, 7, and 6 on a 4-variable map ($AB=01$, columns $CD = 00, 01, 11, 10$):

```text
VISUAL READING EXAMPLE: 4-CELL HORIZONTAL GROUP

             CD = 00       CD = 01       CD = 11       CD = 10
  AB = 01 │    [1]    │    [1]    │    [1]    │    [1]    │  ◄── Group of 4
```

Let us evaluate the variables:
* **Variable $A$**: Row index is $AB=01$. $A=0$ for all 4 cells. It stays constant at $0$. **KEEP $\overline{A}$**.
* **Variable $B$**: Row index is $AB=01$. $B=1$ for all 4 cells. It stays constant at $1$. **KEEP $B$**.
* **Variable $C$**: Column indices are $00, 01, 11, 10$. $C$ takes values $0, 0, 1, 1$. It changes! **DISCARD $C$**.
* **Variable $D$**: Column indices are $00, 01, 11, 10$. $D$ takes values $0, 1, 1, 0$. It changes! **DISCARD $D$**.

Resulting term for this entire 4-cell group:

$$
\text{Simplified Term} = \overline{A} \cdot B
$$

Notice how a group of 4 cells instantly eliminated 2 variables ($C$ and $D$) without writing a single line of Boolean algebra!

---

## Solved Industrial Engineering Exercise: Automated Factory Assembly Interlock

To cement your complete mastery of Gray Code indexing, K-Map grid construction, toroidal wrap-around grouping, essential prime implicants, and direct visual term extraction, we will now solve a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

A robotics manufacturing plant is engineering the hardware safety interlock for an automated robotic arm assembly station ($Y$). The safety circuit evaluates four binary sensors:

1. **Light Curtain Barrier ($A$)**:
   * $A = 0$: Barrier clear (no human worker near the arm).
   * $A = 1$: Barrier breached (worker detected in hazard zone!).
2. **Part Position Sensor ($B$)**:
   * $B = 0$: No component present on the assembly jig.
   * $B = 1$: Component properly positioned on the jig.
3. **Pneumatic Pressure Switch ($C$)**:
   * $C = 0$: Air pressure low ($< 80 \text{ PSI}$).
   * $C = 1$: Air pressure nominal ($\ge 80 \text{ PSI}$).
4. **Robot Arm Home Position Sensor ($D$)**:
   * $D = 0$: Arm is extended / in motion.
   * $D = 1$: Arm is at rest in Home position.

```text
ROBOTIC ASSEMBLY STATION SAFETY SYSTEM

 Light Curtain (A)    Part Sensor (B)    Pressure Switch (C)   Home Sensor (D)
        │                   │                    │                   │
        └───────────────────┼────────────────────┴───────────────────┘
                            │
                            ▼
             ┌─────────────────────────────┐
             │ Robotic Safety Interlock    │
             └──────────────┬──────────────┘
                            │
                            ▼
                Robotic Arm Enable (Y)
                (0 = Emergency Stop, 1 = Enable Motion)
```

#### System Operating Requirements

The plant safety specification dictates that the Robotic Arm Enable output ($Y$) must be active ($Y = 1$) under the following eight specific state conditions:

* $m_0 = \overline{A}\overline{B}\overline{C}\overline{D}$ (Row 0: All sensors 0, resting state test)
* $m_2 = \overline{A}\overline{B}C\overline{D}$ (Row 2: Air pressure up, resting state)
* $m_5 = \overline{A}B\overline{C}D$ (Row 5: Part positioned, home position, low pressure test)
* $m_7 = \overline{A}BCD$ (Row 7: Part positioned, home position, pressure nominal)
* $m_8 = A\overline{B}\overline{C}\overline{D}$ (Row 8: Barrier breached, no part, no pressure, arm at rest)
* $m_{10} = A\overline{B}C\overline{D}$ (Row 10: Barrier breached, no part, pressure nominal, arm at rest)
* $m_{13} = AB\overline{C}D$ (Row 13: Barrier breached, part positioned, arm at home)
* $m_{15} = ABCD$ (Row 15: All sensors active simultaneously)

#### Your Objective

1. Calculate the state space size $S$ for this 4-input system.
2. Construct the exhaustive 16-cell 4-variable Karnaugh Map using strict Gray code row and column indexing.
3. Map the active minterms onto the K-Map grid.
4. Identify all Essential Prime Implicants, applying toroidal wrap-around rules where appropriate.
5. Extract the minimal Sum of Products (SOP) Boolean expression directly from the visual map.
6. Compare the gate count and input pin loading between the raw canonical SOP expression and the minimal K-Map simplified circuit.

---

### Step-by-Step Derivation

#### Step 1: Calculate State Space Size

The system has $N = 4$ binary input variables ($A, B, C, D$). The total state space $S$ is:

$$
S = 2^N = 2^4 = 16 \text{ cells}
$$

The minterms provided are: $m_0, m_2, m_5, m_7, m_8, m_{10}, m_{13}, m_{15}$.
In summation shorthand notation:

$$
Y = \sum m(0, 2, 5, 7, 8, 10, 13, 15)
$$

---

#### Step 2: Construct the 16-Cell Gray Code K-Map Grid

We construct a 4-variable grid with $AB$ on the rows and $CD$ on the columns, using Gray code sequence $00, 01, 11, 10$:

```text
BLANK 4-VARIABLE K-MAP GRID WITH CELL NUMBERS

             CD = 00       CD = 01       CD = 11       CD = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
  AB = 00 │   Cell 0    │   Cell 1    │   Cell 3    │   Cell 2    │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 01 │   Cell 4    │   Cell 5    │   Cell 7    │   Cell 6    │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 11 │   Cell 12   │   Cell 13   │   Cell 15   │   Cell 14   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 10 │   Cell 8    │   Cell 9    │   Cell 11   │   Cell 10   │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

---

#### Step 3: Populate Active Minterms onto the K-Map

We place a $1$ in Cells 0, 2, 5, 7, 8, 10, 13, and 15, and place a $0$ in all remaining cells:

```text
POPULATED GREENHOUSE CONTROL K-MAP

             CD = 00       CD = 01       CD = 11       CD = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
  AB = 00 │      1      │      0      │      0      │      1      │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 01 │      0      │      1      │      1      │      0      │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 11 │      0      │      1      │      1      │      0      │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
  AB = 10 │      1      │      0      │      0      │      1      │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Look at the populated grid pattern! Patterns of symmetry immediately emerge to the trained eye.

---

#### Step 4: Identify Rectangular Groups and Apply Toroidal Wrap-Around

Let us analyze the grid for optimal groups of size $2^k$:

##### Identification of Group 1: The Four Corners (Toroidal Wrap-Around)
Notice the $1$s located at the extreme corners of the map:
* Cell 0 ($AB=00, CD=00$)
* Cell 2 ($AB=00, CD=10$)
* Cell 8 ($AB=10, CD=00$)
* Cell 10 ($AB=10, CD=10$)

Because the left edge wraps around to the right edge, and the top edge wraps around to the bottom edge, these four corner cells form a valid, highly efficient **4-cell rectangular group**!

```text
GROUP 1: THE FOUR-CORNER GROUP (CELLS 0, 2, 8, 10)

  Cell 0 (1) ◄────────────────────────────────────────► Cell 2 (1)
      ▲                                                      ▲
      │                                                      │
      ▼                                                      ▼
  Cell 8 (1) ◄────────────────────────────────────────► Cell 10 (1)
```

##### Identification of Group 2: The Central 2x2 Square
Notice the block of four $1$s in the middle of the grid:
* Cell 5 ($AB=01, CD=01$)
* Cell 7 ($AB=01, CD=11$)
* Cell 13 ($AB=11, CD=01$)
* Cell 15 ($AB=11, CD=11$)

These four cells form a solid, self-contained **4-cell square group** ($2 \times 2$) in the center of the map!

```text
GROUP 2: THE CENTRAL 2x2 SQUARE (CELLS 5, 7, 13, 15)

             CD = 01       CD = 11
          ┌─────────────┬─────────────┐
  AB = 01 │      1      │      1      │
          ├─────────────┼─────────────┤
  AB = 11 │      1      │      1      │
          └─────────────┴─────────────┘
```

Have we covered all eight $1$s?
* $1$s covered by Group 1 (Corners): Cells 0, 2, 8, 10. (4 cells)
* $1$s covered by Group 2 (Center): Cells 5, 7, 13, 15. (4 cells)
* Total cells covered = $4 + 4 = 8$ cells.

Every single $1$ on the map is covered using **only two 4-cell groups**!

---

#### Step 5: Read Minimal Boolean Terms Directly Off the Grid

We now extract the simplified algebraic product terms for Group 1 and Group 2 using visual inspection.

##### Extracting Group 1 (Four Corners: Cells 0, 2, 8, 10)
* **Variable $A$**: Rows involved are $AB = 00$ and $AB = 10$. $A$ takes values $0$ and $1$. It changes! **DISCARD $A$**.
* **Variable $B$**: Rows involved are $AB = 00$ and $AB = 10$. $B = 0$ for all cells in Group 1. It stays constant at $0$. **KEEP $\overline{B}$**.
* **Variable $C$**: Columns involved are $CD = 00$ and $CD = 10$. $C$ takes values $0$ and $1$. It changes! **DISCARD $C$**.
* **Variable $D$**: Columns involved are $CD = 00$ and $CD = 10$. $D = 0$ for all cells in Group 1. It stays constant at $0$. **KEEP $\overline{D}$**.

Group 1 Term:

$$
\text{Term}_1 = \overline{B} \cdot \overline{D}
$$

##### Extracting Group 2 (Central Square: Cells 5, 7, 13, 15)
* **Variable $A$**: Rows involved are $AB = 01$ and $AB = 11$. $A$ takes values $0$ and $1$. It changes! **DISCARD $A$**.
* **Variable $B$**: Rows involved are $AB = 01$ and $AB = 11$. $B = 1$ for all cells in Group 2. It stays constant at $1$. **KEEP $B$**.
* **Variable $C$**: Columns involved are $CD = 01$ and $CD = 11$. $C$ takes values $0$ and $1$. It changes! **DISCARD $C$**.
* **Variable $D$**: Columns involved are $CD = 01$ and $CD = 11$. $D = 1$ for all cells in Group 2. It stays constant at $1$. **KEEP $D$**.

Group 2 Term:

$$
\text{Term}_2 = B \cdot D
$$

##### Final Minimal Sum of Products Expression
Combining Group 1 and Group 2 with a logical OR operator:

$$
Y_{\text{minimal}} = (\overline{B} \cdot \overline{D}) + (B \cdot D)
$$

Where:
* $Y_{\text{minimal}}$ is the minimal safety enable signal.
* $B$ is the part position sensor variable.
* $D$ is the robot arm home position sensor variable.

Look at this breathtaking simplification:
* The original canonical expression contained **8 four-variable product terms** (requiring eight 4-input AND gates and one 8-input OR gate, with 40 input pins).
* The K-Map optimized expression contains **two 2-variable product terms**: $Y = (\overline{B} \cdot \overline{D}) + (B \cdot D)$.
* Notice that variables $A$ (Light Curtain) and $C$ (Pressure Switch) **disappeared entirely from the equation**!

---

#### Step 6: Quantitative Hardware Optimization Comparison

Let us calculate the physical hardware savings achieved by Karnaugh Map spatial optimization:

```text
QUANTITATIVE HARDWARE OPTIMIZATION SUMMARY

 Metric                       │ Raw Canonical SOP │ K-Map Minimal SOP │ Improvement (%)
──────────────────────────────┼───────────────────┼───────────────────┼─────────────────
 Inverters (NOT gates)        │         4         │         2 (B', D')│  50.0% Reduction
 Level-1 Gates                │ 8 AND (4-input)   │ 2 AND (2-input)   │  75.0% Reduction
 Level-2 Gates                │ 1 OR (8-input)    │ 1 OR (2-input)    │  75.0% Pin Red.
 Total Physical Logic Gates   │ 13 gates          │ 5 gates           │  61.5% Reduction
 Total Input Pin Load         │ 44 pins           │ 8 pins            │  81.8% Reduction
 Max Gate Delay Levels        │ 3 levels          │ 2 levels          │  33.3% Faster!
```

---

### Sanity Check and Verification

To prove that our minimal K-Map expression $Y = (\overline{B} \cdot \overline{D}) + (B \cdot D)$ is 100% functionally identical to the 8-minterm specification, let us test three operational factory scenarios:

#### Scenario A: Robot at Home Position with Part Prepared ($B=1, D=1$)
* **Sensors**: Light curtain breached ($A=1$), pressure switch low ($C=0$), part on jig ($B=1$), arm at home ($D=1$).
* **Input Vector**: $ABCD = 1101_2$ (Cell 13).
* **Specification Check**: Cell 13 is one of our active minterms ($m_{13}$). Output MUST be $1$.
* **Minimal Formula Evaluation**:
  $Y = (\overline{1} \cdot \overline{1}) + (1 \cdot 1) = (0 \cdot 0) + (1) = 0 + 1 = 1$.
* **Result**: $Y = 1$. **MATCH!**

#### Scenario B: Resting Test State ($B=0, D=0$)
* **Sensors**: Light curtain clear ($A=0$), no part ($B=0$), no pressure ($C=0$), arm extended ($D=0$).
* **Input Vector**: $ABCD = 0000_2$ (Cell 0).
* **Specification Check**: Cell 0 is an active minterm ($m_0$). Output MUST be $1$.
* **Minimal Formula Evaluation**:
  $Y = (\overline{0} \cdot \overline{0}) + (0 \cdot 0) = (1 \cdot 1) + 0 = 1 + 0 = 1$.
* **Result**: $Y = 1$. **MATCH!**

#### Scenario C: Arm Extended in Motion Without Part ($B=0, D=1$)
* **Sensors**: Light curtain clear ($A=0$), no part ($B=0$), pressure nominal ($C=1$), arm extended in motion ($D=1$).
* **Input Vector**: $ABCD = 0011_2$ (Cell 3).
* **Specification Check**: Cell 3 was NOT in our minterm list. Output MUST be $0$ (Emergency Stop!).
* **Minimal Formula Evaluation**:
  $Y = (\overline{0} \cdot \overline{1}) + (0 \cdot 1) = (1 \cdot 0) + 0 = 0 + 0 = 0$.
* **Result**: $Y = 0$. **SAFETY STOP PROVEN!**

The K-Map minimal circuit is 100% mathematically accurate, uses 61.5% fewer physical gates, and is fully verified for industrial production.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Gray Code Indexing**: A non-binary positional numbering system where adjacent values differ by exactly one binary bit position (unit distance adjacency), enabling physical spatial adjacency on a grid to represent logical algebraic adjacency.
* **Karnaugh Map (K-Map) Grouping**: A visual, two-dimensional spatial optimization technique that maps $2^N$ truth table states onto a Gray-code-indexed grid, allowing minimal Sum of Products terms to be extracted by looping rectangular clusters of $2^k$ adjacent $1$s and discarding variables that change across the group.
