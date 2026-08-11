content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/01-power-on-reset-execution/01-power-on-reset-sequence/04-cache-as-ram-staging.md
# 04-cache-as-ram-staging — Cache-as-RAM (CAR) Staging and Temporary Stack Allocation

## 1. The Stack-Less Subroutine Paradox

When a central processing unit (CPU) executes early platform firmware from non-volatile Boot ROM immediately following a hardware reset, the execution environment is severely constrained by the absence of a memory stack. In high-level programming languages such as C, as well as in structured assembly programming, the call stack is the fundamental runtime mechanism used to store local variables, pass subroutine arguments, and preserve return addresses during nested function calls.

Without a call stack, a processor cannot execute standard C functions or complex assembly subroutines. 

Every time a CPU core executes a subroutine call instruction (such as `CALL` in x86, `BL` in ARM, or `JAL` in RISC-V), the CPU hardware must save the address of the next instruction (the return address) so that execution can return smoothly once the subroutine finishes. 

If the processor has no stack memory available:
* The return address must be saved in a single, dedicated general-purpose link register (such as `LR` / `x30` in ARM or `ra` / `x1` in RISC-V).
* If Function A calls Function B, Function B's return address will overwrite Function A's return address inside that single link register. When Function B finishes and returns to Function A, Function A no longer knows where to return when it completes! 

The CPU enters an infinite loop or jumps to a random memory location, triggering an immediate execution crash.

```text
THE NESTED CALL COLLISION WITHOUT A STACK

 Function A Execution
 ┌─────────────────────────────────────────────────────────────┐
 │ CALL Function B  ──► Saves Return Address A in Link Reg LR  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Function B Execution
 ┌─────────────────────────────────────────────────────────────┐
 │ CALL Function C  ──► OVERWRITES Link Reg LR with Address B! │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Function B completes ──► Jumps to LR (Address B)
 Function A completes ──► Jumps to LR (Address B AGAIN! Infinite Loop!)
```

To avoid overwriting return addresses in link registers without a stack, firmware engineers would be forced to write early boot code using flat, un-nested assembly code, manually juggling a handful of general-purpose CPU registers (`R0-R12` or `x1-x31`) for all calculations.

However, early platform initialization is **not** simple. 

Before main system memory (Dynamic Random-Access Memory, or DRAM) can be used, the firmware must execute highly complex algorithms:
* Parsing binary Serial Presence Detect (SPD) data structures read over $I^2C$ from memory modules.
* Evaluating multi-variable mathematical polynomials to calculate $t_{\text{RCD}}$, $t_{\text{RP}}$, and $t_{\text{CAS}}$ timing matrix parameters.
* Executing iterative signal calibration loops for DDR write leveling and read DQS Data Eye centering.

Writing complex memory calibration algorithms entirely in flat, un-nested assembly without local variables, arrays, or function calls is nearly impossible. It leads to unmaintainable firmware and fragile boot logic.

Why can we not simply assign the Stack Pointer register (`SP`) to point to physical DRAM address `0x0001_0000`?

Because physical DRAM is **completely dead and un-configured**! 

If the CPU executes a `PUSH` or `STORE` instruction targeting an un-configured DRAM address:
* The memory controller has not calibrated its delay lines or enabled row buffer refresh cycles.
* The write payload is dropped on the floor or causes an electrical bus lockup.
* The CPU instruction pipeline freezes permanently, waiting for a memory write acknowledgment that will never arrive.

We face a critical architectural dilemma: **Early boot firmware desperately requires a writable memory stack to execute complex memory training algorithms in C, but main system DRAM cannot provide that stack because DRAM itself is un-configured.**

To solve this paradox and provide a writable memory stack before DRAM exists, computer architectures employ **Cache-as-RAM (CAR) Staging** and **Temporary Stack Allocation**.

---

## 2. The Architect's Wrist Whiteboard on the Muddy Construction Site

To build an intuitive, crystal-clear mental model of Cache-as-RAM staging, Write-Back cache line allocations, and temporary stack migration before inspecting x86 MTRR bitfields, ARM cache control registers, and MESI state transitions, let us consider an everyday analogy: **The Architect Writing Notes on a Muddy Construction Site**.

Imagine a structural architect (**The CPU Execution Core**) working on a massive, unbuilt construction site (**The Un-Configured System DRAM**).

