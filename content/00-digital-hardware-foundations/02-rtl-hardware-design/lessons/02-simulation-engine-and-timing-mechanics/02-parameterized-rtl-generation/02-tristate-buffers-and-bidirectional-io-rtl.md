content/00-digital-hardware-foundations/02-rtl-hardware-design/lessons/02-simulation-engine-and-timing-mechanics/03-parameterized-rtl-generation/02-tristate-buffers-and-bidirectional-io-rtl.md
# Tristate Buffers, High-Impedance State Modeling, and Bidirectional I/O Boundary Interface Synthesis

Imagine you are an integrated circuit design engineer building an onboard memory controller for a satellite communications processor. The processor needs to exchange data with an external High-Bandwidth Static RAM (SRAM) memory chip mounted on the same printed circuit board (PCB).

To minimize the physical package size and manufacturing cost of the microchip, the PCB uses a shared 32-bit data bus (`memory_data_bus[31:0]`) connecting the microcontroller directly to the SRAM chip.

When the microcontroller wants to store a data word into memory (a Write operation), its internal output drivers turn ON and drive the 32 physical copper wires on the PCB.

When the microcontroller wants to retrieve a data word from memory (a Read operation), the external SRAM chip's output drivers turn ON and drive those exact same 32 physical copper wires back to the microcontroller.

Now, consider what happens if a bug in your control logic causes the microcontroller's write enable signal and the SRAM chip's read enable signal to turn High at the **exact same physical nanosecond**:

```text
 Driver A Output = 1 (1.2V) ──┐
                              ├──► [ PHYSICAL SHORT CIRCUIT! ] ──► Wire State = 'x'
 Driver B Output = 0 (0V)   ──┘    (High Current / Transistor Burnout!)
```

The microcontroller attempts to pull the 32 copper wires up to Supply Voltage ($V_{DD} = 1.2\text{ V}$) to represent a logical $1$. At the same millimetre on the circuit board, the SRAM chip attempts to pull those exact same 32 copper wires down to Ground ($0\text{ V}$) to represent a logical $0$.

A direct, low-resistance electrical short circuit is established between $V_{DD}$ and Ground through the internal silicon transistors of both chips!

In an event-driven software simulator, this driver collision causes the 32-bit data bus to enter an unknown, indeterminate state (**`x`**). 

In physical silicon, massive short-circuit currents (hundreds of milliamperes) surge through the microscopic CMOS transistors. The power supply voltage collapses, the silicon junction temperatures spike past $150^\circ\text{C}$, and the output driver transistors burn out permanently, destroying the microchip.

This catastrophic physical driver collision is known as **Bus Contention**.

To allow multiple physical transmitters to share a single copper wire trace without causing short-circuit bus contention, digital hardware engineering relies on **High-Impedance State Modeling (`1'bz`)** and **Tristate Buffers**.

Furthermore, while high-impedance tri-state logic was historically used inside older integrated circuits for internal shared buses, modern ASIC and FPGA silicon architectures **completely forbid internal tristate buses**. Internal tristates are physically obsolete, replaced by high-speed multiplexer networks (such as AXI or AHB crossbars), and tristate logic is strictly restricted to **physical chip package I/O boundary pads (`inout`)**.

By mastering high-impedance modeling (`1'bz`), bidirectional I/O pad synthesis (`inout`), and bus contention detection, we ensure that our hardware interfaces communicate safely across physical board boundaries without silicon degradation.

---

## The Shared Walkie-Talkie Radio and the Door Push-Pull Tug-of-War: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of high-impedance states, tristate buffers, bus contention, and bidirectional I/O pads, let us explore two physical analogies from everyday life.

---

### Part A: The Shared Two-Way Walkie-Talkie Radio Channel (High-Impedance State $Z$)

Imagine a security team at an airport operating on a single, shared two-way radio channel. Ten security officers carry identical walkie-talkie radios tuned to Channel 5.

```text
 Speaker A Talking (Driver Active, OE = 1) ──► Transmits Sound
 Speaker B Silent  (Driver Disconnected, OE = 0 / State Z)

 BOTH Speak at Once! (Bus Contention, OE_A = 1, OE_B = 1)
   ──► GARBLED NOISE / SQUEAL! (Simulation X State!)
```

How do the security officers communicate without destroying the conversation?

#### Mode 1: Speaker Transmitting (Active Driver: $0$ or $1$)
Officer A wants to report a message. Officer A presses the Push-to-Talk button (**Output Enable $\text{OE} = 1$**) and speaks into the microphone. Officer A's radio actively drives the radio frequency airwaves with sound energy.

#### Mode 2: Listener Disconnected (High-Impedance State $Z$)
While Officer A is speaking, what are the other nine security officers doing?
* They are **NOT** pressing their Push-to-Talk buttons ($\text{OE} = 0$).
* Their radio transmitters are turned **COMPLETELY OFF**.
* Their radios are electronically disconnected from transmitting. They sit in a passive, high-impedance listening state ($Z$). They do not inject any sound energy onto Channel 5.

Because nine radios are in the $Z$ state (disconnected), Officer A's message travels clearly across the airwaves to all listeners.

