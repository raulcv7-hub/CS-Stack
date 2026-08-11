content/00-digital-hardware-foundations/04-memory-subsystems/lessons/05-numa-topologies-system-integration/01-numa-directory-architecture/02-directory-based-coherence-architecture.md
# Directory-Based Coherence Architecture and Point-to-Point Invalidation

## The Broadcast Scalability Limit and the Point-to-Point Coherence Wall

In multi-socket high-performance computing systems, processing power is scaled by interconnecting multiple processor sockets—known as **Non-Uniform Memory Access (NUMA) Nodes**—over high-speed point-to-point networks (such as Intel UPI, AMD Infinity Fabric, or ARM CoreLink). Each NUMA node contains a cluster of CPU execution cores, private L1/L2 caches, a shared L3 cache, and an integrated memory controller connected to local Dynamic Random-Access Memory (DRAM).

To ensure that software threads running concurrently across different NUMA nodes always read correct, up-to-date values for shared memory addresses, the multi-socket hardware must enforce **The Single-Writer Multiple-Reader (SWMR) Invariant**:

$$\text{At any instant in time for address } A \text{:}$$
$$\text{Either } \mathbf{\text{One Core has Exclusive Write Access}} \quad \text{OR} \quad \mathbf{\text{Multiple Cores have Read-Only Access}}$$

In small-scale multi-core processors (2 to 8 cores), hardware coherence is traditionally enforced using **Bus Snooping Protocols**. 

Under a bus snooping protocol, when Core 0 wants to write to a shared memory line, it broadcasts a write invalidation message (`BUS_INV` or `BUS_RFO`) across a shared interconnect bus. Every other core on the chip "snoops" (eavesdrops on) the bus address wires and invalidates its local copy if a match is found.

However, when system designers attempt to scale multi-socket server platforms to **16, 32, 64, or 128 processor sockets**, Bus Snooping encounters a severe physical wall: **The Broadcast Scalability Limit**.

```text
THE SNOOPING BROADCAST TRAFFIC EXPLOSION (N = 64 SOCKETS)

 Socket 0 Wants to Write Line A
                   │
                   ▼
 BROADCASTS INVALIDATION TO ALL 63 OTHER SOCKETS ACROSS POINT-TO-POINT LINKS!
                   │
 ┌─────────────────┼─────────────────┬─────────────────┬─────────────────┐
 ▼                 ▼                 ▼                 ▼                 ▼
Socket 1          Socket 2          Socket 3          Socket 4    ... Socket 63
(Snoops & Checks) (Snoops & Checks) (Snoops & Checks) (Snoops & Checks) (Snoops!)
 └─────────────────┴─────────────────┴─────────────────┴─────────────────┘
  (63 Invalidation Packets FLOOD Point-to-Point Links! Interconnect Collapses!)
```

Look at the physical interconnect explosion that occurs under bus snooping as socket count $N$ increases:
1. **$O(N^2)$ Message Traffic Expansion**: On a point-to-point network topology (such as a 2D mesh, torus, or HyperTransport network), there is no single shared wire that all 64 sockets can listen to at once.
2. To emulate a broadcast on a 64-socket network, Node 0 must transmit **63 separate invalidation packets** across the point-to-point links.
3. If all 64 sockets are actively executing multi-threaded software, the interconnect network is bombarded with **thousands of broadcast invalidation packets every single microsecond**!
4. **Massive Interconnect Congestion**: Over $95\%$ of these broadcast invalidations target sockets that **DO NOT EVEN HOLD A COPY** of line $A$!

Why should Node 0 broadcast invalidation messages to 63 remote sockets across the network, disturbing 63 remote CPU caches, when **only Node 5 and Node 12 actually hold copies of line $A$**?

We have encountered **The Point-to-Point Coherence Wall**.

To eliminate broadcast traffic and enable multi-socket server platforms to scale to hundreds of cores with linear performance growth, computer hardware architects replace broadcast snooping with **Directory-Based Coherence Architecture**.

Under a Directory-Based Coherence scheme, system memory is partitioned among the NUMA nodes, and every physical DRAM block is assigned a **Home Node**. 

The Home Node's memory controller maintains a tracking table called **The Coherence Directory**.

The Directory records the exact state of every memory line owned by that Home Node and maintains a **Presence Vector (Sharer List)** tracking *exactly which specific NUMA nodes currently hold copies of that line in their private caches*.

When Node 0 wants to write to line $A$, it sends a single request packet to Line $A$'s Home Node. The Home Node checks line $A$'s Presence Vector, sees that *only* Node 5 and Node 12 hold copies, and sends **targeted point-to-point invalidation messages ONLY to Node 5 and Node 12**! 

Nodes 1, 2, 3, 4, 6, 7... receive **ZERO messages**, and the point-to-point network remains completely un-congested!

---

## The Central Guest Registry and the Targeted Message Courier: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of directory-based coherence, presence vectors, and targeted point-to-point invalidations before analyzing bit-vector state matrices and invalidation acknowledgment protocols, let us consider an everyday analogy: **The Multi-Tower Luxury Hotel**.

