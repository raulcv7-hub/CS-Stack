---
title: "Demultiplexer Circuit Synthesis and Address Decoding Architecture"
---

# Demultiplexer Circuit Synthesis and Address Decoding Architecture

## The Single-Source Distribution Bottleneck and Unintended Receiving Hazards

Imagine an industrial automated factory where a single central computer generates a stream of digital configuration pulses. Surrounding this central computer are four separate, independent robotic assembly stations: Robot 0, Robot 1, Robot 2, and Robot 3. At any given moment, the central computer needs to send a configuration pulse to exactly one specific robotic station.

If you attempt to solve this distribution problem by physically hardwiring the central computer's single output wire directly to the input terminals of all four robotic stations simultaneously, a severe operational hazard occurs.

```text
THE UNCONTROLLED BROADCAST HAZARD

                         ┌───► Robot 0 (Receives Pulse! Unintended)
                         ├───► Robot 1 (Receives Pulse! Unintended)
 Central Computer ───────┼───► Robot 2 (Targeted Robot)
 (Single Output Line)    └───► Robot 3 (Receives Pulse! Unintended)
                                    │
                                    ▼
                         CATASTROPHIC MULTI-ROBOT COLLISION!
```

When the central computer emits a configuration pulse intended exclusively for Robot 2, that same electrical signal travels along the shared wire and triggers Robot 0, Robot 1, and Robot 3 at the exact same instant. Robots that were supposed to remain stationary or execute different tasks suddenly misinterpret the signal, leading to mechanical collisions, corrupted machine states, and expensive equipment damage.

The naive workaround is to run four separate, dedicated physical wires from four distinct output pins on the central computer—one wire to each robot. But as a digital system scales to include dozens of memory registers, hundreds of peripheral devices, or thousands of display pixels, dedicating a separate physical output pin and wire for every possible receiving unit causes an immediate physical space explosion. The computer's control chip runs out of physical output pins, and the circuit board becomes clogged with a massive web of redundant copper traces.

To solve this distribution bottleneck, digital engineering requires a dedicated combinational steering block: a digital distributor that accepts a single incoming data line, uses an $S$-bit binary **Address Decoding** selector bus to pick exactly one destination channel out of $N$ possibilities, and routes the incoming data signal strictly to that chosen destination while holding all remaining $N-1$ inactive output lines at a safe, inactive state ($0$).

That circuit is the **Demultiplexer (DEMUX)**. Without the demultiplexer, digital memory address decoding, serial-to-parallel data conversion, and multi-peripheral control networks could not exist.

---

## The Mailroom Sorting Chute: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a demultiplexer, let us step away from microchips and picture a mailroom sorting facility in a large office building.

Imagine a mailroom with a single main incoming mail chute ($D$). Packages slide down this main chute one by one. On the other side of the room are four separate delivery bins leading to four different departments: Bin 0, Bin 1, Bin 2, and Bin 3.

```text
THE MAILROOM SORTING CHUTE ANALOGY

                         ┌───► Bin 0 (Accounting)
                         ├───► Bin 1 (Human Resources)
 Main Chute (Data D) ────┼───► Bin 2 (Engineering)
                         └───► Bin 3 (Legal)
                                    ▲
                                    │
                        [ Sorting Lever Position ]
```

How does the mail clerk ensure that a package sliding down the main chute lands in the Engineering bin (Bin 2) without accidentally dropping into Accounting, HR, or Legal?
* The mail clerk operates a **Sorting Lever**.
* When the sorting lever is set to Position 2, a internal mechanical diverter swings into place. The main chute connects directly to Bin 2.
* When a package slides down the main chute ($D$), it glides smoothly into Bin 2. Meanwhile, Bins 0, 1, and 3 receive nothing; they remain completely empty ($0$).
* If the next package is for Legal, the clerk moves the sorting lever to Position 3. The diverter shifts, connecting the main chute directly to Bin 3.

Notice three vital properties of this sorting chute:
1. **Single Input, Multiple Outputs**: One incoming data source ($D$) is distributed among $N$ possible output channels ($Y_0, Y_1, Y_2, Y_3$).
2. **Targeted Routing**: Only the chosen destination bin receives the incoming package.
3. **Safe Inactive State**: All unselected bins remain completely undisturbed. They receive no packages and experience zero noise.

This mechanical mail sorting chute is the exact physical analogue of a digital **Demultiplexer (DEMUX)**:
* The main incoming chute is the **Data Input** ($D$).
* The sorting lever position is the **Address Decoding Bus** ($S$).
* The destination bins (Bins 0, 1, 2, 3) are the **Output Channels** ($Y_0, Y_1, Y_2, Y_3$).

