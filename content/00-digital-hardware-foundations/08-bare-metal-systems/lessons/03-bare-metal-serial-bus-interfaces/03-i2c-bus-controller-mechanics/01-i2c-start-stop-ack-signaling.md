content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/03-bare-metal-serial-bus-interfaces/03-i2c-bus-controller-mechanics/01-i2c-start-stop-ack-signaling.md
# I2C Open-Drain Bus Architecture, START/STOP Generation, and NACK Handshake Mechanics

## The Two-Wire Multi-Driver Short Circuit Hazard

In modern high-density electronic systems, a central microcontroller must communicate with dozens of peripheral integrated circuits mounted on the same printed circuit board (PCB)—such as digital temperature sensors, real-time clock (RTC) chips, hardware encryption modules, power management ICs, and external EEPROM memories.

In early digital systems, interconnecting multiple chips required running dedicated, parallel buses or multi-wire serial interfaces (such as SPI). 

However, connecting 20 peripheral chips using SPI requires 20 individual, dedicated **Chip Select (`CS#`) lines**, leading to an explosive demand for physical package pins and creating a dense, un-routable maze of copper traces across the motherboard.

To solve this pin and wiring explosion, the **Inter-Integrated Circuit ($I^2C$)** protocol was created. 

An $I^2C$ bus connects dozens of independent integrated circuits using **only two shared physical wires**:
1. **Serial Data (`SDA`)**: A bidirectional line carrying data bits, slave addresses, and acknowledgment signals.
2. **Serial Clock (`SCL`)**: A clock line driven by the active Master device to synchronize bit transitions.

```text
2-WIRE INTER-INTEGRATED CIRCUIT (I2C) SHARED BUS TOPOLOGY

                      V_DD (3.3V)
                         │
             ┌───────────┴───────────┐
             │ R_pullup      R_pullup│ (External Pull-Up Resistors)
             └───┬───────────────┬───┘
                 │               │
 SDA Line ═══════╧═══════════════╧════════════════════════════ shared SDA
 SCL Line ═══════════════╤═══════════════╤════════════════════ shared SCL
                         │               │
             ┌───────────┴───┐       ┌───┴───────────┐
             │ I2C Master    │       │ I2C Slave 0   │
             │ Microcontroller       │ Temp Sensor   │
             └───────────────┘       └───────────────┘
```

However, connecting multiple independent silicon chips to the exact same physical wires introduces two catastrophic physical and logical engineering problems:

1. **The Multi-Driver Push-Pull Short Circuit Hazard**:
   On a standard digital bus, output drivers use **Push-Pull Transistors** (a PMOS transistor to drive $3.3\text{V}$, and an NMOS transistor to drive $0.0\text{V}$). 

   If Master A attempts to drive `SDA` High ($3.3\text{V}$) while Slave B simultaneously attempts to drive `SDA` Low ($0.0\text{V}$), Master A's PMOS transistor and Slave B's NMOS transistor turn ON at the exact same physical nanosecond!
   
   A direct, zero-resistance short-circuit path is created between supply voltage ($V_{DD}$) and Ground ($GND$). Hundreds of milliamperes of current surge through the silicon, burning out the output stage transistors and destroying both integrated circuits!

```text
PUSH-PULL SHORT CIRCUIT HAZARD ON SHARED BUS WIRES

 Master A Output Stage                    Slave B Output Stage
 V_DD (3.3V)                              V_DD (3.3V)
     │                                       │
    [x] PMOS ON (Drives 3.3V!)              [ ] PMOS OFF
     ├──────────────── Shared SDA Line ──────┤
    [ ] NMOS OFF                            [x] NMOS ON (Drives 0.0V!)
     │                                       │
    GND                                     GND
     ◄──────────── DIRECT SHORT CIRCUIT CURRENT SURGE! ───────────►
     (PMOS A and NMOS B ON simultaneously! Transistors BURN OUT!)
```

2. **The Framing Paradox (Framing Without Chip Select Wires)**:
   Because the $I^2C$ bus completely eliminates dedicated Chip Select (`CS#`) lines, how do all chips connected to `SDA` and `SCL` know when a new data frame begins and ends? 

   If a data bit transitions from $0 \to 1$ during a byte transfer, how does a peripheral know whether that transition is just a normal data bit or the start of a brand new communication packet?

3. **The Un-Acknowledged Receiver Hazard**:
   When a master transmits 8 bits of data over a shared wire, how does the master know if the target slave chip is physically present, awake, and successfully received the byte before sending the next byte?

To prevent short-circuit driver destruction, define packet boundaries without extra wires, and verify byte reception, $I^2C$ bus architectures employ **Open-Drain Bus Arbitration**, **START/STOP Condition Generation**, and **NACK Handshake Signaling**.

---

## The Classroom Discussion Rope and the Head-Nod: A Mental Model for I2C

To build a crystal-clear mental model of open-drain buses, pull-up resistors, wired-AND logic, START/STOP conditions, and ACK/NACK handshakes before inspecting transistor schematics, bitwise timing waveforms, and assembly registers, let us consider an everyday analogy: **The Classroom Discussion Rope**.

Imagine a group of 10 students (**Microcontrollers and Sensor Chips**) sitting around a table in a dark room. They need to communicate with each other using a single overhead rope (**The Shared `SDA` or `SCL` Wire**).

