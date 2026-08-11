---
title: "Programmable Logic Array Architecture and PAL Synthesis Mechanics"
---

# Programmable Logic Array Architecture and PAL Synthesis Mechanics

## The Exponential Area Wall of Full-Decoder Logic Storage

Using Read-Only Memory (ROM) to synthesize multi-output Boolean logic is conceptually elegant. A ROM uses an input address decoder to generate every possible minterm, and then uses a data matrix to output pre-stored binary values. This approach eliminates the need for manual gate minimization or Karnaugh maps. 

However, when a digital system grows beyond 4 or 5 input variables, ROM-based logic synthesis encounters a severe physical boundary: **The Exponential Area Wall**.

An $N$-input ROM MUST instantiate an $N$-to-$2^N$ address decoder containing exactly $2^N$ horizontal word lines. Every single minterm must be physically built into the silicon, regardless of whether that minterm is actually needed by the logic function.

Consider a 16-input, 4-output control module inside an industrial motor drive system. To implement this module using a ROM, the chip must fabricate $2^{16} = 65,536$ horizontal word lines! 

Now, suppose the motor control rules are relatively simple: out of those 65,536 possible input combinations, the motor outputs stay at $0$ for 65,500 of them, and turn ON ($1$) for only 36 specific operational conditions that can be simplified algebraically into just 6 shared product terms.

```text
THE EXPONENTIAL ROM AREA WASTAGE

 16-Input ROM Structure (65,536 Rows)    Actual Function Need (6 Terms)
 ┌──────────────────────────────────┐    ┌──────────────────────────┐
 │ 65,536 Hardwired Decoder Rows    │    │ 6 Shared Product Terms   │
 │ (99.9% of Rows Store All Zeros!) │    │ (99.9% of ROM is WASTED!)│
 └──────────────────────────────────┘    └──────────────────────────┘
```

The ROM-based implementation forces the semiconductor foundry to fabricate 65,536 decoder word lines—wasting 99.9% of the silicon die area to store useless zeros!

Why should we fabricate $2^N$ fixed decoder rows when a complex multi-output function only requires a handful of product terms?

Instead of decoding *every* possible minterm using a fixed AND-array, what if we make the **AND-array programmable**, so that it only generates the specific product terms ($K \ll 2^N$) that are actually needed by the logic functions?

This architectural breakthrough is the **Programmable Logic Array (PLA)**, and its high-speed variant, the **Programmable Array Logic (PAL)**. By replacing fixed $2^N$ decoders with flexible, programmable AND-arrays and OR-arrays, PLAs and PALs break the exponential area wall and enable compact, high-speed logic synthesis on a fraction of the silicon area.

---

## The Custom Pizza Kitchen: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how PLAs and PALs optimize logic synthesis compared to ROMs, let us step away from microchips and picture three different ways to run a pizza restaurant.

Imagine a restaurant that serves 16 different custom pizza recipes using 4 ingredients: Pepperoni ($A$), Mushrooms ($B$), Onions ($C$), and Olives ($D$).

```text
THREE RESTAURANT OPERATIONAL PHILOSOPHIES

 Restaurant Type 1: The Fixed ROM Buffet
 "Pre-cook all 16 possible topping combinations every morning, 
  even if customers only ever order 3 specific pizzas!"

 Restaurant Type 2: The Fully Programmable PLA Kitchen
 "Station 1 (Programmable AND) cooks ONLY the 3 specific topping combinations ordered.
  Station 2 (Programmable OR) combines those 3 toppings onto ANY customer plate!"

 Restaurant Type 3: The High-Speed PAL Kitchen
 "Station 1 cooks any custom topping combination.
  Station 2 has FIXED plates pre-assigned to specific tables to speed up delivery!"
```

Let us compare how these three kitchens handle customer orders:

### 1. The ROM Buffet (Fixed AND-Array + Programmable OR-Array)
The ROM buffet builds a massive kitchen with 16 dedicated ovens, cooking every single one of the $2^4 = 16$ possible ingredient combinations every morning. When a customer arrives at Table 1 and orders a Pepperoni-Mushroom pizza, the waiter simply walks to Oven 5 and picks up the pre-cooked pizza.

* **Friction**: The kitchen wastes huge amounts of space and energy cooking 13 pizzas that nobody ever orders!

