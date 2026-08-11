---
title: "Register Alias Table Architecture, Physical Register File Allocation, and R10k vs. P6 Renaming Schemes"
---

# Register Alias Table Architecture, Physical Register File Allocation, and R10k vs. P6 Renaming Schemes

## The Multi-Issue Renaming Bottleneck and Physical Storage Allocation

In an out-of-order superscalar processor core designed to fetch, decode, rename, and issue four instructions simultaneously on every tick of a $2.5\text{-GHz}$ clock ($0.4\text{-nanosecond}$ clock period), the processor's front-end faces an intense memory access challenge.

Each 32-bit macro-instruction can specify up to two source registers ($rs1, rs2$) and one destination register ($rd$). In a 4-issue Instruction Decode and Register Renaming stage, the processor must process **eight source register lookups** and **four destination register allocations** simultaneously within less than 400 picoseconds.

```text
4-ISSUE RENAMING WORKLOAD ON A SINGLE CLOCK CYCLE

 4 Incoming Instructions : [ Inst 0 ]  [ Inst 1 ]  [ Inst 2 ]  [ Inst 3 ]
                           │           │           │           │
                           ▼           ▼           ▼           ▼
 Source Register Lookups : 8 Source Register Address Reads (rs1_0..3, rs2_0..3)
 Destination Allocations : 4 Fresh Physical Register Allocations (rd_0..3)
 (12 Multi-Port Memory Accesses in less than 0.4 Nanoseconds!)
```

Look at the physical hardware requirements facing the renaming stage during those 400 picoseconds:

1. **Multi-Port Map Reading**: The hardware must read the current physical register mappings for eight source registers ($rs1_0, rs2_0, rs1_1, rs2_1, rs1_2, rs2_2, rs1_3, rs2_3$) from a central lookup table.
2. **Multi-Port Physical Allocation**: The hardware must pop four fresh, unallocated physical register tags ($p_{\text{new0}}, p_{\text{new1}}, p_{\text{new2}}, p_{\text{new3}}$) from a pool of free physical registers.
3. **Intra-Cycle Dependency Resolution**: If Instruction 1 in Slot 1 reads a register written by Instruction 0 in Slot 0 *within the exact same clock cycle*, the hardware must detect this dependency and bypass Instruction 0's newly allocated physical register tag directly to Instruction 1 before the table update completes!
4. **Map Table Updating**: The hardware must update the central lookup table with the four new physical register mappings.

If the lookup table is too slow, or if the free-register allocator allocates the same physical register to two different instructions, physical storage gets corrupted, and the out-of-order execution engine crashes.

Furthermore, software compilers reuse a very small set of architectural register names (such as the 32 registers $x0 \dots x31$ defined by the RISC-V ISA or the 16 registers in x86-64). This artificial name scarcity creates false data dependencies—Write-After-Read (WAR) anti-dependencies and Write-After-Write (WAW) output dependencies. 

If a later instruction (`MUL x1, x6, x7`) attempts to write to register $x1$ while an earlier, independent instruction (`SUB x4, x1, x5`) is still reading register $x1$, an in-order CPU is forced to stall the multiplier. There is no real mathematical data flow between the subtraction and the multiplication; the two instructions are operating on completely different variables, but they are forced to wait for each other solely because the compiler ran out of register names.

To execute this high-speed, multi-port translation in zero extra clock latency, eliminate false WAR and WAW dependencies, and decouple software register names from physical silicon storage, digital microarchitecture uses two foundational hardware structures: **The Register Alias Table (RAT)** and **The Free List Manager**.


### Step 1: Passenger 1 (Instruction 0) Updates Account $x1$
* Passenger 1 arrives to check a bag for Account $x1$.
* The key dispenser (**Free List**) pops key **$p32$**. Passenger 1 places her bag in Locker $p32$.
* The directory screen (**RAT**) updates its display: $\mathbf{\text{Account } x1 \longrightarrow \text{Locker } p32}$.