In digital logic, instead of moving physical plastic diverters, a demultiplexer uses an array of electronic AND gates acting as digital valves that open a single path based on a binary address.

---

## Mechanics of Demultiplexer Synthesis and Address Decoding Architecture

To master demultiplexer design, we must dissect the formal mechanics of its two core primitives:
1. **The Demultiplexer (DEMUX)**: How a single data input $D$ is selectively routed to one of $N$ output channels.
2. **Address Decoding**: How $S$ control lines decode an $S$-to-$2^S$ binary address to enable exactly one output gate path while holding all $N-1$ unselected output lines inactive.

---

### Primitive 1: The 1-to-2 Demultiplexer (1:2 DEMUX)

The simplest possible demultiplexer is the 1-to-2 Demultiplexer (1:2 DEMUX). It receives one single data input line ($D$), one single-bit select/address line ($S$), and produces two independent output lines ($Y_0$ and $Y_1$).

```text
1-TO-2 DEMULTIPLEXER FUNCTIONAL BLOCK

                         ┌───► Output Y0
 Data Input (D) ─────────┤
                         └───► Output Y1
                                  ▲
 Select Line (S) ─────────────────┘
```

#### 1. Truth Table Derivation
Let us construct the truth table for the 1:2 DEMUX. The system has 2 binary inputs ($S, D$), resulting in $2^2 = 4$ rows. It has two outputs ($Y_0$ and $Y_1$).

```text
1:2 DEMULTIPLEXER EXHAUSTIVE TRUTH TABLE

 Row │ Select (S) │ Data (D) │ Output Y0 │ Output Y1 │ Operational Description
─────┼────────────┼──────────┼───────────┼───────────┼─────────────────────────────────
  0  │     0      │    0     │     0     │     0     │ S=0 -> Y0 receives D (D=0). Y1=0.
  1  │     0      │    1     │     1     │     0     │ S=0 -> Y0 receives D (D=1). Y1=0.
  2  │     1      │    0     │     0     │     0     │ S=1 -> Y1 receives D (D=0). Y0=0.
  3  │     1      │    1     │     0     │     1     │ S=1 -> Y1 receives D (D=1). Y0=0.
```

Look closely at the pattern in this table:
* When $S = 0$ (Rows 0 and 1), output $Y_0$ is an exact replica of data input $D$ ($Y_0 = D$), while output $Y_1$ is forced to $0$.
* When $S = 1$ (Rows 2 and 3), output $Y_1$ is an exact replica of data input $D$ ($Y_1 = D$), while output $Y_0$ is forced to $0$.

We can condense this 4-row table into a compact functional routing table:

```text
CONDENSED 1:2 DEMUX ROUTING TABLE

 Select Line (S) │ Output Y0 Status │ Output Y1 Status │ Routing Action
─────────────────┼──────────────────┼──────────────────┼──────────────────────────────
      S = 0      │      Y0 = D      │      Y1 = 0      │ Routes D to Y0; Y1 is inactive
      S = 1      │      Y0 = 0      │      Y1 = D      │ Routes D to Y1; Y0 is inactive
```

#### 2. Boolean Equation Extraction
Extracting the active Boolean equations for outputs $Y_0$ and $Y_1$ from the truth table:

For Output $Y_0$: Output $Y_0 = 1$ only in Row 1, where $S = 0$ and $D = 1$.

$$
Y_0 = \overline{S} \cdot D
$$

For Output $Y_1$: Output $Y_1 = 1$ only in Row 3, where $S = 1$ and $D = 1$.

$$
Y_1 = S \cdot D
$$

Where:
* $Y_0$ is output channel 0.
* $Y_1$ is output channel 1.
* $S$ is the single-bit select/address signal line.
* $\overline{S}$ is the inverted select signal line.
* $D$ is the incoming data input signal.

#### 3. Gate-Level Hardware Architecture
The Boolean equations $Y_0 = \overline{S} \cdot D$ and $Y_1 = S \cdot D$ map directly to a simple, highly elegant gate schematic consisting of:
* One NOT gate (to invert select line $S$).
* Two 2-input AND gates (acting as output distribution valves).

```text
1:2 DEMULTIPLEXER GATE SCHEMATIC

 Data Input D ───────────┬──────────────►┌───────┐
                         │               │ AND 0 ├──► Output Y0
 Select S ──►[ NOT ]─────┼─► S' ────────►└───────┘
                         │
                         │               ┌───────┐
                         └──────────────►│ AND 1 ├──► Output Y1
 Select S ──────────────────────────────►└───────┘
```