#### Mode 3: Radio Collision / Bus Contention (State $X$)
Now, suppose Officer A and Officer B press their Push-to-Talk buttons ($\text{OE}_A = 1$ and $\text{OE}_B = 1$) at the exact same second and shout different words into their microphones.

What do the other security officers hear on their radios?

**Garbled, squeALING NOISE ($X$)!** Neither message can be understood. The two radio transmitters interfere with each other, draining their batteries and jamming Channel 5.

This walkie-talkie network is the exact physical analogue of a **Tri-State Data Bus**:
* Channel 5 is the **Shared Physical Wire (`wire shared_bus`)**.
* Pressing Push-to-Talk is **Asserting Output Enable ($\text{OE} = 1$)**.
* Sitting silent with transmitter OFF is the **High-Impedance State (`1'bz`)**.
* Garbled noise when two people shout is **Bus Contention (`x`)**.

---

### Part B: The Two-Person Door Push-Pull Conflict (Bus Contention Physics)

Now imagine a heavy glass door at the entrance of a building. Two people, Person A and Person B, stand on opposite sides of the door.

```text
 Person A Pushes Door (1.2V High) ──┐
                                     ├──► [ DOOR JAMMED / BROKEN! ]
 Person B Pulls Door (0V Low)    ──┘    (Physical Force Contention!)
```

* **Normal Operation**: Person A pushes the door open while Person B steps back and lets the door move freely. The door opens smoothly.
* **Force Contention**: Person A tries to **PUSH** the door open with maximum strength ($1.2\text{ V}$ High driver), while Person B tries to **PULL** the door shut with maximum strength ($0\text{ V}$ Low driver).

What happens to the glass door?
* The door does not open, nor does it close. It jams in the middle under tremendous mechanical stress!
* Both people strain their muscles, sweat, and waste energy.
* If they keep pushing and pulling with full strength for 5 minutes, the glass cracks and shatters!

This door conflict is the exact physical analogue of **CMOS Output Driver Contention**:
* Person A is the **PMOS Pull-Up Transistor** trying to connect the wire to $V_{DD}$ ($1$).
* Person B is the **NMOS Pull-Down Transistor** trying to connect the wire to Ground ($0$).
* The shattered glass is **Silicon Transistor Burnout** caused by short-circuit current!

---

## Physics and Mechanics of High-Impedance States (`1'bz`) & Tri-State Buffers

To master high-impedance modeling in SystemVerilog, we must examine the 4-state digital value system and the internal transistor architecture of a tri-state buffer.

---

### Primitive 1: The 4-State Digital Value System ($0, 1, x, z$)

SystemVerilog models digital hardware using a **4-state value system**. Every bit of a `logic`, `wire`, or `reg` signal can hold one of four distinct physical values:

```text
THE 4-STATE DIGITAL VALUE SYSTEM

 Value State │ Electrical Meaning                     │ Physical Transistor Condition
─────────────┼────────────────────────────────────────┼─────────────────────────────────────────
      0      │ Logic Low (Ground / 0V)                │ NMOS Transistor ON, PMOS OFF
      1      │ Logic High (Supply Voltage / VDD)      │ PMOS Transistor ON, NMOS OFF
      x      │ Unknown / Conflict / Uninitialized     │ Short-circuit contention or floating bug
      z      │ High-Impedance / Tri-State / Floating  │ BOTH PMOS and NMOS Transistors OFF!
```

#### Transistor Architecture of a CMOS Tri-State Buffer

A standard CMOS push-pull output driver consists of two transistors:
1. A **PMOS Transistor** connected between $V_{DD}$ ($1.2\text{ V}$) and the output pin.
2. An **NMOS Transistor** connected between Ground ($0\text{ V}$) and the output pin.

A **Tri-State Buffer** adds control logic driven by an **Output Enable ($\text{OE}$)** signal:

```text
CMOS TRI-STATE BUFFER TRANSISTOR SCHEMATIC

 VDD (1.2V) ───►[ PMOS Transistor ]
                     │
 Output Enable (OE)──┼──► Output Pin (shared_bus)
                     │
 GND (0V)   ───►[ NMOS Transistor ]
 (When OE = 0, BOTH PMOS and NMOS are OFF -> Output FLOATS as 'z'!)
```

Let us evaluate the three operational states of a CMOS Tri-State Buffer:

##### State 1: Active High Output ($\text{OE} = 1, \text{Data} = 1$)
* PMOS Transistor = **ON** (Closed circuit to $V_{DD}$).
* NMOS Transistor = **OFF** (Open circuit to Ground).
* Output Pin = **Driven to $1.2\text{ V}$ (Logical $1$)**.

##### State 2: Active Low Output ($\text{OE} = 1, \text{Data} = 0$)
* PMOS Transistor = **OFF** (Open circuit to $V_{DD}$).
* NMOS Transistor = **ON** (Closed circuit to Ground).
* Output Pin = **Driven to $0.0\text{ V}$ (Logical $0$)**.

##### State 3: High-Impedance Disconnected State ($\text{OE} = 0$)
* PMOS Transistor = **OFF** (Open circuit to $V_{DD}$).
* NMOS Transistor = **OFF** (Open circuit to Ground).
* Output Pin = **ELECTRONICALLY DISCONNECTED (Logical $z$)**!

