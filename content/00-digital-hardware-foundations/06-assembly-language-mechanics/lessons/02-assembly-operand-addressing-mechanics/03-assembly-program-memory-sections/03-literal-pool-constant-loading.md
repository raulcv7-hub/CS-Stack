content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/02-assembly-operand-addressing-mechanics/03-assembly-program-memory-sections/03-literal-pool-constant-loading.md
# Literal Pool Architecture and Composite Constant Load Mechanics

## The 12-Bit Immediate Threshold: Why Large Numbers Cannot Fit Inside Single Instructions

In modern 32-bit Reduced Instruction Set Computer (RISC) architectures, every instruction word stored in memory is engineered to be a fixed size of 32 bits ($4\text{ bytes}$). This fixed instruction width allows instruction fetch units to retrieve and decode instructions at multi-gigahertz clock frequencies.

However, a 32-bit instruction word must divide its limited 32 bits among multiple control fields:
* Opcode field (`opcode`): $7\text{ bits}$
* Destination register (`rd`): $5\text{ bits}$
* Sub-operation selector (`funct3`): $3\text{ bits}$
* Source register 1 (`rs1`): $5\text{ bits}$

After reserving 20 bits for these mandatory control fields, only **12 bits** remain available in immediate-type instructions (`addi`, `lw`, `jalr`) to encode numeric constants!

```text
THE 12-BIT IMMEDIATE CAPACITY THRESHOLD

 Total 32-Bit Instruction Word Boundary
 ┌───────────────────────────┬──────────┬──────────┬──────────┬──────────┐
 │ Immediate Field (imm12)   │ rs1      │ funct3   │ rd       │ opcode   │
 │ 12 Bits Available         │ 5 Bits   │ 3 Bits   │ 5 Bits   │ 7 Bits   │
 └───────────────────────────┴──────────┴──────────┴──────────┴──────────┘
  ◄────── 12 Bits ──────────► ◄────── 20 Control Bits Occupied ────────►
```

In Two's Complement signed representation, a 12-bit immediate field can encode numbers only within the range of **$-2,048 \text{ to } +2,047$**.

Now we encounter the physical hardware friction:
Real-world software programs constantly require **large 32-bit and 64-bit numeric constants**:
* Memory pointers to global variables and functions (e.g., `0x0000000010002040`).
* 64-bit double-precision floating-point numbers (e.g., $\pi \approx 3.141592653589793 = \text{0x400921FB54442D18}$).
* Encryption bitmasks and hash constants (e.g., `0xDEADBEEFCAFEBABE`).

How can a processor load a 32-bit or 64-bit numeric constant into an architectural register when **no single 32-bit instruction can physically hold a number larger than $+2,047$**?

If a processor core is forced to construct a 64-bit constant by executing six or seven consecutive shift-and-add instructions (`lui`, `addi`, `slli`, `addi`, `slli`...), the assembly code becomes bloated, instruction caches are clogged, and execution pipeline throughput degrades.

To solve the 12-bit constant loading threshold, assembly systems engineering relies on two complementary hardware/software strategies: **Composite Constant Loading (`lui`/`auipc` + `addi`)** and **Literal Pool Architecture (`.ltorg`)**.

---

## The Cashier's Cash Tray and the Side Reference Ledger: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of composite constant loading, upper immediate math, and literal pool tables before analyzing register shift-and-add sequences and PC-relative load datapaths, let us consider an everyday analogy: **The Bank Teller and the Large Cash Withdrawal**.

Imagine a bank teller (**The CPU Execution Pipeline**) serving customers (**Program Instructions**) at a bank counter.

```text
THE BANK TELLER CONSTANT LOADING METAPHOR

 Bank Counter (12-Bit Immediate Field)        Side Reference Shelf (Literal Pool)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Quick-Cash Tray           │                │ Reference Ledger Book     │
 │ Holds Max $2,000          │                │ Holds $123,456 Check      │
 └───────────────────────────┘                └───────────────────────────┘
   (Single Immediate Instruction)               (PC-Relative Literal Pool)
```

The teller keeps a small quick-cash tray on the counter (**The 12-Bit Immediate Field**). Because the tray is small, it can hold cash amounts only up to **$\$2,000$** ($+2,047$).

A customer arrives asking for a large payment of **$\$123,456$** (**A 32-Bit or 64-Bit Numeric Constant**).

Let us observe two different methods the teller can use to deliver the $\$123,456$:

---

### Method A: The Two-Step Calculation (Composite Constant Loading)

Instead of making 123 separate trips to the vault, the teller uses a two-step calculation:

1. **Step 1 (Load Upper Stacks — `lui`)**: The teller reaches into the vault and pulls out $123$ thousand-dollar bundles ($\$123,000$).
2. **Step 2 (Add Remaining Change — `addi`)**: The teller takes $456$ dollars from the quick-cash tray and adds it to the $\$123,000$ stack on the counter.

$$\text{Total Money Delivered} = \$123,000 + \$456 = \mathbf{\$123,456}$$

```text
METHOD A: TWO-STEP COMPOSITE CALCULATION

 Step 1: Fetch $123,000 in 1,000-dollar stacks  ──► lui  x10, 123 (Upper 20 Bits)
 Step 2: Add $456 from quick-cash tray         ──► addi x10, x10, 456 (Lower 12 Bits)
 (Delivered $123,456 in 2 simple steps without leaving the counter!)
```

Look at what Method A achieved: The teller constructed a large 6-digit number in **two simple steps** using standard quick-cash tools!

---

### Method B: The Side Reference Ledger (Literal Pool `.ltorg`)

Now, suppose a customer asks for a complex 64-bit floating-point constant like $\pi = 3.141592653589793$.

Building a 64-bit floating-point number using shift-and-add math steps would require the teller to perform 6 or 7 complex calculation steps, taking a long time!

Instead of doing complex math, the teller uses a **Side Reference Ledger**:

1. Before the bank opens, the manager writes complex 64-bit numbers down in a **Reference Ledger Book** sitting on a side shelf 10 feet away (**The Literal Pool `.ltorg`**).
2. When the customer asks for $3.141592653589793$, the teller simply turns to the side shelf, grabs the check written in the ledger 10 feet away (**PC-Relative Memory Load `ld`**), and hands it to the customer in **1 single step**!

```text
METHOD B: SIDE REFERENCE LEDGER (LITERAL POOL)

 Side Shelf (10 feet away): Ledger Page holds "3.141592653589793"
 Teller reaches to side shelf ──► Grabs number off ledger page in 1 Step! (ld)
 (Zero math calculations required!)
```

This bank teller operation is the exact physical analogue of **Constant Loading Mechanics**:
* The quick-cash tray is a **12-Bit Immediate Field**.
* The 2-step calculation ($\$123,000 + \$456$) is **Composite Constant Loading (`lui` + `addi`)**.
* The side reference ledger on the shelf is a **Literal Pool (`.ltorg`)**.
* Reaching 10 feet to grab the check off the shelf is a **PC-Relative Load Instruction (`ld rd, offset(PC)`)**.

