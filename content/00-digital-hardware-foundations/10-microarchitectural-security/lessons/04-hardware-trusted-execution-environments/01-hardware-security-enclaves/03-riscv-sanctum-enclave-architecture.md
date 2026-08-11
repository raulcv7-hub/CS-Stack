content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/04-hardware-trusted-execution-environments/01-hardware-security-enclaves/03-riscv-sanctum-enclave-architecture.md
# RISC-V Sanctum Architecture and Hardware Cache Set Isolation Mechanics

In modern computer architectures, hardware-enforced security enclaves—such as Intel SGX—were designed to protect user-space application data from a compromised operating system kernel operating at Ring 0. Traditional hardware enclaves isolate memory by setting aside a region of physical DRAM, checking page permissions through specialized hardware tables, and encrypting memory lines as they travel between the CPU die and physical RAM chips. However, early hardware enclave designs suffered from a fatal microarchitectural flaw: **Shared Cache Set Contention**. In conventional set-associative cache hierarchies, all execution contexts—unprivileged user applications, the operating system kernel, and secure hardware enclaves—share the exact same physical Level 2 and Level 3 cache arrays. Because physical memory addresses are mapped to cache sets using fixed, deterministic address index bits, a compromised operating system kernel or co-located attacker process can execute Flush+Reload or Prime+Probe cache side-channel attacks against the shared cache sets. By filling target cache sets with its own dummy lines and measuring eviction timings, an untrusted OS kernel can track an enclave's memory access patterns step-by-step, reconstructing private RSA or AES cryptographic keys without ever reading enclave memory directly or breaking hardware memory encryption! To eliminate cache side-channel attacks at the hardware level without incurring the high latency and dynamic power overheads of complex inline memory encryption engines, computer scientists and open-source hardware architects developed **RISC-V Sanctum**. Sanctum is an open-source, provably secure Trusted Execution Environment (TEE) built on the RISC-V ISA. Sanctum resolves the root cause of cache side channels by enforcing **Hardware Cache Set Isolation (Page and Cache Coloring)**. By controlling physical DRAM page allocations and enforcing strict address-to-set index alignment in hardware, Sanctum guarantees that an enclave's physical memory pages map to a completely disjoint, non-overlapping subset of cache sets in the shared cache hierarchy. This mathematical non-interference guarantee ensures that an untrusted operating system kernel can never evict, touch, or observe an enclave's cache lines, rendering cross-domain cache side-channel attacks physically impossible in silicon.

```text
HARDWARE CACHE SET ISOLATION (SANCTUM PAGE COLORING)

 Shared L2 / L3 Cache Array (64 Cache Sets / Colors)
 ┌─────────────────────────────────────────────────────────────┐
 │ Cache Sets 0 to 31 (BLUE ZONE / COLOR 0..31)                │
 │ Assigned EXCLUSIVELY to Untrusted Operating System (Kernel)! │
 ├─────────────────────────────────────────────────────────────┤
 │ Cache Sets 32 to 63 (GOLD ZONE / COLOR 32..63)              │
 │ Assigned EXCLUSIVELY to Secure Enclave A (Sanctum Enclave)! │
 └─────────────────────────────────────────────────────────────┘
  (Kernel accesses CAN NEVER occupy or evict Gold Sets 32..63!)
  (Cross-domain Prime+Probe cache side-channels are 100% IMPOSSIBLE!)
```

---

## The Apartment Complex Mailboxes and the Color-Coded Zones

To build an intuitive, crystal-clear mental model of how RISC-V Sanctum enforces hardware cache set isolation and why page coloring eliminates cache side-channel leakage, let us consider an everyday analogy: a central mailbox wall in a large apartment complex.

Imagine a large apartment building (a physical RISC-V CPU Core) housing several tenants (Secure Enclaves) and an untrusted Apartment Manager (the Operating System Kernel).

In the lobby of the building hangs a central wall of mailboxes (The Shared Level 2 / Level 3 Cache Array). The mailbox wall consists of 64 horizontal rows (Cache Sets $0 \dots 63$). Each row contains 8 individual mailbox slots (8 Cache Ways).

```text
THE APARTMENT MAILBOX WALL ANALOGY

 Central Mailbox Wall (Shared L2/L3 Cache)
 Row 00 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 Row 01 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 ...
 Row 63 : [ Slot 0 ][ Slot 1 ][ Slot 2 ] ... [ Slot 7 ]
 (Total 64 Rows / Cache Sets, each holding 8 Mailbox Slots / Ways)
```

