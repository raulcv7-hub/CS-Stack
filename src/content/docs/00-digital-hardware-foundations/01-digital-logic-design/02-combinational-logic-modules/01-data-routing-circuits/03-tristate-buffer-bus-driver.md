---
title: "Tri-State Buffer Bus Drivers, High-Impedance States, and Bus Contention Mitigation"
---

# Tri-State Buffer Bus Drivers, High-Impedance States, and Bus Contention Mitigation

## The Physical Short Circuit of Shared Wire Architectures

In standard binary logic, every digital gate output operates in a rigid, two-state universe. An output terminal is always actively driving its connected wire to one of two valid voltage levels: a logical High ($1$), representing the supply voltage, or a logical Low ($0$), representing electrical ground. There is no middle ground in standard Boolean gates. An AND gate, an OR gate, or an inverter is constantly "pushing" a $1$ or "pulling" a $0$ onto its output trace.

Now imagine building a computer system where four independent memory registers need to send data to a single central processor over a shared copper trace—a **Shared Data Bus**. 

If you attempt to connect the output pins of all four memory registers directly to that single physical wire using standard logic gates, a catastrophic physical conflict occurs the moment two registers try to drive the bus at the same time.

```text
THE DESTRUCTIVE HARDWARE BUS CONTENTION CONFLICT

 Register 0 Output ─── Driving HIGH (1) ──┐
                                          │
 Register 1 Output ─── Driving LOW  (0) ──┼───► HIGH CURRENT SHORT CIRCUIT!
                                          │     (Bus Contention / Burnout)
 Register 2 Output ─── Driving LOW  (0) ──┤           │
                                          │           ▼
 Register 3 Output ─── Driving HIGH (1) ──┘   Damaged Silicon & Undefined Voltage
```

Suppose Register 0 wants to transmit a $1$, so its internal output transistor connects the bus wire directly to the positive power supply. At the exact same instant, Register 1 wants to transmit a $0$, so its internal output transistor connects that same bus wire directly to ground ($0\text{ V}$).

Because both registers are connected to the exact same physical wire, a direct, low-resistance path is created between power and ground right through the silicon chips! Large electrical currents surge through the output transistors. This destructive conflict is called **Bus Contention**. Bus contention causes three severe physical problems:
1. **Physical Overheating and Burnout**: The high current draw rapidly heats up the silicon die, permanently damaging the output transistors.
2. **Voltage Degradation**: The voltage on the bus wire settles at an invalid intermediate level (neither a clean $0$ nor a clean $1$), causing downstream circuits to read corrupted data.
3. **Power Supply Noise**: The sudden current surge creates massive voltage drops across the main system power rails, resetting nearby registers and crashing the processor.

Why can't we just use a giant multiplexer (MUX) to route every shared signal? While multiplexers work well for small, localized data routing, building a giant MUX tree for every shared bus line across an entire printed circuit board or large microchip causes an explosion in wiring complexity. A shared system bus connecting 32 devices across 64 data bits would require tens of thousands of dedicated interconnect traces!

To allow multiple independent circuits to share a single physical wire safely without bus contention and without huge multiplexer trees, digital electronics requires a third physical state—a state beyond $0$ and $1$. 

That state is the **High-Impedance State ($Z$)**, and the physical component that creates it is the **Tri-State Buffer**.

---

## The Shared Town Hall Microphone: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of the High-Impedance state and Tri-State buffers, let us step away from microchips and picture a town hall meeting.

Imagine a room with four citizens sitting at a table: Alice, Bob, Charlie, and Diana. In the middle of the room is a single public loudspeaker system connected to one physical microphone cable.

```text
THE TOWN HALL MICROPHONE ANALOGY

 Alice   (Microphone 0) ──┐
 Bob     (Microphone 1) ──┼──► [ Single Public Loudspeaker System ]
 Charlie (Microphone 2) ──┤
 Diana   (Microphone 3) ──┘
```

What happens if Alice and Bob both pick up their microphones and scream different speeches into the sound system at the exact same time?
The loudspeaker emits a loud, distorted screech of acoustic feedback. The audience hears nothing but unintelligible noise. This acoustic noise is the exact real-world equivalent of **Bus Contention**.

How do the citizens solve this problem?
They institute a strict parliamentary rule:
1. When Alice is granted the floor, she switches her microphone **ON** and speaks. Her voice travels through the loudspeaker ($1$ or $0$).
2. Meanwhile, Bob, Charlie, and Diana do **NOT** just stay quiet—they completely **turn off and unplug** their microphones from the wall jack!

