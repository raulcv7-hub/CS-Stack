content/00-digital-hardware-foundations/04-memory-subsystems/lessons/03-cache-coherence-protocols/02-mesi-coherence-state-machines/02-mesi-bus-transaction-arbitration.md
# MESI Bus Transaction Arbitration and Read-for-Ownership Mechanics

## The Concurrent Write Hazard and Bus Collision Chaos

In a multi-core processor architecture, multiple independent CPU execution cores (Core 0, Core 1, Core 2, Core 3) operate simultaneously at multi-gigahertz clock speeds. Each core maintains its own private, high-speed Level 1 (L1) Data Cache to store local copies of memory lines. To preserve data correctness across shared memory, the hardware enforces **The Single-Writer Multiple-Reader (SWMR) Invariant**: before any core can execute a store instruction to modify a memory line, all other private cache copies of that line across the entire microchip must be invalidated.

In a 4-state MESI coherence protocol (Modified, Exclusive, Shared, Invalid), when a core needs to acquire write permission for a memory line, it must broadcast a coherence command across the shared memory interconnect bus.

However, consider what happens when two or more cores attempting to run parallel software threads decide to modify the **exact same memory address at the exact same physical nanosecond**:

```text
CONCURRENT WRITE HAZARD AND BUS COLLISION

 Shared Memory Address 0x1000 is held in Shared State (S) by Core 0 and Core 1
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
 Core 0 Executes: STORE [0x1000] = 10  Core 1 Executes: STORE [0x1000] = 20
 (Needs Bus Upgrade on 0x1000!)        (Needs Bus Upgrade on 0x1000!)
       │                               │
       └───────────────┬───────────────┘
                       ▼
    BOTH CORES DRIVE BUS WIRES SIMULTANEOUSLY AT t = 10.00 ns!
    (Physical Electrical Short Circuit / Collision Chaos!)
```

Trace the physical hardware breakdown if no master arbitration mechanism exists:
1. Core 0 and Core 1 both hold address `0x1000` in the **Shared ($S$)** state.
2. At physical time $t = 10.00\text{ ns}$, Core 0 executes `STORE [0x1000] = 10` and Core 1 executes `STORE [0x1000] = 20`.
3. Both cache controllers realize they need write permission. Both controllers attempt to drive electrical signals onto the shared bus wires at the exact same nanosecond!
4. **Physical Bus Collision**: The electrical signals clash on the copper traces. Voltage levels collapse to invalid intermediate states, and invalidation messages are mangled.
5. If both cores incorrectly assume their invalidation message was delivered, **both cores upgrade their local line to Modified ($M$) state**!
6. Core 0 writes `10` to its L1 cache, while Core 1 writes `20` to its L1 cache. The Single-Writer invariant is shattered, and data consistency is permanently destroyed.

Furthermore, a complementary efficiency problem occurs when a core suffers a **Write Miss** (attempting to store to an address that is currently **Invalid [$I$]** in its local cache).

In a naive two-step coherence protocol, executing a store miss requires **two separate bus transactions**:
1. **Transaction 1 (`BusRd`)**: The core issues a read request to fetch the 64-byte line payload from DRAM into its local cache ($120\text{ clock cycles}$). The line arrives in Shared ($S$) state.
2. **Transaction 2 (`BusUpgr`)**: The core requests the bus a second time to broadcast an invalidation command, waiting for permission to upgrade from $S \to M$ ($8\text{ clock cycles}$).

```text
NAIVE TWO-STEP WRITE MISS (DOUBLE BUS LATENCY)

 Step 1: Issue BusRd(A)  ──► Wait 120 Cycles for DRAM ──► Line Arrives in Shared State (S)
 Step 2: Issue BusUpgr(A)──► Wait 8 Cycles for Bus    ──► Line Upgrades to Modified (M)
 (Paid TWO separate bus arbitration penalties for a SINGLE store instruction!)
```

Paying two separate bus arbitration penalties and waiting for two back-to-back interconnect transactions doubles memory write latency and clogs the shared bus.

To resolve concurrent write collisions deterministically and eliminate double-transaction write miss penalties, digital hardware engineering relies on two foundational microarchitectural primitives: **Bus Transaction Arbitration** and **Read-for-Ownership (RFO / BusRdX)**.

---

## The Auctioneer's Gavel and the Combined Order Form: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of bus transaction arbitration and Read-for-Ownership mechanics before examining hardware arbiter state machines and timing trace matrices, let us consider an everyday analogy: **The Open-Outcry Auction House**.

Imagine an auction room filled with four buyers (**Core 0, Core 1, Core 2, Core 3**). In the center of the room stands an official **Auctioneer** holding a wooden gavel (**The Bus Arbiter**).

