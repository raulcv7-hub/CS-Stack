content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/04-platform-bus-enumeration/01-pcie-bus-tree-scanning/01-pcie-recursive-bus-enumeration.md
# 01-pcie-recursive-bus-enumeration — PCI Express Recursive Bus Enumeration and BDF Topology Tree Scanning

## 1. The Un-Mapped PCIe Tree Topology Dilemma

When a modern multi-core server or workstation processor powers on and completes early platform memory training, the central processing unit (CPU) is physically connected to a complex, multi-tiered hierarchy of PCI Express (PCIe) expansion buses, root ports, switches, bridge chips, and peripheral endpoints—such as high-speed NVMe solid-state storage drives, graphics processing units (GPUs), and multi-port Ethernet network interface cards (NICs).

However, upon exiting reset, **the central host CPU has zero knowledge of the physical interconnect topology attached to its PCIe expansion slots.**

```text
THE UN-MAPPED PCIE TOPOLOGY DILEMMA AT POWER-ON

 Host CPU Root Complex (Bus 0)
 ┌─────────────────────────────────────────────────────────────┐
 │ Un-Configured Bus Root Ports (Buses Unassigned!)            │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ Physical PCIe Link 0          ▼ Physical PCIe Link 1
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │ PCIe Switch Bridge A      │   │ Empty Slot                │
 │ (Buses UNKNOWN!)          │   │ (Status UNKNOWN!)         │
 └─────────────┬─────────────┘   └───────────────────────────┘
               │
               ├───────────────────────────────┐
               ▼                               ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │ NVMe SSD Endpoint         │   │ GPU Graphics Endpoint     │
 │ (BDF ID UNKNOWN!)         │   │ (BDF ID UNKNOWN!)         │
 └───────────────────────────┘   └───────────────────────────┘
  (To the CPU, every downstream bridge and endpoint is INVISIBLE!)
```

Trace the physical and architectural barrier facing early platform firmware:

1. **Unassigned Bus Numbers**: The host CPU does not know how many PCIe switches or bridge chips are daisy-chained together on the motherboard, which physical slots contain expansion cards, or where the branches of the interconnect tree end.
2. **Ignored Configuration Packets**: In PCI Express architecture, every peripheral device function is identified by a 16-bit **Bus / Device / Function (BDF)** address. 
   
   If the host CPU attempts to send a configuration read packet targeting an endpoint sitting behind a PCIe switch bridge *before* that bridge has been assigned its **Primary, Secondary, and Subordinate Bus Numbers**, the bridge will ignore the packet. 

   The configuration TLP is dropped on the floor or aborted, and the CPU receives an `Unsupported Request (UR)` error.
3. **The Invisible Peripherals**: Because the bridges drop downstream packets, the CPU cannot read vendor identification registers (`Vendor ID`), cannot calculate required memory window sizes (Base Address Registers / BARs), and cannot route hardware interrupts. To the host processor, all expansion cards are completely invisible!

A host CPU cannot communicate with peripheral hardware or load operating system drivers over an un-enumerated bus tree!

Before the operating system kernel can launch or access storage drives, platform firmware must execute a **Recursive Bus Scanning Algorithm (Depth-First Search)** across the un-mapped PCIe topology. 

It must discover every bridge and endpoint, program Primary, Secondary, and Subordinate bus numbers into bridge configuration headers, and build a unified **BDF Topology Tree (`Bus:Device.Function`)**.

To eliminate the un-mapped topology dilemma and discover all peripheral devices on the motherboard, platform firmware employs **Recursive Bus Scanning** and the **BDF Topology Tree**.

---

## 2. The Postal River Delta and the Island Bridge Inspector

To build an intuitive, crystal-clear mental model of PCIe bus enumeration, Type 1 bridge registers, BDF addressing, and Depth-First Search tree scanning before inspecting bitwise ECAM offset maps, CfgRd0/CfgRd1 packet transformations, and recursive pseudocode, let us consider an everyday analogy: **The Postal River Delta and the Island Bridge Inspector**.

Imagine a central postal headquarters (**The CPU Host / Root Complex**) sitting at the mouth of a massive, unexplored river delta containing dozens of islands (**PCIe Expansion Buses**).

```text
THE POSTAL RIVER DELTA ANALOGY

 Central Postal Headquarters (Root Complex / Bus 0)
 ┌─────────────────────────────────────────────────────────────┐
 │ Wants to send mail trucks to shops on distant islands       │
 └─────────────┬───────────────────────────────┬───────────────┘
               │ Bridge A                      │ Bridge B
               ▼                               ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │ Island #1 (Bus 1)         │   │ Unexplored Branch         │
 └─────────────┬─────────────┘   └───────────────────────────┘
               │ Bridge C
               ▼
 ┌───────────────────────────┐
 │ Island #2 (Bus 2)         │ ──► [ Shop X (NVMe Endpoint) ]
 └───────────────────────────┘
```