Imagine a massive luxury hotel resort featuring **64 separate hotel towers** (**NUMA Nodes 0 through 63**). Each tower has its own private guest rooms (**Private L1/L2 Caches**).

```text
THE MULTI-TOWER LUXURY HOTEL METAPHOR

 Tower 0 (Node 0)                     Tower 1 (Node 1)
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ Guest Rooms (L1/L2 Cache) │        │ Guest Rooms (L1/L2 Cache) │
 └───────────────────────────┘        └───────────────────────────┘
               │                                   │
               ▼                                   ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ TOWER 0 CENTRAL FRONT DESK REGISTRY (Home Node Directory)       │
 │ Tracks Master Book Copies & Room Guest Presence Vectors       │
 └────────────────────────────────────────────────────────────────┘
```

The resort maintains a rare book collection (**Main System DRAM Memory**). Each rare book is assigned to a specific **Home Tower** where its master copy is cataloged.

Guests (**CPU Execution Cores**) in any tower can borrow copies of rare books to read in their private rooms.

Let us compare two different management policies for keeping the rare books synchronized when a guest wants to edit a book:

---

### Policy 1: The Loudspeaker Broadcast Policy (Bus Snooping)

The resort manager enforces a naive rule: *"Whenever a guest in Tower 0 wants to edit Book #42, a runner must run through ALL 63 OTHER TOWERS, knocking on ALL 10,000 ROOM DOORS, shouting: 'ERASE YOUR COPY OF BOOK #42!'"*

Look at what happens under Policy 1:
* The runner knocks on 10,000 room doors across 63 towers.
* In 61 of those towers, **NOBODY EVEN HAS A COPY OF BOOK #42**!
* 9,900 guests are woken up, interrupted, and annoyed for no reason (**Snoop Probe Overhead**).
* The hallways are jammed with runners running back and forth.

This is the **Snooping Broadcast Traffic Explosion**.

---

### Policy 2: The Front Desk Guest Registry (Directory-Based Coherence)

The resort manager fires the runners and installs a **Central Front Desk Guest Registry (The Coherence Directory)** at each book's Home Tower.

Whenever a guest borrows a copy of Book #42, the Front Desk clerk opens the **Guest Registry Logbook for Book #42** and marks down the guest's room number:

```text
FRONT DESK REGISTRY LOGBOOK FOR BOOK #42 (DIRECTORY ENTRY)

 Book Status        : SHARED (Read-Only Copy)
 Presence Vector    : [ Tower 5, Room 12 | Tower 12, Room 4 ]
                      (ONLY Towers 5 and 12 hold copies!)
```

Now, watch how Policy 2 processes a request when Guest 0 (in Tower 0) wants to **edit Book #42**:

1. **Step 1 (Request to Home Tower)**: Guest 0 sends a single private message to Book #42's Home Tower Front Desk: *"I want exclusive write permission for Book #42!"*
2. **Step 2 (Registry Lookup)**: The Front Desk clerk opens the logbook for Book #42 and inspects the Presence Vector:
   $$\text{Presence Vector} \implies \text{Tower 5 and Tower 12 ONLY!}$$
3. **Step 3 (Targeted Point-to-Point Messaging)**:
   * The clerk sends a targeted message to **Tower 5**: *"Please invalidate Book #42!"*
   * The clerk sends a targeted message to **Tower 12**: *"Please invalidate Book #42!"*
   * **Towers 1..4, 6..11, 13..63 receive ZERO MESSAGES!** Guests in those 61 towers continue sleeping peacefully without a single distraction!
4. **Step 4 (Acknowledgments)**: Guest 5 and Guest 12 erase their copies and text back to the Front Desk: *"Invalidated!"* (**Invalidation Acknowledgment `InvAck`**).
5. **Step 5 (Ownership Granted)**: The Front Desk clerk updates the logbook (`Status = EXCLUSIVE, Presence = Tower 0`) and sends Book #42 to Guest 0 with exclusive write permission!

```text
TARGETED DIRECTORY INVALIDATION SEQUENCE

 Guest 0 requests Write Permission for Book #42 ──► Home Front Desk
                                                    │
                                  Checks Registry Logbook for Book #42:
                                  "Only Tower 5 and Tower 12 have copies!"
                                                    │
                   ┌────────────────────────────────┴────────────────┐
                   ▼ Targeted Message                                ▼ Targeted Message
            Tower 5 (Room 12)                                 Tower 12 (Room 4)
            Erases Copy & Sends Ack!                          Erases Copy & Sends Ack!
                   │                                                 │
                   └────────────────┬────────────────────────────────┘
                                    ▼
                     Both Acks Received at Front Desk!
                     Guest 0 Granted Exclusive Ownership!
                     (Towers 1..4, 6..11, 13..63 NEVER DISTURBED!)
```

