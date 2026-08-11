content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/01-simd-vector-architectures/03-vector-strided-memory-access/01-vector-strided-memory-access.md
# Vector Strided Memory Access Architecture and Stride Generator Mechanics

## The Non-Contiguous Stride Bottleneck and Matrix Column Traversal Friction

In vector processor architectures, high-throughput memory streaming relies on loading large blocks of data from main memory into wide vector registers. When data elements sit side-by-side in contiguous physical memory addresses—such as a 1D array of 32-bit floating-point numbers stored at addresses `0x1000`, `0x1004`, `0x1008`, `0x100C`—the memory subsystem executes a **Unit-Stride Vector Load** (`vle32.v`). Because all data elements reside within consecutive memory bytes, a single 64-byte cache line fill from Dynamic Random-Access Memory (DRAM) retrieves sixteen 32-bit data elements in a single high-speed burst transaction. The entire 512-bit vector register is populated in 1 clock cycle.

However, real-world computational algorithms rarely store all required data in simple, contiguous 1D memory blocks.

Consider three fundamental data structures found in scientific computing, graphics rendering, machine learning, and signal processing:

### 1. 2D Matrix Column Traversal (Row-Major Storage)
In programming languages like C, C++, and Rust, two-dimensional matrices are allocated in **Row-Major Memory Order**. Elements of the same row sit adjacent to each other in memory, but elements of the same column are separated by the full byte width of an entire matrix row:

```text
ROW-MAJOR MATRIX MEMORY LAYOUT AND COLUMN TRAVERSAL

 2D Matrix (4 Rows x 4 Columns of 32-Bit Floats)
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ Row 0, Col 0 │ Row 0, Col 1 │ Row 0, Col 2 │ Row 0, Col 3 │  ◄── Row 0 (Contiguous 16 Bytes)
 ├──────────────┼──────────────┼──────────────┼──────────────┤
 │ Row 1, Col 0 │ Row 1, Col 1 │ Row 1, Col 2 │ Row 1, Col 3 │  ◄── Row 1 (Contiguous 16 Bytes)
 └──────────────┴──────────────┴──────────────┴──────────────┘

 Memory Address Stream for Column 1 Traversal:
 Element 0: Row 0, Col 1 ──► Address 0x1004
 Element 1: Row 1, Col 1 ──► Address 0x1014 (Address 0x1004 + 16 Bytes Stride!)
 Element 2: Row 2, Col 1 ──► Address 0x1024 (Address 0x1014 + 16 Bytes Stride!)
 Element 3: Row 3, Col 1 ──► Address 0x1034 (Address 0x1024 + 16 Bytes Stride!)
```

When an algorithm processes a matrix column (e.g., during matrix multiplication or Gaussian elimination), it must read `[Row 0, Col 1]`, `[Row 1, Col 1]`, `[Row 2, Col 1]`, and `[Row 3, Col 1]`. The byte distance between adjacent column elements is the **Row Stride ($S = \text{Columns} \times \text{Element\_Size}$)**. The required data elements do NOT sit side-by-side!

---

### 2. Interleaved Audio and Image Color Channels (Array of Structures / AoS)
In digital image processing, color images are frequently stored as interleaved RGB pixels: `[R0, G0, B0, R1, G1, B1, R2, G2, B2...]`. 

To process only the Red color channel ($R_0, R_1, R_2 \dots$), an image filter must read every 3rd byte in memory. The byte stride between consecutive Red pixel bytes is $S = 3\text{ bytes}$ (or $S = 4\text{ bytes}$ for RGBA images).

---

### 3. Complex Number Arithmetic
In Fast Fourier Transforms (FFT) and wireless signal processing, complex numbers are stored as paired real and imaginary floats: `[Real0, Imag0, Real1, Imag1, Real2, Imag2...]`. 

To process only the Real components, the memory stride between consecutive real numbers is $S = 2 \times 4\text{ bytes} = 8\text{ bytes}$.

---

### The Scalar Extraction Bottleneck

If a vector processor lacks specialized strided memory hardware, software is forced to fall back on a **Scalar Extraction Loop** to gather non-contiguous data elements into a vector register:

```text
SCALAR EXTRACTION LOOP FOR STRIDED DATA (NO HARDWARE STRIDE SUPPORT)

 Iteration 0 : Read Scalar 0x1004 ──► Insert into Vector Register V1[0]
 Iteration 1 : Add Stride (+16B)  ──► Read Scalar 0x1014 ──► Insert into V1[1]
 Iteration 2 : Add Stride (+16B)  ──► Read Scalar 0x1024 ──► Insert into V1[2]
 Iteration 3 : Add Stride (+16B)  ──► Read Scalar 0x1034 ──► Insert into V1[3]
 (Paid 16 sequential instruction cycles to fill ONE vector register!)
```

Look at the catastrophic performance failure of this scalar loop:
* To populate a 16-element vector register with strided data, the CPU must execute **16 individual scalar load instructions**, **16 pointer increment instructions**, and **16 vector element insertion instructions**!
* Filling one vector register takes **48 sequential instruction cycles**!
* The vector execution pipeline sits completely frozen, waiting 48 cycles just to assemble the input vector before it can execute a single vector arithmetic instruction.

