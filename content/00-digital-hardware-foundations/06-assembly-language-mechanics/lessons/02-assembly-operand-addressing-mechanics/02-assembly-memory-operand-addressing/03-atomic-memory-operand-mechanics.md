content/00-digital-hardware-foundations/06-assembly-language-mechanics/lessons/02-assembly-operand-addressing-mechanics/02-assembly-memory-operand-addressing/03-atomic-memory-operand-mechanics.md
# Atomic Memory Operand Mechanics: Load-Reserved / Store-Conditional (`LR/SC`) and Atomic Memory Operations (`AMO`)

## The Multi-Core Read-Modify-Write Hazard: Why Independent Loads and Stores Corrupt Shared Memory

In modern multi-core processor architectures, multiple central processing unit (CPU) execution cores operate in parallel on a single silicon die. These cores share access to a single, unified main memory address space. To process high-concurrency workloads—such as database transaction logs, web server connection pools, or parallel task queues—threads running on different cores must continuously read, update, and write shared global variables stored in main memory.

In standard software algorithms, updating a shared memory variable (such as incrementing a global counter `shared_counter++` or claiming a mutual exclusion lock) requires a three-step **Read-Modify-Write (RMW)** execution sequence:

1. **READ**: Load the current variable value from main memory into a local CPU register (`lw x10, 0(x20)`).
2. **MODIFY**: Perform a mathematical or logical calculation on the register value inside the ALU (`addi x10, x10, 1`).
3. **WRITE**: Store the updated register value back to main memory (`sw x10, 0(x20)`).

Now, consider the physical hardware disaster that occurs when two independent CPU cores (Core 0 and Core 1) attempt to execute this three-step Read-Modify-Write sequence on the **exact same memory address at the exact same physical nanosecond**:

Suppose shared memory address `0x10002000` currently holds the integer value **$100$**.

```text
THE MULTI-CORE READ-MODIFY-WRITE DATA RACE HAZARD

 Shared Memory Address 0x10002000 = 100 (Initial State)
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
 Core 0 Read: x10 <= 100               Core 1 Read: x10 <= 100
       │                               │
       ▼                               ▼
 Core 0 Modify: x10 <= 100 + 1 = 101   Core 1 Modify: x10 <= 100 + 1 = 101
       │                               │
       ▼                               ▼
 Core 0 Write: memory <= 101           Core 1 Write: memory <= 101
       │                               │
       └───────────────┬───────────────┘
                       ▼
          FINAL MEMORY VALUE = 101!
          (EXPECTED 102! ONE INCREMENT SILENTLY LOST & ERASED!)
```

Let us trace the physical data corruption step-by-step:

1. **Simultaneous Read**: Core 0 reads address `0x10002000` and receives $100$. Simultaneously, Core 1 reads address `0x10002000` and also receives $100$.
2. **Local Modification**: Core 0 adds $1$ to its local register ($100 + 1 = 101$). Core 1 adds $1$ to its local register ($100 + 1 = 101$).
3. **Interleaved Write**: Core 0 writes $101$ back to memory address `0x10002000`. A nanosecond later, Core 1 writes $101$ back to memory address `0x10002000`.

Examine the final result in memory:
The final value stored at address `0x10002000` is **$101$**.

This is a catastrophic **Read-Modify-Write Data Race Failure**! 

Two separate cores executed increment operations, but because their load and store instructions were interleaved in time, **Core 0's increment was silently overwritten and erased by Core 1**! The memory value is $101$ instead of $102$.

Why did this corruption happen?
Because standard `lw` (load) and `sw` (store) instructions are **non-atomic** (divisible). Between the instant Core 0 read memory and the instant Core 0 wrote memory, Core 1 intervened and modified the underlying memory address!

How can assembly software instruct multi-core hardware to execute Read-Modify-Write operations **atomically** (indivisibly), ensuring that no other CPU core or hardware device can modify or intervene on the target memory address midway through the calculation?

To eliminate Read-Modify-Write data races without locking up shared memory interconnect buses, modern instruction set architectures incorporate hardware atomic primitives: **Load-Reserved / Store-Conditional (`LR/SC`)** and **Atomic Memory Operations (`AMO`)**.

---

## The Shared Bank Ledger and the Fragile Wax Seal: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of atomic memory operands, hardware reservations, and near-memory execution before analyzing transistor-level cache controllers, reservation registers, and acquire/release memory ordering semantics, let us consider an everyday analogy: **The Shared Bank Ledger and the Fragile Wax Seal**.