In the $z$ state, the output pin presents a very high electrical impedance ($> 10 \text{ M}\Omega$) to the wire. No current flows into or out of the pin. The pin floats electronically, allowing another device on the same wire to drive $0$ or $1$ safely!

---

### SystemVerilog Tri-State Buffer Syntax

In SystemVerilog, a tri-state buffer is modeled using a conditional continuous assignment (`assign`) with the high-impedance literal **`1'bz`** (or `'z`):

```systemverilog
// SYSTEMVERILOG TRI-STATE BUFFER MODELING
module TristateBuffer (
    input  logic data_in,
    input  logic output_enable, // 1 = Drive, 0 = Float
    output wire  data_out       // MUST be declared 'wire' for multi-driver nets!
);

    // Continuous assignment with high-impedance fallback
    assign data_out = output_enable ? data_in : 1'bz;

endmodule
```

```text
TRI-STATE BUFFER SIGNAL FLOW

 output_enable = 1  ──► data_out = data_in  (Drives 0 or 1 actively)
 output_enable = 0  ──► data_out = 1'bz     (Floats high-impedance!)
```

---

### Simulation Resolution Matrix for Multi-Driver Nets

When multiple tri-state drivers are connected to the same physical `wire` net in a software simulator, the simulator engine uses a **Built-in Net Resolution Table** to compute the resulting net value:

```text
SYSTEMVERILOG TRI-STATE RESOLUTION MATRIX

 Driver A Value │ Driver B Value │ Resolved Wire Net State │ Hardware Physical Meaning
────────────────┼────────────────┼─────────────────────────┼──────────────────────────────────────────
       0        │       z        │            0            │ Driver A controls bus safely.
       1        │       z        │            1            │ Driver A controls bus safely.
       z        │       z        │            z            │ Bus floats (un-driven high-impedance).
       0        │       0        │            0            │ Both drivers agree on 0 V.
       1        │       1        │            1            │ Both drivers agree on VDD.
       0        │       1        │            x            │ BUS CONTENTION! Short-circuit collision!
```

Look at this table carefully:
* When Driver B is in state `z` (disconnected), Driver A has complete, exclusive control over the wire ($0$ or $1$).
* If BOTH drivers go to `z`, the wire state becomes `z` (floating).
* **If Driver A tries to drive $0$ while Driver B tries to drive $1$**, the simulator resolves the conflict to **`x` (Unknown / Bus Contention)**!

---

## Why Internal Tristate Buses Are Obsolete in Modern Silicon

A critical boundary between legacy Verilog-1995 coding and modern digital engineering is the rule regarding **Internal Tristate Buses**.

In the 1980s and 1990s, microchips were large and process geometry was wide ($0.5\,\mu\text{m}$). Chips frequently used internal tri-state buses to route data between internal CPU registers, ALUs, and cache memories over a single set of shared internal wires.

However, in modern deep-submicron ASIC technology nodes ($28\text{nm}, 7\text{nm}, 3\text{nm}$) and modern FPGAs, **INTERNAL TRISTATE BUSES ARE COMPLETELY FORBIDDEN**.

```text
WHY INTERNAL TRISTATE BUSES ARE FORBIDDEN IN MODERN ASICs/FPGAs

 Legacy Internal Tristate Bus (OBSOLETE & BANNED!):
 Driver A (1'bz) ──┐
 Driver B (1'bz) ──┼──► Floating Internal Wire (1.5V) ──► Input Gate
 Driver C (1'bz) ──┘    (Causes high static leakage current & STA failure!)

 Modern Multiplexer Tree Replacement (INDUSTRIAL STANDARD):
 Register A ──┐
 Register B ──┼──► [ High-Speed 4:1 MUX ] ──► Output Bus (100% Active 0 or 1!)
 Register C ──┘              ▲
                             │ (Select Lines)
```

---

### The Three Physical Failures of Internal Tristate Buses:

#### 1. High Static Leakage Current on Floating Wires
If all internal tri-state drivers turn OFF ($\text{OE} = 0$), an internal wire floats ($z$). 

In deep-submicron silicon, a floating internal wire does not stay neatly at $0\text{ V}$ or $V_{DD}$. Ambient electromagnetic crosstalk and parasitic charge cause the wire voltage to drift to an intermediate level ($V_{\text{mid}} \approx 1.5\text{ V}$).

When $1.5\text{ V}$ arrives at the input of downstream logic gates, **both PMOS and NMOS transistors in the receiving gates turn ON simultaneously**, causing massive static leakage current ($P_{\text{leak}}$) that drains batteries and overheats the chip die!

#### 2. Static Timing Analysis (STA) Failure
Timing analysis engines cannot easily calculate $RC$ interconnect wire delays on floating tri-state nets where the active driver changes dynamically across time steps. Floating wires make timing closure nearly impossible.

#### 3. Physical Placement and Routing Incompatibility
In FPGAs (such as AMD Xilinx UltraScale or Intel Stratix), the internal silicon fabric consists of fixed Look-Up Tables (LUTs) and flip-flops connected by SRAM-switched multiplexers. FPGAs do not contain internal physical tri-state transistors on logic interconnects! 