How can a vector processor load non-contiguous memory elements separated by a constant byte stride $S$ directly into a vector register in a single instruction, calculating all target addresses in parallel without falling back on scalar loops?

To solve this problem, vector architectures implement **Vector Strided Memory Access** supported by a dedicated hardware **Stride Generator Engine**.

---

## The Multi-Block Mail Carrier and the Stride GPS: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of vector strided memory access, address generation units, and cache line splitting before inspecting hardware pipeline schematics and bitwise address equations, let us consider an everyday analogy: **The Mail Carrier on a Wide Avenue**.

Imagine a mail carrier (**The Vector Memory Controller**) tasked with delivering 16 letters (**16 Vector Data Elements**) to houses along a long avenue (**Physical Memory Space**).

```text
THE MAIL CARRIER AVENUE ANALOGY

 Scenario A: Unit-Stride Delivery (Contiguous Sidewalk Walk)
 ┌─────────────────────────────────────────────────────────────┐
 │ Houses 1, 2, 3, 4, 5, 6, 7, 8 sit side-by-side on 1 block.  │
 │ Carrier drops all 8 letters in 1 quick walk down the block! │
 └─────────────────────────────────────────────────────────────┘

 Scenario B: Strided Delivery (Every 4th House)
 ┌─────────────────────────────────────────────────────────────┐
 │ Carrier must deliver to House 1, House 5, House 9, House 13.│
 │ Houses sit on DIFFERENT street blocks across the city!      │
 └─────────────────────────────────────────────────────────────┘
```

Each house address represents a memory byte address:
* **Unit-Stride Delivery**: The 16 letters are addressed to **House 1, House 2, House 3, ..., House 16** on the same block (**Contiguous Memory Line**). The mail carrier drops the entire bundle off in one quick walk down the sidewalk (**Single Cache Line Fill**).

Now, consider what happens when the mail carrier receives 16 letters addressed to **every 4th house** along the avenue (**House 1, House 5, House 9, House 13, House 17...**):

Let us observe two different operational strategies for how the mail carrier delivers these 16 strided letters:

---

### Strategy 1: The Manual Map Lookup Strategy (Scalar Load Loop)
1. The carrier walks to House 1, drops off Letter 1, and opens a paper map.
2. The carrier calculates: $1 + 4 = 5$. The carrier walks 4 blocks to House 5, drops off Letter 2, and opens the map again.
3. The carrier calculates: $5 + 4 = 9$. The carrier walks 4 blocks to House 9...
4. The carrier repeats this manual calculation 16 times in a row!

```text
MANUAL MAP LOOKUP STRATEGY (SLOW SCALAR LOOP)

 Walk to House 1 ──► Drop Letter 1 ──► Open Map (Calculate 1 + 4 = 5)
 Walk to House 5 ──► Drop Letter 2 ──► Open Map (Calculate 5 + 4 = 9)
 Walk to House 9 ──► Drop Letter 3 ──► Open Map (Calculate 9 + 4 = 13)
 (Spent 4 hours walking and calculating addresses one-by-one!)
```

Look at the waste of time:
The carrier spends $90\%$ of their day stopping, pulling out a paper map, and adding 4 to the previous house number! 

Deliveries take 4 hours for 16 letters.

---

### Strategy 2: The Stride GPS Dispatcher (Hardware Stride Generator)
The mail carrier installs an automated **Stride GPS Dispatcher** (**The Stride Generator Engine**) in their delivery truck.

Before leaving the post office, the carrier inputs two numbers into the Stride GPS:
* **Base Address**: `House 1` ($A_{\text{base}}$).
* **Stride Distance**: `+4 Houses` ($S$).

```text
STRIDE GPS DISPATCHER IN ACTION (VECTOR STRIDED LOAD)

 Input to Stride GPS: Base = House 1, Stride = +4 Houses
                       │
                       ▼
 Stride GPS calculates ALL 16 house addresses in 1 Second!
 [ House 1, House 5, House 9, House 13, House 17, House 21 ... ]
                       │
                       ▼
 16 Delivery Drones dispatched simultaneously across the city!
 (All 16 letters delivered concurrently in 1 single trip!)
```

Trace how Strategy 2 operates:
1. The Stride GPS takes `House 1` and `+4 Houses` and **instantly calculates all 16 target house addresses in parallel**:
   $$\text{Addresses} = [1, \ 5, \ 9, \ 13, \ 17, \ 21, \ 25, \ 29, \ 33, \ 37, \ 41, \ 45, \ 49, \ 53, \ 57, \ 61]$$
2. The mail truck dispatches 16 automated delivery drones (**Parallel Vector Memory Channels**) to all 16 calculated house addresses simultaneously!
3. All 16 letters are delivered concurrently in a single operation!

Notice what Strategy 2 achieved:
* **Zero Manual Calculation Delays**: The carrier did not stop 16 times to consult a paper map; the GPS calculated all target addresses in parallel.
* **Automatic Non-Contiguous Routing**: The system delivered data across different street blocks seamlessly.

This Stride GPS Dispatcher is the exact physical analogue of **Vector Strided Memory Access and the Stride Generator Engine**:
* The houses along the avenue are **Physical Memory Byte Addresses**.
* The 16 letters are **16 Vector Register Data Elements**.
* The stride distance (+4 houses) is the **Byte Stride Parameter ($S$)**.
* The manual map lookup is the **Scalar Loop Fallback**.
* The Stride GPS is the **Hardware Stride Generator (Strided AGU)**.
* Dispatching 16 drones simultaneously is **Vector Strided Memory Pipeline Execution**.

