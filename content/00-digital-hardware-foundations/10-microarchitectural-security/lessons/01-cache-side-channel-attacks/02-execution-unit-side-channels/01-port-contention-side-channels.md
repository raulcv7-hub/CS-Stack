content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/01-cache-side-channel-attacks/02-execution-unit-side-channels/01-port-contention-side-channels.md
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

---

## The Shared Kitchen and the Baking Roommates

To build an intuitive, crystal-clear mental model of how execution port contention leaks secret information without touching the cache hierarchy, let us step away from silicon microchips and consider an everyday analogy: two roommates sharing a single apartment kitchen.

Imagine two roommates, Alice (the Victim) and Bob (the Attacker), who live in the same apartment. Alice and Bob share a single physical kitchen (a physical CPU core). Within this kitchen, there are two distinct counter areas representing two independent working spaces (two logical SMT threads).

Alice and Bob do not share any food, ingredients, or storage containers. All of Alice's private ingredients are locked inside her own personal cooler, and Bob cannot see what Alice is cooking (Zero Shared Memory / No Cache Leakage). Furthermore, Alice works behind a privacy screen in the kitchen. Bob cannot see Alice's hands or watch her movements.

However, the kitchen contains a fixed set of **shared specialized appliances** sitting on a central counter that both Alice and Bob must use to cook their meals:
* **Appliance 0**: A High-Speed Blender (Execution Port 0 - Vector / Multiplication Unit).
* **Appliance 1**: An Electric Hand Mixer (Execution Port 1 - Integer ALU).
* **Appliance 2**: A Microwave Oven (Execution Port 2 - Address Generation Unit / Load Port).
* **Appliance 3**: A Toaster (Execution Port 3 - Store Port).

```text
THE SHARED KITCHEN APPLIANCE METAPHOR

 Alice's Workspace (Thread 0)                 Bob's Workspace (Thread 1)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Private Ingredients (Regs)│                │ Private Ingredients (Regs)│
 └─────────────┬─────────────┘                └─────────────┬─────────────┘
               │                                            │
               ▼                                            ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ SHARED CENTRAL COUNTER APPLIANCES (EXECUTION PORTS)                    │
 │ [Appliance 0: Blender] [Appliance 1: Mixer] [Appliance 2: Microwave]   │
 └────────────────────────────────────────────────────────────────────────┘
```

Alice is preparing a secret recipe (a private cryptographic key execution path). Depending on a secret number in her recipe book, Alice prepares her meal using different cooking techniques:
* **Recipe Step A (Secret Bit = 1)**: Alice must use the **High-Speed Blender (Appliance 0)** to puree ingredients.
* **Recipe Step B (Secret Bit = 0)**: Alice skips the blender and uses the **Electric Hand Mixer (Appliance 1)** instead.

Bob wants to discover Alice's secret recipe without looking behind the privacy screen. Bob devises an ingenious surveillance strategy based purely on **appliance contention delays**:

1. Every single second, Bob reaches out his hand to press the power button on the **High-Speed Blender (Appliance 0)** to blend a glass of water.
2. Bob measures how long it takes for his glass of water to blend:
   * **Scenario 1 (No Delay / Fast Start)**: Bob reaches out, presses the Blender button, and it turns on instantly in **0 seconds**. Bob thinks: *"Appliance 0 was completely free! Alice was NOT using the Blender at this second! Therefore, Alice must be executing Recipe Step B (Secret Bit = 0)!"*
   * **Scenario 2 (Contention Delay / Stalled Start)**: Bob reaches out to press the Blender button, but finds Alice's hand already pressing the button! Bob is forced to wait **1 second** for Alice to finish before he can press the button. Bob measures a 1-second delay! Bob thinks: *"Appliance 0 was busy! Alice was using the Blender at this exact second! Therefore, Alice MUST be executing Recipe Step A (Secret Bit = 1)!"*

```text
APPLIANCE CONTENTION TIMING DELTA

 Bob Attempts to Use Blender (Appliance 0)
 ┌──────────────────────────────────────────────────────────┐
 │ Scenario 1: Blender Free  ──► 0-Sec Delay ──► Bit = 0     │
 ├──────────────────────────────────────────────────────────┤
 │ Scenario 2: Blender Busy  ──► 1-Sec Delay ──► Bit = 1     │
 └──────────────────────────────────────────────────────────┘
 (Bob deduced Alice's secret recipe without looking behind the screen!)
```

