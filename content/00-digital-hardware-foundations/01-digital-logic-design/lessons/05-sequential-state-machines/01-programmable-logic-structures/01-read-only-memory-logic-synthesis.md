# Read-Only Memory Logic Synthesis and Lookup Table Hardware Architecture

## The Engineering Nightmare of Custom Gate Networks for Complex Functions

When digital systems engineers design hardware to execute complex, multi-output decision rules—such as translating a 4-bit Binary-Coded Decimal (BCD) value into a 7-segment display pattern, computing mathematical function approximations, or orchestrating a microprocessor's internal control signals—their traditional approach is gate-level combinational synthesis.

To build a multi-output circuit using custom logic gates, an engineer must manually write out truth tables for every single output line, construct multiple Karnaugh Maps, perform tedious Boolean algebraic minimizations, and route messy webs of AND, OR, and NOT gates across a silicon die.

```text
THE CUSTOM GATE SYNTHESIS NIGHTMARE

 Multi-Output Truth Table ──► [ K-Map Minimizations ] ──► Custom Gate Layout
 (8 Inputs, 8 Outputs)        (8 Complex Maps!)          (Messy Interconnect)
                                                                │
                                                                ▼
                                                   Reroute Everything if
                                                   Specification Changes!
```

This custom gate approach suffers from four crippling hardware engineering liabilities:

1. **Extreme Design Complexity**: Minimizing and routing a system with 8 inputs and 8 outputs ($2^8 = 256$ truth table rows, 8 separate output functions) requires enormous human effort and creates dozens of opportunities for wiring mistakes.
2. **Silicon Interconnect Congestion**: Every output function requires its own specialized collection of AND and OR gates. Interconnecting these irregular, custom gate clusters across a microchip produces a chaotic web of copper traces that consumes massive amounts of physical die area.
3. **Rigid Hardwired Inflexibility**: If a customer or safety auditor modifies the system specification after the microchip has been fabricated (for example, changing how an error output should react to a specific sensor code), the entire custom gate layout becomes completely useless. The chip must be discarded, and a new custom layout must be designed from scratch at huge financial expense.
4. **Uneven Signal Propagation Delays**: Because each output function is minimized into a different arrangement of logic gates, different output pins settle at different times, creating timing skews that complicate system clock synchronization.

Why should we spend weeks minimizing equations and routing custom, irregular gate networks for every new problem when we can store the desired truth table outputs directly inside a standardized hardware matrix?

Instead of calculating Boolean functions on the fly using custom logic gates, why not store the pre-computed answers of the truth table directly inside a standardized array of memory cells, and simply "look up" the correct answer whenever an input arrives?

This paradigm shift is **Lookup Table (LUT) Synthesis**, and the standardized hardware module that implements it is the **Read-Only Memory (ROM)**. By replacing custom gate minimization with address-based binary data storage, a ROM allows any multi-output Boolean function to be synthesized instantly with absolute mathematical perfection.

---

## The Vending Machine Snack Index: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how a Read-Only Memory (ROM) implements combinational logic without using custom logic gates, let us step away from silicon microchips and picture a modern, automated vending machine.

Imagine a large vending machine that stocks 16 different snack items in 16 numbered storage shelves ($0$ through $15$). On the front panel of the machine is a 4-button keypad ($A_3, A_2, A_1, A_0$) where a customer enters the binary address of the snack they want to purchase.

```text
THE AUTOMATED VENDING MACHINE ANALOGY

 Keypad Address Inputs (A3..A0) ──► [ Shelf Selector ] ──► Activates Shelf 5
                                     (Address Decoder)     (Word Line W5 = 1)
                                                                 │
                                                                 ▼
                                                    [ Pre-Packed Snack Tray 5 ]
                                                    (Pre-Stored Data Word!)
```

Inside the vending machine are two distinct operational mechanisms:

### Mechanism 1: The Fixed Shelf Selector (The Address Decoder)
When a customer enters binary code $0101_2$ (decimal 5) on the keypad:
* The machine's internal mechanical selector turns ON **Shelf Line 5 ($W_5$)**.
* All other 15 shelf lines ($W_0 \dots W_4, W_6 \dots W_{15}$) remain completely INACTIVE ($0$).