Imagine two bank clerks, Clerk 0 (**Core 0**) and Clerk 1 (**Core 1**), managing a shared bank ledger book (**Main Memory Address $A$**) sitting on a counter inside a central vault.

```text
THE SHARED BANK LEDGER METAPHOR

 Clerk 0 (Core 0)                      Clerk 1 (Core 1)
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ Scratchpad Memo           │         │ Scratchpad Memo           │
 └─────────────┬─────────────┘         └─────────────┬─────────────┘
               │                                     │
               ▼                                     ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ CENTRAL VAULT BANK LEDGER BOOK                                │
 │ Account #42 Balance = $100                                    │
 └───────────────────────────────────────────────────────────────┘
   (Shared Memory Address 0x10002000)
```

The bank balance for Account #42 is currently **$\$100$**. Both clerks receive phone calls from customers wanting to deposit $\$5$ into Account #42 simultaneously.

Let us observe two different operational procedures for updating the bank ledger:

---

### Procedure A: Un-Synchronized Reading and Writing (Data Race)

1. **9:00 AM**: Clerk 0 walks into the vault, reads `Account #42 = $100`, and writes `$100` on their personal scratchpad.
2. **9:01 AM**: Clerk 1 walks into the vault, reads `Account #42 = $100`, and writes `$100` on their personal scratchpad.
3. **9:02 AM**: Clerk 0 adds $\$5$ on their scratchpad ($100 + 5 = 105$) and writes `$105` into the ledger book.
4. **9:03 AM**: Clerk 1 adds $\$5$ on their scratchpad ($100 + 5 = 105$) and writes `$105` into the ledger book!

Clerk 0's deposit was completely erased! The bank ledger reads $\$105$ instead of $\$110$. This is the **Read-Modify-Write Data Race**.

---

### Procedure B: The Fragile Wax Seal Method (`LR/SC` - Load-Reserved / Store-Conditional)

To stop clerks from overwriting each other's deposits, the bank manager introduces **Fragile Wax Seals**:

```text
PROCEDURE B: THE FRAGILE WAX SEAL METHOD (LR/SC)

 Step 1: Clerk 0 reads $100 & presses Wax Seal on page  ──► Load-Reserved (LR)
 Step 2: Clerk 0 calculates $100 + $5 = $105             ──► Register Addition
 Step 3: Clerk 0 inspects Wax Seal before writing        ──► Store-Conditional (SC)
         ├─► Seal Intact? ──► Write $105 & Report SUCCESS (0)
         └─► Seal Broken? ──► ABORT WRITE & Report FAILURE (1) -> RETRY!
```

Look at how Procedure B operates:

1. **Load-Reserved (`LR`)**: Clerk 0 walks into the vault, reads `Account #42 = $100`, and **presses a soft, fragile wax seal onto the ledger page** (**Registers a Hardware Memory Reservation**). Clerk 0 then walks back to their desk to calculate $100 + 5 = 105$.
2. **Intervention Detection**: While Clerk 0 is at their desk calculating, Clerk 1 walks into the vault, reads the page, and modifies the ledger. **Clerk 1's touch crushes Clerk 0's fragile wax seal!**
3. **Store-Conditional (`SC`)**: Clerk 0 returns to the vault to write `$105` into the ledger. But before writing, Clerk 0 inspects the wax seal:
   * **If the Wax Seal is Intact**: No other clerk touched the page! Clerk 0 writes `$105` into the ledger and reports **SUCCESS ($0$)**!
   * **If the Wax Seal is Broken**: Another clerk touched the page while Clerk 0 was calculating! Clerk 0's write is **STRICTLY BLOCKED**! Clerk 0 writes **NOTHING**, reports **FAILURE ($1$)**, erases their scratchpad, and **restarts the process from Step 1**!

```text
PROCEDURE B EXECUTION TRACE WITH CONTENTION

 Clerk 0 reads $100 & presses Wax Seal 0  ──► Seal 0 VALID
 Clerk 1 reads $100 & modifies ledger     ──► CRUSHES SEAL 0! (Seal 0 INVALID)
 Clerk 0 attempts to write $105           ──► Sees Broken Seal 0!
                                              ABORTS WRITE! Reports FAILURE (1)!
 Clerk 0 retries from Step 1              ──► Reads fresh balance $105 & succeeds!
```

Notice what Procedure B achieves:
* Clerk 0 **NEVER overwrites Clerk 1's data**!
* If a collision occurs, the hardware detects the broken seal, aborts the write, and forces a retry loop until the update completes cleanly!

---