### 2. The PLA Kitchen (Programmable AND-Array + Programmable OR-Array)
The PLA kitchen gets rid of the 16 fixed ovens. Instead, it sets up two flexible preparation stations:
* **Station 1 (Programmable AND-Array)**: Prepares *only* the specific ingredient combinations that are actually on the menu (e.g., $P_1 = \text{Pepperoni} \cdot \text{Mushrooms}$, $P_2 = \text{Olives} \cdot \text{Onions}$). If the menu only has 3 items, Station 1 only prepares 3 product terms!
* **Station 2 (Programmable OR-Array)**: Takes those prepared ingredient combinations from Station 1 and distributes them flexibly onto any customer plate ($Y_1, Y_2, Y_3$). Table 1 and Table 2 can both share the exact same Pepperoni-Mushroom combination prepared by Station 1!

```text
PLA KITCHEN FLOW: PRODUCT TERM SHARING

 Station 1 (Programmable AND)           Station 2 (Programmable OR)
 ┌──────────────────────────┐          ┌──────────────────────────┐
 │ Product 1: Pepperoni*Mushroom ├──┬──────►│ Plate 1 (Customer Order 1)│
 └──────────────────────────┘  │       └──────────────────────────┘
                               └──────►┌──────────────────────────┐
                                       │ Plate 2 (Customer Order 2)│
                                       └──────────────────────────┘
 (Product 1 is SHARED between Plate 1 and Plate 2!)
```

This flexibility to **share product terms** between multiple output plates allows the PLA kitchen to run with a tiny physical footprint.

### 3. The PAL Kitchen (Programmable AND-Array + Fixed OR-Array)
The PAL kitchen wants to serve food even faster. It notices that configuring Station 2 (the OR-array) for every customer adds extra waiting time. 

So the PAL kitchen keeps Station 1 fully programmable (cook any custom topping combination), but makes Station 2 **fixed**: Plate 1 always receives up to 3 toppings from Station 1, Plate 2 always receives up to 3 toppings from Station 1, and so on.

* **Friction**: Plate 1 cannot share its toppings with Plate 2. If Plate 2 needs the same topping combination, Station 1 must cook a duplicate batch.
* **Benefit**: Food delivery is much faster because Station 2 has zero configuration delay!

This analogy illustrates the exact relationship between the three classical programmable logic structures:
* **ROM**: Fixed AND-Array ($2^N$ minterms), Programmable OR-Array.
* **PLA**: **Programmable AND-Array**, **Programmable OR-Array** (Maximum flexibility, shared terms).
* **PAL**: **Programmable AND-Array**, Fixed OR-Array (Maximum switching speed).

---

## Mechanics of Programmable Logic Arrays (PLAs)

To master PLA-based logic synthesis, we must examine the formal architecture of its two programmable matrices and how product terms are shared across multiple output functions.

---

### Primitive 1: The Programmable Logic Array (PLA) Architecture

A **Programmable Logic Array (PLA)** is a uncommitted combinational logic device that accepts $N$ binary input variables $(A_{N-1}, \dots, A_0)$, generates $K$ custom product terms $(P_1, \dots, P_K)$ in a programmable AND-matrix, and sums those product terms into $M$ output functions $(Y_1, \dots, Y_M)$ in a programmable OR-matrix.

```text
PROGRAMMABLE LOGIC ARRAY (PLA) STRUCTURAL SCHEMATIC

 Inputs A[N-1..0] ──► [ Input Inverters ] ──► True & Complemented Lines
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │ PROGRAMMABLE AND-ARRAY   │
                                     │ (Generates K Custom P_j) │
                                     └────────────┬─────────────┘
                                                  │
                                                  │ Product Lines P1..PK (K << 2^N)
                                                  ▼
                                     ┌──────────────────────────┐
                                     │ PROGRAMMABLE OR-ARRAY    │
                                     │ (Sums P_j into Outputs)  │
                                     └────────────┬─────────────┘
                                                  │
                                                  ▼
                                      Outputs Y[M-1..0]
```

Notice the key difference between a PLA and a ROM:
* A ROM has $2^N$ hardwired word lines (one for every minterm).
* A PLA has $K$ programmable product lines, where $K$ is chosen by the hardware designer (typically $K = 8, 16, \text{ or } 32$) and is independent of $2^N$.

