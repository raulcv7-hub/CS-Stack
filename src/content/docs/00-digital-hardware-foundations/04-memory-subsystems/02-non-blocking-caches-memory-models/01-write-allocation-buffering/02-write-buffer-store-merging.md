---
title: "Write Buffer Queue Architecture and Store Merging Mechanics"
---

# Write Buffer Queue Architecture and Store Merging Mechanics

## The Un-Buffered Write Stall Hazard and Interconnect Command Inefficiency

In high-performance microprocessor design, memory store operations (writes) present a fundamental physical timing challenge. While modern processor execution pipelines process instructions at speeds exceeding three billion clock cycles per second ($3.0\text{ GHz}+$), the off-chip memory interconnect bus and main Dynamic Random-Access Memory (DRAM) operate at much lower clock frequencies and incur substantial physical access delays.

When a processor core executes a store instruction (such as `STORE R1, [R2]` or `SD R3, 0(R4)`), the new data payload must eventually be written to lower levels of the memory hierarchy. 

Even when an L1 Data Cache employs a Write-Back policy (holding modified data locally in SRAM), cache misses, write-through traffic, and dirty line evictions periodically require data to be transmitted across the memory interconnect bus to lower-level memory (L2/L3 cache or main DRAM).

Writing a data block across a memory interconnect bus is a slow multi-step physical process:
1. **Bus Arbitration**: The cache controller must request and win control of the shared memory bus.
2. **Command Protocol Overhead**: The controller transmits address and command control signals across the bus wires, paying fixed handshake setup delays ($t_{\text{cmd}}$).
3. **Physical Memory Latency**: Main DRAM memory chips require time to activate row buffers, decode column addresses, and settle write currents ($t_{\text{DRAM}}$).

A single off-chip memory write transaction typically consumes **$100\text{ to } 200\text{ CPU clock cycles}$**.

If the processor execution pipeline is forced to pause and wait for the memory bus to acknowledge every write transaction before executing the next instruction (an **Un-Buffered Write Architecture**), the processor suffers a severe performance disaster:

```text
UN-BUFFERED WRITE PIPELINE STALL DISASTER

 Store Instruction (SD) ──► Dispatches Write to Memory Bus
                            │
                            ▼
              CPU PIPELINE FROZEN FOR 150 CLOCK CYCLES!
              (Waiting for off-chip memory bus write to complete)
                            │
                            ▼
 Next Instruction       ──► Resumes execution only after 150 cycles!
```

For every store instruction or dirty eviction, the CPU pipeline freezes for 150 clock cycles. If $15\%$ of instructions in a program are stores, the processor spends more than $95\%$ of its life standing completely idle, frozen in **Write Stall Cycles**!

Furthermore, software programs frequently execute sequences of small, adjacent store operations in rapid succession—such as initializing an array of integers, writing fields inside a newly allocated object, or pushing multiple registers onto the call stack:

```c
// STREAMING ADJACENT STORES
array[0] = 10; // Writes 4 bytes to Address 0x1000
array[1] = 20; // Writes 4 bytes to Address 0x1004
array[2] = 30; // Writes 4 bytes to Address 0x1008
array[3] = 40; // Writes 4 bytes to Address 0x100C
```

In an un-optimized memory interconnect:
* The 4-byte store to `array[0]` generates **Bus Transaction 1** (pays full 150-cycle command overhead to write 4 bytes).
* The 4-byte store to `array[1]` generates **Bus Transaction 2** (pays full 150-cycle command overhead to write 4 bytes).
* The 4-byte store to `array[2]` generates **Bus Transaction 3**...
* The 4-byte store to `array[3]` generates **Bus Transaction 4**...

Look at the physical waste of system resources! 
All four 4-byte stores target adjacent memory addresses sitting inside the **exact same 64-byte memory line** (`0x1000` to `0x103F`).

Yet, the un-optimized system issued **four separate, fragmented bus transactions**, paying the heavy multi-cycle bus command overhead four times over to transfer a total of only 16 bytes of payload! Over $90\%$ of the memory interconnect's bandwidth and time was wasted on redundant protocol headers and arbitration delays rather than actual data delivery.

