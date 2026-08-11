content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/04-hardware-trusted-execution-environments/01-hardware-security-enclaves/01-arm-trustzone-hardware-world-partitioning.md
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

---

## The Bank Vault inside the Corporate Office Building

To build an intuitive, crystal-clear mental model of how ARM TrustZone enforces hardware isolation across an entire System-on-Chip, let us consider an everyday analogy: a large corporate office building containing a high-security bank vault.

Imagine a multi-story corporate office building (the System-on-Chip / SoC). The building is divided into two distinct physical zones:
1. **The General Office Floor (The Normal World / Rich OS)**: A large, busy area where hundreds of employees, contractors, and guest visitors work daily. An Office Manager (the Operating System Kernel / Linux) oversees daily operations, assigns desks, and routes paperwork.
2. **The Executive Bank Vault (The Secure World / Secure OS)**: A reinforced, bomb-proof vault room located on the same floor that houses the company's master financial assets, secret formulas, and customer biometric records.

```text
THE CORPORATE OFFICE BUILDING ANALOGY

 General Office Floor (Normal World)          Executive Bank Vault (Secure World)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Office Manager (Kernel)   │                │ Vault Guard (Secure OS)   │
 │ Employees & Guest Visitors│                │ Master Keys & Gold Assets │
 └─────────────┬─────────────┘                └─────────────▲─────────────┘
               │                                            │
               └─────────── HARDWARE VAULT DOOR ────────────┘
                            (Controlled by Security Badges)
```

The office floor is complex and chaotic. Occasionally, a rogue intruder sneaks onto the office floor, tricks the receptionist, and takes complete control of the Office Manager's desk (**Root Kernel Compromise**). The intruder can now read every file lying on the general office desks.

However, the building's owners anticipated that the office floor might eventually be compromised. To protect the company's master assets inside the Bank Vault, they installed an un-bypassable **Hardware Badge Scanner System** on all hallway doors, file cabinets, and vault entrances:

1. **The Physical Badge Signal Wire (The NS Bit)**: Every person walking through the building wears an electronic security badge that continuously broadcasts a physical color signal:
   * **RED BADGE (Non-Secure Bit $NS = 1$)**: Worn by everyone on the general office floor, including the Office Manager and all general employees.
   * **GOLD BADGE (Secure Bit $NS = 0$)**: Worn exclusively by the Vault Guard inside the Bank Vault.
2. **The Hardware Door Scanners (TrustZone Memory Controllers & Peripherals)**: Every door leading into the Bank Vault and every cabinet holding sensitive files is equipped with a mechanical lock wired directly to an electronic badge scanner.
   * **The Physical Lock Rule**: The scanner reads the color signal of any person approaching the door. If the scanner reads a **RED BADGE ($NS = 1$)**, the mechanical lock **physically deadbolts the door**, rejecting access instantly!
   * **The Immunity Guarantee**: Even if a rogue intruder takes total control of the Office Manager's desk, the intruder is still wearing a **RED BADGE ($NS = 1$)**. When the intruder walks up to the Bank Vault door, the mechanical scanner reads $NS = 1$ and rejects entry!

```text
THE UN-BYPASSABLE VAULT DOOR SCANNER

 Intruder Controls Manager's Desk (NS = 1) ──► Approaches Bank Vault Door
                                                │
                                                ▼
 Hardware Badge Scanner Reads: RED BADGE (NS = 1) ──► DOOR DEADBOLTS INSTANTLY!
 (Intruder is physically blocked from entering the vault!)
```

### How the Office Manager Interacts with the Vault:

If the Office Manager legitimately needs a transaction processed inside the vault—such as verifying a customer's fingerprint or signing a financial transfer:
1. The Office Manager walks up to a specialized **Security Reception Desk (The `SMC` / Secure Monitor Call Instruction)** and hands a request slip to the Vault Guard.
2. The Vault Guard steps out, verifies the request, takes the manager's task, and steps inside the Bank Vault (**Switches to Gold Badge $NS = 0$**).
3. The Vault Guard performs the secret calculation inside the vault, places the non-sensitive result (e.g., a "Pass/Fail" verification token) on a tray, steps back out (**Switches back to Red Badge $NS = 1$**), and hands the result to the Office Manager.

Notice what this architecture accomplished:
* The general office floor remained flexible, fast, and feature-rich.
* The Bank Vault remained tiny, simple, and strictly isolated.
* The physical door scanners ensured that a $100\%$ takeover of the general office floor could **never** breach the Bank Vault!