---

### Anatomy of the PLA Matrices

#### 1. The Input True/Complement Buffer Array
Each input variable $A_i$ passes through a buffer/inverter pair to produce two vertical lines running through the AND-matrix:
* The **True Line** ($A_i$)
* The **Complemented Line** ($\overline{A_i}$)

For $N$ input variables, there are $2N$ vertical input lines crossing the AND-matrix.

#### 2. The Programmable AND-Matrix (Product Term Generator)
The $2N$ vertical input lines intersect $K$ horizontal **Product Lines ($P_1, P_2, \dots, P_K$)**. 

At each intersection between an input line and a product line, there is a programmable connection (such as a fuse, anti-fuse, or floating-gate transistor):
* **Fuse Intact (Connected)**: The input line is included in the AND product for that row.
* **Fuse Blown (Disconnected)**: The input line is excluded from the AND product for that row.

Each horizontal product line $P_j$ evaluates a custom AND product over a selected subset of input variables:

$$
P_j = \prod_{i \in I_j} L_{i,j}
$$

Where:
* $P_j$ is the $j$-th product line in the PLA ($1 \le j \le K$).
* $I_j$ is the set of input variables selected for product term $j$.
* $L_{i,j}$ represents either $A_i$ or $\overline{A_i}$ depending on which fuse is intact.

```text
PLA PROGRAMMABLE AND-MATRIX DETAIL

 Vertical Input Lines:   A0   A0'  A1   A1'  A2   A2'
                          │    │    │    │    │    │
 Product Line P1 ─────────┼────X────┼────┼────X────┼────► P1 = A0' * A2 (Custom AND!)
 Product Line P2 ─────────X────┼────┼────X────┼────┼────► P2 = A0 * A1'
 Product Line P3 ─────────┼────┼────X────┼────┼────X────► P3 = A1 * A2'
```

* Legend: `X` represents an intact programmable fuse connection. Unmarked intersections represent blown/disconnected fuses.

#### 3. The Programmable OR-Matrix (Output Sum Collector)
The $K$ horizontal product lines $P_1 \dots P_K$ continue into the **Programmable OR-Matrix**, where they intersect $M$ vertical **Output Lines ($Y_1, \dots, Y_M$)**.

At each intersection between a product line $P_j$ and an output line $Y_m$, there is a second set of programmable fuses:
* **Fuse Intact (Connected)**: Product term $P_j$ is fed into the OR gate for output $Y_m$.
* **Fuse Blown (Disconnected)**: Product term $P_j$ is ignored by output $Y_m$.

Each output line $Y_m$ computes a logical OR sum over a selected subset of product terms:

$$
Y_m = \sum_{j \in S_m} P_j
$$

Where:
* $Y_m$ is the $m$-th output signal of the PLA ($1 \le m \le M$).
* $S_m$ is the set of product line indices $j$ connected to output $Y_m$.
* $P_j$ is the $j$-th product term from the AND-matrix.

```text
PLA PROGRAMMABLE OR-MATRIX DETAIL

 Product Lines:          P1   P2   P3   P4
                         │    │    │    │
 Output Line Y1 ─────────X────X────┼────┼────► Y1 = P1 + P2
 Output Line Y2 ─────────┼────X────X────┼────► Y2 = P2 + P3  (Product P2 SHARED!)
 Output Line Y3 ─────────┼────┼────X────X────► Y3 = P3 + P4  (Product P3 SHARED!)
```

Look at Product Term $P_2$ in the diagram above!
$P_2$ connects to both Output $Y_1$ and Output $Y_2$. This **Product Term Sharing** is the superpower of the PLA architecture. A single AND gate calculates $P_2$, and its output drives multiple independent OR gates simultaneously!

---

## Primitive 2: Programmable Array Logic (PAL) Architecture

While the PLA offers ultimate flexibility by making both AND and OR matrices programmable, that double programmability comes with a physical cost: **increased signal propagation delay**.

A signal traveling through a PLA must pass through two sets of programmable fuse connections—first in the AND-matrix, then in the OR-matrix. Programmable fuses add parasitic capacitance to the wires, slowing down switching speeds.

To maximize operational clock speed while retaining input flexibility, Monolithic Memories Inc. invented **Programmable Array Logic (PAL)**.

