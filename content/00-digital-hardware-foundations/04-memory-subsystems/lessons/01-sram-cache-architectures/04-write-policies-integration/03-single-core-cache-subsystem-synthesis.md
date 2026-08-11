content/00-digital-hardware-foundations/04-memory-subsystems/lessons/01-sram-cache-architectures/04-write-policies-integration/03-single-core-cache-subsystem-synthesis.md
# Single-Core Cache Subsystem Synthesis and Datapath Integration

## The Inter-Unit Feedback Friction and the Subsystem Integration Barrier

In high-performance microprocessor design, a Level 1 (L1) Data Cache is not a simple, monolithic memory chip. It is a highly complex, multi-unit digital subsystem composed of distinct sub-circuits operating in tight, clock-synchronous orchestration:

1. **SRAM Tag and Data Memory Arrays**: High-density 6-transistor (6T) SRAM matrices holding addresses, valid flags, dirty flags, and 64-byte payload blocks.
2. **Address Parsers and Index Decoders**: Combinational logic networks that split 64-bit virtual or physical addresses into Tag, Index, and Offset bit fields.
3. **Parallel Tag Comparator Banks**: High-speed digital comparators that evaluate whether an incoming address matches any stored tag across $N$ set ways simultaneously.
4. **Way Selection and Byte Alignment Multiplexers**: Steering trees that route data payloads between the SRAM array and CPU execution registers.
5. **Replacement Policy Engines (Tree-PLRU)**: Finite state machines that track way access histories and decode victim eviction candidates during cache misses.
6. **Write-Back Buffers (WBB)**: Asynchronous SRAM queues that decouple dirty line evictions from the critical read miss path.
7. **Line Refill and Critical-Word-First Forwarding Units**: Burst bus interface logic that streams incoming 64-byte blocks from lower memory into the cache while restarting the CPU pipeline as early as possible.

```text
THE CACHE SUBSYSTEM INTEGRATION CHALLENGE

 CPU Execution Pipeline Requests
  │  Address, Write Data, Read/Write Strobe
  ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ L1 CACHE SUBSYSTEM INTER-UNIT FEEDBACK NETWORK              │
 │                                                             │
 │  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐  │
 │  │ Index Decode ├────►│ SRAM Read    ├────►│ Tag Compare │  │
 │  └──────────────┘     └──────────────┘     └──────┬──────┘  │
 │                                                   │         │
 │  ┌──────────────┐     ┌──────────────┐            ▼         │
 │  │ WBB Buffer   │◄────┤ PLRU Engine  │◄──── Hit/Miss Logic  │
 │  └──────────────┘     └──────────────┘            │         │
 │                                                   ▼         │
 │                       Line Refill Unit ◄── Pipeline Stall   │
 └─────────────────────────────────────────────────────────────┘
  (Dozens of inter-unit feedback signals must settle within 1 clock cycle!)
```

While each of these sub-units can be analyzed and designed in isolation, combining them into a single, functional, single-core L1 Data Cache introduces a severe architectural challenge: **Inter-Unit Timing Feedback Loops**.

Consider the complex sequence of events that must occur inside the L1 Data Cache during a single $250\text{-picosecond}$ clock cycle ($4.0\text{ GHz}$ CPU clock frequency):

1. The CPU dispatches a memory address to the cache.
2. The index decoder activates an SRAM row across all $N$ ways.
3. The SRAM arrays output $N$ stored tag vectors and $N$ 64-byte data payloads.
4. $N$ parallel comparators evaluate whether any stored tag matches the CPU address tag.
5. Hit/Miss control logic evaluates whether a valid match occurred.
6. **If a Hit occurs on a Store instruction**:
   * The winning way's **Dirty Bit ($D$)** must be set to $1$.
   * The **Tree-PLRU replacement state machine** must update its directional tree bits to point away from the hit way.
   * The new byte payload must be written into the winning SRAM data way.
7. **If a Miss occurs**:
   * The CPU pipeline stall signal (`cpu_ready = 0`) must be asserted immediately.
   * The **Tree-PLRU eviction decoder** must inspect current set bits and identify the victim way.
   * The **Eviction Logic** must check if the victim way is dirty ($D == 1$).
   * If dirty, the 64-byte victim line must be moved into the **Write-Back Buffer (WBB)**, and a read fill request must be issued across the memory bus!

All of these sub-units depend on each other's outputs **within the exact same clock cycle or across tightly coupled state transitions**!

If the inter-unit feedback logic is designed naively—for instance, allowing the output of tag comparison to pass through complex PLRU bit updates, eviction decoding, and WBB push logic before driving the CPU stall line—the combinational gate delay ($t_{\text{logic}}$) exceeds $1.5\text{ nanoseconds}$.

The critical path delay collapses the maximum operating frequency of the entire CPU core from $4.0\text{ GHz}$ down to $666\text{ MHz}$!

To synthesize an L1 Data Cache that runs at full multi-gigahertz speeds without race conditions or critical path timing violations, digital engineers must design a unified **Integrated Single-Core Cache Subsystem** managed by a high-speed **Cache Controller Datapath and State Machine**.

---

## The Automated Airport Baggage Terminal: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how an integrated cache subsystem harmonizes multiple sub-units and manages timing feedback loops, let us consider an everyday analogy: **The Automated Airport Baggage Terminal**.

Imagine a massive international airport handling thousands of passenger suitcases every hour.

```text
THE AIRPORT BAGGAGE TERMINAL METAPHOR

 Passengers (CPU Pipeline)
 ┌─────────────────────────────────────────────────────────────────┐
 │ Requests Suitcases by Ticket Number                             │
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ BAGGAGE TERMINAL INTEGRATED SUBSYSTEM                           │
 │                                                                 │
 │  ┌─────────────────┐    ┌──────────────────┐  ┌──────────────┐  │
 │  │ Ticket Scanner  ├───►│ Storage Racks    ├──┤ Tag Scanners │  │
 │  │ (Index Decoder) │    │ (SRAM Data/Tag)  │  │ (Comparators)│  │
 │  └─────────────────┘    └──────────────────┘  └──────┬───────┘  │
 │                                                      │          │
 │  ┌─────────────────┐    ┌──────────────────┐         ▼          │
 │  │ Decontamination │◄───┤ Robot Organizer  │◄── Match / Miss│  │
 │  │ Bay (WBB Queue) │    │ (Tree-PLRU Engine│    Control       │  │
 │  └─────────────────┘    └──────────────────┘                    │
 └─────────────────────────────────────────────────────────────────┘
```

