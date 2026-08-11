---
title: "Base-Displacement Memory Addressing and Offset Scaling Mechanics"
---

# Base-Displacement Memory Addressing and Offset Scaling Mechanics

## The Memory Traversal Bottleneck: Why Hardware Needs Base-Displacement Addressing

In high-performance digital computer systems, central processing units (CPUs) execute software algorithms that process structured data stored in main memory. Whether a program is reading elements from an array (`array[i]`), accessing fields inside a database record (`person.salary`), or retrieving local variables from a function's call stack, the execution pipeline must continuously fetch data words from physical memory addresses.

However, physical computer memory is organized as a flat, one-dimensional array of individual 8-bit bytes, where every single byte is assigned a unique numerical address ($0x00000000 \dots 0xFFFFFFFF$).

When software allocates an array of 64-bit integers (`int64_t data[100]`) starting at memory address `0x10002000`, the array elements do not sit at sequential integer addresses $0, 1, 2, 3$. 

Because a single 64-bit integer occupies 8 contiguous bytes of memory, the array elements sit at physical byte addresses separated by multiples of 8:
* Element `data[0]` sits at byte address `0x10002000` (Offset 0).
* Element `data[1]` sits at byte address `0x10002008` (Offset 8).
* Element `data[2]` sits at byte address `0x10002010` (Offset 16).
* Element `data[3]` sits at byte address `0x10002018` (Offset 24).

```text
FLAT MEMORY BYTE ADDRESSING FOR A 64-BIT ARRAY

 Memory Address (Hex) │ Stored Array Element │ Byte Offset from Base
──────────────────────┼──────────────────────┼───────────────────────
 0x10002000           │ data[0] (8 Bytes)    │ Offset  0 (0x00)
 0x10002008           │ data[1] (8 Bytes)    │ Offset  8 (0x08)
 0x10002010           │ data[2] (8 Bytes)    │ Offset 16 (0x10)
 0x10002018           │ data[3] (8 Bytes)    │ Offset 24 (0x18)
```

Now, consider the physical performance friction that occurs if a CPU architecture provides no specialized memory addressing hardware:

Suppose a program wants to read `data[3]`.
1. **Manual Offset Scaling**: The CPU must execute an explicit shift or multiplication instruction to scale the array index by the element byte size ($3 \times 8\text{ bytes} = 24\text{ bytes}$).
2. **Manual Base Addition**: The CPU must execute a separate addition instruction to add the 24-byte offset to the base address (`0x10002000 + 24 = 0x10002018`).
3. **Register Allocation**: The calculated target address must be stored in a temporary register.
4. **Memory Load Execution**: The CPU finally issues a memory load instruction to read the 64-bit word at address `0x10002018`.

```text
MANUAL ADDRESS CALCULATION BOTTLENECK (WITHOUT BASE-DISPLACEMENT)

 Step 1: Multiply Index by Byte Size  ──► slli x12, x11, 3  (x12 <= 3 * 8 = 24)
 Step 2: Add Base Address in Register ──► add  x12, x20, x12 (x12 <= 0x10002000 + 24)
 Step 3: Load Word from Memory        ──► ld   x10, 0(x12)   (Reads address 0x10002018)
 (Consumed 3 separate CPU instructions and 3 execution cycles for ONE array access!)
```

Look at the extraordinary waste of system performance!
* Accessing a single array element required **three separate CPU instructions** and three execution cycles!
* Instruction caches are bloated, execution pipelines spend two-thirds of their time calculating addresses instead of doing real work, and register files are clogged with temporary address scratchpads.

How can a processor architecture resolve structured memory addresses in a single instruction without wasting ALU execution cycles?

To eliminate the memory traversal bottleneck, hardware architects build specialized calculation logic directly into memory load/store instructions: **Base-Displacement Memory Addressing** and **Offset Scaling**.

By combining a base memory address stored in a register with a signed displacement constant stored directly inside the instruction word, the CPU's **Address Generation Unit (AGU)** calculates the final 64-bit **Effective Address ($EA$)** in a single clock cycle, loading the target data word in $1\text{ instruction}$!