How does this circuit work physically?
* If $S = 0$: The inverted select line $\overline{S} = 1$. Gate AND 0 receives inputs $D$ and $1$, so its output is $D \cdot 1 = D$. Output $Y_0$ receives data signal $D$. Meanwhile, Gate AND 1 receives $S = 0$, so its output is forced to $D \cdot 0 = 0$. Output $Y_1$ remains safely inactive at $0$.
* If $S = 1$: The inverted select line $\overline{S} = 0$. Gate AND 0 receives $0$, so output $Y_0$ is forced to $0$. Gate AND 1 receives $D$ and $1$, so its output is $D \cdot 1 = D$. Output $Y_1$ receives data signal $D$.

---

### Primitive 2: Address Decoding and 1:$N$ DEMUX Scaling

When a demultiplexer scales up to distribute a single data input $D$ across $N$ output channels ($N = 4, 8, 16, 32, \dots$), how many select lines do we need?

Just as with multiplexers, because an $S$-bit binary address can represent $2^S$ unique destination locations, the required number of select lines $S$ for a 1-to-$N$ demultiplexer is governed by the logarithmic relationship:

$$
S = \log_2(N) \quad \iff \quad N = 2^S
$$

Where:
* $N$ is the number of destination output channels.
* $S$ is the number of binary control bits composing the **Address Decoding Bus**.

```text
DEMULTIPLEXER CHANNEL-TO-ADDRESS BUS SCALING

 Output Channels (N) │ Address Bus Bits (S) │ Binary Address Range │ DEMUX Type Symbol
─────────────────────┼──────────────────────┼──────────────────────┼───────────────────
          2          │          1           │        0 to 1        │     1:2 DEMUX
          4          │          2           │       00 to 11       │     1:4 DEMUX
          8          │          3           │      000 to 111      │     1:8 DEMUX
         16          │          4           │     0000 to 1111     │    1:16 DEMUX
         32          │          5           │    00000 to 11111    │    1:32 DEMUX
```

---

### Anatomy of a 1-to-4 Demultiplexer (1:4 DEMUX)

A 1-to-4 Demultiplexer (1:4 DEMUX) has a single data input line ($D$), a 2-bit **Address Decoding Bus** $S = (S_1, S_0)$, and four independent output channels ($Y_0, Y_1, Y_2, Y_3$).

```text
1:4 DEMULTIPLEXER FUNCTIONAL BLOCK

                         ┌───► Output Y0
                         ├───► Output Y1
 Data Input (D) ─────────┼───► Output Y2
                         └───► Output Y3
                                  ▲
                                  │ (2-Bit Address Bus)
 Address Bus ─────────────────────┘ [ S1, S0 ]
```

#### 1. Condensed 1:4 DEMUX Routing Table

```text
1:4 DEMUX CONDENSED ROUTING TABLE

 Select S1 │ Select S0 │ Y0 Output │ Y1 Output │ Y2 Output │ Y3 Output │ Active Channel
───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼────────────────
     0     │     0     │   Y0 = D  │   Y1 = 0  │   Y2 = 0  │   Y3 = 0  │   Channel Y0
     0     │     1     │   Y0 = 0  │   Y1 = D  │   Y2 = 0  │   Y3 = 0  │   Channel Y1
     1     │     0     │   Y0 = 0  │   Y1 = 0  │   Y2 = D  │   Y3 = 0  │   Channel Y2
     1     │     1     │   Y0 = 0  │   Y1 = 0  │   Y2 = 0  │   Y3 = D  │   Channel Y3
```

#### 2. Boolean Equations for a 1:4 DEMUX
By pairing each output channel with its corresponding 2-bit address decoding minterm, we construct the four individual Boolean output equations:

$$
Y_0 = \overline{S_1} \cdot \overline{S_0} \cdot D
$$

$$
Y_1 = \overline{S_1} \cdot S_0 \cdot D
$$

$$
Y_2 = S_1 \cdot \overline{S_0} \cdot D
$$

$$
Y_3 = S_1 \cdot S_0 \cdot D
$$

Where:
* $Y_0, Y_1, Y_2, Y_3$ are the four destination output lines.
* $S_1, S_0$ are the Most Significant Bit (MSB) and Least Significant Bit (LSB) of the address decoding bus.
* $\overline{S_1}, \overline{S_0}$ are the complemented address decoding lines.
* $D$ is the incoming single-bit data signal.