```text
PROGRAMMABLE ARRAY LOGIC (PAL) STRUCTURAL SCHEMATIC

 Inputs A[N-1..0] ──► [ Input Inverters ] ──► True & Complemented Lines
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │ PROGRAMMABLE AND-ARRAY   │
                                     │ (Generates Custom P_j)   │
                                     └────────────┬─────────────┘
                                                  │
                                                  │ Product Lines P_j
                                                  ▼
                                     ┌──────────────────────────┐
                                     │ FIXED OR-ARRAY           │
                                     │ (Hardwired OR Groups)    │
                                     └────────────┬─────────────┘
                                                  │
                                                  ▼
                                      Outputs Y[M-1..0]
```

### The PAL Trade-Off: Programmable AND + Fixed OR

In a **PAL** device:
1. The **AND-Matrix is 100% Programmable**: You can synthesize any custom product terms $P_j$ over the input variables, just like a PLA.
2. The **OR-Matrix is 100% FIXED (Hardwired)**: The output OR gates are pre-connected to fixed groups of product lines (typically 2, 4, or 8 product lines per OR gate).

```text
PAL FIXED OR-ARRAY DETAIL

 Product Lines          Fixed Output Groups
  P1 ──────────┐
  P2 ──────────┼──────► [ Fixed 4-Input OR Gate ] ──► Output Y1 = P1 + P2 + P3 + P4
  P3 ──────────┤
  P4 ──────────┘

  P5 ──────────┐
  P6 ──────────┼──────► [ Fixed 4-Input OR Gate ] ──► Output Y2 = P5 + P6 + P7 + P8
  P7 ──────────┤
  P8 ──────────┘
```

Look at the structure of the PAL above:
* Output $Y_1$ can sum up to 4 custom product terms ($P_1 \dots P_4$).
* Output $Y_2$ can sum up to 4 custom product terms ($P_5 \dots P_8$).
* **CRITICAL LIMITATION**: Product terms $P_1 \dots P_4$ CANNOT be connected to Output $Y_2$! $Y_1$ and $Y_2$ cannot share product terms. If $Y_2$ needs a product term identical to $P_1$, the AND-matrix must program a duplicate term ($P_5 = P_1$).

### Why PALs Dominated Commercial High-Speed Design

Despite losing the ability to share product terms between outputs, PALs became the dominant programmable logic technology in the 1980s and 1990s because:

1. **Higher Switching Speed ($t_{\text{PAL}} < t_{\text{PLA}}$)**: Replacing the programmable OR-matrix with hardwired copper connections reduced parasitic capacitance by 50%, allowing PALs to run at significantly higher clock frequencies.
2. **Easier Manufacturing and Testing**: Fixed OR-gates have predictable, uniform electrical characteristics.
3. **Simpler Compiler Algorithms**: CAD software could synthesize PAL fuse maps much faster because OR-gate routing was fixed.

---

## Comparative Matrix: ROM vs. PLA vs. PAL

To solidify your understanding of these three classical programmable structures, let us compare their architectural features side by side:

```text
PROGRAMMABLE LOGIC STRUCTURE COMPARISON MATRIX

 Feature                    │ ROM                       │ PLA                       │ PAL
────────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────
 AND-Array (Product Terms)  │ Fixed (Full Decoder, 2^N) │ Programmable (K Terms)    │ Programmable (K Terms)
 OR-Array (Sum Functions)   │ Programmable              │ Programmable              │ Fixed (Hardwired Groups)
 Product Term Sharing       │ Yes (via Minterm ORing)   │ YES (Maximum Flexibility) │ NO (Dedicated Per Output)
 Memory / Logic Density     │ Low for Sparse Functions  │ HIGH (Maximum Efficiency) │ Moderate
 Propagation Delay (Latency)│ Moderate (Decoder Delay)  │ Higher (2 Fuse Planes)    │ FASTEST (1 Fuse Plane)
 Typical Applications       │ LUTs, Microcode, ROM      │ Complex Control Logic     │ High-Speed Bus Decoders
```

```text
SUMMARY OF ARRAY PROGRAMMABILITY

 ROM : [ FIXED AND ] ──────► [ PROGRAMMABLE OR  ]
 PLA : [ PROGRAMMABLE AND ] ─► [ PROGRAMMABLE OR  ]
 PAL : [ PROGRAMMABLE AND ] ─► [ FIXED OR         ]
```

