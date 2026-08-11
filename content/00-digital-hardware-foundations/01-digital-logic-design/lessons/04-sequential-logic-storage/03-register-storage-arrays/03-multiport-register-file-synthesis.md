# Multi-Port Register File Synthesis and Multi-Port Address Decoding Architecture

## The Multi-Operand Access Bottleneck in High-Speed Processors

In modern computer processor architectures, execution units need to execute complex arithmetic and logic instructions in a single clock cycle. Consider one of the most common assembly instructions executed by an Arithmetic Logic Unit (ALU): adding the contents of two source registers and storing the result into a third destination register ($R_1 + R_2 \to R_3$).

To execute this single instruction, the processor's central storage bank must perform **three distinct memory operations**:
1. Read the 32-bit binary word stored in Source Register $R_1$.
2. Read the 32-bit binary word stored in Source Register $R_2$.
3. Write the 32-bit addition result back into Destination Register $R_3$.

```text
THE MULTI-OPERAND REGISTER ACCESS CONFLICT

 Source Register R1 ──► [ Read Request 1 ] ──┐
                                             ├──► [ Single-Port Storage Bank ]
 Source Register R2 ──► [ Read Request 2 ] ──┤     (BUS CONTENTION / STALL!)
                                             │
 Destination R3     ──► [ Write Request ] ───┘
```

If the processor's storage bank is built as a single-port memory array—meaning it possesses only one shared address decoder and one data bus—it can perform only **one** memory operation per clock cycle.

Executing $R_1 + R_2 \to R_3$ on a single-port memory array forces the processor to spend three consecutive clock cycles:
* Cycle 1: Set address to $R_1$, read data into a temporary buffer.
* Cycle 2: Set address to $R_2$, read data into a second temporary buffer.
* Cycle 3: Execute addition and set address to $R_3$ to write the result back.

Forcing the CPU to pause for three clock cycles for every single instruction creates a severe pipeline stall.

Why can't we solve this by wiring every register directly to every other register using dedicated point-to-point buses? Because in a processor with 32 registers of 64 bits each, building dedicated point-to-point wires between every pair of registers requires over 60,000 physical copper traces, causing an immediate silicon area explosion.

To execute multi-operand instructions in a single clock cycle without wiring explosions, digital engineering uses a specialized multi-bus storage architecture: the **Multi-Port Register File**. 

By integrating $K$ parallel registers with independent, parallel address decoding networks (**Multi-Port Address Decoding**), a Multi-Port Register File allows two independent read operations and one write operation to occur simultaneously within a single clock cycle.

---

## The Multi-Clerk Library Filing Cabinet: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of a Multi-Port Register File, let us step away from microchips and picture a busy law firm filing room.

Imagine a central filing cabinet containing eight drawer folders labeled Folder 0 through Folder 7 ($R_0$ through $R_7$). Each folder contains a document page with a 4-digit reference number.

```text
THE MULTI-CLERK FILING ROOM ANALOGY

              ┌──────────────────────────────────────┐
              │  Filing Cabinet (Folders R0 .. R7)   │
              └──────┬────────────────────┬──────────┘
                     │                    │
                     ▼                    ▼
           [ Clerk A (Read Port A) ] [ Clerk B (Read Port B) ]
           (Reads Folder 2)          (Reads Folder 5)
                     │
                     ▼
           [ Clerk C (Write Port) ]
           (Writes Folder 1)
```

Three legal clerks—Clerk A, Clerk B, and Clerk C—stand in front of the filing cabinet to handle document requests from senior partners:

### 1. Clerk A (Read Port A)
Clerk A is equipped with a camera pointed at the cabinet. When a partner asks for Folder 2, Clerk A selects Folder 2, snaps a photo of its contents, and sends the image out on **Read Bus A**.

### 2. Clerk B (Read Port B)
Clerk B is equipped with a second, independent camera pointed at the exact same cabinet. At the exact same second that Clerk A is photo-documenting Folder 2, Clerk B selects Folder 5, snaps a photo, and sends its image out on **Read Bus B**.

### 3. Clerk C (Write Port)
Clerk C holds a pen and an eraser. While Clerks A and B are reading Folders 2 and 5, Clerk C selects Folder 1, erases its old reference number, and writes a brand-new number into Folder 1 via the **Write Bus**.

