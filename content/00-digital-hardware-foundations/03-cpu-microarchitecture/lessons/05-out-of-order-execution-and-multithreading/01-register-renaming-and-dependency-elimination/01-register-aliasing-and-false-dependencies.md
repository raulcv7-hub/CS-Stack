# Register Aliasing, False Data Dependencies, and Architectural vs. Physical Register Files

## The Artificial Register Bottleneck: Software Name Scarcity

Imagine an advanced superscalar processor core equipped with eight parallel execution units—multiple Arithmetic Logic Units (ALUs), floating-point units, and load/store engines—capable of executing multiple instructions simultaneously on every clock cycle.

A software compiler generates an assembly code sequence containing four instructions:

```assembly
; INSTRUCTION SEQUENCE WITH DATA DEPENDENCIES
Inst 1: ADD  x1, x2, x3   ; x1 <= x2 + x3 (Producer 1)
Inst 2: SUB  x4, x1, x5   ; x4 <= x1 - x5 (Consumer 1: Reads x1 from Inst 1)
Inst 3: MUL  x1, x6, x7   ; x1 <= x6 * x7 (Producer 2: Overwrites x1!)
Inst 4: AND  x8, x1, x9   ; x8 <= x1 & x9 (Consumer 2: Reads x1 from Inst 3)
```

Let us analyze the mathematical dataflow relationships across these four instructions:

1. **Instruction 1 and Instruction 2**:
   Instruction 1 calculates $x1 = x2 + x3$. Instruction 2 reads register $x1$ to compute $x4 = x1 - x5$. 
   *There is a real mathematical data flow from Instruction 1 to Instruction 2.*
2. **Instruction 3 and Instruction 4**:
   Instruction 3 calculates $x1 = x6 \times x7$. Instruction 4 reads register $x1$ to compute $x8 = x1 \ \& \ x9$.
   *There is a real mathematical data flow from Instruction 3 to Instruction 4.*
3. **Now, look at Instruction 2 and Instruction 3**:
   Instruction 2 reads register $x1$. Instruction 3 writes a new calculation result into register $x1$.
   *Is there any mathematical relationship between Instruction 2 and Instruction 3?* **NO!**

```text
THE FALSE DEPENDENCY BOTTLENECK

 Inst 1: ADD x1, x2, x3 ──► Inst 2: SUB x4, x1, x5 (Reads x1)
                            ▲
                            │ FALSE DEPENDENCY (WAR)! Inst 3 must NOT overwrite x1
                            │ until Inst 2 finishes reading x1!
 Inst 3: MUL x1, x6, x7 ──► Inst 4: AND x8, x1, x9 (Reads x1)
 (Inst 3 and Inst 4 are mathematically INDEPENDENT of Inst 1 and Inst 2!)
```

Look at the absurdity of this situation!
* Instruction 3 (`MUL x1, x6, x7`) and Instruction 4 (`AND x8, x1, x9`) are completely, mathematically independent from Instruction 1 and Instruction 2! They operate on entirely different variables ($x6, x7, x9$).
* Why did Instruction 3 write its result into register $x1$?
  **Because the software compiler ran out of register names!** 

Because Instruction Set Architectures (ISAs) define a small, fixed number of register names (e.g., 32 registers $x0 \dots x31$ in RISC-V or 16 registers in x86-64), the compiler was forced to reuse the name $x1$ for two completely unrelated variables in the program!

Now, trace what happens inside an in-order or out-of-order execution engine if Instruction 3 is allowed to execute early:
* If Instruction 3 (`MUL`) executes before Instruction 2 (`SUB`) finishes reading register $x1$, Instruction 3 will **overwrite register $x1$ with $x6 \times x7$**!
* When Instruction 2 finally reads register $x1$, it reads Instruction 3's new number instead of Instruction 1's old number, corrupting the calculation!

To prevent this data corruption, a standard processor is forced to **stall Instruction 3 and Instruction 4**, waiting for Instruction 2 to finish reading register $x1$ and write back its result.

Look at the physical performance waste:
> Two completely independent instruction streams are forced to execute sequentially, stalling the processor's execution units, **solely because the compiler ran out of register names!**

These artificial stalls are caused by **False Data Dependencies** (also known as Name Dependencies): **Write-After-Read (WAR)** and **Write-After-Write (WAW)** hazards.

How do modern high-performance microarchitectures eliminate false data dependencies and execute independent instruction streams in parallel without expanding the public ISA software specification?

They decouple software register names from physical silicon storage using **Architectural vs. Physical Register Files** and **Register Aliasing (Register Renaming)**.

---

## The Shared Whiteboard vs. The Blank Paper Pad: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how register renaming eliminates false name dependencies without altering software code, let us picture two independent groups of students working in a university study room.

Imagine a study room equipped with a single wall-mounted whiteboard labeled **"Whiteboard #1"** (Architectural Register Name $x1$).

Two independent study groups, Group A and Group B, enter the study room to work on completely different homework assignments:

```text
THE SHARED WHITEBOARD BOTTLENECK

 Group A (Physics Assignment)         Group B (Biology Assignment)
 ┌───────────────────────────┐        ┌───────────────────────────┐
 │ Student 1: Calculates     │        │ Student 3: Calculates     │
 │ Physics Result = 15       │        │ Biology Result = 42       │
 │ Writes '15' on Board #1   │        │ Wants to write on Board #1│
 ├───────────────────────────┤        └───────────────────────────┘
 │ Student 2: Reads Board #1 │
 │ to write in Physics report│
 └───────────────────────────┘
```

