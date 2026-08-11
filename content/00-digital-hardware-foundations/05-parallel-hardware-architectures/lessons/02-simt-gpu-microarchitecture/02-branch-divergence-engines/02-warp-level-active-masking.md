content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/02-branch-divergence-engines/02-warp-level-active-masking.md
# Active Thread Mask Mechanics and Divergent Execution Penalty Quantification

## The Un-Gated Writeback Hazard: Why Divergent SIMT Execution Requires Active Masking

In Single Instruction, Multiple Threads (SIMT) GPU microarchitectures, parallel processing throughput is achieved by bundling 32 scalar threads into a single hardware execution unit called a **Warp**. All 32 threads in a warp share a single Program Counter (PC) and an instruction fetch/decode pipeline. On every clock cycle, the warp scheduler fetches one instruction (such as an addition `ADD R3, R1, R2` or a floating-point division `FDIV R4, R5, R6`) and broadcasts that instruction across 32 parallel execution lanes, executing the operation in lockstep across all 32 threads.

During linear, un-conditional execution, every thread in the warp needs the instruction executed, and all 32 physical execution lanes write their results to their private scalar registers inside the SIMT Physical Register File.

However, when a software algorithm contains conditional control flow—such as an `if-else` branch statement—the condition evaluates differently across different threads within the same warp:

```c
// CONDITIONAL IF-ELSE BRANCH IN SIMT KERNEL CODE
if (data[threadIdx.x] > 10.0f) {
    R3 = R1 / R2;  // IF-Path: Executed ONLY for threads where data > 10.0f
} else {
    R3 = R1 + R2;  // ELSE-Path: Executed ONLY for threads where data <= 10.0f
}
```

Suppose the condition `data > 10.0f` evaluates to **TRUE for Threads 0 through 15**, but evaluates to **FALSE for Threads 16 through 31**.

To handle this control-flow divergence, the SIMT hardware **serializes the execution paths**:
1. First, the GPU sets the Program Counter to the `if`-path address and broadcasts the division instruction `FDIV R3, R1, R2` to all 32 execution lanes.
2. Next, the GPU sets the Program Counter to the `else`-path address and broadcasts the addition instruction `ADD R3, R1, R2` to all 32 execution lanes.

Now, consider the catastrophic microarchitectural failure that occurs if the hardware has no way to disable individual execution lanes during these serialized execution phases:

```text
THE UN-GATED WRITEBACK HAZARD

 Phase 1: Executing IF-Path Division (FDIV R3, R1, R2)
 Threads 0..15 (Condition TRUE): Calculate R1 / R2 -> Write result to R3 (CORRECT!)
 Threads 16..31 (Condition FALSE): Calculate R1 / R2 -> Write result to R3! (CORRECTNESS BROKEN!)
                                   (Overwrites R3 with unwanted division result!)
                                   (Triggers Division-by-Zero Exception if R2 == 0!)
```

Trace the hardware breakdown during Phase 1:
* Threads 16 through 31 evaluated the condition as **FALSE**. They were supposed to execute the `else`-path (`ADD`), **NOT** the `if`-path (`FDIV`).
* If Lane 16 through Lane 31 execute the `FDIV` instruction and write the division result into their destination register $R3$, **they overwrite $R3$ with unwanted, invalid data**!
* Furthermore, if $R2 = 0.0\text{f}$ for Thread 16, executing `FDIV` in Lane 16 triggers an illegal **Division-by-Zero Floating-Point Exception (`DZ`)**, stalling the CPU pipeline or firing an error trap for a thread that was never supposed to execute the division!
* Later, during Phase 2 (`else`-path), if Lanes 0 through 15 execute `ADD R3, R1, R2` without control, **they overwrite the valid division results they computed in Phase 1!**

Look at the physical correctness failure:
If the execution pipeline broadcasts instructions unconditionally to all 32 physical lanes, **disabled threads corrupt their registers, overwrite memory, and fire illegal hardware exceptions!**

How does the GPU execution engine selectively enable active threads and disable inactive threads on a per-instruction, per-lane basis on every single clock cycle?

How do we quantify the exact performance penalty and efficiency loss incurred when a warp diverges across multiple execution paths?

To guarantee $100\%$ software correctness during branch divergence and quantify execution performance, GPU microarchitectures implement **The Active Thread Mask** and **The Divergent Execution Penalty Metric**.

---

## The Stencil Shield and the Dual-Pass Spray Cannon: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of active thread masks, register write-back gating, and divergent execution penalties before inspecting gate-level hardware schematics and efficiency equations, let us consider an everyday analogy: **The Industrial T-Shirt Spray-Painting Factory**.

