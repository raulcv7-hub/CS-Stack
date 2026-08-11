---
title: "SystemVerilog Interfaces and Packed Structs: Bus Bundling, Modports, and Hardware Encapsulation"
---

# SystemVerilog Interfaces and Packed Structs: Bus Bundling, Modports, and Hardware Encapsulation

## The Wiring Spaghetti Crisis of Unbundled Port Interconnects

When a digital system scales from a simple isolated arithmetic block to a modern System-on-Chip (SoC) architecture, the central hardware design challenge shifts from building logic gates to managing interconnect complexity. A modern processor core does not communicate with a memory controller, a graphics accelerator, or a peripheral bus using two or three simple wires. They communicate through sophisticated, multi-signal bus protocols.

Consider what happens when a Master module (such as a Central Processing Unit) interfaces with a Slave module (such as a High-Speed Static RAM Controller). To execute a single memory read or write transaction, the two modules must exchange dozens of individual signals:

* A multi-bit memory address bus (e.g., 32 bits).
* A multi-bit write data bus (e.g., 32 bits).
* A multi-bit read data bus (e.g., 32 bits).
* Byte-enable strobe signals (e.g., 4 bits).
* Bus request, grant, and acknowledge handshakes (e.g., `valid`, `ready`, `ack`).
* Transaction attribute flags (e.g., `read_write_n`, `burst_length`, `cacheable`, `protection_level`).

In traditional, legacy hardware description languages, every single one of these signals must be declared as an individual port on the Master module, declared again as an individual port on the Slave module, and declared a third time as an individual interconnect wire in the parent module that joins them together.

```text
THE INDIVIDUAL WIRE SPAGHETTI CRISIS (UNBUNDLED PORTS)

  Master Module (CPU)                             Slave Module (SRAM)
 ┌──────────────────┐  bus_addr[31:0] (32 Wires) ┌──────────────────┐
 │                  ├───────────────────────────►│                  │
 │                  │  bus_wdata[31:0] (32 Wires)│                  │
 │                  ├───────────────────────────►│                  │
 │                  │  bus_rdata[31:0] (32 Wires)│                  │
 │                  │◄───────────────────────────┤                  │
 │                  │  bus_byte_en[3:0] (4 Wires)│                  │
 │                  ├───────────────────────────►│                  │
 │                  │  bus_req (1 Wire)          │                  │
 │                  ├───────────────────────────►│                  │
 │                  │  bus_ack (1 Wire)          │                  │
 │                  │◄───────────────────────────┤                  │
 └──────────────────┘                            └──────────────────┘
   Over 100 Individual Copper Traces Hand-Wired Line by Line!
```

This unbundled, line-by-line port wiring approach introduces three major physical engineering failure modes in large-scale hardware development:

1. **The Interconnect Typo Hazard**: When connecting over a hundred individual wires between two modules, it is remarkably easy for a human engineer to make a minor typing error. Connecting `bus_wdata` to `bus_rdata`, or accidentally swapping two control lines, creates silent logic failures or physical bus contention. The hardware compiler may not throw a syntax error if the bit widths match, leaving the bug hidden until deep into simulation or physical testing.
2. **The Refactoring Bottleneck**: Suppose the system architecture team decides to upgrade the memory protocol to support transaction security flags, requiring two new control signals (`prot_level[1:0]`). In an unbundled design, every single module in the entire chip hierarchy that touches or routes the memory bus must have its port list manually edited to add these two new wires. If your design contains 50 sub-modules connected to the bus, you must open and modify 50 separate SystemVerilog source files!
3. **Signal Directionality Reversals**: On a complex bus, some signals flow from Master to Slave (like addresses and write data), while others flow from Slave to Master (like read data and acknowledge flags). In unbundled port lists, if an engineer accidentally declares a `valid` handshake line as an `output` on both the Master and the Slave, both modules will attempt to drive the physical wire simultaneously. In physical silicon, this output-to-output conflict creates a high-current short circuit that burns transistors and degrades signal voltage.

To eliminate this interconnect complexity, modern digital engineering requires a method to bundle multi-bit data fields and multi-wire bus protocols into clean, single-port abstractions. 

SystemVerilog provides two hardware encapsulation primitives to solve this crisis: **Packed Structs (`struct packed`)** for bundling multi-bit data fields into contiguous hardware bit vectors, and **Interfaces (`interface`) with Modports (`modport`)** for encapsulating entire directional bus protocols into a single, strongly-typed connection bundle.

---