```text
THE AUCTION HOUSE ARBITRATION MODEL

 Buyer 0 (Core 0)  ──┐
 Buyer 1 (Core 1)  ──┼──► [ Auctioneer with Gavel ] ──► Shared Floor Microphone
 Buyer 2 (Core 2)  ──┼──►   (Bus Arbiter)              (Shared Memory Bus)
 Buyer 3 (Core 3)  ──┘
```

On a pedestal in the front of the room sits a rare painting (**Memory Address $A$**). All buyers currently hold a printed catalog picture of Painting $A$ (**Shared State $S$**).

---

### Part A: Solving Concurrent Shouting (Bus Transaction Arbitration)

Suppose Buyer 0 and Buyer 1 both decide to place a bid on Painting $A$ at 10:00 AM sharp.

#### The Chaos (No Arbiter):
If Buyer 0 and Buyer 1 both shout their bids into the room at the exact same second, their voices mangle together into un-intelligible noise. Nobody in the room understands who bid what, and the auction devolves into chaos.

#### The Solution (The Auctioneer's Gavel / Bus Arbiter):
The Auctioneer enforces a strict, non-negotiable rule: *"Before anyone speaks, you must raise your hand (`Bus Request`). I will point my gavel at ONE buyer (`Bus Grant`). Only the buyer I point to is allowed to use the floor microphone (`Shared Bus`)!"*

```text
AUCTIONEER ARBITRATION SEQUENCE

 10:00 AM: Buyer 0 and Buyer 1 raise hands (Bus Requests).
 10:01 AM: Auctioneer points gavel at Buyer 0 (Bus Grant to Buyer 0!).
           Buyer 1 is told to wait (Stalled!).
 10:02 AM: Buyer 0 takes the microphone and shouts: "I CLAIM EXCLUSIVE RIGHTS TO PAINTING A!"
 10:03 AM: Buyer 1 hears Buyer 0's announcement, lowers their hand, and tears up their catalog picture!
```

Look at what the Auctioneer achieved:
1. **Deterministic Serialization**: Even though Buyer 0 and Buyer 1 raised their hands at the exact same second, the Auctioneer forced them into a single, unambiguous chronological sequence (Buyer 0 went first, Buyer 1 went second).
2. **Collision Elimination**: Only one buyer spoke into the microphone at a time. Zero voice collisions occurred!

---

### Part B: The Combined Order Form (Read-for-Ownership / RFO)

Now, suppose Buyer 0 does **not** have a catalog picture of Painting $A$ on their desk (a Write Miss), but wants to acquire Painting $A$ and paint over it.

#### The Naive Two-Step Approach:
1. Buyer 0 raises their hand, requests the microphone, and asks for a copy of the catalog picture to be delivered from the central warehouse (**Transaction 1: `BusRd`**).
2. Buyer 0 receives the picture, looks at it, raises their hand a SECOND time, requests the microphone again, and shouts: *"Now I want exclusive edit rights to Painting $A$!"* (**Transaction 2: `BusUpgr`**).

Buyer 0 paid two separate waiting penalties to the Auctioneer!

#### The RFO Combined Form Solution:
Instead of making two separate trips, Buyer 0 hands the Auctioneer a single, pre-printed **Combined Order Form (Read-for-Ownership / RFO)**:

$$\text{"DELIVER PAINTING A TO MY DESK AND INVALIDATE ALL OTHER COPIES IMMEDIATELY!"}$$

```text
READ-FOR-OWNERSHIP (RFO) COMBINED TRANSACTION

 Buyer 0 issues Combined RFO Form ──► 1. Delivers Painting A to Buyer 0's Desk
                                     2. Commands all other buyers to tear up their pictures!
 (Executed in ONE single auction transaction instead of two!)
```

Look at the efficiency of the RFO Combined Form:
In **one single auction transaction**, Buyer 0 receives the painting payload AND commands every other buyer in the room to tear up their catalog pictures!

This open-outcry auction house is the exact physical analogue of **Bus Arbitration and Read-for-Ownership**:
* The four buyers are **CPU Cores 0, 1, 2, 3**.
* The Auctioneer's gavel is the **Hardware Bus Arbiter**.
* Raising a hand is a **Bus Request Signal (`BusReq`)**.
* Pointing the gavel is a **Bus Grant Signal (`BusGrant`)**.
* Shouting into the microphone is a **Bus Invalidation Broadcast (`BUS_INV`)**.
* The Combined Order Form is the **Read-for-Ownership Transaction (`BUS_RFO` / `BusRdX`)**.

---

## Primitive 1: Bus Transaction Arbitration

Now that we possess a clear intuitive mental model of the auctioneer's gavel, let us examine the formal engineering mechanics of **Bus Transaction Arbitration**.

