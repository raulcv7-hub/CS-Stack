---
title: "I2C Open-Drain Bus Architecture, START/STOP Generation, and NACK Handshake Mechanics"
---

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


## Solved Industrial Engineering Exercise: Quantitative Pull-Up Resistor Calculation, I2C State Machine Trace, and Assembly Driver Synthesis

To consolidate your complete mastery of $I^2C$ open-drain bus architecture, wired-AND logic, pull-up resistor calculation math, START/STOP condition waveforms, and assembly MMIO driver execution, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

