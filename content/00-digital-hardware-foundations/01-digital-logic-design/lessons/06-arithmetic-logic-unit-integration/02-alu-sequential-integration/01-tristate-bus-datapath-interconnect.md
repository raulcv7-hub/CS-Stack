# Tri-State Bus Datapath Interconnect and Tri-State Register Output Driver Architecture

## The Wiring Explosion and Bus Contention Crisis in Processor Datapaths

In a central processing unit (CPU) or digital signal processor (DSP), the Arithmetic Logic Unit (ALU) does not operate in isolation. It is surrounded by an array of general-purpose storage registers ($R_0, R_1, \dots, R_{K-1}$). During instruction execution, the processor must dynamically route data from any chosen source register into the ALU's input terminals, and route the ALU's calculated result back into any chosen destination register.

If a computer architect attempts to construct these register-to-ALU interconnections by building dedicated point-to-point multiplexer trees for every possible source-to-destination path, the required physical wiring grows quadratically ($O(K \cdot N)$).

For a 32-register array operating on 64-bit data words, building dedicated multiplexer paths from every register to every ALU operand input requires over 60,000 individual copper interconnect traces. This massive web of wiring creates severe routing congestion, consumes up to 60% of the microchip's silicon die area, and introduces heavy parasitic wire capacitance that slows down the system clock.

```text
THE WIRING EXPLOSION OF DEDICATED MULTIPLEXER TREES

 Registers R0..R31 (64 Bits Each)           ALU Core
 ┌──────────┐ ─── (64 Wires to MUX 0) ───┐  ┌──────────┐
 │ Reg R0   │ ─── (64 Wires to MUX 1) ───┼─►│ Oper A   │
 ├──────────┤   ...                      │  └──────────┘
 │ Reg R1   │ ─── (64 Wires to MUX 31)───┼─►┌──────────┐
 ├──────────┤                            ├─►│ Oper B   │
 │   ...    │ ─── (Thousands of Wires!) ─┘  └──────────┘
 └──────────┘                               60,000+ Copper Traces!
                                            (Consumes 60% Silicon Area)
```

Conversely, if an engineer attempts to simplify this wiring by connecting the output pins of all 32 registers directly to a single shared copper trace, a catastrophic physical short circuit occurs: **Bus Contention**.

In standard CMOS binary logic, a register output pin is always actively driving its wire to either supply voltage ($V_{DD}$, Logic $1$) or ground ($0\text{ V}$, Logic $0$). If Register 0 attempts to transmit a $1$ on the shared wire while Register 1 simultaneously attempts to transmit a $0$, Register 0's pull-up transistor connects the wire directly to $V_{DD}$ while Register 1's pull-down transistor connects the same wire directly to $0\text{ V}$.

A massive short circuit surges between power and ground through the two competing chips. The short-circuit current causes rapid thermal heating, degrades the bus voltage to an invalid intermediate level, and melts the output transistors.

```text
THE ELECTRICAL SHORT CIRCUIT OF DIRECT BUS CONNECTION

 Register 0 Output ─── Driving HIGH (1 / VDD) ──┐
                                                ├──► SHORT CIRCUIT CURRENT!
 Register 1 Output ─── Driving LOW  (0 / GND) ──┘    (Bus Contention & Burnout)
```

How do we construct a clean, space-efficient **Internal Datapath Bus** that allows any register to broadcast its data to the ALU over a single set of shared wires, and how do we use **Tri-State Register Output Drivers** to disconnect unselected registers so that data transfers occur with zero electrical contention?

---

## The Town Hall Shared Microphone: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an internal datapath bus and tri-state drivers operate before diving into transistor schematics, let us picture a city council meeting.

Imagine a company conference room where eight department managers ($R_0, R_1, \dots, R_7$) sit around a table. At the front of the room, a chief executive officer (the ALU) needs to listen to project updates.

```text
THE CONFERENCE ROOM MICROPHONE ANALOGY

 Manager 0 (R0) ──┐
 Manager 1 (R1) ──┼──► [ Single Shared Microphone Cable ] ──► CEO (ALU Core)
   ...            │    (Internal Datapath Bus)
 Manager 7 (R7) ──┘
```

How should the conference room be wired so that any manager can speak to the CEO?

### Approach 1: The Dedicated Switchboard (Multiplexer Tree)
The building contractor installs 8 separate telephone lines from every manager's chair running to a giant 8-way switchboard on the CEO's desk. 

