# SystemVerilog Packages and Compilation Units: Centralized Type Management, Scope Resolution, and Global Namespace Organization

## The Pollution and Mismatch Nightmare of Duplicated Parameters and Include Guards

When engineering large-scale digital hardware systems—such as multi-core microprocessors, network routers, or graphics processing units—hardware design is divided among teams of engineers working on separate files and subsystems. Across these dozens or hundreds of RTL source files, modules must agree on a wide range of shared architectural definitions:

* Global bus widths (e.g., a 64-bit system data bus).
* System address space boundaries (e.g., base addresses for memory-mapped peripherals).
* Common enumerations (e.g., execution states, error codes, protocol transaction types).
* Structured packet headers (e.g., network frame headers, memory command structs).
* Pure mathematical helper functions (e.g., calculating the ceiling base-2 logarithm $\lceil \log_2(N) \rceil$ for address bus dimensioning).

In early, legacy Verilog design, there was no native mechanism to create a shared, global namespace for types and constants. Engineers were forced to rely on two flawed workarounds: **Local Parameter Duplication** or **Global Preprocessor Header Includes (`include "defines.vh"`)**.

```text
LEGACY VERILOG INGESTION HAZARDS

 Approach A: Copy-Pasted Local Parameters
 Module A (file_a.v)                     Module B (file_b.v)
 ┌───────────────────────────┐           ┌───────────────────────────┐
 │ parameter BUS_WIDTH = 32; │           │ parameter BUS_WIDTH = 64; │
 └───────────────────────────┘           └───────────────────────────┘
   (Human error: Parameter changed in one file, forgotten in another!)
   Result ──► Silent Type Mismatch & Corrupted Hardware Data Buses!

 Approach B: Preprocessor Macro Includes (`include "defines.vh")
 File A: `include "defines.vh"  ──► Defines `define BUS_WIDTH 32
 File B: `include "defines.vh"  ──► Overwrites `define BUS_WIDTH 64
   (Macro pollution affects all subsequently compiled files!)
   Result ──► Compilation-Order Dependency & Global Namespace Collision!
```

Both legacy approaches create major physical and operational failure modes in production hardware projects:

1. **Silent Synthesis Type Mismatches**: If an engineer manually copy-pastes `parameter DATA_WIDTH = 32;` into thirty different module source files, and months later the system architecture team expands the bus to 64 bits, every single file must be edited by hand. If one engineer forgets to update file number twenty-seven, the hardware compiler will build Module 27 with an 8-byte width while the surrounding modules use 16 bytes. The compiler connects the mismatched buses without an error, silently truncating the top bits and corrupting all data passing through Module 27.
2. **Preprocessor Macro Pollution (`define`)**: To avoid manual copy-pasting, engineers often used preprocessor macros: ``define BUS_WIDTH 32`. However, preprocessor macros possess no scope boundaries. They do not respect module boundaries, package boundaries, or block scopes. Once a macro file is included, its definitions pollute the global compiler environment for every file compiled after it. If a third-party IP block uses ``define BUS_WIDTH 128`, it will silently overwrite your local macro for all files processed afterward in the compilation script!
3. **Compilation-Order Dependency Failure**: Because preprocessor macros alter the global compiler state dynamically as files are read, the behavior of your hardware design becomes dependent on the exact order in which your build script passes files to the EDA tool (`vlog file_b.v file_a.v` vs `vlog file_a.v file_b.v`). Changing the file order in a build script can cause completely different hardware netlists to be generated.

To eliminate macro pollution, compilation-order dependencies, and copy-paste type mismatches, modern SystemVerilog provides a dedicated, strongly-typed hardware namespace primitive: **SystemVerilog Packages (`package ... endpackage`)** combined with explicit **Scope Resolution (`::`)** and **Compilation Unit Scope (`$unit`) Management**.

---

## The Central Municipal Registry: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of SystemVerilog packages, scope resolution, and compilation units, let us step away from microchips and picture a large city construction project where multiple independent construction firms are building a new downtown district.

Imagine fifty different contracting companies building skyscrapers, bridges, and subway stations across the city. All these construction projects need to agree on standardized measurements and building codes: standard door heights, concrete strength ratios, electrical outlet voltages, and pipe thread dimensions.

```text
UNORGANIZED LOCAL NOTES VS CENTRAL MUNICIPAL REGISTRY

 Unorganized Approach (Preprocessor Macros / Copy-Paste)
 Contractor A: Writes "Door Height = 2.0m" on a scrap of paper.
 Contractor B: Writes "Door Height = 2.2m" on a scrap of paper.
 Result ──► Carpenter installs Contractor B's door into Contractor A's frame.
            The door jams! Massive construction failure!

 Central Municipal Registry Approach (SystemVerilog Packages)
 Municipal Registry Office (package BuildingCodes_pkg)
  ├── Official Rule Book: DoorHeight = 2.1m
  └── Official Rule Book: ConcreteRatio = 4:1
 Contractors look up rules directly: BuildingCodes_pkg::DoorHeight
 Result ──► Every contractor uses the EXACT same, single-source definition!