## The Automotive Wiring Harness: An Everyday Mental Model

To understand how packed structs and SystemVerilog interfaces simplify hardware design, let us step away from silicon chips and consider an everyday mechanical system: assembling an automobile in a manufacturing plant.

Imagine an engine compartment in a modern car. Inside the engine compartment are dozens of electrical sensors and actuators: oil pressure sensors, coolant temperature gauges, oxygen sensors, fuel injectors, and spark plug igniters. Nearby, mounted on the firewall, is the Engine Control Unit (ECU)—the central computer that reads the sensors and controls the engine.

```text
UNBUNDLED ENGINE WIRES VS MOLDED WIRING HARNESS

 Unbundled Loose Wires (Un-Encapsulated)   Molded Wiring Harness (SystemVerilog Interface)
 ┌──────────┐  50 Loose Wires  ┌──────────┐ ┌──────────┐   Single Harness  ┌──────────┐
 │ Sensors  ├───┬───┬───┬─────►│   ECU    │ │ Sensors  ├══════════════════►│   ECU    │
 └──────────┘   │   │   │      └──────────┘ └──────────┘   (Molded Plug)   └──────────┘
  Tangled, Error-Prone, Fragile               Clean, Keyed, One-Plug Connection
```

There are two ways the car manufacturer can connect the 50 sensor and actuator signals to the ECU:

### Approach A: The Loose Wire Method (Unbundled Ports)
The assembly worker receives a box containing 50 individual loose copper wires. The worker must manually strip the insulation off every wire, run them one by one through the engine bay, and screw them into individual terminals on the ECU board.

* **The Problem**: Installing 50 loose wires takes two hours per car. If the worker accidentally connects the oil pressure wire to the spark plug terminal, turning the key sends 12 volts into the pressure sensor, destroying the electronics. If the engineering team adds a new sensor next year, every car chassis must be re-drilled and re-wired by hand.

### Approach B: The Molded Wiring Harness (SystemVerilog Interface)
The manufacturer manufactures a single, pre-bundled **Wiring Harness Cable**. All 50 individual wires are enclosed inside a single protective plastic sheath. At the end of the cable is a single, molded plastic **Multi-Pin Plug**.

* **The Encapsulation**: The assembly worker does not touch 50 loose wires. The worker picks up the single harness cable and snaps the multi-pin plug into a matching socket on the ECU in three seconds!
* **Directional Keying (Modports)**: The plastic plug is molded with a specific physical shape (a keyway) so it can only be plugged in one way. The ECU socket is keyed as the "Master Controller" (inputs from sensors, outputs to injectors), while the engine block socket is keyed as the "Slave Unit" (outputs from sensors, inputs to injectors). You cannot plug it in backward.
* **Structured Data ID Cards (Packed Structs)**: Imagine the driver's license carried in your wallet. It contains a photo, a name, a birth date, an address, and an organ donor flag. Instead of handing a police officer five separate slips of paper, you hand them one plastic card. The information is laid out at fixed, standardized physical locations on the card.

This automotive wiring harness is the exact physical analogue of SystemVerilog's encapsulation primitives:
* The multi-field driver's license is a **Packed Struct (`struct packed`)**. It bundles multiple data fields into a single, fixed-layout bit vector.
* The molded multi-pin cable is a **SystemVerilog Interface (`interface`)**. It bundles multiple bus wires into a single port object.
* The keyed plastic plug shapes are **Modports (`modport`)**. They enforce strict input/output signal directions at each end of the cable.

---

## Mechanics of Packed Structs (`typedef struct packed`)

A **Struct (Structure)** is a composite data type that groups multiple named data fields together under a single variable name. 

In SystemVerilog, structs exist in two fundamentally different forms: **Unpacked Structs** and **Packed Structs**.

```text
UNPACKED VS PACKED STRUCT MEMORY LAYOUT

 Unpacked Struct (Abstract Variables)      Packed Struct (Contiguous Hardware Vector)
 ┌──────────────────────────────────┐      ┌──────────────────────────────────┐
 │ Field A: 8-Bit Logic Variable    │      │ Field A │ Field B  │ Field C     │
 ├──────────────────────────────────┤      │ [31:24] │ [23:8]   │ [7:0]       │
 │ Field B: 16-Bit Logic Variable   │      └─────────┴──────────┴─────────────┘
 ├──────────────────────────────────┤      ◄──── Contiguous 32-Bit Vector ────►
 │ Field C: 8-Bit Logic Variable    │      Can be assigned to a bus or wire!
 └──────────────────────────────────┘
```

