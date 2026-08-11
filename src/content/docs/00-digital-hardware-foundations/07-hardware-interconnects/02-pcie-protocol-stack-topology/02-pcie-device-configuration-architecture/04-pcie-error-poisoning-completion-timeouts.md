---
title: "Advanced Error Reporting (AER) Architecture and TLP Data Poisoning Mechanics"
---

# Advanced Error Reporting (AER) Architecture and TLP Data Poisoning Mechanics

## The Invisible Data Corruption Silent Hazard and the Unresponsive Completion Deadlock

In high-performance computer engineering, PCI Express (PCIe) interconnect networks serve as the primary data highways connecting central processing unit (CPU) cores to graphics accelerators, network interface cards, and high-speed NVMe storage arrays. Millions of Transaction Layer Packets (TLPs) traverse these point-to-point links every second, carrying critical operating system instructions, financial transaction ledgers, and real-time sensor streams.

However, a high-frequency interconnect is a complex physical environment. As packets travel through motherboard traces, PCIe switches, and internal memory buffers, hardware errors periodically occur:
* An alpha particle or cosmic ray strikes an internal SRAM buffer inside a PCIe switch, flipping a bit in a data payload (**SRAM Soft Error**).
* Voltage supply fluctuations on a graphics card cause an internal register to mis-sample a byte during address translation.
* A malfunctioning or overheated peripheral endpoint drops a read request, failing to process an incoming packet.

When a hardware error occurs inside an interconnect, the memory subsystem faces two severe, system-fatal hazards: **Silent Data Corruption (SDC)** and **The Unresponsive Completion Deadlock**.

```text
THE TWO INTERCONNECT ERROR CATASTROPHES

 Hazard 1: SILENT DATA CORRUPTION (SDC)
 Corrupted Data Payload ──► Written directly into DRAM / CPU Registers!
                            (Software receives bad data without ANY error flag!)
                            (Databases corrupted, system crashes unexpectedly!)

 Hazard 2: UNRESPONSIVE COMPLETION DEADLOCK
 Read Request Dispatched ──► Packet Dropped by Malfunctioning Device!
                             │
                             ▼
              CPU CORE FROZEN FOREVER IN OUT-OF-ORDER STALL!
              (Waiting for a read completion response that will NEVER arrive!)
```

Let us examine why both hazards destroy computer reliability:

### 1. Silent Data Corruption (SDC)
Suppose a PCIe switch's internal buffer suffers a bit-flip that corrupts a 64-byte memory write data payload. If the switch continues forwarding the packet without warning the host CPU, the corrupted payload is written directly into main system RAM. 

The CPU and operating system kernel have no idea the data was corrupted! The application reads the bad data, leading to **Silent Data Corruption (SDC)**. 

Financial databases record incorrect balances, medical imaging software displays distorted pixels, or kernel code executes invalid pointers, causing sudden, un-diagnosable system panics.

### 2. The Unresponsive Completion Deadlock
Suppose a CPU core executes a non-posted memory read instruction (`LOAD R1, [Addr A]`). The CPU out-of-order execution engine dispatches a Memory Read TLP (`MRd`) across the interconnect and enters a hardware stall state, waiting for the target peripheral to return a **Completion with Data TLP (`CplD`)**.

Now, suppose the target peripheral overheats, suffers a internal firmware crash, and **drops the read request**!

If no safety mechanism exists:
* The target peripheral never sends a completion packet back.
* The CPU core sits waiting for `CplD` on address $A$.
* Because the CPU's load instruction cannot retire, **the CPU's out-of-order Reorder Buffer (ROB) fills up completely and locks!**
* The entire processor core freezes permanently (**Completion Timeout Lockup**), requiring a hard power reset.

How can a high-speed PCIe interconnect detect, classify, and log hardware errors in real time? 

How can it mark corrupted data payloads safely as "poisoned" so they can be delivered to un-stall CPU read requests without writing bad data to RAM? 

And if a peripheral device drops a packet and fails to respond, how does the host CPU recover automatically without hanging the entire machine?

To eliminate silent data corruption and unresponsive completion deadlocks, PCI Express employs **Advanced Error Reporting (AER)**, **TLP Data Poisoning (Error Forwarding)**, and **Completion Timeout (CTO) Timers**.


### Handling Policy 1: Silent Delivery of Broken Glass (Silent Data Corruption)

