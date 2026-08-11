content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/01-isa-instruction-encoding-architecture/02-load-store-execution-model/02-variable-width-instruction-stream-decoding.md
# Variable-Width Instruction Stream Decoding and Compressed Instruction Alignment

## The Instruction Boundary Alignment Friction: Why Variable-Length Code Streams Freeze Front-End Decoders

In modern high-performance processor design, the front-end Instruction Fetch and Decode unit is tasked with a relentless objective: it must supply a continuous, unbroken stream of valid instructions to the execution pipelines on every single clock cycle. Operating at a master clock frequency of $3.2\text{ GHz}$, a single clock cycle elapses in just $312.5\text{ picoseconds}$ ($0.3125\text{ nanoseconds}$). Within this tiny slice of time, the processor's front-end must read a 128-bit ($16\text{-byte}$) block of raw instruction bytes from the Level 1 Instruction Cache (L1I), determine where every individual instruction begins and ends, decode their opcodes, and dispatch them to execution units.

In a traditional, un-compressed Reduced Instruction Set Computer (RISC) architecture, this instruction boundary determination is trivial. Every single instruction is strictly **32 bits wide ($4\text{ bytes}$)** and aligned to 4-byte physical memory addresses ($0x00, 0x04, 0x08, 0x0C$).

Because every instruction is guaranteed to be 4 bytes long, the front-end decoder performs zero boundary search math. It takes the 16-byte fetch window from the cache, slices it into four fixed 4-byte chunks (`Bytes [3:0]`, `Bytes [7:4]`, `Bytes [11:8]`, `Bytes [15:12]`), and feeds them directly into four parallel instruction decoders. All four instructions are decoded in a single, predictable clock cycle.

```text
FIXED-LENGTH 32-BIT DECODING (ZERO BOUNDARY SEARCH DELAY)

 16-Byte L1 Instruction Cache Fetch Window (128 Bits)
 ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
 │ Instruction 3   │ Instruction 2   │ Instruction 1   │ Instruction 0   │
 │ Bytes [15:12]   │ Bytes [11:8]    │ Bytes [7:4]     │ Bytes [3:0]     │
 └────────┬────────┴────────┬────────┴────────┬────────┴────────┬────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
     [Decoder 3]       [Decoder 2]       [Decoder 1]       [Decoder 0]
 (Four 32-bit instructions decoded simultaneously in 1 clock cycle!)
```

However, fixed 32-bit instruction encodings suffer from a major real-world drawback: **Code Size Bloat**.

In real-world software applications, an overwhelming majority of executed instructions are simple, common operations—such as adding small constants (`addi x10, x10, 1`), copying register values (`mv x5, x6`), or executing short jumps. 

Encoding these tiny operations in full 32-bit instruction words wastes memory capacity, clogs Level 1 Instruction Caches, and consumes valuable off-chip memory bus bandwidth.

To reduce binary code footprint by $25\%\text{ to } 30\%$, modern architectures introduce **Compressed Instruction Extensions** (such as RISC-V RVC / C-extension, or ARM Thumb-2), mixing 16-bit ($2\text{-byte}$) compressed instructions alongside standard 32-bit ($4\text{-byte}$) instructions in the exact same binary code stream.

In Complex Instruction Set Computers (CISC) like x86-64, instruction lengths vary even more wildly—ranging anywhere from **1 byte to 15 bytes in length**!

Now, we encounter the fundamental physical friction: **The Variable-Length Instruction Boundary Alignment Hazard**.

When a front-end instruction fetch unit retrieves a 16-byte block of raw binary data containing variable-length instructions, the decoder encounters an immediate, critical question:

> **The Boundary Alignment Problem**: Where does Instruction #1 end, and where does Instruction #2 begin inside the 16-byte fetch window?

```text
VARIABLE-LENGTH BOUNDARY ALIGNMENT HAZARD

 16-Byte Fetch Window with Mixed 16-Bit and 32-Bit Instructions
 ┌──────┬──────────────┬──────────────┬──────┬──────────────┬──────┐
 │ HW 7 │ HW 6         │ HW 5         │ HW 4 │ HW 3         │ HW 2 │
 │ 16b  │ 32-Bit Inst  │ 32-Bit Inst  │ 16b  │ 32-Bit Inst  │ 16b  │
 └──────┴──────────────┴──────────────┴──────┴──────────────┴──────┘
  Byte 15                                                     Byte 0
  ▲                                                           ▲
  │                                                           │
  └─ Where does Instruction #2 start? ────────────────────────┘
     (Cannot know until Instruction #0 and #1 lengths are decoded!)
```

Look at the sequential dependency chain created by variable-length instructions:
* To find the start address of Instruction #1, the decoder must first decode the length of Instruction #0.
* To find the start address of Instruction #2, the decoder must decode the length of Instruction #1.
* To find the start address of Instruction #3, the decoder must decode the length of Instruction #2!

If determining the start position of Instruction #3 requires waiting for the length evaluation of Instructions #0, #1, and #2 sequentially, **parallel front-end decoding collapses into a slow, multi-stage sequential bottleneck**!

Furthermore, mixing 16-bit and 32-bit instructions allows a 32-bit instruction to start on a 2-byte boundary ($0x02, 0x06, 0x0A, 0x0E$). 