To decouple CPU execution from slow memory write latencies and eliminate fragmented bus command overheads, digital hardware engineering relies on two integrated microarchitectural primitives: **The Write Buffer Queue Architecture** and **Store Merging (Write Combining)**.


### Strategy 1: Un-Buffered Direct Delivery (Un-Buffered Write Architecture)

The company board enforces a naive delivery rule: *"Whenever the clerk types a letter, the clerk must personally walk out to the driveway, get into a delivery truck, drive 5 hours to the regional branch, deliver the letter, and drive 5 hours back before typing the next letter!"*

```text
UN-BUFFERED DIRECT DELIVERY (NAIVE WRITE STALLS)

 08:00 AM: Type Letter #1 ──► [ 10-Hour Round Trip Drive ] ──► 06:00 PM: Return to Desk
 06:00 PM: Type Letter #2 ──► [ 10-Hour Round Trip Drive ] ──► 04:00 AM: Return to Desk
 (Clerk spends 99.99% of their day driving delivery trucks on the highway!)
```

Look at how absurd this is! The clerk types a letter in 1 second, but spends **10 hours driving a truck** for every single letter! The clerk's typing productivity drops to near zero.


### The Mailbox Overflow Threat and Strategy 3: Package Combining (Store Merging)

Now, consider a new problem: What happens if the clerk types 4 separate 1-page letters addressed to the **exact same department** in the regional branch in rapid succession?
* Letter 1: Account Balance for Dept A.
* Letter 2: Tax Statement for Dept A.
* Letter 3: Invoice for Dept A.
* Letter 4: Audit Note for Dept A.

Without intelligent organization, the clerk drops 4 separate envelopes into the Outgoing Mailbox. The 4-slot mailbox is now **$100\%$ FULL**!

When the clerk types Letter 5, they look at the Outgoing Mailbox, see zero open slots, and are forced to stop typing and stand idle at their desk until the mail truck returns from its 10-hour drive (**Write Buffer Overflow Stall**)!

```text
UN-MERGED MAILBOX OVERFLOW STALL

 Slot 0: Envelope for Dept A ──┐
 Slot 1: Envelope for Dept A   ├──► Mailbox 100% FULL!
 Slot 2: Envelope for Dept A   │    Clerk FORCED TO STALL on Letter 5!
 Slot 3: Envelope for Dept A ──┘
```

To solve this overflow problem, the office manager installs an **Intelligent Mailbox Combiner** (**Store Merging Hardware**):

When the clerk drops Letter 2 (for Dept A) into the mailbox, the mailbox organizer checks the existing letters in the slots. It sees Letter 1 is *also* addressed to Dept A and hasn't been picked up by the truck yet!

Instead of taking a new mailbox slot, the organizer **opens Envelope 1 and slides Letter 2 inside the exact same envelope**!

```text
STORE MERGING: COMBINING LETTERS INTO A SINGLE ENVELOPE

 Letter 1 (Dept A) ──┐
 Letter 2 (Dept A)   ├──► Combined into ONE single envelope in Slot 0!
 Letter 3 (Dept A)   │    Slots 1, 2, and 3 REMAIN COMPLETELY OPEN!
 Letter 4 (Dept A) ──┘    Clerk NEVER STALLS!
```

Look at what Package Combining achieved:
1. **Slots Saved**: Four separate letters were combined into **1 single envelope in Slot 0**. Slots 1, 2, and 3 remained wide open for future letters! The mailbox never overflowed, and the clerk never stalled!
2. **Truck Efficiency**: The mail truck made **1 trip** carrying 1 thick envelope containing all 4 letters, rather than making 4 separate truck trips carrying thin 1-page envelopes. Truck protocol overhead was cut by $75\%$!

