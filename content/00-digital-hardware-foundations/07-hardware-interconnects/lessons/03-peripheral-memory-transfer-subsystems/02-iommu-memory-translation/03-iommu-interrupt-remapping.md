content/00-digital-hardware-foundations/07-hardware-interconnects/lessons/03-peripheral-memory-transfer-subsystems/02-iommu-memory-translation/03-iommu-interrupt-remapping.md
# Hardware Interrupt Remapping Architecture and Vector Isolation Tables

## The In-Band Interrupt Spoofing Hazard and Virtual Machine Interruption Hijacking

In modern cloud computing data centers and enterprise server platforms, a single physical server runs dozens of independent Virtual Machines (VMs) on a single physical host CPU. Using PCI Express Single Root I/O Virtualization (SR-IOV) or direct device pass-through, the host hypervisor assigns private hardware peripheral functions—such as virtual network interfaces or NVMe storage queues—directly to individual tenant Virtual Machines.

When a pass-through peripheral device finishes a memory transfer or receives an incoming network packet, it notifies its assigned Virtual Machine by dispatching an in-band **Message Signaled Interrupt (MSI / MSI-X)** across the PCIe interconnect bus.

At the physical hardware level, a Message Signaled Interrupt is simply a standard 4-byte **Memory Write Transaction Layer Packet (`MWr`)**:
* **Target Address**: Points to the host interrupt controller's Memory-Mapped I/O (MMIO) window (e.g., `0xFEE0_0000` for x86 Local APIC controllers).
* **Data Payload**: Contains a $16\text{-bit}$ binary **Interrupt Vector Number** ($0 \dots 255$) specifying which specific software routine or CPU core should be interrupted.

Now, consider the catastrophic security vulnerability that opens up in a multi-tenant cloud server if the interconnect architecture allows peripheral devices to write raw un-checked interrupt messages directly to the host interrupt controller: **The In-Band Interrupt Spoofing Attack**.

Suppose Virtual Machine 1 (a untrusted or compromised tenant VM) is assigned a virtual network card (`BDF = 01:00.0`). 

Virtual Machine 2 (a high-security banking VM running on the same server) is assigned an NVMe storage controller (`BDF = 02:00.0`) that uses **Interrupt Vector #88** on CPU Core 8:

```text
IN-BAND INTERRUPT SPOOFING VULNERABILITY (UN-PROTECTED SYSTEM)

 Rogue Device (VM 1 - BDF 01:00.0)             Victim Device (VM 2 - BDF 02:00.0)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Sends Fake Interrupt TLP  │                 │ Legitimate NVMe Device    │
 │ Target: 0xFEE0_0000       │                 │ Uses Vector 88 on Core 8  │
 │ Payload: Vector 88 (VM 2!)│                 └───────────────────────────┘
 └─────────────┬─────────────┘
               │
               ▼ (Un-Checked Memory Write TLP on Interconnect Bus)
 Host CPU Interrupt Controller (APIC @ 0xFEE0_0000)
               │
               ▼ Triggers Vector 88 on CPU Core 8!
 (Rogue VM 1 hijacked VM 2's interrupt routine! Caused DoS or Kernel Hijack!)
```