### 1. Unpacked Structs vs. Packed Structs

* **Unpacked Structs (`struct`)**: A loose collection of independent variables. The simulation engine may store each field in separate, non-contiguous memory locations. Because the bits are not guaranteed to be contiguous in hardware, **an unpacked struct cannot be treated as a single binary vector**, cannot be assigned directly to an $N$-bit bus, and cannot be passed across standard multi-bit hardware ports.
* **Packed Structs (`struct packed`)**: A single, contiguous, multi-bit binary vector where every field is laid out at an exact, deterministic bit offset. In physical silicon, **a packed struct is 100% identical to a standard flat logic vector (`logic [N-1:0]`)**, but it allows engineers to access sub-fields by human-readable names instead of cryptic bit-slice numbers!

---

### 2. Declaring and Bit-Mapping a Packed Struct

To define a reusable packed struct, we use the `typedef struct packed` syntax:

```systemverilog
// Defining a Packed Struct for a 32-Bit Instruction Word
typedef struct packed {
    logic [5:0]  opcode;      // Field A: Bits [31:26] (6 bits)
    logic [4:0]  rs1_address;  // Field B: Bits [25:21] (5 bits)
    logic [4:0]  rs2_address;  // Field C: Bits [20:16] (5 bits)
    logic [4:0]  rd_address;   // Field D: Bits [15:11] (5 bits)
    logic [10:0] immediate;    // Field E: Bits [10:0]  (11 bits)
} instruction_word_t;
```

Let us analyze the physical bit layout of `instruction_word_t`:

The total width of a packed struct $W_{\text{struct}}$ is the exact mathematical sum of the widths of all its constituent fields:

$$
W_{\text{struct}} = \sum_{k=0}^{M-1} w_k
$$

Where:
* $W_{\text{struct}}$ is the total bit width of the packed struct vector.
* $M$ is the total number of fields declared inside the struct.
* $w_k$ is the bit width of the $k$-th individual field.

For our `instruction_word_t`:

$$
W_{\text{struct}} = 6 + 5 + 5 + 5 + 11 = 32 \text{ bits}
$$

```text
PACKED STRUCT BIT MAP (instruction_word_t)

 Field Name  │ opcode  │ rs1_address │ rs2_address │ rd_address │ immediate 
─────────────┼─────────┼─────────────┼─────────────┼────────────┼───────────
 Bit Bounds  │ [31:26] │   [25:21]   │   [20:16]   │  [15:11]   │  [10:0]   
 Field Width │ 6 Bits  │   5 Bits    │   5 Bits    │   5 Bits   │  11 Bits  
```

Notice the strict field placement rule: **The first field declared in the struct occupies the Most Significant Bits (MSB), and subsequent fields are packed left-to-right down to the Least Significant Bits (LSB).**

---

### 3. Hardware Operations on Packed Structs

Because a packed struct is physically a single contiguous vector, SystemVerilog permits all standard vector operations on it:

```systemverilog
instruction_word_t current_instruction; // Instantiate a packed struct variable
logic [31:0]       raw_bus_data;

// 1. Assigning individual named fields (High readability!)
assign current_instruction.opcode      = 6'b101011;
assign current_instruction.rs1_address = 5'b00010;

// 2. Vector Assignment: Assigning a flat 32-bit bus directly to the struct!
assign current_instruction = raw_bus_data; 

// 3. Bit-Slicing: Slicing the struct as if it were a raw logic [31:0] vector!
logic [15:0] lower_half;
assign lower_half = current_instruction[15:0]; 

// 4. Equality Comparison: Comparing two structs in a single operation
logic is_same_instruction;
assign is_same_instruction = (current_instruction == previous_instruction);
```

Look at how powerful this is! You get the readability of named object fields (`current_instruction.opcode`) alongside the physical synthesis performance of raw binary vectors (`raw_bus_data`).

---

## Mechanics of SystemVerilog Interfaces (`interface`)

While packed structs excel at bundling static data fields into a single vector, they do not solve the problem of **multi-wire directional bus protocols**. A bus contains signals that travel in opposite directions (Master-to-Slave vs. Slave-to-Master) and may include shared tri-state lines.

To encapsulate an entire multi-wire communication channel into a single, reusable software-like object, SystemVerilog provides the **Interface (`interface`)**.

### 1. Defining a SystemVerilog Interface

An `interface` is declared in its own source file, similar to a `module`, but instead of containing internal gates and logic, it contains the declarations of all physical wires that make up a bus protocol:

```systemverilog
// SYSTEMVERILOG INTERFACE DEFINITION: Bus Protocol Blueprint
interface memory_bus_if (
    input logic clk,     // Global clock line shared by the bus
    input logic reset_n  // Global active-low reset line
);
    // Bus Protocol Signals (Internal wires of the interface bundle)
    logic [31:0] address;
    logic [31:0] write_data;
    logic [31:0] read_data;
    logic [3:0]  byte_enable;
    logic        request;
    logic        acknowledge;
    logic        write_read_n;

endinterface : memory_bus_if
```

```text
SYSTEMVERILOG INTERFACE SIGNAL BUNDLE

 memory_bus_if
 ┌────────────────────────────────────────────────────────┐
 │ clk, reset_n (Global System Lines)                     │
 ├────────────────────────────────────────────────────────┤
 │ address[31:0]     write_data[31:0]    read_data[31:0]  │
 │ byte_enable[3:0]  request             acknowledge      │
 │ write_read_n                                           │
 └────────────────────────────────────────────────────────┘
```

---

### 2. Instantiating and Connecting Interfaces in Parent Modules

To use an interface in a hardware design:
1. The **Parent Module** instantiates the interface once, allocating the physical bus wires in silicon.
2. The Parent Module passes the **interface instance handle** as a single port connection to child modules!

```systemverilog
// PARENT MODULE: Connecting Master and Slave using a Single Interface Port
module SystemTop (
    input logic sys_clk,
    input logic sys_rst_n
);
    // 1. Instantiate the Interface (Allocates physical bus wires)
    memory_bus_if mem_bus (
        .clk     (sys_clk),
        .reset_n (sys_rst_n)
    );

    // 2. Instantiate Master Module (Passes mem_bus as a SINGLE port!)
    CpuMaster u_cpu (
        .bus (mem_bus) // All 10+ bus wires connected in ONE line!
    );

    // 3. Instantiate Slave Module (Passes mem_bus as a SINGLE port!)
    SramSlave u_sram (
        .bus (mem_bus) // All 10+ bus wires connected in ONE line!
    );

endmodule
```

Compare this `SystemTop` module to the unbundled wire spaghetti we saw at the beginning of the lesson! Over 100 individual wire connections have been compressed down to **a single interface handle (`.bus(mem_bus)`)**.

---

## Directional Safety and Protocol Enforcement: Modports (`modport`)

An interface bundle contains wires, but by default, an interface does not specify which connected module is allowed to drive which wire. 

If `CpuMaster` and `SramSlave` both receive the raw `mem_bus` interface, what prevents `SramSlave` from accidentally driving the `address` bus (which should only be driven by the Master)?

Without directional rules, an un-modported interface treats every internal wire as a bidirectional `inout` signal. If both modules attempt to drive a wire, simulation crashes with `1'bx` unknown conflicts, and synthesis tools generate invalid multi-driver logic.

To enforce strict, compile-time signal directionality on an interface, SystemVerilog provides **Modports (Module Ports)**.

```text
MODPORT DIRECTIONAL ENFORCEMENT

 Master Modport View (master)           Slave Modport View (slave)
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ output address            │          │ input  address            │
 │ output write_data         │ ───────► │ input  write_data         │
 │ input  read_data          │ ◄─────── │ output read_data          │
 │ output request            │ ───────► │ input  request            │
 │ input  acknowledge        │ ◄─────── │ output acknowledge        │
 └───────────────────────────┘          └───────────────────────────┘
   Master CANNOT drive read_data          Slave CANNOT drive address!
   (Enforced at Compile Time!)            (Enforced at Compile Time!)
```

### 1. Declaring Modports Inside an Interface

Modports are declared inside the `interface` definition block using the `modport` keyword. We define specific directional "views" for each role in the bus protocol:

```systemverilog
interface memory_bus_if (
    input logic clk,
    input logic reset_n
);
    logic [31:0] address;
    logic [31:0] write_data;
    logic [31:0] read_data;
    logic [3:0]  byte_enable;
    logic        request;
    logic        acknowledge;
    logic        write_read_n;

    // MODPORT 1: Master View (CPU / DMA Controller)
    modport master (
        input  clk, reset_n,
        output address, write_data, byte_enable, request, write_read_n,
        input  read_data, acknowledge
    );

    // MODPORT 2: Slave View (SRAM / DRAM / Peripheral)
    modport slave (
        input  clk, reset_n,
        input  address, write_data, byte_enable, request, write_read_n,
        output read_data, acknowledge
    );

endinterface : memory_bus_if
```