This intelligent mailbox system is the exact physical analogue of **Store Merging in a Write Buffer Queue**:
* The clerk typing letters is the **CPU Execution Pipeline**.
* A 1-page letter is a **Small Store Payload (e.g., a 4-byte integer write)**.
* The Outgoing Mailbox is the **Write Buffer FIFO Queue**.
* The 5-hour truck drive is the **Memory Interconnect Bus Transaction**.
* Combining 4 letters into 1 envelope is **Store Merging (Write Combining)**.
* The Dept A address is the **64-Byte Cache Line Block Address**.


### Internal Hardware Anatomy of a Write Buffer Slot

A Write Buffer consists of an array of $M$ physical register slots (typically $M = 4, 8, \text{or } 16$ slots). 

Each individual slot in a Write Buffer is a multi-field register array structured as follows:

```text
HARDWARE ANATOMY OF A SINGLE WRITE BUFFER SLOT

 ┌──────────┬──────────┬─────────────────────────┬───────────────────────────────┐
 │ Valid    │ Ready /  │ Target Block Address    │ Data Payload Register         │
 │ Bit (V)  │ Sent Bit │ [63:0]                  │ [64 Bytes / 512 Bits]         │
 ├──────────┼──────────┼─────────────────────────┼───────────────────────────────┤
 │ 1 Bit    │ 1 Bit    │ 64-Bit Physical Address │ Byte-Enable Mask [63:0]       │
 └──────────┴──────────┴─────────────────────────┴───────────────────────────────┘
```

Let us examine each field inside a Write Buffer slot:

1. **Valid Bit ($V$)**: A 1-bit flag indicating whether this buffer slot currently holds an active pending write request ($V = 1$) or is empty ($V = 0$).
2. **Target Block Address Register**: Holds the full 64-bit physical memory address targeted by the store instruction or dirty line eviction.
3. **Data Payload Register**: A wide 64-byte ($512\text{-bit}$) data register that holds the write payload.
4. **Byte-Enable Mask Vector**: A 64-bit mask vector ($\text{byte\_en}[63:0]$) where each bit corresponds to one byte within the 64-byte payload:
   * $\text{byte\_en}[i] = 1 \implies$ Byte $i$ contains new valid data written by the CPU.
   * $\text{byte\_en}[i] = 0 \implies$ Byte $i$ is untouched/unmodified.


### The Read-After-Write (RAW) Hazard in Write Buffers

Placing a Write Buffer between the L1 Data Cache and the memory bus introduces a severe functional correctness hazard: **The Read-After-Write (RAW) Hazard**.

Consider a program that executes a store instruction to write a value to address $A$, followed immediately by a load instruction that reads from the **exact same address $A$**:

```c
// READ-AFTER-WRITE (RAW) HAZARD
int32_t X = 100;
int32_t Y = X; // Reads 'X' immediately after writing 'X'!
```

At the hardware level, trace what happens if the store to address $A$ is sitting inside the Write Buffer queue waiting for bus delivery when the load instruction executes:

```text
READ-AFTER-WRITE (RAW) HAZARD IN WRITE BUFFER

 1. CPU Store (SW): Writes 'X = 100' at Address A ──► Pushed to Write Buffer Queue!
                                                    (Value 100 sits in Write Buffer Slot 0)

 2. CPU Load  (LW): Reads 'X' from Address A      ──► Queries L1 SRAM & Main Memory!
                                                    (Main Memory STILL HOLDS OLD VALUE X = 0!)
                                                    (CPU Reads STALE DATA 0 instead of 100!)
```

1. The store instruction writes `X = 100` into the Write Buffer. The new value $100$ is sitting inside Write Buffer Slot 0, waiting to be delivered to lower memory.
2. The subsequent load instruction queries the L1 Cache / Main Memory for address $A$.
3. Main memory and L1 cache still hold the **OLD value of $X$ ($0$)** because Write Buffer Slot 0 has not been delivered to memory yet!
4. If the load instruction reads memory directly, **it will read stale data ($0$) instead of the new value ($100$)**! Data corruption occurs!


## Primitive 2: Store Merging (Write Combining) Mechanics

Now let us examine the second core primitive: **Store Merging** (also known as **Write Combining**).

