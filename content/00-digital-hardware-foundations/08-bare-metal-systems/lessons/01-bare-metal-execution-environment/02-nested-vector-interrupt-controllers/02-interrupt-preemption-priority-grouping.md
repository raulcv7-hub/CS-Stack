content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/01-bare-metal-execution-environment/02-nested-vector-interrupt-controllers/02-interrupt-preemption-priority-grouping.md
# Nested Interrupt Preemption, Priority Grouping, and Multi-Tier Vector Arbitration

## The Real-Time Emergency Blocking Crisis

In high-performance embedded systems and real-time control applications, a central processing unit (CPU) core manages multiple hardware peripherals simultaneously. A bare-metal microcontroller operating an electric motor, an automated braking system, or a high-speed optical network interface executes its main software loop while reacting to asynchronous hardware event signals called **Interrupt Requests ($IRQ$)**.

Suppose a microcontroller is actively servicing a low-priority interrupt. For example, a Universal Asynchronous Receiver-Transmitter (UART) serial port receives a diagnostic text character, triggering $IRQ_{10}$. 

The CPU halts its main program, saves its working registers onto the stack, and enters the UART **Interrupt Service Routine ($ISR$)**. Processing this slow diagnostic character in assembly takes $20\text{ microseconds}$ ($20,000\text{ nanoseconds}$).

Now, imagine that $2\text{ microseconds}$ into the UART $ISR$, a critical, life-threatening emergency occurs:
An electric motor inverter detects a destructive over-current voltage spike on a General Purpose Input/Output (GPIO) pin, triggering $IRQ_0$. 

To prevent the high-power transistors on the inverter board from overheating and physically exploding, the motor control $ISR$ must execute and disable the pulse-width modulation (PWM) outputs within **$200\text{ nanoseconds}$**!

```text
THE REAL-TIME PRIORITY BLOCKING DISASTER

 Time t = 0 us  : UART Character Arrives (IRQ 10) -> CPU enters UART ISR (Takes 20 us)
 Time t = 2 us  : MOTOR OVER-CURRENT SPIKE! (IRQ 0 - Must respond in 200 ns!)
                  │
                  ▼ (NO PREEMPTION: CPU stays locked in UART ISR!)
 Time t = 20 us : UART ISR finishes -> CPU finally enters Motor ISR...
                  ▲
                  └── 18 MICROSECONDS TOO LATE! (MOSFET Transistors EXPLODE!)
```

Look at the catastrophic hardware failure that occurs if the interrupt controller operates under a **Non-Nested Interrupt Policy**:

1. Under a non-nested policy, once the CPU enters the low-priority UART $ISR$, **all other hardware interrupts are blocked** until the UART $ISR$ finishes executing!
2. When the critical motor over-current $IRQ_0$ fires at $t = 2\text{ }\mu\text{s}$, the hardware interrupt controller sees that an $ISR$ is already active. It sets $IRQ_0$ to a pending state and forces the motor $ISR$ to wait in line.
3. The CPU spends the next $18\text{ microseconds}$ executing low-priority UART text formatting instructions.
4. By the time the UART $ISR$ finishes at $t = 20\text{ }\mu\text{s}$ and the CPU finally enters the motor $ISR$, **$18\text{ microseconds}$ have elapsed**—90 times longer than the motor's $200\text{-ns}$ safety limit!
5. The power transistors melt, and the hardware board is destroyed!

Non-nested interrupt execution fails in real-time embedded systems because it allows long, non-critical tasks to block time-critical safety events.

To solve this blocking crisis, hardware engineers cannot simply treat all interrupts as equal. The hardware interrupt controller requires two distinct capabilities:

1. **Nested Interrupt Preemption**: If a high-priority $IRQ$ fires while the CPU is midway through executing a low-priority $ISR$, the hardware must automatically **pause the low-priority $ISR$ mid-flight**, stack its state, and jump immediately to the high-priority $ISR$!
2. **Deterministic Sub-Priority Tie-Breaking**: What happens if two interrupts of equal preemption rank arrive at the exact same physical clock cycle? The hardware must resolve the tie predictably without allowing one to preempt the other if one is already running.

To provide both dynamic preemption and deterministic tie-breaking, modern interrupt controllers employ **Interrupt Preemption Priorities** and configurable **Priority Grouping (`PRIGROUP`)**.

---

## The Trauma Center Triage: A Mental Model for Preemption and Sub-Priorities

To build an intuitive, crystal-clear mental model of nested preemption, preemption priorities, sub-priorities, and priority grouping registers before inspecting bitwise state tables and stack memory layouts, let us consider an everyday analogy: **A Hospital Trauma Center Triage Unit**.

Imagine a hospital emergency room staffed by a single, highly skilled emergency doctor (**The CPU Core Execution Pipeline**).

```text
THE TRAUMA CENTER TRIAGE METAPHOR

 Emergency Room Doctor (CPU Core)               Triage Nurse & Switchboard
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Single Operating Desk     │                 │ Evaluates Incoming Patients│
 │ Treats 1 Patient at a Time│                 │ Assigns Triage Priority   │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼ Incoming Patients (Hardware Interrupt Requests / IRQs)      │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ PATIENT TRIAGE PRIORITY BOARD                                           │
 │  * Priority Rank 0 : Life-Threatening Heart Attack (Highest Preemption) │
 │  * Priority Rank 1 : Severe Compound Bone Fracture                      │
 │  * Priority Rank 2 : Minor Paper Cut               (Lowest Preemption) │
 └─────────────────────────────────────────────────────────────────────────┘
```

The doctor can physically treat only one patient at a time. A triage nurse (**The Interrupt Controller / NVIC**) sits at the front desk, assigning a two-part **Triage Category** to every arriving patient:
* **Preemption Category (Emergency Severity Level)**: Determines whether a new patient is severe enough to **interrupt the doctor midway through treating a current patient**!
* **Sub-Priority Category (Tie-Breaker Level)**: Determines who gets treated first if two patients with the exact same preemption level arrive at the hospital door at the exact same second!

Let us observe three different clinical scenarios in the trauma center:

---

### Scenario 1: Nested Preemption (Heart Attack Interrupts Paper Cut)