Notice an important property of this shelf selector: **It is 100% fixed and universal.** It does not care what snack is sitting on Shelf 5. Whether Shelf 5 holds potato chips, chocolate, or a bottled drink, entering $0101_2$ will ALWAYS select Shelf 5.

### Mechanism 2: The Pre-Packed Food Trays (The Data Storage Matrix)
Sitting on Shelf 5 is a pre-packed tray holding a specific combination of items—for example, 1 bottle of water, 0 candy bars, 1 bag of nuts, and 0 apples. We can represent this pre-packed item tray as a 4-bit binary data word: $1010_2$.

When Shelf Line 5 ($W_5$) is activated, the mechanism simply drops the contents of pre-packed tray 5 ($1010_2$) onto the delivery chute!

```text
LOOKING UP THE PRE-STORED ANSWER

 Customer Address Code: 0101_2 (5) ──► Selects Shelf 5 ──► Drops Tray 5 Data: 1010_2!
```

Now, ask yourself a fundamental engineering question: What if the vending machine owner wants to change what meal a customer gets when they press button 5?

Does the owner dismantle the mechanical shelf selector or rewire the keypad buttons? **Of course not!** The owner simply opens the back door of the vending machine, removes the old food tray from Shelf 5, and places a new pre-packed food tray onto Shelf 5!

This vending machine is the exact physical analogue of a **Read-Only Memory (ROM)**:
* The keypad buttons ($A_3, A_2, A_1, A_0$) are the **Input Address Lines**.
* The fixed shelf selector is the **$N$-to-$2^N$ Address Decoder (Fixed AND-Array)**.
* The numbered shelf lines ($W_0 \dots W_{2^N-1}$) are the **Word Lines**.
* The pre-packed food trays are the **Stored Binary Data Words**.
* The delivery chute outputs are the **Output Data Lines ($D_0 \dots D_{M-1}$)**.

In digital logic, a ROM does not calculate Boolean functions using custom gates; it simply uses the incoming address bits to select a specific pre-stored truth table answer from its internal array.

---

## Architecture of a Read-Only Memory (ROM)

To master ROM-based logic synthesis, we must dissect the formal mechanics of its two internal structural matrices:
1. **The Fixed AND-Array (Address Decoder)**: An $N$-to-$2^N$ decoder that evaluates all $2^N$ fundamental minterms over $N$ input address variables.
2. **The Configurable OR-Array (Data Storage Matrix)**: A $2^N \times M$ matrix of interconnect links that selectively combines minterm word lines to drive $M$ output bit lines.

```text
READ-ONLY MEMORY (ROM) INTERNAL ARCHITECTURE

 Address Inputs A[N-1..0]
          │
          ▼
 ┌──────────────────────────────────┐
 │      FIXED AND-ARRAY             │
 │  (N-to-2^N Address Decoder)      │
 └────────────────┬─────────────────┘
                  │
                  │ Word Lines W0..W_(2^N-1) (Minterms m0..m_(2^N-1))
                  ▼
 ┌──────────────────────────────────┐
 │   CONFIGURABLE OR-ARRAY          │
 │  (2^N x M Data Storage Matrix)   │
 └────────────────┬─────────────────┘
          │
          ▼
 Output Data Lines D[M-1..0] (M Boolean Functions)
```

---

### Matrix 1: The Fixed AND-Array (Address Decoder)

A ROM receives $N$ binary input address lines:

$$
\mathbf{A} = (A_{N-1}, A_{N-2}, \dots, A_1, A_0)
$$

Where:
* $A_k$ represents the $k$-th binary address input line.
* $A_{N-1}$ is the Most Significant Bit (MSB).
* $A_0$ is the Least Significant Bit (LSB).

These $N$ address lines feed directly into an $N$-to-$2^N$ **Binary Address Decoder**. 

The address decoder consists of $N$ input inverters and $2^N$ multi-input AND gates. Each AND gate computes exactly one fundamental minterm $m_k$ over the $N$ address variables.

The outputs of these $2^N$ AND gates drive $2^N$ physical horizontal wires called **Word Lines ($W_0, W_1, \dots, W_{2^N-1}$)**:

$$
W_k = m_k(A_{N-1}, \dots, A_0)
$$

