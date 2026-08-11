---
title: "02-cryptographic-chain-of-trust — Cryptographic Chain of Trust, Anti-Rollback eFuse Counters, and Measured Boot"
---

# 02-cryptographic-chain-of-trust — Cryptographic Chain of Trust, Anti-Rollback eFuse Counters, and Measured Boot

## 1. The Transitive Security Failure and Version Downgrade Threat

When a computer processor powers on, an immutable, hardware-enforced Root of Trust (RoT) embedded within its Boot ROM executes the very first stage of software verification. By reading a vendor's public key from external Flash memory, hashing it, and comparing the result against a 256-bit cryptographic hash permanently burned into silicon eFuses, the Boot ROM mathematically proves that the initial bootloader binary (Stage-1 Firmware) is authentic and untampered before allowing it to run.

However, a modern platform bootstrapping process does not consist of a single, monolithic binary file. 

Because silicon Boot ROMs are physically tiny—storing only 32 to 128 Kilobytes of code to conserve expensive CPU die area—the Boot ROM cannot initialize the entire computer platform by itself. 

Instead, booting a complex server or workstation requires a multi-stage execution pipeline, where small, specialized software stages load larger, more complex stages in sequence:

```text
THE MULTI-STAGE PLATFORM BOOT PIPELINE

 ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
 │ Boot ROM ├─────►│ Stage-1  ├─────►│ Stage-2  ├─────►│ OS Kernel│
 │ (RoT)    │      │ Firmware │      │ Firmware │      │ Loader   │
 └──────────┘      └──────────┘      └──────────┘      └──────────┘
  (32 KB)           (512 KB)          (4 MB)            (16 MB)
```

This multi-stage loading architecture introduces a major security challenge: **The Transitive Security Failure.**

Suppose the Boot ROM (Stage 0) successfully authenticates Stage-1 Firmware ($512\text{ KB}$) and hands over control. 

If Stage-1 Firmware then loads Stage-2 Firmware ($4\text{ MB}$) from external Flash memory into RAM and jumps directly to its entry point **without verifying Stage-2's digital signature**, the entire security of the system collapses! 

An attacker who could not modify Stage-1 can simply tamper with Stage-2 on the external Flash chip. 

The initial security guarantee established by the hardware Root of Trust is completely lost the instant an unverified software boundary is crossed!

Furthermore, an even more insidious physical vulnerability threatens multi-stage systems: **The Version Rollback Attack (Downgrade Attack).**

Suppose an attacker wants to compromise a secure server running Firmware Version 2.0. The vendor previously released Firmware Version 1.0, which contained a known software vulnerability that allowed arbitrary code execution. The vendor fixed the vulnerability in Version 2.0.

To exploit the server, the attacker executes a version downgrade attack:
1. The attacker downloads a genuine, legally signed binary copy of old Firmware Version 1.0 from the vendor's public website.
2. The attacker uses an external Flash programmer to overwrite the server's SPI Flash ROM with the old Version 1.0 binary.
3. When the server boots, the Boot ROM and Stage-1 Firmware check Version 1.0's digital signature.
4. **The Signature Check Passes!** Because Version 1.0 was genuinely created and signed by the vendor using their valid private key, the mathematical signature check is $100\%$ valid!
5. The server boots Version 1.0, and the attacker immediately triggers the known vulnerability to gain root control over the machine.

```text
THE VERSION ROLLBACK ATTACK (DOWNGRADE HAZARD)

 Firmware Version 2.0 (Security Patch Active)
 ┌─────────────────────────────────────────────────────────────┐
 │ Attacker overwrites SPI Flash with Genuine Version 1.0!     │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Boot Verification Pipeline (Checks RSA/ECDSA Signature)
 ┌─────────────────────────────────────────────────────────────┐
 │ Signature Check = VALID! (Version 1.0 was signed by Vendor) │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 System boots Version 1.0 ──► Attacker executes known exploit!
 (Signature checking alone CANNOT prevent version rollback attacks!)
```

Look at the failure of signature checking alone:
A standard digital signature proves that a binary was created by the authorized vendor, but it **cannot prove whether the binary is current or dangerously outdated!**

Finally, there are scenarios where a platform owner wants to boot custom, open-source, or third-party operating system kernels that do not carry the hardware vendor's official digital signature. 

If the hardware strictly blocks any unsigned binary from running, the user loses control over their own machine. 

