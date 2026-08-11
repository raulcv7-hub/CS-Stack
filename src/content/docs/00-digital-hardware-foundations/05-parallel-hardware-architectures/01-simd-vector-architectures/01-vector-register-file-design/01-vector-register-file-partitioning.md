---
title: "Vector Register File Partitioning and Vector Lane Architecture"
---

# Vector Register File Partitioning and Vector Lane Architecture

## The Monolithic Register File Crisis: Why Wide Vector Processing Destroys Silicon Scale

When a central processing unit (CPU) executes a traditional scalar instruction—such as adding two 64-bit integers—it reads two source values from a central scalar register file, passes them through a single arithmetic logic unit (ALU), and writes the 64-bit result back to a destination register. In a typical scalar processor, the register file stores 32 individual registers, each 64 bits wide. The total storage capacity of this entire scalar register file is 2,048 bits ($256\text{ bytes}$). Because a 64-bit word is relatively narrow, routing the electrical wires from the register storage cells to the ALU inputs requires a manageable number of physical copper traces on the silicon die.

However, modern computational workloads—such as artificial intelligence inference, 3D graphics rendering, physical fluid simulations, audio signal processing, and cryptography—do not operate on isolated scalar numbers. They process vast arrays of data simultaneously. 

To accelerate these workloads, computer architects introduced **Single Instruction, Multiple Data (SIMD)** vector processing. Instead of adding two single 64-bit numbers, a vector instruction adds two wide vectors containing 8, 16, 32, or 64 individual data elements in a single clock cycle.

To support vector processing, the processor must store wide vector registers. Modern vector instruction set architectures (ISAs)—such as x86 AVX-512, ARM SVE, and RISC-V Vector Extensions—define vector registers that are $512\text{ bits}$, $1,024\text{ bits}$, or even $2,048\text{ bits}$ wide!

```text
SCALAR VS VECTOR REGISTER CAPACITY EXPANSION

 Scalar Register File (32 Registers x 64 Bits)
 ┌─────────────────────────────────────────────────────────────┐
 │ 2,048 Bits Total Storage (0.25 Kilobytes)                   │
 └─────────────────────────────────────────────────────────────┘

 Monolithic 512-Bit Vector Register File (32 Registers x 512 Bits)
 ┌─────────────────────────────────────────────────────────────┐
 │ 16,384 Bits Total Storage (2.0 Kilobytes)                   │
 └─────────────────────────────────────────────────────────────┘
  (8x Capacity Increase, but 64x Area and Wiring Penalty!)
```

Here lies the fundamental physical hardware barrier that threatens to collapse vector processor design: **The Monolithic Register File Area and Pin Congestion Crisis**.

If a hardware architect attempts to build a 512-bit wide vector register file as a single, monolithic, centralized memory array—using the exact same multi-ported layout as a scalar register file—the physical silicon scale breaks down completely:

1. **Catastrophic Wire Pin Congestion**: To execute a single vector addition instruction ($V_C = V_A + V_B$), the execution engine must read two 512-bit vector source operands and write one 512-bit destination operand simultaneously. If the processor features a dual-issue execution engine (capable of dispatching two vector instructions per cycle), the register file must supply four 512-bit read operands and two 512-bit write operands on every single clock cycle!

   Let us calculate the number of physical read and write data wires required to connect a monolithic 512-bit register file to a dual-issue execution unit:

$$\text{Total Read Wires} = 4 \text{ Read Ports} \times 512 \text{ Bits/Port} = 2,048 \text{ Wires}$$

$$\text{Total Write Wires} = 2 \text{ Write Ports} \times 512 \text{ Bits/Port} = 1,024 \text{ Wires}$$

$$\text{Total Register File Data Pins} = 2,048 + 1,024 = 3,072 \text{ Physical Metal Traces}$$

   Routing 3,072 parallel copper traces across the surface of a centralized memory block creates severe physical wire congestion. The copper traces must be spaced apart to prevent capacitive crosstalk, causing the wiring channels to occupy vastly more silicon area than the actual memory cells storing the bits!