The baggage terminal contains five specialized operations operating side-by-side:
1. **Passengers (The CPU Execution Pipeline)**: Arrive continuously at the counter, handing over ticket claims ("Memory Addresses") to pick up or check in suitcases ("Data Words").
2. **The Ticket Scanner (Index Decoder)**: Reads the ticket claim number and directs the search to a specific row of storage racks ("Cache Set").
3. **Storage Racks (SRAM Tag and Data Arrays)**: Holds suitcases inside 4 parallel shelf compartments per row ("4-Way Set-Associative Array").
4. **Barcode Scanners (Tag Comparators)**: Scans the barcode labels on all 4 suitcases in the row simultaneously to see if any match the passenger's ticket claim ("Tag Match").
5. **The Robotic Rack Organizer (Tree-PLRU Replacement Engine)**: Keeps notes on which shelf compartments are empty, which bags are old, and which shelf to clear if a new bag arrives.
6. **The Decontamination & Shipping Bay (Write-Back Buffer Queue)**: Receives modified suitcases that need to be shipped back to the central airport warehouse ("Main DRAM Memory").

---

### The Disaster of Un-Coordinated Operations (Un-Integrated Subsystem)

Imagine what happens if these six operations run independently without a master coordinator:

* A passenger arrives at 12:00 PM asking for Suitcase #7432.
* The barcode scanner checks Row 42. At the exact same second, the robotic organizer decides to clear out a shelf in Row 42, while a cargo plane unloads a new suitcase into Row 42, and the decontamination bay attempts to ship a suitcase away!
* The suitcases collide on the conveyor belt! The barcode scanner reads the wrong suitcase, the robotic organizer drops a passenger's bag into the recycling bin, and the passenger receives someone else's luggage.

This chaos is what happens when RTL hardware units are wired together without a master controller: **Race Conditions, Signal Contention, and Data Corruption**.

---

### The Solution: The Master Terminal Dispatcher (Cache Controller State Machine)

To prevent baggage collisions and guarantee sub-second delivery times, the airport hires a **Master Terminal Dispatcher (The Cache Controller State Machine)**.

The Master Dispatcher enforces a strict, step-by-step protocol for every incoming passenger:

```text
MASTER DISPATCHER OPERATIONAL PROTOCOL

 Passenger Arrives (CPU Request)
               │
      Scan Barcode (Tag Compare)
               │
      ┌────────┴────────┐
      │ MATCH (Hit)     │ NO MATCH (Miss)
      ▼                 ▼
 Deliver Suitcase       Halt Passenger (CPU Pipeline Stall)
 Update Robot Notes     Is Rack Shelf Dirty?
 (1 Second Total!)      ├───────────┬───────────┐
                        │ YES       │ NO        │
                        ▼           ▼           │
                        Move to     Fetch from  │
                        Decontam    Warehouse   │
                        Bay (WBB)   (DRAM Fill) │
                        └───────────┬───────────┘
                                    ▼
                         Deliver Suitcase & Resume Passenger!
```

1. **Step 1 (Parallel Scan)**: The dispatcher orders the ticket scanner to select Row 42 and orders the barcode scanners to read all 4 shelves in parallel.
2. **Step 2 (Instant Decision)**:
   * **If a Barcode Matches (Hit)**: The dispatcher commands the conveyor belt to route the suitcase to the passenger immediately (**1-Second Delivery**). At the exact same time, the dispatcher tells the robotic organizer to update its notes ("Mark Shelf 2 as recently used!").
   * **If No Barcode Matches (Miss)**: The dispatcher holds the passenger at the counter (**Pipeline Stall**), checks if the old suitcase on the designated shelf is dirty, moves it to the decontamination bay if needed (**Write-Back Buffer**), calls the central warehouse for a new suitcase (**DRAM Line Fill**), and notifies the passenger the moment the new suitcase arrives!

Notice what this Master Dispatcher achieved:
* **Flawless Safety**: Suitcases never collide on conveyor belts because every movement is orchestrated in sequence.
* **Maximum Throughput**: When a suitcase is present (a Hit), delivery takes 1 second!
* **Decoupled Evictions**: Dirty suitcases are moved to the decontamination bay in 1 second, allowing the new suitcase to be fetched immediately without making the passenger wait for the shipping truck!

This Master Terminal Dispatcher is the exact physical analogue of an **Integrated Cache Controller State Machine**:
* Passengers are **CPU Read/Write Memory Requests**.
* Suitcases are **64-Byte Cache Line Payloads**.
* Storage Racks are **SRAM Tag/Data Arrays**.
* The Barcode Scanner is the **Parallel Tag Comparator Bank**.
* The Robotic Organizer is the **Tree-PLRU Replacement Engine**.
* The Decontamination Bay is the **Write-Back Buffer (WBB)**.
* The Central Warehouse is **Main System DRAM Memory**.
* The Master Dispatcher is the **Cache Controller Control FSM**.

---

## Primitive 1: The Integrated Single-Core Cache Subsystem Architecture

Now that we possess a clear intuitive mental model of the airport baggage terminal, let us examine the formal engineering architecture of an **Integrated Single-Core Cache Subsystem**.

An integrated L1 Data Cache subsystem acts as a complete, self-contained hardware module that sits between the CPU execution pipeline and the lower-level memory interconnect bus.

### Top-Level Module Interface Signals

Let us define the complete signal interface of an integrated L1 Data Cache module:

```text
INTEGRATED L1 CACHE SUBSYSTEM MODULE INTERFACE

 CPU Pipeline Interface                      Lower Memory Bus Interface
 ┌──────────────────────────┐               ┌──────────────────────────┐
 │ cpu_clk (Master Clock)   │               │ mem_clk (Bus Clock)      │
 │ cpu_reset_n (Reset)      │               │ mem_req (Bus Request)    │
 │ cpu_addr[63:0] (Address) │               │ mem_we (Write/Read_n)    │
 │ cpu_wdata[63:0] (Data)   ├─► L1 CACHE ──►│ mem_addr[63:0] (Address) │
 │ cpu_req (Request Strobe) │   SUBSYSTEM   │ mem_wdata[511:0] (Line)  │
 │ cpu_we (Write/Read_n)    │               │ mem_rdata[511:0] (Line)  │
 │ cpu_byte_en[7:0] (Mask)  │               │ mem_ready (Bus Acknow)   │
 │ cpu_rdata[63:0] (Output) │               └──────────────────────────┘
 │ cpu_ready (Stall Control)│
 └──────────────────────────┘
```