This corporate building scenario is the exact physical analogue of **ARM TrustZone Architecture**:
* The corporate building is the **System-on-Chip (SoC)**.
* The general office floor is **The Normal World (Non-Secure)** running Android or Linux.
* The Bank Vault is **The Secure World** running OP-TEE or Trusty OS.
* The Office Manager is the **Rich OS Kernel (EL1_NS)**.
* The RED/GOLD security badges are the physical **Non-Secure ($NS$) Bit Bus Wire**.
* The mechanical door scanners are **TrustZone Address Space Controllers (TZASC) and Protection Controllers (TZPC)**.
* The Security Reception Desk is the **`SMC` (Secure Monitor Call) Instruction**.
* The Vault Guard is the **Secure Monitor (EL3)**.

---

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

---

### The Un-Bypassable Nature of the Hardware NS Bit

Why can an attacker running with root privileges in the Normal World operating system kernel not simply write software code to change $NS = 1$ to $NS = 0$?

Because the $NS$ bit is **not a software variable or a writable memory location**!

The $NS$ bit is a **physical electrical signal line** generated directly by the CPU core's internal hardware state logic:
* When the CPU core's execution state logic is in the Normal World, the core's bus interface hardware **hardwires the $NS$ bus pin to High ($1.2\text{ V} \implies NS = 1$)** on every outgoing clock cycle.
* Software executing inside the core has no architectural instruction or register that can manipulate the physical bus pin directly.
* The physical $NS$ wire travels along the motherboard interconnects to memory controllers and peripheral bridges, ensuring that every hardware device on the chip knows the exact security origin of every memory request!

---

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

---

## The World-Switch Transition Protocol (`SMC` Instruction)