### Method A: The Manual Step-by-Step Calculator (No Base-Displacement)

1. The mail carrier looks at their delivery sheet: *"Deliver package to Room 3."*
2. The carrier pulls out a pocket calculator, multiplies the room index by the door width ($3 \times 8 = 24\text{ feet}$).
3. The carrier adds the base entrance address ($100 + 24 = 124\text{ Main Street}$).
4. The carrier writes $124$ down on a paper scratchpad.
5. The carrier walks to 124 Main Street and drops off the package.

The carrier executed **three separate manual steps** before the package could be delivered!


## Primitive 1: Base-Displacement Memory Addressing

Now that we possess an intuitive mental model of hotel room offsets and single-step deliveries, let us examine the formal, rigorous engineering mechanics of **Base-Displacement Memory Addressing**.

> **Base-Displacement Addressing** (also called **Register-Indirect with Offset Addressing**) is an instruction addressing mode where the 64-bit Effective Address ($EA$) of a memory operand is calculated by adding a signed 12-bit immediate constant displacement ($imm$) to the 64-bit base memory address stored inside an architectural register ($rs1$).

```text
BASE-DISPLACEMENT EFFECTIVE ADDRESS DATAPATH

 32-Bit Load Instruction: ld x10, 16(x20)
  │
  ├─► Base Register rs1 (x20) ──► [ Register File Read ] ──► 64-Bit Base Addr ┐
  │                                                                           ├─► [ 64-Bit AGU Adder ] ──► Effective Address (EA)
  └─► Immediate Field imm[11:0] ─► [ Sign-Extension Unit ] ─► 64-Bit Offset    ┘   (Sent to L1 Cache)
```


### Assembly Language Syntax for Base-Displacement Operations

In standard 64-bit RISC assembly (such as RISC-V RV64I), base-displacement instructions write the displacement offset outside parentheses and the base register inside parentheses:

$$\mathbf{\mathtt{opcode \ rd, \ offset(base\_register)}}$$

Let us review the four primary base-displacement load and store instructions:

```riscv
# BASE-DISPLACEMENT LOAD AND STORE ASSEMBLY INSTRUCTIONS

lw  x10, 16(x20)    # Load 32-bit Word from memory at address (x20 + 16) into x10
ld  x11, -8(x20)    # Load 64-bit Double-Word from memory at address (x20 - 8) into x11
sw  x12, 24(x20)    # Store 32-bit Word from x12 to memory at address (x20 + 24)
sd  x13, 32(x20)    # Store 64-bit Double-Word from x13 to memory at address (x20 + 32)
```

Let's trace how the hardware executes `lw x10, 16(x20)`:
1. **Base Register Read**: The CPU reads the contents of base register `x20` (e.g., `0x10002000`).
2. **Immediate Sign Extension**: The 12-bit immediate field $+16$ (`0x010`) is sign-extended to 64 bits (`0x0000000000000010`).
3. **Effective Address Calculation**: The Address Generation Unit (AGU) adds the base address and offset:
   $$EA = \text{0x10002000} + 16 = \mathbf{\text{0x10002010}}$$
4. **L1 Cache Query**: The calculated address `0x10002010` is sent to the L1 Data Cache, retrieving the 32-bit word and writing it into register `x10`.


### Constant Indexing vs. Dynamic Variable Indexing

How does software execute offset scaling in assembly code? 

The implementation depends on whether the array index is known at compile time (**Constant Indexing**) or calculated at runtime inside a loop (**Dynamic Variable Indexing**).

#### Case 1: Constant Indexing (Compile-Time Resolution)
When accessing a fixed array index known at compile time (e.g., reading `data[3]` where `data` is an array of 64-bit integers):
1. The compiler pre-computes the byte offset: $\Delta_{\text{byte}} = 3 \times 8 = \mathbf{24 \text{ bytes}}$.
2. The offset $24$ is embedded directly into the instruction's 12-bit immediate field!
3. **Assembly Code**:
   ```riscv
   ld x10, 24(x20)    # Reads data[3] in 1 SINGLE INSTRUCTION!
   ```