### Procedure C: The All-In-One Vault Teller (`AMO` - Atomic Memory Operation)

The bank manager introduces a second, faster solution for simple math: **The All-In-One Vault Teller**.

Instead of taking the ledger book out of the vault, Clerk 0 hands a sealed instruction envelope to a specialized teller who lives permanently inside the vault (**Near-Memory Cache ALU / Atomic Unit**):

$$\text{"Teller, add \$5 to Account #42 directly inside the vault, and tell me what the OLD balance was!"}$$

```text
PROCEDURE C: ALL-IN-ONE VAULT TELLER (ATOMIC MEMORY OPERATION)

 Clerk 0 hands envelope to Vault Teller ──► Teller locks vault door
                                            Teller adds $5 directly in book ($100 -> $105)
                                            Teller hands slip to Clerk 0: "Old Balance = $100"
 (Read, Math, and Write happened in ONE INDIVISIBLE STEP inside the vault!)
```

Trace Procedure C's execution:
1. The Vault Teller locks the vault door.
2. The Teller reads the old balance ($100$), adds $5$ directly inside the ledger book ($105$), and writes $105$ into the book.
3. The Teller opens the vault door and hands Clerk 0 a slip reading *"Old Balance = $100$"*.
4. Clerk 1 cannot touch the book while the Teller is working inside the vault.

The read, addition, and write happened in **1 single, indivisible step**!

This bank ledger system is the exact physical analogue of **Hardware Atomic Memory Primitives**:
* The shared bank ledger page is **Main Memory Address $A$**.
* Clerk 0 and Clerk 1 are **Core 0 and Core 1**.
* Pressing a fragile wax seal is **Load-Reserved (`lr.w` / `lr.d`)**.
* Checking if the seal is intact before writing is **Store-Conditional (`sc.w` / `sc.d`)**.
* The all-in-one vault teller is an **Atomic Memory Operation (`amoadd.w` / `amoswap.d`)**.

---

## Primitive 1: Load-Reserved / Store-Conditional (`LR/SC`) Mechanics

Now that we possess an intuitive mental model of fragile wax seals and vault tellers, let us examine the formal engineering mechanics of **Load-Reserved / Store-Conditional (`LR/SC`)**.

> **Load-Reserved / Store-Conditional (`LR/SC`)** is a pair of hardware atomic instructions that provides optimistic, lock-free Read-Modify-Write memory execution. `Load-Reserved` reads a memory location and registers a hardware reservation set on that address. `Store-Conditional` writes a new value back to that address **ONLY if the hardware reservation set remains intact**, returning $0$ on success or $1$ on failure.

```text
LOAD-RESERVED / STORE-CONDITIONAL (LR/SC) HARDWARE DATAPATH

 CPU Core 0 Execution Unit
  │
  ├─► 1. lr.w x10, (x20)  ──► Reads Memory [x20] -> Stores in x10
  │                           Registers Address x20 in Local Reservation Unit!
  │                                    │
  │                           [ Reservation Unit ] (Addr = x20, Valid = 1)
  │                                    │
  │                           Remote Core Write to x20? ──► Valid <= 0 (BROKEN!)
  │                                    │
  └─► 2. sc.w x11, x12, (x20) ◄────────┘
            │
            ├─► Reservation Valid == 1 ──► Write x12 to [x20]; x11 <= 0 (SUCCESS!)
            └─► Reservation Valid == 0 ──► ABORT WRITE!     ; x11 <= 1 (FAILURE!)
```

---

### Detailed Mechanics of the `LR/SC` Instruction Pair

Let us analyze the precise hardware behavior of `lr.w` / `lr.d` and `sc.w` / `sc.d` in RISC-V 64-bit assembly:

#### 1. Load-Reserved (`lr.w rd, (rs1)` / `lr.d rd, (rs1)`)
* **Operation**: Reads a 32-bit word (`lr.w`) or 64-bit double-word (`lr.d`) from memory address $rs1$ into destination register $rd$.
* **Hardware Action**: The CPU core's bus snooping unit or L1 Cache controller registers a **Reservation Set** on the physical memory block address $rs1$:

$$\text{Reservation\_Set} \Leftarrow \{ \text{Address} = \text{RegisterFile}[rs1] \ \ \& \ \ \sim 63, \quad \text{Valid} = 1 \}$$

* **Syntax Example**:
  ```riscv
  lr.w x10, (x20)    # x10 <= memory[x20]; Sets hardware reservation on x20
  ```

