---
title: "01-long-mode-architectural-entry — CPU Execution Mode Transition and 64-Bit Long Mode Architectural Entry"
---

# 01-long-mode-architectural-entry — CPU Execution Mode Transition and 64-Bit Long Mode Architectural Entry

## 1. The 16-Bit Memory Shackles and the 64-Bit Kernel Crisis

When a modern 64-bit server processor—capable of executing multi-terabyte database transactions and handling 64-bit register operations across billions of transistors—exits hardware power-on reset, its physical execution pipeline initializes in 16-bit **Real Mode**. 

This power-on operational state is hardwired into x86-64 hardware to maintain complete backward compatibility with historical 16-bit computing architectures.

In 16-bit Real Mode, the processor operates under severe physical hardware constraints:
* **16-Bit Register Limits**: General-purpose registers are restricted to 16 bits (`AX, BX, CX, DX, SI, DI, SP, BP`).
* **Segmented Address Space Constraints**: Physical memory addressing relies on a 16-bit Segment register (such as `CS`, `DS`, or `SS`) shifted left by 4 bits, added to a 16-bit Offset register.
* **The 1-Megabyte Address Ceiling**: Because 16-bit segmented addressing can generate a maximum physical address of $(\text{0xFFFF} \ll 4) + \text{0xFFFF} = \text{0x10FFEF}$, the processor is physically incapable of addressing any memory location above **1 Megabyte ($1,048,576\text{ bytes}$)**!
* **Zero Memory Protection**: Hardware memory protection rings (Ring 0 vs. Ring 3), virtual memory page tables, and 64-bit general-purpose registers (`RAX` through `R15`) are completely disabled in silicon.

```text
THE 16-BIT REAL MODE MEMORY CEILING AT POWER-ON

 Physical Address Space (4 GB / 64 GB / Terabytes)
 ┌─────────────────────────────────────────────────────────────┐
 │ 0x0010_0000 to 0xFFFF_FFFF_FFFF_FFFF (Physical RAM)         │
 │ Status: UN-ADDRESSABLE IN REAL MODE!                        │
 ├─────────────────────────────────────────────────────────────┤ ◄── 1 MB Boundary (0x0010_0000)
 │ 0x0000_0000 to 0x000F_FFFF (1 MB Real Mode Window)          │ ◄── ACCESSIBLE IN REAL MODE
 └─────────────────────────────────────────────────────────────┘
  (64-bit OS kernels residing at 2 GB or 64 GB are physically unreachable!)
```

Now, consider the catastrophic architectural failure that occurs if platform firmware attempts to jump directly from early boot code to a modern 64-bit operating system kernel (such as 64-bit Linux or Windows) while the processor is still in 16-bit Real Mode:

1. **Instruction Decoder Mis-interpretation**: A 64-bit operating system kernel is compiled into $64\text{-bit}$ machine instructions that utilize REX prefixes (`0x48`) to access 64-bit registers (`RAX`, `R8`..`R15`). 

   If the CPU attempts to fetch and decode these 64-bit opcodes in 16-bit Real Mode, the 16-bit instruction decoder misinterprets REX prefix bytes as 16-bit `DEC EAX` (decrement) instructions! 
   
   The processor executes corrupted operations, alters register values unexpectedly, and crashes instantly.
2. **Physical Address Overflow**: A 64-bit operating system kernel is loaded into physical DRAM memory at an address far above the 1-Megabyte boundary—for example, at physical address `0x0000_0000_8000_0000` ($2\text{ Gigabytes}$). 
   
   In 16-bit Real Mode, the processor physically cannot generate a memory address higher than `0x0010_FFEF`. The CPU cannot even fetch the first instruction byte of the OS kernel!

A 64-bit operating system kernel cannot execute in 16-bit Real Mode!

