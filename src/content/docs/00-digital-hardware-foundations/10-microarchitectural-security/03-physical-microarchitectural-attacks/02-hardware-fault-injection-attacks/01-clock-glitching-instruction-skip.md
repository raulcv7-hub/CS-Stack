---
title: "Clock Glitching Fault Injection Mechanics and Instruction Skip Fault Induction"
---

# Clock Glitching Fault Injection Mechanics and Instruction Skip Fault Induction

In synchronous digital microprocessors, every operational step executed by the CPU—fetching an instruction opcode from memory, decoding register specifiers, evaluating conditional branch flags, or incrementing the Program Counter—is regulated by a global, periodic voltage pulse train known as the **Clock Signal ($CLK$)**. Within the silicon die, storage elements called D-type Flip-Flops capture digital voltage states on the rising edge of each clock pulse. For a flip-flop to reliably capture the output of a combinational logic circuit (such as a 32-bit adder or a password comparator), the electrical voltage arriving at the flip-flop's input pin must stabilize and remain unchanged for a minimum physical time window before the rising clock edge arrives—a physical requirement known as the **Setup Time ($t_{\text{su}}$)**. Under normal operating conditions, system designers select a clock frequency low enough to ensure that even the slowest, most complex combinational logic path finishes transitioning long before the next rising clock edge. However, an attacker with physical access to a microchip's clock input pin or power rail can use high-speed pulse generator hardware to inject an abnormally short clock pulse—a **Clock Glitch**—into the processor. By shortening a single clock period down to a few nanoseconds, the electrical voltage propagating through complex instruction decoding or branch comparison logic is forced to violate its setup time requirement. The receiving flip-flops capture incomplete, intermediate voltage levels, causing the CPU execution pipeline to mis-evaluate conditions or fail to update instruction registers. As a result, the processor skips critical security instructions—such as password checks, signature verifications, or loop boundary tests—and continues executing downstream instructions as if the security check had passed, creating an **Instruction Skip Fault** without altering a single byte of stored software code.

```text
CLOCK GLITCHING SETUP TIME VIOLATION MECHANICS

 Normal Clock Period T_clk (62.5 ns)
 CLK Signal : ───┐       ┌───┐       ┌───┐       ┌───
                 └───1───┘   └───2───┘   └───3───┘
 Data Output: ══════════════[ Valid Logic '1' ]══════
                            ◄───────► Setup Time t_su Met! (NO FAULT)

 Glitched Clock Period T_glitch (10.0 ns)
 CLK Signal : ───┐   ┌───┐   ┌───┐       ┌───
                 └──1┘ 2 └───┘   └───3───┘
 Data Output: ═══════[ Intermediate V_mid ]══════════
                     ▲
                     └─ VIOLATION! Setup Time t_su NOT Met! (FLIP-FLOP FAILS!)
```


## Flip-Flop Timing Invariants and Setup Time Violations

To understand how a nanosecond clock pulse forces a digital flip-flop to fail, we must examine the physical transistor-level timing rules that govern synchronous digital circuits.

### The Synchronous Digital Register Pair

In a digital microprocessor, all computations occur between pairs of storage registers (D-type Flip-Flops) connected by blocks of combinational logic gates (AND, OR, XOR gates, adders, and multiplexers).

```text
SYNCHRONOUS FLIP-FLOP TIMING PATH

 Transmitting Register (FF1)         Combinational Logic Block         Receiving Register (FF2)
 ┌──────────┐                        ┌───────────────────────┐         ┌──────────┐
 │ Clock    │                        │ Instruction Decoder / │         │ Clock    │
 │   C2Q    ├─ Q1 ──► [ Wire ] ─────►│ Password Comparator   ├─ D2 ───►│   Setup  │
 └────┬─────┘                        └───────────────────────┘         └────┬─────┘
      ▲                                                                     ▲
      │ CLK                                                                 │ CLK
 ═════╧═════════════════════════════════════════════════════════════════════╧════ Clock Rail
```