#### 2. Store-Conditional (`sc.w rd, rs2, (rs1)` / `sc.d rd, rs2, (rs1)`)
* **Operation**: Attempts to write the 32-bit word (`sc.w`) or 64-bit double-word (`sc.d`) from source register $rs2$ into memory address $rs1$.
* **Hardware Action**: The cache controller inspects the core's hardware Reservation Set for address $rs1$:
  * **If Reservation is Valid ($\text{Valid} == 1$)**: The memory write is committed! Memory at $rs1$ is updated with $rs2$, and destination register $rd$ is set to **`0` (Success)**.
  * **If Reservation is Invalid ($\text{Valid} == 0$)**: The memory write is **ABORTED**! Memory is **NOT modified**, and destination register $rd$ is set to **`1` (Failure)**.
* **Syntax Example**:
  ```riscv
  sc.w x11, x12, (x20) # Attempts to store x12 into memory[x20]. Sets x11=0 (OK) or x11=1 (Fail)
  ```

---

### What Clears a Hardware Reservation Set?

In physical silicon, a core's active hardware reservation set is automatically invalidated ($\text{Valid} \Leftarrow 0$) by any of the following four hardware events:

1. **Remote Core Write Operations**: Any other CPU core or Direct Memory Access (DMA) device writing to any byte within the reserved 64-byte cache line causes the local core's bus snooper to invalidate the reservation set.
2. **Context Switches & Traps**: Executing a hardware exception, software trap (`ecall`), or privilege level transition (`mret` / `sret`) clears the reservation set to prevent cross-process reservation leaks.
3. **Intervening Store Instructions**: Executing any standard store instruction (`sw` / `sd`) on the local core before the `SC` instruction executes clears the reservation set.
4. **Secondary Load-Reserved Instructions**: Executing a new `LR` instruction overwrites the previous reservation address.

---

### Synthesizing a Lock-Free Retry Loop in Assembly

Because `Store-Conditional` can fail ($rd = 1$), software engineers place `LR/SC` inside a conditional **Retry Loop**:

```riscv
# ATOMIC MEMORY INCREMENT LOOP USING LR/SC IN RISC-V ASSEMBLY

atomic_increment_loop:
    lr.w  x10, (x20)        # 1. Load-Reserved: Read current value & set reservation
    addi  x10, x10, 1       # 2. Local Modify: Increment value in register x10
    sc.w  x11, x10, (x20)   # 3. Store-Conditional: Write back IF reservation intact!
    bnez  x11, atomic_increment_loop # 4. Check Success: If x11 != 0 (Failed!), retry loop!
```

Let's trace how this loop guarantees $100\%$ thread safety:
* If no remote core interferes, `sc.w` succeeds on the first try ($x11 = 0$), `bnez` does not branch, and the loop finishes in 4 instructions.
* If a remote core modifies address `x20` midway through, `sc.w` fails ($x11 = 1$). Memory is NOT corrupted. `bnez` branches back to `atomic_increment_loop`, re-reads the fresh value, and retries until it succeeds!

---

## Primitive 2: Atomic Memory Operations (`AMO`) Mechanics

Now let us examine the second core primitive: **Atomic Memory Operations (`AMO`)**.

While `LR/SC` provides flexible optimism for complex calculations, what happens if 64 CPU cores simultaneously attempt to increment the exact same global counter variable using `LR/SC` retry loops?

Under heavy multi-core contention, 63 out of 64 cores will continuously break each other's wax seals! The `sc.w` instructions will fail repeatedly ($x11 = 1$), and the cores will spend $90\%+$ of their time spinning in retry loops (**Reservation Contention Thrashing**).

To eliminate retry loops under high contention, modern ISAs provide single-instruction **Atomic Memory Operations (`AMO`)**.

> **An Atomic Memory Operation (`AMO`)** is a single, self-contained instruction that performs an indivisible Read-Modify-Write operation directly at the Level 1 / Level 2 Cache or Near-Memory ALU boundary without requiring loop retries.

```text
NEAR-MEMORY AMO EXECUTION DATAPATH

 CPU Core 0 ──► Issues `amoadd.w x10, x12, (x20)` ──► L1/L2 Cache Controller
                                                           │
                                                           ▼
                             ┌───────────────────────────────────────────┐
                             │ NEAR-MEMORY CACHE ATOMIC ALU              │
                             │ 1. Read old value at x20 (e.g. 100)      │
                             │ 2. Add x12 (5) -> 100 + 5 = 105           │
                             │ 3. Write 105 into Cache Line             │
                             │ 4. Return old value (100) to x10 (rd)     │
                             └───────────────────────────────────────────┘
```