2. **Quadratic Area Scaling ($O(P^2)$)**: In multi-ported register file design, the physical area of a memory array scales quadratically with the number of access ports $P$ and linearly with the vector width $W_{\text{vec}}$:

$$\text{Area}_{\text{monolithic}} \propto W_{\text{vec}} \cdot N_{\text{regs}} \cdot P^2$$

   Where:
   * $\text{Area}_{\text{monolithic}}$ is the physical silicon die area of the centralized register file.
   * $W_{\text{vec}}$ is the width of each vector register in bits (e.g., $512\text{ bits}$).
   * $N_{\text{regs}}$ is the number of architectural vector registers (e.g., 32 registers).
   * $P$ is the total number of physical access ports ($P = P_{\text{read}} + P_{\text{write}}$).

   Because the access ports require intersecting vertical bitlines and horizontal wordlines for every port, a 6-port 512-bit monolithic register file occupies an area over **36 times larger** than a single-ported array of identical storage capacity. The register file becomes so large that it consumes more physical silicon space and dynamic power than the entire CPU pipeline itself!

3. **Capacitive Wordline Delays and RC Slowdown**: A 512-bit wide register row requires running a horizontal wordline wire past hundreds of memory cells. The long metal wire possesses significant resistance ($R$) and parasitic capacitance ($C$). As the register width expands, the $RC$ propagation delay grows quadratically with wire length:

$$t_{\text{prop}} \propto R_{\text{wire}} \cdot C_{\text{wire}} \propto L_{\text{wire}}^2$$

   Charging and discharging long 512-bit wordlines takes multiple nanoseconds, forcing the master clock frequency of the processor to drop from gigahertz speeds down to a fraction of its potential performance.

How do computer architects construct wide vector register files that scale to thousands of bits without suffering from quadratic area explosion, un-routable pin congestion, or long $RC$ wire delays?

To solve this crisis, hardware designers abandon the monolithic, centralized register file entirely and implement **Vector Register File Partitioning** using a modular, parallel hardware building block: **The Vector Lane Architecture**.

Instead of storing a 512-bit vector as one giant 512-bit horizontal row, the hardware slices the vector register file vertically into $N$ narrow, independent, self-contained vertical partitions called **Vector Lanes**.


### Strategy 1: The Monolithic Single-Station Factory (Monolithic Register File)
The factory owner builds one single, giant mega-garage. They dump all the parts for 4 cars into one central pile in the middle of the room and hire 100 workers to assemble all 4 cars side-by-side in the same room.

Look at the chaos that ensues:
* **Tool Congestion**: Workers assembling Car 0 constantly run across the room to fetch tools from the central pile, colliding with workers assembling Car 3 (**Pin Congestion and Routing Crossings**).
* **Massive Floor Area**: The room must be built huge enough to allow 100 workers to walk past each other in all directions without bumping heads (**Quadratic Area Scaling $O(P^2)$**).
* **Slow Assembly**: Workers spend $80\%$ of their shift walking across the giant room to get parts rather than actually assembling cars (**$RC$ Wire Propagation Delays**).


## Primitive 1: Vector Register File Partitioning

Now that we possess a clear, intuitive mental model of parallel assembly lanes, let us examine the formal, rigorous engineering mechanics of **Vector Register File Partitioning**.

Instead of manufacturing a vector register file as one monolithic 512-bit wide memory block, hardware architects slice the entire vector register file vertically into $N_{\text{lanes}}$ separate physical memory banks called **Register File Lane Slices**.

### Vertical Bit-Slicing Topology

Consider a vector processor featuring 32 architectural vector registers ($V_0, V_1, \dots, V_{31}$), where each register is $W_{\text{vec}} = 512\text{ bits}$ wide.

Suppose the hardware architecture divides the execution engine into $N_{\text{lanes}} = 4$ parallel vector lanes. Each lane has a physical width of:

$$W_{\text{lane}} = \frac{W_{\text{vec}}}{N_{\text{lanes}}} = \frac{512 \text{ Bits}}{4 \text{ Lanes}} = \mathbf{128 \text{ Bits per Lane}}$$