> **Bus Transaction Arbitration** is the hardware control logic (centralized or distributed) that receives simultaneous bus requests (`BusReq_0`, `BusReq_1`, ..., `BusReq_N-1`) from multiple processor cores, applies a deterministic priority policy (such as Round-Robin or Fixed Priority), and grants exclusive access (`BusGrant_k`) to exactly one core per bus cycle, serializing all coherence transactions into a single, global chronological order.

```text
CENTRALIZED BUS ARBITER INTERFACE (4-CORE PROCESSOR)

 Cores (Requesters)               Bus Arbiter FSM              Grants
 ┌──────────┐  BusReq_0           ┌──────────────┐  BusGrant_0 ┌──────────┐
 │ Core 0   ├────────────────────►│              ├────────────►│ Core 0   │
 ├──────────┤  BusReq_1           │ Round-Robin  │  BusGrant_1 ├──────────┤
 │ Core 1   ├────────────────────►│ Priority     ├────────────►│ Core 1   │
 ├──────────┤  BusReq_2           │ Arbiter      │  BusGrant_2 ├──────────┤
 │ Core 2   ├────────────────────►│ State        ├────────────►│ Core 2   │
 ├──────────┤  BusReq_3           │ Machine      │  BusGrant_3 ├──────────┤
 │ Core 3   ├────────────────────►│              ├────────────►│ Core 3   │
 └──────────┘                     └──────────────┘             └──────────┘
```

---

### The 4-Phase Bus Arbitration Handshake Protocol

To request, acquire, use, and release the shared interconnect bus safely, every L1 cache controller executes a 4-phase hardware handshake with the Bus Arbiter:

```text
THE 4-PHASE BUS ARBITRATION HANDSHAKE

 Phase 1: Request   ──► Core k raises BusReq_k = 1.
 Phase 2: Grant     ──► Arbiter evaluates priority and asserts BusGrant_k = 1.
 Phase 3: Transfer  ──► Core k drives address/command lines; remote cores snoop!
 Phase 4: Release   ──► Core k completes transaction and lowers BusReq_k = 0.
```

#### Step 1: Request Phase (`BusReq_k = 1`)
When Core $k$'s L1 cache needs to execute a bus transaction (such as a line read fill, an invalidation, or an RFO), Core $k$ asserts its dedicated request line to the arbiter:

$$\text{BusReq}_k \Leftarrow 1$$

Core $k$'s pipeline enters a **Bus Wait Stall** state until permission is granted.

#### Step 2: Grant Phase (`BusGrant_k = 1`)
On the next clock edge, the Bus Arbiter inspects all active request lines ($\text{BusReq}_0 \dots \text{BusReq}_{N-1}$). 

If multiple cores are requesting the bus simultaneously, the arbiter applies its internal **Priority Policy** (e.g., Round-Robin) to select a single winner, Core $k$:

$$\text{BusGrant}_k \Leftarrow 1, \quad \text{BusGrant}_j \Leftarrow 0 \quad (\forall j \neq k)$$

Only Core $k$ receives a High grant signal. All other requesting cores remain in a stall state.

#### Step 3: Transaction Drive & Snooping Phase
Core $k$ detects $\text{BusGrant}_k == 1$ and gains exclusive control of the shared bus wires. Core $k$ drives:
* **Address Lines**: Broadcasts physical memory address $A$.
* **Command Lines**: Broadcasts transaction type (`BUS_INV`, `BUS_RFO`, `BUS_READ`).
* **Data Lines**: Transmits or receives the 64-byte payload if required.

Simultaneously, all other cores ($j \neq k$) **snoop the broadcast address $A$** and update their local cache line states ($V \Leftarrow 0$ if invalidating).

#### Step 4: Release Phase (`BusReq_k = 0`)
Once the transaction completes, Core $k$ de-asserts its request line ($\text{BusReq}_k \Leftarrow 0$). 

The arbiter lowers $\text{BusGrant}_k \Leftarrow 0$ and advances its priority state to evaluate the next waiting core.

---

### Round-Robin Arbitration Policy Mechanics

The most widely used arbitration policy for multi-core processors is **Round-Robin Arbitration**.

A Round-Robin Arbiter enforces **strict rotational fairness**: after Core $k$ is granted the bus, it is placed at the **lowest priority position** for the next arbitration cycle, ensuring that no single core can hog the memory bus or starve other cores.

```text
ROUND-ROBIN PRIORITY ROTATION STATE MACHINE

 State 0 (Priority: 0 -> 1 -> 2 -> 3) ──► Core 0 Granted!
                                              │
                                              ▼
 State 1 (Priority: 1 -> 2 -> 3 -> 0) ──► Core 1 Granted!
                                              │
                                              ▼
 State 2 (Priority: 2 -> 3 -> 0 -> 1) ──► Core 2 Granted!
                                              │
                                              ▼
 State 3 (Priority: 3 -> 0 -> 1 -> 2) ──► Core 3 Granted!
```