---

## Primitive 1: Vector Strided Memory Access (`vlse32.v` / `vsse32.v`)

Now that we possess a clear intuitive mental model of the Stride GPS dispatcher, let us examine the formal, rigorous engineering mechanics of **Vector Strided Memory Access**.

In a Vector Length-Agnostic ISA (such as the RISC-V Vector Extension or ARM SVE), vector memory instructions are divided into three distinct addressing modes:
1. **Unit-Stride Vector Access (`vle32.v`)**: $S = \text{Element\_Size}$ (Contiguous memory access).
2. **Strided Vector Access (`vlse32.v`)**: $S = \text{Arbitrary Byte Stride}$ (Non-contiguous, constant-offset access).
3. **Indexed Vector Access (`vluxei32.v`)**: $S = \text{Scatter-Gather Vector Offsets}$ (Random indirect pointer access).

> **Vector Strided Memory Access** is a hardware addressing mode where a single vector instruction reads or writes $vl$ vector elements between memory and a vector register, where element $i$ ($0 \le i < vl$) is located at physical byte address $A_i = A_{\text{base}} + (i \cdot S)$, where $S$ is a signed scalar byte stride parameter.

```text
VECTOR STRIDED LOAD INSTRUCTION ASSEMBLY INTERFACE

 RISC-V Assembly Syntax: vlse32.v  vd,  (rs1),  rs2,  vm
                          │         │     │      │     │
                          │         │     │      │     └── Predicate Mask
                          │         │     │      └────── Scalar Reg rs2 (Byte Stride S)
                          │         │     └───────────── Scalar Reg rs1 (Base Address A_base)
                          │         └────────────────── Destination Vector Register vd
                          └──────────────────────────── Vector Load Strided 32-Bit
```

---

### The Mathematical Strided Address Equation

Let $A_{\text{base}}$ be the base physical byte address supplied in scalar register `rs1`.

Let $S$ be the signed byte stride value supplied in scalar register `rs2`. $S$ can be positive ($S > 0$), negative ($S < 0$), or zero ($S = 0$).

Let $vl$ be the active vector length register ($0 \le i < vl$).

For any element index $i$ within the vector register, the target physical byte address $A_i$ generated by the memory subsystem is:

$$\mathbf{A_i = A_{\text{base}} + (i \cdot S)}$$

Where:
* $A_i$ is the physical byte address of element $i$.
* $A_{\text{base}}$ is the starting base memory address (e.g., `0x1000`).
* $i$ is the element position index ($0 \le i < vl$).
* $S$ is the signed byte stride integer value (e.g., $+16\text{ bytes}, -8\text{ bytes}, \text{or } 0\text{ bytes}$).

```text
ELEMENT ADDRESS GENERATION FOR VARIOUS STRIDE VALUES (BASE = 0x1000, 4 ELEMENTS)

 Stride Value (S)   │ Element 0 (i=0) │ Element 1 (i=1) │ Element 2 (i=2) │ Element 3 (i=3)
────────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────
 Positive (+16 Bytes)│  0x1000         │  0x1010         │  0x1020         │  0x1030
 Negative (-8 Bytes) │  0x1000         │  0x0FF8         │  0x0FF0         │  0x0FE8
 Zero     (0 Bytes)  │  0x1000         │  0x1000         │  0x1000         │  0x1000
```

Notice the special case when **$S = 0$ (Zero-Stride Broadcast Load)**:
When $S = 0$, $A_i = A_{\text{base}} + (i \cdot 0) = A_{\text{base}}$ for all elements $i$. 

The instruction reads a single scalar value from address $A_{\text{base}}$ once and **broadcasts it to all $vl$ elements** of destination register $V_D$ in a single instruction!

---

## Primitive 2: The Stride Generator Engine (Strided AGU Array)

Now let us examine the internal physical hardware module that calculates these $A_i = A_{\text{base}} + (i \cdot S)$ addresses in parallel: **The Stride Generator Engine**.

The **Stride Generator Engine** (or **Strided Address Generation Unit Array**) is a parallel arithmetic circuit built into the Vector Memory Subsystem.

```text
STRIDE GENERATOR ENGINE HARDWARE ARCHITECTURE

 Base Address A_base [63:0]               Byte Stride S [63:0]
          │                                        │
          ├────────────────────────────────────────┼────────────────────────┐
          │                                        ▼                        │
          │                        ┌──────────────────────────┐             │
          │                        │ Stride Multiplier Array  │             │
          │                        │ Generates: 0*S, 1*S, 2*S │             │
          │                        └───────────┬──────────────┘             │
          │                                    │                            │
          ▼                                    ▼                            ▼
 ┌─────────────────┐                  ┌─────────────────┐         ┌─────────────────┐
 │ Parallel AGU 0  │                  │ Parallel AGU 1  │   ...   │ Parallel AGU k  │
 │ A_base + (0*S)  │                  │ A_base + (1*S)  │         │ A_base + (k*S)  │
 └────────┬────────┘                  └────────┬────────┘         └────────┬────────┘
          │                                    │                           │
          ▼                                    ▼                           ▼
   Address A0 = 0x1000                  Address A1 = 0x1010         Address Ak = ...
```

