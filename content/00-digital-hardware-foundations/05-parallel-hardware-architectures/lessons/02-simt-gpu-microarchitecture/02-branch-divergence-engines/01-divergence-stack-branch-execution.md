content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/02-simt-gpu-microarchitecture/02-branch-divergence-engines/01-divergence-stack-branch-execution.md
# Branch Divergence Stack Architecture and Re-Convergence IP Point Mechanics

## The Branch Divergence Bottleneck and Warp Instruction Serialization

In high-performance Single Instruction, Multiple Threads (SIMT) GPU microarchitectures, parallel processing power is delivered by grouping scalar threads into fixed-size hardware execution bundles called **Warps** (typically 32 threads per warp). Inside a Streaming Multiprocessor (SM), all 32 threads in a warp share **a single Program Counter (PC)** and **a single instruction fetch/decode pipeline**. On every clock cycle, the hardware warp scheduler fetches one single instruction (such as an addition `ADD` or multiplication `MUL`) and broadcasts that instruction across 32 parallel execution lanes, executing the operation in lockstep across all 32 scalar threads simultaneously.

When a program executes purely linear arithmetic code, lockstep SIMT execution achieves $100\%$ hardware efficiency. All 32 parallel execution lanes compute results concurrently, and zero execution cycles are wasted.

However, real-world software algorithms are filled with conditional control-flow statements: `if-else` branches, `switch-case` blocks, conditional `while` loops, and early function returns:

```c
// CONDITIONAL BRANCHING INSIDE SIMT KERNEL CODE
if (thread_data[threadIdx.x] > 0.0f) {
    result[threadIdx.x] = compute_path_A(data); // IF-Path  (Branch Target A)
} else {
    result[threadIdx.x] = compute_path_B(data); // ELSE-Path (Branch Target B)
}
// RE-CONVERGENCE POINT: Both paths merge back together here!
```

Now, consider what occurs at the physical hardware level when a 32-thread warp executes this conditional `if-else` branch statement:

Suppose the condition `thread_data > 0.0f` evaluates to **TRUE for Threads 0 through 15**, but evaluates to **FALSE for Threads 16 through 31**.

The hardware execution engine encounters a severe physical control-flow contradiction:
* Threads 0 through 15 need the Program Counter to jump to the `if`-path instruction address ($\text{IP}_{\text{if}}$).
* Threads 16 through 31 need the Program Counter to jump to the `else`-path instruction address ($\text{IP}_{\text{else}}$).

Because all 32 threads in the warp share **a single physical Program Counter (PC)**, the GPU hardware cannot fetch instructions from two different memory addresses at the exact same physical nanosecond!

```text
THE BRANCH DIVERGENCE SERIALIZATION PENALTY

 Warp Execution Timeline (32 Threads Split 50/50 on IF-ELSE)
 ┌─────────────────────────────────────────────────────────────┐
 │ Phase 1: Execute IF-Path (Threads 0..15 Active, 16..31 Idle)│
 ├─────────────────────────────────────────────────────────────┤
 │ Phase 2: Execute ELSE-Path (Threads 16..31 Active, 0..15 Idle)│
 ├─────────────────────────────────────────────────────────────┤
 │ Phase 3: Re-Converge at IPDOM (All 32 Threads Active Again!)│
 └─────────────────────────────────────────────────────────────┘
  (Total execution time DOUBLED! SIMT efficiency dropped to 50%!)
```

To resolve this control-flow conflict, the GPU hardware experiences **Branch Divergence**.

When branch divergence occurs, the hardware is forced to **serialize the execution paths**:
1. **First Phase (`if`-path)**: The hardware sets the Program Counter to the `if`-path address ($\text{IP}_{\text{if}}$), enables execution lanes $0 \dots 15$, and disables execution lanes $16 \dots 31$. The warp executes the `if`-path instructions while 16 execution lanes sit completely idle.
2. **Second Phase (`else`-path)**: Once the `if`-path completes, the hardware switches the Program Counter to the `else`-path address ($\text{IP}_{\text{else}}$), disables execution lanes $0 \dots 15$, and enables execution lanes $16 \dots 31$. The warp executes the `else`-path instructions while 16 execution lanes sit idle.
3. **Third Phase (Re-Convergence)**: Once both divergent paths have completed, the hardware merges all 32 threads back together at the **Re-convergence IP Point** ($\text{IP}_{\text{re-converge}}$), restoring full 32-thread lockstep execution.

Look at the devastating performance penalty of branch divergence:
* Executing the conditional `if-else` block required executing **both paths sequentially**, doubling the instruction execution time!
* During both execution phases, half of the physical CUDA cores sat completely idle, cutting the warp's SIMT execution efficiency in half ($\eta_{\text{SIMT}} = 50\%$).
* If threads within a warp diverge across a 4-way `switch-case` statement, execution time quadruples, and SIMT efficiency collapses to $25\%$!

How does the GPU hardware track multiple divergent branch paths? 

How does the Warp Scheduler remember which threads belong to which branch path, which instruction address to execute next, and where the divergent paths merge back together without falling into infinite execution loops?

To manage divergent control flow automatically in hardware, GPU microarchitectures implement the **Branch Divergence Stack** and **Re-Convergence IP Point Mechanics**.