The islands are connected to each other by a complex network of toll bridges (**PCIe Switches and Bridge Chips**). On various islands sit local shops (**Peripheral Endpoints: GPUs, NVMe SSDs, Network Cards**).

The central postmaster (**Platform Firmware**) wants to send mail trucks (**Configuration and Memory TLPs**) from headquarters to every shop in the delta.

Look at the physical dilemma facing the postmaster on morning 1:
* The postmaster has **zero maps of the river delta**.
* They do not know how many bridges exist, which islands connect to which bridges, or where the islands end!
* If a mail truck drives onto Bridge A carrying a letter marked *"Deliver to Shop on Island #3"*, **Bridge A drops the letter in the river**! Why? Because Bridge A has no labels telling it whether Island #3 lies across its span or down a different branch of the river!

---

### The Solution: The 3-Label Bridge Inspection Rule (Depth-First Search)

To map the delta, the postmaster hires a **Recursive Bridge Inspector (The Bus Enumerator)**.

The inspector carries three metal label plates to attach to every bridge they encounter:
1. **Primary Island Number ($\text{Primary Bus / PRI\_BUS}$)**: The island number where the bridge begins (where the inspector is standing).
2. **Secondary Island Number ($\text{Secondary Bus / SEC\_BUS}$)**: The brand-new island number assigned to the downstream side of the bridge!
3. **Subordinate Island Number ($\text{Subordinate Bus / SUB\_BUS}$)**: The highest island number reachable anywhere deeper down the river branch behind this bridge!

```text
THE 3-LABEL BRIDGE INSPECTION RULE

 Bridge Signpost Label:
 ┌─────────────────────────────────────────────────────────────┐
 │ Primary Island     (PRI_BUS) : Island #0 (Where bridge starts)│
 │ Secondary Island   (SEC_BUS) : Island #1 (Downstream island) │
 │ Subordinate Island (SUB_BUS) : Island #3 (Highest island    │
 │                                         reachable behind me!)│
 └─────────────────────────────────────────────────────────────┘
```

Watch how the inspector maps the river delta using a **Depth-First Search (DFS)** strategy:

1. **Mainland Initialization**: The inspector labels the mainland where headquarters sits as **Island #0 (`Bus 0`)**.
2. **Discovering Bridge A**: Standing on Island #0, the inspector walks up to Bridge A.
   * Sets Bridge A's Primary Island $= 0$ (`PRI_BUS = 0`).
   * Assigns the next available number, **Island #1**, as Bridge A's Secondary Island (`SEC_BUS = 1`).
   * Sets Bridge A's Subordinate Island temporarily to `255` (a temporary maximum marker).
3. **Crossing Bridge A to Island #1**: The inspector crosses onto Island #1 (`Bus 1`). On Island #1, they discover **Bridge C**!
   * The inspector pauses Bridge A, steps up to Bridge C, sets Primary $= 1$, and assigns the next available number, **Island #2**, as Secondary Island (`SEC_BUS = 2`)!
4. **Reaching the Dead End (Endpoint)**: The inspector crosses Bridge C onto Island #2 (`Bus 2`). On Island #2, they find **Shop X (NVMe SSD Endpoint)**. There are no more bridges! The branch ends at Island #2.
5. **Backtracking and Updating Subordinate Labels**:
   * The inspector walks back to Bridge C and sets its Subordinate Island $= 2$ (`SUB_BUS = 2`), recording: *"The highest island number anywhere behind Bridge C is #2!"*
   * The inspector walks back to Bridge A and updates its Subordinate Island $= 2$ (`SUB_BUS = 2`), recording: *"The highest island number anywhere behind Bridge A is #2!"*

```text
COMPLETED BRIDGE ROUTING LABELS

 Bridge A : Primary = 0 | Secondary = 1 | Subordinate = 2
 Bridge C : Primary = 1 | Secondary = 2 | Subordinate = 2
```

Look at what this inspection achieved:
* Bridge A now knows its exact downstream range: **Islands #1 through #2** ($\text{SEC\_BUS} \le \text{Target} \le \text{SUB\_BUS}$).
* When a mail truck arrives at Bridge A looking for Island #2, Bridge A checks its label ($1 \le 2 \le 2$), sees a match, and **allows the truck to cross!**
* If a truck arrives looking for Island #5, Bridge A checks its label ($1 \le 5 \le 2 = \text{FALSE}$), rejects the truck, and saves time!

This river delta inspection is the exact physical analogue of **PCIe Recursive Bus Enumeration**:
* The central postmaster is the **Platform Firmware Bus Enumerator**.
* Mainland and islands are **PCIe Buses (`Bus 0, Bus 1, Bus 2...`)**.
* Bridges are **PCIe Switch Ports / Root Ports (Type 1 Bridges)**.
* Island shops are **PCIe Endpoints (Type 0 Devices: GPUs, NVMe SSDs, NICs)**.
* Mail trucks are **Configuration Transaction Layer Packets (TLPs)**.
* The 3 label plates are the **`PRI_BUS`, `SEC_BUS`, and `SUB_BUS` Bridge Registers**.
* Depth-First Search is the **Recursive Bus Scanning Algorithm**.

