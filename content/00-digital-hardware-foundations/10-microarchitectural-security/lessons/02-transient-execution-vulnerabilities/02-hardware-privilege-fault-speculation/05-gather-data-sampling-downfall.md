content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/02-transient-execution-vulnerabilities/02-hardware-privilege-fault-speculation/05-gather-data-sampling-downfall.md
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

---

## The Multi-Item Grocery Picker and the Shared Sorting Cart

To build an intuitive, crystal-clear mental model of how Gather Data Sampling (Downfall) extracts wide vector registers from internal CPU hardware buffers, let us consider an everyday analogy: a high-speed automated order fulfillment warehouse.

Imagine a large commercial warehouse (a physical CPU core) where workers prepare customer orders. In the warehouse, goods are stored on high shelves across miles of aisles (Main System Memory / Caches). Most workers carry small hand baskets that can hold only one item at a time (Standard Scalar Load Instructions).

However, to handle large, complex orders efficiently, the warehouse employs a specialized **Multi-Item Grocery Picker** (The SIMD Vector Gather Unit).

When a customer submits a complex order asking for 8 different items stored at 8 completely different aisle locations (a 256-bit Vector Gather Instruction fetching 8 scattered 32-bit integers), the Multi-Item Picker drives a specialized **Shared Sorting Cart** (The Internal Gather Buffer) through the warehouse:
1. The shared sorting cart contains 8 individual bin compartments (a 256-bit staging register split into 8 32-bit slots).
2. Because the picker cannot be in 8 aisles at once, the picker drives to Aisle 1, grabs Item 1, and drops it into Bin 1. Then the picker drives to Aisle 2, grabs Item 2, and drops it into Bin 2...
3. Once all 8 bins are filled, the picker dumps all 8 items together into a final shipping crate (**The Destination `YMM` Vector Register**) and hands it to the customer.

```text
THE MULTI-ITEM SORTING CART ANALOGY

 Multi-Item Picker (Vector Gather Unit)      Shared Sorting Cart (Gather Buffer)
 ┌───────────────────────────────────┐       ┌───────────────────────────────┐
 │ Fetches Item 1 from Aisle 1 ──────┼──────►│ Bin 1 │ Bin 2 │ Bin 3 │ ...   │
 │ Fetches Item 2 from Aisle 2 ──────┼──────►│ (Holds intermediate items)    │
 └───────────────────────────────────┘       └──────────────┬────────────────┘
                                                            │
                                                            ▼ Dumps 8 items together
                                             [ Final 256-Bit Shipping Crate ]
```

Now, notice the critical operational flaw in the warehouse:
The shared sorting cart is **competitively shared among all workers in the warehouse** (all execution threads sharing the CPU core).

When a VIP customer (the Victim Kernel / Cryptographic Thread) submits a high-security order containing **8 secret master keys** (a 256-bit AES-NI or AVX vector key):
1. The Multi-Item Picker collects the 8 secret master keys, places them into the 8 bins of the shared sorting cart, packs the VIP customer's shipping crate, and sends it out.
2. **THE CATASTROPHIC OVERSIGHT**: When the picker finishes the VIP order, **they DO NOT wipe down or clean out the 8 bins of the shared sorting cart**! The 8 secret master keys leave smudges and residual traces inside the 8 bins of the cart!

Now, watch how an unprivileged prankster (the Attacker Thread) executes a **Gather Data Sampling (Downfall) Attack**:

1. The prankster arrives right behind the VIP picker and submits a dummy multi-item order asking for 8 random items (**Executing a Vector Gather Instruction**).
2. The picker grabs the same shared sorting cart.
3. **The Transient Leakage Event**: While the picker is driving to the aisles to fetch the prankster's new items, the prankster's assistant (the Out-of-Order Speculative Execution Pipeline) reaches into the 8 bins of the shared sorting cart **BEFORE the new items arrive**!
4. The assistant inspects the lingering smudges inside Bin 3, reading the VIP customer's **Secret Master Key #3 ($S = 42$)**!
5. The assistant runs over to the lobby refreshment counter (the L1 Data Cache), grabs **Snack #42** (a Chocolate Bar), and places it on the counter.
6. The warehouse manager arrives, detects a paperwork error on the prankster's dummy order, and cancels the order (**Pipeline Flush / Exception Trap**).
7. **The Leak**: The prankster's dummy order is canceled, but **Snack #42 is STILL sitting on the lobby refreshment counter**! The prankster's accomplice inspects the counter, sees Snack #42, and reads the VIP customer's secret master key!

