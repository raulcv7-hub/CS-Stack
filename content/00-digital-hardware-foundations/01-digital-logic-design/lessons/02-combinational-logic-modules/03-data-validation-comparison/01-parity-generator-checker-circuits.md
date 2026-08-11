# Parity Generator and Checker Circuit Synthesis with Balanced XOR Error Detection Trees

## The Vulnerability of Physical Digital Data to Transmit Noise

Inside a sealed, ideal digital simulator, binary digits move from one logic component to another with absolute perfection. A binary $1$ stays a solid $1$, and a binary $0$ stays a solid $0$. However, when digital data leaves the controlled environment of a single logic block and travels across physical copper traces, motherboard buses, ribbon cables, or wireless radio links, it enters a hostile physical universe.

Physical transmission channels are exposed to constant environmental disruptions:
1. **Electromagnetic Interference (EMI)**: Nearby electric motors, radio transmitters, and power supplies emit magnetic fields that induce unwanted voltage spikes on copper traces.
2. **Crosstalk**: High-speed signals traveling along one wire in a dense ribbon cable inductively leak energy into adjacent parallel wires.
3. **Power Supply Voltage Ripples**: Sudden fluctuations in a system's main power rail can cause logic thresholds to momentarily dip.
4. **Cosmic Rays and Alpha Particles**: Subatomic particles passing through microscopic CMOS silicon transistors can deposit electrical charge, flipping stored bits in RAM or transmission buffers.

These physical phenomena cause **Bit Flips**—a transient error where a wire carrying a logical $0$ momentarily spikes to a $1$, or a wire carrying a $1$ drops to a $0$.

```text
THE BIT FLIP CORRUPTION EVENT

 Transmitter Node                Physical Wire                Receiver Node
 ┌───────────────┐     10010110  ┌──────────┐  10011110     ┌───────────────┐
 │ Data Payload  ├──────────────►│ EMI NOISE│──────────────►│ Corrupted Data│
 └───────────────┘               └────┬─────┘               └───────┬───────┘
                                      │                             │
                                      ▼                             ▼
                            Bit 3 Flips (0 -> 1)!        CPU Executes Wrong
                                                         Instruction & Crashes!
```

Consider the consequences of an undetected bit flip. If a 8-bit data word representing a spacecraft thruster duration command of $00000001_2$ ($1$ second) experiences a single bit flip on bit position 7 during transmission, the receiver reads $10000001_2$ ($129$ seconds). The engine fires 129 times longer than intended, throwing the spacecraft completely off trajectory.

Connecting data buses directly between systems without error detection is an unacceptable engineering risk. However, adding full error-correcting memory buffers or complex software checksum algorithms to every single 8-bit bus adds massive circuit complexity, increases manufacturing costs, and introduces intolerable processing latency.

To protect digital channels at hardware speeds, digital engineering uses a lightweight, ultra-fast combinational error detection mechanism: the **Parity Generator and Checker**. By appending a single redundant verification bit—a **Parity Bit**—calculated using a **Balanced XOR Error Detection Tree**, receiver nodes can instantaneously detect any single-bit transmission corruption before data is passed to critical system registers.

---

## The Supermarket Cart Receipt Stamp: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of parity generation and checking before diving into gate schematics, let us leave electronics behind and imagine a grocery store checkout system.

Imagine a shopper pushing a shopping cart through a large supermarket. The cart contains various items: apples, cereal boxes, milk cartons, and juice bottles.

```text
THE SUPERMARKET CHECKOUT PARITY SYSTEM

 Shopper's Cart (Data Payload)         Cashier Verification Station
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ 3 Apples                  │         │ Cashier Counts Items:     │
 │ 2 Cereal Boxes            │────────►│ Total = 6 Items (EVEN!)   │
 │ 1 Milk Carton             │         │ Cashier Stamps GREEN Tag  │
 └───────────────────────────┘         └─────────────┬─────────────┘
                                                     │
                                                     ▼
                                           Cart Exits to Door
```

The supermarket management wants to prevent items from falling out of carts or being illegally added to carts as shoppers walk from the register to the exit door.

How does the supermarket implement a fast, simple verification system?

### Step 1: The Cashier's Parity Tag (Generation at Transmitter)
When the shopper pays at the register, the cashier counts the total number of items in the cart:
* 3 apples + 2 cereal boxes + 1 milk carton = **6 items total**.
* The number 6 is an **EVEN number**.