---

## 3. Formal Mechanics of PCIe Recursive Bus Enumeration and BDF Topology Trees

Now that we possess an intuitive mental model of island bridge inspectors and primary/secondary/subordinate labels, let us examine the formal, rigorous engineering mechanics of **PCIe Recursive Bus Enumeration** and **BDF Topology Trees**.

---

### Primitive 1: The 16-Bit BDF Address Architecture

In PCI Express architecture, every logical device function connected to the system interconnect is identified by a $16\text{-bit}$ binary address known as its **Bus / Device / Function (BDF)** identifier.

$$\mathbf{\text{BDF Identifier [15:0]} = [\quad \text{Bus Number } (8\text{ Bits}) \quad \mid \quad \text{Device Number } (5\text{ Bits}) \quad \mid \quad \text{Function Number } (3\text{ Bits}) \quad]}$$

```text
16-BIT BDF IDENTIFIER STRUCTURE

 Bit 15                         Bit 8 Bit 7       Bit 3 Bit 2       Bit 0
 ┌───────────────────────────────────┬─────────────────┬─────────────────┐
 │ Bus Number (8 Bits)               │ Device Number(5b│ Function Num(3b)│
 └───────────────────────────────────┴─────────────────┴─────────────────┘
  ◄──── 256 Buses (0 to 255) ───────► ◄─ 32 Devices ──► ◄── 8 Functions ──►
```

Let us dissect the three sub-fields of a 16-bit BDF address:

1. **Bus Number ($8\text{ Bits}$, Bits $[15:8]$)**: Identifies 1 of 256 logical buses ($0 \dots 255$). **Bus 0 is hardwired to the Root Complex** inside the CPU socket.
2. **Device Number ($5\text{ Bits}$, Bits $[7:3]$)**: Identifies 1 of 32 physical devices ($0 \dots 31$) attached to a specific bus.
3. **Function Number ($3\text{ Bits}$, Bits $[2:0]$)**: Identifies 1 of 8 logical functions ($0 \dots 7$) inside a multi-function device (e.g., Function 0 = NVMe Controller, Function 1 = SMBus Controller on the same chip).

The maximum addressable hardware functions in a single PCIe hierarchy is:

$$\text{Max Functions} = 256 \text{ Buses} \times 32 \text{ Devices} \times 8 \text{ Functions} = \mathbf{65,536 \text{ Hardware Functions}}$$

---

### Primitive 2: Type 0 Endpoint vs. Type 1 Bridge Headers

Every PCIe device function incorporates a $4,096\text{-byte}$ Configuration Space mapped into physical RAM via the Enhanced Configuration Access Mechanism (ECAM).

The **Header Type Register** (Byte Offset `0x0E` in configuration space) defines whether a device is an Endpoint or a Bridge:

```text
TYPE 0 ENDPOINT HEADER VS TYPE 1 BRIDGE HEADER

 Type 0 Header (Endpoint: GPU, NVMe)           Type 1 Header (Bridge: Root Port, Switch)
 Offset 0x00: Vendor ID | Device ID            Offset 0x00: Vendor ID | Device ID
 Offset 0x0E: Header Type = 0x00               Offset 0x0E: Header Type = 0x01
 Offset 0x10..0x24: BAR0 .. BAR5               Offset 0x18: Primary Bus Number   (PRI_BUS)
                                               Offset 0x19: Secondary Bus Number (SEC_BUS)
                                               Offset 0x1A: Subordinate Bus Number (SUB_BUS)
```

* **Type 0 Header (`Header Type = 0x00`)**: Standard Endpoint device (such as an NVMe SSD or GPU). Contains Base Address Registers (BAR0 through BAR5) to request memory-mapped I/O windows.
* **Type 1 Header (`Header Type = 0x01`)**: PCI-to-PCI Bridge or PCIe Switch Port. Contains three critical **Bus Number Registers**:
  1. **Primary Bus Number (`PRI_BUS` / Offset `0x18`)**: Stores the bus number directly above the bridge (closer to the CPU).
  2. **Secondary Bus Number (`SEC_BUS` / Offset `0x19`)**: Stores the new bus number assigned to the downstream link directly below the bridge.
  3. **Subordinate Bus Number (`SUB_BUS` / Offset `0x1A`)**: Stores the highest bus number assigned anywhere in the downstream hierarchy tree behind this bridge!

---

### The Depth-First Search (DFS) Recursive Bus Scanning Algorithm

To discover all devices and program `PRI_BUS`, `SEC_BUS`, and `SUB_BUS` registers across an un-mapped PCIe tree, platform firmware executes a **Recursive Depth-First Search (DFS) Algorithm**.