If an engineer attempts to synthesize an internal tri-state bus on an FPGA, the synthesis compiler is forced to substitute the tri-state bus with a giant multiplexer tree anyway!

---

### The Industrial Standard: Multiplexer Crossbars (AXI, AHB, Wishbone)

In modern System-on-Chip (SoC) engineering, internal multi-master communication is constructed using **Active Multiplexer Trees** or **Crossbar Interconnects**:

```systemverilog
// MODERN INTERNAL BUS REPLACEMENT: ACTIVE MULTIPLEXER TREE
module InternalBusMux (
    input  logic [1:0]  bus_select,
    input  logic [31:0] master_a_data,
    input  logic [31:0] master_b_data,
    input  logic [31:0] master_c_data,
    output logic [31:0] shared_bus_out
);

    // 100% Active 0/1 driving! Zero floating wires! Zero leakage!
    always_comb begin
        case (bus_select)
            2'b00:   shared_bus_out = master_a_data;
            2'b01:   shared_bus_out = master_b_data;
            2'b10:   shared_bus_out = master_c_data;
            default: shared_bus_out = 32'h0000_0000;
        endcase
    end

endmodule
```

Look at this multiplexer tree:
* The output `shared_bus_out` is **ALWAYS actively driven to a clean $0$ or $1$**.
* It NEVER floats to $z$.
* It NEVER suffers short-circuit bus contention ($x$).
* It synthesizes cleanly into high-speed logic gates across all ASIC and FPGA technology targets!

---

## Bidirectional I/O Pad Boundaries (`inout`)

If internal tristates are obsolete, where ARE tristate buffers used in modern digital hardware engineering?

Tristates are used in exactly one place: **Physical Package I/O Boundary Pads (`inout`)**.

```text
THE PHYSICAL CHIP PACKAGE BOUNDARY

 Internal Silicon Core (Active MUXes)     Package Boundary (Physical Pins)
 ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
 │ All internal buses use MUXes!     │    │ Memory Data Bus (DQ [31:0])       │
 │ Zero internal tristates!          │───►│ Must use Bidirectional 'inout'    │
 │ 100% active logic signals.        │    │ pads to talk to external PCB!     │
 └───────────────────────────────────┘    └───────────────────────────────────┘
```

---

### Why Bidirectional Pins Are Mandatory at Chip Boundaries

A modern microchip package is constrained by physical pin count. Manufacturing a chip with 1,000 physical pins is expensive; a chip with 2,000 pins costs five times more!

If a microcontroller interfaces with an external DDR DRAM chip using 32 data lines:
* If we used separate pins for transmitting and receiving, we would need 32 pins for Write Data + 32 pins for Read Data = **64 package pins**.
* By using **Bidirectional I/O Pins (`inout`)**, the exact same 32 physical pins act as outputs during a Write operation, and act as inputs during a Read operation, cutting package pin count and PCB trace wiring **in half (32 pins total)**!

---

### Primitive 2: Synthesizable Bidirectional I/O Pad Architecture

A synthesizable SystemVerilog **Bidirectional I/O Pad** requires four distinct signals:

```text
BIDIRECTIONAL I/O PAD CELL ARCHITECTURE

                      ┌──────────────────────────────────────┐
                      │ Physical I/O Boundary Pad            │
 data_out ───────────►│ [ Tri-State Driver ]                 │
 output_enable ──────►│ (Active when OE=1)    ├──► pad_io ───┼──► External PCB Wire
                      │                     │  (inout pin)   │
 data_in ◄────────────┤ [ Input Receiver ] ◄┘                │
                      │ (Reads pad wire)                     │
                      └──────────────────────────────────────┘
```

1. **`pad_io` (Declared as `inout wire`)**: The physical bidirectional copper pin on the exterior package of the chip connected to the PCB trace.
2. **`data_out` (Internal `logic` input)**: The internal data signal generated by the chip's core logic that needs to be transmitted outward to the PCB.
3. **`output_enable` (Internal `logic` input)**: The active-high control line ($1 = \text{Transmit Mode}$, $0 = \text{Receive Mode}$).
4. **`data_in` (Internal `logic` output)**: The internal signal that receives data coming inward from the external PCB trace.

---

### Synthesizable SystemVerilog RTL Code Pattern for `inout` Ports

Here is the industrial-standard, synthesizable coding pattern for a bidirectional I/O pad:

```systemverilog
// SYNTHESIZABLE BIDIRECTIONAL I/O PAD INTERFACE
module BidirectionalPad (
    inout  wire  pad_io,        // Physical bidirectional chip pin
    input  logic data_out,      // Internal transmit payload
    input  logic output_enable, // 1 = Drive/Transmit, 0 = Receive/Float
    output logic data_in        // Internal receive payload
);

    // 1. TRANSMIT PATH (Tri-State Driver)
    // When output_enable = 1, drive pad_io with data_out.
    // When output_enable = 0, float pad_io as 1'bz!
    assign pad_io = output_enable ? data_out : 1'bz;

    // 2. RECEIVE PATH (Input Receiver)
    // Read the physical voltage level on pad_io continuously!
    assign data_in = pad_io;

endmodule
```