Halfway down the bumpy road, the delivery truck hits a massive pothole (**SRAM Parity Error inside a PCIe Switch**). The glass vase inside Box #42 shatters into a thousand sharp pieces.

The truck driver notices the broken glass inside the box, but says nothing:
1. The driver delivers the sealed box to the customer's house.
2. The customer sees the box arrive, un-stalls, and takes the box inside.
3. The customer opens the box without realizing it is broken, reaches inside, and gets severely injured by the sharp shards (**Silent Data Corruption**)!


### Handling Policy 3: The Red Hazard Sticker and the Kitchen Alarm (TLP Poisoning & Completion Timeout)

To solve both problems, the delivery company adopts two smart engineering mechanisms:

#### Mechanism A: The Red Hazard Sticker (TLP Data Poisoning / Error Forwarding)
When the driver discovers that the glass inside Box #42 is shattered:
* The driver does **NOT** throw the box away!
* The driver takes a bright, neon-red **Hazard Sticker (Sets the Poisoned Bit `EP = 1`)** and slaps it onto the front of Box #42!
* The driver delivers Box #42 to the customer's house with the Red Hazard Sticker prominently displayed.

```text
TLP POISONING: THE RED HAZARD STICKER

 Driver discovers shattered glass inside Box #42
                       │
                       ▼
 Slaps Red Hazard Sticker (Poisoned Bit EP = 1) onto Box #42!
 Delivers Box #42 to Customer's House.
                       │
                       ▼
 Customer sees Box #42 arrive ──► UN-STALLS IMMEDIATELY! (Delivery complete!)
 Customer sees RED STICKER     ──► THROWS BOX AWAY SAFELY! (Zero Injury!)
```

Look at what the Red Hazard Sticker achieved:
1. **The Customer Un-stalled**: The customer saw Box #42 arrive, so they stood up and resumed their day (**No Completion Timeout!**).
2. **Zero Injury**: The customer saw the Red Hazard Sticker, knew the contents were ruined, and **threw the box straight into the recycling bin without opening it** (**Zero Silent Data Corruption!**).

#### Mechanism B: The Kitchen Alarm Timer (Completion Timeout / CTO Timer)
What if the delivery truck broke down in a ditch and never arrived at all?

Before sitting on the porch, the customer sets a $10\text{-minute}$ **Kitchen Alarm Timer (Completion Timeout Timer)**:
1. If Box #42 arrives within 10 minutes, the customer turns off the kitchen alarm.
2. If 10 minutes pass and Box #42 has NOT arrived, the kitchen alarm rings (**Timeout Expired**)!
3. The customer says: *"The delivery failed! I am going to stop waiting, log a delivery complaint (**Log AER Status Error**), and go back inside to work!"*

```text
COMPLETION TIMEOUT (CTO) ALARM TIMER

 Customer sets 10-Minute Kitchen Timer before waiting on porch.
                       │
                       ▼ (10 Minutes pass; No Truck Arrives!)
 Kitchen Alarm Rings! (Completion Timeout Expired!)
 Customer stops waiting, logs Error Report, and goes inside to work!
 (Customer un-stalls safely; System deadlock prevented!)
```

This certified delivery system is the exact physical analogue of **Advanced Error Reporting, TLP Data Poisoning, and Completion Timeouts**:
* The factory is a **PCIe Endpoint (NVMe / GPU)**.
* The fragile glass vase is a **TLP Data Payload**.
* The customer waiting on the porch is a **CPU Out-of-Order Reservation Station**.
* The pothole on the road is an **SRAM Buffer Parity/ECC Error inside a PCIe Switch**.
* The Red Hazard Sticker is the **TLP Header Poisoned Bit (`EP = 1`)**.
* Delivering the stickered box is **TLP Data Poisoning (Error Forwarding)**.
* The 10-minute kitchen timer is the **Hardware Completion Timeout (CTO) Timer**.
* Logging a delivery complaint is **AER Status Register Logging**.


### The Three JEDEC/PCIe Error Severity Classes

PCI Express classifies all hardware interconnect errors into three distinct severity levels:

```text
THE THREE PCIE ERROR SEVERITY CLASSES

                         PCIE INTERCONNECT ERRORS
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
 CORRECTABLE ERRORS        UNCORRECTABLE NON-FATAL    UNCORRECTABLE FATAL
 * Repaired automatically  * Transaction failed,      * Link or device crashed!
   by hardware (LCRC/FEC).   BUT link stays alive!    * System cannot continue
 * Zero software impact.   * Driver recovers gracefully. safely without reset.
```

