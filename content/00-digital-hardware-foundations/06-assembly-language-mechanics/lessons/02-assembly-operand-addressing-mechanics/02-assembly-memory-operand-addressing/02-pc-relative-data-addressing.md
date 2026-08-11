content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/02-assembly-operand-addressing-mechanics/02-assembly-memory-operand-addressing/02-pc-relative-data-addressing.md
# PC-Relative Data Addressing and Position-Independent Code (PIC) Mechanics

## The Absolute Address Relocation Crisis: Why Hardcoded Memory Pointers Fail

In modern operating systems, when a user launches a software application or when a server loads a shared dynamic library (such as a `.so` file in Linux or a `.dll` file in Windows), the operating system's virtual memory manager does not place the executable code at the exact same physical or virtual memory address every single time.

To protect computer systems against security exploits (such as Buffer Overflow attacks and Return-Oriented Programming), modern operating systems enforce **Address Space Layout Randomization (ASLR)**. 

Under ASLR, every time a program is launched, the operating system randomly shifts the base memory address of the program's code, stack, heap, and data sections across the multi-gigabyte virtual address space:

```text
ADDRESS SPACE LAYOUT RANDOMIZATION (ASLR) MEMORY RELOCATION

 Run 1 (Monday Execution):
 Base Memory Address: 0x0000000000400000
 ┌───────────────────────────┬───────────────────────────┐
 │ Code Section (.text)      │ Read-Only Data (.rodata)  │
 └───────────────────────────┴───────────────────────────┘

 Run 2 (Tuesday Execution - Relocated by ASLR!):
 Base Memory Address: 0x00007FFFF0000000
 ┌───────────────────────────┬───────────────────────────┐
 │ Code Section (.text)      │ Read-Only Data (.rodata)  │
 └───────────────────────────┴───────────────────────────┘
  (The entire binary image is shifted to a completely new address!)
```

Now, consider the physical hardware failure that occurs if an assembly programmer or compiler writes machine code using **Absolute Physical Memory Addressing**:

Suppose an instruction inside the code section attempts to load a global configuration constant (`config_mask`) stored in the read-only data section (`.rodata`). 

If the compiler hardcodes the absolute 64-bit memory address into the binary instruction (e.g., `load_word x10, [0x00402040]`):

1. On Run 1 (where the binary is loaded at base address `0x00400000`), the variable `config_mask` resides at address `0x00402040`. The instruction reads `0x00402040` and retrieves the correct configuration mask.
2. On Run 2, ASLR shifts the binary image to base address `0x7FFF0000`. The variable `config_mask` now resides at address `0x7FFF2040`!
3. **The Absolute Address Failure**: The hardcoded instruction `load_word x10, [0x00402040]` still attempts to read memory address `0x00402040`!
4. Address `0x00402040` no longer contains `config_mask`! It contains unmapped empty space or data belonging to another process. The CPU reads corrupted data or triggers an immediate hardware memory access fault!

```text
HARDCODED ABSOLUTE ADDRESSING FAILURE UNDER ASLR

 Instruction: load_word x10, [0x00402040]  (Hardcoded Absolute Address)
                                │
                                ▼
 On Run 2 (Binary relocated to 0x7FFF0000):
 Address 0x00402040 is EMPTY / UNMAPPED!
 CPU reads corrupted garbage or triggers MEMORY FAULT TRAP!
```

To prevent this memory access failure in legacy architectures, the operating system's program loader was forced to execute **Startup Code Relocation**:
* Before running the program, the OS loader had to scan through every single byte of the binary on disk, locate thousands of hardcoded memory addresses, and manually rewrite the instruction bytes in RAM to reflect the new base address!
* Startup times ballooned, memory consumption doubled, and shared dynamic libraries could **no longer be shared between different processes**, because each running process needed its own uniquely modified copy of the instruction bytes in RAM!

How can we write machine code that can be loaded and executed at **ANY arbitrary memory address** in the computer without modifying a single byte of the instruction code at runtime?

To eliminate startup relocation delays, enable shared dynamic libraries, and support ASLR security, computer architectures use **PC-Relative Addressing** to produce **Position-Independent Code (PIC)**.

---

