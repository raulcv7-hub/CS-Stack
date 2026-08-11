---
title: "Gather Data Sampling Mechanics and Vector Buffer Transient Leakage"
---

# Gather Data Sampling Mechanics and Vector Buffer Transient Leakage

In modern superscalar processors, Single Instruction, Multiple Data (SIMD) vector processing extensions—such as AVX2 and AVX-512—allow central processing units to process massive data arrays in parallel. To accelerate complex data-parsing algorithms, database scans, matrix transformations, and cryptographic operations, modern SIMD extensions incorporate specialized non-contiguous memory reading instructions known as **Vector Gather Instructions** (such as `vpgatherdd` and `vpgatherqd`). Unlike standard scalar load instructions that fetch a single contiguous 64-byte memory line, a vector gather instruction accepts a vector of scattered memory offsets, loading multiple non-contiguous data elements from completely different memory pages into a single 256-bit or 512-bit vector register (`YMM` or `ZMM`). Because a physical CPU core cannot read multiple scattered memory locations across different cache lines in a single clock cycle, the execution engine breaks down a vector gather instruction into an iterative microcode loop that fetches individual 32-bit or 64-bit elements one by one. During this multi-cycle iterative fetch process, the CPU uses a temporary, internal microarchitectural staging register array known as the **Gather Buffer**. The Gather Buffer holds intermediate vector elements as they arrive from the Level 1 Data Cache before assembling the complete vector register. However, a critical microarchitectural flaw exists within the vector gather execution pipeline: the internal Gather Buffer is **competitively shared across all execution contexts on a physical CPU core**, and its internal 128-bit, 256-bit, and 512-bit registers are **not cleared or isolated between instruction executions**. When an unprivileged process or sibling thread executes a speculative load instruction or a subsequent vector gather instruction, the CPU's memory execution unit speculatively forwards stale, un-committed data sitting inside the shared Gather Buffer directly to downstream pipeline registers! This vulnerability, known as **Gather Data Sampling (GDS)** or **Downfall**, allows an unprivileged attacker to sample and exfiltrate wide vector registers previously processed by other user applications, kernel threads, OpenSSL AES-NI encryption routines, or secure enclaves at speeds exceeding **$100\text{ Kilobytes per second}$**, completely bypassing virtual memory page table isolation and hardware encryption barriers.

```text
GATHER DATA SAMPLING (DOWNFALL) VECTOR LEAKAGE

 Victim Thread (Executing AES-NI / AVX-512)   Attacker Thread (Executing Gather)
 ┌────────────────────────────────────────┐   ┌───────────────────────────────┐
 │ Processes Secret Key in 256-bit Vector │   │ Executes Vector Gather Load   │
 └───────────────────┬────────────────────┘   │ (vpgatherdd / Faulting Load)  │
                     │                        └───────────────┬───────────────┘
                     ▼                                        │
 ┌────────────────────────────────────────────────────────────┴──────────────┐
 │ SHARED INTERNAL GATHER BUFFER (Vector Staging Register Array)              │
 │ 256-Bit Secret Vector Register Payload sits stale inside Gather Buffer!    │
 └───────────────────────────┬───────────────────────────────────────────────┘
                             │ Speculative Vector Forwarding
                             ▼
 Attacker's Load reads 256-bit Secret Payload directly from Gather Buffer!
 Speculatively loads line S of probe_array into L1 Data Cache!
                             │
                             ▼ Pipeline Flush / ROB Reset
 Registers Cleared! BUT Line S STAYS IN L1 DATA CACHE!
 (Attacker reloads probe_array -> L1 Hit on Line S -> Exfiltrates Secret Vector!)
```


## SIMD Vector Gather Instructions and Hardware Execution Mechanics

To understand why vector gather instructions leak data through internal hardware buffers, we must examine how SIMD vector extensions execute non-contiguous memory loads.

### Standard Contiguous Vector Loads versus Scattered Gather Loads

In traditional SIMD vector execution (such as standard 128-bit SSE or 256-bit AVX vector loads), the CPU reads a single contiguous block of bytes from memory:

```assembly
; Standard Contiguous Vector Load (AVX2)
; Reads 256 contiguous bits (32 bytes) starting at memory address in RAX
vmovdqu ymm0, [rax]
```

Because the target memory address is contiguous, the L1 Data Cache Controller can satisfy the load in a single cache line fill ($64\text{ bytes}$).

However, many advanced algorithms—such as sparse matrix multiplication, database index scans, graphics ray tracing, and hash table lookups—require reading data elements that are scattered randomly across different memory pages:

```text
CONTIGUOUS VECTOR LOAD VS SCATTERED GATHER LOAD

 1. Contiguous Vector Load (vmovdqu):
 Memory: [ Element 0 ][ Element 1 ][ Element 2 ][ Element 3 ]  <-- Single Contiguous Block!
          ▲
          └─ Fetched in 1 Cache Line Read!

 2. Scattered Vector Gather Load (vpgatherdd):
 Memory: [ Element 0 ] ........ [ Element 1 ] ........ [ Element 2 ]  <-- Scattered in RAM!
          ▲                     ▲                      ▲
          └─ Offset 0x100       └─ Offset 0x840        └─ Offset 0x020
          (Requires 8 SEPARATE non-contiguous memory fetches across different pages!)
```