Look at what Policy 2 achieved:
* **Zero Broadcast Flooding**: Instead of sending 63 broadcast messages, the Front Desk sent **exactly 2 targeted messages**! Network traffic dropped by $96.8\%$!
* **Zero Disruption to Uninvolved Towers**: 61 towers were never disturbed.
* **$100\%$ Guaranteed Safety**: Guest 0 was granted write permission *only after* Guest 5 and Guest 12 confirmed their copies were erased!

This hotel registry system is the exact physical analogue of **Directory-Based Coherence Architecture**:
* The 64 hotel towers are **NUMA Processor Nodes (Sockets 0..63)**.
* Guest rooms are **Private L1/L2 SRAM Caches**.
* The Front Desk Logbook is **The Coherence Directory Table**.
* The room presence list is **The Directory Presence Bit-Vector**.
* Targeted messages to Tower 5 and 12 are **Point-to-Point Invalidation Packets**.
* Texting back "Invalidated!" is an **Invalidation Acknowledgment (`InvAck`) Packet**.

---

## Primitive 1: Directory-Based Coherence Architecture

Now that we possess a clear intuitive mental model of the central guest registry, let us examine the formal engineering mechanics of **Directory-Based Coherence Architecture**.

In a directory-based multi-socket system, memory is partitioned across nodes using a **Home Node Mapping Scheme**.

For any physical address $A$ generated by any core in the system, address $A$ maps to a unique **Home Node ($N_{\text{home}}$)** responsible for managing line $A$'s coherence state:

$$\text{Address [63:0]} \xrightarrow{\quad \text{Home Node Mapping} \quad} N_{\text{home}} = \text{Address}[30:28] \pmod N$$

Where:
* $N_{\text{home}}$ is the unique ID of the NUMA node acting as the home directory controller for address $A$.
* $N$ is the total number of NUMA nodes in the system.

```text
HOME NODE DIRECTORY MAPPING TOPOLOGY

 Requesting Node 0 (Local Core Miss)
       │
       ▼ Sends Request Packet
 ┌─────────────────────────────────────────────────────────────┐
 │ HOME NODE N_home (Directory Controller & Local DRAM)        │
 │                                                             │
 │  ┌───────────────────────────────────────────────────────┐  │
 │  │ Coherence Directory Table                             │  │
 │  │ Address A : [ State: SHARED | Presence: 0000_0101 ]   │  │
 │  └───────────────────────────┬───────────────────────────┘  │
 └──────────────────────────────┼──────────────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼ Targeted Invalidation                     ▼ Targeted Invalidation
   Remote Node 0                               Remote Node 2
   (Clears Local Cache Line)                   (Clears Local Cache Line)
```

---

### The Three Fundamental Directory States

The Directory entry for each 64-byte memory line inside the Home Node's directory table maintains a **Directory State Register** alongside a **Presence Vector (Sharer List)**.

The Directory tracks three primary operational states:

```text
THE THREE CORE DIRECTORY STATES

 1. UNCACHED (U)
    Line is NOT held in any private L1/L2 cache.
    Clean data resides ONLY in Home Node DRAM.
    Presence Vector = [ 0000_0000 ... 0000 ] (All zeros)

 2. SHARED (S)
    Line is held in Read-Only state by 1 or MORE remote caches.
    Data matches Home Node DRAM.
    Presence Vector = [ 0000_0101 ... 0001 ] (Bits set for sharer nodes!)

 3. EXCLUSIVE / MODIFIED (EM)
    Line is held by EXACTLY ONE remote cache in Exclusive/Modified state.
    Home Node DRAM holds stale data!
    Presence Vector = [ 0000_0000 ... 0100 ] (Exactly ONE bit set for Owner!)
```

Let us dissect the physical meaning of each directory state:

#### 1. Uncached State ($U$)
* **Memory Status**: The 64-byte memory line resides in Home Node DRAM. No processor node in the entire computer holds a copy of this line in its private cache.
* **Presence Vector**: All bits in the presence vector are zero ($0000\dots0000_2$).

#### 2. Shared State ($S$)
* **Memory Status**: One or more processor nodes hold read-only copies of this line in their private caches. The data in Home Node DRAM is up to date.
* **Presence Vector**: A bitwise mask where $\text{Presence}[k] = 1$ indicates that Node $k$ holds a read-only copy of this line in its private cache.

#### 3. Exclusive / Modified State ($EM$)
* **Memory Status**: Exactly one processor node (Node $x$) holds exclusive read/write ownership of this line. Node $x$'s private cache holds modified data; Home Node DRAM holds stale data.
* **Presence Vector**: Exactly one bit is set ($\text{Presence}[x] = 1$), identifying Node $x$ as the **Owner Node**.

---

## Primitive 2: Directory State Vector Representations and Point-to-Point Invalidation

Now let us examine how the Directory Presence Vector is represented in hardware silicon, and how the directory executes **Point-to-Point Invalidation Sequences**.

### Directory Presence Vector Representation Schemes

How much memory area does the Coherence Directory require?

In a system with $N$ nodes, storing a full presence bitmask ($1\text{ bit per node}$) for every 64-byte ($512\text{-bit}$) line in DRAM introduces a physical memory overhead.

