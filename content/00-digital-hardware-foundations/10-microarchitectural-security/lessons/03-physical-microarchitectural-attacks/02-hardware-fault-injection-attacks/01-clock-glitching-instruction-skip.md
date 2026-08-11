content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/03-physical-microarchitectural-attacks/02-hardware-fault-injection-attacks/01-clock-glitching-instruction-skip.md
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

---

## The Factory Strobe Light and the Conveyor Belt Worker

To build an intuitive, crystal-clear mental model of how clock glitching disrupts digital circuits and causes instructions to be skipped, let us consider an everyday analogy: a factory assembly line operating under a strobe light.

Imagine a worker (a D-type Flip-Flop Register) standing at an assembly station along a conveyor belt inside a dark factory. The worker's job is to inspect incoming items traveling down the conveyor belt and install a heavy security lock on every item that passes by (**Executing a Security Check Instruction**).

The factory is completely dark except for a bright strobe light (the CPU Clock Signal $CLK$) mounted on the ceiling. The worker performs their assembly task in synchronized steps governed by the flashes of the strobe light:
1. Every time the strobe light flashes ON (**The Rising Clock Edge**), the worker looks at the item sitting on the conveyor belt in front of them, grabs the appropriate part, and snaps it into place.
2. While the strobe light is OFF (**The Clock Low Phase**), the conveyor belt moves forward, bringing the next item from the machine shop to the worker's station.

```text
THE FACTORY CONVEYOR BELT METAPHOR

 Machine Shop (Combinational Logic)             Worker Station (Flip-Flop Register)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Prepares Security Lock    │                 │ Inspects Item & Installs  │
 │ Component (10 Seconds)    │                 │ Lock when Strobe Flashes  │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼ Conveyor Belt Travel Time                   │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ STROBE LIGHT (CPU CLOCK SIGNAL)                                         │
 │ Flashes ON every 15 Seconds (Normal Operation)                          │
 └─────────────────────────────────────────────────────────────────────────┘
```

The physical assembly process requires specific time windows:
* **Conveyor Belt Travel Time ($t_{\text{prop}}$)**: It takes **10 seconds** for the machine shop to assemble a complex security lock component and move it down the belt to the worker's station.
* **Worker Alignment Time ($t_{\text{su}}$)**: The worker needs the component to sit completely still in front of them for at least **2 seconds** before the strobe light flashes, so they can align their tools.
* **Total Required Window**: $10\text{ seconds} + 2\text{ seconds} = \mathbf{12 \text{ seconds}}$.

Under normal factory operation, the factory manager sets the strobe light to flash **once every 15 seconds** ($T_{\text{clk}} = 15\text{ seconds}$):
* 10 seconds for the component to travel down the belt + 2 seconds for alignment = 12 seconds total required time.
* $12\text{ seconds} \le 15\text{ seconds}$. The component arrives on time, sits still for 3 seconds, the strobe light flashes, and the worker snaps the security lock into place with $100\%$ perfection!

Now, watch what happens when a mischievous prankster (a Hardware Fault Injector) gains access to the strobe light controls:

```text
THE PREMATURE STROBE LIGHT FLASH (CLOCK GLITCH)

 Component traveling on belt: [ 0s ] ──► [ 4s ] ──► [ 8s ] ──► [ 10s Arrived! ]
                                           ▲
 Prankster Flashes Strobe at Second 5! ────┘
 Component is only halfway down the belt! Worker snaps NOTHING into place!
 (Security Lock Component is COMPLETELY SKIPPED!)
```

1. A critical item requiring a security lock enters the conveyor belt at Second 0.
2. The machine shop begins building the security lock. The component requires 10 seconds to reach the worker.
3. At **Second 5**, while the security lock is only halfway down the conveyor belt, the prankster **flashes the strobe light prematurely**! (**Injecting a Clock Glitch!**)
4. What happens to the worker?
   * The strobe light flashes for a split second. The worker reaches down to snap the security lock into place.
   * But the security lock component has **not arrived yet**! It is still moving down the belt 5 feet away!
   * The worker's hands close on empty air.
5. At Second 15, the normal strobe light flashes again. By now, the conveyor belt has moved past the security station onto the next task!

Look at what occurred in this factory:
* The worker made no mistake.
* The security lock component was not broken.
* Yet, because the strobe light flashed prematurely at Second 5, **the worker completely skipped installing the security lock**!
* The item moved down the assembly line without a security lock, fully accessible to anyone!

