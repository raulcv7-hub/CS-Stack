---
title: "Straight-Line Speculation Mechanics and Unconditional Branch Speculative Fetching"
---

# Straight-Line Speculation Mechanics and Unconditional Branch Speculative Fetching

High-performance microprocessor instruction fetch units retrieve instruction bytes from the Level 1 Instruction Cache in fixed-size contiguous blocks, such as 16-byte, 32-byte, or 64-byte fetch windows, to keep superscalar execution pipelines fully populated with micro-operations. When an instruction decoder encounters an unconditional control flow instruction—such as an unconditional jump (`JMP`), an unconditional branch (`BR`), or a function return (`RET`)—the architectural intent of the program is to immediately alter the Program Counter and redirect execution to a new, non-sequential target memory address. However, because evaluating the target address of an indirect jump or fetching a return address from the stack can require several clock cycles, and because the hardware instruction fetch engine operates on wide, contiguous byte blocks, the CPU's front-end decoder does not halt upon reading an unconditional branch. Instead, the instruction fetch unit speculatively continues fetching and decoding instructions sequentially straight down the physical memory path directly following the unconditional jump or return instruction. Even though software developers and compiler authors explicitly design unconditional control flow transfers to terminate a basic block or exit a function, the physical hardware transiently executes the instructions located immediately past the unconditional branch before the execution pipeline resolves the control flow change and flushes the speculatively fetched operations. If an attacker places a microarchitectural disclosure sequence in the memory bytes directly following an unconditional jump, or if a compiler fails to append a speculation barrier after a non-returning function call, the CPU speculatively executes these "unreachable" straight-line instructions. This hardware behavior, known as **Straight-Line Speculation (SLS)**, demonstrates that speculative execution vulnerabilities do not require conditional branch mispredictions or branch predictor table poisoning; the physical momentum of sequential instruction fetching alone can force the CPU to transiently execute instructions past unconditional program boundaries and leak secret data through the cache hierarchy.

```text
STRAIGHT-LINE SPECULATION (SLS) INSTRUCTION OVERSHOOT

 Memory Address Stream (Contiguous 16-Byte Fetch Window)
 ┌─────────────────────────────────────────────────────────────┐
 │ Instruction 1: MOV RAX, [RDI]   (Valid Code)                │
 │ Instruction 2: RET              (Unconditional Control Flow)│
 ├─────────────────────────────────────────────────────────────┤
 │ Instruction 3: MOV RBX, [RAX*64](UNREACHABLE SPECULATIVE!) │
 │ Instruction 4: MOV RDX, [RBX]   (UNREACHABLE SPECULATIVE!) │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Front-End Instruction Fetch Momentum
 Decoder decodes Instructions 3 and 4 STRAIGHT-LINE past RET!
 CPU speculatively executes Instruction 3 -> Loads Line into L1 Cache!
               │
               ▼ Execution Pipeline Resolves RET (ROB Flush)
 Instructions 3 and 4 Squashed! BUT Line loaded by Inst 3 STAYS IN CACHE!
```


## Front-End Fetch Mechanics and the Sequential Fetch Window

To comprehend why a processor overshoots unconditional branch instructions, we must inspect the digital logic architecture of the CPU front-end, specifically the relationship between the **Instruction Fetch Unit (IFU)**, the **Level 1 Instruction Cache (L1I)**, and the **Instruction Decoder**.

### The Fixed-Size Fetch Window

A modern CPU core operating at $3.2\text{ GHz}$ cannot afford to read instructions from memory one byte at a time. Decoding variable-length or fixed-length instructions byte-by-byte would create an extreme bottleneck, starving the out-of-order execution engine.

Instead, the Instruction Fetch Unit retrieves instruction bytes from the Level 1 Instruction Cache in wide, fixed-size contiguous blocks called **Fetch Windows** (typically 16, 32, or 64 bytes wide per clock cycle).