Hardware architects deploy three distinct Directory Representation Schemes depending on system scale:

```text
DIRECTORY PRESENCE VECTOR SCHEMES

 1. Full-Bit Vector (Dir_N)
    [ Bit 0 | Bit 1 | Bit 2 | Bit 3 | ... | Bit N-1 ]
    Stores 1 bit for EVERY node. Exact sharer tracking!
    Memory Overhead = N Bits / 512 Bits.

 2. Limited Pointers with Overflow (Dir_i B)
    [ Pointer 0 (6b) | Pointer 1 (6b) | Overflow Bit (1b) ]
    Stores 'i' explicit node ID pointers.
    If sharers > i, sets Overflow Bit and switches to Broadcast!

 3. Coarse-Grained Bit Vector
    [ Group 0 (4 Nodes) | Group 1 (4 Nodes) | Group 2 | Group 3 ]
    Each bit represents a CLUSTER of nodes (e.g., 1 bit per 4 sockets).
```

---

#### Scheme 1: Full-Bit Vector ($\text{Dir}_N$)
* **Structure**: Each directory entry contains a full $N$-bit mask ($\text{Presence}[N-1:0]$).
* **Exact Tracking**: Provides $100\%$ perfect sharer tracking. Invalidations are sent *only* to nodes that actually hold copies.
* **Memory Overhead Formula**:

$$\text{Overhead}_{\text{Dir\_N}} = \frac{N\text{ bits}}{512\text{ bits (64 Bytes)}} \times 100\%$$

Where:
* $N$ is the number of NUMA nodes in the system.
* $512\text{ bits}$ is the payload size of a single 64-byte cache line.

```text
FULL-BIT VECTOR OVERHEAD SCALING

 System Scale (N Nodes) │ Directory Entry Bits │ Memory Overhead %
────────────────────────┼──────────────────────┼───────────────────
 4 Sockets (N = 4)      │ 4 Bits + 2 State     │ 1.17% Memory Overhead
 16 Sockets (N = 16)    │ 16 Bits + 2 State    │ 3.51% Memory Overhead
 64 Sockets (N = 64)    │ 64 Bits + 2 State    │ 12.89% Memory Overhead!
 256 Sockets (N = 256)  │ 256 Bits + 2 State   │ 50.39% Memory Overhead! (Un-scalable!)
```

Notice that for $N \le 16$ sockets, a Full-Bit Vector consumes less than $4\%$ memory overhead. 

However, for $N = 64$ or $256$ sockets, the directory overhead explodes to $12.89\%\text{ or } 50.39\%$, demanding compressed directory structures!

---

#### Scheme 2: Limited Pointers with Overflow ($\text{Dir}_i B$)
Software profiling shows that even in a 64-socket server, **over $90\%$ of shared memory lines are read by fewer than 4 nodes concurrently** ($k \le 4$).

Instead of storing 64 bits per entry, a **Limited Pointer Directory ($\text{Dir}_4 B$)** stores $i = 4$ explicit node ID pointers ($6\text{ bits}$ per pointer for 64 nodes) plus 1 Overflow Bit:

$$\text{Entry Bits} = (i \times \log_2 N) + 1\text{ Overflow Bit} = (4 \times 6) + 1 = \mathbf{25 \text{ Bits}}$$

Compared to 64 bits, $25\text{ bits}$ reduces directory memory overhead from $12.89\%$ down to **$4.88\%$**!

* **Normal Operation ($k \le 4$ Sharers)**: The 4 pointers record the exact IDs of the sharer nodes. Point-to-point invalidations are sent *only* to those 4 nodes.
* **Overflow Operation ($k > 4$ Sharers)**: The 5th sharer triggers the **Overflow Bit** ($O \Leftarrow 1$). The directory falls back to broadcasting invalidations to all nodes *only when overflow occurs*.

---

### Step-by-Step Point-to-Point Invalidation Protocol Trace

Let us trace the complete packet handshake sequence when **Node 0** requests exclusive write permission for line $A$, where line $A$'s Home Node is **Node 1**, and line $A$ is currently shared by **Node 2 and Node 3** ($\text{State} = S, \text{Presence} = \text{Node 2, Node 3}$):

```text
POINT-TO-POINT DIRECTORY INVALIDATION HANDSHAKE

 Node 0 (Requester)           Home Node 1 (Directory)        Node 2 & Node 3 (Sharers)
 ┌────────────────┐           ┌────────────────────┐          ┌───────────────────────┐
 │ Requests Write ├──────────►│ Checks Directory   │          │                       │
 │ Line A         │           │ Presence: Node 2,3 │          │                       │
 └────────────────┘           └─────────┬──────────┘          └───────────────────────┘
                                        │
                                        ├────────────────────► Sends Invalidate Packet to Node 2
                                        ├────────────────────► Sends Invalidate Packet to Node 3
                                        │                      │
                                        │                      ▼
                                        │                      Cores 2 & 3 Clear V=0
                                        │                      Send InvAck to Node 0!
 ┌────────────────┐                     │                      │
 │ Receives 2     │◄────────────────────┴──────────────────────┘
 │ InvAck Packets!│
 │ Node 0 Writes! │
 └────────────────┘
```

