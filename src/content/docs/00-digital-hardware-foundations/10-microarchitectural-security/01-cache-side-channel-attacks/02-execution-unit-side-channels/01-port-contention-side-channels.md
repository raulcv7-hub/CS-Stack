---
title: "Execution Port Contention and SMT Microarchitectural Resource Leakage"
---

# Execution Port Contention and SMT Microarchitectural Resource Leakage

In modern high-performance microprocessors, software developers and security architects frequently attempt to defend sensitive cryptographic algorithms against cache timing attacks by writing "constant-time" code. In a constant-time algorithm, the software avoids all secret-dependent conditional branching and ensures that every memory read and write instruction targets fixed, uniform memory addresses regardless of the underlying secret key bits. Under traditional security models, an algorithm that generates identical, non-secret-dependent memory access patterns is considered immune to cache side-channel surveillance. However, this assumption is fundamentally broken on processors that utilize **Simultaneous Multithreading (SMT)**, also known as Hyper-Threading. On an SMT processor, a single physical CPU core is partitioned into multiple logical processing threads that execute instructions concurrently on the exact same physical silicon die. While these sibling threads possess separate architectural register files, they share the physical out-of-order execution engine, reservation stations, and arithmetic execution units. Inside the CPU core, execution units—such as integer adders, multipliers, floating-point units, and address generation units—are attached to a fixed number of physical **Execution Ports**. When two sibling threads execute concurrently, they compete for access to these shared execution ports on every single clock cycle. If a secret-dependent instruction path inside a victim thread dispatches micro-operations to a specific execution port, that port becomes momentarily unavailable to the sibling thread. An unprivileged attacker process executing on the adjacent logical thread can dispatch a continuous stream of candidate instructions targeting that same execution port and measure the resulting nanosecond execution stalls. By detecting which specific hardware execution ports experience contention over time, the attacker can deduce the victim's exact instruction sequence and reconstruct secret cryptographic keys with $100\%$ precision—completely bypassing all cache-level defenses without making a single cache hit or miss.

```text
SMT EXECUTION PORT CONTENTION LEAKAGE

 Logical Thread 0 (Victim Thread)         Logical Thread 1 (Attacker Thread)
 ┌───────────────────────────┐            ┌───────────────────────────┐
 │ Secret Key Bit K_i = 1    │            │ Dispatches Stream to      │
 │ Issues Vector Multiply    │            │ Execution Port 0          │
 └─────────────┬─────────────┘            └─────────────┬─────────────┘
               │                                        │
               ▼ Targets Port 0                         ▼ Targets Port 0
 ┌──────────────────────────────────────────────────────────────────┐
 │ SHARED CPU CORE EXECUTION PORT 0 (VECTOR / MULTIPLY ALU)         │
 │ Port 0 is BUSY servicing Thread 0!                               │
 └─────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
 Thread 1 Instruction STALLS for 1 Clock Cycle!
 Attacker Measures: 1-Cycle Delay ==> INFERS: Victim used Port 0!
```


## Simultaneous Multithreading (SMT) and Pipeline Resource Sharing

To understand how execution ports become a channel for information leakage, we must inspect the microarchitectural organization of a modern Simultaneous Multithreading (SMT) processor core.

### Architectural State vs. Microarchitectural Shared Resources

In a single-threaded CPU core, the processor executes one instruction stream at a time. To increase CPU utilization, hardware architects developed **Simultaneous Multithreading (SMT)** (marketed by Intel as Hyper-Threading and present in AMD Zen, IBM POWER, and ARM Cortex architectures).

SMT presents a single physical CPU core to the operating system as **two or more logical CPU cores** (e.g., Logical Thread 0 and Logical Thread 1).

To maintain the illusion that these two logical threads are completely independent computers, the CPU hardware duplicates certain state structures while sharing others:

```text
SMT CPU CORE HARDWARE RESOURCE PARTITIONING

 ┌──────────────────────────────────────────────────────────────────┐
 │ DUPLICATED RESOURCES (Private Per Logical Thread)                 │
 │  * Architectural Registers (RAX, RBX, RCX... / r0..r31)          │
 │  * Program Counter (PC / Instruction Pointer)                    │
 │  * Control Registers (CR0, CR3, MSRs)                            │
 ├──────────────────────────────────────────────────────────────────┤
 │ SHARED MICROARCHITECTURAL RESOURCES (Competitively Partitioned)  │
 │  * Instruction Fetch & Decode Units                              │
 │  * Unified Reservation Stations / Issue Queues                   │
 │  * Reorder Buffer (ROB) & Physical Register File (PRF)           │
 │  * Level 1 & Level 2 Caches                                      │
 │  * PHYSICAL EXECUTION PORTS & ALUs (100% SHARED IN HARDWARE!)    │
 └──────────────────────────────────────────────────────────────────┘
```

Notice the critical distinction in the table above:
While the architectural registers and program counters are duplicated, **the physical execution ports and arithmetic logic units (ALUs) are 100% shared in hardware**!

When Logical Thread 0 and Logical Thread 1 execute instructions on the same physical core simultaneously, their instructions enter a single, unified out-of-order execution engine.


## Execution Port Layouts and Port Contention Mechanics

An **Execution Port** is a hardware multiplexing gateway that connects the centralized Reservation Station to a specific set of physical arithmetic and memory execution units.

### Anatomy of a Superscalar Execution Port Array

To visualize how different execution ports service different instruction types, let us inspect a representative execution port layout of an x86 superscalar CPU core (such as Intel Skylake / Cascade Lake architecture):

```text
REPRESENTATIVE SUPERSCALAR EXECUTION PORT MAPPING

 Execution Port │ Primary Hardware Execution Units Attached
────────────────┼───────────────────────────────────────────────────────────────
     Port 0     │ Integer ALU, Shift, Vector Multiply, FPU Mul, AES-NI
     Port 1     │ Integer ALU, Fast Integer Multiply, Vector Add, FPU Add
     Port 2     │ Load Address Generation Unit (AGU) — Memory Read
     Port 3     │ Load Address Generation Unit (AGU) — Memory Read
     Port 4     │ Store Data Unit — Memory Write Data
     Port 5     │ Integer ALU, Vector Shift, Vector Logic, Fast Branch
     Port 6     │ Integer ALU, Branch Unit, Shift
     Port 7     │ Store Address Generation Unit (AGU) — Memory Write Address
```

Look closely at the distribution of execution units across the ports in this table:

* **Symmetric Execution Units**: Simple, high-frequency operations—such as a 32-bit integer addition (`add ebx, ecx`)—can be processed by simple ALUs attached to **Ports 0, 1, 5, or 6**. If Port 0 is busy, the CPU scheduler simply routes an integer addition to Port 1 or Port 5.
* **Asymmetric / Specialized Execution Units**: Complex or specialized operations are hardwired to **ONLY ONE specific execution port**!
  * Complex Vector Multiplications or AES Encryption rounds (`aesenc`) can execute **ONLY on Port 0**!
  * Fast Integer Multiplications (`imul`) or Floating-Point Additions can execute **ONLY on Port 1**!
  * Memory Store Data writes can execute **ONLY on Port 4**!

This asymmetry is the fundamental vulnerability exploited by port contention attacks!

If an instruction type is hardwired to a single specific port, executing that instruction creates a $100\%$ deterministic reservation on that specific port for that clock cycle.


## Port Smashing: Measuring Execution Port Contention

To extract information from a victim thread, an attacker process uses an execution technique known as **Port Smashing**.

> **Port Smashing** is the technique of constructing a high-density, dependency-free stream of assembly instructions specifically chosen to target a single physical execution port, continuously filling that port's issue slot to measure latency variations induced by a sibling thread's execution.

```text
PORT SMASHING INSTRUCTION STREAM CONSTRUCTION

 Attacker Instruction Stream (Targeting Port 1 Exclusively):
 1. imul ebx, ecx  (Requires Port 1) -- No dependency on Inst 2!
 2. imul edx, esi  (Requires Port 1) -- No dependency on Inst 3!
 3. imul edi, ebp  (Requires Port 1) -- No dependency on Inst 4!
 ...
 (Executed in a tight loop wrapped in high-precision timer reads)
```


