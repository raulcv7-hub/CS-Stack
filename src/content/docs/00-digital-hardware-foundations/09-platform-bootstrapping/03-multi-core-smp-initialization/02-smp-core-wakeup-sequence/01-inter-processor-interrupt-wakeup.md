---
title: "01-inter-processor-interrupt-wakeup — Inter-Processor Interrupt (IPI) Core Wakeup Mechanics and Power-State Coordination"
---

# 01-inter-processor-interrupt-wakeup — Inter-Processor Interrupt (IPI) Core Wakeup Mechanics and Power-State Coordination

## 1. The Asynchronous Core Activation Crisis

In high-performance multi-core processor architectures, early platform bootstrapping begins in a strictly single-core execution environment. Following a power-on reset, hardware arbitration logic elects a single central processing unit (CPU) core as the Bootstrap Processor (BSP). 

The BSP executes early boot firmware, configures system clock trees, calibrates multi-gigahertz DDR5 memory controllers, and builds system description tables (such as ACPI or DeviceTree) in main DRAM memory.

During this entire early boot phase, all secondary CPU cores—classified as Application Processors (APs)—are held parked in low-power hardware sleep states (such as `Wait-for-SIPI` in x86, `WFE` in ARM, or `WFI` in RISC-V). 

Their internal instruction execution pipelines are clock-gated, and their local registers are held in static reset.

Once main system memory (DRAM) is online and the operating system kernel is ready to launch, the platform must transition from single-core boot mode to full multi-threaded, multi-core parallel processing. To execute this transition, the Bootstrap Processor (BSP) must wake up the secondary Application Processors (APs) and bring them into active software execution.

However, bringing a parked, sleeping CPU execution core into active execution is a dangerous hardware operation. If the wakeup process is executed without a structured, protocol-driven hardware sequence, a catastrophic system failure occurs: **The Asynchronous Core Activation Crisis.**

```text
THE ASYNCHRONOUS CORE ACTIVATION CRISIS

 Bootstrap Processor (BSP / Core 0)           Parked Application Processor (AP / Core 1)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ DRAM & OS Kernel Ready    │                │ Execution Pipeline Asleep │
 └─────────────┬─────────────┘                │ Registers Uninitialized   │
               │                              └─────────────▲─────────────┘
               │                                            │
               ▼ Un-Structured Hardware Signal              │
 ┌──────────────────────────────────────────────────────────┴─────────────┐
 │ THREE CATASTROPHIC HARDWARE ACTIVATION FAILURES:                       │
 │  1. Wild Instruction Fetch Jump  (AP jumps to 0x0000 -> Hard Fault!)   │
 │  2. Power Rail Supply Brownout   (63 cores wake at once -> V_DD Sag!)  │
 │  3. Interconnect Register Race   (Un-synchronized APs corrupt RAM!)    │
 └────────────────────────────────────────────────────────────────────────┘
```

Trace the physical and logical disasters that occur if an Application Processor is woken up without a protocol-driven handshake:

1. **The Wild Instruction Fetch Jump**: If a parked AP core's execution clock is turned on while its internal Program Counter (PC) or segment registers contain uninitialized power-on garbage, the AP core will attempt to fetch its very first instruction from a random memory address (such as `0x0000_0000_0000_0000`). 
   
   The AP core decodes garbage opcodes, executes illegal instructions, and triggers an immediate CPU hard fault exception.
2. **Power Rail Voltage Brownout ($V_{DD}$ Sag)**: On a 64-core processor socket, if the BSP attempts to wake up all 63 secondary AP cores simultaneously on the exact same clock cycle:
   * The 63 sleeping cores suddenly turn on their internal clock trees and execution units.
   * The sudden, massive surge in physical current ($\frac{dI}{dt}$ spike) drawn from the motherboard power planes causes the local supply voltage ($V_{DD}$) to drop rapidly below operational thresholds (**Voltage Brownout**).
   * The voltage sag corrupts active register states across all cores, crashing the entire processor socket!
3. **Interconnect State Corruption**: If an AP core wakes up and begins reading or writing to main memory before its local Advanced Programmable Interrupt Controller (APIC) or cache coherency logic has been configured, the AP core will flood the interconnect crossbar with un-coherent bus transactions, corrupting shared operating system memory structures.

A processor cannot simply "turn on" secondary cores with an un-controlled electrical pulse!

