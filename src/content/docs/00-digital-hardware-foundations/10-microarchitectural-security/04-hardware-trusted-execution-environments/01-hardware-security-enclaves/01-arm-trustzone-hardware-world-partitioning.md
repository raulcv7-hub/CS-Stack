---
title: "ARM TrustZone Hardware Architecture and Secure World Partitioning"
---

# ARM TrustZone Hardware Architecture and Secure World Partitioning

In modern computing systems, software operating system kernels—such as Linux, Android, or Windows—are composed of millions of lines of complex C and C++ code. Because of this massive software complexity, operating system kernels frequently suffer from software bugs, memory corruption vulnerabilities, and privilege escalation exploits. In a conventional CPU architecture, an operating system kernel operates at the highest software privilege level (Ring 0 / EL1). If a malicious application or remote attacker successfully exploits a kernel buffer overflow, they gain root privileges, granting them unrestricted access to all physical RAM, cryptographic master keys, and private user data across the system. Software privilege rings are fundamentally incapable of protecting secrets when the operating system kernel itself is compromised. To solve this fundamental security limitation, hardware architects developed a hardware-enforced isolation paradigm that sits parallel to and beneath the operating system: **ARM TrustZone Architecture**. ARM TrustZone is a system-wide hardware security extension that partitions a System-on-Chip (SoC)—including its CPU processing cores, memory buses, system caches, DRAM memory controllers, and physical hardware peripherals—into two completely isolated execution domains: **The Normal World (Non-Secure World)** and **The Secure World**. The Normal World runs the feature-rich, complex operating system (such as Android or Linux), while the Secure World runs a lightweight, audited security operating system (a Secure OS or TEE) dedicated to high-value tasks such as biometric verification, cryptographic key storage, and payment processing. The isolation between these two worlds is enforced directly by hardware bus logic via a dedicated physical signal wire embedded in the system interconnects—the **Non-Secure (NS) Bit**. Even if an attacker gains $100\%$ root control over the Normal World operating system kernel, the physical hardware memory controllers reject any attempt by the Normal World to read or write Secure World DRAM pages or access protected hardware peripherals, establishing an impenetrable silicon-level security boundary.

```text
ARM TRUSTZONE SYSTEM-WIDE HARDWARE PARTITIONING

 NORMAL WORLD (Non-Secure NS = 1)          SECURE WORLD (Secure NS = 0)
 ┌─────────────────────────────┐           ┌─────────────────────────────┐
 │ Rich OS (Android / Linux)   │           │ Secure OS (OP-TEE / Trusty) │
 │ User Apps & Device Drivers  │           │ Biometrics, Key Storage     │
 └──────────────┬──────────────┘           └──────────────┬──────────────┘
                │                                         │
                ▼                                         ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │ CPU CORE SECURITY EXTENSIONS & SYSTEM BUS (AMBA AXI INTERCONNECT)     │
 │ Physical Non-Secure (NS) Bit Signal Wire Driven on Every Bus Access  │
 ├─────────────────────────────┬──────────────────────────┬──────────────┤
 │ TZASC Memory Controller     │ TZPC Peripheral Control  │ GIC Interrupt│
 │ (Filters DRAM Access)       │ (Locks Hardware Sensors) │ (FIQ / IRQ)  │
 └─────────────────────────────┴──────────────────────────┴──────────────┘
```


## The Non-Secure (NS) Bit and AMBA System Bus Propagation

Unlike software-only isolation mechanisms that operate within individual CPU registers, ARM TrustZone is a **system-wide hardware architecture**. Isolation extends beyond the CPU core to encompass every hardware component attached to the system bus.

### The AMBA AXI/AHB Bus Architecture and the Physical NS Wire

Modern ARM System-on-Chips utilize the **AMBA AXI (Advanced eXtensible Interface)** or AHB bus interconnect fabric to connect CPU cores, memory controllers, graphics processing units (GPUs), Direct Memory Access (DMA) engines, and hardware peripherals.