```text
VERTICAL BIT-SLICING OF A 512-BIT VECTOR REGISTER FILE

 512-Bit Vector Register V0
 ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
 │ Bits [511:384]   │ Bits [383:256]   │ Bits [255:128]   │ Bits [127:0]     │
 └────────┬─────────┴────────┬─────────┴────────┬─────────┴────────┬─────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ Lane 3 Slice │   │ Lane 2 Slice │   │ Lane 1 Slice │   │ Lane 0 Slice │
   │ (128 Bits)   │   │ (128 Bits)   │   │ (128 Bits)   │   │ (128 Bits)   │
   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

Let us trace how the bits of all 32 architectural vector registers ($V_0 \dots V_{31}$) are distributed across the 4 physical lane slices:

* **Lane 0 Register Slice**: Holds bits $[127:0]$ of $V_0$, bits $[127:0]$ of $V_1$, $\dots$, bits $[127:0]$ of $V_{31}$.
* **Lane 1 Register Slice**: Holds bits $[255:128]$ of $V_0$, bits $[255:128]$ of $V_1$, $\dots$, bits $[255:128]$ of $V_{31}$.
* **Lane 2 Register Slice**: Holds bits $[383:256]$ of $V_0$, bits $[383:256]$ of $V_1$, $\dots$, bits $[383:256]$ of $V_{31}$.
* **Lane 3 Register Slice**: Holds bits $[511:384]$ of $V_0$, bits $[511:384]$ of $V_1$, $\dots$, bits $[511:384]$ of $V_{31}$.


### Concrete Mapping Example: 64-Bit Elements in 128-Bit Lanes

Let us evaluate these equations for a 512-bit vector containing eight 64-bit elements ($e = 0, 1, \dots, 7$), processed by a 4-lane hardware engine ($N_{\text{lanes}} = 4, W_{\text{lane}} = 128\text{ bits}$):

```text
ELEMENT TO LANE MAPPING TABLE (512-BIT VECTOR, 64-BIT ELEMENTS, 128-BIT LANES)

 Element Index (e) │ Bit Range [High:Low] │ Target Lane Index (L_idx) │ Intra-Lane Offset (O_lane)
───────────────────┼──────────────────────┼───────────────────────────┼────────────────────────────
     Element 0     │       [63:0]         │          Lane 0           │        Bits [63:0]
     Element 1     │      [127:64]        │          Lane 0           │       Bits [127:64]
     Element 2     │     [191:128]        │          Lane 1           │        Bits [63:0]
     Element 3     │     [255:192]        │          Lane 1           │       Bits [127:64]
     Element 4     │     [319:256]        │          Lane 2           │        Bits [63:0]
     Element 5     │     [383:320]        │          Lane 2           │       Bits [127:64]
     Element 6     │     [447:384]        │          Lane 3           │        Bits [63:0]
     Element 7     │     [511:448]        │          Lane 3           │       Bits [127:64]