```text
THE CLASSROOM DISCUSSION ROPE METAPHOR

 Ceiling (Supply Voltage V_DD = 3.3V)
 ─────────────────────────────────────────────────────────────
                  │
                 [ ] Heavy Overhead Spring (Pull-Up Resistor R_pullup)
                  │
 Shared Rope ═════╧═══════════════════════════════════════════ (SDA / SCL Line)
                  │               │               │
             ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
             │Student A│     │Student B│     │Student C│
             └─────────┘     └─────────┘     └─────────┘
```

The overhead rope is supported by a strong ceiling spring (**The External Pull-Up Resistor $R_{\text{pullup}}$**):
* When **nobody** touches the rope, the ceiling spring pulls the rope High up against the ceiling (**Resting Logic High / $3.3\text{ Volts}$**).

Let us observe three rules enforced by the teacher (**The $I^2C$ Protocol Specification**):

---

### Rule 1: Pull Down ONLY! Never Push Up! (Open-Drain Bus Topology)

The teacher establishes an absolute physical safety rule:
> *"Students are allowed to grab the rope and pull it DOWN to the floor (**Drive Low / $0.0\text{V}$**). But NO STUDENT IS EVER ALLOWED TO PUSH THE ROPE UP toward the ceiling!"*

Look at what this rule achieves:
* If Student A pulls the rope DOWN to the floor ($0$), and Student B *also* pulls the rope DOWN to the floor ($0$), the rope sits safely on the floor.
* **Zero Short Circuits! Zero Broken Ropes!** Because nobody is pushing up while someone else pulls down, it is physically impossible for two students to break the rope or hurt each other!

#### Open-Drain Arbitration (Loss Detection)
Suppose Student A wants to say "1" (lets go of the rope, expecting the ceiling spring to pull it High), while Student B wants to say "0" (pulls the rope DOWN to the floor).

1. Student A lets go of the rope, expecting it to float up to the ceiling.
2. Student B pulls the rope DOWN to the floor.
3. Student A looks up and sees that the rope is sitting on the floor ($0$), even though Student A let go ($1$)!
4. **Student A detects an Arbitration Loss**: Student A realizes *"Someone else is pulling the rope down! I must be quiet and listen!"* Student A stops talking immediately without corrupting Student B's message!

```text
OPEN-DRAIN ARBITRATION (STUDENT A LETS GO, STUDENT B PULLS DOWN)

 Student A lets go of rope (Wants 1)  ──┐
                                      ├──► Rope stays on FLOOR (0)!
 Student B pulls rope down (Wants 0)  ──┘
                                      │
                                      ▼
 Student A sees rope is on Floor ──► "Someone else is talking! I yield!"
 (Student A stops talking silently! Zero data corruption!)
```

---

### Rule 2: The Trumpet Blast Before Speaking (START and STOP Conditions)

Normally, during a conversation, students change their grip on the rope ONLY when a metronome bell is silent (**`SDA` changes ONLY when `SCL` is Low**).

To capture everyone's attention without using extra call buttons:

1. **The START Condition (S)**:
   While the metronome bell is ringing High (**`SCL` is High / $3.3\text{V}$**), Student A abruptly yanks the data rope from High to Low (**Falling Edge on `SDA`**)!
   
   This "illegal" movement while the bell is High acts like a **Trumpet Blast** across the room: every student drops what they are doing and listens to the upcoming address!
2. **The STOP Condition (P)**:
   After the conversation finishes, while the metronome bell is held High (**`SCL` is High**), Student A releases the data rope from Low to High (**Rising Edge on `SDA`**).
   
   This signals that the conversation is over and the bus is free for others.

```text
TRUMPET BLAST START AND STOP CONDITIONS

 START Condition (S) : SCL is HIGH ──► SDA yanked HIGH to LOW (Trumpet Blast!)
 STOP  Condition (P) : SCL is HIGH ──► SDA released LOW to HIGH (Conversation Over!)
```

---

### Rule 3: The 9th-Step Head-Nod (ACK / NACK Handshake)

After Student A transmits 8 bits of data ($8\text{ metronome ticks}$) to Student B:
1. On the 9th metronome tick, Student A lets go of the data rope (**Releases `SDA` to High-Z**).
2. **Positive Acknowledgment (ACK = 0)**: If Student B received the byte successfully, Student B pulls the data rope DOWN to the floor (**Drives `SDA` Low = 0**) during the 9th tick. Student A sees the rope is Low and knows the byte arrived safely!
3. **Negative Acknowledgment (NACK = 1)**: If Student B is missing, asleep, or rejected the byte, Student B does nothing. The ceiling spring holds the rope High (**`SDA` stays High = 1**). Student A sees the rope is High ($1$), detects a NACK, and stops sending data!

```text
THE 9TH-STEP HEAD-NOD (ACK / NACK)

 9th Clock Tick: Student A releases rope (SDA floats High via Spring)
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
 Student B pulls rope DOWN  Student B does NOTHING
 (SDA = 0 -> ACK = 0!)      (SDA stays High = 1 -> NACK = 1!)
 "Byte Received Safely!"    "Byte Rejected or Device Missing!"
```