#### 1. CPU Pipeline Interface (High-Speed Core Side):
* `cpu_clk` (input): Master CPU clock ($4.0\text{ GHz}$).
* `cpu_reset_n` (input): Active-low master reset line.
* `cpu_addr[63:0]` (input): 64-bit virtual or physical memory address.
* `cpu_wdata[63:0]` (input): 64-bit data payload for store instructions.
* `cpu_req` (input): Active-high strobe indicating a valid memory read or write request from the CPU.
* `cpu_we` (input): Read/Write control flag ($1 = \text{Store/Write}$, $0 = \text{Load/Read}$).
* `cpu_byte_en[7:0]` (input): 8-bit byte enable mask for partial word store instructions.
* `cpu_rdata[63:0]` (output): 64-bit data payload returned to CPU register file on loads.
* `cpu_ready` (output): Active-high pipeline flow signal ($1 = \text{Cache Ready/Hit}$, $0 = \text{Cache Miss/Stall CPU}$).

#### 2. Lower Memory Bus Interface (Interconnect Side):
* `mem_req` (output): Active-high request to lower-level memory (L2 cache or DRAM).
* `mem_we` (output): Memory bus operation type ($1 = \text{Dirty Write-Back}$, $0 = \text{Line Read Fill}$).
* `mem_addr[63:0]` (output): 64-byte aligned block address for line fills or write-backs.
* `mem_wdata[511:0]` (output): 64-byte ($512\text{-bit}$) evicted dirty line payload.
* `mem_rdata[511:0]` (input): 64-byte ($512\text{-bit}$) incoming line payload from lower memory.
* `mem_ready` (input): Active-high acknowledge from memory bus controller indicating transaction completion.

---

### Internal Subsystem Interconnect Topology

Inside the integrated cache module, seven primary sub-units are wired together in a closed feedback datapath:

```text
COMPLETE L1 CACHE SUBSYSTEM INTERNAL DATAPATH

 CPU Address [63:0]
  │  [63 ----- 13] [12 --- 6] [5 ---- 0]
  │    Tag (51b)    Index(7b)  Offset(6b)
  │        │            │          │
  │        │            ▼          │
  │        │     ┌─────────────┐   │
  │        │     │ SRAM Decoder│   │
  │        │     └──────┬──────┘   │
  │        │            │          │
  │        │            ▼          │
  │        │     ┌─────────────┐   │
  │        │     │ SRAM Arrays │   │
  │        │     │ (Tag/Data)  │   │
  │        │     └──────┬──────┘   │
  │        │            │          │
  ▼        ▼            ▼          │
 ┌───────────────────────────┐     │
 │ Parallel Tag Comparators  │     │
 └─────────────┬─────────────┘     │
               │                   │
               ▼                   │
 ┌───────────────────────────┐     │
 │ Hit / Miss & Control FSM  │     │
 └──────┬──────────────┬─────┘     │
        │              │           │
        ▼              ▼           ▼
 ┌─────────────┐ ┌───────────┐ ┌──────────────────────────────┐
 │ Tree-PLRU   │ │ Write-Back│ │ Way & Offset Selection MUX   │
 │ Replacement │ │ Buffer    │ └──────────────┬───────────────┘
 └─────────────┘ └───────────┘                │
                                              ▼
                                    CPU Read Data [63:0]
```

Let us trace how these internal sub-units interact:
1. **SRAM Tag & Data Memory Matrices**: $128\text{ sets} \times 4\text{ ways}$. Stores Valid bit ($V$), Dirty bit ($D$), 51-bit Tag, and 64-byte Data payload per way.
2. **Parallel Tag Comparators**: Four 51-bit comparators compare `cpu_addr[63:13]` against all 4 retrieved SRAM tags simultaneously.
3. **Master Control FSM**: Evaluates comparator outputs and Valid bits to generate individual way hit signals ($\text{Hit}_0..\text{Hit}_3$) and the global `cpu_ready` stall signal.
4. **Way & Offset Selection MUX**: Uses the One-Hot hit vector $(\text{Hit}_0..\text{Hit}_3)$ to select the matching 64-byte data line, and uses `cpu_addr[5:0]` (Offset) to extract the target 64-bit word for `cpu_rdata`.
5. **Tree-PLRU Replacement Engine**: Receives the hit vector and updates the 3-bit tree state for the active set row. On a miss, it decodes the eviction way ($E_0..E_3$).
6. **Write-Back Buffer (WBB)**: If the eviction way selected by Tree-PLRU is dirty ($D == 1$), the 64-byte line is moved into the WBB.

---

## Primitive 2: Cache Controller Datapath and Control FSM

To manage state transitions, memory bus requests, pipeline stalls, and dirty line evictions without race conditions, the heart of the integrated cache subsystem is the **Master Cache Controller Finite State Machine (FSM)**.

### The Master Cache Controller State Transition Graph

The Master Cache Controller FSM is structured around five primary operational states:

```text
MASTER CACHE CONTROLLER FSM STATE TRANSITION GRAPH

                 Power-On / Reset
                        │
                        ▼
            ┌───────────────────────┐
            │   ST_IDLE_LOOKUP      │◄───────┐
            │  (1-Cycle Hit Path)   │        │
            └───────────┬───────────┘        │
                        │                    │
            Cache Miss  │ (cpu_ready = 0)    │ Refill & Update Complete
                        ▼                    │
            ┌───────────────────────┐        │
            │   ST_EVICT_CHECK      │        │
            │ (Inspect Victim Line) │        │
            └───────────┬───────────┘        │
                        │                    │
           ┌────────────┴────────────┐       │
           │ Victim Clean (D=0)      │ Victim Dirty (D=1)
           ▼                         ▼       │
   ┌───────────────┐         ┌─────────────┐ │
   │ ST_MEM_READ   │         │ ST_WBB_PUSH │ │
   │ (Issue Fill)  │         │ (Push WBB)  │ │
   └───────┬───────┘         └──────┬──────┘ │
           │                        │        │
           └────────────┬───────────┘        │
                        ▼                    │
            ┌───────────────────────┐        │
            │   ST_REFILL_WAIT      │────────┘
            │ (Stream & Write SRAM) │
            └───────────────────────┘
```

