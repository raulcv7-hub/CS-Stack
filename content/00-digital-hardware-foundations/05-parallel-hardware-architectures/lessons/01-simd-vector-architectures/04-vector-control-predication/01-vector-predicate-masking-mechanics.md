content/00-digital-hardware-foundations/05-parallel-hardware-architectures/lessons/01-simd-vector-architectures/04-vector-control-predication/01-vector-predicate-masking-mechanics.md
# Vector Predicate Masking Mechanics and Vector Lane Disabling

## The Conditional Branching Vectorization Wall and Lane Divergence Friction

In high-performance microprocessor design, SIMD (Single Instruction, Multiple Data) vector execution engines achieve massive arithmetic throughput by broadcasting a single instruction opcode across multiple parallel execution channels called **Vector Lanes**. During un-conditional, linear vector execution—such as adding two 512-bit vector registers containing sixteen 32-bit floating-point numbers ($V_C = V_A + V_B$)—every vector lane performs the exact same mathematical operation at the exact same physical nanosecond. All 16 lanes read their assigned inputs, execute additions in their local arithmetic logic units (ALUs), and write the results to their destination register slots.

However, real-world software algorithms are rarely purely linear. Algorithms are filled with conditional control flow decisions, such as `if-else` branches, threshold filters, boundary checks, and conditional assignments:

```c
// CONDITIONAL IF-ELSE ALGORITHM IN A LOOP
for (int i = 0; i < 16; i++) {
    if (A[i] > 0.0f) {
        B[i] = C[i] / A[i]; // IF-Path: Executed ONLY if A[i] > 0.0f
    } else {
        B[i] = 0.0f;        // ELSE-Path: Executed ONLY if A[i] <= 0.0f
    }
}
```

Now, consider what happens when a hardware engineer attempts to execute this conditional `if-else` loop on a 16-lane vector processor:

Suppose the input vector $V_A$ holds sixteen numbers where:
* Elements $0, 1, 4, 7, 10, 12, 15$ are positive numbers ($A[i] > 0.0\text{f}$).
* Elements $2, 3, 5, 6, 8, 9, 11, 13, 14$ are negative numbers or zero ($A[i] \le 0.0\text{f}$).

When the vector processor evaluates the conditional expression `A[i] > 0.0f` across all 16 vector lanes simultaneously, it encounters a profound hardware execution contradiction: **Lane Divergence**!

```text
THE VECTOR LANE DIVERGENCE CONTRADICTION

 16-Lane Vector Register VA Evaluated Against Condition: (VA[i] > 0.0f)
 ┌────────┬────────┬────────┬────────┬───┬────────┬────────┬────────┐
 │Lane 15 │Lane 14 │Lane 13 │Lane 12 │...│Lane 3  │Lane 2  │Lane 1  │Lane 0  │
 ├────────┼────────┼────────┼────────┼───┼────────┼────────┼────────┼────────┤
 │ +5.2f  │ -1.0f  │  0.0f  │ +3.1f  │...│ -4.5f  │  0.0f  │ +8.2f  │ +2.0f  │
 └───┬────┴───┬────┴───┬────┴───┬────┴───┴───┬────┴───┬────┴───┬────┴───┬────┘
     │        │        │        │            │        │        │        │
     ▼        ▼        ▼        ▼            ▼        ▼        ▼        ▼
   TRUE     FALSE    FALSE    TRUE         FALSE    FALSE    TRUE     TRUE
 (IF-Path) (ELSE)   (ELSE)  (IF-Path)     (ELSE)   (ELSE)  (IF-Path)(IF-Path)
```

Look at the physical execution contradiction:
* Lanes 0, 1, 12, and 15 evaluate the condition as **TRUE** (and need to execute the division `C[i] / A[i]`).
* Lanes 2, 3, 5, 6, 8, 9, 11, 13, and 14 evaluate the condition as **FALSE** (and need to assign `0.0f`).

A single-instruction vector engine cannot branch to two different instruction memory addresses at the same time! 

If the hardware attempts to solve this problem by falling back to scalar execution (processing the 16 elements one-by-one using scalar conditional branches), execution throughput collapses completely, taking 16 to 32 instruction cycles instead of 1.

Conversely, if the hardware blindly executes the division `C[i] / A[i]` across **all 16 lanes** simultaneously without conditional protection:
1. Lanes 2 and 6 (where $A[i] = 0.0\text{f}$) will execute $C[i] / 0.0\text{f}$, triggering an illegal **Division-by-Zero Exception (`DZ`)** that stalls the pipeline or crashes the program!
2. Lanes 3 and 5 (where $A[i] < 0.0\text{f}$) will overwrite $B[i]$ with incorrect division results, corrupting memory state!

We are trapped in an architectural dilemma:
* Falling back to scalar conditional branches takes dozens of instruction cycles, ruining vector processing speed.
* Executing the `if`-path across all vector lanes unconditionally triggers illegal memory faults and corrupts destination registers for lanes where the condition was false.