```

There are two ways the city can manage these building codes:

### Approach A: The Scrap-Paper & Loudspeaker Method (Macros & Copy-Pasting)
Each contractor writes down their own guesses for building codes on loose scraps of paper. Or worse, a worker stands in the middle of the city with a loudspeaker shouting: *"Door Height is 2 meters!"*

* **The Problem**: If Contractor A uses a scrap of paper that says 2.0 meters, while Contractor B uses a scrap of paper that says 2.2 meters, a pre-fabricated door manufactured by Contractor B will not fit into the doorway built by Contractor A. The door jams, the frame breaks, and the building cannot be completed. If someone shouts a new number over the loudspeaker halfway through the day, workers who arrived in the afternoon build completely different structures than workers who arrived in the morning.

### Approach B: The Central Municipal Registry (SystemVerilog Packages)
The city establishes a single, central, fireproof **Municipal Building Code Registry** (`package BuildingCodes_pkg`). The registry publishes official, named rulebooks:
* `BuildingCodes_pkg::DoorHeight`
* `ElectricalCodes_pkg::StandardVoltage`
* `PlumbingCodes_pkg::PipeThreadPitch`

When Contractor A needs to know the door height, Contractor A opens the official municipal rulebook and looks up the exact entry: `BuildingCodes_pkg::DoorHeight`.

Notice what this central municipal registry achieves:

1. **Single Source of Truth**: The building code is defined in exactly one place inside the city registry. If the city updates `DoorHeight` from 2.0 meters to 2.1 meters in the registry, every contractor automatically reads the new value without altering their own local blueprints.
2. **Explicit Scope Citation (`::`)**: By citing `BuildingCodes_pkg::DoorHeight`, Contractor A makes it 100% clear where the rule originated. There is zero ambiguity about whether they are using the city building code or an internal company guideline.
3. **Namespace Isolation**: If the plumbing union has a rule called `PipeDiameter`, and the electrical union ALSO has a rule called `PipeDiameter`, they do not collide! They exist safely in separate rulebooks: `PlumbingCodes_pkg::PipeDiameter` vs `ElectricalCodes_pkg::PipeDiameter`.

This central municipal registry is the exact physical analogue of a **SystemVerilog Package**:
* The central registry building is the **SystemVerilog Package (`package`)**.
* Citing a specific page in a rulebook is **Explicit Scope Resolution (`pkg::item`)**.
* The unorganized scrap-paper notes are **Preprocessor Macros (`define`)**.
* The city-wide unorganized environment is the **Compilation Unit Scope (`$unit`)**.

---

## Mechanics of SystemVerilog Packages (`package ... endpackage`)

To master project-wide type management in SystemVerilog, we must dissect the formal mechanics of package declaration, item eligibility, and synthesis behavior.

### 1. Declaring a Package

A **SystemVerilog Package** is a named, top-level namespace block created using the `package` and `endpackage` keywords. It acts as a single, centralized repository for shared hardware definitions:

```systemverilog
// SYSTEMVERILOG PACKAGE DEFINITION: Centralized Type Repository
package router_config_pkg;

    // 1. Shared Local Parameters (Hardware Constants)
    parameter int unsigned DATA_WIDTH = 32;
    parameter int unsigned ADDR_WIDTH = 16;
    parameter int unsigned NUM_PORTS  = 4;

    // 2. Shared Enumerated Types
    typedef enum logic [1:0] {
        PKT_DATA    = 2'b00,
        PKT_CONTROL = 2'b01,
        PKT_SYNC    = 2 meb10,
        PKT_ERROR   = 2'b11
    } packet_type_e;

    // 3. Shared Packed Struct Definitions
    typedef struct packed {
        logic [ADDR_WIDTH-1:0] dest_address;  // Bits [31:16]
        logic [ADDR_WIDTH-1:0] src_address;   // Bits [15:0]
    } header_t;

    // 4. Pure Synthesizable Helper Functions
    function automatic logic [7:0] calc_header_parity(input header_t hdr);
        return ^hdr; // XOR-reduction over all header bits
    endfunction