#### Step 1: Write Request Packet (`Read-Exclusive / RFO`)
Node 0 experiences a write miss or write upgrade for line $A$. 

Node 0 transmits a point-to-point request packet across the interconnect network to Home Node 1:

$$\text{Packet 1 (Node 0 } \to \text{ Home Node 1): } \mathtt{REQ\_WRITE}(A, \text{Requester}=\text{Node 0})$$

#### Step 2: Directory Lookup at Home Node
Home Node 1 receives the packet and queries its directory table for line $A$:
* Directory State = **Shared ($S$)**.
* Presence Vector = **`[Node 2, Node 3]`**.

#### Step 3: Targeted Point-to-Point Invalidation Dispatch
Home Node 1 dispatches targeted invalidation packets across the network **ONLY to Node 2 and Node 3**:

$$\text{Packet 2 (Home Node 1 } \to \text{ Node 2): } \mathtt{INV\_CMD}(A, \text{Ack\_Target}=\text{Node 0})$$

$$\text{Packet 3 (Home Node 1 } \to \text{ Node 3): } \mathtt{INV\_CMD}(A, \text{Ack\_Target}=\text{Node 0})$$

Simultaneously, Home Node 1 sends a data response packet to Node 0 informing it: *"Line A data attached. You MUST wait for **2 Invalidation Acknowledgments (`InvAck = 2`)** before executing your write!"*

#### Step 4: Local Invalidation & Acknowledgment (`InvAck`)
* Node 2 receives `INV_CMD(A)`. Node 2's cache controller clears its local Valid bit ($V_2 \Leftarrow 0$) and transmits an acknowledgment packet directly to Node 0:
  $$\text{Packet 4 (Node 2 } \to \text{ Node 0): } \mathtt{INV\_ACK}(A)$$
* Node 3 receives `INV_CMD(A)`. Node 3 clears its Valid bit ($V_3 \Leftarrow 0$) and transmits an acknowledgment packet directly to Node 0:
  $$\text{Packet 5 (Node 3 } \to \text{ Node 0): } \mathtt{INV\_ACK}(A)$$

#### Step 5: Acknowledgment Counting & Write Completion
Node 0 maintains a hardware **Pending Ack Down-Counter** ($\text{Ack\_Counter} = 2$).
1. Node 0 receives `INV_ACK` from Node 2 $\implies \text{Ack\_Counter} \Leftarrow 2 - 1 = 1$.
2. Node 0 receives `INV_ACK` from Node 3 $\implies \text{Ack\_Counter} \Leftarrow 1 - 1 = \mathbf{0}$.
3. **$\text{Ack\_Counter} == 0$ CONFIRMED!** 
4. Node 0 obtains Exclusive Modified state ($M$), applies its local store payload, and un-stalls the CPU pipeline!

---

## Out-of-Order Message Races and Invalidation Acknowledgments (`InvAck`)

In point-to-point interconnect networks (such as 2D mesh or torus topologies), packet routing is non-deterministic. Messages transmitted between nodes can arrive out of order due to network queue congestion or adaptive routing.

How does a directory-based coherence controller resolve network message races?

### Race Condition Scenario: The Early Data Arrival Race

Suppose Node 0 requests write permission for line $A$ from Home Node 1. Home Node 1 sends the data payload to Node 0 and sends an invalidation command to Node 2.

Because the network route from Home Node 1 to Node 0 is fast, but the route to Node 2 is congested:
1. Node 0 receives the data payload from Home Node 1 at $t = 10\text{ ns}$.
2. Node 2 receives the invalidation command at $t = 50\text{ ns}$.

If Node 0 did **not** wait for Node 2's acknowledgment and wrote to line $A$ at $t = 11\text{ ns}$:
* Between $t = 11\text{ ns}$ and $t = 50\text{ ns}$, Node 2 still holds the **old version of line $A$ in its L1 cache**!
* If a thread on Node 2 reads line $A$ at $t = 20\text{ ns}$, **Node 2 reads STALE DATA**, violating the Single-Writer Multiple-Reader invariant!

```text
THE EARLY DATA ARRIVAL NETWORK RACE

 Home Node 1 sends Data to Node 0 (Fast Route: Arrives t = 10 ns)
 Home Node 1 sends Invalidation to Node 2 (Congested Route: Arrives t = 50 ns!)
                               │
                       If Node 0 writes at t = 11 ns:
                       Node 2 reads STALE DATA between t=11ns and t=50ns! (CRASH!)
```

#### The Hardware Fix: Strict `InvAck` Counter Enforcement
Node 0 is **EXPLICITLY FORBIDDEN from committing its write or releasing its data to local instructions** until its internal `Ack_Counter` reaches ZERO!

$$\text{Write Commit Permitted} \iff \text{Ack\_Counter} == 0$$

Even though Node 0 received the data payload at $t = 10\text{ ns}$, Node 0 sits in a hardware stall state until $t = 55\text{ ns}$ when Node 2's `INV_ACK` packet arrives. 

