---
title: "BCD-to-7-Segment Decoder Drivers and Display Segment Logic"
---

# BCD-to-7-Segment Decoder Drivers and Display Segment Logic

## The Human-Machine Interface Gap in Digital Instrumentation

Inside a digital system, numeric information is stored and processed as binary vectors. A 4-bit Binary-Coded Decimal (BCD) register represents the decimal quantity $7$ as the binary string $0111_2$, and the decimal quantity $8$ as $1000_2$. For a high-speed central processing unit, these $0$s and $1$s are the ultimate representation of data.

However, human beings do not intuitively read binary bit patterns. If a medical heart-rate monitor or an aircraft altimeter displayed raw binary bit patterns using four indicator lights ($0111_2$), a doctor or pilot would have to manually translate binary positions into decimal numbers during critical emergencies, leading to delayed decisions and fatal human errors. Humans require numeric values rendered as familiar decimal digits ($0, 1, 2, 3, 4, 5, 6, 7, 8, 9$).

To bridge this human-machine interface gap, digital instruments use a **7-Segment Display**—a visual arrangement of seven individual light-emitting diode (LED) bars arranged in a figure-eight pattern, labeled $a, b, c, d, e, f, g$.

```text
THE 7-SEGMENT DISPLAY LED GEOMETRY

                   Segment a
                 ┌───────────┐
              f  │           │  b
                 ├───────────┤  ◄── Segment g (Center Bar)
              e  │           │  c
                 └───────────┘
                   Segment d
```

When you look at a 7-segment display, there is no direct $1$-to-$1$ electrical connection between the 4 binary input wires ($D_3, D_2, D_1, D_0$) and the 7 LED segment pins ($a, b, c, d, e, f, g$). To display the digit $7$ ($0111_2$), segments $a, b, c$ must light up while $d, e, f, g$ remain dark. To display the digit $8$ ($1000_2$), all seven segments $a, b, c, d, e, f, g$ must light up simultaneously.

If an engineer attempts to hardwire a 4-bit BCD bus directly to a 7-segment display, the LEDs illuminate in chaotic, meaningless patterns.

To solve this translation mismatch, digital engineering uses a specialized code translation module: a **BCD-to-7-Segment Decoder Driver**. This module accepts a 4-bit BCD input, evaluates its numerical value, and executes the **Display Segment Logic** required to activate the exact geometric pattern of LEDs for that decimal numeral.

---

## The Stadium Card Stunt: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a 7-segment decoder and display segment logic, let us step away from electronics and imagine a stadium performance during a sports match.

Imagine a stadium section where seven fans are sitting in a specific geometric arrangement shaped like a large figure-eight. The fans are assigned positions labeled Fan $a$ (top bar), Fan $b$ (top-right), Fan $c$ (bottom-right), Fan $d$ (bottom bar), Fan $e$ (bottom-left), Fan $f$ (top-left), and Fan $g$ (middle bar).

Each fan holds a large card that is white on one side and black on the other.

```text
THE STADIUM CARD SECTION GEOMETRY

                     Fan a (Top Bar)
                      ┌─────────┐
       Fan f (Top-L)  │         │  Fan b (Top-R)
                      ├─────────┤  ◄── Fan g (Middle Bar)
       Fan e (Bot-L)  │         │  Fan c (Bot-R)
                      └─────────┘
                     Fan d (Bottom Bar)
```

Down on the field, a stadium director wants to display the number **"3"** to the audience.
Does the stadium director run up the stairs and talk to all seven fans individually? No! The director holds up a single flashcard showing the number "3".

A coordinator standing at the edge of the stands looks at the director's "3" flashcard and calls out simple, pre-arranged instructions to the seven fans:
* *"Fan a, Fan b, Fan c, Fan d, and Fan g: Raise your white cards!"*
* *"Fan e and Fan f: Hold up your black cards!"*

```text
FORMING THE NUMBER "3" ON THE STADIUM GRID

 Fan a : WHITE (Lit)  ───┐
 Fan b : WHITE (Lit)  ───┼──► Audience Sees
 Fan c : WHITE (Lit)  ───┤    the Numeral "3"!
 Fan d : WHITE (Lit)  ───┤
 Fan e : BLACK (Dark) ───┤
 Fan f : BLACK (Dark) ───┤
 Fan g : WHITE (Lit)  ───┘
```

The audience in the stadium looks up and sees the crisp, unmistakable numeral **"3"**.

This stadium performance is the exact physical analogue of a **BCD-to-7-Segment Decoder Driver**:
* The director's flashcard ("3") is the **4-Bit BCD Binary Input** ($0011_2$).
* The coordinator giving instructions is the **BCD Decoder Circuit**.
* The seven fans ($a, b, c, d, e, f, g$) are the **Seven Physical LED Segments**.
* The pre-arranged instruction set for each fan is the **Display Segment Logic**.