```text
THE UNPLUGGED MICROPHONE SOLUTION

 Alice   (Active / Speaking) ────► Connected ────► Loudspeaker (Clear Audio)
 Bob     (Unplugged / Silent) ───► High-Z (Z) ───► Disconnected from Cable
 Charlie (Unplugged / Silent) ───► High-Z (Z) ───► Disconnected from Cable
 Diana   (Unplugged / Silent) ───► High-Z (Z) ───► Disconnected from Cable
```

Notice what happens when Bob unplugs his microphone:
* Bob is not saying $0$ (whispering).
* Bob is not saying $1$ (shouting).
* Bob has **completely severed his physical connection** to the audio cable!

Because Bob's microphone is unplugged, Alice can speak into the cable without any electrical or acoustic interference from Bob. As far as the loudspeaker is concerned, Bob does not even exist in the room!

This "unplugged" state is the **High-Impedance State ($Z$)**. A **Tri-State Buffer** is a digital gate equipped with an electronic power switch that allows a circuit to "unplug" its output pin from a shared bus wire whenever it is not actively authorized to speak.

---

## Mechanics of Tri-State Buffers and High-Impedance States

To master shared bus architectures and bus driver design, we must dissect the formal mechanics of the three physical states, the internal structure of Tri-State Buffers, and the rules of bus enable decoding.

---

### Primitive 1: The High-Impedance State ($Z$)

In electrical engineering, **Impedance** ($Z$) is the total opposition a circuit offers to the flow of electrical current. High impedance means near-infinite electrical resistance.

A standard digital output pin has two active states:
* **Logic High ($1$)**: Low resistance connection to the positive supply voltage ($V_{DD}$). Output actively pushes current into the wire.
* **Logic Low ($0$)**: Low resistance connection to ground ($0\text{ V}$). Output actively pulls current out of the wire.

The **High-Impedance State ($Z$)** is the third state:
* **High-Impedance ($Z$)**: Both output transistors inside the gate are turned **OFF** simultaneously. The output pin presents a near-infinite electrical resistance (tens of megohms) to the wire.

```text
PHYSICAL MODEL OF THE THREE DIGITAL OUTPUT STATES

 Active High (1)              Active Low (0)              High-Impedance (Z)
  +5V (VDD)                    +5V (VDD)                   +5V (VDD)
   │                            │                           │
  [ON Transistor]              [OFF Transistor]            [OFF Transistor]
   │                            │                           │
   ├───► Output = 1             ├───► Output = 0            ├───► Output = Z
   │                            │                           │    (Open Circuit!)
  [OFF Transistor]             [ON Transistor]             [OFF Transistor]
   │                            │                           │
  GND (0V)                     GND (0V)                    GND (0V)
```

When an output pin is in the High-Impedance state ($Z$):
1. **Zero Current Flow**: It cannot push current into the wire, nor can it pull current from the wire.
2. **Electrical Disconnection**: It behaves as if the output pin were physically cut with a pair of wire cutters.
3. **Bus Transparency**: It leaves the physical wire completely free, allowing another active gate to set the wire's voltage to $0$ or $1$ without any electrical resistance or short-circuit conflict.

Mathematically, $Z$ is not a Boolean truth value (it is neither $0$ nor $1$). It is an **electrical boundary condition** that represents an open circuit.

---

### Primitive 2: Bus Contention

**Bus Contention** is the physical failure mode that occurs when two or more active output drivers attempt to drive different logical voltage levels onto the same physical wire at the same time.

```text
ELECTRICAL MODEL OF BUS CONTENTION

Driver A (Drives High = 1)
  +5V (VDD) ─── [ON  PMOS] ──┐
                             ├─── Shared Bus Wire
  0V (GND)  ─── [OFF NMOS] ──┘          │
                                        │  ◄── SHORT CIRCUIT PATH!
Driver B (Drives Low = 0)               ▼      (High Current / Damage)
  +5V (VDD) ─── [OFF PMOS] ──┐          │
                             ├──────────┘
  0V (GND)  ─── [ON  NMOS] ──┘
```

#### Mathematical Formulation of Contention Current

When Driver A outputs $1$ ($V_{DD}$) and Driver B outputs $0$ ($0\text{ V}$) on a shared line, the short-circuit contention current $I_{\text{contention}}$ flowing between the two drivers is given by Ohm's Law:

$$
I_{\text{contention}} = \frac{V_{DD}}{R_{\text{ON,A}} + R_{\text{ON,B}}}
$$

