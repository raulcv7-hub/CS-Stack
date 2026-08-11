---
title: "RISC-V Sanctum Architecture and Hardware Cache Set Isolation Mechanics"
---

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


## Solved Industrial Engineering Exercise: Quantitative L2 Cache Geometry, Page Color Bitfield Extraction, and Non-Interference Proof

To consolidate your complete mastery of RISC-V Sanctum hardware cache set isolation, page coloring bitfield decompositions, PMP memory range checks, and mathematical non-interference proofs, we will now walk through a complete, step-by-step industrial hardware engineering problem.


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

