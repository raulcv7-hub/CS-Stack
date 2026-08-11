content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/03-gpu-memory-subsystems/02-coalesced-global-memory-access.md
# Memory Coalescing Unit Architecture and Coalesced Bus Transaction Mechanics

## The Off-Chip Memory Bus Bandwidth Collapse and Un-Coalesced Memory Serialization

In graphics processing units (GPUs) and massively parallel SIMT architectures, processing performance depends on delivering data from off-chip global memory (High-Bandwidth Memory / HBM or GDDR6 DRAM) to thousands of parallel execution lanes. A modern GPU contains thousands of arithmetic logic units (ALUs) organized into Streaming Multiprocessors (SMs) executing thread bundles called **Warps** (32 threads per warp). When a 32-thread warp executes a global memory load instruction (such as `LDG.E R1, [R2]`), all 32 threads generate 32 individual 32-bit (4-byte) or 64-bit (8-byte) memory addresses simultaneously.

However, off-chip global memory hardware (HBM/GDDR) does not operate like an ideal, byte-addressable random access memory that can fetch 32 arbitrary, scattered 4-byte words in a single clock cycle.

Off-chip DRAM memory interfaces are physical, high-width parallel buses that transfer data strictly in large, fixed-size physical blocks called **Memory Segments** or **Cache Lines** (typically 32 bytes, 64 bytes, or 128 bytes wide, aligned to 32-byte or 128-byte physical memory boundaries).

When a warp executes a global memory read instruction, the hardware memory subsystem faces an immediate physical bandwidth challenge:

```text
THE GLOBAL MEMORY BANDWIDTH EFFICIENCY SPECTRUM

 Ideal Coalesced Access (1 Memory Segment Transferred)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Threads request 32 contiguous 4-byte words (128 Bytes)   │
 │ All 128 bytes fall INSIDE ONE 128-byte physical memory line │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         1 SINGLE 128-BYTE BUS TRANSACTION DISPATCHED!
         (100% Memory Bus Bandwidth Efficiency!)

 Un-Coalesced Strided Access (32 Memory Segments Transferred!)
 ┌─────────────────────────────────────────────────────────────┐
 │ 32 Threads request 32 scattered 4-byte words (128 Bytes)    │
 │ Each of the 32 words falls inside a DIFFERENT 32-byte line  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         32 SEPARATE BUS TRANSACTIONS DISPATCHED (1,024 BYTES)!
         (12.5% Memory Bus Bandwidth Efficiency! 87.5% WASTED!)
```

Let us analyze the physical efficiency contrast between these two access patterns:

### Scenario 1: Ideal Coalesced Memory Access
All 32 threads in the warp request 32-bit (4-byte) data words located at contiguous physical byte addresses:
* Thread 0 reads byte offset `0..3`.
* Thread 1 reads byte offset `4..7`.
* Thread 2 reads byte offset `8..11`.
* $\dots$
* Thread 31 reads byte offset `124..127`.

The total volume of data requested by the 32 threads is $32 \times 4\text{ bytes} = 128\text{ bytes}$. Because all 32 requested words sit side-by-side within the exact same 128-byte physical memory line, the GPU memory subsystem dispatches **1 single 128-byte bus transaction** across the off-chip memory bus.

$$\text{Bandwidth Efficiency}_{\text{coalesced}} = \frac{\text{Bytes Requested}}{\text{Bytes Transferred}} = \frac{128\text{ Bytes Requested}}{128\text{ Bytes Transferred}} \times 100\% = \mathbf{100.0\%}$$

Every single byte fetched across the off-chip memory bus is consumed by a CPU/GPU execution lane. Zero bandwidth is wasted!

---

### Scenario 2: Un-Coalesced / Non-Contiguous Memory Access
Now, suppose the warp executes a strided or pointer-chasing memory access where each thread $i$ requests a 4-byte word at address $A_i = A_0 + i \times 128\text{ bytes}$ (or random sparse addresses):
* Thread 0 requests an address in Memory Segment 0.
* Thread 1 requests an address in Memory Segment 1.
* $\dots$
* Thread 31 requests an address in Memory Segment 31.

Look at the physical memory bus disaster that occurs:
1. To deliver the $128\text{ bytes}$ of useful data requested by the 32 threads ($32 \times 4\text{ bytes}$), the memory controller cannot fetch just 128 bytes. It MUST issue **32 separate 32-byte or 128-byte memory transactions** over the off-chip bus!
2. To satisfy the request, the DRAM interface transmits $32 \times 32\text{ bytes} = 1,024\text{ bytes}$ (or $32 \times 128\text{ bytes} = 4,096\text{ bytes}$) of data across the motherboard traces!

$$\text{Bandwidth Efficiency}_{\text{un-coalesced}} = \frac{128\text{ Bytes Requested}}{1,024\text{ Bytes Transferred}} \times 100\% = \mathbf{12.5\%}$$

$$\text{Bandwidth Efficiency}_{\text{128B-lines}} = \frac{128\text{ Bytes Requested}}{4,096\text{ Bytes Transferred}} \times 100\% = \mathbf{3.125\%}$$

Look at the catastrophe:
* Over **$87.5\%$ to $96.875\%$ of the GPU's multi-terabyte-per-second memory bandwidth is completely wasted** transmitting unwanted junk bytes!
* The off-chip memory bus becomes completely saturated with redundant transactions.
* The memory controller request queues overflow, and the warp execution pipeline freezes for hundreds of clock cycles waiting for 32 sequential memory transactions to complete!

How does a GPU inspect the 32 addresses generated by a warp in real time, detect spatial alignment across 32-byte, 64-byte, or 128-byte memory segments, merge matching requests into the minimum possible number of bus transfers, and prevent memory bandwidth collapse?