Where:
* $I_{\text{contention}}$ is the short-circuit current flowing through the output transistors.
* $V_{DD}$ is the digital supply voltage (e.g., $5.0\text{ V}$ or $3.3\text{ V}$).
* $R_{\text{ON,A}}$ is the internal ON-resistance of Driver A's pull-up transistor (typically $10\text{ }\Omega$ to $50\text{ }\Omega$).
* $R_{\text{ON,B}}$ is the internal ON-resistance of Driver B's pull-down transistor (typically $10\text{ }\Omega$ to $50\text{ }\Omega$).

#### Example Calculation:
For a $5.0\text{ V}$ system where transistor ON-resistances are $20\text{ }\Omega$ each:

$$
I_{\text{contention}} = \frac{5.0\text{ V}}{20\text{ }\Omega + 20\text{ }\Omega} = \frac{5.0}{40} = 0.125\text{ A} = 125\text{ mA}
$$

A normal digital gate output draws less than $0.01\text{ mA}$. A contention current of $125\text{ mA}$ is **more than 10,000 times higher** than normal operating current! This massive current surge generates intense localized heat:

$$
P_{\text{heat}} = I_{\text{contention}}^2 \cdot (R_{\text{ON,A}} + R_{\text{ON,B}}) = (0.125)^2 \cdot 40 = 0.625\text{ W}
$$

Dissipating over $0.6$ Watts inside a microscopic silicon gate causes rapid thermal runaway, melting internal silicon junctions and permanently destroying the chip.

---

## Anatomy of the Tri-State Buffer

A **Tri-State Buffer** (also called a Three-State Driver) is a foundational combinational logic building block that implements the High-Impedance state under the control of an enable signal.

It possesses two inputs and one output:
1. **Data Input ($A$)**: The binary signal ($0$ or $1$) to be transmitted onto the bus.
2. **Enable Control Input ($E$)**: The control line that turns the output driver ON or OFF.
3. **Data Output ($Y$)**: The physical output pin connected to the shared bus line.

```text
TRI-STATE BUFFER SYMBOLIC DIAGRAM

 Data Input A ──────────► [ Tri-State Buffer ] ──────────► Output Y
                                ▲
 Enable Line E ─────────────────┘
```

---

### Active-High Enable Tri-State Buffer

In an **Active-High Enable** Tri-State buffer:
* When $E = 1$ (Enabled): The buffer is active. Output $Y$ follows data input $A$ ($Y = A$).
* When $E = 0$ (Disabled): The buffer is disconnected. Output $Y$ enters High-Impedance ($Y = Z$).

```text
ACTIVE-HIGH TRI-STATE BUFFER TRUTH TABLE

 Enable Input (E) │ Data Input (A) │ Output (Y) │ Physical Output Status
──────────────────┼────────────────┼────────────┼─────────────────────────
        0         │       0        │     Z      │ High-Impedance (Disconnected)
        0         │       1        │     Z      │ High-Impedance (Disconnected)
        1         │       0        │     0      │ Active Low (Driving 0V)
        1         │       1        │     1      │ Active High (Driving VDD)
```

Look closely at this truth table:
* When $E = 0$, input $A$ has **zero effect** on output $Y$. Whether $A$ is $0$ or $1$, the output remains in $Z$.
* When $E = 1$, the buffer acts as a simple pass-through wire ($Y = A$).

---

### Active-Low Enable Tri-State Buffer

Many industrial bus systems (such as PCI, I2C, and memory bus controllers) use **Active-Low Enable** lines, denoted as $\overline{E}$ or $\overline{\text{OE}}$ (Output Enable).

In an active-low Tri-State buffer:
* When $\overline{E} = 0$ (Enabled): The buffer is active, and $Y = A$.
* When $\overline{E} = 1$ (Disabled): The buffer is disconnected, and $Y = Z$.

```text
ACTIVE-LOW TRI-STATE BUFFER TRUTH TABLE

 Enable Input (E') │ Data Input (A) │ Output (Y) │ Physical Output Status
───────────────────┼────────────────┼────────────┼─────────────────────────
         0         │       0        │     0      │ Active Low (Driving 0V)
         0         │       1        │     1      │ Active High (Driving VDD)
         1         │       0        │     Z      │ High-Impedance (Disconnected)
         1         │       1        │     Z      │ High-Impedance (Disconnected)
```

---

### Inverting Tri-State Buffer

An **Inverting Tri-State Buffer** combines a NOT gate with a Tri-State enable switch. When enabled, it outputs the complement of the input signal ($\overline{A}$). When disabled, it enters $Z$.