Under traditional hardware enclave designs (such as Intel SGX):
* Tenant A (The Secure Enclave) and the Apartment Manager (The Untrusted OS Kernel) are assigned mailboxes scattered randomly across the exact same 64 rows.
* The building rules prohibit the Manager from opening Tenant A's mailbox door to read Tenant A's letters (**Direct Memory Read Protection**).
* However, the Manager stands in the lobby and watches the mailbox wall. When Tenant A receives a letter, the letter is placed into a slot in **Row 42**. The Manager sees Row 42 vibrate!
* The Manager executes a **Prime+Probe attack**: the Manager fills all 8 slots of Row 42 with their own junk mail (**PRIME**). When Tenant A receives a letter in Row 42, one of the Manager's junk letters is pushed out onto the floor. The Manager returns, sees their junk letter on the floor, and measures the time required to pick it up (**PROBE**)!
* The Manager discovers Tenant A's private reading habits without ever opening Tenant A's mailbox!

```text
TRADITIONAL CACHE CONTENTION (SHARED ROWS)

 Row 42 (Shared Row): [ Manager ][ Tenant A ][ Manager ][ Manager ]...
 Manager fills Row 42 -> Tenant A receives mail -> Pushes Manager's mail out!
 Manager detects eviction -> Learns Tenant A's private access pattern!
```

---

### The Sanctum Solution: Color-Coded Zone Isolation

To permanently eliminate this surveillance problem, the building owner redesigns the lobby using the **Sanctum Hardware Cache Set Isolation Protocol**:

1. **Partitioning the Rows into Disjoint Color Zones**:
   The owner divides the 64 mailbox rows into two strict, non-overlapping color zones:
   * **BLUE ZONE (Rows $0 \dots 31$)**: Assigned exclusively to the Apartment Manager (The Untrusted OS Kernel).
   * **GOLD ZONE (Rows $32 \dots 63$)**: Assigned exclusively to Tenant A (The Secure Enclave).

```text
SANCTUM COLOR-CODED ZONE PARTITIONING

 Mailbox Wall Partitioning
 ┌─────────────────────────────────────────────────────────────┐
 │ Rows 00 to 31 (BLUE ZONE)  ──► OS Kernel Mail ONLY!         │
 ├─────────────────────────────────────────────────────────────┤
 │ Rows 32 to 63 (GOLD ZONE)  ──► Tenant A Enclave Mail ONLY!  │
 └─────────────────────────────────────────────────────────────┘
```

2. **The Hardware Address Color Filter (Page Coloring Engine)**:
   The building owner installs a hardware sorter at the mail slot (The Memory Management Unit / PMP Filters).
   * When a letter arrives for the Apartment Manager, the sorter **ONLY EVER places it into Blue Rows ($0 \dots 31$)**.
   * When a letter arrives for Tenant A, the sorter **ONLY EVER places it into Gold Rows ($32 \dots 63$)**.

Look at what this physical color zone isolation achieves:
* The Manager can fill Blue Rows $0 \dots 31$ with millions of junk letters. But no matter how much junk mail the Manager receives, **Manager mail can NEVER enter, touch, or vibrate Gold Rows $32 \dots 63$**!
* Tenant A receives mail in Gold Rows $32 \dots 63$.
* If the Manager stands in the lobby watching Gold Rows $32 \dots 63$, the Manager sees zero activity from their own mail!
* **Cross-domain cache set contention is rendered mathematically impossible in hardware!**

This color-coded mailbox wall is the exact physical analogue of **RISC-V Sanctum Hardware Cache Set Isolation**:
* The apartment building is the **RISC-V Physical Processor Core**.
* The Apartment Manager is the **Untrusted Operating System Kernel (S-Mode)**.
* Tenant A is the **Secure Enclave Application (U-Mode Enclave)**.
* The central mailbox wall is the **Shared Level 2 / Level 3 Cache Array**.
* The 64 rows are the **Cache Set Indices ($0 \dots 63$)**.
* The Blue and Gold Zones are **Cache Colors (Disjoint Cache Set Partitions)**.
* The hardware sorter is the **Sanctum Security Monitor ($M\text{-Mode}$) and Page Coloring Engine**.

---

## RISC-V Privileged Architecture and Physical Memory Protection (PMP)

To understand how Sanctum implements hardware cache set isolation and enclave page protection, we must examine the foundational privilege modes of the open-source **RISC-V Instruction Set Architecture (ISA)**.

### The Three RISC-V Privilege Modes

The RISC-V privileged architecture defines three distinct hardware privilege modes:

```text
RISC-V HARDWARE PRIVILEGE MODE HIERARCHY

 ┌─────────────────────────────────────────────────────────────┐
 │ Machine Mode (M-Mode / PL3)   ──► Highest Hardware Privilege│
 │ Runs Sanctum Security Monitor Firmware in SRAM              │
 ├─────────────────────────────────────────────────────────────┤
 │ Supervisor Mode (S-Mode / PL1)──► Rich Operating System     │
 │ Runs Untrusted OS Kernel (Linux)                            │
 ├─────────────────────────────────────────────────────────────┤
 │ User Mode (U-Mode / PL0)     ──► User Applications &        │
 │ Runs Normal Apps AND Sanctum Enclave Applications           │
 └─────────────────────────────────────────────────────────────┘
```