```text
FIXED 16-BYTE INSTRUCTION FETCH WINDOW

 Physical L1I Memory Block (16 Bytes / 128 Bits)
 ┌─────────────────────────────────────────────────────────────┐
 │ Inst 1 (4B) │ Inst 2: RET (2B) │ Inst 3 (4B) │ Inst 4 (6B)  │
 └──────┬──────────────┬──────────────────┬─────────────┬──────┘
        │              │                  │             │
        ▼              ▼                  ▼             ▼
 [ Instruction 1 ] [ Instruction 2 ] [ Instruction 3 ] [ Instruction 4 ]
 (Decoded)         (Unconditional)   (SPECULATIVELY DECODED PAST RET!)
```

Consider what happens inside a single $16\text{-byte}$ fetch window:
1. The IFU reads a 16-byte aligned block from the L1 Instruction Cache and loads all 16 bytes into the Instruction Pre-Decode Buffer.
2. Suppose this 16-byte block contains four distinct instructions: Instruction 1 ($4\text{ bytes}$), Instruction 2 ($2\text{ bytes}$), Instruction 3 ($4\text{ bytes}$), and Instruction 4 ($6\text{ bytes}$).
3. **Instruction 2 is an Unconditional Return (`RET`)**.
4. The pre-decode buffer hands all 16 bytes to the parallel instruction decoders.
5. On the exact same clock cycle that the decoders identify Instruction 2 as a `RET`, **the decoders ALSO parse and decode Instruction 3 and Instruction 4**!

Why does the decoder process Instruction 3 and Instruction 4?
Because Instruction 3 and Instruction 4 were **already fetched into the hardware buffer as part of the 16-byte window**! 

The hardware front-end operates on continuous spatial momentum. It does not know that Instruction 2 is an unconditional control transfer until the decode stage finishes parsing Instruction 2's opcode bytes.


## Contrast: Spectre vs. Meltdown vs. Straight-Line Speculation (SLS)

To appreciate why Straight-Line Speculation is a distinct class of microarchitectural vulnerability, let us compare SLS against other major transient execution attack families:

```text
TRANSIENT EXECUTION VULNERABILITY COMPARISON MATRIX

 Vulnerability Class │ Triggering Microarchitectural Mechanism       │ Predictor Dependence
─────────────────────┼───────────────────────────────────────────────┼───────────────────────────────
 Spectre Variant 1   │ Mispredicted Conditional Branch (`if (x < N)`) │ Requires BHT Predictor Training
 Spectre Variant 2   │ Poisoned Indirect Branch Target (`call [rax]`) │ Requires BTB Predictor Poisoning
 Meltdown            │ Unprivileged Load from Privilege Page (PTE)   │ Requires Out-of-Order Memory Forwarding
 Straight-Line (SLS) │ Sequential Instruction Fetch Momentum Past    │ ZERO PREDICTOR DEPENDENCE!
                     │ Unconditional Control Instructions (`RET/JMP`)│ (Occurs on Unconditional Code!)
```

```text
KEY ARCHITECTURAL DIFFERENCES

 1. Spectre-v1 / Spectre-v2
    * Requires training or poisoning dynamic branch prediction structures (BHT / BTB).
    * Depends on conditional branch evaluation stalls.

 2. Meltdown / MDS
    * Requires reading protected privilege memory or internal buffers directly.
    * Depends on race conditions between page fault exceptions and data forwarding.

 3. Straight-Line Speculation (SLS)
    * Requires ZERO branch predictor training or poisoning!
    * Operates on non-speculative, unconditional control flow instructions (RET, BR, JMP, UD2).
    * Driven purely by front-end instruction fetch window momentum!
```

#### The Fundamental SLS Discovery:
Before the discovery of Straight-Line Speculation by ARM security researchers in 2020, hardware engineers believed that speculation occurred *only* when a branch predictor guessed a direction or target.

SLS proved that **speculation occurs even when there is no choice or prediction to be made**! The simple act of fetching sequential instruction bytes in wide memory windows causes the processor to overshoot unconditional control transfers.