1. **8:00 AM**: Patient A arrives with a minor paper cut (**Priority Rank 2 — Low Priority $ISR$**). The doctor begins applying a small bandage.
2. **8:02 AM**: Patient B arrives in an ambulance suffering a life-threatening heart attack (**Priority Rank 0 — High Priority $IRQ$**).
3. **The Preemption Action**:
   * The triage nurse evaluates Patient B's rank ($0$) against Patient A's rank ($2$).
   * Because Rank $0$ is a far higher emergency severity than Rank $2$, **the nurse commands the doctor to STOP bandaging Patient A immediately**!
   * The doctor writes a quick note on Patient A's chart (*"Bandage half-applied at 8:02 AM"* — **Hardware Context Stacking**), leaves Patient A in Treatment Room 2, and runs to the Trauma Bay to treat Patient B (**Nested $ISR$ Execution**)!
4. **8:10 AM**: The doctor finishes stabilizing Patient B's heart attack.
5. **Resuming Patient A**: The doctor walks back to Treatment Room 2, reads Patient A's chart (**Unstacking Context**), finishes applying the bandage, and discharges Patient A!

```text
NESTED PREEMPTION TIMELINE

 08:00 AM : Doctor treats Patient A (Paper Cut - Rank 2)
 08:02 AM : Patient B arrives (Heart Attack - Rank 0)
            │
            ▼ PREEMPTION EVENT! (Doctor pauses Patient A!)
 08:02 AM : Doctor treats Patient B (Heart Attack - Rank 0) ──► Saved at 8:10 AM!
            │
            ▼ Doctor returns to Patient A!
 08:10 AM : Doctor finishes Patient A (Paper Cut) ──► Discharged at 8:12 AM!
 (Heart attack patient saved in 0 seconds! Paper cut completed with zero errors!)
```

Look at the life-saving power of Nested Preemption:
Patient B was treated in 0 seconds, while Patient A was paused safely and resumed later!

---

### Scenario 2: Sub-Priority Tie-Breaking Without Preemption

Now, consider a different situation involving two patients with identical preemption severity:
* Patient C has a **Broken Left Arm** (**Preemption Rank 1, Sub-Priority 0**).
* Patient D has a **Broken Right Arm** (**Preemption Rank 1, Sub-Priority 1**).

Notice that both patients have the **exact same Preemption Rank ($1$)**!

#### Case 2A: Sequential Arrival (No Preemption Between Equals)
1. **9:00 AM**: Patient C (Broken Left Arm) arrives first. The doctor begins setting Patient C's arm in a cast.
2. **9:05 AM**: Patient D (Broken Right Arm) arrives second.
3. **The Triage Decision**:
   * The nurse compares Patient D's preemption rank ($1$) against Patient C's preemption rank ($1$).
   * Because their preemption ranks are equal, **Patient D is NOT allowed to interrupt the doctor**!
   * The doctor finishes setting Patient C's arm at 9:20 AM.
   * Then, and only then, the doctor begins setting Patient D's arm!

```text
SEQUENTIAL ARRIVAL (SAME PREEMPTION RANK -> NO INTERRUPT!)

 Doctor treating Patient C (Rank 1) ──► Patient D arrives (Rank 1)
                                         │
                                         ▼ NO PREEMPTION! (Equal Severity!)
 Doctor finishes Patient C FIRST ──► THEN treats Patient D SECOND!
```

#### Case 2B: Simultaneous Arrival (Sub-Priority Tie-Breaker)
What if Patient C AND Patient D arrive at the hospital door at the **exact same second (9:00:00 AM)**?

1. Both patients arrive simultaneously. Both have Preemption Rank $1$. Who does the doctor treat first?
2. The nurse inspects the **Sub-Priority Tie-Breaker**:
   * Patient C has Sub-Priority $0$ (Higher tie-breaker rank).
   * Patient D has Sub-Priority $1$ (Lower tie-breaker rank).
3. The nurse selects Patient C first! The doctor treats Patient C from 9:00 to 9:20 AM, and then treats Patient D from 9:20 to 9:40 AM.

```text
SIMULTANEOUS ARRIVAL TIE-BREAKER

 Patient C (Rank 1, Sub 0) ──┐ BOTH ARRIVE AT 9:00:00 AM!
                             ├──► Nurse checks Sub-Priority:
 Patient D (Rank 1, Sub 1) ──┘    Sub 0 beats Sub 1!
                                  Doctor treats Patient C FIRST!
```

Look at what the Sub-Priority Tie-Breaker achieved:
* It resolved the simultaneous tie deterministically!
* It prevented Patient D from needlessly interrupting Patient C midway through treatment!

This trauma center triage system is the exact physical analogue of **Interrupt Preemption Priority and Priority Grouping**:
* The ER doctor is the **CPU Execution Core**.
* Patients are **Hardware Interrupt Requests ($IRQ$)**.
* The triage nurse is the **Nested Vectored Interrupt Controller (NVIC / PLIC)**.
* Preemption Category is the **Preemption Priority Bitfield**.
* Sub-Priority Category is the **Sub-Priority Bitfield**.
* Pausing Patient A to treat Patient B is **Hardware Nested Context Stacking**.
* Patient C finishing before Patient D is **Tail-Chaining / Non-Preemptive Order**.

---

## Primitive 1: Interrupt Preemption Priority

Now that we possess an intuitive mental model of ER doctors and triage ranks, let us examine the formal engineering mechanics of **Interrupt Preemption Priority**.

In a bare-metal processor equipped with a Nested Vectored Interrupt Controller (such as the ARM Cortex-M NVIC or RISC-V PLIC/CLIC), every external hardware $IRQ$ line is assigned a dedicated 8-bit Memory-Mapped I/O (MMIO) register called the **Interrupt Priority Register (`IPR0` .. `IPR59`)**.