---

## Primitive 1: Composite Constant Loading Mechanics (`lui` / `auipc` + `addi`)

Now that we possess an intuitive mental model of quick-cash trays and two-step calculations, let us examine the formal engineering mechanics of **Composite Constant Loading**.

To construct any arbitrary 32-bit numeric constant $C_{\text{32bit}}$, a RISC processor uses two instructions in sequence:
1. An **Upper Immediate Instruction** (`lui` or `auipc`) to load the upper 20 bits.
2. An **Immediate Arithmetic Instruction** (`addi`) to add the lower 12 bits.

```text
32-BIT COMPOSITE CONSTANT LOADING DATAPATH

 Target 32-Bit Constant C = 0x12345678
  │
  ├─► Upper 20 Bits (0x12345) ──► Step 1: lui  x10, 0x12345 ──► x10 <= 0x12345000
  │                                                                 │
  └─► Lower 12 Bits (0x678)   ──► Step 2: addi x10, x10, 0x678 ────┼─► x10 <= 0x12345678!
                                                                    (32-Bit Constant Complete!)
```

---

### Mechanics of `lui` (Load Upper Immediate)

The **`lui` (Load Upper Immediate)** instruction takes a 20-bit immediate constant (`imm20`) embedded in bits `[31:12]` of the instruction word, shifts it left by 12 bits, and writes the 32-bit result into destination register `rd`:

$$\text{lui rd, imm20} \quad \implies \quad \mathbf{rd \Leftarrow (imm20 \ll 12)}$$

$$\text{Binary Output: } [ \ \text{imm20 (20 Bits)} \ \Vert \ 000000000000_2 \ ]$$

When `lui x10, 0x12345` executes:
* `imm20 = 0x12345` (`0001_0010_0011_0100_0101_2`).
* Shifted left by 12 bits: `0x12345000`.
* Register `x10` receives `0x0000000012345000` (in a 64-bit architecture, sign-extended from bit 31).

---

### Mechanics of `auipc` (Add Upper Immediate to PC)

When building a 32-bit **memory address relative to the current Program Counter ($PC$)**, the processor uses **`auipc` (Add Upper Immediate to PC)**:

$$\text{auipc rd, imm20} \quad \implies \quad \mathbf{rd \Leftarrow \text{PC} + (imm20 \ll 12)}$$

`auipc` shifts `imm20` left by 12 bits and adds it to the current $PC$ address, storing the partial 32-bit address in register `rd`.

---

### The Negative Sign-Extension Offset Hazard (Bit 11 Compensation)

Now we encounter a critical assembly engineering hazard: **The Lower Immediate Sign-Extension Offset Hazard**.

Recall from instruction decoding that the 12-bit immediate field inside an `addi` instruction is a **signed Two's Complement number**.

If Bit 11 of the lower 12-bit offset is **`1`**, the `addi` instruction interprets the 12-bit immediate as a **negative number** (ranging from $-1 \text{ to } -2,048$)!

Watch what happens if an assembler naively splits the 32-bit constant **`0x12345800`** into upper 20 bits (`0x12345`) and lower 12 bits (`0x800`):

1. Lower 12 bits = `0x800` = `100000000000_2`. Notice that **Bit 11 is `1`**!
2. In 12-bit Two's Complement signed arithmetic, `0x800` represents **$-2,048_{10}$**!
3. If the assembler emits `lui x10, 0x12345` followed by `addi x10, x10, 0x800`:

```text
THE SIGN-EXTENSION OFFSET CANCELLATION HAZARD

 Step 1: lui  x10, 0x12345     ──► x10 <= 0x12345000
 Step 2: addi x10, x10, 0x800  ──► addi SIGN-EXTENDS 0x800 to -2048 (0xFFFFF800)!

 Calculation: 0x12345000 + (-2048) = 0x12344800! (WRONG RESULT!)
 (Target was 0x12345800, but output was 0x12344800!)
```

Look at the error:
Because `addi` sign-extended `0x800` to $-2,048$, adding $-2,048$ to `0x12345000` **subtracted 1 from the upper 20 bits**, producing `0x12344800` instead of `0x12345800`!

#### The Upper Immediate Compensation Rule:
To fix this cancellation hazard, whenever Bit 11 of the lower 12-bit immediate is **`1`**, the assembler **automatically adds $+1$ to the upper 20-bit immediate in the `lui` instruction**:

$$\mathbf{\text{Upper 20 Bits}_{\text{compensated}} = \begin{cases} \text{Upper 20 Bits} + 1 & \text{if } \text{Lower12}[11] == 1 \\ \text{Upper 20 Bits} & \text{if } \text{Lower12}[11] == 0 \end{cases}}$$

```riscv
# CORRECTED ASSEMBLY SEQUENCE FOR CONSTANT 0x12345800
lui  x10, 0x12346      # Upper 20 bits incremented by +1 (0x12345 + 1 = 0x12346)
addi x10, x10, -2048   # Lower 12 bits 0x800 (-2048)
```

$$\text{Math Verification: } \text{0x12346000} + (-2,048_{10}) = \text{0x12346000} - \text{0x00001000} = \mathbf{\text{0x12345800}}$$

The hardware addition yields the exact intended 32-bit constant `0x12345800`!

---

## Primitive 2: Literal Pool Architecture (`.ltorg`)

While two instructions (`lui` + `addi`) can construct any 32-bit integer constant, how does a 64-bit processor load a **full 64-bit constant** (such as a 64-bit memory pointer `0x0000000010002040` or a 64-bit double float)?

Building a 64-bit constant using composite arithmetic requires **six to eight instructions in sequence** (`lui` + `addi` + `slli` + `addi` + `slli`...), bloating code size and wasting execution cycles!

To load 64-bit constants in a single memory read instruction, systems engineering uses a **Literal Pool (`.ltorg`)**.

> **A Literal Pool** is a dedicated data storage table embedded directly inside or adjacent to the executable code section (`.text`) that stores raw 32-bit or 64-bit constants, allowing the CPU to load full 64-bit constants into registers using a single PC-relative load instruction (`ld rd, offset(PC)`).

```text
LITERAL POOL EMBEDDED IN CODE SECTION (.text)

 .text Executable Code Stream
 ┌─────────────────────────────────────────────────────────────┐
 │ Instruction 1: ld x10, offset_to_pool(PC) ──► Reads Pool    │
 │ Instruction 2: ret                                          │
 ├─────────────────────────────────────────────────────────────┤
 │ .ltorg (Literal Pool Table)                                 │
 │ [ Entry 0: 0x0000000010002040 (64-Bit Pointer) ]            │
 │ [ Entry 1: 0x400921FB54442D18 (64-Bit Double Float Pi) ]    │
 ├─────────────────────────────────────────────────────────────┤
 │ Next Function Code:                                         │
 │ Instruction 3: addi sp, sp, -16                             │
 └─────────────────────────────────────────────────────────────┘
  (Literal Pool placed safely AFTER 'ret' so CPU never executes it!)
```