To execute a scattered load in a single assembly instruction, vector ISAs introduced **Vector Gather Instructions** (e.g., `vpgatherdd`, `vpgatherqd`, `vgatherdpd` in x86 AVX2/AVX-512):

```assembly
; Vector Gather Instruction Syntax (x86 AVX2)
; ymm0 = Destination Vector Register (holds 8 32-bit elements)
; [rax + ymm1*4] = Base address in RAX + 8 index offsets in YMM1 multiplied by 4
; ymm2 = Mask Vector Register (specifies which of the 8 elements to load)
vpgatherdd ymm0, [rax + ymm1*4], ymm2
```


## The Gather Buffer and Microarchitectural Vector Leakage

Now we reach the fundamental hardware vulnerability that enables Downfall / Gather Data Sampling: **The Microarchitectural Gather Buffer Array**.

### Hardware Anatomy of the Gather Buffer

The **Gather Buffer** (also known as the *Vector Staging Register Array* or *Gather Reservation Queue*) is an array of internal 256-bit and 512-bit SRAM registers positioned directly between the memory load pipeline and the vector register file (`YMM` / `ZMM` registers).

```text
GATHER BUFFER HARDWARE PLACEMENT

 Memory Load Execution Pipeline (AGUs / L1D Cache Controller)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ INTERNAL GATHER BUFFER ARRAY (256-Bit / 512-Bit SRAM)       │
 │ Slot 0 : [ 256-Bit Staging Payload (Vector Data) ]          │
 │ Slot 1 : [ 256-Bit Staging Payload (Vector Data) ]          │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
 Destination Vector Register (YMM0)   Transient Forwarding Bus (MDS)
 (Architectural State Commitment)     (Speculatively Forwarded to ALU!)
```

#### The Hardware Sharing Invariant:
> **The Shared Gather Buffer Invariant**: The internal Gather Buffer array is **competitively shared across all software execution threads** running on the physical CPU core. Its internal 256-bit and 512-bit registers are **NOT cleared, zeroed, or isolated** when a vector instruction finishes or when execution context switches between threads!


## Why Downfall / GDS Threatens Modern Computing Infrastructure

Gather Data Sampling (Downfall) is considered one of the most severe microarchitectural vulnerabilities discovered in modern processors because of its impact on core software primitives.

```text
DOWNFALL / GDS HIGH-IMPACT THREAT DOMAINS

                         DOWNFALL (GDS) TARGETS
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
 AES-NI & OPENSSL KEYS      STRING & MEMORY FUNCTIONS   VECTOR DATABASE SEARCH
 * OpenSSL vector AES-GCM   * glibc 'memcpy' & 'memcpy' * Vector DB HNSW distance
   keys leaked from YMM     * Linux kernel string copy  * Machine Learning weights
   registers in milliseconds! bytes sampled directly!   leaked from ZMM registers!
```

### 1. Compromise of OpenSSL AES-NI Cryptographic Keys
Modern cryptographic software (such as OpenSSL and Linux kernel IPsec) uses vector AVX2 instructions (`vpgatherdd`, `vpermd`, `vpshufb`) to implement ultra-high-speed AES-GCM encryption.

Because cryptographic keys sit directly inside 256-bit `YMM` vector registers during encryption loops:
* Downfall allows an unprivileged attacker process to sample 256-bit `YMM` registers directly out of the Gather Buffer!
* An attacker can exfiltrate 128-bit and 256-bit AES encryption keys from OpenSSL processes running in adjacent container sandboxes or virtual machines in **less than 100 milliseconds**!


## Hardware and Microcode Mitigations: The Performance Trade-off

To mitigate Gather Data Sampling (Downfall / CVE-2022-40982), CPU manufacturers (Intel) released microcode updates (`MCU`) that alter the microarchitectural behavior of vector gather instructions.

```text
DOWNFALL / GDS HARDWARE AND MICROCODE DEFENSES

                          DOWNFALL MITIGATIONS
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
 MICROCODE GATHER DISABLE / DISAMBIGUATION             COMPILER '-mno-gather' STRIP
 * Microcode update flushes Gather Buffer on completion. * Compiler strips 'vpgatherdd'
 * Disables speculative vector gather execution.          instructions from compiled code!
 * Heavy Performance Penalty: 10% to 50% drop in HPC!   * Avoids microcode speed penalty!
```


### 2. Software Compiler-Level Mitigations (`-mno-gather`)

To avoid the severe $50\%$ microcode performance penalty imposed on gather instructions:
* Software developers and Linux distribution maintainers recompiled performance-critical software using the compiler flag **`-mno-gather`**.
* The compiler **removes all vector gather instructions (`vpgatherdd`) from the generated binary**, replacing them with sequences of standard scalar loads and vector insertion instructions (`vinserti128`).
* While scalar insertion is slightly slower than un-mitigated hardware gathers, it completely avoids the massive $5\times$ microcode mitigation penalty!


