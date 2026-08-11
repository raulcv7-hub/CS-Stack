---
title: "Hardware Tail-Chaining, Late-Arriving Vectors, and Zero-Overhead Interrupt Transitions"
---

# Hardware Tail-Chaining, Late-Arriving Vectors, and Zero-Overhead Interrupt Transitions

## The Redundant Unstacking and Restacking Latency Barrier

In real-time embedded systems, a central processing unit (CPU) executes a continuous main software program while responding to asynchronous hardware events called **Interrupt Requests ($IRQ$)**. 

When a peripheral device (such as a hardware timer or a serial port) asserts an $IRQ$ line, the hardware interrupt controller pauses the main program, automatically saves the CPU's working general-purpose registers onto the stack memory (**Hardware Context Stacking**), and jumps to the peripheral's **Interrupt Service Routine ($ISR$)**.

When the $ISR$ finishes executing, the CPU hardware executes an exception return sequence: it reads the saved working registers off the stack memory (**Hardware Context Unstacking**) and restores the Program Counter ($PC$) to resume the main software program at the exact instruction where it was interrupted.

On a 32-bit processor architecture (such as ARM Cortex-M), pushing the 8 caller-saved working registers ($r0..r3, r12, LR, PC, xPSR$) onto the stack memory requires transferring **32 bytes ($8\text{ words}$)** across the internal data bus. 

This hardware stacking operation takes **12 clock cycles**. Likewise, reading those 8 words back off the stack memory during the exception return phase takes another **12 clock cycles**.

Now, consider the physical performance disaster that occurs when two hardware interrupts fire in rapid succession:
1. **Interrupt 1 ($IRQ_1$)** fires. The CPU spends 12 clock cycles stacking its registers and enters $ISR_1$.
2. As $ISR_1$ reaches its final instruction (`bx lr`), **Interrupt 2 ($IRQ_2$)** becomes pending in the interrupt controller.

If the CPU operates under a naive, un-optimized exception return mechanism, trace the redundant clock cycle waste that occurs:

```text
NAIVE UN-OPTIMIZED BACK-TO-BACK INTERRUPT TRANSITION (24 CYCLES WASTED!)

 ISR 1 Execution Finishes (bx lr executed)
                       │
                       ▼ Naive Unstacking Phase (12 Clock Cycles)
 Reads 8 Registers OFF the Stack ──► Restores Main Program State
                                    │
                                    ▼ (On the very next clock cycle!)
 CPU sees IRQ 2 Pending! ───────────┘
                       │
                       ▼ Naive Restacking Phase (12 Clock Cycles)
 Pushes the EXACT SAME 8 Registers RIGHT BACK ONTO the Stack!
                       │
                       ▼
 CPU finally enters ISR 2! (24 CLOCK CYCLES WASTED ON MEMORY TRAFFIC!)
```

Look at the physical waste in this naive transition:
* The CPU spends 12 clock cycles reading 8 registers off the stack memory to restore the main program's state.
* On the very next clock cycle, the CPU detects that $IRQ_2$ is pending.
* The CPU immediately turns around and spends **another 12 clock cycles pushing those exact same 8 registers right back onto the stack**!
* The CPU burned **24 full clock cycles ($75.0\text{ nanoseconds}$ at $320\text{ MHz}$)** transferring identical data back and forth across the memory bus, without executing a single line of useful application code!

In high-frequency real-time applications (such as motor vector control, digital power conversion, or high-speed sensor processing) where back-to-back interrupts arrive continuously:
* Executing redundant unstacking and restacking operations consumes over **$30\%\text{ to } 50\%$ of total memory bus bandwidth**.
* Response latencies to pending interrupts are delayed by 24 clock cycles, causing jitter and missed real-time deadlines.

Why should a processor waste memory bandwidth popping registers off the stack only to push them right back on one cycle later, when the CPU could simply leave the registers sitting safely on the stack and jump directly to the next pending interrupt?

To eliminate redundant stack memory transfers, optimize real-time responsiveness, and achieve zero-overhead exception transitions, modern hardware interrupt controllers incorporate **Interrupt Tail-Chaining** and **Late-Arriving Interrupt Optimization**.


### Policy 1: The Rigid Packing Rule (Naive Unstacking / Restacking)

The hospital manager enforces a rigid, naive administrative rule: *"After you finish treating ANY patient in the trauma bay, you MUST pack all 8 tools back into your suitcase, walk back to your office desk, and sit down before looking at the emergency board again!"*