A complete clock cycle transfer progresses through three sequential physical stages:
1. **Clock-to-Q Launch Stage ($t_{\text{C2Q}}$)**: On the rising edge of Clock Pulse 1, Transmitting Register 1 (FF1) launches a new binary data bit ($0$ or $1$) from its output pin $Q_1$. The time required for the voltage to stabilize at $Q_1$ is the **Clock-to-Q Delay ($t_{\text{C2Q}}$)**.
2. **Combinational Propagation Stage ($t_{\text{prop}}$)**: The voltage signal travels through wires and logic gates (e.g., evaluating a password comparison or calculating a Program Counter addition). The total electrical delay through these gates is the **Combinational Propagation Delay ($t_{\text{prop}}$)**.
3. **Receiving Register Setup Stage ($t_{\text{su}}$)**: The output voltage $D_2$ arrives at the input pin of Receiving Register 2 (FF2). For FF2 to store $D_2$ correctly on Clock Pulse 2, $D_2$ must remain completely stable for a minimum time window before Clock Pulse 2 arrives—the **Setup Time ($t_{\text{su}}$)**.


### What Happens During a Setup Time Violation? Metastability and Old State Retention

When an attacker injects a clock glitch that forces $T_{\text{glitch}} \ll T_{\text{clk}}$, causing $S_{\text{setup}} < 0$:

What physically happens inside Receiving Register FF2?

1. **Intermediate Analog Voltage Sampling**: The electrical voltage $D_2$ arriving at FF2's input pin is mid-transition (e.g., $0.60\text{ V}$, exactly halfway between logical $0.0\text{ V}$ and logical $1.2\text{ V}$).
2. **Metastability or Old State Retention**:
   * The internal feedback transistors inside FF2 fail to latch the new value.
   * FF2 either **retains its previous state ($Q_{\text{new}} = Q_{\text{old}}$)** or enters a temporary oscillating state called **Metastability**.
3. **The Microarchitectural Result**: The destination register fails to update with the new calculated value! It keeps its old value from the previous clock cycle, causing the CPU execution pipeline to skip or mis-evaluate the instruction!


### Mechanism A: Skipping the Conditional Branch Instruction (`BNE`)

Suppose the attacker injects a nanosecond clock glitch during **Clock Cycle N+1** (when `BNE access_denied` is being executed):

1. **Instruction 1 (`CMP r0, r1`)** evaluated during Cycle N: Because the user password (`r0`) does not match the secret (`r1`), the ALU sets the Zero Flag to **$0$ ($Z = 0$)**, indicating "Not Equal".
2. **Instruction 2 (`BNE access_denied`)** dispatches during Cycle N+1:
   * The branch evaluation logic takes $t_{\text{prop\_branch}} = 8.0\text{ ns}$ to inspect the $Z$ flag, calculate the branch target address (`0x0800_2000`), and drive the "Branch Taken" signal to the Program Counter MUX.
   * Meanwhile, the simple Program Counter increment adder ($PC + 4$) takes only $t_{\text{prop\_PC}} = 1.5\text{ ns}$ to compute the next sequential address (`0x0800_1008`).

```text
BRANCH LOGIC VS PROGRAM COUNTER ADDER PROPAGATION DELAY

 Time t = 0 ns
 ├── PC Adder (Simple Logic) ────────► Calculates PC + 4 = 0x0800_1008 in 1.5 ns!
 │
 └── Branch Logic (Complex Logic) ───► Calculates Branch Target in 8.0 ns!
```