Notice what happened in this filing room:
* Clerk A read Folder 2.
* Clerk B read Folder 5.
* Clerk C wrote to Folder 1.

All three clerks completed their tasks **at the exact same second** without bumping into each other, without blocking the drawers, and without fighting over a single camera!

This multi-clerk filing room is the exact physical analogue of a **Multi-Port Register File**:
* The eight folders ($R_0 \dots R_7$) are the **Parallel Storage Registers**.
* Clerk A's camera is **Read Port A** (Read Address A + Read Bus A).
* Clerk B's camera is **Read Port B** (Read Address B + Read Bus B).
* Clerk C's pen is the **Write Port** (Write Address + Write Bus + Write Enable).

---

## Mechanics of Multi-Port Register File Synthesis

To master the design of a Multi-Port Register File, we must dissect the formal mechanics of its two core primitives:
1. **The Multi-Port Register File**: How $K$ storage registers are arranged with dual read buses and a single write bus.
2. **Multi-Port Address Decoding**: How three independent address decoders ($2 \times$ Read, $1 \times$ Write) operate concurrently without causing bus contention or state corruption.

---

### Primitive 1: The Multi-Port Register File Architecture

A standard **Dual-Read Single-Write (2R/1W) Register File** containing $K$ registers of $N$ bits each consists of:

1. **Storage Core**: An array of $K$ $N$-bit Parallel Load Registers ($\text{REG}_0, \text{REG}_1, \dots, \text{REG}_{K-1}$).
2. **Write Port Interface**:
   * One $N$-bit **Write Data Bus** ($\text{Write\_Data}$).
   * One $S$-bit **Write Address Bus** ($\text{Write\_Addr}$), where $S = \log_2 K$.
   * One 1-bit **Write Enable Signal** ($\text{WE}$).
3. **Read Port A Interface**:
   * One $S$-bit **Read Address A Bus** ($\text{Read\_Addr\_A}$).
   * One $N$-bit **Read Data A Bus** ($\text{Read\_Data\_A}$).
4. **Read Port B Interface**:
   * One $S$-bit **Read Address B Bus** ($\text{Read\_Addr\_B}$).
   * One $N$-bit **Read Data B Bus** ($\text{Read\_Data\_B}$).

```text
2R/1W MULTI-PORT REGISTER FILE BLOCK SYMBOL

 Write Data Bus (N Bits) ─────►[ Write_Data ]
 Write Address (S Bits)  ─────►[ Write_Addr ]
 Write Enable Control    ─────►[ WE         ]  ┌────────────────────────┐
                                               │ Dual-Read Single-Write │──► Read_Data_A (N Bits)
 Read Address A (S Bits) ─────►[ Read_Addr_A]  │  Register File Core    │
 Read Address B (S Bits) ─────►[ Read_Addr_B]  │  (K Registers x N Bits)│──► Read_Data_B (N Bits)
                                               └────────────────────────┘
 Clock Input CLK         ─────►[ CLK        ]
```

#### Operational Bus Capacities
In an 8-Register $\times$ 4-Bit Register File ($K = 8, N = 4, S = \log_2 8 = 3$):
* The CPU can select any register $R_i$ on Read Port A by setting $\text{Read\_Addr\_A} = i$.
* Simultaneously, the CPU can select any register $R_j$ on Read Port B by setting $\text{Read\_Addr\_B} = j$.
* Simultaneously, the CPU can write new data to any register $R_m$ by setting $\text{Write\_Addr} = m$ and pulsing $\text{WE} = 1$ on the rising clock edge!

---

### Primitive 2: Multi-Port Address Decoding Architecture

How do we construct the internal hardware logic that allows three independent address ports to access $K$ shared registers at the same time?

We build three separate, independent address-decoding networks:

#### 1. The Write Address Decoder (Demultiplexed Control)
Writing data requires selective destination enablement. We cannot write to all registers at once.

The Write Port uses a **3-to-8 Binary Decoder** driven by the Write Address Bus $\text{Write\_Addr} = (W_2, W_1, W_0)$ and gated by master Write Enable $\text{WE}$.

The decoder produces 8 individual active-high load enable lines ($\text{LOAD}_0, \text{LOAD}_1, \dots, \text{LOAD}_7$), one for each register:

$$
\text{LOAD}_k = m_k(W_2, W_1, W_0) \cdot \text{WE}
$$