#### Mathematical Properties of Round-Robin Arbitration:
1. **Bounded Wait Time**: For an $N$-core system, the maximum time a requesting core must wait to receive a bus grant is bounded by $N - 1$ transaction cycles:

$$T_{\text{max\_wait}} \le (N - 1) \times T_{\text{bus\_transaction}}$$

Where:
* $T_{\text{max\_wait}}$ is the maximum bus arbitration wait time for any requesting core.
* $N$ is the number of cores sharing the bus.
* $T_{\text{bus\_transaction}}$ is the total clock cycles required per bus transaction.

2. **Equal Bandwidth Distribution**: Under heavy contention, each core is guaranteed exactly $\frac{1}{N}$-th of the total available bus interconnect bandwidth.

---

## Primitive 2: Read-for-Ownership (RFO / BusRdX) Mechanics

Now let us examine the second core primitive: **Read-for-Ownership (RFO)**, also designated in hardware protocols as **`BusRdX` (Bus Read-Exclusive)**.

> **Read-for-Ownership (RFO / `BusRdX`)** is a composite, atomic bus transaction broadcast by a cache controller experiencing a **Write Miss** (a store instruction targeting an address currently marked Invalid [$I$] in its local cache). It combines a 64-byte line fill read request with an invalidation command in a single bus transaction, acquiring both the data payload and exclusive write permission.

```text
READ-FOR-OWNERSHIP (RFO) ATOMIC COMBINED TRANSACTION

 CPU Core 0 Issues Store to Address A (Line A is Invalid I in L1_0)
                               │
                               ▼
 Core 0 Broadcasts `BUS_RFO(A)` across Shared Bus in 1 Transaction
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
 ACTION 1: LINE FILL                             ACTION 2: INVALIDATION
 Fetches 64B data line payload from              Commands Cores 1, 2, 3 to
 Shared L2 / DRAM into Core 0 L1 Cache.          clear Valid bits (V <= 0) for A!
                               │                               │
                               └───────────────┬───────────────┘
                                               ▼
                 Core 0 Obtains Exclusive Modified State (M)!
                 (Data Payload + Write Permission Acquired in 1 Transaction!)
```

---

### Step-by-Step Execution Chronology of an RFO Transaction

Let us trace the complete hardware execution flow of a Read-for-Ownership transaction when Core 0 executes `STORE [0x1000] = 42` (where address `0x1000` is currently **Invalid [$I$]** in Core 0's cache, but **Shared [$S$]** in Core 1's cache):

#### Step 1: Miss Detection & RFO Request ($t = 0\text{ ps}$)
1. Core 0's pipeline executes `STORE [0x1000] = 42`.
2. Core 0's L1 cache checks its tag array: Address `0x1000` is **Invalid ($V_0 = 0$)**. A Write Miss occurs!
3. Core 0 asserts its bus request line: $\text{BusReq}_0 \Leftarrow 1$.

#### Step 2: Bus Grant & RFO Broadcast ($t = 625\text{ ps}$)
1. The Bus Arbiter grants the bus to Core 0 ($\text{BusGrant}_0 \Leftarrow 1$).
2. Core 0 drives the address bus (`0x1000`) and commands `BUS_RFO` across the interconnect.

#### Step 3: Parallel Invalidation & Data Supply ($t = 1250\text{ ps}$)
All other cores snoop `BUS_RFO(0x1000)` simultaneously:
* **Core 1 (Holds `0x1000` in Shared State $S$)**: Core 1's snooper detects `BUS_RFO(0x1000)` and **clears its Valid bit ($V_1 \Leftarrow 0$)**. Core 1's copy is invalidated!
* **Core 2 and Core 3 (Hold $I$)**: Ignore the transaction.
* **Shared L2 Cache / DRAM**: Detects `BUS_RFO` and prepares to supply the 64-byte data line payload to Core 0.

#### Step 4: Data Line Delivery & Local Modification ($t = 8125\text{ ps}$)
1. Shared L2 memory drives the 64-byte data payload for `0x1000` onto the bus data lines.
2. Core 0 receives the 64-byte line payload and writes it into its allocated L1 SRAM cache slot.
3. Core 0's cache controller **merges Core 0's store payload (`42`)** into the newly loaded line at offset `0x00`.
4. Core 0 updates the line's MESI status bits directly to **MODIFIED ($M$)** ($V_0 \Leftarrow 1, D_0 \Leftarrow 1$).
5. Core 0's pipeline resumes execution!

```text
RFO TRANSACTION HARDWARE STATE TRANSFORMATION

 Initial State : Core 0: Invalid (I)  │ Core 1: Shared (S)   │ DRAM: 0x1000 = 0
                                      │
 Core 0 Issues : BUS_RFO(0x1000)      │
                                      ▼
 Final State   : Core 0: Modified (M) │ Core 1: INVALID (I)  │ DRAM: 0x1000 = 0
                 (Holds 0x1000 = 42)  │ (Invalidated!)       │ (Stale)
```