Imagine an automated factory conveyor belt (**A 32-Lane SIMT Execution Engine**) processing 32 T-shirts (**32 Scalar Threads: Shirt 0 through Shirt 31**) sitting side-by-side in a single row.

```text
THE T-SHIRT SPRAY-PAINTING FACTORY METAPHOR

 Conveyor Belt (32 Execution Lanes: Shirt 0 to Shirt 31)
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │Shirt │Shirt │Shirt │Shirt │...│Shirt │Shirt │Shirt │Shirt │
 │  31  │  30  │  29  │  28  │   │  3   │  2   │  1   │  0   │
 └──────┴──────┴──────┴──────┴───┴──────┴──────┴──────┴──────┘
```

The factory manager wants to paint logos onto the shirts according to an order form:
* Shirts 0 through 15 need a **Red Logo** (**The `if`-path operation**).
* Shirts 16 through 31 need a **Blue Logo** (**The `else`-path operation**).

The factory features an overhead **Spray-Paint Cannon** (**The Instruction Broadcast Unit**). When the cannon fires, it sprays paint across all 32 shirt positions at the exact same second.

Let us observe two different operational strategies for how the factory paints these shirts:

---

### Strategy 1: Un-Gated Spraying (No Active Masking / Data Corruption)

The factory manager fires the Red Spray Cannon across all 32 shirt slots without protecting Shirts 16 through 31.

Look at the damage:
1. Red paint lands on Shirts 0 through 15 (**Correct!**).
2. Red paint **ALSO lands on Shirts 16 through 31** (**Corrupted!**). Shirts 16 through 31 were supposed to get Blue logos, but now they are ruined with Red paint!
3. Next, the manager fires the Blue Spray Cannon across all 32 shirt slots.
4. Blue paint lands on Shirts 16 through 31, but **ALSO covers Shirts 0 through 15**, ruining the Red logos they just received!

This is the exact physical analogue of the **Un-Gated Writeback Hazard**.

---

### Strategy 2: Stencil Shield Masking (Active Thread Masking)

To protect the shirts, the factory manager installs a **Plastic Stencil Shield (The Active Thread Mask $M_{\text{active}}$)** underneath the spray cannon.

The stencil shield is a 32-slot plastic sheet:
* **Slot Open (Bit = 1)**: Paint passes through to the shirt (**Lane Enabled / Active**).
* **Slot Closed / Covered (Bit = 0)**: Solid plastic blocks the paint from touching the shirt (**Lane Disabled / Inactive**).

```text
STENCIL SHIELD MASKING IN ACTION

 Pass 1: Paint Red Logos (Active Mask M_active = 0x0000FFFF)
 Stencil Shield : [ SOLID PLASTIC (0) ] [ OPEN HOLES (1) ]  (Slots 0..15 Open!)
                  │                     │
                  ▼ Red Paint Blocked!   ▼ Red Paint Lands!
                  Shirts 16..31 SAFE    Shirts 0..15 Painted Red!

 Pass 2: Paint Blue Logos (Active Mask M_active = 0xFFFF0000)
 Stencil Shield : [ OPEN HOLES (1) ]    [ SOLID PLASTIC (0) ] (Slots 16..31 Open!)
                  │                     │
                  ▼ Blue Paint Lands!   ▼ Blue Paint Blocked!
                  Shirts 16..31 Blue!   Shirts 0..15 SAFE!
```

Trace how Strategy 2 executes the two-pass painting process:

#### Pass 1: Painting Red Logos (`if`-path)
1. The manager installs Stencil Shield 1: Slots 0 through 15 have **Open Holes ($1$)**, while Slots 16 through 31 are **Covered in Solid Plastic ($0$)** ($\text{Mask} = \text{32'h0000\_FFFF}$).
2. The Red Spray Cannon fires across all 32 slots.
3. Red paint passes through the open holes onto Shirts 0 through 15. The solid plastic shield **blocks red paint from touching Shirts 16 through 31**!

#### Pass 2: Painting Blue Logos (`else`-path)
1. The manager swaps to Stencil Shield 2: Slots 0 through 15 are **Covered in Solid Plastic ($0$)**, while Slots 16 through 31 have **Open Holes ($1$)** ($\text{Mask} = \text{32'hFFFF\_0000}$).
2. The Blue Spray Cannon fires across all 32 slots.
3. Blue paint passes through the open holes onto Shirts 16 through 31. The solid plastic shield **blocks blue paint from touching Shirts 0 through 15**!

---

### Quantifying the Factory Efficiency Loss (Divergent Execution Penalty)

Look at the time and material cost of Strategy 2:
* To paint 32 shirts, the factory ran the conveyor belt and fired spray cannons **TWICE** (Pass 1 and Pass 2).
* During Pass 1, 16 shirt slots were covered in plastic doing nothing.
* During Pass 2, 16 shirt slots were covered in plastic doing nothing.
* Total Time = **2 Minutes** (instead of 1 minute if all shirts needed the same logo).
* **Factory Efficiency = $50\%$** (half the spray slots were wasted on each pass).

This stencil shield system is the exact physical analogue of **Active Thread Masking and the Divergent Execution Penalty**:
* The 32 T-shirts are **32 Parallel Scalar Threads in a Warp**.
* Spraying Red vs. Blue paint is executing **`if`-path vs. `else`-path instructions**.
* The plastic stencil shield is **The Active Thread Mask Register ($M_{\text{active}}$)**.
* Open holes ($1$) and solid plastic ($0$) are **Active Bits ($M_{\text{active}}[i] = 1$ vs $M_{\text{active}}[i] = 0$)**.
* Blocking paint over solid plastic is **Register Writeback Gating and Memory Request Suppression**.
* Running the conveyor belt twice is **Instruction Execution Serialization**.
* $50\%$ Factory Efficiency is **SIMT Hardware Execution Efficiency ($\eta_{\text{SIMT}}$)**.

---

## Primitive 1: The Active Thread Mask Register ($M_{\text{active}}$)

Now that we possess a clear intuitive mental model of the plastic stencil shield, let us examine the formal, rigorous engineering mechanics of **The Active Thread Mask Register ($M_{\text{active}}$)**.

In a GPU Streaming Multiprocessor (SM), every physical warp execution pipeline maintains a dedicated 32-bit control register called **The Active Thread Mask Register ($M_{\text{active}}$)** (also referred to as the **Execution Gate Mask** or **Active Mask Vector**).

> **The Active Thread Mask ($M_{\text{active}}$)** is a 32-bit hardware bitmask register maintained by the Warp Scheduler for every resident warp, where bit position $i$ ($0 \le i < 32$) controls whether physical execution lane $i$ (Thread $i$) is enabled to execute instructions and commit state changes ($M_{\text{active}}[i] = 1$) or disabled ($M_{\text{active}}[i] = 0$) during the current clock cycle.

```text
ACTIVE THREAD MASK REGISTER DATAPATH (32 BITS)

 Active Thread Mask Register M_active [31:0]
 ┌────┬────┬────┬────┬───┬────┬────┬────┬────┐
 │M31 │M30 │M29 │M28 │...│ M3 │ M2 │ M1 │ M0 │ (32 Bits for 32 Execution Lanes)
 └─┬──┴─┬──┴─┬──┴─┬──┴───┴─┬──┴─┬──┴─┬──┴─┬──┘
   │    │    │    │        │    │    │    │
   ▼    ▼    ▼    ▼        ▼    ▼    ▼    ▼
 Lane31 30   29   28       3    2    1   Lane0 Hardware Gate Enables
```

---

### Hardware Gating Mechanisms in Execution Lanes

On every clock cycle, when an instruction (e.g., `ADD R3, R1, R2` or `ST.E [R1], R2`) is broadcast across the 32 physical execution lanes, bit $M_{\text{active}}[i]$ controls four hardware gating sub-circuits inside Lane $i$:

```text
HARDWARE GATING SUB-CIRCUITS CONTROLLED BY M_active[i]

 Instruction Broadcast: ADD R3, R1, R2
                     │
        Is Active Mask Bit M_active[i] == 1?
                     │
           ┌─────────┴─────────┐
           │ YES (M_active=1)  │ NO (M_active=0 - Lane Disabled!)
           ▼                   ▼
    Lane i Enabled       LANE i HARDWARE GATING ENFORCED:
    Execute Math         1. Register Write-Enable = 0 (R3 Protected!)
    Commit to R3         2. Memory Request Strobe = 0 (No Bus Writes!)
                         3. Exception Suppressed (No Traps!)
                         4. Clock Tree Gated (0 Dynamic Power!)
```

#### 1. Register Write-Back Gating (Register Protection)
Inside the SIMT Physical Register File, every write port is controlled by a **Write-Enable Line ($\text{WE}_i$)**.
* If $M_{\text{active}}[i] == 1$: $\text{WE}_i = 1$. The calculation result is written into Thread $i$'s scalar register $R3$.
* If $M_{\text{active}}[i] == 0$: **$\text{WE}_i \Leftarrow 0$**. The write-enable gate is forced to zero! 
  
  Thread $i$'s scalar register $R3$ remains completely untouched and undisturbed, retaining its previous valid data!

#### 2. Memory Request Suppression (Bus Protection)
During a global memory load or store instruction (`LD.E` / `ST.E`):
* If $M_{\text{active}}[i] == 1$: Lane $i$ generates a memory request for address $A_i$.
* If $M_{\text{active}}[i] == 0$: **Lane $i$'s memory request strobe is forced to $0$**. 
  
  Lane $i$ generates zero memory read/write commands, preventing invalid memory overwrites or illegal page accesses!

#### 3. Floating-Point Exception Suppression (Trap Protection)
During arithmetic operations (such as floating-point division `FDIV`):
* If $M_{\text{active}}[i] == 1$: Exceptions (such as Division-by-Zero `DZ` or Invalid Operation `NV`) are recorded in the Vector FCSR.
* If $M_{\text{active}}[i] == 0$: **Lane $i$'s exception outputs are forced to $0$**. 
  
  Division-by-zero or overflow events occurring inside disabled lanes are completely ignored by hardware!

#### 4. Dynamic Clock Gating (Power Savings)
When $M_{\text{active}}[i] == 0$, the clock distribution AND-gate to Lane $i$'s ALU is turned OFF (**Clock Gating**). Transistors inside Lane $i$ do not switch states, reducing Lane $i$'s dynamic power consumption ($P_{\text{dyn}} = C_{\text{eff}} \cdot V_{DD}^2 \cdot f_{\text{clk}} \cdot \alpha$) to zero!

---

## Primitive 2: The Divergent Execution Penalty Metric

Now let us examine the second core primitive: **Quantifying the Divergent Execution Penalty**.

When a warp diverges across multiple branch paths, the SIMT execution engine executes each path sequentially, using $M_{\text{active}}$ to enable the appropriate subset of threads for each path.

### The Math of Serialized Path Execution

Suppose a conditional code block inside a warp diverges into $K$ distinct execution paths (e.g., $K = 2$ for `if-else`, or $K = 4$ for a 4-way `switch-case` statement).

Let $T_k$ be the number of instruction execution cycles required to complete Path $k$ ($1 \le k \le K$).

Let $M_k$ be the Active Thread Mask vector for Path $k$, where $N_{\text{active}}(k)$ is the number of active threads in Path $k$:

$$N_{\text{active}}(k) = \sum_{i=0}^{31} M_k[i]$$

The **Total Execution Time ($T_{\text{divergent}}$)** required for the warp to complete the entire divergent control-flow block and reach the re-convergence point is the **SUM of the execution times of all $K$ paths**:

$$\mathbf{T_{\text{divergent}} = \sum_{k=1}^K T_k = T_1 + T_2 + \dots + T_K}$$

Where:
* $T_{\text{divergent}}$ is the total execution time in clock cycles for the divergent block.
* $K$ is the number of divergent branch paths executed ($K \ge 1$).
* $T_k$ is the instruction execution time in clock cycles for Path $k$.

```text
DIVERGENT EXECUTION TIME IS ADITIVE (PATH SERIALIZATION)

 Total Time T_divergent = T_path_1 + T_path_2 + ... + T_path_K
 ┌──────────────────────┬──────────────────────┬──────────────────────┐
 │ Path 1 Execution     │ Path 2 Execution     │ Path K Execution     │
 │ (T1 Cycles)          │ (T2 Cycles)          │ (TK Cycles)          │
 └──────────────────────┴──────────────────────┴──────────────────────┘
  (The warp pays the FULL execution latency for EVERY active path!)
```

---

### The SIMT Hardware Execution Efficiency Equation ($\eta_{\text{SIMT}}$)

To measure how effectively a divergent warp utilizes the physical CUDA core ALUs on the silicon die, computer architects calculate the **SIMT Hardware Execution Efficiency ($\eta_{\text{SIMT}}$)**.

Let $W_{\text{size}}$ be the hardware warp size ($W_{\text{size}} = 32$ threads).

During cycle $t$ of Path $k$, the number of active execution lanes is $N_{\text{active}}(k)$. The remaining $W_{\text{size}} - N_{\text{active}}(k)$ lanes are disabled by $M_{\text{active}}$ and sit completely idle.

The **SIMT Hardware Execution Efficiency ($\eta_{\text{SIMT}}$)** is the ratio of total active thread-cycles executed to total available hardware thread-cycles:

$$\mathbf{\eta_{\text{SIMT}} = \frac{\sum_{k=1}^K \Big( N_{\text{active}}(k) \cdot T_k \Big)}{W_{\text{size}} \times T_{\text{divergent}}} \times 100\%}$$

Where:
* $\eta_{\text{SIMT}}$ is the SIMT execution efficiency percentage ($0\% < \eta_{\text{SIMT}} \le 100\%$).
* $N_{\text{active}}(k)$ is the number of active threads executing Path $k$ ($1 \le N_{\text{active}}(k) \le 32$).
* $T_k$ is the execution time of Path $k$ in clock cycles.
* $W_{\text{size}}$ is the warp size ($32$ threads).
* $T_{\text{divergent}}$ is the total serialized execution time ($\sum_{k=1}^K T_k$).

---

### Evaluating Efficiency Across Different Divergence Patterns

Let us evaluate $\eta_{\text{SIMT}}$ across four distinct real-world branch divergence scenarios on a 32-thread warp executing an `if-else` block where both `if` and `else` paths take $100\text{ clock cycles}$ ($T_{\text{if}} = 100\text{ cycles}, T_{\text{else}} = 100\text{ cycles}$):

```text
DIVERGENCE EFFICIENCY PATTERN COMPARISON MATRIX

 Divergence Scenario         │ Active Threads IF │ Active Threads ELSE │ Total Cycles │ SIMT Efficiency η_SIMT
─────────────────────────────┼───────────────────┼─────────────────────┼──────────────┼────────────────────────
 Scenario 0: Uniform (0% Div)│ 32 Threads (100%) │ 0 Threads (0%)      │ 100 Cycles   │ 100.0% (MAX EFFICIENCY!)
 Scenario 1: Even (50/50 Div) │ 16 Threads (50%)  │ 16 Threads (50%)    │ 200 Cycles   │  50.0% (HALVED!)
 Scenario 2: Unbalanced (31/1)│ 31 Threads (97%)  │ 1 Thread (3%)       │ 200 Cycles   │  50.0% (HALVED!)
 Scenario 3: 4-Way Switch Div│ 8 Threads / Path  │ 4 Paths x 100 Cycles│ 400 Cycles   │  25.0% (QUARTERED!)
```

#### Detailed Scenario Analysis:

##### 1. Scenario 0: Uniform Execution (Zero Divergence — $100\%$ Efficiency)
* All 32 threads evaluate condition as TRUE. $N_{\text{active}}(\text{if}) = 32$. `else`-path is skipped ($T_{\text{else}} = 0$).
* Total Time $T = 100\text{ cycles}$. Active thread-cycles $= 32 \times 100 = 3,200$.

$$\eta_{\text{SIMT}} = \frac{3,200}{32 \times 100} \times 100\% = \mathbf{100.0\% \text{ Efficiency}}$$

##### 2. Scenario 1: Symmetric 50/50 Divergence ($50\%$ Efficiency)
* 16 threads take `if`-path ($100\text{ cycles}$), 16 threads take `else`-path ($100\text{ cycles}$).
* Total Time $T = 100 + 100 = 200\text{ cycles}$.
* Active thread-cycles $= (16 \times 100) + (16 \times 100) = 3,200$.
* Available thread-cycles $= 32 \times 200 = 6,400$.

$$\eta_{\text{SIMT}} = \frac{3,200}{6,400} \times 100\% = \mathbf{50.0\% \text{ Efficiency}}$$

##### 3. Scenario 2: Unbalanced Single-Thread Outlier ($50\%$ Efficiency — The Worst Case!)
* **31 threads** take `if`-path ($100\text{ cycles}$), **only 1 thread** takes `else`-path ($100\text{ cycles}$).
* Total Time $T = 100 + 100 = 200\text{ cycles}$.
* Active thread-cycles $= (31 \times 100) + (1 \times 100) = 3,200$.

$$\eta_{\text{SIMT}} = \frac{3,200}{6,400} \times 100\% = \mathbf{50.0\% \text{ Efficiency}}$$

Look at Scenario 2! Even though $97\%$ of threads took the `if`-path, **a single outlier thread taking the `else`-path doubled the total execution time** and cut hardware efficiency in half! 

The warp was forced to pay the full $100\text{-cycle}$ execution penalty for the `else`-path while 31 CUDA cores sat idle!

---

## Architectural Mitigation: Branch Predication (If-Conversion)

Because branch divergence and path serialization degrade SIMT execution efficiency, modern GPU compilers and hardware execution engines employ an advanced optimization technique to eliminate small divergent branches completely: **Branch Predication (If-Conversion)**.

### How If-Conversion Eliminates Branch Divergence

When a conditional `if-else` block contains only a few short instructions (e.g., 1 or 2 instructions per branch path), the compiler avoids generating branch instructions entirely!

Instead, the compiler converts the conditional code into **Predicated Instructions**:

```c
// SHORT CONDITIONAL STATEMENT
if (A[i] > 10.0f) {
    X = A[i] + 2.0f; // IF-Path (1 instruction)
} else {
    X = A[i] - 5.0f; // ELSE-Path (1 instruction)
}
```

```assembly
# GPU ASSEMBLY WITH BRANCH PREDICATION (ZERO DIVERGENCE STACK PUSHES!)
# 1. Generate Predicate Mask in p1
SETP.GT.AND  p1, p2, A, 10.0f;  # p1 = (A > 10.0f)
                                # p2 = NOT p1

# 2. Execute BOTH instructions predicated in sequence
@p1 ADD  X, A,  2.0f;  # Executed ONLY in lanes where p1 == 1
@p2 SUB  X, A,  5.0f;  # Executed ONLY in lanes where p2 == 1
```

```text
BRANCH PREDICATION (IF-CONVERSION) TIMING

 Cycle 1 : SETP.GT   p1 = (A > 10.0f), p2 = NOT p1  ──► 1 Cycle
 Cycle 2 : @p1 ADD   X, A, 2.0f                      ──► 1 Cycle (Lanes with p1=1 active)
 Cycle 3 : @p2 SUB   X, A, 5.0f                      ──► 1 Cycle (Lanes with p2=1 active)
 (Total Time = 3 Cycles! ZERO Divergence Stack Push/Pop Overhead!)
```

Trace the microarchitectural speedup of If-Conversion:
1. **Zero Divergence Stack Overheads**: The hardware does NOT push or pop tokens on the Branch Divergence Stack! Zero stack memory access delays are incurred.
2. **Zero Instruction Pointer Jumps**: The Program Counter ($PC$) steps linearly through instructions `SETP` $\to$ `@p1 ADD` $\to$ `@p2 SUB`.
3. **Execution Speed**: The 3-instruction predicated block completes in **3 clock cycles** instead of paying 30+ cycles of branch divergence stack overheads!

#### The Compiler Threshold Rule for If-Conversion:
* **Short Branch Paths ($\le 4\text{ instructions}$)**: The compiler uses **If-Conversion (Predication)**. Both paths are executed sequentially using predicate flags `@p1` and `@p2`, avoiding divergence stack overheads.
* **Long Branch Paths ($> 4\text{ instructions}$)**: The compiler uses **Branch Divergence Stack Push/Pop**, jumping over large code blocks to avoid executing hundreds of instructions on disabled lanes.

---

## Solved Industrial Engineering Exercise: Quantitative Active Mask Gating, Divergent Execution Penalty, and SIMT Efficiency Analysis

To consolidate your complete mastery of active thread masks, register writeback gating, $K$-way branch divergence serialization, SIMT execution efficiency calculations ($\eta_{\text{SIMT}}$), and predication trade-offs, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the SIMT execution engine of a $2.0\text{ GHz}$ GPU Streaming Multiprocessor ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The SM executes warps containing 32 parallel threads ($W_{\text{size}} = 32\text{ threads}$).

The SM executes a ray-tracing bounding-box kernel that contains a 3-way divergent `switch-case` control block:

```c
// 3-WAY DIVERGENT SWITCH-CASE KERNEL
switch (ray_type[threadIdx.x]) {
    case 0: // Path A: Shadow Ray (30 Instructions, 30 Cycles)
        process_shadow_ray();
        break;
    case 1: // Path B: Reflection Ray (70 Instructions, 70 Cycles)
        process_reflection_ray();
        break;
    case 2: // Path C: Refraction Ray (100 Instructions, 100 Cycles)
        process_refraction_ray();
        break;
}
// RE-CONVERGENCE POINT: All threads merge back together!
```

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR SPECIFICATIONS

 Clock Frequency       : 2.0 GHz (T_clk = 500 ps)
 Warp Size             : 32 Threads (Active Mask = 32 Bits)
 Instruction Execution : 1 Clock Cycle per Instruction (when active)
```

#### Thread Divergence Distribution across Warp 0 (32 Threads):
* **Path A (Shadow Ray, 30 Cycles)**: Evaluates TRUE for **16 Threads** (Threads 0..15).
* **Path B (Reflection Ray, 70 Cycles)**: Evaluates TRUE for **12 Threads** (Threads 16..27).
* **Path C (Refraction Ray, 100 Cycles)**: Evaluates TRUE for **4 Threads** (Threads 28..31).

#### Your Objective

1. Calculate the active thread mask vectors ($M_{\text{PathA}}, M_{\text{PathB}}, M_{\text{PathC}}$) in 32-bit hexadecimal notation for all 3 divergent paths.
2. Calculate the total serialized execution time $T_{\text{divergent}}$ (in clock cycles and nanoseconds) required for Warp 0 to complete the 3-way divergent block.
3. Calculate the total active thread-cycles executed and the **SIMT Hardware Execution Efficiency ($\eta_{\text{SIMT}}$)** for this 3-way divergent block.
4. Calculate the execution time and throughput if all 32 threads had executed Path C uniformly without divergence.
5. Calculate the **Divergent Execution Penalty Factor** comparing actual divergent execution time against the time required if threads had executed without path serialization.
6. Verify mathematical, structural, and masking correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Active Thread Mask Vectors ($M_{\text{active}}$)

* **Path A (Threads 0..15 active, 16..31 disabled)**:
  * Bits $0 \dots 15 = 1$, Bits $16 \dots 31 = 0$.
  * Binary: `32'b0000_0000_0000_0000_1111_1111_1111_1111_2`

$$\mathbf{M_{\text{PathA}} = \text{32'h0000\_FFFF}} \quad (N_{\text{active}}(A) = 16\text{ Threads})$$

* **Path B (Threads 16..27 active, others disabled)**:
  * Bits $16 \dots 27 = 1$, Bits $0 \dots 15 = 0$, Bits $28 \dots 31 = 0$.
  * Binary: `32'b0000_1111_1111_1111_0000_0000_0000_0000_2`

$$\mathbf{M_{\text{PathB}} = \text{32'h0FFF\_0000}} \quad (N_{\text{active}}(B) = 12\text{ Threads})$$

* **Path C (Threads 28..31 active, others disabled)**:
  * Bits $28 \dots 31 = 1$, Bits $0 \dots 27 = 0$.
  * Binary: `32'b1111_0000_0000_0000_0000_0000_0000_0000_2`

$$\mathbf{M_{\text{PathC}} = \text{32'hF000\_0000}} \quad (N_{\text{active}}(C) = 4\text{ Threads})$$

```text
ACTIVE THREAD MASK VECTORS FOR 3 DIVERGENT PATHS

 Path A (Shadow)     : 0x0000FFFF (Threads 0..15 Active  - 16 Threads)
 Path B (Reflection) : 0x0FFF0000 (Threads 16..27 Active - 12 Threads)
 Path C (Refraction) : 0xF0000000 (Threads 28..31 Active -  4 Threads)
```

---

#### Step 2: Calculate Total Serialized Execution Time ($T_{\text{divergent}}$)

Because all 3 paths diverge, the SIMT execution engine serializes the 3 paths sequentially:

$$T_{\text{divergent}} = T_{\text{PathA}} + T_{\text{PathB}} + T_{\text{PathC}}$$

Given $T_{\text{PathA}} = 30\text{ cycles}$, $T_{\text{PathB}} = 70\text{ cycles}$, $T_{\text{PathC}} = 100\text{ cycles}$:

$$T_{\text{divergent}} = 30 + 70 + 100 = \mathbf{200 \text{ Clock Cycles}}$$

$$\text{Time in Nanoseconds} = 200 \text{ cycles} \times 0.500 \text{ ns/cycle} = \mathbf{100.0 \text{ nanoseconds}}$$

The 3-way divergent block takes **$200\text{ clock cycles}$ ($100.0\text{ ns}$)** to complete!

---

#### Step 3: Calculate SIMT Hardware Execution Efficiency ($\eta_{\text{SIMT}}$)

We calculate total active thread-cycles executed across the 3 phases:
* Phase A ($T_{\text{PathA}} = 30\text{ cycles}$): $N_{\text{active}}(A) = 16 \implies 16 \times 30 = 480\text{ thread-cycles}$.
* Phase B ($T_{\text{PathB}} = 70\text{ cycles}$): $N_{\text{active}}(B) = 12 \implies 12 \times 70 = 840\text{ thread-cycles}$.
* Phase C ($T_{\text{PathC}} = 100\text{ cycles}$): $N_{\text{active}}(C) = 4 \implies 4 \times 100 = 400\text{ thread-cycles}$.

$$\text{Total Active Thread-Cycles} = 480 + 840 + 400 = \mathbf{1,720 \text{ Active Thread-Cycles}}$$

##### Total Available Hardware Thread-Cycles:

$$\text{Total Available Thread-Cycles} = W_{\text{size}} \times T_{\text{divergent}} = 32 \text{ lanes} \times 200 \text{ cycles} = \mathbf{6,400 \text{ Thread-Cycles}}$$

##### Calculate SIMT Execution Efficiency ($\eta_{\text{SIMT}}$):

$$\eta_{\text{SIMT}} = \frac{\text{Active Thread-Cycles}}{\text{Total Available Thread-Cycles}} \times 100\% = \frac{1,720}{6,400} \times 100\% = \mathbf{26.875\% \text{ SIMT Efficiency!}}$$

```text
SIMT HARDWARE EFFICIENCY BREAKDOWN

 Active Thread-Cycles Executed  : 1,720 Thread-Cycles
 Idle Gated Thread-Cycles Wasted: 4,680 Thread-Cycles (73.125% Wasted!)
 SIMT Hardware Efficiency eta    : 26.875%
```

Look at the efficiency result:
Due to 3-way branch divergence, **$73.125\%$ of physical CUDA core execution capacity was completely wasted**! Over $73\%$ of the available thread-cycles were spent sitting idle with $M_{\text{active}}[i] = 0$.

---

#### Step 4: Calculate Uniform Non-Divergent Execution Benchmark

If all 32 threads had taken Path C uniformly (without divergence):
* $N_{\text{active}} = 32$ threads. $T = 100\text{ cycles}$.
* Total execution time $= 100\text{ cycles}$ ($50.0\text{ ns}$).
* Active thread-cycles $= 32 \times 100 = 3,200\text{ thread-cycles}$.
* $\eta_{\text{SIMT}} = \frac{3,200}{3,200} = \mathbf{100.0\% \text{ Efficiency}}$.

---

#### Step 5: Calculate Divergent Execution Penalty Factor

We compare actual divergent execution time against uniform execution:

$$\text{Penalty Factor} = \frac{T_{\text{divergent}}}{T_{\text{uniform\_max}}} = \frac{200 \text{ cycles}}{100 \text{ cycles}} = \mathbf{2.00\times \text{ Execution Time Penalty}}$$

$$\text{Efficiency Loss} = 100\% - 26.875\% = \mathbf{73.125\% \text{ Hardware Capacity Loss}}$$

```text
DIVERGENT EXECUTION PENALTY SUMMARY

 Execution Scenario          │ Total Cycles │ Active Thread-Cycles │ SIMT Efficiency │ Time (ns)
─────────────────────────────┼──────────────┼──────────────────────┼─────────────────┼───────────
 Uniform Non-Divergent Path C│ 100 Cycles   │ 3,200 / 3,200        │     100.0%      │  50.0 ns
 Actual 3-Way Divergent Block│ 200 Cycles   │ 1,720 / 6,400        │      26.88%     │ 100.0 ns
                             │ (+100 Cycles)│ (4,680 Idle Cycles)  │ (-73.12% Loss)  │ (2.0x SLOWER!)
```

##### Engineering Conclusion:
3-way branch divergence forced the warp to execute $200\text{ clock cycles}$ ($100.0\text{ ns}$) instead of $100\text{ clock cycles}$, dropping SIMT hardware efficiency down to **$26.875\%$** and incurring a **$2.00\times$ execution time penalty ($100\%$ latency increase)**!

---

### Sanity Check and Verification

Let us verify our mathematical, masking, and efficiency results against SIMT microarchitecture principles:

1. **Active Mask Vector Verification**:
   * Path A: Threads 0..15 ($16\text{ threads}$) $\implies \text{32'h0000\_FFFF}$.
   * Path B: Threads 16..27 ($12\text{ threads}$) $\implies \text{32'h0FFF\_0000}$.
   * Path C: Threads 28..31 ($4\text{ threads}$) $\implies \text{32'hF000\_0000}$.
   * Sum of threads $= 16 + 12 + 4 = 32\text{ threads}$. Every thread belongs to exactly 1 path!
2. **Path Serialization Check**:
   * $T_{\text{divergent}} = 30 + 70 + 100 = 200\text{ cycles}$.
   * Time matches exact sequential sum of all 3 paths.
3. **Thread-Cycle Sum Check**:
   * Active thread-cycles $= (16 \times 30) + (12 \times 70) + (4 \times 100) = 480 + 840 + 400 = 1,720$.
   * Total available $= 32 \times 200 = 6,400$.
   * Efficiency $\eta = 1,720 / 6,400 = 26.875\%$. Math is $100\%$ exact.

All active thread mask bit vectors, register writeback gating rules, $K$-way path serialization sums, and SIMT efficiency metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Active Thread Mask ($M_{\text{active}}$)**: A 32-bit hardware bitmask register maintained by the Warp Scheduler that dynamically enables or gates execution lanes on every clock cycle, forcing register write-enable signals to zero ($\text{WE}_i = 0$), suppressing memory accesses, and discarding exceptions for inactive threads during divergent branch execution.
* **Divergent Execution Penalty ($\eta_{\text{SIMT}}$)**: The quantitative performance degradation ($\eta_{\text{SIMT}} = \frac{\sum N_{\text{active}} \cdot T_k}{W_{\text{size}} \cdot T_{\text{divergent}}}$) resulting from the sequential serialization of $K$ divergent branch paths within a warp, where disabled execution lanes sit idle during un-selected path passes.