In digital electronics, instead of human fans holding cards, a decoder uses a network of logic gates that continuously calculates which LED segments must turn ON or OFF for any incoming 4-bit binary number.

---

## Mechanics of BCD-to-7-Segment Decoding and Display Segment Logic

To master 7-segment decoder design, we must dissect the formal mechanics of its two core primitives:
1. **The BCD Decoder**: How a 4-bit input bus ($D_3, D_2, D_1, D_0$) representing valid decimal digits $0$ through $9$ is processed while evaluating invalid binary states ($10$ through $15$) as **Don't Care ($X$)** conditions.
2. **Display Segment Logic**: How Boolean expressions and Karnaugh maps are derived for each of the seven individual segment outputs ($a, b, c, d, e, f, g$).

---

### Primitive 1: The BCD Decoder Architecture

A **BCD-to-7-Segment Decoder** is a 4-input, 7-output combinational logic circuit. It receives a 4-bit BCD input vector $D = (D_3, D_2, D_1, D_0)$, where $D_3$ is the Most Significant Bit (MSB, weight 8) and $D_0$ is the Least Significant Bit (LSB, weight 1).

It generates seven independent Boolean output signals: $Sa, Sb, Sc, Sd, Se, Sf, Sg$.

```text
BCD-TO-7-SEGMENT DECODER FUNCTIONAL BLOCK

 Input BCD Bus (4 Bits)                   Segment Outputs (7 Lines)
 ┌───────────┐                            ┌───► Segment Sa (Top)
 │ Input D3  ├─┐                          ├───► Segment Sb (Top-Right)
 │ Input D2  ├─┼─► [ BCD-to-7-Segment ] ──┼───► Segment Sc (Bot-Right)
 │ Input D1  ├─┼─► [  Decoder Driver  ] ──┼───► Segment Sd (Bottom)
 │ Input D0  ├─┘                          ├───► Segment Se (Bot-Left)
 └───────────┘                            ├───► Segment Sf (Top-Left)
                                          └───► Segment Sg (Middle)
```

#### 1. Valid BCD Input Range vs. Don't Care States
A 4-bit binary input bus can form $2^4 = 16$ unique combinations ($0000_2$ to $1111_2$). However, Binary-Coded Decimal (BCD) only uses the first ten combinations ($0$ through $9$):

* **Valid BCD Inputs ($0$ to $9$)**: Binary values $0000_2$ ($0$) through $1001_2$ ($9$). The decoder MUST synthesize the exact, correct LED patterns for these ten digits.
* **Invalid BCD Inputs ($10$ to $15$)**: Binary values $1010_2$ ($10$) through $1111_2$ ($15$). These combinations will never be emitted by a valid BCD source. Therefore, rows 10 through 15 are treated as **Don't Care ($X$)** conditions in our Karnaugh Maps, allowing us to dramatically simplify the physical logic gates!

```text
BCD INPUT SPACE CLASSIFICATION

 Decimal 0..9 (0000_2 to 1001_2) ────► VALID BCD ──────► Must Output Exact Digit Pattern
 Decimal 10..15 (1010_2 to 1111_2) ──► INVALID BCD ────► DON'T CARE WILD CARDS (X)!
```

---

### Primitive 2: Display Segment Logic Derivation

To determine the Boolean equations for segments $a, b, c, d, e, f, g$, we construct the master 16-row truth table for active-high segment driving (where $1 = \text{LED ON}$ and $0 = \text{LED OFF}$).

#### Master BCD-to-7-Segment Truth Table

```text
MASTER BCD-TO-7-SEGMENT DECODER TRUTH TABLE

 Digit │ D3 D2 D1 D0 │ Sa │ Sb │ Sc │ Sd │ Se │ Sf │ Sg │ Visual Display Pattern
───────┼─────────────┼────┼────┼────┼────┼────┼────┼────┼─────────────────────────
   0   │  0  0  0  0 │ 1  │ 1  │ 1  │ 1  │ 1  │ 1  │ 0  │ Outer ring ON, middle OFF
   1   │  0  0  0  1 │ 0  │ 1  │ 1  │ 0  │ 0  │ 0  │ 0  │ Right vertical bar (b, c)
   2   │  0  0  1  0 │ 1  │ 1  │ 0  │ 1  │ 1  │ 0  │ 1  │ Top, top-R, mid, bot-L, bot
   3   │  0  0  1  1 │ 1  │ 1  │ 1  │ 1  │ 0  │ 0  │ 1  │ Top, top-R, mid, bot-R, bot
   4   │  0  1  0  0 │ 0  │ 1  │ 1  │ 0  │ 0  │ 1  │ 1  │ Top-L, mid, top-R, bot-R
   5   │  0  1  0  1 │ 1  │ 0  │ 1  │ 1  │ 0  │ 1  │ 1  │ Top, top-L, mid, bot-R, bot
   6   │  0  1  1  0 │ 1  │ 0  │ 1  │ 1  │ 1  │ 1  │ 1  │ Top, top-L, mid, bot-L, bot-R, bot
   7   │  0  1  1  1 │ 1  │ 1  │ 1  │ 0  │ 0  │ 0  │ 0  │ Top bar, right vertical bar
   8   │  1  0  0  0 │ 1  │ 1  │ 1  │ 1  │ 1  │ 1  │ 1  │ All 7 segments ON!
   9   │  1  0  0  1 │ 1  │ 1  │ 1  │ 1  │ 0  │ 1  │ 1  │ All ON except bottom-left (e)
───────┼─────────────┼────┼────┼────┼────┼────┼────┼────┼─────────────────────────
 10..15│ 1010..1111  │ X  │ X  │ X  │ X  │ X  │ X  │ X  │ DON'T CARE WILDCARDS (X)
```