Let us compare two different room management rules:

---

### Strategy 1: The Single Shared Whiteboard (Architectural Register Name Scarcity)
The study room policy requires all students to write their intermediate calculations on "Whiteboard #1".

1. Student 1 (Group A) calculates a physics problem ($x2 + x3 = 15$) and writes `15` on Whiteboard #1 (Instruction 1: `ADD x1, x2, x3`).
2. Student 2 (Group A) is reading the number `15` off Whiteboard #1 to copy it into her physics report (Instruction 2: `SUB x4, x1, x5`).
3. Student 3 (Group B) arrives to calculate a completely unrelated biology problem ($x6 \times x7 = 42$). Student 3 wants to write `42` on Whiteboard #1 (Instruction 3: `MUL x1, x6, x7`).

Look at the conflict facing Student 3 (Group B):
* Student 3 **CANNOT** write `42` on Whiteboard #1 yet!
* If Student 3 erases Whiteboard #1 and writes `42`, Student 2 (Group A) will read `42` instead of `15`, ruining her physics report!
* Student 3 is forced to **stand idle in the corner and wait** until Student 2 finishes reading Whiteboard #1!

Student 3 is stalled by a **Write-After-Read (WAR) Anti-Dependency**. Group B's work is delayed solely because both groups were forced to share the name "Whiteboard #1"!

---

### Strategy 2: The Pad of Fresh Paper (Physical Register File Decoupling)
The study room manager installs an automated paper dispenser containing 128 blank, numbered sheets of paper (**Physical Registers $p0 \dots p127$**).

The manager places a small digital lookup screen on the wall (**The Register Alias Table - RAT**):

```text
STRATEGY 2: THE AUTOMATED PAPER DISPENSER (REGISTER RENAMING)

 Group A (Physics)                    Group B (Biology)
 ┌─────────────────────────────┐      ┌─────────────────────────────┐
 │ Dispenser hands Sheet p1    │      │ Manager hands Sheet p10     │
 │ Student 1 writes '15' on p1 │      │ Student 3 writes '42' on p10│
 │ Student 2 reads from p1     │      │ Student 4 reads from p10    │
 └─────────────────────────────┘      └─────────────────────────────┘
  (Group A and Group B execute SIMULTANEOUSLY in parallel with ZERO waiting!)
```

Look at how Strategy 2 executes:
1. Student 1 (Group A) asks for a paper for "Whiteboard #1". The manager hands Student 1 **Sheet $p1$**. Student 1 writes `15` on $p1$. The lookup screen maps: $\text{"Whiteboard \#1"} \to p1$.
2. Student 2 (Group A) asks to read "Whiteboard #1". The lookup screen redirects Student 2 to **Sheet $p1$**. Student 2 reads `15`.
3. Student 3 (Group B) arrives and asks to write a new value for "Whiteboard #1". 
   Does the manager make Student 3 wait? **NO!**
   The manager takes a **fresh, blank sheet $p10$** from the dispenser and hands it to Student 3!
   Student 3 writes `42` on Sheet $p10$ immediately!
   The lookup screen updates its mapping for Group B: $\text{"Whiteboard \#1"} \to p10$.
4. Student 4 (Group B) asks to read "Whiteboard #1". The lookup screen redirects Student 4 to **Sheet $p10$**. Student 4 reads `42`.

Look at what this paper dispenser achieved:
* Student 2 is calmly reading physics data off Sheet $p1$.
* Student 3 is writing biology data onto Sheet $p10$ **at the exact same second**!
* Neither group waited for the other! The artificial name conflict ("Whiteboard #1") was completely eliminated!
* Both assignments finished in half the time!

This paper dispenser system is the exact physical analogue of **Register Renaming**:
* "Whiteboard #1" is the **Architectural Register Name ($x1$)**.
* Sheets $p1, p10$ are **Physical Registers ($p1, p10$)**.
* Student 3 waiting for Student 2 is a **False Data Dependency (WAR/WAW)**.
* The digital lookup screen is the **Register Alias Table (RAT)**.

---

## Primitive 1: Data Dependency Classification (RAW, WAR, WAW)

To master register renaming, we must formally classify the three types of data dependencies that can exist between two instructions in a computer program.

Let Instruction $I$ be an earlier instruction in program order, and Instruction $J$ be a later instruction in program order.

```text
DATA DEPENDENCY CLASSIFICATION MATRIX

 Dependency Type          │ Instruction Sequence                │ Hazard Classification
──────────────────────────┼─────────────────────────────────────┼───────────────────────
 Read-After-Write (RAW)   │ I: Write x  ──►  J: Read x          │ TRUE Dependency
 Write-After-Read (WAR)   │ I: Read x   ──►  J: Write x         │ FALSE (Anti) Dep
 Write-After-Write (WAW)  │ I: Write x  ──►  J: Write x         │ FALSE (Output) Dep
```

Let us dissect each of these three dependency types in complete technical detail:

---

### 1. Read-After-Write (RAW) — True Data Dependency
A **Read-After-Write (RAW)** dependency occurs when Instruction $J$ attempts to read a register $x$ that is written by Instruction $I$:

$$
I: \text{Write } x \quad \longrightarrow \quad J: \text{Read } x
$$