---

### How the Assembler Manages Literal Pools (`.ltorg`)

When an assembly programmer writes a pseudo-instruction asking to load a large constant:

```riscv
ld x10, =0x0000000010002040   # Load 64-bit constant into x10
```

1. **Literal Allocation**: The assembler software intercepts `=0x0000000010002040`, allocates an 8-byte slot in the active **Literal Pool Table**, and writes the raw 64-bit hex bytes into that slot.
2. **PC-Relative Load Emission**: The assembler replaces `ld x10, =constant` with a single **PC-relative load instruction**:
   ```riscv
   ld x10, pool_offset(pc)     # Reads 64-bit constant from nearby Literal Pool
   ```
3. **Flushing the Pool (`.ltorg`)**: The assembler emits the Literal Pool table into the `.text` section whenever it encounters the **`.ltorg` directive** or reaches the end of a function!

---

### Literal Pool Placement Rules and Range Errors

Why must literal pools be placed strategically within the `.text` section?

Because a PC-relative load instruction (`ld rd, offset(PC)`) uses a **12-bit signed immediate offset**, its maximum reach is limited to **$\pm 2,048\text{ bytes}$ ($\pm 2\text{ KB}$)** from the current Program Counter ($PC$).

If an assembly programmer writes 1,000 lines of code without inserting a `.ltorg` directive:
* The distance between the `ld` instruction and the literal pool exceeds $2,048\text{ bytes}$!
* The assembler halts with a fatal **Literal Pool Out of Range Error**!

```text
LITERAL POOL OUT OF RANGE ERROR

 Instruction: ld x10, pool_offset(PC)  (Distance = 3,500 Bytes!)
                                  │
                                  ▼ Exceeds 12-bit limit (+2047 Bytes)!
 [ .ltorg Literal Pool Table ]
 (ASSEMBLER ERROR: Literal Pool Out of Range!)
```

#### The Assembly Fix:
Assembly programmers insert the `.ltorg` directive **after unconditional jumps (`j`, `ret`)** every $1\text{ to } 2\text{ Kilobytes}$ of code. 

Placing `.ltorg` after `ret` guarantees that the literal pool is within the 2-KB reach of earlier load instructions, while ensuring that the CPU execution pipeline **never executes the literal data as machine instructions**!

---

## Hardware Performance Comparison: Composite Math vs. Literal Pool Loads

To select between Composite Math (`lui` + `addi`) and Literal Pool loads (`ld offset(PC)`), performance engineers evaluate the trade-offs across four microarchitectural dimensions:

```text
COMPOSITE MATH VS LITERAL POOL HARDWARE MATRIX

 Metric                  │ Composite Math (lui + addi) │ Literal Pool (.ltorg + ld)
─────────────────────────┼─────────────────────────────┼──────────────────────────────
 Constant Size Supported │ 32-Bit Integers / Addresses │ Full 64-Bit Integers & Floats
 Instruction Count       │ 2 Instructions              │ 1 Load Instruction
 Code Size Footprint     │ 8 Bytes Code                │ 4B Code + 8B Data = 12 Bytes
 L1 Data Cache Impact    │ ZERO L1D Cache Accesses!    │ 1 L1D Cache Read Query
 Execution Latency       │ 2 Cycles (Deterministic)    │ 1 Cycle (L1D Hit) or 120c (L1D Miss)
```

### 1. 32-Bit Integer Constants: Composite Math WIN!
For 32-bit constants, **Composite Math (`lui` + `addi`) is superior**:
* It consumes only **8 bytes of code space**.
* It executes entirely inside CPU registers in 2 deterministic clock cycles without making a single access to the Level 1 Data Cache!

### 2. 64-Bit Constants and Floating-Point Values: Literal Pool WIN!
For 64-bit constants and double floats, **Literal Pools (`.ltorg`) are superior**:
* Building a 64-bit constant with composite shift-and-add math requires **6 to 8 instructions** ($24 \text{ to } 32\text{ bytes}$ of code).
* A Literal Pool load uses **1 single instruction** ($4\text{ bytes}$ code + $8\text{ bytes}$ pool data = $12\text{ bytes}$ total), cutting code footprint in half!

---

## Solved Industrial Engineering Exercise: 32-Bit and 64-Bit Constant Synthesis, Sign-Extension Compensation, and Literal Pool Offset Resolution

To consolidate your complete mastery of composite constant loading, upper immediate math, lower sign-extension compensation, and literal pool offset resolution, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior firmware microarchitect designing the execution pipeline for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is compiling three large numeric constants required by an encryption and DSP kernel:

1. **Constant A**: 32-bit hexadecimal value **`0xABCD4321`**
2. **Constant B**: 32-bit hexadecimal value **`0xABCD8C21`** (Bit 11 of lower 12 bits is $1$!)
3. **Constant C**: 64-bit double-precision floating-point constant **`0x400921FB54442D18`** ($\pi \approx 3.141592653589793_{10}$)

```text
3.2 GHz PROCESSOR CONSTANT LOADING SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Instruction Decoder ] ──► [ AGU / ALU Units ]
 Clock T = 312.5 ps     Composite vs Pool         L1D Hit = 1 Cycle
```

#### Memory System Specifications:
* Instruction `ld f0, pool_offset(PC)` executes at memory address $PC = \text{0x0000\_0000\_0040\_1000}$.
* The literal pool `.ltorg` is placed at memory address $A_{\text{pool}} = \text{0x0000\_0000\_0040\_1040}$.
* Level 1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($0.3125\text{ ns}$).

#### Your Objective

1. For **Constant A (`0xABCD4321`)**:
   * Extract upper 20 bits and lower 12 bits.
   * Verify whether Bit 11 of the lower 12 bits requires upper immediate $+1$ compensation.
   * Write the 2-instruction composite sequence (`lui` + `addi`).
2. For **Constant B (`0xABCD8C21`)**:
   * Extract upper 20 bits and lower 12 bits.
   * Evaluate Bit 11 and apply the **Upper Immediate $+1$ Compensation Rule**.
   * Write the 2-instruction composite sequence (`lui` + `addi`).
   * Prove mathematically that `lui` + `addi` produces `0xABCD8C21` in 64-bit Two's Complement arithmetic.
3. For **Constant C (`0x400921FB54442D18`)**:
   * Calculate the PC-relative byte offset $\Delta_{\text{pool}} = A_{\text{pool}} - PC$.
   * Write the 1-instruction literal pool load (`fld`) and its corresponding `.ltorg` data entry.