To solve this conditional execution crisis, vector computer architectures replace control-flow branching with **Predicated Execution** using **Vector Predicate Masking** and **Lane Disabling Mechanics**.

---

## The Spray-Paint Stencil Template: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of vector predicate masking, lane disabling, and mask-undisturbed vs. zeroing predication policies before inspecting gate-level AND-gate masking networks and assembly instruction formats, let us consider an everyday analogy: **The Industrial T-Shirt Spray-Painting Factory**.

Imagine an automated factory conveyor belt (**A 16-Lane Vector Execution Unit**) processing 16 T-shirts (**16 Vector Data Elements: Shirt 0 through Shirt 15**) in a single row.

```text
THE T-SHIRT SPRAY-PAINTING FACTORY METAPHOR

 Conveyor Belt (16 Vector Lanes: Shirt 0 to Shirt 15)
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │Shirt │Shirt │Shirt │Shirt │...│Shirt │Shirt │Shirt │Shirt │
 │  15  │  14  │  13  │  12  │   │  3   │  2   │  1   │  0   │
 └──────┴──────┴──────┴──────┴───┴──────┴──────┴──────┴──────┘
```

The factory manager wants to spray-paint a red logo (**Execute a Vector Operation**) onto specific shirts. However, some shirts are defective or already printed, so the manager wants to paint **ONLY the shirts that pass a quality inspection condition** (e.g., Shirts 0, 1, 12, and 15).

Let us observe two different operational strategies for how the factory paints these shirts:

---

### Strategy 1: The Manual Stop-and-Paint Method (Scalar Branching Fallback)
The factory manager stops the conveyor belt, walks up to Shirt 0, inspects it, paints it, walks to Shirt 1, inspects it, paints it, walks to Shirt 2, sees it's defective, skips it...

Look at the inefficiency of Strategy 1:
* The automated factory conveyor belt is turned OFF.
* The manager inspects and paints 16 shirts **one-by-one by hand**!
* Painting 16 shirts takes **16 minutes** instead of 1 second!

---

### Strategy 2: The Plastic Stencil Template Method (Vector Predicate Masking)
To paint the shirts in a single automated second without stopping the conveyor belt, the factory manager uses a **Plastic Stencil Template (A Vector Predicate Mask $V_{\text{mask}}$)**:

The manager places a 16-slot plastic stencil sheet directly over the row of 16 shirts:
* For shirts that passed inspection (Shirts 0, 1, 12, 15), the stencil has **OPEN HOLES (Bit = 1, Enabled)**.
* For shirts that failed inspection (Shirts 2, 3, 5, 6, 8, 9, 11, 13, 14), the stencil has **SOLID PLASTIC SHIELDS (Bit = 0, Disabled)**.

```text
THE STENCIL TEMPLATE (PREDICATE MASK V_mask = 1100010010011011)

 Stencil Template (Vector Predicate Mask V_mask)
 ┌──────┬──────┬──────┬──────┬───┬──────┬──────┬──────┬──────┐
 │ OPEN │SOLID │SOLID │ OPEN │...│SOLID │SOLID │ OPEN │ OPEN │
 │ (1)  │ (0)  │ (0)  │ (1)  │   │ (0)  │ (0)  │ (1)  │ (1)  │
 └──┬───┴──┬───┴──┬───┴──┬───┴───┴──┬───┴──┬───┴──┬───┴──┬───┘
    │      │      │      │          │      │      │      │
    ▼      ▼      ▼      ▼          ▼      ▼      ▼      ▼
  PAINT  BLOCKED BLOCKED PAINT    BLOCKED BLOCKED PAINT  PAINT
```

Now, trace how Strategy 2 paints the shirts:
1. The manager fires **ONE SINGLE OVERHEAD SPRAY-PAINT CANNON** (**One Vector Instruction**) across the entire row of 16 shirts simultaneously!
2. Over Shirts 0, 1, 12, and 15, the paint passes cleanly through the open holes, painting the red logo onto those shirts (**Enabled Lane Execution**).
3. Over Shirts 2, 3, 5, 6, 8, 9, 11, 13, and 14, the paint hits the solid plastic shield and is **BLOCKED completely**! Zero paint touches those shirts (**Disabled Lane Suppression**).
4. All 16 shirts are processed in **1 single second**!

---

### What Happens to the Blocked Shirts? (Mask Policies)

Notice a crucial detail: What should happen to the shirts where the stencil blocked the paint ($Bit = 0$)?

The manager can choose between two **Mask Policies**:

#### Policy A: Preserve Original Shirt Color (Mask-Undisturbed / Merging Predication)
If a shirt was originally blue, and the stencil blocked the red paint, **the shirt remains blue**! It retains its original background color ($V_D[i] \Leftarrow V_D[i]$). 

This is essential for `if-else` branches, allowing the `if`-path to paint some slots and the `else`-path to paint the remaining slots on the exact same shirts!