#### 1. Correctable Errors
* **Definition**: Physical or link-level errors that are **detected and automatically repaired by hardware** without any data loss or software intervention.
* **Examples**:
  * An LCRC checksum failure repaired by a Data Link Layer `NAK` re-transmission.
  * A single-bit physical transmission error repaired by Forward Error Correction (FEC) in PCIe Gen6 PAM4 mode.
  * Bad DLLP packets dropped by link layer CRC-16 checks.
* **Hardware Action**: The hardware fixes the error in a few nanoseconds. The AER engine sets a bit in the `Correctable Error Status Register` (Offset `0x10`) to inform operating system telemetry, but **execution continues with zero software stalls**.

#### 2. Uncorrectable Non-Fatal Errors
* **Definition**: Hardware errors where a specific memory transaction failed or data was corrupted, **BUT the physical PCIe link and device hardware remain fully functional**.
* **Examples**:
  * Receiving a Poisoned TLP (`EP = 1`).
  * A Completion Timeout (CTO) where a target device failed to respond.
  * An Unexpected Completion (`Cpl`) arriving for a tag that was never requested.
  * A memory write targeting an un-mapped BAR address (`DECERR`).
* **Hardware Action**: The specific transaction is aborted or safely discarded. The AER engine sets a bit in the `Uncorrectable Error Status Register` (Offset `0x04`) and logs the packet header. 
  
  Because the link is still alive, the operating system driver receives an interrupt, isolates the failing thread, and **recovers gracefully without crashing the whole computer**!

#### 3. Uncorrectable Fatal Errors
* **Definition**: Severe, catastrophic hardware failures where the physical PCIe link, switch, or device interface has experienced a un-recoverable crash or loss of signal integrity.
* **Examples**:
  * Loss of physical link training (LTSSM state machine drops to `Detect` or `Disabled`).
  * A Receiver Buffer Overflow where a device ran out of SRAM space and dropped packets.
  * A Malformed TLP where packet header length fields violate protocol specifications.
* **Hardware Action**: The link is no longer reliable. The AER engine logs the failure, and the operating system kernel issues a **Kernel Panic / Blue Screen BSOD** or resets the entire PCIe slot to prevent data corruption.


## Primitive 2: TLP Data Poisoning (Error Forwarding) and Completion Timeouts

Now let us examine the two core operational primitives that manage error propagation and recovery: **TLP Data Poisoning** and **Completion Timeout Timers**.


### Mechanics of Completion Timeouts (CTO)

While TLP Poisoning handles packets that arrive with corrupted data, what happens if a peripheral device crashes completely and sends **NO PACKET AT ALL** in response to a Non-Posted Read Request?

To recover from missing completion packets, every PCIe device that issues Non-Posted requests (Memory Reads, Config Reads, I/O Reads) incorporates a **Completion Timeout (CTO) Timer**.

```text
COMPLETION TIMEOUT (CTO) TIMER ARCHITECTURE

 Host CPU (Requester)                               Peripheral Device (Completer)
 ┌───────────────────────────┐                      ┌───────────────────────────┐
 │ Dispatches MRd TLP (Tag 5)├─────── Bus ─────────►│ Crashes / Drops Request!  │
 ├───────────────────────────┤                      └───────────────────────────┘
 │ STARTS CTO TIMER (Tag 5)  │                       (Zero Completion Returned!)
 │ (Countdown: 100 us)       │
 └─────────────┬─────────────┘
               │
               ▼ (100 us Passes... CTO Timer Expires!)
 1. Synthesizes Local Dummy Completion (Status = UR / Un-mapped)!
 2. Delivers Dummy Data to CPU Core ──► UN-STALLS CPU PIPELINE!
 3. Sets Bit 14 (Completion Timeout) in AER Status Register!
```


## Real-World Systems Engineering: PCIe Error Handling in Linux Kernel and Cloud Data Centers

In enterprise cloud data centers running thousands of PCIe-attached accelerators and storage arrays, handling interconnect errors gracefully is essential for maintaining $99.999\%$ service availability.

