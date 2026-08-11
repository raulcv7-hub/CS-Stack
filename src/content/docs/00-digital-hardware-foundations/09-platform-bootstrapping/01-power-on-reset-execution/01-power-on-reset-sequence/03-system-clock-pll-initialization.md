---
title: "03-system-clock-pll-initialization — System Clock Tree Initialization and Main PLL Multiplier Configuration"
---

# 03-system-clock-pll-initialization — System Clock Tree Initialization and Main PLL Multiplier Configuration

## 1. The Low-Frequency Default Oscillator Bottleneck

When an integrated System-on-Chip (SoC) or central processing unit (CPU) completes its hardware Power-On Reset sequence and begins executing its first instructions from non-volatile Boot ROM, the physical processor is operating at a tiny fraction of its maximum potential performance. 

Although the processor's silicon transistors may be rated to run at execution speeds of $3.2\text{ GHz}$ or $5.0\text{ GHz}$, the internal clock distribution network driving the processor core is running on a slow, un-multiplied reference clock directly from a motherboard crystal oscillator—typically operating at a modest frequency of $24\text{ MHz}$ or $25\text{ MHz}$.

```text
THE DEFAULT OSCILLATOR BOOTSTRAPPING BOTTLENECK

 CPU Execution Core (Rated for 3.2 GHz)
 ┌─────────────────────────────────────────────────────────────┐
 │ Running at Default Crystal Clock = 24 MHz (1/133rd Speed!)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ Low-Frequency Clock Beats
 ┌─────────────────────────────────────────────────────────────┐
 │ High-Speed Subsystems Waiting for High-Frequency Clocks:    │
 │  * DDR5 Memory Controllers (Requires 1.6 GHz - 3.2 GHz)     │
 │  * PCIe Gen5/Gen6 PHYs     (Requires 16.0 GHz - 32.0 GHz)  │
 │  * On-Chip Crossbars      (Requires 1.6 GHz - 2.4 GHz)    │
 └─────────────────────────────────────────────────────────────┘
  (High-speed memory training and bus scanning CANNOT PROCEED!)
```

Why does a processor power up on a slow $24\text{-MHz}$ reference clock instead of starting immediately at its full $3.2\text{-GHz}$ operating speed?

The answer lies in the analog physical reality of high-frequency clock generation circuits: **Phase-Locked Loops (PLLs) cannot operate without stable supply voltages, configured feedback registers, and physical lock settling times.**

A Phase-Locked Loop (PLL) is an analog/digital feedback circuit that multiplies a low-frequency reference clock up to multi-gigahertz frequencies. 

However, when power is first applied to a microchip:
* The PLL's internal Voltage-Controlled Oscillator (VCO) lacks stable control voltages.
* The digital feedback dividers that define the multiplication ratio contain uninitialized or reset values.
* The analog charge pumps and loop filters have not achieved phase alignment with the external crystal oscillator.

If the processor attempted to drive its execution pipelines and memory controllers using an un-initialized, unlocked PLL, the resulting clock signal would suffer from severe frequency jitter, missing clock edges, and erratic pulse widths. 

These clock glitches would violate setup and hold timing constraints across the silicon die, corrupting pipeline register states and causing immediate hardware crashes.

To ensure safe power-on execution, hardware designers hardwire the CPU's internal clock multiplexers to bypass the high-speed PLLs during reset, routing the raw, un-multiplied $24\text{-MHz}$ crystal clock directly to the CPU instruction fetch unit.

However, remaining at this default $24\text{-MHz}$ reference clock creates a severe performance bottleneck for subsequent platform bootstrapping phases:

* **Instruction Execution Crawls**: At $24\text{ MHz}$, a single clock cycle lasts $41.67\text{ nanoseconds}$. Executing a basic 1,000-instruction firmware loop takes $41.67\text{ microseconds}$ instead of $0.31\text{ microseconds}$ at $3.2\text{ GHz}$—a $133\times$ speed degradation.
* **DRAM Training Cannot Proceed**: High-speed memory controllers (DDR4/DDR5) require precise multi-gigahertz clock frequencies to calibrate physical layer (PHY) delay lines and execute Write Leveling or Read DQS Centering. DRAM training algorithms cannot run on a $24\text{-MHz}$ reference clock.
* **High-Speed Serial Buses are Disabled**: PCIe Gen5/Gen6 transceivers require multi-gigahertz clock sources to drive serial data lanes. Bus scanning and peripheral discovery cannot occur until interconnect clocks are stable.