Look at what Bob accomplished:
* Bob never looked behind Alice's privacy screen.
* Bob never touched Alice's private ingredients or storage containers.
* Bob simply attempted to use a shared physical appliance (Appliance 0) and measured whether his own access was delayed by 1 second!
* The 1-second appliance contention delay exposed Alice's secret cooking decision with $100\%$ mathematical certainty!

This shared kitchen scenario is the exact physical analogue of **Execution Port Contention in SMT Processors**:
* Alice is the **Victim Software Thread**.
* Bob is the **Attacker Software Thread**.
* The shared kitchen is the **Physical CPU Core**.
* Alice's and Bob's private workspaces are the **Logical Thread Architectural Registers**.
* The shared appliances (Blender, Mixer, Microwave) are the **Physical Execution Ports** (Port 0, Port 1, Port 2).
* Bob measuring a 1-second delay on the Blender is the **Attacker measuring a 1-cycle execution stall on Port 0**.

---

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

---

### Out-of-Order Instruction Scheduling and Execution Ports

Modern superscalar CPU cores do not execute assembly instructions in rigid sequential order. Instead, an instruction fetch unit reads macro-instructions from memory, a decoder translates them into simpler RISC-like operations called **Micro-Operations ($\mu\text{ops}$)**, and a register renaming unit maps architectural registers to a large physical register file.

Once decoded, $\mu\text{ops}$ enter a centralized hardware scheduling buffer known as the **Reservation Station (RS)** or **Issue Queue**.

```text
SUPERSCALAR OUT-OF-ORDER EXECUTION ENGINE DATAPATH

 Thread 0 \ops ──┐
                  ├──► [ Unified Reservation Station ]
 Thread 1 \ops ──┘    (Holds \ops waiting for execution ports)
                             │
                             ▼ Out-of-Order Dispatcher
 ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
 │ Port 0                    │ Port 1                    │ Port 5                    │
 │ [Vector ALU / Int Mul]    │ [Integer ALU / FPU Add]   │ [Integer ALU / Branch]    │
 └───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

The Reservation Station acts as a dynamic holding area. A $\mu\text{op}$ sitting inside the Reservation Station is dispatched to an execution unit on a given clock cycle if and only if two physical conditions are satisfied:

$$\text{Dispatch Ready} \iff (\text{Source Operands Ready in PRF}) \quad \mathbf{\text{AND}} \quad (\text{Target Execution Port is FREE})$$

1. **Operand Availability**: All input operands required by the $\mu\text{op}$ have been calculated by previous instructions and reside inside the Physical Register File (PRF).
2. **Port Availability**: The specific physical **Execution Port** required to execute that $\text{uop}$'s operation is completely un-occupied during that clock cycle.

---

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

---

### The Mathematics of Port Contention Stalls

Let us model the execution cycle of the CPU scheduler when two SMT sibling threads (Thread 0 and Thread 1) attempt to dispatch instructions on the exact same clock cycle $t$.

Suppose Thread 0 (the Victim) has a ready $\mu\text{op}$ ($\mu\text{op}_{\text{vic}}$) that requires **Execution Port $P_k$** on clock cycle $t$.

Simultaneously, Thread 1 (the Attacker) has a ready $\mu\text{op}$ ($\mu\text{op}_{\text{att}}$) sitting in the Reservation Station that *also* requires **Execution Port $P_k$** on clock cycle $t$.

Because Port $P_k$ contains only one physical input bus, the hardware scheduler must enforce mutual exclusion:

$$\text{Port Grant}(P_k, t) = \begin{cases} \mu\text{op}_{\text{vic}} & \text{with probability } \alpha \\ \mu\text{op}_{\text{att}} & \text{with probability } (1 - \alpha) \end{cases}$$

Where:
* $\alpha \in [0.0, 1.0]$ is the hardware arbitration weight assigned by the CPU scheduler (typically $\alpha = 0.5$ for fair round-robin thread scheduling).

```text
PORT CONTENTION SCHEDULER CONFLICT

 Clock Cycle t:
 Thread 0 \op_vic (Requires Port 0) ──┐
                                     ├──► [ Port 0 Arbiter ] ──► Grants \op_vic to Port 0!
 Thread 1 \op_att (Requires Port 0) ──┘                           \op_att STALLED until Cycle t+1!