```text
RECURSIVE DEPTH-FIRST SEARCH (DFS) TREE TRAVERSAL

 Root Complex (Bus 0)
   │
   ├─► Scan Bus 0, Dev 1, Func 0 (Type 1 Bridge A)
   │   │ Program: PRI = 0, SEC = 1, SUB = 0xFF (Temp)
   │   │
   │   └─► RECURSE ScanBus(Bus 1)
   │         │
   │         ├─► Scan Bus 1, Dev 1, Func 0 (Type 1 Bridge B)
   │         │   │ Program: PRI = 1, SEC = 2, SUB = 0xFF (Temp)
   │         │   │
   │         │   └─► RECURSE ScanBus(Bus 2)
   │         │         │
   │         │         └─► Scan Bus 2, Dev 1, Func 0 (Type 0 Endpoint 1)
   │         │             (No downstream bridges! End of branch!)
   │         │
   │         │   BACKTRACK: Update Bridge B SUB = 2!
   │         │
   │         └─► Scan Bus 1, Dev 2, Func 0 (Type 0 Endpoint 2)
   │
   └─► BACKTRACK: Update Bridge A SUB = 2!
```

#### Detailed Execution Mechanics of the DFS Algorithm

Firmware maintains a global integer counter: `current_bus = 0`.

The recursive function `ScanBus(uint8_t bus_num)` executes the following steps:

1. **Iterate Devices and Functions**:
   The function loops through all 32 possible devices (`dev = 0..31`) and 8 possible functions (`func = 0..7`) on `bus_num`.
2. **Issue Configuration Read (`CfgRd0` / `CfgRd1`)**:
   Firmware reads the 32-bit `Vendor ID / Device ID` register at offset `0x00` for `BDF(bus_num, dev, func)`.
   * **Empty Slot Check**: If `Vendor ID == 0xFFFF` (or `0x0000`), no physical hardware is present in that slot!
   * *Optimization*: If Function 0 is empty (`func == 0`), firmware skips the remaining 7 functions on that device number immediately!
3. **Inspect Header Type**:
   If a valid `Vendor ID` is returned, firmware reads the `Header Type` register (offset `0x0E`).
4. **Handle Type 1 Bridge (Branch Discovery)**:
   If `Header Type == 0x01` (Type 1 Bridge):
   * Increments the global counter: `secondary_bus = ++current_bus`.
   * Writes `PRI_BUS = bus_num` into offset `0x18`.
   * Writes `SEC_BUS = secondary_bus` into offset `0x19`.
   * Writes `SUB_BUS = 0xFF` (temporary maximum value) into offset `0x1A`.
   * **RECURSIVE STEP**: Firmware calls `ScanBus(secondary_bus)`, diving deeper down the new branch!
5. **Backtracking and Subordinate Update**:
   When the recursive call `ScanBus(secondary_bus)` returns (meaning all downstream branches behind `secondary_bus` have been fully explored and assigned bus numbers):
   * Firmware reads the updated global counter `current_bus`.
   * Firmware writes `SUB_BUS = current_bus` into offset `0x1A` of the bridge!
   * The bridge now knows its exact downstream bus coverage boundary!

---

### Hardware TLP Conversion in Type 1 Bridges (`CfgRd1` $\to$ `CfgRd0`)

How does an intermediate PCIe switch bridge use `PRI_BUS`, `SEC_BUS`, and `SUB_BUS` to route configuration packets during and after enumeration?

When the CPU host issues a configuration read to a downstream bus, it dispatches a **Type 1 Configuration TLP (`CfgRd1`)** carrying a target BDF address ($\text{Bus}_{\text{target}}, \text{Dev}_{\text{target}}, \text{Func}_{\text{target}}$).

When `CfgRd1` arrives at a Type 1 Bridge:

The bridge's internal hardware address decoder evaluates the **Type 1 Bridge Routing Invariant**:

$$\mathbf{\text{Accept and Forward Downstream} \iff \text{SEC\_BUS} \le \text{Bus}_{\text{target}} \le \text{SUB\_BUS}}$$

```text
HARDWARE TYPE 1 BRIDGE CONFIGURATION PACKET CONVERSION

 Incoming Type 1 Config TLP: CfgRd1 (Target Bus = 2, Dev = 1, Func = 0)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Type 1 Bridge Hardware Decoder                              │
 │  * Reads SEC_BUS = 2, SUB_BUS = 4                           │
 │  * Evaluates Check: (SEC_BUS <= Target_Bus <= SUB_BUS)?     │
 │    2 <= 2 <= 4  ──► MATCH PASSED!                           │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ Target_Bus == SEC_BUS         ▼ Target_Bus > SEC_BUS
 Convert CfgRd1 TLP to CfgRd0 TLP!     Forward CfgRd1 TLP Downstream
 Transmit directly to Child Endpoint!  Unchanged to Deeper Switches!
```

* **Case 1 ($\text{Bus}_{\text{target}} == \text{SEC\_BUS}$)**:
  The target device sits on the bridge's immediate downstream link!
  * The bridge **converts the `CfgRd1` TLP into a Type 0 Configuration TLP (`CfgRd0`)**.
  * The bridge transmits `CfgRd0` directly to the child endpoint. The endpoint receives `CfgRd0` and responds with configuration data!