#### Policy B: Bleach to Pure White (Mask-Agnostic / Zeroing Predication)
If the stencil blocked the paint, the machine automatically bleaches those blocked slots to pure white ($V_D[i] \Leftarrow 0$). 

This is useful for clearing inactive data slots before adding numbers together!

This spray-paint factory is the exact physical analogue of **Vector Predicate Masking and Lane Disabling**:
* The 16 T-shirts are **16 Vector Register Elements ($V[0 \dots 15]$)**.
* Quality inspection (`A[i] > 0.0f`) is a **Vector Comparison Instruction (`vmsgt`)**.
* The plastic stencil template is the **Vector Predicate Mask Register ($V_{\text{mask}}$ / `v0`)**.
* Open holes ($1$) and solid plastic ($0$) are **Mask Bits ($M[i] = 1$ vs $M[i] = 0$)**.
* Firing the overhead spray cannon is a **Predicated Vector Instruction (`vdiv.vv vB, vC, vA, v0.t`)**.
* Blocking paint over solid plastic is **Hardware Lane Disabling and Write-Back Suppression**.
* Preserving original shirt color is **Mask-Undisturbed (Merging) Predication**.
* Bleaching blocked slots to white is **Zeroing Predication**.

---

## Primitive 1: Vector Predicate Mask Registers ($V_{\text{mask}}$ / `v0`)

Now that we possess a clear intuitive mental model of the plastic stencil template, let us examine the formal, rigorous engineering mechanics of **Vector Predicate Mask Registers**.

In a vector processor, a **Vector Predicate Mask Register** (designated in RISC-V Vector as `v0` or in ARM SVE as predicate registers `p0`..`p15`) is a specialized vector control register where each individual bit position $i$ ($0 \le i < \text{VLMAX}$) stores a 1-bit boolean flag ($0$ or $1$) that controls whether vector lane $i$ is enabled or disabled during instruction execution.

```text
VECTOR PREDICATE MASK REGISTER METADATA LAYOUT

 Vector Predicate Mask Register v0 (1 Bit per Vector Element)
 ┌────┬────┬────┬────┬───┬────┬────┬────┬────┐
 │M15 │M14 │M13 │M12 │...│ M3 │ M2 │ M1 │ M0 │ (16 Bits for 16 Vector Lanes)
 └─┬──┴─┬──┴─┬──┴─┬──┴───┴─┬──┴─┬──┴─┬──┴─┬──┘
   │    │    │    │        │    │    │    │
   ▼    ▼    ▼    ▼        ▼    ▼    ▼    ▼
 Lane15 14   13   12       3    2    1   Lane0 Enable Signals
```

---

### Step 1: Generating Predicate Masks via Vector Comparison Instructions

How does a vector processor create a predicate mask in hardware?

Predicate masks are generated by executing **Vector Comparison Instructions** (such as `vmseq` - equal, `vmsne` - not equal, `vmslt` - less than, or `vmsgt` - greater than).

A vector comparison instruction evaluates a boolean condition across all active elements of source vector registers $V_A$ and $V_B$ in parallel, and writes the resulting 1-bit boolean flags directly into the predicate mask register `v0`:

$$\mathbf{v0[i] = (V_A[i] \quad \mathbf{\text{op}} \quad V_B[i]) \ \ ? \ \ 1 \ : \ 0 \quad \text{for } 0 \le i < vl}$$

Where:
* $v0[i]$ is bit $i$ of the vector predicate mask register `v0`.
* $V_A[i]$ and $V_B[i]$ are the data elements at position $i$ in source vector registers $V_A$ and $V_B$.
* $\mathbf{\text{op}}$ is the comparison operator ($==, \neq, <, \le, >, \ge$).
* $vl$ is the active vector length register ($0 \le i < vl$).

```text
VECTOR COMPARISON GENERATING A PREDICATE MASK IN v0

 Source VA : [ +5.2f │ -1.0f │  0.0f │ +3.1f │ ... │ -4.5f │  0.0f │ +8.2f │ +2.0f ]
 Condition : (VA[i] > 0.0f)
             ───────────────────────────────────────────────────────────────────────
 Mask v0   : [   1   │   0   │   0   │   1   │ ... │   0   │   0   │   1   │   1   ]
```

Notice the compactness of the predicate mask:
For a 512-bit vector register holding sixteen 32-bit floats, the generated predicate mask requires **only 16 bits of storage inside `v0`** ($1\text{ bit per 32-bit element}$).

---

### Step 2: Attaching Predicate Masks to Vector Instructions

Once the predicate mask `v0` is generated, subsequent vector instructions attach the mask using vector assembly syntax (e.g., `vdiv.vv vB, vC, vA, v0.t` in RISC-V or `fdiv zB.s, p0/m, zC.s, zA.s` in ARM SVE).

The suffix `.t` indicates **Mask-Enabled Predication** (execute operation only where mask bit $v0[i] == 1$).