---

## The Tour Guide Clipboard and the Forked Trail: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of branch divergence stacks, re-convergence instruction pointers, and path serialization before inspecting gate-level hardware state machines, control flow graphs, and stack push/pop matrices, let us consider an everyday analogy: **The Tour Guide and the Forked Mountain Trail**.

Imagine a tour guide (**The GPU Warp Scheduler & Single Program Counter**) leading a group of **32 tourists** (**32 Threads in a Warp**) along a scenic hiking trail.

```text
THE TOUR GUIDE AND FORKED TRAIL METAPHOR

 Tour Guide with Loudspeaker (Warp Scheduler & Single PC)
 ┌─────────────────────────────────────────────────────────────┐
 │ Leads 32 Tourists in a tight group                          │
 │ Speaks through 1 Loudspeaker (Broadcasts 1 Instruction)    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
 Group 1 (16 Tourists: Want Museum)      Group 2 (16 Tourists: Want Park)
 ┌─────────────────────────────────┐     ┌─────────────────────────────────┐
 │ Active Mask: 0x0000FFFF         │     │ Active Mask: 0xFFFF0000         │
 └─────────────────────────────────┘     └─────────────────────────────────┘
```

All 32 tourists walk together in a tight group. The tour guide holds a single loudspeaker (**Instruction Broadcast Pipeline**). Every time the guide shouts an instruction into the loudspeaker (*"Take 10 steps forward!"*), all 32 tourists hear the instruction and take 10 steps forward together in perfect sync.

At 1:00 PM, the trail reaches a **Fork in the Road (A Conditional Branch)**:
* Trail A leads to a Historical Museum (**The `if`-path address $\text{IP}_{\text{if}}$**).
* Trail B leads to a Botanical Park (**The `else`-path address $\text{IP}_{\text{else}}$**).
* Both trails merge back together at the **Ice Cream Shop** (**The Re-Convergence IP Point $\text{IP}_{\text{re-converge}}$**) further down the mountain at 3:00 PM.

Tourists 0 through 15 want to visit the Museum. Tourists 16 through 31 want to visit the Park.

Because there is **only one tour guide with one loudspeaker**, the guide cannot walk down Trail A and Trail B at the exact same time!

Let us observe how the tour guide handles this divergent decision using a **Clipboard LIFO Stack (The Branch Divergence Stack)**:

---

### Step 1: Pushing the Stack Token at the Trail Fork (Branch Divergence)

The tour guide pulls out a clipboard equipped with a stack of paper forms (**The Branch Divergence Stack**).

Before taking a single step down Trail A, the guide writes a **Recovery Token** on a fresh sheet of paper and pins it to the top of the clipboard (**Push Stack Entry**):

```text
CLIPBOARD STACK TOKEN (PUSHED FOR TRAIL B / PARK)

 ┌─────────────────────────────────────────────────────────────┐
 │ Active Tourist Mask : Group 2 (Tourists 16..31)             │
 │ Target Trail Address: Trail B / Park (IP_else)              │
 │ Re-Convergence Spot: Ice Cream Shop (IP_re-converge)        │
 └─────────────────────────────────────────────────────────────┘
```

1. The guide tells Group 2 (Tourists 16..31): *"Sit on these park benches and wait for me. Do not move until I return!"* (**Disabled Lane Suppression**).
2. The guide leads Group 1 (Tourists 0..15) down **Trail A to the Museum** (**Executing the `if`-path**).

---

### Step 2: Reaching the Re-Convergence Point (Ice Cream Shop)

At 2:00 PM, the guide and Group 1 finish touring the Museum and arrive at the **Ice Cream Shop** ($\text{IP}_{\text{re-converge}}$).

Look at what the guide does upon reaching the Ice Cream Shop:
1. The guide stops Group 1 at the Ice Cream Shop and tells them: *"Sit here and enjoy your ice cream. Do not leave!"*
2. The guide checks the top sheet on their clipboard stack (**Inspects Top of Divergence Stack**).
3. The guide reads the token: *"Group 2 (Tourists 16..31) is waiting at the Trail Fork for Trail B / Park!"*
4. The guide **pops the sheet off the clipboard** (**Pops Divergence Stack**).
5. The guide walks back to the Trail Fork, picks up Group 2, and leads Group 2 down **Trail B to the Park** (**Executing the `else`-path**)!

```text
RE-CONVERGENCE POP AND SECOND PATH EXECUTION

 Guide reaches Ice Cream Shop with Group 1 ──► Checks Clipboard Stack!
                                              Pops Token for Group 2.
                                              │
                                              ▼
 Guide goes back and leads Group 2 down Trail B (Park) ──► Arrives at Ice Cream Shop!
```

---

### Step 3: Full Re-Convergence and Unified Execution Resume

At 3:00 PM, the guide and Group 2 finish the Park and arrive at the **Ice Cream Shop** ($\text{IP}_{\text{re-converge}}$).