#### 3. General Mathematical Expression for any 1:$N$ DEMUX Output Channel
Extending this structure, any specific output channel $Y_k$ (where $0 \le k \le 2^S - 1$) in a 1-to-$N$ demultiplexer is defined by the concise Boolean equation:

$$
Y_k = m_k(S) \cdot D
$$

Where:
* $Y_k$ is the $k$-th destination output line.
* $m_k(S)$ is the $k$-th decoding minterm evaluated over the address bus variables $S = (S_{S-1}, \dots, S_0)$.
* $D$ is the incoming single-bit data signal.

```text
1:4 DEMULTIPLEXER INTERNAL DECODER-VALVE SCHEMATIC

Data D ──┐   ┌───────┐
         ├──►│ AND 0 │──► Output Y0 (S1'S0'·D)
         │   ├───────┤
         ├──►│ AND 1 │──► Output Y1 (S1'S0 ·D)
         │   ├───────┤
         ├──►│ AND 2 │──► Output Y2 (S1 S0'·D)
         │   ├───────┤
         └──►│ AND 3 │──► Output Y3 (S1 S0 ·D)
             └───▲───┘
                 ║
       Address Bus [S1, S0]
```

In this architecture:
* The address decoding bus evaluates $m_k(S)$.
* Exactly **one** AND gate receives a decoder match of $1$, opening its channel to pass $D$.
* All other $N-1$ AND gates receive a $0$ from the address decoder, forcing their outputs to $0$.

---

## The Intimate Relationship Between Demultiplexers and Binary Decoders

One of the most important conceptual insights in digital logic design is realizing that **a Demultiplexer and a Binary Decoder are virtually identical circuits!**

A standard $S$-to-$2^S$ **Binary Decoder** is a circuit that takes an $S$-bit binary input address and activates exactly one of its $2^S$ output lines (setting it to $1$) while holding all other outputs at $0$.

Most binary decoders include an **Active-High Enable Pin** ($E$).
* When $E = 1$, the decoder evaluates the address and sets $Y_k = 1$ for the selected address.
* When $E = 0$, the decoder is disabled and forces ALL outputs $Y_0 \dots Y_{N-1}$ to $0$.

```text
DECODER WITH ENABLE VERSUS DEMULTIPLEXER

 2-to-4 Decoder with Enable (E)           1-to-4 Demultiplexer (D)
 ┌─────────────────────────────┐          ┌─────────────────────────────┐
 │ Inputs: Address (S1, S0)    │          │ Inputs: Address (S1, S0)    │
 │ Control: Enable Pin (E)     │   ===    │ Data Line: Data Pin (D)     │
 │ Outputs: Y0, Y1, Y2, Y3     │          │ Outputs: Y0, Y1, Y2, Y3     │
 └─────────────────────────────┘          └─────────────────────────────┘
  Formula: Yk = mk(S) * E                  Formula: Yk = mk(S) * D
```

Notice the equations:
* For a Decoder with Enable: $Y_k = m_k(S) \cdot E$
* For a Demultiplexer: $Y_k = m_k(S) \cdot D$

They are **the exact same physical circuit**!
* If you treat the enable pin $E$ as a control line and drive it with a constant $1$, the circuit acts as a **Binary Decoder**.
* If you feed a dynamic data stream into the enable pin $E$, that pin becomes data input $D$, and the circuit acts as a **Demultiplexer**!

This duality means chip manufacturers do not need to fabricate separate silicon chips for decoders and demultiplexers; a single 2-to-4 or 3-to-8 decoder IC serves both roles.

---

## Hierarchical Demultiplexer Trees: Scaling Output Channels

What if a digital system requires a 1-to-16 Demultiplexer (1:16 DEMUX), but your hardware library or chip supplier only provides 1-to-4 Demultiplexer (1:4 DEMUX) blocks?

Just as with multiplexers, we can build arbitrarily large demultiplexers by connecting smaller demultiplexers into a **Hierarchical DEMUX Tree**.

### Constructing a 1:16 DEMUX Using 1:4 DEMUX Sub-Blocks

A 1:16 DEMUX requires a single data input line ($D$), a 4-bit address decoding bus $S = (S_3, S_2, S_1, S_0)$, and 16 output channels ($Y_0$ through $Y_{15}$).