```

Look at the structure of this mapping:
* Lane 0 holds **Element 0** and **Element 1**.
* Lane 1 holds **Element 2** and **Element 3**.
* Lane 2 holds **Element 4** and **Element 5**.
* Lane 3 holds **Element 6** and **Element 7**.

Notice that each physical lane holds exactly **2 data elements**! 

Because every lane contains its own local register slice, its own 128-bit memory read/write ports, and its own execution units, the 4 lanes can operate on their local elements concurrently.


### The Zero Cross-Lane Wiring Principle for Vertical Operations

The most important physical benefit of the Vector Lane Architecture is the **Zero Cross-Lane Wiring Principle**.

In SIMD vector processing, the vast majority of vector instructions are **Vertical (Pointwise) Operations**. A vertical operation applies a mathematical function to corresponding elements of source vectors independently:

$$V_C[e] = V_A[e] \quad \mathbf{\text{op}} \quad V_B[e] \quad \text{for all } e \in \left[0, \frac{W_{\text{vec}}}{W_{\text{elem}}} - 1\right]$$

Examples of vertical operations include vector addition (`VADD`), vector subtraction (`VSUB`), vector multiplication (`VMUL`), bitwise AND (`VAND`), and fused multiply-add (`VFMA`).

Now, trace the electrical data path when the processor executes a vertical vector addition ($V_C = V_A + V_B$):

1. **Local Register Read**:
   * Lane 0 reads its local 128-bit slice of $V_A$ and $V_B$ from its **local VRF slice**.
   * Lane 1 reads its local 128-bit slice of $V_A$ and $V_B$ from its **local VRF slice**.
   * Lane 2 reads its local 128-bit slice of $V_A$ and $V_B$ from its **local VRF slice**.
   * Lane 3 reads its local 128-bit slice of $V_A$ and $V_B$ from its **local VRF slice**.
2. **Local Execution**:
   * Lane 0's local 128-bit ALU adds its local elements ($V_A[1:0] + V_B[1:0]$).
   * Lane 1's local 128-bit ALU adds its local elements ($V_A[3:2] + V_B[3:2]$).
   * Lane 2's local 128-bit ALU adds its local elements ($V_A[5:4] + V_B[5:4]$).
   * Lane 3's local 128-bit ALU adds its local elements ($V_A[7:6] + V_B[7:6]$).
3. **Local Write-Back**:
   * Lane 0 writes its 128-bit sum back into its **local VRF slice** for $V_C$.
   * Lane 1 writes its 128-bit sum back into its **local VRF slice** for $V_C$.
   * Lane 2 writes its 128-bit sum back into its **local VRF slice** for $V_C$.
   * Lane 3 writes its 128-bit sum back into its **local VRF slice** for $V_C$.

```text
PHYSICAL WIRE ROUTING IN 4 PARALLEL LANES (VERTICAL OPERATION)

 Lane 0 Datapath: VRF_0[V_A] + VRF_0[V_B] ──► ALU_0 ──► VRF_0[V_C]  (100% Local!)
 Lane 1 Datapath: VRF_1[V_A] + VRF_1[V_B] ──► ALU_1 ──► VRF_1[V_C]  (100% Local!)
 Lane 2 Datapath: VRF_2[V_A] + VRF_2[V_B] ──► ALU_2 ──► VRF_2[V_C]  (100% Local!)
 Lane 3 Datapath: VRF_3[V_A] + VRF_3[V_B] ──► ALU_3 ──► VRF_3[V_C]  (100% Local!)
 (NO WIRES CROSS BETWEEN LANES! Parasitic capacitance and area minimized!)