```text
INVERTING TRI-STATE BUFFER TRUTH TABLE (ACTIVE-HIGH ENABLE)

 Enable Input (E) │ Data Input (A) │ Output (Y) │ Physical Output Status
──────────────────┼────────────────┼────────────┼─────────────────────────
        0         │       0        │     Z      │ High-Impedance (Disconnected)
        0         │       1        │     Z      │ High-Impedance (Disconnected)
        1         │       0        │     1      │ Inverted High (Driving VDD)
        1         │       1        │     0      │ Inverted Low (Driving 0V)
```

---

## Shared Bus Architecture and Bus Enable Decoding

Now that we understand the individual Tri-State buffer, let us examine how to construct a complete **Shared Bus System** where multiple devices communicate safely over a single wire.

### The 4-Device Shared Bus System

Suppose four independent digital devices—Device 0 ($D_0$), Device 1 ($D_1$), Device 2 ($D_2$), and Device 3 ($D_3$)—need to transmit data across a single shared bus line $Y$.

To connect all four devices safely:
1. Place a Tri-State buffer at the output of each device.
2. Connect all four buffer output pins directly to the single physical bus wire $Y$.
3. Drive the four Enable lines ($E_0, E_1, E_2, E_3$) using a **1-of-4 Decoder**.

```text
SAFE 4-DEVICE SHARED BUS ARCHITECTURAL SCHEMATIC

 Device 0 (D0) ───► [ Tri-State 0 ] ─── (E0) ──┐
                                               │
 Device 1 (D1) ───► [ Tri-State 1 ] ─── (E1) ──┼───► SHARED BUS WIRE (Y)
                                               │
 Device 2 (D2) ───► [ Tri-State 2 ] ─── (E2) ──┤
                                               │
 Device 3 (D3) ───► [ Tri-State 3 ] ─── (E3) ──┘
                          ▲
                          │ Enable Lines (E0..E3)
              ┌───────────┴───────────┐
              │ 2-to-4 Address Decoder│
              └───────────▲───────────┘
                          │
              Bus Address (S1, S0)
```

#### The Golden Rule of Shared Bus Architecture:
> To prevent Bus Contention, a shared bus control circuit MUST guarantee that **at most ONE Tri-State buffer is enabled ($E_k = 1$) at any given time**. All other $N-1$ buffers MUST be held in the High-Impedance state ($E = 0$).

By using a **2-to-4 Binary Address Decoder** to generate enable signals $E_0, E_1, E_2, E_3$ from a 2-bit bus address $S = (S_1, S_0)$:
* $S = 00_2 \implies E_0 = 1$, while $E_1 = 0, E_2 = 0, E_3 = 0$.
  Device 0 drives the bus: $Y = D_0$. Devices 1, 2, 3 are in High-Z.
* $S = 01_2 \implies E_1 = 1$, while $E_0 = 0, E_2 = 0, E_3 = 0$.
  Device 1 drives the bus: $Y = D_1$. Devices 0, 2, 3 are in High-Z.
* $S = 10_2 \implies E_2 = 1$, while $E_0 = 0, E_1 = 0, E_3 = 0$.
  Device 2 drives the bus: $Y = D_2$. Devices 0, 1, 3 are in High-Z.
* $S = 11_2 \implies E_3 = 1$, while $E_0 = 0, E_1 = 0, E_2 = 0$.
  Device 3 drives the bus: $Y = D_3$. Devices 0, 1, 2 are in High-Z.

Bus contention is **100% mathematically impossible** because a binary decoder can never activate two output lines simultaneously!

```text
4-DEVICE BUS ENABLE SELECTION TABLE

 Select Address (S1,S0) │ Active Enable Line │ Active Driver │ Inactive High-Z Drivers │ Bus Output (Y)
────────────────────────┼────────────────────┼───────────────┼─────────────────────────┼────────────────
           00           │        E0 = 1      │   Device 0    │   Devices 1, 2, 3 (Z)   │     Y = D0
           01           │        E1 = 1      │   Device 1    │   Devices 0, 2, 3 (Z)   │     Y = D1
           10           │        E2 = 1      │   Device 2    │   Devices 0, 1, 3 (Z)   │     Y = D2
           11           │        E3 = 1      │   Device 3    │   Devices 0, 1, 2 (Z)   │     Y = D3
```

---

## Bus Pull-Up/Pull-Down Resistors and Floating Line Hazards

What happens to the shared bus wire if **ALL** Tri-State buffers are disabled simultaneously ($E_0 = 0, E_1 = 0, E_2 = 0, E_3 = 0$)?

In this situation, every driver on the bus enters the High-Impedance state ($Z$). The physical copper wire is left connected to **nothing at all**!