Once $\text{Ack\_Counter} == 0$, Node 0 is guaranteed that no other core in the entire computer holds a valid copy of line $A$, preserving $100\%$ multi-core memory correctness!

---

## Solved Industrial Engineering Exercise: Quantitative Directory Coherence Trace, Point-to-Point Invalidation Traffic, and Scalability Analysis

To consolidate your complete mastery of directory-based coherence architectures, presence bit vectors, point-to-point invalidation handshakes, `InvAck` down-counters, and network traffic reduction math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal interconnect and memory systems architect designing a **64-Socket NUMA Server Processor** ($N = 64\text{ nodes}$, Node 0 through Node 63).

The processor cores operate at a clock frequency $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The 64 sockets are connected via a 2D Torus point-to-point packet interconnect network.

```text
64-SOCKET NUMA SERVER WITH DIRECTORY-BASED COHERENCE

 Sockets 0..63 (3.2 GHz) ──► [ Distributed Directory Table ] ──► Point-to-Point Network
 Clock T = 312.5 ps          Full-Bit Vector (64 Bits)           Link Latency = 15 ns/hop
```

#### Hardware Memory & Network Parameters:
* Cache Line Size: $64\text{ bytes}$ ($512\text{ bits}$).
* Local L1/L2/L3 Cache Hit Latency: $T_{\text{L1}} = 1.0\text{ ns}$ ($3.2\text{ CPU clock cycles}$).
* Home Node Directory Lookup Latency: $T_{\text{dir\_lookup}} = 10.0\text{ ns}$ ($32\text{ CPU clock cycles}$).
* Point-to-Point Network Packet Transit Latency per Hop: $T_{\text{hop}} = 15.0\text{ ns}$ ($48\text{ CPU clock cycles}$).
* Local DRAM Read Latency: $T_{\text{DRAM}} = 40.0\text{ ns}$ ($128\text{ CPU clock cycles}$).
* Invalidation Processing Latency at Remote Node: $T_{\text{inv\_proc}} = 5.0\text{ ns}$ ($16\text{ CPU clock cycles}$).
* Network Invalidation Packet Header Size: $8\text{ bytes}$ ($64\text{ bits}$).

#### Initial Directory State:
Physical memory address $A = \text{0x00010000}$ has its Home Node at **Node 1**.
* Address $A$ is currently in **Shared ($S$) Directory State**.
* Presence Vector = `0x0000_0000_0000_0024` ($\text{Bits 2 and 5 are set to 1}$).
* **Node 2 and Node 5 hold read-only copies of line $A$ in their L1 caches** ($V_2=1, V_5=1$). All other 61 nodes hold $V = 0$.

#### Workload Execution Event:
At physical time $t = 0.0\text{ ns}$ (CPU Cycle 0), **Node 0** executes a store instruction targeting address $A$: `STORE [0x00010000] = 99`.

#### Network Distance Topology for Address $A$:
* Distance Node 0 to Home Node 1 = $1\text{ Hop}$.
* Distance Home Node 1 to Sharer Node 2 = $1\text{ Hop}$.
* Distance Home Node 1 to Sharer Node 5 = $2\text{ Hops}$.
* Distance Sharer Node 2 to Requester Node 0 = $2\text{ Hops}$.
* Distance Sharer Node 5 to Requester Node 0 = $1\text{ Hop}$.

#### Your Objective

1. Calculate the physical directory memory overhead percentage for a **Full-Bit Vector Directory ($\text{Dir}_{64}$)** vs. a **Limited Pointer Directory ($\text{Dir}_2 B$)** for 64 nodes.
2. Trace the step-by-step packet transmission sequence across the network for Node 0's write request under **Directory-Based Coherence**:
   * Trace timestamps ($t$ in ns) for Request Packet, Invalidation Commands, Data Delivery, `InvAck` responses, and Ack Counter decrementing at Node 0.
3. Calculate the total off-chip network invalidation traffic volume (in Bytes) under **Directory-Based Targeted Coherence** versus a naive **Bus Snooping Broadcast** to all 63 nodes.
4. Calculate the total write stall latency (in nanoseconds and CPU clock cycles) incurred by Node 0 before it is permitted to complete its write.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Directory Memory Overhead Percentage

For a 64-byte ($512\text{-bit}$) cache line payload across $N = 64\text{ nodes}$:

##### 1. Full-Bit Vector Directory ($\text{Dir}_{64}$):
Stores 64 presence bits + 2 state bits = $66\text{ bits per entry}$.

$$\text{Overhead}_{\text{Dir64}} = \frac{66\text{ bits}}{512\text{ bits}} \times 100\% = \mathbf{12.89\% \text{ Directory Memory Overhead}}$$

##### 2. Limited Pointer Directory ($\text{Dir}_2 B$ with 2 Pointers):
Stores $i = 2$ node ID pointers ($6\text{ bits}$ each for 64 nodes) + 1 Overflow Bit + 2 State Bits = $(2 \times 6) + 1 + 2 = 15\text{ bits per entry}$.