## The Mobile Food Truck and Attached Storage Trailer: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of Position-Independent Code and PC-Relative addressing before inspecting bitwise offset calculations, two-instruction address synthesis, and ELF relocation types, let us consider an everyday analogy: **The Mobile Food Truck and the Attached Storage Trailer**.

Imagine a mobile food truck operator (**The CPU Core Execution Pipeline**) serving meals across a large city.

```text
THE MOBILE FOOD TRUCK AND STORAGE TRAILER METAPHOR

 Mobile Food Truck (Code Section .text)    Attached Storage Trailer (Data Section .rodata)
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ Chef's Kitchen            │   Towed     │ Ingredients & Supplies    │
 │ (Executes Instructions)   │═ ═ ═ ═ ═ ═ ═│ (Holds Global Data)       │
 └───────────────────────────┘   Distance  └───────────────────────────┘
```

The food truck contains the chef's kitchen (**The Code Section `.text`**), where recipes (**Instructions**) are executed. 

Towed directly behind the food truck is a specialized storage trailer (**The Data Section `.rodata`**) holding cooking ingredients (**Global Data Variables**).

The food truck and its storage trailer are permanently connected by a rigid 20-foot tow bar.

Let us observe two different navigation methods the owner can write in the chef's recipe manual:

---

### Method A: Absolute Street Address Instructions (Absolute Addressing)

The food truck owner writes the recipe manual using fixed city street addresses:
* *"To get a block of cheese, leave the kitchen and walk to Street Address #120 Main Street."*

Look at what happens as the food truck operates across the week:

1. **Monday**: The food truck parks at **#100 Main Street** ($PC = 100$).
   * Because the storage trailer is towed 20 feet behind the truck, the trailer is parked at **#120 Main Street**.
   * The chef follows the manual: walks to #120 Main Street, grabs the cheese. **Everything works!**
2. **Tuesday (Relocation / ASLR)**: Another vendor parks at #100 Main Street, so our food truck parks at **#500 Broadway** ($PC = 500$).
   * The storage trailer is towed right behind the truck at **#520 Broadway**.
   * The chef follows the hardcoded manual: *"Walk to #120 Main Street!"*
   * The chef leaves the kitchen at #500 Broadway and walks 5 miles back across town to #120 Main Street!
   * **#120 Main Street is now a hardware store!** The chef reads wrong data, cannot find cheese, and the food truck business crashes!

```text
ABSOLUTE ADDRESS MANUAL FAILURE

 Tuesday Parking: Food Truck at #500 Broadway | Storage Trailer at #520 Broadway
 Chef reads hardcoded manual: "Go to #120 Main Street!"
 Chef walks 5 miles to #120 Main Street ──► #120 is a Hardware Store! (CRASH!)
```

---

### Method B: Relative Distance Instructions (PC-Relative Addressing / PIC)

Realizing the flaw of absolute addresses, the food truck owner rewrites the recipe manual using **Relative Navigation**:

> **The Relative Navigation Rule**: *"To get a block of cheese, walk 20 feet behind where the driver's seat (The Program Counter $PC$) is currently parked!"*