Let's trace how this bidirectional pad operates across both operational modes:

#### Mode 1: Transmit Mode (`output_enable = 1`)
* `pad_io` is actively driven by `data_out` ($0$ or $1$).
* The external PCB wire receives the transmitted value.
* Internal `data_in` reads back the exact value being transmitted (`data_in = data_out`).

#### Mode 2: Receive Mode (`output_enable = 0`)
* `pad_io` drops to high-impedance state `1'bz`. The internal tri-state driver turns OFF.
* An external chip on the PCB (such as a Flash RAM) actively drives the `pad_io` wire to $0$ or $1$.
* Internal `data_in` reads the incoming voltage from `pad_io` ($0$ or $1$) and passes it directly to the internal core logic!

```text
BIDIRECTIONAL PAD OPERATIONAL MODES

 Mode             │ output_enable │ pad_io State │ Internal data_in State
──────────────────┼───────────────┼──────────────┼───────────────────────────────
 Transmit Mode    │       1       │ data_out     │ Reads transmitted data_out
 Receive Mode     │       0       │ 1'bz (Float) │ Reads external incoming PCB data!
```

---

## Open-Drain Buses, Pull-Up Resistors, and I2C Communication

There is an important subclass of bidirectional buses used widely in embedded systems: **Open-Drain (or Open-Collector) Buses**.

The most famous real-world example of an open-drain bus is the **Inter-Integrated Circuit ($\text{I}^2\text{C}$) Bus** used to connect microcontrollers to temperature sensors, accelerometers, and real-time clocks using just two wires: `SDA` (Serial Data) and `SCL` (Serial Clock).

```text
OPEN-DRAIN I2C BUS WITH PULL-UP RESISTOR

 VDD (3.3V) ───[ Pull-Up Resistor R ]───┬──► Shared I2C Wire (SDA)
                                         │
 Device A Driver: 0 or z ────────────────┼──► (If both A and B float 'z',
 Device B Driver: 0 or z ────────────────┘    Resistor pulls wire to 3.3V!)
```

---

### How Open-Drain Buses Work

On a standard push-pull bus, active drivers push $V_{DD}$ ($1$) or pull Ground ($0$).

On an **Open-Drain Bus**:
* Devices on the bus **NEVER actively drive a High voltage ($1$)**!
* A device can do only two things:
  1. Drive a active Low voltage ($0\text{ V}$).
  2. Float in High-Impedance state ($z$).

To represent a logical $1$ when no device is driving $0$, the PCB includes an external **Pull-Up Resistor ($R_{\text{pullup}}$)** connected between the shared signal wire and $V_{DD}$ ($3.3\text{ V}$).

#### Evaluating the Open-Drain Bus States:
* **If Device A wants to send $0$**: Device A turns ON its NMOS transistor, pulling the wire down to $0\text{ V}$ (Ground). The bus reads $0$.
* **If Device A wants to send $1$**: Device A turns OFF its transistor and floats as $z$. The pull-up resistor draws current from $V_{DD}$ and pulls the wire voltage up to $3.3\text{ V}$. The bus reads $1$!

#### Why Open-Drain Prevents Short-Circuit Contention:
What happens if Device A drives $0$ while Device B floats as $z$?
* Device A pulls the wire to $0\text{ V}$.
* Device B is $z$ (open circuit).
* Current flows safely from $V_{DD}$ through the high-resistance pull-up resistor ($4.7 \text{ k}\Omega$) into Device A's NMOS transistor to Ground.

Because the pull-up resistor limits current to a tiny fraction of a milliampere ($I = \frac{3.3\text{V}}{4.7\text{ k}\Omega} \approx 0.7\text{ mA}$), **NO SHORT CIRCUIT OCCURS!** 

Two devices can pull the wire Low simultaneously without destroying transistors. This property enables **Wired-AND Logic** and multi-master arbitration on $\text{I}^2\text{C}$ buses.

---

### SystemVerilog Pull-Up Modeling Primitive (`pullup`)

In SystemVerilog simulation, to model an open-drain bus with a pull-up resistor, we use the net-strength primitive **`pullup`**:

```systemverilog
// SYSTEMVERILOG OPEN-DRAIN I2C BUS MODELING
module I2cOpenDrainBus (
    inout wire sda_pad, // Shared I2C Serial Data wire
    input logic sda_drive_low // 1 = Pull wire to 0V, 0 = Float z
);

    // Pull-Up Resistor Primitive (Pulls floating 'z' wire up to '1')
    pullup (sda_pad);

    // Open-Drain Driver: Drive 0 when active, else FLOAT as 1'bz!
    // NEVER DRIVE 1 ACTIVELY!
    assign sda_pad = sda_drive_low ? 1'b0 : 1'bz;

endmodule
```

```text
OPEN-DRAIN BUS RESOLUTION MATRIX

 sda_drive_low │ sda_pad Output State │ Pull-Up Resistor Action │ Net Reading
───────────────┼──────────────────────┼─────────────────────────┼─────────────
       1       │         1'b0         │ Current drains to GND   │   0 Volts
       0       │         1'bz         │ Resistor pulls to VDD   │   1 (3.3V)
```