$$\text{Overhead}_{\text{Dir2B}} = \frac{15\text{ bits}}{512\text{ bits}} \times 100\% = \mathbf{2.93\% \text{ Directory Memory Overhead}}$$

Using Limited Pointers reduces directory memory overhead from $12.89\%$ down to **$2.93\%$** ($77.3\%$ savings!).

---

#### Step 2: Trace Directory Packet Handshake Sequence

Let us trace the physical time timestamps ($t$ in ns) for Node 0's write request:

##### Phase 1: Write Request Dispatch ($t = 0.0\text{ ns} \to 15.0\text{ ns}$)
* $t = 0.0\text{ ns}$: Node 0 misses on write for address $A$. Dispatches `REQ_WRITE` packet to Home Node 1 ($1\text{ Hop}$).
* Transit time = $1\text{ Hop} \times 15.0\text{ ns} = 15.0\text{ ns}$.
* $t = 15.0\text{ ns}$: `REQ_WRITE` packet arrives at Home Node 1.

##### Phase 2: Directory Lookup & Invalidation Dispatch ($t = 15.0\text{ ns} \to 25.0\text{ ns}$)
* $t = 15.0\text{ ns}$: Home Node 1 performs directory lookup ($T_{\text{dir\_lookup}} = 10.0\text{ ns}$).
* $t = 25.0\text{ ns}$: Directory lookup completes:
  * State = **Shared ($S$)**. Presence = **Node 2, Node 5**.
  * Home Node 1 sets Node 0's pending `Ack_Counter = 2`.
  * Home Node 1 dispatches data payload packet to Node 0 ($1\text{ Hop} \times 15\text{ ns} = 15\text{ ns} \implies$ arrives Node 0 at $t = 40.0\text{ ns}$).
  * Home Node 1 dispatches targeted `INV_CMD` to **Node 2** ($1\text{ Hop} \times 15\text{ ns} \implies$ arrives Node 2 at $t = 40.0\text{ ns}$).
  * Home Node 1 dispatches targeted `INV_CMD` to **Node 5** ($2\text{ Hops} \times 15\text{ ns} = 30\text{ ns} \implies$ arrives Node 5 at $t = 55.0\text{ ns}$).

##### Phase 3: Node 2 Invalidation & Acknowledgment ($t = 40.0\text{ ns} \to 75.0\text{ ns}$)
* $t = 40.0\text{ ns}$: Node 2 receives `INV_CMD`. Invalidation processing takes $T_{\text{inv\_proc}} = 5.0\text{ ns}$.
* $t = 45.0\text{ ns}$: Node 2 clears $V_2 \Leftarrow 0$ and dispatches `INV_ACK` packet to Node 0 ($2\text{ Hops} \times 15\text{ ns} = 30\text{ ns}$).
* $t = 75.0\text{ ns}$: `INV_ACK` from Node 2 arrives at Node 0!
  * Node 0 decrements `Ack_Counter`: $2 - 1 = \mathbf{1}$.

##### Phase 4: Node 5 Invalidation & Acknowledgment ($t = 55.0\text{ ns} \to 75.0\text{ ns}$)
* $t = 55.0\text{ ns}$: Node 5 receives `INV_CMD`. Invalidation processing takes $T_{\text{inv\_proc}} = 5.0\text{ ns}$.
* $t = 60.0\text{ ns}$: Node 5 clears $V_5 \Leftarrow 0$ and dispatches `INV_ACK` packet to Node 0 ($1\text{ Hop} \times 15\text{ ns} = 15\text{ ns}$).
* $t = 75.0\text{ ns}$: `INV_ACK` from Node 5 arrives at Node 0!
  * Node 0 decrements `Ack_Counter`: $1 - 1 = \mathbf{0}$.

##### Phase 5: Write Completion at Node 0 ($t = 75.0\text{ ns}$)
* At $t = 75.0\text{ ns}$, Node 0 confirms **`Ack_Counter == 0`**!
* Node 0 obtains Exclusive Modified state ($M$), writes $A = 99$, and un-stalls the CPU pipeline!

```text
DIRECTORY HANDSHAKE TIMING CHRONOLOGY

 Time (ns) │ Origin Node ──► Target Node │ Packet / Action
───────────┼─────────────────────────────┼───────────────────────────────
    0.0    │ Node 0 ──► Home Node 1      │ Dispatches REQ_WRITE(A)
   15.0    │ Home Node 1                 │ Performs Directory Lookup
   25.0    │ Home Node 1 ──► Node 0      │ Dispatches Data Payload (1 Hop)
   25.0    │ Home Node 1 ──► Node 2      │ Dispatches INV_CMD (1 Hop)
   25.0    │ Home Node 1 ──► Node 5      │ Dispatches INV_CMD (2 Hops)
   40.0    │ Node 0                      │ Data Arrives (Ack_Counter = 2)
   45.0    │ Node 2 ──► Node 0           │ Dispatches INV_ACK (2 Hops)
   60.0    │ Node 5 ──► Node 0           │ Dispatches INV_ACK (1 Hop)
   75.0    │ Node 0                      │ InvAck 1 & 2 Arrive! Counter = 0!
   75.0    │ Node 0                      │ WRITE COMPLETED! CPU Un-stalled!
```