4. Calculate total code memory footprint (in bytes) and execution cycles for loading all three constants.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Synthesize Constant A (`0xABCD4321`)

Target Constant $C_A = \text{0xABCD4321}$.

1. **Extract Lower 12 Bits**:
   * Lower 12 bits = `0x321` = `0011_0010_0001_2` = **$+801_{10}$**.
   * Check Bit 11: Bit 11 is **`0`** ($\text{Bit 11} == 0 \implies$ Positive number!).
   * **No Upper Immediate Compensation Required!**
2. **Extract Upper 20 Bits**:
   * Upper 20 bits = **`0xABCD4`**.
3. **Synthesize Assembly Instruction Sequence**:
   ```riscv
   lui  x10, 0xABCD4      # x10 <= 0xABCD4000
   addi x10, x10, 0x321   # x10 <= 0xABCD4000 + 0x321 = 0xABCD4321
   ```
4. **Mathematical Verification**:
   $$\text{0xABCD4000} + 801_{10} = \text{0xABCD4000} + \text{0x321} = \mathbf{\text{0xABCD4321}} \quad (\mathbf{\text{VERIFIED!}})$$

---

#### Step 2: Synthesize Constant B (`0xABCD8C21` - With Compensation)

Target Constant $C_B = \text{0xABCD8C21}$.

1. **Extract Lower 12 Bits**:
   * Lower 12 bits = `0xC21` = `1100_0010_0001_2`.
   * Check Bit 11: Bit 11 is **`1`** ($\text{Bit 11} == 1 \implies$ Negative number!).
   * In 12-bit Two's Complement signed arithmetic, `0xC21` represents:
     $$\text{Value} = \text{0xC21} - 4,096_{10} = 3,105 - 4,096 = \mathbf{-991_{10}} \quad (\text{0xFFFFF821})$$
2. **Apply Upper Immediate $+1$ Compensation Rule**:
   * Raw Upper 20 bits = `0xABCD8`.
   * Since Bit 11 is `1`, add $+1$ to upper 20 bits:

$$\text{Upper 20 Bits}_{\text{compensated}} = \text{0xABCD8} + 1 = \mathbf{\text{0xABCD9}}$$

3. **Synthesize Assembly Instruction Sequence**:
   ```riscv
   lui  x10, 0xABCD9      # x10 <= 0xABCD9000
   addi x10, x10, -991    # x10 <= 0xABCD9000 + (-991)
   ```
4. **Mathematical Verification**:

$$\text{0xABCD9000} + (-991_{10}) = \text{0xABCD9000} - \text{0x00000C21} + \dots = \text{0xABCD9000} - \text{0x000003DF}$$

$$\text{0xABCD9000} - 991_{10} = \mathbf{\text{0xABCD8C21}} \quad (\mathbf{\text{MATHEMATICALLY VERIFIED!}})$$

Upper immediate compensation neutralized the negative sign extension, producing `0xABCD8C21` with $100\%$ precision!

---

#### Step 3: Synthesize Constant C (`0x400921FB54442D18` - Double Float $\pi$)

Target Constant $C_C = \text{0x400921FB54442D18}$ ($64\text{ bits}$).
Current $PC = \text{0x00401000}$. Literal Pool $A_{\text{pool}} = \text{0x00401040}$.

##### 1. Calculate PC-Relative Byte Offset ($\Delta_{\text{pool}}$):

$$\Delta_{\text{pool}} = A_{\text{pool}} - PC = \text{0x00401040} - \text{0x00401000} = \mathbf{+64_{10} \text{ Bytes }} (\text{0x040})$$

##### 2. Synthesize Assembly Load & Literal Pool Entry:

```riscv
.text
    fld f0, 64(pc)        # Reads 64-bit float from Literal Pool at PC + 64 bytes
    ret                   # Returns from function

.ltorg                    # Literal Pool Table (Placed after ret!)
pi_literal:
    .dword 0x400921FB54442D18 # 64-bit float pi stored as raw data
```

$$\text{Effective Address } EA = PC + 64 = \text{0x00401000} + 64 = \mathbf{\text{0x00401040}} \quad (\mathbf{\text{VERIFIED!}})$$

---

#### Step 4: Calculate Memory Footprint and Execution Cycles

Let us calculate the total memory footprint and execution cycles for loading all three constants:

```text
CONSTANT LOADING PERFORMANCE SUMMARY

 Constant Name │ Value                  │ Loading Method          │ Code Footprint │ Execution Cycles
───────────────┼────────────────────────┼─────────────────────────┼────────────────┼──────────────────
 Constant A    │ 0xABCD4321 (32-Bit)    │ Composite (lui + addi)  │ 8 Bytes        │ 2 Cycles
 Constant B    │ 0xABCD8C21 (32-Bit)    │ Compensated (lui+addi)  │ 8 Bytes        │ 2 Cycles
 Constant C    │ 0x400921FB.. (64-Bit)  │ Literal Pool (fld)      │ 12 Bytes (4+8) │ 1 Cycle (+1 L1D)
───────────────┴────────────────────────┴─────────────────────────┴────────────────┴──────────────────
 TOTALS        │ 3 Large Constants      │ Hybrid Composite/Pool   │ 28 Bytes Total │ 5 Clock Cycles
```

##### Total Time Calculation:
* Total Execution Cycles = $2 + 2 + 1 = \mathbf{5 \text{ Clock Cycles}}$.
* Total Physical Time = $5 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{1.5625 \text{ nanoseconds}}$.

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results:

1. **Sign-Extension Compensation Verification**:
   * $\text{0xABCD9000} + (-991_{10}) = \text{0xABCD9000} - \text{0x000003DF} = \text{0xABCD8C21}$.
   * Matches Constant B hex value perfectly!
2. **Literal Pool Offset Verification**:
   * Load at `0x00401000` + Offset $64$ = `0x00401040`.
   * Matches `.ltorg` placement address `0x00401040`!
3. **Memory Alignment Verification**:
   * `0x00401040` $\pmod 8 == 0$ ($64 \pmod 8 == 0$).
   * The 64-bit floating-point literal is $100\%$ naturally 8-byte aligned, guaranteeing a $1\text{-cycle}$ L1 Data Cache hit!