The cashier adheres a **GREEN TAG** (representing EVEN) to the cart handle before the shopper walks away.

### Step 2: The Security Guard's Inspection (Checking at Receiver)
At the exit door, a security guard inspects the cart. The guard does not re-scan prices or check receipts. The guard simply counts the items in the cart and checks the handle tag:

```text
SCENARIO A: NORMAL UNCORRUPTED EXIT

 Cart Items = 6 (EVEN)  ──► Matches GREEN Tag (EVEN) ──► PASS! Exit Allowed.
```

```text
SCENARIO B: CORRUPTED EXIT (ONE ITEM FELL OUT!)

 One cereal box fell out in the aisle during walking!
 Cart Items = 5 (ODD)   ──► Mismatches GREEN Tag (EVEN!) ──► ALARM FIRES!
```

If one cereal box fell out of the cart on the way to the exit, the total count drops from 6 (EVEN) to 5 (ODD). The guard immediately notices that a cart tagged as EVEN now contains an ODD number of items! The guard halts the shopper and flags an error.

Notice three vital properties of this verification system:
1. **Redundant Indicator**: The GREEN tag is not a product being bought; it is a single extra bit of verification data appended to the cart.
2. **Instant Error Detection**: If **one item** is added or lost, the total count flips between EVEN and ODD, making the error immediately visible.
3. **Lightweight Mechanism**: The guard does not need a full itemized receipt database; they only need to check whether the final item count matches the tag's EVEN/ODD rule!

This supermarket system is the exact physical analogue of a **Parity Generator and Checker**:
* The items in the cart are the **Data Payload Bits** ($D_0, D_1, \dots, D_{N-1}$).
* The cashier applying the tag is the **Parity Generator** (Transmitter Node).
* The GREEN tag is the **Parity Bit** ($P$).
* The exit guard re-counting items is the **Parity Checker** (Receiver Node).

In digital electronics, instead of human cashiers counting items, a parity module uses a network of Exclusive-OR (XOR) gates that calculate the binary parity of data words in nanoseconds.

---

## Mechanics of Parity Generation, Checking, and XOR Logic Trees

To master error detection circuit synthesis, we must dissect the formal mechanics of its two core primitives:
1. **The Parity Generator**: How a transmitter node computes an extra check bit $P$ over a multi-bit binary data payload using modulo-2 arithmetic.
2. **The XOR Error Detection Tree**: How logarithmic networks of XOR and XNOR logic gates evaluate data frames at receiver nodes to generate an unambiguous **Parity Error Flag ($E$)**.

---

### Primitive 1: The Parity Generator

A **Parity Generator** is a combinational circuit located at the transmitter node of a digital communication bus. It accepts an $N$-bit data payload $\mathbf{D} = (D_{N-1}, \dots, D_1, D_0)$ and calculates an additional 1-bit output called the **Parity Bit ($P$)**.

The $N$-bit data payload and the 1-bit parity bit are combined to form an $(N+1)$-bit transmitted frame:

$$
\mathbf{T} = (D_{N-1}, \dots, D_1, D_0, P)
$$

Where:
* $\mathbf{T}$ is the total $(N+1)$-bit transmitted frame sent over the physical bus.
* $D_k$ represents the $k$-th data payload bit.
* $P$ is the generated parity bit.

```text
TRANSMITTED FRAME STRUCTURE

  MSB                                                LSB
 ┌──────────┬──────────┬──────────┬──────────┬──────────┐
 │ Data D3  │ Data D2  │ Data D1  │ Data D0  │ Parity P │
 └──────────┴──────────┴──────────┴──────────┴──────────┘
 ◄───────────────── N-Bit Payload ──────────► ◄─ Check ─►
```

#### 1. Even Parity versus Odd Parity Conventions

Systems establish a strict, pre-agreed parity rule before communication begins:

* **Even Parity Convention**: The Parity Generator computes $P$ such that the total number of $1$s in the transmitted frame $\mathbf{T}$ (including $P$) is **always EVEN**.
* **Odd Parity Convention**: The Parity Generator computes $P$ such that the total number of $1$s in the transmitted frame $\mathbf{T}$ (including $P$) is **always ODD**.

