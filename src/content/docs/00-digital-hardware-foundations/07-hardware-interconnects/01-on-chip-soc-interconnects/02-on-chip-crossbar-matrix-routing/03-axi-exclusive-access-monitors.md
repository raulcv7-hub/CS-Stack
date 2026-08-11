---
title: "AXI Exclusive Access Signaling and Hardware Reservation Monitor Mechanics"
---

# AXI Exclusive Access Signaling and Hardware Reservation Monitor Mechanics

## The Multi-Core Atomic Synchronization Race and Interconnect Data Corruption

In modern multi-core System-on-Chip (SoC) architectures, multiple independent processor cores—such as CPU Core 0 and CPU Core 1—execute parallel software threads simultaneously. These concurrent threads frequently need to coordinate their actions by updating shared variables in memory. For example, two threads might attempt to increment a shared task counter, dequeue a work item from a shared queue, or acquire a mutual exclusion lock (a spinlock) before entering a critical section of code.

To increment a shared counter variable at memory address $A$, a processor core cannot perform the update in a single physical nanosecond. An increment operation is a multi-step **Read-Modify-Write** sequence:
1. **Read Phase**: The core reads the current value from address $A$ into a local CPU register.
2. **Modify Phase**: The core's arithmetic logic unit (ALU) increments the value inside the local register.
3. **Write Phase**: The core writes the new incremented value from the register back to memory address $A$.

Now, consider the catastrophic multi-core race condition that occurs when Core 0 and Core 1 attempt to increment the exact same shared counter variable (initially holding value $100$) at the exact same time without hardware atomic protection:

```text
THE MULTI-CORE READ-MODIFY-WRITE COLLISION (LOST UPDATE)

 Core 0 Execution Stream                     Core 1 Execution Stream
 ┌───────────────────────────┐               ┌───────────────────────────┐
 │ 1. Read Addr A (Reads 100)│               │ 1. Read Addr A (Reads 100)│
 ├───────────────────────────┤               ├───────────────────────────┤
 │ 2. Compute 100 + 1 = 101  │               │ 2. Compute 100 + 1 = 101  │
 ├───────────────────────────┤               ├───────────────────────────┤
 │ 3. Write Addr A = 101     │               │ 3. Write Addr A = 101     │
 └─────────────┬─────────────┘               └─────────────┬─────────────┘
               │                                           │
               ▼                                           ▼
      Memory Updated to 101!                      Memory Overwritten with 101!
      (TWO INCREMENTS EXECUTED, BUT MEMORY INCREASED BY ONLY 1!)
```

Trace the physical hardware failure step-by-step:
1. **Phase 1 (Interleaved Reads)**: Core 0 reads address $A$ and receives value $100$. A fraction of a nanosecond later, before Core 0 can write back its result, Core 1 *also* reads address $A$ and receives the exact same value $100$!
2. **Phase 2 (Local Computation)**: Core 0 computes $100 + 1 = 101$ in its register. Core 1 computes $100 + 1 = 101$ in its register.
3. **Phase 3 (Interleaved Writes)**: Core 0 writes $101$ to address $A$. A nanosecond later, Core 1 writes $101$ to address $A$, overwriting Core 0's result!

Look at the final result in memory:
Address $A$ holds value **$101$**! 

Two separate cores executed increment operations, so the value in memory should be **$102$**. Core 0's increment was completely erased and overwritten by Core 1! 

This catastrophic failure mode is known as **The Lost Update Hazard**.

In early computer systems, hardware engineers solved this race condition by implementing a heavy, aggressive mechanism called **Bus Locking (`LOCK` Signal)**:
* When Core 0 wanted to perform a Read-Modify-Write operation, it asserted a physical `LOCK` signal that **completely frozen and locked the entire interconnect bus**.
* No other core on the microchip was permitted to issue a single read or write transaction to *any* memory location for the entire duration of Core 0's Read-Modify-Write sequence.