Where:
* $\text{LOAD}_k$ is the parallel load enable line for Register $k$.
* $m_k(W_2, W_1, W_0)$ is the $k$-th minterm of the 3-bit Write Address bus.
* $\text{WE}$ is the master write enable signal.

```text
WRITE PORT ADDRESS DECODING

 Write Address (W2,W1,W0) ──► [ 3:8 Write Decoder ] ──► LOAD_0..LOAD_7
                                     ▲                  (Driven to Reg 0..7)
 Master Write Enable WE  ────────────┘
```

When $\text{WE} = 1$ and $\text{Write\_Addr} = 010_2$ (decimal 2), $\text{LOAD}_2 = 1$ while all other $\text{LOAD}_k = 0$. On the rising clock edge, **only Register 2 captures $\text{Write\_Data}$**!

---

#### 2. The Read Port A Multiplexer Tree
Reading data is a combinational selection task. We need to route the contents of 1 out of 8 registers onto Read Bus A.

Read Port A uses an **8-to-1 Multiplexer (8:1 MUX A)** driven by the Read Address A Bus $\text{Read\_Addr\_A} = (RA_2, RA_1, RA_0)$:

* Input $D_0$ of MUX A is connected to Register 0 output $\mathbf{Q}_0$.
* Input $D_1$ of MUX A is connected to Register 1 output $\mathbf{Q}_1$.
* ...
* Input $D_7$ of MUX A is connected to Register 7 output $\mathbf{Q}_7$.

$$
\text{Read\_Data\_A} = \sum_{k=0}^{7} \left( m_k(RA_2, RA_1, RA_0) \cdot \mathbf{Q}_k \right)
$$

Where:
* $\text{Read\_Data\_A}$ is the $N$-bit output bus for Read Port A.
* $m_k(RA_2, RA_1, RA_0)$ is the $k$-th minterm of Read Address A.
* $\mathbf{Q}_k$ is the $N$-bit output vector of Register $k$.

---

#### 3. The Read Port B Multiplexer Tree
Read Port B is an **exact duplicate** of Read Port A, operating completely independently!

It uses a second 8-to-1 Multiplexer (8:1 MUX B) driven by the Read Address B Bus $\text{Read\_Addr\_B} = (RB_2, RB_1, RB_0)$:

$$
\text{Read\_Data\_B} = \sum_{k=0}^{7} \left( m_k(RB_2, RB_1, RB_0) \cdot \mathbf{Q}_k \right)
$$

Where:
* $\text{Read\_Data\_B}$ is the $N$-bit output bus for Read Port B.

```text
DUAL READ PORT MULTIPLEXER SCHEMATIC

 Register Outputs Q0..Q7
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
 [ 8:1 MUX A (Read Port A) ]               [ 8:1 MUX B (Read Port B) ]
       ▲                                         ▲
       │ Read_Addr_A (RA2..0)                    │ Read_Addr_B (RB2..0)
       │                                         │
       ▼                                         ▼
 Read Data Bus A (Read_Data_A)             Read Data Bus B (Read_Data_B)
```

Look at this dual MUX architecture:
* MUX A reads any register $R_i$ based on $RA_2, RA_1, RA_0$.
* MUX B reads any register $R_j$ based on $RB_2, RB_1, RB_0$.
* Because MUX A and MUX B have separate select lines, **both reads occur at the exact same instant without any signal collisions!**

---

## Detailed Internal Cell Architecture of a Multi-Port Register File

To understand how a Multi-Port Register File is constructed at the gate level, let us examine the single-bit storage cell for Bit $i$ of Register $k$ ($\text{Cell}_{k,i}$).

Each single-bit cell contains:
1. One positive edge-triggered D Flip-Flop.
2. One 2:1 MUX for Load Enable Steering (holding $Q_{k,i}$ when $\text{LOAD}_k = 0$).
3. Output fan-out wires feeding MUX A and MUX B.

```text
SINGLE-BIT MULTI-PORT STORAGE CELL SCHEMATIC (Reg k, Bit i)

 Write Data Bus Bit i ───► Input 1 ┌───────────┐
                                   │ 2:1 MUX   ├──► Data D ──► [ D Flip-Flop ]
 Recirculated Output Q_k,i──► Input 0 └─────▲─────┘                 │
                                            │                       ├──► To MUX A
 Write Load Line LOAD_k ────────────────────┘                       │    (Read Port A)
                                                                    │
 Clock Line CLK ───────────────────────────────────────────────────┤
                                                                    │
 Output Q_k,i ──────────────────────────────────────────────────────┴──► To MUX B
                                                                         (Read Port B)
```