* **Case 2 ($\text{SEC\_BUS} < \text{Bus}_{\text{target}} \le \text{SUB\_BUS}$)**:
  The target device sits deeper down a secondary branch behind another switch.
  * The bridge forwards the `CfgRd1` TLP downstream unchanged.
* **Case 3 ($\text{Bus}_{\text{target}} < \text{SEC\_BUS}$ or $\text{Bus}_{\text{target}} > \text{SUB\_BUS}$)**:
  The target device does not reside behind this bridge. The bridge ignores the packet!

---

## 4. Real-World Silicon Engineering: Ghost Devices and Hot-Plug Bus Padding

In commercial server engineering, implementing PCIe bus enumeration requires handling physical edge cases such as empty slots, unresponsive devices, and dynamic hot-plug expansion.

---

### 1. The Configuration Read Timeout / Ghost Device Hazard

What happens when early boot firmware issues a `CfgRd0` packet to an empty PCIe slot where no card is installed?

The physical serial wires ($Tx/Rx$) connected to the empty slot receive no response.

```text
EMPTY SLOT CONFIGURATION READ TIMEOUT

 Host CPU / Switch Port dispatches CfgRd0 to Empty Slot (Dev 5, Func 0)
                       │
                       ▼
 Physical PCIe Serial Lanes receive ZERO response (Open Circuit!)
                       │
                       ▼
 Root Port / Switch Bridge generates Synthetic Master Abort Response!
 Returns Vendor ID = 0xFFFF_FFFF (or 0x0000_0000)
                       │
                       ▼
 Firmware checks: Vendor ID == 0xFFFF_FFFF?
 YES ──► Slot is EMPTY! Skip remaining functions and continue!
```

1. The switch port or Root Complex waits for a completion TLP for a hardware timeout duration (e.g., $50\ \mu\text{s}$).
2. When no response arrives, the Root Complex synthesizes a **Master Abort / Unsupported Request (`UR`)** completion packet.
3. The completion returns a 32-bit value of **`0xFFFF_FFFF`** (or `0x0000_0000`) for the `Vendor ID / Device ID` register.
4. **Engineering Guard**: Firmware MUST verify `Vendor ID != 0xFFFF_FFFF` and `Vendor ID != 0x0000_0000` before treating a slot as populated!

---

### 2. Hot-Plug Bus Padding (Reserving Bus Windows)

Consider a enterprise server with an empty hot-pluggable PCIe slot connected to Bridge A (`SEC_BUS = 1`).

During initial boot enumeration, the Depth-First Search algorithm scans behind Bridge A, finds no downstream devices, and sets `SUB_BUS = 1`.

Hours later, while the server is running, a system administrator plugs an external PCIe expansion chassis containing a 4-port switch and 4 NVMe SSDs into the hot-plug slot!

The new expansion chassis requires **5 new bus numbers** (Buses 2, 3, 4, 5, 6).

```text
HOT-PLUG BUS NUMBER COLLISION DISASTER

 Initial Boot Enumeration (Empty Hot-Plug Slot behind Bridge A):
 Bridge A Configured: SEC_BUS = 1, SUB_BUS = 1

 Hot-Plug Event (User plugs in Expansion Chassis needing Buses 2..6):
 Bridge A SUB_BUS is locked at 1!
 Bridge A REJECTS ALL PACKETS targeting Buses 2..6!
 (New devices are INVISIBLE because Bridge A has zero bus headroom!)
```

Look at the hot-plug failure:
Bridge A's `SUB_BUS` is locked at $1$. Bridge A rejects all configuration packets targeting Buses 2 through 6!

#### The Hardware / Firmware Solution: Hot-Plug Bus Padding
To support hot-plug expansion without re-enumerating the entire server's bus tree at runtime:
1. During initial boot enumeration, firmware inspects the `Slot Capabilities Register` (offset `0x14` in PCIe Capability Structure) to check if a bridge port is **Hot-Plug Capable**.
2. If `Hot-Plug Capable == 1`, firmware **reserves a padded block of extra bus numbers** (e.g., reserving 8 bus numbers) for that bridge:
   $$\text{SUB\_BUS}_{\text{padded}} = \text{SEC\_BUS} + \text{Padding\_Size} = 1 + 8 = \mathbf{9}$$
3. Firmware sets `SUB_BUS = 9` for Bridge A, leaving Buses 2 through 9 reserved.
4. When the expansion chassis is plugged in later, the OS hot-plug driver assigns Buses 2..6 smoothly within Bridge A's pre-padded `SUB_BUS = 9` window without disrupting existing system buses!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Depth-First Search (DFS) recursive bus scanning, Type 1 bridge bus register calculations (`PRI_BUS`, `SEC_BUS`, `SUB_BUS`), BDF address decoding, and ECAM configuration latencies, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal platform firmware architect enumerating the PCIe interconnect topology tree of an enterprise $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server host features an Enhanced Configuration Access Mechanism (ECAM) memory window mapped at base address `0x0000_0000_E000_0000`.