Look at the efficiency of the RFO transaction:
* In **a single bus transaction**, Core 0 retrieved the 64-byte data block, invalidated Core 1's copy, applied its local store payload, and acquired Modified ($M$) ownership!

---

## Advanced Interconnect Architectures: Split-Transaction and Pipelined Buses

In modern multi-core server processors, a standard shared memory bus suffers from a major efficiency limitation: **Bus Lockup During DRAM Latency**.

Consider a standard bus during an RFO or read fill transaction:
1. Core 0 requests the bus and broadcasts `BUS_RFO` (takes 2 clock cycles).
2. Main DRAM takes **120 clock cycles** to retrieve the data from its silicon banks.
3. On a standard non-split bus, **the bus remains locked and idle for the entire 120 clock cycles** while waiting for DRAM! No other core can use the bus!

```text
NON-SPLIT BUS LOCKUP (120 IDLE CYCLES)

 Core 0 Broadcasts RFO ──► [ BUS LOCKED IDLE FOR 120 CYCLES ] ──► DRAM Returns Data
                           (Cores 1, 2, 3 CANNOT USE THE BUS!)
```

To eliminate this idle bus lockup, high-performance microprocessors use **Split-Transaction (Pipelined) Buses**.

---

### The Split-Transaction Bus Protocol

A **Split-Transaction Bus** decouples a memory transaction into two completely separate, independent sub-transactions:
1. **The Request Phase**: Core 0 acquires the bus, broadcasts `BUS_RFO(A)` (takes 2 cycles), and **IMMEDIATELY RELEASES THE BUS**!
2. **The Interconnect Free Window**: While main DRAM is searching for line $A$ during the 120-cycle access latency, **the bus is $100\%$ free**! Cores 1, 2, and 3 can use the bus to execute their own independent transactions!
3. **The Response Phase**: 120 cycles later, when DRAM is ready with line $A$, DRAM arbitrates for the bus as a master, acquires the bus, and transmits the 64-byte payload to Core 0 (**Response Phase**).

```text
SPLIT-TRANSACTION BUS DECOUPLED TIMING

 Core 0 Issues Request Phase (2 Cycles) ──► BUS RELEASED IMMEDIATELY!
                                             │
 Cores 1, 2, 3 Use Bus for Other Work  ◄─────┤ (120 Cycles of Active Bus Usage!)
                                             │
 DRAM Issues Response Phase (4 Cycles)  ◄────┘ DRAM Transmits Data to Core 0!
```

#### Performance Impact of Split-Transaction Buses:
By freeing the bus during main memory latency, a Split-Transaction Bus increases effective interconnect throughput by **up to $500\%$**, allowing dozens of cores to overlap their memory transactions concurrently!

---

## Engineering Reality: RFO Collision Races and Bus Starvation

In real-world multi-core chip design, bus transaction arbitration and RFO execution must handle critical edge cases where multiple cores compete for ownership of the same line.

---

### Edge Case 1: RFO Collision Races (Simultaneous Write Misses)

What happens if Core 0 and Core 1 both suffer a Write Miss on address $A$ at the exact same physical nanosecond, and both issue `BUS_RFO(A)` simultaneously?

Let us trace how the Bus Arbiter and MESI state machines resolve this collision race:

```text
RFO COLLISION RACE RESOLUTION

 Time t = 0 ns : Core 0 and Core 1 BOTH issue `BUS_RFO(A)` at the exact same instant!
                 Bus Arbiter evaluates Round-Robin priority:
                 GRANTS BUS TO CORE 0 FIRST! (Core 1 is Stalled).

 Time t = 1 ns : Core 0 broadcasts `BUS_RFO(A)`.
                 Core 1 snoops Core 0's `BUS_RFO(A)`.
                 Core 1's pending request for A is MARKS AS RETRY/INVALIDATED!

 Time t = 8 ns : Core 0 receives line A and acquires MODIFIED state (M).

 Time t = 9 ns : Core 1 is granted the bus and broadcasts its `BUS_RFO(A)`.
                 Core 0 snoops Core 1's `BUS_RFO(A)`!
                 Core 0 detects it holds line A in MODIFIED state!
                 Core 0 INTERCEPTS, supplies updated data to Core 1, and INVALIDATES itself!

 Time t = 15 ns: Core 1 receives line A from Core 0 and acquires MODIFIED state (M).
```

Look at how the hardware resolved the collision race:
1. The Bus Arbiter serialized the requests: Core 0 went first, Core 1 went second.
2. Core 0 acquired $M$ state and modified line $A$.
3. When Core 1 subsequently executed its RFO, Core 0 intercepted the request, supplied the fresh modified data to Core 1, and invalidated itself ($M \to I$).
4. Core 1 acquired $M$ state and applied its write.
5. **Result**: Both writes completed cleanly in exact serial order! Zero data loss occurred.

