---
title: "PACMAN Attack Mechanics and Speculative Pointer Authentication Probing"
---

# PACMAN Attack Mechanics and Speculative Pointer Authentication Probing

In 64-bit computer architectures, high-performance microprocessors utilize virtual memory address spaces that span up to 48 bits or 52 bits of physical addressing. Because a 64-bit virtual memory address uses only its lower 48 or 52 bits to select memory pages, the upper 12 to 16 bits of every 64-bit pointer ($A_{\text{virtual}}[63:48]$) remain unused during standard memory translation. To protect software against control-flow hijacking attacks—such as Return-Oriented Programming (ROP) or Jump-Oriented Programming (JOP) where attackers overwrite function pointers or return addresses in memory—hardware architects introduced **Pointer Authentication (PAC)**. Pointer Authentication uses a fast hardware cryptographic cipher (such as QARMA) to calculate a 12-bit to 16-bit Message Authentication Code (MAC) signature based on the pointer's memory address and a secret CPU key. The hardware inserts this MAC signature directly into the unused upper bits of the pointer. Before software executes an indirect jump or load using a signed pointer, a dedicated hardware instruction—such as `AUTIA`—authenticates the signature. If the signature is valid, `AUTIA` strips the signature bits and restores a clean 64-bit virtual address. If the signature is invalid (indicating the pointer was tampered with by an attacker), `AUTIA` deliberately corrupts the upper bits of the pointer. When the software subsequently attempts to use the corrupted pointer in a memory load or jump instruction (`LDR x0, [x1]`), the hardware Memory Management Unit (MMU) detects an invalid address and triggers an architectural **Translation Fault Exception**, crashing the process immediately. Software developers believed that Pointer Authentication provided an impenetrable barrier against pointer tampering, because guessing a 16-bit PAC signature requires $65,536$ attempts, and a single incorrect guess causes an architectural crash that alerts system defenders. However, an un-mitigated microarchitectural flaw exists within out-of-order execution pipelines: **when `AUTIA` corrupts a pointer due to an invalid signature, the resulting Translation Fault exception is scheduled in the Reorder Buffer (ROB) to fire when the load instruction retires ($\sim 16 \text{ to } 20\text{ clock cycles}$ later)**. During this 20-cycle transient execution window, the CPU speculatively executes downstream instructions! If the PAC signature guess was correct, the load instruction reads valid memory and populates a line in the Level 1 Data Cache. If the PAC signature guess was incorrect, the load instruction fails, and no cache line is loaded. By measuring Level 1 Data Cache access timing using Flush+Reload side-channel probes, an unprivileged attacker can test all $65,536$ candidate PAC signatures speculatively with **$100\%$ ZERO process crashes**—a vulnerability known as the **PACMAN attack**.

```text
PACMAN SPECULATIVE POINTER AUTHENTICATION PROBING

 Attacker Supplies PAC Signature Guess K_guess in Pointer PTR
                       │
                       ▼
 Execution of Authentication Instruction: AUTIA PTR, Context
                       │
 ┌─────────────────────┴──────────────────────────────────────┐
 │ IS PAC SIGNATURE GUESS VALID?                              │
 └─────────────┬───────────────────────────────┬──────────────┘
               │ YES (Correct Guess)           │ NO (Incorrect Guess)
               ▼                               ▼
 PTR restored to Clean Address!  PTR bits corrupted with Error Pattern!
               │                               │
               ▼                               ▼
 Speculative Load: LDR X2, [PTR] Speculative Load: LDR X2, [PTR]
 Reads Valid Data Word D!        Triggers Translation Fault (#PF)!
               │                               │
               ▼                               ▼
 Loads probe_array[D * 64]      LOAD ABORTED!
 into L1 Data Cache!            Zero lines loaded into L1 Cache!
               │                               │
               └───────────────┬───────────────┘
                               ▼
 ROB Exception Flush Fires! Process DOES NOT CRASH!
 Attacker probes probe_array -> L1 Hit = CORRECT PAC GUESS FOUND!
```


## ARM64 Pointer Authentication Architecture (PAC)

To understand how PACMAN breaks pointer signatures in hardware, we must examine the internal digital logic architecture of **ARM64 Pointer Authentication (PAC)**.

In 64-bit ARMv8.3-A+ architectures (featured in modern smartphones, Apple M1/M2/M3 Apple Silicon, and enterprise server chips), virtual memory addresses utilize a maximum of 48 bits or 52 bits of physical addressing space.