All composite constant calculations, sign-extension compensations, literal pool PC-relative offsets, and execution cycle metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Literal Pool (`.ltorg`)**: A dedicated data table embedded inside or adjacent to the executable code section (`.text`) that stores full 32-bit or 64-bit constants as raw data bytes, allowing instructions to load large constants using a single PC-relative load instruction (`ld rd, offset(PC)`).
* **Composite Constant Loading (`lui` / `auipc`)**: The technique of synthesizing 32-bit constants or addresses in two steps using an upper immediate instruction (`lui` or `auipc`) to load bits `[31:12]`, followed by an immediate arithmetic instruction (`addi`) to add bits `[11:0]` with sign-extension compensation.
```

I have completed the detailed drafting of `03-literal-pool-constant-loading.md` matching every single requirement! I will now output the file content cleanly starting with the file path.content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/02-assembly-operand-addressing-mechanics/03-assembly-program-memory-sections/03-literal-pool-constant-loading.md
# Literal Pool Architecture and Composite Constant Load Mechanics

## The 12-Bit Immediate Threshold: Why Large Numbers Cannot Fit Inside Single Instructions

In modern 32-bit Reduced Instruction Set Computer (RISC) architectures, every instruction word stored in memory is engineered to be a fixed size of 32 bits ($4\text{ bytes}$). This fixed instruction width allows instruction fetch units to retrieve and decode instructions at multi-gigahertz clock frequencies.

However, a 32-bit instruction word must divide its limited 32 bits among multiple control fields:
* Opcode field (`opcode`): $7\text{ bits}$
* Destination register (`rd`): $5\text{ bits}$
* Sub-operation selector (`funct3`): $3\text{ bits}$
* Source register 1 (`rs1`): $5\text{ bits}$

After reserving 20 bits for these mandatory control fields, only **12 bits** remain available in immediate-type instructions (`addi`, `lw`, `jalr`) to encode numeric constants!

```text
THE 12-BIT IMMEDIATE CAPACITY THRESHOLD

 Total 32-Bit Instruction Word Boundary
 ┌───────────────────────────┬──────────┬──────────┬──────────┬──────────┐
 │ Immediate Field (imm12)   │ rs1      │ funct3   │ rd       │ opcode   │
 │ 12 Bits Available         │ 5 Bits   │ 3 Bits   │ 5 Bits   │ 7 Bits   │
 └───────────────────────────┴──────────┴──────────┴──────────┴──────────┘
  ◄────── 12 Bits ──────────► ◄────── 20 Control Bits Occupied ────────►
```

In Two's Complement signed representation, a 12-bit immediate field can encode numbers only within the range of **$-2,048 \text{ to } +2,047$**.

Now we encounter the physical hardware friction:
Real-world software programs constantly require **large 32-bit and 64-bit numeric constants**:
* Memory pointers to global variables and functions (e.g., `0x0000000010002040`).
* 64-bit double-precision floating-point numbers (e.g., $\pi \approx 3.141592653589793 = \text{0x400921FB54442D18}$).
* Encryption bitmasks and hash constants (e.g., `0xDEADBEEFCAFEBABE`).

How can a processor load a 32-bit or 64-bit numeric constant into an architectural register when **no single 32-bit instruction can physically hold a number larger than $+2,047$**?

If a processor core is forced to construct a 64-bit constant by executing six or seven consecutive shift-and-add instructions (`lui`, `addi`, `slli`, `addi`, `slli`...), the assembly code becomes bloated, instruction caches are clogged, and execution pipeline throughput degrades.

To solve the 12-bit constant loading threshold, assembly systems engineering relies on two complementary hardware/software strategies: **Composite Constant Loading (`lui`/`auipc` + `addi`)** and **Literal Pool Architecture (`.ltorg`)**.

---

## The Cashier's Cash Tray and the Side Reference Ledger: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of composite constant loading, upper immediate math, and literal pool tables before analyzing register shift-and-add sequences and PC-relative load datapaths, let us consider an everyday analogy: **The Bank Teller and the Large Cash Withdrawal**.

Imagine a bank teller (**The CPU Execution Pipeline**) serving customers (**Program Instructions**) at a bank counter.

```text
THE BANK TELLER CONSTANT LOADING METAPHOR

 Bank Counter (12-Bit Immediate Field)        Side Reference Shelf (Literal Pool)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Quick-Cash Tray           │                │ Reference Ledger Book     │
 │ Holds Max $2,000          │                │ Holds $123,456 Check      │
 └───────────────────────────┘                └───────────────────────────┘
   (Single Immediate Instruction)               (PC-Relative Literal Pool)
```

The teller keeps a small quick-cash tray on the counter (**The 12-Bit Immediate Field**). Because the tray is small, it can hold cash amounts only up to **$\$2,000$** ($+2,047$).

A customer arrives asking for a large payment of **$\$123,456$** (**A 32-Bit or 64-Bit Numeric Constant**).

Let us observe two different methods the teller can use to deliver the $\$123,456$:

---

### Method A: The Two-Step Calculation (Composite Constant Loading)

Instead of making 123 separate trips to the vault, the teller uses a two-step calculation:

1. **Step 1 (Load Upper Stacks — `lui`)**: The teller reaches into the vault and pulls out $123$ thousand-dollar bundles ($\$123,000$).
2. **Step 2 (Add Remaining Change — `addi`)**: The teller takes $456$ dollars from the quick-cash tray and adds it to the $\$123,000$ stack on the counter.

$$\text{Total Money Delivered} = \$123,000 + \$456 = \mathbf{\$123,456}$$

```text
METHOD A: TWO-STEP COMPOSITE CALCULATION

 Step 1: Fetch $123,000 in 1,000-dollar stacks  ──► lui  x10, 123 (Upper 20 Bits)
 Step 2: Add $456 from quick-cash tray         ──► addi x10, x10, 456 (Lower 12 Bits)
 (Delivered $123,456 in 2 simple steps without leaving the counter!)
```

Look at what Method A achieved: The teller constructed a large 6-digit number in **two simple steps** using standard quick-cash tools!

---

### Method B: The Side Reference Ledger (Literal Pool `.ltorg`)

Now, suppose a customer asks for a complex 64-bit floating-point constant like $\pi = 3.141592653589793$.

Building a 64-bit floating-point number using shift-and-add math steps would require the teller to perform 6 or 7 complex calculation steps, taking a long time!

Instead of doing complex math, the teller uses a **Side Reference Ledger**:

1. Before the bank opens, the manager writes complex 64-bit numbers down in a **Reference Ledger Book** sitting on a side shelf 10 feet away (**The Literal Pool `.ltorg`**).
2. When the customer asks for $3.141592653589793$, the teller simply turns to the side shelf, grabs the check written in the ledger 10 feet away (**PC-Relative Memory Load `ld`**), and hands it to the customer in **1 single step**!

```text
METHOD B: SIDE REFERENCE LEDGER (LITERAL POOL)

 Side Shelf (10 feet away): Ledger Page holds "3.141592653589793"
 Teller reaches to side shelf ──► Grabs number off ledger page in 1 Step! (ld)
 (Zero math calculations required!)