Where:
* $W_k$ is the $k$-th physical Word Line in the ROM matrix.
* $m_k$ is the $k$-th minterm of the address variables (where $0 \le k \le 2^N - 1$).

```text
THE FIXED AND-ARRAY (DECODER MINTERM GENERATOR)

 Address Inputs A1, A0
  A1 ──► [ NOT 1 ] ──► A1' ──┐
  A0 ──► [ NOT 0 ] ──► A0' ──┼─┐
                             │ │   ┌───────┐
                             ├─┼──►│ AND 0 ├──► Word Line W0 = A1' * A0' (m0)
                             │ │   └───────┘
                             │ └──►┌───────┐
                             ├───►│ AND 1 ├──► Word Line W1 = A1' * A0  (m1)
                             │     └───────┘
                             │     ┌───────┐
                             └────►│ AND 2 ├──► Word Line W2 = A1  * A0' (m2)
                                   └───────┘
                                   ┌───────┐
                                  │ AND 3 ├──► Word Line W3 = A1  * A0  (m3)
                                   └───────┘
```

Notice a crucial structural property of the Fixed AND-Array:
> **The AND-Array is 100% Fixed and Immutable.**
> Regardless of what Boolean logic functions you want the ROM to implement, the AND-array ALWAYS generates all $2^N$ minterms. Exactly ONE word line $W_k$ is driven High ($1$) for any given input address $\mathbf{A}$, while all other $2^N - 1$ word lines remain Low ($0$).

---

### Matrix 2: The Configurable OR-Array (Data Storage Matrix)

The $2^N$ Word Lines emitted by the address decoder run horizontally across a grid. Running vertically across these word lines are $M$ physical copper traces called **Bit Lines or Data Lines ($D_0, D_1, \dots, D_{M-1}$)**.

Each vertical Bit Line $D_j$ is connected to the horizontal Word Lines through a multi-input **OR gate**.

```text
THE CONFIGURABLE OR-ARRAY (DATA MATRIX)

 Word Lines           Bit Line D0      Bit Line D1      Bit Line D2
  W0 (m0) ───────────►[ Connection ]  [ No Connect ]  [ Connection ]
  W1 (m1) ───────────►[ No Connect ]  [ Connection ]  [ Connection ]
  W2 (m2) ───────────►[ Connection ]  [ Connection ]  [ No Connect ]
  W3 (m3) ───────────►[ No Connect ]  [ No Connect ]  [ Connection ]
                           │                │                │
                           ▼                ▼                ▼
                      OR Gate D0       OR Gate D1       OR Gate D2
                      D0 = m0 + m2     D1 = m1 + m2     D2 = m0 + m1 + m3
```

How does this grid store binary data?
* If a physical connection (such as a diode, transistor, or programmable fuse) exists at the intersection of Word Line $W_k$ and Bit Line $D_j$, then when $W_k = 1$, voltage flows into Bit Line $D_j$, forcing output $D_j = 1$.
* If no physical connection exists at that intersection, $W_k = 1$ has no effect on Bit Line $D_j$, and $D_j$ remains at $0$.

Mathematically, each vertical Bit Line $D_j$ acts as a large OR gate that sums together all the minterms $m_k$ where a physical connection was programmed:

$$
D_j = \sum_{k \in S_j} m_k = \sum_{k \in S_j} W_k
$$

Where:
* $D_j$ is the $j$-th output bit line of the ROM ($0 \le j \le M - 1$).
* $S_j$ is the set of word line indices $k$ where a physical memory connection is programmed for Bit Line $j$.
* $m_k$ is the $k$-th minterm generated by the address decoder.

Look at that equation! That equation is the exact **Canonical Sum of Products (SOP)** form of a Boolean function!

Because the OR-array can be programmed or fabricated to connect any word line $W_k$ to any bit line $D_j$, **a ROM can implement ANY arbitrary set of $M$ Boolean functions over $N$ variables!**

---

## ROM Capacity and Sizing Calculations

The total data storage capacity of a ROM module is determined by two parameters:
1. $N$: The number of input address lines.
2. $M$: The number of output data bit lines.

### Formula for ROM Capacity in Bits