To build a 1:16 DEMUX using 1:4 DEMUX sub-blocks:
1. **Level 1 (Stage Router)**: We place a single 1:4 DEMUX ($M_{\text{root}}$) at the front of the tree.
   * $M_{\text{root}}$ receives incoming data signal $D$.
   * $M_{\text{root}}$ is controlled by the upper 2 bits of the address bus: $(S_3, S_2)$.
   * $M_{\text{root}}$ routes data signal $D$ to one of four intermediate stage lines ($W_0, W_1, W_2, W_3$).
2. **Level 2 (Channel Destination Stage)**: We place four 1:4 DEMUXes in parallel ($M_0, M_1, M_2, M_3$).
   * $M_0$ receives intermediate data line $W_0$ and drives outputs $Y_0, Y_1, Y_2, Y_3$.
   * $M_1$ receives intermediate data line $W_1$ and drives outputs $Y_4, Y_5, Y_6, Y_7$.
   * $M_2$ receives intermediate data line $W_2$ and drives outputs $Y_8, Y_9, Y_{10}, Y_{11}$.
   * $M_3$ receives intermediate data line $W_3$ and drives outputs $Y_{12}, Y_{13}, Y_{14}, Y_{15}$.
   * All four Level 2 DEMUXes share the lower 2 bits of the address bus: $(S_1, S_0)$.

```text
HIERARCHICAL 1:16 DEMULTIPLEXER TREE SCHEMATIC

 Level 1: Stage Router (S3, S2)               Level 2: Final Destination (S1, S0)

                                         ┌──► [ 1:4 DEMUX M0 ] ──► Outputs Y0..Y3
                                         │
                                         ├──► [ 1:4 DEMUX M1 ] ──► Outputs Y4..Y7
 Data D ──► [ 1:4 DEMUX M_root ] ──W0..3─┤
                 ▲                       ├──► [ 1:4 DEMUX M2 ] ──► Outputs Y8..Y11
                 │ (Upper Address)       │
            [ S3, S2 ]                   └──► [ 1:4 DEMUX M3 ] ──► Outputs Y12..Y15
                                                      ▲
                                                      │ (Lower Address)
                                                 [ S1, S0 ]
```

Let us trace how address $S = 1001_2$ (decimal 9) routes data signal $D$ to output $Y_9$:
1. Upper address bits $(S_3, S_2) = 10_2$ (decimal 2).
   * Level 1 router $M_{\text{root}}$ selects Channel 2 ($W_2$).
   * Intermediate line $W_2$ receives data signal $D$. Lines $W_0, W_1, W_3$ stay inactive at $0$.
2. Lower address bits $(S_1, S_0) = 01_2$ (decimal 1).
   * Level 2 DEMUX $M_2$ receives active data on line $W_2$ and selects its Channel 1 (which corresponds to global output $Y_9$).
   * Output $Y_9$ receives data signal $D$!
   * All other 15 output channels remain safely inactive at $0$.

The hierarchical tree delivers data signal $D$ to $Y_9$ with 100% mathematical precision!

---

## Engineering Reality: Active-Low Outputs, Enable Lines, and Propagation Latency

While demultiplexers provide clean, structured data distribution, real-world physical CMOS silicon introduces practical constraints that hardware designers must evaluate.

### 1. Active-Low Output DEMUXes ($\overline{Y_k}$)

In many commercial integrated circuits (such as the industry-standard 74LVC138 3-to-8 decoder/demultiplexer IC), the output channels are **Active-Low** ($\overline{Y_k}$).

* **Active-High DEMUX**: The selected output channel equals data $D$, while all unselected outputs are held at **$0$** (Logic Low).
* **Active-Low DEMUX**: The selected output channel equals inverted data $\overline{D}$, while all unselected outputs are held at **$1$** (Logic High).

```text
ACTIVE-HIGH VERSUS ACTIVE-LOW DEMUX OUTPUTS

 Active-High DEMUX (Default 0):   Selected Output = D    │ Unselected Outputs = 0
 Active-Low DEMUX  (Default 1):   Selected Output = D'   │ Unselected Outputs = 1
```

Why do commercial chip manufacturers build Active-Low demultiplexers?
Because in CMOS silicon, a memory chip's Chip-Select pin ($\overline{\text{CS}}$) or a peripheral's Enable pin is almost always active-low. Holding unselected lines at $1$ prevents memory chips from accidentally turning on.

### 2. Propagation Delay ($t_{pd}$) and Distribution Latency

A data signal passing through a demultiplexer experiences two types of physical propagation delays:

1. **Data-to-Output Delay ($t_{pd, \text{Data}}$)**: The time required for a voltage transition on data line $D$ to propagate to the selected output $Y_k$ when the address lines are stable. This path passes through only one internal AND gate stage, so $t_{pd, \text{Data}}$ is extremely short.
2. **Address-to-Output Delay ($t_{pd, \text{Addr}}$)**: The time required for a change on the address bus $S$ to switch output channels. This path must pass through address NOT inverters before driving the output AND gates, making $t_{pd, \text{Addr}}$ slightly longer.

```text
DEMULTIPLEXER PROPAGATION DELAY PATHS

 Data Path   : Data Line D ─────────────────────► [ AND Gate ] ──► Output Y_k
                (1 Gate Delay: t_and)

 Address Path: Address S ──► [ NOT Inverter ] ──► [ AND Gate ] ──► Output Y_k
                (2 Gate Delays: t_not + t_and)
```

In high-speed memory systems, the CPU sets the memory address bus $S$ *before* asserting the data line $D$, ensuring that address decoding delays settle before data distribution begins.

---

## Solved Industrial Engineering Exercise: CPU Memory Bank Write Distributor

To cement your complete mastery of demultiplexer synthesis, address decoding, hierarchical DEMUX trees, and active-low control logic, we will now walk through a complete, step-by-step computer engineering problem: designing a CPU memory bank write-enable distributor.

---

### Scenario and Parameters

A 32-bit computer system contains eight independent SRAM memory banks ($\text{Bank}_0$ through $\text{Bank}_7$). Each memory bank has an active-high **Write-Enable Input** ($WE_0$ through $WE_7$).

When a memory bank's $WE_k$ pin receives a high pulse ($1$), that bank writes incoming data into its memory cells. If a bank's $WE_k$ pin is $0$, the bank ignores the bus and preserves its stored data.

The CPU Memory Controller emits two control signals:
1. A 3-bit **Bank Address Bus** $A_{\text{bank}} = (S_2, S_1, S_0)$.
2. A single-bit **Master Write Strobe** ($WR\_STROBE$), which pulses high ($1$) for 5 nanoseconds when a write operation must occur.

```text
CPU MEMORY BANK WRITE DISTRIBUTOR

 Master Write Strobe (WR_STROBE) ──┐
                                   ├──► [ 1:8 DEMUX ] ──► WE0..WE7 (To Memory Banks)
 Bank Address (S2, S1, S0) ────────┘
```

#### System Operating Requirements

The memory controller specification dictates:
* When $WR\_STROBE = 1$, the write strobe pulse must be routed **exclusively** to the selected memory bank's $WE_k$ pin according to the 3-bit bank address $(S_2, S_1, S_0)$.
* All seven unselected memory banks must have their $WE$ pins held firmly at $0$ to prevent accidental memory corruption.
* When $WR\_STROBE = 0$ (no write operation taking place), ALL eight $WE_0 \dots WE_7$ pins must remain at $0$.

#### Your Objective

1. Calculate the required number of select lines $S$ and write the complete, condensed routing table for the 1-to-8 memory write distributor.
2. Derive the eight Boolean output equations for $WE_0$ through $WE_7$.
3. Design a hierarchical DEMUX tree that implements this 1:8 write distributor using five 1:2 DEMUX sub-blocks.
4. Calculate the total gate count and propagation delay for both single-stage and hierarchical tree implementations.
5. Verify system operation against critical CPU memory write scenarios.

---

### Step-by-Step Derivation

#### Step 1: Calculate Address Lines and Construct Routing Table

The system must distribute a single data input signal ($D = WR\_STROBE$) across $N = 8$ memory bank outputs ($WE_0$ through $WE_7$).

The required number of address select lines $S$ is:

$$
S = \log_2(N) = \log_2(8) = 3 \text{ address lines } (S_2, S_1, S_0)
$$

Let us construct the condensed routing table for the 1:8 Write Distributor:

```text
1:8 MEMORY WRITE DISTRIBUTOR ROUTING TABLE

 Select S2 │ Select S1 │ Select S0 │ Selected Memory Bank │ Active Output Equation
───────────┼───────────┼───────────┼──────────────────────┼─────────────────────────
     0     │     0     │     0     │        Bank 0        │   WE0 = WR_STROBE
     0     │     0     │     1     │        Bank 1        │   WE1 = WR_STROBE
     0     │     1     │     0     │        Bank 2        │   WE2 = WR_STROBE
     0     │     1     │     1     │        Bank 3        │   WE3 = WR_STROBE
     1     │     0     │     0     │        Bank 4        │   WE4 = WR_STROBE
     1     │     0     │     1     │        Bank 5        │   WE5 = WR_STROBE
     1     │     1     │     0     │        Bank 6        │   WE6 = WR_STROBE
     1     │     1     │     1     │        Bank 7        │   WE7 = WR_STROBE
```