```text
AMBA AXI BUS INTERCONNECT WITH PHYSICAL NS SIGNAL WIRE

 CPU Core / DMA Engine (Master)               AXI Interconnect Fabric
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Address Lines A[63:0]     ├───────────────►│ Address Decoding Logic    │
 │ Data Lines DATA[128:0]    ├───────────────►│ Data Routing Matrix       │
 │ Control Lines (READ/WRITE)├───────────────►│ Transaction Control       │
 ├───────────────────────────┤                ├───────────────────────────┤
 │ PHYSICAL NS SIGNAL WIRE   ├───────────────►│ HARDWARE SECURITY CHECK   │
 │ (Driven 0=Secure, 1=NonSec)│                │ Matches NS against Access │
 └───────────────────────────┘                └─────────────┬─────────────┘
                                                            │
                                                            ▼
                                           [ Memory / Peripheral Targets ]
```

In a TrustZone-enabled ARM SoC, the AMBA AXI bus specification adds an explicit, extra physical signal wire to every read and write transaction channel: **The Non-Secure ($NS$) Bit**.

Every time a bus master (such as a CPU core or a DMA engine) issues a memory read or write transaction, the hardware bus controller drives the physical $NS$ wire alongside the address and data lines:
* **$NS = 0$ (Secure World Transaction)**: The memory or peripheral access originated from a CPU core or hardware master operating in the **Secure World**.
* **$NS = 1$ (Non-Secure World Transaction)**: The memory or peripheral access originated from a CPU core or hardware master operating in the **Normal World**.


## CPU Processing States and ARMv8 Exception Levels

To understand how the CPU core switches between the Normal World and the Secure World, we must examine ARMv8-A Exception Levels and execution states.

### The Dual-World Exception Level Structure

The ARMv8-A 64-bit architecture defines four hierarchical **Exception Levels (EL0 through EL3)**, where higher numbers represent higher software privilege:

```text
ARMv8-A DUAL-WORLD EXCEPTION LEVEL ARCHITECTURE

          NORMAL WORLD (NS = 1)                   SECURE WORLD (NS = 0)
 ┌─────────────────────────────────────┐ ┌─────────────────────────────────────┐
 │ EL0_NS: User Applications           │ │ EL0_S: Secure User Trusted Apps     │
 ├─────────────────────────────────────┤ ├─────────────────────────────────────┤
 │ EL1_NS: Rich OS Kernel (Linux)      │ │ EL1_S: Secure OS Kernel (OP-TEE)    │
 ├─────────────────────────────────────┤ ├─────────────────────────────────────┤
 │ EL2_NS: Hypervisor (KVM / Xen)      │ │ EL2_S: Secure Hypervisor (SPMC)     │
 └──────────────────┬──────────────────┘ └──────────────────┬──────────────────┘
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ EL3: SECURE MONITOR (Always NS = 0)                                         │
 │  * Highest Privilege Level in Hardware                                      │
 │  * Manages World Switches via 'SMC' Instruction                              │
 └─────────────────────────────────────────────────────────────────────────────┘
```

Look at the architectural layout in the diagram above:
1. **Normal World ($NS = 1$)**:
   * **EL0_NS**: Unprivileged user applications (e.g., web browsers, media players).
   * **EL1_NS**: Rich operating system kernel (e.g., Linux or Android kernel).
   * **EL2_NS**: Virtual machine hypervisor (e.g., KVM or Xen).
2. **Secure World ($NS = 0$)**:
   * **EL0_S**: Secure user-space Trusted Applications (e.g., DRM decoders, payment processing apps).
   * **EL1_S**: Secure operating system kernel (e.g., OP-TEE, Trusty OS).
   * **EL2_S**: Secure partition manager / Secure hypervisor.
3. **EL3: The Secure Monitor (Always $NS = 0$)**:
   * EL3 is the **highest privilege level in the entire system**.
   * It exists outside the Normal/Secure world split and operates strictly in the Secure domain ($NS = 0$).
   * EL3 executes the **Secure Monitor Firmware**, which is responsible for mediating all world-switch transitions between the Normal World and the Secure World.