A ROM with $N$ address lines and $M$ output lines contains $2^N$ addressable word locations, each storing an $M$-bit data word. The total capacity in bits $B_{\text{total}}$ is:

$$
B_{\text{total}} = 2^N \times M \text{ bits}
$$

Where:
* $B_{\text{total}}$ is the total storage capacity of the ROM in bits.
* $N$ is the number of binary input address lines.
* $M$ is the number of parallel output data bit lines.
* $2^N$ is the total number of unique addressable memory rows.

```text
ROM SIZING EXAMPLES FOR LOGIC SYNTHESIS

 Address Lines (N) │ Output Bits (M) │ Memory Rows (2^N) │ Total Capacity (2^N x M) │ Common Use Case
───────────────────┼─────────────────┼───────────────────┼──────────────────────────┼──────────────────────────────
         3         │        4        │         8         │   8 x 4 = 32 Bits        │ Simple Control Logic
         4         │        7        │        16         │  16 x 7 = 112 Bits       │ BCD-to-7-Segment Decoder
         8         │        8        │       256         │ 256 x 8 = 2,048 Bits     │ ASCII Code Converter
        10         │        8        │     1,024         │   1K x 8 = 8,192 Bits    │ CPU Microcode Store
        16         │       16        │    65,536         │  64K x 16 = 1 Mbit       │ Look-Up Table Math Engine
```

To express capacity in **Bytes**, divide $B_{\text{total}}$ by 8:

$$\text{Capacity in Bytes} = \frac{2^N \times M}{8}$$

For example, a ROM with 10 address lines ($N=10$) and 8 output lines ($M=8$) has $2^{10} = 1,024$ rows and an 8-bit output width. Its total capacity is $1,024 \times 8 \text{ bits} = 8,192 \text{ bits} = 1 \text{ Kilobyte (1 KB)}$.

---

## Mechanics of Lookup Table (LUT) Logic Synthesis

How do we take a complex multi-output truth table and synthesize it into a ROM using **Lookup Table (LUT) Synthesis**?

The process requires **zero Boolean algebra, zero Karnaugh maps, and zero gate minimization!**

### The 4-Step LUT Synthesis Algorithm:

1. **Step 1: Identify Input and Output Widths**:
   * Count the number of independent binary input variables $N$. The ROM requires $N$ address lines ($A_{N-1} \dots A_0$).
   * Count the number of independent binary output functions $M$. The ROM requires $M$ data lines ($D_{M-1} \dots D_0$).
2. **Step 2: Construct the Exhaustive Truth Table**:
   * Write out all $2^N$ rows in binary lexicographical order ($0$ to $2^N - 1$).
   * Fill in the desired binary output values for all $M$ output columns for every row.
3. **Step 3: Program the ROM Data Matrix**:
   * For each row $k$ in the truth table (from $0$ to $2^N - 1$), take the $M$-bit binary output pattern $(Y_{M-1}, \dots, Y_0)$ and store it directly as the binary data word at ROM memory address $k$!
4. **Step 4: Execute Lookup at Runtime**:
   * When an input address vector $\mathbf{A}$ arrives at the ROM address pins, the internal $N$-to-$2^N$ decoder activates word line $W_k$. The ROM outputs pre-stored data word $k$ directly onto data lines $D_{M-1} \dots D_0$!

```text
LOOKUP TABLE (LUT) SYNTHESIS FLOWCHART

 Human System Requirements / Truth Table
                  │
                  ▼
   Identify Address Inputs (N) and Data Outputs (M)
                  │
                  ▼
   Program Output Patterns directly into ROM Address Rows 0..2^N-1
                  │
                  ▼
   Runtime Input Address ──► Instant Data Word Lookup (O(1) Execution!)
```

---

## Hardware Classification of Read-Only Memory Structures

Depending on how the connections in the OR-array matrix are fabricated or programmed, ROM devices are classified into four distinct physical technologies:

```text
CLASSIFICATION OF ROM HARDWARE TECHNOLOGIES

                     READ-ONLY MEMORY TECHNOLOGIES
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
     MASK ROM                    PROM                     EEPROM / FLASH
(Hardwired at Foundry)     (One-Time Fuse Burn)      (Electrically Erasable)
```

