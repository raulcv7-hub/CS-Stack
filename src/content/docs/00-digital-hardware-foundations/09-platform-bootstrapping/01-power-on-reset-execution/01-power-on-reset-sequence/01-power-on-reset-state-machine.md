---
title: "01-power-on-reset-state-machine — Power-On Reset State Machine and Reset Vector Fetch"
---

# 01-power-on-reset-state-machine — Power-On Reset State Machine and Reset Vector Fetch

## 1. The Indeterminate Silicon Chaos at Power-On

When a modern central processing unit (CPU) is powered on, the billions of microscopic transistors fabricated onto its silicon die do not instantly spring to life in a clean, organized state. At the exact millisecond a power switch is flipped or a power supply unit is plugged in, the electrical voltage supplied to the microchip does not instantly jump from zero volts to its full operating voltage. Instead, the supply voltage ramps up gradually over a physical time window spanning microseconds or milliseconds.

During this analog voltage ramping phase, the physical behavior of the digital logic circuits inside the processor is completely chaotic and unpredictable. 

```text
VOLTAGE RAMPING AND INDETERMINATE SILICON LOGIC STATES

 Voltage (V_DD)
  1.2V ┼──────────────────────────────────── Stable Operating Voltage
       │                                   /
  0.8V ┼───────────────── Threshold Voltage ── (Transistors switching
       │                  /                   indeterminately!)
  0.0V ┴─────────────────┤
       ◄── Ramp Time ────►
```

Digital logic circuits rely on stable supply voltages to distinguish between a logical '0' (ground voltage) and a logical '1' (supply voltage). When the supply voltage is sitting at an intermediate, unstable level—such as $0.4\text{ V}$ on a $1.2\text{ V}$ rated processor—the internal transistors operate in an indeterminate analog state. 

Inside the processor, there are millions of internal memory storage cells called flip-flops. These flip-flops make up the processor's registers, instruction execution pipelines, cache controllers, and state machines. As the supply voltage rises, these flip-flops power up into completely random binary states:

* The **Program Counter (PC)** register, which holds the memory address of the next instruction to execute, might randomly initialize to an arbitrary value such as `0xA5A5_1234`.
* The **Control Unit** state registers might initialize into an illegal, unmapped binary state that simultaneously asserts conflicting internal control signals.
* The **Interrupt Enable** flags might initialize to active, causing the processor to attempt servicing interrupts before an interrupt handling routine even exists in memory.
* The **Bus Interface Unit** might begin driving random binary garbage onto external address and data buses, attempting to write random values into uninitialized system RAM or peripheral hardware.

If the processor's internal clock signal begins toggling while the chip is in this uninitialized, chaotic state, the results are catastrophic. The CPU pipeline will attempt to fetch instructions from whatever random memory address happened to land in the Program Counter. It will decode random binary noise as valid instructions, triggering illegal instruction faults, bus collisions, memory corruption, or permanent hardware lockups before the system has even begun to boot.

A processor cannot simply "start running" the moment power is applied. 

Before a single instruction can be fetched from memory, the hardware must enforce an absolute, non-negotiable physical baseline: **The processor must be held in a state of total hardware paralysis until supply voltages and clock signals have completely stabilized, and every internal register must be forcibly reset to a known, deterministic starting value.**

To solve this physical initiation crisis, digital systems incorporate two foundational microarchitectural primitives: **The Power-On Reset (POR) State Machine** and **The Reset Vector Fetch**.


## 3. The Power-On Reset State Machine and Reset Vector Fetch

Now that we possess a clear mental model of the dam's locking pin, let us examine the formal engineering mechanics of the **Power-On Reset (POR)** state machine and the subsequent **Reset Vector Fetch**.

The hardware reset process is a multi-phase coordination between analog voltage monitoring circuits, clock generation trees, internal register clear networks, and memory bus controllers.