```text
8-BIT INTERRUPT PRIORITY REGISTER (`IPR_k`) BITFIELD MAP

 Bit 7       Bit 6       Bit 5       Bit 4       Bit 3       Bit 0
 ┌───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
 │ Priority  │ Priority  │ Priority  │ Priority  │ Un-used / │ Un-used / │
 │ Bit 3     │ Bit 2     │ Bit 1     │ Bit 0     │ Read as 0 │ Read as 0 │
 └───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
  ◄──────── 4 Implemented Priority Bits (MSB) ──────► ◄─ 4 Un-implemented ─►
```

---

### The Inverted Priority Invariant

In embedded digital hardware design, interrupt priority values follow **The Inverted Priority Invariant**:

> **The Inverted Priority Invariant**: A **lower numerical value** programmed into an Interrupt Priority Register represents a **higher physical preemption priority**!

$$\text{Priority Value } 0x00 \implies \mathbf{\text{ABSOLUTE HIGHEST PRIORITY (Preempts All Other IRQs)}}$$

$$\text{Priority Value } 0xFF \implies \mathbf{\text{ABSOLUTE LOWEST PRIORITY (Preempted by All Other IRQs)}}$$

#### Why Silicon Implementations Use Only the Upper Bits (MSBs):
To save silicon die area and reduce gate counts, microcontroller manufacturers rarely implement all 8 bits of every priority register. Most commercial microcontrollers implement the **top 3 or 4 Most Significant Bits (MSBs)**:
* **4 Implemented Bits**: Provides $2^4 = \mathbf{16 \text{ Programmable Priority Levels}}$ ($0x00, 0x10, 0x20, \dots, 0xF0$).
* **3 Implemented Bits**: Provides $2^3 = \mathbf{8 \text{ Programmable Priority Levels}}$ ($0x00, 0x20, 0x40, \dots, 0xE0$).

Un-implemented lower bits are hardwired to zero ($0$) in physical silicon.

---

### The Preemption Rule

When a new hardware interrupt $IRQ_{\text{new}}$ fires while the CPU is actively executing an Interrupt Service Routine $ISR_{\text{active}}$, the interrupt controller evaluates **The Preemption Condition**:

$$\mathbf{\text{Preempt Active ISR} \iff \text{Priority}(IRQ_{\text{new}}) < \text{Priority}(ISR_{\text{active}})}$$

Where:
* $\text{Priority}(IRQ_{\text{new}})$ is the numerical preemption priority value of the incoming interrupt.
* $\text{Priority}(ISR_{\text{active}})$ is the numerical preemption priority value of the currently executing $ISR$.

```text
PREEMPTION DECISION MATRIX

 Current Active ISR Priority │ Incoming IRQ Priority │ Action Executed by Hardware
─────────────────────────────┼───────────────────────┼─────────────────────────────────────────────
    0x20 (Priority Level 2)  │  0x00 (Priority Lvl 0)│ PREEMPT IMMEDIATELY! Stack new ISR frame!
    0x20 (Priority Level 2)  │  0x20 (Priority Lvl 2)│ DO NOT PREEMPT! Set IRQ to Pending state.
    0x20 (Priority Level 2)  │  0x40 (Priority Lvl 4)│ DO NOT PREEMPT! Set IRQ to Pending state.
```

If $\text{Priority}(IRQ_{\text{new}}) < \text{Priority}(ISR_{\text{active}})$, the interrupt controller **immediately pauses $ISR_{\text{active}}$ mid-instruction, pushes a second nested context frame onto the stack, and jumps to $ISR_{\text{new}}$**!

---

## Primitive 2: Priority Grouping (`PRIGROUP`) Mechanics

Now let us examine the second core primitive: **Priority Grouping (`PRIGROUP`)**.

In complex embedded applications, hardware engineers need to split the 8-bit priority register into two distinct logical fields:
1. **Preemption Priority Field**: Upper $N$ bits used to evaluate dynamic nested preemption.
2. **Sub-Priority Field**: Lower $8-N$ bits used exclusively as a tie-breaker when two $IRQs$ arrive at the exact same clock cycle.

This dynamic division is controlled by a 3-bit register inside the System Control Block (SCB) called **The Application Interrupt and Reset Control Register (`SCB->AIRCR.PRIGROUP`)**.

```text
THE PRIGROUP BIT-SPLITTING BOUNDARY SHIFT

 8-Bit Priority Register (IPR_k):
 Bit 7       Bit 6       Bit 5       Bit 4       Bit 3       Bit 2       Bit 1       Bit 0
 ┌───────────────────────────────────┬───────────────────────────────────────────┐
 │ Preemption Priority Field (N Bits)│ Sub-Priority Tie-Breaker Field (8-N Bits) │
 └───────────────────────────────────┴───────────────────────────────────────────┘
  ◄── Controls Nested Preemption ──► ◄── Controls Simultaneous Arrival Ties ──►
```

---

### The `PRIGROUP` Division Table

By writing a value from $0 \text{ to } 7$ into the 3-bit `PRIGROUP` field (`AIRCR[10:8]`), the hardware shifts the binary boundary dividing Preemption Bits from Sub-Priority Bits:

```text
PRIGROUP FIELD CONFIGURATION TABLE (FOR 4 IMPLEMENTED MSB BITS)

 PRIGROUP Value │ Binary Split [Preempt : Sub] │ Preemption Levels │ Sub-Priority Levels
────────────────┼──────────────────────────────┼───────────────────┼──────────────────────
    3'b000 (0)  │  7 Bits Preempt : 1 Bit Sub  │ 16 Levels (0..15) │ 1 Level (No Sub-P)
    3'b100 (4)  │  3 Bits Preempt : 1 Bit Sub  │  8 Levels (0..7)  │ 2 Levels (0..1)
    3'b101 (5)  │  2 Bits Preempt : 2 Bits Sub │  4 Levels (0..3)  │ 4 Levels (0..3)
    3'b110 (6)  │  1 Bit Preempt  : 3 Bits Sub │  2 Levels (0..1)  │ 8 Levels (0..7)
    3'b111 (7)  │  0 Bits Preempt : 4 Bits Sub │  1 Level (None!)  │ 16 Levels (0..15)
```

#### Mathematical Formulas for Preemption and Sub-Priority Grouping

Let $P_{\text{bits}}$ be the number of bits allocated to Preemption Priority, and $S_{\text{bits}}$ be the number of bits allocated to Sub-Priority.