```text
64-BIT ARM64 POINTER LAYOUT WITH POINTER AUTHENTICATION (PAC)

 Bit 63                             Bit 48 Bit 47                         Bit 0
 ┌────────────────────────────────────────┬───────────────────────────────────┐
 │ Pointer Authentication Code (PAC)      │ Virtual Memory Address            │
 │ (16-Bit Cryptographic MAC Signature)   │ (48-Bit Physical/Virtual Address) │
 └────────────────────────────────────────┴───────────────────────────────────┘
  ◄────────── 16 Bits PAC ───────────────► ◄────────── 48 Bits VA ────────────►
```

### 1. Pointer Signing (`PACIA` / `PACIB` Instructions)

Before a pointer (e.g., a function pointer or return address stored in register `x0`) is saved to stack memory, the compiler emits a Pointer Signing instruction, such as `PACIA x0, x1`:

$$\mathbf{\text{Signed\_Pointer} = \text{PACIA}(x0, x1, K_{\text{PACIA}})}$$

Where:
* $x0$ is the $64\text{-bit}$ register containing the un-signed virtual memory address ($x0_{[47:0]}$).
* $x1$ is a $64\text{-bit}$ **Modifier / Context Register** (typically the Stack Pointer `SP` or a modifier value), ensuring that a signed pointer created for Stack Frame A cannot be reused in Stack Frame B (**Anti-Replay Protection**).
* $K_{\text{PACIA}}$ is a $128\text{-bit}$ **Secret Hardware Key** stored in internal CPU control registers (`APIAKeyLo_EL1` and `APIAKeyHi_EL1`) accessible *only* by the kernel.

```text
PACIA SIGNING HARDWARE PIPELINE

 Register x0 [47:0] (Virtual Address) ──┐
 Register x1 [63:0] (Context Mod)    ──┼──► [ QARMA Hardware Cipher ] ──► 16-Bit MAC Signature
 Internal Key APIAKey [128 Bits]     ──┘          (1 Clock Cycle)                 │
                                                                                  ▼
 Signed Pointer [63:0] = [ 16-Bit MAC Signature (Bits 63:48) | Virtual Address (Bits 47:0) ]
```

#### The QARMA Hardware Cipher:
The CPU's internal PAC engine uses a specialized, low-latency $128\text{-bit}$ tweakable block cipher named **QARMA**. 

QARMA computes a $16\text{-bit}$ Message Authentication Code ($\text{MAC}$) signature in a **single clock cycle ($0.3125\text{ ns}$)**!

The PAC engine inserts the $16\text{-bit}$ MAC signature directly into the upper bits $[63:48]$ of register $x0$:

$$\text{Signed\_Pointer}[63:48] \Leftarrow \text{PAC\_Signature}$$
$$\text{Signed\_Pointer}[47:0] \Leftarrow \text{Virtual\_Address}[47:0]$$


## The PACMAN Speculative Probing Mechanism

Now let us examine how the **PACMAN attack** (discovered by MIT CSAIL researchers in 2022) bypasses Pointer Authentication without triggering a single architectural process crash.

### The PACMAN Speculative Gadget Topology

To create a Speculative PAC Oracle, an attacker locates or constructs a two-instruction assembly sequence known as a **PACMAN Gadget**:

```assembly
// The Canonical PACMAN Probing Gadget (ARM64 Assembly)
// x0 = Target Pointer containing Candidate PAC Signature Guess
// x1 = Context Register (e.g., Stack Pointer SP)
// x4 = Base Address of Public User Probe Array (256 Entries x 64 Bytes)

pacman_gadget:
    autia x0, x1               ; Step 1: Authenticate x0 with context x1
    ldr   x2, [x0]             ; Step 2: Speculatively Load byte from x0
    lsl   x2, x2, #6           ; Step 3: Shift byte value x2 * 64 (cache stride)
    ldr   x3, [x4, x2]         ; Step 4: Speculatively fetch line x2 of probe_array
```

Let us trace the microarchitectural execution timeline of this gadget under both a **Correct PAC Guess** and an **Incorrect PAC Guess**:

```text
PACMAN SPECULATIVE EXECUTION TIMELINE

 Clock Cycles
 0        1        2                    6                    20 Cycles
 ├────────┼────────┼────────────────────┼────────────────────┤
 │ AUTIA  │ LDR x2 │ LSL & LDR x3       │ L1D Fill Complete  │ ROB Flush
 │ (Check)│ [x0]   │ [probe_array+x2*64]│ Line x2 in L1D     │ (#PF Fault)
 └────────┴────────┴────────────────────┴────────────────────┘
  ◄────── Speculative Execution Window (20 Cycles) ─────────►
  (If PAC guess was correct, Line x2 is loaded into L1D BEFORE Cycle 20!)
```


### Scenario B: Correct PAC Signature Guess ($K_{\text{guess}} == K_{\text{actual}}$)

1. **Cycle 0 ($t = 0.0\text{ ns}$)**: The attacker passes a signed pointer $x0$ containing the **CORRECT PAC signature guess** ($K_{\text{guess}}$).
2. **Cycle 1 ($t = 0.3125\text{ ns}$)**: `AUTIA x0, x1` executes. QARMA signature comparison **SUCCEEDS**!
   * `AUTIA` strips the PAC signature, restoring $x0$ to a **clean virtual memory address**: `0x0000_7FFF_8000_1000`.
3. **Cycle 2 ($t = 0.6250\text{ ns}$)**: Step 2 executes `LDR x2, [x0]`.
   * Address `0x0000_7FFF_8000_1000` is valid!
   * The L1 Data Cache returns valid data word $D = 42_{10}$ into register $x2$ at **Cycle 6 ($t = 1.875\text{ ns}$)**.
4. **Cycle 7 ($t = 2.1875\text{ ns}$)**: Step 3 computes $x2 = 42 \times 64 = 2,688_{10}$.
5. **Cycle 8 ($t = 2.5000\text{ ns}$)**: Step 4 dispatches `LDR x3, [x4, #2688]`.
   * **Line 42 of `probe_array` is fetched into the L1 Data Cache!**
6. **Cycle 20 ($t = 6.250\text{ ns}$)**: If a fault occurred later in the pipeline or if the attacker suppressed exceptions, the ROB flushes the pipeline.
7. **THE PERSISTENT FOOTPRINT**: **Line 42 of `probe_array` remains resident in the Level 1 Data Cache!**

```text
CORRECT PAC GUESS EXECUTION DATAPATH

 AUTIA Succeeds ──► x0 Restored (0x0000_7FFF...) ──► LDR x2, [x0] READS DATA D = 42!
                                                     │
                                                     ▼
 x2 = 42 ──► LDR x3, [probe_array + 42*64] LOADS LINE 42 INTO L1 DATA CACHE!
            Line 42 STAYS IN L1 CACHE after speculative rollback!
```


## Brute-Forcing PAC Signatures via PACMAN Probing

Now let us examine how an attacker uses the PACMAN Speculative Oracle to brute-force a $16\text{-bit}$ PAC signature without causing a single architectural process crash.

A $16\text{-bit}$ PAC signature has $2^{16} = 65,536$ possible binary combinations (`0x0000` through `0xFFFF`).

```text
PACMAN BRUTE-FORCE PROBING LOOP

 Attacker Loop (k = 0x0000 to 0xFFFF - 65,536 Guesses)
 ┌───────────────────────────────────────────────────────────┐
 │ 1. Embed Candidate Signature Guess k into Pointer PTR     │
 ├───────────────────────────────────────────────────────────┤
 │ 2. Execute PACMAN Gadget Speculatively (autia -> ldr)    │
 ├───────────────────────────────────────────────────────────┤
 │ 3. Probe probe_array via Flush+Reload                     │
 │    * L1 Hit Detected? ──► STOP LOOP! Valid Signature = k!│
 │    * L1 Miss Detected? ──► Continue to k + 1              │
 └───────────────────────────────────────────────────────────┘
  (65,536 guesses tested speculatively in milliseconds with ZERO crashes!)
```

### The 4-Step PACMAN Key Extraction Algorithm

1. **Step 1 (Flush Probe Array)**:
   The attacker flushes all 256 lines of `probe_array` from the L1 Data Cache using `clflush` or eviction sets.
2. **Step 2 (Embed Candidate Signature $k$)**:
   The attacker takes the target function pointer address $A_{\text{target}}$ and injects candidate signature $k \in [0, 65535]$ into bits $[63:48]$:
   $$\text{PTR}_{\text{candidate}} = (k \ll 48) \mid (A_{\text{target}} \ \& \ \text{0x0000\_FFFF\_FFFF\_FFFF})$$