### 1. Mask-Programmed ROM (Mask ROM)
In a **Mask ROM**, the connections between word lines and bit lines are permanently etched into the silicon wafer during semiconductor fabrication using custom photolithography masks.
* **Advantage**: Lowest possible unit cost when manufacturing millions of identical chips.
* **Disadvantage**: Zero flexibility. If a logic error is discovered after fabrication, the physical chip must be thrown away and new lithography masks must be produced.

### 2. Programmable ROM (PROM)
A **PROM** is shipped from the factory with every intersection in the OR-matrix connected by a microscopic metal **fuse**.
* The user programs the logic using a specialized device programmer that sends high-current electrical pulses through specific fuses, blowing them open permanently.
* **Advantage**: Can be programmed in the field by an engineer.
* **Disadvantage**: One-Time Programmable (OTP). Once a fuse is blown, it cannot be un-blown!

### 3. Electrically Erasable Programmable ROM (EEPROM) and Flash Memory
Modern digital systems use **EEPROM** or **Flash Memory**, where interconnect links are implemented using **Floating-Gate Transistors**.
* High-voltage electrical pulses trap or remove electrons on an isolated floating gate transistor, changing its conduction threshold.
* **Advantage**: Can be erased and reprogrammed in-circuit thousands of times in seconds!
* **Foundation of Modern FPGAs**: Field-Programmable Gate Arrays (FPGAs) use small, ultra-fast SRAM-based Lookup Tables (4-input or 6-input LUTs) as their fundamental logic blocks. An FPGA is essentially a microchip packed with thousands of tiny, reconfigurable SRAM ROMs!

---

## Engineering Reality: ROM Synthesis vs Custom Gate Networks

Why don't engineers use ROMs for every single logic circuit? What are the physical engineering trade-offs between ROM-based Lookup Table synthesis and custom gate minimization (such as SOP AND-OR circuits)?

```text
ENGINEERING COMPARISON: ROM LUT VS CUSTOM GATE NETWORKS

 Metric                     │ Custom Gate Network (Minimized) │ ROM Lookup Table (LUT)
────────────────────────────┼─────────────────────────────────┼───────────────────────────────
 Design Time / Complexity   │ High (Requires K-Maps & Algebra)│ Zero (Direct Truth Table Copy)
 Reconfigurability / Flex   │ Zero (Hardwired Gates)          │ High (Reprogram Data Word)
 Propagation Delay Skew     │ Irregular (Varying Path Lengths)│ Uniform (Constant Read Delay)
 Scaling for Sparse 1s      │ Extremely Small Gate Count      │ Wasteful (Stores all 2^N rows)
 Silicon Area for N > 16    │ Compact (Minimized SOP)         │ Exponential Explosion (2^N)
```

### 1. The Exponential Area Barrier for Large Input Counts
The primary physical drawback of a ROM is its **exponential area growth ($2^N$)**.

A ROM MUST contain $2^N$ word lines, even if 99% of the truth table rows produce an output of $0$!
* For a 4-input function: $2^4 = 16$ rows (Tiny, highly efficient).
* For an 8-input function: $2^8 = 256$ rows (Manageable).
* For a 16-input function: $2^{16} = 65,536$ rows (Large).
* For a 32-input function: $2^{32} = 4,294,967,296$ rows (**4.2 Billion Rows!**).

If you try to implement a 32-input, 1-output Boolean function using a single ROM, the ROM requires $4.2 \text{ Billion rows} \times 1 \text{ bit} = 512 \text{ Megabytes}$ of storage! Meanwhile, a minimized custom gate network for that same 32-input function might require only 10 AND gates!

### 2. The Ideal Sweet Spot for ROM Synthesis
ROM-based Lookup Table synthesis is the undisputed winner when:
1. The number of inputs $N$ is moderate ($N \le 10$).
2. The system has **multiple outputs ($M \ge 4$)** that share the same input address space.
3. The function's output pattern is dense and irregular (hard to minimize algebraically).
4. The logic requirements might change in the future and require reconfigurability.

---

## Solved Industrial Engineering Exercise: Flight Control Engine Mode Lookup Table

To consolidate your complete mastery of Read-Only Memory logic synthesis, address decoders, configurable OR-matrices, capacity calculations, and LUT programming, we will now walk through a complete, step-by-step aerospace hardware engineering problem.