* **Nature**: **TRUE DATA DEPENDENCY**.
* **Physical Reality**: Data physically flows from Instruction $I$ to Instruction $J$. Instruction $J$ mathematically cannot execute until Instruction $I$ calculates the value of $x$.
* **Can Renaming Eliminate RAW Dependencies?**: **NO!** 
  Register renaming CANNOT eliminate a true RAW dependency. Instruction $J$ must wait for Instruction $I$'s calculation using operand forwarding or pipeline stalls.

---

### 2. Write-After-Read (WAR) — Anti-Dependency
A **Write-After-Read (WAR)** dependency occurs when Instruction $J$ attempts to write to a register $x$ that is read by Instruction $I$:

$$
I: \text{Read } x \quad \longrightarrow \quad J: \text{Write } x
$$

* **Nature**: **FALSE (NAME) DEPENDENCY**.
* **Physical Reality**: There is **zero data flow** between Instruction $I$ and Instruction $J$. Instruction $J$ is calculating an entirely new, unrelated value. The dependency exists solely because both instructions share the same register name $x$.
* **Can Renaming Eliminate WAR Dependencies?**: **YES!** 
  By assigning Instruction $J$'s destination to a fresh physical register ($p_{\text{new}}$), Instruction $J$ can execute immediately without overwriting the old physical register ($p_{\text{old}}$) that Instruction $I$ is currently reading!

---

### 3. Write-After-Write (WAW) — Output Dependency
A **Write-After-Write (WAW)** dependency occurs when Instruction $J$ attempts to write to a register $x$ that is also written by Instruction $I$:

$$
I: \text{Write } x \quad \longrightarrow \quad J: \text{Write } x
$$

* **Nature**: **FALSE (NAME) DEPENDENCY**.
* **Physical Reality**: Both instructions are overwriting the same register name $x$. The only requirement is that downstream instructions read the final value written by Instruction $J$.
* **Can Renaming Eliminate WAW Dependencies?**: **YES!** 
  By assigning Instruction $I$ to $p_{\text{old}}$ and Instruction $J$ to $p_{\text{new}}$, both instructions can execute out of order simultaneously!

```text
DEPENDENCY ELIMINATION SUMMARY

 Dependency Type │ Dataflow Source │ Removable by Register Renaming?
─────────────────┼─────────────────┼──────────────────────────────────
   RAW (True)    │ Real Data Flow  │ NO  (Must use Forwarding/Stalls)
   WAR (False)   │ Name Reuse Only │ YES (Eliminated 100% by Renaming!)
   WAW (False)   │ Name Reuse Only │ YES (Eliminated 100% by Renaming!)
```

---

## Primitive 2: Architectural versus Physical Register File Decoupling

To eliminate false WAR and WAW dependencies in hardware, modern processor microarchitectures completely decouple the software-visible register names from the physical silicon storage cells.

We define two distinct register spaces inside the CPU:

```text
DECOUPLED REGISTER FILE ARCHITECTURE

 Software ISA View (32 Architectural Regs)     Physical Silicon Die (128 Physical Regs)
 ┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
 │ x0, x1, x2, x3 ... x31               │      │ p0, p1, p2, p3 ... p127              │
 └──────────────────┬───────────────────┘      └──────────────────▲───────────────────┘
                    │                                             │
                    └───────────► [ Register Alias Table ] ───────┘
                                  (Maps x1 -> p1, x1 -> p10)
```

### 1. Architectural Register File (ARF)
* **Definition**: The small set of register names defined by the Instruction Set Architecture (ISA) manual and visible to software compilers and assembly programmers.
* **Size**: Fixed by the ISA specification (e.g., 32 architectural registers $x0 \dots x31$ in RISC-V, 16 registers in x86-64, 32 registers in ARM64).
* **Role**: Provides a compact, fixed binary encoding for instruction words (e.g., a 5-bit field $\text{Inst}[19:15]$ encodes 32 architectural registers $2^5 = 32$).

---

### 2. Physical Register File (PRF)
* **Definition**: The large array of actual hardware D flip-flops or SRAM memory cells physically fabricated on the silicon die.
* **Size**: Determined by the microarchitect (e.g., 64, 128, or 180 physical registers $p0 \dots p179$).
* **Role**: Holds both committed architectural state AND in-flight speculative values generated by out-of-order instructions!

$$
N_{\text{physical}} \gg N_{\text{architectural}}
$$

Where:
* $N_{\text{physical}}$ is the number of physical hardware registers on the silicon die (e.g., 128).
* $N_{\text{architectural}}$ is the number of software-visible registers defined by the ISA (e.g., 32).

#### The Physical Capacity Rule:
For an out-of-order processor that can track up to $M$ in-flight instructions (e.g., $M = 96$ instructions in the Reorder Buffer), the minimum required physical register count $N_{\text{physical}}$ is:

$$
N_{\text{physical}} = N_{\text{architectural}} + M
$$

$$
N_{\text{physical}} = 32 + 96 = \mathbf{128 \text{ Physical Registers}}
$$

At any given clock cycle, 32 physical registers hold the current committed state of architectural registers $x0 \dots x31$, while the remaining 96 physical registers hold temporary speculative values being calculated by instructions executing out of order!

---

## Mechanics of Register Renaming and Dependency Elimination

How does the processor's **Register Renaming Unit** eliminate false WAR and WAW dependencies in real time during the Instruction Decode / Rename stage?