3. **THE CLOCK GLITCH STRIKES AT $t = 3.0\text{ ns}$!**
   * The attacker injects a glitch shortening Cycle N+1 from $15.0\text{ ns}$ down to **$3.0\text{ ns}$**!
   * **PC Adder Status ($1.5\text{ ns} < 3.0\text{ ns}$)**: PASSED! The simple $PC$ adder finished on time. The $PC$ register successfully captures `0x0800_1008`!
   * **Branch Logic Status ($8.0\text{ ns} > 3.0\text{ ns}$)**: **SETUP TIME VIOLATION!** The complex branch comparison logic did not finish! The "Branch Taken" multiplexer signal failed to arrive!
4. **The Fault Result**: The CPU ignores the branch and moves straight to address `0x0800_1008` (`MOV r0, #1`) on Cycle N+2!
5. **ADMIN ACCESS IS GRANTED WITHOUT A VALID PASSWORD!**

```text
FAULT INJECTION OUTCOME (INSTRUCTION SKIP)

 Normal Execution  : CMP (Z=0) ──► BNE Taken ──► Jumps to access_denied (BLOCKED!)
 Glitched Execution: CMP (Z=0) ──► BNE Fails ──► Falls through to MOV r0, #1 (GRANTED!)
 (The conditional branch instruction was PHYSICALLY SKIPPED!)
```


## Fault Injection Hardware Platforms and Silicon Defenses

Executing precise clock glitching attacks requires specialized hardware equipment capable of manipulating physical clock signals with sub-nanosecond accuracy.

### Hardware Fault Injection Platforms

```text
HARDWARE CLOCK GLITCHING ATTACK SETUP

 Attacker PC (Runs Control Software)
 ┌───────────────────────────┐
 │ Glitch Trigger Controller ├── USB / Serial Command
 └─────────────┬─────────────┘
               │
               ▼
 FPGA Glitch Generator (e.g., ChipWhisperer / Custom FPGA)
 ┌───────────────────────────┐
 │ High-Speed Digital Phase  │── Clock Glitch Pulse (1 - 10 ns)
 │ Shift & Pulse Multiplexer │
 └─────────────┬─────────────┘
               │
               ▼ Physical Clock Line (CLK Pin)
 Target Microcontroller / Secure Element Die
 ┌───────────────────────────┐
 │ CPU Core Execution Pipeline│
 └───────────────────────────┘
```

1. **FPGA Pulse Generators (ChipWhisperer / Custom FPGA Boards)**:
   An FPGA board contains high-speed Digital Clock Managers (DCMs) or Phase-Locked Loops (PLLs) capable of generating clock edges with **$100\text{-picosecond}$ phase resolution**.
2. **Clock Multiplexing Logic**:
   The FPGA monitors an external trigger signal (such as a UART transmission, a GPIO pin toggle, or a power consumption spike) indicating that the target CPU is about to execute a security check.
3. **Glitch Pulse Insertion**: Upon detecting the trigger, the FPGA's high-speed multiplexer replaces one normal clock cycle ($62.5\text{ ns}$) with a ultra-short $5\text{-ns}$ pulse, driving it directly into the target CPU's $CLK$ pin!


## Solved Industrial Engineering Exercise: Quantitative Clock Glitch Timing Analysis, Setup Slack Derivation, and Glitch Window Calculation

To consolidate your complete mastery of clock glitching fault injection, flip-flop setup timing invariants, negative slack derivations, and fault window calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Normal Timing Slack ($S_{\text{setup\_PC}}$ and $S_{\text{setup\_BNE}}$)

We apply the Timing Slack equation:

$$S_{\text{setup}} = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}} + t_{\text{su}} \right)$$

Given $T_{\text{clk}} = 62.5\text{ ns}$, $t_{\text{C2Q}} = 3.0\text{ ns}$, $t_{\text{su}} = 2.0\text{ ns}$:

##### 1. Program Counter Adder Timing Slack ($S_{\text{setup\_PC}}$):
Given $t_{\text{prop\_PC}} = 12.0\text{ ns}$:

$$S_{\text{setup\_PC}} = 62.5\text{ ns} - (3.0\text{ ns} + 12.0\text{ ns} + 2.0\text{ ns}) = 62.5 - 17.0 = \mathbf{+45.5 \text{ Nanoseconds (PASSED!)}}$$