To bring secondary cores into active execution safely, the Bootstrap Processor must execute a protocol-driven hardware handshake using **Inter-Processor Interrupts (IPIs)**—specifically the x86 **Startup Inter-Processor Interrupt (INIT-SIPI) Sequence** or the ARM64 **Power State Coordination Interface (`PSCI_CPU_ON`)**.


### Strategy 1: Smashing the Main Power Breaker (Un-Structured Hardware Wakeup)

The chief firefighter runs over to the main building power panel and slams the master circuit breaker ON to turn on all lights in all 15 bedrooms at once:

1. All 15 sleeping firefighters are jolted awake in total confusion.
2. The sudden electrical demand trips the neighborhood power grid (**Power Supply $V_{DD}$ Voltage Brownout**), plunging the entire fire station into total darkness!
3. Firefighter 5 stumbles out of bed in the dark, trips over a chair, and breaks their leg (**Wild Instruction Fetch Jump $\to$ Hard Fault Crash**)!

This is the **Un-Structured Hardware Activation Failure**.


## 3. Formal Mechanics of INIT-SIPI and PSCI CPU_ON Wakeup

Now that we possess an intuitive mental model of two-alarm intercoms and location dispatch calls, let us examine the formal, rigorous engineering mechanics of **Inter-Processor Interrupt (IPI) Core Wakeup Protocols** across x86-64 and ARM64 architectures.


### The Canonical 4-Step INIT-SIPI Handshake Protocol

To wake up target AP Core $K$ safely, the BSP's early boot software executes **The Canonical 4-Step INIT-SIPI Handshake Protocol**:

```text
CANONICAL 4-STEP INIT-SIPI WAKEUP PROTOCOL

 BSP (Core 0) Execution Timeline                     Target AP Core K
 ┌───────────────────────────────────────────┐
 │ 1. Write ICR: Target = Core K, Mode = INIT│
 └─────────────────────┬─────────────────────┘
                       │
                       ├────── INIT IPI ────────────► Resets Internal Registers;
                       │                              Enters Wait-for-SIPI State!
 ┌─────────────────────┴─────────────────────┐
 │ 2. Execute 10-Millisecond Delay Loop      │
 └─────────────────────┬─────────────────────┘
                       │
                       ▼
 ┌───────────────────────────────────────────┐
 │ 3. Write ICR: Target = Core K, Mode = SIPI│
 │    Vector = 0x30                          │
 └─────────────────────┬─────────────────────┘
                       │
                       ├────── SIPI (0x30) ─────────► Computes Addr 0x30 << 12
                       │                              = 0x0003_0000!
 ┌─────────────────────┴─────────────────────┐        Un-gates execution clock!
 │ 4. Execute 200-Microsecond Delay Loop     │        Jumps to 0x0003_0000!
 └───────────────────────────────────────────┘
```

#### Step 1: Asserting the `INIT IPI`
The BSP writes to its Local APIC `ICR` targeting AP Core $K$:
* Destination ID $= \text{Target\_APIC\_ID}_K$
* Delivery Mode $= 3'b101_2$ (`INIT`)
* Level $= 1$ (Assert)
* Vector $= \text{0x00}$

**Hardware Effect at AP Core $K$**: The target core's Local APIC intercepts the `INIT IPI`. The core's execution pipeline is clock-gated, its general-purpose registers are cleared to reset defaults, its operating mode is forced to **16-Bit Real Mode** (`CS = 0xF000`, `IP = 0xFFF0`), and the core enters the **`Wait-for-SIPI` state**.

#### Step 2: The 10-Millisecond Settlement Delay
The BSP executes a software or hardware delay loop waiting for **$10.0\text{ milliseconds}$** ($t_{\text{init\_delay}}$). 

This delay allows the target AP core's internal analog power planes, logic circuits, and register clear networks to settle completely into a stable state.

#### Step 3: Asserting the Startup IPI (`SIPI`)
The BSP writes to its Local APIC `ICR` targeting AP Core $K$ a second time:
* Destination ID $= \text{Target\_APIC\_ID}_K$
* Delivery Mode $= 3'b110_2$ (`SIPI`)
* Level $= 1$ (Assert)
* Vector $= V_{\text{sipi}}$ (e.g., $V_{\text{sipi}} = \text{0x30}$)

#### Step 4: The 200-Microsecond Delay and Target Address Calculation
The BSP waits for **$200.0\text{ microseconds}$** ($t_{\text{sipi\_delay}}$).