---

### How an `AMO` Instruction Executes in Silicon

When a processor core executes an `AMO` instruction (such as `amoadd.w x10, x12, (x20)`):

1. **Single Command Packet**: The CPU core formats an `AMO` request packet containing target address `x20`, source operand `x12` ($5$), and operation code (`ADD`).
2. **Cache Lock & Near-Memory ALU Execution**:
   * The packet is sent to the local L1 Data Cache or shared L2 Cache.
   * The cache controller locks the target 64-byte cache line locally in Exclusive Modified ($M$) state.
   * A specialized **Near-Memory ALU** sitting inside the cache controller reads the old value ($100$), adds the source register payload ($5$), and writes the sum ($105$) back into the cache line in a single pass!
3. **Old Value Return**: The near-memory ALU returns the **original old value ($100$)** back to the requesting core's destination register `x10` (`rd`).

```riscv
# ATOMIC ADD INSTRUCTION SYNTAX (RISC-V)

amoadd.w rd, rs2, (rs1)   # rd <= old_memory[rs1]
                          # memory[rs1] <= old_memory[rs1] + rs2
```

---

### The Family of RISC-V `AMO` Instructions

RISC-V provides a comprehensive suite of 10 atomic memory operations supporting both 32-bit (`.w`) and 64-bit (`.d`) word sizes:

```text
RISC-V ATOMIC MEMORY OPERATION (AMO) FAMILY

 Instruction Mnemonic │ Hardware Operation Executed                 │ Primary Use Case
──────────────────────┼─────────────────────────────────────────────┼───────────────────────────────
 amoadd.w rd,rs2,(rs1)│ mem <= mem + rs2; rd <= old_mem             │ Concurrent Counters
 amoswap.w rd,rs2,(rs1)│ mem <= rs2; rd <= old_mem                   │ Spinlock Acquire / Release
 amomax.w rd,rs2,(rs1)│ mem <= max(mem, rs2); rd <= old_mem         │ Maximum Tracking
 amomin.w rd,rs2,(rs1)│ mem <= min(mem, rs2); rd <= old_mem         │ Minimum Tracking
 amoor.w  rd,rs2,(rs1)│ mem <= mem | rs2; rd <= old_mem             │ Bitmask Setting
 amoand.w rd,rs2,(rs1)│ mem <= mem & rs2; rd <= old_mem             │ Bitmask Clearing
 amoxor.w rd,rs2,(rs1)│ mem <= mem ^ rs2; rd <= old_mem             │ Bitmask Toggling
```

Look at `amoswap.w rd, rs2, (rs1)`:
`amoswap` atomically swaps the value inside register `rs2` with the value stored in memory address `rs1`, returning the old memory value in `rd`. 

This single instruction implements an entire **Mutual Exclusion Spinlock** in just 2 lines of assembly!

```riscv
# MUTUAL EXCLUSION SPINLOCK ACQUIRE USING AMOSWAP
addi  x12, x0, 1          # x12 <= 1 (Locked state payload)
spinlock_retry:
    amoswap.w.aq x10, x12, (x20) # Atomically swap x12 (1) with memory[x20]. x10 <= old_mem
    bnez         x10, spinlock_retry # If old_mem was 1 (already locked!), retry!
```

---

## Hardware Memory Ordering Suffixes: Acquire (`.aq`) and Release (`.rl`)

In modern Weak Memory Ordering (WMO) architectures, executing an atomic instruction is not just about modifying a single address; it is also about **coordinating the memory visibility order of surrounding instructions**.

For example, when a thread acquires a lock, it must ensure that no memory read or write inside the critical section can be reordered *before* the lock acquisition!

To enforce memory ordering without requiring separate `fence` instructions, RISC-V `LR/SC` and `AMO` instructions accept two optional 1-bit memory ordering suffix flags: **Acquire (`.aq`)** and **Release (`.rl`)**.

```text
MEMORY ORDERING SUFFIX ANNOTATIONS

 Instruction Suffix Syntax │ Hardware Memory Ordering Rule Enforced
───────────────────────────┼───────────────────────────────────────────────────────────
 instruction               │ Relaxed Memory Order (No ordering barriers enforced).
 instruction.aq            │ Acquire Semantics: Prevents subsequent memory reads/writes
                           │ from being reordered BEFORE this atomic instruction!
 instruction.rl            │ Release Semantics: Prevents prior memory reads/writes
                           │ from being reordered AFTER this atomic instruction!
 instruction.aqrl          │ Sequential Consistency: Enforces full 2-way memory barrier!
```