Look at what happens now:
1. Group 2 meets Group 1 at the Ice Cream Shop.
2. The guide checks the clipboard stack: **The clipboard is completely empty!** (Zero pending divergent tokens remaining).
3. **FULL RE-CONVERGENCE ACHIEVED!**
4. All 32 tourists stand up together. The guide picks up the loudspeaker and shouts: *"Let us all continue down the main highway together!"*
5. All 32 tourists resume walking in unified 32-wide lockstep!

```text
FULL WARP RE-CONVERGENCE AT ICE CREAM SHOP

 Group 1 (Tourists 0..15) + Group 2 (Tourists 16..31) Re-United at Ice Cream Shop!
 Clipboard Stack is EMPTY ──► ALL 32 TOURISTS RESUME LOCKSTEP WALKING!
```

Notice what this tour guide clipboard system achieved:
* **Zero Lost Tourists**: Every tourist visited their chosen destination (Museum or Park) with $100\%$ correctness.
* **Deterministic Path Tracking**: The clipboard stack managed nested branches without getting lost or stuck in infinite loops.
* **Automatic Re-Convergence**: The moment both groups reached the Ice Cream Shop, 32-wide lockstep execution was restored automatically!

This tour guide clipboard system is the exact physical analogue of **Branch Divergence Stack Architecture and Re-Convergence IP Points**:
* The 32 tourists are **32 Parallel Threads in a Warp**.
* The tour guide's loudspeaker is **Instruction Fetch/Decode & Broadcast**.
* The trail fork is a **Conditional Branch Instruction (`vmsgt` + `bcnd`)**.
* Trail A (Museum) and Trail B (Park) are the **`if`-path ($\text{IP}_{\text{if}}$) and `else`-path ($\text{IP}_{\text{else}}$)**.
* The Ice Cream Shop is the **Re-Convergence IP Point ($\text{IP}_{\text{re-converge}}$ / Immediate Post-Dominator)**.
* The clipboard form is a **Divergence Stack Token Token Entry**.
* Tourists sitting on benches are **Disabled Hardware Lanes ($M[i] = 0$)**.

---

## Primitive 1: The Branch Divergence Stack

Now that we possess a clear intuitive mental model of the tour guide's clipboard stack, let us examine the formal, rigorous engineering mechanics of **The Branch Divergence Stack**.

> **A Branch Divergence Stack** (also known as a **SIMT Divergence Stack** or **Active Mask Stack**) is a specialized Last-In, First-Out (LIFO) hardware stack managed by a GPU's Warp Scheduler that stores execution state tokens for divergent branch paths, allowing the SIMT execution engine to serialize divergent `if-else` branches and restore unified 32-thread lockstep execution upon reaching re-convergence points.

```text
HARDWARE DIVERGENCE STACK REGISTER ENTRY ANATOMY

 Single Divergence Stack Token Entry (65 Bits)
 ┌─────────────────────────────┬────────────────────────┬─────────────────────────┐
 │ Active Thread Mask Vector   │ Target Next IP         │ Re-Convergence IP       │
 │ M_active (32 Bits)          │ IP_target (16 Bits)    │ IP_re-converge (16 Bits)│
 ├─────────────────────────────┼────────────────────────┼─────────────────────────┤
 │ Bits [64:33]                │ Bits [32:17]           │ Bits [16:0]             │
 └─────────────────────────────┴────────────────────────┴─────────────────────────┘
```

---

### Structure of a Hardware Divergence Stack Token Entry

Each entry pushed onto the hardware Divergence Stack is a multi-field control token containing three essential microarchitectural fields:

1. **Active Thread Mask Vector ($M_{\text{active}}$ — 32 Bits)**: A 32-bit binary bitmask where bit $i = 1$ indicates that Thread $i$ is enabled to execute instructions along this branch path, and bit $i = 0$ indicates that Thread $i$ is disabled.
2. **Target Next Instruction Pointer ($\text{IP}_{\text{target}}$ — 16 to 32 Bits)**: The memory address of the first instruction for this specific divergent execution path (e.g., the start address of the `else`-path $\text{IP}_{\text{else}}$).
3. **Re-Convergence Instruction Pointer ($\text{IP}_{\text{re-converge}}$ — 16 to 32 Bits)**: The memory address of the **Immediate Post-Dominator (IPDOM)** node in the Control Flow Graph where this divergent path merges back with other paths.

---

### The 4-Phase Divergence Stack State Machine

When a warp executes a conditional branch instruction that evaluates to different outcomes across threads, the Hardware Divergence Engine executes a 4-phase stack operation:

```text
DIVERGENCE STACK STATE TRANSITION FLOW

 Conditional Branch Instruction Executed (Branch Divergence Detected!)
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ PHASE 1: MASK EVALUATION & PATH SPLITTING                   │
 │ Calculate M_if (threads where Cond=TRUE) & M_else (Cond=FALSE)│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ PHASE 2: STACK PUSH (DEFER SECOND PATH)                     │
 │ Push Token onto Divergence Stack: (M_else, IP_else, IP_reconv)│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ PHASE 3: EXECUTE FIRST PATH (IF-PATH)                       │
 │ Set PC = IP_if, Set Active Mask = M_if. Run until PC==IP_reconv│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ PC reaches IP_re-converge!
 ┌─────────────────────────────────────────────────────────────┐
 │ PHASE 4: STACK POP & SECOND PATH EXECUTION                  │
 │ Pop Token off Divergence Stack!                             │
 │ Set PC = IP_else, Set Active Mask = M_else.                 │
 └─────────────────────────────────────────────────────────────┘
```