### Pattern 2: Speculation Past Indirect Register Jumps (`JMP RAX` / `BR Xn`)

When software executes an indirect jump through a register (such as jumping to a function pointer or switch table target):

```assembly
; Indirect Register Jump
    jmp rax                   ; Unconditional Indirect Jump to address in RAX
    
; Memory bytes directly following 'jmp rax' in the binary:
    mov rbx, [r11 * 64 + rsi] ; SPECULATIVELY EXECUTED VIA SLS BEFORE JMP RESOLVES!
```

While the execution pipeline waits to evaluate register `RAX` across the register file or memory bus, the instruction fetch unit **continues decoding straight-line instructions directly following the `jmp rax` opcode bytes**!


### Pattern 4: Speculation Past Architectural Trap / Fault Instructions (`UD2` / `BRK`)

When a compiler generates runtime assertions or boundary traps, it emits undefined trap instructions (such as `UD2` on x86 or `BRK` / `UDF` on ARM):

```assembly
; Architectural Trap Instruction
    ud2                       ; Raises invalid opcode exception (TRAP)
    
; Unreachable bytes following trap instruction:
    mov rbx, [rax * 64 + rsi] ; SPECULATIVELY EXECUTED VIA SLS BEFORE TRAP FIRES!
```

Before the CPU execution unit processes the `UD2` exception trap and suspends the pipeline, the instruction decoder **speculatively fetches and executes the instructions past `UD2`**, populating the Level 1 Data Cache with speculative loads!


### Mitigation 1: Speculation Barrier Insertion (`DSB ISB` / `LFENCE`)

On ARM64 architectures (ARMv8-A), compiler flags `-mharden-sls=ret-br` instruct the compiler to insert a hardware speculation barrier immediately after every `RET` and indirect branch instruction:

```assembly
; ARM64 Assembly with SLS Speculation Barrier Mitigation
function_A_mitigated:
    ldr x0, [x1]              ; Function body
    ret                       ; Unconditional Return
    dsb sy                    ; Data Synchronization Barrier
    isb                       ; Instruction Synchronization Barrier (HALTS FETCH!)
```

```text
ARM64 SLS SPECULATIVE BARRIER MECHANICS

 Instruction Stream: ret ──► dsb sy ──► isb
                                         │
                                         ▼
 ISB Instruction Forces Pipeline Fetch Unit to HALT!
 Zero downstream straight-line instructions are decoded or executed!
 (Straight-Line Speculation 100% ELIMINATED!)
```

#### How the ISB Instruction Stops SLS:
* The **`ISB` (Instruction Synchronization Barrier)** instruction commands the ARM instruction fetch engine to **flush its prefetch buffers and halt all speculative instruction fetching** until all preceding instructions have completed execution.
* Even though `ISB` sits past the `RET` instruction, the front-end fetch unit encounters `ISB` and halts straight-line decoding immediately, preventing any downstream instructions from entering the execution pipeline!


### Binary Size and Instruction Cache Performance Trade-offs

While compiler SLS mitigations provide $100\%$ protection against straight-line speculative exfiltration, inserting barrier instructions (`DSB ISB` or `UD2`) after every function return and jump introduces measurable system overheads:

```text
COMPILER SLS MITIGATION OVERHEAD MATRIX

 Mitigation Strategy  │ Added Bytes per RET / JMP │ Binary Size Expansion │ L1I Cache Impact
──────────────────────┼───────────────────────────┼───────────────────────┼───────────────────
 ARM64 'DSB ISB'      │ +8 Bytes (2 Instructions) │ +4.0% to +8.0%        │ ~2.5% L1I Misses
 x86-64 'UD2' Padding │ +2 Bytes (1 Instruction)  │ +1.5% to +3.0%        │ ~1.0% L1I Misses
 x86-64 'LFENCE'      │ +3 Bytes (1 Instruction)  │ +2.0% to +4.5%        │ ~1.5% L1I Misses
```