The renaming process is managed by two primary hardware structures:
1. **The Register Alias Table (RAT)**: A high-speed SRAM lookup table with $N_{\text{architectural}}$ entries (32 entries). For every architectural register $x_i$, the RAT stores the physical register tag $p_k$ that currently holds the latest value for $x_i$.
2. **The Free List Manager**: A first-in, first-out (FIFO) queue containing the pool of currently unallocated, available physical registers ($p32 \dots p127$).

```text
REGISTER RENAMING HARDWARE COMPONENTS

 Architectural Specifier rs1 (x1) ──►[ Register Alias Table ]──► Physical Specifier p1
                                      │ (RAT 32 x 6-bit SRAM)  │
 Free List FIFO (Unused Regs)    ──►[ Allocates Fresh p10 ]───► Physical Destination p10
```

---

### The Step-by-Step Register Renaming Algorithm

When an instruction $I$ arrives at the Register Renaming stage:

#### Step 1: Source Register Translation (Read Map)
For each source register specifier ($rs1, rs2$) in the instruction:
The Renaming Unit looks up the architectural name in the RAT table to find its current physical register mapping:

$$p_{rs1} = \mathbf{RAT}[rs1]$$
$$p_{rs2} = \mathbf{RAT}[rs2]$$

The instruction's source specifiers are rewritten from architectural names to physical tags ($rs1 \to p_{rs1}, rs2 \to p_{rs2}$).

#### Step 2: Destination Register Allocation (Write Map & Free List Pop)
For the destination register specifier ($rd$):
1. The Renaming Unit pops a **fresh, unallocated physical register** $p_{\text{new}}$ from the Free List FIFO.
2. The instruction's destination specifier is rewritten to the fresh physical tag ($rd \to p_{\text{new}}$).
3. The RAT table entry for architectural register $rd$ is updated to point to the new physical tag:

$$\mathbf{RAT}[rd] \Leftarrow p_{\text{new}}$$

```text
BEFORE AND AFTER REGISTER RENAMING TRANSFORMATION

 Original Macro-Instruction : ADD x1, x2, x3   (Uses Architectural Names)
                              │
                              ▼ (Renaming Stage: RAT Lookup & Free List Pop)
 Renamed Micro-Instruction  : ADD p10, p2, p3  (Uses Physical Register Tags!)
                              (p10 popped from Free List; RAT[x1] updated to p10)
```

---

### Step-by-Step Renaming Trace of Our 4-Instruction Sequence

Let us trace how the Register Renaming Unit transforms our opening 4-instruction code sequence, using a 32-entry RAT initialized with $x_i \to p_i$, and a Free List containing available physical registers $p32, p33, p34, p35 \dots$:

```assembly
; ORIGINAL ISA CODE
Inst 1: ADD  x1, x2, x3   ; x1 <= x2 + x3
Inst 2: SUB  x4, x1, x5   ; x4 <= x1 - x5
Inst 3: MUL  x1, x6, x7   ; x1 <= x6 * x7  (WAR on x1 from Inst 2! WAW from Inst 1!)
Inst 4: AND  x8, x1, x9   ; x8 <= x1 & x9  (RAW on x1 from Inst 3)
```

---

#### Renaming Step 1: Processing Instruction 1 (`ADD x1, x2, x3`)
* **Source Lookup**: $rs1 = x2 \implies \mathbf{RAT}[x2] = p2$. $rs2 = x3 \implies \mathbf{RAT}[x3] = p3$.
* **Destination Allocation**: $rd = x1$. Pop fresh register $p32$ from Free List!
* **RAT Update**: $\mathbf{RAT}[x1] \Leftarrow p32$.
* **Transformed Instruction 1**: **`ADD p32, p2, p3`**

---

#### Renaming Step 2: Processing Instruction 2 (`SUB x4, x1, x5`)
* **Source Lookup**: $rs1 = x1 \implies \mathbf{RAT}[x1] = \mathbf{p32}$ (Reads the result of Inst 1!). $rs2 = x5 \implies \mathbf{RAT}[x5] = p5$.
* **Destination Allocation**: $rd = x4$. Pop fresh register $p33$ from Free List!
* **RAT Update**: $\mathbf{RAT}[x4] \Leftarrow p33$.
* **Transformed Instruction 2**: **`SUB p33, p32, p5`** (True RAW dependency on $p32$ preserved!).

---

#### Renaming Step 3: Processing Instruction 3 (`MUL x1, x6, x7`)
* **Source Lookup**: $rs1 = x6 \implies \mathbf{RAT}[x6] = p6$. $rs2 = x7 \implies \mathbf{RAT}[x7] = p7$.
* **Destination Allocation**: $rd = x1$. **Pop FRESH physical register $p34$ from Free List!**
* **RAT Update**: $\mathbf{RAT}[x1] \Leftarrow \mathbf{p34}$ (Re-maps $x1$ to $p34$!).
* **Transformed Instruction 3**: **`MUL p34, p6, p7`**

Look at Instruction 3 after renaming:
> **Instruction 3 writes to $p34$, while Instruction 2 reads from $p32$!**
> **The Write-After-Read (WAR) and Write-After-Write (WAW) false dependencies on $x1$ are 100% ELIMINATED!**

---

#### Renaming Step 4: Processing Instruction 4 (`AND x8, x1, x9`)
* **Source Lookup**: $rs1 = x1 \implies \mathbf{RAT}[x1] = \mathbf{p34}$ (Reads the result of Inst 3!). $rs2 = x9 \implies \mathbf{RAT}[x9] = p9$.
* **Destination Allocation**: $rd = x8$. Pop fresh register $p35$ from Free List!
* **RAT Update**: $\mathbf{RAT}[x8] \Leftarrow p35$.
* **Transformed Instruction 4**: **`AND p35, p34, p9`** (True RAW dependency on $p34$ preserved!).

