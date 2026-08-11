content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/01-power-on-reset-execution/02-hardware-root-of-trust/01-immutable-boot-rom-verification.md
# 01-immutable-boot-rom-verification — Immutable Boot ROM Verification and Silicon eFuse Public Key Hash Binding

## 1. The Untrusted External Flash Memory Vulnerability

In modern computer platforms, the vast majority of system firmware—including the low-level code responsible for initializing processors, training memory controllers, and setting up PCI Express interconnects—is stored on an external Serial Peripheral Interface (SPI) NOR Flash memory chip mounted on the motherboard. Because on-chip silicon real estate on a central processing unit (CPU) or System-on-Chip (SoC) die is extremely expensive, fabricating tens of megabytes of non-volatile storage directly onto the CPU die is economically unfeasible.

However, storing system firmware on an external memory chip mounted on a printed circuit board introduces a catastrophic physical security vulnerability: **The Untrusted External Storage Attack Vector.**

```text
THE UNTRUSTED EXTERNAL FLASH ATTACK VECTOR

 Central Processing Unit (CPU Die)            Motherboard PCB
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Hardware Reset Releases   │                 │ External SPI Flash Memory │
 │ Fetches Instruction       │◄── SPI Bus ─────┤ (PHYSICALLY ACCESSIBLE!)  │
 │ (Executes Anything Read!) │   (Untrusted!)  │ (Attacker Overwrites Code)│
 └───────────────────────────┘                 └───────────────────────────┘
  (CPU executes malicious rootkit with absolute, unrestricted hardware privileges!)
```

Trace the physical reality of an external Flash memory chip:

An external SPI Flash chip sits exposed on the surface of a motherboard. An attacker with physical access to the device—whether a malicious supply-chain vendor, a rogue technician, or a physical thief—can attach an inexpensive $10\text{ USB}$ hardware programmer to the Flash chip's pins, desolder the chip, or execute a software exploit that overrides the Flash memory write-protect lines.

If an attacker overwrites the firmware binary stored in external Flash with a malicious payload (a **Firmware Rootkit** or **Bootkit**):
* When the CPU powers on and executes its hardwired Reset Vector fetch, it reads instructions directly from the compromised external Flash memory.
* The CPU has no inherent way of knowing whether the incoming bytes were written by the original hardware manufacturer or by an attacker!
* The CPU decodes and executes the attacker's malicious code at the **highest possible hardware privilege level** (such as x86 System Management Mode / SMM, ARM Exception Level 3 / EL3, or RISC-V Machine Mode / M-Mode).

At this early stage of execution, **zero software security defenses exist**. 

Operating system access controls, antivirus software, virtual memory isolation, firewall rules, and disk encryption engines have not been loaded yet!

By compromising the early firmware binary in external Flash memory, the attacker gains permanent, invisible control over the entire computer. They can bypass operating system passwords, disable kernel memory protections, install hidden hardware backdoors, and log user data directly in memory, remaining completely undetected by operating system security tools.

Why can we not simply require the operating system to verify the firmware after the operating system boots up?

Because if the firmware itself is malicious, it can simply lie to the operating system! A compromised firmware binary can hook operating system memory queries and return fake, clean checksums, hiding its own malicious code from the kernel.

To secure a computer system against firmware tampering, the verification process **must begin before a single line of external software is executed.** 

The system requires an un-compromisable, hardware-enforced starting point that can mathematically verify the authenticity and integrity of the external firmware binary *before* allowing the CPU to execute it.

To eliminate the untrusted external storage vulnerability, computer architectures employ an **Immutable Boot ROM** and **Silicon eFuse Public Key Hash Binding**.

---

## 2. The Bank Vault Wax Seal and the Immutable Master Stamp

To build an intuitive, crystal-clear mental model of Hardware Roots of Trust, digital signatures, and eFuse public key binding before inspecting cryptographic algorithms, bitwise packet maps, and hardware registers, let us consider an everyday analogy: **A Royal Bank Manager Receiving Courier Delivery Briefcases**.

Imagine a central bank manager (**The CPU Execution Core**) sitting inside a secure, impenetrable bank vault (**The Silicon Microchip Die**). 

The bank manager needs to execute a complex set of daily financial ledgers (**The Boot Firmware Binary**).

```text
THE ROYAL BANK VAULT ANALOGY

 Bank Vault (CPU Silicon Die)                 Untrusted Road (SPI Bus)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Bank Manager              │                │ Courier Leather Briefcase │
 │ (Holds Un-Erasable Brand) │◄── Courier ────┤ (External SPI Flash)      │
 └───────────────────────────┘                └───────────────────────────┘
```