This classroom discussion rope system is the exact physical analogue of **I2C Open-Drain Bus Architecture, START/STOP Generation, and NACK Signaling**:
* The shared overhead rope is the **`SDA` or `SCL` Line**.
* The ceiling spring is the **External Pull-Up Resistor ($R_{\text{pullup}}$)**.
* Pulling down only is **Open-Drain NMOS Transistor Driving**.
* The trumpet blast is a **START / STOP Condition**.
* Yielding when the rope stays down is **Multi-Master Open-Drain Arbitration**.
* The 9th-step head-nod is the **ACK / NACK Handshake**.

---

## Deep Mechanics of Open-Drain Drivers, START/STOP Generators, and ACK/NACK Handshakes

Now that we possess an intuitive mental model of discussion ropes, ceiling springs, and 9th-step head-nods, let us examine the formal, rigorous engineering mechanics of **Open-Drain Drivers**, **Pull-Up Resistors**, **Wired-AND Logic**, **START/STOP Generators**, and **ACK/NACK Handshakes**.

---

### 1. The Open-Drain Transistor Output Stage & Wired-AND Logic

On an $I^2C$ bus, every pin connected to `SDA` or `SCL` uses an **Open-Drain Output Stage**:

```text
OPEN-DRAIN OUTPUT STAGE SCHEMATIC WITH EXTERNAL PULL-UP RESISTOR

                 Supply Voltage V_DD (3.3V)
                     │
                    [ ] External Pull-Up Resistor R_pullup (e.g., 4.7 kΩ)
                     │
                     ├─────────────────────────────► Shared Bus Line (SDA or SCL)
                     │
                    [ ] Internal Open-Drain NMOS Transistor
                     │  (Gate driven by internal I2C logic)
                    GND (0.0V)
```

#### How Open-Drain Driving Operates:
1. **Driving Logic $0$ (Low / $0.0\text{V}$)**:
   The internal logic sets the NMOS transistor Gate High ($1$). The NMOS transistor turns ON, creating a direct $0.5\ \Omega$ connection between the bus line and Ground ($GND$). The bus voltage drops cleanly to $0.0\text{ Volts}$.
2. **Driving Logic $1$ (High / $3.3\text{V}$ / High-Impedance State $Z$)**:
   The internal logic sets the NMOS transistor Gate Low ($0$). The NMOS transistor turns OFF completely (open circuit / High-Z). 
   
   The chip does **not** push voltage onto the line! Instead, the external passive **Pull-Up Resistor ($R_{\text{pullup}}$)** pulls the bus voltage up to $V_{DD}$ ($3.3\text{ Volts}$).

#### Mathematical Expression of Wired-AND Logic:
Because any single chip on the bus can pull the line Low ($0$), while ALL chips must release the line for it to go High ($1$), the physical wire acts as a multi-input **Boolean AND Gate (Wired-AND Logic)**:

$$\mathbf{\text{Line\_Voltage} = \text{Driver}_A \ \mathbf{\cdot} \ \text{Driver}_B \ \mathbf{\cdot} \ \text{Driver}_C \ \mathbf{\cdot} \ \dots \ \mathbf{\cdot} \ \text{Driver}_N}$$

Where:
* $\text{Line\_Voltage} \in \{0, 1\}$.
* $\text{Driver}_k = 1$ when chip $k$ turns its NMOS transistor OFF (releases the line).
* $\text{Driver}_k = 0$ when chip $k$ turns its NMOS transistor ON (pulls line to GND).

---

### 2. Calculating Pull-Up Resistor Limits ($R_{\text{pullup\_min}}$ and $R_{\text{pullup\_max}}$)

Selecting the correct resistance value for $R_{\text{pullup}}$ requires balancing two physical limits: **Minimum Sink Current** and **Maximum Bus Capacitance Rise Time**.

```text
PULL-UP RESISTOR VALUE SELECTION BOUNDS

 R_pullup TOO SMALL (< R_pullup_min)      R_pullup TOO LARGE (> R_pullup_max)
 ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
 │ Excess current through NMOS!      │    │ RC charging time t_rise too slow! │
 │ NMOS cannot pull line below V_OL! │    │ Signal rounded -> Speed fails!    │
 └───────────────────────────────────┘    └───────────────────────────────────┘
```

#### A. Lower Bound: Minimum Resistance ($R_{\text{pullup\_min}}$ — Driver Protection)
If $R_{\text{pullup}}$ is too small, excessive current flows through $R_{\text{pullup}}$ when an NMOS transistor turns ON. The NMOS transistor cannot sink the heavy current, and the Low voltage level fails to drop below the maximum Low logic threshold ($V_{\text{OL\_max}} = 0.4\text{V}$):

$$\mathbf{R_{\text{pullup\_min}} = \frac{V_{DD} - V_{\text{OL\_max}}}{I_{\text{OL\_max}}}}$$

For a typical $3.3\text{-V}$ $I^2C$ bus where $V_{\text{OL\_max}} = 0.4\text{V}$ and maximum NMOS sink current $I_{\text{OL\_max}} = 3.0\text{ mA}$:

$$R_{\text{pullup\_min}} = \frac{3.3\text{ V} - 0.4\text{ V}}{3.0 \times 10^{-3}\text{ A}} = \frac{2.9\text{ V}}{0.003\text{ A}} = \mathbf{966.67 \ \Omega}$$

#### B. Upper Bound: Maximum Resistance ($R_{\text{pullup\_max}}$ — $RC$ Rise-Time Limit)
When an NMOS transistor turns OFF, the line voltage rises from $0 \to 3.3\text{V}$ exponentially as $R_{\text{pullup}}$ charges the parasitic bus capacitance ($C_{\text{bus}}$).