* **Friction**: The conference room table is buried under a tangled mess of 8 heavy cable bundles. The CEO's desk is cluttered with a massive, expensive switchboard. Adding a 9th manager requires ripping up the floorboards to lay another cable!

### Approach 2: Direct Shouting (Bus Contention)
The contractor runs a single loudspeaker cable across the room and connects 8 microphones directly to it without switches.

* **Friction**: If Manager 0 starts talking at the exact same second that Manager 1 starts talking, their voices collide on the shared speaker. The loudspeaker emits a painful, screeching blast of acoustic feedback (short circuit). Nobody can understand anything, and the speaker equipment is damaged!

### Approach 3: The Unplugged Microphone Switch (Tri-State Bus)
The contractor runs **one single physical microphone cable** down the middle of the table. Each manager receives a microphone equipped with a **Power Disconnect Switch** (a Tri-State Driver).

The parliamentary rules of the meeting are enforced by a central moderator:
1. When Manager 2 is called on to speak, Manager 2 flips their microphone switch **ON** ($E_2 = 1$). Their voice travels cleanly down the single shared cable to the CEO ($1$ or $0$).
2. Meanwhile, Managers 0, 1, 3, 4, 5, 6, and 7 do NOT just stay quiet—they **completely unplug their microphones from the wall jack** (High-Impedance State $Z$)!

```text
THE UNPLUGGED MICROPHONE SOLUTION

 Manager 2 (Speaking)    ──► Switch ON  ──► Drives Cable (Clear Voice)
 Manager 0 (Disconnected)──► High-Z (Z) ──► Completely Unplugged!
 Manager 1 (Disconnected)──► High-Z (Z) ──► Completely Unplugged!
 Manager 3 (Disconnected)──► High-Z (Z) ──► Completely Unplugged!
```

Notice what happened in this conference room:
* Manager 2 spoke clearly over the single shared cable.
* The room required only **one single cable** instead of 8 separate telephone lines!
* There was zero acoustic feedback because all other microphones were completely disconnected from the circuit.

This unplugged microphone system is the exact physical analogue of an **Internal Datapath Bus**:
* The department managers ($R_0 \dots R_7$) are the **Parallel Storage Registers**.
* The single shared cable is the **Internal Datapath Bus ($B[N-1..0]$)**.
* The microphone power switches are the **Tri-State Register Output Drivers**.
* The central moderator granting permission to speak is the **1-of-$K$ Bus Enable Decoder**.

---

## Mechanics of Tri-State Bus Interconnects and Output Driver Architecture

To master datapath interconnect design, we must dissect the formal mechanics of its two core primitives:
1. **The High-Impedance State ($Z$)**: The physical open-circuit state where output transistors disconnect from a bus wire.
2. **The Tri-State Register Output Driver**: The bank of parallel tri-state buffers that connects or disconnects an $N$-bit register from a shared bus under the control of an Output Enable signal ($\text{OE}$).

---

### Primitive 1: The High-Impedance State ($Z$) in CMOS Silicon

A standard CMOS digital output stage consists of two complementary transistors connected in series between supply voltage ($V_{DD}$) and ground ($0\text{ V}$):
* A top **PMOS transistor** (Pull-Up Transistor).
* A bottom **NMOS transistor** (Pull-Down Transistor).

```text
CMOS TRISTATE OUTPUT STAGE STATES

 Logic High Output (1)        Logic Low Output (0)         High-Impedance Output (Z)
      +5V (VDD)                    +5V (VDD)                    +5V (VDD)
       │                            │                            │
  [PMOS ON ]                   [PMOS OFF]                   [PMOS OFF]
       │                            │                            │
       ├─► Output = 1 (VDD)         ├─► Output = 0 (GND)         ├─► Output = Z (FLOAT!)
       │                            │                            │   (Open Circuit!)
  [NMOS OFF]                   [NMOS ON ]                   [NMOS OFF]
       │                            │                            │
      GND                          GND                          GND
```

In standard gates, one transistor is always ON while the other is OFF:
* **Logic High ($1$)**: PMOS ON, NMOS OFF $\implies$ Output pin connected to $V_{DD}$.
* **Logic Low ($0$)**: PMOS OFF, NMOS ON $\implies$ Output pin connected to Ground.

#### The Third Physical State: High-Impedance ($Z$)
In a Tri-State buffer, when the enable control line is turned OFF ($\text{OE} = 0$), internal control logic forces **BOTH the PMOS and NMOS transistors OFF simultaneously**!