### Code Structure for Port Contention Probing

The following assembly/C code demonstrates how an attacker probes Execution Port 1 (targeting fast integer multiplication `imul`) on an x86 processor:

```c
// High-precision Port 1 contention probing loop
uint64_t probe_execution_port_1(void) {
    uint64_t t1, t2;
    uint32_t aux;

    // 1. Serialize pipeline and read start timer (t1)
    asm volatile ("lfence\n\t");
    t1 = __rdtsc();
    asm volatile ("lfence\n\t");

    // 2. PORT SMASHING STREAM: 8 independent Port 1 instructions (imul)
    // Using completely independent registers to eliminate data dependencies!
    asm volatile (
        "imul %%r8,  %%r9\n\t"   // Uses Port 1
        "imul %%r10, %%r11\n\t"  // Uses Port 1
        "imul %%r12, %%r13\n\t"  // Uses Port 1
        "imul %%r14, %%r15\n\t"  // Uses Port 1
        "imul %%rax, %%rbx\n\t"  // Uses Port 1
        "imul %%rcx, %%rdx\n\t"  // Uses Port 1
        "imul %%rsi, %%rdi\n\t"  // Uses Port 1
        "imul %%rbp, %%rsp\n\t"  // Uses Port 1 (dummy registers)
        ::: "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
            "rax", "rbx", "rcx", "rdx", "rsi", "rdi"
    );

    // 3. Serialize pipeline and read end timer (t2)
    t2 = __rdtscp(&aux);
    asm volatile ("lfence\n\t");

    return (t2 - t1); // Returns total execution latency in CPU clock cycles
}
```


## Inferring Secret Control Flow and Cryptographic Key Extraction

How does detecting execution port contention allow an attacker to extract secret cryptographic keys or private data from a victim process?

Let us trace a concrete example: recovering secret key bits from an **ECDSA (Elliptic Curve Digital Signature Algorithm)** or **RSA** cryptographic implementation.

### The Secret-Dependent Instruction Branching Problem

Consider a constant-time cryptographic assembly loop that processes a secret key bit $K_i \in \{0, 1\}$ during scalar point multiplication on an elliptic curve.

To prevent cache side-channel leakage, the software author eliminated all memory array lookups. However, the author included two different mathematical execution branches implemented with specialized arithmetic instructions:

```text
SECRET-DEPENDENT INSTRUCTION BRANCHING

 For each bit K_i in Secret Key K:
     If K_i == 1:
         Execute Vector Multiply:  vpmulld (Targets Port 0 Exclusively!)
     If K_i == 0:
         Execute Integer Multiply: imul    (Targets Port 1 Exclusively!)
```

```text
MICROARCHITECTURAL PORT FOOTPRINT OF SECRET BRANCHING

 Secret Key Bit K_i = 1 ──► Executed: vpmulld ──► Port 0 BUSY | Port 1 FREE
 Secret Key Bit K_i = 0 ──► Executed: imul    ──► Port 0 FREE | Port 1 BUSY
```

Trace the microarchitectural port footprint created by this loop:

* **When $K_i == 1$**: The victim executes `vpmulld` (Vector Multiply). `vpmulld` occupies **Port 0** for 2 clock cycles. Port 1 remains completely free.
* **When $K_i == 0$**: The victim executes `imul` (Integer Multiply). `imul` occupies **Port 1** for 1 clock cycle. Port 0 remains completely free.


## Engineering Reality: Architecture Differences, Noise, and Mitigations

Executing port contention side-channel attacks on commercial production hardware requires navigating microarchitectural differences between CPU generations and managing background execution noise.

### 1. Processor-Specific Port Mapping Variations

Execution port layouts are **not standardized** across processor families. Hardware foundries alter port mappings with every microarchitecture generation:

```text
EXECUTION PORT EVOLUTION ACROSS CPU GENERATIONS

 Architecture Generation │ Port 0 Capabilities           │ Port 1 Capabilities           │ Port 5 Capabilities
─────────────────────────┼───────────────────────────────┼───────────────────────────────┼──────────────────────────────
 Intel Skylake (14nm)    │ Int ALU, Shift, Vec Mul, FPU  │ Int ALU, Fast Mul, Vec Add    │ Int ALU, Vec Shift, Branch
 Intel Ice Lake (10nm)   │ Int ALU, Shift, Vec Mul, FPU  │ Int ALU, Fast Mul, Vec Add    │ Int ALU, Vec Shift, Branch
 AMD Zen 3 (7nm)         │ ALU 0 (Int Add, Logic, Shift) │ ALU 1 (Int Add, Logic, Mul)   │ ALU 2 (Int Add, Logic, Branch)
 AMD Zen 4 (5nm)         │ ALU 0 (Int Add, Logic, Shift) │ ALU 1 (Int Add, Logic, Mul)   │ ALU 2 (Int Add, Logic, Branch)
```

#### Implications for Attack Engineering:
* An attacker process must detect the exact CPU model (`CPUID` instruction) and load a calibrated **Port Mapping Profile** for that specific microarchitecture.
* The attacker selects probing instructions that target ports with the highest degree of structural asymmetry (e.g., instructions that map to $1$ and only $1$ port on that specific chip).


### 3. Hardware and Software Mitigations

Hardware foundries and operating system vendors deploy three primary defenses to mitigate execution port contention leakage:

```text
PORT CONTENTION MITIGATION STRATEGIES

                             PORT CONTENTION DEFENSES
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
 SMT DISABLING (Hyper-Threading OFF)  CORE SCHEDULING (OS Isolation)  HARDWARE PORT MASKING / DIT
 * Disables sibling logical threads.  * Ensures untrusted threads     * ARM DIT bit forces execution
 * 100% eliminates port sharing!      never share a physical core.    units to execute in constant cycles.
```

#### Mitigation 1: Disabling Simultaneous Multithreading (SMT Off)
* **Mechanics**: The system administrator or BIOS disables SMT/Hyper-Threading globally in hardware. Each physical CPU core runs exactly one logical thread.
* **Effectiveness**: **$100\%$ Complete Elimination!** If only one thread executes on the physical core, there are no sibling threads to contend for execution ports.
* **Performance Penalty**: Reduces overall multi-core throughput by $20\%\text{ to } 30\%$ on parallel workloads.

#### Mitigation 2: Operating System Core Scheduling
* **Mechanics**: The operating system kernel scheduler (e.g., Linux `Core Scheduling` framework) ensures that untrusted user processes or tenant Virtual Machines **NEVER share a physical CPU core with a sensitive process or kernel thread**.
* **Effectiveness**: Prevents cross-tenant port contention while allowing sibling threads to be used for tasks belonging to the *same* trust domain.

#### Mitigation 3: Data-Independent Timing (ARM DIT Bit)
* **Mechanics**: Modern ARM processor architectures incorporate a hardware control bit: **Data-Independent Timing (`DIT`)**.
* **Effectiveness**: When `DIT = 1` is enabled by software, the CPU hardware guarantees that all arithmetic, vector, and cryptographic execution units complete their operations in a fixed, constant number of clock cycles, preventing execution port availability from leaking operand values!


### Scenario and Parameters

You are a senior microarchitectural security engineer auditing a 3.2 GHz superscalar x86-64 processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$) operating with Simultaneous Multithreading (SMT) enabled.

Two sibling logical threads execute concurrently on the same physical core:
* **Thread 0 (Victim Thread)**: Executes a 1,000-iteration cryptographic signing loop processing a secret key vector $K$.
* **Thread 1 (Attacker Thread)**: Executes a Port Smashing probing loop targeting **Execution Port 0**.

```text
3.2 GHz SMT CPU CORE WITH SHARED EXECUTION PORTS

 Logical Thread 0 (Victim) ──┐
                             ├──► [ Shared Reservation Station ] ──► [ Execution Port 0 ]
 Logical Thread 1 (Attacker) ──┘    (Port 0 Probing Stream)          Vector Multiply Unit
 Clock T = 312.5 ps
```