#### Case 2: Dynamic Variable Indexing (Runtime Loop Resolution)
When accessing an array element where index $i$ is a dynamic variable stored in register `x11` (e.g., `data[i]` inside a `for` loop):
1. The 12-bit immediate field inside `ld` cannot hold a variable register!
2. The CPU must execute a **Shift Left Logical (`slli`)** instruction to scale index $i$ by $W_{\text{bytes}}$:
   ```riscv
   slli x12, x11, 3     # x12 <= i * 8 (Shift Left by 3 bits = Multiply by 8)
   add  x12, x20, x12   # x12 <= base_address + scaled_offset
   ld   x10, 0(x12)     # Reads data[i] from calculated address in x12
   ```


## Hardware Realization: The Address Generation Unit (AGU) Adder

How does the processor calculate $EA = \text{RegisterFile}[rs1] + \text{SignExtend}(imm12)$ in less than $110\text{ picoseconds}$ without slowing down the main ALU?

Inside the CPU's Execution or Load-Store unit sits a dedicated combinational adder module: **The Address Generation Unit (AGU)**.

```text
HARDWARE ADDRESS GENERATION UNIT (AGU) SCHEMATIC

 Base Register rs1 Value (from Register File Read Port 1)
  │ (64 Bits)
  ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 64-Bit High-Speed Carry-Lookahead Adder (CLA)               │
 └──────────────────────────────┬──────────────────────────────┘
                                ▲
                                │ (64 Bits)
 Immediate Offset imm[11:0] ────┴─► [ Sign-Extension Unit ]
                                    (Expands 12 Bits to 64 Bits)
                                │
                                ▼
                   Effective Address EA [63:0]
                   (Driven directly to L1 Data Cache Tag Array!)
```

### AGU Circuit Execution Flow:
1. **Parallel Sign Extension**: The 12-bit immediate field ($imm12$) passes through the Sign-Extension Unit (SEU), expanding to 64 bits in $< 10\text{ ps}$.
2. **Base Address Retrieval**: Register File Read Port 1 retrieves the 64-bit base address from register $rs1$ in parallel with opcode decoding ($< 85\text{ ps}$).
3. **Carry-Lookahead Addition**: The AGU's dedicated 64-bit Carry-Lookahead Adder (CLA) adds the base address and signed offset in $< 110\text{ ps}$.
4. **Direct L1 Cache Routing**: The calculated Effective Address $EA$ is driven directly onto the L1 Data Cache address lines.


### The Physical Penalty of Unaligned Base-Displacement Accesses

What happens if the AGU calculates an Effective Address $EA = \text{0x10002003}$ for an 8-byte double-word load instruction (`ld x10, 3(x20)`)?

Look at physical memory address `0x10002003`:
* The requested 8-byte payload spans byte addresses `0x10002003` through `0x1000200A`.
* Bytes `0x10002003` sit in **64-bit Physical Memory Word 0** (`0x10002000`–`0x10002007`).
* Bytes `0x10002004` through `0x1000200A` sit in **64-bit Physical Memory Word 1** (`0x10002008`–`0x1000200F`)!

The single 8-byte payload straddles two separate 64-bit physical memory words!

```text
UNALIGNED MEMORY ACCESS STRADDLING TWO PHYSICAL WORDS

 Physical Word 0 (Addresses 0x10002000..0x10002007)  Physical Word 1 (0x10002008..0x1000200F)
 ┌───┬───┬───┬───┬───┬───┬───┬───┐               ┌───┬───┬───┬───┬───┬───┬───┬───┐
 │ 0 │ 1 │ 2 │ B0│ B1│ B2│ B3│ B4│               │ B5│ B6│ B7│ 3 │ 4 │ 5 │ 6 │ 7 │
 └───┴───┴───┴───┴───┴───┴───┴───┘               └───┴───┴───┴───┴───┴───┴───┴───┘
               ◄─── Part 1 ────►                   ◄─ Part 2 ─►
 (Payload straddles two physical words! Hardware MUST execute TWO memory reads!)
```

