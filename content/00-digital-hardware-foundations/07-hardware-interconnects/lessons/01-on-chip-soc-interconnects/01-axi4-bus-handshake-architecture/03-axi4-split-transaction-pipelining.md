content/00-digital-hardware-foundations/07-hardware-interconnects/lessons/01-on-chip-soc-interconnects/01-axi4-bus-handshake-architecture/03-axi4-split-transaction-pipelining.md
# Split-Transaction Bus Pipelining and Out-of-Order Transaction ID Tagging

## The Idle Interconnect Bottleneck and In-Order Blocking

In high-performance digital System-on-Chip (SoC) design, integrated circuit architectures place multiple processing units—such as central processing unit (CPU) cores, graphics processing units (GPUs), and direct memory access (DMA) engines—onto a single piece of silicon. These processing units, known as master IP cores, need to read data from and write data to various memory targets, known as slave devices. 

When a master core needs to read a 64-byte block of data from memory, it dispatches a read memory address across the internal interconnect wires. The target slave memory receives the address, decodes it, locates the data inside its storage cells, and sends the requested bytes back to the master.

In traditional, non-split interconnect architectures, a memory transaction is treated as a single, atomic, indivisible event. When a master core issues a read address to a slave device, the interconnect channel is locked exclusively for that specific transaction. 

The master core and the interconnect wires must sit completely still and wait until the slave memory finishes retrieving the data and drives it all the way back across the wires.

To understand why this non-split execution model causes a catastrophic performance bottleneck, we must look at the physical reality of memory access latencies inside a complex microchip.

Different memory targets on the same chip have vastly different response times:
* **Fast On-Chip SRAM**: Reading data from a local, on-chip Static RAM (SRAM) memory block takes only **1 or 2 clock cycles** (less than 1 nanosecond).
* **Slow Off-Chip DRAM**: Reading data from main system Dynamic RAM (DRAM) located outside the chip requires communicating through a complex memory controller and waiting for analog capacitor charge sharing. This process takes **50 to 100 clock cycles** (25 to 50 nanoseconds).

```text
NON-SPLIT BUS INTERCONNECT LOCKUP

 Cycle 0  : Master issues Read Addr to Slow DRAM ──► Address Wires Locked!
 Cycles 1..50 : Interconnect BUS FROZEN waiting for DRAM Read Data...
                ▲
                │ Fast SRAM Read Request from Master 1 CANNOT BE ISSUED!
                └─► Master 1 Stalled for 50 cycles behind Master 0!
```

Consider what happens inside a non-split interconnect when Master 0 issues a read request to slow off-chip DRAM, and one clock cycle later, Master 1 wants to issue a read request to fast on-chip SRAM:

1. **Cycle 0**: Master 0 dispatches a read address targeting slow DRAM. The interconnect address and data channels are locked for Master 0's transaction.
2. **Cycles 1 through 50**: Slow DRAM receives the address and begins searching its storage cells. The data will not be ready for 50 clock cycles. Because the non-split interconnect is locked waiting for Master 0's response, **the address and data wires sit $100\%$ idle and empty for 50 consecutive clock cycles**!
3. **Master 1 is Blocked**: Master 1 wants to read data from fast on-chip SRAM—an operation that would take only 2 clock cycles. But because Master 0's transaction holds the interconnect lock, Master 1 is forbidden from placing its address onto the wires!
4. **Result**: Master 1 is forced to stall for 50 clock cycles, waiting for Master 0's slow DRAM request to finish, even though the fast SRAM target was completely idle and open!

This architectural flaw is called **In-Order Head-of-Line Blocking**.

In an in-order non-split interconnect, a single slow memory transaction at the front of the queue halts all subsequent memory traffic on the chip. The internal interconnect wires spend over $90\%$ of their operational lifespan sitting completely idle, waiting for slow memory responses, while high-speed execution pipelines sit frozen in arbitration stalls.

How do we design an on-chip interconnect that keeps its address and data wires busy on every single clock cycle? 

How do we allow a master core to issue multiple memory requests in advance without waiting for previous responses to arrive? 

And when memory responses return out of their original order—with fast SRAM returning data in 2 cycles while slow DRAM returns data 50 cycles later—how does the hardware route each returning data payload to the correct waiting register without getting data mixed up or corrupted?

To eliminate head-of-line blocking and achieve maximum memory throughput, modern SoC interconnects—such as the ARM Advanced eXtensible Interface 4 (**AXI4**) specification—employ two integrated hardware primitives: **Split-Transaction Bus Pipelining** and **Out-of-Order Transaction ID Tagging**.

---

## The Fast-Food Order Ticket and Buzzer: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of split-transaction pipelining and out-of-order ID tagging before inspecting gate-level hardware datapaths, transaction state registers, and timing matrices, let us consider an everyday real-world analogy: **The Fast-Food Restaurant Order Counter**.

Imagine a busy fast-food restaurant designed to serve hundreds of hungry customers every hour. The customers (**Master IP Cores / CPUs**) stand in front of the service counter (**The Interconnect Bus**) to place food orders (**Memory Read Requests**) with the kitchen staff (**Slave Memory Targets**).

```text
THE RIGID DINER COUNTER (NON-SPLIT IN-ORDER INTERCONNECT)

 Customer 0 (Master 0)                                Kitchen (Slave)
 ┌──────────┐                                         ┌──────────┐
 │ Person 0 ├──────────► [ Single Order Counter ] ───►│ Kitchen  │
 └──────────┘            (Coupled, Non-Split Line)    └──────────┘
```

