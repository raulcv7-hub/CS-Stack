---
title: "01-trustzone-secure-world-partitioning — TrustZone Secure World Partitioning, TZC-400 Controller Configuration, and Early Memory Encryption Enablement"
---

# 01-trustzone-secure-world-partitioning — TrustZone Secure World Partitioning, TZC-400 Controller Configuration, and Early Memory Encryption Enablement

## 1. The Single-World Hardware Contamination Hazard

In modern System-on-Chip (SoC) architectures—such as those powering smartphones, automotive control units, smart edge gateways, and enterprise cloud servers—a single silicon microchip die is required to concurrently execute two completely different classes of software:

1. **Unprivileged Normal World Software**: Feature-rich, complex operating systems (such as Linux, Android, or Windows), third-party user applications, network stacks, and complex GPU graphics drivers.
2. **High-Security World Software**: Highly sensitive cryptographic key managers, biometric authentication vault handlers (fingerprint and facial recognition processing), digital rights management (DRM) engines, and mobile payment processing modules (such as Apple Pay or Google Wallet).

If a computer platform relies purely on operating system virtual memory page tables or software permission bits to separate these two software classes on the exact same physical hardware bus, a catastrophic security vulnerability emerges: **The Single-World Hardware Contamination Hazard.**

```text
THE SINGLE-WORLD HARDWARE CONTAMINATION HAZARD

 Normal World Software (Linux / Android)      Secure World Software (Banking / Keys)
 ┌──────────────────────────────────┐        ┌──────────────────────────────────┐
 │ User Apps | Complex GPU Drivers  │        │ Biometrics | Master Private Keys │
 └────────────────┬─────────────────┘        └────────────────┬─────────────────┘
                  │                                           │
                  ▼ (Kernel Zero-Day / Buffer Overflow)       │
 ┌────────────────────────────────────────────────────────────┴─────────────────┐
 │ SHARED PHYSICAL SYSTEM MEMORY & BUS (UN-PARTITIONED SILICON!)                │
 │  * Address 0x8000_0000: Android Kernel RAM                                   │
 │  * Address 0x8500_0000: Biometric Fingerprint Hashes & Private Keys!          │
 └──────────────────────────────────────────────────────────────────────────────┘
  (Compromised Android Kernel rewrites Page Tables -> Dumps Biometric Hashes!)
```

Trace the physical hardware exploitation path in a single-world architecture:

1. An unprivileged user application or web browser running in the Normal World triggers a buffer overflow or zero-day memory corruption vulnerability inside a $100,000\text{-line}$ Linux GPU driver.
2. The attacker gains root control over the Normal World operating system kernel (executing at kernel privilege level).
3. **The Single-World Memory Dump**: Because the physical system memory bus (DRAM) and interconnect crossbars have no hardware awareness of "Secure" versus "Normal" software, the compromised kernel modifies its own page tables to map physical DRAM address `0x8500_0000` (where biometric fingerprint hashes and banking private keys are stored).
4. The compromised kernel reads `0x8500_0000`, extracts the private encryption keys directly out of physical RAM, and transmits them across the network!

Look at the complete security collapse:
* The complex, driver-heavy Normal World operating system kernel **cannot be trusted** to protect master cryptographic keys!
* A single bug in a third-party graphics or Wi-Fi driver compromises the entire hardware platform's security.

Furthermore, a second physical threat exists: **Physical Memory Bus Sniffing and Cold-Boot Attacks.**

Even if software page tables were somehow bug-free, an attacker with physical access to the device could attach a high-speed logic analyzer or oscilloscope probe to the physical DDR5 memory bus copper traces on the motherboard, or freeze the DRAM chips with liquid nitrogen and read their raw contents in a secondary reader (**Cold-Boot Attack**). 

The attacker reads the un-encrypted cryptographic keys directly off the copper wires as they travel between the CPU and DRAM chips!

How can an integrated silicon architecture partition the physical processor, interconnect bus (via a hardware Non-Secure `NS` signal bit), and peripheral devices into two completely isolated execution domains (**TrustZone Secure World vs. Normal World**), program a hardware memory gatekeeper (**TrustZone Address Space Controller / TZC-400**) to enforce physical DRAM boundaries, and enable transparent **Hardware Memory Encryption Engines (TME / SME / CCA)** before launching unprivileged operating system kernels?

To eliminate single-world contamination hazards and defeat physical memory bus sniffing, computer architectures employ **TrustZone Secure World Partitioning**, **TZC-400 Controller Configuration**, and **Early Memory Encryption Enablement**.