To solve this problem, GPU microarchitectures implement the **Memory Coalescing Unit** and **Coalesced Bus Transactions**.

---

## The Cargo Delivery Truck and the 32 Neighbors: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of memory coalescing units, memory segment alignment, and coalesced bus transactions before inspecting gate-level address parsing logic, segment matching tables, and bandwidth efficiency equations, let us consider an everyday analogy: **The Automated Cargo Delivery Fleet**.

Imagine a commercial delivery company (**The Off-Chip DRAM Memory Subsystem**) delivering packages (**Memory Data Words**) to residents living in a city (**Memory Address Space**).

```text
THE AUTOMATED CARGO DELIVERY ANALOGY

 Delivery Truck Company (DRAM Memory Subsystem)
 ┌─────────────────────────────────────────────────────────────┐
 │ Fixed Standard Cargo Crate Size = 128 Kilograms (128 Bytes) │
 │ Trucks ONLY drive full 128-kg crates to a street block!     │
 └─────────────────────────────────────────────────────────────┘
```

The delivery company operates under a strict physical rule:
* The company does not deliver tiny 4-kilogram packages individually. 
* All deliveries are packed into standardized **128-Kilogram Cargo Crates** (**128-Byte Memory Segments**). Whenever a delivery truck drives out to a street block, it delivers an entire 128-kg crate.

32 customers (**32 Scalar Threads in a Warp**) place online orders for small **4-kilogram items** (**4-Byte Data Words**).

Let us observe two different delivery scenarios:

---

### Scenario A: The Coalesced Neighborhood Delivery (Coalesced Access)

All 32 customers live side-by-side on the **exact same street block** (`House 0 to House 31`):
* Customer 0 orders Item 0 (4 kg).
* Customer 1 orders Item 1 (4 kg).
* $\dots$
* Customer 31 orders Item 31 (4 kg).

Look at how the delivery company handles Scenario A:
1. The company's smart logistics dispatcher (**The Memory Coalescing Unit**) inspects the 32 delivery addresses.
2. The dispatcher realizes that all 32 ordered items ($32 \times 4\text{ kg} = 128\text{ kg}$) fit perfectly inside **a single 128-kg cargo crate** destined for that exact street block!
3. The company dispatches **1 single delivery truck** carrying 1 crate.
4. The truck arrives at the block, drops off the crate, and all 32 customers receive their items in a single trip.

```text
SCENARIO A: COALESCED DELIVERY (1 TRUCK TRIP)

 32 Customers on Same Block ──► Dispatcher packs 32 items into 1 Crate
                                ──► 1 Delivery Truck Dispatched!
                                ──► 100% Freight Efficiency!
```

**Delivery Efficiency = 100%!** Zero fuel or truck space was wasted.

---

### Scenario B: The Un-Coalesced Scattered Delivery (Un-Coalesced Access)

Now, suppose the 32 customers live in **32 completely different cities across the country**:
* Customer 0 lives in City 0.
* Customer 1 lives in City 1.
* $\dots$
* Customer 31 lives in City 31.

Look at the logistics nightmare in Scenario B:
1. The smart logistics dispatcher inspects the 32 delivery addresses.
2. Because the 32 customers live on 32 different street blocks, the items **CANNOT fit into a single crate** destined for one block!
3. The delivery company is forced to dispatch **32 separate delivery trucks**, each carrying a 128-kg crate containing a 4-kg item and 124 kg of empty packing foam!
4. The company burns fuel for 32 trucks to deliver 128 kg of actual payload.

```text
SCENARIO B: UN-COALESCED DELIVERY (32 TRUCK TRIPS!)

 Customer 0 in City 0  ──► Dispatch Truck 1  (delivers 4 kg item + 124 kg foam)
 Customer 1 in City 1  ──► Dispatch Truck 2  (delivers 4 kg item + 124 kg foam)
 ...
 Customer 31 in City 31──► Dispatch Truck 32 (delivers 4 kg item + 124 kg foam)
 (32 Trucks dispatched! 96.875% of truck fuel and space WASTED!)
```

**Delivery Efficiency = 3.125%!** $96.875\%$ of the company's delivery capacity was wasted transporting packing foam!

---

### Scenario C: The Shifted Alignment Penalty (Misaligned Access)

Now, consider a subtle edge case: All 32 customers live side-by-side, BUT their houses are shifted by 1 position: they live in `House 1 through House 32` (instead of `House 0 to House 31`).

Street blocks are divided into fixed 32-house regions (`Block 0 = Houses 0..31`, `Block 1 = Houses 32..63`).

* Houses 1 through 31 sit on **Block 0**.
* House 32 sits on **Block 1**.

Look at what happens to the delivery:
* The 32 items cannot fit into 1 crate because House 32 is on Block 1!
* The dispatcher MUST send **2 delivery trucks**:
  * Truck 1 delivers Crate 0 to Block 0 (servicing Houses 1..31).
  * Truck 2 delivers Crate 1 to Block 1 (servicing House 32).
* A simple 1-house misalignment doubled the number of required trucks from 1 to 2!

This automated delivery fleet is the exact physical analogue of **The Memory Coalescing Unit and Coalesced Bus Transactions**:
* The 32 customers are **32 Parallel Scalar Threads in a Warp**.
* The 4-kg items are **4-Byte Data Words**.
* The 128-kg cargo crate is a **128-Byte Physical Memory Segment / DRAM Cache Line**.
* The logistics dispatcher is **The Hardware Memory Coalescing Unit**.
* Dispatching 1 truck for 32 neighbors is a **Coalesced Memory Bus Transaction**.
* Dispatching 32 trucks for scattered customers is an **Un-Coalesced Memory Serialization**.
* Shifting houses by 1 position is a **Misaligned Memory Access**.