A platform cannot train memory or discover buses while running on its default reset oscillator. 

Before any memory calibration or interconnect scanning can begin, early platform firmware must initialize the **System Clock Tree** and program the **Main PLL Multipliers** to step up the processor and system fabric from $24\text{ MHz}$ to multi-gigahertz operational frequencies.


### Phase 1: The Direct Neutral Gear (Bypass Mode at Reset)

When the cyclist first sits on the bicycle from a complete stop, the bicycle is locked in a 1-to-1 neutral gear (**PLL Bypass Mode**).
* For every 1 revolution of the cyclist's pedals, the rear wheel spins exactly 1 time ($1\text{ Rev/sec}$).
* The bicycle moves forward, but at an agonizingly slow crawl of 1 mile per hour.
* The cyclist is safe and stable, but cannot travel at racing speed.


### Phase 3: The Gear Shifting Rule and Chain Locking Delay (PLL Lock Time)

Now, how does the rider shift from the 1-to-1 neutral gear into the 133x overdrive gear?

The rider **cannot** simply slam the chain into the 133x overdrive gear instantly while pedaling at full force! 

If the rider shifts abruptly without adjusting chain tension and waiting for the gear teeth to align:
* The chain slips, binds, and snaps (**Clock Jitter / Timing Violation**).
* The rider loses control and crashes the bicycle (**CPU Hardware Lockup**).

To shift gears safely, the rider executes a strict 4-step sequence:

```text
SAFE GEAR SHIFTING SEQUENCE

 1. Keep Drive Wheel on Neutral Gear  ──► Bicycle continues crawling at 1 MPH.
 2. Set Gear Selection Levers        ──► Program Multiplier M and Dividers N, P.
 3. Engage Chain & Wait for Lock     ──► Wait 2 seconds for flywheel speed to stabilize!
 4. Flip Main Drive Switch           ──► Switch rear wheel from Neutral to Overdrive!
```

1. **Keep Drive Wheel on Neutral**: The rear wheel remains powered by the slow, direct neutral gear while the gearbox is being adjusted.
2. **Program Gear Levers**: The rider sets the mechanical levers for Pre-Divider $N$, Multiplier $M$, and Post-Divider $P$.
3. **Wait for Flywheel Lock**: The rider engages the flywheel clutch. The flywheel accelerates from rest up to $133\text{ Revs/sec}$. The rider waits 2 full seconds (**PLL Lock Time $t_{\text{lock}}$**) until the flywheel speed matches the target gear ratio perfectly without slipping.
4. **Flip the Drive Switch**: Once a green indicator light signals that the flywheel is locked (**`PLL_LOCK` Signal = 1**), the rider flips the main drive selector switch (**Glitchless Clock Multiplexer**). 
   * The rear wheel disengages from the slow neutral gear and engages with the 133x overdrive gear in **one smooth, seamless movement**!
   * The bicycle instantly accelerates to 200 miles per hour!

This bicycle transmission system is the exact physical analogue of **System Clock Tree Initialization and PLL Multiplier Configuration**:
* Cyclist's leg cadence is the **External Reference Crystal Oscillator ($f_{\text{ref}} = 24\text{ MHz}$)**.
* Rear wheel speed is the **Target System Clock Frequency ($f_{\text{out}} = 3.2\text{ GHz}$)**.
* The 1-to-1 neutral gear is **PLL Bypass Mode**.
* The overdrive gearbox is the **Phase-Locked Loop (PLL)**.
* Gear levers are **PLL Division and Multiplication Registers ($N, M, P$)**.
* Waiting 2 seconds for flywheel stabilization is **PLL Lock Time ($t_{\text{lock}}$)**.
* The green indicator light is the **Hardware `PLL_LOCK` Status Bit**.
* The main drive selector switch is the **Glitchless Clock Multiplexer (CLK MUX)**.