While a basic Write Buffer decouples CPU execution from bus delays, an un-merged Write Buffer quickly overflows when a program executes a stream of consecutive store operations.

> **Store Merging (Write Combining)** is a hardware optimization mechanism built into write buffer queues where incoming store operations targeting addresses within the **exact same 64-byte cache line block** are coalesced (merged) into a single write buffer slot, updating its byte payload and byte-enable mask rather than allocating multiple separate queue entries.


### The Hardware Algorithm for Store Merging

To execute Store Merging, the Write Buffer controller implements a simple, fast hardware algorithm on every incoming store instruction:

```text
STORE MERGING HARDWARE ALGORITHM

 Incoming Store (Addr A_new, Data W_new, Mask M_new)
                       │
                       ▼
 Compare A_new & ~63 vs. ALL Occupied Slots (WBB_Addr[k] & ~63)
                       │
             ┌─────────┴─────────┐
             │ Match in Slot k?  │
             ▼                   ▼
      YES (Merging Hit)   NO (Merging Miss)
      │                   │
      ▼                   ▼
 Merge W_new into     Allocate NEW Tail Slot
 Slot k Data Reg;     Write Addr, Data, Mask;
 Update Byte Mask:    Set Valid V = 1.
 M_k <= M_k | M_new
```

#### Step-by-Step Logic:
1. An incoming store arrives with physical address $A_{\text{new}}$, payload $W_{\text{new}}$, and byte mask $M_{\text{new}}$.
2. The controller extracts the 64-byte block address:

$$\text{Block\_Addr}_{\text{new}} = A_{\text{new}} \quad \mathbf{\&} \quad \sim 63$$

Where:
* $\text{Block\_Addr}_{\text{new}}$ is the 64-byte aligned block address.
* $A_{\text{new}}$ is the incoming target byte address.
* $\sim 63$ is the bitwise mask clearing the lowest 6 offset bits.

3. Parallel address comparators compare $\text{Block\_Addr}_{\text{new}}$ against the block addresses of **ALL currently valid slots** in the Write Buffer ($V_k == 1$):

$$\text{Merge\_Hit}_k = (V_k == 1) \quad \mathbf{\text{AND}} \quad (\text{Block\_Addr}_{\text{new}} == (\text{WBB\_Addr}_k \ \& \ \sim 63))$$

4. **If a Merge Hit Occurs on Slot $k$**:
   * Payload $W_{\text{new}}$ is written into Slot $k$'s data register at offset $A_{\text{new}}[5:0]$.
   * Slot $k$'s byte-enable mask vector is updated via bitwise OR:

$$\text{byte\_en}_k \Leftarrow \text{byte\_en}_k \quad \mathbf{OR} \quad M_{\text{new}}$$

   * **Zero new buffer slots are allocated!**
5. **If No Merge Hit Occurs (Merge Miss)**:
   * The controller allocates a new Tail slot in the queue, writing the address, data, and byte mask as a new entry.


### The Multi-Core Store Reordering Hazard

Consider two CPU cores (Core 0 and Core 1) communicating via shared memory. Core 0 initializes a data structure and then sets a flag variable to notify Core 1 that the data is ready:

```c
// CORE 0 (PRODUCER CODE)
data_buffer[0] = 42; // Store 1 to Address A1 (Data Payload)
ready_flag = 1;      // Store 2 to Address A2 (Notification Flag)
```

```c
// CORE 1 (CONSUMER CODE)
while (ready_flag == 0); // Wait for flag
int32_t val = data_buffer[0]; // Read data payload
```

Now, trace what can happen inside Core 0's **Store-Merging Write Buffer**:

1. Store 1 (`data_buffer[0] = 42`) is placed into Write Buffer Slot 0.
2. Store 2 (`ready_flag = 1`) is placed into Write Buffer Slot 1.
3. Suppose a subsequent store merges into Slot 1, or Slot 1 is transmitted across the memory bus to DRAM **BEFORE Slot 0** due to bus scheduling optimizations!