```

If the hardware scheduler grants Port $P_k$ to Thread 0 ($\mu\text{op}_{\text{vic}}$):
1. Thread 0's instruction enters Port $P_k$ and begins execution on cycle $t$.
2. Thread 1's instruction ($\mu\text{op}_{\text{att}}$) is **denied access** to Port $P_k$ for cycle $t$.
3. Thread 1's instruction remains trapped inside the Reservation Station for an extra clock cycle.
4. Thread 1 experiences a **1-Clock Cycle Execution Stall**!

$$\text{Stall}_{\text{att}}(P_k, t) = 1 \text{ Clock Cycle}$$

This 1-cycle stall is a physical measurement signal! If Thread 1 measures the total time required to execute a loop of its own Port $P_k$ instructions, every stall induced by Thread 0 adds exactly 1 clock cycle to Thread 1's total execution timer!

---

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

---

### Constructing a High-Fidelity Port Probing Loop

To construct an effective Port Smashing loop targeting Port $P_k$, the attacker's assembly code must satisfy three strict microarchitectural requirements:

#### Requirement 1: Single-Port Specificity
The probing instructions must be hardwired in CPU silicon to execute on **Port $P_k$ alone**. If the CPU can route the instruction to Port $P_k$ or Port $P_j$, the scheduler will avoid contention by routing around the busy port, destroying the measurement signal!

#### Requirement 2: Zero Internal Data Dependencies
The probing instructions must use **independent registers** so that no instruction in the stream waits for the output of a prior instruction. 

If Instruction 2 depends on Instruction 1 (`imul eax, ebx` followed by `imul ecx, eax`), Instruction 2 will stall on register data availability ($T_{\text{latency}} \approx 3\text{ cycles}$), rather than stalling on port contention!

#### Requirement 3: Pipeline Serialization
The measurement loop must be wrapped between high-precision time-stamp counter reads (`RDTSCP` / `LFENCE`) to prevent out-of-order execution from reordering the probing instructions past the timer.

---

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

---

### Mathematical Signal Analysis: Un-Contended vs Contended Execution

Let us evaluate the measured clock cycles ($T_{\text{measured}}$) returned by the probing function above under two operating states:

#### Scenario A: Un-Contended Execution (Victim Idle on Port 1)
When the victim thread is executing instructions that do not use Port 1 (or is idle):
* All 8 `imul` instructions in the probing stream find Port 1 completely open on consecutive clock cycles.
* The 8 instructions issue on 8 consecutive cycles ($8\text{ cycles}$).
* Adding timer overhead ($T_{\text{timer\_overhead}} \approx 20\text{ cycles}$):

$$T_{\text{uncontended}} = 8 + T_{\text{timer\_overhead}} \approx 8 + 20 = \mathbf{28 \text{ Clock Cycles}}$$

#### Scenario B: Contended Execution (Victim Active on Port 1)
When the victim thread is simultaneously executing instructions that target Port 1 (e.g., executing a cryptographic scalar multiplication step):
* The hardware scheduler alternates between issuing the victim's $\mu\text{ops}$ and the attacker's $\mu\text{ops}$ on Port 1.
* Each of the 8 `imul` instructions in the attacker's stream experiences a 1-cycle or 2-cycle scheduling stall waiting for the victim to release Port 1.
* The 8 instructions take $16\text{ cycles}$ to issue across Port 1.

$$T_{\text{contended}} = 16 + T_{\text{timer\_overhead}} \approx 16 + 20 = \mathbf{36 \text{ Clock Cycles}}$$

```text
PORT 1 PROBING TIMING SIGNAL CONTRAST

 Measured Execution Latency (Cycles)
 28 Cycles  ├─────────────────────────► UN-CONTENDED (Victim NOT using Port 1!)
            │
 36 Cycles  ├──────────────────────────────────────► CONTENDED (Victim IS using Port 1!)
            ▲
            └─ Decision Threshold = 32 Cycles