However, if the hardware allows unsigned binaries to run blindly, a remote bank or enterprise server has no way of knowing whether the machine booting up is running a trusted, secure operating system or a compromised, malicious kernel.

To solve these multi-stage verification, version rollback, and remote attestation challenges, computer architectures employ three integrated security primitives: **The Cryptographic Chain of Trust**, **Anti-Rollback eFuse Counters**, and **Measured Boot via TPM 2.0 PCR Extensions**.


### Security Rule 1: The Relay Baton Inspection (Cryptographic Chain of Trust)

The king hires Runner 1 (**The Boot ROM**) personally inside the royal palace and inspects their credentials directly. Runner 1 is $100\%$ trusted from day one.

However, Runner 1 does not know Runner 2, Runner 3, or Runner 4. How does the king ensure that no imposter or assassin sneaks into the relay team along the road?

The king establishes **The Chain of Inspection Rule**:

> **The Inspection Rule**: No runner is permitted to hand over the baton and let the next runner start running until they have **checked the next runner's official ID badge and verified their signature seal!**

```text
THE RELAY BATON INSPECTION (CHAIN OF TRUST)

 Runner 1 (Trusted) ──► Inspects Runner 2's ID & Seal ──► Passes Baton!
                        Runner 2 (Now Trusted!) ──► Inspects Runner 3's ID & Seal ──► Passes Baton!
                                                   Runner 3 (Now Trusted!)...
 (Trust is handed off continuously from one link to the next!)
```

* Runner 1 (Boot ROM) inspects Runner 2 (Stage-1 Firmware) before letting Runner 2 run.
* Once Runner 2 is verified, Runner 2 becomes trusted. Runner 2 then inspects Runner 3 (Stage-2 Firmware) before handing over the baton.
* Trust is transferred inductively from link to link down the entire chain! If any runner fails inspection, the race halts immediately.


### Security Rule 3: The Brass Safe and the Indestructible Journal (Measured Boot / TPM 2.0)

Now, what if the king wants to allow custom guest runners (**Third-Party Custom Kernels**) to run in the race, but wants an un-forgeable, permanent record of *exactly* who ran, so a remote ally can verify the kingdom's security status?

Beside the track sits a heavy brass safe (**The Trusted Platform Module / TPM**). Inside the safe sits a single piece of parchment called the **Platform Log Register (PCR)**.

The safe has a narrow slot that accepts paper entries, but enforces an absolute rule: **YOU CANNOT ERASE OR OVERWRITE THE PARCHMENT!**

```text
THE BRASS SAFE JOURNAL (PCR EXTEND OPERATOR)

 Old Value in Safe: "10"
 New Runner Arrives: ID "5"
                               │
                               ▼ (Mathematical Mix & Hash Operation)
 New Value Written to Safe: Hash("10" + "5") = "842"
 (The old value cannot be erased! Every runner's ID is permanently blended in!)
```

The only way to write to the parchment is a special blending operation called **Extend**:
* To log a new runner, the gatekeeper takes the **current number** written on the parchment, glues the **new runner's ID badge number** to the bottom, runs the combined text through a mathematical hashing machine, and writes the new blended result over the parchment.

At the end of the race, the final number written on the parchment inside the safe is a unique, un-forgeable mathematical fingerprint representing **the exact identity and order of every single runner who touched the track!**

If an imposter ran for even 5 seconds, the final number in the safe will be completely different, exposing the intrusion to the king's remote allies (**Remote Attestation**)!

This royal relay race is the exact physical analogue of **Cryptographic Chains of Trust, Anti-Rollback eFuse Counters, and Measured Boot**:
* The king is the **Hardware Manufacturer**.
* Relay runners are **Firmware and Software Boot Stages ($S_0, S_1, S_2, S_3$)**.
* Passing the baton after inspection is the **Cryptographic Chain of Trust**.
* The mechanical ratchet wheel is an **Anti-Rollback eFuse Counter Array**.
* Retired runners with genuine old badges are **Outdated Signed Firmware Binaries (Version 1.0)**.
* The brass safe is a **Trusted Platform Module (TPM 2.0)**.
* Blending numbers into the safe parchment is the **TPM PCR Extend Operation ($PCR_{\text{new}} = H(PCR_{\text{old}} \parallel H(M_{i+1}))$)**.
* Sending the final safe number to an ally is **Remote Attestation**.


