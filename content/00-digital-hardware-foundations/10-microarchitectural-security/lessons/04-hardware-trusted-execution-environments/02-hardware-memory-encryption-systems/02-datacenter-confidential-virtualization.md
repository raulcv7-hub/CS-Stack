content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/04-hardware-trusted-execution-environments/02-hardware-memory-encryption-systems/02-datacenter-confidential-virtualization.md
# Datacenter Confidential Virtualization Architecture and Hardware Guest Memory Encryption

In public cloud data center infrastructure, enterprise organization workloads run inside virtualized environments managed by third-party cloud service providers. Traditional hardware virtualization relies on a software abstraction layer known as the **Hypervisor** or **Virtual Machine Monitor (VMM)**. Operating at the highest hardware privilege level (Ring -1 / EL2), the hypervisor allocates physical memory to guest Virtual Machines (VMs), manages Extended Page Tables (EPT/NPT) for virtual-to-physical address translation, handles hardware device interrupts, and controls VM context switches during `VM-Exit` and `VM-Entry` events. However, this traditional virtualization architecture creates a severe security risk: **The Untrusted Hypervisor Threat Model**. Because the hypervisor operates at Ring -1, a malicious cloud administrator, a compromised host kernel, or an attacker exploiting a zero-day hypervisor vulnerability possesses complete, unrestricted access to the physical memory of every guest VM running on the server. The hypervisor can read plaintext DRAM memory pages owned by guest VMs, inspect guest CPU registers (`RAX`, `RSP`, `RIP`) during `VM-Exit` events, or modify Extended Page Tables to remap a guest VM's memory pages to malicious physical frames. Software-level access controls and standard hardware page tables offer zero protection when the hypervisor itself is compromised. To solve this fundamental security bottleneck and enable secure cloud computing on untrusted infrastructure, microprocessor architects developed **Datacenter Confidential Virtualization**—also known as **Confidential Computing**. Powered by hardware architectures such as **AMD SEV-SNP (Secure Encrypted Virtualization - Secure Nested Paging)**, **Intel TDX (Trust Domain Extensions)**, and **ARM CCA (Confidential Compute Architecture)**, Confidential Virtualization executes complete, unmodified guest Virtual Machines inside hardware-isolated domain containers called **Confidential Virtual Machines (CVMs)** or **Trust Domains (TDs)**. The CPU hardware enforces **Hardware Guest Memory Encryption** by assigning unique, per-VM ephemeral encryption keys to the memory controller, cryptographically encrypts guest CPU registers during `VM-Exit` events, and maintains hardware-enforced memory integrity tables (such as the Reverse Map Table) directly in silicon. Even if a hypervisor running with full Ring -1 root privileges attempts to inspect guest memory, manipulate page tables, or inject register states, the CPU's memory hardware blocks the access and returns scrambled ciphertext, establishing a hardware-enforced cloud computing environment where guest VMs remain completely private from the host hypervisor.

```text
DATACENTER CONFIDENTIAL VIRTUALIZATION ARCHITECTURE

 Untrusted Host Hypervisor (VMM / Ring -1)    Confidential Virtual Machine (CVM / TD)
 ┌──────────────────────────────────────┐   ┌───────────────────────────────┐
 │ Hypervisor Kernel & Extended Page    │   │ Guest OS Kernel & User Apps   │
 │ Tables (EPT / NPT - Untrusted!)      │   │ Encrypted RAM & CPU Registers │
 └──────────────────┬───────────────────┘   └───────────────┬───────────────┘
                    │                                       │
                    ▼ Memory Read / Page Remap Attempt      ▼ Guest Memory Access
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ CPU SILICON HARDWARE & CONFIDENTIAL COMPUTING CONTROLLERS                │
 │  1. Per-VM Memory Encryption Engine (Key Table: K_VM0, K_VM1... K_VMN)   │
 │  2. Hardware Page Integrity Check (AMD RMP / Intel TDX / ARM GPC)        │
 │  3. Encrypted Register Save Area (VMSA / TDX State Area)                 │
 └──────────────────┬───────────────────────────────────────┬───────────────┘
                    │                                       │
                    ▼ Check FAILS (Hypervisor Read)         ▼ Check PASSED
 ┌──────────────────────────────────────┐   ┌───────────────────────────────┐
 │ HARDWARE ACCESS BLOCKED!             │   │ AES-XTS Hardware Engine       │
 │ Returns Ciphertext / Triggers Fault! │   │ Decrypts Guest Page with K_VM!│
 └──────────────────────────────────────┘   └───────────────────────────────┘
```

---

## The Hotel Owner with Master Keys and the Soundproof VIP Suite

To build an intuitive, crystal-clear mental model of how Datacenter Confidential Virtualization isolates an entire guest Virtual Machine from an untrusted host hypervisor, let us consider an everyday analogy: a guest renting a luxury suite in a hotel managed by a suspicious hotel owner.

Imagine a large, multi-story hotel (a Physical Cloud Server). The hotel is managed by a Hotel Manager (the Host Hypervisor / VMM). The Hotel Manager holds the master keys to the building (Ring -1 privileges). Under standard hotel rules, the Hotel Manager oversees all rooms, assigns room keys, and maintains the building's hallway ventilation and plumbing.