When both transistors are OFF:
1. **Infinite Resistance**: The output pin presents a near-infinite electrical resistance (tens of megohms) to the external wire.
2. **Zero Current Flow**: The pin cannot supply current from $V_{DD}$, nor can it sink current to Ground.
3. **Electrical Isolation**: The output pin is effectively disconnected from the wire, leaving the copper trace completely free for another active register driver.

Mathematically, $Z$ represents an **open-circuit boundary condition**:

$$
I_{\text{out}} = 0 \quad \text{for any external voltage } V_{\text{bus}} \in [0\text{ V}, V_{DD}]
$$

Where:
* $I_{\text{out}}$ is the current flowing into or out of the High-Z pin.
* $V_{\text{bus}}$ is the voltage present on the shared bus wire.

---

### Primitive 2: The Tri-State Register Output Driver

An $N$-bit **Parallel Register** stores an $N$-bit binary word $\mathbf{Q} = (Q_{N-1}, \dots, Q_0)$. 

To connect this register to an $N$-bit shared datapath bus $\mathbf{B} = (B_{N-1}, \dots, B_0)$, we attach an $N$-bit **Tri-State Register Output Driver** to its output terminals.

An $N$-bit Tri-State Output Driver consists of $N$ individual 2-input tri-state buffers operating in parallel under a single, shared control line called **Output Enable ($\text{OE}$)** (or active-low $\overline{\text{OE}}$).

```text
N-BIT TRI-STATE REGISTER OUTPUT DRIVER SCHEMATIC

 Register Stored Bits Q[N-1..0]
 Q[N-1] ────────►[ Tri-State Buffer N-1 ] ───────► Bus Line B[N-1]
 Q[N-2] ────────►[ Tri-State Buffer N-2 ] ───────► Bus Line B[N-2]
   :                       :                        :
 Q[0]   ────────►[ Tri-State Buffer 0   ] ───────► Bus Line B[0]
                         ▲
                         │ Shared Control Line
 Output Enable OE ───────┴──────────────────────── Control Bus
```

#### 1. Truth Table for an $N$-Bit Tri-State Driver

```text
N-BIT TRI-STATE DRIVER TRUTH TABLE

 Output Enable (OE) │ Register Bit Q_i │ Bus Line Output B_i │ Electrical Bus State
────────────────────┼──────────────────┼─────────────────────┼────────────────────────────────
         0          │        0         │          Z          │ High-Z (Disconnected)
         0          │        1         │          Z          │ High-Z (Disconnected)
         1          │        0         │          0          │ Active Low (Driving 0V)
         1          │        1         │          1          │ Active High (Driving VDD)
```

#### 2. Mathematical Behavioral Equation for Bus Line $B_i$

$$
B_i = 
\begin{cases} 
Q_i & \text{if } \text{OE} = 1 \quad \text{(Active Driver)} \\
Z & \text{if } \text{OE} = 0 \quad \text{(Disconnected / High-Z)}
\end{cases}
$$

Where:
* $B_i$ is the $i$-th bit line of the shared datapath bus.
* $Q_i$ is the $i$-th stored bit of the register.
* $\text{OE}$ is the 1-bit Output Enable control signal.
* $Z$ is the High-Impedance open-circuit state.

---

## Bus Arbitration Mechanics: Preventing Bus Contention

When $K$ separate registers ($\text{REG}_0, \text{REG}_1, \dots, \text{REG}_{K-1}$) are connected to the same $N$-bit shared datapath bus $\mathbf{B}$, how do we guarantee that bus contention never occurs?

We use a **1-of-$K$ Binary Address Decoder** to drive the Output Enable lines ($\text{OE}_0, \text{OE}_1, \dots, \text{OE}_{K-1}$) of all $K$ registers!

```text
SAFE SHARED DATAPATH BUS ARBITRATION ARCHITECTURE

 Reg 0 (Q_0) ──► [ Driver 0 ] ──► (OE_0) ──┐
 Reg 1 (Q_1) ──► [ Driver 1 ] ──► (OE_1) ──┼──► SHARED DATAPATH BUS B[N-1..0]
 Reg 2 (Q_2) ──► [ Driver 2 ] ──► (OE_2) ──┤    (To ALU Operand Input A)
 Reg 3 (Q_3) ──► [ Driver 3 ] ──► (OE_3) ──┘
                      ▲
                      │ Output Enable Lines (OE0..OE3)
          ┌───────────┴───────────┐
          │ 2-to-4 Binary Decoder │
          └───────────▲───────────┘
                      │
          Read Address Bus (RA1, RA0)
```