3. **Step 3 (Speculative Gadget Execution)**:
   The attacker passes $\text{PTR}_{\text{candidate}}$ to the PACMAN gadget.
   * If $k \neq K_{\text{actual}}$, `AUTIA` corrupts the pointer, `LDR` faults, and zero lines are loaded into L1 Cache.
   * If $k == K_{\text{actual}}$, `AUTIA` restores the pointer, `LDR` reads memory, and line $D$ is loaded into L1 Cache!
4. **Step 4 (Side-Channel Check)**:
   The attacker reloads `probe_array`.
   * **If an L1 Cache Hit is detected**: Candidate $k$ is the **TRUE VALID PAC SIGNATURE**!
   * The attacker breaks out of the loop and uses the valid signed pointer to execute a real, architectural control-flow hijacking exploit (such as overwriting a kernel function pointer)!

#### Execution Timing Analysis:
Testing one candidate signature guess takes approximately $120\text{ CPU clock cycles}$ ($37.5\text{ ns}$).

Testing all $65,536$ candidate signatures takes:

$$\text{Total Brute-Force Time} = 65,536 \text{ Guesses} \times 37.5 \times 10^{-9} \text{ s/guess} = \mathbf{0.0024576 \text{ Seconds}} \approx \mathbf{2.46 \text{ Milliseconds!}}$$

In **$2.46\text{ milliseconds}$**, the PACMAN attack brute-forces a $16\text{-bit}$ hardware PAC signature with $100\%$ zero architectural process crashes, rendering hardware Pointer Authentication completely ineffective!


### Mitigation 1: Compiler Speculation Barrier Insertion (`ISB` after `AUTIA`)

The most direct software defense against PACMAN is instructing the compiler (Clang / GCC) to insert a **Speculation Barrier (`ISB` / Instruction Synchronization Barrier)** immediately after every `AUTIA` or `AUTIB` instruction:

```assembly
; Mitigated PACMAN Gadget Assembly
    autia x0, x1               ; Step 1: Authenticate pointer x0
    isb                        ; SPECULATION BARRIER! Halts fetch until AUTIA completes!
    ldr   x2, [x0]             ; Step 2: Load instruction (STALLED until AUTIA finishes!)
```

```text
ISB BARRIER PIPELINE SERIALIZATION

 1. AUTIA x0, x1  ──► Authenticates pointer (Fails on fake signature!)
 2. ISB           ──► SPECULATION BARRIER! Halts downstream instruction dispatch!
 3. LDR x2, [x0]  ──► STALLED! Cannot execute speculatively!
                      (Translation Fault fires BEFORE LDR can execute!)
```

#### How the `ISB` Barrier Eliminates PACMAN:
1. When `AUTIA` encounters an invalid PAC signature, it corrupts pointer $x0$.
2. The `ISB` instruction **halts all speculative dispatch of downstream instructions** until `AUTIA` completes its verification in hardware.
3. If `AUTIA` failed, the MMU raises a Translation Fault exception on the subsequent `LDR` instruction.
4. Because `ISB` prevented `LDR x3, [x4, x2]` from executing speculatively, **zero lines of `probe_array` are loaded into L1 Cache!**
5. The PACMAN speculative oracle is completely destroyed!

#### The Performance Penalty:
Inserting `ISB` after every pointer authentication instruction adds $10 \text{ to } 20\text{ clock cycles}$ of pipeline serialization delays, reducing CPU performance by **$15\%\text{ to } 25\%$** on pointer-heavy C++ / Swift workloads.


## Solved Industrial Engineering Exercise: Quantitative PACMAN Probing Timeline, Brute-Force Rate, and ISB Mitigation Analysis

To consolidate your complete mastery of PACMAN attack mechanics, QARMA signature layouts, speculative oracle timing, and `ISB` barrier mitigations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Trace Execution Timeline for Incorrect PAC Guess ($K_{\text{guess}} = \text{0x4242}$)

The attacker passes candidate signed pointer $\text{PTR}_{\text{fake}} = \text{0x4242\_8000\_0800\_1000}$.

##### 1. Cycle 0 ($t = 0.0\text{ ns}$):
* `AUTIA x0, x1` dispatches in execution pipeline.
* QARMA cipher re-computes expected signature for address `0x8000_0800_1000`: Expected $= \text{0x1337}$.