Let us observe two different operational designs for how this restaurant processes customer orders:

---

### Design 1: The Rigid Diner Counter (Non-Split In-Order Bus)

In a poorly managed diner, the counter clerk enforces a strict, rigid rule: *"I process one customer at a time from start to finish. When you place an order, you must stand right here at the counter. I will not take an order from the next person in line until your food is fully cooked, handed to you, and you walk away."*

Let us trace what happens when Customer 0 and Customer 1 arrive at the counter:

1. **12:00 PM**: Customer 0 walks up to the counter and orders a **Slow-Cooked Well-Done Steak** (which takes 20 minutes to cook).
2. Customer 0 stands directly at the counter waiting for their steak.
3. **12:01 PM**: Customer 1 arrives right behind Customer 0. Customer 1 wants to buy a **Pre-Made Cold Soda** (which takes 5 seconds to hand over).
4. **The Bottleneck**: Because Customer 0 is standing at the counter waiting for their 20-minute steak, **Customer 1 is forbidden from placing their order**! 
5. Customer 1 stands in line behind Customer 0 for 20 minutes just to get a 5-second soda! The counter clerk sits idle for 19 minutes and 55 seconds doing nothing while the kitchen cooks the steak.

```text
RIGID DINER BLOCKING SCENARIO

 Customer 0: Orders 20-min Steak ──► Stands at Counter waiting...
 Customer 1: Wants 5-sec Soda   ──► BLOCKED IN LINE FOR 20 MINUTES!
                                    (Counter sits empty; Customer 1 frustrated!)
```

Look at the absurdity of this rigid design:
* Fast tasks (getting a soda) are blocked behind slow tasks (cooking a steak).
* The service counter sits completely unused for 20 minutes, even though dozens of customers could have bought sodas during that waiting window.

---

### Design 2: The Modern Fast-Food Pickup Counter (Split-Transaction Bus with Order IDs)

To eliminate the waiting line, the fast-food restaurant implements **Split-Transaction Pipelining** and **Numbered Order Buzzers**:

The restaurant separates the ordering process into **Two Independent Phases**:
1. **The Order Phase (Address Channel - `AR`)**: You place your order at the register.
2. **The Pickup Phase (Data Channel - `R`)**: You pick up your food at the pickup counter when your number is called.

```text
THE SPLIT-TRANSACTION RESTAURANT WITH ORDER ID BUZZERS

 Order Counter (AR Channel)                      Pickup Counter (R Channel)
 ┌──────────────────────────┐                    ┌──────────────────────────┐
 │ Order 1: Steak -> ID #42 │                    │ "Order #43 Ready!" (Soda)│
 │ Order 2: Soda  -> ID #43 │                    │ "Order #42 Ready!"(Steak)│
 └──────────────────────────┘                    └──────────────────────────┘
```

Let us trace how Customer 0 and Customer 1 are served under Design 2:

1. **12:00 PM**: Customer 0 walks up to the Order Counter (`AR` Channel) and orders a 20-minute Steak.
2. The clerk records the order, hands Customer 0 an electronic pager buzzer stamped with **Order ID #42** (`ARID = 42`), and tells Customer 0 to step away from the counter.
3. **The Counter is Instantly Freed!** Customer 0 steps aside to the waiting area. The Order Counter is open and ready in 2 seconds!
4. **12:01 PM**: Customer 1 steps up to the Order Counter (`AR` Channel) and orders a 5-second Soda. The clerk hands Customer 1 a buzzer stamped with **Order ID #43** (`ARID = 43`). Customer 1 steps aside.
5. **Out-of-Order Food Completion**:
   * At 12:01:05 PM (5 seconds later), the kitchen finishes preparing Customer 1's soda!
   * The kitchen places the soda at the Pickup Counter (`R` Channel) and flashes the display screen: **"Order ID #43 is Ready!"** (`RID = 43`).
   * Customer 1 looks at their buzzer, sees `43` matches, walks to the Pickup Counter, collects their soda, and leaves!
6. **12:20 PM**: 20 minutes later, the kitchen finishes cooking Customer 0's steak.
   * The kitchen places the steak at the Pickup Counter (`R` Channel) and flashes: **"Order ID #42 is Ready!"** (`RID = 42`).
   * Customer 0 sees `42` matches, collects their steak, and leaves!

```text
SPLIT-TRANSACTION OUT-OF-ORDER COMPLETION

 12:00:00 PM : Customer 0 orders Steak ──► Given Buzzer ID #42 ──► Steps Aside!
 12:01:00 PM : Customer 1 orders Soda  ──► Given Buzzer ID #43 ──► Steps Aside!
 12:01:05 PM : Kitchen finishes Soda   ──► Calls "Order #43!"   ──► Customer 1 Leaves!
 12:20:00 PM : Kitchen finishes Steak  ──► Calls "Order #42!"   ──► Customer 0 Leaves!
 (Customer 1 served in 5 seconds! Customer 0 waited 20 mins without blocking anyone!)
```

