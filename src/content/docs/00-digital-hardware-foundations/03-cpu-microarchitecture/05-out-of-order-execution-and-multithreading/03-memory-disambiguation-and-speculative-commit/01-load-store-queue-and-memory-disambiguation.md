---
title: "Load-Store Queue Architecture, Memory Disambiguation, and Store-to-Load Forwarding"
---

# Load-Store Queue Architecture, Memory Disambiguation, and Store-to-Load Forwarding

## The Memory Aliasing Dilemma in Out-of-Order Execution

In an out-of-order superscalar processor core, the execution engine achieves high instruction throughput by decoupling instruction dispatch from instruction execution. Using physical register renaming and reservation stations, the processor's scheduler identifies mathematically independent instructions and dispatches them to parallel execution units out of program order as soon as their source operands become available.

For register-based arithmetic operations, identifying whether two instructions are independent is straightforward: the processor's front-end decodes the 5-bit register specifiers ($rs1, rs2, rd$) directly from the instruction words during the Instruction Decode stage, and uses the Register Alias Table (RAT) to eliminate false dependencies.

However, when an out-of-order engine attempts to execute **Memory Load (`LW`)** and **Memory Store (`SW`)** instructions out of program order, it encounters a fundamental physical barrier: **The Memory Aliasing Dilemma**.

Unlike register names—which are explicitly hardcoded into instruction bitfields—memory addresses are **NOT** known during instruction decoding! Memory addresses are calculated dynamically during the Execute (EX) stage by an Address Generation Unit (AGU) that adds a base register value to a sign-extended offset ($\text{Address} = \text{Reg}[rs1] + \text{Imm32}$).

Now, trace what happens when an out-of-order execution engine processes two in-flight memory instructions:

* **Instruction 1**: `SW x1, 0(x2)` (Stores register $x1$ to memory address $A_{\text{store}} = x2 + 0$)
* **Instruction 2**: `LW x3, 0(x4)` (Loads register $x3$ from memory address $A_{\text{load}} = x4 + 0$)

```text
THE MEMORY ALIASING UNCERTAINTY IN OUT-OF-ORDER ENGINES

 Inst 1: SW x1, 0(x2) ──► AGU Calculates Address A_store = x2 + 0  (Pending!)
 Inst 2: LW x3, 0(x4) ──► AGU Calculates Address A_load  = x4 + 0  (Pending!)
                          │
                          ▼
           ARE A_store AND A_load THE EXACT SAME ADDRESS?!
           (During Decode, x2 and x4 are unknown! Hardware cannot tell!)
```

Look at the physical uncertainty facing the out-of-order scheduler:

Registers $x2$ and $x4$ are currently being calculated by older instructions in the pipeline. During the Decode and Issue stages, their numerical values are unknown.

Therefore, the processor **does NOT know** whether Address $A_{\text{store}}$ (`0(x2)`) and Address $A_{\text{load}}$ (`0(x4)`) point to the **same physical memory location** or **different physical memory locations**!

This condition—where two memory instructions might target the exact same physical memory address—is called **Memory Aliasing**.

Consider the two possible physical outcomes once $x2$ and $x4$ are eventually calculated in the EX stage:

### Outcome A: Independent Addresses ($A_{\text{store}} = \text{0x1000}$, $A_{\text{load}} = \text{0x2000}$)
The Store instruction writes to address `0x1000`. The Load instruction reads from address `0x2000`. 
* *Result*: The two instructions are completely independent! The processor could safely execute `LW` out-of-order ahead of `SW` to save clock cycles!

### Outcome B: Aliased Addresses ($A_{\text{store}} = \text{0x1000}$, $A_{\text{load}} = \text{0x1000}$)
The Store instruction writes value $x1$ to address `0x1000`. The Load instruction reads address `0x1000`.
* *Result*: There is a **True Read-After-Write (RAW) Memory Dependency!** `LW` MUST read the fresh value written by `SW`.
* *The Out-of-Order Disaster*: If the CPU executes `LW` out-of-order ahead of `SW`, `LW` reads the **old, stale data from the L1 Data Cache** before `SW` has a chance to write the fresh value! The loaded data is corrupted!