Because the ledgers are too large to store permanently inside the small bank vault, they are stored in a leather briefcase (**An External SPI Flash Memory Chip**) kept in an external warehouse across town. Every morning, a courier (**The System Interconnect Bus**) drives across town and delivers the briefcase through a small slot in the vault door.

Now, consider the security threat:
The courier driving the delivery truck is completely untrusted (**An External Untrusted Storage Channel**). An attacker could intercept the courier on the road, open the briefcase, and replace the genuine financial ledger with a forged ledger containing fake bank accounts (**Malicious Firmware Tampering**).

If the bank manager opens the briefcase and immediately executes the instructions in the forged ledger, the bank will transfer millions of dollars to the attacker's account!

How can the bank manager verify that the ledger inside the briefcase is $100\%$ genuine and un-tampered *before* reading a single line of text from it?

The bank manager cannot rely on a written note inside the briefcase saying *"This ledger is genuine"*, because the attacker could have forged the note too!

To solve this problem, the king implements a **Two-Stage Cryptographic Verification System**:

```text
THE TWO-STAGE VERIFICATION PROTOCOL

 Stage 1: Public Key Hash Check               Stage 2: Signature Verification
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Compare Publisher's Stamp │                │ Use Verified Stamp to     │
 │ against Un-Erasable Brand │                │ Verify Wax Seal on Ledger │
 └─────────────┬─────────────┘                └─────────────┬─────────────┘
               │                                            │
               ▼ Match Passed!                              ▼ Match Passed!
      STAMP IS AUTHENTIC!                          LEDGER IS UN-TAMPERED!
```

---

### Stage 1: The Un-Erasable Arm Brand (Silicon eFuses)
When the bank manager was born, the king permanently branded a unique, mathematical seal impression onto the manager's arm using an un-erasable hot iron (**One-Time Programmable Silicon eFuses**):

$$\text{Arm Brand} = \text{Hash of the King's Master Signing Stamp } (H_{\text{efuse}})$$

Because the brand is burned into the manager's physical arm inside the vault, **it can never be altered, erased, or replaced by any courier on the road.**

---

### Stage 2: The Briefcase Verification Handshake
Every morning, when the courier delivers the briefcase through the vault slot, the briefcase contains three items:
1. The Financial Ledger pages (**The Firmware Binary Payload $M$**).
2. The Publisher's Public Signing Stamp (**The Vendor's Public Key $K_{\text{pub}}$**).
3. A Wax Seal Impression stamped by the publisher's secret private ring (**The Cryptographic Digital Signature $S$**).

The bank manager executes a strict, 2-step verification protocol before reading the ledger:

#### Step A: Verify the Publisher's Stamp (eFuse Hash Binding)
The manager takes the Publisher's Public Stamp ($K_{\text{pub}}$) included in the briefcase, calculates its mathematical footprint ($\text{SHA-256}(K_{\text{pub}})$), and compares it directly against the un-erasable brand on their arm ($H_{\text{efuse}}$).
* If the calculated footprint does not match the arm brand, **the manager throws the briefcase into the trash slot!** The manager knows the courier swapped the stamp!
* If the footprint matches the arm brand, the manager knows with $100\%$ mathematical certainty that this stamp is the genuine stamp authorized by the king!

#### Step B: Verify the Wax Seal (Signature Verification)
Now that the stamp ($K_{\text{pub}}$) is proven to be authentic, the manager uses the stamp to verify the Wax Seal Impression ($S$) against the actual pages of the financial ledger ($M$).
* The manager calculates the mathematical hash of all the pages in the ledger.
* Using the validated stamp, the manager mathematically unlocks the Wax Seal.
* If the seal matches the calculated hash of the pages, **the manager knows that not a single character on a single page was altered during transit!**

The manager opens the ledger and begins processing the financial records with absolute confidence.

Breakdown of the analogy:
* The bank manager is the **CPU Execution Core**.
* The bank vault is the **On-Chip Silicon Microchip Die**.
* The un-erasable arm brand represents **One-Time Programmable (OTP) Silicon eFuses**.
* The external leather briefcase is the **External SPI NOR Flash Memory Chip**.
* The financial ledger is the **Boot Firmware Binary Payload ($M$)**.
* The Publisher's Public Stamp is the **Vendor's Public Key ($K_{\text{pub}}$)**.
* The Wax Seal Impression is the **Cryptographic Digital Signature ($S$)**.
* The verification process executed inside the vault is the **Hardware Root of Trust (RoT) in Immutable Mask ROM**.

---

## 3. Hardware Root of Trust and eFuse Public Key Binding