```text
ENTERPRISE PCIE ERROR RECOVERY STACK

 Hardware AER Detects Error ──► Asserts PCIe System Error Interrupt (AER Interrupt)
                                │
                                ▼
 Linux Kernel PCIe AER Driver (`drivers/pci/pcie/aer.c`)
 1. Reads AER Status Register & Header Log via ECAM.
 2. Identifies failing BDF (e.g., NVMe Drive 02:00.0).
 3. Calls Driver Error Recovery Callbacks:
    * `error_detected()` ──► Freezes new I/O requests.
    * `slot_reset()`     ──► Issues Hardware In-Band Reset to PCIe Slot.
    * `resume()`         ──► Re-initializes device BARs & resumes execution!
```

### The Linux Kernel AER Recovery Framework

When a PCIe device triggers an uncorrectable non-fatal error (such as a Poisoned TLP or Completion Timeout), the Linux kernel's PCIe AER subsystem (`drivers/pci/pcie/aer.c`) executes an automated **PCIe Slot Error Recovery Protocol**:

1. **AER Interrupt Handling**: The host Root Complex receives an AER interrupt and notifies the Linux kernel.
2. **Error Diagnostic Reading**: The kernel reads the `Uncorrectable Error Status Register` and `Header Log` over ECAM to identify the exact BDF ID (`02:00.0`) of the failing device.
3. **Driver Notification (`error_detected`)**: The kernel calls the registered device driver's `error_detected()` method. The driver stops accepting new I/O requests from user applications.
4. **Hardware Slot Reset (`slot_reset`)**: The kernel issues a fundamental hardware reset signal to the PCIe slot, clearing frozen internal state buffers inside the peripheral chip.
5. **BAR Re-Configuration & Resume (`resume`)**: The kernel re-programs the device's Base Address Registers (BARs) and calls `resume()`. The device resumes processing I/O requests **without requiring a reboot of the physical server**!


### Scenario and Parameters

You are a senior microarchitect auditing the error handling subsystem for a $3.2\text{ GHz}$ 64-bit server processor host ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The host connects to an NVMe SSD Endpoint (`BDF = 02:00.0`) through an intermediate PCIe Gen4 Switch over a $\times 4$ link.

```text
3.2 GHz HOST SERVER WITH PCIe GEN4 SWITCH AND NVME ENDPOINT

 Host Root Complex (3.2 GHz) ──► [ PCIe Switch ] ──► [ NVMe SSD (BDF 02:00.0) ]
 Clock T = 312.5 ps               Internal SRAM       Completion Timeout = 50 us
                                  ECC Buffer Error    Range A (160,000 CPU Cycles)
```

#### Hardware Timing and Error Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
* Host Completion Timeout (CTO) Timer Range A: Configured to $T_{\text{CTO}} = 50.0\text{ microseconds}$ ($50,000\text{ ns} = 160,000\text{ CPU clock cycles}$).
* Link Transit Latency (Host to Endpoint round trip): $T_{\text{transit}} = 20.0\text{ ns}$ ($64\text{ CPU clock cycles}$).
* AER Extended Capability Base Address on Host: Offset `0x100` in Extended Configuration Space.

#### The Workload Test Event:
At physical time $t = 0.0\text{ ns}$ (CPU Cycle 0), the Host CPU dispatches a Non-Posted Memory Read TLP (`MRd`):
* `Requester ID = 00:00.0` (Host)
* `Target Address = 0x0000_0000_8000_1000` (NVMe MMIO Data Buffer)
* `Tag = 0x15` ($21_{10}$)
* `Length = 16 DWs` ($64\text{ Bytes}$)

You must analyze two distinct hardware failure scenarios:

* **Scenario A (Internal Buffer ECC Failure $\to$ TLP Poisoning)**:
  At $t = 10.0\text{ ns}$, the NVMe controller attempts to read the $64\text{-byte}$ data payload from its internal SRAM buffer. An un-correctable 2-bit ECC error occurs in the NVMe controller's SRAM buffer. The controller sets `EP = 1` and returns a Poisoned Completion TLP (`CplD`).
* **Scenario B (Device Controller Crash $\to$ Completion Timeout)**:
  At $t = 10.0\text{ ns}$, the NVMe controller suffers a total power rail collapse and crashes completely, sending **ZERO completion packets** back to the Host.

#### Your Objective

1. For **Scenario A (TLP Poisoning)**:
   * Construct the 32-bit DW0 header vector for the returning `CplD` TLP, showing the exact bit position of the Poisoned Bit (`EP = 1`).
   * Trace the Host Root Complex receiving the `CplD` TLP at $t = 30.0\text{ ns}$. Show how `EP = 1` cancels the CTO timer early and un-stalls the CPU pipeline, while setting Bit 12 (`Poisoned TLP Received`) in the Host's AER Uncorrectable Error Status Register.
   * Calculate the total CPU stall time in nanoseconds and CPU clock cycles.