## Memory and Peripheral Partitioning Hardware: TZASC, TZPC, and GIC

ARM TrustZone is not limited to isolating the CPU core. To prevent a compromised Normal World OS from accessing RAM or hardware devices, TrustZone incorporates three specialized hardware controllers on the SoC:

```text
TRUSTZONE SYSTEM-ON-CHIP HARDWARE CONTROLLERS

                        AMBA AXI SYSTEM INTERCONNECT
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
 TRUSTZONE ADDRESS SPACE    TRUSTZONE PROTECTION       GENERIC INTERRUPT
 CONTROLLER (TZASC / TZC)   CONTROLLER (TZPC)          CONTROLLER (GIC)
 * Partitions physical RAM  * Locks physical hardware  * Routes Group 0 (FIQ)
   into Secure & Non-Sec.     peripherals (Sensors).     interrupts to Secure World.
```


### 2. TrustZone Protection Controller (TZPC)

While the TZC-400 protects DRAM, the **TrustZone Protection Controller (TZPC)** protects physical hardware peripherals (such as the fingerprint sensor, camera, touchscreen, hardware AES crypto engine, and internal OTP fuses).

```text
PERIPHERAL HARDWARE LOCKING VIA TZPC

 Hardware Peripherals on SoC
 ┌─────────────────────────────────────────────────────────────┐
 │ UART Serial Port      ──► Configured as Non-Secure (NS = 1) │
 │ Ethernet Controller   ──► Configured as Non-Secure (NS = 1) │
 ├─────────────────────────────────────────────────────────────┤
 │ Fingerprint Sensor    ──► LOCKED AS SECURE ONLY (NS = 0)!   │
 │ Hardware Crypto Engine──► LOCKED AS SECURE ONLY (NS = 0)!   │
 └─────────────────────────────────────────────────────────────┘
  (Normal World Linux CANNOT read or write Fingerprint Sensor registers!)
```

* **Hardware Action**: The TZPC configures the hardware control lines of peripheral APB/AXI bridges.
* If the fingerprint sensor is marked **Secure Only ($NS = 0$)**:
  * Any read or write command issued to the fingerprint sensor's register addresses from the Normal World ($NS = 1$) is **dropped by the bus bridge in hardware**.
  * The Normal World cannot capture raw fingerprint images or tamper with cryptographic fuses!


## Microarchitectural Attack Surface: Cross-World Cache Side-Channels

While ARM TrustZone provides robust hardware isolation for physical memory transactions and bus accesses, security engineers must account for a subtle microarchitectural attack vector: **Shared CPU Caches**.

```text
CROSS-WORLD CACHE SIDE-CHANNEL HAZARD

 CPU Core Level 1 / Level 2 Cache Array
 ┌─────────────────────────────────────────────────────────────┐
 │ Line 0: Normal World Linux Code Page (NS = 1)               │
 │ Line 1: SECURE WORLD AES KEY LOOKUP TABLE (NS = 0)          │ ◄── Stored in Cache!
 │ Line 2: Normal World Browser Data Page (NS = 1)             │
 └─────────────────────────────────────────────────────────────┘
  (Cache lines store physical data, but do NOT prevent Prime+Probe timing checks!)
```

### The Microarchitectural Cache Hazard

To maximize CPU execution speed, L1, L2, and L3 cache lines store physical data fetched from both the Normal World ($NS = 1$) and the Secure World ($NS = 0$).

Although a Normal World process cannot *read* the data bytes stored inside a Secure World cache line (because hardware tag checks block the read), **both worlds share the exact same physical cache set rows!**