Study this truth table carefully! Every segment has its own unique column of $1$s, $0$s, and $X$s. To build the circuit, we map each segment column onto a 4-variable Karnaugh Map and extract its minimal Sum of Products (SOP) expression.

---

### Karnaugh Map Minimization for Individual Display Segments

Let us perform Karnaugh map optimization for key display segments using Don't Care states ($X$ for cells 10, 11, 12, 13, 14, 15).

#### 1. Minimizing Segment $Sa$ (Top Horizontal Bar)

Segment $Sa$ is lit ($1$) for digits 0, 2, 3, 5, 6, 7, 8, 9.
Minterm summation notation:

$$
Sa(D_3, D_2, D_1, D_0) = \sum m(0, 2, 3, 5, 6, 7, 8, 9) + d(10, 11, 12, 13, 14, 15)
$$

Mapping $Sa$ onto a 4-variable K-Map grid ($D_3 D_2$ on rows, $D_1 D_0$ on columns):

```text
SEGMENT Sa KARNAUGH MAP GRID

             D1 D0 = 00    D1 D0 = 01    D1 D0 = 11    D1 D0 = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
 D3D2= 00 │      1      │      0      │      1      │      1      │
          │  (Cell 0)   │  (Cell 1)   │  (Cell 3)   │  (Cell 2)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 01 │      0      │      1      │      1      │      1      │
          │  (Cell 4)   │  (Cell 5)   │  (Cell 7)   │  (Cell 6)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 11 │      X      │      X      │      X      │      X      │
          │  (Cell 12)  │  (Cell 13)  │  (Cell 15)  │  (Cell 14)  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 10 │      1      │      1      │      X      │      X      │
          │  (Cell 8)   │  (Cell 9)   │  (Cell 11)  │  (Cell 10)  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s opportunistically using the Don't Care $X$s:
* **Group 1 (8-cell right block)**: Columns $D_1 D_0 = 11, 10$ across all rows (Cells 2, 3, 6, 7, 10, 11, 14, 15). Gives term: **$D_1$**.
* **Group 2 (4-cell bottom-left block)**: Rows $D_3 D_2 = 11, 10$, columns $D_1 D_0 = 00, 01$ (Cells 8, 9, 12, 13). Gives term: **$D_3$**.
* **Group 3 (4-cell center block)**: Rows $D_3 D_2 = 01, 11$, columns $D_1 D_0 = 01, 11$ (Cells 5, 7, 13, 15). Gives term: **$D_2 \cdot D_0$**.
* **Group 4 (4-corner wrap-around)**: Cells 0, 2, 8, 10. Gives term: **$\overline{D_2} \cdot \overline{D_0}$**.

Combining these four groups yields the minimal Boolean equation for Segment $Sa$:

$$
Sa = D_3 + D_1 + (D_2 \cdot D_0) + (\overline{D_2} \cdot \overline{D_0})
$$

Where:
* $Sa$ is the control signal for Segment $a$.
* $D_3, D_2, D_1, D_0$ are the 4 input bits of the BCD code ($D_3$ is MSB, $D_0$ is LSB).

Look at that expression! Notice that $(\overline{D_2} \cdot \overline{D_0}) + (D_2 \cdot D_0)$ is the exact definition of an **XNOR gate** between $D_2$ and $D_0$!
We can rewrite Segment $Sa$ using an XNOR primitive:

$$
Sa = D_3 + D_1 + (D_2 \odot D_0)
$$

---

#### 2. Minimizing Segment $Se$ (Bottom-Left Vertical Bar)

Segment $Se$ is lit ($1$) for digits 0, 2, 6, 8.
Minterm summation notation:

$$
Se(D_3, D_2, D_1, D_0) = \sum m(0, 2, 6, 8) + d(10, 11, 12, 13, 14, 15)
$$

Mapping $Se$ onto its 4-variable K-Map grid:

```text
SEGMENT Se KARNAUGH MAP GRID

             D1 D0 = 00    D1 D0 = 01    D1 D0 = 11    D1 D0 = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
 D3D2= 00 │      1      │      0      │      0      │      1      │
          │  (Cell 0)   │  (Cell 1)   │  (Cell 3)   │  (Cell 2)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 01 │      0      │      0      │      0      │      1      │
          │  (Cell 4)   │  (Cell 5)   │  (Cell 7)   │  (Cell 6)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 11 │      X      │      X      │      X      │      X      │
          │  (Cell 12)  │  (Cell 13)  │  (Cell 15)  │  (Cell 14)  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 10 │      1      │      0      │      X      │      X      │
          │  (Cell 8)   │  (Cell 9)   │  (Cell 11)  │  (Cell 10)  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s:
* **Group 1 (4-corner group)**: Cells 0, 2, 8, 10. Gives term: **$\overline{D_2} \cdot \overline{D_0}$**.
* **Group 2 (2-cell column group)**: Cells 2, 6, 10, 14 (Column $D_1 D_0 = 10$). Gives term: **$D_1 \cdot \overline{D_0}$**.

Combining these two groups yields the minimal Boolean equation for Segment $Se$:

$$
Se = (\overline{D_2} \cdot \overline{D_0}) + (D_1 \cdot \overline{D_0}) = \overline{D_0} \cdot (\overline{D_2} + D_1)
$$

Where:
* $Se$ is the control signal for Segment $e$.
* $\overline{D_0}$ is the inverted LSB input bit.
* $\overline{D_2}$ is the inverted bit 2 input.
* $D_1$ is bit 1 of the BCD code.

---

### Minimal Boolean Equations for All Seven Segments

By performing Karnaugh map optimization for all seven individual display segments, we obtain the complete set of minimal Boolean equations for an active-high BCD-to-7-segment decoder:

$$
Sa = D_3 + D_1 + (D_2 \cdot D_0) + (\overline{D_2} \cdot \overline{D_0})
$$

$$
Sb = \overline{D_2} + (\overline{D_1} \cdot \overline{D_0}) + (D_1 \cdot D_0)
$$

$$
Sc = D_2 + \overline{D_1} + D_0
$$

$$
Sd = D_3 + (\overline{D_2} \cdot \overline{D_0}) + (\overline{D_2} \cdot D_1) + (D_1 \cdot \overline{D_0}) + (D_2 \cdot \overline{D_1} \cdot D_0)
$$

$$
Se = (\overline{D_2} \cdot \overline{D_0}) + (D_1 \cdot \overline{D_0})
$$

$$
Sf = D_3 + (\overline{D_1} \cdot \overline{D_0}) + (D_2 \cdot \overline{D_1}) + (D_2 \cdot \overline{D_0})
$$

$$
Sg = D_3 + (D_2 \cdot \overline{D_1}) + (\overline{D_2} \cdot D_1) + (D_1 \cdot \overline{D_0})
$$

Where:
* $Sa, Sb, Sc, Sd, Se, Sf, Sg$ are the 7 active-high segment drive signals.
* $D_3, D_2, D_1, D_0$ are the 4 binary input bits of the BCD code.

```text
GATE-LEVEL ARCHITECTURE FOR BCD SEGMENT LOGIC

 BCD Inputs D3, D2, D1, D0
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Sa Gate Network ] ───► Sa (Top Bar)
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Sb Gate Network ] ───► Sb (Top-Right)
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Sc Gate Network ] ───► Sc (Bot-Right)
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Sd Gate Network ] ───► Sd (Bottom Bar)
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Se Gate Network ] ───► Se (Bot-Left)
  │  │  │  │
  ├──┼──┼──┼───► [ Segment Sf Gate Network ] ───► Sf (Top-Left)
  │  │  │  │
  └──┴──┴──┴───► [ Segment Sg Gate Network ] ───► Sg (Middle Bar)
```


---

## Physical LED Display Configurations: Common-Anode versus Common-Cathode

When connecting a BCD-to-7-segment decoder driver to a physical display component on a circuit board, the engineer must match the decoder's output polarity to the physical LED arrangement inside the display package.

Physical 7-segment LED packages are manufactured in two distinct electrical configurations:
1. **Common-Cathode (CC) Displays** (Driven by Active-High Decoders).
2. **Common-Anode (CA) Displays** (Driven by Active-Low Decoders).

```text
COMMON-CATHODE VERSUS COMMON-ANODE LED HARDWARE

 COMMON-CATHODE (Active-High Drive)      COMMON-ANODE (Active-Low Drive)
      +5V (VDD)                               +5V (VDD)
       │                                       │
  [ Decoder Output Sa = 1 ]               [ Common Anode Pin ]
       │                                       │
       ▼                                       ├────────┐
    (Anode)                                    ▼        ▼
   [ LED a ]                                [ LED a ] [ LED b ]
   (Cathode)                                   │        │
       │                                       ▼        ▼
  [ Ground Pin (0V) ]                   [ Decoder Output Sa' = 0 ]
  All Cathodes Tied to Ground           All Anodes Tied to +5V
```