---

## Primitive 1: The Memory Coalescing Unit

Now that we possess a clear intuitive mental model of the smart logistics dispatcher, let us examine the formal engineering mechanics of **The Memory Coalescing Unit**.

In a GPU Streaming Multiprocessor (SM), memory requests generated by warp execution lanes pass through a specialized hardware block inside the Load/Store Unit (LSU): **The Memory Coalescing Unit** (also known as the **Address Coalescer** or **Memory Request Segmenter**).

> **A Memory Coalescing Unit** is a dedicated, high-speed hardware circuit inside a GPU's Load/Store Unit that inspects the physical memory addresses ($A_0, A_1, \dots, A_{31}$) generated by all active threads in a warp, evaluates their spatial alignment against physical memory segment boundaries, and merges matching requests into the minimum possible number of physical bus transactions.

```text
MEMORY COALESCING UNIT HARDWARE ARCHITECTURE

 32 Active Threads Generating Addresses (A0, A1, A2 ... A31)
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │Addr31│Addr30│Addr29│Addr28│...│Addr 3│Addr 2│Addr 1│Addr 0│
 └──┬───┴──┬───┴──┬───┴──┬───┴───┴──┬───┴──┬───┴──┬───┴──┬───┘
    │      │      │      │          │      │      │      │
    ▼      ▼      ▼      ▼          ▼      ▼      ▼      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ MEMORY COALESCING UNIT (Address Segment Matching Matrix)    │
 │  1. Extract Segment Base Addresses: Seg_i = Addr_i & ~127   │
 │  2. Run 32x32 Parallel Comparator Network                   │
 │  3. Count Unique Segments & Group Active Byte Enables       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         Optimized Coalesced Bus Transactions Dispatched
         (1, 2, 4, or 32 physical memory bus requests!)
```

---

### The 4-Step Hardware Coalescing Algorithm

On every global memory instruction, the Memory Coalescing Unit executes a 4-step hardware pipeline algorithm in $1 \text{ to } 2\text{ clock cycles}$:

#### Step 1: Address Parsing & Segment Identification
The coalescing unit receives up to 32 physical byte addresses ($A_0 \dots A_{31}$) from the active threads in the warp.

For each active thread $i$, the coalescing unit extracts the **Memory Segment Base Address ($\text{Seg}_i$)** by masking off the lower offset bits:

$$\mathbf{\text{Seg}_i = A_i \quad \mathbf{\text{AND}} \quad \sim(W_{\text{segment}} - 1)}$$

Where:
* $A_i$ is the physical memory byte address requested by Thread $i$.
* $W_{\text{segment}}$ is the hardware memory segment size in bytes (e.g., $32, 64, \text{or } 128\text{ bytes}$).
* $\sim(W_{\text{segment}} - 1)$ is a bitmask clearing the lower $\log_2(W_{\text{segment}})$ offset bits.

For a 128-byte segment size ($W_{\text{segment}} = 128 = 2^7$), the bitmask clears the lowest 7 bits ($[6:0]$):