```

Look at the physical layout of these 4 lanes:
* **Zero wires cross between Lane 0, Lane 1, Lane 2, and Lane 3!**
* The 128 data wires coming out of Lane 0's VRF slice travel a distance of only **a few micrometers** to reach Lane 0's ALU.
* Parasitic wire capacitance drops by over $95\%$ compared to a monolithic register file!
* The physical area of the register file scales **linearly ($O(N_{\text{lanes}} \cdot W_{\text{lane}} \cdot P^2)$)** rather than quadratically ($O(W_{\text{vec}}^2 \cdot P^2)$)!


### How Sub-Cycling Operates

Let $W_{\text{arch}}$ be the architectural vector register width in bits (e.g., $512\text{ bits}$).
Let $W_{\text{phys}}$ be the total physical width of all vector lanes on the silicon die (e.g., $2 \text{ lanes} \times 128 \text{ bits/lane} = 256\text{ bits}$).

The number of clock cycles $N_{\text{cycles}}$ required to execute a single architectural vector instruction is:

$$\mathbf{N_{\text{cycles}} = \frac{W_{\text{arch}}}{W_{\text{phys}}}}$$

For $W_{\text{arch}} = 512\text{ bits}$ and $W_{\text{phys}} = 256\text{ bits}$:

$$N_{\text{cycles}} = \frac{512\text{ bits}}{256\text{ bits}} = \mathbf{2 \text{ Clock Cycles per Instruction}}$$

#### Execution Timeline:
* **Clock Cycle 1 (Sub-Cycle 0)**: 
  * Physical Lane 0 reads and processes elements $E_0$ and $E_1$ ($0 \dots 127\text{ bits}$).
  * Physical Lane 1 reads and processes elements $E_2$ and $E_3$ ($128 \dots 255\text{ bits}$).
* **Clock Cycle 2 (Sub-Cycle 1)**:
  * Physical Lane 0 reads and processes elements $E_4$ and $E_5$ ($256 \dots 383\text{ bits}$).
  * Physical Lane 1 reads and processes elements $E_6$ and $E_7$ ($384 \dots 511\text{ bits}$).

#### Why Sub-Cycling Is a Massive Win for Binary Compatibility:
1. **Backward and Forward Compatibility**: The exact same software binary compiled for 512-bit vectors runs without re-compilation on a high-end server processor (with 4 physical lanes, taking 1 cycle) and on a low-power mobile processor (with 2 physical lanes, taking 2 cycles)!
2. **Silicon Area Reduction**: Embedded chip designers can shrink the physical die size by fabricating fewer lanes while retaining $100\%$ compatibility with the full vector software ecosystem.


### Challenge 1: Cross-Lane Communication Hazards (Horizontal Operations)

What happens when a vector instruction is **NOT** a vertical pointwise operation?

Consider two common types of non-vertical vector instructions:
1. **Vector Cross-Lane Permutations / Shuffles (`VPERM`)**: An instruction that re-arranges vector elements across arbitrary positions (e.g., moving Element 0 from Lane 0 to Lane 3, and Element 7 from Lane 3 to Lane 0).
2. **Vector Horizontal Reductions (`VREDUCE`)**: An instruction that sums all elements inside a single vector register into a single scalar value ($S = \sum_{e=0}^{N-1} V_A[e]$).

```text
CROSS-LANE PERMUTATION (BREAKS ZERO-WIRING ISOLATION!)

 Lane 0 VRF [Element 0] ──┐
 Lane 1 VRF [Element 1] ──┼──► [ Full Cross-Lane Crossbar Switch ] ──► Lane 3 VRF [Element 0]
 Lane 2 VRF [Element 2] ──┤    (High Wire Congestion & Capacitive Delay!)
 Lane 3 VRF [Element 3] ──┘
```

#### Why Horizontal Operations Suffer a Performance Penalty:
When a vector instruction requires cross-lane data movement:
* The zero-cross-lane-wiring isolation is broken!
* Data elements must leave their local lane boundaries and travel through a **Cross-Lane Crossbar Switch Network** or **Inter-Lane Ring Interconnect**.
* Routing wires across physical lanes introduces parasitic wire capacitance, increasing instruction execution latency from $1\text{ clock cycle}$ up to **$3 \text{ to } 5\text{ clock cycles}$** and burning additional dynamic switching energy.

**Industrial Design Best Practice**: High-performance vector compilers structure algorithms to maximize vertical (pointwise) operations and minimize horizontal reductions and cross-lane permutations.


### Dynamic Energy Spikes ($di/dt$) and Power Gating

A 1,024-bit vector processor featuring 16 parallel 64-bit lanes contains thousands of active multi-bit adders, multipliers, and register flip-flops.

When the CPU transitions instantly from executing scalar code (where only 1 scalar ALU is active) to executing a wide vector instruction:
* All 16 vector lanes turn ON simultaneously within a single clock cycle ($250\text{ picoseconds}$).
* Dynamic current draw spikes instantly from 2 Amperes to **30 Amperes**!

This sudden current surge generates a severe physical power distribution hazard known as an **Inductive Voltage Droop ($di/dt$ spike)**:

$$V_{\text{droop}} = L_{\text{package}} \cdot \frac{di}{dt}$$

Where:
* $V_{\text{droop}}$ is the voltage drop on the internal CPU power supply rails.
* $L_{\text{package}}$ is the parasitic inductance of the chip package pins.
* $\frac{di}{dt}$ is the rate of change of current over time.

If $\frac{di}{dt}$ is too steep, the supply voltage drops below the minimum operating threshold ($V_{\text{min}}$), causing neighboring scalar registers to lose their state and crashing the chip!

#### Hardware Mitigation Strategies:
To prevent $di/dt$ power droops:
1. **Vector Warm-Up Cycles**: When a vector instruction is detected after a long scalar period, the clock distribution network powers ON the vector lanes over **2 to 4 warm-up cycles**, ramping up current gradually.
2. **Fine-Grained Clock Gating**: When vector instructions are not executing, clock trees to unused vector lanes are automatically disabled by AND-gates (*Clock Gating*), eliminating $100\%$ of dynamic switching power in idle lanes.


### Scenario and Parameters

You are a principal vector microarchitect designing the SIMD execution engine for a $3.2\text{ GHz}$ 64-bit RISC-V vector processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor ISA defines **32 architectural vector registers** ($V_0 \dots V_{31}$), each **$1,024\text{ bits}$ wide** ($W_{\text{arch}} = 1,024\text{ bits}$).

The execution engine must support a dual-issue pipeline requiring **4 vector read ports and 2 vector write ports** per instruction cycle ($P_{\text{read}} = 4, P_{\text{write}} = 2 \implies P = 6\text{ total ports}$).

```text
3.2 GHz RISC-V VECTOR PROCESSOR SPECIFICATIONS

 Architectural Register File: 32 Vector Registers x 1,024 Bits (4,096 Bytes Storage)
 Execution Pipeline         : Dual-Issue (4 Read Ports, 2 Write Ports = 6 Total Ports)
 Clock Frequency            : 3.2 GHz (T_clk = 312.5 ps)