Before platform firmware can hand execution over to a 64-bit operating system kernel, it must execute a multi-stage **CPU Execution Mode Transition**—stepping through 32-bit Protected Mode, constructing a Global Descriptor Table (GDT), configuring 4-level virtual memory page tables ($CR3$), and enabling control registers ($CR0, CR4, \text{IA32\_EFER}$)—to establish **64-Bit Long Mode Entry**.

To eliminate the 1-Megabyte memory ceiling and enable 64-bit kernel execution, platform firmware employs **CPU Execution Mode Transitions** and **Long Mode Entry**.


### Stage 1: The Single-Speed Bicycle (16-Bit Real Mode)
* **Environment**: The pilot pedals down the $10\text{-foot}$ dirt path to an automotive garage.
* **Limitation**: The dirt path limits movement to 5 miles per hour and caps distance to 1 mile (**1-Megabyte Memory Limit**).


### Stage 3: The Supersonic Jet Fighter (64-Bit Long Mode)
* **Entering the Airfield**: The sports car drives onto the main military airfield runway.
* **Activating Navigation Radar**: The pilot turns on the aircraft navigation radar (**Enables Physical Address Extension $CR4.\text{PAE} = 1$ and loads 4-level Page Tables into $CR3$**).
* **Flipping the Jet Engine Switch**: The pilot flips the master jet engine switch (**Sets Long Mode Enable $\text{IA32\_EFER.LME} = 1$ and Paging $CR0.\text{PG} = 1$**).
* **The Takeoff Run**: The pilot executes a high-speed takeoff acceleration run down the runway (**Pipeline Serializing Far Jump Instruction**).
* **Airborne Execution**: The jet takes off into the sky (**64-Bit Long Mode**), ascending to $50,000\text{ feet}$ (**64-bit flat address space**), where the pilot can fly anywhere across the globe at Mach 3!

This vehicle upgrade pipeline is the exact physical analogue of **CPU Execution Mode Transitions and 64-Bit Long Mode Entry**:
* The single-speed bicycle is **16-Bit Real Mode ($1\text{ MB}$ limit)**.
* The city sports car is **32-Bit Protected Mode ($4\text{ GB}$ limit)**.
* The supersonic jet fighter is **64-Bit Long Mode (Full $64\text{-bit}$ flat address space)**.
* The driver's license is the **Global Descriptor Table (GDT)**.
* The aircraft navigation radar is **Page Tables ($CR3$) and Physical Address Extension ($CR4.\text{PAE}$)**.
* The master jet engine switch is **Control Registers ($CR0.\text{PG}$ and $\text{IA32\_EFER.LME}$)**.
* The takeoff run is the **Pipeline Serializing Far Jump Instruction (`JMP FAR`)**.


### Step 1: 16-Bit Real Mode Execution Physics

Upon reset release, the x86-64 processor starts in 16-bit Real Mode. Memory addressing is governed by the **Real Mode Segmented Address Equation**:

$$\mathbf{\text{Physical Address (PA)} = (\text{Segment} \ll 4) + \text{Offset}}$$

Where:
* $\text{Segment}$ is the 16-bit value stored in a segment register (`CS, DS, SS, ES, FS, GS`).
* $\text{Offset}$ is the 16-bit address offset value (`IP, SP, BX, SI, DI`).
* $\ll 4$ represents a bitwise left-shift by 4 bits (multiplying the segment by 16).

The maximum addressable physical memory in Real Mode is:

$$\text{PA}_{\text{max}} = (\text{0xFFFF} \ll 4) + \text{0xFFFF} = \text{0xFFFF0} + \text{0xFFFF} = \mathbf{\text{0x10FFEF}} \approx \mathbf{1.048 \text{ Megabytes}}$$


### Step 3: Transitioning from Protected Mode to 64-Bit Long Mode

Now that the processor is running in 32-bit Protected Mode, firmware executes the 5-step sequence required to enter **64-Bit Long Mode**.