While Bus Locking guarantees atomic correctness, it imposes a massive performance penalty:
* Locking the entire interconnect bus for 50 or 100 clock cycles while Core 0 executes its Read-Modify-Write sequence forces all other cores on the chip to sit completely idle.
* Unrelated memory transfers targeting completely different memory banks are unnecessarily blocked.
* On a 16-core or 64-core processor, bus locking destroys multi-core parallel execution throughput.

How do we allow multi-core processors to execute atomic Read-Modify-Write operations across shared interconnects **WITHOUT locking the bus**, allowing unrelated memory traffic to proceed at full speed while detecting if another core modified address $A$ between the read and write phases?

To achieve non-blocking atomic synchronization, modern System-on-Chip interconnects—such as the Advanced eXtensible Interface 4 (**AXI4**) specification—employ **AXI Exclusive Access Signaling (`ARLOCK` / `AWLOCK`)** and **Hardware Reservation Monitors (`EXOKAY` Response)**.


### Policy 1: The Heavy Padlock Rule (Bus Locking)

The head librarian enforces a primitive rule: *"If you want to edit Page 10, you must put a heavy iron chain and padlock around the entire library building! Nobody else can enter the library to read ANY book until you finish writing!"*

* Scholar 0 locks the library building. Scholar 1 sits outside on the sidewalk in the rain for 10 minutes doing nothing, even though Scholar 1 just wanted to read an unrelated book in the back room!
* The entire library stands idle. This is the **Bus Locking Overhead Penalty**.


## Primitive 1: AXI Exclusive Access Signaling (`ARLOCK` / `AWLOCK`)

Now that we possess a clear intuitive mental model of library sticky note reservations, let us examine the formal engineering mechanics of **AXI Exclusive Access Signaling**.

In the AXI4 specification, atomic synchronization operations (such as Load-Reserved / Store-Conditional in RISC-V/ARM or atomic exchange operations) are executed using a two-phase transaction handshake supported by specialized hardware lock signals on the address channels:

```text
AXI4 EXCLUSIVE ACCESS ADDRESS CHANNEL SIGNALS

 Read Address Channel (AR)  ──► ARADDR[63:0], ARID[3:0], ARLOCK[0] (Exclusive Read Flag)
 Write Address Channel (AW) ──► AWADDR[63:0], AWID[3:0], AWLOCK[0] (Exclusive Write Flag)
```

* **`ARLOCK[0]` (Read Address Lock Signal)**:
  * `ARLOCK[0] = 0` $\implies$ Normal Read Transaction.
  * `ARLOCK[0] = 1` $\implies$ **Exclusive Read Transaction** (Load-Reserved / `LR`). Commands the interconnect and memory target to establish a hardware reservation for this master at the specified address!
* **`AWLOCK[0]` (Write Address Lock Signal)**:
  * `AWLOCK[0] = 0` $\implies$ Normal Write Transaction.
  * `AWLOCK[0] = 1` $\implies$ **Exclusive Write Transaction** (Store-Conditional / `SC`). Commands the interconnect and memory target to verify whether the hardware reservation is still valid before committing the write!


#### Phase 1: The Exclusive Read Phase (`ARLOCK = 1`)

1. **Address Dispatch**: Master $k$ dispatches a read address request on the `AR` channel: `ARADDR = A`, `ARID = k`, and sets **`ARLOCK = 1`**.
2. **Reservation Registration**: The interconnect and memory target receive `ARLOCK = 1`. 
   * A hardware tracking unit—the **Reservation Monitor**—registers a new reservation for address $A$ owned by Master $k$.
3. **Data Return & `EXOKAY` Confirmation**: The slave target returns the requested data payload on the `R` channel with the response flag set to **`RRESP = EXOKAY` (`2'b01`)**:
   $$\text{RRESP} = 2'b01 \quad (\mathbf{\text{EXOKAY: Exclusive Read Registered Successfully!}})$$
4. **Local Computation**: Master $k$ receives the data word, un-stalls its CPU pipeline, and performs its local arithmetic computation in a CPU register (e.g., incrementing the value).


## Primitive 2: The Hardware Reservation Monitor (`EXOKAY` vs `OKAY`)