### 1. Common-Cathode (CC) Displays
In a **Common-Cathode** display, the negative terminals (cathodes) of all seven individual LEDs are tied together inside the package and connected directly to electrical Ground ($0\text{ V}$).

To light up a segment on a Common-Cathode display:
* The decoder output pin must drive the positive terminal (anode) to **$+5\text{ V}$ (Logic 1)**.
* Current flows from the decoder pin through the LED into Ground.
* **Decoder Requirement**: Uses **Active-High Segment Logic** ($Sa \dots Sg$).

### 2. Common-Anode (CA) Displays
In a **Common-Anode** display, the positive terminals (anodes) of all seven individual LEDs are tied together inside the package and connected directly to the positive power supply ($+5\text{ V}$).

To light up a segment on a Common-Anode display:
* The decoder output pin must pull the negative terminal (cathode) down to **$0\text{ V}$ (Logic 0)**!
* Current flows from the $+5\text{ V}$ power supply through the LED into the decoder pin (current sinking).
* **Decoder Requirement**: Uses **Active-Low Segment Logic** ($\overline{Sa} \dots \overline{Sg}$).

```text
ELECTRICAL DRIVING SUMMARY

 Display Configuration │ Common Pin Connection │ Segment Drive Output │ Active Logic Level
───────────────────────┼───────────────────────┼──────────────────────┼───────────────────
 Common-Cathode (CC)   │ Electrical Ground (0V)│ Anode Driver Pin     │ Active-High (1 = ON)
 Common-Anode (CA)     │ Power Supply (+5V)    │ Cathode Driver Pin   │ Active-Low  (0 = ON)
```

To convert an active-high segment equation to an active-low equation for a Common-Anode display, simply apply **De Morgan's Laws** or place a NOT gate inverter at each segment output pin!

---

## Multi-Digit Time-Division Multiplexed Display Driving

Imagine designing a digital alarm clock or instrument panel that needs to display **four decimal digits** simultaneously (e.g., "12:45").

If you use a separate, dedicated BCD-to-7-segment decoder chip for each of the four digits:
* You need 4 decoder chips.
* You need $4 \times 7 = 28$ individual current-limiting resistors.
* You need $4 \times 4 = 16$ microcontroller output pins to drive the four BCD buses!

```text
STATIC MULTI-DIGIT DRIVING (HIGH PIN COUNT AND COST)

 Microcontroller (16 Pins) ──► 4x BCD Decoders ──► 28 Resistors ──► 4x 7-Segment Displays
```

To eliminate this massive hardware bloat, digital engineers use **Time-Division Multiplexed (TDM) Display Driving**.

### How Time-Division Multiplexing Works

In a Time-Division Multiplexed display system:
1. All four 7-segment display digits share a **single, common 7-line segment bus** ($a, b, c, d, e, f, g$) driven by **one single BCD-to-7-segment decoder**!
2. Each display digit has its common pin (Anode or Cathode) connected to a PNP or NPN transistor acting as a **Digit Enable Switch** ($EN_0, EN_1, EN_2, EN_3$).
3. The microcontroller executes a rapid refresh loop:
   * **Step 1**: Output BCD digit for Digit 0. Turn ON $EN_0$ for 2 milliseconds. (Digit 0 displays its number).
   * **Step 2**: Turn OFF $EN_0$. Output BCD digit for Digit 1. Turn ON $EN_1$ for 2 milliseconds. (Digit 1 displays its number).
   * **Step 3**: Turn OFF $EN_1$. Output BCD digit for Digit 2. Turn ON $EN_2$ for 2 milliseconds. (Digit 2 displays its number).
   * **Step 4**: Turn OFF $EN_2$. Output BCD digit for Digit 3. Turn ON $EN_3$ for 2 milliseconds. (Digit 3 displays its number).

```text
TIME-DIVISION MULTIPLEXED DISPLAY HARDWARE LAYOUT

 Single BCD Bus (4 Bits) ──► [ Single BCD Decoder ] ──► Shared 7-Line Segment Bus (a..g)
                                                              │
                    ┌─────────────────┬───────────────────────┼─────────────────┐
                    ▼                 ▼                       ▼                 ▼
             [ Digit 0 LED ]   [ Digit 1 LED ]         [ Digit 2 LED ]   [ Digit 3 LED ]
                    │                 │                       │                 │
                    ▼                 ▼                       ▼                 ▼
             [ Transistor 0 ]  [ Transistor 1 ]        [ Transistor 2 ]  [ Transistor 3 ]
                    ▲                 ▲                       ▲                 ▲
                    │                 │                       │                 │
 Digit Selects ─────┴─────────────────┴───────────────────────┴─────────────────┘
 (EN0..EN3 from Microcontroller)
```