### The Primary Clock Domains in an Integrated SoC

A typical high-performance processor clock tree distributes clock signals to four primary functional domains:

1. **Core CPU Clock Domain ($f_{\text{cpu}}$)**: Drives the CPU pipeline execution stages, arithmetic logic units (ALUs), register files, and Level 1 / Level 2 caches. Requires maximum operating frequency ($2.4\text{ GHz} \text{ to } 5.0\text{ GHz}$).
2. **System Interconnect / Fabric Domain ($f_{\text{bus}}$)**: Drives on-chip crossbar matrices, AXI4 bus channels, Level 3 Last-Level Caches (LLC), and IOMMU translation units. Typically operates at a fraction of CPU frequency ($1.6\text{ GHz} \text{ to } 2.4\text{ GHz}$).
3. **Memory Controller / PHY Domain ($f_{\text{mem}}$)**: Drives command pipelines and physical layer (PHY) delay-locked loops for DDR4/DDR5 DRAM interfaces. Must match memory protocol specifications ($1.6\text{ GHz} \text{ to } 3.2\text{ GHz}$).
4. **Fixed Peripheral I/O Domain ($f_{\text{periph}}$)**: Drives low-speed system peripherals such as UART serial ports, SPI Flash controllers, $I^2C$ buses, and hardware timers. Requires stable, lower fixed frequencies ($24\text{ MHz}, 50\text{ MHz}, \text{or } 100\text{ MHz}$).


### Step-by-Step Hardware PLL Configuration Sequence

To step up a processor from its low-frequency reset clock to a multi-gigahertz operational frequency without triggering timing violations or clock glitches, early platform firmware executes the **5-Step Hardware PLL Configuration Sequence**:

```text
5-STEP PLL CONFIGURATION SEQUENCE

 Step 1: Enable Bypass Mode     ──► Set CLK_MUX_SEL = 0 (Force CPU to 24 MHz Crystal)
 Step 2: Program Dividers (N,M,P)──► Write registers: N_DIV, M_MULT, P_DIV
 Step 3: Power Up PLL Engine    ──► Clear PLL_POWER_DOWN = 0 (Start VCO oscillation)
 Step 4: Wait for Hardware Lock ──► Poll PLL_LOCK status bit until 1 (t_lock delay)
 Step 5: Switch Clock MUX       ──► Set CLK_MUX_SEL = 1 (Glitchless switch to 3.2 GHz!)
```

#### Step 1: Enable Bypass Mode (`CLK_MUX_SEL = 0`)
Before modifying any PLL dividers, firmware writes to the System Clock Control Register to ensure that the CPU execution core and system fabric are running on the safe $24\text{-MHz}$ reference clock in **Bypass Mode**. 

This isolates the CPU pipeline from any intermediate clock oscillations occurring while the PLL is being reconfigured.

#### Step 2: Program Divider Registers ($N, M, P$)
Firmware writes the calculated integer values for Pre-Divider $N$, Feedback Multiplier $M$, and Post-Divider $P$ into the PLL Command Register:

$$\text{PLL\_CTRL\_REG} \Leftarrow [\quad N \quad | \quad M \quad | \quad P \quad]$$

#### Step 3: Power Up the PLL Engine (`PLL_PD = 0`)
Firmware de-asserts the PLL Power-Down flag (`PLL_PD = 0`). 

Analog current begins flowing through the Charge Pump, and the Voltage-Controlled Oscillator (VCO) begins accelerating toward its target frequency $f_{\text{vco}}$.

#### Step 4: Poll for Hardware Lock (`PLL_LOCK == 1`)
Firmware enters a hardware polling loop, reading the **`PLL_LOCK` Status Bit** inside the PLL Status Register.

The `PLL_LOCK` bit is driven High ($1$) by an internal hardware phase detector ONLY when $f_{\text{pfd}}$ and $f_{\text{feedback}}$ are locked in phase alignment within a strict tolerance window ($\pm 0.5\%$).

The time required for the PLL to achieve phase lock is the **PLL Lock Time ($t_{\text{lock}}$)**, typically lasting between $10.0\ \mu\text{s} \text{ and } 100.0\ \mu\text{s}$ ($32,000 \text{ to } 320,000\text{ CPU clock cycles}$ at $3.2\text{ GHz}$).