```text
HARDWARE POWER-ON RESET AND FETCH TIMELINE

 Power (V_DD) : 0.0V ─────/───────► 1.2V (Stable Operating Voltage)
 PWRGD        : 000000000000000000011111111111111111111111111111111
 RESET_N      : 000000000000000000000000000111111111111111111111111
                                           ▲
                                           │ Reset Released! PC Fetches Reset Vector!
```


### Phase 2: Forced Synchronous Register Clearing

While the active-low reset signal $\text{RESET\_N}$ is held at logical '0', the processor's internal reset distribution tree forces every critical flip-flop and state register on the silicon die into a hardwired, deterministic initial state.

```text
REGISTER CLEARING UNDER ACTIVE RESET (RESET_N = 0)

 Program Counter (PC)         ──► Forced to Reset Vector Address
 Control Unit FSM             ──► Forced to STATE_RESET
 Privilege Mode Register      ──► Forced to Highest Supervisor/Machine Mode
 Interrupt Enable Flag (IE)   ──► Forced to 0 (Interrupts Disabled)
 Memory Management Unit (MMU) ──► Forced to 0 (Paging Disabled / Flat Addressing)
 Cache Controllers            ──► Forced to Invalid / Disabled State
```

Let us examine the exact binary values forced into key CPU registers during this phase:

#### 1. The Program Counter (PC)
The Program Counter is forcibly loaded with the pre-determined physical memory address of the **Reset Vector**, denoted as $A_{\text{reset}}$. The exact address depends on the processor architecture:

* **x86 / x86-64 Architecture**: The Program Counter (specifically the Code Segment register `CS` and Instruction Pointer `IP`) is initialized so that the first instruction is fetched from physical address `0xFFFF_FFF0` (16 bytes below the 4-Gigabyte boundary).
* **ARM64 (AArch64) Architecture**: The Program Counter is initialized to the address defined by the physical hardware pins or the architectural **Reset Vector Base Address Register (RVBAR)**, typically `0x0000_0000_0000_0000` or a memory-mapped Flash ROM address.
* **RISC-V Architecture**: The Program Counter is initialized to a platform-defined reset vector address, commonly `0x0000_1000` or `0x8000_0000`, corresponding to the location of the hardware Boot ROM.

#### 2. CPU Operating Mode and Privilege Level
To allow the initial boot code to configure low-level hardware registers, the processor is initialized into its **highest possible hardware privilege level** with all software isolation barriers removed:
* x86 processors power up in 16-bit **Real Mode** (emulating an legacy 8086 processor) with flat physical memory access and no virtual memory paging.
* ARM processors power up in **Exception Level 3 (EL3)**, the highest privilege level, giving the boot code full access to security configuration registers.
* RISC-V processors power up in **Machine Mode (M-Mode)**, the highest execution privilege mode.

#### 3. Interrupts and Memory Management
* All hardware interrupt enable flags are forcibly set to $0$. The CPU will ignore all external hardware interrupt signals during early boot.
* The Memory Management Unit (MMU) and virtual memory paging engines are disabled. Addresses driven by the Program Counter represent **raw physical DRAM/ROM addresses**.
* All Level 1, Level 2, and Level 3 caches are invalidated to prevent stale data hits.


### Phase 4: The Hardware Reset Vector Fetch

On the exact clock cycle following the transition of $\text{RESET\_N}$ from $0 \to 1$, the processor's state machines transition from the static reset state to the active instruction execution state.

The processor executes the **Reset Vector Fetch**, the very first memory transaction of the entire computing session.

```text
RESET VECTOR FETCH HARDWARE DATAPATH

 Program Counter (Forced to A_reset)
 ┌───────────────────────────┐
 │ Address: 0xFFFF_FFF0      ├────── Address Bus ──────┐
 └───────────────────────────┘                         │
                                                       ▼
 ┌───────────────────────────┐               ┌───────────────────┐
 │ Instruction Fetch Unit    │◄── Data Bus ──┤ Boot ROM / Flash  │
 │ Stores Opcode in Queue    │  Opcode Bytes │ Address Decoder   │
 └───────────────────────────┘               └───────────────────┘
```

Let us trace the step-by-step physical hardware execution of the Reset Vector Fetch:

1. **Address Presentation**: The Program Counter (PC) contains the hardwired Reset Vector address $A_{\text{reset}}$. The Instruction Fetch (IF) unit places $A_{\text{reset}}$ onto the processor's internal memory address bus.
2. **System Interconnect Routing**: The on-chip interconnect crossbar or bus matrix receives physical address $A_{\text{reset}}$. An internal address decoder inspects the top bits of the address and routes the memory read request to the **Boot ROM / SPI Flash Controller**.
3. **Flash ROM Read**: The Boot ROM controller translates $A_{\text{reset}}$ into a physical read command sent to the non-volatile Flash memory chip mounted on the motherboard or embedded within the SoC die.
4. **Opcode Return**: The Flash memory chip retrieves the binary opcode bytes stored at address $A_{\text{reset}}$ and drives them back across the data bus to the processor.
5. **Pipeline Ingestion**: The CPU's Instruction Fetch unit captures the incoming opcode bytes, places them into the instruction prefetch queue, and passes them to the Instruction Decoder.
6. **Execution Commencement**: The Instruction Decoder decodes the opcode—which is almost universally a far jump or unconditional branch instruction (such as `JMP 0xFFFF_0000` or `BAL boot_entry`)—and the CPU execution pipeline begins running software code!


### Voltage Dips, Brownouts, and Hysteresis

What happens if a computer is running normally, and a sudden high-current load (such as a hard drive motor spinning up or a graphics card starting a render) causes the supply voltage $V_{DD}$ to momentarily drop below its operational threshold?

This event is called a **Voltage Brownout** or **Voltage Dip**.

```text
VOLTAGE BROWNOUT AND COMPARATOR OSCILLATION (WITHOUT HYSTERESIS)

 Voltage (V_DD)
  1.2V ┼──────────┐               ┌────────── Stable Operating Voltage
       │           \  Brownout   /
  1.08V┼────────────\── Dip ────/──────────── V_thresh
       │             \         /
       │              └───────┘  ◄── Transistors fail; logic corrupted!
```

If $V_{DD}$ drops to $0.95\text{ V}$ for $50\text{ nanoseconds}$, the transistors inside the CPU pipeline slow down. Signal propagation delays lengthen, violating setup and hold timing margins. Flip-flops capture wrong data, and execution state is corrupted.

If the Voltage Supervisor circuit evaluates $V_{DD}$ using a single, fixed reference voltage, noise on the voltage rail will cause the `PWRGD` signal to rapidly toggle between $0$ and $1$ as $V_{DD}$ hovers near the threshold. This rapid toggling, called **Comparator Chattering**, causes the CPU to enter and exit reset repeatedly, destroying hardware components.

To prevent comparator chattering during brownouts, hardware reset circuits implement **Schmitt Trigger Comparators with Hysteresis**:

```text
SCHMITT TRIGGER HYSTERESIS THRESHOLDS

 Voltage (V_DD)
  1.12V ┼──────────────────────────────────── V_thresh_high (Reset Released)
        │
  1.00V ┼──────────────────────────────────── V_thresh_low  (Reset Asserted)
```

A hysteresis circuit uses two distinct voltage thresholds:

* **Upper Threshold ($V_{\text{thresh\_high}}$)**: $V_{DD}$ must rise *above* $V_{\text{thresh\_high}}$ (e.g., $1.12\text{ V}$) before the circuit de-asserts reset ($\text{RESET\_N} \to 1$).
* **Lower Threshold ($V_{\text{thresh\_low}}$)**: Once running, $V_{DD}$ must drop *below* $V_{\text{thresh\_low}}$ (e.g., $1.00\text{ V}$) before the circuit re-asserts reset ($\text{RESET\_N} \to 0$).

The voltage difference $\Delta V_{\text{hyst}} = V_{\text{thresh\_high}} - V_{\text{thresh\_low}}$ forms a **Noise Immunity Band**. Minor voltage fluctuations within this band are ignored, eliminating reset chattering during power supply brownouts!


## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Power-On Reset state machines, voltage supervisor timing, clock stabilization delays, and Reset Vector fetch execution, let us walk through a complete, step-by-step quantitative engineering calculation.


### Step-by-Step Derivation

#### Step 1: Calculate Voltage Ramp Time to Power-Good ($t_{\text{ramp}}$)

The power supply rail $V_{DD}$ ramps linearly from $0.0\text{ V}$ at a constant rate $R_{\text{ramp}} = 0.008\text{ V}/\mu\text{s}$.

The Voltage Supervisor asserts $\text{PWRGD} = 1$ when $V_{DD}$ reaches threshold $V_{\text{thresh\_high}} = 1.08\text{ V}$.

Using the linear voltage equation:

$$V_{DD}(t) = R_{\text{ramp}} \cdot t$$

Setting $V_{DD}(t_{\text{ramp}}) = V_{\text{thresh\_high}}$:

$$1.08\text{ V} = \left( 0.008\frac{\text{V}}{\mu\text{s}} \right) \cdot t_{\text{ramp}}$$

Solving for $t_{\text{ramp}}$:

$$t_{\text{ramp}} = \frac{1.08\text{ V}}{0.008\text{ V}/\mu\text{s}} = \mathbf{135.0 \text{ microseconds}} \quad (135,000\text{ nanoseconds})$$

The Power-Good signal rises ($\text{PWRGD} \to 1$) at **$135.0\text{ microseconds}$** after initial power application.


#### Step 3: Calculate Exact Physical Time of Reset De-assertion ($t_{\text{release}}$)

The master active-low reset line `RESET_N` transitions from $0 \to 1$, releasing the processor from hard reset, at time $t_{\text{release}}$:

$$t_{\text{release}} = t_{\text{ramp}} + t_{\text{stabilization}}$$

$$t_{\text{release}} = 135,000.0\text{ ns} + 640.0\text{ ns} = \mathbf{135,640.0 \text{ nanoseconds}} = \mathbf{135.640 \text{ microseconds}}$$

At $t = 135.640\ \mu\text{s}$, `RESET_N` is officially released. The CPU Program Counter (PC) holds $A_{\text{reset}} = \text{0xFFFF\_FFF0}$.


#### Step 5: Calculate Total Time to First Instruction Opcode Capture ($t_{\text{first\_instruction}}$)

The total physical time elapsed from the initial $0.0\text{-V}$ power application until the first opcode byte is captured inside the CPU instruction queue is:

$$t_{\text{first\_instruction}} = t_{\text{release}} + t_{\text{fetch}}$$

$$t_{\text{first\_instruction}} = 135,640.0\text{ ns} + 45.3125\text{ ns} = \mathbf{135,685.3125 \text{ nanoseconds}} = \mathbf{135.6853125 \text{ microseconds}}$$

```text
TIMELINE SUMMARY FROM POWER-ON TO FIRST OPCODE CAPTURE

 Time (ns)   │ Event Description
─────────────┼─────────────────────────────────────────────────────────────
     0.0000  │ Power Applied (V_DD = 0.0V). RESET_N forced to 0.
 135,000.0000│ V_DD reaches 1.08V (90%). PWRGD rises to 1. Reset delay starts.
 135,640.0000│ 2048 clock cycles elapse. RESET_N released (0 -> 1).
 135,640.3125│ CPU PC presents Reset Vector Address 0xFFFF_FFF0 to bus.
 135,685.3125│ Boot Flash ROM returns first opcode byte to CPU Instruction Queue!
```


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Power-On Reset (POR)**: An active-low hardware reset signal and state machine controlled by an analog voltage supervisor circuit that holds all CPU registers, flip-flops, and pipeline controllers in a forced, deterministic state while supply voltages ramp up and clock oscillators achieve frequency lock.
* **Reset Vector Fetch**: The initial, hardware-driven memory read transaction dispatched by the CPU Program Counter immediately upon reset release, fetching the first executable instruction opcode from a hardwired physical Boot ROM address (`0xFFFF_FFF0`, `0x0000_0000`, or `0x0000_1000`).