```text
STALE DATA READ FROM BLIND OUT-OF-ORDER MEMORY EXECUTION

 Order in Program: Inst 1 (SW to 0x1000) ──► Inst 2 (LW from 0x1000)

 Blind Out-of-Order Execution:
   1. Inst 2 (LW)  executes EARLY ──► Reads OLD STALE DATA from L1 Cache!
   2. Inst 1 (SW)  executes LATE  ──► Writes NEW FRESH DATA to 0x1000!
   (Inst 2 received corrupted data! Software state destroyed!)
```

Look at the microarchitectural dilemma:
* If the CPU stalls every `LW` behind every older `SW` until all memory addresses are fully calculated, out-of-order memory performance degrades by $60\%$.
* If the CPU executes `LW` out-of-order blindly, memory state gets corrupted!

To resolve this memory execution crisis, modern out-of-order microarchitectures use **Load-Store Queues (LSQ)**, **Memory Disambiguation**, **Store-to-Load Forwarding**, and **Store Sets Prediction**.


### Method 1: Walking to the Central Vault (No Forwarding / Memory Stall)

Bob walks down to the basement Central Document Vault (Data Cache) at 10:05 AM to open P.O. Box #42.

Look at the disaster:
* Because Alice's envelope is still sitting in her desk's Outgoing Mail Tray, the Central Document Vault in the basement holds the **old account balance from yesterday ($\$0$)**!
* Bob reads $\$0$, writes an incorrect financial report, and the company goes bankrupt!
* Or, Bob is forced to sit in the basement doing nothing until 5:00 PM when the courier finally files Alice's envelope into the vault!

Bob lost seven hours sitting idle. This is a **Memory Dependency Stall**.


## Anatomy and Dual-Buffer Architecture of the Load-Store Queue (LSQ)

To master out-of-order memory execution, we must examine the formal hardware architecture of a **Load-Store Queue (LSQ)**.

A Load-Store Queue is a specialized, dual-buffer hardware memory structure that tracks all in-flight memory operations between instruction dispatch and instruction retirement.

The LSQ is divided into two cooperating circular FIFO buffers:
1. **The Store Queue (SQ)**: Buffers all in-flight `SW` instructions in strict program order.
2. **The Load Queue (LQ)**: Buffers all in-flight `LW` instructions in strict program order.

```text
LOAD-STORE QUEUE (LSQ) DUAL-BUFFER TOPOLOGY

 Dispatch Unit (In-Order Dispatch)
 ┌───────────────────────────┬───────────────────────────┐
 │ Load Queue (LQ)           │ Store Queue (SQ)          │
 │ [ Entry 0: LW x1, 0(x2) ] │ [ Entry 0: SW x5, 0(x6) ] │
 │ [ Entry 1: LW x3, 4(x2) ] │ [ Entry 1: SW x7, 8(x2) ] │
 └─────────────┬─────────────┴─────────────┬─────────────┘
               │                           │
               ▼                           ▼
        [ Address AGU 0 ]           [ Address AGU 1 ]
               │                           │
               └─────────────┬─────────────┘
                             │ (Address Disambiguation & Match)
                             ▼
               [ Store-to-Load Forwarding MUX ]
                             │
                             ├───────────────────────────┐
                             ▼                           ▼
                   [ L1 Data Cache ]          [ Destination Register ]
```


## Memory Disambiguation and Associative Address Lookup

Now let us examine how the processor performs **Memory Disambiguation** when a Load instruction calculates its target address in the AGU.

When a Load instruction sitting in the Load Queue calculates its memory address $A_{\text{load}}$ in the AGU during Stage 3 (EX):

The Load instruction **must verify that no older Store instruction sitting in the Store Queue is writing to the same address!**

The Load Queue controller initiates an **Associative Address Lookup** across all older entries in the Store Queue simultaneously:

```text
STORE QUEUE ASSOCIATIVE ADDRESS LOOKUP

 Load Address A_load = 0x0000_1000
           │
           ├───────────────────────────┬───────────────────────────┐
           ▼                           ▼                           ▼
 [ SQ Entry 0 (Older) ]      [ SQ Entry 1 (Older) ]      [ SQ Entry 2 (Younger) ]
 Addr = 0x0000_2000          Addr = 0x0000_1000          Addr = 0x0000_1000
 V_addr = 1                  V_addr = 1                  Ignored (Younger!)
           │                           │
           ▼                           ▼
      MISMATCH!                 MATCH DETECTED!
   (Different Addr)           (Store-to-Load Forward!)
```


## Store-to-Load Forwarding and Partial Byte-Mask Coverage Checking

When Memory Disambiguation detects an address match ($A_{\text{load}} == A_{\text{store},k}$), how does the Store Queue forward data directly to the Load instruction?

Let us examine the two technical requirements for **Store-to-Load Forwarding**:
1. **Full Word Forwarding**: The Store and Load cover the exact same 32-bit byte alignment mask.
2. **Partial-Byte Coverage Verification**: The Store's byte-enable mask ($BE_{\text{store}}$) must cover ALL bytes requested by the Load ($BE_{\text{load}}$).


### Partial-Byte Mask Matching and Store Forwarding Hazards

What happens if a Load instruction requests a 32-bit word ($BE_{\text{load}} = \text{4'b1111}$), but the older Store in the Store Queue wrote only a **single 8-bit byte** (`SB`) to that address ($BE_{\text{store}} = \text{4'b0001}$)?

```text
PARTIAL-BYTE STORE FORWARDING HAZARD

 Store Queue Entry k (SB) : Addr = 0x1000, Data = [ XX | XX | XX | 0x42 ], BE = 4'b0001
                            (Holds fresh Byte 0, but Bytes 1,2,3 are UNKNOWN in SQ!)

 Load Instruction (LW)    : Addr = 0x1000, BE = 4'b1111 (Requests ALL 4 Bytes!)
```

Look at the physical hazard:
* Byte 0 of the requested word sits fresh inside the Store Queue (`0x42`).
* Bytes 1, 2, and 3 sit inside the L1 Data Cache!

If the hardware attempted to merge Byte 0 from the Store Queue with Bytes 1, 2, and 3 from the L1 Data Cache in the same clock cycle, it would require complex multi-byte merging multiplexers that slow down the memory stage clock frequency.

#### The Hardware Rule for Partial-Byte Store Forwarding:

To enforce safety, the Store-to-Load Forwarding Unit evaluates the **Byte Mask Coverage Condition**:

$$
\text{Mask\_Covered} = (BE_{\text{load}} \,\, \text{AND} \,\, BE_{\text{store},k}) == BE_{\text{load}}
$$

Where:
* $BE_{\text{load}}$ is the 4-bit byte enable mask requested by the Load.
* $BE_{\text{store},k}$ is the 4-bit byte enable mask stored in SQ entry $k$.

```text
BYTE MASK COVERAGE EVALUATION TRACE

 Case 1: Store Word (4'b1111) vs Load Word (4'b1111)
   (4'b1111 AND 4'b1111) == 4'b1111 ──► COVERED! Forward Data Immediately!

 Case 2: Store Byte (4'b0001) vs Load Word (4'b1111)
   (4'b1111 AND 4'b0001) == 4'b0001 != 4'b1111 ──► NOT COVERED!
   ACTION: STALL LOAD IN QUEUE! Wait for Store to Commit to L1 Cache!
```

If $BE_{\text{load}}$ is NOT fully covered by $BE_{\text{store},k}$:
1. Forwarding is **DISABLED** ($\text{fwd\_hit} = 0$).
2. The Load instruction is **STALLED** in the Load Queue.
3. The Load waits until the Store instruction commits to the L1 Data Cache, and then reads all 4 bytes cleanly from the L1 Cache!


### The Store Sets Predictor (Preventing Repetitive Memory Violations)

