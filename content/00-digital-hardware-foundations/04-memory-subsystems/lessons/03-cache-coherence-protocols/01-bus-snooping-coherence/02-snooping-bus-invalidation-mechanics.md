content/00-digital-hardware-foundations/04-memory-subsystems/lessons/03-cache-coherence-protocols/01-bus-snooping-coherence/02-snooping-bus-invalidation-mechanics.md
# Bus Snooping Mechanics and Invalidation Signal Propagation

## The Interconnect Broadcast Saturation Problem and Snooping Snooze Filters

In multi-core computing architectures, individual processor cores are equipped with private, high-speed Level 1 (L1) Static RAM (SRAM) data caches to deliver sub-nanosecond $1\text{-cycle}$ data access latencies. However, when multiple cores execute concurrent threads that share a single, unified main memory address space, private caches can easily fall into an **incoherent state**. If Core 0 updates a shared variable in its private L1 cache while Core 1 retains an old copy of that variable in its own L1 cache, Core 1 will continue reading stale data, leading to catastrophic software state corruption.

To maintain system correctness, multi-core memory systems must enforce the **Single-Writer Multiple-Reader (SWMR) Invariant**:

$$\text{At any instant in time for address } A \text{:}$$
$$\text{Either } \mathbf{\text{One Core has Exclusive Write Access}} \quad \text{OR} \quad \mathbf{\text{Multiple Cores have Read-Only Access}}$$

To enforce this rule, whenever Core 0 wants to execute a store instruction modifying a shared cache line, it must first notify all other cores holding a copy of that line to clear their local valid bits ($Valid \Leftarrow 0$).

However, how this notification is communicated across the shared memory interconnect presents a severe hardware engineering challenge: **The Interconnect Broadcast Saturation Problem**.

Consider what would happen if a multi-core processor used a naive query protocol where **EVERY SINGLE MEMORY ACCESS**—both reads (loads) and writes (stores)—had to broadcast a query across the shared memory bus to ask every other core if they hold the address:

```text
THE NAIVE BROADCAST QUERY FLOODING DISASTER

 Core 0 Executes LOAD A ──► Broadcasts Query A across Bus to Cores 1, 2, 3!
 Core 1 Executes LOAD B ──► Broadcasts Query B across Bus to Cores 0, 2, 3!
 Core 2 Executes LOAD C ──► Broadcasts Query C across Bus to Cores 0, 1, 3!
 Core 3 Executes LOAD D ──► Broadcasts Query D across Bus to Cores 0, 1, 2!
 (Memory interconnect bus is 100% FLOODED with continuous query traffic!)
```

Let us quantify this interconnect flood:
* If four CPU cores each execute $1.0\text{ billion instructions per second}$ ($1.0\text{ GHz}$), and $30\%$ of those instructions are memory reads or writes, the four cores generate **1,200,000,000 memory accesses per second**.
* If every access requires broadcasting a query across the bus, the memory interconnect is bombarded with **1.2 billion broadcast messages per second**!
* Interconnect bus arbitration queues overflow, dynamic power dissipation spikes, and the CPU pipeline freezes, waiting for bus access on almost every single instruction!

Why should a read operation that hits on a local, un-modified cache line generate any bus traffic at all when no other core is trying to modify that address?

To eliminate unnecessary bus query traffic while maintaining strict coherence correctness, computer architects use **Bus Snooping** and **Bus Invalidation Signal Propagation**.

Under a Bus Snooping architecture:
1. **Silent Read Hits**: Read operations ($LOADs$) that hit on clean, local L1 cache lines complete in $1\text{ clock cycle}$ in total silence. They generate **$0\text{ bits}$ of bus traffic**!
2. **Selective Write Broadcasts**: When a core needs to write to a shared line, it broadcasts a lightweight, single-cycle **Bus Invalidation Signal (`BUS_INV`)** across the shared interconnect.
3. **Passive Hardware Snooping**: Every private L1 cache controller continuously "snoops" (eavesdrops on) the shared bus address lines in the background. If a snooped address matches a line in its local SRAM array, the local snooper clears its Valid bit ($Valid \Leftarrow 0$) in a single clock cycle, without interrupting the local CPU pipeline!

Understanding the mechanics of Bus Snooping, the physical design of duplicate snoop tag arrays, the distinction between Invalidate (`BUS_INV`) and Read-For-Ownership (`BUS_RFO`) transactions, and the trade-offs of write-invalidation versus write-update protocols is essential for mastering multi-core hardware design.

---

## The Public Loudspeaker System: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of bus snooping and invalidation signal propagation before inspecting gate-level hardware schematics and bus arbitration chronologies, let us consider an everyday analogy: **The Corporate Office and the Intercom Loudspeaker**.