```text
64-BIT LONG MODE CONTROL REGISTER PREPARATION

 Control Register CR4 : Set Bit 5  (PAE = 1) -> Enables 64-Bit Page Entries
 Control Register CR3 : Set Base Address     -> Points to 4-Level Page Table Root
 MSR IA32_EFER        : Set Bit 8  (LME = 1) -> Enables Long Mode Architecture
 Control Register CR0 : Set Bit 31 (PG = 1)  -> Activates Virtual Paging & LMA!
```

#### Step 1: Enable Physical Address Extension ($CR4.\text{PAE} = 1$)
Long Mode requires 64-bit wide page table entries. Firmware sets Bit 5 (**Physical Address Extension / `PAE`**) in Control Register $CR4$:

$$\text{CR4} \Leftarrow \text{CR4} \quad \mathbf{\mid} \quad (1 \ll 5) \quad (CR4.\text{PAE} = 1)$$

#### Step 2: Load Page Table Root Pointer ($CR3$)
Firmware constructs a minimal 4-level identity page table tree in physical RAM (mapping virtual addresses $0 \dots 4\text{ GB}$ directly to physical addresses $0 \dots 4\text{ GB}$).

Firmware loads the physical address of the Page Map Level 4 (PML4) root table into Control Register $CR3$:

$$\text{CR3} \Leftarrow \text{Physical\_Address}(\text{PML4\_Table\_Root})$$

#### Step 3: Enable Long Mode in `IA32_EFER` MSR ($\text{EFER.LME} = 1$)
Firmware executes `RDMSR` / `WRMSR` to set Bit 8 (**Long Mode Enable / `LME`**) inside Model-Specific Register `IA32_EFER` (MSR `0xC000_0080`):

$$\text{IA32\_EFER} \Leftarrow \text{IA32\_EFER} \quad \mathbf{\mid} \quad (1 \ll 8) \quad (\text{EFER.LME} = 1)$$

#### Step 4: Enable Virtual Memory Paging ($CR0.\text{PG} = 1$)
Firmware sets Bit 31 (**Paging Enable / `PG`**) in Control Register $CR0$:

$$\text{CR0} \Leftarrow \text{CR0} \quad \mathbf{\mid} \quad (1 \ll 31) \quad (CR0.\text{PG} = 1)$$

#### The Hardware LMA Activation Trigger:
When $CR0.\text{PG} = 1$ is set while $\text{EFER.LME} = 1$ and $CR4.\text{PAE} = 1$, the CPU hardware automatically asserts Bit 10 (**Long Mode Active / `LMA`**) in `IA32_EFER`:

$$\mathbf{\text{EFER.LMA} \Leftarrow 1 \quad (\text{64-Bit Long Mode Is Now Active in Silicon!})}$$

#### Step 5: Far Jump into 64-Bit Code Segment
Although Long Mode is active, the CPU is currently operating in **Compatibility Mode** (executing 32-bit instructions).

To activate full **64-Bit Mode**:
1. Firmware constructs a 64-bit Code Segment Descriptor in the GDT with the **Long Mode Flag (`L` — Bit 21) set to $1$**.
2. Firmware executes a 64-bit Far Jump (`jmp 0x20:long_mode_entry`):

```x86asm
jmp     0x20:long_mode_entry        ; 0x20 = Selector for 64-Bit Code Segment (L-bit = 1)
[BITS 64]
long_mode_entry:
    ; CPU IS NOW EXECUTING IN FULL 64-BIT LONG MODE!
    ; 64-bit Registers RAX, RBX, RCX, RDX, R8..R15 are FULLY UNLOCKED!
```

The CPU reloads `CS = 0x20`, unlocks 64-bit general-purpose registers (`RAX` through `R15`), enables 64-bit instruction decoding, and steps into **64-Bit Long Mode**!


### 1. The Un-Flushed Prefetch Queue Hazard

Modern x86-64 CPU cores feature high-speed **Instruction Prefetch Queues** that read ahead and decode upcoming instructions.

Trace the catastrophic hardware pipeline failure if a far jump is omitted after setting $CR0.\text{PG} = 1$:

```text
UN-FLUSHED INSTRUCTION PREFETCH QUEUE HAZARD

 CPU Instruction Prefetch Queue (Filled while in 32-Bit Mode):
 [ Opcode 1 (32-bit) ][ Opcode 2 (32-bit) ][ Opcode 3 (32-bit) ]
                         │
                         ▼ Firmware sets CR0.PG = 1 (Activates 64-Bit Mode!)
 CPU Decoder attempts to execute Opcode 2 from Queue...
 BUT Opcode 2 was prefetched and decoded under 32-BIT DECODING RULES!
 64-bit execution engine misinterprets byte sequence -> TRIPLE FAULT CRASH!
```

1. While executing in 32-bit Protected Mode, the instruction prefetch queue loads upcoming 32-bit instructions into its internal buffer.
2. Firmware sets $CR0.\text{PG} = 1$, instantly switching the CPU execution hardware to 64-bit decoding rules.
3. On the very next clock cycle, the instruction execution unit reads Opcode 2 from the prefetch queue.
4. **The Crash**: Opcode 2 was decoded under 32-bit rules! The 64-bit execution engine attempts to execute the invalid pre-decoded instruction, generating a `#GP` General Protection Fault or `#UD` Invalid Opcode Fault. 

Because no 64-bit IDT handler exists yet, the exception triggers a `#DF` Double Fault, which escalates into a **Triple Fault**, resetting the CPU!

#### The Hardware Invariant:
Firmware **MUST execute an unconditional Far Jump (`JMP FAR`) or Far Return (`RETF`)** immediately after setting $CR0.\text{PG} = 1$. The far jump clears the prefetch queue and forces the instruction fetch unit to re-fetch upcoming instructions using 64-bit decoding rules!


## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of x86-64 execution mode transitions, GDT descriptor construction, control register flag updates ($CR0, CR4, \text{EFER}$), and pipeline serialization timing, let us walk through a complete, step-by-step quantitative engineering calculation.


### The Hardware Execution Tasks:

1. Calculate the physical write time $t_{\text{gdt\_write}}$ (in nanoseconds) to construct the 48-byte GDT in RAM at $25.6\text{ GB/sec}$.
2. Calculate the total CPU clock cycles $C_{\text{transition\_total}}$ and physical time $T_{\text{transition\_total}}$ (in nanoseconds) consumed by the complete 5-step mode transition pipeline.
3. Calculate the instruction fetch pipeline flush penalty: if Far Jump 2 flushes 16 prefetched 32-bit instructions ($64\text{ bytes}$) from the prefetch queue, requiring 1 fresh L1 Instruction Cache line fetch ($T_{\text{l1\_fetch}} = 12\text{ CPU cycles} = 3.75\text{ ns}$), compute the net pipeline reload overhead.
4. Calculate the execution speedup factor when a $1,000\text{-instruction}$ 64-bit math loop runs in 64-bit Long Mode (using 64-bit `RAX` registers in 1 cycle/instruction) versus running the same math operation in 16-bit Real Mode (requiring 4 16-bit instructions per 64-bit math operation).


#### Step 2: Calculate Total Mode Transition CPU Cycles and Execution Time

Summing CPU cycles across all 5 transition steps:

$$C_{\text{transition\_total}} = C_{\text{gdt\_write}} + C_{\text{lgdt}} + (C_{\text{cr0\_pe}} + C_{\text{far\_jump1}}) + (C_{\text{cr4\_pae}} + C_{\text{cr3\_load}}) + (C_{\text{efer\_lme}} + C_{\text{cr0\_pg}}) + C_{\text{far\_jump2}}$$

$$C_{\text{transition\_total}} = 6 + 16 + (4 + 32) + (4 + 120) + (250 + 4) + 64$$

$$C_{\text{transition\_total}} = 6 + 16 + 36 + 124 + 254 + 64 = \mathbf{500 \text{ CPU Clock Cycles}}$$