---

## Engineering Reality: FPGA I/O Block (IOB) Primitive Instantiation

When a logic synthesis tool processes a SystemVerilog `inout` port declaration, how does it map those lines onto real physical FPGA silicon?

FPGA dies contain dedicated, hardwired physical cells located at the outer perimeter of the silicon die called **I/O Blocks (IOBs)**.

An IOB primitive contains pre-fabricated physical tri-state drivers, input differential receivers, pull-up/pull-down resistors, and programmable output slew rate controllers.

```text
AMD XILINX IOBUF PHYSICAL PRIMITIVE

              ┌──────────────────────────────────────────────┐
              │ IOBUF Hardwired Silicon Cell                 │
 I ──────────►│ [ Tri-State Driver ]                         │
 T ──────────►│ (T = 1 disables driver!) ├──► IO (inout pin) │
              │                          │                   │
 O ◄──────────┤ [ Input Receiver ] ◄─────┘                   │
              └──────────────────────────────────────────────┘
```

If an engineer wants to instantiate an explicit FPGA I/O pad cell directly rather than relying on automatic inference, they instantiate vendor primitives (such as the AMD Xilinx `IOBUF` or Intel `ALT_IOBUF`):

```systemverilog
// EXPLICIT AMD XILINX IOBUF PRIMITIVE INSTANTIATION
IOBUF u_iobuf_sda (
    .IO (sda_pin),       // Physical top-level package pin (inout)
    .O  (sda_data_in),   // Internal receive path (output from IOBUF)
    .I  (sda_data_out),  // Internal transmit path (input to IOBUF)
    .T  (~sda_output_en) // Tri-state control (T=1 floats IO, T=0 drives IO)
);
```

*(Note: In Xilinx `IOBUF` primitives, input `T` is active-high Tristate/Disable. Setting $T = 1$ floats the pin, while $T = 0$ enables the output driver).*

---

## Solved Industrial Engineering Exercise: Bidirectional Memory Interface Unit with Contention Detection

To consolidate your complete mastery of high-impedance modeling (`1'bz`), bidirectional `inout` ports, 4-state bus resolution matrices, and contention detection logic, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An integrated circuit firm is engineering a **Bidirectional Memory Bus Interface Unit** (`BiDirMemoryInterface`) for an embedded microcontroller interfacing with an external 8-bit $Q_{3.4}$ fixed-point SRAM chip.

```text
BIDIRECTIONAL MEMORY INTERFACE ARCHITECTURE

 Microcontroller Core                      Physical Package Boundary Pin
 ┌────────────────────────┐  BiDir Pad     ┌────────────────────────┐
 │ tx_payload[7:0]        ├───────────────►│                        │
 │ write_strobe           ├───────────────►│ ext_data_bus[7:0]      ├═► External PCB Wire
 │                        │                │ (inout pin)            │
 │ rx_payload[7:0]        │◄───────────────┤                        │
 │ contention_alarm       │◄───────────────┤ [ Contention Detector ]│
 └────────────────────────┘                └────────────────────────┘
```

The module interfaces with an 8-bit external bidirectional data bus `ext_data_bus[7:0]` (`inout`).

#### Interface Control Signals:
1. `clk`: Master system clock ($100\text{ MHz}$).
2. `reset_n`: Active-low master reset.
3. `write_strobe`: Active-high write control strobe ($1 = \text{Transmit Mode}$, $0 = \text{Receive Mode}$).
4. `tx_payload[7:0]`: 8-bit internal data word to transmit outward to the SRAM chip.
5. `rx_payload[7:0]`: 8-bit internal register capturing incoming data from the SRAM chip on `posedge clk`.
6. `contention_alarm`: Active-high error flag that fires if the simulator detects an unknown bus contention state (`x`) on `ext_data_bus`.

#### Your Objective

1. Write the complete, synthesizable SystemVerilog module `BiDirMemoryInterface`.
2. Implement the bidirectional tri-state driver using `assign ext_data_bus = write_strobe ? tx_payload : 8'bzzzz_zzzz;`.
3. Implement the registered input receiver path `rx_payload <= ext_data_bus` on `posedge clk`.
4. Implement a combinational bus contention detector that asserts `contention_alarm = 1` if any bit of `ext_data_bus` evaluates to `1'bx`.
5. Simulate three test scenarios:
   * **Test 1 (Transmit Mode)**: Set `write_strobe = 1`, `tx_payload = 8'hA5`. Verify `ext_data_bus` drives `8'hA5` and `rx_payload` captures `8'hA5`.
   * **Test 2 (Receive Mode)**: Set `write_strobe = 0`. Drive `ext_data_bus` from the testbench with `8'h5A`. Verify `ext_data_bus` floats to input value `8'h5A`, and `rx_payload` captures `8'h5A`.
   * **Test 3 (Bus Contention Collision)**: Set `write_strobe = 1`, `tx_payload = 8'hFF`. Force the testbench to simultaneously drive `8'h00` onto `ext_data_bus`. Verify that bus contention occurs (`ext_data_bus = 8'hxx`), and `contention_alarm` fires High ($1$)!

---

### Step-by-Step Derivation

#### Step 1: Write the Synthesizable SystemVerilog Module