endpackage : router_config_pkg
```

---

### 2. What Can (and CANNOT) Go Inside a Package?

A SystemVerilog package is designed to store **type definitions, parameters, and pure functions**, not physical hardware instances.

```text
PACKAGE ITEM ELIGIBILITY RULES

 ELIGIBLE PACKAGE ITEMS (Type Declarations) │ INELIGIBLE PACKAGE ITEMS (Hardware Instances)
────────────────────────────────────────────┼───────────────────────────────────────────────
 * typedef declarations (structs, enums)    │ ❌ Module Instantiations (e.g., Adder u_add)
 * parameter and localparam constants       │ ❌ Physical Net Assignments (assign bus = ...)
 * Pure synthesizable functions and tasks   │ ❌ Procedural Storage (always_ff, always_comb)
 * Import statements from other packages    │ ❌ Physical Interface Instances
```

#### Why Module Instantiations are Forbidden in Packages:
A package is a blueprint repository, not a physical chassis. You cannot instantiate a module (like a 32-bit multiplier) inside a package because a package does not represent a physical location on a silicon die. Modules must be instantiated inside parent modules, where their input and output ports can be wired to physical signals.

---

### 3. Synthesis Behavior of Packages

A common question among hardware engineers is: *"Does a package synthesize into physical logic gates?"*

**No.** A package occupies **zero physical silicon area by itself**.

When a synthesis compiler reads a package, it stores the package's type definitions, parameters, and functions in its internal symbol table. When a module uses a type or parameter from the package (for example, declaring a variable of type `header_t`), the synthesis tool substitutes the exact bit widths and constructs the physical gates **inside the module that used the type**.

If a package contains ten complex struct definitions, but your module only uses one of them, the remaining nine definitions are completely ignored during synthesis. There is zero silicon overhead for maintaining comprehensive, well-documented package libraries.

---

## Scope Resolution and Symbol Importing Mechanics

Once a package is defined, how do modules access the parameters, structs, and functions stored inside it?

SystemVerilog provides three distinct mechanisms for accessing package items:
1. **Direct Qualified Scope Resolution (`pkg::item`)**
2. **Explicit Item Import (`import pkg::item;`)**
3. **Wildcard Package Import (`import pkg::*;`)**

```text
PACKAGE SYMBOL ACCESS MECHANISMS

 1. Direct Scope Resolution (pkg::item)  ──► Safest! Zero namespace pollution.
 2. Explicit Item Import (import pkg::item) ──► Imports ONE specific symbol into local scope.
 3. Wildcard Import (import pkg::*)      ──► Candidate import for all symbols in package.