Imagine an office building with four executive workers: Worker 0 (**Core 0**), Worker 1 (**Core 1**), Worker 2 (**Core 2**), and Worker 3 (**Core 3**). Each worker sits in a private office with a desk notepad (**Private L1 Data Cache**).

```text
THE CORPORATE OFFICE INTERCOM METAPHOR

 Worker 0 Office (Core 0)             Worker 1 Office (Core 1)
 ┌──────────────────────┐             ┌──────────────────────┐
 │ Private Desk Notepad │             │ Private Desk Notepad │
 └──────────┬───────────┘             └──────────┬───────────┘
            │                                    │
            ▼                                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │ CENTRAL INTERCOM LOUDSPEAKER BUS                         │
 │ (Public Announcement System)                             │
 └──────────────────────────────────────────────────────────┘
```

The four workers share access to company rulebooks stored in a central hallway library (**Main System DRAM Memory**). To work at high speed, each worker copies pages from the rulebooks onto their personal desk notepads.

Let us compare two different communication policies for keeping their desk notepads synchronized:

---

### Policy 1: The Constant Intercom Interruption Policy (Naive Query Broadcast)

The office manager installs a mandatory intercom rule: *"Every single time you look at a sentence on your desk notepad, you MUST press the intercom button and ask the entire building if anyone else is reading that same sentence!"*

Look at what happens during the workday under Policy 1:
* Worker 0 reads Sentence 1 on their notepad $\implies$ Shouts on intercom: *"Is anyone reading Sentence 1?"*
* Worker 1 reads Sentence 5 on their notepad $\implies$ Shouts on intercom: *"Is anyone reading Sentence 5?"*
* The intercom is buzzing with noisy announcements 500 times a minute!
* All four workers spend their entire day listening to intercom noise and answering queries instead of doing real work.

This is the **Interconnect Broadcast Saturation Problem**.

---

### Policy 2: The Passive Snooping and Invalidation Policy (Bus Snooping & Invalidation)

The office manager replaces the noisy policy with a **Passive Snooping and Invalidation Protocol**:

1. **Silent Reads**: Any worker can read pages from their own desk notepad in **complete silence**. They do NOT press the intercom button! Zero intercom noise is generated.
2. **The Edit Announcement (Bus Invalidation Signal)**: When Worker 0 decides to **edit or rewrite Rulebook Page #42**, Worker 0 presses the intercom button ONCE and shouts a short message:
   
   $$\text{"ATTENTION EVERYONE: INVALIDATE RULEBOOK PAGE #42!"}$$

3. **Passive Snooping**: Workers 1, 2, and 3 do **not** stop working or talk back over the intercom. They simply listen passively to the loudspeaker in the background (**Snooping**).
4. **Local Erasure**:
   * Worker 1 hears *"Invalidate Page #42"*, glances at their desk notepad, sees they have a copy of Page #42, and **erases it immediately**!
   * Worker 2 glances at their notepad, sees they do NOT have Page #42, and ignores the announcement!
   * Worker 3 glances at their notepad, sees they do NOT have Page #42, and ignores the announcement!

```text
PASSIVE SNOOPING AND INVALIDATION TIMELINE

 Worker 0 presses Intercom: "INVALIDATE PAGE #42!"
                             │
                             ▼ (Announcement heard in all offices)
 Worker 1 checks notepad ──► HAS PAGE #42!  ──► Erases Page #42 immediately!
 Worker 2 checks notepad ──► NO PAGE #42   ──► Does nothing! Continues working.
 Worker 3 checks notepad ──► NO PAGE #42   ──► Does nothing! Continues working.
```

Look at what Policy 2 achieves:
* **$99\%$ Reduction in Intercom Traffic**: Reading notes from desk notepads generates **zero intercom traffic**.
* **Instant Invalidation**: Worker 1's copy of Page #42 was erased in 1 second, guaranteeing that Worker 1 will never read outdated rules!
* **Zero Disruption to Uninvolved Workers**: Workers 2 and 3 did not drop their pens or stop working. They checked their notes in the background in a fraction of a second.

This passive intercom system is the exact physical analogue of **Bus Snooping and Invalidation Signals**:
* The four workers are **CPU Core 0, Core 1, Core 2, Core 3**.
* The desk notepads are **Private L1 SRAM Data Caches**.
* The intercom speaker system is the **Shared Memory Interconnect Bus**.
* Shouting *"Invalidate Page #42"* is a **Bus Invalidation Signal (`BUS_INV`)**.
* Listening passively to the speaker is **Bus Snooping**.
* Erasing Page #42 from the notepad is **Setting the Local Cache Line Valid Bit to $0$ ($V \Leftarrow 0$)**.

---

## Primitive 1: Bus Snooping Architecture

Now that we possess a clear intuitive mental model of passive intercom listening, let us examine the formal engineering mechanics of **Bus Snooping Architecture**.