---

### 2. Using Modports in Module Header Port Declarations

When writing child modules, we specify the exact `modport` view in the module's port header:

```systemverilog
// CPU MASTER MODULE: Uses 'master' modport view
module CpuMaster (
    memory_bus_if.master bus // Receives interface restricted to Master directions
);
    always_comb begin
        // LEGAL: 'address' is an OUTPUT in master modport
        bus.address = 32'h0004_0000; 
        bus.request = 1'b1;
    end

    always_ff @(posedge bus.clk or negedge bus.reset_n) begin
        if (!bus.reset_n) begin
            // ...
        end else if (bus.acknowledge) begin // LEGAL: 'acknowledge' is an INPUT
            // Process incoming bus.read_data
        end
    end
endmodule

// SRAM SLAVE MODULE: Uses 'slave' modport view
module SramSlave (
    memory_bus_if.slave bus // Receives interface restricted to Slave directions
);
    always_ff @(posedge bus.clk or negedge bus.reset_n) begin
        if (!bus.reset_n) begin
            bus.acknowledge <= 1'b0;
        end else if (bus.request) begin // LEGAL: 'request' is an INPUT
            bus.read_data   <= 32'h1234_5678; // LEGAL: 'read_data' is an OUTPUT
            bus.acknowledge <= 1'b1;
        end
    end
endmodule
```

### Compile-Time Safety Enforcement

What happens if an engineer writing `SramSlave` makes a mistake and tries to assign a value to `bus.address`?

```systemverilog
// COMPILER ERROR DEMONSTRATION
module SramSlave (
    memory_bus_if.slave bus
);
    assign bus.address = 32'h0; // FATAL COMPILER ERROR!
endmodule
```

The SystemVerilog compiler checks `memory_bus_if.slave` and sees that `address` is declared as an `input` in the `slave` modport. 

The compiler immediately halts with a clear, unambiguous error:
`Error: Illegal assignment to input port 'bus.address' in module SramSlave.`

The bug is caught at compile time in 0.1 seconds, before you ever run a simulation or fabricate a physical chip!

---

## Engineering Reality: Synthesis Behavior, Unpacked Pitfalls, and Clock Domain Hazards

While packed structs and interfaces provide tremendous design abstractions, real-world EDA (Electronic Design Automation) tools and silicon synthesis compilers impose physical constraints that hardware engineers must manage.

### 1. Synthesis Netlist Flattening

A common question among beginners is: *"Do interfaces or packed structs remain as objects inside the physical silicon chip?"*

**No.** Logic synthesis tools (such as Synopsys Design Compiler or AMD Vivado Synthesis) perform **Netlist Flattening**. 

During synthesis, the compiler dissolves all interfaces, modports, and packed structs, converting them into standard, flat wires. A packed struct field `instruction.opcode[5:0]` becomes a flat physical copper trace named `instruction_opcode_5_`, `instruction_opcode_4_`, etc.

```text
SYNTHESIS NETLIST FLATTENING

 High-Level RTL (SystemVerilog)        Synthesized Physical Netlist (Gates)
 ┌───────────────────────────┐         ┌──────────────────────────────────┐
 │ bus.address = 32'hA5;     │ ──────► │ Flat Wires:                      │
 │ struct.opcode = 6'b101011;│         │   bus_address_31 ... bus_address_0 │
 └───────────────────────────┘         │   struct_opcode_5 .. struct_opcode_0│
                                       └──────────────────────────────────┘
  Abstract Interface & Struct           Physical Gate Inputs & Copper Traces
```

Interfaces and packed structs are **zero-overhead abstractions**. They simplify human reasoning and prevent wiring mistakes during RTL design, but they synthesize into the exact same minimal, high-speed gate networks as hand-wired code.

---

### 2. The Unpacked Struct Port Assignment Crash

A frequent pitfall occurs when engineers confuse packed structs (`struct packed`) with unpacked structs (`struct`).

```systemverilog
// UNPACKED STRUCT (NOT PACKED!)
typedef struct {
    logic [7:0] header;
    logic [7:0] body;
} unpacked_packet_t;

module PacketProcessor (
    input unpacked_packet_t in_pkt // CAUTION / UNFAVORABLE FOR RTL!
);
```

#### Why Unpacked Structs Fail in Hardware Synthesis:
Unpacked structs do not have a defined, contiguous bit layout. If you try to assign a 16-bit raw bus to `in_pkt`, or pass `in_pkt` across certain synthesis tool boundaries, compilation will fail with type mismatch errors.