```

$$\text{Port Contention Signal Delta } \Delta T = T_{\text{contended}} - T_{\text{uncontended}} = 36 - 28 = \mathbf{8 \text{ Clock Cycles}}$$

By comparing the measured latency $T_{\text{measured}}$ against a decision threshold ($T_{\text{threshold}} \approx 32\text{ cycles}$):
* $T_{\text{measured}} \ge 32 \text{ Cycles} \implies \mathbf{\text{VICTIM IS EXECUTING PORT 1 INSTRUCTIONS}}$
* $T_{\text{measured}} < 32 \text{ Cycles} \implies \mathbf{\text{VICTIM IS NOT EXECUTING PORT 1 INSTRUCTIONS}}$

---

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

---

### Real-Time Dual-Port Probing Trace

An attacker thread running on the sibling SMT core executes two interleaved probing streams: one targeting Port 0 (`vpmulld` probes) and one targeting Port 1 (`imul` probes).

As the victim processes secret key bits $K_0, K_1, K_2, K_3$, the attacker captures the following timing trace:

```text
REAL-TIME DUAL-PORT CONTENTION TRACE

 Time Step (Bit i) │ Port 0 Delay (Cycles) │ Port 1 Delay (Cycles) │ Inferred Secret Key Bit K_i
───────────────────┼───────────────────────┼───────────────────────┼─────────────────────────────
   Step 0 (K_0)    │   +8 Cycles (BUSY!)   │   +0 Cycles (Free)    │         Bit K_0 = 1
   Step 1 (K_1)    │   +0 Cycles (Free)    │   +8 Cycles (BUSY!)   │         Bit K_1 = 0
   Step 2 (K_2)    │   +0 Cycles (Free)    │   +8 Cycles (BUSY!)   │         Bit K_2 = 0
   Step 3 (K_3)    │   +8 Cycles (BUSY!)   │   +0 Cycles (Free)    │         Bit K_3 = 1
```

##### Secret Key Reconstruction Result:
By measuring which execution port experienced contention during each step, the attacker reconstructed the exact secret key sequence:

$$\mathbf{K = [1, 0, 0, 1]_2 = \text{0x09}}$$

Look at the extraordinary nature of this security breach:
1. The victim software used **zero secret-dependent memory lookups** (100% cache-hit uniform memory footprint).
2. The victim software used **zero secret-dependent memory branches** that alter code addresses.
3. Yet, the secret key $K = 01001_2$ was extracted with $100\%$ accuracy purely by measuring **nanosecond port contention on shared SMT execution units**!

---

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

---

### 2. SMT Cross-Thread Interference vs. Cache Side Channels

It is crucial to compare port contention attacks against traditional cache-based side-channel attacks:

```text
PORT CONTENTION VS CACHE SIDE-CHANNEL COMPARISON MATRIX

 Attack Property            │ Cache Side Channels (Flush+Reload / P+P) │ Port Contention Attacks (Port Smashing)
────────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────────────
 Shared Memory Requirement  │ Required for Flush+Reload (mmap)         │ ZERO Shared Memory Required!
 Cache State Dependence     │ Dependent on L1/L2/L3 Hits and Misses    │ $100\%$ Independent of Cache States!
 Bypasses Cache Partitioning│ NO (Blocked by Intel CAT / Way Locking)  │ YES! Bypasses all cache partitioning!
 Execution Concurrency      │ Sequential (Flush -> Victim -> Reload)   │ Simultaneous (Attacker & Victim run SMT!)
 Target Microarchitecture   │ Shared L1/L2/L3 Cache Memory Lines       │ Shared ALU/FPU Execution Ports & Pipelines