For a hardware implementation with $B_{\text{impl}}$ implemented MSB bits (e.g., $B_{\text{impl}} = 4$ bits):

$$P_{\text{bits}} = \max\left(0, \ \text{7} - \text{PRIGROUP\_Value}\right)$$

$$S_{\text{bits}} = B_{\text{impl}} - P_{\text{bits}}$$

$$\text{Number of Preemption Groups} = 2^{P_{\text{bits}}}$$

$$\text{Number of Sub-Priorities per Group} = 2^{S_{\text{bits}}}$$

---

### Step-by-Step Numerical Example of Priority Grouping

Suppose a microcontroller implements $B_{\text{impl}} = 4$ priority bits, and software configures **`PRIGROUP = 5`** (`3'b101`).

Let us calculate the resulting preemption and sub-priority structures:

1. **Calculate Preemption Bits ($P_{\text{bits}}$)**:
   $$P_{\text{bits}} = 7 - 5 = \mathbf{2 \text{ Bits}} \quad (\text{Bits } [7:6] \text{ of IPR})$$
   $$\text{Preemption Group Levels} = 2^2 = \mathbf{4 \text{ Preemption Groups }} (0, 1, 2, 3)$$

2. **Calculate Sub-Priority Bits ($S_{\text{bits}}$)**:
   $$S_{\text{bits}} = 4 - 2 = \mathbf{2 \text{ Bits}} \quad (\text{Bits } [5:4] \text{ of IPR})$$
   $$\text{Sub-Priority Tie-Breaker Levels} = 2^2 = \mathbf{4 \text{ Sub-Priorities per Group }} (0, 1, 2, 3)$$

```text
PRIGROUP = 5 BIT SPLIT IN AN 8-BIT PRIORITY REGISTER

 Register Bits: [ Bit 7 | Bit 6 ] [ Bit 5 | Bit 4 ] [ Bit 3 | Bit 2 | Bit 1 | Bit 0 ]
                ├───────────────┤ ├───────────────┤ ├───────────────────────────────┤
                │ Preemption    │ │ Sub-Priority  │ │ Hardwired to 0 in Silicon     │
                │ Field (2 Bits)│ │ Field (2 Bits)│ │ (Un-implemented Lower Bits)   │
```

Now, let us evaluate three peripherals configured with different 8-bit priority values under `PRIGROUP = 5`:

* **Peripheral A ($IRQ_0$)**: Priority Byte $= \text{0x00} = \mathbf{0000\_0000_2}$
  * Preemption Bits $[7:6] = 00_2 = \mathbf{\text{Preemption Group 0}}$
  * Sub-Priority Bits $[5:4] = 00_2 = \mathbf{\text{Sub-Priority 0}}$
* **Peripheral B ($IRQ_1$)**: Priority Byte $= \text{0x20} = \mathbf{0010\_0000_2}$
  * Preemption Bits $[7:6] = 00_2 = \mathbf{\text{Preemption Group 0}}$
  * Sub-Priority Bits $[5:4] = 10_2 = \mathbf{\text{Sub-Priority 2}}$
* **Peripheral C ($IRQ_2$)**: Priority Byte $= \text{0x40} = \mathbf{0100\_0000_2}$
  * Preemption Bits $[7:6] = 01_2 = \mathbf{\text{Preemption Group 1}}$
  * Sub-Priority Bits $[5:4] = 00_2 = \mathbf{\text{Sub-Priority 0}}$

```text
EVALUATING INTERLOCKS UNDER PRIGROUP = 5

 Scenario A: Peripheral A (0x00) is running. Peripheral B (0x20) fires.
   Preemption Check: Group 0 (B) vs Group 0 (A).
   Result: EQUAL PREEMPTION GROUP! Peripheral B CANNOT PREEMPT Peripheral A!

 Scenario B: Peripheral B (0x20) is running. Peripheral C (0x40) fires.
   Preemption Check: Group 1 (C) vs Group 0 (B).
   Result: Group 1 is NUMERICALLY HIGHER than Group 0 (Lower Priority). Peripheral C CANNOT PREEMPT B!

 Scenario C: Peripheral C (0x40) is running. Peripheral A (0x00) fires.
   Preemption Check: Group 0 (A) vs Group 1 (C).
   Result: Group 0 is NUMERICALLY LOWER than Group 1 (Higher Priority).
   Result: PERIPHERAL A PREEMPTS PERIPHERAL C IMMEDIATELY!
```

---

## Nested Context Stacking Mechanics and Memory Consumption

When a high-priority interrupt preempts a currently executing low-priority interrupt handler, how does the CPU execution pipeline manage its hardware registers?

The CPU utilizes **Nested Hardware Auto-Stacking**.

### The Nested Stack Memory Layout

Recall that upon entering any exception, the hardware automatically pushes 8 caller-saved registers ($xPSR, PC, LR, r12, r0..r3$) onto the active stack memory—occupying **$32\text{ bytes}$ per nesting level**.

If an application experiences $D$ levels of nested interrupt preemption, the physical stack memory must accommodate $D$ consecutive $32\text{-byte}$ hardware stack frames plus any local variables allocated by the assembly $ISR$ handlers:

$$\mathbf{\text{Total Stack Memory Consumed} = \sum_{k=1}^{D} \left( 32\text{ Bytes} + \text{Local\_Variables}_k \right)}$$

```text
NESTED STACK FRAME LAYOUT ON THE MAIN STACK POINTER (MSP)

 High Memory Address
 ┌───────────────────────────────────────────────────────────┐ ◄── SP Initial (Main Loop)
 │ Interrupted Main Program Execution Context (32 Bytes)     │
 ├───────────────────────────────────────────────────────────┤ ◄── SP Level 1
 │ Low-Priority ISR_A Local Stack Variables                  │
 ├───────────────────────────────────────────────────────────┤
 │ Low-Priority ISR_A Context Frame (32 Bytes)               │
 ├───────────────────────────────────────────────────────────┤ ◄── SP Level 2 (Preemption!)
 │ High-Priority ISR_B Local Stack Variables                 │
 ├───────────────────────────────────────────────────────────┤
 │ High-Priority ISR_B Context Frame (32 Bytes)               │
 └───────────────────────────────────────────────────────────┘ ◄── SP Level 3 (Current Active SP)
 Low Memory Address
```

