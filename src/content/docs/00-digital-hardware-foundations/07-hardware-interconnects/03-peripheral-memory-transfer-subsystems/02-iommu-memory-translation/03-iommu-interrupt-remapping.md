---
title: "Hardware Interrupt Remapping Architecture and Vector Isolation Tables"
---

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


## Solved Industrial Engineering Exercise: Quantitative IRTE Lookup, BDF Validation, Spoofing Attack Neutralization, and Timing Trace

To consolidate your complete mastery of Hardware Interrupt Remapping, 128-bit IRTE register fields, source BDF anti-spoofing validation, and posted interrupt delivery timing, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