Look at what happens when Patient 1 (**$ISR_1$**) and Patient 2 (**$ISR_2$**) arrive in rapid succession:

1. **8:00 AM**: Patient 1 arrives ($IRQ_1$). The surgeon opens their suitcase, takes out the 8 surgical tools, and places them on the sterile tray (**12 Minutes Stacking Time**).
2. **8:12 AM**: The surgeon treats Patient 1 (**Executing $ISR_1$**).
3. **8:20 AM**: The surgeon finishes treating Patient 1.
4. **The Naive Packing Waste**:
   * Following the rigid rule, the surgeon spends **12 minutes packing all 8 tools back into the suitcase** and walking back to their office desk (**Unstacking Registers**).
   * At 8:32 AM, the surgeon sits at their desk, looks at the emergency board, and sees **Patient 2 ($IRQ_2$) is waiting in Trauma Bay #102**!
   * The surgeon stands up, carries the suitcase back to Trauma Bay #102, and spends **ANOTHER 12 minutes unpacking the exact same 8 tools onto the tray** (**Restacking Registers**)!
5. **8:44 AM**: The surgeon finally begins treating Patient 2!

```text
POLICY 1: RIGID PACKING RULE (24 MINUTES WASTED!)

 08:20 AM : Surgeon finishes Patient 1
 08:20 AM : Packs 8 tools into suitcase (12 Mins)  ──► 08:32 AM (Office Desk)
 08:32 AM : Sees Patient 2 waiting -> Unpacks tools (12 Mins) ──► 08:44 AM (Trauma Bay)
 (Spent 24 minutes packing and unpacking the exact same tools!)
```

Look at the absurdity of Policy 1:
The surgeon spent **24 minutes packing and unpacking identical tools** between adjacent rooms! Patient 2 waited 24 extra minutes in pain while the surgeon packed and unpacked a suitcase!


### Policy 3: The Mid-Setup Patient Swap (Late-Arriving Interrupt Optimization)

Now, consider a different scenario:
* The surgeon is currently opening their suitcase to treat a patient with a minor paper cut (**Low-Priority $IRQ$**).
* They are 4 minutes into the 12-minute unpacking process.
* Suddenly, an ambulance rushes in carrying a heart attack patient (**High-Priority $IRQ$**)!

#### What happens without Late-Arriving Optimization?
The surgeon finishes unpacking the tools (8 minutes), treats the paper cut patient, and then treats the heart attack patient—wasting critical time!

#### What happens WITH Late-Arriving Optimization?
1. The surgeon is midway through unpacking the tools for the paper cut patient.
2. The heart attack patient arrives!
3. **The Late-Arriving Swap**:
   * The surgeon **does NOT stop or restart unpacking**!
   * The surgeon continues unpacking the tools (finishing the remaining 8 minutes).
   * But instead of treating the paper cut patient, the surgeon **swaps the patient chart in their hand** and uses the tools to treat the **heart attack patient FIRST**!

```text
MID-SETUP PATIENT SWAP (LATE-ARRIVING OPTIMIZATION)

 08:00 AM : Unpacking tools for Paper Cut Patient (4 Mins elapsed)
 08:04 AM : Heart Attack Patient arrives!
            │
            ▼ SWAP PATIENT CHART MID-SETUP!
 08:08 AM : Unpacking finishes (12 Mins total) ──► Treats Heart Attack Patient FIRST!
 (Zero extra unpacking penalty! Heart attack patient treated with 0 delay!)
```

This surgical tray system is the exact physical analogue of **Hardware Tail-Chaining and Late-Arriving Interrupt Optimization**:
* The chief surgeon is the **CPU Core Execution Pipeline**.
* Surgical tools in the suitcase are **Caller-Saved Registers ($r0..r3, r12, LR, PC, xPSR$)**.
* The sterile tray is **Physical Stack Memory ($SP$)**.
* Emergency patients are **Hardware Interrupt Requests ($IRQ$)**.
* Leaving tools on the tray between patients is **Interrupt Tail-Chaining**.
* Swapping patient charts mid-setup is **Late-Arriving Vector Swapping**.


### 1. The Standard 12-Cycle Hardware Unstacking Pipeline

To understand how tail-chaining saves time, we must first analyze the standard, un-optimized hardware exception return pipeline.

When an Interrupt Service Routine ($ISR$) finishes executing, its final instruction is a standard function return:

```assembly
/* STANDARD ISR EXCEPTION RETURN INSTRUCTION */
bx      lr          /* Where LR contains EXC_RETURN (e.g., 0xFFFFFFFD) */
```

When the CPU hardware executes `bx lr` with `LR = 0xFFFFFFFD`, the processor's exception state machine detects an **`EXC_RETURN` Code** and initiates the **12-Cycle Hardware Unstacking Pipeline**:

```text
STANDARD 12-CYCLE HARDWARE UNSTACKING TIMELINE

 Clock Cycle : C1   C2   C3   C4   C5   C6   C7   C8   C9   C10  C11  C12
 Memory Bus  : [r0] [r1] [r2] [r3] [r12][LR] [PC] [xPSR] ──► [Pipeline Flush]
 Stack (SP)  : Reads 8 Words OFF Stack Memory ──────► SP <= SP + 32 Bytes
                                                      ▲
                                                      │ Main Program Resumes
```

* **Cycles 1 through 8**: The hardware reads 8 32-bit words ($r0, r1, r2, r3, r12, LR, PC, xPSR$) sequentially off the physical stack memory ($SP$) across the data bus, restoring their values into the physical register file.
* **Cycles 9 through 12**: The hardware increments the Stack Pointer ($SP \Leftarrow SP + 32$), updates the Execution Program Status Register ($xPSR$), flushes the instruction fetch pipeline, and fetches the first instruction of the main application program from the restored $PC$ address.

Total Unstacking Duration $= \mathbf{12 \text{ Clock Cycles}}$.


### Mathematical Proof of Cycle Savings via Tail-Chaining

Let us derive the exact memory bus traffic and clock cycle savings provided by hardware tail-chaining during back-to-back interrupt execution.

Let $T_{\text{stack}}$ be the time required to push 8 registers onto the stack ($T_{\text{stack}} = 12\text{ cycles}$).
Let $T_{\text{unstack}}$ be the time required to pop 8 registers off the stack ($T_{\text{unstack}} = 12\text{ cycles}$).
Let $T_{\text{tail\_chain}}$ be the time required to execute a tail-chaining vector transition ($T_{\text{tail\_chain}} = 6\text{ cycles}$).

#### 1. Transition Latency under Naive Unstacking/Restacking:

$$T_{\text{naive}} = T_{\text{unstack}} + T_{\text{stack}} = 12\text{ cycles} + 12\text{ cycles} = \mathbf{24 \text{ Clock Cycles}}$$

#### 2. Transition Latency under Hardware Tail-Chaining:

$$T_{\text{tail\_chained}} = T_{\text{tail\_chain}} = \mathbf{6 \text{ Clock Cycles}}$$

#### 3. Net Clock Cycle Savings per Back-to-Back Interrupt Event:

$$\text{Cycles Saved} = T_{\text{naive}} - T_{\text{tail\_chained}} = 24\text{ cycles} - 6\text{ cycles} = \mathbf{18 \text{ Clock Cycles Saved!}}$$

$$\text{Percentage Latency Reduction} = \left( 1 - \frac{6}{24} \right) \times 100\% = \mathbf{75.0\% \text{ Latency Reduction!}}$$

```text
TAIL-CHAINING LATENCY SAVINGS SUMMARY

 Exception Transition Mode │ Clock Cycles Burned │ Memory Bus Bytes Transferred │ Transition Latency (at 320 MHz)
───────────────────────────┼─────────────────────┼──────────────────────────────┼─────────────────────────────────
 Naive Pop & Push          │ 24 Clock Cycles     │ 64 Bytes (32B Pop + 32B Push)│ 75.00 Nanoseconds
 Hardware Tail-Chaining    │  6 Clock Cycles     │  4 Bytes (Vector Fetch Only!)│ 18.75 Nanoseconds
                           │ (18 Cycles Saved!)  │ (60 Bytes Saved!)            │ (75.0% Time Saved!)
```

#### Physical Result:
Tail-chaining reduces exception transition delay by **$75.0\%$** (from 24 cycles down to 6 cycles) and cuts memory bus traffic from **$64\text{ bytes}$ down to $4\text{ bytes}$**, freeing $93.75\%$ of memory bus bandwidth for application data processing!


### 4. Pop-Preemption Optimization Mechanics

A third related hardware optimization is **Pop-Preemption**.

What happens if the CPU is in the middle of unstacking 8 registers (Cycles 1–12) to return to the main program, and a high-priority interrupt ($IRQ_{\text{high}}$) fires at **Cycle 6 of unstacking**?