> **Bus Snooping** is a hardware coherence control mechanism where every private L1 cache controller contains a dedicated monitoring sub-circuit—the **Bus Snooper**—connected directly to the shared memory bus address lines. The Bus Snooper continuously eavesdrops on all address and command transactions broadcast across the bus by other cores, comparing snooped addresses against its local SRAM Tag array in real time.

```text
BUS SNOOPING HARDWARE ARCHITECTURE (4-CORE SHARED BUS)

 Core 0 L1 Cache            Core 1 L1 Cache            Core 2 L1 Cache
 ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
 │ Bus Snooper 0│           │ Bus Snooper 1│           │ Bus Snooper 2│
 └──────┬───────┘           └──────┬───────┘           └──────┬───────┘
        │                          │                          │
 ═══════╧══════════════════════════╧══════════════════════════╧════════
                      SHARED SNOOPING MEMORY BUS
 (All Address and Command Broadcasts Monitored by Every Snooper in Real Time!)
```

---

### The Dual-Port Tag Array Hazard and Duplicate Snoop Tags

To implement bus snooping in physical silicon, hardware architects must solve a critical structural pipeline conflict: **The Tag Port Collision Hazard**.

Consider what happens inside Core 1's L1 Data Cache on a given clock cycle:
1. Core 1's CPU pipeline executes a local load instruction (`LOAD R1, [0x2000]`). The pipeline needs to read Core 1's **L1 SRAM Tag Array** to verify if `0x2000` is a cache hit.
2. On the **EXACT SAME CLOCK CYCLE**, Core 0 broadcasts a bus invalidation request (`BUS_INV 0x4000`) across the shared bus!
3. Core 1's Bus Snooper needs to read Core 1's **L1 SRAM Tag Array** at the exact same physical instant to check if Core 1 holds `0x4000`!

```text
TAG PORT COLLISION HAZARD (SINGLE-PORTED TAG ARRAY)

 CPU Pipeline Load (Read Tag for 0x2000) ──┐
                                          ├──► [ L1 SRAM TAG ARRAY ] ──► PORT COLLISION!
 Bus Snooper (Check Tag for 0x4000)     ──┘    (Single Access Port)    (Pipeline Stalled!)
```

If the L1 Cache SRAM array has only one read port, the local CPU pipeline and the external Bus Snooper will **collide over access to the Tag array**! 

Either the local CPU pipeline must be stalled every time another core broadcasts a bus message, or the Bus Snooper must miss bus messages, breaking cache coherence!

#### The Hardware Solution: Duplicate Snoop Tag Arrays
To eliminate tag port collisions, high-performance processors build **Duplicate Snoop Tag Arrays** (also called **Snoop Tags** or **Back-Face Tags**):

```text
DUPLICATE SNOOP TAG ARCHITECTURE (ZERO PORT COLLISIONS)

 CPU Pipeline (Load 0x2000) ────────► [ Primary L1 Tag Array ] ──► 1-Cycle L1 Hit/Miss
                                      (Read Port 1: Dedicated)

 Shared Bus (Snooped 0x4000) ───────► [ Duplicate Snoop Tag Array ] ──► Invalidate V=0
                                      (Read Port 2: Dedicated)
 (Both Tag lookups execute simultaneously on the exact same clock cycle!)
```

Every L1 Data Cache maintains **two identical copies of its Tag bits**:
1. **Primary Tag Array**: Dedicated exclusively to serving read and write requests from the local CPU execution pipeline.
2. **Duplicate Snoop Tag Array**: Dedicated exclusively to serving address checks from the external Bus Snooper.

Whenever the local CPU modifies a tag or allocates a new line, the update is written to **both tag arrays simultaneously**. 

Because the Bus Snooper reads the Duplicate Snoop Tag Array, external bus snooping executes with **zero port contention and zero stall delays** introduced to the local CPU core!

---

## Primitive 2: Bus Invalidation Signal Mechanics (`BUS_INV` vs `BUS_RFO`)

Now let us examine the second core primitive: **The Bus Invalidation Signal**.

When a core needs to write to a memory location, it must enforce the Single-Writer Multiple-Reader (SWMR) invariant by ensuring that all other private cache copies of that line are invalidated ($Valid \Leftarrow 0$).

Depending on whether the writing core already holds a read-only copy of the target cache line, the memory controller broadcasts one of two distinct bus invalidation transaction types:
1. **Bus Invalidate (`BUS_INV`)**: Used during a **Write Upgrade**.
2. **Read-For-Ownership (`BUS_RFO`)**: Used during a **Write Miss**.