### Trace of Operation inside a 2R/1W Register Cell:
1. **Writing**: When the Write Decoder asserts $\text{LOAD}_k = 1$, the cell's 2:1 MUX selects $\text{Write\_Data}_i$. On the next rising clock edge, the D Flip-Flop captures the new bit value.
2. **Reading**: Output pin $Q_{k,i}$ continuously emits its stored value to the input pins of MUX A and MUX B. 
   * If Read Address A selects Register $k$, MUX A passes $Q_{k,i}$ to $\text{Read\_Data\_A}_i$.
   * If Read Address B selects Register $k$, MUX B passes $Q_{k,i}$ to $\text{Read\_Data\_B}_i$.

---

## The Read-During-Write Edge Case: Simultaneous Same-Register Access

A critical timing scenario in processor engineering is the **Read-During-Write Hazard**:

What happens if the CPU attempts to **READ** from Register 2 on Read Port A at the exact same clock cycle that it **WRITES** new data into Register 2 on the Write Port?

$$\text{Read\_Addr\_A} = 010_2 (R_2) \quad \text{AND} \quad \text{Write\_Addr} = 010_2 (R_2) \quad \text{with } \text{WE} = 1$$

```text
THE READ-DURING-WRITE HAZARD

 Write Port  : Writing NEW Value (1010_2) to Register R2 on Rising Clock Edge!
 Read Port A : Reading Register R2 during the SAME Clock Cycle!
                                      │
                                      ▼
             Does Read_Data_A return OLD R2 data or NEW R2 data?
```

There are two valid architectural strategies used by chip designers to resolve this edge case:

### Strategy 1: Read-Old-Data Architecture (Standard Behavior)
In a standard register file without extra bypass logic:
* During the clock cycle, Read Port A passes the **current stored value** of $R_2$ (the old data) to $\text{Read\_Data\_A}$.
* On the rising clock edge at the end of the cycle, $R_2$ captures the new write data.
* The new data becomes visible on Read Port A during the *following* clock cycle.

### Strategy 2: Write-Through Bypass Architecture (Forwarding)
In high-speed pipelined CPUs, the processor cannot wait until the next clock cycle to read the new value. Engineers add internal **Write-Through Bypass Logic**:

A comparator checks if $\text{Read\_Addr\_A} == \text{Write\_Addr}$ and $\text{WE} == 1$.
* If a match occurs, a bypass MUX routes $\text{Write\_Data}$ **directly** to $\text{Read\_Data\_A}$, bypassing the register file storage delay entirely!

```text
WRITE-THROUGH BYPASS FORWARDING ARCHITECTURE

 Read_Addr_A ──┐
               ├──► [ Equality Comp ] ──► Match? ──┐
 Write_Addr  ──┘                                  │
                                                  ▼
 Read_Data_A_raw ─────────────► Input 0 ┌───────────┐
                                        │ 2:1 MUX   ├──► Final Read_Data_A
 Write_Data ──────────────────► Input 1 └───────────┘   (Instant Forwarding!)
```

This Write-Through Bypass technique allows pipelined CPUs to execute dependent instructions (such as $R_1 + R_2 \to R_2$ followed immediately by $R_2 + R_3 \to R_4$) without inserting pipeline stall cycles!

---

## Engineering Reality: Silicon Area, Fan-In, and Port Scaling Limits

Why don't we build register files with 16 Read Ports and 8 Write Ports to allow maximum parallel execution?

In physical CMOS silicon layout, adding more ports to a register file imposes a **quadratic silicon area penalty**.

### 1. Transistor and Area Scaling Laws

For a register file containing $K$ registers of $N$ bits each, with $R$ Read Ports and $W$ Write Ports:

1. **Multiplexer Complexity**: Each read port adds one $K$:1 multiplexer per bit.
   $$\text{Total Read MUXes} = R \cdot N \cdot (K-1) \text{ gates}$$
2. **Silicon Interconnect Wiring**: Every bit cell must connect to $R$ independent read output lines and $W$ independent write input lines.
   $$\text{Cell Area} \propto (R + W)^2$$