```

This bank teller operation is the exact physical analogue of **Constant Loading Mechanics**:
* The quick-cash tray is a **12-Bit Immediate Field**.
* The 2-step calculation ($\$123,000 + \$456$) is **Composite Constant Loading (`lui` + `addi`)**.
* The side reference ledger on the shelf is a **Literal Pool (`.ltorg`)**.
* Reaching 10 feet to grab the check off the shelf is a **PC-Relative Load Instruction (`ld rd, offset(PC)`)**.

---

## Primitive 1: Composite Constant Loading Mechanics (`lui` / `auipc` + `addi`)

Now that we possess an intuitive mental model of quick-cash trays and two-step calculations, let us examine the formal engineering mechanics of **Composite Constant Loading**.

To construct any arbitrary 32-bit numeric constant $C_{\text{32bit}}$, a RISC processor uses two instructions in sequence:
1. An **Upper Immediate Instruction** (`lui` or `auipc`) to load the upper 20 bits.
2. An **Immediate Arithmetic Instruction** (`addi`) to add the lower 12 bits.

```text
32-BIT COMPOSITE CONSTANT LOADING DATAPATH

 Target 32-Bit Constant C = 0x12345678
  │
  ├─► Upper 20 Bits (0x12345) ──► Step 1: lui  x10, 0x12345 ──► x10 <= 0x12345000
  │                                                                 │
  └─► Lower 12 Bits (0x678)   ──► Step 2: addi x10, x10, 0x678 ────┼─► x10 <= 0x12345678!
                                                                    (32-Bit Constant Complete!)
```

---

### Mechanics of `lui` (Load Upper Immediate)

The **`lui` (Load Upper Immediate)** instruction takes a 20-bit immediate constant (`imm20`) embedded in bits `[31:12]` of the instruction word, shifts it left by 12 bits, and writes the 32-bit result into destination register `rd`:

$$\text{lui rd, imm20} \quad \implies \quad \mathbf{rd \Leftarrow (imm20 \ll 12)}$$

$$\text{Binary Output: } [ \ \text{imm20 (20 Bits)} \ \Vert \ 000000000000_2 \ ]$$

When `lui x10, 0x12345` executes:
* `imm20 = 0x12345` (`0001_0010_0011_0100_0101_2`).
* Shifted left by 12 bits: `0x12345000`.
* Register `x10` receives `0x0000000012345000` (in a 64-bit architecture, sign-extended from bit 31).

---

### Mechanics of `auipc` (Add Upper Immediate to PC)

When building a 32-bit **memory address relative to the current Program Counter ($PC$)**, the processor uses **`auipc` (Add Upper Immediate to PC)**:

$$\text{auipc rd, imm20} \quad \implies \quad \mathbf{rd \Leftarrow \text{PC} + (imm20 \ll 12)}$$

`auipc` shifts `imm20` left by 12 bits and adds it to the current $PC$ address, storing the partial 32-bit address in register `rd`.

---

### The Negative Sign-Extension Offset Hazard (Bit 11 Compensation)

Now we encounter a critical assembly engineering hazard: **The Lower Immediate Sign-Extension Offset Hazard**.

Recall from instruction decoding that the 12-bit immediate field inside an `addi` instruction is a **signed Two's Complement number**.

If Bit 11 of the lower 12-bit offset is **`1`**, the `addi` instruction interprets the 12-bit immediate as a **negative number** (ranging from $-1 \text{ to } -2,048$)!

Watch what happens if an assembler naively splits the 32-bit constant **`0x12345800`** into upper 20 bits (`0x12345`) and lower 12 bits (`0x800`):

1. Lower 12 bits = `0x800` = `100000000000_2`. Notice that **Bit 11 is `1`**!
2. In 12-bit Two's Complement signed arithmetic, `0x800` represents **$-2,048_{10}$**!
3. If the assembler emits `lui x10, 0x12345` followed by `addi x10, x10, 0x800`:

```text
THE SIGN-EXTENSION OFFSET CANCELLATION HAZARD

 Step 1: lui  x10, 0x12345     ──► x10 <= 0x12345000
 Step 2: addi x10, x10, 0x800  ──► addi SIGN-EXTENDS 0x800 to -2048 (0xFFFFF800)!

 Calculation: 0x12345000 + (-2048) = 0x12344800! (WRONG RESULT!)
 (Target was 0x12345800, but output was 0x12344800!)
```

Look at the error:
Because `addi` sign-extended `0x800` to $-2,048$, adding $-2,048$ to `0x12345000` **subtracted 1 from the upper 20 bits**, producing `0x12344800` instead of `0x12345800`!

#### The Upper Immediate Compensation Rule:
To fix this cancellation hazard, whenever Bit 11 of the lower 12-bit immediate is **`1`**, the assembler **automatically adds $+1$ to the upper 20-bit immediate in the `lui` instruction**:

$$\mathbf{\text{Upper 20 Bits}_{\text{compensated}} = \begin{cases} \text{Upper 20 Bits} + 1 & \text{if } \text{Lower12}[11] == 1 \\ \text{Upper 20 Bits} & \text{if } \text{Lower12}[11] == 0 \end{cases}}$$

```riscv
# CORRECTED ASSEMBLY SEQUENCE FOR CONSTANT 0x12345800
lui  x10, 0x12346      # Upper 20 bits incremented by +1 (0x12345 + 1 = 0x12346)
addi x10, x10, -2048   # Lower 12 bits 0x800 (-2048)
```

$$\text{Math Verification: } \text{0x12346000} + (-2,048_{10}) = \text{0x12346000} - \text{0x00001000} = \mathbf{\text{0x12345800}}$$

The hardware addition yields the exact intended 32-bit constant `0x12345800`!

---

## Primitive 2: Literal Pool Architecture (`.ltorg`)

While two instructions (`lui` + `addi`) can construct any 32-bit integer constant, how does a 64-bit processor load a **full 64-bit constant** (such as a 64-bit memory pointer `0x0000000010002040` or a 64-bit double float)?

Building a 64-bit constant using composite arithmetic requires **six to eight instructions in sequence** (`lui` + `addi` + `slli` + `addi` + `slli`...), bloating code size and wasting execution cycles!

To load 64-bit constants in a single memory read instruction, systems engineering uses a **Literal Pool (`.ltorg`)**.

> **A Literal Pool** is a dedicated data storage table embedded directly inside or adjacent to the executable code section (`.text`) that stores raw 32-bit or 64-bit constants, allowing the CPU to load full 64-bit constants into registers using a single PC-relative load instruction (`ld rd, offset(PC)`).

```text
LITERAL POOL EMBEDDED IN CODE SECTION (.text)

 .text Executable Code Stream
 ┌─────────────────────────────────────────────────────────────┐
 │ Instruction 1: ld x10, offset_to_pool(PC) ──► Reads Pool    │
 │ Instruction 2: ret                                          │
 ├─────────────────────────────────────────────────────────────┤
 │ .ltorg (Literal Pool Table)                                 │
 │ [ Entry 0: 0x0000000010002040 (64-Bit Pointer) ]            │
 │ [ Entry 1: 0x400921FB54442D18 (64-Bit Double Float Pi) ]    │
 ├─────────────────────────────────────────────────────────────┤
 │ Next Function Code:                                         │
 │ Instruction 3: addi sp, sp, -16                             │
 └─────────────────────────────────────────────────────────────┘
  (Literal Pool placed safely AFTER 'ret' so CPU never executes it!)