**Engineering Mandate**: Always use **`typedef struct packed`** for any data structure that represents hardware registers, bus payloads, packet headers, or module ports.

---

### 3. The Hidden Clock-Domain Crossing (CDC) Hazard in Interfaces

A dangerous architectural mistake is bundling multiple clock signals or asynchronous reset lines inside a single interface object.

```systemverilog
// DANGEROUS CDC INTERFACE DESIGN
interface bad_async_if;
    logic clk_fast;   // 300 MHz Clock
    logic clk_slow;   // 50 MHz Clock
    logic [31:0] data; // Which clock domain does data belong to?!
endinterface
```

#### Why Hiding Clocks Inside Interfaces is Dangerous:
When Static Timing Analysis (STA) tools and Clock-Domain Crossing (CDC) linter tools analyze a chip design, they trace clock networks to verify setup and hold timing margins. 

If clocks from different frequency domains are hidden inside a shared interface bundle, linter tools may fail to recognize that signals crossing the interface are asynchronous. Unsynchronized data will enter state machines across clock boundaries, causing **Metastability** and non-deterministic hardware crashes.

**Best Practice**:
1. Keep global clocks (`clk`) and primary asynchronous resets (`reset_n`) as **explicit, standalone module ports**.
2. Use interfaces strictly to bundle **data buses, address buses, and control handshakes** that operate within a single, unified clock domain.

---

## Solved Industrial Engineering Exercise: Memory Bus Subsystem with Modport Handshakes

To consolidate your complete mastery of SystemVerilog packed structs, interfaces, modports, directional enforcement, and hierarchical system integration, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are designing an onboard **Command Processing Subsystem** for an autonomous drone's flight management computer.

The system consists of three components:
1. **A 32-Bit Packed Struct (`flight_command_t`)**: Encapsulates a structured flight command packet.
2. **A SystemVerilog Interface (`command_bus_if`)**: Encapsulates the multi-wire handshake protocol, including `master` and `slave` modports.
3. **A Master Controller (`FlightMaster`)** and **Slave Actuator (`ActuatorSlave`)**: Connected together inside a top-level module (`FlightSubsystemTop`).

```text
FLIGHT MANAGEMENT SUBSYSTEM ARCHITECTURE

  FlightMaster (Master)                           ActuatorSlave (Slave)
 ┌──────────────────────┐   command_bus_if       ┌──────────────────────┐
 │ Uses Modport:        ├═══════════════════════►│ Uses Modport:        │
 │   master             │  (Single Bus Port)     │   slave              │
 └──────────────────────┘                        └──────────────────────┘
```

#### Field Specifications for `flight_command_t` (32 Bits Total):
* `command_id` : Bits `[31:24]` (8 bits) — Unique instruction identifier.
* `target_altitude`: Bits `[23:12]` (12 bits) — Altitude target in meters.
* `engine_thrust`  : Bits `[11:4]`  (8 bits) — Thrust percentage ($0$ to $100\%$).
* `emergency_flag` : Bit  `[3]`     (1 bit)  — Emergency override active.
* `reserved`       : Bits `[2:0]`   (3 bits) — Unused padding bits.

#### Bus Protocol Specifications (`command_bus_if`):
* `clk` (input), `reset_n` (input).
* `cmd_packet` : 32-bit `flight_command_t` struct (Master $\to$ Slave).
* `cmd_valid`   : 1-bit signal (Master $\to$ Slave). Asserted High when `cmd_packet` is valid.
* `cmd_ready`   : 1-bit signal (Slave $\to$ Master). Asserted High when Slave is ready to accept a command.

#### Your Objective

1. Define the 32-bit packed struct `flight_command_t` and verify its exact bit width.
2. Define the interface `command_bus_if` with explicit `master` and `slave` modports.
3. Implement module `FlightMaster` that formats a `flight_command_t` packet and transmits it using the `master` modport.
4. Implement module `ActuatorSlave` that receives the packet via the `slave` modport and asserts `cmd_ready`.
5. Implement top-level module `FlightSubsystemTop` instantiating the interface and connecting both modules.
6. Verify mathematical, structural, and directional correctness.

---

### Step-by-Step Derivation

#### Step 1: Define the 32-Bit Packed Struct (`flight_command_t`)

We define the packed struct using `typedef struct packed` syntax:

```systemverilog
`default_nettype none