### Step 3: Passenger 3 (Instruction 2) Updates Account $x1$ Again!
* Passenger 3 arrives with a new bag for Account $x1$.
* Does Passenger 3 wait for Passenger 2 to finish with Locker $p32$? **NO!**
* The key dispenser (**Free List**) pops a **fresh empty key $p33$**!
* Passenger 3 places his bag in Locker $p33$ immediately.
* The directory screen (**RAT**) updates its display for future customers: $\mathbf{\text{Account } x1 \longrightarrow \text{Locker } p33}$.


## Register Alias Table (RAT) Architecture and Multi-Port Lookups

The Register Alias Table (RAT) is a small, ultra-fast SRAM memory array located inside the CPU's Instruction Decode and Renaming stage.

Its primary function is to translate $N_{\text{arch}}$ software-visible architectural register specifiers into $N_{\text{phys}}$ physical hardware register tags in real time.

```text
REGISTER ALIAS TABLE (RAT) INTERNAL ARRAY STRUCTURE

 Architectural Address (5 Bits) │ Physical Register Tag Stored (7 Bits)
────────────────────────────────┼───────────────────────────────────────
   0x00 (x0 - Hardwired)        │ 7'b0000000 (p0 - Permanently Fixed!)
   0x01 (x1)                    │ 7'b0100000 (p32 - Current x1 Mapping)
   0x02 (x2)                    │ 7'b0000010 (p2  - Current x2 Mapping)
     :                          │     :
   0x04 (x4)                    │ 7'b0100001 (p33 - Current x4 Mapping)
     :                          │     :
   0x1F (x31)                   │ 7'b0011111 (p31 - Current x31 Mapping)
```


### Multi-Port SRAM Read/Write Scaling

In a $K$-issue superscalar processor core (e.g., $K = 2$ dual-issue or $K = 4$ quad-issue), the RAT SRAM array must support multiple concurrent reads and writes within a single clock cycle:

```text
4-ISSUE RAT MULTI-PORT REQUIREMENT

 Read Ports Needed  : 8 Asynchronous Read Ports (2 source specifiers x 4 instructions)
 Write Ports Needed : 4 Synchronous Write Ports (1 dest specifier x 4 instructions)
 Total Memory Ports : 12 Concurrent Ports on a 224-Bit SRAM Array!
```

#### The Quadratic Port Scaling Law:
In silicon memory design, the physical surface area $A_{\text{cell}}$ of an SRAM cell scales quadratically with the total number of read ports $R$ and write ports $W$:

$$
A_{\text{cell}} \propto (R + W)^2
$$

Where:
* $A_{\text{cell}}$ is the physical layout area of a single SRAM cell.
* $R$ is the number of independent read ports.
* $W$ is the number of independent write ports.

For a 4-issue superscalar RAT requiring 8 read ports and 4 write ports ($R + W = 12$):

$$\text{Area Factor} \propto 12^2 = \mathbf{144 \times \text{ single-port cell area}}$$

To prevent this 144x area explosion, high-issue processors (6-issue or 8-issue) use **Multi-Bank Clustered RATs**, where two smaller, duplicated RAT arrays operate in parallel!


## Free List Manager Architectures and Allocation/Reclamation Lifecycle

The **Free List Manager** is the companion control module that tracks which physical registers on the silicon die are currently free (un-assigned) and which are busy (holding data).

```text
FREE LIST MANAGER FIFO QUEUE

 Head Pointer (Pop Port)                         Tail Pointer (Push Port)
        │                                                  │
        ▼                                                  ▼
   ┌────────┬────────┬────────┬────────┬────────┬──────────────────┐
   │  p32   │  p33   │  p34   │  p35   │  p36   │ ...   p63        │
   └────────┴────────┴────────┴────────┴────────┴──────────────────┘
   (Pops fresh registers for Rename)  (Reclaims retired registers from ROB)
```


#### Architecture B: Bit-Vector (Bitmask) Free List
* **Structure**: A 64-bit or 128-bit register where each bit $k$ represents physical register $p_k$:
  * Bit $k = 1 \implies$ Physical register $p_k$ is **FREE**.
  * Bit $k = 0 \implies$ Physical register $p_k$ is **BUSY (Allocated)**.