If a 32-bit instruction starts at byte offset $14$ (`0x0E`) of a 16-byte cache line:
* Its first 2 bytes sit at the end of **Cache Line 0** (`0x0E`–`0x0F`).
* Its last 2 bytes sit at the beginning of **Cache Line 1** (`0x10`–`0x11`)!

The single 32-bit instruction straddles two separate physical cache lines! 

Fetching that single instruction requires reading two different cache lines across multiple clock cycles, or triggers an **Unaligned Instruction Fetch Fault** if Cache Line 1 is not present in memory!

To decode variable-width instruction streams at multi-gigahertz speeds without suffering sequential decoding stalls or unaligned fetch traps, digital hardware architects employ **Fixed 2-Byte Grid Alignment**, **Pre-Decoder Boundary Mask Generators**, and **Asynchronous 16-to-32 Bit Decompressor Units**.

---

## The Variable-Length Freight Train: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of variable-length instruction decoding and compressed instruction alignment before inspecting transistor-level pre-decoder logic and 16-to-32 bit decompression matrices, let us consider an everyday analogy: **The Automated Freight Train Inspection Station**.

Imagine a high-speed cargo railway station where an automated optical camera system (**The CPU Front-End Instruction Decoder**) inspects incoming freight trains (**Instruction Streams**) traveling past the station at 100 miles per hour.

```text
THE FREIGHT TRAIN INSPECTION STATION METAPHOR

 Freight Train Crate Window (16 Meters Wide)
 ┌─────────────────────────────────────────────────────────────┐
 │ Raw Stream of Cargo Crates (Instructions)                   │
 └─────────────────────────────────────────────────────────────┘
```

The camera system needs to inspect **4 cargo crates simultaneously on every single second** to keep up with the factory's production schedule.

Let us observe three different railway designs and see how the inspection camera system copes with crate lengths:

---

### Scenario A: Standard Fixed-Length Containers (32-Bit Fixed RISC)

In Scenario A, the railway company enforces a strict manufacturing rule: **Every single cargo container MUST be exactly 32 feet long**.

Look at how simple the inspection camera system is under Scenario A:
1. The station sets up 4 fixed camera lenses mounted on rigid steel pillars at exact 32-foot intervals:
   * **Camera 0**: Mounted at $0\text{ feet}$.
   * **Camera 1**: Mounted at $32\text{ feet}$.
   * **Camera 2**: Mounted at $64\text{ feet}$.
   * **Camera 3**: Mounted at $96\text{ feet}$.
2. When a 128-foot section of the train passes, all 4 cameras flash their shutters **at the exact same millisecond**!
3. All 4 containers are inspected in parallel in 1 second. Zero guessing, zero moving cameras, zero delay!

---

### Scenario B: Random CISC Variable-Length Containers (1-to-15 Byte x86-64 CISC)

In Scenario B, the railway company allows customers to build containers of any arbitrary length—ranging from 1 foot to 15 feet long!

Look at the catastrophe faced by the inspection camera system under Scenario B:
1. Camera 0 stands at $0\text{ feet}$ and inspects Container 0. Camera 0 discovers Container 0 is 7 feet long.
2. Where should Camera 1 stand? Camera 1 cannot position itself until Camera 0 finishes reading Container 0's length tag!
3. Camera 1 moves to $7\text{ feet}$, inspects Container 1, and discovers it is 3 feet long.
4. Camera 2 moves to $10\text{ feet}$, inspects Container 2, and discovers it is 11 feet long.
5. Camera 3 moves to $21\text{ feet}$...

```text
SCENARIO B: SEQUENTIAL CAMERA MOVEMENT (CISC DECODING STALL)

 Camera 0 (at 0 ft)  ──► Reads Container 0 Length = 7 ft
                          │
                          ▼
 Camera 1 (at 7 ft)  ──► Reads Container 1 Length = 3 ft
                          │
                          ▼
 Camera 2 (at 10 ft) ──► Reads Container 2 Length = 11 ft
 (Cameras must move sequentially one after another! Train slows down by 80%!)
```

Look at the performance failure: The cameras cannot take photos in parallel! Camera 3 had to wait for Cameras 0, 1, and 2 to finish sequentially. The train must be slowed down by $80\%$ to give the mechanical cameras time to move!

---

### Scenario C: The 16-Foot Grid Constraint (RISC-V RVC Compressed Extension)

To get the benefit of short containers without slowing down the train, the railway company adopts a clever compromise: **The 16-Foot Grid Constraint**.

1. Containers can be short (**16 feet long**) or standard (**32 feet long**).
2. **THE 16-FOOT GRID RULE**: Every container—whether short or standard—**MUST begin on an exact 16-foot grid mark ($0\text{ ft}, 16\text{ ft}, 32\text{ ft}, 48\text{ ft}, 64\text{ ft} \dots$)**!
3. A 32-foot standard container is simply treated as two 16-foot segments joined together.

Look at how the camera inspection system operates under Scenario C:

```text
SCENARIO C: 16-FOOT GRID PRE-DECODER (PARALLEL INSPECTION)

 Lenses mounted at EVERY 16-FOOT GRID MARK (0, 16, 32, 48, 64...):
 [Lens 0 at 0ft]   [Lens 1 at 16ft]   [Lens 2 at 32ft]   [Lens 3 at 48ft]
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
 Reads Header [1:0]  Reads Header [1:0]  Reads Header [1:0]  Reads Header [1:0]
 "I am 16ft Short"   "I am 32ft Standard" (Second Half)     "I am 16ft Short"
       │                  │                                     │
       └──────────────────┼─────────────────────────────────────┘
                          ▼
        BOUNDARY MASK GENERATED IN 1 MILLISECOND!
        (Camera 0 -> 16ft, Camera 1 -> 32ft, Camera 2 -> 48ft)
```