```text
DOWNFALL ATTACK EXECUTION IN THE WAREHOUSE

 VIP Picker packs 8 Secret Master Keys ──► Leaves smudges in Shared Sorting Cart
 Prankster submits dummy order ─────────► Assistant reaches into Cart BEFORE new items!
                                         ──► Reads Secret Key #42!
                                         ──► Places Snack #42 on Lobby Counter!
                                         │
                                         ▼
 Manager cancels order (Pipeline Flush) ──► Dummy order canceled!
                                         ──► BUT Snack #42 STAYS ON COUNTER!
 (Prankster reads Snack #42 -> Exfiltrates VIP Customer's Secret Master Key!)
```

Look at what the prankster accomplished:
* The prankster never broke into the VIP customer's private storage locker.
* The prankster's dummy order was canceled by the warehouse manager.
* Yet, because the warehouse used a **shared, un-cleared sorting cart for multi-item gather operations**, the prankster sampled the wide vector data left behind by the VIP customer!
* The prankster exfiltrated full 256-bit vector registers without ever breaking operating system memory isolation!

This warehouse scenario is the exact physical analogue of **Gather Data Sampling (Downfall / GDS)**:
* The VIP customer is the **Victim Kernel / Enclave / Cryptographic Thread**.
* The prankster is the **Attacker Thread**.
* The 8 secret master keys are a **256-bit AVX2 / AVX-512 Vector Register (`YMM`/`ZMM`)**.
* The Multi-Item Picker is the **Hardware Vector Gather Unit**.
* The shared sorting cart is the internal **Microarchitectural Gather Buffer**.
* The assistant reaching into the cart is **Speculative Buffer Data Forwarding**.
* Placing Snack #42 on the lobby counter is **`probe_array[secret * 64]` (L1D Cache Line Fill)**.
* The warehouse manager canceling the order is the **Reorder Buffer (ROB) Pipeline Flush**.
* The accomplice inspecting the counter is the **Flush+Reload Cache Side-Channel Probe**.

---

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

---

### The Iterative Microcode Gather Loop

Because a physical silicon die cannot read 8 or 16 different memory locations across different cache lines simultaneously, the CPU's instruction decoder decomposes a single `vpgatherdd` instruction into a **multi-cycle iterative microcode loop**.

```text
ITERATIVE VECTOR GATHER EXECUTION FLOW

 vpgatherdd ymm0, [rax + ymm1*4], ymm2 (Gather 8 32-bit Elements)
                       │
                       ▼ Microcode Execution Loop
 ┌─────────────────────────────────────────────────────────────┐
 │ For Element i = 0 to 7:                                     │
 │  * Check Mask Bit ymm2[i]                                   │
 │  * If Mask Bit == 1:                                        │
 │    1. Compute Element Address: Addr_i = RAX + (YMM1[i] * 4) │
 │    2. Read 32-bit Word from Addr_i                          │
 │    3. Store Word into Internal Gather Buffer Slot i!        │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ All 8 Elements Collected
 Assemble Gather Buffer contents into YMM0 Destination Register!
```

#### Step-by-Step Microcode Gather Loop Execution:
1. **Mask Check**: The gather unit inspects mask register `YMM2`. Each bit in `YMM2` specifies whether the corresponding vector slot should be loaded ($1$) or skipped ($0$).
2. **Iterative Address Generation**: For each active slot $i \in [0, 7]$:
   * The gather unit extracts index $i$ from `YMM1[i]`.
   * An Address Generation Unit (AGU) calculates physical address $A_i = \text{RAX} + (\text{YMM1}[i] \times 4)$.