```text
SERVER PCIE INTERCONNECT TOPOLOGY TREE

 Root Complex (Bus 0)
   │
   ├─► Bus 0, Dev 1, Func 0 : Bridge A (Root Port 1)
   │     │
   │     └─► Bus ? : Bridge B (PCIe Switch Upstream Port)
   │           │
   │           ├─► Bus ? : Bridge C (Switch Downstream Port 1)
   │           │     │
   │           │     └─► Bus ? : Endpoint 1 (NVMe SSD)
   │           │
   │           └─► Bus ? : Bridge D (Switch Downstream Port 2)
   │                 │
   │                 └─► Bus ? : Bridge E (Secondary Switch)
   │                       │
   │                       └─► Bus ? : Endpoint 2 (GPU Card)
```

#### Topology Discovery Map (Discovered during DFS Traversal):
* **Root Complex**: Mapped to **Bus 0**.
* **Bridge A** (`Bus 0, Dev 1, Func 0`): Connects Bus 0 to the primary switch.
* **Bridge B** (Switch Upstream Port, Device 0, Func 0): Connected to Bridge A's downstream link.
* **Bridge C** (Switch Downstream Port 1, Device 1, Func 0): Downstream port on Bridge B's switch.
  * Behind Bridge C sits **Endpoint 1 (NVMe SSD, Device 0, Func 0)**.
* **Bridge D** (Switch Downstream Port 2, Device 2, Func 0): Downstream port on Bridge B's switch.
  * Behind Bridge D sits **Bridge E (Secondary Switch, Device 0, Func 0)**.
    * Behind Bridge E sits **Endpoint 2 (GPU Card, Device 0, Func 0)**.

#### Hardware Execution Timings:
* Single ECAM Configuration Read (`CfgRd0` / `CfgRd1`): $T_{\text{cfg\_read}} = 120\text{ CPU clock cycles}$ ($37.5\text{ ns}$).
* Single ECAM Configuration Write (`CfgWr0` / `CfgWr1`): $T_{\text{cfg\_write}} = 120\text{ CPU clock cycles}$ ($37.5\text{ ns}$).
* Empty Slot Scan Optimization: Firmware checks Function 0 of each device ($dev = 0 \dots 31$). If Function 0 returns `0xFFFF_FFFF`, firmware skips Functions 1..7 on that device number ($32\text{ reads per empty bus}$).

---

### The Hardware Execution Tasks:

1. Trace the Depth-First Search (DFS) recursive bus enumeration algorithm step-by-step and determine the exact integer values assigned to `PRI_BUS`, `SEC_BUS`, and `SUB_BUS` for Bridge A, Bridge B, Bridge C, Bridge D, and Bridge E.
2. Identify the final assigned **BDF Identifiers** (`Bus:Device.Function`) and ECAM physical memory addresses for **Endpoint 1 (NVMe SSD)** and **Endpoint 2 (GPU Card)**.
3. Calculate the total number of ECAM configuration read and write operations executed by the DFS algorithm to fully scan the 5 active buses ($Bus0 \dots Bus4$) in this topology.
4. Calculate the total physical execution time $T_{\text{enum\_total}}$ (in microseconds) and total CPU clock cycles consumed to complete the entire PCIe bus tree enumeration.

---

### Step-by-Step Derivation

#### Step 1: Trace Depth-First Search (DFS) Bus Enumeration and Bridge Register Assignment

Global counter initializes: `current_bus = 0`. Root Complex sits on **Bus 0**.

##### 1. Scan Bus 0:
* Firmware scans Bus 0. Finds **Bridge A** at `Bus 0, Dev 1, Func 0`.
* Assigns Bridge A:
  * `PRI_BUS = 0`
  * `SEC_BUS = ++current_bus = 1`
  * `SUB_BUS = 0xFF` (Temporary)
* **Recurse**: `ScanBus(1)`.

##### 2. Scan Bus 1:
* Firmware scans Bus 1. Finds **Bridge B** at `Bus 1, Dev 0, Func 0`.
* Assigns Bridge B:
  * `PRI_BUS = 1`
  * `SEC_BUS = ++current_bus = 2`
  * `SUB_BUS = 0xFF` (Temporary)
* **Recurse**: `ScanBus(2)`.

##### 3. Scan Bus 2:
* Firmware scans Bus 2. Finds **Bridge C** at `Bus 2, Dev 1, Func 0`.
  * Assigns Bridge C: `PRI_BUS = 2`, `SEC_BUS = ++current_bus = 3`, `SUB_BUS = 0xFF`.
  * **Recurse**: `ScanBus(3)`.
  * **Scan Bus 3**: Finds **Endpoint 1 (NVMe SSD)** at `Bus 3, Dev 0, Func 0`. No downstream bridges!
  * `ScanBus(3)` finishes. `current_bus = 3`.
  * Backtrack to Bridge C: Update **Bridge C `SUB_BUS = 3`**.
