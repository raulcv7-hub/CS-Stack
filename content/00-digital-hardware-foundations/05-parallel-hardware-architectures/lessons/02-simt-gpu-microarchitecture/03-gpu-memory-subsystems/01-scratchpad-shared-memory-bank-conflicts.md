content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/03-gpu-memory-subsystems/01-scratchpad-shared-memory-bank-conflicts.md
# Scratchpad Shared Memory Bank Conflicts and Multi-Bank Address Interleaving

## The Multi-Threaded SRAM Multi-Port Bottleneck and Bank Conflict Serialization

In Single Instruction, Multiple Threads (SIMT) GPU microarchitectures, parallel processing performance relies on launching thousands of concurrent scalar threads organized into execution bundles called **Warps** (typically 32 threads per warp). While GPU execution cores contain thousands of parallel floating-point arithmetic logic units (ALUs), their performance is fundamentally constrained by memory access latency. Reading data from off-chip global High-Bandwidth Memory (HBM) or Dynamic Random-Access Memory (DRAM) requires a long physical journey across motherboard buses, taking **400 to 800 clock cycles** ($200 \text{ to } 400\text{ nanoseconds}$).

To bypass off-chip DRAM latencies, GPU microarchitects equip every Streaming Multiprocessor (SM) with a high-speed, on-chip, software-managed Static RAM (SRAM) memory structure called **Scratchpad Shared Memory** (typically $48\text{ KB} \text{ to } 228\text{ KB}$ per SM). 

Scratchpad Shared Memory provides sub-nanosecond $1\text{-cycle to } 2\text{-cycle}$ data access speeds, allowing threads within the same thread block to stage data tiles from global memory, share intermediate results, and perform high-speed inter-thread communication.

When a 32-thread warp executes an instruction reading or writing Scratchpad Shared Memory (such as `LDS` - Load Shared, or `STS` - Store Shared), the memory subsystem aims to service all 32 thread accesses concurrently in **a single clock cycle**.

However, servicing 32 independent memory requests simultaneously in 1 clock cycle creates a monumental physical hardware challenge: **The Multi-Port SRAM Area Explosion**.

```text
THE MULTI-PORTED SRAM AREA EXPLOSION PROBLEM

 32-Ported Monolithic SRAM Array (32 Read Ports + 32 Write Ports)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Intersecting Bitlines x 32 Intersecting Wordlines        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         32² = 1,024 INTERSECTING WIRE CROSSING CHANNELS!
         (Consumes 90%+ of SM Silicon Area! Un-routable!)
```

To build a monolithic SRAM array capable of servicing 32 arbitrary 32-bit word requests concurrently, the SRAM cell matrix would require **32 independent physical read ports and 32 independent physical write ports**.

In CMOS semiconductor manufacturing, the silicon die area of a multi-ported SRAM cell scales quadratically with the total number of access ports $P$:

$$\text{Area}_{\text{SRAM}} \propto \text{Bits} \cdot P^2$$

A 64-port monolithic SRAM array occupies over **100 times more silicon area** than a single-ported array of identical storage capacity! 

The wire routing channels for 64 intersecting bitlines and wordlines would consume more physical silicon die space than the CUDA cores themselves, rendering the GPU chip physically un-routable and prohibitively expensive.

To avoid the quadratic area explosion of multi-ported SRAM, GPU architects do **NOT** build a 32-ported monolithic memory array. Instead, they divide Scratchpad Shared Memory into **32 independent, single-ported physical SRAM memory banks** (Bank 0 through Bank 31), interleaved at 32-bit (4-byte) word boundaries.

While multi-bank interleaving allows 32 distinct banks to be accessed in parallel in 1 clock cycle using cheap single-ported SRAM cells, it introduces a severe microarchitectural hazard: **The Scratchpad Shared Memory Bank Conflict**.

```text
32-WAY BANK CONFLICT SERIALIZATION STALL

 32 Threads in a Warp Requesting Shared Memory Addresses
 ┌─────────────────────────────────────────────────────────────┐
 │ Thread 0  ──► Requests Address 0x000 (Bank 0)               │
 │ Thread 1  ──► Requests Address 0x080 (Bank 0 - COLLISION!)  │
 │ Thread 2  ──► Requests Address 0x100 (Bank 0 - COLLISION!)  │
 │ ...                                                         │
 │ Thread 31 ──► Requests Address 0xF80 (Bank 0 - COLLISION!)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         BANK 0 SERIALIZES ALL 32 ACCESSES INTO 32 PHASES!
         (Execution time jumps from 1 Cycle to 32 Clock Cycles!)
```

Look at the physical failure during a bank conflict:
* If 32 threads in a warp attempt to read 32 *different* memory addresses that happen to map to the **EXACT SAME PHYSICAL MEMORY BANK** (e.g., all 32 threads requesting addresses that fall in Bank 0):
* The single-ported SRAM cell array in Bank 0 **cannot service multiple distinct address requests simultaneously**.
* The hardware bank arbiter is forced to **serialize the 32 thread accesses into 32 sequential clock cycles**!
* The warp's shared memory read execution time explodes from $1\text{ clock cycle}$ up to **$32\text{ clock cycles}$**, causing a $3,200\%$ latency spike and freezing the GPU execution pipeline!

How do shared memory controllers map physical addresses to SRAM banks? How do $K$-way bank conflicts serialize thread execution? How can software developers use **Array Padding** and **XOR Address Swizzling** to eliminate bank conflicts completely and restore $1\text{-cycle}$ parallel memory throughput?