Let us examine the exact hardware responsibilities, signal assertions, and transition conditions for each state in the Master Cache Controller FSM:

---

### State 1: `ST_IDLE_LOOKUP` (The High-Speed 1-Cycle Hit Path)

`ST_IDLE_LOOKUP` is the default operational state of the cache controller. It executes the high-speed $1\text{-cycle}$ hit path for both loads and stores.

#### Hardware Actions in `ST_IDLE_LOOKUP`:
1. **Request Inspection**: If `cpu_req == 1`, the controller reads `cpu_addr[63:0]`.
2. **SRAM Access**: Index bits $[12:6]$ decode the SRAM row, reading 4 tags and 4 data payloads in parallel.
3. **Hit Determination**:
   $$\text{Hit}_k = V_k \quad \mathbf{\text{AND}} \quad (\text{Stored\_Tag}_k == \text{Address\_Tag})$$

   $$\text{Global\_Hit} = \text{Hit}_0 \quad \mathbf{\text{OR}} \quad \text{Hit}_1 \quad \mathbf{\text{OR}} \quad \text{Hit}_2 \quad \mathbf{\text{OR}} \quad \text{Hit}_3$$

   Where:
   * $\text{Hit}_k$ is the Boolean hit signal for way $k$ ($0 \le k \le 3$).
   * $V_k$ is the Valid bit for way $k$.
   * $\text{Stored\_Tag}_k$ is the 51-bit tag read from way $k$.
   * $\text{Address\_Tag}$ is bits $[63:13]$ of the CPU virtual/physical address.
   * $\text{Global\_Hit}$ is the logical OR of all individual way hit signals.

4. **Hit Processing ($\text{Global\_Hit} == 1$)**:
   * **If Read Operation (`cpu_we == 0`)**:
     * Way MUX selects the matching way. Offset bits $[5:0]$ select the 64-bit word.
     * `cpu_rdata` is driven to the CPU. `cpu_ready = 1` is maintained.
     * Tree-PLRU state machine updates its 3 directional bits for that set.
     * **State Transition**: Remains in `ST_IDLE_LOOKUP`!
   * **If Write Operation (`cpu_we == 1`)**:
     * Selected way's SRAM data payload is updated with `cpu_wdata` using `cpu_byte_en[7:0]`.
     * Selected way's **Dirty Bit is set to $1$ ($D_k \Leftarrow 1$)**.
     * Tree-PLRU state machine updates its 3 directional bits for that set.
     * `cpu_ready = 1` is maintained. Zero bus transactions are issued!
     * **State Transition**: Remains in `ST_IDLE_LOOKUP`!
5. **Miss Processing ($\text{Global\_Hit} == 0$)**:
   * The cache controller **asserts `cpu_ready = 0`**, freezing the CPU pipeline instantly!
   * **State Transition**: Moves to `ST_EVICT_CHECK` on the next clock edge!

---

### State 2: `ST_EVICT_CHECK` (Victim Inspection)

In `ST_EVICT_CHECK`, the cache controller analyzes the victim line selected for eviction by the Tree-PLRU replacement engine.

#### Hardware Actions in `ST_EVICT_CHECK`:
1. The Tree-PLRU engine decodes the 3 tree bits ($B_0, B_1, B_2$) for the indexed set, generating a One-Hot victim way select vector $(E_3, E_2, E_1, E_0)$.
2. The controller reads the Valid bit ($V_{\text{victim}}$) and Dirty bit ($D_{\text{victim}}$) of the selected victim way:
   * **Case A: Victim is Invalid or Clean ($V_{\text{victim}} == 0 \quad \mathbf{\text{OR}} \quad D_{\text{victim}} == 0$)**:
     No dirty write-back is required! The victim slot can be silently overwritten.
     **State Transition**: Moves directly to `ST_MEM_READ`!
   * **Case B: Victim is Valid and Dirty ($V_{\text{victim}} == 1 \quad \mathbf{\text{AND}} \quad D_{\text{victim}} == 1$)**:
     The victim line contains modified data that exists nowhere else in the computer!
     **State Transition**: Moves to `ST_WBB_PUSH`!

---

### State 3: `ST_WBB_PUSH` (Non-Blocking Write-Back Offloading)

In `ST_WBB_PUSH`, the controller offloads the dirty victim line into the Write-Back Buffer (WBB) to clear the SRAM slot immediately.

#### Hardware Actions in `ST_WBB_PUSH`:
1. The 64-byte dirty payload and its 51-bit physical tag are copied from the SRAM array into an open slot in the Write-Back Buffer FIFO queue.
2. The victim slot's Dirty Bit is cleared ($D_{\text{victim}} \Leftarrow 0$).
3. The background memory bus controller is notified that a new dirty line is ready in WBB for background flushing to L2/DRAM.
4. **State Transition**: Moves to `ST_MEM_READ` on the very next clock edge!

```text
WBB OFFLOADING IN ST_WBB_PUSH

 ┌──────────────────────────────────┐
 │ L1 SRAM Victim Slot (Set 12)     │
 │ Payload: [64 Bytes Dirty Data]   │
 └────────────────┬─────────────────┘
                  │
                  ▼ Copied in 1 Clock Cycle!
 ┌──────────────────────────────────┐
 │ Write-Back Buffer Queue (WBB)    ├─► Background Memory Bus Flush
 └──────────────────────────────────┘   (Does NOT stall CPU read fill!)
```

---

### State 4: `ST_MEM_READ` (Issuing Line Fill Request)

In `ST_MEM_READ`, the controller issues a 64-byte line fill read request to the lower-level memory interconnect (L2 Cache or main DRAM).

#### Hardware Actions in `ST_MEM_READ`:
1. The controller asserts `mem_req = 1`, `mem_we = 0` (Read request).
2. Sets `mem_addr` to the 64-byte aligned block address of the missing line:

$$\text{mem\_addr} = \text{cpu\_addr} \quad \mathbf{\&} \quad \sim 63$$