```text
POP-PREEMPTION RECOVERY PIPELINE

 Unstacking Cycle 1..6 : Popping registers r0..r12 off Stack...
 Time t = 6 c          : IRQ_high (High Priority) FIRES MID-UNSTACKING!
                         │
                         ▼ POP-PREEMPTION TRIGGERED!
 1. Abort Unstacking Pipeline immediately!
 2. Rewind Stack Pointer back to SP_stacked!
 3. Vector-swap to ISR_high in 6 Clock Cycles!
```

1. The CPU detects $IRQ_{\text{high}}$ at Cycle 6 of unstacking.
2. The hardware **aborts the unstacking operation immediately**!
3. The hardware rewinds the Stack Pointer back to $SP_{\text{stacked}}$, restoring the valid stack frame that is still sitting in RAM.
4. The hardware fetches $ISR_{\text{high}}$'s vector address and enters $ISR_{\text{high}}$ in **only $6\text{ clock cycles}$**, completely eliminating the remaining 6 cycles of unstacking and 12 cycles of re-stacking!


### 1. Flash Memory Wait-State Impact on Tail-Chaining

In high-frequency processors running at $168\text{ MHz}$ or $300\text{ MHz}$, non-volatile Flash ROM memory cannot respond in a single clock cycle. Reading a 32-bit vector address from Flash ROM requires **Flash Wait States** (e.g., $5\text{ wait states}$ in `FLASH_ACR`).

How do Flash wait states affect tail-chaining latency?

```text
FLASH WAIT-STATE IMPACT ON TAIL-CHAINING LATENCY

 Zero-Wait-State SRAM Vector Table:
 Tail-Chain Duration = 4c (Bus Freeze) + 2c (Vector Fetch) = 6 Clock Cycles!

 5-Wait-State Flash ROM Vector Table:
 Tail-Chain Duration = 4c (Bus Freeze) + 2c (Vector Fetch) + 5c (Wait States) = 11 Clock Cycles!
```

* On a $0\text{-wait-state}$ internal SRAM memory vector table, a tail-chain transition takes **$6\text{ clock cycles}$**.
* On a $5\text{-wait-state}$ Flash ROM vector table, fetching the new vector address takes $2 + 5 = 7\text{ cycles}$, extending tail-chaining transition time to **$11\text{ clock cycles}$**.

#### Industrial Best Practice (Relocating Vector Tables to SRAM):
To maintain minimum $6\text{-cycle}$ tail-chaining latency at high clock frequencies, high-performance real-time applications **copy the Interrupt Vector Table into internal SRAM at boot-up** and update the Vector Table Offset Register (`VTOR = 0x2000_0000`), ensuring all vector fetches complete in zero wait states!


## Solved Industrial Engineering Exercise: Quantitative Tail-Chaining Cycle Analysis, Late-Arriving Vector Trace, and Assembly Timing Synthesis

To consolidate your complete mastery of hardware tail-chaining, late-arriving vector swapping, pop-preemption, and memory bus cycle savings, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Trace Hardware Pipeline Timeline (Cycles & Nanoseconds)

Let us trace the physical hardware execution step-by-step from $t = 0.0\text{ ns}$ (Cycle 0):

##### 1. Event 1 ($t = 0.0\text{ ns}$ / Cycle 0 — Timer $IRQ_{10}$ Fires):
* Timer $IRQ_{10}$ (Priority 3) fires. CPU halts main loop and begins 12-cycle hardware stacking ($r0..r3, r12, LR, PC, xPSR$).
* Scheduled stacking duration: Cycles 0 to 12 ($t = 0.0\text{ ns to } 3.75\text{ ns}$).

##### 2. Event 2 ($t = 1.0\text{ ns}$ / Cycle 3.2 — Late-Arriving Motor $IRQ_0$ Fires!):
* At $t = 1.0\text{ ns}$ (Cycle 3.2), Motor $IRQ_0$ (Priority 0) fires **mid-stacking**!
* **Late-Arriving Vector Swap Execution**:
  * Priority check: $\text{Priority}(IRQ_0 = 0) < \text{Priority}(IRQ_{10} = 3) \implies \mathbf{\text{HIGHER PRIORITY!}}$
  * Hardware continues ongoing 12-cycle stacking (Cycles 3.2 to 12).
  * On Cycle 10 ($t = 3.125\text{ ns}$), hardware **swaps the vector fetch target address from $ISR_{10}$ to $ISR_0$**!