### Primitive 1: The Cryptographic Chain of Trust (Transitive Verification)

The security of a multi-stage boot sequence relies on an inductive mathematical theorem:

> **The Transitive Trust Theorem**: If stage $S_0$ is trusted by hardware axiom (the Root of Trust), and every stage $S_i$ cryptographically authenticates stage $S_{i+1}$ before transferring control to $S_{i+1}$, then stage $S_n$ is mathematically proven to be authentic and untampered for all $n \ge 0$.

$$\mathbf{S_0 \text{ (Hardware RoT)} \quad \implies \quad S_1 \quad \implies \quad S_2 \quad \implies \quad \dots \quad \implies \quad S_n \text{ (OS Kernel)}}$$

```text
TRANSITIVE CHAIN OF TRUST EXECUTION FLOW

 ┌──────────┐  Authenticates   ┌──────────┐  Authenticates   ┌──────────┐
 │ Boot ROM ├─────────────────►│ Stage-1  ├─────────────────►│ Stage-2  │
 │ (RoT)    │                  │ Firmware │                  │ Firmware │
 └──────────┘                  └──────────┘                  └────┬─────┘
   (Level 0)                     (Level 1)                        │
                                                                  ▼ Authenticates
 ┌──────────┐                  ┌──────────┐                  ┌────┴─────┐
 │ OS       │◄─────────────────┤ OS Kernel│◄─────────────────┤ OS       │
 │ Execution│   Authenticates  │ (Level 4)│   Authenticates  │ Bootloader│
 └──────────┘                  └──────────┘                  └──────────┘
```

#### The Transitive Verification Step

For any stage $S_i$ in the boot sequence executing at runtime:

1. Stage $S_i$ locates Stage $S_{i+1}$'s binary image $M_{i+1}$, public key $K_{\text{pub\_i+1}}$, and digital signature $S_{i+1}$ in memory.
2. Stage $S_i$ verifies Stage $S_{i+1}$'s public key $K_{\text{pub\_i+1}}$ against an authorized key manifest or certificate authority chain validated by $S_i$.
3. Stage $S_i$ computes the cryptographic hash of Stage $S_{i+1}$'s binary payload:
   $$H_{i+1} = \text{SHA-256}(M_{i+1})$$
4. Stage $S_i$ verifies the digital signature $S_{i+1}$ using public key $K_{\text{pub\_i+1}}$:
   $$\text{Verify}_{K_{\text{pub\_i+1}}}(S_{i+1}) \stackrel{?}{=} H_{i+1}$$
5. **Gating Decision**:
   * **If Verification Passes**: Stage $S_i$ jumps to the entry point address of Stage $S_{i+1}$ ($\text{PC} \Leftarrow \text{Entry}(S_{i+1})$).
   * **If Verification Fails**: Stage $S_i$ **aborts execution immediately**, triggers a security event log, and halts the processor.


### Primitive 2: Anti-Rollback eFuse Counter Mechanics

To prevent version downgrade attacks (where an attacker flashes an old, vulnerable, but legitimately signed Version 1.0 firmware binary), hardware platforms incorporate **Monotonic Anti-Rollback eFuse Counters**.

Every signed firmware binary manifest carries an integer field called the **Security Version Number (SVN)**:

$$\text{Firmware Manifest Header} \implies [\quad \text{Binary Version (e.g., 2.1)} \quad | \quad \text{Security Version Number (SVN = 3)} \quad]$$

Inside the silicon processor die, a dedicated bank of $N_{\text{bits}}$ eFuses is configured as a unary monotonic counter ($C_{\text{efuse}}$).

```text
UNARY MONOTONIC eFUSE COUNTER ARRAY (32 BITS)

 eFuse Bit Index : 0  1  2  3  4  5  6 ... 31
 eFuse Bit State : 1  1  1  0  0  0  0 ... 0
                   ◄───►
                   3 Bits Blown (C_efuse = 3)
```

In a unary eFuse counter, the integer value $C_{\text{efuse}}$ is represented by the number of consecutive bits blown to $1$:
* $C_{\text{efuse}} = 0 \implies \text{0000\_0000}_2$ (0 fuses blown)
* $C_{\text{efuse}} = 1 \implies \text{0000\_0001}_2$ (1 fuse blown)
* $C_{\text{efuse}} = 2 \implies \text{0000\_0011}_2$ (2 fuses blown)
* $C_{\text{efuse}} = 3 \implies \text{0000\_0111}_2$ (3 fuses blown)