### The Golden Rule of Shared Bus Arbitration:
> At any given nanosecond, the bus control decoder MUST assert **at most ONE Output Enable line ($\text{OE}_k = 1$)**. All other $K-1$ register drivers MUST be held at $\text{OE} = 0$ (High-Z).

#### Mathematical Proof of Short-Circuit Elimination:
Because a 1-of-$K$ binary address decoder evaluates mutually exclusive minterms $m_k(\text{Address})$, exactly one decoder output is $1$ for any binary address, while all other $K-1$ outputs are $0$.

$$
\text{OE}_k = m_k(\text{Read\_Addr}) \cdot \text{Read\_EN}
$$

Where:
* $\text{OE}_k$ is the Output Enable line for Register $k$.
* $m_k(\text{Read\_Addr})$ is the $k$-th minterm of the read address bus.
* $\text{Read\_EN}$ is the master read enable control line.

Because $m_a \cdot m_b = 0$ for any $a \neq b$, two registers can **never** be enabled simultaneously! Bus contention is $100\%$ eliminated by the laws of Boolean algebra.

---

## Floating Bus Lines and Bus-Hold Termination Mechanics

What happens to the shared datapath bus $\mathbf{B}$ when **NO register is selected** (for example, when $\text{Read\_EN} = 0$ during a CPU idle cycle)?

In this state, all $K$ register drivers enter the High-Impedance state ($\text{OE}_0 \dots \text{OE}_{K-1} = 0$). The physical copper wires of the datapath bus are connected to **nothing at all**!

An un-driven copper trace is a **Floating Bus Line**.

```text
THE FLOATING BUS HAZARD

 Driver 0 (High-Z) ──┐
 Driver 1 (High-Z) ──┼──► [ FLOATING WIRE (Z) ] ──► ALU Operand Input Pin
 Driver 2 (High-Z) ──┤     (Picks up ambient noise,  (PMOS & NMOS both turn ON!
 Driver 3 (High-Z) ──┘      intermediate voltage)     Massive static current draw!)
```

A floating bus line is an engineering hazard in CMOS silicon:
1. **Intermediate Voltage Floating**: The wire's electrical charge drifts to an intermediate voltage level around $\frac{V_{DD}}{2}$ (e.g., $1.5\text{ V}$ in a $3.3\text{ V}$ system).
2. **Current Shoot-Through**: Downstream CMOS logic gates receiving $1.5\text{ V}$ turn **BOTH their internal PMOS and NMOS transistors ON simultaneously**, creating a massive static current drain directly between $V_{DD}$ and Ground!
3. **Spurious Logic Oscillations**: Ambient electromagnetic noise causes the wire voltage to bounce wildly, triggering false logic transitions inside the ALU.

---

### The Hardware Solution: Weak Pull-Up Resistors or Bus-Hold Latching

To prevent floating line hazards, hardware designers terminate each shared bus line using one of two methods:

#### Method 1: Weak Pull-Up / Pull-Down Resistors
A high-resistance resistor ($R_{\text{pull}} = 10\text{ k}\Omega \text{ to } 100\text{ k}\Omega$) connects the shared bus wire to $V_{DD}$ or Ground.

```text
SHARED BUS TERMINATION WITH A WEAK PULL-UP RESISTOR

                         +5V (VDD)
                            │
                           [R] Pull-Up Resistor (10 kΩ)
                            │
 Driver 0 (High-Z) ─────────┼─────────► Shared Bus Line B_i (Weak 1)
 Driver 1 (High-Z) ─────────┤          (Palled to VDD when all drivers off!)
 Driver 2 (High-Z) ─────────┘
```

* **When all drivers are in High-Z**: The weak resistor gently pulls the bus line to $V_{DD}$, maintaining a stable, deterministic Logic $1$ voltage.
* **When an active driver turns ON**: The active driver's low-resistance transistors ($20\text{ }\Omega$) easily overpower the weak $10\text{ k}\Omega$ resistor, driving a strong $0$ or strong $1$ onto the bus with zero interference!