1. **Binary Size Expansion**: Appending 2 to 8 bytes after every function return increases compiled kernel and application binary sizes by **$1.5\%\text{ to } 8.0\%$**.
2. **Instruction Cache (L1I) Footprint**: Increasing binary size reduces L1 Instruction Cache efficiency, slightly increasing L1I miss rates by **$1.0\%\text{ to } 2.5\%$**.

Despite these small overheads, major operating system kernels (Linux, macOS, Windows) enforce SLS compiler hardening across all production kernel builds to guarantee microarchitectural security!


### Scenario and Parameters

You are a principal microarchitectural security engineer auditing an 8-stage superscalar out-of-order x86-64 processor operating at a clock frequency $f_{\text{clk}} = 3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor front-end retrieves instructions from the L1 Instruction Cache using a **fixed 16-byte contiguous Fetch Window** ($128\text{ bits}$).

```text
3.2 GHz SUPERSCALAR PROCESSOR WITH 16-BYTE FETCH WINDOW

 CPU Front-End (3.2 GHz) ──► 16-Byte L1I Fetch Window ──► 4-Opcode Parallel Decoder
 Clock T = 312.5 ps          128-Bit Alignment            4 uops / Clock Cycle
```

#### Hardware Pipeline & Memory Parameters:
* **Instruction Fetch Unit (IFU)**: Fetches 16 bytes per clock cycle.
* **Superscalar Decode & Issue Width**: $4\ \mu\text{ops}$ per clock cycle.
* **Level 1 Data Cache Hit Latency**: $T_{\text{L1D\_hit}} = 4\text{ CPU Clock Cycles}$ ($1.25\text{ ns}$).
* **Level 3 Cache Hit Latency**: $T_{\text{L3\_hit}} = 36\text{ CPU Clock Cycles}$ ($11.25\text{ ns}$).
* **Main DRAM Miss Latency**: $T_{\text{DRAM\_miss}} = 160\text{ CPU Clock Cycles}$ ($50.0\text{ ns}$).
* **Indirect Jump Execution Latency**: An indirect jump instruction (`jmp [r11 + 0x18]`) misses in L1/L2 cache, requiring $T_{\text{jmp\_resolution}} = 40\text{ CPU Clock Cycles}$ ($12.5\text{ ns}$) to resolve its target address across the L3 cache bus.

#### Memory Layout of Vulnerable Code Segment:
A vulnerable driver contains an un-mitigated indirect jump followed immediately in memory by an attacker's disclosure gadget:

```assembly
; Memory Address 0x0000_7FFF_8000_1030 (16-Byte Aligned Block)
    mov rdi, [r10]            ; Inst 1 (4 Bytes): Read Kernel Secret S = 42 into RDI
    jmp [r11 + 0x18]          ; Inst 2 (4 Bytes): Indirect Jump (Target misses in L1/L2!)
    
; Bytes 8 to 15 of the EXACT SAME 16-byte fetch window (SLS Target Gadget):
    mov rbx, [rdi * 64 + rsi] ; Inst 3 (8 Bytes): Dependent Probe Load (Line S of array rsi)
```

```text
16-BYTE FETCH WINDOW MEMORY MAP (ADDRESS 0x0000_7FFF_8000_1030)

 Byte Offset │ Assembly Instruction              │ Microarchitectural Function
─────────────┼───────────────────────────────────┼─────────────────────────────────────────────
 Bytes 0..3  │ mov rdi, [r10] (4 Bytes)          │ Inst 1: Read Secret S = 42 into RDI
 Bytes 4..7  │ jmp [r11 + 0x18] (4 Bytes)        │ Inst 2: Unconditional Indirect Jump
 Bytes 8..15 │ mov rbx, [rdi * 64 + rsi] (8B)    │ Inst 3: STRAIGHT-LINE GADGET LOAD!
```

#### Your Objective