Notice what this split-transaction system achieved:
* **Zero Head-of-Line Blocking**: Customer 1 bought their soda in 5 seconds without waiting for Customer 0's 20-minute steak to finish!
* **Pipelined Transactions**: The kitchen had multiple orders cooking concurrently in the background.
* **Out-of-Order Completion via ID Tags**: The food returned in reverse order (Order #43 finished *before* Order #42). Nobody received the wrong meal because the **Order ID Number (#42 vs #43)** matched each meal to the correct customer!

This modern fast-food restaurant is the exact physical analogue of **Split-Transaction Bus Pipelining and AXI Out-of-Order ID Tagging**:
* Customers are **Master IP Cores (CPUs, GPUs, DMA Engines)**.
* Kitchen staff members are **Slave Memory Targets (SRAM, DRAM Controllers)**.
* Ordering at the counter is the **Read Address Channel (`AR`)**.
* Picking up food at the window is the **Read Data Channel (`R`)**.
* Stepping aside after ordering is **Splitting the Transaction**.
* The Order ID number on the buzzer is the **AXI Transaction ID Tag (`ARID` / `RID`)**.
* Serving Order #43 before Order #42 is **Out-of-Order Transaction Completion**.

---

## Primitive 1: The Split-Transaction Bus

Now that we possess an intuitive mental model of the fast-food order counter and buzzer system, let us examine the formal, rigorous engineering mechanics of a **Split-Transaction Bus**.

In a traditional non-split bus architecture, a memory request binds the address transfer phase and the data response phase together into a single, indivisible lock on the physical interconnect wires. 

In a **Split-Transaction Bus**, the address request phase and the data response phase are **completely decoupled into separate, independent bus operations**.

```text
SPLIT-TRANSACTION DECOUPLED TIMING vs NON-SPLIT LOCKUP

 Non-Split Bus : [ Address Phase ] ═══ LOCKED BUS IDLE WAIT ═══► [ Data Phase ]
                 ◄──────────────── Total Transaction Time ───────────────►

 Split Bus     : [ Addr Req 1 ] [ Addr Req 2 ] [ Addr Req 3 ] ...
                 (Address channel freed IMMEDIATELY after 1 clock cycle!)
                                  [ Data Resp 2 ] [ Data Resp 1 ] ...
                 (Data channel receives responses as soon as targets finish!)
```

---

### The Mechanics of Transaction Splitting

To execute a split-transaction memory read, the interconnect operates in two decoupled, independent phases across time:

#### Phase 1: The Request Phase (Address Channel `AR`)
1. The master core places the physical memory address $A$ and transaction control parameters onto the Read Address channel wires (`ARADDR`, `ARLEN`, `ARSIZE`, `ARBURST`, `ARID`).
2. The master asserts `ARVALID = 1`.
3. The target slave (or interconnect crossbar) accepts the address by asserting `ARREADY = 1`.
4. **THE SPLIT MOMENT**: On the rising clock edge where `ARVALID && ARREADY == 1`, **the request phase is complete**!
5. The master core **de-asserts `ARVALID = 0`** and frees the Read Address channel wires on the very next clock cycle. The address wires are now $100\%$ open and ready to accept a new read address from any master core!

#### Phase 2: The Response Phase (Data Channel `R`)
1. While the master core is free to issue new addresses, the slave memory target processes the initial read address $A$ in the background.
2. When the slave memory retrieves the requested data payload (whether 2 clock cycles later for SRAM or 50 cycles later for DRAM), the slave requests access to the Read Data channel.
3. The slave places the data payload onto `RDATA`, attaches the matching transaction ID tag onto `RID`, and asserts `RVALID = 1`.
4. The master core accepts the data payload by asserting `RREADY = 1`.
5. On the rising clock edge where `RVALID && RREADY == 1`, the response phase completes, and the data line is freed!

---

### Pipelining Multiple Outstanding Transactions

By decoupling the request phase from the response phase, a split-transaction interconnect allows a master core to execute **Transaction Pipelining**.

A master core does not need to wait for transaction $N$ to return its data before issuing transaction $N+1$. 

The master core can dispatch a continuous stream of read address requests on consecutive clock cycles across the `AR` channel:

$$\text{Address Stream on } AR \text{ Channel: } \quad \text{Addr}_1 \to \text{Addr}_2 \to \text{Addr}_3 \to \text{Addr}_4 \to \text{Addr}_5$$

The total number of requests that have been accepted on the address channel but have not yet returned their final data payload on the data channel is called the **Number of Outstanding Transactions ($K_{\text{outstanding}}$)**.

```text
PIPELINED OUTSTANDING TRANSACTIONS IN FLIGHT

 Clock Cycle : 0    1    2    3    4    5 ... 20   21   22
 AR Channel  : [A1] [A2] [A3] [A4] [A5]
 R Channel   :                          ... [D2] [D3] [D1]
               ▲                        ▲    ▲
               │                        │    └─► Data 2 returns (Fast SRAM)
               │                        └──────► 3 Transactions In-Flight!
               └───────────────────────────────► Addr 1 issued to Slow DRAM
```

#### Mathematical Formulation of Interconnect Pipelining Efficiency:

Let $T_{\text{latency}}$ be the memory response latency in clock cycles (e.g., $T_{\text{latency}} = 20\text{ cycles}$).
Let $T_{\text{addr}}$ be the time required to transmit a read address payload ($T_{\text{addr}} = 1\text{ cycle}$).
Let $T_{\text{data}}$ be the time required to transmit a read data payload ($T_{\text{data}} = 1\text{ cycle}$).

In an **In-Order Non-Split Bus**, the maximum throughput $TH_{\text{non\_split}}$ (transactions per clock cycle) is limited by the full round-trip memory latency:

$$TH_{\text{non\_split}} = \frac{1}{T_{\text{addr}} + T_{\text{latency}} + T_{\text{data}}} = \frac{1}{1 + 20 + 1} = \frac{1}{22} \approx \mathbf{0.045 \text{ transfers/cycle}}$$

In a **Split-Transaction Pipelined Bus** with an outstanding transaction capacity $K_{\text{outstanding}} \ge 22$:
Once the initial pipeline latency of 20 cycles has elapsed, the data channel returns one data payload on **every single clock cycle**:

$$TH_{\text{split\_pipelined}} = \frac{1}{T_{\text{data}}} = \frac{1}{1} = \mathbf{1.000 \text{ transfer/cycle}}$$

$$\text{Pipelining Speedup Factor} = \frac{TH_{\text{split\_pipelined}}}{TH_{\text{non\_split}}} = \frac{1.000}{0.045} = \mathbf{22.0\times \text{ Throughput Increase!}}$$

By decoupling the request and response channels, split-transaction pipelining increases interconnect memory throughput by **$2,200\%$**!

---

## Primitive 2: Out-of-Order Transaction ID Tag Architecture

While split-transaction pipelining allows multiple memory requests to be in flight simultaneously, it introduces a major microarchitectural tracking problem:

Suppose Master 0 issues five read requests in sequence to different memory targets across the chip:
* Request 1 (`ARID = 1`) $\to$ Targets Slow DRAM (Latency = 50 cycles)
* Request 2 (`ARID = 2`) $\to$ Targets Fast SRAM (Latency = 2 cycles)
* Request 3 (`ARID = 3`) $\to$ Targets Fast SRAM (Latency = 2 cycles)
* Request 4 (`ARID = 4`) $\to$ Targets Medium Flash (Latency = 15 cycles)
* Request 5 (`ARID = 5`) $\to$ Targets Fast SRAM (Latency = 2 cycles)

Because Fast SRAM processes requests in 2 cycles while Slow DRAM takes 50 cycles, the data payloads will arrive at Master 0's Read Data channel (`R`) in **Reverse / Out-of-Order Sequence**:

$$\text{Data Return Order on } R \text{ Channel: } \quad \text{Data}_2 \to \text{Data}_3 \to \text{Data}_5 \to \text{Data}_4 \to \text{Data}_1$$

How does Master 0 know which returning data payload belongs to which CPU register? 

If Master 0 incorrectly assumed data always returns in the order requested, it would write Request 2's SRAM data into Request 1's CPU destination register, corrupting the program's execution state!

To allow data responses to return out-of-order safely, modern interconnects use **Out-of-Order Transaction ID Tagging**.

---

### The Anatomy of AXI Transaction ID Tags

In the AXI4 specification, every memory channel includes a dedicated set of binary ID tag wires:

```text
AXI4 TRANSACTION ID TAG SIGNAL FIELDS

 Read Address Channel (AR)  ──► ARID[3:0] (Master assigns unique tag to address)
 Read Data Channel (R)     ──► RID[3:0]  (Slave echoes matching tag with data)

 Write Address Channel (AW) ──► AWID[3:0] (Master assigns unique tag to write address)
 Write Response Channel (B) ──► BID[3:0]  (Slave echoes matching tag with write response)
```

1. **`ARID[3:0]` (Read Address ID)**: When a master core issues a read address request on the `AR` channel, it assigns a binary identification tag to the request (e.g., `ARID = 4'b0010` for Tag 2).
2. **`RID[3:0]` (Read Data ID)**: When a slave memory target returns a read data payload on the `R` channel, it **must copy and attach the exact matching `ARID` tag** onto the `RID` wires (`RID = 4'b0010`).
3. **`AWID[3:0]` (Write Address ID)**: When a master issues a write address request on the `AW` channel, it assigns a write identification tag (e.g., `AWID = 4'b0101` for Tag 5).
4. **`BID[3:0]` (Write Response ID)**: When a slave returns a write completion response on the `B` channel, it **must copy and attach the exact matching `AWID` tag** onto the `BID` wires (`BID = 4'b0101`).

---

### The ID Tag Matching Invariant

The fundamental physical rule governing out-of-order transaction tracking is:

> **The ID Tag Matching Invariant**: A master core or interconnect crossbar routes an incoming data payload on the `R` channel (or write response on the `B` channel) to its destination register or buffer by matching the returned tag (`RID` / `BID`) against the tag assigned during the initial request phase (`ARID` / `AWID`).

$$\text{Destination Match} \iff (\text{RID}_{\text{returned}} == \text{ARID}_{\text{issued}})$$

```text
OUT-OF-ORDER ID TAG MATCHING ROUTING DATAPATH

 Incoming Read Data Payload on R Channel (RID = 2)
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Master ID Tag Lookup Table / Reorder Buffer                 │
 │ Tag 1: Waiting for DRAM (Target Reg R1)                     │
 │ Tag 2: Waiting for SRAM (Target Reg R2) ◄── MATCH!          │
 │ Tag 3: Waiting for SRAM (Target Reg R3)                     │
 └─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼ Routes RDATA directly to Register R2!
 CPU Register File: Register R2 Updated in 1 Clock Cycle!
```

Look at how the ID tag resolves out-of-order arrival:
1. When `RDATA` arrives with `RID = 2`, the master core compares `RID = 2` against its internal active transaction tracking table.
2. The lookup table reveals that Tag 2 was assigned to `LOAD R2, [0x2000]`.
3. The master core routes `RDATA` directly to destination register `R2`, clears Tag 2 from its active tracking table, and updates register `R2` with $100\%$ mathematical correctness!
4. The fact that Tag 1 (`LOAD R1`) has not arrived yet from slow DRAM is completely irrelevant! Tag 2 was identified and processed independently.

---

## Hardware Reordering Rules and Interconnect Routing Realities

While out-of-order transaction ID tagging allows fast memory targets to return data ahead of slow memory targets, digital logic designs must enforce strict ordering rules to prevent data race conditions.

---

### Rule 1: Transactions with DIFFERENT IDs Can Be Reordered Freely

If a master core dispatches two read requests with **different ID tags** (`ARID = 1` and `ARID = 2`):

$$\text{ARID}_1 \neq \text{ARID}_2$$

* The slave memory targets and interconnect crossbar switches are permitted to process and return these two transactions in **any order**!
* `RID = 2` is permitted to return before `RID = 1`.
* `RID = 1` is permitted to return before `RID = 2`.
* Both transactions are treated as completely independent threads of execution.

---

### Rule 2: Transactions with the SAME ID Must Presere In-Order Program Sequence

What happens if a master core dispatches two consecutive read requests using the **EXACT SAME ID tag** (`ARID = 5` and `ARID = 5`)?

$$\text{ARID}_1 == \text{ARID}_2 == 5$$

Why would a master core assign the same ID tag to multiple requests?
A master core assigns identical ID tags to a sequence of requests when those requests belong to the **same sequential program thread** and must not be reordered relative to each other!

The AXI4 specification enforces **The Same-ID In-Order Invariant**:

> **The Same-ID In-Order Invariant**: All transactions issued by a master core with the **exact same ID tag** MUST be processed and returned by slaves in **strict, in-order program sequence**!

$$\text{If } \text{ARID}_1 == \text{ARID}_2 \quad \text{and } \text{Request}_1 \prec \text{Request}_2 \implies \text{RID}_1 \text{ MUST arrive BEFORE } \text{RID}_2$$

```text
SAME-ID IN-ORDER ENFORCEMENT

 Request 1: ARID = 5 (Address 0x1000 - Array[0])  ──┐ MUST RETURN IN
 Request 2: ARID = 5 (Address 0x1004 - Array[1])  ──┘ STRICT PROGRAM ORDER!

 R Channel Return Stream:
 First Return : RID = 5 (Contains Array[0] Data) ──► Correct! (Req 1 Data)
 Second Return: RID = 5 (Contains Array[1] Data) ──► Correct! (Req 2 Data)
 (Slaves are FORBIDDEN from swapping the return order of identical IDs!)
```

#### Why Same-ID In-Order Enforcement Is Mandatory:
Suppose a program reads `array[0]` (`ARID = 5`) followed immediately by `array[1]` (`ARID = 5`). Both read requests return with the same tag `RID = 5`.

If a slave memory target returned `array[1]` first and `array[0]` second under the same tag `RID = 5`, the master core would have no way to know which returned word belonged to `array[0]` and which belonged to `array[1]`! 

The master would write `array[1]` into `array[0]`'s register, scrambling the array elements in software!

By enforcing that identical IDs always return in strict order, AXI4 allows simple software loops to use a single ID tag (`ARID = 5`) without worrying about internal array element scrambling.

---

### Master ID Bit-Width Expansion in Interconnect Crossbars

In a multi-master System-on-Chip containing 4 master IP cores (Master 0, Master 1, Master 2, Master 3) connected through a central crossbar matrix to a shared DRAM controller:

What happens if Master 0 issues a request with `ARID = 1`, and Master 1 *also* issues a request with `ARID = 1` at the exact same clock cycle?

Both master cores chose Tag 1 independently!

When the DRAM controller finishes processing Master 1's request and drives `RID = 1` onto the shared interconnect bus, how does the central crossbar know whether `RID = 1` belongs to Master 0 or Master 1?

```text
MASTER ID CONFLICT AT CROSSBAR SWITCH

 Master 0 Issues: ARID = 1 ──┐
                             ├──► Interconnect Crossbar Matrix
 Master 1 Issues: ARID = 1 ──┘
                                   │
                                   ▼ How to distinguish Master 0 vs Master 1?
                      [ APPEND MASTER PREFIX BITS! ]
```

#### The Hardware Solution: Master ID Bit-Width Expansion
To resolve ID collisions across multiple master cores, the central interconnect crossbar matrix **automatically expands the ID bit-width** by appending Master ID Prefix Bits to every incoming request!

For a 4-master crossbar matrix ($2^2 = 4$ masters), the crossbar prepends **2 master identification bits** to the high-order positions of `ARID` and `AWID`:

$$\text{Expanded ID} = [\quad \text{Master\_ID\_Prefix } (2\text{ Bits}) \quad | \quad \text{Original Master ID } (4\text{ Bits}) \quad]$$

```text
MASTER ID EXPANSION MATRIX

 Master Core ID │ Original ARID │ Expanded Crossbar ID Sent to Slave Target
────────────────┼───────────────┼───────────────────────────────────────────
   Master 0     │  4'b0001 (1)  │  6'b00_0001 (Prepend 2'b00 for Master 0)
   Master 1     │  4'b0001 (1)  │  6'b01_0001 (Prepend 2'b01 for Master 1)
   Master 2     │  4'b0001 (1)  │  6'b10_0001 (Prepend 2'b10 for Master 2)
   Master 3     │  4'b0001 (1)  │  6'b11_0001 (Prepend 2'b11 for Master 3)
```

Trace how this expanded ID solves the routing problem:
1. Master 0 issues `ARID = 4'b0001`. The crossbar expands it to `6'b00_0001` and sends it to the DRAM slave.
2. Master 1 issues `ARID = 4'b0001`. The crossbar expands it to `6'b01_0001` and sends it to the DRAM slave.
3. The DRAM slave processes Master 1's request and returns `RID = 6'b01_0001` on the `R` channel.
4. The crossbar inspects the top two bits of `RID` (`2'b01`):
   * `2'b01` matches **Master 1**!
   * The crossbar strips off the top two prefix bits (`2'b01`), restores the original tag `RID = 4'b0001`, and routes the data payload directly to Master 1!

The master cores have no idea that their ID tags were expanded. The crossbar routes all returned responses to the correct master cores with $100\%$ mathematical precision!

---

## Solved Industrial Engineering Exercise: Quantitative Split-Transaction Pipelining, Out-of-Order ID Tracking, and Throughput Acceleration

To consolidate your complete mastery of split-transaction bus pipelining, AXI4 ID tag matching, out-of-order completion routing, and same-ID ordering rules, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior SoC microarchitect auditing an AXI4 interconnect subsystem running at a clock frequency $f_{\text{clk}} = 2.0\text{ GHz}$ ($T_{\text{clk}} = 0.50\text{ ns} = 500\text{ ps}$).

The interconnect connects a high-speed CPU Core Master to two memory targets:
* **Target A (Fast On-Chip SRAM)**: Read Access Latency $T_{\text{SRAM}} = 2\text{ clock cycles}$ ($1.0\text{ ns}$).
* **Target B (Slow Off-Chip DRAM)**: Read Access Latency $T_{\text{DRAM}} = 20\text{ clock cycles}$ ($10.0\text{ ns}$).

```text
2.0 GHZ SOC INTERCONNECT WITH SPLIT-TRANSACTION PIPELINING

 CPU Core Master (2.0 GHz) ──► [ AXI4 Interconnect ] ──┬──► Fast SRAM (2 Cycles)
 Clock T = 500 ps              Split-Transaction Bus   └──► Slow DRAM (20 Cycles)
```

#### Workload Request Sequence:
At physical time $t = 0.0\text{ ns}$ (Clock Cycle 0), the CPU Core Master dispatches four single-word memory read requests on four consecutive clock cycles ($t = 0, 1, 2, 3$):

* **Request 1 (Cycle 0)**: `READ [Target B / Slow DRAM]` $\to$ Assigned ID Tag `ARID = 1`.
* **Request 2 (Cycle 1)**: `READ [Target A / Fast SRAM]` $\to$ Assigned ID Tag `ARID = 2`.
* **Request 3 (Cycle 2)**: `READ [Target A / Fast SRAM]` $\to$ Assigned ID Tag `ARID = 3`.
* **Request 4 (Cycle 3)**: `READ [Target B / Slow DRAM]` $\to$ Assigned ID Tag `ARID = 1` (**NOTE: Same ID Tag as Request 1!**).

#### Your Objective

1. Analyze **System 0 (Legacy Non-Split In-Order Bus)**:
   * Calculate the completion cycle, total execution delay (in nanoseconds), and effective throughput (in MB/sec) for all 4 requests.
   * Show how slow DRAM head-of-line blocking stalls fast SRAM requests.
2. Analyze **System 1 (AXI4 Split-Transaction Out-of-Order Interconnect)**:
   * Trace the address dispatch cycles on the `AR` channel and data return cycles on the `R` channel for all 4 requests.
   * Apply Same-ID In-Order rules to determine the exact return cycles for Request 1 (`ARID = 1`) and Request 4 (`ARID = 1`).
   * Calculate the total execution completion time (in nanoseconds) and effective memory throughput (in MB/sec).
3. Calculate the percentage reduction in execution delay and the overall **Performance Speedup Factor** of System 1 (AXI4) over System 0 (Non-Split).
4. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze System 0 (Legacy Non-Split In-Order Bus)

Under a non-split in-order bus, every transaction locks the entire interconnect until its data payload returns.

##### Trace Execution Sequence (System 0):

1. **Request 1 (Cycle 0, Slow DRAM)**:
   * Address Phase: Cycle 0 ($0.5\text{ ns}$).
   * Read Latency Wait: $20\text{ clock cycles}$. Data returned at Cycle 21 ($10.5\text{ ns}$).
   * **Request 1 Completes at Cycle 21 ($t = 10.5\text{ ns}$)**.
   * **STALL IMPACT**: Requests 2, 3, and 4 are **completely blocked** from placing their addresses on the bus during Cycles 0 through 20!

2. **Request 2 (Cycle 21, Fast SRAM)**:
   * Address Phase: Cycle 21 ($10.5\text{ ns}$).
   * Read Latency Wait: $2\text{ clock cycles}$. Data returned at Cycle 23 ($11.5\text{ ns}$).
   * **Request 2 Completes at Cycle 23 ($t = 11.5\text{ ns}$)**.

3. **Request 3 (Cycle 23, Fast SRAM)**:
   * Address Phase: Cycle 23 ($11.5\text{ ns}$).
   * Read Latency Wait: $2\text{ clock cycles}$. Data returned at Cycle 25 ($12.5\text{ ns}$).
   * **Request 3 Completes at Cycle 25 ($t = 12.5\text{ ns}$)**.

4. **Request 4 (Cycle 25, Slow DRAM)**:
   * Address Phase: Cycle 25 ($12.5\text{ ns}$).
   * Read Latency Wait: $20\text{ clock cycles}$. Data returned at Cycle 45 ($22.5\text{ ns}$).
   * **Request 4 Completes at Cycle 45 ($t = 22.5\text{ ns}$)**.

```text
SYSTEM 0 NON-SPLIT BUS CHRONOLOGY

 Cycle 0..21  : Req 1 (DRAM) ──► Address & DRAM Wait (20c) ──► Done at Cycle 21
                Req 2, 3, 4  ──► BLOCKED BEHIND REQ 1!
 Cycle 21..23 : Req 2 (SRAM) ──► Done at Cycle 23 (11.5 ns)
 Cycle 23..25 : Req 3 (SRAM) ──► Done at Cycle 25 (12.5 ns)
 Cycle 25..45 : Req 4 (DRAM) ──► Done at Cycle 45 (22.5 ns)
```

##### System 0 Performance Metrics:
* Total Completion Time ($T_{\text{System0}}$): **45 Clock Cycles ($22.50 \text{ nanoseconds}$)**.
* Total Data Payload = 4 words $\times 4\text{ bytes} = 16\text{ bytes}$.
* Effective System Throughput ($\text{TH}_{\text{System0}}$):

$$\text{TH}_{\text{System0}} = \frac{16\text{ Bytes}}{22.50 \times 10^{-9}\text{ s}} \approx \mathbf{711.11 \times 10^6 \text{ Bytes/sec}} = \mathbf{711.11 \text{ MB/sec}}$$

---

#### Step 2: Analyze System 1 (AXI4 Split-Transaction Out-of-Order Interconnect)

Under AXI4, the `AR` address channel and `R` data channel are completely split and decoupled.

##### 1. Address Phase Dispatch (`AR` Channel):
* **Cycle 0 ($t = 0.0\text{ ns}$)**: Dispatches **Req 1** (`ARID = 1`, Slow DRAM). `AR` Handshake complete! `AR` channel freed on Cycle 1.
* **Cycle 1 ($t = 0.5\text{ ns}$)**: Dispatches **Req 2** (`ARID = 2`, Fast SRAM). `AR` Handshake complete! `AR` channel freed on Cycle 2.
* **Cycle 2 ($t = 1.0\text{ ns}$)**: Dispatches **Req 3** (`ARID = 3`, Fast SRAM). `AR` Handshake complete! `AR` channel freed on Cycle 3.
* **Cycle 3 ($t = 1.5\text{ ns}$)**: Dispatches **Req 4** (`ARID = 1`, Slow DRAM). `AR` Handshake complete!

All 4 read address requests are dispatched in **4 consecutive clock cycles ($1.5\text{ ns}$)**!

---

##### 2. Data Response Phase (`R` Channel — Out-of-Order Returns):

Let's trace when each memory target finishes reading its data:

* **Req 2 (`ARID = 2`, Fast SRAM)**:
  * Dispatched at Cycle 1. SRAM latency = $2\text{ cycles}$.
  * Data ready at Cycle $1 + 2 = \mathbf{3\text{ ($t = 1.5\text{ ns}$)}}$.
  * Drives `RDATA` with `RID = 2`.
  * **Request 2 Completes at Cycle 3 ($1.5\text{ ns}$)! (OUT-OF-ORDER RETURN!)**

* **Req 3 (`ARID = 3`, Fast SRAM)**:
  * Dispatched at Cycle 2. SRAM latency = $2\text{ cycles}$.
  * Data ready at Cycle $2 + 2 = \mathbf{4\text{ ($t = 2.0\text{ ns}$)}}$.
  * Drives `RDATA` with `RID = 3`.
  * **Request 3 Completes at Cycle 4 ($2.0\text{ ns}$)! (OUT-OF-ORDER RETURN!)**

* **Req 1 (`ARID = 1`, Slow DRAM)**:
  * Dispatched at Cycle 0. DRAM latency = $20\text{ cycles}$.
  * Data ready at Cycle $0 + 20 = \mathbf{20\text{ ($t = 10.0\text{ ns}$)}}$.
  * Drives `RDATA` with `RID = 1`.
  * **Request 1 Completes at Cycle 20 ($10.0\text{ ns}$)!**

* **Req 4 (`ARID = 1`, Slow DRAM — SAME-ID IN-ORDER RULE CHECK!)**:
  * Dispatched at Cycle 3. DRAM latency = $20\text{ cycles}$.
  * Data ready at Cycle $3 + 20 = \mathbf{23\text{ ($t = 11.5\text{ ns}$)}}$.
  * **Same-ID Check**: `ARID = 1` matches Req 1's ID (`ARID = 1`).
  * Req 4 returns data at Cycle 23, which is AFTER Req 1 returned at Cycle 20!
  * **Same-ID In-Order Invariant Preserved!** Req 1 returned at Cycle 20; Req 4 returned at Cycle 23.
  * **Request 4 Completes at Cycle 23 ($11.5\text{ ns}$)!**

```text
SYSTEM 1 AXI4 SPLIT-TRANSACTION CHRONOLOGY

 AR Channel Dispatches : [ Req 1 (C0) ] [ Req 2 (C1) ] [ Req 3 (C2) ] [ Req 4 (C3) ]
 R Channel Returns     : Cycle 3: Req 2 Data (RID = 2) ──► Fast SRAM Hit! (1.5 ns)
                         Cycle 4: Req 3 Data (RID = 3) ──► Fast SRAM Hit! (2.0 ns)
                         Cycle 20: Req 1 Data (RID = 1) ──► Slow DRAM Hit! (10.0 ns)
                         Cycle 23: Req 4 Data (RID = 1) ──► Slow DRAM Hit! (11.5 ns)
```

##### System 1 Performance Metrics:
* Req 2 Completion: Cycle 3 ($1.5\text{ ns}$) $\implies \mathbf{87.0\% \text{ Faster than System 0!}}$
* Req 3 Completion: Cycle 4 ($2.0\text{ ns}$) $\implies \mathbf{84.0\% \text{ Faster than System 0!}}$
* Req 1 Completion: Cycle 20 ($10.0\text{ ns}$).
* Req 4 Completion: **Cycle 23 ($11.50 \text{ nanoseconds}$)**.
* Total Completion Time ($T_{\text{System1}}$): **23 Clock Cycles ($11.50 \text{ nanoseconds}$)**.
* Effective System Throughput ($\text{TH}_{\text{System1}}$):

$$\text{TH}_{\text{System1}} = \frac{16\text{ Bytes}}{11.50 \times 10^{-9}\text{ s}} \approx \mathbf{1,391.30 \times 10^6 \text{ Bytes/sec}} = \mathbf{1,391.30 \text{ MB/sec}}$$

---

#### Step 3: Calculate Performance Speedup Factors

Let us compare the execution time and throughput between System 0 (Non-Split) and System 1 (AXI4 Split-Transaction):

##### 1. Total Execution Time Reduction:

$$\text{Time Reduction} = \left( 1 - \frac{T_{\text{System1}}}{T_{\text{System0}}} \right) \times 100\% = \left( 1 - \frac{11.50\text{ ns}}{22.50\text{ ns}} \right) \times 100\%$$

$$\text{Time Reduction} = (1 - 0.5111) \times 100\% = \mathbf{48.89\% \text{ Reduction in Total Execution Delay!}}$$

##### 2. Overall System Throughput Speedup Factor:

$$\text{Speedup}_{\text{total}} = \frac{T_{\text{System0}}}{T_{\text{System1}}} = \frac{45\text{ cycles}}{23\text{ cycles}} = \frac{22.50\text{ ns}}{11.50\text{ ns}} \approx \mathbf{1.9565\times \text{ Performance Speedup!}}$$

```text
AXI4 SPLIT-TRANSACTION PIPELINING PERFORMANCE SUMMARY

 Metric                    │ System 0 (Non-Split Bus) │ System 1 (AXI4 Split Bus) │ AXI4 Advantage
───────────────────────────┼──────────────────────────┼───────────────────────────┼──────────────────
 Fast SRAM Req 2 Completion│ Cycle 23 (11.50 ns)      │ Cycle 3 (1.50 ns)         │ 7.67x FASTER!
 Fast SRAM Req 3 Completion│ Cycle 25 (12.50 ns)      │ Cycle 4 (2.00 ns)         │ 6.25x FASTER!
 Total Stream Completion   │ 45 Cycles (22.50 ns)     │ 23 Cycles (11.50 ns)      │ 48.9% Time Saved!
 Effective Read Throughput │ 711.11 MB/sec            │ 1,391.30 MB/sec           │ 1.957x FASTER!
```

##### Engineering Conclusion:
By splitting transactions and using out-of-order ID tagging, AXI4 allowed fast SRAM read requests (Req 2 and Req 3) to execute and return **$7.67\times \text{ and } 6.25\times \text{ faster}$** in parallel while Req 1's slow DRAM fetch was in flight in the background, cutting total stream execution time in half ($11.50\text{ ns}$ vs $22.50\text{ ns}$)!

---

### Sanity Check and Verification

Let us verify our mathematical and protocol state results against AXI4 specification rules:

1. **Same-ID In-Order Rule Check**:
   * Req 1 (`ARID = 1`) returned data at Cycle 20.
   * Req 4 (`ARID = 1`) returned data at Cycle 23.
   * Req 4 returned AFTER Req 1 ($23 > 20$). The Same-ID In-Order invariant held with $100\%$ precision!
2. **Different-ID Reordering Check**:
   * Req 2 (`ARID = 2`) and Req 3 (`ARID = 3`) returned at Cycles 3 and 4, BEFORE Req 1 (`ARID = 1`) returned at Cycle 20.
   * Different-ID out-of-order return executed correctly, avoiding head-of-line blocking.
3. **Address Channel Pipelining Check**:
   * All 4 requests were accepted on the `AR` channel on Cycles 0, 1, 2, 3.
   * Address channel utilization = $100\%$ during the first 4 cycles, confirming zero address bus locking.

All channel signals, ID tag matching lookups, Same-ID order constraints, and pipelined throughput metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Split-Transaction Bus**: An interconnect architecture that completely separates the address request phase (`AR` / `AW` channels) from the data response phase (`R` / `B` channels), freeing the address channel immediately after acceptance to allow multiple memory transactions to be pipelined in flight concurrently.
* **Out-of-Order Transaction ID Tag**: A binary identification field (`ARID`/`RID`, `AWID`/`BID`) attached to address requests and echoed by memory targets on data/response returns, enabling memory targets with different latencies to return payloads out of order while guaranteeing that transactions with identical ID tags remain strictly in program order.