This factory scenario is the exact physical analogue of **Clock Glitching Fault Injection**:
* The worker is a **D-Type Flip-Flop Register**.
* The conveyor belt travel time is **Combinational Logic Propagation Delay ($t_{\text{prop}}$)**.
* The 2-second alignment time is **Flip-Flop Setup Time ($t_{\text{su}}$)**.
* The strobe light is the **CPU Clock Signal ($CLK$)**.
* Flashing the strobe light at Second 5 is **Injecting a Nanosecond Clock Glitch ($T_{\text{glitch}} \ll T_{\text{clk}}$)**.
* Skipping the security lock is an **Instruction Skip Fault**.

---

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

---

### The Fundamental Timing Slack Equation

For any digital circuit to operate without errors, the physical clock period $T_{\text{clk}}$ must satisfy **The Fundamental Setup Timing Invariant**:

$$\mathbf{T_{\text{clk}} \ge t_{\text{C2Q}} + t_{\text{prop}} + t_{\text{su}}}$$

Where:
* $T_{\text{clk}}$ is the physical duration of one clock cycle in picoseconds ($T_{\text{clk}} = \frac{1}{f_{\text{clk}}}$).
* $t_{\text{C2Q}}$ is the Clock-to-Q propagation delay of the launching flip-flop in picoseconds.
* $t_{\text{prop}}$ is the total combinational propagation delay through logic gates and wire traces in picoseconds.
* $t_{\text{su}}$ is the required setup time of the receiving flip-flop in picoseconds.

The safety margin between the available clock period and the required logic delay is called **Timing Slack ($S_{\text{setup}}$)**:

$$\mathbf{S_{\text{setup}} = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}} + t_{\text{su}} \right)}$$

* **Positive Slack ($S_{\text{setup}} \ge 0$)**: The signal arrives on time. The circuit operates with $100\%$ digital correctness.
* **Negative Slack ($S_{\text{setup}} < 0$)**: **SETUP TIME VIOLATION!** The clock edge arrives before the signal finishes transitioning. The digital abstraction breaks down!

```text
TIMING SLACK DIAGRAM (NORMAL VS GLITCHED)

 Normal Operation (Slack > 0):
 ├── t_C2Q ──┤◄────────── t_prop ──────────►│◄─ t_su ─►│◄─ Slack ─►│
 ├───────────────────────── T_clk = 62.5 ns ───────────────────────┤ (PASSED!)

 Glitched Operation (Slack < 0):
 ├── t_C2Q ──┤◄────────────── t_prop ──────────────►│ (Arrives LATE!)
 ├────────── T_glitch = 10.0 ns ──────────┤
 ◄── VIOLATION! Clock edge arrives BEFORE data is stable! ────────►
```

---

### What Happens During a Setup Time Violation? Metastability and Old State Retention

When an attacker injects a clock glitch that forces $T_{\text{glitch}} \ll T_{\text{clk}}$, causing $S_{\text{setup}} < 0$:

What physically happens inside Receiving Register FF2?

1. **Intermediate Analog Voltage Sampling**: The electrical voltage $D_2$ arriving at FF2's input pin is mid-transition (e.g., $0.60\text{ V}$, exactly halfway between logical $0.0\text{ V}$ and logical $1.2\text{ V}$).
2. **Metastability or Old State Retention**:
   * The internal feedback transistors inside FF2 fail to latch the new value.
   * FF2 either **retains its previous state ($Q_{\text{new}} = Q_{\text{old}}$)** or enters a temporary oscillating state called **Metastability**.
3. **The Microarchitectural Result**: The destination register fails to update with the new calculated value! It keeps its old value from the previous clock cycle, causing the CPU execution pipeline to skip or mis-evaluate the instruction!

---

## Microarchitectural Mechanics of Instruction Skip Faults

Now let us examine how forcing a setup time violation inside a CPU's execution pipeline causes the processor to skip a specific assembly instruction.

### Anatomy of an Instruction Skip in a Pipelined Processor

Consider an ARM or x86 processor executing a password verification routine in assembly language:

```assembly
; Password Verification Assembly Loop
0x0800_1000: CMP r0, r1       ; Inst 1: Compare user input (r0) with secret password (r1)
0x0800_1004: BNE access_denied; Inst 2: Branch to access_denied if r0 != r1
0x0800_1008: MOV r0, #1       ; Inst 3: GRANT ADMIN ACCESS!
```

Let us trace the physical execution path of Instruction 1, Instruction 2, and Instruction 3 across the CPU pipeline stages:

```text
PIPELINE EXECUTION OF PASSWORD CHECK

 Clock Cycle N   : Execute CMP r0, r1      ──► Updates Zero Flag (Z = 0)
 Clock Cycle N+1 : Execute BNE access_denied ──► Evaluates Z flag; calculates target PC
 Clock Cycle N+2 : Execute MOV r0, #1      ──► Grants Admin Access!
```

Now, let us examine the two distinct ways an attacker can use a **Clock Glitch** to skip or neutralize the security check:

---

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

---

### Mechanism B: Corrupting the Comparison Instruction (`CMP`)

Alternatively, the attacker can inject the clock glitch during **Clock Cycle N** (when `CMP r0, r1` is being executed):

1. The `CMP` instruction subtracts `r1` from `r0` and passes the result through a complex 32-bit zero-detect OR-gate tree ($t_{\text{prop\_zero}} = 10.0\text{ ns}$) to determine if $Z = 1$.
2. The attacker injects a $3.0\text{-ns}$ clock glitch during Cycle N.
3. The zero-detect logic violates setup time. The Zero Flag register fails to update, keeping its old default value **$Z = 1$ (Equal)**!
4. On Cycle N+1, `BNE` reads $Z = 1$, concludes the passwords matched, and falls through to `MOV r0, #1`!

In both mechanisms, physical clock glitching forces the pipeline to bypass the security boundary without modifying a single byte of flash memory!

---

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

---

### Silicon Hardware Defenses and Countermeasures

To protect secure microcontrollers, smartcards, and automotive processors against clock glitching attacks, silicon foundries incorporate three hardware defense layers:

```text
SILICON HARDWARE GLITCH DEFENSES

                           HARDWARE GLITCH DEFENSES
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
 INTERNAL PLL CLOCK FILTERS   ON-CHIP CLOCK INTEGRITY MONITORS  TRIPLE MODULAR REDUNDANCY (TMR)
 * Internal Phase-Locked Loop * Hardware sensors measure       * Dual/Triple core lockstep
   filters external CLK spikes. $T_{high}$ and $T_{low}$ pulse widths.  compares execution results.
```

#### 1. Internal Phase-Locked Loop (PLL) Clock Filters
Instead of routing the raw external $CLK$ pin directly to execution flip-flops, modern CPUs route the external clock into an internal **Phase-Locked Loop (PLL)**. 

The PLL acts as a low-pass analog filter: high-frequency clock glitches injected on the external pin are smoothed out and absorbed by the PLL's loop filter, preventing short pulses from reaching internal pipeline registers.

#### 2. On-Chip Clock Integrity Monitors (Glitch Detectors)
Silicon designers place dedicated **Clock Integrity Monitor Circuits** adjacent to the CPU core.

A Clock Integrity Monitor consists of two asynchronous delay lines that measure the duration of every clock High phase ($T_{\text{high}}$) and Low phase ($T_{\text{low}}$):

```text
CLOCK INTEGRITY MONITOR SCHEMATIC

 Incoming CLK ──┬──► [ Delay Line t_min ] ──► [ D Flip-Flop ] ──► Fault Detect
                │                                    ▲
                └────────────────────────────────────┘
 (If CLK pulse width < t_min, Fault Detect triggers an immediate RESET!)
```

$$\text{Trigger Reset} \iff T_{\text{high}} < T_{\text{min\_allowed}} \quad \mathbf{\text{OR}} \quad T_{\text{low}} < T_{\text{min\_allowed}}$$

If a clock pulse width drops below $T_{\text{min\_allowed}}$ (e.g., $T_{\text{glitch}} < 15\text{ ns}$), the Clock Integrity Monitor instantly asserts an internal **Hardware Reset Signal**, resetting the processor before the corrupted instruction can commit!

#### 3. Dual-Core Lockstep and Hardware Redundancy (TMR)
In automotive and high-security processors (such as ARM Cortex-R5F or ISO 26262 automotive chips), two identical CPU cores (Core A and Core B) execute the exact same instructions in **Lockstep**.

A hardware comparator continuously compares the output registers of Core A and Core B. If a clock glitch causes an instruction skip on Core A but not on Core B, the comparator detects a mismatch and triggers a hardware security alert!

---

## Solved Industrial Engineering Exercise: Quantitative Clock Glitch Timing Analysis, Setup Slack Derivation, and Glitch Window Calculation

To consolidate your complete mastery of clock glitching fault injection, flip-flop setup timing invariants, negative slack derivations, and fault window calculations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior hardware security engineer auditing an 8-bit security microcontroller operating at a nominal clock frequency $f_{\text{clk}} = 16.0\text{ MHz}$ ($T_{\text{clk}} = 62.5\text{ ns}$).