1. **Machine Mode ($M\text{-Mode}$)**: The highest privilege level in RISC-V hardware. $M\text{-Mode}$ has unrestricted access to all physical memory, hardware registers, and Control and Status Registers (CSRs). In Sanctum, $M\text{-Mode}$ runs the **Sanctum Security Monitor**—a tiny, open-source, provably secure firmware layer.
2. **Supervisor Mode ($S\text{-Mode}$)**: Operates beneath $M\text{-Mode}$. $S\text{-Mode}$ runs the operating system kernel (Linux). In the Sanctum threat model, the $S\text{-Mode}$ kernel is assumed to be **completely untrusted and potentially malicious**!
3. **User Mode ($U\text{-Mode}$)**: Operates at the lowest privilege level. $U\text{-Mode}$ executes standard user applications AND isolated Sanctum Enclave applications.

---

### Physical Memory Protection (PMP) Mechanics

How does $M\text{-Mode}$ software enforce hardware memory boundaries on $S\text{-Mode}$ and $U\text{-Mode}$ code?

The RISC-V hardware architecture incorporates a set of hardware memory filtering registers called **Physical Memory Protection (PMP)**.

```text
RISC-V PHYSICAL MEMORY PROTECTION (PMP) REGISTERS

 PMP Control Register (pmpcfg0) & Address Register (pmpaddr0)
 ┌──────────┬───────────┬──────────────┬───────────────────────────────┐
 │ Lock (L) │ Reserved  │ Address Mode │ Permissions (Read, Write, Exec│
 │ (1 Bit)  │ (2 Bits)  │ (A: 2 Bits)  │ (R, W, X: 3 Bits)             │
 └──────────┴───────────┴──────────────┴───────────────────────────────┘
```

#### How PMP Hardware Works:
* The $M\text{-Mode}$ Security Monitor configures PMP registers (`pmpaddr0` $\dots$ `pmpaddr15` and `pmpcfg0` $\dots$ `pmpcfg3`).
* PMP defines contiguous physical DRAM address regions and sets permission flags (Read `R`, Write `W`, Execute `X`) for $S\text{-Mode}$ and $U\text{-Mode}$.
* When the CPU executes in $S\text{-Mode}$ (Linux Kernel) or $U\text{-Mode}$ (User Application), **every physical memory access is checked in hardware against the PMP registers**.
* If the $S\text{-Mode}$ kernel attempts to access a physical memory region assigned to a Sanctum Enclave, the PMP hardware **blocks the access at the silicon gate** and raises an Access Fault Exception, preventing Ring 0 kernel reads!

---

## Hardware Cache Set Isolation: Page Coloring Mechanics

While PMP registers block direct physical memory reads, PMP alone cannot prevent cache side-channel attacks because PMP operates on physical DRAM addresses, whereas cache sets are indexed by specific address bitfields.

To eliminate cache side channels, RISC-V Sanctum combines PMP memory protection with **Hardware Cache Set Isolation via Page Coloring**.

### Address Decomposition and Cache Set Indexing

Consider a $4\text{-Megabyte}$, $8\text{-way}$ set-associative Level 2 / Level 3 cache array managing $64\text{-byte}$ cache lines.

When a 64-bit physical memory address ($A_{\text{physical}}$) arrives at the cache controller, the address is decomposed into three distinct bitfields:

```text
64-BIT PHYSICAL ADDRESS CACHE DECOMPOSITION

 64-Bit Physical Address A_physical
 Bit 63                                     Bit 18 Bit 17     Bit 6 Bit 5     Bit 0
 ┌────────────────────────────────────────────────┬────────────────┬──────────────┐
 │ Physical Tag Field                             │ Cache Set Index│ Line Offset  │
 └────────────────────────────────────────────────┴────────────────┴──────────────┘
  ◄────────── Tag (46 Bits) ─────────────────────► ◄─ Index (12b) ─► ◄─ Offset (6b)
```

1. **Line Offset ($O$, Bits $[5:0]$)**: Selects the byte offset ($0 \dots 63$) within a $64\text{-byte}$ cache line ($2^6 = 64\text{ bytes}$).
2. **Cache Set Index ($I$, Bits $[17:6]$)**: Selects one specific cache set row among $4,096$ cache sets ($2^{12} = 4,096\text{ sets}$).
3. **Physical Tag ($T$, Bits $[63:18]$)**: Uniquely identifies the physical memory page.

---

### The Overlap Between Virtual Page Offsets and Cache Set Bits

Now, let us examine how standard $4\text{-Kilobyte}$ virtual memory pages ($2^{12} = 4,096\text{ bytes}$) align with these cache set index bits:

```text
PAGE ALIGNMENT VS CACHE SET INDEX OVERLAP

 Physical Address Bits [17:0]
 Bit 17                  Bit 12 Bit 11                             Bit 0
 ┌─────────────────────────────┬───────────────────────────────────────┐
 │ CACHE COLOR BITS [17:12]    │ PAGE OFFSET BITS [11:0]               │
 │ (Determines L2/L3 Set Zone!)│ (4 KB Virtual Page Offset - Invariant)│
 └─────────────────────────────┴───────────────────────────────────────┘
  ◄────── 6 Color Bits ───────► ◄────────── 12 Page Offset Bits ────────►
  ◄─────────────────── 12 Cache Set Index Bits [17:6] ─────────────────►
```

Look closely at the 12 Cache Set Index bits ($[17:6]$) in the diagram above:
* Bits $[11:6]$ ($6\text{ bits}$) fall inside the $4\text{-KB}$ Page Offset ($[11:0]$). These 6 bits are **identical** in virtual and physical addresses.
* Bits $[17:12]$ ($6\text{ bits}$) fall **OUTSIDE** the $4\text{-KB}$ Page Offset! These 6 bits are determined by the **Physical Frame Number (PFN)** assigned by the memory allocator.

These high-order set index bits ($[17:12]$) are called the **Cache Color Bits**!

$$\text{Cache Color Bits } C = A_{\text{physical}}[17:12]$$

Because there are 6 Cache Color bits ($[17:12]$), the cache hierarchy contains $2^6 = \mathbf{64 \text{ Distinct Cache Colors}}$!

Each Cache Color corresponds to a non-overlapping slice of **64 cache sets** out of the 4,096 total sets:
* **Color 0**: Cache Sets $0 \dots 63$
* **Color 1**: Cache Sets $64 \dots 127$
* ...
* **Color 63**: Cache Sets $4,032 \dots 4,095$

```text
CACHE COLOR TO CACHE SET MAPPING TABLE

 Cache Color ID │ Physical Address Bits [17:12] │ Mapped L2/L3 Cache Sets
────────────────┼───────────────────────────────┼───────────────────────────
   Color 0      │ 000000_2 (0x00)               │ Cache Sets 0 to 63
   Color 1      │ 000001_2 (0x01)               │ Cache Sets 64 to 127
   Color 2      │ 000010_2 (0x02)               │ Cache Sets 128 to 191
   ...          │ ...                           │ ...
   Color 63     │ 111111_2 (0x3F)               │ Cache Sets 4,032 to 4,095
```

---

### Sanctum's Page Coloring Allocation Rule

The core breakthrough of RISC-V Sanctum is enforcing **Dynamic Page Coloring** during enclave memory allocation:

> **Sanctum Page Coloring Rule**: The Sanctum Security Monitor ($M\text{-Mode}$) allocates physical DRAM memory pages to an enclave such that **ALL physical pages belonging to Enclave $A$ share a dedicated, non-overlapping subset of Cache Colors** (e.g., Colors $0 \dots 15$).
> 
> Simultaneously, the OS kernel and other enclaves are assigned physical pages matching **disjoint Cache Colors** (e.g., Colors $16 \dots 63$).

```text
DISJOINT CACHE SET NON-INTERFERENCE PROOF

 Enclave A Physical Address Space  ──► Uses DRAM Pages with Bits [17:12] = Color 0..15
 OS Kernel Physical Address Space  ──► Uses DRAM Pages with Bits [17:12] = Color 16..63

 Set_Index(Enclave_A) = { Sets 0 .. 1023 }
 Set_Index(OS_Kernel) = { Sets 1024 .. 4095 }

 Intersection = Set_Index(Enclave_A) AND Set_Index(OS_Kernel) == EMPTY SET!
```

#### Mathematical Proof of Zero Side-Channel Leakage:

Let $S(E_A)$ be the set of L2/L3 cache set indices occupied by Enclave $A$:
$$S(E_A) = \{ I \in [0, 4095] \mid \text{Color}(I) \in \text{Colors}(E_A) \}$$

Let $S(\text{OS})$ be the set of L2/L3 cache set indices occupied by the OS Kernel:
$$S(\text{OS}) = \{ I \in [0, 4095] \mid \text{Color}(I) \in \text{Colors}(\text{OS}) \}$$

Because the Sanctum Security Monitor guarantees that $\text{Colors}(E_A) \cap \text{Colors}(\text{OS}) \equiv \emptyset$:

$$\mathbf{S(E_A) \ \cap \ S(\text{OS}) \ \equiv \ \emptyset \quad (\text{EMPTY SET!})}$$