$$\text{Seg}_i = A_i \quad \mathbf{\text{AND}} \quad \text{64'hFFFF\_FFFF\_FFFF\_FF80}$$

---

#### Step 2: Parallel Address Comparator Matrix
The coalescing unit passes all 32 calculated segment base addresses ($\text{Seg}_0 \dots \text{Seg}_{31}$) through a $32 \times 32$ **Parallel Comparator Matrix**.

The comparator matrix evaluates which threads target the exact same physical memory segment:

$$\text{Match}_{i,j} = (M_{\text{active}}[i] == 1) \ \ \mathbf{\text{AND}} \ \ (M_{\text{active}}[j] == 1) \ \ \mathbf{\text{AND}} \ \ (\text{Seg}_i == \text{Seg}_j)$$

Where:
* $M_{\text{active}}[i]$ is the Active Thread Mask bit for Thread $i$.
* $\text{Match}_{i,j} = 1$ if Thread $i$ and Thread $j$ are both active and target the exact same memory segment.

---

#### Step 3: Segment Deduplication & Byte-Enable Consolidation
The coalescing unit counts the total number of **unique memory segments** $N_{\text{segments}}$ required to cover all active threads.

For each unique segment $k$, the coalescing unit consolidates the requested byte ranges into a **Segment Byte-Enable Mask ($\text{Byte\_En}_k[127:0]$)**:

$$\text{Byte\_En}_k[b] = 1 \quad \text{if any active thread requests byte } b \text{ within Segment } k$$

---

#### Step 4: Coalesced Transaction Dispatch
The coalescing unit dispatches $N_{\text{segments}}$ physical memory requests across the interconnect bus to the L2 Cache / DRAM controllers:
* If $N_{\text{segments}} = 1$: **1 coalesced transaction is dispatched** ($100\%$ bus efficiency).
* If $N_{\text{segments}} = 2$: **2 coalesced transactions are dispatched** ($50\%$ bus efficiency).
* If $N_{\text{segments}} = 32$: **32 un-coalesced transactions are dispatched** ($3.125\%$ bus efficiency).

---

## Primitive 2: Coalesced Bus Transactions

Now let us examine the second core primitive: **Coalesced Bus Transactions**.

> **A Coalesced Bus Transaction** is an aligned, optimal physical memory bus transfer where the memory requests of all active threads in a warp are satisfied by the minimum possible number of physical memory segment fills ($N_{\text{segments}} = 1 \text{ or } 2$), maximizing off-chip bus bandwidth utilization.

```text
PHYSICAL SEGMENT ALIGNMENT BOUNDARIES (128-BYTE SEGMENTS)

 Segment 0 (0x0000..0x007F)        Segment 1 (0x0080..0x00FF)
 ┌───────────────────────────────┐ ┌───────────────────────────────┐
 │ Bytes 0..127                  │ │ Bytes 128..255                │
 └───────────────────────────────┘ └───────────────────────────────┘
  ▲                             ▲   ▲                             ▲
  0x0000                        0x007F 0x0080                     0x00FF
```

---

### Aligned vs. Misaligned Access Mechanics

To achieve a single $100\%$ efficient coalesced transaction ($N_{\text{segments}} = 1$), a memory request must satisfy two strict physical hardware criteria:
1. **Contiguity**: All active threads in the warp must request adjacent data words ($A_{i+1} = A_i + W_{\text{elem}}$).
2. **Alignment**: The starting address of Thread 0 ($A_0$) must be an exact mathematical multiple of the segment size $W_{\text{segment}}$:

$$A_0 \pmod{W_{\text{segment}}} == 0$$

Let us examine what happens when memory accesses violate these criteria:

---

#### Case A: Contiguous & Aligned Access ($A_0 = \text{0x1000}$, 32-Bit Floats)
* Thread 0 reads `0x1000` ($0_{10}$). Thread 1 reads `0x1004` ($4_{10}$). $\dots$ Thread 31 reads `0x107C` ($124_{10}$).
* Start address $A_0 = \text{0x1000} = 4,096_{10}$.
* Alignment check: $4,096 \pmod{128} = 0 \implies$ **PERFECTLY ALIGNED!**
* All 32 requested words (bytes `0x1000` to `0x107F`) sit inside **Segment `0x1000`**.

$$\mathbf{N_{\text{segments}} = 1 \quad \implies \quad 1 \text{ Bus Transaction Dispatched} \quad (\mathbf{100.0\% \text{ Bandwidth Efficiency}})}$$

```text
CASE A: PERFECTLY ALIGNED COALESCED ACCESS

 Addresses: 0x1000 .. 0x107F (128 Bytes total)
 ┌─────────────────────────────────────────────────────────────┐
 │ Thread 0 │ Thread 1 │ Thread 2 │ ... │ Thread 30 │ Thread 31 │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
         1 SINGLE 128-BYTE SEGMENT TRANSACTION DISPATCHED!
```

---

#### Case B: Contiguous BUT Misaligned Access ($A_0 = \text{0x1004}$, Shifted by 4 Bytes)
Now, suppose a software programmer accesses a contiguous array that is shifted by just **4 bytes** (e.g., starting at address `0x1004` instead of `0x1000`):
* Thread 0 reads `0x1004` ($4_{10}$). Thread 1 reads `0x1008` ($8_{10}$). $\dots$ Thread 30 reads `0x107C` ($124_{10}$).
* **Thread 31 reads `0x1080` ($128_{10}$)**!
* Alignment check: $4,100 \pmod{128} = 4 \neq 0 \implies$ **MISALIGNED!**

Look at the physical memory segments required to cover this request:
* Threads 0 through 30 request bytes `0x1004` to `0x107C`, which fall inside **Segment `0x1000`** (`0x1000 .. 0x107F`).
* **Thread 31 requests bytes `0x1080` to `0x1083`**, which falls across the boundary into **Segment `0x1080`** (`0x1080 .. 0x10FF`)!

```text
CASE B: MISALIGNED ACCESS CROSSES SEGMENT BOUNDARY

 Segment 0x1000 (128 Bytes)          Segment 0x1080 (128 Bytes)
 ┌───────────────────────────────┐   ┌───────────────────────────────┐
 │ ... │ Thread 0 ... Thread 30  │   │ Thread 31 │ ...               │
 └───────────────────────────────┘   └───────────────────────────────┘
  ◄─────── Transaction 1 ───────►     ◄─────── Transaction 2 ───────►
```

The Memory Coalescing Unit detects that the request spans two physical segments:

$$\mathbf{N_{\text{segments}} = 2 \quad \implies \quad 2 \text{ Bus Transactions Dispatched!}}$$

To deliver $128\text{ bytes}$ of useful data, the memory bus must transmit $256\text{ bytes}$ ($2 \times 128\text{ B}$):

$$\text{Bandwidth Efficiency}_{\text{misaligned}} = \frac{128\text{ Bytes Requested}}{256\text{ Bytes Transferred}} \times 100\% = \mathbf{50.0\%}$$

##### Performance Consequence:
A simple 4-byte misalignment **doubled the required memory bus transactions from 1 to 2**, cutting memory bandwidth in half!

---

#### Case C: Strided Access ($A_i = A_0 + i \times 8\text{ Bytes}$, Stride $= 2$)
Suppose threads read every 2nd element of a 64-bit array ($S = 8\text{ bytes}$):
* Thread 0 reads `0x1000`. Thread 1 reads `0x1008`. $\dots$ Thread 15 reads `0x1078`.
* Threads 0 through 15 (16 threads, 128 bytes total) fill **Segment `0x1000`**.
* Thread 16 reads `0x1080`. $\dots$ Thread 31 reads `0x10F8`.
* Threads 16 through 31 fill **Segment `0x1080`**.

$$\mathbf{N_{\text{segments}} = 2 \quad \implies \quad 2 \text{ Bus Transactions Dispatched} \quad (\mathbf{50.0\% \text{ Bandwidth Efficiency}})}$$

---

## Data Layout Optimization: Array of Structures (AoS) vs. Structure of Arrays (SoA)

Understanding memory coalescing is the single most important factor when designing high-performance parallel data structures.

The choice of data layout in software—**Array of Structures (AoS)** versus **Structure of Arrays (SoA)**—determines whether GPU memory accesses execute as $100\%$ coalesced single transactions or collapse into un-coalesced multi-transaction stalls.

```text
DATA LAYOUT STRUCTURAL COMPARISON

 Array of Structures (AoS - Object-Oriented Layout - POOR FOR GPUS!)
 ┌─────────────────────────────────────────────────────────────┐
 │ [X0, Y0, Z0, W0] [X1, Y1, Z1, W1] [X2, Y2, Z2, W2] ...      │
 └─────────────────────────────────────────────────────────────┘
  (Threads reading X coordinates suffer 16-byte strided accesses -> UN-COALESCED!)

 Structure of Arrays (SoA - Data-Oriented Layout - OPTIMAL FOR GPUS!)
 ┌─────────────────────────────────────────────────────────────┐
 │ X Array: [ X0,  X1,  X2,  X3,  X4,  X5,  X6 ... X31 ]        │
 │ Y Array: [ Y0,  Y1,  Y2,  Y3,  Y4,  Y5,  Y6 ... Y31 ]        │
 └─────────────────────────────────────────────────────────────┘
  (Threads reading X coordinates read CONTIGUOUS bytes -> 100% COALESCED!)
```

---

### 1. Array of Structures (AoS — Object-Oriented Design)
In traditional object-oriented programming (C/C++), developers define structures representing entities (e.g., 3D Particles) and allocate a continuous array of these structures:

```c
// OBJECT-ORIENTED LAYOUT (ARRAY OF STRUCTURES - AoS)
struct Particle {
    float x, y, z, mass; // 16 bytes per particle struct
};
struct Particle particles[1000];
```

Memory layout on disk/RAM: `[x0, y0, z0, m0,  x1, y1, z1, m1,  x2, y2, z2, m2 ...]`

Suppose a GPU kernel updates the `x` positions of all particles:

```c
// KERNEL READS ONLY 'x' POSITION
__global__ void update_x(struct Particle *p) {
    int i = (blockIdx.x * blockDim.x) + threadIdx.x;
    p[i].x += 1.0f; // Thread i reads p[i].x
}
```

#### Trace Memory Accesses under AoS:
* Thread 0 reads `p[0].x` at address `0x1000`.
* Thread 1 reads `p[1].x` at address `0x1010` (`0x1000 + 16 bytes`).
* Thread 2 reads `p[2].x` at address `0x1020` (`0x1000 + 32 bytes`).
* Thread 31 reads `p[31].x` at address `0x11F0` (`0x1000 + 496 bytes`).

Look at the memory access stride:
The byte stride between adjacent threads is **$S = 16\text{ bytes}$**!
The 32 threads span $32 \times 16 = 512\text{ bytes}$ of memory (spanning **four 128-byte memory segments**)!

$$\mathbf{N_{\text{segments}} = 4 \quad \implies \quad 4 \text{ Bus Transactions Dispatched!}}$$

$$\text{Bandwidth Efficiency}_{\text{AoS}} = \frac{32 \times 4\text{ Bytes Requested}}{4 \times 128\text{ Bytes Transferred}} = \frac{128}{512} = \mathbf{25.0\%}$$

Four memory transactions were required, and $75\%$ of the fetched memory bandwidth was wasted loading un-needed `y`, `z`, and `mass` fields!

---

### 2. Structure of Arrays (SoA — Data-Oriented Design)
To achieve $100\%$ coalescing, data-oriented software architects refactor the data structure into a **Structure of Arrays (SoA)**:

```c
// DATA-ORIENTED LAYOUT (STRUCTURE OF ARRAYS - SoA)
struct ParticleSystem {
    float x[1000]; // 1000 contiguous x floats
    float y[1000]; // 1000 contiguous y floats
    float z[1000]; // 1000 contiguous z floats
    float mass[1000];
};
```

Memory layout on disk/RAM:
* `x` array: `[x0, x1, x2, x3, x4 ... x31]` (Contiguous 128 bytes!)
* `y` array: `[y0, y1, y2, y3, y4 ... y31]`

#### Trace Memory Accesses under SoA:
* Thread 0 reads `x[0]` at address `0x1000`.
* Thread 1 reads `x[1]` at address `0x1004`.
* Thread 2 reads `x[2]` at address `0x1008`.
* Thread 31 reads `x[31]` at address `0x107C`.

Look at the memory access stride:
The 32 threads read 32 contiguous 4-byte floats spanning bytes `0x1000` to `0x107F`—which fit **$100\%$ inside a single 128-byte memory segment**!

$$\mathbf{N_{\text{segments}} = 1 \quad \implies \quad 1 \text{ Bus Transaction Dispatched!}}$$

$$\text{Bandwidth Efficiency}_{\text{SoA}} = \frac{128\text{ Bytes Requested}}{128\text{ Bytes Transferred}} = \mathbf{100.0\%}$$

```text
AOS VS SOA BANDWIDTH EFFICIENCY SUMMARY

 Data Layout Format │ Bus Transactions Required │ Memory Bandwidth Efficiency
────────────────────┼───────────────────────────┼───────────────────────────────
 AoS (Object-Orient)│ 4 Bus Transactions (512B) │ 25.0% Efficiency (75% Wasted)
 SoA (Data-Oriented)│ 1 Bus Transaction  (128B) │ 100.0% Efficiency (0% Wasted!)
                    │ (4x Fewer Transactions!)  │ (4x PERFORMANCE SPEEDUP!)
```

##### Engineering Conclusion:
Refactoring the data structure from Array of Structures (AoS) to Structure of Arrays (SoA) reduced off-chip memory transactions from 4 down to 1, delivering a **$4.0\times$ performance speedup ($300\%$ bandwidth increase)** without changing a single line of mathematical logic!

---

## Solved Industrial Engineering Exercise: Quantitative Memory Coalescing, Misalignment Penalty, and Bus Bandwidth Analysis

To consolidate your complete mastery of memory coalescing units, segment address parsing, misalignment penalties, AoS vs SoA efficiency, and bus transaction counts, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior memory microarchitect auditing the global memory subsystem for a $2.0\text{ GHz}$ GPU Streaming Multiprocessor ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The GPU is connected to off-chip High-Bandwidth Memory (HBM3) operating at a peak bandwidth $\text{BW}_{\text{peak}} = 1.6\text{ Terabytes/second}$ ($1,600\text{ GB/sec}$).

The off-chip memory subsystem transfers data in aligned **32-byte physical memory segments** ($W_{\text{segment}} = 32\text{ bytes}$).
* Memory Bus Transaction Delay: $T_{\text{bus\_tx}} = 16\text{ GPU clock cycles}$ ($8.0\text{ ns}$) per 32-byte segment transaction.

```text
2.0 GHz GPU GLOBAL MEMORY SUBSYSTEM SPECIFICATIONS

 Clock Frequency       : 2.0 GHz (T_clk = 500 ps)
 Peak HBM3 Bandwidth   : 1,600 GB/sec (1.6 TB/sec)
 Memory Segment Size   : 32 Bytes (Aligned to 32-Byte Boundaries)
 Transaction Delay     : 16 Clock Cycles per 32-Byte Segment Fill
 Warp Size             : 32 Threads per Warp
```

#### Workload Memory Access Patterns:
A 32-thread warp executes a global memory read instruction (`LDG.E R1, [R2]`) where each thread reads a 32-bit (4-byte) single-precision float ($32 \times 4\text{ bytes} = 128\text{ bytes}$ total data requested).

We evaluate four distinct software memory access patterns:
* **Pattern 1 (Contiguous & Aligned)**: Thread $i$ reads address $A_i = \text{0x1000} + (i \cdot 4)$. Starting address $A_0 = \text{0x1000}$ ($4,096_{10}$).
* **Pattern 2 (Contiguous & Misaligned by 12 Bytes)**: Thread $i$ reads address $A_i = \text{0x100C} + (i \cdot 4)$. Starting address $A_0 = \text{0x100C}$ ($4,108_{10}$).
* **Pattern 3 (2D Matrix Stride = 16 Bytes / AoS Layout)**: Thread $i$ reads address $A_i = \text{0x1000} + (i \cdot 16)$.
* **Pattern 4 (Random Sparse Accesses)**: All 32 threads request addresses located in 32 completely different 32-byte memory segments.

#### Your Objective

1. For **Pattern 1 (Contiguous & Aligned)**:
   * Calculate the 32-byte segment base addresses $\text{Seg}_i = A_i \ \& \ \sim 31$.
   * Calculate total 32-byte bus transactions dispatched ($N_{\text{segments}}$), memory bus bandwidth efficiency ($\eta_{\text{bw}}$), and total read latency (in nanoseconds).
2. For **Pattern 2 (Contiguous & Misaligned by 12 Bytes)**:
   * Calculate the range of physical addresses requested.
   * Determine the number of 32-byte segments spanned, total bus transactions dispatched, memory bus bandwidth efficiency, and performance loss vs Pattern 1.
3. For **Pattern 3 (AoS Layout, Stride = 16 Bytes)**:
   * Determine the number of 32-byte segments spanned, total bus transactions dispatched, and memory bus bandwidth efficiency.
4. For **Pattern 4 (Random Sparse Accesses)**:
   * Calculate total bus transactions dispatched, total bytes transferred, and effective achievable memory bandwidth (in GB/sec).
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Pattern 1 (Contiguous & Aligned — $A_0 = \text{0x1000}$)

* Address Range: $A_0 = \text{0x1000} \ (4,096_{10})$ to $A_{31} = \text{0x107C} \ (4,220_{10})$.
* Total Bytes Requested = $32 \times 4 = 128\text{ Bytes}$.

##### 1. Calculate 32-Byte Segment Base Addresses ($\text{Seg}_i = A_i \ \& \ \sim 31$):
* $A_0 \dots A_7$ (`0x1000` to `0x101C`): $\text{Seg} = \text{0x1000} \ \& \ \sim 31 = \mathbf{\text{Segment 0x1000}}$ (`0x1000..0x101F`).
* $A_8 \dots A_{15}$ (`0x1020` to `0x103C`): $\text{Seg} = \text{0x1020} \ \& \ \sim 31 = \mathbf{\text{Segment 0x1020}}$ (`0x1020..0x103F`).
* $A_{16} \dots A_{23}$ (`0x1040` to `0x105C`): $\text{Seg} = \text{0x1040} \ \& \ \sim 31 = \mathbf{\text{Segment 0x1040}}$ (`0x1040..0x105F`).
* $A_{24} \dots A_{31}$ (`0x1060` to `0x107C`): $\text{Seg} = \text{0x1060} \ \& \ \sim 31 = \mathbf{\text{Segment 0x1060}}$ (`0x1060..0x107F`).

```text
PATTERN 1 SEGMENT MAPPING (4 SEGMENTS OF 32 BYTES)

 Segment 0x1000 (32B) ──► Services Threads  0.. 7 (8 Threads x 4B = 32B)
 Segment 0x1020 (32B) ──► Services Threads  8..15 (8 Threads x 4B = 32B)
 Segment 0x1040 (32B) ──► Services Threads 16..23 (8 Threads x 4B = 32B)
 Segment 0x1060 (32B) ──► Services Threads 24..31 (8 Threads x 4B = 32B)
 (4 Segments x 32 Bytes = 128 Bytes Transferred! 100% PERFECT COALESCING!)
```

##### 2. Performance Metrics for Pattern 1:
* Total 32-Byte Segments Transferred $N_{\text{segments}} = \mathbf{4 \text{ Transactions}}$.
* Total Bytes Transferred = $4 \times 32\text{ bytes} = 128\text{ Bytes}$.

$$\eta_{\text{bw,Pattern1}} = \frac{128\text{ Bytes Requested}}{128\text{ Bytes Transferred}} \times 100\% = \mathbf{100.0\% \text{ Bandwidth Efficiency}}$$

$$\text{Read Latency} = 4 \text{ segments} \times 16 \text{ cycles/segment} = \mathbf{64 \text{ Clock Cycles}} \quad (32.0\text{ ns})$$

$$\text{Effective Bandwidth} = \text{BW}_{\text{peak}} \times 1.00 = \mathbf{1,600.0 \text{ GB/sec}}$$

---

#### Step 2: Analyze Pattern 2 (Contiguous & Misaligned by 12 Bytes — $A_0 = \text{0x100C}$)

* Address Range: $A_0 = \text{0x100C} \ (4,108_{10})$ to $A_{31} = \text{0x1088} \ (4,232_{10})$.
* Total Bytes Requested = $128\text{ Bytes}$.

##### 1. Calculate 32-Byte Segment Base Addresses ($\text{Seg}_i = A_i \ \& \ \sim 31$):
* $A_0 \dots A_4$ (`0x100C` to `0x101C`, 5 threads): $\text{Seg} = \mathbf{\text{Segment 0x1000}}$ (`0x1000..0x101F`).
* $A_5 \dots A_{12}$ (`0x1020` to `0x103C`, 8 threads): $\text{Seg} = \mathbf{\text{Segment 0x1020}}$ (`0x1020..0x103F`).
* $A_{13} \dots A_{20}$ (`0x1040` to `0x105C`, 8 threads): $\text{Seg} = \mathbf{\text{Segment 0x1040}}$ (`0x1040..0x105F`).
* $A_{21} \dots A_{28}$ (`0x1060` to `0x107C`, 8 threads): $\text{Seg} = \mathbf{\text{Segment 0x1060}}$ (`0x1060..0x107F`).
* **$A_{29} \dots A_{31}$ (`0x1080` to `0x1088`, 3 threads)**: $\text{Seg} = \mathbf{\text{Segment 0x1080}}$ (`0x1080..0x109F` — **5th Segment!**).

```text
PATTERN 2 MISALIGNED SEGMENT MAPPING (5 SEGMENTS OF 32 BYTES)

 Segment 0x1000 (32B) ──► Services Threads  0.. 4 (5 Threads = 20 Bytes)
 Segment 0x1020 (32B) ──► Services Threads  5..12 (8 Threads = 32 Bytes)
 Segment 0x1030 (32B) ──► Services Threads 13..20 (8 Threads = 32 Bytes)
 Segment 0x1060 (32B) ──► Services Threads 21..28 (8 Threads = 32 Bytes)
 Segment 0x1080 (32B) ──► Services Threads 29..31 (3 Threads = 12 Bytes)
 (5 Segments x 32 Bytes = 160 Bytes Transferred for 128 Bytes requested!)
```

##### 2. Performance Metrics for Pattern 2:
* Total 32-Byte Segments Transferred $N_{\text{segments}} = \mathbf{5 \text{ Transactions}}$.
* Total Bytes Transferred = $5 \times 32\text{ bytes} = 160\text{ Bytes}$.

$$\eta_{\text{bw,Pattern2}} = \frac{128\text{ Bytes Requested}}{160\text{ Bytes Transferred}} \times 100\% = \mathbf{80.0\% \text{ Bandwidth Efficiency}}$$

$$\text{Read Latency} = 5 \text{ segments} \times 16 \text{ cycles/segment} = \mathbf{80 \text{ Clock Cycles}} \quad (40.0\text{ ns})$$

$$\text{Effective Bandwidth} = \text{BW}_{\text{peak}} \times 0.80 = \mathbf{1,280.0 \text{ GB/sec}}$$

##### Performance Penalty of 12-Byte Misalignment:
A 12-byte shift pushed the end of the array onto a 5th segment, **increasing execution time by $25\%$ ($64 \to 80\text{ cycles}$)** and reducing effective memory bandwidth from $1,600\text{ GB/s}$ down to $1,280\text{ GB/sec}$!

---

#### Step 3: Analyze Pattern 3 (AoS Layout, Stride = 16 Bytes)

* Address Range: $A_i = \text{0x1000} + (i \cdot 16)$.
* $A_0 = \text{0x1000}$, $A_1 = \text{0x1010}$, $A_2 = \text{0x1020}$, $\dots$, $A_{31} = \text{0x11F0}$ ($496_{10}$).

##### 1. Segment Mapping:
Every 2 threads span 32 bytes ($2 \times 16 = 32\text{ bytes}$):
* $A_0 (\text{0x1000}), A_1 (\text{0x1010}) \implies \text{Segment 0x1000}$.
* $A_2 (\text{0x1020}), A_3 (\text{0x1030}) \implies \text{Segment 0x1020}$.
* $\dots$
* $A_{30} (\text{0x11E0}), A_{31} (\text{0x11F0}) \implies \text{Segment 0x11E0}$.

##### 2. Performance Metrics for Pattern 3:
* Total 32-Byte Segments Transferred $N_{\text{segments}} = \mathbf{16 \text{ Transactions}}$.
* Total Bytes Transferred = $16 \times 32\text{ bytes} = 512\text{ Bytes}$.

$$\eta_{\text{bw,Pattern3}} = \frac{128\text{ Bytes Requested}}{512\text{ Bytes Transferred}} \times 100\% = \mathbf{25.0\% \text{ Bandwidth Efficiency}}$$

$$\text{Read Latency} = 16 \text{ segments} \times 16 \text{ cycles/segment} = \mathbf{256 \text{ Clock Cycles}} \quad (128.0\text{ ns})$$

$$\text{Effective Bandwidth} = \text{BW}_{\text{peak}} \times 0.25 = \mathbf{400.0 \text{ GB/sec}}$$

---

#### Step 4: Analyze Pattern 4 (Random Sparse Accesses)

All 32 threads request addresses located in 32 completely different 32-byte segments.

##### 1. Performance Metrics for Pattern 4:
* Total 32-Byte Segments Transferred $N_{\text{segments}} = \mathbf{32 \text{ Transactions}}$.
* Total Bytes Transferred = $32 \times 32\text{ bytes} = 1,024\text{ Bytes}$.

$$\eta_{\text{bw,Pattern4}} = \frac{128\text{ Bytes Requested}}{1,024\text{ Bytes Transferred}} \times 100\% = \mathbf{12.5\% \text{ Bandwidth Efficiency}}$$

$$\text{Read Latency} = 32 \text{ segments} \times 16 \text{ cycles/segment} = \mathbf{512 \text{ Clock Cycles}} \quad (256.0\text{ ns})$$

$$\text{Effective Achievable Bandwidth} = \text{BW}_{\text{peak}} \times 0.125 = \mathbf{200.0 \text{ GB/sec}}$$

```text
MEMORY ACCESS PATTERN PERFORMANCE COMPARISON SUMMARY

 Access Pattern        │ Segments Transferred │ Total Cycles │ Bandwidth Efficiency │ Achieved Bandwidth
───────────────────────┼──────────────────────┼──────────────┼──────────────────────┼───────────────────
 Pattern 1 (Aligned)   │ 4 Segments (128B)    │ 64 Cycles    │ 100.0%               │ 1,600.0 GB/sec
 Pattern 2 (Misaligned)│ 5 Segments (160B)    │ 80 Cycles    │  80.0%               │ 1,280.0 GB/sec
 Pattern 3 (AoS 16B)   │ 16 Segments (512B)   │ 256 Cycles   │  25.0%               │   400.0 GB/sec
 Pattern 4 (Random)    │ 32 Segments (1,024B) │ 512 Cycles   │  12.5%               │   200.0 GB/sec
                       │ (8x More Cycles!)    │ (8x Slower!) │ (87.5% Wasted!)      │ (8x BANDWIDTH LOSS)
```

##### Engineering Conclusion:
Pattern 1 (Coalesced & Aligned) executed **$8.0\times$ faster** than Pattern 4 (Random Un-Coalesced) and **$4.0\times$ faster** than Pattern 3 (AoS Layout), proving why Memory Coalescing Units and Structure-of-Arrays (SoA) data layouts are physically mandatory for GPU performance!

---

### Sanity Check and Verification

Let us verify our mathematical and hardware coalescing results against memory architecture principles:

1. **Segment Mask Alignment Check**:
   * Segment size $W_{\text{segment}} = 32\text{ bytes} \implies$ mask clears lowest 5 bits ($[4:0]$).
   * Address `0x100C` ($4,108_{10}$) masked: `4108 & ~31 = 4096 = 0x1000`. Segment 0 start confirmed.
   * Address `0x1080` ($4,224_{10}$) masked: `4224 & ~31 = 4224 = 0x1080`. Segment 4 start confirmed.
   * 5 total segments ($0\text{x1000, 0x1020, 0x1040, 0x1060, 0x1080}$) verified!
2. **Bandwidth Efficiency Scaling**:
   * Pattern 1: $128 / 128 = 100\%$.
   * Pattern 2: $128 / 160 = 80\%$.
   * Pattern 3: $128 / 512 = 25\%$.
   * Pattern 4: $128 / 1024 = 12.5\%$.
   * Bandwidth efficiency scales inversely with the number of unique 32-byte segments spanned!
3. **Latency Sum Check**:
   * Pattern 4: 32 transactions $\times 16\text{ cycles/tx} = 512\text{ cycles}$.
   * At $2.0\text{ GHz}$ ($0.5\text{ ns}$): $512 \times 0.5\text{ ns} = 256.0\text{ ns}$.
   * Matches physical interconnect timing with $100\%$ precision.

All segment bitmask operations, parallel comparator deduplication results, AoS vs SoA efficiency calculations, and HBM3 memory bandwidth metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Memory Coalescing Unit**: A specialized hardware circuit inside a GPU's Load/Store Unit that inspects the 32 physical memory addresses generated by a warp, calculates their 32-byte or 128-byte physical memory segment mappings ($\text{Seg}_i = A_i \ \& \ \sim \text{Mask}$), and merges matching requests into the minimum possible number of physical bus transactions.
* **Coalesced Bus Transaction**: An aligned, contiguous memory transfer where all active thread requests in a warp fall within the minimum number of physical memory line segments ($N_{\text{segments}} = 1 \text{ or } 2$), achieving $100\%$ off-chip memory bus bandwidth efficiency.