Now let us inspect the internal hardware architecture of the component that tracks reservations and evaluates `EXOKAY` responses: **The Reservation Monitor**.

### Where Does the Reservation Monitor Sit in Hardware?

In a modern System-on-Chip, reservation monitoring is split across two distinct hardware locations:

```text
DUAL-LEVEL RESERVATION MONITOR TOPOLOGY

 CPU Core 0 (Master 0)                       CPU Core 1 (Master 1)
 ┌───────────────────────────┐               ┌───────────────────────────┐
 │ Local Reservation Monitor │               │ Local Reservation Monitor │
 │ (Monitors L1/L2 SRAM)     │               │ (Monitors L1/L2 SRAM)     │
 └─────────────┬─────────────┘               └─────────────┬─────────────┘
               │                                           │
               ▼                                           ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │ Global Reservation Monitor (Inside Memory Controller / Interconnect)  │
 │ (Monitors Un-Cached DRAM / Main Memory Addresses)                    │
 └───────────────────────────────────────────────────────────────────────┘
```

1. **Local Reservation Monitor**: Sits inside each individual CPU core. It tracks exclusive accesses to memory addresses that reside inside that core's private L1/L2 SRAM caches.
2. **Global Reservation Monitor**: Sits inside the system memory controller or interconnect crossbar switch. It tracks exclusive accesses to shared memory addresses that are non-cacheable or reside in main system DRAM.


### The Reservation Monitor State Machine Rules

The Reservation Monitor operates according to four strict hardware rules:

```text
RESERVATION MONITOR HARDWARE STATE RULES

 Rule 1: Exclusive Read (ARLOCK = 1)  ──► Registers Slot: [V=1, Addr = A, Master = k]
 Rule 2: Normal Write (AWLOCK = 0)   ──► If Addr == A, INVALIDATE ALL RESERVATIONS for A!
 Rule 3: Exclusive Write (AWLOCK = 1)──► Check Slot: Is V==1 AND Addr==A AND Master==k?
                                         YES ──► Update Memory, Return EXOKAY (2'b01)!
                                         NO  ──► REJECT WRITE! Return OKAY (2'b00)!
```

#### Rule 1: Registration on Exclusive Read (`ARLOCK = 1`)
When Master $k$ issues `ARADDR = A` with `ARLOCK = 1`:
* The Reservation Monitor allocates a slot, writes $V \Leftarrow 1$, sets $\text{Reserved\_Addr} \Leftarrow A \ \& \ \sim 63$, and sets $\text{Master\_ID} \Leftarrow k$.
* The slave target returns `RRESP = EXOKAY` (`2'b01`).

#### Rule 2: Invalidation on Intervening Write
Whenever **ANY master** (whether Master $k$ or a different Master $j$) issues a store instruction (`AWADDR = A`) that modifies address $A$:
* The Reservation Monitor compares `AWADDR` against all active reserved block addresses.
* If a match occurs, the Reservation Monitor **clears the Valid bit ($V \Leftarrow 0$) for ALL reservations associated with address $A$**!
* The reservation is broken!

#### Rule 3: Validation on Exclusive Write (`AWLOCK = 1`)
When Master $k$ issues `AWADDR = A` with `AWLOCK = 1`:
* The Reservation Monitor checks its table for an active entry matching $A$ and $k$:

$$\text{Valid\_Exclusive\_Write} = (V_m == 1) \quad \mathbf{\text{AND}} \quad (\text{AWADDR} \ \ \& \ \ \sim 63 == \text{Reserved\_Addr}_m) \quad \mathbf{\text{AND}} \quad (\text{AWID} == \text{Master\_ID}_m)$$

* **If $\text{Valid\_Exclusive\_Write} == 1$**:
  * The write is **ACCEPTED**.
  * Memory cells are updated with `WDATA`.
  * The slave returns **`BRESP = EXOKAY` (`2'b01`)**.
  * The reservation entry is cleared ($V_m \Leftarrow 0$).