```text
BUS INVALIDATION TRANSACTION TYPES

                Core Intends to Execute Store Operation
                                   │
                    Is Line Present in Local L1 Cache?
                                   │
                         ┌─────────┴─────────┐
                         │ YES               │ NO
                         ▼                   ▼
                    WRITE UPGRADE       WRITE MISS
                         │                   │
                         ▼                   ▼
                   Broadcast `BUS_INV`   Broadcast `BUS_RFO`
                   (Address Only!)      (Address + Line Fetch)
```

---

### Transaction 1: Bus Invalidate (`BUS_INV` — Write Upgrade)

A **Bus Invalidate (`BUS_INV`)** transaction is issued when Core 0 executes a store instruction to an address $A$ that **ALREADY exists in Core 0's L1 cache in a Read-Only Shared state** ($V_0 = 1, D_0 = 0$).

#### Hardware Execution Steps for `BUS_INV`:
1. **Permission Request**: Core 0 already holds the 64-byte data payload for line $A$. It does **NOT** need main DRAM to send the data payload again! Core 0 only needs **Write Permission**.
2. **Lightweight Address Broadcast**: Core 0 requests bus control and broadcasts a lightweight `BUS_INV(A)` command across the interconnect. The transaction transmits **ONLY the physical address $A$**—zero data payload bytes are sent over the bus!
3. **Parallel Snooping & Invalidation**:
   * All other cores (Core 1, Core 2, Core 3) snoop `BUS_INV(A)` on the shared bus.
   * Each snooper checks its Duplicate Tag Array.
   * If Core $k$ holds line $A$, it sets its local Valid bit to zero (**$V_k \Leftarrow 0$**) in a single clock cycle!
4. **Upgrade to Exclusive**: Core 0 receives the bus grant, upgrades its local cache line state to **Exclusive Modified ($D_0 \Leftarrow 1$)**, and writes the new store data into its local SRAM array in $1\text{ clock cycle}$.

```text
BUS_INV (WRITE UPGRADE) TRANSACTION TIMELINE

 Core 0 holds Line A (Read-Only) ──► Broadcasts BUS_INV(A) [Address Only!]
                                           │
                                           ▼ (Snooped by All Cores)
 Cores 1, 2, 3 check Snoop Tags  ──► Set V = 0 for Line A (Invalidated!)
                                           │
                                           ▼
 Core 0 Upgrades Line A to Modified ──► Writes payload locally in 1 Cycle!
 (Minimal Bus Traffic! Zero Data Bytes Transmitted on Bus!)
```

#### Why `BUS_INV` Is Extremely Bandwidth-Efficient:
Because Core 0 already had the 64-byte data payload, `BUS_INV` transmits only a 64-bit address header across the bus ($8\text{ bytes}$ instead of $64\text{ bytes}$). Interconnect bandwidth consumption is reduced by **$87.5\%$** compared to a full line transfer!

---

### Transaction 2: Read-For-Ownership (`BUS_RFO` — Write Miss)

A **Read-For-Ownership (`BUS_RFO`)** transaction is issued when Core 0 executes a store instruction to an address $A$ that is **NOT present in Core 0's L1 cache** (a Write Miss).

#### Hardware Execution Steps for `BUS_RFO`:
1. **Combined Data & Permission Request**: Core 0 needs the 64-byte data payload *AND* exclusive write permission simultaneously.
2. **Broadcast Command**: Core 0 requests bus control and broadcasts a `BUS_RFO(A)` command across the interconnect.
3. **Parallel Invalidation & Data Supply**:
   * All other cores snoop `BUS_RFO(A)`. Any core holding line $A$ invalidates its local copy ($V_k \Leftarrow 0$).
   * If another core (e.g., Core 2) held line $A$ in a Modified/Dirty state, Core 2 intercepts the request, supplies the modified 64-byte line directly to Core 0 over the bus (**Inter-Cache Line Transfer / Intervention**), and clears its own dirty state.
   * If no core held a modified copy, shared L2 memory or main DRAM supplies the 64-byte line to Core 0.
4. **Exclusive Allocation**: Core 0 receives the 64-byte line, writes it into its L1 SRAM array, sets $V_0 = 1$ and $D_0 = 1$, merges the CPU's store payload into the line, and resumes CPU pipeline execution.

```text
BUS_RFO (READ-FOR-OWNERSHIP) TRANSACTION TIMELINE

 Core 0 Misses on Store to Addr A ──► Broadcasts BUS_RFO(A) on Bus
                                            │
                                            ▼ (Snooped by All Cores)
 Cores 1, 2, 3 Invalidate Line A ──► Core 2 (if Dirty) or DRAM supplies 64B Line
                                            │
                                            ▼
 Core 0 Receives Line A           ──► Writes Line A to SRAM, sets V=1, D=1!
```

---

## Write-Invalidate versus Write-Update Coherence Protocols

When designing a bus snooping coherence protocol, hardware architects must choose between two fundamental coherence paradigms: **Write-Invalidate** and **Write-Update (Write-Broadcast)**.