##### 2. Branch Comparison Logic Timing Slack ($S_{\text{setup\_BNE}}$):
Given $t_{\text{prop\_BNE}} = 48.0\text{ ns}$:

$$S_{\text{setup\_BNE}} = 62.5\text{ ns} - (3.0\text{ ns} + 48.0\text{ ns} + 2.0\text{ ns}) = 62.5 - 53.0 = \mathbf{+9.5 \text{ Nanoseconds (PASSED!)}}$$

##### Normal Operation Result:
Both paths pass timing analysis. The branch logic has $+9.5\text{ ns}$ of positive timing slack during normal $16.0\text{-MHz}$ operation.


#### Step 3: Calculate Maximum Glitch Width to Force Branch Failure ($T_{\text{glitch\_max\_BNE}}$)

To force a setup time violation on the Branch Comparison Logic ($S_{\text{setup\_BNE}} < 0$), the glitched clock period $T_{\text{glitch}}$ must be strictly less than the total branch path delay:

$$T_{\text{glitch}} < t_{\text{C2Q}} + t_{\text{prop\_BNE}} + t_{\text{su}}$$

$$T_{\text{glitch\_max\_BNE}} = 3.0\text{ ns} + 48.0\text{ ns} + 2.0\text{ ns} = \mathbf{53.0 \text{ Nanoseconds}}$$

If $T_{\text{glitch}} < 53.0\text{ ns}$, the Branch Comparison Logic **violates setup time** and fails to drive the branch taken signal!


#### Step 5: Evaluate Clock Integrity Monitor Defense ($T_{\text{min\_allowed}} = 20.0\text{ ns}$)

Suppose the hardware team integrates an on-chip Clock Integrity Monitor configured to trigger an immediate hardware reset whenever $T_{\text{glitch}} < 20.0\text{ ns}$:

Let us evaluate the new fault window under this hardware monitor:

* If $T_{\text{glitch}} < 20.0\text{ ns}$: The Clock Integrity Monitor detects the short pulse and **asserts an immediate hardware reset**, rebooting the chip before the faulting instruction commits!
* If $20.0\text{ ns} \le T_{\text{glitch}} < 53.0\text{ ns}$:
  * $T_{\text{glitch}} \, (20.0\text{ ns}) \ge 17.0\text{ ns} \implies PC$ updates to $PC + 2$.
  * $T_{\text{glitch}} \, (20.0\text{ ns}) < 53.0\text{ ns} \implies$ Branch logic fails!
  * $T_{\text{glitch}} \, (20.0\text{ ns}) \ge 20.0\text{ ns} \implies$ **Clock Integrity Monitor does NOT trigger!**

$$\text{Restricted Fault Window} = 53.0\text{ ns} - 20.0\text{ ns} = \mathbf{33.0 \text{ Nanoseconds}}$$

##### Defense Conclusion:
A $20.0\text{-ns}$ clock monitor reduced the fault window slightly (from $36.0\text{ ns}$ down to $33.0\text{ ns}$), but **failed to prevent the attack**! 

To completely prevent Instruction Skip Faults on this chip, the Clock Integrity Monitor threshold MUST be increased to **$T_{\text{min\_allowed}} \ge 53.0\text{ nanoseconds}$**!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Clock glitching**: A physical hardware fault injection technique where an attacker injects an abnormally shortened clock pulse ($T_{\text{glitch}} \ll T_{\text{clk}}$) into a processor's clock rail, forcing setup time violations ($\text{Slack} < 0$) in complex combinational logic paths while allowing faster logic paths to complete.
* **Instruction skip fault**: The microarchitectural execution failure resulting from a setup time violation during instruction decoding or branch evaluation, where the Program Counter increments sequentially while the branch or security check logic fails to latch, causing the CPU to skip critical security instructions.