#### The Stack Depth Invariant:
To prevent un-controlled nested preemption from overflowing physical SRAM memory and corrupting adjacent global variables, embedded systems engineers **must bound the maximum number of preemption priority levels**!

---

### Preemption vs. Tail-Chaining Decision Matrix

When an $IRQ$ fires, the hardware interrupt controller evaluates whether to execute **Nested Preemption** or **Tail-Chaining**:

```text
PREEMPTION VS TAIL-CHAINING HARDWARE DECISION TREE

 Incoming IRQ Fired
          │
          ▼
 Is Incoming IRQ Preemption Group < Active ISR Preemption Group?
          │
 ┌────────┴────────┐
 │ YES             │ NO (Equal or Lower Priority)
 ▼                 ▼
 NESTED PREEMPTION! TAIL-CHAINING SCHEDULED!
 Push 32B Frame    Do NOT interrupt active ISR. Wait for active ISR to finish,
 to Stack (12c).   then transition directly to new ISR in 6 CYCLES (Zero Unstacking!)
 Jump to New ISR.
```

* **Nested Preemption ($12\text{ Clock Cycles}$ Entry Latency)**:
  Occurs when incoming $\text{Preemption Group}_{\text{new}} < \text{Preemption Group}_{\text{active}}$. 
  The CPU pushes a new $32\text{-byte}$ frame onto the stack and enters $ISR_{\text{new}}$ immediately.
* **Tail-Chaining ($6\text{ Clock Cycles}$ Entry Latency)**:
  Occurs when incoming $\text{Preemption Group}_{\text{new}} \ge \text{Preemption Group}_{\text{active}}$, but $\text{IRQ}_{\text{new}}$ is pending when $ISR_{\text{active}}$ completes.
  
  Instead of popping 8 registers off the stack to return to the main loop and then immediately pushing 8 registers back onto the stack to start the next $ISR$, the hardware **skips unstacking and restacking completely**!
  
  The hardware transitions directly from $ISR_{\text{active}}$ to $ISR_{\text{new}}$ in **only $6\text{ clock cycles}$**, saving $18\text{ clock cycles}$ of memory bus traffic!

---

## Real-World Silicon Failures, Priority Inversions, and Stack Exhaustion

In production embedded systems engineering, mis-configuring preemption priorities and `PRIGROUP` registers causes catastrophic, un-reproducible field failures.

---

### 1. The Un-Controlled Nested Preemption Stack Overflow

Consider a team of engineers designing an industrial flight controller microcontroller with $2\text{ Kilobytes}$ ($2,048\text{ bytes}$) of stack SRAM memory.

An engineer configures `PRIGROUP = 0` (enabling 16 full levels of nested preemption) and assigns 16 different peripheral interrupts to 16 distinct preemption priority levels ($0 \dots 15$).

During a heavy sensor storm (where high-frequency vibration sensors, optical flow cameras, and radio telemetry fire simultaneously):
1. $IRQ_{15}$ fires $\implies$ CPU pushes Frame 1 ($32\text{ B}$).
2. $IRQ_{14}$ preempts $IRQ_{15} \implies$ CPU pushes Frame 2 ($32\text{ B}$).
3. $IRQ_{13}$ preempts $IRQ_{14} \implies$ CPU pushes Frame 3 ($32\text{ B}$).
4. ... $IRQ_0$ preempts $IRQ_1 \implies$ CPU pushes Frame 16 ($32\text{ B}$).

```text
UN-CONTROLLED NESTED PREEMPTION STACK OVERFLOW

 Physical SRAM Stack Memory Space (2,048 Bytes Limit)
 ┌───────────────────────────────────────────────────────────┐ ◄── Initial Top of Stack
 │ Frame 15 │ Frame 14 │ Frame 13 │ ... │ Frame 0            │
 ├───────────────────────────────────────────────────────────┤
 │ Local ISR Buffer Variables Allocated by 16 Handlers       │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼ STACK OVERFLOW!
 OVERWRITES GLOBAL VARIABLES IN ADJACENT SRAM (.bss / .data)!
 (Flight controller crashes mid-flight! System destroyed!)
```

* The 16 nested $ISRs$ allocate local buffer arrays on the stack.
* The total stack consumption exceeds $2,048\text{ bytes}$.
* **Stack Overflow**: The stack pointer crosses its physical boundary and **overwrites adjacent global `.data` and `.bss` variables**!
* The flight controller crashes mid-flight.

#### The Engineering Fix: Grouping Priorities to Limit Preemption Depth
To prevent stack exhaustion, system architects **restrict the number of preemption groups to 2 or 4 levels** (`PRIGROUP = 5` or `6`), forcing non-critical peripherals to share preemption ranks so they use **Tail-Chaining** instead of nested stacking!

---

### 2. The `AIRCR` Vector Key Protection Barrier

In ARM Cortex-M processors, the `PRIGROUP` field resides inside the **Application Interrupt and Reset Control Register (`SCB->AIRCR`)**.

Because modifying `AIRCR` can also trigger a system-wide hardware reset or alter global interrupt priority grouping, the silicon manufacturer guards `AIRCR` with a **16-bit Vector Key Protection Barrier**:

```text
SCB->AIRCR REGISTER BITFIELD LAYOUT

 Bit 31                               Bit 16 Bit 15 Bit 11 Bit 10   Bit 8 Bit 7       Bit 0
 ┌──────────────────────────────────────────┬──────────────┬─────────────┬───────────────┐
 │ VECTKEY / VECTKEYSTAT Field (16 Bits)    │ ENDIANNESS   │ PRIGROUP    │ SYSRESETREQ   │
 │ (MUST write 0x05FA to unlock register!)  │ (1 Bit)      │ (3 Bits)    │ (1 Bit)       │
 └──────────────────────────────────────────┴──────────────┴─────────────┴───────────────┘
```