Trace the parallel execution:
1. The station mounts fixed camera lenses at **every 16-foot mark** ($0\text{ ft}, 16\text{ ft}, 32\text{ ft}, 48\text{ ft}, 64\text{ ft} \dots$).
2. As the train arrives, all lenses inspect the **first two color stripes (the 2-bit length header)** on their respective 16-foot segment **at the exact same millisecond**:
   * If the color stripe reads `00`, `01`, or `10`, the segment is a **16-foot short container**.
   * If the color stripe reads `11`, the segment is the **first half of a 32-foot standard container**!
3. In a single millisecond, a simple combinational pre-decoder reads all the color stripes simultaneously and generates an **Instruction Boundary Map**!
4. The station knows the exact start position of every container on the train instantly, taking all photos in parallel without stopping the train for a single millisecond!

This 16-foot grid railway station is the exact physical analogue of **Compressed Instruction Stream Decoding**:
* The freight train is the **Raw 16-Byte Instruction Fetch Window**.
* 16-foot short containers are **Compressed 16-Bit Instructions (`RVC`)**.
* 32-foot standard containers are **Standard 32-Bit RISC Instructions (`RV32I / RV64I`)**.
* Lenses mounted at every 16-foot mark are **16-Bit Half-Word Pre-Decoders**.
* Reading color stripes `[1:0]` in 1 millisecond is **2-Bit Opcode Length Header Extraction**.
* Generating the container map in parallel is **Pre-Decoder Boundary Mask Generation**.

---

## Primitive 1: Fixed-Length vs. Compressed Instruction Stream Decoding

Now that we possess an intuitive mental model of 16-foot grid train sorters, let us examine the formal engineering mechanics of **Fixed-Length vs. Compressed Instruction Stream Decoding**.

In a pure 32-bit RISC architecture (such as standard un-compressed RISC-V RV32I or RV64I), instruction decoding is straightforward.

A 16-byte ($128\text{-bit}$) fetch window retrieved from the L1 Instruction Cache contains four 32-bit instructions starting at fixed byte offsets:

$$\text{Fixed 32-Bit Instruction } k = \text{FetchBuffer}[\mathbf{(4 \cdot k + 3)} : \mathbf{(4 \cdot k)}]$$

Where:
* $k \in \{0, 1, 2, 3\}$ is the instruction slot index in a 4-wide fetch window.
* $\text{FetchBuffer}$ is the 16-byte array read from the L1 Instruction Cache.

Every instruction $k$ starts at byte offset $4 \cdot k$ ($0, 4, 8, 12$).

---

### The RISC-V Compressed (RVC) Instruction Extension

To reduce binary code footprint, the RISC-V ISA specification defines the **C Extension (RVC)**.

The RVC extension adds 16-bit compressed instruction encodings for the most frequently executed 32-bit instructions:

```text
COMPRESSED VS STANDARD INSTRUCTION EQUIVALENTS

 Assembly Command     │ Standard 32-Bit Encoding │ RVC 16-Bit Encoding │ Code Size Savings
──────────────────────┼──────────────────────────┼─────────────────────┼───────────────────
 addi x10, x10, 1     │ 0x00150513 (4 Bytes)     │ 0x0505 (2 Bytes)    │ 50% Reduction!
 lw   x10, 0(x11)     │ 0x00058503 (4 Bytes)     │ 0x4180 (2 Bytes)    │ 50% Reduction!
 sw   x12, 4(x11)     │ 0x00C5A223 (4 Bytes)     │ 0xC188 (2 Bytes)    │ 50% Reduction!
 jal  x1, pc+8        │ 0x008000EF (4 Bytes)     │ 0x2001 (2 Bytes)    │ 50% Reduction!
```

By encoding common operations in 16 bits, total software binary size shrinks by **$25\%\text{ to } 30\%$**. 

This effectively increases the capacity of an existing $32\text{-KB}$ L1 Instruction Cache to an effective capacity of **$42\text{ Kilobytes}$**, dramatically reducing L1I miss rates and memory bus traffic!

---

### The 2-Bit Opcode Length Header Invariant

How does the front-end decoder distinguish a 16-bit compressed instruction from a standard 32-bit instruction when both types are mixed together in the same 16-byte fetch window?

The RISC-V ISA enforces a strict, universal bit invariant at the lowest two bits of every 16-bit half-word: **The 2-Bit Opcode Length Header**.

Every 16-byte fetch window is divided into eight 16-bit ($2\text{-byte}$) half-words: `HW0, HW1, HW2, HW3, HW4, HW5, HW6, HW7`.

The hardware pre-decoder inspects **Bits [1:0]** of every 16-bit half-word:

$$\text{Header\_Bits} = \text{HalfWord}[1:0]$$