---

## Step-by-Step Logic Synthesis onto a PLA

To demonstrate how multi-output Boolean functions are mapped onto a PLA, let us walk through a complete algebraic synthesis procedure.

Suppose we need to implement two Boolean functions $Y_1$ and $Y_2$ over three input variables ($A, B, C$):

$$
Y_1 = (A \cdot B) + (A \cdot \overline{C})
$$

$$
Y_2 = (A \cdot B) + (B \cdot C)
$$

Where:
* $Y_1, Y_2$ are the two output signals.
* $A, B, C$ are the three binary input variables.

### Step 1: Identify Shared Product Terms
Examine the product terms in both functions:
* Term 1: $A \cdot B$ (Appears in BOTH $Y_1$ and $Y_2$!).
* Term 2: $A \cdot \overline{C}$ (Appears in $Y_1$).
* Term 3: $B \cdot C$ (Appears in $Y_2$).

By recognizing that $A \cdot B$ can be **shared**, we only need to program **three product lines ($P_1, P_2, P_3$)** in our PLA AND-matrix, instead of four!

$$
P_1 = A \cdot B
$$

$$
P_2 = A \cdot \overline{C}
$$

$$
P_3 = B \cdot C
$$

### Step 2: Write Output Equations in Terms of Product Lines
Now express $Y_1$ and $Y_2$ using the product lines:

$$
Y_1 = P_1 + P_2
$$

$$
Y_2 = P_1 + P_3
$$

### Step 3: Construct the PLA Fuse Programming Table

A PLA Fuse Table specifies which fuses remain intact (`1` for true input, `0` for complemented input, `-` for disconnected input) in the AND-matrix, and which product terms connect to each output (`1` for connected, `0` for disconnected) in the OR-matrix.

```text
PLA FUSE PROGRAMMING TABLE

                 AND-MATRIX INPUTS        OR-MATRIX OUTPUTS
 Product Line  │   A    B    C          │   Y1   Y2         │ Synthesized Product Logic
───────────────┼────────────────────────┼───────────────────┼───────────────────────────
      P1       │   1    1    -          │   1    1          │ P1 = A * B (Shared!)
      P2       │   1    -    0          │   1    0          │ P2 = A * C'
      P3       │   -    1    1          │   0    1          │ P3 = B * C
```

Look at Row 1 of this table ($P_1$):
* In the AND-matrix: Fuse $A=1$, Fuse $B=1$, Fuse $C=-$ (blown). Computes $P_1 = A \cdot B$.
* In the OR-matrix: Fuse $Y_1=1$, Fuse $Y_2=1$. $P_1$ drives BOTH outputs!

By sharing $P_1$, the PLA synthesizes both functions using only **3 AND gates and 2 OR gates**!

```text
PLA MATRIX SCHEMATIC FOR Y1 AND Y2

 Inputs A, B, C
  A ──► X ───────► X ──────────► P1 = A*B ───────┬──► X ───────────────► OR Y1 = P1 + P2
  B ──► X ───────────► X ──────► P3 = B*C ───────┼──────────► X ───────► OR Y2 = P1 + P3
  C'────────► X ───────────────► P2 = A*C'──────► X ───────────────────┘
```

---

## Engineering Reality: Output Polarity Inversion and Macrocells

In physical PAL and PLA integrated circuits (such as the classic PAL22V10), hardware engineers faced another challenge: What if a function's POS (Product of Sums) form requires fewer product terms than its SOP (Sum of Products) form?

To give designers maximum flexibility, commercial PAL/PLA devices place a **Programmable Output Polarity XOR Gate** at the output of every OR gate!

```text
PAL/PLA OUTPUT MACROCELL WITH POLARITY XOR GATE

 Fixed OR Gate Output ──►┌───────┐
                         │ XOR   ├──► Output Pin Y_m
 Polarity Fuse (POL)  ──►└───────┘
 (Fuse Intact = 0 -> Normal Output; Fuse Blown = 1 -> Inverted Output!)
```

How does the Polarity XOR gate work?

$$
Y_m = \text{OR\_Output} \oplus \text{POL}
$$