#### The Write Rule:
To modify the `PRIGROUP` field in `SCB->AIRCR`, software **MUST write the magic key value `0x05FA` into the upper 16 bits (`VECTKEY[15:0]`) in the exact same write instruction**:

$$\text{Write Value to AIRCR} = (\text{0x05FA} \ll 16) \ \mid \ (\text{Desired PRIGROUP Value} \ll 8)$$

If software attempts to write to `SCB->AIRCR` without `0x05FA` in the upper 16 bits:
* The hardware **ignores the write completely**!
* `PRIGROUP` remains unchanged, and the preemption settings fail quietly!

---

## Solved Industrial Engineering Exercise: Quantitative PRIGROUP Bit-Splitting, Nested Preemption Trace, and Stack Depth Analysis

To consolidate your complete mastery of `PRIGROUP` bitfield splitting, preemption vs sub-priority evaluation, nested context stack depth calculations, and assembly register configurations, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal embedded systems architect designing the interrupt prioritization engine for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor implements $B_{\text{impl}} = \mathbf{4 \text{ Priority Bits}}$ in physical silicon (the top 4 bits of each 8-bit `IPR` register, bits $[7:4]$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER PRIORITY ENGINE

 System Configuration:
 ┌─────────────────────────────────────────────────────────────┐
 │ Priority Register Implementation: 4 Bits (MSBs [7:4])       │
 │ System Control Register         : SCB->AIRCR                │
 │ Configured PRIGROUP             : 3'b101 (PRIGROUP = 5)     │
 └─────────────────────────────────────────────────────────────┘
```

#### Assigned Hardware Peripherals and Priority Bytes:
1. **Motor Inverter Over-Current ($IRQ_0$)**: Assigned Priority Byte $= \mathbf{\text{0x20}}$ (`0010_0000_2`).
2. **High-Speed SPI Sensor ($IRQ_1$)**: Assigned Priority Byte $= \mathbf{\text{0x30}}$ (`0011_0000_2`).
3. **UART Telemetry Port ($IRQ_2$)**: Assigned Priority Byte $= \mathbf{\text{0x40}}$ (`0100_0000_2`).
4. **System Tick Timer ($IRQ_3$)**: Assigned Priority Byte $= \mathbf{\text{0x80}}$ (`1000_0000_2`).

#### System Execution Events:
Software programs `SCB->AIRCR.PRIGROUP = 5` (`3'b101`).

At physical time $t = 0.0\text{ ns}$, the CPU is executing its main application loop.
* At $t = 10.0\text{ ns}$, **UART ($IRQ_2$, `0x40`)** fires.
* At $t = 20.0\text{ ns}$ (while UART $ISR$ is active), **SPI ($IRQ_1$, `0x30`)** fires.
* At $t = 25.0\text{ ns}$ (while SPI $ISR$ is active), **Motor ($IRQ_0$, `0x20`)** fires.
* At $t = 26.0\text{ ns}$, **SysTick ($IRQ_3$, `0x80`)** fires.

#### Your Objective

1. For `PRIGROUP = 5` and $B_{\text{impl}} = 4$ implemented bits, calculate the exact number of Preemption Bits ($P_{\text{bits}}$), Sub-Priority Bits ($S_{\text{bits}}$), total Preemption Groups, and Sub-Priorities per group.
2. Calculate the **Preemption Group Number** and **Sub-Priority Value** for each of the 4 peripherals ($IRQ_0, IRQ_1, IRQ_2, IRQ_3$).
3. Trace the step-by-step nested execution sequence and stack pointer changes ($SP$) across time:
   * Show which $IRQs$ execute **Nested Preemption** and which execute **Tail-Chaining**.
   * Calculate the maximum nested stack memory overhead (in bytes and stack frames) consumed during the peak preemption depth.
4. Write the production ARM Assembly code to program `SCB->AIRCR.PRIGROUP = 5` using the `0x05FA` VECTKEY unlocking barrier.
5. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate PRIGROUP Bitfield Division ($PRIGROUP = 5, B_{\text{impl}} = 4$)

We apply the Priority Grouping formulas for `PRIGROUP = 5` (`3'b101`):

##### 1. Calculate Preemption Bits ($P_{\text{bits}}$):

$$P_{\text{bits}} = \max\left(0, \ \text{7} - \text{PRIGROUP}\right) = 7 - 5 = \mathbf{2 \text{ Bits}} \quad (\text{Bits } [7:6] \text{ of IPR})$$

$$\text{Preemption Groups} = 2^{P_{\text{bits}}} = 2^2 = \mathbf{4 \text{ Preemption Groups }} (0, 1, 2, 3)$$

##### 2. Calculate Sub-Priority Bits ($S_{\text{bits}}$):

$$S_{\text{bits}} = B_{\text{impl}} - P_{\text{bits}} = 4 - 2 = \mathbf{2 \text{ Bits}} \quad (\text{Bits } [5:4] \text{ of IPR})$$

$$\text{Sub-Priorities per Group} = 2^{S_{\text{bits}}} = 2^2 = \mathbf{4 \text{ Sub-Priorities }} (0, 1, 2, 3)$$

```text
PRIGROUP = 5 BIT SPLIT IN 8-BIT PRIORITY REGISTER

 Bit 7   Bit 6 │ Bit 5   Bit 4 │ Bit 3   Bit 2   Bit 1   Bit 0
───────────────┼───────────────┼───────────────────────────────
 Preemption    │ Sub-Priority  │ Hardwired to 0 in Silicon
 Field (2 Bits)│ Field (2 Bits)│ (Un-implemented Lower Bits)
```

---

#### Step 2: Calculate Preemption Group & Sub-Priority for Each Peripheral

We decompose each peripheral's 8-bit priority byte into Preemption Bits $[7:6]$ and Sub-Priority Bits $[5:4]$:

##### 1. Motor Inverter ($IRQ_0$, Priority Byte $= \text{0x20} = \mathbf{0010\_0000_2}$):
* Preemption Bits $[7:6] = 00_2 = \mathbf{0}$
* Sub-Priority Bits $[5:4] = 10_2 = \mathbf{2}$
* **Classification**: **Preemption Group 0, Sub-Priority 2**

##### 2. SPI Sensor ($IRQ_1$, Priority Byte $= \text{0x30} = \mathbf{0011\_0000_2}$):
* Preemption Bits $[7:6] = 00_2 = \mathbf{0}$
* Sub-Priority Bits $[5:4] = 11_2 = \mathbf{3}$
* **Classification**: **Preemption Group 0, Sub-Priority 3**

##### 3. UART Telemetry ($IRQ_2$, Priority Byte $= \text{0x40} = \mathbf{0100\_0000_2}$):
* Preemption Bits $[7:6] = 01_2 = \mathbf{1}$
* Sub-Priority Bits $[5:4] = 00_2 = \mathbf{0}$
* **Classification**: **Preemption Group 1, Sub-Priority 0**

##### 4. SysTick Timer ($IRQ_3$, Priority Byte $= \text{0x80} = \mathbf{1000\_0000_2}$):
* Preemption Bits $[7:6] = 10_2 = \mathbf{2}$
* Sub-Priority Bits $[5:4] = 00_2 = \mathbf{0}$
* **Classification**: **Preemption Group 2, Sub-Priority 0**

```text
PERIPHERAL PRIORITY CLASSIFICATION TABLE (PRIGROUP = 5)

 Peripheral Target │ Priority Byte │ Preemption Group [7:6] │ Sub-Priority [5:4] │ Preemption Rank
───────────────────┼───────────────┼────────────────────────┼────────────────────┼─────────────────
 Motor IRQ 0       │     0x20      │ Group 0                │ Sub-Priority 2     │ Highest Rank
 SPI Sensor IRQ 1  │     0x30      │ Group 0                │ Sub-Priority 3     │ Second Highest
 UART Port IRQ 2   │     0x40      │ Group 1                │ Sub-Priority 0     │ Third Highest
 SysTick IRQ 3     │     0x80      │ Group 2                │ Sub-Priority 0     │ Lowest Rank
```

---

#### Step 3: Trace Nested Execution Sequence and Stack Depth

Let us trace the physical execution across time as the 4 interrupts fire:

##### Event 1 ($t = 10.0\text{ ns}$ — UART $IRQ_2$, Group 1, Sub 0):
* CPU is in Main Loop (Group $\infty$).
* UART ($IRQ_2$, Group 1) fires.
* Preemption Check: Group $1 < \text{Main Loop} \implies \mathbf{PREEMPT!}$
* **Action**: Hardware pushes **Stack Frame 1 ($32\text{ bytes}$)**. CPU enters UART $ISR_2$.
* Stack Pointer: $SP_1 = SP_0 - 32$.

##### Event 2 ($t = 20.0\text{ ns}$ — SPI $IRQ_1$, Group 0, Sub 3):
* UART $ISR_2$ (Group 1) is actively executing.
* SPI ($IRQ_1$, Group 0) fires.
* Preemption Check: Compare Group 0 (SPI) vs Group 1 (UART).
  $$\text{Group 0 } < \text{ Group 1} \implies \mathbf{\text{PREEMPTION APPROVED!}}$$
* **Action**: Hardware pauses UART $ISR_2$, pushes **Stack Frame 2 ($32\text{ bytes}$)**, and enters SPI $ISR_1$!
* Stack Pointer: $SP_2 = SP_1 - 32 = SP_0 - 64$.

##### Event 3 ($t = 25.0\text{ ns}$ — Motor $IRQ_0$, Group 0, Sub 2):
* SPI $ISR_1$ (Group 0, Sub 3) is actively executing.
* Motor ($IRQ_0$, Group 0, Sub 2) fires.
* Preemption Check: Compare Group 0 (Motor) vs Group 0 (SPI).
  $$\text{Group 0 (Motor) } == \text{ Group 0 (SPI)} \implies \mathbf{\text{EQUAL PREEMPTION GROUP! PREEMPTION DENIED!}}$$
* **Action**: **NO PREEMPTION!** Motor $IRQ_0$ is set to Pending state. SPI $ISR_1$ continues executing without interruption!

##### Event 4 ($t = 26.0\text{ ns}$ — SysTick $IRQ_3$, Group 2, Sub 0):
* SPI $ISR_1$ (Group 0) is actively executing.
* SysTick ($IRQ_3$, Group 2) fires.
* Preemption Check: Compare Group 2 (SysTick) vs Group 0 (SPI).
  $$\text{Group 2 } > \text{ Group 0} \implies \mathbf{\text{PREEMPTION DENIED!}}$$
* **Action**: SysTick $IRQ_3$ is set to Pending state.

##### Event 5 ($t = 30.0\text{ ns}$ — SPI $ISR_1$ Finishes):
* SPI $ISR_1$ finishes executing (`bx lr`).
* Pending Queue Evaluation: Motor $IRQ_0$ (Group 0, Sub 2) vs SysTick $IRQ_3$ (Group 2, Sub 0).
* Sub-Priority Tie-Breaker: Group 0 beats Group 2!
* **Action**: Hardware executes **TAIL-CHAINING ($6\text{ cycles}$)** directly to Motor $ISR_0$ **WITHOUT UNSTACKING**!
* Stack Pointer remains at $SP_2 = SP_0 - 64$.

##### Event 6 ($t = 40.0\text{ ns}$ — Motor $ISR_0$ Finishes):
* Motor $ISR_0$ finishes executing.
* Hardware unstacks Stack Frame 2 ($SP \Leftarrow SP + 32$). CPU resumes UART $ISR_2$!

##### Event 7 ($t = 50.0\text{ ns}$ — UART $ISR_2$ Finishes):
* UART $ISR_2$ finishes executing.
* Hardware evaluates pending SysTick $IRQ_3$ (Group 2).
* Hardware executes **TAIL-CHAINING** directly to SysTick $ISR_3$!
* SysTick $ISR_3$ finishes, unstacks Stack Frame 1 ($SP \Leftarrow SP_0$), and returns to Main Loop!

```text
EXECUTION AND STACK DEPTH CHRONOLOGY

 Time (ns) │ Active Execution Target        │ Peak Preemption Depth │ Active SP Position
───────────┼────────────────────────────────┼───────────────────────┼────────────────────
    0.0    │ Main Application Loop          │ Level 0 (Base)        │ SP0
   10.0    │ UART ISR 2 (Group 1)           │ Level 1 Preemption    │ SP0 - 32 Bytes
   20.0    │ SPI ISR 1 (Group 0, Sub 3)     │ Level 2 Preemption    │ SP0 - 64 Bytes
   25.0    │ Motor IRQ 0 (Pending in Group0)│ Level 2 (No Preempt!) │ SP0 - 64 Bytes (PEAK!)
   30.0    │ Motor ISR 0 (Tail-Chained!)    │ Level 2 (Tail-Chain)  │ SP0 - 64 Bytes
   40.0    │ UART ISR 2 (Resumed)           │ Level 1               │ SP0 - 32 Bytes
   50.0    │ SysTick ISR 3 (Tail-Chained!)  │ Level 1               │ SP0 - 32 Bytes
   60.0    │ Main Application Loop (Resumed)│ Level 0               │ SP0 (Restored!)
```

##### Maximum Stack Overhead Analysis:
* Peak Preemption Depth = **2 Nested Preemption Levels** (UART $ISR_2$ preempted by SPI $ISR_1$).
* Peak Hardware Stack Overhead $= 2 \times 32 \text{ Bytes} = \mathbf{64 \text{ Bytes}}$.

---

#### Step 4: Write Assembly Routine for `AIRCR.PRIGROUP` Unlocking

Here is the production ARM Assembly code to program `SCB->AIRCR.PRIGROUP = 5` using the `0x05FA` VECTKEY unlocking key:

```assembly
/* PRODUCTION ARM ASSEMBLY ROUTINE TO CONFIGURE PRIGROUP = 5 */
.syntax unified
.cpu cortex-m4
.thumb

.equ SCB_AIRCR,       0xE000ED0C        /* Application Interrupt & Reset Control Reg */
.equ VECTKEY_MAGIC,   0x05FA            /* 16-Bit Unlock Key Required by Silicon */

.global System_SetPriorityGrouping
.type SystemClock_Config, %function

.section .text
.thumb_func
System_SetPriorityGrouping:
    push    {r4, r5, lr}

    /* Step 1: Read current SCB->AIRCR register value */
    ldr     r0, =SCB_AIRCR
    ldr     r1, [r0]

    /* Step 2: Clear PRIGROUP bits [10:8] and upper VECTKEY bits [31:16] */
    ldr     r2, =0x00000700             /* Bitmask for PRIGROUP bits [10:8] */
    bic     r1, r1, r2                  /* Clear PRIGROUP bits */
    ldr     r2, =0xFFFF0000             /* Bitmask for upper VECTKEY bits */
    bic     r1, r1, r2                  /* Clear VECTKEY bits */

    /* Step 3: Combine VECTKEY (0x05FA << 16) and PRIGROUP (5 << 8) */
    ldr     r3, =(VECTKEY_MAGIC << 16)  /* 0x05FA0000 */
    orr     r1, r1, r3                  /* Insert Unlock Key */
    orr     r1, r1, #(5 << 8)           /* Insert PRIGROUP = 5 (3'b101) */

    /* Step 4: Write combined value back to SCB->AIRCR */
    str     r1, [r0]

    /* Step 5: Execute Data Synchronization Barrier to enforce write */
    dsb
    isb

    pop     {r4, r5, pc}
.size System_SetPriorityGrouping, .-System_SetPriorityGrouping
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and state machine results against hardware specifications:

1. **Preemption Bit Split Verification**:
   * `PRIGROUP = 5` $\implies P_{\text{bits}} = 7 - 5 = 2\text{ bits}$ ($[7:6]$).
   * Group 0: Priority bytes `0x00..0x3F` ($00_2$).
   * Group 1: Priority bytes `0x40..0x7F` ($01_2$).
   * Group 2: Priority bytes `0x80..0xBF` ($10_2$).
   * Motor (`0x20`) and SPI (`0x30`) both belong to Group 0 ($00_2$). Preemption check between them correctly evaluated as EQUAL, blocking preemption and preventing unnecessary stack depth!

2. **Tail-Chaining vs Preemption Timing Verification**:
   * Motor $IRQ_0$ was held pending while SPI $ISR_1$ executed.
   * When SPI $ISR_1$ finished at $t = 30.0\text{ ns}$, hardware executed **Tail-Chaining in $6\text{ cycles}$** rather than unstacking 32 bytes and restacking 32 bytes ($24\text{ cycles}$), saving $18\text{ clock cycles}$ ($5.625\text{ ns}$) of bus traffic!

3. **VECTKEY Unlocking Verification**:
   * Value written to `AIRCR`: `(0x05FA << 16) | (5 << 8) = 0x05FA_0500`.
   * Upper 16 bits contain `0x05FA`, satisfying the silicon lock barrier and guaranteeing successful register update!

All bitfield calculations, preemption group splits, nested stack memory depth bounds, tail-chaining decision matrices, and assembly VECTKEY unlocking routines evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Interrupt Preemption Priority**: The upper $N$ bits of an 8-bit priority register (`IPR_k`) that dictate whether an incoming $IRQ$ has a sufficiently lower numerical priority value than the currently active $ISR$ to pause it mid-execution and stack a new nested exception frame.
* **Priority Grouping (`PRIGROUP`)**: The 3-bit binary control field (`SCB->AIRCR.PRIGROUP`) that dynamically positions the boundary dividing an 8-bit priority register into upper Preemption Priority bits ($P_{\text{bits}} = 7 - \text{PRIGROUP}$) and lower Sub-Priority tie-breaking bits ($S_{\text{bits}} = B_{\text{impl}} - P_{\text{bits}}$).
* **Tail-Chaining vs. Preemption Decision Matrix**: The hardware arbitration logic that executes **Nested Preemption** ($12\text{-cycle}$ entry latency) when an incoming $IRQ$ belongs to a strictly higher preemption group, or **Tail-Chaining** ($6\text{-cycle}$ transition latency) when equal or lower preemption group $IRQs$ arrive, skipping redundant stack popping and pushing.