1. Show how a single 16-byte fetch window causes the instruction decoder to fetch and parse Instruction 3 (`mov rbx, [rdi * 64 + rsi]`) on the exact same clock cycle as Instruction 2 (`jmp`).
2. Trace the clock cycle execution timeline ($t_0 \dots t_4$) for the straight-line speculative load sequence:
   * Calculate the exact cycle when probe line `rsi[42 * 64]` finishes loading into the L1 Data Cache.
   * Prove mathematically that probe line `rsi[42 * 64]` is loaded into the L1 Data Cache **before the execution pipeline resolves the jump target and flushes the ROB at Cycle 40**.
3. Calculate the reload timing delta measured by the attacker reloading `rsi[42 * 64]` versus un-accessed probe lines.
4. Evaluate the compiler mitigation: Show the effect of inserting a 2-byte `ud2` instruction immediately after `jmp [r11 + 0x18]` at byte offset 8, proving mathematically that `ud2` halts straight-line speculative execution.
5. Verify mathematical, physical, and logical correctness.


#### Step 2: Trace Clock Cycle Execution Timeline

Let us trace the clock cycle execution timeline starting at Cycle 0:

##### 1. Cycle 0 ($t = 0.0\text{ ns}$):
* IFU fetches the 16-byte block `0x0000_7FFF_8000_1030`.
* Instruction 1 (`mov rdi, [r10]`), Instruction 2 (`jmp`), and Instruction 3 (`mov rbx, [rdi * 64 + rsi]`) enter the pre-decode buffer.
* Instruction 2's jump target pointer `[r11 + 0x18]` misses in L1/L2 cache $\implies$ Jump resolution scheduled for **Cycle 40 ($t = 12.5\text{ ns}$)** across the L3 cache bus.

##### 2. Cycle 1 ($t = 0.3125\text{ ns}$):
* Parallel decoders process all three instructions.
* Instruction 1, Instruction 2, and Instruction 3 are assigned physical registers and placed in the Reservation Station.

##### 3. Cycle 2 ($t = 0.6250\text{ ns}$):
* Instruction 1 (`mov rdi, [r10]`) executes.
* Assume `[r10]` hits in L1 Data Cache ($T_{\text{L1D\_hit}} = 4\text{ cycles}$).
* Kernel secret byte $S = 42_{10} = \text{0x2A} = \text{'*'}\text{ is returned to the forwarding bus at } \mathbf{\text{Cycle 6 ($t = 1.8750\text{ ns}$)}}$.

##### 4. Cycle 7 ($t = 2.1875\text{ ns}$):
* **STRAIGHT-LINE SPECULATIVE DISPATCH**: Instruction 3 (`mov rbx, [rdi * 64 + rsi]`) receives secret $S = 42$ via internal pipeline operand forwarding.
* Instruction 3 calculates probe address $A_{\text{probe}} = \text{Base}(rsi) + (42 \times 64) = \text{Base}(rsi) + 2,688_{10}$.
* Instruction 3 dispatches a memory load request for probe line `rsi[42]` to the L1 Data Cache Controller.

##### 5. Cycle 11 ($t = 3.4375\text{ ns}$):
* Assume probe line `rsi[42]` misses in L1/L2, but hits in the shared L3 cache ($T_{\text{L3\_hit}} = 36\text{ clock cycles}$).
* Probe line `rsi[42]` is fetched from L3 into the L1 Data Cache!
* **Probe Line Fill COMPLETE at Cycle $7 + 36 = \mathbf{43 \text{ Clock Cycles ($t = 13.4375\text{ ns}$)}}$!**

##### 6. Cycle 40 ($t = 12.5000\text{ ns}$):
* Jump target pointer `[r11 + 0x18]` completes reading from L3 cache (`Target_Addr = 0x0000_7FFF_9000_5000`).
* **ROB PIPELINE FLUSH FIRED!** The execution engine detects that control flow should have jumped to `0x0000_7FFF_9000_5000`.
* Straight-line Instruction 3 is squashed. Architectural registers are reset.
* **The Microarchitectural Residual**: **Probe line `rsi[42]` remains resident in the Level 1 Data Cache!**