### Step 1: The Green/Red Keycard System (The `NS` Non-Secure Bus Bit)

Every door, elevator, and hallway in the building is fitted with a dual-color electronic scanner. 

Every person walking through the building wears an electronic keycard that continuously broadcasts their security status:
* **Red Keycard (`NS = 0` / Secure World)**: Issued *only* to authorized vault guards and bank directors (**Secure World Execution**). Red keycards grant access to ALL rooms in the building (both the Public Lobby AND the Cash Vault!).
* **Green Keycard (`NS = 1` / Normal World)**: Issued to public customers and delivery drivers (**Normal World OS / Linux**). Green keycards grant access ONLY to Public Lobby rooms.

If a person wearing a Green Keycard (`NS = 1`) attempts to touch the handle of a Cash Vault door, the door **physically locks shut and sounds an emergency alarm**!

```text
GREEN/RED KEYCARD BUS SCANNER

 Person wearing Red Keycard (NS = 0)   ──► Touch Cash Vault Handle ──► DOOR OPENS!
 Person wearing Green Keycard (NS = 1) ──► Touch Cash Vault Handle ──► DOOR LOCKS & ALARM!
```


### Step 3: The Automatic Ink Scrambler (Hardware Memory Encryption / TME)

What if an international thief uses a jackhammer to break through the concrete outer wall of the basement vault directly from the street outside (**Physical Memory Bus Sniffing / Cold-Boot Attack**)?

To defeat street-level thieves, the bank equips every storage shelf in the vault with an **Automatic Ink Scrambler (Inline Hardware Memory Encryption Engine)**!

```text
AUTOMATIC INK SCRAMBLER (MEMORY ENCRYPTION)

 Paper Document stored in Vault ──► Scrambled into Invisible Ink (AES-256)
                                    before leaving the vault wall!
                                    │
                                    ▼ (Thief steals paper from the street)
 Thief looks at stolen paper    ──► Sees $100\%$ Random Invisible Garbage!
 (Paper can be read ONLY when scanned through the authorized bank vault scanner!)
```

* When a paper document is placed onto a vault shelf, the automatic ink scrambler converts all text into **scrambled, invisible, encrypted ink** using a secret key generated by an internal random number generator.
* If a thief breaks through the outer street wall and steals the paper, all they see is blank, scrambled paper!
* The text can be read *only* when scanned back through the authorized bank vault scanner!

This multi-tiered bank security system is the exact physical analogue of **TrustZone Secure World Partitioning, TZC-400 Configuration, and Early Memory Encryption**:
* The Public Banking Lobby is **Normal World (Linux / Android / EL1 / EL0)**.
* The Private Cash Vault is **Secure World (OP-TEE / Secure OS / Secure EL1)**.
* Red Keycards (`NS = 0`) represent **Secure World AXI Bus Transactions (`NS = 0`)**.
* Green Keycards (`NS = 1`) represent **Normal World AXI Bus Transactions (`NS = 1`)**.
* The Titanium Gatekeeper is the **TrustZone Address Space Controller (TZC-400)**.
* The Bank Director programming the gatekeeper is **Early Boot Firmware (TF-A in EL3)**.
* The Automatic Ink Scrambler is an **Inline Hardware Memory Encryption Engine (TME / SME / CCA)**.


### Primitive 1: The Non-Secure (`NS`) Bit in AXI System Buses

In ARM TrustZone architecture, hardware isolation is **not** enforced by software layers or memory management unit (MMU) page tables alone. 

It is enforced at the **physical silicon bus level** by extending the AXI4 system bus protocol.

ARM adds a single physical signal wire to every address and data channel on the AXI4 bus: **The Non-Secure (`NS`) Bit**.

```text
AXI4 SYSTEM BUS WITH PHYSICAL 1-BIT NS SIGNAL WIRE

 AXI4 Read/Write Address Channel Wires:
 [ Addr[63:0] ] [ Burst[1:0] ] [ Size[2:0] ] [ ID[3:0] ] [ NS Bit (1 Bit!) ]
                                                           │
                                                           ├─► NS = 0 : SECURE WORLD
                                                           └─► NS = 1 : NORMAL WORLD
```

Every transaction generated by a master core (such as a CPU execution core, GPU, or DMA engine) carries the `NS` bit alongside its physical target address:

* **`NS = 0` (Secure World Transaction)**: Indicates that the transaction was initiated by a CPU core executing in a Secure Exception Level (such as EL3 or Secure EL1). `NS = 0` transactions are authorized to access both Secure World memory AND Normal World memory.
* **`NS = 1` (Normal World Transaction)**: Indicates that the transaction was initiated by a CPU core or DMA device executing in Normal World (such as EL2, EL1, or EL0). `NS = 1` transactions are **strictly forbidden** from accessing Secure World memory regions!

#### Hardware State Machine Transitions:
When a CPU execution core transitions between Normal World and Secure World (via a Secure Monitor Call, or `SMC` instruction):
1. The CPU core's internal hardware state machine toggles its outbound AXI bus driver interface.
2. While executing in Normal World (Linux/Android), the hardware **forces `NS = 1` on every outgoing memory read or write transaction**.
3. Software running in Normal World cannot modify or clear the `NS` bit! The `NS` bit is driven directly by the processor's hardware privilege state logic.


#### The TZC-400 Region Configuration Registers

The TZC-400 supports partitioning physical DRAM into up to **9 independent memory regions** ($\text{Region}_0 \dots \text{Region}_8$).

Each memory region is controlled by four 32-bit MMIO registers inside the TZC-400 configuration space:

```text
TZC-400 REGION CONFIGURATION REGISTER MAP

 Offset (Region k Base) │ Register Name          │ Hardware Function & Bit Description
────────────────────────┼────────────────────────┼───────────────────────────────────────────────────────────
      Offset 0x00       │ REGION_BASE_LOW_k      │ Lower 32 bits of physical base address (32-KB aligned).
      Offset 0x04       │ REGION_BASE_HIGH_k     │ Upper 32 bits of physical base address.
      Offset 0x08       │ REGION_TOP_LOW_k       │ Lower 32 bits of physical top/end address.
      Offset 0x0C       │ REGION_TOP_HIGH_k      │ Upper 32 bits of physical top/end address.
      Offset 0x10       │ REGION_ATTRIBUTES_k    │ Bit 0 = Enable, Bits [31:24] = Sub-region enable mask.
      Offset 0x14       │ REGION_ID_ACCESS_k     │ Bits [31:0] = Master ID Read/Write Security Controls:
                        │                        │   * 2'b00 = No Access
                        │                        │   * 2'b01 = Secure Only (NS = 0 Required!)
                        │                        │   * 2'b11 = Secure AND Non-Secure (NS = 0 or 1)
```

#### The TZC-400 Hardware Filtering Invariant

When an AXI write or read transaction carrying target physical address $A_{\text{target}}$ and Non-Secure flag $\text{NS}_{\text{incoming}}$ arrives at the TZC-400:

The TZC-400 evaluates the **Hardware Memory Access Invariant**:

$$\mathbf{\text{Grant Access} \iff (A_{\text{base\_k}} \le A_{\text{target}} \le A_{\text{top\_k}}) \quad \mathbf{\text{AND}} \quad (\text{NS}_{\text{incoming}} \le \text{NS}_{\text{allowed\_k}})}$$

Where:
* $A_{\text{target}}$ is the 64-bit physical memory address targeted by the bus transaction.
* $\text{NS}_{\text{incoming}}$ is the physical Non-Secure bit carried on the AXI bus ($0 = \text{Secure}$, $1 = \text{Non-Secure}$).
* $\text{NS}_{\text{allowed\_k}}$ is the access security level programmed into `REGION_ID_ACCESS_k`:
  * If $\text{Access} = \text{Secure Only}$, then $\text{NS}_{\text{allowed\_k}} = 0$.
  * If $\text{Access} = \text{Non-Secure \& Secure}$, then $\text{NS}_{\text{allowed\_k}} = 1$.

```text
TZC-400 HARDWARE EVALUATION FLOW

 Incoming AXI Transaction: Address A_target, NS_incoming = 1 (Normal World)
                       │
                       ▼
 TZC-400 matches A_target to Region 1 (Secure World RAM / OP-TEE)
 Region 1 Access Setting: Secure Only (NS_allowed = 0)
                       │
                       ▼
 Evaluates Invariant: NS_incoming (1) <= NS_allowed (0)?
 1 <= 0  ──► FALSE! (ACCESS DENIED!)
                       │
                       ▼
 1. BLOCK TRANSACTION AT TZC-400 FIREWALL! (Zero bytes touch DRAM!)
 2. Generate AXI DECERR (Decode Error) to Master.
 3. Raise Hardware Security Interrupt (FIQ) to EL3 Firmware!
```