1. A compromised Normal World OS can execute a **Prime+Probe attack**:
   * The Normal World process fills a specific cache set row $S$ with its own data (**PRIME**).
   * The Normal World invokes an `SMC` call into the Secure World.
   * The Secure OS executes an AES encryption routine that fetches a key table entry mapping to cache set row $S$, evicting the Normal World process's line.
   * Control returns to the Normal World. The Normal World re-reads its data and measures the timing delay (**PROBE**).
2. **The Leak**: The Normal World detects an L1 cache miss on set $S$, discovering which memory line the Secure OS accessed!

#### Mitigations against Cross-World Cache Attacks:
1. **Cache Flushing on World Switch**: The Secure Monitor at EL3 executes a hardware cache flush (`DC CISW`) before returning control to the Normal World, purging sensitive Secure World lines.
2. **Hardware Cache Way Locking (CAT / MPAM)**: Using ARM Memory System Resource Partitioning and Monitoring (MPAM) to lock specific cache ways exclusively for $NS = 0$, preventing Normal World code from evicting Secure World cache lines.


### Scenario and Parameters

You are a senior microarchitectural security engineer auditing an ARMv8-A System-on-Chip (SoC) operating at a CPU clock frequency $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The SoC contains an integrated **TrustZone Address Space Controller (TZC-400)** guarding a $4\text{-Gigabyte}$ physical DRAM memory space.

```text
3.2 GHz ARMv8 SoC WITH TZC-400 TRUSTZONE MEMORY CONTROLLER

 CPU Core (ARMv8-A @ 3.2 GHz) ──► AXI Bus Interconnect (NS Wire) ──► TZC-400 Filter ──► DRAM
 Clock T = 312.5 ps               NS = 1 (Normal) / NS = 0 (Secure)   Region 1: Secure 64MB
                                  SMC Switch Latency = 280 Cycles     Base = 0x8000_0000
```

#### TZC-400 Memory Region Configuration:
* **Region 0 (Default Non-Secure RAM)**: Base Address = `0x0000_0000`, Size = $3,936\text{ MB}$.
  * Security Permissions: Open to both Secure World ($NS = 0$) and Normal World ($NS = 1$).
* **Region 1 (Secure World DRAM)**: Base Address = `0x8000_0000`, End Address = `0x83FF_FFFF` (Size = $64\text{ MB} = 67,108,864\text{ bytes}$).
  * Security Permissions: **Secure World Only ($NS = 0$ REQUIRED)**. Non-Secure access ($NS = 1$) triggers an immediate hardware `DECERR` Bus Error!

#### World Switch Performance Parameters:
A normal-world Linux kernel driver (EL1_NS) executes an `SMC #0` instruction to request a biometric fingerprint hash verification from the Secure OS (OP-TEE at EL1_S).

The World Switch pipeline overhead breakdown is as follows:
* **`SMC` Instruction Trap Overhead to EL3**: $16\text{ CPU Clock Cycles}$ ($5.0\text{ ns}$).
* **Secure Monitor State Save & NS Bit Toggle ($1 \to 0$)**: $120\text{ CPU Clock Cycles}$ ($37.5\text{ ns}$).
* **Secure OS Fingerprint Hash Processing (EL1_S)**: $3,200\text{ CPU Clock Cycles}$ ($1.00\ \mu\text{s}$).
* **Return `SMC` & NS Bit Toggle ($0 \to 1$) + State Restore**: $120\text{ CPU Clock Cycles}$ ($37.5\text{ ns}$).
* **`ERET` Instruction Return to EL1_NS**: $16\text{ CPU Clock Cycles}$ ($5.0\text{ ns}$).

#### Your Objective

1. A compromised Linux kernel driver running at EL1_NS ($NS = 1$) attempts a direct memory read at physical address `0x8100_1000`.
   * Trace the AXI bus transaction signals ($A[63:0]$, $NS$).
   * Show how the TZC-400 memory controller evaluates the transaction and prove mathematically why the read is blocked in hardware.