---

#### Step 3: Calculate Network Invalidation Traffic Volume

Each invalidation and acknowledgment packet has a header size $W_{\text{header}} = 8\text{ bytes}$.

##### 1. Directory-Based Targeted Invalidation Traffic:
The directory sent `INV_CMD` to Node 2 and Node 5 ($2\text{ packets}$), and received `INV_ACK` from Node 2 and Node 5 ($2\text{ packets}$).

$$\text{Total Invalidation Packets (Directory)} = 2 \text{ Commands} + 2 \text{ Acks} = \mathbf{4 \text{ Packets}}$$

$$\text{Network Invalidation Traffic}_{\text{Directory}} = 4 \text{ packets} \times 8 \text{ bytes/packet} = \mathbf{32 \text{ Bytes}}$$

##### 2. Naive Bus Snooping Broadcast Traffic (63 Remote Sockets):
A naive broadcast sends invalidations to all 63 remote nodes, and receives 63 acknowledgments:

$$\text{Total Invalidation Packets (Broadcast)} = 63 \text{ Commands} + 63 \text{ Acks} = \mathbf{126 \text{ Packets}}$$

$$\text{Network Invalidation Traffic}_{\text{Broadcast}} = 126 \text{ packets} \times 8 \text{ bytes/packet} = \mathbf{1,008 \text{ Bytes}}$$

##### 3. Calculate Network Traffic Reduction Percentage:

$$\text{Traffic Reduction} = \left( 1 - \frac{32\text{ Bytes}}{1,008\text{ Bytes}} \right) \times 100\% = (1 - 0.0317) \times 100\% = \mathbf{96.83\% \text{ Traffic Reduction!}}$$

Directory-based targeted invalidations **reduced network coherence traffic by $96.83\%$**, eliminating 122 useless network packets!

---

#### Step 4: Calculate Total Write Stall Latency at Node 0

Node 0 executed its write request at $t = 0.0\text{ ns}$ and confirmed $\text{Ack\_Counter} == 0$ at $t = 75.0\text{ ns}$.

$$\text{Total Write Stall Latency} = 75.0\text{ ns} - 0.0\text{ ns} = \mathbf{75.00 \text{ nanoseconds}}$$

Expressing stall latency in CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$\text{CPU Stall Cycles} = \frac{75.00\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{240 \text{ CPU Clock Cycles}}$$

Node 0 stalled for **240 CPU clock cycles ($75.0\text{ ns}$)** to acquire exclusive write ownership across the 64-socket NUMA system.

---

### Sanity Check and Verification

Let us verify our mathematical and protocol state results against directory architecture principles:

1. **Targeted Invalidation Precision Check**:
   * Sharer presence list contained Node 2 and Node 5.
   * `INV_CMD` packets were dispatched *only* to Node 2 and Node 5.
   * Nodes 1, 3, 4, 6..63 received 0 invalidation packets. Targeted routing verified!
2. **`InvAck` Arrival Synchronicity**:
   * Node 2 path: $15\text{ns (req)} + 10\text{ns (dir)} + 15\text{ns (inv)} + 5\text{ns (proc)} + 30\text{ns (ack)} = 75.0\text{ ns}$.
   * Node 5 path: $15\text{ns (req)} + 10\text{ns (dir)} + 30\text{ns (inv)} + 5\text{ns (proc)} + 15\text{ns (ack)} = 75.0\text{ ns}$.
   * Both `InvAck` packets arrived at Node 0 at the **exact same physical nanosecond ($t = 75.0\text{ ns}$)**!
3. **SWMR Invariant Verification**:
   * Node 0 committed its write *only after* $\text{Ack\_Counter} == 0$ at $t = 75.0\text{ ns}$.
   * At $t = 75.0\text{ ns}$, Node 2 ($V_2=0$) and Node 5 ($V_5=0$) had already cleared their Valid bits.
   * SWMR invariant held with 100% mathematical precision!

All directory presence vectors, point-to-point packet routing paths, `InvAck` counter decrements, network traffic reductions, and stall cycle metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Directory-Based Coherence**: A scalable multi-socket coherence architecture where each home memory node maintains a Coherence Directory table tracking the state and Presence Vector (sharer list) of its physical memory lines, enabling targeted point-to-point invalidations without interconnect broadcast flooding.
* **Directory State Vector**: The bitmask or pointer array ($\text{Presence}[N-1:0]$) stored inside a directory entry that records which specific processor nodes currently hold valid copies of a memory line in their private caches.
* **Point-to-Point Invalidation**: The targeted coherence protocol mechanism where invalidation packets (`INV_CMD`) are routed exclusively to the specific nodes flagged in the directory's Presence Vector, requiring the writing node to collect Invalidation Acknowledgments (`InvAck`) from all sharers before committing its write.