---

## Primitive 2: Lane Disabling Mechanics and Mask Policies

Now let us examine the second core primitive: **Hardware Lane Disabling Mechanics** and the two fundamental **Mask Policies** (Mask-Undisturbed vs. Zeroing Predication).

When a predicated vector instruction (`vdiv.vv vB, vC, vA, v0.t`) arrives at the vector execution pipeline, the hardware controller evaluates mask bit $v0[i]$ for every lane $i$:

```text
VECTOR LANE DISABLING DATAPATH (LANE I)

 Vector Operation Control (Opcode: VDIV, Source Inputs: VC[i], VA[i])
                     │
         Is Predicate Mask Bit v0[i] == 1? (Lane i Enabled?)
                     │
           ┌─────────┴─────────┐
           │ YES (v0[i] == 1)  │ NO (v0[i] == 0 - Lane Disabled!)
           ▼                   ▼
    EXECUTE OPERATION!  DISABLE LANE EXECUTION!
    Compute VC[i] / VA[i] 1. Suppress Floating-Point Exceptions (No DZ/NV traps!).
    Write result to VB[i] 2. Gate ALU Clock Tree (Zero Dynamic Switching Power!).
                        3. Apply Mask Policy to Destination VB[i]:
                           - Merging (v0.t) : Retain Old VB[i] Value!
                           - Zeroing (v0.m) : Write 0 to VB[i]!
```

---

### Hardware Actions in a Disabled Vector Lane ($v0[i] == 0$)

When mask bit $v0[i] = 0$ (Lane $i$ is disabled), the vector hardware executes three automatic protection actions inside Lane $i$:

1. **Exception Suppression**:
   Even if $V_A[i] = 0.0\text{f}$ (which would normally trigger a Division-by-Zero exception $C[i] / 0.0\text{f}$), **the hardware floating-point exception unit inside Lane $i$ is completely disabled**! 
   
   Zero exception flags ($\text{DZ}, \text{NV}, \text{OF}$) are set in the Vector FCSR, and zero software traps are fired.
2. **Clock Tree Gating ($0\text{ Dynamic Power}$)**:
   The master clock signal to Lane $i$'s ALU is disconnected by a clock-gating AND gate. Transistors in Lane $i$ do not switch states, reducing Lane $i$'s dynamic power consumption to zero!
3. **Destination Register Write-Back Control**:
   The output multiplexer at the write-back stage of Lane $i$ executes one of two **Mask Policies** specified by the instruction opcode:
   * **Policy 1: Mask-Undisturbed (Merging Predication — `v0.t`)**
   * **Policy 2: Mask-Agnostic / Zeroing Predication (`v0.m`)**

---

### Policy 1: Mask-Undisturbed (Merging Predication — `v0.t`)

Under **Mask-Undisturbed Predication** (specified by suffix `v0.t`), if mask bit $v0[i] == 0$, the destination register slot $V_D[i]$ **retains its previous, un-modified value**:

$$\mathbf{V_D[i] = \begin{cases} \text{Operation}(V_A[i], \, V_B[i]) & \text{if } v0[i] == 1 \\ V_D[i]_{\text{old}} & \text{if } v0[i] == 0 \quad (\text{Retain Old Value!}) \end{cases}}$$

Where:
* $V_D[i]$ is element $i$ of the destination vector register.
* $V_D[i]_{\text{old}}$ is the value stored in $V_D[i]$ *before* the instruction executed.
* $v0[i]$ is bit $i$ of the predicate mask register.

```text
MERGING PREDICATION (MASK-UNDISTURBED) IN ACTION

 Destination Register VB Before Instruction : [ 99.0f │ 99.0f │ 99.0f │ 99.0f ]
 Instruction Executed                      : vdiv.vv vB, vC, vA, v0.t
 Predicate Mask v0                         : [   1   │   0   │   1   │   0   ]
                                             ─────────────────────────
 Destination Register VB After Instruction  : [  2.5f │ 99.0f │  4.0f │ 99.0f ]
                                                         ▲               ▲
                                                         └─ UN-DISTURBED! (Retained 99.0f!)
```

#### Why Merging Predication Is Essential for `if-else` Vectorization:
Merging predication allows compilers to vectorize conditional `if-else` blocks cleanly without temporary scratchpad registers! 

The `if`-path updates $V_D[i]$ where $v0[i] = 1$ while leaving $v0[i] = 0$ slots undisturbed. The `else`-path then updates $V_D[i]$ under inverted mask $\sim v0$ where $v0[i] = 0$, merging both execution branches into a single destination register seamlessly!

---

### Policy 2: Mask-Agnostic / Zeroing Predication (`v0.m` / Zero-Masking)

Under **Zeroing Predication** (specified by suffix `v0.m`), if mask bit $v0[i] == 0$, the destination register slot $V_D[i]$ is **explicitly overwritten with Zeros ($0$)**:

$$\mathbf{V_D[i] = \begin{cases} \text{Operation}(V_A[i], \, V_B[i]) & \text{if } v0[i] == 1 \\ 0 & \text{if } v0[i] == 0 \quad (\text{Force Zero!}) \end{cases}}$$

```text
ZEROING PREDICATION (MASK-ZEROING) IN ACTION

 Destination Register VB Before Instruction : [ 99.0f │ 99.0f │ 99.0f │ 99.0f ]
 Instruction Executed                      : vdiv.vv vB, vC, vA, v0.m
 Predicate Mask v0                         : [   1   │   0   │   1   │   0   ]
                                             ─────────────────────────
 Destination Register VB After Instruction  : [  2.5f │  0.0f │  4.0f │  0.0f ]
                                                         ▲               ▲
                                                         └─ ZEROED OUT! (Forced to 0.0f!)
```

#### Why Zeroing Predication Is Essential:
1. **Eliminating Register Read Dependencies**: Merging predication (`v0.t`) requires the hardware to read the old value of destination register $V_D$ as an extra input operand (creating an artificial data dependency on $V_D$). Zeroing predication (`v0.m`) does not read old $V_D$, eliminating data dependency stalls in out-of-order execution pipelines!
2. **Preparing Vectors for Horizontal Reductions**: Before summing vector elements, zeroing out inactive lanes ensures that disabled elements ($0.0$) pass through the horizontal addition tree without corrupting the final scalar sum.

---

## Canonical `if-else` Branch Elimination Algorithm

To see how vector predicate masking and lane disabling completely eliminate conditional branch instructions in software, let us examine the canonical assembly transformation for a conditional `if-else` loop.

Consider the C high-level loop:

```c
// C CONDITIONAL IF-ELSE LOOP
void conditional_process(float *A, float *B, float *C, size_t N) {
    for (size_t i = 0; i < N; i++) {
        if (A[i] > 0.0f) {
            B[i] = C[i] / A[i]; // IF-Path
        } else {
            B[i] = A[i] * 2.0f; // ELSE-Path
        }
    }
}
```

Here is the complete **RISC-V Vector Assembly Implementation** using vector predicate masking and merging predication:

```assembly
# RISC-V VECTOR ASSEMBLY (100% BRANCHLESS IF-ELSE VECTORIZATION)
# Inputs: a0 = A ptr, a1 = B ptr, a2 = C ptr, a3 = N (AVL)

loop_start:
    vsetvli t0, a3, e32, m1   # 1. Set active vector length 'vl' for 32-bit floats

    vle32.v  v1, (a0)         # 2. Vector Load: v1 = A[0..vl-1]
    vle32.v  v2, (a2)         # 3. Vector Load: v2 = C[0..vl-1]

    # --- EVALUATE IF CONDITION (A[i] > 0.0f) ---
    vfgt.vf  v0, v1, fa0      # 4. Vector Float Greater-Than: v0[i] = (v1[i] > 0.0f)
                              #    Generates Predicate Mask in v0!

    # --- EXECUTE IF-PATH (WHERE v0[i] == 1) ---
    vfdiv.vv v3, v2, v1, v0.t # 5. Predicated Div: v3[i] = C[i] / A[i] WHERE v0[i] == 1
                              #    Un-selected v3[i] slots remain undisturbed!

    # --- EXECUTE ELSE-PATH (WHERE v0[i] == 0) ---
    vnot.m   v4, v0           # 6. Invert Mask: v4[i] = NOT v0[i] (v4[i] = 1 where A[i] <= 0)
    vfmul.vf v3, v1, fa1, v4.t# 7. Predicated Mul: v3[i] = A[i] * 2.0f WHERE v4[i] == 1
                              #    Merges ELSE-path results into SAME v3 register!

    # --- WRITE BACK MERGED RESULT ---
    vse32.v  v3, (a1)         # 8. Vector Store: Write merged v3 to B[0..vl-1]

    sub      a3, a3, t0       # 9. Decrement remaining AVL: a3 = a3 - vl
    slli     t1, t0, 2        # 10. Compute byte offset: t1 = vl * 4 bytes
    add      a0, a0, t1       # 11. Advance pointers a0, a1, a2
    add      a1, a1, t1
    add      a2, a2, t1
    bnez     a3, loop_start   # 12. Repeat loop if remaining AVL > 0
    ret
```

```text
BRANCHLESS IF-ELSE EXECUTION TIMELINE IN HARDWARE

 1. Load V1 (A) and V2 (C)
 2. vfgt.vf v0, v1, fa0  ──► v0 = [ 1 │ 0 │ 0 │ 1 │ 0 │ 1 │ 1 │ 0 ] (Condition Mask)
                             │
 3. vfdiv.vv v3, v2, v1, v0.t (IF-Path)
    v3 = [ C0/A0 │ --- │ --- │ C3/A3 │ --- │ C5/A5 │ C6/A6 │ --- ]
                             │
 4. vnot.m v4, v0        ──► v4 = [ 0 │ 1 │ 1 │ 0 │ 1 │ 0 │ 0 │ 1 ] (Inverted Mask)
                             │
 5. vfmul.vf v3, v1, fa1, v4.t (ELSE-Path)
    v3 = [ C0/A0 │ A1*2│ A2*2│ C3/A3 │ A4*2│ C5/A5 │ C6/A6 │ A7*2]
           ▲                             ▲
           └──────── MERGED CLEANLY INTO V3 REGISTER! ────────┘
```