2. Calculate the total physical execution time $T_{\text{world\_switch}}$ (in CPU clock cycles and microseconds) for a legitimate biometric verification call through the `SMC` World Switch protocol.
3. Calculate the percentage of total execution time spent purely on **World Switch Hardware/Firmware Overhead** versus **Secure OS Workload Processing**.
4. Evaluate a cache side-channel scenario: If the Secure OS loads a $64\text{-byte}$ secret key table line into L1 Data Cache during step 4, and the Secure Monitor fails to execute `DC CISW` (Cache Flush) before returning to Linux:
   * Calculate the Flush+Reload timing delta measured by an attacker process reloading that line from Linux.
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Total World Switch Execution Time ($T_{\text{world\_switch}}$)

A legitimate application executes `SMC #0` to perform fingerprint verification.

We sum the clock cycles across all 5 stages of the World Switch protocol:

$$T_{\text{world\_switch}} = T_{\text{SMC\_entry}} + T_{\text{monitor\_save}} + T_{\text{secure\_OS}} + T_{\text{monitor\_restore}} + T_{\text{ERET\_exit}}$$

Given:
* $T_{\text{SMC\_entry}} = 16\text{ cycles}$
* $T_{\text{monitor\_save}} = 120\text{ cycles}$
* $T_{\text{secure\_OS}} = 3,200\text{ cycles}$
* $T_{\text{monitor\_restore}} = 120\text{ cycles}$
* $T_{\text{ERET\_exit}} = 16\text{ cycles}$

$$T_{\text{world\_switch}} = 16 + 120 + 3,200 + 120 + 16 = \mathbf{3,472 \text{ CPU Clock Cycles}}$$

In physical microseconds ($T_{\text{clk}} = 0.3125\text{ ns} = 0.0003125\ \mu\text{s}$):

$$T_{\text{world\_switch\_us}} = 3,472 \text{ cycles} \times 0.0003125 \ \mu\text{s/cycle} = \mathbf{1.0850 \text{ Microseconds}} \quad (1.085\ \mu\text{s})$$

##### Microarchitectural Result:
The complete end-to-end World Switch transaction takes **$3,472\text{ CPU clock cycles}$ ($1.085\ \mu\text{s}$)**.


#### Step 4: Evaluate Cross-World Cache Side-Channel Latency Delta

Suppose the Secure OS loads a $64\text{-byte}$ secret key table line into L1 Data Cache during Step 4, and the Secure Monitor fails to flush the L1D cache before returning to Linux.

An attacker process in Linux reloads that memory line:
* **Un-cached DRAM Miss Latency**: $T_{\text{DRAM\_miss}} = 180\text{ cycles}$.
* **Cached L1D Hit Latency**: $T_{\text{L1D\_hit}} = 4\text{ cycles}$.

$$\text{Side-Channel Timing Delta } \Delta T = T_{\text{DRAM\_miss}} - T_{\text{L1D\_hit}} = 180 - 4 = \mathbf{176 \text{ CPU Clock Cycles}}$$

In physical nanoseconds:

$$\Delta T_{\text{ns}} = 176 \times 0.3125 \text{ ns} = \mathbf{55.00 \text{ Nanoseconds}}$$

##### Side-Channel Result:
Failing to flush the L1D cache on a world switch leaves a **$176\text{-cycle}$ ($55.0\text{-ns}$) timing side-channel delta**, allowing the Normal World process to detect which cache lines the Secure OS accessed!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **ARM TrustZone**: A system-wide hardware isolation architecture that partitions an entire System-on-Chip (CPU cores, memory buses, caches, DRAM controllers, and peripherals) into two isolated domains—The Normal World ($NS = 1$) and The Secure World ($NS = 0$)—enforcing hardware security independently of operating system kernel privilege levels.
* **Secure World hardware partitioning**: The physical hardware isolation mechanism where an extra signal wire (the Non-Secure $NS$ bit) embedded in system interconnect buses is evaluated by hardware memory controllers (TZASC / TZC-400) and peripheral bridges (TZPC) to block $NS = 1$ memory transactions from accessing $NS = 0$ physical RAM pages or hardware sensors.