3. **Element Staging inside the Gather Buffer**: The 32-bit word read from $A_i$ is written into **Slot $i$ of the internal microarchitectural Gather Buffer**.
4. **Completion Assembly**: Once all active elements have been fetched and staged inside the Gather Buffer, the gather unit writes the complete 256-bit payload from the Gather Buffer into destination register `YMM0`.

---

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

---

### The Downfall / GDS Speculative Forwarding Mechanism

When a CPU core executes a speculative load instruction—or an un-assisted faulting load instruction—while stale vector data sits inside the shared Gather Buffer:

```text
DOWNFALL / GDS TRANSIENT FORWARDING DATAPATH

 Faulting Load Instruction: mov al, [faulting_address]
                       │
                       ▼ Memory Pipeline Execution
 ┌─────────────────────────────────────────────────────────────┐
 │ MMU / Exception Unit Detects Fault (#PF or Microcode Assist)│
 │ Schedules Exception Trap in 20 Clock Cycles!                │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ BUT THE MEMORY EXECUTION UNIT DOES NOT WAIT!
 ┌─────────────────────────────────────────────────────────────┐
 │ GATHER BUFFER TRANSIENT FORWARDING ENGINE                   │
 │ Reads stale 256-bit vector payload sitting in Gather Buffer!│
 │ FORWARDS STALE VECTOR PAYLOAD TO PIPELINE OPERAND BUS!     │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Speculatively dispatches: mov bl, [probe_array + rax * 64]
 Line (secret_vector_byte) of probe_array is loaded into L1D Cache!
               │
               ▼ ROB Exception Flush (20 Cycles)
 Registers Cleared! BUT probe_array Line STAYS IN L1 DATA CACHE!
```

#### Trace the Step-by-Step Downfall Leakage Sequence:

1. **Victim Vector Activity (Stage 1)**:
   A victim thread (such as an OpenSSL AES-GCM encryption routine or a kernel cryptographic driver) executes an AVX2 or AVX-512 vector operation (such as `vpgatherdd` or `vpermd`).
   * The victim's 256-bit secret vector key ($V_{\text{secret}}$) passes through the internal **Gather Buffer**.
   * The victim completes its execution. Secret vector $V_{\text{secret}}$ remains resident in the internal Gather Buffer array.
2. **Attacker Faulting Load (Stage 2)**:
   The attacker process (running as an SMT sibling thread or co-located process) dispatches an un-assisted load instruction targeting an unmapped or unprivileged address (`faulting_address`):
   ```assembly
   mov al, byte ptr [faulting_address]
   ```
3. **Speculative Vector Forwarding (Stage 3 — THE GDS VULNERABILITY!)**:
   * The MMU detects a Page Fault (`#PF`) on `faulting_address` and schedules an exception trap in 20 clock cycles.
   * While waiting for the exception trap to fire, the memory execution unit **reads the stale 256-bit vector payload ($V_{\text{secret}}$) currently sitting in the Gather Buffer**!
   * The memory unit writes $V_{\text{secret}}$ directly onto the internal pipeline forwarding bus into destination register `RAX`!
4. **Transient Exfiltration (Stage 4)**:
   * The attacker's speculative code extracts byte $S$ from `RAX` ($S \in V_{\text{secret}}$).
   * The attacker speculatively executes a dependent load:
     $$\text{mov rbx, byte ptr [probe\_array} + \text{rax} \times 64]$$
   * Line $S$ of `probe_array` is fetched into the Level 1 Data Cache!
5. **ROB Flush & Cache Recovery (Stage 5)**:
   * The Page Fault `#PF` fires, flushing the pipeline and clearing register `RAX`.
   * The attacker reloads `probe_array` using Flush+Reload, measuring an L1 Cache Hit on line $S$ and recovering 8 bits of the victim's 256-bit vector register!
6. **Iteration Across Vector Offsets**: By repeating this sampling loop and adjusting vector element offsets, the attacker reconstructs the **entire 256-bit or 512-bit vector register** in a fraction of a millisecond!

---

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

---

### 2. Leakage from `glibc` Memory and String Functions (`memcpy` / `strcmp`)
To achieve maximum memory copying speed, the GNU C Library (`glibc`) implements standard functions like `memcpy()`, `memmove()`, `strcpy()`, and `strcmp()` using wide 256-bit AVX2 vector instructions.