Now that we possess an intuitive mental model of un-erasable arm brands and wax seal verifications, let us examine the formal, rigorous engineering mechanics of **Hardware Roots of Trust (RoT)** and **Silicon eFuse Public Key Hash Binding**.

To establish a secure execution environment, a processor must anchor its security in a physical component that cannot be modified by software commands, electrical voltage fluctuations, or external flash memory programmers.

This foundational security anchor is called the **Hardware Root of Trust (RoT)**.

```text
HARDWARE ROOT OF TRUST (RoT) ARCHITECTURAL COMPONENTS

 Silicon Microchip Die (Immutable Security Domain)
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Immutable Mask Boot ROM                                  │
 │    * Etched directly into silicon metal layers (Read-Only).  │
 │    * Contains SHA-256 and RSA/ECDSA verification code.      │
 ├─────────────────────────────────────────────────────────────┤
 │ 2. Silicon eFuse Array (One-Time Programmable / OTP)        │
 │    * Electrical fuses permanently blown during manufacturing│
 │    * Stores 256-bit SHA-256 Hash of Root Public Key (H_efuse) │
 ├─────────────────────────────────────────────────────────────┤
 │ 3. Hardware Cryptographic Accelerator                       │
 │    * Dedicated SHA-256 & RSA/ECDSA math execution engine.   │
 └─────────────────────────────────────────────────────────────┘
```

An integrated Hardware Root of Trust consists of three physical components fabricated directly onto the processor's silicon die:

1. **Immutable Mask Boot ROM**: A small, read-only memory array ($32\text{ KB} \text{ to } 128\text{ KB}$) whose binary contents are etched into the physical metal interconnect layers during semiconductor fabrication. It contains the very first instructions executed upon reset, along with high-speed cryptographic hashing and signature verification algorithms.
2. **Silicon eFuse Array (One-Time Programmable Memory / OTP)**: An array of microscopic electrical fuses embedded within the silicon die. During factory manufacturing or platform provisioning, specific fuses are permanently blown using a high-current programming pulse, permanently storing a $256\text{-bit}$ or $384\text{-bit}$ cryptographic hash of the vendor's Root Public Key ($H_{\text{efuse}}$).
3. **Hardware Cryptographic Accelerator**: A dedicated digital logic block (such as an SHA-256 hashing engine and an RSA/ECDSA modular exponentiation unit) that executes cryptographic verification algorithms in hardware at multi-gigabyte-per-second speeds.

---

### What Is a Silicon eFuse?

An **eFuse (Electrical Fuse)** is a non-volatile, One-Time Programmable (OTP) storage element built using microscopic polysilicon or copper interconnect links on a microchip.

```text
PHYSICAL STRUCTURE OF A SILICON eFUSE

 Intact eFuse (Un-programmed / Logic '0')
 ───[ Microscopic Polysilicon / Copper Link ]───  (Low Resistance Path)

 Blown eFuse (Programmed / Logic '1')
 ───[ Vaporized / Melted Physical Gap ]───        (High Resistance / Open Circuit)
```

* **Un-programmed State (Logic '0')**: The eFuse link is intact, presenting a low-resistance electrical path.
* **Programming Process**: To write a logical '1', a specialized factory programming circuit applies a high-voltage, high-current pulse across the eFuse. The high current density causes physical **electromigration**, melting and vaporizing the microscopic polysilicon link and creating a permanent open circuit.
* **Immutability Invariant**: Once an eFuse link is blown, **it is physically destroyed**. It cannot be un-blown, repaired, or rewritten by any software instruction, operating system command, or external voltage spike.

During platform provisioning, the hardware manufacturer calculates the $256\text{-bit}$ SHA-256 cryptographic hash of their master Root Public Key ($K_{\text{pub\_root}}$) and burns the resulting 256 bits into a bank of 256 eFuses:

$$H_{\text{efuse}} = \text{SHA-256}(K_{\text{pub\_root}})$$

From that second forward, the processor die is permanently bound to the vendor's master public key!

---

### The 4-Step Hardware Root of Trust Verification Protocol

When the processor exits Power-On Reset, the CPU's Program Counter jumps to the Reset Vector inside the **Immutable Mask Boot ROM**. 

The Boot ROM code executes the **4-Step Hardware Verification Protocol** to validate the external SPI Flash binary before allowing a single external instruction to execute:

```text
4-STEP HARDWARE ROOT OF TRUST VERIFICATION FLOW

 External Flash ROM Header                 Silicon Hardware Root of Trust
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Firmware Binary (M)       │             │ Immutable Mask Boot ROM   │
 │ Root Public Key (K_pub)   │             │ SHA-256 / RSA Engine      │
 │ Digital Signature (S)     │             │ eFuse Array (H_efuse)     │
 └─────────────┬─────────────┘             └─────────────┬─────────────┘
               │                                         │
               ▼                                         ▼
 Step 1: Calculate H_calc = SHA-256(K_pub) ──────────────┤
                                                         │
 Step 2: Compare H_calc == H_efuse?                      │
         ├───────────────────────────────────────────────┤
         ▼ MATCH PASSED! (K_pub is Genuine!)             │
                                                         │
 Step 3: Calculate H_payload = SHA-256(M)                │
         Decrypt Signature: H_sig = Verify(S, K_pub)     │
         Compare H_payload == H_sig?                     │
         ├───────────────────────────────────────────────┤
         ▼ MATCH PASSED! (M is Un-tampered!)             │
                                                         │
 Step 4: EXECUTION HANDOFF TO FIRMWARE BINARY M! ────────┘
```

Let us dissect each step of the hardware verification pipeline in complete technical detail:

---

#### Step 1: Fetching the Firmware Manifest
The Immutable Boot ROM code reads the header structure (the **Firmware Manifest**) attached to the front of the external SPI Flash binary image.

The Firmware Manifest contains three primary fields:
1. **The Firmware Binary Payload ($M$)**: The actual executable boot code (e.g., $2\text{ Megabytes}$ of early platform initialization code).
2. **The Vendor's Root Public Key ($K_{\text{pub}}$)**: The $2,048\text{-bit}$, $3,072\text{-bit}$, or $4,096\text{-bit}$ RSA/ECDSA public key used to verify the signature.
3. **The Cryptographic Digital Signature ($S$)**: A $256\text{-byte}$ to $512\text{-byte}$ binary signature generated during factory build time by signing the hash of $M$ using the vendor's secret **Root Private Key ($K_{\text{priv}}$)**:

$$S = \text{Sign}_{K_{\text{priv}}}(\text{SHA-256}(M))$$

---

#### Step 2: Public Key Hash Verification (eFuse Binding Check)

Before using $K_{\text{pub}}$ to verify the signature, the Boot ROM **must prove that $K_{\text{pub}}$ actually belongs to the authorized hardware vendor**, and was not substituted by an attacker!

The Boot ROM passes the incoming public key $K_{\text{pub}}$ to the hardware SHA-256 hashing engine to calculate its $256\text{-bit}$ digest:

$$H_{\text{calc}} = \text{SHA-256}(K_{\text{pub}})$$

The hardware comparator reads the $256\text{-bit}$ value $H_{\text{efuse}}$ burned into the silicon eFuses, and evaluates the **eFuse Hash Binding Invariant**:

$$\text{Root\_Key\_Valid} \iff \mathbf{H_{\text{calc}} == H_{\text{efuse}}}$$

* **If $H_{\text{calc}} \neq H_{\text{efuse}}$ (Hash Mismatch)**: An attacker replaced $K_{\text{pub}}$ with a fake public key! The Boot ROM **aborts execution immediately**, sets a security status error code, and enters a permanent hardware halt state (`HLT` / `WFI`).
* **If $H_{\text{calc}} == H_{\text{efuse}}$ (Hash Match)**: The public key $K_{\text{pub}}$ is mathematically proven to be authentic!

---

#### Step 3: Payload Integrity and Signature Verification

Now that public key $K_{\text{pub}}$ is verified, the Boot ROM validates the integrity and authenticity of the firmware binary payload $M$.

1. **Payload Hashing**: The hardware hashing engine reads all $2\text{ Megabytes}$ of the firmware binary $M$ from external Flash and computes its $256\text{-bit}$ digest:
   $$H_{\text{payload}} = \text{SHA-256}(M)$$
2. **Signature Decryption / Verification**: The hardware RSA/ECDSA engine uses the verified public key $K_{\text{pub}}$ to decrypt/verify the digital signature $S$, extracting the expected hash $H_{\text{sig}}$:
   $$H_{\text{sig}} = \text{RSA\_Verify}_{K_{\text{pub}}}(S)$$
3. **Signature Comparison**: The Boot ROM compares the calculated payload hash against the signature hash:

$$\text{Payload\_Valid} \iff \mathbf{H_{\text{payload}} == H_{\text{sig}}}$$

* **If $H_{\text{payload}} \neq H_{\text{sig}}$ (Signature Mismatch)**: The firmware binary $M$ was modified, corrupted, or tampered with on the SPI Flash chip! The Boot ROM **aborts execution immediately**.
* **If $H_{\text{payload}} == H_{\text{sig}}$ (Signature Match)**: The firmware binary $M$ is proven to be $100\%$ authentic and completely un-tampered!