#### The Anti-Rollback Invariant

During early boot, before Stage $S_i$ executes Stage $S_{i+1}$, the hardware or firmware evaluates **The Anti-Rollback Invariant**:

$$\mathbf{\text{Allow Execution} \iff \text{SVN}_{i+1} \ge C_{\text{efuse}}}$$

Where:
* $\text{SVN}_{i+1}$ is the Security Version Number declared in Stage $S_{i+1}$'s signed manifest.
* $C_{\text{efuse}}$ is the physical integer counter value read from the hardware eFuse array.

#### The Auto-Update Protocol (Permanently Locking Out Old Versions)

When a new firmware update with a higher Security Version Number ($\text{SVN}_{\text{new}} > C_{\text{efuse}}$) is successfully verified and installed:

1. The firmware update routine issues a high-voltage programming command to the silicon eFuse controller.
2. The eFuse controller permanently blows $(\text{SVN}_{\text{new}} - C_{\text{efuse}})$ additional eFuse links in the array:

$$C_{\text{efuse}} \Leftarrow \text{SVN}_{\text{new}}$$

3. **Downgrade Locked Forever**: From that exact second forward, any attempt to boot an older firmware binary whose $\text{SVN} < \text{SVN}_{\text{new}}$ will fail the Anti-Rollback Invariant ($\text{SVN} < C_{\text{efuse}}$) and be **rejected in hardware!**


#### The Mathematical PCR Extend Operator

The TPM 2.0 chip enforces a strict hardware access rule: **A CPU or firmware stage CANNOT overwrite or directly write a value to a PCR register!**

The *only* way to update a PCR register is through the mathematical **PCR Extend Command**:

$$\mathbf{\text{PCR}_{\text{new}} = \text{SHA-256}\left( \text{PCR}_{\text{old}} \quad \parallel \quad \text{SHA-256}(M_{i+1}) \right)}$$

Where:
* $\text{PCR}_{\text{new}}$ is the updated 256-bit value written into the TPM PCR register.
* $\text{PCR}_{\text{old}}$ is the existing 256-bit value sitting inside the TPM PCR register.
* $M_{i+1}$ is the binary payload of the next software stage being measured.
* $\text{SHA-256}(M_{i+1})$ is the 256-bit cryptographic measurement hash of Stage $S_{i+1}$.
* $\parallel$ represents the binary string concatenation operator (joining two 256-bit vectors into a single 512-bit vector).

```text
TPM 2.0 PCR EXTEND DATAPATH

 Existing PCR[0] Register (256 Bits) ──┐
                                       ├──► Concatenate (512 Bits) ──► [ SHA-256 Engine ]
 New Measurement Hash SHA-256(M_i+1) ──┘                                      │
                                                                               ▼
 New PCR[0] Value Updated ◄────────────────────────────────────────────────────┘
 (Old value CANNOT be erased! The new measurement is cryptographically chained!)
```

#### Three Mathematical Properties of the PCR Extend Operator:

1. **Non-Commutativity**: Measuring Stage A then Stage B produces a completely different final PCR value than measuring Stage B then Stage A:
   $$\text{Extend}(\text{Extend}(0, A), B) \neq \text{Extend}(\text{Extend}(0, B), A)$$
   This proves to remote verifiers the **exact chronological sequence** in which software stages executed!
2. **Irreversibility**: Because SHA-256 is a one-way cryptographic hash function, an attacker who gains control of the system at Stage 4 **cannot work backward to clear or reset the PCR register** to hide the fact that a malicious Stage 3 executed earlier!
3. **History Sensitivity**: The final PCR value is a unique mathematical aggregate representing the entire execution history of every binary loaded since power-on.


## Real-World Silicon Engineering: TOCTOU Race Conditions and PCR Bricking

In commercial systems engineering, deploying Chains of Trust and Measured Boot introduces subtle physical race conditions and operational hazards that platform architects must design against.


### 2. The PCR Bricking Hazard (Brittle Measurement Lockouts)

A major operational hazard in Measured Boot is **PCR Bricking**.

Suppose a user configures full-disk encryption (such as BitLocker or LUKS) on their laptop, sealing the disk decryption key inside the TPM 2.0 chip so that the key is released **ONLY IF $\text{PCR}[0]$ matches the exact expected measurement hash**:

$$\text{Unseal Key} \iff \text{PCR}[0] == \text{Hash}_{\text{expected}}$$

Now, suppose the motherboard manufacturer releases an official, legitimate BIOS firmware update that fixes a minor USB bug:
1. The user installs the official BIOS update.
2. The next morning, the laptop boots up. The new BIOS binary $M_{\text{new}}$ is measured into the TPM:
   $$\text{PCR}[0]_{\text{new}} = \text{SHA-256}\left( \text{PCR}[0]_{\text{old}} \quad \parallel \quad \text{SHA-256}(M_{\text{new}}) \right)$$
3. Because $M_{\text{new}} \neq M_{\text{old}}$, **$\text{PCR}[0]_{\text{new}}$ is completely different from $\text{Hash}_{\text{expected}}$**!
4. The TPM 2.0 chip refuses to unseal the disk encryption key!
5. The laptop cannot boot, and the user is permanently locked out of their encrypted hard drive!

#### Engineering Solution: Signed Policy Manifest Sealing
To prevent legitimate firmware updates from bricking disk encryption:
* Modern systems do **not** seal disk keys against raw, fragile PCR numbers directly.
* Instead, keys are sealed against a **Signed Authorization Policy** created by the platform owner. When the BIOS is updated, the owner signs a new policy manifest updating the authorized PCR values, allowing the TPM to unseal the key smoothly after legitimate updates!


### Scenario & Parameters

You are a senior hardware security architect verifying the multi-stage boot pipeline of a $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a 4-stage Measured and Secure Boot pipeline:
* **Stage 0 (Boot ROM / CRTM)**: Hardwired in silicon.
* **Stage 1 (PEI Firmware Binary $M_1$)**: Size $= 512\text{ KB} = 524,288\text{ bytes}$. Security Version Number $\text{SVN}_1 = 3$.
* **Stage 2 (DXE Firmware Binary $M_2$)**: Size $= 4\text{ MB} = 4,194,304\text{ bytes}$. Security Version Number $\text{SVN}_2 = 3$.
* **Stage 3 (OS Bootloader Binary $M_3$)**: Size $= 2\text{ MB} = 2,097,152\text{ bytes}$. Security Version Number $\text{SVN}_3 = 2$.

```text
MEASURED AND SECURE BOOT PIPELINE PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU execution clock frequency
 C_efuse                   │ 3 (Unary: 0000_0111)  │ Current hardware anti-rollback eFuse counter
 Throughput_SHA256         │ 2.0 Bytes / Cycle     │ Hardware SHA-256 engine throughput
 Cycles_RSA3048            │ 12,000 Clock Cycles   │ Hardware RSA-3048 signature verify delay
 T_tpm_extend              │ 15.0 Microseconds     │ SPI transmission & TPM 2.0 PCR Extend delay
 PCR_initial               │ 32 Bytes of 0x00      │ Initial state of PCR[0] at power-on
```

#### Cryptographic Specification:
* Hash Function: SHA-256 ($32\text{ bytes} / 256\text{ bits}$).
* Digital Signature Scheme: RSA-3048 with SHA-256.


### Step-by-Step Derivation

#### Step 1: Evaluate the Anti-Rollback Invariant Across Boot Stages

The current hardware eFuse counter is $C_{\text{efuse}} = 3$.

We evaluate $\text{SVN}_i \ge C_{\text{efuse}}$ for each stage:

* **Stage 1 ($\text{SVN}_1 = 3$)**:
  $$\text{Check: } 3 \ge 3 \quad (\mathbf{\text{PASSED! Stage 1 Approved for Execution}})$$
* **Stage 2 ($\text{SVN}_2 = 3$)**:
  $$\text{Check: } 3 \ge 3 \quad (\mathbf{\text{PASSED! Stage 2 Approved for Execution}})$$
* **Stage 3 ($\text{SVN}_3 = 2$)**:
  $$\text{Check: } 2 \ge 3 \quad (\mathbf{\text{FAILED! Version Rollback Attack Detected!}})$$

##### Result:
Stage 3 fails the Anti-Rollback Invariant ($2 < 3$). The boot pipeline **ABORTS IMMEDIATELY AT STAGE 3**. 

Stage 3 (OS Bootloader) is **blocked from executing**, protecting the system against a downgrade attack!