An electrical wire connected to no active voltage source is called a **Floating Bus Line**.

```text
THE FLOATING BUS LINE HAZARD

 Tri-State Driver 0 (High-Z) ──┐
 Tri-State Driver 1 (High-Z) ──┼───► [ FLOATING WIRE (Z) ] ───► Downstream Input Pin
 Tri-State Driver 2 (High-Z) ──┤     (Acts as an antenna!      (Spurious 0/1 oscillations,
 Tri-State Driver 3 (High-Z) ──┘      picks up ambient noise)   high static power draw)
```

A floating wire is an engineering disaster for three reasons:
1. **Environmental Noise Sensitivity**: The floating wire acts as an antenna, picking up electromagnetic interference (EMI) from nearby power supplies, cell phones, and electric motors.
2. **Indeterminate Voltage Levels**: The wire's voltage drifts into an intermediate zone between $0\text{ V}$ and $V_{DD}$ (e.g., $1.5\text{ V}$ in a $3.3\text{ V}$ system). Downstream CMOS inputs receiving this intermediate voltage turn BOTH their internal PMOS and NMOS transistors ON simultaneously, drawing massive static current and overheating the receiving chip!
3. **Spurious Oscillations**: Downstream logic gates rapidly oscillate between $0$ and $1$, triggering false logic transitions.

---

### The Engineering Solution: Bus Termination Resistors

To prevent floating line hazards when all Tri-State drivers are in High-Z, hardware engineers add a high-value **Pull-Up Resistor** or **Pull-Down Resistor** (typically $10\text{ k}\Omega$) to the shared bus line.

```text
BUS TERMINATION WITH A PULL-UP RESISTOR

                             +5V (VDD)
                                │
                               [R] Pull-Up Resistor (10 kΩ)
                                │
 Driver 0 (High-Z) ─────────────┼─────────────► Shared Bus Line Y (Weak 1)
 Driver 1 (High-Z) ─────────────┤              (Stable Voltage! No Floating!)
 Driver 2 (High-Z) ─────────────┘
```

How does a bus termination resistor work?
* **When all drivers are in High-Z**: The weak pull-up resistor gently pulls the bus wire up to $V_{DD}$, holding the bus at a stable, deterministic Logic $1$ state. No floating occurs!
* **When an active driver turns ON**: The active driver's internal transistors have very low resistance ($20\text{ }\Omega$). The low-resistance active driver easily overrides the weak $10\text{ k}\Omega$ pull-up resistor, driving a strong $0$ or strong $1$ onto the bus without any performance penalty!

```text
PULL-UP RESISTOR BEHAVIOR ACROSS BUS STATES

 Bus State           │ Active Driver Resistance │ Resistor Behavior         │ Bus Voltage Level
─────────────────────┼──────────────────────────┼───────────────────────────┼────────────────────
 All Drivers High-Z  │ Infinite (Disconnected)  │ Pulls wire to VDD gently  │ Stable Logic 1
 Driver A Output 0   │ Low (20 Ohms to GND)     │ Overridden by Driver A    │ Strong Logic 0
 Driver A Output 1   │ Low (20 Ohms to VDD)     │ Reinforced by Driver A    │ Strong Logic 1
```

---

## Engineering Comparison: Tri-State Bus Interconnects vs Multiplexer Bus Trees

In digital systems, engineers have two competing methods for routing data between multiple transmitters and a single destination:
1. **Multiplexer Bus Trees (MUX Trees)**
2. **Tri-State Bus Interconnects**

Both techniques achieve the same high-level goal (selective data routing), but they use completely different physical mechanisms.

```text
ARCHITECTURAL COMPARISON OF DATA ROUTING TECHNIQUES

 Metric                   │ Multiplexer Bus Tree (MUX)      │ Tri-State Shared Bus
──────────────────────────┼─────────────────────────────────┼──────────────────────────────
 Physical Wire Topology   │ Point-to-Point Tree             │ Shared Single Bus Line
 Bus Contention Risk      │ IMPOSSIBLE (Pure Gates)         │ POSSIBLE (Control Faults)
 Layout Flexibility       │ Rigid (Centralized Multiplexer) │ Modular (Add devices easily)
 Inter-Chip Wiring Pins   │ HIGH (N lines entering MUX)     │ LOW (1 shared line across board)
 Internal Transistor Area │ Higher (Decoder + Gates)        │ Lower (Simple Tri-State switches)
 Floating Line Hazard     │ IMPOSSIBLE (Always drives 0/1)  │ POSSIBLE (Requires Pull-Up)
 Maximum Speed            │ Faster (Pure gate delays)       │ Slower (Bus capacitance)
```