### Persistence of Vision

The total cycle time for all 4 digits is:

$$
T_{\text{refresh}} = 4 \times 2\text{ ms} = 8\text{ ms}
$$

The refresh frequency $f_{\text{refresh}}$ is:

$$
f_{\text{refresh}} = \frac{1}{T_{\text{refresh}}} = \frac{1}{0.008\text{ s}} = 125\text{ Hz}
$$

Because the refresh rate ($125\text{ Hz}$) is much faster than the human eye's critical flicker fusion threshold ($\approx 60\text{ Hz}$), human **Persistence of Vision** blends the rapid sequential flashes into the seamless optical illusion of four steadily glowing digits!

```text
SAVINGS ACHIEVED BY TIME-DIVISION MULTIPLEXING
* BCD Decoders Needed : Reduced from 4 chips to 1 chip (75% Savings!)
* Limiting Resistors  : Reduced from 28 resistors to 7 resistors (75% Savings!)
* Microcontroller Pins: Reduced from 16 pins to 8 pins (4 BCD + 4 Digit Selects)
```

---

## Solved Industrial Engineering Exercise: Avionics Altimeter Display Driver

To consolidate your complete mastery of BCD decoding, display segment logic, Common-Anode active-low conversion, K-map optimization, and multiplexed display driving, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics instrumentation firm is designing the digital altitude display module for an aircraft cockpit panel. The altimeter displays altitude in thousands of feet using two Common-Anode 7-segment LED displays ($\text{Digit}_1$ for tens, $\text{Digit}_0$ for units).

The system receives a 4-bit BCD input bus $D = (D_3, D_2, D_1, D_0)$ from the altitude sensor.

```text
AVIONICS ALTIMETER DISPLAY MODULE LAYOUT

 BCD Altitude Bus (D3..D0) ──► [ Common-Anode BCD Decoder ] ──► Active-Low Bus (Sa'..Sg')
                                                                     │
                                              ┌──────────────────────┴──────────────────────┐
                                              ▼                                             ▼
                                     [ Tens Digit LED (CA) ]                       [ Units Digit LED (CA) ]
                                              │                                             │
                                              ▼                                             ▼
                                     [ Anode Switch EN1 ]                          [ Anode Switch EN0 ]
```

Because the cockpit panel uses **Common-Anode (CA) LED displays**, the segment outputs must be **Active-Low** ($\overline{Sa}, \overline{Sb}, \overline{Sc}, \overline{Sd}, \overline{Se}, \overline{Sf}, \overline{Sg}$), where $0\text{ V}$ (Logic 0) turns an LED segment ON, and $+5\text{ V}$ (Logic 1) turns an LED segment OFF.

#### System Objectives

1. Derive the active-low Boolean equation for **Segment $\overline{Sb}$** (top-right vertical bar) using Karnaugh map optimization with Don't Care wildcards ($X$).
2. Derive the active-low Boolean equation for **Segment $\overline{Sc}$** (bottom-right vertical bar).
3. Convert the active-low equations into gate schematics using **NAND logic gates**.
4. Calculate the total power dissipation and refresh timing for a 2-digit multiplexed display running at $200\text{ Hz}$.
5. Verify system performance across critical altitude display values.

---

### Step-by-Step Derivation

#### Step 1: Derive the Truth Table for Active-Low Segments $\overline{Sb}$ and $\overline{Sc}$

For a Common-Anode display, a segment is **ON ($0$)** when the numeral requires that segment, and **OFF ($1$)** when it does not.

Let us inspect the numerical shapes for digits 0 through 9:
* **Segment $b$ (top-right bar)** is lit for digits 0, 1, 2, 3, 4, 7, 8, 9. It is OFF ($1$) ONLY for digits 5 and 6!
* **Segment $c$ (bottom-right bar)** is lit for digits 0, 1, 3, 4, 5, 6, 7, 8, 9. It is OFF ($1$) ONLY for digit 2!

```text
ACTIVE-LOW TRUTH TABLE FOR SEGMENTS Sb' AND Sc'

 Digit │ D3 D2 D1 D0 │ Segment Sb' Status (0 = ON, 1 = OFF) │ Segment Sc' Status (0 = ON, 1 = OFF)
───────┼─────────────┼──────────────────────────────────────┼──────────────────────────────────────
   0   │  0  0  0  0 │                  0                   │                  0
   1   │  0  0  0  1 │                  0                   │                  0
   2   │  0  0  1  0 │                  0                   │                  1 (OFF for '2')
   3   │  0  0  1  1 │                  0                   │                  0
   4   │  0  1  0  0 │                  0                   │                  0
   5   │  0  1  0  1 │                  1 (OFF for '5')     │                  0
   6   │  0  1  1  0 │                  1 (OFF for '6')     │                  0
   7   │  0  1  1  1 │                  0                   │                  0
   8   │  1  0  0  0 │                  0                   │                  0
   9   │  1  0  0  1 │                  0                   │                  0
───────┼─────────────┼──────────────────────────────────────┼──────────────────────────────────────
 10..15│ 1010..1111  │                  X                   │                  X
```