Meanwhile, AP Core $K$ receives the `SIPI` message, extracts the 8-bit vector $V_{\text{sipi}} = \text{0x30}$, and evaluates **The SIPI Target Address Calculation Invariant**:

$$\mathbf{\text{AP\_Start\_Address} = V_{\text{sipi}} \times 4,096\text{ Bytes} = V_{\text{sipi}} \ll 12}$$

Where:
* $\text{AP\_Start\_Address}$ is the 32-bit physical RAM starting address where AP Core $K$ will begin fetching instructions.
* $V_{\text{sipi}}$ is the 8-bit vector number transmitted in bits $[7:0]$ of the SIPI ICR message ($0 \dots 255$).

For $V_{\text{sipi}} = \text{0x30} = 48_{10}$:

$$\text{AP\_Start\_Address} = \text{0x30} \ll 12 = 48 \times 4,096 = 196,608_{10} \text{ Bytes} = \mathbf{\text{0x0003\_0000}}$$

AP Core $K$ sets its Program Counter to physical address `0x0003_0000`, un-gates its execution clock, and begins running secondary core startup code!


#### The `PSCI_CPU_ON` Call Parameters

When the BSP or OS kernel wants to wake up secondary AP Core $K$ on an ARM64 platform, it loads four 64-bit registers (`X0` through `X3`) and executes `SMC #0`:

```assembly
// ARM64 ASSEMBLY: EXECUTING PSCI_CPU_ON SMC CALL
// Registers: X0 = Function ID, X1 = Target Core MPIDR, X2 = Entry Point, X3 = Context ID

mov     x0, #0x0003
movk    x0, #0xC400, lsl #16    // X0 = 0xC4000003 (SMC64 Function ID for PSCI_CPU_ON)

mov     x1, #0x0001             // X1 = Target Core Affinity MPIDR (Socket 0, Cluster 0, Core 1)
ldr     x2, =ap_kernel_entry    // X2 = 64-bit Physical Entry Address (e.g. 0x8000_0000)
mov     x3, #0x4242             // X3 = Opaque Context ID passed to AP in X0 upon wakeup

smc     #0                      // EXECUTE SECURE MONITOR CALL! TRAPS TO EL3 FIRMWARE!
```

Let us analyze the parameter registers:

1. **`X0` (Function ID = `0xC400_0003`)**: Specifies the 64-bit SMC function ID for `PSCI_CPU_ON`.
2. **`X1` (Target CPU Affinity MPIDR)**: Stores the 64-bit **Multiprocessor Affinity Register (`MPIDR_EL1`)** value identifying the physical core to be powered up (e.g., `Aff3.Aff2.Aff1.Aff0 = 0.0.0.1` for Core 1).
3. **`X2` (Entry Point Address)**: The 64-bit physical memory address where AP Core $K$ will begin execution in EL1/EL2 mode.
4. **`X3` (Context ID)**: An opaque 64-bit value chosen by the kernel. When AP Core $K$ wakes up, the EL3 firmware automatically loads this value into register `X0` before jumping to the entry point, allowing the AP core to know its assignment!

#### Hardware Execution inside EL3 Firmware:
When `SMC #0` traps to EL3:
1. The TF-A firmware reads `X1` and locates the physical **Power Domain Controller (PDC)** registers for Target Core 1.
2. TF-A commands the PMIC to apply operating voltage $V_{DD}$ to Core 1's power rail.
3. TF-A releases Core 1's hardware reset line.
4. Core 1 powers up, initializes its EL3 architectural state, sets `X0 = Context_ID`, drops its privilege level to **EL1/EL2**, and jumps directly to `Entry_Point_Address` (`0x8000_0000`)!


### 1. The Inrush Current $V_{DD}$ Brownout Hazard (Batch Wakeup Surge)

When a server contains 64 or 128 physical CPU cores, an operating system kernel might attempt to wake up all 63 secondary AP cores simultaneously to handle a massive web traffic burst.

If the BSP dispatches 63 `PSCI_CPU_ON` or SIPI commands in rapid succession on consecutive clock cycles:
* 63 sleeping CPU cores turn on their internal high-frequency clock trees and execution pipelines simultaneously.
* The sudden, near-instantaneous demand for electrical current creates a massive **Current Surge ($\frac{dI}{dt}$ spike)** across the motherboard power planes.