## Solved Industrial Engineering Exercise: Quantitative Downfall Vector Sampling, Gather Microcode Timing, and Mitigation Performance Impact Analysis

To consolidate your complete mastery of Gather Data Sampling (Downfall / GDS), internal vector staging buffers, AVX2/AVX-512 gather instruction microcode loops, and microcode mitigation performance penalties, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Single-Sample Collision Probability ($P_{\text{GDS\_collision}}$)

Thread 0 processes $200,000\text{ vector operations per second}$.

Each operation occupies a Gather Buffer slot for $T_{\text{residency}} = 7.50\text{ ns} = 7.50 \times 10^{-9}\text{ seconds}$.

##### 1. Calculate Total Active Gather Buffer Occupancy Fraction ($\text{Duty\_Cycle}_{\text{GB}}$):

$$\text{Total Active GB Time per Sec} = 200,000 \text{ ops/sec} \times 7.50 \times 10^{-9} \text{ sec/op} = 0.001500 \text{ Seconds/Sec}$$

$$\text{Duty\_Cycle}_{\text{GB}} = \mathbf{0.150\% \quad (0.001500 \text{ Probability that a Gather Buffer is Active at any ns})}$$

##### 2. Calculate Single-Sample Hit Probability ($P_{\text{GDS\_collision}}$):
When Thread 1 executes a faulting load, it samples 1 of the 8 Gather Buffer slots at random.

$$P_{\text{GDS\_collision}} = \frac{\text{Duty\_Cycle}_{\text{GB}}}{N_{\text{GB}}} = \frac{0.001500}{8} = \mathbf{0.0001875 \quad (0.01875\% \text{ Chance per Attempt})}$$


#### Step 3: Calculate Downfall Microcode Mitigation Performance Penalty

The HPC application executes $10,000,000\text{ vector gather instructions}$ ($10^7\text{ gathers}$).

##### 1. System 0: Un-Mitigated Execution Time ($T_{\text{exec\_System0}}$):
Each un-mitigated gather instruction takes $T_{\text{gather\_unmitigated}} = 16\text{ CPU clock cycles}$ ($5.00\text{ ns}$):

$$\text{Total Cycles}_{\text{System0}} = 10,000,000 \text{ gathers} \times 16 \text{ cycles/gather} = \mathbf{160,000,000 \text{ CPU Clock Cycles}}$$

$$T_{\text{exec\_System0}} = 160,000,000 \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.05000 \text{ Seconds}} \quad (50.0\text{ ms})$$

##### 2. System 1: Microcode-Mitigated Execution Time ($T_{\text{exec\_System1}}$):
Each microcode-mitigated gather instruction takes $T_{\text{gather\_mitigated}} = 80\text{ CPU clock cycles}$ ($25.00\text{ ns}$):

$$\text{Total Cycles}_{\text{System1}} = 10,000,000 \text{ gathers} \times 80 \text{ cycles/gather} = \mathbf{800,000,000 \text{ CPU Clock Cycles}}$$

$$T_{\text{exec\_System1}} = 800,000,000 \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.25000 \text{ Seconds}} \quad (250.0\text{ ms})$$


### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against CPU design principles:

1. **Sampling Rate Math Verification**:
   * Attempt duration $= 160\text{ cycles} = 50.0\text{ ns}$.
   * Attempts per second $= 1.0 / 50.0 \times 10^{-9} = 20,000,000\text{ attempts/sec}$.
   * Duty cycle $= 200,000 \times 7.5 \times 10^{-9} = 0.00150$.
   * Collision probability $= 0.00150 / 8 = 0.0001875$.
   * Key samples per second $= 20,000,000 \times 0.0001875 = 3,750\text{ samples/sec}$.
   * Exfiltration bandwidth $= 3,750 \times 32\text{ B} = 120,000\text{ B/s} = 117.1875\text{ KB/s}$. Math verified with $100\%$ precision!
2. **Microcode Mitigation Penalty Check**:
   * Un-mitigated cycles $= 16\text{ cycles}$.
   * Mitigated cycles $= 80\text{ cycles}$.
   * Ratio $= 80 / 16 = 5.0\times$ execution time increase ($400\%$ increase).
   * Throughput drop $= (1 - 1/5) \times 100\% = 80.0\%$. Math verified!
3. **SIMD Vector Staging Invariant**:
   * `vpgatherdd` fetches 8 32-bit elements into internal Gather Buffers.
   * Internal Gather Buffers are shared across SMT threads.
   * Un-assisted faulting loads sample Gather Buffer contents prior to ROB exception flush, confirming valid GDS dataflow.

All internal vector staging buffer models, GDS sampling collision probability formulas, microcode gather execution latencies, and $80.0\%$ mitigation throughput loss metrics evaluate with 100% mathematical, physical, and microarchitectural precision.