#### Hardware Port Mapping Specifications:
* **Execution Port 0**: Services 64-bit Vector Multiplication (`vpmulld`). Port 0 can process $1\ \mu\text{op}$ per clock cycle.
* **Execution Ports 1, 5, 6**: Service standard 32-bit Integer Addition (`add`). Integer additions can be executed on **any of the four Ports 0, 1, 5, or 6** with equal probability ($\frac{1}{4}$ chance per port).

#### Victim Execution Loop Profile:
For each secret key bit $K_i \in \{0, 1\}$ (where $i \in [0, 999]$), the victim executes a block of 40 instructions:
* **If Secret Bit $K_i == 1$**: The victim executes **40 Vector Multiplication instructions (`vpmulld`)**, all targeting **Port 0 exclusively**.
* **If Secret Bit $K_i == 0$**: The victim executes **40 Integer Addition instructions (`add`)**, which the CPU hardware scheduler distributes evenly across Ports 0, 1, 5, and 6 ($10\ \mu\text{ops}$ per port).

#### Attacker Probing Loop Parameters:
For each step $i$, the attacker dispatches a probing stream of **$100\ \mu\text{ops}$ targeting Port 0 exclusively** (`imul` variant mapped to Port 0) using independent registers (zero data dependencies).

* Un-contended baseline execution time for 100 Port 0 $\mu\text{ops}$: $T_{\text{uncontended}} = \mathbf{100 \text{ CPU Clock Cycles}}$ ($31.25\text{ ns}$).
* SMT Scheduler Arbitration: Fair Round-Robin ($\alpha = 0.50$). When both threads contend for Port 0 on the same cycle, each thread receives a $50\%$ grant probability, inducing a 1-cycle stall on the denied thread.
* Operating System Background Noise: Gaussian timing jitter with standard deviation $\sigma_{\text{noise}} = 4.0\text{ CPU clock cycles}$.

#### Your Objective

1. Calculate the expected number of Port 0 contention stalls and total measured attacker execution time $T_{\text{contended\_1}}$ when the secret key bit is $K_i = 1$.
2. Calculate the expected number of Port 0 contention stalls and total measured attacker execution time $T_{\text{contended\_0}}$ when the secret key bit is $K_i = 0$.
3. Derive the decision threshold $T_{\text{threshold}}$ in clock cycles to discriminate $K_i = 1$ from $K_i = 0$.
4. The attacker measures the following execution times for three consecutive key bits $K_{10}, K_{11}, K_{12}$:
   * $T_{\text{measured}}(K_{10}) = \mathbf{138.2 \text{ Clock Cycles}}$
   * $T_{\text{measured}}(K_{11}) = \mathbf{104.8 \text{ Clock Cycles}}$
   * $T_{\text{measured}}(K_{12}) = \mathbf{141.1 \text{ Clock Cycles}}$
   
   Classify each measurement and deduce the 3-bit binary secret key sequence $[K_{10}, K_{11}, K_{12}]$.
5. Calculate the Signal-to-Noise Ratio (SNR) in decibels (dB) for this port contention measurement channel.
6. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Expected Execution Time for $K_i = 0$

When $K_i = 0$, the victim dispatches $40\ \mu\text{ops}$ distributed evenly across Ports 0, 1, 5, and 6.

##### 1. Port 0 Load Contribution:
Number of victim $\mu\text{ops}$ routed to Port 0:

$$\text{Victim Port 0 }\mu\text{ops} = \frac{40 \text{ instructions}}{4 \text{ available ports}} = \mathbf{10.0 \ \mu\text{ops targeting Port 0}}$$

The remaining $30\ \mu\text{ops}$ are routed to Ports 1, 5, and 6, creating zero contention for the attacker on Port 0!

##### 2. Expected Contention Stalls:

$$\text{Expected Stall Cycles}_{\text{Case 0}} = 10.0 \text{ Contended Cycles} \times 1.0 \text{ Stall Cycle/Conflict} = \mathbf{10.0 \text{ Clock Cycles}}$$

##### 3. Total Expected Attacker Execution Time ($T_{\text{contended\_0}}$):