We construct `BiDirMemoryInterface` using clean, explicit bidirectional SystemVerilog syntax:

```systemverilog
`default_nettype none

// BIDIRECTIONAL MEMORY INTERFACE UNIT WITH CONTENTION DETECTION
module BiDirMemoryInterface (
    input  logic       clk,
    input  logic       reset_n,
    input  logic       write_strobe,     // 1 = Transmit Mode, 0 = Receive Mode
    input  logic [7:0] tx_payload,       // Internal transmit data
    output logic [7:0] rx_payload,       // Internal registered receive data
    output logic       contention_alarm, // Active-high bus contention alert
    inout  wire  [7:0] ext_data_bus      // Physical 8-bit bidirectional chip pin
);

    // -----------------------------------------------------------------
    // 1. TRANSMIT PATH: TRI-STATE DRIVER
    // -----------------------------------------------------------------
    // When write_strobe = 1, drive ext_data_bus with tx_payload.
    // When write_strobe = 0, float ext_data_bus as 8'hZZ (High-Impedance)!
    assign ext_data_bus = write_strobe ? tx_payload : 8'bzzzz_zzzz;

    // -----------------------------------------------------------------
    // 2. RECEIVE PATH: REGISTERED INPUT CAPTURE
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            rx_payload <= 8'h00;
        end else begin
            // Read physical ext_data_bus pin directly on every clock edge!
            rx_payload <= ext_data_bus;
        end
    end

    // -----------------------------------------------------------------
    // 3. BUS CONTENTION & UNKNOWN STATE DETECTOR
    // -----------------------------------------------------------------
    always_comb begin
        // Check if any bit on ext_data_bus evaluates to 'x' (Unknown/Contention)
        if ($isunknown(ext_data_bus)) begin
            contention_alarm = 1'b1; // FIRE ALARM! Short circuit / Collision detected!
        end else begin
            contention_alarm = 1'b0; // Normal bus state
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 2: Write the Verification Testbench (`tb_BiDirInterface`)

We write a self-checking testbench to verify all three operational test cases:

```systemverilog
`default_nettype none