#### Step 3: Calculate Stage 2 Execution Latency ($M_2 = 4\text{ MB} = 4,194,304\text{ Bytes}$)

##### 1. SHA-256 Payload Hashing ($4,194,304\text{ Bytes}$ at $2.0\text{ Bytes/cycle}$):

$$C_{\text{hash2}} = \frac{4,194,304\text{ Bytes}}{2.0\text{ Bytes/cycle}} = \mathbf{2,097,152 \text{ CPU Clock Cycles}}$$

$$t_{\text{hash2}} = 2,097,152 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{655,360.0 \text{ Nanoseconds}} \quad (655.36\ \mu\text{s})$$

##### 2. RSA-3048 Signature Verification:
$$C_{\text{rsa2}} = \mathbf{12,000 \text{ CPU Clock Cycles}} \quad (3,750.0\text{ ns} = 3.75\ \mu\text{s})$$

##### 3. TPM 2.0 PCR[0] Extend Operation:
$$C_{\text{tpm2}} = \mathbf{48,000 \text{ CPU Clock Cycles}} \quad (15,000.0\text{ ns} = 15.00\ \mu\text{s})$$

##### Total Stage 2 Execution Time ($t_{\text{stage2\_total}}$):

$$t_{\text{stage2\_total}} = 655,360.0\text{ ns} + 3,750.0\text{ ns} + 15,000.0\text{ ns} = \mathbf{674,110.0 \text{ Nanoseconds}} \quad (\mathbf{674.11 \text{ }\mu\text{s}})$$

$$C_{\text{stage2\_total}} = 2,097,152 + 12,000 + 48,000 = \mathbf{2,157,152 \text{ CPU Clock Cycles}}$$


#### Step 5: Compute Final PCR[0] Value After Stage 1 and Stage 2

Initial state at power-on: $\text{PCR}[0]_0 = \text{0x0000\_0000\dots0000}$ ($32\text{ bytes of zeros}$).

Using the simplified XOR combination operator $H(A \parallel B) = A \oplus B$:

##### 1. Extend Stage 1 Measurement ($\text{Hash}_1 = \text{0x1111\dots1111}$):

$$\text{PCR}[0]_1 = \text{PCR}[0]_0 \oplus \text{Hash}_1 = \text{0x0000\dots0000} \oplus \text{0x1111\dots1111} = \mathbf{\text{0x1111\_1111\_1111\_1111\_1111\_1111\_1111\_1111}}$$

##### 2. Extend Stage 2 Measurement ($\text{Hash}_2 = \text{0x2222\dots2222}$):

$$\text{PCR}[0]_2 = \text{PCR}[0]_1 \oplus \text{Hash}_2 = \text{0x1111\dots1111} \oplus \text{0x2222\dots2222} = \mathbf{\text{0x3333\_3333\_3333\_3333\_3333\_3333\_3333\_3333}}$$

##### Final PCR[0] Value:
$$\mathbf{\text{PCR}[0]_{\text{final}} = \text{0x3333\_3333\_3333\_3333\_3333\_3333\_3333\_3333}}$$

If a remote attestation server queries the TPM 2.0 chip, the TPM returns $\text{PCR}[0] = \text{0x3333\dots3333}$, mathematically proving that Stage 1 and Stage 2 executed successfully before the downgrade attack on Stage 3 was blocked!


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Cryptographic Chain of Trust**: The inductive security architecture where an immutable hardware Root of Trust ($S_0$) cryptographically authenticates the next software stage ($S_1$) before execution, which in turn authenticates $S_2$, extending transitive trust down the entire boot pipeline to the OS kernel.
* **Anti-Rollback eFuse Counters**: Unary monotonic hardware eFuse arrays ($C_{\text{efuse}}$) burned into silicon that store the minimum allowable Security Version Number ($\text{SVN}$), permanently blocking version downgrade attacks even when older firmware binaries carry valid vendor signatures.
* **Measured Boot (TPM 2.0 PCR Extension)**: The non-blocking cryptographic audit protocol where each boot stage measures (hashes) the next stage and extends the measurement into a hardware TPM 2.0 Platform Configuration Register ($\text{PCR}_{\text{new}} = \text{SHA-256}(\text{PCR}_{\text{old}} \parallel \text{Hash})$), creating an un-forgeable, history-sensitive record for remote attestation.