```text
WRITE-INVALIDATE VS WRITE-UPDATE PROTOCOL COMPARISON

 Write-Invalidate Protocol (Industry Standard):
 Core 0 Writes A ──► Broadcasts `BUS_INV(A)` ONCE ──► Cores 1, 2 Invalidate (V=0)
 Core 0 executes 1,000 subsequent writes to A in L1 SRAM with ZERO BUS TRAFFIC!

 Write-Update Protocol (Rare / Obsolete):
 Core 0 Writes A ──► Broadcasts New Data Payload A across Bus on EVERY SINGLE WRITE!
 Cores 1, 2 update their local SRAM copies instead of invalidating.
 (Generates massive, un-scalable bus traffic for repeated local writes!)
```

---

### 1. Write-Invalidate Protocols (The Industry Standard)
* **Mechanics**: When Core 0 writes to line $A$, it broadcasts an invalidation signal (`BUS_INV`). All other cores erase their local copies ($V \Leftarrow 0$).
* **Subsequent Writes**: Once other cores are invalidated, Core 0 holds **Exclusive Ownership** of line $A$. Core 0 can now execute $1,000$ or $1,000,000$ subsequent writes to line $A$ inside its local L1 SRAM cache with **ZERO additional bus transactions**!
* **Why Write-Invalidate Won the Industry**:
  Because software programs exhibit heavy **temporal locality in writes** (e.g., updating a loop counter variable repeatedly in an inner loop), invalidating other copies on the *first* write allows all subsequent writes to execute locally at full $1\text{-cycle}$ SRAM speeds without touching the bus!

---

### 2. Write-Update / Write-Broadcast Protocols (Obsolete)
* **Mechanics**: When Core 0 writes to line $A$, it does *not* invalidate other cores. Instead, it broadcasts the **new data payload** across the memory bus on every single store instruction! Other cores snoop the new data and update their local L1 SRAM arrays in place.
* **The Fatal Flaw**: If Core 0 writes to line $A$ 1,000 times in an inner loop, Write-Update broadcasts **1,000 full-data transactions across the memory bus**! The memory bus is completely saturated with write traffic, destroying multi-core scalability.

```text
WRITE-INVALIDATE VS WRITE-UPDATE BUS TRAFFIC MATRIX

 Scenario: Core 0 writes to Address A 1,000 times in a loop

 Protocol Type      │ Bus Transactions Issued │ Total Bus Traffic Volume (Bytes)
────────────────────┼─────────────────────────┼───────────────────────────────────
 Write-Invalidate   │ 1 Transaction (BUS_INV) │ 8 Bytes (1 Address Header Only!)
 Write-Update       │ 1,000 Transactions      │ 8,000 Bytes (1,000 Data Payloads!)
                    │                         │ (1,000x MORE BUS TRAFFIC!)
```

Because Write-Invalidate generates **$1,000\times$ less bus traffic** for write-intensive workloads, Write-Invalidate is the universal standard for all commercial multi-core processors (x86-64, ARM, RISC-V).

---

## Engineering Reality: Interconnect Scalability Limits and False Sharing

While Bus Snooping with Write-Invalidate provides a clean, high-speed coherence solution, physical silicon constraints enforce strict scaling limits on snooping architectures.

### 1. The Electrical Bus Scaling Ceiling ($N \le 8 \text{ Cores}$)

A physical memory bus consists of hundreds of parallel copper wires etched into the silicon die. Every L1 cache controller connected to the bus adds transistor capacitance ($C_{\text{pin}}$) to those wires.

As the number of CPU cores $N$ connected to a snooping bus increases:
1. **Capacitive Loading**: Total wire capacitance scales linearly with core count ($C_{\text{bus}} \propto N$). Charging and discharging high-capacitance wires requires more physical time, slowing down the maximum bus clock frequency ($f_{\text{bus}}$).
2. **Broadcast Contention**: When 16 or 32 cores attempt to broadcast `BUS_INV` transactions simultaneously, bus arbitration queues overflow, causing severe **Snooping Bus Contention Stalls**.

```text
BUS SNOOPING SCALABILITY LIMITS

 2 to 8 Cores   ──► Shared Bus / Ring Snooping ──► HIGH SPEED (< 1 ns invalidation!)
 16 to 128+ Cores ─► Mesh / Directory Coherence ──► Scalable Point-to-Point Packets
```

For this reason, simple bus snooping is used primarily for **small-scale multi-core clusters ($2 \text{ to } 8 \text{ cores}$)**. Large server chips containing 64 or 128 cores group cores into 4-core or 8-core snooping clusters, and use **Directory-Based Protocols** to connect the clusters over a 2D Mesh network.

---

### 2. False Sharing Invalidation Waves

A major software performance trap in bus snooping systems is **False Sharing Invalidation Waves**.