$$\Delta V_{\text{droop}} = L_{\text{vrm}} \cdot \frac{dI}{dt}$$

Where:
* $\Delta V_{\text{droop}}$ is the temporary voltage drop (sag) on the CPU supply rail in Volts.
* $L_{\text{vrm}}$ is the parasitic inductance of the Power Management IC (PMIC) and motherboard power planes in Henries.
* $\frac{dI}{dt}$ is the rate of current increase over time in Amperes per second.

```text
INRUSH CURRENT VOLTAGE DROOP (V_DD SAG)

 Voltage V_DD
  1.20V ┼─────────┐                     ┌───────── Stable Operating Voltage
        │          \   Voltage Sag     /
  1.00V ┼───────────\── (Droop) ──────/────────── Minimum Safe Threshold
        │            \               /
  0.80V ┴─────────────┴─────────────┴──────────── (BROWS OUT ALL CORES -> CRASH!)
        ◄────────── 63 Cores Wake at Once ──────►
```

If 63 cores turn on at once, $\frac{dI}{dt}$ reaches thousands of Amperes per microsecond! 

The supply voltage drops below $1.00\text{ V}$ (**Voltage Brownout**), triggering a hard processor socket crash!

#### The Hardware / Firmware Solution: Staggered Batch Wakeup
To prevent voltage droops, the operating system kernel or EL3 firmware enforces **Staggered Batch Wakeup**:

```text
STAGGERED BATCH WAKEUP SEQUENCE

 Batch 1: Wake Cores 1..4   ──► Wait 100 microseconds (Power Planes Stabilize!)
 Batch 2: Wake Cores 5..8   ──► Wait 100 microseconds (Power Planes Stabilize!)
 Batch 3: Wake Cores 9..12  ──► Wait 100 microseconds (Power Planes Stabilize!)
 (Current surge dI/dt is capped at 4 cores! Zero Voltage Brownouts!)
```

The kernel wakes secondary cores in small batches (e.g., 4 cores per batch) and inserts a **$100\text{-microsecond}$ delay** between batches. This gives the motherboard voltage regulator module (VRM) time to adjust its current output, maintaining $V_{DD} = 1.20\text{ V}$ with zero voltage sags!


## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Inter-Processor Interrupt (IPI) mechanics, Local APIC ICR register bitfields, SIPI target address calculations, `PSCI_CPU_ON` calls, and staggered batch wakeup timings, let us walk through a complete, step-by-step quantitative engineering calculation.


### The Hardware Execution Tasks:

1. Calculate the exact physical starting memory address $A_{\text{ap\_start}}$ in hexadecimal where AP cores begin instruction fetch upon receiving $V_{\text{sipi}} = \text{0x30}$.
2. Calculate the physical time $t_{\text{wakeup\_single\_ap}}$ (in milliseconds and CPU clock cycles) required to wake up a single AP core under Model A.
3. Calculate the total cumulative physical time $T_{\text{wakeup\_ModelA}}$ (in milliseconds) required for the BSP to wake up all 15 AP cores sequentially under Model A.
4. Calculate the total cumulative physical time $T_{\text{wakeup\_ModelB}}$ (in milliseconds) required to wake up all 15 AP cores using the Staggered Batch Wakeup model (Model B).
5. Calculate the physical time saved (in milliseconds) and the **Wakeup Speedup Factor** of Model B over Model A.
6. Verify mathematical, structural, and timing correctness.


#### Step 2: Calculate Single AP Wakeup Latency under Model A ($t_{\text{wakeup\_single\_ap}}$)

Under Model A, waking a single AP core requires:
1. Writing INIT IPI to ICR ($16\text{ cycles} = 5.0\text{ ns}$).
2. INIT Delay $t_{\text{init\_delay}} = 10.0\text{ ms} = 10,000,000.0\text{ ns}$.
3. Writing SIPI to ICR ($16\text{ cycles} = 5.0\text{ ns}$).
4. SIPI Delay $t_{\text{sipi\_delay}} = 200.0\ \mu\text{s} = 200,000.0\text{ ns}$.
5. AP Startup execution ($1,200\text{ cycles} = 375.0\text{ ns}$).

$$t_{\text{wakeup\_single\_ap}} = 5.0\text{ ns} + 10,000,000.0\text{ ns} + 5.0\text{ ns} + 200,000.0\text{ ns} + 375.0\text{ ns}$$