```text
STORE REORDERING IN MULTI-CORE MEMORY

 Core 0 Write Buffer:
 Slot 0: data_buffer[0] = 42 (Address A1)
 Slot 1: ready_flag = 1      (Address A2)
             │
             ▼ (Slot 1 transmitted to DRAM FIRST!)
 Main DRAM Memory:
 ready_flag = 1  (UPDATED!)
 data_buffer = 0 (STALE!)
             │
             ▼
 Core 1 Reads ready_flag == 1 ──► Reads STALE data_buffer[0] = 0! (CRASH!)
```

Look at the catastrophe:
* Core 1 sees `ready_flag == 1` in main memory and breaks out of its while-loop.
* Core 1 reads `data_buffer[0]`, but receives the **OLD un-initialized value ($0$)** because Store 1 was still sitting in Core 0's Write Buffer!
* Core 1 processes garbage data and crashes.

Store Merging and Write Buffering cause memory store operations to become visible to other CPU cores in an order **different from the program's written instruction sequence**!


## Solved Industrial Engineering Exercise: Quantitative Write Buffer Occupancy, Store Merging Efficiency, and RAW Forwarding Analysis

To consolidate your complete mastery of Write Buffer queue dynamics, store merging logic, Read-After-Write (RAW) forwarding, and memory fence stalls, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Bus Write Transaction Latencies

The memory bus requires $T_{\text{cmd}} = 16\text{ cycles}$ for command setup, plus $T_{\text{word}} = 2\text{ cycles}$ for every 8-byte word transferred.

##### 1. Latency for an Un-Merged Single 8-Byte Store ($T_{\text{unmerged}}$):
$$\text{Payload} = 8\text{ bytes} \implies 1\text{ word}$$

$$T_{\text{unmerged}} = T_{\text{cmd}} + (1 \times T_{\text{word}}) = 16 + 2 = \mathbf{18 \text{ CPU clock cycles}} \quad (5.625\text{ ns})$$

##### 2. Latency for a Merged 32-Byte Store Payload ($T_{\text{merged}}$):
$$\text{Payload} = 32\text{ bytes} \implies 4\text{ words}$$

$$T_{\text{merged}} = T_{\text{cmd}} + (4 \times T_{\text{word}}) = 16 + (4 \times 2) = 16 + 8 = \mathbf{24 \text{ CPU clock cycles}} \quad (7.500\text{ ns})$$

```text
BUS TRANSACTION LATENCY COMPARISON

 4 Un-Merged Stores : 4 x 18 Cycles = 72 Clock Cycles total! (75% Command Overhead!)
 1 Merged Store     : 1 x 24 Cycles = 24 Clock Cycles total! (66.7% Time Saved!)
```


#### Step 3: Analyze System B (Store Merging ENABLED)

In System B, Store Merging is enabled. Incoming stores targeting the same 64-byte block coalesce into existing slots.

##### Trace Queue Occupancy over 4 Stores:
* **Cycle 1 (`SD R1, 0(R10)`)**: Address `0x00010000`. Pushed to **Slot 0** ($V_0 = 1$).
  * Slot 0 Data = `0x...._...._...._R1`, Byte Mask = `64'h0000_0000_0000_00FF`.
* **Cycle 2 (`SD R2, 8(R10)`)**: Address `0x00010008`.
  * Merging Comparator checks block address: `0x10008 & ~63 == 0x10000 & ~63` (**MATCH IN SLOT 0!**).
  * Merged into **Slot 0**! Slot 0 Data = `0x...._...._R2_R1`, Byte Mask = `64'h0000_0000_0000_FFFF`.
  * **Slots 1, 2, and 3 REMAIN COMPLETELY EMPTY!**
* **Cycle 3 (`SD R3, 16(R10)`)**: Merged into **Slot 0**! Byte Mask = `64'h0000_0000_00FF_FFFF`.
* **Cycle 4 (`SD R4, 24(R10)`)**: Merged into **Slot 0**! Byte Mask = `64'h0000_0000_FFFF_FFFF`.