$$\text{Firmware Polling Loop: } \quad \mathbf{\text{while } (\text{PLL\_STATUS\_REG.PLL\_LOCK} == 0) \quad \{ \text{ wait }; \}}$$

#### Step 5: Switch Clock Multiplexer (`CLK_MUX_SEL = 1`)
Once `PLL_LOCK == 1` is confirmed, firmware writes to the Clock Source Selection Multiplexer register:

$$\text{CLK\_MUX\_REG} \Leftarrow 1 \quad (\text{Select High-Speed PLL Output})$$

The CPU execution pipeline instantly transitions from the $24\text{-MHz}$ crystal clock to the $3.2\text{-GHz}$ high-speed PLL output, stepping up processor performance by $133\times$!


### 1. The Flash ROM Read Wait-State Hazard (NVM Latency Crash)

The most common catastrophic failure during early clock initialization is **The Flash ROM Wait-State Timing Hazard**.

Non-volatile Flash memory chips (such as motherboard SPI NOR Flash) contain storage cells whose analog sensing amplifiers require a fixed physical time duration to read a single byte—typically **$t_{\text{access}} \approx 30.0\text{ nanoseconds}$**.

```text
FLASH ROM WAIT-STATE TIMING HAZARD

 Operating at 24 MHz (T_clk = 41.67 ns):
 Clock Pulse : 0───────1───────0───────1───────0
 Flash Access: ◄── 30 ns ──► (Completes BEFORE clock cycle ends! 0 Wait States needed!)

 Operating at 3.2 GHz (T_clk = 0.3125 ns):
 Clock Pulse : 010101010101010101010101...
 Flash Access: ◄────────────── 30 ns (Requires 96 Clock Cycles!) ──────────────►
 (CPU attempts to sample Flash on Cycle 1 -> Reads GARBAGE -> CRASH!)
```

Trace the physical timing hazard during a clock speedup:

1. When the CPU operates on the default $24\text{-MHz}$ reference clock, a single CPU clock period lasts $T_{\text{clk}} = 41.67\text{ ns}$.
2. Because $T_{\text{clk}} (41.67\text{ ns}) > t_{\text{access}} (30.0\text{ ns})$, the Flash memory chip returns valid instruction bytes **within a single clock cycle**. The CPU requires **Zero Read Wait States** ($\text{FLASH\_LATENCY} = 0$).
3. Firmware executes the PLL setup algorithm and switches the CPU clock frequency to $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$).
4. On the very next instruction fetch, the CPU requests an instruction from Flash ROM.
5. The Flash chip requires $30.0\text{ ns}$ to respond. But at $3.2\text{ GHz}$, the CPU attempts to sample the data bus after just **$0.3125\text{ nanoseconds}$**!
6. **The Crash**: The Flash chip has not finished sensing the memory cell! The CPU samples invalid floating electrical noise, decodes garbage as an opcode, and crashes instantly!

#### The Inviolable Firmware Execution Rule:
To prevent non-volatile memory read crashes during clock initialization:

> **The Flash Latency Ordering Rule**: Firmware MUST increase Flash ROM wait-state counters BEFORE increasing CPU clock frequency, and MUST decrease Flash ROM wait-state counters AFTER decreasing CPU clock frequency.

$$\mathbf{\text{Correct Order: } \quad \text{Set Flash Wait States } (96\text{ Cycles}) \implies \text{Switch PLL Clock } (3.2\text{ GHz})}$$

$$\text{Required Wait States } (N_{\text{wait\_states}}) = \left\lceil \frac{t_{\text{access}}}{T_{\text{clk\_new}}} \right\rceil - 1 = \left\lceil \frac{30.0\text{ ns}}{0.3125\text{ ns}} \right\rceil - 1 = 96 - 1 = \mathbf{95 \text{ Wait States}}$$

By programming $\text{FLASH\_LATENCY} = 95$ before switching the clock MUX, the CPU instruction fetch unit automatically pauses for 95 wait-state cycles during every Flash read, guaranteeing clean instruction capture at $3.2\text{ GHz}$!