```text
PORT SCALING VS SILICON CELL AREA

 Ports Configuration │ Relative Register Cell Area │ Silicon Wiring Density
─────────────────────┼─────────────────────────────┼────────────────────────
 1 Read / 1 Write    │     (1 + 1)^2 = 4x Area     │ Low (Clean Layout)
 2 Read / 1 Write    │     (2 + 1)^2 = 9x Area     │ Moderate
 4 Read / 2 Write    │    (4 + 2)^2 = 36x Area!    │ High Interconnect Noise
 8 Read / 4 Write    │   (8 + 4)^2 = 144x Area!    │ IMPOSSIBLE (Metal Congestion)
```

Look at those area numbers! Going from a 2R/1W register file to a 4R/2W register file increases the physical silicon area of every single memory cell by **400%**!

This quadratic area growth is why general-purpose microprocessors (such as x86 or ARM cores) limit their primary integer register files to **2 Read Ports and 1 Write Port (2R/1W)** or **3 Read Ports and 2 Write Ports (3R/2W)**.

---

## Solved Industrial Engineering Exercise: 4-Register x 4-Bit Dual-Read Single-Write Register File

To consolidate your complete mastery of Multi-Port Register Files, multi-port address decoding, write port decoders, dual read MUX trees, and write-through bypass forwarding, we will now walk through a complete, step-by-step digital engineering problem.

---

### Scenario and Parameters

An avionics chip design team is synthesizing a 4-Register $\times$ 4-Bit Dual-Read Single-Write (2R/1W) Register File for a satellite's flight guidance computer.

The register file contains four 4-bit storage registers ($R_0, R_1, R_2, R_3$).

```text
SATELLITE GUIDANCE 4x4 MULTI-PORT REGISTER FILE

 Write Bus W_Data[3:0] ──► [ Write Data Port ]
 Write Addr W_Addr[1:0] ──► [ Write Decoder   ]
 Write Enable WE ─────────► [ Write Control   ] ┌────────────────────────┐
                                                │ 4x4 Multi-Port Core    │──► Read_Data_A[3:0]
 Read Addr A RA[1:0] ─────► [ Read MUX A      ] │ (4 Registers x 4 Bits) │
 Read Addr B RB[1:0] ─────► [ Read MUX B      ] │                        │──► Read_Data_B[3:0]
                                                └────────────────────────┘
 Clock Input CLK ─────────► [ System Clock   ]
```

#### System Bus Interfaces:
* **Storage Array**: 4 registers ($R_0, R_1, R_2, R_3$), each storing 4 bits ($Q_3, Q_2, Q_1, Q_0$).
* **Write Port**: 4-bit $\text{W\_Data}[3:0]$, 2-bit $\text{W\_Addr}[1:0]$, 1-bit active-high $\text{WE}$.
* **Read Port A**: 2-bit $\text{RA}[1:0]$ selecting 4-bit $\text{Read\_Data\_A}[3:0]$.
* **Read Port B**: 2-bit $\text{RB}[1:0]$ selecting 4-bit $\text{Read\_Data\_B}[3:0]$.

#### Physical Gate Delays:
* 2-to-4 Write Decoder Delay: $t_{\text{dec}} = 0.30\text{ ns}$
* 4-to-1 Read MUX Delay: $t_{\text{mux}} = 0.40\text{ ns}$
* D Flip-Flop Clock-to-Q Delay: $t_{\text{C2Q}} = 0.35\text{ ns}$
* D Flip-Flop Setup Time: $t_{\text{su}} = 0.25\text{ ns}$

#### Your Objective

1. Derive the Boolean equations for the four write load enable lines ($\text{LOAD}_0, \text{LOAD}_1, \text{LOAD}_2, \text{LOAD}_3$).
2. Derive the 4-to-1 multiplexer Boolean equations for bit position $i$ ($i \in \{0,1,2,3\}$) on Read Port A ($\text{Read\_Data\_A}_i$) and Read Port B ($\text{Read\_Data\_B}_i$).
3. Calculate the total physical CMOS transistor count for the entire 4x4 2R/1W Register File.
4. Calculate the total Read Propagation Delay ($t_{\text{read}}$) from stable Read Address to valid Read Data.
5. Simulate the 2R/1W Register File across three concurrent CPU execution cycles, including a simultaneous dual-read and single-write operation.
6. Verify mathematical and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive Write Port Decoder Load Equations