How does software running in the Normal World (e.g., an Android app verifying a user's fingerprint) request a secure operation from the Secure World?

The transition between worlds is executed through a formal hardware protocol known as the **World Switch**, mediated by the **`SMC` (Secure Monitor Call)** assembly instruction.

```text
COMPLETE WORLD-SWITCH TRANSITION SEQUENCE

 Normal World (EL1_NS)           EL3 Secure Monitor            Secure World (EL1_S)
 ┌────────────────────┐          ┌──────────────────┐          ┌────────────────────┐
 │ 1. Executes 'SMC'  ├─────────►│ 2. Traps to EL3! │          │                    │
 └────────────────────┘          │ Saves Normal Regs│          │                    │
                                 │ Changes NS: 1->0 │          │                    │
                                 │ 3. Executes ERET ├─────────►│ 4. Executes Task   │
                                 └──────────────────┘          │    in Secure OS!   │
                                                               └─────────┬──────────┘
                                                                         │
                                 ┌──────────────────┐                    │ 5. Executes 'SMC'
                                 │ 6. Traps to EL3! │◄───────────────────┘
                                 │ Restores Norm Reg│
 ┌────────────────────┐          │ Changes NS: 0->1 │
 │ 8. Resumes Rich OS ├◄─────────┤ 7. Executes ERET │
 └────────────────────┘          └──────────────────┘
```

Let us trace the step-by-step microarchitectural sequence of a World Switch:

### Step 1: Normal World Invocation (`SMC #0`)
1. An application or device driver in the Normal World (EL1_NS) populates registers `x0` through `x7` with parameter data adhering to the **ARM SMC Calling Convention (SMCCC)** (specifying the requested Function ID, such as `0x82000001` for "Verify Fingerprint Hash").
2. The Normal World kernel executes the **`SMC #0`** instruction.

### Step 2: Trapping into EL3 (Secure Monitor)
1. Executing `SMC` causes an immediate hardware trap directly into **EL3 (Secure Monitor Mode)**.
2. The CPU core hardware automatically pauses Normal World instruction fetching.
3. The CPU saves the current Program Counter ($PC$) and processor state flags into EL3 system registers (`ELR_EL3` and `SPSR_EL3`).

### Step 3: Saving State and Toggling the Hardware Security State
1. The Secure Monitor firmware running at EL3 saves the Normal World's architectural registers (`x0` through `x30`, `SP_EL1`, `SP_EL2`) into a secure context buffer in memory.
2. The Secure Monitor modifies the **SCR_EL3 (Secure Configuration Register)**, toggling the physical $NS$ bit flag from $1 \to 0$:

$$\mathbf{\text{SCR\_EL3.NS} \Leftarrow 0 \quad (\text{CPU Core Enters Secure World!})}$$

3. Once `SCR_EL3.NS` is set to $0$, the CPU core's physical bus interface hardware begins driving **$NS = 0$** on all subsequent outgoing memory bus transactions!

### Step 4: Entering the Secure OS (EL1_S)
1. The Secure Monitor restores the Secure World's register state (`SP_EL1_S`).
2. The Secure Monitor sets `ELR_EL3` to the entry point of the Secure OS (e.g., OP-TEE kernel entry).
3. The Secure Monitor executes the **`ERET` (Exception Return)** instruction.
4. The CPU drops from EL3 to **EL1_S (Secure World Kernel)** and begins executing the Secure OS!

### Step 5: Returning to the Normal World
1. The Secure OS performs the requested operation (e.g., reads the hardware fingerprint sensor, verifies the hash, and generates a signed pass token).
2. The Secure OS executes `SMC` to return to EL3.
3. The Secure Monitor toggles the security flag back: `SCR_EL3.NS <= 1`.
4. The Secure Monitor restores the Normal World registers and executes `ERET`, returning control to the Rich OS Kernel at EL1_NS!

---

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

---

### 1. TrustZone Address Space Controller (TZASC / TZC-400)

The **TrustZone Address Space Controller (TZASC / TZC-400)** is a dedicated hardware memory filtering unit positioned directly between the AMBA AXI system interconnect and the physical DRAM memory controller.

```text
TZASC PHYSICAL DRAM MEMORY REGION FILTERING

 Physical DRAM Memory Space (e.g., 4 GB Total)
 0xFFFFFFFF ┌─────────────────────────────────────────┐
            │ Region 1: Secure DRAM (64 MB)           │
            │ Base: 0x8000_0000 | Allowed: NS = 0 ONLY│ ◄── TZASC BLOCKS NS = 1!
 0x83FF_FFFF ├─────────────────────────────────────────┤
            │ Region 0: Non-Secure DRAM (3,936 MB)    │
            │ Base: 0x0000_0000 | Allowed: NS=0 & NS=1│
 0x0000_0000 └─────────────────────────────────────────┘
```

#### How the TZASC / TZC-400 Protects RAM:
1. During system boot, the Secure Monitor configures physical DRAM memory ranges into discrete **Security Regions**.
2. **Region 0 (Non-Secure RAM)**: Configured to accept memory transactions with $NS = 0$ OR $NS = 1$. Both worlds can read and write this memory (used for shared buffer communication).
3. **Region 1 (Secure RAM)**: Configured to accept memory transactions **ONLY when $NS = 0$**!
4. **Hardware Enforcement**:
   * When a memory request targeting Region 1 arrives with **$NS = 1$ (Normal World)**:
   * The TZC-400 **blocks the read/write request at the hardware gate**, prevents the DRAM chip from receiving the signal, and returns a hardware AXI Bus Error (`DECERR`)!
   * The Normal World kernel receives a bus fault and cannot read a single byte of Secure RAM!

---

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

---

### 3. Generic Interrupt Controller (GIC)

The **Generic Interrupt Controller (GIC)** routes physical hardware interrupts to CPU cores, partitioning interrupts into two security groups:
* **Group 0 Interrupts (Secure Interrupts - FIQ)**: Routed exclusively to the Secure World ($NS = 0$). When a Group 0 interrupt (such as a secure timer or tamper sensor) fires, it **preempts Normal World execution immediately**, forcing a hardware trap into the Secure World!
* **Group 1 Interrupts (Non-Secure Interrupts - IRQ)**: Routed to the Normal World ($NS = 1$) for standard operating system device handling.

---

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

---

## Solved Industrial Engineering Exercise: Quantitative TZC-400 Memory Filtering, SMC World-Switch Latency, and Bus Error Analysis

To consolidate your complete mastery of ARM TrustZone hardware architectures, $NS$ bit bus propagation, TZC-400 address filtering, and World Switch execution timing math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Trace Unauthorized Normal World DRAM Access (`0x8100_1000`)

The compromised Linux kernel driver ($NS = 1$) issues a memory read instruction targeting physical address $A_{\text{phys}} = \text{0x8100\_1000}$.

##### 1. AXI Bus Signal Emission:
The CPU core's bus interface unit drives the physical AXI bus lines:
* Address Lines: $A[63:0] = \text{0x0000\_0000\_8100\_1000}$.
* **Physical Security Wire: $NS = 1$ (Non-Secure World Origin)**.

##### 2. TZC-400 Region Matching:
The TZC-400 controller receives the transaction and checks $A_{\text{phys}} = \text{0x8100\_1000}$ against its region table:
* `0x8000_0000` $\le \text{0x8100\_1000} \le \text{0x83FF\_FFFF} \implies$ Matches **Region 1 (Secure World DRAM)**!

##### 3. Security Rule Evaluation:

$$\text{Transaction Access Condition} \iff (NS == 0)$$

$$\text{Incoming Transaction Signal: } NS = 1 \implies \mathbf{1 \neq 0 \quad (\text{SECURITY CHECK FAILED!})}$$

```text
TZC-400 HARDWARE BLOCKING VERIFICATION

 Address: 0x8100_1000 (Matches Region 1: Secure DRAM)
 Bus Signal: NS = 1 (Normal World Linux)
 TZC-400 Evaluation: NS=1 NOT ALLOWED IN REGION 1!
 ──► TZC-400 GATES DRAM READ SIGNAL! DRAM Chip receives 0 Read Requests!
 ──► TZC-400 Asserts AXI DECERR Bus Fault to CPU Core!
 (100% Zero Bytes Read from Secure DRAM!)
```

##### Result:
The TZC-400 **blocks the read signal at the DRAM gate**. The physical DRAM chip receives zero read commands. The TZC-400 returns an AXI Decode Error (`DECERR`) to the Linux kernel, preventing the compromised kernel from reading a single bit of Secure DRAM!

---

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

---

#### Step 3: Calculate World Switch Firmware Overhead Percentage

We separate the total time into **Workload Processing Time** ($T_{\text{secure\_OS}} = 3,200\text{ cycles}$) versus **Switching Overhead Time** ($T_{\text{overhead}}$):

$$T_{\text{overhead}} = T_{\text{SMC\_entry}} + T_{\text{monitor\_save}} + T_{\text{monitor\_restore}} + T_{\text{ERET\_exit}}$$

$$T_{\text{overhead}} = 16 + 120 + 120 + 16 = \mathbf{272 \text{ CPU Clock Cycles}} \quad (0.085\ \mu\text{s})$$

##### Calculate Percentage Overhead:

$$\text{Overhead \%} = \frac{T_{\text{overhead}}}{T_{\text{world\_switch}}} \times 100\% = \frac{272}{3,472} \times 100\% \approx \mathbf{7.834\% \text{ Overhead}}$$

$$\text{Payload Workload Efficiency \%} = \frac{3,200}{3,472} \times 100\% \approx \mathbf{92.166\% \text{ Useful Execution Efficiency}}$$

##### Engineering Conclusion:
The hardware/firmware World Switch overhead accounts for only **$7.834\%$ ($272\text{ clock cycles} / 85.0\text{ ns}$)** of the transaction time, delivering **$92.17\%$ operational efficiency**!

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and hardware state results against ARM TrustZone principles:

1. **Hardware NS Wire Enforcement Check**:
   * Incoming transaction $NS = 1$.
   * TZC-400 Region 1 rule requires $NS = 0$.
   * $1 \neq 0 \implies$ DECERR bus fault generated. Physical DRAM read blocked $100\%$.
2. **World Switch Latency Sum Verification**:
   * Overhead: $16 + 120 + 120 + 16 = 272\text{ cycles}$.
   * Workload: $3,200\text{ cycles}$.
   * Total: $272 + 3,200 = 3,472\text{ cycles}$.
   * At $3.2\text{ GHz}$, $3,472 \times 0.3125\text{ ns} = 1,085\text{ ns} = 1.085\ \mu\text{s}$. Math verified!
3. **Cache Timing Delta Verification**:
   * $\Delta T = 180 - 4 = 176\text{ cycles} = 55.0\text{ ns}$.
   * Confirms the necessity of cache flushing (`DC CISW`) during EL3 world switches.

All AMBA AXI $NS$ signal wire propagation rules, TZC-400 address region matching checks, World Switch cycle breakdowns ($3,472\text{ cycles} / 1.085\ \mu\text{s}$), and side-channel timing delta derivations evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **ARM TrustZone**: A system-wide hardware isolation architecture that partitions an entire System-on-Chip (CPU cores, memory buses, caches, DRAM controllers, and peripherals) into two isolated domains—The Normal World ($NS = 1$) and The Secure World ($NS = 0$)—enforcing hardware security independently of operating system kernel privilege levels.
* **Secure World hardware partitioning**: The physical hardware isolation mechanism where an extra signal wire (the Non-Secure $NS$ bit) embedded in system interconnect buses is evaluated by hardware memory controllers (TZASC / TZC-400) and peripheral bridges (TZPC) to block $NS = 1$ memory transactions from accessing $NS = 0$ physical RAM pages or hardware sensors.