To solve the multi-port SRAM bottleneck and eliminate memory access serialization, computer architects and systems programmers must master the physics of **Multi-Bank Address Interleaving** and **Bank Conflict Resolution**.

---

## The 32-Teller Bank Branch and the Single-Queue Bottleneck: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of scratchpad shared memory, 32-bank address interleaving, and $K$-way bank conflict serialization before inspecting bitwise address mapping formulas, bank crossbar networks, and matrix padding math, let us consider an everyday analogy: **The 32-Teller Commercial Bank Branch**.

Imagine a large commercial bank branch (**Scratchpad Shared Memory**) designed to service a group of **32 customers** (**32 Threads in a Warp: Customer 0 through Customer 31**) who walk into the building simultaneously at 9:00 AM sharp.

```text
THE 32-TELLER COMMERCIAL BANK BRANCH ANALOGY

 Bank Building (Scratchpad Shared Memory - 32 Parallel Single-Teller Windows)
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │Teller│Teller│Teller│Teller│...│Teller│Teller│Teller│Teller│
 │  31  │  30  │  29  │  28  │   │  3   │  2   │  1   │  0   │
 └──────┴──────┴──────┴──────┴───┴──────┴──────┴──────┴──────┘
```

The bank branch features **32 physical teller windows** (**32 Single-Ported SRAM Memory Banks: Teller 0 to Teller 31**). Each teller can service **only one customer transaction at a time** (taking 1 minute per customer).

The bank management assigns customers to tellers based on a strict mathematical rule:

$$\text{Your Assigned Teller Window Number} = \text{Your Account Number} \pmod{32}$$

Let us observe three different operational scenarios when 32 customers walk into the bank at 9:00 AM:

---

### Scenario A: Zero Bank Conflicts (1-Minute Parallel Service)

Each of the 32 customers holds an account number ending in a different modulo index ($0 \dots 31$):
* Customer 0 holds Account #100 $\implies 100 \pmod{32} = 4 \implies$ **Teller 4**.
* Customer 1 holds Account #101 $\implies 101 \pmod{32} = 5 \implies$ **Teller 5**.
* Customer 31 holds Account #131 $\implies 131 \pmod{32} = 3 \implies$ **Teller 3**.

Look at how the bank operates under Scenario A:
1. All 32 customers walk up to 32 *different* teller windows simultaneously.
2. All 32 tellers service all 32 customers in parallel.
3. All 32 customers finish their business and walk out the door in **1 minute**!

```text
SCENARIO A: ZERO BANK CONFLICTS (PARALLEL ACCESS)

 Cust 0 ──► Teller 0  (1 Minute) ──┐
 Cust 1 ──► Teller 1  (1 Minute)  ├──► ALL 32 CUSTOMERS SERVED IN 1 MINUTE!
  :                               │
 Cust 31──► Teller 31 (1 Minute) ──┘
```

This is the exact physical analogue of **Parallel 1-Cycle Shared Memory Access**.

---

### Scenario B: 32-Way Bank Conflict (32-Minute Serialization Stall!)

Now, suppose an un-optimized corporate payroll algorithm assigns account numbers to all 32 customers such that their account numbers differ by exact multiples of 32 (`#32`, `#64`, `#96`, `#128` ... `#1024`).

Let us calculate the assigned teller window for all 32 customers:
* Customer 0: Account #32 $\implies 32 \pmod{32} = \mathbf{\text{Teller 0}}$.
* Customer 1: Account #64 $\implies 64 \pmod{32} = \mathbf{\text{Teller 0 (COLLISION!)}}$.
* Customer 2: Account #96 $\implies 96 \pmod{32} = \mathbf{\text{Teller 0 (COLLISION!)}}$.
* Customer 31: Account #1024 $\implies 1024 \pmod{32} = \mathbf{\text{Teller 0 (COLLISION!)}}$.

Look at the physical disaster in the bank branch under Scenario B:
1. All 32 customers walk into the building and **queue up in a single long line at Teller Window 0**!
2. Tellers 1 through 31 sit completely idle with zero customers (**$96.9\%$ Wasted Hardware Capacity**).
3. Teller 0 must service the 32 customers **one-by-one in serial order**!
   * Minute 1: Teller 0 services Customer 0.
   * Minute 2: Teller 0 services Customer 1.
   * Minute 32: Teller 0 services Customer 31.
4. Total service time explodes from 1 minute up to **32 minutes**!

```text
SCENARIO B: 32-WAY BANK CONFLICT (SERIALIZATION STALL)

 Teller 0 Queue : [ Cust 0 ][ Cust 1 ][ Cust 2 ] ... [ Cust 31 ] (32 Minutes!)
 Tellers 1..31  : [ IDLE ] [ IDLE ] [ IDLE ] ... [ IDLE ]        (Wasted!)
 (All 32 customers serialized at Teller 0! Service time explodes by 3,200%!)
```

This is the exact physical analogue of a **32-Way Shared Memory Bank Conflict**.

---

### Scenario C: The Broadcast Exemption (1-Minute Multicast)

