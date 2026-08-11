---
title: "PC-Relative Data Addressing and Position-Independent Code (PIC) Mechanics"
---

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


## Primitive 1: PC-Relative Addressing Mechanics

Now that we possess a clear intuitive mental model of mobile food trucks and relative tow bar distances, let us examine the formal engineering mechanics of **PC-Relative Addressing**.

> **PC-Relative Addressing** is a hardware addressing mode where the Effective Address ($EA$) of a memory operand or jump target is calculated by adding a signed immediate displacement offset ($Imm$) to the current value of the **Program Counter ($PC$)**.

```text
PC-RELATIVE EFFECTIVE ADDRESS CALCULATION DATAPATH

 Program Counter Register (PC) ──────────────► [ 64-Bit AGU Adder ] ──► Effective Address (EA)
 Signed Immediate Offset (SignExtend(Imm)) ──► [    (CLA Adder)   ]     (Sent to L1 Cache)
```


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


### The Two Major Benefits of Position-Independent Code (PIC)

#### 1. Security via ASLR (Address Space Layout Randomization)
Without PIC, operating systems cannot randomize the code section of executable binaries. Attackers exploiting memory bugs can predict the exact addresses of sensitive functions (such as `system()` or `execve()`).

With PIE/PIC enabled, the OS kernel randomizes the base address $B_{\text{ASLR}}$ on every execution, rendering hardcoded return-oriented programming (ROP) exploits completely useless!

#### 2. RAM Savings via Shared Dynamic Libraries (`.so` / `.dll`)
Consider the standard C library (`libc.so`), which is used by almost every running application on a server (e.g., 500 concurrent processes).

* **Without PIC**: Each of the 500 processes would require a uniquely relocated copy of `libc.so` in RAM, consuming $500 \times 2\text{ MB} = \mathbf{1,000 \text{ Megabytes of RAM}}$!
* **With PIC**: All 500 processes share **ONE SINGLE physical 2-MB copy of `libc.so` in RAM**! Process 1 maps `libc.so` at `0x7FFF0000`, while Process 2 maps it at `0x00040000`. Because the machine code uses PC-Relative addressing, the exact same physical instruction bytes serve all 500 processes simultaneously, saving Gigabytes of RAM!


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


## Solved Industrial Engineering Exercise: Quantitative PC-Relative Address Resolution, `auipc` Compensation, and ASLR Relocation Verification

To consolidate your complete mastery of PC-Relative data addressing, Position-Independent Code (PIC), `auipc` upper immediate compensation, and ASLR base address invariance, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation


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


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **PC-Relative Addressing**: The hardware addressing mode ($\mathbf{EA = \text{PC} + \text{SignExtend}(Imm)}$) that calculates memory target addresses by adding a signed immediate displacement offset ($Imm$) to the current Program Counter ($PC$), insulating address resolution from binary relocation.
* **Position-Independent Code (PIC)**: The software compilation model where all data references and control flow jumps are encoded using relative offsets ($\Delta_{\text{PC}}$) from the Program Counter ($PC$), allowing machine binaries to be loaded at any arbitrary address in RAM under ASLR without requiring runtime instruction modifications.