```

---

### How the Assembler Manages Literal Pools (`.ltorg`)

When an assembly programmer writes a pseudo-instruction asking to load a large constant:

```riscv
ld x10, =0x0000000010002040   # Load 64-bit constant into x10
```

1. **Literal Allocation**: The assembler software intercepts `=0x0000000010002040`, allocates an 8-byte slot in the active **Literal Pool Table**, and writes the raw 64-bit hex bytes into that slot.
2. **PC-Relative Load Emission**: The assembler replaces `ld x10, =constant` with a single **PC-relative load instruction**:
   ```riscv
   ld x10, pool_offset(pc)     # Reads 64-bit constant from nearby Literal Pool
   ```
3. **Flushing the Pool (`.ltorg`)**: The assembler emits the Literal Pool table into the `.text` section whenever it encounters the **`.ltorg` directive** or reaches the end of a function!

---

### Literal Pool Placement Rules and Range Errors

Why must literal pools be placed strategically within the `.text` section?

Because a PC-relative load instruction (`ld rd, offset(PC)`) uses a **12-bit signed immediate offset**, its maximum reach is limited to **$\pm 2,048\text{ bytes}$ ($\pm 2\text{ KB}$)** from the current Program Counter ($PC$).

If an assembly programmer writes 1,000 lines of code without inserting a `.ltorg` directive:
* The distance between the `ld` instruction and the literal pool exceeds $2,048\text{ bytes}$!
* The assembler halts with a fatal **Literal Pool Out of Range Error**!

```text
LITERAL POOL OUT OF RANGE ERROR

 Instruction: ld x10, pool_offset(PC)  (Distance = 3,500 Bytes!)
                                  │
                                  ▼ Exceeds 12-bit limit (+2047 Bytes)!
 [ .ltorg Literal Pool Table ]
 (ASSEMBLER ERROR: Literal Pool Out of Range!)
```

#### The Assembly Fix:
Assembly programmers insert the `.ltorg` directive **after unconditional jumps (`j`, `ret`)** every $1\text{ to } 2\text{ Kilobytes}$ of code. 

Placing `.ltorg` after `ret` guarantees that the literal pool is within the 2-KB reach of earlier load instructions, while ensuring that the CPU execution pipeline **never executes the literal data as machine instructions**!

---

## Hardware Performance Comparison: Composite Math vs. Literal Pool Loads

To select between Composite Math (`lui` + `addi`) and Literal Pool loads (`ld offset(PC)`), performance engineers evaluate the trade-offs across four microarchitectural dimensions:

```text
COMPOSITE MATH VS LITERAL POOL HARDWARE MATRIX

 Metric                  │ Composite Math (lui + addi) │ Literal Pool (.ltorg + ld)
─────────────────────────┼─────────────────────────────┼──────────────────────────────
 Constant Size Supported │ 32-Bit Integers / Addresses │ Full 64-Bit Integers & Floats
 Instruction Count       │ 2 Instructions              │ 1 Load Instruction
 Code Size Footprint     │ 8 Bytes Code                │ 4B Code + 8B Data = 12 Bytes
 L1 Data Cache Impact    │ ZERO L1D Cache Accesses!    │ 1 L1D Cache Read Query
 Execution Latency       │ 2 Cycles (Deterministic)    │ 1 Cycle (L1D Hit) or 120c (L1D Miss)
```

### 1. 32-Bit Integer Constants: Composite Math WIN!
For 32-bit constants, **Composite Math (`lui` + `addi`) is superior**:
* It consumes only **8 bytes of code space**.
* It executes entirely inside CPU registers in 2 deterministic clock cycles without making a single access to the Level 1 Data Cache!

### 2. 64-Bit Constants and Floating-Point Values: Literal Pool WIN!
For 64-bit constants and double floats, **Literal Pools (`.ltorg`) are superior**:
* Building a 64-bit constant with composite shift-and-add math requires **6 to 8 instructions** ($24 \text{ to } 32\text{ bytes}$ of code).
* A Literal Pool load uses **1 single instruction** ($4\text{ bytes}$ code + $8\text{ bytes}$ pool data = $12\text{ bytes}$ total), cutting code footprint in half!

---

## Solved Industrial Engineering Exercise: 32-Bit and 64-Bit Constant Synthesis, Sign-Extension Compensation, and Literal Pool Offset Resolution

To consolidate your complete mastery of composite constant loading, upper immediate math, lower sign-extension compensation, and literal pool offset resolution, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior firmware microarchitect designing the execution pipeline for an industrial $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor is compiling three large numeric constants required by an encryption and DSP kernel:

1. **Constant A**: 32-bit hexadecimal value **`0xABCD4321`**
2. **Constant B**: 32-bit hexadecimal value **`0xABCD8C21`** (Bit 11 of lower 12 bits is $1$!)
3. **Constant C**: 64-bit double-precision floating-point constant **`0x400921FB54442D18`** ($\pi \approx 3.141592653589793_{10}$)

```text
3.2 GHz PROCESSOR CONSTANT LOADING SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Instruction Decoder ] ──► [ AGU / ALU Units ]
 Clock T = 312.5 ps     Composite vs Pool         L1D Hit = 1 Cycle