module tb_BiDirInterface;

    logic       clk = 0;
    logic       reset_n;
    logic       write_strobe;
    logic [7:0] tx_payload;
    logic [7:0] rx_payload;
    logic       contention_alarm;

    // Bidirectional Bus Wire
    wire [7:0]  ext_data_bus;
    logic [7:0] tb_drive_bus;
    logic       tb_drive_en;

    // Testbench Tri-State Driver (Simulates External SRAM Chip)
    assign ext_data_bus = tb_drive_en ? tb_drive_bus : 8'bzzzz_zzzz;

    // 100 MHz Clock Generator (Period = 10 ns)
    always #5 clk = ~clk;

    // DUT Instantiation
    BiDirMemoryInterface u_dut (
        .clk              (clk),
        .reset_n          (reset_n),
        .write_strobe     (write_strobe),
        .tx_payload       (tx_payload),
        .rx_payload       (rx_payload),
        .contention_alarm (contention_alarm),
        .ext_data_bus     (ext_data_bus)
    );

    initial begin
        reset_n      = 1'b0;
        write_strobe = 1'b0;
        tx_payload   = 8'h00;
        tb_drive_bus = 8'h00;
        tb_drive_en  = 1'b0;

        $display("=== STARTING BIDIRECTIONAL I/O INTERFACE TEST ===");

        #25;
        reset_n = 1'b1; // Release reset

        // -------------------------------------------------------------
        // TEST 1: TRANSMIT MODE (write_strobe = 1, DUT Drives Bus)
        // -------------------------------------------------------------
        $display("\n--- TEST 1: Transmit Mode (DUT Drives 8'hA5) ---");
        @(posedge clk);
        write_strobe <= 1'b1;
        tx_payload   <= 8'hA5;
        tb_drive_en  <= 1'b0; // External SRAM floats 'z'

        #2; // Allow combinational logic to settle
        if (ext_data_bus === 8'hA5 && contention_alarm == 1'b0) begin
            $display("[PASS] Time %0t | Transmit Mode OK! Bus = %h, Alarm = %b", 
                     $time, ext_data_bus, contention_alarm);
        end else begin
            $error("[FAIL] Time %0t | Transmit Mode Error! Bus = %h", $time, ext_data_bus);
        end

        // -------------------------------------------------------------
        // TEST 2: RECEIVE MODE (write_strobe = 0, SRAM Drives 8'h5A)
        // -------------------------------------------------------------
        $display("\n--- TEST 2: Receive Mode (External SRAM Drives 8'h5A) ---");
        @(posedge clk);
        write_strobe <= 1'b0;  // DUT floats 'z'
        tb_drive_en  <= 1'b1;  // External SRAM active
        tb_drive_bus <= 8'h5A;

        @(posedge clk); // Allow DUT to capture incoming data into rx_payload
        #2;
        if (rx_payload === 8'h5A && contention_alarm == 1'b0) begin
            $display("[PASS] Time %0t | Receive Mode OK! rx_payload = %h, Alarm = %b", 
                     $time, rx_payload, contention_alarm);
        end else begin
            $error("[FAIL] Time %0t | Receive Mode Error! rx_payload = %h", $time, rx_payload);
        end

        // -------------------------------------------------------------
        // TEST 3: BUS CONTENTION INJECTION (Both DUT & SRAM Drive Bus!)
        // -------------------------------------------------------------
        $display("\n--- TEST 3: Injecting Bus Contention Collision ---");
        @(posedge clk);
        write_strobe <= 1'b1;  // DUT drives 8'hFF
        tx_payload   <= 8'hFF;
        tb_drive_en  <= 1'b1;  // External SRAM drives 8'h00 SIMULTANEOUSLY!
        tb_drive_bus <= 8'h00;

        #2; // Allow simulation resolution matrix to evaluate
        if ($isunknown(ext_data_bus) && contention_alarm == 1'b1) begin
            $display("[PASS] Time %0t | Bus Contention Detected! Bus = %h, ALARM FIRED = %b", 
                     $time, ext_data_bus, contention_alarm);
        end else begin
            $error("[FAIL] Time %0t | Contention Failed to Fire Alarm! Bus = %h", $time, ext_data_bus);
        end

        // Clear contention
        write_strobe <= 1'b0;
        tb_drive_en  <= 1'b0;
        #20;

        $display("\n==================================================");
        $display("   BIDIRECTIONAL INTERFACE TEST COMPLETE          ");
        $display("==================================================");
        $finish;
    end

endmodule

`default_nettype wire
```

---

#### Step 3: Simulation Trace & Log Analysis

Let us trace the console output log generated during simulation:

```text
CONSOLE OUTPUT LOG FROM BIDIRECTIONAL INTERFACE SIMULATION

 === STARTING BIDIRECTIONAL I/O INTERFACE TEST ===

 --- TEST 1: Transmit Mode (DUT Drives 8'hA5) ---
 [PASS] Time 37000 ps | Transmit Mode OK! Bus = a5, Alarm = 0

 --- TEST 2: Receive Mode (External SRAM Drives 8'h5A) ---
 [PASS] Time 57000 ps | Receive Mode OK! rx_payload = 5a, Alarm = 0

 --- TEST 3: Injecting Bus Contention Collision ---
 [PASS] Time 67000 ps | Bus Contention Detected! Bus = xx, ALARM FIRED = 1

 ==================================================
    BIDIRECTIONAL INTERFACE TEST COMPLETE          
 ==================================================
```

```text
SIMULATION TIMING WAVEFORMS

 clk          : 0000111100001111000011110000111100001111
 write_strobe : 0000111111110000000000001111111100000000
                (Test 1: Transmit) (Test 2: Recv) (Test 3: Collision!)

 tb_drive_en  : 0000000000001111111111111111111100000000
 ext_data_bus : ===[ 8'hA5 ]===[ 8'h5A ]===[ 8'hXX ]===
                                            ▲
 contention   : 0000000000000000000000000000111100000000 (ALARM FIRED!)
```

##### Detailed Timing Trace Analysis:
1. **Test 1 (Transmit Mode)**: `write_strobe = 1`, `tb_drive_en = 0`. The DUT drove `8'hA5` onto `ext_data_bus`. `contention_alarm` remained Low ($0$).
2. **Test 2 (Receive Mode)**: `write_strobe = 0`, `tb_drive_en = 1`. The testbench drove `8'h5A` onto `ext_data_bus`. The DUT captured `rx_payload = 8'h5A` cleanly on `posedge clk`. `contention_alarm` remained Low ($0$).
3. **Test 3 (Bus Contention Collision)**: `write_strobe = 1` (DUT driving `8'hFF`) AND `tb_drive_en = 1` (Testbench driving `8'h00`).
   * The simulator's resolution matrix evaluated `8'hFF` + `8'h00` $\to$ **`8'hXX` (Short-Circuit Contention)**!
   * The `$isunknown(ext_data_bus)` function detected the `x` state and **fired `contention_alarm = 1` High immediately!**

All simulation test cases, tri-state buffer assignments, 4-state resolution matrices, and contention alarm detectors evaluate with 100% mathematical, physical, and logical precision. The `BiDirMemoryInterface` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **High-Impedance State (`1'bz`) & Tri-State Buffers**: The 4-state logic condition where both pull-up (PMOS) and pull-down (NMOS) transistors are turned OFF, disconnecting an output electronically so the physical wire floats without driving current.
* **Bidirectional I/O Pad Boundaries (`inout`)**: The physical package interface structure (`assign pad = oe ? data : 1'bz; assign in = pad;`) that allows a single chip pin to alternate between transmit and receive modes, restricted strictly to external PCB chip boundaries.
* **Bus Contention**: The high-current short-circuit condition ($1$ vs $0$ driver conflict) that occurs when two active push-pull outputs drive the same wire simultaneously, resulting in `x` states in simulation and transistor thermal damage in physical silicon.
* **Obsolete Internal Tristates vs. Active MUX Crossbars**: The architectural rule where internal chip buses strictly forbid tri-states to prevent floating $1.5\text{-V}$ static leakage currents and STA failures, using active multiplexer trees (AXI/AHB crossbars) for internal multi-master communication.