### When to Use Multiplexer Bus Trees:
* **Inside Microchips (Intra-Chip)**: Modern CMOS silicon chips prefer multiplexer trees for internal register-to-register routing because gate delays are extremely fast, silicon wires are cheap, and eliminating bus contention risk simplifies automatic synthesis tools.

### When to Use Tri-State Shared Buses:
* **Between Printed Circuit Board Chips (Inter-Chip)**: Physical pins on microchip packages and copper traces on circuit boards are extremely expensive. A Tri-State bus allows a processor, RAM chips, storage controllers, and expansion cards to share a single set of 32 or 64 copper traces across a motherboard, dramatically reducing board complexity and pin counts.

---

## Solved Industrial Engineering Exercise: Multi-Board Avionics Sensor Bus

To consolidate your complete mastery of High-Impedance states, Bus Contention analysis, Tri-State buffer configurations, and pull-up termination logic, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An aerospace contractor is engineering the 4-channel shared telemetry data bus ($Y$) for a commercial airliner's flight recorder. Four flight-sensor sub-modules need to transmit data to the central flight recorder over a single shared copper trace:

1. **Airspeed Sub-Module ($D_0$)**: Outputs 1-bit airspeed status.
2. **Altitude Sub-Module ($D_1$)**: Outputs 1-bit altitude status.
3. **Engine Thrust Sub-Module ($D_2$)**: Outputs 1-bit thrust status.
4. **Cabin Pressure Sub-Module ($D_3$)**: Outputs 1-bit cabin pressure status.

```text
AVIONICS SHARED TELEMETRY BUS ARCHITECTURE

 Airspeed (D0)   Altitude (D1)   Thrust (D2)   Pressure (D3)
       │               │              │              │
 [ Tri-State 0 ] [ Tri-State 1 ] [ Tri-State 2 ] [ Tri-State 3 ]
       │               │              │              │
       └───────────────┼──────────────┴──────────────┘
                       │
                       ├────────► SHARED BUS TRACE (Y)
                       │
                      [R] Pull-Up Resistor (10 kΩ)
                       │
                      +5V
```

#### System Control Infrastructure
The telemetry computer selects which sensor drives the bus using a 2-bit **Sensor Address Bus** $A_{\text{sensor}} = (S_1, S_0)$ and an active-high **Telemetry Enable Line** ($\text{TEL\_EN}$).

The system uses a 2-to-4 binary decoder with enable to drive the active-high Output Enable lines ($E_0, E_1, E_2, E_3$) of four Tri-State buffers:

$$
E_0 = \overline{S_1} \cdot \overline{S_0} \cdot \text{TEL\_EN}
$$

$$
E_1 = \overline{S_1} \cdot S_0 \cdot \text{TEL\_EN}
$$

$$
E_2 = S_1 \cdot \overline{S_0} \cdot \text{TEL\_EN}
$$

$$
E_3 = S_1 \cdot S_0 \cdot \text{TEL\_EN}
$$

A $10\text{ k}\Omega$ pull-up resistor is connected between the shared bus trace $Y$ and $+5\text{ V}$.

#### Electrical Parameters:
* Digital Supply Voltage $V_{DD} = 5.0\text{ V}$.
* Tri-State Buffer transistor ON-resistance $R_{\text{ON}} = 25\text{ }\Omega$.
* Safe maximum transistor power dissipation $P_{\text{max}} = 50\text{ mW}$ per driver.

#### Your Objective

1. Construct the complete, 8-row system truth table for the 4-channel telemetry bus, including inputs $(S_1, S_0, \text{TEL\_EN})$, enable signals $(E_0 \dots E_3)$, output states, and bus behavior.
2. Analyze a fault scenario where a faulty firmware patch incorrectly sets $E_0 = 1$ and $E_2 = 1$ simultaneously when $D_0 = 1$ and $D_2 = 0$. Calculate the short-circuit contention current $I_{\text{contention}}$, the voltage on the bus $V_{\text{bus}}$, and total thermal power $P_{\text{heat}}$. Compare against $P_{\text{max}}$.
3. Explain the exact function of the $10\text{ k}\Omega$ pull-up resistor when $\text{TEL\_EN} = 0$.
4. Verify system operation across three critical flight scenarios.

---

### Step-by-Step Derivation

#### Step 1: Construct the Complete System Truth Table

The system evaluation depends on $S_1, S_0,$ and $\text{TEL\_EN}$. Let us construct the 8-row control table:

```text
COMPLETE AVIONICS TELEMETRY BUS CONTROL TRUTH TABLE

 Row │ S1 │ S0 │ TEL_EN │ E0 │ E1 │ E2 │ E3 │ Active Driver  │ Shared Bus Voltage / State (Y)
─────┼────┼────┼────────┼────┼────┼────┼────┼────────────────┼────────────────────────────────
  0  │ 0  │ 0  │   0    │ 0  │ 0  │ 0  │ 0  │  None (High-Z) │ Weak High (+5V via Pull-Up R)
  1  │ 0  │ 0  │   1    │ 1  │ 0  │ 0  │ 0  │  Driver 0      │ Strong Data D0 (0V or 5V)
  2  │ 0  │ 1  │   0    │ 0  │ 0  │ 0  │ 0  │  None (High-Z) │ Weak High (+5V via Pull-Up R)
  3  │ 0  │ 1  │   1    │ 0  │ 1  │ 0  │ 0  │  Driver 1      │ Strong Data D1 (0V or 5V)
  4  │ 1  │ 0  │   0    │ 0  │ 0  │ 0  │ 0  │  None (High-Z) │ Weak High (+5V via Pull-Up R)
  5  │ 1  │ 0  │   1    │ 0  │ 0  │ 1  │ 0  │  Driver 2      │ Strong Data D2 (0V or 5V)
  6  │ 1  │ 1  │   0    │ 0  │ 0  │ 0  │ 0  │  None (High-Z) │ Weak High (+5V via Pull-Up R)
  7  │ 1  │ 1  │   1    │ 0  │ 0  │ 0  │ 1  │  Driver 3      │ Strong Data D3 (0V or 5V)
```

Look at this table:
* When $\text{TEL\_EN} = 0$ (Rows 0, 2, 4, 6): All enable lines $E_0 \dots E_3$ are $0$. Every driver is in High-Z. The pull-up resistor holds the bus at $+5\text{ V}$ (Logic 1).
* When $\text{TEL\_EN} = 1$ (Rows 1, 3, 5, 7): Exactly **one** enable line is $1$. Exactly one driver controls the bus trace.

---

#### Step 2: Fault Analysis: Calculating Bus Contention Parameters

In the fault scenario, a firmware bug enables both Driver 0 and Driver 2 simultaneously ($E_0 = 1, E_2 = 1$).
* Driver 0 attempts to output $D_0 = 1$ (connects wire to $+5\text{ V}$ through $R_{\text{ON}} = 25\text{ }\Omega$).
* Driver 2 attempts to output $D_2 = 0$ (connects wire to $0\text{ V}$ through $R_{\text{ON}} = 25\text{ }\Omega$).

```text
BUS CONTENTION FAULT EQUIVALENT CIRCUIT

             +5V (VDD)
                │
               [R_ON,0 = 25 Ω]  (Driver 0 PMOS ON)
                │
                ├───────► Bus Line V_bus
                │
               [R_ON,2 = 25 Ω]  (Driver 2 NMOS ON)
                │
               GND (0V)
```

##### 1. Calculate Contention Current ($I_{\text{contention}}$):
Ignoring the high-resistance $10\text{ k}\Omega$ pull-up resistor in parallel with $25\text{ }\Omega$, the contention path forms a simple voltage divider between $+5\text{ V}$ and $0\text{ V}$:

$$
I_{\text{contention}} = \frac{V_{DD}}{R_{\text{ON,0}} + R_{\text{ON,2}}} = \frac{5.0\text{ V}}{25\text{ }\Omega + 25\text{ }\Omega} = \frac{5.0\text{ V}}{50\text{ }\Omega} = 0.100\text{ A} = 100\text{ mA}
$$

##### 2. Calculate Degraded Bus Voltage ($V_{\text{bus}}$):
Using the voltage divider formula:

$$
V_{\text{bus}} = V_{DD} \cdot \left( \frac{R_{\text{ON,2}}}{R_{\text{ON,0}} + R_{\text{ON,2}}} \right) = 5.0\text{ V} \cdot \left( \frac{25\text{ }\Omega}{50\text{ }\Omega} \right) = 2.5\text{ V}
$$

The bus voltage sits at **$2.5\text{ V}$**—exactly halfway between $0\text{ V}$ and $5\text{ V}$! This is an invalid, degraded logic level that will cause downstream flight computers to misread bits or enter oscillatory states.

##### 3. Calculate Total Power Dissipation ($P_{\text{heat}}$):
The total power dissipated in the short circuit path is:

$$
P_{\text{heat}} = I_{\text{contention}} \cdot V_{DD} = 0.100\text{ A} \cdot 5.0\text{ V} = 0.500\text{ W} = 500\text{ mW}
$$