```text
2-BIT OPCODE LENGTH HEADER DECODING TABLE

 HalfWord Bits [1:0] │ Instruction Length │ Instruction Type Classification
─────────────────────┼────────────────────┼────────────────────────────────────────────────
        00_2         │ 16 Bits (2 Bytes)  │ RVC Compressed Instruction (Quadrant 0)
        01_2         │ 16 Bits (2 Bytes)  │ RVC Compressed Instruction (Quadrant 1)
        10_2         │ 16 Bits (2 Bytes)  │ RVC Compressed Instruction (Quadrant 2)
        11_2         │ 32 Bits (4 Bytes)  │ Standard Un-compressed RISC-V Instruction
```

Look at the mathematical elegance of this 2-bit header:
* If `HalfWord[1:0]` is `00`, `01`, or `10` (values $0, 1, 2$), the half-word is a **16-Bit Compressed Instruction**.
* If `HalfWord[1:0]` is `11` (value $3$), the half-word is the **first half of a 32-Bit Standard Instruction**!

```text
OPCODE LENGTH HEADER EVALUATION LOGIC

 Is_32Bit_Instruction = ( HalfWord[1] == 1 ) AND ( HalfWord[0] == 1 )
```

Evaluating whether a 16-bit slice is a 32-bit instruction requires **ONLY A SINGLE 2-INPUT AND GATE**!

In physical silicon, this 2-input AND gate evaluates in less than **$5\text{ picoseconds}$**, allowing the front-end pre-decoder to inspect all eight half-words in parallel instantly!

---

## Primitive 2: Pre-Decoder Boundary Mask Generation and Decompressor Units

Now let us examine the second core primitive: **Pre-Decoder Boundary Mask Generation** and **Asynchronous 16-to-32 Bit Decompressor Units**.

---

### Generating the Parallel Instruction Boundary Mask

Consider a 16-byte fetch window containing eight 16-bit half-words (`HW0` through `HW7`) arriving from the L1 Instruction Cache.

The front-end **Pre-Decoder Unit** contains eight parallel length-checking AND gates that inspect `HW0[1:0]` through `HW7[1:0]` simultaneously.

The Pre-Decoder generates an 8-bit **Length Vector ($\mathbf{L} = L_7 L_6 L_5 L_4 L_3 L_2 L_1 L_0$)**:

$$L_k = \begin{cases} 1 & \text{if } \text{HW}_k[1:0] == 11_2 \quad (\text{32-bit instruction start}) \\ 0 & \text{if } \text{HW}_k[1:0] \neq 11_2 \quad (\text{16-bit instruction}) \end{cases}$$

```text
PRE-DECODER BOUNDARY MASK GENERATION DATAPATH

 16-Byte Fetch Window: [ HW7 ][ HW6 ][ HW5 ][ HW4 ][ HW3 ][ HW2 ][ HW1 ][ HW0 ]
                          │      │      │      │      │      │      │      │
                          ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
 Bits [1:0] Check:       [11]   [01]   [11]   [11]   [00]   [10]   [11]   [00]
                          │      │      │      │      │      │      │      │
                          ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
 Length Vector L:        [ 1 ]  [ 0 ]  [ 1 ]  [ 1 ]  [ 0 ]  [ 0 ]  [ 1 ]  [ 0 ]
```

Once the Length Vector $\mathbf{L}$ is computed, a combinational prefix-scan logic circuit converts $\mathbf{L}$ into a 4-entry **Instruction Start Offset Vector ($\mathbf{P} = P_0, P_1, P_2, P_3$)**:

```text
DERIVING INSTRUCTION START OFFSETS FROM LENGTH VECTOR L

 Example Length Vector L = [ 0, 1, 0, 1, 0, 0, 1, 0 ]  (Byte 0 is HW0)

  * HW0[1:0] = 00 -> 16-bit Inst 0 starts at Byte 0  (P0 = Byte 0)
  * HW1[1:0] = 11 -> 32-bit Inst 1 starts at Byte 2  (P1 = Byte 2)
  * HW2: Second half of Inst 1
  * HW3[1:0] = 00 -> 16-bit Inst 2 starts at Byte 6  (P2 = Byte 6)
  * HW4[1:0] = 10 -> 16-bit Inst 3 starts at Byte 8  (P3 = Byte 8)

 Calculated Start Offset Vector P = [ Byte 0, Byte 2, Byte 6, Byte 8 ]
```

Look at the speed of this pre-decoding process:
In less than **$25\text{ picoseconds}$**, the combinational logic converts raw instruction bytes into four exact byte pointers ($P_0, P_1, P_2, P_3$) identifying the starting addresses of four valid instructions inside the 16-byte window!

---

### Asynchronous 16-to-32 Bit Decompressor Units

Once the start offsets $P_0, P_1, P_2, P_3$ are established, how does the CPU execute the 16-bit compressed instructions?

Does the CPU build a completely separate 16-bit execution pipeline with separate 16-bit ALUs, 16-bit adders, and 16-bit register files?

**NO!** Building a separate 16-bit execution pipeline would waste millions of transistors and double the silicon die area of the execution core!

Instead, the processor uses **Asynchronous 16-to-32 Bit Decompressor Units**:

```text
16-TO-32 BIT DECOMPRESSOR HARDWARE DATAPATH

 Incoming 16-Bit Compressed Instruction (e.g., C.ADDI)
  │
  ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ ASYNCHRONOUS 16-TO-32 BIT DECOMPRESSOR MATRIX              │
 │  * Maps 3-bit compressed register IDs to 5-bit registers   │
 │  * Expands 6-bit compressed immediate to 12-bit immediate  │
 │  * Synthesizes 7-bit standard opcode (0x13) & funct3 (0x0)  │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 Output 32-Bit Standard RISC-V Instruction Word (e.g., addi x10, x10, 5)
 (Fed directly into standard 32-bit execution pipeline!)
```

#### How the Decompressor Unit Operates:
1. When a 16-bit compressed instruction (e.g., `C.ADDI`) is identified at start offset $P_k$, it is routed into a **16-to-32 Bit Decompressor Unit**.
2. The decompressor is a pure combinational lookup matrix. It reads the 16-bit fields and translates them into an **exact, equivalent 32-bit standard instruction**:
   * Compressed register fields ($3\text{ bits}$, selecting popular registers $x8 \dots x15$) are zero-extended to standard 5-bit register IDs ($x8 = 01000_2 \dots x15 = 01111_2$).
   * Compressed immediate fields ($6\text{ bits}$) are expanded into standard 12-bit sign-extended immediates.
   * Compressed 3-bit opcodes are mapped to standard 7-bit primary opcodes (`0x13`, `0x33`, `0x03`, `0x23`).
3. The decompressor outputs a clean, standard 32-bit instruction word in just **$15\text{ picoseconds}$**!
4. The synthesized 32-bit instruction is fed directly into the standard 32-bit CPU pipeline!

#### The Architectural Result:
The primary CPU execution pipeline—including the Register File, ALU, AGU, and L1 Data Cache interface—remains **$100\%$ UNCHANGED**! 

The execution core does not know or care whether an instruction originated as a 16-bit compressed word or a 32-bit standard word. All execution units operate strictly on standard 32-bit instructions!

---

## Real-World Silicon Engineering: Cache-Line Straddling, Fetch Buffers, and Misalignment Traps

In physical microprocessors, mixing 16-bit and 32-bit instructions introduces two severe real-world edge cases that hardware designers must handle: **Cache-Line Straddling** and **Instruction Access Fault Traps**.

---

### 1. The Cache-Line Straddling Problem

Because 16-bit compressed instructions allow instructions to start on any 2-byte boundary ($0x00, 0x02, 0x04, 0x06, 0x08, 0x0A, 0x0C, 0x0E$), a 32-bit ($4\text{-byte}$) instruction can begin at byte offset 14 (`0x0E`) of a 16-byte cache line.

Look at the physical storage location of a 32-bit instruction starting at byte `0x0E`:
* **Half-Word 0 (Bytes 0 and 1 of instruction)**: Sits at bytes `14` and `15` of **Cache Line 0** (`0x0000000E`–`0x0000000F`).
* **Half-Word 1 (Bytes 2 and 3 of instruction)**: Sits at bytes `0` and `1` of **Cache Line 1** (`0x00000010`–`0x00000011`)!

The single 32-bit instruction spans across two different physical cache lines!

```text
32-BIT INSTRUCTION STRADDLING TWO CACHE LINES

 Cache Line 0 (Addresses 0x00..0x0F)        Cache Line 1 (Addresses 0x10..0x1F)
 ┌─────────────────────────┬────────┐       ┌────────┬─────────────────────────┐
 │ Earlier Instructions    │ HW0    │       │ HW1    │ Subsequent Instructions │
 │ Bytes 0..13             │ Bytes  │       │ Bytes  │ Bytes 2..15             │
 │                         │ 14..15 │       │ 0..1   │                         │
 └─────────────────────────┴───┬────┘       └───┬────┘─────────────────────────┘
                               │                │
                               ▼                ▼
                 [ 32-Bit Instruction Straddles Boundary! ]
```

#### How Hardware Handles Cache-Line Straddling:
To decode straddled instructions without losing a clock cycle, modern processor front-ends use a 16-byte **Sliding Fetch Alignment Buffer**:

```text
SLIDING FETCH ALIGNMENT BUFFER (STREAMING RE-ASSEMBLY)

 Cycle N Fetch   : Reads Cache Line 0 ──► Stores leftover HW0 (Bytes 14..15) in Fetch Buffer
 Cycle N+1 Fetch : Reads Cache Line 1 ──► Combines HW0 + HW1 (Bytes 0..1) into 32-bit Word!
                                          (Instruction re-assembled seamlessly!)
```

1. On Cycle $N$, Cache Line 0 is fetched. The pre-decoder detects that `HW7` (bytes 14–15) is the first half of a 32-bit instruction (`HW7[1:0] == 11_2`).
2. `HW7` is saved in a 2-byte **Leftover Alignment Register** inside the Fetch Buffer.
3. On Cycle $N+1$, Cache Line 1 is fetched.
4. The Aligner circuit combines `HW7` from Cycle $N$ with `HW0` from Cycle $N+1$ into a complete 32-bit instruction word and dispatches it to the decoders in $1\text{ clock cycle}$!

---

### 2. Instruction Page Faults on Cross-Page Straddles

What happens if Cache Line 0 sits at the very end of a Virtual Memory Page (e.g., address `0x00000FFF`, the last 2 bytes of Page 0), and Cache Line 1 sits at the start of Page 1 (`0x00001000`), but **Page 1 is NOT loaded in RAM**?