---

### Scenario and Parameters

An avionics software and hardware team is designing the automatic Engine Thrust Profile Controller for a jet fighter's flight management system.

The controller evaluates a 3-bit **Flight Condition Vector** $\mathbf{A} = (A_2, A_1, A_0)$ received from cockpit sensors:
* $A_2$: High Altitude Flag ($1 = > 20,000 \text{ ft}$).
* $A_1$: Supersonic Speed Flag ($1 = > \text{Mach } 1.0$).
* $A_0$: Combat Mode Switch ($1 = \text{Engaged}$).

```text
JET ENGINE THRUST PROFILE LOOKUP MODULE

 Flight Condition Vector A[2:0] ──► [ ROM Lookup Table Module ] ──► Actuator Bus D[3:0]
 (3 Sensor Address Bits)             (2^3 x 4 ROM Matrix)            (4 Actuator Bits)
```

The system must output a 4-bit **Actuator Command Word** $\mathbf{D} = (D_3, D_2, D_1, D_0)$ that directly controls four jet engine actuators:
* $D_3$: Main Fuel Pump Rate ($1 = \text{High Flow}$).
* $D_2$: Afterburner Igniter ($1 = \text{ENGAGE AFTERBURNER}$).
* $D_3$: Air Intake Flap Position ($1 = \text{Wide Open}$).
* $D_0$: Turbine Cooling Valve ($1 = \text{Maximum Cooling}$).

#### Flight Safety Specification Table

The flight test board defines the required 4-bit actuator command word for all eight flight conditions:

```text
FLIGHT CONTROL ENGINE ACTUATOR SPECIFICATION TABLE

 Row (k) │ A2 (Alt) │ A1 (Speed) │ A0 (Combat) │ Actuator Output Word D3 D2 D1 D0 │ Operational Flight Regime
─────────┼──────────┼────────────┼─────────────┼──────────────────────────────────┼──────────────────────────────
    0    │    0     │     0      │      0      │               0000               │ Subsonic, Low Alt, Cruise
    1    │    0     │     0      │      1      │               1000               │ Subsonic, Low Alt, Combat
    2    │    0     │     1      │      0      │               0010               │ Supersonic, Low Alt, Cruise
    3    │    0     │     1      │      1      │               1111               │ Supersonic, Low Alt, COMBAT!
    4    │    1     │     0      │      0      │               0001               │ Subsonic, High Alt, Cruise
    5    │    1     │     0      │      1      │               1001               │ Subsonic, High Alt, Combat
    6    │    1     │     1      │      0      │               0111               │ Supersonic, High Alt, Cruise
    7    │    1     │     1      │      1      │               1111               │ Supersonic, High Alt, COMBAT!
```

#### Your Objective

1. Calculate the required ROM dimensions ($N \times M$) and total capacity in bits for this engine controller.
2. Derive the 3-to-8 Fixed AND-Array address decoder minterm equations ($W_0 \dots W_7$).
3. Derive the four Configurable OR-Array bit line equations for $D_3, D_2, D_1, D_0$ in canonical Sum of Products form.
4. Draw the complete internal ROM matrix schematic showing word lines, bit lines, and programmed connection points.
5. Calculate the read access propagation delay $t_{\text{ROM}}$ given $t_{\text{dec}} = 0.8\text{ ns}$ (decoder delay) and $t_{\text{matrix}} = 0.6\text{ ns}$ (OR-array line delay).
6. Verify system performance across three critical flight combat scenarios.

---

### Step-by-Step Derivation

#### Step 1: Calculate ROM Dimensions and Capacity

* Number of input address lines $N = 3$ ($A_2, A_1, A_0$).
* Number of output data lines $M = 4$ ($D_3, D_2, D_1, D_0$).

##### 1. Total Number of Addressable Memory Rows ($2^N$):
$$2^N = 2^3 = \mathbf{8 \text{ Word Lines }} (W_0, W_1, \dots, W_7)$$

##### 2. Total ROM Capacity in Bits ($B_{\text{total}}$):
$$B_{\text{total}} = 2^N \times M = 8 \times 4 = \mathbf{32 \text{ Bits}}$$