Whenever any application or operating system kernel copies password strings, SSL certificates, or user credentials using `memcpy()`:
* The data passes through 256-bit vector registers and internal Gather Buffers.
* Downfall samples raw `memcpy()` data buffers directly from the Gather Buffer, allowing an attacker to capture **plaintext user passwords and private keys** as they are copied across system memory!

---

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

---

### 1. Microcode Mitigation (`IA32_MCU_OPT_CTRL` / Gather Speculation Disable)

The primary hardware-level mitigation released by Intel is a microcode update that alters the execution pipeline for all vector gather instructions (`vpgatherdd`, `vpgatherqd`, `vgatherdpd`, `vgatherqps`, etc.):

#### Hardware Microcode Action:
1. **Gather Buffer Clearing**: On completion of every vector gather instruction, the CPU microcode automatically **clears and zeroes out all 256-bit and 512-bit staging registers inside the internal Gather Buffer**.
2. **Disabling Speculative Gather Forwarding**: The microcode disables speculative data forwarding from the Gather Buffer to downstream instructions during un-assisted or faulting load operations.

#### The Severe Performance Penalty ($10\%\text{ to } 50\%$ Overhead):
Because clearing the Gather Buffer and disabling speculative gather pipelines forces gather instructions to execute in a strict, serial, non-speculative mode:
* Vector gather instruction performance **drops by up to $5\times \text{ to } 10\times$**!
* High-Performance Computing (HPC) workloads, 3D graphics rendering, video encoding (HEVC/AV1), and vector database search engines experience overall system performance degradation ranging from **$10\%\text{ to } 50\%$**!

---

### 2. Software Compiler-Level Mitigations (`-mno-gather`)

To avoid the severe $50\%$ microcode performance penalty imposed on gather instructions:
* Software developers and Linux distribution maintainers recompiled performance-critical software using the compiler flag **`-mno-gather`**.
* The compiler **removes all vector gather instructions (`vpgatherdd`) from the generated binary**, replacing them with sequences of standard scalar loads and vector insertion instructions (`vinserti128`).
* While scalar insertion is slightly slower than un-mitigated hardware gathers, it completely avoids the massive $5\times$ microcode mitigation penalty!

---

## Comparative Taxonomy of Microarchitectural Fault Speculation

The following comprehensive matrix compares the four primary hardware privilege fault speculation vulnerabilities:

```text
HARDWARE PRIVILEGE FAULT SPECULATION VULNERABILITY TAXONOMY

 Vulnerability Name │ Primary Target Structure   │ Injected / Sampled Payload │ Core Mitigation
────────────────────┼────────────────────────────┼────────────────────────────┼─────────────────────────────────
 Meltdown (ROP)     │ L1 Data Cache (L1D)        │ Kernel Memory Byte         │ KPTI / Hardware U/S Enforcement
 Foreshadow (L1TF)  │ L1 Data Cache (L1D)        │ Enclave / Host Physical RAM│ PTE Inversion / IA32_FLUSH_CMD
 MDS (ZombieLoad)   │ Line Fill Buffers (LFB)    │ 64-Byte Cache Line Payload │ VERW / MD_CLEAR Buffer Flush
 Downfall (GDS)     │ Vector Gather Buffers (GB) │ 256B/512B Vector Register  │ Microcode Gather Spec-Disable
```

---

## Solved Industrial Engineering Exercise: Quantitative Downfall Vector Sampling, Gather Microcode Timing, and Mitigation Performance Impact Analysis

To consolidate your complete mastery of Gather Data Sampling (Downfall / GDS), internal vector staging buffers, AVX2/AVX-512 gather instruction microcode loops, and microcode mitigation performance penalties, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal microarchitectural performance engineer auditing a $3.2\text{ GHz}$ 64-bit multi-core server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$) operating with AVX2 $256\text{-bit}$ vector execution units.

The CPU core runs two SMT sibling threads:
* **Thread 0 (Victim Cryptographic Thread)**: Executes an OpenSSL AES-256 vector encryption loop utilizing 256-bit `YMM` registers (`vpermd` and `vpgatherdd` instructions) to process 256-bit secret key blocks ($32\text{ bytes}$ per key block).
* **Thread 1 (Attacker Thread)**: Executes a Downfall (GDS) sampling loop attempting to sample 256-bit vector key payloads from the shared internal Gather Buffer.