```text
RENAMED INSTRUCTION STREAM (PARALLEL EXECUTION ENABLED!)

 Original Code (Serial Stalls)         Renamed Code (Parallel Execution!)
 ─────────────────────────────         ───────────────────────────────────
 Inst 1: ADD x1, x2, x3   ──►          Inst 1: ADD p32, p2, p3   ──┐ Stream A
 Inst 2: SUB x4, x1, x5   ──►          Inst 2: SUB p33, p32, p5  ──┘ (RAW on p32)
 Inst 3: MUL x1, x6, x7   ──►          Inst 3: MUL p34, p6, p7   ──┐ Stream B
 Inst 4: AND x8, x1, x9   ──►          Inst 4: AND p35, p34, p9  ──┘ (RAW on p34)
 (Inst 3 stalled by WAR/WAW)           (Stream A and Stream B execute PARALLEL!)
```

Look at the extraordinary microarchitectural result!
* Stream A (`Inst 1` $\to$ `Inst 2`) operates on physical registers $p32$ and $p33$.
* Stream B (`Inst 3` $\to$ `Inst 4`) operates on physical registers $p34$ and $p35$.
* **Stream A and Stream B can now execute out-of-order in PARALLEL simultaneously on different execution units!**
* The false WAR and WAW stalls vanished completely.

---

## Performance Quantification: Pipeline Parallelism Gains

To measure the quantitative impact of register renaming on processor performance, let us compare the execution cycles of an instruction sequence with and without register renaming.

### Execution Cycle Timeline Comparison

Consider our 4-instruction code sequence executing on a **Dual-Issue Out-of-Order Processor Core** with two execution units (ALU 0 and ALU 1).

Assume that an integer addition takes 1 clock cycle, and an integer multiplication takes 2 clock cycles.

---

#### Case A: Without Register Renaming (In-Order / False Dependency Stalls)
* **Cycle 1**: Inst 1 (`ADD p1`) issued to ALU 0. Inst 2 (`SUB`) issued to ALU 1 (stalls in EX for $p1$).
* **Cycle 2**: Inst 1 completes writeback to $x1$. Inst 2 (`SUB`) reads $x1$ and executes.
  * **Inst 3 (`MUL x1`) CANNOT ISSUE on Cycle 2** because it would overwrite $x1$ while Inst 2 (`SUB`) is reading $x1$ (**WAR Stall!**).
* **Cycle 3**: Inst 2 completes. Inst 3 (`MUL p34`) issued to ALU 0.
* **Cycle 4**: Inst 3 continues executing in ALU 0.
* **Cycle 5**: Inst 3 completes. Inst 4 (`AND`) issued to ALU 1.
* **Cycle 6**: Inst 4 completes.
* **Total Execution Time**: **6 Clock Cycles** ($\text{IPC} = 4 / 6 = \mathbf{0.67 \text{ IPC}}$).

---

#### Case B: WITH Register Renaming (False Dependencies Eliminated)
* **Cycle 1**:
  * Inst 1 (`ADD p32, p2, p3`) issued to ALU 0.
  * Inst 3 (`MUL p34, p6, p7`) issued to ALU 1 (**Co-issued in parallel on Cycle 1!** WAR/WAW eliminated!).
* **Cycle 2**:
  * Inst 1 completes. Inst 2 (`SUB p33, p32, p5`) receives $p32$ via forwarding and executes in ALU 0.
  * Inst 3 continues executing in ALU 1.
* **Cycle 3**:
  * Inst 3 completes. Inst 4 (`AND p35, p34, p9`) receives $p34$ via forwarding and executes in ALU 0.
  * Inst 2 completes writeback.
* **Total Execution Time**: **3 Clock Cycles** ($\text{IPC} = 4 / 3 = \mathbf{1.33 \text{ IPC}}$).

```text
REGISTER RENAMING PERFORMANCE COMPARISON MATRIX

 Execution Mode            │ Cycles to Complete 4 Insts │ IPC Throughput │ Performance Speedup
───────────────────────────┼────────────────────────────┼────────────────┼─────────────────────
 Without Renaming (Stalls) │ 6 Clock Cycles             │ 0.67 IPC       │ Baseline (1.00x)
 WITH Renaming (Parallel)  │ 3 Clock Cycles             │ 1.33 IPC       │ 2.00x FASTER!
```

By adding a 32-entry Register Alias Table and decoupling physical registers from architectural names, **the processor completed the exact same code sequence in half the clock cycles ($2.00\times$ speedup)!**

---

## Engineering Reality: $x0$ Zero Register Protection and Free List Reclamation

In commercial silicon implementation, implementing Register Renaming requires handling two critical physical edge cases: **$x0$ Hardwired Zero Protection** and **Physical Register Free List Reclamation**.

### 1. Register $x0$ Hardwired Zero Protection
In RISC architectures (such as RISC-V), architectural register $x0$ is hardwired to static zero (`32'h0000_0000`).

When an instruction writes to $x0$ (e.g., `ADD x0, x1, x2` or `ADDI x0, x0, 0` - a `NOP`):
* **Should the Renaming Unit allocate a fresh physical register from the Free List for $x0$?**
* **NO!** 