Calculate total physical execution time $T_{\text{transition\_total}}$ at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{transition\_total}} = 500 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{156.250 \text{ Nanoseconds}} \quad (0.15625\ \mu\text{s})$$

The complete 16-bit Real Mode $\to$ 64-bit Long Mode transition executes in **$156.250\text{ nanoseconds}$ ($500\text{ CPU clock cycles}$)**!


#### Step 4: Calculate 64-Bit Math Execution Speedup Factor

Consider executing 1,000 64-bit mathematical addition operations:

* **In 64-Bit Long Mode**: Uses 64-bit registers (`add rax, rbx`). Each 64-bit addition executes in $1\text{ instruction}$ ($1\text{ cycle}$).
  $$\text{Cycles}_{\text{longmode}} = 1,000 \text{ ops} \times 1 \text{ cycle/op} = \mathbf{1,000 \text{ CPU Clock Cycles}}$$
  $$T_{\text{longmode}} = 1,000 \times 0.3125\text{ ns} = \mathbf{312.50 \text{ Nanoseconds}}$$

* **In 16-Bit Real Mode**: Operating on 64-bit integers requires splitting each 64-bit number into four 16-bit chunks, executing 4 separate addition instructions with carry propagation (`ADD`, `ADC`, `ADC`, `ADC`):
  $$\text{Cycles}_{\text{realmode}} = 1,000 \text{ ops} \times 4 \text{ inst/op} \times 2 \text{ cycles/inst} = \mathbf{8,000 \text{ CPU Clock Cycles}}$$
  $$T_{\text{realmode}} = 8,000 \times 0.3125\text{ ns} = \mathbf{2,500.00 \text{ Nanoseconds}}$$

##### Calculate Performance Speedup Factor:

$$\text{Speedup Factor} = \frac{T_{\text{realmode}}}{T_{\text{longmode}}} = \frac{2,500.00\text{ ns}}{312.50\text{ ns}} = \frac{8,000\text{ cycles}}{1,000\text{ cycles}} = \mathbf{8.000\times \text{ Performance Speedup!}}$$

```text
CPU EXECUTION MODE PERFORMANCE SUMMARY

 Operational Mode        │ Address Space Capable │ 64-Bit Math Latency │ 1,000-Op Loop Time
─────────────────────────┼───────────────────────┼─────────────────────┼───────────────────
 16-Bit Real Mode        │ 1 Megabyte (20 Bits)  │ 8 CPU Clock Cycles  │ 2,500.00 ns
 64-Bit Long Mode        │ 16 Exabytes (64 Bits) │ 1 CPU Clock Cycle   │   312.50 ns
─────────────────────────┴───────────────────────┴─────────────────────┴───────────────────
 Long Mode Advantage     │ 16 Trillion x Memory! │ 8x Faster Math!     │ 8.00x SPEEDUP!
```

##### Engineering Conclusion:
By spending **$156.250\text{ nanoseconds}$ ($500\text{ CPU clock cycles}$)** to transition the CPU from 16-bit Real Mode to 64-bit Long Mode, early platform firmware unlocked full 64-bit flat virtual memory addressing and accelerated math processing by **$8.000\times$ ($700\%$ throughput increase)** before handing execution over to the operating system kernel!


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **CPU Execution Mode Transition**: The multi-stage hardware sequence where early boot firmware configures segment descriptor tables (GDT) and control registers ($CR0, CR4, \text{EFER}$) to step up CPU execution cores from power-on 16-bit Real Mode through 32-bit Protected Mode into 64-bit Long Mode.
* **Long Mode Entry**: The hardware activation step where setting $CR4.\text{PAE} = 1$, loading page table root into $CR3$, enabling $\text{EFER.LME} = 1$, setting $CR0.\text{PG} = 1$, and executing a pipeline-serializing far jump unlocks 64-bit general-purpose registers (`RAX`..`R15`) and 64-bit flat virtual memory addressing for the operating system kernel.