The microcontroller executes a bootloader signature verification loop in assembly. The critical security branch instruction `BNE boot_failed` is executed at physical memory address `0x0000_0100`.

```text
16 MHz SECURITY MICROCONTROLLER PIPELINE PARAMETERS

 Master Clock f_clk = 16.0 MHz (T_clk = 62.5 ns)
 ┌─────────────────────────────────────────────────────────────┐
 │ Flip-Flop Clock-to-Q Delay (t_C2Q)         = 3.0 ns         │
 │ Flip-Flop Setup Time Requirement (t_su)    = 2.0 ns         │
 │ Program Counter Adder Delay (t_prop_PC)   = 12.0 ns        │
 │ Branch Comparison Logic Delay (t_prop_BNE) = 48.0 ns        │
 └─────────────────────────────────────────────────────────────┘
  Target Instruction: BNE boot_failed @ Address 0x0000_0100
```

#### Physical Hardware Timing Parameters:
* Nominal Clock Period ($T_{\text{clk}}$): $62.5\text{ nanoseconds}$ ($62,500\text{ ps}$).
* Flip-Flop Clock-to-Q Delay ($t_{\text{C2Q}}$): $3.0\text{ nanoseconds}$ ($3,000\text{ ps}$).
* Flip-Flop Setup Time Requirement ($t_{\text{su}}$): $2.0\text{ nanoseconds}$ ($2,000\text{ ps}$).
* **Program Counter ($PC$) Adder Propagation Delay ($t_{\text{prop\_PC}}$)**: The simple combinational adder that computes $PC \Leftarrow PC + 2$ takes $t_{\text{prop\_PC}} = 12.0\text{ nanoseconds}$ ($12,000\text{ ps}$).
* **Branch Comparison Logic Propagation Delay ($t_{\text{prop\_BNE}}$)**: The complex logic evaluating condition flags and calculating the branch target address takes $t_{\text{prop\_BNE}} = 48.0\text{ nanoseconds}$ ($48,000\text{ ps}$).

An attacker uses an FPGA pulse generator to inject a shortened clock glitch pulse $T_{\text{glitch}}$ during the execution of `BNE boot_failed`.

#### Your Objective

1. Calculate the normal timing slack ($S_{\text{setup\_PC}}$ and $S_{\text{setup\_BNE}}$) for both the Program Counter Adder and the Branch Comparison Logic during standard $16.0\text{-MHz}$ operation ($T_{\text{clk}} = 62.5\text{ ns}$).
2. Calculate the minimum clock glitch duration $T_{\text{glitch\_min\_PC}}$ required for the Program Counter register to successfully capture the next sequential address ($PC + 2$).
3. Calculate the maximum clock glitch duration $T_{\text{glitch\_max\_BNE}}$ that forces a setup time violation ($S_{\text{setup\_BNE}} < 0$) on the Branch Comparison Logic.
4. Derive the exact **Fault Injection Window ($T_{\text{glitch\_window}}$)** in nanoseconds within which a clock glitch guarantees a $100\%$ deterministic Instruction Skip Fault (where $PC$ updates to $PC + 2$ but the branch signal fails).
5. Evaluate a hardware defense: calculate the minimum setup time requirement if an internal Clock Integrity Monitor is configured to trigger a hardware reset whenever $T_{\text{glitch}} < 20.0\text{ ns}$.
6. Verify mathematical, physical, and logical correctness.

---

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

---

#### Step 2: Calculate Minimum Glitch Width for PC Update ($T_{\text{glitch\_min\_PC}}$)

For the Program Counter register to successfully capture the next instruction address ($PC + 2$), the glitched clock period $T_{\text{glitch}}$ must satisfy:

$$T_{\text{glitch}} \ge t_{\text{C2Q}} + t_{\text{prop\_PC}} + t_{\text{su}}$$

$$T_{\text{glitch\_min\_PC}} = 3.0\text{ ns} + 12.0\text{ ns} + 2.0\text{ ns} = \mathbf{17.0 \text{ Nanoseconds}}$$

If $T_{\text{glitch}} \ge 17.0\text{ ns}$, the $PC$ register successfully updates to $PC + 2$ (`0x0000_0102`)!

---

#### Step 3: Calculate Maximum Glitch Width to Force Branch Failure ($T_{\text{glitch\_max\_BNE}}$)