The Write Address Bus $\text{W\_Addr} = (W_1, W_0)$ is decoded by a 2-to-4 active-high binary decoder gated by master Write Enable $\text{WE}$.

The four load enable equations are:

$$
\text{LOAD}_0 = \overline{W_1} \cdot \overline{W_0} \cdot \text{WE}
$$

$$
\text{LOAD}_1 = \overline{W_1} \cdot W_0 \cdot \text{WE}
$$

$$
\text{LOAD}_2 = W_1 \cdot \overline{W_0} \cdot \text{WE}
$$

$$
\text{LOAD}_3 = W_1 \cdot W_0 \cdot \text{WE}
$$

Where:
* $\text{LOAD}_k$ is the load enable line for Register $k$ ($k \in \{0, 1, 2, 3\}$).
* $W_1, W_0$ are the MSB and LSB of the Write Address bus.
* $\text{WE}$ is the master write enable control signal.

---

#### Step 2: Derive Read Port A and Read Port B Multiplexer Equations

For bit position $i \in \{0, 1, 2, 3\}$:

##### Read Port A ($\text{Read\_Data\_A}_i$):
Controlled by Read Address A $\text{RA} = (RA_1, RA_0)$:

$$
\text{Read\_Data\_A}_i = (\overline{RA_1} \cdot \overline{RA_0} \cdot Q_{0,i}) + (\overline{RA_1} \cdot RA_0 \cdot Q_{1,i}) + (RA_1 \cdot \overline{RA_0} \cdot Q_{2,i}) + (RA_1 \cdot RA_0 \cdot Q_{3,i})
$$

##### Read Port B ($\text{Read\_Data\_B}_i$):
Controlled by Read Address B $\text{RB} = (RB_1, RB_0)$:

$$
\text{Read\_Data\_B}_i = (\overline{RB_1} \cdot \overline{RB_0} \cdot Q_{0,i}) + (\overline{RB_1} \cdot RB_0 \cdot Q_{1,i}) + (RB_1 \cdot \overline{RB_0} \cdot Q_{2,i}) + (RB_1 \cdot RB_0 \cdot Q_{3,i})
$$

Where:
* $Q_{k,i}$ is the $i$-th bit of Register $k$.
* $RA_1, RA_0$ are the address bits for Read Port A.
* $RB_1, RB_0$ are the address bits for Read Port B.

---

#### Step 3: Calculate Total CMOS Transistor Footprint

Let us sum the transistors for all sub-blocks in our 4x4 2R/1W Register File:

1. **Storage Array (4 Registers $\times$ 4 Bits = 16 Memory Cells)**:
   * Each cell contains one D Flip-Flop (26 transistors) + one 2:1 Load MUX (14 transistors) = 40 transistors per cell.
   * Total for 16 cells = $16 \times 40 = 640\text{ transistors}$.
2. **Write Port Decoder**:
   * One 2-to-4 decoder with enable (4 three-input AND gates + 2 inverters) = $(4 \times 8) + (2 \times 2) = 36\text{ transistors}$.
3. **Read Port A Multiplexer Network**:
   * Four 4-to-1 MUXes (one per bit line).
   * Each 4:1 MUX contains 4 three-input AND gates + 1 four-input OR gate + 2 address inverters = $32 + 10 + 4 = 46\text{ transistors}$.
   * Total for Read Port A = $4 \times 46 = 184\text{ transistors}$.
4. **Read Port B Multiplexer Network**:
   * Four 4-to-1 MUXes (exact duplicate of Read Port A) = $184\text{ transistors}$.

$$
\text{Total Physical Footprint} = 640 + 36 + 184 + 184 = \mathbf{1,044 \text{ CMOS Transistors}}
$$

The complete 4x4 2R/1W Register File requires **1,044 physical transistors**.

---

#### Step 4: Calculate Read Propagation Delay ($t_{\text{read}}$)

The Read Propagation Delay is the time required for data to become valid on $\text{Read\_Data\_A}$ or $\text{Read\_Data\_B}$ after the CPU changes the read address $\text{RA}$ or $\text{RB}$:

Data is already present at the flip-flop outputs $Q_{k,i}$. The read address signal simply travels through the 4:1 Read Multiplexer:

$$
t_{\text{read}} = t_{\text{mux}} = \mathbf{0.40 \text{ ns}}
$$

Read access takes only **$0.40\text{ nanoseconds}$**!

---

#### Step 5: Simulate 3 Execution Cycles

Initial Register Contents:
* $R_0 = 0101_2$ ($5_{10}$)
* $R_1 = 0011_2$ ($3_{10}$)
* $R_2 = 1100_2$ ($12_{10}$)
* $R_3 = 0000_2$ ($0_{10}$)

```text
3-CYCLE MULTI-PORT REGISTER FILE EXECUTION TRACE

 Cycle │ W_Addr │ W_Data │ WE │ RA (Port A) │ RB (Port B) │ Read_Data_A │ Read_Data_B │ System Action
───────┼────────┼────────┼────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────────────────────────────────────
   1   │   00   │  0000  │ 0  │   00 (R0)   │   01 (R1)   │ 0101 (5_10) │ 0011 (3_10) │ DUAL READ: Read R0 (5) and R1 (3)
   2   │   11   │  1000  │ 1  │   01 (R1)   │   10 (R2)   │ 0011 (3_10) │ 1100 (12_10)│ SIMULTANEOUS: Read R1,R2 & Write R3=1000
   3   │   00   │  0000  │ 0  │   11 (R3)   │   00 (R0)   │ 1000 (8_10) │ 0101 (5_10) │ VERIFY WRITE: Read R3 (shows 8!)
```

##### Detailed Cycle Evaluations:

1. **Cycle 1 (Dual Read: $R_0$ on Port A, $R_1$ on Port B; $\text{WE} = 0$)**:
   * $\text{RA} = 00_2 \implies \text{Read\_Data\_A} = R_0 = 0101_2$ ($5_{10}$).
   * $\text{RB} = 01_2 \implies \text{Read\_Data\_B} = R_1 = 0011_2$ ($3_{10}$).
   * $\text{WE} = 0 \implies$ All $\text{LOAD}_k = 0$. No registers modified.
   * **Result**: Port A reads $5_{10}$, Port B reads $3_{10}$. **DUAL READ SUCCESSFUL!**

2. **Cycle 2 (Simultaneous Operation: Read $R_1, R_2$ while Writing $R_3 = 1000_2$)**:
   * $\text{RA} = 01_2 \implies \text{Read\_Data\_A} = R_1 = 0011_2$ ($3_{10}$).
   * $\text{RB} = 10_2 \implies \text{Read\_Data\_B} = R_2 = 1100_2$ ($12_{10}$).
   * $\text{W\_Addr} = 11_2 (R_3)$ and $\text{WE} = 1 \implies \text{LOAD}_3 = 1$.
   * On rising clock edge, **Register $R_3$ captures $\text{W\_Data} = 1000_2$ ($8_{10}$)**.
   * **Result**: ALU receives $R_1 (3)$ and $R_2 (12)$ to add, while Register $R_3$ is updated with previous calculation $1000_2$ ($8_{10}$)! **3 OPERATIONS IN 1 CYCLE!**

3. **Cycle 3 (Verify Write to $R_3$)**:
   * $\text{RA} = 11_2 \implies \text{Read\_Data\_A} = R_3 = 1000_2$ ($8_{10}$).
   * $\text{RB} = 00_2 \implies \text{Read\_Data\_B} = R_0 = 0101_2$ ($5_{10}$).
   * **Result**: Port A reads new value $1000_2$ ($8_{10}$) from $R_3$. **WRITE VERIFIED!**

All three cycles evaluate with 100% mathematical and logical precision. The 4x4 2R/1W Multi-Port Register File is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Multi-Port Register File**: A centralized multi-bus storage module composed of $K$ parallel registers equipped with independent read and write address interfaces, allowing multiple parallel read operations (Port A, Port B) and write operations to occur concurrently within a single clock cycle.
* **Multi-Port Address Decoding**: The parallel address routing architecture that uses independent Write Decoders ($\text{LOAD}_k = m_k(W) \cdot \text{WE}$) and Read Multiplexer trees ($\sum m_k(RA) \cdot \mathbf{Q}_k$) to eliminate memory access bottlenecks and enable 1-cycle multi-operand instruction execution in high-speed processors.