* **If Invariant Evaluates TRUE**: The TZC-400 forwards the transaction to the DRAM controller.
* **If Invariant Evaluates FALSE (Security Attack Detected!)**:
  1. The TZC-400 **blocks the transaction at the hardware bridge**. Zero bytes touch physical DRAM!
  2. The TZC-400 returns an **AXI Decode Error (`DECERR`)** back to the requesting master.
  3. The TZC-400 logs the offending master's ID and address in its `FAIL_ADDRESS` registers and asserts a high-priority hardware security interrupt (`FIQ`) to early boot firmware running in EL3!


## 4. Engineering Realities: TZC-400 Lockdown and Speculative Execution Leaks

In commercial ARM64 and RISC-V SoC engineering, implementing TrustZone memory isolation requires enforcing strict register lockdown sequences and mitigating speculative execution side-channels.


### 2. Speculative Execution Leakage Across World Boundaries

Modern high-performance CPU cores feature **Out-of-Order Execution Engines** that speculatively fetch and execute instructions ahead of branch predictions.

What happens if a Normal World software thread (`NS = 1`) speculatively executes an instruction reading a Secure World address (`0x8500_0000`) before a branch condition is evaluated?

1. The CPU core speculatively dispatches an AXI read transaction for `0x8500_0000`.
2. The TZC-400 blocks the transaction at the hardware bridge ($NS = 1$ targeting Secure Only region).
3. **The Microarchitectural Side-Channel**: Although the TZC-400 blocks the data from reaching CPU registers, the CPU's internal speculation engine may have already pulled neighboring data lines into the **shared L3 cache**!
4. An attacker in Normal World executes a **Flush+Reload Cache Timing Attack**, measuring L3 cache read latencies to infer the secret data bytes!

#### Hardware Mitigation: Speculation Barrier Instructions
To prevent speculative side-channel leaks across world transitions:
* When the CPU transitions from Secure World back to Normal World, firmware MUST execute a **Speculation Barrier Instruction** (`SB` or `DSB ISB` in ARM) and flush all shared cache lines used during the Secure World session!


### Scenario & Parameters

You are a principal hardware security architect configuring the TrustZone memory firewall and Total Memory Encryption (TME) engine for an enterprise $3.2\text{-GHz}$ 64-bit ARM64 server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server processor die is connected to an aggregate physical DRAM memory capacity of **$16\text{ Gigabytes}$** ($17,179,869,184\text{ bytes}$), spanning physical addresses `0x0000_0000_8000_0000` through `0x0000_0004_7FFF_FFFF`.

```text
ARM64 SERVER TRUSTZONE & MEMORY ENCRYPTION PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU execution clock frequency
 T_dram_base_read          │ 70.0 Nanoseconds      │ Base DRAM read latency without encryption
 Latency_TME_AES           │ 3.125 Nanoseconds     │ TME AES-XTS-256 inline encryption pipeline delay
 Size_DRAM_Total           │ 16 GB (17,179,869,184B)Total physical DRAM address space
 Size_Secure_RAM           │ 512 MB (536,870,912 B) Secure World RAM allocation (OP-TEE)
 Base_DRAM                 │ 0x0000_0000_8000_0000 │ Starting physical DRAM address
```

#### Hardware Memory Security Partitioning Plan:
Early boot firmware (TF-A in EL3) partitions physical DRAM into two regions:
1. **Region 1 (Secure World Memory / OP-TEE)**: First $512\text{ MB}$ of DRAM (`0x0000_0000_8000_0000` to `0x0000_0000_9FFF_FFFF`). Access setting: **`SECURE_ONLY` ($\text{NS}_{\text{allowed}} = 0$)**.
2. **Region 2 (Normal World Memory / Linux OS)**: Remaining $15.5\text{ GB}$ of DRAM (`0x0000_0000_A000_0000` to `0x0000_0004_7FFF_FFFF`). Access setting: **`NONSECURE_AND_SECURE` ($\text{NS}_{\text{allowed}} = 1$)**.


### Step-by-Step Derivation

#### Step 1: Calculate TZC-400 Base and Top Register Values

In the TZC-400 controller, region base and top registers store physical addresses aligned to $32\text{-KB}$ boundaries (`0x8000`).

##### 1. Region 1 Configuration ($512\text{ MB}$ Secure World RAM):
* Start Address: `0x0000_0000_8000_0000`
  * **`REGION_BASE_LOW_1`** $= \mathbf{\text{0x8000\_0000}}$
  * **`REGION_BASE_HIGH_1`** $= \mathbf{\text{0x0000\_0000}}$