To force a setup time violation on the Branch Comparison Logic ($S_{\text{setup\_BNE}} < 0$), the glitched clock period $T_{\text{glitch}}$ must be strictly less than the total branch path delay:

$$T_{\text{glitch}} < t_{\text{C2Q}} + t_{\text{prop\_BNE}} + t_{\text{su}}$$

$$T_{\text{glitch\_max\_BNE}} = 3.0\text{ ns} + 48.0\text{ ns} + 2.0\text{ ns} = \mathbf{53.0 \text{ Nanoseconds}}$$

If $T_{\text{glitch}} < 53.0\text{ ns}$, the Branch Comparison Logic **violates setup time** and fails to drive the branch taken signal!

---

#### Step 4: Derive the Fault Injection Window ($T_{\text{glitch\_window}}$)

An **Instruction Skip Fault** occurs if and only if:
1. $T_{\text{glitch}} \ge T_{\text{glitch\_min\_PC}} \, (17.0\text{ ns}) \implies PC$ successfully increments to $PC + 2$.
2. $T_{\text{glitch}} < T_{\text{glitch\_max\_BNE}} \, (53.0\text{ ns}) \implies$ Branch comparison fails!

$$\mathbf{17.0 \text{ ns} \le T_{\text{glitch}} < 53.0 \text{ ns}}$$

$$\text{Fault Window Width } \Delta T_{\text{window}} = 53.0\text{ ns} - 17.0\text{ ns} = \mathbf{36.0 \text{ Nanoseconds}}$$

```text
FAULT INJECTION WINDOW SPECIFICATION

 Clock Glitch Width T_glitch (Nanoseconds)
 0.0 ns ────────► 17.0 ns ─────────────────────────────► 53.0 ns ─────────► 62.5 ns
 ┌─────────────────┬─────────────────────────────────────┬─────────────────┐
 │ TOTAL PC CRASH  │ INSTRUCTION SKIP FAULT WINDOW!      │ NORMAL EXECUTION│
 │ PC fails to     │ PC increments to PC+4;              │ Branch operates │
 │ update (Freeze) │ Branch Logic FAILS! (100% EXPLOIT!) │ correctly (Pass)│
 └─────────────────┴─────────────────────────────────────┴─────────────────┘
  ◄── 17.0 ns ────► ◄─────────── 36.0 ns Window ────────► ◄──── 9.5 ns ────►
```

##### Microarchitectural Result:
The attacker has a wide **$36.0\text{-nanosecond}$ fault window** ($17.0\text{ ns} \le T_{\text{glitch}} < 53.0\text{ ns}$). Any clock glitch injected within this $36.0\text{-ns}$ window forces a $100\%$ deterministic Instruction Skip Fault, bypassing the security branch!

---

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

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against digital hardware principles:

1. **Setup Time Invariant Verification**:
   * Branch path total delay $= 3.0\text{ ns} + 48.0\text{ ns} + 2.0\text{ ns} = 53.0\text{ ns}$.
   * If $T_{\text{glitch}} = 50.0\text{ ns}$, $\text{Slack} = 50.0 - 53.0 = -3.0\text{ ns} < 0 \implies$ Setup violation confirmed!
2. **Program Counter Update Verification**:
   * PC path total delay $= 3.0\text{ ns} + 12.0\text{ ns} + 2.0\text{ ns} = 17.0\text{ ns}$.
   * If $T_{\text{glitch}} = 50.0\text{ ns}$, $\text{Slack} = 50.0 - 17.0 = +33.0\text{ ns} \ge 0 \implies$ PC updates cleanly!
3. **Physical Causality Check**:
   * Simple logic (2-level PC adder) propagates faster than complex multi-level logic (32-bit branch comparator).
   * Shortening clock period selectively breaks complex paths while leaving simple paths functional, proving $100\%$ physical causality for Instruction Skip Faults!

All flip-flop setup timing equations, propagation delay summations, clock glitch window derivations ($17.0\text{ ns} \le T_{\text{glitch}} < 53.0\text{ ns}$), and clock monitor defense evaluations evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Clock glitching**: A physical hardware fault injection technique where an attacker injects an abnormally shortened clock pulse ($T_{\text{glitch}} \ll T_{\text{clk}}$) into a processor's clock rail, forcing setup time violations ($\text{Slack} < 0$) in complex combinational logic paths while allowing faster logic paths to complete.
* **Instruction skip fault**: The microarchitectural execution failure resulting from a setup time violation during instruction decoding or branch evaluation, where the Program Counter increments sequentially while the branch or security check logic fails to latch, causing the CPU to skip critical security instructions.