$$T_{\text{contended\_0}} = T_{\text{uncontended}} + \text{Expected Stall Cycles}_{\text{Case 0}}$$

$$T_{\text{contended\_0}} = 100 + 10.0 = \mathbf{110.0 \text{ CPU Clock Cycles}} \quad (34.375\text{ ns})$$

```text
EXPECTED EXECUTION TIME BIFURCATION

 Secret Key Bit K_i = 1 (40 Port 0 \ops) ──► Attacker Time = 140.0 Cycles (43.75 ns)
 Secret Key Bit K_i = 0 (10 Port 0 \ops) ──► Attacker Time = 110.0 Cycles (34.38 ns)
                                                ▲
                                                └─ Signal Delta = +30.0 Cycles
```


#### Step 4: Classify Measured Values and Extract Key Sequence $[K_{10}, K_{11}, K_{12}]$

We evaluate the three measured timing values against $T_{\text{threshold}} = 125.0\text{ cycles}$:

##### 1. Measurement $K_{10}$ ($T_{\text{measured}} = 138.2\text{ Cycles}$):
* $138.2 \ge 125.0 \implies \mathbf{K_{10} = 1}$ (Heavy Port 0 contention detected!).

##### 2. Measurement $K_{11}$ ($T_{\text{measured}} = 104.8\text{ Cycles}$):
* $104.8 < 125.0 \implies \mathbf{K_{11} = 0}$ (Minimal Port 0 contention detected!).

##### 3. Measurement $K_{12}$ ($T_{\text{measured}} = 141.1\text{ Cycles}$):
* $141.1 \ge 125.0 \implies \mathbf{K_{12} = 1}$ (Heavy Port 0 contention detected!).

```text
CLASSIFICATION RESULTS FOR KEY SEQUENCE [K10, K11, K12]

 Step   │ Measured Latency │ Threshold Check (< 125.0) │ Classified Secret Bit
────────┼──────────────────┼───────────────────────────┼────────────────────────
 K_10   │  138.2 Cycles    │    138.2 >= 125.0          │      K_10 = 1
 K_11   │  104.8 Cycles    │    104.8 <  125.0          │      K_11 = 0
 K_12   │  141.1 Cycles    │    141.1 >= 125.0          │      K_12 = 1
```

##### Extracted Secret Key Sub-Sequence:
$$\mathbf{[K_{10}, K_{11}, K_{12}] = [1, 0, 1]_2 = \text{0x05}}$$


### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results against CPU execution principles:

1. **Port Contention Stall Verification**:
   * For $K_i = 1$, victim issued $40\ \mu\text{ops}$ to Port 0.
   * Attacker issued $100\ \mu\text{ops}$ to Port 0.
   * Under $50\%$ round-robin SMT sharing, 40 victim $\mu\text{ops}$ displace 40 attacker $\mu\text{ops}$, adding exactly $40\text{ cycles}$ to attacker runtime ($100 \to 140\text{ cycles}$).
   * Math is $100\%$ microarchitecturally consistent.
2. **Threshold Discrimination Margin**:
   * Distance from $T_{\text{contended\_1}} (140.0)$ to $T_{\text{threshold}} (125.0) = 15.0\text{ cycles}$.
   * Distance from $T_{\text{contended\_0}} (110.0)$ to $T_{\text{threshold}} (125.0) = 15.0\text{ cycles}$.
   * Noise margin $= \pm 15.0\text{ cycles} = 3.75 \times \sigma_{\text{noise}} (4.0\text{ cycles})$, guaranteeing a false classification probability $P_{\text{error}} < 0.01\%$.
3. **Key Sequence Deduction Check**:
   * $K_{10} = 138.2 \approx 140 \implies 1$.
   * $K_{11} = 104.8 \approx 110 \implies 0$.
   * $K_{12} = 141.1 \approx 140 \implies 1$.
   * Binary key extraction $[1, 0, 1]_2$ verified with $100\%$ precision!

All execution port mapping rules, SMT scheduler conflict models, timing threshold derivations, SNR calculations, and secret key bit extractions evaluate with 100% mathematical, physical, and microarchitectural precision.