#### Microarchitectural Security Result:
Because $S(E_A) \cap S(\text{OS}) = \emptyset$:
1. An OS kernel memory read can **NEVER** map to a cache set occupied by Enclave $A$.
2. An OS kernel memory load can **NEVER** evict a cache line belonging to Enclave $A$.
3. Executing Prime+Probe or Flush+Reload from the OS kernel against Enclave $A$'s cache sets returns **$100\%$ constant noise with ZERO correlation to Enclave $A$'s execution**!
4. Cross-domain cache side channels are **$100\%$ mathematically eliminated in silicon!**

---

## Sanctum Page Table Isolation and the Security Monitor

In traditional hardware enclaves (such as Intel SGX), the operating system kernel ($S\text{-Mode}$) manages the enclave's virtual memory page tables. 

This allowed a compromised kernel to execute **Controlled-Channel Page Fault Attacks**: the kernel cleared the Present bit ($P=0$) on an enclave page table entry, waited for the enclave to access the page, caught the Page Fault exception (`#PF`), and tracked the enclave's execution flow page-by-page.

Sanctum eliminates controlled-channel page fault attacks by shifting page table management into trusted hardware/firmware.

```text
SANCTUM ENCLAVE PAGE TABLE MANAGEMENT

 Untrusted OS Kernel (S-Mode)              Sanctum Security Monitor (M-Mode)
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Allocates DRAM Regions    │             │ MANAGES ENCLAVE PAGE TABLES!│
 │ Cannot edit Enclave PTEs! │             │ Enforces Page Table Walks │
 └─────────────┬─────────────┘             └─────────────┬─────────────┘
               │                                         │
               ▼                                         ▼
 PMP Hardware Blocks S-Mode Access!        Validates Page Tables in Hardware!
 (Untrusted OS CANNOT induce controlled page faults inside Enclaves!)
```

### How Sanctum Secures Enclave Page Tables

1. **Enclave Page Tables Managed in $M\text{-Mode}$**: When an enclave is instantiated, the **Sanctum Security Monitor ($M\text{-Mode}$)** takes full ownership of the enclave's page tables. The $S\text{-Mode}$ OS kernel is **forbidden** from writing to or modifying enclave Page Table Entries!
2. **Sanctized Page Table Walks**: The RISC-V hardware MMU executes page table walks for enclave virtual addresses using the $M\text{-Mode}$-validated page tables.
3. **PMP Isolation of Page Tables**: The $M\text{-Mode}$ monitor uses PMP registers to lock the physical memory pages containing enclave page tables. If the $S\text{-Mode}$ OS kernel attempts to edit an enclave PTE, PMP blocks the access instantly!
4. **Elimination of Controlled Page Faults**: Because the OS kernel cannot clear $P=0$ on enclave page tables, the kernel **cannot induce controlled page faults** to track enclave execution!

---

## Sanctum Enclave Execution Lifecycle

An application interacts with a Sanctum enclave through a formal hardware/firmware lifecycle managed by the $M\text{-Mode}$ Security Monitor:

```text
SANCTUM ENCLAVE LIFECYCLE STATE MACHINE

 User Application (U-Mode) / OS (S-Mode)       Sanctum Security Monitor (M-Mode)
 ┌──────────────────────────────────────┐     ┌──────────────────────────────────┐
 │ 1. System Call: Create Enclave       ├────►│ 2. Allocates Contiguous DRAM    │
 │    Specifies Region & Color Count    │     │    Assigns Disjoint Cache Colors │
 └──────────────────────────────────────┘     │    Configures PMP Memory Locks   │
                                              └────────────────┬─────────────────┘
                                                               │
 ┌──────────────────────────────────────┐                      │
 │ 3. Load Code & Initialize Enclave    ├──────────────────────┘
 │    Executes ecall into M-Mode        │
 │    Computes Cryptographic Measurement│ ──► Locks Enclave Measurement Hash!
 └──────────────────────────────────────┘
                                                               │
 ┌──────────────────────────────────────┐                      │
 │ 4. Enter Enclave Execution Mode      ├──────────────────────┘
 │    Executes ecall (Enclave Enter)    │
 │    Flushes L1 Caches & TLBs          │ ──► Switches CPU to Isolated U-Mode!
 │    [ EXECUTES ENCLAVE CODE IN PEACE! ]
 └──────────────────────────────────────┘
```

---

### Step-by-Step Lifecycle Sequence:

#### Step 1: Enclave Region Allocation
1. The untrusted OS kernel ($S\text{-Mode}$) allocates a contiguous block of physical DRAM for a new enclave.
2. The OS executes an `ecall` (Environment Call) into $M\text{-Mode}$ requesting the Sanctum Security Monitor to formalize the enclave.
3. The $M\text{-Mode}$ Security Monitor inspects the physical memory block, verifies that the block's physical addresses match a **dedicated set of Cache Colors**, and locks the DRAM block using RISC-V PMP registers (`pmpaddr` / `pmpcfg`).