Each driver transistor dissipates half of this power:

$$
P_{\text{driver}} = \frac{500\text{ mW}}{2} = 250\text{ mW}
$$

##### 4. Compare Against Safe Thermal Limit ($P_{\text{max}}$):
* Maximum safe power limit $P_{\text{max}} = 50\text{ mW}$.
* Actual power dissipation $P_{\text{driver}} = 250\text{ mW}$.

$$
\frac{P_{\text{driver}}}{P_{\text{max}}} = \frac{250\text{ mW}}{50\text{ mW}} = 5 \times \text{ Over the Thermal Limit!}
$$

The power dissipation is **five times higher than the maximum thermal rating**! If this firmware bug persists for more than a few milliseconds, both Driver 0 and Driver 2 will suffer permanent silicon burnout.

---

#### Step 3: Function of the Pull-Up Resistor during High-Z Mode

When the telemetry system is disabled ($\text{TEL\_EN} = 0$), all four Tri-State drivers enter High-Z mode. 

* Without the $10\text{ k}\Omega$ pull-up resistor, bus line $Y$ would float, picking up ambient cockpit electromagnetic noise and drifting to unpredictable voltage levels.
* With the $10\text{ k}\Omega$ pull-up resistor, a tiny current of $\frac{5\text{ V}}{10\text{ k}\Omega} = 0.5\text{ mA}$ holds the bus trace safely at $+5\text{ V}$ (Logic 1), providing a clean, deterministic, noise-immune default voltage.

---

### Sanity Check and Verification

Let us verify our avionics bus system across three operational flight scenarios.

#### Scenario 1: Telemetry Reads Altitude Sensor ($S = 01_2$, $\text{TEL\_EN} = 1$, $D_1 = 0$)
* **Address**: $S_1=0, S_0=1$. Enable $\text{TEL\_EN} = 1$. Altitude sensor $D_1 = 0$.
* **Decoder Evaluation**:
  * $E_0 = \overline{0} \cdot \overline{1} \cdot 1 = 0$. Driver 0 in High-Z.
  * $E_1 = \overline{0} \cdot 1 \cdot 1 = 1$. Driver 1 ACTIVE!
  * $E_2 = 0$. Driver 2 in High-Z.
  * $E_3 = 0$. Driver 3 in High-Z.
* **Bus Behavior**: Driver 1 drives $D_1 = 0$ ($0\text{ V}$) onto the bus. It easily overrides the $10\text{ k}\Omega$ pull-up resistor.
* **Output**: $Y = 0\text{ V}$ (Logic 0). **ALTITUDE DATA TRANSMITTED CORRECTLY!**

#### Scenario 2: Telemetry Reads Cabin Pressure Sensor ($S = 11_2$, $\text{TEL\_EN} = 1$, $D_3 = 1$)
* **Address**: $S_1=1, S_0=1$. Enable $\text{TEL\_EN} = 1$. Pressure sensor $D_3 = 1$.
* **Decoder Evaluation**: $E_3 = 1 \cdot 1 \cdot 1 = 1$. All other $E_k = 0$.
* **Bus Behavior**: Driver 3 drives $D_3 = 1$ ($+5\text{ V}$) onto the bus.
* **Output**: $Y = 5\text{ V}$ (Logic 1). **PRESSURE DATA TRANSMITTED CORRECTLY!**

#### Scenario 3: Telemetry Disabled During Standby ($\text{TEL\_EN} = 0$)
* **Enable**: $\text{TEL\_EN} = 0$.
* **Decoder Evaluation**: $E_0 = 0, E_1 = 0, E_2 = 0, E_3 = 0$.
* **Bus Behavior**: All four drivers enter High-Z. The $10\text{ k}\Omega$ pull-up resistor holds the bus line at $+5\text{ V}$.
* **Output**: $Y = 5\text{ V}$ (Stable Logic 1 default). **STANDBY MODE VERIFIED!**

All scenarios evaluate with 100% mathematical and electrical precision. The shared avionics bus is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **High-Impedance State ($Z$)**: The electrical open-circuit state produced by a Tri-State buffer when disabled, where both internal output transistors turn off to present near-infinite electrical resistance, disconnecting the gate from a wire so other drivers can transmit without interference.
* **Bus Contention**: The destructive short-circuit condition that occurs when two or more active logic drivers attempt to force conflicting voltage levels ($0$ and $1$) onto a single shared wire simultaneously, resulting in excessive current draw, thermal damage, and degraded logic voltages.