Where:
* $\text{mem\_addr}$ is the 64-byte aligned block address sent over the bus.
* $\text{cpu\_addr}$ is the target virtual/physical address requested by the CPU.
* $\sim 63$ is the bitwise mask clearing the lowest 6 offset bits.

3. Waits for lower memory to acknowledge the request (`mem_ready == 1`).
4. **State Transition**: Once `mem_ready == 1` is received, moves to `ST_REFILL_WAIT`!

---

### State 5: `ST_REFILL_WAIT` (Line Fill & Critical-Word-First Forwarding)

In `ST_REFILL_WAIT`, the controller receives the 64-byte incoming data line from lower-level memory, writes it into the SRAM array, and restarts the CPU pipeline.

#### Hardware Actions in `ST_REFILL_WAIT`:
1. **Critical-Word-First Forwarding**: The moment the first 64-bit sub-word containing the CPU's requested address arrives on `mem_rdata[511:0]`, the controller forwards it directly to `cpu_rdata`!
2. **SRAM Line Write**: The full 64-byte payload is written into the victim way slot of the target set.
3. **Metadata Update**:
   * The new address Tag is written into the victim way's Tag array slot.
   * Valid bit is set to $1$ ($V_{\text{victim}} \Leftarrow 1$).
   * **If original operation was a Read**: Dirty bit is set to $0$ ($D_{\text{victim}} \Leftarrow 0$).
   * **If original operation was a Write**: The new store payload is merged into the line, and Dirty bit is set to $1$ ($D_{\text{victim}} \Leftarrow 1$).
4. **Tree-PLRU Update**: The Tree-PLRU engine updates its 3 directional bits for that set to mark the newly filled way as most recently used.
5. **CPU Pipeline Restart**: The controller **asserts `cpu_ready = 1`**, releasing the CPU stall signal!
6. **State Transition**: Returns to `ST_IDLE_LOOKUP` on the next clock edge!

```text
COMPLETE CACHE CONTROLLER FSM STATE ACTION MATRIX

 State Name      │ cpu_ready │ mem_req │ mem_we │ Key Action Performed
─────────────────┼───────────┼─────────┼────────┼───────────────────────────────────────────────────────────
 ST_IDLE_LOOKUP  │     1     │    0    │   0    │ 1-Cycle SRAM Read/Write Hit; evaluates comparators.
 ST_EVICT_CHECK  │     0     │    0    │   0    │ Inspects Tree-PLRU victim way; checks V and D bits.
 ST_WBB_PUSH     │     0     │    0    │   0    │ Offloads 64B dirty line to WBB queue in 1 clock cycle.
 ST_MEM_READ     │     0     │    1    │   0    │ Issues 64B line-fill read command to L2 / main DRAM.
 ST_REFILL_WAIT  │     0     │    0    │   0    │ Forwards Critical Word, updates SRAM & Tag, sets cpu_ready=1.
```

---

## Critical Path Timing Analysis and Synthesis Optimization Strategies

In modern $4.0\text{-GHz}$ processors, synthesizing an integrated cache controller presents severe **Static Timing Analysis (STA)** challenges.

Let us trace the three primary critical path timing loops inside the integrated cache subsystem to understand where timing bottlenecks occur and how hardware architects optimize them.

---

### Critical Path 1: The L1 Cache Hit Read Path

The **L1 Cache Hit Read Path** is the most time-critical path on the entire microchip die. It dictates the maximum clock frequency of the processor core:

$$\text{Path 1}: \text{CPU Address} \longrightarrow \text{Index Decoder} \longrightarrow \text{SRAM Read} \longrightarrow \text{Tag Compare} \longrightarrow \text{Way MUX} \longrightarrow \text{Offset MUX} \longrightarrow \text{CPU Register}$$

```text
CRITICAL PATH 1 TIMING BREAKDOWN

 CPU Address Dispatch (t_C2Q = 30 ps)
       │
       ▼
 SRAM Index Row Decoder (t_decode = 50 ps)
       │
       ▼
 SRAM Tag & Data Array Read (t_sram = 120 ps)
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
 Tag Comparator (t_comp = 80 ps)         Data Lines Output (64 Bytes)
       │                                         │
       ▼                                         │
 Hit Logic AND-OR (t_hit = 30 ps)                │
       │                                         │
       ▼ One-Hot Select Vector                   │
 ┌───────────────────────────────────────────────┴──────────────┐
 │ 4-to-1 Way Selection Multiplexer (t_wmux = 40 ps)            │
 └──────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 64-to-1 Byte Offset Selection Multiplexer (t_omux = 50 ps)   │
 └──────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
 CPU Register File Write-Back Setup (t_su = 25 ps)
 (Total Path Delay = 30 + 50 + 120 + 80 + 30 + 40 + 50 + 25 = 425 ps!)
```

Let us calculate the total un-pipelined delay along this critical path:

$$T_{\text{path1}} = t_{\text{C2Q}} + t_{\text{decode}} + t_{\text{sram}} + t_{\text{comp}} + t_{\text{hit}} + t_{\text{wmux}} + t_{\text{omux}} + t_{\text{su}}$$

Where:
* $t_{\text{C2Q}}$ is the clock-to-Q output delay of the address register ($30\text{ ps}$).
* $t_{\text{decode}}$ is the SRAM row decoder logic delay ($50\text{ ps}$).
* $t_{\text{sram}}$ is the SRAM array bit-line sensing time ($120\text{ ps}$).
* $t_{\text{comp}}$ is the 51-bit parallel tag comparator delay ($80\text{ ps}$).
* $t_{\text{hit}}$ is the hit logic AND-OR tree delay ($30\text{ ps}$).
* $t_{\text{wmux}}$ is the 4-to-1 way selection multiplexer delay ($40\text{ ps}$).
* $t_{\text{omux}}$ is the 64-to-1 byte offset selection multiplexer delay ($50\text{ ps}$).
* $t_{\text{su}}$ is the destination register setup time ($25\text{ ps}$).

Substitute the timing values:

$$T_{\text{path1}} = 30\text{ ps} + 50\text{ ps} + 120\text{ ps} + 80\text{ ps} + 30\text{ ps} + 40\text{ ps} + 50\text{ ps} + 25\text{ ps} = \mathbf{425 \text{ picoseconds}}$$

If $T_{\text{path1}} = 425\text{ ps}$, the maximum clock frequency without pipelining is:

$$f_{\text{max}} = \frac{1}{425\text{ ps}} = \mathbf{2.35 \text{ GHz}}$$

If our target CPU clock frequency is **$4.0\text{ GHz}$** ($T_{\text{clk}} = 250\text{ ps}$), this $425\text{-ps}$ path **FAILS TIMING CLOSURE** by $175\text{ picoseconds}$!

---

### Industrial Optimization Strategy: Speculative Way Steering

How do high-performance commercial processor synthesis tools close timing on L1 caches at $4.0\text{ GHz}$?

They use **Speculative Way Steering (Fast-Path Speculation)**!

#### How Speculative Way Steering Works:
1. Instead of waiting for the $80\text{-ps}$ Tag comparison and $30\text{-ps}$ Hit logic to finish before driving the 4-to-1 Way Selection MUX, the cache controller **predicts which way will hit in advance** (for example, predicting that Way 0 will hit using the Tree-PLRU state)!
2. The MUX steers Way 0's data payload to the CPU register file **speculatively** during SRAM sensing ($t = 200\text{ ps}$).
3. In parallel, the Tag comparators evaluate.
   * **If Way 0 Hits (90% of the time!)**: Data is ALREADY at the CPU register! The Tag comparison merely validates the speculative read. Hit latency drops from $425\text{ ps}$ down to **$220\text{ ps}$**, meeting $4.0\text{ GHz}$ timing closure!
   * **If Way 0 Misses but Way 2 Hits**: The speculation failed. The controller cancels the register write, stalls the pipeline for 1 extra clock cycle, and steers Way 2's data on the second cycle.

```text
SPECULATIVE WAY STEERING TIMING ACCELERATION

 Standard Sequential Path : [ SRAM Read ] ──► [ Tag Compare ] ──► [ Way MUX ] ──► Data (425 ps - FAILS!)

 Speculative Fast Path    : [ SRAM Read ] ──► [ Speculative Way MUX ] ───────────► Data (220 ps - PASSED!)
                            [ Tag Compare (Validates in Parallel) ]
```

Speculative way steering breaks the long Tag-Compare-to-Way-MUX feedback loop, allowing L1 data caches to achieve multi-gigahertz execution speeds!

---

## Solved Industrial Engineering Exercise: Complete 4-Way L1 Cache Subsystem FSM Trace and Timing Analysis

To consolidate your complete mastery of single-core integrated cache synthesis, control FSM state transitions, Write-Back Buffer offloading, and critical path timing analysis, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the integrated L1 Data Cache subsystem for a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution CPI of $\text{CPI}_{\text{ideal}} = 1.0\text{ cycle/instruction}$.

The L1 Data Cache is an **Integrated $32\text{-KB}$ 4-Way Set-Associative Cache**:
* Total Capacity $C = 32\text{ KB} = 32,768\text{ bytes}$.
* Line Size $L = 64\text{ bytes}$ ($S = 128\text{ sets}$, $I = 7\text{ bits}$, $O = 6\text{ bits}$, $T = 51\text{ bits}$).
* Write Policy: **Write-Back with Write-Allocate**.
* Replacement Policy: **3-bit Tree-PLRU per set**.
* Queue Hardware: **2-entry Write-Back Buffer (WBB)**.

```text
3.2 GHz INTEGRATED L1 CACHE SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ L1 Data Cache Controller FSM ] ──► [ Write-Back Buffer ] ──► L2 Cache
 Clock T = 312.5 ps     (ST_IDLE -> ST_EVICT -> ST_REFILL)    (2-Entry 64B Queue)      Hit = 12c
```

#### Memory Interconnect & L2 Cache Latencies:
* Shared L2 Cache Read Line-Fill Latency: $T_{\text{L2\_read}} = 12\text{ clock cycles}$ ($3.75\text{ ns}$).
* Shared L2 Cache Write-Back Drain Latency: $T_{\text{L2\_write}} = 8\text{ clock cycles}$ ($2.50\text{ ns}$).

#### Initial Subsystem State at Set Row 0 (Bits $[12:6] = \text{7'b0000000}_2$):
All 4 ways in Set 0 are currently occupied by valid data lines:
* **Way 0**: Tag = `0x0000_0000_0001_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0004_0000`).
* **Way 1**: Tag = `0x0000_0000_0002_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0008_0000`).
* **Way 2**: Tag = `0x0000_0000_0003_0`, Valid = 1, Dirty = 1 (Holds DIRTY line at `0x0000_0000_000C_0000`).
* **Way 3**: Tag = `0x0000_0000_0004_0`, Valid = 1, Dirty = 0 (Holds line at `0x0000_0000_0010_0000`).
* **Tree-PLRU Bits**: Currently point to **Way 2 as the victim candidate** ($B_0 = 1, B_2 = 0$).

#### The Workload Execution Sequence:
The CPU pipeline executes three consecutive memory operations targeting Set Row 0:
* **Operation 1 (Clock Cycle 1)**: `LOAD R1, [0x0000_0000_0004_0000]` (Targeting Way 0).
* **Operation 2 (Clock Cycle 2)**: `STORE R2, [0x0000_0000_0004_0008]` (Targeting Way 0).
* **Operation 3 (Clock Cycle 3)**: `LOAD R3, [0x0000_0000_0005_0000]` (Targeting new address mapping to Set 0!).

#### Your Objective

1. Trace the Master Cache Controller FSM state transitions, internal signal assertions, and bit flag updates for **Operation 1** (`LOAD` hit on Way 0).
2. Trace the Master Cache Controller FSM state transitions, internal signal assertions, and bit flag updates for **Operation 2** (`STORE` hit on Way 0). Show the exact Dirty bit update ($D_0 \Leftarrow 1$).
3. Trace the Master Cache Controller FSM state transitions across ALL phases for **Operation 3** (`LOAD` miss targeting Set 0 where victim Way 2 is DIRTY):
   * Trace FSM states: `ST_IDLE_LOOKUP` $\to$ `ST_EVICT_CHECK` $\to$ `ST_WBB_PUSH` $\to$ `ST_MEM_READ` $\to$ `ST_REFILL_WAIT` $\to$ `ST_IDLE_LOOKUP`.
   * Trace WBB buffer queue loading and background L2 write-back.