// 32-Bit Formatted Flight Command Packet
typedef struct packed {
    logic [7:0]  command_id;      // Bits [31:24] (8 bits)
    logic [11:0] target_altitude; // Bits [23:12] (12 bits)
    logic [7:0]  engine_thrust;   // Bits [11:4]  (8 bits)
    logic        emergency_flag;  // Bit  [3]     (1 bit)
    logic [2:0]  reserved;        // Bits [2:0]   (3 bits)
} flight_command_t;
```

##### Bit Width Verification:
$$W_{\text{struct}} = 8 + 12 + 8 + 1 + 3 = 32 \text{ bits}$$

```text
FLIGHT COMMAND PACKET BIT MAP

 Bit Range  │ [31:24] │    [23:12]     │    [11:4]     │    [3]   │  [2:0]   
 Field Name │ cmd_id  │ target_altitude│ engine_thrust │ emerg_flg│ reserved 
 Field Width│ 8 Bits  │    12 Bits     │    8 Bits     │  1 Bit   │  3 Bits  
```

---

#### Step 2: Define the Interface with Master and Slave Modports

We construct the `command_bus_if` interface containing the signals and directional views:

```systemverilog
interface command_bus_if (
    input logic clk,
    input logic reset_n
);
    flight_command_t cmd_packet; // Uses our 32-bit packed struct!
    logic            cmd_valid;
    logic            cmd_ready;

    // Master Modport: Transmits commands
    modport master (
        input  clk, reset_n,
        output cmd_packet, cmd_valid,
        input  cmd_ready
    );

    // Slave Modport: Receives commands and responds
    modport slave (
        input  clk, reset_n,
        input  cmd_packet, cmd_valid,
        output cmd_ready
    );

endinterface : command_bus_if
```

---

#### Step 3: Implement the Master Module (`FlightMaster`)

The Master formats a command packet and manages the `cmd_valid` / `cmd_ready` handshake:

```systemverilog
module FlightMaster (
    command_bus_if.master bus,
    input logic [7:0]  in_cmd_id,
    input logic [11:0] in_alt,
    input logic [7:0]  in_thrust,
    input logic        in_emerg
);
    always_ff @(posedge bus.clk or negedge bus.reset_n) begin
        if (!bus.reset_n) begin
            bus.cmd_valid  <= 1'b0;
            bus.cmd_packet <= '0; // Clear all struct bits to zero
        end else begin
            // Format packed struct fields using named notation
            bus.cmd_packet.command_id      <= in_cmd_id;
            bus.cmd_packet.target_altitude <= in_alt;
            bus.cmd_packet.engine_thrust   <= in_thrust;
            bus.cmd_packet.emergency_flag  <= in_emerg;
            bus.cmd_packet.reserved        <= 3'b000;

            bus.cmd_valid <= 1'b1; // Assert valid command
        end
    end

endmodule
```

---

#### Step 4: Implement the Slave Module (`ActuatorSlave`)

The Slave receives the packet, decodes the struct fields, and asserts `cmd_ready`:

```systemverilog
module ActuatorSlave (
    command_bus_if.slave bus,
    output logic [11:0] current_alt_setting,
    output logic [7:0]  current_thrust_setting,
    output logic        emerg_alarm
);
    always_ff @(posedge bus.clk or negedge bus.reset_n) begin
        if (!bus.reset_n) begin
            bus.cmd_ready          <= 1'b0;
            current_alt_setting    <= 12'h0;
            current_thrust_setting <= 8'h0;
            emerg_alarm            <= 1'b0;
        end else begin
            bus.cmd_ready <= 1'b1; // Always ready to receive

            // Read directly from incoming struct fields when valid
            if (bus.cmd_valid && bus.cmd_ready) begin
                current_alt_setting    <= bus.cmd_packet.target_altitude;
                current_thrust_setting <= bus.cmd_packet.engine_thrust;
                emerg_alarm            <= bus.cmd_packet.emergency_flag;
            end
        end
    end