1. The CPU fetches `HW7` from Page 0 successfully.
2. The CPU attempts to fetch `HW0` from Page 1. The Memory Management Unit (MMU) detects a **Page Fault / Access Violation** on Page 1!
3. **The Hardware Response**:
   * The front-end cancels the instruction fetch.
   * The MMU asserts an **Instruction Page Fault Trap** pointing to address `0x00001000` (the exact address of the missing second half of the instruction!).
   * Execution jumps to the operating system's page fault handler to load Page 1 from disk.

---

## Solved Industrial Engineering Exercise: Mixed 16/32-Bit Stream Pre-Decoding, Boundary Mask Generation, and Instruction Expansion

To consolidate your complete mastery of variable-width instruction decoding, 2-bit length header checking, boundary mask generation, and 16-to-32 bit instruction decompression, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect verifying the front-end Instruction Pre-Decoder and RVC Decompressor for a $3.2\text{ GHz}$ 64-bit RISC-V processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The Instruction Fetch unit retrieves a raw 16-byte ($128\text{-bit}$) instruction window from the Level 1 Instruction Cache at memory start address $PC = \text{0x00401000}$.

```text
3.2 GHz PROCESSOR FRONT-END RVC PRE-DECODER

 L1 Instruction Cache ──► [ 16-Byte Fetch Buffer ] ──► [ Pre-Decoder ] ──► 16-to-32 Decompressor
 Clock T = 312.5 ps       128 Bits / 8 Half-Words      Header [1:0]      Synthesizes RV64I Words
```

#### Raw 16-Byte Fetch Buffer Contents (in Hexadecimal):
$$\text{FetchBuffer}[127:0] = \text{\tt 0x0005\_4581\_00C5\_8533\_0105\_2583\_0101\_4501}$$

The 16-byte fetch window is partitioned into eight 16-bit ($2\text{-byte}$) half-words in little-endian byte order:
* `HW0` (Bytes 1..0) = `0x4501`
* `HW1` (Bytes 3..2) = `0x0101`
* `HW2` (Bytes 5..4) = `0x2583`
* `HW3` (Bytes 7..6) = `0x0105`
* `HW4` (Bytes 9..8) = `0x8533`
* `HW5` (Bytes 11..10) = `0x00C5`
* `HW6` (Bytes 13..12) = `0x4581`
* `HW7` (Bytes 15..14) = `0x0005`

#### Your Objective

1. For each half-word (`HW0` through `HW7`):
   * Extract length header bits `[1:0]`.
   * Classify whether the half-word is a **16-bit compressed instruction** or the **start of a 32-bit standard instruction**.
2. Construct the 8-bit **Length Vector ($\mathbf{L}$)** and derive the **Instruction Start Offset Vector ($\mathbf{P}$)**, identifying the exact memory start address ($PC$) and byte length of every valid instruction in the 16-byte window.
3. For all identified 16-bit compressed instructions, perform 16-to-32 bit decompression, synthesizing their equivalent 32-bit standard RISC-V assembly mnemonics and target registers.
4. Calculate pre-decoder propagation delay and verify static timing closure within the $312.5\text{-ps}$ clock period budget.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Inspect 2-Bit Length Headers `[1:0]` for All 8 Half-Words

Let's convert the lower 4 bits of each 16-bit half-word to binary and inspect Bits `[1:0]`:

##### 1. `HW0 = 0x4501` (Bytes 1..0, Address `0x00401000`):
* Binary representation of lower hex digit `1` = `0001_2`.
* Bits `[1:0] = 01_2`.
* Since `01_2 != 11_2` $\implies \mathbf{\text{16-Bit Compressed Instruction (RVC)!}}$ ($L_0 = 0$).

##### 2. `HW1 = 0x0101` (Bytes 3..2, Address `0x00401002`):
* Binary lower hex digit `1` = `0001_2` $\implies$ Bits `[1:0] = 01_2`.
* Since `01_2 != 11_2` $\implies \mathbf{\text{16-Bit Compressed Instruction (RVC)!}}$ ($L_1 = 0$).

##### 3. `HW2 = 0x2583` (Bytes 5..4, Address `0x00401004`):
* Binary lower hex digit `3` = `0011_2` $\implies$ Bits `[1:0] = 11_2`.
* Since `11_2 == 11_2` $\implies \mathbf{\text{Start of 32-Bit Standard Instruction!}}$ ($L_2 = 1$).

##### 4. `HW3 = 0x0105` (Bytes 7..6, Address `0x00401006`):
* This is the second half-word of the 32-bit instruction started at `HW2`.
* Bits `[1:0] = 01_2` ($L_3 = 0$).

##### 5. `HW4 = 0x8533` (Bytes 9..8, Address `0x00401008`):
* Binary lower hex digit `3` = `0011_2` $\implies$ Bits `[1:0] = 11_2`.
* Since `11_2 == 11_2` $\implies \mathbf{\text{Start of 32-Bit Standard Instruction!}}$ ($L_4 = 1$).

##### 6. `HW5 = 0x00C5` (Bytes 11..10, Address `0x0040100A`):
* This is the second half-word of the 32-bit instruction started at `HW4`.
* Bits `[1:0] = 01_2` ($L_5 = 0$).