* **If $\text{Valid\_Exclusive\_Write} == 0$**:
  * The write is **REJECTED**.
  * Memory cells are **NOT UPDATED**! `WDATA` is discarded.
  * The slave returns **`BRESP = OKAY` (`2'b00`)**.


## Real-World Silicon Engineering: False Invalidation and Lock-Free Contention

In commercial semiconductor engineering, implementing reservation monitors requires balancing tracking granularity against multi-core contention overheads.

### 1. Reservation Granularity and False Invalidation

In physical silicon, a Reservation Monitor does not track individual 1-byte or 4-byte memory addresses. It tracks memory at **Cache Line Granularity (64 Bytes = $512\text{ Bits}$)**.

Why do reservation monitors track full 64-byte blocks rather than single bytes?
Because storing full 64-bit addresses for thousands of memory locations would require massive, power-hungry comparator arrays. By masking out the lower 6 offset bits ($\text{Address} \ \& \ \sim 63$), a reservation monitor tracks the entire 64-byte line using a single small register.

However, 64-byte tracking introduces a software performance hazard known as **False Reservation Invalidation**:

```text
FALSE RESERVATION INVALIDATION HAZARD

 64-Byte Memory Cache Line Address 0x1000:
 [ Byte 0..3: Counter A (Core 0) ] ... [ Byte 32..35: Counter B (Core 1) ]
 ┌───────────────────────────────────────────────────────────────────────┐
 │ Core 0 reserves Address 0x1000 (Byte 0)                               │
 └───────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
 Core 1 writes to Address 0x1020 (Byte 32 in SAME 64-byte line!)
 Reservation Monitor sees line 0x1000 modified ──► INVALIDATES Core 0's Reservation!
 (Core 0's store-conditional FAILS even though nobody touched Byte 0!)
```

#### Trace the False Invalidation Hazard:
1. Core 0 executes an exclusive read (`LR`) on `Counter A` at byte address `0x1000`. The Reservation Monitor registers a reservation for the 64-byte block `0x1000`.
2. Core 1 executes a normal store instruction on `Counter B` at byte address `0x1020` ($32\text{ bytes}$ away from `Counter A`, but inside the **exact same 64-byte block** `0x1000`).
3. The Reservation Monitor sees a write to block `0x1000` and **invalidates Core 0's reservation**!
4. When Core 0 attempts its store-conditional (`SC`) on `Counter A`, the write fails (`BRESP = OKAY`), even though Core 1 never touched `Counter A`!

#### Software Best Practice:
To prevent false reservation invalidation, multi-threaded software developers align atomic variables and spinlocks to **independent, 64-byte cache line boundaries**, ensuring that no unrelated variables share the same 64-byte block.


## Solved Industrial Engineering Exercise: Quantitative AXI Exclusive Access Sequence, Reservation Monitor Tracking, and Atomic Synchronization Trace

To consolidate your complete mastery of AXI exclusive access signaling (`ARLOCK`/`AWLOCK`), hardware reservation monitor state transitions, `EXOKAY` vs `OKAY` responses, and store-conditional failure mechanics, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Trace Cycle 0 to Cycle 3 — Exclusive Reads

##### Cycle 0 ($t = 0.0\text{ ns}$ — Core 0 Exclusive Read):
* Core 0 dispatches `ARADDR = 0x1000`, `ARLOCK = 1`, `ARID = 0`.
* **Global Reservation Monitor Action**:
  * Allocates Slot 0: Sets $V_0 \Leftarrow 1$, $\text{Reserved\_Addr} \Leftarrow \text{0x1000}$, $\text{Master\_ID} \Leftarrow 0$ (Core 0).
* **Cycle 2 ($t = 1.0\text{ ns}$)**: SRAM returns data value $100$ on `R` channel with **`RRESP = EXOKAY` (`2'b01`)**.
* Core 0 receives value $100$ in register `R1_0`. Core 0 begins computing $100 + 1 = 101$ in its ALU.