---

### Edge Case 2: Bus Starvation under Fixed Priority

If a bus arbiter uses a naive **Fixed Priority Policy** (where Core 0 ALWAYS has highest priority and Core 3 ALWAYS has lowest priority):

If Core 0, Core 1, and Core 2 generate continuous, heavy memory traffic, **Core 3 may never be granted the bus**! Core 3 suffers **Bus Starvation**, freezing its execution pipeline indefinitely.

**Industrial Solution**: Modern processors strictly prohibit Fixed Priority bus arbiters. They use **Round-Robin** or **Weighted Fair Queueing (WFQ)** arbiters, guaranteeing that every core receives a deterministic minimum share of bus access.

---

## Solved Industrial Engineering Exercise: Quantitative Bus Arbitration, RFO Latency, and Multi-Core Race Resolution Trace

To consolidate your complete mastery of bus transaction arbitration, Round-Robin priority rotation, Read-for-Ownership (`BUS_RFO`) mechanics, and inter-cache interventions, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal verification architect auditing a $3.2\text{ GHz}$ 4-core server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor cores (Core 0, Core 1, Core 2, Core 3) are connected via a **Shared Snooping Memory Bus** managed by a **Centralized Round-Robin Bus Arbiter**.

```text
3.2 GHz 4-CORE PROCESSOR WITH ROUND-ROBIN BUS ARBITER

 Core 0 (3.2 GHz) ──► [ L1 Data Cache 0 ] ──┐
 Core 1 (3.2 GHz) ──► [ L1 Data Cache 1 ] ──┼──► [ Round-Robin Bus Arbiter ]
 Core 2 (3.2 GHz) ──► [ L1 Data Cache 2 ] ──┼──► Shared L2 Cache / DRAM
 Core 3 (3.2 GHz) ──► [ L1 Data Cache 3 ] ──┘    RFO Latency = 24 Cycles
```

#### Hardware Interconnect Parameters:
* CPU Clock Frequency: $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ps}$).
* Arbiter Request-to-Grant Latency: $T_{\text{arb}} = 2\text{ clock cycles}$ ($0.625\text{ ns}$).
* Bus Invalidation Command Broadcast (`BusUpgr`): $T_{\text{cmd}} = 4\text{ clock cycles}$ ($1.25\text{ ns}$).
* Read-for-Ownership Line Fill Latency (`BUS_RFO` from L2/DRAM): $T_{\text{RFO\_DRAM}} = 100\text{ clock cycles}$ ($31.25\text{ ns}$).
* Inter-Cache Line Transfer Latency (`BUS_RFO` with Intervention from another L1): $T_{\text{intervene}} = 16\text{ clock cycles}$ ($5.00\text{ ns}$).

#### Initial Memory Subsystem State:
Physical memory address $A = \text{0x00010000}$ holds value $100_{10}$ in main memory.
* Line $A$ is loaded in **Shared ($S$) state** in Core 1 and Core 2 ($V_1=1, V_2=1, D_1=0, D_2=0$).
* Cores 0 and 3 hold line $A$ in **Invalid ($I$) state** ($V_0=0, V_3=0$).
* **Arbiter Priority State**: Priority currently points to **Core 0** ($0 \to 1 \to 2 \to 3$).

#### The Workload Collision Event:
At physical time $t = 10.0\text{ ns}$ (Clock Cycle 32), **Core 0 and Core 1 SIMULTANEOUSLY execute store instructions targeting address $A$**:
* **Core 0**: Executes `STORE [0x00010000] = 50` (Write Miss $\to$ needs `BUS_RFO`).
* **Core 1**: Executes `STORE [0x00010000] = 75` (Write Hit in $S$ state $\to$ needs `BusUpgr`).

Both cores assert their bus request lines ($\text{BusReq}_0 = 1, \text{BusReq}_1 = 1$) at $t = 10.0\text{ ns}$.

#### Your Objective

1. Trace the Round-Robin Arbiter decision at $t = 10.0\text{ ns}$. Determine which core wins the bus first and which core is forced to stall.
2. Trace the step-by-step bus execution, snoop invalidations, inter-cache transfers, and MESI state changes ($S_0, S_1, S_2, S_3$) for **Core 0's winning transaction**.
3. Trace the subsequent bus execution and MESI state changes when **Core 1 executes its transaction after Core 0 completes**.
4. Calculate the total CPU stall cycles incurred by Core 0 and Core 1.
5. Calculate the performance latency saved by using a single combined `BUS_RFO` transaction over a two-step `BusRd` + `BusUpgr` sequence for Core 0.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Round-Robin Arbitration Decision at $t = 10.0\text{ ns}$ (Cycle 32)