Let us trace each phase in detail:

#### Phase 1: Mask Evaluation & Path Splitting
1. The warp executes a vector comparison instruction (e.g., `vmsgt.vi v0, v1, 0`).
2. The hardware evaluates the condition across all 32 threads, generating the **`if`-path active mask ($M_{\text{if}}$)**:

$$M_{\text{if}}[i] = (V_1[i] > 0) \ \ ? \ \ 1 : 0 \quad \text{for } 0 \le i < 32$$

3. The hardware computes the inverted **`else`-path active mask ($M_{\text{else}}$)**:

$$M_{\text{else}}[i] = \overline{M_{\text{if}}[i]} \quad \mathbf{\text{AND}} \quad M_{\text{current}}[i]$$

4. If both $M_{\text{if}} \neq 0$ and $M_{\text{else}} \neq 0$, **Branch Divergence is Confirmed**!

#### Phase 2: Stack Push (Deferring the Second Path)
1. The hardware identifies the Re-Convergence IP Address ($\text{IP}_{\text{re-converge}}$) from the instruction metadata.
2. The hardware **pushes the deferred `else`-path token onto the top of the Divergence Stack**:

$$\mathbf{\text{PUSH} \ \left( \ M_{\text{else}}, \quad \text{IP}_{\text{else}}, \quad \text{IP}_{\text{re-converge}} \ \right)}$$

#### Phase 3: Executing the First Path (`if`-path)
1. The hardware sets the active execution mask to $M_{\text{if}}$.
2. The Program Counter is set to $\text{IP}_{\text{if}}$ ($PC \Leftarrow \text{IP}_{\text{if}}$).
3. The warp executes instructions along the `if`-path. Threads where $M_{\text{if}}[i] = 1$ execute operations; threads where $M_{\text{if}}[i] = 0$ are disabled.
4. The warp continues executing until the Program Counter reaches the Re-Convergence Point ($PC == \text{IP}_{\text{re-converge}}$).

#### Phase 4: Stack Pop & Second Path Execution (`else`-path)
1. When $PC == \text{IP}_{\text{re-converge}}$, the hardware pauses execution and inspects the Divergence Stack:
2. The top token is **popped off the stack**:

$$\mathbf{\left( \ M_{\text{popped}}, \quad \text{IP}_{\text{target}}, \quad \text{IP}_{\text{re-converge}} \ \right) \Leftarrow \text{POP()}}$$

3. If $\text{IP}_{\text{target}} \neq \text{IP}_{\text{re-converge}}$, the hardware sets:

$$PC \Leftarrow \text{IP}_{\text{target}} \quad (\text{IP}_{\text{else}}), \quad M_{\text{active}} \Leftarrow M_{\text{popped}} \quad (M_{\text{else}})$$

4. The warp executes the `else`-path for Threads $16 \dots 31$.
5. When $PC$ reaches $\text{IP}_{\text{re-converge}}$ a second time, the stack is popped again. 
6. Finding an empty stack (or a token matching the parent mask), the hardware restores $M_{\text{active}} = M_{\text{parent}}$ ($1111\dots1111_2$), and **all 32 threads resume unified lockstep execution!**

---

## Primitive 2: Re-Convergence IP Point (Immediate Post-Dominator / IPDOM)

Now let us examine the second core primitive: **The Re-Convergence IP Point**.

How does the compiler and GPU hardware know *which specific instruction address* should be designated as the Re-Convergence Point ($\text{IP}_{\text{re-converge}}$) for a conditional branch?

To determine the exact re-convergence address, compiler tools and GPU control engines apply a fundamental graph theory algorithm to the program's **Control Flow Graph (CFG)**: **Immediate Post-Dominator (IPDOM) Analysis**.

```text
CONTROL FLOW GRAPH (CFG) AND IMMEDIATE POST-DOMINATOR (IPDOM)

                  [ Block 0: Branch Condition (A[i] > 0) ]
                               │
               ┌───────────────┴───────────────┐
               │ Branch True                   │ Branch False
               ▼                               ▼
      [ Block 1: IF-Path ]            [ Block 2: ELSE-Path ]
      (Compute C[i] / A[i])           (Compute A[i] * 2)
               │                               │
               └───────────────┬───────────────┘
                               ▼
            [ Block 3: Re-Convergence Point (IPDOM) ]
            (Store Result B[i] = Result)
```

---

### The Formal Definition of Immediate Post-Dominator (IPDOM)

Let $G = (V, E, \text{Entry}, \text{Exit})$ be a directed Control Flow Graph representing a software program, where $V$ is the set of instruction basic blocks, and $E$ is the set of control-flow jump edges.

> **Definition of Post-Dominance**: A basic block node $D$ **post-dominates** a basic block node $B$ (written $D \ \text{pdom} \ B$) if every possible execution path from $B$ to the program $\text{Exit}$ node MUST pass through $D$.