```

#### Physical Silicon Manufacturing Constants (28nm CMOS Technology):
* Single-Ported Memory Cell Area Constant: $K_{\text{cell}} = 0.8\text{ }\mu\text{m}^2/\text{bit}$.
* Multi-Ported Area Scaling Factor: $\text{Area} = K_{\text{cell}} \cdot N_{\text{bits}} \cdot \left( \frac{P}{2} \right)^2$.
* Interconnect Wire Pitch Area Constant: $K_{\text{wire}} = 0.05\text{ }\mu\text{m}^2/\text{wire-bit}$.
* Single Physical Lane Execution Width options under evaluation:
  * **Option A**: 8 Physical Lanes of $128\text{ bits}$ each ($W_{\text{phys}} = 1,024\text{ bits}$ total physical width).
  * **Option B**: 4 Physical Lanes of $128\text{ bits}$ each ($W_{\text{phys}} = 512\text{ bits}$ total physical width).

#### Your Objective

1. Calculate the total storage capacity of the vector register file in Kilobytes.
2. Calculate the physical silicon die area (in $\text{mm}^2$) for:
   * A Monolithic 1,024-bit Register File.
   * Option A (8 Physical Lanes).
   * Option B (4 Physical Lanes).
   
   Quantify the percentage die area savings achieved by lane partitioning.
3. Calculate the required execution time in clock cycles and nanoseconds to process a 1,024-bit vector addition instruction (`VADD.VV`) under **Option A** versus **Option B** (using time-multiplexed sub-cycling).
4. Given a 1,024-bit vector containing 32-bit single-precision floating-point elements ($W_{\text{elem}} = 32\text{ bits}$), calculate the target Lane Index $L_{\text{idx}}$ and Intra-Lane Bit Offset $O_{\text{lane}}$ for **Element 13** ($e = 13$) under **Option A** (8 Lanes of 128 Bits).
5. Verify mathematical, structural, and timing correctness.


#### Step 2: Physical Silicon Die Area Scaling Analysis

We evaluate silicon area using the multi-ported cell area equation and wire routing pitch penalties:

$$P = 6 \text{ Total Ports } (4 \text{ Read} + 2 \text{ Write})$$

$$\text{Port Scaling Factor} = \left( \frac{P}{2} \right)^2 = \left( \frac{6}{2} \right)^2 = 3^2 = \mathbf{9.0}$$

##### 1. Area of Monolithic 1,024-Bit Register File:
A monolithic register file routes all 6 ports across the entire 1,024-bit width simultaneously.

$$\text{Cell Area}_{\text{mono}} = 32,768 \text{ bits} \times 0.8\text{ }\mu\text{m}^2/\text{bit} \times 9.0 = 235,929.6\text{ }\mu\text{m}^2$$

Wiring Congestion Penalty ($P \cdot W_{\text{arch}} \cdot N_{\text{regs}}$ wire crossings):

$$\text{Wire Area}_{\text{mono}} = 6 \text{ ports} \times 1,024 \text{ bits} \times 32 \text{ regs} \times 0.05\text{ }\mu\text{m}^2 = 9,830.4\text{ }\mu\text{m}^2 \times 9.0 = 88,473.6\text{ }\mu\text{m}^2$$

$$\text{Total Area}_{\text{mono}} = 235,929.6 + 88,473.6 = 324,403.2\text{ }\mu\text{m}^2 = \mathbf{0.3244 \text{ mm}^2}$$


##### 3. Area of Option B (4 Physical Lanes of 128 Bits each):
Option B implements only 4 physical lanes on silicon ($W_{\text{phys}} = 512\text{ bits}$ physical execution width):

$$\text{Total Area}_{\text{OptionB}} = 4 \text{ lanes} \times 30,720.0\text{ }\mu\text{m}^2 = 122,880.0\text{ }\mu\text{m}^2 = \mathbf{0.1229 \text{ mm}^2}$$

$$\text{Die Area Savings (Option B vs Monolithic)} = \frac{0.3244 - 0.1229}{0.3244} \times 100\% = \mathbf{62.1\% \text{ Area Reduction!}}$$

```text
SILICON DIE AREA COMPARISON SUMMARY

 Architecture Configuration  │ Physical Width │ Silicon Die Area (mm²) │ Die Area Savings