* Firmware continues scanning Bus 2. Finds **Bridge D** at `Bus 2, Dev 2, Func 0`.
  * Assigns Bridge D: `PRI_BUS = 2`, `SEC_BUS = ++current_bus = 4`, `SUB_BUS = 0xFF`.
  * **Recurse**: `ScanBus(4)`.
  * **Scan Bus 4**: Finds **Bridge E** at `Bus 4, Dev 0, Func 0`.
    * Assigns Bridge E: `PRI_BUS = 4`, `SEC_BUS = ++current_bus = 5`, `SUB_BUS = 0xFF`.
    * **Recurse**: `ScanBus(5)`.
    * **Scan Bus 5**: Finds **Endpoint 2 (GPU Card)** at `Bus 5, Dev 0, Func 0`. No downstream bridges!
    * `ScanBus(5)` finishes. `current_bus = 5`.
    * Backtrack to Bridge E: Update **Bridge E `SUB_BUS = 5`**.
  * Backtrack to Bridge D: Update **Bridge D `SUB_BUS = 5`**.
* `ScanBus(2)` finishes. Highest bus found on Branch 2 is 5.
* Backtrack to Bridge B: Update **Bridge B `SUB_BUS = 5`**.
* Backtrack to Bridge A: Update **Bridge A `SUB_BUS = 5`**.

```text
FINAL BRIDGE BUS REGISTER CONFIGURATION TABLE

 Bridge Name │ Location (BDF)  │ PRI_BUS │ SEC_BUS │ SUB_BUS │ Downstream Range
─────────────┼─────────────────┼─────────┼─────────┼─────────┼──────────────────
 Bridge A    │ Bus 0, Dev 1, F0│    0    │    1    │    5    │ Buses 1 .. 5
 Bridge B    │ Bus 1, Dev 0, F0│    1    │    2    │    5    │ Buses 2 .. 5
 Bridge C    │ Bus 2, Dev 1, F0│    2    │    3    │    3    │ Bus 3 Only
 Bridge D    │ Bus 2, Dev 2, F0│    2    │    4    │    5    │ Buses 4 .. 5
 Bridge E    │ Bus 4, Dev 0, F0│    4    │    5    │    5    │ Bus 5 Only
```

---

#### Step 2: Determine Assigned BDFs and ECAM Addresses for Endpoints

##### 1. Endpoint 1 (NVMe SSD):
* **Assigned BDF ID**: `Bus 3, Device 0, Function 0` ($\text{BDF} = \text{0x0300}$).
* Calculate ECAM Physical Memory Address ($\text{ECAM\_Base} = \text{0xE000\_0000}$):
  $$\text{ECAM\_Addr} = \text{ECAM\_Base} + (\text{Bus} \ll 20) + (\text{Dev} \ll 15) + (\text{Func} \ll 12)$$
  $$\text{ECAM\_Addr}_{\text{NVMe}} = \text{0xE000\_0000} + (3 \ll 20) = \text{0xE000\_0000} + \text{0x0030\_0000} = \mathbf{\text{0x0000\_0000\_E030\_0000}}$$

##### 2. Endpoint 2 (GPU Card):
* **Assigned BDF ID**: `Bus 5, Device 0, Function 0` ($\text{BDF} = \text{0x0500}$).
* Calculate ECAM Physical Memory Address:
  $$\text{ECAM\_Addr}_{\text{GPU}} = \text{0xE000\_0000} + (5 \ll 20) = \text{0xE000\_0000} + \text{0x0050\_0000} = \mathbf{\text{0x0000\_0000\_E050\_0000}}$$

---

#### Step 3: Calculate Configuration Read/Write Operations Executed

System contains 6 buses ($Bus 0 \dots Bus 5$):
* On each bus, firmware scans 32 device numbers. Function 0 is probed first.
* Empty slots return `0xFFFF_FFFF` on Function 0 and skip Functions 1..7 ($1\text{ read per empty slot}$).
* Populated slots read `Vendor ID` (1 read), `Header Type` (1 read), and write bridge bus registers if Type 1 (3 byte writes $= 3\text{ writes}$).

##### Configuration Operation Count per Bus:
* **Bus 0**: 1 populated device (Bridge A), 31 empty devices $\implies (1 \times 2\text{ reads}) + (31 \times 1\text{ read}) = 33\text{ reads}$, plus $3\text{ writes}$ to Bridge A.
* **Bus 1**: 1 populated device (Bridge B), 31 empty devices $\implies 33\text{ reads} + 3\text{ writes}$.
* **Bus 2**: 2 populated devices (Bridge C, Bridge D), 30 empty devices $\implies (2 \times 2) + 30 = 34\text{ reads} + 6\text{ writes}$.
* **Bus 3**: 1 populated device (Endpoint 1), 31 empty devices $\implies 33\text{ reads} + 0\text{ writes}$.
* **Bus 4**: 1 populated device (Bridge E), 31 empty devices $\implies 33\text{ reads} + 3\text{ writes}$.
* **Bus 5**: 1 populated device (Endpoint 2), 31 empty devices $\implies 33\text{ reads} + 0\text{ writes}$.