---

### Hardware Parallel Multiply-Add AGU Array

To generate addresses for $N$ vector lanes simultaneously, the Stride Generator contains $N$ parallel **Address Generation Units (AGUs)** operating alongside a **Stride Multiplier Tree**:

1. **Stride Multiplier Tree**: Pre-computes the scalar multiples of the byte stride $S$:
   $$\text{Multiples} = [\ 0 \cdot S, \quad 1 \cdot S, \quad 2 \cdot S, \quad 3 \cdot S, \quad \dots \quad (vl-1) \cdot S \ ]$$
   * For power-of-two strides (e.g., $S = 16 = 2^4$), the multiplication $i \cdot S$ is executed with **zero logic gates** using binary left-shift wire routing ($i \ll 4$)!
2. **Parallel Adder Array**: Each lane $i$ contains a 64-bit adder that computes $A_i = A_{\text{base}} + (i \cdot S)$ in parallel within $1\text{ clock cycle}$.

---

### Cache Line Splitting and Un-Aligned Access De-serialization

Once the Stride Generator calculates the target physical addresses $A_0, A_1, \dots, A_{vl-1}$, how does the memory subsystem read the data from the cache hierarchy?

This brings us to the core physical difference between Unit-Stride loads and Strided loads:

* **Unit-Stride Load ($S = \text{Element\_Size}$)**: All $vl$ elements reside within 1 or 2 adjacent 64-byte cache lines. The cache controller fetches 1 or 2 cache lines from L1 SRAM, and the access completes in $1 \text{ to } 2\text{ clock cycles}$.
* **Strided Load ($S > 64\text{ Bytes}$)**: Every single element $i$ lands on a **completely different 64-byte cache line**!

```text
CACHE LINE SPLITTING IN WIDE-STRIDE VECTOR LOADS (S = 128 BYTES)

 Vector Load Strided: 4 Elements, Stride S = 128 Bytes
 Element 0 (Addr 0x1000) ──► Cache Line #0 (0x1000 .. 0x103F) ──► L1 SRAM Query 0
 Element 1 (Addr 0x1080) ──► Cache Line #2 (0x1080 .. 0x10BF) ──► L1 SRAM Query 1
 Element 2 (Addr 0x1100) ──► Cache Line #4 (0x1100 .. 0x113F) ──► L1 SRAM Query 2
 Element 3 (Addr 0x1180) ──► Cache Line #6 Granger (0x1180)   ──► L1 SRAM Query 3
 (The strided load splits into 4 independent cache line queries!)
```

#### The Cache Line Splitter Pipeline:
When a strided load targets addresses spanning $K$ different cache lines ($1 \le K \le vl$):
1. The **Cache Line Splitter** inside the vector memory unit inspects the $vl$ generated addresses $A_0 \dots A_{vl-1}$.
2. It groups elements that land within the same 64-byte cache line into shared cache query masks.
3. If elements land on $K$ distinct cache lines, the memory controller **de-serializes the access into $K$ sequential L1 cache queries**:
   * **Cycle 1**: Query L1 SRAM for Cache Line 0 (contains Element 0).
   * **Cycle 2**: Query L1 SRAM for Cache Line 2 (contains Element 1).
   * **Cycle 3**: Query L1 SRAM for Cache Line 4 (contains Element 2)...
4. As each cache line payload returns from L1 SRAM, an internal **Crossbar Permute Network** extracts the required element bytes at offset $A_i[5:0]$ and routes them into the correct lane slice of destination register $V_D$.

---

## Memory Bank Conflicts and Stride Degradation Mechanics

While the Stride Generator Engine can calculate 16 strided addresses in a single clock cycle, physical memory performance is constrained by **SRAM and DRAM Bank Conflicts**.

---

### What Is a Memory Bank Conflict?

In both on-chip L1 SRAM cache arrays and off-chip DRAM memory chips, memory storage is partitioned into $B$ independent physical memory arrays called **Banks** (e.g., $B = 8, 16, \text{or } 32\text{ Banks}$).

Each memory bank can service **only one memory request per clock cycle**:
* **Bank Hit (No Conflict)**: If 8 parallel memory accesses target 8 *different* memory banks ($\text{Bank}_0, \text{Bank}_1, \dots, \text{Bank}_7$), all 8 accesses complete in parallel in **$1\text{ clock cycle}$**.
* **Bank Conflict**: If 8 parallel memory accesses target the *exact same* memory bank, the bank controller cannot service them simultaneously! The 8 accesses are **serialized**, taking **8 consecutive clock cycles** ($8\times$ latency penalty!).

```text
PARALLEL BANK ACCESS VS BANK CONFLICT SERIALIZATION

 8 Parallel Accesses to 8 Different Banks (NO CONFLICT):
 Bank 0 [Addr 0] | Bank 1 [Addr 1] | Bank 2 [Addr 2] ... | Bank 7 [Addr 7]
 ◄────────────────────── Executed in 1 Clock Cycle! ──────────────────────►

 8 Parallel Accesses to the SAME Bank (BANK CONFLICT):
 Cycle 1 : Bank 0 Services Access 0
 Cycle 2 : Bank 0 Services Access 1
 Cycle 3 : Bank 0 Services Access 2 ... Cycle 8 : Bank 0 Services Access 7
 ◄───────────────────── Serialized over 8 Clock Cycles! ───────────────────►
```