2. For **Scenario B (Completion Timeout)**:
   * Trace the Host CTO Timer counting down to expiration.
   * Calculate the exact physical time (in nanoseconds) and CPU clock cycles when the CTO timer expires.
   * Show how the CTO engine sets Bit 14 (`Completion Timeout`) in the Host's AER Status Register, logs the 16-byte header in the AER `Header Log Register`, and synthesizes a dummy completion to un-stall the CPU.
3. Calculate the physical time savings (in nanoseconds and CPU clock cycles) provided by TLP Poisoning (Scenario A) over waiting for the Completion Timeout (Scenario B).
4. Verify mathematical, structural, and timing correctness.


#### Step 2: Analyze Scenario B (Device Crash $\to$ Completion Timeout Expiration)

At $t = 10.0\text{ ns}$, the NVMe controller crashes completely. Zero completion packets are sent.

##### 1. Host CTO Timer Countdown:
The Host CTO Timer was initialized at $t = 0.0\text{ ns}$ with $T_{\text{CTO}} = 50.0\text{ }\mu\text{s} = 50,000\text{ ns}$.

$$\text{Expiration Time } t_{\text{expire}} = \mathbf{50,000.0 \text{ nanoseconds}} \quad (50.0 \text{ }\mu\text{s})$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$\text{Stall Cycles}_{\text{CTO}} = \frac{50,000.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{160,000 \text{ CPU Clock Cycles}}$$

##### 2. CTO Timer Expiration Actions at $t = 50,000.0\text{ ns}$ (Cycle 160,000):
* The CTO Timer reaches $0$ and fires!
* **AER Status Register Update**: The Host sets **Bit 14 (`Completion Timeout`)** in its AER Uncorrectable Error Status Register (Offset `0x04`):

$$\text{AER Uncorrectable Status Reg } (\text{Offset 0x04}) \Leftarrow \mathbf{\text{0x0000\_4000}} \quad (\text{Bit 14 = 1})$$

* **AER Header Log Register Capture**: The 16-byte header of the original `MRd` request is frozen in the Header Log Register (Offset `0x1C`):
  * `DW0` = `0x0000_0010` (`MRd`, Length 16 DWs)
  * `DW1` = `0x0000_15FF` (`Requester ID = 00:00.0`, `Tag = 0x15`, `BE = 0xFF`)
  * `DW2` = `0x8000_1000` (Target Address `0x8000_1000`)
  * `DW3` = `0x0000_0000`
* **Dummy Completion Synthesis**: The Host Root Complex synthesizes a local dummy `Cpl` with status `Completer Abort (CA)`.
* **CPU Pipeline Release**: The dummy completion is delivered to the waiting load instruction, **releasing the CPU core from its 160,000-cycle stall**!


### Sanity Check and Verification

Let us verify our mathematical and bitwise AER calculations against PCIe specification rules:

1. **Header Poisoned Bit Verification**:
   * Header DW0 = `0x4A00_4010`.
   * Bit 14 $= 1 \implies \text{32'b0000\_0000\_0000\_0000\_0100\_0000\_0000\_0000}_2 = \text{0x0000\_4000}$.
   * Bit 14 is correctly set High, verifying valid TLP Data Poisoning encoding.
2. **AER Uncorrectable Status Bit Mapping**:
   * Scenario A: Bit 12 (`Poisoned TLP Received`) $= \text{1'b1} \implies \text{0x0000\_1000}$.
   * Scenario B: Bit 14 (`Completion Timeout`) $= \text{1'b1} \implies \text{0x0000\_4000}$.
   * Status register bit assignments match JEDEC/PCIe AER specifications with $100\%$ precision.
3. **CTO Timer Expiration Math**:
   * $T_{\text{CTO}} = 50.0\text{ }\mu\text{s} = 50,000\text{ ns}$.
   * CPU clock frequency $= 3.2\text{ GHz} \implies T_{\text{clk}} = 0.3125\text{ ns}$.
   * Cycles $= 50,000 / 0.3125 = 160,000\text{ CPU cycles}$. Conversion verified!

All AER bitfield maps, TLP header `EP` bit encodings, CTO countdown timer durations, and pipeline recovery speedup calculations evaluate with 100% mathematical, physical, and logical precision.