$$t_{\text{wakeup\_single\_ap}} = 10,200,385.0\text{ Nanoseconds} = \mathbf{10.200385 \text{ Milliseconds}}$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{wakeup\_single\_ap}} = \frac{10,200,385.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{32,641,232 \text{ CPU Clock Cycles}}$$

Waking up a single AP core sequentially takes **$10.200385\text{ milliseconds}$ ($32.64\text{ million CPU cycles}$)**!


#### Step 4: Calculate Total Staggered Batch Wakeup Time under Model B ($T_{\text{wakeup\_ModelB}}$)

Under Model B:
1. **INIT IPI Broadcast**: BSP sends INIT IPI to all 15 APs simultaneously, then waits $10.0\text{ ms}$ once:
   $$t_{\text{init\_batch}} = 5.0\text{ ns} + 10,000,000.0\text{ ns} = 10,000,005.0\text{ ns} = \mathbf{10.000005 \text{ ms}}$$
2. **Batch 1 (Cores 1..5)**: Sends SIPI to 5 cores + Waits $200.0\ \mu\text{s}$:
   $$t_{\text{batch1}} = (5 \times 5.0\text{ ns}) + 200,000.0\text{ ns} + 375.0\text{ ns} = \mathbf{200,400.0 \text{ ns}} = \mathbf{0.200400 \text{ ms}}$$
3. **Batch 2 (Cores 6..10)**: Sends SIPI to 5 cores + Waits $200.0\ \mu\text{s}$:
   $$t_{\text{batch2}} = \mathbf{0.200400 \text{ ms}}$$
4. **Batch 3 (Cores 11..15)**: Sends SIPI to 5 cores + Waits $200.0\ \mu\text{s}$:
   $$t_{\text{batch3}} = \mathbf{0.200400 \text{ ms}}$$

##### Calculate Total Model B Time ($T_{\text{wakeup\_ModelB}}$):

$$T_{\text{wakeup\_ModelB}} = t_{\text{init\_batch}} + t_{\text{batch1}} + t_{\text{batch2}} + t_{\text{batch3}}$$

$$T_{\text{wakeup\_ModelB}} = 10.000005\text{ ms} + 0.200400\text{ ms} + 0.200400\text{ ms} + 0.200400\text{ ms}$$

$$\mathbf{T_{\text{wakeup\_ModelB}} = 10.601205 \text{ Milliseconds}} \quad (10.601\text{ ms})$$

Total CPU Clock Cycles Consumed under Model B:

$$C_{\text{ModelB}} = \frac{10,601,205.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{33,923,856 \text{ CPU Clock Cycles}}$$


### Sanity Check and Verification

Let us verify our mathematical and physical results against APIC hardware specifications:

1. **SIPI Address Bit Shift Check**:
   * Vector $= \text{0x30} = 48_{10}$.
   * Shifted by 12 bits ($\times 4,096$) $= 48 \times 4,096 = 196,608 = \text{0x0003\_0000}$.
   * $A_{\text{ap\_start}} = \text{0x0003\_0000}$ lies safely inside the first 1 MB of physical memory, verifying $100\%$ x86 Real Mode boot compatibility.
2. **INIT Delay Elimination Math Check**:
   * Model A paid $15 \times 10.0\text{ ms} = 150.0\text{ ms}$ in INIT delays alone.
   * Model B paid $1 \times 10.0\text{ ms} = 10.0\text{ ms}$ in INIT delay.
   * Time saved $= 150.0\text{ ms} - 10.0\text{ ms} = 140.0\text{ ms}$ (plus $2.4\text{ ms}$ in batch SIPI delays saved).
   * Total saved $= 142.405\text{ ms}$. Math verified with $100\%$ precision!
3. **Hardware ICR Bitfield Alignment**:
   * Delivery Mode `3'b101` $= 5_{10}$ (`INIT IPI`).
   * Delivery Mode `3'b110` $= 6_{10}$ (`SIPI`).
   * Target APIC ID $= \text{Bits } [63:32]$. ICR bitfield maps match JEDEC/x86 Local APIC specifications.

All SIPI address shift calculations, Local APIC ICR bitfield maps, ARM64 `PSCI_CPU_ON` SMC parameters, staggered batch timing models, and $14.433\times$ multi-core wakeup speedups evaluate with 100% mathematical, physical, and logical precision.