```text
EVEN VERSUS ODD PARITY CONVENTIONS

 Data Payload (D3..D0) │ Number of 1s │ Even Parity Bit (P) │ Odd Parity Bit (P)
───────────────────────┼──────────────┼─────────────────────┼────────────────────
     0 0 0 0           │   0 (Even)   │        P = 0        │       P = 1
     0 0 0 1           │   1 (Odd)    │        P = 1        │       P = 0
     0 0 1 1           │   2 (Even)   │        P = 0        │       P = 1
     0 1 1 1           │   3 (Odd)    │        P = 1        │       P = 0
     1 1 1 1           │   4 (Even)   │        P = 0        │       P = 1
```

Let us examine Row 2 ($D = 0001_2$):
* The payload $0001_2$ contains one $1$ (an ODD count).
* Under **Even Parity**, the generator sets $P = 1$. The frame becomes $00011_2$, which contains two $1$s (an EVEN count!).
* Under **Odd Parity**, the generator sets $P = 0$. The frame becomes $00010_2$, which contains one $1$ (an ODD count!).

#### 2. Modulo-2 Arithmetic and XOR Equivalence

How does a digital circuit count whether a binary vector contains an even or odd number of $1$s?

In mathematics, counting the parity of binary digits is equivalent to computing their sum in **Modulo-2 Arithmetic** (addition where $1 + 1 = 0$ with no carry).

In digital electronics, the modulo-2 sum of two binary variables is performed by a single 2-input **Exclusive-OR (XOR)** gate:

$$
A \oplus B = (A \cdot \overline{B}) + (\overline{A} \cdot B)
$$

Where:
* $\oplus$ represents the logical XOR operation.
* $0 \oplus 0 = 0$ (Zero $1$s $\to$ Even, result 0)
* $0 \oplus 1 = 1$ (One $1$ $\to$ Odd, result 1)
* $1 \oplus 0 = 1$ (One $1$ $\to$ Odd, result 1)
* $1 \oplus 1 = 0$ (Two $1$s $\to$ Even, result 0)

```text
XOR MODULO-2 ADDITION TRUTH TABLE

 Input A │ Input B │ Output A (+) B │ Modulo-2 Sum Meaning
─────────┼─────────┼────────────────┼──────────────────────
    0    │    0    │       0        │ 0 + 0 = 0 (Even)
    0    │    1    │       1        │ 0 + 1 = 1 (Odd)
    1    │    0    │       1        │ 1 + 0 = 1 (Odd)
    1    │    1    │       0        │ 1 + 1 = 0 (Even, No Carry!)
```

Because XOR computes modulo-2 addition, chaining XOR gates together allows us to sum any number of data bits to determine their parity!

#### 3. Deriving the 4-Bit Even Parity Generator Equation

For a 4-bit data payload $\mathbf{D} = (D_3, D_2, D_1, D_0)$, the Even Parity bit $P_{\text{even}}$ must be $1$ whenever the payload contains an ODD number of $1$s (so that adding $P=1$ brings the total count to EVEN).

Therefore, $P_{\text{even}}$ is simply the modulo-2 sum (XOR) of all data bits:

$$
P_{\text{even}} = D_3 \oplus D_2 \oplus D_1 \oplus D_0
$$

Where:
* $P_{\text{even}}$ is the generated even parity bit.
* $D_3, D_2, D_1, D_0$ are the four data payload bits.

To generate an **Odd Parity** bit $P_{\text{odd}}$, we simply invert the Even Parity result using an **XNOR** gate:

$$
P_{\text{odd}} = \overline{D_3 \oplus D_2 \oplus D_1 \oplus D_0} = D_3 \odot D_2 \odot D_1 \odot D_0
$$

Where:
* $\odot$ represents the logical XNOR (Exclusive-NOR) operation.

---

### Primitive 2: The XOR Error Detection Tree

A **Parity Checker** is a combinational circuit located at the receiver node of a digital bus. It receives the complete $(N+1)$-bit transmitted frame $\mathbf{T}' = (D_{N-1}', \dots, D_0', P')$ (where primes denote potentially corrupted bits) and computes a 1-bit **Parity Error Flag ($E$)**.

* **$E = 0$**: No single-bit error detected. The frame integrity is verified.
* **$E = 1$**: Single-bit transmission error detected! Frame is corrupted.

```text
PARITY CHECKER RECEIVER NODE ARCHITECTURE

 Received Frame (D3', D2', D1', D0', P')
 ┌──────────────────────────────────────┐
 │ Received Data Payload (D3'..D0')     ├──► [ Parity Checker ] ──► Error Flag E
 │ Received Parity Bit   (P')           ├──► [    Circuit    ]     (0=Clean, 1=Error!)
 └──────────────────────────────────────┘
```

