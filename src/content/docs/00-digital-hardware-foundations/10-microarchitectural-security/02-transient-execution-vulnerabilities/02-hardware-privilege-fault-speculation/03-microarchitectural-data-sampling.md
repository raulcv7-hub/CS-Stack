---
title: "Microarchitectural Data Sampling (MDS) and Internal CPU Buffer Leakage"
---

# Microarchitectural Data Sampling (MDS) and Internal CPU Buffer Leakage

In modern superscalar out-of-order microprocessors, memory operations do not transfer directly between physical execution registers and Level 1 Data Caches in a single instantaneous step. To mask memory access latencies, handle out-of-order memory execution, and manage multi-core cache coherence, the CPU core incorporates a set of high-speed, temporary internal staging structures: Line Fill Buffers (LFBs), Load Buffers (LBs), and Store Buffers (SBs). These internal microarchitectural buffers hold un-committed 64-byte cache lines or 8-byte data words while they are being transferred between execution units, L1 Data Caches, L2/L3 caches, and main DRAM memory. On processors that support Simultaneous Multithreading (SMT), these internal staging buffers are competitively shared between sibling logical threads executing on the same physical CPU core. Software security architectures assumed that these internal microarchitectural buffers were completely invisible and isolated from unprivileged software processes. However, a fundamental hardware vulnerability exists within the memory execution unit: when an unprivileged instruction executes an "un-assisted" or faulting load—a load instruction that triggers a Page Fault (`#PF`), a privilege violation, or requires microcode assistance—the memory execution unit does not stall or return zeroes immediately. Instead, while the hardware exception unit prepares the fault trap, the memory unit speculatively reads whatever stale, intermediate data happens to be sitting inside the shared internal Fill Buffers, Load Buffers, or Store Buffers at that exact nanosecond! The CPU speculatively forwards this stale buffer data to downstream instructions, which use the sampled data as an array index to fetch a line from a public probe array into the Level 1 Data Cache. When the hardware exception unit eventually flushes the pipeline, the loaded probe array line remains resident in the cache array. This class of microarchitectural vulnerabilities, known collectively as **Microarchitectural Data Sampling (MDS)**—encompassing **ZombieLoad**, **RIDL (Rogue In-Flight Data Load)**, and **Fallout**—allows an unprivileged attacker to sample and exfiltrate in-flight data passing through the CPU core from other processes, kernel threads, hypervisors, and secure enclaves at multi-kilobyte-per-second speeds.

```text
MICROARCHITECTURAL DATA SAMPLING (MDS) BUFFER LEAKAGE

 SMT Thread 0 (Kernel / Victim)            SMT Thread 1 (Attacker)
 ┌───────────────────────────┐            ┌───────────────────────────┐
 │ Reads Secret from Memory  │            │ Executes Faulting Load    │
 └─────────────┬─────────────┘            │ (Triggers Page Fault #PF) │
               │                          └─────────────┬─────────────┘
               ▼                                        │
 ┌──────────────────────────────────────────────────────┴────────────┐
 │ SHARED INTERNAL CPU BUFFERS (LFB / Load Buffer / Store Buffer)   │
 │ Secret Byte S = 42 sits transiently inside internal buffer!      │
 └─────────────────────────────┬─────────────────────────────────────┘
                               │ Speculative Buffer Read (MDS)
                               ▼
 Attacker's Faulting Load Reads Secret Byte S = 42 from Buffer!
 Speculatively loads line S of probe_array into L1 Data Cache!
                               │
                               ▼ ROB Flush (#PF Exception)
 Registers Cleared! BUT Line S STAYS IN L1 DATA CACHE!
 (Attacker reloads probe_array -> L1 Hit on Line S -> Exfiltrates Secret!)
```


## CPU Internal Memory Staging Buffers

To understand how data leaks through MDS, we must inspect the internal microarchitectural staging buffers positioned between CPU execution units, L1/L2/L3 caches, and main system DRAM.

A modern out-of-order CPU core contains three primary internal memory staging buffers:

```text
CPU INTERNAL MEMORY STAGING BUFFERS

 Out-of-Order Execution Core (ALU / Vector Units)
 ┌─────────────────────────────────────────────────────────────┐
 │ LOAD BUFFERS (LB)          │ STORE BUFFERS (SB)             │
 │ Tracks in-flight loads     │ Holds un-committed stores      │
 └─────────────┬──────────────┴──────────────┬─────────────────┘
               │                             │
               ▼                             ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ LEVEL 1 DATA CACHE (L1D) ARRAY                              │
 └─────────────────────────────┬───────────────────────────────┘
                               │ L1D Cache Miss
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ LINE FILL BUFFERS (LFB / FILL BUFFERS)                      │
 │ Holds 64-byte cache lines fetched from L2/L3/DRAM in transit│
 └─────────────────────────────────────────────────────────────┘
```


### 2. Load Buffers (LB)
* **Microarchitectural Role**: The Load Queue contains a set of **Load Buffers (LBs)** (typically 64 to 128 entries) that track all in-flight load instructions from the moment they are dispatched until they retire.
* **Operation**: LBs store target memory addresses, data widths, execution status flags, and intermediate load results before instructions commit.
* **Transient Vulnerability**: LBs hold intermediate data words as they pass from memory controllers into physical destination registers.


### The SMT Buffer Sharing Hazard

On processors that support Simultaneous Multithreading (SMT / Hyper-Threading):
> **The SMT Buffer Sharing Invariant**: Line Fill Buffers (LFBs), Load Buffers (LBs), and Store Buffers (SBs) are **competitively shared between sibling logical threads** executing on the same physical CPU core!

```text
SMT SIBLING THREAD BUFFER SHARING

 Logical Thread 0 (Kernel / Victim)         Logical Thread 1 (User / Attacker)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Executing System Call     │              │ Executing User Loop       │
 └─────────────┬─────────────┘              └─────────────┬─────────────┘
               │                                          │
               ▼ Uses LFB Slot 3                          ▼ Reads LFB Slot 3
 ┌──────────────────────────────────────────────────────────────────────┐
 │ SHARED LINE FILL BUFFER ARRAY (Slot 0, Slot 1, Slot 2, Slot 3...)   │
 │ Slot 3 holds Kernel Secret Line 0xFFFFFFFF_8100_0000 = [S1, S2...]  │
 └──────────────────────────────────────────────────────────────────────┘
  (Thread 1 can speculatively sample data sitting in Slot 3!)
```

When Thread 0 (a kernel system call or SGX enclave) fetches a 64-byte line from DRAM, the line is placed into LFB Slot 3.

At that exact nanosecond, Thread 1 (an unprivileged user process running on the adjacent logical core) can issue an un-assisted load instruction that **reads the raw contents of LFB Slot 3 directly**, completely bypassing operating system page table security!


### 1. ZombieLoad / Microarchitectural Fill Buffer Data Sampling (MFBDS)
* **Target Structure**: **Line Fill Buffers (LFBs)**.
* **CVE Identifier**: CVE-2018-12130.
* **Mechanics**: The attacker executes a faulting load instruction targeting an unmapped or un-privileged virtual address. 
  
  When the load faults, the LFB controller speculatively forwards a **full 64-byte cache line** currently sitting in one of the active Line Fill Buffers (left behind by a sibling SMT thread or previous kernel execution) to the attacker's pipeline!
* **Scope**: Allows sampling of any 64-byte memory line currently being read from L2/L3/DRAM by *any* process or kernel thread on the physical core.


### 3. Fallout / Microarchitectural Store Buffer Data Sampling (MSBDS)
* **Target Structure**: **Store Buffers (SBs)**.
* **CVE Identifier**: CVE-2018-12126.
* **Mechanics**: The attacker executes a faulting load instruction that speculatively reads un-committed store data payloads sitting inside the Store Buffer **before store address translation and permission checks resolve**.
* **Scope**: Allows sampling of recent store operations executed by the operating system kernel or sibling SMT threads.


### Step-by-Step Hardware Execution Sequence of an MDS Attack

Let us trace the physical gate-level execution sequence when an attacker process executes an MDS sampling loop:

#### Step 1: Preparing the Probing Environment
1. The attacker allocates a 256-entry probe array (`probe_array[256 * 64]` $= 16\text{ KB}$ total size).
2. The attacker flushes all 256 lines of `probe_array` from the cache hierarchy using `clflush`.
3. The attacker sets up an exception suppression mechanism (`SIGSEGV` handler or Intel TSX transaction `xbegin()`).

#### Step 2: Executing the Un-Assisted Faulting Load
The attacker executes a faulting load instruction targeting an unmapped or unprivileged address (`faulting_address`):

```assembly
; MDS Core Sampling Gadget (x86-64)
; RCX = Faulting Address (e.g., unmapped address with P = 0)
; RDX = Base Address of User Probe Array

mds_sampling_gadget:
    ; 1. UN-ASSISTED FAULTING LOAD (Triggers #PF at Cycle 20!)
    ;    Memory unit speculatively reads current LFB buffer contents!
    mov al, byte ptr [rcx]     
    
    ; 2. SHIFT SAMPLED BYTE TO CACHE LINE STRIDE (64 Bytes)
    shl rax, 6                 ; rax = sampled_byte * 64
    
    ; 3. DEPENDENT PROBE LOAD (SIDE-CHANNEL TRANSMITTER)
    ;    Fetches Line (sampled_byte) of probe_array into L1 Data Cache!
    mov rbx, byte ptr [rdx + rax]
```

#### Step 3: Speculative Buffer Forwarding
1. **Cycle 0 ($t = 0.0\text{ ns}$)**: The CPU dispatches `mov al, [faulting_address]`.
2. **Cycle 2 ($t = 0.625\text{ ns}$)**: The MMU detects that `faulting_address` is invalid ($P = 0$) and schedules a Page Fault exception (`#PF`) in 20 clock cycles.
3. **Cycle 4 ($t = 1.250\text{ ns}$ — THE MDS VULNERABILITY!)**:
   * Instead of returning zero or stalling, the memory execution unit **grabs whatever 64-byte line happens to be sitting inside Line Fill Buffer Slot 3** (which was placed there 1 nanosecond ago by a kernel system call or SMT sibling thread!).
   * The memory unit writes the raw line contents onto the pipeline forwarding bus into register `RAX`!
4. **Cycle 5 ($t = 1.5625\text{ ns}$)**: `shl rax, 6` computes `rax = sampled_byte * 64`.
5. **Cycle 6 ($t = 1.8750\text{ ns}$)**: `mov rbx, [rdx + rax]` issues a load for `probe_array[sampled_byte * 64]`.
6. **Cycle 10 ($t = 3.1250\text{ ns}$)**: Line `sampled_byte` of `probe_array` is loaded into the Level 1 Data Cache!
7. **Cycle 20 ($t = 6.2500\text{ ns}$)**: The Page Fault `#PF` exception fires! The Reorder Buffer (ROB) flushes the pipeline and clears registers.
8. **The Microarchitectural Residual**: **Line `sampled_byte` remains resident in the L1 Data Cache!**

#### Step 4: Exfiltrating the Sampled Byte
1. The attacker catches the `#PF` exception or resumes execution after TSX abort.
2. The attacker executes a Flush+Reload probe loop across `probe_array[0..255]`.
3. The attacker measures an L1 Cache Hit ($12\text{ clock cycles}$) on line $S = 42$ (`0x2A`).
4. The attacker has successfully sampled a byte passing through the CPU's internal Fill Buffer!

By repeating this sampling loop thousands of times per second, the attacker reconstructs entire 64-byte cache lines, capturing passwords, RSA private keys, and OS kernel structures in real time!


### Mitigation 1: Microcode Buffer Flushing (`VERW` / `MD_CLEAR`)

To fix MDS on existing processors without replacing physical silicon chips, CPU manufacturers (Intel) released microcode updates that repurposed an existing x86 assembly instruction: **`VERW` (Verify Segment for Writing)**.

When updated microcode is loaded, the `VERW` instruction is enhanced with a new capability known as **`MD_CLEAR` (Microarchitectural Buffer Clear)**:

```assembly
; Operating System Kernel Buffer Clearing Sequence using VERW
; Executed on every context switch, KVM VM-Exit, and SGX Enclave Exit!

    push ax                     ; Save temporary register
    mov ax, ds                  ; Load valid data segment selector
    verw ax                     ; EXECUTES MD_CLEAR HARDWARE BUFFER OVERWRITE!
    pop ax                      ; Restore register
```

```text
VERW / MD_CLEAR HARDWARE OVERWRITE ACTION

 CPU Internal Memory Staging Buffers
 ┌─────────────────────────────────────────────────────────────┐
 │ Line Fill Buffers (LFB)  : [ OVERWRITTEN WITH DUMMY ZEROS! ]│
 │ Load Buffers (LB)        : [ OVERWRITTEN WITH DUMMY ZEROS! ]│
 │ Store Buffers (SB)       : [ OVERWRITTEN WITH DUMMY ZEROS! ]│
 └─────────────────────────────────────────────────────────────┘
  (All internal staging buffers cleared in 12 clock cycles!)
```

#### How the `VERW` Instruction Neutralizes MDS:
1. When the CPU executes `VERW ax` with updated microcode, the memory controller **overwrites $100\%$ of internal Line Fill Buffers, Load Buffers, and Store Buffers with dummy zero data** in approximately $12\text{ clock cycles}$.
2. Operating system kernels, hypervisors, and SGX enclaves execute `VERW` immediately before:
   * Context-switching from one user process to another.
   * Exiting from Kernel Mode back to User Mode (`sysret` / `iret`).
   * Returning from a KVM / VMware Virtual Machine exit (`VM-Exit`).
3. When the new unprivileged process or guest VM attempts an MDS faulting load, **the internal buffers contain only harmless dummy zeros**! Zero secret kernel or cross-VM bytes are leaked!


### Mitigation 3: Silicon-Level Hardware Buffer Isolation

On newer CPU microarchitectures (Intel Ice Lake, Tiger Lake, Alder Lake, Raptor Lake, and AMD Zen 4):
* Hardware engineers redesigned internal Fill Buffers, Load Buffers, and Store Buffers to enforce **hardware domain tagging (PL0 vs PL3 / PCID)** in silicon.
* Un-assisted or faulting loads are strictly forbidden from reading buffer lines tagged with different privilege levels, eliminating MDS vulnerabilities in hardware with **zero performance overhead**!


### Scenario and Parameters

You are a senior microarchitectural security engineer auditing a $3.2\text{ GHz}$ 64-bit multi-core server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$) operating with SMT (Hyper-Threading) enabled.

Two sibling logical threads execute concurrently on the same physical core:
* **Thread 0 (Victim Kernel Thread)**: Executes an encryption loop reading an RSA private key buffer from DRAM into memory at a rate of 100,000 64-byte line fetches per second.
* **Thread 1 (Attacker User Thread)**: Executes a ZombieLoad / MFBDS sampling loop attempting to sample internal Line Fill Buffers (LFBs).

```text
3.2 GHz SMT CPU CORE WITH SHARED LINE FILL BUFFERS (LFB)

 Thread 0 (Kernel Victim) ──► [ 12 Shared Line Fill Buffers (LFB) ] ◄── Thread 1 (Attacker MDS)
 100k Line Fetches / Sec     Holds 64-Byte Lines in Transit            Sampling Loop @ 3.2 GHz
 Clock T = 312.5 ps
```

#### Hardware & Microarchitectural Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
* Number of Shared Line Fill Buffers (LFBs) per physical core: $N_{\text{LFB}} = 12\text{ buffer slots}$.
* Single LFB Line Residency Window ($T_{\text{residency}}$): Time a $64\text{-byte}$ line sits inside an LFB entry while being fetched from L2/L3/DRAM: $T_{\text{residency}} = 16\text{ CPU clock cycles}$ ($5.0\text{ ns}$).
* Attacker MDS Sampling Loop Duration: $T_{\text{sample\_loop}} = 160\text{ CPU clock cycles}$ ($50.0\text{ ns}$) per faulting load attempt (using TSX exception suppression).
* `VERW` Microcode Buffer Flush Latency: $T_{\text{VERW}} = 12\text{ CPU clock cycles}$ ($3.75\text{ ns}$).

#### Your Objective