A business guest (a Cloud Tenant) arrives at the hotel and rents a full luxury suite (**A Guest Virtual Machine**). The guest brings private financial ledgers, corporate secret documents, and computers into their suite (Guest Operating System, Applications, and Memory).

Under traditional hotel operation (Traditional Non-Encrypted Virtualization):
* The Hotel Manager holds master keys that can unlock any suite door at any time.
* When the guest leaves the room for dinner (**A `VM-Exit` Event**), the Hotel Manager can unlock the door, walk inside, inspect the guest's private suitcases (**Reading Guest DRAM Pages**), look at the papers left sitting on the desk (**Inspecting Guest CPU Registers**), or swap the furniture in the room (**Remapping Page Tables**).
* The guest has zero privacy from the Hotel Manager!

```text
TRADITIONAL HOTEL VIRTUALIZATION HAZARD

 Guest's Rented Suite (Guest VM)              Hotel Manager (Host Hypervisor)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Guest's Private Suitcases │                │ Master Keys (Ring -1)     │
 │ (Guest Memory Pages)      │                │ Full Access to All Rooms! │
 └─────────────┬─────────────┘                └─────────────┬─────────────┘
               │                                            │
               ▼                                            ▼
 Hotel Manager unlocks door at night ──► Inspects Guest's Suitcases!
 (Guest has ZERO privacy from the Hotel Manager!)
```

Now, watch how **Datacenter Confidential Virtualization** transforms the hotel into a secure, hardware-protected facility:

The building owner installs three un-bypassable hardware security systems directly into the hotel's physical structure:

1. **The Automated Encrypted Suitcase Conveyor (Hardware Guest Memory Encryption)**:
   Whenever the guest sends a suitcase out of the suite into general hotel storage (**Evicting a cache line from L3 cache to DRAM**), an automated internal vault box at the room's doorway encrypts the suitcase using a unique, secret lock combination (**Per-VM Hardware Key $K_{\text{VM}}$**).
   * The combination is generated by a hardware key vault inside the suite's wall when the guest checks in (**Hardware Boot Key Generation**). The Hotel Manager is never given the combination!
   * If the Hotel Manager walks into the storage room and inspects the guest's suitcases, **all they see is locked, scrambled steel boxes ($100\%$ Ciphertext)**!
2. **The Automated Steel Window Shutters (Encrypted Register State / VMSA)**:
   Whenever the guest steps out of the suite or takes a break (**A `VM-Exit` Event**), automated steel shutters snap shut over the room's windows and desk (**Cryptographic Register State Encryption**).
   * The guest's papers and desk state are encrypted before the Hotel Manager can catch a single glimpse!