Trace the physical hardware exploitation step-by-step:
1. The untrusted tenant in VM 1 crafts a custom memory write TLP on its virtual network card (`BDF = 01:00.0`).
2. The network card dispatches the TLP across the PCIe interconnect: `AWADDR = 0xFEE0_0000` (Host APIC MMIO) and `WDATA = 0x0000_0058` (**Vector #88, belonging to VM 2!**).
3. The host interrupt controller receives the Memory Write TLP at address `0xFEE0_0000`.
4. **The Security Collapse**: The host interrupt controller has **zero physical way of knowing which device wrote the packet**! It reads `Vector #88` and **immediately interrupts CPU Core 8**, jumping to VM 2's storage interrupt handler!

Look at the power of this hardware exploit:
* Untrusted VM 1 executed an **Interrupt Spoofing Attack** against VM 2!
* VM 1 flooded CPU Core 8 with fake interrupts (**Interrupt Storm Denial-of-Service**), starving VM 2 of CPU processing time.
* VM 1 tricked the hypervisor into executing privileged kernel routines prematurely, disrupting financial database transactions or causing host kernel panics!

Why can standard IOMMU DMA page tables not block this attack?

Because standard IOMMU page tables translate and protect **Data Memory Addresses** (such as `0x8000_0000`). They do **NOT** inspect or validate memory writes targeting the host CPU's internal interrupt controller MMIO space (`0xFEE0_0000`)!

How can we place a dedicated hardware gatekeeper between peripheral interconnects and host CPU interrupt controllers—a gatekeeper that validates every incoming interrupt message against a hardware **Vector Isolation Table**, verifying that device $X$ is ONLY permitted to fire its own assigned virtual vectors?

To eliminate interrupt spoofing attacks and enforce multi-tenant vector isolation in hardware, computer architectures employ **Hardware Interrupt Remapping** and **Vector Isolation Tables (Interrupt Remapping Table Entries / IRTE)**.

---

## The Open Intercom Button vs. The Verified Switchboard Operator: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of hardware interrupt remapping, vector isolation tables, source BDF validation, and posted interrupt virtualization before inspecting 128-bit IRTE register fields and APIC delivery protocols, let us consider an everyday analogy: **The Multi-Tenant Luxury Hotel Intercom**.

Imagine a 100-room luxury hotel (**The Multi-Core Physical Host Server**) housing 100 independent guests (**Virtual Machines / Hypervisor Threads**).

```text
THE MULTI-TENANT HOTEL INTERCOM METAPHOR

 Guest Rooms (Virtual Machines / CPU Cores)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Room 12: Hotel Manager    │                 │ Room 88: Banking Tenant   │
 └───────────────────────────┘                 └───────────────────────────┘
```

Each hotel room is equipped with a wall-mounted emergency intercom speaker (**The Host CPU Local APIC Interrupt Target**).

Let us observe two different electrical designs for the hotel intercom system:

---

### Design 1: The Direct Un-Filtered Wall Buttons (Un-Remapped Interrupts)

In an old, un-protected hotel, every guest room has a red wall button. Guests use the red button to signal hotel staff.

However, the hotel's wiring was installed cheaply: any guest can unscrew their wall panel, connect two wires, and **ring the emergency speaker in ANY OTHER ROOM in the hotel**!

Look at what happens when a disruptive guest in Room 1 (**Rogue VM 1 / Device 01:00.0**) decides to cause trouble:
1. Guest 1 connects their wires and dials **Room 12 (The Hotel Manager's Private Office / Hypervisor Kernel)**.
2. At 3:00 AM, the emergency speaker in Room 12 blares a loud fire alarm!
3. The hotel manager jumps out of bed in a panic, evacuates the building, and stops running the hotel (**Kernel Panic / Denial-of-Service**)!
4. Guest 1 executed an **Interrupt Spoofing Attack** using the open, un-filtered intercom lines!

```text
DESIGN 1: UN-FILTERED WALL BUTTONS (SPOOFING HAZARD)

 Guest 1 (Room 1) ──► Dials Room 12 (Manager) ──► Blares Alarm in Manager's Room!
                      (Manager panicked at 3:00 AM! Hotel operation halted!)
```

---

### Design 2: The Verified Switchboard Operator (Hardware Interrupt Remapping)

To stop disruptive guests from ringing other rooms, the hotel manager cuts the direct room-to-room wires and installs a **Central Security Switchboard Operator (The Hardware Interrupt Remapper)** in the basement.

The manager sets up a strict **Master Permission Directory (The Vector Isolation Table / IRTE)**:

```text
DESIGN 2: THE SWITCHBOARD OPERATOR & ISOLATION TABLE (INTERRUPT REMAPPING)

 Guest Room 1 (VM 1)
 ┌───────────────────────────┐
 │ Press Button Index #10    ├──► [ Central Switchboard Operator (IOMMU) ]
 └───────────────────────────┘    * Checks Master Directory (IRTE Index 10)
                                  * Verifies: "Did Room 1 send this? YES!"
                                  * Maps Index 10 -> Message #42 for Room 1
                                  │
                                  ▼
                         Rings Speaker in Room 1 ONLY!
```

Now, watch how the Switchboard Operator processes incoming intercom signals:

1. **Index-Based Signaling**: Guests are **no longer allowed to specify room numbers**! When Guest 1 presses their button, the button sends a **Virtual Signal Index** (`Index #10`) to the basement switchboard.
2. **Directory Lookup & Source Validation**:
   * The Switchboard Operator receives `Index #10` from Guest 1 (`Room 1`).
   * The operator opens the Master Permission Directory at **Entry #10 (IRTE Entry 10)**.
   * Entry #10 specifies:
     * **Authorized Source**: `Room 1 ONLY`!
     * **Destination**: `Ring Room 1's speaker with Message #42`.
3. **Validation Check**: The operator verifies: *"Did the signal come from Room 1? YES!"* The operator rings Room 1's speaker with Message #42.
4. **SPOOFING ATTEMPT BLOCKED**:
   Suppose Guest 1 tries to send a signal targeting **Entry #20 (The Manager's Private Line in Room 12)**:
   * The operator opens Entry #20 in the directory.
   * Entry #20 specifies: **Authorized Source = `Room 2 ONLY`**!
   * The operator checks the line: *"This signal came from Guest 1, NOT Guest 2!"*
   * The operator **drops the signal in the trash, blocks Guest 1's line, and alerts hotel security** (**IOMMU Interrupt Remapping Fault**)!
   * Room 12 (The Manager's Office) remains completely quiet and secure!

```text
SPOOFING ATTEMPT BLOCKED BY SWITCHBOARD OPERATOR

 Guest 1 attempts to signal Entry #20 (Manager's Line)
                       │
                       ▼
 Operator checks Directory Entry #20:
 "AUTHORIZED SOURCE IS ROOM 2 ONLY! GUEST 1 DENIED!"
                       │
                       ▼
 Drop Signal ──► Block Line ──► Alert Hotel Security!
 (Manager's office remains 100% quiet! Spoofing attack neutralized!)
```

This Central Switchboard Operator system is the exact physical analogue of **Hardware Interrupt Remapping and Vector Isolation Tables**:
* Hotel rooms are **Host CPU Cores / Local APIC Target Windows**.
* Guest 1 and Guest 2 are **Peripheral Devices / Guest Virtual Machines**.
* Room 12 (The Manager's Office) is the **Host Hypervisor Kernel**.
* Direct room wires are **Un-Remapped MSI/MSI-X Memory Write TLPs**.
* The Central Switchboard Operator is the **IOMMU Interrupt Remapping Engine**.
* The Master Permission Directory is the **Interrupt Remapping Table (IRT)**.
* Directory Entry #10 is an **Interrupt Remapping Table Entry (IRTE)**.
* Checking the line source is **Hardware Source BDF Validation**.

---

## Primitive 1: Hardware Interrupt Remapping Architecture

Now that we possess a clear intuitive mental model of verified switchboard operators and master permission directories, let us examine the formal engineering mechanics of **Hardware Interrupt Remapping**.

> **Hardware Interrupt Remapping** (Intel VT-d Interrupt Remapping, AMD-Vi Interrupt Remapping, ARM SMMU / GICv3 ITS) is a hardware security capability embedded within the IOMMU that intercepts all incoming in-band interrupt Memory Write TLPs, validates their source BDF IDs against a hardware **Interrupt Remapping Table (IRT)**, and transforms the virtual index into a validated, target-specific CPU vector message.

```text
INTERRUPT REMAPPING HARDWARE INTERCONNECT PLACEMENT

 PCIe Peripheral Endpoint (Device BDF = 01:00.0)
       │
       ▼ Dispatches Remapped Interrupt TLP
 ══════╧════════════════════════════════════════════════════ PCIe Interconnect Bus
       │
       ▼ (Intercepted at IOMMU Gate)
 ┌─────────────────────────────────────────────────────────────┐
 │ IOMMU INTERRUPT REMAPPING ENGINE                            │
 │  * Extracts Remapped Index from TLP                         │
 │  * Fetches IRTE Entry from System DRAM                      │
 │  * Validates: Does TLP Requester BDF == IRTE.Source_ID?    │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ Match Passed!                 ▼ Match Failed! (Spoofing Attempt)
 ┌───────────────────────────┐   ┌─────────────────────────────┐
 │ Formats Clean APIC Vector │   │ BLOCK INTERRUPT IMMEDIATELY!│
 │ Dispatches to CPU Core 5  │   │ Log Fault in AER Register   │
 └───────────────────────────┘   └─────────────────────────────┘
```

---

### The Remapped Interrupt TLP Header Format

When Interrupt Remapping is enabled by the host operating system, peripheral hardware devices do **NOT** transmit raw APIC addresses (`0xFEE0_0000`) or raw vector numbers.

Instead, the device or interrupt subsystem constructs a specialized **Remapped Format Interrupt TLP (`MWr`)**:

```text
REMAPPED FORMAT INTERRUPT TLP HEADER FIELDS

 Memory Write TLP Target Address (DW2):
 Bit 31                          Bit 20 Bit 19      Bit 5 Bit 4 Bit 3 Bit 2 Bit 0
 ┌─────────────────────────────────────┬─────────────────┬───────┬─────┬──────┐
 │ Interrupt Window Base (0xFEE)       │ Handle / Index  │ Sub H │ SH  │ F=1  │
 │ (Bits 31:20 = 0xFEE)                │ (Bits 19:5)     │ (Bit4)│ (3) │ (1b) │
 └─────────────────────────────────────┴─────────────────┴───────┴─────┴──────┘

 Memory Write TLP Data Payload (DW3):
 Bit 31                                                  Bit 16 Bit 15 Bit 0
 ┌─────────────────────────────────────────────────────────────┬──────────────┐
 │ Subhandle Index Offset (16 Bits)                            │ Reserved     │
 └─────────────────────────────────────────────────────────────┴──────────────┘
```

Let us analyze the critical fields of this remapped address format:

1. **Interrupt Window Base (Bits $[31:20] = \text{0xFEE}$)**: Identifies the TLP as an interrupt message to the interconnect crossbar.
2. **Format Bit ($F = \text{Bit } 3$)**:
   * $F = 0 \implies$ **Legacy Compatibility Format** (Raw un-remapped interrupt).
   * $F = 1 \implies$ **Remapped Format**!
   
   > **The Remapped Enforcement Invariant**: When Hardware Interrupt Remapping is enabled by the hypervisor, **ALL incoming interrupt TLPs with $F = 0$ ARE BLOCKED AND DROPPED IN HARDWARE**!

3. **Subhandle Bit ($\text{SH} = \text{Bit } 2$)**: Indicates whether the index calculation uses the Address field alone ($\text{SH} = 0$) or adds a 16-bit offset from the Data Payload ($\text{SH} = 1$).
4. **16-Bit Interrupt Index ($\text{Index}$)**: Points directly to an entry inside the host's **Interrupt Remapping Table (IRT)** in system RAM!

---

## Primitive 2: The Vector Isolation Table (Interrupt Remapping Table Entries / IRTE)

Now let us examine the second core primitive: **The Vector Isolation Table** and **Interrupt Remapping Table Entries (IRTE)**.

The **Interrupt Remapping Table (IRT)** is a contiguous array of 128-bit ($16\text{-byte}$) hardware structures allocated in main system DRAM memory by the host hypervisor.

```text
INTERRUPT REMAPPING TABLE (IRT) IN SYSTEM DRAM

 System DRAM Memory Base Address (IRTA Register)
 ┌─────────────────────────────────────────────────────────────┐
 │ INTERRUPT REMAPPING TABLE (IRT - Up to 65,536 Entries)      │
 │ ┌─────────────────────────────────────────────────────────┐ │
 │ │ IRTE Entry 0: [P=1 | BDF=01:00.0 | Vector=42 | CPU=Core 0]│ │
 │ ├─────────────────────────────────────────────────────────┤ │
 │ │ IRTE Entry 1: [P=1 | BDF=02:00.0 | Vector=88 | CPU=Core 8]│ │
 │ ├─────────────────────────────────────────────────────────┤ │
 │ │ IRTE Entry 2: [P=0 | UN-MAPPED / BLOCKED]               │ │
 │ └─────────────────────────────────────────────────────────┘ │
 └─────────────────────────────────────────────────────────────┘
```

---

### Anatomy of a 128-Bit Interrupt Remapping Table Entry (IRTE)

Each 16-byte IRTE entry contains seven hardware security and routing fields:

```text
BITWISE FIELD LAYOUT OF A 128-BIT IRTE ENTRY

 Lower 64 Bits (DW0 - DW1):
 Bit 63                             Bit 32 Bit 31   Bit 16 Bit 15 Bit 8 Bit 7 Bit 0
 ┌────────────────────────────────────────┬───────────────┬───────────┬───────────┐
 │ Destination Logic / APIC ID (32 Bits)  │ SVK / SV Format│ Vector    │ Status    │
 │ (Identifies Target CPU Core 0..255)    │ (Source Check)│ (8 Bits)  │ & Flags   │
 └────────────────────────────────────────┴───────────────┴───────────┴───────────┘

 Upper 64 Bits (DW2 - DW3):
 Bit 127                                           Bit 80 Bit 79           Bit 64
 ┌───────────────────────────────────────────────────────┬────────────────────────┐
 │ Reserved / Virtual APIC Posted Interrupt Pointer      │ Source BDF ID (16 Bits)│
 │                                                       │ (Bus / Device / Func)  │
 └───────────────────────────────────────────────────────┴────────────────────────┘
```

Let us dissect each field inside an IRTE entry:

#### 1. Present Bit ($P$ — Bit 0 of DW0)
* $P = 1 \implies$ Entry is active and mapped.
* $P = 0 \implies$ Entry is un-mapped. Any interrupt TLP targeting an entry with $P = 0$ is **blocked immediately in hardware**!

#### 2. Vector Field ($\text{Vector}$ — 8 Bits, DW0 bits $[15:8]$)
Stores the physical 8-bit CPU interrupt vector number ($0 \dots 255$) delivered to the CPU core (e.g., `Vector = 42`).

#### 3. Destination ID Field ($\text{DestID}$ — 32 Bits, DW1 bits $[63:32]$)
Stores the physical or logical APIC ID of the specific CPU core assigned to process this interrupt (e.g., `DestID = Core 5`).

#### 4. Source ID Field ($\text{Source\_ID}$ — 16 Bits, DW2 bits $[79:64]$)
> **The Core Security Primitive**: Stores the exact $16\text{-bit}$ Bus/Device/Function ID (`BDF`) of the **ONLY physical hardware device permitted to use this IRTE entry**!

#### 5. Source Validation Qualifier ($\text{SVK}$ — 2 Bits, DW0 bits $[19:18]$)
Specifies how strictly the IOMMU validates the incoming TLP's Requester BDF ID against $\text{Source\_ID}$:
* `2'b00`: **No Source Validation** (Unsafe, disabled).
* `2'b01`: **Strict Source BDF Match** ($\text{TLP}_{\text{BDF}} == \text{IRTE}_{\text{Source\_ID}}$).
* `2'b10`: **Bus Range Match** (Verifies that $\text{TLP}_{\text{BDF}}$ falls within a specified bus range).

---

### The Hardware Interrupt Remapping Validation Pipeline

When an in-band interrupt TLP arrives at the IOMMU carrying `IRTE Index = K` and `Requester BDF = 01:00.0`:

The IOMMU executes **The 4-Step Interrupt Validation Pipeline**:

```text
THE 4-STEP INTERRUPT VALIDATION PIPELINE

 Step 1: Index Boundary Check ──► Is Index K < IRT Table Limit?
                                  NO ──► FAULT & BLOCK!
                                  │ YES
                                  ▼
 Step 2: Present Bit Check    ──► Is IRTE_K.Present == 1?
                                  NO ──► FAULT & BLOCK!
                                  │ YES
                                  ▼
 Step 3: Source BDF Check     ──► Is TLP_Requester_BDF == IRTE_K.Source_ID?
                                  NO ──► SPOOFING DETECTED! FAULT & BLOCK!
                                  │ YES
                                  ▼
 Step 4: APIC Formatting      ──► Format clean APIC Interrupt Message:
                                  * Vector = IRTE_K.Vector
                                  * Target = IRTE_K.DestID
                                  Dispatch to Host CPU Local APIC!
```

#### Step 1: Index Boundary Check
The IOMMU verifies that requested index $K$ does not exceed the physical size of the Interrupt Remapping Table in RAM.

#### Step 2: Present Bit Verification
The IOMMU fetches `IRTE Entry K` from DRAM (or from its internal **Interrupt Translation Cache**) and verifies that $P = 1$.

#### Step 3: Source BDF Validation (The Anti-Spoofing Check!)
The IOMMU compares the incoming TLP's `Requester BDF ID` against the `Source_ID` field stored inside `IRTE Entry K`:

$$\mathbf{\text{Validation Match} \iff (P == 1) \quad \mathbf{\text{AND}} \quad (\text{TLP}_{\text{Requester\_BDF}} == \text{IRTE}_K.\text{Source\_ID})}$$

* **If Match Passed**: The incoming interrupt is proven to originate from the authorized hardware device!
* **If Match Failed (Spoofing Attempt Detected!)**:
  * The IOMMU **blocks the interrupt immediately**. The message is discarded. Zero signals reach the CPU local APIC!
  * The IOMMU logs `Requester BDF`, `IRTE Index K`, and `Reason = Source Validation Failed` in its **Fault Recording Register**.
  * The IOMMU raises an IOMMU Fault Interrupt to alert the hypervisor kernel!

#### Step 4: APIC Vector Formatting and Delivery
Once validated, the IOMMU strips the original TLP header, constructs a clean APIC interrupt message carrying `Vector = IRTE_K.Vector` targeting `DestID = IRTE_K.DestID`, and dispatches it directly to the target CPU core's interrupt controller!

---

## Posted Interrupts and Direct Guest APIC Injection

In high-density virtualization, when a guest Virtual Machine receives an interrupt, passing through the hypervisor interrupt handler adds $3 \text{ to } 5\text{ microseconds}$ of software delay.

To eliminate hypervisor intervention during interrupt delivery, modern IOMMUs (Intel VT-d Posted Interrupts / AMD-Vi AVIC / ARM GICv3 ITS) support **Posted Interrupts (Direct Guest Vector Injection)**:

```text
POSTED INTERRUPT DIRECT GUEST INJECTION

 Incoming Interrupt TLP from VF 5 (Assigned to Guest VM 2)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ IOMMU POSTED INTERRUPT ENGINE                               │
 │  * Validates IRTE Entry (Guest Mode Bit G = 1)              │
 │  * Posts Vector directly into Guest VM 2's Virtual APIC Page│
 │  * Sends single Notification Event to Host CPU Core 8       │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Guest VM 2 Execution Pipeline Receives Vector IMMEDIATELY!
 (Zero Hypervisor Traps! Zero Context Switches! 100% Hardware Speed!)
```

1. **Guest Mode Configuration ($G = 1$)**: The hypervisor configures an IRTE entry with `Guest Mode Bit G = 1`, pointing to a physical **Posted Interrupt Descriptor** in RAM assigned to Guest VM 2.
2. **Direct Virtual APIC Posting**: When an interrupt TLP arrives from VF 5, the IOMMU **posts the interrupt vector directly into Guest VM 2's Virtual APIC Page in RAM**!
3. **Hardware Notification Event**: The IOMMU sends a single physical notification interrupt to the host CPU core running VM 2.
4. **Direct Guest Delivery**: The host CPU core injects the vector directly into Guest VM 2's execution pipeline **without executing a hypervisor context switch**! Interrupt delivery latency drops from $5.0\ \mu\text{s}$ down to **$0.2\ \mu\text{s}$ ($200\text{ nanoseconds}$)**!

---

## Solved Industrial Engineering Exercise: Quantitative IRTE Lookup, BDF Validation, Spoofing Attack Neutralization, and Timing Trace

To consolidate your complete mastery of Hardware Interrupt Remapping, 128-bit IRTE register fields, source BDF anti-spoofing validation, and posted interrupt delivery timing, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior hardware security architect auditing an enterprise $3.2\text{ GHz}$ 16-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The host server runs a Hypervisor hosting two tenant Virtual Machines:
* **VM 1 (Untrusted Tenant)**: Assigned Virtual Network Card (`BDF = 01:00.0`).
* **VM 2 (High-Security Banking Tenant)**: Assigned NVMe Storage Controller (`BDF = 02:00.0`).

```text
3.2 GHz SERVER PROCESSOR WITH HARDWARE INTERRUPT REMAPPING

 Untrusted Device 1 (VM 1: BDF 01:00.0) ──┐
                                           ├──► [ IOMMU Interrupt Remapper ] ──► Host APIC
 High-Security Device 2 (VM 2: 02:00.0) ──┘    128-Bit IRTE Table in DRAM       (Core 8 Target)
 Clock T = 312.5 ps                            IRTE 10 (Device 1), IRTE 20 (Device 2)
```

#### Hardware & IRT Configurations in System DRAM:
* Interrupt Remapping Table (IRT) Base Address in DRAM: `0x0000_0001_0000_0000`.
* **IRTE Entry 10** (Configured for Device 1 `01:00.0` / VM 1):
  * `Present P = 1`
  * `Source_ID = 01:00.0` (Bus 1, Device 0, Function 0)
  * `SVK = 2'b01` (Strict Source BDF Match Enabled)
  * `Vector = 42` ($0x2A_{16}$)
  * `DestID = Core 1` (`APIC ID = 0x01`)
* **IRTE Entry 20** (Configured for Device 2 `02:00.0` / VM 2):
  * `Present P = 1`
  * `Source_ID = 02:00.0` (Bus 2, Device 0, Function 0)
  * `SVK = 2'b01` (Strict Source BDF Match Enabled)
  * `Vector = 88` ($0x58_{16}$)
  * `DestID = Core 8` (`APIC ID = 0x08`)

#### Test Event Sequence:
Two in-band interrupt TLPs arrive at the IOMMU over the PCIe interconnect:

* **Event 1 ($t = 0.0\text{ ns}$)**: Device 1 (`01:00.0`) issues a legitimate Interrupt TLP targeting its assigned `IRTE Index = 10`.
* **Event 2 ($t = 50.0\text{ ns}$)**: Device 1 (`01:00.0`) executes an **Interrupt Spoofing Attack**, issuing an Interrupt TLP targeting `IRTE Index = 20` (Attempting to trigger VM 2's Vector 88 on CPU Core 8!).

#### Your Objective

1. Trace **Event 1 (Legitimate Interrupt)**:
   * Show the IOMMU fetching `IRTE Entry 10`.
   * Check Source Validation: `TLP Requester BDF (01:00.0) == IRTE_10.Source_ID (01:00.0)`.
   * Format the APIC message and show delivery of Vector 42 to CPU Core 1.
2. Trace **Event 2 (Interrupt Spoofing Attack)**:
   * Show the IOMMU fetching `IRTE Entry 20`.
   * Check Source Validation: `TLP Requester BDF (01:00.0) == IRTE_20.Source_ID (02:00.0)`.
   * Show the IOMMU **blocking the spoofed interrupt**, logging `Requester BDF = 01:00.0` and `Index = 20` in the Fault Recording Register, and alerting the hypervisor.
3. Calculate the total physical execution time (in nanoseconds and CPU clock cycles) for Event 1 delivery vs Event 2 fault blocking.
4. Verify mathematical, structural, and security correctness.

---

### Step-by-Step Derivation

#### Step 1: Trace Event 1 (Legitimate Interrupt at $t = 0.0\text{ ns}$)

##### 1. TLP Arrival & Index Extraction:
* Device 1 (`BDF = 01:00.0`) dispatches an Interrupt TLP:
  * `Target Address = 0xFEE0_00A4` (Remapped Format: $F = 1$, Index $= 10$).
  * `Requester ID = 01:00.0`.

##### 2. IRTE Fetch & Validation:
* IOMMU calculates IRTE memory location:
  $$\text{IRTE\_Addr} = \text{IRT\_Base} + (\text{Index} \times 16) = \text{0x1\_0000\_0000} + (10 \times 16) = \mathbf{\text{0x1\_0000\_00A0}}$$
* IOMMU fetches 16-byte `IRTE Entry 10` from DRAM (or internal Interrupt Translation Cache).
* **Present Check**: $P = 1 \implies$ **PASSED!**
* **Source BDF Validation Check**:

$$\mathbf{\text{Check: } \text{TLP}_{\text{Requester\_BDF}} \, (\text{01:00.0}) == \text{IRTE}_{10}.\text{Source\_ID} \, (\text{01:00.0}) \quad (\mathbf{\text{SOURCE MATCH PASSED!}})}$$

##### 3. APIC Message Formatting & Delivery:
* The IOMMU strips the TLP header, constructs a clean APIC message carrying `Vector = 42` and `Target = Core 1`, and dispatches it to CPU Core 1's local APIC.
* **Delivery Time**: $T_{\text{event1}} = 16\text{ CPU clock cycles} = \mathbf{5.0 \text{ nanoseconds}}$.

---

#### Step 2: Trace Event 2 (Interrupt Spoofing Attack at $t = 50.0\text{ ns}$)

##### 1. TLP Arrival & Index Extraction:
* Device 1 (`BDF = 01:00.0`) dispatches a spoofed Interrupt TLP:
  * `Target Address = 0xFEE0_0144` (Remapped Format: $F = 1$, Index $= 20$).
  * `Requester ID = 01:00.0` (Device 1!).

##### 2. IRTE Fetch & Source BDF Validation:
* IOMMU fetches `IRTE Entry 20` (offset `0x1000_0140`):
  * `Present Bit P = 1`.
  * `IRTE_20.Source_ID = 02:00.0` (Assigned to Device 2 / VM 2!).
* **Source BDF Validation Check**:

$$\mathbf{\text{Check: } \text{TLP}_{\text{Requester\_BDF}} \, (\text{01:00.0}) == \text{IRTE}_{20}.\text{Source\_ID} \, (\text{02:00.0}) \quad (\mathbf{\text{SOURCE MATCH FAILED!}})}$$

```text
EVENT 2 SPOOFING ATTACK NEUTRALIZATION

 TLP Requester BDF = 01:00.0 (Device 1)
                       │
                       ▼
 IOMMU fetches IRTE Entry 20 ──► IRTE_20.Source_ID = 02:00.0 (Device 2!)
                                 │
                                 ▼
           SOURCE BDF MATCH FAILED! (SPOOFING ATTACK DETECTED!)
```

##### 3. Hardware Fault Execution:
1. **Interrupt Blocked**: The IOMMU **blocks the interrupt immediately**. Zero bytes reach CPU Core 8's APIC! VM 2's Vector 88 is **$100\%$ protected**!
2. **AER / IOMMU Fault Logging**: The IOMMU records the attack metadata in its **Fault Recording Register**:
   * `Faulting BDF` $= \mathbf{\text{01:00.0}}$
   * `Target IRTE Index` $= \mathbf{20}$
   * `Reason Code` $= \mathbf{\text{0x09}} \quad (\text{Interrupt Source BDF Validation Failed})$
3. **Hypervisor Security Alert**: The IOMMU asserts a high-priority fault interrupt to the Hypervisor kernel, allowing the cloud manager to terminate VM 1 and quarantine slot `01:00.0`.
4. **Execution Time**: The attack is blocked at the gate in $T_{\text{event2}} = 8\text{ CPU clock cycles} = \mathbf{2.5 \text{ nanoseconds}}$!

```text
EVENT COMPARISON SUMMARY

 Event Name │ Originating BDF │ Targeted Index │ IRTE Source_ID │ Resulting Action │ Time (ns)
────────────┼─────────────────┼────────────────┼────────────────┼──────────────────┼───────────
 Event 1    │ 01:00.0 (Dev 1) │ Index 10       │ 01:00.0        │ DELIVERED (Vec 42)│ 5.0 ns
 Event 2    │ 01:00.0 (Dev 1) │ Index 20       │ 02:00.0        │ BLOCKED & LOGGED!│ 2.5 ns
            │ (Spoof Attempt!)│ (VM 2 Target)  │ (VM 2 Owner)   │ (Kernel Safe!)   │ (8 Cycles)
```

---

### Sanity Check and Verification

Let us verify our mathematical and hardware security results against IOMMU specification rules:

1. **Source BDF Validation Invariant**:
   * Event 1: `01:00.0 == 01:00.0` $\implies$ Match Passed $\implies$ Interrupt delivered.
   * Event 2: `01:00.0 != 02:00.0` $\implies$ Match Failed $\implies$ Interrupt blocked.
   * Source validation executed with $100\%$ mathematical certainty, defeating the spoofing attack!
2. **IRTE Index Math Verification**:
   * Index 10 address $= \text{0x1\_0000\_0000} + (10 \times 16) = \text{0x1\_0000\_00A0}$.
   * Index 20 address $= \text{0x1\_0000\_0000} + (20 \times 16) = \text{0x1\_0000\_0140}$.
   * 128-bit ($16\text{-byte}$) stride math verified with $100\%$ precision!
3. **APIC Isolation Guarantee**:
   * CPU Core 8 (VM 2's target) received zero signals during Event 2, proving complete multi-tenant vector isolation.

All 128-bit IRTE field maps, source BDF validation checks, remapped address bitfields ($F = 1$), and fault-logging register states evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Interrupt Remapping**: An IOMMU hardware security mechanism that intercepts incoming in-band interrupt Memory Write TLPs, validates their source BDF IDs against a hardware Interrupt Remapping Table (IRT), and translates virtual interrupt indices into target-specific CPU vector messages, eliminating interrupt spoofing attacks.
* **Vector Isolation Table**: A contiguous array of 128-bit hardware structures (IRTE) in system DRAM—managed exclusively by the hypervisor—that defines the authorized source BDF ID (`Source_ID`), physical vector number, and target CPU core (`DestID`) for every interrupt index, enforcing multi-tenant interrupt vector isolation.