```

---

### Mechanism 1: Direct Qualified Scope Resolution (`pkg::item`)

The most robust, collision-proof method to access a package item is using the **Scope Resolution Operator (`::`)**. You write the package name, followed by `::`, followed by the item name:

```systemverilog
module PacketDecoder (
    // Direct Scope Resolution in Port Header!
    input  router_config_pkg::header_t in_header,
    output logic                       parity_error
);

    // Direct Scope Resolution in Module Body!
    router_config_pkg::packet_type_e pkt_type;

    assign parity_error = (router_config_pkg::calc_header_parity(in_header) != 8'h00);

endmodule
```

#### Why Direct Scope Resolution is the Gold Standard in Commercial Engineering:
1. **100% Collision-Proof**: Even if three different packages contain a parameter named `DATA_WIDTH`, writing `cpu_pkg::DATA_WIDTH` vs `gpu_pkg::DATA_WIDTH` guarantees zero namespace collision.
2. **Self-Documenting Code**: Any engineer reading the code instantly knows where `header_t` was defined without searching through include files or build scripts.
3. **Zero Scope Pollution**: No symbols are injected into the module's local namespace.

---

### Mechanism 2: Explicit Item Import (`import pkg::item;`)

If a module uses a specific package type dozens of times, typing `router_config_pkg::` before every single variable declaration can become tedious.

An **Explicit Item Import** brings a single, specific symbol from a package into the local module scope:

```systemverilog
module PacketDecoder (
    // Explicitly import ONLY header_t into this module's scope
    import router_config_pkg::header_t;
    
    input  header_t in_header, // Works directly without router_config_pkg:: prefix!
    output logic    parity_error
);
    // Local usage of imported type
    header_t local_header_buffer;

endsystemverilog
```

When you use an explicit import (`import router_config_pkg::header_t;`), **ONLY `header_t`** is brought into the module scope. Other items in `router_config_pkg` (such as `DATA_WIDTH` or `packet_type_e`) remain safely inside the package and must still be accessed via `::` or separate import statements.

---

### Mechanism 3: Wildcard Package Import (`import pkg::*;`)

A **Wildcard Package Import** uses the asterisk `*` to make ALL symbols inside a package available as candidate items for local scope resolution:

```systemverilog
module PacketDecoder
    // Wildcard import makes ALL items in router_config_pkg available locally
    import router_config_pkg::*;
(
    input  header_t in_header, // Automatically resolved from package!
    output logic    parity_error
);
    packet_type_e pkt_type;    // Automatically resolved from package!

    assign parity_error = (calc_header_parity(in_header) != 8'h00);

endmodule
```

#### The Internal Mechanics of Wildcard Imports: "Import-on-Demand"
A common misconception is that `import router_config_pkg::*;` dumps every single symbol from the package directly into your module, polluting the local namespace.

**In SystemVerilog, wildcard imports operate as "Import-on-Demand":**
* Placing `import router_config_pkg::*;` at the top of a module does NOT immediately import any symbols.
* When the compiler encounters an undeclared symbol in your module (such as `header_t`), it searches the wildcard-imported packages.
* If it finds `header_t` inside `router_config_pkg`, it imports **ONLY `header_t`** at that moment!
* If a symbol in the package is never referenced in your module, it is never imported into your local namespace.

---

## The Compilation Unit Scope (`$unit`) and Its Hidden Hazards

To master SystemVerilog scope organization, we must understand the implicit global scope known as the **Compilation Unit Scope (`$unit`)**.

### 1. What is the Compilation Unit Scope (`$unit`)?

In SystemVerilog, any parameter, typedef, or function declared **outside** of an explicit `module`, `interface`, or `package` block resides in the implicit global scope called **`$unit`**.

```systemverilog
// DANGEROUS OUTSIDE-OF-PACKAGE DECLARATION
// This typedef sits outside any package or module boundary!
// It enters the implicit Compilation Unit Scope ($unit)!
typedef struct packed {
    logic [7:0] data;
    logic       valid;
} global_payload_t;

module ReceiverNode (
    input global_payload_t in_payload // Reads from $unit scope
);
    ...
endmodule
```

```text
THE COMPILATION UNIT SCOPE ($unit) ARCHITECTURE

 File Compilation Scope ($unit)
 ┌─────────────────────────────────────────────────────────────┐
 │ Outer Declarations (Outside module/package) enter $unit!     │
 │                                                             │
 │ ┌───────────────────────┐       ┌─────────────────────────┐ │
 │ │ Module A              │       │ Module B                │ │
 │ │ (Reads $unit symbols) │       │ (Reads $unit symbols)   │ │
 │ └───────────────────────┘       └─────────────────────────┘ │
 └─────────────────────────────────────────────────────────────┘
  BEHAVIOR CHANGES DEPENDING ON SINGLE-FILE VS MULTI-FILE COMPILATION!
```

---

### 2. Why Relying on `$unit` is a Severe Hardware Engineering Anti-Pattern

While `$unit` seems convenient because it allows declaring global types without writing a `package` block, **relying on `$unit` is one of the most dangerous anti-patterns in digital design**.

Why? Because the contents of `$unit` change depending on whether your build script uses **Single-File Compilation Mode** or **Multi-File Compilation Mode**!

#### Scenario A: Single-File Compilation (`vlog file_a.sv file_b.sv`)
When an EDA tool compiles all source files together in a single command pass:
* A single, shared `$unit` scope is created for all files.
* `file_b.sv` can see and read the `$unit` typedefs declared inside `file_a.sv`.
* The design compiles successfully.

#### Scenario B: Multi-File / Separate Compilation (`vlog file_a.sv; vlog file_b.sv`)
When a modern build system (like Make, CMake, or Vivado) compiles files in parallel or in separate invocation passes:
* The EDA tool creates a **NEW, SEPARATE `$unit` scope for each individual file compilation pass!**
* `file_a.sv` compiles in its own `$unit`.
* When `file_b.sv` compiles in a separate pass, it CANNOT see the `$unit` declarations from `file_a.sv`!
* Compilation fails with fatal error: `Error: Type 'global_payload_t' is undefined in module ReceiverNode.`

```text
COMPILATION MODE DISCREPANCY IN $unit

 Single-File Pass (vlog file_a.sv file_b.sv):
 [ $unit Shared Scope: file_a.sv + file_b.sv ] ──► Compiles OK!

 Multi-File Pass (vlog file_a.sv ; vlog file_b.sv):
 Pass 1: [ $unit_A: file_a.sv ] ──► Success
 Pass 2: [ $unit_B: file_b.sv ] ──► FATAL ERROR! Cannot find $unit_A symbols!
```

**Golden Rule of Scope Management**:
> **NEVER declare parameters, typedefs, or functions in the implicit `$unit` scope.** Always enclose shared hardware definitions inside explicit SystemVerilog `package` blocks.

---

### 3. The SystemVerilog Scope Resolution Order

When the compiler encounters a symbol name (such as `DATA_WIDTH`) inside a module, it searches for the definition in a strict, deterministic 5-level hierarchy:

$$
\text{Scope Search Order: } \text{Local} \longrightarrow \text{Module} \longrightarrow \text{Explicit Imports} \longrightarrow \text{Wildcard Imports} \longrightarrow \text{Compilation Unit } (\$unit)
$$

```text
5-LEVEL SYSTEMVERILOG SCOPE SEARCH CASCADE

 1. Local Block Scope (inside task/function/always block)
       │ (If not found)
       ▼
 2. Module Scope (declared inside current module)
       │ (If not found)
       ▼
 3. Explicit Package Imports (import pkg::item declared in module)
       │ (If not found)
       ▼
 4. Wildcard Package Imports (import pkg::* declared in module)
       │ (If not found)
       ▼
 5. Compilation Unit Scope ($unit)
       │ (If not found)
       ▼
  FATAL COMPILER ERROR: Symbol Undeclared!
```

Let's trace this search cascade:
1. **Local Block Scope**: Checks inside the current `begin...end` block, `function`, or `task`.
2. **Module Scope**: Checks local signals and parameters declared inside the current `module`.
3. **Explicit Package Imports**: Checks symbols explicitly brought in via `import pkg::item;`.
4. **Wildcard Package Imports**: Checks packages referenced via `import pkg::*;`.
5. **Compilation Unit Scope (`$unit`)**: Checks the outer global file scope.
6. **Failure**: If the symbol is not found in any of these 5 levels, the compiler halts with an undeclared symbol error.

---

## Real-World Engineering Realities and Package Management

In physical System-on-Chip (SoC) development, managing packages across large teams introduces practical build-system and synthesis realities that engineers must master.

### 1. The Wildcard Import Collision Hazard

Consider a module that performs wildcard imports from two separate packages: `network_pkg` and `memory_pkg`.

```systemverilog
module SystemBridge
    import network_pkg::*;
    import memory_pkg::*;
(
    input logic clk
);
    // BOTH PACKAGES CONTAIN A PARAMETER NAMED 'BUS_WIDTH'!
    logic [BUS_WIDTH-1:0] internal_bus; // FATAL COMPILER ERROR!
endmodule
```

What happens if both `network_pkg` and `memory_pkg` contain a parameter named `BUS_WIDTH`?

When the compiler encounters `BUS_WIDTH`, it checks both wildcard-imported packages. It finds `network_pkg::BUS_WIDTH` AND `memory_pkg::BUS_WIDTH`. 

Because two packages offer the exact same symbol, the compiler cannot guess which one you intended to use. Compilation halts immediately with a namespace collision error: `Error: Symbol 'BUS_WIDTH' is ambiguous; matching definitions found in packages 'network_pkg' and 'memory_pkg'.`

#### How to Resolve Wildcard Collisions:
Use **Direct Scope Resolution (`::`)** or an **Explicit Item Import** to override the ambiguity:

```systemverilog
// RESOLVING WILDCARD COLLISIONS
module SystemBridge
    import network_pkg::*;
    import memory_pkg::*;
    // Explicit import overrides wildcard ambiguities!
    import network_pkg::BUS_WIDTH; 
(
    input logic clk
);
    // Uses network_pkg::BUS_WIDTH explicitly! Zero ambiguity!
    logic [BUS_WIDTH-1:0] internal_bus; 
endmodule
```

---

### 2. Package Dependency Cycles (Circular Dependencies)

Suppose Package A imports an architecture type from Package B, while Package B imports a configuration parameter from Package A:

```text
CIRCULAR PACKAGE DEPENDENCY DEADLOCK

 package_a ──► imports package_b::status_t ──┐
      ▲                                       │  CIRCULAR DEADLOCK!
      │                                       ▼
 package_b ◄── imports package_a::ADDR_WIDTH ─┘
```

#### Why Circular Dependencies Fail:
A compiler cannot compile `package_a` until `package_b` is fully compiled, but it cannot compile `package_b` until `package_a` is fully compiled! The build script enters a circular deadlock.

#### The Architectural Solution: Layered Base Packages
To eliminate circular package dependencies, engineers extract all shared foundational parameters and types into a bottom-layer **Base Package (`common_types_pkg`)**:

```text
CLEAN LAYERED PACKAGE DEPENDENCY GRAPH

                  [ common_types_pkg ]
                  (Base Parameters & Types)
                             ▲
          ┌──────────────────┴──────────────────┐
          │                                     │
   [ network_pkg ]                       [ memory_pkg ]
   (Imports common_types)                (Imports common_types)
          ▲                                     ▲
          └──────────────────┬──────────────────┘
                             │
                  [ Top-Level Modules ]
```

By organizing packages in a clean, acyclic dependency tree, compilation order is strictly deterministic and build scripts execute without errors.

---

### 3. Pure Synthesizable Functions in Packages

Packages can store helper functions used to calculate hardware parameters or format data fields.

To be synthesizable into physical hardware, functions defined inside packages MUST adhere to strict rules:
1. **Automatic Lifetime (`function automatic`)**: The function must be declared `automatic` so that internal variables are allocated dynamically during evaluation.
2. **Pure Combinational Logic**: The function cannot contain timing delays (`#10`), clock edge waits (`@(posedge clk)`), or non-blocking assignments (`<=`).
3. **No Side Effects**: The function must compute its return value strictly from its input arguments, without modifying global variables outside its local scope.

```systemverilog
package math_pkg;

    // Pure Synthesizable Package Function: Calculates log2 ceiling for vector sizing
    function automatic int unsigned clog2(input int unsigned value);
        int unsigned result;
        int unsigned temp;
        temp = value - 1;
        result = 0;
        while (temp > 0) begin
            result++;
            temp = temp >> 1;
        end
        return result;
    endfunction

endpackage : math_pkg
```

This `clog2` function can be used across your entire project to calculate vector bit-widths automatically based on parameter values during synthesis!

---

## Solved Industrial Engineering Exercise: Centralized System Bus Configuration Package and Multi-Channel Router

To consolidate your complete mastery of SystemVerilog packages, scope resolution (`::`), wildcard imports, synthesizable package functions, and package-driven module synthesis, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are designing the centralized configuration infrastructure and multi-channel packet router for a high-speed satellite communications system.

The system requires two components:
1. **A Configuration Package (`router_config_pkg`)**: Serves as the single source of truth for all router parameters, types, structs, and parity functions.
2. **A Multi-Channel Packet Router (`PacketRouterNode`)**: Synthesizes the hardware router using types and functions imported from `router_config_pkg`.

```text
SATELLITE ROUTER SUBSYSTEM ARCHITECTURE

                  ┌──────────────────────────────────────────┐
                  │ package router_config_pkg                │
                  │  * Parameters: ADDR_WIDTH, DATA_WIDTH    │
                  │  * Enum      : packet_type_e             │
                  │  * Struct    : router_header_t           │
                  │  * Function  : calc_header_parity()      │
                  └────────────────────┬─────────────────────┘
                                       │
                                       │ Direct Scope Resolution (pkg::item)
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │ module PacketRouterNode                  │
                  │  * Receives router_header_t              │
                  │  * Validates parity via calc_header_parity│
                  │  * Routes payload to output port 0..3    │
                  └──────────────────────────────────────────┘
```

#### Package Specifications (`router_config_pkg`):
* `ADDR_WIDTH` = 16 (16-bit address fields).
* `DATA_WIDTH` = 32 (32-bit data payload fields).
* `NUM_PORTS`  = 4 (4 output routing ports).
* `packet_type_e`: Enumerated 2-bit type:
  * `PKT_DATA    = 2'b00`
  * `PKT_CONTROL = 2'b01`
  * `PKT_SYNC    = 2'b10`
  * `PKT_ERROR   = 2'b11`
* `router_header_t`: 32-bit packed struct containing:
  * `dest_id`   : 2 bits `[31:30]` — Output port destination ($0$ to $3$).
  * `src_id`    : 2 bits `[29:28]` — Source origin ID.
  * `pkt_type`  : 2 bits `[27:26]` — Type of packet (`packet_type_e`).
  * `sequence_num`: 10 bits `[25:16]` — Packet sequence counter.
  * `checksum`  : 16 bits `[15:0]` — Header parity/checksum.
* `calc_header_parity`: Automatic function that calculates 16-bit XOR reduction parity over the non-checksum header fields.

#### Router Specifications (`PacketRouterNode`):
* Receives `router_header_t` input and 32-bit data payload.
* Verifies parity using `calc_header_parity`. If parity matches `header.checksum`, set `parity_ok = 1`; else `parity_ok = 0`.
* If `parity_ok == 1`, route the 32-bit data payload to output port `port_out[header.dest_id]`. Unselected output ports must emit $0$.

#### Your Objective

1. Write the SystemVerilog package `router_config_pkg` containing all parameters, enums, packed structs, and functions.
2. Write module `PacketRouterNode` using **Direct Qualified Scope Resolution (`router_config_pkg::`)** for all port and internal types.
3. Enforce ``default_nettype none` across all files.
4. Simulate and trace a test packet through the router, evaluating parity calculation and port decoding.
5. Verify mathematical and structural correctness.

---

### Step-by-Step Derivation

#### Step 1: Write the Configuration Package (`router_config_pkg`)

We construct `router_config_pkg` in a dedicated source file:

```systemverilog
`default_nettype none

package router_config_pkg;

    // 1. Centralized Parameters
    parameter int unsigned ADDR_WIDTH = 16;
    parameter int unsigned DATA_WIDTH = 32;
    parameter int unsigned NUM_PORTS  = 4;

    // 2. Enumerated Packet Types
    typedef enum logic [1:0] {
        PKT_DATA    = 2'b00,
        PKT_CONTROL = 2'b01,
        PKT_SYNC    = 2'b10,
        PKT_ERROR   = 2'b11
    } packet_type_e;

    // 3. 32-Bit Formatted Packed Header Struct
    typedef struct packed {
        logic [1:0]          dest_id;      // Bits [31:30] (2 bits)
        logic [1:0]          src_id;       // Bits [29:28] (2 bits)
        packet_type_e        pkt_type;     // Bits [27:26] (2 bits)
        logic [9:0]          sequence_num; // Bits [25:16] (10 bits)
        logic [15:0]         checksum;     // Bits [15:0]  (16 bits)
    } router_header_t;

    // 4. Pure Synthesizable Parity Function
    function automatic logic [15:0] calc_header_parity(input router_header_t hdr);
        logic [15:0] upper_fields;
        // Combine non-checksum fields (bits [31:16])
        upper_fields = {hdr.dest_id, hdr.src_id, hdr.pkt_type, hdr.sequence_num};
        // Replicate 16-bit XOR parity pattern
        return {8{^upper_fields[15:8], ^upper_fields[7:0]}};
    endfunction

endpackage : router_config_pkg

`default_nettype wire
```

##### Bit Width Verification of `router_header_t`:
$$W_{\text{struct}} = 2 + 2 + 2 + 10 + 16 = 32 \text{ bits}$$

---

#### Step 2: Write the Multi-Channel Router Module (`PacketRouterNode`)

We implement `PacketRouterNode` using direct scope resolution `router_config_pkg::` to guarantee 100% namespace safety:

```systemverilog
`default_nettype none

module PacketRouterNode (
    input  router_config_pkg::router_header_t in_header,
    input  logic [31:0]                        in_payload,
    input  logic                               in_valid,
    output logic [31:0]                        port_out [0:3], // 4 Unpacked Output Ports
    output logic                               parity_ok
);
    // Local variable using package enum type via scope resolution
    router_config_pkg::packet_type_e active_type;
    logic [15:0]                     computed_parity;

    always_comb begin
        // 1. Calculate Expected Parity using Package Function
        computed_parity = router_config_pkg::calc_header_parity(in_header);
        
        // 2. Verify Parity Match
        parity_ok = (computed_parity == in_header.checksum);
        
        // 3. Read Packet Type
        active_type = in_header.pkt_type;

        // 4. Default Output Demultiplexing (Clear all ports)
        port_out[0] = 32'h0;
        port_out[1] = 32'h0;
        port_out[2] = 32'h0;
        port_out[3] = 32'h0;

        // 5. Route Payload if Valid AND Parity Correct
        if (in_valid && parity_ok) begin
            port_out[in_header.dest_id] = in_payload;
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 3: Write the System Testbench Verification Environment

We construct a testbench module to verify packet routing and parity checking:

```systemverilog
`default_nettype none

module PacketRouter_tb;

    // Direct Scope Resolution for Testbench Types
    router_config_pkg::router_header_t test_header;
    logic [31:0]                       test_payload;
    logic                              test_valid;
    logic [31:0]                       port_outputs [0:3];
    logic                              parity_status;

    // Instantiate Unit Under Test (UUT)
    PacketRouterNode u_router (
        .in_header  (test_header),
        .in_payload (test_payload),
        .in_valid   (test_valid),
        .port_out   (port_outputs),
        .parity_ok  (parity_status)
    );

    initial begin
        // Test Case 1: Valid Packet targeting Port 2
        test_valid               = 1'b1;
        test_payload             = 32'hDEAD_BEEF;
        test_header.dest_id      = 2'b10; // Target Port 2
        test_header.src_id       = 2'b01; // Source 1
        test_header.pkt_type     = router_config_pkg::PKT_DATA;
        test_header.sequence_num = 10'd42;
        
        // Calculate and assign valid checksum
        test_header.checksum = router_config_pkg::calc_header_parity(test_header);
        
        #10; // Allow combinational logic to settle
        
        // Test Case 2: Corrupt Checksum (Parity Failure)
        test_header.checksum = 16'h0000; // Intentionally corrupted checksum!
        
        #10;
        $finish;
    end

endmodule

`default_nettype wire
```

---

### Step-by-Step Simulation Analysis and Sanity Check

Let us trace the execution of our `PacketRouterNode` for both test cases:

#### Test Case 1: Valid Packet Targeted to Port 2 ($010_2$)

1. **Header Fields**:
   * `dest_id = 2'b10` (Port 2). `src_id = 2'b01`. `pkt_type = PKT_DATA (2'b00)`. `sequence_num = 10'd42`.
   * Non-checksum upper vector: `{2'b10, 2'b01, 2'b00, 10'd42} = 16'b1001_0000_0010_1010` (`16'h902A`).
2. **Parity Calculation (`calc_header_parity`)**:
   * Upper byte `8'h90` = `8'b1001_0000` (XOR reduction = $1 \oplus 0 \oplus 0 \oplus 1 \oplus 0 \oplus 0 \oplus 0 \oplus 0 = 0$).
   * Lower byte `8'h2A` = `8'b0010_1010` (XOR reduction = $0 \oplus 0 \oplus 1 \oplus 0 \oplus 1 \oplus 0 \oplus 1 \oplus 0 = 1$).
   * Replicated Parity Checksum: `{8{1'b0, 1'b1}} = 16'b01010101_01010101` (`16'h5555`).
3. **Router Execution**:
   * `in_header.checksum == 16'h5555`.
   * `computed_parity == 16'h5555` $\implies$ `parity_ok = 1`.
   * `in_valid == 1` AND `parity_ok == 1` $\implies$ Route `in_payload` (`32'hDEAD_BEEF`) to `port_out[2]`.
   * Ports 0, 1, 3 remain at `32'h0`.

```text
TEST CASE 1 EXECUTION SANITY CHECK

 Inputs: Header Dest = Port 2 | Payload = 32'hDEAD_BEEF | Valid Checksum = 16'h5555
                                      │
                                      ▼
 Router Execution: parity_ok = 1  ──► Payload routed to Port 2 ONLY!
 Port Out 0 = 32'h0000_0000
 Port Out 1 = 32'h0000_0000
 Port Out 2 = 32'hDEAD_BEEF  ◄── VALID PAYLOAD DELIVERED!
 Port Out 3 = 32'h0000_0000
```

#### Test Case 2: Corrupted Checksum Attack (`checksum = 16'h0000`)

1. **Header Fields**: Same payload, but `test_header.checksum` is corrupted to `16'h0000`.
2. **Router Execution**:
   * `computed_parity` (`16'h5555`) $\neq$ `in_header.checksum` (`16'h0000`).
   * `parity_ok = 0` (**PARITY FAILURE DETECTED!**).
   * Because `parity_ok == 0`, the routing condition `if (in_valid && parity_ok)` fails!
   * All output ports `port_out[0..3]` remain safely cleared at `32'h0`.
   * The corrupted packet is dropped!

```text
TEST CASE 2 CORRUPTED PACKET SANITY CHECK

 Inputs: Corrupted Checksum = 16'h0000 (Expected 16'h5555)
                                      │
                                      ▼
 Router Execution: parity_ok = 0  ──► PACKET DROPPED! ALL PORTS CLEARED!
 Port Out 0 = 32'h0000_0000
 Port Out 1 = 32'h0000_0000
 Port Out 2 = 32'h0000_0000  ◄── CORRUPTED PACKET BLOCKED!
 Port Out 3 = 32'h0000_0000
```

All test cases evaluate with 100% mathematical, structural, and logical precision. The package-driven multi-channel router is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **SystemVerilog Package (`package ... endpackage`)**: A centralized, top-level hardware namespace block that stores project-wide parameters, typedefs, structs, and pure synthesizable functions, creating a single source of truth that eliminates preprocessor macro pollution and copy-paste type mismatches.
* **Scope Resolution Operator (`::`)**: The explicit namespace lookup operator (`package_name::item_name`) that references package items directly without injecting symbols into local module scopes, guaranteeing 100% collision-proof compilation and build-script independence.