If Core 0 modifies variable $X$ (at byte offset 0 of line $A$) and Core 1 modifies variable $Y$ (at byte offset 32 of line $A$):
* Core 0 executes `STORE X`: Broadcasts `BUS_INV(A)`. Core 1's local copy of line $A$ is invalidated ($V_1 \Leftarrow 0$).
* Core 1 executes `STORE Y`: Core 1 misses because its line was invalidated! Core 1 broadcasts `BUS_RFO(A)`. Core 0's copy of line $A$ is invalidated ($V_0 \Leftarrow 0$).
* Core 0 executes `STORE X` again: Broadcasts `BUS_INV(A)` again!

```text
FALSE SHARING INVALIDATION WAVE (PERFORMANCE COLLAPSE)

 Core 0 (Writes X at Byte 0)  ──► Broadcasts `BUS_INV(A)` ──► Core 1 Line A Invalidated!
 Core 1 (Writes Y at Byte 32) ──► Broadcasts `BUS_RFO(A)` ──► Core 0 Line A Invalidated!
 Core 0 (Writes X at Byte 0)  ──► Broadcasts `BUS_INV(A)` ──► Core 1 Line A Invalidated!
 (Continuous invalidation wave saturates snooping bus; execution speed collapses!)
```

Even though Core 0 and Core 1 never share the same variable, the 64-byte cache line bounces back and forth across the snooping bus in an endless **Invalidation Wave**, consuming $90\%+$ of memory interconnect bandwidth.

**Software Fix**: Pad independent thread variables with 64 bytes of dummy space so they land on separate physical cache lines, completely eliminating false sharing invalidation traffic!

---

## Solved Industrial Engineering Exercise: Quantitative Bus Snooping Invalidation, Bandwidth Reduction, and Multi-Core Execution Trace

To consolidate your complete mastery of bus snooping mechanics, `BUS_INV` vs `BUS_RFO` transactions, Write-Invalidate vs Write-Update bandwidth analysis, and multi-core execution tracing, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal verification architect auditing a $3.2\text{ GHz}$ 4-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor cores (Core 0, Core 1, Core 2, Core 3) each feature a private $32\text{-KB}$ L1 Data Cache ($64\text{-byte}$ lines) connected to a **Shared Snooping Memory Bus**.

```text
3.2 GHz 4-CORE SNOOPING MEMORY SUBSYSTEM

 Core 0 (3.2 GHz) ──► [ L1 Data Cache 0 ] ──┐
 Core 1 (3.2 GHz) ──► [ L1 Data Cache 1 ] ──┼──► Shared Snooping Bus
 Core 2 (3.2 GHz) ──► [ L1 Data Cache 2 ] ──┼──► Shared L2 Cache / DRAM
 Core 3 (3.2 GHz) ──► [ L1 Data Cache 3 ] ──┘    BUS_INV Delay = 8 Cycles
```

#### Hardware Subsystem Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 312.5\text{ ps}$).
* Ideal Execution CPI: $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ (assuming L1 hits).
* L1 Data Cache: $32\text{ KB}$ capacity, $64\text{-byte}$ lines, $T_{\text{hit}} = 1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Shared Bus Invalidation Broadcast Latency (`BUS_INV`): $T_{\text{bus\_inv}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).
* Shared Bus Read-For-Ownership Latency (`BUS_RFO`): $T_{\text{bus\_rfo}} = 24\text{ clock cycles}$ ($7.50\text{ ns}$).
* Shared Bus Write-Update Latency (`BUS_UPDATE`): $T_{\text{bus\_update}} = 16\text{ clock cycles}$ ($5.00\text{ ns}$).

#### Initial Memory Subsystem State:
Physical memory address $A = \text{0x00010000}$ is currently loaded in **Read-Only Shared State** inside the L1 Data Caches of Core 0, Core 1, and Core 2 ($V_0=1, V_1=1, V_2=1, V_3=0$).

#### Workload Execution Kernel:
Core 0 executes an inner loop that updates variable $A$ **1,000 times in succession**:

```c
for (int i = 0; i < 1000; i++) {
    A++; // Executes 1,000 store instructions to Address 0x00010000 on Core 0
}
```

Assume the loop executes 3 instructions per iteration ($3,000\text{ instructions total}$), where 1 instruction per iteration is a store to address $A$ ($1,000\text{ stores total}$).

#### Your Objective

1. Calculate the total bus traffic volume (in Bytes) and total execution time (in microseconds) generated if the system uses a **Write-Update (Write-Broadcast) Protocol**.
2. Calculate the total bus traffic volume (in Bytes) and total execution time (in microseconds) generated under the **Write-Invalidate Protocol** (`BUS_INV`).
3. Trace the exact state of Valid bits ($V_0, V_1, V_2, V_3$) across Cores 0, 1, 2, 3 during the first two iterations under the Write-Invalidate Protocol.
4. Calculate the percentage reduction in bus traffic and the **Performance Speedup Factor** of Write-Invalidate over Write-Update.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Write-Update (Write-Broadcast) Protocol