##### Total Operations Sum:
* **Total Configuration Reads**: $33 + 33 + 34 + 33 + 33 + 33 = \mathbf{199 \text{ Config Reads}}$
* **Total Configuration Writes**: $3 + 3 + 6 + 0 + 3 + 0 = \mathbf{15 \text{ Config Writes}}$
* **Total Config Transactions**: $199 + 15 = \mathbf{214 \text{ Transactions}}$

---

#### Step 4: Calculate Total Enumeration Execution Time ($T_{\text{enum\_total}}$)

Each configuration read or write transaction takes $120\text{ CPU clock cycles}$ ($37.5\text{ ns}$ at $3.2\text{ GHz}$):

$$\text{Total CPU Clock Cycles } (C_{\text{enum\_total}}) = 214 \text{ transactions} \times 120 \text{ cycles/transaction} = \mathbf{25,680 \text{ CPU Clock Cycles}}$$

Calculate total physical execution time $T_{\text{enum\_total}}$ at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{enum\_total}} = 25,680 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{8,025.0 \text{ Nanoseconds}} = \mathbf{8.025 \text{ Microseconds}}$$

```text
PCIE ENUMERATION EXECUTION SUMMARY

 Metric / Parameter             │ Calculated Engineering Value
────────────────────────────────┼─────────────────────────────────────────────
 Total Active Buses Discovered  │ 6 Buses (Bus 0 through Bus 5)
 Endpoint 1 (NVMe) BDF ID       │ Bus 3, Device 0, Function 0 (ECAM 0xE030_0000)
 Endpoint 2 (GPU) BDF ID        │ Bus 5, Device 0, Function 0 (ECAM 0xE050_0000)
 Total Config Read/Write Ops    │ 214 Transactions (199 Reads, 15 Writes)
 Total Enumeration Time         │ 8.025 Microseconds (25,680 CPU Clock Cycles)
```

##### Engineering Conclusion:
In **$8.025\text{ microseconds}$ ($25,680\text{ CPU clock cycles}$)**, early platform firmware scanned the entire PCIe tree topology, assigned non-overlapping bus number ranges to all 5 bridges, mapped physical ECAM configuration addresses, and built an un-ambiguous 16-bit BDF topology tree for the operating system kernel!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and topological results against PCIe specifications:

1. **Bridge Bus Window Nesting Invariant**:
   * Bridge A: Range $[1, 5]$. Contains Bridge B ($2 \le 2 \le 5$).
   * Bridge B: Range $[2, 5]$. Contains Bridge C ($3 \le 3 \le 5$) and Bridge D ($4 \le 4 \le 5$).
   * Bridge C: Range $[3, 3]$. Contains Endpoint 1 ($Bus 3$).
   * Bridge D: Range $[4, 5]$. Contains Bridge E ($5 \le 5 \le 5$).
   * Bridge E: Range $[5, 5]$. Contains Endpoint 2 ($Bus 5$).
   * All child bridge bus ranges are strictly contained within parent bridge bus ranges ($\text{SEC}_{\text{parent}} \le \text{SEC}_{\text{child}} \le \text{SUB}_{\text{child}} \le \text{SUB}_{\text{parent}}$). Nesting invariant $100\%$ mathematically verified!
2. **ECAM Address Calculation Check**:
   * Endpoint 1 ($Bus 3$): $3 \ll 20 = \text{0x0030\_0000} \implies \text{0xE000\_0000} + \text{0x0030\_0000} = \text{0xE030\_0000}$.
   * Endpoint 2 ($Bus 5$): $5 \ll 20 = \text{0x0050\_0000} \implies \text{0xE000\_0000} + \text{0x0050\_0000} = \text{0xE050\_0000}$.
   * ECAM bitwise shift calculations match $100\%$ precision!
3. **Execution Latency Check**:
   * $8.025\ \mu\text{s}$ execution time is negligible compared to the $15.0\text{-ms}$ DRAM training phase, proving that recursive BDF bus enumeration adds zero noticeable delay to platform startup.

All BDF 16-bit bitfields, Type 1 bridge bus range rules (`PRI_BUS`, `SEC_BUS`, `SUB_BUS`), Depth-First Search tree traversal logic, and $8.025\ \mu\text{s}$ execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Recursive Bus Scanning**: The Depth-First Search (DFS) tree-traversal algorithm executed by early platform firmware to discover PCIe root ports, bridges, switches, and endpoints, assigning Secondary (`SEC_BUS`) and Subordinate (`SUB_BUS`) bus numbers to every bridge in the hierarchy to enable downstream packet routing.
* **BDF Topology Tree**: The $16\text{-bit}$ Bus/Device/Function (`Bus[15:8] : Device[7:3] . Function[2:0]`) hierarchical addressing structure that provides a unique, un-ambiguous physical identification path and ECAM memory mapping for every hardware function on the motherboard.