---

### The Power-of-Two Stride Collision Math

In multi-bank memory systems, memory addresses are assigned to banks using modulo bank interleaving:

$$\text{Bank\_ID}(A) = \lfloor \frac{A}{W_{\text{bank\_word}}} \rfloor \pmod B$$

Where $B$ is the number of memory banks (a power of two, $B = 2^b$), and $W_{\text{bank\_word}}$ is the width of a bank word in bytes (typically 4 or 8 bytes).

Now, consider a strided vector load accessing elements with stride $S$:

$$\text{Bank\_ID}(A_i) = \text{Bank\_ID}(A_{\text{base}} + i \cdot S) = \left( \text{Bank\_ID}(A_{\text{base}}) + i \cdot \frac{S}{W_{\text{bank\_word}}} \right) \pmod B$$

#### The Great Stride Collision Theorem:
If the byte stride $S$ is an **exact power-of-two multiple of the bank count $B \times W_{\text{bank\_word}}$**:

$$\frac{S}{W_{\text{bank\_word}}} \pmod B == 0$$

Then **EVERY SINGLE VECTOR ELEMENT MAPS TO THE EXACT SAME MEMORY BANK!**

$$\text{Bank\_ID}(A_0) == \text{Bank\_ID}(A_1) == \text{Bank\_ID}(A_2) == \dots == \text{Bank\_ID}(A_{vl-1})$$

```text
POWER-OF-TWO STRIDE BANK COLLISION MAP (B = 8 BANKS, S = 32 BYTES)

 Element 0 (Addr 0x1000) ──► Bank_ID = (0x1000 / 4) % 8 = 0  ──► Bank 0
 Element 1 (Addr 0x1020) ──► Bank_ID = (0x1020 / 4) % 8 = 0  ──► Bank 0 (COLLISION!)
 Element 2 (Addr 0x1040) ──► Bank_ID = (0x1040 / 4) % 8 = 0  ──► Bank 0 (COLLISION!)
 Element 3 (Addr 0x1060) ──► Bank_ID = (0x1060 / 4) % 8 = 0  ──► Bank 0 (COLLISION!)
 (Banks 1 through 7 sit 100% IDLE, while Bank 0 is serialized over 8 cycles!)
```

Look at the hardware disaster:
When the byte stride $S$ is a power-of-two multiple of the bank size, **$100\%$ of the vector elements collide in Bank 0**! 

The other 7 memory banks sit completely empty and idle, while the vector load instruction stalls for 8 to 16 cycles waiting for Bank 0 to service the requests one by one.

---

### Industrial Mitigations: Prime-Modulus Banking and Software Padding

How do hardware architects and software engineers prevent power-of-two bank collisions during strided memory accesses?

#### 1. Software Matrix Padding (Inserting Dummy Columns)
If a programmer allocates a 2D matrix of $1024 \times 1024$ floats, the row stride is $1024 \times 4\text{ bytes} = 4,096\text{ bytes}$ ($2^{12}$ bytes). Traversing columns causes $100\%$ bank collisions on every access!

**The Software Fix**: The programmer pads the matrix dimensions to $1024 \times 1025$ floats (adding 1 dummy column, 4 bytes padding):

$$\text{Padded Stride } S = 1025 \times 4\text{ bytes} = \mathbf{4,100 \text{ bytes}}$$

Since $4,100$ is NOT a power of two ($\gcd(4100, 32) = 4 \neq 32$), consecutive column elements land in **rotating, non-conflicting memory banks** ($0, 1, 2, 3 \dots$), restoring $100\%$ parallel memory throughput!

#### 2. Hardware Prime-Modulus Memory Banking
Advanced supercomputer vector architectures (such as the CRAY supercomputers) use a **Prime Number of Memory Banks** (e.g., $B = 17 \text{ or } 31\text{ Banks}$) instead of power-of-two banks ($8$ or $16$).

Because 17 and 31 are prime numbers, $\gcd(S, B) = 1$ for almost all integer strides $S$! Bank conflicts become mathematically impossible for all non-17 multiples, ensuring smooth, linear vector memory throughput for all arbitrary strides.

---

## Solved Industrial Engineering Exercise: Quantitative Vector Strided Load, Stride Generator AGU, and Bank Conflict Analysis

To consolidate your complete mastery of vector strided memory access, address generation unit (AGU) calculations, cache line splitting, bank collision math, and matrix padding performance optimization, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior memory microarchitect designing the Vector Memory Subsystem for a $3.2\text{ GHz}$ 64-bit RISC-V vector processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor features:
* Architectural Vector Length: $vl = 8\text{ elements}$.
* Selected Element Width: $\text{SEW} = 32\text{ bits}$ ($4\text{ bytes}$ per float element).
* Vector Register Destination: $v1$.
* L1 Data Cache: $32\text{-KB}$ capacity, $64\text{-byte}$ cache lines ($L = 64\text{ bytes}$).
* Memory Bank Architecture: 8 independent parallel SRAM memory banks ($B = 8\text{ banks}$), interleaved at 4-byte word boundaries ($W_{\text{bank\_word}} = 4\text{ bytes}$).
  $$\text{Bank\_ID}(A) = \left\lfloor \frac{A}{4} \right\rfloor \pmod 8$$