Unselected outputs for each row evaluate to $0$.

---

#### Step 2: Derive the Eight Boolean Output Equations

By pairing each memory bank write-enable output $WE_k$ with its 3-bit address decoding minterm $m_k(S_2, S_1, S_0)$ and the data signal $D = WR\_STROBE$, we derive the eight Boolean equations:

$$
WE_0 = \overline{S_2} \cdot \overline{S_1} \cdot \overline{S_0} \cdot WR\_STROBE
$$

$$
WE_1 = \overline{S_2} \cdot \overline{S_1} \cdot S_0 \cdot WR\_STROBE
$$

$$
WE_2 = \overline{S_2} \cdot S_1 \cdot \overline{S_0} \cdot WR\_STROBE
$$

$$
WE_3 = \overline{S_2} \cdot S_1 \cdot S_0 \cdot WR\_STROBE
$$

$$
WE_4 = S_2 \cdot \overline{S_1} \cdot \overline{S_0} \cdot WR\_STROBE
$$

$$
WE_5 = S_2 \cdot \overline{S_1} \cdot S_0 \cdot WR\_STROBE
$$

$$
WE_6 = S_2 \cdot S_1 \cdot \overline{S_0} \cdot WR\_STROBE
$$

$$
WE_7 = S_2 \cdot S_1 \cdot S_0 \cdot WR\_STROBE
$$

Where:
* $WE_k$ is the write-enable signal sent to Memory Bank $k$.
* $S_2, S_1, S_0$ are the 3 bits of the bank address bus.
* $\overline{S_2}, \overline{S_1}, \overline{S_0}$ are the inverted address signals.
* $WR\_STROBE$ is the master CPU write pulse signal.

---

#### Step 3: Design the Hierarchical DEMUX Tree Using 1:2 DEMUX Sub-Blocks

To construct this 1:8 distributor using only 1:2 DEMUX building blocks:

We calculate the required number of stages. Since each 1:2 DEMUX splits 1 signal into 2 outputs, we need:
* **Stage 1 (MSB Address $S_2$)**: 1 unit of 1:2 DEMUX ($M_{\text{root}}$) driven by $S_2$. Splits $WR\_STROBE$ into two bank-group lines ($W_A$ for banks 0..3, $W_B$ for banks 4..7).
* **Stage 2 (Middle Address $S_1$)**: 2 units of 1:2 DEMUX ($M_{A}, M_{B}$) driven by $S_1$. Splits $W_A$ into $W_{A0}, W_{A1}$ and $W_B$ into $W_{B0}, W_{B1}$.
* **Stage 3 (LSB Address $S_0$)**: 4 units of 1:2 DEMUX ($M_0, M_1, M_2, M_3$) driven by $S_0$. Produces final outputs $WE_0 \dots WE_7$.

```text
HIERARCHICAL 1:8 DEMUX TREE USING 1:2 SUB-BLOCKS

 Stage 1 (S2)             Stage 2 (S1)            Stage 3 (S0)

                     ┌──► [ 1:2 DEMUX MA ] ──┬──► [ 1:2 DEMUX M0 ] ──► WE0, WE1
                     │       (Driven by S1)  └──► [ 1:2 DEMUX M1 ] ──► WE2, WE3
 WR_STROBE ──► [ M_root ]                    
 (Input D)     (Driven S2)                   ┌──► [ 1:2 DEMUX M2 ] ──► WE4, WE5
                     │                       │       (Driven by S0)
                     └──► [ 1:2 DEMUX MB ] ──┴──► [ 1:2 DEMUX M3 ] ──► WE6, WE7
                             (Driven by S1)
```

Let us trace how bank address $S = 101_2$ (decimal 5) routes $WR\_STROBE$ to $WE_5$:
1. **Stage 1 ($S_2 = 1$)**: $M_{\text{root}}$ selects its lower output, driving $WR\_STROBE$ onto line $W_B$.
2. **Stage 2 ($S_1 = 0$)**: $M_B$ receives $W_B$ and selects its upper output, driving $WR\_STROBE$ onto line $W_{B0}$.
3. **Stage 3 ($S_0 = 1$)**: $M_2$ receives $W_{B0}$ and selects its lower output, driving $WR\_STROBE$ directly onto **$WE_5$**!
4. All other seven $WE_k$ lines remain at $0$.

---