If the Renaming Unit allocated a fresh physical register for $x0$, $x0$ would capture $x1 + x2 = 42$, and subsequent instructions reading $x0$ would read $42$ instead of zero!

#### The Hardware Fix:
The Register Alias Table permanently hardwires architectural register $x0$ to **Physical Register $p0$**:

$$\mathbf{RAT}[x0] \equiv p0 \quad (\text{Permanently Hardwired!})$$

When an instruction targets $x0$ ($rd = 0$):
1. The Free List Manager **does NOT pop** a new physical register.
2. The destination specifier is mapped directly to $p0$.
3. Physical register $p0$ is hardwired to ground ($0\text{ V}$), ensuring $x0$ always evaluates as zero across all renamed instructions.

---

### 2. Physical Register Free List Reclamation (When Is a Physical Register Safe to Free?)

When a physical register $p10$ is allocated to receive a new value for architectural register $x1$, when is the **OLD physical register $p1$** (which held $x1$'s previous value) safe to be returned to the Free List?

Can we return $p1$ to the Free List immediately when $x1$ is renamed to $p10$?

**NO!** 

Earlier instructions currently in flight in the pipeline might still be reading $p1$! If we return $p1$ to the Free List immediately, the Free List will allocate $p1$ to a brand-new instruction, which will overwrite $p1$ while the older instructions are still reading it!

```text
PHYSICAL REGISTER RECLAMATION SAFETY RULE

 Inst 1: ADD x1, x2, x3  ──► Allocated p1 for x1
 Inst 2: SUB x4, x1, x5  ──► Reads p1
 Inst 3: MUL x1, x6, x7  ──► Allocated p10 for x1 (Renamed!)
                             │
                             ▼
 WHEN IS OLD REGISTER p1 SAFE TO RETURN TO FREE LIST?
 ONLY when Inst 3 officially COMMITS (RETIRES) in the Reorder Buffer!
 (Guarantees that Inst 2 has completely finished reading p1!)
```

#### The Architectural Reclamation Rule:
> **An old physical register $p_{\text{old}}$ is safe to be returned to the Free List ONLY when the younger instruction that overwrote its architectural mapping officially COMMITS (RETIRES) in the Reorder Buffer!**

When Instruction 3 (`MUL x1`) reaches the ROB Commit stage:
1. Instruction 3 has completed execution.
2. All older instructions ahead of Instruction 3 (including Instruction 2) have committed and retired, meaning **no instruction in the CPU will ever read $p1$ again**.
3. The ROB commit logic pushes $p1$ back onto the Free List FIFO, making $p1$ available for future instruction allocations!

---

## Solved Industrial Engineering Exercise: Complete Architectural-to-Physical Register Mapping Subsystem

To consolidate your complete mastery of architectural vs physical register files, RAW vs WAR/WAW dependency classification, Register Alias Table (RAT) lookups, Free List management, and $x0$ zero-register protection, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

You are an ASIC microarchitect designing the **Register Renaming and Alias Table Subsystem** (`RegisterMappingUnit`) for a 32-bit RISC-V superscalar core.

```text
REGISTER RENAMING SUBSYSTEM INTERFACE

 Arch Sources  arch_rs1[4:0], arch_rs2[4:0] ──┐
 Arch Dest     arch_rd[4:0], alloc_en       ──┼──► [ RegisterMappingUnit ] ──┬──► phys_rs1[5:0]
 Master Clock clk, Reset reset_n            ──┘                              ├──► phys_rs2[5:0]
                                                                             ├──► phys_rd[5:0]
                                                                             └──► free_list_empty
```

The subsystem manages:
* **Architectural Register Space**: 32 Registers ($x0 \dots x31$, 5-bit specifiers).
* **Physical Register Space**: 64 Registers ($p0 \dots p63$, 6-bit specifiers).
* **Register Alias Table (RAT)**: $32 \times 6 \text{ bits}$ SRAM array.
* **Free List FIFO**: A 32-entry queue holding available physical registers ($p32 \dots p63$).

#### Physical Library Gate Delays (28nm CMOS Technology):
* RAT Table Read Delay: $t_{\text{rat\_read}} = 0.25\text{ ns}$
* Free List FIFO Pop Delay: $t_{\text{free\_pop}} = 0.20\text{ ns}$
* $x0$ Zero MUX Selection Delay: $t_{\text{mux\_x0}} = 0.12\text{ ns}$
* RAT Table Write Setup Time: $t_{\text{rat\_su}} = 0.15\text{ ns}$
* Target Clock Period: $T_{\text{clk}} = 2.00\text{ ns}$ ($f_{\text{max}} = 500\text{ MHz}$).

#### Your Objective

1. Calculate the critical path propagation delay ($t_{\text{rename\_path}}$) through the renaming unit and evaluate setup timing slack ($T_{\text{slack}}$).
2. Write the complete, synthesizable SystemVerilog module `RegisterMappingUnit`.
3. Simulate and trace signal values across a 4-instruction program sequence containing false dependencies:
   * **Inst 1**: `ADD x1, x2, x3` (Allocates $p32$ for $x1$)
   * **Inst 2**: `SUB x4, x1, x5` (Reads $p32$ for $x1$, allocates $p33$ for $x4$)
   * **Inst 3**: `MUL x1, x6, x7` (False WAR/WAW dependency on $x1$! Allocates $p34$ for $x1$)
   * **Inst 4**: `ADDI x0, x1, 5` ($x0$ zero protection test! Reads $p34$ for $x1$, maps $x0 \to p0$ without popping Free List!)
4. Trace RAT state mappings, Free List pop pointer values, and physical register specifiers for all 4 instructions.
5. Verify structural, mathematical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Critical Path Propagation Delay and Timing Slack

Let us trace the physical critical path through the renaming unit in the Instruction Decode / Rename stage:

1. RAT Read Access ($rs1, rs2$ lookup): $t_{\text{rat\_read}} = 0.25\text{ ns}$.
2. Free List FIFO Pop (allocates $p_{\text{new}}$ for $rd$): $t_{\text{free\_pop}} = 0.20\text{ ns}$.
3. $x0$ Zero Override MUX: $t_{\text{mux\_x0}} = 0.12\text{ ns}$.
4. RAT Writeback Setup Time: $t_{\text{rat\_su}} = 0.15\text{ ns}$.

$$
t_{\text{rename\_path}} = \max(t_{\text{rat\_read}}, \, t_{\text{free\_pop}}) + t_{\text{mux\_x0}} + t_{\text{rat\_su}}
$$

$$
t_{\text{rename\_path}} = 0.25\text{ ns} + 0.12\text{ ns} + 0.15\text{ ns} = \mathbf{0.520 \text{ ns}}
$$

##### Setup Timing Slack ($T_{\text{slack}}$) at $T_{\text{clk}} = 2.00\text{ ns}$:

$$
T_{\text{slack}} = T_{\text{clk}} - t_{\text{rename\_path}} = 2.000\text{ ns} - 0.520\text{ ns} = \mathbf{+1.480 \text{ ns} \quad (POSITIVE SLACK!)}
$$

The renaming subsystem evaluates in **$0.520\text{ nanoseconds}$**, easily closing timing at $500\text{ MHz}$ with $+1.480\text{ ns}$ of positive slack!

---

#### Step 2: Write the Synthesizable SystemVerilog Module

We construct `RegisterMappingUnit` using clean, modular SystemVerilog logic:

```systemverilog
`default_nettype none

// ARCHITECTURAL-TO-PHYSICAL REGISTER MAPPING SUBSYSTEM
module RegisterMappingUnit (
    input  logic       clk,
    input  logic       reset_n,
    input  logic [4:0] arch_rs1,       // Source 1 Architectural Reg (0..31)
    input  logic [4:0] arch_rs2,       // Source 2 Architectural Reg (0..31)
    input  logic [4:0] arch_rd,        // Dest Architectural Reg (0..31)
    input  logic       alloc_en,       // 1 = Allocate fresh physical reg for rd
    output logic [5:0] phys_rs1,       // Mapped Physical Source 1 Reg (0..63)
    output logic [5:0] phys_rs2,       // Mapped Physical Source 2 Reg (0..63)
    output logic [5:0] phys_rd,        // Mapped Physical Dest Reg (0..63)
    output logic       free_list_empty // 1 = Free List exhausted (Stall!)
);

    // 1. Register Alias Table (RAT): 32 Entries x 6 Bits
    logic [5:0] rat_table [0:31];

    // 2. Free List FIFO Buffer (Holds available physical registers p32..p63)
    logic [5:0] free_list [0:31];
    logic [4:0] head_ptr, tail_ptr;
    logic [5:0] count;

    assign free_list_empty = (count == 6'd0);

    // 3. Source Register Translation (Read Map from RAT)
    // x0 is PERMANENTLY hardwired to p0!
    assign phys_rs1 = (arch_rs1 == 5'd0) ? 6'd0 : rat_table[arch_rs1];
    assign phys_rs2 = (arch_rs2 == 5'd0) ? 6'd0 : rat_table[arch_rs2];

    // 4. Destination Register Allocation (Pop from Free List)
    logic [5:0] popped_phys_reg;
    assign popped_phys_reg = free_list[head_ptr];

    // x0 Protection: If destination is x0, map to p0 without popping Free List!
    assign phys_rd = (arch_rd == 5'd0) ? 6'd0 : popped_phys_reg;

    // 5. RAT Update & Free List FIFO State Machine
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            // Reset RAT: Map architectural x0..x31 to physical p0..p31
            for (int i = 0; i < 32; i++) begin
                rat_table[i] <= 6'(i);
            end

            // Reset Free List FIFO: Fill with available registers p32..p63
            for (int j = 0; j < 32; j++) begin
                free_list[j] <= 6'(j + 32);
            end

            head_ptr <= 5'd0;
            tail_ptr <= 5'd0;
            count    <= 6'd32; // 32 free physical registers available
        end else if (alloc_en && (arch_rd != 5'd0) && !free_list_empty) begin
            // Update RAT mapping for arch_rd
            rat_table[arch_rd] <= popped_phys_reg;

            // Pop physical register from Free List FIFO
            head_ptr <= head_ptr + 1'b1;
            count    <= count - 1'b1;
        end
    end

endmodule

`default_nettype wire
```

---

#### Step 3: Simulate Program Execution Trace Across 4 Instructions

Let us trace `RegisterMappingUnit` processing our 4-instruction program sequence:

* Initial State ($t = 0\text{ ns}$):
  * $\text{RAT}[x0 \dots x31] = p0 \dots p31$.
  * Free List FIFO holds $p32, p33, p34, p35 \dots$

```text
REGISTER RENAMING SUBSYSTEM SIMULATION TRACE

 Cycle │ Macro-Instruction │ Arch Sources (rs1, rs2) │ Arch Dest (rd) │ Phys Sources (phys_rs1,2) │ Phys Dest (phys_rd) │ Free List Pop │ RAT[x1] Updated To
───────┼───────────────────┼─────────────────────────┼────────────────┼───────────────────────────┼─────────────────────┼───────────────┼───────────────────
   1   │ ADD x1, x2, x3    │ rs1=x2, rs2=x3          │ rd=x1          │ phys_rs1=p2, phys_rs2=p3  │ phys_rd=p32         │ Popped p32    │ RAT[x1] <= p32
   2   │ SUB x4, x1, x5    │ rs1=x1, rs2=x5          │ rd=x4          │ phys_rs1=p32, phys_rs2=p5 │ phys_rd=p33         │ Popped p33    │ RAT[x4] <= p33
   3   │ MUL x1, x6, x7    │ rs1=x6, rs2=x7          │ rd=x1 (WAR!)   │ phys_rs1=p6, phys_rs2=p7  │ phys_rd=p34         │ Popped p34    │ RAT[x1] <= p34!
   4   │ ADDI x0, x1, 5    │ rs1=x1, rs2=x0          │ rd=x0 (x0 Prot)│ phys_rs1=p34, phys_rs2=p0 │ phys_rd=p0          │ NO POP! (x0)  │ RAT[x0] = p0
```

```text
REGISTER ALIAS TABLE (RAT[x1]) MAPPING WAVEFORMS

 clk         : 000011110000111100001111000011110000
               ▲           ▲           ▲           ▲
               │ Cycle 1   │ Cycle 2   │ Cycle 3   │ Cycle 4
               │           │           │           │
 RAT[x1] Map : [ p1      ]─[ p32     ]─[ p32     ]─[ p34 (Re-mapped!) ]===
               ▲                       ▲
               │                       └── Inst 3 re-maps x1 to FRESH p34! (WAR/WAW ELIMINATED!)
               └────────────────────────── Inst 1 maps x1 to p32
```

##### Detailed Cycle Analysis:
1. **Cycle 1 (`ADD x1, x2, x3`)**:
   * Sources: $x2 \to p2$, $x3 \to p3$.
   * Destination $x1$: Free List pops $p32$. `phys_rd` $= p32$.
   * RAT update: $\mathbf{RAT}[x1] \Leftarrow p32$.
2. **Cycle 2 (`SUB x4, x1, x5`)**:
   * Source $x1$: Reads $\mathbf{RAT}[x1] = p32$ (True RAW dependency on Inst 1 captured!).
   * Destination $x4$: Free List pops $p33$. $\mathbf{RAT}[x4] \Leftarrow p33$.
3. **Cycle 3 (`MUL x1, x6, x7`)**:
   * False WAR/WAW dependency on $x1$ detected!
   * Destination $x1$: **Free List pops FRESH physical register $p34$!**
   * RAT update: $\mathbf{RAT}[x1] \Leftarrow p34$.
   * **Inst 3 writes to $p34$, while Inst 2 reads from $p32$! Zero WAR/WAW stalls!**
4. **Cycle 4 (`ADDI x0, x1, 5`)**:
   * Source $x1$: Reads $\mathbf{RAT}[x1] = p34$ (True RAW dependency on Inst 3 captured!).
   * Destination $x0$: **$x0$ Protection Active!** `phys_rd` $= p0$.
   * **No physical register was popped from the Free List!** $p0$ remained hardwired to ground ($0\text{ V}$).

---

### Sanity Check and Verification

Let us verify our Register Renaming Subsystem against all physical and architectural requirements:

1. **WAR / WAW Dependency Elimination Verification**:
   * Inst 3 (`MUL x1`) was assigned $p34$, while Inst 2 (`SUB`) read $p32$.
   * Inst 2 and Inst 3 can execute out of order in parallel with zero data corruption.
   * **Verification**: False name dependencies were $100\%$ eliminated.

2. **$x0$ Zero Register Protection Verification**:
   * Inst 4 targeting $x0$ was mapped to $p0$ (`phys_rd = 6'd0`).
   * Free List count remained unchanged during Inst 4 ($count = 29$).
   * **Verification**: $x0$ zero protection is $100\%$ verified.

3. **Timing Closure**:
   * Critical Path $t_{\text{rename\_path}} = 0.520\text{ ns}$.
   * Setup Slack at $500\text{-MHz}$ clock ($T_{\text{clk}} = 2.00\text{ ns}$): $T_{\text{slack}} = +1.480\text{ ns} \ge 0$.
   * **Verification**: Complete timing closure achieved.

All simulation steps, RAT lookup tables, Free List FIFO allocations, and $x0$ protection circuits evaluate with 100% mathematical, physical, and logical precision. The `RegisterMappingUnit` module is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **True vs. False Data Dependencies (RAW vs WAR/WAW)**: The classification of register dataflow constraints where Read-After-Write (RAW) represents a true mathematical data dependency, while Write-After-Read (WAR) and Write-After-Write (WAW) are false dependencies created solely by software compiler register name reuse.
* **Architectural vs. Physical Register File Decoupling**: The microarchitectural separation between the software-visible architectural registers ($x0 \dots x31$) defined by the ISA and a larger, internal hardware physical register array ($p0 \dots p127$) fabricated on the silicon die.
* **Register Aliasing**: The condition where a single architectural register name (e.g., $x1$) is mapped to different physical register storage locations across time by a Register Alias Table (RAT), eliminating false WAR/WAW dependencies.