* **Allocation**: A 128-bit priority encoder finds the first $K$ bits that are $1$, allocates those physical register numbers, and flips their bits to $0$.
* **Reclamation**: When an instruction commits, a 1-hot decoder flips the bit position corresponding to $p_{\text{old}}$ back to $1$.

```text
FREE LIST ARCHITECTURE COMPARISON

 Feature                │ FIFO Queue Free List         │ Bit-Vector (Bitmask) Free List
────────────────────────┼──────────────────────────────┼────────────────────────────────
 Storage Mechanism      │ Array of 6-bit Tags          │ 128-bit Register Bitmask
 Allocation Logic       │ Simple Pointer Increment     │ Priority Encoder
 Reclamation Logic      │ Push to Tail Pointer         │ Bitwise OR (1-Hot Decoder)
 Multi-Issue Scaling    │ Easy (Multi-head Pop)        │ Hard (Multi-bit Priority Enc)
```


### Paradigm 1: MIPS R10k / Alpha 21264 Style (Unified Physical Register File - PRF)

In the MIPS R10k, Alpha 21264, MIPS R12000, and modern ARM Cortex-X / Apple M-series cores, the CPU instantiates a **single, unified Physical Register File (PRF)** containing $N_{\text{phys}}$ entries (e.g., 128 or 180 physical registers $p0 \dots p179$).

#### How Data Flows in R10k:
1. **No Data in ROB**: The Reorder Buffer holds *only* instruction tags, status flags, and destination register specifiers. **The ROB contains zero data payload bits!**
2. **All Values in PRF**: All calculation results—whether committed or speculative—are written directly into assigned physical registers $p_k$ inside the PRF by execution units broadcasting over the Common Data Bus (CDB).
3. **Renaming Map**: The Register Alias Table (RAT) maps architectural registers directly to physical registers:

$$x_i \longrightarrow p_k$$