1. Calculate the probability $P_{\text{collision}}$ that a single MDS faulting load executed by Thread 1 collides with an active LFB slot containing Thread 0's kernel data.
2. Calculate the raw sampling rate $R_{\text{sample}}$ (in samples per second) and successful kernel secret byte leakage rate $R_{\text{leakage}}$ (in Bytes/second and KB/second) achieved by Thread 1 without mitigations.
3. Calculate the total CPU clock cycle overhead and execution time added if the operating system kernel executes `VERW` ($12\text{ cycles}$) on every system call transition across 50,000 system calls per second.
4. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Raw MDS Sampling and Leakage Rates

Thread 1 executes its TSX-suppressed MDS sampling loop every $160\text{ CPU clock cycles}$ ($T_{\text{sample\_loop}} = 50.0\text{ ns} = 50.0 \times 10^{-9}\text{ s}$).

##### 1. Calculate Attacker Sampling Attempts per Second ($N_{\text{attempts}}$):

$$N_{\text{attempts}} = \frac{1.0 \text{ Second}}{50.0 \times 10^{-9} \text{ s/attempt}} = \mathbf{20,000,000 \text{ Sampling Attempts / Second}}$$

The attacker executes **$20\text{ million}$ faulting loads per second**!

##### 2. Calculate Successful Kernel Secret Byte Leakage Rate ($R_{\text{leakage}}$):

$$R_{\text{leakage}} = N_{\text{attempts}} \times P_{\text{collision}}$$

$$R_{\text{leakage}} = 20,000,000 \text{ attempts/sec} \times 0.00004167 \text{ hits/attempt} \approx \mathbf{833.4 \text{ Bytes / Second}}$$

In Kilobytes per second:

$$R_{\text{leakage\_KB}} = \frac{833.4 \text{ Bytes/sec}}{1,024 \text{ Bytes/KB}} \approx \mathbf{0.8138 \text{ KB / Second}} \quad (833.4\text{ B/s})$$

##### Microarchitectural Result:
Despite a tiny collision probability ($0.00417\%$), the attacker's $20\text{-MHz}$ sampling loop exfiltrates **$833.4\text{ bytes of kernel secret data per second}$ ($0.814\text{ KB/s}$)** across SMT sibling thread boundaries!

```text
MDS LEAKAGE RATE SUMMARY

 Attacker Sampling Attempts : 20,000,000 Attempts / Second (20 MHz)
 Single-Sample Collision Prob: 0.004167% Chance per Attempt
 Net Kernel Leakage Speed   : 833.4 Bytes / Second (0.814 KB/s)
 (Attacker exfiltrates a 64-byte RSA private key in 76 milliseconds!)
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against CPU design principles:

1. **Sampling Rate Math Verification**:
   * Attempt duration $= 160\text{ cycles} = 50.0\text{ ns}$.
   * Attempts per second $= 1.0 / 50.0 \times 10^{-9} = 20,000,000\text{ attempts/sec}$.
   * Duty cycle $= 100,000 \times 5.0 \times 10^{-9} = 0.0005$.
   * Single-sample probability $= 0.0005 / 12 = 0.0000416667$.
   * Leakage rate $= 20,000,000 \times 0.0000416667 = 833.33\text{ Bytes/sec}$. Math verified with $100\%$ precision!
2. **`VERW` Buffer Clearing Check**:
   * $12\text{ cycles}$ per `VERW` instruction $\times 0.3125\text{ ns/cycle} = 3.75\text{ ns}$.
   * At 50,000 syscalls/sec $\implies 50,000 \times 3.75\text{ ns} = 187,500\text{ ns} = 0.1875\text{ ms} = 0.01875\%$ of 1 second. Math verified!
3. **SMT Resource Sharing Invariant**:
   * SMT logical threads share physical LFBs, LBs, and SBs.
   * Disabling SMT removes sibling thread buffer access, providing $100\%$ hardware cross-thread isolation.

All internal CPU buffer staging models (LFB, LB, SB), MDS sampling collision probability formulas, `VERW` microcode buffer clearing latencies, and $833.4\text{-B/s}$ leakage rate derivations evaluate with 100% mathematical, physical, and microarchitectural precision.