```text
THE MUDDY CONSTRUCTION SITE ANALOGY

 Architect (CPU Execution Core)              Muddy Site (Un-Configured DRAM)
 ┌───────────────────────────┐               ┌───────────────────────────┐
 │ Wants to calculate        │               │ Mud Pit                   │
 │ complex building ratios   │               │ (Cannot hold paper notes!)│
 └─────────────┬─────────────┘               └───────────────────────────┘
               │
               ▼ Uses Wrist Whiteboard
 ┌──────────────────────────────────────────────────────────────┐
 │ L1/L2 Cache Scratchpad (Cache-as-RAM / Temporary Stack)      │
 │ Writes & erases local notes directly on wrist!               │
 └──────────────────────────────────────────────────────────────┘
```

The architect needs to perform complex mathematical calculations (**DRAM Calibration Algorithms**) to determine how deep to dig the building's foundation. To do these calculations, the architect needs a notepad to write down intermediate numbers, cross out mistakes, and track multi-step equations (**A Call Stack for Subroutine Variables**).

Look at the physical dilemma facing the architect:
* The construction site is currently just an ankle-deep pit of wet, muddy water (**Un-configured DRAM**).
* If the architect tries to drop a piece of paper onto the ground to write notes, the paper sinks into the mud, gets destroyed, and disappears forever (**Dropped Memory Writes to Dead DRAM**).
* The architect cannot write notes on the muddy ground until the concrete floor is poured and cured, but cannot pour the concrete floor without first calculating the equations on a notepad!