At $t = 10.0\text{ ns}$, both Core 0 and Core 1 assert their bus request lines:

$$\text{BusReq}_0 = 1, \quad \text{BusReq}_1 = 1$$

* The Round-Robin Arbiter checks current priority: Priority order is **$0 \to 1 \to 2 \to 3$**.
* Core 0 matches highest priority!
* **Arbiter Decision**:
  * **`BusGrant_0` asserted High ($1$)** after $T_{\text{arb}} = 2\text{ clock cycles}$ (at $t = 10.625\text{ ns}$, Cycle 34).
  * **`BusGrant_1` remains Low ($0$)**. Core 1 is forced to stall!
* **Arbiter Priority Updates**: Priority for the *next* arbitration cycle rotates to **$1 \to 2 \to 3 \to 0$**.

---

#### Step 2: Trace Core 0's Winning RFO Transaction (`BUS_RFO`)

Core 0 receives `BusGrant_0 = 1` at Cycle 34 and executes its Write Miss transaction:

1. **Cycle 34 ($t = 10.625\text{ ns}$)**: Core 0 drives **`BUS_RFO(0x00010000)`** onto the bus.
2. **Cycle 34 Snooping**: Cores 1, 2, and 3 snoop `BUS_RFO(0x00010000)`:
   * Core 1 holds line $A$ in Shared state ($S_1 = S$). Core 1 **invalidates its local copy ($S_1 \to I$)**!
   * Core 2 holds line $A$ in Shared state ($S_2 = S$). Core 2 **invalidates its local copy ($S_2 \to I$)**!
   * Core 1's pending `BusUpgr` request for address $A$ is **CANCELLED** because Core 1 no longer holds a valid copy of line $A$!
3. **Cycles 35..134 (100 Clock Cycles)**:
   * Shared L2/DRAM processes the `BUS_RFO` read fill request ($T_{\text{RFO\_DRAM}} = 100\text{ cycles}$).
4. **Cycle 134 ($t = 41.875\text{ ns}$)**:
   * L2/DRAM returns the 64-byte payload for line $A$ (`100`) to Core 0 over the bus.
   * Core 0 writes the payload into its L1 SRAM array, merges its store value (`50`), and sets $V_0 = 1, D_0 = 1$.
   * **Core 0 transitions to MODIFIED ($M$) state!**
   * Core 0 de-asserts `BusReq_0 = 0`. Core 0's pipeline un-stalls!

##### Core 0 Stall Calculation:
$$\text{Core 0 Stall Cycles} = T_{\text{arb}} + T_{\text{RFO\_DRAM}} = 2 + 100 = \mathbf{102 \text{ clock cycles}} \quad (31.875\text{ ns})$$

```text
STATE OF ALL CORES AT CYCLE 134 (AFTER CORE 0 RFO COMPLETES)

 Core 0 : MODIFIED (M)  [Holds A = 50, V0 = 1, D0 = 1]
 Core 1 : INVALID  (I)  [Invalidated by Core 0 RFO! V1 = 0]
 Core 2 : INVALID  (I)  [Invalidated by Core 0 RFO! V2 = 0]
 Core 3 : INVALID  (I)  [V3 = 0]
```

---

#### Step 3: Trace Core 1's Subsequent RFO Transaction

Now, Core 1 needs to execute its store instruction (`STORE A = 75`).

1. **Cycle 135 ($t = 42.1875\text{ ns}$)**:
   * Core 1 checks its L1 cache: Line $A$ was invalidated by Core 0 in Step 2! $S_1 = I$.
   * Core 1's original `BusUpgr` request **degrades into a `BUS_RFO` Write Miss request**!
   * Core 1 re-asserts `BusReq_1 = 1`.
2. **Cycle 137 ($t = 42.8125\text{ ns}$)**:
   * Round-Robin Arbiter checks priority ($1 \to 2 \to 3 \to 0$). Core 1 wins!
   * Arbiter asserts **`BusGrant_1 = 1`** after $T_{\text{arb}} = 2\text{ clock cycles}$.
3. **Cycle 137**: Core 1 drives **`BUS_RFO(0x00010000)`** onto the bus.
4. **Cycle 137 Inter-Cache Intervention**:
   * Core 0 snoops `BUS_RFO(0x00010000)`.
   * Core 0 detects it holds line $A$ in **MODIFIED ($M$) state** ($S_0 = M, D_0 = 1$)!
   * **Intervention Triggered**: Core 0 asserts `HITM`, intercepts the DRAM request, and prepares to supply its modified payload ($50$) directly to Core 1 over the bus!
5. **Cycles 138..153 ($T_{\text{intervene}} = 16\text{ clock cycles}$)**:
   * Core 0 drives its 64-byte payload ($A = 50$) directly to Core 1 over the bus.
   * Core 0 invalidates its local copy (**$S_0 \to I$**).