> **Definition of Immediate Post-Dominator (IPDOM)**: The **Immediate Post-Dominator** of a conditional branch block $B$—denoted $\text{IPDOM}(B)$—is the unique post-dominator $D$ of $B$ such that $D \neq B$, and $D$ does not strictly post-dominate any other distinct post-dominator of $B$.

```text
IPDOM GRAPH THEOREM INVARIANT

 For any divergent branch split at Node B (IF / ELSE):
 IPDOM(B) is the VERY FIRST basic block where ALL divergent paths from B MUST MERGE
 before reaching the program exit!
```

#### Why IPDOM Is the Mathematically Optimal Re-Convergence Point:
1. **Guaranteed Reachability**: Because every execution path out of branch block $B$ must eventually pass through $\text{IPDOM}(B)$, both the `if`-path and the `else`-path are **guaranteed to reach $\text{IPDOM}(B)$**!
2. **Earliest Possible Re-Convergence**: $\text{IPDOM}(B)$ is the earliest possible instruction in the program where all threads can safely merge. Re-converging at $\text{IPDOM}(B)$ minimizes the number of cycles spent in serialized single-path mode, **maximizing SIMT hardware execution efficiency ($\eta_{\text{SIMT}}$)**!

---

## Nested Branch Divergence and Stack Memory Depth

Real-world software programs frequently contain **Nested Conditional Branches** (`if` inside `if`):

```c
// NESTED CONDITIONAL BRANCHES
if (A[i] > 0) {            // Outer Branch 1 (Splits Warp)
    if (B[i] > 10) {        // Inner Branch 2 (Splits Warp AGAIN!)
        C[i] = A[i] + B[i]; // Nested Path A
    } else {
        C[i] = A[i] - B[i]; // Nested Path B
    }
} else {
    C[i] = 0;              // Outer Else Path C
}
```

How does the hardware Divergence Stack handle nested branches without losing track of thread masks?

Because the Divergence Stack is a **Last-In, First-Out (LIFO) queue**, nested branches push new tokens onto the top of the stack, creating a nested hierarchy of execution contexts:

```text
NESTED DIVERGENCE STACK PUSH AND POP CHRONOLOGY

 Initial State: Stack Empty. Active Mask = 0xFFFFFFFF (All 32 Threads Active)

 1. Outer Branch 1 Executed (Splits 32 Threads: 16 TRUE, 16 FALSE):
    PUSH Token 1: (M_else_outer = 0xFFFF0000, IP_else_outer, IPDOM_outer)
    Active Mask <= M_if_outer (0x0000FFFF: Threads 0..15)

 2. Inner Branch 2 Executed on Threads 0..15 (Splits 16 Threads: 8 TRUE, 8 FALSE):
    PUSH Token 2: (M_else_inner = 0x0000FF00, IP_else_inner, IPDOM_inner)
    Active Mask <= M_if_inner (0x000000FF: Threads 0..7)

 3. Execution reaches IPDOM_inner:
    POP Token 2! Restores Mask = M_else_inner (Threads 8..15).
    Executes Inner Else Path.

 4. Execution reaches IPDOM_outer:
    POP Token 1! Restores Mask = M_else_outer (Threads 16..31).
    Executes Outer Else Path.

 5. Execution reaches IPDOM_outer End:
    Stack Empty! Restores Mask = 0xFFFFFFFF. ALL 32 THREADS RE-CONVERGED!
```

```text
DIVERGENCE STACK DEPTH DURING NESTED EXECUTION

 Stack Depth
   2 ┼                     ┌─────────────┐ (Token 2: Inner Branch)
     │                     │ Inner Else  │
   1 ┼       ┌─────────────┴─────────────┴─────────────┐ (Token 1: Outer Branch)
     │       │ Outer If Path                           │ Outer Else Path
   0 ┴───────┴─────────────────────────────────────────┴─────────────────► Time
     Base    Outer Branch 1  Inner Branch 2   Pop Token 2  Pop Token 1 (Full Re-conv)
```

Look at the LIFO stack operation:
* Inner Branch 2 pushes Token 2 on top of Token 1.
* Token 2 is popped first when the inner branch reaches $\text{IPDOM}_{\text{inner}}$.
* Token 1 is popped second when the outer branch reaches $\text{IPDOM}_{\text{outer}}$.
* **Stack LIFO property mathematically guarantees that nested branches re-converge in exact reverse order of their appearance!**

---

## SIMT Execution Efficiency Metric ($\eta_{\text{SIMT}}$)

To quantify the performance loss caused by branch divergence in a SIMT processor, computer architects calculate the **SIMT Execution Efficiency ($\eta_{\text{SIMT}}$)**.

Let $N_{\text{lanes}}$ be the physical number of execution lanes in a warp (typically $N_{\text{lanes}} = 32$).

Let $T_{\text{cycles}}$ be the total number of clock cycles required to execute a divergent code block.

Let $A(t)$ be the number of **active threads** ($M_{\text{active}}[i] == 1$) executing instructions on clock cycle $t$ ($1 \le t \le T_{\text{cycles}}$).

The **SIMT Execution Efficiency ($\eta_{\text{SIMT}}$)** is defined as:

$$\mathbf{\eta_{\text{SIMT}} = \frac{\sum_{t=1}^{T_{\text{cycles}}} A(t)}{N_{\text{lanes}} \times T_{\text{cycles}}} \times 100\%}$$

Where:
* $\eta_{\text{SIMT}}$ is the SIMT hardware utilization efficiency percentage ($0\% < \eta_{\text{SIMT}} \le 100\%$).
* $A(t)$ is the active thread count on cycle $t$ ($1 \le A(t) \le N_{\text{lanes}}$).
* $N_{\text{lanes}}$ is the warp size ($32$ threads).
* $T_{\text{cycles}}$ is the total clock cycles required to execute the block.

```text
SIMT EFFICIENCY SCENARIOS

 Scenario A: Zero Divergence (All 32 Threads Follow Same Path)
 A(t) = 32 for all t.
 Eta_SIMT = (32 * T) / (32 * T) = 100% (PERFECT EFFICIENCY!)

 Scenario B: 50/50 Divergence (16 Threads IF, 16 Threads ELSE)
 Phase 1 (IF)   : A(t) = 16 for T_if cycles.
 Phase 2 (ELSE) : A(t) = 16 for T_else cycles.
 Eta_SIMT = (16*T + 16*T) / (32 * 2T) = 32T / 64T = 50% (EFFICIENCY HALVED!)
```

#### Key Microarchitectural Takeaway:
When a warp diverges evenly ($50\%$ threads `if`, $50\%$ threads `else`), $\eta_{\text{SIMT}}$ drops to **$50\%$**. Half of the physical CUDA core ALUs on the silicon die sit completely idle during both branch execution phases, consuming static leakage power while doing zero productive work!

---

## Solved Industrial Engineering Exercise: Quantitative Branch Divergence Execution Trace, Stack Push-Pop State Machine, and Efficiency Loss

To consolidate your complete mastery of branch divergence stacks, active thread mask management, immediate post-dominators (IPDOM), and SIMT execution efficiency calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior GPU microarchitect auditing the branch divergence engine inside a $2.0\text{ GHz}$ Streaming Multiprocessor ($T_{\text{clk}} = 0.500\text{ ns} = 500\text{ ps}$).

The SM features a 32-thread hardware warp size ($N_{\text{lanes}} = 32$).