```riscv
# SPINLOCK ACQUIRE WITH ACQUIRE SEMANTICS (.aq)
amoswap.w.aq x10, x12, (x20) # Prevents critical section loads from floating above lock!

# SPINLOCK RELEASE WITH RELEASE SEMANTICS (.rl)
amoswap.w.rl x0, x0, (x20)   # Prevents critical section stores from draining after unlock!
```

---

## Real-World Silicon Engineering: Strict Address Alignment and Lock-Free Data Structures

In commercial semiconductor design, implementing atomic memory instructions introduces strict physical layout and protocol constraints.

### 1. The Strict Address Alignment Invariant

In all modern CPU architectures (RISC-V, ARM, x86-64):
> **THE ATOMIC ALIGNMENT INVARIANT**: Every atomic instruction (`LR/SC` or `AMO`) MUST target a naturally aligned memory address! 32-bit atomics (`.w`) require $EA[1:0] == 00_2$ ($EA \pmod 4 == 0$). 64-bit atomics (`.d`) require $EA[2:0] == 000_2$ ($EA \pmod 8 == 0$).

#### Why Unaligned Atomics Are Physically Forbidden:
If an `amoadd.w` instruction targeted an unaligned address (e.g., $EA = \text{0x10002003}$), the 32-bit word would straddle **two separate 64-byte physical cache lines**!

Executing an atomic operation across two separate cache lines would require locking two cache banks simultaneously, creating multi-core interconnect deadlocks.

If a CPU executes an `AMO` or `LR/SC` instruction on an unaligned address:
* The hardware AGU instantly asserts a **Store/AMO Address Misaligned Exception Trap**!

---

### 2. Lock-Free Data Structures (Lock-Free Stack)

In high-performance database engines, atomic `LR/SC` primitives enable **Lock-Free Stacks** that allow hundreds of threads to push and pop nodes concurrently without ever stopping or waiting on a mutex lock:

```riscv
# LOCK-FREE STACK PUSH IN ASSEMBLY (x10 = new_node_ptr, x20 = stack_head_ptr)
push_retry:
    ld   x11, 0(x20)       # 1. Read current stack head pointer
    sd   x11, 8(x10)       # 2. Point new_node->next to current stack head
    lr.d x12, (x20)        # 3. Load-Reserved current stack head
    bne  x11, x12, push_retry # 4. If head changed since step 1, retry!
    sc.d x13, x10, (x20)   # 5. Store-Conditional: Point stack head to new_node
    bnez x13, push_retry   # 6. If SC failed, retry loop!
```

---

## Solved Industrial Engineering Exercise: `LR/SC` Reservation Set Tracking, `AMO` Execution, and Multi-Core Spinlock Contention Analysis

To consolidate your complete mastery of atomic memory operands, `LR/SC` hardware reservation set tracking, `AMO` near-memory execution, and acquire/release memory ordering, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the multi-core memory subsystem for a $3.2\text{ GHz}$ 64-bit processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The system consists of two CPU cores (Core 0 and Core 1) sharing access to a $32\text{-KB}$ L1 Data Cache ($64\text{-byte}$ lines) over a coherence bus.

```text
3.2 GHz DUAL-CORE PROCESSOR WITH ATOMIC MEMORY SUBSYSTEM

 Core 0 (3.2 GHz) ──► [ Reservation Unit 0 ] ──┐
                                               ├──► L1/L2 Cache Near-Memory ALU
 Core 1 (3.2 GHz) ──► [ Reservation Unit 1 ] ──┘    Hit = 1 Cycle, RFO = 24 Cycles
 Clock T = 312.5 ps   LR/SC Tracking Units
```

#### Hardware Memory System Specifications:
* L1 Data Cache Line Size: $64\text{ bytes}$.
* Memory address $A = \text{0x0000\_0000\_1000\_2000}$ holds a shared mutual exclusion spinlock variable (`lock_var`).
* Initial Memory Value at $A$: $\text{0x0000\_0000\_0000\_0000}$ (Un-locked / Free).
* L1 Cache Hit Latency: $1\text{ clock cycle}$ ($0.3125\text{ ns}$).
* Inter-Core Bus Invalidation / RFO Latency: $24\text{ clock cycles}$ ($7.50\text{ ns}$).

#### Workload Concurrent Execution Events:
At physical time $t = 0.0\text{ ns}$ (Clock Cycle 0), Core 0 and Core 1 attempt to acquire the lock simultaneously:

* **Core 0**: Executes `lr.w x10, (x20)` at Cycle 0 (where $x20 = \text{0x10002000}$).
* **Core 1**: Executes `lr.w x10, (x20)` at Cycle 1.
* **Core 0**: Executes `addi x11, x0, 1` followed by `sc.w x12, x11, (x20)` at Cycle 3 (attempting to claim lock).
* **Core 1**: Executes `addi x11, x0, 1` followed by `sc.w x12, x11, (x20)` at Cycle 5.

#### Your Objective

1. Trace the Reservation Set tracking state ($\text{Address}, \text{Valid\_Flag}$) for Core 0 and Core 1 across Cycles 0 through 6.
2. Determine whether Core 0's `sc.w` instruction succeeds ($x12 = 0$) or fails ($x12 \neq 0$), and show the updated value written to memory address $A$.
3. Determine whether Core 1's `sc.w` instruction succeeds or fails, explain why its reservation was broken, and trace its retry loop behavior.
4. Compare this `LR/SC` sequence against an equivalent single-instruction `amoswap.w.aq` atomic swap implementation:
   * Calculate total execution cycles and bus transaction counts for both approaches under high contention.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

---

#### Step 1: Trace `LR/SC` Execution and Reservation Tracking (Cycles 0 to 6)

Let us trace the reservation tracking state for Core 0 and Core 1:

##### Cycle 0 ($t = 0.0\text{ ns}$): Core 0 Executes `lr.w x10, (x20)`
1. Core 0 reads address `0x10002000` from L1 cache: Returns `x10 = 0` (Lock Free).
2. Core 0's hardware Reservation Unit sets:

$$\text{Reservation}_0 = \{ \text{Address} = \text{0x10002000}, \quad \text{Valid}_0 = 1 \}$$

##### Cycle 1 ($t = 0.3125\text{ ns}$): Core 1 Executes `lr.w x10, (x20)`
1. Core 1 reads address `0x10002000` from L1 cache: Returns `x10 = 0` (Lock Free).
2. Core 1's hardware Reservation Unit sets:

$$\text{Reservation}_1 = \{ \text{Address} = \text{0x10002000}, \quad \text{Valid}_1 = 1 \}$$

Both cores currently hold valid hardware reservations on address `0x10002000`!

---

##### Cycle 3 ($t = 0.9375\text{ ns}$): Core 0 Executes `sc.w x12, x11, (x20)` ($x11 = 1$)
1. Core 0's Store-Conditional unit inspects $\text{Reservation}_0$:
   * $\text{Address} == \text{0x10002000}$ AND $\text{Valid}_0 == 1$ ($\mathbf{\text{RESERVATION INTACT!}}$).
2. **Core 0 Write Succeeds**:
   * Memory address `0x10002000` is updated with value $1$ (`x11`).
   * Destination register $x12$ is set to **`0` (SUCCESS!)**.
   * Core 0 clears its reservation ($\text{Valid}_0 \Leftarrow 0$).
3. **Coherence Bus Invalidation**: Core 0 broadcasts a bus invalidation for address `0x10002000`.
4. **Core 1 Reservation Invalidation**:
   * Core 1's bus snooper sees the write to `0x10002000` by Core 0!
   * Core 1's Reservation Unit **forcibly clears Core 1's reservation bit**:

$$\mathbf{\text{Valid}_1 \Leftarrow 0 \quad (\text{CORE 1 RESERVED SEALS BROKEN!})}$$

```text
RESERVATION SET STATE TRACE

 Cycle 0: Core 0 executes lr.w ──► Valid_0 = 1 (Addr 0x10002000)
 Cycle 1: Core 1 executes lr.w ──► Valid_1 = 1 (Addr 0x10002000)
 Cycle 3: Core 0 executes sc.w ──► Reservation_0 Intact! Write 1 to 0x10002000! Set x12 = 0 (SUCCESS!)
                                   Bus Invalidation sent ──► Valid_1 <= 0 (BROKEN!)
```

---

##### Cycle 5 ($t = 1.5625\text{ ns}$): Core 1 Executes `sc.w x12, x11, (x20)` ($x11 = 1$)
1. Core 1's Store-Conditional unit inspects $\text{Reservation}_1$:
   * $\text{Valid}_1 == 0$ ($\mathbf{\text{RESERVATION BROKEN BY CORE 0!}}$).
2. **Core 1 Write ABORTED**:
   * Memory address `0x10002000` is **NOT MODIFIED** (remains $1$).
   * Destination register $x12$ is set to **`1` (FAILURE!)**.