Look at the extraordinary hardware execution result:
* **ZERO Branch Instructions inside the Loop**: The conditional `if-else` control flow was completely converted into linear, branchless data-flow instructions (**If-Conversion / Predication**)!
* **Zero Branch Mispredictions**: The CPU pipeline never suffers branch misprediction stalls.
* **$100\%$ Execution Safety**: Lanes where $A[i] \le 0.0\text{f}$ were disabled during `vfdiv.vv`, completely suppressing division-by-zero exceptions!

---

## Solved Industrial Engineering Exercise: Quantitative Conditional IF-ELSE Vectorization, Mask Policy Analysis, and Pipeline Throughput

To consolidate your complete mastery of vector predicate masking, comparison mask generation, merging vs zeroing mask policies, and branchless `if-else` vectorization, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior vector microarchitect auditing a $3.2\text{ GHz}$ 64-bit RISC-V vector processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor pipeline has a base execution rate of $\text{CPI}_{\text{base}} = 1.0\text{ cycle/instruction}$ for scalar code and single-cycle execution for vector instructions.

The processor executes a conditional threshold filtering kernel over an array of **$1,000\text{ single-precision 32-bit floating-point elements}$** ($N = 1,000, \text{SEW} = 32\text{ bits}$):

```c
// CONDITIONAL THRESHOLD FILTER KERNEL
for (int i = 0; i < 1000; i++) {
    if (A[i] >= 10.0f) {
        B[i] = A[i] - 10.0f; // IF-Path
    } else {
        B[i] = A[i] + 5.0f;  # ELSE-Path
    }
}
```

```text
3.2 GHz RISC-V VECTOR PROCESSOR SUBSYSTEM

 Hardware Vector Register Width : VLEN = 512 Bits (16 x 32-Bit Floats per Instruction)
 Clock Frequency                : 3.2 GHz (T_clk = 312.5 ps)
 Scalar Branch Mispredict Delay : 15 Clock Cycles per Misprediction
```

#### Hardware & Workload Profile:
* Physical Vector Register Width: $\text{VLEN} = 512\text{ bits}$ ($\text{VLMAX} = 16\text{ elements}$ for 32-bit floats, $\text{LMUL} = 1$).
* Array Size: $N = 1,000\text{ elements}$.
* Data Distribution: The condition `A[i] >= 10.0f` evaluates to **TRUE for $50\%$ of elements** and **FALSE for $50\%$ of elements**, arranged randomly throughout the array.

#### Your Objective

1. Calculate the total execution time (in microseconds) and effective CPI for a **Scalar CPU Execution Loop** with branch prediction:
   * Assume scalar loop has 6 instructions per element, and random $50\%$ branch behavior causes a branch misprediction penalty ($15\text{ cycles}$) on $25\%$ of iterations.
2. Calculate the total execution time (in microseconds) and effective CPI for the **Predicated Vector Assembly Loop** using `v0.t` merging predication.
3. Evaluate a **Mask Policy Comparison**: Show the exact hexadecimal register contents of destination vector $v3$ after executing the `IF`-path under:
   * **Policy A**: Mask-Undisturbed / Merging Predication (`v0.t`), where $v3$ initially held `16 x 99.0f` (`32'h42C60000`).
   * **Policy B**: Zeroing Predication (`v0.m`).
   
   For input vector $v1 = [\ 12.0, \ 4.0, \ 15.0, \ 2.0\ ]$ (4 elements for simplicity).
4. Calculate the overall **Performance Speedup Factor** of Predicated Vector Execution over the Scalar Execution Loop.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Analyze Scalar Execution Loop (Baseline)

Array size $N = 1,000\text{ elements}$.

##### 1. Instruction Count per Scalar Iteration:
* 1 Load (`FLW`), 1 Compare/Branch (`FCMP` + `BNE`), 1 Arithmetic (`FSUB` or `FADD`), 1 Store (`FSW`), 1 Loop Counter (`ADDI`), 1 Loop Branch (`BNE`) $= \mathbf{6 \text{ instructions/element}}$.
* Total Instructions = $1,000 \times 6 = \mathbf{6,000 \text{ instructions}}$.

##### 2. Calculate Branch Misprediction Penalty:
Random $50\%$ data distribution causes branch mispredictions on $25\%$ of scalar loop iterations ($1,000 \times 0.25 = 250\text{ mispredictions}$).
* Each branch misprediction stalls the pipeline for $15\text{ clock cycles}$.
* Total Misprediction Stall Cycles = $250 \times 15 = \mathbf{3,750 \text{ stall cycles}}$.