```text
SLS SPECULATIVE EXECUTION TIMELINE

 Cycle 0   : IFU fetches 16-Byte block containing Inst 1, JMP, and Inst 3
 Cycle 1   : Decoder decodes Inst 3 (SLS Gadget) STRAIGHT-LINE past JMP!
 Cycle 2   : Inst 1 (Secret Load) Dispatched -> Reads Secret S = 42 at Cycle 6
 Cycle 7   : Inst 3 (Probe Load rsi[42*64]) Dispatched -> Hits L3 at Cycle 43
 Cycle 40  : JMP Target Pointer arrives from L3 -> ROB FLUSH FIRED!
 Cycle 43  : Probe Line rsi[42] Fill COMPLETE inside L1 Data Cache!
 (Probe line rsi[42] was safely loaded into L1 Data Cache 3 clock cycles after ROB flush!)
```

##### Speculative Fill Verification:
Notice that probe line `rsi[42]` completed its L1 fill at Cycle 43 ($t = 13.4375\text{ ns}$), while the ROB flush fired at Cycle 40 ($t = 12.500\text{ ns}$). 

Because the L3 cache fill request was dispatched at Cycle 7 (well inside the 40-cycle speculation window), the L3 cache controller completed the fill asynchronously in the background, leaving probe line `rsi[42]` resident in the L1 Data Cache!


#### Step 4: Verify Compiler Mitigation via `ud2` Trap Insertion

Now, suppose the compiler compiles the code segment with `-mharden-sls=all`, inserting a 2-byte `ud2` instruction immediately after `jmp [r11 + 0x18]`:

```assembly
; Mitigated Code Segment
; Address 0x0000_7FFF_8000_1030 (16-Byte Aligned Block)
    mov rdi, [r10]            ; Bytes 0..3  (4 Bytes): Inst 1
    jmp [r11 + 0x18]          ; Bytes 4..7  (4 Bytes): Inst 2 (Indirect Jump)
    ud2                       ; Bytes 8..9  (2 Bytes): HARDWARE TRAP PADDING!
    mov rbx, [rdi * 64 + rsi] ; Bytes 10..17 (8 Bytes): Inst 3
```

##### Trace Decoder Action with `ud2` Padding:
1. At Cycle 0, the IFU fetches the 16-byte block starting at `0x0000_7FFF_8000_1030`.
2. The pre-decode buffer hands the 16 bytes to the decoders.
3. The decoders parse:
   * Bytes 0..3: `mov rdi, [r10]` (Instruction 1)
   * Bytes 4..7: `jmp [r11 + 0x18]` (Instruction 2)
   * Bytes 8..9: **`ud2` (Undefined Instruction Trap!)**
4. **Decoder Action on `ud2`**: The decoder recognizes `ud2` as an absolute execution trap. It **HALTS all straight-line decoding of subsequent bytes in the fetch window**!
5. Bytes 10..17 (`mov rbx, [rdi * 64 + rsi]`) are **NEVER DECODED OR DISPATCHED**!
6. Instruction 3 is blocked from entering the Reservation Station.
7. **Line `rsi[42]` IS NEVER LOADED INTO L1 DATA CACHE!**

$$\mathbf{\Delta T_{\text{with\_ud2}} \equiv 0 \text{ Clock Cycles (100% SLS EXFILTRATION PREVENTED!) }}$$

Inserting a 2-byte `ud2` trap instruction immediately after the unconditional jump completely neutralized Straight-Line Speculation!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Straight-Line Speculation (SLS)**: A transient execution vulnerability where the CPU front-end instruction fetch unit overshoots unconditional control instructions (`RET`, `JMP`, `BR`, `UD2`), speculatively fetching and executing instructions located sequentially past unconditional branches before control flow is redirected.
* **Unconditional branch speculative fetch**: The microarchitectural hardware behavior where multi-byte contiguous fetch windows cause the instruction decoder to parse and dispatch instructions located directly after an unconditional control transfer without requiring branch predictor mispredictions or table poisoning.