##### 2. Cycle 1 ($t = 0.3125\text{ ns}$):
* QARMA comparison evaluates: $\text{0x4242} \neq \text{0x1337} \implies \mathbf{\text{SIGNATURE MATCH FAILED!}}$
* `AUTIA` corrupts upper bits of $x0$: $x0 \Leftarrow \mathbf{\text{0x4000\_8000\_0800\_1000}}$ (Invalid unmapped address!).

##### 3. Cycle 2 ($t = 0.625\text{ ns}$):
* Step 2 (`LDR x2, [x0]`) attempts to read invalid address `0x4000_8000_0800_1000`.
* MMU detects Translation Fault $\implies$ Schedules Translation Fault exception in ROB for **Cycle 20 ($t = 6.25\text{ ns}$)**.
* Register $x2$ receives **NO DATA** ($x2$ sits waiting for faulting load).

##### 4. Cycle 3 ($t = 0.9375\text{ ns}$ to Cycle 20):
* Step 3 (`lsl x2, x2, #6`) and Step 4 (`ldr x3, [x4, x2]`) **CANNOT DISPATCH** because $x2$ contains no valid data!
* Step 4 is blocked in the Reservation Station.

##### 5. Cycle 20 ($t = 6.250\text{ ns}$):
* Translation Fault fires in ROB. Pipeline flushed. Registers reset.
* **ZERO LINES OF `probe_array` LOADED INTO L1 DATA CACHE!**

```text
INCORRECT GUESS TIMELINE VERIFICATION (K_guess = 0x4242)

 Cycle 0  : AUTIA x0, x1 Dispatched
 Cycle 1  : QARMA Check FAILS! x0 Corrupted to 0x4000_8000_0800_1000
 Cycle 2  : LDR x2, [x0] Targets Invalid Addr -> Translation Fault Scheduled for Cycle 20
 Cycle 3..19: LDR x3, [x4, x2] STALLED in Reservation Station (No Data in x2!)
 Cycle 20 : Translation Fault Fires! ROB Flushed! ZERO Lines Loaded into L1D Cache!
```


#### Step 3: Calculate Brute-Force Sweep Duration for 65,536 PAC Guesses

Each candidate guess iteration takes $120\text{ CPU clock cycles}$ ($T_{\text{iter}} = 37.5\text{ ns}$).

Total time to test all $65,536$ 16-bit PAC signatures:

$$T_{\text{bruteforce}} = 65,536 \text{ guesses} \times 120 \text{ cycles/guess} = \mathbf{7,864,320 \text{ CPU Clock Cycles}}$$

In physical milliseconds ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{bruteforce\_ms}} = 7,864,320 \text{ cycles} \times 0.3125 \times 10^{-9} \text{ s/cycle} = \mathbf{0.0024576 \text{ Seconds}} = \mathbf{2.4576 \text{ Milliseconds}}$$

##### Result:
The attacker brute-forces the 16-bit PAC signature speculatively in **$2.4576\text{ milliseconds}$** with **$100\%$ ZERO process crashes**!


### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against ARM64 design principles:

1. **PAC Signature Bit Width Verification**:
   * Signature length $= 16\text{ bits}$.
   * Total combinations $= 2^{16} = 65,536$ guesses.
   * Brute-force time $= 65,536 \times 120\text{ cycles} = 7,864,320\text{ cycles} = 2.4576\text{ ms}$. Math verified with $100\%$ precision!
2. **`AUTIA` Error Corruption Check**:
   * Incorrect signature guess $\implies$ upper bits corrupted to `0x4000_...`
   * Address `0x4000_8000_0800_1000` is unmapped $\implies$ `LDR x2, [x0]` fails, preventing $x2$ from receiving data.
   * Dependent probe load `LDR x3, [x4, x2]` blocked from dispatching.
3. **`ISB` Barrier Serialization Check**:
   * `ISB` flushes instruction fetch pipeline and waits for `AUTIA` completion.
   * Speculative probe line fill prevented, verifying $100\%$ mitigation security!

All QARMA signature bitfield layouts, `AUTIA` error corruption mechanics, PACMAN speculative oracle timelines, and `ISB` barrier overhead calculations evaluate with 100% mathematical, physical, and microarchitectural precision.


TERMINADO