#### 1. Deriving the Parity Error Flag Equation

Under the **Even Parity Convention**, the receiver knows that a clean, uncorrupted frame MUST contain an EVEN total number of $1$s across all $N+1$ bits $(D_{N-1}', \dots, D_0', P')$.

The receiver evaluates the modulo-2 sum across **ALL $(N+1)$ received bits**:

$$
E_{\text{even}} = D_{N-1}' \oplus \dots \oplus D_1' \oplus D_0' \oplus P'
$$

Where:
* $E_{\text{even}}$ is the parity error flag under even parity convention.
* $D_k'$ is the received $k$-th data bit.
* $P'$ is the received parity bit.

Let us trace how this equation behaves:
* **Uncorrupted Frame Received**: The total number of $1$s across $(D', P')$ is EVEN. The XOR sum of an even number of $1$s is $0$. Therefore, $E_{\text{even}} = 0$ (No Error!).
* **Single-Bit Flip Occurs**: Exactly one bit flips state ($0 \to 1$ or $1 \to 0$). The total number of $1$s across $(D', P')$ becomes ODD. The XOR sum of an odd number of $1$s is $1$. Therefore, $E_{\text{even}} = 1$ (**ERROR DETECTED!**).

For the **Odd Parity Convention**, a clean frame must contain an ODD number of $1$s. The error flag is inverted using an XNOR gate:

$$
E_{\text{odd}} = \overline{D_{N-1}' \oplus \dots \oplus D_0' \oplus P'} = D_{N-1}' \odot \dots \odot D_0' \odot P'
$$

---

## Linear Cascades versus Balanced Logarithmic XOR Trees

When synthesizing a parity generator or checker for an 8-bit, 16-bit, or 32-bit data bus, how should we interconnect the 2-input XOR gates?

There are two completely different physical topologies for chaining XOR gates together:
1. **Linear Serial Cascades** (Naive implementation).
2. **Balanced Logarithmic Trees** (Optimal engineering implementation).

```text
PARITY TREE TOPOLOGY COMPARISON

 Topology A: Linear Serial Cascade        Topology B: Balanced Logarithmic Tree
 D0 ──►[XOR]──►[XOR]──►[XOR]──► P        D0 ──┐
 D1 ────┘       │       │                D1 ──┴──►[XOR]──┐
 D2 ────────────┘       │                D2 ──┐          ├──►[XOR]──► P
 D3 ────────────────────┘                D3 ──┴──►[XOR]──┘
 High Latency: (N-1) Gate Delays         Low Latency: log2(N) Gate Delays
```

### 1. The Linear Serial Cascade (Slow and Glitch-Prone)

In a **Linear Serial Cascade**, data bit $D_0$ and $D_1$ enter the first XOR gate. Its output feeds into a second XOR gate alongside $D_2$, whose output feeds into a third XOR gate alongside $D_3$, and so on in a long chain.

For an $N$-bit data bus, a linear cascade requires $N-1$ gates in series.

The physical propagation delay $t_{\text{cascade}}$ of a linear cascade is:

$$
t_{\text{cascade}} = (N - 1) \cdot t_{\text{xor}}
$$

Where:
* $t_{\text{cascade}}$ is the total time required for parity computation.
* $N$ is the number of input bits.
* $t_{\text{xor}}$ is the propagation delay of a single 2-input XOR gate.

For a 16-bit data bus ($N=16$), the signal must ripple through $16 - 1 = 15$ consecutive XOR gate levels!

```text
16-BIT LINEAR CASCADE DELAY PATH

 Bit D0 ──► [XOR 1] ──► [XOR 2] ──► ... ──► [XOR 15] ──► Output Parity P
             ◄──────────────────────────────────────►
                    15 Consecutive Gate Delays!
```

This long ripple chain causes two severe physical failures:
* **High Latency**: The CPU must wait 15 gate delays before it knows whether memory data is valid, crippling bus clock speeds.
* **Transient Glitching**: Because inputs $D_0$ through $D_{15}$ arrive at different stages along the chain, intermediate XOR outputs oscillate wildly for nanoseconds before settling, generating severe voltage noise.

### 2. The Balanced Logarithmic Tree (Fast and Low-Noise)

Because the XOR operator is fully **commutative** ($A \oplus B = B \oplus A$) and **associative** ($(A \oplus B) \oplus C = A \oplus (B \oplus C)$), we can group input pairs independently and arrange the XOR gates into a **Balanced Binary Tree**.

In a **Balanced Logarithmic Tree**:
* Level 1 pairs inputs in parallel: $(D_0 \oplus D_1), (D_2 \oplus D_3), (D_4 \oplus D_5), \dots$
* Level 2 pairs the Level 1 outputs: $[(D_0 \oplus D_1) \oplus (D_2 \oplus D_3)], \dots$
* Level 3 pairs the Level 2 outputs, continuing until a single root XOR gate produces the final parity output $P$.

```text
16-BIT BALANCED LOGARITHMIC XOR TREE

 Level 1 (8 Gates)      Level 2 (4 Gates)   Level 3 (2 Gates)   Level 4 (1 Gate)
 (D0 (+) D1)   ──┐
 (D2 (+) D3)   ──┴────► [ XOR L2-1 ] ──┐
 (D4 (+) D5)   ──┐                     ├──► [ XOR L3-1 ] ──┐
 (D6 (+) D7)   ──┴────► [ XOR L2-2 ] ──┘                   │
                                                           ├──► [ XOR L4-1 ] ──► Parity P
 (D8 (+) D9)   ──┐                                         │
 (D10 (+) D11) ──┴────► [ XOR L2-3 ] ──┐                   │
 (D12 (+) D13) ──┐                     ├──► [ XOR L3-2 ] ──┘
 (D14 (+) D15) ──┴────► [ XOR L2-4 ] ──┘
```

The physical propagation delay $t_{\text{tree}}$ of a balanced logarithmic tree is:

$$
t_{\text{tree}} = \lceil \log_2(N) \rceil \cdot t_{\text{xor}}
$$

Where:
* $t_{\text{tree}}$ is the total computation time of the balanced tree.
* $\lceil \log_2(N) \rceil$ is the ceiling of the base-2 logarithm of the bit count $N$.
* $t_{\text{xor}}$ is the propagation delay of a single 2-input XOR gate.

Let us compare the propagation delay for a 16-bit bus ($N=16$):
* Linear Cascade Delay: $15 \cdot t_{\text{xor}}$
* Balanced Tree Delay: $\log_2(16) \cdot t_{\text{xor}} = 4 \cdot t_{\text{xor}}$

$$\text{Speedup Factor} = \frac{15 \cdot t_{\text{xor}}}{4 \cdot t_{\text{xor}}} = 3.75\times \text{ Faster!}$$

By re-arranging the exact same 15 XOR gates into a balanced tree topology, the error detection circuit runs **$375\%$ faster**!

---

## Fundamental Limitations: Single-Bit vs. Multi-Bit Error Invisibility

While parity checking is one of the most widely used error detection techniques in digital systems, engineers must understand its fundamental mathematical limit: **Parity can ONLY detect ODD numbers of bit flips!**

### 1. Why Single-Bit Errors Are Always Detected
If a clean frame contains an EVEN number of $1$s, flipping a single bit ($0 \to 1$ or $1 \to 0$) changes the total count of $1$s from EVEN to ODD. The parity checker immediately detects the discrepancy and fires $E = 1$.

### 2. Why Double-Bit Errors Are Invisible to Parity
What happens if physical electromagnetic noise strikes two adjacent wires simultaneously during transmission, flipping **two bits** ($D_1$ flips $0 \to 1$ AND $D_2$ flips $1 \to 0$)?

```text
THE DOUBLE-BIT ERROR BLIND SPOT

 Original Transmitted Frame : 0 0 1 1 0  (Total 1s = 2, EVEN. Parity P = 0)
 Corrupted Frame (2 Flips)  : 0 1 0 1 0  (Bits D1, D2 flipped!)
                                  │ │
                                  ▼ ▼
 Receiver Counts 1s         : 0 + 1 + 0 + 1 + 0 = 2 (Total 1s STILL EVEN!)
 Receiver Parity Evaluation : E = 0 (NO ERROR DETECTED! FALSE PASS!)
```

Let us analyze the math:
* Flipping the first bit changes the count from EVEN to ODD.
* Flipping the second bit changes the count from ODD back to EVEN!

The two bit flips cancel each other out in Modulo-2 arithmetic!

$$
\text{Error Count} = 2 \implies 2 \pmod 2 = 0 \quad (\text{Invisible to XOR!})
$$

```text
PARITY DETECTION CAPABILITY MATRIX

 Number of Simultaneous Bit Flips │ Parity Error Flag (E) │ Detection Status
──────────────────────────────────┼───────────────────────┼───────────────────────────
      1 Bit Flip (Single)         │        E = 1          │ DETECTED! 100% Reliable.
      2 Bit Flips (Double)        │        E = 0          │ INVISIBLE! False Pass.
      3 Bit Flips (Triple)        │        E = 1          │ DETECTED!
      4 Bit Flips (Quadruple)     │        E = 0          │ INVISIBLE! False Pass.
```

**Engineering Takeaway**: Simple parity checking is designated as a **Single-Bit Error Detection (ED)** scheme. It is ideal for low-noise environments (such as onboard CPU buses or RAM traces) where the statistical probability of two independent bits flipping in the exact same 8-nanosecond window is near zero.

For high-noise environments (such as satellite wireless links or hard drive magnetic platters), engineers upgrade from simple parity to **Error-Correcting Codes (ECC)** such as Hamming Codes or Cyclic Redundancy Checks (CRC).

---

## Solved Industrial Engineering Exercise: Spacecraft Telemetry Bus Error Module

To consolidate your complete mastery of parity generation, parity checking, Even versus Odd parity conventions, logarithmic XOR trees, and error detection limits, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics firm is engineering the hardware telemetry verification module for a satellite's primary payload computer. The satellite transmits a 4-bit data bus payload $\mathbf{D} = (D_3, D_2, D_1, D_0)$ from orbit down to a ground station receiver.

```text
SATELLITE TELEMETRY LINK ARCHITECTURE

 SATELLITE (TRANSMITTER)            SPACE LINK            GROUND STATION (RECEIVER)
 ┌──────────────────────┐        Physical Bus           ┌────────────────────────┐
 │ Payload (D3..D0)     ├─────── (4 Data Wires) ───────►│ Received Payload D'    │
 │ Parity Generator (P) ├─────── (1 Parity Wire) ──────►│ Parity Checker (E)     │
 └──────────────────────┘                               └────────────────────────┘
```

#### System Operating Requirements

1. **Transmitter Node (Satellite)**:
   * Must compute an **Even Parity Bit ($P_{\text{even}}$)** over the 4-bit payload $(D_3, D_2, D_1, D_0)$ using a balanced XOR tree.
   * Transmits 5-bit frame $\mathbf{T} = (D_3, D_2, D_1, D_0, P_{\text{even}})$ over the space link.
2. **Receiver Node (Ground Station)**:
   * Receives 5-bit frame $\mathbf{T}' = (D_3', D_2', D_1', D_0', P')$.
   * Must compute a **Parity Error Flag ($E$)** using a balanced XOR tree.
   * $E = 0$ indicates a clean transmission (Telemetry accepted).
   * $E = 1$ indicates line noise corruption (Ground station requests packet re-transmission).

#### Your Objective

1. Construct the complete 16-row truth table for the 4-bit Even Parity Generator $P_{\text{even}}$ at the transmitter node.
2. Synthesize the gate-level Boolean equation for $P_{\text{even}}$ and draw the balanced logarithmic XOR tree schematic.
3. Synthesize the gate-level Boolean equation for the receiver Parity Error Flag $E$ and draw its balanced logarithmic XOR tree schematic.
4. Calculate the maximum propagation delay $t_{\text{tree}}$ for both transmitter and receiver circuits assuming a single XOR gate delay $t_{\text{xor}} = 1.2\text{ ns}$.
5. Simulate the system under three deep-space signal corruption scenarios.

---

### Step-by-Step Derivation

#### Step 1: Construct the Transmitter Parity Generator Truth Table

The data payload has $N = 4$ binary variables ($D_3, D_2, D_1, D_0$), resulting in $2^4 = 16$ rows ($0000_2$ to $1111_2$).

For Even Parity, $P_{\text{even}} = 1$ whenever the payload contains an **ODD** number of $1$s, ensuring the total frame count of $1$s is EVEN.

```text
4-BIT EVEN PARITY GENERATOR TRUTH TABLE

 Row │ D3 │ D2 │ D1 │ D0 │ Payload 1s Count │ Parity Bit P_even │ Transmitted Frame (D3 D2 D1 D0 P)
─────┼───┼───┼───┼───┼──────────────────┼───────────────────┼───────────────────────────────────
  0  │ 0 │ 0 │ 0 │ 0 │     0 (Even)     │         0         │             00000
  1  │ 0 │ 0 │ 0 │ 1 │     1 (Odd)      │         1         │             00011
  2  │ 0 │ 0 │ 1 │ 0 │     1 (Odd)      │         1         │             00101
  3  │ 0 │ 0 │ 1 │ 1 │     2 (Even)     │         0         │             00110
  4  │ 0 │ 1 │ 0 │ 0 │     1 (Odd)      │         1         │             01001
  5  │ 0 │ 1 │ 0 │ 1 │     2 (Even)     │         0         │             01010
  6  │ 0 │ 1 │ 1 │ 0 │     2 (Even)     │         0         │             01100
  7  │ 0 │ 1 │ 1 │ 1 │     3 (Odd)      │         1         │             01111
  8  │ 1 │ 0 │ 0 │ 0 │     1 (Odd)      │         1         │             10001
  9  │ 1 │ 0 │ 0 │ 1 │     2 (Even)     │         0         │             10010
 10  │ 1 │ 0 │ 1 │ 0 │     2 (Even)     │         0         │             10100
 11  │ 1 │ 0 │ 1 │ 1 │     3 (Odd)      │         1         │             10111
 12  │ 1 │ 1 │ 0 │ 0 │     2 (Even)     │         0         │             11000
 13  │ 1 │ 1 │ 0 │ 1 │     3 (Odd)      │         1         │             11011
 14  │ 1 │ 1 │ 1 │ 0 │     3 (Odd)      │         1         │             11101
 15  │ 1 │ 1 │ 1 │ 1 │     4 (Even)     │         0         │             11110
```

---

#### Step 2: Synthesize the Transmitter Parity Generator Circuit

The modulo-2 sum equation for the 4-bit Even Parity Generator is:

$$
P_{\text{even}} = D_3 \oplus D_2 \oplus D_1 \oplus D_0
$$

Where:
* $P_{\text{even}}$ is the generated even parity bit.
* $D_3, D_2, D_1, D_0$ are the four payload bits.

##### Balanced Logarithmic Tree Architecture (Transmitter):
To minimize propagation delay, we arrange three 2-input XOR gates into a 2-level balanced binary tree:
* **Level 1**: Gate 1 computes $(D_3 \oplus D_2)$. Gate 2 computes $(D_1 \oplus D_0)$.
* **Level 2**: Gate 3 computes $P_{\text{even}} = (D_3 \oplus D_2) \oplus (D_1 \oplus D_0)$.

```text
TRANSMITTER PARITY GENERATOR SCHEMATIC (BALANCED TREE)

      Level 1 (Parallel Stage)                     Level 2 (Root Stage)

 Data D3 ──┐
           ├──► [ XOR Gate 1 ] ── (D3(+)D2) ──┐
 Data D2 ──┘                                  │
                                              ├──► [ XOR Gate 3 ] ──► Parity P_even
 Data D1 ──┐                                  │
           ├──► [ XOR Gate 2 ] ── (D1(+)D0) ──┘
 Data D0 ──┘
```

##### Propagation Delay Calculation (Transmitter):
The tree depth is $\lceil \log_2(4) \rceil = 2$ gate levels.

$$
t_{\text{tx}} = 2 \cdot t_{\text{xor}} = 2 \cdot 1.2\text{ ns} = 2.4\text{ ns}
$$

The transmitter computes parity in just **$2.4\text{ nanoseconds}$**!

---

#### Step 3: Synthesize the Receiver Parity Checker Circuit

The receiver receives 5 incoming bits: $(D_3', D_2', D_1', D_0', P')$.

Under Even Parity, the Parity Error Flag $E$ is the modulo-2 sum across all 5 bits:

$$
E = D_3' \oplus D_2' \oplus D_1' \oplus D_0' \oplus P'
$$

Where:
* $E$ is the parity error flag ($0 = \text{Clean}, 1 = \text{Corrupted}$).
* $D_3', D_2', D_1', D_0'$ are the received data bits.
* $P'$ is the received parity bit.

##### Balanced Logarithmic Tree Architecture (Receiver):
We structure four 2-input XOR gates into a 3-level balanced tree:
* **Level 1**: Gate 1 computes $(D_3' \oplus D_2')$. Gate 2 computes $(D_1' \oplus D_0')$.
* **Level 2**: Gate 3 combines Level 1: $(D_3' \oplus D_2') \oplus (D_1' \oplus D_0')$.
* **Level 3**: Gate 4 XORs the Level 2 result with received parity $P'$: $E = \text{Level 2} \oplus P'$.

```text
RECEIVER PARITY CHECKER SCHEMATIC (BALANCED TREE)

                     Level 1          Level 2           Level 3

 Received D3' ──┐
                ├──► [ XOR 1 ] ──┐
 Received D2' ──┘                │
                                 ├──► [ XOR 3 ] ──┐
 Received D1' ──┐                │                │
                ├──► [ XOR 2 ] ──┘                │
 Received D0' ──┘                                 ├──► [ XOR 4 ] ──► Error Flag E
                                                  │
 Received Parity P' ──────────────────────────────┘
```

##### Propagation Delay Calculation (Receiver):
The tree depth is $\lceil \log_2(5) \rceil = 3$ gate levels.

$$
t_{\text{rx}} = 3 \cdot t_{\text{xor}} = 3 \cdot 1.2\text{ ns} = 3.6\text{ ns}
$$

The receiver verifies frame integrity in just **$3.6\text{ nanoseconds}$**!

---

### Sanity Check and Verification

Let us test our satellite telemetry system across three deep-space transmission scenarios.

#### Scenario A: Clean Transmission (No Noise)
* **Satellite Payload**: $D = 1100_2$ ($D_3=1, D_2=1, D_1=0, D_0=0$).
* **Transmitter Parity Calculation**:
  $P_{\text{even}} = 1 \oplus 1 \oplus 0 \oplus 0 = (1 \oplus 1) \oplus (0 \oplus 0) = 0 \oplus 0 = 0$.
  Transmitted Frame $\mathbf{T} = 11000_2$.
* **Space Link**: No bit flips occur. Receiver receives $\mathbf{T}' = 11000_2$.
* **Receiver Error Evaluation**:
  $E = D_3' \oplus D_2' \oplus D_1' \oplus D_0' \oplus P' = 1 \oplus 1 \oplus 0 \oplus 0 \oplus 0 = 0$.
* **Result**: $E = 0$. **CLEAN FRAME ACCEPTED!**

#### Scenario B: Single-Bit Noise Flip during Atmospheric Passage
* **Satellite Payload**: $D = 1100_2$, Transmitted Frame $\mathbf{T} = 11000_2$.
* **Space Link Noise**: Solar flare flips bit $D_2'$ from $1$ to $0$!
  Corrupted Received Frame $\mathbf{T}' = 10000_2$.
* **Receiver Error Evaluation**:
  $E = D_3' \oplus D_2' \oplus D_1' \oplus D_0' \oplus P' = 1 \oplus 0 \oplus 0 \oplus 0 \oplus 0 = 1$.
* **Result**: $E = 1$. **CORRUPTION DETECTED!** Ground station rejects frame and requests re-transmission.

#### Scenario C: Extreme Double-Bit Cosmic Ray Strike (Demonstrating Parity Limit)
* **Satellite Payload**: $D = 1100_2$, Transmitted Frame $\mathbf{T} = 11000_2$.
* **Space Link Noise**: Cosmic ray hits two adjacent wires, flipping $D_2'$ ($1 \to 0$) AND $D_3'$ ($1 \to 0$)!
  Double-Corrupted Received Frame $\mathbf{T}' = 00000_2$.
* **Receiver Error Evaluation**:
  $E = 0 \oplus 0 \oplus 0 \oplus 0 \oplus 0 = 0$.
* **Result**: $E = 0$. **DOUBLE-BIT BLIND SPOT CONFIRMED!**

The sanity checks mathematically confirm both the power and the single-bit boundary limits of parity verification circuits.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Parity Generator**: A combinational logic module at a transmitter node that computes a modulo-2 sum over a multi-bit binary data payload using XOR gates to append an extra verification bit ($P$), ensuring the total frame bit count adheres to an Even or Odd parity convention.
* **XOR Error Detection Tree**: A high-speed, balanced logarithmic network of Exclusive-OR gates ($\lceil \log_2 N \rceil$ depth) that evaluates data frames at a receiver node to generate a 1-bit Parity Error Flag ($E$), instantaneously detecting single-bit transmission corruptions with minimal propagation latency.