```text
SYSTEM B STORE MERGING QUEUE OCCUPANCY

 Cycle 1: Store 1 ──► Allocates Slot 0 (Block 0x10000)
 Cycle 2: Store 2 ──► Merged into Slot 0! (Slots 1..3 EMPTY!)
 Cycle 3: Store 3 ──► Merged into Slot 0! (Slots 1..3 EMPTY!)
 Cycle 4: Store 4 ──► Merged into Slot 0! (Slots 1..3 EMPTY!)
 (ONLY 1 Slot Occupied! ZERO Write Buffer Overflow Stalls!)
```

##### Calculate System B Effective CPI:
* All 4 stores coalesced into 1 slot holding a 32-byte payload.
* Total bus transaction time for 1 merged slot = $T_{\text{merged}} = 24\text{ clock cycles}$.
* Each iteration executes 8 instructions ($8\text{ clock cycles}$ execution time).
* The background bus drains Slot 0 in $24\text{ cycles}$. Since the CPU executes 8 instructions ($8\text{ cycles}$) per iteration, the Write Buffer drains smoothly in the background without overflowing!

$$\text{Stall Cycles (System B)} = \mathbf{0 \text{ clock cycles!}}$$

$$\text{CPI}_{\text{effective,B}} = \mathbf{1.00 \text{ cycles/instruction}}$$


#### Step 5: Calculate Overall Performance Speedup Factor

Let us calculate the total execution time for 1,000 iterations ($8,000\text{ instructions}$) at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

##### System A Execution Time ($T_{\text{exec,A}}$):
$$N_{\text{cycles,A}} = 8,000 \text{ inst} \times 9.50 \text{ cycles/inst} = 76,000\text{ clock cycles}$$

$$T_{\text{exec,A}} = 76,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{23.75 \text{ microseconds}} \quad (23,750\text{ ns})$$

##### System B Execution Time ($T_{\text{exec,B}}$):
$$N_{\text{cycles,B}} = 8,000 \text{ inst} \times 1.00 \text{ cycles/inst} = 8,000\text{ clock cycles}$$

$$T_{\text{exec,B}} = 8,000 \times 0.3125 \times 10^{-9}\text{ s} = \mathbf{2.50 \text{ microseconds}} \quad (2,500\text{ ns})$$

##### Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{exec,A}}}{T_{\text{exec,B}}} = \frac{23.75\text{ }\mu\text{s}}{2.50\text{ }\mu\text{s}} = \frac{76,000\text{ cycles}}{8,000\text{ cycles}} \approx \mathbf{9.50\times \text{ Performance Advantage!}}$$

```text
STORE MERGING PERFORMANCE OPTIMIZATION SUMMARY

 Subsystem Metric          │ System A (Un-Merged WBB) │ System B (Store-Merging WBB) │ Improvement
───────────────────────────┼──────────────────────────┼──────────────────────────────┼────────────────
 WBB Queue Occupancy (4 SD)│ 4 Slots (100% Full)      │ 1 Slot (25% Occupied)        │ 75% Space Saved!
 Bus Transactions per Loop │ 4 Bus Transactions       │ 1 Bus Transaction            │ 75% Less Traffic
 Effective Execution CPI   │ 9.50 Cycles / Inst       │ 1.00 Cycles / Inst           │ 89.5% Reduction
 Total Execution Time      │ 23.75 Microseconds       │ 2.50 Microseconds            │ 9.5x FASTER!
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Write Buffer Queue**: A First-In, First-Out (FIFO) hardware queue buffer placed between the L1 Data Cache and the lower memory interconnect that captures store target addresses, data payloads, and byte masks in $1\text{ clock cycle}$, decoupling CPU execution from off-chip memory write latencies.
* **Store Merging (Write Combining)**: A hardware optimization mechanism built into write buffer queues that coalesces multiple store operations targeting adjacent addresses within the same 64-byte cache line block into a single queue slot, updating its data payload and byte-enable mask to maximize bus burst bandwidth and prevent queue overflow stalls.