6. **Cycle 153 ($t = 47.8125\text{ ns}$)**:
   * Core 1 receives the 64-byte line payload ($50$) from Core 0.
   * Core 1 writes the line into its L1 SRAM array, merges its store value (`75`), and sets $V_1 = 1, D_1 = 1$.
   * **Core 1 transitions to MODIFIED ($M$) state!**
   * Core 1 de-asserts `BusReq_1 = 0`. Core 1's pipeline un-stalls!

##### Core 1 Stall Calculation:
* Waited for Core 0's RFO to finish: $102\text{ cycles}$.
* Re-arbitration wait: $2\text{ cycles}$.
* Inter-cache line transfer latency: $16\text{ cycles}$.

$$\text{Core 1 Stall Cycles} = 102 + 2 + 16 = \mathbf{120 \text{ clock cycles}} \quad (37.50\text{ ns})$$

```text
FINAL SUBSYSTEM STATE AT CYCLE 153

 Core 0 : INVALID  (I)  [Invalidated by Core 1 RFO! V0 = 0]
 Core 1 : MODIFIED (M)  [Holds final value A = 75, V1 = 1, D1 = 1]
 Core 2 : INVALID  (I)  [V2 = 0]
 Core 3 : INVALID  (I)  [V3 = 0]
 (Core 1's store = 75 successfully executed as the final serialized value!)
```

---

#### Step 4: Calculate RFO Efficiency Savings for Core 0

Let us compare Core 0's RFO transaction against a naive two-step protocol (`BusRd` + `BusUpgr`):

##### Naive Two-Step Protocol for Core 0:
* Step 1: Issue `BusRd` to fetch line from DRAM = $T_{\text{arb}} + T_{\text{DRAM}} = 2 + 100 = 102\text{ cycles}$.
* Step 2: Issue `BusUpgr` to invalidate other cores = $T_{\text{arb}} + T_{\text{cmd}} = 2 + 4 = 6\text{ cycles}$.

$$\text{Total Naive Latency} = 102 + 6 = \mathbf{108 \text{ clock cycles}}$$

##### Combined RFO Protocol for Core 0:
$$\text{Total RFO Latency} = T_{\text{arb}} + T_{\text{RFO\_DRAM}} = 2 + 100 = \mathbf{102 \text{ clock cycles}}$$

$$\text{Latency Saved} = 108 - 102 = \mathbf{6 \text{ clock cycles per write miss}}$$

##### Percentage Speedup:
$$\text{Speedup} = \frac{108\text{ cycles}}{102\text{ cycles}} \approx \mathbf{1.0588\times \text{ Performance Gain}}$$

By combining line fetching and write invalidation into a single atomic `BUS_RFO` transaction, the hardware saved $6\text{ clock cycles}$ of interconnect command overhead per write miss!

---

### Sanity Check and Verification

Let us verify our mathematical and protocol state results against hardware memory principles:

1. **SWMR Invariant Verification**:
   * Initial State: Line $A$ in Shared state ($S$) across Cores 1 and 2. No core had write permission.
   * After Core 0 RFO (Cycle 134): Core 0 held $M$ state. Cores 1, 2, 3 were $100\%$ Invalidated.
   * After Core 1 RFO (Cycle 153): Core 1 held $M$ state ($A = 75$). Cores 0, 2, 3 were $100\%$ Invalidated.
   * **SWMR Invariant held with $100\%$ mathematical precision throughout!**
2. **Serial Execution Order Verification**:
   * Core 0 won arbitration first, writing $A = 50$.
   * Core 1 won arbitration second, reading Core 0's $50$ and overwriting $A = 75$.
   * Final value in the system is $A = 75$, matching exact physical arbitration order!
3. **Inter-Cache Transfer Speed Advantage**:
   * Inter-cache transfer from Core 0 to Core 1 took $16\text{ cycles}$ ($5.0\text{ ns}$), which is **$6.25\times$ faster than fetching from DRAM** ($100\text{ cycles}$ / $31.25\text{ ns}$)!

All bus arbitration states, Round-Robin priority rotations, RFO atomic transitions, inter-cache interventions, and stall cycle metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Bus Transaction Arbitration**: The centralized or distributed hardware control logic that receives simultaneous bus requests from multiple cores, applies a deterministic priority policy (such as Round-Robin), and grants exclusive access to exactly one core per cycle, serializing coherence transactions into a single global order without signal collisions.
* **Read-for-Ownership (RFO / BusRdX)**: A composite, atomic bus transaction broadcast by a core experiencing a write miss that combines a 64-byte line fill read with an invalidation command, acquiring both the data payload and exclusive write permission ($M$ state) in a single bus transaction.