* At Cycle 12 ($t = 3.75\text{ ns}$), 12-cycle stacking finishes. CPU jumps **DIRECTLY into Motor $ISR_0$**!
* **Result**: Motor $IRQ_0$ executed with **ZERO extra stacking delay ($12\text{ cycles} = 3.75\text{ ns}$ total latency)**!

##### 3. Motor $ISR_0$ Execution ($t = 3.75\text{ ns to } 16.25\text{ ns}$ / Cycles 12 to 52):
* Motor $ISR_0$ executes its 40 instruction cycles ($40 \times 0.3125\text{ ns} = 12.50\text{ ns}$).
* Motor $ISR_0$ completes at Cycle 52 ($t = 16.25\text{ ns}$).

##### 4. Event 3 ($t = 15.0\text{ ns}$ / Cycle 48 — UART $IRQ_5$ Fires Mid-Execution):
* At $t = 15.0\text{ ns}$ (Cycle 48), UART $IRQ_5$ (Priority 2) fires while $ISR_0$ (Priority 0) is active.
* Priority check: $\text{Priority}(IRQ_5 = 2) > \text{Priority}(ISR_0 = 0) \implies \mathbf{\text{LOWER PRIORITY! NO PREEMPTION!}}$
* UART $IRQ_5$ is set to Pending state in `ISPR`.

##### 5. First Tail-Chaining Transition ($t = 16.25\text{ ns}$ / Cycle 52 — $ISR_0 \to ISR_5$):
* Motor $ISR_0$ executes `bx lr` at Cycle 52 ($t = 16.25\text{ ns}$).
* Hardware checks pending IRQs: UART $IRQ_5$ (Priority 2) vs Timer $IRQ_{10}$ (Priority 3).
* Priority evaluation: Priority 2 beats Priority 3!
* **Tail-Chain 1 Executed**:
  * Hardware **SKIPS UNSTACKING AND RESTACKING**!
  * Executes $6\text{-cycle}$ tail-chain transition (Cycles 52 to 58, $1.875\text{ ns}$).
* At Cycle 58 ($t = 18.125\text{ ns}$), CPU jumps directly into UART $ISR_5$!

##### 6. UART $ISR_5$ Execution ($t = 18.125\text{ ns to } 36.875\text{ ns}$ / Cycles 58 to 118):
* UART $ISR_5$ executes its 60 instruction cycles ($60 \times 0.3125\text{ ns} = 18.75\text{ ns}$).
* UART $ISR_5$ completes at Cycle 118 ($t = 36.875\text{ ns}$).

##### 7. Second Tail-Chaining Transition ($t = 36.875\text{ ns}$ / Cycle 118 — $ISR_5 \to ISR_{10}$):
* UART $ISR_5$ executes `bx lr` at Cycle 118.
* Hardware checks pending IRQs: Timer $IRQ_{10}$ (Priority 3) is pending!
* **Tail-Chain 2 Executed**:
  * Hardware **SKIPS UNSTACKING AND RESTACKING**!
  * Executes $6\text{-cycle}$ tail-chain transition (Cycles 118 to 124, $1.875\text{ ns}$).
* At Cycle 124 ($t = 38.75\text{ ns}$), CPU jumps directly into Timer $ISR_{10}$!

##### 8. Timer $ISR_{10}$ Execution & Final Unstacking ($t = 38.75\text{ ns to } 67.50\text{ ns}$ / Cycles 124 to 216):
* Timer $ISR_{10}$ executes its 80 instruction cycles ($80 \times 0.3125\text{ ns} = 25.00\text{ ns}$).
* At Cycle 204 ($t = 63.75\text{ ns}$), Timer $ISR_{10}$ executes `bx lr`.
* Zero IRQs pending! Hardware executes **12-cycle unstacking** (Cycles 204 to 216, $3.75\text{ ns}$).
* At Cycle 216 ($t = 67.50\text{ ns}$), CPU resumes Main Application Loop!