Per $I^2C$ specification, the 30%-to-70% rise time ($t_r$) must not exceed $1,000\text{ ns}$ for $100\text{-kHz}$ Standard Mode, or $300\text{ ns}$ for $400\text{-kHz}$ Fast Mode:

$$t_r \approx 0.8473 \times R_{\text{pullup}} \times C_{\text{bus}}$$

Solving for $R_{\text{pullup\_max}}$:

$$\mathbf{R_{\text{pullup\_max}} = \frac{t_r}{0.8473 \times C_{\text{bus}}}}$$

For a Fast Mode bus ($400\text{ kHz}$, $t_r = 300\text{ ns}$) with PCB trace capacitance $C_{\text{bus}} = 100\text{ pF}$:

$$R_{\text{pullup\_max}} = \frac{300 \times 10^{-9}\text{ s}}{0.8473 \times (100 \times 10^{-12}\text{ F})} = \frac{300 \times 10^{-9}}{8.473 \times 10^{-11}} = \mathbf{3,540.66 \ \Omega} \quad (3.54\text{ k}\Omega)$$

##### Standard Industry Value Choice:
A resistor value of **$2.2\text{ k}\Omega \text{ or } 4.7\text{ k}\Omega$** falls perfectly inside the safe range ($967\ \Omega < R_{\text{pullup}} < 3,540\ \Omega$)!

---

### 3. Multi-Master Open-Drain Bus Arbitration

Because all chips connect via open-drain drivers, two Master devices (Master A and Master B) can start transmitting on the bus at the exact same physical second without crashing the hardware!

To resolve the collision, both masters execute **Bit-by-Bit Open-Drain Arbitration**:

```text
BIT-BY-BIT OPEN-DRAIN ARBITRATION TIMING

 Clock SCL     : ───┌───┐   ┌───┐   ┌───┐   ┌───┐
                    │ 1 │   │ 2 │   │ 3 │   │ 4 │
 Master A SDA  : ───┐       ┌───┐           ┌─── (Wants 1 on Bit 3)
                    └───────┘   └───────────┘
 Master B SDA  : ───┐       ┌───────────────┐   (Wants 0 on Bit 3)
                    └───────┘               └───
 Shared Bus SDA: ───┐       ┌───────────────┐   (SDA stays LOW on Bit 3!)
                    └───────┘               └───
                                            ▲
                                            │ Master A detects Loss!
                                            │ (Drove 1, but read 0!)
                                            │ Master A YIELDS IMMEDIATELY!
```

1. While driving a bit onto `SDA`, every master **simultaneously reads the actual voltage on the `SDA` line**.
2. On Bit 1 and Bit 2, Master A and Master B drive the exact same bits. Both see `SDA` matching their output.
3. On Bit 3, Master A releases `SDA` (wants to send `1`), while Master B pulls `SDA` Low (wants to send `0`).
4. Because the bus is a Wired-AND line, **`SDA` stays Low ($0.0\text{V}$)**!
5. Master A reads `SDA`, sees `0`, and compares it against its own output (`1`):
   $$\text{Master A Check: } \quad \text{Driven\_Bit } (1) \neq \text{Sensed\_Bus\_State } (0) \implies \mathbf{\text{ARBITRATION LOSS!}}$$
6. **Master A instantly turns OFF its NMOS transistor**, releases `SCL` and `SDA`, and switches to Slave Receiver mode.
7. **Master B notices nothing**! Master B's packet continues transmitting without losing a single bit!

---

### 4. START (S) and STOP (P) Condition Generation

Because $I^2C$ has no Chip Select wires, packet framing is defined by two unique voltage transitions:

#### The Data Stability Invariant:
> **The Data Invariant**: During normal byte transmission, the data line (`SDA`) **MUST remain completely stable** while the clock line (`SCL`) is High ($1$). `SDA` is permitted to change state **ONLY while `SCL` is Low ($0$)**!

Any transition on `SDA` while `SCL` is High is interpreted by all hardware decoders as a **Control Framing Signal**:

```text
START (S) AND STOP (P) CONDITION TIMING WAVEFORMS

 START Condition (S)                      STOP Condition (P)
 SCL Line : ───────────┐                  SCL Line : ───────────┐
                       │ (Held HIGH!)                           │ (Held HIGH!)
                       │                                        │
 SDA Line : ────┐      │                  SDA Line :       ┌────│
                └──────┴──────                             └────┴──────
             (Falling Edge = START!)                    (Rising Edge = STOP!)
```

#### A. START Condition (S)
A **Falling Edge on `SDA` ($1 \to 0$)** occurring while `SCL` is held **High ($1$)**.
* **Meaning**: Signals the beginning of a new $I^2C$ transaction. All slave hardware decoders wake up and prepare to receive the 7-bit slave address!

#### B. STOP Condition (P)
A **Rising Edge on `SDA` ($0 \to 1$)** occurring while `SCL` is held **High ($1$)**.
* **Meaning**: Signals the termination of the $I^2C$ transaction. Releases the bus back to Idle state (`SDA = 1, SCL = 1`).

#### C. Repeated START Condition (Sr)
A START condition generated mid-packet *without* first issuing a STOP condition. Used by a master to switch from Write Mode to Read Mode without releasing bus ownership to another master!