#### Step 2: Enclave Loading and Cryptographic Measurement
1. The user-space loader copies code and data into the enclave's DRAM region.
2. The $M\text{-Mode}$ Security Monitor computes a cryptographic measurement hash (similar to `MRENCLAVE`) over all loaded code, data, and initial stack pages.
3. The Security Monitor locks the measurement hash. The enclave identity is finalized!

#### Step 3: Enclave Entry (`ecall` into $M\text{-Mode}$)
1. A user-space application thread executes an `ecall` to enter the enclave.
2. The CPU traps to $M\text{-Mode}$ (Sanctum Security Monitor).
3. The Security Monitor performs three microarchitectural cleanup actions:
   * **L1 Cache Flush**: Flushes private Level 1 Data and Instruction caches to remove any stale OS data.
   * **TLB Flush**: Flushes Translation Lookaside Buffer entries.
   * **PMP Register Activation**: Configures PMP registers so the CPU core can access the enclave's physical DRAM region **ONLY while executing in $U\text{-Mode}$ at the enclave's entry point address**.
4. The Security Monitor drops privilege from $M\text{-Mode}$ to $U\text{-Mode}$, jumping to the enclave's entry point.

#### Step 4: Isolated Enclave Execution
1. The enclave executes its code in $U\text{-Mode}$.
2. Memory loads and stores generated by the enclave map **EXCLUSIVELY to the enclave's assigned Cache Colors in the L2/L3 cache**.
3. The untrusted OS kernel ($S\text{-Mode}$) cannot read enclave memory (blocked by PMP) and cannot observe enclave cache activity (blocked by Cache Set Isolation)!

---

## Architecture Comparison: Intel SGX, ARM TrustZone, and RISC-V Sanctum

It is essential for hardware security engineers to compare how the three leading Trusted Execution Environment (TEE) architectures approach memory isolation, side-channel defense, and hardware complexity:

```text
TEE ARCHITECTURE COMPARISON MATRIX

 Architectural Feature    │ Intel SGX                  │ ARM TrustZone              │ RISC-V Sanctum
──────────────────────────┼────────────────────────────┼────────────────────────────┼──────────────────────────────
 Primary Target           │ User-Space Enclaves        │ System-Wide World Partition│ User-Space Enclaves
 Isolation Mechanism      │ PRM / EPCM Hardware Table  │ Physical NS Bus Bit Line   │ PMP Registers + M-Mode Monitor
 Cache Side-Channel Def   │ NONE (Vulnerable to P+P)   │ NONE (Vulnerable to P+P)   │ 100% IMMUNE (Page Coloring!)
 Page Fault Side-Channel  │ Vulnerable (Controlled #PF)│ N/A (Runs full OS)         │ 100% IMMUNE (M-Mode Page Tab)
 Memory Encryption        │ YES (Inline MEE Hardware)  │ Optional (External TZC)    │ NO (Software/PMP Isolation)
 Hardware Openness        │ Proprietary Closed Silicon │ Proprietary Closed Silicon │ 100% Open-Source RISC-V RTL
```

```text
KEY ARCHITECTURAL DIFFERENCES

 1. Intel SGX:
    * High hardware complexity (Inline MEE encryption, complex EPCM silicon tables).
    * Highly vulnerable to cache side channels (Flush+Reload, Prime+Probe) and controlled page faults.

 2. ARM TrustZone:
    * System-wide binary split (Secure World vs Normal World).
    * Excellent for mobile payment/biometrics, but does NOT isolate individual user apps from a bad Secure OS.

 3. RISC-V Sanctum:
    * Zero inline memory encryption hardware required.
    * Provably immune to cache set side channels via Page/Cache Coloring!
    * 100% open-source RTL implementation extensible for custom RISC-V SoC designs.
```

---

## Solved Industrial Engineering Exercise: Quantitative L2 Cache Geometry, Page Color Bitfield Extraction, and Non-Interference Proof

To consolidate your complete mastery of RISC-V Sanctum hardware cache set isolation, page coloring bitfield decompositions, PMP memory range checks, and mathematical non-interference proofs, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal microarchitectural security engineer auditing a 64-bit RISC-V processor core ($f_{\text{clk}} = 3.2\text{ GHz}, T_{\text{clk}} = 0.3125\text{ ns}$) running the Sanctum Security Monitor in $M\text{-Mode}$.

The processor operates a shared Level 2 / Level 3 cache hierarchy with the following physical parameters:
* **Physical Address Space**: 64-bit physical addressing ($A_{\text{physical}}[63:0]$).
* **Virtual Page Size**: Standard $4\text{-Kilobyte}$ pages ($4,096\text{ bytes} = 2^{12}$).
* **L2 Cache Size**: $2\text{-Megabytes}$ ($2,097,152\text{ bytes}$).
* **Cache Line Size**: $64\text{-bytes}$ ($2^6 = 64$).
* **Cache Associativity**: $8\text{-way set-associative}$ ($N = 8$).