The engine controller requires an **$8 \times 4$ ROM module (32 bits total capacity)**.

---

#### Step 2: Derive Fixed AND-Array Address Decoder Equations ($W_0 \dots W_7$)

The 3-to-8 address decoder evaluates all 8 minterms $m_k(A_2, A_1, A_0)$:

$$
W_0 = m_0 = \overline{A_2} \cdot \overline{A_1} \cdot \overline{A_0}
$$

$$
W_1 = m_1 = \overline{A_2} \cdot \overline{A_1} \cdot A_0
$$

$$
W_2 = m_2 = \overline{A_2} \cdot A_1 \cdot \overline{A_0}
$$

$$
W_3 = m_3 = \overline{A_2} \cdot A_1 \cdot A_0
$$

$$
W_4 = m_4 = A_2 \cdot \overline{A_1} \cdot \overline{A_0}
$$

$$
W_5 = m_5 = A_2 \cdot \overline{A_1} \cdot A_0
$$

$$
W_6 = m_6 = A_2 \cdot A_1 \cdot \overline{A_0}
$$

$$
W_7 = m_7 = A_2 \cdot A_1 \cdot A_0
$$

Where:
* $W_k$ is the $k$-th horizontal Word Line in the ROM array.
* $A_2, A_1, A_0$ are the 3 binary input sensor lines.

---

#### Step 3: Derive Configurable OR-Array Bit Line Equations ($D_3 \dots D_0$)

By examining the specification table, we identify the word lines $W_k$ where each output bit $D_j$ must equal $1$:

##### 1. Equation for Bit Line $D_3$ (Main Fuel Pump):
$D_3 = 1$ at Rows 1, 3, 5, 7 ($W_1, W_3, W_5, W_7$).

$$
D_3 = W_1 + W_3 + W_5 + W_7 = m_1 + m_3 + m_5 + m_7
$$

##### 2. Equation for Bit Line $D_2$ (Afterburner Igniter):
$D_2 = 1$ at Rows 3, 6, 7 ($W_3, W_6, W_7$).

$$
D_2 = W_3 + W_6 + W_7 = m_3 + m_6 + m_7
$$

##### 3. Equation for Bit Line $D_1$ (Air Intake Flap):
$D_1 = 1$ at Rows 2, 3, 6, 7 ($W_2, W_3, W_6, W_7$).

$$
D_1 = W_2 + W_3 + W_6 + W_7 = m_2 + m_3 + m_6 + m_7
$$

##### 4. Equation for Bit Line $D_0$ (Turbine Cooling Valve):
$D_0 = 1$ at Rows 3, 4, 5, 6, 7 ($W_3, W_4, W_5, W_6, W_7$).

$$
D_0 = W_3 + W_4 + W_5 + W_6 + W_7 = m_3 + m_4 + m_5 + m_6 + m_7
$$

Where:
* $D_3, D_2, D_1, D_0$ are the four output actuator control signals.
* $W_k$ are the active word lines from the address decoder.

---

#### Step 4: Draw Complete Internal ROM Matrix Schematic

We draw the $8 \times 4$ ROM matrix showing the fixed AND decoder driving horizontal word lines $W_0 \dots W_7$, and the vertical bit lines $D_3 \dots D_0$ with programmed connections marked as `[X]`:

```text
COMPLETE 8x4 ROM HARDWARE MATRIX SCHEMATIC

 Address A[2:0] ──► [ 3:8 Decoder ]
                        │
  Word Lines            │            Bit D3    Bit D2    Bit D1    Bit D0
   W0 (m0 = 000_2) ─────┼───────────►[   ]     [   ]     [   ]     [   ]
   W1 (m1 = 001_2) ─────┼───────────►[ X ]     [   ]     [   ]     [   ]
   W2 (m2 = 010_2) ─────┼───────────►[   ]     [   ]     [ X ]     [   ]
   W3 (m3 = 011_2) ─────┼───────────►[ X ]     [ X ]     [ X ]     [ X ]
   W4 (m4 = 100_2) ─────┼───────────►[   ]     [   ]     [   ]     [ X ]
   W5 (m5 = 101_2) ─────┼───────────►[ X ]     [   ]     [   ]     [ X ]
   W6 (m6 = 110_2) ─────┼───────────►[   ]     [ X ]     [ X ]     [ X ]
   W7 (m7 = 111_2) ─────┼───────────►[ X ]     [ X ]     [ X ]     [ X ]
                        │              │         │         │         │
                        │              ▼         ▼         ▼         ▼
                        └──────────► OR Gate  OR Gate  OR Gate  OR Gate
                                       D3        D2        D1        D0
```