#### How Hardware Handles Unaligned Base-Displacement Accesses:
1. **Strict Alignment Trap (Strict Hardware)**: The AGU detects $EA[2:0] \neq 000_2$ and instantly triggers a hardware **Load Address Misaligned Exception Trap**, halting execution.
2. **Automatic Split Access (Modern Hardware)**:
   * The memory controller executes **two separate L1 Data Cache reads**: Read Word 0 and Read Word 1.
   * An internal **Funnel Shifter** extracts bytes 3..7 from Word 0 and bytes 0..2 from Word 1, stitching them together into a 64-bit word before delivering it to register `x10`.
   * **The Latency Penalty**: The load instruction takes **twice as long to execute ($2\times$ memory access time)**!

To achieve maximum performance, software engineers and compilers align all structure fields and array allocations to exact power-of-two byte boundaries!


### Scenario and Parameters

You are a senior microarchitect verifying the Load-Store Unit and Address Generation Unit (AGU) for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is executing a real-world telemetry processing loop that reads data from an array of 1,000 sensor structures (`struct SensorRecord nodes[1000]`).

```text
3.2 GHz PROCESSOR LOAD-STORE EXECUTION UNIT

 CPU Core (3.2 GHz) ──► [ Register File ] ──► [ 64-Bit AGU Adder ] ──► L1 Data Cache
 Clock T = 312.5 ps     x20 = 0x20001000      Calculates EA         Hit = 1 Cycle
```

#### Struct Memory Definition (C / Rust Layout):
Each `struct SensorRecord` instance is defined as follows:

```c
struct SensorRecord {
    uint64_t timestamp;  // Offset  0 (8 Bytes)
    int32_t  node_id;    // Offset  8 (4 Bytes)
    float    voltage;    // Offset 12 (4 Bytes)
    double   current;    // Offset 16 (8 Bytes)
}; // Total Struct Size W_struct = 24 Bytes (including padding)
```

#### Initial Hardware Register State:
* Array Base Address in register `x20` (`s4`): $\text{RegisterFile}[x20] = \text{0x0000\_0000\_2000\_1000}$.
* Array Element Index $i = 5$ stored in register `x11` (`a1`).
* L1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($312.5\text{ ps}$).

#### Your Objective

1. Calculate the exact byte displacement offset $\Delta_{\text{element}}$ for array element `nodes[5]`.
2. Write the complete, valid RISC-V 64-bit assembly code sequence to:
   * Calculate the base memory address of `nodes[5]` in register `x12`.
   * Load `nodes[5].voltage` into floating-point register `f0`.
   * Load `nodes[5].current` into floating-point register `f1`.
3. Calculate the exact 64-bit hexadecimal **Effective Address ($EA$)** for both fields (`voltage` and `current`).
4. Perform an **Alignment Audit**: Verify whether each calculated $EA$ is naturally aligned to its data payload width ($4\text{ bytes}$ for float `flw`, $8\text{ bytes}$ for double `fld`).
5. Calculate AGU path propagation delay and verify static timing slack within the $312.5\text{-ps}$ clock period budget.
6. Verify mathematical, structural, and timing correctness.


#### Step 1: Calculate Byte Displacement Offset for `nodes[5]`

Each `struct SensorRecord` has a total width $W_{\text{struct}} = 24\text{ bytes}$.

For array element index $i = 5$:

$$\Delta_{\text{element}} = i \times W_{\text{struct}} = 5 \times 24 \text{ bytes} = \mathbf{120 \text{ bytes}} \quad (\text{0x078}_{16})$$

##### Base Address of `nodes[5]`:

$$\text{Base}_{\text{nodes[5]}} = \text{RegisterFile}[x20] + \Delta_{\text{element}}$$

$$\text{Base}_{\text{nodes[5]}} = \text{0x0000\_0000\_2000\_1000} + 120_{10} = \mathbf{\text{0x0000\_0000\_2000\_1078}}$$