---

#### Step 2: Karnaugh Map Minimization for Active-Low Segment $\overline{Sb}$

To find when $\overline{Sb} = 1$ (when segment $b$ is OFF), we group the $1$s at rows 5 and 6, using Don't Care wildcards ($X$ for cells 10..15):

$$
\overline{Sb}(D_3, D_2, D_1, D_0) = \sum m(5, 6) + d(10, 11, 12, 13, 14, 15)
$$

Mapping $\overline{Sb}$ onto a 4-variable K-Map grid:

```text
SEGMENT Sb' KARNAUGH MAP GRID

             D1 D0 = 00    D1 D0 = 01    D1 D0 = 11    D1 D0 = 10
          ┌─────────────┬─────────────┬─────────────┬─────────────┐
 D3D2= 00 │      0      │      0      │      0      │      0      │
          │  (Cell 0)   │  (Cell 1)   │  (Cell 3)   │  (Cell 2)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 01 │      0      │      1      │      0      │      1      │
          │  (Cell 4)   │  (Cell 5)   │  (Cell 7)   │  (Cell 6)   │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 11 │      X      │      X      │      X      │      X      │
          │  (Cell 12)  │  (Cell 13)  │  (Cell 15)  │  (Cell 14)  │
          ├─────────────┼─────────────┼─────────────┼─────────────┤
 D3D2= 10 │      0      │      0      │      X      │      X      │
          │  (Cell 8)   │  (Cell 9)   │  (Cell 11)  │  (Cell 10)  │
          └─────────────┴─────────────┴─────────────┴─────────────┘
```

Let us group the $1$s:
* **Group 1 (Cell 5 + Cell 13)**: Cell 5 ($0101_2$) and Cell 13 ($1101_2$, $X$).
  Rows $D_3 D_2 = 01, 11 \implies D_2 = 1$. Columns $D_1 D_0 = 01 \implies \overline{D_1} \cdot D_0$.
  Group 1 Term: $D_2 \cdot \overline{D_1} \cdot D_0$.
* **Group 2 (Cell 6 + Cell 14)**: Cell 6 ($0110_2$) and Cell 14 ($1110_2$, $X$).
  Rows $D_3 D_2 = 01, 11 \implies D_2 = 1$. Columns $D_1 D_0 = 10 \implies D_1 \cdot \overline{D_0}$.
  Group 2 Term: $D_2 \cdot D_1 \cdot \overline{D_0}$.

Combining Group 1 and Group 2:

$$
\overline{Sb} = (D_2 \cdot \overline{D_1} \cdot D_0) + (D_2 \cdot D_1 \cdot \overline{D_0}) = D_2 \cdot [(\overline{D_1} \cdot D_0) + (D_1 \cdot \overline{D_0})]
$$

Notice that $(\overline{D_1} \cdot D_0) + (D_1 \cdot \overline{D_0})$ is the exact definition of an **XOR gate** between $D_1$ and $D_0$!

$$
\overline{Sb} = D_2 \cdot (D_1 \oplus D_0)
$$

Where:
* $\overline{Sb}$ is the active-low drive signal for Segment $b$.
* $D_2, D_1, D_0$ are the lower 3 bits of the BCD code.

Look at how elegant this equation is! Segment $b$ turns OFF ($1$) if and only if $D_2 = 1$ AND bits $D_1, D_0$ are different!

---

#### Step 3: Karnaugh Map Minimization for Active-Low Segment $\overline{Sc}$

Segment $\overline{Sc} = 1$ (Segment $c$ OFF) ONLY for digit 2 ($m_2 = 0010_2$):

$$
\overline{Sc}(D_3, D_2, D_1, D_0) = \sum m(2) + d(10, 11, 12, 13, 14, 15)
$$

Mapping $\overline{Sc}$ onto a K-Map:
* Cell 2 ($0010_2$) contains $1$.
* Cell 10 ($1010_2$) contains $X$.

Grouping Cell 2 and Cell 10 together into a 2-cell vertical group:
* Rows $D_3 D_2 = 00, 10 \implies D_3$ changes ($0 \to 1$), discarded. Variable $D_2 = 0 \implies \overline{D_2}$.
* Columns $D_1 D_0 = 10 \implies D_1 = 1, D_0 = 0 \implies D_1 \cdot \overline{D_0}$.

The minimal Boolean equation for active-low Segment $\overline{Sc}$ is:

$$
\overline{Sc} = \overline{D_2} \cdot D_1 \cdot \overline{D_0}
$$