* Legend: `[X]` indicates a programmed diode/transistor connection connecting Word Line $W_k$ to Bit Line $D_j$. `[ ]` indicates an open/unconnected intersection.

---

#### Step 5: Calculate Read Access Propagation Delay ($t_{\text{ROM}}$)

The total time required for data to become valid on the actuator bus $D[3:0]$ after the sensor vector $A[2:0]$ changes is:

$$
t_{\text{ROM}} = t_{\text{dec}} + t_{\text{matrix}}
$$

Where:
* $t_{\text{dec}} = 0.8\text{ ns}$ is the propagation delay through the 3-to-8 address decoder.
* $t_{\text{matrix}} = 0.6\text{ ns}$ is the delay through the OR-array bit line drivers.

$$
t_{\text{ROM}} = 0.8\text{ ns} + 0.6\text{ ns} = \mathbf{1.4 \text{ ns}}
$$

The ROM lookup engine delivers new engine actuator commands in **$1.4\text{ nanoseconds}$**!

---

### Sanity Check and Verification

Let us verify our $8 \times 4$ ROM LUT engine across three critical flight regimes.

#### Scenario A: Subsonic Cruise Flight at Low Altitude ($A = 000_2$, Row 0)
* **Sensor Vector**: $A_2=0, A_1=0, A_0=0$.
* **Address Decoder**: Activates Word Line $W_0 = 1$. All other $W_k = 0$.
* **ROM Matrix Lookup**:
  * Row $W_0$ has connections: $D_3=0, D_2=0, D_1=0, D_0=0$.
* **Output Word**: $D = 0000_2$ (All actuators OFF/Normal).
* **Specification Check**: Row 0 specifies $0000_2$. **MATCH!**

#### Scenario B: Supersonic Low-Altitude Combat Flight ($A = 011_2$, Row 3)
* **Sensor Vector**: Low alt ($A_2=0$), Supersonic ($A_1=1$), Combat ($A_0=1$).
* **Address Decoder**: Activates Word Line $W_3 = 1$.
* **ROM Matrix Lookup**:
  * Row $W_3$ has connections at ALL FOUR bit lines: $D_3=1, D_2=1, D_1=1, D_0=1$.
* **Output Word**: $D = 1111_2$ (Max Fuel, Afterburner ENGAGED, Flaps Open, Max Cooling!).
* **Specification Check**: Row 3 specifies $1111_2$. **MATCH!**

#### Scenario C: Supersonic High-Altitude Cruise Flight ($A = 110_2$, Row 6)
* **Sensor Vector**: High alt ($A_2=1$), Supersonic ($A_1=1$), Cruise ($A_0=0$).
* **Address Decoder**: Activates Word Line $W_6 = 1$.
* **ROM Matrix Lookup**:
  * Row $W_6$ has connections at $D_2, D_1, D_0$: $D_3=0, D_2=1, D_1=1, D_0=1$.
* **Output Word**: $D = 0111_2$ (Afterburner ON, Flaps Open, Cooling ON, Fuel Normal).
* **Specification Check**: Row 6 specifies $0111_2$. **MATCH!**

All three simulation scenarios evaluate with 100% mathematical and physical precision. The ROM Lookup Table engine is fully verified and ready for flight production.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Read-Only Memory (ROM)**: A standardized, non-volatile hardware storage matrix composed of a fixed $N$-to-$2^N$ address decoder (AND-array) driving $2^N$ minterm word lines into a configurable $2^N \times M$ OR-array, capable of implementing any $M$-output Boolean function over $N$ variables in a single $O(1)$ read access.
* **Lookup Table (LUT) Synthesis**: The direct logic implementation technique where complex multi-output truth table patterns are programmed directly as pre-computed binary data words at decoded memory address locations, replacing custom gate minimization with instant, address-based data retrieval.