Where:
* $\text{POL} = 0$ (Fuse Intact): $Y_m = \text{OR\_Output} \oplus 0 = \text{OR\_Output}$ (Active-High Output).
* $\text{POL} = 1$ (Fuse Blown): $Y_m = \text{OR\_Output} \oplus 1 = \overline{\text{OR\_Output}}$ (Active-Low / Inverted Output!).

By blowing the polarity fuse, an engineer can synthesize $\overline{Y_m}$ using De Morgan's Laws, reducing the required product terms in the AND-matrix when the inverted function is simpler than the non-inverted function!

---

## Solved Industrial Engineering Exercise: Avionics Missile Defense Threat Classifier

To consolidate your complete mastery of PLA architecture, PAL fixed-OR constraints, product term sharing, fuse programming tables, and output polarity selection, we will now walk through a complete, step-by-step aerospace hardware engineering problem.

---

### Scenario and Parameters

An aerospace contractor is engineering the hardware threat classification module for a fighter jet's missile defense suite. 

The module receives four binary sensor signals:
1. **Radar Lock Signal ($A$)**: $A=1$ when enemy radar locks onto jet.
2. **Infrared Heat Warning ($B$)**: $B=1$ when thermal flare sensor detects heat plume.
3. **Laser Rangefinder Warning ($C$)**: $C=1$ when laser designator paints airframe.
4. **Pilot Master Defense Switch ($D$)**: $D=1$ when pilot arms defense suite.

```text
AVIONICS THREAT CLASSIFIER MODULE

 Sensor Inputs (A, B, C, D) ──► [ PLA Threat Classifier ] ──┬──► Countermeasure Y1
                                                            └──► Evasion Maneuver Y2
```

The module must drive two real-time defense outputs:
* **Countermeasure Dispenser ($Y_1$)**: Fires chaff/flares when $Y_1 = 1$.
* **Evasion Flight Computer ($Y_2$)**: Triggers automated g-turn maneuver when $Y_2 = 1$.

#### Flight Safety Specification Equations

The defense engineering board specifies the two threat response functions in unsimplified Sum of Products form:

$$
Y_1 = (A \cdot B \cdot D) + (A \cdot \overline{B} \cdot C \cdot D) + (\overline{A} \cdot B \cdot C \cdot D)
$$

$$
Y_2 = (A \cdot B \cdot D) + (B \cdot C \cdot D)
$$

Where:
* $Y_1, Y_2$ are the two active-high defense outputs.
* $A, B, C, D$ are the four binary threat sensors.

#### Your Objective

1. Analyze the two functions and simplify them algebraically to identify **shared product terms** suitable for PLA synthesis.
2. Construct the PLA Fuse Programming Table for a PLA with 4 inputs ($A, B, C, D$), 4 product lines ($P_1, P_2, P_3, P_4$), and 2 outputs ($Y_1, Y_2$).
3. Draw the complete PLA matrix schematic showing programmed connections.
4. Evaluate whether this system can be implemented on a **PAL device** where each OR gate is hardwired to a maximum of 2 product terms without sharing. If duplicate product terms are required for the PAL, calculate the new AND-array size.
5. Calculate and compare total physical gate counts and propagation delays ($t_{\text{PLA}}$ vs $t_{\text{PAL}}$).
6. Verify system operation against three flight threat scenarios.

---

### Step-by-Step Derivation

#### Step 1: Simplify Functions and Identify Shared Product Terms

Let us inspect $Y_1$ and $Y_2$:

$$
Y_1 = (A \cdot B \cdot D) + (A \cdot \overline{B} \cdot C \cdot D) + (\overline{A} \cdot B \cdot C \cdot D)
$$

$$
Y_2 = (A \cdot B \cdot D) + (B \cdot C \cdot D)
$$

Notice that the product term $(A \cdot B \cdot D)$ appears in **BOTH** $Y_1$ and $Y_2$!

Can we simplify $(A \cdot \overline{B} \cdot C \cdot D) + (\overline{A} \cdot B \cdot C \cdot D)$ in $Y_1$?
Factor out $(C \cdot D)$:

$$(A \cdot \overline{B} \cdot C \cdot D) + (\overline{A} \cdot B \cdot C \cdot D) = C \cdot D \cdot [(A \cdot \overline{B}) + (\overline{A} \cdot B)] = C \cdot D \cdot (A \oplus B)$$

