---
title: "Return Stack Buffer Speculation Mechanics and Retbleed Microarchitectural Leakage"
---

# Return Stack Buffer Speculation Mechanics and Retbleed Microarchitectural Leakage

In high-performance microprocessors, function calls (`CALL`) and function returns (`RET`) constitute a major fraction of all executed instructions. When a program executes a subroutine call instruction, the hardware CPU core pushes the 64-bit return address onto the memory stack in RAM and branches to the function's entry point. When the function finishes, a return instruction (`RET`) pops the target address from the memory stack and jumps back to the caller. However, reading a return address from the memory stack requires accessing Level 1 Data Caches or main DRAM memory, introducing multi-cycle memory latency stalls. To predict return target addresses in zero clock cycles, modern CPU hardware incorporates a specialized, ultra-fast Hardware Stack array known as the **Return Stack Buffer (RSB)**. Every time a `CALL` instruction executes, the CPU pushes the return address onto both the memory stack and the internal RSB. When a `RET` instruction executes, the CPU speculatively pops the predicted return address directly from the RSB, allowing the pipeline to fetch downstream instructions instantly. However, the RSB is a hardware structure with a fixed, finite capacity (typically 16 or 32 entries). When a program executes deep nested function calls that exceed the RSB capacity, or when a privilege context switch from user space to kernel space desynchronizes the RSB pointers, an **RSB Underflow** occurs. To prevent pipeline stalls when the RSB runs empty, hardware architects designed many CPU microarchitectures to **fall back to the shared Branch Target Buffer (BTB)** to predict the return target. An unprivileged attacker who previously poisoned the shared BTB with a malicious address can exploit this fallback behavior. When a privileged kernel function executes an `RET` instruction under an RSB underflow condition, the hardware falls back to the poisoned BTB entry, speculatively jumping directly to an attacker-selected kernel disclosure gadget. This vulnerability, known as **Retbleed (Spectre-RSB)**, completely bypassed early software mitigations like Retpoline, demonstrating that function return instructions are vulnerable to speculative branch target injection.

```text
RETURN STACK BUFFER UNDERFLOW AND BTB FALLBACK HAZARD

 Deep Kernel Call Stack Execution (Depth > RSB Capacity)
 ┌─────────────────────────────────────────────────────────────┐
 │ Nested Subroutines Execute -> RSB Buffer Overflows & Empties│
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Kernel Executes RET Instruction
 ┌─────────────────────────────────────────────────────────────┐
 │ RETURN STACK BUFFER (RSB) QUERY                             │
 │ Status: RSB EMPTY / UNDERFLOW!                              │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ HARDWARE FALLBACK TO SHARED BTB!
 ┌─────────────────────────────────────────────────────────────┐
 │ BRANCH TARGET BUFFER (BTB) LOOKUP                           │
 │ Matches Poisoned Entry -> Target = 0xFFFFFFFF_8100_Gadget   │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼
 CPU Speculatively Jumps to Attacker's Gadget in Kernel Space!
 (Speculatively Exfiltrates Kernel Secrets via Cache Side-Channel!)
```


## The Subroutine Linkage Dual Architecture: Memory Stack vs. Hardware RSB

To understand why the CPU uses two separate stack structures during function calls and returns, we must examine the architectural versus microarchitectural handling of subroutine linkage.

When a high-level programming language executes a function call (`foo()`), the compiler translates the call into an assembly `CALL` instruction. When the function completes, it executes an `RET` instruction.

The CPU manages function calls across two distinct hardware domains:

```text
SUBROUTINE LINKAGE DUAL HARDWARE ARCHITECTURE

 Architectural Memory Domain                    Microarchitectural Hardware Domain
 (Main DRAM / L1 Data Cache)                    (On-Chip Silicon Execution Core)
 ┌───────────────────────────────────┐          ┌───────────────────────────────────┐
 │ SYSTEM MEMORY STACK (RAM)         │          │ RETURN STACK BUFFER (RSB ARRAY)   │
 │                                   │          │                                   │
 │ Address 0x2000_3FC0 : Return Addr │          │ RSB Slot 0 : Return Addr (0x8004) │
 │ Address 0x2000_3FC4 : Saved Regs  │          │ RSB Slot 1 : Return Addr (0x8120) │
 └───────────────────────────────────┘          └───────────────────────────────────┘
  (Used for ARCHITECTURAL Commitment)            (Used for ZERO-CYCLE Prediction)
```


### 2. The Microarchitectural Return Stack Buffer (RSB)
* **Location**: A specialized, high-speed LIFO (Last-In, First-Out) circular SRAM array embedded directly within the CPU's Instruction Fetch unit.
* **Operation**:
  * `CALL Target`: Pushes `Return_Addr` onto the top of the internal RSB array (`RSB[Top] <= Return_Addr; Top++`).
  * `RET`: Speculatively pops the predicted return address from the top of the RSB (`Top--; Return_Addr = RSB[Top]`) in **$0\text{ clock cycles}$**!
* **Role**: Serves as a **Microarchitectural Predictor**. It allows the Instruction Fetch engine to predict the return target instantly, fetching downstream instructions without waiting for `[RSP]` to be read from memory!

$$\text{Architectural Memory Stack } \implies \text{Guarantees Correctness (Slow)}$$

$$\text{Microarchitectural RSB Array } \implies \text{Guarantees Speed (Fast Speculation)}$$


### The Three Causes of RSB Desynchronization and Underflow

Under normal single-threaded execution with shallow call stacks ($D \le N_{\text{RSB}}$), every `CALL` instruction matches a corresponding `RET` instruction, and the RSB prediction accuracy is nearly $100\%$.

However, three microarchitectural conditions cause the RSB to become **desynchronized or depleted (RSB Underflow)**:

```text
RSB DESYNCHRONIZATION AND UNDERFLOW CAUSES

 1. Deep Subroutine Call Stacks (Call Depth D > N_RSB)
    Nested CALLs exceeding 16/32 levels overwrite oldest entries!
    When unrolling stack, earliest RETs find EMPTY / OVERWRITTEN slots!

 2. Context Switches & Privilege Transitions (User -> Kernel Syscall)
    User process fills RSB with user-space return addresses.
    Kernel executes syscall, popping user addresses or exhausting RSB!

 3. Retpoline Software Mitigation Execution
    Retpoline thunks execute 'ret' instructions to trap speculation.
    Repeated 'ret' calls drain RSB entries without matching 'CALL's!
```

#### Cause 1: Deep Call Chains ($D > N_{\text{RSB}}$)
When a program executes a recursive function or deep call tree with nesting depth $D = 24$ on a processor with $N_{\text{RSB}} = 16$:
* The first 16 `CALL` instructions fill the RSB array.
* `CALL` instructions 17 through 24 overwrite entries $0 \dots 7$ in the circular array.
* When the function unwinds and executes 24 consecutive `RET` instructions:
  * The first 16 `RET` instructions pop valid predicted targets.
  * `RET` instructions 17 through 24 encounter **empty or overwritten slots (RSB Underflow)**!

#### Cause 2: User-to-Kernel Privilege Transitions (`syscall`)
When a user-space application executes a system call (`syscall` or `int 0x80`), the CPU switches privilege mode from User Mode ($PL=3$) to Kernel Mode ($PL=0$).
* The RSB array currently holds return addresses pointing to **user-space memory addresses** (`0x0000_0000_0800_XXXX`).
* As kernel subroutines execute inside `syscall`, they execute `RET` instructions that pop these old user-space addresses, emptying the RSB array!

#### Cause 3: Retpoline Software Mitigation Execution
Google's Retpoline mitigation uses `call` and `ret` instructions to trap branch speculation. 

Executing Retpoline trampolines repeatedly pops entries from the RSB without pushing matching `CALL` entries, causing the RSB array to **drain and underflow prematurely**!