To solve this problem, the architect straps a small, waterproof **Plastic Wrist Whiteboard (The CPU's Internal L1 Data Cache)** onto their forearm!

Let us observe how the architect uses the wrist whiteboard:

1. **The Scratchpad Setup**: The architect wipes the wrist whiteboard clean with a damp cloth (**Cache Invalidation**).
2. **Locking Out External Paper**: The architect clips a protective cover over the whiteboard marker tray (**Configuring Cache-as-RAM Mode**), ensuring that every number written on the whiteboard stays strictly on the wrist surface and is **NEVER copied down to the muddy ground**!
3. **Complex Calculation Execution**: For the next two hours, the architect executes complex multi-step math directly on their wrist whiteboard:
   * Writes intermediate numbers in Slot 1 (**Pushing Local Variables to the CAR Stack**).
   * Crosses out numbers and overwrites them (**Stack Frame Allocation & Function Returns**).
   * Executes nested mathematical subroutines smoothly without dropping a single number in the mud!
4. **Pouring the Concrete Floor**: Using the completed calculations from their wrist whiteboard, the construction crew pours and cures the solid concrete foundation (**Initializes and Calibrates Physical DRAM Memory**).
5. **Migrating the Notes**: Once the concrete floor is cured and dry, the architect copies the final structural records from their wrist whiteboard onto an official paper blueprint and files it inside a cabinet on the concrete floor (**Migrating the Stack from CAR to Physical DRAM**).
6. **Releasing the Whiteboard**: The architect removes the protective cover from the whiteboard (**Teardown of CAR Mode**). The wrist whiteboard returns to its normal job as a standard temporary scratchpad!

This wrist whiteboard system is the exact physical analogue of **Cache-as-RAM (CAR) Staging and Temporary Stack Allocation**:

* The architect is the **CPU Execution Core**.
* The ankle-deep mud pit is **Un-configured System DRAM**.
* The plastic wrist whiteboard is the **On-Chip Level 1 Data Cache (L1D SRAM)**.
* Writing notes on the wrist whiteboard is **Executing Memory Writes (`PUSH` / `STORE`) inside Cache-as-RAM**.
* Clipping the protective cover is **Configuring No-Fill Write-Back Memory Types (MTRRs)**.
* Pouring the concrete floor is **DRAM Training and Controller Calibration**.
* Copying notes to the file cabinet is **Migrating the Stack Frame from CAR to DRAM**.
* Unclipping the whiteboard cover is **Tearing Down CAR Mode to Restore Normal Caching**.

---

## 3. Cache-as-RAM (CAR) Mechanics and MTRR Configuration

Now that we possess a clear intuitive mental model of the wrist whiteboard on a muddy construction site, let us examine the formal, rigorous engineering mechanics of **Cache-as-RAM (CAR) Staging**.

Modern processor cores contain on-chip Level 1 Data Caches (L1D) and Level 2 Caches (L2) built using high-speed Static RAM (SRAM) transistors. 

Unlike DRAM, SRAM transistors do not require complex refresh cycles, impedance calibration, or clock-to-strobe PHY leveling. SRAM works immediately when powered on.

```text
SRAM CACHE CELL vs DRAM MEMORY CELL

 SRAM 6-Transistor Cell (L1/L2 Cache)     DRAM 1-Transistor 1-Capacitor Cell
 ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
 │ Cross-Coupled Inverters           │    │ Storage Capacitor + Access NFET   │
 │ Works IMMEDIATELY upon Power-On!  │    │ Requires Complex PHY Training!    │
 └───────────────────────────────────┘    └───────────────────────────────────┘
  (Used by Cache-as-RAM for Stack)          (Unusable until Firmware Calibrated)
```

However, under normal operation, an L1 Data Cache operates strictly as a **hardware-managed transparent buffer** for main system DRAM. 

When a processor executes a memory write instruction (`STORE`), the L1 cache checks if the target memory line is present:
* If the line is missing (**Cache Miss**), the cache controller dispatches a memory read transaction across the system bus to fetch the 64-byte line from external DRAM before writing the new data.

If the cache controller attempts to fetch a line from external DRAM while DRAM is un-configured, the bus fetch will hang, and the system will crash!

To use the L1/L2 SRAM cache as a standalone, writable memory block without triggering external DRAM bus transactions, early boot firmware configures the processor into **Cache-as-RAM (CAR) Mode**.

---

### The MESI Protocol in Cache-as-RAM Mode

To understand how CAR mode prevents external DRAM transactions, we must examine the internal state machine that governs cache lines: **The MESI Protocol (Modified, Exclusive, Shared, Invalid)**.

```text
MESI CACHE LINE STATE SUMMARY

 State     │ Mnemonic  │ Meaning in Normal Caching     │ Meaning in Cache-as-RAM Mode
───────────┼───────────┼───────────────────────────────┼─────────────────────────────────────────────
 Modified  │     M     │ Line is dirty; modified in    │ CAR STACK DATA IS HELD HERE!
           │           │ cache, not written to DRAM.   │ Must NEVER be evicted to DRAM!
───────────┼───────────┼───────────────────────────────┼─────────────────────────────────────────────
 Exclusive │     E     │ Line is clean; held in this   │ Line pre-touched and ready for
           │           │ cache only, matches DRAM.     │ CAR stack write operations.
───────────┼───────────┼───────────────────────────────┼─────────────────────────────────────────────
 Shared    │     S     │ Line is clean; shared across  │ Unused in CAR mode.
           │           │ multiple CPU core caches.     │
───────────┼───────────┼───────────────────────────────┼─────────────────────────────────────────────
 Invalid   │     I     │ Line is empty or stale.       │ Initial state of all CAR cache lines
           │           │ Access triggers DRAM fetch!   │ prior to pre-touching.
```

In standard operation, when a CPU core writes to a cache line in **Write-Back (WB)** mode:
1. The line transitions to the **Modified ($M$) State**.
2. The modified data payload sits inside the on-chip SRAM cache array.
3. The cache controller does **not** write the payload to DRAM immediately. The data lives exclusively in SRAM!

CAR mode exploits this exact property of the Modified ($M$) state: **If we can force a range of physical addresses to be loaded into the L1 cache in the Modified or Exclusive state, all subsequent `PUSH`, `POP`, `LOAD`, and `STORE` operations targeting those addresses will hit the L1 SRAM cache locally, without ever generating external DRAM bus transactions!**

---

### The 6-Step Hardware CAR Staging Algorithm

To establish a functional Cache-as-RAM stack on x86, ARM, or RISC-V processors, early boot firmware executes the **6-Step CAR Staging Algorithm**:

```text
THE 6-STEP CACHE-AS-RAM (CAR) STAGING ALGORITHM

 Step 1: Invalidate Caches      ──► Execute INVD / CBO.INVAL (Clear all tags to Invalid 'I')
 Step 2: Configure Memory Types ──► Set target address window (e.g. 1MB) to Write-Back (WB)
 Step 3: Enable Caching Engine  ──► Clear CR0.CD = 0, CR0.NW = 0 (Activate L1/L2 Cache)
 Step 4: Pre-Touch Cache Lines  ──► Read/Write dummy words across CAR window to force 'M' state
 Step 5: Lock / Disable No-Fill ──► Set CR0.CD = 1 OR disable fills (Prevent DRAM miss fills!)
 Step 6: Initialize Stack Ptr  ──► Set SP = Top_of_CAR_Window (C Stack Active!)
```

Let us dissect each step of the CAR staging sequence in complete technical detail:

#### Step 1: Cache Invalidation
Firmware executes a global cache invalidation instruction (such as `INVD` in x86 or `CBO.INVAL` in RISC-V). 

This forces every tag entry in the L1 Data Cache and L2 Cache to the **Invalid ($I$) State**, clearing any garbage tags that powered up in random states.

#### Step 2: Memory Type Range Register (MTRR) Configuration
The CPU must be informed that a specific physical address window (for example, `0xFEF0_0000` through `0xFEFF_FFFF`, a $1\text{-Megabyte}$ window) should be treated as **Write-Back (WB)** memory.

On x86 processors, firmware programs the variable **Memory Type Range Registers (MTRRs)** via Model-Specific Registers (MSRs):

$$\text{IA32\_MTRR\_PHYSBASE0} \Leftarrow \text{0xFEF0\_0000} \quad \mathbf{\mid} \quad \text{Type\_WB} \quad (\text{Type } 06_{16} = \text{Write-Back})$$

$$\text{IA32\_MTRR\_PHYSMASK0} \Leftarrow \text{0xFFF0\_0000} \quad \mathbf{\mid} \quad \text{Valid\_Bit} \quad (\text{Valid } = 1)$$

```text
IA32_MTRR_PHYSBASE AND PHYSMASK REGISTER BITFIELDS

 IA32_MTRR_PHYSBASE0 Register (MSR 0x200)
 Bit 63                             Bit 12 Bit 11 Bit 8 Bit 7        Bit 0
 ┌────────────────────────────────────────┬───────────┬──────────────┐
 │ Base Physical Frame Address [51:12]    │ Reserved  │ Type (0x06)  │
 └────────────────────────────────────────┴───────────┴──────────────┘
  (Sets starting physical address of CAR window to 0xFEF0_0000)

 IA32_MTRR_PHYSMASK0 Register (MSR 0x201)
 Bit 63                             Bit 12 Bit 11 Bit 10         Bit 0
 ┌────────────────────────────────────────┬───────────┬──────────────┐
 │ Address Mask Bits [51:12]              │ Reserved  │ Valid (V=1)  │
 └────────────────────────────────────────┴───────────┴──────────────┘
  (Sets size mask: 0xFFF0_0000 defines a 1 MB CAR window)
```

Where:
* `Type_WB` ($06_{16}$) configures the memory region for Write-Back caching, enabling write allocation.
* `Valid_Bit` (Bit 11) enables the MTRR entry in hardware.

#### Step 3: Enable the Caching Engine
Firmware updates Control Register $CR0$ on x86 (or System Control Register `SCTLR` on ARM) to enable the cache controller:
* Clear **Cache Disable (`CD`, Bit 30 of $CR0$)** to $0$.
* Clear **Not Write-through (`NW`, Bit 29 of $CR0$)** to $0$.

$$\text{CR0} \Leftarrow \text{CR0} \quad \mathbf{\&} \quad \sim(\text{CR0.CD} \quad \mathbf{\mid} \quad \text{CR0.NW})$$

#### Step 4: Pre-Touch Cache Lines (Allocating Lines into Modified $M$ State)
Setting the MTRR to Write-Back is not enough. If the CPU performs a write to an address that is not yet in the cache, a Write-Allocate cache controller will attempt to read the line from DRAM first!

To prevent the cache from attempting a DRAM read on the first write, firmware executes a **Pre-Touch Loop** in assembly.

The CPU steps through the CAR address window (`0xFEF0_0000` to `0xFEFF_FFFF`) in increments of one cache line size ($64\text{ bytes}$), executing a dummy read or zero-write instruction to every line:

```text
PRE-TOUCH ASSEMBLY LOOP (x86 ASSEMBLY)

    mov edx, 0xFEF00000       ; Load CAR Base Address
    mov ecx, 0x00100000       ; Load CAR Size (1 MB = 16,384 Cache Lines)

.pretouch_loop:
    mov eax, [edx]            ; Read dummy word to force line fill into L1
    mov [edx], eax            ; Write back dummy word to force line into 'M' State
    add edx, 64               ; Advance to next 64-byte cache line
    sub ecx, 64               ; Decrement remaining byte count
    jnz .pretouch_loop        ; Loop until all 16,384 lines are in 'M' State!
```

What did this pre-touch loop achieve?
Every single $64\text{-byte}$ cache line within the $1\text{-MB}$ CAR window is now forcibly loaded into the L1/L2 SRAM cache array in the **Modified ($M$) State**!

#### Step 5: Lock Cache / Disable Line Fills
Once all cache lines in the CAR window are loaded into the L1/L2 cache in the Modified state, firmware sets the **Cache Disable bit (`CD = 1` in $CR0$)** or sets the cache controller to **No-Fill Mode**:

$$\text{CR0.CD} \Leftarrow 1$$

What happens when `CD = 1` while lines are in the Modified state?
* **Cache Hits Work Normally**: Any read or write targeting an address already inside the cache completes in $1\text{ clock cycle}$ directly against the SRAM array!
* **Cache Misses Are Blocked**: The cache controller is strictly forbidden from dispatching new line fill requests across the external memory bus!

#### Step 6: Initialize the Stack Pointer (`SP`)
Finally, firmware initializes the CPU's Stack Pointer register (`ESP` / `R13` / `sp`) to point to the top address of the CAR window:

$$\text{ESP} \Leftarrow \text{0xFEFF\_FFFC} \quad (\text{Top of 1 MB CAR Stack Window})$$

```text
CAR STACK MEMORY LAYOUT AFTER INITIALIZATION

 Address Space (0xFEF0_0000 - 0xFEFF_FFFF)
 ┌─────────────────────────────────────────┐ ◄── 0xFEFF_FFFF (Top of CAR Window)
 │ [ STACK GROWTH DIRECTION: DOWNWARD ▼ ]  │ ◄── ESP = 0xFEFF_FFFC (Stack Pointer!)
 │ Stack Frame 0 (Early C Function Arguments)
 │ Stack Frame 1 (Local Variables)         │
 ├─────────────────────────────────────────┤
 │     ░░░ Unused CAR SRAM Space ░░░       │
 ├─────────────────────────────────────────┤
 │ Global Variables (.data / .bss in CAR)  │
 └─────────────────────────────────────────┘ ◄── 0xFEF0_0000 (Base of CAR Window)
```

The CAR staging sequence is complete! 

The CPU now possesses a $100\%$ functional, high-speed, $1\text{-MB}$ writable SRAM memory stack. 

From this exact microsecond forward, early boot firmware can jump into compiled C code, execute complex nested subroutines, allocate local variables, and run DRAM calibration algorithms with full software flexibility!

---

## 4. Engineering Realities: The Eviction Catastrophe and CAR Teardown

In commercial platform engineering, Cache-as-RAM mode provides immense software flexibility, but it introduces severe physical risks if the cache controller or memory layout is mis-configured.

### 1. The Cache Eviction Catastrophe (CAR Overwrite Overflow)

What happens if early C boot code allocates too many local variables, causing the call stack to grow larger than the physical capacity of the CAR window?

Suppose the L1/L2 SRAM cache allocated for CAR has a maximum physical capacity of **$1\text{ Megabyte}$ ($1,048,576\text{ bytes}$)**.

If the firmware stack grows to $1,048,577\text{ bytes}$, a new stack `PUSH` instruction targets an address that is not in the cache.

The cache controller experiences a **Cache Miss under `CD = 1` No-Fill Mode**:

```text
CAR EVICTION CATASTROPHE DATAPATH

 CPU Stack PUSH Instruction (Stack Overflow Beyond 1 MB CAR Boundary!)
                       │
                       ▼
 L1 Data Cache Miss -> Cache Array Full! Must Evict an 'M' State Line!
                       │
                       ▼
 Cache Controller attempts Write-Back Eviction to Physical Address 0xFEF0_0000!
 Dispatches Memory Write Transaction across System Bus to DRAM...
                       │
                       ▼
 DRAM IS OFFLINE AND UN-CONFIGURED!
 System Bus Hangs Indefinitely / Triggers Un-Recoverable Bus Error! (CRASH!)
```

Trace the catastrophic hardware failure:
1. The cache array is $100\%$ full of Modified ($M$) lines.
2. To make room for the new line, the pseudo-LRU replacement state machine selects an existing Modified line (e.g., address `0xFEF0_0000`) for **Eviction**.
3. Because the line is in the Modified state, the cache controller **MUST write the line's contents back to main DRAM memory before overwriting it**!
4. The cache controller dispatches a 64-byte write transaction across the system bus targeting DRAM address `0xFEF0_0000`.
5. **DRAM IS DEAD!** Main system RAM is not yet trained. The write transaction hangs on the bus, waiting for a memory acknowledgment that will never arrive.
6. The entire system freezes in a **Hardware System Lockup**.

#### The Hardware Guard Rule:
Firmware developers must strictly bound stack usage during CAR execution. The compiler and linker script must enforce a hard upper limit on stack size ($\text{Stack}_{\text{max}} \le 0.80 \times \text{CAR}_{\text{size}}$) to prevent stack overflows from triggering line evictions.

---

### 2. The CAR-to-DRAM Context Migration and Teardown Sequence

Once early boot code successfully uses the CAR stack to execute DRAM training algorithms and physical RAM is $100\%$ calibrated, initialized, and validated, the temporary CAR environment is no longer needed.

However, the CPU cannot simply turn off CAR mode or clear the cache!

Why? Because the active execution context—including the current C function's return address, CPU stack frame, and global variables—is **sitting inside the CAR cache lines in the Modified state**!

If the cache were invalidated (`INVD`) before migrating data, **the active stack would be instantly erased**, and the CPU would crash the moment the current function attempted to execute `RET` (return)!

To safely transition execution from CAR to physical DRAM, firmware executes **The CAR Teardown and Migration Protocol**:

```text
CAR-TO-DRAM CONTEXT MIGRATION TIMELINE

 CAR State Active      ──► DRAM Training completes successfully!
                           Physical DRAM is online at address 0x0010_0000.
                           │
                           ▼
 Stack Migration       ──► Copy active stack frame from CAR (0xFEF0_0000)
                           to physical DRAM (0x0010_0000) using memcpy().
                           │
                           ▼
 Update Stack Pointer  ──► ESP <= New_DRAM_Stack_Pointer (0x001F_FFFC)
                           (Execution stack now lives in physical DRAM!)
                           │
                           ▼
 Write-Back Invalidate ──► Execute WBINVD instruction.
                           Flushes dirty CAR lines & invalidates tags.
                           │
                           ▼
 Re-enable Normal Cache──► Program MTRRs to map normal DRAM address space.
                           Clear CR0.CD = 0. Normal L1/L2/L3 caching active!
```

#### Step-by-Step CAR Teardown Execution:

1. **Allocate DRAM Stack Window**: The initialized DRAM controller maps physical RAM. Firmware selects a permanent stack region in DRAM (e.g., `0x0010_0000` to `0x001F_FFFF`).
2. **Copy Stack Payload**: Firmware executes a memory copy routine (`memcpy`), copying the active stack contents from the CAR window (`0xFEF0_0000`) to the new DRAM stack window (`0x0010_0000`).
3. **Update Stack Pointer Register**: Firmware updates the Stack Pointer register (`ESP` / `R13` / `sp`) to point to the new stack address inside physical DRAM:
   $$\text{ESP} \Leftarrow \text{ESP} - \text{0xFEF0\_0000} + \text{0x0010\_0000}$$
   The active stack now resides in real physical DRAM!
4. **Write-Back and Invalidate (`WBINVD`)**:
   Firmware executes a **Write-Back and Invalidate** instruction (`WBINVD` in x86 or `CBO.FLUSH` in RISC-V).
   * Unlike `INVD` (which discards data), `WBINVD` writes any dirty Modified lines back to DRAM before clearing the cache tags!
   * Any remaining data in CAR is safely committed to DRAM.
5. **Re-program MTRRs for Standard DRAM Caching**:
   Firmware re-programs MTRRs to map physical DRAM ranges (`0x0000_0000` to top of RAM) as Write-Back memory, and clears $CR0.CD = 0$.
6. **Teardown Complete**: The L1/L2 cache returns to its normal role as a high-speed transparent buffer for main DRAM!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Cache-as-RAM staging, MTRR base/mask calculations, stack frame capacity limits, and CAR teardown memory copy latency, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a senior firmware architecture engineer configuring the Cache-as-RAM (CAR) staging environment for a $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor possesses an on-chip Level 1 Data Cache (L1D) with a total physical capacity of **$64\text{ Kilobytes}$ ($65,536\text{ bytes}$)**, structured with a cache line size of **$64\text{ bytes}$**.

```text
CAR STAGING HARDWARE PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_cpu                     │ 3.2 GHz (3,200 MHz)   │ Core CPU execution clock frequency
 L1D_Capacity              │ 64 Kilobytes (64 KB)  │ Total physical capacity of L1 Data Cache
 Line_Size                 │ 64 Bytes              │ Size of 1 L1 cache line
 CAR_Base_Addr             │ 0xFEE0_0000           │ Desired physical base address for CAR window
 CAR_Target_Size           │ 32 Kilobytes (32 KB)  │ Target allocated CAR staging window size
 T_dram_write              │ 60.0 Nanoseconds      │ DRAM memory write cycle latency post-training
```

#### Hardware Memory Type Range Register (MTRR) Mask Formula:
In x86 32-bit/64-bit architecture, an MTRR mask register `PHYSMASK` defines a power-of-two memory window size $S_{\text{window}}$ using bitwise address masking:

$$\text{PHYSMASK} = \sim(S_{\text{window}} - 1) \quad \mathbf{\&} \quad \text{0x000F\_FFFF\_FFFF\_F000}$$

Where:
* $S_{\text{window}}$ is the size of the desired memory region in bytes (must be a power of two).
* `PHYSMASK` is the 64-bit MSR value written to `IA32_MTRR_PHYSMASK0`.

---

### The Hardware Execution Tasks:

1. Calculate the exact 64-bit hexadecimal value to write into `IA32_MTRR_PHYSBASE0` and `IA32_MTRR_PHYSMASK0` to establish a $32\text{-KB}$ CAR window starting at base address `0xFEE0_0000` with Write-Back type ($06_{16}$).
2. Calculate the number of $64\text{-byte}$ cache lines contained within the $32\text{-KB}$ CAR window, and compute the exact number of CPU clock cycles required to execute the assembly pre-touch loop (assuming 4 CPU clock cycles per cache line pre-touch iteration).
3. Determine the maximum allowable C call-stack depth (in bytes and nested function frames) assuming each C function frame consumes $128\text{ bytes}$ of stack space, and enforcing an $80\%$ maximum safety threshold to prevent CAR eviction lockups.
4. Calculate the physical time duration (in microseconds and CPU clock cycles) required during CAR teardown to execute a 32-KB `memcpy` operation migrating the active stack from CAR SRAM to physical DRAM at a DRAM write bandwidth of $12.8\text{ GB/sec}$.

---

### Step-by-Step Derivation

#### Step 1: Calculate MTRR Base and Mask Register Values

Target CAR Base Address $= \text{0xFEE0\_0000}$. Target Size $S_{\text{window}} = 32\text{ KB} = 32,768\text{ bytes} = \text{0x0000\_8000}$.

##### 1. Calculate `IA32_MTRR_PHYSBASE0` Register Value:
The base register combines the physical base address with the Write-Back memory type ($06_{16}$ in bits $[7:0]$):

$$\text{PHYSBASE0} = \text{0x0000\_0000\_FEE0\_0000} \quad \mathbf{\mid} \quad \text{0x06}$$

$$\mathbf{\text{PHYSBASE0} = \text{0x0000\_0000\_FEE0\_0006}}$$

##### 2. Calculate `IA32_MTRR_PHYSMASK0` Register Value:
Using the MTRR mask formula for $S_{\text{window}} = 32,768\text{ bytes}$ ($\text{0x8000}$):

$$S_{\text{window}} - 1 = 32,768 - 1 = 32,767_{10} = \text{0x0000\_7FFF}$$

$$\sim(S_{\text{window}} - 1) = \sim(\text{0x0000\_0000\_0000\_7FFF}) = \text{0xFFFF\_FFFF\_FFFF\_8000}$$

Masking out reserved bits and setting the Valid Bit (Bit 11 $= \text{0x800}$):

$$\text{PHYSMASK0} = (\text{0xFFFF\_FFFF\_FFFF\_8000} \quad \mathbf{\&} \quad \text{0x000F\_FFFF\_FFFF\_F000}) \quad \mathbf{\mid} \quad \text{0x800}$$

$$\mathbf{\text{PHYSMASK0} = \text{0x000F\_FFFF\_FFFF\_8800}}$$

```text
MSR REGISTER VALUES FOR 32 KB CAR WINDOW AT 0xFEE0_0000

 MSR Register           │ MSR Address │ Hexadecimal Value Written
────────────────────────┼─────────────┼─────────────────────────────────────────
 IA32_MTRR_PHYSBASE0    │ 0x200       │ 0x0000_0000_FEE0_0006  (Base + Type WB)
 IA32_MTRR_PHYSMASK0    │ 0x201       │ 0x000F_FFFF_FFFF_8800  (32KB Mask + Valid)
```

---

#### Step 2: Calculate Pre-Touch Loop Iterations and Execution Latency

The CAR window size is $32\text{ KB} = 32,768\text{ bytes}$. The cache line size is $64\text{ bytes}$.

##### 1. Calculate Number of Cache Lines ($N_{\text{lines}}$):

$$N_{\text{lines}} = \frac{\text{CAR\_Target\_Size}}{\text{Line\_Size}} = \frac{32,768\text{ bytes}}{64\text{ bytes/line}} = \mathbf{512 \text{ Cache Lines}}$$

##### 2. Calculate Pre-Touch Loop CPU Clock Cycles ($C_{\text{pretouch}}$):
Each line pre-touch iteration takes $4\text{ CPU clock cycles}$:

$$C_{\text{pretouch}} = N_{\text{lines}} \times 4\text{ cycles/line} = 512 \times 4 = \mathbf{2,048 \text{ CPU Clock Cycles}}$$

##### 3. Calculate Physical Pre-Touch Duration ($t_{\text{pretouch}}$) at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$t_{\text{pretouch}} = 2,048 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{640.0 \text{ nanoseconds}} \quad (0.640\ \mu\text{s})$$

The assembly pre-touch loop loads all 512 cache lines into L1D in the Modified state in **$640.0\text{ nanoseconds}$**!

---

#### Step 3: Calculate Safe Stack Capacity and Max Nested Function Depth

Total CAR capacity $= 32,768\text{ bytes}$. Safety threshold $= 80\%$.

##### 1. Calculate Maximum Safe Stack Capacity ($\text{Stack}_{\text{safe\_max}}$):

$$\text{Stack}_{\text{safe\_max}} = 32,768\text{ bytes} \times 0.80 = \mathbf{26,214.4 \text{ Bytes}} \approx \mathbf{26,214 \text{ Bytes}} \quad (25.6\text{ KB})$$

##### 2. Calculate Maximum Nested Function Call Depth ($N_{\text{frames\_max}}$):
Each C function frame consumes $128\text{ bytes}$ of stack space (return address + saved registers + local variables):

$$N_{\text{frames\_max}} = \left\lfloor \frac{\text{Stack}_{\text{safe\_max}}}{128\text{ bytes/frame}} \right\rfloor = \left\lfloor \frac{26,214}{128} \right\rfloor = \lfloor 204.79 \rfloor = \mathbf{204 \text{ Nested Function Calls}}$$

Early C boot firmware can safely execute up to **204 nested function call levels** without risking a cache eviction lockup!

---

#### Step 4: Calculate CAR-to-DRAM Context Migration Latency

During CAR teardown, the active $32\text{-KB}$ CAR stack ($32,768\text{ bytes}$) is copied from CAR SRAM to physical DRAM over a memory bus with a write bandwidth of $12.8\text{ GB/sec}$ ($12.8 \times 10^9\text{ bytes/sec}$).

##### 1. Calculate Physical Memory Copy Duration ($t_{\text{migration}}$):

$$t_{\text{migration}} = \frac{\text{Payload Size}}{\text{DRAM Bandwidth}} = \frac{32,768\text{ Bytes}}{12.8 \times 10^9\text{ Bytes/sec}}$$

$$t_{\text{migration}} = 2.56 \times 10^{-6}\text{ seconds} = \mathbf{2.56 \text{ microseconds}} \quad (2,560.0\text{ ns})$$

##### 2. Calculate CPU Clock Cycles Elapsed During Migration ($C_{\text{migration}}$) at $3.2\text{ GHz}$:

$$C_{\text{migration}} = \frac{2,560.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{8,192 \text{ CPU Clock Cycles}}$$

```text
CAR STAGING PERFORMANCE SUMMARY TABLE

 Execution Phase            │ CPU Clock Cycles (3.2 GHz) │ Physical Time Duration
────────────────────────────┼────────────────────────────┼─────────────────────────
 Pre-Touch Loop (512 Lines) │ 2,048 Cycles               │ 0.640 Microseconds
 C Execution Capacity       │ 204 Nested Call Frames     │ Unlimited Duration
 Stack Migration to DRAM    │ 8,192 Cycles               │ 2.560 Microseconds
 Total CAR Teardown Overhead│ 10,240 Cycles              │ 3.200 Microseconds
```

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against microarchitectural principles:

1. **MTRR Mask Power-of-Two Alignment Check**:
   * Size $= 32\text{ KB} = 2^{15}\text{ bytes}$.
   * Low-order 15 bits of $V_{\text{mask}}$ must be zero: $\text{0x8000} = 1000\_0000\_0000\_0000_2$ (bit 15 is $1$, bits $[14:0]$ are $0$).
   * Base address `0xFEE0_0000` is an exact multiple of $32\text{ KB}$ ($\text{0xFEE0\_0000} \pmod{32768} == 0$).
   * Power-of-two alignment check $100\%$ verified!
2. **Pre-Touch Line Count Check**:
   * $512\text{ lines} \times 64\text{ bytes/line} = 32,768\text{ bytes} = 32\text{ KB}$. Matches target CAR size perfectly.
3. **Bandwidth Transfer Precision Check**:
   * $32,768\text{ bytes} / 2.56\ \mu\text{s} = 12.8 \times 10^9\text{ bytes/sec} = 12.8\text{ GB/sec}$. Matches assigned DRAM write bandwidth identically.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Temporary SRAM Stack**: A writable call stack environment allocated inside on-chip processor storage (SRAM, L1/L2 data cache, or scratchpad memory) that provides local variable storage and subroutine linkage prior to main DRAM memory initialization.
* **Cache-as-RAM (CAR)**: A microarchitectural staging technique where processor data caches are configured into Write-Back / No-Fill mode, locking cache lines in the Modified state so that memory read and write instructions execute locally in on-chip SRAM without generating external DRAM bus transactions.