```text
3.2 GHz SMT CPU CORE WITH SHARED GATHER BUFFER (256-BIT AVX2)

 Thread 0 (Victim AES-256) ──► [ Shared Internal Gather Buffer ] ◄── Thread 1 (Attacker GDS)
 200k Vector Ops / Sec         256-Bit Vector Staging Array         Sampling Loop @ 3.2 GHz
 Clock T = 312.5 ps
```

#### Microarchitectural Hardware Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
* Gather Buffer Capacity: $N_{\text{GB}} = 8\text{ staging slots}$ ($256\text{ bits}$ / $32\text{ bytes}$ per slot).
* Single Gather Buffer Slot Residency Duration ($T_{\text{residency}}$): Time a $256\text{-bit}$ vector payload sits inside a Gather Buffer entry during gather execution: $T_{\text{residency}} = 24\text{ CPU clock cycles}$ ($7.50\text{ ns}$).
* Un-mitigated `vpgatherdd` Execution Latency (8 32-bit elements): $T_{\text{gather\_unmitigated}} = 16\text{ CPU clock cycles}$ ($5.00\text{ ns}$).
* Microcode-Mitigated `vpgatherdd` Execution Latency (with Gather Buffer clearing): $T_{\text{gather\_mitigated}} = 80\text{ CPU clock cycles}$ ($25.00\text{ ns}$).
* Attacker GDS Sampling Loop Duration: $T_{\text{sample\_loop}} = 160\text{ CPU clock cycles}$ ($50.00\text{ ns}$) per faulting load attempt.

#### The Workload Test Task:
Thread 0 processes $200,000\text{ vector key blocks per second}$. An HPC scientific application on the same core executes **$10,000,000\text{ vector gather instructions per second}$**.

#### Your Objective

1. Calculate the single-sample collision probability $P_{\text{GDS\_collision}}$ that a single faulting load executed by Thread 1 samples Thread 0's secret 256-bit vector key from the Gather Buffer.
2. Calculate the raw vector sampling rate $R_{\text{GDS\_sample}}$ (in 256-bit vector samples per second) and net secret key exfiltration bandwidth (in Kilobytes per second) achieved by Thread 1.
3. Calculate the total execution time (in seconds) required for the HPC application to execute 10,000,000 vector gather instructions under:
   * **System 0**: Un-mitigated hardware gather execution ($16\text{ cycles/gather}$).
   * **System 1**: Microcode-mitigated hardware gather execution ($80\text{ cycles/gather}$).
4. Calculate the percentage performance penalty imposed on the HPC application by the Downfall microcode mitigation.
5. Verify mathematical, structural, and timing correctness.

---

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

---

#### Step 2: Calculate Raw GDS Sampling Rate and Secret Exfiltration Bandwidth

Thread 1 executes its GDS sampling loop every $160\text{ CPU clock cycles}$ ($T_{\text{sample\_loop}} = 50.0\text{ ns} = 50.0 \times 10^{-9}\text{ s}$).

##### 1. Calculate Attacker Sampling Attempts per Second ($N_{\text{attempts}}$):

$$N_{\text{attempts}} = \frac{1.0 \text{ Second}}{50.0 \times 10^{-9} \text{ s/attempt}} = \mathbf{20,000,000 \text{ Sampling Attempts / Second}}$$

The attacker executes **$20\text{ million}$ faulting loads per second**!

##### 2. Calculate Successful 256-Bit Vector Key Samples per Second ($R_{\text{vector\_samples}}$):

$$R_{\text{vector\_samples}} = N_{\text{attempts}} \times P_{\text{GDS\_collision}}$$

$$R_{\text{vector\_samples}} = 20,000,000 \text{ attempts/sec} \times 0.0001875 \text{ hits/attempt} = \mathbf{3,750 \text{ Vector Samples / Second}}$$