```text
3.2 GHz RISC-V VECTOR PROCESSOR MEMORY SUBSYSTEM

 CPU Core (3.2 GHz) ──► [ Stride Generator AGU ] ──► [ L1 Data Cache (8 Banks) ]
 Clock T = 312.5 ps     Vector Length vl = 8         Cache Line Size L = 64 Bytes
```

#### Memory Access Latency Parameters:
* Single L1 Cache Line Read Fill: $1\text{ clock cycle}$ ($312.5\text{ ps}$).
* Bank Conflict Serialization Penalty: $+1\text{ clock cycle}$ for each additional conflicting access to the same bank.
* Cache Line Split Serialization Penalty: $+1\text{ clock cycle}$ for each additional distinct 64-byte cache line query.

#### Workload Code:
The processor executes a 2D matrix column traversal using a vector strided load instruction:

$$\mathtt{vlse32.v \ \ v1, \ \ (a0), \ \ a1} \quad (\text{Base Address } a0 = \text{0x00010000}, \text{ Stride } a1 = S)$$

#### Your Objective

1. Analyze **Case 1: Unit-Stride Access ($S = 4\text{ bytes}$)**:
   * Calculate generated addresses $A_0 \dots A_7$ and their Bank IDs.
   * Calculate total cache lines accessed, total bank conflicts, total execution cycles, and effective bandwidth (in GB/sec).
2. Analyze **Case 2: Power-of-Two Stride Access ($S = 32\text{ bytes}$)**:
   * Calculate generated addresses $A_0 \dots A_7$ and their Bank IDs.
   * Prove that $100\%$ bank collisions occur, and calculate the total execution cycles and effective bandwidth.
3. Analyze **Case 3: Padded Non-Power-of-Two Stride Access ($S = 36\text{ bytes}$)**:
   * Calculate generated addresses $A_0 \dots A_7$ and their Bank IDs.
   * Calculate total bank conflicts, execution cycles, effective bandwidth, and the **Performance Speedup Factor** over Case 2.
4. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Case 1 (Unit-Stride Access: $S = 4\text{ Bytes}$)

Base Address $a0 = \text{0x10000} = 65,536_{10}$. Stride $S = 4\text{ bytes}$. $vl = 8$.

##### 1. Generate Addresses ($A_i = 65,536 + i \times 4$):
* $A_0 = 65,536 + 0 = \mathbf{\text{0x10000}} \quad (65,536)$
* $A_1 = 65,536 + 4 = \mathbf{\text{0x10004}} \quad (65,540)$
* $A_2 = 65,536 + 8 = \mathbf{\text{0x10008}} \quad (65,544)$
* $A_3 = 65,536 + 12 = \mathbf{\text{0x1000C}} \quad (65,548)$
* $A_4 = 65,536 + 16 = \mathbf{\text{0x10010}} \quad (65,552)$
* $A_5 = 65,536 + 20 = \mathbf{\text{0x10014}} \quad (65,556)$
* $A_6 = 65,536 + 24 = \mathbf{\text{0x10018}} \quad (65,560)$
* $A_7 = 65,536 + 28 = \mathbf{\text{0x1001C}} \quad (65,564)$

##### 2. Calculate Cache Line Mapping ($L = 64\text{ bytes} \implies \text{Block} = A \ \& \ \sim 63$):
* All addresses $A_0 \dots A_7$ fall in range `0x10000` to `0x1001C`.
* $\text{Block Address} = \text{0x10000}$ for ALL 8 elements!
* **Total Cache Lines Accessed = 1 Cache Line!**

##### 3. Calculate Bank IDs ($\text{Bank\_ID} = \lfloor A / 4 \rfloor \pmod 8$):
* $A_0 (65536/4 = 16384 \pmod 8) = \mathbf{\text{Bank } 0}$
* $A_1 (65540/4 = 16385 \pmod 8) = \mathbf{\text{Bank } 1}$
* $A_2 (16386 \pmod 8) = \mathbf{\text{Bank } 2}$
* $A_3 (16387 \pmod 8) = \mathbf{\text{Bank } 3}$
* $A_4 (16388 \pmod 8) = \mathbf{\text{Bank } 4}$
* $A_5 (16389 \pmod 8) = \mathbf{\text{Bank } 5}$
* $A_6 (16390 \pmod 8) = \mathbf{\text{Bank } 6}$
* $A_7 (16391 \pmod 8) = \mathbf{\text{Bank } 7}$

##### Bank Collision Result:
All 8 elements land in **8 DIFFERENT BANKS (Banks 0..7)**! **ZERO BANK CONFLICTS!**

##### Execution Time & Bandwidth (Case 1):
* 1 Cache Line, 0 Bank Conflicts $\implies$ **Execution Time = 1 Clock Cycle ($0.3125\text{ ns}$)**!
* Data Payload = 8 elements $\times 4\text{ bytes} = 32\text{ bytes}$.