* End Address: `0x8000_0000` $+ 512\text{ MB} - 1 = \text{0x8000\_0000} + \text{0x2000\_0000} - 1 = \text{0x0000\_0000\_9FFF\_FFFF}$.
  * **`REGION_TOP_LOW_1`** $= \mathbf{\text{0x9FFF\_FFFF}}$
  * **`REGION_TOP_HIGH_1`** $= \mathbf{\text{0x0000\_0000}}$
* Access Setting: `SECURE_ONLY` ($\text{NS}_{\text{allowed}} = 0$).

##### 2. Region 2 Configuration ($15.5\text{ GB}$ Normal World RAM):
* Start Address: `0x0000_0000_A000_0000`
  * **`REGION_BASE_LOW_2`** $= \mathbf{\text{0xA000\_0000}}$
  * **`REGION_BASE_HIGH_2`** $= \mathbf{\text{0x0000\_0000}}$
* End Address: `0x0000_0000_8000_0000` $+ 16\text{ GB} - 1 = \text{0x0000\_0004\_7FFF\_FFFF}$.
  * **`REGION_TOP_LOW_2`** $= \mathbf{\text{0x7FFF\_FFFF}}$
  * **`REGION_TOP_HIGH_2`** $= \mathbf{\text{0x0000\_0004}}$
* Access Setting: `NONSECURE_AND_SECURE` ($\text{NS}_{\text{allowed}} = 1$).

```text
TZC-400 REGISTER CONFIGURATION SUMMARY TABLE

 Region   │ Base Address (64-Bit Hex)   │ Top Address (64-Bit Hex)    │ Security Access Setting
──────────┼─────────────────────────────┼─────────────────────────────┼─────────────────────────
 Region 1 │ 0x0000_0000_8000_0000       │ 0x0000_0000_9FFF_FFFF       │ SECURE_ONLY (NS = 0)
 Region 2 │ 0x0000_0000_A000_0000       │ 0x0000_0004_7FFF_FFFF       │ NONSECURE_AND_SECURE
```


#### Step 3: Calculate Total Memory Read Latency with TME Encryption Enabled

Base DRAM Read Latency $T_{\text{dram\_base}} = 70.0\text{ ns}$.

Inline TME AES-XTS-256 Pipeline Delay $\text{Latency}_{\text{TME\_AES}} = 3.125\text{ ns}$.

Calculate total encrypted read latency $T_{\text{dram\_tme}}$:

$$T_{\text{dram\_tme}} = T_{\text{dram\_base}} + \text{Latency}_{\text{TME\_AES}}$$

$$T_{\text{dram\_tme}} = 70.0\text{ ns} + 3.125\text{ ns} = \mathbf{73.125 \text{ Nanoseconds}}$$

Convert to CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{dram\_tme}} = \frac{73.125\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{234 \text{ CPU Clock Cycles}}$$


### Sanity Check and Verification

Let us verify our mathematical and physical results against ARM TrustZone and TZC-400 specifications:

1. **TZC-400 Invariant Evaluation Check**:
   * Transaction A ($NS = 0$ vs $NS_{\text{allowed}} = 0$): $0 \le 0 \implies \text{True}$.
   * Transaction B ($NS = 1$ vs $NS_{\text{allowed}} = 0$): $1 \le 0 \implies \text{False}$.
   * Hardware access control invariant $100\%$ verified!
2. **Region Address Boundary Check**:
   * Region 1 Top $= \text{0x9FFF\_FFFF}$. Region 2 Base $= \text{0xA000\_0000}$.
   * Difference $= \text{0xA000\_0000} - \text{0x9FFF\_FFFF} = 1\text{ Byte}$.
   * Memory regions are $100\%$ non-overlapping and contiguous across the $16\text{-GB}$ DRAM space!
3. **AES-XTS Latency Penalty Precision**:
   * Base cycles $= 70.0 / 0.3125 = 224\text{ cycles}$.
   * Encrypted cycles $= 73.125 / 0.3125 = 234\text{ cycles}$.
   * Cycle delta $= 234 - 224 = 10\text{ cycles}$. Math verified with $100\%$ precision!

All AXI4 $NS$ signal bit rules, TZC-400 region base/top register maps, hardware access invariants, and TME AES-XTS-256 $4.464\%$ memory encryption latency penalties evaluate with 100% mathematical, physical, and logical precision.