#### Method 2: Bus-Hold Latch (Keepers)
A **Bus-Hold Circuit** consists of two weak cross-coupled inverters attached to the bus wire. It actively retains the **last valid logic state** ($0$ or $1$) present on the bus when all drivers enter High-Z, maintaining that state indefinitely with zero static power dissipation.

```text
BUS-HOLD KEEPER CIRCUIT SCHEMATIC

                        ┌───────┐
 Shared Bus Line B_i ──►│ NOT 1 ├──┐
                     ▲  └───────┘  │
                     │  ┌───────┐  │
                     └──┤ NOT 2 ┼◄─┘ (Weak Feedback Inverter)
                        └───────┘
```

---

## Complete Dual-Bus ALU Datapath Architecture

In a complete microprocessor execution engine, we combine our primitives to construct a **Dual-Bus ALU Datapath Interconnect**.

The architecture uses two independent shared buses:
1. **Bus A ($\mathbf{B}_A$)**: Supplies Operand A to the ALU.
2. **Bus B ($\mathbf{B}_B$)**: Supplies Operand B to the ALU.
3. **Result Bus Y ($\mathbf{B}_Y$)**: Carries the calculated ALU result back to the registers.

```text
COMPLETE DUAL-BUS ALU DATAPATH ARCHITECTURE

  Registers R0..R3                          ALU Execution Core
 ┌──────────┐  Driver A0 ──► Bus A (B_A) ──►┌──────────┐
 │ Reg R0   ├──Driver B0 ──► Bus B (B_B) ──►│          │
 ├──────────┤                               │ ALU Core ├──► Result Bus Y (B_Y)
 │ Reg R1   ├──Driver A1 ──► Bus A          │          │           │
 ├──────────┤  Driver B1 ──► Bus B          └──────────┘           │
 │ Reg R2   │   ...                                                │
 ├──────────┤                                                      │
 │ Reg R3   │◄─────────────────────────────────────────────────────┘
 └──────────┘  (Selected Register Captures Bus Y on Clock Edge!)
```

### Complete 1-Cycle Datapath Execution Sequence ($R_1 + R_2 \to R_3$):

1. **Phase 1: Operand Address Decoding ($t = 0.0\text{ ns}$)**:
   * Read Decoder A receives $\text{Read\_Addr\_A} = 01_2$ ($R_1$). Asserts $\text{OE}_{A,1} = 1$. Driver A1 connects $R_1$ to Bus A ($\mathbf{B}_A = R_1$).
   * Read Decoder B receives $\text{Read\_Addr\_B} = 10_2$ ($R_2$). Asserts $\text{OE}_{B,2} = 1$. Driver B2 connects $R_2$ to Bus B ($\mathbf{B}_B = R_2$).
2. **Phase 2: Parallel ALU Execution ($t = 0.8\text{ ns}$)**:
   * The ALU receives $\mathbf{B}_A = R_1$ and $\mathbf{B}_B = R_2$.
   * The ALU performs addition, emitting result $\mathbf{B}_Y = R_1 + R_2$ onto Result Bus Y.
3. **Phase 3: Synchronous Register Capture ($t = 3.0\text{ ns}$)**:
   * Write Decoder receives $\text{Write\_Addr} = 11_2$ ($R_3$) and asserts $\text{LOAD}_3 = 1$.
   * On the rising clock edge ($CLK = 0 \to 1$), **Register $R_3$ captures Result Bus Y**!

The entire multi-operand instruction $R_1 + R_2 \to R_3$ completes in **one single, clean clock cycle** using only three shared bus trace sets!

---

## Solved Industrial Engineering Exercise: 4-Register x 8-Bit Shared Datapath Bus Interconnect

To consolidate your complete mastery of Tri-State bus interconnects, Tri-State output drivers, bus contention calculations, pull-up resistor behavior, and 1-cycle ALU execution, we will now walk through a complete, step-by-step aerospace hardware engineering problem.

---

### Scenario and Parameters

An avionics systems firm is designing the 8-bit shared datapath bus interconnect for a satellite's attitude control processor. 

The datapath interconnect connects four 8-bit registers ($R_0, R_1, R_2, R_3$) to an 8-bit ALU core via a single shared 8-bit **Operand Bus A** ($\mathbf{B}_A$).