$$\text{BW}_{\text{Case1}} = \frac{32\text{ Bytes}}{0.3125 \times 10^{-9}\text{ s}} = \mathbf{102.4 \times 10^9 \text{ Bytes/sec}} = \mathbf{102.4 \text{ GB/sec}}$$

---

#### Step 2: Analyze Case 2 (Power-of-Two Stride Access: $S = 32\text{ Bytes}$)

Base Address $a0 = \text{0x10000}$. Stride $S = 32\text{ bytes}$. $vl = 8$.

##### 1. Generate Addresses ($A_i = 65,536 + i \times 32$):
* $A_0 = 65,536 + 0 = \mathbf{\text{0x10000}} \quad (65,536)$
* $A_1 = 65,536 + 32 = \mathbf{\text{0x10020}} \quad (65,568)$
* $A_2 = 65,536 + 64 = \mathbf{\text{0x10040}} \quad (65,600)$
* $A_3 = 65,536 + 96 = \mathbf{\text{0x10060}} \quad (65,632)$
* $A_4 = 65,536 + 128 = \mathbf{\text{0x10080}} \quad (65,664)$
* $A_5 = 65,536 + 160 = \mathbf{\text{0x100A0}} \quad (65,696)$
* $A_6 = 65,536 + 192 = \mathbf{\text{0x100C0}} \quad (65,728)$
* $A_7 = 65,536 + 224 = \mathbf{\text{0x100E0}} \quad (65,760)$

##### 2. Calculate Cache Line Mapping ($L = 64\text{ bytes}$):
* $A_0, A_1 \implies \text{Cache Line 0 (0x10000)}$
* $A_2, A_3 \implies \text{Cache Line 1 (0x10040)}$
* $A_4, A_5 \implies \text{Cache Line 2 (0x10080)}$
* $A_6, A_7 \implies \text{Cache Line 3 (0x100C0)}$
* **Total Cache Lines Accessed = 4 Cache Lines!** (3 Cache Line Split Serialization penalties $= +3\text{ cycles}$).

##### 3. Calculate Bank IDs ($\text{Bank\_ID} = \lfloor A / 4 \rfloor \pmod 8$):
* $A_0 (65536/4 = 16384 \pmod 8) = \mathbf{\text{Bank } 0}$
* $A_1 (65568/4 = 16392 \pmod 8) = \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$
* $A_2 (65600/4 = 16400 \pmod 8) = \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$
* $A_3 (65632/4 = 16408 \pmod 8) = \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$
* $A_4, A_5, A_6, A_7 \implies \mathbf{\text{ALL MAP TO BANK 0!}}$

##### Bank Collision Result:
**ALL 8 ELEMENTS COLLIDE IN BANK 0!** 

7 Bank Conflict penalties $= +7\text{ cycles}$.

##### Execution Time & Bandwidth (Case 2):

$$\text{Total Cycles (Case 2)} = 1 \text{ base} + 3 \text{ line splits} + 7 \text{ bank conflicts} = \mathbf{11 \text{ Clock Cycles}}$$

$$T_{\text{Case2}} = 11 \times 0.3125\text{ ns} = \mathbf{3.4375 \text{ nanoseconds}}$$

$$\text{BW}_{\text{Case2}} = \frac{32\text{ Bytes}}{3.4375 \times 10^{-9}\text{ s}} \approx \mathbf{9.309 \text{ GB/sec}}$$

In Case 2, power-of-two bank collisions degraded bandwidth from $102.4\text{ GB/s}$ down to **$9.309\text{ GB/sec}$ ($91\%$ bandwidth loss!)**.

---

#### Step 3: Analyze Case 3 (Padded Non-Power-of-Two Stride Access: $S = 36\text{ Bytes}$)

Software pads the stride to $S = 36\text{ bytes}$ ($36 / 4 = 9\text{ words}$).

##### 1. Generate Addresses ($A_i = 65,536 + i \times 36$):
* $A_0 = 65,536 + 0 = \mathbf{\text{0x10000}} \quad (65,536)$
* $A_1 = 65,536 + 36 = \mathbf{\text{0x10024}} \quad (65,572)$
* $A_2 = 65,536 + 72 = \mathbf{\text{0x10048}} \quad (65,608)$
* $A_3 = 65,536 + 108 = \mathbf{\text{0x1006C}} \quad (65,644)$
* $A_4 = 65,536 + 144 = \mathbf{\text{0x10090}} \quad (65,680)$
* $A_5 = 65,536 + 180 = \mathbf{\text{0x100B4}} \quad (65,716)$
* $A_6 = 65,536 + 216 = \mathbf{\text{0x100D8}} \quad (65,752)$
* $A_7 = 65,536 + 252 = \mathbf{\text{0x100FC}} \quad (65,788)$

##### 2. Calculate Cache Line Mapping ($L = 64\text{ bytes}$):
* $A_0, A_1 \implies \text{Cache Line 0}$
* $A_2, A_3 \implies \text{Cache Line 1}$
* $A_4, A_5 \implies \text{Cache Line 2}$
* $A_6, A_7 \implies \text{Cache Line 3}$
* **Total Cache Lines = 4 Cache Lines!** (3 Cache Line Split penalties $= +3\text{ cycles}$).