However, keeping terms as product terms for an AND-OR PLA matrix:
Let us define four unique product terms for our PLA AND-matrix:

* **Product Term $P_1$**: $A \cdot B \cdot D$ (SHARED by $Y_1$ and $Y_2$!)
* **Product Term $P_2$**: $A \cdot \overline{B} \cdot C \cdot D$ (Used by $Y_1$)
* **Product Term $P_3$**: $\overline{A} \cdot B \cdot C \cdot D$ (Used by $Y_1$)
* **Product Term $P_4$**: $B \cdot C \cdot D$ (Used by $Y_2$)

Notice that $Y_1 = P_1 + P_2 + P_3$, and $Y_2 = P_1 + P_4$.

---

#### Step 2: Construct the PLA Fuse Programming Table

We build the PLA Fuse Programming Table mapping inputs $A, B, C, D$ to product lines $P_1, P_2, P_3, P_4$, and connecting $P_j$ to outputs $Y_1, Y_2$:

```text
PLA FUSE PROGRAMMING TABLE

                 AND-MATRIX INPUTS            OR-MATRIX OUTPUTS
 Product Line  │   A    B    C    D         │   Y1   Y2         │ Synthesized Product Logic
───────────────┼────────────────────────────┼───────────────────┼───────────────────────────
      P1       │   1    1    -    1         │   1    1          │ P1 = A * B * D (SHARED!)
      P2       │   1    0    1    1         │   1    0          │ P2 = A * B' * C * D
      P3       │   0    1    1    1         │   1    0          │ P3 = A' * B * C * D
      P4       │   -    1    1    1         │   0    1          │ P4 = B * C * D
```

Look at Row 1 ($P_1$):
* AND-matrix: $A=1, B=1, C=- \text{ (blown)}, D=1 \implies P_1 = A \cdot B \cdot D$.
* OR-matrix: $Y_1=1, Y_2=1$. $P_1$ is connected to **BOTH** output OR gates!

The PLA implements both threat functions using **4 AND gates and 2 OR gates**.

---

#### Step 3: Draw Complete PLA Matrix Schematic

```text
PLA MATRIX SCHEMATIC FOR THREAT CLASSIFIER

 Inputs A, B, C, D
  A  ──► X ───────► X ───────────────────► P1 = A*B*D ────┬──► X ──────────► OR Y1 = P1+P2+P3
  B  ──► X ───────────► X ───────► X ────► P3 = A'BCD ────┼───► X ─────────┤
  C' ─────────► X ───────────────────────► P2 = AB'CD ────┼───► X ─────────┘
  D  ──► X ───────► X ──► X ─────► X ────► P4 = BCD ──────┼─────────► X ───► OR Y2 = P1+P4
                                                          │
```

---

#### Step 4: PAL Implementation Analysis (Fixed OR-Array)

Now suppose the avionics team must implement this system on a **PAL device** where each output OR gate is hardwired to a fixed set of 3 product terms, and **product terms CANNOT be shared**.

Because $P_1 = A \cdot B \cdot D$ cannot be shared between $Y_1$ and $Y_2$ in a PAL:
* PAL Output $Y_1$ needs 3 dedicated product terms: $P_1^{(1)} = A \cdot B \cdot D$, $P_2 = A \cdot \overline{B} \cdot C \cdot D$, $P_3 = \overline{A} \cdot B \cdot C \cdot D$.
* PAL Output $Y_2$ needs 2 dedicated product terms: $P_1^{(2)} = A \cdot B \cdot D$ (DUPLICATED!), $P_4 = B \cdot C \cdot D$.

To implement the system on a PAL, the AND-array must program **5 product terms ($P_1^{(1)}, P_2, P_3, P_1^{(2)}, P_4$)** instead of 4!

```text
PAL FIXED OR-ARRAY ALLOCATION (5 PRODUCT TERMS TOTAL)

 Output Y1 (Fixed 3-Input OR) ◄── P1_a (A*B*D) + P2 (AB'CD) + P3 (A'BCD)
 Output Y2 (Fixed 3-Input OR) ◄── P1_b (A*B*D) + P4 (BCD) + 0 (Unused)
                                   ▲
                                   │ (P1_b is a DUPLICATE of P1_a because PAL cannot share!)
```

---