Under a **Write-Update Protocol**, Core 0 does not invalidate other cores. Instead, every single store to address $A$ broadcasts the new 4-byte updated value across the shared bus to update Core 1 and Core 2's L1 caches in place.

##### 1. Total Bus Transactions:
Core 0 executes $1,000\text{ store instructions}$. Every store generates $1\text{ `BUS_UPDATE` transaction}$.

$$\text{Total Bus Transactions}_{\text{update}} = \mathbf{1,000 \text{ bus transactions}}$$

##### 2. Total Bus Traffic Volume ($\text{Volume}_{\text{update}}$):
Each `BUS_UPDATE` transaction transmits a $64\text{-bit address}$ ($8\text{ bytes}$) + $32\text{-bit data payload}$ ($4\text{ bytes}$) = $12\text{ bytes per transaction}$.

$$\text{Volume}_{\text{update}} = 1,000 \text{ transactions} \times 12 \text{ bytes/transaction} = \mathbf{12,000 \text{ Bytes}} \quad (12.0\text{ KB})$$

##### 3. Calculate Core 0 Execution Delay under Write-Update:
Each `BUS_UPDATE` transaction stalls Core 0 for $T_{\text{bus\_update}} = 16\text{ clock cycles}$.

$$\text{Total Stall Cycles}_{\text{update}} = 1,000 \text{ stores} \times 16 \text{ cycles/store} = 16,000 \text{ clock cycles}$$

$$\text{Total Execution Cycles} = 3,000 \text{ inst} + 16,000 \text{ stall cycles} = 19,000 \text{ clock cycles}$$

$$T_{\text{exec\_update}} = 19,000 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0059375 \text{ milliseconds}} \quad (5.938\text{ }\mu\text{s})$$

$$\text{CPI}_{\text{effective\_update}} = \frac{19,000\text{ cycles}}{3,000\text{ instructions}} \approx \mathbf{6.333 \text{ cycles/instruction}}$$

---

#### Step 2: Analyze Write-Invalidate Protocol (`BUS_INV`)

Under the **Write-Invalidate Protocol**:

1. **Iteration 1 (First Store to $A$)**:
   * Core 0 holds address $A$ in Read-Only Shared state ($V_0=1, D_0=0$).
   * Core 0 needs write permission! It broadcasts **1 single `BUS_INV(0x00010000)` transaction** across the bus ($T_{\text{bus\_inv}} = 8\text{ clock cycles}$).
   * Cores 1 and 2 snoop `BUS_INV` and set their Valid bits to zero (**$V_1 \Leftarrow 0, V_2 \Leftarrow 0$**).
   * Core 0 obtains **Exclusive Ownership** ($D_0 \Leftarrow 1$).
2. **Iterations 2 through 1,000 (999 Subsequent Stores to $A$)**:
   * Cores 1, 2, and 3 now hold $V = 0$ (Invalidated!).
   * Core 0 holds line $A$ in Exclusive Modified state ($V_0=1, D_0=1$).
   * **ALL 999 SUBSEQUENT STORES EXECUTE LOCALLY IN CORE 0's L1 SRAM AT 1-CYCLE SPEED WITH ZERO BUS TRANSACTIONS!**

##### 1. Total Bus Transactions:
Core 0 broadcasts **only 1 `BUS_INV` transaction** during Iteration 1!

$$\text{Total Bus Transactions}_{\text{invalidate}} = \mathbf{1 \text{ bus transaction}}$$

##### 2. Total Bus Traffic Volume ($\text{Volume}_{\text{invalidate}}$):
The single `BUS_INV` transaction transmits only the 64-bit address header ($8\text{ bytes}$) with zero data payload:

$$\text{Volume}_{\text{invalidate}} = 1 \text{ transaction} \times 8 \text{ bytes} = \mathbf{8 \text{ Bytes}}$$

##### 3. Calculate Core 0 Execution Delay under Write-Invalidate:
Only Iteration 1 pays the $8\text{-cycle}$ `BUS_INV` stall! Iterations 2 through 1,000 pay $0\text{ stall cycles}$.

$$\text{Total Stall Cycles}_{\text{invalidate}} = 1 \text{ broadcast} \times 8 \text{ cycles} = \mathbf{8 \text{ clock cycles}}$$

$$\text{Total Execution Cycles} = 3,000 \text{ inst} + 8 \text{ stall cycles} = 3,008 \text{ clock cycles}$$

$$T_{\text{exec\_invalidate}} = 3,008 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.000940 \text{ milliseconds}} \quad (0.940\text{ }\mu\text{s})$$