##### 3. Calculate Bank IDs ($\text{Bank\_ID} = \lfloor A / 4 \rfloor \pmod 8$):
* $A_0 (65536/4 = 16384 \pmod 8) = \mathbf{\text{Bank } 0}$
* $A_1 (65572/4 = 16393 \pmod 8) = \mathbf{\text{Bank } 1 \quad (\text{NO CONFLICT!})}$
* $A_2 (65608/4 = 16402 \pmod 8) = \mathbf{\text{Bank } 2 \quad (\text{NO CONFLICT!})}$
* $A_3 (65644/4 = 16411 \pmod 8) = \mathbf{\text{Bank } 3 \quad (\text{NO CONFLICT!})}$
* $A_4 (65680/4 = 16420 \pmod 8) = \mathbf{\text{Bank } 4 \quad (\text{NO CONFLICT!})}$
* $A_5 (65716/4 = 16429 \pmod 8) = \mathbf{\text{Bank } 5 \quad (\text{NO CONFLICT!})}$
* $A_6 (65752/4 = 16438 \pmod 8) = \mathbf{\text{Bank } 6 \quad (\text{NO CONFLICT!})}$
* $A_7 (65788/4 = 16447 \pmod 8) = \mathbf{\text{Bank } 7 \quad (\text{NO CONFLICT!})}$

##### Bank Collision Result:
All 8 elements land in **8 DIFFERENT BANKS (Banks 0..7)**! **ZERO BANK CONFLICTS!**

##### Execution Time & Bandwidth (Case 3):

$$\text{Total Cycles (Case 3)} = 1 \text{ base} + 3 \text{ line splits} + 0 \text{ bank conflicts} = \mathbf{4 \text{ Clock Cycles}}$$

$$T_{\text{Case3}} = 4 \times 0.3125\text{ ns} = \mathbf{1.250 \text{ nanoseconds}}$$

$$\text{BW}_{\text{Case3}} = \frac{32\text{ Bytes}}{1.250 \times 10^{-9}\text{ s}} = \mathbf{25.60 \text{ GB/sec}}$$

##### Calculate Performance Speedup Factor (Case 3 vs Case 2):

$$\text{Speedup} = \frac{T_{\text{Case2}}}{T_{\text{Case3}}} = \frac{3.4375\text{ ns}}{1.2500\text{ ns}} = \frac{11\text{ cycles}}{4\text{ cycles}} = \mathbf{2.75\times \text{ Performance Advantage!}}$$

```text
STRIDE PERFORMANCE OPTIMIZATION SUMMARY

 Stride Configuration  │ Cache Lines │ Bank Conflicts │ Total Cycles │ Read Bandwidth │ Speedup
───────────────────────┼─────────────┼────────────────┼──────────────┼────────────────┼──────────
 Case 1: Unit-Stride S=4│ 1 Line      │ 0 Conflicts    │ 1 Cycle      │ 102.4 GB/sec   │ 11.00x
 Case 2: Power-2 S=32  │ 4 Lines     │ 7 Conflicts!   │ 11 Cycles    │   9.31 GB/sec   │ 1.00x (Base)
 Case 3: Padded S=36   │ 4 Lines     │ 0 Conflicts!   │ 4 Cycles     │  25.60 GB/sec   │ 2.75x FASTER!
```

##### Engineering Conclusion:
Padding the byte stride from $32\text{ bytes}$ to $36\text{ bytes}$ eliminated $100\%$ of bank collisions, cutting execution time from 11 cycles down to 4 cycles (**$2.75\times$ performance speedup**)!

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against memory architecture principles:

1. **Address Bank Mapping Verification**:
   * Stride $S = 36\text{ bytes} = 9\text{ words}$.
   * Bank increment per element $= 9 \pmod 8 = +1\text{ bank index per element}$.
   * Element $i$ lands in Bank $i \pmod 8$.
   * Bank sequence: $0, 1, 2, 3, 4, 5, 6, 7$. Perfectly uniform bank distribution verified!
2. **Cache Line Split Count Verification**:
   * 8 elements separated by 36 bytes span $7 \times 36 = 252\text{ bytes}$.
   * Number of 64-byte lines spanned $= \lceil 252 / 64 \rceil = 4\text{ cache lines}$.
   * 4 cache lines required 3 line-split serialization steps ($+3\text{ cycles}$). Matches total cycle count $1 + 3 = 4\text{ cycles}$.
3. **Throughput Gain Calculation**:
   * Bandwidth increased from $9.31\text{ GB/s}$ to $25.60\text{ GB/s}$.
   * Ratio $\frac{25.60}{9.31} = 2.75\times$. Speedup math $100\%$ exact.

All address generation unit (AGU) calculations, bank modulo mappings, cache line split penalties, and stride padding speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Vector Strided Memory Access (`vlse32.v` / `vsse32.v`)**: A vector addressing mode that reads or writes $vl$ vector elements separated by a constant signed byte stride $S$ ($A_i = A_{\text{base}} + i \cdot S$), enabling direct hardware acceleration for matrix column traversals, complex numbers, and interleaved image channels.
* **Stride Generator Engine (Strided AGU Array)**: A parallel address generation unit that computes $A_i = A_{\text{base}} + i \cdot S$ in parallel across all vector lanes, decomposing non-contiguous vector requests into serialized cache line fills and routing returned data into destination vector registers.