3. **The Un-Alterable Room Layout Wall Plaque (The Reverse Map Table / RMP)**:
   The building owner welds a permanent metal wall plaque outside the suite door (**The Reverse Map Table / RMP**). The plaque records:
   $$\text{Permanent Wall Plaque} = \left[\quad \text{Room \#10 belongs EXCLUSIVELY to Guest 1} \quad \mid \quad \text{Assigned Floor Position: Suite 10} \quad \right]$$
   * If the Hotel Manager attempts to trick the system by swapping Room #10's furniture into Room #20 (**Page Remapping / Aliasing Attack**), the hardware scanner reads the metal plaque, detects the mismatch, and **deadbolts the doors instantly**!

```text
THE CONFIDENTIAL HOTEL SECURITY SYSTEMS

 Guest's Rented Suite (Confidential VM)       Hotel Manager (Untrusted VMM)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ 1. Encrypted Suitcases    ├─ Conveyor ────►│ Sees ONLY Scrambled Steel │
 │    (Per-VM Memory Key)    │                │ Boxes in Storage Room!    │
 ├───────────────────────────┤                ├───────────────────────────┤
 │ 2. Steel Window Shutters  ├─ VM-Exit ─────►│ Window Shutters Snap Shut!│
 │    (Encrypted Register VMSA)                │ Cannot see Desk Papers!   │
 ├───────────────────────────┤                ├───────────────────────────┤
 │ 3. Metal Wall Plaque (RMP)├─ Page Remap ──►│ Detects Layout Mismatch!  │
 │    (Page Integrity Check) │                │ DEADBOLTS DOORS INSTANTLY!│
 └───────────────────────────┘                └───────────────────────────┘
```

Look at what this hardware architecture achieved:
* The guest can run a full, complex operating system inside their rented suite.
* The Hotel Manager retains control of the building's hallways, heating, and power.
* But the physical automated security systems guarantee that the Hotel Manager **can never read the guest's suitcases, inspect the guest's desk papers, or tamper with the room's layout!**

This confidential hotel scenario is the exact physical analogue of **Datacenter Confidential Virtualization**:
* The hotel is the **Physical Cloud Server Hardware**.
* The rented suite is a **Confidential Virtual Machine (CVM) / Trust Domain (TD)**.
* The Hotel Manager is the **Untrusted Host Hypervisor (VMM / Ring -1)**.
* The guest's suitcases are **Guest DRAM Memory Pages**.
* The automated encrypted conveyor is the **Per-VM Inline Memory Encryption Engine**.
* The steel window shutters are **Encrypted Register State Saving (`VMSA` / TDX State Area)**.
* The metal wall plaque is the **Reverse Map Table (RMP) / Granule Protection Table (GPT)**.

---

## Per-VM Hardware Memory Encryption Architecture

To isolate multiple guest Virtual Machines from both the host hypervisor and neighboring tenant VMs, modern server microprocessors integrate a multi-key **Inline Memory Encryption Engine (MEE)** directly into the CPU's integrated memory controllers.

### Multi-Key Memory Encryption Engines (MKTME / SEV Key Tables)

Instead of using a single global encryption key for the entire system, the CPU's memory controller contains an internal, hardware-isolated **Key Table Array** capable of storing hundreds of distinct $128\text{-bit}$ or $256\text{-bit}$ AES keys:

```text
MULTI-KEY HARDWARE MEMORY CONTROLLER KEY TABLE

 Memory Controller Key Table (On-Die Silicon SRAM)
 ┌──────────────┬──────────────────────────────────┬────────────────────────────┐
 │ Key ID (ASID)│ Cryptographic AES Key            │ Owner Domain               │
 ├──────────────┼──────────────────────────────────┼────────────────────────────┤
 │ KeyID 0      │ K_host (Hypervisor Master Key)   │ Host Hypervisor (Ring -1)  │
 │ KeyID 1      │ K_VM1  (Guest VM 1 Ephemeral Key)│ Confidential VM 1          │
 │ KeyID 2      │ K_VM2  (Guest VM 2 Ephemeral Key)│ Confidential VM 2          │
 │ ...          │ ...                              │ ...                        │
 │ KeyID N      │ K_VMN  (Guest VM N Ephemeral Key)│ Confidential VM N          │
 └──────────────┴──────────────────────────────────┴────────────────────────────┘
```

#### How Per-VM Ephemeral Keys Are Generated:
1. When a new Confidential VM is launched, a hardware-isolated security processor embedded on the CPU die (such as the **AMD Platform Security Processor / PSP** or the **Intel TDX Module**) generates a fresh, cryptographically random 128-bit or 256-bit AES key ($K_{\text{VM\_i}}$) using an on-die True Random Number Generator (TRNG).
2. The key $K_{\text{VM\_i}}$ is loaded directly into slot $i$ of the memory controller's internal key table.
3. Key $K_{\text{VM\_i}}$ is **never exposed to the host hypervisor, never written to DRAM, and never readable by software**.
4. When the Confidential VM is terminated, key $K_{\text{VM\_i}}$ is overwritten with zeros, rendering all physical memory pages previously used by that VM permanently un-decryptable!

---

### Address Space Identifiers (ASID / KeyID) and Page Table Tagging

How does the hardware memory controller know *which* key from its key table to use when a memory read or write instruction executes?

The CPU binds physical memory pages to encryption keys using **Address Space Identifiers (ASID)** or **Key IDs (KeyID)**.

In x86-64 hardware virtualization, every active Virtual Machine is assigned a unique hardware Address Space Identifier ($\text{ASID} \in [1, N]$).

```text
EXTENDED PAGE TABLE (EPT/NPT) KEY ID BINDING

 64-Bit Physical Address / Page Table Entry
 Bit 63  Bit 51        Bit 46 Bit 45                        Bit 12 Bit 0
 ┌─────┬──────────────┬──────┬────────────────────────────────────┬───┐
 │ NX  │ Reserved     │Key ID│ Physical Frame Number (PFN)        │ P │
 └─────┴──────────────┴──────┴────────────────────────────────────┴───┘
                       ▲
                       └── Bits [51:46] Select Key ID in Memory Controller!
```

#### The Memory Encryption Datapath:
1. When a CPU core executing Guest VM 1 issues a memory store instruction (`STORE [GPA]`):
   * The hardware Second-Level Address Translation (SLAT / EPT / NPT) translates the Guest Physical Address ($\text{GPA}$) to a Host Physical Address ($\text{PA}$).
   * The CPU tags the outgoing L3 cache eviction line with **KeyID = 1** (derived from Guest VM 1's active hardware ASID).
2. When the cache line passes from L3 cache to the memory controller:
   * The Inline Memory Encryption Engine reads **KeyID = 1** from the bus request.
   * The MEE retrieves **Key $K_{\text{VM1}}$** from its internal hardware key table.
   * The MEE encrypts the 64-byte line using **AES-XTS** with key $K_{\text{VM1}}$ and writes the ciphertext to physical DRAM.
3. **Hypervisor Read Attempt**:
   * If the host hypervisor (running under KeyID = 0) attempts to read the same physical DRAM page, the MEE decrypts the line using **Key $K_0$** (the hypervisor's key).
   * Because $K_0 \neq K_{\text{VM1}}$, the MEE output evaluates to **$100\%$ garbled ciphertext noise**!

$$\mathbf{\text{MEE Decryption Result: } \quad \text{AES-XTS}_{K_0}\left( \text{AES-XTS}_{K_{\text{VM1}}}(P) \right) \equiv \text{Random Noise}}$$

---

## Hardware Virtualization Protection Architectures: AMD SEV-SNP, Intel TDX, and ARM CCA

While per-VM memory encryption prevents a hypervisor from reading guest memory directly, an untrusted hypervisor still controls physical memory allocation and page tables. 

To prevent a hypervisor from executing memory remapping, page swapping, or state injection attacks, CPU vendors created three major datacenter confidential virtualization architectures:

---

### 1. AMD SEV-SNP (Secure Encrypted Virtualization - Secure Nested Paging)

AMD SEV-SNP builds upon first-generation SEV and SEV-ES (Encrypted State) by introducing hardware-enforced **memory integrity protection** through a physical hardware table called the **Reverse Map Table (RMP)**.

```text
AMD SEV-SNP REVERSE MAP TABLE (RMP) HARDWARE CHECK

 Physical DRAM Page PA (e.g., 0x0000_0001_8000_0000)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ REVERSE MAP TABLE (RMP) HARDWARE ENTRY                      │
 │  * Assigned ASID           : ASID = 1 (Guest VM 1)          │
 │  * Guest Physical Address  : GPA = 0x4000_0000              │
 │  * Validated Bit           : V = 1                          │
 │  * Page Page Size          : 4 KB                           │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Hardware Validation Check
 Does Memory Access ASID match RMP Entry ASID (ASID 1 == ASID 1)?
 Does Translated GPA match RMP Entry GPA (0x4000_0000 == 0x4000_0000)?
               │
     ┌─────────┴─────────┐
     │ YES               │ NO (Hypervisor Remap Attempt!)
     ▼                   ▼
  ACCESS GRANTED!        HARDWARE RMP FAULT! (Access Blocked!)
```

#### How the Reverse Map Table (RMP) Defeats Hypervisor Attacks:
The **Reverse Map Table (RMP)** is a hardware-enforced structure stored in PRM memory that maintains a single, authoritative ownership record for **every physical $4\text{-KB}$ page in system DRAM**.

Every RMP entry stores four hardware security attributes:
1. **Assigned ASID**: The unique ID of the Guest VM that owns the physical page.
2. **Guest Physical Address ($\text{GPA}$)**: The exact virtualized physical address where the guest VM expects this page to appear.
3. **Page State / Validated Bit ($V$)**: Tracks whether the page has been cryptographically validated by the guest OS.
4. **Page Size**: $4\text{ KB}$ or $2\text{ MB}$.

#### How RMP Stops Page Remapping Attacks:
Suppose a malicious hypervisor attempts a **Page Aliasing Attack** by altering its Nested Page Tables (NPT) to map two different Guest Physical Addresses ($\text{GPA}_A$ and $\text{GPA}_B$) to the same physical page $\text{PA}_1$:

1. When Guest VM 1 executes a memory load at $\text{GPA}_B$, the NPT translates $\text{GPA}_B \to \text{PA}_1$.
2. Before allowing the access, the CPU hardware queries the **Reverse Map Table (RMP)** for physical page $\text{PA}_1$.
3. The RMP entry for $\text{PA}_1$ records: $\text{Assigned GPA} = \text{GPA}_A$.
4. The CPU hardware compares:
   $$\text{Translated GPA } (\text{GPA}_B) \ \stackrel{?}{=} \ \text{RMP Assigned GPA } (\text{GPA}_A)$$
5. **RMP CHECK FAILS!** ($\text{GPA}_B \neq \text{GPA}_A$).
6. The CPU hardware triggers a **Nested Page Fault (#NPF) Exception**, halting execution and blocking the hypervisor's remapping attack!

---

### 2. Intel TDX (Trust Domain Extensions)

Intel Trust Domain Extensions (TDX) isolates guest virtual machines into secure hardware execution domains called **Trust Domains (TDs)**.

```text
INTEL TDX HARDWARE ARCHITECTURAL TOPOLOGY

 Host Hypervisor (Untrusted VMM)               Secure Trust Domain (TD Guest)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Manages CPU Scheduling &  │                │ Trust Domain Guest OS     │
 │ Host Shared Memory        │                │ Encrypted TD Private RAM  │
 └─────────────┬─────────────┘                └─────────────▲─────────────┘
               │                                            │
               ▼ Shared API Calls                           │
 ┌──────────────────────────────────────────────────────────┴────────────┐
 │ INTEL TDX MODULE (Hardware-Isolated Authenticated Firmware)           │
 │  * Executed in a specialized SE-protected CPU Execution Mode          │
 │  * Manages Secure Extended Page Tables (Secure EPT)                   │
 │  * Controls TD Creation, Key Management, and State Transitions        │
 └───────────────────────────────────────────────────────────────────────┘
```

#### Key Architecture Components of Intel TDX:
1. **The Intel TDX Module**: An authenticated, hardware-isolated software firmware layer (signed by Intel) that executes in a specialized CPU security mode. The TDX Module acts as a trusted, hardware-enforced gatekeeper between the untrusted host hypervisor and the secure Trust Domains.
2. **Secure EPT (Secure Extended Page Tables)**: The untrusted host hypervisor is **forbidden** from writing directly to a Trust Domain's EPT page tables. Instead, the hypervisor requests page mappings through the TDX Module, which validates and manages the **Secure EPT** inside protected hardware memory.
3. **KeyID Physical Address Encoding**: Intel TDX encodes the memory encryption KeyID directly into high-order physical address bits ($A_{\text{phys}}[\text{KeyID\_bits}]$). Physical memory lines marked with a TD's KeyID are automatically encrypted by the memory controller using the TD's private ephemeral key.

---

### 3. ARM CCA (Confidential Compute Architecture)

ARM Confidential Compute Architecture (CCA) introduces a major hardware extension to ARMv9-A processors known as the **Realm Management Extension (RME)**.

ARM CCA expands the traditional two-world architecture (Normal vs. Secure) into **Four Physical Security States**:

```text
ARM CCA FOUR-STATE PHYSICAL SECURITY MODEL

 ┌───────────────────────────────────────────────────────────────────────┐
 │ 1. NORMAL STATE (NS = 00_2)  │ 2. SECURE STATE (NS = 01_2)            │
 │  * Un-encrypted Host Linux   │  * Legacy ARM TrustZone Secure OS      │
 ├──────────────────────────────┼────────────────────────────────────────┤
 │ 3. REALM STATE (NS = 10_2)   │ 4. ROOT STATE (NS = 11_2)              │
 │  * Confidential VMs (Realms) │  * Monitor Firmware (EL3)              │
 │  * Isolated from Host & Sec! │  * Manages Granule Protection Tables   │
 └──────────────────────────────┴────────────────────────────────────────┘
```

#### Key Architecture Components of ARM CCA:
1. **Realms**: Isolated guest Virtual Machines running in the **Realm Security State ($NS = 10_2$)**. Realms are completely isolated from both the Normal World (Host Hypervisor) AND the traditional Secure World (TrustZone)!
2. **Granule Protection Checks (GPC)**: A hardware memory filtering unit embedded in the CPU memory pipeline driven by the **Granule Protection Table (GPT)**. 
   
   The GPC hardware checks every memory access page-by-page (at $4\text{-KB}$ granule granularity) to ensure that Normal World accesses ($NS = 00_2$) can **never read or write Realm Memory ($NS = 10_2$)**.

---

## Register Context Protection and State Saving (`VMSA` Encryption)

A major attack vector against virtual machines is inspecting CPU register states during context switches.

When a guest Virtual Machine executes an instruction that requires hypervisor intervention (e.g., accessing an I/O device or executing `CPUID`), the CPU hardware performs a **`VM-Exit`**, transferring control from the guest VM (Ring 0 / EL1) to the host hypervisor (Ring -1 / EL2).

In traditional virtualization:
* During a `VM-Exit`, the CPU hardware writes all guest general-purpose registers (`RAX`, `RBX`, `RCX`, `RSP`, `RIP`, `CR3`) into a plaintext memory structure called the **Virtual Machine Control Structure (VMCS)** or **Virtual Machine Control Block (VMCB)**.
* The host hypervisor reads the register values directly from memory, handles the request, and modifies the registers before resuming the VM (`VM-Entry`).

```text
TRADITIONAL VM-EXIT REGISTER LEAKAGE

 Guest VM (Executes I/O Instruction) ──► VM-Exit Triggered!
                                              │
                                              ▼
 CPU Hardware writes Guest Registers (RAX, RIP, CR3) in PLAINTEXT to VMCB Memory!
                                              │
                                              ▼
 Host Hypervisor (Ring -1) reads VMCB Memory ──► SEES ALL GUEST REGISTERS!
 (Hypervisor inspects secret encryption keys sitting in guest RAX/RBX registers!)
```

---

### Encrypted Register State Saving (AMD SEV-ES / SEV-SNP & Intel TDX)

To prevent hypervisors from inspecting or tampering with guest CPU registers during `VM-Exit` events, modern confidential virtualization architectures implement **Encrypted Register State Saving**:

* **AMD SEV-ES / SEV-SNP (`VMSA` Encryption)**:
  1. When a `VM-Exit` occurs, the CPU hardware saves all guest registers into a specialized memory page called the **Virtual Machine Save Area (`VMSA`)**.
  2. The CPU's memory encryption engine **automatically encrypts the `VMSA` page using the guest VM's private key $K_{\text{VM}}$** before writing it to memory!
  3. The CPU hardware calculates a cryptographic MAC integrity tag over the `VMSA` contents.
  4. The CPU hardware **zeroes out all general-purpose registers** before handing control to the host hypervisor!

```text
ENCRYPTED REGISTER STATE SAVING (VMSA ENCRYPTION)

 Guest VM (Executes I/O Instruction) ──► VM-Exit Triggered!
                                              │
                                              ▼
 CPU Hardware Encrypts Guest Registers into VMSA Page using Key K_VM!
 CPU Hardware ZEROES OUT all physical registers (RAX=0, RBX=0, RIP=0)!
                                              │
                                              ▼
 Host Hypervisor receives control ──► Sees ONLY ZEROED REGISTERS!
 VMSA Page in RAM is 100% AES-XTS Ciphertext!
 (Hypervisor CANNOT read or tamper with guest registers!)
```

#### What the Hypervisor Sees During a Confidential `VM-Exit`:
* All general-purpose registers (`RAX` through `R15`) contain **`0x0000_0000_0000_0000`**.
* The `VMSA` page sitting in RAM contains **$100\%$ AES-XTS ciphertext**.
* If the hypervisor attempts to tamper with the encrypted `VMSA` page, the cryptographic MAC check fails during the subsequent `VM-Entry`, and the CPU **aborts the VM immediately**, preventing register state injection!

---

## Cryptographic Remote Attestation in Confidential Virtualization

How does a cloud tenant know that their confidential VM is *actually* running inside genuine, hardware-encrypted AMD SEV-SNP, Intel TDX, or ARM CCA silicon, and not running inside a fake software emulator operated by a rogue cloud provider?

Cloud tenants verify hardware authenticity using **Cryptographic Remote Attestation**.

```text
REMOTE ATTESTATION HARDWARE PROTOCOL

 Cloud Tenant (Remote Client)                    Confidential VM / Hardware PSP
 ┌───────────────────────────┐                   ┌───────────────────────────┐
 │ 1. Sends Attestation      ├───── Challenge ──►│ 2. PSP Measures CVM Memory│
 │    Challenge (Nonce)      │                   │    Computes Launch Digest │
 └───────────────────────────┘                   └─────────────┬─────────────┘
                                                               │
 ┌───────────────────────────┐                                 ▼
 │ 4. Verifies Signature using│                   ┌───────────────────────────┐
 │    Manufacturer Public Key├◄── Attestation ───┤ 3. PSP Signs Report using │
 │    (Validates Genuine CVM!)│      Report      │    Factory Silicon Key!   │
 └───────────────────────────┘                   └───────────────────────────┘
```

### The 4-Step Remote Attestation Sequence:

1. **Launch Measurement**: As the Confidential VM is loaded into memory, the hardware security processor (AMD PSP or Intel TDX Module) computes a SHA-256 or SHA-384 cryptographic digest over the initial guest memory pages, kernel image, and initial configuration:
   $$\mathbf{\text{Launch\_Digest} = \text{SHA-384}(\text{Guest\_Kernel} \ \mid \ \text{Initial\_RAM\_Pages} \ \mid \ \text{Config})}$$
2. **Attestation Challenge**: The remote cloud tenant sends a cryptographic challenge string (a random `Nonce`) to the Confidential VM.
3. **Hardware Report Signing**: The hardware security processor generates an **Attestation Report** containing:
   * The `Launch_Digest` (proving exact guest code identity).
   * The tenant's `Nonce` (preventing replay attacks).
   * Hardware security patch levels (`TCB_VERSION`).
   * The report is **digitally signed using a factory-burned private key** (Chip Endorsement Key) embedded inside the CPU silicon during manufacturing.
4. **Tenant Verification**: The remote tenant verifies the digital signature using the CPU manufacturer's public certificate chain (AMD / Intel / ARM Root CA).
   * If the signature is valid, the tenant knows with $100\%$ mathematical certainty that their VM is running on **genuine, untampered confidential hardware**!
   * The tenant can now safely transmit secret database passwords and master encryption keys to the Confidential VM over an encrypted TLS connection!

---

## Solved Industrial Engineering Exercise: Quantitative SEV-SNP RMP Validation, Memory Encryption Latency, and Attestation Hash Analysis

To consolidate your complete mastery of Datacenter Confidential Virtualization, per-VM memory encryption engines, AMD SEV-SNP Reverse Map Table (RMP) checks, and remote attestation digests, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal cloud security architect auditing an AMD EPYC server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$, $f_{\text{clk}} = 3.2\text{ GHz}$) running AMD SEV-SNP confidential virtualization.

The server hosts a Confidential Virtual Machine (`CVM_1`) assigned hardware $\text{ASID} = 1$.

```text
3.2 GHz AMD EPYC SERVER WITH SEV-SNP CONFIDENTIAL VIRTUALIZATION

 CVM_1 (ASID = 1, Key K_VM1) ──► L3 Cache ──► MEE Engine (AES-XTS) ──► DDR5 DRAM
 Clock T = 312.5 ps               Hit = 36c    MEE = 38 Cycles         DRAM = 180c
                                               RMP Check = 4 Cycles    RMP Entry: 16B
```

#### Microarchitectural Memory Parameters:
* **L1 Data Cache Hit Latency**: $T_{\text{L1D\_hit}} = 4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* **L3 Shared Cache Hit Latency**: $T_{\text{L3\_hit}} = 36\text{ CPU Clock Cycles}$ ($11.25\text{ ns}$).
* **Physical DRAM Memory Access Latency**: $T_{\text{DRAM\_fetch}} = 180\text{ CPU Clock Cycles}$ ($56.25\text{ ns}$).
* **Per-VM MEE AES-XTS Decryption Pipeline Latency**: $T_{\text{MEE}} = 38\text{ CPU Clock Cycles}$ ($11.875\text{ ns}$).
* **Reverse Map Table (RMP) Hardware Check Latency**: $T_{\text{RMP}} = 4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* **RMP Entry Size**: $16\text{ bytes}$ per $4\text{-KB}$ physical DRAM page.

`CVM_1` accesses a private Guest Physical Address $\text{GPA} = \text{0x0000\_0000\_4000\_0000}$ mapped to Host Physical Address $\text{PA} = \mathbf{\text{0x0000\_0001\_8000\_0000}}$.

The RMP entry for physical page `0x0000_0001_8000_0000` stores:
* `Assigned ASID` $= 1$
* `Assigned GPA` $= \text{0x0000\_0000\_4000\_0000}$
* `Validated Bit V` $= 1$

#### Your Objective

1. Calculate the total physical memory overhead (in Megabytes) required to store the Reverse Map Table (RMP) for a server equipped with $512\text{ Gigabytes}$ of physical DRAM RAM.
2. Trace the hardware RMP validation check when `CVM_1` ($\text{ASID} = 1$) executes a memory read at $\text{GPA} = \text{0x0000\_0000\_4000\_0000}$ translating to $\text{PA} = \text{0x0000\_0001\_8000\_0000}$.
   * Calculate total memory read latency (in clock cycles and nanoseconds) for an L3 cache hit versus an L3 cache miss with MEE decryption.
3. Trace an attack scenario where a malicious hypervisor ($\text{ASID} = 0$) attempts a Page Aliasing Attack, modifying Nested Page Tables to map $\text{GPA}_{\text{fake}} = \text{0x0000\_0000\_9000\_0000}$ to $\text{PA} = \text{0x0000\_0001\_8000\_0000}$.
   * Evaluate the RMP check and prove mathematically why the hypervisor's attack is blocked in hardware.
4. Calculate the percentage memory access latency overhead added by the inline MEE engine and RMP check during an L3 cache miss.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Reverse Map Table (RMP) RAM Overhead

The server possesses $512\text{ GB}$ of physical DRAM ($512 \times 1,073,741,824\text{ bytes} = 549,755,813,888\text{ bytes}$).

Memory is managed in $4\text{-KB}$ physical pages ($4,096\text{ bytes}$).

##### 1. Calculate Total Physical $4\text{-KB}$ Pages ($N_{\text{pages}}$):

$$N_{\text{pages}} = \frac{549,755,813,888 \text{ Bytes}}{4,096 \text{ Bytes/Page}} = \mathbf{134,217,728 \text{ Physical Pages}}$$

##### 2. Calculate RMP Storage Size ($S_{\text{RMP}}$):
Each physical page requires a $16\text{-byte}$ RMP entry ($S_{\text{entry}} = 16\text{ bytes}$):

$$S_{\text{RMP}} = 134,217,728 \text{ Pages} \times 16 \text{ Bytes/Entry} = 2,147,483,648 \text{ Bytes}$$

Convert to Gigabytes (GB):

$$S_{\text{RMP\_GB}} = \frac{2,147,483,648 \text{ Bytes}}{1,073,741,824 \text{ Bytes/GB}} = \mathbf{2.000 \text{ Gigabytes}}$$

##### 3. Calculate Percentage Memory Overhead for RMP:

$$\text{RMP RAM Overhead \%} = \frac{2.0 \text{ GB}}{512.0 \text{ GB}} \times 100\% = \mathbf{0.390625\% \text{ RAM Overhead}}$$

##### Architectural Result:
The Reverse Map Table requires **$2.000\text{ GB}$ of physical RAM** to protect a $512\text{-GB}$ server, representing an ultra-low memory overhead of **$0.391\%$**!

---

#### Step 2: Trace Legitimate CVM Memory Read Access

`CVM_1` ($\text{ASID} = 1$) issues a memory read at $\text{GPA} = \text{0x0000\_0000\_4000\_0000}$.

##### 1. Second-Level Address Translation (SLAT / NPT):
NPT translates $\text{GPA} = \text{0x0000\_0000\_4000\_0000} \longrightarrow \text{PA} = \text{0x0000\_0001\_8000\_0000}$.

##### 2. Hardware RMP Validation Check:
The CPU hardware queries the RMP entry for $\text{PA} = \text{0x0000\_0001\_8000\_0000}$:
* $\text{Current ASID} == \text{RMP.Assigned\_ASID}$ ($1 == 1 \implies \mathbf{\text{PASS}}$)
* $\text{Translated GPA} == \text{RMP.Assigned\_GPA}$ (`0x4000_0000 == 0x4000_0000` $\implies \mathbf{\text{PASS}}$)
* $\text{RMP.Validated\_Bit} == 1$ ($\mathbf{\text{PASS}}$)

$$\mathbf{\text{RMP Validation Check: 100% PASSED (Access Granted!)}}$$

##### 3. Calculate Memory Read Latencies:
* **L3 Cache Hit Case**:
  $$T_{\text{read\_L3}} = T_{\text{L3\_hit}} + T_{\text{RMP}} = 36 + 4 = \mathbf{40 \text{ CPU Clock Cycles}} \quad (12.50\text{ ns})$$
* **DRAM Cache Miss Case**:
  When the read misses L3 cache, it requires a DRAM fetch ($T_{\text{DRAM\_fetch}} = 180\text{ cycles}$), MEE decryption with key $K_{\text{VM1}}$ ($T_{\text{MEE}} = 38\text{ cycles}$), and RMP check ($T_{\text{RMP}} = 4\text{ cycles}$):
  $$T_{\text{read\_DRAM}} = T_{\text{L3\_hit}} + T_{\text{DRAM\_fetch}} + T_{\text{MEE}} + T_{\text{RMP}} = 36 + 180 + 38 + 4 = \mathbf{258 \text{ CPU Clock Cycles}}$$

In physical nanoseconds ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{read\_DRAM\_ns}} = 258 \times 0.3125 \text{ ns} = \mathbf{80.625 \text{ Nanoseconds}}$$

---

#### Step 3: Trace Hypervisor Page Aliasing Attack (Scenario B)

A malicious hypervisor modifies NPT page tables to map $\text{GPA}_{\text{fake}} = \text{0x0000\_0000\_9000\_0000}$ to physical page $\text{PA} = \text{0x0000\_0001\_8000\_0000}$.

`CVM_1` executes a load targeting $\text{GPA}_{\text{fake}} = \text{0x0000\_0000\_9000\_0000}$:

1. NPT translates $\text{GPA}_{\text{fake}} \longrightarrow \text{PA} = \text{0x0000\_0001\_8000\_0000}$.
2. The CPU hardware queries the RMP entry for $\text{PA} = \text{0x0000\_0001\_8000\_0000}$:
   * $\text{Current ASID} == \text{RMP.Assigned\_ASID}$ ($1 == 1 \implies \text{PASS}$)
   * $\text{Translated GPA} \stackrel{?}{=} \text{RMP.Assigned\_GPA}$
   * Compare: $\text{GPA}_{\text{fake}} (\text{0x9000\_0000}) \ \stackrel{?}{=} \ \text{RMP.GPA} (\text{0x4000\_0000})$

$$\mathbf{\text{GPA MISMATCH DETECTED! } (\text{0x9000\_0000} \neq \text{0x4000\_0000})}$$

$$\mathbf{\text{RMP Validation Check: FAILED! (Nested Page Fault #NPF Generated!) }}$$

```text
HYPERVISOR PAGE ALIASING ATTACK BLOCKED

 NPT Translation: GPA_fake (0x9000_0000) -> Physical Page PA_1 (0x8000_0000)
                               │
                               ▼
 RMP Hardware Query for PA_1: RMP.GPA = 0x4000_0000
 RMP Check: Translated GPA (0x9000_0000) != RMP.GPA (0x4000_0000)!
 RMP FAULT FIRED! ──► Hardware Blocks Access!
                   ──► Triggers #NPF Exception!
 (Hypervisor's remapping attack is 100% neutralized in silicon!)
```

##### Security Result:
The CPU hardware detects the GPA mismatch, **blocks the memory access instantly**, and raises a Nested Page Fault (`#NPF`) exception! The hypervisor's page aliasing attack is $100\%$ defeated in silicon!

---

#### Step 4: Calculate Percentage Memory Access Overhead

We compare the encrypted, RMP-validated DRAM read latency ($258\text{ cycles}$) against un-encrypted, un-validated DRAM reads ($216\text{ cycles}$):

$$\text{Overhead Cycles} = T_{\text{MEE}} + T_{\text{RMP}} = 38 + 4 = \mathbf{42 \text{ CPU Clock Cycles}} \quad (13.125\text{ ns})$$

$$\text{Latency Overhead \%} = \frac{42}{216} \times 100\% \approx \mathbf{19.44\% \text{ Latency Increase on L3 Misses}}$$

```text
CONFIDENTIAL VIRTUALIZATION PERFORMANCE SUMMARY

 Memory Read Location      │ Base Latency      │ SEV-SNP Overhead │ Total Latency
───────────────────────────┼───────────────────┼──────────────────┼────────────────
 L3 Cache Hit              │ 36 Cycles (11.25ns)│ 4 Cycles (RMP)   │ 40 Cycles (12.50ns)
 DRAM Read (SEV-SNP Active)│ 216 Cycles(67.50ns)│ 42 Cycles(13.13ns)│ 258 Cycles(80.63ns)
 (SEV-SNP adds only 13.125 nanoseconds of total protection overhead on DRAM misses!)
```

##### Engineering Conclusion:
AMD SEV-SNP adds **$13.125\text{ nanoseconds}$ ($42\text{ clock cycles}$)** to DRAM cache misses ($19.44\%$ increase in DRAM fetch delay), delivering **$100\%$ hardware guest memory encryption and page table integrity protection** against untrusted Ring -1 hypervisors with less than **$2.5\%$ overall CPU execution benchmark overhead**!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against system principles:

1. **RMP RAM Overhead Math Check**:
   * $512\text{ GB} = 134,217,728\text{ pages}$.
   * $134,217,728 \times 16\text{ bytes} = 2,147,483,648\text{ bytes} = 2.0\text{ GB}$.
   * $2.0 / 512 = 0.00390625 = 0.390625\%$. Math verified with $100\%$ precision!
2. **RMP Hardware Check Invariant**:
   * $\text{GPA}_{\text{fake}} = \text{0x9000\_0000} \neq \text{RMP.GPA} = \text{0x4000\_0000}$.
   * Mismatch triggers `#NPF` exception, blocking hardware memory access $100\%$.
3. **SEV-SNP Memory Latency Math Check**:
   * $T_{\text{read\_DRAM}} = 36 + 180 + 38 + 4 = 258\text{ cycles}$.
   * Physical time $= 258 \times 0.3125\text{ ns} = 80.625\text{ ns}$.
   * Overhead $= 42 / 216 = 19.44\%$. Math verified!

All Reverse Map Table (RMP) entry formats, per-VM memory encryption key bindings, RMP hardware aliasing checks, and $80.625\text{-ns}$ memory read latency derivations evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Confidential Computing (Intel TDX / AMD SEV-SNP / ARM CCA)**: A hardware-enforced datacenter virtualization architecture that isolates complete guest Virtual Machines (Confidential VMs / Trust Domains / Realms) from untrusted host hypervisors ($PL=-1$) using per-VM hardware memory encryption keys and silicon-level memory integrity verification.
* **Hardware guest memory encryption**: The microarchitectural memory protection framework where on-die memory controllers assign unique, hardware-isolated ephemeral AES-XTS keys ($K_{\text{VM\_i}}$) to individual guest virtual machines based on hardware ASIDs or KeyIDs, automatically encrypting guest DRAM pages and CPU register state save areas (`VMSA`) to prevent hypervisor memory inspection.

---

TERMINADO