Now, suppose a different situation occurs: All 32 customers walk into the bank building, and **ALL 32 CUSTOMERS WANT TO READ THE EXACT SAME ACCOUNT STATEMENT (#32)**.

* Does Teller 0 service the 32 customers one-by-one in 32 minutes? **NO!**
* Teller 0 prints **ONE single copy of Account #32's statement** and holds it up in front of the room.
* All 32 customers read the statement simultaneously in **1 minute**!

```text
SCENARIO C: BROADCAST EXEMPTION (1-MINUTE MULTICAST)

 Teller 0 holds up ONE statement for Account #32 ──► All 32 Customers read it at once!
 (Zero conflict! Multicast completes in 1 Minute!)
```

> **The Multicast Broadcast Exemption Rule**: A bank conflict occurs ONLY when multiple threads request DIFFERENT addresses in the same bank. When multiple threads request the EXACT SAME address in the same bank, the hardware executes a **1-cycle Multicast Broadcast** with ZERO bank conflict stalls!

This commercial bank branch is the exact physical analogue of **Scratchpad Shared Memory Bank Interleaving**:
* The bank building is **Scratchpad Shared Memory (SRAM)**.
* The 32 customers are **32 Parallel Scalar Threads in a Warp**.
* The 32 teller windows are **32 Single-Ported Memory Banks**.
* Account numbers are **Physical Shared Memory Byte Addresses**.
* Modulo 32 teller assignment is **Multi-Bank Address Interleaving**.
* Queuing up at Teller 0 is a **$K$-Way Bank Conflict Serialization Stall**.
* Holding up one statement for 32 customers is **Shared Memory Broadcast Multicast**.

---

## Primitive 1: Scratchpad Shared Memory Architecture

Now that we possess a clear intuitive mental model of the 32-teller bank branch, let us examine the formal, rigorous engineering mechanics of **Scratchpad Shared Memory**.

In a GPU Streaming Multiprocessor (SM), **Scratchpad Shared Memory** is an on-chip, software-managed L1-level SRAM storage array shared by all thread blocks executing on that SM.

Unlike an automatic hardware L1 cache—which fetches and evicts cache lines transparently behind the software's back—Scratchpad Shared Memory is **explicitly managed by the software programmer**. The programmer allocates shared memory buffers in CUDA/HIP code using the `__shared__` keyword, explicitly stages data tiles from global memory into shared SRAM, and controls when data is read or written.

```text
SCRATCHPAD SHARED MEMORY LOCATION IN GPU MEMORY HIERARCHY

 Streaming Multiprocessor (SM) Hardware Boundary
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 SIMT Execution Lanes (CUDA Cores)                        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
   Sub-Nanosecond Access Latency│ (1 to 2 Clock Cycles!)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Scratchpad Shared Memory Array (48 KB to 228 KB On-Chip SRAM)│
 └──────────────────────────────┬──────────────────────────────┘
                                │
   High-Latency Off-Chip Memory │ (400 to 800 Clock Cycles!)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Off-Chip Global Memory (HBM / DRAM)                         │
 └─────────────────────────────────────────────────────────────┘
```

---

### Hardware 32-Bank Interleaving Architecture

To deliver 32 parallel 32-bit word reads or writes per clock cycle without building expensive multi-ported SRAM cells, Scratchpad Shared Memory is physically divided into **32 independent single-ported physical SRAM memory banks** ($B = 32$ banks: Bank 0 through Bank 31).

Each bank has a data width of **32 bits (4 bytes / 1 word)**.

Physical byte addresses ($A$) are mapped to the 32 memory banks using **Low-Order Word Interleaving**:

$$\mathbf{\text{Bank\_ID}(A) = \left\lfloor \frac{A}{4} \right\rfloor \pmod{32}}$$

Where:
* $A$ is the 32-bit or 64-bit physical shared memory byte address.
* $\lfloor A / 4 \rfloor$ is the 32-bit word address (discarding the lowest 2 byte-offset bits $[1:0]$).
* $\pmod{32}$ extracts the bank index ($0 \le \text{Bank\_ID} < 32$).

```text
32-BANK INTERLEAVED SHARED MEMORY ADDRESS MAP

 Shared Memory Word Addresses (4 Bytes per Word)
 ┌───────────┬───────────┬───────────┬───────────┬───┬───────────┐
 │ Bank 0    │ Bank 1    │ Bank 2    │ Bank 3    │...│ Bank 31   │
 ├───────────┼───────────┼───────────┼───────────┼───┼───────────┤
 │ Word 0    │ Word 1    │ Word 2    │ Word 3    │...│ Word 31   │ ◄── Row 0 (Bytes 0..127)
 │ (0x000)   │ (0x004)   │ (0x008)   │ (0x00C)   │   │ (0x07C)   │
 ├───────────┼───────────┼───────────┼───────────┼───┼───────────┤
 │ Word 32   │ Word 33   │ Word 34   │ Word 35   │...│ Word 63   │ ◄── Row 1 (Bytes 128..255)
 │ (0x080)   │ (0x084)   │ (0x088)   │ (0x08C)   │   │ (0x0FC)   │
 └───────────┴───────────┴───────────┴───────────┴───┴───────────┘
```

Look at how consecutive 32-bit words are assigned across physical banks:
* Word 0 (`0x000`): Maps to **Bank 0**.
* Word 1 (`0x004`): Maps to **Bank 1**.
* Word 2 (`0x008`): Maps to **Bank 2**.
* Word 31 (`0x07C`): Maps to **Bank 31**.
* Word 32 (`0x080`): Wraps around to **Bank 0** (Row 1 of Bank 0)!
* Word 33 (`0x084`): Wraps around to **Bank 1** (Row 1 of Bank 1)!

---

### Extracting Bank IDs using Bitwise Address Masking

In digital hardware logic, because the bank count $B = 32 = 2^5$ is an exact power of two, the modulo 32 operation ($\lfloor A / 4 \rfloor \pmod{32}$) requires **ZERO active logic gates**!

It is implemented by extracting **bits $[6:2]$ of the shared memory byte address vector**:

$$\mathbf{\text{Bank\_ID}(A) = A[6:2]}$$

```text
64-BIT SHARED MEMORY ADDRESS BIT FIELD PARSING

 Bit 63                                              Bit 7 Bit 6  Bit 2 Bit 1 Bit 0
 ┌────────────────────────────────────────────────────────┬────────────┬───────────┐
 │ Un-used Upper Address Bits                             │  Bank_ID   │ Byte Off  │
 └────────────────────────────────────────────────────────┴────────────┴───────────┘
  ◄──────────────────────────────────────────────────────► ◄── 5 Bits ─► ◄─ 2 Bits ─►
                                                           (Selects Bank 0..31)
```

* **Bits $[1:0]$**: Select the specific byte within the 4-byte word ($00_2 = \text{Byte 0}$, $11_2 = \text{Byte 3}$).
* **Bits $[6:2]$ (5 Bits)**: Select 1 of 32 physical memory banks ($00000_2 = \text{Bank 0}$ to $11111_2 = \text{Bank 31}$).
* **Bits $[63:7]$**: Select the row index (word line) within the designated SRAM bank.

---

## Primitive 2: Bank Conflict Resolution and $K$-Way Conflict Serialization

Now let us examine the second core primitive: **Bank Conflict Resolution** and **$K$-Way Serialization Mechanics**.

When a warp of 32 threads dispatches a shared memory instruction, 32 memory addresses ($A_0, A_1, \dots, A_{31}$) are generated simultaneously by the 32 execution lanes.

The shared memory crossbar switch routes these 32 addresses to their respective target banks ($\text{Bank\_ID}(A_0) \dots \text{Bank\_ID}(A_{31})$).

---

### Defining $K$-Way Bank Conflicts

Let $A_i$ and $A_j$ be two shared memory byte addresses requested by Thread $i$ and Thread $j$ ($i \neq j$) within the same warp.

A **Bank Conflict** occurs if and only if two or more threads request **different word addresses** that map to the **exact same physical memory bank**:

$$\text{Bank\_Conflict Condition: } \mathbf{\text{Bank\_ID}(A_i) == \text{Bank\_ID}(A_j) \quad \mathbf{\text{AND}} \quad \lfloor A_i / 4 \rfloor \neq \lfloor A_j / 4 \rfloor}$$

Where:
* $\text{Bank\_ID}(A_i)$ is the bank index assigned to Thread $i$'s request ($A_i[6:2]$).
* $\lfloor A_i / 4 \rfloor$ is the 32-bit word address requested by Thread $i$.

```text
BANK CONFLICT VS CONFLICT-FREE CRITERIA

 Case 1: CONFLICT-FREE (Distinct Banks)
 Thread 0 -> Bank 0 (Word 0)  │ Thread 1 -> Bank 1 (Word 1)
 (32 distinct banks -> Executed in 1 Clock Cycle!)

 Case 2: K-WAY BANK CONFLICT (Collision!)
 Thread 0 -> Bank 0 (Word 0)  │ Thread 1 -> Bank 0 (Word 32)
 (Same Bank, DIFFERENT Words -> Serialized over K Clock Cycles!)

 Case 3: MULTICAST BROADCAST (No Conflict!)
 Thread 0 -> Bank 0 (Word 0)  │ Thread 1 -> Bank 0 (Word 0)
 (Same Bank, SAME Word -> 1-Cycle Multicast Broadcast!)
```

We define the **Degree of Conflict ($K$)** as the maximum number of distinct word requests hitting any single SRAM bank during a warp access:

$$K = \max_{b=0}^{31} \left( \text{Count of unique word addresses mapping to Bank } b \right)$$

---

### Hardware $K$-Way Serialization Execution Pipeline

When a $K$-way bank conflict occurs ($K > 1$), the shared memory bank arbiter automatically **serializes the memory access into $K$ sequential memory phases**:

```text
K-WAY BANK CONFLICT SERIALIZATION TIMELINE (K = 4)

 Phase 1 (Cycle 1): Bank Arbiter Services 1st Wave of Non-Conflicting Requests
 Phase 2 (Cycle 2): Bank Arbiter Services 2nd Wave of Conflicting Requests
 Phase 3 (Cycle 3): Bank Arbiter Services 3rd Wave of Conflicting Requests
 Phase 4 (Cycle 4): Bank Arbiter Services 4th Wave of Conflicting Requests
 ◄───────────────────── 4 Clock Cycles Total Latency ─────────────────────►
```

#### Execution Steps for a $K$-Way Conflict:
1. **Phase 1 (Cycle 1)**: The bank arbiter selects 1 request per bank, services them, and delivers data to the corresponding threads. The remaining $K-1$ conflicting threads are **stalled**.
2. **Phase 2 (Cycle 2)**: The bank arbiter services the 2nd wave of conflicting requests.
3. **Phase $K$ (Cycle $K$)**: The bank arbiter services the final $K$-th wave of conflicting requests.

$$\mathbf{\text{Shared Memory Access Latency (Cycles)} = K \times T_{\text{bank\_access}}}$$

Where:
* $K$ is the degree of bank conflict ($1 \le K \le 32$).
* $T_{\text{bank\_access}}$ is the base SRAM bank access time (typically $1 \text{ to } 2\text{ clock cycles}$).

If $K = 32$ (a 32-way conflict), the warp's shared memory access takes **32 consecutive clock cycles**!

---

## 2D Array Column Transposition and Software Padding Optimizations

In real-world GPU software engineering, bank conflicts are rarely caused by random chance. They are almost always caused by **2D Array Column Traversals** where data strides align with power-of-two bank boundaries.

### The 2D Array Column Stride Hazard

Consider a 2D matrix of 32-bit floating-point numbers containing 32 rows and 32 columns stored in row-major order inside Scratchpad Shared Memory:

```c
__shared__ float smem[32][32]; // 32 rows x 32 columns = 1,024 floats (4 KB)
```

Let us calculate the shared memory byte address for element `smem[row][col]`:

$$\text{Address}(\text{row}, \text{col}) = (\text{row} \cdot 32 + \text{col}) \times 4 \text{ Bytes}$$

Now, trace two different memory access patterns executed across a 32-thread warp:

#### Access Pattern 1: Row Traversal (`smem[0][threadIdx.x]`) — ZERO CONFLICTS
Each thread $i$ ($0 \le i < 32$) reads a different column in Row 0:
* Thread 0 reads `smem[0][0]` $\implies \text{Addr} = (0 + 0) \times 4 = 0 \implies \text{Bank } 0$.
* Thread 1 reads `smem[0][1]` $\implies \text{Addr} = (0 + 1) \times 4 = 4 \implies \text{Bank } 1$.
* Thread 31 reads `smem[0][31]` $\implies \text{Addr} = (0 + 31) \times 4 = 124 \implies \text{Bank } 31$.

$$\text{Bank\_ID}(i) = i \pmod{32}$$

All 32 threads access **32 distinct banks**! **Zero bank conflicts ($K = 1$, 1 cycle execution)**!

---

#### Access Pattern 2: Column Traversal (`smem[threadIdx.x][0]`) — 32-WAY CONFLICT!
Each thread $i$ reads Column 0 of a different row $i$:
* Thread 0 reads `smem[0][0]` $\implies \text{Addr} = (0 \cdot 32 + 0) \times 4 = 0 \implies \mathbf{\text{Bank } 0}$.
* Thread 1 reads `smem[1][0]` $\implies \text{Addr} = (1 \cdot 32 + 0) \times 4 = 128 \implies \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$.
* Thread 2 reads `smem[2][0]` $\implies \text{Addr} = (2 \cdot 32 + 0) \times 4 = 256 \implies \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$.
* Thread 31 reads `smem[31][0]` $\implies \text{Addr} = (31 \cdot 32 + 0) \times 4 = 3968 \implies \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$.

$$\text{Bank\_ID}(i) = (i \cdot 32) \pmod{32} = \mathbf{0 \quad \text{for ALL 32 Threads!}}$$

```text
COLUMN TRAVERSAL 32-WAY BANK COLLISION MAP

 Thread 0  (smem[0][0])  ──► Address 0    ──► Bank 0
 Thread 1  (smem[1][0])  ──► Address 128  ──► Bank 0 (COLLISION!)
 Thread 2  (smem[2][0])  ──► Address 256  ──► Bank 0 (COLLISION!)
 Thread 31 (smem[31][0]) ──► Address 3968 ──► Bank 0 (COLLISION!)
 (ALL 32 THREADS COLLIDE IN BANK 0! Access takes 32 Clock Cycles!)
```

Look at the catastrophe:
When reading down a column of a `32x32` matrix, **all 32 threads land in Bank 0**! 

The access is serialized over 32 clock cycles, and execution throughput drops by $96.9\%$!

---

### The Software Fix: Array Column Padding (`smem[32][33]`)

How can a software developer eliminate this 32-way bank conflict without changing their algorithm?

The developer adds **1 dummy padding column** to the shared memory array declaration:

```c
// PADDED SHARED MEMORY DECLARATION (ELIMINATES ALL BANK CONFLICTS!)
__shared__ float smem_padded[32][33]; // Padded to 33 columns!
```

Let us recalculate the shared memory byte address for `smem_padded[row][col]`:

$$\text{Address}_{\text{padded}}(\text{row}, \text{col}) = (\text{row} \cdot \mathbf{33} + \text{col}) \times 4 \text{ Bytes}$$

Now, trace Column Traversal (`smem_padded[threadIdx.x][0]`) on the padded array:
* Thread 0 reads `smem_padded[0][0]` $\implies \text{Addr} = (0 \cdot 33 + 0) \times 4 = 0 \implies \mathbf{\text{Bank } 0}$.
* Thread 1 reads `smem_padded[1][0]` $\implies \text{Addr} = (1 \cdot 33 + 0) \times 4 = 132 \implies \mathbf{\text{Bank } 1 \quad (\text{NO CONFLICT!})}$.
* Thread 2 reads `smem_padded[2][0]` $\implies \text{Addr} = (2 \cdot 33 + 0) \times 4 = 264 \implies \mathbf{\text{Bank } 2 \quad (\text{NO CONFLICT!})}$.
* Thread $i$ reads `smem_padded[i][0]` $\implies \text{Bank\_ID} = (i \cdot 33) \pmod{32} = \mathbf{i \pmod{32}}$.

```text
PADDED ARRAY COLUMN MAPPING (33 COLUMNS)

 Thread 0  (smem_padded[0][0])  ──► Bank_ID = (0 * 33) % 32 = Bank 0
 Thread 1  (smem_padded[1][0])  ──► Bank_ID = (1 * 33) % 32 = Bank 1  (NO COLLISION!)
 Thread 2  (smem_padded[2][0])  ──► Bank_ID = (2 * 33) % 32 = Bank 2  (NO COLLISION!)
 Thread 31 (smem_padded[31][0]) ──► Bank_ID = (31 * 33) % 32 = Bank 31 (NO COLLISION!)
 (All 32 threads land in 32 DISTINCT BANKS! Access completes in 1 Cycle!)
```

##### Look at the extraordinary result of adding 1 dummy float padding column:
* **Bank Conflicts drop from 32-way down to ZERO!**
* Memory access time collapses from **32 clock cycles down to 1 clock cycle**!
* Execution speed increases by **$3,200\%$** ($32\times$ faster throughput) by allocating just 128 bytes of dummy padding space!

---

### Hardware Solution: XOR Address Swizzling

In modern GPU hardware (such as NVIDIA Hopper and Ada Lovelace architectures), shared memory controllers incorporate **XOR Address Swizzling** in hardware:

Instead of computing $\text{Bank\_ID} = A[6:2]$, the hardware XORs higher-order address bits into the bank select bits:

$$\mathbf{\text{Swizzled\_Bank\_ID}(A) = A[6:2] \quad \mathbf{\text{XOR}} \quad A[11:7]}$$

By XORing row bits $[11:7]$ into bank bits $[6:2]$, 2D matrix columns are automatically scattered across different physical banks **in hardware**, eliminating bank conflicts even if the programmer forgot to pad the array in software!

---

## Solved Industrial Engineering Exercise: Quantitative Shared Memory Bank Mapping, $K$-Way Conflict Serialization, and Matrix Padding Analysis

To consolidate your complete mastery of Scratchpad Shared Memory bank interleaving, $K$-way conflict serialization, array padding math, and XOR address swizzling, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the Scratchpad Shared Memory subsystem of a $2.0\text{ GHz}$ GPU Streaming Multiprocessor ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The SM features **32 physical single-ported SRAM memory banks** ($B = 32\text{ banks}$, Bank 0 to Bank 31), interleaved at 4-byte (32-bit word) boundaries.

$$\text{Bank\_ID}(A) = \left\lfloor \frac{A}{4} \right\rfloor \pmod{32} = A[6:2]$$

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR SHARED MEMORY

 Clock Frequency        : 2.0 GHz (T_clk = 500 ps)
 Scratchpad Shared SRAM : 64 KB per SM (32 Single-Ported Banks)
 Base Bank Access Time  : 1 Clock Cycle (0.500 ns)
 Serialization Penalty  : +1 Clock Cycle per conflicting access wave
```

#### Workload Array Allocation:
A matrix transposition kernel allocates a 2D shared memory array of 32-bit floats (`float smem[16][16]`, containing 256 floats, total size $1,024\text{ bytes}$).

A 32-thread warp executes a strided access pattern where thread $i$ ($0 \le i < 32$) reads address $A_i$:

$$A_i = \text{Base\_Addr} + (i \cdot S_{\text{bytes}})$$

Where $\text{Base\_Addr} = \text{0x0000}$ ($0\text{ bytes}$).

#### Your Objective

1. Analyze **Case 1: Unit-Stride Access ($S_{\text{bytes}} = 4\text{ bytes}$)**:
   * Calculate physical byte addresses $A_0 \dots A_{31}$ and their Bank IDs.
   * Determine the degree of conflict $K_1$, total execution cycles, access latency (in nanoseconds), and effective bandwidth (in GB/sec).
2. Analyze **Case 2: 2-Way Strided Access ($S_{\text{bytes}} = 8\text{ bytes}$)**:
   * Calculate physical byte addresses $A_0 \dots A_{31}$ and their Bank IDs.
   * Determine the degree of conflict $K_2$, total execution cycles, access latency (in nanoseconds), and effective bandwidth (in GB/sec).
3. Analyze **Case 3: 16-Way Strided Access ($S_{\text{bytes}} = 64\text{ bytes}$)**:
   * Calculate physical byte addresses $A_0 \dots A_{31}$ and their Bank IDs.
   * Determine the degree of conflict $K_3$, total execution cycles, and effective bandwidth.
4. Evaluate **Software Matrix Padding**: Software pads the array row stride from 16 floats ($64\text{ bytes}$) to 17 floats ($68\text{ bytes}$).
   * Recalculate Bank IDs for Column Access (`smem_padded[i][0]`).
   * Calculate the new degree of conflict $K_{\text{padded}}$, new execution cycles, and the **Performance Speedup Factor** over Case 3.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Case 1 (Unit-Stride Access: $S_{\text{bytes}} = 4\text{ Bytes}$)

Addresses $A_i = 0 + i \times 4\text{ bytes}$ for threads $i = 0 \dots 31$:
* $A_0 = 0 \implies \text{Bank } 0$.
* $A_1 = 4 \implies \text{Bank } 1$.
* $A_2 = 8 \implies \text{Bank } 2$.
* $A_{31} = 124 \implies \text{Bank } 31$.

$$\text{Bank\_ID}(A_i) = \left\lfloor \frac{i \cdot 4}{4} \right\rfloor \pmod{32} = i \pmod{32}$$

##### 1. Conflict Degree $K_1$:
All 32 threads land in **32 distinct banks (Banks 0..31)**.

$$K_1 = \mathbf{1 \quad (\text{ZERO BANK CONFLICTS!})}$$

##### 2. Execution Time & Bandwidth:
* Total Execution Cycles $= K_1 \times 1\text{ cycle} = \mathbf{1 \text{ Clock Cycle}}$.
* Access Latency $T_1 = 1 \times 0.500\text{ ns} = \mathbf{0.500 \text{ nanoseconds}}$.
* Data Payload $= 32 \text{ threads} \times 4 \text{ bytes} = 128 \text{ Bytes}$.

$$\text{BW}_{\text{Case1}} = \frac{128\text{ Bytes}}{0.500 \times 10^{-9}\text{ s}} = \mathbf{256.0 \times 10^9 \text{ Bytes/sec}} = \mathbf{256.0 \text{ GB/sec}}$$

---

#### Step 2: Analyze Case 2 (2-Way Strided Access: $S_{\text{bytes}} = 8\text{ Bytes}$)

Addresses $A_i = 0 + i \times 8\text{ bytes}$ for threads $i = 0 \dots 31$:

$$\text{Bank\_ID}(A_i) = \left\lfloor \frac{i \cdot 8}{4} \right\rfloor \pmod{32} = (2 \cdot i) \pmod{32}$$

Let's evaluate Bank IDs for threads $0 \dots 31$:
* Thread 0: $(2 \times 0) \pmod{32} = \mathbf{\text{Bank } 0}$.
* Thread 1: $(2 \times 1) \pmod{32} = \mathbf{\text{Bank } 2}$.
* Thread 15: $(2 \times 15) \pmod{32} = \mathbf{\text{Bank } 30}$.
* Thread 16: $(2 \times 16) \pmod{32} = 32 \pmod{32} = \mathbf{\text{Bank } 0 \quad (\text{COLLISION WITH THREAD 0!})}$.
* Thread 17: $(2 \times 17) \pmod{32} = 34 \pmod{32} = \mathbf{\text{Bank } 2 \quad (\text{COLLISION WITH THREAD 1!})}$.

```text
CASE 2 BANK MAPPING PATTERN (2-WAY CONFLICT)

 Bank 0  ◄── Thread 0 (Word 0) AND Thread 16 (Word 32) -> 2-WAY CONFLICT!
 Bank 2  ◄── Thread 1 (Word 2) AND Thread 17 (Word 34) -> 2-WAY CONFLICT!
 ...
 Bank 30 ◄── Thread 15 (Word 30) AND Thread 31 (Word 62) -> 2-WAY CONFLICT!
 (Only EVEN banks 0, 2, 4...30 are accessed! Odd banks sit IDLE!)
```

##### 1. Conflict Degree $K_2$:
Only 16 even banks are accessed, with **2 threads hitting each even bank**.

$$K_2 = \mathbf{2 \quad (\text{2-WAY BANK CONFLICT!})}$$

##### 2. Execution Time & Bandwidth:
* Total Execution Cycles $= K_2 \times 1\text{ cycle} = \mathbf{2 \text{ Clock Cycles}}$.
* Access Latency $T_2 = 2 \times 0.500\text{ ns} = \mathbf{1.000 \text{ nanoseconds}}$.

$$\text{BW}_{\text{Case2}} = \frac{128\text{ Bytes}}{1.000 \times 10^{-9}\text{ s}} = \mathbf{128.0 \text{ GB/sec}} \quad (\mathbf{50\% \text{ Bandwidth Loss!}})$$

---

#### Step 3: Analyze Case 3 (16-Way Strided Access: $S_{\text{bytes}} = 64\text{ Bytes}$)

Addresses $A_i = 0 + i \times 64\text{ bytes}$ for threads $i = 0 \dots 31$:

$$\text{Bank\_ID}(A_i) = \left\lfloor \frac{i \cdot 64}{4} \right\rfloor \pmod{32} = (16 \cdot i) \pmod{32}$$

Let's evaluate Bank IDs for threads $0 \dots 31$:
* Thread 0: $(16 \times 0) \pmod{32} = \mathbf{\text{Bank } 0}$.
* Thread 1: $(16 \times 1) \pmod{32} = \mathbf{\text{Bank } 16}$.
* Thread 2: $(16 \times 2) \pmod{32} = 32 \pmod{32} = \mathbf{\text{Bank } 0 \quad (\text{COLLISION!})}$.
* Thread 3: $(16 \times 3) \pmod{32} = 48 \pmod{32} = \mathbf{\text{Bank } 16 \quad (\text{COLLISION!})}$.
* Threads $0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 \implies \mathbf{16 \text{ Threads hit Bank 0!}}$
* Threads $1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31 \implies \mathbf{16 \text{ Threads hit Bank 16!}}$

```text
CASE 3 BANK MAPPING PATTERN (16-WAY CONFLICT)

 Bank 0  ◄── 16 EVEN Threads (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30)
 Bank 16 ◄── 16 ODD Threads  (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31)
 (Only Banks 0 and 16 accessed! 30 Banks sit IDLE! Execution takes 16 Cycles!)
```

##### 1. Conflict Degree $K_3$:
Only Banks 0 and 16 are accessed, with **16 threads colliding in each bank**.

$$K_3 = \mathbf{16 \quad (\text{16-WAY BANK CONFLICT!})}$$

##### 2. Execution Time & Bandwidth:
* Total Execution Cycles $= K_3 \times 1\text{ cycle} = \mathbf{16 \text{ Clock Cycles}}$.
* Access Latency $T_3 = 16 \times 0.500\text{ ns} = \mathbf{8.000 \text{ nanoseconds}}$.

$$\text{BW}_{\text{Case3}} = \frac{128\text{ Bytes}}{8.000 \times 10^{-9}\text{ s}} = \mathbf{16.0 \text{ GB/sec}} \quad (\mathbf{93.75\% \text{ Bandwidth Loss!}})$$

---

#### Step 4: Evaluate Software Array Padding Optimization ($S_{\text{padded}} = 68\text{ Bytes}$)

Software pads the matrix row stride from 16 floats ($64\text{ bytes}$) to **17 floats ($68\text{ bytes}$)**.

Addresses $A_i = 0 + i \times 68\text{ bytes}$ for threads $i = 0 \dots 31$:

$$\text{Bank\_ID}_{\text{padded}}(A_i) = \left\lfloor \frac{i \cdot 68}{4} \right\rfloor \pmod{32} = (17 \cdot i) \pmod{32}$$

Let's evaluate Bank IDs for threads $0 \dots 31$:
* Thread 0: $(17 \times 0) \pmod{32} = \mathbf{\text{Bank } 0}$.
* Thread 1: $(17 \times 1) \pmod{32} = \mathbf{\text{Bank } 17}$.
* Thread 2: $(17 \times 2) \pmod{32} = 34 \pmod{32} = \mathbf{\text{Bank } 2}$.
* Thread 3: $(17 \times 3) \pmod{32} = 51 \pmod{32} = \mathbf{\text{Bank } 19}$.
* Thread $i$: Since $\gcd(17, 32) = 1$ (17 and 32 are coprime!), **all 32 products $(17 \cdot i) \pmod{32}$ generate a complete, unique permutation of integers $0 \dots 31$!**

```text
PADDED ARRAY BANK MAPPING RESULT

 Bank Assignment Sequence for Threads 0..31:
 [ 0, 17, 2, 19, 4, 21, 6, 23, 8, 25, 10, 27, 12, 29, 14, 31,
  16,  1, 18, 3, 20, 5, 22, 7, 24, 9, 26, 11, 28, 13, 30, 15 ]
 (ALL 32 THREADS LAND IN 32 DISTINCT BANKS! ZERO CONFLICTS!)
```

##### 1. Conflict Degree $K_{\text{padded}}$:
All 32 threads land in **32 distinct banks**.

$$K_{\text{padded}} = \mathbf{1 \quad (\text{ZERO BANK CONFLICTS!})}$$

##### 2. Execution Time & Bandwidth:
* Total Execution Cycles $= 1 \times 1\text{ cycle} = \mathbf{1 \text{ Clock Cycle}}$.
* Access Latency $T_{\text{padded}} = 1 \times 0.500\text{ ns} = \mathbf{0.500 \text{ nanoseconds}}$.
* Effective Bandwidth $\text{BW}_{\text{padded}} = \mathbf{256.0 \text{ GB/sec}}$.

##### 3. Calculate Performance Speedup Factor (Padded vs Case 3):

$$\text{Speedup} = \frac{T_{\text{Case3}}}{T_{\text{padded}}} = \frac{8.000\text{ ns}}{0.500\text{ ns}} = \frac{16\text{ cycles}}{1\text{ cycle}} = \mathbf{16.00\times \text{ Performance Speedup!}}$$

```text
SHARED MEMORY BANK CONFLICT OPTIMIZATION SUMMARY

 Access Stride Configuration│ Conflict Degree K │ Execution Cycles │ Access Latency │ Read Bandwidth
───────────────────────────┼───────────────────┼──────────────────┼────────────────┼────────────────
 Case 1: Unit-Stride S=4B   │ K = 1 (No Conf)   │ 1 Cycle          │ 0.50 ns        │ 256.0 GB/sec
 Case 2: 2-Way Stride S=8B  │ K = 2 (2-Way)     │ 2 Cycles         │ 1.00 ns        │ 128.0 GB/sec
 Case 3: 16-Way Stride S=64B│ K = 16 (16-Way)   │ 16 Cycles        │ 8.00 ns        │  16.0 GB/sec
 Padded Stride S=68B        │ K = 1 (No Conf!)  │ 1 Cycle          │ 0.50 ns        │ 256.0 GB/sec
                            │ (100% Conflict-Free!) (15 Cycles Saved)│ (7.5 ns Saved) │ (16x FASTER!)
```

##### Engineering Conclusion:
Padding the array row stride by 1 dummy float ($64\text{ B} \to 68\text{ B}$) eliminated $100\%$ of bank conflicts, cutting execution time from 16 cycles down to 1 cycle—delivering a **$16.00\times$ performance speedup ($1,500\%$ throughput gain)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and bank mapping results against GPU memory principles:

1. **Coprime Bank Permutation Check**:
   * Stride multiplier $= 17$. Bank count $B = 32$.
   * Greatest Common Divisor $\gcd(17, 32) = 1$.
   * By Number Theory (Modular Arithmetic Permutations), if $\gcd(S_{\text{words}}, B) = 1$, the sequence $(i \cdot S_{\text{words}}) \pmod B$ is guaranteed to visit all $B$ banks without repeating a single bank index until $i = B$.
   * Zero bank conflicts mathematically proven!
2. **Conflict Serialization Latency Check**:
   * Case 3 (16-way conflict) required 16 serial waves on Banks 0 and 16.
   * Access time $= 16 \times 0.5\text{ ns} = 8.00\text{ ns}$.
   * Speedup $= 16 / 1 = 16.00\times$. Math is $100\%$ exact.
3. **Multicast Exemption Rule**:
   * If all 32 threads had requested address `0x0000` (Word 0 in Bank 0), $K = 1$ because the hardware executes 1-cycle Multicast Broadcast.

All shared memory modulo bank formulas, $K$-way conflict serialization timing equations, coprime array padding proofs, and 16x speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Scratchpad Shared Memory**: An on-chip, software-managed L1-level SRAM storage array ($48\text{ KB} \text{ to } 228\text{ KB}$ per SM) divided into 32 independent physical memory banks, enabling $1\text{-cycle}$ multi-thread data staging and inter-thread communication.
* **Bank Conflict Resolution**: The microarchitectural mechanism that handles multi-thread address collisions within the same SRAM bank, serializing $K$ distinct word accesses over $K$ clock cycles while using array padding ($[32][33]$) or XOR address swizzling to restore $1\text{-cycle}$ parallel execution.