---

#### Step 4: Execution Handoff
Once both eFuse hash matching and digital signature verification have passed successfully, the Immutable Boot ROM code jumps directly to the entry point address of the validated firmware binary $M$:

$$\text{Program Counter (PC)} \Leftarrow \text{Entry\_Point}(M)$$

The CPU leaves the immutable Boot ROM and begins executing the validated external firmware binary with $100\%$ mathematical certainty of its security and integrity!

---

## 4. Hardware Write-Protect Pins, Key Revocation, and Anti-Rollback

In real-world commercial semiconductor engineering, deploying a Hardware Root of Trust requires handling critical physical and operational edge cases, such as compromised vendor keys, physical probe attacks, and firmware downgrades.

---

### 1. SPI Flash Hardware Write Protection (`WP#` Pin)

Once external Flash memory has been verified and execution is handed over to the firmware, what prevents runtime malware or a compromised device driver from sending SPI erase/write commands to corrupt the external Flash ROM while the system is running?

To prevent runtime modification of Flash memory, hardware platforms incorporate **Hardware Write-Protect Pins (`WP#`)** and **SPI Bus Lockout Registers**:

```text
HARDWARE SPI FLASH LOCKDOWN SCHEMATIC

 CPU / System Chipset                           External SPI NOR Flash Chip
 ┌───────────────────────────┐   WP# Pin        ┌───────────────────────────┐
 │ Hardware Security Engine  ├─────────────────►│ Hardware Write-Protect Pin│
 │ (Asserts WP# = 0)         │   (Active Low)   │ (Disables Charge Pumps!)  │
 └───────────────────────────┘                  └───────────────────────────┘
  (SPI Flash hardware permanently ignores ALL write/erase commands while WP# = 0!)
```