##### 3. Calculate Net Exfiltration Bandwidth ($R_{\text{exfil\_KB}}$):
Each 256-bit vector sample carries $32\text{ bytes}$ of key payload.

$$\text{Total Bytes Exfiltrated} = 3,750 \text{ samples/sec} \times 32 \text{ Bytes/sample} = 120,000 \text{ Bytes/Second}$$

In Kilobytes per second:

$$R_{\text{exfil\_KB}} = \frac{120,000 \text{ Bytes/sec}}{1,024 \text{ Bytes/KB}} \approx \mathbf{117.1875 \text{ KB / Second}} \quad (117.19\text{ KB/s})$$

##### Microarchitectural Result:
The attacker exfiltrates **$117.19\text{ Kilobytes of secret vector register data per second}$** ($3,750$ 256-bit vector keys per second) across SMT sibling thread boundaries!

```text
GDS / DOWNFALL EXFILTRATION RATE SUMMARY

 Attacker Sampling Attempts : 20,000,000 Attempts / Second (20 MHz)
 Single-Sample Collision Prob: 0.01875% Chance per Attempt
 Successful 256-Bit Samples : 3,750 Vector Registers / Second
 Net Key Exfiltration Speed : 117.19 KB / Second (120,000 Bytes/sec)
 (Attacker captures a 256-bit AES key in 0.26 milliseconds!)
```

---

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

---

#### Step 4: Calculate Mitigation Performance Penalty Percentage

$$\text{Execution Delay Increase} = T_{\text{exec\_System1}} - T_{\text{exec\_System0}} = 250.0\text{ ms} - 50.0\text{ ms} = \mathbf{200.0 \text{ Milliseconds Added}}$$

$$\text{Performance Penalty \%} = \left( \frac{T_{\text{exec\_System1}} - T_{\text{exec\_System0}}}{T_{\text{exec\_System0}}} \right) \times 100\% = \left( \frac{250.0 - 50.0}{50.0} \right) \times 100\%$$

$$\text{Performance Penalty \%} = \left( \frac{200.0}{50.0} \right) \times 100\% = \mathbf{400.0\% \text{ Execution Time Increase (5x Slowdown!)}}$$

$$\text{Throughput Loss \%} = \left( 1 - \frac{T_{\text{exec\_System0}}}{T_{\text{exec\_System1}}} \right) \times 100\% = \left( 1 - \frac{50.0\text{ ms}}{250.0\text{ ms}} \right) \times 100\% = \mathbf{80.0\% \text{ Throughput Loss!}}$$

```text
DOWNFALL MICROCODE MITIGATION PERFORMANCE SUMMARY

 Parameter Metric             │ System 0 (Un-mitigated) │ System 1 (Microcode Mitigated)
──────────────────────────────┼─────────────────────────┼─────────────────────────────────
 Gather Instruction Latency   │ 16 CPU Clock Cycles     │ 80 CPU Clock Cycles (5x Slowdown)
 Total Execution Time (10M)   │ 50.0 Milliseconds       │ 250.0 Milliseconds (200ms Added)
 Relative Performance Factor  │ 1.00x (Baseline)        │ 0.20x (80% Throughput Loss!)
 Downfall GDS Security State  │ VULNERABLE              │ 100% PROTECTED!
```

##### Engineering Conclusion:
Applying the Downfall microcode update to mitigate Gather Data Sampling completely secured the CPU core, but imposed a **$5\times$ slowdown ($80.0\%$ throughput loss)** on vector gather instructions, demonstrating the massive performance cost of fixing microarchitectural buffer hardware flaws in software microcode!

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Gather Data Sampling (Downfall / GDS)**: A transient execution vulnerability (CVE-2022-40982) where an un-assisted or faulting load instruction speculatively reads 128-bit, 256-bit, or 512-bit vector register payloads from internal microarchitectural Gather Buffers left behind by SIMD vector gather instructions (`vpgatherdd`).
* **Vector buffer transient leakage**: The hardware memory pipeline behavior where intermediate staging registers used by SIMD vector execution units (Gather Buffers / Vector Staging Arrays) are competitively shared across SMT threads and fail to clear their contents upon instruction completion, allowing transient loads to forward wide vector data across security contexts.