##### 3. Calculate Total Scalar Execution Time ($T_{\text{scalar}}$):

$$\text{Total Scalar Cycles} = 6,000 \text{ exec cycles} + 3,750 \text{ mispredict stalls} = \mathbf{9,750 \text{ clock cycles}}$$

$$\text{CPI}_{\text{scalar}} = \frac{9,750\text{ cycles}}{6,000\text{ instructions}} = \mathbf{1.625 \text{ cycles/instruction}}$$

$$T_{\text{scalar}} = 9,750 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0030469 \text{ milliseconds}} \quad (3.047\text{ }\mu\text{s})$$

Scalar execution requires **$9,750\text{ clock cycles}$ ($3.047\text{ }\mu\text{s}$)**.

---

#### Step 2: Analyze Predicated Vector Assembly Loop Execution

$\text{VLEN} = 512\text{ bits} \implies \text{VLMAX} = 16\text{ elements}$.

##### 1. Calculate Vector Loop Iterations:
$$N_{\text{iterations}} = \left\lceil \frac{1,000}{16} \right\rceil = 62.5 \implies \mathbf{63 \text{ Vector Iterations}}$$

* Iterations 1 through 62 process $62 \times 16 = 992\text{ elements}$ ($vl = 16$).
* Iteration 63 processes remaining $8\text{ elements}$ ($vl = 8$).

##### 2. Instruction Count per Vector Iteration:
Looking at our branchless vector assembly code:
1 `vsetvli`, 1 Load `A`, 1 Compare `vfge.vf v0`, 1 Predicated Sub `vfsub.vf v3, v1, fa0, v0.t` (`IF`-path), 1 Invert Mask `vnot.m v4, v0`, 1 Predicated Add `vfadd.vf v3, v1, fa1, v4.t` (`ELSE`-path), 1 Store `B`, 3 Pointer Increments, 1 Decrement AVL, 1 Branch $= \mathbf{13 \text{ instructions/iteration}}$.

* Total Vector Instructions = $63 \text{ iterations} \times 13 \text{ inst/iter} = \mathbf{819 \text{ instructions}}$.
* **Branch Mispredictions**: Branchless vector execution suffers **ZERO branch mispredictions** inside the loop!

##### 3. Calculate Total Vector Execution Time ($T_{\text{vector}}$):

$$\text{Total Vector Cycles} = 819 \text{ instructions} \times 1.0 \text{ cycle/inst} = \mathbf{819 \text{ clock cycles}}$$

$$\text{CPI}_{\text{vector}} = \mathbf{1.00 \text{ cycle/instruction}}$$

$$T_{\text{vector}} = 819 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{0.0002559 \text{ milliseconds}} \quad (0.256\text{ }\mu\text{s})$$

---

#### Step 3: Evaluate Mask Policy Comparison (Merging `v0.t` vs Zeroing `v0.m`)

Consider 4 elements in input vector $v1 = [\ 12.0, \ 4.0, \ 15.0, \ 2.0\ ]$.
Condition: `A[i] >= 10.0f`.
* Lane 0 ($12.0 \ge 10.0$): **TRUE ($1$)**. Calculation: $12.0 - 10.0 = \mathbf{2.0f}$ (`32'h40000000`).
* Lane 1 ($4.0 < 10.0$): **FALSE ($0$)**. Disabled!
* Lane 2 ($15.0 \ge 10.0$): **TRUE ($1$)**. Calculation: $15.0 - 10.0 = \mathbf{5.0f}$ (`32'h40A00000`).
* Lane 3 ($2.0 < 10.0$): **FALSE ($0$)**. Disabled!

$$\text{Generated Predicate Mask } v0 = [\quad 1, \quad 0, \quad 1, \quad 0\quad]$$

Prior to the `IF`-path instruction, destination register $v3$ holds initial value `16 x 99.0f` (`32'h42C60000`).

The instruction `vfsub.vf v3, v1, fa0, mask` executes:

##### Policy A: Mask-Undisturbed / Merging Predication (`v0.t`)
For disabled lanes ($v0[i] == 0$), $v3[i]$ retains its old initial value (`99.0f`):

$$v3_{\text{PolicyA}} = [\quad \mathbf{2.0f}, \quad \mathbf{99.0f}, \quad \mathbf{5.0f}, \quad \mathbf{99.0f} \quad]$$

$$\text{Hex Payload: } [\quad \text{32'h40000000}, \quad \text{32'h42C60000}, \quad \text{32'h40A00000}, \quad \text{32'h42C60000} \quad]$$

##### Policy B: Zeroing Predication (`v0.m`)
For disabled lanes ($v0[i] == 0$), $v3[i]$ is forcibly overwritten with Zero (`0.0f`):