─────────────────────────────┼────────────────┼────────────────────────┼───────────────────
 Monolithic Register File    │ 1,024 Bits     │ 0.3244 mm²             │ 0.0% (Baseline)
 Option A (8 Vector Lanes)   │ 1,024 Bits     │ 0.2458 mm²             │ 24.2% Saved
 Option B (4 Vector Lanes)   │   512 Bits     │ 0.1229 mm²             │ 62.1% SAVED!
```


#### Step 4: Element Address Mapping for Element 13 ($e = 13$) under Option A

We map Element 13 ($e = 13$) containing a 32-bit float ($W_{\text{elem}} = 32\text{ bits}$) across 8 lanes of 128 bits each ($N_{\text{lanes}} = 8, W_{\text{lane}} = 128\text{ bits}$):

##### 1. Physical Bit Address of Element 13:
$$\text{Bit\_Addr}(13) = e \times W_{\text{elem}} = 13 \times 32 \text{ Bits} = \mathbf{416 \text{ Bits}}$$

Element 13 spans bits $[447:416]$ within the 1,024-bit vector register.

##### 2. Calculate Target Lane Index ($L_{\text{idx}}$):
$$L_{\text{idx}}(13) = \left\lfloor \frac{416\text{ Bits}}{128\text{ Bits/Lane}} \right\rfloor \pmod 8 = \lfloor 3.25 \rfloor \pmod 8 = \mathbf{\text{Lane Index } 3}$$

Element 13 resides inside **Physical Lane 3**!

##### 3. Calculate Intra-Lane Bit Offset ($O_{\text{lane}}$):
$$O_{\text{lane}}(13) = (416\text{ Bits}) \pmod{128\text{ Bits}} = \mathbf{32 \text{ Bits}}$$

Inside Lane 3's local 128-bit register slice, Element 13 starts at **bit offset 32** (spanning intra-lane bits $[63:32]$).

```text
ELEMENT 13 MAPPING VERIFICATION

 Vector Register Bit Address Range : Bits [447:416]
 Target Physical Lane Index (L_idx): Lane 3 (Holds Bits [511:384])
 Intra-Lane Offset Range (O_lane)  : Bits [63:32] inside Lane 3 Slice
 (Mapping mathematically verified with 100% precision!)
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Vector Register File (VRF)**: The architectural memory state structure that stores wide vector registers ($V_0 \dots V_{N-1}$), vertically partitioned into physical lane slices to prevent quadratic area scaling and un-routable wire pin congestion.
* **Vector Lane (Lane Slice)**: A self-contained vertical partition of a vector processor that integrates a local slice of the Vector Register File, local execution units (ALUs/FPUs), and local result buses, executing pointwise vector operations on its assigned subset of vector elements with zero cross-lane wiring overhead.