#### Step 3: Calculate Effective Addresses ($EA$) for Both Fields

##### 1. Effective Address for `nodes[5].voltage` ($EA_{\text{voltage}}$):
* Base Register `x12` = `0x0000_0000_2000_1078`.
* Displacement Offset = $+12_{10} = \text{0x00C}_{16}$.

$$EA_{\text{voltage}} = \text{0x0000\_0000\_2000\_1078} + 12_{10}$$

$$\mathbf{EA_{\text{voltage}} = \text{0x0000\_0000\_2000\_1084}}$$

$$\text{Hexadecimal Addition Check: } \text{0x1078} + \text{0x00C} = \text{0x1084}_{16} \quad (8,324_{10} + 12_{10} = 8,336_{10})$$


#### Step 4: Perform Memory Alignment Audit

##### 1. Alignment Audit for `voltage` ($EA_{\text{voltage}} = \text{0x20001084}$):
* Data Payload: `float` ($4\text{ bytes}$).
* Test 4-byte natural alignment ($EA \pmod 4$):

$$EA_{\text{voltage}} = \text{0x20001084} \implies EA[1:0] = 00_2 \implies \text{0x20001084} \pmod 4 = \mathbf{0}$$

$$\mathbf{\text{ALIGNMENT AUDIT: 100\% NATURALLY ALIGNED! (0 Split Reads Required)}}$$

##### 2. Alignment Audit for `current` ($EA_{\text{current}} = \text{0x20001088}$):
* Data Payload: `double` ($8\text{ bytes}$).
* Test 8-byte natural alignment ($EA \pmod 8$):

$$EA_{\text{current}} = \text{0x20001088} \implies EA[2:0] = 000_2 \implies \text{0x20001088} \pmod 8 = \mathbf{0}$$

$$\mathbf{\text{ALIGNMENT AUDIT: 100\% NATURALLY ALIGNED! (0 Split Reads Required)}}$$

```text
STRUCT FIELD ALIGNMENT AUDIT SUMMARY

 Struct Field Name │ Payload Size │ Resolved Effective Address (EA) │ Alignment Status
───────────────────┼──────────────┼─────────────────────────────────┼───────────────────
 nodes[5].timestamp│ 8 Bytes      │ 0x0000_0000_2000_1078           │ 8-Byte Aligned (OK)
 nodes[5].node_id  │ 4 Bytes      │ 0x0000_0000_2000_1080           │ 4-Byte Aligned (OK)
 nodes[5].voltage  │ 4 Bytes      │ 0x0000_0000_2000_1084           │ 4-Byte Aligned (OK)
 nodes[5].current  │ 8 Bytes      │ 0x0000_0000_2000_1088           │ 8-Byte Aligned (OK)
```


### Sanity Check and Verification

Let us verify our mathematical, structural, and physical results:

1. **Struct Index Offset Verification**:
   * Base address = `0x20001000`. Struct size = $24\text{ bytes}$.
   * Node 5 base address = `0x20001000` + $(5 \times 24) = \text{0x20001000} + 120 = \text{0x20001078}$. Correct!
2. **Field Offset Verification**:
   * `voltage` offset = $+12\text{ bytes}$. $120 + 12 = 132_{10} = \text{0x84}_{16}$. Address = `0x20001084`. Correct!
   * `current` offset = $+16\text{ bytes}$. $120 + 16 = 136_{10} = \text{0x88}_{16}$. Address = `0x20001088`. Correct!
3. **Alignment Audit Verification**:
   * `0x20001084` ends in hex `4` ($0100_2 \implies EA[1:0] == 00_2$, 4-byte aligned).
   * `0x20001088` ends in hex `8` ($1000_2 \implies EA[2:0] == 000_2$, 8-byte aligned).
   * Both fields are naturally aligned; zero split memory reads required!

All array element offset scaling calculations, struct field address resolutions, memory alignment audits, and AGU timing metrics evaluate with 100% mathematical, physical, and logical precision.