* The external SPI Flash chip features a physical, active-low **Write-Protect Pin (`WP#`)**.
* During early boot, the hardware security controller forces $\text{WP\#} = 0$.
* When $\text{WP\#} = 0$, the internal high-voltage charge pumps inside the Flash memory chip—which are required to erase or write Flash memory cells—are **physically disconnected from the memory array**.
* Even if malware sends an SPI Flash Erase command over the SPI data lines, the Flash chip's internal state machine rejects the command in hardware!

---

### 2. Key Manifests and Hardware Key Revocation

What happens if an authorized hardware vendor's private key $K_{\text{priv\_1}}$ is stolen by hackers or leaked online?

The vendor cannot re-manufacture physical CPU silicon chips that have already been sold to customers! The eFuses burned into those sold chips permanently match the hash of $K_{\text{pub\_1}}$.

If an attacker uses the stolen $K_{\text{priv\_1}}$ to sign a malicious firmware binary, the hardware verification protocol in Step 2 will accept the malicious binary as genuine!

To solve this problem, modern Root of Trust architectures use **Key Manifests** and **eFuse Revocation Bitmaps**:

```text
KEY MANIFEST HIERARCHY AND REVOCATION BITMAP

 Root Key (eFuse Hash Bound) ──► Signs Key Manifest
                                 │
                                 ├─► Secondary Key 1 (Revocation Bit 0 = 1 -> REVOKED!)
                                 ├─► Secondary Key 2 (Revocation Bit 1 = 0 -> VALID)
                                 └─► Secondary Key 3 (Revocation Bit 2 = 0 -> VALID)
```

1. **Root Key Indirection**: The master public key $K_{\text{pub\_root}}$ burned into eFuses is **never used to sign firmware binaries directly**.
2. **Key Manifest**: $K_{\text{pub\_root}}$ is used *only* to sign a small metadata structure called a **Key Manifest**.
3. **Secondary Operational Keys**: The Key Manifest contains a list of secondary operational public keys ($K_{\text{pub\_sub1}}, K_{\text{pub\_sub2}}, K_{\text{pub\_sub3}}$) alongside an **eFuse Revocation Bitmask** ($R_{\text{bits}}$).
4. **Key Revocation Mechanics**:
   * If $K_{\text{priv\_sub1}}$ is compromised, the vendor issues a firmware update that instructs the processor to **permanently blow eFuse Revocation Bit 0** ($R_{\text{bits}}[0] \Leftarrow 1$).
   * During the next boot, the Boot ROM reads $R_{\text{bits}}[0] == 1$, sees that Key 1 is marked as **REVOKED**, and refuses to accept any firmware binary signed by Key 1!
   * The vendor signs future firmware updates using $K_{\text{pub\_sub2}}$, restoring platform security without replacing hardware chips!

---

### 3. Anti-Rollback Protection (Downgrade Attack Prevention)

Suppose an attacker discovers a security vulnerability in Firmware Version 1.0. The vendor releases a security patch in Firmware Version 2.0 that fixes the vulnerability.

To bypass Firmware Version 2.0, the attacker attempts an **Anti-Rollback Attack (Version Downgrade Attack)**:
* The attacker takes a valid, legally signed copy of old Firmware Version 1.0.
* The attacker flashes the old Version 1.0 binary onto the device's external SPI Flash chip.
* Because Version 1.0 was genuinely signed by the vendor, its digital signature $S$ is $100\%$ mathematically valid!

If the Hardware Root of Trust only checked digital signatures, it would accept old Version 1.0, allowing the attacker to exploit the known vulnerability!

To defeat version downgrade attacks, hardware architectures implement **eFuse Anti-Rollback Counters**:

```text
ANTI-ROLLBACK eFUSE COUNTER VERIFICATION

 Firmware Binary Version Header: Version = 2.0 (Version Integer = 2)
                                   │
                                   ▼
 Hardware Root of Trust reads Silicon eFuse Counter Array:
 eFuse Counter Bits: [ 1 ][ 1 ][ 0 ][ 0 ] ──► Hardware Min Version = 2
                                   │
                                   ▼
 Is Firmware Version (2) >= Hardware Min Version (2)?
 YES ──► ALLOW BOOT! (If Version was 1, 1 < 2 -> REJECT BOOT!)
```

* The silicon chip die contains a dedicated bank of **Anti-Rollback eFuses** representing an incrementing integer counter ($C_{\text{efuse}}$).
* Every signed firmware binary carries a **Security Version Number (SVN)** integer in its signed manifest header (e.g., $\text{SVN} = 2$).
* During boot-up, the Boot ROM evaluates the **Anti-Rollback Invariant**:

$$\mathbf{\text{Allow Boot} \iff \text{SVN}_{\text{firmware}} \ge C_{\text{efuse}}}$$

* **Downgrade Attack Blocked**: If an attacker flashes old Version 1.0 ($\text{SVN} = 1$) onto a device where $C_{\text{efuse}} = 2$, the Boot ROM detects that $1 < 2$, **rejects the old firmware binary**, and halts execution!

When a new firmware version with $\text{SVN} = 3$ is installed, the firmware update routine blows the 3rd bit in the eFuse counter array ($C_{\text{efuse}} \Leftarrow 3$), permanently locking out all older firmware versions in hardware!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Hardware Roots of Trust, SHA-256 eFuse hash binding, RSA/ECDSA digital signature verification math, and firmware verification overheads, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal hardware security architect verifying the Boot ROM security pipeline for a $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor boots from an external SPI Flash memory chip containing a $2\text{-Megabyte}$ ($2,097,152\text{ bytes}$) Stage-1 firmware binary payload ($M$).

```text
HARDWARE ROOT OF TRUST VERIFICATION PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU clock frequency
 Size_M                    │ 2,097,152 Bytes (2 MB)│ Stage-1 Firmware Binary Payload size
 Size_Kpub                 │ 384 Bytes (3,072 Bits)│ RSA-3048 Vendor Public Key size
 Size_Sig                  │ 384 Bytes (3,072 Bits)│ RSA-3048 Digital Signature size
 Throughput_SHA256         │ 2.0 Bytes / Cycle     │ Hardware SHA-256 Hashing Engine Throughput
 Cycles_RSA3048            │ 12,000 Clock Cycles   │ Hardware RSA-3048 Exponentiation Engine Delay
 Cycles_eFuse_Comp         │ 4 Clock Cycles        │ 256-bit eFuse Hardware Comparator Delay
 T_flash_read_bw           │ 60.0 MB / Second      │ SPI Flash Read Bandwidth (QSPI Mode)
```

#### Cryptographic Specification:
* Root Public Key Hash Scheme: SHA-256 ($256\text{ bits} = 32\text{ bytes}$).
* Digital Signature Scheme: RSA-3048 with SHA-256.

---

### The Hardware Execution Tasks:

1. Calculate the total physical time $t_{\text{key\_hash}}$ (in nanoseconds and CPU clock cycles) required for the hardware SHA-256 engine to hash the $384\text{-byte}$ public key $K_{\text{pub}}$ and compare it against the $256\text{-bit}$ eFuse hash $H_{\text{efuse}}$.
2. Calculate the physical time $t_{\text{flash\_read}}$ required to stream the $2\text{-MB}$ firmware binary payload $M$ from external SPI Flash memory into internal Cache-as-RAM at $60.0\text{ MB/s}$.
3. Calculate the total CPU clock cycles $C_{\text{payload\_hash}}$ and physical time $t_{\text{payload\_hash}}$ required for the hardware SHA-256 engine to compute the hash over the $2\text{-MB}$ binary payload $M$.
4. Calculate the total physical verification time $T_{\text{rot\_total}}$ (in microseconds and CPU clock cycles) consumed by the complete Hardware Root of Trust pipeline before instruction execution can be handed off to firmware binary $M$.
5. Compute the net effective verification throughput in **Megabytes per second (MB/s)**.

---

### Step-by-Step Derivation

#### Step 1: Calculate Public Key Hash & eFuse Comparison Latency ($t_{\text{key\_hash}}$)

The vendor public key $K_{\text{pub}}$ is $384\text{ bytes}$ long ($3,072\text{ bits}$).

Hardware SHA-256 engine throughput $= 2.0\text{ Bytes per CPU clock cycle}$.

##### 1. Calculate SHA-256 Hashing Cycles for $K_{\text{pub}}$ ($C_{\text{key\_hash}}$):

$$C_{\text{key\_hash}} = \frac{\text{Size\_Kpub}}{\text{Throughput\_SHA256}} = \frac{384\text{ Bytes}}{2.0\text{ Bytes/cycle}} = \mathbf{192 \text{ CPU Clock Cycles}}$$

##### 2. Add eFuse Comparator Delay ($C_{\text{efuse\_comp}} = 4\text{ cycles}$):

$$C_{\text{key\_total}} = C_{\text{key\_hash}} + C_{\text{efuse\_comp}} = 192 + 4 = \mathbf{196 \text{ CPU Clock Cycles}}$$

##### 3. Calculate Physical Latency ($t_{\text{key\_hash}}$) at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$t_{\text{key\_hash}} = 196 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{61.25 \text{ Nanoseconds}} \quad (0.06125\ \mu\text{s})$$

The eFuse public key hash binding check completes in **$61.25\text{ nanoseconds}$ ($196\text{ CPU cycles}$)**!

---

#### Step 2: Calculate Physical SPI Flash Read Time ($t_{\text{flash\_read}}$)

Streaming $2\text{ MB}$ ($2,097,152\text{ bytes}$) of firmware binary from SPI Flash memory at a read bandwidth of $60.0\text{ MB/s}$ ($60.0 \times 10^6\text{ bytes/sec}$):

$$t_{\text{flash\_read}} = \frac{\text{Size\_M}}{\text{T\_flash\_read\_bw}} = \frac{2,097,152\text{ Bytes}}{60.0 \times 10^6\text{ Bytes/sec}}$$

$$t_{\text{flash\_read}} = 0.03495253\text{ seconds} = \mathbf{34,952,533.33 \text{ Nanoseconds}} \quad (\mathbf{34.9525 \text{ milliseconds}})$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{flash\_read}} = \frac{34,952,533.33\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{111,848,106.67 \text{ CPU Clock Cycles}}$$

---

#### Step 3: Calculate Payload SHA-256 Hashing Latency ($t_{\text{payload\_hash}}$)

Hardware SHA-256 engine processes $2.0\text{ Bytes/cycle}$ over the $2,097,152\text{-byte}$ payload $M$:

$$C_{\text{payload\_hash}} = \frac{2,097,152\text{ Bytes}}{2.0\text{ Bytes/cycle}} = \mathbf{1,048,576 \text{ CPU Clock Cycles}}$$

Calculate physical latency $t_{\text{payload\_hash}}$ at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$t_{\text{payload\_hash}} = 1,048,576 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{327,680.0 \text{ Nanoseconds}} \quad (\mathbf{327.68 \text{ microseconds}})$$

Notice that because the SHA-256 engine runs in hardware at $3.2\text{ GHz}$, hashing $2\text{ Megabytes}$ takes only **$327.68\text{ microseconds}$**!

---

#### Step 4: Calculate Total Hardware Root of Trust Pipeline Latency ($T_{\text{rot\_total}}$)

Because the hardware hashing engine can hash incoming Flash bytes in a pipelined stream as they arrive from the SPI bus (since $t_{\text{payload\_hash}} = 0.327\text{ ms} \ll t_{\text{flash\_read}} = 34.95\text{ ms}$), the payload hashing completes concurrently with the SPI Flash read!

The total end-to-end verification pipeline latency $T_{\text{rot\_total}}$ is:

$$T_{\text{rot\_total}} = t_{\text{key\_hash}} + t_{\text{flash\_read}} + t_{\text{rsa\_verify}}$$

Where $t_{\text{rsa\_verify}}$ is the RSA-3048 modular exponentiation delay ($12,000\text{ cycles}$ at $3.2\text{ GHz}$):

$$t_{\text{rsa\_verify}} = 12,000 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{3,750.0 \text{ Nanoseconds}} \quad (3.75\ \mu\text{s})$$

Summing all pipeline phases:

$$T_{\text{rot\_total}} = 61.25\text{ ns} + 34,952,533.33\text{ ns} + 3,750.0\text{ ns}$$

$$T_{\text{rot\_total}} = 34,956,344.58\text{ Nanoseconds} = \mathbf{34.956345 \text{ Milliseconds}} \quad (34,956.35\ \mu\text{s})$$

Total CPU clock cycles consumed:

$$C_{\text{rot\_total}} = 196 + 111,848,107 + 12,000 = \mathbf{111,860,303 \text{ CPU Clock Cycles}}$$

```text
HARDWARE ROOT OF TRUST VERIFICATION TIMELINE SUMMARY

 Execution Phase               │ CPU Clock Cycles (3.2 GHz) │ Physical Latency
───────────────────────────────┼────────────────────────────┼─────────────────────────
 eFuse Key Hash Check (384B)   │ 196 Cycles                 │ 61.25 Nanoseconds
 SPI Flash Read (2 MB Payload) │ 111,848,107 Cycles         │ 34.9525 Milliseconds
 RSA-3048 Signature Verification│ 12,000 Cycles              │ 3.750 Microseconds
───────────────────────────────┼────────────────────────────┼─────────────────────────
 TOTAL RoT VERIFICATION TIME   │ 111,860,303 Cycles         │ 34.9563 Milliseconds
```

---

#### Step 5: Calculate Net Effective Verification Throughput

The net throughput of the hardware verification pipeline (including Flash reading, public key binding, and RSA-3048 signature checking) is:

$$\text{Throughput}_{\text{rot}} = \frac{\text{Size\_M}}{T_{\text{rot\_total}}} = \frac{2,097,152\text{ Bytes}}{0.034956345\text{ seconds}}$$

$$\text{Throughput}_{\text{rot}} = 59,993,458\text{ Bytes/second} \approx \mathbf{59.993 \text{ MB/Second}}$$

##### Engineering Conclusion:
By using dedicated hardware accelerators for SHA-256 and RSA-3048, the Hardware Root of Trust verified the $2\text{-MB}$ firmware binary at an effective rate of **$59.993\text{ MB/sec}$**—operating at $99.99\%$ of the physical SPI Flash read bandwidth! 

The entire cryptographic verification pipeline added only **$3.81\text{ microseconds}$ of cryptographic overhead** over raw Flash reading time, providing absolute hardware security with zero human-perceptible boot delay!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and cryptographic results against system security principles:

1. **eFuse Comparator Latency Verification**:
   * Public key size $= 384\text{ bytes}$. Hashing at 2 bytes/cycle $= 192\text{ cycles}$.
   * At $3.2\text{ GHz}$, $192 \times 0.3125\text{ ns} = 60.0\text{ ns}$.
   * Total eFuse check time $= 60.0\text{ ns (Hash)} + 1.25\text{ ns (Comparator)} = 61.25\text{ ns}$.
   * The eFuse binding check completes in $61.25\text{ nanoseconds}$, proving that key validation imposes zero boot delay.
2. **Cryptographic Overhead vs. Memory Transport**:
   * Raw Flash transport time $= 34.9525\text{ ms}$.
   * Pure crypto math time $= t_{\text{key\_hash}} + t_{\text{rsa\_verify}} = 0.06125\ \mu\text{s} + 3.750\ \mu\text{s} = 3.81125\ \mu\text{s}$.
   * Cryptographic math accounts for only **$0.0109\%$ of total boot verification time**!
   * The physical bandwidth of the SPI Flash bus is the primary limiting factor, confirming that hardware-accelerated Root of Trust verification is virtually free in terms of CPU execution performance!

All eFuse hash binding equations, SHA-256/RSA-3048 hardware cycle counts, anti-rollback counter checks, and verification throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Hardware Root of Trust (RoT)**: An un-modifiable, hardware-enforced security anchor (built using an immutable Mask ROM, dedicated cryptographic accelerators, and silicon eFuses) that executes first upon power-on to cryptographically authenticate external firmware binaries before execution.
* **eFuse Public Key Hash Binding**: The hardware security mechanism where a $256\text{-bit}$ or $384\text{-bit}$ cryptographic hash of an authorized vendor's public key is permanently burned into silicon eFuses during manufacturing, allowing the immutable Boot ROM to mathematically verify external public keys before using them to authenticate firmware signatures.

TERMINADO