#### Step 4: Quantitative Performance Comparison

Let us compare a single-stage 1:8 DEMUX (8 four-input AND gates) against our 3-stage hierarchical 1:2 DEMUX tree:

```text
QUANTITATIVE PERFORMANCE COMPARISON

 Metric                       │ Single-Stage 1:8 DEMUX │ Hierarchical 1:2 DEMUX Tree
──────────────────────────────┼────────────────────────┼───────────────────────────────
 1:2 DEMUX Sub-Blocks         │          0             │            7 Blocks
 Total 4-Input AND Gates      │       8 Gates          │            0 Gates
 Total 2-Input AND Gates      │       0 Gates          │           14 Gates (2 per 1:2 MUX)
 NOT Inverters Needed         │       3 Inverters      │            3 Inverters
 Data-to-Output Path Latency  │ 1 Gate Delay (t_and4)  │ 3 Gate Delays (3 * t_and2)
 Layout Symmetry              │ Medium                 │ PERFECT RECURSIVE TREE
```

---

### Sanity Check and Verification

Let us verify our memory write distributor against three operational CPU memory scenarios.

#### Scenario A: CPU Writes Data to Memory Bank 3 ($S = 011_2$, $WR\_STROBE = 1$)
* **Inputs**: $S_2=0, S_1=1, S_0=1$. $WR\_STROBE = 1$.
* **Expected Result**: $WE_3$ MUST pulse HIGH ($1$). All other seven $WE_k$ pins MUST remain $0$.
* **Equation Evaluations**:
  * $WE_0 = \overline{0} \cdot \overline{1} \cdot \overline{1} \cdot 1 = 1 \cdot 0 \cdot 0 \cdot 1 = 0$.
  * $WE_1 = \overline{0} \cdot \overline{1} \cdot 1 \cdot 1 = 1 \cdot 0 \cdot 1 \cdot 1 = 0$.
  * $WE_2 = \overline{0} \cdot 1 \cdot \overline{1} \cdot 1 = 1 \cdot 1 \cdot 0 \cdot 1 = 0$.
  * $WE_3 = \overline{0} \cdot 1 \cdot 1 \cdot 1 = 1 \cdot 1 \cdot 1 \cdot 1 = 1$. **MATCH!**
  * $WE_4 \dots WE_7$: Since $S_2 = 0$, $\overline{S_2} = 1$, so term $S_2 = 0$ forces $WE_4 \dots WE_7 = 0$.
* **Result**: $WE_3 = 1$, all others $0$. **BANK 3 WRITE VERIFIED!**

#### Scenario B: CPU Performs a Read Operation ($WR\_STROBE = 0$)
* **Inputs**: $S = 011_2$, $WR\_STROBE = 0$ (Read cycle, no write pulse).
* **Expected Result**: ALL eight $WE_0 \dots WE_7$ pins MUST remain at $0$ to prevent overwriting memory during a read!
* **Equation Evaluations**:
  Every output equation $WE_k = m_k(S) \cdot WR\_STROBE$. Since $WR\_STROBE = 0$, every product evaluates to $0$.
* **Result**: $WE_0 \dots WE_7 = 0$. **READ CYCLE PROTECTION VERIFIED!**

#### Scenario C: CPU Writes Data to Memory Bank 6 ($S = 110_2$, $WR\_STROBE = 1$)
* **Inputs**: $S_2=1, S_1=1, S_0=0$. $WR\_STROBE = 1$.
* **Expected Result**: $WE_6$ MUST pulse HIGH ($1$).
* **Equation Evaluation**:
  $WE_6 = S_2 \cdot S_1 \cdot \overline{S_0} \cdot WR\_STROBE = 1 \cdot 1 \cdot \overline{0} \cdot 1 = 1 \cdot 1 \cdot 1 \cdot 1 = 1$.
* **Result**: $WE_6 = 1$, all others $0$. **BANK 6 WRITE VERIFIED!**

All scenarios evaluate with 100% mathematical precision. The CPU memory bank write distributor is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Demultiplexer (DEMUX)**: A combinational digital circuit that acts as a single-source data distributor, using an $S$-bit address decoding bus to route a single input signal $D$ to exactly one selected output channel $Y_k$ out of $N = 2^S$ possibilities while holding all $N-1$ unselected channels inactive.
* **Address Decoding**: The binary decoding mechanism $Y_k = m_k(S) \cdot D$ that evaluates an $S$-bit selection address to enable a single output gate path, providing the physical foundation for memory chip-select logic, bus distribution, and demultiplexing.