```

#### Key Advantage of Port Contention:
Port contention attacks bypass **ALL** cache-level security defenses (such as Intel CAT, ScatterCache, or Cache Way Locking)! Even if an administrator completely isolates the victim's cache ways in hardware, the victim and attacker still share the physical execution ports if they run on the same physical SMT core.

---

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

---

## Solved Industrial Engineering Exercise: Quantitative Port Contention Timing Analysis, Contention Probability, and Key Extraction

To consolidate your complete mastery of execution port contention, SMT pipeline resource sharing, port smashing probing loops, and secret key reconstruction math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate Expected Execution Time for $K_i = 1$

When $K_i = 1$, the victim dispatches $40\ \mu\text{ops}$ to **Port 0 exclusively**.

The attacker dispatches $100\ \mu\text{ops}$ to **Port 0 exclusively**.

##### 1. Port Contention Probability:
Both threads are attempting to saturate Port 0 simultaneously during the overlapping execution window ($40\text{ cycles}$).

Under fair SMT round-robin scheduling ($\alpha = 0.50$), each of the victim's $40\ \mu\text{ops}$ contends directly with one of the attacker's $\mu\text{ops}$ on Port 0.

Every contended cycle causes the attacker to stall for **1 additional clock cycle** while the victim's $\mu\text{op}$ executes:

$$\text{Expected Stall Cycles}_{\text{Case 1}} = 40 \text{ Contended Cycles} \times 1.0 \text{ Stall Cycle/Conflict} = \mathbf{40.0 \text{ Clock Cycles}}$$

##### 2. Total Expected Attacker Execution Time ($T_{\text{contended\_1}}$):

$$T_{\text{contended\_1}} = T_{\text{uncontended}} + \text{Expected Stall Cycles}_{\text{Case 1}}$$

$$T_{\text{contended\_1}} = 100 + 40.0 = \mathbf{140.0 \text{ CPU Clock Cycles}} \quad (43.75\text{ ns})$$

---

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

---

#### Step 3: Derive Decision Threshold $T_{\text{threshold}}$

The decision threshold $T_{\text{threshold}}$ separating $K_i = 1$ from $K_i = 0$ is set at the midpoint between $T_{\text{contended\_1}}$ and $T_{\text{contended\_0}}$:

$$T_{\text{threshold}} = \frac{T_{\text{contended\_1}} + T_{\text{contended\_0}}}{2} = \frac{140.0 + 110.0}{2} = \frac{250.0}{2} = \mathbf{125.0 \text{ CPU Clock Cycles}}$$

In physical nanoseconds ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{threshold\_ns}} = 125.0 \times 0.3125 \text{ ns} = \mathbf{39.0625 \text{ Nanoseconds}}$$

* $T_{\text{measured}} \ge 125.0 \text{ Cycles} \implies \mathbf{\text{CLASSIFIED AS } K_i = 1}$
* $T_{\text{measured}} < 125.0 \text{ Cycles} \implies \mathbf{\text{CLASSIFIED AS } K_i = 0}$

---

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

---

#### Step 5: Calculate Signal-to-Noise Ratio (SNR) in Decibels

The Signal Delta ($\Delta T$) between $K_i = 1$ and $K_i = 0$ is:

$$\Delta T = T_{\text{contended\_1}} - T_{\text{contended\_0}} = 140.0 - 110.0 = \mathbf{30.0 \text{ CPU Clock Cycles}}$$

Given Gaussian execution noise standard deviation $\sigma_{\text{noise}} = 4.0\text{ cycles}$:

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{\Delta T}{\sigma_{\text{noise}}} \right)$$

$$\text{SNR}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{30.0}{4.0} \right) = 20 \cdot \log_{10}(7.5) = 20 \times 0.87506 = \mathbf{17.50 \text{ dB}}$$

An SNR of **$17.50\text{ dB}$** represents an exceptionally strong, low-noise measurement channel with classification accuracy exceeding **$99.99\%$**!

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Execution port contention**: A microarchitectural timing side-channel vulnerability where sibling threads sharing a physical SMT core compete for access to specialized execution units (ALUs, FPUs, AGUs) attached to fixed execution ports, enabling an observer to detect port availability delays and infer victim instruction choices without cache access.
* **SMT resource leakage**: The hardware information security exposure arising from simultaneous multithreading architectures where logical threads share hardware pipeline structures (reservation stations, execution ports, register files), allowing unprivileged processes to measure resource allocation conflicts and extract private data across logical thread boundaries.