endmodule
```

---

#### Step 5: Implement Top-Level Integration (`FlightSubsystemTop`)

We instantiate the interface and connect `FlightMaster` and `ActuatorSlave` using single-line interface port handles:

```systemverilog
module FlightSubsystemTop (
    input  logic        sys_clk,
    input  logic        sys_rst_n,
    input  logic [7:0]  ext_cmd_id,
    input  logic [11:0] ext_alt,
    input  logic [7:0]  ext_thrust,
    input  logic        ext_emerg,
    output logic [11:0] out_alt_setting,
    output logic [7:0]  out_thrust_setting,
    output logic        out_emerg_alarm
);
    // 1. Instantiate Interface
    command_bus_if cmd_bus (
        .clk     (sys_clk),
        .reset_n (sys_rst_n)
    );

    // 2. Instantiate Master
    FlightMaster u_master (
        .bus        (cmd_bus.master), // Connects Master modport
        .in_cmd_id  (ext_cmd_id),
        .in_alt     (ext_alt),
        .in_thrust  (ext_thrust),
        .in_emerg   (ext_emerg)
    );

    // 3. Instantiate Slave
    ActuatorSlave u_slave (
        .bus                    (cmd_bus.slave), // Connects Slave modport
        .current_alt_setting    (out_alt_setting),
        .current_thrust_setting (out_thrust_setting),
        .emerg_alarm            (out_emerg_alarm)
    );

endmodule

`default_nettype wire
```

---

### Sanity Check and Verification

Let us verify our hardware design through a step-by-step execution simulation trace.

#### Test Stimulus Values:
* `ext_cmd_id = 8'hA5` (`8'b1010_0101`)
* `ext_alt = 12'h3E8` ($1000_{10}$ meters altitude)
* `ext_thrust = 8'h50` ($80\%$ engine thrust)
* `ext_emerg = 1'b1` (Emergency override active!)

#### Simulation Trace Analysis:

1. **Cycle 1 (Reset Asserted `sys_rst_n = 0`)**:
   * Master resets: `bus.cmd_valid <= 0`, `bus.cmd_packet <= 0`.
   * Slave resets: `bus.cmd_ready <= 0`, outputs cleared to 0.

2. **Cycle 2 (Reset De-asserted, Master Formats Packet)**:
   * Master evaluates inputs and writes to packed struct `bus.cmd_packet`:
     * `cmd_packet.command_id` = `8'hA5`
     * `cmd_packet.target_altitude` = `12'h3E8`
     * `cmd_packet.engine_thrust` = `8'h50`
     * `cmd_packet.emergency_flag` = `1'b1`
     * `cmd_packet.reserved` = `3'b000`
   * Assembled 32-Bit Vector: `32'b10100101_001111101000_01010000_1_000` = `32'hA53E8508`.
   * Master asserts `bus.cmd_valid <= 1'b1`.

3. **Cycle 3 (Handshake Complete, Slave Reads Packet)**:
   * Slave detects `bus.cmd_valid == 1` AND `bus.cmd_ready == 1`.
   * Slave extracts struct fields directly:
     * `out_alt_setting` $\Leftarrow$ `cmd_packet.target_altitude` = `12'h3E8` ($1000_{10}$ meters).
     * `out_thrust_setting` $\Leftarrow$ `cmd_packet.engine_thrust` = `8'h50` ($80\%$).
     * `out_emerg_alarm` $\Leftarrow$ `cmd_packet.emergency_flag` = `1'b1` (ALARM ACTIVE!).

```text
EXECUTION SIMULATION SANITY CHECK

 Signal Name        │ Cycle 1 (Reset) │ Cycle 2 (Format) │ Cycle 3 (Handshake) │ Status
────────────────────┼─────────────────┼──────────────────┼─────────────────────┼───────────────
 bus.cmd_valid      │       0         │        1         │          1          │ Valid Asserted
 bus.cmd_ready      │       0         │        1         │          1          │ Ready Asserted
 bus.cmd_packet.alt │    12'h000      │     12'h3E8      │       12'h3E8       │ Struct Formatted
 out_alt_setting    │    12'h000      │     12'h000      │       12'h3E8       │ Captured!
 out_emerg_alarm    │       0         │        0         │          1          │ Alarm Triggered!
```

##### Directional Compile Verification:
If `ActuatorSlave` had attempted to drive `bus.cmd_valid = 1'b0`, the SystemVerilog compiler would have blocked compilation because `cmd_valid` is declared as an `input` in `modport slave`.

All fields, handshakes, modport directions, and struct bit alignments evaluate with 100% mathematical and structural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Packed Structs (`typedef struct packed`)**: A contiguous, strongly-typed multi-field hardware vector that allows individual data fields to be accessed by human-readable names (`struct.field`) while remaining 100% physically compatible with flat binary buses and port connections.
* **SystemVerilog Interfaces and Modports**: A hardware encapsulation architecture (`interface`) that bundles entire multi-wire bus protocols into a single port connection handle, enforcing compile-time signal directionality and driving safety at module boundaries through directional views (`modport`).