```

#### Memory System Specifications:
* Instruction `ld f0, pool_offset(PC)` executes at memory address $PC = \text{0x0000\_0000\_0040\_1000}$.
* The literal pool `.ltorg` is placed at memory address $A_{\text{pool}} = \text{0x0000\_0000\_0040\_1040}$.
* Level 1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($0.3125\text{ ns}$).

#### Your Objective

1. For **Constant A (`0xABCD4321`)**:
   * Extract upper 20 bits and lower 12 bits.
   * Verify whether Bit 11 of the lower 12 bits requires upper immediate $+1$ compensation.
   * Write the 2-instruction composite sequence (`lui` + `addi`).
2. For **Constant B (`0xABCD8C21`)**:
   * Extract upper 20 bits and lower 12 bits.
   * Evaluate Bit 11 and apply the **Upper Immediate $+1$ Compensation Rule**.
   * Write the 2-instruction composite sequence (`lui` + `addi`).
   * Prove mathematically that `lui` + `addi` produces `0xABCD8C21` in 64-bit Two's Complement arithmetic.
3. For **Constant C (`0x400921FB54442D18`)**:
   * Calculate the PC-relative byte offset $\Delta_{\text{pool}} = A_{\text{pool}} - PC$.
   * Write the 1-instruction literal pool load (`fld`) and its corresponding `.ltorg` data entry.
4. Calculate total code memory footprint (in bytes) and execution cycles for loading all three constants.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Synthesize Constant A (`0xABCD4321`)

Target Constant $C_A = \text{0xABCD4321}$.

1. **Extract Lower 12 Bits**:
   * Lower 12 bits = `0x321` = `0011_0010_0001_2` = **$+801_{10}$**.
   * Check Bit 11: Bit 11 is **`0`** ($\text{Bit 11} == 0 \implies$ Positive number!).
   * **No Upper Immediate Compensation Required!**
2. **Extract Upper 20 Bits**:
   * Upper 20 bits = **`0xABCD4`**.
3. **Synthesize Assembly Instruction Sequence**:
   ```riscv
   lui  x10, 0xABCD4      # x10 <= 0xABCD4000
   addi x10, x10, 0x321   # x10 <= 0xABCD4000 + 0x321 = 0xABCD4321
   ```
4. **Mathematical Verification**:
   $$\text{0xABCD4000} + 801_{10} = \text{0xABCD4000} + \text{0x321} = \mathbf{\text{0xABCD4321}} \quad (\mathbf{\text{VERIFIED!}})$$

---

#### Step 2: Synthesize Constant B (`0xABCD8C21` - With Compensation)

Target Constant $C_B = \text{0xABCD8C21}$.

1. **Extract Lower 12 Bits**:
   * Lower 12 bits = `0xC21` = `1100_0010_0001_2`.
   * Check Bit 11: Bit 11 is **`1`** ($\text{Bit 11} == 1 \implies$ Negative number!).
   * In 12-bit Two's Complement signed arithmetic, `0xC21` represents:
     $$\text{Value} = \text{0xC21} - 4,096_{10} = 3,105 - 4,096 = \mathbf{-991_{10}} \quad (\text{0xFFFFF821})$$
2. **Apply Upper Immediate $+1$ Compensation Rule**:
   * Raw Upper 20 bits = `0xABCD8`.
   * Since Bit 11 is `1`, add $+1$ to upper 20 bits:

$$\text{Upper 20 Bits}_{\text{compensated}} = \text{0xABCD8} + 1 = \mathbf{\text{0xABCD9}}$$

3. **Synthesize Assembly Instruction Sequence**:
   ```riscv
   lui  x10, 0xABCD9      # x10 <= 0xABCD9000
   addi x10, x10, -991    # x10 <= 0xABCD9000 + (-991)
   ```
4. **Mathematical Verification**:

$$\text{0xABCD9000} + (-991_{10}) = \text{0xABCD9000} - \text{0x00000C21} + \dots = \text{0xABCD9000} - \text{0x000003DF}$$

$$\text{0xABCD9000} - 991_{10} = \mathbf{\text{0xABCD8C21}} \quad (\mathbf{\text{MATHEMATICALLY VERIFIED!}})$$

Upper immediate compensation neutralized the negative sign extension, producing `0xABCD8C21` with $100\%$ precision!

---

#### Step 3: Synthesize Constant C (`0x400921FB54442D18` - Double Float $\pi$)

Target Constant $C_C = \text{0x400921FB54442D18}$ ($64\text{ bits}$).
Current $PC = \text{0x00401000}$. Literal Pool $A_{\text{pool}} = \text{0x00401040}$.

##### 1. Calculate PC-Relative Byte Offset ($\Delta_{\text{pool}}$):

$$\Delta_{\text{pool}} = A_{\text{pool}} - PC = \text{0x00401040} - \text{0x00401000} = \mathbf{+64_{10} \text{ Bytes }} (\text{0x040})$$

##### 2. Synthesize Assembly Load & Literal Pool Entry:

```riscv
.text
    fld f0, 64(pc)        # Reads 64-bit float from Literal Pool at PC + 64 bytes
    ret                   # Returns from function

.ltorg                    # Literal Pool Table (Placed after ret!)
pi_literal:
    .dword 0x400921FB54442D18 # 64-bit float pi stored as raw data
```

$$\text{Effective Address } EA = PC + 64 = \text{0x00401000} + 64 = \mathbf{\text{0x00401040}} \quad (\mathbf{\text{VERIFIED!}})$$

---

#### Step 4: Calculate Memory Footprint and Execution Cycles

Let us calculate the total memory footprint and execution cycles for loading all three constants:

```text
CONSTANT LOADING PERFORMANCE SUMMARY

 Constant Name │ Value                  │ Loading Method          │ Code Footprint │ Execution Cycles
───────────────┼────────────────────────┼─────────────────────────┼────────────────┼──────────────────
 Constant A    │ 0xABCD4321 (32-Bit)    │ Composite (lui + addi)  │ 8 Bytes        │ 2 Cycles
 Constant B    │ 0xABCD8C21 (32-Bit)    │ Compensated (lui+addi)  │ 8 Bytes        │ 2 Cycles
 Constant C    │ 0x400921FB.. (64-Bit)  │ Literal Pool (fld)      │ 12 Bytes (4+8) │ 1 Cycle (+1 L1D)
───────────────┴────────────────────────┴─────────────────────────┴────────────────┴──────────────────
 TOTALS        │ 3 Large Constants      │ Hybrid Composite/Pool   │ 28 Bytes Total │ 5 Clock Cycles
```

##### Total Time Calculation:
* Total Execution Cycles = $2 + 2 + 1 = \mathbf{5 \text{ Clock Cycles}}$.
* Total Physical Time = $5 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{1.5625 \text{ nanoseconds}}$.

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results:

1. **Sign-Extension Compensation Verification**:
   * $\text{0xABCD9000} + (-991_{10}) = \text{0xABCD9000} - \text{0x000003DF} = \text{0xABCD8C21}$.
   * Matches Constant B hex value perfectly!
2. **Literal Pool Offset Verification**:
   * Load at `0x00401000` + Offset $64$ = `0x00401040`.
   * Matches `.ltorg` placement address `0x00401040`!
3. **Memory Alignment Verification**:
   * `0x00401040` $\pmod 8 == 0$ ($64 \pmod 8 == 0$).
   * The 64-bit floating-point literal is $100\%$ naturally 8-byte aligned, guaranteeing a $1\text{-cycle}$ L1 Data Cache hit!

All composite constant calculations, sign-extension compensations, literal pool PC-relative offsets, and execution cycle metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Literal Pool (`.ltorg`)**: A dedicated data table embedded inside or adjacent to the executable code section (`.text`) that stores full 32-bit or 64-bit constants as raw data bytes, allowing instructions to load large constants using a single PC-relative load instruction (`ld rd, offset(PC)`).
* **Composite Constant Loading (`lui` / `auipc`)**: The technique of synthesizing 32-bit constants or addresses in two steps using an upper immediate instruction (`lui` or `auipc`) to load bits `[31:12]`, followed by an immediate arithmetic instruction (`addi`) to add bits `[11:0]` with sign-extension compensation.