4. **Retirement Action (Zero Data Movement!)**:
   When an instruction retires at the head of the ROB:
   * The CPU does **NOT** copy any data! The calculation result is *already* sitting in physical register $p_{\text{new}}$.
   * The CPU simply marks $p_{\text{new}}$ as officially committed, and pushes the *previous* physical register $p_{\text{old}}$ (which held $x_i$'s previous value) back onto the Free List FIFO!

```text
MIPS R10k RETIREMENT DATAFLOW (ZERO DATA MOVEMENT)

 Instruction ADD p32, p2, p3 Commits in ROB:
 1. Result (42) is ALREADY sitting in Physical Register p32 inside the PRF.
 2. ROB frees old physical register p1 -> Pushes p1 to Free List.
 3. ZERO BITS OF DATA ARE MOVED ON RETIREMENT!
```

#### Advantages of the R10k Unified PRF:
* **Zero Data Movement at Retirement**: Retiring an instruction requires zero clock cycles of data copying. Only 6-bit register tags are returned to the Free List.
* **Energy Efficient Retirement**: Eliminates high-power 32-bit or 64-bit bus writes during instruction commitment.
* **Simpler Execution Ports**: Execution units write to a single memory structure (the PRF).


## Speculative Checkpointing, Rollback, and $x0$ Zero Register Protections

In an out-of-order superscalar core, conditional branch instructions are fetched in Stage 1 (IF) and renamed in Stage 2 (ID), but their actual direction is evaluated multiple clock cycles later in Stage 4 (EX).

When a branch instruction is mispredicted in the EX stage, all speculative instructions fetched after the branch must be purged, and the Register Alias Table (RAT) must be restored to the exact mapping it held before the branch was renamed.


### Recovery Strategy B: Retirement RAT Walkback (Slow Recovery — Zero Checkpoint Registers)

In **Retirement RAT Walkback**:
* The CPU maintains two separate RAT tables:
  1. **Active RAT (Front-End RAT)**: Updated continuously in the Rename stage by all instructions (including speculative ones).
  2. **Retirement RAT (Committed RAT)**: Updated ONLY in the Writeback/Commit stage when instructions officially retire in the Reorder Buffer (ROB).

```text
RETIREMENT RAT WALKBACK RECOVERY

 Active RAT (Corrupted)     ◄── Copy Committed State ── Retirement RAT (100% Safe!)
 (Front-End Renaming)                                  (Updates ONLY on ROB Commit)
```

#### What Happens on a Branch Misprediction?
1. The active RAT copies the $100\%$ safe state from the **Retirement RAT**:
   $$\mathbf{RAT}_{\text{active}} \Leftarrow \mathbf{RAT}_{\text{retirement}}$$
2. The front-end walks forward through the remaining valid instructions in the Reorder Buffer, re-applying their non-speculative mappings one by one.
3. *Trade-off*: Takes $3 \text{ to } 8$ clock cycles to restore the RAT, but requires **zero checkpoint shadow registers**, saving significant silicon area!


## Physical PRF Floorplanning and Power Limits

In an out-of-order superscalar core, the Physical Register File (PRF) holds all 128 physical 32-bit registers.

Because the PRF must serve $2K$ read ports and $K$ write ports in a $K$-issue core, the PRF memory array itself becomes a major physical critical path bottleneck.

To keep PRF read access fast ($< 0.3\text{ ns}$):
* Modern cores place the PRF in the center of the execution block, surrounded symmetrically by the ALUs, Load/Store units, and Floating-Point units.
* Interconnect wires from the RAT to the PRF are routed using low-resistance upper metal layers (Copper Metal 7 and Metal 8) to minimize $RC$ wire propagation delay.


### Scenario and Parameters

You are an ASIC microarchitect designing the **Dual-Issue Register Alias Table and Free List Subsystem** (`DualIssueRenamingUnit`) for a 32-bit RISC-V 2-issue superscalar core.

```text
DUAL-ISSUE REGISTER RENAMING SUBSYSTEM INTERFACE

 Slot 0 Arch Regs (rs1_0, rs2_0, rd_0, alloc0) ──┐
 Slot 1 Arch Regs (rs1_1, rs2_1, rd_1, alloc1) ──┼──► [ DualIssueRenamingUnit ] ──┬──► phys_rs1_0, phys_rs2_0, phys_rd_0
 Commit Reclaim (commit_en, old_phys_rd)       ──┤                               ├──► phys_rs1_1, phys_rs2_1, phys_rd_1
 Master Clock clk, Reset reset_n               ──┘                               └──► free_list_empty
```

The subsystem manages:
* **32 Architectural Registers** ($x0 \dots x31$, 5-bit specifiers).
* **64 Physical Registers** ($p0 \dots p63$, 6-bit specifiers).
* **RAT Memory**: $32 \times 6 \text{ bits}$ SRAM array.
* **Free List FIFO**: A 32-entry queue initially holding physical registers $p32 \dots p63$.

#### Physical Library Gate Delays (28nm CMOS Technology):
* 4-Port RAT Read Delay: $t_{\text{rat\_read}} = 0.28\text{ ns}$
* Free List Dual-Pop Delay: $t_{\text{free\_pop}} = 0.22\text{ ns}$
* Intra-Cycle RAT Bypass MUX Delay: $t_{\text{bypass}} = 0.15\text{ ns}$
* $x0$ Zero Override MUX Delay: $t_{\text{mux\_x0}} = 0.10\text{ ns}$
* RAT SRAM Write Setup Time: $t_{\text{rat\_su}} = 0.15\text{ ns}$
* Target Clock Period: $T_{\text{clk}} = 2.50\text{ ns}$ ($f_{\text{max}} = 400\text{ MHz}$).

#### Your Objective

1. Calculate the critical path delay ($t_{\text{rename\_path}}$) for dual-issue renaming and evaluate setup timing slack ($T_{\text{slack}}$).
2. Derive the Boolean equations for intra-cycle RAT bypassing (Slot $0 \to$ Slot 1).
3. Write the complete, synthesizable SystemVerilog module `DualIssueRenamingUnit`.
4. Simulate and trace signal values across a 3-instruction dual-issue sequence:
   * **Cycle 1 Slot 0**: `ADD x1, x2, x3` ($alloc_0 = 1, rd_0 = x1$)
   * **Cycle 1 Slot 1**: `SUB x4, x1, x5` ($alloc_1 = 1, rd_1 = x4, rs1_1 = x1 \implies$ **Intra-Cycle RAW on $x1$!**)
   * **Cycle 2 Slot 0**: `MUL x1, x6, x7` ($alloc_0 = 1, rd_0 = x1 \implies$ **Re-maps $x1$ to fresh physical reg!**)
   * **Cycle 2 Slot 1**: `ADDI x0, x1, 5` ($alloc_1 = 0, rd_1 = x0 \implies$ **$x0$ Protection Active!**)
5. Trace RAT mappings, Free List pointers, and physical register specifiers across all cycles.
6. Compare data movement overheads between R10k PRF vs P6 ROB value copying for this sequence.
7. Verify structural, mathematical, and timing correctness.


#### Step 2: Derive Intra-Cycle RAT Bypass Equations

If Instruction 0 (Slot 0) writes to $rd_0$, and Instruction 1 (Slot 1) reads $rs1_1$ or $rs2_1$ on the exact same clock cycle:

$$\text{bypass\_match\_rs1} = \text{alloc\_en}_0 \quad \land \quad (rd_0 \neq 0) \quad \land \quad (rd_0 == rs1_1)$$

$$\text{bypass\_match\_rs2} = \text{alloc\_en}_0 \quad \land \quad (rd_0 \neq 0) \quad \land \quad (rd_0 == rs2_1)$$

$$\text{phys\_rs1\_1} = (\text{bypass\_match\_rs1}) \quad ? \quad p_{\text{new0}} \quad : \quad \mathbf{RAT}[rs1_1]$$

$$\text{phys\_rs2\_1} = (\text{bypass\_match\_rs2}) \quad ? \quad p_{\text{new0}} \quad : \quad \mathbf{RAT}[rs2_1]$$

Where:
* $p_{\text{new0}}$ is the fresh physical register tag popped from the Free List for Slot 0 ($rd_0$).
* $\mathbf{RAT}[rs1_1]$ is the standard value read from the RAT SRAM array.


#### Step 4: Simulate Dual-Issue Program Execution Sequence Trace

Let us trace `DualIssueRenamingUnit` processing our 4-instruction test sequence:

* **Cycle 1**:
  * Slot 0: `ADD x1, x2, x3` ($alloc_0 = 1, rd_0 = x1, rs1_0 = x2, rs2_0 = x3$)
  * Slot 1: `SUB x4, x1, x5` ($alloc_1 = 1, rd_1 = x4, rs1_1 = x1, rs2_1 = x5$)
  * **Intra-Pair RAW Hazard on $x1$ detected!** ($rd_0 == rs1_1 == x1$).

* **Cycle 2**:
  * Slot 0: `MUL x1, x6, x7` ($alloc_0 = 1, rd_0 = x1, rs1_0 = x6, rs2_0 = x7$)
  * Slot 1: `ADDI x0, x1, 5` ($alloc_1 = 0, rd_1 = x0, rs1_1 = x1, rs2_1 = x0$)
  * **$x0$ Zero Protection Active!**

```text
DUAL-ISSUE RENAMING SUBSYSTEM SIMULATION TRACE

 Cycle/Slot │ Instruction       │ Arch Sources (rs1, rs2) │ Arch Dest (rd) │ Phys Sources (phys_rs1,2) │ Phys Dest (phys_rd) │ Free List Pop │ RAT[x1] Map
────────────┼───────────────────┼─────────────────────────┼────────────────┼───────────────────────────┼─────────────────────┼───────────────┼─────────────
 Cyc 1 Slot0│ ADD x1, x2, x3    │ rs1=x2, rs2=x3          │ rd=x1          │ phys_rs1=p2, phys_rs2=p3  │ phys_rd=p32         │ Popped p32    │ RAT[x1]<=p32
 Cyc 1 Slot1│ SUB x4, x1, x5    │ rs1=x1 (INTRA-RAW!),x5  │ rd=x4          │ phys_rs1=p32 (BYPASS!),p5 │ phys_rd=p33         │ Popped p33    │ RAT[x4]<=p33
────────────┼───────────────────┼─────────────────────────┼────────────────┼───────────────────────────┼─────────────────────┼───────────────┼─────────────
 Cyc 2 Slot0│ MUL x1, x6, x7    │ rs1=x6, rs2=x7          │ rd=x1 (WAR!)   │ phys_rs1=p6, phys_rs2=p7  │ phys_rd=p34         │ Popped p34    │ RAT[x1]<=p34!
 Cyc 2 Slot1│ ADDI x0, x1, 5    │ rs1=x1 (INTRA-RAW!),x0  │ rd=x0 (x0 Prot)│ phys_rs1=p34 (BYPASS!),p0 │ phys_rd=p0          │ NO POP! (x0)  │ RAT[x0] = p0
```

```text
DUAL-ISSUE RAT BYPASS WAVEFORMS

 clk         : 00001111000011110000111100001111
               ▲           ▲
               │ Cycle 1   │ Cycle 2
               │           │
 phys_rd_0   : [ p32     ]─[ p34 (Re-mapped x1!) ]===
 phys_rs1_1  : [ p32     ]─[ p34 (Bypassed in 0.15ns!) ]===
               ▲           ▲
               │           └── Slot 1 receives p34 via Intra-Cycle Bypass!
               └────────────── Slot 1 receives p32 via Intra-Cycle Bypass!
 RAT[x1] Map : [ p1      ]─[ p32     ]─[ p34     ]===
```

##### Detailed Cycle Analysis:
1. **Cycle 1 Slot 0 (`ADD x1, x2, x3`)**:
   * Free List pops $p32$. `phys_rd_0 = p32`. RAT prepares to update $\mathbf{RAT}[x1] \Leftarrow p32$.
2. **Cycle 1 Slot 1 (`SUB x4, x1, x5`)**:
   * Reads $rs1_1 = x1$.
   * Intra-cycle bypass logic detects $rd_0 == rs1_1 == x1$.
   * **Bypasses `phys_rd_0` ($p32$) directly to `phys_rs1_1` in 0.15 nanoseconds!**
   * Free List pops $p33$. `phys_rd_1 = p33`.
3. **Cycle 2 Slot 0 (`MUL x1, x6, x7`)**:
   * Re-maps $x1$ to fresh physical register $p34$!
   * RAT prepares to update $\mathbf{RAT}[x1] \Leftarrow p34$.
4. **Cycle 2 Slot 1 (`ADDI x0, x1, 5`)**:
   * Reads $rs1_1 = x1$. Bypasses $p34$ directly to `phys_rs1_1`.
   * Destination $rd_1 = x0 \implies$ **$x0$ Protection Active!**
   * `phys_rd_1 = p0`. Free List pointer does **NOT** advance! $p0$ remained hardwired to ground ($0\text{ V}$).


### Sanity Check and Verification

Let us verify our Dual-Issue Renaming Subsystem against all physical and microarchitectural safety rules:

1. **Intra-Cycle RAT Bypassing Verification**:
   * Slot 1 (`SUB x4, x1, x5`) received physical tag $p32$ on Cycle 1 without waiting for the RAT SRAM write edge.
   * **Verification**: Intra-cycle RAW dependency was resolved with 100% mathematical accuracy.

2. **$x0$ Zero Register Protection Verification**:
   * Slot 1 instruction targeting $x0$ was mapped to $p0$ (`phys_rd_1 = 6'd0`).
   * Free List count decremented by only 1 during Cycle 2 ($pop\_cnt = 1$).
   * **Verification**: $x0$ zero protection is $100\%$ verified.

3. **Timing Closure**:
   * Critical Path $t_{\text{rename\_path}} = 0.680\text{ ns}$.
   * Setup Slack at $400\text{-MHz}$ clock ($T_{\text{clk}} = 2.50\text{ ns}$): $T_{\text{slack}} = +1.820\text{ ns} \ge 0$.
   * **Verification**: Complete timing closure achieved.

All simulation steps, RAT lookup tables, Free List FIFO allocations, and intra-cycle bypass logic evaluate with 100% mathematical, physical, and logical precision. The `DualIssueRenamingUnit` module is fully verified.