3. **Retry Branch Triggered**: Core 1 evaluates `bnez x12, retry_loop` ($1 \neq 0$). Core 1 jumps back to retry `lr.w`!

##### Summary of Results:
* **Core 0**: Claimed the lock successfully ($x12 = 0$). Memory `0x10002000` = $1$.
* **Core 1**: Failed to claim the lock ($x12 = 1$). Retries loop. Mutual exclusion preserved with $100\%$ precision!

---

#### Step 2: Compare `LR/SC` vs `amoswap.w.aq` Atomic Swap

Now, let us evaluate the same lock acquisition using the single-instruction **`amoswap.w.aq`** atomic swap:

```riscv
# LOCK ACQUISITION USING ATOMIC SWAP
addi x12, x0, 1          # x12 <= 1 (Locked state payload)
spin_loop:
    amoswap.w.aq x10, x12, (x20) # Atomically swap x12 (1) with memory[x20], return old value in x10
    bnez         x10, spin_loop  # If old value was 1 (already locked), retry loop!
```

Let's trace `amoswap.w.aq` execution across Core 0 and Core 1:

1. **Core 0 Executes `amoswap.w.aq x10, x12, (x20)`**:
   * Near-memory cache ALU locks address `0x10002000` locally.
   * Reads old value ($0$), writes new value ($1$).
   * Returns old value $0$ to Core 0's register $x10$.
   * Core 0 checks `bnez x10` ($0 == 0 \implies$ **Lock Acquired in 1 Instruction!**).
2. **Core 1 Executes `amoswap.w.aq x10, x12, (x20)`**:
   * Near-memory cache ALU locks address `0x10002000` locally.
   * Reads old value ($1$), writes new value ($1$).
   * Returns old value $1$ to Core 1's register $x10$.
   * Core 1 checks `bnez x10` ($1 \neq 0 \implies$ **Lock Busy, Retries Spin Loop**).

```text
LR/SC VS AMOSWAP PERFORMANCE COMPARISON

 Metric                     │ Load-Reserved / Store-Conditional │ Atomic Swap (amoswap.w.aq)
────────────────────────────┼───────────────────────────────────┼───────────────────────────────
 Instructions per Try       │ 4 Instructions (lr, addi, sc, bnez)│ 2 Instructions (amoswap, bnez)
 Bus Invalidation Spikes    │ Bus invalidation on SC success  │ Interconnect packet per swap
 Retries Under Contention   │ Higher (if reservation broken)  │ Zero (Guaranteed 1-pass execution)
 Code Footprint             │ 16 Bytes                        │ 8 Bytes (50% Code Savings!)
```

##### Engineering Conclusion:
Using `amoswap.w.aq` reduced the lock acquisition code from $16\text{ bytes}$ down to **$8\text{ bytes}$** ($50\%$ code size savings) and eliminated reservation-loss retries, delivering higher execution throughput under heavy multi-core lock contention!

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against atomic hardware principles:

1. **SWMR Invariant Verification**:
   * Core 0 modified memory `0x10002000` at Cycle 3.
   * Core 1's reservation was invalidated at Cycle 3 via bus snooping before Core 1 could execute `sc.w`.
   * Core 1's write was blocked ($x12 = 1$), proving $100\%$ mutual exclusion safety!
2. **Alignment Safety Check**:
   * Target address = `0x10002000` ($0x10002000 \pmod 4 == 0$).
   * Address is $100\%$ naturally 4-byte aligned, satisfying atomic hardware alignment requirements.
3. **Acquire Semantics Check**:
   * `amoswap.w.aq` used the `.aq` (Acquire) suffix, ensuring that no memory load/store instructions inside Core 0's critical section can be reordered before the lock acquisition point.

All reservation set state transitions, `LR/SC` broken seal invalidations, `AMO` near-memory swap operations, and mutual exclusion safety proofs evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Load-Reserved / Store-Conditional (`LR/SC`)**: An instruction pair that provides fine-grained, optimistic atomic Read-Modify-Write memory execution by registering a hardware reservation set on a memory line during `LR`, and permitting `SC` to write back ONLY if the reservation set has not been invalidated by a remote core.
* **Atomic Memory Operation (`AMO`)**: A single, self-contained instruction (`amoadd`, `amoswap`, `amomax`, `amoor`) that performs an indivisible Read-Modify-Write operation directly at the Level 1/Level 2 Cache or Near-Memory ALU boundary, returning the original memory value while updating the line in a single pass without loop retries.