##### 7. `HW6 = 0x4581` (Bytes 13..12, Address `0x0040100C`):
* Binary lower hex digit `1` = `0001_2` $\implies$ Bits `[1:0] = 01_2`.
* Since `01_2 != 11_2` $\implies \mathbf{\text{16-Bit Compressed Instruction (RVC)!}}$ ($L_6 = 0$).

##### 8. `HW7 = 0x0005` (Bytes 15..14, Address `0x0040100E`):
* Binary lower hex digit `5` = `0101_2` $\implies$ Bits `[1:0] = 01_2`.
* Since `01_2 != 11_2` $\implies \mathbf{\text{16-Bit Compressed Instruction (RVC)!}}$ ($L_7 = 0$).

```text
2-BIT LENGTH HEADER INSPECTION SUMMARY

 Half-Word │ Hex Value │ Bits [1:0] │ Length Classification │ Bit L_k
───────────┼───────────┼────────────┼───────────────────────┼─────────
    HW0    │  0x4501   │    01_2    │ 16-Bit Compressed     │    0
    HW1    │  0x0101   │    01_2    │ 16-Bit Compressed     │    0
    HW2    │  0x2583   │    11_2    │ 32-Bit Standard Start │    1
    HW3    │  0x0105   │    01_2    │ 32-Bit Second Half    │    0
    HW4    │  0x8533   │    11_2    │ 32-Bit Standard Start │    1
    HW5    │  0x00C5   │    01_2    │ 32-Bit Second Half    │    0
    HW6    │  0x4581   │    01_2    │ 16-Bit Compressed     │    0
    HW7    │  0x0005   │    01_2    │ 16-Bit Compressed     │    0
```

---

#### Step 2: Construct Length Vector $\mathbf{L}$ and Derive Start Offset Vector $\mathbf{P}$

##### 1. Length Vector $\mathbf{L} = (L_7, L_6, L_5, L_4, L_3, L_2, L_1, L_0)$:

$$\mathbf{L} = [0, 0, 0, 1, 0, 1, 0, 0]_2$$

##### 2. Sequential Boundary Mapping:
* **Inst 0**: Starts at `HW0` (`0x00401000`). $L_0 = 0 \implies$ **Length = 16 bits (2 bytes)**.
* **Inst 1**: Starts at `HW1` (`0x00401002`). $L_1 = 0 \implies$ **Length = 16 bits (2 bytes)**.
* **Inst 2**: Starts at `HW2` (`0x00401004`). $L_2 = 1 \implies$ **Length = 32 bits (4 bytes)** (Spans `HW2` and `HW3`).
* **Inst 3**: Starts at `HW4` (`0x00401008`). $L_4 = 1 \implies$ **Length = 32 bits (4 bytes)** (Spans `HW4` and `HW5`).
* **Inst 4**: Starts at `HW6` (`0x0040100C`). $L_6 = 0 \implies$ **Length = 16 bits (2 bytes)**.
* **Inst 5**: Starts at `HW7` (`0x0040100E`). $L_7 = 0 \implies$ **Length = 16 bits (2 bytes)**.

$$\text{Instruction Start Offset Vector } \mathbf{P} = [ \text{Byte } 0, \text{Byte } 2, \text{Byte } 4, \text{Byte } 8, \text{Byte } 12, \text{Byte } 14 ]$$

The 16-byte fetch window contains **6 valid instructions** (four 16-bit compressed and two 32-bit standard)!

---

#### Step 3: Decompress 16-Bit RVC Instructions into 32-Bit Standard RISC-V Instructions

Let us decompress the four 16-bit instructions using the RVC decompression rules:

##### 1. Instruction 0 at `HW0` (`0x4501`, Address `0x00401000`):
* Binary `0x4501` = `0100_0101_0000_0001_2`.
* Opcode `[1:0] = 01_2` (Quadrant 1). Opcode `[15:13] = 010_2` $\implies$ **`C.LI` (Load Immediate)**.
* Destination Register `[11:7] = 01010_2` = **`10`** (`x10` / `a0`).
* Immediate `[12|6:2] = 0_00000_2` = **`0`**.
* **Decompressed 32-Bit Instruction**: `addi x10, x0, 0` (`0x00000513`).

$$\mathbf{\text{Inst 0: } \mathtt{li \ x10, \ 0} \quad \text{or} \quad \mathtt{mv \ a0, \ zero}}$$

##### 2. Instruction 1 at `HW1` (`0x0101`, Address `0x00401002`):
* Binary `0x0101` = `0000_0001_0000_0001_2`.
* Opcode `[1:0] = 01_2` (Quadrant 1). Opcode `[15:13] = 000_2` $\implies$ **`C.ADDI` (Add Immediate)**.
* Destination Register `[11:7] = 00010_2` = **`2`** (`x2` / `sp`).
* Immediate = **`0`**.
* **Decompressed 32-Bit Instruction**: `addi x2, x2, 0` (`0x00010113`).

$$\mathbf{\text{Inst 1: } \mathtt{nop} \quad (\mathtt{c.addi \ sp, \ 0})}$$

##### 3. Instruction 2 at `HW2 + HW3` (`0x01052583`, Address `0x00401004`):
* Standard 32-bit instruction (`0x01052583`).
* Opcode `0x03` (`lw`), `rd = x11`, `rs1 = x10`, `imm = +16`.

$$\mathbf{\text{Inst 2: } \mathtt{lw \ x11, \ 16(x10)}}$$