If a specific Load instruction $L_1$ repeatedly collides with an older Store $S_1$, speculatively executing $L_1$ ahead of $S_1$ over and over causes endless pipeline flushes, ruining performance.

To prevent repetitive memory order violations, microarchitects use a dynamic predictor called **Store Sets**.

```text
STORE SETS PREDICTOR TOPOLOGY

 Instruction Address PC_load / PC_store
 ┌────────────────────────────────────────────────────────┐
 │ SSIT (Store Set ID Table)                              │
 │  * Maps Instruction PC -> Store Set ID (SSID)          │
 └─────────────────────────┬──────────────────────────────┘
                           │
                           ▼
 ┌────────────────────────────────────────────────────────┐
 │ LFST (Last Fetched Store Table)                        │
 │  * Maps SSID -> Store Queue Index of last in-flight    │
 │    Store belonging to this set                         │
 └────────────────────────────────────────────────────────┘
```

1. **Learning Phase**:
   When $L_1$ and $S_1$ trigger a memory order violation flush, the Store Sets predictor assigns both instructions to the same **Store Set ID ($\text{SSID}$)** in the Store Set ID Table (SSIT).
2. **Execution Phase**:
   * When $S_1$ is fetched, the SSIT reads its $\text{SSID}$ and records $S_1$'s Store Queue index in the Last Fetched Store Table (LFST).
   * When $L_1$ is fetched, the SSIT reads the same $\text{SSID}$. $L_1$ checks the LFST, finds $S_1$'s in-flight Store Queue index, and **enforces a strict dependency stall!**
   * $L_1$ waits until $S_1$ calculates its address. Zero memory order violations occur!


### Scenario and Parameters

You are an ASIC microarchitect designing the **Load-Store Queue Subsystem** (`LoadStoreQueueUnit`) for a 32-bit out-of-order superscalar core.

```text
LOAD-STORE QUEUE SUBSYSTEM INTERFACE

 Load AGU Interface  (load_valid, load_addr[31:0], load_be[3:0])   ──┐
 Store AGU Interface (store_valid, store_addr[31:0], store_data)   ──┼──► [ LSQ Unit ] ──┬──► fwd_hit, fwd_data
 Store Commit Signal (store_commit_en)                             ──┘                  ├──► fwd_stall_req
                                                                                        └──► dcache_read_en
```

The subsystem manages a 4-entry Store Queue (SQ0, SQ1, SQ2, SQ3) and interfaces between the AGUs, L1 Data Cache, and Register File.

#### Physical Library Gate Delays (28nm CMOS Technology):
* 4-Entry SQ Address Associative Comparator Delay: $t_{\text{comp}} = 0.14\text{ ns}$
* 4-Bit Byte Mask Coverage Logic Delay: $t_{\text{mask}} = 0.10\text{ ns}$
* Store Data Forwarding MUX Delay: $t_{\text{mux}} = 0.15\text{ ns}$
* L1 Data Cache Read Enable Gate Delay: $t_{\text{gate}} = 0.08\text{ ns}$
* Target Clock Period: $T_{\text{clk}} = 2.00\text{ ns}$ ($500\text{ MHz}$).

#### Your Objective