```text
3.2 GHz RISC-V CORE WITH 2 MB 8-WAY SET-ASSOCIATIVE L2 CACHE

 64-Bit RISC-V CPU Core (M-Mode Sanctum Monitor)
 ┌─────────────────────────────────────────────────────────────┐
 │ L2 Cache: 2 MB Total Size | Line Size = 64B | Associativity N = 8│
 │ Page Size: 4 KB (12 Offset Bits)                            │
 └─────────────────────────────────────────────────────────────┘
```

The Sanctum Security Monitor is instantiating two security domains:
1. **Domain 0 (Untrusted Linux Kernel in $S\text{-Mode}$)**: Allocated physical DRAM pages with addresses starting at `0x0000_0000_8000_0000`.
2. **Domain 1 (Sanctum Enclave Alpha in $U\text{-Mode}$)**: Allocated physical DRAM pages with addresses starting at `0x0000_0000_9000_0000`.

#### Your Objective

1. Calculate the total number of cache sets ($S_{\text{total}}$) in the 2-MB L2 cache array, and determine the exact physical address bitfields for:
   * Line Offset ($O$)
   * Cache Set Index ($I$)
   * Physical Tag ($T$)
2. Determine the number of **Cache Color Bits ($B_{\text{color}}$)** and total number of **Cache Colors ($N_{\text{colors}}$)** in this cache hierarchy.
3. Identify the exact physical address bits that determine the **Cache Color ID**.
4. The Sanctum Monitor assigns **Colors $0 \dots 31$** to the Linux Kernel (Domain 0) and **Colors $32 \dots 63$** to Enclave Alpha (Domain 1):
   * Calculate the physical L2 cache set index range ($I_{\text{OS}}$) assigned to the Linux Kernel.
   * Calculate the physical L2 cache set index range ($I_{\text{Enclave}}$) assigned to Enclave Alpha.
   * Prove mathematically that $I_{\text{OS}} \cap I_{\text{Enclave}} \equiv \emptyset$ (Zero Cache Set Intersection!).
5. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate L2 Cache Geometry and Address Bitfield Decompositions

##### 1. Total Number of Cache Lines ($N_{\text{lines}}$):

$$N_{\text{lines}} = \frac{\text{L2 Cache Size}}{\text{Line Size}} = \frac{2,097,152 \text{ Bytes}}{64 \text{ Bytes/Line}} = \mathbf{32,768 \text{ Cache Lines}}$$

##### 2. Total Number of Cache Sets ($S_{\text{total}}$):
Given associativity $N = 8$:

$$S_{\text{total}} = \frac{N_{\text{lines}}}{\text{Associativity}} = \frac{32,768}{8} = \mathbf{4,096 \text{ Cache Sets}}$$

Since $S_{\text{total}} = 4,096 = 2^{12}$, the Cache Set Index requires **12 bits**.

##### 3. Physical Address Bitfield Decomposition:
* **Line Offset ($O$)**: $\log_2(64) = \mathbf{6 \text{ Bits}}$ (Bits $[5:0]$).
* **Cache Set Index ($I$)**: $\log_2(4,096) = \mathbf{12 \text{ Bits}}$ (Bits $[17:6]$).
* **Physical Tag ($T$)**: $64 - (6 + 12) = \mathbf{46 \text{ Bits}}$ (Bits $[63:18]$).

```text
DERIVED PHYSICAL ADDRESS BITFIELDS

 Bit 63                                     Bit 18 Bit 17     Bit 6 Bit 5     Bit 0
 ┌────────────────────────────────────────────────┬────────────────┬──────────────┐
 │ Physical Tag (46 Bits)                         │ Set Index (12b)│ Offset (6b)  │
 └────────────────────────────────────────────────┴────────────────┴──────────────┘
```

---

#### Step 2: Determine Cache Color Bits and Total Cache Colors

We compare the 12 Cache Set Index bits ($[17:6]$) against the $4\text{-KB}$ Virtual Page Offset ($[11:0]$):
* Bits $[11:6]$ ($6\text{ bits}$) fall **INSIDE** the $4\text{-KB}$ Page Offset ($[11:0]$).
* Bits $[17:12]$ ($6\text{ bits}$) fall **OUTSIDE** the $4\text{-KB}$ Page Offset, sitting in the Physical Frame Number ($\text{PFN}$).

The number of Cache Color Bits ($B_{\text{color}}$) is:

$$B_{\text{color}} = 17 - 12 + 1 = \mathbf{6 \text{ Color Bits} \quad (\text{Bits } [17:12])}$$

The total number of unique Cache Colors ($N_{\text{colors}}$) is:

$$N_{\text{colors}} = 2^{B_{\text{color}}} = 2^6 = \mathbf{64 \text{ Cache Colors (Colors 0 through 63)}}$$

Each Cache Color controls a block of cache sets equal to:

$$\text{Sets per Color} = \frac{S_{\text{total}}}{N_{\text{colors}}} = \frac{4,096}{64} = \mathbf{64 \text{ Cache Sets per Color}}$$

---

#### Step 3: Map Cache Colors to Physical Cache Set Index Ranges

Each Cache Color $k \in [0, 63]$ governs the L2 cache set index range:

$$\text{Set\_Start}(k) = k \times 64$$

$$\text{Set\_End}(k) = (k \times 64) + 63$$

##### 1. Domain 0 (Linux Kernel — Colors $0 \dots 31$):
* Lowest Set Index (Color 0): $0 \times 64 = \mathbf{0}$
* Highest Set Index (Color 31): $(31 \times 64) + 63 = 1,984 + 63 = \mathbf{2,047}$

$$\mathbf{I_{\text{OS}} = [0, 2047] \quad (\text{Cache Sets 0 through 2,047})}$$

##### 2. Domain 1 (Enclave Alpha — Colors $32 \dots 63$):
* Lowest Set Index (Color 32): $32 \times 64 = \mathbf{2,048}$
* Highest Set Index (Color 63): $(63 \times 64) + 63 = 4,032 + 63 = \mathbf{4,095}$

$$\mathbf{I_{\text{Enclave}} = [2048, 4095] \quad (\text{Cache Sets 2,048 through 4,095})}$$

```text
SANCTUM CACHE SET PARTITIONING MAP

 Domain 0 (Linux Kernel)  ──► Cache Colors 0..31  ──► L2 Cache Sets 0 to 2,047
 Domain 1 (Enclave Alpha) ──► Cache Colors 32..63 ──► L2 Cache Sets 2,048 to 4,095
```

---

#### Step 4: Mathematical Non-Interference Proof

We evaluate the intersection between $I_{\text{OS}}$ and $I_{\text{Enclave}}$:

$$I_{\text{OS}} \cap I_{\text{Enclave}} = [0, 2047] \ \cap \ [2048, 4095]$$

Since $2047 < 2048$:

$$\mathbf{I_{\text{OS}} \ \cap \ I_{\text{Enclave}} \ \equiv \ \emptyset \quad (\mathbf{\text{EMPTY SET!}})}$$

##### Microarchitectural Security Conclusion:
1. The Linux Kernel ($S\text{-Mode}$) accesses memory pages that map exclusively to **L2 Cache Sets $0 \dots 2047$**.
2. Enclave Alpha ($U\text{-Mode}$) accesses memory pages that map exclusively to **L2 Cache Sets $2048 \dots 4095$**.
3. Because $I_{\text{OS}} \cap I_{\text{Enclave}} = \emptyset$, a Prime+Probe or Flush+Reload side-channel attack executed by the Linux Kernel against Enclave Alpha **cannot access, evict, or measure a single cache line belonging to Enclave Alpha**.
4. **Cross-domain cache side-channel attacks are $100\%$ mathematically eliminated in silicon!**

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against RISC-V Sanctum design principles:

1. **L2 Cache Capacity Check**:
   * Total sets $= 4,096$.
   * $I_{\text{OS}}$ size $= 2,048\text{ sets}$. $I_{\text{Enclave}}$ size $= 2,048\text{ sets}$.
   * $2,048 + 2,048 = 4,096\text{ sets}$. Total capacity $100\%$ accounted for!
2. **Page Offset Alignment Check**:
   * Page size $= 4\text{ KB} = 2^{12}\text{ bytes}$ (Bits $[11:0]$).
   * Color bits $= [17:12]$.
   * Because Color bits $[17:12]$ sit entirely above Bit 11, the $M\text{-Mode}$ monitor can assign any Cache Color to an enclave simply by selecting physical DRAM frame numbers ($\text{PFNs}$) with matching $[17:12]$ bit patterns.
3. **Non-Interference Verification**:
   * $I_{\text{OS}} \cap I_{\text{Enclave}} = \emptyset$.
   * Zero shared cache sets $\implies$ Zero cache evictions $\implies$ Zero side-channel leakage.

All 2-MB L2 cache geometry equations, 6-bit page color bitfield decompositions, PMP memory protection rules, and mathematical cache non-interference proofs evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **RISC-V Sanctum**: An open-source, provably secure hardware enclave architecture for the RISC-V ISA that eliminates cache side-channel attacks and page-fault attacks by combining Machine-Mode ($M\text{-Mode}$) security monitor page table isolation with Physical Memory Protection (PMP) hardware.
* **Hardware cache set isolation**: The microarchitectural security mechanism (Page/Cache Coloring) where physical DRAM memory page allocations are restricted such that an enclave's memory pages map to a completely disjoint, non-overlapping subset of cache set rows ($I_{\text{enclave}} \cap I_{\text{OS}} = \emptyset$), rendering cross-domain cache timing side channels physically impossible in silicon.