4. Calculate the total CPU stall cycles incurred during Operation 3 **with** the Write-Back Buffer versus **without** a Write-Back Buffer.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Trace Operation 1 — Load Hit on Way 0 (`0x0000_0000_0004_0000`)

##### Cycle 1 Execution (`ST_IDLE_LOOKUP`):
1. Address `0x0000_0000_0004_0000` arrives from CPU (`cpu_req = 1`, `cpu_we = 0`).
   * Index bits $[12:6] = \text{7'b0000000}_2 \implies$ Set Row 0.
   * Tag bits $[63:13] = \text{51'h0000\_0000\_0001\_0}$.
2. Index decoder activates Set Row 0 in SRAM array.
3. 4 parallel comparators compare Tag:
   * Way 0: Stored Tag = `0x0000_0000_0001_0`, Valid = 1 $\implies$ **`Hit_0 = 1`**!
   * Ways 1, 2, 3: Tag Mismatch $\implies \text{Hit}_{1..3} = 0$.
4. Global Hit evaluated: $\text{Global\_Hit} = 1$.
5. **Data Steering**: Way 0 data payload is routed to 64-to-1 Offset MUX ($\text{Offset} = 0$). Word `0x0000_0000_0004_0000` is driven to `cpu_rdata`.
6. **Control Assertions**: `cpu_ready = 1` (No CPU stall!).
7. **Tree-PLRU State Update**:
   Way 0 hit forces Tree-PLRU bits to point AWAY from Way 0 $\implies$ $B_0 \Leftarrow 1, B_1 \Leftarrow 1$.
8. **FSM State**: Remains in **`ST_IDLE_LOOKUP`**! Operation completes in **1 clock cycle** ($0.3125\text{ ns}$).

---

#### Step 2: Trace Operation 2 — Store Hit on Way 0 (`0x0000_0000_0004_0008`)

##### Cycle 2 Execution (`ST_IDLE_LOOKUP`):
1. Address `0x0000_0000_0004_0008` arrives from CPU (`cpu_req = 1`, `cpu_we = 1`, `cpu_wdata = 64'h1234_5678_9ABC_DEF0`).
   * Index bits $[12:6] = \text{7'b0000000}_2 \implies$ Set Row 0.
   * Tag bits $[63:13] = \text{51'h0000\_0000\_0001\_0}$.
2. Parallel comparators evaluate: Way 0 matches! $\text{Hit}_0 = 1 \implies \text{Global\_Hit} = 1$.
3. **Data Write**: `cpu_wdata` is written into Way 0 SRAM data payload at offset index 8.
4. **Dirty Bit Update**: Way 0 Dirty bit is set to $1$ ($\mathbf{D_0 \Leftarrow 1}$).
5. **Control Assertions**: `cpu_ready = 1`. **ZERO memory bus commands issued!**
6. **Tree-PLRU State Update**: $B_0 \Leftarrow 1, B_1 \Leftarrow 1$.
7. **FSM State**: Remains in **`ST_IDLE_LOOKUP`**! Operation completes in **1 clock cycle** ($0.3125\text{ ns}$).

```text
STATE OF SET ROW 0 AFTER OPERATION 2

 Set 0 Way 0 : Tag = 0x0000_0000_0001_0 | Valid = 1 | DIRTY = 1 (Modified!)
 Set 0 Way 1 : Tag = 0x0000_0000_0002_0 | Valid = 1 | Dirty = 0
 Set 0 Way 2 : Tag = 0x0000_0000_0003_0 | Valid = 1 | DIRTY = 1
 Set 0 Way 3 : Tag = 0x0000_0000_0004_0 | Valid = 1 | Dirty = 0
 Tree-PLRU Candidate Way for Eviction : WAY 2 (B0 = 1, B2 = 0)
```

---

#### Step 3: Trace Operation 3 — Load Miss on `0x0000_0000_0005_0000` (Dirty Eviction)

##### Cycle 3: Lookup Phase (`ST_IDLE_LOOKUP`)
1. Address `0x0000_0000_0005_0000` arrives (`cpu_req = 1`, `cpu_we = 0`).
   * Index bits $[12:6] = \text{7'b0000000}_2 \implies$ Set Row 0.
   * Tag bits $[63:13] = \text{51'h0000\_0000\_0005\_0}$.
2. Parallel comparators evaluate: Stored tags are `0x1_0, 0x2_0, 0x3_0, 0x4_0`. None match `0x5_0`!
3. **$\text{Global\_Hit} = 0$ (CACHE MISS!)**.
4. Controller asserts **`cpu_ready = 0` (CPU PIPELINE STALLED!)**.
5. FSM transitions to **`ST_EVICT_CHECK`**!

---

##### Cycle 4: Victim Inspection Phase (`ST_EVICT_CHECK`)
1. Tree-PLRU decoder inspects current tree bits ($B_0 = 1, B_2 = 0$) and identifies **Way 2 as the victim way**.
2. Controller reads Way 2 metadata:
   * Tag = `0x0000_0000_0003_0` (Address `0x0000_0000_000C_0000`).
   * Valid bit $V_2 = 1$.
   * **Dirty bit $D_2 = 1$ (VICTIM LINE IS DIRTY!)**.
3. Because $D_2 == 1$, the dirty line must be offloaded before overwriting!
4. FSM transitions to **`ST_WBB_PUSH`**!

---

##### Cycle 5: WBB Offloading Phase (`ST_WBB_PUSH`)
1. The 64-byte dirty line at Way 2 and its Tag (`0x0000_0000_0003_0`) are copied into the **Write-Back Buffer (WBB)** in $1\text{ clock cycle}$.
2. Way 2 Dirty bit is cleared ($D_2 \Leftarrow 0$). Way 2 slot is now empty and ready for new data!
3. The background WBB bus controller begins a $8\text{-cycle}$ background write-back of Way 2 data to L2 Cache.
4. FSM transitions to **`ST_MEM_READ`**!

---

##### Cycle 6: Memory Bus Line Fill Request (`ST_MEM_READ`)
1. Controller dispatches read request to L2 Cache:
   * `mem_req = 1`, `mem_we = 0`.
   * `mem_addr = 0x0000_0000_0005_0000`.
2. L2 Cache acknowledges request (`mem_ready = 1`).
3. FSM transitions to **`ST_REFILL_WAIT`**!

---

##### Cycles 7 to 18: Line Fill Streaming & Critical Word Forwarding (`ST_REFILL_WAIT`)
1. L2 Cache processes line fill ($T_{\text{L2\_read}} = 12\text{ clock cycles}$).
2. On Cycle 18 ($12\text{ cycles}$ after read request):
   * L2 Cache returns 64-byte payload on `mem_rdata[511:0]`.
   * **Critical-Word-First Forwarding**: Word at offset 0 (`0x0000_0000_0005_0000`) is driven directly to `cpu_rdata`.
   * The 64-byte payload is written into Way 2 SRAM data array.
   * Way 2 Tag is updated to `0x0000_0000_0005_0000`. Valid bit $V_2 \Leftarrow 1$, Dirty bit $D_2 \Leftarrow 0$.
   * Tree-PLRU bits updated ($B_0 \Leftarrow 0, B_2 \Leftarrow 1$).
   * Controller asserts **`cpu_ready = 1` (CPU PIPELINE RESTARTED!)**.
3. FSM transitions back to **`ST_IDLE_LOOKUP`** on Cycle 19!

```text
OPERATION 3 MULTI-CYCLE SUBSYSTEM EXECUTION TRACE

 Cycle │ FSM State      │ cpu_ready │ mem_req │ WBB State │ Subsystem Action
───────┼────────────────┼───────────┼─────────┼───────────┼─────────────────────────────────────────────
   3   │ ST_IDLE_LOOKUP │     1     │    0    │   Empty   │ Tag Compare -> MISS! Assert cpu_ready = 0
   4   │ ST_EVICT_CHECK │     0     │    0    │   Empty   │ Tree-PLRU picks Way 2. D2 = 1 (DIRTY!)
   5   │ ST_WBB_PUSH    │     0     │    0    │  Pushed   │ Move Way 2 to WBB. Clear D2 = 0.
   6   │ ST_MEM_READ    │     0     │    1    │  Flushing │ Issue Read Line Fill to L2 Cache.
 7..17 │ ST_REFILL_WAIT │     0     │    0    │  Flushing │ Waiting for L2 line fill (12 Cycles)
  18   │ ST_REFILL_WAIT │     0     │    0    │   Empty   │ Forward Critical Word! Set cpu_ready = 1!
  19   │ ST_IDLE_LOOKUP │     1     │    0    │   Empty   │ Pipeline Resumes! (16 Total Stall Cycles)
```

---

#### Step 4: Calculate CPU Stall Cycles With vs Without Write-Back Buffer

Let us compare the CPU stall penalty for Operation 3 under two hardware configurations:

##### Configuration A: With Write-Back Buffer (WBB Queue Installed)
* Cycle 3: Miss detected.
* Cycle 4: Inspect Way 2.
* Cycle 5: Move Way 2 to WBB ($1\text{ cycle}$).
* Cycle 6: Issue L2 Read Fill ($1\text{ cycle}$).
* Cycles 7..18: L2 Read Fill Wait ($12\text{ cycles}$).
* Cycle 18: Critical Word Forwarded, `cpu_ready = 1` asserted.

$$\text{Total CPU Stall Cycles (With WBB)} = 18 - 2 = \mathbf{16 \text{ clock cycles}} \quad (5.0\text{ ns})$$

##### Configuration B: Naive Sequential Eviction (No WBB Queue)
Without a WBB queue, the controller must write dirty Way 2 back to L2 Cache **BEFORE** issuing the read fill for Line $A_3$:
* Step 1: Write-back dirty Way 2 to L2 Cache ($T_{\text{L2\_write}} = 8\text{ clock cycles}$).
* Step 2: Issue Read Line Fill for Line $A_3$ to L2 Cache ($1\text{ cycle}$).
* Step 3: Wait for L2 Read Line Fill ($T_{\text{L2\_read}} = 12\text{ clock cycles}$).

$$\text{Total CPU Stall Cycles (No WBB)} = 1 + 8 + 1 + 12 = \mathbf{22 \text{ clock cycles}} \quad (6.875\text{ ns})$$

##### Performance Advantage of Write-Back Buffer:

$$\text{Stall Reduction} = 22\text{ cycles} - 16\text{ cycles} = \mathbf{6 \text{ clock cycles saved per dirty miss!}}$$

$$\text{Latency Reduction Percentage} = \frac{6}{22} \times 100\% = \mathbf{27.3\% \text{ Stall Reduction!}}$$

By offloading the dirty line into a Write-Back Buffer, the integrated cache controller reduced CPU stall latency during dirty miss evictions by **$27.3\%$**, allowing the processor pipeline to restart 6 clock cycles earlier!

---

### Sanity Check and Verification

Let us verify our integrated subsystem execution trace against hardware pipeline principles:

1. **Hit Path Latency Check**:
   * Operations 1 and 2 completed in `ST_IDLE_LOOKUP` in **$1\text{ clock cycle}$**, matching $T_{\text{hit}} = 1$ requirements.
2. **Dirty Bit Invariant**:
   * Operation 2 updated Way 0 data and set $D_0 \Leftarrow 1$.
   * No memory bus write commands were generated, verifying $100\%$ local SRAM store filtering.
3. **WBB Non-Blocking Decoupling**:
   * Operation 3 moved dirty Way 2 to the WBB in 1 cycle.
   * The L2 read request was issued on Cycle 6, completely un-blocked by the dirty writeback.
   * `cpu_ready` was restored on Cycle 18, matching $16\text{ stall cycles}$.

All FSM state transitions, signal assertions, SRAM bit operations, and WBB timing accelerations evaluate with 100% mathematical, physical, and logical precision. The integrated single-core cache subsystem is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Integrated Single-Core Cache**: A clock-synchronous hardware memory subsystem that integrates SRAM tag/data matrices, parallel tag comparators, Tree-PLRU replacement engines, Write-Back Buffers, and line refill units into a single cohesive module governed by a master control state machine.
* **Cache Controller Datapath**: The physical inter-unit interconnect topology and control state machine (`ST_IDLE_LOOKUP` $\to$ `ST_EVICT_CHECK` $\to$ `ST_WBB_PUSH` $\to$ `ST_MEM_READ` $\to$ `ST_REFILL_WAIT`) that manages hit/miss determination, pipeline stall signal driving (`cpu_ready`), non-blocking dirty line offloading, and Critical-Word-First data forwarding.