```text
SATELLITE 8-BIT SHARED DATAPATH INTERCONNECT

 Reg R0 [8 Bit] ──► [ Driver 0 ] ──► (OE0) ──┐
 Reg R1 [8 Bit] ──► [ Driver 1 ] ──► (OE1) ──┼──► SHARED OPERAND BUS A
 Reg R2 [8 Bit] ──► [ Driver 2 ] ──► (OE2) ──┤    (8 Shared Copper Traces)
 Reg R3 [8 Bit] ──► [ Driver 3 ] ──► (OE3) ──┘           │
                        ▲                                ▼
                        │                      [ 8-Bit ALU Core ]
            ┌───────────┴───────────┐                    │
            │ 2-to-4 Read Decoder A │                    ▼
            └───────────▲───────────┘            Result Bus Y[7:0]
                        │
             Read Address Bus RA[1:0]
```

Each register $R_k$ has its 8-bit output connected to an 8-bit **Tri-State Output Driver** controlled by active-high Output Enable line $\text{OE}_k$.

The lines $\text{OE}_0, \text{OE}_1, \text{OE}_2, \text{OE}_3$ are driven by a 2-to-4 active-high binary decoder receiving 2-bit address bus $\text{RA} = (RA_1, RA_0)$ and active-high master read enable $\text{READ\_EN}$:

$$
\text{OE}_k = m_k(RA_1, RA_0) \cdot \text{READ\_EN}
$$

A $10\text{ k}\Omega$ pull-up resistor bank is attached to Shared Operand Bus A.

#### Physical Electrical Parameters:
* Supply Voltage $V_{DD} = 3.3\text{ V}$.
* Tri-State Buffer PMOS/NMOS ON-resistance $R_{\text{ON}} = 15\text{ }\Omega$.
* Maximum safe driver transistor power limit $P_{\text{max}} = 40\text{ mW}$.
* 2-to-4 Read Decoder Delay $t_{\text{dec}} = 0.25\text{ ns}$.
* Tri-State Driver Enable Delay $t_{\text{oe}} = 0.35\text{ ns}$.

#### Your Objective

1. Derive the Boolean equations for Output Enable lines $\text{OE}_0, \text{OE}_1, \text{OE}_2, \text{OE}_3$.
2. Calculate the total physical CMOS transistor count for the 4-register Tri-State Bus Interconnect and compare it against an equivalent 4-to-1 Multiplexer bus tree.
3. Perform a **Bus Contention Fault Analysis**: Suppose a radiation-induced single-event upset in the decoder holds $\text{OE}_0 = 1$ and $\text{OE}_1 = 1$ simultaneously when $R_0 = 11111111_2$ and $R_1 = 00000000_2$. Calculate the short-circuit contention current per line ($I_{\text{contention}}$), degraded bus voltage ($V_{\text{bus}}$), total thermal power per driver ($P_{\text{driver}}$), and compare against $P_{\text{max}}$.
4. Simulate 3 execution cycles of the shared datapath bus.
5. Verify all results against system safety requirements.

---

### Step-by-Step Derivation

#### Step 1: Derive Output Enable Decoder Equations ($\text{OE}_0 \dots \text{OE}_3$)

The 2-to-4 Read Decoder generates the four active-high Output Enable signals:

$$
\text{OE}_0 = \overline{RA_1} \cdot \overline{RA_0} \cdot \text{READ\_EN}
$$

$$
\text{OE}_1 = \overline{RA_1} \cdot RA_0 \cdot \text{READ\_EN}
$$

$$
\text{OE}_2 = RA_1 \cdot \overline{RA_0} \cdot \text{READ\_EN}
$$

$$
\text{OE}_3 = RA_1 \cdot RA_0 \cdot \text{READ\_EN}
$$

Where:
* $\text{OE}_k$ is the Output Enable line for Register $k$ ($k \in \{0, 1, 2, 3\}$).
* $RA_1, RA_0$ are the 2 bits of the Read Address Bus.
* $\text{READ\_EN}$ is the master read enable control line.

---

#### Step 2: Transistor Footprint Comparison: Tri-State Bus vs Multiplexer Tree

Let us calculate the physical transistor count for the 8-bit 4-register interconnect:

##### Implementation A: Tri-State Bus Interconnect
* **4 Registers $\times$ 8 Bits = 32 Storage Cells**: $32 \times 26\text{ T} = 832\text{ transistors}$.
* **4 Tri-State Output Drivers (8 bits each = 32 tri-state buffers)**:
  * Each 1-bit CMOS tri-state buffer requires 6 transistors.
  * $32 \times 6 = 192\text{ transistors}$.