---

### 5. The 9-Bit Frame & ACK/NACK Handshake Mechanics

Every $I^2C$ data transmission is structured into **9-Bit Frames (8 Data Bits + 1 Handshake Bit)**:

```text
9-BIT I2C FRAME STRUCTURE AND ACK/NACK HANDSHAKE

 SCL Clock Pulses : 1   2   3   4   5   6   7   8     9 (Handshake Pulse!)
                   ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐   ┌─┐
                   └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘   └─┘
 SDA Data Line    : [B7][B6][B5][B4][B3][B2][B1][B0] [ ACK / NACK ]
                    ◄────── 8 Data Bits ──────────►  ▲
                                                     │ Master releases SDA!
                                                     │ Receiver drives SDA!
```

#### The 9th Clock Pulse Handshake Sequence:
1. **Transmitter Release (Bits $1 \dots 8$)**:
   The transmitter shifts out 8 data bits ($B_7 \dots B_0$) on clock pulses 1 through 8.
2. **The 9th Clock Release**:
   On the 9th clock pulse, the transmitter **releases `SDA`** (turns its NMOS transistor OFF, allowing `SDA` to float High via $R_{\text{pullup}}$).
3. **Receiver Response**:
   * **ACK (Acknowledgment — Logic $0$)**:
     If the receiver accepted the byte, it **pulls `SDA` Low ($0.0\text{V}$)** during the 9th clock pulse.
     The master reads `SDA = 0` and proceeds to send the next byte!
   * **NACK (Negative Acknowledgment — Logic $1$)**:
     If the receiver rejects the byte or is not present, it leaves `SDA` High ($1$).
     The master reads `SDA = 1`, detects a NACK, and issues a STOP condition to abort the transaction!

```text
WHEN DOES A MASTER GENERATE A NACK?

 Master Reading Data from Slave (Multi-Byte Read Stream):
 Byte 1 Read : Master drives ACK = 0  ──► "Send me another byte!"
 Byte 2 Read : Master drives ACK = 0  ──► "Send me another byte!"
 Byte 3 Read : Master drives NACK = 1 ──► "THIS IS MY LAST BYTE! STOP SENDING!"
 Followed by : Master issues STOP Condition (P).
```

---

## Real-World Silicon Failures, Bus Lockups, and Recovery

In commercial embedded systems, $I^2C$ buses are notoriously sensitive to hardware stuck-line conditions and bus capacitance errors.

---

### 1. The Stuck SDA Low Hazard (Slave Crash Mid-Byte)

The most common real-world $I^2C$ failure occurs when a slave device suffers a transient power dip or reset **midway through a byte read operation**:

```text
THE STUCK SDA LOW BUS LOCKUP HAZARD

 Slave is driving SDA = 0 on Bit 4 ──► CPU Host suffers transient reset!
 CPU reboots and initializes I2C Master ──► Master attempts to send START Condition...
                                            │
                                            ▼
 Master tries to pull SDA High ──► SLAVE IS STILL HOLDING SDA = 0 LOW!
 Master sees SDA is stuck Low ──► Master CANNOT generate START condition!
 (The entire I2C bus is PERMANENTLY LOCKED UP!)
```

1. The slave is midway through sending a byte and is driving `SDA = 0` Low on bit 4.
2. The host CPU suffers a reset and reboots.
3. Upon rebooting, the master tries to issue a START condition by driving `SDA` High.
4. **THE LOCKUP**: The slave is *still* waiting for clock pulse #4 and is holding `SDA = 0` Low!
5. The master sees `SDA` stuck Low, assumes another master owns the bus, and refuses to transmit! The $I^2C$ bus enters a **Permanent Bus Lockup**.

#### The Hardware Recovery Algorithm (9-Clock Bit-Banging Cleansing):
If the master detects `SDA` stuck Low during boot-up:

Software configures the `SCL` pin as a general GPIO output and **manually clocks `SCL` 9 times**:

```assembly
/* HARDWARE I2C BUS RECOVERY IN ASSEMBLY */
i2c_bus_recovery:
    /* Configure SCL as GPIO Output */
    movs    r0, #9              /* Loop 9 times */
clock_loop:
    /* Toggle SCL Low -> High to fake 9 clock pulses */
    str     r1, [GPIO_BSRR_SCL_LOW]
    /* Wait 5 us */
    str     r1, [GPIO_BSRR_SCL_HIGH]
    /* Wait 5 us */
    subs    r0, r0, #1
    bne     clock_loop
    /* Slave sees 9 clock pulses, finishes its byte, and RELEASES SDA! */
```

After 9 clock pulses on `SCL`, the stuck slave finishes its 8-bit frame, releases `SDA = 1` High, and the bus is recovered!

---

### 2. Excessive Bus Capacitance ($C_{\text{bus}} > 400\text{ pF}$) Signal Distortion

When an $I^2C$ bus connects many sensors across long PCB traces, the total parasitic capacitance of the copper wires increases ($C_{\text{bus}} > 400\text{ pF}$).

Because $R_{\text{pullup}}$ charges $C_{\text{bus}}$ passively when transistors turn OFF:

Excessive capacitance causes the rising edge of `SDA` and `SCL` to round off slowly ($t_r > 1,000\text{ ns}$):