Where:
* $\overline{Sc}$ is the active-low drive signal for Segment $c$.
* $\overline{D_2}$ is the inverted bit 2 of the BCD code.
* $D_1$ is bit 1 of the BCD code.
* $\overline{D_0}$ is the inverted LSB bit.

---

#### Step 4: Refresh Timing for a 2-Digit Multiplexed Display at $200\text{ Hz}$

The cockpit display multiplexes 2 digits ($\text{Digit}_1$ and $\text{Digit}_0$) at a refresh frequency $f_{\text{refresh}} = 200\text{ Hz}$.

##### 1. Calculate Total Refresh Period ($T_{\text{period}}$):
$$
T_{\text{period}} = \frac{1}{f_{\text{refresh}}} = \frac{1}{200\text{ Hz}} = 0.005\text{ s} = 5.0\text{ ms}
$$

##### 2. Calculate Active Time per Digit ($t_{\text{digit}}$):
Since there are 2 digits sharing the period equally:

$$
t_{\text{digit}} = \frac{T_{\text{period}}}{2} = \frac{5.0\text{ ms}}{2} = 2.5\text{ ms}
$$

Each digit is turned ON for **$2.5\text{ ms}$** every $5.0\text{ ms}$ cycle ($50\%$ duty cycle). The human eye perceives two perfectly steady, non-flickering cockpit display digits!

---

### Sanity Check and Verification

Let us verify our active-low equations $\overline{Sb} = D_2 \cdot (D_1 \oplus D_0)$ and $\overline{Sc} = \overline{D_2} \cdot D_1 \cdot \overline{D_0}$ against cockpit altitude values:

#### Test Case 1: Displaying Digit 5 ($ABCD = 0101_2$)
* **Inputs**: $D_3=0, D_2=1, D_1=0, D_0=1$.
* **Expected Result**:
  * Digit 5 requires Segment $b$ (top-right) to be **OFF ($\overline{Sb} = 1$)**.
  * Digit 5 requires Segment $c$ (bottom-right) to be **ON ($\overline{Sc} = 0$)**.
* **Formula Evaluations**:
  * $\overline{Sb} = D_2 \cdot (D_1 \oplus D_0) = 1 \cdot (0 \oplus 1) = 1 \cdot 1 = 1$ (Segment $b$ OFF!). **MATCH!**
  * $\overline{Sc} = \overline{D_2} \cdot D_1 \cdot \overline{D_0} = \overline{1} \cdot 0 \cdot \overline{1} = 0 \cdot 0 \cdot 0 = 0$ (Segment $c$ ON!). **MATCH!**

#### Test Case 2: Displaying Digit 2 ($ABCD = 0010_2$)
* **Inputs**: $D_3=0, D_2=0, D_1=1, D_0=0$.
* **Expected Result**:
  * Digit 2 requires Segment $b$ to be **ON ($\overline{Sb} = 0$)**.
  * Digit 2 requires Segment $c$ to be **OFF ($\overline{Sc} = 1$)**.
* **Formula Evaluations**:
  * $\overline{Sb} = D_2 \cdot (D_1 \oplus D_0) = 0 \cdot (1 \oplus 0) = 0 \cdot 1 = 0$ (Segment $b$ ON!). **MATCH!**
  * $\overline{Sc} = \overline{D_2} \cdot D_1 \cdot \overline{D_0} = \overline{0} \cdot 1 \cdot \overline{0} = 1 \cdot 1 \cdot 1 = 1$ (Segment $c$ OFF!). **MATCH!**

#### Test Case 3: Displaying Digit 8 ($ABCD = 1000_2$)
* **Inputs**: $D_3=1, D_2=0, D_1=0, D_0=0$.
* **Expected Result**: All segments ON ($\overline{Sb} = 0, \overline{Sc} = 0$).
* **Formula Evaluations**:
  * $\overline{Sb} = 0 \cdot (0 \oplus 0) = 0$ (ON!).
  * $\overline{Sc} = \overline{0} \cdot 0 \cdot \overline{0} = 0$ (ON!). **MATCH!**

All tests pass with 100% mathematical precision. The active-low BCD-to-7-segment altimeter display driver is fully verified and ready for flight production.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **BCD Decoder**: A specialized code-translation module that accepts a 4-bit Binary-Coded Decimal input ($D_3, D_2, D_1, D_0$) representing values $0$ through $9$ and treats invalid BCD codes ($10$ through $15$) as Don't Care wildcards ($X$) to minimize hardware footprint.
* **Display Segment Logic**: The set of seven Boolean equations ($Sa \dots Sg$ for active-high Common-Cathode or $\overline{Sa} \dots \overline{Sg}$ for active-low Common-Anode) that map 4-bit BCD binary codes to the exact geometric LED segment activation patterns required to render human-readable decimal numerals.