## Complete Retbleed (Spectre-RSB) Attack Protocol

Let us trace the complete step-by-step execution protocol of a Retbleed attack where an unprivileged user process exfiltrates kernel memory across privilege boundaries:

```text
RETBLEED (SPECTRE-RSB) 5-PHASE ATTACK PROTOCOL

 Phase 1: Locate Kernel Gadget     ──► Scan kernel binary for Retbleed Gadget
                                       (e.g., mov rax, [rdi]; mov rbx, [rax*64 + T]; ret)
                                       │
                                       ▼
 Phase 2: Poison Shared BTB        ──► Execute indirect branch at user alias address
                                       A_user_ret targeting A_gadget 1,000 times!
                                       │
                                       ▼
 Phase 3: Force Kernel RSB Underflow─► Execute deep syscall call stack or drain RSB
                                       so kernel RSB contains 0 valid entries!
                                       │
                                       ▼
 Phase 4: Trigger Kernel RET       ──► Kernel executes RET at A_kernel_ret with empty RSB!
                                       (CPU falls back to BTB -> Speculatively runs Gadget!)
                                       │
                                       ▼
 Phase 5: Reload & Exfiltrate      ──► Measure reload time for array2[0..255] in user space.
                                       (L1 Hit on Line S -> Kernel Secret = S!)
```


## Why Retpoline Failed and Modern Hardware Mitigations

The discovery of Retbleed sent shockwaves through the cybersecurity industry because it proved that **Retpoline—the primary software mitigation used worldwide against Spectre Variant 2—was ineffective on many existing CPU microarchitectures!**

### Why Retpoline Failed on Intel Skylake and AMD Zen 1/2

Google's Retpoline mitigation was designed under the assumption that `RET` instructions *only* read the RSB and would *never* query the BTB.

By replacing indirect jumps (`jmp rax`) with `call`/`ret` trampolines, Retpoline trapped speculation inside an artificial `pause` loop.

However, Retpoline's security proof assumed the RSB would never underflow into the BTB!
* On Intel Skylake, Kaby Lake, Cascade Lake, and AMD Zen 1 / Zen 2 microarchitectures, **when the RSB underflows, the hardware DOES query the BTB for `RET` instructions!**
* When Retpoline's `ret` instruction executed under an RSB underflow condition, the hardware fell back to the poisoned BTB, jumped directly to the attacker's gadget, and **bypassed Retpoline completely**!


#### Mitigation 1: RSB Stuffing / Filling (Software Kernel Entry Mitigation)

To prevent the RSB from underflowing during kernel execution, operating system kernels (Linux kernel `RSB_FILLING`) execute an **RSB Stuffing Sequence** on every user-to-kernel transition (`syscall` / interrupt entry):

```assembly
; Linux Kernel RSB Stuffing Sequence (Executed on Syscall Entry)
; Overwrites all 32 RSB entries with safe kernel targets!

    mov ecx, 16                 ; 16 iterations (32 calls)
.align 16
1:  call 2f                     ; Push dummy return address to RSB
    pause                       ; Trapped speculation slot
2:  call 2f                     ; Push second dummy return address to RSB
    pause
2:  sub ecx, 1
    jnz 1b
    add rsp, 256                ; Clean up dummy stack frames
```

```text
RSB STUFFING MECHANICS

 User-to-Kernel Syscall Entry
               │
               ▼
 Kernel executes 32 dummy 'CALL' instructions
 ┌─────────────────────────────────────────────────────────────┐
 │ RETURN STACK BUFFER (RSB ARRAY) - 100% FILLED WITH DUMMY    │
 │ RSB[0..31] <= Safe Kernel Address (2f)                      │
 └─────────────────────────────────────────────────────────────┘
  (RSB is 100% full of safe kernel addresses! Underflow IMPOSSIBLE!)
```