##### Cycle 2 ($t = 1.0\text{ ns}$ — Core 1 Exclusive Read):
* Core 1 dispatches `ARADDR = 0x1000`, `ARLOCK = 1`, `ARID = 1`.
* **Global Reservation Monitor Action**:
  * Allocates Slot 1: Sets $V_1 \Leftarrow 1$, $\text{Reserved\_Addr} \Leftarrow \text{0x1000}$, $\text{Master\_ID} \Leftarrow 1$ (Core 1).
* **Cycle 4 ($t = 2.0\text{ ns}$)**: SRAM returns data value $100$ on `R` channel with **`RRESP = EXOKAY` (`2'b01`)**.
* Core 1 receives value $100$ in register `R1_1`. Core 1 begins computing $100 + 1 = 101$ in its ALU.

```text
RESERVATION MONITOR STATE AT CYCLE 3

 Slot 0: [ Valid V0 = 1 | Reserved Addr = 0x1000 | Master ID = 0 (Core 0) ]
 Slot 1: [ Valid V1 = 1 | Reserved Addr = 0x1000 | Master ID = 1 (Core 1) ]
 (Both Core 0 and Core 1 hold active reservations for Address 0x1000!)
```


#### Step 3: Trace Cycle 6 to Cycle 7 — Core 0 Exclusive Write (REJECTED!)

##### Cycle 6 ($t = 3.0\text{ ns}$ — Core 0 Exclusive Write Attempt):
* Core 0 finishes ALU calculation ($100 + 1 = 101$).
* Core 0 dispatches `AWADDR = 0x1000`, `AWLOCK = 1`, `AWID = 0`, `WDATA = 101`.
* **Global Reservation Monitor Verification**:
  * Checks table for `AWADDR = 0x1000` and `Master_ID = 0`.
  * **SLOT 0 IS INVALID ($V_0 == 0$)! RESERVATION WAS BROKEN BY CORE 1!**
  * **Exclusive Write REJECTED for Core 0!**

##### Cycle 7 ($t = 3.5\text{ ns}$ — Rejection Handling & Memory Preservation):
1. **SRAM Protection**: Memory cells at address `0x1000` **ARE NOT MODIFIED**! Memory remains at **`101`**!
2. **`OKAY` Rejection Response**: Memory controller drives `B` channel response: **`BRESP = OKAY` (`2'b00`)** (Normal OKAY, NOT `EXOKAY`!), `BID = 0`.
3. **Core 0 Result**: Core 0 receives `OKAY` (`2'b00`). Core 0's CPU load-store unit detects that `BRESP \neq EXOKAY`.
4. Core 0 marks its Store-Conditional instruction as **FAILED ($R_{\text{status\_0}} \Leftarrow 1$)**!
5. Core 0 discards the failed write and branches back to retry the atomic operation from Phase 1!

```text
CORE 0 REJECTION TIMELINE AT CYCLE 7

 Core 0 receives BRESP = OKAY (2'b00) ──► Rejection Detected! (Status R_status = 1)
                                          SRAM Memory Cell PRESERVED at 101!
                                          Core 0 loops back to retry Phase 1!
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and state machine results against AXI4 specification rules:

1. **SWMR Atomic Correctness Check**:
   * Initial value = $100$. Two cores executed atomic increments (`+1` each).
   * Final SRAM value = **$102$**.
   * If Core 0's first write had not been rejected, the final value would have been $101$ (Lost Update hazard). Rejection preserved $100\%$ atomic correctness!
2. **`EXOKAY` vs `OKAY` Response Verification**:
   * Core 1 received `BRESP = 2'b01` (`EXOKAY`) $\implies$ Store-Conditional Succeeded.
   * Core 0 received `BRESP = 2'b00` (`OKAY`) $\implies$ Store-Conditional Failed.
   * Response encodings matched AXI4 specification rules with $100\%$ precision!
3. **Memory Preservation Verification**:
   * When Core 0's write was rejected at Cycle 7, $WDATA = 101$ was discarded, and SRAM remained at $101$ until Core 0's retry wrote $102$ at Cycle 12.

All reservation monitor state transitions, address comparators, `EXOKAY` response encodings, and atomic synchronization retry loops evaluate with 100% mathematical, physical, and logical precision.