$$\text{Target Location} = \text{Driver's Seat Position } (PC) + 20 \text{ Feet}$$

Look at how Method B operates across different parking spots:

```text
RELATIVE NAVIGATION IN ACTION (POSITION-INDEPENDENT CODE)

 Monday Parking (Base #100 Main Street):
 Driver's Seat PC = 100 ──► Target = 100 + 20 = #120 Main Street (FOUND CHEESE!)

 Tuesday Parking (Base #500 Broadway - RELOCATED!):
 Driver's Seat PC = 500 ──► Target = 500 + 20 = #520 Broadway (FOUND CHEESE!)
 (The recipe manual "+20 Feet" NEVER CHANGED! Works at ANY location!)
```

Trace Method B's success:
1. **Monday ($PC = 100$)**: The chef calculates $\text{Target} = 100 + 20 = \mathbf{120 \text{ Main Street}}$. Finds cheese!
2. **Tuesday ($PC = 500$)**: The chef calculates $\text{Target} = 500 + 20 = \mathbf{520 \text{ Broadway}}$. Finds cheese!

Notice the revolutionary engineering advantage of Method B:
* The recipe manual (**The Instruction Binary**) was **NEVER MODIFIED**! The text `+20 feet` stayed $100\%$ identical!
* The food truck can park at #100, #500, or in a completely different country, and the chef locates the cheese instantly in 1 second!

This mobile food truck is the exact physical analogue of **Position-Independent Code (PIC) and PC-Relative Addressing**:
* The food truck driver's seat is the **Program Counter ($PC$)**.
* The storage trailer is the **Read-Only Data Section (`.rodata`)**.
* The 20-foot tow bar distance is the **Signed Offset ($\Delta_{\text{PC}} = \text{Data} - \text{PC}$)**.
* Parking anywhere without changing the manual is **Position-Independent Execution**.

---

## Primitive 1: PC-Relative Addressing Mechanics

Now that we possess a clear intuitive mental model of mobile food trucks and relative tow bar distances, let us examine the formal engineering mechanics of **PC-Relative Addressing**.

> **PC-Relative Addressing** is a hardware addressing mode where the Effective Address ($EA$) of a memory operand or jump target is calculated by adding a signed immediate displacement offset ($Imm$) to the current value of the **Program Counter ($PC$)**.

```text
PC-RELATIVE EFFECTIVE ADDRESS CALCULATION DATAPATH

 Program Counter Register (PC) ──────────────► [ 64-Bit AGU Adder ] ──► Effective Address (EA)
 Signed Immediate Offset (SignExtend(Imm)) ──► [    (CLA Adder)   ]     (Sent to L1 Cache)
```

---

### The Mathematical Effective Address ($EA$) Formula

The mathematical equation executed by hardware during PC-Relative address resolution is:

$$\mathbf{EA = \text{PC} + \text{SignExtend}(Imm)}$$

Where:
* $EA$ is the calculated 64-bit Effective Address of the target data or instruction in memory.
* $\text{PC}$ is the 64-bit physical or virtual memory address of the instruction currently being executed.
* $\text{SignExtend}(Imm)$ is the signed immediate displacement offset embedded inside the instruction word.

---

### Why the Relative Distance ($\Delta_{\text{PC}}$) Remains Constant Under Relocation

Why does PC-Relative addressing guarantee that binary code works regardless of where the operating system loads it in memory?

Let $A_{\text{code}}$ be the memory address of a load instruction in the code section (`.text`).
Let $A_{\text{data}}$ be the memory address of a global variable in the data section (`.rodata`).

When the compiler compiles the program, it arranges the `.text` section and `.rodata` section into a single contiguous binary file image. 

The relative byte distance $\Delta_{\text{PC}}$ between the instruction and the variable is:

$$\Delta_{\text{PC}} = A_{\text{data}} - A_{\text{code}}$$

Now, suppose the operating system loads the binary into memory starting at a random ASLR base address $B_{\text{ASLR}}$:

$$A_{\text{code,runtime}} = B_{\text{ASLR}} + A_{\text{code}}$$

$$A_{\text{data,runtime}} = B_{\text{ASLR}} + A_{\text{data}}$$

Now, let us calculate the runtime Effective Address using PC-Relative addressing ($\text{PC} = A_{\text{code,runtime}}$):

$$EA_{\text{runtime}} = \text{PC} + \Delta_{\text{PC}}$$

$$EA_{\text{runtime}} = (B_{\text{ASLR}} + A_{\text{code}}) + (A_{\text{data}} - A_{\text{code}})$$

$$EA_{\text{runtime}} = B_{\text{ASLR}} + A_{\text{code}} - A_{\text{code}} + A_{\text{data}}$$

$$\mathbf{EA_{\text{runtime}} = B_{\text{ASLR}} + A_{\text{data}} = A_{\text{data,runtime}}}$$

Look at the mathematical cancellation:
The ASLR base address $B_{\text{ASLR}}$ cancels out completely! 

Regardless of the value of $B_{\text{ASLR}}$ ($0x00400000$ or $0x7FFF0000$), **the calculated Effective Address $EA_{\text{runtime}}$ ALWAYS points to the exact physical location of the variable in RAM**!

---

## Primitive 2: Position-Independent Code (PIC) Architecture

Now let us examine the second core primitive: **Position-Independent Code (PIC)**.

> **Position-Independent Code (PIC)** (and **Position-Independent Executables / PIE**) is a software compilation model where all data references, function calls, and branch jumps are encoded using relative offsets ($\Delta_{\text{PC}}$) from the Program Counter ($PC$), allowing the binary machine code to be loaded and executed at any arbitrary memory address without requiring runtime code modifications.

```text
POSITION-INDEPENDENT CODE (PIC) VS POSITION-DEPENDENT CODE

 Position-Dependent Code (Absolute Addressing):
 Instruction: lw x10, [0x00402040]  ──► Hardcoded 64-bit Address
 (Fails if relocated! Cannot share code pages between processes!)

 Position-Independent Code (PC-Relative Addressing):
 Instruction: auipc x10, 0x00002    ──► Relative Offset Delta = +8,256 Bytes
              lw    x10, 64(x10)
 (Works at ANY memory address! Shared code pages used by 1,000 processes!)
```

---

### The Two Major Benefits of Position-Independent Code (PIC)

#### 1. Security via ASLR (Address Space Layout Randomization)
Without PIC, operating systems cannot randomize the code section of executable binaries. Attackers exploiting memory bugs can predict the exact addresses of sensitive functions (such as `system()` or `execve()`).

With PIE/PIC enabled, the OS kernel randomizes the base address $B_{\text{ASLR}}$ on every execution, rendering hardcoded return-oriented programming (ROP) exploits completely useless!

#### 2. RAM Savings via Shared Dynamic Libraries (`.so` / `.dll`)
Consider the standard C library (`libc.so`), which is used by almost every running application on a server (e.g., 500 concurrent processes).

* **Without PIC**: Each of the 500 processes would require a uniquely relocated copy of `libc.so` in RAM, consuming $500 \times 2\text{ MB} = \mathbf{1,000 \text{ Megabytes of RAM}}$!
* **With PIC**: All 500 processes share **ONE SINGLE physical 2-MB copy of `libc.so` in RAM**! Process 1 maps `libc.so` at `0x7FFF0000`, while Process 2 maps it at `0x00040000`. Because the machine code uses PC-Relative addressing, the exact same physical instruction bytes serve all 500 processes simultaneously, saving Gigabytes of RAM!

---

## Synthesizing 32-Bit PC-Relative Addresses: `auipc` + `lw` / `ld`

In 32-bit RISC architectures (such as RISC-V), a single instruction word can hold only a 12-bit immediate displacement field ($\pm 2,048\text{ bytes}$).

What happens if a global variable in the `.rodata` section sits **$500\text{ Kilobytes}$ away** from the load instruction in the `.text` section?

A 12-bit immediate field cannot hold a $500\text{-KB}$ displacement ($500\text{ KB} > 2\text{ KB}$)!

To reach data located anywhere within a **$\pm 2\text{-Gigabyte}$ window ($\pm 2^{31}\text{ bytes}$)** of the current $PC$, the compiler synthesizes a 2-instruction PC-Relative sequence using **`auipc` (Add Upper Immediate to PC)** paired with **`lw` or `ld`**:

```riscv
# SYNTHESIZING 32-BIT PC-RELATIVE DATA ACCESS (2 INSTRUCTIONS)

auipc x10, %pcrel_hi(global_var)  # 1. x10 <= PC + (Upper 20 Bits of Delta << 12)
lw    x11, %pcrel_lo(label)(x10)  # 2. x11 <= memory[x10 + Lower 12 Bits of Delta]
```

```text
2-INSTRUCTION PC-RELATIVE ADDRESS SYNTHESIS

 Step 1: auipc x10, Upper20 ──► Adds (Upper 20 Bits << 12) to current PC
                                 Stores partial 32-bit address in x10
                                 │
                                 ▼
 Step 2: lw x11, Lower12(x10)──► Adds signed Lower 12 Bits offset to x10
                                 Calculates FINAL Effective Address EA!
                                 Reads L1 Data Cache!
```

Let's trace how these two instructions cooperate in physical hardware:

1. **Instruction 1 (`auipc x10, Upper20`)**:
   * The `auipc` instruction reads the current Program Counter ($PC$).
   * It takes the 20-bit upper immediate field, shifts it left by 12 bits ($Imm20 \ll 12$), and adds it to $PC$:
     $$x10 \Leftarrow PC + (Imm20 \ll 12)$$
   * Register `x10` now holds the high 20 bits of the target memory address!
2. **Instruction 2 (`lw x11, Lower12(x10)`)**:
   * The `lw` instruction uses Base-Displacement mode, using `x10` as its base register.
   * It adds the 12-bit signed immediate lower offset ($Imm12$) to `x10`:
     $$EA = \text{RegisterFile}[x10] + \text{SignExtend}(Imm12)$$
   * The resulting Effective Address $EA$ points to the exact physical byte location of `global_var`!

---

### The Negative Sign-Extension Offset Compensation in `auipc`

Now we encounter a critical assembly engineering hazard: **The Lower Immediate Sign-Extension Offset Compensation**.

Recall that the lower 12-bit immediate field inside the `lw` instruction is a **signed Two's Complement number**.

If Bit 11 of the lower 12-bit offset is **`1`**, the `lw` instruction will interpret the lower 12 bits as a **negative number** (ranging from $-1 \text{ to } -2,048$)!

Watch what happens if the assembler does not compensate for this negative sign extension:

Suppose the relative distance between $PC$ and `global_var` is $\Delta_{\text{PC}} = \text{0x00100800}$ ($+1,050,624_{10}\text{ bytes}$).
* Upper 20 bits: `0x00100`
* Lower 12 bits: `0x800` (Binary `100000000000_2` $\implies$ Bit 11 is $1$!).

If the assembler naively emits `auipc x10, 0x00100` followed by `lw x11, 0x800(x10)`:
1. `auipc` calculates: $x10 \Leftarrow PC + \text{0x00100000}$.
2. `lw` sign-extends `0x800` to `0xFFFFFFFF_FFFFF800` ($-2,048_{10}$).
3. `lw` calculates $EA = (PC + \text{0x00100000}) - 2,048 = \mathbf{PC + \text{0x000FF800}}$!
4. **WRONG ADDRESS!** The target address was $PC + \text{0x00100800}$, but the calculated address was $PC + \text{0x000FF800}$ (off by $4,096\text{ bytes}$)!

#### The Assembler Solution (Upper Immediate Compensation Rule):
Whenever Bit 11 of the lower 12-bit offset is **`1`**, the assembler or compiler **automatically adds $+1$ to the upper 20-bit immediate in the `auipc` instruction**:

$$\text{If Bit 11 of Lower 12 Bits == 1} \implies \mathbf{Imm20_{\text{auipc}} \Leftarrow Imm20 + 1}$$

```riscv
# CORRECTED ASSEMBLY SEQUENCE WITH SIGN-EXTENSION COMPENSATION

auipc x10, 0x00101       # Upper immediate incremented by +1 (0x00100 + 1 = 0x00101)
lw    x11, -2048(x10)    # Lower 12 bits = 0x800 (-2048)
```

$$\text{Calculation: } PC + \text{0x00101000} + (-2,048_{10}) = PC + \text{0x00101000} - \text{0x00001000} = \mathbf{PC + \text{0x00100800}}$$

The hardware addition produces the exact intended target address $PC + \text{0x00100800}$!

---

## Real-World Silicon Engineering: ELF Relocation Types (`R_RISCV_PCREL_HI20`) and Linker Mechanics

When a programmer compiles C or Rust source code into Position-Independent Code (`gcc -fPIC -c main.c`), the compiler produces an un-linked object file (`main.o`).

At compile time, the compiler does not know the final distance between the code section (`.text`) and the data section (`.rodata`), because the linker hasn't assembled the final binary layout yet!

To defer address calculation to the linker, the assembler emits **ELF Relocation Records**:

```text
ELF OBJECT FILE RELOCATION RECORDS (.o)

 Instruction Stream in .text Section:
 0x0000: auipc x10, 0       ──► [ Relocation Tag: R_RISCV_PCREL_HI20 -> global_var ]
 0x0004: lw    x11, 0(x10)  ──► [ Relocation Tag: R_RISCV_PCREL_LO12_I -> label ]
```

### The Two Core PC-Relative Relocation Types:

1. **`R_RISCV_PCREL_HI20`**:
   * Commands the linker: *"Calculate the final 64-bit byte distance $\Delta_{\text{PC}} = \text{global\_var} - PC$. Extract the upper 20 bits (applying $+1$ compensation if bit 11 is 1), and patch those 20 bits into the `auipc` instruction at offset `0x0000`!"*
2. **`R_RISCV_PCREL_LO12_I`**:
   * Commands the linker: *"Extract the lower 12 bits of $\Delta_{\text{PC}}$, and patch those 12 bits into the immediate field of the `lw` instruction at offset `0x0004`!"*

When the linker runs (`ld`), it calculates the exact relative offset, patches the instruction bytes in `main.o`, and produces a $100\%$ position-independent executable ready for ASLR execution!

---

## Solved Industrial Engineering Exercise: Quantitative PC-Relative Address Resolution, `auipc` Compensation, and ASLR Relocation Verification

To consolidate your complete mastery of PC-Relative data addressing, Position-Independent Code (PIC), `auipc` upper immediate compensation, and ASLR base address invariance, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect verifying the Position-Independent Executable (PIE) execution path for a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

A software application is launched twice under Address Space Layout Randomization (ASLR):

* **Run 1 (ASLR Base 1)**: Operating system loads code section at $PC_{\text{Run1}} = \text{0x0000\_0000\_0040\_1000}$.
* **Run 2 (ASLR Base 2 - Relocated!)**: Operating system randomizes base address and loads code section at $PC_{\text{Run2}} = \text{0x0000\_7FFF\_F000\_0000}$.

```text
3.2 GHz PROCESSOR PC-RELATIVE ADDRESS RESOLUTION

 CPU Core (3.2 GHz) ──► [ auipc + lw Decoder ] ──► [ 64-Bit AGU Adder ] ──► L1 Data Cache
 Clock T = 312.5 ps     2-Instruction Sequence     Calculates EA         Hit = 1 Cycle
```

#### Memory Layout Specifications:
* Target global constant `device_signature` is stored in the `.rodata` section.
* The relative byte distance between the `auipc` instruction and `device_signature` is:

$$\Delta_{\text{PC}} = \text{Address}_{\text{device\_signature}} - \text{PC} = +1,048,640_{10} \text{ bytes } (\mathbf{\text{0x00100040}_{16}})$$

* L1 Data Cache Hit Latency = $1\text{ clock cycle}$ ($312.5\text{ ps}$).

#### Your Objective

1. Calculate the exact physical memory address of `device_signature` for **Run 1** ($PC = \text{0x00401000}$) and **Run 2** ($PC = \text{0x7FFF00000000}$).
2. Perform the 2-instruction PC-relative immediate synthesis (`auipc` + `lw`):
   * Extract lower 12 bits and upper 20 bits of $\Delta_{\text{PC}} = \text{0x00100040}$.
   * Evaluate Bit 11 and determine if upper immediate $+1$ compensation is required.
   * Write the exact symbolic assembly instructions and raw 32-bit hexadecimal machine code words for `auipc` and `lw`.
3. Prove mathematically that the generated machine code bytes are **$100\%$ IDENTICAL in both Run 1 and Run 2**, verifying position-independent execution.
4. Calculate AGU path propagation delay and verify static timing slack within the $312.5\text{-ps}$ clock period budget.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Calculate Physical Memory Addresses for Run 1 and Run 2

Relative distance $\Delta_{\text{PC}} = +1,048,640_{10} = \text{0x00100040}_{16}$.

##### 1. Run 1 Physical Target Address ($PC_{\text{Run1}} = \text{0x0000\_0000\_0040\_1000}$):

$$\text{Target}_{\text{Run1}} = PC_{\text{Run1}} + \Delta_{\text{PC}} = \text{0x0000\_0000\_0040\_1000} + \text{0x0000\_0000\_0010\_0040}$$

$$\mathbf{\text{Target}_{\text{Run1}} = \text{0x0000\_0000\_0050\_1040}}$$

##### 2. Run 2 Physical Target Address ($PC_{\text{Run2}} = \text{0x0000\_7FFF\_F000\_0000}$):

$$\text{Target}_{\text{Run2}} = PC_{\text{Run2}} + \Delta_{\text{PC}} = \text{0x0000\_7FFF\_F000\_0000} + \text{0x0000\_0000\_0010\_0040}$$

$$\mathbf{\text{Target}_{\text{Run2}} = \text{0x0000\_7FFF\_F010\_0040}}$$

---

#### Step 2: Synthesize `auipc` + `lw` Immediate Fields and Compensation

Target relative displacement $\Delta_{\text{PC}} = \text{0x00100040}$.

##### 1. Extract Lower 12 Bits:
$$\text{Lower 12 Bits} = \Delta_{\text{PC}}[11:0] = \text{0x040}_{16} = \mathbf{+64_{10}}$$

* Check Bit 11 of Lower 12 Bits (`0x040` = `0000_0100_0000_2`):
  * Bit 11 is **`0`**!
  * Since Bit 11 is `0`, sign extension will treat $+64$ as a positive number.
  * **No Upper Immediate $+1$ Compensation Required!**

##### 2. Extract Upper 20 Bits:
$$\text{Upper 20 Bits} = \Delta_{\text{PC}}[31:12] = \mathbf{\text{0x00100}_{16}}$$

##### 3. Synthesize Assembly Instruction Sequence:

```riscv
auipc x10, 0x00100       # x10 <= PC + (0x00100 << 12) = PC + 0x00100000
lw    x11, 64(x10)       # x11 <= memory[x10 + 64] = memory[PC + 0x00100040]
```

##### 4. Encode Raw 32-Bit Hexadecimal Machine Words:

* **Instruction 1 (`auipc x10, 0x00100`)**:
  * `opcode = 0x17` (`0010111_2`), `rd = 10` (`01010_2`), `imm[31:12] = 0x00100` (`00000000000100000000_2`).
  * Binary: `0000_0000_0001_0000_0000_0101_0001_0111_2`
  * **Raw Hex Word**: $\mathbf{\text{0x00100517}}$

* **Instruction 2 (`lw x11, 64(x10)`)**:
  * `opcode = 0x03` (`0000011_2`), `rd = 11` (`01011_2`), `funct3 = 2` (`010_2`), `rs1 = 10` (`01010_2`), `imm[11:0] = 64` (`000001000000_2`).
  * Binary: `0000_0100_0000_0101_0010_0101_1000_0011_2`
  * **Raw Hex Word**: $\mathbf{\text{0x04052583}}$

---

#### Step 3: Prove Position-Independent Execution (ASLR Invariance)

Let us evaluate the hardware Effective Address ($EA$) generated during Run 1 and Run 2 using the **EXACT SAME machine code words (`0x00100517` and `0x04052583`)**:

##### Run 1 Verification ($PC_{\text{Run1}} = \text{0x00401000}$):
1. `auipc x10, 0x00100` executes:
   $$x10 \Leftarrow \text{0x00401000} + (\text{0x00100} \ll 12) = \text{0x00401000} + \text{0x00100000} = \text{0x00501000}$$
2. `lw x11, 64(x10)` executes:
   $$EA_{\text{Run1}} = x10 + 64 = \text{0x00501000} + \text{0x40} = \mathbf{\text{0x00501040}}$$
   * **Matches $\text{Target}_{\text{Run1}}$ ($\text{0x00501040}$) with $100\%$ precision!**

##### Run 2 Verification ($PC_{\text{Run2}} = \text{0x7FFF00000000}$):
1. `auipc x10, 0x00100` executes:
   $$x10 \Leftarrow \text{0x7FFF00000000} + (\text{0x00100} \ll 12) = \text{0x7FFF00000000} + \text{0x00100000} = \text{0x7FFF00100000}$$
2. `lw x11, 64(x10)` executes:
   $$EA_{\text{Run2}} = x10 + 64 = \text{0x7FFF00100000} + \text{0x40} = \mathbf{\text{0x7FFF00100040}}$$
   * **Matches $\text{Target}_{\text{Run2}}$ ($\text{0x7FFF00100040}$) with $100\%$ precision!**

```text
ASLR POSITION-INDEPENDENT EXECUTION PROOF

 Machine Code Words Executed : 0x00100517 followed by 0x04052583 (100% IDENTICAL!)

 Run 1 (Loaded at 0x00401000) ──► Resolved EA = 0x00501040 (Target Matched!)
 Run 2 (Loaded at 0x7FFF0000) ──► Resolved EA = 0x7FFF01000040 (Target Matched!)
 (Zero instruction bytes modified by OS loader! Perfect Position Independence!)
```

---

#### Step 4: AGU Timing Closure Verification

Let us evaluate the signal propagation delay along the 2-instruction PC-Relative execution path:

Given:
* $PC$ Register Read Output Delay: $t_{\text{PC\_read}} = 25.0\text{ ps}$
* `auipc` Upper Immediate Shift & Add Delay: $t_{\text{auipc\_add}} = 110.0\text{ ps}$
* `lw` AGU Base-Displacement Adder Delay: $t_{\text{AGU\_add}} = 110.0\text{ ps}$
* L1 Cache Tag Query Setup Time: $t_{\text{L1\_setup}} = 25.0\text{ ps}$

##### Cycle 1 (`auipc` Execution):
$$t_{\text{cycle1}} = t_{\text{PC\_read}} + t_{\text{auipc\_add}} + t_{\text{setup}} = 25.0\text{ ps} + 110.0\text{ ps} + 20.0\text{ ps} = \mathbf{155.0 \text{ picoseconds}}$$

$$\text{Timing Slack Cycle 1} = 312.5\text{ ps} - 155.0\text{ ps} = \mathbf{+157.5 \text{ picoseconds}}$$

##### Cycle 2 (`lw` Execution):
$$t_{\text{cycle2}} = t_{\text{RegRead}} + t_{\text{AGU\_add}} + t_{\text{L1\_setup}} = 30.0\text{ ps} + 110.0\text{ ps} + 25.0\text{ ps} = \mathbf{165.0 \text{ picoseconds}}$$

$$\text{Timing Slack Cycle 2} = 312.5\text{ ps} - 165.0\text{ ps} = \mathbf{+147.5 \text{ picoseconds}}$$

##### Timing Closure Result:
Both instructions complete their calculations well within the $312.5\text{-ps}$ clock period budget, maintaining large positive timing slack margins ($+157.5\text{ ps}$ and $+147.5\text{ ps}$).

PC-Relative data address resolution operates at full $3.2\text{-GHz}$ execution speed!

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results:

1. **PC-Relative Offset Invariance Check**:
   * $\Delta_{\text{PC}} = +1,048,640 = \text{0x00100040}$.
   * Run 1: $\text{0x00501040} - \text{0x00401000} = \text{0x00100040}$. Correct!
   * Run 2: $\text{0x7FFF00100040} - \text{0x7FFF00000000} = \text{0x00100040}$. Correct!
2. **Machine Code Invariance Verification**:
   * Machine words `0x00100517` and `0x04052583` were executed in both Run 1 and Run 2 without changing a single bit.
   * Proves $100\%$ Position-Independent Code (PIC) compliance!
3. **Sign-Extension Compensation Check**:
   * Lower 12-bit immediate $= \text{0x040} = +64_{10}$ (Bit 11 is $0$).
   * No upper immediate $+1$ compensation was required.
   * $\text{0x00100000} + 64 = \text{0x00100040}$. Math verified to exact decimal!

All PC-relative address derivations, ASLR relocation proofs, machine code encodings, and AGU timing slack metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **PC-Relative Addressing**: The hardware addressing mode ($\mathbf{EA = \text{PC} + \text{SignExtend}(Imm)}$) that calculates memory target addresses by adding a signed immediate displacement offset ($Imm$) to the current Program Counter ($PC$), insulating address resolution from binary relocation.
* **Position-Independent Code (PIC)**: The software compilation model where all data references and control flow jumps are encoded using relative offsets ($\Delta_{\text{PC}}$) from the Program Counter ($PC$), allowing machine binaries to be loaded at any arbitrary address in RAM under ASLR without requiring runtime instruction modifications.