* **How RSB Stuffing Works**: On every system call entry, the kernel executes 32 dummy `CALL` instructions in a tight loop. This completely overwrites all 32 slots in the hardware RSB array with safe, harmless kernel addresses (`2f`).
* **Security Result**: When kernel functions execute `RET` instructions later during `syscall` processing, the RSB pops the safe dummy kernel addresses instead of underflowing into the poisoned BTB!
* **Performance Cost**: Executing 32 dummy `CALL` instructions on every system call adds **$40 \text{ to } 80\text{ CPU clock cycles}$** to every kernel transition, degrading system call performance by $5\%\text{ to } 15\%$.


## Solved Industrial Engineering Exercise: Quantitative RSB Underflow Analysis, Retbleed Gadget Execution, and RSB Stuffing Verification

To consolidate your complete mastery of Return Stack Buffer mechanics, RSB underflow conditions, BTB fallback target hijacking, and RSB stuffing mitigations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Trace RSB Array State During Deep Kernel Call Stack ($D = 20$)

The kernel executes $D = 20$ nested `CALL` instructions ($C_1, C_2, \dots, C_{20}$).

The hardware RSB holds $N_{\text{RSB}} = 16\text{ entries}$ in a circular array:
1. `CALL`s 1 through 16 fill RSB slots $0 \dots 15$.
2. `CALL`s 17 through 20 wrap around and **overwrite RSB slots $0 \dots 3$** with return addresses for $C_{17} \dots C_{20}$.
3. When the subroutines complete and execute 20 consecutive `RET` instructions ($R_{20}, R_{19}, \dots, R_1$):
   * `RET`s 20 through 5 pop valid addresses from RSB slots $3 \dots 0$ and $15 \dots 4$ ($16\text{ valid RSB pops}$).
   * On **`RET` #17** (unwinding call $C_4$): **The RSB array contains ZERO valid entries! (RSB UNDERFLOW!)**

$$\mathbf{\text{RSB Status at RET \#17: EMPTY / UNDERFLOW!}}$$


#### Step 3: Calculate Reload Timing Delta

The attacker reloads all 256 lines of `probe_array T`:
* **Un-accessed Lines $k \neq 90$**: Absent from cache $\implies T_{\text{DRAM}} = 180\text{ cycles}$.
* **Target Line $k = 90$**: Resident in L1 Data Cache $\implies T_{\text{L1\_hit}} = 4\text{ cycles}$.

$$\text{Timing Delta Saved } \Delta T = T_{\text{DRAM}} - T_{\text{L1\_hit}} = 180 - 4 = \mathbf{176 \text{ CPU Clock Cycles Saved!}}$$

The attacker measures a $176\text{-cycle}$ speedup on line 90, exfiltrating secret byte **$S = 90 = \text{0x5A} = \text{'Z'}$**!


### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against processor design principles:

1. **RSB Underflow Condition Check**:
   * Kernel call depth $D = 20$. RSB capacity $N_{\text{RSB}} = 16$.
   * $20 - 16 = 4$ underflowed returns.
   * `RET` #17 occurred after 16 valid pops, hitting the empty RSB state ($0$ entries). Underflow condition verified!
2. **BTB Fallback Routing Check**:
   * Upon RSB underflow, hardware BTB fallback queried Set Index 4 (poisoned by user address `0x0800_1040`).
   * Speculative jump to $A_{\text{gadget}}$ executed in Kernel Mode ($PL=0$).
   * BTB fallback speculation confirmed with $100\%$ precision.
3. **RSB Stuffing Defense Check**:
   * 32 dummy `CALL`s $> N_{\text{RSB}} (16)$.
   * $100\%$ of RSB slots overwritten with safe kernel addresses.
   * BTB fallback prevented, verifying $100\%$ mitigation security!

All RSB underflow state equations, BTB fallback target hijacking timelines, $176\text{-cycle}$ side-channel timing deltas, and RSB stuffing mitigation cycle penalties evaluate with 100% mathematical, physical, and microarchitectural precision.