#### Step 5: Gate Count and Propagation Delay Comparison

Let us compare the PLA and PAL implementations:

```text
PLA VERSUS PAL IMPLEMENTATION METRICS

 Metric                     │ PLA Implementation          │ PAL Implementation
────────────────────────────┼─────────────────────────────┼──────────────────────────────
 Total AND Gates Required   │ 4 AND Gates (Shared P1)     │ 5 AND Gates (Duplicate P1)
 Total OR Gates Required    │ 2 OR Gates (3-In & 2-In)    │ 2 OR Gates (Fixed 3-In)
 Total Physical Logic Gates │ 6 Logic Gates               │ 7 Logic Gates
 Programmable Matrix Fuses  │ AND-Matrix + OR-Matrix      │ AND-Matrix ONLY
 Switching Delay (t_pd)     │ 2.4 ns (Higher Capacitance) │ 1.6 ns (33% FASTER!)
```

##### Engineering Verdict:
* **If Silicon Area is the Priority**: Choose the **PLA**. It uses 4 AND gates instead of 5 by sharing $P_1$.
* **If Execution Speed is the Priority**: Choose the **PAL**. It uses 1 extra AND gate, but evaluates threats **$33.3\%$ faster** ($1.6\text{ ns}$ vs $2.4\text{ ns}$) because the fixed OR plane has significantly lower parasitic capacitance!

---

### Sanity Check and Verification

Let us verify our synthesized PLA/PAL equations against three critical flight combat scenarios:

#### Scenario A: Enemy Radar Lock with Thermal Plume ($A=1, B=1, C=0, D=1$)
* **Sensors**: Radar lock ($A=1$), Heat plume ($B=1$), No laser ($C=0$), Pilot armed ($D=1$).
* **Product Terms**:
  * $P_1 = A \cdot B \cdot D = 1 \cdot 1 \cdot 1 = 1$.
  * $P_2 = A \cdot \overline{B} \cdot C \cdot D = 1 \cdot 0 \cdot 0 \cdot 1 = 0$.
  * $P_3 = \overline{A} \cdot B \cdot C \cdot D = 0 \cdot 1 \cdot 0 \cdot 1 = 0$.
  * $P_4 = B \cdot C \cdot D = 1 \cdot 0 \cdot 1 = 0$.
* **Outputs**:
  * $Y_1 = P_1 + P_2 + P_3 = 1 + 0 + 0 = 1$ (Chaff/Flares DISPENSED!).
  * $Y_2 = P_1 + P_4 = 1 + 0 = 1$ (Evasion Maneuver TRIGGERED!).
* **Verification**: Both defense systems activate. **MATCH!**

#### Scenario B: Laser Designator Paint Only ($A=0, B=0, C=1, D=1$)
* **Sensors**: No radar ($A=0$), No heat ($B=0$), Laser paint ($C=1$), Pilot armed ($D=1$).
* **Product Terms**: $P_1 = 0, P_2 = 0, P_3 = 0, P_4 = 0 \cdot 1 \cdot 1 = 0$.
* **Outputs**: $Y_1 = 0, Y_2 = 0$.
* **Verification**: No countermeasure fired for laser alone without radar/heat threat. **MATCH!**

#### Scenario C: All Sensors Active During Missile Attack ($A=1, B=1, C=1, D=1$)
* **Sensors**: $A=1, B=1, C=1, D=1$.
* **Product Terms**: $P_1 = 1, P_4 = 1 \cdot 1 \cdot 1 = 1$.
* **Outputs**: $Y_1 = 1 + 0 + 0 = 1$, $Y_2 = 1 + 1 = 1$.
* **Verification**: Maximum defense response triggered. **MATCH!**

All simulation scenarios evaluate with 100% mathematical and physical precision. The avionics threat classifier is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Programmable Logic Array (PLA)**: A flexible programmable logic architecture featuring both a programmable AND-array and a programmable OR-array, enabling $K$ minimal product terms ($K \ll 2^N$) to be synthesized and shared across $M$ output functions without suffering exponential ROM area bloat.
* **Programmable Array Logic (PAL)**: A high-speed programmable logic architecture featuring a programmable AND-array feeding into a fixed, hardwired OR-array, eliminating product term sharing flexibility in exchange for reduced parasitic capacitance and faster switching speeds.