* **2-to-4 Read Decoder**: 36 transistors.
* **Total Transistors (Tri-State Bus)** = $832 + 192 + 36 = \mathbf{1,060 \text{ CMOS Transistors}}$.
* **Interconnect Buses**: Exactly **8 shared copper traces** running across the board.

##### Implementation B: 4-to-1 Multiplexer Bus Tree
* **4 Registers $\times$ 8 Bits = 32 Storage Cells**: $832\text{ transistors}$.
* **Eight 4-to-1 Multiplexers (one per bit line)**:
  * Each 4:1 MUX requires 46 transistors.
  * $8 \times 46 = 368\text{ transistors}$.
* **Total Transistors (MUX Tree)** = $832 + 368 = \mathbf{1,200 \text{ CMOS Transistors}}$.
* **Interconnect Buses**: **32 dedicated copper traces** running from 4 registers into the MUX!

```text
QUANTITATIVE INTERCONNECT SAVINGS SUMMARY

 Interconnect Scheme      │ Total Transistors │ Interconnect Copper Wires │ Layout Flexibility
──────────────────────────┼───────────────────┼───────────────────────────┼────────────────────
 4:1 MUX Bus Tree         │ 1,200 Transistors │ 32 Dedicated Wires        │ Rigid (Centralized)
 Tri-State Shared Bus     │ 1,060 Transistors │  8 Shared Wires           │ Modular (Expandable)
──────────────────────────┴───────────────────┴───────────────────────────┴────────────────────
 INTERCONNECT SAVINGS     │  11.7% Less Area  │ 75.0% WIRE REDUCTION!     │ Highly Modular
```

The Tri-State Bus Interconnect reduces physical wiring across the board by **$75.0\%$**, dramatically simplifying chip layout and board assembly!

---

#### Step 3: Bus Contention Fault Analysis

In the fault scenario, Driver 0 ($\text{OE}_0 = 1$) and Driver 1 ($\text{OE}_1 = 1$) are enabled simultaneously:
* Register $R_0 = 11111111_2 \implies$ Driver 0 PMOS transistors turn ON, connecting all 8 bus wires to $V_{DD} = 3.3\text{ V}$ through $R_{\text{ON}} = 15\text{ }\Omega$.
* Register $R_1 = 00000000_2 \implies$ Driver 1 NMOS transistors turn ON, connecting all 8 bus wires to Ground ($0\text{ V}$) through $R_{\text{ON}} = 15\text{ }\Omega$.

```text
BUS CONTENTION SHORT CIRCUIT PER LINE

             +3.3V (VDD)
                │
               [R_ON,0 = 15 Ω]  (Driver 0 PMOS ON)
                │
                ├───────► Shared Bus Line B_i (Degraded V_bus = 1.65V!)
                │
               [R_ON,1 = 15 Ω]  (Driver 1 NMOS ON)
                │
               GND (0V)
```

##### 1. Calculate Contention Current per Line ($I_{\text{contention}}$):
$$
I_{\text{contention}} = \frac{V_{DD}}{R_{\text{ON,0}} + R_{\text{ON,1}}} = \frac{3.3\text{ V}}{15\text{ }\Omega + 15\text{ }\Omega} = \frac{3.3\text{ V}}{30\text{ }\Omega} = \mathbf{0.110 \text{ A}} = \mathbf{110 \text{ mA per line!}}
$$

##### 2. Calculate Total Bus Contention Current (8 Lines):
$$
I_{\text{total}} = 8 \times 110\text{ mA} = \mathbf{880 \text{ mA}} = \mathbf{0.880 \text{ A!}}
$$

##### 3. Calculate Degraded Bus Voltage ($V_{\text{bus}}$):
$$
V_{\text{bus}} = 3.3\text{ V} \cdot \left( \frac{15\text{ }\Omega}{15\text{ }\Omega + 15\text{ }\Omega} \right) = \mathbf{1.65 \text{ V}}
$$

The bus voltage sits at **$1.65\text{ V}$**—an invalid logic level that causes downstream CMOS ALU inputs to draw massive shoot-through current!

##### 4. Calculate Thermal Power Dissipation per Driver ($P_{\text{driver}}$):
Total power dissipated across 8 lines:
$$P_{\text{bus\_total}} = I_{\text{total}} \cdot V_{DD} = 0.880\text{ A} \cdot 3.3\text{ V} = 2.904\text{ W}$$