1. Derive the complete Boolean logic equations for SQ address matching, byte-mask coverage checking, `fwd_hit`, `fwd_stall_req`, and `dcache_read_en`.
2. Write the complete, synthesizable SystemVerilog module `LoadStoreQueueUnit`.
3. Calculate the critical path propagation delay ($t_{\text{lsq\_path}}$) through the Store Queue forwarding path and evaluate setup timing slack ($T_{\text{slack}}$).
4. Simulate and trace signal values across a 4-instruction out-of-order memory execution sequence:
   * **Cycle 1**: `SW x10, 0(x2)` allocated in SQ0 ($A_{\text{store}} = \text{32'h0000\_1000}$, $D_{\text{store}} = \text{32'hA5A5\_5A5A}$, $BE = \text{4'b1111}$).
   * **Cycle 2**: `LW x11, 0(x2)` calculates address $A_{\text{load}} = \text{32'h0000\_1000}$ ($BE = \text{4'b1111}$).
     * **Store-to-Load Forwarding Fired!** (`fwd_hit = 1`, `fwd_data = 32'hA5A5_5A5A`, `dcache_read_en = 0`).
   * **Cycle 3**: `SB x12, 0(x3)` allocated in SQ1 ($A_{\text{store}} = \text{32'h0000\_2000}$, $D_{\text{store}} = \text{32'h0000\_00FF}$, $BE = \text{4'b0001}$).
   * **Cycle 4**: `LW x13, 0(x3)` calculates address $A_{\text{load}} = \text{32'h0000\_2000}$ ($BE = \text{4'b1111}$).
     * **Partial Mask Hazard Detected!** (`fwd_hit = 0`, `fwd_stall_req = 1`, `dcache_read_en = 0`). Load stalled until SQ1 commits!
5. Verify structural, mathematical, and timing correctness.


#### Step 2: Calculate Critical Path Delay and Timing Slack

Let us trace the physical critical path through the Store Queue forwarding logic during a Load AGU calculation:

1. Address Generation Unit computes $A_{\text{load}}$.
2. SQ Associative Address Comparators evaluate $A_{\text{store},k} == A_{\text{load}}$: $t_{\text{comp}} = 0.14\text{ ns}$.
3. Byte Mask Coverage Logic evaluates $BE_{\text{load}} \subseteq BE_{\text{store},k}$: $t_{\text{mask}} = 0.10\text{ ns}$.
4. Forwarding MUX routes $D_{\text{store},k}$ to load output: $t_{\text{mux}} = 0.15\text{ ns}$.
5. Destination Register Setup Time: $t_{\text{su}} = 0.15\text{ ns}$.

$$
t_{\text{lsq\_path}} = t_{\text{comp}} + t_{\text{mask}} + t_{\text{mux}} + t_{\text{su}}
$$

$$
t_{\text{lsq\_path}} = 0.14\text{ ns} + 0.10\text{ ns} + 0.15\text{ ns} + 0.15\text{ ns} = \mathbf{0.540 \text{ ns}}
$$

##### Setup Timing Slack ($T_{\text{slack}}$) at $T_{\text{clk}} = 2.00\text{ ns}$ ($500\text{ MHz}$):

$$
T_{\text{slack}} = T_{\text{clk}} - t_{\text{lsq\_path}} = 2.000\text{ ns} - 0.540\text{ ns} = \mathbf{+1.460 \text{ ns} \quad (POSITIVE SLACK!)}
$$

The Store-to-Load Forwarding unit completes in **$0.540\text{ nanoseconds}$**, closing timing at $500\text{ MHz}$ with $+1.460\text{ ns}$ of positive slack!


#### Step 4: Simulate 4-Cycle Execution Sequence Trace

Let us trace `LoadStoreQueueUnit` across four execution cycles:

```text
LOAD-STORE QUEUE SIMULATION TRACE

 Clock Cycle │ Load/Store Operation │ Address & Data        │ fwd_hit │ fwd_stall_req │ dcache_read_en │ Action / Status
─────────────┼──────────────────────┼───────────────────────┼─────────┼───────────────┼────────────────┼───────────────────────────────
   Cycle 1   │ Store SW allocated   │ SQ0 <= Addr 0x1000    │    0    │       0       │       0        │ SQ0 populated with 0xA5A55A5A
             │                      │ Data = 0xA5A55A5A     │         │               │                │ BE = 4'b1111 (Full Word)
─────────────┼──────────────────────┼───────────────────────┼─────────┼───────────────┼────────────────┼───────────────────────────────
   Cycle 2   │ Load LW executed     │ load_addr = 0x1000    │    1    │       0       │       0        │ STORE-TO-LOAD FORWARDING!
             │                      │ load_be   = 4'b1111   │ (HIT!)  │               │ (Cache Bypassed)│ load_data_out = 0xA5A55A5A
─────────────┼──────────────────────┼───────────────────────┼─────────┼───────────────┼────────────────┼───────────────────────────────
   Cycle 3   │ Store SB allocated   │ SQ1 <= Addr 0x2000    │    0    │       0       │       0        │ SQ1 populated with 0x000000FF
             │                      │ Data = 0x000000FF     │         │               │                │ BE = 4'b0001 (1 Byte)
─────────────┼──────────────────────┼───────────────────────┼─────────┼───────────────┼────────────────┼───────────────────────────────
   Cycle 4   │ Load LW executed     │ load_addr = 0x2000    │    0    │       1       │       0        │ PARTIAL MASK HAZARD!
             │                      │ load_be   = 4'b1111   │ (MISS)  │ (STALL REQ!)  │ (Cache Paused) │ Load Stalled until SQ1 Commits!
```

```text
STORE-TO-LOAD FORWARDING SIGNAL WAVEFORMS

 clk            : 00001111000011110000111100001111
                  ▲           ▲           ▲           ▲
                  │ Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4
                  │           │           │           │
 load_addr      : [ 0x0000 ]──[ 0x1000 ]──[ 0x0000 ]──[ 0x2000 ]===
 load_be        : [ 4'h0   ]──[ 4'b1111]──[ 4'h0   ]──[ 4'b1111]===
 fwd_hit        : 0000000000001111111100000000000000000000
                               ▲
                               └── Store-to-Load Forwarding HIT on Cycle 2!
 fwd_stall_req  : 000000000000000000000000000011111111
                                              ▲
                                              └── Partial Mask Stall Requested on Cycle 4!
 load_data_out  : [ 0x0000 ]──[ 0xA5A55A5A ]──[ 0x0000 ]===
```

##### Detailed Cycle Analysis:
1. **Cycle 1**: `SW` allocated in SQ0 with Address `0x1000`, Data `32'hA5A5_5A5A`, $BE = \text{4'b1111}$.
2. **Cycle 2**: `LW` executes at Address `0x1000` ($BE = \text{4'b1111}$).
   * Address comparator matches SQ0 (`0x1000 == 0x1000`).
   * Byte-mask check evaluates $\text{4'b1111} \subseteq \text{4'b1111}$ (**COVERED!**).
   * `fwd_hit = 1`, `dcache_read_en = 0`. `load_data_out` receives `32'hA5A5_5A5A` in **1 single clock cycle**, bypassing the L1 Cache!
3. **Cycle 3**: `SB` allocated in SQ1 with Address `0x2000`, Data `32'h0000_00FF`, $BE = \text{4'b0001}$.
4. **Cycle 4**: `LW` executes at Address `0x2000` ($BE = \text{4'b1111}$).
   * Address comparator matches SQ1 (`0x2000 == 0x2000`).
   * Byte-mask check evaluates $\text{4'b1111} \subseteq \text{4'b0001}$ (**NOT COVERED!**).
   * `fwd_hit = 0`, `fwd_stall_req = 1`, `dcache_read_en = 0`.
   * **The Load is safely stalled** until SQ1 commits to L1 Cache, preventing partial-byte data corruption!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Load-Store Queue (LSQ)**: A dual-buffer hardware structure (Load Queue + Store Queue) that tracks in-flight memory operations between instruction dispatch and retirement, enforcing memory order rules and preventing address aliasing corruptions.
* **Memory Disambiguation**: The microarchitectural address comparison process that determines whether an in-flight Load instruction targets the same physical memory location as older, un-committed Store instructions in the Store Queue.
* **Store-to-Load Forwarding**: A zero-latency memory bypass mechanism where a Load instruction matching an older in-flight Store address extracts fresh data directly from the Store Queue entry, bypassing the L1 Data Cache completely.
* **Store Sets Prediction**: A dynamic memory dependency prediction algorithm that assigns matching Store Set IDs ($\text{SSID}$) to correlated store-load pairs, preventing speculative memory order violations and pipeline flushes.