A warp containing 32 active threads ($M_{\text{initial}} = \text{32'hFFFF\_FFFF}$) executes a conditional kernel block containing nested branches:

```c
// CONTROL FLOW GRAPH BASIC BLOCKS AND INSTRUCTION ADDRESSES
Address 0x0040 [Block 0]: Condition 1 evaluated (A[i] > 10).
                          Splits Warp: Threads 0..23 TRUE (24 Threads),
                                       Threads 24..31 FALSE (8 Threads).
Address 0x0050 [Block 1]: IF-Path 1 Executed (4 Instructions, 4 Cycles).
Address 0x0060 [Block 2]: ELSE-Path 1 Executed (6 Instructions, 6 Cycles).
Address 0x0070 [Block 3]: Re-Convergence Point IPDOM 1 (3 Instructions, 3 Cycles).
                          All threads merge back together!
```

```text
2.0 GHz GPU STREAMING MULTIPROCESSOR DIVERGENCE ENGINE

 Clock Frequency        : 2.0 GHz (T_clk = 500 ps)
 Warp Size              : 32 Threads (Active Mask = 32 Bits)
 Divergence Stack Depth : 8 Hardware Token Entries
 Instruction Delay      : 1 Clock Cycle per Instruction (when active)
```

#### Your Objective

1. Identify the Immediate Post-Dominator Address ($\text{IPDOM}_1$) for Block 0.
2. Trace the step-by-step **Divergence Stack Push and Pop operations**, Active Thread Masks ($M_{\text{active}}$), Program Counter ($PC$), and executed instructions across time.
3. Calculate the total clock cycles ($T_{\text{cycles}}$) and total execution time (in nanoseconds) required to execute the entire block from Address `0x0040` through Block 3.
4. Calculate the **SIMT Execution Efficiency ($\eta_{\text{SIMT}}$)** for this divergent code block.
5. Calculate the performance loss (in percentage and clock cycles) compared to an ideal non-divergent execution where all 32 threads followed the same path.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Identify Immediate Post-Dominator Address ($\text{IPDOM}_1$)

* Block 0 (`0x0040`) evaluates the condition and splits into Block 1 (`0x0050`, `IF`-path) and Block 2 (`0x0060`, `ELSE`-path).
* Block 1 and Block 2 both jump to **Block 3 (`0x0070`)** upon completion.
* Every possible execution path from Block 0 to the end of the program MUST pass through Block 3 (`0x0070`).
* **$\text{IPDOM}_1 = \mathbf{\text{Address 0x0070}}$ (Block 3)**.

---

#### Step 2: Trace Divergence Stack Operations and Execution Timeline

Initial State at $t = 0$: $PC = \text{0x0040}$, $M_{\text{active}} = \text{32'hFFFF\_FFFF}$ (32 Active Threads). Stack is empty.

##### 1. Cycle 1 ($PC = \text{0x0040}$, Block 0 Condition Evaluation):
* Condition `A[i] > 10` evaluates:
  * Threads 0..23: **TRUE** (24 Threads) $\implies M_{\text{if}} = \text{32'h00FF\_FFFF}$.
  * Threads 24..31: **FALSE** (8 Threads) $\implies M_{\text{else}} = \text{32'hFF00\_0000}$.
* **Divergence Confirmed** ($M_{\text{if}} \neq 0$ and $M_{\text{else}} \neq 0$).
* **PUSH DIVERGENCE STACK TOKEN 1**:
  $$\text{PUSH } \left( \ M_{\text{else}} = \text{32'hFF00\_0000}, \quad \text{IP}_{\text{else}} = \text{0x0060}, \quad \text{IPDOM}_1 = \text{0x0070} \ \right)$$
* Set $PC \Leftarrow \text{0x0050}$ (`IF`-path), $M_{\text{active}} \Leftarrow M_{\text{if}} = \text{32'h00FF\_FFFF}$ (24 Active Threads).

##### 2. Cycles 2 to 5 ($PC = \text{0x0050}$, Block 1 `IF`-Path Execution):
* Block 1 contains 4 instructions.
* Executed during Cycles 2, 3, 4, 5 (4 clock cycles).
* Active threads $= 24$ ($M_{\text{active}} = \text{32'h00FF\_FFFF}$).
* At Cycle 5, Block 1 finishes. Next instruction address $PC = \mathbf{\text{0x0070} \ (\text{IPDOM}_1 \text{ Reached!})}$.

##### 3. Cycle 6 ($PC == \text{0x0070}$, Stack Pop Event!):
* $PC$ reached $\text{IPDOM}_1$ (`0x0070`). The hardware pauses execution and inspects the Divergence Stack:
* **POP DIVERGENCE STACK TOKEN 1**:
  $$\left( \ M_{\text{popped}} = \text{32'hFF00\_0000}, \quad \text{IP}_{\text{target}} = \text{0x0060}, \quad \text{IPDOM}_1 = \text{0x0070} \ \right) \Leftarrow \text{POP()}$$
* Since $\text{IP}_{\text{target}} (\text{0x0060}) \neq \text{IPDOM}_1 (\text{0x0070})$, set:
  $$PC \Leftarrow \text{0x0060} \quad (\text{ELSE-Path}), \quad M_{\text{active}} \Leftarrow \text{32'hFF00\_0000} \quad (8 \text{ Active Threads})$$

##### 4. Cycles 7 to 12 ($PC = \text{0x0060}$, Block 2 `ELSE`-Path Execution):
* Block 2 contains 6 instructions.
* Executed during Cycles 7, 8, 9, 10, 11, 12 (6 clock cycles).
* Active threads $= 8$ ($M_{\text{active}} = \text{32'hFF00\_0000}$).
* At Cycle 12, Block 2 finishes. Next instruction address $PC = \mathbf{\text{0x0070} \ (\text{IPDOM}_1 \text{ Reached Again!})}$.

##### 5. Cycle 13 ($PC == \text{0x0070}$, Re-Convergence Check):
* $PC$ reached $\text{IPDOM}_1$ (`0x0070`).
* Hardware inspects Divergence Stack: **STACK IS EMPTY!**
* **FULL WARP RE-CONVERGENCE ACHIEVED!**
* Active mask restored to full 32 threads: $M_{\text{active}} \Leftarrow \text{32'hFFFF\_FFFF}$.

##### 6. Cycles 13 to 15 ($PC = \text{0x0070}$, Block 3 Re-Converged Execution):
* Block 3 contains 3 instructions.
* Executed during Cycles 13, 14, 15 (3 clock cycles).
* Active threads $= 32$ ($M_{\text{active}} = \text{32'hFFFF\_FFFF}$).

```text
EXECUTION CHRONOLOGY & ACTIVE THREAD MASK SUMMARY

 Clock Cycle │ PC Address │ Basic Block │ Active Mask (Hex) │ Active Threads │ Stack Depth
─────────────┼────────────┼─────────────┼───────────────────┼────────────────┼─────────────
   Cycle 1   │   0x0040   │   Block 0   │    0xFFFFFFFF     │   32 Threads   │  0 (Push 1)
  Cycles 2..5│   0x0050   │   Block 1   │    0x00FFFFFF     │   24 Threads   │  1
   Cycle 6   │   0x0070   │   IPDOM Check│   0x00FFFFFF     │    - (Pop 1)   │  1 -> 0
  Cycles 7..12│  0x0060   │   Block 2   │    0xFF000000     │    8 Threads   │  0
  Cycles 13..15│ 0x0070   │   Block 3   │    0xFFFFFFFF     │   32 Threads   │  0 (Merged!)
```

---

#### Step 3: Calculate Total Completion Time

$$\text{Total Clock Cycles } T_{\text{cycles}} = 1 \text{ (Block 0)} + 4 \text{ (Block 1)} + 6 \text{ (Block 2)} + 3 \text{ (Block 3)} = \mathbf{14 \text{ Clock Cycles}}$$

$$\text{Total Execution Time } T_{\text{exec}} = 14 \text{ cycles} \times 0.500 \text{ ns/cycle} = \mathbf{7.000 \text{ nanoseconds}}$$

The entire divergent block completed in **14 clock cycles ($7.000\text{ ns}$)**.

---

#### Step 4: Calculate SIMT Execution Efficiency ($\eta_{\text{SIMT}}$)

We calculate the active thread-cycle sum $\sum A(t)$ across all 14 execution cycles:

* Cycle 1 (Block 0): $A(1) = 32\text{ threads}$.
* Cycles 2..5 (Block 1, 4 cycles): $A(t) = 24\text{ threads} \implies 4 \times 24 = 96\text{ thread-cycles}$.
* Cycles 6..11 (Block 2, 6 cycles): $A(t) = 8\text{ threads} \implies 6 \times 8 = 48\text{ thread-cycles}$.
* Cycles 12..14 (Block 3, 3 cycles): $A(t) = 32\text{ threads} \implies 3 \times 32 = 96\text{ thread-cycles}$.

$$\text{Total Active Thread-Cycles } \sum_{t=1}^{14} A(t) = 32 + 96 + 48 + 96 = \mathbf{272 \text{ Thread-Cycles}}$$

##### Total Maximum Possible Thread-Cycles (100% Efficiency):

$$\text{Max Possible Thread-Cycles} = N_{\text{lanes}} \times T_{\text{cycles}} = 32 \text{ lanes} \times 14 \text{ cycles} = \mathbf{448 \text{ Thread-Cycles}}$$

##### Calculate SIMT Execution Efficiency ($\eta_{\text{SIMT}}$):

$$\eta_{\text{SIMT}} = \frac{\sum A(t)}{N_{\text{lanes}} \times T_{\text{cycles}}} \times 100\% = \frac{272}{448} \times 100\% = \mathbf{60.71\% \text{ SIMT Efficiency}}$$

---

#### Step 5: Calculate Performance Loss Compared to Ideal Non-Divergent Execution

If all 32 threads had taken the same branch path (e.g., all 32 threads executed `IF`-path Block 1):

$$\text{Ideal Non-Divergent Cycles} = 1 \text{ (Block 0)} + 4 \text{ (Block 1)} + 3 \text{ (Block 3)} = \mathbf{8 \text{ Clock Cycles}}$$

$$\text{Performance Penalty Stalls} = 14 \text{ divergent cycles} - 8 \text{ ideal cycles} = \mathbf{6 \text{ Clock Cycles Lost}}$$

$$\text{Execution Time Penalty} = \frac{14 - 8}{8} \times 100\% = \mathbf{75.0\% \text{ Execution Delay Penalty!}}$$

```text
BRANCH DIVERGENCE PERFORMANCE SUMMARY

 Execution Mode         │ Total Cycles │ Active Thread-Cycles │ SIMT Efficiency │ Total Execution Time
────────────────────────┼──────────────┼──────────────────────┼─────────────────┼─────────────────────
 Ideal Non-Divergent    │ 8 Cycles     │ 256 / 256            │ 100.0%          │ 4.00 ns (Baseline)
 Divergent Execution    │ 14 Cycles    │ 272 / 448            │  60.7%          │ 7.00 ns
                        │ (+6 Cycles)  │ (176 Idle Lanes)     │ (-39.3% Loss)   │ (75.0% SLOWER!)
```

##### Engineering Conclusion:
Branch divergence caused the warp to execute $14\text{ cycles}$ instead of $8\text{ cycles}$, dropping SIMT hardware efficiency down to **$60.71\%$** and incurring a **$75.0\%$ execution time penalty** due to path serialization!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and stack state results against SIMT microarchitecture principles:

1. **LIFO Stack Order Check**:
   * Token 1 pushed at Block 0 stored `ELSE`-path address `0x0060`.
   * Executed `IF`-path (`0x0050`) first.
   * Reached $\text{IPDOM}_1$ (`0x0070`), popped Token 1, and correctly switched to `0x0060`.
   * LIFO stack push/pop order $100\%$ verified!
2. **Active Thread Conservation Check**:
   * Block 1 active threads ($24$) + Block 2 active threads ($8$) $= 32\text{ total threads}$.
   * Every thread in the warp executed exactly one of the two branch paths before re-converging at Block 3. Zero threads were lost or double-executed!
3. **Efficiency Sum Check**:
   * Active thread-cycles $= 32 + (4 \times 24) + (6 \times 8) + (3 \times 32) = 32 + 96 + 48 + 96 = 272$.
   * $\frac{272}{448} = 60.71\%$. Efficiency math is $100\%$ exact.

All control flow graph IPDOM addresses, LIFO divergence stack push/pop transitions, active thread mask bit vectors, and SIMT efficiency metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Branch Divergence Stack**: A Last-In, First-Out (LIFO) hardware control stack that stores execution state tokens (Active Mask $M_{\text{active}}$, Target IP, Re-convergence IPDOM) to serialize divergent `if-else` branch paths within a warp and restore 32-thread lockstep execution upon reaching re-convergence points.
* **Re-Convergence IP Point (Immediate Post-Dominator / IPDOM)**: The first instruction address in a program's Control Flow Graph (CFG) where all divergent paths originating from a conditional branch are mathematically guaranteed to merge, instructing the hardware divergence engine when to pop the stack and restore full active thread masks.