$$\text{CPI}_{\text{effective\_invalidate}} = \frac{3,008\text{ cycles}}{3,000\text{ instructions}} \approx \mathbf{1.0027 \text{ cycles/instruction}}$$

---

#### Step 3: Trace Valid Bit States Across Cores

```text
WRITE-INVALIDATE STATE TRACE (CORES 0, 1, 2, 3)

 Execution Event │ Core 0 State (V0, D0) │ Core 1 State (V1) │ Core 2 State (V2) │ Core 3 State (V3)
─────────────────┼───────────────────────┼───────────────────┼───────────────────┼───────────────────
 Initial State   │  Shared (V0=1, D0=0)  │  Shared (V1=1)    │  Shared (V2=1)    │  Invalid (V3=0)
 Iter 1: BUS_INV │  Modified (V0=1, D0=1)│  INVALID (V1=0!)  │  INVALID (V2=0!)  │  Invalid (V3=0)
 Iter 2..1000    │  Modified (V0=1, D0=1)│  INVALID (V1=0)   │  INVALID (V2=0)   │  Invalid (V3=0)
 (Cores 1, 2 stay Invalidated; Core 0 executes 999 stores locally in SRAM at 1-cycle speed!)
```

---

#### Step 4: Calculate Traffic Reduction and Speedup Factor

Let us compare Write-Invalidate against Write-Update:

##### 1. Traffic Reduction Percentage:

$$\text{Traffic Reduction} = \left( 1 - \frac{\text{Volume}_{\text{invalidate}}}{\text{Volume}_{\text{update}}} \right) \times 100\% = \left( 1 - \frac{8\text{ Bytes}}{12,000\text{ Bytes}} \right) \times 100\%$$

$$\text{Traffic Reduction} = (1 - 0.000667) \times 100\% = \mathbf{99.933\% \text{ Bus Traffic Reduction!}}$$

##### 2. Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec\_update}}}{T_{\text{exec\_invalidate}}} = \frac{5.938\text{ }\mu\text{s}}{0.940\text{ }\mu\text{s}} = \frac{19,000\text{ cycles}}{3,008\text{ cycles}} \approx \mathbf{6.316\times \text{ Performance Advantage!}}$$

```text
WRITE-INVALIDATE VS WRITE-UPDATE PERFORMANCE RESULTS

 Coherence Protocol  │ Total Bus Traffic │ Bus Stall Cycles │ Effective CPI     │ Execution Time
─────────────────────┼───────────────────┼──────────────────┼───────────────────┼───────────────
 Write-Update       │ 12,000 Bytes      │ 16,000 Cycles    │ 6.333 Cycles/Inst │ 5.938 us
 Write-Invalidate    │ 8 Bytes           │ 8 Cycles         │ 1.003 Cycles/Inst │ 0.940 us
                     │ (99.93% Less!)    │ (99.95% Less!)   │ (6.3x Lower CPI!) │ (6.32x FASTER!)
```

##### Engineering Conclusion:
By broadcasting 1 single invalidation signal on Iteration 1 and invalidating Cores 1 and 2, the Write-Invalidate protocol eliminated **$99.93\%$ of off-chip bus traffic** and delivered a **$6.32\times$ execution speedup** over Write-Update!

---

### Sanity Check and Verification

Let us verify our mathematical and protocol state results against system principles:

1. **SWMR Invariant Verification**:
   * Before Iteration 1: Cores 0, 1, 2 held line $A$ in Read-Only Shared state ($V_0=1, V_1=1, V_2=1$). No core had write permission.
   * After Iteration 1: Core 0 held line $A$ in Exclusive Modified state ($V_0=1, D_0=1$). Cores 1, 2, 3 were $100\%$ Invalidated ($V_1=0, V_2=0, V_3=0$).
   * SWMR invariant was preserved with $100\%$ mathematical precision throughout!
2. **CPI Convergence Verification**:
   * Base execution CPI = $1.0$.
   * Fenced invalidation added 8 cycles on 1 iteration out of 3,000 instructions ($+0.00267\text{ CPI}$).
   * Effective CPI = $1.0027$, within $0.27\%$ of ideal 1-cycle execution speed!

All bus snooping lookups, invalidation signal broadcasts, bus traffic reductions, and multi-core execution speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Bus Snooping**: The hardware coherence mechanism where every private L1 cache controller continuously monitors all address and transaction requests broadcast across a shared memory bus, comparing snooped addresses against its Duplicate Snoop Tag Array to enforce coherence in the background.
* **Bus Invalidation Signal (`BUS_INV`)**: A lightweight, address-only broadcast transaction transmitted over a shared interconnect by a core intending to write to a line, commanding all other cores holding shared copies of that line to clear their local Valid bits ($V \Leftarrow 0$) in 1 clock cycle.