Power dissipated inside Driver 0 alone:
$$
P_{\text{driver0}} = \frac{2.904\text{ W}}{2} = \mathbf{1.452 \text{ Watts}} = \mathbf{1,452 \text{ mW!}}
$$

##### 5. Compare Against Thermal Limit ($P_{\text{max}} = 40\text{ mW}$):
$$
\frac{P_{\text{driver0}}}{P_{\text{max}}} = \frac{1,452\text{ mW}}{40\text{ mW}} = \mathbf{36.3 \times \text{ Over Maximum Limit!}}
$$

**THERMAL CATASTROPHE DETECTED!** 

The power dissipation is **36.3 times higher than the safe limit**! If this decoder fault persists for more than a few microseconds, Driver 0 and Driver 1 will undergo immediate thermal destruction, destroying the satellite computer.

---

#### Step 4: Simulate 3 Execution Cycles of the Shared Datapath Bus

Initial Register States:
* $R_0 = 10101010_2$ ($170_{10}$)
* $R_1 = 00001111_2$ ($15_{10}$)
* $R_2 = 11110000_2$ ($240_{10}$)
* $R_3 = 00000000_2$ ($0_{10}$)

```text
3-CYCLE SHARED DATAPATH BUS EXECUTION TRACE

 Cycle │ Read Addr RA[1:0] │ READ_EN │ Active OE Line │ Shared Bus Voltage B_A[7:0] │ Bus Status & Action
───────┼───────────────────┼─────────┼────────────────┼──────────────────────────────┼─────────────────────────────────
   1   │      00 (R0)      │    1    │     OE0 = 1    │     10101010_2 (Strong)      │ Reg 0 Drives Bus A -> ALU
   2   │      01 (R1)      │    1    │     OE1 = 1    │     00001111_2 (Strong)      │ Reg 1 Drives Bus A -> ALU
   3   │      10 (R2)      │    0    │   All OE = 0   │     11111111_2 (Weak 3.3V)   │ IDLE BUS! Pull-up Holds 3.3V
```

##### Detailed Cycle Evaluations:

1. **Cycle 1 ($\text{RA} = 00_2, \text{READ\_EN} = 1$)**:
   * $\text{OE}_0 = \overline{0} \cdot \overline{0} \cdot 1 = 1$. $\text{OE}_1 = 0, \text{OE}_2 = 0, \text{OE}_3 = 0$.
   * Driver 0 enables and drives $R_0 = 10101010_2$ onto Shared Bus A.
   * **Result**: $\mathbf{B}_A = 10101010_2$ ($170_{10}$). **REGISTER 0 READ SUCCESSFUL!**

2. **Cycle 2 ($\text{RA} = 01_2, \text{READ\_EN} = 1$)**:
   * $\text{OE}_1 = \overline{0} \cdot 1 \cdot 1 = 1$. All other $\text{OE}_k = 0$.
   * Driver 1 enables and drives $R_1 = 00001111_2$ onto Shared Bus A.
   * **Result**: $\mathbf{B}_A = 00001111_2$ ($15_{10}$). **REGISTER 1 READ SUCCESSFUL!**

3. **Cycle 3 ($\text{RA} = 10_2, \text{READ\_EN} = 0$, Idle Cycle)**:
   * Master read enable is $0$ ($\text{READ\_EN} = 0$).
   * All $\text{OE}_0, \text{OE}_1, \text{OE}_2, \text{OE}_3 = 0$. All four drivers enter High-Z ($Z$).
   * The $10\text{ k}\Omega$ pull-up resistor bank holds Shared Bus A stably at $+3.3\text{ V}$ ($11111111_2$).
   * **Result**: $\mathbf{B}_A = 11111111_2$ (Stable High-Z termination). **FLOATING NOISE PREVENTED!**

All three simulation cycles evaluate with 100% mathematical, electrical, and logical precision. The shared datapath bus interconnect is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Internal Datapath Bus**: A multi-wire shared copper communications highway $\mathbf{B} = (B_{N-1}, \dots, B_0)$ that interconnects multiple parallel storage registers and execution units, enabling time-shared data transfers across a single set of shared lines to eliminate multiplexer wiring explosions.
* **Tri-State Register Output Driver**: A bank of $N$ parallel tri-state buffers attached to a register's output terminals that places its outputs into a High-Impedance state ($Z$) when disabled ($\text{OE} = 0$), electrically severing the register from the shared bus to prevent short-circuit bus contention.