##### 4. Instruction 3 at `HW4 + HW5` (`0x00C58533`, Address `0x00401008`):
* Standard 32-bit instruction (`0x00C58533`).
* Opcode `0x33` (`add`), `rd = x10`, `rs1 = x11`, `rs2 = x12`.

$$\mathbf{\text{Inst 3: } \mathtt{add \ x10, \ x11, \ x12}}$$

##### 5. Instruction 4 at `HW6` (`0x4581`, Address `0x0040100C`):
* Binary `0x4581` = `0100_0101_1000_0001_2`.
* Opcode `[1:0] = 01_2`. Opcode `[15:13] = 010_2` $\implies$ **`C.LI` (Load Immediate)**.
* Destination Register `[11:7] = 01011_2` = **`11`** (`x11` / `a1`).
* Immediate = **`0`**.

$$\mathbf{\text{Inst 4: } \mathtt{li \ x11, \ 0}}$$

##### 6. Instruction 5 at `HW7` (`0x0005`, Address `0x0040100E`):
* Binary `0x0005` = `0000_0000_0000_0101_2`.
* Opcode `[1:0] = 01_2`. Opcode `[15:13] = 000_2` $\implies$ **`C.NOP`**.

$$\mathbf{\text{Inst 5: } \mathtt{nop}}$$

---

#### Step 4: Timing Closure Verification of Pre-Decoder and Decompressor

Let us calculate the total propagation delay through the pre-decoder and decompressor datapath:

Given:
* L1I Fetch Register Clock-to-Q Delay: $t_{\text{C2Q}} = 30.0\text{ ps}$
* 2-Bit Header Length Check AND Gates: $t_{\text{header\_check}} = 5.0\text{ ps}$
* Boundary Mask Prefix-Scan Logic: $t_{\text{mask\_gen}} = 18.0\text{ ps}$
* Asynchronous 16-to-32 Decompressor Matrix: $t_{\text{decompress}} = 15.0\text{ ps}$
* Main Decoder Register Setup Time: $t_{\text{setup}} = 20.0\text{ ps}$

$$\text{Total Pre-Decoder Delay } t_{\text{predecode\_path}} = 30.0\text{ ps} + 5.0\text{ ps} + 18.0\text{ ps} + 15.0\text{ ps} + 20.0\text{ ps} = \mathbf{88.0 \text{ picoseconds}}$$

$$\text{Timing Slack} = T_{\text{clk}} - t_{\text{predecode\_path}} = 312.5\text{ ps} - 88.0\text{ ps} = \mathbf{+224.5 \text{ picoseconds}}$$

```text
PRE-DECODER PIPELINE TIMING BREAKDOWN

 Fetch Register (t_C2Q = 30 ps)
       │
       ▼
 2-Bit Header Length AND Gate (t_check = 5 ps)
       │
       ▼
 Boundary Mask Generator (t_mask = 18 ps)
       │
       ▼
 16-to-32 Decompressor Matrix (t_decomp = 15 ps)
       │
       ▼
 Main Decoder Setup (t_setup = 20 ps)
 (Total Path Delay = 88.0 ps < 312.5 ps Clock Period! PASSED!)
```

##### Timing Closure Result:
The $88.0\text{-picosecond}$ pre-decoder and decompressor datapath completes well within the $312.5\text{-ps}$ clock period budget, leaving **$+224.5\text{ picoseconds}$ of positive timing slack**. 

Variable-length pre-decoding and 16-to-32 bit decompression execute asynchronously within a single clock cycle!

---

### Sanity Check and Verification

Let us verify our mathematical and microarchitectural results:

1. **Fetch Window Byte Sum Check**:
   * Inst 0 (2B) + Inst 1 (2B) + Inst 2 (4B) + Inst 3 (4B) + Inst 4 (2B) + Inst 5 (2B) = **16 Bytes Total**.
   * Matches the 16-byte fetch window capacity exactly!
2. **2-Bit Length Header Rule Verification**:
   * `HW2` (`0x2583`) and `HW4` (`0x8533`) ended in hex digit `3` (`11_2`), identifying 32-bit instructions.
   * All other half-words ended in `1` or `5` (`01_2`), identifying 16-bit compressed instructions.
   * Length header detection was $100\%$ accurate.
3. **Decompression Accuracy Verification**:
   * Decompressed 32-bit instructions preserve identical register targets ($x10, x11, x2$) and opcode functions, ensuring that downstream 32-bit ALU execution units process the code with zero functional errors.

All 2-bit header checks, boundary mask generations, 16-to-32 bit instruction decompressions, byte window sum audits, and timing slack metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Fixed-Length Instruction Decoding**: The front-end decoding architecture where instructions are strictly 32 bits wide and 4-byte aligned, enabling $100\%$ deterministic $1\text{-cycle}$ parallel decoding across fixed 4-byte slice boundaries (`Bytes [3:0]`, `Bytes [7:4]`, `Bytes [11:8]`, `Bytes [15:12]`).
* **Compressed Instruction Stream**: The hybrid variable-width instruction architecture (such as RISC-V RVC) where 16-bit compressed instructions and 32-bit standard instructions are aligned to a 2-byte grid, allowing a 2-bit opcode length header (`HalfWord[1:0] == 11_2`) to generate an Instruction Boundary Mask and drive asynchronous 16-to-32 bit Decompressor Units in real time.