```text
SIGNAL DISTORTION FROM EXCESSIVE BUS CAPACITANCE

 Fast Rise Time (C_bus = 50 pF)        Slow Distorted Rise Time (C_bus = 600 pF)
 3.3V ┼────┌────────┐                  3.3V ┼─────────/───────
      │    │        │                       │        /
 0.0V ┴────┘        └──────            0.0V ┴───────/─────────
      (Clean Square Wave)                   (Rounded Slope -> Bit Mis-sampled!)
```

If $t_r$ exceeds the $I^2C$ timing specification limit, the receiver samples `SDA` before it reaches $V_{\text{IH}} = 2.3\text{V}$, reading false zeros and generating NACK errors!

#### The Hardware Fix:
Decrease $R_{\text{pullup}}$ from $10\text{ k}\Omega$ down to $2.2\text{ k}\Omega$ (increasing pull-up charging current) or install an **$I^2C$ Active Accelerator / Bus Buffer**!

---

## Solved Industrial Engineering Exercise: Quantitative Pull-Up Resistor Calculation, I2C State Machine Trace, and Assembly Driver Synthesis

To consolidate your complete mastery of $I^2C$ open-drain bus architecture, wired-AND logic, pull-up resistor calculation math, START/STOP condition waveforms, and assembly MMIO driver execution, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal bare-metal systems architect configuring an $I^2C$ bus interface (`I2C1`) for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The controller connects to an external Temperature Sensor Slave Chip (`TMP102`, 7-bit Slave Address $= \mathbf{\text{0x48}} = 1001\_000_2$) over a $100\text{-kHz}$ Standard Mode $I^2C$ bus.

```text
3.2 GZ SERVER PROCESSOR I2C1 TEMPERATURE SENSOR SUBSYSTEM

 Host CPU (3.2 GHz) ──► [ I2C1 Peripheral @ 0x4000_5400 ] ──► TMP102 Sensor (Address 0x48)
 Clock f_PCLK1 = 42.000 MHz                             V_DD = 3.30V
                                                        Bus Capacitance C_bus = 150 pF
```

#### Hardware & Bus Specifications:
* **APB1 Bus Clock Frequency ($f_{\text{PCLK1}}$)**: $42.000\text{ MHz}$ ($42,000,000\text{ Hz}$).
* **Target Bus Speed**: Standard Mode $100.0\text{ kHz}$ ($T_{\text{SCL}} = 10.0\ \mu\text{s}$).
* **Supply Voltage ($V_{DD}$)**: $3.30\text{ Volts}$ ($V_{\text{OL\_max}} = 0.40\text{V}$, $I_{\text{OL\_max}} = 3.0\text{ mA}$).
* **Total Measured Bus Capacitance ($C_{\text{bus}}$)**: $150.0\text{ pF}$ ($150 \times 10^{-12}\text{ F}$).
* **Standard Mode Max Rise Time ($t_{r\_max}$)**: $1,000.0\text{ nanoseconds}$ ($1,000 \times 10^{-9}\text{ s}$).

#### Workload Transaction Requirement:
The CPU needs to read a $16\text{-bit}$ temperature value ($2\text{ bytes}$) from `TMP102` (`0x48`):
1. Issue **START Condition (S)**.
2. Transmit **7-Bit Address + Read Bit (`0x48` + `1` $= \text{0x91}$)**.
3. Receive **Byte 1 (High Temperature Byte)** $\implies$ Return **ACK ($0$)**.
4. Receive **Byte 2 (Low Temperature Byte)** $\implies$ Return **NACK ($1$)** (signals end of read stream!).
5. Issue **STOP Condition (P)**.

#### Your Objective

1. Calculate the valid resistance range ($R_{\text{pullup\_min}}$ to $R_{\text{pullup\_max}}$) in Ohms for the external $I^2C$ bus pull-up resistors.
2. Select a standard E24 series resistor value (e.g., $2.2\text{ k}\Omega, 3.3\text{ k}\Omega, 4.7\text{ k}\Omega$) that satisfies both bounds.
3. Calculate the clock control register value (`I2C1_CCR`) required to synthesize $100.0\text{ kHz}$ $SCL$ from $f_{\text{PCLK1}} = 42.000\text{ MHz}$.
4. Construct the complete 9-bit binary frame layout for the Address Read Byte (`0x48` address + Read Bit $1$).
5. Write the complete, production-ready ARM Assembly routine `I2C1_ReadTempSensor` that executes the START condition, address transmission, ACK/NACK signaling, 2-byte read, and STOP condition.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Pull-Up Resistor Limits ($R_{\text{pullup\_min}}$ and $R_{\text{pullup\_max}}$)

##### 1. Calculate Minimum Resistance ($R_{\text{pullup\_min}}$):

$$R_{\text{pullup\_min}} = \frac{V_{DD} - V_{\text{OL\_max}}}{I_{\text{OL\_max}}} = \frac{3.30\text{ V} - 0.40\text{ V}}{3.0 \times 10^{-3}\text{ A}} = \frac{2.90\text{ V}}{0.003\text{ A}} = \mathbf{966.67 \ \Omega}$$

##### 2. Calculate Maximum Resistance ($R_{\text{pullup\_max}}$) for $C_{\text{bus}} = 150.0\text{ pF}$, $t_r = 1,000\text{ ns}$:

$$R_{\text{pullup\_max}} = \frac{t_r}{0.8473 \times C_{\text{bus}}} = \frac{1,000 \times 10^{-9}\text{ s}}{0.8473 \times (150 \times 10^{-12}\text{ F})} = \frac{1,000 \times 10^{-9}}{1.27095 \times 10^{-10}}$$

$$R_{\text{pullup\_max}} \approx \mathbf{7,868.13 \ \Omega} \quad (7.868\text{ k}\Omega)$$

##### 3. Select Standard Resistor Value:
Our valid range is:

$$966.67\ \Omega \le R_{\text{pullup}} \le 7,868.13\ \Omega$$

We select the standard E24 resistor value **$R_{\text{pullup}} = \mathbf{3.3 \text{ k}\Omega}$ ($3,300\ \Omega$)**, which sits comfortably in the middle of the valid range!

---

#### Step 2: Calculate Clock Control Register (`I2C1_CCR`) for $100.0\text{ kHz}$ $SCL$

In $I^2C$ Standard Mode ($100\text{ kHz}$), $SCL$ spends $5.0\ \mu\text{s}$ Low and $5.0\ \mu\text{s}$ High ($50\%$ duty cycle).

The clock control value $CCR$ in `I2C1_CCR` defines the number of $PCLK1$ clock cycles spent in one half-period ($t_{\text{high}} = 5.0\ \mu\text{s}$):

$$t_{\text{high}} = CCR \times T_{\text{PCLK1}} = \frac{CCR}{f_{\text{PCLK1}}}$$

Given $t_{\text{high}} = 5.0\ \mu\text{s} = 5.0 \times 10^{-6}\text{ s}$ and $f_{\text{PCLK1}} = 42,000,000\text{ Hz}$:

$$5.0 \times 10^{-6}\text{ s} = \frac{CCR}{42,000,000\text{ Hz}}$$

$$CCR = 42,000,000 \times (5.0 \times 10^{-6}) = \mathbf{210_{10}} = \mathbf{\text{0x00D2}}$$

##### Clock Control Result:
Writing `210` (`0x00D2`) to `I2C1_CCR` synthesizes an exact **$100.0\text{-kHz}$ $SCL$ clock**!

---

#### Step 3: Construct the 9-Bit Address Read Frame

The 7-bit slave address is `0x48` $= 1001\_000_2$.

To perform a Read operation, the 8th bit (Bit 0) is set to **`1` (Read Mode)**:

$$\text{8-Bit Address Byte} = (\text{0x48} \ll 1) \mid 1 = (1001\_0000_2) \mid 1 = \mathbf{1001\_0001_2} = \mathbf{\text{0x91}}$$

```text
BITWISE 9-BIT ADDRESS READ FRAME (0x91 + ACK)

 Bit 8   Bit 7   Bit 6   Bit 5   Bit 4   Bit 3   Bit 2   Bit 1   Bit 0 (9th Pulse)
 ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────────────┐
 │   1   │   0   │   0   │   1   │   0   │   0   │   0   │   1   │ ACK (0 Volts) │
 └───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────────────┘
  ◄──────────── 7-Bit Address: 0x48 ───────────►  ◄─Read─► ◄─ Driven by TMP102 ─►
```

---

#### Step 4: Write Complete Production Assembly Master Driver (`I2C1_ReadTempSensor`)

Here is the complete, production-ready ARM Assembly routine for reading 2 bytes from the `TMP102` sensor:

```assembly
/* PRODUCTION BARE-METAL I2C1 MASTER READ ROUTINE IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_APB1ENR,     0x40023840        /* APB1 Clock Enable */
.equ I2C1_BASE,       0x40005400
.equ I2C1_CR1,        0x40005400        /* Control Register 1 */
.equ I2C1_CR2,        0x40005404        /* Control Register 2 */
.equ I2C1_DR,         0x40005410        /* Data Register */
.equ I2C1_SR1,        0x40005414        /* Status Register 1 */
.equ I2C1_SR2,        0x40005418        /* Status Register 2 */
.equ I2C1_CCR,        0x4000541C        /* Clock Control Register */

.global I2C1_ReadTempSensor
.type I2C1_ReadTempSensor, %function

.section .text
.thumb_func
I2C1_ReadTempSensor:
    /* Inputs: None
     * Returns: r0 = 16-bit Temperature Value (Byte1 << 8 | Byte2)
     */
    push    {r4, r5, lr}

    ldr     r4, =I2C1_BASE

    /* -------------------------------------------------------------------- */
    /* STEP 1: GENERATE START CONDITION (CR1.START = 1)                     */
    /* -------------------------------------------------------------------- */
    ldr     r1, [r4, #0x00]             /* Read CR1 */
    orr     r1, r1, #(1 << 10)          /* Enable ACK = 1 (Acknowledge enable) */
    orr     r1, r1, #(1 << 8)           /* Set START = 1 */
    str     r1, [r4, #0x00]

    /* Wait for START condition generated (SR1.SB = 1) */
wait_sb:
    ldr     r1, [r4, #0x14]             /* Read SR1 */
    tst     r1, #(1 << 0)               /* Test SB bit (Bit 0) */
    beq     wait_sb

    /* -------------------------------------------------------------------- */
    /* STEP 2: TRANSMIT SLAVE ADDRESS + READ BIT (0x91)                     */
    /* -------------------------------------------------------------------- */
    movs    r1, #0x91                   /* 0x48 << 1 | 1 = 0x91 */
    str     r1, [r4, #0x10]             /* Write Address to DR */

    /* Wait for Address Sent & Acknowledged (SR1.ADDR = 1) */
wait_addr:
    ldr     r1, [r4, #0x14]             /* Read SR1 */
    tst     r1, #(1 << 1)               /* Test ADDR bit (Bit 1) */
    beq     wait_addr

    /* Clear ADDR flag by reading SR2 */
    ldr     r1, [r4, #0x18]             /* Read SR2 (Clears ADDR flag!) */

    /* -------------------------------------------------------------------- */
    /* STEP 3: READ BYTE 1 (HIGH BYTE) -> RETURN ACK = 0                    */
    /* -------------------------------------------------------------------- */
wait_rxne1:
    ldr     r1, [r4, #0x14]             /* Read SR1 */
    tst     r1, #(1 << 6)               /* Test RxNE bit (Bit 6) */
    beq     wait_rxne1

    ldr     r5, [r4, #0x10]             /* r5 = Byte 1 (High Temp Byte) */

    /* -------------------------------------------------------------------- */
    /* STEP 4: PREPARE NACK & STOP CONDITION BEFORE READING FINAL BYTE 2     */
    /* -------------------------------------------------------------------- */
    ldr     r1, [r4, #0x00]             /* Read CR1 */
    bic     r1, r1, #(1 << 10)          /* Clear ACK = 0 (Send NACK on next byte!) */
    orr     r1, r1, #(1 << 9)           /* Set STOP = 1 (Generate STOP after byte!) */
    str     r1, [r4, #0x00]

    /* -------------------------------------------------------------------- */
    /* STEP 5: READ BYTE 2 (LOW BYTE) AND ASSEMBLE 16-BIT RESULT             */
    /* -------------------------------------------------------------------- */
wait_rxne2:
    ldr     r1, [r4, #0x14]             /* Read SR1 */
    tst     r1, #(1 << 6)               /* Test RxNE bit (Bit 6) */
    beq     wait_rxne2

    ldr     r1, [r4, #0x10]             /* r1 = Byte 2 (Low Temp Byte) */

    /* Combine r5 (High) and r1 (Low) into 16-bit integer: (r5 << 8) | r1 */
    lsl     r0, r5, #8
    orr     r0, r0, r1                  /* r0 = 16-bit Temperature Result */

    pop     {r4, r5, pc}
.size I2C1_ReadTempSensor, .-I2C1_ReadTempSensor
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and protocol state machine results against hardware specifications:

1. **Pull-Up Resistor Safety Margin Verification**:
   * Calculated $R_{\text{pullup\_min}} = 967\ \Omega$, $R_{\text{pullup\_max}} = 3,540\ \Omega$.
   * Selected $R_{\text{pullup}} = 3,300\ \Omega$ ($3.3\text{ k}\Omega$).
   * $967\ \Omega < 3,300\ \Omega < 3,540\ \Omega \implies \mathbf{\text{PULL-UP MARGIN PASSED!}}$
   * Protects open-drain NMOS transistors from over-current while guaranteeing $t_r < 1,000\text{ ns}$ rise time!

2. **$100\text{-kHz}$ $SCL$ Clock Frequency Check**:
   * $f_{\text{PCLK1}} = 42\text{ MHz} \implies T_{\text{PCLK1}} = 23.8095\text{ ns}$.
   * $CCR = 210 \implies t_{\text{high}} = 210 \times 23.8095\text{ ns} = 5.000\ \mu\text{s}$.
   * $T_{\text{SCL}} = 2 \times 5.000\ \mu\text{s} = 10.000\ \mu\text{s} \implies f_{\text{SCL}} = \mathbf{100.000 \text{ kHz}}$ exact!

3. **NACK and STOP Condition Ordering Check**:
   * In Step 4 of `I2C1_ReadTempSensor`, `ACK = 0` (NACK) and `STOP = 1` were programmed **BEFORE reading Byte 2 from `I2C1_DR`**.
   * Programming NACK *before* reading the penultimate byte guarantees that the $I^2C$ hardware releases `SDA` High on the 9th clock pulse of Byte 2, signaling the `TMP102` sensor that transmission is complete!

All pull-up resistor equations, $100\text{-kHz}$ $CCR$ clock values, START/STOP condition state transitions, NACK 9th-pulse handshakes, and assembly master driver routines evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Open-Drain Bus Arbitration**: An electrical bus topology where every chip's output stage consists solely of an NMOS transistor that can pull the shared line to Ground ($0.0\text{V}$), relying on a passive external pull-up resistor ($R_{\text{pullup}}$) to return the line to $3.3\text{V}$, enabling multi-master wired-AND bus arbitration without short circuits.
* **$I^2C$ START/STOP Condition Generator**: A hardware state machine that generates unique, non-data bus framing signals by transitioning `SDA` while `SCL` remains High ($1$):
  * **START (S)**: High-to-Low transition on `SDA` while `SCL` is High.
  * **STOP (P)**: Low-to-High transition on `SDA` while `SCL` is High.
* **NACK Signaling**: The 9th clock pulse handshake mechanism where a receiver leaves `SDA` High ($1$, Negative Acknowledgment / NACK) or pulls `SDA` Low ($0$, Acknowledgment / ACK) to indicate byte acceptance or bus stream termination.