### 3. Dynamic Voltage and Frequency Scaling (DVFS) Sequencing

In high-performance processors, transistor switching speed depends directly on supply voltage $V_{DD}$. 

Running transistors at $3.2\text{ GHz}$ requires a higher operating voltage (e.g., $V_{DD} = 1.20\text{ V}$) than running at default $24\text{ MHz}$ ($V_{DD} = 0.90\text{ V}$).

If firmware attempts to boost the PLL clock frequency to $3.2\text{ GHz}$ while $V_{DD}$ remains at the low power-on default ($0.90\text{ V}$):

$$\text{Transistor Delay at } 0.90\text{ V } (0.450\text{ ns}) > \text{Clock Period at } 3.2\text{ GHz } (0.3125\text{ ns})$$

Transistor propagation delay exceeds the clock period! Every arithmetic operation in the ALU will fail its setup time check.

#### The DVFS Sequencing Rule:
When scaling performance up or down, firmware must obey the **Voltage-Frequency Ordering Invariant**:

$$\mathbf{\text{Frequency Step-Up: } \quad \text{Increase Voltage } (V_{DD} \to 1.2\text{ V}) \implies \text{Increase Clock Frequency } (f \to 3.2\text{ GHz})}$$

$$\mathbf{\text{Frequency Step-Down: } \quad \text{Decrease Clock Frequency } (f \to 24\text{ MHz}) \implies \text{Decrease Voltage } (V_{DD} \to 0.9\text{ V})}$$


### Scenario & Parameters

You are a principal platform hardware architect configuring the early clock initialization sequence for a $64\text{-bit}$ SoC processor.

The processor powers up on an external quartz reference crystal oscillator operating at:

$$f_{\text{ref}} = 24.0\text{ MHz} = 24.0 \times 10^6\text{ Hz} \quad (T_{\text{ref}} = 41.667\text{ ns})$$

```text
SYSTEM CLOCK INITIALIZATION PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_ref                     │ 24.0 MHz              │ External crystal reference clock frequency
 f_cpu_target              │ 3.2 GHz (3,200 MHz)   │ Target core CPU clock frequency
 f_bus_target              │ 1.6 GHz (1,600 MHz)   │ Target system interconnect bus clock frequency
 f_vco_min                 │ 2.4 GHz (2,400 MHz)   │ Minimum legal VCO operating frequency limit
 f_vco_max                 │ 4.8 GHz (4,800 MHz)   │ Maximum legal VCO operating frequency limit
 t_flash_access            │ 30.0 Nanoseconds      │ Non-volatile Flash ROM access latency
 N_lock_cycles             │ 1,000 Ref Clock Cycles│ PLL Phase-Frequency Detector lock count
```

#### Hardware Register Constraints:
* Pre-Divider $N \in [1, 16]$ (Integer value).
* Feedback Multiplier $M \in [1, 512]$ (Integer value).
* Post-Dividers $P_{\text{cpu}}, P_{\text{bus}} \in \{1, 2, 4, 8\}$.
* The intermediate VCO frequency $f_{\text{vco}}$ **MUST** remain strictly within its legal physical silicon range:

$$2.4\text{ GHz} \le f_{\text{vco}} \le 4.8\text{ GHz}$$


#### Step 2: Calculate Flash ROM Wait States Before and After Frequency Transition

Flash access latency $t_{\text{flash\_access}} = 30.0\text{ ns}$.

The Flash Wait State Register value $W$ is calculated as:

$$W = \left\lceil \frac{t_{\text{flash\_access}}}{T_{\text{clk}}} \right\rceil - 1$$

##### 1. Before Clock Transition ($f_{\text{ref}} = 24\text{ MHz} \implies T_{\text{clk}} = 41.667\text{ ns}$):

$$W_{\text{before}} = \left\lceil \frac{30.0\text{ ns}}{41.667\text{ ns}} \right\rceil - 1 = \lceil 0.72 \rceil - 1 = 1 - 1 = \mathbf{0 \text{ Wait States}}$$

At $24\text{ MHz}$, Flash reads require **0 Wait States** ($\text{FLASH\_LATENCY} = 0$).