```text
COMPLETE HARDWARE PIPELINE EXECUTION CHRONOLOGY

 Cycle Range │ Time Window (ns)  │ Executing Target Module       │ Hardware State Action
─────────────┼───────────────────┼───────────────────────────────┼─────────────────────────────
    0 .. 12  │   0.000 ..   3.750│ Stacking / Late Vector Swap   │ Late-Arriving Swap to ISR 0!
   12 .. 52  │   3.750 ..  16.250│ Motor ISR 0 (40 Cycles)       │ Executing Priority 0 ISR
   52 .. 58  │  16.250 ..  18.125│ Tail-Chain 1 (6 Cycles)       │ Tail-Chaining ISR 0 -> ISR 5
   58 .. 118 │  18.125 ..  36.875│ UART ISR 5 (60 Cycles)        │ Executing Priority 2 ISR
  118 .. 124 │  36.875 ..  38.750│ Tail-Chain 2 (6 Cycles)       │ Tail-Chaining ISR 5 -> ISR 10
  124 .. 204 │  38.750 ..  63.750│ Timer ISR 10 (80 Cycles)      │ Executing Priority 3 ISR
  204 .. 216 │  63.750 ..  67.500│ Unstacking (12 Cycles)        │ Final Return to Main Loop
```


#### Step 3: Calculate Cycle, Latency, and Memory Bandwidth Savings

##### 1. Total CPU Clock Cycles Saved:

$$\text{Cycles Saved} = \text{Cycles}_{\text{naive}} - \text{Cycles}_{\text{optimized}} = 264\text{ cycles} - 216\text{ cycles} = \mathbf{48 \text{ CPU Clock Cycles Saved!}}$$

$$\text{Time Saved} = 82.500\text{ ns} - 67.500\text{ ns} = \mathbf{15.000 \text{ Nanoseconds Saved!}}$$

##### 2. Stack Memory Bus Bytes Saved:
* Naive transitions executed 3 extra 32-byte pop/push cycles $= 3 \times 64\text{ bytes} = 192\text{ bytes}$ of redundant memory transfers.
* Optimized transitions executed 2 4-byte vector fetches $= 8\text{ bytes}$ of memory transfers.

$$\text{Memory Bus Bytes Saved} = 192\text{ Bytes} - 8\text{ Bytes} = \mathbf{184 \text{ Bytes of Memory Bus Traffic Saved!}}$$

##### 3. Overall Performance Speedup Factor:

$$\text{Speedup} = \frac{T_{\text{naive\_total}}}{T_{\text{optimized\_total}}} = \frac{82.500\text{ ns}}{67.500\text{ ns}} = \frac{264\text{ cycles}}{216\text{ cycles}} \approx \mathbf{1.2222\times \text{ Performance Speedup!}}$$

```text
INTERRUPT HARDWARE OPTIMIZATION PERFORMANCE SUMMARY

 Performance Metric          │ Naive Un-Optimized System │ Hardware Tail-Chain / Late-Arr │ Optimization Gain
─────────────────────────────┼───────────────────────────┼────────────────────────────────┼───────────────────
 Total Execution Time (3 IRQs)│ 82.500 Nanoseconds        │ 67.500 Nanoseconds             │ 15.00 ns Saved!
 CPU Clock Cycles Burned     │ 264 Clock Cycles          │ 216 Clock Cycles               │ 48 Cycles Saved!
 Motor IRQ 0 Entry Latency   │ 24 Cycles (7.50 ns)       │ 12 Cycles (3.75 ns)            │ 50% Latency Cut!
 Memory Bus Traffic Transferred│ 256 Bytes                 │ 72 Bytes                       │ 184 Bytes Saved!
 Overall Execution Speedup   │ 1.000x (Baseline)         │ 1.222x FASTER!                 │ +22.2% Speedup
```

##### Engineering Conclusion:
By employing **Late-Arriving Vector Swapping** and **Hardware Tail-Chaining**, the processor cut high-priority Motor $IRQ_0$ entry latency in half ($7.50\text{ ns} \to 3.75\text{ ns}$) and eliminated $184\text{ bytes}$ of redundant stack memory bus traffic, accelerating multi-interrupt stream processing by **$22.22\%$ ($1.222\times$ speedup)** on the exact same physical hardware!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Interrupt Tail-Chaining**: A hardware exception return optimization where, upon completing an ISR with another interrupt pending, the CPU skips restoring and re-saving registers, transitioning directly to the pending ISR in just 6 clock cycles instead of 24 clock cycles.
* **Late-Arriving Interrupt Optimization**: A hardware exception entry optimization where, if a higher-priority interrupt arrives during the 12-cycle context-stacking phase of a lower-priority interrupt, the CPU completes the ongoing stacking phase but vector-swaps the PC directly to the higher-priority ISR's address without extra stacking penalty.

TERMINADO