$$v3_{\text{PolicyB}} = [\quad \mathbf{2.0f}, \quad \mathbf{0.0f}, \quad \mathbf{5.0f}, \quad \mathbf{0.0f} \quad]$$

$$\text{Hex Payload: } [\quad \text{32'h40000000}, \quad \text{32'h00000000}, \quad \text{32'h40A00000}, \quad \text{32'h00000000} \quad]$$

```text
MASK POLICY OUTPUT COMPARISON TABLE

 Lane Index │ Condition (>=10) │ IF-Path Output │ Policy A (v0.t Merging) │ Policy B (v0.m Zeroing)
────────────┼──────────────────┼────────────────┼─────────────────────────┼───────────────────────────
   Lane 0   │ TRUE (12.0 >=10) │ 2.0f           │ 2.0f  (32'h40000000)    │ 2.0f  (32'h40000000)
   Lane 1   │ FALSE (4.0 < 10) │ Disabled       │ 99.0f (32'h42C60000)    │ 0.0f  (32'h00000000)
   Lane 2   │ TRUE (15.0 >=10) │ 5.0f           │ 5.0f  (32'h40A00000)    │ 5.0f  (32'h40A00000)
   Lane 3   │ FALSE (2.0 < 10) │ Disabled       │ 99.0f (32'h42C60000)    │ 0.0f  (32'h00000000)
```

---

#### Step 4: Calculate Performance Speedup Factor

Let us compare total execution time between the Scalar Loop ($T_{\text{scalar}} = 3.047\text{ }\mu\text{s}$) and the Predicated Vector Assembly Loop ($T_{\text{vector}} = 0.256\text{ }\mu\text{s}$):

$$\text{Speedup} = \frac{T_{\text{scalar}}}{T_{\text{vector}}} = \frac{3.047\text{ }\mu\text{s}}{0.256\text{ }\mu\text{s}} = \frac{9,750\text{ cycles}}{819\text{ cycles}} \approx \mathbf{11.905\times \text{ Performance Advantage!}}$$

```text
PREDICATED VECTORIZATION PERFORMANCE SUMMARY

 Method / Architecture         │ Control Flow Style │ Total Cycles │ Time (us) │ Speedup vs Scalar
───────────────────────────────┼────────────────────┼──────────────┼───────────┼───────────────────
 Scalar Loop (With Branches)   │ 250 Mispredictions │ 9,750 Cycles │  3.047 us │ 1.00x (Baseline)
 Predicated Vector Loop (v0.t) │ 100% Branchless!   │   819 Cycles │  0.256 us │ 11.91x FASTER!
                               │ (Zero Mispredicts) │ (91.6% Saved)│ (2.791 us)│ (+1,091% Gain)
```

##### Engineering Conclusion:
By eliminating conditional branches through vector predicate masking (`v0.t`), the predicated vector loop eliminated $250$ branch mispredictions and processed $1,000$ elements in $819\text{ clock cycles}$ ($0.256\text{ }\mu\text{s}$) instead of $9,750\text{ clock cycles}$—delivering an **$11.91\times$ performance speedup ($1,091\%$ throughput gain)**!

---

### Sanity Check and Verification

Let us verify our mathematical, structural, and masking results against vector architecture principles:

1. **Branchless Execution Verification**:
   * The vector loop executed 63 iterations with 0 branch mispredictions.
   * Total vector instructions executed = $63 \times 13 = 819\text{ instructions}$.
   * Total clock cycles = 819 cycles, matching 1 cycle/instruction execution.
2. **Merging vs Zeroing Mask Policy Check**:
   * Under Policy A (`v0.t`), disabled lanes 1 and 3 retained initial value `99.0f` (`32'h42C60000`).
   * Under Policy B (`v0.m`), disabled lanes 1 and 3 were forced to `0.0f` (`32'h00000000`).
   * Output payload byte layouts match hardware specification with $100\%$ precision.
3. **Element Processing Verification**:
   * $62 \text{ iterations} \times 16 \text{ elements} + 1 \text{ iteration} \times 8 \text{ elements} = 992 + 8 = 1,000\text{ elements}$.
   * All 1,000 elements processed with zero missing or extra operations.

All predicate comparison mask generations, lane disabling exception suppression rules, merging vs zeroing mask policies, and branchless vector speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Vector Predicate Mask ($V_{\text{mask}}$ / `v0`)**: A dedicated 1-bit-per-element vector control register holding boolean comparison flags ($0$ or $1$) generated by vector comparison instructions, used to control lane enabling and disabling across subsequent vector operations.
* **Lane Disabling**: The physical microarchitectural mechanism that turns OFF execution in vector lanes where the predicate mask bit is zero ($M[i] = 0$), suppressing floating-point exceptions, gating clock trees, and executing either Mask-Undisturbed merging ($V_D[i] \Leftarrow V_D[i]$) or Zeroing ($V_D[i] \Leftarrow 0$) destination write-back policies.