##### 2. After Clock Transition to $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$W_{\text{after}} = \left\lceil \frac{30.0\text{ ns}}{0.3125\text{ ns}} \right\rceil - 1 = \lceil 96.0 \rceil - 1 = 96 - 1 = \mathbf{95 \text{ Wait States}}$$

At $3.2\text{ GHz}$, Flash reads require **95 Wait States** ($\text{FLASH\_LATENCY} = 95$).

##### Firmware Execution Order:
Firmware **MUST** write `FLASH_LATENCY = 95` *before* toggling `CLK_MUX_SEL = 1`!


#### Step 4: Calculate Execution Speedup for a 1,000-Instruction Boot Loop

Let us calculate the physical time $T_{\text{loop}}$ required to execute a $1,000\text{-instruction}$ firmware loop running directly from Flash ROM under both clock configurations.

Assume each instruction fetch requires 1 memory read ($1 + W$ cycles) plus 1 cycle execution.

##### 1. Execution Time at $24\text{ MHz}$ ($W = 0 \implies 1\text{ cycle fetch} + 1\text{ cycle exec} = 2\text{ cycles/instruction}$):

$$\text{Cycles}_{\text{slow}} = 1,000 \text{ inst} \times 2 \text{ cycles/inst} = 2,000 \text{ CPU Cycles}$$

$$T_{\text{loop\_slow}} = 2,000 \times 41.667\text{ ns} = \mathbf{83,334.0 \text{ nanoseconds}} \quad (83.334\ \mu\text{s})$$

##### 2. Execution Time at $3.2\text{ GHz}$ ($W = 95 \implies 96\text{ cycles fetch} + 1\text{ cycle exec} = 97\text{ cycles/instruction}$):

$$\text{Cycles}_{\text{fast}} = 1,000 \text{ inst} \times 97 \text{ cycles/inst} = 97,000 \text{ CPU Cycles}$$

$$T_{\text{loop\_fast}} = 97,000 \times 0.3125\text{ ns} = \mathbf{30,312.5 \text{ nanoseconds}} \quad (30.3125\ \mu\text{s})$$

##### 3. Calculate Execution Speedup Factor:

$$\text{Speedup Factor} = \frac{T_{\text{loop\_slow}}}{T_{\text{loop\_fast}}} = \frac{83,334.0\text{ ns}}{30,312.5\text{ ns}} \approx \mathbf{2.749\times \text{ Performance Speedup!}}$$

```text
CLOCK INITIALIZATION PERFORMANCE COMPARISON SUMMARY

 Parameter Metric             │ Un-Configured Reset Clock │ Configured High-Speed PLL
──────────────────────────────┼───────────────────────────┼───────────────────────────
 Core CPU Frequency (f_cpu)   │ 24.0 MHz                  │ 3,200.0 MHz (3.2 GHz)
 System Bus Frequency (f_bus) │ 24.0 MHz                  │ 1,600.0 MHz (1.6 GHz)
 Flash Read Wait States (W)   │ 0 Wait States             │ 95 Wait States
 1,000-Instruction Loop Time  │ 83.334 Microseconds       │ 30.313 Microseconds
 Execution Speedup Factor     │ 1.000x (Baseline)         │ 2.749x FASTER!
```

##### Engineering Conclusion:
Even when executing code directly from slow Flash ROM with 95 wait states, stepping up the system clock tree to $3.2\text{ GHz}$ accelerated firmware execution by **$2.749\times$**, while unlocking the multi-gigahertz clock domains required to train DDR5 DRAM and enumerate PCIe buses!


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **System Clock Tree**: The hierarchical distribution network of Phase-Locked Loops, frequency dividers, and glitchless multiplexers that transforms a low-frequency reference crystal into synchronized, multi-gigahertz clock domains ($f_{\text{cpu}}, f_{\text{bus}}, f_{\text{mem}}$) across an SoC.
* **Main PLL Multiplier Configuration**: The hardware algorithm and register programming sequence (pre-divider $N$, feedback multiplier $M$, post-divider $P$, and lock delay $t_{\text{lock}}$) used to step up un-multiplied reference clocks to multi-gigahertz operational frequencies while enforcing Flash wait-state ordering invariants.